// Owner decision 2026-10-25 ("what, not how"): the DeFi Score is PROPRIETARY.
// Public source files and public serializers must not carry pillar weights/maxima,
// band cutoffs, the model name/vendor or on-chain telemetry specifics.
// (The scoring engine itself is not part of the public surface.)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PUBLIC_FILES = [
  'landing.js', 'stocks.js', 'PoolDetail.js', 'app.js', 'translations.js', 'methodology.html', 'mcp-page.html',
  'generate-landing-pools.js', 'generate-pool-scores-json.js', 'generate-pool-score-pages.js', 'generate-llms.js',
  'generate-stocks-snapshot.js', 'api/mcp.js', 'i18n/pt.js', 'i18n/es.js', 'i18n/static-en-ko.js',
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

// No public reader of the raw pillar-points field (only pillarsPct, 0-100, may be read)
const readers = PUBLIC_FILES.filter(f => /\.(js)$/.test(f)).filter(f => /defiScore\.breakdown|ds\.breakdown|score\.breakdown/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
assert.deepStrictEqual(readers, [], 'public files must not read defiScore.breakdown: ' + readers.join(', '));
console.log('proprietary surface: all assertions passed (' + PUBLIC_FILES.length + ' files)');
