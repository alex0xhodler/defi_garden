# 173-notes — rail-relative APY-percent check on audit-app.js's rendered leg

Build agent notes, written as the work happened (build.md §1 step 3). Every number below is
from a run I executed this session; anything I did not execute is marked UNRUN, not implied green.

## 1. The predicate, and every alternative rejected

**Question delegated by the spec**: "the exact predicate that separates a rate percentage from a
non-rate percentage" — Open questions, spec 173.

**Chosen predicate**: *include by default, exclude by known container*. Every rendered `"<number>%"`
text occurrence is treated as a rate/APY figure UNLESS its nearest DOM ancestor matches
`.tvl-trend-note` (PoolDetail.js:1516 — a deposit-base-change percent, gated only on
`|tvlTrend|>=0.25` with NO upper bound, genuinely renders "1,900%") or `.gp-item-fill`
(planner.js:3124 — the garden-growth progress-bar fill, the "progress bars" Non-goal names
explicitly; always 0% today by construction, `planner.js:1638` hardcodes `return 0`, so this
exclusion is currently inert but costs nothing and matches the spec's own Non-goals wording).
Suppression (separate axis) is anomaly-aware and DOM-scoped: a breaching figure is dropped only
when the product's own anomaly marker (`.apy-anomalous` / `.calc-warning`) is present in scope —
the nearest `.pool-card` ancestor when one exists, else the whole page.

**Code-verified, not guessed**: grepped every `'%'` occurrence across `app.js`, `PoolDetail.js`,
`planner.js` before choosing the predicate (commands + line numbers below). Every rate render in
the product runs through `_formatApy`/`formatApy`; the ONLY two non-rate percent renders in the
whole codebase are the two named above.

### Alternatives rejected

1. **Allow-list of "this class name IS a rate container"** (e.g. `pool-apy-hero`, `apy-value-hero`,
   `pool-action-apy`, `rate-momentum-note`, `rate-volatility-note`, …). Rejected: this is exactly
   the anti-pattern `playbooks/product-audit.md`'s Automatability section documents THREE times
   running (148 → 159 → 166) — "a checker's signal set is always drawn from the last bug someone
   was bitten by." An allow-list only ever sees a rate site someone remembered to register; the
   moment a new rate figure ships (a new note, a new derived field), it is invisible until someone
   notices and adds it — the exact blind spot this item exists to close. Also empirically fragile:
   `rate-momentum-note`'s class name doesn't even contain the substring "apy", so a naive
   `className.includes('apy')` allow-list would have MISSED the one field the Territory notes
   explicitly flag (`apyMomentum`) — I found this by reading the actual render site before
   committing to a design, not by assumption.
2. **`className` substring match on `apy`** (as a cheap allow-list variant). Rejected for the same
   reason as (1) plus the concrete counter-example above (`rate-momentum-note`).
3. **Label/prose-based predicate** (regex over the surrounding text for words like "APY", "rate").
   Rejected per the spec's own Territory notes ("Prefer a structural/DOM predicate over a prose
   one... it is language-proof by construction") — a prose predicate would need EITHER an EN-only
   regex (breaks on `?lang=ko`, and translations.js's KO strings don't all contain "APY" as a
   literal substring) OR single-sourcing from translations.js per string, which multiplies
   maintenance for no benefit once the include-by-default design already sidesteps the need to
   name every rate site by label OR by class.
4. **A page-global anomaly flag** (any `.apy-anomalous`/`.calc-warning` anywhere on the page
   suppresses everything on the page, always). Rejected per the spec's Territory notes verbatim
   ("Suppression scoping must be per-.pool-card... A page-global flag is wrong") — on the grid,
   many `.pool-card`s render at once; a page-global flag would let ONE flagged card mask a
   genuinely unflagged breach in a DIFFERENT card. Implemented instead as: `.pool-card`-scoped when
   a card ancestor exists, page-level fallback only when it doesn't (pool-detail has no
   `.pool-card` at all — a single subject per page, whose markers are siblings of the figures they
   qualify, not ancestors of every percent on the page). Mutation-tested as M4 below.
