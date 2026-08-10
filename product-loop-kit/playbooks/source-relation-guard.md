# source-relation-guard — playbook

**When:** you are about to build a gate that relates TWO SETS OF SITES IN SOURCE CODE — "every X must have
a matching Y" — by parsing the source at test time. Every transition/emission pair (a view is entered ↔ the
view is reported), every handler/registration pair, every emit-site/schema pair, every `mirror` in the 212
sense where a fact must exist in two places and only one is read at runtime. The tell that you are here:
you are writing `findAll(source, needleA)` and `findAll(source, needleB)` and about to decide what "matches"
means.

**Answer in one line:** the matching predicate is the whole item — a predicate that watches something
*resembling* the mechanism passes on real gaps and is strictly worse than no gate, because it launders the
gap as coverage; so **derive the predicate from what the code actually executes, and prove it by breaking
it, not by watching it go green.**

## The recurring shape (item 257, three verifier rounds on ONE gate)

Same error three times, in two different rules of the same file. Each version passed its own tests.

| version | the predicate | the mutation that beat it |
|---|---|---|
| 1 | "the setter's variable name appears somewhere in an emitting function" | a real, unrelated setter (`setSelectedChain`) whose variable happens to appear near an emit → uninstrumented path reported COVERED |
| 2 | rule (b) hardened; rule (a) left as "the emit call appears in the same function" | a transition inside an early-return guard, emit later in the same function → **the entire suite green** while a real gap existed |
| 3 | rule (a) gains dominance (offset order + enclosing-block prefix) | (survived; residual boundary enumerated instead of claimed closed) |

The lesson is not "check control flow". It is that **each version's author believed the predicate was
sound, and each was refuted in minutes by someone whose job was to attack it.**

## Steps

1. **Name the mechanism in one sentence, in terms of what runs.** Not "the emit is near the transition" —
   *"the pool the user navigated to is the pool the event reports."* If you cannot say it in execution
   terms, you do not yet know what to check.
2. **Write the predicate as a CONJUNCTION of independently checkable facts**, each traceable to that
   sentence. 257's deferred path: (i) `setX` is a real `[x, setX] = useState(...)` binding; (ii) `x` is the
   **first argument** of the emit call — the thing being reported, not a word nearby; (iii) `x` is in the
   consuming `useEffect`'s dependency array. Three facts, all parseable, all load-bearing.
   *Decision rule:* if any conjunct is "appears in", "is mentioned near", or "matches the name of", it is a
   resemblance. Replace it with a positional or structural fact (argument index, dependency array
   membership, block nesting, declaration site).
3. **Handle the legitimate irregular case before you handle the defect.** 257's `url_direct` path
   deliberately defers its emit to a sibling effect (spec 182). A predicate strict enough to be sound would
   have failed a correct path. Find the irregular-but-correct member FIRST; it constrains the predicate more
   than the defect does.
4. **Adversarial mutations are the deliverable, not the test.** Before claiming soundness, write mutations
   that SHOULD pass the gate and mutations that SHOULD NOT, run them through the same pure `analyze(source)`
   the real file goes through, and keep them as permanent assertions. Minimum set:
   - the motivating defect removed (the classic non-vacuity red);
   - a synthetic NEW member of the population, uninstrumented (proves the population is derived, not
     hardcoded to today's count);
   - one mutation per conjunct, neutering it ALONE (three working sub-rules must be distinguishable from
     one working sub-rule and two dead ones);
   - **a positive control** — an unusual but genuinely correct shape that must still be COVERED. Without it,
     a predicate that rejects everything passes every negative test.
   - **branch shapes**: the thing inside an early return, and its mirror inside a sibling branch.
5. **Check the aggregate independently of the per-member check.** 257's killer mutation added one member to
   BOTH sets, so a count-equality assertion stayed green while a real gap existed. Count equality is not a
   coverage proxy; assert both, and assert they are independent.
6. **Enumerate the residual boundary with the shapes you did NOT handle**, by name — loops, `try/finally`,
   callbacks (braced vs. expression-bodied differ), nested early returns, `switch` fallthrough, ternaries and
   `&&`/`||` (these open no block, so any block-nesting analysis is blind to them), identifier shadowing.
   *Decision rule:* write the list as **"what has been adversarially tested"**, never as "what exists" —
   257's attempt 2 published a two-item residual list as if complete and a verifier immediately found a
   third, more severe hole outside it.
7. **Classify the failure DIRECTION of every residual.** Fail-loud (the gate goes red on a correct path,
   breaking CI visibly) is a different severity class from fail-silent (a real gap reads as covered).
   Fail-silent residuals are the ones that make the gate worse than nothing; say which kind each is.

## Traps

- **A green gate is the weakest possible evidence.** It becomes evidence only after you have seen it go red
  for the right reason (`derived-number-rails.md` Step 0b, `test-gate-observability.md` step 5).
- **"Derived from source at test time" ≠ sound.** 257's every version derived its population correctly and
  was still wrong about what matching meant. Derivation kills hardcoding, not resemblance.
- **The gate's docstring will overclaim.** Every version of 257's file asserted its own soundness in prose
  while being refutable in one mutation. Write the boundary before writing the claim.
- **Don't hand the same author both the predicate and its attack.** All three holes here were found by an
  adversarial verifier, none by the builder who had just written and tested the rule.

## Provenance

Item 257 (2026-08-10) — `test_pool_view_coverage.js`, the `setCurrentView('pool-detail')` ↔
`Analytics.trackPoolView(` gate; three build attempts, two verifier FAILs, gate grew 7 → 14 → 18
assertions with every raise driven by a verifier finding rather than volunteered. Governed by `RAZOR.md`
worked example 5 (item 212 — a guard aimed at a resemblance launders the gap as coverage) and by
`prompts/build.md`'s guard/test/class rules, which this item violated and then re-learned the hard way.
Sibling playbooks: `detector-signal-coverage.md` (is the signal SET wide enough), `detector-detection-rate.md`
(does a covered signal fire reliably), `test-gate-observability.md` (has the gate ever been seen red).
