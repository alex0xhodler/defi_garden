# 🤖 Complete Bot Integration Template

**📋 Step-by-step guide to integrate new DeFi protocols into the Telegram bot interface**

> **⚠️ CRITICAL**: Follow this template for EVERY new protocol integration to ensure complete bot functionality

## 🎯 Integration Checklist Overview

When integrating a new DeFi protocol, you need to add it to **8 critical integration points**:

- ✅ **Balance Checking** - Show in user funds verification
- ✅ **Pool Selection** - Appear in auto-earn pool filters  
- ✅ **Manual Earn Menu** - Show in manual managed protocols
- ✅ **Main Menu Display** - Show positions in portfolio summary
- ✅ **Withdrawal Interface** - Complete withdrawal menu system
- ✅ **Portfolio Display** - Show in portfolio details
- ✅ **APY Fetching** - Include in real-time APY calls
- ✅ **Error Handling** - Protocol-specific error messages

---

## 🏊 Phase 1: DeFi Service Implementation (MANDATORY FIRST)

**⚠️ NEVER integrate bot interface before testing the service functions!**

### 1.1 Create Service Functions
Use the proven template pattern from `src/templates/defi-pool-template/`:

```typescript
// src/services/[protocol-name]-defi.ts
export async function deployTo[ProtocolName](userId: string, usdcAmount: string) { ... }
export async function withdrawFrom[ProtocolName](userId: string, amount: string) { ... }  
export async function get[ProtocolName]Balance(userAddress: Address) { ... }
```

### 1.2 Test with Scripts FIRST
```bash
# Test deposit
npm run test:[protocol] -- --key YOUR_TEST_KEY --amount 0.1

# Test withdrawal  
npm run test:[protocol]-withdraw -- --key YOUR_TEST_KEY --shares 0.05
```

**🚨 REQUIREMENT**: Both scripts must pass 100% before proceeding to bot integration.

---

## 🤖 Phase 2: Bot Integration (8 Integration Points)

### 2.1 ✅ Balance Checking Integration

**File**: `src/commands/start-help.ts`
**Function**: User funds verification (lines ~157-172)

```typescript
// Add import
const { get[Protocol]Balance } = await import("../services/[protocol]-defi");

// Add to Promise.all array
const [walletUsdc, aaveBalance, fluidBalance, compoundBalance, [protocol]Balance] = await Promise.all([
  getCoinbaseWalletUSDCBalance(wallet.address as Address),
  getAaveBalance(wallet.address as Address),
  getFluidBalance(wallet.address as Address), 
  getCompoundBalance(wallet.address as Address),
  get[Protocol]Balance(wallet.address as Address)  // 👈 ADD THIS
]);

// Add to balance calculation
const [protocol]BalanceNum = parseFloat([protocol]Balance.assetsFormatted);
const totalFunds = walletUsdcNum + aaveBalanceNum + fluidBalanceNum + compoundBalanceNum + [protocol]BalanceNum;

// Add to console log
console.log(`🔍 User ${firstName} funds check: Wallet: $${walletUsdcNum}, Aave: $${aaveBalanceNum}, Fluid: $${fluidBalanceNum}, Compound: $${compoundBalanceNum}, [Protocol]: $${[protocol]BalanceNum}, Total: $${totalFunds}`);
```

### 2.2 ✅ Pool Selection Integration

**File**: `src/lib/defillama-api.ts`

Add protocol to POOL_IDS:
```typescript
export const POOL_IDS = {
  AAVE: "7e0661bf-8cf3-45e6-9424-31916d4c7b84",
  FLUID: "7372edda-f07f-4598-83e5-4edec48c4039", 
  COMPOUND: "0c8567f8-ba5b-41ad-80de-00a71895eb19",
  MORPHO: "301667a4-dc42-492d-a978-ea4f69811a72",
  [PROTOCOL]: "[DEFILLAMA_POOL_ID]"  // 👈 ADD THIS
} as const;
```

