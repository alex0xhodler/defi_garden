import { Address, createPublicClient, http, parseUnits } from 'viem';
import { base } from 'viem/chains';

/**
 * Debug script to test Seamless vault redeem function
 * This will help identify why the redeem transaction is failing
 */

// Seamless vault address from transaction data
const SEAMLESS_VAULT = "0x616a4e1db48e22028f6bbf20444cd3b8e3273738" as Address;
const SMART_WALLET = "0xc8465a06cF21cB616bF152347add102C4E0D1583" as Address; // From logs

// Create public client for Base
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.QUICKNODE_RPC || 'https://mainnet.base.org')
});

// ERC4626 ABI for testing
const erc4626Abi = [
  {
    inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }],
    name: "redeem",
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "shares", type: "uint256" }],
    name: "previewRedeem",
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

async function debugSeamlessRedeem() {
  console.log('🔍 Debug Seamless Vault Redeem\n');
  
  try {
    // 1. Check vault basic info
    console.log('📋 Vault Information:');
    const [symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: SEAMLESS_VAULT,
        abi: erc4626Abi,
        functionName: 'symbol'
      }),
      publicClient.readContract({
        address: SEAMLESS_VAULT,
        abi: erc4626Abi,
        functionName: 'decimals'
      })
    ]);
    
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Decimals: ${decimals}\n`);
    
    // 2. Check smart wallet balance
    console.log('💰 Smart Wallet Balance:');
    const balance = await publicClient.readContract({
      address: SEAMLESS_VAULT,
      abi: erc4626Abi,
      functionName: 'balanceOf',
      args: [SMART_WALLET]
    });
    
    console.log(`   Raw balance: ${balance}`);
    console.log(`   Formatted: ${(Number(balance) / Math.pow(10, decimals)).toFixed(6)} ${symbol}\n`);
    
    if (balance === 0n) {
      console.log('❌ No balance found - cannot test redeem');
      return;
    }
    
    // 3. Test preview redeem to see what assets we would get
    console.log('🔮 Preview Redeem:');
    try {
      const previewAssets = await publicClient.readContract({
        address: SEAMLESS_VAULT,
        abi: erc4626Abi,
        functionName: 'previewRedeem',
        args: [balance] // Test with full balance
      });
      
      console.log(`   Shares to redeem: ${balance}`);
      console.log(`   Assets expected: ${previewAssets}`);
      console.log(`   USDC expected: ${(Number(previewAssets) / 1e6).toFixed(6)} USDC\n`);
    } catch (error) {
      console.log(`   ❌ Preview redeem failed: ${error}\n`);
    }
    
    // 4. Test small amount redeem simulation
    const testShares = balance / 10n; // Try 10% of balance
    console.log('🧪 Test Redeem Simulation:');
    console.log(`   Test shares: ${testShares}`);
    
    try {
      const testAssets = await publicClient.readContract({
        address: SEAMLESS_VAULT,
        abi: erc4626Abi,
        functionName: 'previewRedeem',
        args: [testShares]
      });
      
      console.log(`   Expected assets: ${testAssets}`);
      console.log(`   Expected USDC: ${(Number(testAssets) / 1e6).toFixed(6)} USDC\n`);
    } catch (error) {
      console.log(`   ❌ Test preview failed: ${error}\n`);
    }
    
    // 5. Check if there are any special requirements
    console.log('🔐 Additional Checks:');
    
    // Check if vault has any special allowance requirements
    const allowanceAbi = [
      {
        inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
        name: "allowance",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function"
      }
    ] as const;
    
    try {
      const allowance = await publicClient.readContract({
        address: SEAMLESS_VAULT,
        abi: allowanceAbi,
        functionName: 'allowance',
        args: [SMART_WALLET, SMART_WALLET] // Check self-allowance
      });
      console.log(`   Self-allowance: ${allowance}`);
    } catch (error) {
      console.log(`   Self-allowance check failed (normal for most vaults)`);
    }
    
  } catch (error: any) {
    console.error('❌ Debug failed:', error.message);
  }
}

// Execute debug if run directly
if (require.main === module) {
  debugSeamlessRedeem().catch((error) => {
    console.error('💀 Fatal error:', error);
    process.exit(1);
  });
}

export { debugSeamlessRedeem };