import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../mcp/tools.mjs';

const require = createRequire(import.meta.url);
const T = require('../site/logic.js'), A = require('../site/assistant.js'), P = require('../site/profile.js'), C = require('../site/mcpconfig.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'mcp', 'server.mjs'), PRINT = path.join(ROOT, 'mcp', 'print-config.mjs'), EXAMPLE = path.join(ROOT, 'examples', 'home.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'terrarium-mcp-'));
const write = (name, body) => { const p = path.join(tmp, name); fs.writeFileSync(p, body); return p; };

async function connect(home) {
  const [ct, st] = InMemoryTransport.createLinkedPair(), server = buildServer(home), client = new Client({ name: 'test', version: '0' });
  await server.connect(st); await client.connect(ct); return client;
}
const call = async (client, name, args) => { const r = await client.callTool({ name: name, arguments: args || {} }); return { text: r.content.map((c) => c.text).join('\n'), isError: !!r.isError, raw: r }; };
const run = (args) => spawnSync('node', [SERVER, ...args], { encoding: 'utf8', timeout: 20000 });
const HOME = { house: 'condo', level: 5, lot: 5, acHours: 8, setpoint: 25, trees: 3, nativeShare: 0.4, walkShare: 0.3 };

// ---------- the home file ----------
test('home file: export then parse returns the same home, dropping anything unknown', () => {
  const back = P.parseHomeFile(P.exportHome(Object.assign({ evil: 1, admin: true }, HOME)));
  assert.ok(back.ok); assert.deepStrictEqual(back.home, P.sanitizeHome(HOME)); assert.deepStrictEqual(back.dropped, []);
});
test('home file: a tampered file is sanitised, and the dropped fields are reported', () => {
  const r = P.parseHomeFile(JSON.stringify({ format: 'terrarium-home/1', home: { house: 'castle', acHours: 500, trees: 3, evil: '<script>' } }));
  assert.ok(r.ok); assert.deepStrictEqual(r.home, { acHours: 12, trees: 3 }); assert.deepStrictEqual(r.dropped.sort(), ['evil', 'house']);
});
test('home file: wrong format, no home, arrays, bad JSON, huge and non-text input are refused with a reason', () => {
  for (const bad of ['{not json', '[]', '"x"', 'null', JSON.stringify({ home: HOME }), JSON.stringify({ format: 'other/1', home: HOME }), JSON.stringify({ format: 'terrarium-home/1' }), JSON.stringify({ format: 'terrarium-home/1', home: [] }), JSON.stringify({ format: 'terrarium-home/1', home: 'x' })]) {
    const r = P.parseHomeFile(bad); assert.ok(!r.ok && r.reason.length > 10, bad);
  }
  assert.ok(!P.parseHomeFile('x'.repeat(P.HOME_MAX_BYTES + 1)).ok);
  const validButHuge = JSON.stringify({ format: 'terrarium-home/1', home: { house: 'condo' }, padding: 'x'.repeat(P.HOME_MAX_BYTES) }), tooBig = P.parseHomeFile(validButHuge);
  assert.ok(P.parseHomeFile(JSON.stringify({ format: 'terrarium-home/1', home: { house: 'condo' } })).ok && !tooBig.ok && /too large/.test(tooBig.reason), 'a perfectly valid file is refused only for its size');
  for (const nope of [undefined, null, 42, {}]) assert.ok(!P.parseHomeFile(nope).ok);
});
test('home file: the shipped example is a valid home', () => { const r = P.parseHomeFile(fs.readFileSync(EXAMPLE, 'utf8')); assert.ok(r.ok && r.home.house === 'condo' && r.dropped.length === 0); });

