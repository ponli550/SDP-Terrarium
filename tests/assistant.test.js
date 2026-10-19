const test = require('node:test');
const assert = require('node:assert');
const T = require('../site/logic.js');
const A = require('../site/assistant.js');

const ctxOf = (o) => ({ input: Object.assign({}, T.DEFAULTS, o || {}) });
const fresh = () => ctxOf({ acHours: 10, setpoint: 22, walkShare: 0, trees: 0 });  // a home with obvious changes to make
const say = (q, c) => A.ask(q, c || fresh());
const words = (r) => r.text.map(A.render).join(' ');

test('every example question is answered and passes the check', () => {
  for (const q of A.EXAMPLES) { const r = say(q); assert.ok(!r.withheld, q + ' -> ' + (r.problems || []).join('; ')); assert.ok(r.checked > 0, q); assert.ok(!/[⦃⦄⟦⟧]/.test(words(r)), 'no raw markers: ' + q); }
});
test('the briefing figures equal the model, rounded', () => {
  const c = fresh(), S = T.scores(c.input), f = S.you.figures, t = words(say('Give me the briefing', c));
  assert.ok(t.includes(Math.round(f.monthKwh.value) + ' kWh'));
  assert.ok(t.includes('RM ' + Math.round(f.monthBill.value)));
  assert.ok(t.includes(Math.round(f.carbonKg.value) + ' kg'));
  assert.ok(t.includes('You score ' + Math.round(S.total)));
});
test('an unknown question is refused with no claims', () => {
  const r = say('what is the weather on mars'); assert.strictEqual(r.intent, null); assert.strictEqual(r.claims.length, 0); assert.ok(r.text[0].includes('no way to answer'));
});
test('a what-if equals the direct difference between two simulations', () => {
  const c = fresh(), e = A.leverEffect(c.input, 'acHours');
  const b = T.simulate(c.input).figures, n = T.simulate(Object.assign({}, c.input, { acHours: c.input.acHours - 2 })).figures;
  assert.ok(Math.abs(e.carbonKg - (b.carbonKg.value - n.carbonKg.value)) < 1e-9);
  assert.ok(words(say('what if I run the air-con 2 hours less?', c)).includes('carbon falls by about ' + Math.round(e.carbonKg) + ' kg'));
});
test('the suggestion card matches the top suggestion', () => {
  const c = fresh(), r = say('what should I change first?', c), top = T.suggest(c.input, 1)[0];
  assert.strictEqual(r.cards.find((x) => x.type === 'confirm').lever, top.key);
});
test('where_from reports the true grade: REAL for the stop, ILLUSTRATIVE for the carbon factor', () => {
  assert.ok(words(say('how far is the bus stop?')).includes('Grade: REAL'));
  assert.ok(words(say('where does the carbon number come from?')).includes('Grade: ILLUSTRATIVE'));
});
test('answers are deterministic', () => { assert.deepStrictEqual(say('give me the briefing'), say('give me the briefing')); });

// ---- the verifier must catch what a careless producer would do ----
const bad = (produce) => A.ask('x', fresh(), produce);
const base = (text, claims, extra) => Object.assign({ intent: 'x', text: text, claims: claims || [], cards: [], calls: [] }, extra || {});
const f = (i, s) => A.fg(i, s);

