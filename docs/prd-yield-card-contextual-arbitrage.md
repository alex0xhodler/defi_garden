# PRD: Contextual Yield-Funded Virtual Card Widget (Design 3)

**Status:** APPROVED FOR BUILD  
**Target Milestone:** v3.4 Contextual Arbitrage & Card Issuing Waitlist  
**Target Surfaces:** `PoolDetail.js`, `/tokens` hub header, parameterized `/search/:token` and `/?pool=:id` views  
**Author:** Partnerships & Ecosystem Alliances / Product Engineering  

---

## 1. Objective & Strategic Thesis

### 1.1 Context
Mixpanel telemetry reveals that ~200 genuine external visitors land on token and pool URLs monthly via search engines (DuckDuckGo, Bing, Perplexity). Users evaluate yield percentages on specific tokens (e.g. USDC on Base @ 6.2%, SOL on Kamino, BUIDL on Ethereum) but currently bounce with a 99% drop-off because the standalone `/plan.html` goal flow is disconnected from the pool discovery experience.

### 1.2 The Solution (Design 3)
Embed an interactive **Contextual Yield-Funded Card Terminal** directly inside the pool and token views. Users see the exact math translating idle pool APY into real-world software and lifestyle subscriptions (Codex Pro, Claude Pro, Cursor, Xbox, Spotify), customize their deposit, and reserve a merchant-locked virtual card auto-funded by that pool's yield without risking principal.

---

## 2. Information Architecture & Visual Hierarchy

The component sits at the top of the pool analysis view (above historical charts and raw parameters).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [1] POOL CONTEXT HEADER                                                  │
│ USDC Lending Market (Base) • Live APY: 6.20% • Risk: 9.4/10 • TVL: $48M │
├──────────────────────────────────────────────────────────────────────────┤
│ [2] DEPOSIT SIMULATOR SLIDER                                             │
│ Simulated Deposit: [$4,000 USDC]  ──●─────────────────────────           │
│ Monthly Yield Generated: $20.67 / month                                  │
├──────────────────────────────────────────────────────────────────────────┤
│ [3] DYNAMIC SUBSCRIPTION UNLOCK GRID                                     │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌─────────────┐│
│ │ [✓ COVERED]    │ │ [✓ COVERED]    │ │ [✓ COVERED]    │ │ [LOCKED]    ││
│ │ Codex Pro      │ │ Claude Pro     │ │ Xbox Pass      │ │ OpenAI API  ││
│ │ $20.00/mo      │ │ $20.00/mo      │ │ $17.00/mo      │ │ Needs $9.7k ││
│ └────────────────┘ └────────────────┘ └────────────────┘ └─────────────┘│
├──────────────────────────────────────────────────────────────────────────┤
│ [4] VIRTUAL CARD PREVIEW & [5] RESERVATION TERMINAL                      │
│ ┌───────────────────────────┐  ┌──────────────────────────────────────┐  │
│ │ VISA • CODEX PRO FUNDED   │  │ Reserve Virtual Card For This Pool   │  │
│ │ Base USDC • Cap: $20/mo   │  │ [Enter developer email...         ]  │  │
│ └───────────────────────────┘  │ [ Issue My Card at Launch          ]  │  │
│                                └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Functional Specifications

### 3.1 Mathematical Engine & Formulations
Let $r$ = pool net APY (as decimal, e.g. `0.0620`), $C$ = simulated deposit amount, $B_i$ = monthly bill of subscription $i$.

1. **Monthly Yield Output:**
   $$Y_{\text{monthly}} = \frac{C \times r}{12}$$

2. **Rung State Calculation (Covered vs. Locked):**
   * If $Y_{\text{monthly}} \ge B_i \rightarrow$ Status is **`COVERED`** (Active pill, clickable).
   * If $Y_{\text{monthly}} < B_i \rightarrow$ Status is **`LOCKED`** (Dashed border, 50% opacity).
   
3. **Required Capital to Unlock Rung ($C_{\text{req}}$):**
   $$C_{\text{req}} = \left\lceil \frac{B_i \times 12}{r} \right\rceil$$
   *(Rendered on locked rungs as "Requires $X.Xk")*

### 3.2 Geo-Adaptive Subscription Catalogs & Official Brand Favicons

The component automatically adapts to the user's regional IP / locale (`Intl.DateTimeFormat().resolvedOptions().timeZone` or geo header) and presents relevant local services.

