# 157 — build notes

Builder notes for backlog item 157 (prescan the static SEO surface, promote suspects into the rendered
sample). Written by the build-loop coding agent, 2026-07-27, branch `claude/loop-157`.

## Files changed

| file | change |
|---|---|
| `audit-app.js` | +242/−20 lines (now 934 total): `prescanStaticPages()` (exported), `extractPageText()` helper, `PRESCAN_SIGNALS`/`BROKEN_NUMBER_LITERAL`/`ABSURD_MAGNITUDE_TEXT`/`DEFAULT_PRESCAN_MAX` constants, promotion logic + aggregate findings inside `buildStaticSurfaces()` (now returns `{surfaces, prescan, prescanFindings}` instead of a bare array), `runAudit()` wiring (`result.prescan`, `opts.only`-scoped aggregate findings), header env-var table extended (`AUDIT_STATIC_PRESCAN_MAX`, `AUDIT_STATIC_PRESCAN`). |
| `test_audit_prescan.js` | new, 232 lines. Covers acceptance criteria 1–7. |
| `package.json` | `test` script: appended `&& node test_audit_prescan.js` immediately after `test_seo_surface_audit.js`. |
| `product-loop-kit/playbooks/product-audit.md` | +25 lines, new "Prescan-before-render (item 157, 2026-07-27)" section under **Automatability** (updated the existing playbook per its own no-duplicate rule — did not create a new file). |

No product file, generated SEO surface, or trust rail was touched. The only file written outside these was
the test's temp probe (`tokens/_audit_probe_<pid>.html`), deleted in `finally`.

## Deviations from the spec (and why)

