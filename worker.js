/**
 * Signycle Signals Worker v3.4
 * - Live prices from Yahoo Finance (Brent, WTI, Copper, Alum, Gold, Steel, Iron Ore, Lithium)
 * - Spread derived from live Brent/WTI, not entered manually
 * - Auto-calculates zone (buy/neutral/warn/sell) from thresholds
 * - Manual signals stored in KV, updated via admin app
 * - POST flags (but does not block) >3x value swings vs the previous stored value
 * - v3.2: records one row per live signal to D1 (HISTORY_DB binding) on every
 *   Cron Trigger tick, and serves it back via GET /api/history?signal=X - a
 *   real, growing price history to eventually replace the illustrative chart
 *   data currently baked into the site's HTML. Inert (no-op, no errors)
 *   until HISTORY_DB is bound to this Worker in the dashboard.
 * - v3.3: alert emails (personal + public batch) are now styled HTML with
 *   branding, per-signal zone badges and links, and a CTA button - see
 *   buildAlertEmailHtml() - instead of a single plain-text sentence.
 * - v3.4: eur10y is now live too, sourced from the ECB's own Statistical
 *   Data Warehouse (free, no key, daily) instead of a manual KV value that
 *   had drifted 5 months stale. See fetchEurYield().
 * - v3.5: GET /api/signals now reads live prices from a KV cache refreshed
 *   only by the Cron Trigger (see refreshLiveCache/getCachedLivePrices),
 *   instead of calling Yahoo/ECB on every single page view. Caps external
 *   calls at a flat ~96/day regardless of traffic.
 * - v3.6: /api/subscribe is now double opt-in — it creates a pending entry
 *   and emails a confirm link (buildConfirmEmailHtml/sendConfirmationEmail)
 *   instead of adding the address immediately. sendPublicAlertEmails skips
 *   anyone explicitly confirmed:false; pre-existing subscribers (no
 *   `confirmed` field at all, since it didn't exist before) are treated as
 *   already consented and keep receiving alerts. New GET
 *   /api/confirm-subscription completes a pending signup. Previously anyone
 *   could enrol any email address with no verification.
 * - v3.7: yieldCurve (US Treasury 10Y-2Y spread) is now live too, sourced
 *   from FRED's public CSV export (free, no key) instead of the hand-typed
 *   "+0.4%" that sat on recession-tracker.html with no way to update itself.
 *   Deliberately has no THRESHOLDS buy/sell entry — unlike commodities,
 *   lower/negative is worse here, not higher, so it's excluded from the
 *   commodity zone/sellZoneCount system; recession-tracker.html computes
 *   its own risk read from the raw value client-side.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Signal thresholds — zone is calculated automatically from these
const THRESHOLDS = {
  brent:   { buy: 50,    warnSell: 95,  sell: 105,   unit: '$/bbl'  },
  wti:     { buy: 45,    warnSell: 88,  sell: 95,    unit: '$/bbl'  },
  copper:  { buy: 5000,  warnSell: 8500, sell: 9000, unit: '$/t'    },
  alum:    { buy: 1600,  warnSell: 2800, sell: 3200, unit: '$/t'    },
  gold:    { buy: 1200,  warnSell: 2500, sell: 2800, unit: '$/oz'   },
  bdi:     { buy: 900,   warnSell: 2500, sell: 3000, unit: 'pts'    },
  vlcc:    { buy: 15000, warnSell: 60000, sell: 75000, unit: '$/day'},
  lng:     { buy: 10000, warnSell: 60000, sell: 80000, unit: '$/day'},
  salmon:  { buy: 42,    warnSell: 75,  sell: 82,    unit: 'NOK/kg' },
  urea:    { buy: 230,   warnSell: 550, sell: 620,   unit: '$/t'    },
  // NOTE: recalibrated to real HRC $/t scale (old thresholds of 30/75/94 were
  // off by ~15x, so steel showed "sell" permanently regardless of price).
  // Estimate from typical 10yr US HRC range ($500-2000/t) — sanity-check before trusting.
  steel:   { buy: 700,   warnSell: 1150, sell: 1450,  unit: '$/t'    },
  ironore: { buy: 60,    warnSell: 85,  sell: 100,   unit: '$/t'    },
  eur10y:  { buy: 1.5,   warnSell: 3.0, sell: 3.5,   unit: '%'      },
  // Recession-only indicator, deliberately no buy/warn/sell: unlike every
  // other signal here, a LOWER (or negative) value is worse, not higher.
  // calcZone() always treats <=buy as good and >=sell as bad, which is
  // backwards for this one, so it's left with just a unit and always
  // resolves to 'neutral' — recession-tracker.html reads the raw value
  // itself and applies its own (clearly-labelled, non-official) risk read.
  yieldCurve: { unit: '%' },
  defense: { buy: 2.0,   warnSell: 3.0, sell: 3.5,   unit: '% GDP'  },
  lithium: { buy: 12000, warnSell: 30000, sell: 40000, unit: '$/t'  },
  spread:  { buy: 0,     warnSell: 8,   sell: 12,    unit: '$/bbl'  },
  scfi:    { buy: 800,   warnSell: 2500, sell: 3500, unit: 'index'  },
  pctc:    { buy: 8000,  warnSell: 35000, sell: 45000, unit: '$/day'},
  rig:     { buy: 70,    warnSell: 88,  sell: 92,    unit: '%'      },
  pmi:     { buy: 48,    warnSell: 55,  sell: 60,    unit: 'index'  },
  // Estimates only — no verified external benchmark, back-solved so today's
  // manual value lands in "neutral" (matches current site classification).
  // Please sanity-check against real reference ranges when you have them.
  nbsk:    { buy: 750,   warnSell: 1100, sell: 1300, unit: '$/t'    },
  flying:  { buy: 85,    warnSell: 115, sell: 130,   unit: 'index'  },
  wfe:     { buy: 80,    warnSell: 120, sell: 140,   unit: 'index'  },
};

// Display name + dedicated signal page for each id that can actually appear
// in an alert (i.e. every key getLivePrices() can produce - the 8 Yahoo-priced
// tickers, the ECB-sourced eur10y, plus the derived spread). wti and spread
// have no dedicated page of their own, so both link to the page that covers
// them together.
const SIGNAL_INFO = {
  brent:   { name: 'Brent Crude',    page: 'signal-brent-crude.html' },
  wti:     { name: 'WTI Crude',      page: 'compare-wti-brent.html' },
  copper:  { name: 'LME Copper',     page: 'signal-lme-copper.html' },
  alum:    { name: 'LME Aluminium',  page: 'signal-aluminium-price.html' },
  gold:    { name: 'Gold Price',     page: 'signal-gold-price.html' },
  steel:   { name: 'US HRC Steel',   page: 'signal-us-hrc-steel.html' },
  ironore: { name: 'Iron Ore',       page: 'signal-iron-ore-price.html' },
  lithium: { name: 'Lithium Carbonate', page: 'signal-lithium-carbonate.html' },
  spread:  { name: 'Brent-WTI Spread', page: 'compare-wti-brent.html' },
  eur10y:  { name: 'EUR 10Y Yield',  page: 'signal-eur-10y-rate.html' },
};

const ZONE_STYLE = {
  buy:     { label: 'BUY',       bg: '#e6f5f1', color: '#00956e' },
  neutral: { label: 'NEUTRAL',   bg: '#f0f4f2', color: '#475569' },
  warn:    { label: 'NEAR SELL', bg: '#fffbeb', color: '#d97706' },
  sell:    { label: 'SELL',      bg: '#fef2f2', color: '#dc2626' },
};

// Builds the HTML body for an alert email. unsubUrl is only passed for the
// public subscriber send (sendPublicAlertEmails) - the personal ALERT_EMAIL
// send has no subscription to cancel, so it's omitted there.
function buildAlertEmailHtml(crossings, unsubUrl) {
  const siteUrl = 'https://signycle.com';
  const cards = crossings.map(function(c) {
    const info = SIGNAL_INFO[c.id] || { name: c.id.toUpperCase(), page: 'live-signals.html' };
    const toStyle = ZONE_STYLE[c.to] || ZONE_STYLE.neutral;
    const fromLabel = (ZONE_STYLE[c.from] || {}).label || c.from.toUpperCase();
    return '' +
      '<tr><td style="padding:0 0 12px;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf9;border:1px solid #e2e8e5;border-radius:10px;">' +
          '<tr><td style="padding:16px 18px;">' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
              '<td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#0c1c2e;">' + info.name + '</td>' +
              '<td align="right"><span style="display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.04em;padding:3px 10px;border-radius:12px;background:' + toStyle.bg + ';color:' + toStyle.color + ';">' + toStyle.label + '</span></td>' +
            '</tr></table>' +
            '<div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#6b7f78;margin-top:6px;">Crossed from <strong>' + fromLabel + '</strong> zone</div>' +
            '<div style="font-family:\'Courier New\',monospace;font-size:22px;font-weight:700;color:#0c1c2e;margin-top:10px;">' + c.value + ' <span style="font-size:14px;font-weight:400;color:#94a3b8;">' + c.unit + '</span></div>' +
            '<a href="' + siteUrl + '/' + info.page + '" style="display:inline-block;margin-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#00956e;text-decoration:none;">View ' + info.name + ' signal &rarr;</a>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr>';
  }).join('');

  const unsubRow = unsubUrl
    ? '<a href="' + unsubUrl + '" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a> &middot; '
    : '';

  return '' +
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:24px 16px;background:#f0f4f2;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;">' +
          '<tr><td style="background:#0c1c2e;padding:22px 24px;">' +
            '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
              '<td style="padding-right:8px;"><div style="width:10px;height:10px;border-radius:50%;background:#00956e;"></div></td>' +
              '<td style="font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;">Signycle</td>' +
            '</tr></table>' +
            '<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">Signal Alert</div>' +
          '</td></tr>' +
          '<tr><td style="padding:24px;">' +
            '<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#334155;margin-bottom:16px;">' +
              (crossings.length === 1 ? 'A signal just crossed a threshold:' : crossings.length + ' signals just crossed a threshold:') +
            '</div>' +
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + cards + '</table>' +
            '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td style="border-radius:8px;background:#00956e;">' +
              '<a href="' + siteUrl + '/live-signals.html" style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">View All Live Signals &rarr;</a>' +
            '</td></tr></table>' +
          '</td></tr>' +
          '<tr><td style="background:#f8faf9;border-top:1px solid #e2e8e5;padding:16px 24px;">' +
            '<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;line-height:1.6;">' +
              unsubRow + 'For informational purposes only. Not financial advice.<br>' +
              '<a href="' + siteUrl + '" style="color:#94a3b8;">signycle.com</a>' +
            '</div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr></table>' +
    '</body></html>';
}

// Small plain-HTML message page shared by the confirm and unsubscribe links
// clicked from emails — no login, just a one-line outcome.
function renderMessagePage(msg) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Signycle</title><style>body{font-family:-apple-system,sans-serif;max-width:480px;margin:4rem auto;padding:0 1rem;text-align:center;color:#0c1c2e;}</style>' +
    '</head><body><h2>Signycle</h2><p>' + msg + '</p></body></html>';
}

// Builds the "confirm your subscription" email — same header branding as the
// alert email, just a single CTA instead of signal cards.
function buildConfirmEmailHtml(confirmUrl) {
  const siteUrl = 'https://signycle.com';
  return '' +
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:24px 16px;background:#f0f4f2;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;">' +
          '<tr><td style="background:#0c1c2e;padding:22px 24px;">' +
            '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
              '<td style="padding-right:8px;"><div style="width:10px;height:10px;border-radius:50%;background:#00956e;"></div></td>' +
              '<td style="font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#ffffff;">Signycle</td>' +
            '</tr></table>' +
            '<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:rgba(255,255,255,0.5);margin-top:4px;">Confirm your subscription</div>' +
          '</td></tr>' +
          '<tr><td style="padding:24px;">' +
            '<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;color:#334155;margin-bottom:18px;">' +
              'One more step — confirm this address to get an email whenever a Signycle signal crosses a threshold.' +
            '</div>' +
            '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#00956e;">' +
              '<a href="' + confirmUrl + '" style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Confirm Subscription &rarr;</a>' +
            '</td></tr></table>' +
          '</td></tr>' +
          '<tr><td style="background:#f8faf9;border-top:1px solid #e2e8e5;padding:16px 24px;">' +
            '<div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;line-height:1.6;">' +
              'Didn\'t request this? Just ignore this email — you won\'t be subscribed unless you click the link above.<br>' +
              '<a href="' + siteUrl + '" style="color:#94a3b8;">signycle.com</a>' +
            '</div>' +
          '</td></tr>' +
        '</table>' +
      '</td></tr></table>' +
    '</body></html>';
}

function calcZone(id, value) {
  var t = THRESHOLDS[id];
  if (!t) return 'neutral';
  var v = parseFloat(value);
  if (isNaN(v)) return 'neutral';
  if (v <= t.buy)      return 'buy';
  if (v >= t.sell)     return 'sell';
  if (v >= t.warnSell) return 'warn';
  return 'neutral';
}

// Yahoo Finance live tickers
const LIVE_TICKERS = {
  brent:  { ticker: 'BZ=F',  multiply: 1       },
  wti:    { ticker: 'CL=F',  multiply: 1       },
  copper: { ticker: 'HG=F',  multiply: 2204.62 }, // lbs → $/t
  alum:   { ticker: 'ALI=F', multiply: 1        }, // already quoted in $/t on COMEX
  gold:   { ticker: 'GC=F',  multiply: 1       },
  steel:   { ticker: 'HRC=F', multiply: 1    }, // already quoted in $/t (US Midwest HRC)
  ironore: { ticker: 'TIO=F', multiply: 1    }, // already quoted in $/t (62% Fe CFR China)
  lithium: { ticker: 'LTH=F', multiply: 1000 }, // Fastmarkets lithium hydroxide, $/kg → $/t
};

async function fetchYahoo(ticker) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
    );
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price ? parseFloat(price) : null;
  } catch (e) { return null; }
}

// Euro area 10Y government bond spot yield (AAA-rated), from the ECB's own
// Statistical Data Warehouse — free, no API key, updated daily. Replaces the
// manual eur10y entry, which drifted to 5 months stale before this existed.
async function fetchEurYield() {
  try {
    const res = await fetch(
      'https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y?lastNObservations=1&format=jsondata',
      { headers: { 'Accept': 'application/json' } }
    );
    const data = await res.json();
    const series = data?.dataSets?.[0]?.series;
    const firstSeries = series && Object.values(series)[0];
    const observations = firstSeries?.observations;
    const firstObs = observations && Object.values(observations)[0];
    const value = firstObs?.[0];
    return typeof value === 'number' ? value : null;
  } catch (e) { return null; }
}

// US Treasury 10Y-2Y yield curve spread, from FRED's public CSV export —
// free, no API key, updated daily. The classic recession-inversion signal:
// negative means the curve is inverted, which has historically preceded
// recessions by roughly 12-18 months. FRED marks missing days as "." —
// walk backwards from the latest row to find the last real observation.
async function fetchYieldCurve() {
  try {
    const res = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=T10Y2Y');
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    for (let i = lines.length - 1; i > 0; i--) {
      const parts = lines[i].split(',');
      const val = parts[1];
      if (val && val !== '.') return parseFloat(val);
    }
    return null;
  } catch (e) { return null; }
}

async function getLivePrices() {
  const results = {};
  await Promise.all([
    ...Object.entries(LIVE_TICKERS).map(async ([id, cfg]) => {
      const raw = await fetchYahoo(cfg.ticker);
      if (raw !== null) {
        results[id] = Math.round(raw * cfg.multiply);
      }
    }),
    (async () => {
      const yield10y = await fetchEurYield();
      if (yield10y !== null) {
        results.eur10y = Math.round(yield10y * 100) / 100;
      }
    })(),
    (async () => {
      const spread10y2y = await fetchYieldCurve();
      if (spread10y2y !== null) {
        results.yieldCurve = Math.round(spread10y2y * 100) / 100;
      }
    })(),
  ]);
  // Derive spread from the two live legs instead of trusting a separately
  // entered manual value, which could otherwise silently disagree with them.
  if (results.brent != null && results.wti != null) {
    results.spread = Math.round((results.brent - results.wti) * 100) / 100;
  }
  return results;
}

// Twice the 15-min Cron Trigger interval — if the cached prices are older
// than this, the cron has missed a run (or isn't configured), so a direct
// fetch is safer than serving stale data labeled "Live".
const LIVE_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// Runs the real Yahoo/ECB fetch and stores the result in KV, so GET
// /api/signals can serve it to every visitor without hitting those APIs
// itself. Called by the Cron Trigger every ~15 min (via checkAlerts), and
// as a self-healing fallback if that cache goes missing or stale.
async function refreshLiveCache(env) {
  const results = await getLivePrices();
  await env.SIGNALS_KV.put('liveSignalsCache', JSON.stringify({
    signals: results,
    fetchedAt: new Date().toISOString()
  }));
  return results;
}

// What GET /api/signals actually calls: reads the cron-refreshed KV cache
// instead of calling Yahoo/ECB/FRED directly on every page view. Previously
// every single request re-fetched all 11 live signals itself — fine at low
// traffic, but it meant page-load latency and Yahoo/ECB rate-limit exposure
// scaled with visitor count instead of staying flat.
async function getCachedLivePrices(env) {
  const cached = await env.SIGNALS_KV.get('liveSignalsCache', 'json');
  if (cached && cached.signals && cached.fetchedAt) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age < LIVE_CACHE_MAX_AGE_MS) {
      return cached.signals;
    }
  }
  return await refreshLiveCache(env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // ── GET /api/signals ─────────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/api/signals') {
      // Load manual data from KV
      const manual = await env.SIGNALS_KV.get('signals', 'json') || { signals: {} };

      // Read cron-refreshed live prices from KV (see getCachedLivePrices) —
      // does not call Yahoo/ECB itself except as a cold-start/self-heal fallback.
      const live = await getCachedLivePrices(env);

      // Merge: live prices override manual, zones calculated from thresholds
      const data = JSON.parse(JSON.stringify(manual)); // deep clone
      if (!data.signals) data.signals = {};

      // Apply live prices + auto-zone to live signals
      for (const [id, price] of Object.entries(live)) {
        if (!data.signals[id]) data.signals[id] = {};
        data.signals[id].value = price;
        data.signals[id].zone  = calcZone(id, price);
        data.signals[id].live  = true;
        data.signals[id].date  = 'Live';
        data.signals[id].unit  = THRESHOLDS[id]?.unit || '';
      }

      // Also recalculate zones for manual signals based on thresholds
      for (const [id, sig] of Object.entries(data.signals)) {
        if (!sig.live) {
          sig.zone = calcZone(id, sig.value);
        }
      }

      // Recalculate sellZoneCount from actual zones
      data.sellZoneCount = Object.values(data.signals)
        .filter(s => s.zone === 'sell' || s.zone === 'warn').length;

      data.liveUpdated = new Date().toISOString();

      return new Response(JSON.stringify(data), {
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        }
      });
    }

    // ── POST /api/signals ────────────────────────────────────────────────────
    if (request.method === 'POST' && url.pathname === '/api/signals') {
      const auth = request.headers.get('Authorization') || '';
      if (auth.replace('Bearer ', '') !== env.ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
      try {
        const body = await request.json();

        // Flag (but don't block) values that swing >3x vs the last stored
        // value — catches fat-finger / unit-conversion mistakes like the
        // aluminium and steel data errors found in this dataset previously.
        const warnings = [];
        const previous = await env.SIGNALS_KV.get('signals', 'json');
        if (previous && previous.signals && body.signals) {
          for (const [id, sig] of Object.entries(body.signals)) {
            const prevVal = previous.signals[id] && previous.signals[id].value;
            const newVal = sig && sig.value;
            if (prevVal && newVal && (newVal / prevVal > 3 || newVal / prevVal < 1 / 3)) {
              warnings.push(`${id}: ${prevVal} -> ${newVal} (>3x change, please double-check)`);
            }
          }
        }

        body.lastUpdated = new Date().toISOString();
        await env.SIGNALS_KV.put('signals', JSON.stringify(body));
        return new Response(JSON.stringify({ ok: true, warnings }), {
          headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
    }

    // ── POST /api/subscribe ──────────────────────────────────────────────────
    // Public — anyone can request to be added to the alert subscriber list.
    // Double opt-in: this only creates a *pending* entry and emails a
    // confirmation link. Nobody actually receives alert emails (see
    // sendPublicAlertEmails' confirmed-only filter) until that link is
    // clicked — otherwise a stranger could enrol someone else's address with
    // no way for them to consent or even know it happened.
    if (request.method === 'POST' && url.pathname === '/api/subscribe') {
      try {
        const body = await request.json();
        const email = (body.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return new Response(JSON.stringify({ error: 'Invalid email address' }), {
            status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
          });
        }
        const subs = await env.SIGNALS_KV.get('subscribers', 'json') || [];
        let entry = subs.find(function(s) { return s.email === email; });
        if (entry && entry.confirmed) {
          return new Response(JSON.stringify({ ok: true, message: 'Already subscribed' }), {
            headers: { ...CORS, 'Content-Type': 'application/json' }
          });
        }
        if (!entry) {
          entry = { email: email, token: crypto.randomUUID(), subscribedAt: new Date().toISOString(), confirmed: false };
          subs.push(entry);
          await env.SIGNALS_KV.put('subscribers', JSON.stringify(subs));
        }
        // Re-sends on a repeat signup for an unconfirmed address too — covers
        // someone who missed or lost the first email.
        let emailResult = null;
        if (env.RESEND_API_KEY && env.ALERT_FROM) {
          const confirmUrl = 'https://signycle-signals.fransbgn.workers.dev/api/confirm-subscription?email=' +
            encodeURIComponent(entry.email) + '&token=' + entry.token;
          emailResult = await sendConfirmationEmail(env, entry.email, confirmUrl);
        }
        return new Response(JSON.stringify({ ok: true, message: 'Check your email to confirm your subscription', emailSent: !!(emailResult && emailResult.ok) }), {
          headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
    }

    // ── GET /api/confirm-subscription ────────────────────────────────────────
    // Public, token-protected — clicked from the confirmation email. Flips a
    // pending signup to confirmed so it's actually included in future alert
    // sends. Idempotent: confirming an already-confirmed link just re-shows
    // the success page instead of erroring.
    if (request.method === 'GET' && url.pathname === '/api/confirm-subscription') {
      const email = (url.searchParams.get('email') || '').trim().toLowerCase();
      const token = url.searchParams.get('token') || '';
      const subs = await env.SIGNALS_KV.get('subscribers', 'json') || [];
      const idx = subs.findIndex(function(s) { return s.email === email && s.token === token; });
      if (idx === -1) {
        return new Response(renderMessagePage('This confirmation link is invalid or has expired.'), {
          headers: { ...CORS, 'Content-Type': 'text/html' }
        });
      }
      subs[idx].confirmed = true;
      await env.SIGNALS_KV.put('subscribers', JSON.stringify(subs));
      return new Response(renderMessagePage('You’re subscribed — you’ll get an email whenever a signal crosses a threshold.'), {
        headers: { ...CORS, 'Content-Type': 'text/html' }
      });
    }

    // ── GET /api/unsubscribe ─────────────────────────────────────────────────
    // Public, token-protected — clicked from an email link, so it returns a
    // plain HTML page rather than JSON, and needs no login: the per-subscriber
    // token (issued at signup, not derived from a shared secret) is the auth.
    if (request.method === 'GET' && url.pathname === '/api/unsubscribe') {
      const email = (url.searchParams.get('email') || '').trim().toLowerCase();
      const token = url.searchParams.get('token') || '';
      const subs = await env.SIGNALS_KV.get('subscribers', 'json') || [];
      const idx = subs.findIndex(function(s) { return s.email === email && s.token === token; });
      if (idx === -1) {
        return new Response(renderMessagePage('This link is invalid or you’re already unsubscribed.'), {
          headers: { ...CORS, 'Content-Type': 'text/html' }
        });
      }
      subs.splice(idx, 1);
      await env.SIGNALS_KV.put('subscribers', JSON.stringify(subs));
      return new Response(renderMessagePage('You’ve been unsubscribed from Signycle alerts.'), {
        headers: { ...CORS, 'Content-Type': 'text/html' }
      });
    }

    // ── GET /api/history ─────────────────────────────────────────────────────
    // Returns real recorded price history for one signal, populated by the
    // Cron Trigger every ~15 minutes via recordHistory() below. Only exists
    // from whenever HISTORY_DB was bound onward — there is no backfill for
    // dates before that, unlike the illustrative chart data baked into the
    // site's HTML which claims a multi-year history it never actually
    // measured.
    if (request.method === 'GET' && url.pathname === '/api/history') {
      if (!env.HISTORY_DB) {
        return new Response(JSON.stringify({ error: 'HISTORY_DB not bound' }), {
          status: 503, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
      const signal = url.searchParams.get('signal');
      if (!signal) {
        return new Response(JSON.stringify({ error: 'Missing ?signal= parameter' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10) || 500, 2000);
      const rows = await env.HISTORY_DB.prepare(
        'SELECT value, zone, recorded_at FROM signal_history WHERE signal_id = ? ORDER BY recorded_at DESC LIMIT ?'
      ).bind(signal, limit).all();
      return new Response(JSON.stringify({
        signal: signal,
        unit: THRESHOLDS[signal]?.unit || '',
        points: (rows.results || []).reverse()
      }), {
        headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }
      });
    }

    // ── GET /api/check-alerts (debug) ───────────────────────────────────────
    // Manually runs the same logic as the Cron Trigger and returns exactly
    // what happened, instead of the silent scheduled() path. Auth-protected
    // since it can send a real email and reveals whether secrets are set.
    if (request.method === 'GET' && url.pathname === '/api/check-alerts') {
      const auth = request.headers.get('Authorization') || '';
      const pw = auth.replace('Bearer ', '') || url.searchParams.get('pw') || '';
      if (pw !== env.ADMIN_PASSWORD) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
      const result = await checkAlerts(env);
      return new Response(JSON.stringify(result, null, 2), {
        headers: { ...CORS, 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404, headers: CORS });
  },

  // Cron Trigger (configure in dash.cloudflare.com -> this Worker -> Settings
  // -> Triggers -> Cron Triggers, e.g. every 15 minutes: */15 * * * *).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAlerts(env));
  }
};

