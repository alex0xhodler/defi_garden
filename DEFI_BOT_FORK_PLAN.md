# DeFi Garden Telegram Bot - Fork Plan

## Forked Bot Analysis

**Source**: QuickNode Base Telegram Trading Bot
- **Repository**: `github.com/quiknode-labs/qn-guide-examples/base/telegram-trading-bot`
- **License**: MIT (open source)
- **Technology**: TypeScript, Grammy (Telegram framework), Viem (EVM), SQLite

## Current Bot Capabilities

### ✅ Already Implemented (Keep These)
- **Secure Wallet Management**: Create/import/export wallets with AES-256 encryption
- **Database Schema**: SQLite with users, wallets, settings, transactions tables  
- **Command Structure**: Well-organized command handlers (`/start`, `/wallet`, `/balance`)
- **Security Features**: Encrypted private keys, MEV protection, transaction validation
- **Gas Management**: Dynamic gas estimation with priority settings
- **UI/UX**: Keyboard navigation, confirmation dialogs, error handling

### 🔄 To Replace (Current Trading → Yield Farming)
- **Buy/Sell Commands** → **Zap Commands**
  - Replace `/buy` → `/zap` (deposit into yield pools)
  - Replace `/sell` → `/harvest` (claim yields + compound)
- **Token Selection** → **Pool Selection** 
  - Replace token address input → DeFi pool selection
- **Swap Logic** → **Zap Logic**
  - Replace OpenOcean API → 1inch + Pool-specific zapping
- **Transaction Types** → **DeFi Operations**
  - Replace swaps → zaps, harvests, rebalancing

## Fork Transformation Plan

### Phase 1: Core Infrastructure (Week 1)
**Goal**: Adapt existing bot foundation for DeFi operations

```typescript
// Replace existing commands
src/commands/
├── buy.ts          → zap.ts           // Zap into yield pools  
├── sell.ts         → harvest.ts       // Harvest & compound yields
├── balance.ts      → portfolio.ts     // Show yield positions
├── settings.ts     → strategy.ts      // Risk/yield preferences
└── (keep others)   → wallet.ts, start-help.ts, etc.
```

**Database Schema Updates**:
```sql
-- Add DeFi-specific tables
CREATE TABLE positions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  pool_id VARCHAR(100),        -- From DeFi Garden
  protocol VARCHAR(50),        -- "Aave", "Pendle", etc.
  chain VARCHAR(20),           -- "Ethereum", "Base", etc.
  token_symbol VARCHAR(10),    -- "USDC", "ETH", etc.
  amount_invested DECIMAL(18,6),
  current_value DECIMAL(18,6),
  entry_apy DECIMAL(5,2),
  current_apy DECIMAL(5,2),
  tx_hash VARCHAR(66),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Modify transactions table for DeFi ops
ALTER TABLE transactions ADD COLUMN operation_type VARCHAR(20); -- 'zap', 'harvest', 'compound'
ALTER TABLE transactions ADD COLUMN pool_id VARCHAR(100);
ALTER TABLE transactions ADD COLUMN yield_earned DECIMAL(18,6);
```

### Phase 2: DeFi Garden Integration (Week 2)
**Goal**: Connect to DeFi Garden's yield data API

**New Library**: `src/lib/yield-optimizer.ts`
```typescript
interface YieldOpportunity {
  poolId: string;
  protocol: string;
  chain: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  riskScore: number;
}

export class YieldOptimizer {
  async getBestPools(token: string, minApy: number, riskLevel: number) {
    // Fetch from DeFi Garden / DeFiLlama API
    const response = await fetch('https://yields.llama.fi/pools');
    const pools = await response.json();
    
    return pools
      .filter(pool => pool.symbol.includes(token))
      .filter(pool => pool.apy >= minApy)
      .filter(pool => this.calculateRiskScore(pool) <= riskLevel)
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 10);
  }
}
```

