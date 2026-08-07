# 207 — build notes (deviations, conservative choices, why)

Branch `claude/loop-207`. Product code written by a dispatched Sonnet 5 coding agent (standing decision
2026-07-13); the operator did the spec reading, the deviation calls, the bookkeeping and the verifier
dispatch, and wrote no product code.

## Territory notes (blindspot pass, before any code)

1. **The four pool-detail honesty notes are inline-styled siblings, not a CSS component.**
   `.rate-volatility-note` (071, `PoolDetail.js:1481`), `.rate-track-record-note` (088.1, `:1510`),
   `.rate-momentum-note` (103, `:1561`), `.rate-tvl-trend-note` (104) each carry their own `className`
   hook plus a **byte-identical inline `style` object** built from neuro tokens
   (`--color-background` / `--neuro-radius-sm` / `--neuro-shadow-subtle` / `--color-text-secondary` /
   `--font-size-sm`). Grepped every `.css` file in the repo: **none of those four class names appears in
   any stylesheet.** So "reuse the existing styling, add no CSS" and "give the new note its own class
   hook" are not in tension here — a distinct hook is the established pattern and costs zero CSS.

2. **The 105 backfill is asynchronous, and that is the whole engineering content of this item.**
   `app.js:1253-1273` fetches `/data/pools-snapshot.json` *after* `detailPool` is already set, then
   `setDetailPool(… { kpis: match.kpis })`. For the 420/3,669 (11.4%) deep links that DO hit the
   snapshot, a naive "render the note whenever `pool.kpis` is falsy" would paint the new
   "we have no rate history" note first and swap it for the real 088.1 note when the fetch lands — a
   visible flash of a **false statement** on the north-star surface, and a behaviour change on exactly
   the path the spec's second acceptance criterion says must stay unchanged. The spec did not name this
   race; the blindspot pass did.

## Deviations from spec 207

**D1 — distinct class name `.rate-history-unavailable-note`, not the literal `.rate-track-record-note`.**
Spec §Change.1 says "reuse the existing `.rate-track-record` element, class names and neumorphic styling
exactly". Taken literally that is **self-contradictory with the spec's own acceptance criteria**:
`test_kpi_track_record.js` case D4 asserts `.rate-track-record-note` is ABSENT when `pool.kpis` is
missing, and the spec requires that file to stay *unmodified-and-passing*. Resolved in favour of the
test (the tighter, executable constraint), and in favour of the sibling pattern documented in Territory
note 1. The **styling** half of the instruction is honoured literally: the inline style object is copied
verbatim from the 088.1 note. No new CSS class, no new CSS rule, no new component, no gradient.

**D2 — a 1000 ms settle gate (`historyLookupSettled`) in `PoolDetail.js`, not a signal from `app.js`.**
The clean fix for Territory note 2 would be for `app.js`'s 105 effect to publish "backfill settled, no
match" downstream. The spec forbids it: `app.js` must be **byte-untouched**. So the gate lives in
`PoolDetail.js` as local state — reset on pool change, armed only when the pool arrives without `kpis`,
and cleared on unmount. A pool that gains `kpis` (backfill hit) re-runs the effect, resets to `false`,
and the note never renders. Conservative by construction: the failure mode of the timer being *too
short* on a very slow snapshot fetch is the note appearing and then being replaced — the same flash,
but bounded to a rare tail rather than being the default for 11.4% of arrivals; the failure mode of it
being *too long* is only a late-appearing note. 1000 ms was chosen because the fetch is same-origin and
static (typically tens of ms); it is a plain `setTimeout`, no animation, so `prefers-reduced-motion` is
not implicated.

**D3 — `package.json` `test:serial` gains one step.** Required by `test_test_registry.js` (item 205):
an unregistered `test_*.js` file is a hard FAIL of the orphan check. No dependency added, changed or
removed — the only edit to that file is the appended `&& node test_kpi_history_unavailable.js`.

## Conservative choices that are NOT deviations

- **Copy names the reason, per the spec's §Open questions recommendation.** EN:
  *"We don't have a rate history for this pool — we track rates day by day only for the largest pools,
  so there's nothing here to judge how steady this one has been. The rate above is live from
  DefiLlama."* The sentence is about **our** coverage, not about the pool's quality, which is what keeps
  it from disparaging a pool the product is simultaneously showing. Argued in `207-pr.md` as the spec
  requires.