Update fetchRealTimeYields function:
```typescript
const pools = await fetchSpecificPools([
  POOL_IDS.AAVE,
  POOL_IDS.FLUID, 
  POOL_IDS.COMPOUND,
  POOL_IDS.MORPHO,
  POOL_IDS.[PROTOCOL]  // 👈 ADD THIS
]);

const [protocol]Pool = pools.find(p => p.pool === POOL_IDS.[PROTOCOL]);

// Add processing logic
if ([protocol]Pool) {
  const [protocol]Opportunity = convertToYieldOpportunity([protocol]Pool, "[ProtocolName]");
  opportunities.push([protocol]Opportunity);
  saveProtocolRate("[protocol]", [protocol]Opportunity.apy, [protocol]Opportunity.apyBase, [protocol]Opportunity.apyReward, [protocol]Pool.tvlUsd);
  console.log(`✅ [ProtocolName]: ${[protocol]Opportunity.apy}% APY (${[protocol]Opportunity.apyBase}% base + ${[protocol]Opportunity.apyReward}% rewards) - saved to DB`);
} else {
  // Fallback handling...
}
```

Update fetchProtocolApy function:
```typescript
export async function fetchProtocolApy(protocol: "AAVE" | "FLUID" | "COMPOUND" | "MORPHO" | "[PROTOCOL]"): Promise<number> {
  try {
    // ... existing code ...
    const fallbacks = { 
      AAVE: 5.69, 
      FLUID: 7.72, 
      COMPOUND: 7.65, 
      MORPHO: 10.0,
      [PROTOCOL]: X.XX  // 👈 ADD FALLBACK APY
    };
    return fallbacks[protocol];
  } catch (error) {
    const fallbacks = { 
      AAVE: 5.69, 
      FLUID: 7.72, 
      COMPOUND: 7.65, 
      MORPHO: 10.0,
      [PROTOCOL]: X.XX  // 👈 ADD FALLBACK APY  
    };
    return fallbacks[protocol];
  }
}
```

### 2.3 ✅ Manual Earn Menu Integration

**File**: `src/commands/earn.ts`
**Location**: Fallback pools array (~lines 45-90)

```typescript
// Add to fallback pool list
{
  poolId: "[protocol]-pool-id",
  project: "[ProtocolName]", 
  chain: "Base",
  symbol: "USDC",
  tvlUsd: XX_000_000,
  apy: XX.X,
  apyBase: XX.X, 
  apyReward: 0.0,
  ilRisk: "no",
  exposure: "single", 
  underlyingTokens: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],
  rewardTokens: [],
  riskScore: X,  // 1-10 scale
  protocol: "[protocol]"
},
```

### 2.4 ✅ Main Menu Display Integration

**File**: `src/utils/mainMenu.ts`
**Function**: getMainMenuMessage (~lines 32-56)

```typescript
// Add import
const { get[Protocol]Balance } = await import('../services/[protocol]-defi');

// Add to Promise.all array
const [walletUsdc, aaveBalance, fluidBalance, compoundBalance, morphoBalance, [protocol]Balance] = await Promise.all([
  getCoinbaseWalletUSDCBalance(walletAddress as Address).catch(() => '0.00'),
  getAaveBalance(walletAddress as Address).catch(() => ({ aUsdcBalanceFormatted: '0.00' })),
  getFluidBalance(walletAddress as Address).catch(() => ({ fUsdcBalanceFormatted: '0.00' })),
  smartWalletAddress ? getCompoundBalance(smartWalletAddress).catch(() => ({ cUsdcBalanceFormatted: '0.00' })) : Promise.resolve({ cUsdcBalanceFormatted: '0.00' }),
  smartWalletAddress ? getMorphoBalance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' }),
  smartWalletAddress ? get[Protocol]Balance(smartWalletAddress).catch(() => ({ assetsFormatted: '0.00' })) : Promise.resolve({ assetsFormatted: '0.00' })  // 👈 ADD THIS
]);

// Add balance parsing
const [protocol]BalanceNum = parseFloat([protocol]Balance.assetsFormatted);

// Add to total calculation  
const totalDeployed = aaveBalanceNum + fluidBalanceNum + compoundBalanceNum + morphoBalanceNum + [protocol]BalanceNum;

// Add to display message
if ([protocol]BalanceNum > 0.01) {
  message += `• $${[protocol]BalanceNum.toFixed(2)} in [ProtocolName] ([XX]% APY)\\n`;
}
```

### 2.5 ✅ Complete Withdrawal Interface

**File**: `src/commands/withdraw.ts`

