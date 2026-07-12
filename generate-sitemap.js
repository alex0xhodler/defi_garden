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
// Mirrors the app's own default rendering threshold so a sitemap URL never
// advertises more than the live page shows by default.
// Must stay in sync with app.js: DEFAULT_MIN_TVL (app.js:730) and
// APY_SANITY_LIMIT (app.js:729) — no shared import exists between the two.
const SITEMAP_MIN_TVL = 10000000; // = app.js DEFAULT_MIN_TVL
const APY_SANITY_LIMIT = 1000; // = app.js APY_SANITY_LIMIT
const SITEMAP_MIN_QUALIFYING_POOLS = 2;

function isAnomalousApy(pool) {
  return ((pool.apyBase || 0) + (pool.apyReward || 0)) > APY_SANITY_LIMIT;
}

function isQualifyingPool(pool) {
  return (pool.tvlUsd || 0) >= SITEMAP_MIN_TVL && !isAnomalousApy(pool);
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

/**
 * Generate the complete sitemap suite with Vertical Semantic Grouping
 * Optimized for "Intent-Based" AI Agent crawling (Chain/Category focused)
 */
async function generateSitemapSuite() {
  console.log('🚀 Starting SOTA sitemap generation with Vertical Semantic Grouping...');
  
  try {
    const pools = await fetchPoolData();
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

    pools.forEach(p => {
      if (!isQualifyingPool(p)) return;
      const symbols = p.symbol?.split(/[-_\/\s]/).map(s => s.trim().toUpperCase()) || [];
      const type = getPoolType(p);
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

    // 1. Main & Metadata Sitemaps
    console.log('📝 Building sitemap-main.xml...');
    sitemaps['sitemap-main.xml'].push(generateUrlXml(SITE_URL, now, '1.0', 'hourly'));

    // Garden Planner + Yield Stories (static pages generated by generate-stories.js)
    sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}plan.html`, now, '0.9', 'weekly'));
    const STORY_SLUGS = ['tomoko', 'kevin', 'lucia'];
    STORY_SLUGS.forEach(slug => {
      sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}stories/${slug}.html`, now, '0.7', 'monthly'));
    });

    const tvlLevels = ['1000000', '10000000', '100000000'];
    const apyLevels = ['5', '10', '20', '50'];
    
    tvlLevels.forEach(tvl => sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}?minTvl=${tvl}`, now, '0.5', 'daily')));
    apyLevels.forEach(apy => sitemaps['sitemap-main.xml'].push(generateUrlXml(`${SITE_URL}?minApy=${apy}`, now, '0.5', 'daily')));

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
      sitemaps[filename].push(generateUrlXml(`${SITE_URL}?chain=${encodeURIComponent(chain)}`, now, '0.8', 'daily'));
      
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
        sitemaps[filename].push(generateUrlXml(`${SITE_URL}?token=${encodeURIComponent(token)}&chain=${encodeURIComponent(chain)}`, now, priority, 'daily'));
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
          sitemaps[filename].push(generateUrlXml(`${SITE_URL}?token=${encodeURIComponent(token)}&poolTypes=${categoryUrlMap[cat]}`, now, priority, 'daily'));
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
      sitemaps['sitemap-tokens-all.xml'].push(generateUrlXml(`${SITE_URL}?token=${encodeURIComponent(token)}`, now, priority, 'daily'));
    });
    console.log(`   ⏭️  sitemap-tokens-all.xml: dropped ${tokensDropped} of ${tokens.length} thin token(s) below quality gate (< ${SITEMAP_MIN_QUALIFYING_POOLS} pools @ $${(SITEMAP_MIN_TVL / 1e6).toFixed(0)}M TVL)`);

    // Write all sitemaps
    const generatedFilenames = Object.keys(sitemaps);
    for (const filename of generatedFilenames) {
      if (sitemaps[filename].length > 0) {
        fs.writeFileSync(filename, wrapSitemap(sitemaps[filename].join('')));
        console.log(`✅ Generated ${filename} with ${sitemaps[filename].length} URLs`);
      }
    }

    // Generate Index (Alphabetical)
    let indexXml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    indexXml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    generatedFilenames.sort().forEach(filename => {
      if (sitemaps[filename].length > 0) {
        indexXml += '  <sitemap>\n';
        indexXml += `    <loc>${SITE_URL}${filename}</loc>\n`;
        indexXml += `    <lastmod>${now}</lastmod>\n`;
        indexXml += '  </sitemap>\n';
      }
    });
    // Include the static /tokens/ landing-page sitemap (021) when it has been
    // generated (generate-token-pages.js writes it in the same CI run). Kept
    // discoverable via the index so crawlers find the real static pages.
    if (fs.existsSync('sitemap-token-pages.xml')) {
      indexXml += '  <sitemap>\n';
      indexXml += `    <loc>${SITE_URL}sitemap-token-pages.xml</loc>\n`;
      indexXml += `    <lastmod>${now}</lastmod>\n`;
      indexXml += '  </sitemap>\n';
    }
    // Include the static /chains/ landing-page sitemap (041) when it has been
    // generated (generate-chain-pages.js writes it in the same CI run) —
    // mirrors the sitemap-token-pages.xml guard directly above.
    if (fs.existsSync('sitemap-chain-pages.xml')) {
      indexXml += '  <sitemap>\n';
      indexXml += `    <loc>${SITE_URL}sitemap-chain-pages.xml</loc>\n`;
      indexXml += `    <lastmod>${now}</lastmod>\n`;
      indexXml += '  </sitemap>\n';
    }
    indexXml += '</sitemapindex>';
    fs.writeFileSync('sitemap.xml', indexXml);
    console.log('✅ Generated sitemap.xml (Index)');

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

module.exports = { generateSitemapSuite, generateRobotsTxt };