/**
 * Signycle Signals Loader v3.4
 * Always loads signals-data.json for manual fields (cycleScore, recessionProb, hormuzStatus).
 * Then overlays live Worker data on top of the signals sub-object (Brent, copper, etc.).
 * v3.2: Treats 0/null/NaN from Worker as missing — falls back to manual value.
 * v3.3: Re-fetches every 2 minutes so pages update without a manual reload,
 * and stops cache-busting the Worker call so Cloudflare's edge cache (5min)
 * actually gets used instead of every page view re-hitting Yahoo Finance directly.
 * v3.4: Only overlay Worker data for the signals it actually prices live (Yahoo
 * Finance tickers). The Worker's KV also echoes back non-live manual signals
 * (BDI, VLCC, PMI, etc.) from whatever was last POSTed via admin.html — that
 * snapshot goes stale independently of signals-data.json and was overriding
 * fresher git-committed values with old ones (wrong value AND wrong zone).
 * v3.5: cycleScore/cyclePhase/sellZoneCount are now computed from the actual
 * merged per-signal zones instead of trusting the hand-typed numbers in
 * signals-data.json (admin.html's meta_cycleScore/meta_sellZoneCount inputs),
 * which had no mechanism keeping them in sync with live prices or with each
 * other and were sometimes visibly wrong (e.g. sellZoneCount=5 when 7 signals
 * were actually in sell zone). recessionProb stays manual — it's a macro
 * model output, not something derivable from signal zone counts.
 * v3.6: eur10y added to LIVE_IDS — the Worker now sources it live from the
 * ECB's own daily yield-curve data instead of manual entry (worker.js v3.4).
 */
