#!/usr/bin/env node

/**
 * LLM Files Generator for DeFi Garden
 * Generates llms.txt and llms-full.txt based on sitemap.xml and DefiLlama API data
 * Following best practices for LLM-friendly content discovery
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
// REUSE (spec 180 R2, never a second slug implementation): the same
// `tokenSlug` export `generate-chain-pages.js:41` imports as `chainSlug` for
// its /chains/<slug> filenames — this generator retargets AT those exact
// slugs, so it must compute them identically or a retarget could land on a
// URL that was never actually generated.
const { tokenSlug } = require('./generate-token-pages.js');

// Configuration with environment variable overrides
const SITE_URL = process.env.SITE_URL || 'https://www.defi.garden';
const SITEMAP_PATH = process.env.SITEMAP_PATH || path.resolve('./sitemap.xml');
const OUTPUT_DIR = process.env.LLMS_OUTPUT_DIR || path.dirname(SITEMAP_PATH);
const DEFILLAMA_YIELDS_URL = process.env.DEFILLAMA_YIELDS_URL || 'https://yields.llama.fi/pools';
// spec 180 R3 / Territory T2: the committed pools snapshot audit-app.js's own
// text-surface level-3 re-check reads (apyBase+apyReward shape, no `apy`
// field) — read-only here, this generator never writes it.
const SNAPSHOT_PATH = process.env.LLMS_SNAPSHOT_PATH || path.resolve('./data/pools-snapshot.json');

// Trust-rail constants — read-only MIRRORS of the product's own rails, never a
// second source of truth. `app.js:800` (`APY_SANITY_LIMIT = 1000`) and
// `app.js:801` (`DEFAULT_MIN_TVL = 10000000`, i.e. $10M) are canonical; this
// generator must not drift from what the analytics app itself enforces (spec
// 159 — the AI-discovery surface was publishing anomalous APYs the product
// would never show). Do not change these values here; changing the rails
// themselves is a human-gated decision made in app.js.
const APY_SANITY_LIMIT = 1000; // mirrors app.js:800
const MIN_TVL_USD = 10000000; // mirrors app.js:801 (DEFAULT_MIN_TVL, $10M)

/**
 * Render a USD TVL floor as an abbreviated, en-US-formatted string (e.g.
 * 10000000 -> "$10M"), for use in TL;DR copy that must derive from
 * MIN_TVL_USD rather than hardcoding a second literal. Money formatting is
 * pinned to en-US throughout this repo (never a bare `toLocaleString()`).
 */
function formatTvlFloor(usd) {
  const n = Number(usd) || 0;
  if (n >= 1e9) return `$${(n / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 })}B`;
  if (n >= 1e6) return `$${(n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
  if (n >= 1e3) return `$${(n / 1e3).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`;
  return `$${n.toLocaleString('en-US')}`;
}

/**
 * URL for a single pool row (spec 166). Deep-links to pool-detail —
 * `/?pool=<id>` — when the pool carries a real `pool` id (the router's
 * north-star surface per the 2026-07-23 standing decision); falls back to the
 * existing `?token=<symbol>&chain=<chain>` grid-level link only when the id is
 * absent. A `.url` field is never present on the DefiLlama payload — it
 * doesn't exist, don't read it (spec 166 class 1: that fallback fired on
 * 100% of rows, always).
 */
function poolUrl(pool, baseUrl) {
  if (pool && typeof pool.pool === 'string' && pool.pool.length > 0) {
    return `${baseUrl}/?pool=${encodeURIComponent(pool.pool)}`;
  }
  return `${baseUrl}/?token=${encodeURIComponent(pool && pool.symbol || '')}&chain=${encodeURIComponent(pool && pool.chain || '')}`;
}

// Logging utilities with prefix
function log(msg) { console.log(`🤖 [llms] ${msg}`); }
function err(msg, e) { console.error(`❌ [llms][error] ${msg}${e ? `: ${e.message}` : ''}`); }

/**
 * Parse sitemap.xml (Index) and extract all URLs from sub-sitemaps
 */
async function parseSitemap(sitemapPath) {
  try {
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    const parser = new XMLParser({ ignoreAttributes: false });
    const data = parser.parse(xml);
    
    let allUrls = [];

    // Check if it's a sitemap index
    if (data.sitemapindex) {
      log('Detected sitemap index. Parsing sub-sitemaps...');
      const sitemaps = Array.isArray(data.sitemapindex.sitemap) 
        ? data.sitemapindex.sitemap 
        : [data.sitemapindex.sitemap];
      
      for (const sm of sitemaps) {
        const loc = sm.loc;
        if (!loc) continue;
        
        // If it's a local file (same directory as sitemap.xml)
        const filename = path.basename(loc);
        const subSitemapPath = path.resolve(path.dirname(sitemapPath), filename);
        
        if (fs.existsSync(subSitemapPath)) {
          log(`Reading sub-sitemap: ${filename}`);
          const subXml = fs.readFileSync(subSitemapPath, 'utf8');
          const subData = parser.parse(subXml);
          const entries = Array.isArray(subData.urlset?.url) 
            ? subData.urlset.url 
            : (subData.urlset?.url ? [subData.urlset.url] : []);
          
          const subUrls = entries.map(entry => entry.loc).filter(Boolean);
          allUrls = allUrls.concat(subUrls);
        } else {
          log(`Warning: Sub-sitemap file not found locally: ${subSitemapPath}`);
        }
      }
    } else if (data.urlset) {
      // Standard single sitemap
      const entries = Array.isArray(data.urlset.url) 
        ? data.urlset.url 
        : (data.urlset.url ? [data.urlset.url] : []);
      allUrls = entries.map(entry => entry.loc).filter(Boolean);
    }
    
    log(`Parsed total of ${allUrls.length} URLs`);
    return Array.from(new Set(allUrls)).sort(); // Dedupe and sort for consistency
  } catch (error) {
    throw new Error(`Failed to parse sitemap: ${error.message}`);
  }
}

/**
 * Infer base URL from sitemap URLs
 */
function inferBaseUrl(urls) {
  const home = urls.find(url => {
    try {
      const parsed = new URL(url);
      return parsed.pathname === '/' || parsed.pathname === '';
    } catch {
      return false;
    }
  });
  
  if (home) {
    const parsed = new URL(home);
    return `${parsed.protocol}//${parsed.host}`;
  }
  
  return SITE_URL; // Fallback to configured site URL
}

/**
 * Categorize URLs based on DeFi Garden's URL patterns
 */
function categorizeUrls(urls, baseUrl) {
  const categories = {
    homepage: [],
    tokens: [],
    chains: [], 
    poolTypes: [],
    highValue: [],
    other: []
  };

  urls.forEach(url => {
    try {
      const parsed = new URL(url);
      const searchParams = new URLSearchParams(parsed.search);
      
      // Homepage - exact base URL with no query parameters
      if (parsed.href === baseUrl || (parsed.pathname === '/' && !parsed.search)) {
        categories.homepage.push(url);
      }
      // Token-specific pages
      else if (searchParams.has('token')) {
        categories.tokens.push(url);
      }
      // Chain-specific pages (chain only, no token)
      else if (searchParams.has('chain') && !searchParams.has('token')) {
        categories.chains.push(url);
      }
      // Pool type pages
      else if (searchParams.has('poolTypes')) {
        categories.poolTypes.push(url);
      }
      // High-value filter pages (TVL/APY filters)
      else if (searchParams.has('minTvl') || searchParams.has('minApy')) {
        categories.highValue.push(url);
      }
      // Everything else
      else {
        categories.other.push(url);
      }
    } catch {
      // Skip malformed URLs
    }
  });

  log(`URL categories: homepage(${categories.homepage.length}), tokens(${categories.tokens.length}), chains(${categories.chains.length}), poolTypes(${categories.poolTypes.length}), highValue(${categories.highValue.length}), other(${categories.other.length})`);
  
  return categories;
}

