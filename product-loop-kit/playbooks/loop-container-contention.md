# loop-container-contention — playbook

When: a subagent reports that files are changing under it — comments rewritten, spec files renamed,
`signals/audit-findings.json` overwritten, `EADDRINUSE` on the audit/test ports, Chromium processes it
didn't spawn — and concludes "a second Claude session is sharing this container."

Answer in one line: it is almost always **your own orchestrator session** editing the tree while the
subagent runs, not a rogue third party — subagents share the operator's working tree, so an orchestrator
edit is indistinguishable from an intruder.

Steps:
1. Identify the branch the "other session" is on (`ps aux`, or the subagent's own report). If it matches
   the harness-pinned branch from THIS session's system prompt (e.g. `claude/quirky-hypatia-*`), the
   other session is you. Stop looking for an intruder.
2. Decision rule — who owns the file right now?
   - A running subagent owns every file it was told to write (`audit-app.js`, its test, its notes).
   - The orchestrator owns bookkeeping the subagent was never told about (`BACKLOG.md`, `LOG.md`,
     `specs/<id>-pr.md`).
   - Overlap → the subagent wins until it exits. Queue your edit.
3. If you already edited a subagent-owned file mid-run: do NOT re-apply it while the agent is live. Wait
   for the completion notification, prove the tree is quiescent (poll `stat -c '%Y'` on the touched files
   until two consecutive reads match), then apply the edit once.
4. Before trusting any subagent claim about "the other session", check the claim yourself with a tool the
   subagent lacks (GitHub API, `git ls-remote`). Item 162's verifier could not tell whether PR #316 was
   real; one `list_pull_requests` call settled it.
5. Restore, then re-verify: `git status --short` for stray files (`signals/audit-findings.json` is the
   usual casualty — `git checkout --` it), and confirm the code diff is byte-stable (`md5sum`) before
   accepting a verdict produced during the contention window.

Resolution:
- Contention confirmed as self-inflicted → record it plainly in `<id>-notes.md` (the agents' reports stay
  as written; add the resolution above them), keep the verdict if the code diff was byte-stable.
- Contention from a genuinely separate session → stop, do not push, and flag the human: two loops on one
  tree can produce a commit neither of them authored.

Traps:
- **Renumbering mid-run.** An ID collision found mid-build (another session's unmerged PR holding your
  next ID) feels urgent. It isn't — the ID is bookkeeping, the build is not. Renumber after the agents
  exit; renaming their spec out from under them costs a restore cycle in both the builder and verifier.
- **Unmerged PRs hold IDs invisibly.** `BACKLOG.md` on `main` cannot show an ID claimed by an open PR
  (the status change ships in the same commit as the code — the 2026-07-13 rule). Allocating the next ID
  needs `list_pull_requests` + `git ls-remote 'refs/heads/claude/loop-*'`, not just the backlog table.
- **Default output paths.** Any tool a subagent runs that writes a committed artifact (`audit-app.js` →
  `signals/audit-findings.json`) will dirty the diff. Point runs at a scratch `outPath`/`AUDIT_OUT`, and
  check that path in `git status` before committing.
- A subagent's "someone is attacking my tree" framing is honest reporting under uncertainty — don't
  discount its verdict for it, and don't copy the intruder framing forward into the shipped notes once
  you know better.

Provenance: item 162 (2026-07-27) — both the build agent and the verifier independently reported a
"second live session"; it was the orchestrator renumbering 161 → 162 after finding open PR #316 holding
ID 161 and branch `claude/loop-161`. Verdict stood (PASS 8/8, LOW) because the code diff was byte-stable
throughout. See `specs/162-notes.md` "Environment anomaly".
