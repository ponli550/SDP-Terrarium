(function () {
  var T = window.Terrarium;
  var st = Object.assign({}, T.DEFAULTS, { walkShare: 0.2 });
  var g = null, draft = null, anim = null, scene = null, speed = 4, clockDay = 1, sim = null, inspected = null, lastClk = { day: 1, hour: 6 }, lastInspHour = -1;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = {
    'RM': function (v) { return 'RM ' + v.toFixed(0); }, 'kWh': function (v) { return v.toFixed(0) + ' kWh'; },
    'kg CO2': function (v) { return v.toFixed(0) + ' kg'; }, 'min': function (v) { return v.toFixed(0) + ' min'; },
    '%': function (v) { return v.toFixed(0) + '%'; }, 'km': function (v) { return v.toFixed(2) + ' km'; },
    'trees': function (v) { return v.toFixed(0); }, 'index': function (v) { return v.toFixed(1); }
  };
  var sel = $('house');
  Object.keys(T.HOUSES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = T.HOUSES[k].label; sel.appendChild(o); });

  // ---- the 3D scene, if this browser can draw it ----
  try {
    if (!window.THREE || !window.Scene3D) throw new Error('3D scripts not loaded');
    var q = new URLSearchParams(location.search), shot = q.has('shot');
    scene = window.Scene3D.create($('stage'), T, { onClock: onClock, onInspect: onInspect, picks: q.get('picks') ? q.get('picks').split(',') : null, preserve: shot, fixedStep: shot ? 0.05 : 0, maxFrames: shot ? +(q.get('frames') || 90) : 0 });
  } catch (e) {
    var m = document.createElement('div'); m.className = 'nowebgl'; m.id = 'nowebgl';
    m.innerHTML = '<div><b>The 3D view needs WebGL.</b><br>The model, the game and the scores still work below.</div>';
    $('stage').appendChild(m); scene = null;
  }

  // ---- the inspect panel: click anything in the scene ----
  function onInspect(kind) { inspected = kind; lastInspHour = -1; renderInspect(); }
  function renderInspect() {
    var box = $('inspect'), info = inspected && T.inspectInfo(inspected, currentInput(), lastClk);
    if (!info) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<button class="x" id="inspClose" aria-label="Close">&times;</button><div class="it">' + esc(info.title) + '</div><table>' +
      info.rows.map(function (r) { return '<tr><td>' + esc(r.k) + '<span class="badge ' + r.grade + '">' + r.grade + '</span></td><td>' + esc(r.v) + '</td></tr>'; }).join('') + '</table>' +
      info.facts.map(function (f) { return '<div class="f">' + esc(f) + '</div>'; }).join('');
    $('inspClose').onclick = function () { if (scene) scene.select(null); else onInspect(null); };
  }
  function currentInput() { return g ? T.gameInput(g) : st; }
  function weekRange(w) { return [w * 7 + 1, w === 3 ? 30 : w * 7 + 7]; }

  // ---- heads-up display ----
  function onClock(day, hour) {
    lastClk = { day: day, hour: hour }; if (inspected && Math.floor(hour) !== lastInspHour) { lastInspHour = Math.floor(hour); renderInspect(); }
    var input = currentInput(), d = sim.days[day - 1] || sim.days[29];
    var kwhToday = d.netKwh * hour / 24, before = 0;
    for (var i = 0; i < day - 1; i++) before += sim.days[i].netKwh;
    var mtd = before + kwhToday, trips = T.tripsUpTo(day, input), wx = T.weatherAt(day, hour, input);
    var hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    $('hudClock').innerHTML = '<b>Day ' + day + ' &middot; ' + ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2) + '</b><br><span class="wx ' + wx.label.split(' ')[0] + '">' + wx.label + ' &middot; ' + wx.temp.toFixed(0) + ' C</span>';
    $('hudFigs').innerHTML =
      '<div><small>Electricity today</small><b>' + kwhToday.toFixed(1) + ' kWh</b></div>' +
      '<div><small>Month so far</small><b>' + mtd.toFixed(0) + ' kWh</b></div>' +
      '<div><small>Home carbon so far</small><b>' + (mtd * T.ASSUME.gridKgKwh.v).toFixed(0) + ' kg</b></div>' +
      '<div><small>Trips on foot / by car</small><b>' + trips.walk + ' / ' + trips.car + '</b></div>';
    if (day !== clockDay) { clockDay = day; chart(sim.days); }
  }

  // ---- panels ----
  function sync() {
    sel.value = st.house; ['acHours', 'setpoint', 'solarKwp', 'trees'].forEach(function (k) { $(k).value = st[k]; });
    $('walkShare').value = Math.round(st.walkShare * 100); $('nativeShare').value = Math.round(st.nativeShare * 100); $('hotWeek').checked = st.hotWeek;
    $('treesV').textContent = st.trees; $('nativeShareV').textContent = Math.round(st.nativeShare * 100) + '%';
    $('acHoursV').textContent = st.acHours + ' h'; $('setpointV').textContent = st.setpoint + ' C';
    $('solarKwpV').textContent = st.solarKwp ? st.solarKwp + ' kWp' : 'none'; $('walkShareV').textContent = Math.round(st.walkShare * 100) + '%';
  }
  function render() {
    sync();
    var input = currentInput(), s = T.scores(input), f = s.you.figures; sim = s.you;
    $('total').textContent = 'home score ' + s.total.toFixed(0) + ' / 100';
    $('pillars').innerHTML = s.pillars.map(function (p) { return '<div class="card"><div class="vs">' + p.name + '</div><div class="score">' + p.score.toFixed(0) + '</div><div class="bar"><i style="width:' + p.score + '%"></i></div><div class="formula">' + p.formula + '</div></div>'; }).join('');
    var nb = s.neighbour.figures;
    $('figs').innerHTML = Object.keys(f).map(function (k) { var x = f[k], n = nb[k]; var cmp = (k === 'stopKm' || !n) ? '' : '<small>neighbour ' + fmt[x.unit](n.value) + '</small>'; return '<div class="fig"><small>' + x.label + '<span class="badge ' + x.grade + '">' + x.grade + '</span></small><b>' + fmt[x.unit](x.value) + '</b>' + cmp + '</div>'; }).join('');
    ['acHours', 'setpoint', 'walkShare'].forEach(function (k) { $(k).disabled = !!g; });
    ['house', 'solarKwp', 'trees', 'nativeShare', 'hotWeek'].forEach(function (k) { $(k).disabled = !!(g && g.weekly.length); });
    $('skip').hidden = !anim;
    $('play').disabled = !!g;
    if (scene) scene.setInput(input);
    chart(s.you.days); gameView(input, s);
    if (!scene) onClock(clockDay, 12);
  }
  function chart(days) {
    var W = 640, H = 220, pl = 34, pb = 24, pt = 10, mx = Math.max.apply(null, days.map(function (d) { return d.netKwh; })) * 1.15 || 1, bw = (W - pl) / days.length, out = '';
    [0, .5, 1].forEach(function (t) { var y = H - pb - t * (H - pb - pt); out += '<line x1="' + pl + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="currentColor" opacity=".12"/><text x="0" y="' + (y + 4) + '" font-size="10" fill="currentColor" opacity=".6">' + (t * mx).toFixed(0) + '</text>'; });
    days.forEach(function (d, i) { var h = d.netKwh / mx * (H - pb - pt), x = pl + i * bw; out += '<rect x="' + (x + 1) + '" y="' + (H - pb - h) + '" width="' + (bw - 2) + '" height="' + h + '" rx="2" fill="' + (d.day <= clockDay ? 'var(--g2)' : 'var(--line)') + '"/>'; });
    var tmin = 24, tmax = 34, pts = days.map(function (d, i) { return (pl + i * bw + bw / 2) + ',' + (H - pb - (d.meanTemp - tmin) / (tmax - tmin) * (H - pb - pt)); }).join(' ');
    out += '<polyline points="' + pts + '" fill="none" stroke="var(--warn)" stroke-width="2"/>';
    [1, 10, 20, 30].forEach(function (n) { out += '<text x="' + (pl + (n - 1) * bw + bw / 2) + '" y="' + (H - 6) + '" font-size="10" text-anchor="middle" fill="currentColor" opacity=".6">' + n + '</text>'; });
    $('chart').innerHTML = out;
  }

  // ---- the game ----
  function lastChoice() { return g.weekly.length ? g.weekly[g.weekly.length - 1] : { acHours: g.setup.acHours, setpoint: g.setup.setpoint, walkShare: g.setup.walkShare }; }
  function startWeekAnimation(w) {
    var r = weekRange(w); anim = { week: w };
    if (!scene) { anim = null; return; }
    scene.setRange(r[0], r[1], false); scene.jumpTo(r[0], 6); scene.setSpeed(speed);
    scene.play(function () { anim = null; render(); });
  }
  function gameView(input, s) {
    var b = $('gameBody');
    if (!g) {
      b.innerHTML = '<p>Run this home for four weeks. Each week brings an event, you choose air-con, setpoint and walking, then watch the week play out in the township. At the end you are scored on the four pillars against the neighbour average. Set the home, solar and trees below first.</p><div class="row"><button class="cta" id="gStart">Start the month</button></div>';
      $('gStart').onclick = function () { g = T.newGame(st); draft = null; clockDay = 1; if (scene) { scene.pause(); scene.jumpTo(1, 6); } render(); };
      return;
    }
    if (anim) {
      var ev0 = T.EVENTS[anim.week];
      b.innerHTML = '<div class="ev"><b>Week ' + (anim.week + 1) + ' of 4 is playing: ' + ev0.title + '</b>' + ev0.note + '</div><p class="note">Watch the township. Use the speed buttons or skip the week.</p>';
      return;
    }
    if (T.isFinished(g)) {
      var sug = T.suggest(input, 2);
      b.innerHTML = '<div class="ev"><b>Month finished: home score ' + s.total.toFixed(0) + ' / 100</b>The neighbour average scores 50 on energy, community and biodiversity. Scores are placeholders and the figures are illustrative.</div>' +
        '<table class="wk"><tr><th>Pillar</th><th>Score</th></tr>' + s.pillars.map(function (p) { return '<tr><td>' + p.name + '</td><td>' + p.score.toFixed(0) + '</td></tr>'; }).join('') + '</table>' +
        '<h2 style="margin-top:14px">What to change next month</h2>' + (sug.length ? '<ul class="sug">' + sug.map(function (x) { return '<li>' + x.label + ': about ' + x.carbonKg.toFixed(0) + ' kg less carbon and RM ' + Math.max(0, x.rm).toFixed(0) + ' saved, comfort held</li>'; }).join('') + '</ul>' : '<p class="note">No single change cuts carbon without costing comfort. Your choices are already balanced.</p>') +
        '<p class="note">After handover, a real meter would replace the simulated figures here.</p><div class="row"><button class="cta" id="gAgain">Play again</button></div>';
      $('gAgain').onclick = function () { g = null; draft = null; anim = null; clockDay = 1; if (scene) { scene.setRange(1, 30, true); scene.jumpTo(1, 6); scene.setSpeed(speed); scene.play(); } render(); };
      return;
    }
    var wk = g.weekly.length + 1, ev = T.EVENTS[wk - 1];
    if (!draft) draft = Object.assign({}, lastChoice());
    var maxWalk = wk === 4 ? 50 : 100; draft.walkShare = Math.min(draft.walkShare, maxWalk / 100);
    var rows = g.weekly.map(function (c, i) { return '<tr><td>Week ' + (i + 1) + '</td><td>' + c.acHours + ' h at ' + c.setpoint + ' C</td><td>' + Math.round(c.walkShare * 100) + '% on foot</td></tr>'; }).join('');
    b.innerHTML = '<div class="ev"><b>Week ' + wk + ' of 4: ' + ev.title + '</b>' + ev.note + '</div>' +
      '<label for="gAc">Air-con hours at night <span id="gAcV">' + draft.acHours + ' h</span></label><input type="range" id="gAc" min="0" max="12" step="1" value="' + draft.acHours + '">' +
      '<label for="gSp">Setpoint <span id="gSpV">' + draft.setpoint + ' C</span></label><input type="range" id="gSp" min="22" max="28" step="1" value="' + draft.setpoint + '">' +
      '<label for="gWk">Short trips on foot <span id="gWkV">' + Math.round(draft.walkShare * 100) + '%</span></label><input type="range" id="gWk" min="0" max="' + maxWalk + '" step="10" value="' + Math.round(draft.walkShare * 100) + '">' +
      '<div class="row"><button class="cta" id="gLock">Lock in week ' + wk + ' and watch</button><button id="gQuit">Quit</button></div>' + (rows ? '<table class="wk">' + rows + '</table>' : '') +
      '<p class="note">Scores are projected: weeks you have not played yet repeat your last choice.</p>';
    $('gAc').oninput = function (e) { draft.acHours = +e.target.value; $('gAcV').textContent = draft.acHours + ' h'; };
    $('gSp').oninput = function (e) { draft.setpoint = +e.target.value; $('gSpV').textContent = draft.setpoint + ' C'; };
    $('gWk').oninput = function (e) { draft.walkShare = +e.target.value / 100; $('gWkV').textContent = e.target.value + '%'; };
    $('gLock').onclick = function () { var w = g.weekly.length; g = T.play(g, draft); draft = null; startWeekAnimation(w); render(); };
    $('gQuit').onclick = function () { g = null; draft = null; anim = null; if (scene) { scene.setRange(1, 30, true); scene.setSpeed(speed); scene.play(); } render(); };
  }

  // ---- the assistant: every answer is checked against the model before it is shown ----
  var AI = window.TerrariumAI;
  function showAnswer(r) {
    var out = $('askOut'), h = r.text.map(function (t) { return '<p>' + esc(AI.render(t)) + '</p>'; }).join('');
    r.cards.forEach(function (c) {
      if (c.type === 'pillars') h += '<table class="wk">' + T.scores(currentInput()).pillars.map(function (p) { return '<tr><td>' + p.name + '</td><td>' + p.score.toFixed(0) + '</td></tr>'; }).join('') + '</table>';
      if (c.type === 'confirm') { var lv = T.LEVERS.find(function (l) { return l.key === c.lever; }); h += '<div class="prop"><b>Proposed change: ' + esc(lv.label) + '</b><div class="row"><button class="cta" data-apply="' + c.lever + '">Apply</button><button data-dismiss="1">Dismiss</button></div></div>'; }
    });
    h += r.withheld ? '<div class="chk bad">Withheld: it did not pass the check against the model.</div>' : (r.checked ? '<div class="chk">Checked ' + r.checked + ' figure' + (r.checked === 1 ? '' : 's') + ' against the model before showing this.</div>' : '');
    out.innerHTML = h;
    out.querySelectorAll('[data-apply]').forEach(function (b) { b.onclick = function () {
      if (g) { out.insertAdjacentHTML('beforeend', '<p class="chk bad">Changes apply outside a game. Quit the game first.</p>'); return; }
      var lv = T.LEVERS.find(function (l) { return l.key === b.dataset.apply; }); Object.assign(st, T.applyLever(st, lv)); render();
      out.querySelector('.prop').innerHTML = '<b>Applied: ' + esc(lv.label) + '</b>';
    }; });
    out.querySelectorAll('[data-dismiss]').forEach(function (b) { b.onclick = function () { out.querySelector('.prop').remove(); }; });
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function askNow(q) { if (!q.trim()) return; $('askInput').value = q; showAnswer(AI.ask(q, { input: currentInput() })); }
  $('askChips').innerHTML = AI.EXAMPLES.map(function (q, i) { return '<button type="button" data-q="' + i + '">' + esc(q) + '</button>'; }).join('');
  $('askChips').addEventListener('click', function (e) { var i = e.target.dataset && e.target.dataset.q; if (i != null) askNow(AI.EXAMPLES[+i]); });
  $('askForm').addEventListener('submit', function (e) { e.preventDefault(); askNow($('askInput').value); });

  // ---- controls ----
  ['acHours', 'setpoint', 'solarKwp', 'trees'].forEach(function (k) { $(k).addEventListener('input', function (e) { st[k] = +e.target.value; if (g && !g.weekly.length) g = T.newGame(st); render(); }); });
  $('walkShare').addEventListener('input', function (e) { st.walkShare = +e.target.value / 100; render(); });
  $('nativeShare').addEventListener('input', function (e) { st.nativeShare = +e.target.value / 100; if (g && !g.weekly.length) g = T.newGame(st); render(); });
  sel.addEventListener('change', function (e) { st.house = e.target.value; if (g && !g.weekly.length) g = T.newGame(st); render(); });
  $('hotWeek').addEventListener('change', function (e) { st.hotWeek = e.target.checked; render(); });
  document.querySelectorAll('[data-speed]').forEach(function (b) {
    b.addEventListener('click', function () { speed = +b.dataset.speed; if (scene) scene.setSpeed(speed); document.querySelectorAll('[data-speed]').forEach(function (x) { x.classList.toggle('on', x === b); }); });
  });
  $('play').addEventListener('click', function () { if (!scene) return; if (scene.isRunning()) { scene.pause(); $('play').textContent = 'Play'; $('play').classList.remove('on'); } else { scene.play(); $('play').textContent = 'Pause'; $('play').classList.add('on'); } });
  $('follow').addEventListener('click', function () {
    if (!scene) return; var on = !scene.isFollowing(), r = scene.follow(on);
    $('follow').textContent = on ? 'Stop following' : 'Follow a trip'; $('follow').classList.toggle('on', on);
    if (on && r.note) $('legend').textContent = r.note;
  });
  $('skip').addEventListener('click', function () { if (anim && scene) scene.skipTo(weekRange(anim.week)[1]); });

  var q0 = new URLSearchParams(location.search);
  if (q0.has('shot')) {   // screenshot mode only: preset the home and game state so every view can be captured
    if (q0.get('house')) st.house = q0.get('house');
    ['acHours', 'setpoint', 'solarKwp', 'trees'].forEach(function (k) { if (q0.has(k)) st[k] = +q0.get(k); });
    if (q0.has('walk')) st.walkShare = +q0.get('walk'); if (q0.has('native')) st.nativeShare = +q0.get('native');
    if (q0.has('speed')) speed = +q0.get('speed');
    if (q0.has('autoweek')) { g = T.newGame(st); }
    if (q0.has('rain')) { g = T.newGame(st); for (var w4 = 0; w4 < 4; w4++) g = T.play(g, { acHours: st.acHours, setpoint: st.setpoint, walkShare: st.walkShare }); }
  }
  render();
  if (q0.has('shot') && q0.has('ask')) askNow(q0.get('ask'));
  if (q0.has('shot') && q0.has('inspect') && !scene) onInspect(q0.get('inspect'));
  if (q0.has('shot') && q0.has('autoweek') && scene) { startWeekAnimation(0); g = T.play(g, { acHours: st.acHours, setpoint: st.setpoint, walkShare: st.walkShare }); render(); }
  else if (scene) { scene.setRange(1, 30, true); scene.setSpeed(speed); scene.jumpTo(+(new URLSearchParams(location.search).get('day') || 1), +(new URLSearchParams(location.search).get('hour') || 6)); scene.play();
    if (q0.has('shot') && q0.has('inspect')) scene.select(q0.get('inspect'));
    if (q0.has('shot') && q0.has('follow')) { scene.follow(true); $('follow').textContent = 'Stop following'; $('follow').classList.add('on'); } }
  window.__terrarium = { inspect: onInspect, scene: function () { return scene; }, state: function () { return { g: g, anim: anim, clockDay: clockDay }; } };
})();