**Updated Command**: `src/commands/zap.ts`
```typescript
// Automation-first zap logic
export const zapHandler: CommandHandler = {
  command: "zap",
  description: "Auto-deploy to best pools or choose advanced options",
  handler: async (ctx: BotContext) => {
    const amount = parseFloat(ctx.match);
    const token = ctx.session.tempData?.selectedToken || 'USDC';
    
    // Gas protection check (CRITICAL)
    const gasEstimate = await getGasEstimate();
    const gasRatio = gasEstimate / (amount * tokenPrice);
    
    if (gasRatio > 0.1) {
      await ctx.reply(
        `⛽ *Gas Alert*\n\n` +
        `Gas cost ($${gasEstimate.toFixed(2)}) is ${(gasRatio*100).toFixed(1)}% of your investment.\n\n` +
        `Consider:\n` +
        `• Larger amount (gas becomes smaller %)\n` +
        `• Switch to Base/Arbitrum (cheaper gas)\n` +
        `• Wait for lower gas prices\n\n` +
        `[💸 Continue Anyway] [🔄 Switch Chain] [⏰ Wait for Lower Gas]`
      );
      return;
    }

    // Auto-deployment (DEFAULT FLOW)
    await ctx.reply(`🤖 *Auto-Deploying $${amount} ${token}*\n\n⏳ Scanning 47 pools across 5 chains...`);
    
    const bestPool = await findBestPool(token, ctx.session.riskSettings);
    
    await ctx.editMessageText(
      `🎯 *Selected Best Match*\n\n` +
      `${bestPool.protocol} ${token} Pool\n` +
      `• **${bestPool.apy}% APY** (${bestPool.breakdown})\n` +
      `• **$${(bestPool.tvlUsd/1000000).toFixed(0)}M TVL** (${bestPool.safetyRating})\n` +
      `• **Audited** by ${bestPool.auditor}\n` +
      `• **Gas**: $${bestPool.gasCost} (${bestPool.chain})\n\n` +
      `**Why this pool?**\n` +
      `✅ Matches your risk settings (${ctx.session.riskSettings.level}/10)\n` +
      `✅ Highest APY among safe options\n` +
      `✅ Strong track record (${bestPool.trackRecord})\n\n` +
      `**Risks**: ${bestPool.risks.join(', ')}\n\n` +
      `Deploy in 3... 2... 1...`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Deploy $" + amount, callback_data: "confirm_deploy" }],
            [{ text: "⚙️ Advanced Options", callback_data: "show_advanced" }],
            [{ text: "📊 Why This Pool?", callback_data: "explain_selection" }],
            [{ text: "❌ Cancel", callback_data: "cancel_zap" }]
          ]
        }
      }
    );
  }
};

// Handle protocol selection
export async function handleProtocolSelection(ctx: BotContext): Promise<void> {
  const userChain = await getUserChain(ctx.session.userId); // Base, Ethereum, etc.
  const selectedToken = ctx.session.tempData.token;
  
  // Get popular protocols for this chain + token
  const availableProtocols = await getProtocolsForChainAndToken(userChain, selectedToken);
  
  // Show protocol selection with APY info
  let protocolText = `🔧 *Choose Protocol for ${selectedToken}*\n\n`;
  protocolText += `Popular on ${userChain}:\n\n`;
  
  const keyboard = [];
  for (const protocol of availableProtocols.slice(0, 6)) { // Top 6 protocols
    protocolText += `• ${protocol.name}: ${protocol.apy}% APY (${protocol.risk})\n`;
    keyboard.push([{ 
      text: `${protocol.name} - ${protocol.apy}%`, 
      callback_data: `protocol_${protocol.id}` 
    }]);
  }
  
  keyboard.push([{ text: "🤖 Just Pick Best APY", callback_data: "protocol_auto" }]);
  
  await ctx.editMessageText(protocolText, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
}

// Handle auto deployment
export async function handleAutoDeployment(ctx: BotContext): Promise<void> {
  const selectedToken = ctx.session.tempData.token;
  const amount = ctx.session.tempData.amount;
  
  // Find pools with 10M+ TVL for safety
  const safePools = await getPoolsWithMinTVL(selectedToken, 10_000_000);
  const bestPool = safePools.sort((a, b) => b.apy - a.apy)[0];
  
  await ctx.editMessageText(
    `🤖 *Auto-Deployment Selected*\n\n` +
    `Token: ${selectedToken}\n` +
    `Amount: ${amount}\n` +
    `Selected Pool: ${bestPool.protocol} ${selectedToken}\n` +
    `APY: ${bestPool.apy}%\n` +
    `TVL: $${(bestPool.tvlUsd / 1_000_000).toFixed(1)}M\n` +
    `Risk: ${bestPool.riskScore}/10\n\n` +
    `This pool was auto-selected based on:\n` +
    `✅ Highest APY (${bestPool.apy}%)\n` +
    `✅ Safe TVL (>$10M)\n` +
    `✅ Audited protocol\n\n` +
    `Proceed with this investment?`,
    {
      parse_mode: "Markdown",
      reply_markup: createConfirmationKeyboard()
    }
  );
}
```

