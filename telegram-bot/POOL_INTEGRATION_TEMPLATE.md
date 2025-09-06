# 🏊 DeFi Pool Integration Template

> **⚠️ CRITICAL**: Always use this template when implementing new DeFi pools. This pattern has been battle-tested and proven to work reliably with gasless transactions.

**🚨 MOST IMPORTANT**: After service implementation, you MUST add the protocol to DeFiLlama real-time fetching or it will be INVISIBLE in the bot! 

**📚 For Morpho-based pools**: Use `MORPHO_POOL_INTEGRATION_MASTER_GUIDE.md` - proven pattern with Spark success.
**📚 For other protocols**: See `CRITICAL_INTEGRATION_STEPS.md` for general integration steps.

## 🎯 Success Story: Morpho PYTH/USDC Integration

**Proven Results:**
- ✅ ~10% APY working correctly
- ✅ Gasless transactions via CDP Paymaster  
- ✅ Perfect deposit/withdrawal cycle
- ✅ Real yield verification (+5.25% bonus observed)
- ✅ Battle-tested with multiple transactions

**Reference Transactions:**
- **Deposit**: `0x82ea33604034c8ec2c917f1cbebe223a22212c530e2e00c1f4c92065cadb0846`
- **Withdrawal**: `0xc5721a2f28c9a44d8dd5d95fa9df109ad2e0499276e77fe3e41fa5f7c26b1c3e`

## 🚀 Integration Process (ALWAYS Follow This Order)

### Phase 1: Research & Planning ⚡
1. **Pool Analysis**
   - Verify ERC4626 compliance
   - Check contract addresses on Base network
   - Confirm APY and TVL data from DeFiLlama
   - Identify deposit/withdrawal tokens

2. **Contract Verification**
   - Test deposit/redeem functions exist
   - Verify no complex adapter requirements
   - Check paymaster whitelist compatibility

### Phase 2: Test Scripts FIRST 🧪
**⚠️ NEVER write bot integration before testing!**

1. **Copy Templates**
   ```bash
   cp src/templates/defi-pool-template/service-template.ts src/services/[pool-name]-defi.ts
   cp src/templates/defi-pool-template/test-deposit-template.ts src/scripts/test-[pool-name]-deposit.ts
   cp src/templates/defi-pool-template/test-withdrawal-template.ts src/scripts/test-[pool-name]-withdrawal.ts
   ```

2. **Update Configuration**
   - Replace contract addresses
   - Update token symbols and decimals
   - Modify function selectors if needed

3. **Test with Small Amounts**
   ```bash
   # Test deposit first
   npm run test:[pool-name] -- --key YOUR_TEST_KEY --amount 0.1

   # Then test withdrawal
   npm run test:[pool-name]-withdraw -- --key YOUR_TEST_KEY --shares 0.05
   ```

### Phase 3: Validation & Integration ✅

1. **Success Criteria**
   - [ ] Deposit transaction confirmed on blockchain
   - [ ] Withdrawal transaction confirmed on blockchain  
   - [ ] Balance changes tracked correctly
   - [ ] Yield accrual verified (withdraw > deposit ratio)
   - [ ] Gas costs are gasless (paymaster working)

2. **Only Then**: Implement bot adapters

## 🏗️ Proven Architecture Pattern

### **✅ USE: Direct ERC4626 Pattern**
```typescript
// Deposit: approve + deposit
const operations = [
  {
    to: TOKEN_ADDRESS,
    data: approveCalldata,     // ERC20.approve()
  },
  {
    to: VAULT_ADDRESS,  
    data: depositCalldata,     // ERC4626.deposit()
  }
];

// Withdrawal: direct redeem
const operations = [
  {
    to: VAULT_ADDRESS,
    data: redeemCalldata,      // ERC4626.redeem()
  }
];
```

### **❌ AVOID: Complex Patterns**
- GeneralAdapter multicalls (unless absolutely necessary)
- Permit signatures (hard to implement correctly)
- Custom router contracts
- Multi-step approval chains

## 📋 Integration Checklist

Use `src/templates/defi-pool-template/integration-checklist.md` for detailed steps.

**Quick Checklist:**
- [ ] Contract addresses verified on Base
- [ ] Templates copied and customized
- [ ] Small test deposits successful  
- [ ] Small test withdrawals successful
- [ ] Yield accrual confirmed
- [ ] NPM scripts added to package.json
- [ ] Pool added to supported-pools.json
- [ ] Documentation updated

## 🎯 Template Files

All templates are located in `src/templates/defi-pool-template/`:

1. **`service-template.ts`** - Core deposit/withdraw functions
2. **`test-deposit-template.ts`** - Deposit testing script
3. **`test-withdrawal-template.ts`** - Withdrawal testing script  
4. **`integration-checklist.md`** - Detailed step-by-step guide
5. **`README.md`** - Template documentation

## 🏆 Success Metrics

**Morpho PYTH/USDC Results:**
- **Deposit**: 0.1 USDC → 0.1 shares (1:1 ratio)
- **Withdrawal**: 0.05 shares → 0.052625 USDC (+5.25% yield!)
- **Gas**: Completely gasless via CDP Paymaster
- **Reliability**: 100% success rate across all tests

## ⚠️ Critical Bot Integration Requirements

**After successful testing, you MUST complete bot integration using `BOT_INTEGRATION_TEMPLATE.md`**

### 🎯 Lessons from Morpho Integration

**What Went Wrong Initially:**
- ✅ Service functions worked perfectly in tests
- ✅ DeFiLlama API integration worked  
- ✅ Real-time APY fetching worked
- ❌ **Protocol didn't show in balance/portfolio commands**
- ❌ **Withdrawal buttons showed "unknown command"**
- ❌ **Users couldn't see their positions**

**Root Causes:**
1. **JS/TS File Conflicts**: Old `.js` files prevented updated `.ts` files from loading
2. **Missing Callback Handlers**: Withdrawal callbacks not registered in `index.ts`
3. **Inconsistent Wallet Addresses**: Different address patterns across commands

**Solution:**
```bash
# 1. Remove conflicting files
find . -name "*.js" | grep -E "(balance|portfolio|withdraw)" | grep -v node_modules | xargs rm

# 2. Follow complete bot integration template
cat BOT_INTEGRATION_TEMPLATE.md

# 3. Verify all 8 integration points
grep "User.*funds check" logs.txt    # Should show protocol
grep "Portfolio APY rates" logs.txt  # Should include protocol
```

**🚨 REMEMBER**: Service testing success ≠ Bot integration success. Always complete BOTH phases!

---

## 🚨 Emergency Troubleshooting

**Common Issues & Solutions:**

1. **"Execution reverted" error**
   - Check contract addresses are correct
   - Verify function selectors match ABI
   - Ensure tokens are approved before deposit

2. **"Insufficient balance" error**  
   - Test with smaller amounts (0.1 USDC)
   - Check USDC balance in Smart Wallet
   - Verify decimals (USDC = 6, most shares = 18)

3. **Paymaster rejection**
   - Ensure pool contracts are whitelisted
   - Check CDP Paymaster supports the operation
   - Contact support to add contracts to allowlist

**Need Help?** Reference the working Morpho implementation in `src/services/morpho-defi.ts`

---

**Remember**: This template exists because it WORKS. Don't reinvent the wheel - follow the proven pattern! 🎯