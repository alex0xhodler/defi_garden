const assert = require('assert');
const { WalletController, SUPPORTED_CHAINS, createWalletController } = require('./web3_wallet.js');

console.log('=== Testing Web3 Wallet & Delegation (web3_wallet.js) ===\n');

function runTests() {
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

  test('Exports supported chains with Base Mainnet (8453) and Base Sepolia (84532)', () => {
    assert.ok(SUPPORTED_CHAINS[8453]);
    assert.strictEqual(SUPPORTED_CHAINS[8453].name, 'Base Mainnet');
    assert.strictEqual(SUPPORTED_CHAINS[8453].chainIdHex, '0x2105');

    assert.ok(SUPPORTED_CHAINS[84532]);
    assert.strictEqual(SUPPORTED_CHAINS[84532].name, 'Base Sepolia');
    assert.strictEqual(SUPPORTED_CHAINS[84532].chainIdHex, '0x14a34');
  });

  test('Builds valid EIP-712 yield sweep delegation payload', () => {
    const wallet = createWalletController({ targetChainId: 8453 });
    const payload = wallet.buildDelegationPayload({
      vaultAddress: '0x1111111111111111111111111111111111111111',
      cardDepositAddress: '0x2222222222222222222222222222222222222222',
      minHarvestAmount: '50000000',
      maxFeeBps: 2000,
      nonce: 1
    });

    assert.strictEqual(payload.primaryType, 'YieldSweepDelegation');
    assert.strictEqual(payload.domain.name, 'DeFi Garden Yield Sweeper');
    assert.strictEqual(payload.domain.chainId, 8453);
    assert.strictEqual(payload.message.minHarvestAmount, '50000000');
    assert.strictEqual(payload.message.maxFeeBps, 2000);
  });

  test('Simulates wallet connection and typed data signature via mock provider', async () => {
    const mockProvider = {
      request: async ({ method, params }) => {
        if (method === 'eth_requestAccounts') return ['0x0d79860366926b7685428dcd2b2d1eefcbd45178'];
        if (method === 'wallet_switchEthereumChain') return null;
        if (method === 'eth_signTypedData_v4') return '0xmock_signature_data_777';
        throw new Error('Unhandled mock method: ' + method);
      }
    };

    const wallet = createWalletController({ provider: mockProvider, targetChainId: 84532 });
    assert.ok(wallet.isAvailable());

    const conn = await wallet.connect();
    assert.strictEqual(conn.account, '0x0d79860366926b7685428dcd2b2d1eefcbd45178');
    assert.strictEqual(conn.chainId, 84532);

    const signResult = await wallet.signDelegation({
      vaultAddress: '0x1111111111111111111111111111111111111111',
      cardDepositAddress: '0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b'
    });

    assert.strictEqual(signResult.signer, '0x0d79860366926b7685428dcd2b2d1eefcbd45178');
    assert.strictEqual(signResult.signature, '0xmock_signature_data_777');
  });

  console.log(`\n✅ All ${passed} Web3 wallet tests passed!`);
}

runTests();
