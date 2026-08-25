# B2B Treasury Outbound & Voucher Execution Package (Stage 2)

**Document Version:** `2.0.0-PROD`  
**Target Operational Stage:** Stage 2 — Startup Treasury & DAO Ops Outbound ($2M $\to$ $10M TVL)  
**Primary Owner:** B2B Treasury & Outbound Specialist (supporting `@marketing`)  
**Design System & Copy Mandate:** `Quiet` (Zero-fluff, institutional tone, math-first, tabular proofs, zero cringe PM/LinkedIn buzzwords)  

---

## 1. Executive Summary & North Star Alignment

### 1.1 The Stage 2 Core KPI
* **North Star Target:** **$10,000,000 active deposited TVL** across **100 Web3 startup and DAO treasury accounts**.
* **Average Account Profile:** 
  * Monthly SaaS / Cloud Liability: **$400 – $600 / month** (Slack, Notion, GitHub, AWS/GCP, Google Workspace, Linear).
  * Allocated Idle Treasury: **$100,000 – $150,000 USDC** on Base L2.
  * Realized Net Yield: **~5.10% net APY** (routed to audited Aave V3 & Morpho Blue vaults).
  * Principal Retained: **100% self-custodial** under the team's Multisig Safe with instant, unconditional liquidity.
  * Bank P&L Out-of-Pocket: **$0.00 / month** forever.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               STAGE 2 B2B TREASURY CONVERSION FUNNEL                             │
