# 193 — build notes

## Change made

`audit-app.js`'s `scanNumbers()` `numRe` (line ~2644, was ~2630 pre-comment) gained a
zero-width lookbehind:

```js
const numRe = /(?<![A-Za-z0-9])(-?)\$?(\d[\d,]*(?:\.\d+)?)\s*([KMBTkmbt])?/g;
```

A comment naming spec 157 / `ABSURD_MAGNITUDE_TEXT` and explaining why the lookbehind form
(not 157's capturing `(^|[^A-Za-z0-9])` alternation) is required was added directly above it,
per the spec's implementation constraint (the `exec()` loop below reads `n[1]`/`n[2]`/`n[3]`
by fixed index and reports `n[0].trim()` — a capturing prefix would shift those indices).
No other line in `scanNumbers()` changed; `moneyRe`, `ABSURD_MAGNITUDE_TEXT`, and
`PoolDetail.js` are untouched, as required.

New test file `test_audit_number_boundary.js`, registered in `package.json`'s `test:serial`
chain immediately after `test_audit_app.js` (before `test_seo_surface_audit.js`).

## Deviations from the spec / conservative choices

- **`poolIds` is a comma-joined string, not an array.** The spec's prose criterion 6 reads
  `poolIds: [thatPoolId]`, but `buildPoolSurfaces()` does
  `opts.poolIds.split(',')` — an array has no `.split`. I passed `poolIds: targetPoolId`
  (a bare string), matching the real contract `test_audit_pool_prescan.js` exercises
  (`poolIds: 'clean-pool-005'`). Confirmed by running against the literal `[targetPoolId]`
  form first — it throws `overrideRaw.split is not a function` — before switching to the
  string form, which passes.
- **Criterion 6 target-pool derivation reuses a real snapshot pool, no injection needed.**
  Measured at test time: 28/741 pools in the committed `data/pools-snapshot.json` currently
  carry a raw-rendered token (non-`0x`-or-short) that trips the pre-fix pattern — same
  population the spec's evidence section measured. The test still contains the documented
  fallback path (build a temp mutated snapshot injecting the wSOL mint into `pools[0]`) for
  the day that population hits 0, exercised only via the `if (!targetPoolId)` branch, which
  is currently dead code on this snapshot — flagged here rather than force-executing it,
  since forcing it would mean asserting on a synthetic case 6 no better than what the
  fallback already documents.
- **Criterion 3's "digit run at a word boundary" case reuses `WSOL_MINT.slice(2)`** rather
  than a fresh literal, to guarantee byte-for-byte identity with the spec's own example
  (`'TVL 11111111111111111111111111111111111111112'`) without hand-copying a 41-digit
  string twice into the file.
- Case 7 (positive control) targets the *same* pool id as case 6, per the spec's explicit
  requirement ("Positive control on the SAME pool"), by writing a second temp mutated
  snapshot from `snapshotPathForRender` (not the plain committed snapshot) so the underlying-
  tokens mutation from case 6's fallback path (if it ever fires) carries through.

## Non-vacuity cycle (my own, ahead of any separate verifier pass)

1. Backed up the fixed `audit-app.js`, then mechanically replaced the lookbehind-bearing
   `numRe` literal with the loose pre-fix form (a straight string substitution, not a hand
   edit, to avoid transcription error).
2. `node test_audit_number_boundary.js` on the reverted file:
   - Criterion 1 (base58 mint): **RED** — `expected [], got: ["astronomical value ... 1.11e+40"]`.
   - Criterion 2 (EVM address body): **RED** — `expected [], got: ["astronomical value ... 1.23e+39"]`.
   - Criterion 5 (source non-vacuity guard): **RED** — `numRe source lacks the (?<![A-Za-z0-9]) lookbehind`.
   - Criterion 6 (rendered, real pool): **RED** — the rendered pool-detail page produced the
     exact `1.11e+40` P0 finding case 6 exists to prove absent.
   - Criteria 3, 4 (genuine magnitudes, `$1.5B`, `$0.1`): **stayed GREEN**, as required.
   - Criterion 7 (positive control): **stayed GREEN** (expected — it targets a different
     injected figure, unaffected by the boundary regression).
   - Net: `5 passed, 4 failed`, exit code 1.
3. Restored the fixed file from the backup (byte-identical restore, verified by re-`grep`ing
   the lookbehind back into place).
4. Re-ran `node test_audit_number_boundary.js`: **`9 passed, 0 failed`, exit 0.**
5. `git diff -- audit-app.js` after restore shows exactly the intended 14-line comment +
   one-line regex change (reproduced verbatim below); `git status --porcelain` shows only
   `audit-app.js`, `package.json` modified and `test_audit_number_boundary.js` untracked (plus
   a pre-existing untracked `product-loop-kit/specs/193.md`, not created by this session) —
   no stray files left over from the revert/restore cycle.

