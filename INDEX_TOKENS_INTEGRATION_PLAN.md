# Index Tokens Integration Plan

## Executive Summary
This document outlines the comprehensive plan to integrate Index token investments into the DeFi Garden Telegram bot. Index tokens will provide users with a new investment category that purchases token baskets instead of earning yield on USDC deposits.

## Transaction Analysis from Stack Traces

### Transaction Flow Analysis
Based on the provided stack traces, the Index token investment follows this pattern:

**1. USDC Approval (0x506268b...)**
- Contract: FiatTokenProxy (USDC on Base)
- Function: `approve(spender, value)`
- Spender: `0x0d05a7d3448512b78fa8a9e46c4872c88c4a0d05` (OdosRouterV3)
- Value: `12000000` (12 USDC)
- Gas Used: 55,425

**2. Index Token Swap (0xc170326...)**
- Contract: OdosRouterV3 (`0x0d05a7d3448512b78fa8a9e46c4872c88c4a0d05`)
- Function: `swapCompact()`
- Input: 10 USDC → 0.837 LCAP tokens (Index token)
- Gas Used: 290,479
- Total Transaction Cost: ~$0.0025 ETH

### Key Contracts Identified
- **USDC**: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`
- **OdosRouterV3**: `0x0d05a7d3448512b78fa8a9e46c4872c88c4a0d05`
- **LCAP Token** (Example Index): `0x4da9a0f397db1397902070f93a4d6ddbc0e0e6e8`

## Current Protocol Integration Patterns

### Menu Structure Analysis
Current earning flow: **Main Menu** → **🦑 Start Earning** → **Protocol Selection** → **Amount Input** → **Confirmation** → **Execution**

### Database Schema Analysis
Current position tracking uses:
- `positions` table with: poolId, protocol, chain, tokenSymbol, amountInvested, currentValue
- `transactions` table with: operationType ('zap'), protocol, tokenSymbol, amount

### Balance Tracking Patterns
Each protocol has dedicated service files:
- `morpho-defi.ts`, `spark-defi.ts`, etc.
- Balance fetching functions: `getMorphoBalance()`, `getSparkBalance()`, etc.
- Portfolio integration via balance aggregation

## Proposed Index Token Architecture

### 1. Menu Structure Changes

#### New Menu Option
Add new button alongside "🦑 Start Earning":
```
🦑 Start Earning  |  📊 Buy Index Tokens
     (Yield)      |    (Token Baskets)
```

#### Index Token Menu Flow
```
📊 Buy Index Tokens → Index Selection → Amount Input → Confirmation → Execution
```

#### Index Categories
```
📊 **Choose Index Type**

🏛️ Blue Chip Index
• BTC, ETH, major tokens
• Lower risk, steady growth

🚀 DeFi Index  
• AAVE, UNI, COMP tokens
• Medium risk, higher upside

💎 Emerging Index
• New protocols, L2 tokens  
• Higher risk, max upside

🌍 Sector Rotation
• AI, Gaming, RWA themes
• Theme-based investing
```

### 2. Database Schema Extensions

#### New Tables
```sql
-- Index tokens metadata
CREATE TABLE index_tokens (
  tokenId TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'blue_chip', 'defi', 'emerging', 'sector'
  contractAddress TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  description TEXT,
  riskLevel INTEGER NOT NULL, -- 1-10
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt INTEGER NOT NULL,
  lastUpdated INTEGER NOT NULL
);

-- Index compositions (what tokens are in each index)
CREATE TABLE index_compositions (
  id TEXT PRIMARY KEY,
  indexTokenId TEXT NOT NULL,
  underlyingToken TEXT NOT NULL,
  underlyingSymbol TEXT NOT NULL,
  weightPercentage REAL NOT NULL,
  lastUpdated INTEGER NOT NULL,
  FOREIGN KEY (indexTokenId) REFERENCES index_tokens(tokenId)
);

-- Index positions (user holdings)
CREATE TABLE index_positions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  indexTokenId TEXT NOT NULL,
  tokensOwned REAL NOT NULL,
  averageBuyPrice REAL NOT NULL, -- in USDC
  totalInvested REAL NOT NULL, -- Total USDC spent
  currentValue REAL NOT NULL, -- Current USD value
  firstPurchaseAt INTEGER NOT NULL,
  lastUpdatedAt INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(userId),
  FOREIGN KEY (indexTokenId) REFERENCES index_tokens(tokenId)
);