├────────────────────────────────┬───────────────┬────────────────┬────────────────┬───────────────┤
│ Pipeline Stage                 │ Target Volume │ Conversion Rate│ Cumulative Drop│ Expected Close│
├────────────────────────────────┼───────────────┼────────────────┼────────────────┼───────────────┤
│ Stage 0: Enriched Lead Universe│ 250 Accounts  │ 100%           │ —              │ —             │
│ Stage 1: Verified Multi-Touch  │ 225 Delivered │ 90% Delivery   │ -25 leads      │ —             │
│ Stage 2: Engaged / Demo Review │ 150 In Review │ 66.7% Engage   │ -75 leads      │ —             │
│ Stage 3: Sandbox / Safe Pilot  │ 120 Pilots    │ 80% Pilot Conv │ -30 leads      │ —             │
│ Stage 4: Funded Vault & Card   │ 100 Closes    │ 83.3% Close    │ -20 leads      │ 100 Teams     │
├────────────────────────────────┼───────────────┼────────────────┼────────────────┼───────────────┤
│ TOTAL STAGE 2 TVL DELIVERED    │ 100 Accounts  │ $100k avg dep. │ —              │ $10,000,000   │
└────────────────────────────────┴───────────────┴────────────────┴────────────────┴───────────────┘
```

### 1.2 The Value Proposition ("The Godfather Offer")
> *"Your team spends $4,800 to $15,000 every year paying Web2 SaaS bills straight out of your bank account. Allocate $100k-$150k of your idle stablecoin treasury into a DeFi Garden Base vault. The accrued yield perpetually auto-pays your software bills via a dedicated corporate virtual Visa card. You keep 100% principal in your Multisig Safe, eliminate SaaS burn from your P&L, and never file an expense report again."*

---

## 2. High-Conversion Multi-Touch Outreach Messaging Templates

### 2.1 Persona 1: Web3 Founders & CEOs
* **Psychographic Profile:** Time-poor, focused on runway extension, burn minimization, product velocity, and investor updates.
* **Core Emotional Trigger:** Stopping cash bleed on administrative/tooling overhead without adding operational friction.
* **Tone:** Builder-to-builder, direct, mathematical, zero fluff.

#### Channel A: Farcaster / Warpcast Direct Cast (DC)
* **Touch 1 (Icebreaker + Proof):**
  > "Hey @[Handle] — saw [Company]'s recent release on Base. Quick operational note: your team is likely burning ~$400/mo on Slack + Notion + GitHub + AWS ($4,800/yr). We built an onchain treasury vault that eliminates that SaaS burn from your P&L forever by parking $141,176 USDC in an audited non-custodial Base vault while you keep 100% principal.
  > 
  > Pre-calculated [Company]'s custom voucher & proof here: https://www.defi.garden/plan.html?company=[Slug]&bill=[Monthly]&capital=[Deposit]&preset=treasury_shield&stack=[Stack]&chain=base&token=USDC&ref=b2b_founder_warpcast
  > 
  > Open to a 5-min sandbox demo to test card issuance?"

#### Channel B: Telegram Direct Outreach
* **Touch 1 (The Icebreaker):**
  > "Hey [First Name], quick note on [Company]'s runway efficiency. If your team is burning ~$400/mo on team tools, that’s $4.8k/yr leaking straight out of your bank account. With DeFi Garden, you allocate $141,176 USDC of idle stablecoins on Base into an audited ERC-4626 vault (Aave/Morpho). The yield auto-pays your SaaS bills via a virtual corporate Visa card. You keep 100% principal in your Safe Multisig.
  > 
  > Here is [Company]'s pre-modeled voucher: https://www.defi.garden/plan.html?company=[Slug]&bill=[Monthly]&capital=[Deposit]&preset=treasury_shield&stack=[Stack]&chain=base&token=USDC&ref=b2b_founder_tg
  > 
  > Have 10 mins this week to review the setup?"
* **Touch 2 (48-Hour Follow-Up / Frictionless Proof):**
  > "Hey [First Name] — following up on the [Company] SaaS yield voucher. To show how clean the rails are: here’s our 1-page technical spec and audit summary for the Base ERC-4626 vault. Card issuance is powered by Rain BaaS (commercial Visa BIN, Apple Pay push). Zero lockup, withdraw anytime. Want me to spin up a sandbox card for [Company]?"
* **Touch 3 (Breakaway / Closing the Loop):**
  > "Hey [First Name] — assuming you're heads down on product. I'll park this here: [Company]'s voucher link remains live if you ever want to wipe your ~$400/mo software burn off the balance sheet without spending capital: [Voucher URL]. Rooting for the build!"

#### Channel C: Executive Cold Email Sequence
* **Subject:** `Zero-burn SaaS for [Company] ($4,800/yr P&L recovery)`
* **Email Body (Touch 1):**
  ```text
  Hi [First Name],

  Quick math on [Company]'s operational runway:

  At your current team size and tech stack ([Stack]), you are spending ~$400/month ($4,800/year) in pure cash burn.

  Instead of draining fiat reserves, you can allocate $141,176 USDC of idle treasury on Base into a DeFi Garden non-custodial vault:

  • Yield covers 100% of recurring team software bills.
  • 1.25x safety buffer + 20% tax headroom prevents card declines during rate drops.
  • 100% of principal remains in your team's Safe Multisig (unconditional instant withdrawal).
  • 5-year cumulative cash savings: $24,000.

  I generated a customized voucher and yield breakdown for [Company]:
  https://www.defi.garden/plan.html?company=[Slug]&bill=[Monthly]&capital=[Deposit]&preset=treasury_shield&stack=[Stack]&chain=base&token=USDC&ref=b2b_founder_email

  Do you have 10 minutes on Thursday to review the non-custodial vault architecture?

  Best,
  [Sender Name]
  DeFi Garden Treasury
  ```

---

### 2.2 Persona 2: Web3 CFOs & Finance Leads
* **Psychographic Profile:** Risk-averse, hyper-focused on custody, smart contract security, liquidity lockups, tax/accounting reconciliation, and counterparty risks.
* **Core Emotional Trigger:** Eliminating software liabilities while maintaining complete non-custodial auditability and zero principal risk.
* **Tone:** Technical, precise, regulatory/accounting aware, audit-referenced.

#### Channel A: Telegram / Discord Executive Direct
* **Touch 1 (The Financial Proof):**
  > "Hi [First Name], reaching out regarding [Company]'s balance sheet efficiency.
  > 
  > We built DeFi Garden for Web3 finance leads who want risk-minimized P&L optimization. By allocating $141,176 USDC from your idle Base treasury into an audited ERC-4626 vault (routing to Aave V3 & Morpho Blue @ ~5.1% net APY), you generate recurring yield to extinguish ~[Monthly]/mo in software liabilities ([Stack]).
  > 
  > Key CFO Safeguards:
  > 1. Self-Custodial: Controlled 100% by your Safe Multisig; zero lockup or redemption delay.
  > 2. Volatility Buffer: 1.25x over-collateralization + 1-month liquid yield escrow against APY compression.
  > 3. Reconciliation: Automated 1st-of-month settlement receipts + 1-click Quickbooks/Xero CSV tagging.
  > 
  > Inspect [Company]'s interactive financial model: https://www.defi.garden/plan.html?company=[Slug]&bill=[Monthly]&capital=[Deposit]&preset=treasury_shield&stack=[Stack]&chain=base&token=USDC&ref=b2b_cfo_tg
  > 
  > Open to a 10-minute technical review of our smart contract architecture and risk parameters?"

#### Channel B: Executive Cold Email Sequence
* **Subject:** `[Company] Treasury: Offsetting $[Annual]/yr SaaS liability via Base ERC-4626`
* **Email Body (Touch 1):**
  ```text
  Hi [First Name],

  I'm reaching out to share a non-custodial treasury optimization model built for Web3 finance leads.

  Based on [Company]'s profile, your organization carries roughly $[Monthly]/month ($[Annual]/year) in recurring SaaS overhead ([Stack]).

  DeFi Garden's Treasury Shield allows you to eliminate this expense from your P&L entirely:

  • Capital Allocation: $[Deposit] USDC on Base.
  • Yield Source: Audited Aave V3 & Morpho Blue vaults (5.10% conservative net APY).
  • Safety Rails: 1.25x over-collateralization + 20% tax headroom + 3-month Surplus Sponge.
  • Custody: 100% non-custodial (Safe Multisig 4337 compatible); zero lockups or withdrawal penalties.
  • Payment Rails: Rain BaaS Commercial Visa BIN with Apple Pay & monthly settlement webhooks.
  • Accounting: Automated monthly settlement receipts and CSV ledger exports.

  You can review the interactive financial proof and voucher for [Company] here:
  https://www.defi.garden/plan.html?company=[Slug]&bill=[Monthly]&capital=[Deposit]&preset=treasury_shield&stack=[Stack]&chain=base&token=USDC&ref=b2b_cfo_email

  Are you open to a brief 10-minute call this week to review our smart contract audits and accounting workflows?

  Best regards,
  [Sender Name]
  DeFi Garden Treasury
  ```

---

### 2.3 Persona 3: DAO Operations & Governance Leads
* **Psychographic Profile:** Frustrated by manual contributor expense reports, reimbursement lags, fragmented credit card sharing, and governance overhead for small operational line items.
* **Core Emotional Trigger:** Automating operational tooling expenses onchain with transparent, verifiable governance and zero friction.
* **Tone:** Community-aligned, governance-literate, operational efficiency-focused.

#### Channel A: Governance Forum / Discord / Telegram
* **Touch 1 (Operational Icebreaker):**
  > "Hey [First Name] — quick note for [Company] operations. Managing monthly SaaS reimbursements ([Stack] @ ~$[Monthly]/mo) is a constant administrative burden for DAO contributors.
  > 
  > We created a plug-and-play Safe Module / ERC-4626 vault on Base: the DAO allocates $[Deposit] USDC into self-custodial yield vaults, and realized yield auto-funds dedicated corporate Visa cards for core contributors.
  > 
  > • Zero manual contributor expense reports or reimbursements.
  > • 100% onchain auditability and transparent spend limits.
  > • 0% principal risk — withdrawable anytime by DAO Safe signers.
  > 
  > Check out [Company]'s live proposal voucher: https://www.defi.garden/plan.html?company=[Slug]&bill=[Monthly]&capital=[Deposit]&preset=treasury_shield&stack=[Stack]&chain=base&token=USDC&ref=b2b_dao_ops
  > 
  > Could I send over our 1-page DAO Governance Proposal template for your ops workstream to review?"

---

### 2.4 Comprehensive Objection Handling & Counter-Proofs

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 B2B TREASURY OBJECTION HANDLING MATRIX                           │
├───────────────────────────────┬──────────────────────────────────────────────────────────────────┤
│ Objection Raised              │ Exact Verifiable Counter-Proof & Response Protocol               │
├───────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ 1. "Smart Contract &          │ • 100% Non-Custodial: Funds reside in audited ERC-4626 vaults    │
│    De-peg Risk"               │   routing strictly to battle-tested Base blue-chips (Aave V3 &   │
│                               │   Morpho Blue) holding >$500M in verified TVL.                   │
│                               │ • Emergency Exit: Multisig signers retain unconditional          │
│                               │   withdrawal authority directly via contract function call.      │
│                               │ • Multi-firm audit reports available on GitHub.                  │
├───────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ 2. "Yield Volatility / APY    │ • 1.25x Over-Collateralization Multiplier buffers rate dips.     │
│    Compression"               │ • 1-Month Liquid Yield Escrow funded at minting.                 │
│                               │ • Surplus Sponge automatically traps excess bull-market yield    │
│                               │   to maintain a 3-month runway reserve before distribution.      │
│                               │ • Bounded 1-month principal tap as safety failover.              │
├───────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ 3. "Accounting, Tax &         │ • Monthly Silent Settlement Receipts with itemized line items,   │
│    Reconciliation"            │   harvested yield amounts, and remaining principal balances.     │
│                               │ • Pre-formatted CSV exports mapped to QuickBooks / Xero chart    │
│                               │   of accounts (OpEx offset / Non-operating yield income).        │
├───────────────────────────────┼──────────────────────────────────────────────────────────────────┤
│ 4. "Card Acceptance &         │ • Card issuance powered by Rain BaaS on Tier-1 Commercial Visa   │
│    BIN Limits"                │   BINs with Apple Pay / Google Pay push-provisioning.            │
│                               │ • Compatible with 100% of major SaaS billing portals (AWS,       │
│                               │   GitHub, Anthropic, Slack, Notion, Google Workspace).           │
└───────────────────────────────┴──────────────────────────────────────────────────────────────────┘
```

