# detector-detection-rate — playbook

**When:** a detector you own reports a defect **sometimes** — the same surface, the same code, flipping
between flagged and clean run to run. Also when you are about to write "0 blocking findings", "the audit
is green", or "not reproducible" about a rendered/browser-driven check.

**Answer in one line:** an intermittent finding means **one of the two halves is timing-dependent — and
you do not yet know which**. Either the detector races the page (false negatives; the historical case, and
everything from step 1 down), or **the page itself races and the detector caught it honestly** (a real
latent defect that a fast machine will never show you). Both are live in this repo's record; deciding
which is the whole job, and neither reading is the default.

**The two shapes, and the tell that separates them:**

| | detector is the flaky half | **product is the flaky half** |
|---|---|---|
| defect under an independent probe | reproduces ~N/N | does **not** reproduce; the surface is healthy in isolation |
| what varies | the detector's readiness/settle | the page's own load or execution order |
| tell | permanent defect, minority detection | **an error signature with a causal chain that only one ordering can produce** |
| precedent | 221 (3/20), 230, 231, 233 | **244** (2026-08-06) |

The historical framing of this playbook assumed the first column — a *permanent* defect caught on a
minority of runs. Item 244 is the second column and it inverts the diagnosis: 0 of 6 isolated repeats,
1 of 1 under an 83-surface contended run, and the surface perfectly healthy every time it was measured
alone. Under the old predicate that reads as "detector noise, dismiss"; it is in fact a live P0 race in
`home.html`'s boot order. **Do not narrow this playbook back to the first column.**

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
1b. **If the probe does NOT reproduce, you are in column two — do not stop at "not reproducible".**
   The isolated-run result has told you the surface is fine *when nothing else is competing for the
   machine*. That is not the same as fine. Next move, before any other:
   **read the captured error text as a causal chain and ask what single ordering produces exactly it.**
   An intermittent finding usually arrives with a page error attached, and error text is evidence of a
   mechanism in a way a flag count never is. In 244 the audit captured two errors together —
   `React is not defined`, then `Cannot read properties of undefined (reading 'some')` inside
   `getPoolTypeShared`. Reading the minified source showed both come from **one** comma-separated `var`
   statement: the destructuring of `React` throws, so every later declarator in that statement (including
   the array the function reads first) never assigns, while the hoisted `function` declaration stays
   callable. Exactly one ordering produces that pair in that order — the dependency executing before the
   global it needs. That settled it in minutes, with zero reproductions in hand.
   Corollaries:
   - **Two errors that arrive together are usually one event.** Do not triage them as separate findings;
     try to derive the second from the first. If you can, you have the mechanism.
   - **Hoisting asymmetries make partial-execution bugs look impossible.** A `function` declaration
     survives a throw earlier in the file; `var`/`const` declarators in the same statement do not. A
     stack frame inside a function whose module "failed to load" is not a contradiction — it is the tell.
   - **Then confirm the ordering is unguaranteed in the source, not just plausible.** In 244:
     `<script defer>` for the globals vs `document.body.appendChild(script)` for the consumer —
     dynamically inserted scripts are async by default, so nothing sequenced them. A comment claiming an
     ordering guarantee counts for nothing if it covers a *different* pair than the one that broke
     (244's comment ordered the two compiled bundles against each other and said nothing about React).
   - **Contention is the trigger, never the cause.** Once the mechanism is named, the fix targets the
     missing barrier — not the load that exposed it, and not the detector.

2. **Do NOT accept "resource contention" / "flaky sandbox" / "it's the CI box" as a VERDICT.** That was
   221's builder's dismissal and it was wrong; the verifier falsified it by simply running more trials. A
   detector is allowed to be slow, never allowed to be silent. Treat an intermittency claim without a
   measured mechanism as an open question, not an answer — and note that step 1b closes the other exit
   too: "it only happens under load" is a description of the trigger, so it is never a reason to close a
   finding either. Both dismissals are the same error wearing different clothes.
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
4b. **Opacity is only ONE door. Check for ANCESTOR TRANSFORMS too** (item 233). A geometry read that is
   *not* opacity-gated is not therefore animation-independent: `getBoundingClientRect()` — and so
   Playwright's `boundingBox()` — reports the **transformed** rect, and `style.css`'s entry animations
   include `fadeInScale` (`scale(0.95)→1`) and `slideInLeft` (`translateX(-20px)→0`) on *container*
   elements. So for the whole entry window every box inside them is shrunk toward the viewport centre by
   up to 5 %, then compared against a viewport width that did not shrink. 233 measured
   `pool-detail-360`'s CTA at **w=205.2 vs 216 at rest** and a detection rate of **0/10** on a
   permanently-broken page. Decision rule: **do not conclude "different failure mode" from "different
   visibility semantics"** — enumerate what actually moves the number (opacity gate, ancestor transform,
   not-yet-mounted, mid-reflow) and rule each out by measurement. 233's row had guessed the lens was
   safe *because* `boundingBox()` is not opacity-gated; an item that stopped at that check would have
   closed it as clean.

4c. **Surfaces that show no distortion today are lucky, not safe.** 233 found 3 of 5 surfaces reading
   stable geometry at t=0 — while still carrying 4–15 running animations. Scope the fix to the mechanism,
   not to the surfaces that currently hurt, or one added `fadeInScale` silently re-opens it.

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

6. **The harness may be breaking its own measurement.** Before blaming the page or the timing, check
   what the driver itself did to the page *between* the readiness wait and the read. Item 233's new
   zero-match advisory fired on `planner-768`; the cause was not the product and not a stale selector —
   `audit-app.js`'s planner driver **clicks a `.gp-chip`** (gated `s.width > 360`) and then measures
   `.gp-chip` (gated `s.width <= 768`), and `planner-768` is the only surface where both gates fire.
   Count 24 before the click, 0 after. It had been dead since item 201 widened the check, invisible
   because the branch skipped silently. Decision rule: when a selector "matches nothing", **read the
   whole driver top to bottom before forming a hypothesis about the page** — and when two gates on the
   same surface list were written by different items, check whether any surface satisfies both.

7. **A render failure SUBTRACTS findings, and the subtraction reads as an improvement.** When a surface
   fails to render at all, every other lens on it reports nothing — so the tick's totals go *down*. On
   2026-08-06 the occlusion count fell 6 → 4 and the two that disappeared were `grid-token`'s, absent
   only because the page never produced a pool card for the lens to test; isolated runs confirmed both
   were still there. Decision rule: **before writing any count delta, check whether a surface dropped out
   of the denominator.** A finding count is only comparable across ticks when the surface set that
   produced it is the same set. This is the count-level twin of the population-scoped-denominator rule.

## Provenance

- Item **244** (2026-08-06) — column two: the product as the flaky half; the error-signature-as-causal-
  chain move (step 1b); the hoisting asymmetry; and trap 7, the render failure that quietly lowered the
  occlusion count.
- Item **233** (2026-08-05) — the ancestor-transform door, the 0/10 pre-fix rate, trap 6 (harness
  self-interference), and the reminder that a non-opacity-gated read is not an animation-independent one.
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
