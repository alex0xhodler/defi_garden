# stated-threshold-copy — playbook

**When:** **any served string** *states a number the code enforces* — a TVL floor, an APY ceiling, a pool
count, a minimum. Run this the moment you find ONE such sentence that disagrees with its constant, and
before you believe you have fixed it.

**Predicate WIDENED 2026-08-09 — "user-facing" was too narrow, and the narrowing cost us the worst instance.**
The audience is not the constraint; being *served* is. Machine-facing surfaces state the same thresholds to
the same trust question and are read by consumers that cannot sanity-check them: `llms.txt` / `llms-full.txt`,
`home.html`'s `navigator.modelContext` tool descriptions, JSON-LD `description` fields, markdown twins,
API contracts. On 2026-08-09 five of the nine live false claims were on machine-facing surfaces, and those
five are north-star leg (A)'s own citation layer. Read "copy" throughout this file as **any served text**.

**Answer in one line:** the sentence you found is a **symptom of a class** — every string that names the
same threshold is re-typed by hand and drifts independently, so fixing the one in the evidence leaves the
same falsehood on the same page in a different paragraph.

## The recurring shape

| Item | Surface | Claimed | Enforced | Found by |
|------|---------|---------|----------|----------|
| 159 | `llms.txt` / `llms-full.txt` | `TVL ≥ $10k` | `$10M` | hand |
| 174 | 2,234 `tokens/`+`chains/` pages | `DeFi Garden's trust filters — a $100K minimum TVL` | product floor `$10M`; page floor `$100K` | hand |
| 254 | 9 sites / 4 families: landing trust badge (en+ko), planner persona (en+ko), `navigator.modelContext`, `llms.txt` ×2, `llms-full.txt`, `stories/kevin.html` | `TVL ≥ $10M` | `$100K` (`DEFAULT_MIN_TVL`, moved 100× by `6fceca79bb`) | heartbeat 2026-08-08/09 |

