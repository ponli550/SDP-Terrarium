// Real-browser checks in headless Chrome (software WebGL). Skipped when Chrome is not installed.
// Proves what jsdom cannot: the 3D scene draws, a click lands on each object (and not through a blocker),
// and a locked-in game week plays to its end and opens round 2. Run: npm run test:browser
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path'), assert = require('assert');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) { console.log('browser checks skipped: no Chrome at ' + CHROME + ' (set CHROME)'); process.exit(0); }
const PROFILE = fs.mkdtempSync(path.join(require('os').tmpdir(), 'terrarium-chrome-')); process.on('exit', () => { try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (e) { /* a just-killed Chrome may still be writing; the OS clears the temp folder */ } });
const page = 'file://' + path.join(__dirname, '..', 'site', 'index.html');
// Each run gets its own profile: with a normal Chrome already open, a headless launch on the default profile hands off to it and returns un-run HTML.
// A dump with no scene state at all means Chrome did not finish (a launch problem), so it is retried (up to eight more times; headless Chrome intermittently returns the un-run page). A failed assertion is never retried.
const dump = (query, extra) => { let h = dumpOnce(query, extra); for (let i = 0; i < 8 && /frames=/.test(query) && !(/data-state=/.test(h) && /data-ui=/.test(h)); i++) h = dumpOnce(query, extra); return h; };
const dumpOnce = (query, extra) => spawnSync('node', [path.join(__dirname, 'chrome_dump.cjs'), CHROME, PROFILE, page + '?shot&' + query].concat(extra || []), { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '';
const attr = (h, name) => { const m = h.match(new RegExp('data-' + name + '="([^"]*)"')); return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : null; };
const LEVELS = require('../site/logic.js').CONDO_LEVELS;   // the tower's levels, from the model
const GAP = Math.max(1.5, Math.min(5, 90 / LEVELS));      // how far apart Exploded pulls each floor (the scene's own rule)
const r1 = (x) => Math.round(x * 10) / 10;
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

// two pages: the Map draws and runs, the Analysis page draws nothing and does no work, and moving between them works
const both = (q) => { const hh = dump(q); return { st: JSON.parse(attr(hh, 'state')), ui: JSON.parse(attr(hh, 'ui')) }; };
let pgs = both('frames=60');
ok(pgs.ui.viewMap !== 'none' && pgs.ui.viewAnalysis === 'none' && pgs.st.active === true && pgs.st.perf.frames >= 55, 'the Map is shown, and the scene is drawing (' + pgs.st.perf.frames + ' of 60 frames)');
ok(pgs.ui.fits === true, 'the Map fills the window exactly, with no page scrolling');
ok(pgs.ui.chat === 'none' && pgs.ui.dockBody !== 'none', 'the chat starts folded and the play dock open');
pgs = both('view=analysis&frames=60');
ok(pgs.ui.viewAnalysis !== 'none' && pgs.ui.viewMap === 'none' && pgs.st.active === false && pgs.st.perf.frames === 0, 'on the Analysis page nothing is drawn: the scene is inactive and drew ' + pgs.st.perf.frames + ' of 60 frames');
pgs = both('frames=20#/analysis'); ok(pgs.ui.viewAnalysis !== 'none' && pgs.st.active === false, 'an address ending #/analysis opens the Analysis page directly');
pgs = both('view=analysis&viewlater=30&frames=90');
ok(pgs.st.active === true && pgs.st.perf.frames >= 50 && pgs.st.perf.frames <= 70 && pgs.st.canvas[0] > 300 && pgs.st.canvas[1] > 300 && pgs.st.looping === true, 'going back to the Map resumes drawing, at a real size (drew ' + pgs.st.perf.frames + ' frames, canvas ' + pgs.st.canvas.join(' x ') + ')');
pgs = both('view=analysis&stopidle=1&frames=100000&dumpafter=800');
ok(pgs.st.active === false && pgs.st.looping === false && pgs.st.pending === false && pgs.st.perf.frames === 0, 'while the Analysis page shows, the scene stops asking for frames altogether (looping ' + pgs.st.looping + ', pending ' + pgs.st.pending + ', drew ' + pgs.st.perf.frames + ')');
pgs = both('view=analysis&stopidle=1&viewtimer=300&frames=100000&dumpafter=2200');
ok(pgs.st.active === true && pgs.st.looping === true && (pgs.st.pending === true || pgs.st.perf.frames > 0) && pgs.st.canvas[0] > 300 && pgs.st.canvas[1] > 300, 'and when the Map returns the loop starts again (a frame is requested or drawn: pending ' + pgs.st.pending + ', drew ' + pgs.st.perf.frames + ') and the canvas has a real size (' + pgs.st.canvas.join(' x ') + ')');
ok(pgs.ui.fade.found && pgs.ui.fade.transform === false && pgs.ui.fade.name === 'fade', 'the page transition is a fade only, with no transform that could overflow the document (found ' + pgs.ui.fade.found + ', transform ' + pgs.ui.fade.transform + ', animation ' + pgs.ui.fade.name + ')');
const longCfg = 'mcpserver=%2FUsers%2Firfanali%2FProjects%2FHackathon%2FSDP-Terrarium-mcp%2Fmcp%2Fserver.mjs&mcphome=%2FUsers%2Firfanali%2FDownloads%2Fa%2520very%2520long%2520folder%2520name%2Fterrarium-home-for-the-condominium-on-lot-six.json&mcpnode=%2FUsers%2Firfanali%2F.nvm%2Fversions%2Fnode%2Fv24.20.0%2Fbin%2Fnode';
pgs = both('view=analysis&frames=8&' + longCfg); ok(pgs.ui.connect !== 'none' && pgs.ui.anaOverflow <= 1, 'with a long config shown, no card on the Analysis page sticks out past its column (' + pgs.ui.anaOverflow + ' px)');
pgs = both('view=analysis&frames=8'); ok(pgs.ui.anaOverflow <= 1, 'and with nothing filled in either (' + pgs.ui.anaOverflow + ' px)');
pgs = both('frames=8'); ok(pgs.ui.viewAnalysis === 'none' && pgs.ui.viewMap !== 'none', 'the Connect card lives on the Analysis page, which is not drawn on the Map');
pgs = both('ask=What%20should%20I%20change%20first%3F&frames=20'); ok(pgs.ui.chat !== 'none', 'asking a question opens the chat');

// render hygiene, from measurements: removed meshes are disposed (about 108 geometries leaked per home rebuild before), trips do not leak, and the HUD is not rewritten every frame
const geoms = (q) => JSON.parse(attr(dump(q), 'state')).perf.geometries, hud = (q) => JSON.parse(attr(dump(q), 'state')).extra.hudWrites;
const g0 = geoms('frames=120'), g12 = geoms('stress=12&frames=120'), g48 = geoms('stress=48&frames=280');
ok(g0 > 400 && g0 < 1000, 'the scene holds a sensible number of geometries at rest (' + g0 + ')');
ok(g48 < g0 + 150 && Math.abs(g48 - g12) < 150, 'rebuilding the homes 48 times does not grow GPU memory (rest ' + g0 + ', after 12 rebuilds ' + g12 + ', after 48 ' + g48 + '; it was 678, 1873 and 5847 before the fix)');
const t30 = geoms('walk=0.5&frames=30&day=1&hour=6'), t1800 = geoms('walk=0.5&frames=1800&day=1&hour=6');
ok(t1800 < t30 + 40, 'walkers and cars coming and going do not leak (' + t30 + ' at the start, ' + t1800 + ' after 1800 frames)');
const hudT = hud('throttle=1&frames=120'), hudU = hud('frames=120');   // relative, because test-mode frames are timer-driven and their spacing is not a real 60 fps
ok(hudU > 100 && hudT * 5 < hudU, 'the HUD is rewritten far less often than every frame, about ten times a second (' + hudT + ' writes in 120 frames, against ' + hudU + ' unthrottled)');

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
// view modes: Lab at rest, Exploded pulls your own home's floors apart
// exploded runs use reduced motion so the explode snaps (a few frames suffice; with the township hidden, headless Chrome sometimes stalls its frame loop on a long run)
const RM = ['--force-prefers-reduced-motion'];
const viewOf = (q, extra) => { const hh = dump(q, extra); return { view: (JSON.parse(attr(hh, 'state') || '{}')).view, ui: JSON.parse(attr(hh, 'ui') || '{}') }; };
let vm = viewOf('house=condo&level=5&lot=0&frames=60');
ok(vm.view.mode === 'lab' && vm.view.selfShade === true && vm.view.explode === 0 && vm.view.floors === LEVELS && vm.view.floorY.every((y) => y === 0) && vm.view.roofY === 0 && vm.view.neighbours === true && vm.view.ground.shown === false && vm.view.ground.world === false && vm.view.ground.labels === 0 && vm.ui.viewBtn === 'false/true/false', 'Lab: the eight floors rest stacked, the roof is down, the neighbours are drawn, Lab is pressed');
vm = viewOf('house=condo&level=5&lot=0&frames=12&mode=exploded', RM);
ok(vm.view.mode === 'exploded' && vm.view.explode === 1 && vm.view.floorY.join() === Array.from({ length: LEVELS }, (_, i) => r1(i * GAP)).join() && vm.view.roofY === r1(LEVELS * GAP) && vm.view.panelsY === r1(LEVELS * GAP), 'Exploded: each floor is lifted one gap above the one below it, and the roof and solar panels go with the top (' + vm.view.floorY.join() + ' / roof ' + vm.view.roofY + ')');
ok(vm.view.neighbours === false && vm.view.unitFloor === 4 && vm.view.unitLabelShown === true && vm.ui.viewBtn === 'true/false/false', 'Exploded: the neighbours are hidden, level 5 is the highlighted floor and is labelled, and Exploded is pressed');
ok(vm.view.selfShade === false, 'Exploded: the pulled-apart floors stop shading each other');
ok(vm.view.ground.shown === true && vm.view.ground.world === true && vm.view.ground.layers === 4 && vm.view.ground.y.join() === [0, -4, -8, -12].join() && vm.view.ground.labels === 5, 'Exploded: the cutaway earth is shown and its four layers (topsoil, subsoil, rock, groundwater) drop one gap each, with their labels and the drawn-not-modelled note (' + vm.view.ground.y.join() + ', ' + vm.view.ground.labels + ' labels)');
vm = viewOf('house=condo&level=5&lot=0&frames=12&mode=exploded', RM);
ok(vm.view.ground.hidden > 20, 'Exploded: the township is put away (' + vm.view.ground.hidden + ' objects hidden)');
vm = viewOf('house=condo&level=5&lot=0&frames=20&mode=exploded&modelater=8', RM);
ok(vm.view.mode === 'lab' && vm.view.ground.hidden === 0 && vm.view.ground.shown === false && vm.view.ground.world === false && vm.view.neighbours === true && vm.view.ground.labels === 0 && vm.view.studio.turntable === false && vm.view.studio.marker === true && vm.view.floorY.every((y) => y === 0), 'back to Lab: everything that was put away is drawn again, the earth block and its labels are gone, the floors rest (' + vm.view.ground.hidden + ' still hidden)');
vm = viewOf('house=condo&level=5&lot=0&frames=40&mode=studio');
ok(vm.view.mode === 'studio' && vm.view.studio.on && vm.view.studio.turntable === true && vm.view.studio.bg === '0e1624' && vm.view.studio.marker === false && vm.view.studio.markerLabel === false && vm.ui.viewBtn === 'false/false/true', 'Studio: a dark backdrop and a turntable, the location marker is put away, Studio is pressed (bg ' + vm.view.studio.bg + ')');
ok(vm.view.neighbours === false && vm.view.ground.shown === false && vm.view.ground.labels === 0 && vm.view.ground.hidden > 20 && vm.view.floorY.every((y) => y === 0) && vm.view.explode === 0, 'Studio: your home is alone, whole and unexploded, with no ground cutaway (' + vm.view.ground.hidden + ' objects put away)');
ok(vm.view.studio.rotating === true && vm.view.studio.rotated > 0.005, 'Studio: the camera turns slowly around the home (' + vm.view.studio.rotated + ' rad in 40 frames)');
vm = viewOf('house=condo&level=5&lot=0&frames=12&mode=studio', RM);
ok(vm.view.studio.rotating === false && vm.view.studio.rotated === 0, 'Studio: under reduced motion nothing turns');
vm = viewOf('house=condo&level=5&lot=0&frames=24&mode=studio&modelater=8');
ok(vm.view.mode === 'lab' && vm.view.studio.turntable === false && vm.view.studio.rotating === false && vm.view.studio.marker === true && vm.view.studio.markerLabel === true && vm.view.studio.bg !== '0e1624' && vm.view.ground.hidden === 0 && vm.view.neighbours === true, 'Studio back to Lab: the township, the marker and the sky return, the turntable and the turning stop');
vm = viewOf('house=terrace&lot=3&frames=12&mode=exploded', RM);
ok(vm.view.floors === 2 && vm.view.floorY.join() === '0,4' && vm.view.unitFloor === -1 && vm.view.unitLabelShown === false, 'a terrace explodes into its two storeys and has no unit floor to point at');
vm = viewOf('house=condo&level=2&lot=0&frames=12&mode=exploded', RM);
ok(vm.view.unitFloor === 1, 'the highlighted floor follows the level you chose (level 2 is floor index ' + vm.view.unitFloor + ')');
// scrub and play: the timeline follows the clock, dragging lands on an exact moment and pauses, resuming a game week keeps its end-of-week callback
const clockOf = (q, extra) => { const hh = dump(q, extra); return { st: JSON.parse(attr(hh, 'state') || '{}'), ui: JSON.parse(attr(hh, 'ui') || '{}') }; };
let sc = clockOf('house=condo&level=5&lot=0&frames=12&seek=12:14');
ok(sc.st.day === 12 && sc.st.hour === 14 && sc.st.running === false && sc.ui.scrub.value === 278 && sc.ui.scrub.max === 719 && sc.ui.scrub.out === 'Day 12 \u00b7 14:00' && sc.ui.hudClock.includes('Day 12 \u00b7 14:00'), 'seeking to day 12 at 14:00 lands there, paused, and the timeline (value ' + sc.ui.scrub.value + ' of ' + sc.ui.scrub.max + '), its label and the HUD clock all agree');
sc = clockOf('house=condo&level=5&lot=0&frames=12&seek=5:8.2&walk=0.5');
const sc2 = clockOf('house=condo&level=5&lot=0&frames=12&seek=5:12&walk=0.5');
ok(sc.st.agents >= 1 && sc2.st.agents === 0, 'seeking to just after a trip time puts that trip on the road, and seeking to midday leaves none (' + sc.st.agents + ' and ' + sc2.st.agents + ')');
sc = clockOf('house=condo&level=5&lot=0&frames=40');
ok(sc.ui.scrub.value > 0 && Math.abs(sc.ui.scrub.value - ((sc.st.day - 1) * 24 + sc.st.hour)) <= 6, 'while playing, the timeline follows the clock (timeline ' + sc.ui.scrub.value + ', clock day ' + sc.st.day + ' hour ' + sc.st.hour + ')');
sc = clockOf('house=condo&level=5&lot=0&frames=12&drag=278');
ok(sc.st.day === 12 && sc.st.hour === 14 && sc.st.running === false && sc.ui.play === 'Play' && sc.ui.hudClock.includes('Day 12 \u00b7 14:00'), 'dragging the timeline to 278 pauses, lands on day 12 at 14:00, shows Play, and updates the HUD (' + sc.st.running + ', ' + sc.ui.play + ')');
sc = clockOf('autoweek=1&speed=8&walk=0.5&frames=20');
ok(sc.st.range[1] - sc.st.range[0] === 6 && sc.ui.scrub.max === 167, 'in a game week the timeline spans that week only (' + sc.ui.scrub.max + ' hours)');
sc = clockOf('autoweek=1&speed=8&walk=0.5&frames=24&pauseplay=8');
ok(sc.st.hasEnd === true && sc.st.running === true, 'pausing a game week and pressing Play again keeps the end-of-week callback, so the game can still move on');
// a tall tower: the whole building is in the frame (its corners project inside the screen), the camera steps back, the cutaway looks at your floor
let tw = viewOf('house=condo&level=' + LEVELS + '&lot=0&frames=24&solarKwp=4');
ok(tw.view.framing.towerH > 100 && tw.view.framing.inView === true && tw.view.framing.camDist > 180 && tw.view.framing.tgtY > 40, 'Lab: a ' + LEVELS + '-level tower (' + tw.view.framing.towerH + ' units tall) is wholly in the frame, with the camera stepped back (distance ' + tw.view.framing.camDist + ', aimed at height ' + tw.view.framing.tgtY + ')');
tw = viewOf('house=terrace&lot=3&frames=24&solarKwp=4');
ok(tw.view.framing.inView === true && Math.abs(tw.view.framing.camDist - 124) <= 4 && tw.view.framing.tgtY === 0, 'Lab: a house keeps the original camera (distance ' + tw.view.framing.camDist + ', aimed at height ' + tw.view.framing.tgtY + ')');
tw = viewOf('house=condo&level=' + LEVELS + '&lot=0&frames=14&mode=exploded', RM);
ok(tw.view.framing.inView === true && tw.view.floorY.length === LEVELS, 'Exploded: all ' + LEVELS + ' floors and the roof fit in the frame (camera ' + tw.view.framing.camDist + ' away)');
tw = viewOf('house=condo&level=' + LEVELS + '&lot=0&frames=14&mode=studio', RM);
ok(tw.view.framing.inView === true, 'Studio: the whole tower is in the frame');
tw = viewOf('house=condo&level=20&lot=0&frames=30&mode=studio&cut=1&solarKwp=4');
ok(Math.abs(tw.view.framing.tgtY - tw.view.framing.unitY) <= 1.5, 'cross-section of a tall tower: the camera looks at your own floor (aimed at ' + tw.view.framing.tgtY + ', your unit at ' + tw.view.framing.unitY + ')');
// cross-section: Studio only; a tap on the home opens it; labels come from the model's own condo values; everything returns on leaving
let cx = viewOf('house=condo&level=5&lot=0&frames=30&mode=studio&cut=1&solarKwp=4');
const hp = JSON.parse(attr(dump('house=condo&level=5&lot=0&frames=30&mode=studio&cut=1&solarKwp=4'), 'state') || '{}').homePos;
ok(cx.view.cut.on && cx.view.cut.clip === 1 && cx.view.cut.doubleSided && cx.view.cut.interior && cx.view.cut.unitRoom && cx.view.cut.labels === 3 && cx.view.studio.rotating === false && cx.view.selfShade === false && cx.ui.cutBtn === 'true', 'Cross-section: a clipping plane is on, the floors show their drawn insides and your unit, three notes are up (lift, tree shade, drawn-not-modelled), the camera stops turning, the button is pressed (' + cx.view.cut.labels + ' notes)');
ok(hp && Math.abs(cx.view.cut.planeZ - hp.z) < 0.01, 'the cut goes through the middle of the home (plane z ' + cx.view.cut.planeZ + ', home z ' + (hp && hp.z) + ')');
cx = viewOf('house=condo&level=' + LEVELS + '&lot=0&frames=30&mode=studio&cut=1&solarKwp=4');
ok(cx.view.cut.labels === 4, 'on the top level a fourth note, about the heat under the roof, appears (' + cx.view.cut.labels + ')');
cx = viewOf('house=condo&level=5&lot=0&frames=30&mode=studio&solarKwp=4');
ok(cx.view.cut.on === false && cx.view.cut.clip === 0 && cx.view.cut.interior === false && cx.view.cut.doubleSided === false && cx.view.cut.labels === 0 && cx.ui.cutBtn === 'false' && cx.view.studio.rotating === true, 'Studio without the cut: no plane, no interior, no notes, the camera turns, the button is offered (not pressed)');
cx = viewOf('house=condo&level=5&lot=0&frames=30&solarKwp=4&cut=1');
ok(cx.ui.cutBtn === 'hidden' && cx.view.cut.on === false && cx.view.cut.clip === 0, 'outside Studio there is no Cross-section button, and asking for the cut anyway does nothing');
cx = viewOf('house=condo&level=5&lot=0&frames=30&mode=studio&clickkind=home&solarKwp=4');
const cs = JSON.parse(attr(dump('house=condo&level=5&lot=0&frames=30&mode=studio&clickkind=home&solarKwp=4'), 'state') || '{}');
ok(cs.view && cs.view.cut.on === true, 'a real click on the home in Studio opens the section');
cx = viewOf('house=condo&level=5&lot=0&frames=30&mode=studio&cut=1&modelater=10&solarKwp=4');
ok(cx.view.mode === 'lab' && cx.view.cut.on === false && cx.view.cut.clip === 0 && cx.view.cut.labels === 0 && cx.view.cut.interior === false && cx.view.cut.doubleSided === false && cx.ui.cutBtn === 'hidden', 'leaving Studio closes the section: no plane, no notes, the floors are solid again, the button is gone');
// phones: no sideways scrolling, nothing lying on top of anything else, thumb-sized targets, at real phone widths (the page in an iframe of exact width; headless Chrome will not make a window narrower than 500 px)
const phoneUi = (q, w, hgt) => {
  const url = 'file://' + path.join(__dirname, 'phone.html') + '?w=' + w + '&h=' + (hgt || 844) + '&q=' + encodeURIComponent('shot&' + q);
  for (let i = 0; i < 9; i++) { const o = spawnSync('node', [path.join(__dirname, 'chrome_dump.cjs'), CHROME, PROFILE, url, '--allow-file-access-from-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || ''; const u = attr(o, 'ui'); if (u) return JSON.parse(u); }
  return null;
};
const PHONE_PAGES = [['the sign-in', 'gate=1&frames=6'], ['the Map', 'house=condo&level=5&lot=0&frames=12&solarKwp=4'], ['the Analysis page', 'view=analysis&house=condo&level=5&frames=8'], ['the set-up dialog', 'wizard=1&frames=6'], ['Compare', 'compare=1&lot=1&trees=4&frames=6'], ['the first look', 'firstlook=1&frames=6'], ['the forgot-password form', 'forgot=1&frames=6'], ['About the numbers', 'view=about&frames=6'], ['the recovery code', 'recovery=1&frames=6']];
[[360, 740], [390, 844], [430, 932], [768, 1024]].forEach((wh) => {
  const bad = [];
  PHONE_PAGES.forEach((pg) => { const u = phoneUi(pg[1], wh[0], wh[1]); if (!u) bad.push(pg[0] + ': no data'); else { if (u.overflow.vw !== wh[0] && !(u.overflow.vw >= wh[0] - 20)) bad.push(pg[0] + ': viewport ' + u.overflow.vw); if (u.overflow.scroll > 1 || u.overflow.wide.length) bad.push(pg[0] + ': sticks out ' + u.overflow.scroll + 'px (' + u.overflow.wide.slice(0, 3).join(', ') + ')'); if (u.layout.overlaps.length) bad.push(pg[0] + ': overlap ' + u.layout.overlaps.join(', ')); if (wh[0] <= 430 && u.layout.minTap < 36) bad.push(pg[0] + ': a target is only ' + u.layout.minTap + ' px tall'); } });
  ok(bad.length === 0, 'at ' + wh[0] + ' px wide: no page scrolls sideways, no control lies on another, targets are thumb-sized' + (bad.length ? ' [' + bad.join('; ') + ']' : ''));
});
let pm = phoneUi('house=condo&level=5&lot=0&frames=12&solarKwp=4&menu=1', 360, 740);
ok(pm && pm.overflow.scroll <= 1 && pm.overflow.wide.length === 0 && pm.layout.overlaps.length === 0, 'at 360 px the open account menu fits on the screen');

// the dashboard is drawn at a readable size at every width: each change's Apply button on its own row and thumb-sized, the charts tall enough to read
[[360, 740], [390, 844], [430, 932], [768, 1024], [1000, 700]].forEach((wh) => {
  const u = phoneUi('view=analysis&house=condo&level=12&lot=3&solarKwp=2&frames=8', wh[0], wh[1]), d = u && u.dash;
  ok(d && d.levers.length === 5 && d.levers.every((r) => Math.abs(r.dy) < 24 && r.btnW <= 150 && r.btnH >= 36 && r.barW >= 60 && r.labelW >= 100), 'at ' + wh[0] + ' px each change sits on one row: name, bars, a thumb-sized Apply button (' + JSON.stringify(d && d.levers[0]) + ')');
  ok(d && d.tiles === 3 && d.ringW >= 100 && d.chartH >= 170 && d.chartW >= Math.min(wh[0] - 90, 520) && d.floorH >= 100 && d.floorW >= d.chartW - 4 && d.headW >= Math.min(wh[0] - 60, 520), 'at ' + wh[0] + ' px the verdict, the month chart and the floor chart are drawn at a readable size (' + JSON.stringify(d && { ringW: d.ringW, chartW: d.chartW, chartH: d.chartH, floorW: d.floorW, floorH: d.floorH, headW: d.headW }) + ')');
});
// the account fields are drawn as wide as the email field (an unstyled password box once shipped), and the recovery code is one line at every phone width
[[360, 740], [390, 844], [1000, 700]].forEach((wh) => {
  const f = phoneUi('forgot=1&frames=6', wh[0], wh[1]), c = phoneUi('recovery=1&frames=6', wh[0], wh[1]);
  ok(f && f.fields.email > 200 && f.fields.code === f.fields.email && f.fields.pw === f.fields.email, 'at ' + wh[0] + ' px the recovery-code and new-password fields are as wide as the email field (' + (f && JSON.stringify(f.fields)) + ')');
  ok(c && c.fields.recLines === 1 && c.fields.recFits && c.fields.recW > 200, 'at ' + wh[0] + ' px the recovery code is on one line and fits its box (' + (c && JSON.stringify(c.fields)) + ')');
});
// The page's Content-Security-Policy is enforced by the browser: a script injected into the page, inline or as an event handler, must not run,
// and the page must still boot under the policy. The same injection with the policy removed must run, or the first result proves nothing.
{
  const site = path.join(__dirname, '..', 'site'), original = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const inject = '<script>document.documentElement.setAttribute("data-xss-inline","1")</script><img src="x" onerror="document.documentElement.setAttribute(\'data-xss-handler\',\'1\')">';
  const copy = (name, strip) => {
    let html = original.replace(/(src|href)="(?!https?:|data:|#)([^"]+)"/g, (m, k, v) => k + '="file://' + path.join(site, v) + '"').replace('</body>', inject + '</body>');
    if (strip) html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    const f = path.join(PROFILE, name); fs.writeFileSync(f, html); return 'file://' + f;
  };
  const run = (url) => { for (let i = 0; i < 9; i++) { const o = spawnSync('node', [path.join(__dirname, 'chrome_dump.cjs'), CHROME, PROFILE, url + '?shot&frames=6', '--allow-file-access-from-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || ''; if (/data-state=/.test(o) && /data-ui=/.test(o)) return o; } return ''; };
  const guarded = run(copy('csp-on.html', false)), control = run(copy('csp-off.html', true));
  ok(guarded && control, 'both CSP probe pages booted');
  const ran = (h, k) => new RegExp('<html[^>]*data-xss-' + k + '="1"').test(h);   // the attribute the injected code sets, not its source text
  ok(ran(control, 'inline') && ran(control, 'handler'), 'control: without the policy an injected inline script and an inline handler both run');
  ok(!ran(guarded, 'inline') && !ran(guarded, 'handler'), 'with the policy neither the injected script nor the injected handler runs');
  ok(!/id="nowebgl"/.test(guarded) && attr(guarded, 'ui') !== null, 'and the page still boots and draws its 3D scene under the policy');
}
console.log('browser checks passed:', n);
