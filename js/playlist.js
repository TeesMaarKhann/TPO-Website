// The Ultimate Playlist: every guest can add songs, and everyone sees the list.
//
// Search goes through the sheet's web app (tools/visit-log.gs), which asks
// Spotify when its keys are set and iTunes otherwise. If the web app can't be
// reached, the page asks iTunes straight from the browser. Guests can also add
// whatever they typed as it is. Picked songs are saved to the "Playlist" tab.
window.Playlist = (function () {
  'use strict';

  var LOCAL_KEY = 'is-wedding-songs-v1';
  var cfg, box, input, results, list, count, more;
  var songs = [];
  var serverSearch = true;
  var timer = 0, seq = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function key(s) { return (s.song + '|' + s.artist).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function spotifyLink(s) {
    return s.url || 'https://open.spotify.com/search/' + encodeURIComponent((s.song + ' ' + (s.artist || '')).trim());
  }
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveLocal(s) {
    try { var a = loadLocal(); a.unshift(s); localStorage.setItem(LOCAL_KEY, JSON.stringify(a.slice(0, 50))); } catch (e) { /* ignore */ }
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

  function search(q) {
    if (serverSearch && cfg.url) {
      return fromServer(q).catch(function () { serverSearch = false; return fromItunes(q); });
    }
    return fromItunes(q);
  }

  function onType() {
    var q = input.value.trim();
    clearTimeout(timer);
    if (q.length < 2) { close(); return; }
    showResults(null, q);
    timer = setTimeout(function () {
      var mine = ++seq;
      search(q).then(function (tracks) {
        if (mine === seq) showResults(tracks.slice(0, 6), q);
      }).catch(function () {
        if (mine === seq) showResults([], q);
      });
    }, 300);
  }

  function row(s, i) {
    return '<li><button type="button" class="pl-hit" data-i="' + i + '">' +
      art(s) +
      '<span class="pl-hit__text"><b>' + esc(s.song) + '</b><small>' + esc(s.artist) + '</small></span>' +
      '<span class="pl-hit__add" aria-hidden="true">+</span>' +
    '</button></li>';
  }
  function art(s) {
    return s.art
      ? '<img class="pl-art" src="' + esc(s.art) + '" alt="" loading="lazy">'
      : '<span class="pl-art pl-art--note" aria-hidden="true">♪</span>';
  }

  var shown = [];
  function showResults(tracks, q) {
    shown = tracks || [];
    var typed = { song: q, artist: '', art: '', url: '' };
    var html = tracks == null
      ? '<li class="pl-results__wait">Looking…</li>'
      : shown.map(row).join('');
    html += '<li><button type="button" class="pl-hit pl-hit--typed" data-i="typed">' +
      '<span class="pl-art pl-art--note" aria-hidden="true">+</span>' +
      '<span class="pl-hit__text"><b>“' + esc(q) + '”</b><small>Use what I typed</small></span>' +
    '</button></li>';
    results.innerHTML = html;
    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    results._typed = typed;
  }

  function close() {
    results.hidden = true;
    results.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
  }

  /* ---------- Adding and listing ---------- */

  function add(s) {
    s = { song: String(s.song).slice(0, 80), artist: String(s.artist || '').slice(0, 80), art: s.art || '', url: s.url || '', by: cfg.name || '' };
    input.value = '';
    close();
    var dupe = songs.filter(function (x) { return key(x) === key(s); })[0];
    if (dupe) { flash(dupe, 'Already on the list'); return; }
    s.fresh = true;
    songs.unshift(s);
    saveLocal(s);
    render();
    cfg.post && cfg.post({ action: 'Song', song: s.song, artist: s.artist, art: s.art, url: s.url });
  }

  function flash(s, msg) {
    var i = songs.indexOf(s);
    if (i >= 8) { list.classList.add('is-all'); updateMore(); }
    var li = list.children[i];
    if (!li) return;
    li.classList.remove('is-flash'); void li.offsetWidth; li.classList.add('is-flash');
    li.scrollIntoView({ block: 'center', behavior: 'smooth' });
    count.textContent = msg;
    setTimeout(updateCount, 1800);
  }

  function updateCount() {
    var n = songs.length;
    count.textContent = n ? n + (n === 1 ? ' song' : ' songs') + ' and counting' : '';
  }

  function render() {
    list.innerHTML = songs.map(function (s) {
      return '<li class="pl-song' + (s.fresh ? ' is-new' : '') + '">' +
        '<a href="' + esc(spotifyLink(s)) + '" target="_blank" rel="noopener">' +
          art(s) +
          '<span class="pl-song__text"><b>' + esc(s.song) + '</b>' +
            '<small>' + esc(s.artist) + (s.artist && s.by ? ' · ' : '') + (s.by ? 'added by ' + esc(s.by) : '') + '</small></span>' +
        '</a></li>';
    }).join('');
    songs.forEach(function (s) { delete s.fresh; });
    updateCount();
    updateMore();
  }

  // Shows the newest 8; the rest open with a button so the page stays short.
  function updateMore() {
    var all = list.classList.contains('is-all');
    more.hidden = songs.length <= 8;
    more.textContent = all ? 'Show fewer' : 'See all ' + songs.length + ' songs';
  }

  function loadShared() {
    var local = loadLocal();
    var merge = function (shared) {
      var seen = {};
      songs = local.concat(shared).filter(function (s) {
        var k = key(s);
        if (!s.song || seen[k]) return false;
        seen[k] = true;
        return true;
      });
      render();
    };
    merge([]);
    if (!cfg.url) return;
    fetch(cfg.url + '?action=songs').then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.songs) merge(d.songs); })
      .catch(function () { /* the web app isn't updated yet: show what's on this phone */ });
  }

  /* ---------- Mount ---------- */

  function mount(el, options) {
    cfg = options || {};
    box = el;
    box.innerHTML =
      '<div class="pl-search">' +
        '<svg class="pl-search__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
        '<input id="pl-input" type="search" autocomplete="off" enterkeyhint="done" placeholder="Type a song or an artist"' +
          ' role="combobox" aria-expanded="false" aria-controls="pl-results" aria-label="Add a song">' +
        '<ul id="pl-results" class="pl-results" role="listbox" hidden></ul>' +
      '</div>' +
      '<a class="pl-spotify" href="' + esc(cfg.spotify || 'https://open.spotify.com/') + '" target="_blank" rel="noopener">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7 9.6c3.4-1 7.1-.7 10 1M7.6 12.6c2.8-.8 5.8-.5 8.2.9M8.2 15.4c2.2-.6 4.5-.4 6.4.7"/></svg>' +
        '<span>Check the playlist</span><span aria-hidden="true">\u2197</span>' +
      '</a>' +
      '<p class="pl-count" aria-live="polite"></p>' +
      '<ol class="pl-list"></ol>' +
      '<button class="pl-more" type="button" hidden></button>';
    input = box.querySelector('#pl-input');
    results = box.querySelector('#pl-results');
    list = box.querySelector('.pl-list');
    count = box.querySelector('.pl-count');
    more = box.querySelector('.pl-more');
    more.addEventListener('click', function () {
      list.classList.toggle('is-all');
      updateMore();
    });

    input.addEventListener('input', onType);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var q = input.value.trim();
        if (q.length >= 2) add(shown[0] || { song: q });
      }
      if (e.key === 'Escape') close();
    });
    results.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]');
      if (!b) return;
      add(b.dataset.i === 'typed' ? results._typed : shown[+b.dataset.i]);
    });
    document.addEventListener('click', function (e) {
      if (!box.contains(e.target)) close();
    });
    loadShared();
  }

  return { mount: mount };
})();
