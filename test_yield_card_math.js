/* Unit tests for Contextual Yield-Funded Virtual Card Widget logic.
   Run: node test_yield_card_math.js */
const assert = require('assert');
const PoolDetail = require('./PoolDetail.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exitCode = 1;
  }
}

console.log('--- Yield Card Mathematical Engine ---');

test('monthly yield formula calculates (C * r) / 12 accurately', () => {
  // $4,000 deposit at 6.20% APY -> 4000 * 0.062 / 12 = 20.6666... -> $20.67
  const yieldMonthly = PoolDetail.calculateMonthlyYield(4000, 6.2);
  assert.ok(Math.abs(yieldMonthly - 20.6666667) < 0.01, `Expected ~20.67, got ${yieldMonthly}`);
});

test('monthly yield with $1,000 deposit at 6.00% APY is $5.00', () => {
  const yieldMonthly = PoolDetail.calculateMonthlyYield(1000, 6.0);
  assert.strictEqual(yieldMonthly, 5.0);
});

test('monthly yield with lower $300 deposit at 6.20% APY is ~$1.55', () => {
  const yieldMonthly = PoolDetail.calculateMonthlyYield(300, 6.2);
  assert.ok(Math.abs(yieldMonthly - 1.55) < 0.01, `Expected ~1.55, got ${yieldMonthly}`);
});

test('monthly yield with 0 deposit or 0 APY is 0', () => {
  assert.strictEqual(PoolDetail.calculateMonthlyYield(0, 6.2), 0);
  assert.strictEqual(PoolDetail.calculateMonthlyYield(4000, 0), 0);
  assert.strictEqual(PoolDetail.calculateMonthlyYield(-100, 6.2), 0);
});

test('required capital C_req formula ceil((B_i * 12) / r)', () => {
  // Codex Pro $20.00/mo at 6.2% APY -> ceil(20 * 12 / 0.062) = ceil(3870.967) = 3871
  const req = PoolDetail.calculateRequiredCapital(20, 6.2);
  assert.strictEqual(req, 3871);
});

test('required capital for $5.00/mo at 6.2% APY', () => {
  // $5.00 * 12 / 0.062 = 60 / 0.062 = 967.74 -> 968
  const req = PoolDetail.calculateRequiredCapital(5, 6.2);
  assert.strictEqual(req, 968);
});

test('required capital handles 0 APY gracefully', () => {
  const req = PoolDetail.calculateRequiredCapital(20, 0);
  assert.strictEqual(req, Infinity);
});

console.log('--- Rung Unlock State & Catalogs ---');

test('isRungCovered returns true when monthly yield >= monthly cost', () => {
  assert.strictEqual(PoolDetail.isRungCovered(20.67, 20.0), true);
  assert.strictEqual(PoolDetail.isRungCovered(5.0, 4.99), true);
  assert.strictEqual(PoolDetail.isRungCovered(5.0, 5.0), true);
  assert.strictEqual(PoolDetail.isRungCovered(20.0, 20.01), false);
  assert.strictEqual(PoolDetail.isRungCovered(10.0, 20.0), false);
});

test('USD subscription catalog has 21 options matching homepage presets', () => {
  const usdCatalog = PoolDetail.getYieldCardCatalog('en');
  assert.ok(Array.isArray(usdCatalog), 'Catalog should be an array');
  assert.strictEqual(usdCatalog.length, 21, 'USD catalog should have 21 items');

  const opencode = usdCatalog.find(i => i.id === 'opencode_go');
  assert.ok(opencode, 'OpenCode Go should exist');
  assert.strictEqual(opencode.domain, 'opencode.ai');
  assert.strictEqual(opencode.monthlyCostUsd, 5.0);

  const claude = usdCatalog.find(i => i.id === 'claude');
  assert.ok(claude, 'Claude Pro should exist');
  assert.strictEqual(claude.monthlyCostUsd, 20.0);

  const spotify = usdCatalog.find(i => i.id === 'spotify');
  assert.ok(spotify, 'Spotify should exist');
  assert.strictEqual(spotify.monthlyCostUsd, 11.99);
});

test('KRW subscription catalog has 21 options matching homepage presets', () => {
  const krwCatalog = PoolDetail.getYieldCardCatalog('ko');
  assert.ok(Array.isArray(krwCatalog), 'KRW catalog should be an array');
  assert.strictEqual(krwCatalog.length, 21, 'KRW catalog should have 21 items');

  const opencode = krwCatalog.find(i => i.id === 'opencode_go');
  assert.ok(opencode, 'OpenCode Go should exist in KRW');
  assert.strictEqual(opencode.monthlyCostKrw, 6800);

  const claude = krwCatalog.find(i => i.id === 'claude');
  assert.ok(claude, 'Claude Pro should exist in KRW');
  assert.strictEqual(claude.monthlyCostKrw, 29000);
});

console.log('--- Card Handoff Payload Serialization ---');

test('serializeWaitlistPayload produces compliant Bridge.xyz / Lithic JSON schema', () => {
  const payload = PoolDetail.serializeWaitlistPayload({
    email: 'dev@company.xyz',
    pool: {
      pool: '747c1d2a-c668-4682-b9f9-296708a3dd90',
      chain: 'Base',
      symbol: 'USDC',
      apyBase: 6.2,
      apyReward: 0
    },
    subscription: {
      id: 'codex_pro',
      name: 'Codex Pro',
      monthlyCostUsd: 20.0
    },
    depositAmount: 4000
  });

  assert.ok(payload.waitlist_id.startsWith('yc_'), 'waitlist_id should start with yc_');
  assert.strictEqual(typeof payload.timestamp, 'number');
  assert.strictEqual(payload.user_email, 'dev@company.xyz');
  assert.deepStrictEqual(payload.target_pool, {
    pool_id: '747c1d2a-c668-4682-b9f9-296708a3dd90',
    chain: 'Base',
    token: 'USDC',
    net_apy: 0.062
  });
  assert.strictEqual(payload.subscription.id, 'codex_pro');
  assert.strictEqual(payload.subscription.name, 'Codex Pro');
  assert.strictEqual(payload.subscription.monthly_limit_usd, 20.0);
  assert.ok(Array.isArray(payload.subscription.merchant_category_lock));
  assert.strictEqual(payload.simulated_deposit_usd, 4000.0);
});

console.log(`\nPassed ${passed} tests.`);
