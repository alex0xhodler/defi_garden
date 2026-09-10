# SUPREME JUDGMENT & FINAL MASTER BLUEPRINT PRD
## DeFi Garden Institutional Underwriting & Liquidity Terminal

**Supreme Judge:** `openai/gpt-6-astra-pro` (via Surplus Intelligence)
**Date:** 2026-09-10 20:48:10 UTC
**Evaluation Duration:** 242.32s | **Tokens:** 9497 (Reasoning: 5845)

---

# DeFi Garden — Final Master Blueprint & PRD

**Decision:** Proceed with a bounded institutional underwriting product. Do **not** launch a recommendation engine, an executable-liquidity guarantee, or a points-based “alpha” leaderboard.

**Core proposition**

> **For a caller-specified position and scenario, calculate its prospective cash flows, contractual interruptions, dilution, and exit constraints—and show precisely what is observed, modeled, assumed, or unknown.**

This is more defensible commercially, mathematically, and operationally than “AI yield discovery.”

**Evidence boundary:** The estate figures, TimesFM benchmark, and descriptions of the competing documents are supplied facts, not independently verified repository findings. The paths below are implementation targets, not claims that files already exist. No architecture or wording creates an automatic regulatory exemption; launch requires jurisdiction-specific legal review.

---

# 1. Final adjudication

## 1.1 Verdict by take

| Take | Decisively correct | Incorrect, overstated, or incomplete | Binding resolution |
|---|---|---|---|
| **Take 1: adversarial skeptic** | Concentrated-liquidity cliffs; points-contaminated comparisons; personalized-ranking risk; block-pinned observations; reproducible artifacts | The static kink formula is not universally false. It is correct under frozen-balance assumptions. Caller-supplied inputs and unsorted outputs do not automatically avoid investment-advice regulation. Fully dynamic game theory is unnecessary for a useful first product. | Retain conditional closed forms; add explicit flow scenarios and conservative defaults. Replace recommendations with bounded calculations, without claiming a legal safe harbor. |
| **Take 2: commercial architect** | Curators, treasury/payment infrastructure, and systematic desks are credible buyers. Separate organic economics from reward schedules. A phased executable PRD is necessary. | Embedded risk preferences create product and legal risk. Snapshot headroom was presented too strongly. Pendle differences were insufficiently normalized. Premium SLA pricing is not justified by GitHub Actions cron alone. | Preserve buyer segmentation and commercial ladder. Remove house preferences. Restrict liquidity claims. Make premium service commitments contingent on demonstrated operational capability. |
| **Take 3: calibration auditor** | Ticket economics, next contractual event, exit uncertainty, explicit UNKNOWN/STALE states, maturity alignment, and P0-first implementation | It did not specify the mathematical closure, contracts, or release gates needed for execution. | Adopt its product framing and uncertainty discipline; implement the concrete specifications below. |

## 1.2 The contradictions are resolved by separating five products that were being conflated

1. **Observed protocol state**
2. **Conditional mechanical calculations**
3. **Statistical forecasts**
4. **Caller-defined stress scenarios**
5. **Recommendations**

DeFi Garden may implement the first four within this PRD. The fifth is out of scope unless separately authorized and designed.

### Binding prohibitions

The initial product must not:

- Promise that a displayed amount can be withdrawn now or in the future.
- Rank investments using DeFi Garden’s preferred risk coefficient.
- Treat marginal forecast quantiles as a joint return distribution.
- Extrapolate organic forecasts into points valuations.
- Treat reward expiry as something a statistical model may override.
- Present a 30-day forecast against a different-maturity fixed yield as a tradable spread.
- Describe itself as “MiCA exempt,” “RIA shielded,” or “regulator approved.”
- Claim a payment-continuity SLA that its data-production architecture cannot support.

---

# 2. Product scope and acceptance principles

## 2.1 Initial institutional surface

The first useful terminal answers:

1. What was observed, at which block and time?
2. What yield components generated the reported APY?
3. Which components can stop at a known contractual event?
4. How does a specified ticket change the relevant mechanics?
5. What exit constraints were observed?
6. What happens under explicit repayment, borrowing, price, or tick-path scenarios?
7. Which quantities cannot currently be calculated responsibly?

### Coverage is multidimensional

The supplied estate contains:

- 7,996 tracked pools.
- 7,383 forecast-eligible pools.
- 613 pools outside that forecast-eligible set.
- A top-787 concentration set representing more than 85% of TVL.

These are **not equivalent coverage universes**.

Publish separate coverage counts for:

- Forecast eligibility.
- Verified reward schedules.
- Lending-liquidity adapters.
- CLMM tick-state completeness.
- Pendle entitlement completeness.
- Ticket simulation support.
- Fresh observations.

“Forecast available” must never imply “underwriting complete.”

## 2.2 Output taxonomy

Every numerical output must identify its basis:

| Basis | Meaning |
|---|---|
| `OBSERVED` | Read from a specified source and block/time |
| `CONTRACTUAL_AS_OBSERVED` | Derived from contract terms as observed; mutability disclosed |
| `MECHANICAL_CONDITIONAL` | Deterministic result under explicit frozen-state or flow assumptions |
| `STATISTICAL_FORECAST` | Model output with defined target and calibration evidence |
| `CALLER_SCENARIO` | Result of caller-supplied or explicitly selected assumptions |
| `UNMODELED` | Relevant exposure exists but is not estimated |

