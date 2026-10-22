#!/usr/bin/env node
// Local CI: everything that should be true before code leaves this machine. No server involved.
//   npm run ci          the fast gate (about half a minute): syntax, tests, repo hygiene, deck page count
//   npm run ci:full     the same plus the real-Chrome suite (about ten minutes; needs Google Chrome)
// Exit code 0 only if every step passed. Wired to `git push` by `npm run hooks` (see .githooks/).
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), full = process.argv.includes('--full');
const sh = (cmd, args, opts) => spawnSync(cmd, args, Object.assign({ cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }, opts));
const results = []; let counts = null, browserCount = null;   // what the test steps measured, so the deck can be held to it
function step(name, fn) {
  const t = Date.now(); let r; try { r = fn(); } catch (e) { r = { ok: false, detail: String(e && e.message || e) }; }
  const s = ((Date.now() - t) / 1000).toFixed(1) + 's';
  results.push({ name, ok: r.ok, skipped: !!r.skipped, detail: r.detail || '', s });
  console.log((r.skipped ? '  skip ' : r.ok ? '  pass ' : '  FAIL ') + name.padEnd(34) + s.padStart(7) + (r.detail ? '  ' + r.detail.split('\n')[0] : ''));
  if (!r.ok && !r.skipped && r.detail) console.log(r.detail.split('\n').slice(0, 14).map((l) => '        ' + l).join('\n'));
}
const tracked = () => sh('git', ['ls-files']).stdout.split('\n').filter(Boolean);

step('syntax of every script', () => {
  const files = tracked().filter((f) => /\.(js|cjs|mjs)$/.test(f) && !f.startsWith('site/vendor/'));
  const bad = files.filter((f) => sh('node', ['--check', f]).status !== 0);
  return { ok: bad.length === 0, detail: bad.length ? 'syntax error in ' + bad.join(', ') : files.length + ' files' };
});

step('unit, assistant, MCP, page tests', () => {
  const r = sh('npm', ['test', '--silent']); const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/tests (\d+)/), p = out.match(/site checks passed: (\d+)/), l = out.match(/login checks passed: (\d+)/);
  if (r.status === 0 && m && p) counts = { tests: +m[1], page: +p[1] + (l ? +l[1] : 0) };
  return { ok: r.status === 0, detail: r.status === 0 ? (m ? m[1] + ' tests, ' : '') + (counts ? counts.page + ' page checks' : '') : out.split('\n').filter((l) => /not ok|fail|Error|Assertion/i.test(l)).slice(0, 8).join('\n') || out.slice(-600) };
});

step('no secrets or personal data tracked', () => {
  const files = tracked(), bad = [];
  files.filter((f) => /(^|\/)\.env|\.(pem|key|p12)$|id_rsa|credentials/i.test(f)).forEach((f) => bad.push('file ' + f));
  const rules = [[/\b\d{6}-\d{2}-\d{4}\b/, 'an IC number'], [/\+?60 ?1\d[ -]?\d{3,4}[ -]?\d{4}\b/, 'a phone number'], [/\b01\d-\d{7,8}\b/, 'a phone number'], [/Bearer [A-Za-z0-9._-]{16,}/, 'a bearer token'], [/\bsk-[A-Za-z0-9]{20,}/, 'an API key'], [/\bghp_[A-Za-z0-9]{20,}/, 'a GitHub token'], [/BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/, 'a private key']];
  files.filter((f) => !/^site\/vendor\/|package-lock\.json$|\.(png|pdf|jpg)$/.test(f)).forEach((f) => {
    const txt = fs.readFileSync(path.join(root, f), 'utf8'); rules.forEach((r) => { if (r[0].test(txt)) bad.push(f + ' has ' + r[1]); });
  });
  return { ok: bad.length === 0, detail: bad.length ? bad.slice(0, 8).join('\n') : files.length + ' tracked files' };
});

