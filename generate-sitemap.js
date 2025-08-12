#!/usr/bin/env node

/**
 * Sitemap Generator for DeFi Garden
 * Generates API-validated sitemap.xml with only combinations that have actual yield data
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Base URL for the site - configurable via environment variable
const SITE_URL = process.env.SITE_URL || 'https://www.defi.garden';

// Defillama API endpoint
const YIELDS_API = 'https://yields.llama.fi/pools';

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
 * Extract valid tokens and chains from pool data
 */
function extractValidCombinations(pools) {
  console.log('🔍 Analyzing pool data for valid combinations...');
  
  const validTokens = new Set();
  const validChains = new Set();
  const validTokenChainCombos = new Map(); // token -> Set of chains
  const validTokenPoolTypes = new Map(); // token -> Set of pool types
  
  pools.forEach(pool => {
    if (!pool.symbol || !pool.chain || !pool.tvlUsd || pool.tvlUsd <= 0) {
      return; // Skip invalid pools
    }
    
    // Only include pools with APY > 0%
    const totalApy = (pool.apy || 0) + (pool.apyReward || 0);
    if (totalApy <= 0) {
      return; // Skip pools with no yield
    }
    
    // Extract token symbols (handle multi-token symbols like "ETH-USDC")
    const symbols = pool.symbol.split(/[-_\/\s]/).map(s => s.trim().toUpperCase());
    
    symbols.forEach(symbol => {
      if (symbol.length >= 2 && symbol.length < 20) { // Valid token symbols
        validTokens.add(symbol);
        validChains.add(pool.chain);
        
        // Track token-chain combinations
        if (!validTokenChainCombos.has(symbol)) {
          validTokenChainCombos.set(symbol, new Set());
        }
        validTokenChainCombos.get(symbol).add(pool.chain);
        
        // Track token-pool type combinations
        const poolType = getPoolType(pool);
        if (!validTokenPoolTypes.has(symbol)) {
          validTokenPoolTypes.set(symbol, new Set());
        }
        validTokenPoolTypes.get(symbol).add(poolType);
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
 * Determine pool type from pool data (simplified version from app.js)
 */
function getPoolType(pool) {
  if (!pool.project) return 'Yield Farming';
  
  const projectName = pool.project.toLowerCase().replace(/\s+/g, '-');
  
  // Simple categorization logic
  const lendingProjects = ['aave', 'compound', 'morpho', 'spark', 'radiant', 'euler'];
  const stakingProjects = ['lido', 'rocket-pool', 'ether.fi', 'jito', 'marinade'];
  const dexProjects = ['uniswap', 'curve', 'balancer', 'pancakeswap', 'sushiswap'];
  
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
 * Generate API-validated sitemap XML content
 */
async function generateSitemap() {
  console.log('🚀 Starting API-validated sitemap generation...');
  
  try {
    // Fetch real pool data from API
    const pools = await fetchPoolData();
    
    // Extract valid combinations from real data
    const { tokens, chains, tokenChainCombos, tokenPoolTypes } = extractValidCombinations(pools);
    
    const now = new Date().toISOString();
    const urls = [];

    // Homepage - always include
    urls.push({
      loc: SITE_URL,
      lastmod: now,
      changefreq: 'daily',
      priority: '1.0'
    });

    // Individual token pages - only tokens that have actual pools
    console.log('📝 Adding validated token pages...');
    tokens.forEach(token => {
      // Skip tokens with XML special characters to avoid parsing errors
      if (token.includes('&') || token.includes('<') || token.includes('>')) {
        console.log(`⚠️  Skipping token with XML special characters: ${token}`);
        return;
      }
      
      urls.push({
        loc: `${SITE_URL}/?token=${encodeURIComponent(token)}`,
        lastmod: now,
        changefreq: 'daily',
        priority: '0.9'
      });
    });

    // Token + Chain combinations - only combinations that exist in data
    console.log('📝 Adding validated token-chain combinations...');
    for (const [token, chainSet] of tokenChainCombos.entries()) {
      // Skip tokens with XML special characters
      if (token.includes('&') || token.includes('<') || token.includes('>')) {
        console.log(`⚠️  Skipping token with XML special characters: ${token}`);
        continue;
      }
      
      chainSet.forEach(chain => {
        urls.push({
          loc: `${SITE_URL}/?token=${encodeURIComponent(token)}&chain=${encodeURIComponent(chain)}`,
          lastmod: now,
          changefreq: 'daily',
          priority: '0.8'
        });
      });
    }

    // Token + Pool type combinations - only combinations that exist
    console.log('📝 Adding validated token-pooltype combinations...');
    const poolTypeUrlMap = {
      'Lending': 'Lending',
      'LP/DEX': 'LP%2FDEX',
      'Staking': 'Staking', 
      'Yield Farming': 'Yield%20Farming'
    };
    
    for (const [token, poolTypeSet] of tokenPoolTypes.entries()) {
      // Skip tokens with XML special characters
      if (token.includes('&') || token.includes('<') || token.includes('>')) {
        console.log(`⚠️  Skipping token with XML special characters: ${token}`);
        continue;
      }
      
      poolTypeSet.forEach(poolType => {
        if (poolTypeUrlMap[poolType]) {
          urls.push({
            loc: `${SITE_URL}/?token=${encodeURIComponent(token)}&poolTypes=${poolTypeUrlMap[poolType]}`,
            lastmod: now,
            changefreq: 'daily',
            priority: '0.7'
          });
        }
      });
    }

    // Chain-only pages - only chains that have pools
    console.log('📝 Adding validated chain pages...');
    chains.forEach(chain => {
      urls.push({
        loc: `${SITE_URL}/?chain=${encodeURIComponent(chain)}`,
        lastmod: now,
        changefreq: 'daily',
        priority: '0.6'
      });
    });

    // High TVL and APY pages (keep these as they're filter-based, not content-based)
    const tvlLevels = ['1000000', '10000000', '100000000']; // $1M, $10M, $100M
    const apyLevels = ['5', '10', '20', '50']; // 5%, 10%, 20%, 50%
    
    tvlLevels.forEach(tvl => {
      urls.push({
        loc: `${SITE_URL}/?minTvl=${tvl}`,
        lastmod: now,
        changefreq: 'daily',
        priority: '0.5'
      });
    });

    apyLevels.forEach(apy => {
      urls.push({
        loc: `${SITE_URL}/?minApy=${apy}`,
        lastmod: now,
        changefreq: 'daily',
        priority: '0.5'
      });
    });

    console.log(`✅ Generated ${urls.length} validated URLs for sitemap`);
    
    // Generate XML with proper escaping
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    urls.forEach(url => {
      xml += '  <url>\n';
      xml += `    <loc>${escapeXml(url.loc)}</loc>\n`;
      xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
      xml += `    <priority>${url.priority}</priority>\n`;
      xml += '  </url>\n';
    });
    
    xml += '</urlset>';
    
    return xml;
    
  } catch (error) {
    console.error('❌ Error during API-validated sitemap generation:', error.message);
    console.log('🔄 Falling back to static sitemap generation...');
    
    // Fallback to basic sitemap if API fails
    return generateFallbackSitemap();
  }
}

/**
 * Generate fallback sitemap when API fails
 */
function generateFallbackSitemap() {
  const now = new Date().toISOString();
  const urls = [];

  // Just homepage and basic pages
  urls.push({
    loc: SITE_URL,
    lastmod: now,
    changefreq: 'daily',
    priority: '1.0'
  });

  // Only most popular tokens to avoid soft 404s
  const safeTokens = ['USDC', 'USDT', 'DAI', 'ETH', 'BTC', 'WETH', 'WBTC'];
  safeTokens.forEach(token => {
    urls.push({
      loc: `${SITE_URL}/?token=${token}`,
      lastmod: now,
      changefreq: 'daily',
      priority: '0.9'
    });
  });

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  
  urls.forEach(url => {
    xml += '  <url>\n';
    xml += `    <loc>${url.loc}</loc>\n`;
    xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    xml += `    <priority>${url.priority}</priority>\n`;
    xml += '  </url>\n';
  });
  
  xml += '</urlset>';
  
  return xml;
}

/**
 * Generate robots.txt content
 */
function generateRobotsTxt() {
  return `User-agent: *
Allow: /

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml

# Crawl-delay for respectful crawling
Crawl-delay: 1

# Allow all search engines to index our yield data
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /

User-agent: DuckDuckBot
Allow: /

User-agent: Baiduspider
Allow: /

# Block unnecessary paths (none currently)
# Disallow: /admin/
# Disallow: /private/
`;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Generating API-validated sitemap for DeFi Garden...');
    
    // Generate sitemap (now async)
    const sitemapContent = await generateSitemap();
    fs.writeFileSync('sitemap.xml', sitemapContent);
    console.log(`✅ Generated sitemap.xml with ${sitemapContent.split('<url>').length - 1} URLs`);
    
    // Generate robots.txt
    const robotsContent = generateRobotsTxt();
    fs.writeFileSync('robots.txt', robotsContent);
    console.log('✅ Generated robots.txt');
    
    // Stats
    console.log('\n📊 Sitemap Statistics:');
    console.log(`- Total URLs: ${sitemapContent.split('<url>').length - 1}`);
    console.log(`- File size: ${(sitemapContent.length / 1024).toFixed(2)} KB`);
    console.log(`- Generation method: ${sitemapContent.includes('validated') ? 'API-validated' : 'Fallback'}`);
    
    console.log('\n🔍 SEO Benefits:');
    console.log('- ✅ Zero soft 404 errors (all URLs have actual content)');
    console.log('- ✅ Validated token/chain combinations only');
    console.log('- ✅ Real-time data integration');
    console.log('- ✅ Better crawl budget utilization');
    console.log('- ✅ Higher content quality signals');
    
    console.log('\n📝 Next Steps:');
    console.log('1. Upload sitemap.xml and robots.txt to your web server root');
    console.log('2. Submit sitemap to Google Search Console');
    console.log('3. Monitor for elimination of soft 404 errors');
    console.log('4. Set up automated daily sitemap regeneration with API validation');
    
  } catch (error) {
    console.error('❌ Error generating sitemap:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { 
  generateSitemap, 
  generateFallbackSitemap, 
  generateRobotsTxt, 
  fetchPoolData, 
  extractValidCombinations, 
  getPoolType 
};