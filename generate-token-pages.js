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

// --- Analytics bootstrap (039) -----------------------------------------------
// Zero of these generated pages loaded analytics.js before this — an
// untracked, unmeasurable chunk of the SEO investment (specs/039.md). This is
// the SAME Mixpanel stub loader + analytics.js pipeline home.html/plan.html
// use (home.html:141-150), reproduced with String.raw so its regex literal
// (/^\/\//) survives untouched — no logic change to Mixpanel's own snippet.
const MIXPANEL_STUB = String.raw`window.MIXPANEL_CUSTOM_LIB_URL = "https://mp.defi.garden/lib.min.js";
        (function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for (var d = {}, e = ["get_group"].concat(Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\/\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
        mixpanel.init("f22917d9da245858a6789c9e5d412c36", { debug: false, track_pageview: false, persistence: "localStorage", api_host: "https://mp.defi.garden" });`;

/** Analytics bootstrap block for a generated static page: Mixpanel stub +
 * analytics.js + one explicit page_view on window 'load' (analytics.js's own
 * load listener only fires session_start — page_view has always been an
 * explicit per-page call, mirroring app.js's existing trackPageView sites). */
function renderAnalyticsBootstrap(pagePath, properties) {
  return `    <script type="text/javascript">
        ${MIXPANEL_STUB}
    </script>
    <script defer src="${SITE_URL}/analytics.js"></script>
    <script>
      window.addEventListener('load', function () {
        if (window.Analytics && typeof Analytics.trackPageView === 'function') {
          Analytics.trackPageView(${JSON.stringify(pagePath)}, ${JSON.stringify(properties || {})});
        }
      });
    </script>`;
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
    const shown = rec.pools.slice(0, POOLS_PER_PAGE); // top-N by TVL — what the page displays
    // Quality bar (030 / 032 / 033): the DISPLAYED table must show at least one
    // VISIBLE non-zero yield — an APY that doesn't round to "0.00%". Gate on the
    // SHOWN slice, not all pools: a pool at 0.003% renders "0.00%" (032), and a
    // yield-bearing pool ranked beyond POOLS_PER_PAGE isn't on the page at all
    // (033) — either way an all-"0.00%" table is thin/low-quality and dropped.
    if (!shown.some(p => formatApy(poolTotalApy(p)) !== '0.00%')) return;
    records.push({
      symbol,
      slug: tokenSlug(symbol),
      totalTvl: rec.totalTvl,
      qualifyingCount: rec.qualifyingCount,
      pools: shown
    });
  });

  records.sort((a, b) => b.totalTvl - a.totalTvl);
  return (cap && cap > 0) ? records.slice(0, cap) : records;
}

/**
 * Related tokens for internal linking (023): up to `n` other ranked tokens,
 * co-chain ones first (share a chain with `rec`), then top-TVL others. `all`
 * arrives TVL-desc so ordering is preserved. Internal links keep pages out of
 * the orphan set (2026 SEO: unlinked pages don't get indexed).
 */
function relatedFor(rec, all, n) {
  const cap = n || 6;
  const chains = new Set(rec.pools.map(p => p.chain));
  const others = (all || []).filter(r => r.symbol !== rec.symbol);
  const coChain = others.filter(r => r.pools.some(p => chains.has(p.chain)));
  const coSet = new Set(coChain);
  const rest = others.filter(r => !coSet.has(r));
  return coChain.concat(rest).slice(0, cap).map(r => ({ symbol: r.symbol, slug: r.slug }));
}

