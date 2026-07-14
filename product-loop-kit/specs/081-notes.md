# 081 — implementation & verification notes

Implemented 2026-07-14. Honest sitemap `<lastmod>`: preserve per-URL and per-child
timestamps when content is byte-identical, so a no-data-change CI run produces
byte-identical `sitemap*.xml` output → the workflow's porcelain gate skips the
commit → no Vercel deploy. Plus a workflow concurrency guard.

## Files changed
- `generate-sitemap.js` — per-entry lastmod preservation (new helpers +
  rewired write loop / index emission).
- `.github/workflows/sitemap-update.yml` — top-level `concurrency` block.
- `package.json` — appended `node test_lastmod_honesty.js` to the `test` chain.
- `test_lastmod_honesty.js` — new fixture-based unit test (8 asserts, no network).
- `product-loop-kit/specs/081-notes.md` — this file.

(`product-loop-kit/BACKLOG.md` + `specs/081.md` appeared in the working tree from
the loop's own task setup — NOT touched by this implementation.)

## Design / how it works
- `LASTMOD_PLACEHOLDER = '__DEFI_GARDEN_LASTMOD__'` — every `generateUrlXml` call
  site now passes this placeholder instead of `now`; the real timestamp is
  substituted at write time.
- `parseExistingUrlEntries(filePath)` — regex-parses an on-disk file's `<url>`
  blocks into `loc → { lastmod, normalizedEntry }` where `normalizedEntry` is the
  block with its `<lastmod>…</lastmod>` value swapped for the placeholder. Missing
  or unparseable file → empty `Map` → all-new timestamps (pre-081 behavior).
- `resolveLastmods(placeholderEntries, existingMap, now)` — for each freshly built
  entry, if its normalized form equals the committed one for the same `loc`, reuse
  the committed lastmod; else `now`. Returns resolved entries + the max lastmod.
- `maxLastmodFromFile(filePath, fallback)` — max `<lastmod>` in a file's `<url>`
  blocks (ISO compares lexicographically); used for the 4 foreign page-sitemap
  index entries, falling back to `now` if nothing parses.
- Index per-child `<lastmod>` = that child's max URL lastmod (`childMaxLastmod`);
  foreign page-sitemap index entries derived via `maxLastmodFromFile`.
- New helpers exported via `module.exports` (080's pattern) for unit testing.
- Untouched: timestamp format, URL membership, quality gates, priority/changefreq,
  `cleanupStaleSitemaps`, hreflang, robots.txt/llms. No new deps, no money/number
  formatting, no user-facing strings.

## Deviations / conservative choices
- **Acceptance #1 "empty status after run 2" — nuance.** Against the *current*
  committed tree (produced by the OLD generator), run 1 legitimately produces a
  ONE-TIME diff: the 4 foreign page-sitemap index entries change from the old
  fake `now` (`2026-07-14T04:50:54.912Z`) to the honest max-from-file value
  (`2026-07-14`, the real max lastmod inside `sitemap-token-pages.xml` et al.).
  This is exactly the honest-lastmod correction the PR intends (spec §C: "The next
  daily CI run lands honest lastmods naturally"). The property that actually
  matters — idempotency / no churn — holds: **run 1 output === run 2 output**
  (byte-identical diffs), and once run 1's output is the baseline the status is
  EMPTY (demonstrated below). No child sitemap changed at all.
- Left one incidental trailing-whitespace cleanup on a blank line inside the edited
  `sitemap-main.xml` block (was `    \n`, now `\n`). Harmless; `git diff --check`
  is clean.

## Verification evidence (all real output, 2026-07-14)

### Unit test — `node test_lastmod_honesty.js`
`8 assertions passed`, exit 0. Cases: (a) unchanged entry preserves committed
lastmod; (b) priority-delta entry gets `now`; (c) new loc gets `now`; (d) missing
old file → empty map → all-new; (e) unparseable old file → all-new;
(f) `maxLastmodFromFile`/`resolveLastmods` return max child lastmod; (g) fallback
when nothing parseable; (h) mixed child → index max = newest.
Mutation check: replacing the resolve line with `const lastmod = now;` fails the
test (exit 1, 3 asserts fail) — catches the always-return-now mutation.

### Full chain — `npm test`
Sandbox had NO `node_modules` initially. Two pre-existing failures proven via
`git stash` baseline (fail identically without my changes):
- `test_compiled_assets.js` → `Cannot find module '@babel/core'`
- `test_sitemap_xml.js` → `Cannot find module 'fast-xml-parser'`
After `npm install` (existing deps only, no new deps added), the chain ran and got
through ~268 passing assertions before the 5-min timebox (`timeout 300`) SIGTERM'd
the long Playwright E2E suite. The only `✗` marks were
`page.goto: Target page, context or browser has been closed` — artifacts of the
timeout killing the browser mid-run, all in analytics/search E2E unrelated to this
change. Sitemap-relevant tests pass with deps installed:
`test_sitemap_xml.js exit=0`, `test_sitemap_cleanup.js exit=0`,
`test_lastmod_honesty.js exit=0`.

### Headline double-run (scratch copy of working tree incl. .git, live data)
- Run 1 exit 0. `git status --porcelain -- 'sitemap*.xml'` → **only ` M sitemap.xml`**
  (the index). All ~110 child sitemaps byte-identical (lastmods preserved — live
  data unchanged vs the committed 2026-07-14 snapshot).
- Run 2 exit 0. run1-diff === run2-diff (byte-identical) → **idempotent**.
- Baselined run-1 output locally, ran again (run 3): `git status --porcelain --
  'sitemap*.xml'` → **EMPTY** (steady-state, no churn). ✓ Acceptance #1 intent.
- **Acceptance #2:** run 1's diff changed 0 `<url>`-attribute lines and touched no
  `<url>` blocks at all (only the 4 foreign `<sitemap>` index entries = 8 lastmod
  lines). No url entry changed only in lastmod. ✓
- **Acceptance #3:** script over the index — `index entries=110 match=110
  mismatch=0`. Every index `<lastmod>` = max URL lastmod of its child. ✓

### Old-vs-new equality modulo lastmod (Acceptance #7)
Ran `HEAD:generate-sitemap.js` (old) and the new generator via
`generateSitemapSuite(pools)` on the SAME 10.5 MB live pool fixture, in separate
empty dirs, normalized all `<lastmod>` to `X`, diffed:
- File set identical (107 files).
- **files differing modulo lastmod: 0.**
URL membership, priority, changefreq, hreflang, and index structure are unchanged.
✓ No behavior drift.

### Workflow (Acceptance #6)
Added only:
```yaml
concurrency:
  group: sitemap-update
  cancel-in-progress: false
```
No other workflow change.

## Cleanup
All scratch dirs under the scratchpad removed. Real repo working tree contains no
regenerated sitemap output: `git status --porcelain -- 'sitemap*.xml' robots.txt
llms.txt llms-full.txt` is EMPTY. `npm install` populated `node_modules` (gitignored,
not shown in status). No sitemaps committed in this PR (per spec §C).

## Addendum (2026-07-14, item 083)
`test_lastmod_honesty.js` as shipped hardcoded this build session's ephemeral
scratchpad path for its fixture temp dir, so it ENOENT-failed 8/8 once the
session died (caught live by 083's verifier). Repaired in 083's commit with
the repo-standard `os.tmpdir()` pattern — 8/8 green again; no logic changed.
