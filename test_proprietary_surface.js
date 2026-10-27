// Owner decision 2026-10-25 ("what, not how"): the DeFi Score is PROPRIETARY.
// Public source files and public serializers must not carry pillar weights/maxima,
// band cutoffs, the model name/vendor or on-chain telemetry specifics.
// (The scoring engine itself is not part of the public surface.)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PUBLIC_FILES = [
  'landing.js', 'stocks.js', 'PoolDetail.js', 'app.js', 'translations.js', 'methodology.html', 'mcp-page.html',
  'generate-landing-pools.js', 'generate-pool-scores-json.js', 'generate-pool-score-pages.js', 'generate-protocol-pages.js', 'generate-protocol-pages-core.js', 'generate-llms.js',
  'generate-stocks-snapshot.js', 'generate-stock-ticker-pages.js', 'generate-ko-static.js', 'i18n/methodology-ko.js', 'api/mcp.js', 'i18n/pt.js', 'i18n/es.js', 'i18n/static-en-ko.js',
  '.well-known/mcp.json', '.well-known/mcp/server-card.json', '.well-known/mcp/server-cards.json'
];
const HIDDEN = [
  [/\b(35|25|15)\s*%\s*\)?[:)]/, 'pillar weight percentage'],
  [/(?<![\d.])\/\s*(35|25|15)\b(?!\s*(px|%|\d|d\b))/, 'x / max pillar display'],
  [/\bmax:\s*(35|25|15)\b/, 'pillar max constant'],
  [/(?:≥|>=)\s*(?:85|70|55|40)\b(?!\s*(?:%|px))(?=[^\n]{0,40}(?:AAA|AA|BBB|rating|band))/, 'band cutoff'],
  [/timesfm/i, 'model name'],
  [/google\/timesfm/i, 'model vendor'],
  [/alchemy/i, 'on-chain provider'],
  [/pillar breakdown|breakdown: pool\.defiScore\.breakdown/i, 'raw pillar breakdown serialization']
];
let bad = [];
PUBLIC_FILES.forEach(f => {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  src.split('\n').forEach((line, i) => HIDDEN.forEach(([re, why]) => {
    if (re.test(line)) bad.push(`${f}:${i + 1} ${why}: ${line.trim().slice(0, 100)}`);
  }));
});
assert.deepStrictEqual(bad, [], 'proprietary internals in public source:\n' + bad.join('\n'));

// The KO outputs (ko/methodology.html, ko/stocks/*.html) are public too: same internals ban. Built in-memory
// from the generators (ko/ is a gitignored output), plus whatever is on disk after a restore.
const koOutputs = [];
koOutputs.push(['ko/methodology.html (built)', require('./generate-ko-static.js').buildMethodologyKo().html]);
const KO_HIDDEN_EXTRA = [
  [/가중치\s*[:은는]?\s*\d|\d\s*점\s*만점|만점|컷오프\s*\d|(?:≥|>=)\s*(?:85|70|55|40)\b/, 'KO weight / cutoff figures'],
  [/pillarsPct|pillars_pct/, 'pillar percentages'],
  [/\b\d{1,3}(?:\.\d+)?\s*\/\s*(?:35|25|15)\b/, 'x / max pillar display']
];
['ko/methodology.html'].concat(fs.existsSync(path.join(__dirname, 'ko', 'stocks')) ? fs.readdirSync(path.join(__dirname, 'ko', 'stocks')).filter(f => /\.html$/.test(f)).map(f => 'ko/stocks/' + f) : [])
  .forEach(f => { const fp = path.join(__dirname, f); if (fs.existsSync(fp)) koOutputs.push([f, fs.readFileSync(fp, 'utf8')]); });
const koStocks = require('./generate-stock-ticker-pages.js');
try {
  const sv = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'stocks-versions.json'), 'utf8'));
  koStocks.buildAll(sv, 'ko').forEach(p => koOutputs.push(['ko/stocks/' + p.slug + '.html (built)', p.html]));
} catch (_e) { /* no stocks-versions.json locally */ }
const koBad = [];
koOutputs.forEach(([name, html]) => {
  const text = html.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, m => m);
  text.split('\n').forEach((line, i) => HIDDEN.concat(KO_HIDDEN_EXTRA).forEach(([re, why]) => {
    if (re.test(line)) koBad.push(`${name}:${i + 1} ${why}: ${line.trim().slice(0, 100)}`);
  }));
});
assert.deepStrictEqual(koBad, [], 'proprietary internals in KO outputs:\n' + koBad.join('\n'));

// Owner decision 2026-10-26: public surfaces show each pillar as a TIER (High / Medium / Low), never the
// exact 0-100 number. No public source may read or serialize pillarsPct / pillars_pct (the engine may still
// emit it for a while; generators strip it). A line may carry the marker `allow-pillarsPct` when it is
// stripping code or a comment explaining the strip.
const pctReaders = [];
PUBLIC_FILES.forEach(f => {
  fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').forEach((line, i) => {
    if (/pillarsPct|pillars_pct/.test(line) && !/allow-pillarsPct/.test(line)) pctReaders.push(`${f}:${i + 1} ${line.trim().slice(0, 100)}`);
  });
});
assert.deepStrictEqual(pctReaders, [], 'public sources must not read or serialize pillarsPct (tiers only):\n' + pctReaders.join('\n'));

// No public reader of the raw pillar-points field (only pillarsPct, 0-100, may be read)
const readers = PUBLIC_FILES.filter(f => /\.(js)$/.test(f)).filter(f => /defiScore\.breakdown|ds\.breakdown|score\.breakdown/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
assert.deepStrictEqual(readers, [], 'public files must not read defiScore.breakdown: ' + readers.join(', '));
// The scoring engine lives in the private repo alex0xhodler/defi_garden-scoring. It must never be
// tracked here again, and CI logs (public) must not name the model/vendor/provider.
const { execSync } = require('child_process');
const tracked = execSync('git ls-files', { cwd: __dirname, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n');
const engineTracked = tracked.filter(f => /(^|\/)compute-forecasts\.py$/.test(f) || f.startsWith('scoring/'));
assert.deepStrictEqual(engineTracked, [], 'scoring engine must not be tracked in the public repo: ' + engineTracked.join(', '));
const WF_LOG_BAD = /timesfm|google\/|alchemy\.com|per_core_batch|multivariate/i;
const wfBad = [];
fs.readdirSync(path.join(__dirname, '.github/workflows')).filter(f => /\.ya?ml$/.test(f)).forEach(f => {
  fs.readFileSync(path.join(__dirname, '.github/workflows', f), 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(-\s+name:|echo\b)/.test(line) && WF_LOG_BAD.test(line)) wfBad.push(f + ':' + (i + 1) + ' ' + line.trim());
  });
});
assert.deepStrictEqual(wfBad, [], 'public workflow step names/echo lines must not name the model or vendor:\n' + wfBad.join('\n'));
// The public deploy workflow must not name the model at all: the engine's dependencies and
// model live in the private repo behind scoring/run.sh. Any casing, any line.
const WF_SITEMAP = fs.readFileSync(path.join(__dirname, '.github/workflows/sitemap-update.yml'), 'utf8');
const wfModelHits = WF_SITEMAP.split('\n').map((line, i) => (/timesfm/i.test(line) ? 'sitemap-update.yml:' + (i + 1) + ' ' + line.trim() : null)).filter(Boolean);
assert.deepStrictEqual(wfModelHits, [], 'sitemap-update.yml must not name the forecast model (timesfm):\n' + wfModelHits.join('\n'));
console.log('proprietary surface: all assertions passed (' + PUBLIC_FILES.length + ' files)');
