# detector-detection-rate — playbook

**When:** a detector you own reports a defect **sometimes** — the same surface, the same code, flipping
between flagged and clean run to run. Also when you are about to write "0 blocking findings", "the audit
is green", or "not reproducible" about a rendered/browser-driven check. The tell is a *permanent* defect
(one you can reproduce by hand every single time) that the detector catches on a minority of runs.

**Answer in one line:** the detector's **readiness predicate** is a magic number — it measures at a fixed
timeout instead of waiting for the mechanism it needs to have finished — so its output is a coin-flip on
the *tail of that mechanism*, and every "0 findings" tick is far weaker evidence than it reads.

**This is a FALSE-NEGATIVE-RATE problem, not a coverage problem.** If the question is "which defect
CLASSES can this checker see at all", you want `detector-signal-coverage.md` instead. This playbook is
for "it can see this one — why didn't it?".

## Steps

1. **Separate PAGE-broken from DETECTION-broken before anything else.** Run two instruments, not one:
   - the detector itself, N ≥ 10 isolated runs, count the flags;
   - an independent probe that reads the raw geometry/DOM the detector reads, same N.
   Decision rule: probe reproduces ~N/N while the detector flags ≪ N/N → **the detection is broken, the
   page is reliably defective**. Do not spend another minute on the page. Precedent: item 221 — lens
   3/20, probe ~14/14; item 230 — same defect 10/10 with its own instrument; item 231 — lens 2/10 with
   the fix mutated away, mechanism 6-occlusions-every-time once measured late enough.
2. **Do NOT accept "resource contention" / "flaky sandbox" / "it's the CI box".** That was 221's
   builder's dismissal and it was wrong; the verifier falsified it by simply running more trials. A
   detector is allowed to be slow, never allowed to be silent. Treat an intermittency claim without a
   measured mechanism as an open question, not an answer.
3. **Find WHERE in the pipeline the run dies — do not guess between rival hypotheses, instrument the
   stages.** Sample the detector's own evaluation at increasing delays past its existing settle and print
   the result at each mark. In item 231 this took one patch and three runs:

   | t past the existing 150 ms settle | occlusions reported |
   |---|---|
   | 0 ms | **0** |
   | 100 ms → 1600 ms | 6 (stable) |

   A step function like that names the mechanism by itself: whatever finishes between t=0 and t=100 ms is
   the thing the settle was racing. Also print the *gates* — geometry, coverage fraction, hit-test — so you
   can tell "the victim wasn't there yet" from "the victim was there and a filter rejected it". 231's
   victims were already 100% covered with `elementFromPoint` already resolving to the overlay at t=0, which
   is what ruled out every render-race explanation and pointed at the visibility filter.
4. **Expect the answer to be a VISIBILITY filter, not a layout race, on any React/animated surface.**
   `style.css:4605` declares `.animate-on-mount { opacity: 0 }` and the entry animations
   (`style.css:4610-4670`) carry **staggered** `--entry-delay-base * N` delays.
   `occlusionPassEval`'s `isVisible()` (`audit-app.js` ~3999) calls
   `checkVisibility({ opacityProperty: true })`, so an element mid-fade-in is *invisible to the detector
   while being plainly visible-and-broken to a user a moment later*. And `page.setViewportSize()`
   **re-mounts** the React subtree — so every lens that resizes restarts the very animation it then races.
   Rule of thumb: on a surface with `.animate-on-mount`, genuine settle is
   `max(delay) + duration`, which on the dead-pool alternatives grid is ~1250 ms — **8× the 150 ms the
   lens was waiting**.
5. **Replace the magic number with a predicate derived from the mechanism** (RAZOR side 2 — never watch a
   resemblance): poll until (a) `document.getAnimations()` has no `playState === 'running'` effect,
   **excluding `iterations === Infinity`** (spinners never settle; waiting on them hangs every surface),
   and (b) a geometry signature is byte-identical across two samples ≥100 ms apart. Bound it, and on
   timeout **emit an advisory naming the numbers and measure anyway** — a readiness wait that can
   silently skip a measurement has just moved the false negative one layer down.
