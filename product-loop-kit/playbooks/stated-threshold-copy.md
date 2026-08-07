# stated-threshold-copy — playbook

**When:** a user-facing string *states a number the code enforces* — a TVL floor, an APY ceiling, a pool
count, a minimum. Run this the moment you find ONE such sentence that disagrees with its constant, and
before you believe you have fixed it.

**Answer in one line:** the sentence you found is a **symptom of a class** — every string that names the
same threshold is re-typed by hand and drifts independently, so fixing the one in the evidence leaves the
same falsehood on the same page in a different paragraph.

## The recurring shape

| Item | Surface | Claimed | Enforced | Found by |
|------|---------|---------|----------|----------|
| 159 | `llms.txt` / `llms-full.txt` | `TVL ≥ $10k` | `$10M` | hand |
| 174 | 2,234 `tokens/`+`chains/` pages | `DeFi Garden's trust filters — a $100K minimum TVL` | product floor `$10M`; page floor `$100K` | hand |

Both were **prose**, not arithmetic. No number was computed wrong, so every numeric rail check
(`derived-number-rails.md`, `audit-app.js`'s magnitude scan) was structurally blind to them.

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

## Provenance

Written 2026-07-29 from item 174 (`specs/174.md`, `174-notes.md`, `174-pr.md`), generalising item 159
(`llms.txt` TVL floor). Step 4's mutated-constant technique is 174's own build-agent invention after the
first pass shipped a fix that a string-match test would have passed. Sibling of
`derived-number-rails.md` (numbers computed wrong) — this one is for numbers *described* wrong.
