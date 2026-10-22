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

  // the page's security policy: scripts only from this site, and the only server the page may talk to is the one config.js names
  const csp = Object.fromEntries(read('index.html').match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/)[1].split(';').map((d) => d.trim().split(/\s+/)).map((d) => [d[0], d.slice(1)]));
  const live = read('config.js').match(/TERRARIUM_API = '([^']*)'/)[1];
  ok(csp['script-src'].join(' ') === "'self'" && csp['default-src'].join(' ') === "'none'" && csp['object-src'].join(' ') === "'none'" && csp['base-uri'].join(' ') === "'none'", 'the policy allows scripts only from this site, and no plugins or base tag');
  ok(!JSON.stringify(csp).includes('unsafe-eval') && !csp['script-src'].includes("'unsafe-inline'"), 'the policy allows no eval and no inline script');
  ok(live === '' || csp['connect-src'].includes(new URL(live).origin), 'the policy lets the page talk to the API address in config.js, so the two cannot drift apart');
  ok(Object.keys(csp).sort().join(',') === 'base-uri,connect-src,default-src,form-action,object-src,script-src,style-src', 'the policy names exactly these directives, so nothing else (frames, fonts, images, workers) is opened without a test noticing');
  ok(Object.entries(csp).every(([k, v]) => v.every((x) => ["'self'", "'none'"].includes(x) || (k === 'style-src' && x === "'unsafe-inline'") || (k === 'connect-src' && x === new URL(live || 'https://none.invalid').origin))), 'every source in the policy is this site, nothing, the API address, or inline styles: no wildcard, no https:, no data:');
  ok(csp['connect-src'].every((x) => x === "'self'" || x === new URL(live || 'https://none.invalid').origin), 'and to nothing else');
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

  // ---- forgotten password: the recovery code, end to end through the page ----
  const CODE = /^[2-9A-HJKMNP-Z]{5}(-[2-9A-HJKMNP-Z]{5}){3}$/, NEWPW = 'a brand new password 9', OLDPW = 'correct horse battery';
  const click = (id) => { $(id).click(); return wait(150); };
  $('signOut').click(); await wait(150); $('gateGuest').click(); await wait(50); $('signOut').click(); await wait(100);   // back at the gate, as nobody
  ok(!$('gate').hidden && !$('gateForgotRow').hidden && $('gateCodeRow').hidden, 'the log-in form offers Forgot password? and does not ask for a code');
  $('gateMode').click(); ok($('gateForgotRow').hidden, 'the create-account form does not offer Forgot password?'); $('gateMode').click();
  $('gateForgot').click();
  ok(!$('gateCodeRow').hidden && $('gateGo').textContent === 'Reset password' && $('gatePwLabel').textContent === 'New password' && $('gatePw').autocomplete === 'new-password' && $('gateMode').textContent === 'Back to log in' && $('gateForgotRow').hidden, 'Forgot password? turns the form into email, recovery code and new password');
  $('gateMode').click(); ok($('gateCodeRow').hidden && $('gateGo').textContent === 'Log in' && $('gatePwLabel').textContent === 'Password', 'Back to log in restores it');
  // a fresh account, to learn its code the way a user does: from the dialog after sign-up
  $('gateMode').click(); await submit('rec@example.com', OLDPW);
  ok(!$('recovery').hidden && !$('recShow').hidden && CODE.test($('recCode').textContent), 'creating an account shows a recovery code in a dialog');
  const code1 = $('recCode').textContent;
  { let copied = null; Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { copied = t; return Promise.resolve(); } } }); $('recCopy').click(); await wait(30);
    ok(copied === code1 && $('recCopied').textContent === 'Copied', 'Copy puts exactly the code on the clipboard and says so');
    Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); $('recCopy').click(); await wait(30);
    ok(/copy it yourself/.test($('recCopied').textContent), 'if the clipboard is refused, it says to copy the code by hand'); }
  ok($('recDone').disabled, 'Continue is locked until the user says they saved it'); $('recSaved').checked = true; $('recSaved').dispatchEvent(new w.Event('change', { bubbles: true })); ok(!$('recDone').disabled, 'and opens when they do');
  ok(!JSON.stringify(w.localStorage).includes(code1) && !JSON.stringify(w.localStorage).includes(code1.replace(/-/g, '')) && !w.document.documentElement.outerHTML.replace(/<div id="recCode"[^>]*>[^<]*<\/div>/, '').includes(code1), 'the code is on the page only inside the dialog, and nowhere in storage');
  $('recDone').click(); ok($('recovery').hidden && $('recCode').textContent === '', 'Continue closes the dialog and wipes the code from the page');
  $('wizDone').click(); await wait(1000);   // finish setup, so this account counts as set up
  $('signOut').click(); await wait(150);
  // the forgot flow
  $('gateForgot').click(); $('gateCode').value = 'AAAAA-AAAAA-AAAAA-AAAAA'; await submit('rec@example.com', NEWPW);
  ok(!$('gate').hidden && $('gateErr').textContent === 'Email or recovery code is wrong.' && $('gateCode').value === '' && $('gatePw').value === '', 'a wrong recovery code is refused with the server\'s words, and the fields are cleared');
  $('gateCode').value = code1.toLowerCase().replace(/-/g, ' '); await submit('rec@example.com', 'short');
  ok(/10 to 128/.test($('gateErr').textContent) && !$('gate').hidden, 'a short new password is refused');
  $('gateCode').value = code1; await submit('rec@example.com', NEWPW);
  ok($('gate').hidden && $('userName').textContent === 'rec@example.com', 'the right code and a new password log the user in');
  ok(!$('recovery').hidden && CODE.test($('recCode').textContent) && $('recCode').textContent !== code1, 'and a new recovery code is shown, different from the old one');
  const code2 = $('recCode').textContent; $('recSaved').checked = true; $('recSaved').dispatchEvent(new w.Event('change', { bubbles: true })); $('recDone').click();
  ok($('wizard').hidden, 'an account that was set up before is not sent back to the wizard');
  $('signOut').click(); await wait(150);
  await submit('rec@example.com', OLDPW); ok(!$('gate').hidden && $('gateErr').textContent === 'Email or password is wrong.', 'the old password no longer works');
  await submit('rec@example.com', NEWPW); ok($('gate').hidden, 'the new password does');
  $('signOut').click(); await wait(150); $('gateForgot').click(); $('gateCode').value = code1; await submit('rec@example.com', 'another new password 3');
  ok(!$('gate').hidden && $('gateErr').textContent === 'Email or recovery code is wrong.', 'the first code no longer works once it has been used');
  // a code on demand, from the account menu
  $('gateMode').click(); await submit('rec@example.com', NEWPW); ok($('gate').hidden && !$('recoveryBtn').hidden, 'a logged-in account sees Recovery code in its menu');
  $('recoveryBtn').click(); ok(!$('recovery').hidden && !$('recAsk').hidden && $('recShow').hidden, 'it asks for the password first, before showing anything');
  $('recPw').value = 'wrong wrong wrong'; $('recAsk').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(200);
  ok($('recErr').textContent === 'Password is wrong.' && $('recShow').hidden && $('recPw').value === '' && $('gate').hidden, 'a wrong password shows no code and keeps the login');
  $('recPw').value = NEWPW; $('recAsk').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(300);
  ok(!$('recShow').hidden && CODE.test($('recCode').textContent) && $('recCode').textContent !== code2, 'the right password shows a new code');
  $('recSaved').checked = true; $('recSaved').dispatchEvent(new w.Event('change', { bubbles: true })); $('recDone').click();
  $('recoveryBtn').click(); $('recPw').value = 'typed but not sent'; $('recCancel').click(); ok($('recovery').hidden && $('recCode').textContent === '' && $('recPw').value === '', 'Cancel closes the dialog, makes no code and forgets the typed password');
  $('recoveryBtn').click(); $('signOut').click(); await wait(150); ok($('recovery').hidden, 'logging out closes the dialog');
  $('gateGuest').click(); await wait(50); ok($('recoveryBtn').hidden, 'a guest has no Recovery code item');
  $('signOut').click(); await wait(100);

  // text that someone else controls must reach the page as text. Each payload would add an element or a handler if it were treated as HTML.
  const PAY = '<img src=x onerror=window.__xss=1>', counts = () => [w.document.querySelectorAll('img:not(#shotimg)').length, w.document.querySelectorAll('[onerror],[onload],[onclick],[onmouseover]').length, w.document.querySelectorAll('script').length].join(',');
  const base = counts(), clean = (m) => ok(counts() === base && w.__xss === undefined, m);
  const ask = (q) => { $('askInput').value = q; $('askForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); };
  ask(PAY + ' give me the briefing'); clean('a question with markup in it adds nothing to the answer');
  ask('what if ' + PAY); clean('and nor does a what-if with markup in it');
  $('mcpDefaults').checked = false; $('mcpDefaults').dispatchEvent(new w.Event('change', { bubbles: true }));   // absolute paths that carry the markup, so the config is really built from them
  ['mcpServer', 'mcpHome', 'mcpNode'].forEach((id) => { $(id).value = id === 'mcpNode' ? PAY : '/x/' + PAY + '/f.mjs'; $(id).dispatchEvent(new w.Event('input', { bubbles: true })); }); ok($('mcpOut').textContent.includes(PAY), 'the Connect config is built from the pasted paths, markup and all'); clean('and it appears as text, adding nothing to the page');
  [...$('mcpClient').options].forEach((o) => { $('mcpClient').value = o.value; $('mcpClient').dispatchEvent(new w.Event('change', { bubbles: true })); clean('nor does the ' + o.value + ' config built from those paths'); });
  down = false; const real = w.fetch; w.fetch = async () => new Response(JSON.stringify({ ok: false, reason: PAY }), { status: 401 });
  $('signOut').click(); await wait(150); await submit('x@y.my', 'whatever whatever'); clean('an error message from the server containing markup is shown as text'); ok($('gateErr').textContent === PAY, 'and shown exactly as sent');
  w.fetch = real;
  const evil = 'a<img/src=x/onerror=window.__xss=1>@b.co';
  $('gateMode').click(); await submit(evil, 'correct horse battery');
  ok($('userName').textContent === evil, 'an account whose email contains markup is accepted by the same rule as any other, and shown as text'); clean('and adds nothing to the page');

  console.log('login checks passed:', n); w.close();
})().catch((e) => { console.error(e); process.exit(1); });
