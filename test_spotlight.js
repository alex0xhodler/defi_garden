/* Unit + CLI tests for the X-spotlight pack generator (spec 060).
   Mirrors test_token_pages.js/test_og_images.js's style: direct require()
   for pure-function assertions, plus a handful of real subprocess CLI runs
   (test_spotlight.js is the only generator test in this repo that spawns
   the generator as a child process — chosen because 060's acceptance
   criteria are about end-to-end CLI behavior: "produces pack.json + card.png
   for a valid pool" / "produces neither for a disqualified pool" / exit
   codes. A pure require()-only test already caught one real wiring bug in
   this pass (translations.js's flat createTranslationFunction() silently
   returning the literal key 'goalClaude' instead of "Claude Pro" — see
   060-notes.md) but exit-code/file-existence behavior is only observable
   through the real CLI entrypoint.

   Run: node test_spotlight.js */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const gen = require('./generate-spotlight.js');
const { poolTotalApy } = require('./generate-token-pages.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function isPng(buf) {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
// PNG dimensions live in the IHDR chunk, bytes 16-23 (big-endian width/height).
function pngDims(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// --- Fixture -------------------------------------------------------------
// curve-dex: 2 pools, $900M aggregate qualifying TVL — the ceiling.
// whale-protocol: 1 pool, $1B — clears the trust rails on its own but its
//   protocol aggregate EXCEEDS Curve's, so it must never be selectable
//   (the "oversized-protocol" case the spec calls out).
// tiny-scam: 1 pool, 5000% APY — anomalous, must never be selectable.
// tiny-dust: 1 pool, $500K TVL — below the $10M floor, must never be selectable.
// tiny-good: 1 pool, $15M TVL, 9.5% APY, small protocol — the ONLY pool that
//   should ever be auto-picked or accepted via --pool.
// 229: good-1 carries apyMean30d == apyBase (deviation 0) so it clears the
// NEW isRepresentativeRate gate too — every other fixture pool here is
// already excluded by an EARLIER gate (anomalous/below-floor/oversized-
// protocol/Curve-itself), so it never reaches the representativeness check
// and needs no apyMean30d of its own.
const FIXTURE_POOLS = [
  { pool: 'curve-1', project: 'curve-dex', symbol: '3CRV', chain: 'Ethereum', tvlUsd: 500000000, apyBase: 3, apyReward: 0 },
  { pool: 'curve-2', project: 'curve-dex', symbol: 'crvUSD-USDC', chain: 'Ethereum', tvlUsd: 400000000, apyBase: 4, apyReward: 0 },
  { pool: 'whale-1', project: 'whale-protocol', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 1000000000, apyBase: 5, apyReward: 0 },
  { pool: 'scam-1', project: 'tiny-scam', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 20000000, apyBase: 5000, apyReward: 0 },
  { pool: 'dust-1', project: 'tiny-dust', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 500000, apyBase: 8, apyReward: 0 },
  { pool: 'good-1', project: 'tiny-good', symbol: 'USDC', chain: 'Base', tvlUsd: 15000000, apyBase: 9.5, apyReward: 0, apyMean30d: 9.5, count: 42 }
];

const fixturePath = path.join(os.tmpdir(), 'spotlight-test-fixture.json');
fs.writeFileSync(fixturePath, JSON.stringify({ status: 'success', data: FIXTURE_POOLS }));

// ===========================================================================
// Pure-function unit tests (direct require)
// ===========================================================================
console.log('isQualifyingPool / protocolTvlAggregates / isSmallEnoughProtocol — trust rails');
test('anomalous pool never qualifies', () => {
  assert.ok(!gen.isQualifyingPool(FIXTURE_POOLS.find((p) => p.pool === 'scam-1')));
});
test('below-floor pool never qualifies', () => {
  assert.ok(!gen.isQualifyingPool(FIXTURE_POOLS.find((p) => p.pool === 'dust-1')));
});
test('good pool qualifies', () => {
  assert.ok(gen.isQualifyingPool(FIXTURE_POOLS.find((p) => p.pool === 'good-1')));
});
test('Curve itself is never "small enough" (it is the ceiling, not a candidate)', () => {
  const aggregates = gen.protocolTvlAggregates(FIXTURE_POOLS);
  assert.ok(!gen.isSmallEnoughProtocol('curve-dex', aggregates));
});
test('a protocol bigger than Curve is not small enough', () => {
  const aggregates = gen.protocolTvlAggregates(FIXTURE_POOLS);
  assert.strictEqual(aggregates.get('whale-protocol'), 1000000000);
  assert.strictEqual(aggregates.get('curve-dex'), 900000000);
  assert.ok(!gen.isSmallEnoughProtocol('whale-protocol', aggregates));
});
test("a protocol at or below Curve's aggregate is small enough", () => {
  const aggregates = gen.protocolTvlAggregates(FIXTURE_POOLS);
  assert.ok(gen.isSmallEnoughProtocol('tiny-good', aggregates));
});

console.log('pickPool — selection + refusal');
test('auto-pick (no --pool) selects the only qualifying small-protocol pool', () => {
  const picked = gen.pickPool(FIXTURE_POOLS, null);
  assert.strictEqual(picked.pool, 'good-1');
});
test('--pool good-1 is accepted', () => {
  const picked = gen.pickPool(FIXTURE_POOLS, 'good-1');
  assert.strictEqual(picked.pool, 'good-1');
});
test('--pool whale-1 (oversized protocol) throws SpotlightError', () => {
  assert.throws(() => gen.pickPool(FIXTURE_POOLS, 'whale-1'), gen.SpotlightError);
});
test('--pool scam-1 (anomalous) throws SpotlightError', () => {
  assert.throws(() => gen.pickPool(FIXTURE_POOLS, 'scam-1'), gen.SpotlightError);
});
test('--pool curve-1 (Curve itself) throws SpotlightError', () => {
  assert.throws(() => gen.pickPool(FIXTURE_POOLS, 'curve-1'), gen.SpotlightError);
});
test('--pool <unknown id> throws SpotlightError', () => {
  assert.throws(() => gen.pickPool(FIXTURE_POOLS, 'does-not-exist'), gen.SpotlightError);
});

console.log('buildPack — shape + rail-safe fields');
const goodPool = FIXTURE_POOLS.find((p) => p.pool === 'good-1');
const pack = gen.buildPack(goodPool, { goalId: 'claude', lang: 'en' });
test('pack carries protocol/pool identity', () => {
  assert.strictEqual(pack.protocol, 'tiny-good');
  assert.strictEqual(pack.pool, 'good-1');
  assert.strictEqual(pack.chain, 'Base');
  assert.strictEqual(pack.token, 'USDC');
});
test('pack APY/TVL go through formatApy/formatUsd (en-US, never bare toLocaleString)', () => {
  assert.strictEqual(pack.apyStr, '9.50%');
  assert.strictEqual(pack.tvlStr, '$15M');
});
test('pack carries the goal/persona used', () => {
  assert.strictEqual(pack.goal, 'claude');
  assert.strictEqual(pack.goalLabel, 'Claude Pro'); // real translations.js copy, not the raw labelKey
  assert.strictEqual(pack.monthly, 20);
  assert.ok(['stable', 'rwa', 'degen'].includes(pack.persona));
});
test('shareUrl query string matches what decodePlanFromUrl expects (goal/monthly/pace/chain/token)', () => {
  const u = new URL(pack.shareUrl);
  assert.strictEqual(u.searchParams.get('goal'), 'claude');
  assert.strictEqual(u.searchParams.get('monthly'), '20');
  assert.strictEqual(u.searchParams.get('pace'), pack.persona);
  assert.strictEqual(u.searchParams.get('chain'), 'Base');
  assert.strictEqual(u.searchParams.get('token'), 'USDC');
});
test('shareUrl carries attribution src=x_spotlight and a stable per-pool ref (064)', () => {
  const u = new URL(pack.shareUrl);
  assert.strictEqual(u.searchParams.get('src'), 'x_spotlight');
  assert.strictEqual(u.searchParams.get('src'), gen.SPOTLIGHT_SRC);
  assert.strictEqual(u.searchParams.get('ref'), pack.slug);
  assert.strictEqual(u.searchParams.get('ref'), 'tiny-good-usdc-base');
});
test('buildShareUrl is stable/deterministic for the same pool (same ref every call)', () => {
  const u1 = gen.buildShareUrl({ goal: 'claude', monthly: 20, persona: 'stable', chain: 'Base', token: 'USDC', ref: 'tiny-good-usdc-base' });
  const u2 = gen.buildShareUrl({ goal: 'claude', monthly: 20, persona: 'stable', chain: 'Base', token: 'USDC', ref: 'tiny-good-usdc-base' });
  assert.strictEqual(u1, u2);
});
test('tweetDraft references protocol, pool symbol, chain, live APY/TVL, share URL, and an unconfirmed @handle placeholder', () => {
  assert.ok(pack.tweetDraft.includes('Tiny Good'));
  assert.ok(pack.tweetDraft.includes('USDC'));
  assert.ok(pack.tweetDraft.includes('Base'));
  assert.ok(pack.tweetDraft.includes('9.50%'));
  assert.ok(pack.tweetDraft.includes('$15M'));
  assert.ok(pack.tweetDraft.includes(pack.shareUrl));
  assert.ok(pack.tweetDraft.includes('@tiny-good'));
  assert.ok(/confirm/i.test(pack.tweetDraft), 'must flag the handle as unconfirmed, never fabricate it as verified');
});
test('canvaFields is a flat, named-field object', () => {
  ['protocolName', 'poolSymbol', 'chain', 'apy', 'tvl', 'goalLabel', 'shareUrl', 'tweetDraft', 'foreverAmt'].forEach((k) => {
    assert.ok(Object.prototype.hasOwnProperty.call(pack.canvaFields, k), `missing canvaFields.${k}`);
  });
});
test('066 — pack.foreverAmt is the SAME planner.js gp.foreverNumber(monthly, apy) figure, formatUsd-ed', () => {
  const { foreverNumber } = require('./planner.js');
  const { formatUsd } = require('./generate-token-pages.js');
  const expected = formatUsd(foreverNumber(pack.monthly, pack.apy));
  assert.strictEqual(pack.foreverAmtStr, expected);
  assert.strictEqual(pack.canvaFields.foreverAmt, expected);
  assert.strictEqual(typeof pack.foreverAmt, 'number');
});
test('066 — foreverAmtStr is null (never "$Infinity"/NaN) when the pool APY is 0', () => {
  const zeroApyPool = { pool: 'good-1', project: 'tiny-good', symbol: 'USDC', chain: 'Base', tvlUsd: 15000000, apyBase: 0, apyReward: 0 };
  const zeroPack = gen.buildPack(zeroApyPool, { goalId: 'claude', lang: 'en' });
  assert.strictEqual(zeroPack.foreverAmtStr, null);
  assert.strictEqual(zeroPack.canvaFields.foreverAmt, null);
});
test('unrecognized --goal falls back to claude with a warning, never crashes', () => {
  const warnLog = [];
  const origWarn = console.warn;
  console.warn = (msg) => warnLog.push(msg);
  try {
    const fallbackPack = gen.buildPack(goodPool, { goalId: 'not-a-real-goal', lang: 'en' });
    assert.strictEqual(fallbackPack.goal, 'claude');
    assert.ok(warnLog.length > 0, 'expected a fallback warning on stderr/stdout');
  } finally {
    console.warn = origWarn;
  }
});

console.log('renderSpotlightCard — real PNG output');
test('renders a valid 1200x630 PNG', () => {
  const buf = gen.renderSpotlightCard({
    protocolLabel: 'Tiny Good', poolSymbol: 'USDC', chain: 'Base',
    apyStr: '9.50%', tvlStr: '$15M', goalLabelText: 'Claude Pro', monthly: 20
  });
  assert.ok(isPng(buf), 'output is not a PNG');
  const { width, height } = pngDims(buf);
  assert.strictEqual(width, 1200);
  assert.strictEqual(height, 630);
});
test('does not throw on a long protocol label (truncated instead)', () => {
  assert.doesNotThrow(() => gen.renderSpotlightCard({
    protocolLabel: 'A Very Long Protocol Name That Keeps Going', poolSymbol: 'USDC-WETH-DAI', chain: 'Ethereum',
    apyStr: '12.34%', tvlStr: '$1.2B', goalLabelText: 'Claude Pro', monthly: 20
  }));
});

// ===========================================================================
// Cadence / coverage doc (064) — pure-function unit tests
// ===========================================================================
console.log('rankCandidates / buildCadence / renderCadenceMarkdown — cadence doc (064)');
// A second, larger fixture with several qualifying small-protocol pools so
// "next candidates" ranking + exclusion-of-covered has something to rank.
// 229: all three carry apyMean30d == apyBase (deviation 0, so
// rateRepresentative ties at 1 for all three and never perturbs order) and
// an EQUAL tvlUsd ($15M — so smallProtocol also ties across all three,
// same reasoning). With every OTHER signal held equal, storyScore's order
// collapses onto unusualRate's order, which mirrors total-APY order for
// this specific band-homogeneous (all 'rwa') fixture — so the pre-229
// expectation below (['small-a','small-b','small-c']) still holds under
// storyScore ranking, by construction, not by coincidence. The population
// test below (in the "story-worthiness scoring" section) uses a richer,
// signal-heterogeneous fixture to prove storyScore order genuinely diverges
// from APY order in general.
const CADENCE_POOLS = [
  { pool: 'curve-1', project: 'curve-dex', symbol: '3CRV', chain: 'Ethereum', tvlUsd: 500000000, apyBase: 3, apyReward: 0 },
  { pool: 'curve-2', project: 'curve-dex', symbol: 'crvUSD-USDC', chain: 'Ethereum', tvlUsd: 400000000, apyBase: 4, apyReward: 0 },
  { pool: 'small-a', project: 'proto-a', symbol: 'USDC', chain: 'Base', tvlUsd: 15000000, apyBase: 12, apyReward: 0, apyMean30d: 12 },
  { pool: 'small-b', project: 'proto-b', symbol: 'USDT', chain: 'Arbitrum', tvlUsd: 15000000, apyBase: 9, apyReward: 0, apyMean30d: 9 },
  { pool: 'small-c', project: 'proto-c', symbol: 'DAI', chain: 'Optimism', tvlUsd: 15000000, apyBase: 6, apyReward: 0, apyMean30d: 6 },
  { pool: 'dust-1', project: 'tiny-dust', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 500000, apyBase: 8, apyReward: 0 }
];
test('rankCandidates ranks qualifying, small-enough, representative, fundable pools by storyScore descending, excludes Curve/dust (229)', () => {
  const ranked = gen.rankCandidates(CADENCE_POOLS);
  assert.deepStrictEqual(ranked.map((p) => p.pool), ['small-a', 'small-b', 'small-c']);
});
test('buildCadence with no coverage yet returns all candidates as "next", none "covered"', () => {
  const cadence = gen.buildCadence(CADENCE_POOLS, []);
  assert.strictEqual(cadence.covered.length, 0);
  assert.deepStrictEqual(cadence.next.map((c) => c.pool), ['small-a', 'small-b', 'small-c']);
});
test('buildCadence excludes already-covered pools from "next" and echoes them as "covered"', () => {
  const coveredPacks = [{ pool: 'small-a', protocol: 'proto-a', protocolLabel: 'Proto A', poolSymbol: 'USDC', chain: 'Base', slug: 'proto-a-usdc-base', generatedAt: '2026-07-13T00:00:00.000Z' }];
  const cadence = gen.buildCadence(CADENCE_POOLS, coveredPacks);
  assert.strictEqual(cadence.covered.length, 1);
  assert.deepStrictEqual(cadence.next.map((c) => c.pool), ['small-b', 'small-c']);
});
test('buildCadence honors nextN', () => {
  const cadence = gen.buildCadence(CADENCE_POOLS, [], { nextN: 1 });
  assert.deepStrictEqual(cadence.next.map((c) => c.pool), ['small-a']);
});
test('buildCadence is deterministic given the same pool set + coverage', () => {
  const c1 = gen.buildCadence(CADENCE_POOLS, []);
  const c2 = gen.buildCadence(CADENCE_POOLS, []);
  assert.deepStrictEqual(c1, c2);
});
test('renderCadenceMarkdown lists covered + next candidates with pool ids for --pool reuse', () => {
  const cadence = gen.buildCadence(CADENCE_POOLS, [
    { pool: 'small-a', protocol: 'proto-a', protocolLabel: 'Proto A', poolSymbol: 'USDC', chain: 'Base', slug: 'proto-a-usdc-base', generatedAt: '2026-07-13T00:00:00.000Z' }
  ]);
  const md = gen.renderCadenceMarkdown(cadence);
  assert.ok(md.includes('Proto A'), 'covered entry missing');
  assert.ok(md.includes('small-a'), 'covered pool id missing');
  assert.ok(md.includes('--pool small-b'), 'next candidate --pool hint missing');
  assert.ok(!md.includes('--pool small-a'), 'already-covered pool must not reappear in "next"');
});
test('renderCadenceMarkdown handles the empty-coverage / empty-candidates edges without throwing', () => {
  assert.doesNotThrow(() => gen.renderCadenceMarkdown(gen.buildCadence(CADENCE_POOLS, [])));
  assert.doesNotThrow(() => gen.renderCadenceMarkdown(gen.buildCadence([], [])));
});
test('loadCoveredPacks returns [] for a not-yet-existing output directory', () => {
  const missingDir = path.join(os.tmpdir(), 'spotlight-cadence-does-not-exist-' + Date.now());
  assert.deepStrictEqual(gen.loadCoveredPacks(missingDir), []);
});

// ===========================================================================
// Story-worthiness scoring (item 229) — population-level invariants over a
// hand-built, signal-heterogeneous pool set (never a hardcoded pool id in
// the assertions below; every assertion iterates whatever rankCandidates/
// buildStoryContext actually derive from STORY_POOLS at test time).
// ===========================================================================
console.log('storySignals / storyScore / hookAngle / isRepresentativeRate / isFundableForever — item 229');

// Nine INCLUDED candidates, deliberately varied on every signal axis
// (protocol-aggregate TVL, persona band + in-band APY rank, `count`/
// freshness, apyMean30d deviation) so storyScore's order is NOT forced to
// coincide with total-APY order (unlike the CADENCE_POOLS fixture above,
// which was deliberately built the other way for a different, narrower
// test). alpha-proto appears TWICE (p1/p1b) so buildCadence's "at most one
// pool per project" dedupe has something real to dedupe.
// Plus five EXCLUDED pools, one per gate, so every gate's exclusion is
// exercised by population membership rather than assumed:
//   - curve-ctrl:      excluded by isSmallEnoughProtocol (Curve itself)
//   - whale-ctrl:      excluded by isSmallEnoughProtocol (oversized protocol)
//   - scam-ctrl:       excluded by isQualifyingPool (anomalous APY)
//   - dust-ctrl:       excluded by isQualifyingPool (below $10M floor)
//   - concrete-ctrl:   excluded by isRepresentativeRate — POSITIVE CONTROL
//     ONLY, mirroring the 229 spec's motivating measurement (concrete ·
//     SRROYUSDC, 86.51% headline vs a 4.51% apyMean30d live on 2026-08-06).
//     Never used to DEFINE the gate — REPRESENTATIVE_REL/ABS_PP are fixed
//     constants exported above this pool ever existed in this file.
//   - unfundable-ctrl: excluded by isFundableForever (0% effective rate ->
//     foreverNumber is Infinity, not finite) while still passing
//     isRepresentativeRate (0 vs 0 deviation) — isolates this gate alone.
const STORY_POOLS = [
  { pool: 'p1', project: 'alpha-proto', symbol: 'USDC', chain: 'Base', tvlUsd: 12000000, apyBase: 8, apyReward: 0, apyMean30d: 8, count: 5 },
  { pool: 'p1b', project: 'alpha-proto', symbol: 'USDT', chain: 'Optimism', tvlUsd: 13000000, apyBase: 20, apyReward: 0, apyMean30d: 19.5, count: 15 },
  { pool: 'p2', project: 'beta-proto', symbol: 'USDT', chain: 'Arbitrum', tvlUsd: 18000000, apyBase: 15, apyReward: 0, apyMean30d: 14.5, count: 400 },
  { pool: 'p3', project: 'gamma-proto', symbol: 'DAI', chain: 'Optimism', tvlUsd: 55000000, apyBase: 5, apyReward: 0, apyMean30d: 5.1, count: 900 },
  { pool: 'p4', project: 'delta-proto', symbol: 'USDC', chain: 'Polygon', tvlUsd: 60000000, apyBase: 7, apyReward: 0, apyMean30d: 6.8, count: 1200 },
  { pool: 'p5', project: 'epsilon-proto', symbol: 'WETH-USDC', chain: 'Ethereum', tvlUsd: 25000000, apyBase: 45, apyReward: 0, apyMean30d: 44, count: 60 },
  { pool: 'p6', project: 'zeta-proto', symbol: 'SOL-USDC', chain: 'Solana', tvlUsd: 30000000, apyBase: 60, apyReward: 0, apyMean30d: 55, count: 20 },
  { pool: 'p7', project: 'eta-proto', symbol: 'USDC', chain: 'Base', tvlUsd: 22000000, apyBase: 9, apyReward: 0, apyMean30d: 9, count: 3 },
  { pool: 'p8', project: 'theta-proto', symbol: 'USDC', chain: 'Base', tvlUsd: 10500000, apyBase: 6, apyReward: 0, apyMean30d: 6, count: 200 },
  { pool: 'p9', project: 'iota-proto', symbol: 'USDT', chain: 'Base', tvlUsd: 95000000, apyBase: 4, apyReward: 0, apyMean30d: 4, count: 500 },
  { pool: 'curve-ctrl', project: 'curve-dex', symbol: '3CRV', chain: 'Ethereum', tvlUsd: 500000000, apyBase: 3, apyReward: 0, apyMean30d: 3, count: 2000 },
  { pool: 'whale-ctrl', project: 'whale-proto', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 600000000, apyBase: 5, apyReward: 0, apyMean30d: 5, count: 100 },
  { pool: 'scam-ctrl', project: 'scam-proto', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 20000000, apyBase: 5000, apyReward: 0, apyMean30d: 4800, count: 50 },
  { pool: 'dust-ctrl', project: 'dust-proto', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 500000, apyBase: 8, apyReward: 0, count: 10 },
  { pool: 'concrete-ctrl', project: 'concrete', symbol: 'SRROYUSDC', chain: 'Ethereum', tvlUsd: 13000000, apyBase: 86.51, apyReward: 0, apyMean30d: 4.51, count: 88 },
  { pool: 'unfundable-ctrl', project: 'zero-rate-proto', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 11000000, apyBase: 0, apyReward: 0, apyMean30d: 0, count: 40 }
];
const EXCLUDED_POOL_IDS = ['curve-ctrl', 'whale-ctrl', 'scam-ctrl', 'dust-ctrl', 'concrete-ctrl', 'unfundable-ctrl'];
const storyRanked = gen.rankCandidates(STORY_POOLS);
const storyCtx = gen.buildStoryContext(STORY_POOLS);

test('positive control: concrete/SRROYUSDC-shaped pool (86.51% vs 4.51% apyMean30d) fails isRepresentativeRate specifically', () => {
  const concretePool = STORY_POOLS.find((p) => p.pool === 'concrete-ctrl');
  assert.ok(!gen.isRepresentativeRate(concretePool));
  // Isolate: it clears every OTHER gate, so representativeness alone excludes it.
  assert.ok(gen.isQualifyingPool(concretePool));
  assert.ok(gen.isSmallEnoughProtocol(concretePool.project, gen.protocolTvlAggregates(STORY_POOLS)));
  assert.ok(gen.isFundableForever(concretePool));
});
test('isFundableForever excludes a 0%-effective-rate pool while isRepresentativeRate still passes it (gate isolation)', () => {
  const unfundablePool = STORY_POOLS.find((p) => p.pool === 'unfundable-ctrl');
  assert.ok(gen.isRepresentativeRate(unfundablePool));
  assert.ok(!gen.isFundableForever(unfundablePool));
});
test('rankCandidates never returns any of the 5 gate-excluded control pools', () => {
  const rankedIds = storyRanked.map((p) => p.pool);
  EXCLUDED_POOL_IDS.forEach((id) => {
    assert.ok(!rankedIds.includes(id), `${id} should have been gated out, was returned`);
  });
  assert.ok(rankedIds.length > 0, 'sanity: some candidates must survive both gates');
});
test('population: every rankCandidates(STORY_POOLS) pool clears BOTH new 229 gates', () => {
  storyRanked.forEach((p) => {
    assert.ok(gen.isRepresentativeRate(p), `${p.pool} failed isRepresentativeRate`);
    assert.ok(gen.isFundableForever(p), `${p.pool} failed isFundableForever`);
  });
});
test('population: every storySignals() value is in [0,1], and storyScore equals their independently-recomputed mean', () => {
  storyRanked.forEach((p) => {
    const signals = gen.storySignals(p, storyCtx);
    ['smallProtocol', 'unusualRate', 'freshness', 'rateRepresentative'].forEach((key) => {
      const v = signals[key];
      assert.ok(typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1, `${p.pool}.${key}=${v} not in [0,1]`);
    });
    const recomputedMean = (signals.smallProtocol + signals.unusualRate + signals.freshness + signals.rateRepresentative) / 4;
    assert.ok(Math.abs(gen.storyScore(signals) - recomputedMean) < 1e-12);
  });
});
test('population: hookAngle is always one of smallProtocol/unusualRate/freshness, never rateRepresentative', () => {
  storyRanked.forEach((p) => {
    const signals = gen.storySignals(p, storyCtx);
    const angle = gen.hookAngle(signals);
    assert.ok(['smallProtocol', 'unusualRate', 'freshness'].includes(angle), `${p.pool} got angle "${angle}"`);
  });
});
test('rankCandidates order is non-increasing in storyScore', () => {
  const scores = storyRanked.map((p) => gen.storyScore(gen.storySignals(p, storyCtx)));
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i] <= scores[i - 1] + 1e-12, `score rose at index ${i}: ${scores[i - 1]} -> ${scores[i]}`);
  }
});
test('rankCandidates order is NOT the same as APY-descending order (storyScore actually changed the ranking)', () => {
  const storyOrderIds = storyRanked.map((p) => p.pool);
  const apyOrderIds = storyCtx.candidates.slice().sort((a, b) => poolTotalApy(b) - poolTotalApy(a)).map((p) => p.pool);
  assert.notDeepStrictEqual(storyOrderIds, apyOrderIds,
    'storyScore ranking must differ from a pure total-APY-descending ranking on this population');
});
test('pickPool(<pool failing isRepresentativeRate>) throws SpotlightError naming that gate', () => {
  assert.throws(() => gen.pickPool(STORY_POOLS, 'concrete-ctrl'), (err) => {
    assert.ok(err instanceof gen.SpotlightError);
    assert.ok(/isRepresentativeRate/.test(err.message), `error did not name the gate: ${err.message}`);
    return true;
  });
});
test('pickPool(<pool failing isFundableForever>) throws SpotlightError naming that gate', () => {
  assert.throws(() => gen.pickPool(STORY_POOLS, 'unfundable-ctrl'), (err) => {
    assert.ok(err instanceof gen.SpotlightError);
    assert.ok(/isFundableForever/.test(err.message), `error did not name the gate: ${err.message}`);
    return true;
  });
});
test("buildCadence's next-candidates list on STORY_POOLS never repeats a project (alpha-proto has 2 candidate pools)", () => {
  const cadence = gen.buildCadence(STORY_POOLS, [], { nextN: 20 });
  const projects = cadence.next.map((c) => c.protocol);
  assert.strictEqual(new Set(projects).size, projects.length, `repeated project in: ${JSON.stringify(projects)}`);
  // alpha-proto really did have 2 qualifying candidates, so the dedupe rule
  // is actually exercised here, not vacuously true because there was only
  // ever one alpha-proto pool to begin with.
  const alphaPools = storyRanked.filter((p) => p.project === 'alpha-proto');
  assert.ok(alphaPools.length >= 2, 'sanity: alpha-proto must have >=2 candidate pools for this test to mean anything');
});
// Post-review fix (229): the dedupe must ALSO exclude protocols already
// COVERED by a committed pack — not just protocols repeated within the next
// list itself. Caught in the rendered CADENCE.md output (liminal-basis
// appeared as both a covered pack AND the #1 next candidate, on a
// DIFFERENT pool of the same protocol) — the pre-fix tests above could not
// have caught this, since they only ever passed coveredPacks=[]. Two
// covered packs here, on protocols/pool ids that do NOT exist anywhere in
// STORY_POOLS (simulating "covered via a pool no longer live"), so this is
// a genuine population check over cadence.next, not a single hardcoded case.
test("buildCadence's next-candidates list never carries a protocol already present in coveredPacks, even via a different pool", () => {
  const coveredPacks = [
    { pool: 'beta-proto-legacy-pool', protocol: 'beta-proto', protocolLabel: 'Beta Proto', poolSymbol: 'USDT', chain: 'Arbitrum', slug: 'beta-proto-legacy', generatedAt: '2026-07-01T00:00:00.000Z' },
    { pool: 'gamma-proto-legacy-pool', protocol: 'gamma-proto', protocolLabel: 'Gamma Proto', poolSymbol: 'DAI', chain: 'Optimism', slug: 'gamma-proto-legacy', generatedAt: '2026-07-15T00:00:00.000Z' }
  ];
  // Sanity: both covered protocols really do have a LIVE, uncovered candidate
  // pool in STORY_POOLS (p2/beta-proto, p3/gamma-proto) with a DIFFERENT pool
  // id than the covered pack — otherwise this test would pass vacuously
  // because there was nothing for the old pool-id-only filter to leak.
  const coveredProjects = new Set(coveredPacks.map((c) => c.protocol));
  const wouldOtherwiseQualify = storyRanked.filter((p) => coveredProjects.has(p.project) && !coveredPacks.some((c) => c.pool === p.pool));
  assert.ok(wouldOtherwiseQualify.length >= coveredProjects.size,
    'sanity: each covered protocol must have >=1 live STORY_POOLS candidate on a different pool id');

  const cadence = gen.buildCadence(STORY_POOLS, coveredPacks, { nextN: 20 });
  cadence.next.forEach((c) => {
    assert.ok(!coveredProjects.has(c.protocol), `next row ${c.pool} carries protocol "${c.protocol}", already covered via a different pool`);
  });
});
test("buildCadence's next rows each carry a hookAngle in the same {smallProtocol,unusualRate,freshness} set", () => {
  const cadence = gen.buildCadence(STORY_POOLS, [], { nextN: 20 });
  cadence.next.forEach((c) => {
    assert.ok(['smallProtocol', 'unusualRate', 'freshness'].includes(c.hookAngle), `row for ${c.pool} has angle "${c.hookAngle}"`);
  });
});

