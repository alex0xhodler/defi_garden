# Spec <ID>: <title>

Impact: <north-star leg A|B | guardrail — <which> | defect-count n→0 on <surface>>
<!-- Required. Repeated VERBATIM as the first line of this item's PR body. Can't fill it? Then this is a
     process item by definition (build.md §1 pickup arithmetic). Ceremony caps for spec/notes/PR/LOG
     length, verifier rounds and test:code ratio: build.md §0 — over-cap is a verifier FAIL fixed by deleting text. -->

## Evidence
<!-- Verbatim numbers from the heartbeat. If there's no evidence, this item shouldn't exist. -->

## Hypothesis
We believe <change> will <effect> because <reasoning>. Confidence: guess | supported | validated-pattern.
<!-- Confidence = across how many plausible futures this pays off (RAZOR.md), not conviction. -->
- Instance of: <the class this defect/opportunity is an instance of — name the population>
- Class closed by this item: yes / no — <if no: the number left open, and where it's ticketed>

## Change
Smallest version that tests the hypothesis. What is explicitly OUT of scope.

## Acceptance criteria
<!-- Checkable by a verifier who never saw this conversation. "Works well" is not a criterion. -->
- [ ] ...
- [ ] Tests: ...
- [ ] Instrumentation: event `<name>` fires on `<path>` with properties `<...>`
- [ ] Non-vacuity: <the mutation that must turn the new gate red, and proof it was run — red, then byte-identical restore, then green>
- [ ] Population: <what population the tests draw from, derived at test time — never only the motivating instance>

## Measurement
Metric: … · Gate: window opens at ≥30 real exercised events on <the step this claims to move> (crawler events never count) · Backstop: gate unopened 60d after ship → close UNEXERCISED · Decision rule: keep if <threshold>, else revert-candidate.
Calendar windows only for build-leg verification. Minimum sample per NORTH_STAR.md.

## Risk tier (builder's guess — verifier assigns independently)
LOW | HIGH + why

## Open questions
<!-- Anything that would change the architecture → item is BLOCKED until the human answers. -->

## Territory notes
<!-- Build loop appends findings from the blindspot pass here. -->