// Emails env.ALERT_EMAIL via Resend whenever a live signal's zone actually
// changes (buy/neutral/warn/sell) vs the last scheduled check — covers both
// "just crossed into sell" and "just came back down out of it". Returns a
// diagnostic object so both the Cron Trigger and the debug endpoint can see
// exactly what happened, instead of failures disappearing silently.
async function checkAlerts(env) {
  // Refreshes the KV cache that GET /api/signals reads from — this is the
  // only place that should call Yahoo/ECB on the normal 15-min cron cadence.
  const live = await refreshLiveCache(env);
  const zones = {};
  for (const [id, price] of Object.entries(live)) {
    zones[id] = calcZone(id, price);
  }

  if (env.HISTORY_DB) {
    await recordHistory(env, live, zones);
  }

  const prevZones = await env.SIGNALS_KV.get('alertZones', 'json') || {};
  const crossings = [];
  for (const [id, zone] of Object.entries(zones)) {
    const prevZone = prevZones[id];
    if (prevZone && prevZone !== zone) {
      crossings.push({ id: id, from: prevZone, to: zone, value: live[id], unit: THRESHOLDS[id]?.unit || '' });
    }
  }

  // Store the new state regardless of whether we alert, so a failed email
  // send doesn't cause the same crossing to be re-detected next run.
  await env.SIGNALS_KV.put('alertZones', JSON.stringify(zones));

  const envCheck = {
    RESEND_API_KEY: !!env.RESEND_API_KEY,
    ALERT_EMAIL: !!env.ALERT_EMAIL,
    ALERT_FROM: !!env.ALERT_FROM
  };

  let emailResult = null;
  if (crossings.length && env.RESEND_API_KEY && env.ALERT_EMAIL && env.ALERT_FROM) {
    emailResult = await sendAlertEmail(env, crossings);
  }

  let publicEmailResult = null;
  if (crossings.length && env.RESEND_API_KEY && env.ALERT_FROM) {
    publicEmailResult = await sendPublicAlertEmails(env, crossings);
  }

  return {
    prevZones: prevZones,
    newZones: zones,
    crossings: crossings,
    envVarsPresent: envCheck,
    historyRecorded: !!env.HISTORY_DB,
    emailAttempted: !!emailResult,
    emailResult: emailResult,
    publicEmailResult: publicEmailResult
  };
}

