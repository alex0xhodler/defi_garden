# User Journey Diagrams & Flow Analysis
## Chain-Specific Yield Discovery Feature

**Version:** 1.0  
**Date:** August 6, 2025  
**Related:** PRD_chain_discovery_v1.0.md

---

## Current State User Journey (Baseline)

### Primary Flow: Token-First Discovery
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Homepage  │ → │ Token Search│ → │ Apply Chain │ → │Browse Results│ → │Click Protocol│
│             │    │             │    │   Filter    │    │             │    │             │
│   0:00      │    │    0:45     │    │    1:30     │    │    2:15     │    │    2:45     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

Pain Points:
• 35% abandonment at token search step
• Chain filtering only available AFTER token selection
• Average 2:45 minutes to reach protocol
• Cognitive load: users must know token symbol first
• No direct path for chain-focused exploration
```

### Alternative Current Flow: Exploration Without Specific Token
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Homepage  │ → │ Random Token│ → │  Chain Filter│ → │  Abandonment │
│             │    │Search Attempt│   │  Confusion   │    │  (65% rate)  │
│   0:00      │    │    0:30     │    │    1:15     │    │    1:45     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

Issues:
• No clear entry point for chain exploration
• Users resort to random token searches
• High abandonment when desired chain not visible
• Frustration leads to competitor site visits
```

---

## Desired State User Journey (Target)

### Primary Flow: Chain-First Discovery
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Homepage   │ → │ See Chain   │ → │ Click Chain │ → │Browse Chain │ → │Click Protocol│
│  + Pill     │    │   Pill      │    │   Selection │    │   Yields    │    │             │
│   0:00      │    │    0:05     │    │    0:10     │    │    0:30     │    │    1:00     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

Improvements:
• 60% reduction in time-to-protocol (2:45 → 1:00)
• Immediate value proposition visibility (5 seconds)
• Direct chain access without token dependency
• Clear intent matching for chain-focused users
• Reduced cognitive load
```

### Alternative Flow: Chain Dropdown Navigation
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Homepage   │ → │Chain Dropdown│ → │Select Chain │ → │Apply Filters│ → │ Find Target │
│             │    │   Navigation │    │             │    │ (TVL/APY)   │    │    Yield    │
│   0:00      │    │    0:08     │    │    0:15     │    │    0:25     │    │    0:40     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘

Use Case:
• Power users who know their preferred chain
• Users wanting to compare multiple chains
• Advanced filtering requirements
```

---

## Persona-Specific Journey Analysis

### "Chain-First Explorer" Journey (65% of users)
**Scenario:** Polygon user seeking yields due to low gas fees

```
Current State Journey:
Homepage → Search "USDC" → Filter to Polygon → Find limited results → Frustration
   │         │              │                    │                     │
 0:00      0:30           1:45                 2:30                  3:00
 
Pain: "Why do I have to search for USDC first? I just want Polygon yields!"

Desired State Journey:  
Homepage → Click "Polygon Yields" → Browse all opportunities → Apply TVL filter → Success
   │           │                      │                        │              │
 0:00        0:08                   0:20                     0:35          1:00

Value: "Perfect! I can see everything available on Polygon immediately."
```

### "Multi-Chain Optimizer" Journey (25% of users)
**Scenario:** Advanced user comparing ETH vs Arbitrum yields

```
Current State Journey:
Homepage → Search "ETH" → Note yields → Clear → Search again → Compare manually
   │         │             │           │        │              │
 0:00      0:45          1:30        2:00     2:45           4:00

Pain: "Too much work to compare yields across chains for the same token."

Desired State Journey:
Homepage → Ethereum page → Note yields → Arbitrum page → Quick comparison → Decide
   │           │              │            │               │                │
 0:00        0:10           0:40         0:50            1:30             2:00

Value: "50% faster chain comparison enables better decision making."
```

### "Chain Newcomer" Journey (10% of users)
**Scenario:** First-time Arbitrum explorer

```
Current State Journey:
Homepage → Uncertain what to search → Try "ARB" → No results → Leave confused
   │           │                        │          │           │
 0:00        0:30                     1:00       1:30        2:00

Pain: "I don't know what tokens are available on Arbitrum."

Desired State Journey:
Homepage → "Arbitrum Yields" → Browse all available → Learn ecosystem → Gain confidence  
   │           │                   │                  │                │
 0:00        0:10                0:30               1:00             2:30

Value: "Great way to discover what's possible on this new chain!"
```

---

## Detailed Flow Breakdowns

### Chain Selection Flow Options

#### Option A: Pill-Driven Selection
```
┌─────────────────────────────────────────────────────────┐
│  🌱 DeFi Garden                                         │
│  Find the best yields for your tokens                   │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 🔥 Check best yields on your favorite chain ➜   │  │ ← User sees this
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Click leads to chain selection modal or default chain │
└─────────────────────────────────────────────────────────┘

Pros: High visibility, clear call-to-action
Cons: Requires additional modal/selection step
```

#### Option B: Direct Chain Links in Pill
```
┌─────────────────────────────────────────────────────────┐
│  🌱 DeFi Garden                                         │
│                                                         │
│  ┌──────────┬──────────┬──────────┬──────────┐          │
│  │🔷Ethereum│🟣Polygon │🔵Arbitrum│🔴Optimism│ ← Direct│
│  │ Yields   │ Yields   │ Yields   │ Yields   │   links │
│  └──────────┴──────────┴──────────┴──────────┘          │
└─────────────────────────────────────────────────────────┘

Pros: Immediate access, no additional clicks  
Cons: Limited space, mobile responsive challenges
```

