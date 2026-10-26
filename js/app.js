(function () {
  'use strict';

  var STORE_KEY = 'is-wedding-guest-v1';
  // What the guest typed, kept on their own device so they never have to type
  // it again, even after the guest list is rebuilt.
  var LOGIN_KEY = 'is-wedding-login-v1';
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

  var NOT_NAMES = ['wife', 'husband', 'mother', 'father', 'son', 'daughter', 'family', 'mr', 'mrs', 'ms', 'dr'];

  function nameWords(name) {
    name = name.toLowerCase().replace(/\(.*?\)/g, ' ').trim().replace(/^\w+_\s*/, '');
    return name.match(/[a-z]+/g) || [];
  }
  // Full name (word order ignored), then the first name on its own.
  function nameKeys(name) {
    var w = nameWords(name);
    var keys = [];
    if (w.length) {
      keys.push(w.slice().sort().join(' '));
      if (w.length > 1 && w[0].length > 1 && NOT_NAMES.indexOf(w[0]) < 0) keys.push(w[0]);
    }
    return keys;
  }
  function normPhone(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    return d.length >= 8 ? d.slice(-10) : '';
  }

  // Slow on purpose (PBKDF2, GUESTS.iter rounds) so the list can't be guessed.
  function deriveKey(text) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(text), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(GUESTS.salt), iterations: GUESTS.iter }, k, 96);
      })
      .then(function (bits) {
        return Array.prototype.map.call(new Uint8Array(bits), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      });
  }

  // Resolves to [events, resort] or null. Needs both name and phone.
  function findGuest(name, phone) {
    var p = normPhone(phone);
    var keys = nameKeys(name);
    if (!p || !keys.length || !window.crypto || !crypto.subtle) return Promise.resolve(null);
    return keys.reduce(function (found, n) {
      return found.then(function (hit) {
        return hit || deriveKey(n + '|' + p).then(function (k) { return GUESTS.g[k] || null; });
      });
    }, Promise.resolve(null));
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
      findGuest(name, phone).then(function (match) {
        btn.disabled = false;
        btn.innerHTML = label;
        if (!match) {
          return showErr('We couldn’t find you on the guest list. Use your name and the number your invite was sent to (for couples and families, that may be one number for everyone). Still stuck? Give Ishita or Sarvesh a call.');
        }
        login(name, phone, match);
        enter(true);
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

  function login(name, phone, match) {
    guest = { name: firstName(name), events: match[0], resort: match[1] || '', v: GUESTS.salt };
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
          (hasStay() ? '<a class="btn btn--primary" href="#stay">Stay</a>' : '') +
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
    findGuest(typed.name, typed.phone).then(function (match) {
      if (match) {
        login(typed.name, typed.phone, match);
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
