# shallow-clone-push-413 — playbook

**When:** `git push` fails with **HTTP 413 Request Entity Too Large** (or hangs/disconnects mid-upload) from
a cloud session, and the diff is obviously small. Also covers the more dangerous version: a run concluding
*"pushes are broken in this environment, ship as patches"* and handing the work back to the human.

**Answer in one line:** 413 almost never means the *policy* blocks pushes — it means git is uploading the
whole repository, because this session's **shallow clone lost its common base when `main` advanced after
the clone**; `git fetch origin <default-branch>` restores the base and the push succeeds.

## The mechanism

Cloud sessions clone shallow (`.git/shallow` present, `git rev-parse --is-shallow-repository` → `true`).
`git push` computes its pack by taking the remote's **advertised** ref tips as negatives — but only those
whose objects it actually holds. A shallow clone holds essentially one tip: whatever `main` pointed at when
the container was created. When `main` moves afterwards — this repo's daily `sitemap-update.yml` CI commits
*"chore: update sitemap and LLM files with latest yields"* every day, and the heartbeat commits on top —
**none** of the advertised tips exist locally, git has no negative at all, and send-pack uploads every
object reachable from your branch. On this repo that is ~500 MB, and the edge rejects it with 413.

Measured 2026-08-01, item 199: **500.7 MB uploaded** for a change whose correct thin pack is **41,205 bytes**
— a factor of ~12,000.

## Steps (in order, each one cheap)

1. **Measure the pack before believing anything about the environment.** This is the whole diagnosis:
   ```
   { git rev-parse HEAD; echo "^$(git rev-parse origin/main)"; } | git pack-objects --revs --thin --stdout | wc -c
   ```
   Tens of KB = your change is small and the *upload* is the anomaly → continue here. Hundreds of MB = you
   really are trying to push something huge → different problem.
2. **Confirm the shape.** `git rev-parse --is-shallow-repository` → `true`, and
   `cat .git/shallow`. Then check whether the remote's advertised tip is an object you hold:
   ```
   curl -sS --noproxy '*' "<remote>/info/refs?service=git-receive-pack" -o /tmp/adv.txt
   grep -c "$(git rev-parse origin/main)" /tmp/adv.txt      # 0 = your base is NOT advertised → this playbook
   ```
3. **Fix:** `git fetch origin main` (the default branch by name, not `--all`). Re-measure step 1 — it should
   drop to KB. Then `git rebase origin/main` (or rebuild the branch on the fresh base) and push.
4. **Confirm the upload actually shrank** rather than assuming:
   ```
   GIT_TRACE_CURL=1 git push … 2>&1 | awk '/=> Send data, /{n=$0;sub(/.*Send data, /,"",n);sub(/ bytes.*/,"",n);t+=n} END{print t}'
   ```

## Decision rule

- Advertised tip missing locally + small local diff → **shallow-base loss. Fetch and retry. Do not report the
  environment as broken.**
- Advertised tip present locally, pack still huge → a genuinely large object is in your commit (build output,
  a committed `node_modules`, a big binary). Find it with
  `git rev-list --objects HEAD ^origin/main | git cat-file --batch-check='%(objectsize) %(rest)' | sort -rn | head`.
- Pack small, upload small, still 413/403 → *then* it is the edge. Note that this session's relay **inspects**
  push payloads and answers 403 with an explicit `ERR …` message for policy denials (e.g. *"only ref-update
  and shallow lines are permitted"*) — a policy denial looks different from 413 and says why.

## Traps

- **413 reads like a size limit, so "my diff is small" feels like proof the limit is bogus.** It is not the
  diff that is being uploaded — it is the pack git computed, which can be four orders of magnitude larger.
  Measure the pack; never reason from the diff.
- **A no-op push failing "proves" pushes are disabled.** It does not. `origin/main:refs/heads/new-branch`
  looks like zero objects to you, but if the *advertised* tip is unknown locally, git still packs everything.
  This exact false negative sent one run down the ship-as-patches path.
- **Do not fall back to the GitHub MCP file APIs to work around it.** They take file contents inline;
  re-emitting a 228 KB gate file through a tool argument risks a transcription error in the merge gate
  itself. Fix the base instead.
- **After fetching, expect an ID collision.** If `main` moved, a heartbeat may have taken your backlog id
  while you were building. Check `git log <your-base>..origin/main -- product-loop-kit/BACKLOG.md` before
  committing, and renumber per the 2026-07-11 precedent — repoint every self-reference (spec/notes/pr file
  names, `backlog <id>` comments, test seeds) and **re-run the touched tests after the rename**.
- **Correct anything you already published under the wrong conclusion.** If an issue/PR was filed saying the
  environment is broken, go back and fix it — a wrong diagnosis left standing in the repo costs the next
  reader more than the original failure did.

**Provenance:** item 199 (2026-08-01). The run built + verifier-PASSED the item, hit 413 on every push, and
first concluded pushes were environmentally disabled (413 reproduced on a 32-byte no-op push, on both the
loop branch and the harness-designated branch; `GITHUB_TOKEN` in the container is a 14-char proxy
placeholder, so a direct GitHub push authenticates as nobody) — filing issue #354 and a patch artifact under
that conclusion. Re-examination on the operator's own question *"what changed in the setup?"* produced the
real cause above; one `git fetch origin main` unblocked it. PR #331 (item 176, 2026-07-29) records the same
symptom and is likely the same cause.
