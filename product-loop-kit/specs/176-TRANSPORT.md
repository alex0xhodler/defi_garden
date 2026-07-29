# 176 — transport note: why this landed as patches, and why it is numbered 176

**This item is fully built and verifier-PASSed (9/9, tier HIGH). It could not be *transmitted* normally,
and it had to be renumbered mid-run. Neither is a defect in the work itself.**

## Two things went wrong in the plumbing

### 1. `git push` is unavailable in the cloud session

Measured, not inferred:

- `git push` → `HTTP 413 Request Entity Too Large` from the harness git proxy
  (`http://local_proxy@127.0.0.1:41729/git/…`) on `git-receive-pack`. Reproduced ~10 times, across HTTP/1.1
  and HTTP/2, with and without a raised `http.postBuffer`.
- **It is not a size problem.** A push carrying *zero new objects*
  (`git push origin origin/main:refs/heads/<probe>`) gets the same 413. The preceding 4-byte POST returns
  200; only `git-receive-pack` is refused.
- The session's `GH_TOKEN` / `GITHUB_TOKEN` are **read-only**: `GET` returns 200, but `POST /git/blobs` and
  `PUT /contents/…` both return
  `403 "Write access to this GitHub API path is not permitted through this proxy."`
- That leaves only the GitHub MCP tools, whose file contents must be **authored by an LLM inside the tool
  call**. That works for small files and fails on large ones: transmitting `product-loop-kit/LOG.md`
  (571,303 bytes) and `BACKLOG.md` (221,917 bytes) that way produced truncated and duplicated commits
  before fetch-back verification caught it.

So the change ships here as **small, individually SHA-verified files** instead. Every file in this bundle
was checked after upload by comparing GitHub's returned blob SHA against `git hash-object` locally — git
blobs are content-addressed, so those equalities are byte-for-byte proofs, not spot checks.

### 2. A concurrent heartbeat took the number 173

This build run promoted its item as **173** and wrote `specs/173.md` locally at ~06:00 UTC. At **07:21 UTC**,
while the build was still running, a heartbeat session committed `c684643` directly to `main` and created
its own `specs/173.md`, `174.md` and `175.md` (three real product findings — SEO-CTA dead-ends, a 100×-off
trust-filter claim, and a level-3 link signal). `main` is the source of truth for backlog numbering, so
**this item is renumbered 176**; the heartbeat's 173/174/175 keep their numbers and are untouched by this
branch.

Same failure mode as the 2026-07-28 report's "this tick was lapped". Worth noting the loop has now hit it
twice in two days.

**Consequence to be aware of when reading the bundle:** the code comments, the test file, `176-code.patch`
and `176-ledger.patch` were all written before the collision was visible, so they refer to the item as
**173** internally. That is cosmetic — rename on apply if you care. The `BACKLOG.md` row id in
`176-ledger.patch` **does** need changing to 176 to avoid a duplicate row.

## Action required from the human

1. **Delete two dead branches.** `claude/loop-173` (~12 corrective commits, `BACKLOG.md` truncated at row 54
   of 173, `LOG.md` 5,418 bytes short — the failed large-file transport) and `claude/loop-173-recovery`
   (superseded by this branch, and it would clobber the heartbeat's `specs/173.md` if merged). **Neither has
   an open PR. Do not merge either.**
2. **Fix the push path.** The 413 on `git-receive-pack` blocks every future build-loop run, not just this
   one. It is the highest-value fix on this page.

## How to reconstitute the verified commit

`176-code.patch` and `176-ledger.patch` are `git diff` output against `main` at
`eabec6fab6241f5fe4381805cd18f8456b51cc7a` (the tip when the build started, now one commit behind because of
the heartbeat). The ledger patch touches `BACKLOG.md` / `LOG.md`, which the heartbeat also appended to, so
it needs `--3way`:

```sh
git checkout -b loop-176 eabec6fab
git apply product-loop-kit/specs/176-code.patch     # audit-app.js, package.json, 2 playbooks, signals artifact
git apply --3way product-loop-kit/specs/176-ledger.patch   # BACKLOG row + LOG entry (renumber 173 -> 176)
git commit
```

Applied to `eabec6fab` with the original filenames, the result reproduces tree
`00e041d02da16df5160c977a64aabc860d517cfa` exactly — that is local commit `26456c345`, the tree the verifier
judged.

## What is in this bundle

| file | what it is |
|---|---|
| `176.md` | the spec, verbatim as built against |
| `176-notes.md` | build notes: predicate rationale, rejected alternatives, 7 mutation cycles, honest limitations |
| `176-pr.md` | the HIGH-tier explainer + 5-question quiz the risk policy requires |
| `176-code.patch` | the product-side diff — `audit-app.js` (+111), `package.json` (one `test:serial` line), `playbooks/product-audit.md`, `playbooks/detector-signal-coverage.md`, `signals/audit-findings.json` |
| `176-ledger.patch` | the bookkeeping diff — `BACKLOG.md` row, `LOG.md` entry |
| `test_audit_apy_percent_sanity.js` | the new test (22 assertions), verbatim |

## The item itself, in one paragraph

`audit-app.js`'s rendered leg never knew the trust rail. `scanNumbers()` — the only number check on every
rendered surface — is magnitude-only (`|value| >= 1e11`, tuned to item 122) and never referenced
`APY_SANITY_LIMIT`, while the constant *is* enforced on both non-rendered legs (`:323` text prescan,
`:1010`/`:1017` pool prescan). So item 144's real P0 (`apyMean30d = 36452.38798`, 36× the 1000% rail, on a
pool whose `totalApy = 0.24` kept it unflagged) is only 3.6e4 and passed clean — it was found by hand and
was still invisible to the scanner. This adds `apy-rail-breach` (P0), implementing
`playbooks/product-audit.md` class 1's decision rule verbatim, anomaly-aware and DOM-scoped per
`.pool-card`. It ships a **gate, not a repair**: zero findings on today's data, measured on both sides
(6 findings / 5 blocking, unchanged vs `origin/main`), and proven non-vacuous on a real Chromium render —
`kpis.apyMomentum = 5000` on an anomaly-unflagged pool puts "5,000%" on screen and fires a genuine P0
quoting it verbatim. No product file is touched.
