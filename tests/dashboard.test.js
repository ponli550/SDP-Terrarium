const test = require('node:test');
const assert = require('node:assert');
const T = require('../site/logic.js');
const D = require('../site/dashboard.js');

const HOME = Object.freeze({ house: 'condo', level: 12, acHours: 8, setpoint: 24, solarKwp: 2, walkShare: 0.3, trees: 3, nativeShare: 0.4, lot: 3, baseScale: 1 });   // frozen: the dashboard runs in strict mode, so any write to its input throws
const dash = (o) => D.dashboard(T, Object.assign({}, HOME, o));
const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, (m || '') + ' ' + a + ' vs ' + b);

test('the headline is the model\'s own figures against the neighbour, with the percentage worked out from them', () => {
  const d = dash(), S = T.scores(HOME);
  assert.deepStrictEqual(d.headline.map((h) => h.key), ['monthKwh', 'monthBill', 'carbonKg']);
  d.headline.forEach((h) => {
    close(h.you, S.you.figures[h.key].value, h.key); close(h.nb, S.neighbour.figures[h.key].value, h.key);
    close(h.deltaPct, (h.you - h.nb) / h.nb * 100, h.key); assert.strictEqual(h.better, h.you < h.nb); assert.strictEqual(h.grade, S.you.figures[h.key].grade);
  });
});

test('four pillars in the model\'s order, with the model\'s scores, and each driven by the figure the formula uses', () => {
  const d = dash(), S = T.scores(HOME);
  assert.deepStrictEqual(d.pillars.map((p) => p.key), ['energy', 'resilience', 'community', 'biodiversity']);
  d.pillars.forEach((p, i) => { close(p.score, S.pillars[i].score, p.key); assert.strictEqual(p.name, S.pillars[i].name); assert.strictEqual(p.formula, S.pillars[i].formula); });
  const fig = { energy: 'carbonKg', resilience: 'comfortPct', community: 'walkedTrips', biodiversity: 'bioIndex' };
  d.pillars.forEach((p) => { close(p.driver.you, S.you.figures[fig[p.key]].value, p.key); close(p.driver.nb, S.neighbour.figures[fig[p.key]].value, p.key); assert.strictEqual(p.driver.grade, S.you.figures[fig[p.key]].grade); });
  close(d.total, S.total, 'total');
});

test('the neighbour baseline is 50 on three pillars and its own comfort share on resilience; the delta and the cap are worked out from it', () => {
  const d = dash(), S = T.scores(HOME);
  d.pillars.forEach((p) => { close(p.nbScore, p.key === 'resilience' ? Math.min(100, Math.max(0, S.neighbour.figures.comfortPct.value)) : 50, p.key); close(p.vsNeighbour, p.score - p.nbScore, p.key); assert.strictEqual(p.capped, p.score >= 100); });
  assert.ok(d.pillars.some((p) => p.capped), 'the sample home has a capped pillar, so the cap flag is exercised');
});

test('a driver is "better" in the direction that pillar rewards: less carbon, more of the rest', () => {
  const d = dash({ solarKwp: 0, acHours: 12, trees: 0, walkShare: 0 });
  const by = Object.fromEntries(d.pillars.map((p) => [p.key, p.driver]));
  assert.strictEqual(by.energy.better, by.energy.you < by.energy.nb); assert.strictEqual(by.energy.dir, 'lower');
  ['resilience', 'community', 'biodiversity'].forEach((k) => { assert.strictEqual(by[k].dir, 'higher'); assert.strictEqual(by[k].better, by[k].you > by[k].nb); });
  assert.strictEqual(by.community.better, false); assert.strictEqual(by.biodiversity.better, false);
});

test('the month: thirty days, grid = use minus solar, they add up to the month, the neighbour is the model\'s neighbour, heat days are the model\'s', () => {
  const d = dash({ hotWeek: true }), S = T.scores(Object.assign({}, HOME, { hotWeek: true }));
  assert.strictEqual(d.days.length, 30);
  d.days.forEach((x, i) => { close(x.grid, x.use - x.solar, 'day ' + x.day); close(x.nbGrid, S.neighbour.days[i].netKwh, 'nb ' + x.day); assert.strictEqual(x.heat, T.weatherAt(x.day, 12, Object.assign({}, HOME, { hotWeek: true })).heat); assert.strictEqual(x.day, i + 1); });
  close(d.days.reduce((a, x) => a + x.grid, 0), S.you.figures.monthKwh.value, 'month');
  assert.deepStrictEqual(d.days.filter((x) => x.heat).map((x) => x.day), [10, 11, 12, 13, 14, 15, 16]);
  assert.strictEqual(dash().days.filter((x) => x.heat).length, 0);
});

