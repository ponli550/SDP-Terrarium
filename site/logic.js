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

  const DEFAULTS = { house: 'terrace', acHours: 8, setpoint: 24, solarKwp: 0, walkShare: 0.2, trees: 2, nativeShare: 0.2, hotWeek: false };
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
    const days = [];
    let kwhTotal = 0, solarTotal = 0, comfortSum = 0;
    for (let d = 1; d <= 30; d++) {
      const w = Object.assign({}, c, (c.weekly && c.weekly[weekOf(d)]) || {});
      const mean = dayMeanTemp(d, c.hotWeek, c.heat);
      const acKwh = w.acHours * ASSUME.acKw24.v * (1 - ASSUME.acPerDegree.v * (w.setpoint - 24))
                    * house.acFactor * (1 + 0.03 * (mean - 28))
                    * (1 - Math.min(0.1, ASSUME.shadePerTree.v * c.trees));
      const use = house.baseKwhDay + acKwh;
      const solar = Math.min(c.solarKwp * ASSUME.peakSunH.v * ASSUME.solarPerf.v, ASSUME.solarShare.v * use);
      const net = use - solar;
      const need = Math.max(nightHotHours(mean), 1);
      const comfort = clamp(w.acHours / need, 0, 1) * (1 - 0.05 * (w.setpoint - 24));
      days.push({ day: d, meanTemp: mean, useKwh: use, solarKwh: solar, netKwh: net, comfort: clamp(comfort, 0, 1) });
      kwhTotal += net; solarTotal += solar; comfortSum += clamp(comfort, 0, 1);
    }
    const km = ASSUME.stopKm.v;
    const weeklyTrips = ASSUME.tripsWeek.v;
    const monthTrips = weeklyTrips * 30 / 7;
    let walked = 0;
    WEEK_DAYS.forEach((n, i) => {
      const share = ((c.weekly && c.weekly[i]) || c).walkShare;
      walked += weeklyTrips * n / 7 * share;
    });
    const driven = Math.max(0, monthTrips - walked);
    const walkMin = walked * 2 * km * ASSUME.walkMinKm.v;
    const carKm = driven * 2 * km;
    const carKg = carKm * ASSUME.carKgKm.v;
    const carRm = carKm * ASSUME.carRmKm.v;
    const elecKg = kwhTotal * ASSUME.gridKgKwh.v;
    const elecRm = bill(kwhTotal);
    return {
      choices: c, days,
      figures: {
        monthKwh:   { value: kwhTotal, grade: GRADE.ILLUSTRATIVE, unit: 'kWh', label: 'Electricity this month' },
        monthBill:  { value: elecRm, grade: GRADE.ILLUSTRATIVE, unit: 'RM', label: 'Electricity bill' },
        carbonKg:   { value: elecKg + carKg, grade: GRADE.ILLUSTRATIVE, unit: 'kg CO2', label: 'Carbon, home and short trips' },
        carRm:      { value: carRm, grade: GRADE.ILLUSTRATIVE, unit: 'RM', label: 'Car cost, short trips' },
        walkMin:    { value: walkMin, grade: GRADE.ILLUSTRATIVE, unit: 'min', label: 'Walking this month' },
        comfortPct: { value: 100 * comfortSum / 30, grade: GRADE.ILLUSTRATIVE, unit: '%', label: 'Nights kept comfortable' },
        stopKm:     { value: km, grade: GRADE.REAL, unit: 'km', label: 'Nearest transit stop' },
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
    const community = clamp(50 * f.walkMin.value / Math.max(n.walkMin.value, 1), 0, 100);
    const bio = clamp(50 * f.bioIndex.value / Math.max(n.bioIndex.value, 0.1), 0, 100);
    return {
      you, neighbour: nb,
      pillars: [
        { key: 'energy', name: 'Energy Low Carbon', score: energy,
          formula: 'score = 50 x neighbour carbon / your carbon, capped 0-100 (equal to neighbour = 50)' },
        { key: 'resilience', name: 'Climate Resilience', score: resilience,
          formula: 'score = share of nights kept comfortable; AC hours / hot-night hours, less 5% per degree of setpoint above 24' },
        { key: 'community', name: 'Community Experience', score: community,
          formula: 'score = 50 x your walking minutes / neighbour walking minutes, capped 0-100' },
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

  const API = { LEVERS, choiceOnDay, acIsOn, weatherAt, tripsOnDay, tripsUpTo, tripModeOf, EVENTS, newGame, gameInput, play, isFinished, suggest, applyLever, GRADE, ASSUME, TARIFF, HOUSES, DEFAULTS, NEIGHBOUR, simulate, scores, bill, tempAt, nightHotHours, dayMeanTemp };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Terrarium = API;
})(typeof window !== 'undefined' ? window : globalThis);
