const test = require('node:test');
const assert = require('node:assert');
const T = require('../site/logic.js');

const run = (o) => T.simulate(o).figures;

test('more AC hours raise kWh and bill', () => {
  assert.ok(run({ acHours: 10 }).monthKwh.value > run({ acHours: 4 }).monthKwh.value);
  assert.ok(run({ acHours: 10 }).monthBill.value > run({ acHours: 4 }).monthBill.value);
});
test('a warmer setpoint lowers AC energy', () => {
  assert.ok(run({ setpoint: 27 }).monthKwh.value < run({ setpoint: 22 }).monthKwh.value);
});
test('solar lowers net kWh and never goes negative', () => {
  const a = run({ solarKwp: 0 }), b = run({ solarKwp: 6 });
  assert.ok(b.monthKwh.value < a.monthKwh.value);
  assert.ok(b.monthKwh.value > 0);
  assert.ok(T.simulate({ solarKwp: 6 }).days.every((d) => d.solarKwh <= T.ASSUME.solarShare.v * d.useKwh + 1e-9));
});
test('walking more cuts car carbon and cost and adds minutes', () => {
  const a = run({ walkShare: 0 }), b = run({ walkShare: 1 });
  assert.ok(b.carRm.value < a.carRm.value);
  assert.ok(b.walkMin.value > a.walkMin.value);
  assert.strictEqual(b.carRm.value, 0);
});
test('bill is continuous and increasing across tariff tiers', () => {
  let prev = -1;
  for (let k = 0; k <= 1200; k += 1) { const b = T.bill(k); assert.ok(b >= prev); prev = b; }
  assert.ok(Math.abs(T.bill(200.001) - T.bill(200)) < 0.01);
});
test('the simulation is deterministic', () => {
  assert.deepStrictEqual(T.simulate({ acHours: 7 }), T.simulate({ acHours: 7 }));
});
test('a hot week raises use and lowers comfort at fixed AC hours', () => {
  const a = run({ hotWeek: false }), b = run({ hotWeek: true });
  assert.ok(b.monthKwh.value > a.monthKwh.value);
  assert.ok(b.comfortPct.value <= a.comfortPct.value);
});
test('the neighbour baseline scores 50 on energy, community and biodiversity', () => {
  const s = T.scores(T.NEIGHBOUR);
  for (const i of [0, 2, 3]) assert.ok(Math.abs(s.pillars[i].score - 50) < 1e-9, s.pillars[i].name);
  assert.strictEqual(s.pillars.length, 4);
});
test('more native trees raise biodiversity; native share matters at equal tree count', () => {
  const b = (o) => T.scores(o).pillars[3].score;
  assert.ok(b({ trees: 8 }) > b({ trees: 2 }));
  assert.ok(b({ trees: 4, nativeShare: 1 }) > b({ trees: 4, nativeShare: 0 }));
  assert.strictEqual(b({ trees: 0 }), 0);
});
test('shade trees trim AC energy, capped at 10%', () => {
  const a = run({ trees: 0 }).monthKwh.value, b = run({ trees: 10 }).monthKwh.value, c = run({ trees: 20 }).monthKwh.value;
  assert.ok(b < a);
  assert.strictEqual(b, c);
});
test('the corridor fact is REAL and cited to SDP', () => {
  assert.strictEqual(T.ASSUME.corridorTrees.grade, 'REAL');
  assert.ok(/SDP/.test(T.ASSUME.corridorTrees.note));
});
test('the trade-off is real: cutting AC to zero lifts energy but drops resilience', () => {
  const lo = T.scores({ acHours: 0 }), base = T.scores(T.NEIGHBOUR);
  assert.ok(lo.pillars[0].score > base.pillars[0].score);
  assert.ok(lo.pillars[1].score < base.pillars[1].score);
});
test('every figure and assumption carries a valid grade, and the only REAL ones are cited', () => {
  const ok = new Set(Object.values(T.GRADE));
  for (const f of Object.values(run({}))) assert.ok(ok.has(f.grade));
  for (const a of Object.values(T.ASSUME)) { assert.ok(ok.has(a.grade)); assert.ok(a.note && a.note.length > 10); }
  assert.strictEqual(T.ASSUME.stopKm.grade, 'REAL');
});
test('only SOURCED assumption caps a nudge claim at about 2%', () => {
  assert.strictEqual(T.ASSUME.nudgeCap.grade, 'SOURCED');
  assert.ok(T.ASSUME.nudgeCap.v <= 0.02);
});
test('scores stay within 0-100 at extremes', () => {
  for (const o of [{ acHours: 0, walkShare: 1, solarKwp: 10, trees: 10, nativeShare: 1 }, { acHours: 12, walkShare: 0, setpoint: 22, hotWeek: true, trees: 0 }]) {
    const s = T.scores(o);
    for (const p of s.pillars) assert.ok(p.score >= 0 && p.score <= 100);
  }
});

