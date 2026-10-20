/* The 3D township. Reads the model through Terrarium (logic.js); draws one home among its neighbours,
   a bus stop 0.93 km away (REAL distance, compressed), trees, solar, walkers, cars and a bus.
   Everything that moves is illustrative. Needs THREE r128 and OrbitControls. */
(function (root) {
  'use strict';

  function create(container, T, hooks) {
    var THREE = root.THREE;
    hooks = hooks || {};
    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !!hooks.preserve });
    renderer.setPixelRatio(hooks.preserve ? 1 : Math.min(root.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var SKY_DAY = new THREE.Color(0xbfe3f5), SKY_NIGHT = new THREE.Color(0x101b33), SKY_HEAT = new THREE.Color(0xf3d6a8), SKY_RAIN = new THREE.Color(0x9aa8b3);
    scene.background = SKY_DAY.clone();
    scene.fog = new THREE.Fog(0xbfe3f5, 170, 420);

    var camera = new THREE.PerspectiveCamera(38, 1, 1, 1000);
    camera.position.set(64, 62, 84);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(8, 0, -8);
    // lazy motion: drags keep gliding after release, zoom eases toward a goal, and clicking eases in on the thing. All of it is off under reduced motion.
    var reduce = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    controls.enableDamping = true; controls.dampingFactor = reduce ? 1 : 0.045; controls.rotateSpeed = 0.7; controls.enableZoom = false;
    controls.maxPolarAngle = 1.38; controls.minDistance = 35; controls.maxDistance = 240;

    var hemi = new THREE.HemisphereLight(0xdff3ff, 0x6a8a55, 0.65); scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.castShadow = true; sun.shadow.mapSize.set(hooks.preserve ? 1024 : 2048, hooks.preserve ? 1024 : 2048);
    var sc = sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 400;
    scene.add(sun); scene.add(sun.target);

    // ---------- helpers ----------
    var mats = {};
    var sharedMats = new Set();   // materials reused across objects: never disposed
    function M(color) { if (!mats[color]) { mats[color] = new THREE.MeshLambertMaterial({ color: color }); sharedMats.add(mats[color]); } return mats[color]; }
    // A removed object still holds GPU buffers until it is disposed (measured: about 108 geometries leaked per home rebuild).
    function disposeTree(o) {
      o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); var m = n.material; if (m) (Array.isArray(m) ? m : [m]).forEach(function (x) { if (!sharedMats.has(x)) x.dispose(); }); });
    }
    function clearGroup(g) { while (g.children.length) { var c = g.children[0]; g.remove(c); disposeTree(c); } }
    function add(parent, geo, mat, x, y, z, shadow) {
      var m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
      parent.add(m); return m;
    }
    var box = function (w, h, d) { return new THREE.BoxGeometry(w, h, d); };
    var winMat = new THREE.MeshLambertMaterial({ color: 0x9fd0e6, emissive: 0xffd98a, emissiveIntensity: 0 });
    var glowMat = new THREE.MeshBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0 });
    sharedMats.add(winMat); sharedMats.add(glowMat);
    function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

    // ---------- ground, roads, corridor ----------
    add(scene, new THREE.PlaneGeometry(520, 520), M(0x9cc97c), 0, -0.05, 0, false).rotation.x = -Math.PI / 2;
    function road(x, z, w, d) { add(scene, box(w, 0.12, d), M(0x4a5560), x, 0.02, z, false).receiveShadow = true; }
    road(0, 16, 230, 9);            // main road
    road(52, -18, 9, 76);           // road past the bus stop
    for (var i = -105; i < 110; i += 12) add(scene, box(5, 0.13, 0.5), M(0xe8e4d0), i, 0.09, 16, false);
    add(scene, box(15, 0.1, 6), M(0xc9c2ad), 2, 0.05, 9.5, false);   // verge / footpath
    add(scene, box(80, 0.1, 2.2), M(0xcdc6b3), 8, 0.06, 8.2, false); // footpath to the stop

    // ---------- the bus stop (0.93 km away: REAL distance, drawn compressed) ----------
    var stop = new THREE.Group(); stop.position.set(50, 0, 10); stop.userData.inspect = 'stop'; scene.add(stop);
    add(stop, box(7, 0.4, 4), M(0xbdb7a6), 0, 0.2, 0);
    [-3, 3].forEach(function (x) { add(stop, box(0.4, 4, 0.4), M(0x37474f), x, 2.2, -1.4); });
    add(stop, box(8, 0.5, 4.4), M(0x2e6b34), 0, 4.4, 0);
    add(stop, box(7, 3, 0.2), M(0x9fd0e6), 0, 2.3, -1.7).material = new THREE.MeshLambertMaterial({ color: 0x9fd0e6, transparent: true, opacity: 0.5 });
    add(stop, box(0.3, 6, 0.3), M(0xd32f2f), 5, 3, 0); add(stop, box(2.6, 1.6, 0.3), M(0xd32f2f), 5, 6, 0);

    // ---------- the corridor and background trees ----------
    var stream = add(scene, new THREE.PlaneGeometry(250, 7), new THREE.MeshLambertMaterial({ color: 0x6fb7d9 }), 0, 0.0, -78, false);
    stream.rotation.x = -Math.PI / 2;
    function nativeTree(parent, x, z, s, seed) {
      var g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); parent.add(g);
      add(g, new THREE.CylinderGeometry(0.5, 0.8, 4.5, 6), M(0x6b4a2f), 0, 2.2, 0);
      var r = rnd(seed || 7), cols = [0x2f7d3a, 0x3a8f45, 0x276b33];
      for (var k = 0; k < 3; k++) add(g, new THREE.IcosahedronGeometry(2.4 - k * 0.35, 0), M(cols[k]), (r() - 0.5) * 1.4, 5.2 + k * 1.7, (r() - 0.5) * 1.4);
      return g;
    }
    function ornamentalTree(parent, x, z, s) {
      var g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); parent.add(g);
      add(g, new THREE.CylinderGeometry(0.3, 0.4, 3.2, 6), M(0x8d6e63), 0, 1.6, 0);
      add(g, new THREE.SphereGeometry(2, 8, 6), M(0xb5d96b), 0, 4.6, 0);
      return g;
    }
    var rr = rnd(42), corridor = new THREE.Group(); corridor.userData.inspect = 'corridor'; scene.add(corridor);
    for (var c = -105; c <= 105; c += 5.5) { nativeTree(corridor, c + rr() * 2, -72 + rr() * 3, 1.2 + rr() * 0.5, 100 + c); nativeTree(corridor, c + rr() * 2, -86 - rr() * 3, 1.3 + rr() * 0.5, 300 + c); }
    for (var b = 0; b < 70; b++) { var bx = -110 + rr() * 220, bz = 34 + rr() * 80; if (rr() > 0.5) ornamentalTree(scene, bx, bz, 1 + rr() * 0.4); else nativeTree(scene, bx, bz, 1 + rr() * 0.4, 500 + b); }

    // ---------- homes ----------
    var homes = new THREE.Group(); scene.add(homes);
    var homePalette = [0xf4e4c1, 0xe8c9a0, 0xd9e4c8, 0xf0d5d0, 0xcfe0e8, 0xf6e8a8];
    function building(type, color, withMarks, level) {
      var g = new THREE.Group(), fp = T.FOOTPRINT[type] || T.FOOTPRINT.terrace;
      var w = fp[0], h = { terrace: 6.5, semid: 7.5, condo: 30 }[type] || 6.5, d = fp[1];
      // your own home is built as separate floors so the Exploded view can pull them apart; at rest they stack to the same box
      var bounds = type === 'condo' ? [0, 4.7, 8.1, 11.5, 14.9, 18.3, 21.7, 25.1, 30] : [0, 3.6, h], nF = bounds.length - 1, floorG = [], roofG = g;
      if (withMarks) {
        for (var f = 0; f < nF; f++) {
          var fg = new THREE.Group(), fh = bounds[f + 1] - bounds[f], fgeo = box(w, fh, d), fmat = new THREE.MeshLambertMaterial({ color: color });
          add(fg, fgeo, fmat, 0, (bounds[f] + bounds[f + 1]) / 2, 0);
          var edges = new THREE.LineSegments(new THREE.EdgesGeometry(fgeo), new THREE.LineBasicMaterial({ color: 0x37474f })); edges.position.set(0, (bounds[f] + bounds[f + 1]) / 2, 0); edges.visible = false; fg.add(edges);
          fg.userData.mat = fmat; fg.userData.edges = edges; g.add(fg); floorG.push(fg);
        }
        roofG = new THREE.Group(); g.add(roofG);
      } else add(g, box(w, h, d), M(color), 0, h / 2, 0);
      var onFloor = function (y) { if (!withMarks) return g; for (var i = 0; i < nF; i++) if (y < bounds[i + 1]) return floorG[i]; return floorG[nF - 1]; };
      add(roofG, box(w + 1.2, 0.7, d + 1.2), M(0x8d6e63), 0, h + 0.35, 0);               // roof slab
      add(roofG, box(w + 1.2, 0.6, 0.4), M(0xd7ccc8), 0, h + 1.0, d / 2 + 0.4);           // parapet
      var rows = type === 'condo' ? 8 : 2, cols = type === 'condo' ? 3 : (type === 'semid' ? 3 : 2);
      for (var r = 0; r < rows; r++) for (var cc = 0; cc < cols; cc++) {
        var wx = -w / 2 + (cc + 0.5) * (w / cols), wy = type === 'condo' ? 3 + r * 3.4 : (r === 0 ? 2.2 : 4.9);
        if (r === 0 && type !== 'condo' && cc === 0) continue;                         // leave room for the door
        add(onFloor(wy), box(1.7, 1.5, 0.15), winMat, wx, wy, d / 2 + 0.08, false);
      }
      if (type !== 'condo') add(onFloor(1.6), box(1.7, 3.2, 0.2), M(0x5d4037), -w / 2 + w / (cols * 2), 1.6, d / 2 + 0.1);
      else add(onFloor(1.5), box(3, 3, 0.2), M(0x5d4037), 0, 1.5, d / 2 + 0.1);
      if (withMarks) {
        // a condo unit sits at its own level: the air-con and its glow are there, and your window is marked on the tower
        var unitY = type === 'condo' ? 3 + (level - 1) * 3.4 : Math.min(h - 1.2, 5);
        var uf = onFloor(unitY), ac = add(uf, box(2.2, 1.4, 1.2), M(0xeceff1), w / 2 + 0.7, unitY, 0);
        var glow = add(uf, new THREE.SphereGeometry(2.2, 12, 8), glowMat, w / 2 + 2.2, unitY, 0, false);
        if (type === 'condo') add(uf, box(w + 0.5, 1.9, 0.3), new THREE.MeshBasicMaterial({ color: 0x66bb6a, transparent: true, opacity: 0.85 }), 0, unitY, d / 2 + 0.3, false);
        g.userData.glow = glow; g.userData.ac = ac; g.userData.unitY = unitY;
        g.userData.floors = floorG; g.userData.roofG = roofG; g.userData.gap = type === 'condo' ? 5 : 4;
        if (type === 'condo') { var anc = new THREE.Object3D(); anc.position.set(0, unitY + 1.4, d / 2 + 0.5); uf.add(anc); g.userData.unitFloor = floorG.indexOf(uf); g.userData.unitAnchor = anc; }
      }
      g.userData.roof = { y: h + 0.8, w: w, d: d, type: type };
      return g;
    }
    var pin = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5.5, 10), new THREE.MeshLambertMaterial({ color: 0xe53935, emissive: 0x7a1010 }));
    pin.rotation.x = Math.PI; scene.add(pin);
    var viewMode = 'lab', explode = 0, explodeGoal = 0, unitLabel = null;
    var mine = null, mineKey = '', plotTrees = new THREE.Group(), panels = new THREE.Group(), ring = null;
    scene.add(plotTrees);
    var HOME_POS = { x: T.LOTS[0][0], z: T.LOTS[0][1] }, currentLot = 0, builtLot = -1, neigh = new THREE.Group(); scene.add(neigh);
    function buildNeighbours(excludeLot) {
      clearGroup(neigh);
      T.LOTS.forEach(function (p, i) {
        if (i === excludeLot) return;
        var t = building(T.lotNeighbourType(i), homePalette[i % homePalette.length], false);
        t.userData.inspect = 'neighbour'; t.userData.lot = i; t.position.set(p[0], 0, p[1]); neigh.add(t);
        if (i % 3 === 0) ornamentalTree(neigh, p[0] + 1.2, p[1] - 12.6, 0.9);
      });
    }

    function rebuildHome(input) {
      var native = Math.round(input.trees * input.nativeShare);
      var lotIdx = T.validLot(input.lot) ? input.lot : 0;
      var lvl = input.house === 'condo' ? Math.min(T.CONDO_LEVELS, Math.max(1, Math.round(Number(input.level) || 1))) : 0;
      var key = [input.house, input.solarKwp, input.trees, native, lotIdx, lvl].join('|');
      if (key === mineKey) return; mineKey = key;
      currentLot = lotIdx; HOME_POS.x = T.LOTS[lotIdx][0]; HOME_POS.z = T.LOTS[lotIdx][1];
      if (builtLot !== lotIdx) { buildNeighbours(lotIdx); builtLot = lotIdx; }
      if (mine) { homes.remove(mine); disposeTree(mine); }
      if (ring) { scene.remove(ring); disposeTree(ring); }
      mine = building(input.house, 0xfff1cf, true, lvl); mine.userData.inspect = 'home'; mine.userData.lot = lotIdx;
      mine.position.set(HOME_POS.x, 0, HOME_POS.z); homes.add(mine);
      pin.userData.baseY = mine.userData.roof.y + 8;
      ring = add(scene, new THREE.RingGeometry(10, 11.2, 48), new THREE.MeshBasicMaterial({ color: 0x2e6b34, side: THREE.DoubleSide }), HOME_POS.x, 0.12, HOME_POS.z + 2, false);
      ring.rotation.x = -Math.PI / 2;
      if (unitLabel) { unitLabel.el.remove(); labels.splice(labels.indexOf(unitLabel), 1); unitLabel = null; }
      if (mine.userData.unitAnchor) { label('Your unit, level ' + lvl, mine.userData.unitAnchor, 0, 'unit'); unitLabel = labels[labels.length - 1]; unitLabel.hidden = true; unitLabel.el.style.display = 'none'; }
      panels.userData.inspect = 'solar';
      clearGroup(panels);
      var roof = mine.userData.roof, n = Math.round(input.solarKwp), cols = roof.type === 'condo' ? 3 : 4;
      for (var p = 0; p < n; p++) {
        var pr = Math.floor(p / cols), pc = p % cols;
        var panel = add(panels, box(2.7, 0.18, 1.6), new THREE.MeshLambertMaterial({ color: 0x1c3f7a }), (pc - (cols - 1) / 2) * 3, roof.y + 0.6, -roof.d / 2 + 2.6 + pr * 2.4);
        panel.rotation.x = -0.28;
      }
      panels.position.set(HOME_POS.x, 0, HOME_POS.z); if (!panels.parent) scene.add(panels);
      clearGroup(plotTrees);
      if (viewMode === 'exploded') focusExploded();
      for (var t = 0; t < input.trees; t++) {
        var pos = T.PLOT_SLOTS[t % T.PLOT_SLOTS.length], x = HOME_POS.x + pos[0], z = HOME_POS.z + pos[1];
        if (t < native) nativeTree(plotTrees, x, z, 1.15, 900 + t); else ornamentalTree(plotTrees, x, z, 1.05);
      }
    }


    // ---------- picking and selection ----------
    var ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), downAt = null, selected = null, outline = new THREE.BoxHelper(new THREE.Object3D(), 0xffd54f);
    outline.visible = false; scene.add(outline);
    // lot pads: flat discs under every lot, drawn and clickable only while placing your home
    var pads = [], placing = false, hoverLot = -1, padLabels = [];
    T.LOTS.forEach(function (p, i) {
      var pad = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 8.4, 0.3, 28), new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.35 }));
      pad.position.set(p[0], 0.2, p[1] + 1); pad.userData.inspect = 'lot'; pad.userData.lot = i; pad.visible = false; scene.add(pad); pads.push(pad);
    });
    function tagged(o) { while (o && !(o.userData && o.userData.inspect)) o = o.parent; return o || null; }
    function pickNdc(nx, ny) {
      ptr.set(nx, ny); ray.setFromCamera(ptr, camera);
      var hits = ray.intersectObjects(scene.children, true);
      for (var i = 0; i < hits.length; i++) { var o = hits[i].object; if (o === outline || o.type === 'Points' || o.type === 'LineSegments' || o.visible === false) continue; return tagged(o); }   // a raycaster does not skip hidden meshes, so we do
      return null;
    }
    function select(o) {
      selected = o; outline.visible = !!o;
      if (o) {
        outline.setFromObject(o);
        if (!following) {   // ease the camera in on it: pan so it is centred, and settle at a distance that fits its size
          var bx = new THREE.Box3().setFromObject(o), ctr = bx.getCenter(new THREE.Vector3()), size = bx.getSize(new THREE.Vector3()).length();
          flyGoal = { target: new THREE.Vector3(ctr.x, Math.min(ctr.y, 6), ctr.z) }; zoomGoal = Math.min(controls.maxDistance, Math.max(controls.minDistance, size * 1.8 + 26));
        }
      }
      if (hooks.onInspect) hooks.onInspect(o ? o.userData.inspect : null, o);
    }
    var el = renderer.domElement, zoomGoal = null, flyGoal = null, shotZoom = {};
    el.addEventListener('wheel', function (e) {
      e.preventDefault(); if (following) return;
      var cur = zoomGoal !== null ? zoomGoal : camera.position.distanceTo(controls.target), dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      zoomGoal = Math.min(controls.maxDistance, Math.max(controls.minDistance, cur * Math.exp(dy * 0.0012)));
    }, { passive: false });
    el.addEventListener('pointerdown', function (e) { downAt = { x: e.clientX, y: e.clientY }; flyGoal = null; });   // grabbing the scene cancels an ease-in
    el.addEventListener('pointerup', function (e) {
      if (!downAt) return; var moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y); downAt = null; if (moved > 5) return;
      var r = el.getBoundingClientRect(), hit = pickNdc(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (placing) { if (hit && hit.userData.lot !== undefined && hooks.onLotPick) hooks.onLotPick(hit.userData.lot); return; }   // while placing, a click chooses a lot
      select(hit);
    });
    el.addEventListener('pointermove', function (e) {
      if (!placing || downAt) return;
      var r = el.getBoundingClientRect(), hit = pickNdc(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), lot = hit && hit.userData.lot !== undefined ? hit.userData.lot : -1;
      if (lot !== hoverLot) { hoverLot = lot; if (hooks.onLotHover) hooks.onLotHover(lot < 0 ? null : lot); }
    });
    function objectsByKind() {
      return { home: mine, neighbour: neigh.children[0], lot: placing ? pads[2] : null, stop: stop, bus: busObj.obj, corridor: corridor.children[10], solar: panels.children[0],
               person: (agents.filter(function (a) { return a.kind === 'walk'; })[0] || {}).obj, car: (agents.filter(function (a) { return a.kind === 'car'; })[0] || {}).obj };
    }
    // Projects a known object to the screen and picks there: proves a real click on it would land on it.
    function debugPick(kind) {
      if (kind === 'occluded') {   // an untagged block placed between the camera and your home must hide it from a click
        var blk = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), M(0x888888)), cc = new THREE.Box3().setFromObject(mine).getCenter(new THREE.Vector3());
        blk.position.copy(camera.position.clone().lerp(cc, 0.5)); scene.add(blk); blk.updateMatrixWorld(true); camera.updateMatrixWorld(true);
        var pr = cc.clone().project(camera), hitB = pickNdc(pr.x, pr.y); scene.remove(blk); return hitB ? hitB.userData.inspect : 'none';
      }
      var o = objectsByKind()[kind]; if (!o) return 'absent';
      if (kind === 'lot') {   // a pad is clickable where no building covers it: probe both sides of every pad and count the exposed ones
        var exposed = 0;
        pads.forEach(function (pd) { [-7.2, 7.2].forEach(function (dx) { var pc = new THREE.Vector3(pd.position.x + dx, 0.2, pd.position.z).project(camera), ph = pickNdc(pc.x, pc.y); if (ph && ph.userData.inspect === 'lot' && ph.userData.lot === pd.userData.lot) exposed++; }); });
        padHits = exposed; return exposed > 0 ? 'lot' : 'none';
      }
      var box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3()); c.project(camera);
      var hit = pickNdc(c.x, c.y); return hit ? hit.userData.inspect : 'none';
    }

    // ---------- follow a trip ----------
    var following = false, DEFAULT_CAM = new THREE.Vector3(64, 62, 84), DEFAULT_TGT = new THREE.Vector3(8, 0, -8), returning = 0, offset = new THREE.Vector3(24, 18, 26);
    function newestAgent() { return agents.length ? agents[agents.length - 1].obj : null; }
    function nextTripMoment(day, hour) {
      // the next time any trip leaves, so following does not mean waiting through empty days
      var d = day, h = hour;
      for (var guard = 0; guard < 60; guard++) {
        var trips = T.tripsOnDay(d, input || T.DEFAULTS);
        for (var k = 0; k < trips.length; k++) if (trips[k].hour - 0.2 > (d === day ? h : -1)) return { day: d, hour: trips[k].hour - 0.2 };
        d++; if (d > range.to) d = range.from;
      }
      return null;
    }

    // ---------- people, cars, bus ----------
    var agents = [], busObj = null;
    function person(color) {
      var g = new THREE.Group();
      add(g, new THREE.CylinderGeometry(0.55, 0.55, 1.6, 8), M(color), 0, 1.5, 0);
      add(g, new THREE.SphereGeometry(0.55, 8, 6), M(0xf2c9a0), 0, 2.7, 0);
      return g;
    }
    function car(color) {
      var g = new THREE.Group();
      add(g, box(5.2, 1.5, 2.4), M(color), 0, 1.2, 0);
      add(g, box(2.8, 1.2, 2.2), M(0xcfd8dc), -0.3, 2.45, 0);
      [[-1.7, -1.3], [1.7, -1.3], [-1.7, 1.3], [1.7, 1.3]].forEach(function (w) { add(g, new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10), M(0x212121), w[0], 0.55, w[1]).rotation.x = Math.PI / 2; });
      add(g, box(0.2, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), 2.65, 1.3, 0.7, false);
      add(g, box(0.2, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), 2.65, 1.3, -0.7, false);
      return g;
    }
    function followPath(a, dt) {
      if (a.wait > 0) { a.wait -= dt; return; }
      var t = a.path[a.i + 1]; if (!t) { a.done = true; return; }
      var p = a.obj.position, dx = t.x - p.x, dz = t.z - p.z, dist = Math.sqrt(dx * dx + dz * dz), step = a.speed * dt;
      if (dist <= step) { p.set(t.x, 0, t.z); a.i++; if (t.wait) a.wait = t.wait; }
      else { p.x += dx / dist * step; p.z += dz / dist * step; a.obj.rotation.y = Math.atan2(-dz, dx); }
    }
    function spawnTrip(mode, index) {
      var path = T.tripPath(currentLot, mode);
      if (mode === 'walk') {
        var o = person(index % 2 ? 0xe57373 : 0x4fc3f7); o.userData.inspect = 'person'; o.position.set(path[0].x, 0, path[0].z); scene.add(o);
        agents.push({ obj: o, path: path, i: 0, speed: 9, wait: 0, kind: 'walk' });
      } else {
        var cc = car(index % 2 ? 0xef6c00 : 0x5c6bc0); cc.userData.inspect = 'car'; cc.position.set(path[0].x, 0, path[0].z); scene.add(cc);
        agents.push({ obj: cc, path: path, i: 0, speed: 34, wait: 0, kind: 'car' });
      }
    }
    // the bus: ping-pongs along the main road, dwelling at the stop. Scheduled, illustrative.
    (function () {
      var g = new THREE.Group();
      add(g, box(11, 3.6, 3.2), M(0x1565c0), 0, 2.6, 0);
      add(g, box(10.4, 1.2, 3.25), M(0xbbdefb), 0, 3.2, 0, false);
      add(g, box(11.1, 0.5, 3.3), M(0xffffff), 0, 1.4, 0, false);
      [[-3.5, -1.5], [3.5, -1.5], [-3.5, 1.5], [3.5, 1.5]].forEach(function (w) { add(g, new THREE.CylinderGeometry(0.8, 0.8, 0.5, 10), M(0x212121), w[0], 0.8, w[1]).rotation.x = Math.PI / 2; });
      g.userData.inspect = 'bus'; g.position.set(-110, 0, 20.5); scene.add(g);
      busObj = { obj: g, dir: 1, x: -110, wait: 0, stopped: false };
    })();
    function updateBus(dt) {
      var b = busObj; if (b.wait > 0) { b.wait -= dt; b.obj.position.x = b.x; return; }
      b.x += b.dir * 26 * dt;
      if (!b.stopped && Math.abs(b.x - 50) < 1.2) { b.stopped = true; b.wait = 3; b.x = 50; }
      if (Math.abs(b.x - 50) > 6) b.stopped = false;
      if (b.x > 112) { b.dir = -1; b.obj.rotation.y = Math.PI; b.obj.position.z = 12.2; }
      if (b.x < -112) { b.dir = 1; b.obj.rotation.y = 0; b.obj.position.z = 20.5; }
      b.obj.position.x = b.x;
    }

    // ---------- rain ----------
    var N = 900, rainPos = new Float32Array(N * 6), rain = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xaecbe0, transparent: true, opacity: 0.55 }));
    for (var q = 0; q < N; q++) { var rx = (Math.random() - 0.5) * 220, ry = Math.random() * 70, rz = (Math.random() - 0.5) * 200; rainPos.set([rx, ry, rz, rx - 0.4, ry - 3, rz], q * 6); }
    rain.geometry.setAttribute('position', new THREE.BufferAttribute(rainPos, 3)); rain.visible = false; scene.add(rain);

    // ---------- labels (DOM, projected each frame) ----------
    var labels = [];
    function label(text, obj, dy, cls) {
      var el = document.createElement('div'); el.className = 'tag3d ' + (cls || ''); el.textContent = text; container.appendChild(el);
      labels.push({ el: el, obj: obj, dy: dy });
    }
    var anchor = function (x, y, z) { var o = new THREE.Object3D(); o.position.set(x, y, z); scene.add(o); return o; };
    label('Your home', pin, 5);
    label('Bus stop, 0.93 km away (REAL distance, drawn compressed)', anchor(50, 10, 10), 0);
    label('Elmina Urban Biodiversity Corridor', anchor(0, 14, -78), 0);
    label('Bus, scheduled (illustrative)', busObj.obj, 7, 'dim');
    var v = new THREE.Vector3();
    function setPlacing(on) {
      if (on && viewMode === 'exploded') setViewMode('lab');
      placing = !!on; hoverLot = -1;
      pads.forEach(function (p) { p.visible = placing; });
      if (placing && !padLabels.length) T.LOTS.forEach(function (p, i) { label('Lot ' + (i + 1), anchor(p[0], 1, p[1] + 1), 0, 'lotlabel'); padLabels.push(labels[labels.length - 1]); });
      padLabels.forEach(function (l) { l.hidden = !placing; l.el.style.display = placing ? '' : 'none'; });
      if (placing) { select(null); flyGoal = { target: DEFAULT_TGT.clone() }; zoomGoal = DEFAULT_CAM.distanceTo(DEFAULT_TGT); }
    }
    // ---------- view modes: Lab (the township) and Exploded (your home's floors pulled apart) ----------
    function focusExploded() {
      var u = mine && mine.userData; if (!u || !u.floors) return;
      var total = u.roof.y + 1 + u.floors.length * u.gap;
      flyGoal = { target: new THREE.Vector3(HOME_POS.x, total / 2, HOME_POS.z) }; zoomGoal = Math.max(55, total * 1.7 + 20);
    }
    function setViewMode(m) {
      m = m === 'exploded' ? 'exploded' : 'lab'; if (m === viewMode) return;
      viewMode = m; explodeGoal = m === 'exploded' ? 1 : 0; neigh.visible = m !== 'exploded';
      if (m === 'exploded') { if (placing) setPlacing(false); select(null); following = false; focusExploded(); }
      else { flyGoal = { target: DEFAULT_TGT.clone() }; zoomGoal = DEFAULT_CAM.distanceTo(DEFAULT_TGT); }
      if (hooks.onViewMode) hooks.onViewMode(viewMode);
    }
    function applyExplode(dt) {
      var k = reduce ? 1 : 1 - Math.pow(0.9, Math.min(dt, 0.1) * 60);
      explode += (explodeGoal - explode) * k; if (Math.abs(explodeGoal - explode) < 0.002) explode = explodeGoal;
      var u = mine && mine.userData; if (!u || !u.floors) return;
      var lift = u.floors.length * u.gap * explode;
      u.floors.forEach(function (fg, i) {
        fg.position.y = i * u.gap * explode; fg.userData.edges.visible = explode > 0.02;
        var mine1 = i === u.unitFloor; fg.userData.mat.emissive.setHex(mine1 ? 0x2e7d32 : 0x000000).multiplyScalar(mine1 ? 0.55 * explode : 0);
      });
      u.roofG.position.y = lift; panels.position.y = lift;
      if (unitLabel) { var show = explode > 0.6; unitLabel.hidden = !show; if (!show) unitLabel.el.style.display = 'none'; }
      pin.userData.lift = lift;
    }
    function viewState() {
      var u = mine && mine.userData;
      return { mode: viewMode, explode: Math.round(explode * 1000) / 1000, floors: u && u.floors ? u.floors.length : 0, gap: u ? u.gap : 0, floorY: u && u.floors ? u.floors.map(function (f) { return Math.round(f.position.y * 10) / 10; }) : [], roofY: u && u.roofG ? Math.round(u.roofG.position.y * 10) / 10 : 0, panelsY: Math.round(panels.position.y * 10) / 10, neighbours: neigh.visible, unitFloor: u && u.unitFloor !== undefined ? u.unitFloor : -1, unitLabelShown: !!unitLabel && !unitLabel.hidden };
    }
    function placeLabels() {
      var w = container.clientWidth, h = container.clientHeight;
      labels.forEach(function (l) {
        if (l.hidden) return;
        l.obj.getWorldPosition(v); v.y += l.dy; v.project(camera);
        var px = (v.x + 1) / 2 * w, hw = (l.el.offsetWidth || 120) / 2 + 6;
        var vis = v.z < 1 && px > hw && px < w - hw && Math.abs(v.y) < 1.05;   // the whole label must fit inside the stage
        l.el.style.display = vis ? '' : 'none';
        if (vis) l.el.style.transform = 'translate(-50%,-100%) translate(' + px + 'px,' + ((1 - v.y) / 2 * h) + 'px)';
      });
    }

    // ---------- the clock ----------
    var clock = { day: 1, hour: 6 }, range = { from: 1, to: 30, loop: true }, speed = 1, running = false, input = null, onEnd = null, lastHourInt = -1;
    function emit() { if (hooks.onClock) hooks.onClock(clock.day, clock.hour); }
    function stepClock(dtHours) {
      var prev = clock.hour; clock.hour += dtHours;
      while (clock.hour >= 24) { clock.hour -= 24; clock.day++; prev = -1;
        if (clock.day > range.to) {
          if (range.loop) clock.day = range.from; else { clock.day = range.to; clock.hour = 23.99; running = false; var f = onEnd; onEnd = null; if (f) f(); emit(); return; }
        }
      }
      if (input) [8, 17.5].forEach(function (h) {
        if (prev < h && clock.hour >= h) T.tripsOnDay(clock.day, input).forEach(function (t, k) { if (t.hour === h) spawnTrip(t.mode, t.index); });
      });
      emit();
    }

    // ---------- the frame ----------
    var perf = { frames: 0, jsMs: 0, labelsMs: 0 };   // measured, not guessed: JS time per frame and in the label pass
    var prevT = 0, frames = 0, lerp = function (a, b, t) { return a + (b - a) * t; };
    var pending = false;   // an animation frame has been requested and has not run yet
    function schedule() { if (pending) return; pending = true; root.requestAnimationFrame(function (t) { pending = false; frame(t); }); }
    var active = true, looping = true;   // active is false while the Analysis page is showing: no drawing, no clock, and no frame requests at all
    // screenshot mode only: write what the checks need into the page once the frame budget is spent
    function shotDone() {
      if (hooks.onShotDone) hooks.onShotDone();
        root.__shotDone = true;
        if (hooks.clickLot !== undefined && hooks.clickLot !== null) { api.debugClickLot(hooks.clickLot); renderer.render(scene, camera); }
        if (hooks.clickKind) { api.debugClickKind(hooks.clickKind); renderer.render(scene, camera); }
        if (hooks.picks) { var res = {}; hooks.picks.forEach(function (k) { res[k] = debugPick(k); }); document.body.dataset.picks = JSON.stringify(res); }
        var nt = newestAgent();
        document.body.dataset.state = JSON.stringify({ active: active, looping: looping, pending: pending, canvas: [renderer.domElement.width, renderer.domElement.height], agents: agents.length, following: following, view: viewState(), day: clock.day, camToAgent: nt ? Math.round(camera.position.distanceTo(nt.position)) : null, camToHome: Math.round(camera.position.distanceTo(DEFAULT_TGT)), reduce: reduce, zoom: Object.assign(shotZoom, { end: camera.position.distanceTo(controls.target) }), extra: hooks.extraState ? hooks.extraState() : null, perf: { frames: perf.frames, jsMsPerFrame: perf.jsMs / Math.max(1, perf.frames), labelsMsPerFrame: perf.labelsMs / Math.max(1, perf.frames), geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs ? renderer.info.programs.length : null }, homePos: { x: HOME_POS.x, z: HOME_POS.z }, unitY: mine ? mine.userData.unitY : null, padHits: padHits, neighbours: neigh.children.filter(function (c) { return c.userData.lot !== undefined; }).length, neighAtHome: neigh.children.filter(function (c) { return c.userData.lot === currentLot; }).length, lot: currentLot, placing: placing, padsVisible: pads.filter(function (p) { return p.visible; }).length, selectedKind: selected ? selected.userData.inspect : null, targetToSel: selected ? Math.round(10 * controls.target.distanceTo(new THREE.Box3().setFromObject(selected).getCenter(new THREE.Vector3()))) / 10 : null, selDist: selected ? Math.round(camera.position.distanceTo(controls.target)) : null });
        try { var img = document.createElement('img'); img.id = 'shotimg'; img.src = renderer.domElement.toDataURL('image/png'); document.body.appendChild(img); } catch (e) { document.body.dataset.shotError = String(e); }
    }
    function frame(now) {
      if (!active) {
        if (hooks.maxFrames && !hooks.stopIdle) {   // screenshot mode counts idle frames on a timer, because a headless browser stops ticking when nothing is drawn (stopidle turns that off to test the real stop)
          frames++; prevT = now; if (hooks.onFrame) hooks.onFrame(frames);
          if (frames >= hooks.maxFrames) { shotDone(); return; }
          root.setTimeout(function () { frame(performance.now()); }, 0); return;
        }
        looping = false; return;   // inactive: stop asking for frames at all; setActive(true) starts the loop again
      }
      looping = true;
      var t0 = performance.now();
      if (hooks.onFrame) hooks.onFrame(frames);
      var dt = hooks.fixedStep || Math.min(0.1, (now - prevT) / 1000 || 0); prevT = now; frames++;
      var sp = Math.min(speed, 4), hr = clock.hour;
      if (running) stepClock(dt * speed);
      hr = clock.hour;
      var wx = input ? T.weatherAt(clock.day, hr, input) : { heat: false, rain: false };
      // sun and sky
      var ang = (hr - 6) / 12 * Math.PI, el = Math.sin(ang), dayish = Math.max(0, Math.min(1, el * 2 + 0.25));
      sun.position.set(Math.cos(ang) * 140, Math.max(20, el * 140 + 20), 60); sun.target.position.set(0, 0, -10);
      sun.intensity = 0.15 + 0.85 * dayish; hemi.intensity = 0.25 + 0.5 * dayish;
      var sky = SKY_NIGHT.clone().lerp(wx.rain ? SKY_RAIN : wx.heat ? SKY_HEAT : SKY_DAY, dayish);
      scene.background.copy(sky); scene.fog.color.copy(sky);
      var night = 1 - dayish; winMat.emissiveIntensity = lerp(winMat.emissiveIntensity, night > 0.45 ? 1 : 0, 0.1);
      // air-con glow on your home
      var ch = input ? T.choiceOnDay(input, clock.day) : { acHours: 0 }, acOn = input && T.acIsOn(hr, ch.acHours);
      if (mine && mine.userData.glow) glowMat.opacity = lerp(glowMat.opacity, acOn ? 0.32 + 0.1 * Math.sin(now / 250) : 0, 0.12);
      // rain
      rain.visible = !!wx.rain;
      if (wx.rain) { var pa = rain.geometry.attributes.position; for (var i = 0; i < N; i++) { var y = pa.array[i * 6 + 1] - dt * 60 * (sp / 2 + 0.5); if (y < 0) y += 70; pa.array[i * 6 + 1] = y; pa.array[i * 6 + 4] = y - 3; } pa.needsUpdate = true; }
      // movers
      for (var a = agents.length - 1; a >= 0; a--) { followPath(agents[a], dt * (0.6 + sp * 0.4)); if (agents[a].done) { scene.remove(agents[a].obj); disposeTree(agents[a].obj); agents.splice(a, 1); } }
      updateBus(dt * (0.6 + sp * 0.4));
      applyExplode(dt);
      pin.position.set(HOME_POS.x, (pin.userData.baseY || 14) + (pin.userData.lift || 0) + Math.sin(now / 400) * 0.8, HOME_POS.z);
      if (selected) { if (!selected.parent) select(null); else outline.setFromObject(selected); }
      if (following) { flyGoal = null; zoomGoal = null; var tg = newestAgent(); if (tg) { controls.target.lerp(tg.position, 0.12); camera.position.lerp(tg.position.clone().add(offset), 0.06); } }
      else if (returning > 0) { returning -= dt; controls.target.lerp(DEFAULT_TGT, 0.08); camera.position.lerp(DEFAULT_CAM, 0.06); }
      if (!following) {
        var ease = reduce ? 1 : 1 - Math.pow(0.93, Math.min(dt, 0.1) * 60);   // the same glide at any frame rate
        if (flyGoal) { var stp = flyGoal.target.clone().sub(controls.target).multiplyScalar(ease); controls.target.add(stp); camera.position.add(stp); if (flyGoal.target.distanceTo(controls.target) < 0.15) flyGoal = null; }
        if (zoomGoal !== null) { var curD = camera.position.distanceTo(controls.target), nxtD = curD + (zoomGoal - curD) * ease; if (Math.abs(zoomGoal - curD) < 0.08) { nxtD = zoomGoal; zoomGoal = null; } camera.position.sub(controls.target).setLength(nxtD).add(controls.target); }
      }
      if (placing) pads.forEach(function (p, i) { var chosen = T.validLot(input && input.lot) && input.lot === i; p.material.color.setHex(chosen ? 0x43a047 : i === hoverLot ? 0xffd54f : 0x4fc3f7); p.material.opacity = chosen ? 0.6 : i === hoverLot ? 0.55 : 0.3; });
      if (hooks.wheel && frames === 2) { shotZoom.start = camera.position.distanceTo(controls.target); renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: hooks.wheel, cancelable: true, bubbles: true })); }
      if (hooks.wheel && frames === 3) shotZoom.after1 = camera.position.distanceTo(controls.target);
      controls.update(); var tl = performance.now(); placeLabels(); perf.labelsMs += performance.now() - tl;
      renderer.render(scene, camera);
      perf.frames++; perf.jsMs += performance.now() - t0;
      if (hooks.maxFrames && frames >= hooks.maxFrames) { shotDone(); return; }
      schedule();
    }

    function resize() {
      var w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;   // hidden (the Analysis page): keep the last size
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    resize(); if (root.ResizeObserver) new root.ResizeObserver(resize).observe(container); else root.addEventListener('resize', resize);
    schedule();

    var padHits = null;
    var api = {
      setInput: function (i) { input = i; rebuildHome(i); },
      setSpeed: function (s) { speed = s; },
      setRange: function (from, to, loop) { range = { from: from, to: to, loop: !!loop }; },
      jumpTo: function (day, hour) { clock.day = day; clock.hour = hour == null ? 6 : hour; emit(); },
      play: function (cb) { onEnd = cb || null; running = true; },
      pause: function () { running = false; },
      isRunning: function () { return running; },
      skipTo: function (day) { agents.forEach(function (a) { scene.remove(a.obj); disposeTree(a.obj); }); agents = []; clock.day = day; clock.hour = 23.99; var f = onEnd; onEnd = null; running = false; if (f) f(); emit(); },
      clock: function () { return { day: clock.day, hour: clock.hour }; },
      setActive: function (on) { on = !!on; if (on === active) return; active = on; if (on) { prevT = 0; if (!looping) { looping = true; schedule(); } } },
      isActive: function () { return active; },
      shotNow: shotDone,
      setViewMode: setViewMode,
      viewMode: function () { return viewMode; },
      isLooping: function () { return looping; },
      resize: resize,
      placeMode: setPlacing,
      isPlacing: function () { return placing; },
      // a real pointer click on a lot's pad, at the screen position it projects to: proves the whole path from click to the page
      debugClickLot: function (i) {
        var c = new THREE.Vector3(T.LOTS[i][0] + 7.2, 0.2, T.LOTS[i][1] + 1).project(camera), r = el.getBoundingClientRect(), x = r.left + (c.x + 1) / 2 * r.width, y = r.top + (1 - c.y) / 2 * r.height;
        var fire = function (type) { el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 })); };
        fire('pointerdown'); fire('pointerup');
      },
      // a real pointer click on the middle of a known object: proves that an ordinary click inspects it (or, while placing, chooses its lot)
      debugClickKind: function (kind) {
        var o = objectsByKind()[kind]; if (!o) return false;
        var c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).project(camera), r = el.getBoundingClientRect(), x = r.left + (c.x + 1) / 2 * r.width, y = r.top + (1 - c.y) / 2 * r.height;
        var fire = function (type) { el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 })); };
        fire('pointerdown'); fire('pointerup'); return true;
      },
      select: function (kind) { select(kind ? objectsByKind()[kind] || null : null); },
      debugPick: debugPick,
      follow: function (on) {
        following = !!on; if (!on) { returning = 3; return { following: false }; }
        if (!newestAgent() && !running) return { following: true, waiting: false, note: 'press play, then follow' };
        if (!newestAgent()) { var m = nextTripMoment(clock.day, clock.hour); if (m && (m.day <= range.to)) { agents.forEach(function (a) { scene.remove(a.obj); disposeTree(a.obj); }); agents = []; clock.day = m.day; clock.hour = m.hour; emit(); } }
        return { following: true, waiting: !newestAgent() };
      },
      isFollowing: function () { return following; },
      stats: function () { return { agents: agents.length, labels: labels.length }; },
      renderer: renderer,
    };
    return api;
  }

  root.Scene3D = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
