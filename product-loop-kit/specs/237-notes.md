# 237 build notes

## What was actually live before this build
The 2026-08-06 addendum's complaint was STILL TRUE on `main` at pickup, despite comments in
`PoolDetail.js` (added by the 247 "design world" rewrite, PR #409) claiming the echo had
already been reduced to a "slim contextual echo — spec 237's intent". Verified by reading
`pool-detail-styles.css`: the echo's button used the exact same `.pool-detail-view
.cta-button-primary` selector as the hero (54px height, `background: var(--cert-green)`,
`border: 1px solid var(--cert-green-active)`) — zero CSS differentiated it. The class-count
alone (`.pool-cta-echo` wrapper) would have made a shallow check pass while the render still
showed two full-strength primaries, exactly the addendum's warning about vacuous checks.

## Change made
- `PoolDetail.js`: hero CTA unchanged in markup, gained `ctaPosition: 'hero'` in its
  `trackPoolClick` context. The earnings-block echo lost its `.cta-button-primary` button and
  its repeated `renderProtocolCtaBlock('earnings_block')` protocol link entirely — replaced by
  one `<a className="cta-echo-link">` (text-level link, no button chrome) carrying the same
  `showConcreteCta` projection copy and the same `gardenThisPoolHref` destination (same const,
  so byte-identical by construction — no separate equality logic needed). Its click handler adds
  `ctaPosition: 'calculator'`.
- `analytics.js`: added `cta_position: context.ctaPosition || null` to `trackPoolClick`'s
  payload — additive, `null` for every other emitter, `ctaPlacement` kept verbatim for report
  continuity (same precedent as `ctaPlacement` itself being additive over `click_type`).
- `pool-detail-styles.css`: new `.cta-echo-link` rule (underlined text, `--cert-green` family,
  no fill/no fixed height — deliberately NOT `.cta-button-primary` or `.cta-button-protocol`,
  the two "one action per intent level" classes now reserved for the hero).
- Deviation from the spec's literal wording: the spec offered "scroll-to-hero or direct
  navigate — builder decides" for the echo. Chose direct navigate (same `<a href>` as hero,
  unchanged) — scroll-to-hero would have discarded the calculator's parameterised
  `showConcreteCta` projection label the spec explicitly wants kept, so it wasn't a real option
  given the other acceptance line.
- "Start Earning on <protocol>" is now rendered ONLY at the hero (spec: "appears once (hero)").
  The echo carries no protocol CTA at all — confirmed by DOM count in the new
  `test_repeat_cta.js`.

## Tests
- Rewrote `test_repeat_cta.js` end-to-end (its old assertions literally required TWO
  `.cta-button-primary` and TWO `.cta-button-protocol`, which is the exact anti-pattern this
  item removes). New file: DOM count contract (1 primary / 1 protocol / 1 echo link), href
  equality, both click-payload assertions (`cta_position` hero vs calculator), and a live
  non-vacuity check (inject a 2nd `.cta-button-primary`, prove the count assertion goes red,
  remove it, prove green again — RAZOR's mutate→red→restore→green rule).
- `test_pool_detail_anomaly_projection.js` criterion 8 and `test_ko_pool_money_honesty.js`'s
  repeat-CTA assertions both hard-selected `.cta-button-primary` index `[1]` for "the repeat
  CTA" — updated both to read `.cta-echo-link` instead; no other assertion in either file
  changed.
- `test_northstar_cta_fires.js` (the file the spec names explicitly) required NO changes and
  stays 12/12 green — it only ever used `.cta-button-primary` `.first()`.
- Recompiled/reminified (`node compile-app.js && node minify-assets.js`) — `test_compiled_assets.js`
  and `test_minified_assets.js` both green (byte-identical to a fresh build).

## Class audit (spec's "audit other surfaces for the same pattern" instruction)
Grepped `app.js`/`planner.js`/`home.html` for the same shape (two simultaneously-rendered
elements sharing a primary-CTA class). Found one candidate — `planner.js:3024`/`3031`,
`.gp-primary-cta.gp-checkout-cta` appears twice in the source — but it's a
`checkoutPoolPrimary ? <a> : <button>` ternary, mutually exclusive, never both mounted. **Class
audited: 1 other surface checked, 0 live instances of the duplicate-simultaneous-primary-CTA
pattern found outside pool-detail.** Pool-detail itself: closed by this item.

## Verification
Manual Playwright screenshots at 1280/375, light+dark, calculator expanded: hero renders one
filled green primary + one bordered protocol button; the earnings-block echo renders as a
plain underlined text link ("Garden this pool → ~$1,114 in 5y") — visually unmistakably
secondary, satisfying the addendum's upgraded acceptance bar (computed background ≠ primary
fill).

## Verifier round
PASS, tier HIGH (independently confirmed — north-star surface markup + additive analytics
field). The verifier re-derived the addendum's visual-weight claim itself via
`getComputedStyle`/`getBoundingClientRect` (not trusting this notes file or the CSS read alone):
hero `background: rgb(30,92,63)` / `height: 54px` vs echo `background: rgba(0,0,0,0)` (fully
transparent) / `height: 22.5px` (−58%), at 360/768/1280px, light+dark, EN+KO. It also flagged
one real gap: the spec's count-contract criterion names BOTH entry paths (`url_direct` +
`card_click`) but the first draft of `test_repeat_cta.js` only automated `url_direct` — closed
before shipping by adding a `card_click` leg (grid → `.pool-card` click → detail) asserting the
same 1/1/1 count + href parity; now 8/8 green.