console.log('hook (item 229) — honesty constraints over a generated population (degen + non-degen)');
const storyPacks = storyRanked.map((p) => gen.buildPack(p, { goalId: 'claude', lang: 'en', pools: STORY_POOLS }));
const BAN_LIST_RE = /\b(save up|afford|budget)\b/i;
test('every emitted hook is a single line', () => {
  storyPacks.forEach((pack) => {
    assert.ok(!pack.hook.includes('\n'), `hook for ${pack.pool} contains a newline: ${JSON.stringify(pack.hook)}`);
  });
});
test('no emitted hook contains a CLAUDE.md ban-list word (save up / afford / budget)', () => {
  storyPacks.forEach((pack) => {
    assert.ok(!BAN_LIST_RE.test(pack.hook), `hook for ${pack.pool} used a ban-list word: ${pack.hook}`);
  });
});
test('a freshness-angle hook says "tracked", never "days old"', () => {
  const freshnessPacks = storyPacks.filter((pack) => pack.hookAngle === 'freshness');
  assert.ok(freshnessPacks.length > 0, 'sanity: at least one candidate must land on the freshness angle');
  freshnessPacks.forEach((pack) => {
    assert.ok(pack.hook.includes('tracked'), `freshness hook for ${pack.pool} missing "tracked": ${pack.hook}`);
    assert.ok(!/days old/i.test(pack.hook), `freshness hook for ${pack.pool} said "days old": ${pack.hook}`);
  });
});
test("when a hook's forever clause is present, its figure is exactly the pack's own foreverAmtStr and its rate is exactly effectiveApyStr — never apyStr when they differ", () => {
  let sawForeverClause = false;
  storyPacks.forEach((pack) => {
    if (!pack.foreverAmtStr) {
      assert.ok(!pack.hook.includes('forever at'), `${pack.pool} has no foreverAmtStr but the hook still has a forever clause: ${pack.hook}`);
      return;
    }
    sawForeverClause = true;
    assert.ok(pack.hook.includes(pack.foreverAmtStr), `${pack.pool} hook missing its own foreverAmtStr ${pack.foreverAmtStr}: ${pack.hook}`);
    assert.ok(pack.hook.includes(`forever at ${pack.effectiveApyStr}`), `${pack.pool} hook forever-rate must be effectiveApyStr ${pack.effectiveApyStr}: ${pack.hook}`);
    if (pack.effectiveApyStr !== pack.apyStr) {
      assert.ok(!pack.hook.includes(`forever at ${pack.apyStr}`), `${pack.pool} hook forever clause quoted the raw headline apyStr instead of effectiveApyStr: ${pack.hook}`);
    }
  });
  assert.ok(sawForeverClause, 'sanity: at least one pack in this population must carry a forever clause');
});
test('degen honesty preserved: a degen-persona pack in this population still carries the ⅓-haircut tweet sentence, and its hook never quotes the raw headline apyStr as a forever basis', () => {
  const degenPacks = storyPacks.filter((pack) => pack.persona === 'degen');
  assert.ok(degenPacks.length > 0, 'sanity: this population must include >=1 degen-persona pool (p5/p6)');
  degenPacks.forEach((pack) => {
    assert.ok(pack.tweetDraft.includes('⅓'), `${pack.pool} degen tweetDraft missing the ⅓ haircut sentence`);
    assert.ok(/farm rates decay/i.test(pack.tweetDraft), `${pack.pool} degen tweetDraft missing "farm rates decay"`);
    assert.notStrictEqual(pack.apyStr, pack.effectiveApyStr, `sanity: degen persona must haircut (apyStr must differ from effectiveApyStr) for ${pack.pool}`);
    if (pack.foreverAmtStr) {
      assert.ok(!pack.hook.includes(`forever at ${pack.apyStr}`), `${pack.pool} degen hook quoted the un-haircut headline as the forever basis`);
    }
  });
});
test('a non-degen pack in this population has no haircut wording and its hook (if any forever clause) matches apyStr==effectiveApyStr', () => {
  const nonDegenPacks = storyPacks.filter((pack) => pack.persona !== 'degen');
  assert.ok(nonDegenPacks.length > 0, 'sanity: this population must include >=1 non-degen pool');
  nonDegenPacks.forEach((pack) => {
    assert.ok(!pack.tweetDraft.includes('⅓'), `${pack.pool} non-degen tweetDraft should not mention a haircut`);
    assert.strictEqual(pack.apyStr, pack.effectiveApyStr, `sanity: non-degen persona must NOT haircut for ${pack.pool}`);
  });
});

