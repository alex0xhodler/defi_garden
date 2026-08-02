# cost-gate-measurement — playbook

**When:** a backlog item is filed *measure-then-decide* — "widen X, but measure the cost first; proceed
only if < N MB / < N KB" — and you are the tick that has to produce the number and apply the rule.
Also when you are about to *write* such an item and need the threshold to be unambiguous.

**Answer in one line:** measure the **cheapest variant that could actually ship**, not the headline
population the ticket names — and settle *raw vs compressed* before you quote a verdict, because those
two readings routinely disagree and the ticket usually says which one it meant without noticing.

## Steps

1. **Find the population the ticket names, then find the one an implementation would need.** They are
   rarely the same set. Ask: what does the *existing* consumer read, and would the widened artifact still
   contain it?
   - Decision rule: if the current artifact serves consumers whose ids are **not** in the new population,
     the implementable set is the **union**, not the new set. Sizing on the new set alone measures a
     design that would delete a live feature.
   - 208's case: the ticket said "3,669 deep-linked vs 736 snapshot pools". 309 snapshot pools are not
     deep-linked and their series backs every shipped grid KPI, so the real floor was the 3,979-id union
     (+8% over the headline figure), and that 8% is what crossed the threshold.
2. **Also measure the additive-sidecar variant.** A *new* separate file holding only the marginal ids
   leaves the existing artifact byte-untouched and is usually the cheapest shippable shape. If even the
   sidecar fails the gate, the NO-GO is unarguable — you have priced the floor.
3. **Generate the artifact for real; never scale a ratio.** `require` the repo's own projection function
   (`slimPoint`, the real serializer) and the repo's own envelope — then diff the envelope's key list
   against a committed instance. A hand-rolled shape silently drops or adds fields and mis-sizes by
   percent-level amounts, which is exactly the resolution these gates are decided at.
4. **Measure raw AND `gzip -9`, and decide which the rule meant — from the ticket's own text.**
   - Decision rule: read what the *other* criteria in the same rule say. If a sibling criterion says
     "gzipped" explicitly and this one says "byte cost" or "repo-size delta", the author distinguished
     them deliberately → **raw**. If the rule is silent everywhere, say so and report both.
   - Never let this stay implicit. Raw-vs-gzipped is a ~2× factor and will flip most verdicts.
5. **Ask whether the population is fixed or growing.** If the artifact regenerates daily from a live
   source, a threshold cleared by a few percent is not cleared. Say so in the verdict.
6. **Before writing NO-GO, ask whether a cheaper *shape* exists** that the ticket did not consider —
   usually "don't retain the wide thing at all; derive the narrow thing on demand / at CI time". Probe the
   feasibility (one request, not a loop) and record it.
   - Decision rule: if the cheaper shape needs a new external dependency or a different architecture,
     **file it, do not build it** (`prompts/build.md` §1 — never guess an architecture-changing answer).

## Resolution

- **Any criterion fails →** stop, park the item with the measurements in `specs/<id>-notes.md`, and state
  the failure's robustness explicitly: does it fail on every variant, under both unit conventions
  (MB vs MiB), and under both readings ("total at retention" vs "marginal delta")? A verdict that survives
  all three is a decision; one that survives none is a coin flip wearing a table.
- **All criteria pass →** proceed to the build phase, but re-state the headroom in the notes so the next
  tick knows how much drift the design can absorb.
- **Either way**, name the one assumption the verdict rests on, in the notes, in the open. If the opposite
  reading of the threshold gives the opposite answer, the human must be able to see that in one sentence.

## Traps

- **Sizing the headline population.** The single most likely error, and it biases *toward* a false GO
  (the unimplementable set is smaller than the union).
- **Extrapolating from a ratio** ("~5× the current file"). 208's union came in at 5.40×, not the 4.99× the
  deep-linked set implied — and the gap straddled the line.
- **Trusting one tool's gzip.** Two `gzip -9` invocations in this repo's own tooling disagreed by ~4-5%.
  Re-measure the decisive number yourself, and record the **more conservative** figure.
- **Measuring a "real" artifact whose values are synthetic.** If the values cannot exist yet, say which
  half is real (usually: keys real, values sampled from committed real ones) and reason about the direction
  of the error. Fresh-population values are usually mostly `null` → serializes *smaller* → a pass is safe,
  a fail is suspect.
- **Believing a floor is applied in one place.** Before concluding "source X already covers the wider set",
  grep the *writer*, not the reader: 208's D1 endpoint looked like a population upgrade and was a
  granularity upgrade, because the poller re-applies the same TVL floor at write time
  (`src/poller-core.js:48`, "the ONLY drop").
- **Treating "no cost data available" as no-go.** A measure-then-decide item that parks *without* numbers
  has failed; parking *with* numbers is the successful outcome the ticket asked for.

## Provenance

Distilled from item **208** (2026-08-02, Phase 1 measurement → documented NO-GO, parked): widening the
kpi/history population from 732 to ~3,670 pools. Union variant 6.588 MB at retention / 5.367 MB delta
against a < 5 MB gate; lean pool-detail artifact 125.4 KiB gzipped against a 250 KB gate (passed);
D1 `/history` ruled out as a population source; `yields.llama.fi/chart/<id>` found to carry 1,190 real
history points for a $791K pool, which reframed the blocker as economic rather than infeasible.
See `specs/208-notes.md` and `specs/208-pr.md`.
