/**
 * Signycle Signals Worker v3.0
 * - Live prices from Yahoo Finance (Brent, WTI, Copper, Alum, Gold)
 * - Auto-calculates zone (buy/neutral/warn/sell) from thresholds
 * - Manual signals stored in KV, updated via admin app
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
  steel:   { buy: 30,    warnSell: 75,  sell: 94,    unit: '$/t'    },
  ironore: { buy: 60,    warnSell: 85,  sell: 100,   unit: '$/t'    },
  eur10y:  { buy: 1.5,   warnSell: 3.0, sell: 3.5,   unit: '%'      },
  defense: { buy: 2.0,   warnSell: 3.0, sell: 3.5,   unit: '% GDP'  },
  lithium: { buy: 12000, warnSell: 30000, sell: 40000, unit: '$/t'  },
  gold:    { buy: 1200,  warnSell: 2500, sell: 2800, unit: '$/oz'   },
  spread:  { buy: 0,     warnSell: 8,   sell: 12,    unit: '$/bbl'  },
  scfi:    { buy: 800,   warnSell: 2500, sell: 3500, unit: 'index'  },
  pctc:    { buy: 8000,  warnSell: 35000, sell: 45000, unit: '$/day'},
  rig:     { buy: 70,    warnSell: 88,  sell: 92,    unit: '%'      },
  pmi:     { buy: 48,    warnSell: 55,  sell: 60,    unit: 'index'  },
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
        body.lastUpdated = new Date().toISOString();
        await env.SIGNALS_KV.put('signals', JSON.stringify(body));
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404, headers: CORS });
  }
};
