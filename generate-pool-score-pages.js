#!/usr/bin/env node

/**
 * Static scored pool pages (W1, docs/seo-turnaround-plan-2026-10.md).
 * Writes pools/<slug>.html (EN) and ko/pools/<slug>.html (KO) for the top
 * pools by TVL that clear a hard quality gate, e.g. /pools/aave-v3-usdc-base:
 * live APY, 30-day mean, base/reward split, the DeFi Score pillars,
 * the 14-day forecast band, a static inline-SVG APY history, what produces the
 * yield, who can access it, withdrawal notes, risks and ONE primary CTA into
 * the Decision Terminal (`/?pool=<uuid>`, which stays untouched).
 *
 * ELIGIBILITY (hard gate): TVL >= W1_MIN_TVL_USD, >= W1_MIN_HISTORY_POINTS of
 * history, a defiScore, a forecast, and not anomalous (isAnomalousApy /
 * APY_SANITY_LIMIT reused from generate-token-pages.js, never re-implemented),
 * and live APY and 30-day mean APY both >= W1_MIN_APY_PCT (a real yield; feed
 * gaps excluded).
 * Eligible pools are ranked by TVL desc and the first --limit (default
 * W1_PAGE_LIMIT = 100, the plan's kill-switch first tranche) get a page. No
 * page is written for any other pool, and a previously generated page that
 * drops out of the set is deleted on regeneration (only files carrying this
 * generator's marker; the pools/*.md and pools/*.json twins written by
 * generate-pool-pages.js are never touched).
 *
 * RATING LABELS: the snapshot also carries a letter rating (AAA/AA/A/...). The
 * plan flags that vocabulary as an unresolved legal decision, so it is NEVER
 * rendered here: pages show "Score 91.6 / 100" and the four pillar bars only.
 *
 * Every number comes from data/pools-snapshot.json (+ data/history/*.json for
 * the chart) through the shared en-US formatters. Nothing is hard-coded.
 *
 * Usage:
 *   node generate-pool-score-pages.js                 # 100 pages, EN + KO
 *   node generate-pool-score-pages.js --limit 300
 *   node generate-pool-score-pages.js --out pools --no-sitemap
 */

const fs = require('fs');
const path = require('path');
const tp = require('./generate-token-pages.js');
// Node-only i18n layer (en/ko from translations.js + pt/es dictionaries); the
// browser bundle is untouched.
const { createTranslationFunction } = require('./i18n');
const {
  LANGUAGES, LANG_CODES, getLanguage, normalizeLang, langPath, langUrl, langDir
} = require('./languages.js');
const { PERMISSIONED_PROJECT_LIST } = require('./permissioned-projects.js');
const { assignPoolSlugs, slugify, MANIFEST_REL_PATH } = require('./pool-page-links.js');

const {
  SITE_URL, isAnomalousApy, poolTotalApy, formatUsd, formatApy, escapeHtml,
  renderAnalyticsBootstrap, renderFontPreloadLinks, renderHreflangLinks,
  renderDatasetJsonLd, toIsoDate, withSrc, OG_FALLBACK_REL_PATH,
  renderLanguageSwitcher, renderLangSwitchStyle, renderSitemapAlternates, neutralPathOfLoc,
  SITEMAP_URLSET_OPEN, SITEMAP_URLSET_OPEN_XHTML
} = tp;

const ROOT = __dirname;

// --- tunables (named, never inline literals) --------------------------------
const W1_PAGE_LIMIT = 100;            // first tranche (plan: 100 first, 300 later)
const W1_MIN_TVL_USD = 10000000;      // plan: TVL >= $10M
const W1_MIN_HISTORY_POINTS = 30;     // plan: >= 30 days of history
// Yield floor, in APY percentage points. These pages target "[protocol] [token]
// apy/yield" queries; a position paying under 0.5% (Morpho collateral markets,
// BTC/LST supply on Aave/Spark/Compound, ...) is not a yield product for that
// query, and the DeFi Score rates a flat 0% as "stable", which would rank it
// highly. app.js NO_SUPPLY_YIELD_EPSILON (0.01) is a zero test, not a usefulness
// floor, so it is deliberately not reused. PAGE-SELECTION rule only: not a trust
// rail (APY_SANITY_LIMIT and the TVL floor are untouched, app behaviour unchanged).
const W1_MIN_APY_PCT = 0.5;
const HISTORY_DAYS = 30;              // chart window
const SIMILAR_POOLS = 4;              // "Similar pools" links per page
const TITLE_MAX_CHARS = 60;
const FLAT_SERIES_EPS = 1e-9;        // |max - min| below this = a flat series (no fan to draw)
const FLAT_MIN_PAD = 0.2;             // flat chart: half-window in APY points, at least...
const FLAT_PAD_RATIO = 0.05;          // ...or this share of the value
const FORECAST_FLAT_BAND = 0.05;      // |p50/current - 1| below this reads "roughly flat"
const REWARD_SHARE_FLAG = 0.3;        // reward share of total APY that raises the decay flag
const TVL_TREND_FLAG = 0.25;          // mirrors PoolDetail.js: |kpis.tvlTrend| >= 0.25 is a meaningful move
const VOLATILITY_RATIO_FLAG = 0.2;    // mirrors planner.js "steady" test: stdev/APY above this is volatile
const MIN_POINTS_FOR_VOLATILITY = 7;  // mirrors planner.js (hp >= 7)
const GENERATOR_MARKER = '<!-- generated:pool-score-pages -->';

/** DeFi Score pillar NAMES. Per-pillar values render as a TIER (High / Medium /
 *  Low) from the scoring engine's `defiScore.pillarsTier`, never a number
 *  (owner decision 2026-10-26); when absent only the names render. No weights
 *  or maxima live in public code (owner decision 2026-10-25). */
const PILLAR_TIER_LEVEL = { High: 3, Medium: 2, Low: 1 };
const SCORE_PILLARS = [
  { key: 'stability', labelKey: 'pspPillarStability' },
  { key: 'sustainability', labelKey: 'pspPillarSustainability' },
  { key: 'stickiness', labelKey: 'pspPillarStickiness' },
  { key: 'liquidity', labelKey: 'pspPillarLiquidity' }
];

