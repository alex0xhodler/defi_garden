#!/usr/bin/env node

/**
 * Sitemap Generator for DeFi Garden
 * Generates comprehensive sitemap.xml with token-specific URLs for SEO
 */

const fs = require('fs');
const path = require('path');

// Base URL for the site
const SITE_URL = 'https://defigarden.app';

// Comprehensive list of popular DeFi tokens for SEO
const POPULAR_TOKENS = [
  // Major cryptocurrencies
  'BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI',
  'ATOM', 'XTZ', 'ALGO', 'NEAR', 'FTM', 'ONE', 'LUNA', 'EGLD', 'FLOW', 'ICP',
  
  // Stablecoins
  'USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'LUSD', 'MIM', 'USDD', 'TUSD', 'USDP',
  'GUSD', 'SUSD', 'DOLA', 'FEI', 'TRIBE', 'RAI', 'OUSD', 'USDN', 'USTC', 'UST',
  
  // DeFi blue chips
  'AAVE', 'COMP', 'MKR', 'SNX', 'CRV', 'YFI', 'SUSHI', 'BAL', 'LDO', 'RPL',
  'CVX', 'FXS', 'ALCX', 'SPELL', 'ICE', 'OHM', 'TRIBE', 'RARI', 'BADGER', 'FARM',
  
  // Layer 2 tokens
  'ARB', 'OP', 'IMX', 'LRC', 'BOBA', 'METIS', 'KAVA', 'ROSE', 'CELO', 'MINA',
  
  // Lending protocols tokens
  'COMP', 'AAVE', 'CREAM', 'VENUS', 'BENQI', 'GEIST', 'RADIANT', 'HUNDRED',
  'GRANARY', 'STRIKE', 'IRON', 'DFORCE', 'EULER', 'MAPLE', 'CLEARPOOL',
  
  // DEX tokens
  'UNI', 'SUSHI', 'CAKE', 'JOE', 'QUICK', 'SPIRIT', 'SPOOKY', 'BOO', 'DODO',
  'BANCOR', 'KNC', 'ZRX', 'ALPHA', 'BETA', 'GAMMA', 'DELTA', 'THETA', 'KAPPA',
  
  // Yield farming tokens
  'YFI', 'FARM', 'HARVEST', 'AUTO', 'BEEFY', 'ALPACA', 'BELT', 'BUNNY', 'EGG',
  'WAULT', 'BLIZZARD', 'STORM', 'THUNDER', 'LIGHTNING', 'TORNADO', 'HURRICANE',
  
  // Synthetic assets
  'SNX', 'SYNTH', 'MIRROR', 'MIR', 'MAAPL', 'MTSLA', 'MGOOGL', 'MSPY', 'QQQ',
  'STSLA', 'SAAVE', 'SLINK', 'SETH', 'SBTC', 'SUSD', 'SEUR', 'SGBP', 'SJPY',
  
  // Wrapped tokens
  'WETH', 'WBTC', 'WBNB', 'WMATIC', 'WAVAX', 'WFTM', 'WONE', 'WROSE', 'WCELO',
  'WNEAR', 'WSOL', 'WDOT', 'WATOM', 'WADA', 'WXTZ', 'WALGO', 'WFLOW', 'WICP',
  
  // Liquid staking tokens
  'STETH', 'RETH', 'CBETH', 'WSTETH', 'SFRXETH', 'ANKR', 'STKD', 'SWETH',
  'OETH', 'FRXETH', 'SETH2', 'RETH2', 'STMATIC', 'MATICX', 'STAKEWISE',
  
  // Cross-chain tokens
  'WORMHOLE', 'ANYSWAP', 'SYNAPSE', 'HOP', 'CONNEXT', 'CELER', 'MULTICHAIN',
  'STARGATE', 'LAYERZERO', 'HYPERLANE', 'NOMAD', 'THORCHAIN', 'RUNE', 'MAYA',
  
  // Gaming and NFT tokens
  'AXS', 'SLP', 'SAND', 'MANA', 'ENJ', 'CHZ', 'GALA', 'ILV', 'GHST', 'REVV',
  'ALICE', 'TLM', 'SPS', 'DEC', 'GODS', 'IMX', 'LOOKS', 'BLUR', 'X2Y2', 'GEM',
  
  // Privacy tokens
  'XMR', 'ZEC', 'DASH', 'FIRO', 'BEAM', 'GRIN', 'HAVEN', 'PIRATE', 'DERO',
  'ARRR', 'TORN', 'RAIL', 'SCRT', 'OASIS', 'NYM', 'KEEP', 'NU', 'AZERO',
  
  // Meme tokens (popular for yield farming)
  'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BABYDOGE', 'ELON', 'KISHU', 'AKITA', 'HOKK',
  'LEASH', 'BONE', 'RYOSHI', 'SAITAMA', 'LUFFY', 'GOKU', 'NARUTO', 'KAKASHI',
  
  // Enterprise and institutional
  'LINK', 'VET', 'HBAR', 'ALGO', 'XLM', 'AMP', 'REQ', 'RLC', 'OCEAN', 'FET',
  'AGIX', 'NMR', 'LPT', 'GRT', 'BAND', 'API3', 'UMA', 'KEEP', 'NU', 'REN',
  
  // Real world assets
  'USDR', 'USDY', 'OUSG', 'BUIDL', 'FDUSD', 'PYUSD', 'EUROC', 'GYEN', 'ZUSD',
  'XSGD', 'TCAD', 'TGBP', 'TAUD', 'THKD', 'NZDS', 'BIDR', 'IDRT', 'TRY',
  
  // Additional high-volume tokens
  'FTT', 'GMT', 'APE', 'LOOKS', 'BLUR', 'MAGIC', 'TREASURE', 'SMOL', 'GRAIL',
  'JONES', 'DOPEX', 'RDNT', 'PENDLE', 'PRIME', 'ECHELON', 'BATTALION', 'VELA'
];

