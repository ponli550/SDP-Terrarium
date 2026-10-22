import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createApi } from '../api/auth.mjs';
import { memoryDb } from '../api/memory-db.mjs';
const require = createRequire(import.meta.url);
const P = require('../site/profile.js'), R = require('../site/remote.js');

const BASE = 'https://api.test', PW = 'correct horse battery';
function rig(over = {}) {
  const db = memoryDb(), api = createApi({ db, allowedOrigins: [] }), log = [], timers = [];
  let down = false;
  const fetch = async (url, init) => { log.push(init.method + ' ' + url.replace(BASE, '')); if (down) throw new Error('offline'); return api.fetch(new Request(url, init)); };
  const storage = P.memoryStorage(), events = { status: [], expired: 0 };
  const mk = (st = storage) => R.createRemoteStore(Object.assign({ base: BASE, fetch, profile: P, storage: st, local: P.createStore(null), setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: () => {}, onStatus: (s) => events.status.push(s), onExpired: () => { events.expired++; } }, over));
  return { db, mk, log, timers, events, storage, setDown: (v) => { down = v; }, fire: async () => { const f = timers.splice(0); for (const t of f) await t(); } };
}

test('register, then the account survives a reload through the stored token alone', async () => {
  const r = rig(), s = r.mk(), a = await s.register('A@B.my', PW);
  assert.ok(a.ok && a.isNew && a.email === 'a@b.my');
  const again = r.mk(r.storage).current();   // a new page load, same browser storage
  assert.equal(again.email, 'a@b.my'); assert.equal(again.guest, false);
});

test('a wrong password is refused with the server\'s reason and keeps nothing', async () => {
  const r = rig(); await r.mk().register('a@b.my', PW);
  const fresh = rig(), x = await r.mk(P.memoryStorage()).signIn('a@b.my', 'wrong wrong wrong');
  assert.equal(x.ok, false); assert.equal(x.reason, 'Email or password is wrong.');
  assert.equal(r.mk(P.memoryStorage()).current(), null);
});

test('the home is sent after a pause, only the latest version, and comes back at the next login', async () => {
  const r = rig(), s = r.mk(); await s.register('a@b.my', PW);
  s.saveHome({ house: 'terrace', trees: 1 }, false); s.saveHome({ house: 'condo', level: 20, trees: 3 }, true);
  assert.equal(r.log.filter((l) => l.startsWith('PUT')).length, 0, 'nothing is sent while the user is still changing things');
  await r.fire(); await s.flush();
  assert.equal(r.log.filter((l) => l.startsWith('PUT')).length, 1);
  const back = await r.mk(P.memoryStorage()).signIn('a@b.my', PW);
  assert.equal(back.home.house, 'condo'); assert.equal(back.home.level, 20); assert.equal(back.setUp, true); assert.equal(back.isNew, false);
  assert.deepEqual(r.events.status.slice(-2), ['saving', 'saved']);
});

test('log out straight after a change still saves that change, then ends the session on the server', async () => {
  const r = rig(), s = r.mk(); await s.register('a@b.my', PW);
  s.saveHome({ house: 'semid', trees: 7 }, true);
  await s.signOut();
  assert.equal(s.current(), null); assert.equal(r.db._sessions.size, 0);
  assert.equal((await r.mk(P.memoryStorage()).signIn('a@b.my', PW)).home.trees, 7);
});

test('the server being down is reported, nothing is lost, and the next change retries', async () => {
  const r = rig(), s = r.mk(); await s.register('a@b.my', PW);
  r.setDown(true); s.saveHome({ trees: 4 }, true); await r.fire(); await s.flush();
  assert.equal(s.status(), 'failed'); assert.equal(s.current().home.trees, 4, 'the local copy keeps the change');
  r.setDown(false); s.saveHome({ trees: 5 }, true); await r.fire(); await s.flush();
  assert.equal(s.status(), 'saved');
  assert.equal((await r.mk(P.memoryStorage()).signIn('a@b.my', PW)).home.trees, 5);
});

test('login while the server is down says so, and says nothing false about the password', async () => {
  const r = rig(); r.setDown(true);
  const x = await r.mk().signIn('a@b.my', PW); assert.equal(x.ok, false); assert.equal(x.reason, R.OFFLINE); assert.equal(x.status, 0);
});

test('a dead token on refresh logs out and tells the page; offline refresh keeps the login', async () => {
  const r = rig(), s = r.mk(); await s.register('a@b.my', PW);
  r.setDown(true); assert.deepEqual(await s.refresh(), { ok: false, offline: true }); assert.ok(s.current(), 'offline does not log you out');
  r.setDown(false); r.db._sessions.clear();
  assert.equal((await s.refresh()).ok, false); assert.equal(r.events.expired, 1); assert.equal(s.current(), null);
});

test('a dead token found while saving also logs out', async () => {
  const r = rig(), s = r.mk(); await s.register('a@b.my', PW);
  r.db._sessions.clear(); s.saveHome({ trees: 2 }, true); await r.fire(); await s.flush();
  assert.equal(r.events.expired, 1); assert.equal(s.current(), null);
});

test('a guest never touches the server', async () => {
  const r = rig(), s = r.mk(), g = s.guest(); assert.ok(g.guest);
  s.saveHome({ trees: 6 }, true); await r.fire(); await s.flush();
  assert.equal(r.log.length, 0); assert.equal(s.current().guest, true); assert.equal(s.current().home.trees, 6);
});

test('blocked storage does not break login for this visit', async () => {
  const dead = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const r = rig(), a = await r.mk(dead).register('a@b.my', PW); assert.ok(a.ok);
});

test('an HTML error page from the server is reported plainly, not as a crash', async () => {
  const r = rig({ fetch: async () => new Response('<html>502</html>', { status: 502 }) });
  const x = await r.mk().signIn('a@b.my', PW); assert.equal(x.ok, false); assert.match(x.reason, /unexpected/);
});

test('after logout no token or account copy is left in browser storage', async () => {
  const r = rig(), s = r.mk(); await s.register('a@b.my', PW);
  assert.ok(r.storage.getItem('terrarium.token'));
  await s.signOut();
  assert.equal(r.storage.getItem('terrarium.token'), null); assert.equal(r.storage.getItem('terrarium.account'), null);
});

test('a failed save is retried by flush alone, with no new change needed', async () => {
  const r = rig(), s = r.mk(); await s.register('a@b.my', PW);
  r.setDown(true); s.saveHome({ trees: 8 }, true); await r.fire(); await s.flush(); assert.equal(s.status(), 'failed');
  r.setDown(false); await s.flush();
  assert.equal(s.status(), 'saved'); assert.equal((await r.mk(P.memoryStorage()).signIn('a@b.my', PW)).home.trees, 8);
});

test('a change that follows a first-time setup does not take the setup flag back', async () => {
  const bodies = []; const r = rig(); const inner = r.mk;
  const s = rig({ fetch: async (url, init) => { if (init.method === 'PUT') bodies.push(JSON.parse(init.body)); return r2.api.fetch(new Request(url, init)); } });
  const r2 = { api: createApi({ db: memoryDb(), allowedOrigins: [] }) };
  const st = s.mk(); await st.register('a@b.my', PW);
  st.saveHome({ trees: 1 }, true); st.saveHome({ trees: 2 }, false); await s.fire(); await st.flush();
  assert.equal(bodies.length, 1); assert.equal(bodies[0].setUp, true); assert.equal(bodies[0].home.trees, 2);
});
