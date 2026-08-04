# 223 — build notes

## Files changed, one line each

- `.vercelignore` — new file, 76 lines (incl. comments). One denylist, anchored
  patterns only, no `!` negations, grouped with comments per the spec's
  format requirement.
- `test_vercelignore.js` — new file, ~495 lines. The pre-deploy dry run and
  permanent gate: matcher + unit tests, KEPT/EXCLUDED enumeration against the
  real `git ls-files`, MUST-KEEP allowlist, MUST-EXCLUDE list, link-integrity
  scan, an in-memory self-defeat rail, and the dry-run summary printer.
- `package.json` — 1 line changed: `test_vercelignore.js` appended to the end
  of `test:serial`'s chain (same placement pattern item 222 used for its own
  new test).
- No product/render-path file touched. `vercel.json` has **zero diff**
  (verified with `git diff --stat` after staging — see "Commands run" below).

## Pre-change baseline (2026-08-04, live curl — re-verified this run, not just copied from spec's Evidence)

| path | code |
|---|---|
| `/test_min_asset_boot.js` | 200 |
| `/audit-app.js` | 200 |
| `/product-loop-kit/BACKLOG.md` | 200 |
| `/CLAUDE.md` | 200 |
| `/.claude/agents/verifier.md` | 200 |
| `/docs/feasibility-data-layer.md` | 200 |
| `/data/pools-snapshot-meta.json` | 200 |
| `/llms.txt` | 200 |
| `/status` | 200 |
| `/package.json` | 404 (already, pre-existing — see Territory note) |
| `/generate-sitemap.js` | 200 |
| `/tokens/usdc` with `Accept: text/markdown` | 307 → `/tokens/usdc.md` |
| `/tokens/usdc.md` | 200 |
| `/.well-known/agent-skills/agentic-readiness/SKILL.md` | 200 |

Matches the spec's Evidence section (which had already established most of
this); the additions here (`generate-sitemap.js`, the markdown-twin redirect,
the `.well-known/*.md` check) were run fresh this session to confirm nothing
had drifted since the spec was written.

## Deviation from the spec's suggested exclude list: `auth.md` is NOT excluded

The spec's "Change" section listed `auth.md` among the root-level internal
docs to exclude, alongside `CLAUDE.md`/`README.md`/`SITEMAP.md`/etc. **This
was wrong, and `test_vercelignore.js`'s own link-integrity check (criterion
3e) caught it on the first run**, before any deploy:

```
✗ (e) LINK INTEGRITY: no KEPT served asset references an EXCLUDED path
    2 broken same-origin reference(s) found (a KEPT file links to a path that resolves to an EXCLUDED file):
  .well-known/oauth-authorization-server.json -> "/auth.md" -> auth.md (EXCLUDED)
  .well-known/openid-configuration.json -> "/auth.md" -> auth.md (EXCLUDED)
```

`auth.md` reads like an internal doc (agent-authored, root-level, `.md`) but
is actually a **live agent-discovery asset**: both
`.well-known/oauth-authorization-server.json` and
`.well-known/openid-configuration.json` set their `agent_auth.skill` field to
`https://www.defi.garden/auth.md`, and `auth.md` itself instructs arriving
agents to read those same two `.well-known` endpoints — it is part of the
agent-auth discovery loop, not a repo-internal doc. Confirmed live on prod:
`/auth.md` → 200 today, unchanged. This is exactly the class of trap
CLAUDE.md's facts warned about for `.well-known/agent-skills/index.json` →
`SKILL.md` (a `.md` linked from a `.well-known` JSON file) — it turns out to
apply to `auth.md` too, one level removed. **`auth.md` was removed from
`.vercelignore` and added to the test's MUST-KEEP allowlist**; see the
`.vercelignore` file's own inline comment at that spot for the permanent
record. No other broken reference was found in the same scan (2 occurrences
only, both explained by the same root cause).

## Other conservative choices, and why

- `/*.sh` (a root-anchored glob) is used instead of naming
  `check-deps-with-comp.sh`/`split-inkvest.sh`/`split-inkvest-filter.sh`
  individually — verified these are the only three `.sh` files at repo root
  (`git ls-files | grep -E '^[^/]+\.sh$'`), and the glob is anchored so it
  cannot reach into any subdirectory (e.g. a hypothetical `fonts/build.sh`
  would be untouched).