### Phase 3: Zapping Infrastructure (Week 3)
**Goal**: Replace OpenOcean swaps with 1inch + DeFi protocol zapping

**New Library**: `src/lib/zap-executor.ts`
```typescript
export class ZapExecutor {
  constructor(
    private oneInchApi: string,
    private rpcProvider: string
  ) {}

  async executeZap(
    userWallet: Wallet,
    fromToken: string,
    pool: YieldOpportunity,
    amount: string
  ): Promise<TransactionReceipt> {
    
    // Step 1: Get optimal swap route via 1inch
    const swapRoute = await this.get1inchSwap(
      fromToken,
      pool.underlyingToken,
      amount
    );
    
    // Step 2: Get pool-specific deposit calldata
    const depositCalldata = await this.getPoolDepositData(
      pool.protocol,
      pool.poolAddress,
      swapRoute.outputAmount
    );
    
    // Step 3: Build multicall transaction (swap + deposit)
    const zapTransaction = await this.buildZapTransaction([
      swapRoute.data,
      depositCalldata
    ]);
    
    // Step 4: Execute with MEV protection
    return await userWallet.sendTransaction(zapTransaction);
  }
}
```

**Protocol-Specific Zapping**:
```typescript
// src/lib/protocols/
├── aave.ts      // Aave lending pools
├── pendle.ts    // Pendle yield tokens  
├── yearn.ts     // Yearn vaults
├── compound.ts  // Compound lending
└── uniswap.ts   // Uniswap V3 LP positions
```

### Phase 4: Portfolio & Harvest (Week 4)
**Goal**: Track user positions and yield harvesting

**Updated Command**: `src/commands/portfolio.ts`
```typescript
export const portfolioHandler: CommandHandler = {
  handler: async (ctx: BotContext) => {
    const positions = await getUserPositions(ctx.session.userId);
    
    let portfolioText = "📊 *Your DeFi Portfolio*\n\n";
    let totalValue = 0;
    let totalYield = 0;
    
    for (const position of positions) {
      const currentValue = await getCurrentPositionValue(position);
      const yieldEarned = currentValue - position.amount_invested;
      
      portfolioText += `💎 ${position.protocol} ${position.token_symbol}\n`;
      portfolioText += `   Invested: $${position.amount_invested.toFixed(2)}\n`;
      portfolioText += `   Current: $${currentValue.toFixed(2)}\n`;
      portfolioText += `   APY: ${position.current_apy}%\n`;
      portfolioText += `   Yield: +$${yieldEarned.toFixed(2)}\n\n`;
      
      totalValue += currentValue;
      totalYield += yieldEarned;
    }
    
    portfolioText += `💰 Total Portfolio: $${totalValue.toFixed(2)}\n`;
    portfolioText += `📈 Total Yield: +$${totalYield.toFixed(2)}`;
    
    await ctx.reply(portfolioText, {
      parse_mode: "Markdown",
      reply_markup: createPortfolioKeyboard() // [Harvest All] [Rebalance] [Details]
    });
  }
};
```

**Harvest Command**: `src/commands/harvest.ts`
```typescript
export const harvestHandler: CommandHandler = {
  handler: async (ctx: BotContext) => {
    const positions = await getUserPositions(ctx.session.userId);
    
    // Check which positions have claimable yields
    const harvestablePositions = await checkHarvestableYields(positions);
    
    if (harvestablePositions.length === 0) {
      await ctx.reply("🌱 No yields ready to harvest yet.\nCheck back later!");
      return;
    }
    
    // Show harvestable yields
    let harvestText = "🌾 *Ready to Harvest*\n\n";
    let totalHarvestable = 0;
    
    for (const position of harvestablePositions) {
      const claimable = await getClaimableYield(position);
      harvestText += `${position.protocol}: +$${claimable.toFixed(2)}\n`;
      totalHarvestable += claimable;
    }
    
    harvestText += `\n💰 Total: +$${totalHarvestable.toFixed(2)}\n\n`;
    harvestText += `Choose harvest strategy:`;
    
    await ctx.reply(harvestText, {
      parse_mode: "Markdown", 
      reply_markup: {
        inline_keyboard: [
          [{ text: "💸 Withdraw to Wallet", callback_data: "harvest_withdraw" }],
          [{ text: "🔄 Auto-compound", callback_data: "harvest_compound" }],
          [{ text: "🎯 Rebalance to Better Yields", callback_data: "harvest_rebalance" }]
        ]
      }
    });
  }
};
```

