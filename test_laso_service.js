/**
 * Unit & Integration Test Suite for Laso.finance Virtual Visa Card Service (laso-service.js).
 * Run with: node test_laso_service.js
 */

'use strict';

const assert = require('assert');
const LasoService = require('./laso-service.js');

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

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    console.error('  ✗ ' + name + '\n    ' + err.message);
    process.exit(1);
  }
}

(async function main() {
  console.log('--- Laso Service: Helpers & Cryptographic Utilities ---');

  test('generateNonce returns 16-character alphanumeric string', () => {
    const nonce = LasoService.generateNonce();
    assert.strictEqual(typeof nonce, 'string');
    assert.strictEqual(nonce.length, 16);
    assert.match(nonce, /^[a-zA-Z0-9]{16}$/);
  });

  test('validateLuhn verifies valid Luhn numbers and rejects invalid ones', () => {
    assert.strictEqual(LasoService.validateLuhn('4242424242424242'), true);
    assert.strictEqual(LasoService.validateLuhn('4242424242424243'), false);
    assert.strictEqual(LasoService.validateLuhn(''), false);
  });

  test('generateMockPan generates valid 16-digit Visa PAN passing Luhn test', () => {
    const pan = LasoService.generateMockPan('424288');
    assert.strictEqual(typeof pan, 'string');
    assert.strictEqual(pan.length, 16);
    assert.strictEqual(pan.startsWith('424288'), true);
    assert.strictEqual(LasoService.validateLuhn(pan), true);
  });

  test('formatCardPan and maskCardPan format card numbers correctly', () => {
    const pan = '4242884919208842';
    assert.strictEqual(LasoService.formatCardPan(pan), '4242 8849 1920 8842');
    assert.strictEqual(LasoService.maskCardPan(pan), '•••• •••• •••• 8842');
  });

  test('buildSiwxMessage constructs compliant CAIP-122 EIP-4361 string', () => {
    const msg = LasoService.buildSiwxMessage({
      address: '0x71C67Ed300791a50e544a63Cd32924BD475B9077',
      chainId: 8453,
      domain: 'defi.garden',
      uri: 'https://defi.garden',
      nonce: 'a1b2c3d4e5f6g7h8'
    });
    assert.strictEqual(typeof msg, 'string');
    assert.strictEqual(msg.includes('0x71C67Ed300791a50e544a63Cd32924BD475B9077'), true);
    assert.strictEqual(msg.includes('Chain ID: 8453'), true);
    assert.strictEqual(msg.includes('Nonce: a1b2c3d4e5f6g7h8'), true);
  });

  test('buildX402PaymentHeader constructs valid Base64 payload', () => {
    const header = LasoService.buildX402PaymentHeader({
      network: 'base',
      resource: '/get-card',
      amount: '24.00',
      payer: '0x71C67Ed300791a50e544a63Cd32924BD475B9077'
    });
    assert.strictEqual(typeof header, 'string');
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    assert.strictEqual(decoded.x402Version, 1);
    assert.strictEqual(decoded.network, 'base');
    assert.strictEqual(decoded.amount, '24.00');
    assert.strictEqual(decoded.payer, '0x71C67Ed300791a50e544a63Cd32924BD475B9077');
  });

  console.log('--- Laso Service: API Client Mocking & Protocol Flows ---');

  await asyncTest('requestAuth sends SIGN-IN-WITH-X header and parses tokens', async () => {
    const mockFetch = async (url, opts) => {
      assert.strictEqual(url, 'https://laso.finance/auth');
      assert.strictEqual(opts.method, 'GET');
      assert.strictEqual(typeof opts.headers['SIGN-IN-WITH-X'], 'string');
      return {
        ok: true,
        json: async () => ({ id_token: 'mock_id_jwt', refresh_token: 'mock_refresh_jwt' })
      };
    };

    const res = await LasoService.requestAuth({
      signature: '0x123456',
      message: 'Sign In Message',
      fetchFn: mockFetch
    });
    assert.strictEqual(res.id_token, 'mock_id_jwt');
    assert.strictEqual(res.refresh_token, 'mock_refresh_jwt');
  });

  await asyncTest('getCardChallenge receives HTTP 402 with recipient and network details', async () => {
    const mockFetch = async (url, opts) => {
      assert.strictEqual(url, 'https://laso.finance/get-card?amount=24');
      assert.strictEqual(opts.method, 'GET');
      return {
        status: 402,
        ok: false,
        json: async () => ({
          x402Version: 1,
          network: 'base',
          recipient: '0x49942a17fF59F13Eb6FE3725A64Eb1F985F85860',
          price: 24.00
        })
      };
    };

    const res = await LasoService.getCardChallenge({
      amount: 24,
      product: 'usa_prepaid',
      fetchFn: mockFetch
    });
    assert.strictEqual(res.status, 402);
    assert.strictEqual(res.network, 'base');
    assert.strictEqual(res.recipient, '0x49942a17fF59F13Eb6FE3725A64Eb1F985F85860');
    assert.strictEqual(res.priceUsdc, 24);
  });

  await asyncTest('issueCardWithPayment replays with X-Payment header', async () => {
    const mockFetch = async (url, opts) => {
      assert.strictEqual(url, 'https://laso.finance/get-card?amount=24');
      assert.strictEqual(opts.headers['X-Payment'], 'mock_x402_header');
      assert.strictEqual(opts.headers['Authorization'], 'Bearer mock_jwt');
      return {
        ok: true,
        json: async () => ({ card_id: 'laso_123456', status: 'pending' })
      };
    };

    const res = await LasoService.issueCardWithPayment({
      amount: 24,
      product: 'usa_prepaid',
      paymentHeader: 'mock_x402_header',
      idToken: 'mock_jwt',
      fetchFn: mockFetch
    });
    assert.strictEqual(res.card_id, 'laso_123456');
    assert.strictEqual(res.status, 'pending');
  });

  await asyncTest('pollCardUntilReady resolves when card status is ready', async () => {
    let calls = 0;
    const mockFetch = async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: true,
          json: async () => ({ card: { status: 'pending' } })
        };
      }
      return {
        ok: true,
        json: async () => ({
          card_details: {
            card_id: 'laso_123456',
            status: 'ready',
            card_number: '4242884919208842',
            exp_month: '02',
            exp_year: '32',
            cvv: '942',
            available_balance: 24.00,
            billing_address: {
              address_line1: '1209 Orange St',
              city: 'Wilmington',
              state: 'DE',
              postal_code: '19801',
              country: 'US'
            }
          }
        })
      };
    };

    const card = await LasoService.pollCardUntilReady({
      cardId: 'laso_123456',
      idToken: 'mock_jwt',
      fetchFn: mockFetch,
      pollIntervalMs: 10,
      maxWaitMs: 1000
    });

    assert.strictEqual(card.card_number, '4242884919208842');
    assert.strictEqual(card.status, 'ready');
    assert.strictEqual(card.cvv, '942');
  });

  console.log('--- Laso Service: Simulation Engine ---');

  await asyncTest('simulateIssuance generates valid test card with sequential steps', async () => {
    const progressEvents = [];
    const card = await LasoService.simulateIssuance({
      amount: 24,
      subName: 'Claude Pro',
      walletAddress: '0x71C67Ed300791a50e544a63Cd32924BD475B9077',
      onProgress: (p) => progressEvents.push(p)
    });

    assert.strictEqual(card.status, 'ready');
    assert.strictEqual(card.available_balance, 24);
    assert.strictEqual(card.card_number.length, 16);
    assert.strictEqual(LasoService.validateLuhn(card.card_number), true);
    assert.strictEqual(card.billing_address.city, 'Wilmington');
    assert.strictEqual(card.billing_address.state, 'DE');
    assert.strictEqual(progressEvents.length >= 4, true);
  });

  console.log(`\nPassed all ${passed} Laso service tests.`);
})();
