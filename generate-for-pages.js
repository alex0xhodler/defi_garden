/**
 * Generates static /for/<subscription> intent landing pages for DeFi Garden v2.
 * Each page includes the Quiet design system, interactive virtual card simulator,
 * AEO/GEO structured data (Product, Offer, SoftwareApplication JSON-LD),
 * and 1-click deposit triggers.
 */

const fs = require('fs');
const path = require('path');

const SUBSCRIPTIONS = [
  {
    slug: 'claude',
    name: 'Anthropic Claude Pro',
    category: 'AI / Developer',
    baseMonthlyUsd: 20.00,
    taxBufferMonthlyUsd: 24.00,
    taxBufferDeltaUsd: 4.00,
    iconDomain: 'anthropic.com',
    headline: 'Never pay for Claude Pro again.',
    subhead: 'Deposit once into curated Base lending vaults. Realized yield pays your $20/mo Claude invoice perpetually. Keep 100% of your principal with instant liquidity.',
    metaDesc: 'Self-paying Claude Pro subscription powered by Base DeFi yield. Keep 100% of your principal while automated yields cover your $20/mo Anthropic bill.'
  },
  {
    slug: 'cursor',
    name: 'Cursor Pro IDE',
    category: 'AI / Developer',
    baseMonthlyUsd: 20.00,
    taxBufferMonthlyUsd: 24.00,
    taxBufferDeltaUsd: 4.00,
    iconDomain: 'cursor.com',
    headline: 'Eliminate your Cursor Pro bill with idle crypto.',
    subhead: 'Deposit once into curated Base lending vaults. Automated yield covers your $20/mo IDE subscription on autopilot. Principal is 100% self-custodial.',
    metaDesc: 'Fund Cursor Pro forever using Base DeFi yield. Self-paying developer subscriptions with zero capital erosion.'
  },
  {
    slug: 'chatgpt',
    name: 'OpenAI ChatGPT Plus',
    category: 'AI / Developer',
    baseMonthlyUsd: 20.00,
    taxBufferMonthlyUsd: 24.00,
    taxBufferDeltaUsd: 4.00,
    iconDomain: 'openai.com',
    headline: 'Fund ChatGPT Plus forever from DeFi yield.',
    subhead: 'Lock capital once into curated Base vaults. Automated card settlement covers your $20/mo OpenAI invoice while your deposit remains untouched.',
    metaDesc: 'Pay ChatGPT Plus automatically from Base DeFi yield. Non-custodial, principal-protected subscription funding.'
  },
  {
    slug: 'spotify',
    name: 'Spotify Premium',
    category: 'Media Streaming',
    baseMonthlyUsd: 11.99,
    taxBufferMonthlyUsd: 14.39,
    taxBufferDeltaUsd: 2.40,
    iconDomain: 'spotify.com',
    headline: 'Perpetual Spotify Premium with zero monthly burn.',
    subhead: 'Deposit once on Base. Net yield covers your $11.99/mo Spotify Premium indefinitely while your initial deposit stays 100% yours.',
    metaDesc: 'Get lifetime Spotify Premium yield-funding with Base DeFi yields. Keep your principal, let yield pay the music bill.'
  },
  {
    slug: 'netflix',
    name: 'Netflix Standard',
    category: 'Media Streaming',
    baseMonthlyUsd: 17.99,
    taxBufferMonthlyUsd: 21.59,
    taxBufferDeltaUsd: 3.60,
    iconDomain: 'netflix.com',
    headline: 'Stream Netflix perpetually from Base yield.',
    subhead: 'Lock capital into curated Base liquidity vaults. Monthly yield pays your $17.99 Netflix subscription automatically without touching your principal.',
    metaDesc: 'Self-paying Netflix subscription on Base. Yield covers your monthly streaming bill while you preserve 100% of your crypto.'
  },
  {
    slug: 'aws',
    name: 'AWS Cloud Micro-Infra',
    category: 'Cloud Compute',
    baseMonthlyUsd: 50.00,
    taxBufferMonthlyUsd: 60.00,
    taxBufferDeltaUsd: 10.00,
    iconDomain: 'amazon.com',
    headline: 'Self-paying AWS cloud compute for builders and agents.',
    subhead: 'Deposit once on Base. Automated monthly yield sweeps extinguish $50.00/mo in cloud server and database burn with zero human ops.',
    metaDesc: 'Perpetual AWS cloud compute funding via Base DeFi yield. Autonomous infrastructure for Web3 developers and AI agents.'
  },
  {
    slug: 'github',
    name: 'GitHub Copilot Pro',
    category: 'AI / Developer',
    baseMonthlyUsd: 10.00,
    taxBufferMonthlyUsd: 12.00,
    taxBufferDeltaUsd: 2.00,
    iconDomain: 'github.com',
    headline: 'Code with Copilot Pro on permanent autopilot.',
    subhead: 'Deposit into curated Base lending vaults. Realized yield covers your $10.00/mo Copilot subscription while your principal stays 100% yours.',
    metaDesc: 'Fund GitHub Copilot from Base DeFi yields. Zero monthly expense, 100% self-custodial capital.'
  },
  {
    slug: 'youtube',
    name: 'YouTube Premium',
    category: 'Media Streaming',
    baseMonthlyUsd: 13.99,
    taxBufferMonthlyUsd: 16.79,
    taxBufferDeltaUsd: 2.80,
    iconDomain: 'youtube.com',
    headline: 'Ad-free YouTube Premium funded forever.',
    subhead: 'Lock capital in curated Base vaults. Realized yield settles YouTube Premium automatically with complete principal protection.',
    metaDesc: 'Yield-funded YouTube Premium subscription on Base. Zero monthly out-of-pocket costs.'
  },
  {
    slug: 'amazonprime',
    name: 'Amazon Prime',
    category: 'Shopping & Media',
    baseMonthlyUsd: 15.00,
    taxBufferMonthlyUsd: 18.00,
    taxBufferDeltaUsd: 3.00,
    iconDomain: 'amazon.com',
    headline: 'Amazon Prime deliveries paid by DeFi yield.',
    subhead: 'Deposit once on Base. Realized yield covers your $15.00/mo Amazon Prime membership on autopilot while retaining 100% principal liquidity.',
    metaDesc: 'Free Amazon Prime membership funded by Base DeFi yields. Save money and keep all your crypto deposit.'
  },
  {
    slug: 'disney',
    name: 'Disney+',
    category: 'Media Streaming',
    baseMonthlyUsd: 15.99,
    taxBufferMonthlyUsd: 19.19,
    taxBufferDeltaUsd: 3.20,
    iconDomain: 'disneyplus.com',
    headline: 'Watch Disney+ forever with zero out-of-pocket fees.',
    subhead: 'Deposit into audited Base lending vaults. Automated monthly sweeps fund your $15.99/mo Disney+ plan with zero principal risk.',
    metaDesc: 'Perpetual Disney+ streaming funded by DeFi yields on Base. Keep 100% of your deposit safe.'
  },
  {
    slug: 'max',
    name: 'Max (HBO)',
    category: 'Media Streaming',
    baseMonthlyUsd: 16.99,
    taxBufferMonthlyUsd: 20.39,
    taxBufferDeltaUsd: 3.40,
    iconDomain: 'max.com',
    headline: 'Stream Max (HBO) indefinitely on autopilot.',
    subhead: 'Put idle stablecoins to work in curated Base vaults. Monthly yield pays your $16.99 Max subscription while principal remains 100% yours.',
    metaDesc: 'Self-paying Max (HBO) subscription funded by Base DeFi rates. Stream premium television without monthly bank charges.'
  },
  {
    slug: 'hulu',
    name: 'Hulu',
    category: 'Media Streaming',
    baseMonthlyUsd: 18.99,
    taxBufferMonthlyUsd: 22.79,
    taxBufferDeltaUsd: 3.80,
    iconDomain: 'hulu.com',
    headline: 'Fund your monthly Hulu subscription with Base yields.',
    subhead: 'Deposit into curated lending protocols. Realized yield settles your $18.99/mo Hulu plan continuously with non-custodial protection.',
    metaDesc: 'Never pay out-of-pocket for Hulu again. Let automated Base DeFi yield cover your entertainment expenses.'
  },
  {
    slug: 'appletv',
    name: 'Apple TV+',
    category: 'Media Streaming',
    baseMonthlyUsd: 12.99,
    taxBufferMonthlyUsd: 15.59,
    taxBufferDeltaUsd: 2.60,
    iconDomain: 'apple.com',
    headline: 'Perpetual Apple TV+ streaming with self-paying crypto.',
    subhead: 'Deposit once into audited Base vaults. Monthly yields pay your $12.99 Apple TV+ subscription while your assets stay self-custodial.',
    metaDesc: 'Enjoy Apple TV+ streaming funded forever by Base yield. Principal stays 100% yours.'
  },
  {
    slug: 'gamepass',
    name: 'Xbox Game Pass Ultimate',
    category: 'Gaming',
    baseMonthlyUsd: 19.99,
    taxBufferMonthlyUsd: 24.00,
    taxBufferDeltaUsd: 4.01,
    iconDomain: 'xbox.com',
    headline: 'Play Xbox Game Pass forever on DeFi autopilot.',
    subhead: 'Deposit once on Base. Realized yield pays your $19.99/mo Game Pass Ultimate bill perpetually with complete deposit safety.',
    metaDesc: 'Free Xbox Game Pass Ultimate powered by Base DeFi lending vaults. Never pay a monthly gaming bill again.'
  },
  {
    slug: 'paramount',
    name: 'Paramount+',
    category: 'Media Streaming',
    baseMonthlyUsd: 9.99,
    taxBufferMonthlyUsd: 11.99,
    taxBufferDeltaUsd: 2.00,
    iconDomain: 'paramountplus.com',
    headline: 'Paramount+ streaming covered forever by yield.',
    subhead: 'Lock capital into curated Base vaults. Automated yield covers your $9.99 Paramount+ subscription without touching principal.',
    metaDesc: 'Self-paying Paramount+ subscription funded by Base yields. Keep your crypto, get unlimited streaming.'
  },
  {
    slug: 'peacock',
    name: 'Peacock Premium',
    category: 'Media Streaming',
    baseMonthlyUsd: 10.99,
    taxBufferMonthlyUsd: 13.19,
    taxBufferDeltaUsd: 2.20,
    iconDomain: 'peacocktv.com',
    headline: 'Enjoy Peacock Premium paid perpetually from yield.',
    subhead: 'Deposit into audited Base lending vaults. Monthly yield pays your $10.99 Peacock invoice while you retain 100% liquidity.',
    metaDesc: 'Lifetime Peacock Premium funding with Base DeFi yield. Non-custodial, principal-protected subscription billing.'
  },
  {
    slug: 'doordash',
    name: 'DoorDash DashPass',
    category: 'Lifestyle & Food',
    baseMonthlyUsd: 9.99,
    taxBufferMonthlyUsd: 11.99,
    taxBufferDeltaUsd: 2.00,
    iconDomain: 'doordash.com',
    headline: 'Free DoorDash DashPass funded by crypto yield.',
    subhead: 'Deposit once on Base. Automated monthly sweeps settle your $9.99/mo DashPass membership with complete principal safety.',
    metaDesc: 'Get zero delivery fees with DoorDash DashPass funded by Base DeFi yield. Keep your capital 100% yours.'
  },
  {
    slug: 'uber',
    name: 'Uber One',
    category: 'Lifestyle & Mobility',
    baseMonthlyUsd: 9.99,
    taxBufferMonthlyUsd: 11.99,
    taxBufferDeltaUsd: 2.00,
    iconDomain: 'uber.com',
    headline: 'Ride and order with Uber One funded on autopilot.',
    subhead: 'Deposit into curated Base vaults. Monthly yield pays your $9.99 Uber One membership while your principal stays 100% yours.',
    metaDesc: 'Perpetual Uber One membership funding via Base DeFi yield. Save on rides and meals with self-paying crypto.'
  },
  {
    slug: 'audible',
    name: 'Audible Premium Plus',
    category: 'Audiobooks & Media',
    baseMonthlyUsd: 14.95,
    taxBufferMonthlyUsd: 17.94,
    taxBufferDeltaUsd: 2.99,
    iconDomain: 'audible.com',
    headline: 'Listen to Audible Premium Plus forever on yield.',
    subhead: 'Lock capital in audited Base lending vaults. Realized yield settles your $14.95/mo Audible subscription with full liquidity.',
    metaDesc: 'Free monthly audiobooks with Audible Premium Plus funded by Base DeFi yield. Keep 100% of your deposit.'
  },
  {
    slug: 'walmart',
    name: 'Walmart+',
    category: 'Shopping & Delivery',
    baseMonthlyUsd: 12.95,
    taxBufferMonthlyUsd: 15.54,
    taxBufferDeltaUsd: 2.59,
    iconDomain: 'walmart.com',
    headline: 'Free Walmart+ delivery and fuel discounts from yield.',
    subhead: 'Deposit once on Base. Realized yield pays your $12.95/mo Walmart+ membership while your principal stays 100% untouched.',
    metaDesc: 'Self-paying Walmart+ membership powered by Base DeFi yield. Enjoy free grocery delivery and gas discounts.'
  },
  {
    slug: 'phonebill',
    name: 'Mobile Phone Bill',
    category: 'Everyday Utility Bills',
    baseMonthlyUsd: 70.00,
    taxBufferMonthlyUsd: 84.00,
    taxBufferDeltaUsd: 14.00,
    iconDomain: 'verizon.com',
    headline: 'Never pay your cell phone bill out-of-pocket again.',
    subhead: 'Deposit into curated Base lending vaults. Monthly realized yield pays your $70/mo phone bill on autopilot with zero capital loss.',
    metaDesc: 'Eliminate your monthly mobile carrier bill using Base DeFi yield. Keep 100% of your capital safe and liquid.'
  },
  {
    slug: 'rent',
    name: 'Apartment Rent Settlement',
    category: 'Housing & Rent',
    baseMonthlyUsd: 1800.00,
    taxBufferMonthlyUsd: 2160.00,
    taxBufferDeltaUsd: 360.00,
    iconDomain: 'zillow.com',
    headline: 'Perpetual rent settlement from audited lending vaults.',
    subhead: 'Deposit stable capital into curated Base vaults. Automated yield covers your $1,800/mo rent while your principal remains 100% self-custodial.',
    metaDesc: 'Fund monthly apartment rent with Base DeFi lending yield. Complete principal protection and non-custodial control.'
  },
  {
    slug: 'opencode',
    name: 'OpenCode Go',
    category: 'AI / Developer',
    baseMonthlyUsd: 5.00,
    taxBufferMonthlyUsd: 6.00,
    taxBufferDeltaUsd: 1.00,
    iconDomain: 'opencode.ai',
    headline: 'Eliminate your OpenCode Go bill with idle yield.',
    subhead: 'Deposit once into curated Base lending vaults. Automated yield covers your $5/mo developer subscription on autopilot. Principal is 100% self-custodial.',
    metaDesc: 'Self-paying OpenCode Go subscription powered by Base DeFi yield. 100% principal protected.'
  }
];