- `spotlights/` is deliberately **not** in `.vercelignore** — not named in
  the spec's exclude list, and `card.png` may be linked from posts per
  CLAUDE.md's operator guidance ("when in doubt keep serving").
- `package-lock.json`, `LICENSE`, `.gitignore` are left served — not named in
  the spec's exclude classes, and excluding them was never asked for.
  (`package-lock.json` and `.gitignore` are already 404 on prod today anyway
  — see Territory note below — so this is moot in practice, but the file
  doesn't add rules for things the spec didn't name.)
- `test_fixtures/` and `test-fixtures/` (two differently-hyphenated
  directories both exist on disk) are both excluded explicitly, per the
  spec's own "fixtures/scratch dirs" wording and its literal naming of both
  spellings.
- `whatsapp-bot/` and `.agent-reviews/` are excluded per the spec's explicit
  list even though neither exists in this checkout (`whatsapp-bot/` is
  untracked and absent; `.agent-reviews/` is gitignored and absent) — kept as
  a no-op, forward-looking rule exactly as the spec's fact sheet names them,
  since a `.vercelignore` line for an absent path is harmless.

## DRY-RUN enumeration (step 3f — the pre-deploy dry run for the notes)

Full `node test_vercelignore.js` summary output, this tree, this run:

```
=== DRY RUN SUMMARY ===
tracked files:   19956
KEPT (served):    18992
EXCLUDED (denied): 964

excluded root-level files (175):
  /.mcp.json
  /CLAUDE.md
  /README.md
  /SITEMAP.md
  /audit-app.js
  /check-deps-with-comp.sh
  /compile-app.js
  /compute-kpis.js
  /dev-server.js
  /generate-chain-pages.js
  /generate-history-backfill.js
  /generate-llms.js
  /generate-og-images.js
  /generate-pool-pages.js
  /generate-pools-snapshot.js
  /generate-protocol-urls.js
  /generate-sitemap.js
  /generate-spotlight.js
  /generate-stories.js
  /generate-token-pages.js
  /indexnow-ping.js
  /minify-assets.js
  /og-image.build.mjs
  /og-image.source.html
  /product-loop-kit.zip
  /run-tests.js
  /schema.sql
  /settings.local.json
  /split-inkvest-filter.sh
  /split-inkvest.sh
  /stakeholder_communication_plan.md
  /test_analytics_acquisition.js
  ... (all ~145 root test_*.js files) ...
  /test_zero_yield_demote.js
  /user_journey_diagrams.md
  /validate-sitemaps.js
  /wrangler.toml

excluded directories (9), with file counts:
  /.claude/  (1 files)
  /.github/  (1 files)
  /docs/  (6 files)
  /product-loop-kit/  (694 files)
  /src/  (2 files)
  /telegram-bot/  (78 files)
  /test-fixtures/  (2 files)
  /test_fixtures/  (3 files)
  /workers/  (2 files)

148 assertions passed
```

(The full root-level file list is 175 lines — the test's own console output,
captured verbatim in the "Commands run" transcript below, has the complete
un-truncated list; this table elides the repetitive `test_*.js` run for
readability. `965 → 964` EXCLUDED reflects removing `auth.md` from the
denylist after the link-integrity catch above.)

## Non-vacuity proof (mutate → RED → restore byte-identical → GREEN)

Per the spec's explicit instruction, this mutated the REAL on-disk
`.vercelignore` (not just an in-memory string) to prove the gate that reads
the real file can actually go red, then restored it and verified restoration
with `md5sum` before and after:

```
$ md5sum .vercelignore
8d49a86afae41243ffd5d3b5e831001a  .vercelignore

$ echo "" >> .vercelignore && echo "/app.js" >> .vercelignore && echo "/pools/" >> .vercelignore
$ md5sum .vercelignore
a7803fec879826e871fc868c57cd6397  .vercelignore

$ node test_vercelignore.js 2>&1 | grep -E "✗|FAILED"
  ✗ (c) KEPT: app.js
  ✗ (c) KEPT: pools/0004a5d4-ce6d-43ba-ab8a-64ff555b3853.json
  ✗ (c) KEPT: pools/0004a5d4-ce6d-43ba-ab8a-64ff555b3853.md
  ✗ (f) self-defeat: real .vercelignore keeps app.js and a pools/ sample (sanity before mutating)
  ✗ (f) self-defeat restore proof: the REAL (unmutated) pattern set, re-derived fresh from disk, is unaffected by the in-memory mutation above
FAILED

# restore, from a copy saved before the mutation
$ cp /tmp/.../scratchpad/vercelignore.orig .vercelignore
$ md5sum .vercelignore
8d49a86afae41243ffd5d3b5e831001a  .vercelignore    # <- byte-identical to the pre-mutation hash above