## Key Differentiators from Original Bot

### 1. User-Controlled Protocol Selection
- **Original**: User manually enters token addresses
- **DeFi Bot**: User chooses specific protocols (Aave, Aerodrome, Pendle) OR auto-selection
- **UI Flow**: `[🎯 Choose Protocol] [🤖 Auto-Deploy] [📊 Compare All]`

**Example Flow:**
```
User: /zap
Bot: 🚀 How do you want to invest your USDC?
     [🎯 Choose Protocol] [🤖 Auto-Deploy] [📊 Compare All]

User: [Choose Protocol]  
Bot: 🔧 Popular protocols on Base for USDC:
     • Aave - 5.2% APY [Safe]
     • Aerodrome - 18.4% APY [Medium Risk] 
     • Pendle - 23.1% APY [Higher Risk]
     • Compound - 4.8% APY [Safe]
     [🤖 Just Pick Best APY]

User: [Aerodrome - 18.4%]
Bot: ✅ Deploying to Aerodrome USDC pool...
```

### 2. Risk-Based Recommendations  
```typescript
// Risk scoring algorithm
calculateRiskScore(pool) {
  let risk = 0;
  
  // TVL risk (higher TVL = lower risk)
  if (pool.tvlUsd < 1000000) risk += 3;
  else if (pool.tvlUsd < 10000000) risk += 2;
  else risk += 1;
  
  // Protocol reputation
  const protocolRisk = {
    'Aave': 1, 'Compound': 1, 'Yearn': 2, 
    'Pendle': 2, 'New Protocol': 5
  };
  risk += protocolRisk[pool.project] || 4;
  
  // Impermanent loss risk
  if (pool.ilRisk === 'yes') risk += 2;
  
  return Math.min(risk, 10);
}
```

### 3. Multi-Chain Support
- **Original**: Base-only
- **DeFi Bot**: Ethereum, Arbitrum, Polygon, Base, Optimism
- **Auto-bridging**: Integrate LI.FI for cross-chain zaps

### 4. Automated Strategies
```typescript
// User preferences
interface UserStrategy {
  riskTolerance: 1 | 2 | 3 | 4 | 5;  // 1=safest, 5=degen
  minApy: number;                     // Minimum acceptable APY
  maxGasPerTx: number;               // Max gas willing to spend
  autoCompound: boolean;             // Auto-compound yields?
  rebalanceThreshold: number;        // Rebalance if APY drops below %
}
```

## Updated Bot Commands

```
📊 Portfolio Commands:
/portfolio - View all positions and yields
/harvest - Claim yields (withdraw/compound/rebalance)  
/rebalance - Move funds to better opportunities

💰 Investment Commands:
/zap - Choose protocol (Aave, Aerodrome, etc.) or auto-deploy
/strategy - Set risk preferences and auto-settings  
/protocols - Browse protocols available on your chain

🔧 Wallet Commands: (unchanged)
/start, /wallet, /balance, /deposit, /withdraw, /settings
```

## Revenue Model: Trust-First Approach

### 1. Assets Under Management (AUM) Model
**Why AUM over Performance Fees**: Performance fees create misaligned incentives and user blame ("you made money when I lost money")

- **0.8% annual AUM fee** (0.067% monthly, charged monthly)
- **0% performance fees** (builds trust, users keep all gains)
- **First 30 days free** (no fees during trial period)
- **Transparent calculation**: "Monthly fee: $1M AUM × 0.067% = $667"