test('a weekly override changes only that week', () => {
  const a = T.simulate({}), b = T.simulate({ weekly: [{}, { acHours: 12 }, {}, {}] });
  assert.deepStrictEqual(a.days.slice(0, 7), b.days.slice(0, 7));
  assert.ok(b.days[7].useKwh > a.days[7].useKwh);
  assert.deepStrictEqual(a.days.slice(14), b.days.slice(14));
});
test('weekly walking shares add up like a flat share', () => {
  const flat = T.simulate({ walkShare: 0.5 }).figures.walkMin.value;
  const wk = T.simulate({ weekly: [0, 1, 2, 3].map(() => ({ walkShare: 0.5 })) }).figures.walkMin.value;
  assert.ok(Math.abs(flat - wk) < 1e-6);
});
test('the neighbour baseline meets the same heat as the player', () => {
  const s = T.scores({ hotWeek: true });
  const calm = T.simulate(T.NEIGHBOUR).figures.monthKwh.value;
  assert.ok(s.neighbour.figures.monthKwh.value > calm);
});
test('a game plays four rounds, then refuses a fifth', () => {
  let g = T.newGame({});
  for (let i = 0; i < 4; i++) { assert.ok(!T.isFinished(g)); g = T.play(g, { acHours: 6, setpoint: 25, walkShare: 0.4 }); }
  assert.ok(T.isFinished(g));
  assert.throws(() => T.play(g, { acHours: 6, setpoint: 25, walkShare: 0.4 }));
  assert.strictEqual(T.EVENTS.length, 4);
});
test('rain caps week-4 walking at half, both on play and in the input', () => {
  let g = T.newGame({});
  for (let i = 0; i < 3; i++) g = T.play(g, { acHours: 6, setpoint: 25, walkShare: 1 });
  g = T.play(g, { acHours: 6, setpoint: 25, walkShare: 1 });
  assert.strictEqual(g.weekly[3].walkShare, 0.5);
  assert.strictEqual(T.gameInput(g).weekly[3].walkShare, 0.5);
});
test('the game uses the heat spell in week 2 and no other week', () => {
  const g = T.newGame({}), sim = T.simulate(T.gameInput(g));
  const base = T.simulate(Object.assign({}, T.gameInput(g), { heat: null }));
  assert.ok(sim.days[9].meanTemp > base.days[9].meanTemp);
  assert.strictEqual(sim.days[2].meanTemp, base.days[2].meanTemp);
});
test('a played game is deterministic and unplayed weeks follow the last choice', () => {
  const g1 = T.play(T.newGame({}), { acHours: 3, setpoint: 26, walkShare: 0.6 });
  const i = T.gameInput(g1);
  assert.deepStrictEqual(i.weekly[2], { acHours: 3, setpoint: 26, walkShare: 0.6 });
  assert.deepStrictEqual(T.simulate(i), T.simulate(T.gameInput(g1)));
});
test('suggestions cut carbon, keep comfort, and are sorted best first', () => {
  const input = { acHours: 10, setpoint: 22, walkShare: 0, trees: 0, solarKwp: 0 };
  const sug = T.suggest(input, 5);
  assert.ok(sug.length >= 2);
  for (const x of sug) { assert.ok(x.carbonKg > 0.5); assert.ok(x.comfortDrop <= 5); }
  for (let k = 1; k < sug.length; k++) assert.ok(sug[k - 1].carbonKg >= sug[k].carbonKg);
});
test('a lever applied to a weekly input changes every week', () => {
  const input = T.gameInput(T.newGame({ acHours: 8 }));
  const out = T.applyLever(input, { key: 'acHours', delta: -2 });
  assert.ok(out.weekly.every((w) => w.acHours === 6));
});
test('gameInput caps week-4 walking even when the state bypassed play()', () => {
  const g = { setup: Object.assign({}, T.DEFAULTS), weekly: [{ acHours: 5, setpoint: 25, walkShare: 1 }, { acHours: 5, setpoint: 25, walkShare: 1 }, { acHours: 5, setpoint: 25, walkShare: 1 }, { acHours: 5, setpoint: 25, walkShare: 1 }] };
  assert.strictEqual(T.gameInput(g).weekly[3].walkShare, 0.5);
  assert.strictEqual(T.gameInput(g).weekly[2].walkShare, 1);
});
test('a suggestion that would cost comfort is never offered', () => {
  // hot nights run 2-5 hours, so 4 AC hours has no slack: cutting 2 saves carbon but breaks comfort
  const input = { acHours: 4, setpoint: 24, walkShare: 1, trees: 10, solarKwp: 8 };
  const cut = T.simulate(T.applyLever(input, { key: 'acHours', delta: -2 })).figures;
  const base = T.simulate(input).figures;
  assert.ok(base.carbonKg.value - cut.carbonKg.value > 0.5, 'precondition: cutting AC does save carbon');
  assert.ok(base.comfortPct.value - cut.comfortPct.value > 5, 'precondition: and does cost comfort');
  assert.ok(!T.suggest(input, 5).some((x) => x.key === 'acHours'));
});

test('the air-con runs from 19:00 for exactly acHours hours, wrapping past midnight', () => {
  const on = (ac) => [...Array(24).keys()].filter((h) => T.acIsOn(h, ac));
  assert.deepStrictEqual(on(0), []);
  assert.deepStrictEqual(on(3), [19, 20, 21]);
  assert.deepStrictEqual(on(8), [0, 1, 2, 19, 20, 21, 22, 23]);
  assert.strictEqual(on(12).length, 12);
});
test('weather: heat in the heat window, rain only in a game week 4, and warmer in the afternoon', () => {
  const g = T.gameInput(T.newGame({}));
  assert.strictEqual(T.weatherAt(10, 15, g).label, 'Heat spell');
  assert.strictEqual(T.weatherAt(25, 15, g).label, 'Rain');
  assert.strictEqual(T.weatherAt(3, 15, g).label, 'Clear');
  assert.strictEqual(T.weatherAt(25, 15, T.DEFAULTS).label, 'Clear');
  assert.ok(T.weatherAt(3, 15, g).temp > T.weatherAt(3, 3, g).temp);
});
test('trips: exact walked share over a month, and the same trips every call', () => {
  for (const share of [0, 0.2, 0.5, 1]) {
    const t = T.tripsUpTo(30, { walkShare: share }), total = t.walk + t.car;
    assert.ok(total >= 42 && total <= 43, 'about 10 per week for 30 days');
    assert.ok(Math.abs(t.walk - share * total) <= 1, 'walked share ' + share);
  }
  assert.deepStrictEqual(T.tripsOnDay(5, { walkShare: 0.5 }), T.tripsOnDay(5, { walkShare: 0.5 }));
  assert.ok(T.tripsOnDay(5, { walkShare: 0 }).every((x) => x.mode === 'car'));
});
test('trips follow the week a day belongs to', () => {
  const input = { walkShare: 0, weekly: [{ walkShare: 0 }, { walkShare: 1 }, { walkShare: 0 }, { walkShare: 0 }] };
  assert.ok(T.tripsOnDay(9, input).every((x) => x.mode === 'walk'));
  assert.ok(T.tripsOnDay(2, input).every((x) => x.mode === 'car'));
});
test('scene trip counts match the model walking minutes', () => {
  const input = { walkShare: 0.4 }, f = T.simulate(input).figures;
  const t = T.tripsUpTo(30, input);
  const modelTrips = T.ASSUME.tripsWeek.v * 30 / 7;
  assert.ok(Math.abs(t.walk - 0.4 * modelTrips) <= 1.5);
  assert.ok(Math.abs(t.walk * 2 * T.ASSUME.stopKm.v * T.ASSUME.walkMinKm.v - f.walkMin.value) <= 2 * T.ASSUME.stopKm.v * T.ASSUME.walkMinKm.v * 1.5);
});

