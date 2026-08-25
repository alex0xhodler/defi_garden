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
    category: 'AI & Developer Tooling',
    monthlyUsd: 20.00,
    emoji: '🤖',
    iconDomain: 'anthropic.com',
    requiredDepositUsd: 4800,
    apyPercent: 5.0,
    headline: 'Never pay for Claude Pro again.',
    subhead: 'Lock $4,800 USDC in an audited Base lending vault. Realized yield settles your $20/mo Claude invoice automatically. Withdraw your full deposit whenever you want.',
    metaDesc: 'Self-paying Claude Pro subscription powered by Base USDC yield. Keep 100% of your principal while automated yields cover your $20/mo Anthropic bill.'
  },
  {
    slug: 'cursor',
    name: 'Cursor Pro IDE',
    category: 'AI & Developer Tooling',
    monthlyUsd: 20.00,
    emoji: '💻',
    iconDomain: 'cursor.com',
    requiredDepositUsd: 4800,
    apyPercent: 5.0,
    headline: 'Eliminate your Cursor Pro bill with idle USDC.',
    subhead: 'Deposit $4,800 USDC once on Base. Automated yield covers your $20/mo IDE subscription on autopilot. Principal is non-custodial and 100% redeemable.',
    metaDesc: 'Fund Cursor Pro forever using Base USDC yield. Self-paying developer subscriptions with zero capital erosion.'
  },
  {
    slug: 'chatgpt',
    name: 'OpenAI ChatGPT Plus',
    category: 'AI & Developer Tooling',
    monthlyUsd: 20.00,
    emoji: '🧠',
    iconDomain: 'openai.com',
    requiredDepositUsd: 4800,
    apyPercent: 5.0,
    headline: 'Fund ChatGPT Plus forever from DeFi yield.',
    subhead: 'Lock $4,800 USDC on Base to generate $20.00/mo in net interest. Automated card settlement wipes out your OpenAI invoice every month.',
    metaDesc: 'Pay ChatGPT Plus automatically from Base DeFi yield. Non-custodial, principal-protected subscription funding.'
  },
  {
    slug: 'spotify',
    name: 'Spotify Premium',
    category: 'Streaming & Media',
    monthlyUsd: 12.00,
    emoji: '🎵',
    iconDomain: 'spotify.com',
    requiredDepositUsd: 2880,
    apyPercent: 5.0,
    headline: 'Perpetual Spotify Premium with zero monthly burn.',
    subhead: 'Deposit $2,880 USDC on Base. Net yield covers your $12/mo Spotify Premium indefinitely while your initial deposit remains untouched.',
    metaDesc: 'Get lifetime Spotify Premium yield-funding with Base USDC. Keep your principal, let DeFi yield pay the music bill.'
  },
  {
    slug: 'netflix',
    name: 'Netflix Standard',
    category: 'Streaming & Media',
    monthlyUsd: 18.00,
    emoji: '🎬',
    iconDomain: 'netflix.com',
    requiredDepositUsd: 4320,
    apyPercent: 5.0,
    headline: 'Stream Netflix perpetually from Base yield.',
    subhead: 'Lock $4,320 USDC in Base liquidity vaults. Monthly yield pays your $18.00 Netflix subscription automatically without touching your principal.',
    metaDesc: 'Self-paying Netflix subscription on Base. Yield covers your monthly streaming bill while you preserve 100% of your crypto.'
  },
  {
    slug: 'aws',
    name: 'AWS Cloud Micro-Infra',
    category: 'Cloud Infrastructure',
    monthlyUsd: 50.00,
    emoji: '☁️',
    iconDomain: 'aws.amazon.com',
    requiredDepositUsd: 12000,
    apyPercent: 5.0,
    headline: 'Self-paying AWS cloud compute for builders and agents.',
    subhead: 'Deposit $12,000 USDC on Base. Automated monthly yield sweeps extinguish $50.00/mo in cloud server and database burn with zero human ops.',
    metaDesc: 'Perpetual AWS cloud compute funding via Base DeFi yield. Autonomous infrastructure for Web3 developers and AI agents.'
  },
  {
    slug: 'github',
    name: 'GitHub Copilot Pro',
    category: 'AI & Developer Tooling',
    monthlyUsd: 10.00,
    emoji: '🐙',
    iconDomain: 'github.com',
    requiredDepositUsd: 2400,
    apyPercent: 5.0,
    headline: 'Code with Copilot Pro on permanent autopilot.',
    subhead: 'Deposit $2,400 USDC into isolated Base lending vaults. $10.00/mo in yield covers your Copilot subscription while your $2,400 stays 100% yours.',
    metaDesc: 'Fund GitHub Copilot from Base DeFi yields. Zero monthly expense, 100% self-custodial capital.'
  },
  {
    slug: 'youtube',
    name: 'YouTube Premium',
    category: 'Streaming & Media',
    monthlyUsd: 14.00,
    emoji: '📺',
    iconDomain: 'youtube.com',
    requiredDepositUsd: 3360,
    apyPercent: 5.0,
    headline: 'Ad-free YouTube Premium funded forever.',
    subhead: 'Lock $3,360 USDC on Base. Earn $14.00/mo in realized yield to settle YouTube Premium automatically with complete principal protection.',
    metaDesc: 'Yield-funded YouTube Premium subscription on Base. Zero monthly out-of-pocket costs.'
  }
];

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
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">

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
          "price": "${sub.requiredDepositUsd}",
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
    .intent-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 20px 80px;
    }
    .brand-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0 28px;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 36px;
    }
    .brand-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--color-text);
      font-weight: 700;
      font-size: 1.25rem;
    }
    .nav-links {
      display: flex;
      gap: 20px;
      align-items: center;
    }
    .nav-links a {
      color: var(--color-text-secondary);
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
    }
    .nav-links a:hover {
      color: var(--color-primary);
    }
    .hero-wrap {
      text-align: center;
      margin-bottom: 40px;
    }
    .badge-intent {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: rgba(var(--color-teal-500-rgb), 0.12);
      border: 1px solid rgba(var(--color-teal-500-rgb), 0.3);
      border-radius: 9999px;
      color: var(--color-primary);
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .hero-title {
      font-size: 2.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.15;
      margin: 0 0 16px;
      color: var(--color-text);
    }
    .hero-body {
      font-size: 1.15rem;
      color: var(--color-text-secondary);
      max-width: 680px;
      margin: 0 auto;
      line-height: 1.5;
    }
    .sim-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 40px;
    }
    @media (max-width: 768px) {
      .sim-grid { grid-template-columns: 1fr; }
      .hero-title { font-size: 1.85rem; }
    }
    .card-shell {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }
    .virtual-card-preview {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 14px;
      padding: 22px;
      color: #fff;
      position: relative;
      margin-bottom: 20px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .card-chip {
      width: 36px;
      height: 26px;
      background: #e2e8f0;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .card-num {
      font-family: var(--font-family-mono);
      font-size: 1.1rem;
      letter-spacing: 0.1em;
      color: #94a3b8;
      margin-bottom: 16px;
    }
    .card-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: #cbd5e1;
    }
    .metric-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--color-border);
      font-size: 0.9rem;
    }
    .metric-val {
      font-weight: 700;
      font-family: var(--font-family-mono);
      color: var(--color-text);
    }
    .btn-action {
      display: block;
      width: 100%;
      text-align: center;
      background: var(--color-primary);
      color: #fff;
      text-decoration: none;
      padding: 14px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 1rem;
      margin-top: 20px;
      box-sizing: border-box;
      transition: opacity 0.15s ease;
    }
    .btn-action:hover {
      opacity: 0.9;
    }
    .invariant-box {
      background: rgba(var(--color-teal-500-rgb), 0.08);
      border: 1px solid rgba(var(--color-teal-500-rgb), 0.2);
      border-radius: 10px;
      padding: 14px;
      font-size: 0.85rem;
      color: var(--color-text);
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="intent-container">
    <header class="brand-nav">
      <a href="/" class="brand-logo">
        <span>🌱</span>
        <span>DeFi Garden</span>
      </a>
      <nav class="nav-links">
        <a href="/">Savings Planner</a>
        <a href="/?token=USDC">Analytics Grid</a>
        <a href="/agents">AI Agents & MCP</a>
        <a href="/llms.txt">llms.txt</a>
      </nav>
    </header>

    <div class="hero-wrap">
      <div class="badge-intent">
        <span>${sub.emoji}</span>
        <span>${sub.category} · Intent Portal</span>
      </div>
      <h1 class="hero-title">${sub.headline}</h1>
      <p class="hero-body">${sub.subhead}</p>
    </div>

    <div class="sim-grid">
      <!-- Virtual Card Simulation -->
      <div class="card-shell">
        <h2 style="margin-top:0; font-size:1.15rem; color:var(--color-text);">💳 Yield-Funded Virtual Card Simulation</h2>
        <div class="virtual-card-preview">
          <div class="card-chip"></div>
          <div class="card-num">•••• •••• •••• ${Math.floor(1000 + Math.random() * 9000)}</div>
          <div class="card-meta">
            <div>
              <div style="font-size:0.65rem; color:#64748b;">CARDHOLDER</div>
              <div>${sub.slug.toUpperCase()}-VAULT / AGENT-01</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:0.65rem; color:#64748b;">STATUS</div>
              <div style="color:#34d399; font-weight:700;">🟢 ACTIVE ($${sub.monthlyUsd.toFixed(2)}/mo)</div>
            </div>
          </div>
        </div>

        <div class="metric-row">
          <span style="color:var(--color-text-secondary);">Monthly Subscription Cost</span>
          <span class="metric-val">$${sub.monthlyUsd.toFixed(2)} USD</span>
        </div>
        <div class="metric-row">
          <span style="color:var(--color-text-secondary);">Base Net APY (Morpho Blue)</span>
          <span class="metric-val" style="color:var(--color-primary);">${sub.apyPercent.toFixed(1)}%</span>
        </div>
        <div class="metric-row">
          <span style="color:var(--color-text-secondary);">Required 1-Time Deposit</span>
          <span class="metric-val">$${sub.requiredDepositUsd.toLocaleString()} USDC</span>
        </div>

        <a href="/plan.html?goal=${sub.slug}&capital=${sub.requiredDepositUsd}&fm=capital" class="btn-action">
          Simulate & Lock $${sub.requiredDepositUsd.toLocaleString()} USDC →
        </a>
      </div>

      <!-- How Intent Execution Works -->
      <div class="card-shell">
        <h2 style="margin-top:0; font-size:1.15rem; color:var(--color-text);">⚡ How Intent Resolution Works</h2>
        <div style="display:flex; flex-direction:column; gap:14px; font-size:0.875rem; color:var(--color-text-secondary);">
          <div>
            <strong style="color:var(--color-text);">1. Deposit Once on Base:</strong>
            <div>Deposit $${sub.requiredDepositUsd.toLocaleString()} USDC into an audited non-custodial lending vault on Base via Passkey.</div>
          </div>
          <div>
            <strong style="color:var(--color-text);">2. Automated Yield Harvests:</strong>
            <div>Keepers harvest ~5.0% APY ($${sub.monthlyUsd.toFixed(2)}/mo) directly to cover your ${sub.name} invoice.</div>
          </div>
          <div>
            <strong style="color:var(--color-text);">3. 100% Principal Protection:</strong>
            <div>Your $${sub.requiredDepositUsd.toLocaleString()} USDC principal remains untouched and can be fully withdrawn at any moment.</div>
          </div>
        </div>

        <div class="invariant-box">
          <strong>🛡️ Protocol Invariant:</strong> &Delta; Principal &equiv; 0. Yield pays the merchant; you keep the capital forever.
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer style="text-align:center; padding-top:40px; border-top:1px solid var(--color-border); font-size:0.85rem; color:var(--color-text-secondary);">
      <p>© 2026 DeFi Garden · Education & Yield Intelligence. All deposits remain non-custodial on Base.</p>
      <div style="display:flex; justify-content:center; gap:16px; margin-top:10px;">
        <a href="/" style="color:var(--color-text-secondary); text-decoration:none;">Planner</a>
        <a href="/agents" style="color:var(--color-text-secondary); text-decoration:none;">AI Agents & MCP</a>
        <a href="/llms.txt" style="color:var(--color-text-secondary); text-decoration:none;">llms.txt</a>
        <a href="/sitemap.xml" style="color:var(--color-text-secondary); text-decoration:none;">Sitemap</a>
      </div>
    </footer>
  </div>
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
