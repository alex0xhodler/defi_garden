# compiled-artifact-mutation-proof — playbook

When: you are about to prove a rendered (Playwright) test is **non-vacuous** by mutating the mechanism it
guards and watching it go red — or you are judging someone else's such proof. Also fires whenever a
rendered test behaves identically before and after an edit you were sure would change it.

Answer in one line: **in this repo a source edit has no runtime effect until you re-run
`npm run compile && npm run minify`** — `home.html` loads the COMPILED bundle, so a mutation proof that
skips the regeneration step proves nothing, in EITHER direction (a still-green suite is not evidence of
vacuity, and a still-red one is not evidence of a real failure).

Steps:
  1. Establish what the browser actually executes before mutating anything.
     `grep -n "\.js" home.html` — check whether the tag names the source file or a `*.compiled*.js` /
     `*.min.js` artifact. As of 2026-08-02 the rendered surface loads `PoolDetail.compiled.min.js` and
     `app.compiled.min.js`, never `PoolDetail.js` / `app.js`, and `translations.min.js` rather than
     `translations.js`. `plan.html` and the analytics shell follow the same pattern.
  2. Decision rule: **artifact-loaded → every mutate/restore cycle is a THREE-step operation**
     (edit source → `npm run compile && npm run minify` → run test), and the restore is the same three
     steps in reverse. **Source-loaded → the ordinary two-step cycle is fine.** Never assume; step 1 is
     cheap and the failure is silent.
  3. Before the first mutation, record `md5sum` of the source file AND every generated artifact it feeds
     (`*.compiled.js`, `*.compiled.min.js`, `*.min.js`), and back them up **outside the repo** (the
     session scratchpad). Restoring the source without recompiling leaves mutated artifacts staged for
     commit — the worst outcome of all, because it ships.
  4. After restoring: recompile, then re-check every md5 against step 3. `git status --short` alone will
     NOT catch a compiled artifact that happens to differ only in a minified line, and
     `test_compiled_assets.js` / `test_minified_assets.js` only assert the artifacts MATCH the current
     source — they pass happily on a mutated source + matching mutated artifact.
  5. Judge the proof's shape, not just its colour. A valid non-vacuity proof shows **the same test file**
     going green with the mechanism present and red with it absent, with everything else — including the
     regeneration step — held constant. A proof that changed two things at once is not a proof.

Resolution:
  - **Proof skipped the regeneration** → the result is void. Re-run it properly before drawing any
    conclusion; do NOT record "the test is vacuous" or "the fix works" on that evidence.
  - **Proof is valid and the test stayed green with the mechanism deleted** → the test IS vacuous. Fix
    the test (usually: sample at the right moment, or widen the observation window), do not fix the code.
  - **Proof is valid and the test went red** → non-vacuity established; cite the verbatim red output in
    `<id>-pr.md`, not a summary of it.

Traps:
  - **The silent-no-op trap (item 207, hit twice in one tick — once by the verifier, once by the builder
    on their first attempt).** Mutating `PoolDetail.js` without recompiling produced a full green suite
    that was mistaken for "the gate is unnecessary / the test is vacuous". The browser never saw the
    mutation. Both agents were competent and careful; the trap is structural, which is why it is written
    down rather than remembered.
  - **A single post-settle DOM sample cannot observe a transient.** If the thing under test is a *flash*
    (something briefly rendered then replaced), one `waitForTimeout(N)` + one `querySelector` will pass
    whether or not the flash happens. Poll (or `MutationObserver`) from mount and assert "never present
    at any sample". Same rule as `derived-number-rails.md` Step 0b: a check never shown to fail is not
    evidence of health.
  - **`waitUntil: 'load'` is the wrong wait for observing early-render behaviour in this sandbox.**
    Browser-originated HTTPS is proxy-blocked (standing decision 2026-07-12), so `load` does not fire
    until every blocked external host times out — on the order of ~12s, by which point any race you were
    trying to observe is long over. Use `domcontentloaded` and start polling immediately.
  - **Mocked latency is not real latency.** A same-origin mocked fetch resolves in tens of milliseconds,
    far faster than production. If the behaviour under test depends on a race, the fixture must inject a
    deliberate delay to open an observable window — and that delay must sit on the correct side of the
    production threshold (207: a 400ms route delay against a 1000ms gate) or the test measures the
    fixture rather than the code.

Provenance: distilled from item 207 (2026-08-02) — the rate-history-unavailable note's settle gate. The
first verification pass returned FAIL on the strength of a mutation proof that skipped the compile step;
the fix agent independently rediscovered the same trap ("this took two debugging passes to discover —
first attempt without recompiling silently passed for the wrong reason") before producing a valid
proof. Related: `test-gate-observability.md` (a gate nobody watches fail is not a gate),
`derived-number-rails.md` Step 0b (self-defeat checks), `pre-existing-red-triage.md`.
