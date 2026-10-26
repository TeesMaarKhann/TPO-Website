(function () {
  'use strict';

  var STORE_KEY = 'is-wedding-guest-v1';
  // What the guest typed, kept on their own device so they never have to type
  // it again, even after the guest list is rebuilt.
  var LOGIN_KEY = 'is-wedding-login-v1';
  var TRAVEL_KEY = 'is-wedding-travel-v1';
  // Web app URL of the visit log (tools/visit-log.gs). Leave empty to turn
  // logging off.
  var LOG_URL = 'https://script.google.com/macros/s/AKfycbyejSqjUJzisBrEoAyAu_4P2Sl7JIJx3ae3hQ8gSzr9o8UEJWbfDDIpOHJfpz9KFRSo/exec';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var guest = null;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- Guest lookup (must match tools/build_guests.py) ---------- */

  // Words that are never someone's own name: relations, titles, nicknames.
  var NOT_NAMES = ['wife', 'husband', 'mother', 'father', 'son', 'daughter', 'dad',
    'mom', 'family', 'mr', 'mrs', 'ms', 'dr', 'kaka', 'kaku', 'ajji', 'aji', 'aaji',
    'mama', 'mami', 'mavshi', 'maushi', 'atya', 'bhai', 'toddler'];

  function nameWords(name) {
    name = name.toLowerCase().replace(/\(.*?\)/g, ' ').trim().replace(/^\w+_\s*/, '');
    return name.match(/[a-z]+/g) || [];
  }
  function realWords(w) {
    return w.filter(function (x, i) {
      return x.length > 1 && NOT_NAMES.indexOf(x) < 0 && w.indexOf(x) === i;
    });
  }
  function fullKey(name) {
    return nameWords(name).sort().join(' ');
  }
  function normPhone(phone) {
    var d = String(phone || '').split(/[\/,;]/)[0].replace(/\D/g, '');
    return d.length >= 8 ? d.slice(-10) : '';
  }

  // Slow on purpose (PBKDF2, GUESTS.iter rounds) so the list can't be guessed.
  function derive(text, bytes) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(text), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(GUESTS.salt), iterations: GUESTS.iter }, k, bytes * 8);
      })
      .then(function (bits) { return new Uint8Array(bits); });
  }
  function hex(bytes) {
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  // For guests with no number of their own: whose number to use ('' = none yet).
  // Stored encrypted with their name, so only someone who types it can read it.
  function findHint(full) {
    if (!GUESTS.h) return Promise.resolve(null);
    return derive('?' + full, 44).then(function (b) {
      var c = GUESTS.h[hex(b.subarray(0, 12))];
      if (!c) return null;
      var out = new Uint8Array(32);
      for (var i = 0; i < 32; i++) out[i] = parseInt(c.substr(i * 2, 2), 16) ^ b[12 + i];
      return new TextDecoder().decode(out).replace(/\0+$/, '');
    });
  }

  // Resolves to one of:
  //   { match: [events, resort], first: 'dilip' }  found them
  //   { ask: true }    typed only a surname: ask for first name and surname
  //   { hint: 'Kirit Shah' }   on the list, but needs that person's number
  //   { hint: '' }     on the list, but no number for them in the sheet
  //   null             not found
  // A guest's first name or full name works; a surname (key "~word") only
  // works when typed with another name.
  function findGuest(name, phone) {
    var p = normPhone(phone);
    var full = fullKey(name);
    var w = realWords(nameWords(name));
    if (!p || !full || !window.crypto || !crypto.subtle) return Promise.resolve(null);
    var tries = [];
    if (w.length <= 1) {
      tries.push({ key: w[0] || full, first: w[0] });
    } else {
      tries.push({ key: full });
      w.forEach(function (x) { tries.push({ key: x, first: x }); });
      w.forEach(function (x) { tries.push({ key: '~' + x }); });
    }
    var single = w.length === 1 ? derive('~' + w[0] + '|' + p, 12) : Promise.resolve(null);
    // All at once: the browser runs them in parallel.
    return Promise.all([
      Promise.all(tries.map(function (t) { return derive(t.key + '|' + p, 12); })),
      single
    ]).then(function (res) {
      var hits = res[0].map(function (b) { return GUESTS.g[hex(b)]; });
      for (var i = 0; i < tries.length; i++) {
        if (!hits[i]) continue;
        // Greet them by whichever typed word is a first name on the list.
        var first = w[0];
        for (var j = 0; j < tries.length; j++) {
          if (hits[j] && tries[j].first) { first = tries[j].first; break; }
        }
        return { match: hits[i], first: first };
      }
      if (res[1] && GUESTS.g[hex(res[1])]) return { ask: true };
      return findHint(full).then(function (h) { return h == null ? null : { hint: h }; });
    });
  }

  function save(g, name, phone) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(g));
      if (name && phone) localStorage.setItem(LOGIN_KEY, JSON.stringify({ name: name, phone: phone }));
    } catch (e) { /* private mode */ }
    // Ask the browser not to clear this site's storage when space runs low.
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
  }
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key || STORE_KEY) || 'null'); } catch (e) { return null; }
  }
  function signOut() {
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(LOGIN_KEY); localStorage.removeItem(TRAVEL_KEY); } catch (e) { /* ignore */ }
    location.hash = '';
    location.reload();
  }

  /* ---------- Visit log ---------- */

  // Sends one row to the Visits tab of the guest sheet. Never sends the phone
  // number. Each thing is logged once per visit so the sheet stays readable.
  var visitId = Math.random().toString(36).slice(2, 8);
  var logged = {};
  function track(action, page, name) {
    if (!LOG_URL) return;
    var id = action + '|' + (page || '');
    if (logged[id]) return;
    logged[id] = true;
    var typed = load(LOGIN_KEY);
    var row = {
      name: name || (typed && typed.name) || (guest && guest.name) || '',
      action: action,
      page: page || '',
      events: guest ? guest.events : '',
      device: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Phone' : 'Computer',
      visit: visitId
    };
    try {
      fetch(LOG_URL, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(row)
      }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  /* ---------- Home / gate ---------- */

  function initGate() {
    $('#gate').appendChild(particles('flower', 10));
    var form = $('#gate-form');
    var err = $('#gate-error');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#g-name').value.trim();
      var phone = $('#g-phone').value.trim();
      if (!name || !phone) {
        return showErr('Please add both your name and phone number.');
      }
      var btn = form.querySelector('button[type=submit]');
      var label = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Checking the guest list…';
      err.hidden = true;
      findGuest(name, phone).then(function (found) {
        btn.disabled = false;
        btn.innerHTML = label;
        if (found && found.match) {
          login(name, phone, found);
          return enter(true);
        }
        track('Couldn’t log in', '', name);
        if (found && found.ask) {
          $('#g-name').focus();
          return showErr('Please type your first name and surname.');
        }
        if (found && found.hint) {
          return showErr('Welcome ' + firstName(realWords(nameWords(name))[0] || name) + '!\n' +
            'Please use ' + found.hint + '’s number to log in.');
        }
        if (found) {
          return showErr('Welcome ' + firstName(realWords(nameWords(name))[0] || name) + '!\n' +
            'Please contact Ishita or Sarvesh to log in.');
        }
        if (realWords(nameWords(name)).length < 2) {
          return showErr('We couldn’t find you. Try your first name and surname, with the number your invite was sent to.');
        }
        showErr('We couldn’t find you on the guest list. Use your name and the number your invite was sent to (for couples and families, that may be one number for everyone). Still stuck? Give Ishita or Sarvesh a call.');
      }).catch(function () {
        btn.disabled = false;
        btn.innerHTML = label;
        showErr('Something went wrong. Please try again.');
      });
    });

    function showErr(msg) {
      err.textContent = msg;
      err.hidden = false;
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
    }
  }

  function login(name, phone, found) {
    var match = found.match;
    guest = { name: firstName(found.first || name), events: match[0], resort: match[1] || '', v: GUESTS.salt };
    save(guest, name, phone);
  }

  function firstName(name) {
    var w = name.trim().split(/\s+/)[0] || '';
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  // Guests invited to the wedding alone don't get the Stay page.
  function hasStay() {
    return /[HSC]/.test(guest.events);
  }

  function enter(animate) {
    var gate = $('#gate');
    var app = $('#app');
    track(animate ? 'Logged in' : 'Came back');
    document.querySelectorAll('[data-nav=stay]').forEach(function (a) { a.hidden = !hasStay(); });
    buildEvents();
    if (hasStay()) buildStay();
    window.Tinker.mount($('#game'));
    app.hidden = false;
    if (animate && !reduceMotion) {
      gate.classList.add('gate--leaving');
      setTimeout(function () { gate.hidden = true; }, 650);
    } else {
      gate.hidden = true;
    }
    route();
  }

  /* ---------- Routing between the three pages ---------- */

  function route() {
    var page = (location.hash || '#events').slice(1);
    if (page === 'signout') return signOut();  // handy for testing: open #signout
    if (['events', 'stay', 'tinker'].indexOf(page) < 0 && !$('#ev-' + page)) page = 'events';
    if (page === 'stay' && !hasStay()) page = 'events';
    var isEvent = !!$('#ev-' + page);
    var view = isEvent ? 'events' : page;
    track('Opened', view.charAt(0).toUpperCase() + view.slice(1));

    ['events', 'stay', 'tinker'].forEach(function (v) {
      $('#view-' + v).hidden = v !== view;
    });
    document.body.dataset.view = view;
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      a.classList.toggle('is-current', a.dataset.nav === view);
      if (a.dataset.nav === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (isEvent) goTo(page, false);
    if (view !== 'events') window.scrollTo(0, 0);
  }

  /* ---------- Events scroller ---------- */

  var sections = [];

  function myEvents() {
    return EVENTS.filter(function (ev) { return guest.events.indexOf(ev.code) >= 0; });
  }

  function buildEvents() {
    var scroller = $('#scroller');
    var dots = $('#dots');
    scroller.innerHTML = dots.innerHTML = '';
    var list = myEvents();

    scroller.appendChild(welcomeSection(list));
    list.forEach(function (ev, i) {
      scroller.appendChild(eventSection(ev, i, list));
    });
    scroller.appendChild(outroSection());

    sections = Array.prototype.slice.call(scroller.children);
    sections.forEach(function (sec) {
      var label = sec.dataset.tab;
      var d = el('li');
      var b = el('button', 'dot', '<span>' + esc(label) + '</span>');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.addEventListener('click', function () {
        if (document.body.dataset.view !== 'events') location.hash = '#events';
        goTo(sec.dataset.key, true);
      });
      d.appendChild(b);
      dots.appendChild(d);
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) setActive(en.target);
      });
    }, { root: scroller, threshold: 0.55 });
    sections.forEach(function (s) { io.observe(s); });

    scroller.addEventListener('click', function (e) {
      var w = e.target.closest('[data-wardrobe]');
      if (w) openWardrobe(w.dataset.wardrobe);
      if (e.target.closest('[data-travel]')) openTravel();
      var n = e.target.closest('[data-next]');
      if (n) goTo(n.dataset.next, true);
    });

    document.addEventListener('keydown', function (e) {
      if (document.body.dataset.view !== 'events' || $('#wardrobe').open) return;
      if (/input|textarea/i.test(e.target.tagName)) return;
      var i = sections.findIndex(function (s) { return s.classList.contains('is-active'); });
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); step(i + 1); }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); step(i - 1); }
    });
    function step(i) {
      if (sections[i]) goTo(sections[i].dataset.key, true);
    }

    // Mouse wheel / trackpad: one gesture = one event. Touch keeps native snapping.
    var wheelLock = 0;
    scroller.addEventListener('wheel', function (e) {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      var now = Date.now();
      if (now < wheelLock || Math.abs(e.deltaY) < 4) return;
      wheelLock = now + 900;
      var i = sections.findIndex(function (s) { return s.classList.contains('is-active'); });
      step(i + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });

    setActive(sections[0]);
  }

  function setActive(sec) {
    sections.forEach(function (s, i) {
      var on = s === sec;
      s.classList.toggle('is-active', on);
      if (on) s.classList.add('has-shown');
      var dot = $('#dots').children[i];
      if (dot) {
        dot.firstChild.classList.toggle('is-active', on);
        if (on) dot.firstChild.setAttribute('aria-current', 'true'); else dot.firstChild.removeAttribute('aria-current');
      }
    });
    track('Saw', 'Events › ' + sec.dataset.tab);
    document.body.style.setProperty('--accent', sec.dataset.accent || '#c96f6a');
    if (sec.dataset.key === 'end') countdown(sec);
  }

  function goTo(key, smooth) {
    var sec = document.getElementById('ev-' + key);
    if (!sec) return;
    sec.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
  }

  // The pieces that float up behind each panel are the small motifs from the
  // invites' own backgrounds (assets/motifs, cut by tools/cut_motifs.py).
  // [file, smallest size, largest size in px]. 'bubble' is drawn in CSS.
  var MOTIFS = {
    flower:   [['flower', 14, 24], ['flower2', 14, 22]],
    sparkle:  [['sparkle', 14, 26], ['sparkle2', 12, 22]],
    marigold: [['marigold-gold.svg', 18, 32], ['marigold.svg', 20, 34], ['leaf-sage.svg', 14, 24]],
    bubble:   [['bubble', 8, 22]],
    mix:      [['flower', 14, 22], ['sparkle', 14, 22], ['marigold.svg', 20, 32], ['flower2', 14, 22]]
  };

  function particles(kind, count) {
    var set = MOTIFS[kind] || MOTIFS.flower;
    var wrap = el('div', 'particles particles--' + kind);
    wrap.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < (count || 12); i++) {
      var m = set[i % set.length];
      var file = m[0].indexOf('.') < 0 ? m[0] + '.webp' : m[0];
      var p = el('span');
      if (m[0] !== 'bubble') p.style.backgroundImage = 'url(assets/motifs/' + file + ')';
      p.style.setProperty('--o', (0.45 + Math.random() * 0.35).toFixed(2));
      p.style.left = (2 + Math.random() * 94) + '%';
      p.style.animationDelay = (-Math.random() * 12).toFixed(2) + 's';
      p.style.animationDuration = (9 + Math.random() * 7).toFixed(2) + 's';
      p.style.setProperty('--size', Math.round(m[1] + Math.random() * (m[2] - m[1])) + 'px');
      p.style.setProperty('--drift', (Math.random() * 60 - 30).toFixed(0) + 'px');
      p.style.setProperty('--spin', m[0] === 'bubble' ? '0deg' : (Math.random() < .5 ? -1 : 1) * Math.round(90 + Math.random() * 180) + 'deg');
      wrap.appendChild(p);
    }
    return wrap;
  }

  // Desktop: each invite split into pieces (assets/desk) and spread across
  // the page. Phones: the whole invite on one screen.
  function deskLayout(key, actions) {
    function img(name, cls, alt) {
      return '<img class="d-p ' + cls + '" src="assets/desk/' + name + '.webp" alt="' + esc(alt || '') + '" loading="lazy">';
    }
    switch (key) {
      case 'welcome':
        return img('family-head', 'w-head', 'Shah and Gujarathi families invite you to join us as we celebrate') +
          img('family-ishita', 'w-ish', 'Ishita. Granddaughter of Lt. Narayan and Lt. Shanta Arolkar and Shri. Kirit and Smt. Nayana Shah. Daughter of Mr. Nilesh and Mrs. Suchitra Shah.') +
          '<span class="w-divider" aria-hidden="true"></span>' +
          img('family-sarvesh', 'w-sar', 'Sarvesh. Grandson of Shri. Chintamani and Lt. Chitra Rahatekar and Lt. Chotalal and Smt. Prabha Gujarathi. Son of Lt. Manish and Mrs. Neha Gujarathi.') +
          '<div class="d-col w-note">' + actions + '</div>';
      case 'haldi':
        return img('haldi-art', 'h-art') +
          '<div class="d-col h-col">' + img('haldi-text', 'h-text', 'Yello! Haldi and Welcome Lunch to kick things off. 9th December, 11 am onwards. Palmwoods Retreat, Mulshi.') + actions + '</div>';
      case 'sangeet':
        return img('sangeet-dance', 's-dance', 'Kar-de-Disco. Time to get on the dance floor!') +
          img('sangeet-dog', 's-dog') +
          '<div class="d-col s-col">' + img('sangeet-text', 's-text', '9th December, 7pm onwards. Palmwoods Retreat, Mulshi.') + actions + '</div>';
      case 'wedding':
        return img('wedding-strip', 'wd-strip') +
          '<div class="d-col wd-col">' + img('wedding-title', 'wd-title', 'Phera Pheri') +
          img('wedding-text', 'wd-text', '10th December, Thursday. Vidhi 7:30am, Muhurat 12:19pm. Golden Fields Resort, Mulshi.') + actions + '</div>';
      case 'cocktail':
        return '<img class="d-p c-art" src="assets/mobile/cocktail.webp" alt="Toast and Tonic. 10th December, 5:30pm onwards. Palmwoods Retreat, Mulshi." loading="lazy">' +
          '<div class="d-col c-col">' + actions + '</div>';
    }
    return '';
  }

  function artPanel(opts) {
    var sec = el('section', 'panel panel--art ' + opts.cls);
    sec.id = 'ev-' + opts.key;
    sec.dataset.key = opts.key;
    sec.dataset.tab = opts.tab;
    sec.dataset.accent = opts.accent;
    sec.style.setProperty('--ev', opts.accent);
    sec.appendChild(particles(opts.particles));
    var wrap = el('div', 'art-wrap');
    wrap.innerHTML =
      '<div class="m-view">' +
        '<img class="m-img" src="' + opts.img + '" alt="' + esc(opts.alt) + '" loading="' + (opts.eager ? 'eager' : 'lazy') + '" width="1000" height="1600">' +
        '<div class="m-actions">' + opts.actions + '</div>' +
      '</div>' +
      '<div class="d-view d-view--' + opts.key + '">' + deskLayout(opts.key, opts.actions) + '</div>';
    sec.appendChild(wrap);
    if (opts.next) sec.insertAdjacentHTML('beforeend', opts.next);
    return sec;
  }

  function nextCue(next) {
    return next
      ? '<button class="scroll-cue scroll-cue--next" type="button" data-next="' + next.id + '">' + esc(next.tab) + ' <span aria-hidden="true">↓</span></button>'
      : '<button class="scroll-cue scroll-cue--next" type="button" data-next="end">One more thing <span aria-hidden="true">↓</span></button>';
  }

  function welcomeSection(list) {
    var names = list.map(function (e) { return e.tab; });
    var invited = names.length > 1
      ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
      : names[0];
    return artPanel({
      key: 'welcome', tab: 'Welcome', cls: 'panel--welcome', accent: '#c96f7d',
      img: 'assets/mobile/family.webp', eager: true, particles: 'flower',
      alt: 'Shah and Gujarathi families invite you to join us as we celebrate Ishita, daughter of Mr. Nilesh and Mrs. Suchitra Shah, and Sarvesh, son of Lt. Manish and Mrs. Neha Gujarathi.',
      actions: '<p class="art-note"><span class="art-note__hi">Hello ' + esc(guest.name) + '!</span>' +
        'We’d love you with us for ' + esc(invited) + '.</p>',
      next: nextCue(list[0])
    });
  }

  function eventSection(ev, i, list) {
    return artPanel({
      key: ev.id, tab: ev.tab, cls: 'panel--event panel--' + ev.id, accent: ev.accent,
      img: ev.card, alt: ev.cardAlt, particles: ev.particles,
      actions: '<button class="art-link" type="button" data-wardrobe="' + ev.id + '">' +
        '<span aria-hidden="true" class="art-link__line"></span>Wardrobe planner<span aria-hidden="true" class="art-link__line"></span></button>',
      next: nextCue(list[i + 1])
    });
  }

  function outroSection() {
    var sec = el('section', 'panel panel--outro');
    sec.id = 'ev-end';
    sec.dataset.key = 'end';
    sec.dataset.tab = 'See you';
    sec.dataset.accent = '#8e9f72';
    sec.innerHTML =
      '<div class="outro">' +
        '<h2 class="display outro__title">1+1=3</h2>' +
        '<p class="outro__text">See you in Mulshi</p>' +
        '<p class="countdown" hidden><b>0</b> <span></span></p>' +
        '<div class="event__actions event__actions--center">' +
          (hasStay() ? '<a class="btn btn--primary" href="#stay">Stay</a>' :
            '<button class="btn btn--primary" type="button" data-travel>Travel</button>') +
          '<a class="btn btn--primary" href="#tinker">Play</a>' +
        '</div>' +
      '</div>';
    sec.appendChild(particles('mix'));
    return sec;
  }

  // Days until the guest's first event, counted up once when the last page
  // first comes into view.
  function countdown(sec) {
    var box = sec.querySelector('.countdown');
    if (!box || box.dataset.done) return;
    box.dataset.done = '1';
    var first = myEvents()[0];
    if (!first || !first.on) return;
    var p = first.on.split('-');
    var day = new Date(+p[0], p[1] - 1, +p[2]);
    var now = new Date(); now.setHours(0, 0, 0, 0);
    var days = Math.round((day - now) / 864e5);
    if (days < 0) return;
    var num = box.querySelector('b');
    var label = box.querySelector('span');
    if (days === 0) {
      num.textContent = '';
      label.textContent = 'Today’s the day!';
      box.hidden = false;
      return;
    }
    label.textContent = days === 1 ? 'day to go' : 'days to go';
    box.hidden = false;
    if (reduceMotion) { num.textContent = days; return; }
    var start = null, dur = Math.min(1600, 500 + days * 20);
    function tick(t) {
      if (start === null) start = t;
      var k = Math.min(1, (t - start) / dur);
      num.textContent = Math.round(days * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    }
    setTimeout(function () { requestAnimationFrame(tick); }, 500);
  }

  /* ---------- Wardrobe planner popup ---------- */

  function openWardrobe(id) {
    var ev = EVENTS.filter(function (e) { return e.id === id; })[0];
    if (!ev) return;
    track('Opened wardrobe', ev.tab);
    var dlg = $('#wardrobe');
    var body = $('#wardrobe-body');
    var w = ev.wardrobe;
    if (w) {
      body.innerHTML =
        '<p class="eyebrow">Wardrobe planner</p>' +
        '<h3 id="wardrobe-title" class="display wardrobe__title">' + esc(w.name) + '</h3>' +
        '<p class="wardrobe__shade">' + esc(w.shade) + '</p>' +
        '<p class="wardrobe__line">' + esc(w.line) + '</p>' +
        '<span class="swatches swatches--lg">' + w.swatches.map(function (c) {
          return '<i style="--c:' + c + '"></i>';
        }).join('') + '</span>' +
        '<img class="wardrobe__img" src="' + w.image + '" alt="Wardrobe planner for ' + esc(w.name) + ': ' + esc(w.shade) + '. ' + esc(w.line) + '">';
    } else {
      body.innerHTML =
        '<p class="eyebrow">Wardrobe planner</p>' +
        '<h3 id="wardrobe-title" class="display wardrobe__title">' + esc(ev.title) + '</h3>' +
        '<p class="wardrobe__line">The dress code for this one is still being stirred.<br>Check back soon!</p>' +
        '<div class="wardrobe__soon" aria-hidden="true">🥂</div>';
    }
    dlg.style.setProperty('--ev', ev.accent);
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function initDialog() {
    var dlg = $('#wardrobe');
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.closest('[data-close]')) close();
    });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    function close() {
      if (reduceMotion) return dlg.close();
      dlg.classList.add('is-closing');
      setTimeout(function () { dlg.classList.remove('is-closing'); dlg.close(); }, 220);
    }
  }

  /* ---------- Stay + map ---------- */

  function buildStay() {
    var mine = guest.resort && PLACES[guest.resort];
    $('#stay-title').textContent = mine ? mine.name : 'Getting there';
    $('#stay-line').textContent = mine ? 'Your stay' : 'Find your way to the celebrations';
    WeddingMap.mount($('#map'), $('#map-panel'), { events: myEvents(), resort: guest.resort });
    travelForm($('#stay-travel'));
  }

  /* ---------- Travel plans ---------- */

  // A short form: how many, which day, what time, how, and whether they need
  // a pickup. Answers go to the visit log as one "Travel details" row and are
  // kept on the device so the form shows what they last sent.
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function arrivalDays() {
    var evs = myEvents().filter(function (e) { return e.on; });
    if (!evs.length) return [];
    function d(s) { var p = s.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); }
    var day = d(evs[0].on);
    var last = d(evs[evs.length - 1].on);
    day.setDate(day.getDate() - 1);
    var out = [];
    while (day <= last) {
      out.push(day.getDate() + ' ' + MONTHS[day.getMonth()]);
      day.setDate(day.getDate() + 1);
    }
    return out;
  }

  function travelForm(box) {
    var saved = load(TRAVEL_KEY) || {};
    function chips(name, opts) {
      return '<div class="chips" role="radiogroup">' + opts.map(function (o) {
        return '<label class="chip"><input type="radio" name="' + name + '" value="' + esc(o) + '"' +
          (saved[name] === o ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
      }).join('') + '</div>';
    }
    box.innerHTML =
      '<form class="travel" novalidate>' +
        '<p class="eyebrow">Your travel</p>' +
        '<p class="travel__lead">Tell us when you’re coming so we can plan pickups.</p>' +
        '<div class="travel__q"><span>How many of you?</span>' +
          '<div class="stepper">' +
            '<button type="button" class="stepper__btn" data-step="-1" aria-label="Fewer">−</button>' +
            '<output name="people">' + (saved.people || 1) + '</output>' +
            '<button type="button" class="stepper__btn" data-step="1" aria-label="More">+</button>' +
          '</div></div>' +
        '<div class="travel__q"><span>Arriving on</span>' + chips('day', arrivalDays()) + '</div>' +
        '<div class="travel__q"><span>Around</span>' + chips('time', ['Morning', 'Afternoon', 'Evening']) + '</div>' +
        '<div class="travel__q"><span>Coming by</span>' + chips('by', ['Flight', 'Train', 'Car']) + '</div>' +
        '<div class="travel__q" data-pickup><span>Need a pickup?</span>' + chips('pickup', ['Yes', 'No']) + '</div>' +
        '<p class="travel__msg" aria-live="polite"></p>' +
        '<button class="btn btn--primary btn--wide" type="submit">' + (saved.day ? 'Update' : 'Send') + '</button>' +
      '</form>';

    var form = box.querySelector('form');
    var out = form.querySelector('output');
    var msg = form.querySelector('.travel__msg');
    var pickupQ = form.querySelector('[data-pickup]');
    function val(name) { var i = form.querySelector('input[name=' + name + ']:checked'); return i ? i.value : ''; }
    function sync() { pickupQ.hidden = !(val('by') === 'Flight' || val('by') === 'Train'); }
    sync();
    if (saved.day) msg.textContent = 'Sent. You can change this anytime.';

    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-step]');
      if (!b) return;
      out.value = Math.min(20, Math.max(1, (+out.value || 1) + +b.dataset.step));
    });
    form.addEventListener('change', function () { sync(); msg.textContent = ''; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var t = { people: +out.value || 1, day: val('day'), time: val('time'), by: val('by'), pickup: val('pickup') };
      if (t.by === 'Car') t.pickup = 'No';
      if (!t.day || !t.time || !t.by || !t.pickup) {
        msg.textContent = 'Please answer each question.';
        return;
      }
      track('Travel details', [t.people, t.day, t.time, t.by, t.pickup].join(' | '));
      try { localStorage.setItem(TRAVEL_KEY, JSON.stringify(t)); } catch (err) { /* ignore */ }
      msg.textContent = 'Thank you! You can change this anytime.';
      form.querySelector('[type=submit]').textContent = 'Update';
    });
  }

  function openTravel() {
    var dlg = $('#wardrobe');
    var body = $('#wardrobe-body');
    body.innerHTML = '<h3 id="wardrobe-title" class="visually-hidden">Your travel</h3><div class="travel-card"></div>';
    travelForm(body.querySelector('.travel-card'));
    dlg.style.setProperty('--ev', 'var(--rose)');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  /* ---------- Boot ---------- */

  initGate();
  initDialog();
  window.addEventListener('hashchange', function () { if (guest) route(); });

  var saved = load();
  var typed = load(LOGIN_KEY);
  if (saved && saved.events && saved.v === GUESTS.salt) {
    guest = saved;
    enter(false);
  } else if (typed && typed.name && typed.phone) {
    // The guest list was rebuilt since this device last logged in: check the
    // saved name and number against the new list without asking again.
    $('#gate').hidden = true;
    findGuest(typed.name, typed.phone).catch(function () { return null; }).then(function (found) {
      if (found && found.match) {
        login(typed.name, typed.phone, found);
        enter(false);
      } else {
        $('#g-name').value = typed.name;
        $('#g-phone').value = typed.phone;
        $('#gate').hidden = false;
      }
    });
  } else {
    $('#gate').hidden = false;
  }
})();
