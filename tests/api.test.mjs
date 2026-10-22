import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, hashPassword, checkPassword, newRecoveryCode } from '../api/auth.mjs';
import { memoryDb } from '../api/memory-db.mjs';

const ORIGIN = 'https://ponli550.github.io';
function rig() {
  let t = 1000000; const db = memoryDb(), api = createApi({ db, now: () => t, allowedOrigins: [ORIGIN] });
  const call = async (method, path, o = {}) => {
    const headers = Object.assign({ origin: ORIGIN }, o.token ? { authorization: 'Bearer ' + o.token } : {});
    const r = await api.fetch(new Request('https://api.test' + path, { method, headers, body: o.raw !== undefined ? o.raw : (o.body ? JSON.stringify(o.body) : undefined) }));
    return { status: r.status, headers: r.headers, json: r.status === 204 ? null : await r.json() };
  };
  return { db, call, tick: (ms) => { t += ms; } };
}
const PW = 'correct horse battery';
const signUp = async (r, email = 'a@b.my') => (await r.call('POST', '/register', { body: { email, password: PW } })).json;

test('a password is stored as a salted hash, never as the password', async () => {
  const a = await hashPassword(PW), b = await hashPassword(PW);
  assert.notEqual(a, b); assert.ok(!a.includes(PW));
  assert.ok(await checkPassword(PW, a)); assert.ok(!(await checkPassword(PW + 'x', a)));
  const r = rig(); await signUp(r); assert.ok(!JSON.stringify([...r.db._users.values()]).includes(PW));
});

test('register then /me returns the account, and the token is stored only as a hash', async () => {
  const r = rig(), s = await signUp(r);
  assert.ok(s.ok && s.token && s.isNew && s.user.email === 'a@b.my');
  const me = await r.call('GET', '/me', { token: s.token }); assert.equal(me.status, 200); assert.equal(me.json.user.email, 'a@b.my');
  assert.ok(![...r.db._sessions.keys()].includes(s.token));
});

test('register rejects a bad email, a short password and a duplicate', async () => {
  const r = rig();
  assert.equal((await r.call('POST', '/register', { body: { email: 'nope', password: PW } })).status, 400);
  assert.equal((await r.call('POST', '/register', { body: { email: 'a@b.my', password: 'short' } })).status, 400);
  assert.equal((await r.call('POST', '/register', { body: { email: 'a@b.my', password: 'x'.repeat(129) } })).status, 400);
  await signUp(r); assert.equal((await r.call('POST', '/register', { body: { email: 'A@B.MY', password: PW } })).status, 409);
  assert.equal((await r.call('POST', '/register', { raw: '[1]' })).status, 400);
  assert.equal((await r.call('POST', '/register', { raw: 'not json' })).status, 400);
});

test('login works with the right password and gives the same refusal for a wrong password and an unknown email', async () => {
  const r = rig(); await signUp(r);
  const ok = await r.call('POST', '/login', { body: { email: ' A@b.my ', password: PW } }); assert.equal(ok.status, 200); assert.ok(ok.json.token);
  const bad = await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'wrong wrong wrong' } });
  const none = await r.call('POST', '/login', { body: { email: 'nobody@b.my', password: 'wrong wrong wrong' } });
  assert.equal(bad.status, 401); assert.equal(none.status, 401); assert.equal(bad.json.reason, none.json.reason);
  assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my' } })).status, 401);
});

test('five wrong passwords lock the account for 15 minutes, even against the right password; it then reopens', async () => {
  const r = rig(); await signUp(r);
  for (let i = 0; i < 5; i++) assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'wrong wrong wrong' } })).status, 401);
  const locked = await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } });
  assert.equal(locked.status, 429); assert.ok(+locked.headers.get('retry-after') > 0);
  r.tick(15 * 60 * 1000 + 1);
  assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).status, 200);
});

test('a good login clears the failure count', async () => {
  const r = rig(); await signUp(r);
  for (let i = 0; i < 4; i++) await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'wrong wrong wrong' } });
  assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).status, 200);
  for (let i = 0; i < 4; i++) assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'wrong wrong wrong' } })).status, 401);
});

test('logout ends that session only; the token then fails', async () => {
  const r = rig(), s = await signUp(r), other = (await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).json.token;
  assert.equal((await r.call('POST', '/logout', { token: s.token })).status, 200);
  assert.equal((await r.call('GET', '/me', { token: s.token })).status, 401);
  assert.equal((await r.call('GET', '/me', { token: other })).status, 200);
});