Availability is a separate field:

```text
OK | UNKNOWN | STALE | UNSUPPORTED | INVALID
```

Unknown is not zero. Stale is not current. A scenario is not a forecast.

---

# 3. Unified quantitative formulation

## 3.1 Lending: use distinct accounting variables

For an isolated, plain lending market, define:

- \(S\): supplier asset claims, in underlying units.
- \(D\): debt outstanding on the utilization basis used by the protocol.
- \(C\): transferable underlying cash available to the withdrawal mechanism.
- \(U\): utilization according to the protocol’s actual implementation.
- \(U^*\): interest-rate kink.
- \(w\): the caller’s prospective external withdrawal.

Only where the adapter proves the relationship may the simplified identity be used:

\[
S=C+D,\qquad U=D/S.
\]

Reserves, bad debt, virtual balances, shared liquidity, accrued fees, and vault allocations can break this simplification.

**Law:** The adapter supplies the protocol’s accounting identity. The generic engine does not invent one.

---

## 3.2 Frozen-state kink headroom

If:

- \(U=D/S\);
- debt remains fixed;
- withdrawal reduces \(S\) one-for-one;
- there are no concurrent flows or accounting changes;

then:

\[
\frac{D}{S-w}\le U^*
\]

implies:

\[
W_{\text{kink,frozen}}
=
\max\left(0,S-\frac{D}{U^*}\right)
=
\max\left(0,S\left(1-\frac{U}{U^*}\right)\right).
\]

This formula is **conditionally correct**.

It is not:

- A forecast of borrower behavior.
- A cash-availability calculation.
- An executable withdrawal quote.
- A safe-size recommendation.

Its field name must include `frozen_state`.

### Golden vector

For:

\[
S=100,\quad D=80,\quad U^*=0.9,
\]

the result is:

\[
W_{\text{kink,frozen}}=11.111\ldots
\]

while simplified cash is \(20\).

The kink constraint and cash constraint are different quantities.

---

## 3.3 Repayment feedback and looper-funded redemptions

The engine must distinguish genuine cash replenishment from debt repayment accompanied by another withdrawal.

Over a stated horizon, assume:

- Repayments: \(R=\beta w\).
- New borrowing: \(B=\gamma w\).
- Looper redemptions accompanying repayment: \(L=\lambda R\).
- No external deposits, losses, or interest accrual in this specific closed-form scenario.

Here:

- \(\beta\ge0\): repayment response per unit of external withdrawal.
- \(\gamma\ge0\): borrowing response per unit of external withdrawal.
- \(\lambda\ge0\): associated redemption per unit of repayment.

Then:

\[
S'=S-w-L,
\]

\[
D'=D-R+B,
\]

\[
C'=C-w-L+R-B.
\]

Substitution gives:

\[
S'=S-w(1+\lambda\beta),
\]

\[
D'=D+w(\gamma-\beta),
\]

\[
C'=C-w\left[1-\beta(1-\lambda)+\gamma\right].
\]

The kink inequality becomes:

\[
\left[U^*(1+\lambda\beta)-\beta+\gamma\right]w
\le U^*S-D.
\]

When the bracketed denominator is positive:

\[
W_{\text{kink,scenario}}
=
\frac{U^*S-D}
{U^*(1+\lambda\beta)-\beta+\gamma},
\]

subject to all state-domain and cash constraints.

### Critical interpretation

If \(\lambda=1\), repayment and looper redemption offset in cash terms:

\[
C'=C-w-B.
\]

The repayment may change utilization, but it does **not** replenish net cash available to the external withdrawing account.

That is the mathematical correction missing from a naive repayment-feedback model.

### Domain restrictions

Reject or separately solve cases where:

