/* Terrarium model. One month in one home. Every figure carries a grade:
   REAL (public data, cited), SOURCED (assumption with a source), ILLUSTRATIVE (mock).
   Only REAL and SOURCED may be headlined in the pitch. */
(function (root) {
  const GRADE = { REAL: 'REAL', SOURCED: 'SOURCED', ILLUSTRATIVE: 'ILLUSTRATIVE' };

  // Assumptions, each with its grade. Replace ILLUSTRATIVE ones before any claim.
  const ASSUME = {
    stopKm:      { v: 0.93, grade: GRADE.REAL, note: 'Elmina centre to nearest public transit stop, data.gov.my GTFS feeds; centre is approximate, straight line' },
    acKw24:      { v: 1.0,  grade: GRADE.ILLUSTRATIVE, note: 'AC draw at 24 C setpoint, kW' },
    acPerDegree: { v: 0.06, grade: GRADE.ILLUSTRATIVE, note: 'share of AC energy saved per degree of setpoint above 24' },
    gridKgKwh:   { v: 0.7,  grade: GRADE.ILLUSTRATIVE, note: 'grid emission factor, kg CO2 per kWh' },
    peakSunH:    { v: 3.8,  grade: GRADE.ILLUSTRATIVE, note: 'peak sun hours per day' },
    solarPerf:   { v: 0.8,  grade: GRADE.ILLUSTRATIVE, note: 'system performance ratio' },
    solarShare:  { v: 0.4,  grade: GRADE.ILLUSTRATIVE, note: 'most of the usage that daytime solar can offset, no export credit' },
    carKgKm:     { v: 0.17, grade: GRADE.ILLUSTRATIVE, note: 'car emissions, kg CO2 per km' },
    carRmKm:     { v: 0.30, grade: GRADE.ILLUSTRATIVE, note: 'car running cost, RM per km' },
    walkMinKm:   { v: 12,   grade: GRADE.ILLUSTRATIVE, note: 'walking pace, minutes per km' },
    tripsWeek:   { v: 10,   grade: GRADE.ILLUSTRATIVE, note: 'short trips per week within about 1 km' },
    railKm:      { v: 5.4,  grade: GRADE.REAL, note: 'Elmina centre to nearest rail station, data.gov.my GTFS feeds; centre is approximate, straight line' },
    roofHeat:    { v: 0.08, grade: GRADE.ILLUSTRATIVE, note: 'extra air-con energy for a top-floor unit under the roof' },
    shadeLevels: { v: 3,    grade: GRADE.ILLUSTRATIVE, note: 'levels above the ground that a plot tree can shade; none above that' },
    liftMin:     { v: 1,    grade: GRADE.ILLUSTRATIVE, note: 'minutes to get from a unit to the ground floor by lift or stairs, before the per-level amount' },
    liftPerLevel: { v: 0.1, grade: GRADE.ILLUSTRATIVE, note: 'extra minutes per level of height on that trip down' },
    shadePerTree: { v: 0.01, grade: GRADE.ILLUSTRATIVE, note: 'air-con energy saved per shade tree on the plot, capped at 10%' },
    corridorTrees: { v: 1450, grade: GRADE.REAL, note: 'trees planted along a 500 m stretch of the Elmina Urban Biodiversity Corridor, SDP 2024 sustainability highlights slide' },
    nudgeCap:    { v: 0.02, grade: GRADE.SOURCED, note: 'average electricity cut from home energy reports, Allcott 2011, about 2.0%' },
  };
  // Illustrative tiered tariff, RM per kWh. Replace with the current domestic tariff.
  const TARIFF = [[200, 0.218], [100, 0.334], [300, 0.516], [Infinity, 0.546]];

  const HOUSES = {
    terrace: { label: 'Terrace house', baseKwhDay: 8,  acFactor: 1.0 },
    semid:   { label: 'Semi-D house',  baseKwhDay: 11, acFactor: 1.3 },
    condo:   { label: 'Condominium',   baseKwhDay: 6,  acFactor: 0.8 },
  };

  const CONDO_LEVELS = 8;   // the drawn tower has eight levels
  const DEFAULTS = { level: 1, baseScale: 1, house: 'terrace', acHours: 8, setpoint: 24, solarKwp: 0, walkShare: 0.2, trees: 2, nativeShare: 0.2, hotWeek: false };
  const NEIGHBOUR = Object.assign({}, DEFAULTS); // the "neighbour average", illustrative

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  const WEEK_DAYS = [7, 7, 7, 9];
  const weekOf = (d) => (d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3);

  function dayMeanTemp(day, hotWeek, heat) {
    // deterministic mock: seasonal wobble, plus a heat spell: `heat` [from, to], else days 10-16 when hotWeek
    const wobble = 1.2 * Math.sin(day * 1.7) + 0.6 * Math.sin(day * 0.5);
    const hot = heat ? day >= heat[0] && day <= heat[1] : hotWeek && day >= 10 && day <= 16;
    return 28 + wobble + (hot ? 2.5 : 0);
  }
  function tempAt(mean, hour) { return mean + 4 * Math.cos(2 * Math.PI * (hour - 15) / 24); }
  function nightHotHours(mean) {
    let n = 0;
    for (let h = 19; h < 31; h++) if (tempAt(mean, h % 24) > 27) n++;
    return n;
  }

  function bill(kwh) {
    let left = kwh, rm = 0;
    for (const [size, rate] of TARIFF) { const take = Math.min(left, size); rm += take * rate; left -= take; if (left <= 0) break; }
    return rm;
  }

  function simulate(input) {
    const c = Object.assign({}, DEFAULTS, input);
    const house = HOUSES[c.house] || HOUSES.terrace;
    // a condo is a unit on a floor; every other home ignores the level
    const isCondo = c.house === 'condo', lvl = isCondo ? clamp(Math.round(Number(c.level) || 1), 1, CONDO_LEVELS) : null;
    const roofFactor = lvl === CONDO_LEVELS ? 1 + ASSUME.roofHeat.v : 1;
    const shadeFactor = lvl === null ? 1 : clamp((ASSUME.shadeLevels.v + 1 - lvl) / ASSUME.shadeLevels.v, 0, 1);
    const liftEach = lvl === null ? 0 : ASSUME.liftMin.v + ASSUME.liftPerLevel.v * lvl;
    const days = [];
    let kwhTotal = 0, solarTotal = 0, comfortSum = 0;
    for (let d = 1; d <= 30; d++) {
      const w = Object.assign({}, c, (c.weekly && c.weekly[weekOf(d)]) || {});
      const mean = dayMeanTemp(d, c.hotWeek, c.heat);
      const acKwh = w.acHours * ASSUME.acKw24.v * (1 - ASSUME.acPerDegree.v * (w.setpoint - 24))
                    * house.acFactor * (1 + 0.03 * (mean - 28))
                    * (1 - Math.min(0.1, ASSUME.shadePerTree.v * c.trees * shadeFactor)) * roofFactor;
      const use = house.baseKwhDay * c.baseScale + acKwh;
      const solar = Math.min(c.solarKwp * ASSUME.peakSunH.v * ASSUME.solarPerf.v, ASSUME.solarShare.v * use);
      const net = use - solar;
      const need = Math.max(nightHotHours(mean), 1);
      const comfort = clamp(w.acHours / need, 0, 1) * (1 - 0.05 * (w.setpoint - 24));
      days.push({ day: d, meanTemp: mean, useKwh: use, solarKwh: solar, netKwh: net, comfort: clamp(comfort, 0, 1) });
      kwhTotal += net; solarTotal += solar; comfortSum += clamp(comfort, 0, 1);
    }
    const km = stopKmFor(c);
    const weeklyTrips = ASSUME.tripsWeek.v;
    const monthTrips = weeklyTrips * 30 / 7;
    let walked = 0;
    WEEK_DAYS.forEach((n, i) => {
      const share = ((c.weekly && c.weekly[i]) || c).walkShare;
      walked += weeklyTrips * n / 7 * share;
    });
    const driven = Math.max(0, monthTrips - walked), walkedTrips = walked;
    const walkMin = walked * 2 * (km * ASSUME.walkMinKm.v + liftEach);
    const carKm = driven * 2 * km;
    const carKg = carKm * ASSUME.carKgKm.v;
    const carRm = carKm * ASSUME.carRmKm.v;
    const elecKg = kwhTotal * ASSUME.gridKgKwh.v;
    const elecRm = bill(kwhTotal);
    return {
      choices: c, days,
      figures: {
        // REAL only while the month still equals the owner's own bill; any change to the home breaks the match
        monthKwh:   { value: kwhTotal, grade: c.billKwh != null && Math.abs(kwhTotal - c.billKwh) < 1 ? GRADE.REAL : GRADE.ILLUSTRATIVE, unit: 'kWh', label: 'Electricity this month' },
        monthBill:  { value: elecRm, grade: GRADE.ILLUSTRATIVE, unit: 'RM', label: 'Electricity bill' },
        carbonKg:   { value: elecKg + carKg, grade: GRADE.ILLUSTRATIVE, unit: 'kg CO2', label: 'Carbon, home and short trips' },
        carRm:      { value: carRm, grade: GRADE.ILLUSTRATIVE, unit: 'RM', label: 'Car cost, short trips' },
        walkMin:    { value: walkMin, grade: GRADE.ILLUSTRATIVE, unit: 'min', label: 'Walking this month' },
        comfortPct: { value: 100 * comfortSum / 30, grade: GRADE.ILLUSTRATIVE, unit: '%', label: 'Nights kept comfortable' },
        stopKm:     { value: km, grade: validLot(c.lot) ? GRADE.ILLUSTRATIVE : GRADE.REAL, unit: 'km', label: validLot(c.lot) ? 'Your lot to the bus stop' : 'Nearest transit stop' },
        walkedTrips: { value: walkedTrips, grade: GRADE.ILLUSTRATIVE, unit: 'trips', label: 'Trips on foot this month' },
        trees:      { value: c.trees, grade: GRADE.ILLUSTRATIVE, unit: 'trees', label: 'Trees on your plot' },
        bioIndex:   { value: c.trees * (0.5 + 0.5 * c.nativeShare), grade: GRADE.ILLUSTRATIVE, unit: 'index', label: 'Native-weighted canopy' },
        solarKwh:   { value: solarTotal, grade: GRADE.ILLUSTRATIVE, unit: 'kWh', label: 'Solar offset' },
      },
    };
  }

  function scores(input) {
    const you = simulate(input), nb = simulate(Object.assign({}, NEIGHBOUR, { hotWeek: input.hotWeek, heat: input.heat }));
    const f = you.figures, n = nb.figures;
    const energy = clamp(50 * n.carbonKg.value / Math.max(f.carbonKg.value, 1), 0, 100);
    const resilience = clamp(f.comfortPct.value, 0, 100);
    const community = clamp(50 * f.walkedTrips.value / Math.max(n.walkedTrips.value, 0.5), 0, 100);
    const bio = clamp(50 * f.bioIndex.value / Math.max(n.bioIndex.value, 0.1), 0, 100);
    return {
      you, neighbour: nb,
      pillars: [
        { key: 'energy', name: 'Energy Low Carbon', score: energy,
          formula: 'score = 50 x neighbour carbon / your carbon, capped 0-100 (equal to neighbour = 50)' },
        { key: 'resilience', name: 'Climate Resilience', score: resilience,
          formula: 'score = share of nights kept comfortable; AC hours / hot-night hours, less 5% per degree of setpoint above 24' },
        { key: 'community', name: 'Community Experience', score: community,
          formula: 'score = 50 x your trips on foot / neighbour trips on foot, capped 0-100' },
        { key: 'biodiversity', name: 'Urban Biodiversity', score: bio,
          formula: 'score = 50 x your native-weighted canopy / neighbour, capped 0-100; canopy = trees x (0.5 + 0.5 x native share)' },
      ],
      total: (energy + resilience + community + bio) / 4,
    };
  }



  // ---- pure helpers the 3D scene reads (so they can be tested without a GPU) ----
  const choiceOnDay = (input, day) => Object.assign({}, input, (input.weekly && input.weekly[weekOf(day)]) || {});
  const acIsOn = (hour, acHours) => acHours > 0 && ((hour - 19 + 24) % 24) < acHours;
  function weatherAt(day, hour, input) {
    const mean = dayMeanTemp(day, input.hotWeek, input.heat);
    const heat = input.heat ? day >= input.heat[0] && day <= input.heat[1] : !!input.hotWeek && day >= 10 && day <= 16;
    const rain = !!input.weekly && weekOf(day) === 3;
    return { temp: tempAt(mean, hour), heat, rain, label: rain ? 'Rain' : heat ? 'Heat spell' : 'Clear' };
  }
  // Trips are spread evenly over the month. Mode is decided by error diffusion so the walked
  // share is exact over any run of trips.
  const tripsPerDay = () => ASSUME.tripsWeek.v / 7;
  const tripModeOf = (i, share) => (Math.floor((i + 1) * share + 1e-9) > Math.floor(i * share + 1e-9) ? 'walk' : 'car');
  function tripsOnDay(day, input) {
    const a = Math.floor(tripsPerDay() * (day - 1) + 1e-9), b = Math.floor(tripsPerDay() * day + 1e-9);
    const share = choiceOnDay(input, day).walkShare, out = [];
    for (let i = a; i < b; i++) out.push({ index: i, hour: out.length ? 17.5 : 8, mode: tripModeOf(i, share) });
    return out;
  }
  function tripsUpTo(day, input) {
    let walk = 0, car = 0;
    for (let d = 1; d <= day; d++) for (const t of tripsOnDay(d, input)) (t.mode === 'walk' ? walk++ : car++);
    return { walk, car };
  }


  // ---- after handover: the owner's real monthly kWh replaces the simulated month ----
  // One number cannot say why a home differs from the model, so only the base load (everything that is not air-con) is adjusted.
  function calibrate(input, actualKwh) {
    if (!(actualKwh >= 50 && actualKwh <= 3000)) return { ok: false, reason: 'Enter the kWh from your bill, between 50 and 3000.' };
    const run = (s) => simulate(Object.assign({}, input, { baseScale: s, billKwh: null })).figures.monthKwh.value;
    const own = run(1);
    let lo = 0.05, hi = 8;
    if (run(lo) > actualKwh || run(hi) < actualKwh) return { ok: false, reason: 'No base load lets this home reach that figure. Check the home, air-con and solar settings.' };
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (run(mid) < actualKwh) lo = mid; else hi = mid; }
    return { ok: true, baseScale: (lo + hi) / 2, billKwh: actualKwh, simulatedKwh: own, gapPct: 100 * (actualKwh - own) / own };
  }


  // ---- the township layout and your lot. The layout is a drawing, not SDP's plan: distances are scaled from the one real anchor
  // (township centre to the nearest stop, 0.93 km), so a lot's distance is ILLUSTRATIVE. ----
  const LOTS = [[-10, -10], [-64, -10], [-46, -10], [-28, -10], [8, -10], [26, -10], [-64, -42], [-46, -42], [-28, -42], [-10, -42], [8, -42], [26, -42]];
  const STOP_POS = { x: 50, z: 10 }, TOWNSHIP_CENTRE = { x: -19, z: -26 };
  const FOOTPRINT = { terrace: [11, 15], semid: [15, 17], condo: [14, 14] };
  const lotNeighbourType = (i) => (i % 5 === 3 ? 'semid' : 'terrace');
  const metresPerUnit = () => ASSUME.stopKm.v * 1000 / Math.hypot(STOP_POS.x - TOWNSHIP_CENTRE.x, STOP_POS.z - TOWNSHIP_CENTRE.z);
  const validLot = (i) => Number.isInteger(i) && i >= 0 && i < LOTS.length;
  const lotDistanceKm = (i) => Math.hypot(STOP_POS.x - LOTS[i][0], STOP_POS.z - LOTS[i][1]) * metresPerUnit() / 1000;
  // With no lot chosen the model uses the township centre's REAL distance.
  const stopKmFor = (input) => (validLot(input && input.lot) ? lotDistanceKm(input.lot) : ASSUME.stopKm.v);
  function lotInfo(i) {
    if (!validLot(i)) return null;
    const km = lotDistanceKm(i);
    return { n: i + 1, km: km, walkMin: km * ASSUME.walkMinKm.v, grade: GRADE.ILLUSTRATIVE };
  }
  // Waypoints for a trip from a lot to the stop (on foot) or out along the main road (by car). The front row's doors face the footpath; the
  // back row walks along the lane between the rows, then both go down the east lane. Buildings are never crossed (tested).
  function tripPath(lot, mode) {
    const L = LOTS[validLot(lot) ? lot : 0], door = { x: L[0] - 3, z: L[1] + 12 }, LANE = 42;
    if (mode === 'walk') return [door, { x: LANE, z: door.z }, { x: LANE, z: 8.2 }, { x: 48, z: 8.2, wait: 2.2 }, { x: LANE, z: 8.2 }, { x: LANE, z: door.z }, door];
    const drive = { x: door.x + 4, z: door.z + 1 };
    return [drive, { x: LANE, z: drive.z }, { x: LANE, z: 18 }, { x: 108, z: 18 }, { x: LANE, z: 18 }, { x: LANE, z: drive.z }, drive];
  }
  // Where a plot's trees stand, relative to the lot centre: two rows in the rear yard, clear of every building (tested).
  const PLOT_SLOTS = [[-6, -12.6], [-3.6, -12.6], [-1.2, -12.6], [1.2, -12.6], [3.6, -12.6], [6, -12.6], [-4.8, -16], [-1.6, -16], [1.6, -16], [4.8, -16]];
  // Every building on the street for a given choice of lot and home type, as rectangles {x0, x1, z0, z1}, with room for a roof overhang.
  function buildingRects(lot, house) {
    const rects = [];
    LOTS.forEach((p, i) => {
      const type = i === lot ? house : lotNeighbourType(i), fp = FOOTPRINT[type] || FOOTPRINT.terrace;
      rects.push({ x0: p[0] - (fp[0] + 1.2) / 2, x1: p[0] + (fp[0] + 1.2) / 2, z0: p[1] - (fp[1] + 1.2) / 2, z1: p[1] + (fp[1] + 1.2) / 2 });
    });
    return rects;
  }

  // ---- what the inspect panel shows when something in the scene is clicked. Pure, so it can be tested. ----
  function inspectInfo(kind, input, clk, extra) {
    clk = clk || { day: 1, hour: 12 }; extra = extra || {};
    const sim = simulate(input), d = sim.days[clk.day - 1] || sim.days[29], ch = choiceOnDay(input, clk.day);
    const row = (k, v, grade) => ({ k: k, v: v, grade: grade || GRADE.ILLUSTRATIVE });
    const kwhToday = d.netKwh * clk.hour / 24, wx = weatherAt(clk.day, clk.hour, input), native = Math.round(input.trees * input.nativeShare);
    const hasLot = validLot(input.lot), km = stopKmFor(input), kmGrade = hasLot ? GRADE.ILLUSTRATIVE : GRADE.REAL;
    const lvl = input.house === 'condo' ? clamp(Math.round(Number(input.level) || 1), 1, CONDO_LEVELS) : null;
    const trip = { walkKm: km, walkMin: km * ASSUME.walkMinKm.v, carKm: 2 * km };
    switch (kind) {
      case 'home': return { title: (HOUSES[input.house] || HOUSES.terrace).label + ', your home', rows: [
        row('Air-con now', acIsOn(clk.hour, ch.acHours) ? 'On' : 'Off'), row('Air-con at night', ch.acHours + ' h at ' + ch.setpoint + ' C'),
        row('Level', lvl === null ? 'ground (a house)' : 'level ' + lvl + ' of ' + CONDO_LEVELS + (lvl === CONDO_LEVELS ? ', under the roof' : '')),
        row('Your lot', hasLot ? 'Lot ' + (input.lot + 1) + ', ' + km.toFixed(2) + ' km from the stop' : 'not placed yet'),
        row('Rooftop solar', input.solarKwp ? input.solarKwp + ' kWp' : 'none'), row('Trees on the plot', input.trees + ' (' + native + ' native)'),
        row('Electricity figures', input.billKwh != null && Math.abs(sim.figures.monthKwh.value - input.billKwh) < 1 ? 'matched to your bill' : 'simulated', input.billKwh != null && Math.abs(sim.figures.monthKwh.value - input.billKwh) < 1 ? GRADE.REAL : GRADE.ILLUSTRATIVE),
        row('Used so far today', kwhToday.toFixed(1) + ' kWh'), row('Weather now', wx.label + ', ' + wx.temp.toFixed(0) + ' C')],
        facts: ['Every figure here comes from the simulation and is illustrative until a real home replaces it.'] };
      case 'neighbour': return { title: 'A neighbour\'s home', rows: [
        row('Air-con at night', NEIGHBOUR.acHours + ' h at ' + NEIGHBOUR.setpoint + ' C'), row('Rooftop solar', 'none'), row('Trees on the plot', NEIGHBOUR.trees + ' (' + Math.round(NEIGHBOUR.trees * NEIGHBOUR.nativeShare) + ' native)')],
        facts: ['All neighbours stand for one fixed illustrative household. Your scores are measured against it.'] };
      case 'stop': return { title: 'Bus stop', rows: [
        row('Distance from the township centre', ASSUME.stopKm.v + ' km', GRADE.REAL)].concat(hasLot ? [row('From your lot', km.toFixed(2) + ' km')] : [], [row('Nearest rail station', ASSUME.railKm.v + ' km', GRADE.REAL)]),
        facts: ['The centre distance is real but drawn compressed. It uses an approximate centre and a straight line, from data.gov.my timetable feeds.'].concat(hasLot ? ['The township layout is a drawing, so the distance from your lot is scaled from that real figure and is illustrative.'] : [], ['Live bus positions returned nothing when tested, so no real-time bus is shown.']) };
      case 'bus': return { title: 'Bus, scheduled and illustrative', rows: [row('Source', 'a drawn loop, not a timetable')],
        facts: ['This bus is a drawing. The real scheduled departures would come from the public timetable feed, which is not shown yet.'] };
      case 'corridor': return { title: 'Elmina Urban Biodiversity Corridor', rows: [row('Trees planted along a 500 m stretch', ASSUME.corridorTrees.v.toLocaleString('en-GB'), GRADE.REAL)],
        facts: ['From SDP\'s 2024 sustainability highlights. Your biodiversity score counts only the trees on your own plot, not these.'] };
      case 'solar': { const kwp = input.solarKwp; return { title: 'Rooftop solar', rows: [
        row('Size', kwp + ' kWp'), row('Offset today', Math.min(kwp * ASSUME.peakSunH.v * ASSUME.solarPerf.v, ASSUME.solarShare.v * d.useKwh).toFixed(1) + ' kWh'), row('Offset this month', sim.figures.solarKwh.value.toFixed(0) + ' kWh')],
        facts: ['Offset is capped at the share of use that daytime solar can cover, with no export credit.'] }; }
      case 'person': return { title: 'A resident on foot', rows: [
        row('Trip', 'to the bus stop and back'), row('Distance each way', (hasLot ? trip.walkKm.toFixed(2) : trip.walkKm) + ' km', kmGrade), row('Walking time each way', trip.walkMin.toFixed(0) + ' min')].concat(lvl === null ? [] : [row('Lift or stairs, each way', (ASSUME.liftMin.v + ASSUME.liftPerLevel.v * lvl).toFixed(1) + ' min')], [ row('Carbon for this trip', '0 kg')]),
        facts: ['The walking pace is a placeholder. The drawing compresses the distance.'].concat(lvl === null ? [] : ['In a condo every trip starts with the lift or stairs, and a higher level adds a little time.']) };
      case 'car': return { title: 'A resident driving', rows: [
        row('Round trip', trip.carKm.toFixed(2) + ' km'), row('Carbon for this trip', (trip.carKm * ASSUME.carKgKm.v).toFixed(2) + ' kg'), row('Running cost', 'RM ' + (trip.carKm * ASSUME.carRmKm.v).toFixed(2))],
        facts: ['The same trip on foot would use no carbon and cost nothing.'] };
      default: return null;
    }
  }

  // ---- the game: four weekly rounds on the same model ----
  const EVENTS = [
    { week: 1, title: 'A normal week', note: 'Typical weather. Set your habits for the week.' },
    { week: 2, title: 'Heat spell', note: 'Days 8-14 run about 2.5 C hotter. Nights stay warm, so the air-con question gets harder.' },
    { week: 3, title: 'Neighbour report', note: 'A report shows how your use compares with homes like yours. Reports like this cut electricity use by about 2% on average (Allcott 2011).' },
    { week: 4, title: 'Rainy week', note: 'Rain keeps walking to at most half of your short trips.' },
  ];
  function newGame(setup) { return { setup: Object.assign({}, DEFAULTS, setup), weekly: [] }; }
  function gameInput(g) {
    const base = g.setup, w = [];
    let last = { acHours: base.acHours, setpoint: base.setpoint, walkShare: base.walkShare };
    for (let i = 0; i < 4; i++) { if (g.weekly[i]) last = g.weekly[i]; w.push(Object.assign({}, last)); }
    w[3].walkShare = Math.min(w[3].walkShare, 0.5);
    return Object.assign({}, base, { weekly: w, heat: [8, 14], hotWeek: false });
  }
  function play(g, choice) {
    if (g.weekly.length >= 4) throw new Error('month already finished');
    const c = {
      acHours: clamp(Math.round(choice.acHours), 0, 12),
      setpoint: clamp(Math.round(choice.setpoint), 22, 28),
      walkShare: clamp(choice.walkShare, 0, g.weekly.length === 3 ? 0.5 : 1),
    };
    return { setup: g.setup, weekly: g.weekly.concat([c]) };
  }
  const isFinished = (g) => g.weekly.length >= 4;
  const LEVERS = [
    { key: 'acHours', delta: -2, label: 'Run the air-con 2 hours less' },
    { key: 'setpoint', delta: 1, label: 'Set the air-con 1 degree warmer' },
    { key: 'walkShare', delta: 0.2, label: 'Walk 20% more of your short trips' },
    { key: 'trees', delta: 2, label: 'Plant 2 more trees' },
    { key: 'solarKwp', delta: 2, label: 'Add 2 kWp of rooftop solar' },
  ];
  function applyLever(input, lv) {
    const o = Object.assign({}, input);
    const bump = (obj) => {
      const lo = lv.key === 'setpoint' ? 22 : 0;
      const hi = { acHours: 12, setpoint: 28, walkShare: 1, trees: 10, solarKwp: 8 }[lv.key];
      obj[lv.key] = clamp(obj[lv.key] + lv.delta, lo, hi);
    };
    if (['acHours', 'setpoint', 'walkShare'].includes(lv.key) && input.weekly) o.weekly = input.weekly.map((w) => { const x = Object.assign({}, w); bump(x); return x; });
    else bump(o);
    return o;
  }
  // The biggest carbon saving among single changes that keep comfort within 5 points.
  function suggest(input, n) {
    const base = simulate(input).figures;
    return LEVERS.map((lv) => {
      const f = simulate(applyLever(input, lv)).figures;
      return { key: lv.key, label: lv.label, carbonKg: base.carbonKg.value - f.carbonKg.value,
               rm: (base.monthBill.value + base.carRm.value) - (f.monthBill.value + f.carRm.value),
               comfortDrop: base.comfortPct.value - f.comfortPct.value };
    }).filter((x) => x.carbonKg > 0.5 && x.comfortDrop <= 5)
      .sort((a, b) => b.carbonKg - a.carbonKg).slice(0, n || 2);
  }

  const API = { CONDO_LEVELS, PLOT_SLOTS, LOTS, STOP_POS, TOWNSHIP_CENTRE, FOOTPRINT, lotNeighbourType, metresPerUnit, validLot, lotDistanceKm, stopKmFor, lotInfo, tripPath, buildingRects, calibrate, inspectInfo, LEVERS, choiceOnDay, acIsOn, weatherAt, tripsOnDay, tripsUpTo, tripModeOf, EVENTS, newGame, gameInput, play, isFinished, suggest, applyLever, GRADE, ASSUME, TARIFF, HOUSES, DEFAULTS, NEIGHBOUR, simulate, scores, bill, tempAt, nightHotHours, dayMeanTemp };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Terrarium = API;
})(typeof window !== 'undefined' ? window : globalThis);