test('a session expires after 30 days', async () => {
  const r = rig(), s = await signUp(r);
  r.tick(30 * 24 * 3600 * 1000 - 1000); assert.equal((await r.call('GET', '/me', { token: s.token })).status, 200);
  r.tick(2000); assert.equal((await r.call('GET', '/me', { token: s.token })).status, 401); assert.equal(r.db._sessions.size, 0);
});

test('the home is saved per account, cleaned to the model\'s ranges, and returned at login', async () => {
  const r = rig(), s = await signUp(r), o = await signUp(r, 'c@d.my');
  const put = await r.call('PUT', '/home', { token: s.token, body: { setUp: true, home: { house: 'condo', level: 999, solarKwp: 4, evil: '<script>' } } });
  assert.equal(put.status, 200); assert.equal(put.json.home.level, 35); assert.ok(!('evil' in put.json.home));
  const back = (await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).json;
  assert.equal(back.user.home.house, 'condo'); assert.equal(back.user.setUp, true); assert.equal(back.isNew, false);
  assert.deepEqual((await r.call('GET', '/me', { token: o.token })).json.user.home, {});
  assert.equal((await r.call('PUT', '/home', { token: s.token, body: { home: [1] } })).status, 400);
  assert.equal((await r.call('PUT', '/home', { token: s.token, raw: 'x'.repeat(70000) })).status, 400);
});

test('every route except register and login refuses a missing or forged token', async () => {
  const r = rig(); await signUp(r);
  for (const [m, p] of [['GET', '/me'], ['POST', '/logout'], ['PUT', '/home']]) {
    assert.equal((await r.call(m, p)).status, 401); assert.equal((await r.call(m, p, { token: 'forged' })).status, 401);
  }
  assert.equal((await r.call('GET', '/nowhere', { token: (await signUp(r, 'x@y.my')).token })).status, 404);
});

test('CORS is granted to the site and to nobody else', async () => {
  const r = rig();
  assert.equal((await r.call('OPTIONS', '/login')).status, 204);
  const ok = await r.call('GET', '/me'); assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const api = createApi({ db: memoryDb(), allowedOrigins: [ORIGIN] });
  const res = await api.fetch(new Request('https://api.test/me', { headers: { origin: 'https://evil.example' } }));
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('a storage failure is a 500 with no detail, not a crash', async () => {
  const db = memoryDb(); db.getUser = async () => { throw new Error('secret db detail'); };
  const res = await createApi({ db }).fetch(new Request('https://api.test/register', { method: 'POST', body: JSON.stringify({ email: 'a@b.my', password: PW }) }));
  assert.equal(res.status, 500); assert.ok(!(await res.text()).includes('secret'));
});

test('every response, success or error, carries the security headers', async () => {
  const r = rig(), s = await signUp(r), bad = JSON.stringify({ email: 'nope' });
  const want = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };
  const seen = [await r.call('OPTIONS', '/login'), await r.call('GET', '/me', { token: s.token }), await r.call('GET', '/me'), await r.call('GET', '/nowhere', { token: s.token }), await r.call('POST', '/register', { raw: bad }), await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'wrong wrong wrong' } })];
  const boom = memoryDb(); boom.getUser = async () => { throw new Error('x'); };
  const res = await createApi({ db: boom }).fetch(new Request('https://api.test/register', { method: 'POST', body: '{}' })); seen.push({ headers: res.headers });
  for (const x of seen) {
    for (const k in want) assert.equal(x.headers.get(k), want[k], k);
    assert.match(x.headers.get('content-security-policy'), /default-src 'none'/); assert.match(x.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(x.headers.get('strict-transport-security'), /max-age=31536000/); assert.match(x.headers.get('permissions-policy'), /camera=\(\)/);
  }
});

test('importing the API generates no random values: a Worker forbids that in its global scope', async () => {
  const real = crypto.getRandomValues; let called = 0;
  crypto.getRandomValues = (...a) => { called++; throw new Error('Disallowed operation called within global scope'); };
  try { await import('../api/auth.mjs?cold=' + Date.now()); } finally { delete crypto.getRandomValues; if (crypto.getRandomValues !== real) crypto.getRandomValues = real; }
  assert.equal(called, 0);
});

test('an unknown or invalid email is refused with 401, the same as a wrong password, and still pays for one hash', async () => {
  const r = rig(); await signUp(r);
  const unknown = await r.call('POST', '/login', { body: { email: 'nobody@b.my', password: PW } }), invalid = await r.call('POST', '/login', { body: { email: 'nope', password: PW } });
  assert.equal(unknown.status, 401); assert.equal(invalid.status, 401);
  const wrong = await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'wrong wrong wrong' } });
  assert.equal(unknown.json.reason, wrong.json.reason);
});