-- Index transactions
CREATE TABLE index_transactions (
  txHash TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  indexTokenId TEXT NOT NULL,
  operationType TEXT NOT NULL, -- 'buy', 'sell'
  usdcAmount REAL NOT NULL, -- Amount in USDC
  tokensAmount REAL NOT NULL, -- Index tokens received/sold
  pricePerToken REAL NOT NULL, -- USDC per index token
  gasUsed TEXT,
  status TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(userId),
  FOREIGN KEY (indexTokenId) REFERENCES index_tokens(tokenId)
);
```

### 3. Service Layer Architecture

#### New Service Files Structure
```
src/services/
├── index-tokens/
│   ├── index-core.ts        # Core index operations
│   ├── odos-router.ts       # Odos integration for swaps
│   ├── index-balance.ts     # Balance fetching
│   ├── index-pricing.ts     # Price feed integration
│   └── index-metadata.ts    # Token metadata management
```

#### Core Service Functions
```typescript
// index-core.ts
export async function buyIndexToken(
  userId: string,
  indexTokenId: string, 
  usdcAmount: string
): Promise<{ success: boolean; txHash?: string; error?: string }>

export async function sellIndexToken(
  userId: string,
  indexTokenId: string,
  tokenAmount: string // or "max"
): Promise<{ success: boolean; txHash?: string; error?: string }>

// index-balance.ts  
export async function getIndexBalance(
  userAddress: Address,
  indexTokenId: string
): Promise<{
  balance: bigint;
  balanceFormatted: string;
  valueInUSDC: string;
}>

export async function getAllIndexBalances(
  userAddress: Address
): Promise<IndexBalanceInfo[]>

// index-pricing.ts
export async function getIndexTokenPrice(
  indexTokenAddress: Address
): Promise<{
  priceInUSDC: number;
  priceChange24h: number;
  marketCap: number;
}>
```

### 4. Integration with Existing Systems

#### Portfolio Integration
Extend existing portfolio display to include Index positions:

```typescript
// In portfolio.ts, add:
const [indexBalances] = await Promise.all([
  getAllIndexBalances(walletAddress),
  // ... existing balance fetching
]);

// Display index positions alongside yield positions:
if (indexBalances.length > 0) {
  message += `📊 **Your Index Investments**\n\n`;
  for (const position of indexBalances) {
    const dailyChange = calculateDailyChange(position);
    message += `${position.symbol}: ${position.balanceFormatted} tokens\n`;
    message += `Value: $${position.valueInUSDC} (${dailyChange}%)\n\n`;
  }
}
```

#### Main Menu Integration
Update `mainMenu.ts` to show Index positions in user state detection:

```typescript
// Add to existing balance checks:
const indexBalances = await getAllIndexBalances(walletAddress);
const totalIndexValue = indexBalances.reduce((sum, pos) => sum + parseFloat(pos.valueInUSDC), 0);

if (totalIndexValue > 0.01) {
  message += `📊 **Index Investments:** $${totalIndexValue.toFixed(2)}\n`;
}
```

### 5. Gasless Transaction Implementation

#### Coinbase Smart Wallet Integration
Extend existing gasless pattern for Index tokens:

```typescript
// In index-core.ts
export async function gaslessBuyIndexToken(
  userId: string,
  indexTokenId: string,
  usdcAmount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  
  const smartAccount = await getCoinbaseSmartWallet(userId);
  const bundlerClient = await createSponsoredBundlerClient(smartAccount);
  
  // Multi-call operations:
  const operations = [
    // 1. Approve USDC for OdosRouter
    {
      to: BASE_TOKENS.USDC,
      value: '0',
      data: approveCalldata,
    },
    // 2. Execute swap via OdosRouter
    {
      to: ODOS_ROUTER_V3,
      value: '0', 
      data: swapCompactCalldata,
    }
  ];
  
  const txHash = await bundlerClient.sendUserOperation({
    account: smartAccount,
    calls: operations
  });
  
  return { success: true, txHash };
}
```

#### Odos Router Integration
Create dedicated service for Odos Router operations:

```typescript
// odos-router.ts
export async function buildSwapCalldata(
  inputToken: Address,
  outputToken: Address,
  inputAmount: bigint,
  userAddress: Address,
  slippage: number = 1.0 // 1%
): Promise<`0x${string}`> {
  
  // Get quote from Odos API
  const quote = await getOdosQuote({
    inputTokens: [{ tokenAddress: inputToken, amount: inputAmount.toString() }],
    outputTokens: [{ tokenAddress: outputToken, proportion: 1 }],
    userAddr: userAddress,
    slippageLimitPercent: slippage
  });
  
  // Return swapCompact calldata
  return quote.transaction.data;
}

