/* Signycle signal definitions and the shared signal card, used on every page
   that shows a signal. Exposes window.SignycleMeta.

   Signycle does not publish BUY/SELL levels. Each signal is shown as:
   - where today's value sits in its own 20-year monthly history (percentile;
     dollar prices adjusted for US inflation), from /signal-ranges.json, and
   - its change against the monthly average three months earlier.
   Signals without free long-run history show only the latest value.
   signals-loader.js attaches that information to each signal as `pos`, sets
   `zone` to one of the band keys below, and leaves out values that are stale
   or implausible. See what-the-research-says.html for why. */
(function() {
  // Plausible range for each signal. A value outside it is treated as a data
  // error and not shown (e.g. a typo in a hand-entered value).
  var PLAUSIBLE = {
    brent: [5, 250], wti: [-40, 250], spread: [-30, 60], copper: [1000, 30000], alum: [500, 8000],
    gold: [200, 10000], steel: [200, 3000], ironore: [10, 300], lithium: [2000, 100000],
    bdi: [200, 15000], vlcc: [3000, 400000], lng: [3000, 500000], scfi: [300, 8000], pctc: [2000, 150000],
    salmon: [15, 200], urea: [80, 1500], nbsk: [300, 2500], eur10y: [-2, 12], pmi: [25, 75],
    defense: [0.5, 8], rig: [20, 100], flying: [20, 200], wfe: [20, 250], yieldCurve: [-5, 5]
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
    copper:  { name: 'Copper', sector: 'Metals', page: 'signal-lme-copper.html',
               s: [['KGHM','blog-kghm-copper-cycle.html'],['GLEN','blog-glencore-commodities-cycle.html'],['ANTO','blog-antofagasta-copper-cycle.html'],['AAL','blog-angloamerican-copper-cycle.html'],['UMI','blog-umicore-copper-cycle.html']] },
    alum:    { name: 'Aluminium', sector: 'Metals', page: 'signal-aluminium-price.html',
               s: [['NHY','blog-norsk-hydro-alum-cycle.html'],['ELK','blog-elkem-silicon-cycle.html'],['MYTIL','blog-mytilineos-alum-cycle.html']] },
    gold:    { name: 'Gold', sector: 'Metals', page: 'signal-gold-price.html',
               s: [['NEM','blog-newmont-gold-cycle.html'],['AU','blog-anglogold-gold-cycle.html']] },
    steel:   { name: 'Steel HRC', sector: 'Metals', page: 'signal-us-hrc-steel.html',
               s: [['MT','blog-arcelormittal-steel-cycle.html'],['SSAB','blog-ssab-steel-analysis.html'],['TKA','blog-thyssenkrupp-steel-cycle.html'],['VOE','blog-voestalpine-steel-cycle.html'],['BEKB','blog-bekaert-steel-cycle.html'],['JSW','blog-jsw-steel-cycle.html']] },
    ironore: { name: 'Iron ore (62% Fe)', sector: 'Metals', page: 'signal-iron-ore-price.html',
               s: [['RIO','blog-rio-tinto-analysis.html'],['GLEN','blog-glencore-commodities-cycle.html'],['AAL','blog-angloamerican-copper-cycle.html']] },
    lithium: { name: 'Lithium', sector: 'Metals', page: 'signal-lithium-carbonate.html',
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
  // Bands of the percentile in the signal's own history. Neutral colours on
  // purpose: a high or low reading is a description, not a recommendation.
  var BANDS = [[10, 'vlow', 'Very low'], [30, 'low', 'Low'], [70, 'mid', 'Normal range'], [90, 'high', 'High'], [101, 'vhigh', 'Very high']];
  var ZONE_LABEL = { vlow: 'Very low', low: 'Low', mid: 'Normal range', high: 'High', vhigh: 'Very high', none: 'Latest value' };
  var ZONE_HEX = { vlow: '#1e3a5f', low: '#4a6f96', mid: '#64748b', high: '#4a6f96', vhigh: '#1e3a5f', none: '#94a3b8' };
  // Signals whose change is shown in points/dollars rather than percent.
  var CHG_ABS = { eur10y: ' pp', yieldCurve: ' pp', spread: '' };
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
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function monthName(ym) { return MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }

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
    if (!d) return { live: false, text: 'Updated by hand · ' + (sig.date || 'date unknown'), stale: true, days: null };
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return { live: false, text: 'Updated by hand · ' + sig.date, stale: days > STALE_DAYS, days: days };
  }

  // Why a value is not shown, or null if it can be shown.
  function rejectReason(id, sig) {
    var v = parseFloat(sig && sig.value);
    if (!sig || isNaN(v) || (v === 0 && id !== 'spread' && id !== 'yieldCurve')) return 'no current value';
    var p = PLAUSIBLE[id];
    if (p && (v < p[0] || v > p[1])) return 'value failed a plausibility check';
    var f = freshness(sig);
    if (!f.live && f.stale) return f.days == null ? 'no date on the latest value' : 'latest value is ' + f.days + ' days old';
    return null;
  }

  // Percentile + 3-month change for one signal, from /signal-ranges.json.
  function position(id, sig, ranges) {
    var r = ranges && ranges.signals && ranges.signals[id];
    var v = parseFloat(sig.value);
    if (!r || isNaN(v)) return null;
    var xs = r.sorted, below = 0;
    while (below < xs.length && xs[below] < v) below++;
    var pct = Math.round(100 * below / xs.length);
    var band = BANDS.filter(function(b) { return pct < b[0]; })[0];
    var q = function(f) { return xs[Math.min(xs.length - 1, Math.floor(f * xs.length))]; };
    // Change against the monthly average three months before the value's own month.
    var d = sig.live ? new Date() : (parseManualDate(sig.date) || new Date());
    var y = d.getUTCFullYear(), m = d.getUTCMonth() - 3;
    if (m < 0) { m += 12; y -= 1; }
    var ref = y + '-' + (m < 9 ? '0' : '') + (m + 1), rv = r.recent && r.recent[ref], chg = null;
    if (rv != null) chg = CHG_ABS.hasOwnProperty(id) ? v - rv : 100 * (v / rv - 1);
    return { pct: pct, band: band[1], label: band[2], p10: q(0.1), p50: q(0.5), p90: q(0.9),
             from: r.from, to: r.to, adj: r.adj, src: r.src, note: r.note,
             chg: chg, chgRef: rv != null ? ref : null, chgUnit: CHG_ABS.hasOwnProperty(id) ? (CHG_ABS[id] || 'abs') : '%' };
  }

  function chgText(p, unit) {
    if (p.chg == null) return '';
    var c = p.chg, up = c > 0;
    var flat = p.chgUnit === '%' ? Math.abs(c) < 0.5 : Math.abs(c) < 0.05;
    var arrow = flat ? '▬' : (up ? '▲' : '▼');
    var amt = p.chgUnit === '%' ? Math.abs(c).toFixed(0) + '%'
            : p.chgUnit === ' pp' ? Math.abs(c).toFixed(2) + ' pp'
            : fmt(Math.abs(c), unit);
    return arrow + ' ' + amt;
  }

  // The shared signal card. opts.compact drops the explanation line.
  function card(id, sig, opts) {
    opts = opts || {};
    var m = META[id], unit = sig.unit, v = parseFloat(sig.value), p = sig.pos, f = freshness(sig);
    var name = m.page ? '<a class="lc-name" href="' + m.page + '">' + esc(m.name) + '</a>' : '<span class="lc-name">' + esc(m.name) + '</span>';
    var h = '<div class="lr-row">' +
      '<div class="lc-top">' + name + '<span class="lr-tag ' + (p ? p.band : 'none') + '">' + (p ? p.label : 'No long history') + '</span></div>' +
      '<div class="lc-val">' + fmt(v, unit) + '<small>' + esc(unitLabel(unit)) + '</small></div>';
    if (p) {
      var x = Math.max(1.5, Math.min(98.5, p.pct));
      h += '<div class="lr-scale" aria-hidden="true"><div class="lr-track"><span class="lr-band"></span><span class="lr-med"></span><span class="lr-dot" style="left:' + x + '%"></span></div>' +
        '<div class="lr-ticks"><span style="left:10%">' + fmt(p.p10, unit) + '</span><span style="left:50%">' + fmt(p.p50, unit) + '</span><span style="left:90%">' + fmt(p.p90, unit) + '</span></div></div>' +
        '<div class="lr-facts"><div><b>' + ordinal(p.pct) + '</b><span>percentile, 20 years</span></div>' +
        (p.chg != null ? '<div><b>' + chgText(p, unit) + '</b><span>vs ' + monthName(p.chgRef) + ' average</span></div>' : '<div><b>–</b><span>no 3-month comparison</span></div>') + '</div>';
      if (!opts.compact) {
        h += '<div class="sc-ctx">Higher than in ' + p.pct + '% of months since ' + monthName(p.from) + (p.adj ? ', in today’s dollars' : '') +
          '. The shaded band is the middle 80% of that history.' + (p.note ? ' ' + esc(p.note) : '') + '</div>';
      }
    } else if (!opts.compact) {
      h += '<div class="sc-ctx">Signycle has no free long-run history for this signal, so it doesn’t place today’s value in a range.</div>';
    }
    h += '<div class="pos-meta">' + (f.live ? '<span class="dot-live"></span>Live, checked about every 15 minutes' : esc(f.text) + (sig.src ? ' · ' + esc(sig.src) : '')) + '</div></div>';
    return h;
  }
  function cardMissing(id, reason) {
    var m = META[id];
    var name = m.page ? '<a class="lc-name" href="' + m.page + '">' + esc(m.name) + '</a>' : '<span class="lc-name">' + esc(m.name) + '</span>';
    return '<div class="lr-row"><div class="lc-top">' + name + '<span class="lr-tag none">Not shown</span></div>' +
      '<div class="sc-ctx">No reliable current value' + (reason ? ' (' + esc(reason) + ')' : '') + ', so it is left out rather than shown out of date.</div></div>';
  }
  var FOOT = 'Where the value sits in its own history, and which way it is moving. Not a buy or sell signal. <a href="how-it-works.html">How this is calculated</a> · <a href="what-the-research-says.html">What the research says</a>';

  // Card styles, shared by every page that shows a signal.
  var css = '.lc-top{display:flex;justify-content:space-between;align-items:center;gap:0.6rem}.lc-name{font-size:0.92rem;font-weight:700;color:var(--ink,#0c1c2e);text-decoration:none}a.lc-name:hover{color:var(--green,#00956e)}' +
    '.lc-val{font-size:1.75rem;font-weight:700;letter-spacing:-0.02em;line-height:1.15;color:var(--ink,#0c1c2e);font-variant-numeric:tabular-nums;margin-top:0.3rem}.lc-val small{font-size:0.78rem;font-weight:500;color:var(--muted,#94a3b8);margin-left:0.35rem;letter-spacing:0}' +
    '.lr-row .sc-ctx{font-size:0.8rem;margin-top:0.15rem;color:var(--text,#475569)}.lr-row .pos-meta{margin-top:0.45rem;font-size:0.7rem;color:var(--muted,#94a3b8);display:flex;align-items:center;gap:0.3rem}.lr-row .dot-live{width:6px;height:6px;border-radius:50%;background:var(--green,#00956e);display:inline-block}' +
    '.lc-foot{margin-top:0.9rem;font-size:0.72rem;line-height:1.5;color:var(--muted,#94a3b8)}.lc-foot a{color:var(--green,#00956e);font-weight:600;text-decoration:none}' +
    '.lr-row{padding:0.9rem 0;border-top:1px solid var(--border,#e5e9ec)}.lr-row:first-child{border-top:0;padding-top:0.2rem}' +
    '.lr-tag{font-size:0.64rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:0.22rem 0.55rem;border-radius:20px;white-space:nowrap}' +
    '.lr-tag.vlow,.lr-tag.vhigh{background:#1e3a5f;color:#fff}.lr-tag.low,.lr-tag.high{background:#dbe7f3;color:#1e3a5f}.lr-tag.mid{background:#eef2f6;color:#475569}.lr-tag.none{background:#f1f5f9;color:#64748b}' +
    '.lr-scale{position:relative;margin:0.55rem 0 0.2rem}.lr-track{position:relative;height:8px;border-radius:4px;background:#eef2f6}' +
    '.lr-band{position:absolute;left:10%;right:10%;top:0;bottom:0;background:#c8d6e5;border-radius:2px}' +
    '.lr-med{position:absolute;left:50%;top:-3px;bottom:-3px;width:2px;margin-left:-1px;background:#7b8ca3}' +
    '.lr-dot{position:absolute;top:-4px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:var(--ink,#0c1c2e);border:2px solid #fff;box-shadow:0 0 0 1px rgba(12,28,46,.25)}' +
    '.lr-ticks{position:relative;height:16px;margin-top:4px}.lr-ticks span{position:absolute;transform:translateX(-50%);font-family:var(--mono,monospace);font-size:0.6rem;color:var(--muted,#94a3b8);white-space:nowrap}' +
    '.lr-facts{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin:0.5rem 0 0.4rem}.lr-facts div{background:var(--surface,#f8faf9);border-radius:8px;padding:0.45rem 0.6rem}' +
    '.lr-facts b{display:block;font-size:0.92rem;color:var(--ink,#0c1c2e);font-variant-numeric:tabular-nums}.lr-facts span{font-size:0.66rem;color:var(--muted,#94a3b8)}';
  if (typeof document !== 'undefined' && !document.getElementById('lrCss')) {
    var st = document.createElement('style'); st.id = 'lrCss'; st.textContent = css; document.head.appendChild(st);
  }

  window.SignycleMeta = { SECTORS: SECTORS, META: META, LIVE_IDS: LIVE_IDS, PLAUSIBLE: PLAUSIBLE, BANDS: BANDS,
    ZONE_HEX: ZONE_HEX, ZONE_LABEL: ZONE_LABEL, MONTHS: MONTHS, STALE_DAYS: STALE_DAYS, FOOT: FOOT,
    esc: esc, fmt: fmt, unitLabel: unitLabel, ordinal: ordinal, monthName: monthName, parseManualDate: parseManualDate,
    freshness: freshness, rejectReason: rejectReason, position: position, chgText: chgText, card: card, cardMissing: cardMissing };
})();