6. **Acceptance is the DETECTION RATE, never a single green run.** Assert ≥19/20 on a surface carrying a
   known-permanent defect, and run the pre-fix path as a **positive control in the same session** so the
   harness is proven able to distinguish the two. A harness that has never been seen to report a low rate
   is not evidence that the rate is high.

## Resolution

Fixed = the rate is measured, the control discriminates, and the *cost* is stated. Reliability is not
free: 231's quiescence wait costs **~+1.4 s per surface** (measured across 4 real surfaces via `runAudit`:
11,369 ms vs 5,660 ms), i.e. **~+2 min across an 83-surface tick** against
`DEFAULT_TIME_BUDGET_MS = 300 s` — which makes item 192's rotation guard truncate more pool-rotation
picks per tick. That is a real breadth-for-reliability trade and it belongs in the notes, the PR and the
LOG, not in the reader's inference.

## Traps

1. **Adding a diagnostic changes the thing you are diagnosing.** In 231 the instrumented build detected
   **4/4** where the un-instrumented one detected 2/10 — purely because the diagnostic's own waits let the
   animation finish. Always measure the *shipped* path's rate separately from the *instrumented* path's.
2. **A control that measures 0/20 where history says 15% is not automatically "sample variance".** Ask
   whether the control leg faithfully reproduces the historical instrument (in-process shared browser vs
   separate processes; `addStyleTag` injection vs a mutated stylesheet). A control that is *more* broken
   than the original makes the comparison read stronger than it is.
3. **Neuter the new gate's conditions SEPARATELY.** Two conditions mutated together prove only that at
   least one is live. House precedent: item 230's verifier found one of two shipped declarations was
   invisible to the gate shipping with it — **and item 231 then failed this exact check at attempt 1,
   with this playbook already written and open.** Its quiescence gate had two conditions (no running
   animation / stable geometry); neutering the geometry leg turned a fixture red, neutering the
   **animation** leg left all 9 assertions green, because the motivating surface's cards animate with a
   `translateY` transform — so the geometry leg alone gated it and masked a dead animation leg. The
   general rule that follows: **when your fixture's defect moves, a geometry check will mask every other
   condition you have.** Build one fixture per condition, each of which the others cannot satisfy — for an
   animation-count leg that means static geometry plus an opacity-only, finite animation on an element
   parked off-screen so it cannot enter the geometry signature at all.
4. **A fixed defect is no longer a positive control.** Once the page is fixed (230 fixed dead-pool), the
   rate harness needs the defect re-injected — via a test-only injection hook, never by editing the
   committed stylesheet, and with `!important` because `home.html` loads the minified sheet async.
5. **Making a lens reliable makes the next tick noisier, by design.** Expect previously-"clean" surfaces
   to start flagging. That is the fix working, not a regression — but say so in the ship note, or the next
   heartbeat will read the jump as a new outbreak.

## Provenance

- Item **231** (2026-08-05) — the mechanism, the fix, the rate harness, all numbers above.
- Item **221** (2026-08-04) — first measurement of the 3/20 rate; its verifier falsified the builder's
  "resource contention" dismissal by running more trials.
- Item **230** (2026-08-04) — reproduced the same defect 10/10 with an independent instrument, which is
  what proved the page (not the probe) was the reliable half.
- `RAZOR.md` — "no check narrower than the class it guards"; a detector that watches a timeout instead of
  the mechanism is watching a resemblance.
- Sibling playbooks: `detector-signal-coverage.md` (which classes a checker can see at all),
  `fixed-overlay-occlusion.md` (the defect class 231's lens exists to catch),
  `test-gate-observability.md` (what "green" is allowed to mean).