// Appends one row per live signal to D1 (HISTORY_DB binding) so charts can
// eventually be built from real recorded prices instead of the illustrative
// arrays currently baked into the site's HTML. Runs once per Cron Trigger
// tick (~every 15 min), not on every /api/signals page-load request, so the
// table grows at a fixed, predictable rate regardless of site traffic.
async function recordHistory(env, live, zones) {
  const now = new Date().toISOString();
  const stmt = env.HISTORY_DB.prepare(
    'INSERT INTO signal_history (signal_id, value, zone, recorded_at) VALUES (?, ?, ?, ?)'
  );
  const batch = Object.entries(live).map(([id, value]) =>
    stmt.bind(id, value, zones[id] || 'neutral', now)
  );
  try {
    await env.HISTORY_DB.batch(batch);
  } catch (e) {
    // Never let history logging break alerting — it's a best-effort addition.
    console.log('[Signycle] recordHistory failed:', e.message);
  }
}

async function sendAlertEmail(env, crossings) {
  const lines = crossings.map(function(c) {
    return c.id.toUpperCase() + ': ' + c.from + ' -> ' + c.to + ' zone (now ' + c.value + ' ' + c.unit + ')';
  });
  const subject = 'Signycle alert: ' + crossings.map(function(c) { return c.id; }).join(', ') + ' crossed zones';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.ALERT_FROM,
        to: env.ALERT_EMAIL,
        subject: subject,
        text: lines.join('\n'),
        html: buildAlertEmailHtml(crossings)
      })
    });
    const bodyText = await res.text();
    return { status: res.status, ok: res.ok, body: bodyText };
  } catch (e) {
    return { error: e.message };
  }
}

