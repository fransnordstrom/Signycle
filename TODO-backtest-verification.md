# backtest.html — price verification TODO

Created 2026-09-27. `backtest.html`'s trade table (`var TRADES` in the page's
`<script>`, and the matching `SIGNAL_SUMMARY` array right after it) currently
reads as **illustrative examples based on approximate historical price
levels — not independently verified** (see the hero copy and meta
description). That framing was applied because most of these numbers
couldn't be confirmed with free web search. Once we have access to real
historical price data (a paid API — e.g. Tiingo, EOD Historical Data,
Polygon.io, or a Bloomberg/Refinitiv terminal — or even careful manual
lookups on Yahoo Finance / Investing.com's historical-data pages), work
through this list, fix `TRADES` in `backtest.html`, then update the hero
copy / meta description back to a confident claim once every row checks out.

`buildStats()` (in the same script block) recomputes the four summary stat
cards straight from `TRADES`, and `SIGNAL_SUMMARY`'s `bestReturn`/`avgReturn`
are still hand-typed — recompute those by hand after editing `TRADES`.

## Already checked and fixed (no action needed)

- **Rheinmetall (RHM)** — buy price €98 (Feb 2022) confirmed close to real
  €96.8. Sell/current price updated to real €982 (as of 26 Sep 2026),
  return corrected to +902%. Worth a periodic refresh since it's an
  "Ongoing" trade with no fixed sell date — re-check the current price
  again whenever this list is next revisited.
- **Kongsberg Gruppen (KONGSBERG)** — sell/current price updated to
  split-adjusted NOK 1,610 (real NOK 321.90 as of 21 Sep 2026 × 5, for
  Kongsberg's 5-for-1 split in June 2025), return corrected to +475%.
  Same "Ongoing" caveat as Rheinmetall — the buy price (NOK 280, Feb 2022)
  itself was not independently re-verified, only the current price.
- **Frontline ticker** — was wrong sitewide ("FRONT"), fixed to the real
  ticker **FRO** (confirmed via search) in backtest.html, cycle-screener.html,
  stock-comparison.html, oslo-bors.html, hormuz-dashboard.html.
- **Equinor (EQNR)** — was structurally misplaced in `SIGNAL_SUMMARY`
  instead of `TRADES`; moved, no price data touched.

## Flagged discrepancies — check these first

- **Canadian Natural Resources (CNQ)**, TSX, CAD — site claims buy price
  **$17.2** for "Apr 2020". Real confirmed low was **$6.71 on 18 Mar 2020**
  — a ~2.5x gap. Could be a genuine site error, or a real partial recovery
  by whatever specific date in April was intended (oil prices were
  extremely volatile that month — WTI went briefly negative on 20 Apr
  2020). Needs the exact daily close for the intended April 2020 date.
- **Freeport-McMoRan (FCX)**, NYSE, USD — site claims buy price **$6.00**
  ("Mar 2020"). Real confirmed close was **$5.31 on 18 Mar 2020**, a ~13%
  gap — smaller than CNQ's, plausibly just a different day in March, but
  not confirmed either way.
- **ConocoPhillips (COP)**, NYSE, USD — site claims buy $26.5 / sell $118.0
  ("Apr 2020" / "Jun 2022"). Real confirmed extremes: low **$22.67 on 18
  Mar 2020**, high **$122.71 on 7 Jun 2022**. Site's numbers are close to
  but not exactly these extremes — consistent with picking a specific day
  rather than the exact low/high, but unconfirmed which day.
- **Borr Drilling (BORDRILL)**, listed here as Oslo Børs — site claims buy
  date "Apr 2020" and buy price $0.55. Real confirmed all-time low was
  **NOK 5.00 on 16 Mar 2020** (note: NOK, not USD, and mid-March not
  April — Borr is dual-listed Oslo/NYSE as BORR, so the currency/exchange
  actually being quoted needs to be pinned down before comparing prices).

## Fully unverified — no usable historical data found via web search

For each, web search returned only current/recent prices and general
company info, not the specific historical closes needed. All need a real
data source to check the buy price/date and sell price/date shown in
`TRADES`:

- **Golden Ocean (GOGL)**, Oslo Børs — buy Apr 2020 (NOK 2.8), sell Oct 2021
  (NOK 14.2). Note: GOGL is also Nasdaq-listed in USD with a different
  nominal share price (~$1.44–$7.10 over the same period per one search
  result) — confirm which listing/currency the site's numbers are meant
  to reflect before comparing.
- **International Seaways (INSW)**, NYSE, USD — buy Mar 2020 ($10.2), sell
  Jan 2022 ($28.4).
- **Boliden (BOL)**, Stockholm, SEK — buy Mar 2020 (185), sell Mar 2022
  (430).
- **KGHM**, Warsaw, PLN — buy Mar 2020 (58), sell Feb 2022 (192).
- **Teck Resources (TECK)**, TSX, CAD — buy Mar 2020 (11.2), sell Apr 2022
  (43.8).
- **Aker BP (AKRBP)**, Oslo Børs, NOK — buy Apr 2020 (16.4), sell Jun 2022
  (35.2).
- **Verbund (VERBUND)**, Vienna, EUR — buy Jan 2020 (45), sell Dec 2021
  (98).
- **Solaria (SOLARIA)**, Madrid, EUR — buy Mar 2020 (5.8), sell Dec 2021
  (28.4).
- **Mowi (MOWI)**, Oslo Børs, NOK — buy Nov 2018 (155), sell Sep 2021
  (215).
- **SalMar (SALM)**, Oslo Børs, NOK — buy Dec 2018 (310), sell Aug 2021
  (620).
- **Yara International (YARA)**, Oslo Børs, NOK — buy Jun 2020 (235), sell
  Mar 2022 (520).
- **Equinor (EQNR)**, Oslo Børs, NOK — buy Apr 2020 (115), sell Jun 2022
  (340). Also has 3 historical `cycles` entries (2009, 2016 OPEC cut,
  2020 COVID) worth checking if time allows.

Several rows also carry `cycles: [...]` — extra historical trade windows
shown on hover/expand (Frontline, Golden Ocean, Equinor). Same caveat
applies to those; lower priority than the primary buy/sell pair per row.
