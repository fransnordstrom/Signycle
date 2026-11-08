/* Signycle signal page: today's value, position bar and (for live signals)
   price history. Needs /signals-meta.js first and a root element
   <div id="sp" data-sp-signal="ID"> (not data-signal: signals-loader.js overwrites those). Data comes from signals-loader.js. */
(function() {
  var root = document.getElementById('sp');
  if (!root || !window.SignycleMeta) return;
  var SIG = root.getAttribute('data-sp-signal');
  var M = window.SignycleMeta;
  var THRESHOLDS = M.THRESHOLDS, META = M.META, LIVE_IDS = M.LIVE_IDS;
  var ZONE_HEX = M.ZONE_HEX, ZONE_LABEL = M.ZONE_LABEL, MONTHS = M.MONTHS;
  var esc = M.esc, fmt = M.fmt, unitLabel = M.unitLabel;
  var HISTORY_API = 'https://signycle-signals.fransbgn.workers.dev/api/history';
  var DATA = null;
  var $ = function(id) { return document.getElementById(id); };
  var IS_LIVE = LIVE_IDS.indexOf(SIG) > -1;

  function renderNow() {
    var s = DATA.signals[SIG], t = THRESHOLDS[SIG];
    if (!s || s.value == null || isNaN(parseFloat(s.value))) return;
    var v = parseFloat(s.value), zone = ZONE_HEX[s.zone] ? s.zone : 'neutral', u = s.unit;
    $('spVal').innerHTML = fmt(v, u) + '<small>' + esc(unitLabel(u)) + '</small>';
    var b = $('spBadge'); b.className = 'badge ' + zone; b.textContent = ZONE_LABEL[zone];
    $('spCtx').textContent = M.context(SIG, v, zone);
    var p = M.position(SIG, v), over = p.raw > 100, under = p.raw < 0;
    var dot = over || under
      ? '<span class="track-dot" style="left:' + p.x + '%;background:' + ZONE_HEX[zone] + ';clip-path:polygon(' + (over ? '0 0,100% 50%,0 100%' : '100% 0,0 50%,100% 100%') + ');border:0;box-shadow:none;width:13px;height:14px;"></span>'
      : '<span class="track-dot" style="left:' + p.x + '%;background:' + ZONE_HEX[zone] + ';"></span>';
    $('spTrack').innerHTML = '<div class="track-bar">' +
      '<span style="width:18%;background:var(--buy-t);"></span>' +
      '<span style="width:' + (p.warn - 18) + '%;background:var(--neutral-t);"></span>' +
      '<span style="width:' + (82 - p.warn) + '%;background:var(--warn-t);"></span>' +
      '<span style="flex:1;background:var(--sell-t);"></span></div>' +
      '<span class="track-tick" style="left:18%;">BUY ' + fmt(t.buy, u) + '</span>' +
      '<span class="track-tick" style="left:82%;">SELL ' + fmt(t.sell, u) + '</span>' + dot;
    var f = M.freshness(s);
    var fr = $('spFresh');
    fr.className = 'pos-meta' + (f.stale ? ' stale' : '');
    fr.innerHTML = f.live ? '<span class="dot-live"></span>Live · checked about every 15 minutes'
      : esc(f.text.replace('Manual · ', 'Updated by hand · ')) + (f.stale ? ' · over ' + M.STALE_DAYS + ' days old' : '');
  }

  // ── History chart ────────────────────────────────────────────────────
  var histRange = '1m', histAll = [], histId = null, chartState = null;
  var RANGE_MS = { '1d': 864e5, '1w': 7 * 864e5, '1m': 30 * 864e5 };
  var RANGE_TXT = { '1d': 'the past day', '1w': 'the past week', '1m': 'the past month', all: 'all recorded history' };
  // The chart code is shared with live-signals.html, which has a signal
  // picker; here the (hidden) picker only ever holds this page's signal.
  // Only live signals have recorded history (and a chart on their page).
  var HAS_CHART = IS_LIVE && !!$('histCanvas');
  if (HAS_CHART) {
    var opt = document.createElement('option');
    opt.value = SIG; opt.textContent = META[SIG].name;
    $('histSignal').appendChild(opt);
  }
  document.querySelectorAll('[data-range]').forEach(function(b) {
    b.addEventListener('click', function() {
      histRange = b.dataset.range;
      document.querySelectorAll('[data-range]').forEach(function(x) { x.classList.toggle('on', x === b); });
      drawHistoryRange();
    });
  });

  function axisLabel(iso, spanMs) {
    var d = new Date(iso);
    if (spanMs <= 36 * 36e5) return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }
  function fullLabel(iso) {
    var d = new Date(iso);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC';
  }
  function histEmpty(msg) {
    $('histCanvas').style.display = 'none';
    $('histStripWrap').style.display = 'none';
    $('histNow').textContent = ''; $('histChg').textContent = '';
    $('histEmpty').textContent = msg; $('histEmpty').style.display = 'block';
    chartState = null;
  }

  function loadHistory() {
    var id = $('histSignal').value;
    histId = id;
    fetch(HISTORY_API + '?signal=' + encodeURIComponent(id) + '&limit=20000')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (histId !== id) return;
        histAll = (d && d.points) || [];
        if (histAll.length < 2) { histEmpty('Not enough recorded history yet for ' + META[id].name + '.'); return; }
        drawHistoryRange();
      })
      .catch(function() { if (histId === id) histEmpty('Couldn’t load history right now — please try again shortly.'); });
  }

  function drawHistoryRange() {
    if (histAll.length < 2) return;
    var pts = histAll;
    if (RANGE_MS[histRange]) {
      var cut = new Date(histAll[histAll.length - 1].recorded_at).getTime() - RANGE_MS[histRange];
      pts = histAll.filter(function(p) { return new Date(p.recorded_at).getTime() >= cut; });
    }
    if (pts.length < 2) { histEmpty('Not enough recorded history for this range — try a wider one.'); return; }
    $('histEmpty').style.display = 'none';
    $('histCanvas').style.display = 'block';
    $('histStripWrap').style.display = '';
    var unit = (DATA && DATA.signals[histId] && DATA.signals[histId].unit) || '';
    var first = pts[0].value, last = pts[pts.length - 1].value, zone = pts[pts.length - 1].zone;
    $('histNow').innerHTML = fmt(last, unit) + '<small>' + esc(unit) + '</small>' + (THRESHOLDS[histId] && ZONE_HEX[zone] ? ' <span class="badge ' + zone + '" style="vertical-align:middle;">' + ZONE_LABEL[zone] + '</span>' : '');
    // A percentage change of a value that can sit near or below zero
    // (spreads, yield curve) is meaningless, so show those in points.
    var txt;
    if (histId === 'spread' || histId === 'yieldCurve' || Math.abs(first) < 1e-9) {
      var dlt = last - first;
      txt = (dlt >= 0 ? '▲ +' : '▼ −') + Math.abs(dlt).toFixed(2) + (unit === '%' ? ' pts' : ' ' + unit);
    } else {
      var chg = (last / first - 1) * 100;
      txt = (chg >= 0 ? '▲ +' : '▼ −') + Math.abs(chg).toFixed(1) + '%';
    }
    $('histChg').textContent = txt + ' over ' + RANGE_TXT[histRange];
    $('histChg').style.color = 'var(--text)';
    chartState = { pts: pts, unit: unit, t: THRESHOLDS[histId] };
    drawChart(-1);
    drawZoneStrip($('zoneStripCanvas'), pts);
  }

  function niceTicks(mn, mx, n) {
    var step = (mx - mn) / n, mag = Math.pow(10, Math.floor(Math.log10(step))), r = step / mag;
    step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
    var out = [];
    for (var v = Math.ceil(mn / step) * step; v <= mx + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }

  function drawChart(hover) {
    var st = chartState; if (!st) return;
    var canvas = $('histCanvas'), dpr = window.devicePixelRatio || 1;
    var W = canvas.parentElement.clientWidth || 600, H = 220;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    var pad = { t: 12, r: 8, b: 26, l: 46 };
    var cw = W - pad.l - pad.r, ch = H - pad.t - pad.b, pts = st.pts, n = pts.length;
    var vals = pts.map(function(p) { return p.value; });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var span = (mx - mn) || Math.abs(mx) * 0.05 || 1;
    // Fit the data, and pull a threshold into view only if it's close by —
    // a BUY level half the chart away would flatten the line to nothing.
    var t = st.t, lo = mn - span * 0.15, hi = mx + span * 0.15;
    if (t) {
      [t.buy, t.warnSell, t.sell].forEach(function(v) {
        if (v > mx && v - mx < span * 0.6) hi = v + span * 0.1;
        if (v < mn && mn - v < span * 0.6) lo = v - span * 0.1;
      });
    }
    var rng = hi - lo || 1;
    function xp(i) { return pad.l + (n === 1 ? 0 : (i / (n - 1)) * cw); }
    function yp(v) { return pad.t + ch - ((v - lo) / rng) * ch; }
    ctx.clearRect(0, 0, W, H);
    if (t) {
      var bands = [[t.sell, Infinity, 'rgba(220,38,38,0.07)'], [t.warnSell, t.sell, 'rgba(217,119,6,0.08)'], [-Infinity, t.buy, 'rgba(0,149,110,0.08)']];
      bands.forEach(function(b) {
        var top = Math.max(lo, Math.min(hi, b[1])), bot = Math.max(lo, Math.min(hi, b[0]));
        if (top > bot) { ctx.fillStyle = b[2]; ctx.fillRect(pad.l, yp(top), cw, yp(bot) - yp(top)); }
      });
    }
    ctx.font = '10px IBM Plex Mono,monospace'; ctx.textAlign = 'right'; ctx.fillStyle = '#94a3b8';
    niceTicks(lo, hi, 4).forEach(function(v) {
      var y = Math.round(yp(v)) + 0.5;
      ctx.strokeStyle = '#eef2f0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
      ctx.fillText(fmt(v, st.unit).replace(/^\$|^NOK /, ''), pad.l - 6, y + 3);
    });
    if (t) {
      [[t.sell, 'SELL', '#dc2626'], [t.warnSell, 'NEAR SELL', '#c26a00'], [t.buy, 'BUY', '#00956e']].forEach(function(l) {
        if (l[0] < lo || l[0] > hi) return;
        var y = Math.round(yp(l[0])) + 0.5;
        ctx.strokeStyle = l[2]; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cw, y); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.textAlign = 'right'; ctx.fillStyle = l[2]; ctx.font = 'bold 9px IBM Plex Mono,monospace';
        ctx.fillText(l[1] + ' ' + fmt(l[0], st.unit), pad.l + cw - 2, y - 4);
      });
    }
    ctx.beginPath(); ctx.strokeStyle = '#0c1c2e'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    vals.forEach(function(v, i) { i ? ctx.lineTo(xp(i), yp(v)) : ctx.moveTo(xp(i), yp(v)); });
    ctx.stroke();
    var spanMs = new Date(pts[n - 1].recorded_at) - new Date(pts[0].recorded_at);
    var count = Math.min(Math.max(2, Math.floor(cw / 60)), 8), lastTxt = null;
    ctx.font = '10px IBM Plex Mono,monospace'; ctx.fillStyle = '#94a3b8';
    for (var li = 0; li < count; li++) {
      var idx = Math.round(li / (count - 1) * (n - 1)), txt = axisLabel(pts[idx].recorded_at, spanMs);
      if (txt === lastTxt) continue; lastTxt = txt;
      ctx.textAlign = li === 0 ? 'left' : li === count - 1 ? 'right' : 'center';
      ctx.fillText(txt, xp(idx), H - 8);
    }
    if (hover >= 0) {
      var hx = xp(hover), hy = yp(vals[hover]);
      ctx.strokeStyle = 'rgba(12,28,46,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(hx) + 0.5, pad.t); ctx.lineTo(Math.round(hx) + 0.5, pad.t + ch); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#0c1c2e'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    st.geom = { pad: pad, cw: cw, n: n, xp: xp, yp: yp };
  }

  var hTip = document.createElement('div');
  hTip.className = 'chart-tooltip';
  if (HAS_CHART) $('histCanvas').parentElement.appendChild(hTip);
  function chartHover(clientX) {
    var st = chartState; if (!st || !st.geom) return;
    var rect = $('histCanvas').getBoundingClientRect(), g = st.geom;
    var i = Math.round((clientX - rect.left - g.pad.l) / g.cw * (g.n - 1));
    i = Math.max(0, Math.min(g.n - 1, i));
    drawChart(i);
    var p = st.pts[i];
    hTip.textContent = fullLabel(p.recorded_at) + ' · ' + fmt(p.value, st.unit);
    hTip.style.left = Math.max(70, Math.min(rect.width - 70, g.xp(i))) + 'px';
    hTip.style.top = g.yp(p.value) + 'px';
    hTip.classList.add('show');
  }
  if (HAS_CHART) {
    $('histCanvas').addEventListener('mousemove', function(e) { chartHover(e.clientX); });
    $('histCanvas').addEventListener('touchmove', function(e) { if (e.touches[0]) chartHover(e.touches[0].clientX); }, { passive: true });
    ['mouseleave', 'touchend'].forEach(function(ev) {
      $('histCanvas').addEventListener(ev, function() { hTip.classList.remove('show'); drawChart(-1); });
    });
  }

  // Recorded zones are undebounced per-tick values; apply the same
  // confirm-on-second-tick rule as worker.js checkAlerts so single-tick
  // noise near a threshold doesn't render as a flicker of slivers.
  function confirmedSegments(points) {
    if (!points.length) return { segments: [], total: 0 };
    var accepted = [{ p: points[0], zone: points[0].zone || 'neutral' }];
    var confirmedZone = accepted[0].zone, pendingZone = null, pendingBuf = [];
    for (var i = 1; i < points.length; i++) {
      var p = points[i], zone = p.zone || 'neutral';
      if (zone === confirmedZone) { accepted.push({ p: p, zone: zone }); pendingZone = null; pendingBuf = []; }
      else if (zone === pendingZone) {
        pendingBuf.push(p);
        pendingBuf.forEach(function(pp) { accepted.push({ p: pp, zone: zone }); });
        confirmedZone = zone; pendingZone = null; pendingBuf = [];
      } else { pendingZone = zone; pendingBuf = [p]; }
    }
    var segments = [];
    accepted.forEach(function(a, idx) {
      var last = segments[segments.length - 1];
      if (last && last.zone === a.zone) { last.endIdx = idx; last.points.push(a.p); }
      else segments.push({ zone: a.zone, startIdx: idx, endIdx: idx, points: [a.p] });
    });
    return { segments: segments, total: accepted.length };
  }

  function drawZoneStrip(canvas, points) {
    var dpr = window.devicePixelRatio || 1;
    var W = canvas.parentElement.clientWidth || 600, H = 20, padL = 46, padR = 8;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    var res = confirmedSegments(points), n = res.total || 1, cw = W - padL - padR;
    function xf(i) { return padL + (i / n) * cw; }
    res.segments.forEach(function(seg) {
      var x0 = xf(seg.startIdx), x1 = xf(seg.endIdx + 1);
      ctx.fillStyle = ZONE_HEX[seg.zone] || ZONE_HEX.neutral;
      ctx.fillRect(x0 + 1, 0, Math.max(x1 - x0 - 2, 1), H);
    });
    canvas._seg = res.segments; canvas._n = n; canvas._padL = padL; canvas._cw = cw;
    if (canvas._bound) return;
    canvas._bound = true;
    var tt = $('zoneTooltip');
    canvas.addEventListener('mousemove', function(e) {
      var rect = canvas.getBoundingClientRect(), x = e.clientX - rect.left;
      var idx = Math.floor((x - canvas._padL) / canvas._cw * canvas._n);
      if (idx < 0 || idx >= canvas._n) { tt.classList.remove('show'); return; }
      var seg = canvas._seg.filter(function(s) { return idx >= s.startIdx && idx <= s.endIdx; })[0];
      if (!seg) return;
      var a = fullLabel(seg.points[0].recorded_at), b = fullLabel(seg.points[seg.points.length - 1].recorded_at);
      tt.textContent = ZONE_LABEL[seg.zone] + ' · ' + a + (a !== b ? ' – ' + b : '');
      tt.style.left = Math.max(90, Math.min(rect.width - 90, x)) + 'px'; tt.style.top = '0px';
      tt.classList.add('show');
    });
    canvas.addEventListener('mouseleave', function() { tt.classList.remove('show'); });
  }

  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() { if (chartState) { drawChart(-1); drawZoneStrip($('zoneStripCanvas'), chartState.pts); } }, 150);
  });

  var started = false;
  function render(d) {
    if (!d || !d.signals) return;
    DATA = d;
    renderNow();
    if (HAS_CHART && !started) { started = true; $('histSignal').value = SIG; loadHistory(); }
  }
  document.addEventListener('signalsLoaded', function(e) { render(e.detail || window.SignycleData); });
  if (window.SignycleData && window.SignycleData.signals) render(window.SignycleData);
})();
