// Shaadi Scramble: unjumble wedding words against a 60-second clock.
// To swap in a different game later, replace this file and keep
// window.Tinker.mount(element).
window.Tinker = (function () {
  'use strict';

  var WORDS = [
    ['HALDI', 'Turmeric, giggles and probably water'],
    ['PHERA', 'Seven of these around the fire'],
    ['MANDAP', 'The canopy where it all happens'],
    ['SANGEET', 'Songs, dances and a disco ball'],
    ['BARAAT', 'The groom’s very loud arrival'],
    ['MEHENDI', 'Henna patterns on the hands'],
    ['DHOL', 'The drum that starts every dance'],
    ['SHERWANI', 'The groom’s long, fancy coat'],
    ['LEHENGA', 'A skirt made for twirling'],
    ['VARMALA', 'Garlands the couple swap'],
    ['MUHURAT', 'The lucky moment (12:19pm!)'],
    ['MULSHI', 'Where we’re all headed'],
    ['SHAADI', 'The whole beautiful chaos'],
    ['COCKTAIL', 'Toast & Tonic, anyone?'],
    ['MARIGOLD', 'The orange flower on everything'],
    ['SINDOOR', 'Red, in the parting of the hair'],
    ['JOOTA', 'Hide it, then ask for a ransom'],
    ['ISHITA', 'The bride'],
    ['SARVESH', 'The groom'],
    ['DISCO', 'Kar-de-___'],
    ['TOAST', 'Raise your glass for one'],
    ['GOLDEN', '___ Fields, where the pheras happen'],
    ['YELLO', 'How the Haldi says hi'],
    ['KALEERE', 'Dangly gold charms on the bride’s bangles'],
    ['BIDAAI', 'The teary farewell'],
    ['SAPTAPADI', 'The seven steps together']
  ];
  var ROUND = 60;
  var BEST_KEY = 'is-scramble-best';

  var root, state;

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function getBest() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } }
  function setBest(v) { try { localStorage.setItem(BEST_KEY, v); } catch (e) { /* ignore */ } }

  function mount(el) {
    root = el;
    if (!root.dataset.keys) {
      root.dataset.keys = '1';
      document.addEventListener('keydown', onKey);
    }
    intro();
  }

  function intro() {
    stopClock();
    state = null;
    var best = getBest();
    root.innerHTML =
      '<div class="game__card game__intro">' +
        '<div class="game__tiles game__tiles--demo" aria-hidden="true">' +
          'LHIDA'.split('').map(function (c, i) { return '<span class="tile" style="--i:' + i + '">' + c + '</span>'; }).join('') +
        '</div>' +
        '<p>Tap the letters in order to spell the word. Each word gets a clue.<br>' +
        'Correct = 10 points. A hint costs 3. Skips are free but cost you time.</p>' +
        (best ? '<p class="game__best">Your best: <strong>' + best + '</strong></p>' : '') +
        '<button class="btn btn--primary" type="button" data-act="start">Start</button>' +
      '</div>';
    root.querySelector('[data-act=start]').addEventListener('click', start);
  }

  function start() {
    state = {
      queue: shuffle(WORDS),
      score: 0,
      solved: 0,
      time: ROUND,
      word: null
    };
    root.innerHTML =
      '<div class="game__card">' +
        '<div class="game__hud">' +
          '<span class="game__time"><b data-time>' + ROUND + '</b>s</span>' +
          '<span class="game__bar"><i data-bar></i></span>' +
          '<span class="game__score"><b data-score>0</b> pts</span>' +
        '</div>' +
        '<p class="game__clue" data-clue></p>' +
        '<div class="game__slots" data-slots aria-live="polite"></div>' +
        '<div class="game__tiles" data-tiles></div>' +
        '<div class="game__controls">' +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="back">Undo</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="shuffle">Shuffle</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="hint">Hint</button>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="skip">Skip</button>' +
        '</div>' +
      '</div>';
    root.querySelector('.game__controls').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      ({ back: undo, shuffle: reshuffle, hint: hint, skip: skip })[b.dataset.act]();
    });
    root.querySelector('[data-tiles]').addEventListener('click', function (e) {
      var t = e.target.closest('.tile');
      if (t && !t.disabled) pick(t);
    });
    root.querySelector('[data-slots]').addEventListener('click', function (e) {
      if (e.target.closest('.slot.is-filled:not(.is-locked)')) undo();
    });
    next();
    state.timer = setInterval(tick, 1000);
  }

  function next() {
    if (!state.queue.length) state.queue = shuffle(WORDS);
    var pair = state.queue.shift();
    var word = pair[0];
    var letters;
    do { letters = shuffle(word.split('')); } while (letters.join('') === word && word.length > 1);
    state.word = word;
    state.picked = [];   // indexes into letters
    state.locked = 0;    // letters revealed by hints
    state.letters = letters;
    root.querySelector('[data-clue]').textContent = pair[1];
    render(true);
  }

  function render(fresh) {
    var slots = root.querySelector('[data-slots]');
    var tiles = root.querySelector('[data-tiles]');
    slots.innerHTML = state.word.split('').map(function (_, i) {
      var idx = state.picked[i];
      var ch = idx != null ? state.letters[idx] : '';
      var cls = 'slot' + (ch ? ' is-filled' : '') + (i < state.locked ? ' is-locked' : '');
      return '<span class="' + cls + '">' + ch + '</span>';
    }).join('');
    tiles.innerHTML = state.letters.map(function (c, i) {
      var used = state.picked.indexOf(i) >= 0;
      return '<button type="button" class="tile' + (fresh ? ' tile--in' : '') + '" style="--i:' + i + '" data-i="' + i + '"' +
        (used ? ' disabled' : '') + '>' + c + '</button>';
    }).join('');
  }

  function pick(tile) {
    state.picked.push(+tile.dataset.i);
    render(false);
    if (state.picked.length === state.word.length) check();
  }

  function check() {
    var guess = state.picked.map(function (i) { return state.letters[i]; }).join('');
    var slots = root.querySelector('[data-slots]');
    if (guess === state.word) {
      state.score += 10;
      state.solved++;
      slots.classList.add('is-right');
      burst();
      updateHud();
      setTimeout(function () { if (state) { slots.classList.remove('is-right'); next(); } }, 650);
    } else {
      slots.classList.add('is-wrong');
      setTimeout(function () {
        if (!state) return;
        slots.classList.remove('is-wrong');
        state.picked = state.picked.slice(0, state.locked);
        render(false);
      }, 450);
    }
  }

  function undo() {
    if (state.picked.length > state.locked) {
      state.picked.pop();
      render(false);
    }
  }

  function reshuffle() {
    // Keep picked letters in place, reshuffle the rest of the pool.
    var pickedLetters = state.picked.map(function (i) { return state.letters[i]; });
    var rest = state.letters.filter(function (_, i) { return state.picked.indexOf(i) < 0; });
    state.letters = pickedLetters.concat(shuffle(rest));
    state.picked = pickedLetters.map(function (_, i) { return i; });
    render(true);
  }

  function hint() {
    // Lock in the next correct letter.
    var correctSoFar = state.word.slice(0, state.locked);
    var built = state.picked.slice(0, state.locked).map(function (i) { return state.letters[i]; }).join('');
    if (built !== correctSoFar || state.locked >= state.word.length - 1) return;
    state.picked = state.picked.slice(0, state.locked);
    var need = state.word[state.locked];
    for (var i = 0; i < state.letters.length; i++) {
      if (state.letters[i] === need && state.picked.indexOf(i) < 0) {
        state.picked.push(i);
        break;
      }
    }
    state.locked++;
    state.score = Math.max(0, state.score - 3);
    updateHud();
    render(false);
  }

  function skip() {
    state.time = Math.max(0, state.time - 3);
    updateHud();
    var slots = root.querySelector('[data-slots]');
    slots.innerHTML = state.word.split('').map(function (c) { return '<span class="slot is-filled is-reveal">' + c + '</span>'; }).join('');
    root.querySelector('[data-tiles]').innerHTML = '';
    setTimeout(function () { if (state && state.time > 0) next(); }, 700);
  }

  function tick() {
    state.time--;
    updateHud();
    if (state.time <= 0) end();
  }

  function updateHud() {
    var t = root.querySelector('[data-time]');
    if (!t) return;
    t.textContent = Math.max(0, state.time);
    root.querySelector('[data-score]').textContent = state.score;
    root.querySelector('[data-bar]').style.width = (Math.max(0, state.time) / ROUND * 100) + '%';
    root.querySelector('.game__time').classList.toggle('is-low', state.time <= 10);
  }

  function stopClock() { if (state && state.timer) clearInterval(state.timer); }

  function end() {
    stopClock();
    var s = state;
    state = null;
    var best = getBest();
    var isBest = s.score > best;
    if (isBest) setBest(s.score);
    var verdict = s.score >= 80 ? 'Certified shaadi expert.' :
      s.score >= 40 ? 'The aunties are impressed.' :
      s.score > 0 ? 'Warming up for the dance floor.' : 'Even the dog got one. Try again?';
    root.innerHTML =
      '<div class="game__card game__end">' +
        '<p class="eyebrow">Time’s up</p>' +
        '<p class="display game__final">' + s.score + '</p>' +
        '<p>' + s.solved + ' word' + (s.solved === 1 ? '' : 's') + ' unjumbled. ' + verdict + '</p>' +
        (isBest && s.score ? '<p class="game__best">New personal best!</p>' : (best ? '<p class="game__best">Your best: ' + best + '</p>' : '')) +
        '<button class="btn btn--primary" type="button" data-act="again">Play again</button>' +
      '</div>';
    root.querySelector('[data-act=again]').addEventListener('click', start);
    if (isBest && s.score) burst();
  }

  function burst() {
    var card = root.querySelector('.game__card');
    if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#fcbf63', '#f07e8d', '#98986f', '#ba9cce', '#c9a227'];
    for (var i = 0; i < 18; i++) {
      var c = document.createElement('i');
      c.className = 'confetti';
      c.style.setProperty('--x', (Math.random() * 240 - 120) + 'px');
      c.style.setProperty('--y', (-60 - Math.random() * 120) + 'px');
      c.style.setProperty('--r', (Math.random() * 540 - 270) + 'deg');
      c.style.background = colors[i % colors.length];
      card.appendChild(c);
      setTimeout(c.remove.bind(c), 900);
    }
  }

  function onKey(e) {
    if (!state || document.body.dataset.view !== 'tinker') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Backspace') { e.preventDefault(); return undo(); }
    var k = e.key.toUpperCase();
    if (!/^[A-Z]$/.test(k)) return;
    var tiles = root.querySelectorAll('.tile:not([disabled])');
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].textContent === k) { pick(tiles[i]); break; }
    }
  }

  return { mount: mount };
})();