// ---------- the config generator ----------
const paths = { serverPath: '/Users/x/My Projects/terrarium/mcp/server.mjs', homePath: '/Users/x/home.json' };
test('config: JSON clients get a mcpServers entry that passes the home as an ARGUMENT, never as env', () => {
  for (const client of ['claude-desktop', 'workbuddy', 'generic']) {
    const r = C.configFor(client, paths), j = JSON.parse(r.text), e = j.mcpServers.terrarium;
    assert.ok(r.ok && r.language === 'json', client); assert.strictEqual(e.command, 'node'); assert.deepStrictEqual(e.args, [paths.serverPath, '--home', paths.homePath]); assert.ok(!('env' in e), client + ' must not use env');
  }
});
test('config: WorkBuddy gets type stdio, the others do not', () => {
  assert.strictEqual(JSON.parse(C.configFor('workbuddy', paths).text).mcpServers.terrarium.type, 'stdio');
  for (const c of ['claude-desktop', 'generic']) assert.ok(!('type' in JSON.parse(C.configFor(c, paths).text).mcpServers.terrarium), c);
});
test('config: Claude Code gets an add command whose arguments survive a real shell, spaces and apostrophes included', () => {
  const tricky = { serverPath: "/Users/o'brien/My Projects/mcp/server.mjs", homePath: '/tmp/a b/it\'s "home".json' };
  const r = C.configFor('claude-code', tricky), prefix = 'claude mcp add terrarium -- ';
  assert.ok(r.ok && r.language === 'shell' && r.text.startsWith(prefix));
  const out = spawnSync('sh', ['-c', 'set -- ' + r.text.slice(prefix.length) + '; for a in "$@"; do printf "%s\\n" "$a"; done'], { encoding: 'utf8' });
  assert.deepStrictEqual(out.stdout.split('\n').slice(0, 4), ['node', tricky.serverPath, '--home', tricky.homePath]);
  assert.deepStrictEqual(JSON.parse(r.alt).mcpServers.terrarium.args, [tricky.serverPath, '--home', tricky.homePath]);
});
test('config: defaults mode says so and does not pass a home', () => {
  const r = C.configFor('workbuddy', { serverPath: paths.serverPath, defaults: true }), e = JSON.parse(r.text).mcpServers.terrarium;
  assert.deepStrictEqual(e.args, [paths.serverPath, '--defaults']); assert.ok(r.notes.some((n) => /default demo home/.test(n)));
});
test('config: a custom node path is used, and relative paths, ~, newlines, NUL and unknown clients are refused', () => {
  assert.strictEqual(JSON.parse(C.configFor('workbuddy', Object.assign({ nodePath: '/opt/homebrew/bin/node' }, paths)).text).mcpServers.terrarium.command, '/opt/homebrew/bin/node');
  for (const bad of [{ serverPath: 'mcp/server.mjs', homePath: paths.homePath }, { serverPath: '~/mcp/server.mjs', homePath: paths.homePath }, { serverPath: paths.serverPath, homePath: 'home.json' }, { serverPath: paths.serverPath, homePath: '~/h.json' },
    { serverPath: '/a\nb', homePath: paths.homePath }, { serverPath: paths.serverPath, homePath: '/a\0b' }, { serverPath: '', homePath: paths.homePath }, { serverPath: paths.serverPath }, { serverPath: paths.serverPath, homePath: paths.homePath, nodePath: '' }]) {
    assert.ok(!C.configFor('workbuddy', bad).ok, JSON.stringify(bad));
  }
  assert.ok(!C.configFor('vim', paths).ok && /Choose one of/.test(C.configFor('vim', paths).reason));
  assert.ok(C.configFor('workbuddy', { serverPath: 'C:\\terrarium\\mcp\\server.mjs', homePath: 'C:\\Users\\x\\home.json' }).ok, 'a Windows drive path counts as absolute');
});
test('config: every client explains where the config goes, and the notes warn about PATH and env', () => {
  for (const c of Object.keys(C.CLIENTS)) { const r = C.configFor(c, paths); assert.ok(r.where.length > 20 && r.notes.some((n) => /PATH/.test(n)) && r.notes.some((n) => /env/.test(n)) && r.notes.some((n) => /only read/.test(n)), c); }
});

