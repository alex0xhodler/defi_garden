# 173 — transport note: why this landed as patches instead of a normal PR

**Read this first if item 173 looks half-shipped. It is not half-built — it is fully built and
verifier-PASSed (9/9, tier HIGH). It could not be *transmitted*.**

## What happened

`git push` is broken in the cloud session. Measured, not inferred:

- `git push` → `HTTP 413 Request Entity Too Large` from the harness git proxy
  (`http://local_proxy@127.0.0.1:41729/git/…`) on `git-receive-pack`. Reproduced ~10 times across HTTP/1.1
  and HTTP/2, with and without a raised `http.postBuffer`.
- **It is not a size problem.** A push carrying *zero new objects*
  (`git push origin origin/main:refs/heads/<probe>`) gets the same 413. The preceding 4-byte POST returns
  200; only `git-receive-pack` is refused.
- The session's `GH_TOKEN`/`GITHUB_TOKEN` are **read-only**: `GET` on the REST API returns 200, but
  `POST /git/blobs` and `PUT /contents/…` both return
  `403 "Write access to this GitHub API path is not permitted through this proxy."`
- That leaves only the GitHub MCP tools, whose file contents must be **authored by an LLM inside the tool
  call**. That works for small files and fails on large ones: an attempt to transmit
  `product-loop-kit/LOG.md` (571,303 bytes) and `BACKLOG.md` (221,917 bytes) that way produced truncated
  and duplicated commits on branch `claude/loop-173` before being caught by fetch-back verification.

## Action required from the human

1. **Delete the branch `claude/loop-173`.** It carries ~12 corrective commits, `BACKLOG.md` truncated at
   row 54 of 173, and a `LOG.md` 5,418 bytes short of the real file. **Do not merge it.** No PR was opened
   from it.
2. **Fix the push path.** The 413 on `git-receive-pack` is the actual bug here, and it blocks every future
   build-loop run, not just this one.

## How to reconstitute the exact verified commit

Everything below reproduces local commit `26456c345`, whose tree is `00e041d02da16df5160c977a64aabc860d517cfa`.
The two `.patch` files are `git diff` output against `main` at `eabec6fab6241f5fe4381805cd18f8456b51cc7a`,
so they apply cleanly to that base:

```sh
git checkout -b claude/loop-173 eabec6fab
git apply product-loop-kit/specs/173-code.patch      # audit-app.js, package.json, 2 playbooks, signals artifact
git apply product-loop-kit/specs/173-ledger.patch    # BACKLOG.md row 173, LOG.md entry
# the spec/notes/pr files and test_audit_apy_percent_sanity.js are already present verbatim in this bundle
git rm --cached product-loop-kit/specs/173-TRANSPORT.md product-loop-kit/specs/173-code.patch \
                product-loop-kit/specs/173-ledger.patch    # bundle scaffolding, not part of the item
git commit   # message: see product-loop-kit/specs/173-pr.md
```

Verify with `git rev-parse HEAD^{tree}` — it must print `00e041d02da16df5160c977a64aabc860d517cfa`. Git
trees are content-addressed, so that equality is a byte-for-byte proof, not a spot check.

## What is in this bundle

| file | what it is |
|---|---|
| `173.md` | the spec (verbatim, as built against) |
| `173-notes.md` | build notes: predicate rationale, rejected alternatives, 7 mutation cycles, honest limitations |
| `173-pr.md` | the HIGH-tier explainer + 5-question quiz the risk policy requires |
| `173-code.patch` | the product-side diff — `audit-app.js` (+111), `package.json` (one `test:serial` line), `playbooks/product-audit.md`, `playbooks/detector-signal-coverage.md`, `signals/audit-findings.json` |
| `173-ledger.patch` | the bookkeeping diff — `BACKLOG.md` row 173, `LOG.md` entry |
| `test_audit_apy_percent_sanity.js` | the new test (22 assertions), verbatim |

## The item itself, in one paragraph

`audit-app.js`'s rendered leg never knew the trust rail. `scanNumbers()` — the only number check on every
rendered surface — is magnitude-only (`|value| >= 1e11`, tuned to item 122) and never referenced
`APY_SANITY_LIMIT`, while the constant *is* enforced on both non-rendered legs. So item 144's real P0
(`apyMean30d = 36452.38798`, 36× the 1000% rail, on a pool whose `totalApy = 0.24` kept it unflagged) is
only 3.6e4 and passed clean — it was found by hand and was still invisible to the scanner. This adds
`apy-rail-breach` (P0), implementing `playbooks/product-audit.md` class 1's decision rule verbatim. It
ships a **gate, not a repair**: zero findings on today's data, proven non-vacuous on a real Chromium render
(`kpis.apyMomentum = 5000` on an anomaly-unflagged pool puts "5,000%" on screen and fires a genuine P0).
No product file is touched.