console.log('additive-only (229): every pre-229 pack/canvaFields field name is still present with the same semantics');
// Recorded verbatim from generate-spotlight.js's buildPack/buildCanvaFields
// return statements as they existed immediately before this diff (069's
// shipped shape) — the 229 spec's own additive-only rule.
const PRE_229_PACK_FIELDS = [
  'slug', 'protocol', 'protocolLabel', 'pool', 'poolSymbol', 'chain', 'token',
  'apy', 'apyStr', 'effectiveApy', 'effectiveApyStr', 'tvl', 'tvlStr',
  'goal', 'goalLabel', 'monthly', 'persona', 'foreverAmt', 'foreverAmtStr',
  'shareUrl', 'tweetDraft', 'canvaFields', 'generatedAt'
];
const PRE_229_CANVA_FIELDS = ['protocolName', 'poolSymbol', 'chain', 'apy', 'effectiveApy', 'tvl', 'goalLabel', 'shareUrl', 'tweetDraft', 'foreverAmt'];
test('every pre-229 pack field name is present, with the pre-229 type/shape', () => {
  const pack = storyPacks[0];
  PRE_229_PACK_FIELDS.forEach((key) => {
    assert.ok(Object.prototype.hasOwnProperty.call(pack, key), `pre-229 pack field "${key}" is missing`);
  });
  // Spot-check semantics (not just presence) on a representative subset.
  assert.strictEqual(typeof pack.slug, 'string');
  assert.strictEqual(typeof pack.apy, 'number');
  assert.strictEqual(typeof pack.apyStr, 'string');
  assert.strictEqual(typeof pack.effectiveApy, 'number');
  assert.strictEqual(typeof pack.tvl, 'number');
  assert.strictEqual(typeof pack.monthly, 'number');
  assert.ok(['stable', 'rwa', 'degen'].includes(pack.persona));
  assert.strictEqual(typeof pack.shareUrl, 'string');
  assert.strictEqual(typeof pack.tweetDraft, 'string');
  assert.strictEqual(typeof pack.canvaFields, 'object');
  assert.strictEqual(typeof pack.generatedAt, 'string');
});
test('every pre-229 canvaFields field name is present', () => {
  const pack = storyPacks[0];
  PRE_229_CANVA_FIELDS.forEach((key) => {
    assert.ok(Object.prototype.hasOwnProperty.call(pack.canvaFields, key), `pre-229 canvaFields field "${key}" is missing`);
  });
});
test('229 additive fields are present alongside every pre-229 field (nothing renamed/removed)', () => {
  const pack = storyPacks[0];
  ['hook', 'hookAngle', 'storyScore', 'storySignals', 'daysTracked', 'apyMean30d'].forEach((key) => {
    assert.ok(Object.prototype.hasOwnProperty.call(pack, key), `229 field "${key}" is missing`);
  });
  assert.ok(Object.prototype.hasOwnProperty.call(pack.canvaFields, 'hook'), '229 canvaFields.hook is missing');
});

