/**
 * Signycle Signals Loader v3.3
 * Always loads signals-data.json for manual fields (cycleScore, recessionProb, hormuzStatus).
 * Then overlays live Worker data on top of the signals sub-object (Brent, copper, etc.).
 * v3.2: Treats 0/null/NaN from Worker as missing — falls back to manual value.
 * v3.3: Re-fetches every 2 minutes so pages update without a manual reload,
 * and stops cache-busting the Worker call so Cloudflare's edge cache (5min)
 * actually gets used instead of every page view re-hitting Yahoo Finance directly.
 */
(function() {
  var WORKER_URL = 'https://signycle-signals.fransbgn.workers.dev';
  var WORKER_SOURCE = WORKER_URL + '/api/signals';
  var FALLBACK_SOURCE = '/signals-data.json';

  // Inject a subtle loading placeholder for any [data-signal] element that
  // hasn't been filled yet, so an empty span never reads as a rendering bug
  // and never shows a stale hardcoded number. Cleared automatically once
  // applyData() sets real textContent on the element.
  var style = document.createElement('style');
  style.textContent = '[data-signal]:empty::after{content:"···";opacity:.35;}';
  document.head.appendChild(style);

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
        }
      }
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
            updated: workerData.updated || manualData.updated,
            hormuzStatus: manualData.hormuzStatus,
            signals: {}
          };
          if (manualData.signals) {
            for (var k in manualData.signals) merged.signals[k] = manualData.signals[k];
          }
          if (workerData.signals) {
            var manualDate = new Date(manualData.updated || '2020-01-01');
            var daysSinceUpdate = (new Date() - manualDate) / (1000 * 60 * 60 * 24);
            var useWorker = daysSinceUpdate > 3;
            if (!useWorker) { /* Skip worker override - manual data is recent */ }
            else {
            for (var wk in workerData.signals) {
              var workerSig = workerData.signals[wk];
              var manualSig = merged.signals[wk] || {};
              // Treat 0, null, undefined, NaN as missing — fall back to manual value
              var workerVal = workerSig.value;
              var useWorkerVal = workerVal != null && workerVal !== 0 && !isNaN(parseFloat(workerVal));
              merged.signals[wk] = {
                value: useWorkerVal ? workerVal : manualSig.value,
                unit:  workerSig.unit  || manualSig.unit,
                date:  workerSig.date  || manualSig.date,
                zone:  workerSig.zone  || manualSig.zone,
                live:  useWorkerVal && workerSig.live || false
              };
            }
            }
          }
          applyData(merged);
        })
        .catch(function() {
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