### 2. Premium Features ($15/month)
- **Advanced Strategies**: Multi-protocol diversification, risk parity
- **Multi-Chain Management**: Unified dashboard across all chains  
- **Priority Execution**: Jump ahead in gas price queues
- **Portfolio Analytics**: Sharpe ratios, drawdown analysis, benchmarking

### 3. Revenue Projection at Scale
```
Monthly Revenue Model:
├── $2M AUM × 0.8% / 12 = $1,333/month AUM fees
├── 500 premium users × $15 = $7,500/month subscriptions  
├── White-label licensing = $5,000/month recurring
└── Total: ~$14K/month sustainable revenue

Break-even point: $500K AUM + 200 premium users
```

### 4. Trust-Building Pricing Strategy
- **Days 1-30**: Completely free, no hidden fees
- **Days 31-180**: 50% discount (0.4% annual AUM fee)  
- **Day 181+**: Full pricing with grandfathered early adopter rates
- **Always**: No performance fees, no exit fees, no surprise charges

## Risk Management: The Non-Negotiables

### 1. TVL Circuit Breakers (CRITICAL)
```javascript
const safetyRules = {
  minimumTVL: {
    autoDeployment: 100_000_000, // $100M minimum for auto-deployment
    manualOverride: 10_000_000,  // $10M absolute minimum even if user chooses
    reasoning: "Below $10M TVL = high rug pull risk"
  },
  
  emergencyThresholds: {
    tvlDrop: 0.5,        // Alert if TVL drops >50% in 1 hour
    massExodus: 0.3,     // Alert if >30% users withdraw in 24h
    apyCollapse: 0.8     // Alert if APY drops >80% suddenly
  }
};
```

### 2. Gas Cost Protection (PRODUCT KILLER IF MISSING)
```javascript
const gasProtection = {
  maxGasRatio: 0.1,    // Gas can't exceed 10% of investment
  
  protection: {
    if: "gasRatio > 0.1",
    action: "block_transaction",
    alternatives: [
      "Suggest larger investment amount",
      "Recommend cheaper chain (Base/Arbitrum)", 
      "Wait for lower gas prices",
      "Batch with other operations"
    ]
  },
  
  gasEstimation: {
    method: "Real-time estimation + 20% buffer",
    update: "Every block for accuracy"
  }
};
```

### 3. Emergency Response System
```javascript
const emergencyProtocol = {
  monitoring: "24/7 protocol health via multiple data sources",
  
  alertTriggers: [
    "Smart contract exploit detected",
    "Governance attack in progress", 
    "Massive unusual withdrawals",
    "Protocol team communication breakdown"
  ],
  
  userNotification: {
    method: "Immediate push notification",
    message: "🚨 URGENT: Issue detected with your Aave position. Consider immediate withdrawal.",
    action: "1-click emergency exit prepared - tap to execute"
  }
};
```

## 90-Day Launch Strategy: Proven FinTech Approach

### Phase 1: Stealth Validation (Days 1-30)
**Goal**: Prove core concept with minimal risk

- **50 beta users** (DeFi-native early adopters from Twitter/Discord)
- **Base network only** (cheapest gas, fastest transactions)
- **USDC stablecoin only** (eliminates volatility risk from equation)
- **3 protocols max** (Aave, Compound, Yearn - battle-tested only)
- **Manual approval** for every deployment (catch edge cases)

**Success Criteria**:
- 80%+ user satisfaction score
- 0 security incidents or user fund losses  
- $25K+ AUM across 50 users ($500 average)
- <2% monthly churn rate

### Phase 2: Controlled Expansion (Days 31-60)
**Goal**: Scale with safety guardrails

- **500 users** (refer-a-friend program, controlled onboarding)
- **Add Arbitrum + Polygon** (still cheap gas, more options)
- **Add ETH + WBTC** (expand beyond stablecoins carefully)
- **Add 5 more protocols** (Pendle, Yearn, Convex - higher yield options)
- **Auto-deployment enabled** (with all safety checks)

**Success Criteria**:
- $200K+ AUM across 500 users ($400 average)
- <5% monthly churn rate
- Net Promoter Score >70 (very strong product-market fit)
- 95%+ uptime with <1 second response times

### Phase 3: Public Launch (Days 61-90)
**Goal**: Sustainable growth engine

