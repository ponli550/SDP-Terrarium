(function () {
  var T = window.Terrarium;
  var st = Object.assign({}, T.DEFAULTS, { walkShare: 0.2 });
  var g = null, draft = null, anim = null, scene = null, speed = 4, clockDay = 1, sim = null, placing = null, inspected = null, lastClk = { day: 1, hour: 6 }, lastInspHour = -1;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = {
    'RM': function (v) { return 'RM ' + v.toFixed(0); }, 'kWh': function (v) { return v.toFixed(0) + ' kWh'; },
    'kg CO2': function (v) { return v.toFixed(0) + ' kg'; }, 'kg': function (v) { return v.toFixed(0) + ' kg'; }, 'min': function (v) { return v.toFixed(0) + ' min'; },
    '%': function (v) { return v.toFixed(0) + '%'; }, 'km': function (v) { return v.toFixed(2) + ' km'; },
    'trees': function (v) { return v.toFixed(0); }, 'trips': function (v) { return v.toFixed(0); }, 'pts': function (v) { return v.toFixed(0); }, 'index': function (v) { return v.toFixed(1); }
  };
  // ---- two pages in one app: Map (the 3D township, the play dock, the chat) and Analysis (habits, scores, chart, figures, bill) ----
  // One document, so a guest's home and a game in progress survive moving between them. The address (#/map, #/analysis) keeps Back and bookmarks working.
  var view = 'map', viewLaterAt = 0, modeLaterAt = 0, pausePlayAt = 0;
  function viewFromHash() { return location.hash === '#/analysis' ? 'analysis' : 'map'; }
  function setView(v) {
    view = v; $('viewMap').hidden = v !== 'map'; $('viewAnalysis').hidden = v !== 'analysis';
    if (v === 'map') { $('tabMap').setAttribute('aria-current', 'page'); $('tabAnalysis').removeAttribute('aria-current'); } else { $('tabAnalysis').setAttribute('aria-current', 'page'); $('tabMap').removeAttribute('aria-current'); }
    document.title = 'Terrarium \u00b7 ' + (v === 'map' ? 'Map' : 'Analysis');
    if (scene) scene.setActive(v === 'map');   // nothing is drawn, and the clock does not run, while the Analysis page is showing
    if (v === 'analysis') window.scrollTo(0, 0);
  }
  function go(v) { var h = v === 'analysis' ? '#/analysis' : '#/map'; if (location.hash !== h) location.hash = h; setView(v); }
  window.addEventListener('hashchange', function () { setView(viewFromHash()); });
  // the chat floats over the map; the play dock sits beside it. Both can be folded away.
  function openChat(on) { $('ask').hidden = !on; $('chatToggle').setAttribute('aria-expanded', String(!!on)); $('chatToggle').textContent = on ? 'Close chat' : 'Ask about your month'; if (on) $('askInput').focus(); }
  function openDock(on) { $('dockBody').hidden = !on; $('dockToggle').setAttribute('aria-expanded', String(!!on)); }
  $('chatToggle').addEventListener('click', function () { openChat($('ask').hidden); });
  $('dockToggle').addEventListener('click', function () { openDock($('dockBody').hidden); });
  if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) openDock(false);   // a small screen starts with the dock folded

  // ---- sign-in, the saved home and the set-up dialog ----
  var P = window.TerrariumProfile, session = null, store = null, firstRun = false, alt = null;
  try { store = P.createStore(window.localStorage); } catch (e) { store = P.createStore(null); }
  var SHOT = /[?&]shot\b/.test(location.search);
  var DEFAULT_STATE = function () { return Object.assign({}, T.DEFAULTS, { walkShare: 0.2 }); };
  var WIZ = [['house', 'Home'], ['level', 'Your floor (level 1 is the ground floor)', 1, 8, 1, ''], ['acHours', 'Air-con hours at night', 0, 12, 1, ' h'], ['setpoint', 'Setpoint', 22, 28, 1, ' C'], ['solarKwp', 'Rooftop solar', 0, 8, 1, ' kWp'], ['trees', 'Trees on your plot', 0, 10, 1, ''], ['nativeShare', 'Native planting', 0, 100, 10, '%']];
  function wizardHtml() {
    return WIZ.map(function (f) {
      if (f[0] === 'level') return '<div id="wr_level" hidden><label for="w_level">' + f[1] + ' <span id="w_levelV"></span></label><input type="range" id="w_level" min="1" max="8" step="1"></div>';
      if (f[0] === 'house') return '<label for="w_house">' + f[1] + '</label><select id="w_house">' + Object.keys(T.HOUSES).map(function (k) { return '<option value="' + k + '">' + T.HOUSES[k].label + '</option>'; }).join('') + '</select>';
      return '<label for="w_' + f[0] + '">' + f[1] + ' <span id="w_' + f[0] + 'V"></span></label><input type="range" id="w_' + f[0] + '" min="' + f[2] + '" max="' + f[3] + '" step="' + f[4] + '">';
    }).join('');
  }
  function wizardSync() {
    WIZ.forEach(function (f) {
      var el = $('w_' + f[0]); if (!el) return;
      var v = f[0] === 'nativeShare' ? Math.round(st.nativeShare * 100) : st[f[0]]; el.value = v;
      if (f[0] !== 'house') $('w_' + f[0] + 'V').textContent = (f[0] === 'solarKwp' && !v ? 'none' : f[0] === 'level' ? 'level ' + v : v + f[5]);
    });
    $('wr_level').hidden = st.house !== 'condo';
  }
  function saveProfile(setUp) { if (session && !placing) store.saveHome(P.pickHome(st), setUp); }   // a lot being tried out is not saved until it is confirmed
  // ---- placing your lot: click one on the map, or choose it from the list (so it works without a mouse or a 3D view) ----
  function lotText(i) { var l = T.lotInfo(i); return l ? 'Lot ' + l.n + ': ' + l.km.toFixed(2) + ' km to the bus stop, about ' + Math.round(l.walkMin) + ' min on foot. The layout is a drawing scaled from the real ' + T.ASSUME.stopKm.v + ' km centre distance, so these distances are illustrative.' : 'No lot chosen yet.'; }
  function lotRead(hover) { $('lotRead').textContent = hover !== null && hover !== undefined ? lotText(hover) : lotText(st.lot); }
  function startPlacing() {
    if (g || placing) return;
    go('map'); placing = { prev: st.lot }; closeWizard(); $('placeBar').hidden = false;
    $('lotSel').innerHTML = (T.validLot(st.lot) ? '' : '<option value="">Choose a lot</option>') + T.LOTS.map(function (_, i) { var l = T.lotInfo(i); return '<option value="' + i + '">Lot ' + l.n + ', ' + l.km.toFixed(2) + ' km</option>'; }).join('');
    if (T.validLot(st.lot)) $('lotSel').value = String(st.lot);
    if (scene) scene.placeMode(true); lotRead(null); $('lotSel').focus();
  }
  function chooseLot(i) { if (!placing || !T.validLot(i)) return; st.lot = i; if ($('lotSel').querySelector('option[value=""]')) $('lotSel').innerHTML = $('lotSel').innerHTML.replace('<option value="">Choose a lot</option>', ''); $('lotSel').value = String(i); render(); lotRead(null); }
  function stopPlacing() { placing = null; $('placeBar').hidden = true; if (scene) scene.placeMode(false); }
  function confirmLot() { if (!placing) return; if (!T.validLot(st.lot)) { $('lotRead').textContent = 'Choose a lot first.'; return; } stopPlacing(); saveProfile(true); showChip(); render(); if (firstRun) { firstRun = false; showFirstLook(); } }
  function cancelLot() { if (!placing) return; if (placing.prev === undefined) delete st.lot; else st.lot = placing.prev; stopPlacing(); render(); if (firstRun) openWizard(); }
  // ---- first look: what a month in this home would cost, shown once set-up is done; every figure is checked before it appears ----
  function showFirstLook() {
    var r = window.TerrariumAI.ask('What would living here cost me?', { input: currentInput() }), box = $('flBody');
    box.innerHTML = r.text.map(function (t) { return '<p>' + esc(window.TerrariumAI.render(t)) + '</p>'; }).join('');
    $('flCheck').textContent = r.withheld ? 'This summary did not pass the check against the model, so it is not shown.' : 'Checked ' + r.checked + ' figures against the model before showing this.';
    $('flCheck').className = 'chk' + (r.withheld ? ' bad' : '');
    $('firstLook').hidden = false; $('flPlay').focus();
  }
  // ---- compare: your home (A) against an alternative (B) with the same habits ----
  function openCompare() {
    if (g) return;
    alt = Object.assign({}, st, { lot: T.nearestOtherLot(T.validLot(st.lot) ? st.lot : -1) });
    $('cmpHouse').innerHTML = Object.keys(T.HOUSES).map(function (k) { return '<option value="' + k + '">' + T.HOUSES[k].label + '</option>'; }).join('');
    $('cmpLot').innerHTML = T.LOTS.map(function (_, i) { var l = T.lotInfo(i); return '<option value="' + i + '">Lot ' + l.n + ', ' + l.km.toFixed(2) + ' km from the stop</option>'; }).join('');
    $('compare').hidden = false; renderCompare(); $('cmpHouse').focus();
  }
  function closeCompare() { $('compare').hidden = true; }
  function renderCompare() {
    var a = Object.assign({}, st), c = T.compare(a, alt);
    $('cmpHouse').value = alt.house; $('cmpLot').value = String(alt.lot); $('cmpLevelRow').hidden = alt.house !== 'condo';
    $('cmpLevel').value = alt.level; $('cmpLevelV').textContent = 'level ' + alt.level + ' of ' + T.CONDO_LEVELS;
    var fmtv = function (r, v) { return fmt[r.unit](v); };
    $('cmpTable').innerHTML = '<table class="cmp"><thead><tr><th scope="col">Figure</th><th scope="col">A: ' + esc(c.labelA) + '</th><th scope="col">B: ' + esc(c.labelB) + '</th><th scope="col">B against A</th></tr></thead><tbody>' +
      c.rows.map(function (r) {
        var d = r.diff === 0 ? 'same' : (r.diff > 0 ? '+' : '\u2212') + fmtv(r, Math.abs(r.diff)), tick = '<span class="tick" aria-label="better">\u2713</span>';
        return '<tr' + (r.key === 'total' ? ' class="sum"' : '') + '><th scope="row" style="font-weight:' + (r.key === 'total' ? 700 : 400) + '">' + esc(r.label) + '</th><td' + (r.better === 'a' ? ' class="win"' : '') + '>' + fmtv(r, r.a) + (r.better === 'a' ? tick : '') + '</td><td' + (r.better === 'b' ? ' class="win"' : '') + '>' + fmtv(r, r.b) + (r.better === 'b' ? tick : '') + '</td><td>' + d + '</td></tr>';
      }).join('') + '</tbody></table>';
    var ans = window.TerrariumAI.ask('Compare the two homes', { input: a, alt: alt });
    $('cmpSay').innerHTML = ans.text.map(function (t) { return '<p>' + esc(window.TerrariumAI.render(t)) + '</p>'; }).join('');
    $('cmpCheck').textContent = ans.withheld ? 'This summary did not pass the check against the model, so it is not shown.' : 'Checked ' + ans.checked + ' figure' + (ans.checked === 1 ? '' : 's') + ' against the model before showing this.';
    $('cmpCheck').className = 'chk' + (ans.withheld ? ' bad' : '');
    var same = c.labelA === c.labelB; $('cmpApply').disabled = same; $('cmpApply').title = same ? 'Option B is the same as your home' : '';
  }
  function applyCompare() {
    if (!alt || g) return; var c = T.compare(st, alt); if (c.labelA === c.labelB) return;
    st.house = alt.house; st.level = alt.level; st.lot = alt.lot; closeCompare(); render();   // render saves the home
  }
  function hideFirstLook() { $('firstLook').hidden = true; }
  function finishSetup() { saveProfile(true); closeWizard(); if (firstRun) { firstRun = false; showFirstLook(); } }
  function openWizard() { wizardSync(); $('wizard').hidden = false; $('w_house').focus(); }
  function closeWizard() { $('wizard').hidden = true; }
  function showChip() { var c = $('userChip'); c.hidden = !session; if (session) { $('userName').textContent = session.guest ? 'Guest' : session.email; $('signOut').textContent = session.guest ? 'Leave' : 'Sign out'; } }
  function startSession(s) {
    session = s; firstRun = !!(s.isNew || s.setUp === false); Object.keys(st).forEach(function (k) { delete st[k]; }); Object.assign(st, DEFAULT_STATE(), P.sanitizeHome(s.home));
    if (st.billKwh === undefined) st.billKwh = null;
    $('gate').hidden = true; showChip(); draft = null; render();
    if (s.isNew || (s.setUp === false)) openWizard();
  }
  function showGate() { $('gateErr').textContent = ''; $('gateEmail').value = ''; $('gateNote').textContent = store.isPersistent() ? 'Demo sign-in: no password, and nothing leaves this browser. A real version would sign in through a server.' : 'Your browser is blocking storage, so your home will not be kept after you close this page. This is a demo sign-in with no password.'; $('gate').hidden = false; $('gateEmail').focus(); }
  $('wizFields').innerHTML = wizardHtml();
  WIZ.forEach(function (f) {
    $('w_' + f[0]).addEventListener(f[0] === 'house' ? 'change' : 'input', function (e) {
      st[f[0]] = f[0] === 'house' ? e.target.value : (f[0] === 'nativeShare' ? +e.target.value / 100 : +e.target.value);
      if (g && !g.weekly.length) g = T.newGame(st); render(); wizardSync();
    });
  });
  $('gateForm').addEventListener('submit', function (e) {
    e.preventDefault(); var r = store.signIn($('gateEmail').value);
    if (!r.ok) { $('gateErr').textContent = r.reason; return; }
    startSession({ email: r.email, guest: false, home: r.home, isNew: r.isNew });
  });
  $('gateGuest').addEventListener('click', function () { var r = store.guest(); startSession(Object.assign({ guest: true }, r)); });
  $('wizDone').addEventListener('click', finishSetup);
  $('myMonth').addEventListener('click', function () { if (!g) showFirstLook(); });
  $('flExplore').addEventListener('click', function () { hideFirstLook(); go('map'); });
  $('flCompare').addEventListener('click', function () { hideFirstLook(); openCompare(); });
  $('compareBtn').addEventListener('click', openCompare);
  $('anaCompare').addEventListener('click', openCompare);
  $('anaMonth').addEventListener('click', function () { if (!g) showFirstLook(); });
  $('anaMap').addEventListener('click', function () { go('map'); });
  $('cmpClose').addEventListener('click', closeCompare);
  $('cmpApply').addEventListener('click', applyCompare);
  $('cmpHouse').addEventListener('change', function (e) { alt.house = e.target.value; renderCompare(); });
  $('cmpLevel').addEventListener('input', function (e) { alt.level = +e.target.value; renderCompare(); });
  $('cmpLot').addEventListener('change', function (e) { alt.lot = +e.target.value; renderCompare(); });
  $('flPlay').addEventListener('click', function () { hideFirstLook(); go('map'); openDock(true); if ($('gStart')) $('gStart').click(); });
  $('wizNext').addEventListener('click', function () { saveProfile(false); startPlacing(); });
  $('moveHouse').addEventListener('click', function () { startPlacing(); });
  $('lotSel').addEventListener('change', function (e) { if (e.target.value !== '') chooseLot(+e.target.value); });
  $('lotConfirm').addEventListener('click', confirmLot);
  $('lotCancel').addEventListener('click', cancelLot);
  document.addEventListener('keydown', function (e) { if (e.key !== 'Escape') return; if (!$('firstLook').hidden) hideFirstLook(); else if (!$('compare').hidden) closeCompare(); else if (placing) cancelLot(); else if (!$('wizard').hidden) finishSetup(); else if (!$('ask').hidden) openChat(false); });
  $('editHome').addEventListener('click', function () { if (!g) openWizard(); });
  $('signOut').addEventListener('click', function () {
    store.signOut(); stopPlacing(); hideFirstLook(); closeCompare(); firstRun = false; session = null; g = null; anim = null; draft = null; Object.keys(st).forEach(function (k) { delete st[k]; }); Object.assign(st, DEFAULT_STATE(), { billKwh: null });
    if (scene) { scene.setRange(1, 30, true); scene.setSpeed(speed); scene.jumpTo(1, 6); scene.play(); }
    closeWizard(); showChip(); render(); showGate();
  });

  var sel = $('house');
  Object.keys(T.HOUSES).forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = T.HOUSES[k].label; sel.appendChild(o); });

  // ---- the 3D scene, if this browser can draw it ----
  try {
    if (!window.THREE || !window.Scene3D) throw new Error('3D scripts not loaded');
    var q = new URLSearchParams(location.search), shot = q.has('shot');
    scene = window.Scene3D.create($('stage'), T, { onClock: onClock, extraState: function () { return { hudWrites: hudWrites, rebuilds: rebuilds }; }, onFrame: function (f) { if (pausePlayAt && f === pausePlayAt) { scene.pause(); scene.play(); } if (modeLaterAt && f === modeLaterAt) scene.setViewMode('lab'); if (viewLaterAt && f === viewLaterAt) go('map'); if (stressN && f % 4 === 0 && rebuilds < stressN) { st.lot = rebuilds % 12; if (rebuilds % 3 === 0) st.house = ['terrace', 'semid', 'condo'][(rebuilds / 3) % 3]; rebuilds++; render(); } }, onViewMode: syncViewButtons, onShotDone: snapshotUi, stopIdle: /[?&]stopidle\b/.test(location.search), onInspect: onInspect, onLotPick: function (i) { chooseLot(i); }, onLotHover: function (i) { lotRead(i); }, clickLot: q.get('clicklot') !== null ? +q.get('clicklot') : undefined, clickKind: q.get('clickkind') || '', picks: q.get('picks') ? q.get('picks').split(',') : null, wheel: +q.get('wheel') || 0, preserve: shot, fixedStep: shot ? 0.05 : 0, maxFrames: shot ? +(q.get('frames') || 90) : 0 });
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
  var THROTTLE_HUD = /[?&]throttle\b/.test(location.search);   // screenshot mode normally bypasses the HUD throttle so frames stay deterministic
  var hudWrites = 0, rebuilds = 0, stressN = 0, lastHudAt = 0;
  function onClock(day, hour) {
    lastClk = { day: day, hour: hour }; if (inspected && Math.floor(hour) !== lastInspHour) { lastInspHour = Math.floor(hour); renderInspect(); }
    var input = currentInput(), d = sim.days[day - 1] || sim.days[29];
    var kwhToday = d.netKwh * hour / 24, before = 0;
    for (var i = 0; i < day - 1; i++) before += sim.days[i].netKwh;
    var mtd = before + kwhToday, trips = T.tripsUpTo(day, input), wx = T.weatherAt(day, hour, input);
    var hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60);
    // the clock moves every frame but the text only needs to change about ten times a second
    var nowMs = performance.now(); if (scene && (!SHOT || THROTTLE_HUD) && nowMs - lastHudAt < 100) return; lastHudAt = nowMs;
    syncScrub(day, hour);
    var clockHtml = '<b>Day ' + day + ' &middot; ' + ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2) + '</b><br><span class="wx ' + wx.label.split(' ')[0] + '">' + wx.label + ' &middot; ' + wx.temp.toFixed(0) + ' C</span>';
    var figsHtml =
      '<div><small>Electricity today</small><b>' + kwhToday.toFixed(1) + ' kWh</b></div>' +
      '<div><small>Month so far</small><b>' + mtd.toFixed(0) + ' kWh</b></div>' +
      '<div><small>Home carbon so far</small><b>' + (mtd * T.ASSUME.gridKgKwh.v).toFixed(0) + ' kg</b></div>' +
      '<div><small>Trips on foot / by car</small><b>' + trips.walk + ' / ' + trips.car + '</b></div>';
    $('hudClock').innerHTML = clockHtml; $('hudFigs').innerHTML = figsHtml; hudWrites += 2;
    if (day !== clockDay) { clockDay = day; chart(sim.days); }
  }

  // ---- panels ----
  function sync() {
    sel.value = st.house; ['acHours', 'setpoint', 'solarKwp', 'trees', 'level'].forEach(function (k) { $(k).value = st[k]; });
    $('levelRow').hidden = st.house !== 'condo'; $('levelV').textContent = 'level ' + st.level + ' of ' + T.CONDO_LEVELS;
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
    ['house', 'level', 'solarKwp', 'trees', 'nativeShare', 'hotWeek'].forEach(function (k) { $(k).disabled = !!(g && g.weekly.length); });
    $('billKwh').disabled = $('billReset').disabled = $('billForm').querySelector('button[type=submit]').disabled = !!g;
    billView(f);
    $('skip').hidden = !anim;
    $('play').disabled = !!g;
    if (scene) scene.setInput(input);
    chart(s.you.days); gameView(input, s); connectView();
    saveProfile(false); $('editHome').disabled = $('moveHouse').disabled = $('myMonth').disabled = $('compareBtn').disabled = $('anaCompare').disabled = $('anaMonth').disabled = !!g;
    $('anaHome').textContent = T.homeLabel(st);
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
      $('gStart').onclick = function () { if (placing) cancelLot(); g = T.newGame(st); draft = null; clockDay = 1; if (scene) { scene.pause(); scene.jumpTo(1, 6); } render(); };
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

  // ---- after handover: the owner's own bill replaces the simulated month ----
  function billView(f) {
    if (st.billKwh == null) return;
    if (Math.abs(f.monthKwh.value - st.billKwh) >= 1) $('billOut').innerHTML = '<p class="chk bad">The home or its settings changed since you matched your bill, so the electricity figures are simulated again. Press Match to line them up.</p>';
  }
  $('billForm').addEventListener('submit', function (e) {
    e.preventDefault(); var out = $('billOut'), v = +$('billKwh').value, r = T.calibrate(Object.assign({}, st, { baseScale: 1, billKwh: null }), v);
    if (!r.ok) { out.innerHTML = '<p class="chk bad">' + esc(r.reason) + '</p>'; return; }
    st.baseScale = r.baseScale; st.billKwh = r.billKwh; render();
    out.innerHTML = '<p>Your bill: <b>' + r.billKwh.toFixed(0) + ' kWh</b>. The model\'s own estimate for this home was ' + r.simulatedKwh.toFixed(0) + ' kWh, ' + Math.abs(r.gapPct).toFixed(0) + '% ' + (r.gapPct >= 0 ? 'below' : 'above') + ' your real month. The base load (everything that is not air-con) was scaled by ' + r.baseScale.toFixed(2) + ' so the month matches.</p><p class="chk">The electricity figure is now graded REAL. One bill cannot say why a home differs from the model, so the air-con, walking and tree figures stay illustrative.</p>';
  });
  $('billReset').addEventListener('click', function () { st.baseScale = 1; st.billKwh = null; $('billKwh').value = ''; $('billOut').innerHTML = ''; render(); });

  // ---- connect an AI assistant: the home as a file, and the client's config from two paths ----
  var M = window.TerrariumMcp;
  function connectView() {
    $('dlHome').href = 'data:application/json;charset=utf-8,' + encodeURIComponent(P.exportHome(P.pickHome(st)));
    $('dlWhat').textContent = T.homeLabel(st);
    var defaults = $('mcpDefaults').checked, out = $('mcpOut'); $('mcpHomeRow').hidden = defaults;
    var o = { serverPath: $('mcpServer').value.trim(), homePath: $('mcpHome').value.trim(), defaults: defaults }, nodeP = $('mcpNode').value.trim(); if (nodeP) o.nodePath = nodeP;
    out.textContent = ''; $('mcpCopy').hidden = true; $('mcpCopied').textContent = '';
    var line = function (cls, t) { var p = document.createElement('p'); p.className = cls; p.textContent = t; out.appendChild(p); };
    if (!o.serverPath || (!defaults && !o.homePath)) { line('note', defaults ? 'Paste the path to mcp/server.mjs to see the config.' : 'Download your home, then paste the two paths to see the config.'); return; }
    var r = M.configFor($('mcpClient').value, o);
    if (!r.ok) { line('chk bad', r.reason); return; }
    var title = document.createElement('b'); title.textContent = r.title; out.appendChild(title);
    line('note', r.where);
    var pre = document.createElement('pre'); pre.className = 'cfg'; pre.id = 'mcpConfigText'; pre.textContent = r.text; out.appendChild(pre);
    if (r.alt) { line('note', 'Or, as JSON (a .mcp.json in your project):'); var p2 = document.createElement('pre'); p2.className = 'cfg'; p2.textContent = r.alt; out.appendChild(p2); }
    var ul = document.createElement('ul'); r.notes.forEach(function (n) { var li = document.createElement('li'); li.textContent = n; ul.appendChild(li); }); out.appendChild(ul);
    $('mcpCopy').hidden = false; $('mcpCopy').dataset.text = r.text;
  }
  ['mcpClient', 'mcpDefaults', 'mcpServer', 'mcpHome', 'mcpNode'].forEach(function (id) { $(id).addEventListener(id === 'mcpClient' || id === 'mcpDefaults' ? 'change' : 'input', connectView); });
  $('mcpCopy').addEventListener('click', function () {
    var t = $('mcpCopy').dataset.text || '', done = function (ok) { $('mcpCopied').textContent = ok ? 'Copied' : 'Select the config and copy it yourself'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); }); else done(false);
  });

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
  function askNow(q) { if (!q.trim()) return; go('map'); openChat(true); $('askInput').value = q; showAnswer(AI.ask(q, { input: currentInput() })); }
  $('askChips').innerHTML = AI.EXAMPLES.map(function (q, i) { return '<button type="button" data-q="' + i + '">' + esc(q) + '</button>'; }).join('');
  $('askChips').addEventListener('click', function (e) { var i = e.target.dataset && e.target.dataset.q; if (i != null) askNow(AI.EXAMPLES[+i]); });
  $('askForm').addEventListener('submit', function (e) { e.preventDefault(); askNow($('askInput').value); });

  // ---- controls ----
  ['acHours', 'setpoint', 'solarKwp', 'trees', 'level'].forEach(function (k) { $(k).addEventListener('input', function (e) { st[k] = +e.target.value; if (g && !g.weekly.length) g = T.newGame(st); render(); }); });
  $('walkShare').addEventListener('input', function (e) { st.walkShare = +e.target.value / 100; render(); });
  $('nativeShare').addEventListener('input', function (e) { st.nativeShare = +e.target.value / 100; if (g && !g.weekly.length) g = T.newGame(st); render(); });
  sel.addEventListener('change', function (e) { st.house = e.target.value; if (g && !g.weekly.length) g = T.newGame(st); render(); });
  $('hotWeek').addEventListener('change', function (e) { st.hotWeek = e.target.checked; render(); });
  document.querySelectorAll('[data-speed]').forEach(function (b) {
    b.addEventListener('click', function () { speed = +b.dataset.speed; if (scene) scene.setSpeed(speed); document.querySelectorAll('[data-speed]').forEach(function (x) { x.classList.toggle('on', x === b); }); });
  });
  // the timeline: drag to any hour of the month (or of the week being played); dragging pauses, Play resumes from there
  var scrubbing = false, scrubEl = $('scrub');
  function clockText(day, hour) { var hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60); return 'Day ' + day + ' \u00b7 ' + ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2); }
  function syncScrub(day, hour) {
    if (!scene || scrubbing) return;
    var r = scene.getRange(), max = (r.to - r.from + 1) * 24 - 1;
    if (+scrubEl.max !== max) scrubEl.max = max;
    scrubEl.value = Math.round((day - r.from) * 24 + hour);
    $('scrubOut').textContent = clockText(day, hour); scrubEl.setAttribute('aria-valuetext', $('scrubOut').textContent);
  }
  function setPlayUi(on) { $('play').textContent = on ? 'Pause' : 'Play'; $('play').classList.toggle('on', on); }
  scrubEl.addEventListener('input', function () {
    if (!scene) return;
    var r = scene.getRange(), v = +scrubEl.value, day = r.from + Math.floor(v / 24), hour = v % 24;
    scene.pause(); setPlayUi(false); lastHudAt = 0; scene.seek(day, hour);
    $('scrubOut').textContent = clockText(day, hour); scrubEl.setAttribute('aria-valuetext', $('scrubOut').textContent);
  });
  scrubEl.addEventListener('pointerdown', function () { scrubbing = true; });
  ['pointerup', 'pointercancel', 'change', 'blur'].forEach(function (ev) { scrubEl.addEventListener(ev, function () { scrubbing = false; }); });
  $('play').addEventListener('click', function () { if (!scene) return; if (scene.isRunning()) { scene.pause(); setPlayUi(false); } else { scene.play(); setPlayUi(true); } });
  function syncViewButtons(m) { [['viewLab', 'lab'], ['viewExploded', 'exploded'], ['viewStudio', 'studio']].forEach(function (b) { var el = $(b[0]); el.classList.toggle('on', m === b[1]); el.setAttribute('aria-pressed', m === b[1] ? 'true' : 'false'); }); }
  $('viewLab').addEventListener('click', function () { if (scene) scene.setViewMode('lab'); });
  $('viewExploded').addEventListener('click', function () { if (scene) scene.setViewMode('exploded'); });
  $('viewStudio').addEventListener('click', function () { if (scene) scene.setViewMode('studio'); });
  $('follow').addEventListener('click', function () {
    if (!scene) return; if (!scene.isFollowing() && scene.viewMode() !== 'lab') scene.setViewMode('lab'); var on = !scene.isFollowing(), r = scene.follow(on);
    $('follow').textContent = on ? 'Stop following' : 'Follow a trip'; $('follow').classList.toggle('on', on);
    if (on && r.note) $('legend').textContent = r.note;
  });
  $('skip').addEventListener('click', function () { if (anim && scene) scene.skipTo(weekRange(anim.week)[1]); });

  var q0 = new URLSearchParams(location.search);
  if (q0.has('shot')) {   // screenshot mode only: preset the home and game state so every view can be captured
    if (q0.get('house')) st.house = q0.get('house');
    ['acHours', 'setpoint', 'solarKwp', 'trees'].forEach(function (k) { if (q0.has(k)) st[k] = +q0.get(k); });
    if (q0.has('lot')) st.lot = +q0.get('lot');
    if (q0.has('level')) st.level = +q0.get('level');
    if (q0.has('walk')) st.walkShare = +q0.get('walk'); if (q0.has('native')) st.nativeShare = +q0.get('native');
    if (q0.has('speed')) speed = +q0.get('speed');
    if (q0.has('autoweek')) { g = T.newGame(st); }
    if (q0.has('rain')) { g = T.newGame(st); for (var w4 = 0; w4 < 4; w4++) g = T.play(g, { acHours: st.acHours, setpoint: st.setpoint, walkShare: st.walkShare }); }
  }
  render();
  if (SHOT) { session = Object.assign({ guest: true, setUp: true }, store.guest()); $('gate').hidden = true; showChip(); }   // screenshot mode keeps the URL's presets
  else { var cur = store.current(); if (cur) startSession(cur); else showGate(); }
  if (SHOT && q0.has('stress')) stressN = +q0.get('stress');   // rebuild the homes many times, a few frames apart so each build is really drawn
  if (SHOT && q0.has('level2')) { st.level = +q0.get('level2'); render(); }   // change the level after the first build
  if (SHOT && q0.has('gate')) { session = null; showChip(); showGate(); }
  if (SHOT && q0.has('wizard')) openWizard();
  if (SHOT && q0.get('view') === 'analysis') location.hash = '#/analysis';
  if (SHOT && q0.has('viewlater')) viewLaterAt = +q0.get('viewlater');
  if (SHOT && q0.has('modelater')) modeLaterAt = +q0.get('modelater');
  if (SHOT && q0.has('pauseplay')) pausePlayAt = +q0.get('pauseplay');   // pause then resume at this frame   // go back to Lab at this frame
  if (SHOT && q0.has('viewtimer')) setTimeout(function () { go('map'); }, +q0.get('viewtimer'));      // switch back by the clock, for the real stop-and-restart test
  if (SHOT && q0.has('dumpafter')) setTimeout(function () { if (scene) scene.shotNow(); }, +q0.get('dumpafter'));   // take the snapshot at a chosen moment
  if (SHOT && q0.has('mcpserver')) { $('mcpServer').value = q0.get('mcpserver'); $('mcpHome').value = q0.get('mcphome') || ''; if (q0.get('mcpclient')) $('mcpClient').value = q0.get('mcpclient'); if (q0.get('mcpnode')) $('mcpNode').value = q0.get('mcpnode'); if (q0.get('mcpdefaults')) $('mcpDefaults').checked = true; connectView(); }
  if (SHOT && q0.has('firstlook')) showFirstLook();
  if (SHOT && q0.has('compare')) openCompare();
  if (SHOT && q0.has('place')) { startPlacing(); if (q0.has('leave')) cancelLot(); }
  setView(viewFromHash());   // the first route, before the snapshot below reads what is shown
  // screenshot mode: what is actually drawn, read at the end so it reflects the final state
  // what the page transition is made of: it must fade only (a slide would overflow the document while it runs)
  function fadeInfo() {
    var rules = []; [].forEach.call(document.styleSheets, function (sh) { try { rules = rules.concat([].slice.call(sh.cssRules)); } catch (e) { /* cross-origin sheet */ } });
    var rule = rules.filter(function (r) { return r.type === 7 && r.name === 'fade'; })[0], vis = document.querySelector('.view:not([hidden])');
    return { found: !!rule, transform: !!rule && /transform/.test(rule.cssText), name: vis ? getComputedStyle(vis).animationName : null };
  }
  // how far any card on the Analysis page sticks out past its own column (0 when everything fits)
  function columnOverflow() {
    var worst = 0; [].forEach.call(document.querySelectorAll('#viewAnalysis .layout > .col'), function (col) {
      var right = col.getBoundingClientRect().right; [].forEach.call(col.children, function (c) { worst = Math.max(worst, c.getBoundingClientRect().right - right); });
    }); return Math.round(worst * 10) / 10;
  }
  function snapshotUi() { var vis = function (id) { return getComputedStyle($(id)).display; }; document.body.dataset.ui = JSON.stringify({ gate: vis('gate'), wizard: vis('wizard'), chip: vis('userChip'), firstLook: vis('firstLook'), compare: vis('compare'), fits: document.documentElement.scrollHeight <= window.innerHeight + 1, viewMap: vis('viewMap'), viewAnalysis: vis('viewAnalysis'), connect: vis('connect'), anaOverflow: columnOverflow(), play: $('play').textContent, scrub: { value: +scrubEl.value, max: +scrubEl.max, out: $('scrubOut').textContent }, hudClock: $('hudClock').textContent, viewBtn: $('viewExploded').getAttribute('aria-pressed') + '/' + $('viewLab').getAttribute('aria-pressed') + '/' + $('viewStudio').getAttribute('aria-pressed'), chat: vis('ask'), dockBody: vis('dockBody'), fade: fadeInfo(), inspect: vis('inspect'), skip: vis('skip') }); }
  if (q0.has('shot') && q0.has('ask')) askNow(q0.get('ask'));
  if (q0.has('shot') && q0.has('inspect') && !scene) onInspect(q0.get('inspect'));
  if (q0.has('shot') && q0.has('autoweek') && scene) { startWeekAnimation(0); g = T.play(g, { acHours: st.acHours, setpoint: st.setpoint, walkShare: st.walkShare }); render(); }
  else if (scene) { scene.setRange(1, 30, true); scene.setSpeed(speed); scene.jumpTo(+(new URLSearchParams(location.search).get('day') || 1), +(new URLSearchParams(location.search).get('hour') || 6)); scene.play();
    if (q0.has('shot') && q0.has('inspect')) scene.select(q0.get('inspect'));
    if (q0.has('shot') && q0.get('mode')) scene.setViewMode(q0.get('mode'));
    if (q0.has('shot') && q0.has('follow')) { scene.follow(true); $('follow').textContent = 'Stop following'; $('follow').classList.add('on'); } }
  if (SHOT && q0.has('seek') && scene) { var sk = q0.get('seek').split(':'); scene.pause(); setPlayUi(false); scene.seek(+sk[0], +sk[1]); }   // paused at day:hour
  if (SHOT && q0.has('drag') && scene) { scrubEl.value = q0.get('drag'); scrubEl.dispatchEvent(new Event('input', { bubbles: true })); }   // the same event a drag fires
  window.__terrarium = { go: go, view: function () { return view; }, openChat: openChat, hudWrites: function () { return hudWrites; }, inspect: onInspect, scene: function () { return scene; }, state: function () { return { g: g, anim: anim, clockDay: clockDay }; } };
})();