All three were **prose**, not arithmetic. No number was computed wrong, so every numeric rail check
(`derived-number-rails.md`, `audit-app.js`'s magnitude scan) was structurally blind to them.

**Note the direction of travel: 159 and 254 are the SAME FILE, fourteen days apart.** `llms.txt` is the
repeat offender in this table, and 254 is its second appearance. When this playbook fires, grep `llms*.txt`
first, not last.

## Steps

1. **Never fix only the sentence in the evidence.** `grep` the *literal* across every copy source, both
   languages, before touching anything:
   ```
   grep -n '100K\|\$10M\|1000%' translations.js generate-*.js *.html
   ```
   174's evidence named 2 keys. The grep found **13**, four of which attributed the page's floor to
   *DeFi Garden* in exactly the same way.
2. **Separate the two defects — they have different fixes.**
   - *Drift*: the copy re-types a value the code owns → **interpolate from the constant**, never a second
     literal. One constant, one source of truth.
     **INTERPOLATION IS NOT ENOUGH — 254's lesson, and it defeated this rule in the letter.**
     `generate-llms.js` already interpolated: `:567` and `:688` call `formatTvlFloor(MIN_TVL_USD)`, and the
     literal `$10M` appears nowhere in the template. It still published a 100×-wrong floor for four days,
     because `:50` reads `const MIN_TVL_USD = 10000000; // mirrors app.js:801` — a **hand-maintained
     mirror** of a constant it no longer mirrors. Interpolating from a local copy passes every
     "no literal in the string" check while reproducing the whole defect.
     **The rule that closes it (item 212, LEARNINGS 2026-08-03, generalised here from lists of names to
     numeric constants):** a value that exists in two places and is *enforced* from one is a **mirror**.
     Import it from the enforcing site, or — if the enforcing file is not requireable from the generator —
     add an **equality test against the enforcing site in the same commit that creates the mirror**. A
     comment asserting "mirrors app.js:801" is not a test; that comment was present and true when written,
     and it is what made the next reader trust the gap.
     Triage question to ask of every stating site before writing the fix: *does this site read the enforcing
     constant, mirror it, or re-type it?* Three different fixes. In 254: `llms.txt` ×3 = mirror,
     `generate-stories.js:230` = re-typed literal, the `translations.js` strings = re-typed literal.
   - *Attribution*: the copy scopes a local bar to the whole product ("**DeFi Garden's** trust filters",
     "**our** floor") in answer to a trust question → **re-scope the sentence** ("pools **on this page**
     clear …", "that is this page's listing bar, not a safety guarantee"). Interpolation alone does not
     fix this one, and it is usually the more damaging half.
3. **Decide whether the threshold itself is wrong — separately, and usually not in this item.** A surface
   deliberately below the product's floor may be a *directive* (174: the `$100K` SEO floor is a
   2026-07-11 human decision). Changing it is a product-shape call: flag it, do not assume it.
4. **Prove the interpolation with a mutated constant, not with a string match.** Asserting *"the page
   contains `$100K`"* stays green against a hardcoded literal — it cannot tell interpolated from
   re-typed. The check that works: copy the generator to a temp dir with the constant rewritten
   (rewriting relative `require()`s to absolute so siblings resolve), render, and assert the new value
   appears and the old one is **absent everywhere**, on every page type including hubs.
5. **Both languages, same commit.** EN + natural KO together (standing decision 2026-07-09); a money
   figure keeps its original currency unit in KO — never relabel `$` to `원` (the 137 trap).
6. **Regenerate and re-grep the OUTPUT.** The fix lives in a template; the lie lives in 2,200 committed
   files. `grep -rl "<old sentence>" tokens/ chains/ ko/ | wc -l` → 0 is the acceptance evidence, not the
   source diff.
7. **NEW 2026-08-09 — check whether a scheduled job is RE-MINTING the claim, before you believe a clean grep.**
   `.github/workflows/sitemap-update.yml` runs `cron: '0 2 * * *'` and regenerates `llms.txt`, `llms-full.txt`,
   `tokens/`, `chains/`, the twins and the sitemaps every night. 254's false rail was republished **three
   times** by that job after the constant moved (`748582f2d4`, `7c8105bb75`, `7ab2994aff`). Consequence:
   **a fix applied to the output is reverted within 24 hours**, and a grep run the same afternoon proves
   nothing about tomorrow. `git log --oneline -- <output file>` tells you in one line whether the file is
   hand-authored or machine-authored. Acceptance for a machine-authored surface is the **generator diff plus
   a re-run of the generator**, never the output grep alone.

## Resolution

Parameterize every string naming the threshold, re-scope every attribution, regenerate the surface, and
commit a mutated-constant test. Risk tier **HIGH** by default: it regenerates an SEO surface and changes
user-facing copy in two languages, even though it only makes claims *more* conservative. Strengthening a
claim is not on the NEVER list; **relaxing the underlying rail is** — if the honest fix seems to require
moving the constant, stop and ask.

## Traps

- **The safety-question sentence is the worst instance, and rarely the only one.** Grep for the FAQ/trust
  keys first, then sweep the descriptions, intros, sub-lines, dataset schema descriptions and hub pages —
  JSON-LD `description` fields carry the claim to LLMs and search engines with no visible-page tell.
- **A claim can be true of the page and false of the product simultaneously.** That is not a wording nit:
  the reader is asking about the product. Scope explicitly or say nothing.
- **Fixing the copy can silently change the data.** 174's zero-APY-row fix had to keep its eligibility
  gate on the *pre-filter* slice, or the page set would have grown — copy work that reshapes a generated
  set is an SEO-surface change wearing a copy-change costume. Prove the set is unchanged by running the
  OLD and NEW generators against the SAME fixture and `diff`ing the slug lists.
- **`audit-app.js` will not catch this class.** Its checks are numeric-magnitude and link-integrity; a
  perfectly-formatted false sentence scores zero findings. Until a claim-vs-constant detector exists, a
  clean audit means "no absurd numbers", not "no false claims".
  **Sharpened 2026-08-09: there IS now a `tvl-floor-claim` signal (`audit-app.js:513`, P1) and it is worse
  than nothing here — it RAN over `llms.txt` on 2026-08-08 and returned 0 suspects** while that file stated
  a 100×-wrong floor. Its predicate (`:700-720`) asks whether any figure in the same section is *smaller than
  the floor the document itself states* — an **internal-consistency** check that never reads
  `DEFAULT_MIN_TVL`. A document may state any floor it likes, consistently, forever. This is 212's
  "guard watching a resembling mechanism launders the gap as coverage", on this exact class. Do not read
  `tvl-floor-claim: 0` as evidence of anything until it is rail-relative (folded into item 254).
- **Separate the three wrongnesses before you size the item — they are not the same size.** 254 measured:
  the stated **floor** wrong by 100×, the stated **pool count** wrong by ~10× (545 published vs 5,241
  non-zero-APY pools clearing the enforced floor), and the **rate that flows into plan math** wrong by
  **0.7%** (median 3.01% at $10M vs 2.99% at $100K; forever number $7,973 vs $8,027). "The agent layer
  publishes a wrong rate" would have been false. "The agent layer describes a product that no longer
  exists" is true and is the real defect. State which of the three you mean.

## Provenance

Written 2026-07-29 from item 174 (`specs/174.md`, `174-notes.md`, `174-pr.md`), generalising item 159
(`llms.txt` TVL floor). Step 4's mutated-constant technique is 174's own build-agent invention after the
first pass shipped a fix that a string-match test would have passed. Sibling of
`derived-number-rails.md` (numbers computed wrong) — this one is for numbers *described* wrong.

**Updated 2026-08-09** from item **254** (`specs/254.md`, `signals/2026-08-08.md` §2b, `signals/2026-08-09.md`
§2b(2)) — the third instance in the table and the second on `llms.txt`. **Predicate WIDENED, not narrowed,
and the rot rule re-asked on the update** (`RAZOR.md`): the file's trigger moved from *"a user-facing string
states a number the code enforces"* to *"any served string states a number the code enforces"*, which
strictly contains everything it already held — every user-facing surface is a served surface, and the
machine-facing ones it now covers are exactly where 254's worst five instances live. Three additions, each
generalising rather than pinning to this instance: interpolation-from-a-mirror as a distinct failure mode
from a re-typed literal (step 2, importing item 212's mirror-equality rule from lists of names to numeric
constants); a scheduled regeneration job as a reason an output grep proves nothing (step 7); and the
floor / count / rate decomposition, so the next instance is sized honestly instead of at its most alarming
reading (traps).
