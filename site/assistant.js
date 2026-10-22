/* The assistant. It answers questions about the current simulated month by calling named, read-only tools on the
   model (logic.js). The sentences are fixed templates; every figure in them is bound to a claim, and a separate
   verifier recomputes each claim from the model before the answer is shown. A failing answer is withheld.
   One write tool only proposes a change; a person's click applies it. The planner is replaceable. */
(function (root) {
  'use strict';
  var T = root.Terrarium || require('./logic.js');

  var nm = function (x) { return '⟦' + x + '⟧'; };            // marks a name so digits inside it are not mistaken for figures
  var fnum = function (n, d) { var v = Number(Number(n).toFixed(d)); return Math.abs(v) >= 1000 ? v.toLocaleString('en-GB') : String(v); };
  var tokensOf = function (t) { return (String(t).match(/(?<![A-Za-z\d.])\d[\d,]*(?:\.\d+)?(?![A-Za-z\d]|\.\d)/g) || []).map(function (x) { return x.replace(/,/g, ''); }); };
  var fg = function (i, str) { return '⦃' + i + '|' + str + '⦄'; };   // a figure: the verified value of claim number i
  var FIG = /⦃(\d+)\|([^⦄]*)⦄/g;
  var REFUSAL = 'I can only answer from this home\'s simulated month, and I have no way to answer that. Try one of the example questions.';
  var SHOWN = ['monthKwh', 'monthBill', 'carbonKg', 'carRm', 'walkMin', 'comfortPct', 'solarKwh'];
  var UNIT = { monthKwh: 'kWh', monthBill: 'RM', carbonKg: 'kg', carRm: 'RM', walkMin: 'minutes', comfortPct: '%', solarKwh: 'kWh' };
  var EXAMPLES = ['What would living here cost me?', 'Give me the briefing', 'Where does the carbon number come from?', 'How do I compare with my neighbours?', 'What should I change first?', 'What if I run the air-con 2 hours less?', 'Why is my energy score what it is?', 'How far is the bus stop?'];

  var altOf = function (ctx) { return ctx && ctx.alt ? Object.assign({}, T.DEFAULTS, ctx.alt) : null; };
  var scoresOf = function (ctx) { return ctx._s || (ctx._s = T.scores(ctx.input)); };
  function leverEffect(input, key) {
    var lv = T.LEVERS.find(function (l) { return l.key === key; }); if (!lv) return null;
    var b = T.simulate(input).figures, f = T.simulate(T.applyLever(input, lv)).figures;
    return { lever: lv, carbonKg: b.carbonKg.value - f.carbonKg.value, rm: (b.monthBill.value + b.carRm.value) - (f.monthBill.value + f.carRm.value), comfortDrop: b.comfortPct.value - f.comfortPct.value };
  }

  // ---- tools: read-only except propose_change, which only drafts a card ----
  var TOOLS = {
    first_look: { kind: 'read', describe: 'What a month in this home would cost, in plain words, from the first screen after set-up.', params: {}, run: function (a, ctx, b) {
      var S = scoresOf(ctx), f = S.you.figures, inp = ctx.input, house = T.HOUSES[inp.house] || T.HOUSES.terrace, li = T.lotInfo(inp.lot);
      var lvl = inp.house === 'condo' ? Math.min(T.CONDO_LEVELS, Math.max(1, Math.round(Number(inp.level) || 1))) : null;
      var k = b.cl({ kind: 'figure', key: 'monthKwh', value: Math.round(f.monthKwh.value) }), r = b.cl({ kind: 'figure', key: 'monthBill', value: Math.round(f.monthBill.value) });
      var where = '';
      if (li) where += ' on lot ' + fg(b.cl({ kind: 'lot', field: 'n', value: li.n }), String(li.n));
      if (lvl !== null) where += (li ? ', ' : ' ') + 'level ' + fg(b.cl({ kind: 'level', value: lvl }), String(lvl));
      b.text.push('Living in this home, a ' + nm(house.label) + where + ', would use about ' + fg(k, fnum(f.monthKwh.value, 0)) + ' kWh a month, an electricity bill of about RM ' + fg(r, fnum(f.monthBill.value, 0)) + '.');
      if (li) b.text.push('The bus stop is about ' + fg(b.cl({ kind: 'lot', field: 'km', value: Math.round(li.km * 100) / 100 }), fnum(li.km, 2)) + ' km from your lot, around ' + fg(b.cl({ kind: 'lot', field: 'walkMin', value: Math.round(li.walkMin) }), String(Math.round(li.walkMin))) + ' minutes on foot each way.');
      else b.text.push('You have not placed a lot yet. The bus stop is about ' + fg(b.cl({ kind: 'assumption', name: 'stopKm' }), fnum(T.ASSUME.stopKm.v, 3)) + ' km from the township centre.');
      var tot = b.cl({ kind: 'total', value: Math.round(S.total) }), hi = S.pillars.reduce(function (m, p) { return p.score > m.score ? p : m; }), lo = S.pillars.reduce(function (m, p) { return p.score < m.score ? p : m; });
      var hc = b.cl({ kind: 'pillarExtreme', key: hi.key, which: 'max' }), lc = b.cl({ kind: 'pillarExtreme', key: lo.key, which: 'min' });
      b.text.push('You score ' + fg(tot, fnum(S.total, 0)) + ' out of one hundred against SDP\'s four pillars. Strongest: ' + nm(hi.name) + '. Weakest: ' + nm(lo.name) + '.');
      var top = T.suggest(inp, 1)[0];
      if (top) b.text.push('The change that cuts the most carbon without costing comfort: ' + nm(top.label) + ', about ' + fg(b.cl({ kind: 'lever', lever: top.key, field: 'carbonKg', value: Math.round(top.carbonKg) }), fnum(top.carbonKg, 0)) + ' kg a month.');
      else b.text.push('No single change cuts carbon without costing comfort: that is ' + fg(b.cl({ kind: 'count', what: 'suggestions', value: 0 }), '0') + ' changes to suggest.');
      b.text.push(f.monthKwh.grade === 'REAL' ? 'The electricity figure is matched to your own bill; every other figure is illustrative.' : 'Every figure here is illustrative until you enter a real bill.');
    } },
    compare_homes: { kind: 'read', describe: 'Your home against an alternative: what differs and by how much.', params: {}, run: function (a, ctx, b) {
      var alt = altOf(ctx); if (!alt) { b.text.push('Pick an option B first, from Compare.'); return; }
      var c = T.compare(ctx.input, alt), clauses = [], word = function (d, neg, pos) { return d < 0 ? neg : pos; };
      b.text.push('Option B is ' + nm(c.labelB) + '; your home is ' + nm(c.labelA) + '.');
      [['stopKm', function (r, i) { return 'the bus stop ' + fg(i, fnum(Math.abs(r.diff), r.dec)) + ' km ' + word(r.diff, 'nearer', 'farther'); }],
       ['monthKwh', function (r, i) { return 'about ' + fg(i, fnum(Math.abs(r.diff), r.dec)) + ' kWh a month ' + word(r.diff, 'less', 'more') + ' electricity'; }],
       ['monthBill', function (r, i) { return 'RM ' + fg(i, fnum(Math.abs(r.diff), r.dec)) + ' a month ' + word(r.diff, 'less', 'more') + ' on the electricity bill'; }],
       ['carbonKg', function (r, i) { return 'about ' + fg(i, fnum(Math.abs(r.diff), r.dec)) + ' kg of carbon a month ' + word(r.diff, 'less', 'more'); }],
       ['carRm', function (r, i) { return 'RM ' + fg(i, fnum(Math.abs(r.diff), r.dec)) + ' a month ' + word(r.diff, 'less', 'more') + ' on short car trips'; }],
       ['total', function (r, i) { return 'a home score ' + fg(i, fnum(Math.abs(r.diff), r.dec)) + ' points ' + word(r.diff, 'lower', 'higher'); }]].forEach(function (p) {
        var r = c.row(p[0]); if (r.diff === 0) return; clauses.push(p[1](r, b.cl({ kind: 'compare', field: p[0], value: r.diff })));
      });
      if (clauses.length) b.text.push('Compared with your home, option B has ' + clauses.join('; ') + '.');
      else b.text.push('The two come out the same on distance, electricity, carbon, car cost and score' + fg(b.cl({ kind: 'compare', field: 'same', value: 0 }), '') + '.');
      b.text.push('Both use your habits, so only the home and the lot differ. Every figure is illustrative.');
    } },
    briefing: { kind: 'read', describe: 'The month in plain words: use, bill, carbon, home score.', params: {}, run: function (a, ctx, b) {
      var S = scoresOf(ctx), f = S.you.figures;
      var k = b.cl({ kind: 'figure', key: 'monthKwh', value: Math.round(f.monthKwh.value) }), r = b.cl({ kind: 'figure', key: 'monthBill', value: Math.round(f.monthBill.value) });
      var c = b.cl({ kind: 'figure', key: 'carbonKg', value: Math.round(f.carbonKg.value) }), t = b.cl({ kind: 'total', value: Math.round(S.total) });
      b.text.push('This month your home uses ' + fg(k, fnum(f.monthKwh.value, 0)) + ' kWh, an electricity bill of about RM ' + fg(r, fnum(f.monthBill.value, 0)) + '. Carbon from the home and short trips is ' + fg(c, fnum(f.carbonKg.value, 0)) + ' kg.');
      b.text.push('You score ' + fg(t, fnum(S.total, 0)) + ' out of one hundred against SDP\'s four pillars. ' + (f.monthKwh.grade === 'REAL' ? 'The electricity figure is matched to your own bill; the other figures stay illustrative.' : 'These figures are illustrative until a real home replaces them.'));
      b.cards.push({ type: 'pillars' });
    } },
    pillar: { kind: 'read', describe: 'One pillar: its score and the formula behind it.', params: { key: 1 }, run: function (a, ctx, b) {
      var p = scoresOf(ctx).pillars.find(function (x) { return x.key === a.key; });
      var s = b.cl({ kind: 'pillar', key: a.key, value: Math.round(p.score) }), fm = b.cl({ kind: 'formula', key: a.key });
      b.text.push('Your ' + nm(p.name) + ' score is ' + fg(s, fnum(p.score, 0)) + '. The rule: ' + fg(fm, p.formula) + '.');
      b.cards.push({ type: 'pillars' });
    } },
    compare_neighbour: { kind: 'read', describe: 'Your month against the neighbour average.', params: {}, run: function (a, ctx, b) {
      var S = scoresOf(ctx), y = S.you.figures, n = S.neighbour.figures, parts = [];
      ['monthKwh', 'carbonKg', 'walkMin'].forEach(function (k) {
        var i = b.cl({ kind: 'figure', key: k, value: Math.round(y[k].value) }), j = b.cl({ kind: 'neighbour', key: k, value: Math.round(n[k].value) });
        parts.push(nm(y[k].label) + ': ' + fg(i, fnum(y[k].value, 0)) + ' ' + UNIT[k] + ' against ' + fg(j, fnum(n[k].value, 0)) + ' for the neighbour average');
      });
      b.text.push(parts.join('; ') + '. The neighbour average is a fixed illustrative household.');
    } },
    biggest_change: { kind: 'read', describe: 'The changes that cut the most carbon while keeping comfort.', params: {}, run: function (a, ctx, b) {
      var sug = T.suggest(ctx.input, 2);
      if (!sug.length) { var z = b.cl({ kind: 'count', what: 'suggestions', value: 0 }); b.text.push('No single change cuts carbon without costing comfort. That is ' + fg(z, '0') + ' changes to suggest; your choices are already balanced.'); return; }
      sug.forEach(function (x) {
        var c = b.cl({ kind: 'lever', lever: x.key, field: 'carbonKg', value: Math.round(x.carbonKg) }), r = b.cl({ kind: 'lever', lever: x.key, field: 'rm', value: Math.round(Math.max(0, x.rm)) });
        b.text.push(nm(x.label) + ': about ' + fg(c, fnum(x.carbonKg, 0)) + ' kg less carbon and RM ' + fg(r, fnum(Math.max(0, x.rm), 0)) + ' saved, comfort held.');
      });
      var ch = b.cl({ kind: 'change', lever: sug[0].key }); b.cards.push({ type: 'confirm', lever: sug[0].key, claim: ch });
    } },
    what_if_many: { kind: 'read', describe: 'The combined effect of several changes applied together. They overlap, so it is not the sum of the single effects.', params: { levers: 1 }, run: function (a, ctx, b) {
      var e = T.combinedEffect(ctx.input, a.levers), names = e.keys.map(function (k) { return nm(T.LEVERS.find(function (l) { return l.key === k; }).label); });
      var c = function (field, value) { return b.cl({ kind: 'combined', levers: e.keys, field: field, value: value }); };
      var R = function (n) { return Math.round(n); };
      b.text.push('Together, ' + names.join(' and ') + ' would take the modelled running cost for the month from RM ' + fg(c('runBefore', R(e.runBefore)), fnum(e.runBefore, 0)) + ' to RM ' + fg(c('runAfter', R(e.runAfter)), fnum(e.runAfter, 0)) + ', and the carbon from ' + fg(c('carbonBefore', R(e.carbonBefore)), fnum(e.carbonBefore, 0)) + ' kg to ' + fg(c('carbonAfter', R(e.carbonAfter)), fnum(e.carbonAfter, 0)) + ' kg.');
      b.text.push('The home score would go from ' + fg(c('scoreBefore', R(e.scoreBefore)), fnum(e.scoreBefore, 0)) + ' to ' + fg(c('scoreAfter', R(e.scoreAfter)), fnum(e.scoreAfter, 0)) + '; comfort ' + (e.comfortDrop > 0 ? 'drops by ' + fg(c('comfortDrop', R(e.comfortDrop)), fnum(e.comfortDrop, 0)) + ' points' : 'holds or improves') + '.');
      if (e.keys.length > 1) b.text.push('These changes overlap, so they do not simply add up: adding the single effects would suggest ' + fg(c('additiveCarbon', R(e.additiveCarbon)), fnum(e.additiveCarbon, 0)) + ' kg and RM ' + fg(c('additiveRm', R(e.additiveRm)), fnum(e.additiveRm, 0)) + ' saved, but together they save ' + fg(c('carbonSaved', R(e.carbonSaved)), fnum(e.carbonSaved, 0)) + ' kg and RM ' + fg(c('rmSaved', R(e.rmSaved)), fnum(e.rmSaved, 0)) + '.');
    } },
    what_if: { kind: 'read', describe: 'The effect of one change.', params: { lever: 1 }, run: function (a, ctx, b) {
      var e = leverEffect(ctx.input, a.lever);
      var c = b.cl({ kind: 'lever', lever: a.lever, field: 'carbonKg', value: Math.round(e.carbonKg) }), r = b.cl({ kind: 'lever', lever: a.lever, field: 'rm', value: Math.round(e.rm) }), d = b.cl({ kind: 'lever', lever: a.lever, field: 'comfortDrop', value: Math.round(e.comfortDrop) });
      b.text.push(nm(e.lever.label) + ': carbon ' + (e.carbonKg >= 0 ? 'falls' : 'rises') + ' by about ' + fg(c, fnum(Math.abs(e.carbonKg), 0)) + ' kg, the bill and car cost ' + (e.rm >= 0 ? 'fall' : 'rise') + ' by about RM ' + fg(r, fnum(Math.abs(e.rm), 0)) + ', and comfort ' + (e.comfortDrop > 0 ? 'drops' : 'holds or improves') + (e.comfortDrop > 0 ? ' by ' + fg(d, fnum(Math.abs(e.comfortDrop), 0)) + ' points' : '') + '.');
      var ch = b.cl({ kind: 'change', lever: a.lever }); b.cards.push({ type: 'confirm', lever: a.lever, claim: ch });
    } },
    where_from: { kind: 'read', describe: 'Where a number comes from and how sure it is.', params: { name: 1 }, run: function (a, ctx, b) {
      var x = T.ASSUME[a.name], i = b.cl({ kind: 'assumption', name: a.name });
      b.text.push('The value used is ' + fg(i, fnum(x.v, 3)) + ', described as: ' + fg(i, x.note) + '. Grade: ' + x.grade + '. ' + (x.grade === 'REAL' ? 'This comes from public data.' : x.grade === 'SOURCED' ? 'This has a published source.' : 'This is a placeholder to replace before any claim.'));
      if (a.name === 'stopKm' && T.validLot(ctx.input.lot)) {   // the real figure is for the township centre; your lot has its own, scaled one
        var li = T.lotInfo(ctx.input.lot), n = b.cl({ kind: 'lot', field: 'n', value: li.n }), k = b.cl({ kind: 'lot', field: 'km', value: Math.round(li.km * 100) / 100 });
        b.text.push('From your lot, lot ' + fg(n, String(li.n)) + ', it is about ' + fg(k, fnum(li.km, 2)) + ' km. The township layout is a drawing, so that figure is scaled from the real one and is illustrative.');
      }
    } },
    propose_change: { kind: 'write', describe: 'Draft a change for the person to confirm. Never applies it.', params: { lever: 1 }, run: function (a, ctx, b) {
      var lv = T.LEVERS.find(function (l) { return l.key === a.lever; }), ch = b.cl({ kind: 'change', lever: a.lever });
      b.text.push('Here is the change to confirm: ' + nm(lv.label) + '. Nothing happens until you press apply.'); b.cards.push({ type: 'confirm', lever: a.lever, claim: ch });
    } },
  };
  var TOOL_SCHEMA = function () { return Object.keys(TOOLS).map(function (n) { return { name: n, kind: TOOLS[n].kind, description: TOOLS[n].describe, params: TOOLS[n].params }; }); };

  function validCall(call) {
    var t = TOOLS[call && call.tool]; if (!t) return 'Unknown tool.';
    var a = call.args || {};
    for (var k in a) if (!(k in t.params)) return 'Unexpected argument ' + k + '.';
    if ('lever' in t.params && !T.LEVERS.some(function (l) { return l.key === a.lever; })) return 'Unknown lever.';
    if ('key' in t.params && !['energy', 'resilience', 'community', 'biodiversity'].includes(a.key)) return 'Unknown pillar.';
    if ('name' in t.params && !(a.name in T.ASSUME)) return 'Unknown assumption.';
    if ('levers' in t.params && !T.validLeverSet(a.levers)) return 'Unknown or repeated change.';
    return null;
  }

  // ---- the rules that choose a tool: the only part a model would replace; it returns the same {calls} ----
  function rulePlanner(question, ctx) {
    var q = String(question || '').toLowerCase().trim(); if (!q) return null;
    var lever = null;
    if (/air.?con|\bac\b|cooling/.test(q) && /(less|fewer|reduce|cut|drop|lower|shorter)/.test(q)) lever = 'acHours';
    else if (/setpoint|warmer|degree|temperature/.test(q)) lever = 'setpoint';
    else if (/walk|on foot/.test(q) && !/score/.test(q)) lever = 'walkShare';
    else if (/tree|plant/.test(q)) lever = 'trees';
    else if (/solar|panel/.test(q)) lever = 'solarKwp';
    if (altOf(ctx) && !/neighbour|neighbor|average/.test(q) && /compare|versus|option b|other (home|lot)|which is better/.test(q)) return { intent: 'comparehomes', calls: [{ tool: 'compare_homes', args: {} }] };
    if (/first look|what would living|cost me to live|living here|my month in this home/.test(q)) return { intent: 'firstlook', calls: [{ tool: 'first_look', args: {} }] };
    if (/(apply|do it|go ahead|make that change|confirm)/.test(q)) return { intent: 'propose', calls: [{ tool: 'propose_change', args: { lever: lever || (T.suggest(ctx.input, 1)[0] || {}).key || 'acHours' } }] };
    if (lever && /(what if|if i|should i|would|how much|effect|save)/.test(q)) return { intent: 'whatif', calls: [{ tool: 'what_if', args: { lever: lever } }] };
    if (/bus|stop|transit|how far/.test(q)) return { intent: 'stop', calls: [{ tool: 'where_from', args: { name: 'stopKm' } }] };
    if (/where.*(come|from)|source|how sure|trust|made up|real\b|illustrative/.test(q)) {
      var name = /bill|tariff|cost|rm\b/.test(q) ? 'tariff' : /walk/.test(q) ? 'walkMinKm' : /solar/.test(q) ? 'solarPerf' : 'gridKgKwh';
      return { intent: 'where', calls: [{ tool: 'where_from', args: { name: name } }] };
    }
    if (/(why|explain|how).*(energy|carbon).*(score|pillar)|energy.*(score|pillar)/.test(q)) return { intent: 'pillar', calls: [{ tool: 'pillar', args: { key: 'energy' } }] };
    if (/resilien|comfort|hot night/.test(q)) return { intent: 'pillar', calls: [{ tool: 'pillar', args: { key: 'resilience' } }] };
    if (/community|walking score|walk.*score/.test(q)) return { intent: 'pillar', calls: [{ tool: 'pillar', args: { key: 'community' } }] };
    if (/biodiversity|tree score/.test(q)) return { intent: 'pillar', calls: [{ tool: 'pillar', args: { key: 'biodiversity' } }] };
    if (/neighbour|neighbor|compare|average/.test(q)) return { intent: 'compare', calls: [{ tool: 'compare_neighbour', args: {} }] };
    if (/biggest|best change|what should i|improve|change first|reduce most|save most/.test(q)) return { intent: 'biggest', calls: [{ tool: 'biggest_change', args: {} }] };
    if (/brief|summary|overview|how am i|how are we|how did|score|where do (we|i) stand/.test(q)) return { intent: 'briefing', calls: [{ tool: 'briefing', args: {} }] };
    return null;
  }

  function answerQuestion(question, ctx, planner) {
    var plan = (planner || rulePlanner)(question, ctx);
    if (!plan) return { intent: null, text: [REFUSAL], claims: [], cards: [], calls: [] };
    var b = { claims: [], text: [], cards: [], cl: function (c) { b.claims.push(c); return b.claims.length - 1; } }, ran = [];
    for (var i = 0; i < (plan.calls || []).length; i++) {
      var call = plan.calls[i], bad = validCall(call);
      if (bad) return { intent: null, text: [REFUSAL], claims: [], cards: [], calls: [], rejectedCall: bad };
      TOOLS[call.tool].run(call.args || {}, ctx, b); ran.push({ tool: call.tool, args: call.args || {}, kind: TOOLS[call.tool].kind });
    }
    return { intent: plan.intent, text: b.text, claims: b.claims, cards: b.cards, calls: ran };
  }

  // What a claim is allowed to show, recomputed from the model alone; null if the claim is false.
  function claimTokens(c, ctx) {
    var S = scoresOf(ctx);
    switch (c && c.kind) {
      case 'figure': { var f = S.you.figures[c.key]; return f && SHOWN.indexOf(c.key) >= 0 && Math.round(f.value) === c.value ? tokensOf(fnum(f.value, 0)) : null; }
      case 'neighbour': { var n = S.neighbour.figures[c.key]; return n && SHOWN.indexOf(c.key) >= 0 && Math.round(n.value) === c.value ? tokensOf(fnum(n.value, 0)) : null; }
      case 'pillar': { var p = S.pillars.find(function (x) { return x.key === c.key; }); return p && Math.round(p.score) === c.value ? tokensOf(fnum(p.score, 0)) : null; }
      case 'total': return Math.round(S.total) === c.value ? tokensOf(fnum(S.total, 0)) : null;
      case 'formula': { var q = S.pillars.find(function (x) { return x.key === c.key; }); return q ? tokensOf(q.formula) : null; }
      case 'lever': { var e = leverEffect(ctx.input, c.lever); if (!e || ['carbonKg', 'rm', 'comfortDrop'].indexOf(c.field) < 0) return null; var v = c.field === 'rm' && c.value === 0 && e.rm < 0 ? 0 : e[c.field]; return Math.round(v) === c.value ? tokensOf(fnum(Math.abs(c.value), 0)) : null; }
      case 'lot': { var lt = T.lotInfo(ctx.input.lot); if (!lt) return null; return c.field === 'n' && lt.n === c.value ? [String(lt.n)] : c.field === 'km' && Math.round(lt.km * 100) / 100 === c.value ? tokensOf(fnum(lt.km, 2)) : c.field === 'walkMin' && Math.round(lt.walkMin) === c.value ? [String(c.value)] : null; }
      case 'level': { if (ctx.input.house !== 'condo') return null; var lv = Math.min(T.CONDO_LEVELS, Math.max(1, Math.round(Number(ctx.input.level) || 1))); return lv === c.value ? [String(lv)] : null; }
      case 'pillarExtreme': { var ps = S.pillars; var best = ps.reduce(function (m, p) { return (c.which === 'max' ? p.score > m.score : p.score < m.score) ? p : m; }); return (c.which === 'max' || c.which === 'min') && best.key === c.key ? [] : null; }
      case 'compare': {
        var alt = altOf(ctx); if (!alt) return null;
        var cm = T.compare(ctx.input, alt), fields = ['monthKwh', 'monthBill', 'carbonKg', 'carRm', 'stopKm', 'total'];
        if (c.field === 'same') return c.value === 0 && fields.every(function (k) { return cm.row(k).diff === 0; }) ? [] : null;
        if (fields.indexOf(c.field) < 0) return null;
        var rw = cm.row(c.field); return rw.diff === c.value ? tokensOf(fnum(Math.abs(c.value), rw.dec)) : null;
      }
      case 'combined': {
        var ce = T.combinedEffect(ctx.input, c.levers); if (!ce) return null;
        var fieldsOk = ['runBefore', 'runAfter', 'carbonBefore', 'carbonAfter', 'carbonSaved', 'rmSaved', 'comfortDrop', 'scoreBefore', 'scoreAfter', 'additiveCarbon', 'additiveRm'];
        return fieldsOk.indexOf(c.field) >= 0 && Math.round(ce[c.field]) === c.value ? tokensOf(fnum(Math.abs(c.value), 0)) : null;
      }
      case 'assumption': { var a = T.ASSUME[c.name]; return a ? tokensOf(fnum(a.v, 3) + ' ' + a.note) : null; }
      case 'change': { var lv = T.LEVERS.find(function (l) { return l.key === c.lever; }); return lv ? tokensOf(lv.label) : null; }
      case 'count': return c.what === 'suggestions' && T.suggest(ctx.input, 5).length === c.value ? [String(c.value)] : null;
      default: return null;
    }
  }

  function validCard(c, ctx) {
    switch (c && c.type) {
      case 'pillars': return null;
      case 'confirm': return T.LEVERS.some(function (l) { return l.key === c.lever; }) ? null : 'Unknown lever.';
      default: return 'Unknown card.';
    }
  }

  // Three rules. A claim must be true when recomputed. A figure must sit in a marker naming a claim, and every number in it must be one that
  // claim may show; any number outside a marker is rejected. Tool calls and cards must name real things, and a confirm card needs a verified
  // change claim for the same lever. What it cannot judge is whether the words around a figure describe it, which is why the sentences are fixed.
  function verifyAnswer(ans, ctx) {
    var problems = [], allowed = ans.claims.map(function (c, i) { var t = claimTokens(c, ctx); if (t === null) problems.push('Claim ' + (i + 1) + ' (' + (c && c.kind) + ') is not supported by the model.'); return t; });
    var known = {}; scoresOf(ctx).pillars.forEach(function (p) { known[p.name] = 1; }); T.LEVERS.forEach(function (l) { known[l.label] = 1; });
    Object.keys(T.HOUSES).forEach(function (h) { known[T.HOUSES[h].label] = 1; });
    if (altOf(ctx)) { var cmpNames = T.compare(ctx.input, altOf(ctx)); known[cmpNames.labelA] = 1; known[cmpNames.labelB] = 1; }
    Object.keys(scoresOf(ctx).you.figures).forEach(function (k) { known[scoresOf(ctx).you.figures[k].label] = 1; });
    var text = ans.text.join('\n'), m;
    (text.match(/⟦[^⟧]*⟧/g) || []).forEach(function (x) { if (!known[x.slice(1, -1)]) problems.push('Unknown name ' + x.slice(1, -1) + '.'); });
    FIG.lastIndex = 0;
    while ((m = FIG.exec(text)) !== null) {
      var i = Number(m[1]), t = allowed[i];
      if (!ans.claims[i]) problems.push('A figure cites claim ' + i + ', which does not exist.');
      else if (t === null) problems.push('A figure cites claim ' + (i + 1) + ', which failed.');
      else tokensOf(m[2]).forEach(function (x) { if (t.indexOf(x) < 0) problems.push('The figure ' + x + ' is not a value claim ' + (i + 1) + ' is allowed to show.'); });
    }
    tokensOf(text.replace(/⟦[^⟧]*⟧/g, ' ').replace(FIG, ' ')).forEach(function (x) { problems.push('The figure ' + x + ' is not tied to any claim.'); });
    (ans.calls || []).forEach(function (c) { var bad = validCall(c); if (bad) problems.push('Tool call ' + c.tool + ': ' + bad); });
    (ans.cards || []).forEach(function (c) {
      var bad = validCard(c, ctx); if (bad) { problems.push('Card ' + (c && c.type) + ': ' + bad); return; }
      if (c.type === 'confirm' && !ans.claims.some(function (k, j) { return k.kind === 'change' && k.lever === c.lever && allowed[j] !== null; })) problems.push('A confirm card has no matching verified claim.');
    });
    return { ok: problems.length === 0, problems: problems, checked: ans.claims.length };
  }

  // produce: whatever writes the answer. By default the rules above. A model could be passed instead: its answer goes through the same
  // verifier, and one that fails is withheld just the same.
  function ask(question, ctx, produce, planner) {
    var a = (produce || function (q, c) { return answerQuestion(q, c, planner); })(question, ctx), v = verifyAnswer(a, ctx);
    return v.ok ? Object.assign({ cards: [], calls: [] }, a, { withheld: false, checked: v.checked })
                : { intent: a.intent, text: ['That answer was withheld: it did not pass the check against the model.'], claims: [], cards: [], calls: [], withheld: true, problems: v.problems, checked: 0 };
  }
  var render = function (t) { return String(t).replace(FIG, function (_, i, s) { return s; }).replace(/⟦([^⟧]*)⟧/g, '$1'); };

  var API = { ask: ask, answerQuestion: answerQuestion, verifyAnswer: verifyAnswer, rulePlanner: rulePlanner, TOOLS: TOOLS, TOOL_SCHEMA: TOOL_SCHEMA, validCall: validCall, claimTokens: claimTokens, tokensOf: tokensOf, EXAMPLES: EXAMPLES, render: render, fg: fg, leverEffect: leverEffect };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TerrariumAI = API;
})(typeof window !== 'undefined' ? window : globalThis);
