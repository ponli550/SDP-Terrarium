/* The account client: the same methods as the demo store in profile.js, backed by the account API (api/auth.mjs).
   The login token and a copy of the account live in this browser's storage; the home is pushed to the server a moment after each change.
   A guest never touches the server. If the server cannot be reached the page keeps working and says the home is not saved. */
(function (root) {
  'use strict';
  var TOKEN = 'terrarium.token', CACHE = 'terrarium.account', DEBOUNCE = 700;
  var OFFLINE = 'Could not reach the server. Check your connection and try again.';

  function createRemoteStore(o) {
    var base = String(o.base).replace(/\/+$/, ''), doFetch = o.fetch, P = o.profile, store = o.storage, local = o.local;   // local: a memory-only demo store, for the guest
    var timer = null, pending = null, inflight = null, status = 'saved', onStatus = o.onStatus || function () {}, onExpired = o.onExpired || function () {};
    var setTimer = o.setTimeout || setTimeout, clearTimer = o.clearTimeout || clearTimeout;
    function get(k) { try { return store.getItem(k); } catch (e) { return null; } }
    function put(k, v) { try { store.setItem(k, v); } catch (e) { /* blocked storage: this visit still works, the next one logs in again */ } }
    function del(k) { try { store.removeItem(k); } catch (e) { /* nothing to clear */ } }
    function cached() { try { var a = JSON.parse(get(CACHE) || 'null'); return a && typeof a.email === 'string' ? a : null; } catch (e) { return null; } }
    function setStatus(s) { if (s !== status) { status = s; onStatus(s); } }
    function drop() { del(TOKEN); del(CACHE); clearTimer(timer); timer = null; pending = null; }

    function call(method, path, body, token) {
      var headers = { 'content-type': 'application/json' }; if (token) headers.authorization = 'Bearer ' + token;
      return Promise.resolve().then(function () { return doFetch(base + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) }); })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }, function () { return { status: r.status, json: { ok: false, reason: 'The server sent something unexpected.' } }; }); },
          function () { return { status: 0, json: { ok: false, reason: OFFLINE } }; });
    }
    function keep(token, user) { put(TOKEN, token); put(CACHE, JSON.stringify({ email: user.email, setUp: !!user.setUp, home: P.sanitizeHome(user.home) })); }

    function auth(path, payload) {
      return call('POST', path, payload).then(function (r) {
        if (!r.json || !r.json.ok) return { ok: false, reason: (r.json && r.json.reason) || 'Could not log in.', status: r.status };
        keep(r.json.token, r.json.user); setStatus('saved');
        // the recovery code is handed to the page once and never written to storage
        return { ok: true, email: r.json.user.email, isNew: !!r.json.isNew || !r.json.user.setUp, setUp: !!r.json.user.setUp, home: P.sanitizeHome(r.json.user.home), recoveryCode: r.json.recoveryCode || null };
      });
    }
    function push() {
      if (!pending) return Promise.resolve();
      var job = pending, token = get(TOKEN); pending = null; clearTimer(timer); timer = null;
      if (!token) return Promise.resolve();
      setStatus('saving');
      inflight = call('PUT', '/home', { home: job.home, setUp: job.setUp }, token).then(function (r) {
        inflight = null;
        if (r.status === 401) { drop(); setStatus('saved'); onExpired(); return; }
        if (r.json && r.json.ok) { setStatus(pending ? 'saving' : 'saved'); return; }
        pending = pending || job; setStatus('failed');   // keep it: the next change tries again, with the newer home
      });
      return inflight;
    }
    return {
      remote: true,
      isPersistent: function () { return true; },
      signIn: function (email, password) { return auth('/login', { email: email, password: password }); },
      register: function (email, password) { return auth('/register', { email: email, password: password }); },
      recover: function (email, code, password) { return auth('/recover', { email: email, code: code, password: password }); },
      makeRecoveryCode: function (password) {   // a new code for the logged-in account; the password is asked again
        var token = get(TOKEN); if (!token) return Promise.resolve({ ok: false, reason: 'You are not logged in.', status: 401 });
        return call('POST', '/recovery-code', { password: password }, token).then(function (r) {
          if (r.json && r.json.ok) return { ok: true, recoveryCode: r.json.recoveryCode };
          if (r.status === 401 && r.json && r.json.reason === 'You are not logged in.') { drop(); onExpired(); }
          return { ok: false, reason: (r.json && r.json.reason) || 'Could not make a code.', status: r.status };
        });
      },
      guest: function () { return local.guest(); },
      current: function () { var a = cached(); if (a && get(TOKEN)) return { email: a.email, guest: false, setUp: a.setUp, home: P.sanitizeHome(a.home) }; return local.current(); },
      refresh: function () {   // is the saved login still good? On a dead token, forget it and say so; offline, trust the copy
        var token = get(TOKEN); if (!token) return Promise.resolve({ ok: false, offline: false });
        return call('GET', '/me', undefined, token).then(function (r) {
          if (r.status === 401) { drop(); onExpired(); return { ok: false, offline: false }; }
          if (r.json && r.json.ok) { keep(token, r.json.user); return { ok: true, user: r.json.user }; }
          return { ok: false, offline: true };
        });
      },
      saveHome: function (home, setUp) {
        var clean = P.sanitizeHome(home), a = cached();
        if (!a || !get(TOKEN)) return local.saveHome(home, setUp);
        keep(get(TOKEN), { email: a.email, setUp: a.setUp || !!setUp, home: clean });
        pending = { home: clean, setUp: !!setUp || (pending && pending.setUp) || false };
        clearTimer(timer); timer = setTimer(push, DEBOUNCE); setStatus('saving');
        return clean;
      },
      flush: function () { return (inflight || Promise.resolve()).then(push); },
      signOut: function () {
        var token = get(TOKEN), job = pending; drop(); local.signOut(); setStatus('saved');
        // the last edit is sent before the session is ended, so logging out straight after a change does not lose it
        return (job && token ? call('PUT', '/home', { home: job.home, setUp: job.setUp }, token) : Promise.resolve()).then(function () { return token ? call('POST', '/logout', undefined, token) : null; }).then(function () {});
      },
      status: function () { return status; },
    };
  }

  var API = { createRemoteStore: createRemoteStore, OFFLINE: OFFLINE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TerrariumRemote = API;
})(typeof window !== 'undefined' ? window : globalThis);
