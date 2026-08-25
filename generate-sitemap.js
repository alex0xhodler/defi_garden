#!/usr/bin/env node

/**
 * SOTA Sitemap Generator for DeFi Garden (May 2026 Compliant)
 * Generates API-validated sitemap index and sub-sitemaps with multilingual support
 * Optimized for AI Agents and Google Search Console 2026 standards
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

// Base URL for the site - updated to DeFi Garden (ensuring trailing slash)
const SITE_URL = (process.env.SITE_URL || 'https://www.defi.garden').replace(/\/$/, '') + '/';

// Defillama API endpoint
const YIELDS_API = 'https://yields.llama.fi/pools';

// Supported languages from translations.js
const LANGUAGES = ['en', 'ko'];

// Sitemap URL quality gate (013 — GSC fix, specs/013.md).
// Mirrors the app's own default rendering threshold so a sitemap URL never
// advertises more than the live page shows by default.
// Must stay in sync with app.js: DEFAULT_MIN_TVL (app.js:730) and
// APY_SANITY_LIMIT (app.js:729) — no shared import exists between the two.
const SITEMAP_MIN_TVL = 100000; // = app.js DEFAULT_MIN_TVL
const APY_SANITY_LIMIT = 1000; // = app.js APY_SANITY_LIMIT
const SITEMAP_MIN_QUALIFYING_POOLS = 2;

// Root sitemap-*.xml files this generator must NEVER delete during stale-child
// cleanup: they are owned by generate-token-pages.js / generate-chain-pages.js
// (021/041/050), joined to the index here only via existsSync guards.
const FOREIGN_PAGE_SITEMAPS = [
  'sitemap-token-pages.xml',
  'sitemap-token-pages-ko.xml',
  'sitemap-chain-pages.xml',
  'sitemap-chain-pages-ko.xml',
];

/**
 * Delete stale root sitemap-*.xml children this generator did NOT write this
 * run (080). Keeps the deployed tree in lockstep with the live generator output
 * so the index never references — and CI never re-commits — orphaned lists.
 *
 * Never touches: sitemap.xml (the index — the regex requires a hyphen after
 * "sitemap", so it can't match), files written this run (writtenFilenames), or
 * the four foreign page-sitemaps (FOREIGN_PAGE_SITEMAPS). Every deletion is
 * logged individually plus a summary count — never silent.
 */
function cleanupStaleSitemaps(writtenFilenames, dir = process.cwd()) {
  const written = new Set(writtenFilenames);
  const keep = new Set(FOREIGN_PAGE_SITEMAPS);
  const deleted = [];
  fs.readdirSync(dir)
    .filter(f => /^sitemap-.*\.xml$/.test(f))
    .forEach(f => {
      if (written.has(f) || keep.has(f)) return;
      fs.unlinkSync(path.join(dir, f));
      deleted.push(f);
      console.log(`🗑️  Deleted stale sitemap: ${f}`);
    });
  console.log(`🧹 Stale sitemap cleanup: removed ${deleted.length} orphan file(s)`);
  return deleted;
}

// item 188: total APY a pool actually earns — apyBase + apyReward, matching
// app.js:1869-1871/:1958-1960, NOT the raw `apy` field the live feed also
// carries (those differ: measured apy>=5 counts 145 pools, the app shows
// 137). Extracted so isAnomalousApy() and the new chain=All rung gate below
// share one computation, never two copies.
function poolTotalApy(pool) {
  return (pool.apyBase || 0) + (pool.apyReward || 0);
}

function isAnomalousApy(pool) {
  return poolTotalApy(pool) > APY_SANITY_LIMIT;
}

// item 188: minTvl is now a parameter (default unchanged: SITEMAP_MIN_TVL) so
// the same qualifying-pool predicate serves both the existing token/chain/
// category gates (all called with the implicit $10M default) and the new
// chain=All rung gate below, which needs to evaluate at $1M/$10M/$100M
// floors — never a second near-identical helper.
function isQualifyingPool(pool, minTvl = SITEMAP_MIN_TVL) {
  return (pool.tvlUsd || 0) >= minTvl && !isAnomalousApy(pool);
}

// item 188 (specs/188.md): counts pools qualifying for a `?chain=All&...`
// sitemap rung under the app's own semantics — floor = explicit minTvl when
// present else SITEMAP_MIN_TVL (mirrors app.js:927's "respect explicit
// minTvl=0; fall back to DEFAULT_MIN_TVL only when the param is absent"),
// minApy compared against apyBase+apyReward (not raw apy), plus the existing
// anomaly rail via isQualifyingPool() — never a duplicated rail constant.
function countQualifyingChainAll(pools, { minTvl = SITEMAP_MIN_TVL, minApy = 0 } = {}) {
  let n = 0;
  for (const p of pools) {
    if (!isQualifyingPool(p, minTvl)) continue;
    if (poolTotalApy(p) < minApy) continue;
    n++;
  }
  return n;
}

// item 226 (specs/226.md, Google head-curation): this is the SAME
// ≥2-railed-pools gate item 013 already applies to app-view (?token=/?chain=)
// sitemap URLs — now applied to the static-page (/tokens/<slug>,
// /chains/<slug>) sitemaps too, so no new quality idea is invented, one
// number reused everywhere. Tied to SITEMAP_MIN_QUALIFYING_POOLS directly
// (not a separately-typed "2") so the two gates can never drift apart.
const HEAD_MIN_RAILED_POOLS = SITEMAP_MIN_QUALIFYING_POOLS;

