# UX audit #2 — the three app screens' chrome (human directive, live session 2026-08-06)

**Trigger (human, reviewing the #393 preview they are about to merge):** "there's some quick wins here,
re using the same logo bars, same width of content, etc, which are all over the place currently between
the search, search results, and pool view views, c'mon it's only 3 screens! just do the ux audit and
backlog the top p0 and low hanging fruit changes."
**Evidence:** the human's four preview screenshots (card view dark, list light, search state light,
pool detail light→dark), branch tip ~`88ecb7bfaa`.

## Findings — three screens, three different chromes

**C1 — THREE header layouts for three sibling screens (P0).**
- Grid (list+card): wordmark LEFT + search bar CENTER + KO/theme RIGHT, in a header band.
- Search state: NO header band at all — giant centered logo + tagline mid-page, KO/theme floating
  top-right unanchored.
- Pool detail: wordmark LEFT + KO/theme RIGHT in a band — but NO search access anywhere.
One product, three chrome layouts, visible within two clicks. → item **236** (re-scoped, 9.5).

**C2 — THREE content widths (P0, same item).** Grid container renders ~1540px wide; pool detail
~1040px; search state ~750px. No shared max-width token — each screen picked its own. Navigating
grid → pool visibly "jumps" width. → folded into **236** as an explicit acceptance criterion.

**C3 — Pool detail still renders a SECOND full-strength CTA pair (P1).** The calculator block closes
with a full blue "Garden this pool → ~$1,125 in 5y" + bordered "Start Earning on ether.fi-stake" —
visually identical weight to the hero pair, in the human's own dark screenshot. Round 3c's notes claim
a "slim echo"; the render says otherwise. Item **237**'s one-primary-per-page contract is unmet ON THE
RENDER (its DOM count may pass if classes differ — the acceptance must be visual weight, not class
name). → **237** evidence refreshed.

**C4 — Card-view cell wrap inconsistency (low-hanging).** "$0.06/day" wraps to two lines on some cards
(WBETH, USDY) and stays one line on others in BOTH themes — the per-day cell has no nowrap/min-width.
Also: the last card row orphans (1 card alone), and pool-detail's "Underlying Assets" chip still
renders mono-caps ("WEETH ↗") — a 238-class remnant on the composed page. → new item **246** (LOW batch).

## Not re-ticketed (already owned)
Card view's existence question (round-3c recommendation, human's call) · 238 terminal-skin sweep
(the underlying-assets chip added to 246 as an on-page instance; 238 keeps the class) · 239/others
unchanged.

## Sequencing
Human merges #393 → 236 (one chrome, 9.5) is the single highest-visibility fix and touches all three
screens at once — exactly the "quick win" named; 246 rides as the LOW batch; 237's echo demotion is a
small PoolDetail change. All build on main post-merge.
