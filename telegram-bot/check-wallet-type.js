const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

const QUICKNODE_RPC_URL = "https://api.developer.coinbase.com/rpc/v1/base/f6O1WKUX3qIOA60s1PfWirVzQcQYatXz";

async function checkWalletType() {
  try {
    console.log('Checking wallet type for 0x3584cB73Cb524cDA9e89c72c5f12fb2c6bd1FE42...');
    
    const publicClient = createPublicClient({
      chain: base,
      transport: http(QUICKNODE_RPC_URL),
    });

    // Get bytecode to determine if it's a contract
    const bytecode = await publicClient.getBytecode({
      address: '0x3584cB73Cb524cDA9e89c72c5f12fb2c6bd1FE42'
    });

    // Get balance
    const balance = await publicClient.getBalance({
      address: '0x3584cB73Cb524cDA9e89c72c5f12fb2c6bd1FE42'
    });

    console.log('Address:', '0x3584cB73Cb524cDA9e89c72c5f12fb2c6bd1FE42');
    console.log('Balance (wei):', balance.toString());
    console.log('Balance (ETH):', (Number(balance) / 1e18).toFixed(6));
    
    if (!bytecode || bytecode === '0x') {
      console.log('Type: EOA (Externally Owned Account)');
      console.log('⚠️  Private key recovery is MANDATORY for this address');
    } else {
      console.log('Type: Smart Contract');
      console.log('Bytecode length:', bytecode.length);
      console.log('✅ Alternative recovery methods might be available');
    }

  } catch (error) {
    console.error('Error checking wallet type:', error);
  }
}

checkWalletType();