step('no watermark trailers on new commits', () => {
  let range = sh('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).stdout.trim();
  range = range ? range + '..HEAD' : (sh('git', ['rev-parse', '--verify', '-q', 'origin/develop']).status === 0 ? 'origin/develop..HEAD' : '-20');
  const msgs = sh('git', ['log', range, '--format=%h %B%x00']).stdout.split('\0').filter((m) => m.trim());
  const bad = msgs.filter((m) => /^(co-authored-by|claude-session):|generated with/im.test(m)).map((m) => m.trim().split('\n')[0]);
  return { ok: bad.length === 0, detail: bad.length ? 'a trailer is in: ' + bad.join('; ') : msgs.length + ' commits checked' };
});

step('deck has one page per section', () => {
  const pitch = path.join(root, 'docs/PITCH.md'), pdf = path.join(root, 'docs/SDP-Terrarium-slides.pdf');
  if (!fs.existsSync(pitch) || !fs.existsSync(pdf)) return { ok: true, skipped: true, detail: 'no deck' };
  const info = sh('pdfinfo', [pdf]); if (info.error || info.status !== 0) return { ok: true, skipped: true, detail: 'pdfinfo not installed' };
  const pages = +(info.stdout.match(/Pages:\s+(\d+)/) || [0, 0])[1], sections = (fs.readFileSync(pitch, 'utf8').match(/^## /gm) || []).length;
  return { ok: pages === sections, detail: pages + ' pages, ' + sections + ' sections' + (pages === sections ? '' : ' (rebuild: hackager pdf --slides -o docs/SDP-Terrarium-slides.pdf docs/PITCH.md)') };
});

if (full) step('real-Chrome suite (about ten minutes)', () => {
  const r = sh('node', ['tools/browser_check.cjs'], { timeout: 1500000 }); const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/browser checks passed: (\d+)/); if (m) browserCount = +m[1];
  return { ok: r.status === 0 && !!m, detail: m ? m[1] + ' checks' : (out.match(/AssertionError[^\n]*/) || [out.slice(-400)])[0] };
});

// The organisers' template (slides 6 to 18) fixes the deck's order, and caps the last slide at 100 words. The counts on the Feasibility slide are typed by hand,
// so they are held to what the test steps just measured (the browser count only when the full suite has run, otherwise to the README's).
step('deck follows the template and the counts', () => {
  const pitch = path.join(root, 'docs/PITCH.md'); if (!fs.existsSync(pitch)) return { ok: true, skipped: true, detail: 'no deck' };
  const md = fs.readFileSync(pitch, 'utf8'), secs = md.split(/^## /m).slice(1).map((s) => ({ title: s.split('\n')[0].trim(), body: s.split('\n').slice(1).join('\n') })), bad = [];
  const want = ['Team Information', '1. The Problem', '2. Target User', '3. Your Solution', '4. Innovation', '5. How it Works', '6. Impact', '7. Feasibility', '8. Implementation', 'Visual Concept', 'Why Your Team Should Win', 'Thank You'];
  if (JSON.stringify(secs.slice(1, 13).map((s) => s.title)) !== JSON.stringify(want)) bad.push('sections 2 to 13 are not the template\'s: ' + secs.slice(1, 13).map((s) => s.title).join(' | '));
  const win = secs.find((s) => s.title === 'Why Your Team Should Win'), words = win ? win.body.replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length : 0;
  if (!win || words > 100) bad.push('Why Your Team Should Win is ' + words + ' words; the template allows 100');
  const feas = (secs.find((s) => s.title === '7. Feasibility') || { body: '' }).body.match(/(\d+) automated tests, (\d+) page checks and (\d+) checks in a real browser/);
  const readme = (fs.readFileSync(path.join(root, 'README.md'), 'utf8').match(/real-browser suite \((\d+) checks/) || [])[1];
  if (!feas) bad.push('the Feasibility slide no longer states the test counts');
  else {
    if (counts && +feas[1] !== counts.tests) bad.push('the deck says ' + feas[1] + ' automated tests; the suite ran ' + counts.tests);
    if (counts && +feas[2] !== counts.page) bad.push('the deck says ' + feas[2] + ' page checks; the suite ran ' + counts.page);
    const real = browserCount !== null ? browserCount : readme ? +readme : null;
    if (real !== null && +feas[3] !== real) bad.push('the deck says ' + feas[3] + ' real-browser checks; ' + (browserCount !== null ? 'the suite ran ' : 'the README says ') + real);
  }
  return { ok: bad.length === 0, detail: bad.length ? bad.join('\n') : secs.length + ' sections in the template\'s order, ' + words + ' words to win' + (counts ? ', counts match' : '') };
});

const failed = results.filter((r) => !r.ok && !r.skipped);
console.log(failed.length ? '\nCI FAILED: ' + failed.map((r) => r.name).join('; ') : '\nCI passed' + (full ? ' (full)' : ' (fast gate; run `npm run ci:full` for the real-Chrome suite)'));
process.exit(failed.length ? 1 : 0);