/**
 * Fetch yield data from DefiLlama API safely
 */
async function fetchYieldsSafe() {
  return new Promise((resolve) => {
    log('Fetching yield data from DefiLlama API...');
    
    const request = https.get(DEFILLAMA_YIELDS_URL, {
      headers: {
        'User-Agent': 'defi-garden-llm-generator/1.0',
        'Accept': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const pools = json.data || json.pools || json || [];
          log(`Fetched ${pools.length} pools from DefiLlama`);
          resolve({ yields: pools, sourceTs: new Date().toISOString() });
        } catch (parseError) {
          err('Failed to parse DefiLlama response', parseError);
          resolve({ yields: [], sourceTs: null });
        }
      });
    });

    request.on('error', (error) => {
      err('DefiLlama API request failed', error);
      resolve({ yields: [], sourceTs: null });
    });

    request.on('timeout', () => {
      err('DefiLlama API request timed out');
      request.destroy();
      resolve({ yields: [], sourceTs: null });
    });
  });
}

// 113: load pools from the shared $1000-floored SEO transient, failing SAFE to
// a live fetch. Returns an array only when the fixture holds a non-empty pool
// array; otherwise null so the caller live-fetches (never a truncated/empty run
// that would degrade the llms SEO surface). Mirrors the token/chain/sitemap
// generators' identical helper.
function loadFixturePools(fixturePath) {
  if (!fixturePath) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const arr = raw && raw.data ? raw.data : raw;
    if (Array.isArray(arr) && arr.length > 0) return arr;
    log('Fixture empty — live fallback: ' + fixturePath);
    return null;
  } catch (e) {
    log('Fixture missing/malformed — live fallback: ' + fixturePath + ' (' + e.message + ')');
    return null;
  }
}

function parseFixtureArg(argv) {
  let fixture = process.env.POOLS_FIXTURE || null;
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--fixture') fixture = argv[++i];
  return fixture;
}

/**
 * The single trust-rail predicate for this generator (spec 168): a pool must
 * clear the same TVL floor + APY sanity ceiling the product itself enforces
 * (app.js:800/801) before it may reach ANY AI-discovery surface — the ranked
 * "Current Top Yields" list (pickHighYield, spec 159) or a derived rate like
 * `plannerRate()` (spec 168). One source of truth; do not re-inline this
 * filter anywhere else in this file.
 */
function isRailPassing(pool, minTvlUsd = MIN_TVL_USD) {
  const tvl = Number(pool.tvlUsd) || 0;
  const apy = Number(pool.apy) || 0;
  return tvl >= minTvlUsd && apy > 0 && isFinite(apy) && apy <= APY_SANITY_LIMIT;
}

/**
 * Select high-yield opportunities from pool data
 */
function pickHighYield(pools, options = {}) {
  const { minTvlUsd = MIN_TVL_USD, topN = 15 } = options;

  if (!pools || pools.length === 0) {
    return { top: [], byChain: {} };
  }

  // Filter pools with sufficient TVL and valid, sane APY. The APY ceiling
  // mirrors app.js's APY_SANITY_LIMIT: anomalous pools (data errors, thin-pool
  // farm-rate spikes) must never reach this AI-discovery surface, the same way
  // they can never enter a planner projection (spec 159).
  const filtered = pools.filter(pool => isRailPassing(pool, minTvlUsd));

  // Sort by APY descending
  filtered.sort((a, b) => Number(b.apy) - Number(a.apy));
  
  const top = filtered.slice(0, topN);
  
  // Group by chain for detailed view
  const byChain = top.reduce((acc, pool) => {
    const chain = pool.chain || 'Unknown';
    if (!acc[chain]) acc[chain] = [];
    acc[chain].push(pool);
    return acc;
  }, {});

  log(`Selected ${top.length} high-yield opportunities from ${filtered.length} eligible pools`);
  return { top, byChain };
}

/**
 * Median APY across the FULL rail-passing pool set (spec 168) — deliberately
 * NOT the top-15 slice `pickHighYield()` uses for its leaderboard. A median
 * over the whole eligible set is the conservative, representative "what does
 * the market actually pay" figure; a top-N slice is a leaderboard of winners
 * and would overstate what a real plan earns. Reuses `isRailPassing()` — no
 * second selection rule. Returns `{ medianApy, eligibleCount }`, or `null`
 * when no pool clears the rails (the generator's own empty-input safety net,
 * separate from the `pickHighYield()` empty branch).
 */
function plannerRate(pools, options = {}) {
  const { minTvlUsd = MIN_TVL_USD } = options;
  if (!pools || pools.length === 0) return null;

  const eligible = pools.filter(pool => isRailPassing(pool, minTvlUsd));
  if (eligible.length === 0) return null;

  const apys = eligible.map(pool => Number(pool.apy)).sort((a, b) => a - b);
  const mid = Math.floor(apys.length / 2);
  const medianApy = apys.length % 2 === 0
    ? (apys[mid - 1] + apys[mid]) / 2
    : apys[mid];

  return { medianApy, eligibleCount: eligible.length };
}

/**
 * Analyze yield data to extract insights for LLM content
 */
function analyzeYieldData(pools) {
  if (!pools || pools.length === 0) {
    return {
      topChainsByTvl: [],
      topProtocols: [],
      popularTokens: [],
      topTokenChainCombos: []
    };
  }

  // Aggregate data by chain, protocol, and token
  const chainTvl = new Map();
  const protocolTvl = new Map();
  const tokenTvl = new Map();
  const tokenChainTvl = new Map();

  pools.forEach(pool => {
    const tvl = Number(pool.tvlUsd) || 0;
    if (tvl <= 0) return;

    // Chain aggregation
    if (pool.chain) {
      chainTvl.set(pool.chain, (chainTvl.get(pool.chain) || 0) + tvl);
    }

    // Protocol aggregation
    if (pool.project) {
      protocolTvl.set(pool.project, (protocolTvl.get(pool.project) || 0) + tvl);
    }

    // Token aggregation (extract from symbol)
    if (pool.symbol) {
      const tokens = pool.symbol.split(/[-_\/\s]/).map(s => s.trim().toUpperCase());
      tokens.forEach(token => {
        if (token.length >= 2 && token.length < 20) {
          tokenTvl.set(token, (tokenTvl.get(token) || 0) + tvl);
          
          // Token-chain combination
          const key = `${token}-${pool.chain}`;
          tokenChainTvl.set(key, (tokenChainTvl.get(key) || 0) + tvl);
        }
      });
    }
  });

  // Sort and get top entries
  const topChainsByTvl = Array.from(chainTvl.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([chain, tvl]) => ({ chain, tvl }));

  const topProtocols = Array.from(protocolTvl.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([protocol, tvl]) => ({ protocol, tvl }));

  const popularTokens = Array.from(tokenTvl.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([token, tvl]) => ({ token, tvl }));

  const topTokenChainCombos = Array.from(tokenChainTvl.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([combo, tvl]) => {
      const [token, chain] = combo.split('-');
      return { token, chain, tvl };
    });

  return { topChainsByTvl, topProtocols, popularTokens, topTokenChainCombos };
}