// Sends the "click to confirm" email for a new/repeat pending signup.
async function sendConfirmationEmail(env, email, confirmUrl) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.ALERT_FROM,
        to: email,
        subject: 'Confirm your Signycle subscription',
        text: 'Confirm your Signycle alert subscription: ' + confirmUrl,
        html: buildConfirmEmailHtml(confirmUrl)
      })
    });
    const bodyText = await res.text();
    return { status: res.status, ok: res.ok, body: bodyText };
  } catch (e) {
    return { error: e.message };
  }
}

// Blasts the public subscriber list via Resend's batch endpoint. This can't
// use a single bcc'd email like sendAlertEmail does, because each recipient
// needs their OWN unsubscribe link (with their own token) embedded in the
// body — the batch endpoint supports different content per recipient in one
// API call, up to 100 emails per request, so we chunk into groups of 100.
async function sendPublicAlertEmails(env, crossings) {
  // Only ever send to addresses that clicked the confirmation link — a
  // pending signup someone else entered by mistake (or maliciously) must
  // never actually receive mail. Subscribers from before double opt-in
  // existed have no `confirmed` field at all (never `false`) — they already
  // consented under the old flow, so they're grandfathered in rather than
  // silently dropped from alerts by this change.
  const subs = (await env.SIGNALS_KV.get('subscribers', 'json') || []).filter(function(s) { return s.confirmed !== false; });
  if (!subs.length) return { subscriberCount: 0 };

  const lines = crossings.map(function(c) {
    return c.id.toUpperCase() + ': ' + c.from + ' -> ' + c.to + ' zone (now ' + c.value + ' ' + c.unit + ')';
  }).join('\n');
  const subject = 'Signycle alert: ' + crossings.map(function(c) { return c.id; }).join(', ') + ' crossed zones';

  const batches = [];
  for (let i = 0; i < subs.length; i += 100) {
    const chunk = subs.slice(i, i + 100);
    const items = chunk.map(function(s) {
      const unsubUrl = 'https://signycle-signals.fransbgn.workers.dev/api/unsubscribe?email=' +
        encodeURIComponent(s.email) + '&token=' + s.token;
      return {
        from: env.ALERT_FROM,
        to: s.email,
        subject: subject,
        text: lines + '\n\nUnsubscribe: ' + unsubUrl,
        html: buildAlertEmailHtml(crossings, unsubUrl)
      };
    });
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(items)
      });
      const bodyText = await res.text();
      batches.push({ status: res.status, ok: res.ok, count: chunk.length, body: bodyText });
    } catch (e) {
      batches.push({ error: e.message, count: chunk.length });
    }
  }

  return { subscriberCount: subs.length, batches: batches };
}
