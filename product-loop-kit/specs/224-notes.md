# 224 — implementation notes (deviations, conservative choices, and what stayed open)

Built 2026-08-04, one build-loop run, attempt 1. Branch `claude/loop-224-edge-telemetry`.

## Branch-name deviation (recorded first, because it looks like a rule break)
The standing ship path is `claude/loop-<item-id>` → `claude/loop-224`. That remote ref **already exists and
is not this item**: the 2026-08-04 run that built the dead-`?pool=` footer fix started as item 224, was
RENUMBERED to 230 mid-build when the strategy heartbeat landed rows 224-229 on `main`, and merged as PR #390
while keeping the original branch name (LOG.md 2026-08-04, "built as item 224; RENUMBERED to 230"). Its tip
`6c1a1a1cf` is that already-merged work. Reusing the name would have meant force-pushing over it; the ref is
also carrying ~16k files of unrelated generated-estate churn versus current `main`. This item therefore ships
on `claude/loop-224-edge-telemetry` — same convention as the existing `claude/loop-176-recovery`,
`claude/loop-223-postdeploy`, `claude/loop-230-closeout`. The PR title carries the item id, which is what the
audit log reads.

Pickup checks that were run before building: `git ls-remote origin 'refs/heads/claude/loop-224*'` (one ref,
provably the merged 230 work), open-PR list via GitHub MCP (six open PRs, none for 224), `git status` clean.

## Deviations from the spec text
1. **Worker entry point is `edge/agent-log.mjs`, not `edge/agent-log.js`.** Spec 224's acceptance criteria
   require the test to exercise the REAL Worker ("not a copy"), and the house test pattern is plain Node.
   Node picks ESM vs CJS per file from the extension or an inherited `package.json` "type"; the root
   `package.json` has none (every other `.js` here is implicitly CJS), and adding a directory-scoped
   `package.json` to `edge/` would drag `agent-log-core.js` into ESM and break the `require()` shape the
   test harness — and `src/poller-core.js`'s precedent — depend on. `.mjs` is Node's per-file escape hatch
   and wrangler's own recommended extension for a modules-format Worker; bundling is unchanged. Full
   reasoning is in the file's own header so a reader never has to find this note.
2. **`edge/wrangler.toml`'s `main = "agent-log.mjs"`** (config-relative), not the repo-root-relative
   `edge/agent-log.mjs`, which would resolve to `edge/edge/agent-log.mjs`. Noted inline in the config.
3. **The agent surface classified is WIDER than the spec's four bullets** — `/.well-known/**`,
   `/openapi.json`, `/tools/*.json` are included as path class `well_known`. This is the razor's second side:
   `.vercelignore`'s header documents those as live agent-discovery assets, so a logger that skipped them
   would be a check narrower than the class it guards, blind precisely where an agent's first request lands.
   The slice is separable at query time (`path_class`), so nothing is conflated.

## Conservative choices
- **Pass-through is the first statement and the response object is returned by identity** — no clone, no body
  read, no header rebuild. Byte parity holds by construction rather than by care, which is also why the
  parity test can assert the same `Response` instance comes back with its body still unread.
- **Logging is scheduled, never awaited** (`ctx.waitUntil`), and the entire logging path is wrapped so a
  missing binding, a thrown classifier, a synchronous `prepare()` throw, or a rejected `run()` all degrade to
  silence. Serving is the only thing this Worker is allowed to be load-bearing for.
- **Nulls stay null.** Absent `status` and absent `bot_score` are recorded as `NULL`, never coerced to `0` —
  "no score available" and "a score of zero" are different facts and the heartbeat must be able to tell them
  apart.
- **Unbounded strings are capped** (path 512 / ua 512 / accept 256 / referer 512) so a hostile UA cannot bloat
  a D1 database that is shared with `pool_history`.
- **No credentials, IDs or secrets in the diff.** `database_id` is a `REPLACE_WITH_…` placeholder; the human
  deploys.