// --- small formatters (en-US pinned) ----------------------------------------
function fmtNum(n, digits) {
  return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtScore(n) { return fmtNum(n, 1); }
function fmtSignedPct(frac) {
  return (Number(frac) * 100).toLocaleString('en-US', { maximumFractionDigits: 1, signDisplay: 'always' }) + '%';
}
function fmtSharePct(frac) {
  return (Number(frac) * 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '%';
}

/** "aave-v3" -> "Aave V3", "ether.fi-stake" -> "Ether.fi Stake". */
function displayName(project) {
  return String(project || '').split('-').filter(Boolean).map(w =>
    /^v\d+(\.\d+)?$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// --- eligibility + selection -------------------------------------------------
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

function isEligibleScoredPool(p) {
  if (!p || !p.pool || !isNum(p.tvlUsd) || p.tvlUsd < W1_MIN_TVL_USD) return false;
  if (!p.kpis || !(p.kpis.historyPoints >= W1_MIN_HISTORY_POINTS)) return false;
  const ds = p.defiScore;
  if (!ds || !isNum(ds.score)) return false;
  const f = p.forecast;
  if (!f || !isNum(f.p10) || !isNum(f.p50) || !isNum(f.p90)) return false;
  if (isAnomalousApy(p)) return false; // trust rail
  return hasMeaningfulYield(p);
}

/**
 * Yield floor on BOTH the live total APY (apyBase + apyReward, poolTotalApy)
 * and the 30-day mean. Requiring both also covers upstream feed gaps: a pool
 * whose live APY reads ~0 while its 30-day mean is healthy (e.g. a Centrifuge
 * pool normally at ~4%) is excluded because today's number is not trustworthy
 * and a page showing 0.00% would misstate its yield. The reverse (healthy live,
 * ~0 mean) is a one-off spike, also excluded. Such a pool requalifies
 * automatically on the first regeneration where both numbers clear the floor.
 */
function hasMeaningfulYield(p) {
  const live = poolTotalApy(p);
  return isNum(live) && live >= W1_MIN_APY_PCT &&
    isNum(p.apyMean30d) && p.apyMean30d >= W1_MIN_APY_PCT;
}

/** Eligible pools by TVL desc (uuid tie-break), capped at `limit` (0 = no cap). */
function selectPoolPages(pools, limit) {
  const cap = (limit == null || Number.isNaN(limit)) ? W1_PAGE_LIMIT : limit;
  const eligible = (pools || []).filter(isEligibleScoredPool).sort((a, b) =>
    b.tvlUsd - a.tvlUsd || String(a.pool).localeCompare(String(b.pool)));
  return { eligibleCount: eligible.length, selected: cap > 0 ? eligible.slice(0, cap) : eligible };
}

// --- history / chart ---------------------------------------------------------
function loadHistory(dir) {
  try {
    return fs.readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map(f => {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { date: j.date || f.replace('.json', ''), pools: j.pools || {} };
    });
  } catch (e) { return []; }
}

/** [{date, apy}] for the pool over the last HISTORY_DAYS day-files. */
function seriesFor(uuid, histories) {
  return histories.slice(-HISTORY_DAYS)
    .map(h => ({ date: h.date, apy: h.pools[uuid] && h.pools[uuid][0] }))
    .filter(pt => isNum(pt.apy));
}

function f1(n) { return n.toFixed(1); }

/**
 * Static inline SVG: observed APY line + forecast fan. No JS; colours come from
 * --ui-* tokens through classes (see CSS), so light/dark follow the page theme.
 */
function renderApyChartSvg(pool, series, t, titleId) {
  const W = 640, H = 280, ml = 64, mr = 16, mt = 16, mb = 40;
  const pw = W - ml - mr, ph = H - mt - mb;
  const f = pool.forecast;
  const horizon = isNum(f.horizonDays) ? f.horizonDays : 14;
  const cur = poolTotalApy(pool);
  const pts = series.length ? series : [{ date: '', apy: cur }];
  const n = pts.length;
  const lastApy = pts[n - 1].apy;
  const traj = Array.isArray(f.trajectory) ? f.trajectory.filter(isNum) : [];
  const ys = pts.map(p => p.apy).concat([f.p10, f.p50, f.p90], traj);
  let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
  // Flat series (every value equal, so p10 = p50 = p90 and the fan has no
  // width): centre the line in a modest window and label only that value,
  // instead of inventing a +/-0.5pt scale with odd tick labels.
  const flat = hi - lo < FLAT_SERIES_EPS;
  if (flat) { const pad = Math.max(FLAT_MIN_PAD, Math.abs(hi) * FLAT_PAD_RATIO); lo -= pad; hi += pad; }
  else { const pad = (hi - lo) * 0.08; lo -= pad; hi += pad; }
  if (lo < 0 && Math.min.apply(null, ys) >= 0) lo = 0;
  const span = (n - 1) + horizon;
  const x = d => ml + ((d + (n - 1)) / span) * pw;   // d: day offset, 0 = today
  const y = v => mt + (1 - (v - lo) / (hi - lo)) * ph;

  const line = pts.map((p, i) => `${f1(x(i - (n - 1)))},${f1(y(p.apy))}`).join(' ');
  const x0 = x(0), x1 = x(horizon);
  const band = `${f1(x0)},${f1(y(lastApy))} ${f1(x1)},${f1(y(f.p90))} ${f1(x1)},${f1(y(f.p10))}`;
  const median = [`${f1(x0)},${f1(y(lastApy))}`].concat(
    traj.length ? traj.map((v, i) => `${f1(x((i + 1) * horizon / traj.length))},${f1(y(v))}`)
                : [`${f1(x1)},${f1(y(f.p50))}`]).join(' ');
  const ticks = flat ? [(lo + hi) / 2] : [lo + (hi - lo) * 0.05, (lo + hi) / 2, hi - (hi - lo) * 0.05];
  const grid = ticks.map(v => `<line class="psp-grid" x1="${ml}" x2="${W - mr}" y1="${f1(y(v))}" y2="${f1(y(v))}"/>` +
    `<text class="psp-axis" x="${ml - 6}" y="${f1(y(v) + 4)}" text-anchor="end">${escapeHtml(formatApy(v))}</text>`).join('');
  const bandHtml = flat ? '' : `<polygon class="psp-band" points="${band}"/>\n        `;
  const firstDate = pts[0].date;
  const title = t('pspChartTitle', displayName(pool.project), pool.symbol, pool.chain, n, horizon, formatApy(f.p10), formatApy(f.p90));

  return `<svg class="psp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${titleId}" preserveAspectRatio="xMidYMid meet">
        <title id="${titleId}">${escapeHtml(title)}</title>
        ${grid}
        <line class="psp-today" x1="${f1(x0)}" x2="${f1(x0)}" y1="${mt}" y2="${H - mb}"/>
        ${bandHtml}<polyline class="psp-median" points="${median}"/>
        <polyline class="psp-line" points="${line}"/>
        <text class="psp-axis" x="${ml}" y="${H - 14}" text-anchor="start">${escapeHtml(firstDate)}</text>
        <text class="psp-axis" x="${f1(x0)}" y="${H - 14}" text-anchor="middle">${escapeHtml(t('pspChartToday'))}</text>
        <text class="psp-axis" x="${W - mr}" y="${H - 14}" text-anchor="end">${escapeHtml(t('pspChartHorizon', horizon))}</text>
      </svg>`;
}

// --- derived copy ------------------------------------------------------------
function protocolUrlFor(pool, urls) {
  if (!pool.project) return null;
  const key = pool.project.toLowerCase().replace(/\s+/g, '-');
  const raw = urls && (urls[key] || urls[pool.project]);
  if (!raw) return null;
  try { const u = new URL(raw); u.searchParams.set('ref', 'defi.garden'); return u.toString(); } catch (e) { return raw; }
}

function forecastReadKey(cur, p50) {
  if (cur > 0) {
    const rel = p50 / cur - 1;
    if (Math.abs(rel) < FORECAST_FLAT_BAND) return 'pspForecastFlat';
    return rel < 0 ? 'pspForecastLower' : 'pspForecastHigher';
  }
  return p50 > 0 ? 'pspForecastHigher' : 'pspForecastFlat';
}

function riskItems(pool, t) {
  const items = [t('pspRiskContract')];
  const total = poolTotalApy(pool);
  const k = pool.kpis || {};
  if (pool.ilRisk === 'yes') items.push(t('pspRiskIl'));
  if (total > 0 && (pool.apyReward || 0) / total >= REWARD_SHARE_FLAG) items.push(t('pspRiskReward', fmtSharePct((pool.apyReward || 0) / total)));
  if (isNum(k.tvlTrend) && Math.abs(k.tvlTrend) >= TVL_TREND_FLAG) {
    items.push(t(k.tvlTrend < 0 ? 'pspRiskTvlDown' : 'pspRiskTvlUp', fmtSignedPct(k.tvlTrend)));
  }
  if (isNum(k.apyStdev) && k.historyPoints >= MIN_POINTS_FOR_VOLATILITY && total > 0 && k.apyStdev / total > VOLATILITY_RATIO_FLAG) {
    items.push(t('pspRiskVol', formatApy(k.apyStdev), formatApy(total)));
  }
  const cr = pool.forecast && pool.forecast.crashRisk;
  if (cr === 'MEDIUM' || cr === 'HIGH') items.push(t('pspRiskCrash', t('pspCrashRisk', cr)));
  return items;
}

function pageTitle(pool, t, monthLabel) {
  const name = displayName(pool.project);
  const candidates = [
    t('pspTitleDated', name, pool.symbol, pool.chain, monthLabel),
    t('pspTitleUndated', name, pool.symbol, pool.chain),
    t('pspTitleBare', name, pool.symbol, pool.chain)
  ];
  const fit = candidates.find(c => c.length <= TITLE_MAX_CHARS);
  if (fit) return fit;
  const bare = candidates[2];
  return bare.slice(0, TITLE_MAX_CHARS - 1).replace(/\s+\S*$/, '') + '…';
}

function monthLabelFor(iso, lang) {
  const d = new Date(iso);
  return createTranslationFunction(lang)('tcpMonthYear',
    d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), String(d.getUTCMonth() + 1), String(d.getUTCFullYear()));
}
function longDateFor(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function similarPools(pool, selected, n) {
  const others = selected.filter(p => p.pool !== pool.pool);
  const sameSym = others.filter(p => p.symbol === pool.symbol);
  const sameChain = others.filter(p => p.chain === pool.chain && p.symbol !== pool.symbol);
  const out = sameSym.concat(sameChain);
  const seen = new Set(out.map(p => p.pool));
  others.forEach(p => { if (out.length < 3 && !seen.has(p.pool)) { out.push(p); seen.add(p.pool); } });
  return out.slice(0, n);
}

function poolsBase(lang) { return `${SITE_URL}${langPath(lang, '/pools')}`; }

// --- CSS (tokens only) -------------------------------------------------------
/**
 * Layout + data-viz only. Every visual component is REUSED from the product:
 * the card/panels/tiles/chips/badge are the Decision Terminal classes from
 * pool-detail-styles.min.css (.decision-terminal-card, .dt-grid, .dt-panel,
 * .dt-panel-label, .dt-metric, .dt-badge-tag, .dt-preset-btn), scoped by the
 * .pool-detail-view wrapper that owns the --cert-* tokens; the primary CTA is
 * the canonical .btn.btn--primary and the quiet link is .cta-echo-link.
 * The site header/footer come from landing-styles.css (/for/*.html pattern).
 * Nothing here sets a radius, border, background or label typography for a
 * shared component.
 */
function renderStyle() {
  return `    <style>
      .psp-wrap { width: 100%; box-sizing: border-box; max-width: 860px; margin: 0 auto; padding: 24px 20px 40px; flex: 1 0 auto; color: var(--cert-ink); font-family: var(--cert-sans); font-size: 15px; line-height: 1.5; }
      .psp-wrap h1 { font-family: var(--font-family-display); font-size: 1.7rem; font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; margin: 8px 0 16px; color: var(--cert-ink); overflow-wrap: anywhere; }
      .psp-crumbs { font-size: .85rem; color: var(--cert-ink-2); }
      .psp-crumbs ol { list-style: none; display: flex; flex-wrap: wrap; gap: 0 8px; margin: 0; padding: 0; }
      .psp-crumbs li { display: inline-flex; align-items: center; }
      .psp-crumbs li + li::before { content: "\\203A"; margin-right: 8px; color: var(--cert-ink-3); }
      .psp-crumbs a { color: var(--cert-green); text-decoration: none; }
      .psp-crumbs a:hover { text-decoration: underline; color: var(--cert-green-hover); }
      .psp-page .app-footer a:focus-visible { outline: 2px solid transparent; outline-offset: 2px; box-shadow: var(--ui-focus-ring); }
      .psp-wrap .dt-grid { gap: 16px; }
      .psp-wrap .dt-panel p, .psp-wrap .dt-panel ul { margin: 0; line-height: 1.6; color: var(--cert-ink); }
      .psp-wrap .dt-panel ul { padding-left: 20px; }
      .psp-wrap .dt-panel .psp-note { color: var(--cert-ink-2); font-size: .9rem; line-height: 1.55; }
      .psp-wrap .dt-badge-tag { align-self: flex-start; margin: 0; }
      .psp-stats { grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); margin: 0; }
      .psp-stats .dt-metric { min-width: 0; }
      .psp-stats .dt-metric-val { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
      .psp-cta { width: 100%; max-width: 420px; margin: 4px 0 0; }
      .psp-wrap .psp-secondary { display: inline-flex; align-items: center; align-self: flex-start; min-height: 40px; }
      .psp-score { font-family: var(--font-family-mono, monospace); font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; margin: 0; }
      .psp-pillars { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
      .psp-wrap .dt-panel ul.psp-pillars { padding: 0; }
      .psp-pillar-head { display: flex; justify-content: space-between; gap: 12px; font-size: .92rem; }
      .psp-pillar-head span:last-child { font-family: var(--font-family-mono, monospace); font-size: .85rem; font-variant-numeric: tabular-nums; color: var(--cert-ink-2); }
      .psp-tier { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; margin-top: 6px; }
      .psp-tier > span { display: block; height: 8px; background: var(--cert-paper-deep); border: 1px solid var(--cert-rule); }
      .psp-tier-high > span.on { background: var(--cert-green); border-color: var(--cert-green); }
      .psp-tier-medium > span.on { background: var(--cert-ink-2); border-color: var(--cert-ink-2); }
      .psp-tier-low > span.on { background: var(--cert-amber); border-color: var(--cert-amber); }
      .psp-forecast { width: 100%; border-collapse: collapse; }
      .psp-forecast th, .psp-forecast td { text-align: left; padding: 10px 6px; border-bottom: 1px solid var(--cert-rule); color: var(--cert-ink); }
      .psp-forecast th { font-family: var(--font-family-mono, monospace); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--cert-ink-2); font-weight: 700; }
      .psp-forecast td:last-child, .psp-forecast th:last-child { text-align: right; }
      .psp-forecast td { font-family: var(--font-family-mono, monospace); font-weight: 700; font-variant-numeric: tabular-nums; }
      .psp-chart { width: 100%; height: auto; display: block; color: var(--cert-ink-2); }
      .psp-chart .psp-grid { stroke: var(--cert-rule); stroke-width: 1; }
      .psp-chart .psp-today { stroke: var(--cert-rule-strong); stroke-width: 1; stroke-dasharray: 3 3; }
      .psp-chart .psp-line { fill: none; stroke: var(--cert-green); stroke-width: 2; stroke-linejoin: round; }
      .psp-chart .psp-median { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-dasharray: 5 4; }
      .psp-chart .psp-band { fill: var(--cert-green-wash-strong); stroke: var(--cert-rule-strong); stroke-width: 1; }
      .psp-chart .psp-axis { fill: var(--cert-ink-2); font-family: var(--font-family-mono, monospace); font-size: 11px; }
      .psp-legend { display: flex; flex-wrap: wrap; gap: 8px 18px; list-style: none; margin: 0; padding: 0; font-size: .85rem; color: var(--cert-ink-2); }
      .psp-legend li { display: inline-flex; align-items: center; gap: 8px; }
      .psp-legend li::before { content: ""; display: inline-block; width: 18px; flex: 0 0 auto; box-sizing: border-box; }
      .psp-key-line::before { height: 0; border-top: 2px solid var(--cert-green); }
      .psp-key-median::before { height: 0; border-top: 2px dashed var(--cert-ink-2); }
      .psp-key-band::before { height: 10px; background: var(--cert-green-wash-strong); border: 1px solid var(--cert-rule-strong); }
      .psp-note { color: var(--cert-ink-2); font-size: .9rem; line-height: 1.55; margin: 8px 0 0; }
      .psp-similar { margin: 28px 0 8px; }
      .psp-similar h2 { margin: 0 0 12px; }
      .psp-similar a, .psp-hub-links a { display: inline-flex; align-items: center; min-height: 40px; margin: 0 8px 8px 0; text-decoration: none; }
      .psp-foot { color: var(--cert-ink-2); font-size: .9rem; line-height: 1.55; }
      .psp-foot a { color: var(--cert-green); }
      .psp-page .landing-icon-button { text-decoration: none; }
      .psp-page .app-footer a { display: inline-block; padding: 12px 6px; }
      @media (max-width: 720px) {
        .psp-stats { grid-auto-flow: row; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .psp-stats .dt-metric:last-child:nth-child(odd) { grid-column: 1 / -1; }
      }
      @media (max-width: 768px) { .psp-crumbs a, .psp-crumbs li { min-height: 40px; } }
      @media (max-width: 480px) { .psp-chart .psp-axis { font-size: 20px; } .psp-wrap { padding: 16px 14px 32px; } .psp-wrap h1 { font-size: 1.4rem; } .psp-cta { max-width: none; } }
${renderLangSwitchStyle()}    </style>`;
}

// --- shared chrome: the /for/*.html header + footer, localised ---------------
const LEAF_MARK_SVG = '<svg class="landing-leaf-mark" viewBox="0 0 32 32" width="24" height="24" preserveAspectRatio="xMidYMid meet" fill="none" aria-hidden="true"><path d="M26.7 4.8C16.2 5.2 8.2 10.7 7.1 20.4c-.3 2.8.7 5.2 2.4 6.8 1.6-8.5 6.5-14.6 14.1-18.2-4.5 3.9-7.6 8.7-9 14.6 3.1-3.9 7-6.8 11.7-8.8.8-2.8.9-6 .4-10Z" fill="currentColor" /><path d="M8.8 27.2c3.2-5.1 7.2-8.9 12.2-11.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>';

/** Landing-namespace copy (nav/theme labels already shipped in EN + KO). The
 *  i18n layer addresses the nested `landing` catalog as 'landing.<key>' (pt/es
 *  carry them as flat 'landing.<key>' entries) with per-key EN fall-back. */
function chromeCopy(language) {
  const t = createTranslationFunction(language);
  return k => t('landing.' + k);
}

/** Applies a saved theme before first paint (same `theme` localStorage key as the app). */
const THEME_BOOT_SCRIPT = `    <script>try{var th=localStorage.getItem('theme');if(th)document.documentElement.setAttribute('data-theme',th)}catch(e){}</script>`;

/** Theme toggle + mobile menu. Same behaviour as /for/*.html; the language
 *  switcher is a plain list of links (renderLanguageSwitcher), so no JS for it. */
function renderChromeScript(lc) {
  const labels = JSON.stringify({
    toLight: lc('themeLight'), toDark: lc('themeDark'), open: lc('navMenu'), close: lc('navClose')
  }).replace(/</g, '\\u003c');
  return `  <script>
    (function () {
      var L = ${labels};
      var root = document.documentElement;
      function isDark() {
        var a = root.getAttribute('data-theme');
        return a ? a === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
      var themeBtn = document.getElementById('theme-toggle-btn');
      function paint() {
        if (!themeBtn) return;
        var dark = isDark();
        themeBtn.textContent = dark ? '\\u263C' : '\\u263E';
        themeBtn.setAttribute('aria-label', dark ? L.toLight : L.toDark);
      }
      if (themeBtn) {
        paint();
        themeBtn.addEventListener('click', function () {
          var next = isDark() ? 'light' : 'dark';
          root.setAttribute('data-theme', next);
          try { localStorage.setItem('theme', next); } catch (e) {}
          paint();
        });
      }
      var menuBtn = document.getElementById('menu-toggle-btn');
      var mobileNav = document.getElementById('mobile-nav');
      if (menuBtn && mobileNav) {
        menuBtn.addEventListener('click', function () {
          var open = mobileNav.classList.toggle('is-open');
          menuBtn.textContent = open ? '\\u00D7' : '\\u2630';
          menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
          menuBtn.setAttribute('aria-label', open ? L.close : L.open);
        });
      }
    })();
  </script>`;
}

/** Header + mobile nav. The language switcher is NOT in the header: four
 *  language buttons next to the theme/menu buttons do not fit a 360px header,
 *  so it is a compact link row at the top of <main> instead. */
function renderSiteHeader(lc, language) {
  const links = [
    ['/?app=1', lc('navSearch')],
    ['/stocks', lc('navStocks')],
    ['/methodology', lc('navMethodology')],
    ['/mcp', lc('navApi')]
  ];
  const a = (l) => `<a href="${l[0]}">${escapeHtml(l[1])}</a>`;
  return `    <header class="landing-header">
      <a class="landing-brand" href="${language === 'ko' ? '/?lang=ko' : '/'}">
        <span class="landing-brand-mark">${LEAF_MARK_SVG}</span>
        <span>DeFi Garden</span>
      </a>
      <nav class="landing-nav" aria-label="${escapeHtml(lc('navPrimary'))}">
        ${links.map(a).join('\n        ')}
      </nav>
      <div class="landing-header-actions">
        <button type="button" class="landing-icon-button landing-theme-button" id="theme-toggle-btn" aria-label="${escapeHtml(lc('themeLight'))}">☼</button>
        <button type="button" class="landing-menu-button" id="menu-toggle-btn" aria-expanded="false" aria-controls="mobile-nav" aria-label="${escapeHtml(lc('navMenu'))}">☰</button>
      </div>
    </header>
    <nav class="landing-mobile-nav" id="mobile-nav" aria-label="${escapeHtml(lc('navMobile'))}">
      ${links.map(a).join('\n      ')}
    </nav>`;
}

/** The shared static footer (same copy + hub links as the landing and /for pages). */
function renderSiteFooter(t, language) {
  const base = langPath(language, '');
  return `    <footer class="app-footer">
      <p>${escapeHtml(t('poweredBy'))} <a href="https://api-docs.defillama.com/" target="_blank" rel="noopener noreferrer">${escapeHtml(t('defillamaApi'))}</a>. ${escapeHtml(t('footerSignOff'))}</p>
      <p class="app-footer-hub-links">
        <a href="${base}/tokens">${escapeHtml(t('browseTokens'))}</a> · <a href="${base}/chains">${escapeHtml(t('browseChains'))}</a> · <a href="${base}/pools">${escapeHtml(t('pspHubLink'))}</a> · <a href="/stocks">${escapeHtml(t('stocksLink'))}</a> · <a href="/methodology">${escapeHtml(t('methodologyLink'))}</a> · <a href="/mcp">${escapeHtml(t('apiLink'))}</a>
      </p>
    </footer>`;
}

// --- page --------------------------------------------------------------------
/**
 * ctx: { slug, slugOf:Map(uuid->slug), selected:[pool], snapshotIso, series,
 *        protocolUrls, chainSlugs:Set, hasAccuracyPage:boolean }
 */
function renderPoolScorePage(pool, ctx, lang) {
  const language = normalizeLang(lang);
  const t = createTranslationFunction(language);
  const lc = chromeCopy(language);
  const esc = s => escapeHtml(s);
  const name = displayName(pool.project);
  const sym = pool.symbol || '—';
  const chain = pool.chain || '—';
  const slug = ctx.slug;
  const neutralPath = `/pools/${slug}`;
  const pageUrl = langUrl(SITE_URL, language, neutralPath);
  const genDate = longDateFor(ctx.snapshotIso);
  const monthLabel = monthLabelFor(ctx.snapshotIso, language);
  const total = poolTotalApy(pool);
  const base = pool.apyBase || 0, reward = pool.apyReward || 0;
  const f = pool.forecast, ds = pool.defiScore, k = pool.kpis || {};
  const horizon = isNum(f.horizonDays) ? f.horizonDays : 14;
  const mean30 = isNum(pool.apyMean30d) ? pool.apyMean30d : null;
  const title = pageTitle(pool, t, monthLabel);
  const description = t('pspDescription', name, sym, chain, formatApy(total), mean30 == null ? formatApy(total) : formatApy(mean30),
    formatUsd(pool.tvlUsd), fmtScore(ds.score), formatApy(f.p10), formatApy(f.p90), genDate);
  const h1 = t('pspH1', name, sym, chain);
  const restricted = PERMISSIONED_PROJECT_LIST.has(String(pool.project || '').toLowerCase());

  // breadcrumb (Home > Chains > Chain > pool); chain level only when its page exists
  const chainSlug = slugify(chain);
  const chainsBase = `${SITE_URL}${langPath(language, '/chains')}`;
  const crumbs = [
    { name: t('tcpBreadcrumbHome'), url: `${SITE_URL}/` },
    { name: t('tcpBreadcrumbChains'), url: chainsBase }
  ];
  if (ctx.chainSlugs && ctx.chainSlugs.has(chainSlug)) crumbs.push({ name: chain, url: `${chainsBase}/${chainSlug}` });
  crumbs.push({ name: `${name} ${sym}`, url: pageUrl });
  const breadcrumbJsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url }))
  }).replace(/</g, '\\u003c');
  const breadcrumbHtml = crumbs.map((c, i) => i === crumbs.length - 1
    ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${c.url}">${esc(c.name)}</a></li>`).join('');
  // Dataset JSON-LD: dateModified = the snapshot date (ISO, same instant the
  // visible genDate is formatted from). variableMeasured lists only what the
  // page shows (the 30-day mean row exists only when the pool has one).
  // temporalCoverage = the observed-APY window the chart really plots (first
  // to last history day-file), else the snapshot date. No distribution: the
  // pools/<uuid>.md|.json twins exist only for deep-linked ids, not for every
  // scored page, so none is claimed.
  const snapIsoDate = toIsoDate(ctx.snapshotIso);
  const hist = (ctx.series || []).map(pt => pt.date).filter(Boolean).sort();
  const datasetJsonLd = renderDatasetJsonLd(t('pspDatasetName', name, sym, chain), t('pspDatasetDescription', name, sym, chain), pageUrl, snapIsoDate, {
    keywords: [sym, name, chain, 'DeFi Score', 'APY forecast'],
    variableMeasured: [
      { name: 'APY', unitText: 'percent' },
      ...(mean30 == null ? [] : [{ name: '30-day mean APY', unitText: 'percent' }]),
      { name: 'Base APY', unitText: 'percent' },
      { name: 'Reward APY', unitText: 'percent' },
      { name: 'TVL', unitText: 'USD' },
      { name: 'DeFi Score', unitText: 'points out of 100' },
      { name: `${horizon}-day APY forecast`, unitText: 'percent' }
    ],
    temporalCoverage: hist.length >= 2 && hist[0] !== hist[hist.length - 1] ? `${hist[0]}/${hist[hist.length - 1]}` : snapIsoDate
  });

  // summary
  const stat = (label, value) => `<div class="dt-metric"><dt class="dt-metric-name">${esc(label)}</dt><dd class="dt-metric-val">${esc(value)}</dd></div>`;
  const stats = [
    stat(t('pspLiveApy'), formatApy(total)),
    mean30 == null ? '' : stat(t('pspMean30'), formatApy(mean30)),
    stat(t('pspBaseApy'), formatApy(base)),
    stat(t('pspRewardApy'), formatApy(reward)),
    stat(t('pspTvl'), formatUsd(pool.tvlUsd))
  ].join('\n        ');

  // CTAs: ONE primary + at most one quiet secondary
  const ctaHref = withSrc(`${SITE_URL}/?pool=${encodeURIComponent(pool.pool)}`, 'seo_pool');
  const protoUrl = protocolUrlFor(pool, ctx.protocolUrls);
  const secondary = protoUrl
    ? `<a class="cta-echo-link psp-secondary" rel="nofollow noopener" href="${esc(protoUrl)}">${esc(t('pspSecondaryProtocol', name))}</a>`
    : ((ctx.chainSlugs && ctx.chainSlugs.has(chainSlug))
      ? `<a class="cta-echo-link psp-secondary" href="${chainsBase}/${chainSlug}">${esc(t('pspSecondaryChain', chain))}</a>` : '');

  // score pillars
  const pillars = SCORE_PILLARS.map(pl => {
    const tier = ds.pillarsTier && ds.pillarsTier[pl.key];
    if (!Object.prototype.hasOwnProperty.call(PILLAR_TIER_LEVEL, tier)) return `<li>
          <div class="psp-pillar-head"><span>${esc(t(pl.labelKey))}</span></div>
        </li>`;
    const level = PILLAR_TIER_LEVEL[tier];
    const tierLabel = t('pspTier' + tier);
    return `<li>
          <div class="psp-pillar-head"><span>${esc(t(pl.labelKey))}</span><span>${esc(tierLabel)}</span></div>
          <div class="psp-tier psp-tier-${tier.toLowerCase()}" data-tier="${tier.toLowerCase()}" aria-hidden="true"><span class="on"></span><span${level >= 2 ? ' class="on"' : ''}></span><span${level >= 3 ? ' class="on"' : ''}></span></div>
        </li>`;
  }).join('\n        ');

  // forecast
  const crLevel = f.crashRisk;
  const forecastRead = t(forecastReadKey(total, f.p50), formatApy(total), formatApy(f.p50));
  const crashHtml = crLevel ? `<p class="psp-note">${esc(t('pspCrashRisk', crLevel))}</p>` : '';

  // yield source
  const srcLines = [];
  if (total > 0 && base > 0) srcLines.push(t('pspSourceBase', formatApy(base), fmtSharePct(base / total)));
  if (total > 0 && reward > 0) srcLines.push(t('pspSourceReward', formatApy(reward), fmtSharePct(reward / total)));
  if (!srcLines.length) srcLines.push(t('pspSourceNone'));
  if (pool.exposure === 'single') srcLines.push(t('pspExposureSingle'));
  else if (pool.exposure === 'multi') srcLines.push(t('pspExposureMulti'));
  if (pool.ilRisk === 'yes') srcLines.push(t('pspIlYes'));
  else if (pool.ilRisk === 'no') srcLines.push(t('pspIlNo'));
  if (pool.poolMeta) srcLines.push(t('pspPoolMeta', pool.poolMeta));

  // withdrawal
  const wLines = [t('pspWithdrawLiquidity', formatUsd(pool.tvlUsd))];
  if (isNum(f.predictedTvlUsd) && isNum(f.predictedTvlDelta)) wLines.push(t('pspWithdrawTvlForecast', formatUsd(f.predictedTvlUsd), fmtSignedPct(f.predictedTvlDelta)));
  wLines.push(t('pspWithdrawGeneric'));

  const risks = riskItems(pool, t);
  if (risks.length === 1) risks.push(t('pspRiskNone'));

  const similar = similarPools(pool, ctx.selected, SIMILAR_POOLS).map(p => {
    const s = ctx.slugOf.get(p.pool);
    return `<a class="dt-preset-btn" href="${poolsBase(language)}/${s}">${esc(t('pspSimilarItem', displayName(p.project), p.symbol || '—', p.chain || '—', formatUsd(p.tvlUsd)))}</a>`;
  }).join('\n        ');

  const accuracy = ctx.hasAccuracyPage
    ? `<p class="psp-foot"><a href="${SITE_URL}/forecast-accuracy">${esc(t('pspAccuracyLink'))}</a></p>` : '';
  const chartId = 'psp-chart-title';

  return `<!DOCTYPE html>
<html lang="${getLanguage(language).htmlLang}">
<head>
    ${GENERATOR_MARKER}
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${pageUrl}">
${renderHreflangLinks(neutralPath, LANG_CODES)}    <script type="application/ld+json">${breadcrumbJsonLd}</script>
    <script type="application/ld+json">${datasetJsonLd}</script>
    <meta property="og:type" content="website">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${SITE_URL}/${OG_FALLBACK_REL_PATH}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="robots" content="index,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
${renderFontPreloadLinks()}    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/landing-styles.css">
    <link rel="stylesheet" href="/pool-detail-styles.min.css">
${THEME_BOOT_SCRIPT}
${renderStyle()}
${renderAnalyticsBootstrap(`${langPath(language, '')}/pools/${slug}`, { page_type: 'pool_score', pool: pool.pool, chain, project: pool.project, lang: language })}
</head>
<body>
  <div class="landing-app psp-page">
${renderSiteHeader(lc, language)}
  <main class="psp-wrap pool-detail-view">
${renderLanguageSwitcher(neutralPath, language, LANG_CODES, t)}    <nav class="psp-crumbs" aria-label="${esc(t('tcpBreadcrumbHome'))}"><ol>${breadcrumbHtml}</ol></nav>
    <h1>${esc(h1)}</h1>
    <div class="decision-terminal-card">
    <div class="dt-grid">
    <section class="dt-panel dt-panel-full" aria-label="${esc(t('pspSummaryHeading'))}">
      <dl class="dt-metric-row psp-stats">
        ${stats}
      </dl>
      <p class="psp-note">${esc(t('pspDataAsOf', genDate))}</p>
      <a class="btn btn--primary btn--lg btn--full-width psp-cta" rel="nofollow" href="${ctaHref}">${esc(t('pspCta'))}</a>
      ${secondary}
    </section>

    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(t('pspScoreHeading'))}</h2>
      <p class="psp-score">${esc(t('pspScoreValue', fmtScore(ds.score)))}</p>
      <ul class="psp-pillars">
        ${pillars}
      </ul>
      <p class="psp-note">${esc(t('pspScoreNote'))} <a href="${SITE_URL}/mcp">${esc(t('pspMethodologyLink'))}</a></p>
    </section>

    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(t('pspForecastHeading'))}</h2>
      <p>${esc(t('pspForecastLead', horizon, formatApy(f.p50), formatApy(f.p10), formatApy(f.p90)))}</p>
      <table class="psp-forecast">
        <tbody>
          <tr><th scope="row">${esc(t('pspP10'))}</th><td>${formatApy(f.p10)}</td></tr>
          <tr><th scope="row">${esc(t('pspP50'))}</th><td>${formatApy(f.p50)}</td></tr>
          <tr><th scope="row">${esc(t('pspP90'))}</th><td>${formatApy(f.p90)}</td></tr>
        </tbody>
      </table>
      <p>${esc(forecastRead)}</p>
      ${crashHtml}
      <p class="psp-note">${esc(t('pspForecastDisclaimer'))}</p>
    </section>

    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(t('pspChartHeading'))}</h2>
      ${renderApyChartSvg(pool, ctx.series || [], t, chartId)}
      <ul class="psp-legend">
        <li class="psp-key-line">${esc(t('pspLegendHistory'))}</li>
        <li class="psp-key-median">${esc(t('pspLegendMedian'))}</li>
        <li class="psp-key-band">${esc(t('pspLegendBand'))}</li>
      </ul>
      <p class="psp-note">${esc(t('pspChartCaption'))}</p>
    </section>

    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(t('pspSourceHeading'))}</h2>
      ${srcLines.map(l => `<p>${esc(l)}</p>`).join('\n      ')}
    </section>

    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(t('pspAccessHeading'))}</h2>
      <p class="dt-badge-tag">${esc(t(restricted ? 'pspAccessRestricted' : 'pspAccessOpen'))}</p>
      <p>${esc(t(restricted ? 'pspAccessRestrictedNote' : 'pspAccessOpenNote'))}</p>
    </section>

    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(t('pspWithdrawHeading'))}</h2>
      ${wLines.map(l => `<p>${esc(l)}</p>`).join('\n      ')}
    </section>

    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(t('pspRisksHeading'))}</h2>
      <ul>
        ${risks.map(r => `<li>${esc(r)}</li>`).join('\n        ')}
      </ul>
    </section>

    </div>
    </div>

    <nav class="psp-similar" aria-label="${esc(t('pspSimilarHeading'))}">
      <h2 class="dt-panel-label">${esc(t('pspSimilarHeading'))}</h2>
        ${similar}
    </nav>

    <p class="psp-foot">${esc(t('pspNotAdvice'))}</p>
${accuracy}  </main>
${renderSiteFooter(t, language)}
  </div>
${renderChromeScript(lc)}
</body>
</html>
`;
}

