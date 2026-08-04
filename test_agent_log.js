/* Unit tests for edge/agent-log-core.js + edge/agent-log.mjs (backlog 224,
   spec 224). Pure Node, plain lane (no browser-driving test framework
   involved — see run-tests.js's lane classifier), no network, no real
   D1/Wrangler runtime — the Worker itself is exercised with a fake global
   `fetch` (standing in for origin), a fake `ctx.waitUntil` collector, and a
   fake `env.DB` that
   records prepare/bind/run calls, mirroring test_poller.js's "unit-test the
   pure core, then prove the shape against fixtures" approach but extended
   to also load and drive the real Worker module (agent-log.mjs is ESM —
   loaded via a genuine dynamic `import()` of the real file on disk, never a
   copy; see agent-log.mjs's own header comment for why it is `.mjs`).

   Draws its POSITIVE and NEGATIVE path populations from the REAL files on
   disk (pools, tokens, chains, ko, well-known, llms.txt, llms-full.txt,
   openapi.json, tools-json vs. root html/css/js, og images, sitemap xml
   files) — never a hardcoded fixture-only path — so the assertion is about
   the CLASS of file, not a single motivating instance.

   Run: node test_agent_log.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { assert.strictEqual(a, b, msg); passed++; }
function deq(a, b, msg) { assert.deepStrictEqual(a, b, msg); passed++; }

const ROOT = __dirname;
const EDGE_DIR = path.join(ROOT, 'edge');
const core = require(path.join(EDGE_DIR, 'agent-log-core.js'));

// ---------------------------------------------------------------------------
// Disk-walking helpers — the population comes from the real repo tree.
// ---------------------------------------------------------------------------

function listFilesRecursive(dir) {
  let out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listFilesRecursive(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function toRepoPath(absPath) {
  return '/' + path.relative(ROOT, absPath).split(path.sep).join('/');
}

/** Deterministic, evenly-spaced sample of up to n items — never random, so
 * a failure is reproducible. */
