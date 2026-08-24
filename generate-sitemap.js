#!/usr/bin/env node

/**
 * SOTA Sitemap Generator for DeFi Garden (May 2026 Compliant)
 * Generates API-validated sitemap index and sub-sitemaps with multilingual support
 * Optimized for AI Agents and Google Search Console 2026 standards
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Base URL for the site - updated to DeFi Garden (ensuring trailing slash)
const SITE_URL = (process.env.SITE_URL || 'https://www.defi.garden').replace(/\/$/, '') + '/';

// Defillama API endpoint
const YIELDS_API = 'https://yields.llama.fi/pools';

// Supported languages from translations.js
const LANGUAGES = ['en', 'ko'];

// Sitemap URL quality gate (013 — GSC fix, specs/013.md).
// Gated to active pools with TVL >= $100K, 0 < APY <= 1000%, and recent activity.
const SITEMAP_MIN_TVL = 100000; // $100K floor to clear thin/stale pools and soft 404s
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

function poolTotalApy(pool) {
  const total = (pool.apyBase || 0) + (pool.apyReward || 0);
  return total > 0 ? total : (pool.apy || 0);
}

function isAnomalousApy(pool) {
  const total = poolTotalApy(pool);
  return total <= 0 || total > APY_SANITY_LIMIT;
}

function hasRecentActivity(pool) {
  if (pool.count != null && pool.count <= 0) return false;
  return true;
}

function isQualifyingPool(pool) {
  const tvl = pool.tvlUsd || 0;
  const apy = poolTotalApy(pool);
  return tvl >= SITEMAP_MIN_TVL && apy > 0 && apy <= APY_SANITY_LIMIT && hasRecentActivity(pool);
}

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

/**
 * Strict token filtering to remove junk/spam/unwanted symbols
 * Complies with 2026 "Sitemap Hygiene" standards
 */
