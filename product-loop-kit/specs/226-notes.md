# 226 — implementation notes

Built 2026-08-05, branch `claude/loop-226`. Operator: Opus 5 (planning, territory pass, measurement,
verification). Product code: dispatched Sonnet 5 coding agent (execution-model split, 2026-07-13).

## The controlled measurement (this, not `git diff`, is the effect)

Per `playbooks/seo-surface-regen-delta.md`: ONE shared fixture, baseline regenerated in an isolated
worktree on `origin/main`, new tree regenerated from the same fixture, effect read off the two `<loc>`
sets (XML entity extraction, never `grep -c` on lines).

- Fixture: live DefiLlama pull (15,687 pools) → `generate-pools-snapshot.js --seo-out` → 15,625 pools
  ≥ $1,000 TVL (the CI-shaped raw transient, NOT `data/pools-snapshot.json` — playbook step 1).
- Baseline (`origin/main` @ `979af4f2a1`, worktree): **4,851** sitemap `<loc>`.
- New tree: **329** sitemap `<loc>`.
- **ADDED: 0.** DROPPED: 4,522, every one inside the intended class:

| dropped class | count |
|---|---|
| app-view `?token=` / `?poolTypes=` | 337 |
| app-view `?chain=<chain>` | 101 |
| tail static `/tokens/<slug>` (en+ko) | 3,966 |
| tail static `/chains/<slug>` (en+ko) | 118 |
| **OTHER / unexplained** | **0** |

A tree-vs-HEAD count difference is NOT this measurement and will not match it — stated explicitly per the
playbook's Resolution step.

## Head composition (329)

| child sitemap | URLs |
|---|---|
| `sitemap-main.xml` | 11 (home, plan.html, 3 stories, item-188 `?chain=All…` rungs) |
| `sitemap-token-pages.xml` | 130 = 102 head tokens + 28 hub/A–Z |
| `sitemap-token-pages-ko.xml` | 130 |
| `sitemap-chain-pages.xml` | 29 = 28 head chains + 1 hub |
| `sitemap-chain-pages-ko.xml` | 29 |

`sitemap.xml` (the index) now lists exactly these 5 children, down from 114. 108 app-view child files
were removed from disk by the pre-existing `cleanupStaleSitemaps()` (080) — an ARTIFACT deletion; no page
was deleted.

Greediness check (playbook decision rule: "a real, recognisable name in dropped → your rule is too
greedy"): all 12 spot-checked majors are IN the head — usdc, usdt, eth, weth, wbtc, dai, sol, usde,
steth, wsteth, susds, cbbtc. Head chains include ethereum, base, arbitrum, solana, polygon, bsc,
avalanche, sui, tron, hyperliquid-l1 (28 total).

**Boundary, stated rather than implied away** (verifier finding, attempt 1 — 12 hand-picked passes do
not prove "not greedy"): the cut DOES drop recognisable names. Token **SKY** (~$973M aggregate TVL but
only **1** pool clearing $10M — it is this item's own test's tail example) and chains **Aptos**
(~$849M), **Bitcoin**, **Linea**, **TON** all fall out on the same one-railed-pool shortfall. That is an
inherited, accepted cost of reusing item 013's existing threshold rather than inventing a new one: the
gate asks "does this entity have ≥2 pools a cautious saver could actually use", and a $973M token
concentrated in a single qualifying pool genuinely answers no. It is a real cost, not a non-cost, and
it is the first thing to revisit if the human's GSC read says the head is too thin.

Symmetry gate (playbook Resolution): every one of the 130+29 head `<loc>` has a real file in the
committed estate — 0 orphans, 0 dangling.

## Nothing was de-listed that stopped being served

- 1,992 token pages left the sitemaps. Spot-checked 5 of them (`0x0`, `1212-alpha`, `1212-stable`,
  `13w`, `1cat`): `.html` present, `.md` twin present, and present in the llms surface.
  **CORRECTION (attempt 2, after verifier FAIL — this claim was false as originally written.)** The
  llms check above read the *committed* `llms.txt`, which nobody had regenerated since `sitemap.xml`
  shrank, so it proved nothing about what the code produces. `generate-llms.js` derives its entire URL
  population by parsing `sitemap.xml` and its children — the identical audience-inversion trap that was
  caught and fixed for `indexnow-ping.js`, sitting one file over and missed. The verifier measured it:
  the generator emits 4,851 URLs / 201KB `llms-full.txt` against the pre-226 sitemap and **329 URLs /
  21KB** against the post-226 one, and CI runs `generate-sitemap.js` → `generate-llms.js` back-to-back
  on a daily 2 AM UTC cron (`sitemap-update.yml:111-124`). The next real CI run would have collapsed the
  AGENT surface to Google's head — outside Q3b (which scopes de-listing to Google's sitemap view and
  requires agents keep everything), a NEVER-list hit, and a direct hit on the north star's own leg (A).
  Fixed in attempt 2 by deriving the llms population from the served estate on disk via the same
  `collectEstateUrls()` `indexnow-ping.js` uses — one implementation, not two — with
  `test_llms_full_estate.js` asserting strict-superset-of-head plus its own non-vacuity mutant.

  **The llms surface does change, and here is the honest number.** Population goes **4,851 → 4,431**.
  The ~420 that leave are the app-view filter URLs (`?token=`, `?chain=<chain>`, `?poolTypes=`) — which
  were only ever in llms.txt because llms.txt was sitemap-derived. This is a quality improvement, not a
  loss: those URLs serve a client-rendered JS shell, so an agent that fetches one gets nothing, while
  the static `/tokens/<slug>` page and its `.md` twin — the artifacts agents actually consume — are
  retained in **full**, all 4,413 of them including every de-listed tail page. `llms.txt` and
  `llms-full.txt` were regenerated in this commit rather than left stale, so the shipped state is the
  state CI would produce; `test_llms_link_integrity.js` (57/57) now validates against the real new file
  instead of a pre-226 leftover.