async function getOdosQuote(params: OdosQuoteParams) {
  const response = await fetch('https://api.odos.xyz/sor/quote/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return response.json();
}
```

### 6. Command Handler Updates

#### New Command Structure
```typescript
// src/commands/index-tokens.ts
const indexTokensHandler: CommandHandler = {
  command: "index",
  description: "Buy and manage index token investments",
  handler: async (ctx: BotContext) => {
    // Show available index categories
    const keyboard = new InlineKeyboard()
      .text("🏛️ Blue Chip Index", "index_blue_chip")
      .row()
      .text("🚀 DeFi Index", "index_defi") 
      .row()
      .text("💎 Emerging Index", "index_emerging")
      .row()
      .text("🌍 Sector Rotation", "index_sector");
      
    await ctx.reply("📊 **Choose Index Type**\n\n...", {
      reply_markup: keyboard
    });
  }
};
```

#### Callback Handlers
```typescript
// Handle index category selection
export async function handleIndexCategorySelection(
  ctx: BotContext, 
  category: string
): Promise<void> {
  const availableIndexes = await getIndexesByCategory(category);
  // Show specific index options...
}

// Handle index token selection  
export async function handleIndexTokenSelection(
  ctx: BotContext,
  indexTokenId: string  
): Promise<void> {
  ctx.session.tempData = { selectedIndexToken: indexTokenId };
  ctx.session.currentAction = "index_amount";
  // Ask for investment amount...
}

// Handle amount input for index purchase
export async function handleIndexAmountInput(ctx: BotContext): Promise<void> {
  // Similar to existing zap amount input but for index tokens
  // Validate amount, check balances, show confirmation
}

// Handle index purchase confirmation
export async function handleIndexPurchaseConfirmation(
  ctx: BotContext,
  confirmed: boolean
): Promise<void> {
  if (confirmed) {
    await executeIndexPurchase(ctx);
  }
}
```

### 7. Menu Integration Points

#### Main Menu Updates
```typescript
// In mainMenu.ts
export function createMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🦑 Start Earning", "zap_funds")
    .text("📊 Buy Indexes", "buy_index_tokens") // NEW
    .row()
    .text("💼 Investments", "view_portfolio")
    .text("💰 Check Balance", "check_balance")
    .row()
    .text("🌿 Collect Earnings", "harvest_yields")  
    .text("💵 Sell Positions", "sell_positions") // NEW
    .row()
    .text("⚙️ Settings", "open_settings")
    .text("📋 Help", "help");
}
```

#### Portfolio Menu Updates
```typescript
// In portfolio.ts, extend existing keyboard:
const keyboard = new InlineKeyboard()
  .text("🦑 Earn More", "zap_funds")
  .text("📊 Buy Indexes", "buy_index_tokens") // NEW
  .row()
  .text("💰 Collect Earnings", "harvest_yields")
  .text("💵 Sell Indexes", "sell_index_positions") // NEW
  .row()
  // ... existing buttons
