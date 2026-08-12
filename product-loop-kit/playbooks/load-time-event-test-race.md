# load-time-event-test-race — playbook

When: a rendered (Playwright) analytics test intermittently fails to observe an event that the product
fires from a **page-lifecycle handler** (`window.addEventListener('load' | 'DOMContentLoaded', …)`) —
`session_start` is the recurring instance — while events fired from React mount/effect passes
(`page_view`, `waitlist_opened`) are observed 5/5. Also fires when you are about to write a test that
*hard-requires* such an event, or judging one that quietly stopped requiring it.

Answer in one line: **it is almost always the test harness losing a race, not a product bug** — the
established `neutralizeHostGate()` pattern installs its double asynchronously, and a `load`-time event
that fires before the patch lands takes `analytics.js`'s correct spec-096 early return and is
gate-suppressed exactly as a genuine non-production visit should be.

Steps:
  1. Establish what fires the event. `grep -n "addEventListener('load'\|addEventListener('DOMContentLoaded'" analytics.js`
     — `startSession()` → `track('session_start', …)` hangs off the `load` listener at the bottom of the
     file. Everything reached from a React render/effect is NOT in this class.
  2. Establish how the harness neutralises the host gate. `analytics.js` declares `const Analytics = {…}`
     at script top level — a **lexical binding, not a `window` property** — so it cannot be pre-empted with
     `Object.defineProperty(window, 'Analytics', …)`. The established pattern
     (`test_analytics_src_attribution.js`, `test_analytics_host_gate_render.js`) therefore uses
     `addInitScript` + a `setTimeout(install, 0)` **poll** that retries until the binding exists.
  3. Decision rule — instrument the race before believing either story. Record `performance.now()` at
     patch-install and at `load`, plus `Analytics._suppressionLogged`, over ≥5 trials per path:
     - `patchedAt > loadAt` **and** `_suppressionLogged === true` → **harness race.** The product did the
       right thing; `isProductionHost()` still read `localhost` at that instant.
     - patch landed first and the event is still missing → **real product bug.** Do not work around it.
     - event present but carrying wrong/absent properties → not this playbook; see
       `analytics-regression-triage.md`.
  4. Size it rather than asserting it. Measured 2026-08-10 (item 252): planner `/plan.html` —
     `session_start` observed **4/5**, patch-before-load **4/5**; landing `/` — observed **1/5**,
     suppressed **4/5**. Landing mode is the worst case because there is less work between script
     evaluation and `load`.

Resolution:
  - **Harness race, and the event is incidental to what you are testing** → treat it as
    **opportunistic**: assert its correctness *if observed*, never require its presence, and hard-require
    an event that reliably fires on that path instead (`waitlist_opened` on planner, `page_view` on
    analytics). Then PROVE the suite is still non-vacuous without it — a mutation that removes the
    mechanism must go red on the reliably-fired events alone. 252's mutation (b) named
    `waitlist_opened` in its red output, which is exactly that proof.
  - **Harness race, and the event IS the thing under test** → the workaround is illegitimate. Fix the
    harness: install the double synchronously (serve a patched `analytics.js` from the fixture route, or
    route-intercept and rewrite `PRODUCTION_HOSTS`) rather than racing it with a poll.
  - **Real product bug** → ticket it; do not soften the assertion.

Traps:
  - **"Flaky, so I'll loosen the assertion" is how a gate dies.** Loosening is only defensible once you
    have shown, with a mutation, that the remaining assertions still go red. A suite that requires
    nothing on a path is green forever.
  - **`_suppressionLogged` is the tell.** Without checking it you cannot distinguish "event never fired"
    from "event fired and was correctly gate-suppressed" — they look identical from the stub queue.
  - **Do not patch `window.Analytics`.** It does not exist; the const is lexical. A patch that appears to
    apply but never takes effect reads as a product failure.
  - **`waitUntil: 'load'` makes this worse in this sandbox** — browser-originated HTTPS is proxy-blocked
    (standing decision 2026-07-12), so `load` waits on external timeouts. See
    `compiled-artifact-mutation-proof.md` for the same trap from the other direction.
  - Fixing this belongs in the **shared harness pattern**, not in one test file and never in
    `analytics.js` — in production `isProductionHost()` is true on the first call and no double exists.

Provenance: distilled from item 252 (2026-08-10, the `insider` traffic marker). The builder hit
`session_start` missing in 3/5 raw runs and worked around it; the verifier independently reproduced the
race with timing instrumentation (5 trials × 2 paths, figures in Step 4) and confirmed it is a property
of the harness, not of `analytics.js`. Related: `test-gate-observability.md` (a gate nobody watches fail
is not a gate), `compiled-artifact-mutation-proof.md` (mutation-proof mechanics),
`analytics-regression-triage.md` (property-level wrongness).
