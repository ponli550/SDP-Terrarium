/* The dashboard's numbers: one pure function that reads the model and returns everything the Analysis page draws.
   It adds no modelling of its own. Every figure is one the model already produces (simulate, scores, applyLever), re-arranged: the headline
   against the neighbour, what drives each pillar, the month day by day with the neighbour beside it, what each change would do, and, for a condo,
   how the same home behaves on every floor. Grades travel with the figures, so the page cannot show a placeholder as if it were a fact. */
(function (root) {
  'use strict';

  var clamp = function (x, lo, hi) { return Math.min(hi, Math.max(lo, x)); };

  // what each pillar is driven by, and which way is better
  var DRIVER = {
    energy: { fig: 'carbonKg', label: 'Carbon, home and short trips', dir: 'lower' },
    resilience: { fig: 'comfortPct', label: 'Nights kept comfortable', dir: 'higher' },
    community: { fig: 'walkedTrips', label: 'Trips on foot this month', dir: 'higher' },
    biodiversity: { fig: 'bioIndex', label: 'Native-weighted canopy', dir: 'higher' },
  };
  var HEADLINE = [
    { key: 'monthKwh', label: 'Electricity', unit: 'kWh', dec: 0 },
    { key: 'monthBill', label: 'Electricity bill', unit: 'RM', dec: 0 },
    { key: 'carbonKg', label: 'Carbon, home and short trips', unit: 'kg', dec: 0 },
  ];

  var pct = function (you, nb) { return nb === 0 ? 0 : (you - nb) / nb * 100; };
  var fmt = function (v, d) { var r = Math.round(v * Math.pow(10, d)) / Math.pow(10, d); return d ? r.toFixed(d) : String(r); };
  var nameList = function (a) { return a.length <= 2 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; };

  function dashboard(T, input) {
    var S = T.scores(input), y = S.you.figures, n = S.neighbour.figures;

    var headline = HEADLINE.map(function (h) {
      var you = y[h.key].value, nb = n[h.key].value, d = pct(you, nb);
      // trusted: a REAL or SOURCED figure may be coloured as better or worse; an ILLUSTRATIVE one is a placeholder and is drawn neutral
      return { key: h.key, label: h.label, unit: h.unit, dec: h.dec, you: you, nb: nb, deltaPct: d, better: you < nb, same: Math.abs(d) < 0.5, grade: y[h.key].grade, trusted: y[h.key].grade !== 'ILLUSTRATIVE' };
    });

    var pillars = S.pillars.map(function (p) {
      var dr = DRIVER[p.key], you = y[dr.fig].value, nb = n[dr.fig].value;
      // the neighbour scores 50 on the three ratio pillars by construction; on resilience it scores its own share of comfortable nights
      var nbScore = p.key === 'resilience' ? clamp(n.comfortPct.value, 0, 100) : 50;
      return { key: p.key, name: p.name, score: p.score, nbScore: nbScore, vsNeighbour: p.score - nbScore, capped: p.score >= 100, formula: p.formula,
        driver: { label: dr.label, unit: y[dr.fig].unit, you: you, nb: nb, dir: dr.dir, better: dr.dir === 'lower' ? you < nb : you > nb, grade: y[dr.fig].grade, trusted: y[dr.fig].grade !== 'ILLUSTRATIVE' } };
    });

    var days = S.you.days.map(function (d, i) {
      var nd = S.neighbour.days[i], w = T.weatherAt(d.day, 12, input);
      return { day: d.day, use: d.useKwh, solar: d.solarKwh, grid: d.netKwh, nbGrid: nd.netKwh, temp: d.meanTemp, comfort: d.comfort, heat: w.heat };
    });

    // every change the model offers, with its own effect. A change helps when it saves carbon, money or score and costs at most 5 points of comfort
    // (suggest() looks at carbon alone, so trees, which only lift the biodiversity score, would never appear there).
    var base = y;
    var levers = T.LEVERS.map(function (lv) {
      var next = T.applyLever(input, lv), f = T.simulate(next).figures, sa = T.scores(next).total;
      var carbonKg = base.carbonKg.value - f.carbonKg.value, rm = (base.monthBill.value + base.carRm.value) - (f.monthBill.value + f.carRm.value), comfortDrop = base.comfortPct.value - f.comfortPct.value;
      var unchanged = JSON.stringify(next) === JSON.stringify(input);
      return { key: lv.key, label: lv.label, carbonKg: carbonKg, rm: rm, comfortDrop: comfortDrop, scoreGain: sa - S.total, unchanged: unchanged, helps: !unchanged && comfortDrop <= 5 && (carbonKg > 0.5 || rm > 0.5 || sa - S.total >= 0.5) };
    }).sort(function (a, b) { return (b.helps - a.helps) || (b.scoreGain - a.scoreGain) || (b.carbonKg - a.carbonKg); });

    // a condo on every floor, everything else as chosen: the floor effects are the model's own placeholders, so they carry its grade
    var floors = null;
    if (input.house === 'condo') {
      var sel = clamp(Math.round(Number(input.level) || 1), 1, T.CONDO_LEVELS); floors = [];
      for (var lvl = 1; lvl <= T.CONDO_LEVELS; lvl++) {
        var f2 = T.simulate(Object.assign({}, input, { level: lvl })).figures;
        floors.push({ level: lvl, kwh: f2.monthKwh.value, carbonKg: f2.carbonKg.value, walkMin: f2.walkMin.value, selected: lvl === sel });
      }
    }

    var counts = { REAL: 0, SOURCED: 0, ILLUSTRATIVE: 0 };
    Object.keys(y).forEach(function (k) { if (counts[y[k].grade] !== undefined) counts[y[k].grade]++; });

    var total = S.total, top = Math.max.apply(null, pillars.map(function (p) { return p.score; })), low = Math.min.apply(null, pillars.map(function (p) { return p.score; }));
    var strongest = pillars.filter(function (p) { return p.score === top; }).map(function (p) { return p.name; });
    var weakest = pillars.filter(function (p) { return p.score === low; }).map(function (p) { return p.name; });
    var kwh = headline[0], rounded = Math.round(Math.abs(kwh.deltaPct));
    // the model grades the month's electricity REAL only while it still equals the bill the owner entered; any change to the home breaks the match
    var matched = input.billKwh != null && y.monthKwh.grade === 'REAL';
    var sentence = (matched ? 'Your own bill is ' : 'This home uses ') + fmt(kwh.you, 0) + ' kWh' + (matched ? '' : ' a month') + ', ' + (kwh.same || rounded === 0 ? 'about the same as' : rounded + '% ' + (kwh.better ? 'less' : 'more') + ' than') + ' the illustrative neighbour average of ' + fmt(kwh.nb, 0) + ' kWh. '
      + 'It scores ' + fmt(total, 0) + ' out of 100. ' + (top === low ? 'All four pillars score ' + fmt(top, 0) + '.' : 'Strongest: ' + nameList(strongest) + ' (' + fmt(top, 0) + '). Weakest: ' + nameList(weakest) + ' (' + fmt(low, 0) + ').');

    return {
      label: T.homeLabel(input), total: total, headline: headline, pillars: pillars, days: days, levers: levers, floors: floors, gradeCounts: counts, figureCount: Object.keys(y).length,
      sentence: sentence, matched: matched, billKwh: matched ? input.billKwh : null,
      caveats: (matched ? ['The electricity figure is your own bill, and the bill in RM follows it through the published tariff (without the monthly fuel adjustment or service tax). The carbon, the comfort and every score are still the model\'s placeholders.'] : []).concat(['The score formulas, the tariff, the carbon factor and the floor effects are placeholders (graded ILLUSTRATIVE), not measurements.', 'The neighbour is one fixed illustrative household, not real data.', 'Weather is a mock profile.']),
    };
  }

  var API = { dashboard: dashboard, DRIVER: DRIVER };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TerrariumDashboard = API;
})(typeof window !== 'undefined' ? window : globalThis);