#### 2.5.1 Add to Main Withdrawal Menu
```typescript
// Main withdrawal menu (~line 38-42)
const keyboard = new InlineKeyboard()
  .text("🌊 Exit from Fluid", "withdraw_fluid_menu").row()
  .text("🏛️ Exit from Aave", "withdraw_aave_menu").row() 
  .text("🏦 Exit from Compound", "withdraw_compound_menu").row()
  .text("🔬 Exit from Morpho", "withdraw_morpho_menu").row()
  .text("[EMOJI] Exit from [ProtocolName]", "withdraw_[protocol]_menu").row()  // 👈 ADD THIS
  .text("❌ Cancel", "cancel_operation");

// Main menu description (~line 45-82)
await ctx.reply(
  `🚪 **Exit DeFi Pools**\n\n` +
    `Choose which protocol to exit from:\n\n` +
    `**🌊 Fluid Finance**\n` +
    `• Higher APY protocol (7.8%)\n` +
    `• Full or partial withdrawal options\n\n` +
    `**🏛️ Aave V3**\n` +
    `• Stable lending protocol (5.2%)\n` +
    `• Full or partial withdrawal options\n\n` +
    `**🏦 Compound V3**\n` +
    `• USDC lending with COMP rewards\n` +
    `• Full or partial withdrawal options\n\n` +
    `**🔬 Morpho PYTH/USDC**\n` +
    `• Premium yield protocol (10% APY)\n` +
    `• Gasless withdrawals via Smart Wallet\n\n` +
    `**[EMOJI] [ProtocolName]**\n` +  // 👈 ADD THIS
    `• [Description of protocol] ([XX]% APY)\n` +
    `• [Withdrawal features]\n\n` +
    `**Note:** Small gas fee (~$0.002) required for each exit`
);
```

#### 2.5.2 Add Protocol Menu Handler
```typescript
if (callbackData === "withdraw_[protocol]_menu") {
  await ctx.answerCallbackQuery();
  
  const keyboard = new InlineKeyboard()
    .text("💸 Exit All [ProtocolName]", "withdraw_[protocol]_max").row()
    .text("⚖️ Exit Custom Amount", "withdraw_[protocol]_custom").row()
    .text("🔙 Back", "withdraw");

  await ctx.reply(
    `[EMOJI] **Exit from [ProtocolName]**\n\n` +
      `**Your [ProtocolName] Position:**\n` +
      `• Current APY: [XX]%\n` +
      `• Token: [TokenName] (vault shares)\n` +
      `• Rewards: [Reward description]\n\n` +
      `**Exit Options:**\n` +
      `• **Exit All** - Withdraw complete position to Smart Wallet\n` +
      `• **Custom Amount** - Specify exact amount to redeem\n\n` +
      `**Note:** [Protocol-specific notes]`,
    {
      parse_mode: "Markdown",
      reply_markup: keyboard
    }
  );
  return;
}
```