function renderServiceIconSvg(slug, width = 16, height = 16) {
  const domainMap = {
    claude: 'claude.ai',
    cursor: 'cursor.com',
    chatgpt: 'openai.com',
    spotify: 'spotify.com',
    netflix: 'netflix.com',
    aws: 'amazon.com',
    github: 'github.com',
    youtube: 'youtube.com',
    amazonprime: 'amazon.com',
    opencode: 'opencode.ai',
    hulu: 'hulu.com',
    appletv: 'apple.com',
    gamepass: 'xbox.com',
    paramount: 'paramountplus.com',
    peacock: 'peacocktv.com',
    doordash: 'doordash.com',
    uber: 'uber.com',
    audible: 'audible.com',
    walmart: 'walmart.com',
    phonebill: 'verizon.com',
    rent: 'zillow.com'
  };
  const domain = domainMap[slug] || slug;
  return `<img class="service-brand-icon service-brand-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=64" alt="${slug}" width="${width}" height="${height}" style="width:${width}px; height:${height}px; border-radius:2px; object-fit:contain; display:inline-block; vertical-align:middle; flex-shrink:0;" loading="lazy" />`;
}

function renderMailIconSvg() {
  return `<svg class="input-mail-icon" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="16" height="12" rx="0" />
    <path d="M2 6l8 5 8-5" />
  </svg>`;
}

function renderEmvChipSvg() {
  return `<div class="visa-gold-chip visa-gold-chip-svg" aria-hidden="true" role="img"></div>`;
}

function renderNfcIconSvg() {
  return `<svg class="visa-nfc-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
    <path d="M7 16a5.5 5.5 0 0 1 0-8" />
    <path d="M11 18.5a9 9 0 0 1 0-13" />
    <path d="M15 21a12.5 12.5 0 0 1 0-18" />
    <path d="M3 13.5a2 2 0 0 1 0-3" />
  </svg>`;
}

function renderVisaLogoSvg() {
  return `<svg class="visa-logo-svg" viewBox="0 0 780 250" width="54" height="18" fill="#ffffff" aria-label="VISA" role="img">
    <path d="M292.5 6.6L193.3 243.4H128L78 57.6C75 45.8 72.4 41.5 62.9 36.3C47.4 27.9 22.2 20.3 0 15.3L3.8 6.6H107.5C121.3 6.6 133.7 15.8 136.8 31.8L163 171.1L228.3 6.6H292.5ZM548.8 167.3C549.4 104.3 461.9 100.8 462.8 72.8C463.2 64.3 471.3 55.2 489.6 52.8C498.7 51.6 523.8 50.6 552.1 63.8L563.3 11.7C548 6.2 528.2 0.8 502.9 0.8C442.2 0.8 399.1 33.1 398.6 79.1C397.7 113.3 428.3 132.3 451.6 143.7C475.6 155.3 483.6 162.8 483.4 173.3C483.1 189.4 463.8 196.4 446 196.7C415 197.2 396.9 188.4 382.4 181.7L370.8 235.8C385.7 242.7 413.2 248.6 441.7 248.9C506 248.9 548.2 217.2 548.8 167.3ZM712.3 243.4H768.8L719.6 6.6H668.1C656.3 6.6 646.6 13.4 642.3 23.8L548.8 243.4H614.3L627.3 207.3H707.4L712.3 243.4ZM645.4 157.6L678.8 65.6L698.1 157.6H645.4ZM387.9 6.6L336.2 243.4H274.6L326.3 6.6H387.9Z" />
  </svg>`;
}

function renderLockIconSvg() {
  return `<svg class="card-lock-icon" viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">
    <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-.5V4.5A3.5 3.5 0 0 0 8 1zm2 5H6V4.5a2 2 0 1 1 4 0V6z" />
  </svg>`;
}

function renderLeafMarkSvg() {
  return `<svg class="landing-leaf-mark" viewBox="0 0 32 32" width="24" height="24" preserveAspectRatio="xMidYMid meet" fill="none" aria-hidden="true">
    <path d="M26.7 4.8C16.2 5.2 8.2 10.7 7.1 20.4c-.3 2.8.7 5.2 2.4 6.8 1.6-8.5 6.5-14.6 14.1-18.2-4.5 3.9-7.6 8.7-9 14.6 3.1-3.9 7-6.8 11.7-8.8.8-2.8.9-6 .4-10Z" fill="currentColor" />
    <path d="M8.8 27.2c3.2-5.1 7.2-8.9 12.2-11.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>`;
}

