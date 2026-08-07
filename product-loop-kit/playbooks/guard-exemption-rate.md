# guard-exemption-rate — playbook

**When:** you are about to build a guard (a `test_*` gate, an audit lens, a drift check, a lint-shaped
sweep) whose design includes an **allowlist, an exemption set, a quarantine set, or a "known-good"
carve-out** — including one a spec explicitly asks for ("with a reasoned allowlist for genuinely X
values"). Also when reviewing a green gate that HAS such a set and you want to know what its green means.

**Answer in one line:** an exemption set is a guard's blind spot expressed as data, so **measure the
exemption RATE against the population before you write the guard** — past roughly a third, the guard
stops being a gate and becomes a tediously-worded `assert(true)`, and the fix is a different *mechanism*,
not a longer list.

**Not this playbook if** the checker's predicate is too narrow but it has no exemptions —
that's `detector-signal-coverage.md`. **Not this one** if you are auditing what "tests green" meant
after the fact — that's `test-gate-observability.md`. This playbook fires **before** the guard exists.

## Steps

1. **Derive the population, in code, before designing anything.** Not the list of things the motivating
   instance touched — the full set the guard *claims* to cover. Write the enumeration as a throwaway
   `node -e` first; if you cannot enumerate it cheaply, that is itself the finding (see trap 3).
   Item 241: a recursive walk over both `translations.js` language trees collecting every
   function-valued key → **306** (`(71 top-level + 1 landing + 81 planner) × 2`).

2. **Run the guard's proposed predicate over the whole population and count the failures.** Do this with
   throwaway code, before any product edit. You are not looking for bugs yet — you are measuring how many
   members the predicate would flag, i.e. how many exemptions the allowlist would need.
   Item 241: probing every parameter position of every entry with the number `1976` and failing on a bare
   digit run flagged **293 of 306** — because 293 entries take at least one param their callers already
   format (`amt`, `apy`, `tvl` arrive as `"$1,976"` strings).

3. **Decision rule — the ratio decides the mechanism, not your patience:**
   - **exemptions ≈ 0** → build it. The predicate matches the population; the allowlist is a real
     escape hatch and should be asserted EMPTY so a future exemption is a deliberate act.
   - **a handful (single digits, and enumerable with a per-entry reason)** → build it, keep the list as
     keyed data with a reason and a call-site citation per entry, print its size in the test output, and
     assert both directions against the population so it cannot rot (`RAZOR.md`'s mirror rule).
   - **a third or more** → **STOP. Do not build this guard.** A gate that exempts most of its own
     population cannot fail for the class it names. Go to step 4.

4. **When the rate is high, ask what the predicate cannot see — it is almost always a TYPE or an ORIGIN,
   not a value.** The tell: the members you would exempt are not different *in the artifact you are
   checking*; they are different in **who calls them**. That information still exists somewhere at
   runtime — find the narrowest place it is still visible and put the check there.
   Item 241: the dictionary cannot distinguish a pre-formatted param from a raw one, because the
   difference is in the caller. The one place it survives is the **accessor**, where
   `typeof arg === 'number'` is the *defining* mechanism rather than a resemblance of it — moving the fix
   there took the allowlist from 293 to **0**.

5. **Re-measure after the move.** The relocated guard must now flag zero exemptions across the same
   population you enumerated in step 1, and the population must be derived **fresh at test time**, never
   hardcoded — so a member added tomorrow is covered with no test edit. Assert a floor on the count
   (`> 250`) so an enumeration that silently returns nothing cannot read as a pass.

## Resolution

- Guard relocated (step 4) → allowlist empty and asserted empty; say the exemption rate in the PR
  explainer, because "allowlist size 0" is only meaningful next to the number it replaced.
- Guard kept with a small list → print its size every run, cite a call site per entry, and set-equality
  it against the population both directions.
- Guard abandoned with no better mechanism found → say so with the ratio, file the class as OPEN with the
  number, and do NOT ship a decorative version. A guard that launders a gap as coverage is strictly worse
  than no guard (`RAZOR.md`, item 212).

## Traps

1. **Trusting the spec's proposed shape.** Specs are written before the population is counted. Item 241's
   spec asked in good faith for a "reasoned allowlist"; the measurement showed the reasonable allowlist
   was 95% of the dictionary. Measuring first is cheap (one `node -e`); rebuilding a shipped guard is not.
2. **Mistaking a big allowlist for diligence.** 293 hand-reasoned exemptions look like more work than 0.
   They are more work producing less coverage — the list is the guard's blind spot, itemised.
3. **"The population isn't machine-readable, so I'll maintain the list by hand."** Then making it
   parseable IS the task (`RAZOR.md`, item 212). A hand-maintained copy of a machine-readable original is
   a mirror and rots on the first addition nobody remembers to mirror.
4. **Relocating the check without paying its costs.** Moving a guard to a chokepoint changes what
   downstream code receives — item 241's move handed dictionary entries a *string* where they expected a
   number, breaking 11 plurality predicates (`count === 1` is false for `"1"`) and turning
   `Number(amount).toLocaleString()` into `$NaN` in 10 entries on the live money surface. Grep the
   chokepoint's consumers for type assumptions BEFORE declaring the move cheap.
5. **Not proving the relocated guard can go red.** The whole point was a gate that can fail. Mutate the
   chokepoint (not just the motivating instance) and confirm the red is broad — item 241's accessor
   mutation turned **240** assertions red while the entry-level control stayed green, which is what
   distinguishes two working rules from one working rule and one dead one.

## Provenance

Distilled from item **241** (2026-08-05, `specs/241.md` / `241-notes.md` / `241-pr.md`, PR #401) — the
first run to kill a spec-proposed guard shape on a pre-build measurement (293/306) rather than shipping it
and learning later. Companions: `RAZOR.md` (no check narrower than the class it guards; the mirror rule),
`detector-signal-coverage.md` (predicate too narrow, no exemptions), `test-gate-observability.md` (what a
green run actually counted), `checker-by-design-classification.md` step 4 (measure the population before
designing the fix — the same instinct, applied to classification instead of exemption).
