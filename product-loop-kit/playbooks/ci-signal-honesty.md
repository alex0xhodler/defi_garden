# ci-signal-honesty — playbook

**When:** a CI step (usually in `.github/workflows/`) prints a success/health line — `✅ …`, "notified",
a count, "done" — and you suspect the log is green while the underlying action did nothing (or the metric
is structurally wrong). A "misleading green."

**Also when** (item 149, the silent variant): a *script* reports its verdict through a durable artifact
(`signals/*.json`, a report file, a committed count) and can die before writing it. Same lie, delivered by
silence instead of an echo.

**Answer in one line:** if a step can print success without its real work succeeding, the green is a lie —
delete the dead work or fix the signal to reflect reality; never leave a reassuring line over a no-op. And
if a run can END without writing its verdict, the *previous* verdict becomes the lie.

## Steps
1. **Find the claim vs. the work.** Read the step's `run:` block. Separate the *echo* (what the log claims)
   from the *command* (what actually ran). A misleading green is an unconditional `echo "✅ …"` after a
   command that is `|| echo "… failed"`-guarded (so failure never fails the step) or that hits a dead
   endpoint / computes against the wrong shape.
2. **Prove the work is actually dead.** Don't assume — confirm the specific failure:
   - Deprecated endpoint → web-search the endpoint + "deprecated"; a dead ping returns 404/410. (Google
     `google.com/ping?sitemap=` = 404 since 2023; Bing `bing.com/ping?sitemap=` = 410 since 2022 — both
     superseded by IndexNow. Item 141.)
   - Wrong-shape metric → run the exact command against the real artifact. (`grep -c '<url>' sitemap.xml`
     reads 0 because the index split into a `<sitemapindex>` whose URLs live in child files. Item 078.)
3. **Check for a live replacement already in the repo.** Before removing, confirm no capability is lost:
   is there another step doing the real job? (IndexNow step `node indexnow-ping.js`, verified HTTP 200, is
   the live search-engine notification path — so removing the dead Google/Bing ping loses nothing.)
4. **Decision rule:**
   - Dead work with a live replacement present → **delete the whole dead step** (not just one line —
     sibling lines in the same step are often equally dead, and the echo is the actual dishonesty).
     Leave a short `# NOTE:` comment saying why it's gone.
   - Signal computes the wrong thing but the underlying work is real → **fix the signal** to reflect reality
     (correct the count/shape), preserve an HONEST zero (`set -eo pipefail`-safe), don't paper over it.

## Resolution
- Removal/fix lands as a single workflow-file edit. Tier **HIGH** — any `.github/workflows/` edit is
  config/infra regardless of diff size (NORTH_STAR risk policy). Not on the NEVER list → auto-merges after
  verifier PASS; write the `specs/<id>-pr.md` explainer + 5-question quiz first (HIGH gate).
- Live proof is post-merge: the next scheduled run's log shows the dishonest line gone and the real
  step still reporting its true status. Note that in the LOG/spec — there's no Mixpanel metric for CI honesty.

## Traps
- **Don't grep your own comment.** If your explanatory `# NOTE:` embeds the literal dead endpoint/echo
  string, a "zero references remain" assertion trips on your comment. Reword the comment to describe, not
  quote, the removed strings.
- **`|| echo "… failed"` hides failure.** A step guarded this way is green even when the command errors —
  presence of that pattern is itself a smell that the log can't be trusted.
- **Verify at the real artifact, not a stand-in.** Item 078's bad count only reproduces against the split
  sitemap index, not a single flat file.
- **A stale artifact is a green nobody printed.** If the only durable output is a file, ask: *what does the
  next reader see if this run dies?* If the answer is "yesterday's file, unchanged," the crash is
  indistinguishable from a clean run. Fix by writing an explicit failure shape (`status: "DID_NOT_RUN"`,
  empty result arrays, the reason) **to the real path**, overwriting the stale verdict, then exiting
  non-zero — destroying the old result is the point, not a hazard. Give successes a matching positive field
  (`status: "OK"`) so the reader checks one field instead of inferring health from an empty findings array.
- **Crash-before-write hides in the boring lines.** 149's was a module-level `require()` of a dependency
  that was declared *and* installed — just not where a fresh clone looks. Anything above the first write
  (imports, arg parsing, config reads) is in the danger zone; resolve it lazily or fail loudly.

**Provenance:** item 141 (dead Google/Bing sitemap-ping step, specs/141.md); item 078 (dead
`grep -c '<url>' sitemap.xml` health count in the daily commit message, first occurrence of this class);
item 149 (`audit-app.js` crashing on `require('playwright')` in a fresh clone, writing no findings file so a
crashed run read as "audit clean" — first *silent* occurrence, specs/149.md).
