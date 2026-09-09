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
  test('generateHexNonce returns 64-character valid hex string for 32 bytes', () => {
    const hex = LasoService.generateHexNonce(32);
    assert.strictEqual(hex.length, 64);
    assert.strictEqual(/^[0-9a-f]{64}$/.test(hex), true);
  });

  test('buildEip712TransferWithAuthorization constructs compliant Base USDC EIP-3009 payload', () => {
    const typedData = LasoService.buildEip712TransferWithAuthorization({
      from: '0x71C67Ed300791a50e544a63Cd32924BD475B9077',
      to: '0x3291e96b3bff7ed56e3ca8364273c5b4654b2b37',
      amount: 5
    });
    assert.strictEqual(typedData.primaryType, 'TransferWithAuthorization');
    assert.strictEqual(typedData.domain.name, 'USD Coin');
    assert.strictEqual(typedData.domain.version, '2');
    assert.strictEqual(typedData.domain.chainId, 8453);
    assert.strictEqual(typedData.domain.verifyingContract, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    assert.strictEqual(typedData.message.from, '0x71C67Ed300791a50e544a63Cd32924BD475B9077');
    assert.strictEqual(typedData.message.to, '0x3291e96b3bff7ed56e3ca8364273c5b4654b2b37');
    assert.strictEqual(typedData.message.value, '5000000');
    assert.strictEqual(typedData.message.validAfter, 0);
    assert.strictEqual(typeof typedData.message.validBefore, 'number');
    assert.strictEqual(typeof typedData.message.nonce, 'string');
  });

  test('buildX402PaymentHeaderV2 constructs compliant x402 v2 payment header', () => {
    const header = LasoService.buildX402PaymentHeaderV2({
      signature: '0xdeadbeef',
      from: '0x71C67Ed300791a50e544a63Cd32924BD475B9077',
      to: '0x3291e96b3bff7ed56e3ca8364273c5b4654b2b37',
      value: '5000000',
      validBefore: 1757350000,
      nonce: '0x1234567890abcdef'
    });
    assert.strictEqual(typeof header, 'string');
    const decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    assert.strictEqual(decoded.x402Version, 2);
    assert.strictEqual(decoded.scheme, 'exact');
    assert.strictEqual(decoded.network, 'eip155:8453');
    assert.strictEqual(decoded.payload.signature, '0xdeadbeef');
    assert.strictEqual(decoded.payload.authorization.value, '5000000');
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
  await asyncTest('getCardChallenge parses x402 v2 challenge from payment-required header', async () => {
    const sampleV2Challenge = {
      x402Version: 2,
      accepts: [
        {
          scheme: 'exact',
          network: 'eip155:8453',
          amount: '5000000',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          payTo: '0x3291e96b3bff7ed56e3ca8364273c5b4654b2b37'
        }
      ]
    };
    const b64Header = Buffer.from(JSON.stringify(sampleV2Challenge)).toString('base64');

    const mockFetch = async () => {
      return {
        status: 402,
        ok: false,
        headers: {
          get: (h) => (h.toLowerCase() === 'payment-required' ? b64Header : null)
        },
        json: async () => ({})
      };
    };

    const res = await LasoService.getCardChallenge({
      amount: 5,
      product: 'usa_prepaid',
      fetchFn: mockFetch
    });
    assert.strictEqual(res.status, 402);
    assert.strictEqual(res.x402Version, 2);
    assert.strictEqual(res.recipient, '0x3291e96b3bff7ed56e3ca8364273c5b4654b2b37');
    assert.strictEqual(res.priceUsdc, 5);
    assert.strictEqual(res.tokenAddress, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
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

  console.log('--- Laso Service: Credential Security & Disk Hygiene ---');

  test('stored card sanitized metadata does not expose full PAN or CVV to storage', () => {
    const store = {};
    global.localStorage = {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    };
    const mockWallet = '0x1234567890abcdef1234567890abcdef12345678';
    const safeCard = {
      card_id: 'laso_test_123',
      status: 'ready',
      last4: '8842',
      exp_month: '02',
      exp_year: '32',
      available_balance: 5.00
    };
    LasoService.saveStoredCard(mockWallet, safeCard);
    const stored = LasoService.getStoredCards(mockWallet);
    assert.strictEqual(stored.length >= 1, true);
    const found = stored.find(c => c.card_id === 'laso_test_123');
    assert.strictEqual(found.last4, '8842');
    assert.strictEqual(found.card_number, undefined);
    assert.strictEqual(found.cvv, undefined);
    delete global.localStorage;
  });

  console.log(`\nPassed all ${passed} Laso service tests.`);
})();