// ---------- the tools, in process ----------
test('tools: exactly these eight, every one read-only and non-destructive, each described', async () => {
  const c = await connect(HOME), { tools } = await c.listTools();
  assert.deepStrictEqual(tools.map((t) => t.name).sort(), ['ask', 'compare_homes', 'first_look', 'list_lots', 'simulate_month', 'what_if', 'what_if_many', 'where_from']);
  for (const t of tools) { assert.strictEqual(t.annotations.readOnlyHint, true, t.name); assert.strictEqual(t.annotations.destructiveHint, false, t.name); assert.strictEqual(t.annotations.openWorldHint, false, t.name); assert.ok(t.description.length > 40, t.name); }
  await c.close();
});
test('tools: the input schemas carry the real choices and bounds', async () => {
  const c = await connect(HOME), by = Object.fromEntries((await c.listTools()).tools.map((t) => [t.name, t.inputSchema]));
  assert.deepStrictEqual(by.what_if.properties.change.enum, T.LEVERS.map((l) => l.key));
  assert.deepStrictEqual(by.where_from.properties.assumption.enum, Object.keys(T.ASSUME));
  assert.deepStrictEqual(by.compare_homes.properties.house.enum, Object.keys(T.HOUSES));
  assert.deepStrictEqual([by.compare_homes.properties.lot.minimum, by.compare_homes.properties.lot.maximum, by.compare_homes.properties.level.minimum, by.compare_homes.properties.level.maximum], [1, T.LOTS.length, 1, T.CONDO_LEVELS]);
  assert.strictEqual(by.ask.properties.question.maxLength, 300);
  await c.close();
});
test('tools: first_look equals the page\'s own checked answer for the same home, plus the checked-figures line', async () => {
  const c = await connect(HOME), got = await call(c, 'first_look'), input = Object.assign({}, T.DEFAULTS, HOME);
  const direct = A.ask('What would living here cost me?', { input: input });
  assert.ok(!got.isError && !direct.withheld); assert.strictEqual(got.text, direct.text.map(A.render).join('\n') + '\n\nChecked ' + direct.checked + ' figures against the model.');
  await c.close();
});
test('tools: simulate_month reports every figure with its grade, the four pillars and the score, all equal to the model', async () => {
  const c = await connect(HOME), t = (await call(c, 'simulate_month')).text, s = T.scores(Object.assign({}, T.DEFAULTS, HOME));
  assert.ok(t.includes('Home: ' + T.homeLabel(Object.assign({}, T.DEFAULTS, HOME))) && t.includes('Home score: ' + Math.round(s.total) + ' out of 100'));
  for (const k of Object.keys(s.you.figures)) assert.ok(t.includes(s.you.figures[k].label + ': ') && t.includes('[' + s.you.figures[k].grade + ']'), k);
  for (const p of s.pillars) assert.ok(t.includes(p.name + ': ' + Math.round(p.score) + ' (' + p.formula + ')'), p.key);
  await c.close();
});
test('tools: list_lots lists every lot with the model\'s own distance and marks it illustrative', async () => {
  const c = await connect(HOME), all = (await call(c, 'list_lots')).text.split('\n'), lines = all.slice(1);
  assert.ok(all[0].startsWith('Lots carry no price in this model')); assert.strictEqual(lines.length, T.LOTS.length);
  lines.forEach((l, i) => { const li = T.lotInfo(i); assert.strictEqual(l, `Lot ${li.n}: ${li.km.toFixed(2)} km, about ${Math.round(li.walkMin)} min on foot [ILLUSTRATIVE]`); });
  await c.close();
});
test('tools: where_from gives the right grade for every assumption', async () => {
  const c = await connect(HOME);
  for (const [k, a] of Object.entries(T.ASSUME)) { const r = await call(c, 'where_from', { assumption: k }); assert.ok(!r.isError && r.text.includes('Grade: ' + a.grade) && r.text.includes('Checked'), k); }
  await c.close();
});
test('tools: what_if equals the model for every lever, with the checked line', async () => {
  const c = await connect(HOME), input = Object.assign({}, T.DEFAULTS, HOME);
  for (const lv of T.LEVERS) { const e = A.leverEffect(input, lv.key), r = await call(c, 'what_if', { change: lv.key }); assert.ok(!r.isError && r.text.includes(lv.label) && r.text.includes('Checked'), lv.key); assert.ok(r.text.includes('about ' + Math.abs(Math.round(e.carbonKg)) + ' kg'), lv.key); }
  await c.close();
});
test('tools: compare_homes defaults to the nearest other lot, and honours house, floor and lot', async () => {
  const c = await connect(HOME), input = Object.assign({}, T.DEFAULTS, HOME), near = T.nearestOtherLot(input.lot);
  const d = await call(c, 'compare_homes'); assert.ok(!d.isError && d.text.includes('lot ' + (near + 1)) && d.text.includes('A: ' + T.homeLabel(input)) && d.text.includes('Checked'));
  const b = Object.assign({}, input, { house: 'terrace', lot: 1 }), x = await call(c, 'compare_homes', { house: 'terrace', lot: 2 });
  assert.ok(x.text.includes('B: ' + T.homeLabel(b)) && x.text.includes('Electricity per month: A ' + T.compare(input, b).row('monthKwh').a));
  const lv = await call(c, 'compare_homes', { level: 8 }); assert.ok(lv.text.includes('level 8'));
  await c.close();
});
test('tools: ask answers from the model and refuses anything else without an error', async () => {
  const c = await connect(HOME), ok = await call(c, 'ask', { question: 'What should I change first?' });
  assert.ok(!ok.isError && /Add 2 kWp|Run the air-con|Plant 2 more trees|warmer|Walk 20%/.test(ok.text) && ok.text.includes('Checked'));
  const no = await call(c, 'ask', { question: 'What is the weather on Mars?' }); assert.ok(!no.isError && /no way to answer/.test(no.text) && !/Checked/.test(no.text));
  await c.close();
});
test('tools: invalid arguments are refused before they reach the model', async () => {
  const c = await connect(HOME);
  for (const [name, args] of [['what_if', { change: 'delete_everything' }], ['what_if', {}], ['where_from', { assumption: 'nothing' }], ['compare_homes', { lot: 0 }], ['compare_homes', { lot: T.LOTS.length + 1 }], ['compare_homes', { lot: 2.5 }], ['compare_homes', { level: T.CONDO_LEVELS + 1 }], ['compare_homes', { house: 'castle' }],
    ['ask', { question: '' }], ['ask', { question: 'x' }], ['ask', { question: 'a'.repeat(301) }], ['ask', {}], ['ask', { question: 42 }]]) {
    let refused = false; try { const r = await c.callTool({ name: name, arguments: args }); refused = !!r.isError; } catch (e) { refused = true; }
    assert.ok(refused, name + ' ' + JSON.stringify(args));
  }
  let unknown = false; try { const r = await c.callTool({ name: 'write_file', arguments: {} }); unknown = !!r.isError; } catch (e) { unknown = true; } assert.ok(unknown, 'an unknown tool is refused');
  await c.close();
});
test('tools: they never change the home: the same call gives the same answer before and after all the others', async () => {
  const c = await connect(HOME), before = (await call(c, 'simulate_month')).text;
  for (const [n, a] of [['first_look'], ['what_if', { change: 'acHours' }], ['compare_homes', { lot: 3 }], ['ask', { question: 'apply that' }], ['ask', { question: 'what should I change first?' }]]) await call(c, n, a);
  assert.strictEqual((await call(c, 'simulate_month')).text, before); assert.strictEqual((await call(c, 'first_look')).text, (await call(c, 'first_look')).text);
  await c.close();
});
test('tools: a different home gives different answers, and a home matched to a bill says so', async () => {
  const a = await connect(HOME), b = await connect({ house: 'terrace', lot: 1, acHours: 2 });
  assert.notStrictEqual((await call(a, 'simulate_month')).text, (await call(b, 'simulate_month')).text);
  const cal = T.calibrate(Object.assign({}, T.DEFAULTS), 700), billed = await connect({ baseScale: cal.baseScale, billKwh: 700 });
  assert.ok((await call(billed, 'first_look')).text.includes('matched to your own bill') && !(await call(a, 'first_look')).text.includes('matched to your own bill'));
  assert.ok(/illustrative until you enter a real bill/.test((await call(a, 'first_look')).text));
  for (const x of [a, b, billed]) await x.close();
});
test('tools: no tool leaks a file path or anything about the machine', async () => {
  const c = await connect(HOME); let all = '';
  for (const [n, a] of [['first_look'], ['simulate_month'], ['list_lots'], ['compare_homes'], ['ask', { question: 'where does the carbon number come from?' }], ['what_if', { change: 'trees' }], ['where_from', { assumption: 'gridKgKwh' }]]) all += (await call(c, n, a)).text;
  assert.ok(!all.includes(os.homedir()) && !all.includes(tmp) && !/\/Users\/|\/home\/|C:\\\\/.test(all)); await c.close();
});
test('server: the instructions tell a client to treat illustrative figures as estimates and to quote the checked text', async () => {
  const c = await connect(HOME), ins = c.getInstructions();
  assert.ok(/ILLUSTRATIVE/.test(ins) && /REAL/.test(ins) && /Checked/.test(ins) && /read-only/.test(ins)); assert.ok(ins.includes('Only report REAL or SOURCED figures as facts; call ILLUSTRATIVE ones estimates or placeholders.'), 'the grading rule itself, not just the words'); await c.close();
});