- The denominator is nonpositive.
- \(S'\le0\).
- \(D'<0\).
- Repayments exceed debt.
- Cash becomes negative.
- Protocol caps or collateral constraints bind.
- Assumed flows cannot actually occur under the protocol topology.

A nonpositive denominator is **not** “infinite headroom.”

### Golden vector

Using \(S=100,D=80,U^*=0.9\), with \(\beta=0.2,\gamma=0\):

- External repayment, \(\lambda=0\):

\[
W_{\text{kink,scenario}}=
\left[
\frac{u_{\mathrm{scenario}}-u_{\mathrm{kink}}}
{1-u_{\mathrm{kink}}}
\right]_{0}^{1},
\qquad
[z]_{0}^{1}:=\min(1,\max(0,z)).
```

**Continuation contract.** Lines 1–295 are not available in this conversation. This continuation therefore defines an explicit local convention: \(W_{\mathrm{kink,scenario}}\) is a normalized measure of utilization above the kink—not a probability of loss or a yield multiplier. The golden fixtures, interface contracts, and repository paths below are proposed specifications, not recovered prior content. Reconciliation with any earlier definitions is a release-blocking documentation task.

For \(0<u_{\mathrm{kink}}<1\):

- \(W_{\mathrm{kink,scenario}}=0\) at or below the kink.
- \(W_{\mathrm{kink,scenario}}\in(0,1)\) above the kink.
- \(W_{\mathrm{kink,scenario}}=1\) at full utilization.

Invalid utilization inputs must fail validation before this expression is evaluated. Clamping must not conceal utilization outside \([0,1]\).

### 3.3.1 Completion of the Golden Vector Evaluation

#### A. Explicit lending fixture

Use the following synthetic, independently reproducible fixture:

| Input | Value |
|---|---:|
| Supplied pool assets \(S\) | 1,000,000 units |
| Baseline utilization \(u_0\) | 0.75 |
| Scenario utilization \(u_s\) | 0.85 |
| Kink utilization \(u_k\) | 0.80 |
| Base borrow APR \(b_0\) | 0.02 |
| Below-kink slope \(s_1\) | 0.10 |
| Above-kink slope \(s_2\) | 1.00 |
| Reserve factor \(f_r\) | 0.10 |
| Evaluated position \(C\) | 100,000 units |
| Evaluation horizon \(d\) | 30 days |
| Explicit horizon costs \(K\) | 200 units |
| Liquid incentive APR \(r_I\) | 0.03 |
| Scenario withdrawal demand \(D\) | 200,000 units |
| Required cash coverage \(\kappa_{\min}\) | 1.20 |

Rates are decimal annual rates, not percentage-point strings. The interest-rate model is:

\[
b(u)=
\begin{cases}
b_0+s_1\dfrac{u}{u_k},&0\le u\le u_k,\\[6pt]
b_0+s_1+s_2\dfrac{u-u_k}{1-u_k},&u_k<u\le1.
\end{cases}
\]

The modeled supplier APR, before position-specific costs and incentives, is:

\[
r_L(u)=u\,b(u)(1-f_r).
\]

This simplified fixture excludes bad debt, withdrawal queues, protocol pauses, and non-cash accounting adjustments. Production adapters must supply those fields separately.

#### B. Baseline calculation

\[
b(0.75)=0.02+0.10\frac{0.75}{0.80}=0.11375.
\]

\[
r_L(0.75)=0.75(0.11375)(0.90)=0.07678125.
\]

Therefore:

- Borrow APR: **11.375%**.
- Supplier APR before incentives and position-specific costs: **7.678125%**.
- Available pool cash: **250,000 units**.
- Cash coverage: \(250{,}000/200{,}000=\mathbf{1.25}\).
- Normalized kink stress: **0**.

#### C. Scenario calculation

\[
b(0.85)=0.02+0.10+1.00\frac{0.85-0.80}{0.20}=0.37.
\]

\[
r_L(0.85)=0.85(0.37)(0.90)=0.28305.
\]

\[
W_{\mathrm{kink,scenario}}
=\frac{0.85-0.80}{0.20}
=0.25.
\]

\[
\mathrm{Cash}_s=S(1-u_s)=150{,}000.
\]

\[
\kappa_s=\frac{150{,}000}{200{,}000}=0.75<1.20.
\]

The scenario produces a higher modeled supplier APR, **28.305%**, but fails the configured liquidity-coverage constraint.

> **Required interpretation:** A utilization-driven yield increase is not an improvement in withdrawal capacity. The engine must not allow a higher displayed APY to cancel a deterministic liquidity-policy failure.

The coverage calculation is a stress ratio, not a promise of pro rata access to pool cash.

#### D. Horizon returns and dual annualization

For this fixture, accrue interest and liquid incentives linearly over 30 days. Deduct the explicit 200-unit horizon cost once.

Durable horizon return:

\[
R_D=
0.07678125\frac{30}{365}
-\frac{200}{100{,}000}
=\frac{1007}{233600}.
\]

Observed all-in horizon return:

\[
R_O=
R_D+0.03\frac{30}{365}
=\frac{1583}{233600}.
\]

The two annualized modeled returns are:

\[
\mathrm{APY}_D=
\left(\frac{234607}{233600}\right)^{73/6}-1,
\]

\[
\mathrm{APY}_O=
\left(\frac{235183}{233600}\right)^{73/6}-1.
\]

These exact expressions are the golden expectations. Decimal display values must be generated by the canonical numeric implementation, not manually copied approximations.

Annualizing a horizon return implicitly repeats that horizon’s net economics. The interface must disclose that transaction costs, incentive rates, and reinvestment opportunities may not repeat.

#### E. Mandatory golden assertions

```yaml
fixture_id: lending_kink_v1
expected:
  baseline:
    borrow_apr: "0.11375"
    supplier_apr: "0.07678125"
    available_cash: "250000"
    cash_coverage: "1.25"
    kink_stress: "0"
    gate_0: PASS
    gate_1: PASS
  scenario:
    borrow_apr: "0.37"
    supplier_apr: "0.28305"
    available_cash: "150000"
    cash_coverage: "0.75"
    kink_stress: "0.25"
    gate_0: PASS
    gate_1: FAIL
    reason_codes:
      - LIQUIDITY_COVERAGE_BELOW_POLICY
```

All other Gate 0 and Gate 1 predicates are explicitly configured to pass in this fixture.

The engine must retain both the calculated scenario economics and the failing policy result. It must neither erase the economics nor relabel the scenario as admissible.

---

## 3.4 AMM Concentrated Liquidity: Range-Dropout & Fee Dilution

### 3.4.1 Position accounting

Let:

- \(P\): price of token 0 denominated in token 1.
- \(P_a,P_b\): lower and upper position prices, with \(0<P_a<P_b\).
- \(L\): position liquidity.
- \(x(P),y(P)\): principal token amounts, excluding uncollected fees.

Then:

\[
x(P)=
\begin{cases}
L\left(\dfrac{1}{\sqrt{P_a}}-\dfrac{1}{\sqrt{P_b}}\right),
&P\le P_a,\\[6pt]
L\left(\dfrac{1}{\sqrt P}-\dfrac{1}{\sqrt{P_b}}\right),
&P_a<P<P_b,\\[6pt]
0,&P\ge P_b,
\end{cases}
\]

\[
y(P)=
\begin{cases}
0,&P\le P_a,\\[6pt]
L(\sqrt P-\sqrt{P_a}),&P_a<P<P_b,\\[6pt]
L(\sqrt{P_b}-\sqrt{P_a}),&P\ge P_b.
\end{cases}
\]

Position principal value in token 1 is:

\[
V_{\mathrm{LP}}(P)=Px(P)+y(P).
\]

Protocol adapters must reconcile these analytical formulas with the protocol’s tick arithmetic, decimal scaling, boundary conventions, and rounding. Analytical formulas are not substitutes for exact on-chain accounting.

### 3.4.2 Range dropout

Define continuous-model activity:

\[
I_t=\mathbf{1}\{P_a<P_t<P_b\}.
\]

Time in range over horizon \(T\) is:

\[
\theta_T=\frac{1}{T}\int_0^T I_t\,dt.
\]

Outside the range:

1. The position becomes entirely one principal token.
2. It earns no new trading fees until active again.
3. Previously accrued fees remain separately accounted for.
4. Principal remains exposed to token-price changes.
5. Rebalancing introduces transaction costs and execution risk.

Range dropout is not itself liquidation. Leveraged wrappers require an additional, separately specified liquidation model.

A terminal price alone cannot determine fee income. Two paths with identical endpoints may have different active durations, traded volumes, and liquidity competition.

### 3.4.3 Fee dilution

For a simplified fee-bearing volume process \(dQ_t\), expressed in a consistent quote numeraire:

\[
F_i=
\int_0^T
I_{i,t}
\frac{L_{i,t}}{L_{\mathrm{active},t}}
f_t(1-\phi_t)\,dQ_t,
\]

where:

- \(f_t\) is the applicable swap-fee rate.
- \(\phi_t\) is the protocol’s share of swap fees.
- \(L_{\mathrm{active},t}\) includes the evaluated position.

This approximation is valid only when the modeled volume is assigned to the price segments and active liquidity that actually process it. Production historical accounting should use protocol fee-growth data wherever available.

Fees are earned in token amounts. Preserve those amounts before conversion into the reporting numeraire.

For fixed fee-bearing volume and active intervals:

\[
L'_{\mathrm{active},t}=\lambda L_{\mathrm{active},t}
\quad\Longrightarrow\quad
F'_i=\frac{F_i}{\lambda}.
\]

This is a controlled sensitivity, not a prediction that volume remains unchanged when liquidity changes.

### 3.4.4 Principal divergence and net return

For initial holdings \(x_0,y_0\), the passive-hold benchmark is:

\[
V_{\mathrm{HODL}}(P_T)=P_Tx_0+y_0.
\]

Define:

\[
\Delta V_{\mathrm{divergence}}
=
V_{\mathrm{LP}}(P_T)-V_{\mathrm{HODL}}(P_T).
\]

For an unrebalanced position:

\[
R_{\mathrm{LP,net}}
=
\frac{
V_{\mathrm{LP}}(P_T)
+F_T
+I_T^{\mathrm{liquid}}
-K_T
-V_0
}{V_0}.
\]

All terms must use the same valuation timestamp and numeraire.

Do not subtract divergence loss again from this expression: terminal LP principal already includes it. Strategies with deposits, withdrawals, or rebalances require a cash-flow ledger and an explicitly identified return methodology.

### 3.4.5 AMM golden fixture

Set:

\[
P_a=1,\quad P_b=4,\quad P_0=2.25,\quad L=300.
\]

At inception:

\[
x_0=50,\qquad y_0=150,\qquad V_0=262.5.
\]

At \(P_T=4\):

\[
x_T=0,\qquad y_T=300,\qquad V_{\mathrm{LP}}=300.
\]

\[
V_{\mathrm{HODL}}=4(50)+150=350.
\]

\[
\Delta V_{\mathrm{divergence}}=-50,
\qquad
\frac{V_{\mathrm{LP}}}{V_{\mathrm{HODL}}}-1=-\frac17.
\]

For a separate fee-only sensitivity:

| Case | Position share of active liquidity | Eligible net pool fees | Position fees |
|---|---:|---:|---:|
| Baseline | 10% | 1,000 | 100 |
| Dilution | 5% | 1,000 | 50 |
| Dilution plus 50% active exposure | 5% | 500 | 25 |

The final row assumes fee flow is uniform over time and the position is active for half the interval. Without that assumption, time in range cannot be multiplied directly by total fees.

**Required scenarios:** upper-range exit, lower-range exit, exit-and-reentry, active-liquidity growth, volume contraction, gas shock, and failed rebalance.

---

## 3.5 Dual APY & Gate 0/1 Deterministic Overrides

### 3.5.1 Dual APY contract

The product must display two distinguishable yield measures:

| Measure | Included | Excluded |
|---|---|---|
| **Durable APY** | Modeled base economic cash flows, net of modeled costs | Discretionary incentives, points, speculative token appreciation |
| **Observed all-in APY** | Durable components plus currently measurable, realizable liquid incentives | Unpriced points and unsupported future distributions |

“Durable” describes the revenue classification. It does not mean guaranteed, fixed, or risk-free.

For horizon \(d>0\):

\[
\mathrm{APY}_{j}
=(1+R_{j,d})^{365/d}-1,
\qquad j\in\{D,O\}.
\]

Requirements:

- Store nominal APR, horizon return, and annualized return separately.
- Disclose accrual, compounding, day-count, and cost assumptions.
- Identify forward estimates versus historical realized measurements.
- Permit negative returns; do not floor them at zero.
- If \(1+R_{j,d}<0\), return `ANNUALIZATION_UNDEFINED`.
- Reject zero-length horizons and flag horizons below the configured reporting minimum.
- Never convert missing incentives, costs, or prices into an undisclosed zero.

`observed_all_in_apy` means an estimate based on observed inputs, not a realized future outcome.

### 3.5.2 Gate 0: evaluation validity

Gate 0 determines whether the requested calculation is valid and sufficiently supported.

Mandatory predicates include:

- Supported adapter, instrument, and methodology versions.
- Valid numeric domains, decimals, units, and token identities.
- Required data completeness.
- Snapshot freshness and permitted cross-source skew.
- Chain identity, block hash, and finality requirements.
- Price-source validity and configured deviation checks.
- No unsupported payoff, leverage, or fee mechanism.

Statuses:

```text
PASS
FAIL
UNKNOWN
```

An absent required observation produces `UNKNOWN`, not `PASS`.

Gate 0 failure or uncertainty blocks actionable comparison output. Diagnostic calculations may remain available only when clearly marked as partial and non-actionable.

### 3.5.3 Gate 1: explicit policy admissibility

Gate 1 applies a versioned policy supplied or affirmatively selected by the caller.

Examples:

- Minimum withdrawal-liquidity coverage.
- Maximum utilization or kink stress.
- Maximum leverage.
- Maximum scenario loss.
- Minimum remaining maturity.
- Permitted assets, protocols, chains, and bridges.
- Maximum concentration, where the necessary portfolio inputs exist.
- Minimum modeled economic return after costs.

No predicate may be reported as passing if its required input is absent.

A scenario stress budget does not establish a probabilistic loss bound unless a validated probabilistic model supports that interpretation.

### 3.5.4 Precedence and overrides

\[
\mathrm{Admissible}
=
(\mathrm{Gate0}=\mathrm{PASS})
\land
(\mathrm{Gate1}=\mathrm{PASS}).
\]

Deterministic override means:

> Gate results override scores and presentation order. Scores never override gates.

It does not mean an administrator can silently bypass a failed rule.

```python
if gate_0.status != PASS:
    disposition = BLOCKED_INVALID_OR_INCOMPLETE
elif gate_1.status == FAIL:
    disposition = POLICY_FAIL
elif gate_1.status == UNKNOWN:
    disposition = POLICY_UNDETERMINED
else:
    disposition = POLICY_PASS
```

A policy change creates a new policy version and evaluation. The prior result remains attributable to its original inputs.

Mandatory invariants:

1. Identical canonical inputs and engine version yield identical economic outputs.
2. Input order does not alter the evaluation of a path.
3. Missing required data never improves admissibility.
4. A higher APY cannot repair a liquidity, leverage, or data-quality failure.
5. Every gate outcome exposes machine-readable reasons and supporting observations.
6. No hidden scalar “safety score” may replace the underlying gate results.

---

## 3.6 Pendle Spread Normalization & Points Disclosure

### 3.6.1 Instrument decomposition

The adapter must distinguish:

- Underlying asset.
- Standardized Yield token and conversion mechanics.
- Principal Token, or PT.
- Yield Token, or YT.
- Maturity and settlement rules.
- Reward and points entitlements.
- Transfer restrictions, fees, and market liquidity.

A PT quote against SY is not automatically a quote against one unit of redeemable underlying. Conversion rates and redemption rules must be applied explicitly.

### 3.6.2 PT yield normalization

Let:

- \(P_{\mathrm{PT},U}\): executable PT acquisition cost in underlying units.
- \(q_{T,U}\): modeled underlying redemption per PT at maturity.
- \(K_U\): separately modeled acquisition and redemption costs per PT.
- \(\tau=(T-t)/(365\text{ days})\).

Then:

\[
y_{\mathrm{PT},U}
=
\left(
\frac{q_{T,U}}
{P_{\mathrm{PT},U}+K_U}
\right)^{1/\tau}-1.
\]

Requirements:

- \(T>t\).
- Positive acquisition cost.
- Identical redemption and price numeraire.
- No double counting of costs already included in the executable quote.
- Disclosure of any conditional or haircut-adjusted redemption assumption.

If terminal conversion into the reporting numeraire is uncertain, the reported yield must identify that exposure. Fixed underlying redemption is not fixed fiat redemption.

For a benchmark effective annual yield \(y_{B,U}\) with matching tenor and numeraire:

\[
s_{\mathrm{simple,bps}}
=10^4(y_{\mathrm{PT},U}-y_{B,U}).
\]

Alternatively:

\[
s_{\mathrm{log,bps}}
=
10^4
\left[
\frac{\ln\left(q_{T,U}/(P_{\mathrm{PT},U}+K_U)\right)}{\tau}
-\ln(1+y_{B,U})
\right].
\]

The two spreads are distinct fields and must not share an ambiguous `spread_bps` label.

### 3.6.3 PT golden fixture

For a synthetic instrument:

\[
P_{\mathrm{PT},U}=0.95,\quad
q_{T,U}=1,\quad
K_U=0,\quad
\tau=0.5.
\]

\[
y_{\mathrm{PT},U}
=
\left(\frac{1}{0.95}\right)^2-1
=
\frac{39}{361}.
\]

With a 5% effective annual benchmark:

\[
s_{\mathrm{simple,bps}}
=
10^4\left(\frac{39}{361}-0.05\right)
\approx580.332410\text{ bps}.
\]

This fixture tests normalization only. It does not assert that every PT redeems for one underlying unit.

### 3.6.4 YT and points

YT must not be assigned PT-style fixed redemption yield. Its value depends on future distributions, entitlements, costs, and time to maturity; ordinary YT principal redemption at maturity is zero.

Points must be disclosed separately:

```json
{
  "points": {
    "program_id": "issuer-defined",
    "units_observed": "12500",
    "cash_value": null,
    "valuation_status": "UNPRICED",
    "included_in_durable_apy": false,
    "included_in_observed_all_in_apy": false,
    "eligibility_verified": false,
    "transferability": "UNKNOWN",
    "terms_snapshot_hash": "sha256:..."
  }
}
```

Required disclosures:

- Points may never convert into money or transferable tokens.
- Distribution, vesting, eligibility, dilution, and claim rules may change.
- PT, YT, SY, and LP positions may have different entitlements.
- A points balance does not establish claim eligibility.
- User-entered points valuations belong in a separate sensitivity panel, not either headline APY.

---

## 4. Regulatory & Compliance Architecture

### 4.1 Product boundary: comparator, not an asserted exemption

The intended product is a **non-custodial, user-directed analytical comparator**.

That architecture can reduce certain operational risks. It does not, by itself, create a “MiCA shield” or an exemption from the US Investment Advisers Act.

Classification depends on actual functionality, communications, compensation, instruments, clients, and jurisdictions.

**Launch condition:** qualified counsel must approve the specific operating model, applicable jurisdictions, customer categories, and current legal analysis. This section is an engineering control framework, not a legal opinion.

### 4.2 MiCA-facing controls

The legal-perimeter review must determine:

1. Whether the relevant crypto-assets and activities fall within MiCA.
2. Whether another regime applies, including where an instrument is a financial instrument.
3. Whether functionality constitutes a regulated crypto-asset service.
4. Whether marketing, distribution, or partner arrangements create additional obligations.
5. Whether authorization, restrictions, disclosures, or partner controls are required.

Default product exclusions:

- No custody or control of private keys.
- No order transmission or execution.
- No discretionary portfolio management.
- No personalized suitability claims.
- No “approved,” “safe,” or “guaranteed” badges.
- No issuer-paid placement disguised as analytical ordering.

Personalized advice may remain regulated even without custody or execution.

### 4.3 US Advisers Act and adjacent perimeter

Counsel must assess whether the business provides advice concerning securities, for compensation, as part of a business, and whether registration requirements or valid exclusions or exemptions apply.

Do not assume:

- Calling the product “software” avoids adviser status.
- B2B distribution eliminates the issue.
- A disclaimer defeats substantive recommendations.
- A publisher exclusion automatically covers customized outputs.
- Non-security status resolves all other federal or state obligations.

Additional reviews may be needed for commodities, derivatives, brokerage, sanctions, financial promotions, privacy, and state-law requirements.

### 4.4 `dg_evaluate_paths`: stateless comparator contract

```text
dg_evaluate_paths(
    paths,
    snapshot_bundle,
    scenario_set,
    policy,
    reporting_convention,
    engine_version
) -> EvaluationBundle
```

The function:

- Accepts caller-supplied alternatives.
- Computes all supported alternatives using the same declared conventions.
- Applies explicit policy predicates.
- Returns economics, sensitivities, gates, provenance, and warnings.
- Preserves input order by default.
- Does not select an allocation or emit an execution instruction.

The function must not:

- Infer undisclosed financial circumstances.
- Choose a risk tolerance.
- Populate a default “buy” or “sell” decision.
- Learn cross-session preferences.
- Access signing keys.
- Submit or construct transactions through the comparator interface.
- Invoke an LLM to determine financial outputs or gate results.

Statelessness means no hidden economic or user state affects the calculation. Separate authentication, billing, and audit services may retain governed operational records.

An explicit sort may be offered as “sorted by the selected metric,” not as “recommended for you.” Sorting and filtering still require legal review in context.

### 4.5 Separation of responsibilities

```text
Data connectors
      ↓
Validated immutable snapshots
      ↓
Deterministic quantitative core
      ↓
Policy evaluator
      ↓
Comparison response
      ↓
UI / customer integration
```

A narrative layer, if present, may explain the signed quantitative output. It may not alter numbers, suppress failures, or invent entitlements.

Required controls:

- Tenant isolation and scoped credentials.
- Configurable retention and data minimization.
- Versioned disclosure text.
- Conflict-of-interest and commercial-placement register.
- Human-reviewed legal launch matrix.
- Incident, correction, and customer-notification procedures.
- Jurisdictional restrictions where counsel requires them.
- Prohibition on reuse of customer policy or portfolio data for training without an appropriate legal basis and agreement.

### 4.6 Provenance

Every evaluation must identify:

```text
evaluation_input_hash
engine_version
adapter_versions
policy_hash
scenario_set_hash
snapshot_hashes
block_numbers_and_hashes
source_timestamps
reporting_convention
economic_result_hash
warning_codes
```

Transport timestamps, request identifiers, and response signatures belong outside the deterministic economic-result hash.

Provider signatures establish origin and integrity, not economic truth or regulatory approval.

---

## 5. The Refined B2B Commercial Strategy & Pricing

### 5.1 Customer and problem

Prioritize customers that already own their investment decisions and need reproducible analytics:

1. Institutional risk and treasury teams.
2. Wallet and analytics platforms.
3. Protocol risk teams.
4. Professional research providers.
5. Regulated intermediaries, subject to approved integration scope.

The commercial product is:

> Auditable DeFi comparison infrastructure with explicit assumptions, scenario analysis, and reproducible policy controls.

Do not sell guaranteed yield, automated fiduciary judgment, or legal compliance by API.

### 5.2 Packaging

**Core API**

- Supported lending, concentrated-liquidity, and Pendle adapters.
- Dual APY and horizon returns.
- Versioned scenario evaluation.
- Gate outcomes and reason codes.
- Standard provenance.

**Risk Workspace**

- Shared policy libraries.
- Scenario comparisons.
- Review and export workflows.
- Historical evaluation replay.
- Role-based access.

**Enterprise Deployment**

- Dedicated capacity or deployment.
- Private connectors.
- Customer-managed retention.
- SSO and advanced access controls.
- Contracted support and service objectives.

Enterprise features must not alter the core’s economic answers.

### 5.3 Proposed launch pricing

These prices are commercial hypotheses to test with design partners, not established willingness-to-pay evidence.

| Package | Proposed price | Included usage |
|---|---:|---|
| Paid design-partner pilot | \$7,500 for eight weeks | Defined scope, integration support, 25,000 evaluation units |
| Core API | \$2,000/month | 100,000 evaluation units/month |
| Risk Workspace | \$6,000/month | 500,000 evaluation units/month, ten seats |
| Enterprise | From \$75,000/year | Negotiated capacity, deployment, security and support |
| Custom adapter | Separately scoped fixed fee | Written deliverables, tests, and maintenance terms |

One evaluation unit is one supported path evaluated against one scenario. A request with 20 paths and five scenarios consumes 100 units.

Rules:

- Validation-rejected requests do not consume evaluation units.
- Scenario complexity and maximum request sizes are contractually bounded.
- Overage requires explicit opt-in and a spend cap.
- Data-vendor charges and dedicated infrastructure are disclosed separately.
- Security fixes and model corrections are not paid accuracy upgrades.

Do not adopt AUM, transaction-volume, performance, or placement-based fees without separate conflicts and regulatory review.

### 5.4 Commercial validation

The pilot must measure:

- Time from credentials to first reproducible integration.
- Analyst time saved on a defined workflow.
- Replay success rate.
- Missing-data and unsupported-instrument rates.
- Policy-explanation usefulness.
- Recurring usage.
- Paid conversion and renewal intent.
- Support and infrastructure cost per customer.

Contribution margin:

\[
\mathrm{CM}
=
\frac{
\mathrm{Revenue}
-\mathrm{Data}
-\mathrm{Compute}
-\mathrm{DirectSupport}
-\mathrm{OtherDirectCosts}
}{
\mathrm{Revenue}
}.
\]

A provisional target is at least 75% contribution margin for standardized deployments. It is a business target, not a forecast.

### 5.5 Go-to-market discipline

- Recruit three to five paid design partners before broad distribution.
- Keep pilots bounded by supported assets and workflows.
- Publish synthetic golden fixtures and methodology.
- Sell reproducibility and workflow efficiency rather than yield outperformance.
- Require change control for custom scope.
- Keep commercial relationships out of default analytical ordering.
- Expand jurisdiction and execution scope only through new legal and technical approval.

---

## 6. The Final Master Implementation Blueprint

### 6.1 Repository and execution conventions

The exact paths below define the proposed repository contract. They do not imply that files have already been created.

Use a Python 3.12 deterministic core and a thin FastAPI service. Financial inputs and outputs use decimal strings or explicitly specified integer units; binary floating-point is prohibited for authoritative financial calculations.

Canonical conventions:

- Decimal precision: 50 significant digits.
- Rounding: `ROUND_HALF_EVEN`.
- Economic-rate serialization: 12 decimal places unless a field specifies otherwise.
- Token amounts: protocol-specific integer precision.
- Time: UTC, with an explicit day-count convention.
- Reference clock: request-supplied `as_of`, never an implicit core wall clock.
- Canonical JSON: versioned serialization with sorted keys and decimal strings.
- Transcendentals: canonical Decimal implementation, runtime pinned and cross-platform tested.
- No premature rounding of intermediate values.

### 6.2 P0 — Contracts, arithmetic, and golden fixtures

**Objective:** establish semantics and deterministic correctness before live integrations.

**Files**

```text
FINAL-MASTER-BLUEPRINT-PRD-ASTRA-JUDGE.md
pyproject.toml
uv.lock
src/dg_core/__init__.py
src/dg_core/types.py
src/dg_core/decimal_math.py
src/dg_core/canonical.py
src/dg_core/annualization.py
src/dg_core/lending.py
src/dg_core/amm_cl.py
src/dg_core/pendle.py
src/dg_core/errors.py
schemas/evaluate_paths.request.schema.json
schemas/evaluate_paths.response.schema.json
schemas/snapshot_bundle.schema.json
fixtures/golden/lending_kink
fixtures/golden/lending_liquidation
fixtures/golden/lending_bad_debt
fixtures/golden/oracle_stale
fixtures/golden/oracle_deviation
fixtures/golden/dex_slippage
fixtures/golden/mev_sandwich
fixtures/golden/chain_reorg
fixtures/golden/transaction_revert

## Phase Milestones — Acceptance Criteria & Definition of Done

### P0 — Deterministic Foundations
- Scope: Freeze schemas, units, rounding rules, protocol adapters, and golden-fixture contracts.
- Acceptance Criteria: Every fixture includes pinned inputs, expected outputs, provenance, and explicit tolerances; repeated runs produce identical results.
- DoD: CI passes all fixtures and accounting invariants; no unexplained balance drift; schema and fixture manifests are versioned and reviewed.

### P1 — Quantitative & Risk Validation
- Scope: Validate pricing, lending curves, liquidation mechanics, portfolio accounting, and risk limits against pinned reference states.
- Acceptance Criteria: Differential tests remain within approved tolerances; stale or inconsistent data blocks new risk; adversarial scenarios trigger their specified controls.
- DoD: Quantitative review approves model assumptions and calibration; all P1 acceptance tests pass; every material discrepancy is resolved or blocks promotion.

### P2 — Execution & Operational Readiness
- Scope: Exercise transaction simulation, authorization, idempotency, reconciliation, reorg recovery, monitoring, and emergency controls.
- Acceptance Criteria: Fork tests cover successful, reverted, replaced, and reorged transactions; retries cannot duplicate economic intent; execution respects approved gas, slippage, and exposure limits.
- DoD: Independent security review is complete with no unresolved Critical or High findings; pause/recovery drills pass; runbooks and on-call ownership are approved.

### P3 — Controlled Production & Release Freeze
- Scope: Deploy a capped canary, reconcile live state, verify alerts, and expand only through explicit release gates.
- Acceptance Criteria: Canary duration and exposure caps are approved before launch; reconciliation stays within frozen tolerances; no unresolved release-blocking incidents remain.
- DoD: Canary evidence is reviewed; rollback or safe-pause readiness is demonstrated; every required owner approves the exact release artifact before expansion.

## Supreme Sign-Off / Freeze
- Decision: PENDING — this blueprint does not itself authorize deployment, capital allocation, or production expansion.
- Freeze Scope: PRD revision, source commit, build digest, dependency lockfiles, adapter versions, risk configuration, and fixture-manifest hash.
- Evidence Required: CI reports, differential-test results, security review, operational drills, canary reconciliation, and acceptance-checklist links.
- Quantitative Sign-Off: Quant/Risk owner — [name, decision, UTC timestamp, evidence reference].
- Systems & Security Sign-Off: Engineering and Security owners — [names, decisions, UTC timestamps, evidence references].
- Production Sign-Off: Release and Operations owners — [names, decisions, UTC timestamps, exact artifact digest].
- Freeze Condition: Mark FROZEN only when P0–P3 DoD is satisfied and all required approvals bind to the same immutable release manifest.
- Change Control: Any post-freeze change requires a versioned amendment, impact review, affected-test reruns, and renewed approvals; a breached gate blocks expansion and invokes the approved safe-state runbook.
```
