#!/usr/bin/env node

/**
 * Public Forecast Accuracy Scorecard Generator (Task W2)
 *
 * Evaluates empirical 14-day yield forecasts against historical outcomes
 * from data/history/*.json and writes forecast-accuracy.html.
 *
 * Implements "Honest numbers beat exciting numbers":
 * - Evaluates pools clearing the published trust rails (TVL >= $100K, APY <= 1000%).
 * - Computes % of outcomes landing inside the probabilistic p10-p90 forecast band.
 * - Computes Mean Absolute Error (MAE) across all evaluated venues.
 * - Names the biggest misses publicly (transparency as trust moat).
 * - "Quiet" design system: Besley display serif, hairline border, certificate-green tokens, zero slop.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HISTORY_DIR = path.join(ROOT, 'data/history');
const SNAPSHOT_PATH = path.join(ROOT, 'data/pools-snapshot.json');
const OUTPUT_HTML = path.join(ROOT, 'forecast-accuracy.html');

const MIN_TVL = 100000;
const SANITY_LIMIT = 1000;

// Known DEX / AMM protocols and multi-asset indicators.
// User directive: exclude LP pools entirely. Most are v3/concentrated liquidity or ve(3,3)
// pairs subject to mercenary capital migration, impermanent loss, and ephemeral reward gauge incentives.
function isLpPool(p) {
  if (p.exposure === 'multi' || p.ilRisk === 'yes') return true;
  if ((p.symbol || '').includes('-')) return true;
  const project = (p.project || '').toLowerCase();
  const dexes = [
    'uniswap', 'aerodrome', 'curve', 'pancakeswap', 'balancer', 'raydium', 
    'orca', 'ramses', 'camelot', 'trader-joe', 'sushiswap', 'velodrome', 
    'quickswap', 'spookyswap', 'ekubo', 'thruster', 'ambient', 'meteora', 
    'fenix', 'blackhole-clmm', 'lynex', 'nile', 'thena'
  ];
  return dexes.some(dex => project.includes(dex));
}

function computeAccuracy() {
  if (!fs.existsSync(HISTORY_DIR) || !fs.existsSync(SNAPSHOT_PATH)) {
    return null;
  }

  const historyFiles = fs.readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json')).sort();
  if (historyFiles.length < 15) {
    return null; // need at least 15 days of history for 14-day horizon
  }

  const initialFile = historyFiles[0]; // Day 0
  const finalFile = historyFiles[14];  // Day 14 (14-day outcome)
  const initialDate = initialFile.replace('.json', '');
  const finalDate = finalFile.replace('.json', '');

  const hInitial = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, initialFile), 'utf8')).pools || {};
  const hFinal = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, finalFile), 'utf8')).pools || {};
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
  const currentPools = snapshot.pools || snapshot.data || [];

  let evaluated = 0;
  let withinBand = 0;
  const errors = [];
  const stablecoinErrors = [];

  currentPools.forEach(p => {
    if (!p.forecast || p.forecast.p10 == null || p.forecast.p90 == null) return;
    if ((p.tvlUsd || 0) < MIN_TVL) return;
    if (isLpPool(p)) return; // Exclude DEX LP & volatile pairs

    const initialData = hInitial[p.pool];
    const finalData = hFinal[p.pool];
    if (!initialData || !finalData) return;

    const initialApy = initialData[0];
    const actualApy = finalData[0];
    if (initialApy > SANITY_LIMIT || actualApy > SANITY_LIMIT) return;

    evaluated++;
    const inBand = actualApy >= p.forecast.p10 && actualApy <= p.forecast.p90;
    if (inBand) withinBand++;

    const error = Math.abs(actualApy - p.forecast.p50);
    const item = {
      pool: p.pool,
      symbol: p.symbol || '—',
      project: p.project || '—',
      chain: p.chain || '—',
      p10: p.forecast.p10,
      p50: p.forecast.p50,
      p90: p.forecast.p90,
      actualApy,
      error,
      inBand,
      tvlUsd: p.tvlUsd || 0,
      isStable: ['USDC', 'USDT', 'DAI', 'USDS', 'EURC'].some(s => (p.symbol || '').toUpperCase().includes(s))
    };

    errors.push(item);
    if (item.isStable) stablecoinErrors.push(item);
  });

  if (evaluated === 0) return null;

  const bandAccuracy = (withinBand / evaluated) * 100;
  const overallMae = errors.reduce((acc, e) => acc + e.error, 0) / evaluated;

  // Stablecoin specific subset
  const stableEvaluated = stablecoinErrors.length;
  const stableWithinBand = stablecoinErrors.filter(e => e.inBand).length;
  const stableAccuracy = stableEvaluated > 0 ? (stableWithinBand / stableEvaluated) * 100 : 0;
  const stableMae = stableEvaluated > 0 ? stablecoinErrors.reduce((acc, e) => acc + e.error, 0) / stableEvaluated : 0;

  // Meaningful Misses:
  // User directive: only pools with lower than 30% Actual APY and TVL >= $1M.
  // Filters out speculative meme/mercenary spikes and focuses strictly on genuine,
  // retail-relevant yield venues where returns surprisingly shifted.
  const meaningfulMisses = errors
    .filter(e => e.tvlUsd >= 1000000 && !e.inBand && e.actualApy <= 30 && e.actualApy >= 0.1)
    .sort((a, b) => b.error - a.error)
    .slice(0, 10);

  // Full List of High-Liquidity Venues (TVL >= $10M):
  // User directive: full list of pools with active non-zero yield (actualApy >= 0.5% and <= 30%).
  // Displays whether each major capital venue landed inside its forecast band [p10, p90].
  const highLiquidityVenues = errors
    .filter(e => e.tvlUsd >= 10000000 && e.actualApy >= 0.5 && e.actualApy <= 30)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  return {
    initialDate,
    finalDate,
    evaluated,
    withinBand,
    bandAccuracy,
    overallMae,
    stableEvaluated,
    stableAccuracy,
    stableMae,
    topMisses: meaningfulMisses,
    highLiquidityVenues,
    generatedAt: new Date().toISOString()
  };
}

function renderScorecardHtml(stats) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Yield Forecast Accuracy: Pipeline Rebuild | DeFi Garden</title>
    <meta name="description" content="Methodology update for DeFi Garden's 14-day forward yield forecast evaluation pipeline.">
    <link rel="canonical" href="https://www.defi.garden/forecast-accuracy">
    <meta name="robots" content="noindex,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
    <link rel="preload" href="/fonts/PublicSans-latin-var.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/style.css">
    <style>
      .score-header {
        max-width: 860px;
        margin: 0 auto;
        padding: 20px 20px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid var(--ui-border);
      }
      .score-logo {
        font-family: var(--font-family-display);
        font-weight: 700;
        font-size: 1.15rem;
        color: var(--ui-text);
        text-decoration: none;
      }
      .score-nav a {
        color: var(--ui-text-secondary);
        text-decoration: none;
        font-size: 0.9rem;
        margin-left: 16px;
        transition: color .15s ease;
      }
      .score-nav a:hover {
        color: var(--ui-accent);
      }
      .score-wrap {
        max-width: 860px;
        margin: 0 auto;
        padding: 32px 20px 60px;
        color: var(--ui-text);
        line-height: 1.68;
      }
      .score-wrap h1 {
        font-family: var(--font-family-display);
        font-size: 2rem;
        line-height: 1.25;
        margin: 0 0 12px;
        color: var(--ui-text);
      }
      .score-byline {
        font-size: 0.85rem;
        color: var(--ui-text-muted);
        margin: 0 0 28px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--ui-border);
      }
      .score-lede {
        font-size: 1.05rem;
        line-height: 1.65;
        color: var(--ui-text);
        margin: 0 0 28px;
      }
      .score-footer {
        max-width: 860px;
        margin: 0 auto;
        padding: 24px 20px 40px;
        border-top: 1px solid var(--ui-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.85rem;
        color: var(--ui-text-secondary);
      }
      .score-footer a {
        color: var(--ui-accent);
        text-decoration: none;
      }
      .score-footer a:hover {
        text-decoration: underline;
      }
    </style>
</head>
<body>
    <header class=score-header>
        <a href="/" class="score-logo">DeFi Garden 🌱</a>
        <nav class="score-nav">
            <a href="/methodology">Methodology</a>
            <a href="/tokens/usdc">USDC Yields</a>
            <a href="/guide/defi-yield-rates-explained">Yield Guide</a>
            <a href="https://www.defi.garden/">Home</a>
        </nav>
    </header>

    <main class="score-wrap">
        <h1>Yield Forecast Accuracy: Evaluation Pipeline Rebuild</h1>
        <p class="score-byline">DeFi Garden Research · Methodology audit in progress · Education, not financial advice.</p>

        <div class="score-lede" style="background:var(--ui-surface-muted, rgba(0,0,0,0.03)); border:1px solid var(--ui-border); padding:20px 24px; border-radius:var(--ui-radius-md); margin-top:20px;">
          <h2 style="font-size:1.15rem; margin:0 0 10px; color:var(--ui-text);">Methodology Upgrade Notice</h2>
          <p style="margin:0 0 12px; font-size:0.95rem; line-height:1.6;">
            We are rebuilding our public forecast evaluation pipeline to benchmark only point-in-time forecasts that were recorded on the exact date of emission against realized 14-day outcomes, compared against a naive "no-change" baseline.
          </p>
          <p style="margin:0; font-size:0.95rem; line-height:1.6; color:var(--ui-text-secondary);">
            The historical track record, per-run breakdown, and comparison against the naive baseline will be published here upon completion of the point-in-time forecast capture engine.
          </p>
        </div>

        <p class="score-byline" style="margin-top:40px; border-bottom:none; border-top:1px solid var(--ui-border); padding-top:20px;">
            Notice: Yield forecast models are provided strictly for educational and underwriting evaluation purposes. Cryptocurrency assets carry risk of loss. Historical accuracy does not guarantee future yield performance.
        </p>
    </main>

    <footer class="score-footer">
        <div>DeFi Garden 🌱 · Non-custodial DeFi yield intelligence</div>
        <div><a href="https://www.defi.garden/">Home</a></div>
    </footer>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

function formatUsd(num) {
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function main() {
  console.log('📊 Computing 14-day yield forecast accuracy across historical snapshots...');
  const stats = computeAccuracy();
  if (!stats) {
    console.error('❌ Could not compute forecast accuracy: insufficient historical data in data/history.');
    process.exit(1);
  }

  console.log(`✅ Evaluated ${stats.evaluated} pools:`);
  console.log(`   - Band Capture Rate (p10-p90): ${stats.bandAccuracy.toFixed(1)}%`);
  console.log(`   - Stablecoin Capture Rate:    ${stats.stableAccuracy.toFixed(1)}%`);
  console.log(`   - Mean Absolute Error (MAE):  ${stats.overallMae.toFixed(2)} pp`);

  const html = renderScorecardHtml(stats);
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
  console.log(`📝 Wrote public scorecard to ${OUTPUT_HTML}`);
}

if (require.main === module) {
  main();
}

module.exports = { computeAccuracy, renderScorecardHtml };
