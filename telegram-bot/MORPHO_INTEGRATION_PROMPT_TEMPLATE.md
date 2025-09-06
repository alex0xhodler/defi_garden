# 🤖 Morpho Pool Integration Prompt Template

**Copy this prompt, edit the [EDIT_THIS] sections, then send to Claude Code for instant integration**

---

## 🔥 **INTEGRATION PROMPT** (Copy & Edit Below)

```
Implement [EDIT_THIS: PROTOCOL_NAME] USDC vault integration for the DeFi Garden Telegram Bot following the proven Morpho pattern.

## 📊 **Pool Details** (Edit These):
- **Pool Name**: [EDIT_THIS: Protocol Name] (e.g., "Spark USDC Vault")
- **DeFiLlama Pool ID**: `[EDIT_THIS: DEFILLAMA_POOL_ID]` (e.g., "9f146531-9c31-46ba-8e26-6b59bdaca9ff")  
- **Vault Address**: `[EDIT_THIS: VAULT_ADDRESS]` (e.g., "0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a")
- **Risk Level**: [EDIT_THIS: RISK_SCORE] (1=high TVL like Aave, 2=medium TVL like Morpho)
- **APY Range**: ~[EDIT_THIS: APY]% (e.g., 8.0)
- **Emoji**: [EDIT_THIS: EMOJI] (e.g., ⚡)
- **Protocol Lowercase**: [EDIT_THIS: protocol_lowercase] (e.g., "spark")

## 🎯 **Implementation Requirements**:

**CRITICAL**: Follow the proven Morpho pattern documented in `MORPHO_POOL_INTEGRATION_MASTER_GUIDE.md` exactly. 

### **Phase 1: Service Implementation**
1. Create `src/services/[EDIT_THIS: protocol_lowercase]-defi.ts` using IDENTICAL Morpho pattern
2. Use same contract infrastructure as working Morpho (General Adapter, Bundler, etc.)
3. Only change: vault address to `[EDIT_THIS: VAULT_ADDRESS]`
4. Create test scripts: `test-[EDIT_THIS: protocol_lowercase]-deposit.ts` and `test-[EDIT_THIS: protocol_lowercase]-withdrawal.ts`
5. Add NPM scripts to package.json
6. Test with real transactions to verify service functions work

### **Phase 2: Bot Integration (ALL 10 POINTS REQUIRED)**
1. **🔥 MOST CRITICAL**: Add to DeFiLlama real-time fetching in `src/lib/defillama-api.ts`:
   - Add `[EDIT_THIS: PROTOCOL_UPPERCASE]: "[EDIT_THIS: DEFILLAMA_POOL_ID]"` to POOL_IDS
   - Add to fetchSpecificPools array  
   - Add complete processing logic (copy Morpho pattern exactly)
   - Add to TypeScript types in fetchProtocolApy function
   - Add to both fallback objects with APY: [EDIT_THIS: APY]

2. **🔥 Risk Scoring**: Add to BOTH `src/commands/earn.ts` AND `src/commands/zap.ts`:
   - Add `'[EDIT_THIS: Protocol Name]': [EDIT_THIS: RISK_SCORE]` to protocolRisk objects

3. **🔥 Gasless Routing**: Add to `src/lib/defi-protocols.ts`:
   - Add case `"[EDIT_THIS: protocol_lowercase]":` to switch statement
   - Import and call `deployTo[EDIT_THIS: ProtocolName](userId, amountUsdc)`

4. **Balance Integration**: Add to `src/commands/balance.ts`, `src/utils/mainMenu.ts`, `src/commands/portfolio.ts`
   - Import `get[EDIT_THIS: ProtocolName]Balance` function
   - Add to Promise.all balance fetching arrays  
   - Add to total calculations and display logic

5. **Withdrawal Interface**: Add complete menu system to `src/commands/withdraw.ts`
   - Add `"[EDIT_THIS: EMOJI] Exit from [EDIT_THIS: Protocol Name]", "withdraw_[EDIT_THIS: protocol_lowercase]_menu"`
   - Add menu handler, max handler, custom handler (copy Morpho pattern exactly)
   - Add to protocol selection and execution logic

6. **Callback Handlers**: Add to `index.ts` main routing
   - Add all withdraw callbacks: `withdraw_[EDIT_THIS: protocol_lowercase]_max|menu|custom`

## 🚨 **Critical Success Requirements**:

**Build & Test**: After implementation, verify:
- [ ] `npm run build` passes without errors
- [ ] Bot logs show: `Found 6/6 requested pools` (increased by 1)  
- [ ] Bot logs show: `✅ [EDIT_THIS: Protocol Name]: X.X% APY ... - saved to DB`
- [ ] Manual investment in bot works without "unsupported protocol" errors
- [ ] Protocol appears in `/balance`, `/portfolio`, and `/withdraw` commands

## 🔗 **Reference Documentation**:
- Follow `MORPHO_POOL_INTEGRATION_MASTER_GUIDE.md` for complete implementation details
- Use `CRITICAL_INTEGRATION_STEPS.md` for troubleshooting if issues arise  
- Check `SPARK_INTEGRATION_FINDINGS.md` for proven success example

## 🎯 **Expected Outcome**: 
Complete working integration identical to successful Spark USDC Vault, with protocol fully visible and functional in bot interface, supporting deposits, withdrawals, portfolio display, and manual selection.

**Pattern**: Same Morpho infrastructure + same transaction pattern + only vault address changes = guaranteed success.
```

---

## 📝 **How to Use This Prompt**

### **Step 1: Edit All [EDIT_THIS] Sections**
- Replace with your specific pool details
- Get DeFiLlama pool ID from pool page  
- Get vault address from successful transactions or DeFiLlama
- Choose appropriate risk score and emoji

### **Step 2: Validate Information**  
- Verify pool ID exists on DeFiLlama
- Confirm vault address on BaseScan
- Check if it's actually a Morpho-based pool

### **Step 3: Send to Claude Code**
- Copy the entire edited prompt
- Send as single message to Claude Code
- Claude will implement following the proven pattern

### **Step 4: Validation**
- Check logs for DeFiLlama fetching
- Test manual investment in bot
- Verify all commands show the protocol

---

## 🎯 **Example - Spark Integration Prompt**
```
Implement Spark USDC Vault integration for the DeFi Garden Telegram Bot following the proven Morpho pattern.

## 📊 Pool Details:
- Pool Name: Spark USDC Vault
- DeFiLlama Pool ID: `9f146531-9c31-46ba-8e26-6b59bdaca9ff`  
- Vault Address: `0x7bfa7c4f149e7415b73bdedfe609237e29cbf34a`
- Risk Level: 1 (high TVL like Aave)
- APY Range: ~8.0%
- Emoji: ⚡  
- Protocol Lowercase: spark

[... rest of implementation requirements ...]
```

This pattern produced the successful Spark integration in hours with 100% working bot interface.

---

**🔑 Success Factor**: This prompt contains ALL the critical details learned from successful integration, ensuring nothing is missed and the proven pattern is followed exactly.