- `robots.txt`: byte-unchanged (spec §4 — sitemaps-only lever first, measure before escalating).
- IndexNow: its default submission list no longer derives from `sitemap-token-pages.xml` (which would
  have silently shrunk Bing/Yandex to the head — the exact inversion of Q3b). It now scans the served
  estate on disk (`tokens/`, `ko/tokens/`, `tokens/az/`, `ko/tokens/az/`, `chains/`, `ko/chains/`), so
  Bing-family submission is a strict SUPERSET of Google's head and cannot drift from what is served.
  `test_indexnow_full_estate.js` asserts exactly that, including that a count-1 tail token is in it.

## Deviations from the spec / brief

1. **The spec's AC said "~2,2xx → 300-500". The real baseline is 4,851, not ~2,2xx** (the AC counted the
   token-pages sitemap alone; there are five families). The 300-500 target was kept as written and hit at
   329; the notes record the true denominator so no later reader inherits the wrong number.
2. **The head predicate lives in `generate-sitemap.js`, not a new `head-selection.js`** — a new module
   would need the rails from `generate-sitemap.js` while `generate-sitemap.js` needs the predicate back,
   a require cycle on a file that already does require-time extraction from `PoolDetail.js`. It sits
   beside the rails it reuses and is exported from there. Spec AC ("exported + tested as the single
   source") is met; only the file it lives in differs.
3. **`HEAD_MIN_RAILED_POOLS = SITEMAP_MIN_QUALIFYING_POOLS`, not a fresh `2`.** The item invents no new
   quality threshold: it applies the ≥2-railed-pools gate item 013 has always applied to app-view URLs to
   the static-page sitemaps as well. Tied by reference so the two can never drift.
4. **Whole app-view families suppressed rather than head-filtered.** Keeping any of them at head size
   blows the 500 ceiling (329 + 438 = 767, measured by the mutant test) and re-submits the class most
   likely behind GSC's Soft-404 3,246 — they are client-rendered filter views, and item 188 already
   proved a filter-only query renders the empty search hero rather than a grid. Suppression is one
   constant (`EMIT_APP_VIEW_SITEMAPS = false`) with the building code intact, so the spec's documented
   revert ("re-adding sitemap URLs is cheap and non-destructive") is a one-line flip.
5. **Reverted the builder's `.github/workflows/sitemap-update.yml` edit.** My territory note #2 claimed CI
   never stages `sitemap-main.xml`; the builder checked and found `git add -A -- 'sitemap*.xml'` on the
   very next line already stages it *and* the 108 deletions. It reported the contradiction instead of
   implementing the brief blindly. The edit was redundant, `.github/workflows/` is HIGH-risk config, so
   the file is untouched. Spec territory note #2 is struck through and corrected in place.
6. **OG-image stub in the three new tests** (not in the brief). `generate-token-pages.js`'s `main()`
   renders one PNG per token via `@napi-rs/canvas` — ~3-4 min for the 2,085-token population, past the
   plain lane's 120s timeout. The tests preload a require-cache stub that no-ops `generateOgImages`,
   written to scratch and deleted after each run. No shipped generator behavior changed.
7. **The new tests fetch live DefiLlama data** rather than hardcoding this session's scratch fixture —
   the house pattern (`test_sitemap_category_urls.js` A5, `test_sitemap_filter_urls.js`) and a
   requirement for them to work in CI and other clones. The [300, 500] bound has 171 URLs of headroom
   above the measured 329 for daily churn.
8. **`test_vercelignore.js` `MUST_KEEP` and its `sitemapFiles.length` floor were updated** (named files
   that no longer regenerate; `>= 100` → `>= 5`). Not weakening an assertion to go green — the old
   numbers encoded the pre-226 sitemap contract and would have broken on the first real CI regen
   regardless. Commented in place naming this item.

## Class honesty (spec's "Instance of" / "Class closed")

Population: all ~4,400 generated leaf pages × their sitemap entries — one artifact set serving two
consumers (Google, which declines scale, and agents, which want everything).

- **Closed:** the sitemap contract. There is now exactly ONE head predicate, machine-tested against the
  live generation set, and both static-page generators read it; a new generated surface that wanted a
  different rule would have to call the same predicate or be caught by the count bound.
- **Open, deliberately, with the number:** head-page DEPTH. The 102 head token pages and 28 head chain
  pages are the *same* pages they were yesterday — a table, an answer block, an FAQ. Curating the
  sitemap concentrates crawl on them; it does not make them worth ranking. That is follow-up work and it
  is not done here. **130 head pages need depth; 0 have received it.** No ticket id exists yet — the
  spec calls it "follow-up items" without filing them, so the honest statement is that the depth class is
  open and unticketed as of this ship.
- **Also open:** whether Google responds at all. The spec itself rates leg (a) of its hypothesis a
  *guess* — Google may keep declining a no-authority domain no matter how small the sitemap. Nothing in
  this item can settle that; only the human's GSC read can.

## What this item did NOT prove

- It did **not** eliminate GSC's 3,246 Soft 404s. The generated-page scan found **0** pages with an empty
  main table (`test_soft404_empty_pages.js`, whole-estate scan), which means the soft-404 predicate is now
  machine-enforced but was already structurally satisfied by `rankTopTokens`/`rankTopChains`. GSC's
  soft-404 population is not readable from inside the loop. The leading hypothesis — the de-listed
  client-rendered filter views — is a hypothesis, and is labelled as one everywhere it appears.
- The 4,522 de-listed URLs remain live and self-canonical. Whether Google keeps or drops them from its
  index is Google's call, not this change's.
