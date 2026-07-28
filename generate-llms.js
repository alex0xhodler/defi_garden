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

// Configuration with environment variable overrides
const SITE_URL = process.env.SITE_URL || 'https://www.defi.garden';
const SITEMAP_PATH = process.env.SITEMAP_PATH || path.resolve('./sitemap.xml');
const OUTPUT_DIR = process.env.LLMS_OUTPUT_DIR || path.dirname(SITEMAP_PATH);
const DEFILLAMA_YIELDS_URL = process.env.DEFILLAMA_YIELDS_URL || 'https://yields.llama.fi/pools';

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
 * Build concise llms.txt content with search-optimized sections
 */
function buildConcise(meta, categories, highYield, yieldAnalysis, plannerRateResult) {
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
  lines.push(`- "High APY staking" → ${meta.baseUrl}/?poolTypes=Staking&minApy=10`);
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

    // Generate content
    const conciseContent = buildConcise(meta, categories, highYield, yieldAnalysis, plannerRateResult);
    const fullContent = buildFull(meta, categories, highYield, yieldAnalysis, plannerRateResult);
    
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
  poolUrl
};