// Placeholder swapped in for the volatile timestamp values when comparing new
// output against the committed file, so a no-content-change run compares equal
// and skips the write (spec 083 — same honest "content as of" treatment 081
// gave sitemap <lastmod>).
const LLMS_TS_PLACEHOLDER = '__DEFI_GARDEN_LLMS_TS__';

/**
 * Normalize the volatile timestamp values in llms.txt / llms-full.txt content
 * to a stable placeholder: the two `- Last Updated: <iso>` lines and the
 * `(fetched: <iso-or-"unavailable">)` value inside `- Data Sources: …`. Any
 * non-string input is returned untouched (caller then treats it as a mismatch).
 */
function normalizeLlmsContent(content) {
  if (typeof content !== 'string') return content;
  return content
    .replace(/^(- Last Updated: ).*$/gm, `$1${LLMS_TS_PLACEHOLDER}`)
    .replace(/^(- Data Sources: sitemap\.xml, DefiLlama API \(fetched: )[^)]*(\))$/gm,
      `$1${LLMS_TS_PLACEHOLDER}$2`);
}

/**
 * Write `newContent` to `filePath` only if it differs from the on-disk file
 * modulo the volatile timestamp lines; otherwise leave the committed file
 * byte-identical (its timestamps preserved). Missing/unreadable file or any
 * unexpected comparison error → write fresh (pre-083 behavior, never crashes
 * the CI pipeline). `now` is used only for the diagnostic log line. Returns
 * true if the file was written.
 */
function writeIfContentChanged(filePath, newContent, now) {
  const label = path.basename(filePath);
  let unchanged = false;
  try {
    const existing = fs.readFileSync(filePath, 'utf8');
    unchanged = normalizeLlmsContent(newContent) === normalizeLlmsContent(existing);
  } catch (e) {
    unchanged = false; // missing/unreadable/compare failure → write fresh
  }
  if (unchanged) {
    log(`${label} unchanged — kept committed timestamps`);
    return false;
  }
  fs.writeFileSync(filePath, newContent, 'utf8');
  log(`${label} content changed — stamped ${now}`);
  return true;
}

/**
 * Shared "## Garden Planner" section emitter (spec 168), used by BOTH
 * buildConcise() and buildFull() — never two divergent copies of this copy.
 * `rate` is the output of `plannerRate()` (or `null`); `opts.full` toggles a
 * couple of extra lines for the fuller llms-full.txt body.
 *
 * Honesty constraints enforced here (acceptance criteria, not style notes):
 *   - every number rendered is `rate.medianApy` / `rate.eligibleCount`,
 *     traceable to the rail-filtered live pool set — nothing else in this
 *     function is a numeric literal beyond that;
 *   - the TVL/APY rail figures quoted in prose come from `formatTvlFloor()`
 *     and `APY_SANITY_LIMIT`, never re-typed as `$10M` / `1000`;
 *   - NO forever-number dollar figure or multiplier is ever emitted — only
 *     the formula in words. Publishing an optimistic capital figure off a
 *     market-wide median is the trust risk this section exists to avoid;
 *   - any subscription-card mention is early-access/waitlist framed — the
 *     card does not exist yet;
 *   - copy ban-list (CLAUDE.md): "save up", "afford", "budget" never appear;
 *   - when `rate` is null, the section renders the same prose and URLs
 *     WITHOUT the rate lines — never `undefined`/`NaN`/`$0`/an empty rate line.
 */
function buildPlannerSection(meta, rate, opts = {}) {
  const lines = [];

  lines.push('## Garden Planner');
  lines.push(
    'TL;DR: A goal-first savings planner for people who think in monthly deposits ' +
    'and life goals, not APY or pools — lives at /plan.html, reached from the ' +
    'search-first landing surface at the site root.'
  );
  lines.push(`- Entry point (bare path, always the planner): ${meta.baseUrl}/plan.html`);
  lines.push(
    `- Example filled plans, real presets carrying no invented numbers: ` +
    `${meta.baseUrl}/?preset=tomoko and ${meta.baseUrl}/?preset=kevin`
  );
  lines.push('- GROWTH: long-horizon goals like retirement or a home — projects future value from steady monthly deposits.');
  lines.push('- TARGET: a specific item to buy — projects time-to-item from monthly deposits and the live rate.');
  lines.push('- SUBSCRIPTION: the "forever number" — the capital whose yield alone covers a recurring bill, indefinitely.');
  lines.push(
    '- Forever number formula: forever number = annual bill ÷ blended rate. ' +
    'No projected dollar figure is published here — a plan\'s own inputs determine the real number.'
  );
  if (opts.full) {
    lines.push(
      '- An early-access waitlist exists for a card that would pay a subscription directly from a ' +
      'position\'s yield; the card itself is not available yet.'
    );
  }

  if (rate) {
    const apyStr = rate.medianApy.toFixed(1);
    lines.push(
      `- Live blended rate: ${apyStr}% — median APY across the ${rate.eligibleCount} pools clearing our ` +
      `published rails (TVL ≥ ${formatTvlFloor(MIN_TVL_USD)}, APY ≤ ${APY_SANITY_LIMIT}%) on the date above.`
    );
    lines.push(
      '- A plan\'s own rate is computed over a different set: the planner picks a small, ' +
      'temperament-filtered selection of pools (the default pace is stablecoin lending/staking only) ' +
      'and blends those, so the rate a plan shows will differ from this market-wide median.'
    );
  }

  return lines;
}

/**
 * Build concise llms.txt content with search-optimized sections.
 *
 * `opts.highApyStakingUrl` (spec 180 R3) overrides the "High APY staking"
 * example's target: `undefined` (the default — every pre-180 call site,
 * including every existing test, keeps working byte-identically) emits the
 * original hardcoded `minApy=10` URL; a string swaps in a repaired URL
 * (`repairMinApyLink()`'s chosen rung, or the same URL with `minApy` dropped
 * entirely); `null` omits the line altogether (no rung resolved). This is
 * the ONLY behavior difference opts may introduce — never a second copy of
 * this function for the gated case.
 */
