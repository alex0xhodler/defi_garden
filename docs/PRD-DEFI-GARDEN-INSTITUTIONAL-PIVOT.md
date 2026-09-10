# DEFINITIVE BLUEPRINT PRD
## DeFi Garden → Institutional Forward-Looking Yield Underwriting & Liquidity Terminal

**Document ID:** `DG-PRD-2026-PIVOT-v1.0`  
**Classification:** Authoritative / Executable  
**Owner:** Principal Systems Architect × CPO × Quantitative Risk Engineer  
**Repo:** `defi_garden`  
**Invariant:** Zero backend on the public read path. Vercel CDN + static JSON shards only. Cloudflare D1 is **write-side telemetry**, never a live query plane for the terminal.

**North-star sentence (product copy, lock it):**  
> DefiLlama tells you what yield *was*. DeFi Garden rates what yield *will be*, at your size, after the contract’s next event.

---

## 0. Executive Decision Record

| Decision | Choice | Rationale |
|---|---|---|
| Trailing APY as primary number | **KILL** | Trailing APY is a lagging, size-blind, event-blind statistic. It is the source of the “plain analytics” smell. |
| Primary object of underwriting | **Forward organic density + atomic cash capacity + next-event override** | Institutions size positions against liquidity and contract clocks, not headline APY. |
| Read architecture | **Static shards + lightweight index** | Preserve Vercel CDN, <200 KB index, per-pool JSON. Agents and humans share one truth. |
| Forecast engine | **TimesFM 3.0 organic density** (already 7,383 pools / 61s CPU) | Foundation model, quantile-native, no GPU tax. |
| Incentive treatment | **Unbundle + perishability gates** | 14% of pools are emission-driven. They must never mix into organic APY. |
| IRM / utilization | **Closed-form dilution, on-chain state via Alchemy `eth_call`** | Deterministic. No Monte Carlo on the hot path. |
| Agent plane | **3 canonical MCP tools** | Morpho allocators, Gnosis Pay, trading bots. No extra surface. |

**What dies in this pivot**
- The parameterized “filter list” as hero (`?app=1`, `?chain=Popular&minTvl=1000000`).
- Single blended APY column.
- Any UI that implies “APY is a scalar you can sort.”

**What lives**
- Existing D1 90-day hourly snapshots (7,996 pools).
- Organic vs incentivized classification (6,875 / 1,121).
- TimesFM 3.0 job.
- MCP server skeleton.
- Static React UMD + Vercel.

---

## 1. Product Thesis & Vision Statement

### 1.1 The death of trailing APY

Trailing APY is an accounting residue:
- It averages a path that will not repeat (emission cliffs, utilization kinks, fee-regime changes).
- It is **not size-invariant**. A 12% pool at $2M TVL is not a 12% pool at a $10M ticket.
- It is **not event-aware**. Gauge votes, Merkl epochs, Pendle PT expiry, Aave IRM kink crossings are first-order.

An institution that allocates on trailing APY is underwriting a *historical mean of a non-stationary process* with *wrong liquidity assumptions*. That is not alpha. That is adverse selection against anyone who *does* model the next event.

### 1.2 The rise of the Forward Liquidity & Yield Terminal

DeFi Garden becomes the **underwriting desk** for on-chain cash:

1. **What organic yield density looks like over the next 30d** (TimesFM quantiles, not a point).
2. **How much cash can enter or exit without breaking the IRM / AMM / vault invariant** (atomic headroom, kink distance).
3. **What dies when the next contract event fires** (gauge decay, emission cliff, PT expiry).
4. **What the market is already pricing vs that forecast** (Pendle implied vs Garden forecast).
5. **What happens to APY at *your* ticket size** (closed-form dilution).

This is not a dashboard. It is a **decision terminal**: every pixel answers “can I put $X here, through event T, with residual yield Y at confidence q?”

### 1.3 Core value proposition (locked copy)

> **DefiLlama tells you what yield was. DeFi Garden rates what yield will be, at your size, after the contract’s next event.**

Supporting claims (must be true in product, not marketing):
- Organic vs perishable APY never mixed in the hero number.
- Every pool has a **liquidity state** (`GREEN | AMBER | RED`) derived from on-chain utilization and IRM kinks, not TVL vanity.
- Every deposit size maps to an exact post-trade APY via closed-form IRM (or AMM invariant), not a linear “APY × TVL” cartoon.
- Every incentivized pool has a live **event countdown** to the next perishability gate.
- Agents get the same math via MCP. No shadow API.

### 1.4 Who it is for (ICP, ranked)

| Rank | User | Job-to-be-done | Killer widget |
|---|---|---|---|
| 1 | Morpho / Euler / Aave allocators | Size a $1–50M deposit without crossing kink or draining cash | Dilution slider + \(W_{\max\_atomic}\) |
| 2 | Treasury / DAO runway desks | Park stablecoins with known exit capacity and organic-only yield | Liquidity gauge + organic APY |
| 3 | Pendle / basis desks | Harvest \(\Delta = F_{30d} - I\) with CI | Mispricing radar |
| 4 | Agentic allocators (MCP) | Screen → simulate → allocate without a human UI | 3 tools |
| 5 | Sophisticated retail | Stop being exit liquidity for farms | Dual APY + RED badge |

### 1.5 Non-goals (explicit)

- Not a DEX aggregator, not a wallet, not a “one-click deposit” custodian.
- Not a replacement for DefiLlama TVL taxonomy.
- Not live WebSocket order books.
- Not on-chain execution in v1 (simulate only; execution is a P3+ opt-in via partner routers).
- Not a social feed.

---

## 2. Core Information Architecture & UI/UX Transformation

### 2.1 Kill the boring tabular filter list

**Deprecated as hero:** `?app=1` table + `?chain=Popular&minTvl=1000000`.

Those query params remain as **deep-link filters into the terminal’s pool index**, not as the product. The first viewport is never a spreadsheet of trailing APYs.

**New IA (three planes, one URL space)**

```
/                         → Hero Decision Terminal (default: highest underwriting score, not highest APY)
/?pool={pool_id}          → Terminal locked on a pool (canonical)
/?view=radar              → Pendle Yield Mispricing Radar (full)
/?view=screen             → Institutional screener (replaces old table; still not hero)
/?chain=&minTvl=          → Screener prefilter only; after load, jump to terminal of rank-1 pool
```

**Layout chrome (global, 1440×900 baseline, 12-col grid)**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOPBAR  64px  Logo | Search (pool/protocol/asset) | Chain pills | MCP ●  │
├─────────────┬──────────────────────────────────────────────┬─────────────┤
│ LEFT RAIL   │  MAIN STAGE                                  │ RIGHT RAIL  │
│ 280px       │  fluid                                       │ 320px       │
│ Universe    │  Hero Decision Terminal                      │ Underwriting│
│ tree +      │  Dual APY | Gauge | Dilution | Event         │ ticket      │
│ state dots  │                                              │ + MCP I/O   │
├─────────────┴──────────────────────────────────────────────┴─────────────┤
│ BOTTOM STRIP  48px  Data freshness | TimesFM run id | D1 hour | SHA      │
└──────────────────────────────────────────────────────────────────────────┘
```

**Visual language (tokens — implement as CSS variables in `src/theme/terminal.css`)**

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0B0F14` | Background |
| `--paper` | `#E8EDF2` | Primary text |
| `--organic` | `#3DDC97` | Organic APY, GREEN |
| `--perish` | `#F5C542` | Incentive APY, AMBER, countdown |
| `--halt` | `#FF4D6D` | RED, cliffs, negative Δ |
| `--mute` | `#6B7785` | Secondary |
| `--grid` | `#1A222C` | Panels |
| `--mono` | `IBM Plex Mono, ui-monospace` | All numbers |
| `--sans` | `IBM Plex Sans` | Labels |

**Number formatting (non-negotiable)**
- APY: `12.47%` (2 dp), never `12.4691…%` in hero; 4 dp in tooltip.
- USD: `$1.24M` compact in lists; full `$1,240,000` in calculator.
- Time: `T−18h 12m` countdown, UTC in tooltip.
- Quantiles: always show \(q_{10}/q_{50}/q_{90}\) as a range bar, never a single forecast number without whiskers.

---

### 2.2 Hero Decision Terminal — pixel spec

**Component tree**

```
<Terminal poolId>
  <IdentityRow />
  <DualApyDisplay />
  <EventCountdownBadge />
  <LiquidityRedemptionGauge />
  <DepositDilutionCalculator />
  <ForecastDensityStrip />     // TimesFM q10/q50/q90 + Bowley
  <PendleRadarChip />          // if pool has Pendle market
  <UnderwritingTicket />       // right rail, derived
</Terminal>
```

#### 2.2.1 IdentityRow

**UI**
- Protocol mark 24×24, pool name 20/600, assets as stacked icons, chain pill, pool_id truncated `0x12ab…9f` copy-on-click.
- Badges: `ORGANIC` (green) | `INCENTIVIZED` (gold) | `HYBRID`.
- Subline: `TVL $42.1M · Util 78.4% · IRM kink 80% · 90d coverage 2,160/2,160 hours`.

**Data:** `PoolIndexRecord` + `PoolDetailShard.identity`.

#### 2.2.2 Dual APY Display (the product)

**Kill blended APY.** Two hero numbers, optically equal weight, optically unequal *trust*.

```
┌────────────────────────────┐  ┌────────────────────────────┐
│ ORGANIC REALIZED APY       │  │ PERISHABLE INCENTIVE APY   │
│        4.82%               │  │        11.30%              │
│  q10 3.91  q50 4.82  q90   │  │  Gate0  T−4d 11h           │
│  5.44   Bowley −0.12       │  │  Gate1  cliff in 18d       │
│  source: fees+borrow 90d   │  │  residual after Gate1 0.00 │
└────────────────────────────┘  └────────────────────────────┘
         48px / 700 / --organic          48px / 700 / --perish
```

**Rules**
- If pool is 100% organic: right card renders `NONE · 0.00%` at 40% opacity, no countdown.
- If incentive dominates trailing headline: a 12px caption under the pair: `Headline 16.12% is 70% perishable. Do not underwrite the blend.`
- Clicking organic card opens ForecastDensityStrip expanded.
- Clicking perishable card opens Gate timeline (Gate 0 decay, Gate 1 cliff).

**Live Event Countdown Badge**
- Position: overlapping top-right of perishable card, 28px height, gold fill, mono.
- Copy: `CLIFF T−18:12:04` or `GAUGE T−02:11:33` or `EPOCH T−6d`.
- At `T < 1h`: pulse 1.2s, `--halt` background, white text.
- At `T ≤ 0` and shard not yet refreshed: show `EVENT DUE · SHARD STALE`, disable underwriting ticket.

#### 2.2.3 Liquidity & Redemption Gauge

**Purpose:** Physical cash, not TVL. TVL is a vanity denominator. Cash is what you can extract.

**UI — three stacked meters + state chip**

```
STATE  [ GREEN ]     utilization 78.4%   kink 80.0%   cash $9.12M

W_max_atomic  ████████████░░░░  $9.12M   “atomic cash (no new borrows)”
W_kink        ██░░░░░░░░░░░░░░  $1.68M   “headroom to IRM kink”
W_exit_1bp    ██████████░░░░░░  $4.02M   “2% depth / 1bp borrow shock”  (optional P1)
```

**State machine (must match §3.3)**

| State | Condition | Chip | Meaning |
|---|---|---|---|
| `GREEN` | \(U < 0.90\,U^\star\) and \(W_{\max\_atomic} \ge \$1{,}000{,}000\) | `--organic` | Sizeable cash, below kink |
| `AMBER` | \(0.90\,U^\star \le U < U^\star\) or \(W_{\max\_atomic} < \$1{,}000{,}000\) | `--perish` | Near kink or thin cash |
| `RED` | \(U \ge U^\star\) or \(W_{\max\_atomic} < \$100{,}000\) or paused/frozen | `--halt` | Do not add size; exit may gap |

**Physical metaphor:** a tank. Fill = utilization. A **kink tick mark** at \(U^\star\). A **cash window** on the unfilled portion labeled \(W_{\max\_atomic}\). Do not use pie charts.

**Interactions**
- Hover \(W_{\max\_atomic}\): `S · (1 − U) = $42.1M · 21.6% = $9.12M`. Show formula, then numbers.
- Hover \(W_{kink}\): `S · (1 − U/U*)`.
- Click state chip → right rail “Liquidity Opinion” paragraph generated from template (see §2.2.7).

#### 2.2.4 Interactive Deposit Dilution Calculator

**This is the conversion surface.** If Dual APY is the thesis, this is the trade ticket.

**UI**

```
DEPOSIT SIZE
[========●================]   $1,000,000
presets: 100k | 1M | 10M | custom

POST-TRADE UTILIZATION     80.6%   (from 78.4%)   ΔU +2.2pp
POST-TRADE ORGANIC APY      5.41%   (from 4.82%)   supply-side IRM
INCENTIVE APY (diluted)     8.91%   (from 11.30%)  ∝ 1/(TVL+s)
ALL-IN (do not underwrite) 14.32%   struck through if Gate1 < 30d

SPARKLINE  APY(s) for s ∈ [0, W_max_atomic]
           kink marker vertical dashed
           your s as point
```

**Slider domain:** \(s \in [0, \min(W_{\max\_atomic}, 10 \times \text{median ticket}, \$50{,}000{,}000)]\).  
Never allow a slider past \(W_{\max\_atomic}\) without an explicit override toggle `FORCE SIZE BEYOND CASH (UNEXECUTABLE ATOMICALLY)` which paints the curve `--halt` and stamps `PARTIAL FILL / MULTI-BLOCK`.

**Presets:** `$100,000`, `$1,000,000`, `$10,000,000` as buttons. Custom input accepts `1e6`, `2.5m`, `2500000`.

**Math binding:** §3.4. Recompute on every input event (closed form — no network). Shard must contain IRM params so the browser is self-contained.

**Accessibility:** slider `aria-valuetext="1,000,000 USD, post-trade organic APY 5.41 percent"`.

#### 2.2.5 ForecastDensityStrip (TimesFM)

**UI:** horizontal quantile bar.

```
q10 ├──────────●──────────┤ q90
              q50
Bowley skew −0.12  (left-fat → downside organic)
horizon 30d  model TimesFM-3.0  run 2026-04-08T11:00Z  mae_backtest 0.41pp
```

