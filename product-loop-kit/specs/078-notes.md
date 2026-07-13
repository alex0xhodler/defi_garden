# 078 — implementation notes

## Change
In `.github/workflows/sitemap-update.yml`, "Commit updated files" step, the commit-message
body line was:

```
- Regenerated sitemap.xml with $(grep -c '<url>' sitemap.xml) URLs
```

replaced (single-line diff, nothing else in the step touched) with:

```
- Regenerated sitemap index with $( { grep -o '<sitemap>' sitemap.xml || true; } | wc -l ) child sitemaps and $( { grep -o '<url>' sitemap*.xml || true; } | wc -l ) total URLs
```

Renders today as: `- Regenerated sitemap index with 110 child sitemaps and 25039 total URLs`.

- N (index child count) = `<sitemap>` occurrences in `sitemap.xml` (the index) = 110.
- M (total URLs) = `<url>` occurrences summed across all root `sitemap*.xml` files = 25039.

## Why per-occurrence (`grep -o ... | wc -l`), not `grep -c`
`grep -c` counts matching *lines*, not matches. Today there is one `<url>` per line so the two
happen to agree (verified: line-sum 25039 == occurrence-sum 25039), but `grep -o | wc -l` is the
robust per-occurrence count the spec mandates and won't undercount if the generator ever emits
multiple tags per line. Cross-checked four ways (glob grep -o, per-file grep -o summed, awk gsub,
per-file grep -c summed) — all 25039.

## Glob scope
`sitemap*.xml` includes `sitemap.xml` itself. The index has zero `<url>` tags, so it contributes 0
to M — the total is unaffected and this matches the spec wording "all root sitemap*.xml files".

## Failure-mode analysis (the load-bearing conservative choice)
GitHub Actions' default shell for `run:` steps is `bash --noprofile --norc -eo pipefail {0}` —
**`-e` AND `pipefail` are both active** (this step has no `shell:` / `defaults.run.shell` override).
`grep` exits 1 when it matches zero times; under `pipefail`, `grep ... | wc -l` would then carry
grep's exit 1 as the pipeline status even though `wc -l` correctly prints `0`.

Two facts established empirically (tests in scratchpad):
1. In the *actual* usage — a command substitution embedded in the `git commit -m "..."` **argument**
   (not an assignment) — a failing substitution does NOT trip `set -e`, because the outer command's
   exit status is git's, not the substitution's. A plain `$(grep -o '<url>' sitemap*.xml | wc -l)`
   printed `0` and the script continued (exit 0).
2. The same plain form in an **assignment** context (`MSG=$(... | wc -l)`) DID abort under
   `set -eo pipefail`, because for assignments `set -e` keys off the substitution's exit status.

So the plain form is safe in the exact place it's used, but fragile if ever refactored into an
assignment. Conservative choice: wrap grep as `{ grep -o '<pat>' <files> || true; }` so grep's
exit-1-on-no-match is swallowed before the pipe. The pipeline then always exits 0, `wc -l` still
prints the honest count (including `0`), and the construction is safe in BOTH argument and
assignment contexts — context-independent. Verified: hardened form in an assignment under
`set -eo pipefail` printed `0` and continued.

Honesty preserved: `|| true` only suppresses grep's *exit code*, never its output. Zero matches ->
grep prints nothing -> `wc -l` reads empty stdin -> prints `0`. No fallback constant, no fudge; a
real empty regen still surfaces `0` in the message (the whole point of the signal).

## Deviations from spec
None. Spec's example message and two-number requirement followed exactly. Only deviation from the
*minimal* reading is the `{ ... || true; }` hardening, which is stricter (safer) than the literal
`grep -o … | wc -l` example the spec offered and is fully within the acceptance criteria
(zero-match must not fail the step; a zero must remain visible).

## Verification performed (all timeboxed, well under 5 min)
- Real-tree counts: N=110, M=25039; cross-checked by grep -o glob, per-file grep -o sum, awk gsub,
  per-file grep -c sum — all agree.
- Zero-match safety: index-only sitemap in scratchpad, hardened construction inside a
  `set -eo pipefail` script -> printed `0` and continued to a subsequent echo (exit 0).
- Message render (no git commit): `- Regenerated sitemap index with 110 child sitemaps and 25039 total URLs`.
- Tests: `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` -> all pass (208 planner assertions + protocol + qualifier suites), exit 0.
- Diff confined to the single message line; `git status --porcelain` shows only the workflow
  modified plus untracked 078.md and this notes file.