function buildConcise(meta, categories, highYield, yieldAnalysis, plannerRateResult, opts = {}) {
  const lines = [];

  // Header with single H1 (SEO optimized)
  lines.push('# Find the Best Yields for Your Tokens Across All Chains | DeFi Garden');
  lines.push('');

  // Metadata
  lines.push(`- Last Updated: ${meta.updatedAt}`);
  lines.push(`- Canonical: ${meta.baseUrl}`);
  lines.push(`- Data Sources: sitemap.xml, DefiLlama API`);
  lines.push(`- Total URLs: ${meta.totalUrls}`);
  lines.push('');

  // Homepage section — describes what the router (home.html) actually does
  // (spec 168, corrected after operator review): bare `/` is a search-first
  // landing that routes into both faces, it is NOT itself the planner.
  // `/plan.html` (and planner params) reach the goal-first Garden Planner;
  // parameterized `?token=`/`?chain=`/`?pool=` URLs reach the yield
  // analytics app.
  lines.push('## Homepage');
  lines.push(
    `TL;DR: ${meta.baseUrl}/ is a search-first landing page that routes into both faces of the ` +
    `product: /plan.html (and planner params) for the goal-first Garden Planner, and parameterized ` +
    `URLs (?token=, ?chain=, ?pool=) for the yield analytics app.`
  );
  categories.homepage.slice(0, 3).forEach(url => lines.push(`- ${url}`));
  lines.push('');

  // Garden Planner section (spec 168) — see buildPlannerSection() for the
  // shared copy and its honesty constraints.
  lines.push(...buildPlannerSection(meta, plannerRateResult, { full: false }));
  lines.push('');

  // Top chains by TVL (most searched)
  lines.push('## Top Chains by TVL');
  lines.push('TL;DR: Highest liquidity blockchain networks for DeFi yields.');
  yieldAnalysis.topChainsByTvl.forEach(({ chain, tvl }) => {
    const chainUrl = `${meta.baseUrl}/?chain=${encodeURIComponent(chain)}`;
    const tvlFormatted = `$${(tvl / 1e9).toFixed(1)}B`;
    lines.push(`- ${chain} (${tvlFormatted} TVL) — ${chainUrl}`);
  });
  lines.push('');
  
  // Popular token searches
  lines.push('## Popular Token Yields');
  lines.push('TL;DR: Most searched tokens for yield farming opportunities.');
  const popularSearchTokens = ['USDC', 'USDT', 'ETH', 'WETH', 'DAI', 'BTC', 'WBTC', 'STETH'];
  popularSearchTokens.forEach(token => {
    const tokenUrl = `${meta.baseUrl}/?token=${token}`;
    lines.push(`- ${token} yields across all chains — ${tokenUrl}`);
  });
  lines.push('');
  
  // Top token-chain combinations (common searches)
  lines.push('## Popular Token-Chain Combinations');
  lines.push('TL;DR: Most common "find X yield on Y chain" searches.');
  yieldAnalysis.topTokenChainCombos.slice(0, 8).forEach(({ token, chain, tvl }) => {
    const url = `${meta.baseUrl}/?token=${encodeURIComponent(token)}&chain=${encodeURIComponent(chain)}`;
    const tvlFormatted = tvl > 1e9 ? `$${(tvl / 1e9).toFixed(1)}B` : `$${(tvl / 1e6).toFixed(0)}M`;
    lines.push(`- ${token} on ${chain} (${tvlFormatted} TVL) — ${url}`);
  });
  lines.push('');
  
  // Top protocols by TVL
  lines.push('## Major DeFi Protocols');
  lines.push('TL;DR: Largest protocols by total value locked.');
  yieldAnalysis.topProtocols.slice(0, 6).forEach(({ protocol, tvl }) => {
    const protocolUrl = `${meta.baseUrl}/?protocols=${encodeURIComponent(protocol)}`;
    const tvlFormatted = tvl > 1e9 ? `$${(tvl / 1e9).toFixed(1)}B` : `$${(tvl / 1e6).toFixed(0)}M`;
    lines.push(`- ${protocol} (${tvlFormatted} TVL) — ${protocolUrl}`);
  });
  lines.push('');
  
  // Common search patterns
  lines.push('## Common Search Patterns');
  lines.push('TL;DR: Typical user queries and where to find them.');
  lines.push(`- "Best USDC yields" → ${meta.baseUrl}/?token=USDC`);
  lines.push(`- "USDC yields on Base" → ${meta.baseUrl}/?token=USDC&chain=Base`);
  lines.push(`- "Ethereum lending" → ${meta.baseUrl}/?chain=Ethereum&poolTypes=Lending`);
  lines.push(`- "Pendle opportunities" → ${meta.baseUrl}/?protocols=pendle`);
  // spec 180 R3: this is the one line in the whole surface that carries
  // `minApy` — see buildConcise()'s own opts doc comment above. Never emit a
  // dead `minApy=10` link outright; the gate below decides the real value.
  if (opts.highApyStakingUrl !== null) {
    const highApyStakingUrl = opts.highApyStakingUrl || `${meta.baseUrl}/?poolTypes=Staking&minApy=10`;
    lines.push(`- "High APY staking" → ${highApyStakingUrl}`);
  }
  lines.push(`- "Safe lending USDT" → ${meta.baseUrl}/?token=USDT&poolTypes=Lending`);
  lines.push(`- "Arbitrum LP tokens" → ${meta.baseUrl}/?chain=Arbitrum&poolTypes=LP%2FDEX`);
  lines.push(`- "High TVL pools" → ${meta.baseUrl}/?minTvl=10000000`);
  lines.push(`- "How do I make yield pay a monthly subscription" → ${meta.baseUrl}/plan.html`);
  lines.push(`- "Save toward retirement with crypto yield" → ${meta.baseUrl}/plan.html`);
  lines.push('');
  
  // Current top yields
  lines.push('## Current Top Yields');
  lines.push(`TL;DR: Live highest APY opportunities (updated daily, TVL ≥ ${formatTvlFloor(MIN_TVL_USD)}).`);
  
  if (!highYield.top.length) {
    lines.push('- Live yield data temporarily unavailable from DefiLlama API');
  } else {
    highYield.top.slice(0, 8).forEach(pool => {
      const apy = `${Number(pool.apy).toFixed(1)}%`;
      const tvl = `$${Math.round(Number(pool.tvlUsd) || 0).toLocaleString()}`;
      const name = [pool.chain, pool.project, pool.symbol].filter(Boolean).join(' · ');
      lines.push(`- ${name} — ${apy} APY, ${tvl} TVL — ${poolUrl(pool, meta.baseUrl)}`);
    });
  }
  lines.push('');
  
  // Footer note
  lines.push(`💡 Pro tip: Use natural language like "best ETH staking" or "USDC lending Base" to find opportunities.`);
  lines.push(`📊 For live rates and direct protocol access: ${meta.baseUrl}`);
  
  return lines.join('\n');
}

/**
 * Build comprehensive llms-full.txt content
 */