### Chain Page Content Hierarchy

#### Information Architecture
```
1. Page Header
   ├── Chain Name + Icon
   ├── Key Statistics (# pools, TVL, highest APY)
   └── Chain Selection Dropdown

2. Filters Section  
   ├── Pool Type Filter (All, Lending, LP/DEX, Staking)
   ├── Minimum TVL Filter
   └── Minimum APY Filter

3. Results Section
   ├── Sort Options (APY, TVL, Protocol)
   ├── Pool Cards (10 per page)
   └── Pagination

4. Secondary Actions
   ├── Compare with Other Chains
   └── Set Chain Alerts (future feature)
```

---

## User Flow Decision Trees

### Entry Point Decision Tree
```
User lands on homepage
         │
         ▼
    Has chain preference?
    ┌─────────┬─────────┐
   Yes        No        Maybe
    │          │         │
    ▼          ▼         ▼
Click Pill  Search   Click Pill
    │      Token     to explore
    ▼        │         │
Chain Page   │         ▼
    │        ▼      Chain Selection
    ▼   Apply Chain     │
Success    Filter       ▼
           │         Chain Page
           ▼             │
       Chain Page        ▼
           │         Success
           ▼
       Success
```

### Chain Page Interaction Flow
```
User arrives at chain page
         │
         ▼
    Satisfactory results?
    ┌─────────┬─────────┐
   Yes        No       Need Filtering
    │          │           │
    ▼          ▼           ▼
Click Pool  Switch Chain  Apply Filters
    │          │           │
    ▼          ▼           ▼
Protocol   Other Chain   Filtered Results
Page       Page              │
    │          │           ▼
    ▼          ▼       Satisfactory?
Success    Success    ┌─────┬─────┐
                     Yes   No    
                      │     │     
                      ▼     ▼     
                  Success Switch Chain
                            │
                            ▼
                        Other Chain
```

---

## Mobile User Journey Considerations

### Mobile-Specific Challenges
- **Screen Real Estate:** Limited space for multiple chain options
- **Touch Targets:** Minimum 44px touch targets for accessibility
- **Navigation:** Thumb-friendly navigation patterns
- **Performance:** Minimize loading times on slower connections

### Mobile-Optimized Flow
```
Mobile Homepage
      │
      ▼
Single Chain Pill (rotates between popular chains)
      │
      ▼
"More Chains" link → Chain selection page
      │
      ▼
Chain-specific mobile layout (vertical cards)
      │
      ▼
Simplified filtering (bottom sheet)
      │
      ▼
Protocol selection
```

---

## Error States & Edge Cases

### Chain Page Error Scenarios

#### 1. No Pools Available for Chain
```
Flow: Homepage → Chain Selection → Empty Chain
Display: 
- "No yields currently available for [Chain Name]"
- "Try these popular chains instead: [suggestions]"
- "Get notified when yields become available [email signup]"
```

#### 2. API Failure on Chain Page
```
Flow: Homepage → Chain Selection → API Error
Display:
- "Unable to load yields for [Chain Name]"
- "Please try again in a moment"
- "[Retry Button]" or automatic retry
- Fallback to cached data if available
```

#### 3. Invalid Chain Parameter in URL
```
Flow: Direct URL access → /chain=invalid-chain
Display:
- "Chain not found: invalid-chain"
- "Popular chains: [Ethereum] [Polygon] [Arbitrum]"
- Redirect to homepage after 5 seconds
```

### Filter Combination Edge Cases

#### All Filters Applied, No Results
```
State: Chain=Ethereum, TVL>$10M, APY>20%, Type=Lending
Display:
- "No pools match all your filters"
- "Try relaxing some filters:"
- [Remove TVL filter] [Reduce APY requirement] [Show all types]
```

---

## Success Metrics by Journey Stage

### Conversion Funnel Analysis
```
Homepage Views (100%)
        ↓
Pill Engagement (Target: 12%)
        ↓  
Chain Page Views (Target: 10.8%)
        ↓
Filter Application (Target: 6.5%)
        ↓
Protocol Click-through (Target: 3.2%)

Success Criteria:
- Overall funnel conversion >3%
- Each stage >80% of previous stage
- Mobile/desktop parity within 10%
```

### Journey Quality Metrics
- **Time to Value:** <30 seconds from homepage to relevant yield
- **Task Success Rate:** >90% complete intended chain exploration
- **Error Recovery Rate:** >75% successfully recover from errors
- **Cross-Chain Exploration:** 20% of users visit multiple chain pages

---

## A/B Testing Framework for User Flows

### Pill Messaging Tests
- **Variant A:** "🔥 Check best yields on your favorite chain"
- **Variant B:** "⚡ Discover yields by blockchain network"  
- **Variant C:** "🎯 Find yields on Ethereum, Polygon, Arbitrum & more"

### Chain Selection UX Tests
- **Variant A:** Modal with popular chains + full list
- **Variant B:** Direct navigation dropdown in header
- **Variant C:** Expandable pill with top 4 chains

### Success Metrics for A/B Tests
- Click-through rate on pill/selection method
- Time to chain page from homepage
- Conversion rate to protocol pages
- User satisfaction scores (post-interaction survey)

---

*This document should be referenced during development to ensure user experience consistency and optimal flow implementation.*