test('every change the model offers is listed with its own effect, and everything suggest() proposes is among the helpful ones with the same numbers', () => {
  const d = dash();
  assert.deepStrictEqual(d.levers.map((l) => l.key).sort(), T.LEVERS.map((l) => l.key).sort());
  const sug = T.suggest(HOME, 5);
  assert.ok(sug.length >= 1, 'the sample home has changes suggest() would propose');
  sug.forEach((s) => { const l = d.levers.find((x) => x.key === s.key); close(l.carbonKg, s.carbonKg, s.key); close(l.rm, s.rm, s.key); close(l.comfortDrop, s.comfortDrop, s.key); assert.ok(l.helps, s.key + ' helps'); });
});

test('a change that only lifts the score still helps: trees add biodiversity but, above the shaded floors, no carbon', () => {
  const d = dash(), trees = d.levers.find((l) => l.key === 'trees');
  assert.ok(Math.abs(trees.carbonKg) < 0.5 && trees.scoreGain >= 0.5, 'trees: score ' + trees.scoreGain + ', carbon ' + trees.carbonKg);
  assert.ok(trees.helps, 'so it is offered');
  assert.ok(!T.suggest(HOME, 5).some((s) => s.key === 'trees'), 'suggest() looks at carbon alone and misses it, which is why the dashboard has its own rule');
});

test('levers are ranked: helpful first, then by score gained, then by carbon saved; one that costs comfort or changes nothing is never helpful', () => {
  const d = dash();
  const helpful = d.levers.filter((l) => l.helps), rest = d.levers.filter((l) => !l.helps);
  assert.deepStrictEqual(d.levers.map((l) => l.key), helpful.concat(rest).map((l) => l.key));
  for (let i = 1; i < helpful.length; i++) { const a = helpful[i - 1], b = helpful[i]; assert.ok(a.scoreGain > b.scoreGain || (a.scoreGain === b.scoreGain && a.carbonKg >= b.carbonKg), a.key + ' before ' + b.key); }
  const maxed = dash({ acHours: 0, setpoint: 28, walkShare: 1, trees: 10, solarKwp: 8 });
  assert.ok(maxed.levers.filter((l) => ['acHours', 'setpoint', 'walkShare', 'trees', 'solarKwp'].includes(l.key)).every((l) => l.unchanged && !l.helps), 'a home already at every limit has nothing left to change');
  const hot = dash({ acHours: 12, setpoint: 28 }); hot.levers.forEach((l) => { if (l.comfortDrop > 5) assert.ok(!l.helps, l.key + ' costs comfort'); });
  const costly = dash().levers.find((l) => l.key === 'setpoint'); assert.ok(costly.comfortDrop > 0 && !costly.unchanged, 'the setpoint change on the sample home costs some comfort');
});

test('over 120 different homes: a helpful change never costs more than 5 comfort points, helpful ones always come first, and equal scores are ordered by carbon', () => {
  let costly = 0, scoreOnly = 0, homes = 0;
  [0, 2, 6, 10, 12].forEach((acHours) => [22, 24, 27].forEach((setpoint) => [0, 3].forEach((solarKwp) => [false, true].forEach((hotWeek) => [0, 5].forEach((trees) => {
    const d = dash({ acHours, setpoint, solarKwp, hotWeek, trees }); homes++;
    d.levers.forEach((l) => { if (l.helps) { assert.ok(l.comfortDrop <= 5 && !l.unchanged, l.key + ' helps but ' + (l.unchanged ? 'is unchanged' : 'costs ' + l.comfortDrop)); } else if (l.comfortDrop > 5) costly++; if (l.helps && Math.abs(l.carbonKg) < 0.5 && l.scoreGain >= 0.5) scoreOnly++; });
    const flags = d.levers.map((l) => l.helps), firstUnhelpful = flags.indexOf(false); if (firstUnhelpful >= 0) assert.ok(flags.slice(firstUnhelpful).every((x) => !x), 'helpful changes come before the others');
    const helpful = d.levers.filter((l) => l.helps);
    for (let i = 1; i < helpful.length; i++) { const a = helpful[i - 1], b = helpful[i]; assert.ok(a.scoreGain >= b.scoreGain - 1e-12, 'by score'); if (Math.abs(a.scoreGain - b.scoreGain) < 1e-12) assert.ok(a.carbonKg >= b.carbonKg - 1e-12, 'a tie in score is ordered by carbon'); }
  })))));
  assert.strictEqual(homes, 120); assert.ok(costly > 0, 'some change costs more than 5 comfort points somewhere on the grid'); assert.ok(scoreOnly > 0, 'a score-only change occurs');
});

