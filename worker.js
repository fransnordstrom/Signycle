/**
 * Signycle Signals Worker v3.1
 * - Live prices from Yahoo Finance (Brent, WTI, Copper, Alum, Gold, Steel, Iron Ore, Lithium)
 * - Spread derived from live Brent/WTI, not entered manually
 * - Auto-calculates zone (buy/neutral/warn/sell) from thresholds
 * - Manual signals stored in KV, updated via admin app
 * - POST flags (but does not block) >3x value swings vs the previous stored value
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Signal thresholds — zone is calculated automatically from these
const THRESHOLDS = {
  brent:   { buy: 50,    warnSell: 95,  sell: 1,   unit: '$/bbl'  }, // TEMP: forces a sell-zone crossing to test alert emails end-to-end
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

async function getLivePrices() {
  const results = {};
  await Promise.all(
    Object.entries(LIVE_TICKERS).map(async ([id, cfg]) => {
      const raw = await fetchYahoo(cfg.ticker);
      if (raw !== null) {
        results[id] = Math.round(raw * cfg.multiply);
      }
    })
  );
  // Derive spread from the two live legs instead of trusting a separately
  // entered manual value, which could otherwise silently disagree with them.
  if (results.brent != null && results.wti != null) {
    results.spread = Math.round((results.brent - results.wti) * 100) / 100;
  }
  return results;
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

      // Fetch live prices
      const live = await getLivePrices();

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
// "just crossed into sell" and "just came back down out of it".
async function checkAlerts(env) {
  const live = await getLivePrices();
  const zones = {};
  for (const [id, price] of Object.entries(live)) {
    zones[id] = calcZone(id, price);
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

  if (crossings.length && env.RESEND_API_KEY && env.ALERT_EMAIL && env.ALERT_FROM) {
    await sendAlertEmail(env, crossings);
  }
}

async function sendAlertEmail(env, crossings) {
  const lines = crossings.map(function(c) {
    return c.id.toUpperCase() + ': ' + c.from + ' -> ' + c.to + ' zone (now ' + c.value + ' ' + c.unit + ')';
  });
  const subject = 'Signycle alert: ' + crossings.map(function(c) { return c.id; }).join(', ') + ' crossed zones';
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.ALERT_FROM,
        to: env.ALERT_EMAIL,
        subject: subject,
        text: lines.join('\n')
      })
    });
  } catch (e) {
    // Swallow — a failed send shouldn't crash the scheduled run. alertZones
    // is already updated, so this specific crossing won't re-fire; the next
    // real crossing will still be attempted normally.
  }
}
