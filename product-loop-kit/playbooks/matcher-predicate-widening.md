# matcher-predicate-widening — playbook

**When:** a verifier (or a human) shows you that a matcher/detector/gate **missed** something real — a
naming convention it doesn't parse, a case it should have flagged — and the obvious fix is to widen the
predicate. Also fires the other way: you widened one, and the next review round says it now over-accepts.
Item 263's three verifier rounds are the provenance: narrow → widened → over-wide, one round each.

**Answer in one line:** widening a predicate to swallow the missed instance almost always buys the miss
back as a **false positive on the opposite side**, because the widening is designed from the ONE instance
that was missed — so before you widen, write down the known-bad set the new predicate must still reject,
and measure BOTH error directions over the real population, not just the one you were just embarrassed by.

**Not this playbook if** the checker cannot see the defect *class* at all — that's
`detector-signal-coverage.md`. **Not this one** if it sees the class but flags it only sometimes —
that's `detector-detection-rate.md`. **Not this one** if the predicate is fine and an allowlist is doing
the damage — that's `guard-exemption-rate.md`. This playbook is specifically about the *shape* of a
matching rule being re-cut under review pressure.

## Steps

1. **Name both error directions before touching the regex.** For a gate, say out loud what each costs:
   for 263, a false NEGATIVE = a duplicate build (half a session's spend); a false POSITIVE = a finished
   run **blocked from pushing**. The asymmetry decides how much widening the evidence can justify.
2. **Build TWO evidence sets from the real corpus, not from imagination.**
   - known-good: every real text the predicate MUST match (`fix(266):`, `246 follow-up:`, `110 — …`,
     `design(247 world):`)
   - known-bad: every real-or-plausible text it MUST reject (`123: fix inspired by 263`,
     `loop: … (148 was built twice today)`, `fix(2 factor auth):`, `chore(404 page):`, `feat(500ms):`)
   *Decision rule:* if you cannot produce a known-bad set, you are not ready to widen — you have no way
   to tell "weaker" from "sloppier" (RAZOR: the weakest hypothesis is not the loosest one).
3. **Derive the population and measure the miss rate with a real denominator.** Live sources beat
   fixtures: `git ls-remote --heads origin` (refs), `git log --format=%s origin/main` (subjects — merged
   PR titles land here, so this doubles as the PR-title corpus), the GitHub API for titles that never
   merged. Report `misses/total` with the denominator visible.
4. **Widen to the weakest predicate consistent with BOTH sets — then attack it.** Immediately construct
   texts your NEW rule accepts that a human would not: this is where `fix(2 factor auth):` came from.
   *Decision rule:* if the widened rule accepts anything from the known-bad set, it is too wide, even
   when the real corpus currently contains zero instances of it. "Zero in today's corpus" is not a
   guarantee — it's a sample.
5. **Make the leftover residue TEST-DERIVED, never prose.** Write a second, deliberately more permissive
   extractor, sweep the population with it, and assert the difference set equals the enumerated residue
   **both directions**, grouped by named shape. Then the count in your notes is printed by the test, and
   a new residue shape appearing in history fails loudly instead of quietly aging.
6. **Prove each widening is load-bearing.** Revert only the widening → the assertions that motivated it
   must go RED → restore byte-identically (`md5sum`) → green. A widening nobody has seen fail is
   decoration.

## Resolution

- Both directions measured, known-bad rejected, residue derived and enumerated → ship, with the numbers
  in the notes.
- Widened rule still accepts a known-bad shape → **do not ship it as "weaker"**. Either narrow it to the
  discriminator the evidence supports, or leave the case as disclosed residue with a count. Both are
  honest; an undisclosed over-acceptance is not.
- Out of attempts (budget = 3) → PARK with the two evidence sets and the one-change recipe written down.
  The next run should not have to re-derive the corpus.

## Traps

- **The motivating instance becomes the definition.** Each round's fix gets designed around the single
  text the last round waved — which is how a rule ends up narrow, then wide, then wrong.
- **Fixing the miss and re-measuring only the miss.** Round 2 of 263 measured the false-negative rate to
  0% and never measured the other direction; round 3 found the over-acceptance in the same code.
- **Documentation drifting ahead of the regex.** Notes said the rule matched things "a human reads as
  naming item 247"; the regex had no such scoping. Claiming a predicate is narrower than it is turns a
  bug into a false assurance — the class this repo keeps re-learning (212, 261, 266).
- **Prose residue counts.** "2 known exceptions, both the same shape" was wrong within one round. If a
  count can rot, derive it.
- **Zero-padding and numeric vs string comparison.** `065` vs `65` silently breaks a matcher that
  compares strings; compare numerically and test a padded id.

**Provenance:** item 263 (2026-08-11) — the in-flight check; three verifier rounds, four real defects
found (leg-A false positives 5/441 real refs; leg-B/C false negatives ~16% of real leading-id PR titles;
undercounted residue; over-wide scope rule), PARKED at the attempt budget on the last of them. Full
evidence in `specs/263-notes.md`.