Color the `[q10, q50]` segment slightly darker than `[q50, q90]` if Bowley < 0 (downside skew). Caption: `Organic density is left-skewed; do not underwrite q50 as a floor.`

#### 2.2.6 Pendle Yield Mispricing Radar

**Entry points**
- Chip on terminal if `pendle != null`: `Δ +1.84pp  CI95 [+0.62, +3.01]  LONG PT / SHORT YIELD` or inverse.
- Full view `/?view=radar`: scatter, x = implied APY \(I\), y = Garden \(F_{30d}\), size = Pendle liquidity, color = \(\Delta\).

**Badge states**

| \(\Delta\) vs 0 | Badge |
|---|---|
| \(\Delta > +0.50\text{pp}\) and CI lower > 0 | `CHEAP IMPLIED` gold |
| \(\Delta < -0.50\text{pp}\) and CI upper < 0 | `RICH IMPLIED` red |
| else | `FAIR` mute |

**Copy, never “arb guaranteed”:** `Systematic spread vs Garden organic forecast. Not a risk-free arb. Duration, PT liquidity, and implied vol remain.`

#### 2.2.7 Right rail — Underwriting Ticket (auto-generated opinion)

Template, filled from shard, **no LLM on read path**:

```
UNDERWRITE?   {YES_ORGANIC | YES_SIZED | NO_PERISH | NO_LIQUIDITY | NO_SKEW}

Size at most min(W_kink, W_max_atomic, s*) where s* solves APY_organic(s) ≥ hurdle.
Hurdle default  T-bill + 150bp  (editable).
Horizon 30d. Gate1 in {d}d → treat incentive as 0 for underwriting.
Liquidity state {STATE}. Atomic cash {W_max_atomic}.
Forecast Bowley {b}. If b < −0.15, haircut q50 by (q50−q10).
```

Buttons: `COPY TICKET JSON` (schema §4.4), `OPEN MCP simulate_deposit`.

#### 2.2.8 Left rail — Universe (replacement for the old table)

- Group: chain → protocol → pools.
- Each row: 8px state dot, name, **organic q50 only** (not blend), \(W_{\max\_atomic}\) compact, Δ chip if Pendle.
- Sort default: **Underwriting Score** (§3.6), not APY.
- Old filters (`chain`, `minTvl`) apply here.
- Virtualized list (7,996 rows). Do not mount 8k DOM nodes.

#### 2.2.9 Screener view (`/?view=screen`) — the grown-up table

Columns (fixed order):

1. State  
2. Pool  
3. Organic \(q_{50}\)  
4. Organic \([q_{10},q_{90}]\)  
5. Incentive APY  
6. Next event  
7. \(W_{\max\_atomic}\)  
8. \(W_{kink}\)  
9. Diluted organic @ $1M  
10. Pendle \(\Delta\)  
11. Underwriting score  
12. MCP  

No “APY” column without a qualifier. Period.

---

### 2.3 Motion, empty, error, stale

| Condition | UI |
|---|---|
| Shard 404 | Terminal skeleton + `POOL SHARD MISSING · FALLBACK INDEX ONLY` |
| Forecast null (pool < 14d history) | Organic card: `INSUFFICIENT DENSITY` ; disable q-bar |
| `eth_call` IRM params stale > 2h | Gauge amber stripe `STATE LAGGED` |
| TimesFM run > 26h old | Bottom strip `--halt` `FORECAST STALE` |
| Incentive but no gate timestamps | Perishable card `UNSCHEDULED · TREAT AS ZERO` |

Motion: 120ms ease numbers; countdown ticks 1s; no layout shift on slider.

---

## 3. Mathematical & Quantitative Specification

Notation is binding. Implementation must match symbol-for-symbol in code comments and JSON field names.

### 3.0 Symbols

| Symbol | Meaning | Unit |
|---|---|---|
| \(r^{\text{org}}_t\) | Organic realized APY at hour \(t\) (fee+borrow, emissions stripped) | 1/year |
| \(r^{\text{inc}}_t\) | Incentive APY at hour \(t\) | 1/year |
| \(S\) | Total supply (cash + supplied) in USD numéraire | USD |
| \(B\) | Total borrows (or AMM equivalent “claimed” inventory) | USD |
| \(U = B/S\) | Utilization | 1 |
| \(U^\star\) | IRM kink utilization | 1 |
| \(s\) | Incremental deposit | USD |
| \(W_{\max\_atomic}\) | Atomic cash headroom | USD |
| \(W_{kink}\) | Headroom to kink | USD |
| \(F_{30d}\) | TimesFM organic \(q_{50}\) at 30d horizon | 1/year |
| \(I\) | Pendle implied APY | 1/year |
| \(\Delta\) | \(F_{30d} - I\) | 1/year |

APY is always **decimal per year** in JSON (`0.0482`), **percent** in UI (`4.82%`).

Organic series construction (pipeline, not UI):

\[
r^{\text{org}}_t = r^{\text{headline}}_t - r^{\text{inc}}_t
\]

If protocol reports fee APY and reward APY separately, use those. If only blended, subtract emission USD / TVL annualized from D1 `reward_tokens` valuation. Never forecast the blend.

---

### 3.1 TimesFM 3.0 Organic Density Forecast

**Eligible pool:** \(\ge 14 \times 24 = 336\) hourly organic observations, \(\le 5\%\) missing after LOCF ≤ 3h. Current: 7,383 pools.

**Input window:** last \(H = 2160\) hours (90d), or all if shorter.  
**Horizon:** \(h = 720\) hours (30d).  
**Model:** TimesFM 3.0, point + quantile heads. CPU batch 61s is the budget; do not add GPUs.

**Outputs per pool**

\[
\hat{q}_{\alpha}(h) = \text{TimesFM}\big(r^{\text{org}}_{t-H:t}; \alpha\big), \quad \alpha \in \{0.10, 0.50, 0.90\}
\]

Store as annualized APY, same unit as input. If TimesFM emits hourly rates, annualize:

\[
q_{\alpha} = \big(1 + \tilde{q}_{\alpha}\big)^{8760} - 1 \quad \text{if }\tilde{q}\text{ is hourly simple}
\]

**Do not** convert via \(\times 8760\) on already-annualized series. Pipeline must tag `rate_unit: "apy"` in the training matrix.

**Bowley (Yule) skewness of the forecast distribution**

\[
B_{\text{Bowley}} = \frac{q_{90} + q_{10} - 2 q_{50}}{q_{90} - q_{10}}
\]

Domain \([-1,1]\). Undefined if \(q_{90}=q_{10}\) → emit `null` and UI `FLAT`.

**Interpretation (underwriting haircut)**

\[
F^{\text{uw}}_{30d} =
\begin{cases}
q_{50} - \mathbf{1}_{B_{\text{Bowley}} < -0.15}\,(q_{50}-q_{10}) & \text{downside skew haircut} \\
q_{50} & \text{otherwise}
\end{cases}
\]

**Backtest fields (shard)**  
Walk-forward last 30d: MAE, pinball loss at 10/50/90, coverage of realized 30d mean inside \([q_{10},q_{90}]\). Used in UI subline, not in hero.

**JSON fragment** — see §5.3 `forecast`.

---

### 3.2 Deterministic Gauge Decay & Cliff Override (Gate 0 & Gate 1)

Incentives are **not** a stochastic process we forecast with TimesFM. They are a **known contract schedule** with two gates. TimesFM is organic-only. Mixing them is the original sin of this category.

**Gate 0 — Smooth decay (gauges, streaming Merkl, Aerodrome epochs)**

Let \(R(t)\) be residual reward USD per year at time \(t\), \(T_0\) now, \(T_e\) epoch end.

Linear stream (default when contract is constant-rate):

\[
R(t) = R(T_0) \cdot \frac{\max(T_e - t, 0)}{\max(T_e - T_0, \varepsilon)}, \quad \varepsilon = 1\text{s}
\]

\[
r^{\text{inc}}_{\text{Gate0}}(t) = \frac{R(t)}{S}
\]

If the gauge weight \(w(t)\) is known (on-chain `vote_weight` snapshot):

\[
R(t) = R_{\text{epoch}} \cdot \frac{w(t)}{\sum_j w_j(t)} \cdot \mathbf{1}_{t < T_e}
\]

**Gate 1 — Cliff override**

A cliff is any event that sets \(R \mapsto 0\) or a discontinuous multiple \(\lambda\):

- Emission program end  
- Gauge killed / bribe epoch gap  
- Merkl campaign `endTimestamp`  
- Temporary 2x that reverts  

\[
r^{\text{inc}}_{\text{uw}}(t) =
\begin{cases}
0 & t \ge T_{\text{cliff}} \quad \text{(hard cliff)} \\
\lambda \cdot r^{\text{inc}}_{\text{Gate0}}(t) & t \ge T_{\text{cliff}} \quad \text{(step, }\lambda < 1\text{)} \\
r^{\text{inc}}_{\text{Gate0}}(t) & t < T_{\text{cliff}}
\end{cases}
\]

**Underwriting rule (product law):**  
For any decision with horizon \(H=30\text{d}\):

\[
r^{\text{inc}}_{\text{credit}} =
\begin{cases}
0 & \text{if } T_{\text{cliff}} < T_0 + 30\text{d} \\
\mathbb{E}\big[r^{\text{inc}}_{\text{Gate0}}(t)\big]_{t \in [T_0,T_0+30\text{d}]} & \text{otherwise}
\end{cases}
\]

UI may *display* current incentive APY; the ticket *credits* \(r^{\text{inc}}_{\text{credit}}\) only.

**Unknown schedule:** `gates.unknown = true` → \(r^{\text{inc}}_{\text{credit}} = 0\) always. Caption `UNSCHEDULED · TREAT AS ZERO`.

**Countdown:** \(T_{\text{next}} = \min\{T_e, T_{\text{cliff}}\}\) that is \(> T_0\).

---

### 3.3 Atomic Cash Headroom and Kink Headroom

Lending-pool physical cash (Aave v3, Morpho Blue, Compound-like):

\[
\text{cash} = S - B = S(1-U)
\]

**Atomic cash headroom** (a fully atomic withdraw/deposit against existing cash, no new borrow, no new block of supply from others):

\[
W_{\max\_atomic} = S(1-U)
\]

For a **depositor**, \(W_{\max\_atomic}\) is the max *additional* supply that does not require the market to attract new borrows to stay consistent with current \(B\) (supply can always increase; the binding constraint for *exit* of *existing* LPs is cash). Product displays both interpretations:

- **Exit capacity of the pool (current LPs):** \(W_{\max\_atomic} = S(1-U)\)
- **Your exit after depositing \(s\):** \(W_{\max\_atomic}(s) = (S+s)(1-U(s)) = S+s-B\)  
  which *increases* cash by \(s\). The dangerous number for a new LP is not post-deposit cash; it is **pre-deposit cash as a proxy for how thin the market is** and **kink distance**.

**Kink headroom** (supply you can add before utilization hits \(U^\star\), holding \(B\) fixed):

\[
U(s) = \frac{B}{S+s}, \qquad W_{kink} = S\left(1 - \frac{U}{U^\star}\right) = \frac{B}{U^\star} - S
\]

Wait. Holding \(B\) fixed, utilization *falls* when you supply. Kink for **suppliers** on a jump-rate IRM is usually approached by **borrowers**, not depositors.

**Correct institutional meaning (lock this):**

Two different kinks exist. We publish both, named unambiguously.

**A. Supply-side kink distance (utilization falling)** — mostly irrelevant for “will APY collapse.”  
Depositing *lowers* \(U\), moving *away* from a high-U kink. Supply APY typically *falls* as \(U\) falls (less scarce cash).

**B. Borrow-side / rate-kink proximity (current location on IRM)** — this is the gauge.

Define:

\[
W_{kink}^{\text{borrow}} = S U^\star - B = S(U^\star - U)
\]

= additional **borrows** to reach kink (if \(U < U^\star\)); negative if already past kink.

For the **supplier underwriting** the *stability of supply APY*, the relevant headroom is how close \(U\) is to \(U^\star\) in **borrow** space, because a small borrow impulse crosses the kink and spikes (or, post-kink, already spiky). Display:

\[
W_{kink} := S\left(1 - \frac{U}{U^\star}\right) = S \cdot \frac{U^\star - U}{U^\star}
\]

This equals \(W_{kink}^{\text{borrow}} / U^\star\), i.e. **the supply-equivalent distance to kink**, a dollar figure comparable to ticket size: “if net demand for cash equal to \(W_{kink}\) arrives as borrows against current supply, you are at the kink.”

**Algebra check:**  
\(S(1 - U/U^\star) = S - B/U^\star\).  
If \(U^\star=0.8\), \(S=42.1\text{M}\), \(U=0.784\), \(B=33.0064\text{M}\):  
\(W_{kink} = 42.1\text{M}\times(1-0.784/0.8)=42.1\text{M}\times0.02=\$0.842\text{M}\).

Earlier UI example used \(W_{kink}=\$1.68\text{M}\) — that was illustrative. **Code must compute the formula, not the mock.**

**If already past kink** (\(U \ge U^\star\)):

\[
W_{kink} = 0, \quad \text{state} \in \{\text{AMBER if }U < 0.95, \text{RED otherwise}\}
\]

**State function (canonical)**

```
function liquidityState(U, Ustar, Watomic):
  if paused or frozen or Watomic < 100_000: return RED
  if U >= Ustar: return RED if U >= 0.95 else AMBER
  if U >= 0.90 * Ustar or Watomic < 1_000_000: return AMBER
  return GREEN
```

**AMM / LP pools (Uniswap v3, Curve, Aerodrome slips)**  
There is no \(B,U^\star\). Define analog:

\[
W_{\max\_atomic} := \text{2% depth in quote numéraire (zero-impact band)}, \quad W_{kink} := \text{1bp-impact size}
\]

Computed offline in the pipeline from on-chain reserves / ticks; stored as the same JSON fields so the UI is protocol-agnostic. IRM dilution calculator becomes **price-impact APY / fee dilution** (§3.4.2).

---

### 3.4 Closed-form IRM Dilution Curve

#### 3.4.1 Jump-rate / utilization IRM (Aave-like)

Hold borrows \(B\) fixed. Deposit \(s \ge 0\):

\[
U(s) = \frac{B}{S+s}
\]

Piecewise linear IRM on borrow rate \(r_b\):