```

## Implementation Roadmap

### Phase 1: Core Infrastructure (Week 1-2)
1. **Database Schema Setup**
   - Create index-related tables
   - Add migration scripts
   - Test data integrity

2. **Basic Service Layer**
   - Implement `index-core.ts` basic functions
   - Create `odos-router.ts` integration
   - Build `index-balance.ts` fetching

3. **Menu Structure**
   - Add Index button to main menu
   - Create basic index selection flow
   - Implement category navigation

### Phase 2: Transaction Integration (Week 3-4)
1. **Gasless Transactions**
   - Extend Coinbase Smart Wallet integration
   - Implement multi-call patterns
   - Add error handling and retries

2. **Odos Router Integration**
   - API integration for quotes
   - Calldata building for swaps
   - Slippage protection

3. **Balance Tracking**
   - Real-time balance fetching
   - Price feed integration
   - Portfolio value calculations

### Phase 3: User Experience (Week 5-6)
1. **Portfolio Integration** 
   - Display index positions alongside yield positions
   - Combined portfolio value calculations
   - Performance tracking and PnL

2. **Enhanced Features**
   - Index metadata and descriptions
   - Composition viewing (what tokens are in each index)
   - Performance charts and analytics

3. **Selling/Management**
   - Sell index positions
   - Partial vs full position management
   - Transaction history

### Phase 4: Advanced Features (Week 7-8)
1. **Price Feeds and Analytics**
   - Real-time pricing from multiple sources
   - 24h price changes and volatility
   - Historical performance tracking

2. **Risk Management**
   - Position size limits
   - Diversification warnings
   - Risk scoring for index categories

3. **User Education**
   - Index explanations and tutorials
   - Risk warnings and disclosures
   - Best practices guidance

## File Changes Required

### New Files to Create
```
src/commands/index-tokens.ts          # Main command handler
src/services/index-tokens/
  ├── index-core.ts                   # Core buy/sell operations
  ├── odos-router.ts                  # Odos API integration
  ├── index-balance.ts                # Balance and value fetching
  ├── index-pricing.ts                # Price feed integration
  └── index-metadata.ts               # Token metadata management
src/types/index-tokens.ts             # TypeScript types
src/utils/index-constants.ts          # Index-related constants
migrations/add-index-tables.sql       # Database migration
```

### Files to Modify
```
src/utils/mainMenu.ts                 # Add index menu options
src/commands/portfolio.ts             # Display index positions
src/lib/database.ts                   # Add index queries
src/context.ts                        # Add index session state
index.ts                              # Register index handlers
src/types/config.ts                   # Add index types
```

### Configuration Updates
```typescript
// In src/utils/constants.ts
export const INDEX_CONTRACTS = {
  ODOS_ROUTER_V3: "0x0d05a7d3448512b78fa8a9e46c4872c88c4a0d05" as Address,
  // Add other index-related contracts
};

export const INDEX_CATEGORIES = {
  BLUE_CHIP: 'blue_chip',
  DEFI: 'defi', 
  EMERGING: 'emerging',
  SECTOR: 'sector'
};
```

## Testing Strategy

### Unit Testing
- Test index purchase/sell operations
- Validate balance calculations
- Test database operations

### Integration Testing  
- End-to-end purchase flow
- Gasless transaction execution
- Portfolio display with mixed positions

### User Acceptance Testing
- Test with real users on testnet
- Validate user experience flow
- Gather feedback on interface design

## Risk Considerations

### Technical Risks
- **Odos Router Dependency**: Single point of failure for swaps
- **Price Feed Accuracy**: Ensuring accurate index token pricing
- **Gas Optimization**: Managing transaction costs for complex swaps

### User Experience Risks
- **Complexity**: Index tokens are more complex than yield farming
- **Education**: Users may not understand index composition and risks
- **Expectation Management**: Different return profiles vs yield farming

### Mitigation Strategies
1. **Multiple DEX Integration**: Add Uniswap as backup to Odos
2. **Price Validation**: Cross-reference prices from multiple sources
3. **User Education**: Clear explanations and risk warnings
4. **Gradual Rollout**: Beta testing with limited user group first

## Success Metrics

### User Adoption
- % of users who try index token purchases
- Average index investment amount
- User retention after first index purchase

### Technical Performance
- Transaction success rate for index purchases
- Average transaction confirmation time
- Gas cost optimization effectiveness

### Portfolio Diversification
- % of users with both yield and index positions
- Average portfolio allocation split
- User engagement with different index categories

## Conclusion

This integration plan provides a comprehensive roadmap for adding Index token investments to the DeFi Garden bot. The phased approach allows for iterative development and testing, while the modular architecture ensures clean separation of concerns and maintainability.

The key innovation is extending the existing gasless transaction infrastructure to support DEX swaps, creating a seamless user experience for both yield farming and index token investments within a single interface.

By following this plan, users will be able to diversify their portfolios beyond yield farming into tokenized baskets representing different crypto sectors and strategies, all while maintaining the bot's core value propositions of gasless transactions and simplified user experience.