// ===========================================================================
// CLI end-to-end tests (real subprocess — the spec's own acceptance
// criteria are phrased as CLI behavior: "node generate-spotlight.js
// --fixture <path> produces spotlights/<slug>/pack.json + card.png ... and
// produces neither for an anomalous/oversized-protocol candidate")
// ===========================================================================
console.log('CLI — node generate-spotlight.js --fixture --pool --out');
function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spotlight-cli-test-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('a valid small-protocol pool produces pack.json + a non-empty, valid card.png', () => {
  withTmpDir((dir) => {
    execFileSync('node', ['generate-spotlight.js', '--fixture', fixturePath, '--pool', 'good-1', '--out', dir], {
      cwd: __dirname, encoding: 'utf8'
    });
    const packPath = path.join(dir, 'tiny-good-usdc-base', 'pack.json');
    const cardPath = path.join(dir, 'tiny-good-usdc-base', 'card.png');
    assert.ok(fs.existsSync(packPath), 'pack.json missing');
    assert.ok(fs.existsSync(cardPath), 'card.png missing');

    const cliPack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
    assert.strictEqual(cliPack.pool, 'good-1');
    assert.strictEqual(cliPack.protocol, 'tiny-good');
    const u = new URL(cliPack.shareUrl);
    assert.strictEqual(u.searchParams.get('goal'), 'claude');
    assert.strictEqual(u.searchParams.get('chain'), 'Base');
    assert.strictEqual(u.searchParams.get('token'), 'USDC');

    const cardBuf = fs.readFileSync(cardPath);
    assert.ok(cardBuf.length > 0, 'card.png is empty');
    assert.ok(isPng(cardBuf), 'card.png is not a valid PNG');
    const dims = pngDims(cardBuf);
    assert.strictEqual(dims.width, 1200);
    assert.strictEqual(dims.height, 630);

    assert.strictEqual(u.searchParams.get('src'), 'x_spotlight');
    assert.strictEqual(u.searchParams.get('ref'), 'tiny-good-usdc-base');

    const cadencePath = path.join(dir, 'CADENCE.md');
    assert.ok(fs.existsSync(cadencePath), 'CADENCE.md missing');
    const cadenceMd = fs.readFileSync(cadencePath, 'utf8');
    assert.ok(cadenceMd.includes('Tiny Good'), 'CADENCE.md should list the just-spotlighted pool as covered');
    assert.ok(cadenceMd.includes('good-1'), 'CADENCE.md should reference the covered pool id');
  });
});