1. **`opts.staticOnly` defaults prescan OFF unless `opts.prescan === true` is explicit.** The spec's kill
   switch is only `opts.prescan === false` / `AUDIT_STATIC_PRESCAN=0` — it does not mention `staticOnly` at
   all. `staticOnly` is a test-support-only flag (its own pre-existing comment names its sole reason for
   existing: "Used by the determinism acceptance test"), and `test_seo_surface_audit.js`'s criterion 5 —
   which this item may not modify and must keep green — drives it with `staticSample: 1`. With prescan
   default-on there, `cap = min(prescanMax=4, sampleSize=1) = 1`, so the ENTIRE static-page budget goes to
   a single seed-hashed pick among real suspects (today: 7). Two independent fixed seed strings landing on
   the same suspect via `hash(seed) % 7` is a ~1-in-7 event — not negligible, and it would make an
   unrelated legacy assertion ("a different seed picks a different page") flaky for reasons that have
   nothing to do with what it tests. `staticOnly` is set by exactly one caller anywhere in the repo (grepped:
   `test_seo_surface_audit.js`'s three determinism calls) and never appears in production/CLI use, so this
   is a narrow, low-risk default that fully restores pre-157 rotation-only behavior for that one caller,
   while my own `test_audit_prescan.js` explicitly passes `prescan: true` to opt back in under `staticOnly`
   for criteria 3/4/6/7 (matching the spec's literal `runAudit({staticOnly: true})` phrasing for criterion 3
   — the default-config PRODUCTION path, which never sets `staticOnly`, is completely unaffected by this
   deviation). Documented here because the spec did not anticipate the interaction; I judge protecting an
   existing acceptance test's a-priori-unrelated assertion from an unpredictable daily-data-dependent flake
   to be worth the extra branch.
2. **Aggregate `static-prescan:<signal>` findings are filtered through the same `opts.only` allowlist that
   already scopes rendered surfaces** (matched against `finding.surface`, always `'static-prescan'`).
   The spec's B.3 doesn't mention this interaction either, but `test_audit_app.js`'s clean-run case
   (`only: [... 'static-page']`, no `'static-prescan'`) asserts ZERO P0/P1 findings, and real junk-slug
   pages are live on disk right now (PR #306 unmerged) — without this filter, the new aggregate finding
   would leak a true positive into a test explicitly scoped away from that class, which is precisely the
   154 playbook trap ("scope the test to the surfaces it was written about... never filter the finding away
   to restore green" — I scoped it the same way the surfaces themselves already are, I didn't downgrade or
   drop anything). Runs with no `opts.only` (the CLI default) are unaffected — this only narrows an
   already-scoped run.
3. **Guarantee-not-luck test sizing (criteria 3/4/6).** Rather than hoping a probe page gets promoted by a
   seed-hash pick among competing real suspects, `test_audit_prescan.js` reads today's real suspect count
   via `prescanStaticPages()` at test runtime and sets `prescanMax`/`staticSample` to `(that count) + 1`, so
   the promotion cap covers every suspect including the probe — `sampleBySeed` then returns the whole set
   with 100% certainty (cap ≥ list length), not a probabilistic pick. If that sum ever exceeds
   `MAX_STATIC_SAMPLE` (12), the test throws a clear "test assumption broken" error instead of flaking
   silently, rather than silently skipping. This wasn't spelled out in the spec; I judge it necessary since
   the spec explicitly forbids hardcoding today's suspect count.

## Things the spec didn't get wrong, but that needed a judgment call

- **`prescan.promoted` and `prescan.bySignal` are always populated even when a run's `opts.only` scopes
  away every static/prescan surface.** I treat `result.prescan` as reporting what the scan+promotion
  decision WAS, independent of what actually got rendered this run (only the render list and the aggregate
  *findings* are scoped by `opts.only`). This matches spec B.3's plain description of the field and seemed
  the more useful contract for a caller inspecting `result.prescan` directly.
- **Detail string count in the aggregate finding reflects suspects present at PRESCAN TIME, which can
  include a test's own probe file if it's on disk when that run executes.** `test_audit_prescan.js`'s
  criterion-5 assertion accounts for this explicitly (expected count = pre-probe on-disk count + 1) rather
  than papering over it — the probe genuinely is on-disk junk for the window it exists, so the aggregate
  finding correctly counting it is the detector being honest, not a test bug to hide.

## Measured numbers (this checkout, 2026-07-27)

`prescanStaticPages()` on the real repo:
- `scanned`: **2176** (2089 token leaves + 87 chain leaves, per `listLeafPages`) — well above the ≥2000 floor.
- `suspects`: **7**, all `junk-slug`, all `severity: P1`:
  `tokens/00.html`, `tokens/01.html`, `tokens/17dec2026.html`, `tokens/20261231.html`, `tokens/2027.html`,
  `tokens/67.html`, `tokens/8oct2026.html` — identical to spec's evidence table.
- `zero-yield-claim`, `broken-number-literal`, `absurd-magnitude`: **0** each — matches spec evidence exactly.
- False-positive guards clean: `tokens/0x0.html`, `tokens/1inch.html`, `tokens/3crv.html`, `tokens/a0t.html`
  — none appear in any suspect list (the tightened `absurd-magnitude` regex specifically does not match
  "A0T"'s embedded "0T").
- `prescanStaticPages()` wall time: ~480ms for the full scan (measured via `Date.now()` around the call).

## Test run results (exact, this session)

```
$ node test_audit_prescan.js
  ✓ criterion 1: scanned >= 2000 and junk-slug suspects exactly match the on-disk junk predicate
  ✓ criterion 2: digit-leading real tickers (0x0, 1inch, 3crv, a0t) appear in NO suspect list
  ✓ criterion 3: promotion, REAL render — probe page covered + rendered junk-slug P1 finding
  ✓ criterion 4: non-vacuity — identical config with prescan:false does NOT cover the probe slug
  ✓ criterion 5: aggregate static-prescan:junk-slug count matches the independently re-derived on-disk count; clean signals emit nothing
  ✓ criterion 6: determinism — same seed gives identical prescan.promoted + surfacesCovered; a different seed (suspects<=cap) promotes the same SET
  ✓ criterion 7: budget unchanged — default-config (prescanMax=4, sampleSize=6) static surfaces stay within anchor + sampleSize
test_audit_prescan.js: 7 passed, 0 failed   (exit 0)
real 2m12.057s (first run) / 2m13.271s (post-restore rerun)

$ node test_audit_app.js
  ✓ clean run: covers pool-detail + dead-pool, ZERO P0/P1, writes findings JSON
  ✓ positive control: injected 900T Base APY renders into pool-detail → P0 number-sanity finding
  ✓ negative control: injected 900T 30d-Mean APY is suppressed on pool-detail (backlog 144 rail holds)
test_audit_app.js: 3 passed, 0 failed   (exit 0)
real 0m24.057s

$ node test_seo_surface_audit.js
  ✓ criterion 1: default run covers static-page + >=1 static-page:<slug>, writes findings JSON
  ✓ criterion 2 (positive control): tokens/00.html real render -> junk-slug P1 quoting the rendered <h1>
  ✓ criterion 3 (negative control): tokens/usdc.html yields no junk-slug/zero-yield-claim/empty-table
  ✓ criterion 4 (false-positive guard): digit-LEADING real tickers (0X0, 1INCH) do not trip junk-slug
  ✓ criterion 5: same AUDIT_STATIC_SEED selects the same sample; a different seed selects a different one
test_seo_surface_audit.js: 5 passed, 0 failed   (exit 0)
real 1m44.931s
```

All three well inside the 5-minute foreground timebox.

## Non-vacuity cycle (exact numbers)

Broke the promotion path by temporarily hardcoding `const cap = 0;` in place of
`const cap = Math.min(prescanMaxRaw, sampleSize);` in `buildStaticSurfaces()` (one line), leaving everything
else — including the aggregate-finding construction, which is gated on the same-scope `suspects`/`bySignal`
computed just above — otherwise untouched.

```
$ node test_audit_prescan.js   (cap forced to 0)
  ✓ criterion 1   ✓ criterion 2
  ✗ criterion 3: promotion, REAL render — probe page covered + rendered junk-slug P1 finding
    expected surfacesCovered to include the promoted probe surface "static-page:tokens/_audit_probe_23053";
    got [... 9 uniformly-rotated static-page:<slug> entries, no probe ...]
  ✓ criterion 4 (still passes on its own — prescan was never going to cover the probe either way; it's
    only meaningful paired with criterion 3, which is exactly what went red)
  ✗ criterion 5: aggregate static-prescan:junk-slug count matches ...
    expected an aggregate static-prescan:junk-slug finding; got: []
  ✗ criterion 6: determinism — ...
    expected at least one promoted suspect in the determinism run
  ✓ criterion 7
test_audit_prescan.js: 4 passed, 3 failed   (exit 1)
real 2m9.870s
```

Restored `audit-app.js` from a pre-edit copy (`diff` against the saved original showed only the single
`cap = 0` line differing; after restore, `diff` showed zero differences — byte-for-byte).

```
$ node test_audit_prescan.js   (restored)
test_audit_prescan.js: 7 passed, 0 failed   (exit 0)
real 2m13.271s
```

3 of 7 criteria (3, 5, 6 — exactly the ones that depend on promotion actually running) flipped red when
promotion was disabled and green again once restored — the new test is not vacuous.

## Anything the spec got wrong / left open

- The spec doesn't address the `opts.staticOnly` × prescan-default interaction (deviation 1 above) or the
  `opts.only` × aggregate-finding interaction (deviation 2 above) — both are real interactions its own
  acceptance criteria (8, via the untouchable legacy tests) require getting right. Nothing else found to be
  incorrect; the tightened `absurd-magnitude` regex, the reused `JUNK_SLUG_*`/`ZERO_YIELD_CLAIM` constants,
  and the ≤10-example aggregate-finding shape all matched the measured evidence exactly on the first attempt.
- Not built, still out of scope per spec: Design A's persisted never-audited rotation; fixing any of the
  7 junk pages found (148's job); anything touching `generate-*.js` or the SEO surface itself.
