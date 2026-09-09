/**
 * Unit & Integration Test Suite for Laso.finance Edge & MCP Tools (edge/laso-core.js).
 * Run with: node test_laso_mcp.js
 */

'use strict';

const assert = require('assert');
const lasoCore = require('./edge/laso-core.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exit(1);
  }
}

console.log('--- Laso Edge & Agent MCP Tools ---');

test('handleLasoRailsRequest returns 0% load fee, Base network, and product rules', () => {
  const res = lasoCore.handleLasoRailsRequest();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.products.usa_prepaid.load_fee_pct, 0);
  assert.strictEqual(res.body.products.usa_prepaid.limits.min_usd, 5);
  assert.strictEqual(res.body.products.usa_prepaid.limits.max_usd, 1000);
  assert.strictEqual(res.body.products.usa_prepaid.expiration, '6 months from issuance');
});

test('handleLasoIssueCardRequest enforces $5–$1,000 bounds for USA prepaid', () => {
  // Out of bounds: too low ($2)
  const lowRes = lasoCore.handleLasoIssueCardRequest({ amount: 2, product: 'usa_prepaid' });
  assert.strictEqual(lowRes.status, 400);
  assert.strictEqual(lowRes.body.valid_range.min, 5);

  // Out of bounds: too high ($2000)
  const highRes = lasoCore.handleLasoIssueCardRequest({ amount: 2000, product: 'usa_prepaid' });
  assert.strictEqual(highRes.status, 400);

  // Valid simulation request ($24)
  const validRes = lasoCore.handleLasoIssueCardRequest({ amount: 24, product: 'usa_prepaid', simulation: true });
  assert.strictEqual(validRes.status, 200);
  assert.strictEqual(validRes.body.success, true);
  assert.strictEqual(validRes.body.card_details.available_balance, 24);
  assert.strictEqual(validRes.body.card_details.billing_address.state, 'DE');
});

test('handleLasoGetCardRequest returns card data or error on missing card_id', () => {
  const noIdRes = lasoCore.handleLasoGetCardRequest({});
  assert.strictEqual(noIdRes.status, 400);

  const simCardRes = lasoCore.handleLasoGetCardRequest({ card_id: 'laso_sim_12345' });
  assert.strictEqual(simCardRes.status, 200);
  assert.strictEqual(simCardRes.body.status, 'ready');
  assert.strictEqual(simCardRes.body.card_number, '4242 8849 1920 8842');
});

test('handleLasoSearchMerchantsRequest recognizes major AI and software platforms', () => {
  const claudeRes = lasoCore.handleLasoSearchMerchantsRequest({ query: 'Anthropic Claude' });
  assert.strictEqual(claudeRes.status, 200);
  assert.strictEqual(claudeRes.body.status, 'accepted');

  const cursorRes = lasoCore.handleLasoSearchMerchantsRequest({ query: 'cursor' });
  assert.strictEqual(cursorRes.status, 200);
  assert.strictEqual(cursorRes.body.status, 'accepted');

  const chatGptRes = lasoCore.handleLasoSearchMerchantsRequest({ query: 'OpenAI ChatGPT' });
  assert.strictEqual(chatGptRes.status, 200);
  assert.strictEqual(chatGptRes.body.status, 'accepted');

  const unknownRes = lasoCore.handleLasoSearchMerchantsRequest({ query: 'Some Unknown Random Merchant 123' });
  assert.strictEqual(unknownRes.status, 200);
  assert.strictEqual(unknownRes.body.status, 'unknown');
});

console.log(`\nPassed all ${passed} Laso MCP tests.`);
