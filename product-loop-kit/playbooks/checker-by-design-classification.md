# checker-by-design-classification — playbook

**When:** a checker (`audit-app.js`, a `test_*` gate, `validate-sitemaps`) reports a **blocking** finding
on behaviour that some other repo artifact — a spec, a `-pr.md` explainer, a `reports/` close-out —
describes as **deliberately shipped**. The tell is two same-repo documents disagreeing about one surface:
the audit says *defect*, the report says *honest fallback, working as designed*. Item 194's shape exactly
(`sdai` pool-detail CTA, 2026-07-31).

**Answer in one line:** the checker is usually right about the *state* and wrong about the *category* —
it has no branch for "this is the by-design case", so the by-design case falls into whatever branch is
the catch-all, and that catch-all is almost always the blocking one.

## Steps

1. **Do not pick a side from the two documents.** They are both secondary sources. Go to the primary
   one: the upstream/live data the render actually depends on. For a protocol-URL finding that is
   `https://api.llama.fi/protocols` — fetch it in-session (node reaches it; the browser does not, per
   the 2026-07-12 network decision) and look at the ONE record.
   *Decision rule:* the record is **present with an empty/invalid field** ⇒ by design, nothing to fix
   upstream-side. The record is **absent entirely** ⇒ genuine coverage gap, the checker is right.
   Item 194: `{"name":"sDAI","slug":"sdai","url":"","category":"Yield"}` — present, blank ⇒ by design.
2. **Read the generator/filter that dropped it**, not just the consumer. `generate-protocol-urls.js`'s
   `isValidHttpsUrl()` (`/^https:\/\/\S/`) rejects blank/`http://` on purpose — its own comment says
   baking those *"would ship a dead/insecure link from our own origin forever"*. A deliberate filter
   upstream is what manufactures the "missing" state downstream.
3. **Find the catch-all branch.** `classifyCtaKind()` (`audit-app.js:~2179`) was
   `undeterminable → defect(no tier) → environment → defect`. Nothing between "no tier" and "defect".
   *Decision rule:* if the by-design state and a real defect produce **identical inputs** to the
   classifier, no amount of re-reading the code will separate them — the classifier is missing an
   **input**, not a branch.
4. **Measure the population before designing the fix** (this is what makes it a one-line change instead
   of a philosophy). Count how many members of the corpus are in the by-design state vs the real-gap
   state. Item 194: 20 uncovered project keys, **20/20 by-design (blank upstream url), 0 genuine gaps** —
   250 bytes serialized. A tiny, fully-enumerable set means it can be recorded as data.

## Resolution

Give the classifier **positive evidence** of by-design-ness, produced by the component that already
knows — the generator that did the dropping — and gate the downgrade on that evidence being present:

- Generator emits what it deliberately skipped (item 194: `unreachable: [...sorted keys]`), restricted to
  entries that **exist upstream but were filtered**. A key absent from upstream must never enter this
  list — that is the real-gap case and must keep classifying as a defect.
- Consumer reads it **tri-state** (`true` / `false` / `null`≡unknown) and downgrades only on strict
  `=== true`. An old or malformed artifact yields `null` ⇒ today's blocking behaviour, never a silent
  downgrade.
- The new kind sits **before** the final catch-all but never **as** it (spec 183's non-vacuity contract).
- Severity goes to the existing non-blocking lane (`P2`), alongside the other legitimate downgrade —
  don't invent a third severity.

## Traps

- **Never widen the detector's silence to fix a false positive.** Suppressing the finding entirely
  (or dropping the check) blinds you to the real-gap case, which looks identical from the render side.
  The acceptance must be symmetric: one test proving it is now QUIET on the by-design pool, one proving
  it still FIRES when the evidence is withheld. A downgrade that can never fail to apply has removed
  the gate rather than fixed it.
- **Adding a field to a served artifact can kill the artifact.** `app.js:1293` hard-rejects
  `json.schemaVersion !== 1` and returns — bumping the version to advertise the new field would have
  silently dropped the whole baked tier and regressed north-star CTA coverage 99.9% → 70.9%. Check every
  consumer's validation before touching a schema; prefer purely additive fields with the version pinned.
- **The wrong assumption is often already written into a test.** `test_audit_cta_provenance.js:57` was
  literally named *"the sdai shape"* → `defect`, which is why the suite never caught this. Grep the tests
  for the instance name before assuming the gate would have told you.
- **A checker false-positive is not free.** It costs operator trust and, at item 192's 32-wide rotation,
  makes the heartbeat exit non-zero on the north-star surface most runs — indistinguishable from a real
  outage at a glance.

## Provenance

Item 194 (`specs/194.md` §2 diagnosis, `194-notes.md`, `194-pr.md`), 2026-07-31 — distilled from the
contradiction between `audit-app.js`'s `kind=defect` P1 on `pool-detail:13392973` and
`reports/2026-07-31.md:4`'s item-182 close-out. Lineage: item 182 (the fallback being classified), item
183 (the non-vacuity contract this fix had to keep). Related but distinct: `dual-source-logic-divergence.md`
§10 covers a checker false-positive caused by a **forked predicate**; this playbook covers one caused by a
**missing category**. Tell them apart by step 3 — a fork has two copies to diff, a missing category has
none.
