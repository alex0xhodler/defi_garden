# DeFi Garden Telegram Bot - Claude Development Guide

## Project Overview

DeFi Garden Telegram Bot provides automated yield optimization through gasless Smart Wallet transactions on Base network. Users can deposit USDC into vetted DeFi pools to earn yield without manual transaction fees.

## 🏊 DeFi Pool Integration Pattern

**⚠️ CRITICAL**: When implementing new DeFi pools, ALWAYS follow the template in `src/templates/defi-pool-template/`. This pattern has been battle-tested with Morpho PYTH/USDC and proven to work reliably.

### Key Success Factors:
1. **Use direct ERC4626 pattern** (no complex adapters)
2. **Create test scripts FIRST** (never implement bot integration before testing)
3. **Test with small amounts** (start with 0.1 USDC)
4. **Verify transactions on blockchain** (actual tx confirmation required)
5. **Only implement bot integration after tests pass**

### Reference Implementation:
- **Service**: `src/services/morpho-defi.ts`
- **Tests**: `src/scripts/test-morpho-*.ts`
- **Success TX Deposit**: `0x82ea33604034c8ec2c917f1cbebe223a22212c530e2e00c1f4c92065cadb0846`
- **Success TX Withdrawal**: `0xc5721a2f28c9a44d8dd5d95fa9df109ad2e0499276e77fe3e41fa5f7c26b1c3e`
- **Yield Verified**: +5.25% bonus observed in testing

### Integration Template Process:

#### 1. Research Phase
```bash
# Check pool on DeFiLlama
curl "https://yields.llama.fi/pools/[POOL_ID]"

# Verify contract on BaseScan  
# Confirm ERC4626 compliance
```

#### 2. Template Setup (MANDATORY)
```bash
# Copy service template
cp src/templates/defi-pool-template/service-template.ts src/services/[pool-name]-defi.ts

# Copy test templates
cp src/templates/defi-pool-template/test-deposit-template.ts src/scripts/test-[pool-name]-deposit.ts
cp src/templates/defi-pool-template/test-withdrawal-template.ts src/scripts/test-[pool-name]-withdrawal.ts

# Add NPM scripts
# "test:[pool-name]": "ts-node src/scripts/test-[pool-name]-deposit.ts"
# "test:[pool-name]-withdraw": "ts-node src/scripts/test-[pool-name]-withdrawal.ts"
```

#### 3. Configuration Updates
- Replace contract addresses in `POOL_CONTRACTS`
- Update all `[POOL_NAME]` placeholders
- Verify function selectors (most use standard ERC4626)
- Update import paths in test scripts

#### 4. Testing Phase (NEVER SKIP)
```bash
# Test deposit first
npm run test:[pool-name] -- --key YOUR_TEST_KEY --amount 0.1

# Test withdrawal second  
npm run test:[pool-name]-withdraw -- --key YOUR_TEST_KEY --shares 0.05

# Verify results:
# ✅ Transactions confirmed on blockchain
# ✅ Shares received for deposits
# ✅ USDC received for withdrawals  
# ✅ Yield bonus detected
# ✅ Gasless execution (paymaster working)
```

#### 5. Production Integration
Only after tests pass 100%:
- Add pool to `src/config/supported-pools.json`
- Implement bot user interface
- Update documentation
- Deploy to production

## 🎯 Proven Architecture Patterns

### ✅ USE: Direct ERC4626 Pattern
```typescript
// Deposit: approve + deposit
const operations = [
  {
    to: USDC_ADDRESS,
    data: approveCalldata,     // 0x095ea7b3
  },
  {
    to: VAULT_ADDRESS,  
    data: depositCalldata,     // 0x6e553f65
  }
];

// Withdrawal: direct redeem
const operations = [
  {
    to: VAULT_ADDRESS,
    data: redeemCalldata,      // 0xba087652  
  }
];
```

### ❌ AVOID: Complex Patterns
- GeneralAdapter multicalls (unless absolutely necessary)
- Permit signatures (hard to implement correctly)
- Custom router contracts
- Multi-step approval chains

### Function Selector Reference
```typescript
// Standard ERC20/ERC4626 selectors (proven to work)
approve(address,uint256)        → 0x095ea7b3
deposit(uint256,address)        → 0x6e553f65  
redeem(uint256,address,address) → 0xba087652
balanceOf(address)              → 0x70a08231
```

## 🧪 Testing Requirements

### Success Criteria
- **Transaction confirmation**: Must be confirmed on Base blockchain
- **Share/asset tracking**: Balances must update correctly
- **Yield verification**: Withdrawals should show bonus yield
- **Gas requirements**: Must be gasless via CDP Paymaster
- **Success rate**: 100% over minimum 5 test runs

