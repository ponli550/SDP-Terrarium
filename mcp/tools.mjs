// The Terrarium MCP tools. Read-only: they answer questions about one simulated home using the same model, the same assistant and the same
// verifier as the page, so every figure is recomputed before it is returned and a failing answer is withheld.
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const T = require('../site/logic.js');
const A = require('../site/assistant.js');
const pkg = require('../package.json');

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const LEVERS = T.LEVERS.map((l) => l.key);
const ASSUMPTIONS = Object.keys(T.ASSUME);
const HOUSES = Object.keys(T.HOUSES);

const INSTRUCTIONS = [
  'Terrarium answers questions about ONE simulated home in a drawn Malaysian township (Elmina), scored on four sustainability pillars.',
  'Every number is graded: REAL (public data), SOURCED (an assumption with a published source) or ILLUSTRATIVE (a placeholder). Only report REAL or SOURCED figures as facts; call ILLUSTRATIVE ones estimates or placeholders.',
  'Each tool returns text that has already been checked against the model ("Checked N figures"). Quote it rather than rewording the numbers.',
  'The township layout is a drawing: lot distances are scaled from one real figure and are illustrative. All tools are read-only.',
].join(' ');

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const fail = (t) => ({ content: [{ type: 'text', text: t }], isError: true });

// Runs one named assistant tool through the verifier. The assistant's own planner is bypassed so the answer does not depend on phrasing.
function viaAssistant(ctx, tool, args) {
  const r = A.ask(tool, ctx, (q, c) => A.answerQuestion(q, c, () => ({ intent: tool, calls: [{ tool: tool, args: args || {} }] })));
  if (r.withheld) return fail('That answer was withheld: it did not pass the check against the model. ' + (r.problems || []).join(' '));
  return text(r.text.map(A.render).join('\n') + '\n\nChecked ' + r.checked + ' figure' + (r.checked === 1 ? '' : 's') + ' against the model.');
}

const fmtValue = (f) => (f.unit === 'RM' ? 'RM ' + f.value.toFixed(0) : f.unit === 'km' ? f.value.toFixed(2) + ' km' : f.unit === '%' ? f.value.toFixed(0) + '%' : f.value.toFixed(f.unit === 'index' ? 1 : 0) + ' ' + f.unit);

export function buildServer(home) {
  const base = Object.assign({}, T.DEFAULTS, home || {});
  const ctx = () => ({ input: Object.assign({}, base) });   // a fresh copy per call: tools never change the home
  const server = new McpServer({ name: 'terrarium', version: pkg.version || '0.0.0' }, { instructions: INSTRUCTIONS });

  server.registerTool('first_look', {
    title: 'First look: what a month in this home costs',
    description: 'A plain-language summary of one month in the home: electricity use and bill, the walk to the bus stop, the home score with its strongest and weakest pillar, and the one change that cuts the most carbon. Every figure is checked and graded.',
    annotations: READ_ONLY,
  }, async () => viaAssistant(ctx(), 'first_look'));

  server.registerTool('ask', {
    title: 'Ask a question about the home',
    description: 'Ask in your own words, for example "What should I change first?", "Where does the carbon number come from?" or "How do I compare with my neighbours?". Answers only from the model; anything else is refused.',
    inputSchema: { question: z.string().min(2).max(300) },
    annotations: READ_ONLY,
  }, async ({ question }) => {
    const r = A.ask(question, ctx());
    if (r.withheld) return fail('That answer was withheld: it did not pass the check against the model. ' + (r.problems || []).join(' '));
    return text(r.text.map(A.render).join('\n') + (r.checked ? '\n\nChecked ' + r.checked + ' figure' + (r.checked === 1 ? '' : 's') + ' against the model.' : ''));
  });

  server.registerTool('what_if', {
    title: 'What if I change one thing',
    description: 'The effect on carbon, cost and comfort of one change: ' + T.LEVERS.map((l) => l.key + ' (' + l.label + ')').join('; ') + '.',
    inputSchema: { change: z.enum(LEVERS) },
    annotations: READ_ONLY,
  }, async ({ change }) => viaAssistant(ctx(), 'what_if', { lever: change }));

  server.registerTool('compare_homes', {
    title: 'Compare your home with an alternative',
    description: 'Option A is the home. Option B is an alternative home type, floor or lot with the same habits (air-con, solar, trees, walking). With no arguments, B is the same home on the lot nearest the bus stop. Lots are numbered 1 to ' + T.LOTS.length + '.',
    inputSchema: { house: z.enum(HOUSES).optional(), level: z.number().int().min(1).max(T.CONDO_LEVELS).optional(), lot: z.number().int().min(1).max(T.LOTS.length).optional() },
    annotations: READ_ONLY,
  }, async ({ house, level, lot }) => {
    const a = ctx().input, b = Object.assign({}, a);
    if (house) b.house = house;
    if (level !== undefined) b.level = level;
    b.lot = lot !== undefined ? lot - 1 : T.nearestOtherLot(T.validLot(a.lot) ? a.lot : -1);
    const answer = viaAssistant({ input: a, alt: b }, 'compare_homes');
    if (answer.isError) return answer;
    const c = T.compare(a, b), mark = (r, side) => (r.better === side ? ' *' : '');
    const rows = c.rows.map((r) => `${r.label}: A ${r.a} ${r.unit}${mark(r, 'a')} | B ${r.b} ${r.unit}${mark(r, 'b')} | B against A ${r.diff > 0 ? '+' : ''}${r.diff}`);
    return text(answer.content[0].text + '\n\nA: ' + c.labelA + '\nB: ' + c.labelB + '\n' + rows.join('\n') + '\n(* marks the better side. Every figure is illustrative.)');
  });

  server.registerTool('simulate_month', {
    title: 'The simulated month in full',
    description: 'Every figure for the month with its grade (REAL, SOURCED or ILLUSTRATIVE), the four pillar scores with their formulas, and the home score.',
    annotations: READ_ONLY,
  }, async () => {
    const s = T.scores(ctx().input), f = s.you.figures;
    const lines = Object.keys(f).map((k) => `${f[k].label}: ${fmtValue(f[k])} [${f[k].grade}]`);
    const pil = s.pillars.map((p) => `${p.name}: ${Math.round(p.score)} (${p.formula})`);
    return text(['Home: ' + T.homeLabel(ctx().input), '', ...lines, '', ...pil, '', 'Home score: ' + Math.round(s.total) + ' out of 100', 'The neighbour average is a fixed illustrative household. Scores are placeholders.'].join('\n'));
  });

  server.registerTool('list_lots', {
    title: 'The lots in the township',
    description: 'The ' + T.LOTS.length + ' lots with their distance to the bus stop and the walk in minutes. The layout is a drawing scaled from one real figure, so every distance here is illustrative.',
    annotations: READ_ONLY,
  }, async () => text(T.LOTS.map((_, i) => { const l = T.lotInfo(i); return `Lot ${l.n}: ${l.km.toFixed(2)} km, about ${Math.round(l.walkMin)} min on foot [ILLUSTRATIVE]`; }).join('\n')));

  server.registerTool('where_from', {
    title: 'Where a number comes from, and how sure it is',
    description: 'The source and grade of one assumption: ' + ASSUMPTIONS.join(', ') + '.',
    inputSchema: { assumption: z.enum(ASSUMPTIONS) },
    annotations: READ_ONLY,
  }, async ({ assumption }) => viaAssistant(ctx(), 'where_from', { name: assumption }));

  return server;
}
