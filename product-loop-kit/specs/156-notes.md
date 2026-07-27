# 156 — build notes

Built 2026-07-27. Branch `claude/loop-156`. Test-only diff; zero product code.

## Promotion (why this item exists at all)

No READY item existed at pickup. `148` is the only row on `main` reading READY, but
`git ls-remote origin refs/heads/claude/loop-148` returns a branch and PR **#306** is open — the
build.md 2026-07-26 rule (a NEVER-list-gated item keeps reading READY on `main` because its status
change ships inside the unmerged PR) says skip it. `149`/`154`/`155` all shipped 07-26.

So this was a promotion from documented evidence, and the evidence was already pointing at it: item
**147**'s own notes file hands this off by name — *"next stopper for the next loop to inherit is
`test_smoke.js`"* — and classifies it in advance as playbook rule **B** (stale test). PR #306's body
independently names the same two files. Nothing here was invented for the occasion.

## What was actually wrong

`home.html:82` has been a three-mode router since the 2026-07-15 landing pivot. Two tests still encoded
the two-mode version:

- `test_hub_pages.js:186` — literal string match on the pre-pivot ternary. Pure string test, no browser.
- `test_smoke.js:181` — waited for `#planner-root [class*="gp-"]` on bare `/`, which now mounts the
  landing into `#landing-root`. Three failures, one per viewport.

## The measurement that settled a four-loop misdiagnosis

LOG.md's 2026-07-25 item-142 entry recorded `test_smoke.js` as *"sandbox render-timeouts CONFIRMED
pre-existing at HEAD"* — playbook rule **C**. That was wrong, and the proof is inside the same log the
loop was already printing:

```
network: yields.llama.fi reachable — serving live snapshot captured via curl
  ✓ home.html: sitewide Organization + WebSite JSON-LD …
  ✗ bare / renders planner UI at 360px      → waiting for '#planner-root [class*="gp-"]'
  ✓ /?token=USDC renders pool cards at 360px
  … same pattern at 768px and 1280px …
  ✓ pool-detail view (?pool=<id>) renders a BreadcrumbList JSON-LD block (040)
5 smoke assertions passed
```

Network **reachable**; the analytics route rendered in the same browser at all three viewports; only the
bare-`/` cases timed out. A blocked sandbox cannot fail one route and pass another in the same run.
Rule **B**, not **C**. This is now a trap entry in `playbooks/pre-existing-red-triage.md`.

## Chain arithmetic (the item's real score)

`test_smoke.js` is file **9 of 90** in `package.json`'s `&&`-chained `test` script. Its red stopped a
plain `npm test` at position 9, so **81 test files never ran**. The 20-line diff is not the value; the
81 files are.

## What shipped

`test_hub_pages.js` — router assertion repointed at the verbatim current `home.html:82` line, with a
comment naming the pivot so the next reader knows why the string is what it is. The
`window.__canonicalFor(window.location.search)` assertion is untouched. Intent preserved: it still goes
red if a diff alters the router or canonical logic (proven below).

`test_smoke.js` — the stale bare-`/` case became **two** cases per viewport:
1. `bare / renders the search-first landing` — waits for `[data-testid="landing-search"]` and asserts
   `#planner-root .gp-app` count is 0 (mirroring `test_landing.js:74`).
2. `/plan.html renders the planner` — keeps the planner render path covered at all three viewports.

That second case is the point of spec criterion 3: repointing alone would have quietly shrunk a
HIGH-tier gate from two sacred routes to one. `data-testid` was chosen over class-shape matching so the
new assertion is less likely to become the next stale one.

Every new case ends with the existing `if (errors.length) throw` page-error check — which on bare `/`
had **never once run**, because `waitForSelector` threw first. Restoring page-error collection on the
default route is a real gain hiding inside a "test fix".

## Verification

Run by the builder and then **independently re-run by the operator** (not taken on report):

| command | result |
|---|---|
| `node test_hub_pages.js` | exit 0, **42 assertions** |
| `timeout 280 node test_smoke.js` | exit 0, **11 smoke assertions** (was 5 passing / 3 failing) |

Non-vacuity, proven by execution in both directions:

- Reverted `home.html:82` to the two-mode ternary → `test_hub_pages.js` RED (`router logic changed`, 41
  passed, exit 1) → `git checkout home.html` → green again, 42, exit 0, `git diff --stat home.html`
  empty.
- Pointed the landing selector at `[data-testid="landing-search-NOPE"]` → `test_smoke.js` RED at all
  three viewports, 8 passed, exit 1 → restored → green again, 11, exit 0.

## Deviations from spec

1. **Doc-comment rewrite in `test_smoke.js` (lines 1-8), not requested.** The header described the two
   pre-pivot routes. Left alone it would have been a stale comment sitting directly above the fix. Kept
   — documentation-only, inside a file already in scope.
2. **The builder reverted the operator's playbook edits mid-run.** It saw
   `playbooks/pre-existing-red-triage.md` modified, did not recognise it (the operator wrote it in
   parallel), and applied the spec's literal "if anything else appears, revert it" instruction. Correct
   behaviour given what it could see; the edits were re-applied afterward. Recorded because it is a real
   coordination hazard: a *"revert anything outside your files"* instruction to a builder is unsafe when
   the operator is editing docs concurrently. Future specs should scope that instruction to product code
   and name the operator-owned paths as off-limits rather than revert-on-sight.
3. **No handler change needed for `/plan.html`.** The spec flagged it as a thing to verify;
   `startServer()`'s `path.join(ROOT, urlPath === '/' ? 'home.html' : urlPath)` already serves it.
   Confirmed by execution, not inspection.

## Honest status of the rest of the chain — this does NOT make `npm test` green

After 156 the chain clears position 9 and stops at position **10**, `test_landing.js`. Red on `main`
before this item and still red: it passes `✓ bare / renders the search-first landing`, then fails
`page.waitForURL` after typing `USDC` into `[data-testid="landing-search"]`.

**The product is not broken.** A direct Playwright probe this run drove the same flow against the same
routed fixture and the URL became `/?token=USDC` correctly, so the landing search works and this is a
harness artifact inside that test. Not fixed here — one item, one red class (playbook trap). It is the
next promotion candidate and is recorded in LOG.md as the inherited next stopper.

Also still red from the fresh-clone `MODULE_NOT_FOUND` class already flagged by item 149:
`test_dead_pool.js`, `test_token_pages.js`, `test_hub_pages.js` — all three pass once `npm ci` has run,
which it had for every measurement above.

## Guardrails

No trust rail touched (`APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, anomaly flags, degen haircut all
untouched). No product code, no router change, no dependency, no generated SEO artifact, no
`translations.js` string, no out-of-scope directory. `home.html` is byte-identical to `main`.
