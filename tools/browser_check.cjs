// Real-browser checks in headless Chrome (software WebGL). Skipped when Chrome is not installed.
// Proves what jsdom cannot: the 3D scene draws, a click lands on each object (and not through a blocker),
// and a locked-in game week plays to its end and opens round 2. Run: npm run test:browser
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path'), assert = require('assert');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) { console.log('browser checks skipped: no Chrome at ' + CHROME + ' (set CHROME)'); process.exit(0); }
const page = 'file://' + path.join(__dirname, '..', 'site', 'index.html');
// A dump with no scene state at all means Chrome did not finish (a launch problem), so it is retried once. A failed assertion is never retried.
const dump = (query, extra) => { const h = dumpOnce(query, extra); return /data-state=/.test(h) || !/frames=/.test(query) ? h : dumpOnce(query, extra); };
const dumpOnce = (query, extra) => spawnSync('perl', ['-e', 'alarm 120; exec @ARGV', CHROME, '--headless=new'].concat(extra || [], [ '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1000,700', '--virtual-time-budget=30000', '--dump-dom', page + '?shot&' + query]), { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '';
const attr = (h, name) => { const m = h.match(new RegExp('data-' + name + '="([^"]*)"')); return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null; };
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

let h = dump('picks=home,neighbour,stop,bus,corridor,solar,occluded&solarKwp=4&walk=0.5&frames=12&day=1&hour=7.9');
let picks = JSON.parse(attr(h, 'picks') || '{}');
ok(Object.keys(picks).length === 7, 'the pick probe ran');
['home', 'neighbour', 'stop', 'bus', 'corridor', 'solar'].forEach((k) => ok(picks[k] === k, 'a click on ' + k + ' lands on ' + k + ' (got ' + picks[k] + ')'));
ok(picks.occluded === 'none', 'a click behind an untagged blocker does not reach the home (got ' + picks.occluded + ')');
const img = h.match(/id="shotimg" src="data:image\/png;base64,([^"]+)"/);
ok(img && img[1].length > 100000, 'the 3D canvas drew something (a blank canvas is tiny)');

h = dump('picks=person&walk=0.5&solarKwp=2&frames=12&day=2&hour=7.9');
ok(JSON.parse(attr(h, 'picks') || '{}').person === 'person', 'a click on a walking resident lands on the resident');
h = dump('picks=car&walk=0&frames=12&day=1&hour=7.9');
ok(JSON.parse(attr(h, 'picks') || '{}').car === 'car', 'a click on a car lands on the car');

h = dump('follow=1&walk=0&frames=40&day=1&hour=6');
const st = JSON.parse(attr(h, 'state') || '{}');
ok(st.following === true && st.agents >= 1, 'following puts a trip on the road (agents ' + st.agents + ')');
ok(st.camToAgent !== null && st.camToAgent < 50, 'and the camera comes in close to it (distance ' + st.camToAgent + ', the default view is about 100)');
h = dump('walk=0&frames=40&day=1&hour=6');
const free = JSON.parse(attr(h, 'state') || '{}');
ok(free.following === false && free.camToHome > 90, 'without following the camera keeps the overview (distance ' + free.camToHome + ')');

// lazy motion: zoom eases toward a goal, clicking eases in on the thing, and reduced motion switches it all off
h = dump('wheel=-900&frames=40&day=1&hour=12');
let z = JSON.parse(attr(h, 'state')).zoom;
ok(z.start > 100 && z.end < z.start * 0.5 && z.end >= 35, 'a wheel scroll zooms in toward its goal (' + Math.round(z.start) + ' -> ' + Math.round(z.end) + ')');
ok(Math.abs(z.after1 - z.start) < 0.4 * Math.abs(z.end - z.start) && z.after1 !== z.start, 'and it is lazy: the first frame covers only ' + Math.round(100 * (z.after1 - z.start) / (z.end - z.start)) + '% of the way');
h = dump('inspect=stop&frames=60&day=1&hour=12'); let sel = JSON.parse(attr(h, 'state'));
ok(sel.targetToSel < 1 && sel.selDist < 80, 'clicking something eases the camera in on it (centred within ' + sel.targetToSel + ', distance ' + sel.selDist + ')');
h = dump('wheel=-900&frames=40&day=1&hour=12', ['--force-prefers-reduced-motion']); const rs = JSON.parse(attr(h, 'state'));
ok(rs.reduce === true && Math.abs(rs.zoom.after1 - rs.zoom.end) < 1, 'with reduced motion on, the same scroll lands at once (reduce ' + rs.reduce + ', first frame ' + Math.round(rs.zoom.after1) + ' of ' + Math.round(rs.zoom.end) + ')');

// what is actually drawn: a hidden attribute does not help if CSS sets display, which jsdom cannot see
h = dump('gate=1&frames=4'); let ui = JSON.parse(attr(h, 'ui'));
ok(ui.gate !== 'none' && ui.wizard === 'none' && ui.chip === 'none', 'at the gate: the gate is drawn, the dialog and the user chip are not (gate ' + ui.gate + ', wizard ' + ui.wizard + ', chip ' + ui.chip + ')');
h = dump('wizard=1&frames=4'); ui = JSON.parse(attr(h, 'ui'));
ok(ui.wizard !== 'none' && ui.gate === 'none' && ui.chip !== 'none', 'in set-up: the dialog and the chip are drawn, the gate is not');
h = dump('compare=1&lot=1&trees=4&frames=4'); ui = JSON.parse(attr(h, 'ui')); ok(ui.compare !== 'none' && ui.firstLook === 'none' && ui.gate === 'none', 'the comparison is drawn when open (compare ' + ui.compare + ')');
h = dump('firstlook=1&lot=5&frames=4'); ui = JSON.parse(attr(h, 'ui')); ok(ui.firstLook !== 'none' && ui.gate === 'none' && ui.wizard === 'none', 'the first look is drawn when open, and only it (first look ' + ui.firstLook + ')');
h = dump('frames=4'); ui = JSON.parse(attr(h, 'ui'));
ok(ui.gate === 'none' && ui.wizard === 'none' && ui.firstLook === 'none' && ui.compare === 'none' && ui.inspect === 'none' && ui.skip === 'none' && ui.chip !== 'none', 'in normal use nothing is drawn that should be hidden (inspect ' + ui.inspect + ', skip ' + ui.skip + ')');

// render hygiene, from measurements: removed meshes are disposed (about 108 geometries leaked per home rebuild before), trips do not leak, and the HUD is not rewritten every frame
const geoms = (q) => JSON.parse(attr(dump(q), 'state')).perf.geometries, hud = (q) => JSON.parse(attr(dump(q), 'state')).extra.hudWrites;
const g0 = geoms('frames=120'), g12 = geoms('stress=12&frames=120'), g48 = geoms('stress=48&frames=280');
ok(g0 > 400 && g0 < 1000, 'the scene holds a sensible number of geometries at rest (' + g0 + ')');
ok(g48 < g0 + 150 && Math.abs(g48 - g12) < 150, 'rebuilding the homes 48 times does not grow GPU memory (rest ' + g0 + ', after 12 rebuilds ' + g12 + ', after 48 ' + g48 + '; it was 678, 1873 and 5847 before the fix)');
const t30 = geoms('walk=0.5&frames=30&day=1&hour=6'), t1800 = geoms('walk=0.5&frames=1800&day=1&hour=6');
ok(t1800 < t30 + 40, 'walkers and cars coming and going do not leak (' + t30 + ' at the start, ' + t1800 + ' after 1800 frames)');
ok(hud('throttle=1&frames=120') <= 20 && hud('frames=120') > 100, 'the HUD is rewritten about ten times a second, not every frame (' + hud('throttle=1&frames=120') + ' writes in 120 frames, against ' + hud('frames=120') + ' unthrottled)');

// placing your lot: a real pointer click on a pad moves the home, and only while placing
h = dump('place=1&clicklot=5&frames=40&day=1&hour=12'); let pl = JSON.parse(attr(h, 'state'));
ok(pl.neighbours === 11 && pl.neighAtHome === 0, 'after the home moves, the neighbours are rebuilt around its new lot (' + pl.neighbours + ' neighbours, ' + pl.neighAtHome + ' on it)');
ok(pl.padsVisible === 12, 'while placing, all twelve pads are drawn (' + pl.padsVisible + ')');
ok(pl.placing === true && pl.lot === 5 && pl.homePos.x === 26 && pl.homePos.z === -10, 'clicking lot 6 while placing moves the home there (lot ' + pl.lot + ' at ' + pl.homePos.x + ',' + pl.homePos.z + ')');
ok(/Lot 6: 0\.\d\d km to the bus stop/.test(h), 'and the page reads out that lot\'s distance');
h = dump('clicklot=5&frames=40&day=1&hour=12'); pl = JSON.parse(attr(h, 'state'));
ok(pl.placing === false && pl.lot === 0 && pl.targetToSel === null, 'outside place mode the same click moves nothing and selects nothing (a hidden pad is not clickable)');
h = dump('place=1&leave=1&frames=12'); pl = JSON.parse(attr(h, 'state')); ok(pl.placing === false && pl.padsVisible === 0, 'leaving place mode hides every pad again (' + pl.padsVisible + ' left)');
h = dump('frames=12'); ok(JSON.parse(attr(h, 'state')).padsVisible === 0, 'and in normal use no pad is drawn');
for (const k of ['home', 'neighbour', 'stop']) { h = dump('clickkind=' + k + '&frames=24&day=1&hour=12'); pl = JSON.parse(attr(h, 'state')); ok(pl.selectedKind === k, 'a real click on the ' + k + ' inspects it (selected ' + pl.selectedKind + ')'); }
h = dump('place=1&clickkind=neighbour&frames=24&day=1&hour=12'); pl = JSON.parse(attr(h, 'state')); ok(pl.selectedKind === null && pl.lot !== 0, 'while placing, a click on a neighbour chooses its lot and does not inspect it (selected ' + pl.selectedKind + ', lot ' + pl.lot + ')');
// condo levels: your window and the air-con sit at your own level on the tower
const unitY = (q) => JSON.parse(attr(dump(q + '&frames=14&day=1&hour=12'), 'state')).unitY;
ok(unitY('house=condo&level=1') === 3 && Math.abs(unitY('house=condo&level=6') - 20) < 1e-9 && Math.abs(unitY('house=condo&level=8') - 26.8) < 1e-9, 'a condo unit stands at its own level: 3, 20 and 26.8 for levels 1, 6 and 8');
ok(Math.abs(unitY('house=condo&level=1&level2=6') - 20) < 1e-9, 'changing the level after the tower is built moves your unit to the new floor');
ok(unitY('house=terrace&level=8') === 5 && unitY('house=semid&level=1') === 5, 'a house ignores the level');
h = dump('lot=11&house=condo&frames=20&day=1&hour=12'); pl = JSON.parse(attr(h, 'state'));
ok(pl.lot === 11 && pl.homePos.x === 26 && pl.homePos.z === -42, 'a saved lot puts the home on that lot');
ok(pl.neighbours === 11 && pl.neighAtHome === 0, 'and the neighbours stand on the other eleven lots, none on yours (' + pl.neighbours + ' neighbours, ' + pl.neighAtHome + ' on your lot)');
h = dump('lot=0&frames=12'); pl = JSON.parse(attr(h, 'state')); ok(pl.neighbours === 11 && pl.neighAtHome === 0, 'whichever lot you are on, there are eleven neighbours');
h = dump('place=1&picks=lot,neighbour,home&frames=12'); picks = JSON.parse(attr(h, 'picks'));
ok(JSON.parse(attr(h, 'state')).padHits >= 4, 'at least four pad edges are exposed and clickable from the default view (' + JSON.parse(attr(h, 'state')).padHits + ')');
ok(picks.lot === 'lot' && picks.neighbour === 'neighbour' && picks.home === 'home', 'while placing, the pads, the neighbours and your home can all be picked');
h = dump('picks=lot&frames=12'); ok(JSON.parse(attr(h, 'picks')).lot === 'absent', 'outside place mode there are no pads to pick');

h = dump('autoweek=1&speed=8&walk=0.5&frames=450');
ok(/Week 2 of 4: Heat spell/.test(h) && /Week 1<\/td>/.test(h), 'a locked-in week plays to its end and opens round 2 with its event');
console.log('browser checks passed:', n);
