# 096 build notes — environment-gate Mixpanel tracking

## What was built
- `analytics.js`: added a `PRODUCTION_HOSTS` allowlist + `isProductionHost()` helper and a single early-return gate at the top of `Analytics.track()` (the one choke point every `track*` helper AND `startSession()` funnel through). Non-production hosts get one `console.debug('[analytics] suppressed (non-production host)')` (guarded by `_suppressionLogged`), then `track()` returns without touching `mixpanel.track`.
- Reordered the existing `typeof mixpanel !== 'undefined'` check to an early `return` so the gate reads top-to-bottom; behaviour for the mixpanel-absent case is unchanged.
- Two new tests wired into the npm `test` chain right after `test_analytics_fires.js`:
  - `test_analytics_host_gate.js` — Node unit test, requires the real `analytics.js` (it `module.exports = Analytics`), stubs `window.location.hostname`/`mixpanel`, asserts the exact 4-host allowlist fires and every blocked host (localhost, 127.0.0.1, two vercel-preview shapes, empty, example.com, staging.defi.garden) suppresses; also proves `startSession()` inherits the gate and `isProductionHost()` never throws.
  - `test_analytics_host_gate_render.js` — Playwright, loads the REAL `home.html` from a localhost server, spies on the inline mixpanel stub's `.track`, asserts ZERO calls fire (gate active) and — mutation check — that neutralising `isProductionHost` makes `session_start` fire again.

## Decisions / deviations
- **Exact-match set, not `*.` suffix matching.** The spec's Change section floats "exact or `*.` suffix match" but the acceptance list says the allowlist covers *exactly* the 4 hosts. Exact set-membership satisfies the acceptance criteria verbatim, is trivially defensive, and (unlike suffix logic) has zero risk of accidentally matching a `defi-garden-*.vercel.app` preview. Chose exact.
- **Gate is defensive** (risk note in spec): `isProductionHost()` is wrapped in try/catch and does string ops on `location.hostname` only; on any error or absent `window` it returns `false` (fail-closed = suppress, never throw). A throw here would be funnel-wide.
- **`_suppressionLogged` one-shot** so local devs see one debug line, not one per event.
- No new event names; no new dependencies (playwright already a devDependency); trust rails untouched; no HTML/loader-snippet changes. Only `analytics.js` ships raw — grep confirmed no `.min`/generated copy embeds `mixpanel.track` (only `analytics.js` + the test files reference it).

## Test status (timeboxed, in-sandbox)
- NORTH_STAR line `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js`: **9/9 PASS**.
- `test_analytics_host_gate.js`: **16/16 PASS**. `test_analytics_host_gate_render.js`: **2/2 PASS** (incl. mutation check).
- `test_analytics_fires.js` FAILS in-sandbox on `page.goto` navigation timeout for the `/tokens/big` fixture page — **pre-existing and diff-independent**: stash-baseline proof, gate removed → identical `0 analytics-fires assertions passed` timeout. Not caused by 096 (it never reaches a track assertion; the token fixture page hangs loading external resources in the sandbox). My render test avoids this by serving plain `home.html` with no external-page dependency.

## Acceptance criteria coverage
- [x] `track()` returns without `mixpanel.track` off-allowlist, sends on-allowlist — unit test.
- [x] Allowlist = exactly the 4 hosts; localhost/127.0.0.1/vercel.app suppressed — unit test.
- [x] Rendered Playwright: zero `mixpanel.track` from a localhost load that previously fired `session_start`, with mutation check — render test.
- [x] Every analytics-loading page goes through shared `analytics.js`; no private `track()` copy — grep-verified (single definition).
- [x] New test file in the npm chain; existing chain otherwise green (only pre-existing failure documented).
- [x] Removes noise, adds no event names.

## Post-verify race (data for the improve loop)
A concurrent heartbeat session ran `git stash` on `analytics.js` while the verifier was mid-review, which raced this loop's interim commit: commit `0a95ecdc0` briefly captured `analytics.js` WITHOUT the gate (the stashed/baseline version), while the correct gated version sat as an uncommitted working-tree change. Caught by a post-verify `git show HEAD:analytics.js` audit; corrected via `git commit --amend` with the verified working-tree version before any push. Lesson: when a verifier (or any concurrent session) may `git stash`/restore shared files, re-assert `git show HEAD:<file>` matches the intended diff AFTER verification and BEFORE push — never assume the interim commit is intact.
