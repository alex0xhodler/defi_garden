# Contextual Yield-Funded Virtual Card Terminal (PRD Design 3)

**Status:** SHIPPED  
**Target Milestone:** v3.4 Contextual Arbitrage & Card Issuing Waitlist  
**Target Surfaces:** `PoolDetail.js`, `/tokens` hub header, parameterized `/?pool=:id` views

---

## 1. Overview & Architecture

The **Contextual Yield-Funded Virtual Card Terminal** connects idle DeFi pool APY to everyday software and lifestyle subscriptions (OpenCode Go, Amazon Prime, Telegram Premium, Spotify, Xbox, Codex Pro, Claude Pro, Cursor Pro, OpenAI API). It sits directly at the top of the pool detail view above historical charts and parameters.

### Components
1. **Context Alert Header**: Displays live pool context (Token, Chain, Net APY, Risk rating, TVL) and Early Access alert badge.
2. **Deposit Simulator Slider**: Interactive range slider ($1,000 to $25,000, default $4,000) with live monthly yield output.
3. **Geo-Adaptive Subscription Unlock Grid**: Automatically selects KRW (₩) catalog for Korean users (`Asia/Seoul` / `ko` locale) and USD ($) catalog for global users. Rungs dynamically switch between `COVERED` and `LOCKED`. Clicking a locked rung auto-adjusts the slider to the required capital.
4. **Virtual Visa Card Preview**: Neumorphic card mockup with official Visa vector mark, metallic gold security chip, dynamic subscription name, network/yield info, and monthly spend limit cap badge.
5. **Reservation Terminal**: Validates email, persists waitlist registration to `localStorage['defi_garden_card_waitlist']`, emits Mixpanel telemetry (`yield_card_reserved`), and presents confirmation receipt state.

---

## 2. Mathematical Formulations

- **Monthly Yield Output:**
  $$Y_{\text{monthly}} = \frac{C \times r}{12}$$
  where $C$ = simulated deposit and $r$ = net APY (as decimal, e.g. `0.0620` for 6.20%).

- **Rung Status:**
  - $Y_{\text{monthly}} \ge B_i \rightarrow$ `COVERED`
  - $Y_{\text{monthly}} < B_i \rightarrow$ `LOCKED` (requires $C_{\text{req}}$)

- **Required Capital to Unlock Rung ($C_{\text{req}}$):**
  $$C_{\text{req}} = \left\lceil \frac{B_i \times 12}{r} \right\rceil$$

---

## 3. Telemetry & Analytics

Tracks three key lifecycle events in `analytics.js`:
- `yield_card_slider_change`: `{ pool_id, chain, token, apy, simulated_deposit, monthly_yield }`
- `yield_card_subscription_selected`: `{ pool_id, goal_id, monthly_cost, is_covered }`
- `yield_card_reserved`: `{ pool_id, chain, token, goal_id, deposit_amount, email_provided }`

---

## 4. Verification

- Plain unit tests: `test_yield_card_math.js`
- Browser integration tests: `test_yield_card_widget.js`