const INSPECT_KINDS = ['home', 'neighbour', 'stop', 'bus', 'corridor', 'solar', 'person', 'car'];
test('every clickable thing has a titled panel with graded rows and at least one fact', () => {
  const input = Object.assign({}, T.DEFAULTS, { solarKwp: 3 }), ok = new Set(Object.values(T.GRADE));
  for (const k of INSPECT_KINDS) {
    const i = T.inspectInfo(k, input, { day: 3, hour: 21 });
    assert.ok(i && i.title && i.rows.length && i.facts.length, k);
    for (const r of i.rows) { assert.ok(ok.has(r.grade), k + ' ' + r.k); assert.ok(r.v !== undefined && !/undefined|NaN/.test(String(r.v)), k + ' ' + r.k + ' = ' + r.v); }
  }
  assert.strictEqual(T.inspectInfo('nothing', input), null);
});
test('only measured or cited rows are graded REAL', () => {
  const real = [];
  for (const k of INSPECT_KINDS) for (const r of T.inspectInfo(k, T.DEFAULTS, { day: 1, hour: 9 }).rows) if (r.grade === 'REAL') real.push(k + ':' + r.k);
  assert.deepStrictEqual(real.sort(), ['corridor:Trees planted along a 500 m stretch', 'person:Distance each way', 'stop:Distance from the township centre', 'stop:Nearest rail station']);
});
test('the home panel agrees with the model: air-con state, solar and today\'s use', () => {
  const input = Object.assign({}, T.DEFAULTS, { acHours: 6, solarKwp: 2 }), get = (hour, k) => T.inspectInfo('home', input, { day: 3, hour: hour }).rows.find((r) => r.k === k).v;
  assert.strictEqual(get(21, 'Air-con now'), 'On'); assert.strictEqual(get(12, 'Air-con now'), 'Off');
  assert.strictEqual(get(12, 'Rooftop solar'), '2 kWp');
  const d = T.simulate(input).days[2];
  assert.strictEqual(get(12, 'Used so far today'), (d.netKwh * 12 / 24).toFixed(1) + ' kWh');
});
test('the stop and walking panels use the same real distance as the model', () => {
  assert.strictEqual(T.inspectInfo('stop', T.DEFAULTS).rows[0].v, T.ASSUME.stopKm.v + ' km');
  assert.strictEqual(T.inspectInfo('person', T.DEFAULTS).rows.find((r) => r.k === 'Walking time each way').v, (T.ASSUME.stopKm.v * T.ASSUME.walkMinKm.v).toFixed(0) + ' min');
  assert.ok(Math.abs(Number(T.inspectInfo('car', T.DEFAULTS).rows.find((r) => r.k === 'Carbon for this trip').v.split(' ')[0]) - 2 * T.ASSUME.stopKm.v * T.ASSUME.carKgKm.v) < 0.006);
});

test('calibrate: the month matches the bill within a kWh, for homes with and without solar', () => {
  for (const base of [{}, { solarKwp: 3 }, { house: 'condo' }, { house: 'semid', acHours: 4 }]) {
    const input = Object.assign({}, T.DEFAULTS, base), own = T.simulate(input).figures.monthKwh.value;
    for (const actual of [own * 0.9, own * 1.5, own * 2.2]) {
      const c = T.calibrate(input, actual); assert.ok(c.ok, JSON.stringify(base) + ' ' + actual);
      assert.ok(Math.abs(T.simulate(Object.assign({}, input, { baseScale: c.baseScale, billKwh: actual })).figures.monthKwh.value - actual) < 0.01);
    }
  }
});
test('calibrate: reports the gap against the model\'s own estimate, with the right sign', () => {
  const input = Object.assign({}, T.DEFAULTS), own = T.simulate(input).figures.monthKwh.value;
  assert.ok(Math.abs(T.calibrate(input, own * 1.5).gapPct - 50) < 0.01);
  assert.ok(Math.abs(T.calibrate(input, own * 0.9).gapPct + 10) < 0.01);
  assert.ok(Math.abs(T.calibrate(input, own).baseScale - 1) < 0.005);
});
test('calibrate: refuses bills that are out of range or that the home cannot reach, and says why', () => {
  const input = Object.assign({}, T.DEFAULTS);
  for (const bad of [0, 10, -5, 5000, NaN, undefined]) { const c = T.calibrate(input, bad); assert.ok(!c.ok && /between 50 and 3000/.test(c.reason), String(bad)); }
  const c = T.calibrate(Object.assign({}, input, { acHours: 12 }), 100); assert.ok(!c.ok && /air-con and solar/.test(c.reason));
});
test('only the base load moves: air-con kWh and solar offset follow their own rules', () => {
  const input = Object.assign({}, T.DEFAULTS, { acHours: 8, solarKwp: 0 }), a = T.simulate(input), b = T.simulate(Object.assign({}, input, { baseScale: 2 }));
  const base = T.HOUSES.terrace.baseKwhDay;
  for (let i = 0; i < 30; i++) assert.ok(Math.abs((b.days[i].useKwh - a.days[i].useKwh) - base) < 1e-9);
});
test('the electricity figure is REAL only while it equals the bill', () => {
  const input = Object.assign({}, T.DEFAULTS), c = T.calibrate(input, 700), billed = Object.assign({}, input, { baseScale: c.baseScale, billKwh: 700 });
  assert.strictEqual(T.simulate(billed).figures.monthKwh.grade, 'REAL');
  assert.strictEqual(T.simulate(Object.assign({}, billed, { acHours: 2 })).figures.monthKwh.grade, 'ILLUSTRATIVE');  // the home changed: the match is gone
  assert.strictEqual(T.simulate(Object.assign({}, billed, { trees: 9 })).figures.monthKwh.grade, 'ILLUSTRATIVE');
  assert.strictEqual(T.simulate(input).figures.monthKwh.grade, 'ILLUSTRATIVE');
  for (const k of ['carbonKg', 'walkMin', 'comfortPct']) assert.strictEqual(T.simulate(billed).figures[k].grade, 'ILLUSTRATIVE', k + ' stays a placeholder');
  // a published tariff on the owner's own kWh is SOURCED; on a simulated month it is still a guess; and it follows the kWh exactly as the kWh figure does
  assert.strictEqual(T.simulate(billed).figures.monthBill.grade, 'SOURCED');
  assert.strictEqual(T.simulate(Object.assign({}, billed, { acHours: 2 })).figures.monthBill.grade, 'ILLUSTRATIVE'); assert.strictEqual(T.simulate(input).figures.monthBill.grade, 'ILLUSTRATIVE');
});
test('a calibrated home leaves the neighbour baseline alone', () => {
  const c = T.calibrate(T.DEFAULTS, 900), s = T.scores(Object.assign({}, T.DEFAULTS, { baseScale: c.baseScale, billKwh: 900 }));
  assert.ok(Math.abs(s.neighbour.figures.monthKwh.value - T.simulate(T.NEIGHBOUR).figures.monthKwh.value) < 1e-9);
  assert.ok(s.pillars[0].score < 50, 'a home using far more than the neighbour scores below 50 on energy');
});
test('the home panel says whether its electricity figures are your bill or simulated', () => {
  const input = Object.assign({}, T.DEFAULTS), c = T.calibrate(input, 700), billed = Object.assign({}, input, { baseScale: c.baseScale, billKwh: 700 });
  const get = (i) => T.inspectInfo('home', i, { day: 3, hour: 12 }).rows.find((r) => r.k === 'Electricity figures');
  assert.deepStrictEqual([get(billed).v, get(billed).grade], ['matched to your bill', 'REAL']);
  assert.deepStrictEqual([get(input).v, get(input).grade], ['simulated', 'ILLUSTRATIVE']);
});