// Function declarations (not consts) so they're safely callable above their
// source position via hoisting — isValidToken is defined further down this
// file, beside extractValidCombinations, which these mirror.

/**
 * Map<UPPERCASE token symbol, count of RAILED pools> — pools passing
 * isQualifyingPool (tvlUsd >= SITEMAP_MIN_TVL, not anomalous), split into
 * token symbols exactly like generateSitemapSuite's own per-token qualifying
 * loop. SINGLE SOURCE OF TRUTH (mirror rule): generateSitemapSuite calls this
 * directly for its own qualifyingTokenPoolCount map instead of keeping a
 * second inline copy of the same loop.
 */
function railedTokenPoolCounts(pools) {
  const counts = new Map();
  (pools || []).forEach(p => {
    if (!isQualifyingPool(p)) return;
    const symbols = p.symbol?.split(/[-_\/\s]/).map(s => s.trim().toUpperCase()) || [];
    symbols.forEach(s => {
      if (!isValidToken(s)) return;
      counts.set(s, (counts.get(s) || 0) + 1);
    });
  });
  return counts;
}

/** Map<chain, count of RAILED pools> — same rails as railedTokenPoolCounts,
 * grouped by chain instead of by token symbol. */
function railedChainPoolCounts(pools) {
  const counts = new Map();
  (pools || []).forEach(p => {
    if (!isQualifyingPool(p)) return;
    const chain = (p.chain || '').toString().trim();
    if (!chain) return;
    counts.set(chain, (counts.get(chain) || 0) + 1);
  });
  return counts;
}

function isHeadToken(symbol, counts) {
  return (counts.get(String(symbol).toUpperCase()) || 0) >= HEAD_MIN_RAILED_POOLS;
}
function isHeadChain(chain, counts) {
  return (counts.get(chain) || 0) >= HEAD_MIN_RAILED_POOLS;
}

/** Set<UPPERCASE symbol> of tokens clearing the head gate — the single
 * predicate generate-token-pages.js filters its sitemap URL list through.
 * The count>=HEAD_MIN_RAILED_POOLS comparison lives ONLY in isHeadToken()
 * above (mirror rule) — this just iterates and delegates to it. */
function selectHeadTokens(pools) {
  const counts = railedTokenPoolCounts(pools);
  const out = new Set();
  counts.forEach((count, symbol) => { if (isHeadToken(symbol, counts)) out.add(symbol); });
  return out;
}
/** Set<chain name> of chains clearing the head gate — the single predicate
 * generate-chain-pages.js filters its sitemap URL list through. The
 * count>=HEAD_MIN_RAILED_POOLS comparison lives ONLY in isHeadChain() above
 * (mirror rule) — this just iterates and delegates to it. */
function selectHeadChains(pools) {
  const counts = railedChainPoolCounts(pools);
  const out = new Set();
  counts.forEach((count, chain) => { if (isHeadChain(chain, counts)) out.add(chain); });
  return out;
}

// item 226 (human authorization 2026-08-04 Q3b): Google's sitemap view is a
// curated head. The app-view families below stay LIVE, self-canonical and
// linked from every static page's "view in app" CTA — they simply leave the
// sitemaps. Flip to true to restore them (the spec's documented revert).
const EMIT_APP_VIEW_SITEMAPS = false;

/**
 * Fetch pool data from Defillama API
 */
