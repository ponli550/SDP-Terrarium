/* Config for an MCP client, generated from two absolute paths. Pure, so it runs in the app (a Connect panel) and in the command line the same way.
   The home goes in as an ARGUMENT, not an environment variable: some clients do not reliably pass `env` to a stdio server (seen with WorkBuddy). */
(function (root) {
  'use strict';
  var NAME = 'terrarium';
  var CLIENTS = {
    'claude-code': { title: 'Claude Code', where: 'Run this in a terminal (or put the JSON in a .mcp.json at your project root).' },
    'claude-desktop': { title: 'Claude Desktop', where: 'macOS: ~/Library/Application Support/Claude/claude_desktop_config.json. Merge it into any existing mcpServers, then quit and reopen the app.' },
    workbuddy: { title: 'WorkBuddy', where: '~/.workbuddy-ai/mcp.json (or Add MCP in its settings, which edits the same file). Merge it into any existing mcpServers.' },
    generic: { title: 'Another MCP client', where: 'Any client that reads the standard mcpServers JSON. Check its documentation for where the file lives.' },
  };
  var isAbsolute = function (p) { return typeof p === 'string' && (p.charAt(0) === '/' || /^[A-Za-z]:[\\/]/.test(p)); };
  var clean = function (p) { return typeof p === 'string' && p.length > 0 && p.length < 1024 && !/[\0\r\n]/.test(p); };
  var shq = function (s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; };   // POSIX single-quote escaping

  function configFor(client, o) {
    o = o || {};
    var c = CLIENTS[client]; if (!c) return { ok: false, reason: 'Unknown client. Choose one of: ' + Object.keys(CLIENTS).join(', ') + '.' };
    if (!clean(o.serverPath) || !isAbsolute(o.serverPath)) return { ok: false, reason: 'The server path must be an absolute path (a ~ is not expanded by most clients).' };
    if (!o.defaults && (!clean(o.homePath) || !isAbsolute(o.homePath))) return { ok: false, reason: 'The home file path must be an absolute path, or choose the defaults.' };
    var node = o.nodePath === undefined ? 'node' : o.nodePath;
    if (!clean(node)) return { ok: false, reason: 'The node path is not valid.' };
    var args = [o.serverPath].concat(o.defaults ? ['--defaults'] : ['--home', o.homePath]);
    var entry = client === 'workbuddy' ? { type: 'stdio', command: node, args: args } : { command: node, args: args };
    var json = JSON.stringify({ mcpServers: { [NAME]: entry } }, null, 2);
    var notes = ['Use absolute paths. Apps launched from the desktop often do not see your shell\'s PATH, so if "node" is not found, set the full path to node instead.',
      'The home is passed as an argument. Do not move it into an env block: some clients do not pass env to a local server.',
      'The tools only read. Nothing is written, sent or changed.'];
    if (client === 'workbuddy') notes.push('If a connector shows as needing authorization, rename the entry: a local server does not need any.');
    if (o.defaults) notes.push('This runs on a default demo home, not yours. Export your home from the app and use the home file to see your own.');
    if (client === 'claude-code') {
      var cmd = 'claude mcp add ' + NAME + ' -- ' + [node].concat(args).map(shq).join(' ');
      return { ok: true, client: client, title: c.title, where: c.where, language: 'shell', text: cmd, alt: json, notes: notes };
    }
    return { ok: true, client: client, title: c.title, where: c.where, language: 'json', text: json, notes: notes };
  }
  var API = { configFor: configFor, CLIENTS: CLIENTS, NAME: NAME, isAbsolute: isAbsolute };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TerrariumMcp = API;
})(typeof window !== 'undefined' ? window : globalThis);
