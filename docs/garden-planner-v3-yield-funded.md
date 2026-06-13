# Garden Planner v3 — Yield-Funded Goals ("Flip the Script")

DECIDED DIRECTION (product owner, 2026-06-12): capital-first is the default funding path; infeasible deadlines render truth-as-content (no auto-relax); subscription ladder = everyday-bills set (§7); ship in ONE pass against the §10 verification scenarios.

Source of truth for the v3 redesign of TARGET and SUBSCRIPTION archetypes. GROWTH (retirement, home) is untouched except where noted. All v2 non-negotiables remain (trust rails, tokens-only styling, en-US formatting, EN+KO together, reduced-motion, 360px, dark mode, surgical diffs).

## 1. The problem (verbatim evidence)
- "Fresh sneakers — yours by October 2027 · yield chips in $33 of the $180 · vs $123,000 in a typical 0.5% savings account" — depressing pace, irrelevant comparison (the $123k line is a defect being fixed separately).
- Claude subscription at $10/month → "covered by 2030" — demoralizing.

Root cause is the FRAMING, not the math: v2 treats small goals as miniature savings plans ("save up slowly for sneakers" = poverty framing). Nobody saves 2 years for sneakers. The crypto-native, motivating frame is the reverse:

## 2. The flip: yield buys the item, principal survives
**"Buy it outright and the money's gone. Garden it and you keep the money AND get the thing."**
For in-reach goals the user doesn't accumulate toward the price — they deploy CAPITAL whose YIELD pays the price. The item arrives "free" in the only sense that matters emotionally: net worth doesn't drop. This single sentence is the product's conversion engine; every screen of the target/subscription flow must serve it.

## 3. Honest math (the engine; formulas in words, numbers from live pools only)
Let P = item price, r = blended net APY of the plan's pools (degen persona keeps its ⅓ haircut), C = lump capital, M = monthly top-up.
- Lump only: cumulative yield after t years ≈ C·((1+r/12)^(12t) − 1). Time-to-item solves for the first month where cumulative yield ≥ P.
- Installments: balance compounds with monthly deposits; cumulative YIELD (balance minus deposits) must reach P. Same solver.
- Capital-needed-by-deadline: given deadline t, solve C so cumulative yield ≥ P (simple inversion of the above).
- Forever number (subscription with monthly bill B): C where C·r/12 ≥ B.
Reference points the implementer MUST reproduce within ±5% (at the stated r):
- iPhone P=$1,100, r=6%: lump $10,000 → ~22 months (≈Apr 2028). Capital needed for a 5-month deadline → ~$44,000. At r=10% → ~13 months / ~$26,000.
- Claude B=$20/mo, r=5.5% → forever number ≈ $4,364. Spotify B=$12 → ≈ $2,618.
- These confirm the brutal truth: near deadlines need big capital at honest rates. The product NEVER fudges this — it makes the trade-off itself the interactive toy (see §5).

## 4. New input flow for in-reach goals (replaces "monthly amount" step)
After picking an in-reach item (sneakers / iPhone / Claude):
1. "How do you want to fund it?" — two warm cards:
   - DEFAULT: "I have money that could work" → "How much could you put to work?" chips $1k / $2.5k / $5k / $10k / $25k + custom. (Capital-first IS the script flip.)
   - "I'll build it monthly" → existing small monthly chips ($10–$100). Kept for low-capital users; the engine then shows time-to-item from accumulating yield AND flags the hybrid option (§6).
2. Optional deadline (TARGET only): "When do you want it?" chips: No rush (default) / 6 months / This year / Pick a date. SUBSCRIPTION skips deadline entirely.
No horizon question in either path (already true in v2).

## 5. The TARGET bloom rebuilt — the trade-off triangle
Hero (capital-first, feasible): "Park $10,000 — your iPhone pays for itself by April 2028. **And you keep the $10,000.**"
Below the hero, the interactive core: three coupled controls — capital slider, deadline, persona pills — where touching any one re-solves the display live. Always show the PERSONA LADDER as three simultaneous dates so the risk/speed trade-off is visible at a glance, e.g.:
  Established stables → Apr 2028 · RWA & fresh → Jul 2027 · Degen LPs* → Jan 2027 (*projected at ⅓ haircut — farm rates decay)