// ---- lots ----
const segHitsRect = (a, b, r, m) => {   // slab test, rectangle grown by margin m
  let t0 = 0, t1 = 1; const d = [b.x - a.x, b.z - a.z], lo = [r.x0 - m, r.z0 - m], hi = [r.x1 + m, r.z1 + m], p = [a.x, a.z];
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]) < 1e-12) { if (p[k] <= lo[k] || p[k] >= hi[k]) return false; continue; }
    let u = (lo[k] - p[k]) / d[k], v = (hi[k] - p[k]) / d[k]; if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 >= t1) return false;
  }
  return true;
};
test('the layout has twelve distinct lots and no two buildings touch, whatever the home type', () => {
  assert.strictEqual(T.LOTS.length, 12); assert.strictEqual(new Set(T.LOTS.map((p) => p.join(','))).size, 12);
  for (const house of ['terrace', 'semid', 'condo']) for (let lot = 0; lot < 12; lot++) {
    const rs = T.buildingRects(lot, house);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j]; assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0, `lots ${i} and ${j} overlap with a ${house} on lot ${lot}`);
    }
  }
});
test('the scale is anchored on the real figure: township centre to the stop is exactly 0.93 km', () => {
  const km = Math.hypot(T.STOP_POS.x - T.TOWNSHIP_CENTRE.x, T.STOP_POS.z - T.TOWNSHIP_CENTRE.z) * T.metresPerUnit() / 1000;
  assert.ok(Math.abs(km - T.ASSUME.stopKm.v) < 1e-12);
});
test('lot distances follow the drawing: sensible range, and the nearest lot to the stop is the nearest in km', () => {
  const kms = T.LOTS.map((_, i) => T.lotDistanceKm(i));
  assert.ok(kms.every((k) => k > 0.3 && k < 2.0), kms.map((k) => k.toFixed(2)).join(' '));   // a township-scale walk, between a few hundred metres and two km
  const byUnits = T.LOTS.map((p, i) => [Math.hypot(T.STOP_POS.x - p[0], T.STOP_POS.z - p[1]), i]).sort((a, b) => a[0] - b[0]);
  assert.strictEqual(kms.indexOf(Math.min(...kms)), byUnits[0][1]); assert.strictEqual(kms.indexOf(Math.max(...kms)), byUnits[11][1]);
});
test('no lot means the real centre distance; a lot means a scaled one, graded illustrative; a bad lot falls back', () => {
  const none = T.simulate(Object.assign({}, T.DEFAULTS)).figures.stopKm, lot = T.simulate(Object.assign({}, T.DEFAULTS, { lot: 6 })).figures.stopKm;
  assert.deepStrictEqual([none.value, none.grade, none.label], [0.93, 'REAL', 'Nearest transit stop']);
  assert.deepStrictEqual([lot.value === T.lotDistanceKm(6), lot.grade, lot.label], [true, 'ILLUSTRATIVE', 'Your lot to the bus stop']);
  for (const bad of [-1, 12, 99, 2.5, NaN, 'x', null, undefined]) assert.strictEqual(T.simulate(Object.assign({}, T.DEFAULTS, { lot: bad })).figures.stopKm.value, 0.93, String(bad));
});
test('a farther lot means more walking minutes and more car cost and carbon at the same habits', () => {
  const near = 11, far = 1, mk = (lot, walkShare) => T.simulate(Object.assign({}, T.DEFAULTS, { lot: lot, walkShare: walkShare })).figures;
  assert.ok(T.lotDistanceKm(far) > T.lotDistanceKm(near));
  assert.ok(mk(far, 0.5).walkMin.value > mk(near, 0.5).walkMin.value);
  assert.ok(mk(far, 0.5).carRm.value > mk(near, 0.5).carRm.value);
  assert.ok(mk(far, 0.5).carbonKg.value > mk(near, 0.5).carbonKg.value);
  assert.ok(Math.abs(mk(far, 0.5).walkedTrips.value - mk(near, 0.5).walkedTrips.value) < 1e-9);
});
test('community scores trips on foot, so living far away is never rewarded; energy does notice the longer drives', () => {
  const sc = (lot) => T.scores(Object.assign({}, T.DEFAULTS, { lot: lot, walkShare: 0.2 })).pillars;
  assert.ok(Math.abs(sc(1)[2].score - sc(11)[2].score) < 1e-9);
  assert.ok(sc(1)[0].score < sc(11)[0].score);
  const moreWalk = T.scores(Object.assign({}, T.DEFAULTS, { lot: 1, walkShare: 0.9 })).pillars[2].score; assert.ok(moreWalk > sc(1)[2].score);
});
test('the neighbour baseline still scores 50 on every comparative pillar after the change', () => {
  const s = T.scores(Object.assign({}, T.NEIGHBOUR)); for (const i of [0, 2, 3]) assert.ok(Math.abs(s.pillars[i].score - 50) < 1e-9);
});
test('nobody walks or drives through a house, for every lot, home type and mode', () => {
  for (const house of ['terrace', 'semid', 'condo']) for (let lot = 0; lot < 12; lot++) {
    const rects = T.buildingRects(lot, house);
    for (const mode of ['walk', 'car']) {
      const path = T.tripPath(lot, mode);
      for (let k = 0; k + 1 < path.length; k++) for (let r = 0; r < rects.length; r++) assert.ok(!segHitsRect(path[k], path[k + 1], rects[r], 1.0), `${mode} from lot ${lot} (${house}) leg ${k} crosses lot ${r}`);
    }
  }
});
test('a trip starts and ends at the lot, a walk reaches the stop and waits there, a car goes out to the main road', () => {
  for (let lot = 0; lot < 12; lot++) {
    const w = T.tripPath(lot, 'walk'), c = T.tripPath(lot, 'car');
    assert.deepStrictEqual(w[0], w[w.length - 1]); assert.deepStrictEqual(c[0], c[c.length - 1]);
    const stopLeg = w.find((p) => p.wait); assert.ok(stopLeg && Math.abs(stopLeg.x - T.STOP_POS.x) <= 3 && Math.abs(stopLeg.z - 8.2) < 1e-9);
    assert.ok(c.some((p) => p.z === 18 && p.x > 100));
  }
  assert.deepStrictEqual(T.tripPath(99, 'walk'), T.tripPath(0, 'walk'));
});
test('lot info: number, distance and minutes, and nothing for a bad lot', () => {
  const i = T.lotInfo(4); assert.deepStrictEqual([i.n, i.km === T.lotDistanceKm(4), i.grade], [5, true, 'ILLUSTRATIVE']);
  assert.ok(Math.abs(i.walkMin - i.km * T.ASSUME.walkMinKm.v) < 1e-12); assert.strictEqual(T.lotInfo(12), null); assert.strictEqual(T.lotInfo(-1), null);
});
test('panels: with a lot, the distance rows are illustrative and name the lot; without, the real figures are unchanged', () => {
  const withLot = Object.assign({}, T.DEFAULTS, { lot: 6 }), row = (k, i, r) => T.inspectInfo(k, i, { day: 2, hour: 10 }).rows.find((x) => x.k === r);
  assert.strictEqual(row('home', withLot, 'Your lot').v, 'Lot 7, ' + T.lotDistanceKm(6).toFixed(2) + ' km from the stop');
  assert.strictEqual(row('home', T.DEFAULTS, 'Your lot').v, 'not placed yet');
  assert.ok(row('stop', withLot, 'From your lot') && row('stop', withLot, 'From your lot').grade === 'ILLUSTRATIVE' && !row('stop', T.DEFAULTS, 'From your lot'));
  assert.strictEqual(row('stop', withLot, 'Distance from the township centre').grade, 'REAL');
  assert.deepStrictEqual([row('person', withLot, 'Distance each way').grade, row('person', T.DEFAULTS, 'Distance each way').grade], ['ILLUSTRATIVE', 'REAL']);
  assert.strictEqual(row('person', withLot, 'Walking time each way').v, (T.lotDistanceKm(6) * T.ASSUME.walkMinKm.v).toFixed(0) + ' min');
});
test('plot trees stand in the rear yard, clear of every building, whatever the lot and home type', () => {
  assert.strictEqual(T.PLOT_SLOTS.length, 10); assert.strictEqual(new Set(T.PLOT_SLOTS.map((s) => s.join(','))).size, 10);
  const R = 2.8;   // a tree's canopy radius as drawn
  for (const house of ['terrace', 'semid', 'condo']) for (let lot = 0; lot < 12; lot++) {
    const rects = T.buildingRects(lot, house);
    for (const s of T.PLOT_SLOTS) for (let r = 0; r < rects.length; r++) {
      const x = T.LOTS[lot][0] + s[0], z = T.LOTS[lot][1] + s[1], q = rects[r];
      const dx = Math.max(q.x0 - x, 0, x - q.x1), dz = Math.max(q.z0 - z, 0, z - q.z1);
      assert.ok(Math.hypot(dx, dz) > R, `a tree at slot ${s} of lot ${lot} (${house}) reaches lot ${r}'s building`);
    }
  }
});

