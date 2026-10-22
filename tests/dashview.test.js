const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const DV = require('../site/dashview.js');

const doc = new JSDOM('<!doctype html><body></body>').window.document;

test('the grade line reports each count under its own name', () => {
  const host = doc.createElement('p');
  DV.gradeLine(doc, host, { figureCount: 11, gradeCounts: { REAL: 1, SOURCED: 2, ILLUSTRATIVE: 8 } });
  assert.strictEqual(host.textContent, 'Of 11 figures, 1 REAL, 2 SOURCED, 8 ILLUSTRATIVE.');
  DV.gradeLine(doc, host, { figureCount: 11, gradeCounts: { REAL: 0, SOURCED: 0, ILLUSTRATIVE: 11 } });
  assert.strictEqual(host.textContent, 'Of 11 figures, 0 REAL, 0 SOURCED, 11 ILLUSTRATIVE.');
});