#### 2.5.3 Add Max Withdrawal Handler
```typescript
if (callbackData === "withdraw_[protocol]_max") {
  await ctx.answerCallbackQuery();
  
  const processingMsg = await ctx.reply(
    `🔄 **Processing Pool Exit...**\n\n` +
      `**Protocol:** [ProtocolName]\n` +
      `**Amount:** All available shares\n` +
      `**Gas:** Sponsored by inkvest (gasless for you!)\n` +
      `**Status:** Executing transaction...`,
    {
      parse_mode: "Markdown"
    }
  );

  try {
    // Import the withdrawal function
    const { withdrawFrom[Protocol] } = await import("../services/[protocol]-defi");
    
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      throw new Error("User ID not found");
    }

    const result = await withdrawFrom[Protocol](userId, "max");
    if (!result.success) {
      throw new Error(result.error);
    }

    const successKeyboard = new InlineKeyboard()
      .text("🦑 Earn More", "zap_funds")
      .text("📊 View Portfolio", "view_portfolio")
      .row()
      .text("💰 Check Balance", "check_balance")
      .text("📥 Deposit More", "deposit");

    await ctx.api.editMessageText(
      processingMsg.chat.id,
      processingMsg.message_id,
      `✅ **Pool Exit Successful!**\n\n` +
        `**Protocol:** [ProtocolName]\n` +
        `**Amount:** All available shares redeemed\n` +
        `**Assets Received:** ${result.assets} USDC\n` +
        `**Gas:** Sponsored by inkvest (gasless!)\n` +
        `**Transaction:** \`${result.txHash}\`\n\n` +
        `💰 USDC has been moved back to your Smart Wallet!\n` +
        `🔍 [View on Basescan](https://basescan.org/tx/${result.txHash})`,
      {
        parse_mode: "Markdown",
        reply_markup: successKeyboard
      }
    );
  } catch (error: any) {
    console.error("[ProtocolName] withdrawal failed:", error);
    const errorKeyboard = new InlineKeyboard()
      .text("🔄 Try Again", "withdraw_[protocol]_max")
      .text("💸 Custom Amount", "withdraw_[protocol]_custom")
      .row()
      .text("📊 View Portfolio", "view_portfolio")
      .text("💰 Check Balance", "check_balance");

    await ctx.api.editMessageText(
      processingMsg.chat.id,
      processingMsg.message_id,
      `❌ **Pool Exit Failed**\n\n` +
        `**Error:** ${error.message}\n\n` +
        `This might be due to:\n` +
        `• No USDC deposited in [ProtocolName]\n` +
        `• Network issues\n` +
        `• Smart Wallet not set up\n\n` +
        `Try checking your balance with /portfolio`,
      {
        parse_mode: "Markdown",
        reply_markup: errorKeyboard
      }
    );
  }
  return;
}
```

#### 2.5.4 Add Custom Withdrawal Handler  
```typescript
if (callbackData === "withdraw_[protocol]_custom") {
  await ctx.answerCallbackQuery();
  
  // Store protocol preference and set state for amount input
  ctx.session.tempData = ctx.session.tempData || {};
  ctx.session.tempData.protocol = "[protocol]";
  ctx.session.awaitingWithdrawAmount = true;
  
  await ctx.reply(
    `💸 **Custom [ProtocolName] Withdrawal**\n\n` +
      `Please enter the amount of [units] you want to redeem:\n\n` +
      `**Examples:**\n` +
      `• \`1\` - Redeem 1 [unit]\n` +
      `• \`50.5\` - Redeem 50.5 [units]\n` +
      `• \`max\` - Redeem all available\n\n` +
      `**Note:** [Protocol-specific notes]\n\n` +
      `**Cancel:** Send /cancel`,
    {
      parse_mode: "Markdown"
    }
  );
  return;
}
```

#### 2.5.5 Add to handleWithdrawAmountInput Function
```typescript
// Update protocol name mapping (~line 768)
const protocolName = protocol === "fluid" ? "Fluid Finance" 
  : protocol === "compound" ? "Compound V3" 
  : protocol === "morpho" ? "Morpho PYTH/USDC"
  : protocol === "[protocol]" ? "[ProtocolName]"  // 👈 ADD THIS
  : "Aave V3";

// Update protocol emoji mapping (~line 769)  
const protocolEmoji = protocol === "fluid" ? "🌊" 
  : protocol === "compound" ? "🏦" 
  : protocol === "morpho" ? "🔬"
  : protocol === "[protocol]" ? "[EMOJI]"  // 👈 ADD THIS
  : "🏛️";

