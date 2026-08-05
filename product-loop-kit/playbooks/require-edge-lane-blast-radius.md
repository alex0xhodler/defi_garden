# require-edge-lane-blast-radius — playbook

**When:** you added, moved, or made lazy a `require('./…')` in any module the SEO generators or tests
import — and `test_run_tests.js` went red, or `node run-tests.js --lane=plain` reports fewer files
than you expect, or a fast test suddenly runs in the browser lane.

**Answer in one line:** `run-tests.js` classifies lanes by a **static text scan** for
`require('./…')`, so it cannot tell a lazy/conditional require from an eager one — one new edge into
a module that (transitively) reaches `audit-app.js` re-lanes that file **and everything that requires
it**, and the only visible symptom may be a shrinking `plain=N`.

## Steps

1. **Read the lane number, not just the red.** `node run-tests.js --lane=plain` prints
   `run-tests.js: N file(s) selected (lane=plain, plain=N, browser=M, …)`. Compare N against
   `main`'s. Item 232 saw **52 → 31** with a single added require. A drop IS the finding.
2. **Confirm the classifier, don't infer it.** `node -e "console.log(require('./run-tests.js')
   .classifyLane('generate-token-pages.js'))"` on your tree and on a `main` worktree. Two different
   answers for an unchanged file = a require edge moved it.
3. **Find the edge, then the marker.** Walk `require('./…')` from the file you changed until you hit
   `audit-app.js` (today's "browser" marker). Item 232's chain:
   `generate-token-pages.js → generate-pool-pages.js → audit-app.js`.
4. **Enumerate the blast radius before choosing a fix** — everything that requires the re-laned file
   moves with it. In 232 that was `generate-llms.js`, `test_llms_rails.js`, `test_token_pages.js`,
   `test_chain_pages.js`, `test_hub_pages.js`, `test_sitemap_xml.js`, `test_i18n_pages.js`,
   `test_og_images.js`, and more.

## Resolution

Three options, in order of structural quality:

- **Best: a leaf module.** Move the shared thing into a module that requires nothing lane-sensitive,
  and have both sides require it eagerly. One physical copy, permanently, no lane effect.
- **Acceptable: keep a local copy + prove it can't drift.** Only if the leaf-module refactor is out
  of the item's scope. RAZOR side 2 then applies in full: the copy is a **mirror** and needs a
  **tested set-equality against the original, both directions, over a derived population**, in the
  same commit. 232 shipped `test_mean30d_mirror.js` (749 members: real snapshot pools + crafted
  boundary values) and asserted both modules read the same constant, so a rail edit on one side
  cannot pass while the two diverge.
- **Wrong: edit the classifier** to special-case your file. It makes the lane split a claim about
  intentions rather than about requires.

Whichever you pick, print the `plain=N, browser=M` line **before and after** in the notes. A lane
change that isn't shown is a lane change nobody will notice next time.

## Traps

- **A lazy require looks safe and isn't.** It fixes a *runtime* load cycle (the reason to write one)
  and does nothing for the *static* scan. Both constraints are real and they pull in opposite
  directions — say which one you're solving.
- **Running only your new test hides it.** A per-file run is green throughout; only the full lane
  reveals the shrink. Same lesson as the stale-minified-asset trap: `node run-tests.js --lane=plain`
  is ~34s, and it is the cheapest gate in this repo.
- **The third copy is the cost, not the fix.** If you take the local-copy route, note in the item's
  close-out that the structurally correct fix was declined and why, with the mirror test as the
  compensating control. Don't let "the codebase already mirrors this twice" become the argument for
  leaving the third copy untested — that is how a trust rail silently forks.

## Provenance

Item 232 (2026-08-05), verifier attempt-2 round. The lazy `require('./generate-pool-pages.js')` added
for `mean30dSane` re-laned 21 files and turned `test_run_tests.js` red; found only when the full
plain lane was finally run after a separate verifier finding. Territory notes 7-8 in `specs/232.md`.