async function fetchPoolData() {
  return new Promise((resolve, reject) => {
    console.log('📡 Fetching pool data from Defillama API...');
    
    https.get(YIELDS_API, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          const pools = jsonData.data || jsonData;
          console.log(`✅ Fetched ${pools.length} pools from API`);
          resolve(pools);
        } catch (error) {
          reject(new Error(`Failed to parse API response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`API request failed: ${error.message}`));
    });
  });
}

// 112: load pools from a fixture/transient, failing SAFE to live. Returns an
// array only when the fixture holds a non-empty pool array; otherwise null so
// the caller live-fetches (never a truncated/empty run that would prune SEO).
function loadFixturePools(fixturePath) {
  if (!fixturePath) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const arr = raw && raw.data ? raw.data : raw;
    if (Array.isArray(arr) && arr.length > 0) return arr;
    console.warn('⚠️  Fixture empty — live fallback:', fixturePath);
    return null;
  } catch (e) {
    console.warn('⚠️  Fixture missing/malformed — live fallback:', fixturePath, '(' + e.message + ')');
    return null;
  }
}

function parseFixtureArg(argv) {
  let fixture = process.env.POOLS_FIXTURE || null;
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--fixture') fixture = argv[++i];
  return fixture;
}

/**
 * Strict token filtering to remove junk/spam/unwanted symbols
 * Complies with 2026 "Sitemap Hygiene" standards
 *
 * Mirrors generate-token-pages.js's isValidToken exactly (spec 148) — the two
 * must never drift. tokenRegex alone accepts pure-digit strings and Pendle-
 * style expiry-date fragments (e.g. the "22OCT2026" split out of
 * "PT-SUSDE-22OCT2026" by the symbol.split() callers below) — both are real
 * regex matches but not real tokens, so two further rejection rules layer on
 * top.
 */
function isValidToken(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  // Alphanumeric, dots, hyphens, and underscores only. 2-15 chars.
  // Exclude symbols starting with weird characters like $, %, etc.
  const tokenRegex = /^[A-Z0-9][A-Z0-9.\-_]{1,14}$/i;
  if (!tokenRegex.test(symbol)) return false;
  const pureNumericRegex = /^[0-9]+$/;
  if (pureNumericRegex.test(symbol)) return false; // e.g. "2027", "00", "67"
  const dateFragmentRegex = /^[0-9]{1,2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[0-9]{2,4}$/i;
  if (dateFragmentRegex.test(symbol)) return false; // e.g. "22OCT2026", "16SEP26"
  return true;
}

/**
 * Extract valid tokens and chains from pool data
 */
function extractValidCombinations(pools) {
  console.log('🔍 Analyzing pool data for valid combinations...');
  
  const validTokens = new Set();
  const validChains = new Set();
  const validTokenChainCombos = new Map(); // token -> Set of chains
  const validTokenPoolTypes = new Map(); // token -> Set of pool types
  
  pools.forEach(pool => {
    if (!pool.symbol || !pool.chain || !pool.tvlUsd || pool.tvlUsd < 1000) {
      return; // Skip invalid or very low TVL pools for better hygiene
    }
    
    // Only include pools with APY > 0%
    const totalApy = (pool.apy || 0) + (pool.apyReward || 0);
    if (totalApy <= 0.01) {
      return; // Skip pools with negligible yield
    }
    
    // Extract token symbols
    const symbols = pool.symbol.split(/[-_\/\s]/).map(s => s.trim());
    
    symbols.forEach(symbol => {
      if (isValidToken(symbol)) {
        const upSymbol = symbol.toUpperCase();
        validTokens.add(upSymbol);
        validChains.add(pool.chain);
        
        // Track token-chain combinations
        if (!validTokenChainCombos.has(upSymbol)) {
          validTokenChainCombos.set(upSymbol, new Set());
        }
        validTokenChainCombos.get(upSymbol).add(pool.chain);
        
        // Track token-pool type combinations
        const poolType = getPoolType(pool);
        if (!validTokenPoolTypes.has(upSymbol)) {
          validTokenPoolTypes.set(upSymbol, new Set());
        }
        validTokenPoolTypes.get(upSymbol).add(poolType);
      }
    });
  });
  
  console.log(`📊 Found ${validTokens.size} valid tokens across ${validChains.size} chains`);
  
  return {
    tokens: Array.from(validTokens).sort(),
    chains: Array.from(validChains).sort(),
    tokenChainCombos: validTokenChainCombos,
    tokenPoolTypes: validTokenPoolTypes
  };
}

// item 189 (specs/189.md): the classifier below USED TO BE a forked, 4-
// category, 3-short-list copy of the product's real pool-type classifier —
// it disagreed with app.js's getPoolTypeShared (PoolDetail.js, spec 130's
// "SINGLE SOURCE OF TRUTH … do not fork a second copy of this classifier")
// on 12.2% of the committed snapshot, over-assigning to "Yield Farming" and
// emitting sitemap category URLs that rendered an EMPTY grid on the real
// product. Fixed by extracting the real getPoolTypeShared straight out of
// PoolDetail.js instead of maintaining a second copy.
const POOL_TYPE_START_MARKER = 'const LENDING_PROTOCOLS';
const POOL_TYPE_FN_MARKER = 'function getPoolTypeShared';
const DEFAULT_POOL_DETAIL_PATH = path.join(__dirname, 'PoolDetail.js');

/**
 * Extract & evaluate PoolDetail.js's getPoolTypeShared (spec 130's classifier
 * region: `const LENDING_PROTOCOLS` through the close of `function
 * getPoolTypeShared`) via a bare `vm` context — the same anchor-slice-
 * evaluate pattern test_helpers_parser.js's extractParser uses for app.js's
 * NL parser (item 084). That region references only String/Array builtins
 * and the five list constants it declares itself — no DOM, no React
 * (verified, spec 189) — so it evaluates cleanly outside the browser.
 *
 * Throws a single actionable Error naming PoolDetail.js and both anchors on
 * ANY failure (missing file, moved/renamed anchor, unparseable slice, or a
 * non-function result) — NEVER falls back to the old forked lists. A silent
 * fallback is exactly how the fork this item fixes shipped and survived
 * undetected (spec 189's root-cause finding); the loud failure mirrors this
 * file's existing posture on a DefiLlama fetch error.
 *
 * Exported un-cached (no module-scope memo inside this function) so tests
 * can exercise the failure path directly against a scratch file without
 * disturbing the real cache below; getPoolType()'s module-scope extraction
 * at require time is the one production caller.
 */
function extractGetPoolTypeShared(poolDetailPath = DEFAULT_POOL_DETAIL_PATH) {
  let src;
  try {
    src = fs.readFileSync(poolDetailPath, 'utf8');
  } catch (err) {
    throw new Error(
      `generate-sitemap.js: could not read ${poolDetailPath} to extract the shared pool-type ` +
      `classifier "${POOL_TYPE_FN_MARKER}" (spec 130's single source of truth; spec 189's de-fork) ` +
      `— ${err.message}`
    );
  }

  const start = src.indexOf(POOL_TYPE_START_MARKER);
  if (start < 0) {
    throw new Error(
      `generate-sitemap.js: could not locate "${POOL_TYPE_START_MARKER}" in ${poolDetailPath} — ` +
      `the classifier region's start anchor (spec 189) was renamed or moved. Update ` +
      `generate-sitemap.js's extractGetPoolTypeShared() to track PoolDetail.js.`
    );
  }

  const fnStart = src.indexOf(POOL_TYPE_FN_MARKER, start);
  if (fnStart < 0) {
    throw new Error(
      `generate-sitemap.js: found "${POOL_TYPE_START_MARKER}" but not "${POOL_TYPE_FN_MARKER}" ` +
      `after it in ${poolDetailPath} — the classifier region's end anchor (spec 189) was renamed ` +
      `or moved. Update generate-sitemap.js's extractGetPoolTypeShared() to track PoolDetail.js.`
    );
  }

  // The function body is `function getPoolTypeShared(pool) { ... }` closed by
  // a bare `}` at column 0 (every nested block inside it is indented) — the
  // same closing-brace convention test_helpers_parser.js's extractParser
  // relies on for app.js's parser.
  const closeIdx = src.indexOf('\n}', fnStart);
  if (closeIdx < 0) {
    throw new Error(
      `generate-sitemap.js: located "${POOL_TYPE_FN_MARKER}" in ${poolDetailPath} but not its ` +
      `closing brace — the function shape changed unexpectedly. Update ` +
      `generate-sitemap.js's extractGetPoolTypeShared() (spec 189).`
    );
  }
  const sliced = src.slice(start, closeIdx + 2); // include the trailing "\n}"

  const ctx = {};
  vm.createContext(ctx);
  let fn;
  try {
    fn = vm.runInContext(sliced + '\ngetPoolTypeShared;', ctx);
  } catch (err) {
    throw new Error(
      `generate-sitemap.js: the slice of ${poolDetailPath} from "${POOL_TYPE_START_MARKER}" to the ` +
      `end of "${POOL_TYPE_FN_MARKER}" did not evaluate cleanly (spec 189 extraction) — ${err.message}`
    );
  }
  if (typeof fn !== 'function') {
    throw new Error(
      `generate-sitemap.js: extracted "${POOL_TYPE_FN_MARKER}" from ${poolDetailPath} is not a ` +
      `function (got ${typeof fn}) — the slice from "${POOL_TYPE_START_MARKER}" to ` +
      `"${POOL_TYPE_FN_MARKER}" is wrong. Update generate-sitemap.js's extractGetPoolTypeShared() (spec 189).`
    );
  }
  return fn;
}

// item 189: extracted AT REQUIRE TIME (not lazily on first call) so a
// broken/moved PoolDetail.js fails generate-sitemap.js's own require() loudly
// — the same posture this file already has for a DefiLlama fetch error —
// instead of three downstream consumers (generate-llms.js, audit-app.js,
// generate-token-pages.js) each silently re-adopting a wrong classifier.
// Cached here at module scope: every getPoolType(pool) call below reuses this
// one extracted function; PoolDetail.js is read/evaluated exactly once.
const _getPoolTypeShared = extractGetPoolTypeShared();

/**
 * Determine pool type from pool data — delegates to the product's single
 * source of truth (spec 130's getPoolTypeShared in PoolDetail.js), extracted
 * above. Name and signature kept identical to the pre-189 fork so
 * generate-llms.js / audit-app.js / generate-token-pages.js need ZERO
 * call-site changes (spec 189).
 */
function getPoolType(pool) {
  return _getPoolTypeShared(pool);
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function alternateUrlFor(baseUrl, lang) {
  if (lang === 'en') {
    const url = new URL(baseUrl);
    url.searchParams.delete('lang');
    return url.toString();
  }
  if (lang === 'ko') {
    try {
      const url = new URL(baseUrl);
      if (url.pathname === '/tokens' || url.pathname.startsWith('/tokens/')) {
        url.pathname = '/ko' + url.pathname;
        url.searchParams.delete('lang');
        return url.toString();
      }
      if (url.pathname === '/chains' || url.pathname.startsWith('/chains/')) {
        url.pathname = '/ko' + url.pathname;
        url.searchParams.delete('lang');
        return url.toString();
      }
      url.searchParams.set('lang', 'ko');
      return url.toString();
    } catch {
      return baseUrl;
    }
  }
  return baseUrl;
}

/**
 * Generate XML for a single URL with multilingual alternates
 */
function generateUrlXml(baseUrl, lastmod, priority, changefreq) {
  let xml = '  <url>\n';
  xml += `    <loc>${escapeXml(baseUrl)}</loc>\n`;
  
  // Add hreflang for all supported languages
  LANGUAGES.forEach(lang => {
    const langUrl = alternateUrlFor(baseUrl, lang);
    xml += `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(langUrl)}" />\n`;
  });
  
  // Add x-default (defaults to English)
  const defaultUrl = alternateUrlFor(baseUrl, 'en');
  xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defaultUrl)}" />\n`;
  xml += `    <lastmod>${lastmod}</lastmod>\n`;
  xml += `    <changefreq>${changefreq}</changefreq>\n`;
  xml += `    <priority>${priority}</priority>\n`;
  xml += '  </url>\n';
  return xml;
}

/**
 * Wrapper for sitemap files
 */
function wrapSitemap(content) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n';
  xml += '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
  xml += content;
  xml += '</urlset>';
  return xml;
}

// Honest lastmod preservation (081). A URL entry keeps its committed <lastmod>
// as long as everything else about the entry is byte-identical; only genuinely
// changed/new entries get a fresh timestamp. This placeholder stands in for the
// lastmod value while an entry is built, so a fresh entry can be compared to the
// committed one modulo the timestamp before the real value is substituted in.
const LASTMOD_PLACEHOLDER = '__DEFI_GARDEN_LASTMOD__';

/**
 * Parse an existing on-disk sitemap file's <url> blocks into a map
 * loc → { lastmod, normalizedEntry }, where normalizedEntry is the block with its
 * <lastmod>…</lastmod> value replaced by LASTMOD_PLACEHOLDER (so it can be compared
 * byte-for-byte against a freshly built entry that carries the same placeholder).
 * Files are self-generated, so a regex parse over the known format is acceptable;
 * a missing/unparseable file simply yields an empty map → fresh timestamps
 * everywhere (the pre-081 behavior).
 */
function parseExistingUrlEntries(filePath) {
  const map = new Map();
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return map; // missing file → empty map → all-new timestamps
  }
  const blocks = content.match(/  <url>\n[\s\S]*?  <\/url>\n/g);
  if (!blocks) return map;
  blocks.forEach(block => {
    const locMatch = block.match(/    <loc>([\s\S]*?)<\/loc>\n/);
    const lastmodMatch = block.match(/    <lastmod>([\s\S]*?)<\/lastmod>\n/);
    if (!locMatch || !lastmodMatch) return;
    const normalizedEntry = block.replace(
      /    <lastmod>[\s\S]*?<\/lastmod>\n/,
      `    <lastmod>${LASTMOD_PLACEHOLDER}</lastmod>\n`
    );
    map.set(locMatch[1], { lastmod: lastmodMatch[1], normalizedEntry });
  });
  return map;
}