function sampleArray(arr, n) {
  if (arr.length <= n) return arr.slice();
  const out = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

// ===========================================================================
// A. classifyRequest() — population tests against the REAL estate on disk.
// ===========================================================================
console.log('A. classifyRequest population — real files on disk');

// --- positives: every real class the agent surface covers ------------------
const poolMdSample = sampleArray(
  fs.readdirSync(path.join(ROOT, 'pools')).filter((f) => f.endsWith('.md')).sort(), 15
).map((f) => '/pools/' + f);
const tokenMdSample = sampleArray(
  fs.readdirSync(path.join(ROOT, 'tokens')).filter((f) => f.endsWith('.md')).sort(), 15
).map((f) => '/tokens/' + f);
const chainMdSample = sampleArray(
  fs.readdirSync(path.join(ROOT, 'chains')).filter((f) => f.endsWith('.md')).sort(), 15
).map((f) => '/chains/' + f);
const koChainMdSample = sampleArray(
  fs.readdirSync(path.join(ROOT, 'ko', 'chains')).filter((f) => f.endsWith('.md')).sort(), 10
).map((f) => '/ko/chains/' + f);
const koTokenMdSample = sampleArray(
  fs.readdirSync(path.join(ROOT, 'ko', 'tokens')).filter((f) => f.endsWith('.md')).sort(), 10
).map((f) => '/ko/tokens/' + f);

const MD_TWIN_POPULATION = [
  ...poolMdSample, ...tokenMdSample, ...chainMdSample, ...koChainMdSample, ...koTokenMdSample,
];

ok(MD_TWIN_POPULATION.length >= 50, `sanity: expected >=50 sampled .md twins across pools/tokens/chains/ko, got ${MD_TWIN_POPULATION.length}`);

MD_TWIN_POPULATION.forEach((p) => {
  ok(fs.existsSync(path.join(ROOT, p.replace(/^\//, ''))), `sanity: sampled twin ${p} must be a real file on disk`);
  const result = core.classifyRequest({ pathname: p, accept: 'text/plain' });
  ok(result && result.pathClass === 'md_twin', `${p}: expected pathClass 'md_twin', got ${JSON.stringify(result)}`);
});

eq(core.classifyRequest({ pathname: '/llms.txt', accept: '*/*' }).pathClass, 'llms', '/llms.txt classifies as llms');
eq(core.classifyRequest({ pathname: '/llms-full.txt', accept: '*/*' }).pathClass, 'llms', '/llms-full.txt classifies as llms');
ok(fs.existsSync(path.join(ROOT, 'llms.txt')) && fs.existsSync(path.join(ROOT, 'llms-full.txt')), 'sanity: both llms files exist on disk');

const wellKnownRealFiles = listFilesRecursive(path.join(ROOT, '.well-known')).map(toRepoPath);
ok(wellKnownRealFiles.length >= 10, `sanity: expected >=10 real .well-known files, got ${wellKnownRealFiles.length}`);
wellKnownRealFiles.forEach((p) => {
  const result = core.classifyRequest({ pathname: p, accept: 'application/json' });
  ok(result && result.pathClass === 'well_known', `${p}: expected pathClass 'well_known', got ${JSON.stringify(result)}`);
});
// Precedence proof: a .well-known/**/*.md file classifies well_known, NOT
// md_twin — well_known is checked before md_twin in classifyRequest().
const wellKnownMdSample = wellKnownRealFiles.find((p) => p.endsWith('.md'));
ok(wellKnownMdSample, 'sanity: expected at least one real .well-known/**/*.md file (agent-skills SKILL.md) to prove the precedence rule');
eq(core.classifyRequest({ pathname: wellKnownMdSample, accept: 'text/plain' }).pathClass, 'well_known',
  `${wellKnownMdSample}: a .well-known file that happens to end .md must classify well_known (precedence), not md_twin`);

ok(fs.existsSync(path.join(ROOT, 'openapi.json')), 'sanity: openapi.json exists on disk');
eq(core.classifyRequest({ pathname: '/openapi.json', accept: 'application/json' }).pathClass, 'well_known', '/openapi.json classifies well_known');

const toolsJsonFiles = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => f.endsWith('.json'));
ok(toolsJsonFiles.length >= 2, `sanity: expected >=2 tools/*.json files, got ${toolsJsonFiles.length}`);
toolsJsonFiles.forEach((f) => {
  eq(core.classifyRequest({ pathname: '/tools/' + f, accept: 'application/json' }).pathClass, 'well_known', `/tools/${f} classifies well_known`);
});

eq(core.classifyRequest({ pathname: '/api/whatever', accept: '*/*' }).pathClass, 'api', '/api/* classifies api (future, item 227)');
eq(core.classifyRequest({ pathname: '/api', accept: '*/*' }).pathClass, 'api', 'bare /api classifies api');

// markdown negotiation — Accept: text/markdown on a path with no more
// specific match, e.g. the bare root or a page URL with no .md extension.
eq(core.classifyRequest({ pathname: '/', accept: 'text/markdown' }).pathClass, 'markdown_negotiation', '/ + Accept:text/markdown -> markdown_negotiation');
eq(core.classifyRequest({ pathname: '/tokens/usdc', accept: 'text/html, text/markdown;q=0.9' }).pathClass, 'markdown_negotiation',
  'a non-.md page path + an Accept header that MENTIONS markdown -> markdown_negotiation');
eq(core.classifyRequest({ pathname: '/', accept: 'TEXT/MARKDOWN' }).pathClass, 'markdown_negotiation', 'Accept matching is case-insensitive');
// Precedence proof: a REAL .md twin path with Accept:text/markdown is still
// md_twin, never double-classified as markdown_negotiation.
eq(core.classifyRequest({ pathname: '/tokens/usdc.md', accept: 'text/markdown' }).pathClass, 'md_twin',
  'a literal .md URL requested WITH a markdown Accept header is still md_twin (path-specific classes outrank the generic Accept rule)');

// query strings must not defeat classification
eq(core.classifyRequest({ pathname: '/llms.txt?x=1', accept: '*/*' }).pathClass, 'llms', 'a stray query string on the pathname must not defeat classification');
eq(core.classifyRequest({ pathname: '/tokens/usdc.md#section', accept: '*/*' }).pathClass, 'md_twin', 'a stray fragment must not defeat classification');

// --- negatives: real non-agent files, a population, not one instance -------
const ROOT_ASSET_NEGATIVES = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name)
  .filter((name) => /\.(html|css|js)$/.test(name))
  .filter((name) => !name.startsWith('test_')); // dev-tooling noise; not the point of this population
ok(ROOT_ASSET_NEGATIVES.length >= 15, `sanity: expected >=15 root html/css/js files, got ${ROOT_ASSET_NEGATIVES.length}`);

const ogPngSample = sampleArray(
  listFilesRecursive(path.join(ROOT, 'og')).filter((f) => f.endsWith('.png')).map(toRepoPath), 10
);
ok(ogPngSample.length >= 5, `sanity: expected >=5 sampled og/**/*.png files, got ${ogPngSample.length}`);

const sitemapSample = sampleArray(
  fs.readdirSync(ROOT).filter((f) => /^sitemap.*\.xml$/.test(f)), 10
).map((f) => '/' + f);
ok(sitemapSample.length >= 5, `sanity: expected >=5 sampled sitemap*.xml files, got ${sitemapSample.length}`);

const NEGATIVE_POPULATION = [
  ...ROOT_ASSET_NEGATIVES.map((f) => '/' + f),
  ...ogPngSample,
  ...sitemapSample,
  '/tools/test-agent-tools.js', // real, non-JSON tools/ file — precision control against the well_known glob
  '/tokens/usdc.html', '/tokens/index.html', '/chains/index.html',
  '/pools/0004a5d4-ce6d-43ba-ab8a-64ff555b3853.json', // the .md twin's OWN .json sibling — not a twin itself
];
ok(NEGATIVE_POPULATION.length >= 30, `sanity: expected >=30 negative-population entries, got ${NEGATIVE_POPULATION.length}`);

NEGATIVE_POPULATION.forEach((p) => {
  ok(fs.existsSync(path.join(ROOT, p.replace(/^\//, ''))), `sanity: negative-population entry ${p} must be a real file on disk`);
  const result = core.classifyRequest({ pathname: p, accept: 'text/html,application/xhtml+xml' });
  eq(result, null, `${p}: expected null (not agent surface), got ${JSON.stringify(result)}`);
});

console.log(`  classified ${MD_TWIN_POPULATION.length} md twins, ${wellKnownRealFiles.length} .well-known files, ${NEGATIVE_POPULATION.length} negatives — all correct`);

// ===========================================================================
// B. uaFamily() — every table entry, plus the 'other' fallback.
// ===========================================================================
console.log('\nB. uaFamily table coverage');

ok(Array.isArray(core.UA_FAMILIES) && core.UA_FAMILIES.length >= 15, 'sanity: UA_FAMILIES is a real, non-trivial table');
core.UA_FAMILIES.forEach(({ token, family }) => {
  const ua = `Mozilla/5.0 (compatible; ${token}/1.0; +https://example.com/bot)`;
  eq(core.uaFamily(ua), family, `UA containing "${token}" -> family "${family}"`);
  // case-insensitivity
  eq(core.uaFamily(ua.toUpperCase()), family, `UA containing "${token}" (uppercased) -> family "${family}" (case-insensitive match)`);
});
eq(core.uaFamily('SomeTotallyUnknownCrawler/3.1'), core.OTHER_FAMILY, 'unmatched UA -> other');
eq(core.uaFamily(''), core.OTHER_FAMILY, 'empty UA -> other');
eq(core.uaFamily(null), core.OTHER_FAMILY, 'null UA -> other');
eq(core.uaFamily(undefined), core.OTHER_FAMILY, 'undefined UA -> other');
// no family token is a substring of another (documented invariant in the core file's comment) — verify it.
core.UA_FAMILIES.forEach(({ token: tokenA }) => {
  core.UA_FAMILIES.forEach(({ token: tokenB }) => {
    if (tokenA === tokenB) return;
    ok(tokenA.toLowerCase().indexOf(tokenB.toLowerCase()) === -1,
      `UA_FAMILIES invariant violated: "${tokenB}" is a substring of "${tokenA}" — list order would silently matter`);
  });
});

// ===========================================================================
// C. buildRow() — truncation + null-safety at the boundary.
// ===========================================================================
console.log('\nC. buildRow truncation + null-safety');

const longUa = 'X'.repeat(core.MAX_UA_LEN + 500);
const longAccept = 'text/markdown;' + 'y'.repeat(core.MAX_ACCEPT_LEN + 500);
const longReferer = 'https://example.com/' + 'z'.repeat(core.MAX_REFERER_LEN + 500);
const longPath = '/' + 'p'.repeat(core.MAX_PATH_LEN + 500) + '.md';

const truncRow = core.buildRow({
  tsSeconds: 1_800_000_000,
  pathname: longPath,
  userAgent: longUa,
  accept: longAccept,
  referer: longReferer,
  status: 200,
  botScore: 42,
});
eq(truncRow.ua.length, core.MAX_UA_LEN, 'ua truncated to MAX_UA_LEN');
eq(truncRow.accept.length, core.MAX_ACCEPT_LEN, 'accept truncated to MAX_ACCEPT_LEN');
eq(truncRow.referer.length, core.MAX_REFERER_LEN, 'referer truncated to MAX_REFERER_LEN');
eq(truncRow.path.length, core.MAX_PATH_LEN, 'path truncated to MAX_PATH_LEN');
eq(truncRow.path_class, 'md_twin', 'a long-but-.md-suffixed path still classifies md_twin even after accounting for truncation logic (classification happens on the untruncated path)');

const nullSafeRow = core.buildRow({ tsSeconds: 1_800_000_000, pathname: '/style.css' });
eq(nullSafeRow.ua, '', 'missing userAgent -> empty string, never throws');
eq(nullSafeRow.ua_family, core.OTHER_FAMILY, 'missing userAgent -> family other');
eq(nullSafeRow.accept, '', 'missing accept -> empty string');
eq(nullSafeRow.referer, null, 'missing referer -> null, not empty string (absence is a distinct fact)');
eq(nullSafeRow.status, null, 'missing status -> null, not 0');
eq(nullSafeRow.bot_score, null, 'missing bot_score -> null, not 0');
eq(nullSafeRow.path_class, null, 'a non-agent-surface path -> path_class null');

eq(core.buildRow({ pathname: '/x', status: 'not-a-number' }).status, null, 'non-numeric status -> null, not NaN');
eq(core.buildRow({ pathname: '/x', status: NaN }).status, null, 'NaN status -> null');
eq(core.buildRow({ pathname: '/x', botScore: 'nope' }).bot_score, null, 'non-numeric botScore -> null');
eq(core.buildRow({ pathname: '/x', botScore: 0 }).bot_score, 0, 'botScore of literal 0 is preserved (0 is a real, valid score, not absence)');
eq(core.buildRow({ pathname: '/x', status: 0 }).status, 0, 'status of literal 0 is preserved and not coerced to null');
eq(core.buildRow({ tsSeconds: 'nope', pathname: '/x' }).ts, 0, 'non-numeric tsSeconds -> 0, never throws/NaN');

// ===========================================================================
// D. RETENTION_DAYS / retentionCutoff — mirrors poller-core's shape.
// ===========================================================================
console.log('\nD. retention cutoff');
eq(core.retentionCutoff(1_000_000, 1), 1_000_000 - 86400, '1-day cutoff');
eq(core.retentionCutoff(1_000_000), 1_000_000 - core.RETENTION_DAYS * 86400, 'default cutoff uses RETENTION_DAYS');

// ===========================================================================
// E. DEPLOY.md mirrors DAILY_READS_QUERY verbatim — located STRUCTURALLY.
//
// Verifier round 1 (see product-loop-kit/specs/224-notes.md) found that
// edge/DEPLOY.md stated this query TWICE — once as an illustrative fenced
// ```sql block, and once inside the copy-pasteable `wrangler d1 execute
// --command "..."` a human will actually run against prod D1 — and the old
// assertion (`deployMd.includes(core.DAILY_READS_QUERY)`) was satisfied by
// either copy alone, so the runnable one could drift undetected.
//
// The round-1 FIX still had a hole: it found "every occurrence" by matching
// a SIGNATURE built from the query's OWN prefix text (everything up to
// `ORDER BY`). That signature IS ~90% of the query — SELECT, the column
// list, `FROM agent_reads`, `GROUP BY` — so drift landing inside the prefix
// (rather than the `ORDER BY ...;` tail) made the occurrence simply STOP
// MATCHING the scan. The count silently dropped, the surviving copy (if
// any) still passed, and the test exited 0. Verifier round 2 demonstrated
// this three ways (`FROM agent_reads` -> `FROM agent_read`, `SELECT` ->
// `select`, `ua_family` -> `ua_famly`), all silently green. This is the
// same class of bug as round 1: a mechanism where the comparison target's
// OWN content decides whether it is even considered a candidate.
//
// The fix has two parts, matching edge/DEPLOY.md §6's move 1 (state the
// query once, not twice) and move 2 (locate it structurally):
//   1. edge/DEPLOY.md now states the query exactly ONCE, inside a region
//      wrapped in `<!-- DAILY_READS_QUERY:begin -->` / `:end` HTML-comment
//      markers.
//   2. This section finds every marked region by the MARKERS ALONE — fixed
//      strings, independent of whatever the query's own text has drifted
//      to — so ANY corruption inside a region now fails byte-equality
//      instead of vanishing from the scan. No content-based filter decides
//      which regions count.
// ===========================================================================
console.log('\nE. DEPLOY.md <-> DAILY_READS_QUERY parity (structural, marker-based)');
const deployMd = fs.readFileSync(path.join(EDGE_DIR, 'DEPLOY.md'), 'utf8');
ok(core.DAILY_READS_QUERY.length > 20, 'sanity: DAILY_READS_QUERY is non-trivial');

// The pinned expected number of marked copies in edge/DEPLOY.md. Not `>= 1`
// — round 2's whole finding was that a `>= 1` (or "at least one exists")
// check cannot see a count silently drop from 2 to 1. A documented exact
// constant makes both a shortfall (a copy quietly deleted) and a surplus
// (an extra copy carelessly added) into failures.
const EXPECTED_DEPLOY_MD_QUERY_COPIES = 1;

const BEGIN_MARKER = '<!-- DAILY_READS_QUERY:begin -->';
const END_MARKER = '<!-- DAILY_READS_QUERY:end -->';

// Markers are recognized only when a line's content, trimmed, is EXACTLY
// the marker — never a substring match against the whole file. This is
// deliberate: the prose in edge/DEPLOY.md's §6 mentions the marker text
// itself (inside backticks, as documentation of the convention), and a
// substring scan over the raw file would miscount that prose mention as a
// real marker. Requiring the marker to be a line's sole content is also
// exactly the documented convention ("HTML comments on their own lines").
function markerLineIndices(text, marker) {
  const out = [];
  let cursor = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === marker) out.push(cursor + line.indexOf(marker));
    cursor += line.length + 1; // +1 for the '\n' split() consumed
  }
  return out;
}

const beginIdxs = markerLineIndices(deployMd, BEGIN_MARKER);
const endIdxs = markerLineIndices(deployMd, END_MARKER);

// Marker well-formedness: equal begin/end counts, no nesting, each end
// strictly after its matching begin. A malformed pair (e.g. a deleted
// `:begin` with its `:end` left behind) must FAIL loudly here rather than
// silently produce zero regions and let the count check below read as "the
// runbook just doesn't have the query" instead of "the markup is broken".
eq(beginIdxs.length, endIdxs.length,
  `edge/DEPLOY.md has ${beginIdxs.length} "${BEGIN_MARKER}" marker(s) but ${endIdxs.length} "${END_MARKER}" marker(s) — ` +
  `an unpaired/malformed marker must fail here, not silently yield zero regions.`);

const markerTokens = [
  ...beginIdxs.map((pos) => ({ pos, type: 'begin' })),
  ...endIdxs.map((pos) => ({ pos, type: 'end' })),
].sort((a, b) => a.pos - b.pos);

const regions = []; // { beginStart, beginEnd, endStart, endEnd }
let depth = 0;
let openBegin = null;
let malformed = false;
for (const tok of markerTokens) {
  if (tok.type === 'begin') {
    if (depth !== 0) { malformed = true; break; } // nested begin before a prior end
    depth = 1;
    openBegin = tok.pos;
  } else {
    if (depth !== 1) { malformed = true; break; } // end with no open begin
    depth = 0;
    regions.push({
      beginStart: openBegin,
      beginEnd: openBegin + BEGIN_MARKER.length,
      endStart: tok.pos,
      endEnd: tok.pos + END_MARKER.length,
    });
    openBegin = null;
  }
}
if (depth !== 0) malformed = true; // trailing unmatched begin
ok(!malformed,
  `edge/DEPLOY.md's DAILY_READS_QUERY markers are malformed or nested (begin positions: ${JSON.stringify(beginIdxs)}, ` +
  `end positions: ${JSON.stringify(endIdxs)}) — begin/end must alternate cleanly with each end after its begin.`);

eq(regions.length, EXPECTED_DEPLOY_MD_QUERY_COPIES,
  `edge/DEPLOY.md must state the daily-reads query in exactly ${EXPECTED_DEPLOY_MD_QUERY_COPIES} marked DAILY_READS_QUERY region(s); ` +
  `found ${regions.length} (${regions.length < EXPECTED_DEPLOY_MD_QUERY_COPIES ? 'shortfall' : 'surplus'} of ` +
  `${Math.abs(regions.length - EXPECTED_DEPLOY_MD_QUERY_COPIES)}) — a copy was silently deleted or an extra one was added.`);

// Runnable command's wrapper — the prefix/suffix a human's shell command is
// actually built from. Asserted explicitly (not just stripped) so drift in
// the WRAPPER itself (e.g. --remote -> --local) is also caught, not
// silently discarded along with the fence markers.
const WRAPPER_PREFIX = 'wrangler d1 execute defi-garden-history --remote --command "';

regions.forEach((region, i) => {
  const between = deployMd.slice(region.beginEnd, region.endStart);
  const fenceMatch = between.match(/```\r?\n([\s\S]*?)\r?\n```/);
  ok(fenceMatch,
    `edge/DEPLOY.md region #${i + 1} (between the markers at offsets ${region.beginStart}-${region.endEnd}) does not contain a ` +
    `single fenced code block as expected. Raw contents between markers: ${JSON.stringify(between)}`);
  const fenced = fenceMatch[1];
  ok(fenced.startsWith(WRAPPER_PREFIX),
    `edge/DEPLOY.md region #${i + 1}'s fenced block must start with the documented wrapper prefix ${JSON.stringify(WRAPPER_PREFIX)}; ` +
    `got: ${JSON.stringify(fenced.slice(0, WRAPPER_PREFIX.length + 30))}`);
  ok(fenced.endsWith('"'),
    `edge/DEPLOY.md region #${i + 1}'s fenced block must end with the closing double-quote of --command "..."; ` +
    `got (last 10 chars): ${JSON.stringify(fenced.slice(-10))}`);
  const queryPart = fenced.slice(WRAPPER_PREFIX.length, fenced.length - 1);
  eq(queryPart, core.DAILY_READS_QUERY,
    `edge/DEPLOY.md region #${i + 1}'s marked copy of the daily-reads query is NOT byte-identical to agent-log-core.js's DAILY_READS_QUERY.\n` +
    `  --- edge/DEPLOY.md region #${i + 1} ---\n${JSON.stringify(queryPart)}\n` +
    `  --- agent-log-core.js DAILY_READS_QUERY ---\n${JSON.stringify(core.DAILY_READS_QUERY)}`);
});

// Anti-smuggling check: a future editor could add a SECOND, unmarked copy
// of the query elsewhere in this file, which the marker-based scan above
// would never see (it only looks inside marked regions). This predicate
// flags any line OUTSIDE a marked region that matches /FROM\s+agent_reads/i
// — chosen because it is the most content-specific fragment of this query
// that a re-paste is unlikely to avoid — UNLESS that exact line is on the
// allowlist below. edge/DEPLOY.md legitimately contains two OTHER,
// genuinely different queries that also mention `agent_reads` in a FROM
// clause (the §5 verification SELECT and the Territory-notes prune
// DELETE); they are allowlisted by their exact, current line text, not by
// a fuzzy pattern, so the allowlist itself must be updated (a visible diff)
// if either line's text ever changes.
//
// What this DOES catch: a smuggled copy of THIS query dropped outside the
// markers, written with a literal "FROM agent_reads" (any case/whitespace
// around it). What this does NOT catch: a copy that avoids that literal
// substring (e.g. `FROM  agent_reads` — no, that matches `\s+`; but e.g. a
// copy built via string concatenation, a copy of a DIFFERENT-cased table
// alias, or one added to a file other than edge/DEPLOY.md). The marked
// region is the contract this test enforces; it is a documented convention
// this test polices, not a proof no other copy of this text could ever
// exist anywhere.
const DEPLOY_MD_ALLOWED_AGENT_READS_LINES = [
  '  --command "SELECT ts, path, ua_family, path_class FROM agent_reads ORDER BY ts DESC LIMIT 5;"', // §5 verify SELECT
  '    --command "DELETE FROM agent_reads WHERE ts < strftime(\'%s\',\'now\') - 30*86400;"', // Territory-notes prune DELETE
];

const deployMdLines = deployMd.split('\n');
let lineCursor = 0;
deployMdLines.forEach((line, idx) => {
  const lineStart = lineCursor;
  const lineEnd = lineCursor + line.length;
  lineCursor = lineEnd + 1; // account for the '\n' split() consumed
  const insideMarkedRegion = regions.some((r) => lineStart >= r.beginStart && lineEnd <= r.endEnd);
  if (insideMarkedRegion) return;
  if (!/FROM\s+agent_reads/i.test(line)) return;
  ok(DEPLOY_MD_ALLOWED_AGENT_READS_LINES.includes(line),
    `edge/DEPLOY.md line ${idx + 1} contains "FROM agent_reads" OUTSIDE any marked DAILY_READS_QUERY region and is not on the ` +
    `documented allowlist — this looks like a smuggled, unmarked second copy of the daily-reads query.\n  line: ${JSON.stringify(line)}`);
});

console.log(`  found ${regions.length} marked DAILY_READS_QUERY region(s) in edge/DEPLOY.md, all byte-identical to DAILY_READS_QUERY; no unmarked copies found`);

// ===========================================================================
// F. The Worker itself — real dynamic import(), fake fetch/ctx/env.DB.
// ===========================================================================

function makeFakeDB(behavior) {
  behavior = behavior || {};
  const calls = [];
  const db = {
    prepare(sql) {
      if (behavior.prepareThrows) throw new Error('D1 outage: prepare() failed');
      return {
        bind(...args) {
          if (behavior.bindThrows) throw new Error('D1 outage: bind() failed');
          return {
            run() {
              if (behavior.runRejects) return Promise.reject(new Error('D1 outage: run() rejected'));
              calls.push({ sql, args });
              return Promise.resolve({ success: true, meta: {} });
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

function makeFakeCtx() {
  const waited = [];
  return { ctx: { waitUntil(p) { waited.push(p); } }, waited };
}

function makeRequest(url, opts) {
  opts = opts || {};
  return { url, headers: new Headers(opts.headers || {}), cf: opts.cf };
}

async function main() {
  const workerUrl = pathToFileURL(path.join(EDGE_DIR, 'agent-log.mjs')).href;
  const workerModule = await import(workerUrl);
  const worker = workerModule.default;
  ok(worker && typeof worker.fetch === 'function', 'sanity: the real edge/agent-log.mjs exports a default object with a fetch() method');

  const originalFetch = global.fetch;
  function setMockFetch(fn) { global.fetch = fn; }
  function restoreFetch() { global.fetch = originalFetch; }

  console.log('\nF1. agent-surface request -> exactly one row, correct fields');
  {
    setMockFetch(async () => new Response('llms body', { status: 200, headers: { 'content-type': 'text/plain' } }));
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const UA = 'Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)';
    const ACCEPT = 'text/plain,*/*';
    const REFERER = 'https://chat.openai.com/';
    const before = Math.floor(Date.now() / 1000);
    const req = makeRequest('https://www.defi.garden/llms.txt', {
      headers: { accept: ACCEPT, 'user-agent': UA, referer: REFERER },
      cf: { botManagement: { score: 5 } },
    });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    const after = Math.floor(Date.now() / 1000);

    eq(res.status, 200, 'response status passed through');
    eq(calls.length, 1, 'exactly one row written for an agent-surface request');
    const [ts, p, ua, uaFamily, accept, referer, status, botScore, pathClass] = calls[0].args;
    ok(ts >= before && ts <= after, `ts (${ts}) must be a real "now" timestamp, within [${before}, ${after}]`);
    eq(p, '/llms.txt', 'path bound correctly');
    eq(ua, UA, 'ua bound correctly');
    eq(uaFamily, 'gptbot', 'ua_family bound correctly');
    eq(accept, ACCEPT, 'accept bound correctly');
    eq(referer, REFERER, 'referer bound correctly');
    eq(status, 200, 'status bound correctly (from the real origin response)');
    eq(botScore, 5, 'bot_score bound correctly (from request.cf.botManagement.score)');
    eq(pathClass, 'llms', 'path_class bound correctly');
  }

  console.log('\nF2. non-agent path -> zero rows');
  {
    setMockFetch(async () => new Response('css body', { status: 200, headers: { 'content-type': 'text/css' } }));
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/style.css', { headers: { accept: 'text/css' } });
    const res = await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(res.status, 200, 'non-agent response still passes through with origin status');
    eq(calls.length, 0, 'zero rows written for a non-agent path');
  }

  console.log('\nF3. Accept: text/markdown on a non-md path -> markdown_negotiation row');
  {
    setMockFetch(async () => new Response('home body', { status: 200, headers: {} }));
    const { db, calls } = makeFakeDB();
    const { ctx, waited } = makeFakeCtx();
    const req = makeRequest('https://www.defi.garden/', { headers: { accept: 'text/markdown' } });
    await worker.fetch(req, { DB: db }, ctx);
    await Promise.allSettled(waited);
    eq(calls.length, 1, 'exactly one row for a markdown-negotiated request');
    eq(calls[0].args[8], 'markdown_negotiation', 'path_class recorded as markdown_negotiation');
  }

  console.log('\nF4. byte-parity: same Response instance, body/status/headers unchanged, body still readable after');
  {
    const cases = [
      { pathname: '/home.html', body: fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8'), headers: { 'content-type': 'text/html; charset=utf-8' } },
      { pathname: '/tokens/usdc.md', body: fs.readFileSync(path.join(ROOT, 'tokens', 'usdc.md'), 'utf8'), headers: { 'content-type': 'text/markdown; charset=utf-8' } },
      { pathname: '/llms.txt', body: fs.readFileSync(path.join(ROOT, 'llms.txt'), 'utf8'), headers: { 'content-type': 'text/plain; charset=utf-8' } },
    ];
    for (const c of cases) {
      const mockResponse = new Response(c.body, { status: 200, headers: c.headers });
      setMockFetch(async () => mockResponse);
      const { db } = makeFakeDB();
      const { ctx, waited } = makeFakeCtx();
      const req = makeRequest('https://www.defi.garden' + c.pathname, { headers: { accept: 'text/html' } });
      const res = await worker.fetch(req, { DB: db }, ctx);
      ok(res === mockResponse, `${c.pathname}: the Worker must return the EXACT SAME Response instance the origin fetch produced`);
      eq(res.status, 200, `${c.pathname}: status unchanged`);
      eq(res.headers.get('content-type'), c.headers['content-type'], `${c.pathname}: headers unchanged`);
      const bodyText = await res.text(); // must not throw "body already used" — proves logging never touched the body
      eq(bodyText, c.body, `${c.pathname}: body byte-identical and still readable after the logging path ran`);
      await Promise.allSettled(waited);
    }

    // Binary asset case (og-image.png), compared byte-for-byte via base64.
    const pngBuf = fs.readFileSync(path.join(ROOT, 'og-image.png'));
    const mockPngResponse = new Response(pngBuf, { status: 200, headers: { 'content-type': 'image/png' } });
    setMockFetch(async () => mockPngResponse);
    const { db: pngDb } = makeFakeDB();
    const { ctx: pngCtx, waited: pngWaited } = makeFakeCtx();
    const pngReq = makeRequest('https://www.defi.garden/og-image.png', { headers: { accept: 'image/png,*/*' } });
    const pngRes = await worker.fetch(pngReq, { DB: pngDb }, pngCtx);
    ok(pngRes === mockPngResponse, 'og-image.png: same Response instance returned');
    const pngBytes = Buffer.from(await pngRes.arrayBuffer());
    ok(pngBytes.equals(pngBuf), 'og-image.png: binary body byte-identical and still readable after logging');
    await Promise.allSettled(pngWaited);
  }

  console.log('\nF5. D1 outage scenarios -> response still passes through, no throw escapes');
  {
    const outageScenarios = [
      ['env.DB undefined', { DB: undefined }],
      ['env undefined', undefined],
      ['env.DB.prepare throws', { DB: makeFakeDB({ prepareThrows: true }).db }],
      ['env.DB....bind throws', { DB: makeFakeDB({ bindThrows: true }).db }],
      ['env.DB....run() rejects', { DB: makeFakeDB({ runRejects: true }).db }],
    ];
    for (const [label, env] of outageScenarios) {
      setMockFetch(async () => new Response('ok body', { status: 200, headers: {} }));
      const { ctx, waited } = makeFakeCtx();
      const req = makeRequest('https://www.defi.garden/llms.txt', { headers: { accept: '*/*', 'user-agent': 'GPTBot' } });
      let res, threw = null;
      try {
        res = await worker.fetch(req, env, ctx);
      } catch (err) {
        threw = err;
      }
      ok(!threw, `${label}: worker.fetch must not throw (threw: ${threw && threw.message})`);
      ok(res && res.status === 200, `${label}: response still passes through with origin status 200`);
      await Promise.allSettled(waited.map((p) => Promise.resolve(p).catch(() => {})));
    }

    // ctx missing/broken entirely — must still not throw.
    setMockFetch(async () => new Response('ok body', { status: 200, headers: {} }));
    const req = makeRequest('https://www.defi.garden/llms.txt', { headers: { accept: '*/*' } });
    let threwNoCtx = null;
    let resNoCtx;
    try {
      resNoCtx = await worker.fetch(req, { DB: makeFakeDB().db }, undefined);
    } catch (err) {
      threwNoCtx = err;
    }
    ok(!threwNoCtx, `missing ctx: worker.fetch must not throw (threw: ${threwNoCtx && threwNoCtx.message})`);
    ok(resNoCtx && resNoCtx.status === 200, 'missing ctx: response still passes through');
  }

  console.log('\nF6. a thrown classifier is swallowed too (whole-path robustness, not just D1)');
  {
    const originalClassify = core.classifyRequest;
    core.classifyRequest = () => { throw new Error('classifier exploded'); };
    try {
      setMockFetch(async () => new Response('ok body', { status: 200, headers: {} }));
      const { db } = makeFakeDB();
      const { ctx } = makeFakeCtx();
      const req = makeRequest('https://www.defi.garden/llms.txt', { headers: { accept: '*/*' } });
      let threw = null;
      let res;
      try {
        res = await worker.fetch(req, { DB: db }, ctx);
      } catch (err) {
        threw = err;
      }
      ok(!threw, `thrown classifier: worker.fetch must not throw (threw: ${threw && threw.message})`);
      ok(res && res.status === 200, 'thrown classifier: response still passes through');
    } finally {
      core.classifyRequest = originalClassify; // restore — never leave the shared module instance mutated
    }
  }

  restoreFetch();

  console.log(`\ntest_agent_log.js: ${passed}/${passed} assertions passed`);
}

main().catch((err) => {
  console.error('test_agent_log.js: FAILED');
  console.error(err);
  process.exitCode = 1;
});
