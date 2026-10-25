// Illustrated, clickable map of the three venues. Drawn in SVG so it stays
// sharp on every screen. Layout follows the real geography around Mulshi
// (Google Maps): Amora up north on the Kolwan–Paud road, Golden Fields on the
// west bank, Palmwoods south-east near the highway.
window.WeddingMap = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  // Map coordinates (viewBox 0 0 740 640) for each venue and its label.
  var SPOTS = {
    A: { x: 104, y: 92, lx: 140, ly: 98, anchor: 'start' },
    G: { x: 162, y: 436, lx: 162, ly: 494, anchor: 'middle' },
    P: { x: 520, y: 500, lx: 556, ly: 508, anchor: 'start' }
  };

  var ROUTE_A_P = 'M104 92 L118 160 C130 182 165 192 240 220 C292 242 330 268 358 302 C372 330 366 380 380 422 C394 462 418 490 438 512 C452 526 482 508 520 500';
  var ROUTE_G_J = 'M162 436 C176 462 186 500 205 530 C230 546 262 545 300 524 C330 506 360 492 392 494 C412 496 426 504 438 512';

  function svg(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function tree(g, x, y, s) {
    s = s || 1;
    svg('path', { d: 'M' + x + ' ' + (y + 6 * s) + ' v' + (8 * s), stroke: '#8a6f4e', 'stroke-width': 2 * s, 'stroke-linecap': 'round' }, g);
    svg('circle', { cx: x, cy: y, r: 8 * s, fill: '#9fb07a' }, g);
    svg('circle', { cx: x - 5 * s, cy: y + 3 * s, r: 6 * s, fill: '#8ea36a' }, g);
    svg('circle', { cx: x + 5 * s, cy: y + 2 * s, r: 6 * s, fill: '#a9b98a' }, g);
  }

  function hill(g, x, y, w) {
    svg('path', {
      d: 'M' + (x - w) + ' ' + y + ' Q' + (x - w / 3) + ' ' + (y - w * 0.55) + ' ' + x + ' ' + (y - w * 0.45) +
         ' Q' + (x + w / 2) + ' ' + (y - w * 0.4) + ' ' + (x + w) + ' ' + y + ' Z',
      fill: '#d9e0c3', stroke: '#b7c39a', 'stroke-width': 1.2
    }, g);
  }

  function sparkle(g, x, y, s) {
    svg('path', {
      d: 'M' + x + ' ' + (y - 7 * s) + ' Q' + x + ' ' + y + ' ' + (x + 7 * s) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + 7 * s) +
         ' Q' + x + ' ' + y + ' ' + (x - 7 * s) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - 7 * s) + 'Z',
      fill: '#d2a85a', class: 'map-sparkle'
    }, g);
  }

  function draw(root) {
    var s = svg('svg', { viewBox: '0 0 740 640', class: 'map-svg', role: 'img', 'aria-label': 'Map of the wedding venues around Mulshi' });
    var defs = svg('defs', {}, s);
    var f = svg('filter', { id: 'wash', x: '-10%', y: '-10%', width: '120%', height: '120%' }, defs);
    svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.035', numOctaves: '2', seed: '4', result: 'n' }, f);
    svg('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: '7' }, f);

    // paper + soft land patches
    svg('rect', { x: 0, y: 0, width: 740, height: 640, fill: 'var(--map-paper, #f4f0e6)' }, s);
    var land = svg('g', { filter: 'url(#wash)', opacity: '.75' }, s);
    svg('path', { d: 'M0 250 C60 230 120 280 150 330 C170 370 120 400 60 395 C30 392 0 380 0 360 Z', fill: '#dfe7cf' }, land);
    svg('path', { d: 'M470 0 L740 0 L740 300 C680 320 600 300 560 250 C520 200 500 120 470 0 Z', fill: '#e2e9d2' }, land);
    svg('path', { d: 'M0 470 C80 480 140 520 160 600 L0 640 Z', fill: '#e3e9d6' }, land);

    // river / backwater
    var river = svg('g', { filter: 'url(#wash)' }, s);
    var riverD = 'M-10 418 C60 414 118 424 164 448 C196 466 208 520 252 552 C296 584 380 590 438 566 C486 546 500 470 556 452 C620 430 690 440 750 432';
    svg('path', { d: riverD, fill: 'none', stroke: '#bcd8d3', 'stroke-width': 30, 'stroke-linecap': 'round' }, river);
    svg('path', { d: riverD, fill: 'none', stroke: '#a8cbc5', 'stroke-width': 12, 'stroke-linecap': 'round', opacity: '.7' }, river);
    svg('path', { d: 'M590 40 C640 60 690 70 750 66', fill: 'none', stroke: '#c5ddd8', 'stroke-width': 12, 'stroke-linecap': 'round' }, river);

    // roads
    var roads = svg('g', { fill: 'none', stroke: '#b9b2a1', 'stroke-linecap': 'round' }, s);
    svg('path', { d: 'M-10 512 C100 536 150 574 260 586 C360 596 460 594 540 598 C620 602 680 616 750 640', 'stroke-width': 4 }, roads);
    [['M0 92 C40 88 70 90 104 92', 1.6], ['M380 420 C430 400 520 380 600 382 C660 384 700 360 740 350', 1.4],
     ['M300 520 C320 470 360 440 420 430', 1.2], ['M520 500 C580 480 650 470 740 470', 1.6],
     ['M240 220 C220 300 200 360 162 436', 1.2], ['M600 250 C620 300 630 340 600 382', 1.2]].forEach(function (r) {
      svg('path', { d: r[0], 'stroke-width': r[1] }, roads);
    });

    // scenery
    var scen = svg('g', {}, s);
    hill(scen, 300, 140, 40); hill(scen, 640, 230, 46); hill(scen, 250, 480, 30); hill(scen, 680, 540, 34);
    [[60, 170, 1.1], [80, 190, .8], [400, 150, 1], [430, 170, .8], [600, 300, 1], [620, 318, .8],
     [250, 600, .9], [70, 520, 1], [500, 360, .8], [700, 160, 1]].forEach(function (t) { tree(scen, t[0], t[1], t[2]); });
    [[520, 60, 1], [690, 380, .8], [40, 300, .7], [330, 400, .7], [620, 610, .8]].forEach(function (p) { sparkle(scen, p[0], p[1], p[2]); });

    // village names
    var vil = svg('g', { class: 'map-village' }, s);
    [['Kule', 300, 120], ['Dakhane', 250, 262], ['Mugawade', 620, 395], ['Nanegaon', 40, 222], ['Kalamshet', 130, 628]].forEach(function (v) {
      svg('text', { x: v[1], y: v[2] }, vil).textContent = v[0];
    });

    // the wedding route
    var route = svg('g', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, s);
    [ROUTE_A_P, ROUTE_G_J].forEach(function (d) {
      svg('path', { d: d, stroke: '#fff', 'stroke-width': 10, opacity: '.7' }, route);
      svg('path', { d: d, stroke: '#c96f7d', 'stroke-width': 5, class: 'map-route', pathLength: 1 }, route);
    });

    // venues
    var pins = svg('g', {}, s);
    Object.keys(SPOTS).forEach(function (k) {
      var p = SPOTS[k];
      var g = svg('g', { class: 'venue', 'data-place': k, tabindex: 0, role: 'button', 'aria-label': PLACES[k].name }, pins);
      svg('circle', { cx: p.x, cy: p.y, r: 34, class: 'venue__halo' }, g);
      svg('circle', { cx: p.x, cy: p.y, r: 26, class: 'venue__disc' }, g);
      svg('image', { href: 'assets/logo.png', x: p.x - 30, y: p.y - 30, width: 60, height: 60, class: 'venue__logo' }, g);
      var t = svg('text', { x: p.lx, y: p.ly, 'text-anchor': p.anchor, class: 'venue__name' }, g);
      t.textContent = PLACES[k].short || PLACES[k].name;
      // invisible larger hit area
      svg('circle', { cx: p.x, cy: p.y, r: 46, fill: 'transparent' }, g);
    });

    root.innerHTML = '';
    root.appendChild(s);
    return s;
  }

  function mount(root, panel, opts) {
    var s = draw(root);
    var current = null;

    function select(k) {
      current = k;
      s.querySelectorAll('.venue').forEach(function (v) {
        v.classList.toggle('is-selected', v.dataset.place === k);
      });
      var p = PLACES[k];
      var events = opts.events.filter(function (e) { return e.place === k; });
      var mine = k === opts.resort;
      var rows = events.map(function (e) {
        return '<li><span class="mp-ev">' + e.tab + ' <i>' + e.date.replace(' December', ' Dec') + '</i></span><span class="mp-when">' +
          e.date.replace(' December', ' Dec') + ' · ' + e.times.join(' · ') + '</span></li>';
      }).join('');
      panel.innerHTML =
        '<p class="mp-name">' + p.name + '</p>' +
        (mine ? '<p class="mp-mine">Your stay</p>' : '') +
        (rows ? '<ul class="mp-list">' + rows + '</ul>' : '') +
        '<a class="mp-go" href="' + p.url + '" target="_blank" rel="noopener">Directions <span aria-hidden="true">↗</span></a>';

      // Sit next to the pin. Wide maps: beside it. Narrow (phones): above or below it.
      var spot = SPOTS[k];
      var narrow = root.getBoundingClientRect().width < 700;
      var mode = narrow ? (spot.y > 320 ? 'above' : 'below') : (spot.x < 370 ? 'right' : 'left');
      panel.className = 'map-card map-card--' + mode;
      panel.hidden = false;
      panel.style.left = (spot.x / 740 * 100) + '%';
      panel.style.top = (spot.y / 640 * 100) + '%';
      panel.style.setProperty('--sx', '0px');
      panel.style.setProperty('--sy', '0px');
      // keep it inside the map
      var box = root.getBoundingClientRect(), r = panel.getBoundingClientRect();
      if (box.width) {
        var sx = 0, sy = 0, pad = 6;
        if (r.left < box.left + pad) sx = box.left + pad - r.left;
        if (r.right > box.right - pad) sx = box.right - pad - r.right;
        if (r.top < box.top) sy = box.top - r.top;
        if (r.bottom > box.bottom) sy = box.bottom - r.bottom;
        panel.style.setProperty('--sx', sx + 'px');
        panel.style.setProperty('--sy', sy + 'px');
      }
      void panel.offsetWidth; panel.classList.add('is-in');
    }

    function close() {
      current = null;
      panel.hidden = true;
      s.querySelectorAll('.venue').forEach(function (v) { v.classList.remove('is-selected'); });
    }

    s.addEventListener('click', function (e) {
      var v = e.target.closest('.venue');
      if (v) select(v.dataset.place); else close();
    });
    s.addEventListener('keydown', function (e) {
      var v = e.target.closest && e.target.closest('.venue');
      if (v && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(v.dataset.place); }
    });

    // re-place the card once the Stay page is actually visible
    new MutationObserver(function () { if (current && document.body.dataset.view === 'stay') select(current); })
      .observe(document.body, { attributes: true, attributeFilter: ['data-view'] });

    select(opts.resort && PLACES[opts.resort] ? opts.resort : (opts.events[0] ? opts.events[0].place : 'P'));
  }

  return { mount: mount };
})();
