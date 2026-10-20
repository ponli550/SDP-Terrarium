#!/usr/bin/env node
// Terrarium as a local MCP server over stdio. Usage:
//   node mcp/server.mjs --home /absolute/path/to/terrarium-home.json     (a file exported from the app)
//   node mcp/server.mjs --defaults                                        (a default demo home, stated explicitly)
// stdout carries the protocol and nothing else: every message for a person goes to stderr.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './tools.mjs';

const require = createRequire(import.meta.url);
const P = require('../site/profile.js');
const say = (m) => process.stderr.write('terrarium-mcp: ' + m + '\n');
const die = (m) => { say(m); process.exit(2); };

const argv = process.argv.slice(2);
let homePath = null, defaults = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--home') { homePath = argv[++i]; if (!homePath) die('--home needs a path to a home file.'); }
  else if (argv[i] === '--defaults') defaults = true;
  else if (argv[i] === '--help' || argv[i] === '-h') { say('usage: node mcp/server.mjs --home <home file> | --defaults'); process.exit(0); }
  else die('unknown argument ' + JSON.stringify(argv[i]) + '. Use --home <file> or --defaults.');
}
if (homePath && defaults) die('choose --home or --defaults, not both.');
if (!homePath && !defaults) die('no home given. Pass --home <file exported from Terrarium>, or --defaults to run on a default demo home.');

let home = {};
if (homePath) {
  let text;
  try { const st = fs.statSync(homePath); if (!st.isFile()) die('the home path is not a file.'); if (st.size > P.HOME_MAX_BYTES) die('the home file is too large.'); text = fs.readFileSync(homePath, 'utf8'); }
  catch (e) { die('cannot read the home file: ' + (e && e.code ? e.code : 'error') + '.'); }
  const r = P.parseHomeFile(text);
  if (!r.ok) die(r.reason);
  home = r.home;
  if (r.dropped.length) say('ignored unknown fields in the home file: ' + r.dropped.join(', ') + '.');
}

const server = buildServer(home);
await server.connect(new StdioServerTransport());
say('ready (' + (homePath ? 'home file ' + path.basename(homePath) : 'default demo home') + ').');
