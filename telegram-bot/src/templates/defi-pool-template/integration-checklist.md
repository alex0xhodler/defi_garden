# 🔥 DeFi Pool Integration Checklist

> **Based on successful Morpho PYTH/USDC integration**  
> **Reference transactions:**  
> - Deposit: `0x82ea33604034c8ec2c917f1cbebe223a22212c530e2e00c1f4c92065cadb0846`
> - Withdrawal: `0xc5721a2f28c9a44d8dd5d95fa9df109ad2e0499276e77fe3e41fa5f7c26b1c3e`

## 📋 Pre-Integration Research

### Pool Analysis
- [ ] **DeFiLlama Pool ID**: _____________
- [ ] **Pool Name**: _____________
- [ ] **Current APY**: _____________%
- [ ] **TVL**: $_____________ 
- [ ] **Chain**: Base (must be Base network)
- [ ] **Asset Type**: USDC (must be USDC for now)

### Contract Verification
- [ ] **Vault Contract Address**: 0x_____________
- [ ] **ERC4626 Compliant**: Yes/No _(verify deposit/redeem functions exist)_
- [ ] **Contract Verified on BaseScan**: Yes/No
- [ ] **Admin Controls**: _(check for pause mechanisms, ownership changes)_

### Paymaster Compatibility
- [ ] **Vault address whitelisted**: Yes/No _(contact support if needed)_
- [ ] **Test transaction possible**: Yes/No _(small deposit works)_

## 🛠️ Template Setup

### File Creation
- [ ] **Copy service template**: `cp src/templates/defi-pool-template/service-template.ts src/services/[pool-name]-defi.ts`
- [ ] **Copy deposit test**: `cp src/templates/defi-pool-template/test-deposit-template.ts src/scripts/test-[pool-name]-deposit.ts`
- [ ] **Copy withdrawal test**: `cp src/templates/defi-pool-template/test-withdrawal-template.ts src/scripts/test-[pool-name]-withdrawal.ts`

### Service Configuration _(in `src/services/[pool-name]-defi.ts`)_
- [ ] **Update POOL_CONTRACTS.VAULT**: Replace with actual vault address
- [ ] **Update function names**: Replace all `[POOL_NAME]` placeholders
- [ ] **Update logging messages**: Replace all `[POOL_NAME]` in console.log statements
- [ ] **Verify token decimals**: USDC=6, most shares=18
- [ ] **Update function selectors**: 
  - [ ] ERC20 approve: `0x095ea7b3` ✅
  - [ ] ERC4626 deposit: `0x6e553f65` ✅ 
  - [ ] ERC4626 redeem: `0xba087652` ✅

### Test Script Configuration 
- [ ] **Update imports**: Fix service import paths
- [ ] **Update function calls**: Match service function names
- [ ] **Update pool name**: Replace all `[POOL_NAME]` placeholders
- [ ] **Update script names**: Replace all `[pool-name]` placeholders

## 📦 Package.json Updates

### NPM Scripts
- [ ] **Add deposit test**: `"test:[pool-name]": "ts-node src/scripts/test-[pool-name]-deposit.ts"`
- [ ] **Add withdrawal test**: `"test:[pool-name]-withdraw": "ts-node src/scripts/test-[pool-name]-withdrawal.ts"`

Example:
```json
"scripts": {
  "test:aave": "ts-node src/scripts/test-aave-deposit.ts",
  "test:aave-withdraw": "ts-node src/scripts/test-aave-withdrawal.ts"
}
```

## 🧪 Testing Phase (CRITICAL - DO NOT SKIP)

### Deposit Testing
- [ ] **Small test amount**: Start with 0.1 USDC
- [ ] **Run deposit test**: `npm run test:[pool-name] -- --key YOUR_TEST_KEY --amount 0.1`
- [ ] **Transaction success**: ✅ UserOperation sent
- [ ] **Blockchain confirmation**: ✅ Transaction confirmed 
- [ ] **Shares received**: Check vault balance shows shares
- [ ] **Gas cost**: Should be gasless (paymaster working)