### Test Commands
```bash
# Deposit testing
npm run test:morpho -- --key KEY --amount 0.1 --verbose

# Withdrawal testing  
npm run test:morpho-withdraw -- --key KEY --shares 0.05 --verbose

# Complete cycle testing
npm run test:morpho -- --key KEY --amount 0.2
npm run test:morpho-withdraw -- --key KEY --shares 0.1
```

## 📊 Performance Benchmarks

### Morpho PYTH/USDC (Reference Standard)
- **APY**: ~10%
- **Deposit ratio**: 1:1 USDC to shares
- **Withdrawal bonus**: +5.25% yield verified
- **Deposit gas**: 1,400,878 gas (gasless)
- **Withdrawal gas**: 543,389 gas (gasless)
- **Transaction time**: < 30 seconds
- **Success rate**: 100%

### Minimum Requirements (New Pools)
- **APY**: > 5%
- **Gas cost**: $0 (gasless required)
- **Transaction time**: < 60 seconds
- **Success rate**: > 95%
- **Yield verification**: Required

## 🚨 Common Issues & Solutions

### "Execution reverted" Errors
1. **Check contract addresses**: Verify on BaseScan
2. **Verify function selectors**: Match ABI exactly
3. **Check decimal handling**: USDC=6, most shares=18
4. **Confirm approvals**: Must approve before deposit

### Paymaster Rejections
1. **Whitelist contracts**: Contact CDP support to add pool addresses
2. **Check USDC balance**: Need > 0.01 USDC for gas
3. **Verify Smart Wallet**: Check deployment status

### Balance/Yield Issues
1. **Decimal conversion**: Use parseUnits correctly
2. **Share calculation**: Check vault's share:asset ratio
3. **ABI compatibility**: Use correct contract ABIs

## 📁 Project Structure

```
src/
├── templates/defi-pool-template/    # Integration templates (USE THESE!)
│   ├── service-template.ts          # Core service functions
│   ├── test-deposit-template.ts     # Deposit testing
│   ├── test-withdrawal-template.ts  # Withdrawal testing
│   ├── integration-checklist.md     # Step-by-step guide
│   └── README.md                    # Template documentation
├── services/                        # Pool service implementations
│   └── morpho-defi.ts               # Reference implementation
├── scripts/                         # Test scripts
│   ├── test-morpho-deposit.ts       # Reference deposit test
│   └── test-morpho-withdrawal.ts    # Reference withdrawal test
├── config/
│   └── supported-pools.json         # Pool registry
└── lib/
    └── coinbase-wallet.ts           # Smart Wallet functionality
```

## 🎯 Integration Checklist Files

1. **Main Template Guide**: `POOL_INTEGRATION_TEMPLATE.md`
2. **Detailed Checklist**: `src/templates/defi-pool-template/integration-checklist.md`  
3. **Template Documentation**: `src/templates/defi-pool-template/README.md`
4. **Pool Registry**: `src/config/supported-pools.json`

## 🚀 Quick Commands

### Template Usage
```bash
# Start new pool integration
ls src/templates/defi-pool-template/     # View available templates
cat POOL_INTEGRATION_TEMPLATE.md        # Read main guide

# Test existing pools
npm run test:morpho -- --key KEY --amount 0.1
npm run test:morpho-withdraw -- --key KEY --shares 0.05
```

### Development Workflow
```bash
# Standard development
npm run dev                    # Start bot in development mode
npm run build                  # Build TypeScript
npm run start                  # Start production bot

# Testing & Integration
npm test                      # Run unit tests (when implemented)
npm run lint                  # Code linting
```

## 🏆 Success Metrics

**Definition of Done** for new pool integration:
- [ ] Template copied and customized
- [ ] Test scripts pass 100%
- [ ] Transactions confirmed on blockchain  
- [ ] Yield bonus verified
- [ ] Added to supported-pools.json
- [ ] Documentation updated
- [ ] Bot integration implemented
- [ ] Production deployment successful

## 📚 Learning Resources

- **Morpho Protocol**: https://morpho.org/
- **ERC4626 Standard**: https://eips.ethereum.org/EIPS/eip-4626
- **Base Network**: https://base.org/
- **Coinbase Smart Wallet**: https://www.coinbase.com/wallet/smart-wallet
- **DeFiLlama API**: https://docs.llama.fi/list-all-protocols

---

**Remember**: The template exists because it WORKS. Follow the proven pattern for reliable, gasless DeFi integrations! 🎯