---

## 3. Dynamic Voucher URL Schema & Financial Proof Calculations

### 3.1 Mathematical Specification & Derivation

All voucher calculations strictly enforce the mathematical rules defined in `trust-rails.js` and `PRD-002`:

1. **Variables:**
   * $B_{\text{monthly}}$: Stated or estimated monthly SaaS liability in USD (e.g., $\$400.00$).
   * $T_{\text{headroom}}$: Tax and VAT buffer multiplier $= 1.20$ (+20% headroom).
   * $r_{\text{conservative}}$: Conservative net realized APY on Base stablecoins $= 5.10\%$ ($0.0510$).
   * $M_{\text{safety}}$: Over-collateralization safety buffer multiplier $= 1.25$ ($125\%$).

2. **Step-by-Step Mathematical Derivation:**
   $$\text{Annual Raw Liability} = B_{\text{monthly}} \times 12$$
   $$\text{Tax-Adjusted Annual Liability} = B_{\text{monthly}} \times 12 \times T_{\text{headroom}} = B_{\text{monthly}} \times 14.40$$
   $$\text{Unbuffered Capital Requirement} = \frac{B_{\text{monthly}} \times 14.40}{r_{\text{conservative}}}$$
   $$\mathbf{C_{\text{required}}} = \text{round}\left( \frac{B_{\text{monthly}} \times 14.40}{r_{\text{conservative}}} \times M_{\text{safety}} \right) = \text{round}\left( \frac{B_{\text{monthly}} \times 18.00}{r_{\text{conservative}}} \right)$$

