# 160 — build notes

Item: extend the product audit (`audit-app.js`) to the non-HTML generated text
surfaces `llms.txt` / `llms-full.txt`. Spec: `product-loop-kit/specs/160.md`.
Branch: `claude/loop-160`. Base: `origin/main` @ `f78d49cdf` (**includes 159**).

## What shipped

- `audit-app.js` (+172 / −3 hand-written): `prescanTextSurfaces(opts)` — pure
  `fs` + regex, never throws — plus its wiring into `runAudit()` and one new
  env override in the header block.
- `test_audit_text_surfaces.js` (new, 300 lines, 15 cases, fs-only except one
  integration case).
- `package.json`: one insertion at the end of the `test` script.

Nothing else. No product file, generator, page, sitemap or dependency touched.

## Deviations from the spec, and the conservative choice

1. **`APY_SANITY_LIMIT` source = `src/poller-core.js`, not `generate-llms.js`.**
   The spec says "read from a single source, not re-hardcoded a third time" and
   does not name which. `generate-llms.js` exports the constant and is the
   nearest neighbour — but it is *the generator this pass audits*. Importing the
   rail from the artifact's own producer makes the check self-fulfilling: weaken
   the generator's copy and the audit silently follows it down. `src/poller-core.js:18`
   is an independent mirror of the same `app.js` constant, dependency-free, and
   already covered by its own tests. Comment in the diff states this.

2. **`surfacesCovered` entry is pushed before the render loop, not after.**
   Consequence: `'text-surfaces'` sorts first in the array. Deterministic, so
   `test_seo_surface_audit.js`'s cross-run array comparison is unaffected.

3. **The pass is OFF under `opts.staticOnly`.** Not in the spec; required by the
   existing suite. `test_audit_prescan.js:221-223` asserts a default `staticOnly`
   run has `surfacesCovered.length <= 7` (anchor + sample). An unconditional
   entry would have pushed it to 8 and turned a green legacy test red for
   reasons unrelated to what it tests. `staticOnly` is test-support-only and
   literally means "static surfaces only", so gating there is honest, not a
   fudge. Same reasoning the 157 prescan applied to the same flag.

4. **Positive control uses a fixture, not the live file** — per the spec's own
   Territory note. 159 merged before this item was picked up, so the committed
   `llms.txt` is clean today. A *separate* case asserts that clean state
   directly, so the suite covers both the detector (fixture) and the real
   surface (on-disk), and neither one silently substitutes for the other.

5. **`tvl-floor-claim` is scoped to the floor's own markdown section.** The
   spec says "the smallest TVL figure actually listed". Taken file-wide that
   false-positives immediately: `## Top Chains by TVL` lists *aggregate chain*
   TVLs, which are not claims about the per-pool floor stated further down.
   Scoping to the section between the floor line and the next `## ` heading is
   what makes the check mean what it says. A dedicated test case pins this
   (a sub-floor figure in a different section must NOT count).

6. **`apy-rail-breach` emits one suspect per FILE, not per figure**, with the
   highest figure quoted plus up to 2 others. The spec's ≤10-examples cap is
   applied at the aggregate-finding layer, matching the 157 prescan shape.

## Non-vacuity proof (executed)

Neutered the rail comparison in `prescanTextSurfaces()`:
`!(val > APY_SANITY_LIMIT)` → `!(val > Infinity)`.

```
=== NEUTERED RUN ===
  ✗ positive control (pre-159 fixture): 353114.2% APY / $576,877 TVL breaches BOTH apy-rail-breach and tvl-floor-claim
  ✗ boundary: 1000.1% APY DOES trigger apy-rail-breach
  ✗ aggregate shape: >10 breaching figures in one file still yields exactly ONE apy-rail-breach suspect, capped at 3 quoted
test_audit_text_surfaces.js: 12 passed, 3 failed
```

Restored from a pre-edit copy and verified **byte-identical** with
`md5sum -c` (`audit-app.js: OK`), then re-ran:

```
=== RESTORED RUN ===
  ✓ integration: runAudit({ only: ['text-surfaces'] }) covers text-surfaces and populates result.textSurfaces

test_audit_text_surfaces.js: 15 passed, 0 failed
```

The three red cases are exactly the rail-dependent ones; the other 12 (negative
control, empty-surface, broken-number-literal, tvl-floor-claim, missing file,
runtime, wiring) stay green under the neuter, which is the correct blast radius.

## Test results

- `test_audit_text_surfaces.js` — **15/15**, ~7 s. Includes the integration case
  (`runAudit({ only: ['text-surfaces'] })`): chromium *is* runnable in this
  sandbox (playwright 1.56.1 resolved from the global root), so the case was
  kept rather than dropped.
- Regression suite (audit family + 159's own tests): see the run recorded in
  `LOG.md` for this item.

## Runtime

Asserted in-test: `prescanTextSurfaces()` over the two real committed files
completes in **< 1000 ms** (spec's budget). It reads 2 files, ~5,100 lines.

## Risk tier (builder's read)

**LOW**, matching the spec's own guess: tooling + tests only, 172 hand-written
lines in `audit-app.js` — over the 150-line LOW cap on raw count, but that count
is one self-contained function plus its wiring and its comment blocks, with no
product-surface, trust-rail or dependency change. Verifier assigns independently.

## Instrumentation

**None** — loop tooling under the 2026-07-23 pre-traffic mandate, disclosed per
the 142/149/154/155 precedent. Success is observable at the next heartbeat tick:
`audit-findings.json` gains a `textSurfaces` block and a `text-surfaces` entry in
`surfacesCovered`.

## Process note

The first build attempt ran against a broken checkout: the operator branched
`claude/loop-160` off a **stale local `main`** ref (`d755df0a2`) whose tree
predates `audit-app.js` entirely. Caught before any file was written, fixed with
`git fetch origin main` + `git checkout -B claude/loop-160 origin/main`, and the
build agent was restarted from the clean tree. Nothing from the broken tree
survived into this diff (`git status` was empty at reset). Worth a line in
LEARNINGS: a loop session must `git fetch` before branching off `main` — a
cloud checkout's local `main` can be days stale even when the working branch
is current.

## Post-verifier fix (same PR, before merge)

Verifier returned **PASS, 10/10, tier HIGH**, with one non-blocking defect:
`test_audit_text_surfaces.js`'s integration case wrapped both the `runAudit()`
call *and* its assertions in one try/catch that logged "(skipped)" without
incrementing `failed`. A genuine wiring regression — `'text-surfaces'` missing
from `surfacesCovered`, an unpopulated `result.textSurfaces`, or `opts.only`
leakage — would therefore have been indistinguishable from chromium being
unavailable: 14 passed / 0 failed, exit 0.

That is precisely the defect class this item exists to close (a check that
cannot go red), so it was fixed rather than deferred: only the `runAudit()`
call is now skippable, and only for an environment gap; the assertions moved
outside the catch and run through the file's normal `test()` harness.

Proof it now bites: temporarily forced the wiring off
(`if (textSurfacesEnabled && textSurfacesInOnly)` → `if (false)`) →
`✗ integration: ... 14 passed, 1 failed`. Restored via `git checkout --`,
verified byte-identical with `md5sum -c` (`audit-app.js: OK`), suite back to
**15/15**.

Cost disclosed: this is a second push on the branch, i.e. one extra Vercel
preview deployment against the free-tier quota the 2026-07-13 decision exists
to protect. Judged worth it — the alternative is shipping the audit's own
blind spot inside the item that closes blind spots.