```diff
-  const numRe = /(-?)\$?(\d[\d,]*(?:\.\d+)?)\s*([KMBTkmbt])?/g;
+  // backlog 193: same predicate as spec 157's ABSURD_MAGNITUDE_TEXT
+  // (`(^|[^A-Za-z0-9])`, above) — a digit run must not be preceded by a
+  // letter or digit, or it's a fragment of an alphanumeric token (e.g. the
+  // Solana base58 mint `So1111...112` rendered raw by PoolDetail.js, or an
+  // EVM address body), not a genuine magnitude. The FORM differs on purpose:
+  // this regex is driven in a `/g` exec() loop below that reads `n[1]`
+  // (sign), `n[2]` (digits), `n[3]` (suffix) by fixed index and reports
+  // `n[0].trim()` verbatim. A capturing prefix alternation like 157's would
+  // shift those indices, splice the boundary character into the reported
+  // string, and get consumed so the next exec() call could miss an adjacent
+  // match. A zero-width lookbehind enforces the identical boundary condition
+  // without capturing anything or advancing lastIndex — do not "unify" this
+  // back into 157's alternation form.
+  const numRe = /(?<![A-Za-z0-9])(-?)\$?(\d[\d,]*(?:\.\d+)?)\s*([KMBTkmbt])?/g;
```

## Measured test output (this session, in order run)

- `node test_audit_number_boundary.js` → **9 passed, 0 failed**, exit 0.
- `node test_audit_runner.js` → **9 assertions passed**, exit 0.
- `node test_audit_app.js` → **3 passed, 0 failed**, exit 0.
- `node test_audit_prescan.js` → **48 passed, 0 failed**, exit 0.
- `node test_audit_pool_prescan.js` → **14 passed, 0 failed**, exit 0.
- `node test_run_tests.js` → **26 assertions passed**, exit 0.

All six ran well inside the 5-minute foreground cap (the slowest, `test_audit_prescan.js`,
finished in well under 2 minutes). The full `npm test` browser+plain lanes were **not** run
end-to-end (not required by the spec); the only files from the acceptance list actually
executed are the six above, all green.

One incidental observation: multiple runs printed a stray line —
`(pools source: cache /tmp/defi-garden-test_seo_cta_targets-pools-cache.json, 15838 pools)` —
interleaved into this session's stdout during `runAudit()` calls. That string is emitted by
`test_seo_cta_targets.js`, not by anything in this diff or by `test_audit_number_boundary.js`
itself; it appeared identically while re-running the pre-existing `test_audit_app.js` and
`test_audit_prescan.js` too, so it is some other concurrent process in this environment
sharing stdout, not something introduced here. It did not affect any assertion or exit code.

## Ports chosen

`test_audit_number_boundary.js` uses **8824** (criterion 6 render) and **8825** (criterion 7
render). Chosen after grepping every `test_*.js` for `port` literals; the ports already
claimed in this repo are 8000, 8796, 8799, 8820/8822/8823 (`test_audit_app.js`), 8901-8908,
8930-8936, 8940, 8951-8954, 8957-8962, 8971-8972, and 9000 — 8824/8825 were unclaimed by any
of them (`run-tests.js`'s spec-170 conflict scheduler reads ports straight from each file's
own source, so an unclaimed literal is enough to avoid a scheduling collision).

## Residuals (documented, not fixed — out of scope per spec)

**(a) Pure-digit token ≥ 1e11 at the start of a line.** At true start-of-text there is no
preceding alphanumeric character for the lookbehind to reject, so such a token would still
read as a number — this is inherent to the fix (the text is genuinely indistinguishable from
a magnitude at that position). Measured population today: **0** — the only digit-leading raw
token anywhere in `data/pools-snapshot.json`'s `underlyingTokens` is the Algorand ASA
`1134696561` (1.13e9), an order of magnitude below the `ABSURD_MAGNITUDE` floor of 1e11, so it
never trips either form of `numRe`.

**(b) `PoolDetail.js`'s asymmetric address rendering is a product-quality wart, not fixed
here.** `PoolDetail.js:1611-1656` truncates an EVM address to `0xdac1...1ec7 ↗` (gated on
`token.startsWith('0x') && token.length >= 40`) but renders a 44-character base58 Solana mint
in full as a plain `<span>`. That inconsistency is *why* the false positive existed in the
first place, and it is arguably worth its own future backlog item (truncate base58 tokens the
same way, or route them through the same address-chip treatment) — but per spec 193's
explicit scope boundary, this item is about the scanner reporting a defect where none exists,
not about changing what the page renders, so `PoolDetail.js` was left untouched.

## Anything not verified

Nothing required by the spec was left unverified. The full `npm test` suite (all lanes,
94+ files) was not run — the spec explicitly does not require it, only the six named files,
all of which passed.
