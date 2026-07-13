# 069 build notes — degen-haircut-honest spotlight packs (first 3 live)

Branch: `claude/dazzling-ride-ms64lp`. No commits/pushes made (orchestrator ships after verification).

## Code change — degen-haircut honesty (generator-side only)

`generate-spotlight.js` only (no planner.js/app.js/translations.js touched):

- `buildPack`: added `const effApy = persona === 'degen' ? apy / 3 : apy;` — mirror of
  planner.js:657 `effectiveApy` / planner.js:1354-1357, keyed on this script's own
  `classifyPersona` result (the degen band is the one the planner tags `degenHaircut`).
  `foreverAmt = foreverNumber(monthly, effApy)` — still the imported planner.js
  `foreverNumber`, never reimplemented; now fed the haircut rate so a degen pack's claimed
  capital matches what its own linked garden renders (the planner haircuts before the same
  call). Identical result for stable/rwa (haircut is a no-op there).
- Pack additive fields: `effectiveApy` (number) + `effectiveApyStr` (formatApy). `apy`/`apyStr`
  UNCHANGED (still HEADLINE — the live fact). `canvaFields.effectiveApy` (string) added. No
  existing field renamed/removed.
- Tweet draft: degen persona only, funding line now reads
  `Projected at ⅓ of today's rate (farm rates decay), that still runs a $20/mo Claude Pro sub, forever.`
  — carries the ⅓ framing AND "farm rates decay". Stable/rwa funding line byte-identical to
  pre-069 (`Parked here, that's enough to run a $X/mo <goal> sub, forever.`).
- Share-card PNG: degen persona only, one caveat line `projected at <effectiveApyStr> (⅓ of today's rate)`
  in the existing secondary text style (`COLORS.textSecondary`, `500 26px sans-serif`) under the
  APY number; TVL/framing lines shift down only in the degen branch. Stable/rwa cards render
  byte-identically (verified visually — pareto-credit card has no caveat line, TVL at pad+385,
  framing at pad+440, exactly the pre-069 layout).
- Header/inline comments updated minimally to document the changed pack semantics.

Trust rails untouched: `APY_SANITY_LIMIT=1000`, `DEFAULT_MIN_TVL=10000000`, Curve ceiling all
unchanged. The haircut is applied on top of the existing rails, never instead.

## Exact haircut wording chosen

- Tweet (degen): `Projected at ⅓ of today's rate (farm rates decay), that still runs a $<monthly>/mo <goal> sub, forever.`
- Card (degen): `projected at <effectiveApyStr> (⅓ of today's rate)`

## Packs produced (3 distinct protocols, one per persona class)

Picked from `rankCandidates` on live DefiLlama data (15,419 pools; ranked 382 qualifying
small-enough candidates), preferring genuinely small, collaboration-keen protocols with a real
X handle and a meaningful yield for the forever-number frame.

| Persona | Protocol | Symbol | Chain | Pool id | Headline APY | Effective APY | TVL | foreverAmt |
|---|---|---|---|---|---|---|---|---|
| stable | pareto-credit | USDC | Ethereum | 2eb2bdf8-c3e3-5b30-8d49-8d5232294184 | 8.31% | 8.31% | $153.34M | $2.9K |
| rwa | yo-protocol | USDC | Base | 1994cc35-a2b9-434e-b197-df6742fb5d81 | 4.06% | 4.06% | $10.13M | $5.9K |
| degen | project-x | WHYPE-USDC | Hyperliquid L1 | f55a970c-7fdb-4087-8c62-258287e7a6cd | 20.10% | 6.70% | $14.31M | $3.6K |

All three persona classes achieved. Degen pack demonstrates the haircut end-to-end: headline
20.10% → effective 6.70% (÷3), foreverAmt $3.6K computed at 6.70% (not the ~$1.2K a headline
basis would have implied), tweet + card carry the honesty statement.

### Selection reasoning / minor deviations

