# Spec <ID>: <title>

## Evidence
<!-- Verbatim numbers from the heartbeat. If there's no evidence, this item shouldn't exist. -->

## Hypothesis
We believe <change> will <effect> because <reasoning>. Confidence: guess | supported | validated-pattern.

## Change
Smallest version that tests the hypothesis. What is explicitly OUT of scope.

## Acceptance criteria
<!-- Checkable by a verifier who never saw this conversation. "Works well" is not a criterion. -->
- [ ] ...
- [ ] Tests: ...
- [ ] Instrumentation: event `<name>` fires on `<path>` with properties `<...>`

## Measurement
Metric: … · Window: 14 days · Decision rule: keep if <threshold>, else revert-candidate.
Minimum sample per NORTH_STAR.md.

## Risk tier (builder's guess — verifier assigns independently)
LOW | HIGH + why

## Open questions
<!-- Anything that would change the architecture → item is BLOCKED until the human answers. -->

## Territory notes
<!-- Build loop appends findings from the blindspot pass here. -->
