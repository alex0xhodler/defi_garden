# dead-generated-link-repair — playbook

**When:** a checker (or a human) reports that links on a **generated** surface (`tokens/*.html`,
`chains/*.html`, `llms.txt`, `llms-full.txt`, `sitemap-*.xml`) resolve to an **empty** target — the link is
perfectly routed, it just returns nothing. Items 173 (1,749 dead HTML CTAs) and 180 (63 dead llms links) are
the two instances so far.

**Answer in one line:** do **not** reach for 173's `&minTvl=<generator floor>` fix reflexively — first
compare the generator's own floor with the app's, and check whether the section's *named* destination already
exists somewhere else in the file; the repair is under-flooring, retargeting, or omission, and the data tells
you which.

## Steps

1. **Reproduce the count yourself, against a live population, before reading any code.**
   `curl -sS https://yields.llama.fi/pools` (network is open per the 2026-07-12 standing decision) and
   simulate the app's own arithmetic: `minTvl` explicit-param-wins else `DEFAULT_MIN_TVL` (`app.js:927`,
   `:801`), token = case-insensitive substring on `symbol` (`app.js:835`), chain = exact, `protocols` = exact
   `project`, `poolTypes` via `getPoolType` (`generate-sitemap.js`), qualification
   `(tvlUsd||0) >= floor && > 0`. `test_seo_cta_targets.js:87-120` is the reviewed reference — mirror it,
   don't import it.
   **Decision rule:** if your count doesn't match the filed count, stop and find out why before building.
   A drifting number here means the two simulations disagree, and one of them is wrong.

2. **Print the count PER SECTION, not per file.** 180's 63 were confined to two sections out of eleven; the
   other 473 grid links were fine. A per-file number hides which generator branch is broken.