// ---------- the real server process ----------
function session(args) {
  const child = spawn('node', [SERVER, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = ''; child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
  const rpc = (msg) => child.stdin.write(JSON.stringify(msg) + '\n');
  const wait = (pred, ms = 15000) => new Promise((res, rej) => { const t0 = Date.now(), iv = setInterval(() => { if (pred()) { clearInterval(iv); res(); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout; stderr: ' + err)); } }, 20); });
  return { child, rpc, wait, out: () => out, err: () => err, stop: () => child.kill() };
}
test('process: stdout carries only protocol messages, stderr says ready, and tools/list works over raw JSON-RPC', async () => {
  const s = session(['--home', EXAMPLE]);
  s.rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'raw', version: '0' } } });
  await s.wait(() => s.out().split('\n').filter(Boolean).length >= 1);
  s.rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }); s.rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  await s.wait(() => s.out().split('\n').filter(Boolean).length >= 2);
  const lines = s.out().split('\n').filter(Boolean).map((l) => JSON.parse(l)); s.stop();
  assert.ok(lines.every((m) => m.jsonrpc === '2.0'), 'every stdout line is a JSON-RPC message'); assert.strictEqual(lines[0].result.serverInfo.name, 'terrarium'); assert.ok(/ILLUSTRATIVE/.test(lines[0].result.instructions));
  assert.strictEqual(lines[1].result.tools.length, 8); assert.ok(/ready \(home file home\.json\)/.test(s.err()) && !s.err().includes(path.dirname(EXAMPLE)), 'stderr names the file but not its directory');
});
test('process: the real SDK client over stdio can call a tool on the user\'s file', async () => {
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const c = new Client({ name: 'stdio', version: '0' }); await c.connect(new StdioClientTransport({ command: 'node', args: [SERVER, '--home', EXAMPLE] }));
  const r = await call(c, 'first_look'); assert.ok(!r.isError && r.text.includes('Condominium on lot 6, level 5')); await c.close();
});
test('process: --defaults runs on a default home and says so', async () => {
  const s = session(['--defaults']); await s.wait(() => /ready \(default demo home\)/.test(s.err())); s.stop();
});
test('process: unknown fields in a home file are reported on stderr but do not stop it', async () => {
  const s = session(['--home', write('extra.json', JSON.stringify({ format: 'terrarium-home/1', home: { house: 'condo', secretsy: 1, trees: 2 } }))]);
  await s.wait(() => /ready/.test(s.err())); s.stop(); assert.ok(/ignored unknown fields in the home file: secretsy/.test(s.err()));
});
test('process: every bad start fails loudly with exit code 2, a reason on stderr, and nothing on stdout', () => {
  const dir = path.join(tmp, 'adir'); fs.mkdirSync(dir);
  const cases = [[[], /no home given/], [['--home'], /--home needs a path/], [['--home', path.join(tmp, 'missing.json')], /cannot read the home file: ENOENT/], [['--home', dir], /not a file/],
    [['--home', write('bad.json', '{nope')], /not valid JSON/], [['--home', write('wrong.json', JSON.stringify({ format: 'x', home: {} }))], /not a Terrarium home file/],
    [['--home', write('big.json', 'x'.repeat(P.HOME_MAX_BYTES + 10))], /the home file is too large\./], [['--home', EXAMPLE, '--defaults'], /not both/], [['--bogus'], /unknown argument "--bogus"/], [['--home', EXAMPLE, 'extra'], /unknown argument "extra"/]];
  for (const [args, re] of cases) { const r = run(args); assert.strictEqual(r.status, 2, JSON.stringify(args)); assert.ok(re.test(r.stderr), JSON.stringify(args) + ' -> ' + r.stderr); assert.strictEqual(r.stdout, '', 'nothing on stdout: ' + JSON.stringify(args)); }
});
test('process: --help exits cleanly and prints the usage to stderr', () => { const r = run(['--help']); assert.strictEqual(r.status, 0); assert.ok(/usage: node mcp\/server\.mjs/.test(r.stderr) && r.stdout === ''); });

// ---------- the config command ----------
const printCfg = (args) => spawnSync('node', [PRINT, ...args], { encoding: 'utf8', timeout: 20000, cwd: ROOT });
test('print-config: fills in this checkout\'s absolute paths, and the JSON it prints is valid', () => {
  const r = printCfg(['workbuddy', '--home', 'examples/home.json']); assert.strictEqual(r.status, 0);
  const e = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1)).mcpServers.terrarium;
  assert.deepStrictEqual(e.args, [SERVER, '--home', EXAMPLE]); assert.strictEqual(e.type, 'stdio'); assert.ok(path.isAbsolute(e.args[0]) && path.isAbsolute(e.args[2]));
  assert.ok(/WorkBuddy/.test(r.stdout) && /mcp\.json/.test(r.stdout));
});
test('print-config: Claude Code gets the add command and the JSON alternative; --defaults and --node work', () => {
  const r = printCfg(['claude-code', '--defaults', '--node', '/usr/local/bin/node']); assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes("claude mcp add terrarium -- '/usr/local/bin/node'") && r.stdout.includes('--defaults') && r.stdout.includes('or, as JSON'));
});
test('print-config: an unknown client, no home and a bad argument all fail with exit code 2 and a usage line', () => {
  for (const args of [['vim', '--defaults'], ['workbuddy'], ['workbuddy', '--bogus'], []]) { const r = printCfg(args); assert.strictEqual(r.status, 2, JSON.stringify(args)); assert.ok(r.stdout === '' || /bogus/.test(r.stderr) || /clients:|usage:/.test(r.stderr), JSON.stringify(args)); }
});

