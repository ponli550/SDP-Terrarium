#!/usr/bin/env node
// Prints the config for an MCP client, with this checkout's absolute paths filled in:
//   node mcp/print-config.mjs workbuddy --home /absolute/path/to/home.json
//   node mcp/print-config.mjs claude-code --defaults
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../site/mcpconfig.js');
const args = process.argv.slice(2), client = args[0];
let homePath, defaults = false, nodePath;
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--home') homePath = args[++i]; else if (args[i] === '--defaults') defaults = true; else if (args[i] === '--node') nodePath = args[++i];
  else { process.stderr.write('unknown argument ' + args[i] + '\n'); process.exit(2); }
}
const r = C.configFor(client, { serverPath: path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs'), homePath: homePath && path.resolve(homePath), defaults: defaults, nodePath: nodePath });
if (!r.ok) { process.stderr.write(r.reason + '\n\nclients: ' + Object.keys(C.CLIENTS).join(', ') + '\nusage: node mcp/print-config.mjs <client> --home <file> | --defaults [--node <path to node>]\n'); process.exit(2); }
process.stdout.write('# ' + r.title + '\n# ' + r.where + '\n\n' + r.text + '\n' + (r.alt ? '\n# or, as JSON:\n' + r.alt + '\n' : '') + '\n' + r.notes.map((n) => '# - ' + n).join('\n') + '\n');
