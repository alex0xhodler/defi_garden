#!/usr/bin/env node
/**
 * scripts/evaluate-forecast-accuracy.js
 *
 * Implements the pre-locked methodology in docs/forecast-evaluation-methodology.md:
 * - Scans data/forecasts/YYYY-MM-DD.json
 * - Checks against outcome data/history/YYYY-MM-DD.json (+14 days)
 * - Evaluates Band Capture vs 80%, Model MAE, Naive Baseline MAE, Skill Score
 * - Evaluates Overall, Stablecoins, and High-Liquidity (>= $10M) segments
 * - Counts dropouts/feed gaps transparently
 * - Computes per-run stats and overall median across runs
 * - Outputs data/forecast-evaluations.json and updates forecast-accuracy.html
 */

const fs = require('fs');
const path = require('path');

const FORECASTS_DIR = path.join(__dirname, '../data/forecasts');
const HISTORY_DIR = path.join(__dirname, '../data/history');
const OUT_JSON = path.join(__dirname, '../data/forecast-evaluations.json');
const OUT_HTML = path.join(__dirname, '../forecast-accuracy.html');

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function computeRunEvaluation(issueDate, outcomeDate, forecastFile, historyFile) {
  const forecastData = JSON.parse(fs.readFileSync(forecastFile, 'utf8'));
  const historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));

  const forecasts = forecastData.forecasts || {};
  const history = historyData.pools || {};

  let totalIssued = 0;
  let evaluated = 0;
  let droppedOut = 0;

  // Overall metrics
  let inBand = 0;
  let modelErrSum = 0;
  let naiveErrSum = 0;

  // Stablecoin metrics
  let stableTotal = 0;
  let stableInBand = 0;
  let stableModelErrSum = 0;
  let stableNaiveErrSum = 0;

  // High Liquidity metrics (>= $10M)
  let highLiqTotal = 0;
  let highLiqInBand = 0;
  let highLiqModelErrSum = 0;
  let highLiqNaiveErrSum = 0;

  for (const [poolId, tuple] of Object.entries(forecasts)) {
    totalIssued++;
    const [p10, p50, p90, apy0, tvl, isStable] = tuple;

    const hist = history[poolId];
    if (!hist || hist[0] === null || hist[0] === undefined) {
      droppedOut++;
      continue;
    }

    const apy14 = hist[0];
    if (apy14 > 1000) {
      droppedOut++;
      continue;
    }

    evaluated++;
    const modelErr = Math.abs(apy14 - p50);
    const naiveErr = Math.abs(apy14 - apy0);

    modelErrSum += modelErr;
    naiveErrSum += naiveErr;
    if (apy14 >= p10 && apy14 <= p90) {
      inBand++;
    }

    // Stablecoin segment
    if (isStable === 1) {
      stableTotal++;
      stableModelErrSum += modelErr;
      stableNaiveErrSum += naiveErr;
      if (apy14 >= p10 && apy14 <= p90) {
        stableInBand++;
      }
    }

    // High liquidity segment
    if (tvl >= 10000000) {
      highLiqTotal++;
      highLiqModelErrSum += modelErr;
      highLiqNaiveErrSum += naiveErr;
      if (apy14 >= p10 && apy14 <= p90) {
        highLiqInBand++;
      }
    }
  }

  if (evaluated === 0) return null;

  return {
    issueDate,
    outcomeDate,
    totalIssued,
    evaluated,
    droppedOut,
    overall: {
      bandCapturePct: Number((100 * inBand / evaluated).toFixed(1)),
      modelMae: Number((modelErrSum / evaluated).toFixed(2)),
      naiveMae: Number((naiveErrSum / evaluated).toFixed(2)),
      skillScore: Number((1 - (modelErrSum / naiveErrSum)).toFixed(2))
    },
    stablecoins: {
      evaluated: stableTotal,
      bandCapturePct: stableTotal > 0 ? Number((100 * stableInBand / stableTotal).toFixed(1)) : 0,
      modelMae: stableTotal > 0 ? Number((stableModelErrSum / stableTotal).toFixed(2)) : 0,
      naiveMae: stableTotal > 0 ? Number((stableNaiveErrSum / stableTotal).toFixed(2)) : 0,
      skillScore: stableNaiveErrSum > 0 ? Number((1 - (stableModelErrSum / stableNaiveErrSum)).toFixed(2)) : 0
    },
    highLiquidity: {
      evaluated: highLiqTotal,
      bandCapturePct: highLiqTotal > 0 ? Number((100 * highLiqInBand / highLiqTotal).toFixed(1)) : 0,
      modelMae: highLiqTotal > 0 ? Number((highLiqModelErrSum / highLiqTotal).toFixed(2)) : 0,
      naiveMae: highLiqTotal > 0 ? Number((highLiqNaiveErrSum / highLiqTotal).toFixed(2)) : 0,
      skillScore: highLiqNaiveErrSum > 0 ? Number((1 - (highLiqModelErrSum / highLiqNaiveErrSum)).toFixed(2)) : 0
    }
  };
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function renderHtml(report) {
  const runs = report.resolvedRuns;

  const rows = runs.map(r => `
    <tr>
      <td style="font-weight:600;">${r.issueDate} &rarr; ${r.outcomeDate.slice(5)}</td>
      <td class="num">${r.evaluated.toLocaleString()}</td>
      <td class="num">${r.droppedOut}</td>
      <td class="num" style="font-weight:600;">${r.overall.bandCapturePct.toFixed(1)}%</td>
      <td class="num">${r.overall.modelMae.toFixed(2)} pp</td>
      <td class="num" style="color:var(--ui-text-secondary);">${r.overall.naiveMae.toFixed(2)} pp</td>
      <td class="num" style="font-weight:600; color:${r.overall.skillScore > 0 ? '#10b981' : '#d9534f'};">
        ${r.overall.skillScore > 0 ? '+' : ''}${r.overall.skillScore.toFixed(2)}
      </td>
      <td class="num">${r.stablecoins.bandCapturePct.toFixed(1)}%</td>
      <td class="num">${r.highLiquidity.bandCapturePct.toFixed(1)}%</td>
    </tr>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Yield Forecast Accuracy: Multi-Run Track Record | DeFi Garden</title>
    <meta name="description" content="Empirical 14-day forward yield forecast accuracy across independent point-in-time snapshot runs, benchmarked against a naive no-change baseline.">
    <link rel="canonical" href="https://www.defi.garden/forecast-accuracy">
    <meta name="robots" content="noindex,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
    <link rel="preload" href="/fonts/PublicSans-latin-var.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/style.css">
    <style>
      .score-header {
        max-width: 940px;
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
        max-width: 940px;
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
        font-size: 1.02rem;
        line-height: 1.65;
        color: var(--ui-text);
        margin: 0 0 28px;
      }
      .kpi-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
        margin: 0 0 32px;
      }
      .kpi-cell {
        background: var(--ui-surface);
        border: 1px solid var(--ui-border);
        border-radius: var(--ui-radius-md);
        padding: 16px 18px;
      }
      .kpi-cell .kpi-label {
        font-size: 0.76rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ui-text-muted);
        margin: 0 0 6px;
        font-weight: 600;
      }
      .kpi-cell .kpi-val {
        font-size: 1.6rem;
        font-weight: 700;
        color: var(--ui-text);
        font-variant-numeric: tabular-nums;
        line-height: 1.2;
      }
      .kpi-cell .kpi-sub {
        font-size: 0.8rem;
        color: var(--ui-text-secondary);
        margin-top: 4px;
      }
      .table-card {
        background: var(--ui-surface);
        border: 1px solid var(--ui-border);
        border-radius: var(--ui-radius-lg);
        padding: 8px 18px;
        margin: 16px 0 28px;
      }
      .table-card table {
        width: 100%;
        border-collapse: collapse;
      }
      .table-card th, .table-card td {
        text-align: left;
        padding: 12px 8px;
        border-bottom: 1px solid var(--ui-border);
        font-size: 0.88rem;
        color: var(--ui-text);
      }
      .table-card th {
        color: var(--ui-text-secondary);
        font-weight: 600;
        font-size: 0.80rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .table-card tr:last-child td {
        border-bottom: none;
      }
      .table-card td.num, .table-card th.num {
        text-align: right;
        font-variant-numeric: tabular-nums;
      }
      .scroll {
        overflow-x: auto;
      }
      .score-footer {
        max-width: 940px;
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
    </style>
</head>
<body>
    <header class="score-header">
        <a href="/" class="score-logo">DeFi Garden 🌱</a>
        <nav class="score-nav">
            <a href="/plan.html">Savings Planner</a>
            <a href="/tokens/usdc">USDC Yields</a>
            <a href="/guide/defi-yield-rates-explained">Yield Guide</a>
            <a href="https://www.defi.garden/">Home</a>
        </nav>
    </header>

    <main class="score-wrap">
        <h1>Yield Forecast Accuracy: Empirical Track Record</h1>
        <p class="score-byline">DeFi Garden Underwriting Research · Evaluated against immutable daily snapshots · Horizon: 14 Days · Education, not financial advice.</p>

        <p class="score-lede">
          DeFi Garden evaluates 14-day forward yield forecast distributions ($[p10, p90]$) against realized outcomes across single-sided lending venues, vaults, and staking markets (excluding volatile AMM LP pairs). Under our core operating principle &mdash; <em>honest numbers beat exciting numbers</em> &mdash; every run benchmarks predictions recorded on the exact date of emission against a naive "no-change" baseline ($APY_0$).
        </p>

        <div class="kpi-row">
            <div class="kpi-cell">
                <div class="kpi-label">Median Band Capture</div>
                <div class="kpi-val">${report.summary.medianBandCapture.toFixed(1)}%</div>
                <div class="kpi-sub">Target: 80% nominal coverage</div>
            </div>
            <div class="kpi-cell">
                <div class="kpi-label">Median Model MAE</div>
                <div class="kpi-val">${report.summary.medianModelMae.toFixed(2)} pp</div>
                <div class="kpi-sub">Mean error vs median forecast</div>
            </div>
            <div class="kpi-cell">
                <div class="kpi-label">Naive Baseline MAE</div>
                <div class="kpi-val">${report.summary.medianNaiveMae.toFixed(2)} pp</div>
                <div class="kpi-sub">Mean error assuming "no change"</div>
            </div>
            <div class="kpi-cell">
                <div class="kpi-label">Median Skill Score</div>
                <div class="kpi-val" style="color:${report.summary.medianSkillScore > 0 ? '#10b981' : '#d9534f'};">
                  ${report.summary.medianSkillScore > 0 ? '+' : ''}${report.summary.medianSkillScore.toFixed(2)}
                </div>
                <div class="kpi-sub">1 &minus; (Model MAE / Naive MAE)</div>
            </div>
        </div>

        <div class="score-lede" style="background:var(--ui-surface-muted, rgba(0,0,0,0.03)); border:1px solid var(--ui-border); padding:16px 20px; border-radius:var(--ui-radius-md); font-size:0.92rem;">
          <strong>Key Research Finding:</strong> Across ${runs.length} resolved daily runs, the empirical 80% confidence interval captures <strong>${report.summary.medianBandCapture.toFixed(1)}%</strong> of actual outcomes. However, the median forecast skill score sits at <strong>${report.summary.medianSkillScore > 0 ? '+' : ''}${report.summary.medianSkillScore.toFixed(2)}</strong> against the naive baseline &mdash; confirming that in steady-state lending markets, assuming rates remain unchanged remains a highly competitive benchmark. Forecasts are marked experimental on all individual venue pages.
        </div>

        <h2 style="font-size:1.25rem; margin:32px 0 10px;">Daily Resolved Evaluation Runs (14-Day Horizon)</h2>
        <div class="table-card">
            <div class="scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Run Horizon</th>
                            <th class="num">Venues</th>
                            <th class="num">Dropouts</th>
                            <th class="num">Capture [p10, p90]</th>
                            <th class="num">Model MAE</th>
                            <th class="num">Naive MAE</th>
                            <th class="num">Skill Score</th>
                            <th class="num">Stablecoin Capture</th>
                            <th class="num">&ge;$10M Capture</th>
                        </tr>
                    </thead>
                    <tbody>
${rows}
                    </tbody>
                </table>
            </div>
        </div>

        <p class="score-byline" style="margin-top:40px; border-bottom:none; border-top:1px solid var(--ui-border); padding-top:20px;">
            Methodology: Evaluated per pre-registered filters in <code>docs/forecast-evaluation-methodology.md</code>. Verified via git commit logs and historical snapshot records.
        </p>
    </main>

    <footer class="score-footer">
        <div>DeFi Garden 🌱 · Non-custodial DeFi yield intelligence</div>
        <div><a href="https://www.defi.garden/">Home</a></div>
    </footer>
</body>
</html>
`;
}

function main() {
  console.log('📊 Evaluating point-in-time forecasts against 14-day realized outcomes...');

  const forecastFiles = fs.readdirSync(FORECASTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();

  const resolvedRuns = [];

  for (const f of forecastFiles) {
    const issueDate = f.replace('.json', '');
    const outcomeDate = addDays(issueDate, 14);
    const historyPath = path.join(HISTORY_DIR, `${outcomeDate}.json`);

    if (!fs.existsSync(historyPath)) {
      continue; // Horizon has not yet elapsed
    }

    const forecastPath = path.join(FORECASTS_DIR, f);
    const runEval = computeRunEvaluation(issueDate, outcomeDate, forecastPath, historyPath);
    if (runEval) {
      resolvedRuns.push(runEval);
      console.log(`✓ Evaluated ${issueDate} -> ${outcomeDate} (n=${runEval.evaluated}, band=${runEval.overall.bandCapturePct}%, skill=${runEval.overall.skillScore})`);
    }
  }

  if (resolvedRuns.length === 0) {
    console.error('❌ No resolved runs found.');
    process.exit(1);
  }

  const summary = {
    totalRuns: resolvedRuns.length,
    medianBandCapture: median(resolvedRuns.map(r => r.overall.bandCapturePct)),
    medianModelMae: median(resolvedRuns.map(r => r.overall.modelMae)),
    medianNaiveMae: median(resolvedRuns.map(r => r.overall.naiveMae)),
    medianSkillScore: median(resolvedRuns.map(r => r.overall.skillScore)),
    stablecoins: {
      medianBandCapture: median(resolvedRuns.map(r => r.stablecoins.bandCapturePct)),
      medianSkillScore: median(resolvedRuns.map(r => r.stablecoins.skillScore))
    },
    highLiquidity: {
      medianBandCapture: median(resolvedRuns.map(r => r.highLiquidity.bandCapturePct)),
      medianSkillScore: median(resolvedRuns.map(r => r.highLiquidity.skillScore))
    }
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary,
    resolvedRuns
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
  console.log(`📝 Wrote evaluation report to ${OUT_JSON}`);

  const html = renderHtml(report);
  fs.writeFileSync(OUT_HTML, html, 'utf8');
  console.log(`📝 Wrote updated scorecard to ${OUT_HTML}`);
}

if (require.main === module) {
  main();
}