5. **A second local `APY_SANITY_LIMIT` mirror** (never seriously considered — the spec, the
   constant block at `audit-app.js:185`'s own comment, and NORTH_STAR.md's risk policy all forbid
   it explicitly; a rail mirror inside the scanner is itself a trust-rail edit). The existing
   import at `audit-app.js:101` is reused verbatim, `limit` passed as an explicit parameter to
   `filterApyRailBreaches(candidates, limit)` rather than closed over, so a unit test can exercise
   the boundary without touching the import at all.
6. **Text-only scan** (extend `scanNumbers()`'s regex-over-`innerText` approach with a
   rail-relative percent rule, no DOM at all). Rejected: it cannot implement criterion 3/5's
   anomaly-awareness (no way to know whether a given `%` sits inside a `.calc-warning`-flagged
   region from flat text alone) or criterion 4's TVL-trend exclusion (same reason) without either
   false-negatives (never firing) or false-positives (flagging the TVL note). This is why the new
   check needed its own DOM-evaluate pass (`collectApyPercentCandidates`) rather than living inside
   `scanNumbers()`.

### Grep evidence behind the predicate (executed this session)

```
grep -n "%" app.js            -> only formatApy()-based renders + 4 fixed filter-chip labels (1%+/5%+/10%+/20%+, never >20)
grep -n "%" PoolDetail.js     -> every _formatApy() render, PLUS PoolDetail.js:1531 (.tvl-trend-note, uncapped)
grep -n "%" planner.js        -> formatApy()-based renders, PLUS planner.js:3129 (.gp-item-fill, currently hardcoded 0)
grep -n "class=\"...apy...\"|apy-anomalous|calc-warning|pool-card" tokens/usdc.html chains/ethereum.html
                               -> no matches; static SEO pages have NO anomaly-marker DOM at all (anomalous
                                  pools are excluded at generation time, not flagged), consistent with the
                                  "no anomalous rates" copy baked into the page
grep -rn "allocation" *.js    -> no matches; the Non-goal's "allocation splits" class does not exist in the
                                  product today, nothing to special-case
```

## 2. Deviations from the spec, and the conservative choice made

- **Reused the "static-only anchor" precedent for the check's naming, not a new prefix.** The
  finding's `check` field is the bare `apy-rail-breach` (no prefix) — matching the KEY used inside
  `POOL_PRESCAN_SIGNALS`/`TEXT_SURFACE_SIGNALS` (which get a `pool-prescan:`/`text-surfaces:` prefix
  only for their AGGREGATE findings) rather than inventing a new name. This is a naming choice, not
  a spec deviation, but flagged here since it's the one place I could have picked a fresh name and
  chose reuse instead, for grep-ability across the three legs (rendered/prescan/text) that all now
  implement the same rail-breach concept.
- **No deviation found that weakens or reinterprets an acceptance criterion.** Criterion 2's
  fallback ("(a)+(b) if no real mutation is reachable") was NOT needed — a real, non-vacuous,
  unflagged rendered breach WAS reachable (§4 below) — so the fallback path was not exercised as
  the primary evidence. I still implemented (b)'s spirit anyway (§5, "criterion 4 non-vacuous"
  test) because it was cheap and strengthens criterion 4's control; this is an ADDITION, not a
  substitution, and the conservative choice was to keep the real positive control as primary
  evidence rather than lean on the fallback.
- **The per-`.pool-card` branch is untested against a REAL rendered grid surface — see §7
  Limitations.** This is the one honest gap: I built targeted DOM fixtures instead. Conservative
  choice: state this plainly rather than imply the real grid was mutation-proven.

## 3. Criterion 1 — measured both sides

