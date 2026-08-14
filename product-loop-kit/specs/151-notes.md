# Item 151 build notes

## Root cause

`availableTokens` splits `PT-SUSDAI-<expiry>` into `PT`, `SUSDAI`, and the date. Generic parsing therefore chose bare `PT` for the compound query. The shared pool matcher also used substring matching, so bare `PT` admitted unrelated symbols such as `OPT-USDC`.

## Implementation

- Exact `PT-<underlying>` and compact `pt<underlying>` queries reconstruct a canonical parent only when the underlying exists in the token inventory.
- Unknown PT parents stay unmatched rather than widening to the whole family.
- PT matching now requires a prefix plus delimiter/end boundary. General vault-aware substring matching is unchanged.
- YT remains deferred: the current data source has no YT symbols.
- Compiled and minified app artifacts were regenerated.

## Evidence

- TDD RED 1: `PT-SUSDAI` parsed as `PT`; GREEN after canonical parent reconstruction.
- TDD RED 2: rendered bare `PT` included `OPT-USDC`; GREEN after the boundary matcher.
- `test_pt_family_search.js`: 4 parser + 4 rendered assertions pass at desktop and 360px.
- Parser/category non-regressions, compiled/minified derivation, registry, and `git diff --check` pass.
- Real Chromium preview: bare PT excludes `OPT-USDC`; canonical and compact parent queries render all expected maturities.
- Reviewer round 1 found the substring collision; focused re-review returned PASS with no BLOCKING or AMEND findings.
- Full plain lane: 64/64 after carrying the identical four-function translation arity repair also present on open PRs #424/#447; whichever lands later should drop that overlap during rebase.

## Boundary

Build leg only. No traffic or conversion outcome claimed.