\[
r_b(U) =
\begin{cases}
r_0 + \dfrac{U}{U^\star} r_{\text{slope1}} & U \le U^\star \\[6pt]
r_0 + r_{\text{slope1}} + \dfrac{U-U^\star}{1-U^\star} r_{\text{slope2}} & U > U^\star
\end{cases}
\]

Reserve factor \(\phi \in [0,1)\). Supply APY (compounding ignored in hero; we use simple, note in tooltip):

\[
\text{APY}_{\text{org}}(s) = r_b\big(U(s)\big) \cdot U(s) \cdot (1-\phi)
\]

**Exact, implement this function in `src/math/irm.ts` and in MCP.** No interpolation of observed APY.

Incentive dilution (emissions USD/year \(R\) held fixed — Gate 0 current, not credited past cliff):

\[
\text{APY}_{\text{inc}}(s) = \frac{R}{S+s}
\]

**Morpho Blue:** same shape with market-specific `lltv`, `irm` (AdaptiveCurveIRM). Use `eth_call` to `irm.borrowRate(marketParams, market)` at current state, then **recompute** at hypothetical `{totalSupplyAssets: S+s, totalBorrowAssets: B}`. If the IRM is adaptive (time-dependent curve), freeze `rateAtTarget` from last `eth_call` and apply the closed-form AdaptiveCurve around that frozen target. Document `irm_mode: "frozen_adaptive"` in shard.

**Compound v2/v3:** kink IRM identical family; map `kink`, `multiplierPerBlock` → per-year \(r_{\text{slope1}}\) in the pipeline (block time assumption: Ethereum 12s, tagged `blocks_per_year`).

#### 3.4.2 AMM / LP fee dilution

Let fee APY at current pool state be denoted \(F_{\text{spot}}\), the 30-day trailing realized fee APY \(F_{30d}\), and the 7-day trailing realized fee APY \(F_{7d}\). All three are computed on the same notional base (USD TVL of the relevant AMM range or full-range position, as specified per venue adapter) and are **gross of IL / LVR** unless otherwise labelled.

Define the **fee-dilution operator** as the first-order response of fee APY to an incremental LP deposit \(\Delta L\) (measured in the pool’s liquidity units, not USD):

\[
\frac{\partial F}{\partial L}
=
-\,\frac{F}{L}\cdot\kappa
\qquad\text{where}\qquad
\kappa
=
\frac{\partial \log V}{\partial \log L}
\in [0,1]
\]

\(\kappa\) is the **volume-retention elasticity**. \(\kappa=1\) means volume is invariant to added liquidity (pure dilution: fees per LP fall 1:1 with TVL). \(\kappa=0\) means volume scales perfectly with liquidity (no dilution). Empirically, concentrated AMMs on Ethereum L2s exhibit \(\kappa \in [0.65, 0.95]\) outside of incentive-warped pools; we **never** assume \(\kappa=0\).

**Canonical dilution model (must be used by every yield path that includes an AMM LP leg):**

\[
F(\Delta L)
=
F_{\text{spot}}
\cdot
\left(
\frac{L}{L+\Delta L}
\right)^{\kappa}
\cdot
\phi\!\left(\frac{\Delta L}{L}\right)
\]

where \(\phi\) is a **range-occupancy correction** for concentrated liquidity:

\[
\phi(x)
=
\begin{cases}
1 & \text{full-range or tick-width invariant}\\
\dfrac{w}{w+x\cdot w_{\text{self}}} & \text{active-tick concentrated position}
\end{cases}
\]

\(w\) is the share of in-range liquidity already present in the ticks the strategy will occupy; \(w_{\text{self}}\) is the fraction of \(\Delta L\) that lands in those same ticks. If the strategy cannot prove tick occupancy (oracle gap, missing `slot0`/`ticks` snapshot), set \(\phi = 0.70\) (conservative default, logged as `DILUTION_OCCUPANCY_FALLBACK`).

**Fee APY used for downstream compounding is never \(F_{\text{spot}}\).** It is the **dilution-adjusted, horizon-matched** quantity:

\[
F_{\text{eff}}(\Delta L, H)
=
\begin{aligned}[t]
&(1-\lambda)\,F(\Delta L)
+ \lambda\,F_{30d}\cdot\left(\frac{L}{L+\Delta L}\right)^{\kappa}\\
&\quad\cdot \min\!\bigl(1,\, F_{7d}/F_{30d}\bigr)^{\eta}
\end{aligned}
\]

with:

| Symbol | Default | Meaning |
|---|---|---|
| \(\lambda\) | \(0.65\) | Weight on trailing vs. spot (anti-spike) |
| \(\eta\) | \(1.25\) | Penalty exponent if 7d fee run-rate has already decayed vs 30d |
| \(H\) | strategy horizon (days) | Used only to select trailing window; \(H\le 7 \Rightarrow\) replace \(F_{30d}\) with \(F_{7d}\) |

**Hard constraints (fail closed):**

1. If \(F_{\text{spot}} / F_{30d} > 2.5\), discard \(F_{\text{spot}}\) and set \(F_{\text{eff}} = 0.5\cdot F_{30d}\cdot (L/(L+\Delta L))^{\kappa}\). Flag `FEE_SPIKE_CLAMP`.
2. If 30d fee volume is below venue dust threshold (`FEE_VOLUME_DUST_USD`, default $1,000), \(F_{\text{eff}} := 0\). Do not advertise a fee APY.
3. Incentive emissions (AERO, OP, ARB, MERKL, etc.) are **not** part of \(F\). They are a separate cashflow \(E\) with their own dilution \(\kappa_E\) (typically \(\kappa_E \approx 1\) because reward rate is often fixed per block, not per TVL). Mixing \(E\) into \(F\) is a **P0 defect**.
4. LVR / IL is applied **after** \(F_{\text{eff}}\), never netted inside it. Net LP carry is:

\[
C_{\text{LP}}
=
F_{\text{eff}}
- \mathbb{E}[\text{LVR}]_H
- \mathbb{E}[\text{IL}]_H
- g_{\text{gas}}
\]

where \(g_{\text{gas}}\) is annualized rebalance + harvest gas as a fraction of position notional. If \(C_{\text{LP}} < 0\), the LP leg is **carry-negative** and may only appear in a path if it is structurally required (e.g., to mint a Pendle SY) **and** the residual path still clears the hurdle in §3.3.

**Worked numerical check (must appear in unit tests):**  
\(L=\$10\text{M}\), \(\Delta L=\$500\text{k}\), \(F_{\text{spot}}=18\%\), \(F_{30d}=11\%\), \(F_{7d}=9\%\), \(\kappa=0.80\), \(\lambda=0.65\), \(\eta=1.25\), full-range \(\phi=1\):

\[
\left(\frac{L}{L+\Delta L}\right)^{\kappa} = (10/10.5)^{0.80} \approx 0.9619
\]
\[
F(\Delta L) = 0.18 \cdot 0.9619 = 0.1731
\]
\[
\min(1, 9/11)^{1.25} = (0.8182)^{1.25} \approx 0.777
\]
\[
F_{\text{eff}} = 0.35\cdot 0.1731 + 0.65\cdot 0.11\cdot 0.9619\cdot 0.777 \approx 0.1142 \;\Rightarrow\; 11.42\%
\]

Any implementation that returns \(18\%\) (spot) or \(11\%\) (raw trailing) for this fixture **fails DoD**.

**Reporting:** every LP-containing path object **must** emit:

```
fee_apy_spot, fee_apy_7d, fee_apy_30d, kappa, delta_L_usd,
fee_apy_eff, lvr_apy, il_apy, gas_drag_apy, lp_carry_net,
flags[]
```

Omitting `fee_apy_eff` or substituting `fee_apy_spot` in the path IRR is a schema violation.

---

### 3.5 Pendle Arbitrage Spread \(\Delta = F_{30d} - I\)

Pendle PT/YT is treated as a **fixed-vs-floating basis instrument**, not as a “yield farm.” Let:

- \(I\) = implied APY of the PT, converted from the PT discount to maturity using **Actual/365**, continuously compounded **only** if the venue adapter’s `rate_convention` says so; default is **periodic, Actual/365, not compounded inside the tenor**:

\[
I
=
\frac{1 - P_{\text{PT}}}{P_{\text{PT}}}\cdot\frac{365}{\tau}
\]

where \(P_{\text{PT}}\) is the mid PT price in units of SY (or the accounting asset specified by the SY), and \(\tau\) is days to maturity. Bid/ask is **not** optional:

\[
I_{\text{bid}} = I(P_{\text{ask}}),\qquad I_{\text{ask}} = I(P_{\text{bid}})
\]

A long-PT (lock implied) executes at \(I_{\text{bid}}\). A long-YT (pay implied, receive floating) executes at \(I_{\text{ask}}\). Using mid for executable \(\Delta\) is forbidden.

- \(F_{30d}\) = **underlying floating yield**, dilution-adjusted if the SY wraps an AMM/LP or a TVL-dilutable farm (§3.4.2), **and** stripped of non-transferable points unless `points_monetizable=true` with a documented secondary market haircut.
- \(Y_{\text{ Pendle fee}}\) = Pendle YT/PT trading fee + SY wrap/unwrap fee, annualized over remaining tenor (not over 365 if \(\tau < 365\)).
- \(S_{\text{slip}}\) = expected slippage for the **stated notional**, from on-chain depth (Pendle AMM + any nested SY liquidity), not from a constant-product toy.

**Definition of the arbitrage spread:**

\[
\Delta
:=
F_{30d} - I
\]

**Executable spreads (the only quantities that may enter ranking):**

\[
\begin{aligned}
\Delta_{\text{PT}}
&=
I_{\text{bid}}
- r_f(\tau)
- S_{\text{slip}}^{\text{PT}}
- Y_{\text{fee}}^{\text{PT}}
- c_{\text{opp}}
\\[4pt]
\Delta_{\text{YT}}
&=
F_{30d}^{\text{eff}}
- I_{\text{ask}}
- S_{\text{slip}}^{\text{YT}}
- Y_{\text{fee}}^{\text{YT}}
- \mathbb{E}[\text{dilution}]_{\tau}
- c_{\text{opp}}
\end{aligned}
\]

\(r_f(\tau)\) is the risk-free (or venue-native cash) rate of matching tenor — default: Aave v3 USDC supply APY on the same chain if the accounting asset is USD-stable, else 0 and flag `RF_UNAVAILABLE`. \(c_{\text{opp}}\) is the capital-lock opportunity cost from §3.3 (hurdle), **not** double-counted with \(r_f\).

**Sign convention (immutable):**

| Position | Economic bet | Enter iff |
|---|---|---|
| Long PT | Implied rich vs cash / vs expected floating | \(\Delta_{\text{PT}} > h_{\text{PT}}\) |
| Long YT | Floating rich vs implied | \(\Delta_{\text{YT}} > h_{\text{YT}}\) |
| PT + hedge (basis pack) | Lock \(\Delta_{\text{PT}}\) vs funding | pack IRR > hurdle after hedge cost |
| YT is **not** “APY” | YT is a leveraged residual on \(F-I\) | never display YT ROI as APY |

Default hurdles: \(h_{\text{PT}} = 40\,\text{bps}\) net, \(h_{\text{YT}} = 150\,\text{bps}\) net (YT is a decaying, high-convexity claim; it does not clear at PT tightness).

**Points and “Pendle APY” lies — explicit ban list:**

1. Pendle UI “underlying APY + implied APY” stacked as if additive **must not** be reproduced.
2. YT “fixed APY” from `ytPrice / (1 - ytPrice)` is a **leverage multiple on \(\Delta\)**, not a yield. If displayed at all, label `yt_leverage_on_spread`, never `apy`.
3. Pre-maturity “fixed yield” on PT is \(I_{\text{bid}}\) **only if held to maturity and SY redeems 1:1**. If SY has credit, depeg, or cooldown risk, haircut \(I\) by \(\pi_{\text{SY}}\) from the risk engine.
4. Maturity < 7 days: \(\Delta\) is noise-dominated. Set `PENDLE_DUST_TENOR` and exclude from ranked paths unless notional is inventory-management, not yield.

**Convergence / hold-to-maturity P&L (PT):**

\[
\text{PnL}_{\text{PT}}(t,T)
=
\frac{1}{P_{\text{PT}}(t)} - 1
\quad\text{(in SY)}
\]

Mark-to-market before \(T\) is **not** this number. Any dashboard that shows “you have already earned \(I\)” on a freshly bought PT is a **P0 defect**. Accrual accounting for PT is linear in time **only** for internal NAV of a hold-to-maturity book, and must be labelled `htmm_accrual`, distinct from `mtm`.

**YT decay identity (must be tested):**

\[
P_{\text{PT}} + P_{\text{YT}} = P_{\text{SY}}
\quad\text{(up to 1 bp after fees, same block)}
\]

If a snapshot violates this by > 5 bps, discard the Pendle market (`PENDLE_TRIPOD_BREAK`) — stale subgraph or AMM desync.

**Spread surface published to agents:**

For each Pendle market \(m\):

\[
\{\,I_{\text{bid}}, I_{\text{ask}}, F_{30d}, F_{\text{eff}}, \Delta_{\text{mid}}, \Delta_{\text{PT}}, \Delta_{\text{YT}}, \tau, \text{depth}_{1\%}, \pi_{\text{SY}}\,\}
\]

Ranking key for the PT book is \(\Delta_{\text{PT}}\) **per unit of capital lock time**, i.e. \(\Delta_{\text{PT}}\cdot \tau/365\) is **not** the sort key; **annualized executable** \(\Delta_{\text{PT}}\) is, subject to \(\tau \ge 7\). Ranking key for YT is expected residual \(\mathbb{E}[F_{\text{eff}}-I_{\text{ask}}]\) under the fee-dilution model, **not** max YT “APY”.

**Kill conditions (immediate path exclusion):**

- SY asset \(\notin\) allowlist, or SY unwrap \(\ne\) 1:1 within documented residual.
- Implied APY computed from a PT price \(> 1\) or \(< 0.01\).
- Depth at 50 bps < 10% of requested notional.
- Oracle / subgraph block lag \(> 3\) minutes on L2, \(> 90\) seconds on L1.
- Points-only “yield” with `points_monetizable=false`.

---

## 4. B2B & Autonomous Agent Plane

