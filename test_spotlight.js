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
const FIXTURE_POOLS = [
  { pool: 'curve-1', project: 'curve-dex', symbol: '3CRV', chain: 'Ethereum', tvlUsd: 500000000, apyBase: 3, apyReward: 0 },
  { pool: 'curve-2', project: 'curve-dex', symbol: 'crvUSD-USDC', chain: 'Ethereum', tvlUsd: 400000000, apyBase: 4, apyReward: 0 },
  { pool: 'whale-1', project: 'whale-protocol', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 1000000000, apyBase: 5, apyReward: 0 },
  { pool: 'scam-1', project: 'tiny-scam', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 20000000, apyBase: 5000, apyReward: 0 },
  { pool: 'dust-1', project: 'tiny-dust', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 500000, apyBase: 8, apyReward: 0 },
  { pool: 'good-1', project: 'tiny-good', symbol: 'USDC', chain: 'Base', tvlUsd: 15000000, apyBase: 9.5, apyReward: 0 }
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
const CADENCE_POOLS = [
  { pool: 'curve-1', project: 'curve-dex', symbol: '3CRV', chain: 'Ethereum', tvlUsd: 500000000, apyBase: 3, apyReward: 0 },
  { pool: 'curve-2', project: 'curve-dex', symbol: 'crvUSD-USDC', chain: 'Ethereum', tvlUsd: 400000000, apyBase: 4, apyReward: 0 },
  { pool: 'small-a', project: 'proto-a', symbol: 'USDC', chain: 'Base', tvlUsd: 15000000, apyBase: 12, apyReward: 0 },
  { pool: 'small-b', project: 'proto-b', symbol: 'USDT', chain: 'Arbitrum', tvlUsd: 20000000, apyBase: 9, apyReward: 0 },
  { pool: 'small-c', project: 'proto-c', symbol: 'DAI', chain: 'Optimism', tvlUsd: 12000000, apyBase: 6, apyReward: 0 },
  { pool: 'dust-1', project: 'tiny-dust', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 500000, apyBase: 8, apyReward: 0 }
];
test('rankCandidates ranks qualifying, small-enough pools by total APY descending, excludes Curve/dust', () => {
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
      { pool: 'good-2', project: 'tiny-good-2', symbol: 'USDT', chain: 'Arbitrum', tvlUsd: 18000000, apyBase: 7, apyReward: 0 }
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
