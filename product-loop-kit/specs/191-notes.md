# 191 — build notes

## What shipped

The smallest version the spec asked for: `DEFAULT_POOL_SAMPLE` raised from **2 to 6** (now equal to
`MAX_POOL_SAMPLE`, the pre-existing ceiling from backlog 167), plus a legible-throughput log line so the
CLI summary states the implied full-pass time instead of leaving a reader to compute it by hand. Nothing
about **which** pools get selected changed — `computeRotation()`/`sampleBySeed()` (183's seeded rotation)
and the prescan-promotion machinery (157/167) are byte-unchanged; this item only widens the budget those
mechanisms already fill.

### Files changed

- `audit-app.js` — `DEFAULT_POOL_SAMPLE` 2 → 6 with the justification inline (measured timings, not
  assertion); the `AUDIT_POOL_SAMPLE` usage-doc block (~line 85) updated to match; `poolRotation.sampleSize`
  added to both the real result (`buildPoolSurfaces()`) and `emptyPoolRotationResult()`; a new
  `[audit] rotation throughput: …` console line after the existing `[audit] pool rotation: …` line;
  `DEFAULT_POOL_SAMPLE`/`MAX_POOL_SAMPLE` added to `module.exports`; one stale comment (the
  `buildPoolSurfaces()` header's "additive growth = 4, comfortably under MAX_POOL_SAMPLE (6)" claim) fixed
  because it was now arithmetically false at the new default (see "Deviations" below).
- `test_audit_pool_prescan.js` — line 165's `assert(r.extraSurfaces.length === 2, …)` now interpolates the
  exported `DEFAULT_POOL_SAMPLE` instead of a re-typed literal; its fixture already has 20+ non-anchor
  candidates, comfortably above the new default of 6.
- `test_audit_cta_provenance.js` — 8 new cases appended to the existing rotation block (no new test file,
  per the build instructions): default-applies, env-override, ceiling-clamp (opts path and env path),
  a golden-fixture pin on `computeRotation()`'s exact pre-191 output, determinism at the new default, the
  stride-caveat honesty assertion, and a state round-trip + wrap exercise over a small 8-candidate fixture.

## Measurement — why 6, not a lower value

Method (already run by the operator before this build session, per the task's "MEASUREMENTS ALREADY TAKEN
BY ME" note — **not re-run here**, to respect the 5-minute-per-command timebox): `time node audit-app.js`
at the current default (`AUDIT_POOL_SAMPLE` unset) and again at `AUDIT_POOL_SAMPLE=6`, rotation state
redirected to a scratch copy so `product-loop-kit/signals/audit-rotation.json` was never touched by the
measurement runs, with `audit-findings.json` restored afterward.

| Run | Wall-clock | Exit | Rotation |
|---|---|---|---|
| `AUDIT_POOL_SAMPLE` unset (old default, 2) | 106s | 0 | `seen 18/739, picked [ecf788e3…, 71418c17…]` |
| `AUDIT_POOL_SAMPLE=6` | 107s | 0 | `seen 22/739, picked [6 ids]` |

Both runs land far inside the 300s (5-minute) foreground cap — the 6-pool run adds ~1s of wall-clock over
the 2-pool run (per-pool-detail render cost is not the bottleneck; page boot/snapshot/server setup
dominates), leaving **~65% headroom** to the cap. Because 6 already fits with that much room to spare, and
because `MAX_POOL_SAMPLE` was already 6 (the pre-existing ceiling from backlog 167), there is no reason to
stop at an intermediate value (3, 4, 5) — picking anything less than the ceiling here would be leaving
measured, verified headroom on the table for no benefit. 6 is not chosen "because it's the ceiling" in the
sense the spec warns against (picking the ceiling without measuring) — it's chosen because it was measured
and found to fit, and it happens to equal the ceiling.

**Full-pass arithmetic**, from the real rotation-candidate population observed in these measurement runs
(739 candidates — this is `poolRotation.candidateCount`, i.e. pools minus the anchor and any
prescan-promoted ids, not the raw snapshot pool count, which is slightly different from spec 191's own
evidence section — the population grew between when the spec was written and when this measurement ran,
same live-data-drifts-daily behavior 183/167 already documented):

- At the old default (2): `ceil(739 / 2)` = **370 ticks** for a full pass.
- At the new default (6): `ceil(739 / 6)` = **124 ticks** for a full pass.

This is a **3× constant factor** (370/124 ≈ 2.98×), not closure — restated from the spec's own hypothesis
section and repeated here per its explicit honesty requirement: at daily-tick cadence this is ~124 days
instead of ~370, still not "audited daily," just audited 3× faster. A defect that requires a render (dead
CTA, i18n leak, 360px clipping, console error) still has a ~2.4×-lower-but-still-real chance of going
unaudited on any single day than it did before backlog 183 introduced rotation at all.

## The `seenCount`-includes-anchor+promoted trap, and how the log line avoids it

`poolRotation.seenCount` is **not** the rotation's own throughput denominator. `buildPoolSurfaces()` folds
three different reasons into the one `seen` array it persists: the anchor pool (always present, every run),
prescan-promoted suspect ids (0–`DEFAULT_POOL_PRESCAN_MAX` per run, unrelated to this item's budget), and
this run's rotation picks. Spec 191's own territory notes flagged this as "the most likely way to get the
new number quietly wrong" — using `seenCount` to compute a coverage rate would make the full-pass figure
look faster than it really is (some of `seenCount`'s growth comes from the anchor/promotion legs, which
have nothing to do with `DEFAULT_POOL_SAMPLE`).

The new log line is built from `candidateCount / sampleSize` — never `seenCount` — and its own wording says
so explicitly: `[audit] rotation throughput (rotation-only, excludes anchor + prescan-promoted ids): …`. The
`buildPoolSurfaces()` code that appends `sampleSize` to the `poolRotation` result carries the same
rotation-only framing in its comment.

Both division inputs are guarded: if `sampleSize` or `candidateCount` is `0` (rotation disabled, e.g. the
`AUDIT_POOL_IDS` override path, which returns `emptyPoolRotationResult()` with `sampleSize: 0`), the line
prints `n/a (rotation disabled)` rather than computing `Infinity`/`NaN`.

Exact wording of the new console line (second line of the two-line rotation summary):

```
[audit] pool rotation: cycle <cycle>, seen <seenCount>/<candidateCount> candidates, picked [<ids>], wrapped=<bool>
[audit] rotation throughput (rotation-only, excludes anchor + prescan-promoted ids): <sampleSize> pool-details/tick over <candidateCount> rotation candidates -> full pass ~<ceil(candidateCount/sampleSize)> ticks (~days)
```

(or, when disabled: `[audit] rotation throughput (rotation-only, excludes anchor + prescan-promoted ids): n/a (rotation disabled)`)

## Deviation / known consequence: the stride caveat

`sampleBySeed(sortedList, count, seed)`'s stride is `Math.max(1, Math.floor(sortedList.length / count))` —
it depends on `count`. This means raising `DEFAULT_POOL_SAMPLE` from 2 to 6 does not just add 4 more picks
to what a 2-pick run would have produced; it changes the stride itself, so **only the first pick is
guaranteed stable** between an N=2 run and an N=6 run over the same seed and candidate set (both start from
the same `hashSeed(seed) % length` index; they diverge from the second pick onward because the stride
differs). Verified directly in `test_audit_cta_provenance.js`'s new golden-fixture case: over a 10-candidate
fixture, `computeRotation(candidates, 2, seed, state).picked[0]` and
`computeRotation(candidates, 6, seed, state).picked[0]` are both `"golden-007"`; the remaining picks differ
between the two calls by construction.

**Consequence, stated honestly per the spec's own requirement**: raising the default changes **which**
pools any given day's rotation reaches, beyond the first pick, relative to what a same-day run would have
picked under the old default. This is not a reproducibility regression — 154's seeding contract
(same-seed-same-state ⇒ same picks) holds exactly as before, and is pinned by the new determinism test
(191(d)(ii)) and the golden-fixture test (191(d)(i)). It only means: reproducibility holds **per sample
size**, not **across** sample sizes. A finding discovered on `main` before this change, on a pool that was
one of the "extra" 4 picks a 6-sample run would have made but a 2-sample run would not have, will not
same-day-reproduce against a pre-191 checkout beyond the first pick. This is an accepted, documented
consequence of widening the budget, not a defect.

## Default-now-equals-ceiling consequence

Because `DEFAULT_POOL_SAMPLE` (6) now equals `MAX_POOL_SAMPLE` (6), `AUDIT_POOL_SAMPLE` can from this point
forward only ever **lower** the effective sample size from the default — it can no longer raise it, since
the clamp (`Math.min(MAX_POOL_SAMPLE, …)`) caps any override at the same ceiling the default already sits
at. Raising the render budget further than 6 requires raising `MAX_POOL_SAMPLE` itself, which spec 191
explicitly places out of scope. This is stated in three places for future readers: the constant's own
comment, the `AUDIT_POOL_SAMPLE` usage-doc block, and here.

## Territory-note trap, confirmed handled

Spec 191's territory notes (lines 109–112) called out the `seenCount` trap directly and asked the builder to
"confirm how `seen` is populated before using it to compute a coverage rate." Confirmed by re-reading
`buildPoolSurfaces()`'s own comment (`thisRunPoolIds = [anchorPoolId, ...promotedIds, ...rotationPicks]`)
before writing the log line — the log line and its accompanying code comment both derive the full-pass
figure from `candidateCount` (the size of `rotationCandidates`, which excludes the anchor and promoted ids
by construction) divided by `sampleSize`, never from `seenCount`.

## Also fixed while in the area (in scope, not scope creep)

The `buildPoolSurfaces()` header comment's additive-growth claim — "`DEFAULT_POOL_PRESCAN_MAX +
DEFAULT_POOL_SAMPLE` = 4, comfortably under `MAX_POOL_SAMPLE` (6)" — became arithmetically false the moment
`DEFAULT_POOL_SAMPLE` became 6 (2 + 6 = 8, not "comfortably under" 6). Per spec 191's instruction to check
for and fix stale "2" statements about the rotation budget, this comment is now split into two sentences:
what was true at 167's original shipped defaults (4, under the old comparison point) and what's true now
(8, above it — and why that's fine: `MAX_POOL_SAMPLE` was never a bound on the promotion+rotation sum, only
on the rotation leg's own env-override clamp).

## Explicitly out of scope (confirmed untouched)

`computeRotation()`, `sampleBySeed()`, prescan-promotion selection logic (157/167), `DEFAULT_POOL_PRESCAN_MAX`,
any new signal, any new surface, scanner parallelization, any product/user-facing code, `package.json`, SEO
artifacts. Verified by `git diff --stat` after the change touching only `audit-app.js` and the two test
files listed above.

## Verification

Baseline (per the task's instructions — "ALL passed on clean main") assumed, not re-measured, per the
operator's explicit instruction not to re-run the full audit or re-derive already-taken measurements.

| Command | Result |
|---|---|
| `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` | PASS (208 / 9 / 9 assertions) |
| `node test_audit_app.js` | PASS (exit 0) |
| `node test_audit_runner.js` | PASS (exit 0) |
| `node test_audit_pool_prescan.js` | PASS (14 passed, 0 failed) |
| `node test_audit_prescan.js` | PASS (48 passed, 0 failed) |
| `node test_audit_cta_provenance.js` | PASS (28 passed, 0 failed — 20 pre-existing + 8 new item-191 cases) |

`node audit-app.js` (full CLI run) was **not** re-run in this build session per the operator's explicit
instruction ("I will do the rendered end-to-end confirmation myself"); the timings and rotation output cited
above are the operator's own pre-session measurements, reproduced verbatim from the task instructions, not
re-derived.

`git status --porcelain` confirmed at the end of the build: no tracked signal file
(`product-loop-kit/signals/audit-rotation.json` or `audit-findings.json`) was left modified by any test run.

## Noticed, deliberately not fixed

- The real rotation-candidate population (739, per the operator's fresh measurement) has grown slightly
  since spec 191's own evidence section was written (734, then 739 again in a slightly later re-check) —
  expected live-data drift, not a defect; the arithmetic in this file uses the operator's freshest number.
- Whether the render budget should eventually be parallelized (multiple browser contexts) instead of raised
  serially is exactly the follow-up the spec anticipates ("if the timing measurement suggests an
  architectural change … file it as a separate item — do not build it here"). Not filed as a new backlog
  item here; that's the operator's call per the task's scope.

## Operator's end-to-end confirmation (post-change, in-place default)

Run by the operator AFTER the change landed in the tree, with the tracked rotation state redirected to a
scratch copy and `audit-findings.json` restored afterward (no `AUDIT_POOL_SAMPLE` set — this exercises the
new **default**, not the override):

```
$ time node audit-app.js            # AUDIT_ROTATION_STATE -> scratch copy
exit=0  elapsed=104s                # vs 106s at the old default of 2; cap is 300s
[audit] findings: 1 total, 0 blocking (P0/P1)
[audit] pool rotation: cycle 0, seen 22/739 candidates, picked [ecf788e3…, 16e00a4d…, 41683a7c…,
        7081d7c4…, 989973a1…, c475f250…], wrapped=false
[audit] rotation throughput (rotation-only, excludes anchor + prescan-promoted ids): 6 pool-details/tick
        over 739 rotation candidates -> full pass ~124 ticks (~days)
```

Emitted `product-loop-kit/signals/audit-findings.json`, read back programmatically (acceptance criterion 3):

```
{"cycle":0,"seenCount":22,"candidateCount":739,"sampleSize":6,"pickedLen":6,"wrapped":false}
```

`pickedLen` **6** = the new `DEFAULT_POOL_SAMPLE` on a normal run with no override, `sampleSize` persisted
into the artifact, and the throughput line's 124 is `ceil(739 / 6)` computed at runtime — three timings now
on the record (106s @2, 107s @ override 6, 104s @ new default 6; the spread is run-to-run noise, the
per-pool render cost is not the bottleneck).
