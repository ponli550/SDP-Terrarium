// Drives the real page in jsdom with the account API switched on, against the real API handler (in memory): register, set up, log out, log in, expiry, offline.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM } = require('jsdom');
const dir = path.join(__dirname, '..', 'site');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { createApi } = await import('../api/auth.mjs'), { memoryDb } = await import('../api/memory-db.mjs');
  const BASE = 'https://api.test', db = memoryDb(), api = createApi({ db, allowedOrigins: [] }), calls = []; let down = false;
  const html = read('index.html')
    .replace(/<script src="vendor\/[^"]*"><\/script>\s*/g, '').replace(/<script src="scene.js"><\/script>\s*/, '')
    .replace('<script src="config.js"></script>', '<script>window.TERRARIUM_API = ' + JSON.stringify(BASE) + ';</script>')
    .replace(/<script src="(logic|profile|remote|mcpconfig|assistant|app)\.js"><\/script>/g, (m, f) => '<script>' + read(f + '.js') + '</script>');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', beforeParse(w) {
    w.fetch = async (url, init) => { calls.push(init.method + ' ' + url.replace(BASE, '')); if (down) throw new Error('offline'); return api.fetch(new Request(url, init)); };
  } });
  const w = dom.window, $ = (id) => w.document.getElementById(id);
  const submit = (email, pw) => { $('gateEmail').value = email; $('gatePw').value = pw; $('gateForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); return wait(150); };
  const token = () => w.localStorage.getItem('terrarium.token');

  ok(!$('gate').hidden, 'a first visit shows the gate');
  ok(!$('gatePwRow').hidden && !$('gateModeRow').hidden && $('gateGo').textContent === 'Log in' && $('gateMode').textContent === 'New here? Create an account', 'with the API on, the gate asks for a password and offers to create an account');
  ok(calls.length === 0, 'opening the page sends nothing');

  $('gateMode').click(); ok($('gateGo').textContent === 'Create account' && $('gatePw').autocomplete === 'new-password' && $('gateNote').textContent.includes('salted hash'), 'the switch turns the form into Create account');
  await submit('ali@example.com', 'short'); ok(!$('gate').hidden && /10 to 128/.test($('gateErr').textContent) && $('gatePw').value === '' && !token(), 'a short password is refused with the reason, and the field is cleared');
  await submit('ali@example.com', 'correct horse battery');
  ok($('gate').hidden && $('userName').textContent === 'ali@example.com' && $('signOut').textContent === 'Log out' && !!token(), 'registering logs you in');
  ok(!$('wizard').hidden, 'a new account is taken to home setup');
  ok($('gatePw').value === '' && !JSON.stringify(w.localStorage).includes('correct horse'), 'the password is not kept in the page or in storage');

  $('w_house').value = 'condo'; $('w_house').dispatchEvent(new w.Event('change', { bubbles: true })); $('wizDone').click();
  ok($('saveState').textContent === 'Saving…', 'a change shows Saving…'); await wait(1000);
  const u = db._users.get('ali@example.com'); ok(u.home.house === 'condo' && u.setUp === true && $('saveState').textContent === '', 'the home reaches the server after the pause, and the label clears');

  $('signOut').click(); await wait(150);
  ok(!$('gate').hidden && !token() && db._sessions.size === 0 && $('userChip').hidden, 'logging out shows the gate, drops the token and ends the session on the server');

  await submit('ali@example.com', 'wrong wrong wrong'); ok(!$('gate').hidden && $('gateErr').textContent === 'Email or password is wrong.' && !token(), 'a wrong password is refused and nothing is kept');
  down = true; await submit('ali@example.com', 'correct horse battery'); ok(!$('gate').hidden && /Could not reach/.test($('gateErr').textContent), 'with the server down the gate says so');
  down = false; await submit('ali@example.com', 'correct horse battery');
  ok($('gate').hidden && $('wizard').hidden && $('house').value === 'condo' && !$('gateGo').disabled, 'logging in brings your saved home back, without the setup wizard');

  db._sessions.clear(); $('trees').value = '9'; $('trees').dispatchEvent(new w.Event('input', { bubbles: true })); await wait(1100);
  ok(!$('gate').hidden && /login ended/.test($('gateErr').textContent) && !token(), 'a login the server no longer knows ends cleanly on the next save, with a reason');

  const before = calls.length; $('gateGuest').click(); $('trees').value = '3'; $('trees').dispatchEvent(new w.Event('input', { bubbles: true })); await wait(1000);
  ok($('gate').hidden && $('userName').textContent === 'Guest' && calls.length === before, 'a guest sends nothing to the server');

  console.log('login checks passed:', n); w.close();
})().catch((e) => { console.error(e); process.exit(1); });
