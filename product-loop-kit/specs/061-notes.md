# Notes: 061 — Waitlist reframe to the card value prop

## What shipped
`translations.js` only, EN + KO together, 4 keys: `ctaWaitlistMicro`, `waitlistTitle`, `waitlistBenefits`, `waitlistGarden`. No changes to planner.js, analytics.js, CSS, or any other file. Diff: 12 lines changed.

## Deviations from the spec draft
The first draft of `waitlistBenefits` (written before running tests) used "a disposable card funded by your position's yield." `node test_planner.js` immediately failed: a pre-existing "waitlist copy — ICP alignment" guardrail suite (already in the repo, not written by this loop) bans "disposable cards" (EN, exact phrase) / "일회용 카드" (KO) and "self-custody"/"hold the keys" in these exact keys — the product's ICP (cautious retail saver, not analyst) is jargon-averse even about its own card mechanic at the waitlist stage. Revised both languages to convey "yield pays your subscription automatically through a simple card" without the word "disposable." Final copy passes all 190 assertions in `test_planner.js`, including every pre-existing waitlist-copy assertion. This existing test suite functioned as an unwritten second half of the spec — updated `specs/061.md` in place to record the constraint and the corrected copy (conservative choice: trust the test over the first draft's word choice, since the test predates this session and reflects a considered product decision).

`ctaWaitlist` (button label) was left unchanged ("Join the waitlist →") — the spec called this out of scope up front (honest "waitlist" framing already correct, changing it wasn't necessary to convey the card mechanic which now lives in the microcopy/modal).

## Verification
- `node --check translations.js`: clean.
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js`: exit 0, 190/190 assertions pass (NORTH_STAR.md's exact `Test:` command).
- Rendered-UI check attempted per the 2026-07-11 UX standing decision: installed `playwright` (npm, browser binary already present at `/opt/pw-browsers/chromium`), started `npm run dev`, drove a real share-link URL (`?goal=retirement&monthly=1000&years=10&pace=stable&fm=monthly`, both `lang=en` and `lang=ko`) through Chromium to the bloom step and the waitlist modal. **Could not complete**: every page load hit `net::ERR_CONNECTION_RESET` on all resource fetches — this is the documented, pre-existing sandbox limitation (`NORTH_STAR.md` 2026-07-12: "browser-originated HTTPS is still blocked at the proxy connection level... Chromium CONNECT tunnels get reset regardless of CA trust"), the same one recorded against items 040/044/045/051-056, not a regression from this change. Falling back to the precedent those items used: code-level verification via `test_planner.js`'s "waitlist copy — ICP alignment" suite, which calls the exact same `makeT()`-shaped accessor (`tEn`/`tKo` wrappers reading `translations[lang].planner[key]`) the real render path uses, and asserts on the literal string/function output rendered into `.gp-waitlist-title`/`.gp-waitlist-benefits`/etc. This is string-level, not pixel-level, verification.

## Residual
Needs a human visual spot-check on the next live deploy (render-path text change, same disclosure pattern as 040/044/045/051-056 — advisory, not a merge gate, per NORTH_STAR's `until 003... any render-path merge gets flagged`).

## Instrumentation
Unchanged. `waitlist_opened`/`waitlist_submitted` (009) still fire from the same call sites (`planner.js:2588-2599`, `planner.js:1538-1588`) — not touched by this diff.
