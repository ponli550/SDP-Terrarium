/* The "About the numbers" page: the grades, where every figure comes from, a FAQ, what an account keeps, and the limits of a prototype.
   The sources table is built from the model's own assumptions and citations (logic.js), so it cannot say anything the model does not use.
   DOM calls and text only, never parsed as HTML. */
(function (root) {
  'use strict';

  function el(doc, tag, props, kids) {
    var e = doc.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === 'class') e.className = props[k]; else if (k === 'text') e.textContent = props[k]; else e.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); });
    return e;
  }
  var clear = function (n) { while (n.firstChild) n.removeChild(n.firstChild); };
  var badge = function (doc, g) { return el(doc, 'span', { class: 'badge ' + g, text: g }); };

  // a plain name and unit for every assumption; a test fails if the model gains one that is not named here
  var LABELS = {
    stopKm: { label: 'Distance to the nearest public transit stop', unit: 'km' },
    railKm: { label: 'Distance to the nearest rail station', unit: 'km' },
    corridorTrees: { label: 'Trees on the Elmina biodiversity corridor stretch', unit: 'trees' },
    gridKgKwh: { label: 'Carbon in each kWh from the grid', unit: 'kg CO2e per kWh' },
    tariff: { label: 'Electricity price', unit: 'RM per kWh' },
    nudgeCap: { label: 'Most that a home energy report cuts electricity', unit: 'share of use' },
    acKw24: { label: 'Air-con power at 24 C', unit: 'kW' },
    acPerDegree: { label: 'Air-con energy saved per degree warmer', unit: 'share per degree' },
    peakSunH: { label: 'Peak sun hours a day', unit: 'hours' },
    solarPerf: { label: 'Solar system performance', unit: 'ratio' },
    solarShare: { label: 'Most of the day\'s use that solar can offset', unit: 'share' },
    carKgKm: { label: 'Carbon from a car trip', unit: 'kg CO2 per km' },
    carRmKm: { label: 'Running cost of a car trip', unit: 'RM per km' },
    walkMinKm: { label: 'Walking pace', unit: 'minutes per km' },
    tripsWeek: { label: 'Short trips a week', unit: 'trips' },
    roofHeat: { label: 'Extra cooling for a unit under the roof', unit: 'share' },
    shadeLevels: { label: 'Levels a plot tree can shade', unit: 'levels' },
    liftMin: { label: 'Minutes to the ground floor, before the per-level amount', unit: 'minutes' },
    liftPerLevel: { label: 'Extra minutes per level on that trip', unit: 'minutes' },
    shadePerTree: { label: 'Air-con energy a shade tree saves', unit: 'share per tree' },
  };
  var READ = {
    primary: function (s) { return 'We read the publisher\'s own document on ' + s.checked + '.'; },
    secondary: function (s) { return 'We read a report of it on ' + s.checked + ', not the schedule itself.'; },
    carried: function () { return 'Carried from the first build; not re-checked.'; },
  };
  var ORDER = { REAL: 0, SOURCED: 1, ILLUSTRATIVE: 2 };

  var FAQ = [
    ['Is this my real electricity bill?', 'No. Until you type the kWh from a bill and press Match, the month is simulated and every electricity figure is ILLUSTRATIVE. Once matched, that one figure is yours (REAL) and the bill in RM follows it through the published tariff (SOURCED). Anything you change afterwards breaks the match, and the page says so.'],
    ['Where do the numbers come from?', 'Each one has a grade. Public data is REAL, a figure with a published source is SOURCED, and our own placeholders are ILLUSTRATIVE. The table above lists every assumption the model uses, its grade, and for REAL and SOURCED ones what we read and what we did not.'],
    ['Why are most figures marked ILLUSTRATIVE?', 'Because they are guesses of ours: how much power an air-con draws, how much a tree shades, how often a household takes a short trip. We say so on screen instead of making them look measured. Replacing them needs real homes, which we do not have yet.'],
    ['What is the neighbour?', 'One fixed household we made up: a terrace house with 8 hours of air-con at 24 C, no solar, 20% of short trips on foot and 2 trees. It is a yardstick, not real data, so a comparison with it is only as good as that guess.'],
    ['Can I trust the score?', 'Treat it as a way to compare two choices, not as a measurement. The four score formulas are our placeholders. Some scores stop at 100, so a better home can look the same as a good one.'],
    ['Does it show flooding, or the greenhouse effect?', 'No. It shows heat and running cost, as illustrations: how much air-con a home needs, and how many hot nights it can keep comfortable. It has no water, drainage or flood data, and no urban heat or climate-warming model. The ground layers in the exploded view are a drawing, not a model.'],
    ['What does Match to my bill do?', 'It adjusts the home\'s base load (everything that is not air-con) until the simulated month equals your kWh. One number cannot say why a home differs from the model, so nothing else is changed.'],
    ['Does the assistant make things up?', 'It is not a language model. It picks a fixed type of answer, builds the sentence from the model, and checks every figure against the model before showing it. An answer that fails the check is withheld.'],
    ['Why does my lot show a different distance from 0.93 km?', 'The 0.93 km is the real distance from the township centre to the nearest stop. The 12 lots are a drawing scaled from it, so a lot\'s distance is ILLUSTRATIVE.'],
  ];
  var DATA = [
    ['As a guest', 'Nothing is sent to our server. Your home lives in this browser tab and is gone when you close it.'],
    ['With an account, we keep', 'your email, a salted hash of your password (never the password), a hash of your recovery code, hashed login tokens, and your home settings. The settings can include the monthly kWh from your bill, if you entered one.'],
    ['We do not keep', 'your name, address, phone number, identity number, or anything from your bank or your electricity provider.'],
    ['Your email is only a username', 'We never send an email and never check that an address is yours. Anyone can register any address, so use one you do not mind being seen as a username.'],
    ['Where it is stored', 'In a database on Cloudflare. We have not chosen its location.'],
    ['What you cannot do yet', 'There is no way to delete an account, no password reset by email, and no export of your account. A forgotten password is recovered only with the recovery code you were shown once.'],
    ['Why it matters', 'A bill figure is personal data under Malaysia\'s PDPA. This is a prototype: a real pilot would need notice, consent, a retention period and a way to delete.'],
  ];
  var TERMS = [
    'Terrarium is a prototype built for the Sime Darby Property University Hackathon 2026. It is not a Sime Darby Property product and uses no Sime Darby Property data.',
    'Every figure is an illustration unless it is graded REAL or SOURCED. Even then it describes a typical case, not your home. It is not financial, engineering or legal advice.',
    'The model has no warranty. The service and the accounts may be changed, reset or removed at any time, including after the hackathon.',
    'This is a plain-language notice, not legal terms, and it has not been reviewed by a lawyer.',
  ];

  function grades(doc, host, T) {
    clear(host);
    var count = { REAL: 0, SOURCED: 0, ILLUSTRATIVE: 0 }; Object.keys(T.ASSUME).forEach(function (k) { count[T.ASSUME[k].grade]++; });
    host.appendChild(el(doc, 'h2', { text: 'How to read a figure' }));
    host.appendChild(el(doc, 'p', { class: 'note', text: 'Every number in Terrarium carries one of three grades, so a placeholder cannot pass for a fact.' }));
    var defs = [['REAL', 'Public data, used as published, with its source.'], ['SOURCED', 'An assumption that has a published source we read.'], ['ILLUSTRATIVE', 'A placeholder of ours, to be replaced. It is labelled on screen and never headlined.']];
    host.appendChild(el(doc, 'div', { class: 'gradedefs' }, defs.map(function (d) {
      return el(doc, 'div', { class: 'gradedef', 'data-grade': d[0] }, [badge(doc, d[0]), el(doc, 'p', { text: d[1] }), el(doc, 'small', { text: count[d[0]] + ' of the model\'s ' + Object.keys(T.ASSUME).length + ' assumptions' })]);
    })));
  }

  function sources(doc, host, T) {
    clear(host);
    host.appendChild(el(doc, 'h2', { text: 'Where the numbers come from' }));
    host.appendChild(el(doc, 'p', { class: 'note', text: 'This table is built from the model itself: every assumption it uses, with its grade. For the real and sourced ones it says what we read, and what we did not.' }));
    var keys = Object.keys(T.ASSUME).sort(function (a, b) { return (ORDER[T.ASSUME[a].grade] - ORDER[T.ASSUME[b].grade]) || (a < b ? -1 : 1); });
    var list = el(doc, 'div', { class: 'srcs', role: 'list' });
    keys.forEach(function (k) {
      var a = T.ASSUME[k], s = T.SOURCES[k], lab = LABELS[k] || { label: k, unit: '' };
      var kids = [
        el(doc, 'div', { class: 'src-h' }, [el(doc, 'b', { text: lab.label }), badge(doc, a.grade)]),
        el(doc, 'div', { class: 'src-v' }, [el(doc, 'span', { class: 'src-val', text: String(a.v) }), el(doc, 'span', { class: 'src-unit', text: ' ' + lab.unit })]),
        el(doc, 'p', { class: 'src-note', text: a.note }),
      ];
      if (k === 'tariff') kids.push(el(doc, 'ul', { class: 'src-tariff' }, [
        'Energy: ' + Math.round(T.TARIFF.energy[0][1] * 10000) / 100 + ' sen per kWh up to ' + T.TARIFF.energy[0][0] + ' kWh a month, then ' + Math.round(T.TARIFF.energy[1][1] * 10000) / 100 + ' sen',
        'Capacity: ' + Math.round(T.TARIFF.capacity * 10000) / 100 + ' sen per kWh', 'Network: ' + Math.round(T.TARIFF.network * 10000) / 100 + ' sen per kWh',
        'Retail: RM ' + T.TARIFF.retail.rm + ' a month, waived at ' + T.TARIFF.retail.freeAtOrBelowKwh + ' kWh or less',
      ].map(function (t) { return el(doc, 'li', { text: t }); })));
      if (s) {
        var link = s.url ? el(doc, 'a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.title }) : el(doc, 'span', { text: s.title });
        kids.push(el(doc, 'div', { class: 'src-cite' }, [el(doc, 'span', { text: 'Source: ' }), link, el(doc, 'span', { text: ', ' + s.publisher + (s.date ? ', ' + s.date : '') + '.' })]));
        (s.confirmedBy || []).forEach(function (c) { kids.push(el(doc, 'div', { class: 'src-cite' }, [el(doc, 'span', { text: 'Confirmed by: ' }), el(doc, 'a', { href: c.url, target: '_blank', rel: 'noopener noreferrer', text: c.title }), el(doc, 'span', { text: ' (for ' + c.for + ').' })])); });
        kids.push(el(doc, 'p', { class: 'src-read ' + s.read, text: READ[s.read](s) }));
        kids.push(el(doc, 'p', { class: 'src-caveat', text: s.caveat }));
      } else kids.push(el(doc, 'p', { class: 'src-read ILLUSTRATIVE', text: 'Our placeholder. No source.' }));
      list.appendChild(el(doc, 'div', { class: 'srcrow', role: 'listitem', 'data-key': k, 'data-grade': a.grade }, kids));
    });
    host.appendChild(list);
  }

  function faq(doc, host) {
    clear(host); host.appendChild(el(doc, 'h2', { text: 'Questions' }));
    FAQ.forEach(function (x) { host.appendChild(el(doc, 'details', { class: 'faq' }, [el(doc, 'summary', { text: x[0] }), el(doc, 'p', { text: x[1] })])); });
  }
  function data(doc, host) {
    clear(host); host.appendChild(el(doc, 'h2', { text: 'What an account keeps' }));
    host.appendChild(el(doc, 'dl', { class: 'facts' }, [].concat.apply([], DATA.map(function (x) { return [el(doc, 'dt', { text: x[0] }), el(doc, 'dd', { text: x[1] })]; }))));
  }
  function terms(doc, host) {
    clear(host); host.appendChild(el(doc, 'h2', { text: 'What this is, and is not' }));
    host.appendChild(el(doc, 'ul', { class: 'terms' }, TERMS.map(function (t) { return el(doc, 'li', { text: t }); })));
  }

  function render(doc, els, T) { grades(doc, els.grades, T); sources(doc, els.sources, T); faq(doc, els.faq); data(doc, els.data); terms(doc, els.terms); }

  var API = { render: render, LABELS: LABELS, FAQ: FAQ, DATA: DATA, TERMS: TERMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TerrariumAboutView = API;
})(typeof window !== 'undefined' ? window : globalThis);