test('a second CLI run against the same --out dir keeps the first pool covered (no re-spotlighting)', () => {
  withTmpDir((dir) => {
    execFileSync('node', ['generate-spotlight.js', '--fixture', fixturePath, '--pool', 'good-1', '--out', dir], {
      cwd: __dirname, encoding: 'utf8'
    });
    // A second fixture with the original pool plus a fresh qualifying candidate.
    const secondFixturePath = path.join(os.tmpdir(), 'spotlight-test-fixture-2.json');
    const secondPools = FIXTURE_POOLS.concat([
      { pool: 'good-2', project: 'tiny-good-2', symbol: 'USDT', chain: 'Arbitrum', tvlUsd: 18000000, apyBase: 7, apyReward: 0, apyMean30d: 7, count: 30 }
    ]);
    fs.writeFileSync(secondFixturePath, JSON.stringify({ status: 'success', data: secondPools }));
    try {
      execFileSync('node', ['generate-spotlight.js', '--fixture', secondFixturePath, '--pool', 'good-2', '--out', dir], {
        cwd: __dirname, encoding: 'utf8'
      });
      const cadenceMd = fs.readFileSync(path.join(dir, 'CADENCE.md'), 'utf8');
      assert.ok(cadenceMd.includes('good-1'), 'first run\'s pool should still be listed as covered');
      assert.ok(cadenceMd.includes('good-2'), 'second run\'s pool should now be listed as covered');
      const nextSection = cadenceMd.slice(cadenceMd.indexOf('## Next candidates'));
      assert.ok(!nextSection.includes('--pool good-1'), 'already-covered pool must not reappear in next candidates');
      assert.ok(!nextSection.includes('--pool good-2'), 'already-covered pool must not reappear in next candidates');
    } finally {
      fs.rmSync(secondFixturePath, { force: true });
    }
  });
});

