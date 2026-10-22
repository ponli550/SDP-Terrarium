/* The account API: register, log in, log out, and keep one home per account. Runs as a Cloudflare Worker (worker.mjs) and under node:test.
   Storage is an interface (see memory-db.mjs for the shape), so the logic is tested without Cloudflare. Sessions are bearer tokens, not cookies,
   because the site (github.io) and the API (workers.dev) are different sites and browsers block third-party cookies. */
import P from '../site/profile.js';

const ITER = 100000;                       // the most PBKDF2 iterations a Worker allows
const SESSION_MS = 30 * 24 * 3600 * 1000;
const WINDOW_MS = 15 * 60 * 1000, MAX_FAILS = 5;
const enc = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }
export async function hashPassword(password) { const salt = crypto.getRandomValues(new Uint8Array(16)); return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(password, salt, ITER))}`; }
export async function checkPassword(password, stored) {
  const [alg, iter, salt, hash] = String(stored).split('$');
  if (alg !== 'pbkdf2' || !(+iter > 0)) return false;
  return same(await pbkdf2(password, unb64(salt), +iter), unb64(hash));
}
const sha256 = async (s) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
const DUMMY = hashPassword('not-a-real-password');   // unknown emails still pay for one hash, so timing does not reveal which emails exist

export function createApi({ db, now = () => Date.now(), allowedOrigins = [] }) {
  const cors = (req) => {
    const o = req.headers.get('origin'), h = { vary: 'origin' };
    if (o && allowedOrigins.includes(o)) { h['access-control-allow-origin'] = o; h['access-control-allow-headers'] = 'authorization, content-type'; h['access-control-allow-methods'] = 'GET, POST, PUT, OPTIONS'; h['access-control-max-age'] = '600'; }
    return h;
  };
  // The API only ever returns JSON, so the browser is told to treat it as nothing else: no scripts, no framing, no sniffing, no referrer, HTTPS only.
  const HARDEN = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'", 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(), microphone=(), geolocation=()', 'strict-transport-security': 'max-age=31536000; includeSubDomains' };
  const reply = (req, status, body, extra) => new Response(body === null ? null : JSON.stringify(body), { status, headers: Object.assign({ 'content-type': 'application/json' }, HARDEN, cors(req), extra) });
  const fail = (req, status, reason, extra) => reply(req, status, { ok: false, reason }, extra);

  async function body(req) {
    const text = await req.text();
    if (text.length > P.HOME_MAX_BYTES) return null;
    try { const d = JSON.parse(text); return d && typeof d === 'object' && !Array.isArray(d) ? d : null; } catch (e) { return null; }
  }
  async function open(req, email) {   // a session for this account, as a token the client keeps
    const token = b64(crypto.getRandomValues(new Uint8Array(32)));
    await db.putSession(await sha256(token), { email, exp: now() + SESSION_MS });
    return token;
  }
  async function who(req) {
    const m = /^Bearer (\S+)$/.exec(req.headers.get('authorization') || ''); if (!m) return null;
    const h = await sha256(m[1]), s = await db.getSession(h);
    if (!s) return null;
    if (s.exp <= now()) { await db.delSession(h); return null; }
    const u = await db.getUser(s.email); return u ? { user: u, hash: h } : null;
  }
  const view = (u) => ({ email: u.email, setUp: !!u.setUp, home: P.sanitizeHome(u.home) });

  async function handle(req) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/';
    if (req.method === 'OPTIONS') return reply(req, 204, null);

    if (path === '/register' && req.method === 'POST') {
      const d = await body(req); if (!d) return fail(req, 400, 'The request could not be read.');
      if (!P.validEmail(d.email)) return fail(req, 400, 'Enter a valid email address.');
      if (typeof d.password !== 'string' || d.password.length < 10 || d.password.length > 128) return fail(req, 400, 'Choose a password of 10 to 128 characters.');
      const email = P.normaliseEmail(d.email);
      if (await db.getUser(email)) return fail(req, 409, 'That email already has an account. Log in instead.');
      await db.createUser({ email, pass: await hashPassword(d.password), home: {}, setUp: false, created: now() });
      return reply(req, 201, { ok: true, token: await open(req, email), user: view({ email, home: {}, setUp: false }), isNew: true });
    }

    if (path === '/login' && req.method === 'POST') {
      const d = await body(req); if (!d) return fail(req, 400, 'The request could not be read.');
      const email = P.normaliseEmail(d.email);
      const tries = await db.getFails(email);
      if (tries.n >= MAX_FAILS && now() - tries.t < WINDOW_MS) return fail(req, 429, 'Too many wrong attempts. Try again in a few minutes.', { 'retry-after': String(Math.ceil((WINDOW_MS - (now() - tries.t)) / 1000)) });
      const u = P.validEmail(email) ? await db.getUser(email) : null;
      const good = typeof d.password === 'string' && await checkPassword(d.password, u ? u.pass : await DUMMY);
      if (!u || !good) { await db.setFails(email, { n: (now() - tries.t < WINDOW_MS ? tries.n : 0) + 1, t: now() }); return fail(req, 401, 'Email or password is wrong.'); }
      await db.setFails(email, { n: 0, t: 0 });
      return reply(req, 200, { ok: true, token: await open(req, email), user: view(u), isNew: !u.setUp });
    }

    const s = await who(req);
    if (!s) return fail(req, 401, 'You are not logged in.');
    if (path === '/me' && req.method === 'GET') return reply(req, 200, { ok: true, user: view(s.user) });
    if (path === '/logout' && req.method === 'POST') { await db.delSession(s.hash); return reply(req, 200, { ok: true }); }
    if (path === '/home' && req.method === 'PUT') {
      const d = await body(req); if (!d || !d.home || typeof d.home !== 'object' || Array.isArray(d.home)) return fail(req, 400, 'The home could not be read.');
      const home = P.sanitizeHome(d.home); await db.saveHome(s.user.email, home, !!d.setUp);
      return reply(req, 200, { ok: true, home });
    }
    return fail(req, 404, 'Not found.');
  }
  return { fetch: (req) => handle(req).catch(() => fail(req, 500, 'Something went wrong on the server.')) };
}