function buildFull(meta, categories, highYield, yieldAnalysis, plannerRateResult) {
  const lines = [];

  // Header with single H1 (SEO optimized for comprehensive index)
  lines.push('# Complete DeFi Yield Index: Best Token Yields Across All Blockchains | DeFi Garden');
  lines.push('');

  // Extended metadata
  lines.push(`- Last Updated: ${meta.updatedAt}`);
  lines.push(`- Canonical: ${meta.baseUrl}`);
  lines.push(`- Data Sources: sitemap.xml, DefiLlama API (fetched: ${meta.defiLlamaFetchedAt || 'unavailable'})`);
  lines.push(`- Total URLs: ${meta.totalUrls}`);
  lines.push(`- Categories: homepage(${categories.homepage.length}), tokens(${categories.tokens.length}), chains(${categories.chains.length}), poolTypes(${categories.poolTypes.length}), highValue(${categories.highValue.length})`);
  lines.push('');

  // Complete sections with all URLs

  // Homepage — describes what the router actually does (spec 168, corrected
  // after operator review), same wording as buildConcise() for consistency.
  lines.push('## Homepage');
  lines.push(
    `TL;DR: ${meta.baseUrl}/ is a search-first landing page that routes into both faces of the ` +
    `product: /plan.html (and planner params) for the goal-first Garden Planner, and parameterized ` +
    `URLs (?token=, ?chain=, ?pool=) for the yield analytics app.`
  );
  categories.homepage.forEach(url => lines.push(`- ${url}`));
  lines.push('');

  // Garden Planner section (spec 168) — shared emitter, fuller body (opts.full).
  lines.push(...buildPlannerSection(meta, plannerRateResult, { full: true }));
  lines.push('');

  // All token pages
  lines.push('## Token Pages');
  lines.push('TL;DR: Individual token yield analysis and opportunities.');
  categories.tokens.forEach(url => lines.push(`- ${url}`));
  lines.push('');
  
  // All chain pages
  lines.push('## Chain Pages'); 
  lines.push('TL;DR: Blockchain-specific yield markets and protocols.');
  categories.chains.forEach(url => lines.push(`- ${url}`));
  lines.push('');
  
  // Pool type pages
  lines.push('## Pool Type Pages');
  lines.push('TL;DR: Strategy-based categorization (lending, staking, liquidity provision).');
  categories.poolTypes.forEach(url => lines.push(`- ${url}`));
  lines.push('');
  
  // High-value filter pages
  lines.push('## High-Value Filter Pages');
  lines.push('TL;DR: Filtered views for minimum TVL and APY thresholds.');
  categories.highValue.forEach(url => lines.push(`- ${url}`));
  lines.push('');
  
  // Other pages
  if (categories.other.length > 0) {
    lines.push('## Other Pages');
    lines.push('TL;DR: Additional site functionality and tools.');
    categories.other.forEach(url => lines.push(`- ${url}`));
    lines.push('');
  }
  
  // Market analysis sections (if yield data available)
  if (yieldAnalysis && yieldAnalysis.topChainsByTvl.length > 0) {
    lines.push('## Market Analysis: Top Chains by TVL');
    lines.push('TL;DR: Comprehensive chain rankings by total value locked.');
    yieldAnalysis.topChainsByTvl.forEach(({ chain, tvl }) => {
      const chainUrl = `${meta.baseUrl}/?chain=${encodeURIComponent(chain)}`;
      const tvlFormatted = `$${(tvl / 1e9).toFixed(2)}B`;
      lines.push(`- ${chain}: ${tvlFormatted} TVL — ${chainUrl}`);
    });
    lines.push('');
    
    lines.push('## Market Analysis: Top Protocols');
    lines.push('TL;DR: Leading DeFi protocols by aggregate TVL across all pools.');
    yieldAnalysis.topProtocols.forEach(({ protocol, tvl }) => {
      const protocolUrl = `${meta.baseUrl}/?protocols=${encodeURIComponent(protocol)}`;
      const tvlFormatted = tvl > 1e9 ? `$${(tvl / 1e9).toFixed(2)}B` : `$${(tvl / 1e6).toFixed(0)}M`;
      lines.push(`- ${protocol}: ${tvlFormatted} TVL — ${protocolUrl}`);
    });
    lines.push('');
    
    lines.push('## Market Analysis: Popular Token-Chain Combinations');
    lines.push('TL;DR: Most liquid token-chain pairs ranked by TVL.');
    yieldAnalysis.topTokenChainCombos.forEach(({ token, chain, tvl }) => {
      const url = `${meta.baseUrl}/?token=${encodeURIComponent(token)}&chain=${encodeURIComponent(chain)}`;
      const tvlFormatted = tvl > 1e9 ? `$${(tvl / 1e9).toFixed(2)}B` : `$${(tvl / 1e6).toFixed(0)}M`;
      lines.push(`- ${token} on ${chain}: ${tvlFormatted} TVL — ${url}`);
    });
    lines.push('');
  }
  
  // Detailed high-yield opportunities by chain
  lines.push('## Live High-Yield Opportunities (by Chain)');
  lines.push('TL;DR: Current top-performing pools with detailed metrics.');
  
  if (!highYield.top.length) {
    lines.push('- DefiLlama data temporarily unavailable');
  } else {
    Object.entries(highYield.byChain).forEach(([chain, pools]) => {
      lines.push(`### ${chain}`);
      pools.forEach(pool => {
        const apy = `${Number(pool.apy).toFixed(2)}%`;
        const tvl = `$${Math.round(Number(pool.tvlUsd) || 0).toLocaleString()}`;
        const details = [pool.project, pool.symbol].filter(Boolean).join(' · ');
        lines.push(`- ${details} — ${apy} APY, ${tvl} TVL — ${poolUrl(pool, meta.baseUrl)}`);
      });
      lines.push('');
    });
  }
  
  // Disclaimer
  lines.push('## Important Disclaimers');
  lines.push('- Yields are volatile and subject to rapid change');
  lines.push('- Always verify current rates and terms on the protocol websites');
  lines.push('- Smart contract risks apply to all DeFi protocols');
  lines.push(`- For live data and user interface: ${meta.baseUrl}`);
  
  return lines.join('\n');
}

// ===========================================================================
// spec 180: the AI-discovery surface must not publish links to an empty grid.
// One shared helper (R1), two rules that use it (R2 chain-section retarget,
// R3 minApy repair ladder), and two anti-vacuity rails, applied at emit time
// so the gate re-decides every link on every daily bake (drift-resistance —
// see the spec's Hypothesis). Evidence: item 175's level-3 signal found 63
// dead grid links (1 in llms.txt, 62 in llms-full.txt's `## Chain Pages`),
// confined to those two classes — this section fixes exactly those two,
// never a third invented one (spec's own Non-goals).
// ===========================================================================

// The query keys that make a home-path link a "grid link" this gate may
// simulate at all (spec 180 R1, same set backlog 175's audit-side
// LEVEL3_GRID_PARAMS uses, audit-app.js:904 — kept independent per-file, per
// this item's "mirror, never import" instruction, but must stay in sync by
// hand if that set ever changes).
const GRID_LINK_PARAMS = ['token', 'chain', 'poolTypes', 'protocols', 'minTvl', 'minApy'];

// R3's descending rung ladder (spec 180, exact values the spec names).
const MIN_APY_RUNGS = [10, 5, 3, 1];

// Above this fraction of "checked grid links" the gate would retarget-or-omit,
// it refuses to trust its own simulation and emits everything unchanged
// instead (spec 180 anti-vacuity rail 2; today's real measurement is 63/535
// ≈ 11.8%, safely under this).
const STRUCTURAL_TRIPWIRE_FRACTION = 0.4;