test('when the score cannot tell the changes apart (it is capped), they are ordered by carbon saved', () => {
  // every change now moves the score by exactly 0, and the changes are listed worst-first, so only an explicit carbon order can put them right
  const flat = Object.assign({}, T, { scores: (i) => Object.assign({}, T.scores(i), { total: 50 }), LEVERS: T.LEVERS.slice().reverse() });
  const d = D.dashboard(flat, HOME), helpful = d.levers.filter((l) => l.helps);
  assert.ok(helpful.length >= 2 && helpful.every((l) => l.scoreGain === 0), 'at least two changes tie on score');
  for (let i = 1; i < helpful.length; i++) assert.ok(helpful[i - 1].carbonKg >= helpful[i].carbonKg, helpful[i - 1].key + ' saves at least as much carbon as ' + helpful[i].key);
  assert.ok(helpful[0].carbonKg > helpful[helpful.length - 1].carbonKg, 'and they really differ, so the order is not an accident');
});

test('a lever\'s score gain is the model\'s score after the change minus the score before', () => {
  const d = dash();
  d.levers.forEach((l) => { const lv = T.LEVERS.find((x) => x.key === l.key); close(l.scoreGain, T.scores(T.applyLever(HOME, lv)).total - T.scores(HOME).total, l.key); });
});

test('only a condo has a floor profile: every level, the model\'s numbers for that level, exactly one selected', () => {
  const d = dash();
  assert.strictEqual(d.floors.length, T.CONDO_LEVELS);
  d.floors.forEach((f, i) => { assert.strictEqual(f.level, i + 1); const g = T.simulate(Object.assign({}, HOME, { level: f.level })).figures; close(f.kwh, g.monthKwh.value, 'kwh ' + f.level); close(f.carbonKg, g.carbonKg.value, 'carbon ' + f.level); close(f.walkMin, g.walkMin.value, 'walk ' + f.level); });
  assert.deepStrictEqual(d.floors.filter((f) => f.selected).map((f) => f.level), [12]);
  close(d.floors[11].kwh, d.headline[0].you, 'the selected floor is the headline home');
  ['terrace', 'semid'].forEach((h) => assert.strictEqual(dash({ house: h }).floors, null, h));
});

test('the floor profile shows the model\'s floor rules: the lowest floors are shaded, the top floor is hotter, the middle is flat', () => {
  const f = dash({ trees: 6 }).floors, top = T.CONDO_LEVELS;
  assert.ok(f[0].kwh < f[10].kwh, 'level 1 is shaded by the plot trees'); assert.ok(f[top - 1].kwh > f[top - 2].kwh, 'the roof floor runs hotter');
  assert.ok(Math.abs(f[10].kwh - f[20].kwh) < 1e-9, 'floors 11 and 21 are alike');
  assert.ok(f[top - 1].walkMin > f[0].walkMin, 'a higher floor means a longer lift');
});

test('an out-of-range level is read as the model reads it, and the selected floor follows', () => {
  assert.deepStrictEqual(dash({ level: 99 }).floors.filter((f) => f.selected).map((f) => f.level), [T.CONDO_LEVELS]);
  assert.deepStrictEqual(dash({ level: 0 }).floors.filter((f) => f.selected).map((f) => f.level), [1]);
});

test('grades are counted from the model: the counts add up to the figures, and the page can say how few are real', () => {
  const d = dash(), S = T.scores(HOME), all = Object.values(S.you.figures);
  assert.strictEqual(d.gradeCounts.REAL + d.gradeCounts.SOURCED + d.gradeCounts.ILLUSTRATIVE, all.length); assert.strictEqual(d.figureCount, all.length);
  ['REAL', 'SOURCED', 'ILLUSTRATIVE'].forEach((g) => assert.strictEqual(d.gradeCounts[g], all.filter((x) => x.grade === g).length, g));
  assert.ok(d.gradeCounts.ILLUSTRATIVE > d.gradeCounts.REAL, 'most figures are placeholders and the data says so');
});

