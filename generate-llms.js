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
 * Build concise llms.txt content
 */
function buildConcise(meta, categories, highYield) {
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
  
  // Token pages section  
  lines.push('## Token Pages');
  lines.push(`TL;DR: Token-specific yield opportunities and analytics. Count: ${categories.tokens.length}`);
  
  // Show sample of popular tokens
  const sampleTokens = categories.tokens
    .filter(url => {
      try {
        const params = new URLSearchParams(new URL(url).search);
        const token = params.get('token');
        if (!token) return false;
        const decodedToken = decodeURIComponent(token).toUpperCase();
        return ['ETH', 'USDC', 'USDT', 'DAI', 'WETH', 'BTC', 'WBTC'].some(popular => 
          decodedToken.includes(popular)
        );
      } catch {
        return false; // Skip malformed URLs
      }
    })
    .slice(0, 8);
  
  sampleTokens.forEach(url => lines.push(`- ${url}`));
  lines.push('');
  
  // Chain pages section
  lines.push('## Chain Pages');
  lines.push(`TL;DR: Chain-specific DeFi opportunities and metrics. Count: ${categories.chains.length}`);
  categories.chains.slice(0, 8).forEach(url => lines.push(`- ${url}`));
  lines.push('');
  
  // Pool types section
  lines.push('## Pool Types');
  lines.push(`TL;DR: Categorized by strategy - lending, staking, LP/DEX. Count: ${categories.poolTypes.length}`);
  categories.poolTypes.slice(0, 6).forEach(url => lines.push(`- ${url}`));
  lines.push('');
  
  // High-yield opportunities
  lines.push('## High-Yield Opportunities');
  lines.push('TL;DR: Top live yields by APY (filtered by TVL ≥ $10k).');
  
  if (!highYield.top.length) {
    lines.push('- Data temporarily unavailable from DefiLlama API');
  } else {
    highYield.top.slice(0, 10).forEach(pool => {
      const apy = `${Number(pool.apy).toFixed(2)}%`;
      const tvl = `$${Math.round(Number(pool.tvlUsd) || 0).toLocaleString()}`;
      const name = [pool.chain, pool.project, pool.symbol].filter(Boolean).join(' · ');
      lines.push(`- ${name} — ${apy} APY, ${tvl} TVL`);
    });
  }
  lines.push('');
  
  // Footer note
  lines.push(`Note: This file is optimized for AI assistants. For live data and trading, visit ${meta.baseUrl}`);
  
  return lines.join('\n');
}

/**
 * Build comprehensive llms-full.txt content
 */
function buildFull(meta, categories, highYield) {
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
    
    // Build metadata
    const meta = {
      baseUrl,
      updatedAt: new Date().toISOString(),
      totalUrls: urls.length,
      defiLlamaFetchedAt: sourceTs
    };
    
    // Generate content
    const conciseContent = buildConcise(meta, categories, highYield);
    const fullContent = buildFull(meta, categories, highYield);
    
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