/**
 * R1 (spec 180, exported): mirrors the app grid's qualification for a
 * defi.garden home-path link, reusing existing sources only — never a
 * second copy of a rail or a classifier (174/175's rule).
 *   - minTvl: explicit param wins; absent -> MIN_TVL_USD (no new floor
 *     literal). Qualification is `(tvlUsd||0) >= floor && (tvlUsd||0) > 0`
 *     (test_seo_cta_targets.js:117 is the reviewed reference, 175 T6).
 *   - token -> case-insensitive substring on `symbol` (app.js:835).
 *   - chain -> exact `chain` equality.
 *   - protocols -> exact `project` equality.
 *   - poolTypes -> comma-split membership against `getPoolType(pool)`,
 *     lazily required from generate-sitemap.js in a try/catch (the one
 *     classifier, 175 T6). If unavailable, the poolTypes constraint is
 *     DROPPED (never silently — `poolTypesDropped` on the return value lets
 *     every call site count and log the drop, T8).
 *   - minApy -> `apyOf(pool) >= minApy`; `opts.apyOf` defaults to the live
 *     DefiLlama `apy` field, overridable (R3 uses apyBase+apyReward against
 *     the snapshot population, Territory T2 — the snapshot has no `apy`).
 * Applies ONLY to links carrying >=1 of GRID_LINK_PARAMS. `?pool=<id>` is
 * NEVER simulated (175's 4,233-false-positive trap) and path-only URLs are
 * untouched — both return `null` (not "zero pools", genuinely "not this
 * gate's concern") so callers never mistake "not a grid link" for "dead".
 * `opts.getPoolType`, when explicitly passed (including `null`), overrides
 * the lazy require — test-only escape hatch to exercise the drop path
 * without needing generate-sitemap.js to actually be unavailable.
 */
function gridLinkPoolCount(url, pools, opts = {}) {
  let parsed;
  try { parsed = new URL(url); } catch (e) { return null; }
  const sp = parsed.searchParams;
  if (sp.has('pool')) return null; // 175's 4,233-false-positive trap — never simulated
  if (!GRID_LINK_PARAMS.some((k) => sp.has(k))) return null; // not a grid link — untouched

  const token = sp.get('token') || '';
  const chain = sp.get('chain') || '';
  const protocolsVal = sp.get('protocols') || '';
  const poolTypesVal = sp.get('poolTypes') || '';
  const minTvl = sp.has('minTvl') ? (parseInt(sp.get('minTvl'), 10) || 0) : MIN_TVL_USD;
  const hasMinApy = sp.has('minApy');
  const minApyRaw = hasMinApy ? parseFloat(sp.get('minApy')) : NaN;
  const minApy = hasMinApy && isFinite(minApyRaw) ? minApyRaw : null;

  const wantedPoolTypes = poolTypesVal ? poolTypesVal.split(',').filter(Boolean) : [];
  const apyOf = typeof opts.apyOf === 'function' ? opts.apyOf : (p) => Number(p.apy) || 0;

  let getPoolTypeFn = null;
  let poolTypesDropped = false;
  if (wantedPoolTypes.length) {
    if (opts.getPoolType !== undefined) {
      getPoolTypeFn = opts.getPoolType; // test escape hatch (incl. explicit null)
    } else {
      try { getPoolTypeFn = require('./generate-sitemap.js').getPoolType; }
      catch (e) { getPoolTypeFn = null; }
    }
    if (typeof getPoolTypeFn !== 'function') { poolTypesDropped = true; getPoolTypeFn = null; }
  }

  let count = 0;
  for (const p of (pools || [])) {
    const tvl = Number(p.tvlUsd) || 0;
    if (!(tvl >= minTvl && tvl > 0)) continue;
    if (token && !String(p.symbol || '').toUpperCase().includes(token.toUpperCase())) continue;
    if (chain && p.chain !== chain) continue;
    if (protocolsVal && p.project !== protocolsVal) continue;
    if (wantedPoolTypes.length && getPoolTypeFn && !wantedPoolTypes.includes(getPoolTypeFn(p))) continue;
    if (minApy !== null && !(apyOf(p) >= minApy)) continue;
    count++;
  }
  return { count, poolTypesDropped };
}

/**
 * R2 (spec 180): retarget every dead `?chain=<C>` link in `chainUrls`
 * (`## Chain Pages`'s population, `categories.chains`) at the real static
 * `/chains/<slug>` page when the sitemap actually contains one (measured
 * 48/14 split — Territory: the section is mis-targeted, the real pages
 * already exist elsewhere in the file, dumped under `## Other Pages`).
 * `slug` is `tokenSlug()` reused from generate-token-pages.js — never a
 * second slug implementation (same import generate-chain-pages.js:41 uses).
 * A live link (>=1 pool, or not simulatable) is returned byte-unchanged.
 * A dead link with no static counterpart is omitted and counted, never
 * silently dropped.
 *
 * Returns `{ lines, retargetedUrls, retargetedCount, omittedCount,
 * omittedChains, poolTypesDroppedCount }` — `lines` is the full replacement
 * for `categories.chains`, in original order; `retargetedUrls` is the Set of
 * `/chains/<slug>` targets the caller must de-dupe out of `## Other Pages`
 * so each retargeted URL appears exactly once in the file.
 */
function applyChainRetarget(chainUrls, pools, sitemapUrlSet, baseUrl) {
  const lines = [];
  const retargetedUrls = new Set();
  const omittedChains = [];
  let retargetedCount = 0;
  let omittedCount = 0;
  let poolTypesDroppedCount = 0;

  for (const url of chainUrls) {
    let chain = null;
    try { chain = new URL(url).searchParams.get('chain'); } catch (e) { /* fall through, kept as-is below */ }

    const result = gridLinkPoolCount(url, pools);
    if (result && result.poolTypesDropped) poolTypesDroppedCount++;

    if (!result || result.count > 0 || !chain) {
      lines.push(url); // live, or not simulatable — byte-unchanged
      continue;
    }

    const slug = tokenSlug(chain);
    const target = `${baseUrl}/chains/${slug}`;
    if (sitemapUrlSet.has(target)) {
      lines.push(target);
      retargetedUrls.add(target);
      retargetedCount++;
    } else {
      omittedCount++;
      omittedChains.push(chain); // omitted entirely — no honest destination exists
    }
  }

  return { lines, retargetedUrls, retargetedCount, omittedCount, omittedChains, poolTypesDroppedCount };
}

// Read-only apy accessor for the snapshot population (Territory T2): the
// committed data/pools-snapshot.json has NO `apy` field, only
// `apyBase`/`apyReward` — the exact shape audit-app.js:925's own level-3
// re-check reads. Mirrored here so R3's rung choice is validated the SAME
// way the audit will re-validate it.
function snapshotApyOf(pool) {
  return (Number(pool && pool.apyBase) || 0) + (Number(pool && pool.apyReward) || 0);
}

// Clones `url` with its `minApy` param set to `value`, or removed entirely
// when `value` is null/undefined.
function withMinApy(url, value) {
  const u = new URL(url);
  if (value === null || value === undefined) u.searchParams.delete('minApy');
  else u.searchParams.set('minApy', String(value));
  return u.toString();
}

/**
 * R3 (spec 180): a dead grid link carrying `minApy` retries the descending
 * rungs MIN_APY_RUNGS, taking the highest that resolves >=1 pool — if none
 * does, `minApy` is dropped entirely; if the link is STILL empty, it is
 * omitted (never left dead). Territory T2: the rung must resolve under BOTH
 * `pools` (the live/fixture population this generator built the rest of the
 * file from) AND `snapshotPools` (data/pools-snapshot.json, apyBase+
 * apyReward) — because audit-app.js's own level-3 re-check reads the
 * COMMITTED snapshot, not live data, so a rung that only clears live would
 * make the audit go red again the next time it runs. `snapshotPools` may be
 * null (unavailable) — best-effort, never fatal; the caller logs the
 * degraded mode.
 *
 * Returns `{ url, changed, rung, dropped, omitted, poolTypesDroppedCount }`:
 * `changed` false means `url` already resolves under both populations as-is
 * (no repair needed); `url` is null only when `omitted` is true.
 */
