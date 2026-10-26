(function () {
  'use strict';

  var STORE_KEY = 'is-wedding-guest-v1';
  // What the guest typed, kept on their own device so they never have to type
  // it again, even after the guest list is rebuilt.
  var LOGIN_KEY = 'is-wedding-login-v1';
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
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(LOGIN_KEY); } catch (e) { /* ignore */ }
    location.hash = '';
    location.reload();
  }

  /* ---------- Visit log ---------- */

  // Sends one row to the Visits tab of the guest sheet. Never sends the phone
  // number. Each thing is logged once per visit so the sheet stays readable.
  var visitId = Math.random().toString(36).slice(2, 8);
  var logged = {};
  function track(action, page, name) {
    var id = action + '|' + (page || '');
    if (logged[id]) return;
    logged[id] = true;
    send(action, page, name);
  }
  function send(action, page, name) {
    if (!LOG_URL) return;
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
    document.querySelectorAll('.menu [data-nav=stay], .menu [data-nav=travel], .menu [data-nav=itinerary]').forEach(function (a) {
      a.parentNode.hidden = !hasStay();
    });
    buildEvents();
    if (hasStay()) { buildItinerary(); buildStay(); buildTravel(); }
    var typed = load(LOGIN_KEY);
    // Pulp Fiction only holds the insiders' section for now, so the page,
    // its menu link and its button on the last Events page are insiders only.
    window.Insider.mount($('#insider'), normPhone(typed && typed.phone)).then(function (yes) {
      isInsider = yes;
      document.querySelectorAll('[data-insider]').forEach(function (n) { n.hidden = !yes; });
      if (yes && location.hash === '#pulp-fiction') route();
    });
    app.hidden = false;
    if (animate && !reduceMotion) {
      gate.classList.add('gate--leaving');
      setTimeout(function () { gate.hidden = true; }, 650);
    } else {
      gate.hidden = true;
    }
    route();
  }

  /* ---------- Routing between the pages ---------- */

  var VIEWS = ['events', 'itinerary', 'stay', 'pulp-fiction'];
  var isInsider = false;

  function route() {
    var page = (location.hash || '#events').slice(1);
    if (page === 'signout') return signOut();  // handy for testing: open #signout
    if (VIEWS.indexOf(page) < 0 && page !== 'travel' && !$('#ev-' + page)) page = 'events';
    // Guests invited to the wedding alone don't get Itinerary, Stay or Travel.
    if ((page === 'stay' || page === 'travel' || page === 'itinerary') && !hasStay()) page = 'events';
    if (page === 'pulp-fiction' && !isInsider) page = 'events';
    var isEvent = !!$('#ev-' + page);
    // Travel plans live at the bottom of the Stay page.
    var view = isEvent ? 'events' : page === 'travel' ? 'stay' : page;
    var nav = page === 'travel' ? 'travel' : view;
    track('Opened', page === 'travel' ? 'Travel plans' : view === 'pulp-fiction' ? 'Pulp Fiction' : view.charAt(0).toUpperCase() + view.slice(1));

    VIEWS.forEach(function (v) {
      $('#view-' + v).hidden = v !== view;
    });
    document.body.dataset.view = view;
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      var on = a.dataset.nav === nav;
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    closeMenu();
    if (isEvent) goTo(page, false);
    if (page === 'travel') {
      var t = $('#travel');
      requestAnimationFrame(function () {
        t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        t.focus({ preventScroll: true });
      });
    } else if (view !== 'events') {
      window.scrollTo(0, 0);
    }
  }

  /* ---------- Menu (top right) ---------- */

  function initMenu() {
    var btn = $('#menu-btn');
    var list = $('#menu-list');
    btn.addEventListener('click', function () {
      if (list.hidden) openMenu(); else closeMenu();
    });
    list.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      // Same page picked again: hashchange won't fire, so close it here.
      if (a && a.getAttribute('href') === location.hash) { closeMenu(); route(); }
    });
    document.addEventListener('click', function (e) {
      if (!list.hidden && !e.target.closest('.menu')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !list.hidden) { closeMenu(); btn.focus(); }
    });
  }
  function openMenu() {
    var list = $('#menu-list');
    list.hidden = false;
    $('#menu-btn').setAttribute('aria-expanded', 'true');
    void list.offsetWidth;
    list.classList.add('is-open');
  }
  function closeMenu() {
    var list = $('#menu-list');
    if (!list || list.hidden) return;
    list.hidden = true;
    list.classList.remove('is-open');
    $('#menu-btn').setAttribute('aria-expanded', 'false');
  }

  /* ---------- Events scroller ---------- */

  var sections = [];

  function myEvents() {
    var dayGuest = !/[HS]/.test(guest.events);
    return EVENTS.filter(function (ev) { return guest.events.indexOf(ev.code) >= 0; })
      .map(function (ev) { return dayGuest && ev.dayGuests ? Object.assign({}, ev, ev.dayGuests) : ev; });
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
  function deskLayout(key, actions, ev) {
    function img(name, cls, alt) {
      return '<img class="d-p ' + cls + '" src="assets/desk/' + name + '.webp" alt="' + esc(alt || '') + '" loading="lazy">';
    }
    switch (key) {
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
          img(ev.deskText || 'wedding-text', 'wd-text', ev.cardAlt.replace('Illustrated invite: Phera Pheri. ', '')) + actions + '</div>';
      case 'cocktail':
        return '<img class="d-p c-art" src="assets/mobile/cocktail.webp" alt="' + esc(ev.cardAlt) + '" loading="lazy">' +
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
      '<div class="d-view d-view--' + opts.key + '">' + deskLayout(opts.key, opts.actions, opts.ev) + '</div>';
    sec.appendChild(wrap);
    // Tapping an illustration makes it pop (the words beside it stay put).
    wrap.addEventListener('click', function (e) {
      var art = e.target.closest('.m-img, .d-p');
      if (!art || art.closest('.d-col')) return;
      art.classList.remove('is-popping');
      void art.offsetWidth; // restart the animation on every tap
      art.classList.add('is-popping');
    });
    wrap.addEventListener('animationend', function (e) {
      if (e.animationName === 'art-pop') e.target.classList.remove('is-popping');
    });
    if (opts.next) sec.insertAdjacentHTML('beforeend', opts.next);
    return sec;
  }

  function nextCue(next) {
    return next
      ? '<button class="scroll-cue scroll-cue--next" type="button" data-next="' + next.id + '">' + esc(next.tab) + ' <span aria-hidden="true">↓</span></button>'
      : '<button class="scroll-cue scroll-cue--next" type="button" data-next="end">One more thing <span aria-hidden="true">↓</span></button>';
  }

  // The first page: a letter to the guest by name, next to the couple and
  // their dog. Tapping the drawing makes it pop and throws a few flowers.
  function welcomeSection(list) {
    var sec = el('section', 'panel panel--letter');
    sec.id = 'ev-welcome';
    sec.dataset.key = 'welcome';
    sec.dataset.tab = 'Welcome';
    sec.dataset.accent = '#c96f7d';
    sec.style.setProperty('--ev', '#c96f7d');
    sec.insertAdjacentHTML('beforeend',
      '<div class="letter">' +
        '<button class="letter__art" type="button" aria-label="Ishita and Sarvesh dancing, with their dog joining in. Tap to make them twirl.">' +
          '<img src="assets/letter-art.webp" alt="" width="1138" height="916">' +
        '</button>' +
        '<div class="letter__text">' +
          '<p class="letter__dear">Dear ' + esc(guest.name) + ',</p>' +
          '<img class="letter__divider" src="assets/letter-divider.webp" alt="" width="400" height="57">' +
          '<p>It’s almost that special time, and we’re so happy to have you with us.</p>' +
          '<p>Here’s a little guide with all the tiny and not-so-tiny details, so you can focus on having the best time. (And probably shed a tear)</p>' +
        '</div>' +
      '</div>' + nextCue(list[0]));
    var art = sec.querySelector('.letter__art');
    art.addEventListener('click', function (e) {
      art.classList.remove('is-popping');
      void art.offsetWidth; // restart the animation on every tap
      art.classList.add('is-popping');
      if (reduceMotion) return;
      var box = art.getBoundingClientRect();
      var x = e.clientX ? e.clientX - box.left : box.width / 2;
      var y = e.clientY ? e.clientY - box.top : box.height / 2;
      var bits = ['marigold.svg', 'flower.webp', 'marigold-gold.svg', 'leaf-sage.svg', 'flower2.webp'];
      for (var i = 0; i < 14; i++) {
        var p = el('span', 'letter__burst');
        var ang = (i / 14) * Math.PI * 2 + Math.random() * .5;
        var dist = 70 + Math.random() * 90;
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.backgroundImage = 'url(assets/motifs/' + bits[i % bits.length] + ')';
        p.style.setProperty('--x', Math.round(Math.cos(ang) * dist) + 'px');
        p.style.setProperty('--y', Math.round(Math.sin(ang) * dist - 30) + 'px');
        p.style.setProperty('--r', Math.round(Math.random() * 360 - 180) + 'deg');
        p.style.setProperty('--size', Math.round(20 + Math.random() * 16) + 'px');
        art.appendChild(p);
        setTimeout(function (n) { n.remove(); }, 1300, p);
      }
    });
    return sec;
  }

  function eventSection(ev, i, list) {
    return artPanel({
      key: ev.id, tab: ev.tab, cls: 'panel--event panel--' + ev.id, accent: ev.accent,
      ev: ev, img: ev.card, alt: ev.cardAlt, particles: ev.particles,
      actions: '<div class="art-links">' +
        '<button class="art-link" type="button" data-wardrobe="' + ev.id + '">' +
        '<span aria-hidden="true" class="art-link__line"></span>Wardrobe planner</button>' +
        '<a class="art-link" href="' + WeddingMap.directions(ev.place) + '" target="_blank" rel="noopener" data-dir="' + esc(PLACES[ev.place].name) + '">' +
        '<span>Directions&nbsp;↗</span><span aria-hidden="true" class="art-link__line"></span></a></div>',
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
          (hasStay() ? '<a class="btn btn--primary btn--sm" href="#itinerary">Itinerary</a>' +
            '<a class="btn btn--primary btn--sm" href="#stay">Stay</a>' : '') +
          '<a class="btn btn--primary btn--sm" href="#pulp-fiction" data-insider hidden>Pulp Fiction</a>' +
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
  }

  /* ---------- Itinerary ---------- */

  // The guest's own rows of ITINERARY, with 'R' swapped for their resort.
  function myItinerary() {
    var ev = guest.events, resort = PLACES[guest.resort] ? guest.resort : '';
    return ITINERARY.map(function (d) {
      var items = d.items.filter(function (it) {
        var ok = it.need === 'R' ? !!resort : ev.indexOf(it.need) >= 0;
        if (ok && it.with) ok = it.with.split('').some(function (c) { return ev.indexOf(c) >= 0; });
        if (ok && it.place === 'R' && !resort) ok = false;
        return ok;
      }).map(function (it) {
        return { time: it.time, what: it.what, icon: it.icon, place: it.place === 'R' ? resort : it.place };
      });
      return { day: d.day, date: d.date, items: items };
    }).filter(function (d) { return d.items.length; });
  }

  // One tab per day; tapping an event just gives it a little pop.
  function buildItinerary() {
    var days = myItinerary();
    var mine = PLACES[guest.resort];
    $('#itinerary-line').textContent = mine ? 'You’re staying at ' + mine.name + '.' : '';
    $('#itinerary-line').hidden = !mine;
    var box = $('#itinerary');
    if (!days.length) { box.innerHTML = ''; return; }
    $('#itinerary-title').textContent = ['Your day', 'Your two days', 'Your three days'][days.length - 1] || 'Your itinerary';

    // Open on today during the wedding, otherwise the first day.
    var today = new Date().getDate() + ' ' + new Date().toLocaleString('en-GB', { month: 'long' });
    var open = Math.max(0, days.findIndex(function (d) { return d.date === today; }));

    box.innerHTML =
      '<div class="itin__tabs" role="tablist" aria-label="Days">' + days.map(function (d, i) {
        return '<button class="itin__tab" type="button" role="tab" id="itab-' + i + '" aria-controls="iday-' + i + '"' +
          ' aria-selected="' + (i === open) + '" tabindex="' + (i === open ? 0 : -1) + '">' +
          '<span class="itin__tab-day">' + esc(d.day) + '</span>' +
          '<span class="itin__tab-date">' + esc(d.date.replace(' December', ' Dec')) + '</span></button>';
      }).join('') + '</div>' +
      days.map(function (d, i) {
        return '<section class="itin__day" role="tabpanel" id="iday-' + i + '" aria-labelledby="itab-' + i + '"' + (i === open ? '' : ' hidden') + '>' +
          '<ol class="itin__list">' + d.items.map(function (it, j) {
            return '<li class="itin__item" style="--i:' + j + '">' +
              '<img class="itin__icon" src="assets/itinerary/' + it.icon + '.webp" alt="" loading="lazy">' +
              '<div class="itin__text">' +
                '<p class="itin__what">' + esc(it.what) + '</p>' +
                '<p class="itin__time">' + esc(it.time) + '</p>' +
                '<p class="itin__place">' + esc(PLACES[it.place].name) + '</p>' +
              '</div></li>';
          }).join('') + '</ol></section>';
      }).join('');

    var tabs = box.querySelectorAll('.itin__tab');
    function show(i, focus) {
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.setAttribute('aria-selected', on);
        t.tabIndex = on ? 0 : -1;
        $('#iday-' + k).hidden = !on;
      });
      if (focus) tabs[i].focus();
      track('Saw', 'Itinerary › ' + days[i].day);
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (n) { e.preventDefault(); show((i + n + tabs.length) % tabs.length, true); }
      });
    });
    box.addEventListener('click', function (e) {
      var it = e.target.closest('.itin__item');
      if (!it) return;
      it.classList.remove('is-pop');
      void it.offsetWidth;
      it.classList.add('is-pop');
    });
    box.addEventListener('animationend', function (e) {
      if (e.animationName === 'itin-pop') e.target.classList.remove('is-pop');
    });
  }

  /* ---------- Travel plans (bottom of the Stay page) ---------- */

  // Asks how the guest is getting here (and when a flight lands). The answer
  // goes to the Visits tab of the sheet as a "Travel plan" row, and is kept on
  // their device so they can see or change it.
  var TRAVEL_KEY = 'is-wedding-travel-v1';
  var ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">';
  var CAR = '<path d="M5 16.5V13l1.6-4.2A2 2 0 0 1 8.5 7.5h7a2 2 0 0 1 1.9 1.3L19 13v3.5"/><path d="M4 16.5h16"/><path d="M5 13h14"/>' +
    '<circle cx="8" cy="16.5" r="1.6"/><circle cx="16" cy="16.5" r="1.6"/>';
  var MODES = [
    { id: 'Flight', icon: ICON + '<path d="M10.5 13.5 4 11.2l1.2-1.4 7.3.9 3.9-4.1c.8-.8 2-.9 2.5-.4s.4 1.7-.4 2.5l-4.1 3.9.9 7.3-1.4 1.2-2.3-6.5-3 2.9v2.2l-1.1 1-1.2-2.8-2.8-1.2 1-1.1h2.2z"/></svg>' },
    { id: 'Car', icon: ICON + CAR + '</svg>' },
    { id: 'Cab', icon: ICON + CAR + '<path d="M10 7.5V5.5h4v2"/></svg>' }
  ];
  var LAND_DAYS = ['8 December', '9 December', '10 December'];

  function buildTravel() {
    var box = $('#travel');
    var plan = load(TRAVEL_KEY);
    var first = myItinerary()[0];
    var firstDay = first ? first.date : LAND_DAYS[1];

    function summary(p) {
      if (p.mode !== 'Flight') return 'By ' + p.mode.toLowerCase();
      return 'Flight, landing ' + p.day.replace(' December', ' Dec') + ' at ' + niceTime(p.time);
    }

    function done(p) {
      box.innerHTML = head() +
        '<div class="travel__card travel__card--done">' +
          '<p class="travel__thanks">Thank you! We’ve noted:</p>' +
          '<p class="travel__answer">' + esc(summary(p)) + '</p>' +
          '<button class="linkish" type="button" data-change>Change</button>' +
        '</div>';
      box.querySelector('[data-change]').addEventListener('click', function () { form(p); });
    }

    function form(p) {
      p = p || {};
      box.innerHTML = head() +
        '<form class="travel__card travel__form" novalidate>' +
          '<p class="travel__q">How are you travelling?</p>' +
          '<div class="travel__modes" role="radiogroup" aria-label="How are you travelling?">' +
            MODES.map(function (m) {
              return '<label class="mode"><input type="radio" name="mode" value="' + m.id + '"' + (p.mode === m.id ? ' checked' : '') + '>' +
                '<span class="mode__icon" aria-hidden="true">' + m.icon + '</span><span class="mode__name">' + m.id + '</span></label>';
            }).join('') +
          '</div>' +
          '<div class="travel__flight" hidden>' +
            '<p class="travel__q travel__q--sm">When do you land?</p>' +
            '<div class="travel__when">' +
              '<label class="field"><span>Day</span><select name="day">' + LAND_DAYS.map(function (d) {
                return '<option' + ((p.day || firstDay) === d ? ' selected' : '') + '>' + d + '</option>';
              }).join('') + '</select></label>' +
              '<label class="field"><span>Landing time</span><input type="time" name="time" value="' + esc(p.time || '') + '"></label>' +
            '</div>' +
          '</div>' +
          '<p class="gate__error" role="alert" hidden></p>' +
          '<button class="btn btn--primary" type="submit">Save</button>' +
        '</form>';

      var f = box.querySelector('form');
      var flight = f.querySelector('.travel__flight');
      var err = f.querySelector('.gate__error');
      function sync() {
        var m = f.querySelector('input[name=mode]:checked');
        flight.hidden = !m || m.value !== 'Flight';
      }
      f.addEventListener('change', sync);
      sync();
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var m = f.querySelector('input[name=mode]:checked');
        if (!m) return showErr('Please pick flight, car or cab.');
        var out = { mode: m.value };
        if (m.value === 'Flight') {
          out.day = f.day.value;
          out.time = f.time.value;
          if (!out.time) return showErr('Please add your landing time.');
        }
        try { localStorage.setItem(TRAVEL_KEY, JSON.stringify(out)); } catch (e2) { /* private mode */ }
        send('Travel plan', summary(out));
        done(out);
      });
      function showErr(msg) { err.textContent = msg; err.hidden = false; }
    }

    function head() {
      return '<div class="ornament" aria-hidden="true"><span></span><i>❀</i><span></span></div>' +
        '<h3 class="display travel__title">Travel plans</h3>';
    }

    if (plan && plan.mode) done(plan); else form();
  }

  // "14:30" -> "2:30 PM"
  function niceTime(t) {
    var p = String(t).split(':'), h = +p[0];
    if (isNaN(h)) return t;
    return ((h + 11) % 12 + 1) + ':' + (p[1] || '00') + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  // Log which directions guests open.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-dir]');
    if (a) track('Opened directions', a.dataset.dir);
  });

  /* ---------- Boot ---------- */

  initGate();
  initDialog();
  initMenu();
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
