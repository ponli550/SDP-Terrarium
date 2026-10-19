// Drives the real page in jsdom: setup, a full four-week game, replay, and the figure badges.
const fs = require('fs'), path = require('path'), assert = require('assert');
const { JSDOM } = require('jsdom');
const dir = path.join(__dirname, '..', 'site');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
// jsdom has no WebGL: load the model and the app, leave the 3D scripts out, and check the fallback.
const html = read('index.html')
  .replace(/<script src="vendor\/[^"]*"><\/script>\s*/g, '').replace(/<script src="scene.js"><\/script>\s*/, '')
  .replace('<script src="logic.js"></script>', '<script>' + read('logic.js') + '</script>')
  .replace('<script src="assistant.js"></script>', '<script>' + read('assistant.js') + '</script>')
  .replace('<script src="app.js"></script>', '<script>' + read('app.js') + '</script>');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window, $ = (id) => w.document.getElementById(id);
const setRange = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };

ok($('nowebgl'), 'without WebGL the page says so and keeps working');
ok($('hudFigs').textContent.includes('Electricity today') && $('hudClock').textContent.includes('Day'), 'the heads-up display renders');
ok($('pillars').querySelectorAll('.score').length === 4, 'four pillar cards');
ok([...$('pillars').querySelectorAll('.formula')].every((e) => e.textContent.length > 20), 'every pillar shows its formula');
const badges = [...$('figs').querySelectorAll('.badge')].map((b) => b.textContent);
ok(badges.length >= 9 && badges.every((b) => ['REAL', 'SOURCED', 'ILLUSTRATIVE'].includes(b)), 'every figure has a grade badge');
ok(badges.includes('REAL'), 'at least one REAL figure');
ok(w.document.body.textContent.includes('Simulated'), 'the illustration label is on the page');

const before = $('pillars').textContent;
setRange('trees', 9); ok($('pillars').textContent !== before, 'moving a slider changes the pillars');
setRange('trees', 2);

