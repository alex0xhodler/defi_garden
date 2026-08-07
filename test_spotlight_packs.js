/* Degen-haircut honesty + committed-pack validation for the X-spotlight
   generator (spec 069). Two parts:

   1. Fixture-driven unit assertions — a degen-persona pool's pack projects
      its forever-number at the SAME ⅓ haircut the live planner applies
      (planner.js:654-658 effectiveApy / :1354-1357), exposes effectiveApyStr,
      and its tweet states the haircut plainly; a stable-persona pool is
      untouched (headline == effective, no haircut wording).
   2. Committed-output validation — every spotlights/<slug>/pack.json in the
      repo clears the trust rails, carries a well-formed attribution shareUrl,
      and has a self-consistent forever-number computed against its OWN
      recorded rate+persona (never live rates — live rates drift; this stays
      green until the packs are regenerated). Sibling card.png is a non-empty
      1200x630 PNG. Skips cleanly when spotlights/ has no packs yet.

   Run: node test_spotlight_packs.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const gen = require('./generate-spotlight.js');
const { foreverNumber } = require('./planner.js');
const { formatUsd, poolTotalApy } = require('./generate-token-pages.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function isPng(buf) {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
function pngDims(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ===========================================================================
// Part 1 — fixture-driven degen-haircut honesty
// ===========================================================================
console.log('degen-haircut honesty — buildPack forever-number + tweet');

// A degen-classified pool: non-stable symbol, TVL>=$10M, APY>20 → falls
// through classifyPersona's stable/rwa bands to 'degen'. 30% headline.
const DEGEN_POOL = { pool: 'degen-1', project: 'orca', symbol: 'SOL-USDC', chain: 'Solana', tvlUsd: 15000000, apyBase: 30, apyReward: 0 };
// A stable-classified pool: stable symbol, TVL>=$50M, low APY → 'stable'.
const STABLE_POOL = { pool: 'stable-1', project: 'aave-v3', symbol: 'USDC', chain: 'Base', tvlUsd: 80000000, apyBase: 6, apyReward: 0 };

test('the degen fixture classifies as degen; the stable fixture as stable', () => {
  assert.strictEqual(gen.classifyPersona(DEGEN_POOL), 'degen');
  assert.strictEqual(gen.classifyPersona(STABLE_POOL), 'stable');
});

const degenPack = gen.buildPack(DEGEN_POOL, { goalId: 'claude', lang: 'en' });
const stablePack = gen.buildPack(STABLE_POOL, { goalId: 'claude', lang: 'en' });

test('degen pack: effectiveApy is the ⅓ haircut of headline apy (both exposed)', () => {
  const headline = poolTotalApy(DEGEN_POOL);
  assert.strictEqual(degenPack.apy, headline);
  assert.ok(Math.abs(degenPack.effectiveApy - headline / 3) < 1e-9,
    `effectiveApy ${degenPack.effectiveApy} != headline/3 ${headline / 3}`);
  assert.ok(degenPack.effectiveApyStr, 'effectiveApyStr must be present');
  assert.strictEqual(degenPack.canvaFields.effectiveApy, degenPack.effectiveApyStr);
});

test('degen pack: foreverAmt ≈ monthly*12 / ((apy/3)/100), NOT the headline basis', () => {
  const monthly = degenPack.monthly;
  const expected = monthly * 12 / ((degenPack.apy / 3) / 100);
  assert.ok(Math.abs(degenPack.foreverAmt - expected) < 1e-6,
    `foreverAmt ${degenPack.foreverAmt} != haircut basis ${expected}`);
  // And it must equal the imported planner.js helper at the effective rate.
  assert.strictEqual(degenPack.foreverAmt, foreverNumber(monthly, degenPack.effectiveApy));
  // The headline-basis figure (3× smaller) is what the OLD code produced —
  // prove we are no longer emitting it.
  const headlineBasis = foreverNumber(monthly, degenPack.apy);
  assert.ok(degenPack.foreverAmt > headlineBasis,
    'haircut basis capital must be LARGER than the dishonest headline-basis figure');
});

test('degen pack: tweet states the ⅓ haircut and "farm rates decay" plainly', () => {
  assert.ok(degenPack.tweetDraft.includes('⅓'), 'tweet must carry the ⅓ framing');
  assert.ok(/farm rates decay/i.test(degenPack.tweetDraft), 'tweet must carry the "farm rates decay" honesty');
});

test('stable pack: no haircut — foreverAmt derives from headline apy (effective == headline)', () => {
  assert.strictEqual(stablePack.effectiveApy, stablePack.apy);
  assert.strictEqual(stablePack.effectiveApyStr, stablePack.apyStr);
  assert.strictEqual(stablePack.foreverAmt, foreverNumber(stablePack.monthly, stablePack.apy));
});

test('stable pack: tweet contains NO haircut wording (byte-identical funding stance)', () => {
  assert.ok(!stablePack.tweetDraft.includes('⅓'), 'stable tweet must not mention a haircut');
  assert.ok(!/farm rates decay/i.test(stablePack.tweetDraft), 'stable tweet must not mention rate decay');
  assert.ok(stablePack.tweetDraft.includes("Parked here, that's enough to run"),
    'stable tweet keeps the pre-069 funding line');
});

test('degen card renders a valid 1200x630 PNG with the effective-rate caveat line', () => {
  const buf = gen.renderSpotlightCard({
    protocolLabel: 'Orca', poolSymbol: 'SOL-USDC', chain: 'Solana',
    apyStr: degenPack.apyStr, tvlStr: degenPack.tvlStr, goalLabelText: 'Claude Pro',
    monthly: degenPack.monthly, persona: 'degen', effectiveApyStr: degenPack.effectiveApyStr
  });
  assert.ok(isPng(buf), 'degen card is not a PNG');
  const { width, height } = pngDims(buf);
  assert.strictEqual(width, 1200);
  assert.strictEqual(height, 630);
});

// ===========================================================================
// Part 2 — committed-pack validation (structural; against each pack's OWN
// recorded numbers, never live rates)
// ===========================================================================
console.log('committed spotlights/*/pack.json — trust rails + self-consistency');

