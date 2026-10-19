// Real-browser checks in headless Chrome (software WebGL). Skipped when Chrome is not installed.
// Proves what jsdom cannot: the 3D scene draws, a click lands on each object (and not through a blocker),
// and a locked-in game week plays to its end and opens round 2. Run: npm run test:browser
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path'), assert = require('assert');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) { console.log('browser checks skipped: no Chrome at ' + CHROME + ' (set CHROME)'); process.exit(0); }
const page = 'file://' + path.join(__dirname, '..', 'site', 'index.html');
const dump = (query) => spawnSync('perl', ['-e', 'alarm 120; exec @ARGV', CHROME, '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1000,700', '--virtual-time-budget=30000', '--dump-dom', page + '?shot&' + query], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout || '';
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

h = dump('autoweek=1&speed=8&walk=0.5&frames=450');
ok(/Week 2 of 4: Heat spell/.test(h) && /Week 1<\/td>/.test(h), 'a locked-in week plays to its end and opens round 2 with its event');
console.log('browser checks passed:', n);
