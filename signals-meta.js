/* Signycle signal definitions, shared by the homepage and live-signals.html.
   Exposes window.SignycleMeta. Load before the page script that uses it. */
(function() {
  // Copy of worker.js THRESHOLDS (the engine that assigns zones and sends
  // alerts). Zones shown on the site come from the API itself; these numbers
  // only place the bars, label the levels and drive the what-if slider, so
  // keep them in sync with worker.js by hand. cycle-dashboard.html still has
  // its own copy too.
  var THRESHOLDS = {
    brent:   { buy: 50,    warnSell: 95,    sell: 105   },
    wti:     { buy: 45,    warnSell: 88,    sell: 95    },
    spread:  { buy: 0,     warnSell: 8,     sell: 12    },
    copper:  { buy: 5000,  warnSell: 8500,  sell: 9000  },
    alum:    { buy: 1600,  warnSell: 2800,  sell: 3200  },
    gold:    { buy: 1200,  warnSell: 2500,  sell: 2800  },
    steel:   { buy: 700,   warnSell: 1150,  sell: 1450  },
    ironore: { buy: 60,    warnSell: 85,    sell: 100   },
    lithium: { buy: 12000, warnSell: 30000, sell: 40000 },
    bdi:     { buy: 900,   warnSell: 2500,  sell: 3000  },
    vlcc:    { buy: 15000, warnSell: 60000, sell: 75000 },
    lng:     { buy: 10000, warnSell: 60000, sell: 80000 },
    scfi:    { buy: 800,   warnSell: 2500,  sell: 3500  },
    pctc:    { buy: 8000,  warnSell: 35000, sell: 45000 },
    salmon:  { buy: 42,    warnSell: 75,    sell: 82    },
    urea:    { buy: 230,   warnSell: 550,   sell: 620   },
    nbsk:    { buy: 750,   warnSell: 1100,  sell: 1300  },
    eur10y:  { buy: 1.5,   warnSell: 3.0,   sell: 3.5   },
    pmi:     { buy: 48,    warnSell: 55,    sell: 60    },
    defense: { buy: 2.0,   warnSell: 3.0,   sell: 3.5   },
    rig:     { buy: 70,    warnSell: 88,    sell: 92    },
    flying:  { buy: 85,    warnSell: 115,   sell: 130   },
    wfe:     { buy: 80,    warnSell: 120,   sell: 140   }
  };
  // Slider ranges for the what-if explorer only (UX, not signal config).
  var SLIDER = {
    brent: [0, 160, 1], wti: [0, 140, 1], spread: [-15, 25, 0.5], copper: [0, 14000, 100],
    alum: [0, 4000, 50], gold: [500, 5500, 25], steel: [0, 2100, 25], ironore: [0, 160, 2],
    lithium: [0, 55000, 500], bdi: [0, 4500, 50], vlcc: [0, 130000, 1000], lng: [0, 110000, 1000],
    scfi: [0, 5000, 50], pctc: [0, 60000, 500], salmon: [0, 120, 1], urea: [0, 850, 10],
    nbsk: [0, 1800, 25], eur10y: [0, 6, 0.05], pmi: [30, 70, 0.1], defense: [0, 5, 0.1],
    rig: [0, 100, 1], flying: [0, 180, 1], wfe: [0, 200, 1]
  };
  var SECTORS = ['Energy', 'Metals', 'Shipping', 'Agri & materials', 'Macro & industry'];
  // s: affected stocks [ticker, analysis page]
  var META = {
    brent:   { name: 'Brent crude', sector: 'Energy', page: 'signal-brent-crude.html',
               s: [['EQNR','blog-equinor-brent-cycle.html'],['SUBC','blog-subsea7-brent-cycle.html'],['OMV','blog-omv-oil-cycle.html'],['GALP','blog-galp-oil-cycle.html'],['ENI','blog-eni-oil-cycle.html'],['SHEL','blog-shell-oil-cycle.html'],['TTE','blog-totalenergies-oil-cycle.html']] },
    wti:     { name: 'WTI crude', sector: 'Energy', page: 'compare-wti-brent.html', s: [] },
    spread:  { name: 'Brent–WTI spread', sector: 'Energy', page: 'compare-wti-brent.html', s: [] },
    rig:     { name: 'Offshore rig utilisation', sector: 'Energy', page: 'signal-rig-utilization.html',
               s: [['AKA','blog-akastor-rig-cycle.html'],['SUBC','blog-subsea7-brent-cycle.html']] },
    copper:  { name: 'LME copper', sector: 'Metals', page: 'signal-lme-copper.html',
               s: [['KGHM','blog-kghm-copper-cycle.html'],['GLEN','blog-glencore-commodities-cycle.html'],['ANTO','blog-antofagasta-copper-cycle.html'],['AAL','blog-angloamerican-copper-cycle.html'],['UMI','blog-umicore-copper-cycle.html']] },
    alum:    { name: 'LME aluminium', sector: 'Metals', page: 'signal-aluminium-price.html',
               s: [['NHY','blog-norsk-hydro-alum-cycle.html'],['ELK','blog-elkem-silicon-cycle.html'],['MYTIL','blog-mytilineos-alum-cycle.html']] },
    gold:    { name: 'Gold', sector: 'Metals', page: 'signal-gold-price.html',
               s: [['NEM','blog-newmont-gold-cycle.html'],['AU','blog-anglogold-gold-cycle.html']] },
    steel:   { name: 'Steel HRC', sector: 'Metals', page: 'signal-us-hrc-steel.html',
               s: [['MT','blog-arcelormittal-steel-cycle.html'],['SSAB','blog-ssab-steel-analysis.html'],['TKA','blog-thyssenkrupp-steel-cycle.html'],['VOE','blog-voestalpine-steel-cycle.html'],['BEKB','blog-bekaert-steel-cycle.html'],['JSW','blog-jsw-steel-cycle.html']] },
    ironore: { name: 'Iron ore (62% Fe)', sector: 'Metals', page: 'signal-iron-ore-price.html',
               s: [['RIO','blog-rio-tinto-analysis.html'],['GLEN','blog-glencore-commodities-cycle.html'],['AAL','blog-angloamerican-copper-cycle.html']] },
    lithium: { name: 'Lithium carbonate', sector: 'Metals', page: 'signal-lithium-carbonate.html',
               s: [['ALB','blog-albemarle-lithium-cycle.html'],['SQM','blog-sqm-lithium-cycle.html'],['PLS','blog-pilbara-lithium-cycle.html']] },
    bdi:     { name: 'Baltic Dry Index', sector: 'Shipping', page: 'signal-baltic-dry-index.html',
               s: [['SBLK','blog-star-bulk-bdi-cycle.html'],['2020','blog-2020-bulkers-bdi.html']] },
    vlcc:    { name: 'VLCC tanker rate', sector: 'Shipping', page: 'signal-vlcc-rate.html',
               s: [['FRO','blog-frontline-vlcc-cycle.html'],['HAFNI','blog-hafnia-vlcc-cycle.html']] },
    lng:     { name: 'LNG carrier rate', sector: 'Shipping', page: 'signal-lng-freight-rate.html',
               s: [['ALNG','blog-awilco-lng-cycle.html'],['GLNG','blog-golar-lng-cycle.html']] },
    scfi:    { name: 'SCFI container freight', sector: 'Shipping', page: 'signal-scfi-container.html',
               s: [['MAERSK','blog-maersk-container-shipping.html'],['DSV','blog-dsv-logistics-pmi-cycle.html']] },
    pctc:    { name: 'PCTC car carrier rate', sector: 'Shipping', page: 'signal-pctc-car-carrier.html',
               s: [['HAUTO','blog-hoegh-autoliners-pctc-cycle.html']] },
    salmon:  { name: 'Norwegian salmon', sector: 'Agri & materials', page: 'signal-salmon-price.html',
               s: [['MOWI','blog-mowi-salmon-cycle.html']] },
    urea:    { name: 'Urea', sector: 'Agri & materials', page: 'signal-urea-price.html',
               s: [['YAR','blog-fertilizer-cycle-yara.html']] },
    nbsk:    { name: 'NBSK pulp', sector: 'Agri & materials', page: 'signal-nbsk-pulp-price.html',
               s: [['STERV','blog-stora-enso-upm-cycle.html'],['UPM','blog-upm-pulp-cycle.html'],['NVG','blog-navigator-pulp-cycle.html']] },
    eur10y:  { name: 'EUR 10Y rate', sector: 'Macro & industry', page: 'signal-eur-10y-rate.html',
               s: [['VER','blog-verbund-rate-cycle.html'],['EDP','blog-edp-rate-cycle.html'],['ELI','blog-elia-rate-cycle.html'],['ENEL','blog-enel-rate-cycle.html'],['IBE','blog-iberdrola-wind-cycle.html']] },
    pmi:     { name: 'Global manufacturing PMI', sector: 'Macro & industry', page: 'signal-global-pmi.html',
               s: [['BMW','blog-bmw-volkswagen-cycle.html'],['STLA','blog-stellantis-auto-cycle.html'],['CRH','blog-crh-pmi-cycle.html'],['KGS','blog-kingspan-pmi-cycle.html'],['SGO','blog-saintgobain-pmi-cycle.html']] },
    defense: { name: 'NATO defence spending', sector: 'Macro & industry', page: 'signal-nato-defence.html',
               s: [['RHM','blog-rheinmetall-defense-cycle.html'],['BAES','blog-bae-systems-cycle.html'],['SAAB','blog-saab-defense-cycle.html'],['LDO','blog-leonardo-defense-cycle.html'],['HO','blog-thales-defense-cycle.html']] },
    flying:  { name: 'Wide-body flying hours', sector: 'Macro & industry', page: null,
               s: [['RR','blog-rolls-royce-aerospace-cycle.html'],['IAG','blog-iag-aviation-cycle.html'],['AIR','blog-airbus-aerospace-cycle.html']] },
    wfe:     { name: 'Semicon equipment (WFE)', sector: 'Macro & industry', page: null,
               s: [['ASML','blog-asml-semiconductor-cycle.html']] },
    yieldCurve: { name: 'US 10Y–2Y yield curve', sector: 'Macro & industry', page: 'recession-tracker.html', s: [] }
  };
  // Must match signals-loader.js LIVE_IDS — the only signals with recorded history.
  var LIVE_IDS = ['brent', 'wti', 'spread', 'copper', 'alum', 'gold', 'steel', 'ironore', 'lithium', 'eur10y', 'yieldCurve'];
  var ZONE_HEX = { buy: '#00956e', neutral: '#64748b', warn: '#d97706', sell: '#dc2626' };
  var ZONE_LABEL = { buy: 'BUY', neutral: 'NEUTRAL', warn: 'NEAR SELL', sell: 'SELL' };
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var STALE_DAYS = 45;

  function esc(s) { return String(s).replace(/[&<>"]/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function fmt(v, unit) {
    v = parseFloat(v);
    if (isNaN(v)) return '–';
    if (unit === '%') return (Math.abs(v) < 10 ? v.toFixed(2) : String(Math.round(v * 10) / 10)) + '%';
    if (unit === '% GDP') return v.toFixed(1) + '%';
    var a = Math.abs(v), s;
    if (a >= 1000000) s = (Math.round(v / 10000) / 100) + 'M';
    else if (a >= 100000) s = Math.round(v / 1000) + 'k';
    else if (a >= 1000) s = Math.round(v).toLocaleString('en-US');
    else if (a >= 100 || Number.isInteger(v)) s = String(Math.round(v * 10) / 10);
    else s = v.toFixed(1);
    if (unit && unit.charAt(0) === '$') return '$' + s;
    if (unit === 'NOK/kg') return 'NOK ' + s;
    return s;
  }
  function unitLabel(unit) {
    if (unit === '% GDP') return 'of GDP';
    if (unit === '%') return '';
    if (unit === 'pts' || unit === 'index') return 'index';
    return unit || '';
  }
  function pctText(p) { return p < 1 ? '<1%' : Math.round(p) + '%'; }

  // Manual dates look like "22 Apr 2026", "Feb 2026" or "2025 est." —
  // parsed by hand because Safari's Date() rejects the first two.
  function parseManualDate(s) {
    var m = String(s || '').match(/(?:(\d{1,2})\s+)?([A-Za-z]{3})[a-z]*\s+(\d{4})/);
    if (!m) return null;
    var mi = MONTHS.indexOf(m[2].charAt(0).toUpperCase() + m[2].slice(1, 3).toLowerCase());
    if (mi < 0) return null;
    return new Date(Date.UTC(+m[3], mi, m[1] ? +m[1] : 1));
  }
  function freshness(sig) {
    if (sig.live) return { live: true, text: 'Live', stale: false };
    var d = parseManualDate(sig.date);
    if (!d) return { live: false, text: 'Manual · ' + (sig.date || 'date unknown'), stale: true, days: null };
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return { live: false, text: 'Manual · ' + sig.date, stale: days > STALE_DAYS, days: days };
  }
  function position(id, v) {
    var t = THRESHOLDS[id];
    var raw = 18 + 64 * (v - t.buy) / (t.sell - t.buy);
    return { raw: raw, x: Math.max(2, Math.min(98, raw)), warn: 18 + 64 * (t.warnSell - t.buy) / (t.sell - t.buy) };
  }
  function context(id, v, zone) {
    var t = THRESHOLDS[id];
    if (zone === 'sell') return pctText((v / t.sell - 1) * 100) + ' above the SELL level';
    if (zone === 'warn') return pctText(Math.max(0, (1 - v / t.sell) * 100)) + ' below the SELL level';
    if (zone === 'buy') return t.buy ? pctText((1 - v / t.buy) * 100) + ' below the BUY level' : 'In the BUY zone';
    var toSell = (1 - v / t.warnSell) * 100;
    return 'Between BUY and SELL · ' + pctText(Math.max(0, toSell)) + ' below near-sell';
  }

  window.SignycleMeta = { THRESHOLDS: THRESHOLDS, SLIDER: SLIDER, SECTORS: SECTORS, META: META, LIVE_IDS: LIVE_IDS,
    ZONE_HEX: ZONE_HEX, ZONE_LABEL: ZONE_LABEL, MONTHS: MONTHS, STALE_DAYS: STALE_DAYS,
    esc: esc, fmt: fmt, unitLabel: unitLabel, pctText: pctText, parseManualDate: parseManualDate,
    freshness: freshness, position: position, context: context };
})();
