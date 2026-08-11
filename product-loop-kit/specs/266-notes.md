# 266 — build notes

Branch `claude/loop-266`, base `a288be1443`. **THREE attempts, three verifier FAILs — item PARKED at the
attempt budget** (NORTH_STAR.md Budgets: max 3, then park with notes; build.md §4). Operator (Opus 5)
wrote the spec and judged; implementation by a dispatched Sonnet 5 agent per the 2026-07-13
execution-model split.

## Why this is PARKED, and what is actually true about the work

**The product fix is correct and independently verified three times over.** Every round confirmed, by
rendered Chromium against the registered tool: both rails read from `window.TRUST_RAILS`, total APY =
`apyBase + apyReward`, the row mirrors `api-core.js`'s `projectPool()`, both router paths render, rail
values unchanged everywhere, and the runtime-mutation proof (a literal-equal copy cannot pass) holds.
Round 3's own measurement: on live data the new filter passes **7,329 vs the old 7,328**, blocking zero
pools the old code admitted; the single newly-admitted pool (`TAPT`, `apy 1016.65`, both components null,
TVL $157,873) is admitted because its derived total is 0 — which is exactly what `api-core.js:92`
`isAnomalous()` does. Convergence on canon, not a rail hole.

**What is not finished is the GUARD, and the guard is the half that justified the item.** Three rounds
found three successive bypasses of Leg B's scanner, each demonstrated end-to-end with the full gate green
on the real file:

| round | construct that stayed green | fixed? |
|---|---|---|
| 1 | `var MIN_TVL = 100000; var tvl = p.tvlUsd; if (tvl < MIN_TVL)` — aliased constant | yes (value-based predicate) |
| 2 | `` var MIN_TVL = Number(`${100000}`) `` — template interpolation, **while the file's header comment asserted this could not happen** | yes (stack tokenizer) + `100_000`, `0x186A0` |
| 3 | `var reQ = /'/g; var MIN_TVL_X = 100000;` — **regex literal**; the `'` opens a phantom string blanking 7 following lines | NO — budget exhausted |

Shipping now would merge a gate whose own documentation claims coverage it does not have — the exact
stated-vs-applied failure this item exists to eliminate, for the third time. That is the parking reason,
stated plainly: **not that the fix is wrong, but that the guard is not yet what the docs say it is.**

Sized honestly: the masker is currently **in sync across the whole live population** (a synthetic
`100000` probed into the tail of all 7 inline scripts across `home.html` + `plan.html` was caught in all
7), so the "0 hits" reading is real today. The exposure is future: a regex literal added later can hide
pre-existing violations downstream of it.

**Unparking recipe** (one small task, already scoped by the verifier): teach `maskStringsAndComments()`
regex literals — recognise `/` in regex-allowed position, consume to the unescaped closing `/` including
character classes, mask contents like a string — and add a self-defeat case using `t.replace(/'/g, "")`
followed by a rail literal. Alternative if that proves fiddly: record it as measured residue with a
test case that asserts the construct is NOT reported, exactly how `50000 * 2` is handled today.

## A fourth bypass, found at commit time by the operator — and the lesson is about the POPULATION

After the third verification round, staging the diff (`git add -A`) turned the gate **red**:

```
✗ Leg C unrelated-name residue: ... zero found today
  found an unrelated-name mirror the family scan cannot see: ["test_webmcp_rail_derivation.js: MAX_SANE_RATE"]
```

Leg C's population is `git ls-files '*.js'`, which **does not list an untracked file**. Every green run
in this item — the builder's and all three adversarial verification rounds — was therefore measured
against a population that silently excluded *the file under test*. Nothing was wrong with the assertion;
the population it drew from was one member short of reality, and the missing member was the scanner
itself. Fixed by excluding this one file by role (it names rail constants as *data* — probe lists,
self-defeat fixtures — never as declarations the product reads), the same way `trust-rails.js` is
excluded as the source rather than a mirror, with an assertion pinning the exclusion at exactly one file
so it cannot grow into a general allowlist.

Worth carrying forward, because it generalises past this item: **a gate that derives its population from
version control cannot see itself until it is committed**, so "green before commit" and "green after
commit" are different claims. Verify the staged tree, not the working tree.

## Round 3's second finding — a live drifted rail this item did not fix

`tools/test-agent-tools.js:127-128` applies `x.tvlUsd < 10000000` (the **pre-`6fceca79bb` $10M floor**)
and `x.apy > 1000`, and prints "All pools strictly respect TVL >= $10M and APY <= 1000% rails". A fourth
hand-typed copy, already drifted, in a tracked file, covered by no guard —
`test_agent_surface_rail_claims.js` globs `tools/*.json` but not `tools/*.js`. It also falsifies this
spec's "the only member with no name, no mirror-discipline comment, and no test" claim, corrected in
`266.md`. **Filed as backlog row 270.**

## Attempt 2 — what the verifier caught, and what it cost

The verifier FAILED attempt 1 with 10/11 criteria met and six findings. Two were real defects in the
shipped work, and both are the kind that a self-graded run would have shipped:

