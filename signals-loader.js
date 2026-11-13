/**
 * Signycle Signals Loader v4.0
 * Loads signals-data.json (hand-entered values) and overlays the Worker's live
 * prices for the signals it prices live. Then, for every signal:
 * - leaves it out if the value is stale (hand-entered and over 45 days old),
 *   missing or implausible, recording why in data.hidden[id];
 * - attaches `pos` (percentile in its own 20-year history + 3-month change)
 *   from /signal-ranges.json, and sets `zone` to the percentile band
 *   (vlow/low/mid/high/vhigh, or 'none' without long-run history).
 * v4.0 removed BUY/SELL zones and the cycle score: they were fixed price levels
 * chosen by judgement and never tested. See what-the-research-says.html.
 * Fires `signalsLoaded` with the data; re-fetches every 2 minutes.
 */
(function() {
  var WORKER_URL = 'https://signycle-signals.fransbgn.workers.dev';
  var WORKER_SOURCE = WORKER_URL + '/api/signals';
  var FALLBACK_SOURCE = '/signals-data.json';
  var RANGES_SOURCE = '/signal-ranges.json';
  // Must match worker.js's LIVE_TICKERS keys plus eur10y (ECB) and yieldCurve
  // (FRED) — the only signals the Worker actually prices live. Everything
  // else in its KV is just a stale mirror of a past manual publish.
  var LIVE_IDS = { brent:1, wti:1, spread:1, copper:1, alum:1, gold:1, steel:1, ironore:1, lithium:1, eur10y:1, yieldCurve:1 };

  var style = document.createElement('style');
  style.textContent = '[data-signal]:empty::after{content:"···";opacity:.35;}';
  document.head.appendChild(style);

  var ranges = null;

  function getJSON(url) { return fetch(url).then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  // signals-meta.js holds the shared rules; load it if this page doesn't.
  function withMeta(cb) {
    if (window.SignycleMeta) return cb();
    var s = document.createElement('script');
    s.src = '/signals-meta.js?v=4';
    s.onload = cb;
    s.onerror = cb;
    document.head.appendChild(s);
  }

  function enrich(d) {
    var M = window.SignycleMeta;
    d.hidden = {};
    if (!M) return d;
    for (var id in d.signals) {
      var sig = d.signals[id];
      var why = M.rejectReason(id, sig);
      // A live price far from the latest official monthly average is more
      // likely a feed error than a real move (e.g. a frozen futures quote).
      var r = ranges && ranges.signals && ranges.signals[id];
      if (!why && sig.live && r && r.recent && !/^(eur10y|yieldCurve|spread)$/.test(id)) {
        var ks = Object.keys(r.recent).sort(), last = r.recent[ks[ks.length - 1]], v = parseFloat(sig.value);
        if (last && Math.abs(v / last - 1) > 0.4) why = 'live price is far from the latest monthly average, so it may be a data error';
      }
      if (why) { d.hidden[id] = why; delete d.signals[id]; continue; }
      sig.pos = M.position(id, sig, ranges);
      sig.zone = sig.pos ? sig.pos.band : 'none';
    }
    return d;
  }

  function fmt(value) {
    var n = parseFloat(value);
    if (isNaN(n)) return String(value);
    if (Math.abs(n) >= 1000000) return (Math.round(n / 10000) / 100) + 'M';
    if (Math.abs(n) >= 100000) return (n / 1000).toFixed(0) + 'k';
    if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    if (Math.abs(n) < 10) return n.toFixed(2);
    return n.toFixed(1);
  }

  function applyData(d) {
    window.SignycleData = d;
    var M = window.SignycleMeta;
    document.querySelectorAll('[data-signal]').forEach(function(el) {
      var key = el.getAttribute('data-signal');
      var format = el.getAttribute('data-format') || 'default';
      if (key === 'updated') { el.textContent = d.updated || '—'; return; }
      var sig = d.signals && d.signals[key];
      if (!sig) {
        el.textContent = '—';
        if (d.hidden && d.hidden[key]) el.title = 'Not shown: ' + d.hidden[key];
        return;
      }
      var val = fmt(sig.value);
      if (format === 'default') el.textContent = val + ' ' + (sig.unit || '');
      if (format === 'valueOnly') el.textContent = val;
      if (format === 'date') el.textContent = sig.live ? 'Live' : (sig.date || '');
      if (format === 'zone') el.textContent = M ? M.ZONE_LABEL[sig.zone] || '' : '';
      if (format === 'raw') el.textContent = sig.value;
      if (format === 'withUnit') el.textContent = '$' + val;
      if (sig.live) el.setAttribute('title', 'Live price');
      else if (sig.date) el.setAttribute('title', 'As of ' + sig.date);
    });
    // <span data-zone-badge="brent"> shows where the signal sits in its history.
    document.querySelectorAll('[data-zone-badge]').forEach(function(el) {
      var sig = d.signals && d.signals[el.getAttribute('data-zone-badge')];
      if (!sig || !M) { el.textContent = ''; return; }
      el.textContent = M.ZONE_LABEL[sig.zone] || '';
      el.className = 'lr-tag ' + sig.zone;
    });
    document.dispatchEvent(new CustomEvent('signalsLoaded', { detail: d }));
  }

  function merge(manualData, workerData) {
    var merged = { updated: manualData.updated, signals: {} };
    var k;
    for (k in (manualData.signals || {})) merged.signals[k] = manualData.signals[k];
    if (workerData && workerData.signals) {
      for (k in workerData.signals) {
        if (!LIVE_IDS[k]) continue;
        var w = workerData.signals[k], v = w.value;
        // Treat 0, null and NaN from the Worker as missing.
        if (v == null || v === 0 || isNaN(parseFloat(v))) continue;
        if (!w.live) continue; // a stored, non-live value: keep the dated value from signals-data.json
        merged.signals[k] = { value: v, unit: w.unit || (merged.signals[k] || {}).unit, date: 'Live', live: true };
      }
    }
    return merged;
  }

  function loadSignals() {
    var rp = ranges ? Promise.resolve(ranges) : getJSON(RANGES_SOURCE + '?v=3').then(function(r) { ranges = r; return r; }).catch(function() { return null; });
    Promise.all([getJSON(FALLBACK_SOURCE + '?v=' + Date.now()), rp])
      .then(function(res) {
        var manualData = res[0];
        return getJSON(WORKER_SOURCE)
          .then(function(workerData) { return merge(manualData, workerData); })
          .catch(function() { return merge(manualData, null); });
      })
      .then(function(d) { withMeta(function() { applyData(enrich(d)); }); })
      .catch(function(e) {
        console.log('[Signycle] loader failed:', e);
        document.querySelectorAll('[data-signal]:empty').forEach(function(el) {
          el.textContent = '—';
          el.title = 'Signal data unavailable — please refresh';
        });
      });
  }

  loadSignals();
  setInterval(loadSignals, 2 * 60 * 1000);
})();