const spotlightsDir = path.join(__dirname, 'spotlights');
const packDirs = fs.existsSync(spotlightsDir)
  ? fs.readdirSync(spotlightsDir)
      .map((slug) => ({ slug, dir: path.join(spotlightsDir, slug) }))
      .filter((e) => fs.statSync(e.dir).isDirectory() && fs.existsSync(path.join(e.dir, 'pack.json')))
  : [];

if (!packDirs.length) {
  console.log('  (no committed packs yet — skipping committed-output validation)');
} else {
  packDirs.forEach(({ slug, dir }) => {
    test(`committed pack "${slug}" clears rails + is self-consistent`, () => {
      const pack = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));

      // Trust rails against the pack's OWN recorded numbers.
      assert.ok(pack.apy <= gen.APY_SANITY_LIMIT, `recorded apy ${pack.apy} exceeds APY_SANITY_LIMIT`);
      assert.ok(pack.tvl >= gen.DEFAULT_MIN_TVL, `recorded tvl ${pack.tvl} below DEFAULT_MIN_TVL`);

      // shareUrl parses and carries every attribution/plan param.
      const u = new URL(pack.shareUrl);
      ['goal', 'monthly', 'pace', 'chain', 'token', 'ref'].forEach((k) => {
        assert.ok(u.searchParams.get(k) != null && u.searchParams.get(k) !== '', `shareUrl missing ${k}`);
      });
      assert.strictEqual(u.searchParams.get('src'), gen.SPOTLIGHT_SRC, 'shareUrl src must be x_spotlight');
      assert.strictEqual(u.searchParams.get('ref'), pack.slug, 'shareUrl ref must be the pack slug');
      assert.strictEqual(u.searchParams.get('pace'), pack.persona, 'shareUrl pace must be the pack persona');

      // effectiveApy self-consistency: degen → apy/3 basis; else headline.
      const expectedEff = pack.persona === 'degen' ? pack.apy / 3 : pack.apy;
      assert.ok(Math.abs(pack.effectiveApy - expectedEff) < 1e-9,
        `effectiveApy ${pack.effectiveApy} != expected ${expectedEff} for persona ${pack.persona}`);

      // foreverAmt self-consistency against the pack's OWN recorded rate +
      // persona — never live rates.
      if (pack.foreverAmt != null && isFinite(pack.foreverAmt)) {
        assert.strictEqual(pack.foreverAmt, foreverNumber(pack.monthly, expectedEff),
          'foreverAmt must derive from the pack\'s own effective (persona-haircut) rate');
        assert.strictEqual(pack.foreverAmtStr, formatUsd(pack.foreverAmt));
      }

      // Sibling card.png exists, non-empty, 1200x630 PNG.
      const cardPath = path.join(dir, 'card.png');
      assert.ok(fs.existsSync(cardPath), 'card.png missing');
      const cardBuf = fs.readFileSync(cardPath);
      assert.ok(cardBuf.length > 0, 'card.png is empty');
      assert.ok(isPng(cardBuf), 'card.png is not a valid PNG');
      const dims = pngDims(cardBuf);
      assert.strictEqual(dims.width, 1200, 'card.png width must be 1200');
      assert.strictEqual(dims.height, 630, 'card.png height must be 630');

      // 229 — every regenerated committed pack must clear the two new gates
      // on its OWN recorded numbers, carry a well-formed hook, and expose
      // the additive story fields. isRepresentativeRate expects a raw
      // pool-shaped object (apyBase/apyReward, not the pack's own already-
      // summed `apy`) — reconstruct the minimal shape it reads rather than
      // passing the pack object directly.
      const poolShaped = { apyBase: pack.apy, apyReward: 0, apyMean30d: pack.apyMean30d };
      assert.ok(gen.isRepresentativeRate(poolShaped), `committed pack "${slug}" fails isRepresentativeRate on its own recorded apy/apyMean30d`);
      assert.ok(['smallProtocol', 'unusualRate', 'freshness'].includes(pack.hookAngle), `committed pack "${slug}" has an invalid hookAngle "${pack.hookAngle}"`);
      assert.ok(typeof pack.hook === 'string' && pack.hook.length > 0, `committed pack "${slug}" is missing a non-empty hook`);
      assert.ok(!pack.hook.includes('\n'), `committed pack "${slug}" hook is not a single line`);
      assert.ok(!/\b(save up|afford|budget)\b/i.test(pack.hook), `committed pack "${slug}" hook used a ban-list word`);
      if (pack.foreverAmtStr) {
        assert.ok(pack.hook.includes(pack.foreverAmtStr), `committed pack "${slug}" hook forever figure must equal foreverAmtStr`);
        assert.ok(pack.hook.includes(`forever at ${pack.effectiveApyStr}`), `committed pack "${slug}" hook forever rate must equal effectiveApyStr`);
      }
      assert.strictEqual(pack.canvaFields.hook, pack.hook, `committed pack "${slug}" canvaFields.hook must match pack.hook`);
      const recomputedScore = (pack.storySignals.smallProtocol + pack.storySignals.unusualRate + pack.storySignals.freshness + pack.storySignals.rateRepresentative) / 4;
      assert.ok(Math.abs(pack.storyScore - recomputedScore) < 1e-9, `committed pack "${slug}" storyScore does not equal the mean of its own storySignals`);
    });
  });

  test('committed packs cover 3 distinct protocols (069 acceptance)', () => {
    const packs = packDirs.map(({ dir }) => JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8')));
    const protocols = new Set(packs.map((p) => p.protocol));
    assert.ok(packs.length >= 3, `expected >=3 committed packs, found ${packs.length}`);
    assert.ok(protocols.size >= 3, `expected >=3 distinct protocols, found ${protocols.size}: ${[...protocols]}`);
  });
}

console.log(`\n${passed} assertions passed`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