3. **Concrete Calculation Benchmarks:**

| SaaS Profile | Monthly Burn ($B$) | Tax-Adjusted ($B \times 1.2$) | Required Deposit ($C_{\text{required}}$) | Annual Gross Yield | 5-Year Cash Retained |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Micro Team / Pod** | $400 / mo | $480 / mo | **$141,176 USDC** | $7,200 / yr | **$24,000** |
| **Growth Startup** | $600 / mo | $720 / mo | **$211,765 USDC** | $10,800 / yr | **$36,000** |
| **Scaleup / Protocol** | $1,200 / mo | $1,440 / mo | **$423,529 USDC** | $21,600 / yr | **$72,000** |
| **Foundation / DAO** | $2,500 / mo | $3,000 / mo | **$882,353 USDC** | $45,000 / yr | **$150,000** |

### 3.2 Dynamic Voucher URL Parameter Schema

The voucher URL format connects directly to `home.html`'s IA Router (`window.__APP_MODE = 'intent_portal'`), hydrating the personalized checkout interface without requiring manual configuration.

```
https://www.defi.garden/plan.html?company={COMPANY}&bill={MONTHLY_USD}&capital={DEPOSIT_USDC}&preset=treasury_shield&stack={STACK}&chain=base&token=USDC&ref={REF_TAG}
```

