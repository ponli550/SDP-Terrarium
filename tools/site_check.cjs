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
  .replace('<script src="profile.js"></script>', '<script>' + read('profile.js') + '</script>')
  .replace('<script src="assistant.js"></script>', '<script>' + read('assistant.js') + '</script>')
  .replace('<script src="app.js"></script>', '<script>' + read('app.js') + '</script>');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
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
// sign-in, the saved home, the set-up dialog
const submitGate = (email) => { $('gateEmail').value = email; $('gateForm').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); };
const stored = () => JSON.parse(w.localStorage.getItem('terrarium.v1') || '{"users":{}}');
const val = (id) => $(id).value;
ok(!$('gate').hidden && $('wizard').hidden && $('userChip').hidden, 'a visitor with no session sees the sign-in gate first');
ok(w.document.getElementById('gate').getAttribute('role') === 'dialog' && w.document.getElementById('gate').getAttribute('aria-modal') === 'true', 'the gate is an accessible dialog');
ok($('gateNote').textContent.includes('no password') && $('gateNote').textContent.includes('nothing leaves this browser'), 'the demo sign-in says plainly that it has no password');
submitGate('not an email'); ok(!$('gate').hidden && /valid email/.test($('gateErr').textContent), 'a bad email is refused with a reason and the gate stays');
submitGate('Ali@Example.com');
ok($('gate').hidden && !$('wizard').hidden && $('userName').textContent === 'ali@example.com' && !$('userChip').hidden, 'a first sign-in opens the home set-up and shows who is signed in');
ok(val('w_house') === 'terrace' && val('w_trees') === '2', 'the set-up starts from the defaults');
const setW = (id, v, ev) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event(ev || 'input', { bubbles: true })); };
setW('w_house', 'condo', 'change'); setW('w_solarKwp', 4); setW('w_trees', 7); setW('w_nativeShare', 60);
ok(val('house') === 'condo' && val('solarKwp') === '4' && val('trees') === '7' && val('nativeShare') === '60', 'the set-up dialog edits the same home the page shows');
ok($('pillars').textContent.includes('Urban Biodiversity'), 'and the scores follow it');
$('wizDone').click();
ok($('wizard').hidden, 'Save home closes the dialog');
ok(stored().users['ali@example.com'].home.house === 'condo' && stored().users['ali@example.com'].home.solarKwp === 4 && stored().users['ali@example.com'].setUp === true, 'the home is saved in this browser and marked set up');
setRange('trees', 9); ok(stored().users['ali@example.com'].home.trees === 9, 'editing on the page autosaves');
$('editHome').click(); ok(!$('wizard').hidden && val('w_trees') === '9' && val('w_house') === 'condo', 'Edit home reopens the dialog with the saved values');
w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); ok($('wizard').hidden, 'Escape closes it');
$('signOut').click();
ok(!$('gate').hidden && $('userChip').hidden && val('house') === 'terrace' && val('trees') === '2', 'signing out shows the gate and clears the home from the page');
submitGate('ali@example.com');
ok($('gate').hidden && $('wizard').hidden && val('house') === 'condo' && val('trees') === '9' && val('solarKwp') === '4', 'signing back in restores the saved home and skips the set-up');
$('signOut').click(); submitGate('bo@example.com');
ok(!$('wizard').hidden && val('house') === 'terrace' && val('trees') === '2', 'a different person starts with their own empty home');
$('wizDone').click(); $('signOut').click(); submitGate('ali@example.com'); ok(val('house') === 'condo', 'and the first person\'s home is untouched');
$('gStart').click(); ok($('editHome').disabled, 'Edit home is locked during a game'); $('gQuit').click(); ok(!$('editHome').disabled, 'and unlocks after');
const usersBefore = JSON.stringify(stored().users); $('signOut').click(); $('gateGuest').click();
ok(!$('wizard').hidden && $('userName').textContent === 'Guest' && $('signOut').textContent === 'Leave', 'a guest sees the set-up and is labelled a guest');
setW('w_house', 'semid', 'change'); setRange('trees', 5); $('wizDone').click();
ok(JSON.stringify(stored().users) === usersBefore && !/semid/.test(w.localStorage.getItem('terrarium.v1')), 'nothing about the guest is written to storage');
$('signOut').click(); ok(!$('gate').hidden, 'leaving returns to the gate');
// placing your lot
const lotsRead = () => $('lotRead').textContent, bar = () => !$('placeBar').hidden;
submitGate('lot@example.com'); ok(!$('wizard').hidden && !$('wizNext').hidden, 'a new person is offered the next step: place your lot');
setW('w_house', 'semid', 'change'); $('wizNext').click();
ok($('wizard').hidden && bar() && $('lotSel').querySelectorAll('option[value]').length >= 12, 'Next closes the dialog and opens the lot chooser with every lot listed');
ok(lotsRead() === 'No lot chosen yet.' && $('lotSel').querySelector('option[value=""]'), 'nothing is chosen until you choose');
$('lotConfirm').click(); ok(bar() && lotsRead() === 'Choose a lot first.', 'confirming with no lot is refused');
$('lotSel').value = '5'; $('lotSel').dispatchEvent(new w.Event('change', { bubbles: true }));
ok(/^Lot 6: \d\.\d\d km to the bus stop, about \d+ min on foot/.test(lotsRead()) && /illustrative/.test(lotsRead()), 'choosing a lot reads out its distance and says the layout is a drawing');
ok(!$('lotSel').querySelector('option[value=""]'), 'the placeholder option goes once a lot is chosen');
const lotOf = (email) => (stored().users[email] || { home: {} }).home.lot;
ok(lotOf('lot@example.com') === undefined, 'a lot being tried out is not saved yet');
const distNow = () => [...$('figs').querySelectorAll('.fig')].find((f) => f.textContent.includes('Your lot to the bus stop'));
ok(distNow() && distNow().querySelector('.badge').textContent === 'ILLUSTRATIVE', 'the figures switch to the lot\'s distance, graded illustrative');
$('lotSel').value = '1'; $('lotSel').dispatchEvent(new w.Event('change', { bubbles: true })); const farKm = lotsRead();
$('lotCancel').click(); ok(!bar() && !distNow() && lotOf('lot@example.com') === undefined, 'Cancel puts everything back and saves nothing');
$('moveHouse').click(); ok(bar(), 'Move house reopens the chooser'); $('lotSel').value = '5'; $('lotSel').dispatchEvent(new w.Event('change', { bubbles: true }));
$('lotConfirm').click(); ok(!bar() && lotOf('lot@example.com') === 5 && stored().users['lot@example.com'].setUp === true, 'Confirm saves the lot and marks the home set up');
$('signOut').click(); submitGate('lot@example.com'); ok($('wizard').hidden && distNow(), 'signing back in restores the lot');
$('moveHouse').click(); $('lotSel').value = '2'; $('lotSel').dispatchEvent(new w.Event('change', { bubbles: true }));
w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); ok(!bar() && lotOf('lot@example.com') === 5, 'Escape cancels and keeps the old lot');
$('moveHouse').click(); ok($('lotSel').value === '5', 'the chooser opens on the lot you already have'); $('lotCancel').click();
$('gStart').click(); ok($('moveHouse').disabled, 'Move house is locked during a game'); $('gQuit').click();
$('moveHouse').click(); $('gStart').click(); ok(!bar(), 'starting a game while placing cancels the placing');
$('moveHouse').dispatchEvent(new w.Event('click', { bubbles: true })); ok(!bar(), 'and even a forced click on Move house does nothing during a game'); $('gQuit').click();
$('moveHouse').click(); $('signOut').click(); ok(!bar(), 'signing out closes the chooser');
$('gateGuest').click(); $('wizNext').click(); $('lotSel').value = '3'; $('lotSel').dispatchEvent(new w.Event('change', { bubbles: true })); const usersG = JSON.stringify(stored().users);
$('lotConfirm').click(); ok(JSON.stringify(stored().users) === usersG, 'a guest\'s lot is never written to storage'); $('signOut').click();
// condo levels
const figVal = (t) => [...$('figs').querySelectorAll('.fig')].find((f) => f.textContent.includes(t)).querySelector('b').textContent;
submitGate('floor@example.com'); $('wizDone').click();
ok($('levelRow').hidden, 'a house has no floor control');
$('house').value = 'condo'; $('house').dispatchEvent(new w.Event('change', { bubbles: true }));
ok(!$('levelRow').hidden && $('levelV').textContent === 'level 1 of 8', 'choosing a condo asks for the floor, starting at level 1');
const kwhAt = (lv) => { setRange('level', lv); return figVal('Electricity this month'); };
setRange('trees', 6); setRange('walkShare', 50);
const k1 = kwhAt(1), k4 = kwhAt(4), k8 = kwhAt(8);
ok(parseInt(k1) < parseInt(k4) && parseInt(k4) < parseInt(k8), 'a higher floor changes the month: level 1 ' + k1 + ', level 4 ' + k4 + ', level 8 ' + k8);
ok($('levelV').textContent === 'level 8 of 8' && parseInt(figVal('Walking this month')) > 0, 'the floor reads out as level of eight');
setRange('level', 6); ok(stored().users['floor@example.com'].home.level === 6 && stored().users['floor@example.com'].home.house === 'condo', 'the floor is saved with the home');
w.__terrarium.inspect('home'); ok(/level 6 of 8/.test($('inspect').textContent), 'the home panel names your level'); w.__terrarium.inspect('person'); ok(/Lift or stairs/.test($('inspect').textContent), 'and the walking panel shows the lift time'); w.__terrarium.inspect(null);
$('editHome').click(); ok(!$('wr_level').hidden && val('w_level') === '6', 'the set-up dialog shows the floor for a condo, with your saved value');
setW('w_level', 3); ok(val('level') === '3' && $('levelV').textContent === 'level 3 of 8', 'and edits the same floor the page shows');
setW('w_house', 'terrace', 'change'); ok($('wr_level').hidden && $('levelRow').hidden, 'switching to a house hides the floor everywhere');
setW('w_house', 'condo', 'change'); ok(val('w_level') === '3', 'and switching back remembers it'); $('wizDone').click();
$('signOut').click(); submitGate('floor@example.com'); ok(val('house') === 'condo' && val('level') === '3', 'signing back in restores the condo and its floor');
$('gStart').click(); ok(!$('level').disabled, 'the floor can still be changed before the first week is locked in'); $('gLock').click(); ok($('level').disabled, 'and it is locked once a week has been played, like the rest of the setup'); $('gQuit').click(); ok(!$('level').disabled, 'and unlocks when the game ends');
$('signOut').click();
console.log('site checks passed:', n);