// ---- condo levels ----
const condo = (o) => Object.assign({}, T.DEFAULTS, { house: 'condo', trees: 6, walkShare: 0.5 }, o);
const kwh = (o) => T.simulate(condo(o)).figures.monthKwh.value;
test('only a condo has a level: every other home gives the same month at any level', () => {
  for (const house of ['terrace', 'semid']) {
    const a = T.simulate(Object.assign({}, T.DEFAULTS, { house: house, level: 1, trees: 6 })).figures, b = T.simulate(Object.assign({}, T.DEFAULTS, { house: house, level: 8, trees: 6 })).figures;
    for (const k of Object.keys(a)) assert.strictEqual(a[k].value, b[k].value, house + ' ' + k);
  }
  assert.notStrictEqual(kwh({ level: 1 }), kwh({ level: 8 }));
});
test('plot trees shade only the lowest levels: level 1 benefits, level 4 and above do not', () => {
  const saving = (level) => kwh({ level: level, trees: 0 }) - kwh({ level: level, trees: 10 });
  assert.ok(saving(1) > saving(2) && saving(2) > saving(3) && saving(3) > 0);
  for (const l of [4, 5, 6, 7, 8]) assert.strictEqual(saving(l), 0, 'level ' + l);
});
test('only the top floor pays for the roof, by the stated factor on the air-con share', () => {
  assert.strictEqual(kwh({ level: 4, trees: 0 }), kwh({ level: 7, trees: 0 }));
  const top = kwh({ level: T.CONDO_LEVELS, trees: 0 }), below = kwh({ level: T.CONDO_LEVELS - 1, trees: 0 }), base = T.HOUSES.condo.baseKwhDay * 30;
  assert.ok(Math.abs((top - base) / (below - base) - (1 + T.ASSUME.roofHeat.v)) < 1e-9);
});
test('walking minutes grow with the level by exactly the lift time; trips, car cost and carbon do not move', () => {
  const f = (level) => T.simulate(condo({ level: level })).figures, walked = f(1).walkedTrips.value;
  for (let l = 1; l <= 8; l++) {
    const expect = walked * 2 * (T.ASSUME.stopKm.v * T.ASSUME.walkMinKm.v + T.ASSUME.liftMin.v + T.ASSUME.liftPerLevel.v * l);
    assert.ok(Math.abs(f(l).walkMin.value - expect) < 1e-9, 'level ' + l);
    assert.strictEqual(f(l).walkedTrips.value, walked); assert.strictEqual(f(l).carRm.value, f(1).carRm.value);
  }
  assert.ok(f(8).walkMin.value > f(1).walkMin.value);
});
test('a bad level is clamped to a real floor: nothing breaks and the answer is a floor between 1 and the top level', () => {
  assert.strictEqual(kwh({ level: 0 }), kwh({ level: 1 })); assert.strictEqual(kwh({ level: 999 }), kwh({ level: T.CONDO_LEVELS }));
  assert.strictEqual(kwh({ level: 2.6 }), kwh({ level: 3 }));
  for (const bad of [NaN, 'x', null, undefined, -4]) assert.ok(isFinite(kwh({ level: bad })) && kwh({ level: bad }) === kwh({ level: 1 }), String(bad));
  assert.strictEqual(T.CONDO_LEVELS, 35);   // the drawn tower; everything else reads this number
});
test('the level does not change who the neighbour is, and the neighbour comparison still centres on 50', () => {
  const s = T.scores(condo({ level: 8 })); assert.strictEqual(s.neighbour.figures.monthKwh.value, T.simulate(T.NEIGHBOUR).figures.monthKwh.value);
  const same = T.scores(Object.assign({}, T.NEIGHBOUR)); for (const i of [0, 2, 3]) assert.ok(Math.abs(same.pillars[i].score - 50) < 1e-9);
});
test('the home and walking panels show the level and the lift time for a condo, and not for a house', () => {
  const row = (i, k, r) => T.inspectInfo(k, i, { day: 2, hour: 10 }).rows.find((x) => x.k === r);
  assert.strictEqual(row(condo({ level: T.CONDO_LEVELS }), 'home', 'Level').v, 'level ' + T.CONDO_LEVELS + ' of ' + T.CONDO_LEVELS + ', under the roof'); assert.strictEqual(row(condo({ level: 3 }), 'home', 'Level').v, 'level 3 of ' + T.CONDO_LEVELS);
  assert.strictEqual(row(T.DEFAULTS, 'home', 'Level').v, 'ground (a house)');
  assert.strictEqual(row(condo({ level: 8 }), 'person', 'Lift or stairs, each way').v, (T.ASSUME.liftMin.v + T.ASSUME.liftPerLevel.v * 8).toFixed(1) + ' min');
  assert.strictEqual(row(condo({ level: 8 }), 'person', 'Lift or stairs, each way').grade, 'ILLUSTRATIVE'); assert.strictEqual(row(T.DEFAULTS, 'person', 'Lift or stairs, each way'), undefined);
});
test('every level assumption is stated as a placeholder with a note', () => {
  for (const k of ['roofHeat', 'shadeLevels', 'liftMin', 'liftPerLevel']) assert.deepStrictEqual([T.ASSUME[k].grade, T.ASSUME[k].note.length > 15], ['ILLUSTRATIVE', true], k);
});
test('suggestions do not offer trees to a condo above the shade line, and do for a low level', () => {
  const high = T.suggest(condo({ level: 6, trees: 0, acHours: 8, solarKwp: 8, walkShare: 1 }), 5).map((x) => x.key), low = T.suggest(condo({ level: 1, trees: 0, acHours: 8, solarKwp: 8, walkShare: 1 }), 5).map((x) => x.key);
  assert.ok(!high.includes('trees')); assert.ok(low.includes('trees'));
});

