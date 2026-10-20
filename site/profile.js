/* Demo sign-in and the saved home. There is no server: a profile is a JSON record in this browser's storage, keyed by email.
   It has no password and is not secure. It exists so the flow (sign in, set your home, come back to it) can be shown and tested;
   a real version swaps createStore for one backed by a server and an identity provider, with the same methods. */
(function (root) {
  'use strict';
  var KEY = 'terrarium.v1', HOUSES = ['terrace', 'semid', 'condo'];
  var NUM = { acHours: [0, 12, 1], setpoint: [22, 28, 1], solarKwp: [0, 8, 1], trees: [0, 10, 1], level: [1, 8, 1], nativeShare: [0, 1, 0], walkShare: [0, 1, 0], baseScale: [0.05, 8, 0] };
  var clamp = function (x, lo, hi) { return Math.min(hi, Math.max(lo, x)); };

  var validEmail = function (e) { return typeof e === 'string' && e.trim().length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()); };
  var normaliseEmail = function (e) { return String(e || '').trim().toLowerCase(); };

  // Only known fields, clamped to the ranges the model accepts. Anything else in a stored record is dropped.
  function sanitizeHome(h) {
    var out = {}; h = h || {};
    if (HOUSES.indexOf(h.house) >= 0) out.house = h.house;
    Object.keys(NUM).forEach(function (k) {
      var v = Number(h[k]); if (h[k] === null || h[k] === undefined || h[k] === '' || !isFinite(v)) return;
      var r = NUM[k]; v = clamp(v, r[0], r[1]); out[k] = r[2] ? Math.round(v / r[2]) * r[2] : v;
    });
    var bill = Number(h.billKwh); if (h.billKwh !== null && h.billKwh !== undefined && isFinite(bill) && bill >= 50 && bill <= 3000) out.billKwh = bill;
    var lot = Number(h.lot); if (h.lot !== null && h.lot !== undefined && Number.isInteger(lot) && lot >= 0 && lot < 64) out.lot = lot;
    return out;
  }
  var pickHome = function (st) { return sanitizeHome(st); };

  function memoryStorage() { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }

  function createStore(storage) {
    var persistent = true, backing = storage;
    try { if (!backing) throw new Error('no storage'); backing.setItem(KEY + '.probe', '1'); backing.removeItem(KEY + '.probe'); }
    catch (e) { backing = memoryStorage(); persistent = false; }   // private windows and blocked storage must not break the page
    function read() {
      try { var d = JSON.parse(backing.getItem(KEY) || 'null'); if (d && typeof d === 'object' && d.users && typeof d.users === 'object') return d; } catch (e) { /* corrupt: start clean */ }
      return { current: null, users: {} };
    }
    function write(d) { try { backing.setItem(KEY, JSON.stringify(d)); } catch (e) { persistent = false; } }
    var guest = null;   // a guest keeps a home for this visit only
    return {
      isPersistent: function () { return persistent; },
      signIn: function (email) {
        if (!validEmail(email)) return { ok: false, reason: 'Enter a valid email address.' };
        var id = normaliseEmail(email), d = read(), isNew = !d.users[id];
        if (isNew) d.users[id] = { home: {}, setUp: false };
        d.current = id; guest = null; write(d);
        return { ok: true, email: id, isNew: isNew || !d.users[id].setUp, home: sanitizeHome(d.users[id].home) };
      },
      guest: function () { guest = { home: {} }; var d = read(); d.current = null; write(d); return { ok: true, email: null, guest: true, isNew: true, home: {} }; },
      current: function () {
        if (guest) return { email: null, guest: true, home: sanitizeHome(guest.home) };
        var d = read(), id = d.current; if (!id || !d.users[id]) return null;
        return { email: id, guest: false, setUp: !!d.users[id].setUp, home: sanitizeHome(d.users[id].home) };
      },
      saveHome: function (home, setUp) {
        var clean = sanitizeHome(home);
        if (guest) { guest.home = clean; return clean; }
        var d = read(), id = d.current; if (!id || !d.users[id]) return null;
        d.users[id].home = clean; if (setUp) d.users[id].setUp = true; write(d); return clean;
      },
      signOut: function () { guest = null; var d = read(); d.current = null; write(d); },
      forget: function (email) { var d = read(), id = normaliseEmail(email); delete d.users[id]; if (d.current === id) d.current = null; write(d); },
    };
  }

  var API = { createStore: createStore, sanitizeHome: sanitizeHome, pickHome: pickHome, validEmail: validEmail, normaliseEmail: normaliseEmail, memoryStorage: memoryStorage, KEY: KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TerrariumProfile = API;
})(typeof window !== 'undefined' ? window : globalThis);