(function() {
  var WORKER_URL = 'https://signycle-signals.fransbgn.workers.dev';
  var WORKER_SOURCE = WORKER_URL + '/api/signals';
  var FALLBACK_SOURCE = '/signals-data.json';
  // Must match worker.js's LIVE_TICKERS keys plus eur10y (sourced from the
  // ECB, not Yahoo) — the only signals the Worker actually prices live.
  // Everything else in its KV is just a stale mirror of a past manual
  // publish, never more current than signals-data.json.
  var LIVE_IDS = { brent:1, wti:1, spread:1, copper:1, alum:1, gold:1, steel:1, ironore:1, lithium:1, eur10y:1 };

  // Inject a subtle loading placeholder for any [data-signal] element that
  // hasn't been filled yet, so an empty span never reads as a rendering bug
  // and never shows a stale hardcoded number. Cleared automatically once
  // applyData() sets real textContent on the element.
  var style = document.createElement('style');
  style.textContent = '[data-signal]:empty::after{content:"···";opacity:.35;}';
  document.head.appendChild(style);

  // Turns the merged per-signal zones into a live cycleScore/cyclePhase/
  // sellZoneCount, replacing whatever was hand-typed into signals-data.json.
  // Each zone maps to a representative point on the 0-100 BUY->SELL scale
  // used sitewide (see how-it-works.html's bands); the score is their average.
  var ZONE_POINTS = { buy: 15, neutral: 50, warn: 72, sell: 90 };
  var PHASE_BANDS = [
    [25, 'Deep BUY'], [45, 'Early Expansion'], [65, 'Mid Cycle'],
    [80, 'Late Expansion'], [101, 'Distribution']
  ];
  function phaseForScore(score) {
    for (var i = 0; i < PHASE_BANDS.length; i++) {
      if (score < PHASE_BANDS[i][0]) return PHASE_BANDS[i][1];
    }
    return PHASE_BANDS[PHASE_BANDS.length - 1][1];
  }
  function computeCycleStats(signals) {
    var sellCount = 0, total = 0, sum = 0;
    for (var id in signals) {
      if (id === 'spread') continue; // derived value, not an independently tracked signal
      if (id === 'yieldCurve') continue; // recession-only indicator; not part of the commodity buy/sell cycle
      var zone = signals[id] && signals[id].zone;
      if (!ZONE_POINTS.hasOwnProperty(zone)) continue;
      total++;
      sum += ZONE_POINTS[zone];
      if (zone === 'sell') sellCount++;
    }
    if (!total) return null;
    var score = Math.round(sum / total);
    return { cycleScore: score, cyclePhase: phaseForScore(score), sellZoneCount: sellCount };
  }

  // Manual (non-live) signals are only as fresh as whoever last typed them
  // into admin.html. Past this many days, flag it visibly rather than let
  // it silently read as current data.
  var STALE_THRESHOLD_DAYS = 45;
  function daysStale(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null; // e.g. "Live" — not a real date, don't guess
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days >= 0 ? days : null;
  }

  function fmt(value, decimals) {
    var n = parseFloat(value);
    if (isNaN(n)) return String(value);
    if (n >= 100000) return (n/1000).toFixed(0) + 'k';
    if (n >= 10000)  return n.toLocaleString('en-US', {maximumFractionDigits: 0});
    if (n >= 1000)   return n.toLocaleString('en-US', {maximumFractionDigits: 0});
    if (n < 10)      return n.toFixed(2);
    return n.toFixed(decimals !== undefined ? decimals : 1);
  }

  function applyData(d) {
    window.SignycleData = d;

    document.querySelectorAll('[data-signal]').forEach(function(el) {
      var key = el.getAttribute('data-signal');
      var format = el.getAttribute('data-format') || 'default';

      var meta = {
        cycleScore:     (d.cycleScore != null ? d.cycleScore : '—') + '/100',
        cyclePhase:     d.cyclePhase || '—',
        recessionProb:  (d.recessionProb != null ? d.recessionProb : '—') + '%',
        sellZoneCount:  d.sellZoneCount != null ? d.sellZoneCount : '—',
        updated:        d.updated || '—',
        hormuzStatus:   d.hormuzStatus || '—',
      };
      if (meta[key] !== undefined) {
        el.textContent = meta[key];
        return;
      }

      if (d.signals && d.signals[key]) {
        var sig = d.signals[key];
        var val = fmt(sig.value);
        if (format === 'default')    el.textContent = val + ' ' + (sig.unit || '');
        if (format === 'valueOnly')  el.textContent = val;
        if (format === 'date')       el.textContent = sig.date || '';
        if (format === 'zone')       el.textContent = sig.zone || '';
        if (format === 'raw')        el.textContent = sig.value;
        if (format === 'withUnit')   el.textContent = '$' + val;

        if (sig.live) {
          el.setAttribute('title', 'Live from Yahoo Finance');
          var badge = el.parentElement && el.parentElement.querySelector('.live-dot');
          if (badge) badge.style.display = 'inline';
        } else {
          var staleDays = daysStale(sig.date);
          if (staleDays !== null && staleDays > STALE_THRESHOLD_DAYS) {
            el.setAttribute('title', 'Not live — data as of ' + sig.date + ' (' + staleDays + ' days old)');
            el.style.borderBottom = '1px dotted #d97706';
            if (format === 'date') el.style.color = '#d97706';
          }
        }
      }
    });

    // Generic zone-status badge: <span data-zone-badge="brent">···</span> gets its
    // label + colors set from that signal's live zone. One shared mechanism instead
    // of every hub/sector/compare page hardcoding its own "SELL ZONE" text that
    // never updates when the underlying signal's zone actually changes.
    var ZONE_BADGE = {
      buy:     { label: 'BUY',       bg: '#e6f5f1', color: '#00956e' },
      neutral: { label: 'NEUTRAL',   bg: '#f0f4f2', color: '#475569' },
      warn:    { label: 'NEAR SELL', bg: '#fffbeb', color: '#d97706' },
      sell:    { label: 'SELL',      bg: '#fef2f2', color: '#dc2626' }
    };
    document.querySelectorAll('[data-zone-badge]').forEach(function(el) {
      var key = el.getAttribute('data-zone-badge');
      var sig = d.signals && d.signals[key];
      var zone = sig && ZONE_BADGE[sig.zone] ? sig.zone : null;
      if (!zone) return;
      var z = ZONE_BADGE[zone];
      el.textContent = z.label;
      el.style.background = z.bg;
      el.style.color = z.color;
    });

    document.dispatchEvent(new CustomEvent('signalsLoaded', { detail: d }));
  }

  function loadSignals() {
  // Step 1: Always load manual JSON first (gives us cycleScore, recessionProb, hormuzStatus, and signals as fallback)
  fetch(FALLBACK_SOURCE + '?v=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(manualData) {
      // Step 2: Try to overlay Worker data on top of the signals sub-object.
      // No cache-buster here — the Worker sets a 5min Cache-Control, and we
      // want Cloudflare's edge to actually serve from that shared cache
      // instead of every single page view re-triggering 8 Yahoo Finance calls.
      fetch(WORKER_SOURCE)
        .then(function(r) { return r.json(); })
        .then(function(workerData) {
          var merged = {
            cycleScore: manualData.cycleScore,
            cyclePhase: manualData.cyclePhase,
            recessionProb: manualData.recessionProb,
            sellZoneCount: manualData.sellZoneCount,
            updated: manualData.updated,
            hormuzStatus: manualData.hormuzStatus,
            signals: {}
          };
          if (manualData.signals) {
            for (var k in manualData.signals) merged.signals[k] = manualData.signals[k];
          }
          if (workerData.signals) {
            for (var wk in workerData.signals) {
              if (!LIVE_IDS[wk]) continue; // not a live-priced signal — KV is a stale mirror, ignore it
              var workerSig = workerData.signals[wk];
              var manualSig = merged.signals[wk] || {};
              // Treat 0, null, undefined, NaN as missing — fall back to manual value
              var workerVal = workerSig.value;
              var useWorkerVal = workerVal != null && workerVal !== 0 && !isNaN(parseFloat(workerVal));
              // Keep unit/date/zone consistent with whichever value we actually used —
              // otherwise a stale worker zone (from old KV data) can be shown next to
              // a fresh manual value, or vice versa.
              merged.signals[wk] = useWorkerVal ? {
                value: workerVal,
                unit:  workerSig.unit || manualSig.unit,
                date:  workerSig.date || manualSig.date,
                zone:  workerSig.zone || manualSig.zone,
                live:  !!workerSig.live
              } : {
                value: manualSig.value,
                unit:  manualSig.unit || workerSig.unit,
                date:  manualSig.date || workerSig.date,
                zone:  manualSig.zone || workerSig.zone,
                live:  false
              };
            }
          }
          var stats = computeCycleStats(merged.signals);
          if (stats) {
            merged.cycleScore = stats.cycleScore;
            merged.cyclePhase = stats.cyclePhase;
            merged.sellZoneCount = stats.sellZoneCount;
          }
          applyData(merged);
        })
        .catch(function() {
          var stats = computeCycleStats(manualData.signals || {});
          if (stats) {
            manualData.cycleScore = stats.cycleScore;
            manualData.cyclePhase = stats.cyclePhase;
            manualData.sellZoneCount = stats.sellZoneCount;
          }
          applyData(manualData);
        });
    })
    .catch(function(e) {
      console.log('[Signycle] loader failed:', e);
      // Total failure (even the local JSON didn't load): make it visible
      // instead of leaving every [data-signal] element silently blank.
      document.querySelectorAll('[data-signal]:empty').forEach(function(el) {
        el.textContent = '—';
        el.title = 'Signal data unavailable — please refresh';
      });
    });
  }

  loadSignals();
  setInterval(loadSignals, 2 * 60 * 1000);
})();