/**
 * Resolve LASTMOD_PLACEHOLDER for a file's freshly built URL entries against its
 * committed entries: an entry byte-identical (modulo lastmod) to the committed one
 * keeps the committed lastmod; a changed or new entry gets `now`. Returns the
 * resolved entry strings plus the max lastmod among them (for the index).
 */
function resolveLastmods(placeholderEntries, existingMap, now) {
  let maxLastmod = '';
  const entries = placeholderEntries.map(entry => {
    const locMatch = entry.match(/    <loc>([\s\S]*?)<\/loc>\n/);
    const old = locMatch ? existingMap.get(locMatch[1]) : null;
    const lastmod = (old && old.normalizedEntry === entry) ? old.lastmod : now;
    if (lastmod > maxLastmod) maxLastmod = lastmod;
    return entry.replace(
      `    <lastmod>${LASTMOD_PLACEHOLDER}</lastmod>\n`,
      `    <lastmod>${lastmod}</lastmod>\n`
    );
  });
  return { entries, maxLastmod };
}

/**
 * Max <lastmod> among a file's committed <url> entries (ISO-8601 compares
 * lexicographically), falling back to `fallback` if the file has no parseable
 * lastmod. Used to derive honest index lastmods for the foreign page-sitemaps.
 */
function maxLastmodFromFile(filePath, fallback) {
  let max = '';
  for (const { lastmod } of parseExistingUrlEntries(filePath).values()) {
    if (lastmod > max) max = lastmod;
  }
  if (max && /^\d{4}-\d{2}-\d{2}$/.test(max)) {
    max = `${max}T00:00:00.000Z`;
  }
  return max || fallback;
}

