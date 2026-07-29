# detector-signal-coverage — playbook

**When:** you are adding a signal to a checker (`prescanStaticPages`, `prescanTextSurfaces`, `prescanPools`,
`validate-sitemaps`, any `test_*` gate), OR a real defect just shipped on a surface that a checker already
covers and the checker was **green the whole time**. The tell is a checker reporting `suspectCount: 0` on a
file that a human then found a bug in by hand.

**Answer in one line:** the checker's signal set was drawn from the *last* bug found, so it can only see that
bug's class — enumerate what the surface **asserts** (not what it contains), and the uncovered assertion
classes are where the next bug already is.

## The pattern this exists to break

Three consecutive instances in this repo, same shape every time:

| item | surface | signals the checker had | class that shipped anyway |
|---|---|---|---|
| 148 | `tokens/*.html` | one hand-picked page rendered | 7 junk slugs in the tail of 2,167 pages |
| 159 → 160 | `llms.txt` | numbers + emptiness (`apy-rail-breach`, `broken-number-literal`, `tvl-floor-claim`, `empty-surface`) | 32 **mis-targeted links** (item 166) |
| 166 → 167 | pool-detail | one hardcoded flagship pool (`PREFERRED_POOL_ID`) | every real bug was on a non-flagship pool (122/144/145/165) |
| 169 → 172 | `tokens/*.html` + `chains/*.html` | slugs + numbers (`junk-slug`, `zero-yield-claim`, `broken-number-literal`, `absurd-magnitude`) | **~41,300 links never looked at**, incl. the 4,989 `?pool=` hops into the north-star surface — the same class 169 had just closed on the *text* surfaces two files away |

Each fix was specced from the previous bug, so each new checker inherited the previous bug's *shape*:
number bug → number detectors; one-page audit → one-page audit. Item 169 is the text-surface twin of 167.

## Steps

1. **List what the surface ASSERTS, not what it holds.** For each artifact, write one line per kind of claim
   it makes. `llms.txt` asserts: a rate (number), a size (number), a name (string), *and a destination*
   (link) — that fourth one had no detector for four items. A page asserts: a title, a count, a price, a
   canonical, a link target, a language.
2. **Cross off the claims that already have a signal.** Read the signals table directly — `audit-app.js:208`
   (`TEXT_SURFACE_SIGNALS`), `:194` (`POOL_PRESCAN_SIGNALS`), `:176` (`PRESCAN_SIGNALS`). What is left over
   is the blind spot, and it is not hypothetical: check the leftover classes against the *committed bytes*
   before writing any code (a 20-line `python3` scan over the artifact is enough, and it is the same scan
   your detector will later encode).
3. **Decision rule.** Leftover class trips on today's committed bytes → **file it as a bug, not a detector
   item** (fix the emitter first; the detector then has a true negative to prove itself against — 160's own
   rule, restated in 169). Leftover class is clean today → **file the detector**, and require a historical
   positive control (see step 4). No leftover class → say so explicitly in the notes; "the signal set is
   complete for the claims this surface makes" is a real, useful finding.
4. **Every new signal needs BOTH controls, executed:**
   - **positive** — real bytes from before the fix (`git log --oneline -- <artifact>` → the commit before the
     fix commit → `git show <sha>:<file>`). Real historical bytes beat a hand-written fixture: a fixture is
     written from your mental model of the bug, which is the same mental model that missed it.
   - **true negative** — the current committed artifact, expected clean. If it goes red, the signal is
     over-tight: **fix the signal, never the surface.**
5. **Prove each sub-rule non-vacuous separately.** Neuter one rule at a time, confirm the control loses
   exactly that rule's suspect and keeps the others, restore byte-identically (`md5sum`), confirm green.
   A single combined cycle cannot distinguish "three working rules" from "one working rule and two dead ones"
   (item 166's verification found exactly that: two guards sharing an exit code stayed green with one removed).

## Resolution

- Detector-only diffs touch no product file, no generator, no generated surface, no dependency — they are
  additive checks and land under the ordinary risk policy (usually HIGH on **size** once tests are counted:
  154 +184, 157 +224, 166 +226 all crossed the 150-line LOW cap).
- Single-source anything the detector compares against (`APY_SANITY_LIMIT`, the router's param arrays in
  `home.html:77-78`). A second hardcoded copy of the truth is itself the drift bug the detector is meant to
  catch.
- One suspect per file per signal, examples capped in `detail`. A systemic defect must not flood findings.

## Traps

- **"The checker was green" is not evidence of health until you have proven it can go red.** (`LEARNINGS.md`,
  2026-07-27.)
- Specifying the new detector from the last bug's *shape* is the failure this playbook is about — resist
  "add another number check" when the last three misses were links, targets and coverage.
- Comparing whole lines/whole files instead of the extracted claim makes a rule trivially true and therefore
  vacuous (169 rule (c): compare the extracted `% APY` / `$ TVL` literals, not the line).
- A historical fixture that is 200KB does not belong in the repo: commit **verbatim excerpted lines** with the
  provenance sha, and additionally reconstruct the full artifact via `git show` inside a try/catch so the test
  is stronger where git exists and still non-vacuous where it does not.
- Don't extend a new signal across surface families in the same item (text + HTML + sitemaps + OG). One family
  per item — 160's rule, held by 167 and 169.
- **`runAudit()` clobbers the heartbeat's snapshot.** `audit-app.js:115` defaults `outPath` to the *committed*
  `product-loop-kit/signals/audit-findings.json`, so any verification run — including a scoped
  `runAudit({only:[…]})` — silently overwrites the last heartbeat's findings with your partial run. Observed
  twice in item 169's session (build agent and verifier both hit it). Always `AUDIT_OUT=/tmp/… node audit-app.js`
  when auditing for verification, and `git status` the signals folder before committing.
- **Aggregate the whole file, don't `break` at the first hit.** One-suspect-per-file is a *reporting* cap, not a
  *scanning* cap: the suspect's leading number must still be the true total, with the examples capped and a
  `(+N more)` tail. A rule that stops scanning at its first hit reports "1 conflict" on a file with ten and
  looks identical to a healthy file that has one. Caught by the verifier in 169 with a two-group synthetic
  fixture — worth making that fixture the standard probe for any new aggregate signal.

- **"One family per item" has a companion rule: WRITE DOWN the families you deferred, with their size.**
  169 deferred HTML correctly and said so in one clause of its non-goals (`specs/169.md:41`). That clause
  was the whole evidence base for 172 the next week — the deferral is only useful if the next reader can
  find it and price it. State the deferred family AND a number (`prescanStaticPages` covers 2,183 files vs
  `prescanTextSurfaces`'s 2), so the follow-on is rankable instead of rediscovered.
- **When you port a signal to a new surface family, re-derive the rule from that surface's own semantics.**
  A ported rule that reads identically is usually wrong: rule (a) on text surfaces is "is this key routed?",
  which on HTML splits by link path (`/` → the router arbitrates; `/plan.html` → the path already decided;
  `/tokens/…` → the query is inert). The port that copies the predicate instead of the *question* produces
  a detector that is simultaneously too tight and too loose. See `product-audit.md` check 10's HTML half.

**Provenance:** distilled from item 169 (`specs/169.md`, `169-notes.md`) — the `link-target-integrity` signal —
generalising the pattern named in its backlog row and previously hit by items 148 → 159/160 → 166/167.
