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
  .replace('<script src="mcpconfig.js"></script>', '<script>' + read('mcpconfig.js') + '</script>')
  .replace('<script src="assistant.js"></script>', '<script>' + read('assistant.js') + '</script>')
  .replace('<script src="app.js"></script>', '<script>' + read('app.js') + '</script>');
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window, $ = (id) => w.document.getElementById(id);
const setRange = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };

ok($('nowebgl'), 'without WebGL the page says so and keeps working');
ok($('ask').hidden && $('chatToggle').getAttribute('aria-expanded') === 'false' && $('chatToggle').textContent === 'Ask about your month', 'on a fresh page the chat starts folded');
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
const settle = () => { if (!$('firstLook').hidden) $('flExplore').click(); };   // a first-time set-up ends in the first look: dismiss it where a flow carries on
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
$('wizDone').click(); settle();
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
$('wizDone').click(); settle(); $('signOut').click(); submitGate('ali@example.com'); ok(val('house') === 'condo', 'and the first person\'s home is untouched');
$('gStart').click(); ok($('editHome').disabled, 'Edit home is locked during a game'); $('gQuit').click(); ok(!$('editHome').disabled, 'and unlocks after');
const usersBefore = JSON.stringify(stored().users); $('signOut').click(); $('gateGuest').click();
ok(!$('wizard').hidden && $('userName').textContent === 'Guest' && $('signOut').textContent === 'Leave', 'a guest sees the set-up and is labelled a guest');
setW('w_house', 'semid', 'change'); setRange('trees', 5); $('wizDone').click(); settle();
ok(JSON.stringify(stored().users) === usersBefore && !/semid/.test(w.localStorage.getItem('terrarium.v1')), 'nothing about the guest is written to storage');
$('signOut').click(); ok(!$('gate').hidden, 'leaving returns to the gate');
// placing your lot
const lotsRead = () => $('lotRead').textContent, bar = () => !$('placeBar').hidden;
submitGate('lot@example.com'); ok(!$('wizard').hidden && !$('wizNext').hidden, 'a new person is offered the next step: place your lot');
setW('w_house', 'semid', 'change'); $('wizNext').click();
ok($('wizard').hidden && bar() && $('lotSel').querySelectorAll('option[value]').length >= 12, 'Next closes the dialog and opens the lot chooser with every lot listed');
ok(lotsRead() === 'No lot chosen yet.' && $('lotSel').querySelector('option[value=""]'), 'nothing is chosen until you choose');
$('lotConfirm').click(); settle(); ok(bar() && lotsRead() === 'Choose a lot first.', 'confirming with no lot is refused');
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
$('lotConfirm').click(); settle(); ok(!bar() && lotOf('lot@example.com') === 5 && stored().users['lot@example.com'].setUp === true, 'Confirm saves the lot and marks the home set up');
$('signOut').click(); submitGate('lot@example.com'); ok($('wizard').hidden && distNow(), 'signing back in restores the lot');
$('moveHouse').click(); $('lotSel').value = '2'; $('lotSel').dispatchEvent(new w.Event('change', { bubbles: true }));
w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); ok(!bar() && lotOf('lot@example.com') === 5, 'Escape cancels and keeps the old lot');
$('moveHouse').click(); ok($('lotSel').value === '5', 'the chooser opens on the lot you already have'); $('lotCancel').click();
$('gStart').click(); ok($('moveHouse').disabled, 'Move house is locked during a game'); $('gQuit').click();
$('moveHouse').click(); $('gStart').click(); ok(!bar(), 'starting a game while placing cancels the placing');
$('moveHouse').dispatchEvent(new w.Event('click', { bubbles: true })); ok(!bar(), 'and even a forced click on Move house does nothing during a game'); $('gQuit').click();
$('moveHouse').click(); $('signOut').click(); ok(!bar(), 'signing out closes the chooser');
$('gateGuest').click(); $('wizNext').click(); $('lotSel').value = '3'; $('lotSel').dispatchEvent(new w.Event('change', { bubbles: true })); const usersG = JSON.stringify(stored().users);
$('lotConfirm').click(); settle(); ok(JSON.stringify(stored().users) === usersG, 'a guest\'s lot is never written to storage'); $('signOut').click();
// condo levels
const figVal = (t) => [...$('figs').querySelectorAll('.fig')].find((f) => f.textContent.includes(t)).querySelector('b').textContent;
submitGate('floor@example.com'); $('wizDone').click(); settle();
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
setW('w_house', 'condo', 'change'); ok(val('w_level') === '3', 'and switching back remembers it'); $('wizDone').click(); settle();
$('signOut').click(); submitGate('floor@example.com'); ok(val('house') === 'condo' && val('level') === '3', 'signing back in restores the condo and its floor');
$('gStart').click(); ok(!$('level').disabled, 'the floor can still be changed before the first week is locked in'); $('gLock').click(); ok($('level').disabled, 'and it is locked once a week has been played, like the rest of the setup'); $('gQuit').click(); ok(!$('level').disabled, 'and unlocks when the game ends');
$('signOut').click();
// first look
const fl = () => !$('firstLook').hidden, flText = () => $('flBody').textContent;
ok(w.document.getElementById('firstLook').getAttribute('role') === 'dialog' && w.document.getElementById('firstLook').getAttribute('aria-modal') === 'true', 'the first look is an accessible dialog');
submitGate('look@example.com'); ok(!fl(), 'it does not open at sign-in, before the home is set up');
setW('w_house', 'semid', 'change'); $('wizNext').click(); $('lotSel').value = '5'; $('lotSel').dispatchEvent(new w.Event('change', { bubbles: true })); ok(!fl(), 'nor while the lot is being chosen');
$('lotConfirm').click();
ok(fl() && !bar() && $('wizard').hidden, 'confirming the lot ends set-up and opens the first look');
ok(/Semi-D house on lot 6, would use about \d+ kWh a month, an electricity bill of about RM \d+/.test(flText()) && /about \d\.\d\d km from your lot, around \d+ minutes on foot/.test(flText()), 'it says what the month costs and how far the stop is from that lot');
ok(/You score \d+ out of one hundred/.test(flText()) && /Strongest: .+\. Weakest: .+\./.test(flText()) && /illustrative until you enter a real bill/.test(flText()), 'with the score, the strongest and weakest pillar, and that it is illustrative');
const expectChecked = w.TerrariumAI.ask('What would living here cost me?', { input: Object.assign({}, w.Terrarium.DEFAULTS, { house: 'semid', lot: 5 }) }).checked;
ok($('flCheck').textContent === 'Checked ' + expectChecked + ' figures against the model before showing this.' && expectChecked >= 9 && !/[⦃⦄⟦⟧]/.test(flText()) && !/undefined|NaN/.test(flText()), 'every figure was checked, and nothing raw or broken shows');
const pageKwh = parseInt(figVal('Electricity this month')); ok(flText().includes(pageKwh + ' kWh a month'), 'and it agrees with the figures on the page');
$('flPlay').click(); ok(!fl() && $('gLock'), 'Play the month closes it and starts the game'); $('gQuit').click();
$('myMonth').click(); ok(fl(), 'My month reopens it any time'); w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); ok(!fl(), 'Escape closes it');
setRange('trees', 9); $('myMonth').click(); const flAfter = flText(); $('flExplore').click(); ok(!fl(), 'Explore closes it'); ok(flAfter.includes(parseInt(figVal('Electricity this month')) + ' kWh a month'), 'reopened, it reflects the latest home');
$('myMonth').click(); ok(fl(), 'reopened for the sign-out check'); $('signOut').click(); ok(!fl() && !$('gate').hidden, 'signing out closes the first look and shows the gate'); submitGate('look@example.com'); ok(!fl(), 'and signing back in does not reopen it');
$('gStart').click(); ok($('myMonth').disabled, 'My month is locked during a game'); $('myMonth').dispatchEvent(new w.Event('click', { bubbles: true })); ok(!fl(), 'and a forced click does nothing'); $('gQuit').click();
$('signOut').click(); submitGate('look@example.com'); ok(!fl() && $('wizard').hidden, 'a returning user goes straight to their home, with no first look');
$('editHome').click(); $('wizDone').click(); ok(!fl(), 'editing the home later does not pop it up again');
$('signOut').click(); submitGate('skip@example.com'); $('wizDone').click();
ok(fl() && /You have not placed a lot yet/.test(flText()) && /0\.93 km from the township centre/.test(flText()), 'saving without placing a lot still gives a first look, using the real centre distance'); settle();
$('signOut').click(); submitGate('back@example.com'); $('wizNext').click(); $('lotCancel').click();
ok(!fl() && !$('wizard').hidden, 'cancelling the lot in a first run goes back to the set-up, not to the dashboard'); $('wizDone').click(); ok(fl(), 'and finishing it then opens the first look'); settle();
$('signOut').click(); $('gateGuest').click(); $('wizDone').click(); ok(fl() && /would use about/.test(flText()), 'a guest gets the first look too'); settle(); $('signOut').click();
submitGate('fail@example.com'); const realAsk2 = w.TerrariumAI.ask; w.TerrariumAI.ask = (q, c) => realAsk2(q, c, () => ({ intent: 'x', text: ['It will cost 35% less for sure.'], claims: [], cards: [], calls: [] }));
$('wizDone').click(); ok(fl() && $('flCheck').textContent.includes('did not pass') && !flText().includes('35%'), 'if the checked answer fails, the dialog says so and shows none of its text'); w.TerrariumAI.ask = realAsk2; settle(); $('signOut').click();
// compare
const cmpOpen = () => !$('compare').hidden, cmpRows = () => [...$('cmpTable').querySelectorAll('tbody tr')];
const cmpRow = (label) => cmpRows().find((r) => r.querySelector('th').textContent.startsWith(label));
const cmpCell = (label, col) => cmpRow(label).querySelectorAll('td')[col - 1];   // column 1 is A, 2 is B, 3 is the difference (the label is a th)
const r2 = (x) => Math.round(x * 100) / 100, shownDiff = (a, b) => Math.abs(r2(r2(b) - r2(a))).toFixed(2);   // the difference of the two rounded numbers on screen, so the columns always subtract
const pickB = (id, v, ev) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event(ev || 'change', { bubbles: true })); };
ok(w.document.getElementById('compare').getAttribute('role') === 'dialog' && w.document.getElementById('compare').getAttribute('aria-modal') === 'true', 'the comparison is an accessible dialog');
submitGate('cmp@example.com'); setW('w_house', 'terrace', 'change'); $('wizNext').click(); pickB('lotSel', '1'); $('lotConfirm').click(); settle(); setRange('trees', 4);
ok(!cmpOpen(), 'the comparison starts closed'); $('compareBtn').click();
ok(cmpOpen() && cmpRows().length === 11 && /Compared with your home, option B has/.test($('cmpSay').textContent), 'Compare opens a table of eleven figures with a summary');
const lotNear = w.Terrarium.nearestOtherLot(1);
ok($('cmpLot').value === String(lotNear) && $('cmpHouse').value === 'terrace', 'option B starts as your home on the lot nearest the bus stop');
ok(/^A: Terrace house, lot 2$/.test($('cmpTable').querySelectorAll('thead th')[1].textContent) && /^B: Terrace house, lot \d+$/.test($('cmpTable').querySelectorAll('thead th')[2].textContent), 'the columns name the two homes');
const li = w.Terrarium.lotInfo(lotNear);
ok(cmpCell('Distance to the bus stop', 1).textContent.startsWith(w.Terrarium.lotInfo(1).km.toFixed(2) + ' km') && cmpCell('Distance to the bus stop', 2).textContent.startsWith(li.km.toFixed(2) + ' km'), 'the distances are each lot\'s own');
ok(cmpCell('Distance to the bus stop', 2).classList.contains('win') && cmpCell('Distance to the bus stop', 2).textContent.includes('\u2713') && !cmpCell('Distance to the bus stop', 1).classList.contains('win'), 'the nearer lot is marked better, and only it');
ok(cmpCell('Electricity per month', 3).textContent === 'same' && !cmpCell('Electricity per month', 1).classList.contains('win') && !cmpCell('Electricity per month', 2).classList.contains('win'), 'a figure that does not differ says same and wins nothing');
ok(/^Checked \d+ figures? against the model/.test($('cmpCheck').textContent) && !/[⦃⦄⟦⟧]/.test($('cmpSay').textContent) && !/undefined|NaN/.test($('cmpTable').textContent + $('cmpSay').textContent), 'the summary was checked, with nothing raw or broken');
ok(cmpCell('Distance to the bus stop', 3).textContent === '\u2212' + shownDiff(w.Terrarium.lotInfo(1).km, li.km) + ' km', 'a nearer option B shows a minus difference, worked out from the two numbers shown');
pickB('cmpLot', '11'); ok(cmpCell('Distance to the bus stop', 2).textContent.startsWith(w.Terrarium.lotInfo(11).km.toFixed(2) + ' km'), 'choosing another lot updates the table');
const farLot = [...Array(12).keys()].sort((x, y) => w.Terrarium.lotDistanceKm(y) - w.Terrarium.lotDistanceKm(x))[0]; pickB('cmpLot', String(farLot));
ok(cmpCell('Distance to the bus stop', 3).textContent === '+' + shownDiff(w.Terrarium.lotInfo(1).km, w.Terrarium.lotInfo(farLot).km) + ' km', 'and a farther one shows a plus');
ok(cmpCell('Distance to the bus stop', 1).classList.contains('win') && /farther/.test($('cmpSay').textContent), 'a farther lot makes your own home the better one on distance, and the summary says farther');
ok($('cmpLevelRow').hidden, 'no floor control for a house'); pickB('cmpHouse', 'condo'); ok(!$('cmpLevelRow').hidden && /Condominium, level 1/.test($('cmpTable').textContent), 'choosing a condo asks for its floor');
pickB('cmpLevel', '4', 'input'); ok(/Condominium, level 4, lot/.test($('cmpTable').textContent) && $('cmpLevelV').textContent === 'level 4 of 8', 'and the floor shows in the table');
ok(cmpCell('Electricity per month', 2).classList.contains('win'), 'the smaller condo uses less electricity and is marked better');
pickB('cmpHouse', 'terrace'); pickB('cmpLot', '1');
ok($('cmpApply').disabled && /come out the same/.test($('cmpSay').textContent) && !$('cmpTable').querySelector('.win'), 'option B equal to your home: nothing wins, the summary says so, and there is nothing to apply');
pickB('cmpHouse', 'condo'); pickB('cmpLevel', '4', 'input'); pickB('cmpLot', '5'); const beforeHome = [val('house'), val('level')];
$('cmpClose').click(); ok(!cmpOpen() && val('house') === beforeHome[0], 'Close changes nothing');
$('compareBtn').click(); pickB('cmpHouse', 'condo'); pickB('cmpLevel', '4', 'input'); pickB('cmpLot', '5'); ok(!$('cmpApply').disabled, 'a different option B can be applied');
$('cmpApply').click();
ok(!cmpOpen() && val('house') === 'condo' && val('level') === '4' && stored().users['cmp@example.com'].home.lot === 5 && stored().users['cmp@example.com'].home.house === 'condo', 'Make option B my home closes the dialog, changes the home and saves it');
$('compareBtn').click(); ok(/^A: Condominium, level 4, lot 6$/.test($('cmpTable').querySelectorAll('thead th')[1].textContent), 'and option A is now that home'); w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); ok(!cmpOpen(), 'Escape closes it');
$('gStart').click(); ok($('compareBtn').disabled, 'Compare is locked during a game'); $('compareBtn').dispatchEvent(new w.Event('click', { bubbles: true })); ok(!cmpOpen(), 'and a forced click does nothing'); $('gQuit').click();
$('compareBtn').click(); ok(cmpOpen(), 'reopened for the sign-out check'); $('signOut').click(); ok(!cmpOpen() && !$('gate').hidden, 'signing out closes it');
submitGate('nolot@example.com'); $('wizDone').click(); ok(fl(), 'a first look opens when set-up ends without a lot');
$('flCompare').click(); ok(!fl() && cmpOpen(), 'Compare with another lot, from the first look, opens the comparison');
ok(cmpCell('Distance to the bus stop', 1).textContent.startsWith('0.93 km') && $('cmpLot').value === String(w.Terrarium.nearestOtherLot(-1)) && /lot not placed/.test($('cmpTable').textContent), 'with no lot placed, A uses the real centre distance and B starts on the nearest lot');
const realAsk3 = w.TerrariumAI.ask; w.TerrariumAI.ask = (q, c) => realAsk3(q, c, () => ({ intent: 'x', text: ['Option B saves 99% for sure.'], claims: [], cards: [], calls: [] })); pickB('cmpLot', '3');
ok($('cmpCheck').textContent.includes('did not pass') && !$('cmpSay').textContent.includes('99%') && cmpRows().length === 11, 'if the checked summary fails it says so and shows none of its text, while the table, which is plain arithmetic, still shows'); w.TerrariumAI.ask = realAsk3;
$('cmpClose').click(); $('signOut').click();
// the two pages: Map and Analysis
const shown = (id) => !$(id).hidden, inside = (id, ancestor) => !!$(id).closest(ancestor), T0 = w.__terrarium;
const hashTo = (h) => { w.location.hash = h; w.dispatchEvent(new w.HashChangeEvent('hashchange')); };
settle(); T0.go('map');
ok(shown('viewMap') && !shown('viewAnalysis') && T0.view() === 'map', 'the Map is the first page');
ok($('tabMap').getAttribute('aria-current') === 'page' && !$('tabAnalysis').hasAttribute('aria-current') && $('tabMap').getAttribute('href') === '#/map' && $('tabAnalysis').getAttribute('href') === '#/analysis', 'the navigation links to both pages and marks the current one');
ok(inside('stage', '#viewMap') && inside('game', '#dock') && inside('ask', '#chat') && inside('inspect', '#stage') && inside('placeBar', '#stage') && inside('follow', '#stage'), 'the township, the play dock, the chat and the inspect panel are on the Map');
ok(['choices', 'handover', 'pillars', 'chart', 'figs', 'house', 'billForm'].every((id) => inside(id, '#viewAnalysis')), 'habits, the bill, the scores, the chart and the figures are on the Analysis page');
T0.go('analysis');
ok(!shown('viewMap') && shown('viewAnalysis') && T0.view() === 'analysis' && w.location.hash === '#/analysis' && w.document.title === 'Terrarium \u00b7 Analysis', 'going to Analysis swaps the page, the address and the title');
ok($('tabAnalysis').getAttribute('aria-current') === 'page' && !$('tabMap').hasAttribute('aria-current'), 'and the navigation follows');
hashTo('#/map'); ok(shown('viewMap') && !shown('viewAnalysis'), 'the address bar can switch the page back (Back and bookmarks work)');
hashTo('#/analysis'); ok(shown('viewAnalysis') && !shown('viewMap'), 'and forward again'); hashTo('#/nonsense'); ok(shown('viewMap') && !shown('viewAnalysis'), 'an address we do not know falls back to the Map');
// the chat floats over the map
T0.openChat(false); ok(!shown('ask') && $('chatToggle').getAttribute('aria-expanded') === 'false' && $('chatToggle').textContent === 'Ask about your month', 'folding the chat shows the button as Ask about your month');
$('chatToggle').click(); ok(shown('ask') && $('chatToggle').getAttribute('aria-expanded') === 'true' && $('chatToggle').textContent === 'Close chat', 'the chat button opens it');
$('chatToggle').click(); ok(!shown('ask') && $('chatToggle').getAttribute('aria-expanded') === 'false', 'and closes it');
$('chatToggle').click(); w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); ok(!shown('ask'), 'Escape closes the chat');
T0.go('analysis'); ask('Give me the briefing'); ok(T0.view() === 'map' && shown('ask') && /This month your home uses/.test($('askOut').textContent), 'asking from the Analysis page takes you to the Map and opens the chat on the answer');
$('chatToggle').click();
// the play dock
ok(shown('dockBody') && $('dockToggle').getAttribute('aria-expanded') === 'true', 'the play dock starts open');
$('dockToggle').click(); ok(!shown('dockBody') && $('dockToggle').getAttribute('aria-expanded') === 'false', 'the dock folds'); $('dockToggle').click(); ok(shown('dockBody'), 'and opens again');
// actions that need the map take you there
T0.go('analysis'); $('moveHouse').click(); ok(T0.view() === 'map' && !$('placeBar').hidden, 'Move house from the Analysis page opens the lot chooser on the Map'); $('lotCancel').click();
T0.go('analysis'); $('myMonth').click(); ok(fl() && T0.view() === 'analysis', 'My month opens the first look on either page'); $('flExplore').click(); ok(!fl() && T0.view() === 'map', 'Explore the township takes you to the Map');
T0.go('analysis'); if (shown('dockBody')) $('dockToggle').click(); ok(!shown('dockBody'), 'the dock is folded before playing from the first look'); $('myMonth').click(); $('flPlay').click(); ok(!fl() && T0.view() === 'map' && shown('dockBody') && $('gLock'), 'Play the month takes you to the Map and starts the game'); $('gQuit').click();
T0.go('analysis'); $('editHome').click(); ok(!$('wizard').hidden && T0.view() === 'analysis', 'Edit home works on the Analysis page'); $('wizDone').click(); settle();
$('compareBtn').click(); ok(!$('compare').hidden && T0.view() === 'analysis', 'Compare works on the Analysis page'); $('cmpClose').click();
// the Analysis page's own bar
ok(/^(Terrace house|Semi-D house|Condominium)(, level \d)?, lot (\d+|not placed)$/.test($('anaHome').textContent), 'the home bar names the home the way Compare does');
$('anaMap').click(); ok(T0.view() === 'map', 'Show on the map goes to the Map'); T0.go('analysis');
$('anaCompare').click(); ok(!$('compare').hidden, 'the bar\'s Compare opens the comparison'); $('cmpClose').click();
$('anaMonth').click(); ok(fl(), 'the bar\'s My month opens the first look'); $('flExplore').click(); T0.go('analysis');
$('gStart').click(); T0.go('analysis'); ok($('anaCompare').disabled && $('anaMonth').disabled, 'the bar\'s buttons are locked during a game'); $('gQuit').click(); ok(!$('anaCompare').disabled && !$('anaMonth').disabled, 'and unlocked after');
// connect an AI assistant
const MC = w.TerrariumMcp; T0.go('analysis');
const setT = (id, v) => { const e = $(id); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
const pickC = (v) => { $('mcpClient').value = v; $('mcpClient').dispatchEvent(new w.Event('change', { bubbles: true })); };
const exported = () => decodeURIComponent($('dlHome').getAttribute('href').replace(/^data:application\/json;charset=utf-8,/, ''));
const cfgText = () => ($('mcpConfigText') || {}).textContent;
const SRV = '/Users/me/My Projects/terrarium/mcp/server.mjs', HOMEF = '/Users/me/Downloads/terrarium-home.json';
ok(inside('connect', '#viewAnalysis') && !inside('connect', '#viewMap'), 'the Connect card is on the Analysis page');
ok($('dlHome').getAttribute('download') === 'terrarium-home.json' && /^data:application\/json;charset=utf-8,/.test($('dlHome').getAttribute('href')), 'the home downloads as terrarium-home.json');
const first = w.TerrariumProfile.parseHomeFile(exported());
ok(first.ok && first.dropped.length === 0 && first.home.house === val('house') && first.home.trees === +val('trees') && first.home.level === +val('level'), 'the file is a valid Terrarium home with what the page shows');
ok(!/@|email|password|token/i.test(exported()), 'it never contains an email or any secret');
ok($('dlWhat').textContent === w.Terrarium.homeLabel({ house: val('house'), level: +val('level'), lot: JSON.parse(exported()).home.lot }), 'the page names the home the file holds');
const fileBefore = exported(); setRange('trees', 9); ok(exported() !== fileBefore && JSON.parse(exported()).home.trees === 9, 'changing the home changes the file');
ok([...$('mcpClient').options].map((o) => o.value).join() === 'workbuddy,claude-code,claude-desktop,generic' && val('mcpClient') === 'workbuddy', 'the four assistants are offered, WorkBuddy first');
ok(!$('mcpConfigText') && /paste the two paths/.test($('mcpOut').textContent) && $('mcpCopy').hidden, 'with no paths yet it says what to do and shows no config');
setT('mcpServer', SRV); ok(!$('mcpConfigText') && /paste the two paths/.test($('mcpOut').textContent), 'one path is not enough');
setT('mcpHome', HOMEF);
{ const j = JSON.parse(cfgText()).mcpServers.terrarium; ok(j.type === 'stdio' && j.command === 'node' && JSON.stringify(j.args) === JSON.stringify([SRV, '--home', HOMEF]) && !('env' in j), 'WorkBuddy gets a stdio entry with the home as an argument, never env, and paths with spaces intact'); }
ok(cfgText() === MC.configFor('workbuddy', { serverPath: SRV, homePath: HOMEF }).text && !$('mcpCopy').hidden, 'it is exactly what the command-line generator prints, and Copy appears');
ok(/~\/\.workbuddy-ai\/mcp\.json/.test($('mcpOut').textContent) && /Merge it into any existing mcpServers/.test($('mcpOut').textContent) && /do not see your shell's PATH/.test($('mcpOut').textContent) && /Do not move it into an env block/.test($('mcpOut').textContent), 'it says where the file goes, to merge, and warns about PATH and env');
pickC('claude-code'); ok(cfgText().startsWith("claude mcp add terrarium -- 'node' '" + SRV + "' '--home' '" + HOMEF + "'") && /\.mcp\.json/.test($('mcpOut').textContent) && $('mcpOut').querySelectorAll('pre').length === 2, 'Claude Code gets the add command and the JSON alternative');
pickC('claude-desktop'); { const j = JSON.parse(cfgText()).mcpServers.terrarium; ok(!('type' in j) && /claude_desktop_config\.json/.test($('mcpOut').textContent), 'Claude Desktop gets no type, and its file location'); }
pickC('workbuddy');
setT('mcpNode', '/Users/me/.nvm/versions/node/v24.20.0/bin/node'); ok(JSON.parse(cfgText()).mcpServers.terrarium.command === '/Users/me/.nvm/versions/node/v24.20.0/bin/node', 'a full node path replaces "node"'); setT('mcpNode', '');
setT('mcpServer', 'mcp/server.mjs'); ok(!$('mcpConfigText') && /absolute path/.test($('mcpOut').textContent) && $('mcpCopy').hidden, 'a relative path is refused with the reason, and no config is shown');
setT('mcpServer', '~/mcp/server.mjs'); ok(!$('mcpConfigText') && /absolute path/.test($('mcpOut').textContent), 'a ~ is refused too');
setT('mcpServer', SRV); setT('mcpHome', 'home.json'); ok(!$('mcpConfigText') && /home file path must be an absolute path/.test($('mcpOut').textContent), 'a relative home path is refused'); setT('mcpHome', HOMEF);
ok(!$('mcpHomeRow').hidden, 'the home path is asked for by default'); $('mcpDefaults').checked = true; $('mcpDefaults').dispatchEvent(new w.Event('change', { bubbles: true }));
ok($('mcpHomeRow').hidden && JSON.stringify(JSON.parse(cfgText()).mcpServers.terrarium.args) === JSON.stringify([SRV, '--defaults']) && /default demo home/.test($('mcpOut').textContent), 'a demo home hides the home path, uses --defaults and says it is a demo');
$('mcpDefaults').checked = false; $('mcpDefaults').dispatchEvent(new w.Event('change', { bubbles: true })); ok(!$('mcpHomeRow').hidden && /--home/.test(cfgText()), 'and switching back restores the home');
setT('mcpServer', '/tmp/<b>x</b>/<img src=x onerror=alert(1)>/server.mjs'); ok($('mcpOut').querySelector('img') === null && $('mcpOut').querySelectorAll('b').length === 1 && cfgText().includes('<img src=x onerror=alert(1)>') && !$('mcpOut').innerHTML.includes('<img'), 'a hostile path is shown as text, never as markup'); setT('mcpServer', SRV);
{ let copied = null; Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { copied = t; return Promise.resolve(); } } }); $('mcpCopy').click(); ok(copied === cfgText() && copied.includes(SRV), 'Copy puts the config on the clipboard'); }
setT('mcpServer', '  ' + SRV + '\n'); setT('mcpHome', ' ' + HOMEF + ' '); ok(JSON.stringify(JSON.parse(cfgText()).mcpServers.terrarium.args) === JSON.stringify([SRV, '--home', HOMEF]), 'pasted paths are trimmed of stray spaces and newlines');
ok($('mcpOut').querySelectorAll('i, a, img, script').length === 0 && $('mcpOut').querySelector('b').textContent === MC.configFor('workbuddy', { serverPath: SRV, homePath: HOMEF }).title, 'the title is plain text');
$('mcpClient').value = 'workbuddy'; T0.go('map'); ok(!shown('viewAnalysis'), 'and the card goes with the page');
ok(inside('scrub', '#viewMap') && $('scrub').type === 'range' && $('scrub').getAttribute('aria-label') && $('scrub').value === '0' && $('scrub').max === '719' && $('scrubTicks').children.length === 4 && $('scrubOut').textContent === 'Day 1 \u00b7 06:00', 'the Map has a timeline for the month, with a tick at each week');
$('scrub').value = '100'; $('scrub').dispatchEvent(new w.Event('input', { bubbles: true })); ok($('scrub').value === '100', 'without WebGL, dragging the timeline does nothing and does not throw');
ok($('viewLab').getAttribute('aria-pressed') === 'true' && $('viewExploded').getAttribute('aria-pressed') === 'false' && $('viewLab').classList.contains('on') && $('viewExploded').textContent === 'Exploded' && inside('viewExploded', '#viewMap'), 'the Map offers Lab (pressed) and Exploded');
ok($('viewStudio').getAttribute('aria-pressed') === 'false' && $('viewStudio').textContent === 'Studio' && inside('viewStudio', '#viewMap'), 'the Map also offers Studio');
$('viewExploded').click(); ok($('viewExploded').getAttribute('aria-pressed') === 'false', 'without WebGL the switch does nothing and does not throw');
T0.go('map');
console.log('site checks passed:', n);
