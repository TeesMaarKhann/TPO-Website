(function () {
  'use strict';

  var STORE_KEY = 'is-wedding-guest-v1';
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

  function save(g) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(g)); } catch (e) { /* private mode */ }
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; }
  }
  function signOut() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    location.hash = '';
    location.reload();
  }

  /* ---------- Home / gate ---------- */

  function initGate() {
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
        guest = { name: firstName(name), events: match[0], resort: match[1] || '', v: GUESTS.salt };
        save(guest);
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

  function firstName(name) {
    var w = name.trim().split(/\s+/)[0] || '';
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  function enter(animate) {
    var gate = $('#gate');
    var app = $('#app');
    buildEvents();
    buildStay();
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
  }

  function goTo(key, smooth) {
    var sec = document.getElementById('ev-' + key);
    if (!sec) return;
    sec.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
  }

  function particles(kind) {
    var wrap = el('div', 'particles particles--' + kind);
    wrap.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 12; i++) {
      var p = el('span');
      p.style.left = (4 + Math.random() * 92) + '%';
      p.style.animationDelay = (Math.random() * 5).toFixed(2) + 's';
      p.style.animationDuration = (6 + Math.random() * 6).toFixed(2) + 's';
      p.style.setProperty('--s', (0.6 + Math.random() * 0.8).toFixed(2));
      p.style.setProperty('--drift', (Math.random() * 60 - 30).toFixed(0) + 'px');
      wrap.appendChild(p);
    }
    return wrap;
  }

  function welcomeSection(list) {
    var sec = el('section', 'panel panel--welcome');
    sec.id = 'ev-welcome';
    sec.dataset.key = 'welcome';
    sec.dataset.tab = 'Welcome';
    sec.dataset.accent = '#c96f7d';
    var names = list.map(function (e) { return e.tab; });
    var invited = names.length > 1
      ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
      : names[0];
    sec.innerHTML =
      '<div class="welcome">' +
        '<p class="welcome__hi">Hello ' + esc(guest.name) + '!</p>' +
        '<div class="welcome__flower" aria-hidden="true">✿</div>' +
        '<p class="welcome__lead">Shah and Gujarathi families invite you to<br>join us as we celebrate</p>' +
        '<div class="welcome__couple">' +
          '<div class="person">' +
            '<h2 class="display person__name">Ishita</h2>' +
            '<p class="person__line">Granddaughter of Lt. Narayan &amp; Lt. Shanta Arolkar<br>and Shri. Kirit &amp; Smt. Nayana Shah</p>' +
            '<p class="person__parents">Daughter of Mr. Nilesh<br>and Mrs. Suchitra Shah</p>' +
          '</div>' +
          '<div class="ornament ornament--v" aria-hidden="true"><span></span><i>❀</i><span></span></div>' +
          '<div class="person">' +
            '<h2 class="display person__name">Sarvesh</h2>' +
            '<p class="person__line">Grandson of Shri. Chintamani &amp; Lt. Chitra Rahatekar<br>and Lt. Chotalal &amp; Smt. Prabha Gujarathi</p>' +
            '<p class="person__parents">Son of Lt. Manish<br>and Mrs. Neha Gujarathi</p>' +
          '</div>' +
        '</div>' +
        '<p class="welcome__invited">We’d love you with us for <strong>' + esc(invited) + '</strong>.</p>' +
        (list[0] ? '<button class="scroll-cue" type="button" data-next="' + list[0].id + '">Scroll to begin <span aria-hidden="true">↓</span></button>' : '') +
      '</div>';
    sec.appendChild(particles('petal'));
    return sec;
  }

  function eventSection(ev, i, list) {
    var place = PLACES[ev.place];
    var next = list[i + 1];
    var sec = el('section', 'panel panel--event panel--' + ev.id);
    sec.id = 'ev-' + ev.id;
    sec.dataset.key = ev.id;
    sec.dataset.tab = ev.tab;
    sec.dataset.accent = ev.accent;
    sec.style.setProperty('--ev', ev.accent);

    var times = ev.times.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
    sec.innerHTML =
      '<div class="event">' +
        '<div class="event__art">' +
          '<div class="card"><img src="' + ev.card + '" alt="' + esc(ev.cardAlt) + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" width="1000" height="1600"></div>' +
        '</div>' +
        '<div class="event__info">' +
          '<p class="eyebrow">' + esc(ev.tab) + ' · ' + (i + 1) + ' of ' + list.length + '</p>' +
          '<h2 class="display event__title">' + esc(ev.title) + '</h2>' +
          '<p class="event__kicker">' + esc(ev.kicker) + '</p>' +
          '<div class="ornament" aria-hidden="true"><span></span><i>✦</i><span></span></div>' +
          '<p class="event__date">' + esc(ev.date) + ' <em>' + esc(ev.day) + '</em></p>' +
          '<p class="event__time">' + times + '</p>' +
          '<a class="event__venue" href="' + place.url + '" target="_blank" rel="noopener">' +
            esc(place.name) + ', ' + esc(place.area) + ' <span aria-hidden="true">↗</span></a>' +
          '<div class="event__actions">' +
            '<button class="btn btn--primary" type="button" data-wardrobe="' + ev.id + '">Wardrobe planner</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (next
        ? '<button class="scroll-cue scroll-cue--next" type="button" data-next="' + next.id + '">Next: ' + esc(next.tab) + ' <span aria-hidden="true">↓</span></button>'
        : '<button class="scroll-cue scroll-cue--next" type="button" data-next="end">One more thing <span aria-hidden="true">↓</span></button>');
    sec.appendChild(particles(ev.particles));
    return sec;
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
        '<div class="event__actions event__actions--center">' +
          '<a class="btn btn--primary" href="#stay">Stay</a>' +
          '<a class="btn btn--primary" href="#tinker">Play</a>' +
        '</div>' +
      '</div>';
    sec.appendChild(particles('heart'));
    return sec;
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
    var card = $('#stay-card');
    var mine = guest.resort && PLACES[guest.resort];
    if (mine) {
      card.innerHTML =
        '<p class="stay-card__label">You’re staying at</p>' +
        '<p class="display stay-card__place">' + esc(mine.name) + '</p>' +
        '<p class="stay-card__area">' + esc(mine.area) + '</p>' +
        '<a class="btn btn--primary" href="' + mine.url + '" target="_blank" rel="noopener">Directions to your stay ↗</a>';
    } else {
      card.innerHTML =
        '<p class="stay-card__label">Coming for the day?</p>' +
        '<p class="stay-card__area">We haven’t got a room down for you. Here’s how to reach the venues. If you’re meant to be staying over, let Ishita or Sarvesh know.</p>';
    }

    var spots = $('#map-spots');
    spots.innerHTML = '';
    Object.keys(PLACES).forEach(function (k) {
      var p = PLACES[k];
      var a = el('a', 'spot' + (k === guest.resort ? ' spot--mine' : ''));
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('aria-label', 'Directions to ' + p.name);
      a.style.left = p.spot[0] + '%';
      a.style.top = p.spot[1] + '%';
      a.style.width = p.spot[2] + '%';
      a.style.height = p.spot[3] + '%';
      spots.appendChild(a);

      var pin = el('span', 'pin' + (k === guest.resort ? ' pin--mine' : ''));
      pin.setAttribute('aria-hidden', 'true');
      pin.style.left = p.pin[0] + '%';
      pin.style.top = p.pin[1] + '%';
      if (k === guest.resort) pin.innerHTML = '<b>You’re here</b>';
      spots.appendChild(pin);
    });

    var places = $('#places');
    places.innerHTML = '';
    var mineEvents = myEvents();
    ['P', 'G', 'A'].forEach(function (k) {
      var p = PLACES[k];
      var here = mineEvents.filter(function (e) { return e.place === k; });
      var item = el('a', 'place' + (k === guest.resort ? ' place--mine' : ''));
      item.href = p.url;
      item.target = '_blank';
      item.rel = 'noopener';
      var what = [];
      if (k === guest.resort) what.push('Your stay');
      here.forEach(function (e) { what.push(e.tab + ' · ' + e.date.replace(' December', ' Dec')); });
      item.innerHTML =
        '<span class="place__name">' + esc(p.name) + '</span>' +
        '<span class="place__what">' + (what.length ? what.map(esc).join('<br>') : 'Stay for some of our guests') + '</span>' +
        '<span class="place__go">Directions ↗</span>';
      places.appendChild(item);
    });
  }

  /* ---------- Boot ---------- */

  initGate();
  initDialog();
  window.addEventListener('hashchange', function () { if (guest) route(); });

  var saved = load();
  // A rebuilt guest list gets a new salt, so old logins are asked again.
  if (saved && saved.events && saved.v === GUESTS.salt) {
    guest = saved;
    enter(false);
  } else {
    $('#gate').hidden = false;
  }
})();