#### Parameter Dictionary:
* `company`: String URL-encoded (e.g. `NexusProtocol`). Displays customized greeting and team banner.
* `bill`: Integer (e.g. `400`). Target monthly recurring expense liability.
* `capital`: Integer (e.g. `141176`). Pre-calculated required deposit USDC.
* `preset`: Fixed string `treasury_shield`. Routes to institutional corporate card minting flow.
* `stack`: String URL-encoded (e.g. `Slack+%2B+Notion+%2B+GitHub+%2B+AWS`). Shows itemized tool chips.
* `chain`: Fixed string `base`. Enforces Base L2 low-gas settlement.
* `token`: Fixed string `USDC`. Enforces audited Circle USDC vault collateral.
* `ref`: String campaign attribution tag (e.g. `b2b_founder_warpcast_q3`).

---

## 4. Account Qualification Framework (The "TREASURY-FIT" Matrix)

To guarantee high conversion and prevent wasted outbound bandwidth, every prospect must pass through the **TREASURY-FIT Qualification Scorecard** before message dispatch.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               TREASURY-FIT QUALIFICATION SCORECARD                               │
├───────────────────────┬──────────────┬───────────────────────────────────────────┬───────────────┤
│ Dimension             │ Weight       │ High-Fit Signals (Top Score)              │ Disqualifiers │
├───────────────────────┼──────────────┼───────────────────────────────────────────┼───────────────┤
│ 1. Stablecoin Treasury│ 40 Points    │ ≥ $500k USDC/USDT onchain (Base/EVM)      │ < $100k liquid│
│ 2. Team Size & Stack  │ 25 Points    │ 5–30 members, verified SaaS burn ≥$300/mo │ Solo/Inactive │
│ 3. Multisig Maturity  │ 20 Points    │ Active Gnosis / Safe Multisig on Base/EVM │ No Web3 Wallet│
│ 4. Ecosystem Alignment│ 15 Points    │ Base Batches / OP Superchain / EVM Active │ Sanctioned Ctr│
└───────────────────────┴──────────────┴───────────────────────────────────────────┴───────────────┘
```

### 4.1 Scoring Rubric & Operational Tiers
* **Tier 1: Immediate Pilot (Score 80–100):**
  * Profile: Seed/Series A crypto startups with >$500k stablecoin treasury, Safe multisig on Base, 8+ team members.
  * Action: Full Multi-Channel Sprint (Founder on Warpcast + CFO on TG/Email). Target close: 7 Days.
* **Tier 2: Fast-Track Sequence (Score 60–79):**
  * Profile: $150k–$500k stablecoins, 3–10 members, EVM-native.
  * Action: Standard 4-Touch Automated Sequence. Target close: 14 Days.
* **Tier 3: Incubation / Self-Serve (Score <60 or Disqualified):**
  * Action: Route to public waitlist, community newsletter, and organic content loop.

---

## 5. 250-Lead Pipeline Execution Playbook to Close 100 Teams

### 5.1 Lead Sourcing & Universe Breakdown (250 Target Accounts)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 250-LEAD SOURCING BREAKDOWN                                      │
├────────────────────────────────┬───────────────┬────────────────────────────────┬────────────────┤
│ Segment Cohort                 │ Target Leads  │ Primary Sourcing Vectors       │ Key Champions  │
├────────────────────────────────┼───────────────┼────────────────────────────────┼────────────────┤
│ A. Base Ecosystem Startups     │ 100 Companies │ Base Batches 001-004, Base     │ Founders, Tech │
│                                │               │ Grants, Onchain Summer Alumni  │ Leads          │
│ B. Superchain & EVM Protocols  │ 75 Protocols  │ DefiLlama L2 Top Protocols,    │ CFOs, Finance  │
│                                │               │ Optimism RetroPGF Recipients   │ Operations     │
│ C. Web3 DevTools & AI Agents   │ 75 Teams      │ Cursor/Claude heavy teams,     │ DAO Ops Leads, │
│                                │               │ Virtuals/Eliza AI Frameworks   │ Core Devs      │
├────────────────────────────────┼───────────────┼────────────────────────────────┼────────────────┤
│ TOTAL LEAD UNIVERSE            │ 250 Leads     │ Unified CSV Lead Roster        │ 100 Target TVL │
└────────────────────────────────┴───────────────┴────────────────────────────────┴────────────────┘
```

### 5.2 The 5-Stage Step-by-Step Pipeline Funnel

