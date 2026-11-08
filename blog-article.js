/* Live "signal now" box on blog articles.
   Needs signals-meta.js (window.SignycleMeta) and signals-loader.js, which
   fires `signalsLoaded` on load and again every couple of minutes, so
   render() must be safe to run repeatedly. */
(function() {
  var M = window.SignycleMeta;
  var box = document.getElementById('artLive');
  if (!M || !box) return;
  var T = M.THRESHOLDS, META = M.META, ZH = M.ZONE_HEX, ZL = M.ZONE_LABEL, fmt = M.fmt, esc = M.esc;
  var ids = (box.getAttribute('data-art-signals') || '').split(',').filter(function(id) { return id && META[id] && T[id]; });
  var PHASES = [[25, 'Deep BUY', '#00956e'], [45, 'Early Expansion', '#2f9e7a'], [65, 'Mid Cycle', '#64748b'], [80, 'Late Expansion', '#c26a00'], [101, 'Distribution', '#dc2626']];
  var rows = document.getElementById('artLiveRows');

  function track(id, v, zone) {
    var p = M.position(id, v), over = p.raw > 100, under = p.raw < 0;
    var dot = over || under
      ? '<span class="track-dot" style="left:' + p.x + '%;background:' + ZH[zone] + ';clip-path:polygon(' + (over ? '0 0,100% 50%,0 100%' : '100% 0,0 50%,100% 100%') + ');border:0;box-shadow:none;"></span>'
      : '<span class="track-dot" style="left:' + p.x + '%;background:' + ZH[zone] + ';"></span>';
    return '<div class="track" aria-hidden="true"><div class="track-bar">' +
      '<span style="width:18%;background:var(--buy-t);"></span><span style="width:' + (p.warn - 18) + '%;background:var(--neutral-t);"></span>' +
      '<span style="width:' + (82 - p.warn) + '%;background:var(--warn-t);"></span><span style="flex:1;background:var(--sell-t);"></span></div>' + dot + '</div>';
  }

  function row(id, s) {
    var v = parseFloat(s.value), z = ZH[s.zone] ? s.zone : 'neutral', m = META[id], t = T[id], f = M.freshness(s);
    var name = m.page ? '<a class="lc-name" href="' + m.page + '">' + esc(m.name) + '</a>' : '<span class="lc-name">' + esc(m.name) + '</span>';
    return '<div class="lc-row">' +
      '<div class="lc-top">' + name + '<span class="badge ' + z + '">' + ZL[z] + '</span></div>' +
      '<div class="lc-val">' + fmt(v, s.unit) + '<small>' + esc(M.unitLabel(s.unit)) + '</small></div>' +
      '<div class="sc-ctx">' + M.context(id, v, z) + '</div>' + track(id, v, z) +
      '<div class="lc-levels"><span>BUY &le; <b>' + fmt(t.buy, s.unit) + '</b></span><span>SELL &ge; <b>' + fmt(t.sell, s.unit) + '</b></span></div>' +
      '<div class="pos-meta' + (f.stale ? ' stale' : '') + '">' + (f.live ? '<span class="dot-live"></span>Live, checked about every 15 minutes' : esc(f.text.replace('Manual', 'Updated by hand')) + (f.stale ? ' &middot; may be out of date' : '')) + '</div>' +
      '</div>';
  }

  function render(d) {
    if (!d || !d.signals || !rows) return;
    var S = d.signals;
    var have = ids.filter(function(id) { return S[id] && S[id].value != null && !isNaN(parseFloat(S[id].value)); });
    if (have.length) {
      rows.innerHTML = have.map(function(id) { return row(id, S[id]); }).join('');
      return;
    }
    var score = d.cycleScore;
    if (score == null) return;
    var ph = PHASES.filter(function(p) { return score < p[0]; })[0] || PHASES[PHASES.length - 1];
    rows.innerHTML = '<div class="lc-row"><div class="lc-top"><a class="lc-name" href="where-are-we-in-the-cycle.html">Signycle cycle score</a></div>' +
      '<div class="lc-score"><b>' + score + '</b><span class="card-note">/100</span><span style="font-weight:700;color:' + ph[2] + ';">' + ph[1] + '</span></div>' +
      '<div class="sc-ctx">Combined reading of all tracked commodity, freight and macro signals.</div></div>';
  }

  document.addEventListener('signalsLoaded', function(e) { render(e.detail || window.SignycleData); });
  if (window.SignycleData && window.SignycleData.signals) render(window.SignycleData);
})();

function submitAlertSignup(e, emailId, btnId, msgId) {
  e.preventDefault();
  var btn = document.getElementById(btnId);
  var msg = document.getElementById(msgId);
  var emailEl = document.getElementById(emailId);
  var email = emailEl.value.trim();
  btn.disabled = true;
  msg.textContent = '';
  msg.className = 'alert-signup-msg';
  fetch('https://signycle-signals.fransbgn.workers.dev/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email })
  })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(res) {
      btn.disabled = false;
      if (res.status === 200) {
        msg.textContent = res.data.message === 'Already subscribed' ? 'You’re already on the list.' : 'Check your email to confirm your subscription.';
        msg.className = 'alert-signup-msg ok';
        emailEl.value = '';
      } else {
        msg.textContent = res.data.error || 'Something went wrong — please try again.';
        msg.className = 'alert-signup-msg err';
      }
    })
    .catch(function() {
      btn.disabled = false;
      msg.textContent = 'Network error — please try again.';
      msg.className = 'alert-signup-msg err';
    });
  return false;
}