/** Render a single token's static landing page as an HTML string. */
function renderTokenPage(rec, related) {
  const sym = escapeHtml(rec.symbol);
  const pageUrl = `${SITE_URL}/tokens/${rec.slug}`;
  const appUrl = `${SITE_URL}/?token=${encodeURIComponent(rec.symbol)}`;
  const bestApy = Math.max(...rec.pools.map(poolTotalApy));
  const chainCount = new Set(rec.pools.map(p => p.chain)).size;
  const title = `${sym} DeFi Yields — Live Pools by TVL | DeFi Garden 🌱`;
  const poolWord = rec.qualifyingCount === 1 ? 'pool' : 'pools';
  const chainWord = chainCount === 1 ? 'chain' : 'chains';
  const description =
    `${rec.qualifyingCount} live ${sym} ${poolWord} above the $100K TVL floor, up to ` +
    `${formatApy(bestApy)} APY, across ${chainCount} ${chainWord}. ` +
    `Honest yields from DefiLlama data — no anomalous rates.`;

  // Unique per-token intro from real data (023: content depth — this reads
  // token-specifically even with the symbol removed, so it's not thin).
  const top = rec.pools[0];
  const intro =
    `${sym}'s largest live pool is ${escapeHtml(top.project || '—')} on ${escapeHtml(top.chain || '—')} ` +
    `at ${formatApy(poolTotalApy(top))} (${formatUsd(top.tvlUsd)} TVL). ` +
    `${rec.qualifyingCount} ${sym} ${poolWord} across ${chainCount} ${chainWord} clear ` +
    `DeFi Garden's $100K TVL floor, ${formatUsd(rec.totalTvl)} in total.`;

  const relatedLinks = (related || []).map(r =>
    `<a href="${SITE_URL}/tokens/${r.slug}">${escapeHtml(r.symbol)}</a>`).join('\n        ');
  const relatedBlock = relatedLinks
    ? `    <nav class="related" aria-label="Related tokens">
      <h2>Related tokens</h2>
      <div class="related-links">
        ${relatedLinks}
      </div>
    </nav>\n`
    : '';

  const rows = rec.pools.map(p => {
    // Each pool links to its detail page (the app matches pool.pool ===
    // urlParams.pool). Falls back to the token app view if no id.
    const poolHref = p.pool ? `${SITE_URL}/?pool=${encodeURIComponent(p.pool)}` : appUrl;
    return `        <tr>
          <td><a class="tp-pool-link" href="${poolHref}">${escapeHtml(p.project || '—')} &rarr;</a></td>
          <td>${escapeHtml(p.chain || '—')}</td>
          <td class="num">${formatApy(poolTotalApy(p))}</td>
          <td class="num">${formatUsd(p.tvlUsd)}</td>
        </tr>`;
  }).join('\n');

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
    <!-- Reuse the app's design system: style.css defines the neumorphic tokens
         (--color-*, --neuro-*) + the brand gradient body. The scoped block below
         styles this page with those tokens only — no hardcoded colors/gradients. -->
    <link rel="stylesheet" href="/style.css">
    <style>
      .tp-wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px; }
      .tp-wrap h1 { font-size: 1.7rem; margin: 0 0 4px; color: var(--color-text); }
      .tp-wrap .sub { color: var(--color-text-secondary); margin: 0 0 16px; }
      .tp-wrap .intro { color: var(--color-text); margin: 4px 0 22px; line-height: 1.6; }
      .tp-card { background: var(--color-surface); border-radius: var(--neuro-radius-lg); box-shadow: var(--neuro-shadow-raised); padding: 8px 18px; margin: 20px 0; }
      .tp-card table { width: 100%; border-collapse: collapse; }
      .tp-card th, .tp-card td { text-align: left; padding: 13px 8px; border-bottom: 1px solid var(--color-border); color: var(--color-text); }
      .tp-card th { color: var(--color-text-secondary); font-weight: 600; }
      .tp-card td.num, .tp-card th.num { text-align: right; }
      .tp-card tr:last-child td { border-bottom: none; }
      .tp-card tbody tr { transition: background .15s ease; }
      .tp-card tbody tr:hover { background: var(--color-background); }
      .tp-pool-link { color: var(--color-primary); text-decoration: none; font-weight: 500; }
      .tp-pool-link:hover { text-decoration: underline; }
      .tp-pool-link:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--neuro-radius-sm); }
      @media (prefers-reduced-motion: reduce) { .tp-card tbody tr { transition: none; } }
      .tp-cta { display: inline-block; margin: 8px 0 4px; padding: 14px 24px; background: var(--color-surface); color: var(--color-primary); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-raised); text-decoration: none; font-weight: 600; transition: box-shadow .2s ease, transform .2s ease; }
      .tp-cta:hover { box-shadow: var(--neuro-shadow-flat); transform: translateY(-2px); }
      .tp-cta:active { box-shadow: var(--neuro-shadow-pressed); transform: translateY(1px); }
      .tp-cta:focus-visible { outline: none; box-shadow: var(--focus-ring); }
      .related { margin: 30px 0 8px; }
      .related h2 { font-size: 1rem; margin-bottom: 12px; color: var(--color-text); }
      .related-links a { display: inline-block; margin: 0 8px 8px 0; padding: 8px 14px; background: var(--color-surface); color: var(--color-primary); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-subtle); text-decoration: none; font-size: .9rem; transition: box-shadow .2s ease; }
      .related-links a:hover { box-shadow: var(--neuro-shadow-flat); }
      .related-links a:active { box-shadow: var(--neuro-shadow-pressed); }
      .related-links a:focus-visible { outline: none; box-shadow: var(--focus-ring); }
      .tp-wrap .note { color: var(--color-text-secondary); font-size: .9rem; }
      .scroll { overflow-x: auto; }
      @media (prefers-reduced-motion: reduce) { .tp-cta, .related-links a { transition: none; } }
    </style>