### Withdrawal Testing  
- [ ] **Small withdrawal**: Test with 0.05 shares
- [ ] **Run withdrawal test**: `npm run test:[pool-name]-withdraw -- --key YOUR_TEST_KEY --shares 0.05`
- [ ] **Transaction success**: ✅ UserOperation sent
- [ ] **Blockchain confirmation**: ✅ Transaction confirmed
- [ ] **USDC received**: Check USDC balance increased
- [ ] **Yield verification**: Withdrawal > deposit (yield working)

### Complete Cycle Testing
- [ ] **Full cycle**: Deposit → Wait → Withdraw → Verify yield
- [ ] **Multiple amounts**: Test with 0.1, 0.5, 1.0 USDC
- [ ] **Edge cases**: Test maximum balance withdrawal
- [ ] **Error handling**: Test insufficient balance scenarios

## 📊 Success Criteria

### Transaction Requirements
- [ ] **Deposit transaction hash**: 0x_____________
- [ ] **Withdrawal transaction hash**: 0x_____________
- [ ] **Gas costs**: Gasless (0 ETH paid by user)
- [ ] **Share ratio**: ~1:1 USDC to shares
- [ ] **Yield detected**: Withdrawal shows bonus yield

### Performance Metrics
- [ ] **Deposit gas usage**: < 2M gas units
- [ ] **Withdrawal gas usage**: < 1M gas units  
- [ ] **Transaction time**: < 30 seconds
- [ ] **Success rate**: 100% over 5 tests

## 📝 Documentation Updates

### Pool Registry
- [ ] **Add to supported-pools.json**: Pool metadata
- [ ] **Include APY**: Current APY percentage
- [ ] **Include test transactions**: Reference successful tx hashes

### Project Documentation  
- [ ] **Update README**: Add new pool to list
- [ ] **Integration notes**: Document any pool-specific quirks
- [ ] **Command examples**: Show testing commands

## 🚀 Production Readiness

### Final Validation
- [ ] **Code review**: All TODOs removed
- [ ] **TypeScript compilation**: No errors
- [ ] **Lint checks**: Code style compliant  
- [ ] **Security review**: No hardcoded keys/secrets
- [ ] **Test coverage**: Both deposit/withdrawal working

### Integration Points
- [ ] **Bot adapter**: Create user interface
- [ ] **Error messages**: User-friendly error handling
- [ ] **Balance display**: Show pool shares in bot
- [ ] **APY tracking**: Display current yields

## ⚠️ Common Issues & Solutions

### "Execution reverted" Errors
- ✅ **Check contract addresses**: Verify on BaseScan
- ✅ **Check function selectors**: Match ABI exactly
- ✅ **Check decimals**: USDC=6, shares usually=18
- ✅ **Check allowances**: Approve before deposit

### Paymaster Rejections
- ✅ **Whitelist contracts**: Contact CDP support
- ✅ **Check USDC balance**: Need > 0.01 USDC for gas
- ✅ **Verify Smart Wallet**: Deployment status

### Balance Issues
- ✅ **Decimal conversion**: Use parseUnits correctly
- ✅ **Share calculation**: Check vault share:asset ratio
- ✅ **Balance queries**: Use correct ABI

## 🎯 Success Benchmarks

### Morpho PYTH/USDC Results _(Your Target)_
- ✅ **Deposit**: 0.1 USDC → 0.1 shares (perfect ratio)
- ✅ **Withdrawal**: 0.05 shares → 0.052625 USDC (+5.25% yield!)
- ✅ **Gas**: Completely gasless 
- ✅ **Reliability**: 100% success rate

### When Complete
- [ ] **All checkboxes above**: ✅ Completed
- [ ] **Test transactions**: Saved and verified
- [ ] **Integration ready**: Can implement bot adapters
- [ ] **Documentation**: Complete and accurate

---

**🎉 Congratulations!** Once all items are checked, your pool integration is ready for production use following the proven pattern that works reliably with gasless transactions.