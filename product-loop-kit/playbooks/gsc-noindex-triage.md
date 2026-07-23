# gsc-noindex-triage — playbook

**When:** Google Search Console reports "Excluded by 'noindex' tag" (or the human forwards that email), and
you need to decide: is our intentional noindex working as designed, or is it a regression noindexing real
pages?

**Answer in one line:** almost always the INTENTIONAL empty-state / dead-`?pool=` noindex working as
designed (items 012/072) — confirm the flagged URLs are empty/dead before touching anything.

## Steps
1. **Audit where noindex is emitted** (the loop CAN do this now, no connector):
   `grep -rn "noindex" --include=*.js --include=*.html .` — the ONLY runtime source is
   `app.js` (~:2341-2361) client-injecting `robots=noindex` when `emptyStateResolved` OR `deadPoolResolved`
   (both guarded by `pools.length > 0`). `home.html`, `plan.html`, and the token/chain generators all ship
   `index,follow`. Confirm this is still true (a generator regression would show up here).
2. **Get the flagged URLs** — needs the human (no GSC connector; item 026 parked). Ask for 3-5 example URLs
   + the affected-page count from the report.
3. **Classify each URL:**
   - Empty `?token=X`/`?chain=Y` (no qualifying pools) or dead `?pool=<id>` → **INTENTIONAL** (012/072). This
     is the honest fix draining the soft-404/thin class (item 010). "Excluded by noindex" is the intended
     outcome. No action; close as working-as-designed.
   - Static `/tokens/<slug>`, `/chains/<slug>`, planner `/`, `/plan.html`, or a query that DOES return pools
     → **REGRESSION.** Fix. Top suspect: the SPA render race under the 059 snapshot-first load (does a valid
     query ever leave `pools.length>0` while `filteredPools` is transiently 0?). Re-verify the guard.

## Resolution
- Intentional → one line to the human confirming it's the 012/072 fix, not a leak; close.
- Regression → scoped fix sub-item (HIGH — sacred SEO surface; a wrong change de-indexes real pages OR
  re-exposes the thin/soft-404 pages 010-013 fixed).

## Traps
- Don't "fix" it before the URLs classify it — the noindex surface is load-bearing; changing it on a guess
  either de-indexes real content or undoes the honest empty-state fix.
- A future guard against this whole class: a test asserting every generated page ships `index,follow` and
  the SPA noindex only fires on empty/dead — makes a silent regression impossible (candidate build item).

**Provenance:** item 118 (specs/118.md); items 010 (soft-404 diagnosis), 012 (empty-state noindex), 072
(dead-pool noindex).