// --- hub ---------------------------------------------------------------------
function renderPoolsHubPage(selected, ctx, lang) {
  const language = normalizeLang(lang);
  const t = createTranslationFunction(language);
  const lc = chromeCopy(language);
  const esc = escapeHtml;
  const neutralPath = '/pools';
  const pageUrl = langUrl(SITE_URL, language, neutralPath);
  const title = t('pspHubTitle');
  const description = t('pspHubDescription', selected.length);
  const byChain = new Map();
  selected.forEach(p => { if (!byChain.has(p.chain)) byChain.set(p.chain, []); byChain.get(p.chain).push(p); });
  const chains = Array.from(byChain.entries()).map(([chain, ps]) => ({
    chain, ps, tvl: ps.reduce((s, p) => s + p.tvlUsd, 0)
  })).sort((a, b) => b.tvl - a.tvl || a.chain.localeCompare(b.chain));
  const sections = chains.map(c => `    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(c.chain)}</h2>
      <div class="psp-hub-links">
        ${c.ps.map(p => `<a class="dt-preset-btn" href="${poolsBase(language)}/${ctx.slugOf.get(p.pool)}">${esc(displayName(p.project))} ${esc(p.symbol || '—')}</a>`).join('\n        ')}
      </div>
    </section>`).join('\n');
  const crumbs = [{ name: t('tcpBreadcrumbHome'), url: `${SITE_URL}/` }, { name: t('pspBreadcrumbPools'), url: pageUrl }];
  const breadcrumbJsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url }))
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${getLanguage(language).htmlLang}">
<head>
    ${GENERATOR_MARKER}
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${pageUrl}">
${renderHreflangLinks(neutralPath, LANG_CODES)}    <script type="application/ld+json">${breadcrumbJsonLd}</script>
    <meta property="og:type" content="website">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${SITE_URL}/${OG_FALLBACK_REL_PATH}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="robots" content="index,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
