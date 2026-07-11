#!/usr/bin/env node

/**
 * Static Token Landing Page Generator for DeFi Garden (backlog 014, phase 1)
 * Generates tokens/<slug>.html for the top-N tokens by TVL — real,
 * server-delivered title/description/canonical/content, so crawlers see a
 * genuine page instead of the JS shell that every ?token= URL renders before
 * its DefiLlama fetch completes (specs/010-diagnosis.md, "Crawled — currently
 * not indexed").
 *
 * TRUST PRINCIPLE (mirrors generate-sitemap.js / planner.js exactly): every
 * number is computed at generation time from live DefiLlama pool data passed
 * through the SAME sanity rails as the app. Anomalous pools (total APY >
 * APY_SANITY_LIMIT) may NEVER be displayed or counted. Honest numbers, no hype.
 *
 * Phase 1 ships the mechanism + verified sample output only. It does NOT wire
 * pages into the sitemap, vercel.json, or internal links — that (and the
 * canonical-consolidation decision vs the ?token= app URLs) is phase 2, after
 * a networked run produces real pages a human can review. See specs/014.md.
 *
 * Usage:
 *   node generate-token-pages.js                 # fetch live API, write tokens/
 *   node generate-token-pages.js --fixture f.json  # offline: read pools from disk
 *   node generate-token-pages.js --limit 100 --out tokens
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Canonical site URL — matches plan.html / home.html / generate-stories.js
const SITE_URL = 'https://www.defi.garden';
const YIELDS_API = 'https://yields.llama.fi/pools';

// --- Sanity rails & eligibility --------------------------------------------
// APY_SANITY_LIMIT is a TRUST RAIL (mirrors app.js:729 / planner.js): a pool
// whose total APY exceeds it may NEVER be shown or counted — untouched here.
//
// MIN_POOL_TVL is this SEO generator's OWN eligibility floor and DELIBERATELY
// diverges from the app's DEFAULT_MIN_TVL ($10M, app.js:730) per human directive
// 2026-07-11: the app's $10M floor governs what enters a savings PLAN (caution);
// these static token pages exist to capture long-tail search traffic from newer
// tokens, which a $10M floor + 2-pool minimum shut out. The pages still show
// only real, non-anomalous pools — just down to a $100K floor, any count >= 1.
const MIN_POOL_TVL = 100000;      // $100K eligibility floor for a page's pools
const APY_SANITY_LIMIT = 1000;    // TRUST RAIL: total APY above this may NEVER be shown
const MIN_QUALIFYING_POOLS = 1;   // a token needs >=1 qualifying pool to earn a page
const DEFAULT_LIMIT = 0;          // 0 = no cap: a page for every eligible token
const POOLS_PER_PAGE = 8;         // how many pools to list on each page

// Token symbol validity — mirrors generate-sitemap.js isValidToken.
const TOKEN_REGEX = /^[A-Z0-9][A-Z0-9.\-_]{1,14}$/i;

function poolTotalApy(pool) {
  return (pool.apyBase || 0) + (pool.apyReward || 0);
}
function isAnomalousApy(pool) {
  return poolTotalApy(pool) > APY_SANITY_LIMIT;
}
function isQualifyingPool(pool) {
  return (pool.tvlUsd || 0) >= MIN_POOL_TVL && !isAnomalousApy(pool);
}
function isValidToken(symbol) {
  if (!symbol) return false;
  return TOKEN_REGEX.test(symbol);
}
function tokenSymbols(pool) {
  return (pool.symbol ? String(pool.symbol).split(/[-_\/\s]/) : [])
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
}

// --- en-US formatting helpers (mirror app.js formatUsd/formatApy) ----------
function formatUsd(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return '$' + (v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function formatApy(pct) {
  return (Number(pct) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// URL/filesystem-safe slug for a token symbol.
function tokenSlug(symbol) {
  return String(symbol).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Aggregate pools into ranked token records.
 * Returns [{ symbol, slug, totalTvl, qualifyingCount, pools:[...] }] sorted by
 * totalTvl desc, filtered to tokens with >= MIN_QUALIFYING_POOLS, capped at limit.
 * Anomalous pools never count toward the gate and never enter `pools`.
 */
function rankTopTokens(pools, limit) {
  // cap: falsy/0/undefined = no cap (a page for every eligible token).
  const cap = (limit == null ? DEFAULT_LIMIT : limit);
  const byToken = new Map(); // symbol -> { totalTvl, qualifyingCount, pools:[] }

  pools.forEach(p => {
    if (isAnomalousApy(p)) return;            // trust rail: never display/count anomalies
    if ((p.tvlUsd || 0) < MIN_POOL_TVL) return; // eligibility floor
    tokenSymbols(p).forEach(sym => {
      if (!isValidToken(sym)) return;
      if (!byToken.has(sym)) byToken.set(sym, { totalTvl: 0, qualifyingCount: 0, pools: [] });
      const rec = byToken.get(sym);
      rec.totalTvl += (p.tvlUsd || 0);
      rec.qualifyingCount += 1;
      rec.pools.push(p);
    });
  });

  const records = [];
  byToken.forEach((rec, symbol) => {
    if (rec.qualifyingCount < MIN_QUALIFYING_POOLS) return; // 013 gate: skip thin tokens
    rec.pools.sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0));
    records.push({
      symbol,
      slug: tokenSlug(symbol),
      totalTvl: rec.totalTvl,
      qualifyingCount: rec.qualifyingCount,
      pools: rec.pools.slice(0, POOLS_PER_PAGE)
    });
  });

  records.sort((a, b) => b.totalTvl - a.totalTvl);
  return (cap && cap > 0) ? records.slice(0, cap) : records;
}