## Class rule — answered honestly
**Instance of:** instrument-blindness to consumers that never execute `analytics.js`. Population = every
non-JS reader of the site (AI crawlers, agents, curl, feed readers).
**Class closed?** For the *read-visibility* class on the proxied domain: **yes, by construction once the human
deploys** — the Worker sits on `www.defi.garden/*` and classifies by path/Accept, not by an enumerated list of
crawler names, so an AI agent nobody has heard of yet is still logged (its `ua_family` is `other`, which is a
recorded fact, not a dropped row). The classifier is extension/prefix-based (`*.md`, `/.well-known/**`,
`/api/*`), so a NEW markdown-twin directory or a new API route is covered without a code change — that was the
specific weakness to avoid.
**What stays open, with numbers:** (a) requests that never reach Cloudflare — 0 by construction after the DNS
proxy flip, but **non-zero until the human performs it**, and there is no in-repo instrument that can tell us
it happened; (b) **HTML page reads by agents are NOT logged** — the surface is agent-shaped assets only, so an
LLM that scrapes `tokens/usdc.html` instead of `tokens/usdc.md` is still invisible (~4,300 generated HTML
pages, versus ~4,300 md twins that are covered); this is the spec's own scope and is left open deliberately;
(c) **no retention prune runs** — see below.

## Left open, with a ticket
**Backlog 232 — `agent_reads` has no automated retention prune.** `RETENTION_DAYS = 30` and
`retentionCutoff()` are implemented and unit-tested, but this Worker exposes only `fetch()`; there is no
`scheduled()` Cron Trigger calling them (spec 224's Change list didn't ask for one and inventing it would have
been scope creep). Until 232 ships, `agent_reads` grows one row per agent-surface request forever.
`edge/DEPLOY.md` gives the human a manual prune command as the stopgap.