- **A genuinely distinct key**, `rateHistoryUnavailable` — not a reword of `rateTrackRecordNew`, whose
  "we're still building this pool's rate history" is *false* for a sub-rail pool we do not track and
  currently will not start tracking (widening the population is 208).
- **Mutual exclusion** is inherited literally: the 071 divergence boolean is copied verbatim and negated,
  exactly as the three sibling notes do it, so at most one note in the family can ever render.
- **No new analytics event.** The spec pre-registers this: the surface is already covered by
  `pool_view{source=url_direct}` and the north-star `pool_click{garden_cta|protocol_link}`, and at
  6 `pool_view` / 30d a new event would be unreadable. Stated rather than invented.

## Out of scope, untouched (verified by `git diff --stat`)

`app.js`, `compute-kpis.js`, `data/**`, `generate-*.js`, `home.html`, `style.css`,
`pool-detail-styles.css`, every trust-rail constant, and every pre-existing test file.
Widening the kpi population is **208**; the audit rotation population was **206**.

## Attempt history

**Attempt 1 — verifier FAIL, 7/8 criteria.** Seven criteria met with independent evidence (including the
verifier's own grep of every `.css` file confirming D1's "no new CSS" claim, its own re-run of
`npm run compile && npm run minify` confirming the regenerated artifacts are deterministic and that
`app.compiled.*` did not drift, and its own reading of the KO string, judged natural rather than
machine-mangled). The eighth failed, and the failure is worth recording because it is a *verification*
defect, not a code defect:

> The no-flash case (C3) — the one this item's own explainer calls "the one that matters" — **could not
> fail.** The verifier neutralised the `historyLookupSettled` settle gate in a scratch copy of
> `PoolDetail.js` and re-ran the suite: **all 6 assertions, C3 included, still passed with the mechanism
> deleted.** Root cause: C3 sampled the DOM once, after a ~1600 ms settle wait, by which time the mocked
> same-origin snapshot fetch (sub-50 ms) had already resolved whether or not a gate existed. The flash
> window closed before the assertion looked at it.

The verifier's judgement on the production code itself was that it is correct as written — hook ordering
before the `if (!pool) return`, correct dependency array, `clearTimeout` cleanup, and a pool that gains
`kpis` mid-flight correctly making the note unreachable. **What was missing was evidence, not
correctness**, which is exactly the standard `playbooks/derived-number-rails.md` Step 0b and
`test-gate-observability.md` step 5 already impose: a check never shown to fail is not evidence of health.

**Attempt 2 — make C3 falsifiable.** Two changes to `test_kpi_history_unavailable.js` only (no product
code): the C3 snapshot route now fulfils after a deliberate **~400 ms delay** — below the 1000 ms gate, so
the gate genuinely does the work rather than winning a race — which opens a real, observable flash window;
and the case now **samples continuously** from navigation until well past settle instead of once at the
end, asserting the note was never present at any sample, then asserting the 088.1 note is. Non-vacuity is
proven by construction and by re-running with the gate neutralised, and the RED output is recorded in
`207-pr.md`.

**Attempt 2 verdict: PASS 8/8, tier HIGH** (verifier re-derived the tier independently). The verifier also
confirmed the meta-finding: `home.html:359` loads `PoolDetail.compiled.min.js`, so **attempt 1's vacuity
proof was itself invalid** — it mutated the source without recompiling, and the browser ran the unmutated
bundle. Recorded honestly in `207-pr.md`: we do not know whether attempt 1's C3 was vacuous; we know the
C3 shipping here is falsifiable, proven by a valid mutation. The test improved either way.

## Compound step

`playbooks/compiled-artifact-mutation-proof.md` (new) — two capable agents hit the same structural trap in
one tick, so it is a checklist now instead of a thing to remember. Covers: check what `home.html` actually
loads before mutating anything; the three-step mutate/restore cycle when a compiled artifact is in the
path; md5 every generated artifact before you start (`git status` alone will not catch a mutated minified
bundle, and `test_compiled_assets.js` passes happily on a mutated source + matching mutated artifact); and
the transient-observation rules — a single post-settle DOM sample cannot observe a flash, `waitUntil:
'load'` is the wrong wait in this proxy-blocked sandbox, and mocked latency must sit on the correct side
of the production threshold. Indexed in `playbooks/README.md`.

## Test results

See `207-pr.md` — recorded there with the verifier's independent re-run rather than duplicated here.