function repairMinApyLink(url, pools, snapshotPools, opts = {}) {
  const rungs = opts.rungs || MIN_APY_RUNGS;
  let poolTypesDroppedCount = 0;

  function resolvesIn(candidate, popPools, apyOf) {
    if (!popPools) return true; // population unavailable — never block the choice on it
    const r = gridLinkPoolCount(candidate, popPools, { apyOf });
    if (r && r.poolTypesDropped) poolTypesDroppedCount++;
    return !!(r && r.count > 0);
  }
  function resolvesBoth(candidate) {
    return resolvesIn(candidate, pools, undefined) && resolvesIn(candidate, snapshotPools, snapshotApyOf);
  }

  if (resolvesBoth(url)) {
    return { url, changed: false, rung: null, dropped: false, omitted: false, poolTypesDroppedCount };
  }

  for (const rung of rungs) {
    const candidate = withMinApy(url, rung);
    if (candidate === url) continue; // same value as the (already-known-dead) original
    if (resolvesBoth(candidate)) {
      return { url: candidate, changed: true, rung, dropped: false, omitted: false, poolTypesDroppedCount };
    }
  }

  const dropped = withMinApy(url, null);
  if (resolvesBoth(dropped)) {
    return { url: dropped, changed: true, rung: null, dropped: true, omitted: false, poolTypesDroppedCount };
  }

  return { url: null, changed: true, rung: null, dropped: true, omitted: true, poolTypesDroppedCount };
}

// Best-effort load of the committed pools snapshot for R3's dual-population
// check (Territory T2). Never fatal: missing/malformed -> null, and R3 falls
// back to validating against the live/fixture population alone (logged by
// the caller, never silent).
function loadSnapshotPoolsForR3(snapshotPath) {
  let raw;
  try { raw = fs.readFileSync(snapshotPath, 'utf8'); }
  catch (e) { log(`data/pools-snapshot.json unreadable at ${snapshotPath} (${e.message}) — R3 minApy repair validated against the live/fixture population only`); return null; }
  let json;
  try { json = JSON.parse(raw); }
  catch (e) { log(`data/pools-snapshot.json unparseable at ${snapshotPath} (${e.message}) — R3 minApy repair validated against the live/fixture population only`); return null; }
  if (!Array.isArray(json.pools)) {
    log(`data/pools-snapshot.json at ${snapshotPath} has no "pools" array — R3 minApy repair validated against the live/fixture population only`);
    return null;
  }
  return json.pools;
}

// Extracts the set of DISTINCT grid links (R1's applicability rule) present
// in already-built page text, for the structural tripwire's "checked" count
// — the same shape of measurement the spec's own evidence table used (38 in
// llms.txt, 497 in llms-full.txt). Scans raw text rather than `categories`
// because the surface's grid links come from several independent sources
// (sitemap-derived categories, live-data aggregates, hardcoded examples,
// per-pool fallback links) and the tripwire must see all of them, not just
// the two this item's rules act on.
function scanGridLinks(content, baseUrl) {
  const escaped = String(baseUrl).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '(/\\?[^\\s]*)', 'g');
  const found = new Set();
  let m;
  while ((m = re.exec(content))) {
    const candidate = m[0];
    let u;
    try { u = new URL(candidate); } catch (e) { continue; }
    if (u.searchParams.has('pool')) continue;
    if (!GRID_LINK_PARAMS.some((k) => u.searchParams.has(k))) continue;
    found.add(candidate);
  }
  return found;
}

/**
 * Orchestrates R1/R2/R3 plus both anti-vacuity rails (spec 180) at emit
 * time. Always builds the baseline (pre-180) `buildConcise`/`buildFull`
 * output FIRST — unmodified categories, no opts — both because that IS the
 * "byte-identical to pre-180 output" the rails must fall back to, and
 * because the structural tripwire's "checked grid links" denominator is
 * measured against it (the spec's own 63/535 evidence-table shape).
 *
 * Input: `{ pools, categories, meta, highYield, yieldAnalysis,
 * plannerRateResult, sitemapUrlSet, baseUrl, snapshotPools }`.
 * Returns `{ concise, full, applied, disabledReason, stats }`.
 */
function applyLinkIntegrityGate(input) {
  const {
    pools, categories, meta, highYield, yieldAnalysis, plannerRateResult,
    sitemapUrlSet, baseUrl, snapshotPools,
  } = input;

  const baselineConcise = buildConcise(meta, categories, highYield, yieldAnalysis, plannerRateResult);
  const baselineFull = buildFull(meta, categories, highYield, yieldAnalysis, plannerRateResult);

  const result = {
    concise: baselineConcise,
    full: baselineFull,
    applied: false,
    disabledReason: null,
    stats: { checked: 0, affected: 0, fraction: 0, chainRetargeted: 0, chainOmitted: 0, chainOmittedNames: [], minApy: null, poolTypesDropped: 0 },
  };

  // Anti-vacuity rail 1 (spec 180): fetchYieldsSafe() fails SAFE to `[]` —
  // without this, a DefiLlama timeout would publish a surface with EVERY
  // grid link stripped (Territory T3, "the single highest-consequence detail
  // in the item"). Gate fully disabled, links emitted unchanged.
  if (!Array.isArray(pools) || pools.length === 0) {
    result.disabledReason = 'empty-population';
    err('[180] link-integrity gate DISABLED — empty pool population; every grid link would simulate to zero pools. Emitting pre-180 links unchanged.');
    return result;
  }

  const chainResult = applyChainRetarget(categories.chains || [], pools, sitemapUrlSet || new Set(), baseUrl);
  const originalHighApyStakingUrl = `${baseUrl}/?poolTypes=Staking&minApy=10`;
  const minApyResult = repairMinApyLink(originalHighApyStakingUrl, pools, snapshotPools);

  const checkedConcise = scanGridLinks(baselineConcise, baseUrl);
  const checkedFull = scanGridLinks(baselineFull, baseUrl);
  const checked = checkedConcise.size + checkedFull.size;
  const affected = chainResult.retargetedCount + chainResult.omittedCount + (minApyResult.changed ? 1 : 0);
  const fraction = checked > 0 ? affected / checked : 0;
  const poolTypesDropped = chainResult.poolTypesDroppedCount + minApyResult.poolTypesDroppedCount;

  result.stats = {
    checked, affected, fraction,
    chainRetargeted: chainResult.retargetedCount,
    chainOmitted: chainResult.omittedCount,
    chainOmittedNames: chainResult.omittedChains,
    minApy: minApyResult,
    poolTypesDropped,
  };

  // Anti-vacuity rail 2 (spec 180): a simulation bug must fail loudly, not
  // quietly shrink the AI surface. Emits everything unchanged either way.
  if (checked > 0 && fraction > STRUCTURAL_TRIPWIRE_FRACTION) {
    result.disabledReason = 'structural-tripwire';
    err(`[180] link-integrity gate DISABLED — would retarget-or-omit ${affected}/${checked} grid links (${(fraction * 100).toFixed(1)}%), over the ${(STRUCTURAL_TRIPWIRE_FRACTION * 100).toFixed(0)}% tripwire. This means the simulation is probably broken, not that the surface is really this dead. Emitting pre-180 links unchanged.`);
    process.exitCode = 1;
    return result;
  }

  const fixedCategories = {
    ...categories,
    chains: chainResult.lines,
    other: (categories.other || []).filter((u) => !chainResult.retargetedUrls.has(u)),
  };
  const fixedFull = buildFull(meta, fixedCategories, highYield, yieldAnalysis, plannerRateResult);
  const highApyStakingOverride = minApyResult.changed ? minApyResult.url : undefined; // undefined -> byte-identical default line
  const fixedConcise = buildConcise(meta, categories, highYield, yieldAnalysis, plannerRateResult, {
    highApyStakingUrl: highApyStakingOverride,
  });

  result.concise = fixedConcise;
  result.full = fixedFull;
  result.applied = true;

  log(`[180] R2 chain-section retarget: ${chainResult.retargetedCount} retargeted to /chains/<slug>, ${chainResult.omittedCount} omitted (no static page)` +
    (chainResult.omittedChains.length ? ` — omitted: ${chainResult.omittedChains.join(', ')}` : ''));
  log(`[180] R3 minApy repair ladder: ${describeMinApyResult(minApyResult)}`);
  if (poolTypesDropped > 0) {
    log(`[180] poolTypes classifier (generate-sitemap.js getPoolType) unavailable for ${poolTypesDropped} simulated check(s) — constraint dropped, never silently ignored`);
  }
  log(`[180] link-integrity gate: ${affected}/${checked} grid links affected (${(fraction * 100).toFixed(1)}%) — under the ${(STRUCTURAL_TRIPWIRE_FRACTION * 100).toFixed(0)}% tripwire`);

  return result;
}