// ---- compare ----
const cmpA = Object.assign({}, T.DEFAULTS, { lot: 1, trees: 4 });
test('comparing a home with itself: every difference is zero, nothing is better, the labels agree', () => {
  const c = T.compare(cmpA, cmpA);
  assert.strictEqual(c.labelA, c.labelB);
  for (const r of c.rows) { assert.strictEqual(r.diff, 0, r.key); assert.strictEqual(r.better, null, r.key); assert.strictEqual(r.a, r.b); }
});
test('compare covers the electricity, carbon, car, distance and comfort rows, then every pillar, then the total; nothing is broken', () => {
  const c = T.compare(cmpA, Object.assign({}, cmpA, { lot: 5 }));
  assert.deepStrictEqual(c.rows.map((r) => r.key), ['monthKwh', 'monthBill', 'carbonKg', 'carRm', 'stopKm', 'comfortPct', 'pillar:energy', 'pillar:resilience', 'pillar:community', 'pillar:biodiversity', 'total']);
  for (const r of c.rows) { assert.ok(r.label && r.unit && Number.isFinite(r.a) && Number.isFinite(r.b) && Number.isFinite(r.diff), r.key); assert.strictEqual(c.row(r.key), r); }
});
test('a nearer lot wins on distance, car cost, carbon and the energy score, and leaves the electricity alone', () => {
  const near = T.nearestOtherLot(1), c = T.compare(cmpA, Object.assign({}, cmpA, { lot: near }));
  assert.ok(T.lotDistanceKm(near) < T.lotDistanceKm(1));
  for (const k of ['stopKm', 'carRm', 'carbonKg', 'pillar:energy']) assert.strictEqual(c.row(k).better, 'b', k);
  for (const k of ['monthKwh', 'monthBill']) assert.deepStrictEqual([c.row(k).diff, c.row(k).better], [0, null], k);
});
test('direction is right both ways: lower is better for use and distance, higher is better for scores and comfort', () => {
  const near = T.nearestOtherLot(1), forward = T.compare(cmpA, Object.assign({}, cmpA, { lot: near })), back = T.compare(Object.assign({}, cmpA, { lot: near }), cmpA);
  for (const r of forward.rows) {
    const x = back.row(r.key); assert.strictEqual(x.diff, r.diff === 0 ? 0 : -r.diff, r.key + ' diff flips');
    assert.strictEqual(x.better, r.better === 'a' ? 'b' : r.better === 'b' ? 'a' : null, r.key + ' winner flips');
  }
  assert.strictEqual(forward.row('total').better, forward.row('total').diff > 0 ? 'b' : forward.row('total').diff < 0 ? 'a' : null);
});
test('a condo against a terrace with the same habits: the smaller home uses less electricity and wins that row', () => {
  const c = T.compare(Object.assign({}, cmpA, { house: 'terrace' }), Object.assign({}, cmpA, { house: 'condo', level: 4 }));
  assert.ok(c.row('monthKwh').diff < 0 && c.row('monthKwh').better === 'b'); assert.ok(c.row('monthBill').better === 'b');
});
test('differences smaller than the shown precision count as a tie, never as a win', () => {
  const c = T.compare(cmpA, Object.assign({}, cmpA, { baseScale: 1.0004 }));
  assert.strictEqual(c.row('monthKwh').a, c.row('monthKwh').b); assert.strictEqual(c.row('monthKwh').better, null);
  const d = T.compare(cmpA, Object.assign({}, cmpA, { lot: 2 })), km = d.row('stopKm'); assert.strictEqual(km.dec, 2); assert.ok(Math.abs(km.diff - (km.b - km.a)) < 1e-9);
});
test('the labels say the home type, the floor of a condo, and whether a lot is placed', () => {
  assert.strictEqual(T.homeLabel({ house: 'terrace', lot: 5 }), 'Terrace house, lot 6'); assert.strictEqual(T.homeLabel({ house: 'condo', level: 8, lot: 0 }), 'Condominium, level 8, lot 1');
  assert.strictEqual(T.homeLabel({ house: 'semid' }), 'Semi-D house, lot not placed'); assert.strictEqual(T.homeLabel({ house: 'condo', level: 999, lot: 99 }), 'Condominium, level ' + T.CONDO_LEVELS + ', lot not placed');
  assert.ok(!/level/.test(T.homeLabel({ house: 'terrace', level: 5, lot: 2 })));
});
test('the nearest other lot is the nearest by distance, never the one you are on', () => {
  for (let ex = -1; ex < 12; ex++) {
    const n = T.nearestOtherLot(ex); assert.ok(T.validLot(n) && n !== ex);
    for (let i = 0; i < 12; i++) if (i !== ex) assert.ok(T.lotDistanceKm(n) <= T.lotDistanceKm(i) + 1e-12, `ex ${ex}: lot ${i} is nearer than ${n}`);
  }
  assert.strictEqual(T.nearestOtherLot(undefined), T.nearestOtherLot(-1));
});
test('grades travel with the rows: the distance is real with no lot and illustrative with one; the scores are placeholders', () => {
  const none = T.compare(T.DEFAULTS, Object.assign({}, T.DEFAULTS, { lot: 4 })).row('stopKm');
  assert.deepStrictEqual([none.gradeA, none.gradeB], ['REAL', 'ILLUSTRATIVE']);
  for (const r of T.compare(cmpA, cmpA).rows.filter((x) => x.key.startsWith('pillar') || x.key === 'total')) assert.deepStrictEqual([r.gradeA, r.gradeB], ['ILLUSTRATIVE', 'ILLUSTRATIVE']);
});
test('a home matched to a bill is graded REAL on electricity only on the side that still matches', () => {
  const c0 = T.calibrate(T.DEFAULTS, 700), billed = Object.assign({}, T.DEFAULTS, { baseScale: c0.baseScale, billKwh: 700 }), other = Object.assign({}, billed, { house: 'condo' });
  const r = T.compare(billed, other).row('monthKwh'); assert.deepStrictEqual([r.gradeA, r.gradeB], ['REAL', 'ILLUSTRATIVE']);
});