test('the dashboard counts REAL figures when the model grades one REAL (a home at the real distance to the stop)', () => {
  const d = dash({ lot: undefined }), S = T.scores(Object.assign({}, HOME, { lot: undefined })), real = Object.values(S.you.figures).filter((x) => x.grade === 'REAL').length;
  assert.ok(real >= 1, 'the model grades the real stop distance REAL'); assert.strictEqual(d.gradeCounts.REAL, real); assert.strictEqual(d.gradeCounts.REAL + d.gradeCounts.SOURCED + d.gradeCounts.ILLUSTRATIVE, d.figureCount);
});

test('the summary sentence states the home\'s own total, and says all four tie only when they do', () => {
  const d = dash(); assert.ok(d.sentence.includes('It scores ' + Math.round(d.total) + ' out of 100.'), d.sentence);
  const tie = (score) => Object.assign({}, T, { scores: (i) => { const r = T.scores(i); return Object.assign({}, r, { pillars: r.pillars.map((p) => Object.assign({}, p, { score })), total: score }); } });
  const t = D.dashboard(tie(70), HOME); assert.ok(t.sentence.includes('All four pillars score 70.') && !/Strongest/.test(t.sentence), t.sentence);
  assert.ok(/Strongest/.test(d.sentence) && !/All four pillars/.test(d.sentence), 'no tie, so strongest and weakest are named');
});

test('the summary sentence uses only numbers that are in the data', () => {
  [HOME, Object.assign({}, HOME, { solarKwp: 0, acHours: 12 }), Object.assign({}, HOME, { house: 'terrace' }), Object.assign({}, HOME, { trees: 0, walkShare: 0, solarKwp: 0 })].forEach((inp) => {
    const d = D.dashboard(T, inp), nums = (d.sentence.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const allowed = new Set([Math.round(d.headline[0].you), Math.round(d.headline[0].nb), Math.round(Math.abs(d.headline[0].deltaPct)), Math.round(d.total), 100].concat(d.pillars.map((p) => Math.round(p.score))));
    nums.forEach((x) => assert.ok(allowed.has(x), 'the number ' + x + ' in "' + d.sentence + '" is not in the data'));
    assert.ok(d.sentence.includes(Math.round(d.headline[0].you) + ' kWh') && d.sentence.includes('out of 100'));
  });
});

test('the summary says less, more or about the same by the model\'s own comparison, and names the strongest and weakest pillar', () => {
  const less = dash({ solarKwp: 4, acHours: 2 }), more = dash({ house: 'semid', acHours: 12, solarKwp: 0 });
  assert.ok(/\d+% less than/.test(less.sentence) && less.headline[0].better); assert.ok(/\d+% more than/.test(more.sentence) && !more.headline[0].better);
  const same = D.dashboard(T, Object.assign({}, T.NEIGHBOUR)); assert.ok(/about the same as/.test(same.sentence), same.sentence);
  const d = dash(), sc = d.pillars.map((p) => p.score); const top = Math.max(...sc), low = Math.min(...sc);
  d.pillars.filter((p) => p.score === top).forEach((p) => assert.ok(d.sentence.includes(p.name), 'strongest ' + p.name)); d.pillars.filter((p) => p.score === low).forEach((p) => assert.ok(d.sentence.includes(p.name), 'weakest ' + p.name));
  assert.ok(/All four pillars score 50\./.test(same.sentence) === (new Set(same.pillars.map((p) => Math.round(p.score))).size === 1), 'the all-equal wording is used exactly when all pillars tie');
});

test('it never changes what it is given, and the same home always gives the same dashboard', () => {
  const weekly = [{ acHours: 6 }, { acHours: 6 }, { acHours: 6 }, { acHours: 6 }].map((w) => Object.freeze(Object.assign({ setpoint: 25, walkShare: 0.2 }, w)));
  const inp = Object.freeze(Object.assign({}, HOME, { weekly: Object.freeze(weekly) })), before = JSON.stringify(inp);
  const a = D.dashboard(T, inp), b = D.dashboard(T, inp);
  assert.strictEqual(JSON.stringify(inp), before); assert.deepStrictEqual(a, b);
});

test('the caveats are always there: placeholders, a fixed neighbour, mock weather', () => {
  const c = dash().caveats.join(' ');
  assert.ok(/placeholders/.test(c) && /neighbour is one fixed/.test(c) && /mock/.test(c));
});
