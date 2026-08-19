const assert = require('assert');
const { RainClient, SUBSCRIPTION_PRESETS, createClient } = require('./rain.js');

console.log('=== Testing Rain Cards Integration (rain.js) ===\n');

async function runTests() {
  let passed = 0;

  function test(name, fn) {
    try {
      fn();
      passed++;
      console.log('  ✓ ' + name);
    } catch (err) {
      console.error('  ✗ ' + name + ': ' + err.message);
      process.exitCode = 1;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      passed++;
      console.log('  ✓ ' + name);
    } catch (err) {
      console.error('  ✗ ' + name + ': ' + err.message);
      process.exitCode = 1;
    }
  }

  test('Exports RainClient and subscription presets', () => {
    assert.strictEqual(typeof RainClient, 'function');
    assert.ok(Array.isArray(SUBSCRIPTION_PRESETS));
    assert.ok(SUBSCRIPTION_PRESETS.length >= 5);
    const chatgpt = SUBSCRIPTION_PRESETS.find(p => p.id === 'chatgpt');
    assert.ok(chatgpt);
    assert.strictEqual(chatgpt.monthlyCost, 20.00);
  });

  test('Calculates capital required for perpetual subscriptions correctly', () => {
    const client = createClient();
    // $20/mo = $240/yr. At 5% APY -> $240 / 0.05 = $4,800
    const cap5 = client.calculateFundingRequirement(20, 5.0);
    assert.strictEqual(cap5, 4800);

    // $20/mo = $240/yr. At 6% APY -> $240 / 0.06 = $4,000
    const cap6 = client.calculateFundingRequirement(20, 6.0);
    assert.strictEqual(cap6, 4000);

    // Zero rate returns Infinity (never NaN)
    const capZero = client.calculateFundingRequirement(20, 0);
    assert.strictEqual(capZero, Infinity);
  });

  test('Generates complete yield routing plan for subscription funding', () => {
    const client = createClient();
    const chatgpt = SUBSCRIPTION_PRESETS.find(p => p.id === 'chatgpt');
    const mockPool = {
      project: 'aave-v3',
      symbol: 'USDC',
      chain: 'Base',
      apy: 6.0,
      apyBase: 6.0,
      apyReward: 0,
      tvlUsd: 150000000
    };

    const plan = client.generateYieldRoutingPlan(mockPool, chatgpt);
    assert.strictEqual(plan.subscriptionName, 'ChatGPT Plus');
    assert.strictEqual(plan.monthlyCost, 20.00);
    assert.strictEqual(plan.estimatedApy, 6.0);
    assert.strictEqual(plan.requiredCapitalUsd, 4000);
    assert.ok(plan.dailyYieldUsd > 0);
    assert.strictEqual(plan.poolRecommendation.chain, 'Base');
    assert.strictEqual(plan.routingAction.destination, 'Rain Collateral Vault');
  });

  await asyncTest('Simulates sandbox user creation, smart contract, and virtual card issuance', async () => {
    const client = createClient({ mockMode: true });

    // 1. Create User
    const user = await client.createUserApplication({
      firstName: 'Alex',
      lastName: 'approved',
      email: 'alex@0xhodler.nl',
      walletAddress: '0x0d79860366926b7685428dcd2b2d1eefcbd45178'
    });
    assert.ok(user.id);
    assert.strictEqual(user.applicationStatus, 'approved');

    // 2. Create Collateral Contract on Base
    const contract = await client.createUserContract(user.id, 8453);
    assert.ok(contract.depositAddress);
    assert.strictEqual(contract.status, 'deployed');

    // 3. Issue Virtual Visa Card
    const card = await client.issueVirtualCard(user.id, {
      displayName: 'DeFi Garden ChatGPT Card',
      limitAmount: 500
    });
    assert.ok(card.id);
    assert.strictEqual(card.brand, 'Visa');
    assert.strictEqual(card.status, 'active');
    assert.strictEqual(card.last4, '4242');

    // 4. Check Balances
    const balances = await client.getUserBalances(user.id);
    assert.strictEqual(typeof balances.creditLimit, 'number');
    assert.strictEqual(typeof balances.spendingPower, 'number');
  });

  console.log(`\n✅ All ${passed} tests passed!`);
}

runTests();
