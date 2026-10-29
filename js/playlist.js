// The Ultimate Playlist: guests search for songs and pick them straight into
// the Spotify playlist. The page doesn't list them; "Check the playlist" does.
//
// Search goes through the sheet's web app (tools/visit-log.gs), which asks
// Spotify. If the web app can't be reached, the page asks iTunes straight from
// the browser. Guests can also pick whatever they typed as it is.
//
// Each guest gets 5 picks. Past that, picks look the same to them but aren't
// sent. The web app checks the same limit, so clearing the browser won't help.
window.Playlist = (function () {
  'use strict';

  var MAX_PICKS = 5;
  var PICKS_KEY = 'is-wedding-picks-v1';
  var cfg, box, input, results, note;
  var serverSearch = true;
  var timer = 0, seq = 0, noteTimer = 0;
  var who = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function key(s) { return (s.song + '|' + (s.artist || '')).toLowerCase().replace(/\s+/g, ' ').trim(); }

  // Songs this guest picked on this phone, so repeats and the limit work offline too.
  function picks() {
    try { return JSON.parse(localStorage.getItem(PICKS_KEY) || '[]'); } catch (e) { return []; }
  }
  function savePick(k) {
    try { var a = picks(); a.push(k); localStorage.setItem(PICKS_KEY, JSON.stringify(a)); } catch (e) { /* ignore */ }
  }

  // A short code for the guest, made from their login on this phone. The
  // web app counts picks by it; their phone number never leaves the phone.
  function guestCode(login) {
    if (!login || !window.crypto || !crypto.subtle) return Promise.resolve('');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode('tpo-picks|' + login)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b).slice(0, 8), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }).catch(function () { return ''; });
  }

  /* ---------- Search ---------- */

  function fromServer(q) {
    var url = cfg.url + '?action=search&q=' + encodeURIComponent(q);
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.tracks) throw new Error('no tracks');
      return d.tracks;
    });
  }

  // JSONP, since iTunes doesn't always allow cross-site fetches.
  function fromItunes(q) {
    return new Promise(function (resolve, reject) {
      var name = 'itunesCb' + Date.now() + Math.floor(Math.random() * 1e4);
      var s = document.createElement('script');
      var done = function () { delete window[name]; s.remove(); };
      var t = setTimeout(function () { done(); reject(new Error('timeout')); }, 8000);
      window[name] = function (d) {
        clearTimeout(t); done();
        resolve((d.results || []).map(function (r) {
          return { song: r.trackName, artist: r.artistName, art: (r.artworkUrl100 || '').replace('100x100', '120x120'), url: '' };
        }));
      };
      s.onerror = function () { clearTimeout(t); done(); reject(new Error('failed')); };
      s.src = 'https://itunes.apple.com/search?media=music&entity=song&limit=6&country=IN&term=' +
        encodeURIComponent(q) + '&callback=' + name;
      document.head.appendChild(s);
    });
  }

  // Both searches start together. Apple answers in a blink, so its matches show
  // first; when Spotify answers, the same songs quietly get Spotify links and
  // covers (songs without one are matched on Spotify by the web app later).
  var cache = {};
  var warmed = false;

  function norm(t) {
    return String(t || '').toLowerCase().replace(/\(.*?\)|\[.*?\]|-\s*from .*$/g, '').replace(/[^a-z0-9]+/g, '');
  }
  function upgrade(list, spotify) {
    return list.map(function (s) {
      var m = spotify.filter(function (t) { return norm(t.song) === norm(s.song); })[0];
      return m ? { song: s.song, artist: s.artist, art: m.art || s.art, url: m.url } : s;
    });
  }

  function warm() {
    if (warmed || !cfg.url || !serverSearch) return;
    warmed = true;
    fetch(cfg.url + '?action=search&q=arijit').catch(function () { /* ignore */ });
  }

  function onType() {
    var q = input.value.trim();
    var k = q.toLowerCase();
    clearTimeout(timer);
    if (q.length < 2) { close(); return; }
    if (cache[k]) { ++seq; showResults(cache[k], q); return; }
    if (results.hidden) showResults(null, q);
    else retype(q);
    timer = setTimeout(function () {
      var mine = ++seq;
      var gotSpotify = false, apple = null, pending = 2;
      var finish = function () {
        if (--pending === 0 && mine === seq && apple == null && !gotSpotify) showResults([], q);
      };
      fromItunes(q).then(function (tracks) {
        apple = tracks.slice(0, 6);
        if (!gotSpotify && mine === seq && apple.length) { cache[k] = apple; showResults(apple, q); }
      }).catch(function () { /* Spotify may still answer */ }).then(finish);
      if (serverSearch && cfg.url) {
        fromServer(q).then(function (tracks) {
          tracks = tracks.slice(0, 6);
          if (!tracks.length) return;
          gotSpotify = true;
          if (apple && apple.length) {
            cache[k] = upgrade(apple, tracks);
            if (mine === seq) refresh(cache[k]);
          } else {
            cache[k] = tracks;
            if (mine === seq) showResults(tracks, q);
          }
        }).catch(function () { serverSearch = false; }).then(finish);
      } else {
        finish();
      }
    }, 150);
  }

  // Swaps in Spotify links and covers without redrawing, so nothing jumps
  // under a guest's finger.
  function refresh(list) {
    list.forEach(function (s, i) {
      shown[i] = s;
      var b = results.querySelector('[data-i="' + i + '"]');
      var old = b && b.querySelector('.pl-art');
      if (old && s.art && old.tagName !== 'IMG') old.outerHTML = art(s);
    });
  }

  function art(s) {
    return s.art
      ? '<img class="pl-art" src="' + esc(s.art) + '" alt="" loading="lazy">'
      : '<span class="pl-art pl-art--note" aria-hidden="true">♪</span>';
  }

  var shown = [], typed = null, shownFor = '';
  // Keeps "Use what I typed" in step while the new matches are on their way.
  function retype(q) {
    typed = { song: q, artist: '', art: '', url: '' };
    var b = results.querySelector('.pl-hit--typed b');
    if (b) b.textContent = '\u201c' + q + '\u201d';
  }
  function showResults(tracks, q) {
    shown = tracks || [];
    shownFor = q;
    typed = { song: q, artist: '', art: '', url: '' };
    var html = tracks == null
      ? '<li class="pl-results__wait">Looking…</li>'
      : shown.map(function (s, i) {
        return '<li><button type="button" class="pl-hit" data-i="' + i + '">' + art(s) +
          '<span class="pl-hit__text"><b>' + esc(s.song) + '</b><small>' + esc(s.artist) + '</small></span>' +
          '<span class="pl-hit__add" aria-hidden="true">+</span></button></li>';
      }).join('');
    html += '<li><button type="button" class="pl-hit pl-hit--typed" data-i="typed">' +
      '<span class="pl-art pl-art--note" aria-hidden="true">+</span>' +
      '<span class="pl-hit__text"><b>“' + esc(q) + '”</b><small>Use what I typed</small></span>' +
    '</button></li>';
    results.innerHTML = html;
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function close() {
    results.hidden = true;
    results.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
  }

  /* ---------- Picking ---------- */

  function pick(s) {
    if (!s || !s.song) return;
    input.value = '';
    close();
    input.blur();
    var k = key(s);
    var mine = picks();
    if (mine.indexOf(k) < 0 && mine.length < MAX_PICKS) {
      savePick(k);
      cfg.post && cfg.post({
        song: String(s.song).slice(0, 80), artist: String(s.artist || '').slice(0, 80),
        art: s.art || '', url: s.url || '', who: who
      });
    }
    showNote(s);
  }

  function showNote(s) {
    note.innerHTML = '<span class="pl-note__tick" aria-hidden="true">✓</span> <b>' + esc(s.song) + '</b> is on the playlist';
    note.classList.remove('is-on'); void note.offsetWidth; note.classList.add('is-on');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { note.classList.remove('is-on'); }, 4000);
  }

  /* ---------- Mount ---------- */

  function mount(el, options) {
    cfg = options || {};
    box = el;
    guestCode(cfg.login).then(function (c) { who = c; });
    box.innerHTML =
      '<div class="pl-search">' +
        '<svg class="pl-search__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
        '<input id="pl-input" type="search" autocomplete="off" enterkeyhint="done" placeholder="Type a song or an artist"' +
          ' role="combobox" aria-expanded="false" aria-controls="pl-results" aria-label="Pick a song">' +
        '<ul id="pl-results" class="pl-results" role="listbox" hidden></ul>' +
      '</div>' +
      '<p class="pl-note" aria-live="polite"></p>' +
      '<a class="pl-spotify" href="' + esc(cfg.spotify || 'https://open.spotify.com/') + '" target="_blank" rel="noopener">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7 9.6c3.4-1 7.1-.7 10 1M7.6 12.6c2.8-.8 5.8-.5 8.2.9M8.2 15.4c2.2-.6 4.5-.4 6.4.7"/></svg>' +
        '<span>Check the playlist</span><span aria-hidden="true">↗</span>' +
      '</a>';
    input = box.querySelector('#pl-input');
    results = box.querySelector('#pl-results');
    note = box.querySelector('.pl-note');

    input.addEventListener('input', onType);
    input.addEventListener('focus', warm);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = input.value.trim();
        if (q.length >= 2) pick((shownFor === q && shown[0]) || { song: q });
      }
      if (e.key === 'Escape') close();
    });
    results.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]');
      if (!b) return;
      pick(b.dataset.i === 'typed' ? typed : shown[+b.dataset.i]);
    });
    document.addEventListener('click', function (e) {
      if (!box.contains(e.target)) close();
    });
  }

  return { mount: mount };
})();
