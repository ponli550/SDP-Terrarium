const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const T = require('../site/logic.js');
const A = require('../site/aboutview.js');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function draw() {
  const doc = new JSDOM('<!doctype html><body></body>').window.document, els = {};
  ['grades', 'sources', 'faq', 'data', 'terms'].forEach((k) => { els[k] = doc.createElement('section'); doc.body.appendChild(els[k]); });
  A.render(doc, els, T); return { doc, els };
}
const rows = (els) => [...els.sources.querySelectorAll('.srcrow')];

test('every assumption the model uses has a row, no more, ordered REAL then SOURCED then ILLUSTRATIVE', () => {
  const { els } = draw(), keys = rows(els).map((r) => r.dataset.key);
  assert.deepStrictEqual([...keys].sort(), Object.keys(T.ASSUME).sort());
  const rank = { REAL: 0, SOURCED: 1, ILLUSTRATIVE: 2 }, grades = rows(els).map((r) => rank[r.dataset.grade]);
  assert.deepStrictEqual(grades, [...grades].sort((a, b) => a - b));
});

test('each row shows the model\'s own grade and value, and a name for it; a new assumption without a name fails here', () => {
  const { els } = draw();
  rows(els).forEach((r) => {
    const a = T.ASSUME[r.dataset.key];
    assert.strictEqual(r.dataset.grade, a.grade, r.dataset.key); assert.strictEqual(r.querySelector('.badge').textContent, a.grade);
    assert.strictEqual(r.querySelector('.src-val').textContent, String(a.v)); assert.strictEqual(r.querySelector('.src-note').textContent, a.note);
    assert.ok(A.LABELS[r.dataset.key] && r.querySelector('b').textContent === A.LABELS[r.dataset.key].label, r.dataset.key + ' has a plain name');
  });
  assert.deepStrictEqual(Object.keys(A.LABELS).sort(), Object.keys(T.ASSUME).sort(), 'no name for a figure that is not an assumption');
});

