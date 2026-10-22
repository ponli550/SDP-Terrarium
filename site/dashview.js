/* Draws the Analysis dashboard from the numbers in dashboard.js. Plain DOM calls and textContent only, never innerHTML:
   nothing that reaches this file is ever parsed as HTML. The document is passed in, so the same code runs in the page and under jsdom. */
(function (root) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(doc, tag, props, kids) {
    var e = doc.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === 'class') e.className = props[k]; else if (k === 'text') e.textContent = props[k]; else e.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return e;
  }
  function sv(doc, tag, props, kids) {
    var e = doc.createElementNS(SVGNS, tag);
    Object.keys(props || {}).forEach(function (k) { if (k === 'text') e.textContent = props[k]; else e.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  var clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };
  var num = function (v, d) { var r = Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0); return (d ? r.toFixed(d) : String(r)); };
  var withUnit = function (v, unit, dec) { return unit === 'RM' ? 'RM ' + num(v, dec) : num(v, dec) + (unit === '%' ? '%' : ' ' + unit); };
  var badge = function (doc, grade) { return el(doc, 'span', { class: 'badge ' + grade, text: grade }); };
  var signed = function (v, d) { var r = Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(d || 0); };
  // on a narrow screen the charts are drawn on a narrower canvas, so a 640-unit drawing is not shrunk to a third of its size with its text
  var isNarrow = function (doc) { var v = doc.defaultView; return !!(v && v.innerWidth && v.innerWidth < 600); };
  var DRIVER_DEC = { carbonKg: 0, comfortPct: 0, walkedTrips: 0, bioIndex: 1 };

  // ---- the verdict: a score ring, one sentence, the three headline figures against the neighbour ----
  function head(doc, host, d) {
    clear(host);
    var C = 2 * Math.PI * 48, s = Math.max(0, Math.min(100, d.total));
    var ring = sv(doc, 'svg', { viewBox: '0 0 120 120', class: 'ring', role: 'img', 'aria-label': 'Home score ' + num(d.total, 0) + ' out of 100' }, [
      sv(doc, 'circle', { cx: 60, cy: 60, r: 48, fill: 'none', 'stroke-width': 11, class: 'ring-bg' }),
      sv(doc, 'circle', { cx: 60, cy: 60, r: 48, fill: 'none', 'stroke-width': 11, class: 'ring-fg', 'stroke-linecap': 'round', 'stroke-dasharray': (C * s / 100).toFixed(1) + ' ' + C.toFixed(1), transform: 'rotate(-90 60 60)' }),
      sv(doc, 'text', { x: 60, y: 62, 'text-anchor': 'middle', class: 'ring-n', text: num(d.total, 0) }),
      sv(doc, 'text', { x: 60, y: 80, 'text-anchor': 'middle', class: 'ring-s', text: 'of 100' }),
    ]);
    var tiles = d.headline.map(function (h) {
      var word = h.same ? 'same as the neighbour' : Math.abs(Math.round(h.deltaPct)) + '% ' + (h.better ? 'below' : 'above') + ' the neighbour';
      return el(doc, 'div', { class: 'delta ' + (h.same ? 'same' : h.better ? 'good' : 'bad'), 'data-key': h.key }, [
        el(doc, 'small', { text: h.label }, [badge(doc, h.grade)]),
        el(doc, 'b', { text: withUnit(h.you, h.unit, h.dec) }),
        el(doc, 'span', { class: 'dpill', text: word }),
        el(doc, 'small', { text: 'neighbour ' + withUnit(h.nb, h.unit, h.dec) }),
      ]);
    });
    host.appendChild(el(doc, 'div', { class: 'dh-main' }, [
      el(doc, 'div', { class: 'dh-ring' }, [ring, el(doc, 'span', { class: 'badge ILLUSTRATIVE', title: 'The four score formulas are placeholders', text: 'placeholder scoring' })]),
      el(doc, 'div', { class: 'dh-text' }, [el(doc, 'h2', { text: d.label }), el(doc, 'p', { class: 'dh-sentence', text: d.sentence })]),
    ]));
    host.appendChild(el(doc, 'div', { class: 'dh-tiles' }, tiles));
  }

  // ---- the four pillars: the score, what drives it, you against the neighbour, the formula folded away ----
  function pillars(doc, host, d) {
    clear(host);
    d.pillars.forEach(function (p) {
      var dr = p.driver, dec = DRIVER_DEC[dr.key] || 0, key = { energy: 'carbonKg', resilience: 'comfortPct', community: 'walkedTrips', biodiversity: 'bioIndex' }[p.key];
      dec = DRIVER_DEC[key]; var top = Math.max(dr.you, dr.nb, 1e-9);
      var vs = p.vsNeighbour, chip = Math.abs(vs) < 0.5 ? 'same as the neighbour' : signed(vs, 0) + ' vs the neighbour';
      host.appendChild(el(doc, 'div', { class: 'card pcard', 'data-pillar': p.key }, [
        el(doc, 'div', { class: 'vs', text: p.name }),
        el(doc, 'div', { class: 'score', text: num(p.score, 0) }),
        el(doc, 'div', { class: 'bar' }, [el(doc, 'i', { style: 'width:' + Math.max(0, Math.min(100, p.score)) + '%' })]),
        el(doc, 'div', { class: 'pchips' }, [el(doc, 'span', { class: 'pchip ' + (Math.abs(vs) < 0.5 ? 'same' : vs > 0 ? 'good' : 'bad'), text: chip }), p.capped ? el(doc, 'span', { class: 'pchip cap', title: 'The score stops at 100, so doing better than this is not shown', text: 'at the 100 cap' }) : null]),
        el(doc, 'div', { class: 'drv' }, [
          el(doc, 'div', { class: 'drv-l' }, [dr.label, badge(doc, dr.grade)]),
          el(doc, 'div', { class: 'drv-row' }, [el(doc, 'span', { text: 'You' }), el(doc, 'span', { class: 'drv-bar you ' + (dr.better ? 'good' : 'bad') }, [el(doc, 'i', { style: 'width:' + (dr.you / top * 100) + '%' })]), el(doc, 'b', { text: withUnit(dr.you, dr.unit, dec) })]),
          el(doc, 'div', { class: 'drv-row' }, [el(doc, 'span', { text: 'Neighbour' }), el(doc, 'span', { class: 'drv-bar nb' }, [el(doc, 'i', { style: 'width:' + (dr.nb / top * 100) + '%' })]), el(doc, 'b', { text: withUnit(dr.nb, dr.unit, dec) })]),
        ]),
        el(doc, 'details', { class: 'how' }, [el(doc, 'summary', { text: 'How is this scored?' }), el(doc, 'div', { class: 'formula', text: p.formula })]),
      ]));
    });
  }

  // ---- the month: your grid use with the solar offset on top, the neighbour as a line, heat spells shaded ----
  function month(doc, svgEl, readout, table, d, clockDay) {
    var narrow = isNarrow(doc), W = narrow ? 360 : 640, H = narrow ? 250 : 240, pl = 36, pb = 26, pt = 12, days = d.days, bw = (W - pl) / days.length;
    var mx = Math.max.apply(null, days.map(function (x) { return Math.max(x.use, x.nbGrid); })) * 1.12 || 1, yOf = function (v) { return H - pb - v / mx * (H - pb - pt); };
    clear(svgEl); svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    // heat spells first, so they sit behind everything
    var run = null; days.concat([{ day: 99, heat: false }]).forEach(function (x, i) {
      if (x.heat && run === null) run = i; if (!x.heat && run !== null) { svgEl.appendChild(sv(doc, 'rect', { x: pl + run * bw, y: pt, width: (i - run) * bw, height: H - pb - pt, class: 'heat' })); svgEl.appendChild(sv(doc, 'text', { x: pl + run * bw + 3, y: pt + 10, class: 'ax heatl', text: 'Heat spell' })); run = null; }
    });
    [0, .5, 1].forEach(function (t) { var y = yOf(t * mx); svgEl.appendChild(sv(doc, 'line', { x1: pl, x2: W, y1: y, y2: y, class: 'grid' })); svgEl.appendChild(sv(doc, 'text', { x: 0, y: y + 4, class: 'ax', text: num(t * mx, 0) })); });
    days.forEach(function (x, i) {
      var cx = pl + i * bw, g = (H - pb - pt) * x.grid / mx, sn = (H - pb - pt) * x.solar / mx;
      svgEl.appendChild(sv(doc, 'rect', { x: cx + 1, y: yOf(x.grid), width: bw - 2, height: Math.max(0, g), rx: 2, class: 'bar-grid', 'data-day': x.day }));
      if (x.solar > 0.01) svgEl.appendChild(sv(doc, 'rect', { x: cx + 1, y: yOf(x.grid) - sn, width: bw - 2, height: Math.max(0, sn), rx: 2, class: 'bar-sun', 'data-day': x.day }));
    });
    // where the clock on the Map page is: the whole month is drawn, this day is outlined
    if (clockDay >= 1 && clockDay <= days.length) svgEl.appendChild(sv(doc, 'rect', { x: pl + (clockDay - 1) * bw, y: pt, width: bw, height: H - pb - pt, class: 'clockmark', 'data-day': clockDay }));
    svgEl.appendChild(sv(doc, 'polyline', { class: 'nbline', fill: 'none', points: days.map(function (x, i) { return (pl + i * bw + bw / 2).toFixed(1) + ',' + yOf(x.nbGrid).toFixed(1); }).join(' ') }));
    [1, 10, 20, 30].forEach(function (n) { svgEl.appendChild(sv(doc, 'text', { x: pl + (n - 1) * bw + bw / 2, y: H - 8, 'text-anchor': 'middle', class: 'ax', text: n })); });
    var mark = sv(doc, 'rect', { x: 0, y: pt, width: bw, height: H - pb - pt, class: 'daymark', visibility: 'hidden' }); svgEl.appendChild(mark);

    var total = days.reduce(function (a, x) { return a + x.grid; }, 0), sun = days.reduce(function (a, x) { return a + x.solar; }, 0), nbTotal = days.reduce(function (a, x) { return a + x.nbGrid; }, 0);
    var summary = 'Month: ' + num(total, 0) + ' kWh from the grid' + (sun > 0.5 ? ', ' + num(sun, 0) + ' kWh offset by solar' : '') + '; the neighbour uses ' + num(nbTotal, 0) + ' kWh. Hover, touch or use the arrow keys to read a day.';
    var show = function (day) {
      if (!day) { readout.textContent = summary; mark.setAttribute('visibility', 'hidden'); return; }
      var x = days[day - 1];
      readout.textContent = 'Day ' + x.day + ': ' + num(x.grid, 1) + ' kWh from the grid' + (x.solar > 0.01 ? ' (solar offsets ' + num(x.solar, 1) + ')' : '') + ', neighbour ' + num(x.nbGrid, 1) + ' kWh, mean ' + num(x.temp, 0) + ' C' + (x.heat ? ' (heat spell)' : '') + ', nights comfortable ' + num(x.comfort * 100, 0) + '%.';
      mark.setAttribute('x', pl + (day - 1) * bw); mark.setAttribute('visibility', 'visible');
    };
    show(0); var cur = 0;
    var dayAt = function (ev) { var r = svgEl.getBoundingClientRect(), x = (ev.clientX - r.left) / (r.width || 1) * W; return Math.max(1, Math.min(days.length, Math.floor((x - pl) / bw) + 1)); };
    svgEl.onpointermove = function (ev) { cur = dayAt(ev); show(cur); };
    svgEl.onpointerdown = svgEl.onpointermove; svgEl.onpointerleave = function () { cur = 0; show(0); };
    svgEl.onkeydown = function (ev) {
      var k = ev.key; if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End' && k !== 'Escape') return; ev.preventDefault();
      cur = k === 'Escape' ? 0 : k === 'Home' ? 1 : k === 'End' ? days.length : Math.max(1, Math.min(days.length, (cur || clockDay || 1) + (k === 'ArrowRight' ? 1 : -1))); show(cur);
    };
    svgEl.setAttribute('aria-label', 'Daily electricity from the grid with the solar offset on top, and the neighbour average as a line. ' + summary);

    clear(table);
    var head = el(doc, 'tr', {}, ['Day', 'Grid kWh', 'Solar kWh', 'Neighbour kWh', 'Mean C', 'Comfortable nights'].map(function (t) { return el(doc, 'th', { scope: 'col', text: t }); }));
    table.appendChild(el(doc, 'thead', {}, [head]));
    table.appendChild(el(doc, 'tbody', {}, days.map(function (x) { return el(doc, 'tr', {}, [x.day, num(x.grid, 1), num(x.solar, 1), num(x.nbGrid, 1), num(x.temp, 1), num(x.comfort * 100, 0) + '%'].map(function (t, i) { return el(doc, i ? 'td' : 'th', { text: String(t) }); })); })));
  }

  // ---- what would change it: every lever re-run on this home, best first, with its effect on the score AND on carbon and money ----
  function levers(doc, host, d, ctx) {
    clear(host);
    var maxScore = Math.max.apply(null, d.levers.map(function (l) { return l.helps ? Math.max(0, l.scoreGain) : 0; }).concat([1e-9])), maxCarbon = Math.max.apply(null, d.levers.map(function (l) { return l.helps ? Math.max(0, l.carbonKg) : 0; }).concat([1e-9]));
    host.appendChild(el(doc, 'h2', { text: 'What would change it' }));
    host.appendChild(el(doc, 'p', { class: 'note', text: 'Each row changes one thing on this home and runs the month again. The top bar is the home score, the lower bar is carbon saved (home and short trips together); a score can already be at its cap, so a change can save carbon without moving it.' }));
    var list = el(doc, 'div', { class: 'levers', role: 'list' });
    d.levers.forEach(function (l) {
      var why = l.unchanged ? 'already at the limit' : !l.helps ? (l.comfortDrop > 5 ? 'costs comfort' : 'changes almost nothing') : '';
      var btn = el(doc, 'button', { type: 'button', class: 'lever-go', 'data-lever': l.key, text: 'Apply' });
      if (l.unchanged || !l.helps || ctx.locked) btn.disabled = true;
      if (ctx.locked) btn.title = 'Quit the game first: changes apply outside a game.';
      btn.onclick = function () { ctx.apply(l.key); };
      var bar = function (cls, v, max) { return el(doc, 'div', { class: 'lv-bar ' + cls }, [el(doc, 'i', { style: 'width:' + (v > 0 ? Math.max(3, v / max * 100) : 0) + '%' })]); };
      list.appendChild(el(doc, 'div', { class: 'lever' + (l.helps ? '' : ' dim'), role: 'listitem', 'data-lever': l.key }, [
        el(doc, 'div', { class: 'lv-label', text: l.label }),
        el(doc, 'div', { class: 'lv-bars' }, [bar('score', l.helps ? l.scoreGain : 0, maxScore), bar('carbon', l.helps ? l.carbonKg : 0, maxCarbon)]),
        btn,
        el(doc, 'div', { class: 'lv-nums' }, [
          l.unchanged ? null : el(doc, 'span', { class: 'pchip ' + (l.scoreGain >= 0.5 ? 'good' : l.scoreGain <= -0.5 ? 'bad' : ''), text: (Math.abs(l.scoreGain) < 0.5 ? 'score unchanged' : signed(l.scoreGain, 0) + ' score') }),
          l.unchanged ? null : el(doc, 'span', { class: 'lv-c', text: Math.abs(l.carbonKg) < 0.5 ? 'no carbon change' : signed(-l.carbonKg, 0) + ' kg carbon' }),
          l.unchanged || Math.abs(l.rm) < 0.5 ? null : el(doc, 'span', { class: 'lv-r', text: l.rm >= 0 ? 'saves RM ' + num(l.rm, 0) : 'costs RM ' + num(-l.rm, 0) }),
          l.comfortDrop > 0.5 ? el(doc, 'span', { class: 'pchip bad', text: '\u2212' + num(l.comfortDrop, 0) + ' pts comfort' }) : null,
          why ? el(doc, 'span', { class: 'lv-why', text: why }) : null,
        ]),
      ]));
    });
    host.appendChild(list);
    host.appendChild(el(doc, 'p', { class: 'note', text: 'Changes overlap: two together do not simply add. The assistant on the Map page can run several at once.' }));
  }

  // ---- a condo on every floor: the same home, the model's floor rules, your floor marked ----
  function floors(doc, host, d, ctx, T) {
    clear(host);
    if (!d.floors) { host.hidden = true; return; }
    host.hidden = false;
    var f = d.floors, narrow = isNarrow(doc), W = narrow ? 360 : 640, H = narrow ? 150 : 170, pl = 36, pb = 22, pt = 8, bw = (W - pl) / f.length, lo = Math.min.apply(null, f.map(function (x) { return x.kwh; })), hi = Math.max.apply(null, f.map(function (x) { return x.kwh; }));
    var yOf = function (v) { return H - pb - (v - lo * 0.9) / ((hi * 1.04 - lo * 0.9) || 1) * (H - pb - pt); };
    var svgEl = sv(doc, 'svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'floorchart', role: 'img', 'aria-label': 'Monthly electricity for this home on each of the ' + f.length + ' levels. Your level is highlighted.' });
    [lo, hi].forEach(function (v) { svgEl.appendChild(sv(doc, 'line', { x1: pl, x2: W, y1: yOf(v), y2: yOf(v), class: 'grid' })); svgEl.appendChild(sv(doc, 'text', { x: 0, y: yOf(v) + 4, class: 'ax', text: num(v, 0) })); });
    f.forEach(function (x, i) {
      var r = sv(doc, 'rect', { x: pl + i * bw + 1, y: yOf(x.kwh), width: bw - 2, height: Math.max(1, H - pb - yOf(x.kwh)), rx: 2, class: 'floor-bar' + (x.selected ? ' sel' : ''), 'data-level': x.level });
      r.onclick = function () { ctx.setLevel(x.level); };
      r.onpointerenter = function () { read(x); };
      svgEl.appendChild(r);
    });
    [1, 10, 20, 30, f.length].forEach(function (n, i, a) { if (a.indexOf(n) !== i) return; svgEl.appendChild(sv(doc, 'text', { x: pl + (n - 1) * bw + bw / 2, y: H - 6, 'text-anchor': 'middle', class: 'ax', text: n })); });
    var A = T.ASSUME, sel = f.filter(function (x) { return x.selected; })[0], first = f[0], last = f[f.length - 1];
    var readout = el(doc, 'p', { class: 'readout', 'aria-live': 'polite' });
    var read = function (x) { readout.textContent = 'Level ' + x.level + ': ' + num(x.kwh, 0) + ' kWh a month, ' + num(x.carbonKg, 0) + ' kg carbon, ' + num(x.walkMin, 0) + ' min walking' + (x.selected ? ' (your level)' : '') + '.'; };
    read(sel);
    host.appendChild(el(doc, 'h2', { text: 'Your floor' }));
    host.appendChild(el(doc, 'p', { class: 'note', text: 'The same home on every level of the tower, everything else as you chose it. Tap a bar to move there; the Your floor slider does the same by keyboard.' }));
    host.appendChild(svgEl); host.appendChild(readout);
    host.appendChild(el(doc, 'ul', { class: 'floornotes' }, [
      el(doc, 'li', {}, ['Levels 1 to ' + A.shadeLevels.v + ' are shaded by the trees on the plot (fading to none by level ' + (A.shadeLevels.v + 1) + '); the top level runs about ' + num(A.roofHeat.v * 100, 0) + '% hotter under the roof. ', badge(doc, 'ILLUSTRATIVE')]),
      el(doc, 'li', {}, ['Walking time rises with the lift: ' + num(first.walkMin, 0) + ' min a month from level 1 to ' + num(last.walkMin, 0) + ' min from level ' + last.level + '. ', badge(doc, 'ILLUSTRATIVE')]),
    ]));
  }

  // ---- the figures, with an honest count of how many are real ----
  function gradeLine(doc, host, d) {
    host.textContent = 'Of ' + d.figureCount + ' figures, ' + d.gradeCounts.REAL + ' REAL, ' + d.gradeCounts.SOURCED + ' SOURCED, ' + d.gradeCounts.ILLUSTRATIVE + ' ILLUSTRATIVE.';
  }
  function caveats(doc, host, d) { clear(host); d.caveats.forEach(function (c) { host.appendChild(el(doc, 'li', { text: c })); }); }

  function render(doc, els, d, ctx) {
    head(doc, els.head, d); pillars(doc, els.pillars, d); month(doc, els.chart, els.readout, els.table, d, ctx.clockDay());
    levers(doc, els.levers, d, ctx); floors(doc, els.floors, d, ctx, ctx.T); gradeLine(doc, els.grades, d); caveats(doc, els.caveats, d);
  }

  var API = { render: render, month: month, head: head, pillars: pillars, levers: levers, floors: floors, gradeLine: gradeLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TerrariumDashView = API;
})(typeof window !== 'undefined' ? window : globalThis);
