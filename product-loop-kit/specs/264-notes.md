# 264 — build notes (2026-08-13)

## Outcome

PARKED at build time. The requested test-only widening is not green on the existing DOM-derived
population. Shipping it would make the repository's behavior gate permanently red; excluding the
known fixture would contradict the row's “every numeral class the guard already scans” contract.
No product or test code is retained.

## TDD evidence

1. Added a rendered positive control that shifts a visible numeral 100px outside its closest
   `.pool-apy-section`/`.pool-tvl-section` and requires the scan to report the escape.
2. Before the new predicate, the suite was RED at 42/43 with:
   `injected numeral escape was not detected by the section-containment predicate`.
3. Added four-edge containment against the owning section's content box, preserving the existing
   one-pixel rendering tolerance and neighbour-intersection checks.
4. The positive control turned GREEN, but the real population exposed four blocking failures:
   `.tvl-value "$950000000.0B"` escaped `.pool-tvl-section` by 19.6px in grid view at 1280px and
   1540px, in both light and dark themes. Final result: 39/43.

Measured example at 1280px:

- numeral box: `[100.8, 414.1, 222.3, 430.9]`
- section content box: `[74.0, 414.1, 202.7, 431.6]`
- right-edge escape: `19.6px`

This is the `usdc-tvl-glitch` stress fixture that spec 260 deliberately retained while abandoning
its product-CSS leg B. The test header states that removing the CTA exclusion makes that fixture
permanently red; section containment reaches the same unresolved instance without relying on a CTA
intersection.

## Resume recipe

Choose one explicitly; the current LOW/test-only scope cannot satisfy both:

1. Product fix: reopen the TVL-section width discipline as a separately risked UI item, preserving
   spec 260's grid hairline/normal-card zero-drift rails; then reapply this predicate.
2. Narrower guard: explicitly exempt the retained stress fixture/class. This is not recommended: it
   abandons item 264's stated class-wide containment invariant.

The build used option 2 only as a diagnostic thought experiment; no exemption was committed.
