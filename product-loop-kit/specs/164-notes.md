# 164-notes — the audit now renders the planner's bloom/checkout screen, the first computed number it has ever seen

## What I built

One new surface `kind: 'bloom'` in `audit-app.js`'s driver (`main()`), five new
surfaces in the default rotation appended after `planner-ko`, and one
interactive check added to the existing `planner` kind. No new detector
vocabulary, no product file touched.

### 1. `kind: 'bloom'`

Loads a deep-linked plan URL (the same share-plan shape
`test_plan_checkout_cta.js` already proves reaches the checkout panel) and
audits the rendered bloom/checkout screen:

- `dead-end` **P1** — `.gp-checkout-panel` does not render within 15s
  (`waitForSelector`/`pollFor`, never a bare `waitForTimeout`).
- `number-sanity` **P0** — the existing `auditText()` over rendered
  `innerText`. This is the check that carries the item: it is the first time
  `scanNumbers()` has run against a NUMBER the planner actually computed
  (capital, forever number, projections, checkout price), not just static
  goal-chip labels.
- `dead-cta` **P1** — `.gp-checkout-cta` (the bloom primary control) renders
  and is visible.
- `page-error` **P0** — the existing `makeErrorSink()`.
- `responsive` — 360 surface only (`plan-bloom-360`), via the existing
  `checkResponsive()` against `.gp-checkout-cta`.
- `i18n` **P2** — `-ko` surface only (`plan-bloom-ko`), reusing the identical
  "KO surface rendered no Hangul text" check already used by the `pool` and
  `planner` drivers.

### 2. Five surfaces appended after `planner-ko`

| name | url | width | notes |
|------|-----|-------|-------|
| `plan-bloom-growth` | `/plan.html?goal=retirement&pace=stable&monthly=500&years=10` | 1280 | GROWTH archetype |
| `plan-bloom-target` | `/plan.html?goal=iphone&pace=stable&monthly=200` | 1280 | TARGET — item 146's exact goal (146 already SHIPPED/fixed 2026-07-26; see "Findings" below) |
| `plan-bloom-subscription` | `/plan.html?goal=claude&pace=stable&monthly=50` | 1280 | SUBSCRIPTION — forever-number path |
| `plan-bloom-360` | GROWTH url | 360 | responsive |
| `plan-bloom-ko` | GROWTH url + `&lang=ko` | 1280 | i18n |

Placed after `planner-ko` — verified no existing `surfacesCovered` entry
moved, renamed, or reordered (A2 evidence below).

### 3. Interactive check on the existing `planner` kind