#### 🇰🇷 South Korea (KRW ₩) — Primary Default
| Goal ID | Display Name | Monthly Bill | Official Domain | Required Capital @ 6.2% APY | Default State ($4k Deposit) |
|---|---|---|---|---|---|
| `opencode_go` | OpenCode Go | ₩6,800 ($5.00) | `opencode.ai` | **$968 USDC** | **Covered (완전 무료)** |
| `naver_plus` | 네이버플러스 멤버십 | ₩4,900 ($3.60) | `naver.com` | **$697 USDC** | **Covered (완전 무료)** |
| `baemin_club` | 배민클럽 (배달의민족) | ₩3,990 ($2.95) | `baemin.com` | **$571 USDC** | **Covered (완전 무료)** |
| `coupang_wow` | 쿠팡 와우 멤버십 | ₩7,890 ($5.80) | `coupang.com` | **$1,123 USDC** | **Covered (완전 무료)** |
| `melon` | 멜론 스트리밍 | ₩10,900 ($8.10) | `melon.com` | **$1,568 USDC** | **Covered (완전 무료)** |
| `youtube_kr` | 유튜브 프리미엄 | ₩14,900 ($11.00)| `youtube.com` | **$2,129 USDC** | **Covered (완전 무료)** |
| `tving` | 티빙 (TVING) | ₩13,500 ($10.00)| `tving.com` | **$1,935 USDC** | **Covered (완전 무료)** |
| `claude_pro` | Claude Pro | ₩29,000 ($20.00)| `claude.ai` | **$3,871 USDC** | **Covered (완전 무료)** |
| `codex_pro` | Codex Pro / ChatGPT Plus| ₩29,000 ($20.00)| `openai.com` | **$3,871 USDC** | **Covered (완전 무료)** |
| `cursor_pro` | Cursor Pro | ₩29,000 ($20.00)| `cursor.com` | **$3,871 USDC** | **Covered (완전 무료)** |

#### 🇺🇸 Global / United States (USD $)
| Goal ID | Display Name | Monthly Bill | Official Domain | Required Capital @ 6.2% APY |
|---|---|---|---|---|
| `opencode_go` | OpenCode Go | $5.00 | `opencode.ai` | **$968 USDC** |
| `prime_video` | Amazon Prime Video | $4.99 | `amazon.com` | **$966 USDC** |
| `telegram_prem`| Telegram Premium | $4.99 | `telegram.org` | **$966 USDC** |
| `spotify` | Spotify Premium | $11.00 | `spotify.com` | **$2,129 USDC** |
| `xbox` | Xbox Game Pass | $17.00 | `xbox.com` | **$3,290 USDC** |
| `codex_pro` | Codex Pro | $20.00 | `openai.com` | **$3,871 USDC** |
| `claude_pro` | Claude Pro | $20.00 | `claude.ai` | **$3,871 USDC** |
| `cursor_pro` | Cursor Pro | $20.00 | `cursor.com` | **$3,871 USDC** |
| `openai_api` | OpenAI API Tier 2 | $50.00 | `platform.openai.com` | **$9,678 USDC** |

### 3.3 Virtual Card Visual Render
The card mockup dynamically renders:
- Top right: Authentic official **VISA vector mark** (`viewBox="0 0 780 250"` white fill).
- Top left: Metallic gold security chip element (135deg gradient with subtle border).
- Center: Monospace dynamically synced subscription label (e.g. `[SERVICE_NAME] 결제 전용` / `[SERVICE_NAME] FUNDED`).
- Bottom row: Network & yield info (`BASE USDC • 6.2% 이자 직결`) + Spend limit badge (`월 한도: ₩29,000` / `CAP: $20.00/MO`).

### 3.3 Slider Behavior
- **Range:** Min `$1,000` to Max `$25,000`.
- **Step Increment:** `$250` (or `$500` above `$10,000`).
- **Default Position:** `$4,000` (sufficient to unlock the standard $20/mo dev tool tier at typical 6% APY).
- **Interactivity:** Dragging slider updates `$deposit-readout`, `$monthly-yield-readout`, and recalculates all subscription rung states instantly with zero re-rendering lag.

### 3.4 Card Preview & Selection Interaction
- Clicking any **`COVERED`** subscription card:
  1. Applies `selected` active outline ring.
  2. Updates the Virtual Visa card preview label: `DEFI GARDEN • [NAME] FUNDED`.
  3. Updates the card spend cap badge: `CAP: $[B_i]/MO`.