## Verification actually run (all re-run by the operator, not taken on the builder's word)
- `node test_agent_log.js` → `761/761 assertions passed`
- `node test_test_registry.js` → `5/5` (proves the new test file is registered in `test:serial`, no orphan)
- `node test_vercelignore.js` → `151 assertions passed`, `/edge/ (5 files)` in the excluded set
- `node run-tests.js --list --lane=plain | grep agent_log` → `test_agent_log.js  plain`
- `node run-tests.js --lane=plain --jobs=4` → `TOTAL pass=48 fail=0 timeout=0 total=48`
- **Non-vacuity, two sub-rules neutered separately** (so "two working rules" is distinguishable from "one
  working rule and one dead one"):
  - md-twin rule `.md` → `.mdX` → RED: `expected pathClass 'md_twin', got null` on a REAL pool twin drawn
    from disk. Restored; `md5sum` identical before/after (`abdd0707cffff41627489fd182b90def`),
    `git diff --exit-code` → 0; re-run → `761/761`.
  - markdown-negotiation rule `text/markdown` → `text/markdownX` → RED (classifier returns null where a row
    was expected). Restored byte-identical by the same md5sum; re-run → `761/761`.
- Browser lane NOT run: this diff touches no render path, no product file, no generated page — the only
  edited existing files are `package.json`'s `test:serial` chain, `.vercelignore` and `test_vercelignore.js`.
  Recorded rather than claimed-green.

## What cannot be verified in-loop
The Worker has never executed on Cloudflare — no credentials in a loop session, by policy. Everything above
is the real module under a faked `fetch`/`ctx`/`env.DB`, plus the real on-disk estate for classification.
The first true end-to-end proof is the human's `edge/DEPLOY.md` §Verify step after deploying.

## Verifier round 1 — FAIL, and what it found

**The finding.** `test_agent_log.js`'s section E asserted DEPLOY.md↔code parity with a single
`deployMd.includes(core.DAILY_READS_QUERY)`. `edge/DEPLOY.md` states the query TWICE: once as an
illustrative fenced ` ```sql ` block (~line 124), and once inside the actual copy-pasteable
`wrangler d1 execute --command "..."` a human will literally run against prod D1 (~line 136). The
verifier mutated ONLY the runnable command's copy (`reads DESC` → `reads ASC`) and left the illustrative
copy untouched. `.includes()` is satisfied by finding the exact string ANYWHERE in the file, so the
untouched illustrative copy alone made the assertion pass — the test stayed GREEN at 761/761 while the
copy a human would actually paste into a shell had silently drifted from the code. This is the repo's
RAZOR §5 / item-212 pattern: a guard watching something that RESEMBLES the mechanism (the doc
contains the string somewhere) rather than the mechanism itself (every stated copy of the runbook
command matches the code), which launders the gap as coverage.

**Which copy could actually drift undetected.** Specifically the runnable-command copy (~line 136) —
the one a human executes against production D1 without necessarily reading `edge/agent-log-core.js`
first, per this runbook's own stated design ("Nothing below requires reading `edge/agent-log.mjs` or
`edge/agent-log-core.js`"). That is the worst copy to have silently drifted: a wrong `ORDER BY` on a
prod query a human trusts unread.

**The fix.** Replaced the single `.includes()` check with a scan of the FULL text of `edge/DEPLOY.md`
for every occurrence of the query, found by a shape-based signature (everything in
`core.DAILY_READS_QUERY` up to its `ORDER BY` clause, derived from the live constant rather than
hardcoded as "there are two, at lines 124 and 136"), with the `ORDER BY ...;` tail left as a wildcard
so the scan is not evaded by exactly the class of drift found here. Every occurrence found is asserted,
individually, to be byte-identical to `core.DAILY_READS_QUERY`; the failure message names which
occurrence (by index and line number) and prints both strings. A separate assertion requires at least
one occurrence to exist, so a DEPLOY.md that dropped the query entirely fails loudly instead of
vacuously passing an empty scan. No text normalization was needed — both real copies in DEPLOY.md are,
as written, already byte-identical to `DAILY_READS_QUERY`.

**Non-vacuity proof (all four cases run and confirmed):**
- Mutated ONLY the illustrative ` ```sql ` copy (line 130, `reads DESC` → `reads ASC`) → RED, failure
  named "occurrence #1 ... starting at line 124" and printed both strings. Restored; `md5sum` of
  `edge/DEPLOY.md` identical before/after (`8389dcfc4c15da886626a32618a4d9e7`), `git diff --exit-code`
  → 0; re-run → GREEN, 764/764.
- Mutated ONLY the runnable `wrangler d1 execute --command "..."` copy (line 142, `reads DESC` →
  `reads ASC`) — the exact copy that stayed green under the old assertion — → RED, failure named
  "occurrence #2 ... starting at line 136". Restored byte-identically (same md5sum,
  `git diff --exit-code` → 0); re-run → GREEN, 764/764.
- Deleted both copies of the query text from `edge/DEPLOY.md` entirely → RED on the "at least once"
  assertion ("found 0 — the runbook may have dropped it entirely"). Restored byte-identically (same
  md5sum, `git diff --exit-code` → 0); re-run → GREEN, 764/764.
- Mutated `DAILY_READS_QUERY` itself in `edge/agent-log-core.js` (`reads DESC` → `reads ASC`), DEPLOY.md
  left untouched → RED (both DEPLOY.md copies now mismatch the changed code; failure named "occurrence
  #1"), proving the guard also catches code drifting away from an unchanged doc, not only the reverse.
  Restored byte-identically (`md5sum` of `edge/agent-log-core.js` identical before/after,
  `abdd0707cffff41627489fd182b90def`; `git diff --exit-code` → 0); re-run → GREEN, 764/764.

Assertion count for section E went from 2 to 5 (761 → 764 total), reflecting the new sanity check on
the signature split, the "at least one occurrence" assertion, and one `eq()` per occurrence found
(currently 2) instead of a single `.includes()`.

**Prose corrected to match what the guard now actually proves** (no more "the two never drift apart" /
"cannot drift from the code" — that phrasing described a guard stronger than the one that existed):
`edge/agent-log-core.js`'s comment above `DAILY_READS_QUERY`, `edge/schema.sql`'s comment above the
`agent_reads` index, `edge/DEPLOY.md`'s own §6 intro text, and `product-loop-kit/specs/224-pr.md`'s
description of `test_agent_log.js`. Each now says: every occurrence of the query stated in
`edge/DEPLOY.md` is individually asserted byte-identical to `DAILY_READS_QUERY`.

### Operator's own re-verification of the round-1 fix (not taken on the fixer's word)
Independently mutated ONLY the runnable `wrangler d1 execute --command "…"` copy in `edge/DEPLOY.md`
(`ORDER BY day DESC` → `ORDER BY day ASC` on the LAST occurrence — the exact copy that stayed green
before the fix): `node test_agent_log.js` went RED with the occurrence-naming failure message. Restored,
`git diff --exit-code` clean, re-run → `764/764 assertions passed`. Full plain lane after the fix:
`TOTAL pass=48 fail=0 timeout=0 total=48`.

One operator slip worth recording, because it is a trap for the next run: the restore was done with
`git checkout -- edge/DEPLOY.md`, which reverts to the COMMITTED file and therefore also discarded the
fixer's uncommitted prose correction in that same file. Caught by re-reading the diff afterwards
(`git diff --stat` showed `edge/DEPLOY.md` gone from the changed set) and re-applied by hand. When
mutation-testing a file that also carries UNCOMMITTED work, restore from a saved copy of the working-tree
version — never from the index.

## Verifier round 2 — FAIL, and what it found

**The finding.** Round 1's fix located every occurrence of the daily-reads query in `edge/DEPLOY.md`
by a regex anchored on a SIGNATURE built from `DAILY_READS_QUERY`'s own text — everything up to (but
not including) `ORDER BY` — with only the `ORDER BY ...;` tail left as a wildcard. That signature is
~90% of the query: `SELECT`, the full column list, `FROM agent_reads`, `GROUP BY day, ua_family`. The
verifier mutated the PREFIX instead of the tail and found the region simply stopped matching the scan:

- `FROM agent_reads` → `FROM agent_read` in the illustrative fenced block
- `SELECT` → `select` in the runnable command
- `ua_family` → `ua_famly` (a realistic typo) in the runnable command

In all three cases the occurrence count silently dropped from 2 to 1, the surviving copy (still
correct) passed its own `eq()`, and `test_agent_log.js` exited 0 at 763/763 — CI green,
`run-tests.js` only checking exit code. **Reproduced independently before writing any fix**: mutating
only the illustrative block's `FROM agent_reads` → `FROM agent_read` dropped the reported occurrence
count from 2 to 1 while the test still exited 0.

**Why the round-1 fix was still a resemblance, not the mechanism.** Round 1 correctly diagnosed "a
guard watching whether the doc contains the string somewhere" as too weak, and replaced it with "find
every occurrence and check each individually" — genuine progress, since it did catch drift in the
`ORDER BY` tail (the round-1 verifier's own case). But *which text counted as an occurrence* was still
decided by matching against the query's own content. Region-finding and content-checking were the same
regex. Any drift landing in the ~90% of the query used as the match anchor made the "occurrence" vanish
from the scan rather than fail it — the comparison target's own content decided whether it was even a
candidate for comparison. This is the same class of bug as round 1 (RAZOR §5 / item-212 pattern: a
check that resembles verifying the mechanism without doing so) wearing a different disguise, and it is
why "narrow the regex further" or "add more wildcards" was rejected as a fix — every additional
anchored literal is one more thing whose own drift can make the region disappear.

**The two-move fix.**
1. **Reduce the drift surface.** `edge/DEPLOY.md` §6 previously stated the query TWICE: an illustrative
   fenced `` ```sql `` block and the runnable `wrangler d1 execute --command "..."` block. The
   illustrative copy was deleted outright — the runbook loses nothing, since the surrounding prose
   already explains what the query answers, and one fewer stated copy is one less place for drift to
   hide, not a workaround.
2. **Locate the remaining copy structurally.** The runnable block is now wrapped in
   `<!-- DAILY_READS_QUERY:begin -->` / `<!-- DAILY_READS_QUERY:end -->` HTML-comment markers, each
   required to be the sole content of its own line, sitting outside the fenced block so the
   copy-pasteable command is byte-for-byte untouched (verified by reading the block back after the
   edit). `test_agent_log.js` section E now:
   - finds marked regions by the markers ALONE (an exact-line match, immune to prose elsewhere in the
     file that merely *mentions* the marker text in backticks);
   - asserts begin/end marker counts are equal and non-nested, with each end strictly after its begin —
     a malformed/unpaired marker fails explicitly instead of silently producing zero regions;
   - asserts the region count equals a documented constant `EXPECTED_DEPLOY_MD_QUERY_COPIES = 1` (not
     `>= 1` — that was precisely what let the round-2 finding hide: a `>=1` check cannot see a count
     drop from 2 to 1), naming the shortfall/surplus on failure;
   - extracts the fenced block from the (now sole) marked region, asserts it starts with the documented
     wrapper prefix `wrangler d1 execute defi-garden-history --remote --command "` and ends with `"`
     (so wrapper drift, e.g. `--remote` → `--local`, is caught explicitly rather than silently stripped
     off before the comparison), and byte-compares the entire remainder against `core.DAILY_READS_QUERY`,
     printing both strings on mismatch;
   - runs an anti-smuggling check: any line OUTSIDE a marked region matching `/FROM\s+agent_reads/i`
     fails unless its exact text is on a documented allowlist. `edge/DEPLOY.md` legitimately contains two
     OTHER, different `agent_reads` queries — §5's verification `SELECT` and the Territory-notes prune
     `DELETE` — allowlisted by their exact current line text (not a fuzzy pattern), so any future change
     to either line is a visible diff to the allowlist too.

Region-finding no longer depends on the query's own content in any way; every corruption inside the
marked region now fails byte-equality instead of vanishing from consideration.

**The residual gap, named plainly.** A future copy added OUTSIDE the marked region that also avoids the
literal substring `/FROM\s+agent_reads/i` (case/whitespace-insensitive) is not caught by anything in
this test. The marker convention plus the smuggling allowlist is a documented contract this test
polices, not a proof that no other textual copy of this query could ever appear anywhere in
`edge/DEPLOY.md`. This is stated explicitly in `edge/DEPLOY.md` §6, in `edge/agent-log-core.js`'s
comment above `DAILY_READS_QUERY`, and in `test_agent_log.js` section E's own comments.

**Prose corrected again** (the round-1 prose already overstated things by round-2's own standard —
"no copy here ... can drift from the code unnoticed" was falsified by this very finding): `edge/DEPLOY.md`
§6's intro, `edge/agent-log-core.js`'s comment above `DAILY_READS_QUERY`, `edge/schema.sql`'s comment
above the `agent_reads` index, and `product-loop-kit/specs/224-pr.md`'s description of the test all now
state exactly what is enforced — a single marked region, a pinned count, structural (marker-based)
location, byte-identity including the wrapper, plus the named residual gap — instead of an absolute
"cannot drift unnoticed" claim.

### Non-vacuity (verbatim, all seven mutations, plus the full lane)

Setup: `cp edge/DEPLOY.md /tmp/deploy.bak` and `cp edge/agent-log-core.js /tmp/agent-log-core.bak`
taken AFTER this round's fix was applied (both files already carry this round's uncommitted prose/code
changes, so they were restored from these saved copies, never from `git checkout --`, per the round-1
operator's own documented trap above). `md5sum` before: `edge/DEPLOY.md` =
`ed9e43946ebfa021ad798996aa1d446b`, `edge/agent-log-core.js` = `59410f66a621e223157267c323fd8d5d`.
`git diff -- edge/DEPLOY.md` and `git diff -- edge/agent-log-core.js` were also snapshotted (each
hashed to `003f5f2d4def274af98e68368b4b3ed5` and `77a24a93f3a2ba68961b9cf8c40c1f4a` respectively) so
"restored" could be verified even though both files have legitimate uncommitted diffs vs. `HEAD` from
this round's own fix (plain `git diff --exit-code` alone can't distinguish "back to baseline" from
"still has our fix" on a file that already differs from `HEAD`; comparing the diff's own hash
before/after each mutation closes that gap).

**Reproduction, before any fix (see also the "reproduce it first" instruction above):**
Mutating only the illustrative block's `FROM agent_reads` → `FROM agent_read` (pre-fix DEPLOY.md, two
stated copies, round-1's occurrence-scan guard in place) dropped the reported occurrence count from 2
to 1 and `node test_agent_log.js` still exited 0 — confirmed the bug is real before writing the fix.

**1a. `FROM agent_reads` → `FROM agent_read`** (inside the marked block) → RED:
```
AssertionError [ERR_ASSERTION]: ... 'FROM agent_read\n' + 'GROUP BY day, ua_family\n' ...
expected: 'SELECT\n' ... 'FROM agent_reads\n' 'GROUP BY day, ua_family\n' 'ORDER BY day DESC, reads DESC;'
operator: 'strictEqual'
```
Restored: `md5sum edge/DEPLOY.md` → `ed9e43946ebfa021ad798996aa1d446b` (matches baseline);
`git diff -- edge/DEPLOY.md | md5sum` → `003f5f2d4def274af98e68368b4b3ed5` (matches pre-mutation diff).

**1b. `SELECT` → `select`** (in the runnable command's opening line) → RED, same byte-equality
mismatch shape as 1a (`select\n...` vs. expected `SELECT\n...`). Restored: same md5sums as above
(`ed9e43946ebfa021ad798996aa1d446b` / `003f5f2d4def274af98e68368b4b3ed5`).

**1c. `ua_family` → `ua_famly`** (first occurrence inside the marked block) → RED, same
byte-equality mismatch shape. Restored: same md5sums as above.

**2. Tail mutation `reads DESC` → `reads ASC`** (the round-1 case, proving it still fails under the
new mechanism) → RED:
```
actual:   '... ORDER BY day DESC, reads ASC;'
expected: '... ORDER BY day DESC, reads DESC;'
```
Restored: same md5sums as above.

**3. Wrapper drift `--remote` → `--local`** → RED, on the wrapper-prefix assertion specifically
(not swallowed into the query-body comparison):
```
AssertionError [ERR_ASSERTION]: edge/DEPLOY.md region #1's fenced block must start with the documented
wrapper prefix "wrangler d1 execute defi-garden-history --remote --command \""; got:
"wrangler d1 execute defi-garden-history --local --command \"SELECT\n  date(ts, 'unixepoch') "
```
Restored: same md5sums as above.

**4. Delete the `<!-- DAILY_READS_QUERY:begin -->` marker only (malformed pair)** → RED, on the
marker well-formedness check, NOT a silent zero-regions pass:
```
AssertionError [ERR_ASSERTION]: edge/DEPLOY.md has 0 "<!-- DAILY_READS_QUERY:begin -->" marker(s) but
1 "<!-- DAILY_READS_QUERY:end -->" marker(s) — an unpaired/malformed marker must fail here, not
silently yield zero regions.
```
Restored: same md5sums as above.

**5. Delete the whole marked region** → RED, on the pinned count:
```
AssertionError [ERR_ASSERTION]: edge/DEPLOY.md must state the daily-reads query in exactly 1 marked
DAILY_READS_QUERY region(s); found 0 (shortfall of 1) — a copy was silently deleted or an extra one was
added.
```
Restored: same md5sums as above.

**6. Add a SECOND, unmarked copy elsewhere in `edge/DEPLOY.md`** (a new "Scratch appendix" section
with a byte-identical, but unmarked, runnable block) → RED, on the anti-smuggling check:
```
AssertionError [ERR_ASSERTION]: edge/DEPLOY.md line 202 contains "FROM agent_reads" OUTSIDE any marked
DAILY_READS_QUERY region and is not on the documented allowlist — this looks like a smuggled, unmarked
second copy of the daily-reads query.
```
Restored: same md5sums as above.

**7. Mutate `DAILY_READS_QUERY` in `edge/agent-log-core.js`** (`reads DESC` → `reads ASC`),
`edge/DEPLOY.md` left untouched → RED (the doc's unchanged marked copy now mismatches the changed
code):
```
expected: '... ORDER BY day DESC, reads ASC;'   // from the mutated core.js
actual:   '... ORDER BY day DESC, reads DESC;'  // from the untouched DEPLOY.md region
operator: 'strictEqual'
```
Restored: `md5sum edge/agent-log-core.js` → `59410f66a621e223157267c323fd8d5d` (matches baseline);
`git diff -- edge/agent-log-core.js | md5sum` → `77a24a93f3a2ba68961b9cf8c40c1f4a` (matches
pre-mutation diff).

**Full-suite confirmation after all seven mutations were restored:**
- `node test_agent_log.js` → `769/769 assertions passed` (section E now prints "found 1 marked
  DAILY_READS_QUERY region(s) in edge/DEPLOY.md, all byte-identical to DAILY_READS_QUERY; no unmarked
  copies found")
- `node test_test_registry.js` → `5/5 assertions passed`
- `node test_vercelignore.js` → `151 assertions passed`
- `node run-tests.js --lane=plain --jobs=4` → `TOTAL pass=48 fail=0 timeout=0 total=48`
- `git status --short` shows only the files this round intentionally changed (`edge/DEPLOY.md`,
  `edge/agent-log-core.js`, `edge/schema.sql`, `test_agent_log.js`,
  `product-loop-kit/specs/224-pr.md`, `product-loop-kit/specs/224-notes.md`); `git diff --stat`
  confirms no residual mutation content in any of them.

Assertion count for the file went from 764 to 769: the marker-based section E now runs marker-count
parity, marker well-formedness, the pinned-count check, the sanity check, and per-region wrapper-prefix
+ wrapper-suffix + byte-identity checks (3 per region instead of 1), plus the anti-smuggling scan
(one `ok()` per matching-but-unmarked line found, currently 0 in the clean file) — net +5 versus
round 1's 764.

### Operator's own re-verification of the round-2 fix
Run independently of the fixer, each mutation applied to the working tree and restored from a saved copy
(never `git checkout --`, which on round 1 destroyed an uncommitted edit — see the slip recorded above):

- **Prefix drift INSIDE the marked region** (`ua_family,` → `ua_famly,` — the exact class that silently
  passed in rounds 1 and 2): `node test_agent_log.js` exit **1**, failing on the property that matters —
  `edge/DEPLOY.md region #1's marked copy of the daily-reads query is NOT byte-identical to
  agent-log-core.js's DAILY_READS_QUERY`, with both strings printed.
- **Whole marked region deleted**: exit **1** (pinned-count assertion).
- **A second, UNMARKED copy of the query appended elsewhere in the file**: exit **1** —
  `edge/DEPLOY.md line 200 contains "FROM agent_reads" OUTSIDE any marked DAILY_READS_QUERY region and is
  not on the documented allowlist`.
- Restored file md5 `ed9e43946ebfa021ad798996aa1d446b` after every mutation; `node test_agent_log.js` →
  `769/769 assertions passed` each time.

Two process notes worth carrying forward, both from mistakes made in this very re-verification:
1. A first attempt at the prefix mutation edited the FIRST `ua_family,` in the file, which is in §5's
   unrelated verify query — it went red, but on the anti-smuggling allowlist, not on byte-identity. A
   mutation that goes red for the wrong reason is not evidence for the rule you meant to test; the
   mutation was retargeted to sit strictly inside the marked region before the result was accepted.
2. A first attempt at the smuggling mutation failed to apply at all (shell quoting mangled the heredoc),
   and the test then passed — which would have read as "the guard doesn't catch smuggling" if the applied
   diff hadn't been checked. **Always confirm the mutation actually landed before believing its verdict.**

## Verifier round 3 — FAIL, attempt budget exhausted, item PARKED

**What round 3 found.** The marker mechanism itself held: the verifier ran six distinct extension probes
against it (marker malformed, nested, reordered, duplicated, fence removed, trailing prose on the marker
line) and every one failed loudly and correctly, and the three round-2 prefix drifts (`FROM agent_read`,
`select`, `ua_famly`) now go RED on byte-identity inside the marked region. **Rounds 1 and 2 are genuinely
closed** — that is the verifier's own wording.

The remaining defect is in the SECONDARY anti-smuggling backstop, which is a per-line scan
(`/FROM\s+agent_reads/i` over `deployMd.split('\n')`). A second, unmarked, genuinely drifted copy of the
runnable command added elsewhere in `edge/DEPLOY.md` evades it whenever `FROM` and `agent_reads` do not
land on the same physical line — demonstrated with an ordinary SQL reflow:

```
FROM
agent_reads
```

→ `node test_agent_log.js` exit 0, `769/769`, console printing "no unmarked copies found", while a copy
with a wrong `ORDER BY ... ASC` sat undetected in the file. The same copy written on one line IS caught.
That is not an adversarial trick — it is how someone would reasonably reformat SQL.

And the disclosure overstates it in two of the five places: `edge/DEPLOY.md` §6 ("fails if any OTHER line
in this file, outside a marked region, looks like a second, unmarked copy of this query") and
`specs/224-pr.md` ("flags any OTHER, unmarked line outside that region that looks like a smuggled second
copy"). Both "what this does NOT catch" notes name only allowlist evasion and never mention that a line
break defeats the check. `edge/agent-log-core.js` and `edge/schema.sql` are worded conservatively enough
to be accurate.

**The fix the verifier specified** (for whoever picks this up): strip the marked regions from the text,
collapse ALL whitespace runs including newlines to single spaces in the remainder, then test
`/FROM\s+agent_reads/i` against that normalized full text rather than per raw line — keeping the exact-line
allowlist working against the same normalization. Then correct the two overstated sentences, and use the
line-split smuggled copy as the non-vacuity proof alongside the existing ones.

**Why this is PARKED and not fixed.** NORTH_STAR's budget is 3 build-loop attempts per item, then park with
notes (`prompts/build.md` §4: "Parking is success — an honest dead-end recorded beats a fourth blind
attempt"). This was attempt 3. The fix above is precise rather than blind, so parking here is a budget
decision, not a technical dead-end — and that is exactly the call the budget exists to hand back to the
human.

**What the human is actually deciding.** The Worker — the thing item 224 exists to build — passed all six
of the spec's acceptance criteria in all three rounds, independently re-derived each time: pass-through
byte parity (extended to streaming bodies), D1-outage and thrown-classifier robustness, shape-based
classification verified against brand-new directories/routes/UAs, real-estate population tests, and the
runbook. Nothing the verifier found in any round touched it. All three FAILs were about a documentation
mirror the loop invented under the razor rule — the spec asked only that the heartbeat read be
"documented". So the choice is:
- **Merge PR #392 as it stands** — ships the verified instrument; the residual is that a hypothetical
  future unmarked copy of one SQL query in one runbook could drift undetected if reflowed across lines.
- **Let the next run apply the named fix first** — cheap and specific, but the instrument stays unbuilt
  until then, and leg (A) of the north star stays unreadable meanwhile.

Either way the deploy is human-owned and unchanged: `edge/DEPLOY.md`.
