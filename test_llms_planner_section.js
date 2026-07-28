/* Regression tests for spec 168 — the AI-discovery surface must describe the
   Garden Planner, the product's DEFAULT face (CLAUDE.md), not just the
   analytics grid. Before this fix `llms.txt`/`llms-full.txt` contained zero
   mentions of "planner"/"forever number"/"subscription" (spec 168's evidence,
   verified verbatim on live prod 2026-07-28) and the homepage TL;DR read
   verbatim "Main dashboard for discovering DeFi yields across all chains and
   protocols." — describing only the analytics app, never the planner.

   Covers:
   (1) committed llms.txt / llms-full.txt contain a `## Garden Planner`
       section with a `TL;DR:` line; llms-full.txt also names the three
       archetypes (GROWTH, TARGET, SUBSCRIPTION) as literal text.
   (2) llms.txt's case-insensitive `/planner|forever number|subscription/g`
       match count is >= 3 (was 0).
   (3) the committed homepage TL;DR no longer equals the old verbatim string
       and does mention the planner.
   (4) router-param membership for every URL inside the new section, parsed
       LIVE out of home.html's ANALYTICS_PARAMS/PLANNER_PARAMS (never a second
       hardcoded copy — mirrors test_llms_link_integrity.js:194-233).
   (5) plannerRate() unit tests: median over the FULL rail-passing set (not
       top-15); the 353114.2% APY / $576,877 TVL pool from 159's evidence is
       excluded; an anomalous-APY + huge-TVL pool is excluded too (proves the
       APY rail is load-bearing, not just the TVL floor); empty/no-eligible
       input -> null.
   (6) empty branch: buildPlannerSection(meta, null) has no digit-bearing rate
       line and none of undefined/NaN/$0, while still naming all three
       archetypes and plan.html.
   (7) ban-list: neither branch of the rendered section contains "save up",
       "afford", or "budget" (case-insensitive), and neither branch asserts
       the subscription card is available today.

   Method trap (carried from 159/166's Territory notes, repeated in 168's own
   Territory notes): `data/pools-snapshot.json` has NO `apy` field (its keys
   are `apyBase`/`apyReward`/`apyMean30d`) — a fixture written against
   snapshot shape would make `plannerRate()` process an empty set and every
   assertion here would pass VACUOUSLY. Fixtures below use the LIVE-payload
   shape (a real `apy` field), which is what generate-llms.js actually reads.

   Run: node test_llms_planner_section.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  isRailPassing,
  plannerRate,
  buildPlannerSection,
  MIN_TVL_USD,
  APY_SANITY_LIMIT,
  formatTvlFloor,
} = require('./generate-llms.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('llms.txt / llms-full.txt Garden Planner section — 168');

const BASE = 'https://www.defi.garden';
const META = { baseUrl: BASE, updatedAt: '2026-07-28T00:00:00.000Z' };

const OLD_HOMEPAGE_TLDR = 'Main dashboard for discovering DeFi yields across all chains and protocols.';

// --- Committed-artifact leg -------------------------------------------------
const LLMS_PATH = path.join(__dirname, 'llms.txt');
const LLMS_FULL_PATH = path.join(__dirname, 'llms-full.txt');
const llmsContent = fs.readFileSync(LLMS_PATH, 'utf8');
const llmsFullContent = fs.readFileSync(LLMS_FULL_PATH, 'utf8');

test('committed llms.txt contains a "## Garden Planner" section with a TL;DR: line', () => {
  const m = llmsContent.match(/^## Garden Planner\n(TL;DR:.*)$/m);
  assert.ok(m, 'expected a "## Garden Planner" heading followed by a TL;DR: line in llms.txt');
});

test('committed llms-full.txt contains the same section AND the three archetype literals', () => {
  const m = llmsFullContent.match(/^## Garden Planner\n(TL;DR:.*)$/m);
  assert.ok(m, 'expected a "## Garden Planner" heading followed by a TL;DR: line in llms-full.txt');
  ['GROWTH', 'TARGET', 'SUBSCRIPTION'].forEach(literal => {
    assert.ok(llmsFullContent.includes(literal), `expected literal "${literal}" in llms-full.txt`);
  });
});

test('committed llms.txt case-insensitive planner/forever-number/subscription match count >= 3 (was 0)', () => {
  const matches = llmsContent.match(/planner|forever number|subscription/gi) || [];
  assert.ok(matches.length >= 3, `expected >= 3 matches, found ${matches.length}`);
});

test('committed homepage TL;DR no longer equals the old verbatim string and mentions the planner', () => {
  const homepageBlock = llmsContent.split('## Homepage')[1].split(/\n## /)[0];
  const tldrLine = homepageBlock.match(/^TL;DR:.*$/m)[0];
  assert.notStrictEqual(tldrLine, `TL;DR: ${OLD_HOMEPAGE_TLDR}`, 'homepage TL;DR must no longer be the old verbatim string');
  assert.ok(/planner/i.test(tldrLine), 'homepage TL;DR must mention the planner');
});

// --- Router-param membership: parsed live out of home.html (never a second
// hardcoded copy) — mirrors test_llms_link_integrity.js:194-233. -----------
function parseParamArray(html, varName) {
  const re = new RegExp(`var\\s+${varName}\\s*=\\s*\\[([^\\]]*)\\]`);
  const m = html.match(re);
  if (!m) throw new Error(`could not find "var ${varName} = [...]" in home.html`);
  const items = m[1].match(/'([^']*)'|"([^"]*)"/g) || [];
  return items.map(s => s.slice(1, -1));
}

const homeHtml = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
const ANALYTICS_PARAMS = parseParamArray(homeHtml, 'ANALYTICS_PARAMS');
const PLANNER_PARAMS = parseParamArray(homeHtml, 'PLANNER_PARAMS');
const ALLOWED_PARAMS = new Set([...ANALYTICS_PARAMS, ...PLANNER_PARAMS, 'lang']);

function extractSection(content, heading) {
  const startMarker = `## ${heading}\n`;
  const start = content.indexOf(startMarker);
  if (start === -1) throw new Error(`could not find "## ${heading}" section`);
  const bodyStart = start + startMarker.length;
  const nextHeading = content.indexOf('\n## ', bodyStart);
  return nextHeading === -1 ? content.slice(bodyStart) : content.slice(bodyStart, nextHeading);
}

function extractQueryKeys(content) {
  const keys = new Set();
  const re = /[?&]([A-Za-z0-9_]+)=/g;
  let m;
  while ((m = re.exec(content))) keys.add(m[1]);
  return keys;
}

test('llms.txt Garden Planner section: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}', () => {
  const section = extractSection(llmsContent, 'Garden Planner');
  const keys = extractQueryKeys(section);
  assert.ok(keys.size > 0, 'expected at least one query param in the section (e.g. ?preset=)');
  const unknown = [...keys].filter(k => !ALLOWED_PARAMS.has(k));
  assert.deepStrictEqual(unknown, [], `Garden Planner section in llms.txt emits unrouted param(s): ${unknown.join(', ')}`);
});

test('llms-full.txt Garden Planner section: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}', () => {
  const section = extractSection(llmsFullContent, 'Garden Planner');
  const keys = extractQueryKeys(section);
  assert.ok(keys.size > 0, 'expected at least one query param in the section (e.g. ?preset=)');
  const unknown = [...keys].filter(k => !ALLOWED_PARAMS.has(k));
  assert.deepStrictEqual(unknown, [], `Garden Planner section in llms-full.txt emits unrouted param(s): ${unknown.join(', ')}`);
});

test('sanity: "preset" is actually a member of PLANNER_PARAMS (parse sanity)', () => {
  assert.ok(PLANNER_PARAMS.includes('preset'), 'expected "preset" in PLANNER_PARAMS');
});

// --- Router-truth regression guard (added after operator review, 2026-07-28):
// the copy must not claim bare "/" IS the planner. home.html's IA router
// (`window.__APP_MODE`) resolves bare "/" (no analytics param, no planner
// param, not /plan.html) to `'landing'` — a search-first landing surface
// (landing.js) that LINKS OUT to /plan.html, it is not itself the planner.
// Pin the truth to the router's own source, never a second hardcoded copy of
// the mode logic (same discipline as parseParamArray above). -------------
test('home.html router: bare "/" fallback mode is still "landing" (pins the truth this copy depends on)', () => {
  const re = /window\.__APP_MODE\s*=\s*needsAnalytics\s*\?\s*'analytics'\s*:\s*\(needsPlanner\s*\?\s*'planner'\s*:\s*'(\w+)'\)/;
  const m = homeHtml.match(re);
  assert.ok(m, 'could not find the three-mode "window.__APP_MODE = needsAnalytics ? ... : (needsPlanner ? ... : ...)" assignment in home.html — the router shape changed, review this test');
  assert.strictEqual(
    m[1],
    'landing',
    'home.html\'s bare "/" fallback mode is no longer "landing". If bare "/" is now the planner again, ' +
    'update the Homepage and Garden Planner TL;DR copy in generate-llms.js\'s buildConcise()/buildFull()/' +
    'buildPlannerSection() to say so (they currently describe bare "/" as a search-first landing that ' +
    'routes into the planner, NOT as the planner itself) — then update this assertion.'
  );
});

test('committed llms.txt / llms-full.txt never claim the site root itself is the Garden Planner', () => {
  const claimsRootIsPlanner = /(bare (site )?root|https:\/\/www\.defi\.garden\/)[^\n]{0,60}\b(is|as) the [^\n]{0,20}(Garden )?Planner/i;
  const staleDefaultPhrase = /default experience at the bare/i;
  [['llms.txt', llmsContent], ['llms-full.txt', llmsFullContent]].forEach(([label, content]) => {
    assert.ok(
      !claimsRootIsPlanner.test(content),
      `${label} appears to claim the site root itself is the Garden Planner — bare "/" resolves to ` +
      `'landing' per home.html, not 'planner'`
    );
    assert.ok(
      !staleDefaultPhrase.test(content),
      `${label} contains the stale "default experience at the bare..." phrasing removed after operator review`
    );
  });
});

// --- Directional-claim regression guard (added after operator review #2,
// 2026-07-28): the caveat line comparing a plan's own rate to the published
// market-wide median must NOT assert a direction. `curatePools()`
// (planner.js:604-671) sorts the temperament band APY-descending and takes
// the top 3; `blendedApy()` (planner.js:686-689) medians those — a
// best-in-band selection, not a random/conservative one — so a plan's rate
// is typically HIGHER than this file's market-wide median, not lower, and we
// have not measured a distribution to claim either direction reliably.
// Rendered evidence: /?preset=tomoko showed "Blended APY 5.78%" against a
// 3.3% market-wide median the same day. -------------------------------------
test('committed llms.txt / llms-full.txt: no directional claim ("usually lower/higher", "X than") about a plan\'s own rate vs the published median', () => {
  const directionalClaim = /\bplan'?s?\s+own\s+rate\b[^\n]{0,80}\b(usually\s+(lower|higher)|lower\s+than|higher\s+than)\b/i;
  [['llms.txt', llmsContent], ['llms-full.txt', llmsFullContent]].forEach(([label, content]) => {
    assert.ok(
      !directionalClaim.test(content),
      `${label} asserts a direction (lower/higher) for a plan's own rate vs the published median — ` +
      `curatePools()/blendedApy() select the best-in-band pools per temperament, not a smaller ` +
      `"conservative" set, so the direction is not reliably known and must not be claimed either way`
    );
  });
});

// --- plannerRate() unit tests -----------------------------------------------
test('plannerRate(): median over the FULL rail-passing set, not a top-15 slice', () => {
  const pools = [
    { chain: 'A', project: 'p1', symbol: 'S1', apy: 2, tvlUsd: MIN_TVL_USD },
    { chain: 'B', project: 'p2', symbol: 'S2', apy: 4, tvlUsd: MIN_TVL_USD },
    { chain: 'C', project: 'p3', symbol: 'S3', apy: 6, tvlUsd: MIN_TVL_USD },
    { chain: 'D', project: 'p4', symbol: 'S4', apy: 8, tvlUsd: MIN_TVL_USD },
  ];
  const result = plannerRate(pools);
  assert.ok(result, 'expected a non-null result');
  assert.strictEqual(result.eligibleCount, 4);
  assert.strictEqual(result.medianApy, 5); // (4 + 6) / 2, the middle of ALL 4, not a top-N subset
});

test('plannerRate(): the 353114.2% APY / $576,877 TVL pool (159\'s evidence) is excluded from the median', () => {
  const pools = [
    { chain: 'A', project: 'p1', symbol: 'S1', apy: 3, tvlUsd: MIN_TVL_USD },
    { chain: 'BSC', project: 'zeebu', symbol: 'ZBU', apy: 353114.2, tvlUsd: 576877 },
  ];
  const result = plannerRate(pools);
  assert.ok(result);
  assert.strictEqual(result.eligibleCount, 1, 'the anomalous pool must not count as eligible');
  assert.strictEqual(result.medianApy, 3, 'median must come from the sane pool only');
});

test('plannerRate(): APY rail alone is load-bearing — anomalous APY + HUGE TVL is excluded (TVL floor alone would not catch it)', () => {
  const pools = [
    { chain: 'A', project: 'p1', symbol: 'S1', apy: 3, tvlUsd: MIN_TVL_USD },
    { chain: 'Ethereum', project: 'huge-anomaly', symbol: 'FOO-BAR', apy: 50000, tvlUsd: 500000000 },
  ];
  const result = plannerRate(pools);
  assert.ok(result);
  assert.strictEqual(result.eligibleCount, 1, 'the anomalous-APY pool must not count as eligible despite huge TVL');
  assert.strictEqual(result.medianApy, 3);
});

test('plannerRate(): empty pool array -> null', () => {
  assert.strictEqual(plannerRate([]), null);
});

test('plannerRate(): no eligible pool (all fail the rails) -> null', () => {
  const pools = [
    { chain: 'A', project: 'p1', symbol: 'S1', apy: 3, tvlUsd: MIN_TVL_USD - 1 }, // under TVL floor
    { chain: 'B', project: 'p2', symbol: 'S2', apy: APY_SANITY_LIMIT + 0.01, tvlUsd: MIN_TVL_USD }, // over APY ceiling
  ];
  assert.strictEqual(plannerRate(pools), null);
});

test('plannerRate() reuses isRailPassing() semantics: boundary apy === APY_SANITY_LIMIT is eligible', () => {
  const pools = [{ chain: 'A', project: 'p1', symbol: 'S1', apy: APY_SANITY_LIMIT, tvlUsd: MIN_TVL_USD }];
  assert.ok(isRailPassing(pools[0]));
  const result = plannerRate(pools);
  assert.ok(result);
  assert.strictEqual(result.eligibleCount, 1);
});

// --- buildPlannerSection(): empty branch ------------------------------------
const emptyBranch = buildPlannerSection(META, null, { full: false }).join('\n');
const emptyBranchFull = buildPlannerSection(META, null, { full: true }).join('\n');

test('buildPlannerSection(meta, null): no digit-bearing rate line', () => {
  assert.ok(!/Live blended rate/i.test(emptyBranch), 'empty branch must omit the "Live blended rate" line entirely');
  assert.ok(!/own rate is usually lower/i.test(emptyBranch), 'empty branch must omit the rate-divergence caveat line');
});

test('buildPlannerSection(meta, null): none of undefined/NaN/$0/empty rate placeholder', () => {
  [emptyBranch, emptyBranchFull].forEach(text => {
    assert.ok(!/undefined/i.test(text), 'must not print "undefined"');
    assert.ok(!/NaN/.test(text), 'must not print "NaN"');
    assert.ok(!/\$0\b/.test(text), 'must not print "$0"');
    assert.ok(!/0\.0%/.test(text), 'must not print a zeroed-out "0.0%" placeholder');
  });
});

test('buildPlannerSection(meta, null): still names all three archetypes and plan.html', () => {
  ['GROWTH', 'TARGET', 'SUBSCRIPTION'].forEach(literal => {
    assert.ok(emptyBranch.includes(literal), `expected literal "${literal}" in the empty branch`);
  });
  assert.ok(emptyBranch.includes(`${BASE}/plan.html`), 'expected the plan.html entry URL in the empty branch');
});

// --- buildPlannerSection(): non-empty branch, for symmetry ------------------
const filledBranch = buildPlannerSection(META, { medianApy: 4.2, eligibleCount: 400 }, { full: false }).join('\n');
const filledBranchFull = buildPlannerSection(META, { medianApy: 4.2, eligibleCount: 400 }, { full: true }).join('\n');

test('buildPlannerSection(meta, rate): rate line renders the derived figures, not a hardcoded one', () => {
  assert.ok(filledBranch.includes('4.2%'), 'expected the derived medianApy to render');
  assert.ok(filledBranch.includes('400 pools'), 'expected the derived eligibleCount to render');
  assert.ok(filledBranch.includes(formatTvlFloor(MIN_TVL_USD)), 'TVL floor prose must derive from MIN_TVL_USD, not a re-typed literal');
  assert.ok(filledBranch.includes(`${APY_SANITY_LIMIT}%`), 'APY ceiling prose must derive from APY_SANITY_LIMIT, not a re-typed literal');
});

test('buildPlannerSection(meta, rate): no NaN/undefined even with a real rate', () => {
  [filledBranch, filledBranchFull].forEach(text => {
    assert.ok(!/undefined/i.test(text));
    assert.ok(!/NaN/.test(text));
  });
});

// --- Ban-list + no-fake-availability, both branches -------------------------
[
  ['empty, concise', emptyBranch],
  ['empty, full', emptyBranchFull],
  ['filled, concise', filledBranch],
  ['filled, full', filledBranchFull],
].forEach(([label, text]) => {
  test(`ban-list (${label}): no "save up", "afford", or "budget" (case-insensitive)`, () => {
    assert.ok(!/save up/i.test(text), `"${label}" must not contain "save up"`);
    assert.ok(!/afford/i.test(text), `"${label}" must not contain "afford"`);
    assert.ok(!/budget/i.test(text), `"${label}" must not contain "budget"`);
  });
});

test('subscription card mention (full branch) is early-access/waitlist framed, never asserts availability', () => {
  assert.ok(/waitlist|early-access|early access/i.test(filledBranchFull), 'expected early-access/waitlist framing for the card mention');
  assert.ok(!/the card is (live|available)\b/i.test(filledBranchFull), 'must not assert the card is live/available');
});

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
