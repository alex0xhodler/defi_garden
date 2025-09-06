# 🚨 CRITICAL Integration Checklist - Complete Template

**Use this checklist for EVERY new protocol integration to ensure nothing is missed!**

## 🔥 **PHASE 1: Service Implementation** 

### **1.1 Service Functions**
- [ ] Copy `src/templates/defi-pool-template/service-template.ts` to `src/services/[protocol]-defi.ts`
- [ ] Replace all `[POOL_NAME]` placeholders with actual protocol name
- [ ] Update contract addresses from DeFiLlama pool data or transaction analysis
- [ ] Replace `[POOL_CONTRACTS].VAULT` with actual vault address
- [ ] Test deposit function: `npm run test:[protocol] -- --key TEST_KEY --amount 0.1`
- [ ] Test withdrawal function: `npm run test:[protocol]-withdraw -- --key TEST_KEY --shares 0.05`
- [ ] Test max exit: `npm run test:[protocol]-withdraw -- --key TEST_KEY --shares max`

### **1.2 Test Scripts**
- [ ] Copy deposit template to `src/scripts/test-[protocol]-deposit.ts`
- [ ] Copy withdrawal template to `src/scripts/test-[protocol]-withdrawal.ts`
- [ ] Update all `[POOL_NAME]` and `[pool-name]` placeholders
- [ ] Add NPM scripts to `package.json`:
  - [ ] `"test:[protocol]": "ts-node src/scripts/test-[protocol]-deposit.ts"`
  - [ ] `"test:[protocol]-withdraw": "ts-node src/scripts/test-[protocol]-withdrawal.ts"`

### **1.3 Validation**
- [ ] Build passes: `npm run build`
- [ ] All tests pass with real transactions
- [ ] Gasless transactions confirmed (CDP Paymaster working)
- [ ] Precision handling works for max exits

## 🚨 **PHASE 2: Bot Integration (10 CRITICAL Points)**

### **2.1 🔥 DeFiLlama Real-Time Fetching (MOST CRITICAL)**
**File**: `src/lib/defillama-api.ts`
- [ ] Add pool ID to `POOL_IDS` constant: `[PROTOCOL]: "[DEFILLAMA_POOL_ID]"`
- [ ] Add to `fetchSpecificPools([...])` array: `POOL_IDS.[PROTOCOL]`
- [ ] Add pool finding: `const [protocol]Pool = pools.find(p => p.pool === POOL_IDS.[PROTOCOL]);`
- [ ] Copy complete processing logic (fetch + fallback + database saving)
- [ ] Add to TypeScript types: `fetchProtocolApy(protocol: "..." | "[PROTOCOL]")`
- [ ] Add to BOTH fallback objects: `[PROTOCOL]: X.XX`

### **2.2 🔥 Risk Scoring (CRITICAL)**
**Files**: `src/commands/earn.ts` AND `src/commands/zap.ts`
- [ ] Add to `protocolRisk` object in `earn.ts`: `'[ProtocolName]': X`
- [ ] Add to `protocolRisk` object in `zap.ts`: `'[ProtocolName]': X`
- [ ] Use **risk score 1** for high TVL protocols (like Aave)
- [ ] Use **risk score 2** for medium protocols (like Morpho)

### **2.3 Balance Checking Integration**
**Files**: `src/commands/balance.ts`, `src/utils/mainMenu.ts`, `src/commands/portfolio.ts`
- [ ] Add import: `const { get[Protocol]Balance } = await import("../services/[protocol]-defi");`
- [ ] Add to Promise.all balance fetching arrays
- [ ] Add balance variables: `const [protocol]BalanceNum = parseFloat([protocol]Balance.assetsFormatted);`
- [ ] Add to total calculations: `totalDeployed = ... + [protocol]BalanceNum`
- [ ] Add to display logic with proper emoji and formatting

### **2.4 Portfolio Display Integration**
**File**: `src/commands/portfolio.ts`
- [ ] Add balance fetching (same as 2.3)
- [ ] Add to empty portfolio check: `&& [protocol]BalanceNum === 0`
- [ ] Add APY variable: `let [protocol]Apy = X.X;`
- [ ] Add to APY fetching: `fetchProtocolApy("[PROTOCOL]")`
- [ ] Add position display block:
```typescript
if ([protocol]BalanceNum > 0) {
  message += `**[EMOJI] [Protocol] Position**\n\n`;
  message += `🟢 **[Protocol Name]**\n`;
  message += `• **Current Deposit**: $${[protocol]BalanceNum.toFixed(2)}\n`;
  message += `• **Current APY**: ${[protocol]Apy}%\n`;
  message += `• **Protocol**: [Protocol] on Base\n`;
  message += `• **Status**: ✅ Active & Earning\n\n`;
}
```

### **2.5 Earn Options Integration**
**File**: `src/commands/earn.ts`
- [ ] Add to fallback pools array (~line 45-90)
- [ ] Set appropriate `riskScore`, `tvlUsd`, `apy`, `protocol` fields
- [ ] Use same structure as existing pools

### **2.6 Withdrawal Interface Complete**
**File**: `src/commands/withdraw.ts`
- [ ] Add to main menu: `.text("[EMOJI] Exit from [Protocol]", "withdraw_[protocol]_menu").row()`
- [ ] Add protocol description to main message
- [ ] Add menu handler: `if (callbackData === "withdraw_[protocol]_menu")`
- [ ] Add max handler: `if (callbackData === "withdraw_[protocol]_max")`  
- [ ] Add custom handler: `if (callbackData === "withdraw_[protocol]_custom")`
- [ ] Add to protocol selection logic: `protocol === "[protocol]"`
- [ ] Add to protocol name mapping
- [ ] Add to protocol emoji mapping

### **2.7 Callback Handler Registration**
**File**: `index.ts` (~line 416-418)
- [ ] Add to withdrawal callback conditions:
  - [ ] `callbackData === "withdraw_[protocol]_max" ||`
  - [ ] `callbackData === "withdraw_[protocol]_menu" ||` 
  - [ ] `callbackData === "withdraw_[protocol]_custom" ||`

### **2.8 Configuration Updates**
**File**: `src/config/supported-pools.json`
- [ ] Update pool status from "testing" to "active" 
- [ ] Add successful transaction hashes
- [ ] Update "lastTested" date

## ✅ **Verification Tests**

After completing ALL steps above:

### **Log Verification**
Start bot and check logs show:
- [ ] `Fetching specific pools from DeFiLlama: ..., [POOL_ID]`
- [ ] `Found X/X requested pools` (X should be +1)  
- [ ] `✅ [ProtocolName]: X.X% APY ... - saved to DB`

### **Bot Command Testing**
- [ ] `/balance` - Shows protocol positions
- [ ] `/portfolio` - Shows detailed protocol info
- [ ] `/withdraw` - Has protocol exit option
- [ ] `/zap` - Includes protocol in auto-deployment
- [ ] Manual protocol selection shows protocol

### **User Flow Testing**  
- [ ] Deposit via bot interface
- [ ] Check portfolio shows position
- [ ] Partial withdrawal (50%) works
- [ ] Full exit (max) works
- [ ] No "unknown command" errors

## 🎯 **Success Criteria**

- [ ] Protocol appears in ALL bot interfaces
- [ ] Real-time APY fetching working
- [ ] Auto-deployment includes protocol
- [ ] Manual selection shows protocol
- [ ] Withdrawal interface complete
- [ ] All transactions gasless
- [ ] User can complete full lifecycle

---

**🔑 Remember**: The #1 reason protocols don't show up = Missing from DeFiLlama fetching! Always check this first! 🚨