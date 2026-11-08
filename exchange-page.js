/* Live zone column on exchange pages. Needs signals-meta.js and signals-loader.js;
   signalsLoaded fires repeatedly, so render() is idempotent. */
(function() {
  var M = window.SignycleMeta;
  if (!M) return;
  var ZH = M.ZONE_HEX, ZL = M.ZONE_LABEL, fmt = M.fmt, esc = M.esc;
  var rows = Array.prototype.slice.call(document.querySelectorAll('tr[data-sig]'));
  var sum = document.getElementById('exSummary'), bar = document.getElementById('exSeg');

  function render(d) {
    if (!d || !d.signals) return;
    var S = d.signals, c = { buy: 0, neutral: 0, warn: 0, sell: 0 }, n = 0;
    rows.forEach(function(tr) {
      var id = tr.getAttribute('data-sig'), s = S[id], cell = tr.querySelector('.ex-now');
      if (!cell) return;
      if (!s || s.value == null || isNaN(parseFloat(s.value))) { cell.innerHTML = '<span class="ex-na">No live value</span>'; return; }
      var z = ZH[s.zone] ? s.zone : 'neutral', f = M.freshness(s);
      c[z]++; n++;
      cell.innerHTML = '<span class="ex-val">' + fmt(parseFloat(s.value), s.unit) + '</span><span class="badge ' + z + '">' + ZL[z] + '</span>' +
        '<span class="ex-fresh' + (f.stale ? ' stale' : '') + '">' + (f.live ? 'Live' : esc(f.text.replace('Manual · ', ''))) + '</span>';
    });
    if (sum && n) {
      sum.innerHTML = 'Of the <b>' + n + '</b> stocks below with a tracked signal, <b>' + c.sell + '</b> follow a signal in the SELL zone, <b>' + c.warn +
        '</b> near sell, <b>' + c.neutral + '</b> neutral and <b>' + c.buy + '</b> in BUY.';
    }
    if (bar && n) {
      bar.innerHTML = ['buy', 'neutral', 'warn', 'sell'].filter(function(z) { return c[z]; }).map(function(z) {
        return '<div style="flex-grow:' + c[z] + ';background:' + ZH[z] + ';color:' + (z === 'warn' ? '#2b1a00' : '#fff') + ';" title="' + ZL[z] + ': ' + c[z] + '">' + c[z] + '</div>';
      }).join('');
    }
  }
  document.addEventListener('signalsLoaded', function(e) { render(e.detail || window.SignycleData); });
  if (window.SignycleData && window.SignycleData.signals) render(window.SignycleData);
})();