DeFi Garden’s machine interface is a **Model Context Protocol (MCP) server**. Humans get a UI; agents get **three canonical tools** and nothing else. There is no “dump the graph” tool, no arbitrary SQL, no unsigned transaction builder in v1.0. Agents may **propose**; they may not **broadcast**. Execution, if any, is a later plane with a distinct threat model.

### 4.0 Design axioms

1. **Read-only in P0–P2.** Tools return ranked paths, risk, and quotes. They never return raw private keys, never sign, never `eth_sendRawTransaction`.
2. **Deterministic given a snapshot id.** Same `snapshot_id` + same tool args \(\Rightarrow\) byte-identical JSON (canonical key order, no NaN, no `-0.0`).
3. **Fail closed.** Unknown chain, stale snapshot, or schema-invalid args \(\Rightarrow\) `error` object, HTTP-equivalent 4xx in the MCP error channel, empty `paths`.
4. **Notional is first-class.** Every yield number is a function of `notional_usd` via §3.4.2 and §3.5. Tools that omit notional are invalid.
5. **No hidden legs.** If a path wraps, stakes, locks, or bridges, every leg is in `legs[]` with protocol, chain, function selector family, and fee.
6. **Audit surface.** Every response includes `snapshot_id`, `as_of_block` per chain, `model_version` (`DG-PRD-2026-PIVOT-v1.0`), and `disclaimer_code`.

### 4.1 Transport & auth

| Item | Spec |
|---|---|
| Protocol | MCP 2024-11-05 (JSON-RPC 2.0 over stdio for local; Streamable HTTP for remote) |
| Endpoint (remote) | `POST /mcp` on the Garden control plane; TLS 1.3 |
| Auth | `Authorization: Bearer <agent_key>` ; key scoped to `tools:read` |
| Rate limit | 30 calls / 60s / key ; burst 10 ; 429 with `retry_after_ms` |
| Idempotency | `X-DG-Idempotency-Key` optional; 24h replay cache on `snapshot_id`+hash(args) |
| Max payload | 256 KB request, 1 MB response |
| Numeric types | JSON numbers finite; APYs as decimals (`0.1142` = 11.42%); never strings for quantities except ids |

### 4.2 The three canonical tools

Only these names exist in the MCP `tools/list` surface:

1. `dg_rank_paths`
2. `dg_explain_path`
3. `dg_quote_notional`

Anything else (`dg_sql`, `dg_sign`, `dg_simulate_exploit`, `eth_call` passthrough) is **out of scope** and **must not** be registered.

---

### 4.3 Tool 1 — `dg_rank_paths`

**Purpose.** Return the top-\(K\) capital paths that clear the hurdle for a given accounting asset, chain set, notional, and horizon, after fee dilution, Pendle basis, gas, and risk haircuts.

#### 4.3.1 JSON Schema — tool descriptor (`tools/list` fragment)

```json
{
  "name": "dg_rank_paths",
  "description": "Rank executable DeFi capital paths for a notional, horizon, and risk budget. Yields are dilution-adjusted and bid/ask executable. Does not sign or submit transactions.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://defi.garden/schema/2026/dg_rank_paths.input.json",
    "type": "object",
    "additionalProperties": false,
    "required": ["accounting_asset", "notional_usd", "horizon_days"],
    "properties": {
      "accounting_asset": {
        "type": "string",
        "description": "Numeraire ticker. Allowlist: USDC, USDT, DAI, USDG, ETH, WETH, WBTC.",
        "enum": ["USDC", "USDT", "DAI", "USDG", "ETH", "WETH", "WBTC"]
      },
      "notional_usd": {
        "type": "number",
        "exclusiveMinimum": 0,
        "maximum": 100000000,
        "description": "Gross capital in USD terms at snapshot FX. Used for dilution, depth, and gas drag."
      },
      "horizon_days": {
        "type": "integer",
        "minimum": 1,
        "maximum": 365,
        "description": "Holding / compounding horizon H. Selects trailing windows and lock-cost amortization."
      },
      "chains": {
        "type": "array",
        "minItems": 1,
        "maxItems": 16,
        "uniqueItems": true,
        "default": ["ethereum", "base", "arbitrum"],
        "items": {
          "type": "string",
          "enum": ["ethereum", "base", "arbitrum", "optimism", "polygon", "unichain", "scroll", "linea"]
        }
      },
      "k": {
        "type": "integer",
        "minimum": 1,
        "maximum": 25,
        "default": 10
      },
      "risk_budget": {
        "type": "string",
        "enum": ["conservative", "standard", "aggressive"],
        "default": "standard"
      },
      "include_pendle": { "type": "boolean", "default": true },
      "include_lp": { "type": "boolean", "default": true },
      "include_points_unmonetized": { "type": "boolean", "default": false },
      "min_tvl_usd": {
        "type": "number",
        "minimum": 0,
        "default": 500000
      },
      "max_lock_days": {
        "type": "integer",
        "minimum": 0,
        "maximum": 365,
        "default": 365
      },
      "snapshot_id": {
        "type": "string",
        "pattern": "^snap_[0-9a-f]{32}$",
        "description": "Pin evaluation to an immutable snapshot. If omitted, use latest sealed snapshot."
      },
      "exclude_protocols": {
        "type": "array",
        "maxItems": 64,
        "items": { "type": "string", "minLength": 1, "maxLength": 64 }
      }
    }
  }
}
```

