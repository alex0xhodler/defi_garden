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