// ---- several changes at once ----
const KEYS = T.LEVERS.map((l) => l.key), HOMEM = Object.assign({}, T.DEFAULTS, { house: 'condo', level: 5, lot: 5, acHours: 8, setpoint: 25, trees: 3, nativeShare: 0.4, walkShare: 0.3 });
test('a set of changes is valid only if it is a non-empty list of known changes, each once', () => {
  for (const ok of [['acHours'], ['solarKwp', 'acHours'], KEYS]) assert.ok(T.validLeverSet(ok), ok.join());
  for (const bad of [[], ['acHours', 'acHours'], ['nonsense'], ['acHours', 'nonsense'], KEYS.concat('acHours'), 'acHours', null, undefined, {}, [1], [null]]) assert.ok(!T.validLeverSet(bad), JSON.stringify(bad));
});
test('applying several changes does the same as applying them one after another, in any order, without touching the input', () => {
  const before = JSON.stringify(HOMEM), seq = T.applyLever(T.applyLever(HOMEM, T.LEVERS.find((l) => l.key === 'acHours')), T.LEVERS.find((l) => l.key === 'solarKwp'));
  assert.deepStrictEqual(T.applyLevers(HOMEM, ['solarKwp', 'acHours']), seq); assert.deepStrictEqual(T.applyLevers(HOMEM, ['acHours', 'solarKwp']), seq); assert.strictEqual(JSON.stringify(HOMEM), before);
  assert.deepStrictEqual(T.applyLevers(HOMEM, []), HOMEM);
});
test('one change combined equals the single effect, exactly', () => {
  for (const k of KEYS) { const c = T.combinedEffect(HOMEM, [k]), e = A_leverEffect(k); assert.ok(Math.abs(c.carbonSaved - e.carbonKg) < 1e-9 && Math.abs(c.rmSaved - e.rm) < 1e-9 && Math.abs(c.comfortDrop - e.comfortDrop) < 1e-9, k); assert.ok(Math.abs(c.additiveCarbon - c.carbonSaved) < 1e-9, 'with one change the sum is the effect'); }
});
function A_leverEffect(key) { const lv = T.LEVERS.find((l) => l.key === key), b = T.simulate(HOMEM).figures, f = T.simulate(T.applyLever(HOMEM, lv)).figures; return { carbonKg: b.carbonKg.value - f.carbonKg.value, rm: (b.monthBill.value + b.carRm.value) - (f.monthBill.value + f.carRm.value), comfortDrop: b.comfortPct.value - f.comfortPct.value }; }
test('solar and less air-con overlap: together they save less than the sum, which is exactly the mistake adding them by hand makes', () => {
  const c = T.combinedEffect(HOMEM, ['solarKwp', 'acHours']);
  assert.ok(c.carbonSaved < c.additiveCarbon - 1 && c.rmSaved < c.additiveRm - 1, `${c.carbonSaved} vs ${c.additiveCarbon}`);
  assert.deepStrictEqual([Math.round(c.runBefore), Math.round(c.runAfter), Math.round(c.carbonBefore), Math.round(c.carbonAfter)], [167, 91, 271, 144], 'pinned to the model under the July 2025 tariff and the 0.740 grid factor; adding the two single effects by hand would give RM ' + Math.round(c.additiveRm) + ' and ' + Math.round(c.additiveCarbon) + ' kg, the model gives RM ' + Math.round(c.rmSaved) + ' and ' + Math.round(c.carbonSaved) + ' kg');
});
test('the combined effect is the model run on the combined home, before and after, including the score', () => {
  const c = T.combinedEffect(HOMEM, ['trees', 'walkShare', 'setpoint']), b = T.simulate(HOMEM).figures, a = T.simulate(T.applyLevers(HOMEM, ['trees', 'walkShare', 'setpoint'])).figures;
  assert.ok(Math.abs(c.carbonBefore - b.carbonKg.value) < 1e-9 && Math.abs(c.carbonAfter - a.carbonKg.value) < 1e-9 && Math.abs(c.runAfter - (a.monthBill.value + a.carRm.value)) < 1e-9);
  assert.ok(Math.abs(c.scoreBefore - T.scores(HOMEM).total) < 1e-9 && Math.abs(c.scoreAfter - T.scores(c.after).total) < 1e-9);
});
test('the changes come back in the model\'s own order whatever order they were given', () => {
  assert.deepStrictEqual(T.combinedEffect(HOMEM, ['solarKwp', 'trees', 'acHours']).keys, KEYS.filter((k) => ['solarKwp', 'trees', 'acHours'].includes(k)));
  assert.strictEqual(T.combinedEffect(HOMEM, ['nonsense']), null); assert.strictEqual(T.combinedEffect(HOMEM, []), null); assert.strictEqual(T.combinedEffect(HOMEM, ['acHours', 'acHours']), null);
});
test('making every change never saves less carbon than the best single change', () => {
  const all = T.combinedEffect(HOMEM, KEYS), best = Math.max(...KEYS.map((k) => T.combinedEffect(HOMEM, [k]).carbonSaved)); assert.ok(all.carbonSaved >= best - 1e-9);
});