/**
 * Generate the complete sitemap suite with Vertical Semantic Grouping
 * Optimized for "Intent-Based" AI Agent crawling (Chain/Category focused)
 */
async function generateSitemapSuite(poolsOverride) {
  console.log('🚀 Starting SOTA sitemap generation with Vertical Semantic Grouping...');

  try {
    // poolsOverride lets tests drive the suite offline with a fixture instead
    // of hitting the live DefiLlama API; production callers pass nothing.
    const pools = Array.isArray(poolsOverride) ? poolsOverride : await fetchPoolData();
    const { tokens, chains, tokenChainCombos, tokenPoolTypes } = extractValidCombinations(pools);
    
    // Map data for priority and categorization
    const tokenTvlMap = new Map();
    const chainTokensMap = new Map(); // chain -> Set of tokens
    const categoryTokensMap = new Map(); // category -> Set of tokens
    
    pools.forEach(p => {
      const symbols = p.symbol?.split(/[-_\/\s]/).map(s => s.trim().toUpperCase()) || [];
      symbols.forEach(s => {
        if (isValidToken(s)) {
          tokenTvlMap.set(s, (tokenTvlMap.get(s) || 0) + (p.tvlUsd || 0));
          
          if (!chainTokensMap.has(p.chain)) chainTokensMap.set(p.chain, new Set());
          chainTokensMap.get(p.chain).add(s);
          
          const type = getPoolType(p);
          if (!categoryTokensMap.has(type)) categoryTokensMap.set(type, new Set());
          categoryTokensMap.get(type).add(s);
        }
      });
    });

    // Quality gate (013): count qualifying pools (tvlUsd >= SITEMAP_MIN_TVL,
    // not anomalous) per token, per token+chain, and per token+category —
    // the exact filter a URL's default page would apply. A URL only earns a
    // sitemap entry once its combo clears SITEMAP_MIN_QUALIFYING_POOLS.
    // item 226 (mirror rule): qualifyingTokenPoolCount used to be a second
    // inline copy of this exact per-token loop — now it IS railedTokenPoolCounts,
    // the same single source of truth generate-token-pages.js's selectHeadTokens
    // reads. The per-chain/per-category maps below have no head-selection
    // twin (those stay app-view-only), so they keep their own loop.
    const qualifyingTokenPoolCount = railedTokenPoolCounts(pools); // token -> count
    const qualifyingTokenChainPoolCount = new Map(); // "token|chain" -> count
    const qualifyingTokenCategoryPoolCount = new Map(); // "token|category" -> count

    pools.forEach(p => {
      if (!isQualifyingPool(p)) return;
      const symbols = p.symbol?.split(/[-_\/\s]/).map(s => s.trim().toUpperCase()) || [];
      const type = getPoolType(p);
      symbols.forEach(s => {
        if (!isValidToken(s)) return;
        const chainKey = `${s}|${p.chain}`;
        qualifyingTokenChainPoolCount.set(chainKey, (qualifyingTokenChainPoolCount.get(chainKey) || 0) + 1);
        const catKey = `${s}|${type}`;
        qualifyingTokenCategoryPoolCount.set(catKey, (qualifyingTokenCategoryPoolCount.get(catKey) || 0) + 1);
      });
    });

    const now = new Date().toISOString();
    const sitemaps = {
      'sitemap-main.xml': []
    };

    // 1. Main & Metadata Sitemaps (clean, static canonical URLs only — no parameterized query filters)
    console.log('📝 Building sitemap-main.xml...');
    sitemaps['sitemap-main.xml'].push(generateUrlXml(SITE_URL, LASTMOD_PLACEHOLDER, '1.0', 'daily'));
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}plan.html`, LASTMOD_PLACEHOLDER, '0.9', 'daily'));
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}agents`, LASTMOD_PLACEHOLDER, '0.9', 'daily'));
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}mcp`, LASTMOD_PLACEHOLDER, '0.9', 'daily'));

    // Zero-Distance Intent Portals (/for/<slug>) — First-Class Intent Landing Portals (Priority 0.9, Daily)
    const INTENT_SLUGS = ['claude', 'cursor', 'chatgpt', 'spotify', 'netflix', 'aws', 'github', 'youtube'];
    INTENT_SLUGS.forEach(slug => {
      sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}for/${slug}`, LASTMOD_PLACEHOLDER, '0.9', 'daily'));
    });

    // Secondary Directory Hubs (Tokens & Chains)
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}tokens`, LASTMOD_PLACEHOLDER, '0.85', 'daily'));
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}chains`, LASTMOD_PLACEHOLDER, '0.85', 'daily'));

    const STORY_SLUGS = ['tomoko', 'kevin', 'lucia'];
    STORY_SLUGS.forEach(slug => {
      sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}stories/${slug}.html`, LASTMOD_PLACEHOLDER, '0.7', 'monthly'));
    });
    // 2. Vertical: Chain-Specific Sitemaps
    console.log('📝 Building Vertical Chain Sitemaps...');
    const topChains = Array.from(chainTokensMap.keys()).sort((a, b) => {
      // Sort by chain popularity (simple heuristic)
      const popular = ['Ethereum', 'Base', 'Arbitrum', 'Polygon', 'Optimism', 'Solana', 'Avalanche', 'BNB Chain'];
      const aIdx = popular.indexOf(a);
      const bIdx = popular.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });

    topChains.forEach(chain => {
      const safeChainName = chain.replace(/[^a-z0-9]/gi, '-');
      const filename = `sitemap-chain-${safeChainName}.xml`;
      sitemaps[filename] = [];
      
      // Add the chain landing page
      sitemaps[filename].push(generateUrlXml(`${SITE_URL}?chain=${encodeURIComponent(chain)}`, LASTMOD_PLACEHOLDER, '0.8', 'daily'));
      
      // Add tokens on this chain — only combos that clear the sitemap quality gate (013)
      const chainTokens = chainTokensMap.get(chain);
      let chainDropped = 0;
      chainTokens.forEach(token => {
        const qualifyingCount = qualifyingTokenChainPoolCount.get(`${token}|${chain}`) || 0;
        if (qualifyingCount < SITEMAP_MIN_QUALIFYING_POOLS) {
          chainDropped++;
          return;
        }
        const tvl = tokenTvlMap.get(token) || 0;
        const priority = Math.min(0.9, 0.4 + (Math.log10(Math.max(1, tvl / 10000)) * 0.1)).toFixed(2);
        sitemaps[filename].push(generateUrlXml(`${SITE_URL}?token=${encodeURIComponent(token)}&chain=${encodeURIComponent(chain)}`, LASTMOD_PLACEHOLDER, priority, 'daily'));
      });
      if (chainDropped > 0) {
        console.log(`   ⏭️  ${filename}: dropped ${chainDropped} thin token+chain combo(s) below quality gate`);
      }
    });

    // 3. Vertical: Category-Specific Sitemaps (Lending, Staking, etc.)
    console.log('📝 Building Vertical Category Sitemaps...');
    // item 189 (specs/189.md, Leg B): the product's real classifier
    // (getPoolTypeShared, above) has SIX categories — app.js:114-121's
    // CATEGORY_TABS nav taxonomy — not the fork's four. Adding RWA and Yield
    // Derivatives here means every category getPoolType() can now return
    // earns a sitemap file; the 013 quality gate (>= SITEMAP_MIN_QUALIFYING_POOLS)
    // still applies per-token-per-category unchanged, so a category only
    // ships a file/URL once some token actually clears it.
    const categories = ['Lending', 'Staking', 'LP/DEX', 'Yield Farming', 'RWA', 'Yield Derivatives'];
    const categoryUrlMap = {
      'Lending': 'Lending',
      'LP/DEX': 'LP%2FDEX',
      'Staking': 'Staking',
      'Yield Farming': 'Yield%20Farming',
      'RWA': 'RWA',
      'Yield Derivatives': 'Yield%20Derivatives'
    };

    categories.forEach(cat => {
      const safeCatName = cat.replace(/[^a-z0-9]/gi, '-');
      const filename = `sitemap-category-${safeCatName}.xml`;
      sitemaps[filename] = [];
      
      const catTokens = categoryTokensMap.get(cat);
      let catDropped = 0;
      if (catTokens) {
        catTokens.forEach(token => {
          const qualifyingCount = qualifyingTokenCategoryPoolCount.get(`${token}|${cat}`) || 0;
          if (qualifyingCount < SITEMAP_MIN_QUALIFYING_POOLS) {
            catDropped++;
            return;
          }
          const tvl = tokenTvlMap.get(token) || 0;
          const priority = Math.min(0.85, 0.4 + (Math.log10(Math.max(1, tvl / 10000)) * 0.1)).toFixed(2);
          sitemaps[filename].push(generateUrlXml(`${SITE_URL}?token=${encodeURIComponent(token)}&poolTypes=${categoryUrlMap[cat]}`, LASTMOD_PLACEHOLDER, priority, 'daily'));
        });
      }
      if (catDropped > 0) {
        console.log(`   ⏭️  ${filename}: dropped ${catDropped} thin token+category combo(s) below quality gate`);
      }
    });

    // 4. Global Token Discovery Sitemap (For tokens not tied to a specific single chain/cat view)
    // Only tokens clearing the sitemap quality gate (013) are emitted.
    console.log('📝 Building global token discovery sitemap...');
    sitemaps['sitemap-tokens-all.xml'] = [];
    let tokensDropped = 0;
    tokens.forEach(token => {
      const qualifyingCount = qualifyingTokenPoolCount.get(token) || 0;
      if (qualifyingCount < SITEMAP_MIN_QUALIFYING_POOLS) {
        tokensDropped++;
        return;
      }
      const tvl = tokenTvlMap.get(token) || 0;
      const priority = Math.min(0.95, 0.5 + (Math.log10(Math.max(1, tvl / 10000)) * 0.1)).toFixed(2);
      sitemaps['sitemap-tokens-all.xml'].push(generateUrlXml(`${SITE_URL}?token=${encodeURIComponent(token)}`, LASTMOD_PLACEHOLDER, priority, 'daily'));
    });
    console.log(`   ⏭️  sitemap-tokens-all.xml: dropped ${tokensDropped} of ${tokens.length} thin token(s) below quality gate (< ${SITEMAP_MIN_QUALIFYING_POOLS} pools @ $${(SITEMAP_MIN_TVL / 1e6).toFixed(0)}M TVL)`);

    // item 226 (human authorization 2026-08-04 Q3b): the three app-view
    // families built above (per-chain, per-category, sitemap-tokens-all) are
    // computed exactly as before — their own "N dropped" logs above stay
    // honest — but never reach disk/the index when EMIT_APP_VIEW_SITEMAPS is
    // off. cleanupStaleSitemaps() (080) then removes any previously-written
    // copies on the next real run, since they're absent from writtenFilenames
    // below — that is an ARTIFACT deletion, never a page deletion (the pages
    // themselves stay live, self-canonical, linked from the app's own "view
    // in app" CTA). Flip EMIT_APP_VIEW_SITEMAPS to restore.
    if (!EMIT_APP_VIEW_SITEMAPS) {
      const appViewSitemapNames = topChains
        .map(chain => `sitemap-chain-${chain.replace(/[^a-z0-9]/gi, '-')}.xml`)
        .concat(categories.map(cat => `sitemap-category-${cat.replace(/[^a-z0-9]/gi, '-')}.xml`))
        .concat(['sitemap-tokens-all.xml']);
      let suppressedUrlCount = 0;
      appViewSitemapNames.forEach(name => {
        suppressedUrlCount += (sitemaps[name] || []).length;
        delete sitemaps[name];
      });
      console.log(`⏭️  app-view sitemap families suppressed (item 226 head curation) — ${suppressedUrlCount} URLs not submitted`);
    }

    // Write all sitemaps. lastmod is preserved per-entry (081): an entry
    // byte-identical to its committed form keeps its committed timestamp; only
    // changed/new entries get `now`, so a no-data-change run is byte-identical
    // output and the workflow's porcelain gate skips the commit. childMaxLastmod
    // records each child's max URL lastmod for the honest index below.
    const generatedFilenames = Object.keys(sitemaps);
    const writtenFilenames = [];
    const childMaxLastmod = {};
    for (const filename of generatedFilenames) {
      if (sitemaps[filename].length > 0) {
        const existing = parseExistingUrlEntries(filename);
        const { entries, maxLastmod } = resolveLastmods(sitemaps[filename], existing, now);
        childMaxLastmod[filename] = maxLastmod || now;
        fs.writeFileSync(filename, wrapSitemap(entries.join('')));
        writtenFilenames.push(filename);
        console.log(`✅ Generated ${filename} with ${entries.length} URLs`);
      }
    }

    // Generate Index (Prioritized, SOTA Ordering: sitemap-main.xml first, static landing hubs, tokens, chains).
    let indexXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    indexXml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    const indexEntries = [];

    // 1. Core Canonical Site Structure (First Priority)
    if (sitemaps['sitemap-main.xml'] && sitemaps['sitemap-main.xml'].length > 0) {
      indexEntries.push({ loc: `${SITE_URL}sitemap-main.xml`, lastmod: childMaxLastmod['sitemap-main.xml'] || now });
    }

    // 2. Static Landing Pages (EN)
    if (fs.existsSync('sitemap-token-pages.xml')) {
      indexEntries.push({ loc: `${SITE_URL}sitemap-token-pages.xml`, lastmod: maxLastmodFromFile('sitemap-token-pages.xml', now) });
    }
    if (fs.existsSync('sitemap-chain-pages.xml')) {
      indexEntries.push({ loc: `${SITE_URL}sitemap-chain-pages.xml`, lastmod: maxLastmodFromFile('sitemap-chain-pages.xml', now) });
    }

    // 3. Static Landing Pages (KO)
    if (fs.existsSync('sitemap-token-pages-ko.xml')) {
      indexEntries.push({ loc: `${SITE_URL}sitemap-token-pages-ko.xml`, lastmod: maxLastmodFromFile('sitemap-token-pages-ko.xml', now) });
    }
    if (fs.existsSync('sitemap-chain-pages-ko.xml')) {
      indexEntries.push({ loc: `${SITE_URL}sitemap-chain-pages-ko.xml`, lastmod: maxLastmodFromFile('sitemap-chain-pages-ko.xml', now) });
    }

    // 4. Any other written child sitemaps (e.g. if EMIT_APP_VIEW_SITEMAPS is enabled)
    generatedFilenames.filter(f => f !== 'sitemap-main.xml').sort().forEach(filename => {
      if (sitemaps[filename] && sitemaps[filename].length > 0) {
        indexEntries.push({ loc: `${SITE_URL}${filename}`, lastmod: childMaxLastmod[filename] || now });
      }
    });

    indexEntries.forEach(entry => {
      indexXml += '  <sitemap>\n';
      indexXml += `    <loc>${entry.loc}</loc>\n`;
      indexXml += `    <lastmod>${entry.lastmod}</lastmod>\n`;
      indexXml += '  </sitemap>\n';
    });

    indexXml += '</sitemapindex>';
    fs.writeFileSync('sitemap.xml', indexXml);
    console.log('✅ Generated sitemap.xml (Index)');

    // 080: remove stale generator-owned children this run did not write, so the
    // deployed tree matches the live output and the index has no orphans.
    cleanupStaleSitemaps(writtenFilenames);

    return true;
  } catch (error) {
    console.error('❌ Error during SOTA Vertical sitemap generation:', error.message);
    throw error;
  }
}

/**
 * Generate robots.txt content with AI crawler support and Index pointer
 */
function generateRobotsTxt() {
  return `# robots.txt for DeFi Garden - AI-ready Yield Discovery
# Updated May 2026 for Agentic Search Compliance
# AI content signaling
Content-signal: search=yes, ai-train=no, use=reference

# Sitemap Index
Sitemap: ${SITE_URL}sitemap.xml

# LLM files for Search Agents
LLM: ${SITE_URL}llms.txt
LLM: ${SITE_URL}llms-full.txt

# General crawlers
User-agent: *
Allow: /
# Search Agents & AI Assistant crawlers
User-agent: GPTBot
Allow: /
Allow: /llms.txt

User-agent: ChatGPT-User
Allow: /
Allow: /llms.txt

User-agent: ClaudeBot
Allow: /
Allow: /llms.txt

User-agent: Claude-Web
Allow: /
Allow: /llms.txt

User-agent: PerplexityBot
Allow: /
Allow: /llms.txt

User-agent: OAI-SearchBot
Allow: /

User-agent: Google-InspectionTool
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Googlebot-Image
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Amazonbot
Allow: /

# Block spam bots
User-agent: CCBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: MJ12bot
Disallow: /
`;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Generating SOTA sitemap suite for DeFi Garden...');
    const override = loadFixturePools(parseFixtureArg(process.argv.slice(2)));
    await generateSitemapSuite(override);
    
    const robotsContent = generateRobotsTxt();
    fs.writeFileSync('robots.txt', robotsContent);
    console.log('✅ Generated robots.txt');
    
    console.log('\n📊 2026 SOTA Features Implemented:');
    console.log('- ✅ Multilingual Support (en, ko) via hreflang');
    console.log('- ✅ Sitemap Indexing for scalability');
    console.log('- ✅ Strict Token Hygiene (filtered junk/spam symbols)');
    console.log('- ✅ Agentic SEO optimizations (robots.txt & lastmod)');
    console.log('- ✅ Correct Domain (defi.garden)');
    
  } catch (error) {
    console.error('❌ Error generating sitemap:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateSitemapSuite, generateRobotsTxt, getPoolType, extractGetPoolTypeShared, cleanupStaleSitemaps, FOREIGN_PAGE_SITEMAPS, parseExistingUrlEntries, resolveLastmods, maxLastmodFromFile, LASTMOD_PLACEHOLDER, loadFixturePools, parseFixtureArg, isValidToken, isQualifyingPool, poolTotalApy, countQualifyingChainAll, SITEMAP_MIN_TVL, SITEMAP_MIN_QUALIFYING_POOLS, APY_SANITY_LIMIT,
  // item 226: head-selection predicate (single source of truth) + the
  // app-view-suppression flag, exported so generate-token-pages.js /
  // generate-chain-pages.js / tests read the SAME predicate, never a copy.
  HEAD_MIN_RAILED_POOLS, railedTokenPoolCounts, railedChainPoolCounts, isHeadToken, isHeadChain, selectHeadTokens, selectHeadChains, EMIT_APP_VIEW_SITEMAPS };