function renderArrowIconSvg() {
  return `<svg class="landing-arrow-icon" viewBox="0 0 20 20" width="18" height="18" preserveAspectRatio="xMidYMid meet" fill="none" aria-hidden="true">
    <path d="M4 10h11M11 5l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

function renderShieldCheckIconSvg() {
  return `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M10 18s6-3 6-7.5V4.5L10 2 4 4.5v6c0 4.5 6 7.5 6 7.5z" />
    <path d="m7.5 10 2 2 3.5-3.5" />
  </svg>`;
}

function renderTwitterIconSvg(width = 14, height = 14) {
  return `<svg class="x-twitter-icon" viewBox="0 0 24 24" width="${width}" height="${height}" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>`;
}

function renderTelegramIconSvg(width = 15, height = 15) {
  return `<svg class="telegram-svg-icon" viewBox="0 0 24 24" width="${width}" height="${height}" fill="currentColor" aria-hidden="true">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>`;
}
function getBenefitEyebrow(sub) {
  const categoryMap = {
    'AI / Developer': 'Slash your AI bill with yield',
    'Cloud Compute': 'Eliminate cloud burn with yield',
    'Media Streaming': 'Slash your streaming bill with yield',
    'Shopping & Media': 'Slash your subscription bill',
    'Gaming': 'Slash your gaming bill with yield',
    'Lifestyle & Food': 'Slash delivery fees with yield',
    'Lifestyle & Mobility': 'Slash ride & food bill with yield',
    'Everyday Utility Bills': 'Eliminate phone bill with yield',
    'Housing & Rent': 'Zero-out rent with yield'
  };
  return categoryMap[sub.category] || 'Slash your subscription bill with yield';
}

function generateHtml(sub) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Pay for ${sub.name} with Base Yield | DeFi Garden v2</title>
  <meta name="description" content="${sub.metaDesc}">
  <meta name="keywords" content="${sub.name}, self paying subscription, Base yield, USDC, Morpho Blue, DeFi Garden, yield card, x402">
  <link rel="canonical" href="https://www.defi.garden/for/${sub.slug}">

  <!-- OpenGraph / Social Cards -->
  <meta property="og:type" content="product">
  <meta property="og:url" content="https://www.defi.garden/for/${sub.slug}">
  <meta property="og:title" content="${sub.name} on Autopilot | DeFi Garden">
  <meta property="og:description" content="${sub.subhead}">
  <meta property="og:image" content="https://www.defi.garden/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${sub.headline}">
  <meta name="twitter:description" content="${sub.subhead}">
  <meta name="twitter:image" content="https://www.defi.garden/og-image.png">

  <!-- Brand Quiet Design System -->
  <link rel="stylesheet" href="/style.css">
  <link rel="stylesheet" href="/landing-styles.css">
  <link rel="stylesheet" href="/pool-detail-styles.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
  <script src="/laso-service.js"></script>

  <!-- AEO / GEO Structured Data (JSON-LD) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": "https://www.defi.garden/for/${sub.slug}#product",
        "name": "${sub.name} Perpetual Yield Vault",
        "description": "${sub.metaDesc}",
        "category": "${sub.category}",
        "offers": {
          "@type": "Offer",
          "price": "${sub.baseMonthlyUsd.toFixed(2)}",
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "url": "https://www.defi.garden/for/${sub.slug}"
        }
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://www.defi.garden/for/${sub.slug}#app",
        "name": "DeFi Garden ${sub.name} Intent Portal",
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "All",
        "url": "https://www.defi.garden/for/${sub.slug}"
      }
    ]
  }
  </script>

  <style>
    *, *::before, *::after {
      border-radius: 0 !important;
      box-sizing: border-box;
    }
    .store-checkout-card, .checkout-receipt, .checkout-pay-btn, .checkout-security-tag, .receipt-amount-toggle, .amount-btn, .checkout-error-banner, .error-retry-btn {
      border-radius: 0 !important;
    }
    body, .landing-app {
      overflow-x: hidden;
      width: 100%;
      max-width: 100%;
      background-image: radial-gradient(1100px 500px at 50% -80px, rgba(124, 201, 160, 0.07), transparent 65%);
      background-repeat: no-repeat;
    }
    .portal-shell {
      max-width: 1040px;
      margin: 0 auto;
      padding: 32px 24px 60px;
      box-sizing: border-box;
      position: relative;
      z-index: 1;
      width: 100%;
      flex: 1;
      overflow-x: hidden;
    }
    .hero-section {
      text-align: center;
      margin-bottom: 32px;
    }
    .badge-intent-portal {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: var(--ui-surface);
      border: 1px solid var(--ui-border-strong);
      color: var(--ui-accent);
      font-family: var(--font-family-mono, monospace);
      font-size: clamp(0.66rem, 2.5vw, 0.74rem);
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 16px;
      white-space: nowrap;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hero-headline {
      font-family: var(--font-family-display, 'Besley', Georgia, serif);
      font-size: clamp(1.85rem, 5.5vw, 2.65rem);
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1.15;
      margin: 0 0 14px;
      color: var(--ui-text);
      word-break: break-word;
    }
    .hero-subhead {
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: clamp(0.92rem, 2.5vw, 1.05rem);
      color: var(--ui-text-secondary);
      max-width: 640px;
      margin: 0 auto;
      line-height: 1.6;
    }
    .portal-grid {
      display: grid;
      grid-template-columns: 1.05fr 0.95fr;
      grid-template-areas: "hero buybox";
      gap: 28px;
      margin-bottom: 40px;
      align-items: stretch;
      width: 100%;
      box-sizing: border-box;
    }
    .card-hero-cell {
      grid-area: hero;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      perspective: 1200px;
    }
    .store-checkout-card {
      grid-area: buybox;
    }
    .panel-badge {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.68rem;
      font-weight: 600;
      padding: 3px 8px;
      background: var(--ui-surface-muted);
      border: 1px solid var(--ui-border-strong);
      color: var(--ui-text-secondary);
      letter-spacing: 0.06em;
    }
    .virtual-visa-card {
      width: 100%;
      max-width: 440px;
      aspect-ratio: 1.586 / 1;
      padding: 22px 24px;
      background:
        repeating-linear-gradient(105deg, rgba(255, 255, 255, 0.024) 0px, rgba(255, 255, 255, 0.024) 1px, transparent 1px, transparent 3px),
        repeating-linear-gradient(15deg, rgba(255, 255, 255, 0.012) 0px, rgba(255, 255, 255, 0.012) 1px, transparent 1px, transparent 4px),
        radial-gradient(circle at 18% 18%, rgba(124, 201, 160, 0.12) 0%, transparent 45%),
        linear-gradient(138deg, #0B1511 0%, #13251B 38%, #0A140F 70%, #12241A 100%);
      border: 1px solid rgba(255, 255, 255, 0.18);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.32),
        inset 1px 0 0 rgba(255, 255, 255, 0.14),
        inset 0 -1px 0 rgba(0, 0, 0, 0.65),
        inset -1px 0 0 rgba(0, 0, 0, 0.45),
        0 24px 50px -14px rgba(0, 0, 0, 0.7);
      color: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      user-select: none;
      margin: 0 auto;
      cursor: default;
      transform-style: preserve-3d;
      transition: transform 0.18s ease-out;
      will-change: transform;
      border-radius: 0 !important;
    }
    .virtual-visa-card::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(115deg, transparent 28%, rgba(255,255,255,0.12) 42%, rgba(255,255,255,0.26) 48%, rgba(255,255,255,0.06) 54%, transparent 72%);
      background-size: 260% 100%;
      background-position: var(--sheen-x, 50% 0);
      z-index: 5;
      animation: card-sheen-sweep 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .virtual-visa-card:hover::after {
      background-position: var(--sheen-x, 50% 0);
    }
    @keyframes card-sheen-sweep {
      0% {
        background-position: 230% 0;
      }
      100% {
        background-position: var(--sheen-x, 50% 0);
      }
    }
    .visa-gold-chip {
      width: 44px;
      height: 33px;
      background: linear-gradient(135deg, #c7a462 0%, #ebd8a7 35%, #b4914c 70%, #d8be82 100%);
      border: 1px solid rgba(40, 30, 15, 0.5);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.55),
        inset 0 -1px 0 rgba(0, 0, 0, 0.35),
        0 1px 4px rgba(0, 0, 0, 0.5);
      position: relative;
      flex-shrink: 0;
      box-sizing: border-box;
      border-radius: 0 !important;
    }
    .visa-gold-chip::before {
      content: '';
      position: absolute;
      top: 10px;
      left: 0;
      right: 0;
      height: 1px;
      background: rgba(45, 32, 16, 0.55);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
      pointer-events: none;
    }
    .visa-gold-chip::after {
      content: '';
      position: absolute;
      top: 21px;
      left: 0;
      right: 0;
      height: 1px;
      background: rgba(45, 32, 16, 0.55);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
      pointer-events: none;
    }
    .visa-card-hologram {
      width: 28px;
      height: 28px;
      background:
        radial-gradient(circle at center, rgba(255, 255, 255, 0.4) 0%, transparent 60%),
        conic-gradient(from 180deg at 50% 50%, #4E9A70, #93D6B2, #68B28B, #D4AF37, #7CC9A0, #A8E0C0, #4E9A70);
      opacity: 0.82;
      border: 1px solid rgba(255, 255, 255, 0.32);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 1px 4px rgba(0, 0, 0, 0.45);
      flex-shrink: 0;
      border-radius: 0 !important;
    }
    .visa-card-meta-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .visa-card-tier-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .visa-card-metal-badge {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.50rem;
      font-weight: 800;
      letter-spacing: 0.16em;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.08));
      border: 1px solid rgba(255, 255, 255, 0.28);
      color: #e6fffa;
      padding: 1px 5px;
      border-radius: 0 !important;
      text-shadow: 0 0 6px rgba(124, 201, 160, 0.5);
    }
    .checkout-pay-btn {
      transition: background 0.15s ease-out, border-color 0.15s ease-out, transform 0.15s ease-out, box-shadow 0.15s ease-out;
    }
    .checkout-pay-btn:hover {
      box-shadow: 0 6px 20px -6px rgba(124, 201, 160, 0.45);
    }
    .checkout-in-progress-flow {
      display: flex;
      flex-direction: column;
      animation: fadeIn 0.2s ease-out;
    }
    .in-progress-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 5px 10px;
      background: rgba(52, 211, 153, 0.12);
      border: 1px solid rgba(52, 211, 153, 0.35);
      color: #34d399;
      font-family: var(--font-family-mono, monospace);
      font-size: 0.70rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      margin-bottom: 14px;
      align-self: flex-start;
      border-radius: 0 !important;
    }
    .status-pulse-dot {
      width: 7px;
      height: 7px;
      background: #34d399;
      box-shadow: 0 0 8px #34d399;
      border-radius: 0 !important;
      animation: status-dot-pulse 1.8s infinite;
    }
    @keyframes status-dot-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    .in-progress-title {
      font-family: var(--font-family-display, serif);
      font-size: 1.20rem;
      font-weight: 700;
      color: var(--ui-text);
      margin: 0 0 6px;
      line-height: 1.3;
    }
    .in-progress-sub {
      font-size: 0.84rem;
      color: var(--ui-text-secondary);
      margin: 0 0 16px;
      line-height: 1.5;
    }
    .partner-perks-checklist {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 18px;
      background: var(--ui-surface-muted);
      border: 1px solid var(--ui-border);
      padding: 14px 16px;
      border-radius: 0 !important;
    }
    .perk-check-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .perk-check-icon {
      font-weight: 800;
      color: #34d399;
      font-size: 0.92rem;
      line-height: 1.3;
      flex-shrink: 0;
    }
    .perk-check-text strong {
      display: block;
      font-size: 0.82rem;
      color: var(--ui-text);
      font-weight: 600;
      line-height: 1.3;
    }
    .perk-check-text p {
      margin: 2px 0 0;
      font-size: 0.74rem;
      color: var(--ui-text-secondary);
      line-height: 1.4;
    }
    .in-progress-resume-btn {
      width: 100%;
      text-align: center;
      margin-top: 4px;
    }
    .in-progress-secondary-row {
      display: flex;
      justify-content: center;
      margin-top: 10px;
    }
    .checkout-pending-banner {
      border-radius: 0 !important;
      margin-top: 16px;
      background: rgba(124, 201, 160, 0.06);
      border: 1px solid rgba(124, 201, 160, 0.28);
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
    }
    .pending-pulse-row {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .pending-dot {
      width: 8px;
      height: 8px;
      background: var(--ui-accent, #7CC9A0);
      flex-shrink: 0;
      animation: pending-pulse 1.6s ease-in-out infinite;
    }
    @keyframes pending-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.25; }
    }
    @media (prefers-reduced-motion: reduce) {
      .pending-dot { animation: none; }
    }
    .pending-title {
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.90rem;
      font-weight: 700;
      color: var(--ui-text, #FFFFFF);
    }
    .pending-desc {
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.80rem;
      line-height: 1.55;
      color: var(--ui-text-secondary, rgba(255,255,255,0.68));
      margin: 0;
    }
    .pending-meta {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.70rem;
      color: var(--ui-text-muted, #64748B);
      word-break: break-all;
    }
    .pending-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pending-check-btn {
      height: 38px;
      padding: 0 16px;
      background: var(--ui-accent, #7CC9A0);
      color: #08140f;
      border: 1px solid var(--ui-accent, #7CC9A0);
      border-radius: 0 !important;
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s ease-out;
    }
    .pending-check-btn:hover:not(:disabled) {
      background: var(--ui-accent-hover, #93D6B2);
    }
    .pending-check-btn:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .pending-status {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.72rem;
      color: var(--ui-text-secondary, rgba(255,255,255,0.6));
    }
    .metric-label {
      color: var(--ui-text-secondary);
      flex-shrink: 1;
      min-width: 0;
    }
    .metric-value {
      font-family: var(--font-family-mono, monospace);
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      color: var(--ui-text);
      flex-shrink: 0;
      white-space: nowrap;
      text-align: right;
    }
    .visa-card-pan {
      font-family: var(--font-family-mono, monospace);
      font-size: 1.05rem;
      letter-spacing: 0.22em;
      color: #DDE8E0;
      font-weight: 600;
      margin-bottom: 5px;
      text-shadow: 0 1px 0 rgba(0,0,0,0.7), 0 -1px 1px rgba(255,255,255,0.14);
    }
    .visa-card-label-sub {
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.62rem;
      letter-spacing: 0.14em;
      color: rgba(255, 255, 255, 0.68);
      text-transform: uppercase;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .visa-card-funded-label {
      font-family: var(--font-family-mono, monospace);
      font-size: 1.12rem;
      font-weight: 700;
      color: #DDE8E0;
      letter-spacing: 0.04em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-shadow: 0 1px 0 rgba(0,0,0,0.7), 0 -1px 1px rgba(255,255,255,0.14);
    }
    .visa-card-expiry {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.66rem;
      color: rgba(255, 255, 255, 0.7);
      letter-spacing: 0.08em;
      font-weight: 600;
    }
    .visa-card-network-info {
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.74rem;
      color: rgba(255, 255, 255, 0.9);
      letter-spacing: 0.03em;
      font-weight: 550;
    }
    .visa-card-cap-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-family-mono, monospace);
      font-size: 0.72rem;
      font-weight: 700;
      background: rgba(0, 0, 0, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.24);
      padding: 4px 10px;
      color: #34d399;
      white-space: nowrap;
    }
    .metric-table {
      display: flex;
      flex-direction: column;
      margin-top: 0;
      margin-bottom: 24px;
      border-top: none;
    }
    .metric-row-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 11px 0;
      border-bottom: 1px solid var(--ui-border);
      font-size: 0.88rem;
    }
    .metric-label {
      color: var(--ui-text-secondary);
    }
    .metric-value {
      font-family: var(--font-family-mono, monospace);
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      color: var(--ui-text);
    }
    .metric-value.highlight {
      color: var(--ui-accent);
      font-weight: 700;
    }
    .reserve-submit-btn,
    .portal-cta-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      height: 48px;
      min-height: 48px;
      padding: 0 20px;
      background: var(--ui-accent, #7CC9A0) !important;
      color: #08140f !important;
      border: 1px solid var(--ui-accent, #7CC9A0) !important;
      border-radius: 0 !important;
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-weight: 700 !important;
      font-size: 0.94rem;
      text-decoration: none;
      box-sizing: border-box;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
    }
    .reserve-submit-btn:hover,
    .portal-cta-button:hover {
      background: var(--ui-accent-hover, #93D6B2) !important;
      color: #08140f !important;
      border-color: var(--ui-accent-hover, #93D6B2) !important;
      transform: translateY(-1px);
    }
    .reserve-submit-btn:active,
    .portal-cta-button:active {
      background: var(--ui-accent-active, #66B78D) !important;
      color: #08140f !important;
      transform: translateY(1px);
    }
    .yield-card-reservation,
    .yield-card-receipt {
      width: 100%;
      background: var(--ui-surface-muted, #16211A);
      border: 1px solid var(--ui-border, rgba(255,255,255,0.12));
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      box-sizing: border-box;
      margin-top: 18px;
    }
    .reservation-title {
      font-family: var(--font-family-display, 'Besley', Georgia, serif);
      font-size: 1.22rem;
      font-weight: 700;
      color: var(--ui-text, #FFFFFF);
      margin: 0 0 4px;
      letter-spacing: -0.01em;
      line-height: 1.25;
      text-align: center;
    }
    .reservation-subtitle {
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.82rem;
      color: var(--ui-text-secondary, #94A3B8);
      margin: 0 0 14px;
      line-height: 1.45;
      text-align: center;
    }
    .reservation-form {
      width: 100%;
      margin-bottom: 2px;
    }
    .reservation-input-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }
    .input-with-icon {
      position: relative;
      width: 100%;
      display: flex;
      align-items: center;
    }
    .input-mail-icon {
      position: absolute;
      left: 12px;
      color: var(--ui-text-muted, #64748B);
      pointer-events: none;
    }
    .email-input {
      width: 100%;
      height: 46px;
      box-sizing: border-box;
      padding: 0 12px 0 38px;
      border: 1px solid var(--ui-border-strong, rgba(255,255,255,0.2));
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.90rem;
      background: var(--ui-surface, #0E1611);
      color: var(--ui-text, #FFFFFF);
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .email-input:focus {
      border-color: var(--ui-accent, #7CC9A0);
      box-shadow: 0 0 0 2px rgba(124, 201, 160, 0.25);
    }
    .reservation-micro-hint {
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.72rem;
      color: var(--ui-text-muted, #64748B);
      margin: 10px 0 0;
      text-align: center;
      line-height: 1.35;
    }
    .validation-error {
      color: #f87171;
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.80rem;
      margin-top: 6px;
      font-weight: 500;
      text-align: left;
    }
    .receipt-badge-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .receipt-spot-badge {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.78rem;
      font-weight: 700;
      background: var(--ui-accent, #7CC9A0);
      color: #08140f;
      padding: 4px 10px;
      letter-spacing: 0.04em;
    }
    .receipt-alpha-pill {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.74rem;
      font-weight: 700;
      background: rgba(124, 201, 160, 0.12);
      color: var(--ui-accent, #7CC9A0);
      border: 1px solid rgba(124, 201, 160, 0.25);
      padding: 4px 10px;
      letter-spacing: 0.02em;
    }
    .receipt-title {
      font-family: var(--font-family-display, 'Besley', Georgia, serif);
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--ui-text, #FFFFFF);
      margin: 0 0 6px;
      line-height: 1.25;
    }
    .receipt-card-preview-chip {
      padding: 6px 14px;
      background: var(--ui-surface, #0E1611);
      border: 1px solid var(--ui-border, rgba(255,255,255,0.12));
      font-family: var(--font-family-mono, monospace);
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--ui-text, #FFFFFF);
      margin: 6px 0 16px;
      max-width: 100%;
      box-sizing: border-box;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .receipt-gamification-box {
      width: 100%;
      background: var(--ui-surface, #0E1611);
      border: 1px solid var(--ui-border, rgba(255,255,255,0.12));
      border-radius: 0 !important;
      padding: 14px 16px;
      margin-bottom: 16px;
      text-align: left;
      box-sizing: border-box;
      transition: all 0.2s ease;
    }
    .receipt-gamification-box.is-unlocked {
      border-color: var(--ui-accent, #7CC9A0);
      background: rgba(124, 201, 160, 0.08);
    }
    .gamification-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .gamification-label {
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--ui-text, #FFFFFF);
    }
    .gamification-status {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--ui-accent, #7CC9A0);
    }
    .gamification-progress-bar {
      width: 100%;
      height: 6px;
      background: var(--ui-surface-muted, #16211A);
      border: 1px solid var(--ui-border, rgba(255,255,255,0.12));
      border-radius: 0 !important;
      margin-bottom: 8px;
      overflow: hidden;
    }
    .gamification-progress-fill {
      height: 100%;
      background: var(--ui-accent, #7CC9A0);
      transition: width 0.3s ease;
    }
    .gamification-desc {
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.74rem;
      color: var(--ui-text-secondary, #94A3B8);
      margin: 0 0 10px;
      line-height: 1.4;
    }
    .receipt-telegram-cta-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      height: 42px;
      background: var(--ui-accent, #7CC9A0) !important;
      color: #08140f !important;
      border: 1px solid var(--ui-accent, #7CC9A0) !important;
      border-radius: 0 !important;
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.86rem;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s ease;
      box-sizing: border-box;
      margin-top: 6px;
      box-shadow: 0 4px 14px rgba(124, 201, 160, 0.32);
    }
    .receipt-telegram-cta-btn:hover {
      background: var(--ui-accent-hover, #93D6B2) !important;
      color: #08140f !important;
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgba(124, 201, 160, 0.42);
    }
    .receipt-telegram-cta-btn:active {
      transform: translateY(1px);
    }
    .receipt-actions-group {
      display: flex;
      gap: 8px;
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 8px;
    }
    @media (max-width: 480px) {
      .receipt-actions-group {
        flex-direction: column;
      }
    }
    .receipt-twitter-btn {
      flex: 1.2;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 42px;
      padding: 0 14px;
      background: #000000;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0 !important;
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      box-sizing: border-box;
    }
    .receipt-twitter-btn:hover {
      background: var(--ui-accent, #7CC9A0);
      border-color: var(--ui-accent, #7CC9A0);
      color: #08140f;
      transform: translateY(-1px);
    }
    .receipt-twitter-btn:active {
      transform: translateY(1px);
    }
    .receipt-share-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 42px;
      padding: 0 12px;
      border: 1px solid var(--ui-border-strong, rgba(255,255,255,0.2));
      background: var(--ui-surface-muted, #16211A);
      color: var(--ui-text, #FFFFFF);
      border-radius: 0 !important;
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      box-sizing: border-box;
    }
    .receipt-share-btn:hover {
      border-color: var(--ui-accent, #7CC9A0);
      color: var(--ui-accent, #7CC9A0);
      transform: translateY(-1px);
    }
    .receipt-share-btn:active {
      transform: translateY(1px);
    }
    .receipt-verify-link-btn {
      background: none;
      border: none;
      color: var(--ui-text-muted, #64748B);
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.74rem;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;
      margin-top: 6px;
      padding: 4px 8px;
      transition: color 0.15s ease;
      text-align: center;
      display: block;
      width: 100%;
    }
    .receipt-verify-link-btn:hover {
      color: var(--ui-accent, #7CC9A0);
    }
    .checkout-switch-pool-row {
      margin-top: 8px;
      text-align: center;
      width: 100%;
    }
    .switch-pool-link {
      background: none;
      border: none;
      color: var(--ui-text-muted, #64748B);
      font-family: var(--font-family-base, 'Public Sans', system-ui, sans-serif);
      font-size: 0.74rem;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;
      padding: 4px 8px;
      transition: color 0.15s ease;
      text-align: center;
      display: inline-block;
    }
    .switch-pool-link:hover {
      color: var(--ui-accent, #7CC9A0);
    }
    [data-theme="light"] .switch-pool-link {
      color: #6b7280;
    }
    [data-theme="light"] .switch-pool-link:hover {
      color: #2d8a5e;
    }
    .how-it-works-section {
      margin-bottom: 40px;
    }
    .how-it-works-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .trust-accordion {
      background: var(--ui-surface);
      border: 1px solid var(--ui-border);
      border-radius: 0 !important;
      margin-bottom: 0;
    }
    .trust-accordion summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      cursor: pointer;
      list-style: none;
      font-family: var(--font-family-mono, monospace);
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ui-text-secondary);
      background: var(--ui-surface);
      user-select: none;
      border-radius: 0 !important;
      transition: color 0.15s ease-out;
    }
    .trust-accordion summary:hover {
      color: var(--ui-accent);
    }
    .trust-accordion summary::-webkit-details-marker {
      display: none;
    }
    .trust-accordion summary::after {
      content: '▾';
      font-family: var(--font-family-mono, monospace);
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--ui-accent);
      transition: transform 0.18s ease-out;
    }
    .trust-accordion[open] summary::after {
      transform: rotate(180deg);
    }
    .trust-accordion[open] summary {
      border-bottom: 1px solid var(--ui-border);
    }
    .trust-accordion-body {
      padding: 24px 26px;
    }
    [data-theme="light"] .trust-accordion summary:hover {
      color: #2d8a5e;
    }
    [data-theme="light"] .trust-accordion summary::after {
      color: #2d8a5e;
    }
    .step-card {
      background: var(--ui-surface-muted);
      border: 1px solid var(--ui-border);
      padding: 16px 18px;
      display: flex;
      gap: 16px;
      align-items: flex-start;
      transition: transform 0.18s ease-out, border-color 0.18s ease-out;
    }
    .step-card:hover {
      transform: translateY(-2px);
      border-color: var(--ui-border-strong);
    }
    .step-num {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.80rem;
      font-weight: 700;
      padding: 4px 9px;
      background: var(--ui-surface);
      border: 1px solid var(--ui-border-strong);
      color: var(--ui-accent);
      flex-shrink: 0;
    }
    .step-content strong {
      display: block;
      color: var(--ui-text);
      font-size: 0.94rem;
      margin-bottom: 6px;
    }
    .step-content p {
      margin: 0;
      font-size: 0.85rem;
      color: var(--ui-text-secondary);
      line-height: 1.5;
    }
    .trust-guarantee-box {
      margin-top: 20px;
      background: var(--ui-surface-muted);
      border: 1px solid var(--ui-border);
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--ui-text);
      font-size: 0.84rem;
      font-family: var(--font-family-mono, monospace);
    }
    .invariants-panel {
      background: var(--ui-surface);
      border: 1px solid var(--ui-border-strong);
      padding: 26px 28px;
      margin-bottom: 36px;
    }
    .invariants-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--ui-border);
    }
    .invariants-header h3 {
      font-family: var(--font-family-display, 'Besley', Georgia, serif);
      font-size: 1.18rem;
      font-weight: 600;
      color: var(--ui-text);
      margin: 0;
    }
    .invariants-cols {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      margin-bottom: 22px;
    }
    .invariant-item {
      padding-right: 12px;
    }
    .invariant-item:not(:last-child) {
      border-right: 1px solid var(--ui-border);
    }
    .invariant-item strong {
      display: block;
      color: var(--ui-text);
      font-size: 0.90rem;
      margin-bottom: 6px;
    }
    .invariant-item p {
      margin: 0;
      font-size: 0.83rem;
      color: var(--ui-text-secondary);
      line-height: 1.5;
    }
    .invariant-banner {
      background: var(--ui-surface-muted);
      border: 1px solid var(--ui-border);
      padding: 16px 20px;
      font-size: 0.92rem;
      color: var(--ui-text);
      font-style: italic;
      text-align: center;
      font-family: var(--font-family-display, 'Besley', Georgia, serif);
    }

    /* Sticky Mobile Quick-Reserve Bottom Bar - SOTA Luxury Fintech Grade */
    .sticky-reserve-bar {
      display: none;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      padding: 12px 18px calc(12px + env(safe-area-inset-bottom, 0px));
      background: rgba(14, 23, 17, 0.96);
      backdrop-filter: blur(28px);
      -webkit-backdrop-filter: blur(28px);
      border-top: 1px solid var(--ui-border-strong, rgba(255, 255, 255, 0.16));
      box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.75);
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      box-sizing: border-box;
    }
    .sticky-bar-info {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .sticky-bar-icon-box {
      width: 36px;
      height: 36px;
      border-radius: 0 !important;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .sticky-bar-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: 1px;
    }
    .sticky-bar-title {
      font-size: 0.90rem;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.01em;
    }
    .sticky-bar-sub {
      font-family: var(--font-family-mono, monospace);
      font-size: 0.72rem;
      color: var(--ui-accent, #7CC9A0);
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .sticky-bar-btn {
      height: 46px;
      min-height: 46px;
      padding: 0 20px;
      background: var(--ui-accent, #7CC9A0) !important;
      color: #08140f !important;
      border: 1px solid var(--ui-accent, #7CC9A0) !important;
      border-radius: 0 !important;
      font-weight: 700 !important;
      font-size: 0.92rem;
      cursor: pointer;
      flex-shrink: 0;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      box-shadow: 0 4px 14px rgba(124, 201, 160, 0.32);
      transition: background 0.15s ease-out, transform 0.15s ease-out, box-shadow 0.15s ease-out;
    }
    .sticky-bar-btn:hover {
      background: var(--ui-accent-hover, #93D6B2) !important;
      color: #08140f !important;
      transform: translateY(-1px);
      box-shadow: 0 6px 20px -6px rgba(124, 201, 160, 0.45);
    }
    .sticky-bar-btn:active {
      transform: translateY(1px);
    }

    /* Light mode overrides */
    [data-theme="light"] body,
    [data-theme="light"] .landing-app {
      background-image: radial-gradient(1100px 500px at 50% -80px, rgba(18, 38, 27, 0.05), transparent 65%);
      background-repeat: no-repeat;
    }
    [data-theme="light"] .checkout-pay-btn:hover {
      box-shadow: 0 6px 20px -6px rgba(45, 138, 94, 0.45);
    }
    [data-theme="light"] .step-card:hover {
      border-color: rgba(0, 0, 0, 0.25);
    }
    [data-theme="light"] .badge-intent-portal {
      background: rgba(45, 138, 94, 0.08);
      border-color: rgba(45, 138, 94, 0.25);
      color: #2d8a5e;
    }
    [data-theme="light"] .panel-badge {
      background: rgba(0, 0, 0, 0.05);
      border-color: rgba(0, 0, 0, 0.15);
      color: #4b5563;
    }
    [data-theme="light"] .yield-card-reservation,
    [data-theme="light"] .yield-card-receipt {
      background: #ffffff;
      border-color: rgba(0, 0, 0, 0.12);
    }
    [data-theme="light"] .reservation-title {
      color: #111827;
    }
    [data-theme="light"] .reservation-subtitle {
      color: #6b7280;
    }
    [data-theme="light"] .email-input {
      background: #f9fafb;
      color: #111827;
      border-color: rgba(0, 0, 0, 0.18);
    }
    [data-theme="light"] .reserve-submit-btn,
    [data-theme="light"] .portal-cta-button {
      background: #2d8a5e !important;
      color: #ffffff !important;
      border-color: #2d8a5e !important;
    }
    [data-theme="light"] .reserve-submit-btn:hover,
    [data-theme="light"] .portal-cta-button:hover {
      background: #236c49 !important;
      border-color: #236c49 !important;
    }
    [data-theme="light"] .step-card {
      background: #ffffff;
      border-color: rgba(0, 0, 0, 0.12);
    }
    [data-theme="light"] .step-num {
      background: #f3f4f6;
      color: #2d8a5e;
      border-color: rgba(45, 138, 94, 0.3);
    }
    [data-theme="light"] .trust-guarantee-box {
      background: #ffffff;
      border-color: rgba(0, 0, 0, 0.12);
      color: #111827;
    }
    [data-theme="light"] .invariants-panel {
      background: #ffffff;
      border-color: rgba(0, 0, 0, 0.12);
    }
    [data-theme="light"] .invariant-banner {
      background: #f9fafb;
      border-color: rgba(0, 0, 0, 0.1);
      color: #111827;
    }
    [data-theme="light"] .receipt-gamification-box {
      background: #f9fafb;
      border-color: rgba(0, 0, 0, 0.12);
    }
    [data-theme="light"] .receipt-gamification-box.is-unlocked {
      background: rgba(45, 138, 94, 0.08);
      border-color: #2d8a5e;
    }
    [data-theme="light"] .gamification-label {
      color: #111827;
    }
    [data-theme="light"] .gamification-status {
      color: #2d8a5e;
    }
    [data-theme="light"] .gamification-progress-bar {
      background: #e5e7eb;
      border-color: rgba(0, 0, 0, 0.1);
    }
    [data-theme="light"] .gamification-progress-fill {
      background: #2d8a5e;
    }
    [data-theme="light"] .gamification-desc {
      color: #4b5563;
    }
    [data-theme="light"] .receipt-telegram-cta-btn {
      background: #2d8a5e !important;
      color: #ffffff !important;
      border-color: #2d8a5e !important;
      box-shadow: 0 4px 14px rgba(45, 138, 94, 0.32);
    }
    [data-theme="light"] .receipt-telegram-cta-btn:hover {
      background: #236c49 !important;
      border-color: #236c49 !important;
    }
    [data-theme="light"] .receipt-twitter-btn {
      background: #111827;
      color: #ffffff;
      border-color: #111827;
    }
    [data-theme="light"] .receipt-twitter-btn:hover {
      background: #2d8a5e;
      border-color: #2d8a5e;
      color: #ffffff;
    }
    [data-theme="light"] .receipt-share-btn {
      background: #ffffff;
      color: #111827;
      border-color: rgba(0, 0, 0, 0.18);
    }
    [data-theme="light"] .receipt-share-btn:hover {
      border-color: #2d8a5e;
      color: #2d8a5e;
    }
    [data-theme="light"] .receipt-verify-link-btn {
      color: #6b7280;
    }
    [data-theme="light"] .receipt-verify-link-btn:hover {
      color: #2d8a5e;
    }
    [data-theme="light"] .sticky-reserve-bar {
      background: rgba(255, 255, 255, 0.96) !important;
      border-top-color: rgba(0, 0, 0, 0.12) !important;
      box-shadow: 0 -8px 36px rgba(0, 0, 0, 0.12) !important;
    }
    [data-theme="light"] .sticky-bar-icon-box {
      background: rgba(0, 0, 0, 0.04);
      border-color: rgba(0, 0, 0, 0.10);
    }
    [data-theme="light"] .sticky-bar-title {
      color: #111827 !important;
    }
    [data-theme="light"] .sticky-bar-sub {
      color: #15803d !important;
    }
    [data-theme="light"] .sticky-bar-btn {
      background: #2d8a5e !important;
      color: #ffffff !important;
      border-color: #2d8a5e !important;
      box-shadow: 0 4px 14px rgba(45, 138, 94, 0.32);
    }
    [data-theme="light"] .sticky-bar-btn:hover {
      background: #236c49 !important;
      border-color: #236c49 !important;
      box-shadow: 0 6px 20px -6px rgba(45, 138, 94, 0.45);
    }

    @media (prefers-reduced-motion: reduce) {
      .virtual-visa-card,
      .virtual-visa-card::after,
      .checkout-pay-btn,
      .sticky-bar-btn,
      .step-card,
      .trust-accordion summary,
      .trust-accordion summary::after {
        transition: none !important;
        transform: none !important;
        animation: none !important;
      }
      .virtual-visa-card::after {
        background-position: 50% 0 !important;
      }
    }

    /* Mobile Responsive Overrides - SOTA Fluid & Overflow-Free */
    @media (max-width: 860px) {
      .portal-grid {
        grid-template-columns: 1fr;
        grid-template-areas:
          "hero"
          "buybox";
        gap: 20px;
        margin-bottom: 24px;
        width: 100%;
      }
      .portal-shell {
        padding: 16px 14px 130px;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
      }
      .hero-section {
        margin-bottom: 20px;
        text-align: center;
      }
      .card-hero-cell {
        width: 100%;
        max-width: 100%;
        margin: 0 auto;
      }
      .virtual-visa-card {
        width: 100%;
        max-width: 440px;
        padding: 14px 16px;
        margin: 0 auto;
        cursor: default;
      }
      .visa-card-pan {
        font-size: clamp(0.78rem, 3.8vw, 0.94rem);
        letter-spacing: 0.16em;
      }
      .visa-card-label-sub {
        font-size: 0.54rem;
      }
      .visa-card-funded-label {
        font-size: clamp(0.80rem, 4vw, 1.02rem);
      }
      .visa-card-expiry, .visa-card-network-info {
        font-size: 0.60rem;
      }
      .visa-card-cap-badge {
        font-size: 0.62rem;
        padding: 2px 6px;
      }
      .metric-row-item {
        width: 100%;
        box-sizing: border-box;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        gap: 8px;
        font-size: 0.80rem;
      }
      .metric-label {
        font-size: 0.78rem;
        flex: 1;
        min-width: 0;
      }
      .metric-value {
        font-size: 0.78rem !important;
        flex-shrink: 0;
      }
      .yield-card-reservation,
      .yield-card-receipt {
        padding: 16px 14px;
        width: 100%;
        box-sizing: border-box;
      }
      .reservation-title {
        font-size: clamp(1.02rem, 4.2vw, 1.20rem);
        word-break: break-word;
        line-height: 1.25;
      }
      .reservation-subtitle {
        font-size: 0.78rem;
        margin-bottom: 10px;
        line-height: 1.4;
      }
      .reservation-input-group {
        width: 100%;
      }
      .email-input {
        height: 44px;
        font-size: 0.86rem;
        width: 100%;
      }
      .reserve-submit-btn {
        height: 44px;
        font-size: 0.88rem;
        width: 100%;
      }
      .how-it-works-row {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .trust-accordion-body {
        padding: 18px 14px;
      }
      .step-card {
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 10px;
        padding: 14px 12px;
        width: 100%;
        box-sizing: border-box;
      }
      .step-content {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
      }
      .step-content strong {
        font-size: 0.88rem;
      }
      .step-content p {
        font-size: 0.80rem;
      }
      .trust-guarantee-box {
        justify-content: center;
        text-align: center;
        flex-wrap: wrap;
        font-size: 0.74rem;
        padding: 10px 12px;
        width: 100%;
        box-sizing: border-box;
      }
      .invariants-panel {
        padding: 18px 14px;
        width: 100%;
        box-sizing: border-box;
      }
      .invariants-header {
        justify-content: center;
        text-align: center;
      }
      .invariants-header h3 {
        justify-content: center;
        text-align: center;
        font-size: 1.05rem;
      }
      .invariants-cols {
        grid-template-columns: 1fr;
        gap: 14px;
        text-align: center;
      }
      .invariant-item {
        text-align: center;
        padding-right: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .invariant-item:not(:last-child) {
        border-right: none;
        border-bottom: 1px solid var(--ui-border);
        padding-bottom: 14px;
      }
      .landing-app .app-footer {
        padding-bottom: calc(130px + env(safe-area-inset-bottom, 0px)) !important;
      }
      .sticky-reserve-bar {
        display: flex !important;
        transform: translateY(0) !important;
      }
    }

    @media (max-width: 480px) {
      .portal-shell {
        padding: 12px 10px 96px;
      }
      .virtual-visa-card {
        padding: 12px 12px;
      }
      .yield-card-reservation,
      .yield-card-receipt {
        padding: 14px 10px;
      }
    }
  </style>
<body>
  <div class="landing-app">
    <!-- Brand Navigation Header from home.html -->
    <header class="landing-header">
      <a class="landing-brand" href="/" aria-label="DeFi Garden">
        <span class="landing-brand-mark">
          ${renderLeafMarkSvg()}
        </span>
        <span>DeFi Garden</span>
      </a>
      <nav class="landing-nav" aria-label="Primary navigation">
        <a href="/?app=1">Search yields</a>
        <a href="/plan.html">Savings Planner</a>
        <a href="/agents">AI Agents &amp; MCP</a>
      </nav>
      <div class="landing-header-actions">
        <button type="button" class="landing-icon-button" id="lang-toggle-btn" aria-label="Language">KO</button>
        <button type="button" class="landing-icon-button landing-theme-button" id="theme-toggle-btn" aria-label="Theme">☼</button>
        <button type="button" class="landing-menu-button" id="menu-toggle-btn" aria-label="Open menu">☰</button>
      </div>
    </header>

    <!-- Mobile Navigation from home.html -->
    <nav class="landing-mobile-nav" id="mobile-nav" aria-label="Mobile navigation">
      <a href="/?app=1">Search yields</a>
      <a href="/plan.html">Savings Planner</a>
      <a href="/agents">AI Agents &amp; MCP</a>
    </nav>

    <div class="portal-shell">

      <!-- Hero Section -->
      <section class="hero-section">
        <div class="badge-intent-portal badge-intent">
          ${renderServiceIconSvg(sub.slug, 16, 16)}
          <span>${getBenefitEyebrow(sub)}</span>
        </div>
        <h1 class="hero-headline hero-title">${sub.headline}</h1>
        <p class="hero-subhead hero-body">${sub.subhead}</p>
      </section>

      <!-- Interactive Two-Column Simulator Grid -->
      <div class="portal-grid sim-grid">
        <!-- Hero: Virtual Visa Card Mockup -->
        <div class="card-hero-cell">
          <div class="virtual-visa-card virtual-card-preview" id="visa-card">
          <!-- Card Top Row: EMV Chip + NFC & Visa Logo + Debit -->
          <div class="visa-card-top-row">
            <div class="visa-card-chip-group">
              ${renderEmvChipSvg()}
              ${renderNfcIconSvg()}
            </div>
            <div class="visa-card-brand-group">
              ${renderVisaLogoSvg()}
              <div class="visa-card-tier-row">
                <span class="visa-card-type-badge">DEBIT</span>
                <span class="visa-card-metal-badge">METAL</span>
              </div>
            </div>
          </div>
          <!-- Card Center: PAN & Dedicated Sub -->
          <div class="visa-card-center">
            <div class="visa-card-pan">•••• •••• •••• 8453</div>
            <div class="visa-card-funded-label">${sub.name.toUpperCase()}</div>
          </div>

          <!-- Card Bottom Row: Expiry & Spend Cap Badge -->
          <div class="visa-card-bottom-row">
            <div class="visa-card-meta-left">
              <span class="visa-card-expiry">VALID 08/31</span>
              <span class="visa-card-network-info">YIELD-FUNDED · BASE</span>
            </div>
            <div class="visa-card-meta-right">
              <div class="visa-card-hologram" aria-hidden="true"></div>
              <div class="visa-card-cap-badge">
                ${renderLockIconSvg()}
                <span>🟢 ACTIVE ($${sub.taxBufferMonthlyUsd.toFixed(2)}/MO)</span>
              </div>
            </div>
          </div>
          </div>
        </div>

        <!-- Buy Box: SOTA Store Checkout Card -->
        <div class="store-checkout-card" id="conversion-card">
          <!-- Header / Product Badge -->
          <div class="checkout-header">
            <div class="checkout-item-title-row">
              <span class="checkout-badge">Virtual Card Rail</span>
              <span class="checkout-security-tag">Visa Debit</span>
            </div>
            <h3 class="checkout-product-title">${sub.name} Yield Card</h3>
            <p class="checkout-product-desc">Perpetual subscription card funded directly from Base USDC yield.</p>
          </div>

          <!-- VIEW A: Direct Store Checkout Flow -->
          <div class="checkout-flow" id="panel-instant-card">
            <!-- Line Items Breakdown (Receipt Style) -->
            <div class="checkout-receipt">
              <div class="receipt-row receipt-row-muted">
                <span class="receipt-label">Issuance &amp; setup fee</span>
                <span class="receipt-value free">Free</span>
              </div>
              <div class="receipt-row receipt-row-muted">
                <span class="receipt-label">Partner referral perks</span>
                <span class="receipt-value free">Applied</span>
              </div>
              <div class="receipt-divider"></div>
              <div class="receipt-total-row">
                <div class="total-label-col">
                  <span class="total-label">Total due now</span>
                  <span class="total-caption">Charged once in USDC</span>
                </div>
                <div class="total-price-col">
                  <span class="total-price-val" id="checkout-total-val">$${sub.taxBufferMonthlyUsd.toFixed(2)}</span>
                  <span class="total-price-currency">USDC</span>
                </div>
              </div>
            </div>

            <!-- Single Primary Checkout CTA (redirects via referral to Laso) -->
            <a href="https://laso.finance?ref=lmretyujvzr9jiutxi4d" target="_blank" rel="noopener noreferrer" class="checkout-pay-btn" id="laso-issue-btn" style="text-decoration:none; display:flex; align-items:center; justify-content:center;">
              Pay $${sub.taxBufferMonthlyUsd.toFixed(2)} USDC on Laso →
            </a>

            <div class="checkout-switch-pool-row">
              <a class="switch-pool-link" href="/?app=1&chain=Popular&minTvl=1000000&sub=${sub.slug}">Want to choose your own vault? Explore &amp; switch pools →</a>
            </div>
          </div>

          <!-- STATE B: Active Referral & Order in Progress Hub -->
          <div class="checkout-in-progress-flow" id="checkout-in-progress-view" style="display:none;">
            <div class="in-progress-status-badge">
              <span class="status-pulse-dot" aria-hidden="true"></span>
              <span>CHECKOUT IN PROGRESS ON LASO</span>
            </div>

            <h4 class="in-progress-title">Your partner perks are active.</h4>
            <p class="in-progress-sub">Complete your quick 30-second setup on Laso to claim your <strong>${sub.name}</strong> Visa debit card.</p>

            <div class="partner-perks-checklist">
              <div class="perk-check-item">
                <span class="perk-check-icon">✓</span>
                <div class="perk-check-text">
                  <strong>Sponsored Setup &amp; Issuance</strong>
                  <p>100% waived via your DeFi Garden partner referral</p>
                </div>
              </div>
              <div class="perk-check-item">
                <span class="perk-check-icon">✓</span>
                <div class="perk-check-text">
                  <strong>Self-Custodial Yield Compounding</strong>
                  <p>Keep your principal intact while idle Base USDC pays the bill</p>
                </div>
              </div>
              <div class="perk-check-item">
                <span class="perk-check-icon">✓</span>
                <div class="perk-check-text">
                  <strong>Worldwide Visa Debit Rail</strong>
                  <p>Spend online + Apple Pay &amp; Google Pay support</p>
                </div>
              </div>
            </div>

            <a href="https://laso.finance?ref=lmretyujvzr9jiutxi4d" target="_blank" rel="noopener noreferrer" class="checkout-pay-btn in-progress-resume-btn" id="laso-resume-btn" style="text-decoration:none; display:flex; align-items:center; justify-content:center;">
              Resume on Laso.finance ↗
            </a>

            <div class="in-progress-secondary-row">
              <button type="button" class="link-btn link-muted" id="laso-restart-btn">← Back to checkout details</button>
            </div>

            <div class="checkout-switch-pool-row" style="margin-top:14px;">
              <a class="switch-pool-link" href="/?app=1&chain=Popular&minTvl=1000000&sub=${sub.slug}">Want to choose your own vault? Explore &amp; switch pools →</a>
            </div>
          </div>
        </div>

      </div>

      <!-- How It Works Section -->
      <section class="how-it-works-section">
        <div style="margin-bottom: 14px;">
          <span class="panel-badge">HOW IT WORKS</span>
        </div>
        <div class="how-it-works-row">
          <div class="step-card">
            <span class="step-num">01</span>
            <div class="step-content">
              <strong>Deposit Preferred Currency on Base</strong>
              <p>Deposit USDC, baseEUR, ETH, or USDT into curated Base lending vaults.</p>
            </div>
          </div>

          <div class="step-card">
            <span class="step-num">02</span>
            <div class="step-content">
              <strong>Automated Monthly Yield Sweeps</strong>
              <p>Autonomous decentralized keepers continuously harvest realized yield ($${sub.taxBufferMonthlyUsd.toFixed(2)}/mo) to settle your ${sub.name} invoice prior to merchant billing.</p>
            </div>
          </div>

          <div class="step-card">
            <span class="step-num">03</span>
            <div class="step-content">
              <strong>100% Principal Protection</strong>
              <p>Your deposit remains self-custodial onchain (&Delta;Principal &equiv; 0).</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Trust & Protocol Invariants Accordion -->
      <details class="trust-accordion">
        <summary>Order details, security &amp; protocol invariants</summary>
        <div class="trust-accordion-body">
          <div class="order-details-header" style="margin-bottom: 12px;">
            <span class="panel-badge">Order details</span>
          </div>
          <div class="metric-table" style="margin-top:0; margin-bottom: 24px; border-top: none;">
            <div class="metric-row-item">
              <span class="metric-label">Monthly Subscription</span>
              <span class="metric-value">$${sub.baseMonthlyUsd.toFixed(2)} USD</span>
            </div>
            <div class="metric-row-item">
              <span class="metric-label">Tax / VAT Buffer (+20%)</span>
              <span class="metric-value">$${sub.taxBufferDeltaUsd.toFixed(2)} USD</span>
            </div>
            <div class="metric-row-item">
              <span class="metric-label">Funding Settlement Rail</span>
              <span class="metric-value highlight">Curated Base Lending Vaults</span>
            </div>
            <div class="metric-row-item">
              <span class="metric-label">Supported Currencies</span>
              <span class="metric-value highlight" style="white-space:normal; text-align:right;">USDC · baseEUR · ETH · USDT</span>
            </div>
            <div class="metric-row-item" style="border-bottom:none;">
              <span class="metric-label" style="font-weight:600; color:var(--ui-text);">Principal Protection</span>
              <span class="metric-value highlight" style="font-weight:700;">100% Self-Custodial (&Delta;P &equiv; 0)</span>
            </div>
          </div>
          <div class="invariants-header">
            <h3 style="display:flex; align-items:center; gap:8px;">${renderShieldCheckIconSvg()} Protocol Invariants &amp; Risk Mitigation</h3>
          </div>
          <div class="invariants-cols">
            <div class="invariant-item">
              <strong>1.25x Over-collateralization</strong>
              <p>1.25x capital buffer absorbs interest rate fluctuations and guarantees uninterrupted card payments.</p>
            </div>
            <div class="invariant-item">
              <strong>1-Month Liquid Escrow</strong>
              <p>Upfront 30-day yield reserve cushions temporary harvest delays and eliminates billing decline risk.</p>
            </div>
            <div class="invariant-item">
              <strong>Self-Custodial Architecture</strong>
              <p>Direct smart contract withdrawal authority remains exclusively with the user at all times.</p>
            </div>
          </div>
          <div class="trust-guarantee-box" style="margin-bottom: 16px;">
            ${renderShieldCheckIconSvg()}
            <span>Protocol Invariant: &Delta; Principal &equiv; 0 (Capital never burns)</span>
          </div>
          <div class="invariant-banner">
            &ldquo;Buy it outright and the money is gone. Garden it and you keep the money AND get the thing.&rdquo;
          </div>
        </div>
      </details>

    </div>

    <!-- Mobile Sticky Quick-Reserve Bar -->
    <div class="sticky-reserve-bar" id="sticky-reserve-bar" aria-hidden="true">
      <div class="sticky-bar-info">
        <div class="sticky-bar-icon-box">
          ${renderServiceIconSvg(sub.slug, 20, 20)}
        </div>
        <div class="sticky-bar-text">
          <span class="sticky-bar-title">${sub.name}</span>
          <span class="sticky-bar-sub">$${sub.baseMonthlyUsd.toFixed(2)}/mo Covered</span>
        </div>
      </div>
      <button type="button" class="sticky-bar-btn" id="sticky-reserve-btn">
        $${sub.taxBufferMonthlyUsd.toFixed(2)} →
      </button>
    </div>
    <!-- Shared Footer from home.html -->
    <footer class="app-footer">
      <p>Powered by <a href="https://api-docs.defillama.com/" target="_blank" rel="noopener noreferrer">DefiLlama API</a>. Education, not advice.</p>
      <p class="app-footer-hub-links">
        <a href="/tokens">Browse tokens</a> · <a href="/chains">Browse chains</a> · <a href="/agents">AI Agents &amp; MCP</a>
      </p>
    </footer>
  </div>
  <script>
    (function() {
      // Header controls parity with home.html
      var themeBtn = document.getElementById('theme-toggle-btn');
      if (themeBtn) {
        var savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        themeBtn.textContent = savedTheme === 'dark' ? '☼' : '☾';
        themeBtn.addEventListener('click', function() {
          var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          var next = isDark ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          try { localStorage.setItem('theme', next); } catch(e) {}
          themeBtn.textContent = next === 'dark' ? '☼' : '☾';
        });
      }
      var langBtn = document.getElementById('lang-toggle-btn');
      if (langBtn) {
        var url = new URL(window.location.href);
        var isKo = url.searchParams.get('lang') === 'ko';
        langBtn.textContent = isKo ? 'EN' : 'KO';
        langBtn.addEventListener('click', function() {
          if (isKo) url.searchParams.delete('lang');
          else url.searchParams.set('lang', 'ko');
          window.location.assign(url.toString());
        });
      }
      var menuBtn = document.getElementById('menu-toggle-btn');
      var mobileNav = document.getElementById('mobile-nav');
      if (menuBtn && mobileNav) {
        menuBtn.addEventListener('click', function() {
          var isOpen = mobileNav.classList.toggle(['is', 'open'].join('-'));
          menuBtn.textContent = isOpen ? '×' : '☰';
        });
      }

      // Laso Partner Order & Recovery State Logic
      var panelInstant = document.getElementById('panel-instant-card');
      var panelInProgress = document.getElementById('checkout-in-progress-view');
      var lasoIssueBtn = document.getElementById('laso-issue-btn');
      var lasoResumeBtn = document.getElementById('laso-resume-btn');
      var lasoRestartBtn = document.getElementById('laso-restart-btn');
      var stickyBtn = document.getElementById('sticky-reserve-btn');
      var serviceAmount = ${sub.taxBufferMonthlyUsd.toFixed(2)};
      var checkoutTotalVal = document.getElementById('checkout-total-val');
      var sessionKey = 'dg_laso_order_' + '${sub.slug}';

      function activateInProgressState() {
        if (panelInstant) panelInstant.style.display = 'none';
        if (panelInProgress) panelInProgress.style.display = 'flex';
        try { sessionStorage.setItem(sessionKey, '1'); } catch (e) {}
      }

      function resetToCheckoutState() {
        if (panelInProgress) panelInProgress.style.display = 'none';
        if (panelInstant) panelInstant.style.display = 'block';
        try { sessionStorage.removeItem(sessionKey); } catch (e) {}
      }

      // Check if user previously launched Laso in this session
      try {
        if (sessionStorage.getItem(sessionKey) === '1') {
          activateInProgressState();
        }
      } catch (e) {}

      if (lasoIssueBtn) {
        lasoIssueBtn.addEventListener('click', function() {
          activateInProgressState();
        });
      }

      if (lasoRestartBtn) {
        lasoRestartBtn.addEventListener('click', function() {
          resetToCheckoutState();
        });
      }

      if (stickyBtn) {
        stickyBtn.addEventListener('click', function() {
          window.open('https://laso.finance?ref=lmretyujvzr9jiutxi4d', '_blank', 'noopener,noreferrer');
        });
      }
      // 3D Card Tilt & Cursor Sheen Tracking (pointer: fine & reduced-motion gated)
      (function() {
        var cardCell = document.querySelector('.card-hero-cell');
        var visaCard = document.getElementById('visa-card');
        if (!cardCell || !visaCard || typeof window === 'undefined' || !window.matchMedia) return;

        var fineMatch = window.matchMedia('(pointer: fine)');
        var motionMatch = window.matchMedia('(prefers-reduced-motion: no-preference)');

        function isTiltEligible() {
          return fineMatch.matches && motionMatch.matches;
        }

        cardCell.addEventListener('pointermove', function(e) {
          if (!isTiltEligible()) return;
          var rect = cardCell.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          var x = (e.clientX - rect.left) / rect.width;
          var y = (e.clientY - rect.top) / rect.height;
          x = Math.max(0, Math.min(1, x));
          y = Math.max(0, Math.min(1, y));

          // Max ±7deg
          var rotateY = (x - 0.5) * 14;
          var rotateX = (0.5 - y) * 14;

          visaCard.style.transition = 'none';
          visaCard.style.transform = 'perspective(1200px) rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg)';

          // Shift sheen position ±15% (35% to 65%)
          var sheenX = 50 + (x - 0.5) * 30;
          visaCard.style.setProperty('--sheen-x', sheenX.toFixed(1) + '% 0');
        });

        cardCell.addEventListener('pointerleave', function() {
          visaCard.style.transition = 'transform 0.18s ease-out';
          visaCard.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg)';
          visaCard.style.setProperty('--sheen-x', '50% 0');
        });
      })();
    })();
  </script>
</body>
</html>`;
}

const forDir = path.join(__dirname, 'for');
if (!fs.existsSync(forDir)) {
  fs.mkdirSync(forDir, { recursive: true });
}

console.log('Generating /for/<subscription> intent pages...');
SUBSCRIPTIONS.forEach(sub => {
  const filePath = path.join(forDir, `${sub.slug}.html`);
  fs.writeFileSync(filePath, generateHtml(sub), 'utf8');
  console.log(`  ✓ Generated /for/${sub.slug}.html`);
});

console.log(`Successfully generated ${SUBSCRIPTIONS.length} intent pages.`);