Both runs executed this session, same code (this checkout's `audit-app.js`) against the same
committed `data/pools-snapshot.json`, `only` unset (full default rotation, 29 surfaces):

| run | total findings | blocking (P0/P1) | apy-rail-breach findings |
|---|---|---|---|
| this checkout (`claude/loop-173`, with the new check) | 6 | 5 | 0 |
| isolated `origin/main` worktree (no new check; `git worktree add <path> origin/main`, `node_modules` symlinked from this checkout to avoid a second `npm ci`, same snapshot data) | 6 | 5 | n/a (check doesn't exist there) |

Unchanged, as required. All 6 findings on this checkout are the known 148 junk-slug class
(`static-prescan:junk-slug` + 4 promoted `static-page:tokens/*` renders) plus the known
`pool-prescan:mean30d-rail-breach` P2 (reconciled/downgraded) — verified by reading the actual
`detail` strings in both runs' output, not inferred from the count alone.

Command run for the origin/main side (executed, not hypothetical):
```
git worktree add <scratch>/main-worktree origin/main
ln -s <this-checkout>/node_modules <scratch>/main-worktree/node_modules
cd <scratch>/main-worktree && node -e "require('./audit-app.js').runAudit({port:8830, outPath:...}).then(r => ...)"
-> MAIN WORKTREE: total findings 6 blocking 5
```
Worktree removed after use (`git worktree remove --force`).

## 4. Criterion 2 — non-vacuity, rendered (real mutation found — fallback not needed)

A real, reachable, non-vacuous mutation exists: `pool.kpis.apyMomentum` (PoolDetail.js:1483-1492,
`_formatApy(Math.abs(mom))`) is rendered whenever `pool.kpis.apyMomentum` is a number,
`historyPoints>=7`, `|momentum|>=0.5`, AND the mutually-exclusive volatility note does NOT win —
which happens whenever `mean30dSane` is false (i.e. `apyMean30d` is not a sane number). None of
these three gates bound `apyMomentum`'s own MAGNITUDE anywhere in `PoolDetail.js` — the spec's
Territory notes flag this exact gap ("apyMomentum is... only transitively bounded... Treat it as a
rate figure, in scope for the check").

Mutation: on the anchor pool (`747c1d2a-c668-4682-b9f9-296708a3dd90`), set `apyMean30d = null`
(clears `mean30dSane`), `kpis.apyMomentum = 5000`, `kpis.historyPoints = 16` (already true in the
committed data). `apyBase`/`apyReward` left untouched (2.185 / null) so `totalApy` stays far under
the rail — `isAnomalous`/`.calc-warning` never fires, and the OLD `scanNumbers()` magnitude check
(`ABSURD_MAGNITUDE = 1e11`) never fires either (5000 is only 5e3) — isolating that ONLY the new
check has an opinion here.

Real Chromium render result (`node test_audit_apy_percent_sanity.js`, criterion-2 case):
```json
[{
  "surface": "pool-detail", "viewport": "1280px", "check": "apy-rail-breach", "severity": "P0",
  "detail": "1 rendered rate percent figure(s) exceed the 1000% rail unflagged: \"5,000%\""
}]
```
This is a REAL render (not a fixture), on a pool the product does NOT anomaly-flag, quoting the
injected figure verbatim — criterion 2's primary ask, met without the (a)+(b) fallback. I still
additionally implemented the extraction-layer liveness proof from criterion 2(b)'s spirit as part
of criterion 4's non-vacuous case (§5) — belt and suspenders, not a substitution.

## 5. Criterion 3 — anomaly-aware negative control, rendered

Mutation: `apyBase = 5000, apyReward = 1` (mirrors `test_audit_app.js:92-98`'s existing gate
reasoning — both cards are gated on `apyBase>0 && apyReward>0`). `totalApy = 5001 > 1000` ->
`isAnomalous = true` -> `.calc-warning` renders on pool-detail. Real render result: **zero**
findings of ANY check (`node -e` ad hoc run, then folded into the test file) — confirming the new
check specifically produces zero (the pre-existing magnitude check ALSO produced zero here, since
5001 is far below `1e11`; spec explicitly allows either outcome for the old check, "the
pre-existing magnitude rule may legitimately still fire").

## 6. Criterion 4 — TVL-trend control, rendered AND non-vacuous

Two-part evidence, per the spec's explicit "a rendered assertion is strongly preferred over a
helper-only one":
1. `runAudit()` against a mutated snapshot (`apyMean30d=null`, `kpis.tvlTrend=19`,
   `historyPoints=16`) -> **zero** `apy-rail-breach` findings.
2. Direct, non-vacuous proof the control isn't silently passing because the note never rendered:
   a standalone Chromium render (same routes/fixtures as `runAudit()` uses internally) against the
   SAME mutated snapshot confirmed `document.body.innerText` literally contains `"1,900%"`, AND
   `collectApyPercentCandidates()` collected that exact figure with `excluded: true`. Measured this
   session:
   ```
   CONTAINS 1,900%: true
   candidates with value 1900: [{"value":1900,"raw":"1,900%","excluded":true,"anomalous":false,"scope":"page"}]
   ```
   This directly answers "did the exclusion actually engage, or did the note just never render?" —
   both were possible failure modes and both are now ruled out by direct observation, not inference.

## 7. Criterion 5 — KO parity, rendered

Real `?lang=ko` pool-detail renders, `node test_audit_apy_percent_sanity.js`:
- Clean KO data -> zero `apy-rail-breach` findings.
- Criterion-3's anomaly mutation (`apyBase=5000, apyReward=1`) rendered on `pool-detail-ko` ->
  zero `apy-rail-breach` findings (suppression holds in KO — `calcAnomalyWarning`'s KO string,
  `translations.js`, renders `.calc-warning` identically regardless of language, and the
  suppression predicate is structural/DOM-based, never reads the label text, so it is language-proof
  by construction — the exact property the spec's Territory notes asked for).

## 8. Exact test commands run, and what was NOT run

All commands below were executed this session with `timeout 280 <cmd>` (Bash tool `timeout` param
set to 280000ms), never left to run unbounded.

| command | result |
|---|---|
| `node test_audit_runner.js` | PASS — 9 assertions |
| `node test_audit_app.js` | PASS — 3/3 (unchanged by this change; re-ran after the fix below) |
| `node test_seo_surface_audit.js` | PASS — 5/5 |
| `node test_audit_prescan.js` | PASS — 29/29 (see §9, one real regression found+fixed here) |
| `node test_audit_pool_prescan.js` | PASS — 14/14 |
| `node test_audit_text_surfaces.js` | PASS — 32/32 |
| `node test_audit_planner_surface.js` | PASS — 9/9 |
| `node test_audit_planner_flow.js` | PASS — 11/11 |
| `node test_audit_apy_percent_sanity.js` (NEW) | PASS — 22/22 |
| `node run-tests.js --lane=plain` | PASS — 36/36, 0 fail, 0 timeout (background job, exit 0; full log at `<scratch>/plain-lane-result.json`) |
| `node run-tests.js --list` | confirms `test_audit_apy_percent_sanity.js` auto-classifies `browser` lane (transitive `playwright` mention via direct `require('playwright')` in the new file) |

**Explicitly NOT run** (per the spec's own instruction: "The full browser test lane (60+ files) is
NOT required and will NOT fit the timebox"):
- `node run-tests.js --lane=browser` (full ~30+ browser-lane files) — UNRUN. Only the 8 named
  audit-family files plus the new one were run individually, as instructed.
- `node run-tests.js` (all lanes combined) — UNRUN, same reason.
- Any file outside the criterion-7 list and `--lane=plain` — UNRUN.

## 9. Mutation-test cycles (criterion 9)

Backup taken before any mutation: `cp audit-app.js <scratch>/audit-app.js.orig`,
`md5sum audit-app.js` = `77b87ebdfdde32a346b72d3a23cc70f6` (recorded once, used as the restore target
for every cycle below). Each cycle: edit -> run the targeted test file -> record which assertions
flipped red -> `cp <scratch>/audit-app.js.orig audit-app.js` -> `md5sum audit-app.js` -> confirm
match against the recorded hash.

| # | Defeat | Targeted run | Result (red) | Restore md5 match |
|---|---|---|---|---|
| M1 | `filterApyRailBreaches`: forced the threshold clause off (`&& false && c.value > limit`) | `test_audit_apy_percent_sanity.js` | Exactly 3 red: basic-inclusion unit case, boundary-above unit case, criterion-2 rendered positive control. Everything else (excluded/anomalous unit cases, all 6 fixture cases, criteria 1/3/4/5) stayed green. | ✅ `77b87ebd...` |
| M2 | `filterApyRailBreaches`: dropped `!c.excluded &&` | same | Exactly 2 red: the `excluded=true` unit case, and criterion 4's rendered `runAudit()` case (now reports the TVL-trend note as a P0). | ✅ `77b87ebd...` |
| M3 | `filterApyRailBreaches`: dropped `!c.anomalous &&` | same | Exactly 3 red: the `anomalous=true` unit case, criterion 3, and criterion 5's KO-suppression case — each now reports the real (still-anomalous, still-suppressed-by-design) apyBase/apyReward/derived-projection breaches (5 findings surfaced, including the pool's real `1,597.32%`/`5,001%` projection figures that ARE normally hidden behind the anomaly flag). | ✅ `77b87ebd...` |
| M4 | `collectApyPercentCandidates`: replaced the card-scoped `card ? !!card.querySelector(ANOMALY) : pageAnomalous` with an unconditional `pageAnomalous` (the exact "page-global flag" bug the Territory notes warn against) | same | Exactly 1 red: the fixture's "card B (no marker of its own) must be anomalous=false" assertion — card B was wrongly suppressed because card A's marker existed elsewhere in the document. **Load-bearing finding: none of the 5 REAL rendered criteria (1/2/3/4/5) caught this** — pool-detail has no `.pool-card` at all, so this whole branch is invisible to every rendered acceptance test. The fixture test is the ONLY thing guarding this design decision (see §10 Limitations). | ✅ `77b87ebd...` |
| M5 | `collectApyPercentCandidates`: removed `.gp-item-fill` from `EXCLUDED` (left `.tvl-trend-note` only) | same | Exactly 1 red: the `.gp-item-fill` fixture case. No rendered criterion caught this either — `.gp-item-fill` is currently vacuous in the real product (§1), confirming the exclusion is defense-in-depth, not load-bearing on today's data, and ALSO confirming that fact is only knowable because the fixture exists. | ✅ `77b87ebd...` |
| M6 | `collectApyPercentCandidates`: removed the `acceptNode` script/style/noscript filter (`NodeFilter.SHOW_TEXT, null`) | same | Exactly 1 red: the script/style fixture case (now collects the fake `9999%` from both a `<script>` and a `<style>` tag). No rendered criterion caught this either — today's real product pages happen not to embed literal `%` text inside `<script>`/`<style>`, so this too is defense-in-depth proven only by the fixture. | ✅ `77b87ebd...` |
| M7 | `auditText()`: commented out the entire apy-rail-breach block (wiring removed) | same | Exactly 1 red: criterion 2's rendered positive control (no finding produced at all). Criterion 1 stayed green because "check absent" and "check present but silent on clean data" are indistinguishable by a pure zero-count — this is why criterion 2's positive-fire assertion is load-bearing and criterion 1 alone would not have caught a total wiring regression. | ✅ `77b87ebd...` |

Every cycle's restore was verified via `md5sum audit-app.js` matching the pre-mutation hash
`77b87ebdfdde32a346b72d3a23cc70f6`, and the full test file was re-run green-to-green after the last
restore (`22 passed, 0 failed`) plus `test_audit_app.js` (`3 passed, 0 failed`) as a final sanity
check.

I did not separately mutation-test the `PERCENT_RE` regex itself, the boundary comparator's exact
operator choice beyond M1 (`>` vs `>=` is covered by the two boundary unit cases, which ARE part of
M1's blast radius), or `reconcilePrescanFindings`'s unrelated logic (untouched by this item, not a
new assertion). These are judged out of scope for "every NEW assertion" — they test pre-existing
code paths, not ones this item introduced.

## 10. Live breach found?

**None.** Criterion 1's true-negative both-sides comparison, criterion 2's real mutation, and the
final regenerated `product-loop-kit/signals/audit-findings.json` (§11) all agree: 0
`apy-rail-breach` findings against today's real committed data. This matches the spec's own stated
expectation ("the expected result on today's data is a true negative") — nothing to ticket.

## 11. Honest artifact (criterion 6)

`npm ci` run this session (background, ~2s, `added 67 packages`) before regeneration, confirming
the installed `playwright` version (`1.61.1`) matches `package.json`'s devDependency and what
`audit-app.js` reports resolving (`"playwright": {"source": "local", "version": "1.61.1"}` in the
regenerated artifact — not a global-fallback path). `node audit-app.js` run exactly once after that
(no prior exploratory runs touched the committed path — every exploratory run above used
`AUDIT_OUT`/`outPath` pointed at the scratch directory). Regenerated artifact: 6 findings / 5
blocking (unchanged), `apy-rail-breach` present in the shape at count 0 (both `poolPrescan.bySignal`
and `textSurfaces.bySignal` already carried that key at 0 before this item — those are separate,
pre-existing prescan legs; the NEW rendered-leg signal is provably wired and silent, per §4 above,
not merely "the string happens to appear"). `git diff` on the artifact shows only expected day-to-day
churn (timestamp, seeded static-page rotation slugs, pool count 745->746 from the same live-data
refresh the branch's HEAD commit already carried) — same 6 findings, same classes, nothing new.

## 12. Scope proof (criterion 8)

No commit was made (per this item's explicit instruction), so `git diff origin/main...HEAD` (commit
history only) shows only the pre-existing untracked spec file. The load-bearing check is the
WORKING-TREE diff against `origin/main`, executed this session:
```
git diff origin/main --name-only
  audit-app.js
  package.json
  product-loop-kit/specs/173.md   (pre-existing, this item's own spec — untouched by me beyond
                                    this notes file and no in-place edit to 173.md itself)
git status --porcelain
   M audit-app.js
   M package.json
  ?? test_audit_apy_percent_sanity.js
```
No product file (`app.js`, `PoolDetail.js`, `planner.js`, `translations.js`, any CSS, any
generator, any generated surface), no `telegram-bot/`/`whatsapp-bot/`/`workers/` file touched.
`package.json`'s diff is exactly one line — the `test:serial` chain gained
`&& node test_audit_apy_percent_sanity.js` before the trailing `test_run_tests.js` — verified by
`git diff origin/main -- package.json | grep -v test:serial` returning only the diff header (no
`dependencies`/`devDependencies` line touched).

## 13. Limitations (honest)

- **Per-`.pool-card` scoping is proven only via hand-built DOM fixtures, not a real product
  render.** Today's grid renders exactly ONE percent figure per card (the total APY), and that
  figure is the SAME value `isAnomalousApy()` uses to derive `.apy-anomalous` — so an out-of-rail
  card is always self-flagged by construction, and a genuine "card A breached+flagged, card B
  breached+unflagged" pair does not exist anywhere in the real product today. M4 above proves the
  fixture is load-bearing (it is the ONLY thing that would catch a page-global regression), but it
  is real-render evidence of the EXTRACTION FUNCTION, not of the full app. If the grid ever grows a
  second independent percent field per card (e.g. a momentum badge), this gap should be revisited
  with a real two-card mutation.
- **`.gp-item-fill`'s exclusion is currently unreachable/inert in the real product** (`itemFillPct`
  is hardcoded to `return 0` at `planner.js:1638`) — included defensively per the Non-goals' own
  "progress bars" wording, verified via fixture (M5), not via a real render, because no real render
  can produce a non-zero value today.
- **Script/style exclusion (M6) is also unproven against real product pages** for the same reason
  as `.gp-item-fill` — no real page currently embeds a literal `%` inside `<script>`/`<style>` text,
  so criterion-1's clean run cannot distinguish "filter present" from "filter absent" on real data;
  only the fixture can.
- **The check runs on every surface `auditText()` covers** (grid, dead-pool, static, landing,
  planner, bloom, pool — everywhere the existing `number-sanity` check runs), which is broader than
  the acceptance criteria's explicit focus on pool-detail/TVL-trend. This was a deliberate reading
  of "one new signal on the rendered leg" (Scope) plus criterion 1's "across all surfaces" wording,
  not a scope expansion beyond what was asked — but it does mean the grid/planner/bloom paths only
  got criterion-1's zero-finding pin, not a dedicated positive control each. Given every real rate
  render in those surfaces funnels through the same `formatApy`/`_formatApy` helpers already grepped
  in §1, and pool-detail (the north star, and the richest source of rate figures) got full coverage,
  I judge this proportionate — flagged here rather than silently assumed.