/** Render a single token's static landing page as an HTML string. */
function renderTokenPage(rec) {
  const sym = escapeHtml(rec.symbol);
  const pageUrl = `${SITE_URL}/tokens/${rec.slug}`;
  const appUrl = `${SITE_URL}/?token=${encodeURIComponent(rec.symbol)}`;
  const bestApy = Math.max(...rec.pools.map(poolTotalApy));
  const title = `${sym} DeFi Yields — Live Pools by TVL | DeFi Garden 🌱`;
  const poolWord = rec.qualifyingCount === 1 ? 'pool' : 'pools';
  const description =
    `${rec.qualifyingCount} live ${sym} ${poolWord} above the $100K TVL floor, up to ` +
    `${formatApy(bestApy)} APY, across ${new Set(rec.pools.map(p => p.chain)).size} chains. ` +
    `Honest yields from DefiLlama data — no anomalous rates.`;

  const rows = rec.pools.map(p => `        <tr>
          <td>${escapeHtml(p.project || '—')}</td>
          <td>${escapeHtml(p.chain || '—')}</td>
          <td class="num">${formatApy(poolTotalApy(p))}</td>
          <td class="num">${formatUsd(p.tvlUsd)}</td>
        </tr>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${pageUrl}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${SITE_URL}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="robots" content="index,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
    <style>
      :root { color-scheme: light dark; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 820px; margin: 0 auto; padding: 24px; line-height: 1.6; }
      h1 { font-size: 1.6rem; margin-bottom: 4px; }
      .sub { color: #64748b; margin-top: 0; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
      td.num, th.num { text-align: right; }
      .cta { display: inline-block; margin: 12px 0 24px; padding: 12px 20px; border: 1px solid #3b82f6; border-radius: 10px; color: #3b82f6; text-decoration: none; font-weight: 600; }
      .note { color: #64748b; font-size: 0.9rem; }
      .scroll { overflow-x: auto; }
    </style>
</head>
<body>
    <h1>${sym} DeFi Yields</h1>
    <p class="sub">${escapeHtml(String(rec.qualifyingCount))} live ${poolWord} above the $100K TVL floor · ranked by TVL</p>
    <a class="cta" href="${appUrl}">See live ${sym} pools &rarr;</a>
    <div class="scroll">
    <table>
      <thead>
        <tr><th>Protocol</th><th>Chain</th><th class="num">APY</th><th class="num">TVL</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
    </div>
    <p class="note">Yields are live from DefiLlama and pass DeFi Garden's trust filters (≥ $100K TVL, anomalous rates excluded). Not financial advice — education only.</p>
    <p class="note"><a href="${SITE_URL}/">DeFi Garden 🌱</a> — plan your DeFi savings by goal.</p>
</body>
</html>
`;
}

// --- IO layer (only runs as a script) --------------------------------------
function fetchPoolData() {
  return new Promise((resolve, reject) => {
    https.get(YIELDS_API, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (e) { reject(new Error('parse failed: ' + e.message)); }
      });
    }).on('error', (e) => reject(new Error('API request failed: ' + e.message)));
  });
}

function parseArgs(argv) {
  const args = { fixture: process.env.POOLS_FIXTURE || null, out: 'tokens', limit: DEFAULT_LIMIT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixture') args.fixture = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10) || DEFAULT_LIMIT;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let pools;
  if (args.fixture) {
    console.log('📄 Loading pools from fixture:', args.fixture);
    const raw = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
    pools = raw.data || raw;
  } else {
    console.log('📡 Fetching pools from DefiLlama...');
    pools = await fetchPoolData();
  }
  console.log(`✅ ${pools.length} pools`);

  const ranked = rankTopTokens(pools, args.limit);
  console.log(`🏆 Top ${ranked.length} tokens by TVL (>= ${MIN_QUALIFYING_POOLS} qualifying pools each)`);

  const outDir = path.resolve(args.out);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  ranked.forEach(rec => {
    fs.writeFileSync(path.join(outDir, `${rec.slug}.html`), renderTokenPage(rec));
  });
  console.log(`📝 Wrote ${ranked.length} pages to ${args.out}/`);
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}

module.exports = {
  rankTopTokens, renderTokenPage, tokenSlug, isQualifyingPool, isAnomalousApy,
  isValidToken, poolTotalApy, formatUsd, formatApy,
  MIN_POOL_TVL, APY_SANITY_LIMIT, MIN_QUALIFYING_POOLS, DEFAULT_LIMIT, SITE_URL
};