// Add to withdrawal execution logic (~line 817-829)
} else if (protocol === "[protocol]") {
  // Use [ProtocolName] gasless withdrawal
  console.log(`[EMOJI] Using gasless [ProtocolName] withdrawal for Smart Wallet user`);
  const { withdrawFrom[Protocol] } = await import("../services/[protocol]-defi");
  const result = await withdrawFrom[Protocol](userId, amount);
  if (!result.success) {
    throw new Error(result.error);
  }
  receipt = {
    transactionHash: result.txHash,
    blockNumber: "N/A (CDP UserOp)",
    gasUsed: "Sponsored by inkvest"
  };
} else if (protocol === "morpho") {
```

#### 2.5.6 Add to showWithdrawalConfirmation Function  
```typescript
// Add to protocolInfo (~line 954-958)
const protocolInfo: { [key: string]: { name: string; emoji: string; apy: number } } = {
  'fluid': { name: 'Fluid Finance', emoji: '🌊', apy: 7.8 },
  'aave': { name: 'Aave V3', emoji: '🏛️', apy: 5.2 },
  'compound': { name: 'Compound V3', emoji: '🏦', apy: 6.2 },
  'morpho': { name: 'Morpho PYTH/USDC', emoji: '🔬', apy: 10.0 },
  '[protocol]': { name: '[ProtocolName]', emoji: '[EMOJI]', apy: X.X }  // 👈 ADD THIS
};

// Add to balance fetching logic (~line 981-985)
} else if (protocol === '[protocol]') {
  const { get[Protocol]Balance } = await import("../services/[protocol]-defi");
  const balanceResult = await get[Protocol]Balance(wallet.address);
  estimatedBalance = parseFloat(balanceResult.assetsFormatted);
} else if (protocol === 'morpho') {
```

#### 2.5.7 Add to Cancel Withdrawal Handler  
```typescript
// Add to protocolInfo in cancel handler (~line 97-101)
const protocolInfo: { [key: string]: { name: string; emoji: string } } = {
  'fluid': { name: 'Fluid Finance', emoji: '🌊' },
  'aave': { name: 'Aave V3', emoji: '🏛️' },
  'compound': { name: 'Compound V3', emoji: '🏦' },
  'morpho': { name: 'Morpho PYTH/USDC', emoji: '🔬' },
  '[protocol]': { name: '[ProtocolName]', emoji: '[EMOJI]' }  // 👈 ADD THIS
};
```

### 2.6 ✅ Portfolio Display Integration

**File**: `src/commands/portfolio.ts`

Add to APY fetching (~line 99-104):
```typescript
const [realAaveApy, realFluidApy, realCompoundApy, realMorphoApy, real[Protocol]Apy] = await Promise.allSettled([
  fetchProtocolApy("AAVE"),
  fetchProtocolApy("FLUID"), 
  fetchProtocolApy("COMPOUND"),
  fetchProtocolApy("MORPHO"),
  fetchProtocolApy("[PROTOCOL]")  // 👈 ADD THIS
]);
```

Add fallback APY variable (~line 96):
```typescript
let aaveApy = 5.69;
let fluidApy = 7.72;
let compoundApy = 7.65;
let morphoApy = 10.0;
let [protocol]Apy = X.XX;  // 👈 ADD THIS
```

Add APY assignment (~line 110):
```typescript
if (realAaveApy.status === 'fulfilled') aaveApy = realAaveApy.value;
if (realFluidApy.status === 'fulfilled') fluidApy = realFluidApy.value;
if (realCompoundApy.status === 'fulfilled') compoundApy = realCompoundApy.value;
if (realMorphoApy.status === 'fulfilled') morphoApy = realMorphoApy.value;
if (real[Protocol]Apy.status === 'fulfilled') [protocol]Apy = real[Protocol]Apy.value;  // 👈 ADD THIS
```

Update console log (~line 112):
```typescript
console.log(`Portfolio APY rates: Aave ${aaveApy}%, Fluid ${fluidApy}%, Compound ${compoundApy}%, Morpho ${morphoApy}%, [ProtocolName] ${[protocol]Apy}%`);
```

**Repeat for second portfolio function around line 227-241**

### 2.7 ✅ DeFi Protocols Integration

**File**: `src/lib/defi-protocols.ts`

Add imports:
```typescript
import { deployTo[Protocol], withdrawFrom[Protocol] } from "../services/[protocol]-defi";
```

Add to executeZap function (~line 782-783):
```typescript
case "[protocol]":
  result = await deployTo[Protocol](userId!, amountUsdc);
  break;
```

Add to executeWithdraw function (~line 558-559):  
```typescript  
case "[protocol]":
  result = await withdrawFrom[Protocol](userId!, amountUsdc);
  break;
```

Add to non-Smart Wallet error handling:
```typescript
case "[protocol]":
  throw new Error(`[ProtocolName] requires a Coinbase Smart Wallet for gasless transactions. Please create a Smart Wallet using /wallet.`);
```

---

## 🧪 Phase 3: Integration Testing

### 3.1 Expected Log Outputs

After integration, you should see:

```bash
# Balance checking
🔍 User Alex funds check: Wallet: $0.07, Aave: $0, Fluid: $0.91, Compound: $0, Morpho: $0, [Protocol]: $0, Total: $0.98

# Pool fetching
=== FETCHING REAL-TIME YIELDS ===
Fetching specific pools from DeFiLlama: 7e0661bf-8cf3-45e6-9424-31916d4c7b84, 7372edda-f07f-4598-83e5-4edec48c4039, 0c8567f8-ba5b-41ad-80de-00a71895eb19, 301667a4-dc42-492d-a978-ea4f69811a72, [NEW_POOL_ID]
Found 5/5 requested pools
✅ [ProtocolName]: X.XX% APY (X.XX% base + X.XX% rewards) - saved to DB

# Pool selection
🔍 Pool selection filters: Risk Level 5 (max 10), Min APY 5%
🔍 Aave: Risk 3/10, APY 5.1% - PASS
🔍 Fluid: Risk 4/10, APY 7.23% - PASS  
🔍 Compound: Risk 6/10, APY 6.81% - PASS
🔍 Morpho: Risk 5/10, APY 8.36% - PASS
🔍 [ProtocolName]: Risk X/10, APY X.XX% - PASS

# Portfolio APY
Portfolio APY rates: Aave 5.1%, Fluid 7.23%, Compound 6.81%, Morpho 8.36%, [ProtocolName] X.XX%
```

### 3.2 User Interface Testing

Test each interface:

1. ✅ **Balance Checking**: `/start` shows protocol balance
2. ✅ **Pool Selection**: `/earn` shows protocol in options  
3. ✅ **Manual Earn**: Protocol appears in manual selection
4. ✅ **Main Menu**: Protocol balance shows in portfolio
5. ✅ **Withdrawal**: Complete withdrawal flow works
6. ✅ **Portfolio**: Protocol shows in portfolio details
7. ✅ **APY Fetching**: Protocol APY fetched in real-time
8. ✅ **Error Handling**: Protocol-specific errors show

---

## 🎯 Integration Success Criteria  

**✅ Definition of Done:**

- [ ] User funds check includes new protocol balance
- [ ] Protocol appears in pool selection filters with real-time APY
- [ ] Manual earn menu shows protocol option
- [ ] Main menu displays protocol positions
- [ ] Complete withdrawal interface (menu → max → custom → confirmation)
- [ ] Portfolio displays protocol with live APY
- [ ] Real-time APY fetching includes protocol (4→5 pools)
- [ ] Protocol-specific error handling implemented
- [ ] All TypeScript compilation passes
- [ ] End-to-end testing completed

**🚨 Common Integration Gaps:**

1. **Missing from balance checking** → Not shown in user funds
2. **Missing from fetchProtocolApy** → Dual APY fetch calls (4-pool vs 3-pool)
3. **Missing withdrawal handlers** → "Unknown command" errors
4. **Missing from protocolInfo objects** → Error in confirmation flows
5. **Missing imports** → Runtime errors during execution
6. **Wrong function names** → Service function mismatches

**📋 Files Modified per Integration:**
- `src/commands/start-help.ts` (balance checking)
- `src/lib/defillama-api.ts` (pool selection & APY)  
- `src/commands/earn.ts` (manual earn menu)
- `src/utils/mainMenu.ts` (main menu display)
- `src/commands/withdraw.ts` (withdrawal interface)
- `src/commands/portfolio.ts` (portfolio display)
- `src/lib/defi-protocols.ts` (protocol routing)

---

## 🔧 Quick Reference Commands

```bash
# Test protocol integration
npm run test:[protocol] -- --key 0xTEST_KEY --amount 0.1
npm run test:[protocol]-withdraw -- --key 0xTEST_KEY --shares 0.05

# Build and check
npm run build
npm run dev

# View integration templates
ls src/templates/defi-pool-template/
cat POOL_INTEGRATION_TEMPLATE.md
```

---

## 🚨 Critical Troubleshooting Guide

### Issue #1: Protocol Not Showing Despite Complete Backend ⚠️

**Symptoms:**
- Service functions work in tests
- Start message shows protocol balance correctly  
- Balance/Portfolio commands don't show protocol
- No debug logs from commands

**Root Cause:** Old JavaScript files being loaded instead of updated TypeScript files

**Solution:**
```bash
# Find conflicting JS files
find . -name "balance.js" -o -name "portfolio.js" | grep -v node_modules

# Remove them
rm ./commands/balance.js ./commands/portfolio.js
rm ./dist/commands/balance.js ./dist/commands/portfolio.js  
rm ./src/commands/balance.js ./src/commands/portfolio.js

# Restart bot
pkill -f "ts-node index.ts"
npm run dev
```

**🔍 How to Identify:** `ts-node` prefers `.js` files over `.ts` files when both exist.

### Issue #2: "Unknown Command" on Withdrawal Buttons ❌

**Symptoms:**
- Withdrawal interface shows protocol option
- Clicking "Exit from [Protocol]" shows "Unknown command"
- No errors in service functions

**Root Cause:** Missing callback handlers in `index.ts`

**Solution:**
```typescript
// Add to index.ts callback handler condition (~line 416-418)
if (callbackData === "withdraw_aave_max" || ... ||
    callbackData === "withdraw_[protocol]_max" ||        // 👈 ADD
    callbackData === "withdraw_aave_menu" || ... ||
    callbackData === "withdraw_[protocol]_menu" ||       // 👈 ADD  
    callbackData === "withdraw_aave_custom" || ... ||
    callbackData === "withdraw_[protocol]_custom" ||     // 👈 ADD
    ...) {
```

**🔍 Prevention:** Always add new protocol callbacks to main handler list.

### Issue #3: Wrong Wallet Address for Balance Checks 🏦

**Symptoms:**
- Protocol shows $0 balance but should show positive amount
- Different balance in start message vs commands
- APY fetching works but balance doesn't

**Root Cause:** Using Smart Wallet address when protocol deposits are on regular wallet address

**Solution:** Check where other protocols get their balance and match the pattern:
```typescript
// GOOD: Match start-help.ts pattern
getMorphoBalance(wallet.address as Address)           // Regular wallet

// BAD: Different wallet address 
getMorphoBalance(smartWallet.address as Address)     // Smart wallet
```

### Issue #4: Missing from APY Fetching Calls 📊

**Symptoms:**
- Portfolio logs show 3 APY rates instead of 4+
- Protocol APY not fetched in real-time
- Manual deposits work but auto-earn doesn't include protocol

**Root Cause:** Protocol missing from `fetchProtocolApy` calls

**Solution:**
```typescript
// Update ALL fetchProtocolApy calls in:
// 1. portfolio.ts (~line 99-104 & ~line 227-241)
const [realAaveApy, realFluidApy, realCompoundApy, realMorphoApy, real[Protocol]Apy] = await Promise.allSettled([
  fetchProtocolApy("AAVE"),
  fetchProtocolApy("FLUID"), 
  fetchProtocolApy("COMPOUND"),
  fetchProtocolApy("MORPHO"),
  fetchProtocolApy("[PROTOCOL]")  // 👈 ADD THIS
]);

// 2. defillama-api.ts (ensure new protocol in POOL_IDS and fetchSpecificPools)
// 3. Any other files calling fetchProtocolApy
```

### Issue #5: Incomplete Integration Causes Confusing UX 🔄

**Symptoms:**
- Protocol works in some places but not others
- Users see inconsistent behavior
- Support requests increase

**Root Cause:** Partial integration - missing one or more of the 8 integration points

**Solution:** Use this verification checklist:
```bash
# Check logs for complete integration:
grep "User.*funds check" logs.txt    # Should show protocol
grep "Portfolio APY rates" logs.txt  # Should include protocol  
grep "pool selection filters" logs.txt # Should show protocol
```

**🔍 Prevention:** Complete ALL 8 integration points before releasing to users.

---

## 📋 Debugging Commands

```bash
# View current callback handlers
grep -n "callbackData ===" index.ts

# Check for JS/TS conflicts
find . -name "*.js" | grep -E "(balance|portfolio|withdraw)" | grep -v node_modules

# Test specific service functions
npm run test:morpho -- --key 0xTEST_KEY --amount 0.1

# Check database integration  
grep -A 5 -B 5 "funds check" logs.txt

# Verify APY fetching
grep "APY rates:" logs.txt
```

---

**🎯 Remember:** The Morpho integration worked perfectly once we fixed the JS/TS file conflict and added missing callback handlers. Always verify TypeScript files are being used and all 8 integration points are complete!

---

**🏆 Success Metrics**: Complete integration means users can deposit, view balances, earn yield, view portfolio, and withdraw from the protocol through the bot interface seamlessly!