- **stable = pareto-credit ($201M aggregate protocol TVL), not the strictly-smallest-agg
  stable candidate.** Smaller-agg stable candidates existed but were rejected as poor spotlight
  material: `sdai` (agg $66M) is a token-wrapper DefiLlama entry, not a protocol with a real
  collaboration handle to tag; `tectonic` (agg $99M) pays only 0.12% APY, which makes a weak
  "runs your sub forever" forever-number. pareto-credit is a genuine small credit protocol with
  a real team/handle and a strong honest 8.31% yield. This honors the human directive's intent
  ("collaboration-keen smaller teams") over a literal agg-TVL sort; still far under the Curve
  ceiling. Documented per spec ("take the next-best distinct-protocol candidate and document it").
- **degen = project-x** is the smallest-aggregate-TVL degen candidate ($14.31M agg) — a genuinely
  small protocol on a newer chain, best fit for both the small-protocol directive and a vivid
  haircut demonstration.
- **rwa = yo-protocol** is the 2nd-smallest-agg rwa candidate with a real yield (USDC 4.06% on
  Base, agg $10.13M); the smallest (`nostra-pools`, 0.00% APY) was skipped as a zero-yield pool.

Live APY/TVL differ trivially from the pre-generation ranking snapshot (rates drift between the
scouting fetch and the generation fetch) — each pack records whatever was live at its own
generation time, which is the intended behavior.

CADENCE.md regenerated: covered=3, 5 next candidates listed.

## Tests

New file `test_spotlight_packs.js` (added to package.json test chain after `test_spotlight.js`):
- Fixture-driven: degen pool → foreverAmt ≈ monthly*12/((apy/3)/100) within tolerance,
  effectiveApyStr present, tweet contains ⅓ + "farm rates decay"; stable pool → foreverAmt from
  headline apy (effective == headline), tweet contains NO haircut wording; degen card renders a
  valid 1200x630 PNG.
- Committed-output validation: every `spotlights/*/pack.json` parses; `apy ≤ 1000`; `tvl ≥ $10M`;
  shareUrl parses and carries goal/monthly/pace/chain/token/src=x_spotlight/ref; effectiveApy and
  foreverAmt self-consistent against the pack's OWN recorded rate + persona (degen → apy/3 basis),
  never live rates; sibling card.png exists, non-empty, 1200x630 PNG; ≥3 distinct protocols.

`test_spotlight.js` NOT modified: its `good-1` fixture (USDC, $15M TVL, 9.5%) classifies as
**rwa** (TVL < $50M so not stable; APY ≤ 20 so rwa), where the haircut is a no-op, so its existing
`foreverNumber(monthly, apy)` assertion still holds unchanged.

### Results (each command timeboxed 5 min)

Ran green individually:
- `test_spotlight.js` — 38 assertions passed
- `test_spotlight_packs.js` — 11 assertions passed (7 fixture + 4 committed-pack, incl. the 3 real packs)
- `test_spotlight_url.js` — 3/3 (fixture-fallback mode, as documented)
- `test_spotlight_attribution.js` — 3/3 (fixture-fallback mode)
- `test_planner.js` — 208 assertions

Full `npm test` chain (300s timebox): halted at `test_smoke.js` (6th file), which **fails for a
PRE-EXISTING sandbox reason** — `net::ERR_CONNECTION_RESET` loading React/Babel from unpkg.com and
pool data from yields.llama.fi. Browser-originated HTTPS to those hosts is blocked at the proxy
connection level in this sandbox (NORTH_STAR.md 2026-07-12). Unlike the spotlight Playwright tests,
`test_smoke.js` has NO vendored-React/route fallback (confirmed: 0 `page.route`/`unpkg` refs), so it
hard-fails here regardless of any diff. This diff touches only `generate-spotlight.js`, the test
chain in `package.json`, `spotlights/`, and the new test file — none of which `test_smoke.js`
exercises (it drives home.html/app.js/PoolDetail.js in a real browser). The `&&` chain stops there,
so files after `test_smoke.js` did not run in that single invocation; the spotlight + planner files
among them were run and verified green individually above.

Chain files that ran green before the halt: test_planner (208), test_protocol_parsing,
test_qualifier_fix, test_compiled_assets (4), test_minified_assets (7).

## Constraints honored

No new dependencies (`npm install` only pulled existing lockfile deps). Changes confined to
`generate-spotlight.js`, `package.json` (test chain only), `spotlights/`, `test_spotlight_packs.js`,
and this notes file. All money/number formatting via existing `formatUsd`/`formatApy`. No commit/push.