// ---------- regressions from the first real WorkBuddy session: the figures were right, the wording around them was not ----------
const sim = async (home, opts) => { const [ct, st] = InMemoryTransport.createLinkedPair(), server = buildServer(home, opts), client = new Client({ name: 't', version: '0' }); await server.connect(st); await client.connect(ct); const t = (await call(client, 'simulate_month')).text; return { client, text: t }; };
const grab = (t, re) => { const m = t.match(re); return m ? m.slice(1).map(Number) : null; };
test('regression: the direction of every comparative score is stated in numbers that agree with the score', async () => {
  const homes = [HOME, {}, { acHours: 0 }, { acHours: 12, setpoint: 22, walkShare: 0, trees: 0 }, { house: 'semid', lot: 0, solarKwp: 6 }, { house: 'terrace', trees: 10, nativeShare: 1, walkShare: 0.9 }, { house: 'condo', level: 8, lot: 11, trees: 0 }, { solarKwp: 8, walkShare: 1, lot: 5 }, { walkShare: 0, lot: 6, trees: 1 }];
  for (const h of homes) {
    const { client, text } = await sim(h), s = T.scores(Object.assign({}, T.DEFAULTS, h)), score = (k) => Math.round(s.pillars.find((p) => p.key === k).score);
    const [carbon, nCarbon] = grab(text, /Your carbon is (\d+) kg a month against (\d+) kg/), [trips, nTrips] = grab(text, /Your trips on foot are (\d+) a month against (\d+)/);
    assert.ok(/above 50 is better than the neighbour, below 50 is worse/.test(text));
    assert.strictEqual(carbon, Math.round(s.you.figures.carbonKg.value)); assert.strictEqual(nCarbon, Math.round(s.neighbour.figures.carbonKg.value));
    if (carbon < nCarbon) assert.ok(score('energy') > 50, 'lower carbon than the neighbour must score above 50: ' + JSON.stringify(h)); if (carbon > nCarbon) assert.ok(score('energy') < 50, JSON.stringify(h));
    if (trips > nTrips) assert.ok(score('community') > 50, JSON.stringify(h)); if (trips < nTrips) assert.ok(score('community') < 50, JSON.stringify(h));
    await client.close();
  }
});
test('regression: the modelled running cost is the sum of the two figures shown, and says what is not modelled', async () => {
  for (const h of [HOME, {}, { acHours: 12, walkShare: 0 }, { house: 'semid', lot: 6 }]) {
    const { client, text } = await sim(h), f = T.simulate(Object.assign({}, T.DEFAULTS, h)).figures, bill = Math.round(f.monthBill.value), car = Math.round(f.carRm.value);
    assert.ok(text.includes(`Modelled running cost for this one simulated month: RM ${bill + car} (electricity RM ${bill} plus short car trips RM ${car}).`), JSON.stringify(h));
    assert.ok(/Not modelled: rent or a mortgage, water, internet, food, insurance, maintenance, or any price of the home or lot\. Do not multiply one month into a yearly figure\./.test(text));
    await client.close();
  }
});
test('regression: the tools say there are no prices, and a farther lot is not described as cheaper', async () => {
  const c = await connect(HOME);
  assert.ok((await call(c, 'list_lots')).text.startsWith('Lots carry no price in this model'));
  assert.ok(/no property prices or rent/.test((await call(c, 'compare_homes')).text));
  const far = T.LOTS.map((_, i) => i).sort((x, y) => T.lotDistanceKm(y) - T.lotDistanceKm(x))[0], near = T.nearestOtherLot(far);
  const r = T.compare(Object.assign({}, T.DEFAULTS, HOME, { lot: near }), Object.assign({}, T.DEFAULTS, HOME, { lot: far }));
  assert.ok(r.row('carRm').diff >= 0 && r.row('carbonKg').diff >= 0 && r.row('stopKm').diff > 0, 'in the model a farther lot costs more to run, never less');
  const t = (await call(c, 'compare_homes', { lot: far + 1 })).text; assert.ok(/farther/.test(t) && /more on short car trips/.test(t) && !/cheaper|less to run/.test(t));
  await c.close();
});
test('regression: the instructions explain the scores, the missing prices, the one-month limit and which home is loaded', async () => {
  const [ct, st] = InMemoryTransport.createLinkedPair(), server = buildServer(HOME, { source: 'the home file mine.json' }), client = new Client({ name: 't', version: '0' }); await server.connect(st); await client.connect(ct);
  const ins = client.getInstructions();
  for (const need of [/ABOVE 50 means better/, /NO prices for homes, lots or rent/, /farther lot costs MORE to run/, /ONE simulated month/, /Do not multiply them into a yearly cost/, /not rent, a mortgage, water, internet, food, insurance or maintenance/, /The loaded home is Condominium, level 5, lot 6, from the home file mine\.json/, /do not call it a default/]) assert.ok(need.test(ins), String(need));
  await client.close();
});
test('regression: the home line says where the home came from, and a default home says so', async () => {
  const a = await sim(HOME, { source: 'the home file mine.json' }), b = await sim({}); assert.ok(a.text.startsWith('Home: Condominium, level 5, lot 6 (the home file mine.json)') && b.text.startsWith('Home: Terrace house, lot not placed (a default demo home)')); await a.client.close(); await b.client.close();
});
test('regression: over a real stdio session the home line names the file, and never its folder', async () => {
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const c = new Client({ name: 'stdio', version: '0' }); await c.connect(new StdioClientTransport({ command: 'node', args: [SERVER, '--home', EXAMPLE] }));
  const t = (await call(c, 'simulate_month')).text, ins = c.getInstructions();
  assert.ok(t.startsWith('Home: Condominium, level 5, lot 6 (the home file home.json)') && ins.includes('from the home file home.json') && !t.includes(path.dirname(EXAMPLE)) && !ins.includes(path.dirname(EXAMPLE))); await c.close();
});