test('an unknown email costs the same 100000-round hash as a real one, so timing does not reveal which emails exist', async () => {
  const r = rig(); await signUp(r);
  const real = crypto.subtle.deriveBits.bind(crypto.subtle), rounds = [];
  crypto.subtle.deriveBits = (p, ...a) => { rounds.push(p.iterations); return real(p, ...a); };
  try {
    await r.call('POST', '/login', { body: { email: 'nobody@b.my', password: PW } }); const unknown = rounds.splice(0);
    await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'wrong wrong wrong' } }); const known = rounds.splice(0);
    assert.deepEqual(unknown, [100000]); assert.deepEqual(known, [100000]);
  } finally { delete crypto.subtle.deriveBits; }
});

// ---- recovery code: the way back into an account when the password is forgotten ----
const CODE = /^[2-9A-HJKMNP-Z]{5}(-[2-9A-HJKMNP-Z]{5}){3}$/;
const recover = (r, email, code, password = 'a brand new password 9') => r.call('POST', '/recover', { body: { email, code, password } });

test('a recovery code is 20 characters in four groups, never uses 0 O 1 I L, and no two are alike', () => {
  const seen = new Set(); for (let i = 0; i < 2000; i++) { const c = newRecoveryCode(); assert.match(c, CODE); seen.add(c); }
  assert.equal(seen.size, 2000);
});

test('every one of the 31 characters is equally likely (no modulo bias)', () => {
  const n = {}; let total = 0; for (let i = 0; i < 5000; i++) for (const ch of newRecoveryCode().replace(/-/g, '')) { n[ch] = (n[ch] || 0) + 1; total++; }
  const keys = Object.keys(n); assert.equal(keys.length, 31);
  const exp = total / 31, chi = keys.reduce((a, k) => a + (n[k] - exp) ** 2 / exp, 0);
  assert.ok(chi < 70, 'chi-square ' + chi.toFixed(1) + ' (30 degrees of freedom; a biased generator scores in the hundreds)');
});

test('registering returns a code once, stores only a hash of it, and login never returns it', async () => {
  const r = rig(), a = await signUp(r), b = await signUp(r, 'c@d.my');
  assert.match(a.recoveryCode, CODE); assert.notEqual(a.recoveryCode, b.recoveryCode);
  const stored = r.db._recovery.get('a@b.my'); assert.ok(stored && !stored.includes(a.recoveryCode.replace(/-/g, '')) && !JSON.stringify([...r.db._recovery.values()]).includes(a.recoveryCode));
  const login = (await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).json, me = (await r.call('GET', '/me', { token: a.token })).json;
  assert.ok(!('recoveryCode' in login) && !('recoveryCode' in me));
});

test('the right code sets a new password, ends every old session, and the old password stops working', async () => {
  const r = rig(), a = await signUp(r), other = (await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).json.token;
  const x = await recover(r, 'a@b.my', a.recoveryCode); assert.equal(x.status, 200); assert.ok(x.json.token && x.json.user.email === 'a@b.my');
  assert.equal((await r.call('GET', '/me', { token: a.token })).status, 401); assert.equal((await r.call('GET', '/me', { token: other })).status, 401);
  assert.equal((await r.call('GET', '/me', { token: x.json.token })).status, 200);
  assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).status, 401);
  assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'a brand new password 9' } })).status, 200);
});

test('a recovery code works once: it is replaced by a new one, and the old one is dead', async () => {
  const r = rig(), a = await signUp(r), x = await recover(r, 'a@b.my', a.recoveryCode);
  assert.match(x.json.recoveryCode, CODE); assert.notEqual(x.json.recoveryCode, a.recoveryCode);
  assert.equal((await recover(r, 'a@b.my', a.recoveryCode, 'yet another password 7')).status, 401);
  assert.equal((await recover(r, 'a@b.my', x.json.recoveryCode, 'yet another password 7')).status, 200);
});

test('the code is read forgivingly: lower case, spaces and missing dashes are fine', async () => {
  const r = rig(), a = await signUp(r);
  assert.equal((await recover(r, ' A@B.my ', a.recoveryCode.toLowerCase().replace(/-/g, ' '))).status, 200);
});

