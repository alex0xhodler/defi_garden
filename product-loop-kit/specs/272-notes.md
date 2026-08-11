# 272 — implementation notes

## What was done
Text-only edits to five kit files plus this item's bookkeeping, one commit tree:
- `NORTH_STAR.md` — standing-decision entry appended, transcribed from the operator's drafted source with only formatting fit-up (list indentation to match the surrounding block). No number, no clause, and no ordering changed.
- `agents/verifier.md` — new "Verdict semantics" section between the input line and the checks; ceremony caps inserted as check **6**, risk tier renumbered **6 → 7**; output block gains `PASS-WITH-AMENDS` and splits `FAILURES` into `BLOCKING` / `AMENDS`.
- `prompts/build.md` — new **§0** (caps table, wall clock, Impact field) before §1; pickup arithmetic added inline to §1's first paragraph; §4 gains a verdict-type line above the existing 3-attempt rule; §5's explainer bullet gains the cap + Impact-first-line requirement.
- `prompts/heartbeat.md` — new **§2d** (vitals + breach thresholds) before §3; §4 gains the process-item filing cap and the Impact requirement on written specs.
- `specs/_template.md` — `Impact:` line + a 3-line comment naming the allowed forms and pointing at build.md §0.

## Deviations from the spec / from the source
1. **Two consistency edits beyond the four the brief enumerated for build.md.** §4 previously said only "Verifier FAIL → fix and re-verify. After 3 total attempts…", which contradicts the caps' "verifier rounds 1 LOW / 2 max HIGH" and knows nothing of AMENDs; §5's explainer bullet had no cap. Both got one added line rather than a rewrite — the original 3-attempt sentence is left standing verbatim beneath, because the human's rule voids *remaining* budget on oscillation and does not itself delete the 3-attempt ceiling. Flagging the residual tension: a HIGH item can now hit the round cap (2) before the attempt cap (3). Read the round cap as binding.
2. **No new ticket for the class residue.** Spec 272's "class closed: no" would normally file a row; row **271** already tracks exactly this population (53 memory-only prose rules), and filing a second process row would breach the very cap this item writes. Recorded here instead.
3. **`.claude/agents/verifier.md` overwritten** with the edited kit version (`cp`, byte-identical) so this session's verifier runs the new semantics. **Correction to the build brief**, which described that path as a gitignored runtime mirror outside the diff: `git check-ignore` exits 1 and `git ls-files` lists it — it is **TRACKED**, it was byte-identical to the kit file before this change, and the copy therefore DOES appear in this diff (same +25/−3). Left in, in sync, rather than reverted: two tracked copies of one file with no equality test is a 212-class mirror, and the honest disposition is to keep them equal and name the drift risk — another argument for row 271.

## Conservative choices
- Did **not** touch the extension-attack check, the criteria/new-check review rule, instrumentation, scope, or deviations. The brief is explicit and the evidence agrees: those found 4 real bugs this week. The reset changes what a finding COSTS, never what counts as one.
- Did **not** convert any of the five rules into a script. Every one is prose an agent must remember — the same enforcement class row 271 exists to shrink. That is a deliberate scope refusal (the brief bans new tooling), not an oversight.
- Caps table is duplicated verbatim in `verifier.md` and `build.md` rather than referenced from one place, because both are read by agents that may not read the other file. Duplication is a mirror in the 212 sense; it has no executable equality test, which is a real (small) risk and is the strongest argument for 271 picking this rule up next.

## Verification
- `node product-loop-kit/test_pr_orphan_detector.js` → exit 0; `node product-loop-kit/test_item_inflight_check.js` → exit 0. Neither file appears in `git diff --stat`.
- Caps cross-checked by hand across the three files that state them (verifier.md check 6, build.md §0, NORTH_STAR rule 2): all seven rows identical.
- Self-application: spec 48 lines (cap 80), these notes under 60, PR explainer under 40, LOG line under 300 chars.