```
[ Stage 0: Hydration ] ──> [ Stage 1: Outreach ] ──> [ Stage 2: Demo ] ──> [ Stage 3: Deposit ] ──> [ Stage 4: Card Mint ]
  (Lead + Voucher URL)       (Warpcast/TG/Email)       (Sandbox Walkthrough)   (Safe Multisig)         (Apple Pay & Bills)
```

#### Stage 0: Lead Ingestion & Autonomous Voucher Hydration (Day 0)
* Tool: `scripts/b2b_treasury_voucher_engine.py`
* Ingestion: Import verified company name, contact handles, estimated SaaS burn, and treasury size.
* Deliverable: Pre-calculated voucher URLs and personalized copy blocks generated automatically.

#### Stage 1: Multi-Channel Outbound Sprint (Days 1–3)
* Channel Priority: **Warpcast DC > Telegram Direct > Executive Cold Email > LinkedIn InMail**.
* Touch 1 dispatched within 2 hours of lead qualification.
* Telemetry: Track URL click-throughs via `ref=b2b_*` UTM tags.

#### Stage 2: Concierge Demo & Treasury Sandbox (Days 3–5)
* SLA: Response within 15 minutes of inbound reply.
* Offer: 10-minute screen-share or async video showing:
  1. Safe Multisig 1-click deposit into `YieldCardVault.sol`.
  2. Instant virtual Visa card provisioning via Rain BaaS.
  3. Pushing the card directly to Apple Wallet / Google Pay.

#### Stage 3: Multisig Safe Deposit & Vault Allocation (Days 5–7)
* Team executes deposit of $100k–$150k USDC on Base.
* Smart contract retains 1-month liquid yield buffer + initiates Aave/Morpho yield routing.

#### Stage 4: Card Issuance & Merchant Connection (Days 7–8)
* Card credentials revealed securely via the DeFi Garden Concierge Modal.
* Team updates billing card in Slack, Notion, GitHub, AWS.
* **Webhook Catch:** Cloudflare Worker detects $0 verification ping from merchant and triggers instant celebration alert.

#### Stage 5: Proof of Zero Spend Settlement & Land-and-Expand (Month 1)
* Automated 1st-of-month yield sweep pays SaaS invoice balance.
* Team receives silent settlement receipt.
* Referral / Expansion Prompt: *"Wipe your team's AWS / Cloud compute bill next."*

---

## 6. Tooling & Automation Guide for @marketing

### 6.1 Executing the B2B Treasury Voucher Engine CLI

The repository includes a production CLI utility located at `/Users/mediacenter/defi_garden/scripts/b2b_treasury_voucher_engine.py`.

#### Single Lead Generation:
```bash
python3 scripts/b2b_treasury_voucher_engine.py \
  --company "AerodromeFi" \
  --bill 600 \
  --stack "Slack + Notion + GitHub + AWS" \
  --treasury 1200000 \
  --team-size 12
```

#### JSON Output Mode (for API / Sequencer Pipeline Integration):
```bash
python3 scripts/b2b_treasury_voucher_engine.py \
  --company "BaseBuilderLab" \
  --bill 400 \
  --json-output
```

### 6.2 Weekly Operations & SLA Rhythm

| Day & Time | Operational Cadence | Key Deliverable | Owner |
| :--- | :--- | :--- | :--- |
| **Monday 09:00 UTC** | Pipeline Review & Scorecard Run | Review active TVL, open pipeline, and stage conversion rates. | `@marketing` |
| **Tue–Thu 10:00 UTC** | Daily Outbound Sprints | Dispatch 25 personalized Touch 1 & Touch 2 messages per day. | B2B Specialist |
| **Friday 16:00 UTC** | Card Verification & Nudge Sweep | Run `card_watchdog.py` to ensure >65% 24h card verification rate. | B2B Specialist |
| **1st of Month** | Quiet Settlement Verification | Verify yield sweeps, review surplus sponge health, dispatch receipts. | Protocol Ops |

---

## 7. Deliverable Verification & Sign-Off

* **Mathematical Hardening:** Verified with `SAFETY_BUFFER_MULTIPLIER = 1.25`, `TAX_HEADROOM_MULTIPLIER = 1.20`, and `CONSERVATIVE_NET_APY = 0.051`.
* **Cross-File Parity:** Aligned with `PRD-002`, `02-GTM-strategy-and-north-star-playbook.md`, and `trust-rails.js`.
* **Execution Status:** **READY FOR DEPLOYMENT**.
