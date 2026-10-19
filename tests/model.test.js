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