// Human-readable summary of repairMinApyLink()'s outcome, for the gate's own
// log() line — never re-derives the decision, only narrates it.
function describeMinApyResult(r) {
  if (!r.changed) return '"High APY staking" already resolves at minApy=10 under both populations — no repair needed';
  if (r.omitted) return '"High APY staking" resolved at NO rung (even with minApy dropped) — line omitted entirely';
  if (r.dropped) return '"High APY staking" repaired by dropping minApy entirely (no rung resolved under both populations)';
  return `"High APY staking" repaired: minApy=10 -> minApy=${r.rung} (highest rung resolving >=1 pool under both the live/fixture population and data/pools-snapshot.json)`;
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  
  try {
    log('Starting LLM files generation for DeFi Garden...');
    
    // Parse sitemap
    const urls = await parseSitemap(SITEMAP_PATH);
    const baseUrl = inferBaseUrl(urls);
    const categories = categorizeUrls(urls, baseUrl);
    // spec 180 R2: the parsed URL set doubles as "does a static /chains/<slug>
    // page actually exist" — reused, never re-fetched.
    const sitemapUrlSet = new Set(urls);

    // Fetch yield data
    // 113: prefer the shared $1000-floored SEO transient (single CI /pools fetch,
    // written by generate-pools-snapshot.js), failing SAFE to a live fetch when
    // absent — parity with the token/chain/sitemap generators. The transient is
    // $1000-TVL-floored, so the llms aggregates legitimately EXCLUDE sub-$1000
    // "dust" pools vs a full-payload run: a KNOWN, human-signed-off divergence
    // (backlog 113), NOT a regression.
    const fixturePath = parseFixtureArg(process.argv.slice(2));
    const fixturePools = loadFixturePools(fixturePath);
    let yields, sourceTs;
    if (fixturePools) {
      yields = fixturePools;
      // The transient was produced by a live DefiLlama fetch earlier in the same
      // CI run; its file mtime is the honest "fetched" timestamp.
      try { sourceTs = fs.statSync(fixturePath).mtime.toISOString(); }
      catch (e) { sourceTs = null; }
      log(`Using SEO transient (${yields.length} pools, $1000-floored) — no live fetch [113]`);
    } else {
      ({ yields, sourceTs } = await fetchYieldsSafe());
    }
    const highYield = pickHighYield(yields);
    const yieldAnalysis = analyzeYieldData(yields);
    // spec 168: the planner section's live rate, derived from the SAME
    // rail-passing pool set as the rest of this file (isRailPassing()) — a
    // median over the full eligible set, not the top-15 leaderboard slice.
    const plannerRateResult = plannerRate(yields);

    // Build metadata
    const meta = {
      baseUrl,
      updatedAt: new Date().toISOString(),
      totalUrls: urls.length,
      defiLlamaFetchedAt: sourceTs
    };

    // Generate content — spec 180's link-integrity gate (R1/R2/R3 + both
    // anti-vacuity rails) decides the REAL emitted content; it always
    // computes the pre-180 baseline internally too, so a disabled/tripped
    // gate falls back to byte-identical pre-180 output automatically.
    const snapshotPools = loadSnapshotPoolsForR3(SNAPSHOT_PATH);
    const gateResult = applyLinkIntegrityGate({
      pools: yields, categories, meta, highYield, yieldAnalysis, plannerRateResult,
      sitemapUrlSet, baseUrl, snapshotPools,
    });
    const conciseContent = gateResult.concise;
    const fullContent = gateResult.full;

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Write files
    const concisePath = path.join(OUTPUT_DIR, 'llms.txt');
    const fullPath = path.join(OUTPUT_DIR, 'llms-full.txt');
    
    writeIfContentChanged(concisePath, conciseContent, meta.updatedAt);
    writeIfContentChanged(fullPath, fullContent, meta.updatedAt);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    log(`✅ Generated LLM files successfully:`);
    log(`   - ${concisePath} (${Math.round(conciseContent.length / 1024)} KB)`);
    log(`   - ${fullPath} (${Math.round(fullContent.length / 1024)} KB)`);
    log(`   - Completed in ${duration}s`);
    
    // Summary stats
    console.log('\n📊 LLM Generation Summary:');
    console.log(`- Total URLs processed: ${meta.totalUrls}`);
    console.log(`- High-yield pools found: ${highYield.top.length}`);
    console.log(`- Files written to: ${OUTPUT_DIR}`);
    console.log(`- Data freshness: ${meta.updatedAt}`);
    console.log(`- Link-integrity gate (180): ${gateResult.applied ? 'applied' : `DISABLED (${gateResult.disabledReason})`} — ${gateResult.stats.affected}/${gateResult.stats.checked} grid links affected`);

  } catch (error) {
    err('Failed to generate LLM files', error);
    process.exitCode = 1;
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// Export functions for testing
module.exports = {
  parseSitemap,
  categorizeUrls,
  fetchYieldsSafe,
  isRailPassing,
  pickHighYield,
  plannerRate,
  buildPlannerSection,
  analyzeYieldData,
  buildConcise,
  buildFull,
  normalizeLlmsContent,
  writeIfContentChanged,
  loadFixturePools,
  parseFixtureArg,
  LLMS_TS_PLACEHOLDER,
  APY_SANITY_LIMIT,
  MIN_TVL_USD,
  formatTvlFloor,
  poolUrl,
  // spec 180: link-integrity gate (R1/R2/R3 + anti-vacuity rails).
  gridLinkPoolCount,
  applyChainRetarget,
  repairMinApyLink,
  withMinApy,
  snapshotApyOf,
  scanGridLinks,
  loadSnapshotPoolsForR3,
  applyLinkIntegrityGate,
  GRID_LINK_PARAMS,
  MIN_APY_RUNGS,
  STRUCTURAL_TRIPWIRE_FRACTION,
  SNAPSHOT_PATH
};