1. **The gate was narrower than the class it advertised.** Leg B's predicate required a *dotted* pool-field
   access immediately compared to a numeric literal. The verifier added a second WebMCP tool to
   `home.html` containing `var MIN_TVL = 100000; var tvl = p.tvlUsd; if (tvl < MIN_TVL) return false; if
   (tvl < 100000) return false;` and **the full gate stayed green** — two brand-new hand-typed rail
   copies on the sacred surface, invisible to all three legs (Leg A only executes `search_yield_pools`;
   Leg C's population is `git ls-files '*.js'`, so a constant declared inside an inline script is
   invisible to it too). The PR's claim that this item "puts a gate over the class so the next copy
   cannot arrive quietly" was therefore false as written. Fixed by widening Leg B to a
   **LHS-shape-agnostic value predicate**: any bare numeric literal whose *value* equals a
   `trust-rails.js` value, anywhere in an inline `<script>`, with strings/comments masked by a
   single-pass tokenizer. (The two-pass version the agent wrote first had a real bug worth recording:
   `fetch("https://yields.llama.fi/pools")`'s `//` inside a string read as a line-comment start and
   desynced the string tracker for the rest of the file — a scanner that silently corrupts itself is
   exactly the vacuity this leg exists to prevent.) Measured hit count on the unmodified repo: **0**.
   Three self-defeat cases now cover the bare comparison, the verifier's aliased-constant construct, and
   a destructured/bracket variant.
2. **The fix introduced a wrong number while claiming parity with api-core.** Attempt 1 overwrote the
   result row's `apy` key with the computed total and coerced `null → 0` on `apyBase`/`apyReward`, while
   the spec and PR both claimed the row "mirrors `edge/api-core.js`'s enrichment shape". `projectPool()`
   (`api-core.js:376-390`) does neither: it preserves `null` and exposes the total under a separate
   `totalApy` key. The verifier measured the live cost — **185 above-floor pools (2.5% of 7,350, median
   `apy` 6.05%) carry both `apyBase` and `apyReward` null with a positive `apy`**, and were being
   reported as `{apy: 0, apyBase: 0, apyReward: 0}` and dropped by any `minApy > 0`. Leg A's fixture
   always supplied numeric values, so this member of the population was never tested. Fixed to mirror
   `projectPool()` exactly, with a new Leg A fixture pool drawn from that 185-pool shape asserting the
   nulls survive and that `minApy: 5` excludes it (api-core's own null-as-0 semantics, asserted rather
   than hidden).