${renderFontPreloadLinks()}    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/landing-styles.css">
    <link rel="stylesheet" href="/pool-detail-styles.min.css">
${THEME_BOOT_SCRIPT}
${renderStyle()}
${renderAnalyticsBootstrap(`${langPath(language, '')}/pools`, { page_type: 'pool_hub', pool_count: selected.length, lang: language })}
</head>
<body>
  <div class="landing-app psp-page">
${renderSiteHeader(lc, language)}
  <main class="psp-wrap pool-detail-view">
${renderLanguageSwitcher(neutralPath, language, LANG_CODES, t)}    <nav class="psp-crumbs" aria-label="${esc(t('tcpBreadcrumbHome'))}"><ol><li><a href="${SITE_URL}/">${esc(t('tcpBreadcrumbHome'))}</a></li><li aria-current="page">${esc(t('pspBreadcrumbPools'))}</li></ol></nav>
    <h1>${esc(t('pspHubHeading'))}</h1>
    <p class="psp-note">${esc(t('pspHubSub', selected.length, formatUsd(W1_MIN_TVL_USD)))}</p>
    <p class="psp-note">${esc(t('pspHubIntro'))}</p>
    <div class="decision-terminal-card">
    <div class="dt-grid">
${sections}
    </div>
    </div>
    <p class="psp-foot">${esc(t('pspNotAdvice'))}</p>
  </main>