test('verifier: a false claim is withheld', () => {
  const r = bad(() => base(['The bill is ' + f(0, '5') + '.'], [{ kind: 'figure', key: 'monthBill', value: 5 }]));
  assert.ok(r.withheld && r.problems.some((p) => /not supported/.test(p)));
});
test('verifier: a true claim carrying a different figure is withheld', () => {
  const c = fresh(), real = Math.round(T.simulate(c.input).figures.monthBill.value);
  const r = A.ask('x', c, () => base(['The bill is ' + f(0, String(real + 40)) + '.'], [{ kind: 'figure', key: 'monthBill', value: real }]));
  assert.ok(r.withheld && r.problems.some((p) => /not a value claim/.test(p)));
});
test('verifier: a number outside any marker is withheld, even if some claim holds it', () => {
  const c = fresh(), real = Math.round(T.simulate(c.input).figures.monthBill.value);
  const r = A.ask('x', c, () => base(['The bill is ' + real + ' and ' + f(0, String(real)) + '.'], [{ kind: 'figure', key: 'monthBill', value: real }]));
  assert.ok(r.withheld && r.problems.some((p) => /not tied to any claim/.test(p)));
});
test('verifier: a marker citing a claim that does not exist is withheld', () => {
  assert.ok(bad(() => base(['x ' + f(3, '9')], [])).withheld);
});
test('verifier: free text with a made-up number (as a careless model would write) is withheld', () => {
  const r = bad(() => base(['Your home will save 35% on electricity if you plant trees.']));
  assert.ok(r.withheld && r.text[0].includes('withheld'));
});
test('verifier: an unknown tool call and unexpected arguments are withheld', () => {
  assert.ok(bad(() => base(['ok'], [], { calls: [{ tool: 'delete_everything', args: {} }] })).withheld);
  assert.ok(bad(() => base(['ok'], [], { calls: [{ tool: 'briefing', args: { rm: 1 } }] })).withheld);
  assert.ok(bad(() => base(['ok'], [], { calls: [{ tool: 'what_if', args: { lever: 'nonsense' } }] })).withheld);
});
test('verifier: an unknown name is withheld', () => {
  assert.ok(bad(() => base(['See ' + '⟦Secret Pillar⟧'])).withheld);
});
test('verifier: a confirm card without a verified change claim is withheld', () => {
  assert.ok(bad(() => base(['ok'], [], { cards: [{ type: 'confirm', lever: 'acHours' }] })).withheld);
  assert.ok(bad(() => base(['ok'], [{ kind: 'change', lever: 'trees' }], { cards: [{ type: 'confirm', lever: 'acHours' }] })).withheld);
  assert.ok(!bad(() => base(['ok'], [{ kind: 'change', lever: 'acHours' }], { cards: [{ type: 'confirm', lever: 'acHours' }] })).withheld);
});
test('verifier: an unknown card type is withheld', () => { assert.ok(bad(() => base(['ok'], [], { cards: [{ type: 'script' }] })).withheld); });
test('verifier: a claim of an unknown kind is withheld', () => { assert.ok(bad(() => base([f(0, '1')], [{ kind: 'magic', value: 1 }])).withheld); });
test('verifier: a good hand-written answer passes, so the check is not just rejecting everything', () => {
  const c = fresh(), real = Math.round(T.simulate(c.input).figures.monthBill.value);
  const r = A.ask('x', c, () => base(['The bill is ' + f(0, String(real)) + '.'], [{ kind: 'figure', key: 'monthBill', value: real }]));
  assert.ok(!r.withheld && r.checked === 1);
});
test('the only write tool proposes: it never changes the input it was given', () => {
  const c = fresh(), before = JSON.stringify(c.input);
  say('apply that', c); say('what should I change first?', c);
  assert.strictEqual(JSON.stringify(c.input), before);
  assert.deepStrictEqual(A.TOOL_SCHEMA().filter((t) => t.kind === 'write').map((t) => t.name), ['propose_change']);
});
test('a game input (weekly choices, heat, rain) is answered and verified too', () => {
  const g = T.newGame({}); let x = g; for (let i = 0; i < 4; i++) x = T.play(x, { acHours: 7, setpoint: 25, walkShare: 0.6 });
  const r = A.ask('give me the briefing', { input: T.gameInput(x) }); assert.ok(!r.withheld && r.checked > 0);
});
test('verifier: a lever claim with a false value is withheld, and a true one passes', () => {
  const c = fresh(), e = A.leverEffect(c.input, 'acHours'), real = Math.round(e.carbonKg);
  const mk = (v) => () => base(['It saves ' + f(0, String(v)) + ' kg.'], [{ kind: 'lever', lever: 'acHours', field: 'carbonKg', value: v }]);
  assert.ok(A.ask('x', c, mk(real + 50)).withheld);
  assert.ok(!A.ask('x', c, mk(real)).withheld);
});
test('each grade carries its own explanation: public data, published source, placeholder', () => {
  const stop = words(say('how far is the bus stop?')), carbon = words(say('where does the carbon number come from?'));
  assert.ok(stop.includes('Grade: REAL') && stop.includes('public data') && !stop.includes('placeholder'));
  assert.ok(carbon.includes('Grade: ILLUSTRATIVE') && carbon.includes('placeholder') && !carbon.includes('public data'));
  const sourced = A.ask('x', fresh(), () => A.answerQuestion('x', fresh(), () => ({ intent: 's', calls: [{ tool: 'where_from', args: { name: 'nudgeCap' } }] })));
  assert.ok(!sourced.withheld && words(sourced).includes('Grade: SOURCED') && words(sourced).includes('published source'));
});
test('verifier: a bare claim of an unknown kind is withheld even with no figure in the text', () => {
  const r = bad(() => base(['Nothing numeric here.'], [{ kind: 'magic', value: 1 }]));
  assert.ok(r.withheld && r.problems.some((p) => /not supported/.test(p)));
});
test('after a bill is matched, the briefing says so and keeps the other figures illustrative; the answer still verifies', () => {
  const input = Object.assign({}, T.DEFAULTS), c = T.calibrate(input, 700), billed = { input: Object.assign({}, input, { baseScale: c.baseScale, billKwh: 700 }) };
  const r = A.ask('give me the briefing', billed), t = words(r);
  assert.ok(!r.withheld && t.includes('This month your home uses 700 kWh') && t.includes('matched to your own bill') && !t.includes('illustrative until a real home'));
  const plain = words(A.ask('give me the briefing', { input: input })); assert.ok(plain.includes('illustrative until a real home') && !plain.includes('matched to your own bill'));
});
test('with a lot placed, the stop answer adds that lot\'s own distance, graded illustrative, and still verifies', () => {
  const withLot = { input: Object.assign({}, T.DEFAULTS, { lot: 5 }) }, r = A.ask('how far is the bus stop?', withLot), t = words(r), li = T.lotInfo(5);
  assert.ok(!r.withheld && t.includes('Grade: REAL') && t.includes('From your lot, lot 6, it is about ' + Math.round(li.km * 100) / 100 + ' km') && /drawing/.test(t) && /illustrative/.test(t));
  assert.ok(!words(A.ask('how far is the bus stop?', { input: Object.assign({}, T.DEFAULTS) })).includes('From your lot'));
});
test('verifier: a lot claim with a false number is withheld, a true one passes', () => {
  const c = { input: Object.assign({}, T.DEFAULTS, { lot: 5 }) }, li = T.lotInfo(5);
  const mk = (field, v) => () => base(['It is ' + f(0, String(v)) + '.'], [{ kind: 'lot', field: field, value: v }]);
  assert.ok(A.ask('x', c, mk('km', 9.99)).withheld); assert.ok(A.ask('x', c, mk('n', 3)).withheld);
  assert.ok(!A.ask('x', c, mk('km', Math.round(li.km * 100) / 100)).withheld); assert.ok(!A.ask('x', c, mk('n', 6)).withheld);
  assert.ok(A.ask('x', { input: Object.assign({}, T.DEFAULTS) }, mk('n', 6)).withheld, 'no lot means no lot claim can hold');
});