${renderAnalyticsBootstrap(`/tokens/${rec.slug}`, { page_type: 'token_landing', token: rec.symbol, pool_count: rec.qualifyingCount })}
</head>
<body>
  <main class="tp-wrap">
    <h1>${sym} DeFi Yields</h1>
    <p class="sub">${escapeHtml(String(rec.qualifyingCount))} live ${poolWord} above the $100K TVL floor · ranked by TVL</p>
    <p class="intro">${intro}</p>
    <a class="tp-cta" href="${appUrl}">See live ${sym} pools &rarr;</a>
    <div class="tp-card">
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
    </div>
${relatedBlock}    <p class="note">Yields are live from DefiLlama and pass DeFi Garden's trust filters (≥ $100K TVL, anomalous rates excluded). Not financial advice — education only.</p>
    <p class="note"><a href="${SITE_URL}/">DeFi Garden 🌱</a> — plan your DeFi savings by goal.</p>
  </main>
</body>
</html>
`;
}

/** Render a sitemap (urlset) of all generated /tokens/<slug> URLs (021). */
function renderTokenSitemap(ranked, lastmod) {
  const urls = (ranked || []).map(rec =>
    `  <url>\n    <loc>${SITE_URL}/tokens/${rec.slug}</loc>\n` +
    (lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '') +
    `    <changefreq>daily</changefreq>\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
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
  const args = { fixture: process.env.POOLS_FIXTURE || null, out: 'tokens', limit: DEFAULT_LIMIT, sitemap: 'sitemap-token-pages.xml' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixture') args.fixture = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10) || DEFAULT_LIMIT;
    else if (argv[i] === '--sitemap') args.sitemap = argv[++i];
    else if (argv[i] === '--no-sitemap') args.sitemap = null;
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
  // Clean stale pages first so tokens dropped by the gate (030) / renamed slugs
  // don't linger from a previous run. Only *.html is removed (never other files,
  // and never if --out points at cwd) — the CI commit then stages the deletions.
  if (outDir !== process.cwd()) {
    fs.readdirSync(outDir).forEach(f => {
      if (f.endsWith('.html')) fs.rmSync(path.join(outDir, f));
    });
  }
  ranked.forEach(rec => {
    fs.writeFileSync(path.join(outDir, `${rec.slug}.html`), renderTokenPage(rec, relatedFor(rec, ranked)));
  });
  console.log(`📝 Wrote ${ranked.length} pages to ${args.out}/`);

  if (args.sitemap) {
    const lastmod = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.resolve(args.sitemap), renderTokenSitemap(ranked, lastmod));
    console.log(`🗺️  Wrote ${args.sitemap} (${ranked.length} URLs)`);
  }
}

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}

module.exports = {
  rankTopTokens, renderTokenPage, relatedFor, renderTokenSitemap, tokenSlug, isQualifyingPool, isAnomalousApy,
  isValidToken, poolTotalApy, formatUsd, formatApy, renderAnalyticsBootstrap,
  MIN_POOL_TVL, APY_SANITY_LIMIT, MIN_QUALIFYING_POOLS, DEFAULT_LIMIT, SITE_URL
};
