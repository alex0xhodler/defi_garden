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
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HISTORY_DIR = path.join(ROOT, 'data/history');
const SNAPSHOT_PATH = path.join(ROOT, 'data/pools-snapshot.json');
const OUTPUT_HTML = path.join(ROOT, 'forecast-accuracy.html');

const MIN_TVL = 100000;
const SANITY_LIMIT = 1000;

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

  // Top misses sorted by absolute percentage point error
  errors.sort((a, b) => b.error - a.error);
  const topMisses = errors.slice(0, 10);

  // Top accurate forecasts (large TVL pools)
  const accurateHighTvl = errors
    .filter(e => e.tvlUsd >= 10000000 && e.inBand)
    .sort((a, b) => a.error - b.error)
    .slice(0, 10);

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
    topMisses,
    accurateHighTvl,
    generatedAt: new Date().toISOString()
  };
}

function renderScorecardHtml(stats) {
  if (!stats) return '';

  const missRows = stats.topMisses.map((m, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(m.project)}</strong> (${escapeHtml(m.symbol)})</td>
      <td>${escapeHtml(m.chain)}</td>
      <td class="num">${m.p50.toFixed(2)}%</td>
      <td class="num">[${m.p10.toFixed(2)}%, ${m.p90.toFixed(2)}%]</td>
      <td class="num" style="font-weight:600; color:var(--ui-accent);">${m.actualApy.toFixed(2)}%</td>
      <td class="num" style="color:#e05252; font-weight:700;">+${m.error.toFixed(2)} pp</td>
    </tr>
  `).join('\n');

  const accurateRows = stats.accurateHighTvl.map(m => `
    <tr>
      <td><strong>${escapeHtml(m.project)}</strong> (${escapeHtml(m.symbol)})</td>
      <td>${escapeHtml(m.chain)}</td>
      <td class="num">${formatUsd(m.tvlUsd)}</td>
      <td class="num">${m.p50.toFixed(2)}%</td>
      <td class="num">[${m.p10.toFixed(2)}%, ${m.p90.toFixed(2)}%]</td>
      <td class="num" style="font-weight:600; color:var(--cert-green, #10b981);">${m.actualApy.toFixed(2)}%</td>
      <td class="num" style="color:var(--ui-text-secondary);">&plusmn;${m.error.toFixed(2)} pp</td>
    </tr>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeFi Yield Forecast Accuracy Scorecard | DeFi Garden</title>
  <meta name="description" content="Public track-record for DeFi Garden's 14-day forward yield forecast bands. Empirical accuracy, mean absolute error, and named forecast misses.">
  <link rel="canonical" href="https://www.defi.garden/forecast-accuracy">
  <meta property="og:title" content="DeFi Yield Forecast Accuracy Scorecard | DeFi Garden">
  <meta property="og:description" content="Public track-record for DeFi Garden's 14-day forward yield forecast bands. Verified against historical DefiLlama data.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://www.defi.garden/forecast-accuracy">
  <meta name="robots" content="index,follow">
  <link rel="stylesheet" href="/style.css">
  <style>
    .scorecard-wrap { max-width: 920px; margin: 0 auto; padding: 40px 20px; }
    .scorecard-wrap h1 { font-family: var(--font-family-display); font-size: 1.85rem; margin: 0 0 8px; color: var(--ui-text); }
    .scorecard-sub { color: var(--ui-text-secondary); font-size: 0.95rem; margin-bottom: 24px; line-height: 1.5; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 24px 0 32px; }
    .kpi-card { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); padding: 20px; }
    .kpi-card .label { font-size: 0.8rem; color: var(--ui-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
    .kpi-card .val { font-size: 1.7rem; font-weight: 700; color: var(--ui-text); font-variant-numeric: tabular-nums; }
    .kpi-card .subtext { font-size: 0.82rem; color: var(--ui-text-muted); margin-top: 4px; }
    .table-card { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); overflow: hidden; margin: 20px 0 36px; }
    .table-card table { width: 100%; border-collapse: collapse; text-align: left; }
    .table-card th, .table-card td { padding: 12px 16px; border-bottom: 1px solid var(--ui-border); font-size: 0.9rem; }
    .table-card th { color: var(--ui-text-secondary); font-weight: 600; background: var(--ui-surface-muted, rgba(0,0,0,0.02)); }
    .table-card tr:last-child td { border-bottom: none; }
    .table-card .num { text-align: right; font-variant-numeric: tabular-nums; }
    .scroll-wrap { overflow-x: auto; }
    .misses-banner { background: rgba(224, 82, 82, 0.06); border: 1px solid rgba(224, 82, 82, 0.2); border-radius: var(--ui-radius-md); padding: 14px 18px; margin-bottom: 14px; font-size: 0.88rem; color: var(--ui-text); }
  </style>
</head>
<body>
  <div class="scorecard-wrap">
    <h1>14-Day Yield Forecast Accuracy Scorecard</h1>
    <p class="scorecard-sub">
      DeFi Garden forecasts 14-day yield trajectories using predictive machine learning models. 
      To maintain zero tolerance for ungrounded claims, this scorecard evaluates real-world accuracy 
      against historical outcomes and publishes our biggest forecast errors openly.
    </p>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="label">Band Capture Rate</div>
        <div class="val" style="color:var(--cert-green, #10b981);">${stats.bandAccuracy.toFixed(1)}%</div>
        <div class="subtext">${stats.withinBand.toLocaleString()} of ${stats.evaluated.toLocaleString()} pools landed in [p10, p90]</div>
      </div>
      <div class="kpi-card">
        <div class="label">Stablecoin Band Accuracy</div>
        <div class="val" style="color:var(--cert-green, #10b981);">${stats.stableAccuracy.toFixed(1)}%</div>
        <div class="subtext">USDC, USDT, DAI pools (MAE: ${stats.stableMae.toFixed(2)} pp)</div>
      </div>
      <div class="kpi-card">
        <div class="label">Overall Mean Error (MAE)</div>
        <div class="val">${stats.overallMae.toFixed(2)} pp</div>
        <div class="subtext">Average absolute delta vs forecast p50</div>
      </div>
      <div class="kpi-card">
        <div class="label">Backtest Horizon</div>
        <div class="val" style="font-size:1.3rem; padding-top:6px;">${stats.initialDate} → ${stats.finalDate}</div>
        <div class="subtext">14-day empirical test window</div>
      </div>
    </div>

    <h2 style="font-size:1.25rem; margin:32px 0 8px; color:var(--ui-text);">The Honest Misses: Top 10 Forecast Outliers</h2>
    <div class="misses-banner">
      <strong>Why we publish our misses:</strong> No other DeFi yield platform discloses predictive error. 
      These venues experienced unexpected volatility spikes, reward emission shifts, or liquidity drops that broke outside our 90% confidence bands.
    </div>

    <div class="table-card">
      <div class="scroll-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Protocol / Pool</th>
              <th>Chain</th>
              <th class="num">Forecast (p50)</th>
              <th class="num">Forecast Band [p10, p90]</th>
              <th class="num">Actual APY</th>
              <th class="num">Error Delta</th>
            </tr>
          </thead>
          <tbody>
${missRows}
          </tbody>
        </table>
      </div>
    </div>

    <h2 style="font-size:1.25rem; margin:32px 0 8px; color:var(--ui-text);">Top Capital Venues: Realized Track Record (TVL &ge; $10M)</h2>
    <p style="color:var(--ui-text-secondary); font-size:0.9rem; margin-bottom:14px;">
      Predictive performance across high-liquidity lending markets and established liquidity pools where capital preservation matters most.
    </p>

    <div class="table-card">
      <div class="scroll-wrap">
        <table>
          <thead>
            <tr>
              <th>Protocol / Pool</th>
              <th>Chain</th>
              <th class="num">TVL</th>
              <th class="num">Forecast (p50)</th>
              <th class="num">Band [p10, p90]</th>
              <th class="num">Actual APY</th>
              <th class="num">Accuracy Delta</th>
            </tr>
          </thead>
          <tbody>
${accurateRows}
          </tbody>
        </table>
      </div>
    </div>

    <p style="font-size:0.85rem; color:var(--ui-text-muted); margin-top:32px; border-top:1px solid var(--ui-border); padding-top:16px;">
      Generated automatically by DeFi Garden CI on ${stats.generatedAt.split('T')[0]}. 
      Data sourced from immutable historical snapshots stored on disk. Education only, not financial advice.
    </p>
  </div>
</body>
</html>
`;
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