- **Public launch** on Twitter, Product Hunt, Reddit
- **Influencer partnerships** (sponsor DeFi educator content)
- **All major chains** (Ethereum, Arbitrum, Polygon, Base, Optimism)
- **Full protocol suite** (15+ protocols across risk spectrum)
- **Advanced features** (auto-rebalancing, portfolio analytics)

**Success Criteria**:
- $1M+ AUM across 2,000+ users
- $5K+/month recurring revenue (break-even point)
- Product Hunt #1 Product of the Day
- Waitlist for premium features (demand validation)

## Implementation Timeline

### Week 1-2: Fork Adaptation ✅
- [x] Copy and analyze QuickNode bot structure  
- [x] Design new command flows for DeFi operations
- [ ] Update database schema for DeFi positions
- [ ] Create DeFi Garden API integration layer

### Week 3-4: Core DeFi Features
- [ ] Implement `/zap` command with pool selection
- [ ] Build 1inch integration for optimal swapping
- [ ] Add protocol-specific zapping (Aave, Pendle, Yearn)
- [ ] Create `/portfolio` tracking with real-time values

### Week 5-6: Advanced Features  
- [ ] Implement `/harvest` with compound/withdraw options
- [ ] Add risk-based yield recommendations
- [ ] Build auto-rebalancing logic
- [ ] Add multi-chain support via LI.FI

### Week 7-8: Polish & Deploy
- [ ] Comprehensive testing with small amounts
- [ ] Security audit of wallet and transaction logic  
- [ ] Deploy to production with monitoring
- [ ] Launch with initial user acquisition

## Marketing & Distribution

### 1. Telegram Community Launch
- **Target**: DeFi-focused Telegram groups and channels
- **Value Prop**: "Earn 15%+ APY on stablecoins with zero knowledge required"  
- **Demo**: Live yield farming sessions in groups

### 2. Influencer Partnerships
- **Crypto YouTubers**: Sponsor DeFi education content
- **Twitter Threads**: Partner with DeFi influencers for feature explanations
- **Podcast Appearances**: Discuss automated yield farming on crypto podcasts

### 3. Product Hunt & Reddit
- **Launch Story**: "The first Telegram bot that makes DeFi yield farming as easy as sending a message"
- **Demo Videos**: Screen recordings showing the full flow
- **AMA Sessions**: Answer questions about security and yields

## Success Metrics

### Month 1 Goals
- **100 users** sign up and create wallets
- **$50K TVL** managed through the bot
- **15%+ average APY** delivered to users
- **95% uptime** with zero security incidents

### Month 3 Goals  
- **1,000 users** with active positions
- **$500K TVL** across multiple protocols
- **$5K monthly revenue** from performance fees
- **3+ protocol integrations** (Aave, Pendle, Yearn)

### Month 6 Goals
- **5,000 users** across multiple Telegram communities  
- **$2M TVL** with multi-chain support
- **$25K monthly revenue** from fees and premium subscriptions
- **Mobile app companion** for advanced users

## The Bottom Line: What Makes This Bot Different

### ✅ **Automation-First UX** (Like Robinhood for DeFi)
```
User: /zap 500 USDC
Bot: 🤖 Auto-selected Compound USDC (4.2% APY, $980M TVL, audited)
     ✅ Deploy $500  [⚙️ Advanced Options]
```

### 🛡️ **Built-in Safety Nets** (That Other Bots Miss)
- **Gas protection**: Blocks transactions where gas >10% of investment
- **TVL minimums**: Auto-deployment only to $100M+ TVL pools
- **Emergency monitoring**: 24/7 protocol health with 1-click exits
- **User agency**: "You set rules, I execute them" (liability protection)

### 💰 **Sustainable Economics** (AUM vs Performance Fees)
- **0.8% annual AUM fee** aligns our success with user success
- **0% performance fees** builds trust (users keep all gains)
- **30-day free trial** proves value before charging

### 🚀 **Proven Launch Strategy** (90-day incremental rollout)
- **Days 1-30**: 50 beta users, Base only, USDC only, manual approval
- **Days 31-60**: 500 users, add ETH/WBTC, enable auto-deployment  
- **Days 61-90**: Public launch, all chains, full protocol suite

This transforms the QuickNode trading bot into a **"DeFi autopilot"** that makes yield farming as simple as sending a Telegram message, while incorporating hard-learned lessons from 20 years of FinTech product failures and successes.