3. **Compare the generator's own floor with the app's — this decides whether 173's fix even applies.**
   `grep -n "MIN_TVL\|MIN_POOL_TVL" generate-*.js app.js`
   - generator floor **below** the app's (HTML generators: $100K vs $10M) → the link is alive at the floor
     the page itself used, so **emit that floor on the link** (item 173's fix). Correct because the page's
     own claim and the link now agree.
   - generator floor **equal to** the app's (`generate-llms.js:28` `MIN_TVL_USD`) → the target is dead at the
     generator's own floor too. **Under-flooring is a no-op**, and reaching *below* it publishes a floor the
     same file contradicts in prose — 174's defect, re-introduced. Go to step 4.

4. **Ask whether the section is mis-targeted before touching any floor** (spec 175's instruction, and the
   thing that made 180 a 30-line decision instead of a floor argument). For a section named after a page
   type, check whether those pages *already exist in the same file*:
   `grep -c "defi.garden/chains/" llms-full.txt` → 88, all sitting in `## Other Pages` under
   *"Additional site functionality and tools"*, while `## Chain Pages` listed app-grid query URLs.
   **Decision rule:** if the section's proper destination exists, retarget the dead links to it. That fixes
   the emptiness *and* the section's name at once, with no floor change and no honesty cost.

5. **Split the dead set by whether an honest destination exists at all.** For each dead link, does the
   static page exist (check the **parsed sitemap URL set**, not the filesystem — output dirs are
   configurable), and does the entity have any qualifying pool at the *page* floor?
   180's split: **48** had a page → retarget; **14** had none *and* zero non-zero-APY pools even at $100K →
   there is no honest destination, so **omit and count**. Confirm the omission class is the same class the
   page generator's own quality gate already rejected (`generate-chain-pages.js:78` `MIN_QUALIFYING_POOLS`) —
   if it is, omission is item-013/030/148-class quality work, not de-indexing, and the URLs stay in the
   sitemap either way. Say that explicitly in the PR; it is the NEVER-list question a reviewer will ask.

6. **Repair a threshold param instead of deleting the link.** A dead link carrying `minApy`/`minTvl` is a
   *constraint* problem, not a destination problem: walk a documented descending ladder (180 used
   `[10, 5, 3, 1]`), take the highest rung that resolves ≥1 pool, then drop the param, then omit. Never
   invent a threshold; never keep a rung you didn't verify.

7. **Verify the chosen value under EVERY population that will judge it.** The generator judges links against
   the live feed's `apy`; `audit-app.js`'s level-3 re-checks the committed file against
   `data/pools-snapshot.json`, where there is **no `apy` field** — it derives `apyBase+apyReward`
   (`audit-app.js:925`). 180 measured a real disagreement (live: one Staking pool at 10.18%; snapshot: top
   6.40%), so a live-only rung choice would have left the audit red. **Decision rule:** a repaired value must
   resolve under both, or the gate and the checker will disagree forever.

8. **Install the two anti-vacuity rails before shipping the gate** — a resolution gate is one bad population
   away from deleting the surface it protects:
   - **Empty population** → gate fully disabled, output byte-identical to pre-gate, loud `stderr` note.
     `generate-llms.js`'s `fetchYieldsSafe()` fails SAFE to `[]`, so a 10s DefiLlama timeout would otherwise
     strip every link on the surface. This is the highest-consequence line in the whole item.
   - **Structural tripwire** → if the gate would affect more than a large fraction of checked links (180 used
     40%; today's real figure is ~12%), emit unchanged, print loudly, set a non-zero `process.exitCode`.
     A simulation bug must fail noisily, never quietly shrink the surface.

9. **Prove the delta, don't read it off `git diff`.** Follow `seo-surface-regen-delta.md`: diff the sorted
   URL **sets** old vs new and account for every entry. Expect ordinary daily churn (top-15 pool rows, TVL
   figures) alongside your intended class; an unexplained removal is a FAIL, not noise.

10. **Re-measure with a script that is not the one you shipped.** The gate's own helper reporting zero dead
    links is marking your own homework. Independent live re-measure, plus a non-vacuity run against the
    pre-fix files (`git show HEAD:llms.txt`) showing the new assertion RED and quoting a real dead link.

## Resolution

Zero dead links on the surface, every removal named and justified, the repair re-decided on every daily bake
(so the class cannot return by data drift the way item 181's did), and the checker that found it left
non-vacuous — flip its pinned known-defect assertion to a **true negative** and keep the frozen positive-control
excerpt byte-untouched (`test_audit_text_surfaces.js:302`/`:325`). Never delete the pin.

## Traps

- **Copying 173's fix without step 3.** The two items look identical and have opposite repairs. Under-flooring
  a link on a surface whose floor already matches the app's is a no-op that *looks* like a fix and leaves the
  defect live.
- **Fixing the floor when the section is mis-targeted** (step 4). You end up with an honest link to a
  second-class destination while the right page sits three sections down in the same file.
- **Judging liveness against one population** (step 7). Live feed and committed snapshot disagree at the
  margin, and the checker uses the snapshot.
- **A gate with no empty-population rail** (step 8). `fetchYieldsSafe` returning `[]` is a *success* path in
  this repo, not an exception.
- **Counting a per-file total** (step 2) and concluding "the surface is broken" when one branch of one
  generator is.
- **Omitting URLs without checking the page generator's own quality gate** (step 5). If the entity has real
  pools and just lacks a page, omission hides a page you should be minting instead.

## Provenance

- Item 173 (2026-07-29) — 1,749 dead HTML CTAs, the under-floor repair; `specs/173.md`.
- Item 175 (2026-07-29) — the level-3 signal that finds this class; `specs/175.md` T1/T2/T4/T6.
- Item 180 (2026-07-30) — 63 dead llms links, the retarget/omit/ladder repair and the two rails;
  `specs/180.md`, `specs/180-notes.md` (deviation 1 = the dual-population finding in step 7).
- Item 181 (open) — the drift-lifecycle question this playbook's step-8 gate is designed to answer for
  generated links: repair at emit time, on every bake, not once at mint time.
- Sibling playbooks: `seo-surface-regen-delta.md` (step 9), `detector-signal-coverage.md` (how the signal that
  finds this class gets built), `stated-threshold-copy.md` (why a floor may not be re-typed).