function isValidToken(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  // Alphanumeric, dots, hyphens, and underscores only. 2-15 chars.
  // Exclude symbols starting with weird characters like $, %, etc.
  const tokenRegex = /^[A-Z0-9][A-Z0-9.\-_]{1,14}$/i;
  return tokenRegex.test(symbol);
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

/**
 * Determine pool type from pool data
 */
function getPoolType(pool) {
  if (!pool.project) return 'Yield Farming';
  
  const projectName = pool.project.toLowerCase().replace(/\s+/g, '-');
  
  const lendingProjects = ['aave', 'compound', 'morpho', 'spark', 'radiant', 'euler', 'venus', 'strike'];
  const stakingProjects = ['lido', 'rocket-pool', 'ether.fi', 'jito', 'marinade', 'stader', 'frax'];
  const dexProjects = ['uniswap', 'curve', 'balancer', 'pancakeswap', 'sushiswap', 'aerodrome', 'velodrome'];
  
  if (lendingProjects.some(p => projectName.includes(p))) return 'Lending';
  if (stakingProjects.some(p => projectName.includes(p))) return 'Staking';
  if (dexProjects.some(p => projectName.includes(p))) return 'LP/DEX';
  
  return 'Yield Farming';
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

/**
 * Generate XML for a single URL with multilingual alternates
 */
function generateUrlXml(baseUrl, lastmod, priority, changefreq) {
  let xml = '  <url>\n';
  xml += `    <loc>${escapeXml(baseUrl)}</loc>\n`;
  
  // Add hreflang for all supported languages
  LANGUAGES.forEach(lang => {
    const langUrl = new URL(baseUrl);
    if (lang === 'en') {
      langUrl.searchParams.delete('lang');
    } else {
      langUrl.searchParams.set('lang', lang);
    }
    xml += `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(langUrl.toString())}" />\n`;
  });
  
  // Add x-default (defaults to English)
  const defaultUrl = new URL(baseUrl);
  defaultUrl.searchParams.delete('lang');
  xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defaultUrl.toString())}" />\n`;

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
    const qualifyingTokenPoolCount = new Map(); // token -> count
    const qualifyingTokenChainPoolCount = new Map(); // "token|chain" -> count
    const qualifyingTokenCategoryPoolCount = new Map(); // "token|category" -> count
    const chainQualifyingPoolCount = new Map(); // chain -> count
    const chainQualifyingTvlMap = new Map(); // chain -> tvl

    pools.forEach(p => {
      if (!isQualifyingPool(p)) return;
      const symbols = p.symbol?.split(/[-_\/\s]/).map(s => s.trim().toUpperCase()) || [];
      const type = getPoolType(p);
      if (p.chain) {
        chainQualifyingPoolCount.set(p.chain, (chainQualifyingPoolCount.get(p.chain) || 0) + 1);
        chainQualifyingTvlMap.set(p.chain, (chainQualifyingTvlMap.get(p.chain) || 0) + (p.tvlUsd || 0));
      }
      symbols.forEach(s => {
        if (!isValidToken(s)) return;
        qualifyingTokenPoolCount.set(s, (qualifyingTokenPoolCount.get(s) || 0) + 1);
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
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}mcp`, LASTMOD_PLACEHOLDER, '0.9', 'daily'));
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}plan.html`, LASTMOD_PLACEHOLDER, '0.9', 'weekly'));
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}tokens`, LASTMOD_PLACEHOLDER, '0.9', 'daily'));
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}chains`, LASTMOD_PLACEHOLDER, '0.9', 'daily'));

    const STORY_SLUGS = ['tomoko', 'kevin', 'lucia'];
    STORY_SLUGS.forEach(slug => {
      sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}stories/${slug}.html`, LASTMOD_PLACEHOLDER, '0.7', 'monthly'));
    });

    // 2. Vertical: Chain-Specific Sitemaps
    // Gate to active chains with TVL >= $5M AND >= 3 qualifying pools to avoid index fragmentation
    console.log('📝 Building Vertical Chain Sitemaps...');
    const eligibleChains = Array.from(chainTokensMap.keys()).filter(chain => {
      const qualifyingPools = chainQualifyingPoolCount.get(chain) || 0;
      const tvl = chainQualifyingTvlMap.get(chain) || 0;
      return qualifyingPools >= 3 && tvl >= 5000000;
    });

    const topChains = eligibleChains.sort((a, b) => {
      const tvlA = chainQualifyingTvlMap.get(a) || 0;
      const tvlB = chainQualifyingTvlMap.get(b) || 0;
      return tvlB - tvlA;
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
    const categories = ['Lending', 'Staking', 'LP/DEX', 'Yield Farming'];
    const categoryUrlMap = {
      'Lending': 'Lending',
      'LP/DEX': 'LP%2FDEX',
      'Staking': 'Staking', 
      'Yield Farming': 'Yield%20Farming'
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

    // Generate Index (Prioritized, SOTA Ordering: sitemap-main.xml first, static landing hubs, tokens, categories, chains).
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

    // 4. Global Token Index
    if (sitemaps['sitemap-tokens-all.xml'] && sitemaps['sitemap-tokens-all.xml'].length > 0) {
      indexEntries.push({ loc: `${SITE_URL}sitemap-tokens-all.xml`, lastmod: childMaxLastmod['sitemap-tokens-all.xml'] || now });
    }

    // 5. Vertical Category Shards
    categories.forEach(cat => {
      const safeCatName = cat.replace(/[^a-z0-9]/gi, '-');
      const filename = `sitemap-category-${safeCatName}.xml`;
      if (sitemaps[filename] && sitemaps[filename].length > 0) {
        indexEntries.push({ loc: `${SITE_URL}${filename}`, lastmod: childMaxLastmod[filename] || now });
      }
    });

    // 6. Active Chain Shards (TVL-ranked)
    topChains.forEach(chain => {
      const safeChainName = chain.replace(/[^a-z0-9]/gi, '-');
      const filename = `sitemap-chain-${safeChainName}.xml`;
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

# Sitemap Index
Sitemap: ${SITE_URL}sitemap.xml

# LLM files for Search Agents
LLM: ${SITE_URL}llms.txt
LLM: ${SITE_URL}llms-full.txt

# General crawlers
User-agent: *
Allow: /
Crawl-delay: 1

# Search Agents & AI Assistant crawlers
User-agent: GPTBot
Allow: /
Allow: /llms.txt

User-agent: ChatGPT-User
Allow: /
Allow: /llms.txt

User-agent: Google-InspectionTool
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Googlebot-Image
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Claude-Web
Allow: /

# Block spam bots
User-agent: CCBot
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
    
    await generateSitemapSuite();
    
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

module.exports = { generateSitemapSuite, generateRobotsTxt, getPoolType, cleanupStaleSitemaps, FOREIGN_PAGE_SITEMAPS, parseExistingUrlEntries, resolveLastmods, maxLastmodFromFile, LASTMOD_PLACEHOLDER };