${renderSiteFooter(t, language)}
  </div>
${renderChromeScript(lc)}
</body>
</html>
`;
}

// --- sitemap -----------------------------------------------------------------
function renderPoolsSitemap(selected, slugOf, lastmod, lang, opts) {
  // `opts.alternates` (optional): `(neutralPath) => string[]` — the language
  // codes the URL exists in. When given, every <url> carries the same
  // reciprocal <xhtml:link> alternates as its page's on-page hreflang.
  // Omitted = the legacy output, byte-identical.
  const language = normalizeLang(lang);
  const base = poolsBase(language);
  const alternates = opts && opts.alternates;
  const tag = lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '';
  const urls = [base].concat(selected.map(p => `${base}/${slugOf.get(p.pool)}`))
    .map(loc => {
      const alt = alternates ? renderSitemapAlternates(neutralPathOfLoc(loc, language), alternates(neutralPathOfLoc(loc, language))) : '';
      return `  <url>\n    <loc>${loc}</loc>\n${alt}${tag}    <changefreq>daily</changefreq>\n  </url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${alternates ? SITEMAP_URLSET_OPEN_XHTML : SITEMAP_URLSET_OPEN}\n${urls.join('\n')}\n</urlset>\n`;
}

// --- IO ----------------------------------------------------------------------
/** Deletes *.html files carrying this generator's marker that are not in `keep`.
 *  Never touches anything else (the .md/.json twins, foreign html). Returns count. */
function removeStaleOwnedPages(dir, keep) {
  let removed = 0;
  if (!fs.existsSync(dir)) return 0;
  fs.readdirSync(dir).forEach(f => {
    if (!f.endsWith('.html') || keep.has(f)) return;
    const full = path.join(dir, f);
    let head = '';
    try { head = fs.readFileSync(full, 'utf8').slice(0, 400); } catch (e) { return; }
    if (head.includes(GENERATOR_MARKER)) { fs.rmSync(full); removed++; }
  });
  return removed;
}

// --- redirects for pages that drop out of the set ----------------------------
// A page that leaves the set (yield below the floor, feed gap, ...) was already
// published and sitemapped, so it must 301 to its chain hub instead of 404ing.
// The generator owns these entries in vercel.json (a static list would keep
// redirecting a pool away from its page after it requalifies, because Vercel
// redirects run before the filesystem). Managed entries are recognised by shape:
// permanent /pools/<slug> or /<lang>/pools/<slug> (every language in
// languages.js) -> that language's chain hub or pools hub.
// `/pools/index` is a hand-written entry and is never touched.
const REDIRECTS_ANCHOR_SOURCE = '/ko/pools/index';
const MANAGED_REDIRECT_RE = /^    \{\n      "source": "\/(?:(?:ko|pt|es)\/)?pools\/([a-z0-9-]+)",\n      "destination": "([^"]+)",\n      "permanent": true\n    \},\n/gm;

/**
 * Pure: the managed redirect set after this run, as Map(slug -> chainSlug|null).
 * existing: Map(slug -> chainSlug|null) already in vercel.json; prevPages: old
 * manifest pages [{slug,pool}]; currentSlugs: Set of slugs that have a page now;
 * chainOfPool: Map(uuid -> chain slug) from the snapshot; chainSlugs: Set of
 * chain pages that exist (null chain = fall back to the /pools hub).
 */
function computePoolRedirects(existing, prevPages, currentSlugs, chainOfPool, chainSlugs) {
  const out = new Map(existing);
  (prevPages || []).forEach(e => {
    if (!e || !e.slug || currentSlugs.has(e.slug)) return;
    const cs = chainOfPool.get(e.pool);
    if (cs && chainSlugs.has(cs)) out.set(e.slug, cs);
    else if (!out.has(e.slug)) out.set(e.slug, null);
  });
  currentSlugs.forEach(slug => out.delete(slug)); // requalified: page wins
  out.delete('index');
  return out;
}

function renderRedirectEntries(redirects) {
  return Array.from(redirects.keys()).sort().map(slug => {
    const cs = redirects.get(slug);
    return LANGUAGES.map(l => l.pathPrefix).map(pre => `    {\n      "source": "${pre}/pools/${slug}",\n` +
      `      "destination": "${cs ? `${pre}/chains/${cs}` : `${pre}/pools`}",\n      "permanent": true\n    },\n`).join('');
  }).join('');
}

/** Text-level sync (keeps vercel.json's hand formatting). Returns the new text. */
function syncPoolRedirectsText(text, prevPages, currentSlugs, chainOfPool, chainSlugs) {
  const existing = new Map();
  const stripped = text.replace(MANAGED_REDIRECT_RE, (m, slug, dest) => {
    if (slug === 'index') return m;
    const cm = /^\/chains\/([a-z0-9-]+)$/.exec(dest);
    if (/^\/(?:ko|pt|es)\//.test(m.match(/"source": "([^"]+)"/)[1])) return '';
    existing.set(slug, cm ? cm[1] : null);
    return '';
  });
  const entries = renderRedirectEntries(computePoolRedirects(existing, prevPages, currentSlugs, chainOfPool, chainSlugs));
  const anchor = new RegExp(`(      "source": "${REDIRECTS_ANCHOR_SOURCE}",\\n[^\\n]*\\n[^\\n]*\\n    \\},\\n)`);
  if (!anchor.test(stripped)) throw new Error('vercel.json: redirect anchor ' + REDIRECTS_ANCHOR_SOURCE + ' not found');
  const next = stripped.replace(anchor, (m) => m + entries);
  JSON.parse(next); // never write invalid JSON
  return next;
}

function buildManifest(selected, slugOf, snapshotIso) {
  return {
    generatedAt: snapshotIso,
    count: selected.length,
    pages: selected.map(p => ({ slug: slugOf.get(p.pool), pool: p.pool }))
  };
}

function parseArgs(argv) {
  const args = {
    limit: W1_PAGE_LIMIT, out: 'pools', snapshot: 'data/pools-snapshot.json', history: 'data/history',
    manifest: MANIFEST_REL_PATH, vercel: 'vercel.json', sitemap: 'sitemap-pool-pages.xml', protocolUrls: 'data/protocol-urls.json'
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') { const n = parseInt(argv[++i], 10); args.limit = Number.isNaN(n) ? W1_PAGE_LIMIT : n; }
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--snapshot') args.snapshot = argv[++i];
    else if (a === '--history') args.history = argv[++i];
    else if (a === '--manifest') args.manifest = argv[++i];
    else if (a === '--vercel') args.vercel = argv[++i];
    else if (a === '--no-vercel') args.vercel = null;
    else if (a === '--sitemap') args.sitemap = argv[++i];
    else if (a === '--no-sitemap') args.sitemap = null;
  }
  return args;
}

function writeSet(outDir, language, selected, ctxBase, histories) {
  fs.mkdirSync(outDir, { recursive: true });
  const keep = new Set(['index.html']);
  selected.forEach(p => {
    const slug = ctxBase.slugOf.get(p.pool);
    keep.add(`${slug}.html`);
    const ctx = Object.assign({}, ctxBase, { slug, series: seriesFor(p.pool, histories) });
    fs.writeFileSync(path.join(outDir, `${slug}.html`), renderPoolScorePage(p, ctx, language));
  });
  fs.writeFileSync(path.join(outDir, 'index.html'), renderPoolsHubPage(selected, ctxBase, language));
  return removeStaleOwnedPages(outDir, keep);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const snap = JSON.parse(fs.readFileSync(path.resolve(args.snapshot), 'utf8'));
  const pools = snap.pools || [];
  const snapshotIso = snap.generatedAt || new Date().toISOString();
  const { eligibleCount, selected } = selectPoolPages(pools, args.limit);
  if (!selected.length) throw new Error('generate-pool-score-pages.js: zero eligible pools — refusing to write an empty set');
  const slugAll = assignPoolSlugs(pools);          // full snapshot: slugs independent of --limit
  const slugOf = new Map(selected.map(p => [p.pool, slugAll.get(p.pool)]));
  const histories = loadHistory(path.resolve(args.history));
  let protocolUrls = {};
  try { protocolUrls = JSON.parse(fs.readFileSync(path.join(ROOT, args.protocolUrls), 'utf8')).urls || {}; } catch (e) { /* no CTA url map */ }
  const chainSlugs = new Set();
  try { fs.readdirSync(path.join(ROOT, 'chains')).forEach(f => { if (f.endsWith('.html') && f !== 'index.html') chainSlugs.add(f.slice(0, -5)); }); } catch (e) { /* none */ }
  const ctxBase = {
    slugOf, selected, snapshotIso, protocolUrls, chainSlugs,
    hasAccuracyPage: fs.existsSync(path.join(ROOT, 'forecast-accuracy.html'))
  };

  const outDir = path.resolve(args.out);
  // One directory per language: en = args.out; others are siblings of it
  // (<lang>/<basename>) — every EN pool page exists in every language.
  const removedByLang = {};
  LANGUAGES.forEach(l => {
    const langOutDir = l.code === 'en' ? outDir : path.join(path.dirname(outDir), langDir(l.code), path.basename(outDir));
    removedByLang[l.code] = writeSet(langOutDir, l.code, selected, ctxBase, histories);
  });

  let redirectNote = '';
  if (args.vercel) {
    let prevPages = [];
    try { prevPages = JSON.parse(fs.readFileSync(path.resolve(args.manifest), 'utf8')).pages || []; } catch (e) { /* first run */ }
    const chainOfPool = new Map(pools.map(p => [p.pool, slugify(p.chain)]));
    const vp = path.resolve(args.vercel);
    const before = fs.readFileSync(vp, 'utf8');
    const after = syncPoolRedirectsText(before, prevPages, new Set(slugOf.values()), chainOfPool, chainSlugs);
    if (after !== before) fs.writeFileSync(vp, after);
    redirectNote = `; ${(after.match(MANAGED_REDIRECT_RE) || []).length / LANGUAGES.length - 1} pool redirects in ${args.vercel}`;
  }

  fs.mkdirSync(path.dirname(path.resolve(args.manifest)), { recursive: true });
  fs.writeFileSync(path.resolve(args.manifest), JSON.stringify(buildManifest(selected, slugOf, snapshotIso), null, 2) + '\n');

  if (args.sitemap) {
    const lastmod = snapshotIso.slice(0, 10);
    // Pool pages exist in every language, so every <url> lists the full set.
    const alternates = () => LANG_CODES;
    LANGUAGES.forEach(l => {
      const sitemapPath = l.code === 'en' ? args.sitemap : args.sitemap.replace(/\.xml$/, `-${l.code}.xml`);
      fs.writeFileSync(path.resolve(sitemapPath), renderPoolsSitemap(selected, slugOf, lastmod, l.code, { alternates }));
    });
  }
  console.log(`✅ ${eligibleCount} eligible pools; wrote ${selected.length} pages in each of ${LANG_CODES.map(c => c.toUpperCase()).join('/')} (limit ${args.limit || 'none'}), removed ${LANG_CODES.map(c => removedByLang[c]).join('+')} stale${redirectNote}`);
}

module.exports = {
  W1_PAGE_LIMIT, W1_MIN_TVL_USD, W1_MIN_HISTORY_POINTS, W1_MIN_APY_PCT, SCORE_PILLARS, GENERATOR_MARKER,
  isEligibleScoredPool, selectPoolPages, displayName, renderPoolScorePage, renderPoolsHubPage,
  renderPoolsSitemap, renderApyChartSvg, buildManifest, removeStaleOwnedPages, pageTitle,
  loadHistory, seriesFor, protocolUrlFor, riskItems, parseArgs, writeSet,
  assignPoolSlugs, hasMeaningfulYield, computePoolRedirects, syncPoolRedirectsText
};

if (require.main === module) {
  try { main(); } catch (e) { console.error('❌', e.message); process.exit(1); }
}