Deadline pressure honesty: if the chosen deadline requires rates above the persona's honest ceiling, never fudge — render the truth as the content: "No honest pool gets you there by November. What's real: $26k by November in RWA, or your $10k by July 2027." The feasibility ladder IS the answer, not an error state.
Scale-matched comparisons (replace the bank line):
- vs credit card: "financed at 24% APR over a year, these sneakers cost ~$204 — gardened, they cost $0 of your principal."
- vs buying outright: "spend $1,100 today and it's gone. Garden it and November-you has the iPhone AND the money."
Progress visual: the item grows in, not a number — progress bar themed as the item filling (emoji-scale), "your iPhone is 34% grown."
Tangibility line (small, persistent): yield-as-units — "right now your garden grows ≈ $2.10/day — a coffee every other day." Unit examples: coffees ($4.50), Claude subs, the item itself.

## 6. Hybrid mode ("the permanent discount")
When capital+deadline can't meet P honestly, or monthly-path users want the item sooner: "Your garden covers $X (N%) by then — you top up the rest. Think of it as a permanent N% discount your money earns you." Recurring items (subscription archetype) lead with discount framing whenever C < forever number: "you're 43% of the way to free-Claude."

## 7. SUBSCRIPTION mode — the ladder (the repeat-engagement engine)
- Hero when C ≥ forever number: "Your money pays for Claude. Forever. Starting now." (Instant-win celebration beat.)
- Hero otherwise: forever number front and center + progress: "43% of the way to free-Claude · at +$100/mo you cross in May 2027."
- THE LADDER (decided: everyday-bills): recurring costs with their forever numbers, cheapest first — 🎵 Spotify $12/mo (≈ $2.6k) → 🍿 Netflix $18/mo (≈ $3.9k) → 🤖 Claude Pro $20/mo (≈ $4.4k) → 🏋️ Gym $40/mo (≈ $8.7k) → 📱 Phone bill $70/mo (≈ $15.3k). Each rung shows locked/unlocked state from the user's capital; rungs unlock as the garden grows; each unlock is a share-worthy milestone ("My yield pays my Claude now 🤖💸"). A progression system with no dark patterns — every rung is real math.
- Rung prices are constants in one named config (price + label + emoji), trivially editable. Forever numbers always recompute from the live blended rate, never hardcoded.

## 8. Conversion-angle catalog (apply in this priority)
1. Keep-your-principal headline (§2) — on every target/subscription hero.
2. Persona ladder with honest dates (§5) — the trade-off as a toy.
3. Forever numbers + subscription ladder (§7) — repeat visits + shares.
4. Scale-matched comparisons: credit-card cost and money's-gone (§5). Never a mismatched bank number again.
5. Yield-as-units tangibility line (§5).
6. Item-fill progress visual (§5).
7. Hybrid permanent-discount framing (§6).
8. Share cards 2.0 for the new heroes: "My iPhone is buying itself — by April 2028 🤯" + plan URL (existing share/URL mechanics; new copy + the item emoji prominent).
9. Honest urgency only: "start this month → ready by Apr 2028; start in 3 → Jul 2028." A factual shift, not a countdown. NO fake scarcity, NO decay countdowns.
10. Copy ban-list for in-reach goals: "save up", "afford", "budget" — the garden buys it; the user just plants.

## 9. What does NOT change
- GROWTH archetype flow, bloom, bank comparison (correct at that scale).
- Trust rails, pool curation, personas/filters, degen haircut, presets/stories, share/URL plumbing, My Garden report mechanics (report copy should adopt the new heroes for target/subscription plans).
- The free-text provider interface.

## 10. Verification scenarios (must pass; rates read live, so assert structure + plausibility, and assert exact dates only with a stubbed r)
1. iPhone, capital-first $10k, no rush, stables: hero is a keep-your-principal sentence with a month+year; persona ladder shows 3 dates ordered stables ≥ RWA ≥ degen; with r stubbed to 6% the date is ~22 months out (±1 month).
2. iPhone, deadline "6 months", $10k, stables: feasibility ladder renders (no fudged date), shows capital-needed (~$44k at 6% stub ±5%) and the honest alternative date.
3. Sneakers, monthly path $50/mo: hybrid/discount framing present; NO bank comparison line; credit-card comparison line present and scale-correct.
4. Claude, $5,000 capital, stables (r stub 5.5%): instant-win hero (5,000 > 4,364); ladder shows Spotify+Claude unlocked, Netflix bundle locked with progress %.
5. Claude, $1,000 capital: progress % to forever number + "+$100/mo crosses in <month year>" line.
6. All five: 360px, dark mode, KO strings present, reduced-motion skips item-fill/count-up animation, share card renders the new hero copy.
7. Regression: GROWTH bloom unchanged (snapshot vs current), presets and shared URLs still work.