ok($('gStart'), 'a start button'); $('gStart').click();
ok($('gLock'), 'round 1 shows a lock button');
ok($('gameBody').textContent.includes('Week 1 of 4'), 'week 1 of 4');
ok($('acHours').disabled && !$('trees').disabled, 'weekly choices lock; setup stays open before week 1 is locked');
const evs = [];
for (let wk = 1; wk <= 4; wk++) {
  evs.push($('gameBody').querySelector('.ev b').textContent);
  ok($('gameBody').textContent.includes('Week ' + wk + ' of 4'), 'round ' + wk);
  if (wk === 4) { ok($('gWk').max === '50', 'rain caps the walking slider at 50'); setRange('gWk', 50); }
  setRange('gAc', 5); setRange('gSp', 26);
  $('gLock').click();
  if (wk === 1) ok($('trees').disabled, 'setup locks once a week is played');
}
ok(evs[1].includes('Heat spell') && evs[2].includes('Neighbour report') && evs[3].includes('Rainy'), 'the four events appear in order');
ok($('gameBody').textContent.includes('Month finished'), 'the month ends');
ok(/home score \d+ \/ 100/.test($('gameBody').textContent), 'a final score is shown');
ok($('gameBody').querySelectorAll('.wk tr').length >= 5, 'a pillar table is shown');
ok($('gameBody').textContent.includes('What to change next month'), 'suggestions section');
ok($('gAgain')); $('gAgain').click();
ok($('gStart') && !$('trees').disabled, 'play again resets and unlocks setup');
$('gStart').click(); $('gQuit').click();
ok($('gStart'), 'quit returns to the start');
// the assistant panel
const ask = (q) => { $('askInput').value = q; $('askForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); };
ok($('askChips').querySelectorAll('button').length >= 6, 'example chips');
ask('Give me the briefing');
ok($('askOut').textContent.includes('This month your home uses') && $('askOut').textContent.includes('Checked'), 'a verified briefing with its check line');
ok(!/[⦃⦄⟦⟧]/.test($('askOut').textContent), 'no raw markers on the page');
ask('what is the weather on mars'); ok($('askOut').textContent.includes('no way to answer'), 'an off-topic question is refused');
setRange('acHours', 10); setRange('setpoint', 22); setRange('walkShare', 0); setRange('trees', 0);
const snap = () => JSON.stringify(['acHours', 'solarKwp', 'setpoint', 'trees', 'walkShare', 'nativeShare'].map((k) => $(k).value));
const was = { acHours: $('acHours').value, solarKwp: $('solarKwp').value, setpoint: $('setpoint').value, trees: $('trees').value, walkShare: $('walkShare').value }, stateBefore = snap(), pillarsBefore = $('pillars').textContent;
ask('what should I change first?'); ok($('askOut').querySelector('[data-apply]'), 'a proposed change with an apply button');
const lever = $('askOut').querySelector('[data-apply]').dataset.apply;
ok(snap() === stateBefore && $('pillars').textContent === pillarsBefore, 'asking changes nothing: no control and no score moved');
$('hotWeek').dispatchEvent(new w.Event('change', { bubbles: true }));   // force a redraw: hidden state changes would show now
ok(snap() === stateBefore && $('pillars').textContent === pillarsBefore, 'and nothing changed underneath either');
$('askOut').querySelector('[data-apply]').click();
ok($('askOut').textContent.includes('Applied'), 'a person\'s click applies the change');
ok(String($(lever === 'walkShare' ? 'walkShare' : lever).value) !== String(lever === 'walkShare' ? was.walkShare : was[lever]), 'and the matching control moved');
// a withheld answer is shown as withheld, not as a normal answer
const realAsk = w.TerrariumAI.ask;
w.TerrariumAI.ask = (q, c) => realAsk(q, c, () => ({ intent: 'x', text: ['It saves 35% for sure.'], claims: [], cards: [], calls: [] }));
ask('anything'); ok($('askOut').textContent.includes('Withheld') && !$('askOut').textContent.includes('35%'), 'a withheld answer is marked and its text is not shown');
w.TerrariumAI.ask = realAsk;
ask('what should I change first?'); $('askOut').querySelector('[data-dismiss]').click(); ok(!$('askOut').querySelector('.prop'), 'dismiss removes the proposal');
$('gStart').click(); ask('what should I change first?');
const ap = $('askOut').querySelector('[data-apply]'); if (ap) { ap.click(); ok($('askOut').textContent.includes('Quit the game first'), 'apply is blocked during a game'); }
$('gQuit').click();
// the inspect panel (in the browser a click on the scene calls this; jsdom has no scene to click)
ok($('inspect').hidden, 'the inspect panel starts closed');
w.__terrarium.inspect('stop');
ok(!$('inspect').hidden && $('inspect').textContent.includes('Bus stop') && $('inspect').textContent.includes('0.93 km'), 'the stop panel opens with the real distance');
ok($('inspect').textContent.includes('drawn compressed') && $('inspect').textContent.includes('no real-time bus'), 'the panel shows its fact lines');
ok($('inspect').querySelectorAll('.badge.REAL').length === 2 && !/undefined|NaN/.test($('inspect').textContent), 'it grades its figures and shows no broken values');
$('inspClose').click(); ok($('inspect').hidden && $('inspect').innerHTML === '', 'close empties and hides it');
w.__terrarium.inspect('car'); ok($('inspect').textContent.includes('driving') && $('inspect').querySelectorAll('.badge.ILLUSTRATIVE').length >= 2, 'a car panel shows illustrative figures as such');
w.__terrarium.inspect('nothing'); ok($('inspect').hidden, 'an unknown kind shows nothing');
ok($('follow') && $('follow').textContent === 'Follow a trip', 'the follow button is there');
// after handover: the owner's own bill
const bill = (v) => { $('billKwh').value = v; $('billForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); };
const kwhFig = () => [...$('figs').querySelectorAll('.fig')].find((f) => f.textContent.includes('Electricity this month'));
$('hotWeek').checked = false; setRange('acHours', 8); setRange('setpoint', 24); setRange('solarKwp', 0); setRange('trees', 2); setRange('walkShare', 20);
ok(kwhFig().querySelector('.badge').textContent === 'ILLUSTRATIVE', 'before a bill the electricity figure is illustrative');
bill(10); ok($('billOut').textContent.includes('between 50 and 3000') && kwhFig().querySelector('.badge').textContent === 'ILLUSTRATIVE', 'an impossible bill is refused with a reason and changes nothing');
bill(700);
ok($('billOut').textContent.includes('Your bill: 700 kWh') && /47% below/.test($('billOut').textContent), 'a real bill shows how far off the model was');
ok(kwhFig().querySelector('.badge').textContent === 'REAL' && kwhFig().textContent.includes('700 kWh'), 'the electricity figure now equals the bill and is graded REAL');
ok(['Carbon', 'Walking', 'Nights'].every((t) => { const f = [...$('figs').querySelectorAll('.fig')].find((x) => x.textContent.includes(t)); return f && f.querySelector('.badge').textContent === 'ILLUSTRATIVE'; }), 'the figures one bill cannot support stay illustrative');
setRange('acHours', 3);
ok(kwhFig().querySelector('.badge').textContent === 'ILLUSTRATIVE' && $('billOut').textContent.includes('changed since you matched your bill'), 'changing the home breaks the match, and the page says so');
bill(700); ok(kwhFig().querySelector('.badge').textContent === 'REAL', 'matching again restores it');
$('billReset').click(); ok(kwhFig().querySelector('.badge').textContent === 'ILLUSTRATIVE' && $('billOut').innerHTML === '' && $('billKwh').value === '', 'reset returns to the simulated month');
bill(700); $('gStart').click(); ok($('billKwh').disabled && $('billReset').disabled, 'the bill card is locked during a game'); $('gQuit').click(); ok(!$('billKwh').disabled, 'and unlocks when the game ends');
$('billReset').click();
console.log('site checks passed:', n);
