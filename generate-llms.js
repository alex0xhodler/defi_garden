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

// Logging utilities with prefix
function log(msg) { console.log(`🤖 [llms] ${msg}`); }
function err(msg, e) { console.error(`❌ [llms][error] ${msg}${e ? `: ${e.message}` : ''}`); }

/**
 * Parse sitemap.xml and extract URLs
 */
async function parseSitemap(sitemapPath) {
  try {
    const xml = fs.readFileSync(sitemapPath, 'utf8');
    const parser = new XMLParser({ ignoreAttributes: false });
    const data = parser.parse(xml);
    
    const urlset = data.urlset || {};
    const entries = Array.isArray(urlset.url) ? urlset.url : (urlset.url ? [urlset.url] : []);
    const urls = entries.map(entry => entry.loc).filter(Boolean);
    
    log(`Parsed ${urls.length} URLs from sitemap`);
    return Array.from(new Set(urls)).sort(); // Dedupe and sort for consistency
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

/**
 * Select high-yield opportunities from pool data
 */
function pickHighYield(pools, options = {}) {
  const { minTvlUsd = 10000, topN = 15 } = options;
  
  if (!pools || pools.length === 0) {
    return { top: [], byChain: {} };
  }

  // Filter pools with sufficient TVL and valid APY
  const filtered = pools.filter(pool => {
    const tvl = Number(pool.tvlUsd) || 0;
    const apy = Number(pool.apy) || 0;
    return tvl >= minTvlUsd && apy > 0 && isFinite(apy);
  });

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

/**
 * Build concise llms.txt content with search-optimized sections
 */
function buildConcise(meta, categories, highYield, yieldAnalysis) {
  const lines = [];
  
  // Header with single H1
  lines.push('# DeFi Garden — Yield Farming Discovery Platform');
  lines.push('');
  
  // Metadata
  lines.push(`- Last Updated: ${meta.updatedAt}`);
  lines.push(`- Canonical: ${meta.baseUrl}`);
  lines.push(`- Data Sources: sitemap.xml, DefiLlama API`);
  lines.push(`- Total URLs: ${meta.totalUrls}`);
  lines.push('');
  
  // Homepage section
  lines.push('## Homepage');
  lines.push('TL;DR: Main dashboard for discovering DeFi yields across all chains and protocols.');
  categories.homepage.slice(0, 3).forEach(url => lines.push(`- ${url}`));
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
    const protocolUrl = `${meta.baseUrl}/?search=${encodeURIComponent(protocol)}`;
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
  lines.push(`- "Pendle opportunities" → ${meta.baseUrl}/?search=Pendle`);
  lines.push(`- "High APY staking" → ${meta.baseUrl}/?poolTypes=Staking&minApy=10`);
  lines.push(`- "Safe lending USDT" → ${meta.baseUrl}/?token=USDT&poolTypes=Lending`);
  lines.push(`- "Arbitrum LP tokens" → ${meta.baseUrl}/?chain=Arbitrum&poolTypes=LP%2FDEX`);
  lines.push(`- "High TVL pools" → ${meta.baseUrl}/?minTvl=10000000`);
  lines.push('');
  
  // Current top yields
  lines.push('## Current Top Yields');
  lines.push('TL;DR: Live highest APY opportunities (updated daily, TVL ≥ $10k).');
  
  if (!highYield.top.length) {
    lines.push('- Live yield data temporarily unavailable from DefiLlama API');
  } else {
    highYield.top.slice(0, 8).forEach(pool => {
      const apy = `${Number(pool.apy).toFixed(1)}%`;
      const tvl = `$${Math.round(Number(pool.tvlUsd) || 0).toLocaleString()}`;
      const name = [pool.chain, pool.project, pool.symbol].filter(Boolean).join(' · ');
      const searchUrl = `${meta.baseUrl}/?token=${encodeURIComponent(pool.symbol || '')}&chain=${encodeURIComponent(pool.chain || '')}`;
      lines.push(`- ${name} — ${apy} APY, ${tvl} TVL — ${searchUrl}`);
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
function buildFull(meta, categories, highYield, yieldAnalysis) {
  const lines = [];
  
  // Header with single H1
  lines.push('# DeFi Garden — Complete Site Index for AI Agents');
  lines.push('');
  
  // Extended metadata
  lines.push(`- Last Updated: ${meta.updatedAt}`);
  lines.push(`- Canonical: ${meta.baseUrl}`);
  lines.push(`- Data Sources: sitemap.xml, DefiLlama API (fetched: ${meta.defiLlamaFetchedAt || 'unavailable'})`);
  lines.push(`- Total URLs: ${meta.totalUrls}`);
  lines.push(`- Categories: homepage(${categories.homepage.length}), tokens(${categories.tokens.length}), chains(${categories.chains.length}), poolTypes(${categories.poolTypes.length}), highValue(${categories.highValue.length})`);
  lines.push('');
  
  // Complete sections with all URLs
  
  // Homepage
  lines.push('## Homepage');
  lines.push('TL;DR: Main application entry points and dashboards.');
  categories.homepage.forEach(url => lines.push(`- ${url}`));
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
      const protocolUrl = `${meta.baseUrl}/?search=${encodeURIComponent(protocol)}`;
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
        const poolUrl = pool.url || meta.baseUrl;
        lines.push(`- ${details} — ${apy} APY, ${tvl} TVL — ${poolUrl}`);
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
    const { yields, sourceTs } = await fetchYieldsSafe();
    const highYield = pickHighYield(yields);
    const yieldAnalysis = analyzeYieldData(yields);
    
    // Build metadata
    const meta = {
      baseUrl,
      updatedAt: new Date().toISOString(),
      totalUrls: urls.length,
      defiLlamaFetchedAt: sourceTs
    };
    
    // Generate content
    const conciseContent = buildConcise(meta, categories, highYield, yieldAnalysis);
    const fullContent = buildFull(meta, categories, highYield, yieldAnalysis);
    
    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    // Write files
    const concisePath = path.join(OUTPUT_DIR, 'llms.txt');
    const fullPath = path.join(OUTPUT_DIR, 'llms-full.txt');
    
    fs.writeFileSync(concisePath, conciseContent, 'utf8');
    fs.writeFileSync(fullPath, fullContent, 'utf8');
    
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
  pickHighYield,
  buildConcise,
  buildFull
};