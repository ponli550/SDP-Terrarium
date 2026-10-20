const test = require('node:test');
const assert = require('node:assert');
const P = require('../site/profile.js');
const T = require('../site/logic.js');

const fresh = () => { const s = P.memoryStorage(); return { s, store: P.createStore(s) }; };

test('email validation: real addresses pass, junk does not', () => {
  for (const ok of ['a@b.co', 'irfan.ali@gamuda.tech', ' x@y.com ']) assert.ok(P.validEmail(ok), ok);
  for (const bad of ['', 'abc', 'a@b', '@b.com', 'a b@c.com', 'a@@b.com', null, undefined, 42, 'x'.repeat(130) + '@a.com']) assert.ok(!P.validEmail(bad), String(bad));
});
test('sign-in is case- and space-insensitive, and a second sign-in is not new', () => {
  const { store } = fresh();
  const a = store.signIn(' Ali@Example.COM '); assert.ok(a.ok && a.isNew && a.email === 'ali@example.com');
  store.saveHome({ house: 'condo' }, true); store.signOut();
  const b = store.signIn('ali@example.com'); assert.ok(b.ok && !b.isNew && b.home.house === 'condo');
});
test('a bad email is refused with a reason and nobody is signed in', () => {
  const { store } = fresh(); const r = store.signIn('nope'); assert.ok(!r.ok && /valid email/.test(r.reason)); assert.strictEqual(store.current(), null);
});
test('the home round-trips: what is saved comes back after sign-out and sign-in', () => {
  const { store } = fresh(); store.signIn('a@b.co');
  const home = { house: 'semid', acHours: 6, setpoint: 26, solarKwp: 3, trees: 7, nativeShare: 0.6, walkShare: 0.4, baseScale: 1.7, billKwh: 700, lot: 4 };
  store.saveHome(home, true); store.signOut(); assert.strictEqual(store.current(), null);
  store.signIn('a@b.co'); assert.deepStrictEqual(store.current().home, home);
});
test('two people on one browser keep separate homes', () => {
  const { store } = fresh(); store.signIn('a@b.co'); store.saveHome({ house: 'condo', trees: 9 }, true);
  store.signIn('c@d.co'); assert.deepStrictEqual(store.current().home, {}); store.saveHome({ house: 'terrace', trees: 1 }, true);
  store.signIn('a@b.co'); assert.deepStrictEqual(store.current().home, { house: 'condo', trees: 9 });
});
test('a stored record is sanitised on the way in and on the way out: unknown fields dropped, numbers clamped', () => {
  const dirty = { house: 'castle', acHours: 99, setpoint: 5, solarKwp: -3, trees: 2.6, nativeShare: 7, walkShare: -1, baseScale: 100, billKwh: 5, lot: -2, admin: true, __proto__x: 1 };
  const c = P.sanitizeHome(dirty);
  assert.deepStrictEqual(c, { acHours: 12, setpoint: 22, solarKwp: 0, trees: 3, nativeShare: 1, walkShare: 0, baseScale: 8 });
  assert.ok(!('house' in c) && !('billKwh' in c) && !('lot' in c) && !('admin' in c));
  assert.deepStrictEqual(P.sanitizeHome({ house: 'condo', billKwh: 700, lot: 5 }), { house: 'condo', billKwh: 700, lot: 5 });
  assert.deepStrictEqual(P.sanitizeHome(null), {}); assert.deepStrictEqual(P.sanitizeHome('x'), {});
});
test('a sanitised home is always accepted by the model', () => {
  for (const h of [{ house: 'condo', acHours: 99, trees: -5 }, { baseScale: 100, solarKwp: 50 }, {}]) {
    const home = P.sanitizeHome(h), r = T.simulate(Object.assign({}, T.DEFAULTS, home)); assert.ok(isFinite(r.figures.monthKwh.value) && r.figures.monthKwh.value > 0);
  }
});
test('tampered storage is recovered from, not trusted', () => {
  const s = P.memoryStorage(); s.setItem(P.KEY, '{not json'); let store = P.createStore(s); assert.strictEqual(store.current(), null); assert.ok(store.signIn('a@b.co').ok);
  s.setItem(P.KEY, JSON.stringify({ current: 'a@b.co', users: { 'a@b.co': { home: { house: 'castle', acHours: 500, evil: '<script>' } } } }));
  store = P.createStore(s); assert.deepStrictEqual(store.current().home, { acHours: 12 });
  s.setItem(P.KEY, JSON.stringify({ current: 'ghost@x.co', users: {} })); assert.strictEqual(P.createStore(s).current(), null);
});
test('blocked or failing storage falls back to memory and says it is not persistent', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const store = P.createStore(broken); assert.ok(!store.isPersistent()); assert.ok(store.signIn('a@b.co').ok);
  store.saveHome({ house: 'condo' }, true); assert.strictEqual(store.current().home.house, 'condo');
  assert.ok(!P.createStore(undefined).isPersistent());
  assert.ok(P.createStore(P.memoryStorage()).isPersistent());
});
test('a guest keeps a home for the visit but nothing is written for them', () => {
  const { s, store } = fresh(); const g = store.guest(); assert.ok(g.ok && g.guest);
  store.saveHome({ house: 'condo' }); assert.strictEqual(store.current().home.house, 'condo');
  assert.strictEqual(s.getItem(P.KEY).includes('condo'), false, 'the guest home must not be stored');
  store.signOut(); assert.strictEqual(store.current(), null);
});
test('signing in after being a guest drops the guest home', () => {
  const { store } = fresh(); store.guest(); store.saveHome({ house: 'condo' }); store.signIn('a@b.co'); assert.deepStrictEqual(store.current().home, {});
});
test('forget removes a person entirely', () => {
  const { store } = fresh(); store.signIn('a@b.co'); store.saveHome({ trees: 4 }, true); store.forget('A@B.co'); assert.strictEqual(store.current(), null);
  assert.ok(store.signIn('a@b.co').isNew);
});
test('the first sign-in needs set-up, a finished one does not', () => {
  const { store } = fresh(); assert.ok(store.signIn('a@b.co').isNew); store.signOut();
  assert.ok(store.signIn('a@b.co').isNew, 'still new until the home was saved as set up');
  store.saveHome({ house: 'condo' }, true); store.signOut(); assert.ok(!store.signIn('a@b.co').isNew);
});
test('signIn itself returns a sanitised home, whoever calls it', () => {
  const s = P.memoryStorage(); s.setItem(P.KEY, JSON.stringify({ current: null, users: { 'a@b.co': { home: { house: 'castle', acHours: 500, evil: 1 }, setUp: true } } }));
  const r = P.createStore(s).signIn('a@b.co'); assert.deepStrictEqual(r.home, { acHours: 12 }); assert.ok(!r.isNew);
});
test('a level is kept as a whole floor between 1 and 8, and survives the round trip', () => {
  assert.strictEqual(P.sanitizeHome({ level: 99 }).level, 8); assert.strictEqual(P.sanitizeHome({ level: 0 }).level, 1); assert.strictEqual(P.sanitizeHome({ level: 4.4 }).level, 4);
  assert.ok(!('level' in P.sanitizeHome({ level: 'x' })) && !('level' in P.sanitizeHome({ level: null })));
  const { store } = fresh(); store.signIn('a@b.co'); store.saveHome({ house: 'condo', level: 6, lot: 3 }, true); store.signOut(); store.signIn('a@b.co');
  assert.deepStrictEqual(store.current().home, { house: 'condo', level: 6, lot: 3 });
});
