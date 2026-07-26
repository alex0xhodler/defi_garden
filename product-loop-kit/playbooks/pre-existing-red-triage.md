# pre-existing-red-triage — playbook

**When:** you run the test suite for an unrelated item and a test fails that your diff did not cause —
or your notes are about to contain the phrase *"PRE-EXISTING, proven on a stashed baseline, not fixed
(scope creep)"*. Also: when `npm test` stops early and the files after the stopper never run.

**Answer in one line:** proving it's pre-existing is only HALF the job — a red on `main` is either a
**real product regression the test correctly caught** (fix it, it is a product bug) or a **stale test
encoding an IA/behavior the product deliberately moved away from** (retire/repoint the test), and
leaving it unclassified silently blinds every `&&`-chained test after it for months.

## Steps

1. **Prove it's not yours** (the part loops already do well): `git stash push <your files>` → re-run the
   single test → confirm byte-identical failure → `git stash pop`. Record verbatim.
2. **Find the chain position.** `package.json`'s `test` is one `&&` chain. `grep -o 'node test_[a-z_]*\.js' package.json | nl`
   gives each file's position; anything AFTER the first red never runs in a plain `npm test`. Record
   *how many* tests the red is hiding — that number is the item's real score, not the size of the fix.
3. **Classify the red — read the assertion, not the test name:**
   - Does the assertion describe what the product is *supposed* to do today? Check the spec/LOG for a
     shipped pivot that changed it (`grep -i "drift\|pivot\|no longer" product-loop-kit/LOG.md`).
   - **Decision rule A — product regression** (the assertion is still correct, the product drifted
     away from it) → this is a **product bug**; fix the product, not the test.
   - **Decision rule B — stale test** (the product deliberately changed and the assertion encodes the
     old behavior) → the fix is to retire or repoint the *test*, in its own item, and say so out loud;
     do NOT "fix" the product back.
   - **Decision rule C — environment** (fails only in the sandbox: blocked HTTPS, missing fixture
     routing) → fixture-route it (NORTH_STAR 2026-07-12 pattern); never weaken the assertion.
4. **Check whether the red also hides a live product defect.** A freshness/wiring gate that is red is
   often a symptom, not the bug: `test_minified_assets.js` failing meant prod was actually *serving the
   raw bundles* (~159 KB extra on the north-star surface), not merely that a test was unhappy.
5. **Promote it** with the chain-position number as the evidence (item 147 is the precedent: 11 loops
   had each proven it pre-existing and moved on; none had classified it).

## Resolution

- **A** → fix in product code, keep the test as-is; the test just proved its worth.
- **B** → separate item, test-only diff, and record in the notes which shipped item made it stale so the
  next reader doesn't "fix" the product backwards.
- **C** → fixture-route, same-item is fine if it's the test you're already touching.
- In all three: if the red sat in an `&&` chain, say in LOG.md how far the chain gets *after* your fix
  and which file is the next stopper — the next loop inherits the fact instead of rediscovering it.

## Traps

- **"Pre-existing" is a provenance claim, not a triage verdict.** Eleven consecutive notes files said
  "pre-existing" about the same two assertions; none said "…and it is a real regression."
- **A red gate you can't see past looks like a green suite.** `npm test` exiting 1 at file 6 of 90 reads
  the same as file 90 failing — always report the *position*.
- **A test asserting the old IA will look like a product bug.** `test_smoke.js` asserts bare `/` renders
  the planner; the search-first-landing pivot (LOG 2026-07-15, item #237/114) made that false on purpose,
  and `test_landing.js` already asserts the correct current behavior. Check for a sibling test that
  contradicts the failing one — that's the strongest stale-test tell.
- **Don't fix the second red while fixing the first.** One item, one red class; record the rest.

## Provenance

Distilled from item **147** (2026-07-26, LOG.md) — `test_minified_assets.js` red on `main` since ~item
122, recorded as pre-existing by loops 117.2/125/128/130/137/138/139/140/143/144/146 and classified for
the first time here: rule **A** (`home.html`/`plan.html` had drifted back to raw `translations.js`/
`planner.js` despite backlog 053 wiring them to the minified bundles) plus rule **B** for the next
stopper (`test_smoke.js`'s bare-`/`-is-planner assertions, stale since the 2026-07-15 landing pivot).