test('a REAL or SOURCED row shows its citation exactly as the model holds it: link, publisher, how it was read, and the caveat', () => {
  const { els } = draw();
  rows(els).filter((r) => r.dataset.grade !== 'ILLUSTRATIVE').forEach((r) => {
    const s = T.SOURCES[r.dataset.key], cite = r.querySelector('.src-cite'), link = cite.querySelector('a');
    assert.ok(cite.textContent.includes(s.title) && cite.textContent.includes(s.publisher), r.dataset.key);
    if (s.url) { assert.strictEqual(link.getAttribute('href'), s.url); assert.strictEqual(link.getAttribute('target'), '_blank'); assert.ok(/noopener/.test(link.getAttribute('rel')), 'noopener'); assert.ok(/^https:\/\//.test(link.href)); } else assert.ok(!link, r.dataset.key + ' has no link to show');
    assert.strictEqual(r.querySelector('.src-caveat').textContent, s.caveat);
    const read = r.querySelector('.src-read');
    assert.ok(read.classList.contains(s.read), r.dataset.key);
    if (s.read === 'primary') assert.ok(/publisher's own document/.test(read.textContent) && read.textContent.includes(s.checked));
    if (s.read === 'secondary') assert.ok(/report of it/.test(read.textContent) && /not the schedule itself/.test(read.textContent) && read.textContent.includes(s.checked));
    if (s.read === 'carried') assert.ok(/not re-checked/.test(read.textContent));
  });
  const gridRow = rows(els).find((r) => r.dataset.key === 'gridKgKwh'), tariffRow = rows(els).find((r) => r.dataset.key === 'tariff');
  assert.ok(/Energy Commission/.test(gridRow.textContent) && /0\.74/.test(gridRow.textContent) && /provisional/i.test(gridRow.textContent));
  assert.ok(/news explainer|Carz/.test(tariffRow.textContent) && /Bernama/.test(tariffRow.textContent) && /not the schedule itself/.test(tariffRow.textContent), 'the tariff says it is a report, confirmed by the announcement');
});

test('a placeholder shows no source and says so; nothing ILLUSTRATIVE links anywhere', () => {
  const { els } = draw();
  rows(els).filter((r) => r.dataset.grade === 'ILLUSTRATIVE').forEach((r) => { assert.ok(!r.querySelector('a') && /Our placeholder/.test(r.querySelector('.src-read').textContent), r.dataset.key); assert.ok(!r.querySelector('.src-cite'), r.dataset.key); });
  assert.ok(rows(els).filter((r) => r.dataset.grade === 'ILLUSTRATIVE').length >= 10);
});

test('the tariff row lists the four charges with the numbers the bill really uses', () => {
  const { els } = draw(), li = [...els.sources.querySelectorAll('.src-tariff li')].map((x) => x.textContent), all = li.join(' | ');
  assert.strictEqual(li.length, 4);
  assert.ok(/27\.03 sen per kWh up to 1500 kWh a month, then 37\.03 sen/.test(all) && /Capacity: 4\.55 sen/.test(all) && /Network: 12\.85 sen/.test(all) && /RM 10 a month, waived at 600 kWh or less/.test(all), all);
  assert.ok(Math.abs(T.TARIFF.energy[0][1] - 0.2703) < 1e-9 && T.TARIFF.retail.freeAtOrBelowKwh === 600, 'and the model\'s tariff is those numbers');
});

test('the grade cards count the model\'s assumptions by grade, and the counts add up', () => {
  const { els } = draw(), cards = [...els.grades.querySelectorAll('.gradedef')], n = Object.keys(T.ASSUME).length;
  assert.deepStrictEqual(cards.map((c) => c.dataset.grade), ['REAL', 'SOURCED', 'ILLUSTRATIVE']);
  let sum = 0; cards.forEach((c) => { const want = Object.values(T.ASSUME).filter((a) => a.grade === c.dataset.grade).length, got = +/^(\d+) of/.exec(c.querySelector('small').textContent)[1]; assert.strictEqual(got, want, c.dataset.grade); assert.ok(c.textContent.includes('of the model\'s ' + n), 'total'); sum += got; });
  assert.strictEqual(sum, n);
});

test('the FAQ keeps the questions a judge would ask, and the bill answer states the rule that a change breaks the match', () => {
  const { els } = draw(), qs = [...els.faq.querySelectorAll('summary')].map((s) => s.textContent);
  ['real electricity bill', 'Where do the numbers come from', 'marked ILLUSTRATIVE', 'the neighbour', 'trust the score', 'flooding', 'Match to my bill', 'assistant make things up', '0.93 km'].forEach((q) => assert.ok(qs.some((x) => x.includes(q)), 'a question about: ' + q));
  assert.strictEqual(qs.length, 9, 'nine questions; removing or adding one is a decision, so this number changes with it');
  const bill = els.faq.querySelector('details').querySelector('p').textContent;
  assert.ok(/breaks the match/.test(bill) && /published tariff/.test(bill) && /REAL/.test(bill) && /SOURCED/.test(bill), bill);
});

test('the FAQ answers the questions a judge would ask, including that flooding and the greenhouse effect are not modelled', () => {
  const { els } = draw(), qs = [...els.faq.querySelectorAll('summary')].map((s) => s.textContent);
  assert.ok(qs.length >= 8 && qs[0] === 'Is this my real electricity bill?');
  const flood = [...els.faq.querySelectorAll('details')].find((d) => /flooding/.test(d.querySelector('summary').textContent)).querySelector('p').textContent;
  assert.ok(/^No\./.test(flood) && /no water, drainage or flood data/.test(flood) && /greenhouse|climate-warming|urban heat/.test(flood + els.faq.textContent), flood);
  assert.ok(/not a language model/.test(els.faq.textContent) && /0\.93/.test(els.faq.textContent));
});

// the claims the page makes about the system are tied to the system, so changing one without the other fails here
test('"there is no way to delete an account", "we never send an email" and "we do not keep your name" are true of the code', () => {
  const api = read('api/auth.mjs'), schema = read('api/schema.sql'), { els } = draw(), data = els.data.textContent;
  assert.ok(/no way to delete an account/.test(data) && !/req\.method === 'DELETE'|path === '\/account'|DELETE FROM users/.test(api + read('api/d1-db.mjs')), 'no account deletion exists');
  assert.ok(/never send an email/.test(data) && !/\bfetch\(/.test(api + read('api/d1-db.mjs')) && !/\bsmtp|sendgrid|\bresend\b|mailchannels|nodemailer|sendmail|send_email|sendEmail|email_sending/i.test(api + read('api/d1-db.mjs') + read('api/worker.mjs')), 'the API sends nothing');
  const cols = /CREATE TABLE IF NOT EXISTS users\s*\(([^)]*)\)/.exec(schema)[1].split(',').map((c) => c.trim().split(/\s+/)[0]);
  assert.deepStrictEqual(cols, ['email', 'pass', 'home', 'set_up', 'created'], 'the account table holds exactly an email, a hash, the home settings and two flags');
  assert.ok(/do not keep/.test(data) && /name, address, phone number, identity number/.test(data) && /salted hash/.test(data) && /recovery code/.test(data) && /Cloudflare/.test(data) && /PDPA/.test(data));
  assert.ok(/pbkdf2/.test(api) && /sha256/.test(api), 'the hashes the page names are the ones used');
});

test('the notice says it is a prototype, not advice, not legal terms and not reviewed by a lawyer', () => {
  const { els } = draw(), t = els.terms.textContent;
  assert.ok(/prototype/.test(t) && /not financial, engineering or legal advice/.test(t) && /no warranty/.test(t) && /not legal terms/.test(t) && /not been reviewed by a lawyer/.test(t) && /not a Sime Darby Property product/.test(t));
});

test('the page is drawn with DOM calls and text only, and every external link opens safely', () => {
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(read('site/aboutview.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  const { doc } = draw(); [...doc.querySelectorAll('a[href]')].forEach((a) => { assert.ok(/^https:\/\//.test(a.getAttribute('href')) && a.getAttribute('target') === '_blank' && /noopener/.test(a.getAttribute('rel'))); });
  assert.ok(doc.querySelectorAll('a[href]').length >= 3);
});
