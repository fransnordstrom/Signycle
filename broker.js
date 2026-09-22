// Signycle Broker Box — geolocation + exchange aware
(function() {
  // ── BROKER DATABASE ──────────────────────────────────────────────────────
  // Format: { name, url, markets: ['global'|exchange codes], countries: ['all'|country codes] }
  var BROKERS = [
    // Global / multi-market
    { name: "Interactive Brokers", url: "https://www.interactivebrokers.com", markets: ["global"], countries: ["all"] },
    { name: "Saxo Bank",           url: "https://www.home.saxo",              markets: ["global"], countries: ["all"] },

    // Nordic
    { name: "Nordnet",  url: "https://www.nordnet.no",  markets: ["oslo","stockholm","copenhagen","helsinki","global"], countries: ["NO","SE","DK","FI"] },
    { name: "Avanza",   url: "https://www.avanza.se",   markets: ["stockholm","oslo","global"],                         countries: ["SE"] },
    { name: "Nordea",  url: "https://www.nordea.com/en/services/brokerage", markets: ["oslo","stockholm","copenhagen","helsinki","global"], countries: ["NO","SE","DK","FI"] },
    { name: "DNB Markets",    url: "https://www.dnb.no/markets",       markets: ["oslo"],  countries: ["NO"] },
    { name: "Pareto Securities", url: "https://www.paretosec.com",    markets: ["oslo"],  countries: ["NO"] },

    // German-speaking
    { name: "Flatex",    url: "https://www.flatex.de",    markets: ["frankfurt","european"], countries: ["DE","AT","CH"] },
    { name: "Comdirect", url: "https://www.comdirect.de", markets: ["frankfurt","european"], countries: ["DE"] },
    { name: "ING DiBa",  url: "https://www.ing.de",       markets: ["frankfurt","european"], countries: ["DE"] },
    { name: "Consorsbank", url: "https://www.consorsbank.de", markets: ["frankfurt","european"], countries: ["DE"] },

    // UK
    { name: "Hargreaves Lansdown", url: "https://www.hl.co.uk",    markets: ["london","global"], countries: ["GB"] },
    { name: "AJ Bell",             url: "https://www.ajbell.co.uk", markets: ["london","global"], countries: ["GB"] },
    { name: "Freetrade",           url: "https://www.freetrade.io", markets: ["london","us"],     countries: ["GB"] },

    // US
    { name: "Charles Schwab",  url: "https://www.schwab.com",        markets: ["nyse","nasdaq_us","global"], countries: ["US"] },
    { name: "Fidelity",        url: "https://www.fidelity.com",      markets: ["nyse","nasdaq_us","global"], countries: ["US"] },
    { name: "TD Ameritrade",   url: "https://www.tdameritrade.com",  markets: ["nyse","nasdaq_us","global"], countries: ["US"] },

    // Asia
    { name: "Tiger Brokers", url: "https://www.tigersecurities.com", markets: ["hkex","sse","szse","twse","krx","sgx","asx"], countries: ["SG","HK","AU","CN"] },
    { name: "Futu (moomoo)", url: "https://www.moomoo.com",          markets: ["hkex","sse","szse","nyse","nasdaq_us"],        countries: ["SG","HK","AU","US"] },
    { name: "DBS Vickers",   url: "https://www.dbsvickers.com",      markets: ["sgx","hkex","nyse"],                           countries: ["SG"] },
    { name: "CommSec",       url: "https://www.commsec.com.au",      markets: ["asx","global"],                                countries: ["AU"] },
  ];

  // ── EXCHANGE MAP: eyebrow text → exchange code ───────────────────────────
  var EXCHANGE_MAP = [
    [/oslo/i,           "oslo"],
    [/stockholm/i,      "stockholm"],
    [/helsinki/i,       "helsinki"],
    [/copenhagen/i,     "copenhagen"],
    [/frankfurt|xetra/i,"frankfurt"],
    [/london|lse/i,     "london"],
    [/nyse/i,           "nyse"],
    [/nasdaq.*us|nasdaq$/i, "nasdaq_us"],
    [/tsx|toronto/i,    "tsx"],
    [/asx|australia/i,  "asx"],
    [/euronext.*paris|paris/i, "paris"],
    [/euronext.*amsterdam|amsterdam/i, "amsterdam"],
    [/euronext.*brussels|brussels/i,   "brussels"],
    [/euronext.*dublin|dublin/i,       "dublin"],
    [/euronext.*lisboa|lisboa/i,       "lisbon"],
    [/bolsa.*madrid|madrid/i,          "madrid"],
    [/borsa.*milan|milano/i,           "milan"],
    [/swiss|six/i,      "swiss"],
    [/vienna|wiener/i,  "vienna"],
    [/warsaw/i,         "warsaw"],
    [/athens/i,         "athens"],
    [/istanbul|borsa istanbul/i, "istanbul"],
    [/hkex|hong kong/i, "hkex"],
    [/sse.*shanghai|shanghai/i, "sse"],
    [/szse.*shenzhen|shenzhen/i,"szse"],
    [/twse.*taiwan|taiwan/i,    "twse"],
    [/krx|korea/i,      "krx"],
    [/tokyo|tse/i,      "tokyo"],
    [/sgx|singapore/i,  "sgx"],
    [/tadawul|saudi/i,  "tadawul"],
    [/dubai|dfm/i,      "dfm"],
    [/egypt|egx/i,      "egx"],
    [/jse|south africa/i,"jse"],
    [/nse.*india|india/i,"nse"],
    [/b3|brazil/i,      "b3"],
    [/bmv|mexico/i,     "bmv"],
    [/bolsa.*santiago|santiago/i, "santiago"],
    [/bolsa.*lima|lima/i,         "lima"],
    [/bolsa.*colombia/i,          "colombia"],
    [/buenos aires/i,             "baires"],
  ];

  // ── MARKET GROUPS: exchange code → market category ───────────────────────
  var MARKET_GROUP = {
    oslo: "oslo", stockholm: "stockholm", helsinki: "helsinki", copenhagen: "copenhagen",
    frankfurt: "frankfurt", london: "london", nyse: "nyse", nasdaq_us: "nyse",
    tsx: "nyse", paris: "european", amsterdam: "european", brussels: "european",
    dublin: "european", lisbon: "european", madrid: "european", milan: "european",
    swiss: "european", vienna: "european", warsaw: "european", athens: "european",
    istanbul: "european", hkex: "hkex", sse: "hkex", szse: "hkex",
    twse: "hkex", krx: "hkex", tokyo: "hkex", sgx: "sgx", asx: "asx",
    tadawul: "global", dfm: "global", egx: "global", jse: "global",
    nse: "global", b3: "global", bmv: "global",
    santiago: "global", lima: "global", colombia: "global", baires: "global",
  };

  // ── DETECT EXCHANGE FROM PAGE ─────────────────────────────────────────────
  function detectExchange() {
    var eyebrow = document.querySelector('.eyebrow');
    var text = eyebrow ? eyebrow.textContent : document.title;
    for (var i = 0; i < EXCHANGE_MAP.length; i++) {
      if (EXCHANGE_MAP[i][0].test(text)) return EXCHANGE_MAP[i][1];
    }
    return "global";
  }

  // ── SELECT BROKERS: country + exchange ────────────────────────────────────
  function selectBrokers(countryCode, exchange) {
    var group = MARKET_GROUP[exchange] || "global";
    var scored = [];

    BROKERS.forEach(function(b) {
      var score = 0;
      // Country match
      var countryMatch = b.countries.indexOf("all") > -1 || b.countries.indexOf(countryCode) > -1;
      if (countryMatch) score += 3;
      // Market match
      var marketMatch = b.markets.indexOf("global") > -1 ||
                        b.markets.indexOf(exchange) > -1 ||
                        b.markets.indexOf(group) > -1;
      if (marketMatch) score += 2;
      // Only include if at least some relevance
      if (score > 0) scored.push({ broker: b, score: score });
    });

    // Sort by score desc, take top 4
    scored.sort(function(a, b) { return b.score - a.score; });
    return scored.slice(0, 4).map(function(s) { return s.broker; });
  }

  // ── RENDER BOX ────────────────────────────────────────────────────────────
  function renderBox(brokers, exchange) {
    var target = document.getElementById('broker-box');
    if (!target) return;

    var links = brokers.map(function(b) {
      return '<a href="' + b.url + '" target="_blank" rel="noopener nofollow" ' +
             'style="display:inline-flex;align-items:center;gap:0.3rem;background:#fff;' +
             'border:1.5px solid #d1d5db;border-radius:6px;padding:0.35rem 0.75rem;' +
             'font-size:0.78rem;font-weight:600;color:#0c1c2e;text-decoration:none;' +
             'transition:border-color 0.15s;white-space:nowrap;" ' +
             'onmouseover="this.style.borderColor=\'#00956e\'" ' +
             'onmouseout="this.style.borderColor=\'#d1d5db\'">' +
             b.name + ' ↗</a>';
    }).join('\n');

    target.innerHTML =
      '<div style="background:#f8fafb;border:1px solid #e5e7eb;border-radius:10px;' +
      'padding:1rem 1.2rem;margin:1.5rem 0;">' +
      '<div style="font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;' +
      'color:#6b7f78;margin-bottom:0.75rem;">🏦 Trade this stock</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;">' + links + '</div>' +
      '<div style="font-size:0.68rem;color:#9ca3af;margin-top:0.6rem;">' +
      'Not financial advice — do your own research. Broker availability varies by region.</div>' +
      '</div>';
  }

  // ── MAIN ──────────────────────────────────────────────────────────────────
  function init() {
    var exchange = detectExchange();
    // Fallback: show global brokers immediately
    renderBox(selectBrokers("", exchange), exchange);

    // Then try geolocation
    fetch('https://ipapi.co/json/')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var country = data.country_code || "";
        renderBox(selectBrokers(country, exchange), exchange);
      })
      .catch(function() {
        // Keep fallback — already rendered
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