// ---- the sourced figures: the tariff, the grid factor, and the rule that a grade above ILLUSTRATIVE needs a citation ----
test('the bill follows the July 2025 structure: energy + capacity + network per kWh, RM 10 a month above 600 kWh, a higher energy rate above 1,500 kWh', () => {
  const per = 0.2703 + 0.0455 + 0.1285, close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, m + ': ' + a + ' vs ' + b);
  close(T.bill(0), 0, 'nothing used'); close(T.bill(100), 100 * per, '100 kWh'); close(T.bill(600), 600 * per, '600 kWh: no retail charge at or below 600');
  close(T.bill(601), 601 * per + 10, '601 kWh: the retail charge starts'); close(T.bill(1000), 1000 * per + 10, '1,000 kWh'); close(T.bill(1500), 1500 * per + 10, '1,500 kWh');
  close(T.bill(2000), 1500 * 0.2703 + 500 * 0.3703 + 2000 * (0.0455 + 0.1285) + 10, '2,000 kWh: the higher energy rate applies to the excess');
  assert.ok(T.bill(601) - T.bill(600) > 9.9 && T.bill(601) - T.bill(600) < 10.6, 'the only jump is the retail charge');
  for (let k = 1; k <= 3000; k++) assert.ok(T.bill(k) >= T.bill(k - 1), 'never falls at ' + k);
});
test('the assumptions table quotes the tariff the bill actually uses, and the grid factor the carbon actually uses', () => {
  assert.ok(Math.abs(T.ASSUME.tariff.v - (T.TARIFF.energy[0][1] + T.TARIFF.capacity + T.TARIFF.network)) < 1e-12);
  assert.strictEqual(T.ASSUME.gridKgKwh.v, 0.74); assert.strictEqual(T.ASSUME.gridKgKwh.grade, 'SOURCED'); assert.strictEqual(T.ASSUME.tariff.grade, 'SOURCED');
  // with every short trip walked there are no car trips left, so the carbon is the electricity alone, at exactly 0.74 kg per kWh
  const b = T.simulate({ house: 'terrace', walkShare: 1 }).figures, a = T.simulate({ house: 'terrace', walkShare: 0 }).figures;
  assert.ok(Math.abs(b.carbonKg.value - b.monthKwh.value * 0.74) < 1e-6, 'carbon ' + b.carbonKg.value + ' vs ' + b.monthKwh.value * 0.74);
  assert.ok(a.carbonKg.value > a.monthKwh.value * 0.74 + 1, 'and with no walking, the car adds to it');
});
test('SOURCES: a figure graded REAL or SOURCED has a citation, a placeholder has none, and a secondary source can never make a figure REAL', () => {
  const entries = Object.entries(T.ASSUME);
  entries.forEach(([k, a]) => {
    const s = T.SOURCES[k];
    if (a.grade === 'ILLUSTRATIVE') return assert.ok(!s, k + ' is a placeholder and must not carry a citation');
    assert.ok(s && s.title && s.publisher && typeof s.caveat === 'string' && s.caveat.length > 10, k + ' is graded ' + a.grade + ' and needs a citation with its caveat');
    assert.ok(['primary', 'secondary', 'carried'].includes(s.read), k + ': read is primary, secondary or carried');
    if (s.read === 'primary' || s.read === 'secondary') assert.ok(s.url && /^https:\/\//.test(s.url) && /^\d{4}-\d\d-\d\d$/.test(s.checked), k + ': something we read has a link and the date we read it');
    if (s.read === 'carried') assert.strictEqual(s.checked, null, k + ': a carried source has not been re-checked');
    if (s.read === 'secondary') assert.notStrictEqual(a.grade, 'REAL', k + ': a report of a source cannot make a figure REAL');
  });
  Object.keys(T.SOURCES).forEach((k) => assert.ok(T.ASSUME[k], k + ' is cited but is not an assumption'));
  Object.values(T.SOURCES).forEach((s) => assert.ok(!/re-checked/.test(s.caveat), 'the caveat says something the status line does not'));
  assert.strictEqual(T.SOURCES.tariff.read, 'secondary'); assert.strictEqual(T.SOURCES.gridKgKwh.read, 'primary');
  assert.ok(/left out/.test(T.SOURCES.tariff.caveat) && /not found in the Energy Commission or TNB schedule/.test(T.SOURCES.tariff.caveat), 'the tariff says what it does not cover and where it was not confirmed');
});