Scoped to `s.width > 360 && !s.ko` (the 1280/EN surface only — one flake
surface, not three, per the spec's own instruction). After the existing
visibility check on `.gp-chip`, the check now also **clicks** the first goal
chip and asserts the planner leaves the goal step, via `pollFor` polling for
`.gp-thread-row` — `planner.js`'s `ThreadRow`, pushed into the conversation
thread only when `step !== 'goal' && answers.goal` (planner.js:4376-4377), a
truthful rendered DOM signal that exists only past the goal step, not
internal React state. Emits `dead-cta` **P1** on an 8s timeout.

I restructured the existing chip-visibility check from a bare `if (...) push
finding` into an `if / else if` so the click only fires when the chip is
actually there and visible (clicking a non-existent/hidden locator would
throw inside the branch, masking the real finding with a `driver threw:`
page-error instead of the intended, more specific `dead-cta`).

## Real selectors used, and where I found them

No class name was invented — every selector below is read off `planner.js`,
several already proven by `test_plan_checkout_cta.js`'s passing assertions:

- `.gp-checkout-panel` — `planner.js:2975` (`e('div', { className:
  'gp-checkout-panel gp-animate-in' }, ...)`), the same selector
  `test_plan_checkout_cta.js:124` (`gotoPlan()`) already waits on as bloom
  readiness.
- `.gp-checkout-cta` — `planner.js:3006` (pool-primary `<a>`) and `:3013`
  (waitlist-fallback `<button>`) — both share this class
  (`'gp-primary-cta gp-checkout-cta'`), confirmed by reading the ternary at
  `planner.js:3004-3015`. `test_plan_checkout_cta.js` asserts on this exact
  class throughout (its own `.gp-checkout-cta` locator).
- `.gp-bloom` — `planner.js:3070`/`:3084`, the outer wrapper both
  subscription and target/growth layouts return. Not used directly as the
  readiness selector (`.gp-checkout-panel` is the more specific, already-
  proven-working one — same choice the spec's own wording offers ("`.gp-bloom`
  / `.gp-checkout-panel`")).
- `.gp-thread-row` — `planner.js:1359-1369` (`ThreadRow` component's
  `className: 'gp-thread-row' + ...`), pushed at `planner.js:4376-4377`
  (`if (step !== 'goal' && answers.goal) { thread.push(e(ThreadRow, {key:
  'g', ...})) }`) — read specifically to find a signal that exists ONLY past
  `step === 'goal'`, per the spec's explicit instruction not to assert on
  internal React state. Confirmed the thread container itself only omits
  rendering at `step === 'bloom'` (`planner.js:4836`: `(step !== 'bloom' &&
  thread.length) ? e('div', {className:'gp-thread'}, thread) : null`) — since
  `pickGoal()` never advances directly from `goal` to `bloom` for any
  archetype (subscription → `temperament`; target → `funding-mode`; growth →
  `monthly`; see `planner.js:4260-4277`), the thread always renders after a
  goal-chip click, so `.gp-thread-row` is a safe, truthful "advanced" signal
  for every possible first-chip archetype.
- The deep-link URL shape (`?goal=&pace=&monthly=&years=`) and its bloom
  fast-forward path — `planner.js:4246-4257` ("Shared plan fast-forward to
  bloom": requires `sharedPlan` (derived from the URL params, `planner.js
  :4146`) plus `answers.goal`/`answers.persona` plus the archetype-appropriate
  amount field, then `setStep('bloom')`) — the exact three URLs
  `test_plan_checkout_cta.js:160/219/272` already drive in real Chromium, per
  the territory notes' instruction to reuse them verbatim rather than
  inventing plan params.

## `setupRoutes()` / snapshot path — no new network path added

Confirmed `planner.js:3930-3982` (`startFetch`/`goLive`) uses the identical
snapshot-first-then-live pattern `app.js` uses (fetch `/data/pools-snapshot-
meta.json`, freshness gate, fall through to `POOLS_API` on any failure) —
`setupRoutes()`'s existing `freshMeta`/`snapshotBody`/`liveBody` routing
(already used by every other surface `main()` drives) covers the planner's
pools fetch for free. No new route was added; A1/A2's clean runs are the
proof it resolves.

## Findings the five new surfaces produced on the live product

**Zero**, across every run below (A1's five isolated runs, A2's full run, and
`test_audit_planner_flow.js`'s integration cases): no `dead-end`, no
`dead-cta`, no `number-sanity`, no `page-error`, no `i18n` miss, no
`responsive` clip on `plan-bloom-growth`, `plan-bloom-target`,
`plan-bloom-subscription`, `plan-bloom-360`, or `plan-bloom-ko`.

**Judgment — no candidate ticket filed.** The spec's own headline evidence
(item 146: `iphone`/TARGET goal misread by `mixStats()` as a monthly
subscription, fabricating ~$155k-$220k of capital) is `plan-bloom-target`'s
exact goal — I checked whether it would still reproduce and confirmed via
`product-loop-kit/LOG.md:249` that **146 already SHIPPED on 2026-07-26**
(`mixStats()` gained an `isMonthly === true` guard; verifier PASS HIGH 9/9,
independently re-derived, non-vacuity proved twice). So the clean
`plan-bloom-target` result is not the scanner missing the bug — it's the
scanner confirming the fix holds, for the first time with automated coverage
on the exact screen the bug rendered on. That is a meaningful (if
un-dramatic) result on its own: this item closes the loop 162's own notes
flagged as a real gap ("A later item extending the planner driver into the
conversation flow... is the natural way to actually catch 146's bug class
with this tooling").

## Deviations from the spec

None substantive. Two small implementation notes:

1. **Chip-visibility check restructured to `if`/`else if`** (see "Interactive
   check" above) rather than adding the click as an unconditional follow-on
   statement — a deliberate defensive choice so a missing/invisible chip
   reports the existing, more specific `dead-cta` message instead of a
   `driver threw:` from calling `.click()` on a locator with zero matches.
2. **`.gp-bloom` not used as the literal readiness selector** — the spec text
   offers `.gp-bloom` / `.gp-checkout-panel` as alternatives; I used the
   latter because it is the exact selector `test_plan_checkout_cta.js`
   already proves reaches readiness in real Chromium, so no new selector
   behavior needed re-discovery.

No CLI wiring was needed this time (162 already added `--only=`/
`--static-only` argv parsing to the `require.main` block); every A1/A3-A5
scratch run below used that existing mechanism plus `AUDIT_OUT` for the
out-path, never touching the committed
`product-loop-kit/signals/audit-findings.json`.

## A1 — five isolated `--only=<name>` runs (scratch out-paths, real Chromium)

All five: exit 0, `surfacesCovered` = exactly that one surface, `findings: []`.

```
$ AUDIT_OUT=<scratch>/a1-plan-bloom-growth.json node audit-app.js --only=plan-bloom-growth
surfacesCovered: ["plan-bloom-growth"]
findings: []

$ AUDIT_OUT=<scratch>/a1-plan-bloom-target.json node audit-app.js --only=plan-bloom-target
surfacesCovered: ["plan-bloom-target"]
findings: []

$ AUDIT_OUT=<scratch>/a1-plan-bloom-subscription.json node audit-app.js --only=plan-bloom-subscription
surfacesCovered: ["plan-bloom-subscription"]
findings: []

$ AUDIT_OUT=<scratch>/a1-plan-bloom-360.json node audit-app.js --only=plan-bloom-360
surfacesCovered: ["plan-bloom-360"]
findings: []

$ AUDIT_OUT=<scratch>/a1-plan-bloom-ko.json node audit-app.js --only=plan-bloom-ko
surfacesCovered: ["plan-bloom-ko"]
findings: []
```

## A2 — full unscoped run (path taken: it fit the 5-minute box)

`AUDIT_OUT=<scratch>/a2-full.json node audit-app.js` (no `--only`) completed
in **105s** (`real 1m45.395s`), well inside the 5-minute foreground cap.
`surfacesCovered` (26 entries):

```
text-surfaces, grid-token, pool-detail, grid-chain, dead-pool, grid-loading,
pool-detail-360, grid-360, pool-detail-dark, pool-detail-ko, landing,
planner, planner-360, planner-ko, plan-bloom-growth, plan-bloom-target,
plan-bloom-subscription, plan-bloom-360, plan-bloom-ko, static-page,
static-page:tokens/01, static-page:tokens/17dec2026,
static-page:tokens/20261231, static-page:tokens/2027,
static-page:tokens/usdt0, static-page:tokens/gtwethc
```

Programmatically diffed against `origin/main`'s committed
`product-loop-kit/signals/audit-findings.json` `surfacesCovered`
(`["grid-token","pool-detail","grid-chain","dead-pool","grid-loading",
"pool-detail-360","grid-360","pool-detail-dark","pool-detail-ko",
"static-page", <4 rotating static-page:* picks>]` — note that committed
snapshot predates 160/162 merging into it, so it doesn't yet list
`text-surfaces`/`landing`/`planner*` either; not this item's regression):
every non-rotating name from `origin/main`'s list is present in my run **in
the same relative order** (`missing from mine: []`, `order preserved: true`
— checked pairwise programmatically, not eyeballed). Nothing renamed,
nothing reordered, nothing dropped.

The run's 5 findings are **all pre-existing** (148/154/157 territory, the
numeric-slug `junk-slug` class on `tokens/01.html` etc.) — verified none of
them has `surface` equal to any of the five new `plan-bloom-*` names, or to
`landing`/`planner*`/`text-surfaces`:

```json
[
  { "surface": "static-prescan", "check": "static-prescan:junk-slug", "severity": "P1", "detail": "7 of 2221 static SEO pages match junk-slug — examples: tokens/00, tokens/01, tokens/17dec2026, tokens/20261231, tokens/2027, tokens/67, tokens/8oct2026" },
  { "surface": "static-page:tokens/01", "check": "junk-slug", "severity": "P1", "detail": "rendered <h1> is junk: \"01 DeFi Yields\"" },
  { "surface": "static-page:tokens/17dec2026", "check": "junk-slug", "severity": "P1", "detail": "rendered <h1> is junk: \"17DEC2026 DeFi Yields\"" },
  { "surface": "static-page:tokens/20261231", "check": "junk-slug", "severity": "P1", "detail": "rendered <h1> is junk: \"20261231 DeFi Yields\"" },
  { "surface": "static-page:tokens/2027", "check": "junk-slug", "severity": "P1", "detail": "rendered <h1> is junk: \"2027 DeFi Yields\"" }
]
```

Confirmed the committed `product-loop-kit/signals/audit-findings.json` is
untouched by this run: `git diff --exit-code origin/main --
product-loop-kit/signals/audit-findings.json` — clean, no output.

## A3 — non-vacuity, number check

Baseline hash: `md5sum audit-app.js` → `1d8eaaf2693d5d189dc0e757c28cfe6a`.

Mutated `ABSURD_MAGNITUDE` from `1e11` to `10` (one line, `audit-app.js`'s own
detector threshold — not a product trust rail; same class of proof 162's A5
used for its own dead-end mutation). Ran `--only=plan-bloom-growth`:

```
exit: 1
surfacesCovered: ["plan-bloom-growth"]
findings: [
  { "check": "number-sanity", "severity": "P0", "detail": "astronomical value \"$500\" (|value| = 5.00e+2)" },
  { "check": "number-sanity", "severity": "P0", "detail": "astronomical value \"$80,300\" (|value| = 8.03e+4)" },
  { "check": "number-sanity", "severity": "P0", "detail": "astronomical value \"10\" (|value| = 1.00e+1)" },
  ... 11 hits total, all surface: "plan-bloom-growth"
]
```
RED — real numbers rendered on the bloom screen (the $500/mo input, the
10-year horizon, an $80,300/$61,500/$60,000 capital/projection figure) all
tripped the lowered bar, proving `auditText()`/`scanNumbers()` is actually
reading text off this new screen, not a cached/empty string.

Reverted. `md5sum audit-app.js` → `1d8eaaf2693d5d189dc0e757c28cfe6a` — byte-
identical to baseline. Re-ran `--only=plan-bloom-growth`:
`surfacesCovered: ["plan-bloom-growth"], findings: []` — GREEN, exit 0.

## A4 — non-vacuity, chip check

Mutated the chip-advance assertion's target selector:
`.gp-thread-row` → `.gp-thread-row-MUTATION-PROOF-164-A4-NONEXISTENT` (one
line, inside the new `planner` chip-advance check). Ran `--only=planner`:

```
exit: 1
surfacesCovered: ["planner"]
findings: [
  {
    "surface": "planner", "check": "dead-cta", "severity": "P1",
    "detail": "clicking the first goal chip (.gp-chip) did not advance the planner past the goal step (.gp-thread-row) within 8s"
  }
]
```
RED — exactly the new check, nothing else (the chip itself is still
visible/clickable — only the post-click assertion target was broken, proving
this is the click-and-advance check firing, not the pre-existing
chip-visibility check).

Reverted. `md5sum audit-app.js` → `1d8eaaf2693d5d189dc0e757c28cfe6a` — byte-
identical. Re-ran `--only=planner`: `surfacesCovered: ["planner"], findings:
[]` — GREEN, exit 0.

## A5 — non-vacuity, dead-end check

Mutated `plan-bloom-growth`'s `url` field to
`/plan-MUTATION-PROOF-164-A5-nonexistent.html?...` (the driver's own surface
definition — `plan.html` itself was never touched). Ran
`--only=plan-bloom-growth`:

```
exit: 1
surfacesCovered: ["plan-bloom-growth"]
findings: [
  {
    "surface": "plan-bloom-growth", "check": "dead-end", "severity": "P1",
    "detail": "bloom did not render .gp-checkout-panel within 15s"
  }
]
```
RED — exactly one `dead-end`, nothing else.

Reverted. `md5sum audit-app.js` → `1d8eaaf2693d5d189dc0e757c28cfe6a` — byte-
identical. Re-ran `--only=plan-bloom-growth`: `surfacesCovered:
["plan-bloom-growth"], findings: []` — GREEN, exit 0.

All three mutations used the SAME baseline hash and were applied/reverted
one at a time, sequentially, each independently confirmed byte-identical
before the next was applied.

## A6 — `test_audit_planner_flow.js` git-stash cycle

`git stash push -- audit-app.js` (stashing ONLY the driver change; the new
test file and `package.json` wiring stayed in the working tree, matching
149/155's pattern). With `audit-app.js` back at its pre-164 (162-era) state:

```
$ node test_audit_planner_flow.js
  ✗ default rotation contains "plan-bloom-growth" ...  (×5, one per new surface)
  ✗ all five plan-bloom surfaces are appended AFTER planner-ko ...
  ✗ the `bloom` kind branch exists and reuses existing detector vocabulary only
  ✗ the planner kind gained a chip-advance check scoped to the 1280/EN surface only
  ✗ runAudit({ only: ["plan-bloom-growth"] }) covers exactly that surface
      expected surfacesCovered === ["plan-bloom-growth"]; got []
  ✓ (2 assertions that don't require the surface to exist still pass)

test_audit_planner_flow.js: 2 passed, 9 failed
exit: 1
```

`git stash pop` restored `audit-app.js` (confirmed `md5sum` ==
`1d8eaaf2693d5d189dc0e757c28cfe6a`, the same hash used throughout A3-A5).
Re-ran:

```
$ node test_audit_planner_flow.js
  ✓ (all 11 assertions)
test_audit_planner_flow.js: 11 passed, 0 failed
exit: 0
```

## A7 — diff scope

```
$ git diff --name-only origin/main
audit-app.js
package.json
product-loop-kit/BACKLOG.md
```
Plus two untracked, both allowed paths: `test_audit_planner_flow.js` (new
test) and `product-loop-kit/specs/164.md` (the spec itself, present before
this run started — not authored by me). `product-loop-kit/BACKLOG.md` was
already modified before I made any edit (pre-existing dispatch bookkeeping,
not something I touched).

Grep-confirmed byte-unchanged: `planner.js`, `plan.html`, `home.html`,
`app.js`, `PoolDetail.js`, `translations.js`, `style.css`,
`planner-styles.css`, `pool-detail-styles.css` (`git diff --exit-code
origin/main -- <file>` for each — all clean, zero output). `package.json`'s
diff is exactly one line — the `test:serial` chain string gains
`&& node test_audit_planner_flow.js`; `dependencies`/`devDependencies`
untouched (`git diff origin/main -- package.json` shows only that one line).
`audit-app.js`'s diff is 84 changed lines (79 insertions / 7 deletions,
`git diff --stat`) — under the spec's own flagged 150-line LOW-cap concern,
though the spec's author-guess risk tier is HIGH regardless and the verifier
assigns independently.

## A8 — test:fast + browser-lane audit tests, run individually

`timeout 300 npm run test:fast` → **34/34 passed, exit 0** (unchanged from
pickup).

Browser-lane audit tests, each run individually with an explicit long
timeout (the sandbox's default foreground wait is 120s, shorter than some of
these; using an explicit 280-300s timeout kept every run inside its own
5-minute budget with margin):

| file | result |
|---|---|
| `test_audit_planner_flow.js` (new) | 11/11 passed, exit 0 |
| `test_audit_app.js` | 3/3 passed, exit 0 |
| `test_audit_runner.js` | 9/9 assertions passed, exit 0 |
| `test_audit_prescan.js` | 7/7 passed, exit 0 (~130s; one run moved to background by the harness's 120s default and completed there — no different from a foreground pass, full output captured) |
| `test_audit_text_surfaces.js` | 15/15 passed, exit 0 |
| `test_audit_planner_surface.js` | 9/9 passed, exit 0 |

Every one of these six files passes on the current tree; none needed to be
re-scoped or excused. The full 93-file `npm test` chain was NOT attempted —
same already-documented standing limitation 162-notes.md recorded (never
observed to complete in-sandbox); running the item's own test plus the full
named audit-test set individually is the spec's own prescribed fallback and
is what was done.

## A9 — real findings on the live product

None from the five new surfaces (see "Findings" above) — the one bug the
spec's evidence pointed at (146, `iphone`/TARGET-as-subscription) was already
fixed on 2026-07-26, confirmed via `product-loop-kit/LOG.md`. Nothing was
fixed by this item; `product-loop-kit/signals/audit-findings.json` is
byte-identical to `origin/main` (confirmed by `git diff --exit-code`), never
touched by any of the `--only=` scratch runs above (all used `AUDIT_OUT`
pointed at `/tmp/.../scratchpad/164/*.json` or a test-owned `os.tmpdir()`
path, never the default out-path).

## What I could NOT verify, honestly

- **The full 93-file `npm test` chain** — not attempted, per the
  already-documented 162/158 standing limitation (never observed past
  position ~12 in this sandbox in any prior item's notes). The item's own
  test plus all six named audit-test files were run directly and individually
  instead, per the spec's own prescribed fallback, all green.
- **`test_seo_surface_audit.js`** — not in the spec's named A8 list and not
  run; grep-confirmed (not executed) that it scopes every `runAudit()` call
  with an explicit `only:` allowlist of static-page/prescan surface names
  that cannot see any of the five new `plan-bloom-*` surfaces or the new
  `planner` chip-advance check, so it cannot regress from this change — same
  reasoning 162-notes.md used for the same file.
- **A live re-render of `plan-bloom-target` against the exact PRE-146-fix
  build** — not attempted (would require checking out a pre-2026-07-26
  commit and touches no file this item may modify); relied on
  `product-loop-kit/LOG.md`'s own recorded, verifier-confirmed SHIPPED entry
  for 146 instead of re-deriving the fix from scratch.

## Risk tier — builder's guess

**LOW**, though the spec's own author-guess was HIGH specifically flagging
the `audit-app.js` diff length. Measured: 84 changed lines in `audit-app.js`
(`git diff --stat`), under the spec's own cited 150-line cap; no product
file touched (grep-confirmed against all nine listed files); no trust-rail
constant touched (`APY_SANITY_LIMIT`/`DEFAULT_MIN_TVL` only read, unchanged
import); no new dependency; no new detector vocabulary (checked
programmatically in `test_audit_planner_flow.js` itself — every check string
the new `bloom` branch uses already has ≥2 occurrences elsewhere in the
file); no user-facing string added (no `translations.js` change needed).
Flagging, as 162 did, that the verifier assigns this independently and has
previously overridden a similarly-scoped item's LOW guess.