test('a wrong code, an unknown email and an account with no code are refused with the same words', async () => {
  const r = rig(), a = await signUp(r); await signUp(r, 'c@d.my'); r.db._recovery.delete('c@d.my');
  const wrong = await recover(r, 'a@b.my', 'AAAAA-AAAAA-AAAAA-AAAAA'), none = await recover(r, 'nobody@b.my', a.recoveryCode), nocode = await recover(r, 'c@d.my', a.recoveryCode), junk = await recover(r, 'nope', a.recoveryCode);
  for (const x of [wrong, none, nocode, junk]) { assert.equal(x.status, 401); assert.equal(x.json.reason, 'Email or recovery code is wrong.'); }
  assert.equal(r.db._users.get('a@b.my').pass.startsWith('pbkdf2$'), true); assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).status, 200);
});

test('five wrong codes lock recovery for 15 minutes, even for the right code; it then reopens', async () => {
  const r = rig(), a = await signUp(r);
  for (let i = 0; i < 5; i++) assert.equal((await recover(r, 'a@b.my', 'AAAAA-AAAAA-AAAAA-AAAAA')).status, 401);
  const locked = await recover(r, 'a@b.my', a.recoveryCode); assert.equal(locked.status, 429); assert.ok(+locked.headers.get('retry-after') > 0);
  r.tick(15 * 60 * 1000 + 1); assert.equal((await recover(r, 'a@b.my', a.recoveryCode)).status, 200);
});

test('being locked out of login does not block recovery, and recovering clears the login lock', async () => {
  const r = rig(), a = await signUp(r);
  for (let i = 0; i < 5; i++) await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'wrong wrong wrong' } });
  assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).status, 429);
  assert.equal((await recover(r, 'a@b.my', a.recoveryCode)).status, 200);
  assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: 'a brand new password 9' } })).status, 200);
});

test('failed recoveries do not lock login, and the new password must meet the same rule', async () => {
  const r = rig(), a = await signUp(r);
  for (let i = 0; i < 5; i++) await recover(r, 'a@b.my', 'AAAAA-AAAAA-AAAAA-AAAAA');
  assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).status, 200);
  assert.equal((await recover(r, 'a@b.my', a.recoveryCode, 'short')).status, 400);
  assert.equal((await recover(r, 'a@b.my', a.recoveryCode, 'x'.repeat(129))).status, 400);
  assert.equal((await r.call('POST', '/recover', { raw: 'junk' })).status, 400);
});

test('a logged-in user can make a new code by giving the password again; the old code dies', async () => {
  const r = rig(), a = await signUp(r);
  assert.equal((await r.call('POST', '/recovery-code', { body: { password: PW } })).status, 401, 'needs a token');
  assert.equal((await r.call('POST', '/recovery-code', { token: a.token, body: { password: 'wrong wrong wrong' } })).status, 401);
  assert.equal((await r.call('POST', '/recovery-code', { token: a.token, body: {} })).status, 401);
  const x = await r.call('POST', '/recovery-code', { token: a.token, body: { password: PW } }); assert.equal(x.status, 200); assert.match(x.json.recoveryCode, CODE);
  assert.equal((await recover(r, 'a@b.my', a.recoveryCode)).status, 401); assert.equal((await recover(r, 'a@b.my', x.json.recoveryCode)).status, 200);
});

test('an account made before codes existed can get one, and guessing the password through a stolen token is rate-limited', async () => {
  const r = rig(), a = await signUp(r); r.db._recovery.clear();
  assert.equal((await recover(r, 'a@b.my', a.recoveryCode)).status, 401);
  for (let i = 0; i < 5; i++) assert.equal((await r.call('POST', '/recovery-code', { token: a.token, body: { password: 'wrong wrong wrong' } })).status, 401);
  assert.equal((await r.call('POST', '/recovery-code', { token: a.token, body: { password: PW } })).status, 429);
  r.tick(15 * 60 * 1000 + 1); assert.equal((await r.call('POST', '/recovery-code', { token: a.token, body: { password: PW } })).status, 200);
});

test('if the code cannot be stored, signing up still works and says there is no code', async () => {
  const r = rig(); r.db.setRecovery = async () => { throw new Error('no such table: recovery'); };
  const a = await signUp(r); assert.equal(a.ok, true); assert.equal(a.recoveryCode, null);
  assert.equal((await r.call('POST', '/login', { body: { email: 'a@b.my', password: PW } })).status, 200);
});

test('recovery answers carry the security headers and a stored code is a salted-domain hash, not the bare code', async () => {
  const r = rig(), a = await signUp(r), x = await recover(r, 'a@b.my', 'AAAAA-AAAAA-AAAAA-AAAAA');
  assert.equal(x.headers.get('x-content-type-options'), 'nosniff'); assert.equal(x.headers.get('cache-control'), 'no-store');
  const bare = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a.recoveryCode.replace(/-/g, '')))).toString('base64url');
  assert.notEqual(r.db._recovery.get('a@b.my'), bare);
});