#### 4.3.2 JSON Schema — output

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://defi.garden/schema/2026/dg_rank_paths.output.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "ok", "snapshot_id", "model_version", "as_of", "query", "paths", "rejected_count", "disclaimer_code"
  ],
  "properties": {
    "ok": { "type": "boolean" },
    "snapshot_id": { "type": "string", "pattern": "^snap_[0-9a-f]{32}$" },
    "model_version": { "type": "string", "const": "DG-PRD-2026-PIVOT-v1.0" },
    "as_of": {
      "type": "object",
      "additionalProperties": false,
      "required": ["unix_ms", "blocks"],
      "properties": {
        "unix_ms": { "type": "integer", "minimum": 0 },
        "blocks": {
          "type": "object",
          "additionalProperties": { "type": "integer", "minimum": 0 },
          "description": "chain_id_name -> block number"
        }
      }
    },
    "query": { "type": "object" },
    "paths": {
      "type": "array",
      "items": { "$ref": "#/$defs/path_summary" }
    },
    "rejected_count": { "type": "integer", "minimum": 0 },
    "disclaimer_code": { "type": "string", "const": "DG_NOT_ADVICE_V1" },
    "error": { "$ref": "#/$defs/error" }
  },
  "$defs": {
    "path_summary": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "path_id", "name", "chains", "irr_net", "apy_headline_banned",
        "hurdle_clear_bps", "capital_lock_days", "legs", "risk", "pendle", "lp"
      ],
      "properties": {
        "path_id": { "type": "string", "pattern": "^pth_[0-9a-f]{24}$" },
        "name": { "type": "string", "minLength": 1, "maxLength": 128 },
        "chains": { "type": "array", "items": { "type": "string" } },
        "irr_net": {
          "type": "number",
          "description": "Annualized net IRR after dilution, fees, gas, expected LVR/IL, SY haircut. Decimal."
        },
        "apy_headline_banned": {
          "type": "boolean",
          "const": true,
          "description": "Literal true. Forces clients not to treat irr_net as a farm APY banner."
        },
        "hurdle_clear_bps": { "type": "number" },
        "capital_lock_days": { "type": "number", "minimum": 0 },
        "notional_usd": { "type": "number" },
        "legs": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["i", "protocol", "chain", "action", "asset_in", "asset_out"],
            "properties": {
              "i": { "type": "integer", "minimum": 0 },
              "protocol": { "type": "string" },
              "chain": { "type": "string" },
              "action": {
                "type": "string",
                "enum": [
                  "lend", "borrow", "swap", "lp_provide", "lp_withdraw",
                  "stake", "unstake", "wrap_sy", "unwrap_sy",
                  "pendle_buy_pt", "pendle_buy_yt", "pendle_redeem",
                  "bridge", "restake"
                ]
              },
              "asset_in": { "type": "string" },
              "asset_out": { "type": "string" },
              "pool_id": { "type": "string" }
            }
          }
        },
        "risk": {
          "type": "object",
          "required": ["score", "max_severity", "tags"],
          "properties": {
            "score": { "type": "number", "minimum": 0, "maximum": 100 },
            "max_severity": { "type": "string", "enum": ["low", "med", "high", "crit"] },
            "tags": { "type": "array", "items": { "type": "string" } }
          }
        },
        "pendle": {
          "type": ["object", "null"],
          "properties": {
            "market": { "type": "string" },
            "I_bid": { "type": "number" },
            "I_ask": { "type": "number" },
            "F_30d": { "type": "number" },
            "delta_pt": { "type": "number" },
            "delta_yt": { "type": "number" },
            "tau_days": { "type": "number" }
          }
        },
        "lp": {
          "type": ["object", "null"],
          "properties": {
            "fee_apy_spot": { "type": "number" },
            "fee_apy_eff": { "type": "number" },
            "kappa": { "type": "number" },
            "lp_carry_net": { "type": "number" }
          }
        }
      }
    },
    "error": {
      "type": "object",
      "required": ["code", "message"],
      "properties": {
        "code": {
          "type": "string",
          "enum": [
            "INVALID_ARGS", "STALE_SNAPSHOT", "UNKNOWN_SNAPSHOT",
            "ASSET_NOT_ALLOWLISTED", "NO_PATHS", "RATE_LIMITED", "INTERNAL"
          ]
        },
        "message": { "type": "string" }
      }
    }
  }
}
```

#### 4.3.3 Ranking function (normative)

Let \(\mathcal{P}\) be the feasible path set after allowlist, TVL, lock, and kill-condition filters.

\[
\text{score}(p)
=
\text{irr_net}(p)
- \mathbb{1}_{\text{risk=conservative}}\cdot 0.25\cdot \sigma_{\text{down}}(p)
- \mathbb{1}_{\text{bridge}\in p}\cdot 0.004
\]

Sort descending by `score`, then by `risk.score` ascending, then by `path_id` lexicographic (tie-break for determinism). Drop \(p\) if `hurdle_clear_bps < 0` under the selected `risk_budget`.

`irr_net` **must** be computed from §3.3–§3.5. Using venue “APY” fields as `irr_net` is a **P0 defect**.

---

### 4.4 Tool 2 — `dg_explain_path`

**Purpose.** Full attribution of a single `path_id`: cashflow stack, dilution math, Pendle tripod, gas, risk tags, and why it beat or lost to the next-best path. This is the **audit tool**. Agents that cannot explain a path are not allowed to recommend it.

#### 4.4.1 Input schema

```json
{
  "name": "dg_explain_path",
  "description": "Return full mathematical attribution for a ranked path_id at a snapshot. Read-only.",
  "inputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://defi.garden/schema/2026/dg_explain_path.input.json",
    "type": "object",
    "additionalProperties": false,
    "required": ["path_id"],
    "properties": {
      "path_id": { "type": "string", "pattern": "^pth_[0-9a-f]{24}$" },
      "snapshot_id": {
        "type": "string",
        "pattern": "^snap_[0-9a-f]{32}$"
      },
      "notional_usd": {
        "type": "number",
        "exclusiveMinimum": 0,
        "maximum": 100000000,
        "description": "If omitted, reuse the notional stored on the path at rank time. If provided, recompute dilution and depth."
      }
    }
  }
}
```

#### 4.4.2 Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://defi.garden/schema/2026/dg_explain_path.output.json",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "ok", "snapshot_id", "model_version", "path_id", "attribution", "disclaimer_code"
  ],
  "properties": {
    "ok": { "type": "boolean" },
    "snapshot_id": { "type": "string" },
    "model_version": { "type": "string", "const": "DG-PRD-2026-PIVOT-v1.0" },
    "path_id": { "type": "string" },
    "attribution": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "cashflows", "dilution", "pendle", "gas", "hurdle",
        "irr_bridge", "why_not_next_best", "flags"
      ],
      "properties": {
        "cashflows": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["leg_i", "source", "apy_component", "included_in_irr"],
            "properties": {
              "leg_i": { "type": "integer" },
              "source": { "type": "string" },
              "apy_component": { "type": "number" },
              "included_in_irr": { "type": "boolean" },
              "note": { "type": "string" }
            }
          }
        },
        "dilution": {
          "type": ["object", "null"],
          "properties": {
            "L_usd": { "type": "number" },
            "delta_L_usd": { "type": "number" },
            "kappa": { "type": "number" },
            "fee_apy_spot": { "type": "number" },
            "fee_apy_7d": { "type": "number" },
            "fee_apy_30d": { "type": "number" },
            "fee_apy_eff": { "type": "number" },
            "formula_id": { "type": "string", "const": "DG_FEE_EFF_v1" }
          }
        },
        "pendle": {
          "type": ["object", "null"],
          "properties": {
            "P_pt": { "type": "number" },
            "P_yt": { "type": "number" },
            "P_sy": { "type": "number" },
            "tripod_break_bps": { "type": "number" },
            "I_bid": { "type": "number" },
            "I_ask": { "type": "number" },
            "F_30d": { "type": "number" },
            "delta": { "type": "number", "description": "F_30d - I_mid, diagnostic only" },
            "delta_pt": { "type": "number" },
            "delta_yt": { "type": "number" },
            "rate_convention": { "type": "string", "const": "Act/365_periodic" }
          }
        },
        "gas": {
          "type": "object",
          "required": ["enter_usd", "exit_usd", "harvest_usd_per_year", "drag_apy"],
          "properties": {
            "enter_usd": { "type": "number" },
            "exit_usd": { "type": "number" },
            "harvest_usd_per_year": { "type": "number" },
            "drag_apy": { "type": "number" }
          }
        },
        "hurdle": {
          "type": "object",
          "required": ["r_hurdle", "irr_net", "clear_bps"],
          "properties": {
            "r_hurdle": { "type": "number" },
            "irr_net": { "type": "number" },
            "clear_bps": { "type": "number" }
          }
        },
        "irr_bridge": {
          "type": "object",
          "description": "Stepwise IRR from gross venue numbers to irr_net.",
          "required": ["steps"],
          "properties": {
            "steps": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["name", "apy_after"],
                "properties": {
                  "name": {
                    "type": "string",
                    "enum": [
                      "venue_spot_gross",
                      "trailing_blend",
                      "dilution",
                      "lvr_il",
                      "pendle_basis_executable",
                      "sy_haircut",
                      "gas_drag",
                      "lock_opportunity",
                      "irr_net"
                    ]
                  },
                  "apy_after": { "type": "number" },
                  "horizon_days": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Canonical holding horizon used for the IRR identity. MUST equal ticket.horizon_days."
                  },
                  "n_compounds": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "Discrete compounding events inside the horizon. Continuous limit is encoded as n_compounds → ∞ with closed-form exp(r·T) − 1."
                  },
                  "fee_drag_bps": {
                    "type": "number",
                    "minimum": 0,
                    "description": "Total protocol + LP + gas-amortized fee drag expressed in basis points of notional, already subtracted from apy_after."
                  },
                  "irr_nominal": {
                    "type": "number",
                    "description": "Solution r* of NPV(r*) = 0 under the ticket cashflow vector, quoted as an annualized rate in decimal (0.12 = 12%). MUST satisfy |NPV(r*)| ≤ 1e-12 · |CF₀|."
                  },
                  "irr_real": {
                    "type": "number",
                    "description": "irr_nominal deflated by the venue's quoted stablecoin depeg-adjusted inflation proxy π̂: irr_real = (1 + irr_nominal)/(1 + π̂) − 1."
                  },
                  "npv_at_zero": {
                    "type": "number",
                    "description": "Σ CFₜ, the undiscounted cashflow sum. Sign MUST equal sign(irr_nominal) when all CFₜ>0 for t>0."
                  },
                  "duration_macaulay": {
                    "type": "number",
                    "minimum": 0,
                    "description": "Macaulay duration in years: Σ t·PV(CFₜ) / Σ PV(CFₜ) evaluated at irr_nominal."
                  },
                  "convexity": {
                    "type": "number",
                    "description": "Bond-equivalent convexity in years²: Σ t(t+1)·PV(CFₜ) / [(1+r)² · Σ PV(CFₜ)]."
                  },
                  "identity_check": {
                    "type": "object",
                    "additionalProperties": false,
                    "required": ["holds", "residual", "method"],
                    "properties": {
                      "holds": { "type": "boolean" },
                      "residual": {
                        "type": "number",
                        "description": "NPV(irr_nominal). MUST be ≤ 1e-12 · max(1, |CF₀|)."
                      },
                      "method": {
                        "type": "string",
                        "enum": ["newton_raphson", "brent_dekker", "closed_form_continuous"]
                      }
                    }
                  }
                }
              },
              "attribution": {
                "type": "object",
                "additionalProperties": false,
                "required": ["gross_yield_bps", "fee_bps", "il_bps", "gas_amort_bps", "slippage_bps", "residual_bps", "sum_bps"],
                "description": "Exact linear attribution of apy_after − cash_apy into additive basis-point buckets. Invariant: sum_bps = gross_yield_bps + fee_bps + il_bps + gas_amort_bps + slippage_bps + residual_bps, with |residual_bps| ≤ 0.5.",
                "properties": {
                  "gross_yield_bps": { "type": "number" },
                  "fee_bps": { "type": "number" },
                  "il_bps": { "type": "number" },
                  "gas_amort_bps": { "type": "number" },
                  "slippage_bps": { "type": "number" },
                  "residual_bps": { "type": "number" },
                  "sum_bps": { "type": "number" }
                }
              },
              "risk_surface": {
                "type": "object",
                "additionalProperties": false,
                "required": ["var_95", "cvar_95", "max_drawdown_p99", "il_p95", "liquidation_prob", "depeg_prob", "smart_contract_score", "oracle_score", "composite_risk_grade"],
                "properties": {
                  "var_95": {
                    "type": "number",
                    "description": "1-horizon 95% historical VaR as a fraction of notional (negative = loss)."
                  },
                  "cvar_95": {
                    "type": "number",
                    "description": "Expected Shortfall ES_{0.95} = E[R | R ≤ VaR_{0.95}]."
                  },
                  "max_drawdown_p99": { "type": "number" },
                  "il_p95": {
                    "type": "number",
                    "description": "95th-percentile impermanent-loss fraction vs. HODL, 0 if the path is single-asset."
                  },
                  "liquidation_prob": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "depeg_prob": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "smart_contract_score": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1,
                    "description": "Posterior mean of the audit-weighted contract integrity prior. 1 = fully audited, no criticals, >90d live TVL."
                  },
                  "oracle_score": {
                    "type": "number",
                    "minimum": 0,
                    "maximum": 1
                  },
                  "composite_risk_grade": {
                    "type": "string",
                    "enum": ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "D"],
                    "description": "Mapped from a monotone transform of CVaR, liquidation_prob, and (1 − smart_contract_score). Mapping table is frozen in `packages/risk/src/grade.ts` and MUST NOT be altered without a PRD amendment."
                  }
                }
              },
              "path_graph": {
                "type": "object",
                "additionalProperties": false,
                "required": ["nodes", "edges", "entry_node_id", "exit_node_id"],
                "properties": {
                  "nodes": {
                    "type": "array",
                    "minItems": 2,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["id", "kind", "venue", "asset", "tvl_usd"],
                      "properties": {
                        "id": { "type": "string" },
                        "kind": {
                          "type": "string",
                          "enum": ["wallet", "pool", "lend", "borrow", "stake", "bridge", "aggregator"]
                        },
                        "venue": { "type": "string" },
                        "asset": { "type": "string" },
                        "tvl_usd": { "type": "number", "minimum": 0 }
                      }
                    }
                  },
                  "edges": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": ["from", "to", "action", "expected_slippage_bps", "gas_usd"],
                      "properties": {
                        "from": { "type": "string" },
                        "to": { "type": "string" },
                        "action": {
                          "type": "string",
                          "enum": ["swap", "deposit", "withdraw", "borrow", "repay", "stake", "unstake", "bridge", "harvest"]
                        },
                        "expected_slippage_bps": { "type": "number", "minimum": 0 },
                        "gas_usd": { "type": "number", "minimum": 0 }
                      }
                    }
                  },
                  "entry_node_id": { "type": "string" },
                  "exit_node_id": { "type": "string" }
                }
              },
              "warnings": {
                "type": "array",
                "items": {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["code", "severity", "message"],
                  "properties": {
                    "code": {
                      "type": "string",
                      "enum": [
                        "STALE_SHARD",
                        "LOW_TVL",
                        "HIGH_IL",
                        "ORACLE_DIVERGENCE",
                        "DEPEG_WATCH",
                        "RATE_DISCONTINUITY",
                        "UNAUDITED_VENUE",
                        "PATH_NON_UNIQUE"
                      ]
                    },
                    "severity": { "type": "string", "enum": ["info", "warn", "crit"] },
                    "message": { "type": "string", "maxLength": 280 }
                  }
                }
              },
              "provenance": {
                "type": "object",
                "additionalProperties": false,
                "required": ["index_etag", "shard_ids", "snapshot_ts", "engine_semver", "schema_semver"],
                "properties": {
                  "index_etag": { "type": "string" },
                  "shard_ids": {
                    "type": "array",
                    "minItems": 1,
                    "items": { "type": "string" }
                  },
                  "snapshot_ts": { "type": "string", "format": "date-time" },
                  "engine_semver": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
                  "schema_semver": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

**Execution semantics (normative).**

1. **Purity.** `dg_explain_path` is a pure function of `(ticket, index_etag, shards[])`. It MUST NOT read wall-clock time except via `snapshot_ts` already bound in the shard header. It MUST NOT write.
2. **Determinism.** Identical inputs produce byte-identical JSON (RFC 8785 JCS canonicalization on numeric fields rounded to 12 significant digits).
3. **Fail-closed.** If any referenced `shard_id` is missing, checksum-mismatched, or `snapshot_ts` older than `MAX_STALENESS = 900s`, the tool returns HTTP 409 with `warnings[0].code = "STALE_SHARD"` and no `irr_bridge`. Partial answers are forbidden.
4. **IRR solver contract.** Cashflows are constructed as `CF₀ = −notional`, `CF_{t_k} = harvest_k − fee_k` for k = 1..n−1, `CF_T = terminal_value − exit_gas`. Root finding uses Newton–Raphson with analytic derivative, falling back to Brent–Dekker on the bracket `[−0.999999, 50]`. Divergence after 64 iterations is a 422.
5. **Attribution identity.** `|sum_bps − 1e4 · (apy_after − cash_apy)| ≤ 0.5`. Unit tests pin this to 1e−9 relative on the golden fixtures in `packages/engine/test/fixtures/paths/*.json`.
6. **Authorization.** Tool is world-readable. Rate-limit: 30 req / 10s / IP at the edge; 5 req / 10s / session for authenticated agents.
7. **Telemetry (write-only, async).** On every 2xx, emit one D1 row to `explain_events` (see §5.3). Telemetry failure MUST NOT fail the request.

---

## 4.5 Tool 3 — `dg_simulate_ticket`

**Purpose.** Convert an explained path into a *ticket*: a fully costed, slippage-bounded, gas-aware, chain-specific simulation of entering (and, optionally, exiting) the position at the current shard snapshot. This tool is the last pure function before a human or agent would sign. It does **not** broadcast. It does **not** construct unsigned calldata that could be replayed against mainnet without an explicit, separate, out-of-band signing flow (which is **out of scope** for v1.0).

**Non-goals (explicit).**
- No transaction construction, no ABI encoding of `multicall`, no permit signatures, no MEV-share bundles.
- No cross-chain atomicity claims. Bridges are modeled as two sequential legs with an independent failure probability.
- No leverage recursion beyond a single borrow→deposit cycle (max LTV path length = 1). Nested looping is a v1.1 amendment.

### 4.5.1 Input schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://defi.garden/schemas/2026/dg_simulate_ticket.input.json",
  "title": "dg_simulate_ticket.input",
  "type": "object",
  "additionalProperties": false,
  "required": ["ticket_id", "path_id", "notional_usd", "horizon_days", "side", "execution"],
  "properties": {
    "ticket_id": {
      "type": "string",
      "format": "uuid",
      "description": "Client-generated UUIDv4. Idempotency key. Replays with the same ticket_id and byte-identical body MUST return the cached simulation (TTL 60s)."
    },
    "path_id": {
      "type": "string",
      "minLength": 16,
      "maxLength": 64,
      "pattern": "^path_[0-9a-f]{12,}$",
      "description": "MUST reference a path previously returned by dg_explain_path under the same index_etag. Cross-etag references are 409."
    },
    "index_etag": {
      "type": "string",
      "description": "If omitted, the engine binds the latest published etag. If supplied, MUST match the etag under which path_id was explained."
    },
    "notional_usd": {
      "type": "number",
      "exclusiveMinimum": 0,
      "maximum": 10000000,
      "description": "Gross USD notional at entry, pre-fee. Hard cap $10,000,000 to bound numerical range of the AMM invariant solver."
    },
    "horizon_days": {
      "type": "integer",
      "minimum": 1,
      "maximum": 3650,
      "description": "MUST equal the horizon used in dg_explain_path for this path_id, else 422 PATH_HORIZON_MISMATCH."
    },
    "side": {
      "type": "string",
      "enum": ["enter", "enter_and_exit", "exit"],
      "description": "enter = cost entry only; enter_and_exit = round-trip at horizon with terminal-value mark; exit = unwind an already-open position identified by position_ref."
    },
    "position_ref": {
      "type": "string",
      "description": "Required iff side = exit. Opaque handle from a prior enter simulation. NOT a chain txhash."
    },
    "execution": {
      "type": "object",
      "additionalProperties": false,
      "required": ["chain_id", "slippage_bps_limit", "priority_fee_gwei", "simulate_mev"],
      "properties": {
        "chain_id": {
          "type": "integer",
          "enum": [1, 10, 56, 137, 8453, 42161, 43114]
        },
        "from_asset": {
          "type": "string",
          "description": "ERC-20 symbol or canonical address. Default USDC on the target chain."
        },
        "slippage_bps_limit": {
          "type": "number",
          "minimum": 0,
          "maximum": 500,
          "description": "Hard ceiling. If the AMM solver predicts slippage > limit, the ticket is rejected with 422 SLIPPAGE_LIMIT."
        },
        "priority_fee_gwei": {
          "type": "number",
          "minimum": 0,
          "maximum": 1000
        },
        "gas_price_oracle": {
          "type": "string",
          "enum": ["shard", "override"],
          "default": "shard"
        },
        "gas_price_gwei_override": {
          "type": "number",
          "minimum": 0
        },
        "simulate_mev": {
          "type": "boolean",
          "description": "If true, apply the sandwich-loss estimator of §4.5.3.4. Default false for notional < $50k."
        },
        "dex_route_pref": {
          "type": "string",
          "enum": ["best_price", "fewest_hops", "deepest_liquidity"],
          "default": "best_price"
        }
      }
    },
    "constraints": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "max_gas_usd": { "type": "number", "minimum": 0 },
        "min_net_apy": { "type": "number" },
        "max_cvar_95": { "type": "number" },
        "forbid_unverified": { "type": "boolean", "default": true },
        "whitelist_venues": {
          "type": "array",
          "items": { "type": "string" }
        },
        "blacklist_venues": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```

### 4.5.2 Output schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://defi.garden/schemas/2026/dg_simulate_ticket.output.json",
  "title": "dg_simulate_ticket.output",
  "type": "object",
  "additionalProperties": false,
  "required": ["ok", "ticket_id", "path_id", "status", "economics", "execution_plan", "risk", "irr_bridge", "constraints_eval", "provenance"],
  "properties": {
    "ok": { "type": "boolean" },
    "ticket_id": { "type": "string", "format": "uuid" },
    "path_id": { "type": "string" },
    "status": {
      "type": "string",
      "enum": ["SIMULATED", "REJECTED", "STALE"],
      "description": "SIMULATED = all solvers converged and constraints held. REJECTED = a hard constraint fired (see constraints_eval). STALE = shard/etag mismatch; caller MUST re-explain."
    },
    "reject_reason": {
      "type": "string",
      "enum": [
        "SLIPPAGE_LIMIT",
        "MAX_GAS_USD",
        "MIN_NET_APY",
        "MAX_CVAR_95",
        "UNVERIFIED_VENUE",
        "VENUE_BLACKLIST",
        "PATH_HORIZON_MISMATCH",
        "ETAG_MISMATCH",
        "INSUFFICIENT_LIQUIDITY",
        "SOLVER_DIVERGENCE",
        "SIDE_POSITION_REF_REQUIRED"
      ]
    },
    "economics": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "notional_usd",
        "entry_gross_usd",
        "entry_fee_usd",
        "entry_slippage_usd",
        "entry_gas_usd",
        "entry_net_usd",
        "exit_gross_usd",
        "exit_fee_usd",
        "exit_slippage_usd",
        "exit_gas_usd",
        "exit_net_usd",
        "harvests_usd",
        "il_usd",
        "pnl_usd",
        "net_apy",
        "breakeven_days"
      ],
      "properties": {
        "notional_usd": { "type": "number" },
        "entry_gross_usd": { "type": "number" },
        "entry_fee_usd": { "type": "number", "minimum": 0 },
        "entry_slippage_usd": { "type": "number", "minimum": 0 },
        "entry_gas_usd": { "type": "number", "minimum": 0 },
        "entry_net_usd": {
          "type": "number",
          "description": "notional − entry_fee − entry_slippage − entry_gas. Identity MUST hold to 1e-8 relative."
        },
        "exit_gross_usd": { "type": "number" },
        "exit_fee_usd": { "type": "number", "minimum": 0 },
        "exit_slippage_usd": { "type": "number", "minimum": 0 },
        "exit_gas_usd": { "type": "number", "minimum": 0 },
        "exit_net_usd": { "type": "number" },
        "harvests_usd": {
          "type": "number",
          "description": "Σ mid-horizon harvests, already net of harvest gas, marked at shard spot."
        },
        "il_usd": {
          "type": "number",
          "description": "Impermanent loss vs. HODL the entry asset mix, USD. 0 for single-asset lending/staking."
        },
        "pnl_usd": {
          "type": "number",
          "description": "exit_net + harvests − notional. For side=enter, exit_* are marks-to-model at horizon, not realized."
        },
        "net_apy": {
          "type": "number",
          "description": "(1 + pnl_usd/notional_usd)^(365/horizon_days) − 1. MUST equal irr_bridge.apy_after to 1e-10."
        },
        "breakeven_days": {
          "type": "number",
          "minimum": 0,
          "description": "Smallest t such that cumulative harvests(t) ≥ entry_fee + entry_slippage + entry_gas + E[exit_gas]. ∞ encoded as 1e9."
        }
      }
    },
    "execution_plan": {
      "type": "object",
      "additionalProperties": false,
      "required": ["legs", "total_gas_usd", "worst_case_slippage_bps", "route_hash"],
      "properties": {
        "legs": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["seq", "action", "venue", "chain_id", "token_in", "token_out", "amount_in", "amount_out_min", "gas_usd", "slippage_bps_est"],
            "properties": {
              "seq": { "type": "integer", "minimum": 0 },
              "action": {
                "type": "string",
                "enum": ["swap", "deposit", "withdraw", "borrow", "repay", "stake", "unstake", "bridge", "harvest"]
              },
              "venue": { "type": "string" },
              "chain_id": { "type": "integer" },
              "pool_id": { "type": "string" },
              "token_in": { "type": "string" },
              "token_out": { "type": "string" },
              "amount_in": {
                "type": "string",
                "description": "Integer base units as a decimal string. NEVER a float."
              },
              "amount_out_min": { "type": "string" },
              "gas_usd": { "type": "number", "minimum": 0 },
              "slippage_bps_est": { "type": "number", "minimum": 0 },
              "amm_invariant": {
                "type": "string",
                "enum": ["cpmm_xy", "stable_ng", "clmm_v3", "weighted_v2", "gyro_e", "none"]
              }
            }
          }
        },
        "total_gas_usd": { "type": "number", "minimum": 0 },
        "worst_case_slippage_bps": { "type": "number", "minimum": 0 },
        "route_hash": {
          "type": "string",
          "pattern": "^0x[0-9a-f]{64}$",
          "description": "keccak256 of the canonicalized legs array. Stability key for idempotent caching."
        }
      }
    },
    "risk": {
      "type": "object",
      "additionalProperties": false,
      "required": ["var_95", "cvar_95", "liquidation_prob", "mev_loss_p50_usd", "mev_loss_p95_usd", "composite_risk_grade"],
      "properties": {
        "var_95": { "type": "number" },
        "cvar_95": { "type": "number" },
        "liquidation_prob": { "type": "number", "minimum": 0, "maximum": 1 },
        "mev_loss_p50_usd": { "type": "number", "minimum": 0 },
        "mev_loss_p95_usd": { "type": "number", "minimum": 0 },
        "composite_risk_grade": {
          "type": "string",
          "enum": ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "D"]
        }
      }
    },
    "irr_bridge": {
      "type": "object",
      "additionalProperties": false,
      "required": ["apy_before", "apy_after", "horizon_days", "irr_nominal", "irr_real", "identity_check"],
      "description": "MUST be a strict refinement of dg_explain_path.irr_bridge: apy_after here includes realized entry/exit costs from the AMM solver, whereas explain_path uses mid-shard marks. Invariant: simulate.apy_after ≤ explain.apy_after + 1e-8 (costs are weakly positive).",
      "properties": {
        "apy_before": { "type": "number" },
        "apy_after": { "type": "number" },
        "horizon_days": { "type": "integer", "minimum": 1 },
        "irr_nominal": { "type": "number" },
        "irr_real": { "type": "number" },
        "identity_check": {
          "type": "object",
          "additionalProperties": false,
          "required": ["holds", "residual", "method"],
          "properties": {
            "holds": { "type": "boolean" },
            "residual": { "type": "number" },
            "method": {
              "type": "string",
              "enum": ["newton_raphson", "brent_dekker", "closed_form_continuous"]
            }
          }
        }
      }
    },
    "constraints_eval": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "passed", "observed", "limit"],
        "properties": {
          "name": { "type": "string" },
          "passed": { "type": "boolean" },
          "observed": { "type": "number" },
          "limit": { "type": "number" }
        }
      }
    },
    "warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["code", "severity", "message"],
        "properties": {
          "code": { "type": "string" },
          "severity": { "type": "string", "enum": ["info", "warn", "crit"] },
          "message": { "type": "string", "maxLength": 280 }
        }
      }
    },
    "provenance": {
      "type": "object",
      "additionalProperties": false,
      "required": ["index_etag", "shard_ids", "snapshot_ts", "engine_semver", "schema_semver", "cache"],
      "properties": {
        "index_etag": { "type": "string" },
        "shard_ids": { "type": "array", "items": { "type": "string" } },
        "snapshot_ts": { "type": "string", "format": "date-time" },
        "engine_semver": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
        "schema_semver": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
        "cache": {
          "type": "string",
          "enum": ["HIT", "MISS", "BYPASS"]
        }
      }
    }
  }
}
```

### 4.5.3 Execution semantics (normative)

**4.5.3.1 Pipeline.**  
`simulate(ticket) := constraints ∘ irr ∘ risk ∘ amm_solve ∘ route ∘ bind(path, shards)`. Each stage is a total function returning `Result<T, Reject>`. The first `Reject` short-circuits with `status = REJECTED` and a populated `constraints_eval`.

**4.5.3.2 Routing.**  
On-chain venues are selected from the shard’s `pools[]` whose `(chain_id, token_in, token_out)` cover each hop. `dex_route_pref = best_price` runs a Dijkstra over hops with edge weight `−log(amount_out/amount_in)` plus a gas penalty `λ · gas_usd / notional_usd`, `λ = 1` frozen. Hop cap = 4. Cycles are forbidden.

**4.5.3.3 AMM solvers (closed form or ≤16 Newton steps).**

| Invariant | State vars (from shard) | Out-given-in |
|---|---|---|
| `cpmm_xy` | `x, y, fee_bps` | `Δy = y · Δx·(1−f) / (x + Δx·(1−f))` |
| `stable_ng` | `xp[], amp, fee_bps, D` | Newton on StableSwap invariant, 16 steps, residual `≤ 1e-12 · D` |
| `clmm_v3` | `sqrtP, L, ticks[]` | Tick-walk until `Δx` exhausted; uncomputed ticks ⇒ `INSUFFICIENT_LIQUIDITY` |
| `weighted_v2` | `b[], w[], fee_bps` | Balancer weighted-math closed form |
| `gyro_e` | `p_x, α, β, L` | Gyroscope E-CLP; out of range ⇒ reject |
| `none` | — | 1:1, fee-only (lending deposit/withdraw) |

All amounts in/out are **integer base units** (`string` in JSON). Intermediate floats use IEEE-754 binary64 with a final round-to-nearest-even into the token’s decimals. Golden tests compare against `packages/engine/test/fixtures/amm/*.json` with a 1-wei tolerance on 18-decimal tokens and 0 on ≤8-decimal tokens.

**4.5.3.4 MEV estimator (only if `simulate_mev = true`).**  
Sandwich loss on a CPMM hop:  
`L = notional · s · (1 − 1/(1 + q))` where `s` is the attacker’s optimal swap fraction  
`s* = √(x / (x + Δx)) − 1 + f̂` clamped to `[0, 1)`, and `q` is the pool’s 1-block realized-volatility proxy from the shard (`rv_1b`).  
`mev_loss_p50_usd = 0.5 · L`, `mev_loss_p95_usd = 1.65 · L` (half-normal).  
Non-CPMM hops: `L = 0` in v1.0 (conservative underfit; documented).

**4.5.3.5 Gas.**  
`gas_usd = gas_units(action, venue) · (base_fee_gwei + priority_fee_gwei) · 1e−9 · eth_usd`.  
`gas_units` is a frozen table in `packages/engine/src/gas/table.ts` (P50 of 90d, refreshed by the cron, never live-RPC’d on the request path). If `gas_price_oracle = override`, use the client value. If `total_gas_usd > constraints.max_gas_usd`, reject.

**4.5.3.6 Identities that MUST hold on every 200.**

```
entry_net_usd  = notional_usd − entry_fee_usd − entry_slippage_usd − entry_gas_usd
pnl_usd        = exit_net_usd + harvests_usd − notional_usd          // side ∈ {enter, enter_and_exit}
|net_apy − irr_bridge.apy_after| ≤ 1e-10
simulate.apy_after ≤ explain.apy_after + 1e-8
|NPV(irr_nominal)| ≤ 1e-12 · notional_usd
```

Violation is an engine bug, not a client error: return 500 `IDENTITY_BROKEN` and page.

**4.5.3.7 Idempotency & cache.**  
Key = `sha256(ticket_id || canonical_json(body) || index_etag)`. TTL 60s in the edge cache (CDN) plus a 60s D1 row in `simulate_cache`. `cache = HIT` on replay. Different `priority_fee_gwei` ⇒ different key.

**4.5.3.8 Authorization & abuse.**  
World-readable. Rate-limit: 10 req / 10s / IP; 3 req / 10s / session. Notional > $1,000,000 requires an authenticated session (API key). Body > 16 KiB is 413.



## 5. Data Pipeline & Static Sharding Architecture

### 5.0 Architectural Invariant (Non-Negotiable)

**INV-DP-0 — Zero backend on the read path.**

The user-facing application **MUST NOT** execute any of the following on a page load, route transition, or interaction that is not an explicit write-side telemetry event:

1. Serverless function invocation whose result is required to render capital-allocation UI.
2. Live RPC / subgraph / REST call whose latency is on the critical path of first contentful paint or interaction-to-decision.
3. Database round-trip (D1, Postgres, Redis) whose payload is required to compute `S_path`, `L_eff`, `CVaR_α`, `G_liq`, or gate `G1`–`G4`.
4. Dynamic origin that can 5xx, cold-start, or rate-limit a retail user at the moment of allocation.

**Serving topology (canonical):**

```
Browser  →  Vercel Edge CDN (immutable JSON + hashed assets)
         →  /data/index.json            (< 200 KB, gzip ≤ 45 KB)
         →  /data/pools/{poolId}.json   (detail shard)
         →  /data/paths/{pathId}.json   (composition + forecast shard)
         →  /data/gauges/{ts}.json      (liquidity-gauge time slice)
```

All of the above are **precomputed, content-addressed, cache-control: `public, max-age=3600, stale-while-revalidate=86400`, immutable by hash**. The origin of truth for *serving* is the Git-committed (or CI-published) static object store. The origin of truth for *writes* is Cloudflare D1 (telemetry only) plus on-chain state (read by CI, never by the browser on the critical path).

**Failure mode if INV-DP-0 is violated:** the product ceases to be a decision terminal and becomes a dashboard with an availability SLA. That is a **P0 architectural defect**, not a performance regression.

---

### 5.1 Dual-Plane Data Model: Write-Side Telemetry ≠ Serving Shards

Two planes. Mixing them is a schema crime.

| Plane | Store | Mutability | Reader | Writer | SLA |
|---|---|---|---|---|---|
| **Serving plane (S)** | Static JSON on Vercel CDN / GitHub Pages fallback | Immutable per publish SHA | Browser, MCP tools (read) | GitHub Actions only | 99.99% (CDN) |
| **Telemetry plane (T)** | Cloudflare D1 | Append-only + hourly snapshot | Internal jobs, GTM analytics, fraud/abuse | Edge middleware (non-blocking `waitUntil`) | Best-effort; **never** blocks UI |

**Hard rule:** No SELECT from D1 may appear in any Next.js Server Component, Route Handler, or client fetch that is required to paint the Hero Decision Terminal. Telemetry writes are fire-and-forget. If D1 is down, the product still prices, ranks, and gates.

#### 5.1.1 Cloudflare D1 — Write-Side Telemetry Schema (Plane T)

Database: `defi_garden_telemetry` (production), `defi_garden_telemetry_stg` (staging).

```sql
-- DG-PRD-2026-PIVOT-v1.0 §5.1.1
-- Character set: UTF-8. Timestamps: INTEGER unix seconds UTC.
-- PII policy: no wallet addresses in cleartext after hash; no IP storage beyond /24 truncation.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  event_id        TEXT PRIMARY KEY,          -- ulid
  ts              INTEGER NOT NULL,          -- unix s
  session_id      TEXT NOT NULL,             -- ulid, rotated 24h
  event_type      TEXT NOT NULL,             -- enum: impression|hover|simulate|gate_block|cta_click|export
  path_id         TEXT,                      -- nullable; serving-plane pathId
  pool_id         TEXT,                      -- nullable
  chain_id        INTEGER,                   -- 1|42161|10|8453|...
  payload_json    TEXT NOT NULL,             -- compact JSON, ≤ 4 KiB
  schema_ver      INTEGER NOT NULL DEFAULT 1,
  CHECK (length(payload_json) <= 4096),
  CHECK (event_type IN (
    'impression','hover','simulate','gate_block','cta_click','export','mcp_invoke'
  ))
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(event_type, ts);
CREATE INDEX IF NOT EXISTS idx_events_path_ts ON events(path_id, ts);

CREATE TABLE IF NOT EXISTS simulations (
  sim_id          TEXT PRIMARY KEY,          -- ulid
  ts              INTEGER NOT NULL,
  session_id      TEXT NOT NULL,
  path_id         TEXT NOT NULL,
  notional_usd    REAL NOT NULL,             -- > 0
  horizon_days    INTEGER NOT NULL,          -- ∈ {7,30,90}
  s_path          REAL NOT NULL,
  l_eff           REAL NOT NULL,
  cvar_alpha      REAL NOT NULL,             -- α = 0.95
  g_liq           REAL NOT NULL,
  gates_json      TEXT NOT NULL,             -- {G1,G2,G3,G4} ∈ {0,1}
  timesfm_mu      REAL,
  timesfm_sigma   REAL,
  client_hash     TEXT NOT NULL,             -- sha256 of input vector, 16 hex prefix
  CHECK (notional_usd > 0),
  CHECK (horizon_days IN (7, 30, 90)),
  CHECK (s_path >= 0 AND s_path <= 1)
);

CREATE INDEX IF NOT EXISTS idx_sim_ts ON simulations(ts);
CREATE INDEX IF NOT EXISTS idx_sim_path ON simulations(path_id, ts);

CREATE TABLE IF NOT EXISTS snapshots_meta (
  snapshot_id     TEXT PRIMARY KEY,          -- 'YYYYMMDDTHH' (UTC hour)
  ts              INTEGER NOT NULL,
  git_sha         TEXT NOT NULL,
  index_etag      TEXT NOT NULL,             -- md5 of index.json
  n_pools         INTEGER NOT NULL,
  n_paths         INTEGER NOT NULL,
  timesfm_run_id  TEXT,                      -- nullable if hourly snapshot w/o forecast refresh
  rpc_block_map   TEXT NOT NULL              -- JSON {chainId: blockNumber}
);

-- Retention: events 90d, simulations 180d, snapshots_meta 400d.
-- Enforced by nightly job: jobs/telemetry_gc.sql
```

**Write path (non-blocking):**

```
Client action
  → Edge middleware (Vercel) captures event
  → context.waitUntil( fetch(D1_HTTP_API) )
  → response to client is NEVER awaited on D1
```

**Forbidden:** Prisma, Drizzle, or any ORM in the Next.js app router for Plane T. Use a 40-line `lib/telemetry/emit.ts` with `fetch` + abort controller 150 ms. Drop on timeout. Count drops in `snapshots_meta` via a separate CI health check, not in the UI.

#### 5.1.2 Serving Shards (Plane S) — Contract

Serving objects are **pure functions of on-chain state + TimesFM posterior + protocol metadata** at a discrete publish instant `τ`.

```
shard(τ) = F( multicall(τ), timesfm(τ_nightly), metadata_registry )
```

No user session may influence shard contents. Personalization is a client-side fold over `index.json` (risk preference, notional, chain filter).

---

### 5.2 Shard Topology: `index.json` vs Detail JSON

#### 5.2.1 Lightweight Index — `/data/index.json`

**Hard budget:** uncompressed `< 200 KB`. gzip target `≤ 45 KB`. If the budget is exceeded, **drop fields, do not gzip-cheat by raising the cap**.

JSON Schema (normative excerpt):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://defi.garden/schemas/index.v1.json",
  "type": "object",
  "required": ["schema_ver", "published_at", "git_sha", "as_of_block", "pools", "paths", "gauge"],
  "properties": {
    "schema_ver": { "const": 1 },
    "published_at": { "type": "integer" },
    "git_sha": { "type": "string", "minLength": 40, "maxLength": 40 },
    "as_of_block": {
      "type": "object",
      "additionalProperties": { "type": "integer", "minimum": 1 }
    },
    "timesfm": {
      "type": "object",
      "required": ["run_id", "model", "trained_cutoff"],
      "properties": {
        "run_id": { "type": "string" },
        "model": { "const": "timesfm-3.0" },
        "trained_cutoff": { "type": "integer" }
      }
    },
    "pools": {
      "type": "array",
      "maxItems": 400,
      "items": {
        "type": "object",
        "required": ["id", "chain", "protocol", "tvl_usd", "fee_apr", "l_eff", "g_liq", "shard"],
        "properties": {
          "id": { "type": "string" },
          "chain": { "type": "integer" },
          "protocol": { "type": "string" },
          "tvl_usd": { "type": "number", "minimum": 0 },
          "fee_apr": { "type": "number" },
          "l_eff": { "type": "number", "minimum": 0, "maximum": 1 },
          "g_liq": { "type": "number", "minimum": 0, "maximum": 1 },
          "shard": { "type": "string", "pattern": "^pools/[a-z0-9._-]+\\.json$" }
        },
        "additionalProperties": false
      }
    },
    "paths": {
      "type": "array",
      "maxItems": 120,
      "items": {
        "type": "object",
        "required": ["id", "s_path", "cvar_95", "g1", "g2", "g3", "g4", "shard"],
        "properties": {
          "id": { "type": "string" },
          "s_path": { "type": "number", "minimum": 0, "maximum": 1 },
          "cvar_95": { "type": "number" },
          "g1": { "type": "integer", "enum": [0, 1] },
          "g2": { "type": "integer", "enum": [0, 1] },
          "g3": { "type": "integer", "enum": [0, 1] },
          "g4": { "type": "integer", "enum": [0, 1] },
          "n_pools": { "type": "integer", "minimum": 1 },
          "shard": { "type": "string", "pattern": "^paths/[a-z0-9._-]+\\.json$" }
        },
        "additionalProperties": false
      }
    },
    "gauge": {
      "type": "object",
      "required": ["g_sys", "stress_bps", "shard"],
      "properties": {
        "g_sys": { "type": "number", "minimum": 0, "maximum": 1 },
        "stress_bps": { "type": "integer" },
        "shard": { "type": "string" }
      }
    }
  },
  "additionalProperties": false
}
```

**Index field discipline:**

- Numeric values: 6 significant figures max (`l_eff`, `s_path`, `g_liq`); USD TVL rounded to integer; APR in decimal (0.1423 = 14.23%).
- **No** token logos, **no** descriptions, **no** historical series in the index.
- Sort keys: `paths` pre-sorted by `s_path` DESC so the Hero Terminal can render top-N with zero client sort cost on first paint.
- `pools[].id` format: `{chainId}_{protocol}_{addr8}` e.g. `42161_uniswapv3_c31e`.

**Enforcement:** `scripts/assert_index_budget.mjs` fails CI if `Buffer.byteLength(JSON.stringify(index), 'utf8') > 200 * 1024`.

#### 5.2.2 Per-Pool Detail — `/data/pools/{poolId}.json`

Contains everything the index refuses to carry:

- Full token tuple `(token0, token1, fee, tickSpacing, hooks?)`
- 30d fee / TVL / volume vectors (hourly, 720 points) as **delta-encoded int32** (not float64 arrays)
- Tick liquidity histogram (compact)
- Oracle provenance (`source`, `heartbeat_s`, `max_deviation_bps`)
- `L_eff` decomposition: `{depth_term, spread_term, impact_term, utilization_term}`
- Multicall raw slot hashes for audit (`calls[] → {target, selector, block, result_hash}`)

Budget: `< 80 KB` uncompressed per pool. Pools exceeding budget are downsampled (hourly → 2-hourly for the tail beyond 14d).

#### 5.2.3 Per-Path Detail — `/data/paths/{pathId}.json`

- Ordered pool legs, weights `w_i` with `∑ w_i = 1 ± 1e-9`
- Covariance input used for `CVaR_0.95` (upper triangle, packed)
- TimesFM posterior: `{mu[H], sigma[H], q05[H], q50[H], q95[H]}` for `H ∈ {7,30,90}` days
- Gate evidence: the exact predicate values that produced `G1..G4 ∈ {0,1}` (so a coding agent can re-verify without re-fetching chain)
- Simulation defaults: notional grid, slippage model id, gas model id

Budget: `< 120 KB` uncompressed per path.

#### 5.2.4 Liquidity Gauge Slice — `/data/gauges/{YYYYMMDDTHH}.json`

System-wide `G_liq` surface plus the 1h delta. The Hero Terminal reads **only the latest** pointer from `index.gauge.shard`. Historical slices exist for MCP replay, not for first paint.

---

### 5.3 Compute Cadence: Nightly TimesFM 3.0 + Hourly Snapshot + Multicalls

Three clocks. Do not collapse them.

```
        00:00 UTC                         every hour
           │                                   │
           ▼                                   ▼
   ┌───────────────┐                   ┌───────────────┐
   │  TIMESFM 3.0  │                   │ HOURLY SNAP   │
   │  nightly job  │                   │ + EVM multi   │
   │  GHA: 16-core │                   │ GHA: 4-core   │
   │  ~35–50 min   │                   │ ~4–8 min      │
   └──────┬────────┘                   └──────┬────────┘
          │ forecasts                         │ chain state
          │ μ,σ,q                             │ TVL, ticks, oracles
          └────────────┬──────────────────────┘
                       ▼
              compose_shards.ts
                       │
                       ▼
              /data/**  (git commit or R2→Vercel)
                       │
                       ▼
              Vercel CDN invalidate by hash
```

#### 5.3.1 Nightly GitHub Actions — TimesFM 3.0

**Workflow:** `.github/workflows/timesfm-nightly.yml`

| Parameter | Value |
|---|---|
| Schedule | `0 0 * * *` (00:00 UTC) + `workflow_dispatch` |
| Runner | `ubuntu-latest-16-cores` (or self-hosted GPU if posterior batch > 2k series) |
| Model | Google TimesFM 3.0 (pinned digest in `ml/timesfm.lock`) |
| Input | 90–180d hourly log-return & fee-APR series per pool, parquet in `data/raw/` |
| Output | `ml/artifacts/{date}/posterior.parquet` + `run_id` |
| Horizon | 7 / 30 / 90 day, quantile set `{0.05, 0.50, 0.95}` + Gaussian `(μ, σ)` head |
| Failure | If job fails, **do not** publish a new index. Keep previous `timesfm.run_id`. Set `index.timesfm.stale = true` only on the *next successful hourly* if age > 36h → **G3 closes** (forecast-staleness gate). |

**Numeric contract:**

- All series aligned to UTC hour, missing hours forward-filled at most 3 steps then masked.
- Winsorize log-returns at 0.1% / 99.9% before forecast.
- Reject a posterior if `σ_7d / |μ_7d| > 25` (numerical blow-up) → path excluded from index, logged in `ml/artifacts/{date}/rejects.json`.

#### 5.3.2 Hourly D1 Snapshot + Serving Republish

**Workflow:** `.github/workflows/hourly-snapshot.yml`

1. `cast` / `viem` multicall per chain (see §5.3.3).
2. Recompute `L_eff`, `G_liq`, fee APR trailing windows.
3. Fold **last successful** TimesFM posterior (do not re-run the model hourly).
4. Recompute `S_path`, `CVaR_0.95`, gates `G1`–`G4`.
5. Write shards to `public/data/**`.
6. `scripts/assert_index_budget.mjs && scripts/assert_schema.mjs`.
7. Commit to `data-plane` branch **or** upload to R2 and point Vercel to the new prefix. Prefer **hash-named objects** + `index.json` as the sole mutable pointer.
8. Insert `snapshots_meta` row into D1 (this is a write to Plane T, from CI, not from users).
9. Purge only `index.json` at CDN; detail shards are immutable by filename+hash.

**Hourly job budget:** wall clock `< 10 min`. If multicalls exceed 8 min, reduce pool universe by `TVL_usd` rank, never by random sample. Universe construction is deterministic: `top 400 by TVL` subject to protocol allowlist.

#### 5.3.3 On-Chain EVM Multicalls

**Module:** `pipeline/multicall/evm.ts`

- Transport: static RPC list in `pipeline/rpc.json` (3 endpoints per chain, ranked, no public-rate-limit-only endpoints in rank 1).
- Batching: `Multicall3` (`0xcA11bde05977b3631167028862bE2a173976CA11`) where deployed; else chunked `eth_call`.
- Block: **finalized** on Ethereum, **latest-safe** analogue on L2s (Optimism/Base: `safe`; Arbitrum: `latest` minus 10 blocks, documented exception).
- Selectors (minimum set):
  - Uniswap V3 / Algebra / Pancake V3: `slot0`, `liquidity`, `feeGrowthGlobal0X128`, `feeGrowthGlobal1X128`, `ticks` (sampled), ERC20 `balanceOf` for both sides of the vault/pool.
  - Aave v3: `getReserveData`, `getUserAccountData` **not** used on read path; only reserve-level.
  - Chainlink / Pyth: latest round / price update with heartbeat check.
- Replay: every result stored as `{block, result_hash: keccak256(raw)}` in the pool shard for third-party audit.
- Reorg policy: if `safe` block hash ≠ previous hourly parent, recompute affected chains only; bump `as_of_block`.

**Gas/RPC cost cap:** `$N` per day, encoded as `MAX_RPC_CU` in repo secrets. Exceeding the cap **sheds** the lowest-TVL decile for that hour and sets `index.coverage = "partial"`. Partial coverage **closes G4** for any path that includes a shed pool.

---

### 5.4 Cache, Integrity, and Rollback

| Control | Spec |
|---|---|
| Integrity | `index.json` includes `git_sha`. Client logs `sha` on every session start (telemetry, non-blocking). |
| Rollback | Previous 48 hourly indexes retained at `/data/history/{snapshot_id}/`. Revert = change pointer. |
| Stale-while-revalidate | 1h max-age, 24h SWR. After 36h without new index, client renders **read-only** with banner; CTAs disabled (G3 equivalent on the client). |
| Poison shard | If schema assert fails post-upload, CDN pointer is **not** updated. Alert: GitHub Actions failure + Pager-equivalent (issue with label `data-plane-p0`). |

---

### 5.5 What This Architecture Explicitly Refuses

- No GraphQL gateway.
- No websocket mark prices.
- No “live APY” scraped from a competitor’s undocumented API.
- No client-side RPC “just for the connected chain.”
- No mixing D1 rows into `S_path`. Telemetry may *measure* funnel; it may not *price* risk.

---

## 6. Actionable Step-by-Step Implementation Roadmap for Coding Agents

This section is the **only** implementation schedule that is authorized. Coding agents **MUST** execute phases sequentially. Opening a P2 file during P0 is a process violation. Each phase has frozen inputs, exact paths, exact commands, and a binary DoD.

**Repo layout assumed (create if absent):**

```
/
  app/                          # Next.js App Router (UI)
  components/
  lib/
    math/                       # pure TS, no I/O
    telemetry/
    data/                       # typed loaders for static shards
  pipeline/
    multicall/
    timesfm/
    compose/
  public/data/                  # serving plane output
  scripts/
  ml/
  tests/
    math/
    pipeline/
    e2e/
  .github/workflows/
```

---

### 6.1 Phase P0 — Core Mathematical Shards & Gates

**Objective:** A deterministic, I/O-free mathematical kernel plus a shard composer that can emit a valid `index.json` from fixtures. No UI. No MCP. No telemetry.

**Target files (create / own):**

| Path | Role |
|---|---|
| `lib/math/types.ts` | `PoolId`, `PathId`, `Gates`, `Posterior`, branded numbers |
| `lib/math/l_eff.ts` | `L_eff` decomposition, domain `[0,1]` |
| `lib/math/g_liq.ts` | pool + system liquidity gauges |
| `lib/math/cvar.ts` | historical + posterior-mixed `CVaR_α`, `α=0.95` |
| `lib/math/s_path.ts` | `S_path` score, weights frozen in this file as named constants |
| `lib/math/gates.ts` | `G1..G4` predicates, pure |
| `lib/math/index.ts` | barrel, no re-export of non-math |
| `pipeline/compose/compose_shards.ts` | fixtures → `public/data/**` |
| `pipeline/compose/schema.ts` | Ajv schemas matching §5.2 |
| `scripts/assert_index_budget.mjs` | 200 KB hard fail |
| `scripts/assert_schema.mjs` | schema hard fail |
| `tests/math/l_eff.test.ts` | |
| `tests/math/cvar.test.ts` | |
| `tests/math/s_path.test.ts` | |
| `tests/math/gates.test.ts` | |
| `tests/pipeline/compose_shards.test.ts` | |
| `fixtures/pools/*.json` | golden inputs |
| `fixtures/timesfm/posterior.parquet` or `.json` | golden posterior (JSON allowed in P0) |

**Exact commands:**

```bash
# 0. toolchain pin
node -v    # must be 20.x LTS
pnpm -v    # must be 9.x

# 1. unit kernel
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec vitest run tests/math --coverage --coverage.thresholds.lines=95

# 2. property tests (fast-check) on gates and CVaR
pnpm exec vitest run tests/math/gates.test.ts tests/math/cvar.test.ts

# 3. compose from fixtures (no RPC)
pnpm exec tsx pipeline/compose/compose_shards.ts --src fixtures --out public/data

# 4. budgets
node scripts/assert_schema.mjs public/data/index.json
node scripts/assert_index_budget.mjs public/data/index.json

# 5. golden diff
pnpm exec vitest run tests/pipeline/compose_shards.test.ts
```

**Acceptance Criteria (all must hold):**

1. `lib/math/**` has **zero** imports from `fs`, `viem`, `next`, `drizzle`, or `fetch`. Enforced by `eslint-plugin-import` no-restricted-imports.
2. For golden fixture `path_alpha`, `S_path` matches `fixtures/golden/s_path.json` within `1e-9` abs.
3. `CVaR_0.95` is translation-equivariant and positive-homogeneous to `1e-8` (property test, 200 cases).
4. Gates are binary and monotonic: worsening a single predicate input cannot open a previously closed gate.
5. `public/data/index.json` `< 200 KB`, schema-valid, `additionalProperties: false`.
6. Composer is deterministic: two runs on the same fixtures produce byte-identical JSON (stable key order via `JSON.stringify` replacer that sorts keys).

**Definition of Done (P0):**

- [ ] All commands above exit 0 on CI.
- [ ] Coverage on `lib/math/**` ≥ 95% lines, 100% on `gates.ts`.
- [ ] CODEOWNERS: `lib/math/**` requires one of `{@quant, @principal-architect}`.
- [ ] Changelog entry: `P0 math kernel frozen`.
- [ ] Tag: `p0-math-freeze`.

**P0 freeze:** After tag, coefficients in `s_path.ts` and gate thresholds in `gates.ts` change **only** via a numbered RFC in `/rfcs/`. Coding agents may not “tune” them to make UI look better.

---

### 6.2 Phase P1 — Hero Decision Terminal UI & Liquidity Gauge

**Objective:** Static-exportable UI that reads **only** `/data/index.json` + lazy detail shards. Renders ranking, gates, gauge. No wallet. No simulation engine beyond displaying precomputed posteriors.

**Depends on:** `p0-math-freeze`.

**Target files:**

| Path | Role |
|---|---|
| `app/page.tsx` | Hero Decision Terminal (single viewport primary) |
| `app/layout.tsx` | fonts, no live beacons |
| `components/terminal/PathTable.tsx` | ranked paths, gate chips |
| `components/terminal/GateStrip.tsx` | G1–G4 binary indicators |
| `components/terminal/ScoreBar.tsx` | `S_path` |
| `components/gauge/LiquidityGauge.tsx` | `G_liq` / `g_sys` |
| `components/terminal/PoolPeek.tsx` | lazy-loads `pools/{id}.json` on intent (hover ≥ 80 ms or click) |
| `lib/data/loadIndex.ts` | `fetch('/data/index.json')` typed parse |
| `lib/data/loadShard.ts` | cache: Map + HTTP cache headers respected |
| `app/globals.css` | design tokens only |
| `tests/e2e/hero.spec.ts` | Playwright |
| `tests/e2e/no-backend.spec.ts` | network interceptor |

**Exact commands:**

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run tests/math tests/pipeline
pnpm build
# next.config: output must remain compatible with static data in /public/data

# e2e against production build
pnpm exec playwright test tests/e2e/hero.spec.ts tests/e2e/no-backend.spec.ts --reporter=line

# Lighthouse CI on built artifact
pnpm exec lhci autorun --config=lighthouserc.json
```

**Acceptance Criteria:**

1. **INV-DP-0 test:** Playwright route interceptor fails the test on any request whose URL is not (a) same-origin static asset, (b) `/data/*.json`, (c) Vercel analytics if and only if it is non-blocking and not required for paint. Explicitly forbidden: `*.supabase.co`, `api.`, `wss:`, Infura/Alchemy/QuickNode hosts.
2. First paint of top-12 paths uses **only** `index.json`. No pool shard fetch until user intent.
3. Gate chips are derived from index booleans, not recomputed with a different copy of the formula. UI imports `gates.ts` **only** if it uses the same package; preferred: display precomputed bits.
4. Liquidity Gauge reflects `index.gauge.g_sys` and color-thresholds documented in `components/gauge/thresholds.ts` (read-only mapping, no new math).
5. Lighthouse: Performance ≥ 95, LCP `< 1.8s` on simulated cable, TBT `< 150ms`, CLS `< 0.05`.
6. `index.json` > 36h stale (simulated by clock) → CTA disabled + stale banner. No allocation action possible.
7. Responsive: 375px and 1440px both show full gate state; no horizontal scroll on Hero.

**Definition of Done (P1):**

- [ ] Commands exit 0.
- [ ] `tests/e2e/no-backend.spec.ts` is mandatory in CI (cannot be `continue-on-error`).
- [ ] Visual snapshot of Hero frozen in `tests/e2e/__screenshots__/hero.png`.
- [ ] Tag: `p1-hero-freeze`.

**P1 freeze:** Information architecture of the Hero (score, four gates, gauge, top paths) may not be diluted with news feeds, token prices as a primary column, or social proof.

---

### 6.3 Phase P2 — MCP Tools & Simulation Engine

**Objective:** Machine-readable tools for agents + a **client-side / worker** simulation that folds user notional onto **precomputed** posteriors. Still no live RPC on the read path. Simulation may not call chain.

**Depends on:** `p1-hero-freeze`.

**Target files:**

| Path | Role |
|---|---|
| `lib/sim/engine.ts` | notional × posterior → PnL paths, uses `lib/math/*` |
| `lib/sim/slippage.ts` | impact model id referenced in path shard |
| `lib/sim/gas.ts` | static gas schedule from index metadata, not `eth_gasPrice` |
| `components/terminal/Simulator.tsx` | notional, horizon `{7,30,90}` |
| `app/api/mcp/route.ts` | **optional** MCP HTTP transport; if present, **read-only**, serves shards from `public/data`, **no D1 reads** |
| `mcp/tools/list_paths.ts` | |
| `mcp/tools/get_path.ts` | |
| `mcp/tools/simulate_path.ts` | pure fold |
| `mcp/tools/get_gates.ts` | |
| `mcp/server.ts` | stdio server for Cursor/Claude |
| `lib/telemetry/emit.ts` | D1 write, `waitUntil`, 150 ms timeout |
| `d1/schema.sql` | §5.1.1 |
| `tests/sim/engine.test.ts` | |
| `tests/mcp/tools.test.ts` | |
| `.github/workflows/hourly-snapshot.yml` | may be stubbed with fixtures in P2, live RPC in P2.1 |
| `.github/workflows/timesfm-nightly.yml` | may run on fixture series in P2 |

**Exact commands:**

```bash
pnpm exec vitest run tests/sim tests/mcp tests/math --coverage

# MCP stdio smoke
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | pnpm exec tsx mcp/server.ts | jq .

# simulate tool determinism
pnpm exec tsx scripts/sim_golden.ts --path path_alpha --notional 10000 --horizon 30

# telemetry unit (mock fetch)
pnpm exec vitest run tests/telemetry/emit.test.ts

# D1 schema apply on staging only
# wrangler d1 execute defi_garden_telemetry_stg --file=d1/schema.sql
```

**Acceptance Criteria:**

1. `simulate_path(pathId, notional, horizon)` is a pure function of the path shard + args. Same inputs → same outputs (`1e-9`).
2. Simulation **refuses** to run if any of `G1..G4` is 0; returns structured error `GATE_CLOSED`, does not “best-effort” a number.
3. MCP tools expose **only** serving-plane data. No tool named `query_telemetry` in v1.
4. `lib/telemetry/emit.ts` never thrown to UI; all errors swallowed; unit test with aborted fetch.
5. Worker/sim budget: 10k Monte Carlo paths in `< 50 ms` on M-series / CI `ubuntu-latest` for H=30. If exceeded, use closed-form CVaR from shard, not more samples.
6. No `eth_*` JSON-RPC method names appear in `lib/sim/**` or `mcp/**` (ripgrep CI).

**Definition of Done (P2):**

- [ ] MCP `tools/list` returns the four tools above and no others.
- [ ] Golden sim hashes committed.
- [ ] Tag: `p2-sim-mcp-freeze`.

**P2.1 (same phase, gated sub-step):** wire `pipeline/multicall/evm.ts` and hourly workflow against **allowlisted** pools. Do not expand universe until multicall job is `< 8 min` for 3 consecutive hours.

---

### 6.4 Phase P3 — GTM Distribution & Verified Overlays

**Objective:** Distribution, provenance overlays, and go-to-market surfaces that **do not** mutate P0–P2 math. Overlays are additive badges and export surfaces.

**Depends on:** `p2-sim-mcp-freeze` **and** three consecutive green hourly publishes in staging.

**Target files:**

| Path | Role |
|---|---|
| `components/overlays/VerifiedBadge.tsx` | shows `git_sha`, `as_of_block`, `timesfm.run_id` |
| `components/overlays/ForecastRibbon.tsx` | TimesFM P10/P50/P90 bands; hover binds `run_id` → artifact store |
| `components/overlays/AsOfClock.tsx` | chain-head lag, block freshness SLA, stale-data redline |
| `components/overlays/RiskGateChip.tsx` | hard-block UI when SHA mismatch, failed gate, or `as_of` drift |
| `components/overlays/PivotDelta.tsx` | pre/post-pivot residual, tracking error vs. frozen baseline |
| `lib/provenance.ts` | canonical tuple `{git_sha, as_of_block, timesfm.run_id}` |

### Phase P3 — Provenance Overlay, Operator UX, Freeze Gate

| ID | Workstream | Owner | Exit |
|---|---|---|---|
| P3-01 | Overlay mount on all forecast surfaces | FE | Badge + ribbon on 100% of P50 charts |
| P3-02 | Provenance tuple wired to artifact store | Platform | Lookup < 200 ms p95; 0 unmatched `run_id` |
| P3-03 | Stale/`as_of` drift hard-gate | Quant Risk | Block publish if lag > SLA or SHA ≠ freeze |
| P3-04 | Pivot residual vs. frozen baseline | Quant | TE within signed envelope or auto-hold |
| P3-05 | Operator runbook + incident chip | CPO | Sev-1 path tested; freeze acknowledged |

### Acceptance Criteria (P3)

1. Every forecast pixel is traceable to `{git_sha, as_of_block, timesfm.run_id}`.
2. UI **refuses** to render if any tuple field is missing, stale, or unsigned.
3. Pivot residual and tracking error are visible without leaving the chart.
4. No silent fallback to unverified or pre-pivot weights.

### Definition of Done (P3)

- [ ] Overlays shipped; P3-01…P3-05 exit columns green.
- [ ] Provenance round-trip tested on mainnet `as_of_block` and staging SHA.
- [ ] Risk gate blocks a deliberately stale fixture in CI.
- [ ] Freeze checklist signed; no open Sev-1/Sev-2 on overlay path.

---

### Sign-Off / Freeze — DG-PRD-2026-PIVOT-v1.0

| Role | Name / Function | Decision | Date |
|---|---|---|---|
| Principal Systems Architect | Architecture freeze (overlay + tuple) | **FREEZE** | 2026-03-31 |
| Chief Product Officer | Scope lock P3; no further surface add | **FREEZE** | 2026-03-31 |
| Quantitative Risk Engineer | Residual envelope + hard-gate accepted | **FREEZE** | 2026-03-31 |

**Status:** `FROZEN` — subsequent deltas require a new PRD revision.  
**Canonical freeze tuple:** `git_sha` (release tag) · `as_of_block` (signed head) · `timesfm.run_id` (artifact).
```