test('an oversized-protocol pool (--pool whale-1) exits non-zero and writes no pack', () => {
  withTmpDir((dir) => {
    assert.throws(() => {
      execFileSync('node', ['generate-spotlight.js', '--fixture', fixturePath, '--pool', 'whale-1', '--out', dir], {
        cwd: __dirname, encoding: 'utf8', stdio: 'pipe'
      });
    }, /Command failed/);
    assert.strictEqual(fs.readdirSync(dir).length, 0, 'output dir must stay empty — no pack for a rail-failing pool');
  });
});

test('an anomalous-APY pool (--pool scam-1) exits non-zero and writes no pack', () => {
  withTmpDir((dir) => {
    assert.throws(() => {
      execFileSync('node', ['generate-spotlight.js', '--fixture', fixturePath, '--pool', 'scam-1', '--out', dir], {
        cwd: __dirname, encoding: 'utf8', stdio: 'pipe'
      });
    }, /Command failed/);
    assert.strictEqual(fs.readdirSync(dir).length, 0, 'output dir must stay empty — no pack for an anomalous pool');
  });
});

test('a below-floor pool (--pool dust-1) exits non-zero and writes no pack', () => {
  withTmpDir((dir) => {
    assert.throws(() => {
      execFileSync('node', ['generate-spotlight.js', '--fixture', fixturePath, '--pool', 'dust-1', '--out', dir], {
        cwd: __dirname, encoding: 'utf8', stdio: 'pipe'
      });
    }, /Command failed/);
    assert.strictEqual(fs.readdirSync(dir).length, 0, 'output dir must stay empty — no pack for a below-floor pool');
  });
});

fs.rmSync(fixturePath, { force: true });

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