The other four findings were documentation defects, all fixed: a `Filed as backlog row 269` claim that
had not been filed yet (row 269 now exists); `≈7,900 generated pages` misapplied from spec 261 — that is
the count of generated `.md` twins, the HTML count is **4,324** (corrected in four documents); a spec
claim that `search_yield_pools` "appears in exactly one file repo-wide" falsified by `edge/MCP.md:254-268`,
**which still described the pre-fix hardcoded-literal behaviour in the present tense** and is corrected in
this same diff (leaving it would have re-created this item's own stated-vs-applied mismatch, inverted);
and stale Leg C counts in these notes (19/13 → 21/15).

**Verifier's own measurement worth keeping**: on today's live data the new filter admits **one more** pool
than the old one (7,336 vs 7,335) and blocks **zero** that the old code let through — the spec's headline
`apyBase 600 + apyReward 600` scenario has **0 live instances right now**. The defect was real and the
fix is right, but its present-day blast radius is one pool, and saying so is more useful than implying
the surface was leaking anomalies today.

## Spec written this run

No spec file existed for 266 — the item was filed by item 228's verifier as a BACKLOG row only. `specs/266.md`
was written from documented evidence (the row, NORTH_STAR.md's risk policy, `trust-rails.js`'s own header,
`specs/261.md`, `playbooks/derived-number-rails.md`) and re-verified line by line against `main` @ `a288be1443`
before any code was written. Two corrections to the row's evidence came out of that pass, both recorded in the
spec rather than silently inherited:

- The row says the WebMCP surface is live "on `/` and `plan.html`". `grep -n modelContext plan.html` → **zero
  hits**. `plan.html` loads `trust-rails.js` (`plan.html:93`) but registers no tools. The block exists in
  exactly one file (`home.html`), and `search_yield_pools` appears in exactly one file repo-wide.
- The row's line numbers (`home.html:269-270`, `:246-249`, `:227-343`) were all confirmed accurate.

## Deviations from the spec, and the conservative choice

1. **Leg C's population is much larger than the spec's illustrative count.** The spec's Evidence section
   enumerated "7 named-constant mirror declarations" from a grep and wrote "8 sites today" into the acceptance
   criterion. Derived at test time, the real population is **21 declarations across 15 files** (it was 19/13
   before the name-family widening in deviation 4 added `PoolDetail.js` and `PoolDetail.compiled.js`) — the
   spec's example list omitted `generate-pools-snapshot.js`, `generate-sitemap.js`, `generate-stories.js`,
   `generate-token-pages.js` and `app.compiled.min.js`. The test enumerates what is really there (the spec's own
   instruction was "derive it, never hardcode"), and the spec's numbers were corrected after the fact rather than
   the test being trimmed to match a stale example. The acceptance assertion is written as `>= 8`, not `=== 19`,
   so a new mirror added tomorrow widens the population instead of failing the gate on a count.
2. **The `require()` fallback is scoped to `*.min.js` only.** `planner.min.js` is the load-bearing case: Terser
   strands the constant's name from its value (only the export key `APY_SANITY_LIMIT:r` survives textually), so
   no text pattern can resolve it and `require()`-ing the UMD-guarded artifact is the only way. A first attempt
   that `require()`d any file mentioning the name pulled in ~40 `test_*.js` files that execute their suites on
   require with no `require.main === module` guard — unsafe, and reverted.
3. **Two safety nets beyond the letter of the spec**, both because "fail loudly rather than skip silently" is
   only real if it is a mechanism: a comment-aware unanchored loose scan cross-checked against the anchored
   primary scan (catches a declaration shape the anchored regex doesn't recognise, e.g. `exports.NAME = 1000`),
   and a standalone-vs-property-access distinction for `.min.js` (without it, `translations.min.js`'s legitimate
   `TRUST_RAILS.DEFAULT_MIN_TVL` *property read* — a derived reference, exactly what we want — was flagged as a
   stranded declaration).
4. **Leg C widened mid-build from an exact name to a NAME FAMILY** (`APY_SANITY_LIMIT[A-Z0-9_]*` /
   `DEFAULT_MIN_TVL[A-Z0-9_]*`) — see the finding below. The spec's residue paragraph (a) had claimed "no such
   site exists today"; that claim was false, and the response was to close the shape, not to re-word the residue.

## What the build FOUND that the spec got wrong

`PoolDetail.js:297` (and its generated twin `PoolDetail.compiled.js:281`) declares
`const APY_SANITY_LIMIT_LOCAL = 1000; // mirror of app.js constant`, read at `:305`, `:313` and `:391`. That is
a rail mirror under a **different name** — the exact shape spec 266's residue (a) described while asserting
"the count of uncovered known sites is 0". It was **1**, on the pool-detail page, the north-star leg-(B)
surface. Found by the implementing agent while building Leg C's population logic, disclosed in its report, and
closed in the same commit by widening Leg C to the name family rather than by editing `PoolDetail.js` (its value
is correct today; converting the constant to a derived read is a pool-detail render-path change with its own
risk, and Leg C now fails loudly the moment it drifts). The spec's residue paragraph was corrected to say this.

## Found and deliberately NOT fixed

- **`home.html`'s second WebMCP tool answers every agent with an invented rate.**
  `calculate_savings_projection` hardcodes `var apy = 5.5;` — no provenance, no live-data path — and reports it
  back as `estimatedApy`. On a product whose stated principle is "nothing is invented", this publishes a
  fabricated number to the audience that cannot see the code. Out of scope for 266 (which is about rails the
  surface *applies*, not numbers it *invents*), and widening the diff on the IA router to chase it would have
  been exactly the scope creep build.md forbids. **Filed as backlog row 269** with the evidence, the
  weakest-fix options (derive the blended rate from the pools the sibling tool already fetches, or call item
  227's `/api/blended-rate`; failing both, report no rate rather than a fake one) and a rendered acceptance
  criterion.
- `planner.js:19`'s named mirror stays a literal. Leg C guards its value in both directions; converting it to a
  runtime `window.TRUST_RAILS` read is a planner-surface change with its own risk and no evidence of drift.

## Class status, stated honestly

**Partially closed.** Closed: the applied-rail predicate class on browser-inline surfaces (Leg B, 2 root HTML
documents globbed at test time) and the named-mirror equality class across tracked `*.js`, now including
suffixed name variants (Leg C). **Still open**: (a) a mirror under a completely unrelated name (`MAX_SANE_RATE`
and similar) — the family scan cannot see it; measured count of such sites today: 0, and that is a measurement,
not an assumption; (b) rail predicates inside the 4,324 CI-generated HTML pages under `tokens/` (2,076),
`chains/` (86) and `ko/` (2,162) — `pools/` and `spotlights/` carry zero tracked HTML — outside Leg B's
root-only glob, regenerated from `trust-rails.js`/live data every run; **(d) one numeral spelling Leg B's
value scan cannot resolve: arithmetic composition** (`var MIN_TVL = 50000 * 2;`, measured NOT reported).
Evaluating expressions is out of scope for a literal scan and this test deliberately does not do it. The
other spellings the verifier proved green in round 2 — numeric separators, hex/octal/binary, and
template-literal interpolation — are **caught** as of attempt 3; (c) which surfaces read DefiLlama's raw
`apy` field instead of `apyBase + apyReward` beyond this one
— item 259's territory, untouched here.

## Verification

See `266-pr.md` for the full command table and the non-vacuity transcript (three legs neutered separately, plus
a fourth proof for the name-family widening, each restored byte-identically and proven with `md5sum`).