// Major blockchain networks
const NETWORKS = [
  'ethereum', 'polygon', 'bsc', 'avalanche', 'fantom', 'arbitrum', 'optimism',
  'solana', 'terra', 'cosmos', 'osmosis', 'juno', 'secret', 'kava', 'cronos'
];

// Popular token pairs for LP yields
const POPULAR_PAIRS = [
  'ETH-USDC', 'BTC-ETH', 'USDC-USDT', 'ETH-DAI', 'WBTC-ETH', 'MATIC-ETH',
  'BNB-BUSD', 'AVAX-USDC', 'SOL-USDC', 'DOT-USDT', 'LINK-ETH', 'UNI-ETH',
  'AAVE-ETH', 'COMP-ETH', 'SNX-ETH', 'CRV-ETH', 'BAL-ETH', 'SUSHI-ETH'
];

/**
 * Generate sitemap XML content
 */
function generateSitemap() {
  const now = new Date().toISOString();
  const urls = [];

  // Homepage
  urls.push({
    loc: SITE_URL,
    lastmod: now,
    changefreq: 'daily',
    priority: '1.0'
  });

  // Individual token pages
  POPULAR_TOKENS.forEach(token => {
    urls.push({
      loc: `${SITE_URL}/?token=${token}`,
      lastmod: now,
      changefreq: 'daily',
      priority: '0.9'
    });
  });

  // Token + Network combinations (high-value combinations)
  const priorityNetworks = ['ethereum', 'polygon', 'bsc', 'avalanche', 'arbitrum'];
  const priorityTokens = POPULAR_TOKENS.slice(0, 50); // Top 50 tokens
  
  priorityTokens.forEach(token => {
    priorityNetworks.forEach(network => {
      urls.push({
        loc: `${SITE_URL}/?token=${token}&chain=${network}`,
        lastmod: now,
        changefreq: 'daily',
        priority: '0.8'
      });
    });
  });

  // Pool type specific pages
  const poolTypes = ['Lending', 'LP%2FDEX', 'Staking', 'Yield%20Farming'];
  POPULAR_TOKENS.slice(0, 30).forEach(token => {
    poolTypes.forEach(type => {
      urls.push({
        loc: `${SITE_URL}/?token=${token}&poolType=${type}`,
        lastmod: now,
        changefreq: 'daily',
        priority: '0.7'
      });
    });
  });

  // Network-specific pages
  NETWORKS.forEach(network => {
    urls.push({
      loc: `${SITE_URL}/?chain=${network}`,
      lastmod: now,
      changefreq: 'daily',
      priority: '0.6'
    });
  });

  // High TVL and APY pages
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

  // Generate XML
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
function main() {
  try {
    console.log('🚀 Generating comprehensive sitemap for DeFi Garden...');
    
    // Generate sitemap
    const sitemapContent = generateSitemap();
    fs.writeFileSync('sitemap.xml', sitemapContent);
    console.log(`✅ Generated sitemap.xml with ${sitemapContent.split('<url>').length - 1} URLs`);
    
    // Generate robots.txt
    const robotsContent = generateRobotsTxt();
    fs.writeFileSync('robots.txt', robotsContent);
    console.log('✅ Generated robots.txt');
    
    // Stats
    console.log('\n📊 Sitemap Statistics:');
    console.log(`- Total URLs: ${sitemapContent.split('<url>').length - 1}`);
    console.log(`- Unique tokens: ${POPULAR_TOKENS.length}`);
    console.log(`- Supported networks: ${NETWORKS.length}`);
    console.log(`- File size: ${(sitemapContent.length / 1024).toFixed(2)} KB`);
    
    console.log('\n🔍 SEO Benefits:');
    console.log('- Individual token yield pages for organic search');
    console.log('- Network-specific landing pages');
    console.log('- Pool type categorization pages');
    console.log('- High-value TVL and APY filter pages');
    console.log('- Daily update frequency for fresh content');
    
    console.log('\n📝 Next Steps:');
    console.log('1. Upload sitemap.xml and robots.txt to your web server root');
    console.log('2. Submit sitemap to Google Search Console');
    console.log('3. Monitor indexing progress and organic traffic');
    console.log('4. Set up automated daily sitemap regeneration');
    
  } catch (error) {
    console.error('❌ Error generating sitemap:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { generateSitemap, generateRobotsTxt, POPULAR_TOKENS, NETWORKS };