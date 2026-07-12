# Notes: 061 — Waitlist reframe to the card value prop

## What shipped
`translations.js` (4 keys, EN + KO: `ctaWaitlistMicro`, `waitlistTitle`, `waitlistBenefits`, `waitlistGarden`) + `translations.min.js` (regenerated, see attempt 2 below). No changes to planner.js, analytics.js, CSS, or any other source file.

## Attempt 1 — verifier FAIL, two real findings
**Finding 1 (blocking, fixed)**: `plan.html` loads `translations.min.js`, not `translations.js` — the first push edited only the source file and never ran `npm run minify`, so the shipped bundle still contained the pre-061 strings. `node test_minified_assets.js` caught this (`translations.min.js is stale`). Fixed by running `npm run minify`; `translations.min.js` is now the only file it regenerated (the other four minified outputs were byte-identical, confirming no other source changed). `node test_minified_assets.js` now passes (7/7).

**Finding 2 (informational, not fixed — see "Dead-code finding" below)**: the verifier's first rendered-UI attempt used the repo's fixture-routing pattern (`page.route('https://yields.llama.fi/pools', ...)`, matching `test_search.js`) and correctly showed the *old* copy — because it ran before Finding 1 was fixed (stale `translations.min.js`), not because of the sandbox network limitation the first draft of this notes file blamed. That framing was inaccurate and is corrected here: the fixture-routing workaround was available and should have been used from the start instead of `npm run dev` + a live `net::ERR_CONNECTION_RESET`-blocked page load.

## Attempt 2 — real fixture-routed rendered-UI verification
Wrote a Playwright script mirroring `test_search.js`'s exact pattern (local static server, `page.route` fixture for `yields.llama.fi/pools`, no live network dependency) and drove a real share-link URL (`?goal=retirement&monthly=1000&years=10&pace=stable&fm=monthly&lang=en|ko`) through Chromium to the bloom step, clicked the live waitlist CTA, and read the actual rendered DOM:
- EN: CTA `"Join the waitlist →"`, modal title `"Get early access to the card"`, modal benefits `"Join early access — once it's ready, your garden's yield pays your subscription automatically through a simple card. Your money always stays yours; no wallet or crypto experience needed to sign up."`
- KO: CTA `"대기자 명단에 등록 →"`, modal title `"카드 얼리 액세스 신청하기"`, modal benefits `"얼리 액세스에 가입하는 거예요 — 준비되면 내 정원의 수익으로 구독료가 자동 결제되는 카드를 받게 돼요. 예치금은 항상 내 소유이고, 가입에 지갑이나 크립토 경험은 필요 없어요."`

Both match the shipped `translations.js`/`translations.min.js` exactly — the new copy genuinely renders in the live waitlist modal, in both languages. Only console errors were `net::ERR_CONNECTION_RESET` on `google.com/s2/favicons` (cosmetic ladder-item icon fetches, unrelated third-party host, same class as CLAUDE.md's "external font/analytics fetch failures are ignorable" — not a page error, not caused by this diff).

## Dead-code finding (out of scope, documented for a future item)
`ctaWaitlistMicro` (the string this item also updated) is referenced by exactly one call site, `planner.js:2363`, which lives inside `ctaElement` — and `ctaElement` is never inserted into either JSX tree `Bloom()` returns (confirmed by the rendered check above: the live CTA button has no microcopy paragraph below it at all). This is the same dead-code element `specs/009-notes.md` already flagged for `ctaWaitlist`/`waitlistOpened` tracking. Net effect: the `ctaWaitlistMicro` copy update is correct and harmless (a future fix that wires up or removes the dead element will pick up the corrected string for free) but currently invisible to real users. Not fixed here — wiring up or removing `ctaElement` is a distinct, pre-existing bug outside this item's "reframe the copy" scope, and doing it inline would be exactly the kind of drive-by scope creep `product-loop-kit/prompts/build.md` warns against. Flagging for the next heartbeat as a candidate backlog item: the honest "card doesn't exist yet" micro-disclaimer directly under the primary CTA button is currently unreachable by any user.

## Deviations from the spec draft
The first draft of `waitlistBenefits` used "a disposable card funded by your position's yield." `node test_planner.js` failed: a pre-existing "waitlist copy — ICP alignment" guardrail suite (already in the repo, not written by this loop) bans "disposable cards" (EN, exact phrase) / "일회용 카드" (KO) and "self-custody"/"hold the keys" in these exact keys — the ICP is jargon-averse even about its own card mechanic at the waitlist stage. Revised both languages to "yield pays your subscription automatically through a simple card." Final copy passes all 190 assertions in `test_planner.js`.

`ctaWaitlist` (button label) left unchanged ("Join the waitlist →") — spec called this out of scope (honest "waitlist" framing already correct).

## Verification (final)
- `node --check translations.js`: clean.
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js`: exit 0, 190/190 assertions.
- `node test_minified_assets.js`: exit 0, 7/7 (translations.min.js now matches source).
- Rendered-UI check: real Chromium, fixture-routed pools API, live click-through to the waitlist modal, EN + KO — new copy confirmed rendering verbatim in `.gp-waitlist-title` / `.gp-waitlist-benefits`. This satisfies the spec's rendered-check acceptance criterion for the title/benefits line; `ctaWaitlistMicro` is verified at the source-string level only, since its render site is dead code (see above), not because of any network limitation.

## Instrumentation
Unchanged. `waitlist_opened`/`waitlist_submitted` (009) still fire from the same call sites (`planner.js:2596`, `planner.js:1574/1579/1585`) — not touched by this diff.
