/* Live "signal now" box on blog articles.
   Needs signals-meta.js (window.SignycleMeta) and signals-loader.js, which
   fires `signalsLoaded` on load and again every couple of minutes, so
   render() must be safe to run repeatedly. */
(function() {
  var M = window.SignycleMeta;
  var box = document.getElementById('artLive');
  if (!M || !box) return;
  var ids = (box.getAttribute('data-art-signals') || '').split(',').filter(function(id) { return id && M.META[id]; });
  var rows = document.getElementById('artLiveRows');
  if (!ids.length) { (box.closest('.art-live') || box).style.display = 'none'; return; }
  var foot = box.querySelector('.lc-foot');
  if (foot) foot.innerHTML = M.FOOT;

  function render(d) {
    if (!d || !d.signals || !rows || !ids.length) return;
    rows.innerHTML = ids.map(function(id) {
      return d.signals[id] ? M.card(id, d.signals[id]) : M.cardMissing(id, d.hidden && d.hidden[id]);
    }).join('');
  }

  document.addEventListener('signalsLoaded', function(e) { render(e.detail || window.SignycleData); });
  if (window.SignycleData && window.SignycleData.signals) render(window.SignycleData);
})();