$ node test_vercelignore.js 2>&1 | tail -3
148 assertions passed

$ git status --short .vercelignore
?? .vercelignore     # untracked new file in this branch — no unintended diff beyond the one commit will contain
```

RED fired exactly where expected (the MUST-KEEP criteria for `app.js` and
both `pools/` sample paths, plus both self-defeat sanity assertions); GREEN
returned once the byte-identical file was restored. `test_vercelignore.js`
itself also carries a **permanent, in-memory** version of this same proof
(part `(f)`) so this isn't a one-time-only guarantee — every future run of
the suite re-proves the classifier can go red without ever touching the real
file on disk.

## Commands run, with real results

| command | result |
|---|---|
| `node test_vercelignore.js` | **148 assertions passed**, exit 0 |
| `node test_test_registry.js` | **5/5 assertions passed**, exit 0 (no orphans: `test_vercelignore.js` is registered) |
| `node test_run_tests.js` | **26 assertions passed**, exit 0 |
| `node run-tests.js --list \| grep vercelignore` | `test_vercelignore.js	plain` (correctly classified plain lane — no Playwright dependency) |

All three ran well under the 5-minute timebox (`test_vercelignore.js` ~1s,
`test_test_registry.js` ~1s, `test_run_tests.js` ~15s).

## What was NOT run / NOT claimed

- The full `~140`-file `test:serial` chain was not run (standing 5-minute
  foreground timebox, 2026-07-11) — only the three files the spec's step 4
  explicitly names, which are also the only three this diff could plausibly
  affect (a new plain-lane test file, its registration, and the runner's own
  self-tests). No render-path, generator, or data file was touched, so there
  is no reason to expect any other test in the chain to be affected.
- **The POST-DEPLOY curl matrix (spec's own acceptance criterion) has not
  run and cannot run from this branch** — `.vercelignore` only takes effect
  once Vercel builds a deploy from a merged commit, and this item is
  deliberately unmerged and unpushed (per this run's instructions: build
  only, operator pushes and merges). **The operator runs the post-deploy
  curl matrix after merge** — both directions: every runtime asset class
  (app bundles + `.min`/`.compiled` twins, `data/pools-snapshot*.json`,
  `tokens/`/`chains/`/`ko/` incl. the `.md` twins, `stories/`, sitemaps,
  `llms*.txt`, `og-image.png`, `plan.html`/`home.html`, `.well-known/**`
  incl. `auth.md`) → 200, and every excluded class (one `test_*.js`,
  `audit-app.js`, one `generate-*.js`, `product-loop-kit/BACKLOG.md`,
  `CLAUDE.md`, one `.claude/` path) → 404. This notes file's pre-change
  baseline table above is what that post-deploy matrix diffs against.
- No attempt was made to verify Vercel's own build/upload behavior locally
  (no local Vercel CLI deploy was run) — `test_vercelignore.js` is a static
  analysis of the ignore file against `git ls-files`, which is the dry run
  the spec's acceptance criterion asks for, not a live deploy simulation.

## Territory notes (also appended to `specs/223.md`)

1. **The `auth.md` trap** — see "Deviation" above. The spec's own suggested
   exclude list was wrong on this one file; the link-integrity check this
   item was asked to build is what caught it, which is the strongest
   available argument for why step 3e (link integrity) is not optional.
2. **Vercel already hides a small set of well-known filenames, independent
   of any `.vercelignore`.** Before this change, with **no `.vercelignore`
   in existence**, `/package.json`, `/package-lock.json`, `/README.md`,
   `/vercel.json`, and `/.gitignore` were already all 404 on prod — while
   `/CLAUDE.md`, `/auth.md`, `/SITEMAP.md`, `/LICENSE`, `/.mcp.json` were all
   200. This is Vercel's own static-deploy convention (it recognizes certain
   package-manager/build-config filenames and never serves them as static
   assets), not anything this repo configured. Consequence: this item's
   `/README.md` exclusion line is redundant-but-harmless (Vercel was already
   hiding it), and `package.json`'s pre-existing 404 (noted in the spec's
   own Evidence) is explained, not mysterious. Worth knowing for whoever
   next audits "what's live on prod" by curl — don't assume a 404 proves a
   `.vercelignore` rule did it.
3. **No build script exists** (`package.json` has no `"build"` key) —
   confirmed by reading the file directly, not just trusting the spec's
   claim. Vercel therefore uploads the static tree as-is; `.vercelignore` is
   the only lever available, exactly as the spec assumed.