- Clicking a **`LOCKED`** card auto-slides the deposit slider up to that subscription's $C_{\text{req}}$ (delightful micro-interaction).

### 3.5 Reservation / Lead Capture Action
- Input: `email` (valid email format check).
- Optional: `wallet_address` (if web3 wallet is already connected).
- Action:
  1. Writes reservation payload to `localStorage['defi_garden_card_waitlist']`.
  2. Emits Mixpanel telemetry event `yield_card_reserved`.
  3. Transitions action panel to success receipt state with queue number and share link.

---

## 4. Technical Constraints & Codebase Guidelines

### 4.1 Strict Framework Rules (from `CLAUDE.md`)
- **No JSX:** All components in `app.js` and `PoolDetail.js` must use `React.createElement` or pure Vanilla DOM helper constructors.
- **No Heavy Build Steps:** Pure static browser execution.
- **Design Tokens:** Use existing CSS variables from `style.css`:
  - Accent / Primary: `var(--color-primary)` (`#21808D` family)
  - Surface: `var(--color-surface)`
  - Background: `var(--color-background)`
  - Borders: `var(--color-border)`, `var(--color-card-border)`
  - Fonts: `var(--font-family-base)` (Satoshi), `var(--font-family-mono)` (Berkeley Mono / monospace).
- **Formatting:** All currency formatting pinned to `formatUsd(val)` and numbers to `formatNum(val)` (never bare `toLocaleString()`).
- **Localization:** Every user-visible text string must reference `translations.js` (`t('yieldCard.title')`, `t('yieldCard.reserve')`). Update `EN` and natural `KO` dictionary tables together.

---

## 5. Telemetry & Analytics Event Schema

The implementation must track the complete interaction funnel in `analytics.js`:

```javascript
// 1. When user adjusts deposit slider
Analytics.track('yield_card_slider_change', {
  pool_id: pool.pool,
  chain: pool.chain,
  token: pool.symbol,
  apy: pool.apy,
  simulated_deposit: depositAmount,
  monthly_yield: monthlyYield
});

// 2. When user selects a subscription rung
Analytics.track('yield_card_subscription_selected', {
  pool_id: pool.pool,
  goal_id: goalId,
  monthly_cost: monthlyCost,
  is_covered: isCovered
});

// 3. When reservation is submitted
Analytics.track('yield_card_reserved', {
  pool_id: pool.pool,
  chain: pool.chain,
  token: pool.symbol,
  goal_id: selectedGoalId,
  deposit_amount: depositAmount,
  email_provided: true
});
```

---

## 6. Card Issuing Integration Handoff Payload

The reservation output must serialize into the exact format required for batch ingestion into **Bridge.xyz** or **Lithic** virtual card programs:

```json
{
  "waitlist_id": "yc_8f92a10b",
  "timestamp": 1786105200000,
  "user_email": "dev@company.xyz",
  "target_pool": {
    "pool_id": "747c1d2a-c668-4682-b9f9-296708a3dd90",
    "chain": "Base",
    "token": "USDC",
    "net_apy": 0.0620
  },
  "subscription": {
    "id": "codex",
    "name": "Codex Pro",
    "monthly_limit_usd": 20.00,
    "merchant_category_lock": ["software_subscription", "ai_service"]
  },
  "simulated_deposit_usd": 4000.00
}
```

---

## 7. Acceptance Criteria & Verification Scenarios

1. **Live Calculation Accuracy:** On a pool with 6.2% APY and slider set to $4,000, monthly yield must display `$20.67 / mo` (±$0.05).
2. **Dynamic Unlocks:** Setting slider to $2,000 locks Codex Pro (displays "Requires $3.9k") while Spotify remains "Covered". Setting slider to $4,000 unlocks Codex Pro.
3. **Card Synchronization:** Picking Cursor Pro updates the Visa mockup text to `CURSOR PRO FUNDED` and badge to `CAP: $20/MO`.
4. **Form Validation & Submission:** Entering an invalid email halts submission with inline validation message. Submitting valid email stores payload in `localStorage` and logs `yield_card_reserved` to Mixpanel.
5. **Responsiveness & Dark Mode:** Renders cleanly across 360px (mobile), 768px (tablet), and 1280px (desktop), honoring both Light and Dark themes.
6. **No Regressions:** Does not alter existing parameterized URL routing (`/?pool=`, `/?token=`, `/?chain=`).