// ---------- combined changes: the first WorkBuddy session added single effects together and overstated the saving ----------
test('what_if_many: the exact case WorkBuddy got wrong is now answered by the model, with the overlap stated', async () => {
  const c = await connect(HOME), r = await call(c, 'what_if_many', { changes: ['solarKwp', 'acHours'] }), input = Object.assign({}, T.DEFAULTS, HOME), e = T.combinedEffect(input, ['solarKwp', 'acHours']);
  assert.ok(!r.isError && r.text.includes('Checked'));
  assert.ok(r.text.includes(`from RM ${Math.round(e.runBefore)} to RM ${Math.round(e.runAfter)}`) && r.text.includes(`from ${Math.round(e.carbonBefore)} kg to ${Math.round(e.carbonAfter)} kg`));
  assert.ok(r.text.includes(`adding the single effects would suggest ${Math.round(e.additiveCarbon)} kg and RM ${Math.round(e.additiveRm)} saved, but together they save ${Math.round(e.carbonSaved)} kg and RM ${Math.round(e.rmSaved)}`));
  assert.ok(e.carbonSaved < e.additiveCarbon && e.rmSaved < e.additiveRm, 'the combined saving is smaller than the sum, as the overlap says');
  await c.close();
});
test('what_if_many: the order the client names the changes in never matters, and one change equals what_if', async () => {
  const c = await connect(HOME), a = await call(c, 'what_if_many', { changes: ['solarKwp', 'acHours', 'trees'] }), b = await call(c, 'what_if_many', { changes: ['trees', 'acHours', 'solarKwp'] });
  assert.strictEqual(a.text, b.text);
  const one = T.combinedEffect(Object.assign({}, T.DEFAULTS, HOME), ['acHours']), e = A.leverEffect(Object.assign({}, T.DEFAULTS, HOME), 'acHours');
  assert.ok(Math.abs(one.carbonSaved - e.carbonKg) < 1e-9 && Math.abs(one.rmSaved - e.rm) < 1e-9);
  await c.close();
});
test('what_if_many: empty, repeated, unknown or too many changes are refused, and the schema says so', async () => {
  const c = await connect(HOME), by = Object.fromEntries((await c.listTools()).tools.map((t) => [t.name, t.inputSchema]));
  assert.deepStrictEqual(by.what_if_many.properties.changes.items.enum, T.LEVERS.map((l) => l.key)); assert.deepStrictEqual([by.what_if_many.properties.changes.minItems, by.what_if_many.properties.changes.maxItems], [1, T.LEVERS.length]);
  for (const changes of [[], ['acHours', 'acHours'], ['nonsense'], ['acHours', 'nonsense'], T.LEVERS.map((l) => l.key).concat('acHours'), 'acHours', null]) {
    let refused = false; try { const r = await c.callTool({ name: 'what_if_many', arguments: { changes } }); refused = !!r.isError; } catch (e) { refused = true; } assert.ok(refused, JSON.stringify(changes));
  }
  await c.close();
});
test('what_if_many: every combination of changes verifies and never changes the home', async () => {
  const c = await connect(HOME), before = (await call(c, 'simulate_month')).text, keys = T.LEVERS.map((l) => l.key); let n = 0;
  for (let m = 1; m < 1 << keys.length; m++) { const set = keys.filter((_, i) => m & (1 << i)), r = await call(c, 'what_if_many', { changes: set }); assert.ok(!r.isError && /Checked \d+ figures/.test(r.text), set.join(',')); n++; }
  assert.strictEqual(n, 31); assert.strictEqual((await call(c, 'simulate_month')).text, before); await c.close();
});
test('what_if_many: the instructions and the descriptions tell the client not to add effects up by hand', async () => {
  const c = await connect(HOME), ins = c.getInstructions(), tools = (await c.listTools()).tools;
  assert.ok(/call what_if_many\. Never add single what_if results together yourself/.test(ins) && /the real combined saving is smaller than the sum/.test(ins));
  assert.ok(/to combine changes use what_if_many; do not add these together/.test(tools.find((t) => t.name === 'what_if').description) && /smaller than the sum of the single effects/.test(tools.find((t) => t.name === 'what_if_many').description));
  await c.close();
});
