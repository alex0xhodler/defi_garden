# headline-figure-provenance — playbook

**When:** a surface states a **headline figure** — "the highest yield is X", "up to X% APY", a #1 pick, a
"best rate" — and names an entity beside it (protocol, chain, pool, token). Run this the moment you touch
any `Math.max(...)` / `sort(...)[0]` / "best" selection that reaches copy, structured data, a meta
description, a share card or an API response. Sibling of `derived-number-rails.md` (that one asks *is the
number computed correctly*); this one asks *may this number be RECOMMENDED, and does the name beside it
belong to it*.

**Answer in one line:** a headline is a **claim about one record**, so it has exactly two failure modes and
both are usually present at once — the figure is selected by extremity (`Math.max` picks the least
representative row by construction) and the **name beside it comes from a different record** than the figure.

## The recurring shape

| Item | Surface | Figure selected by | Name beside it came from | Measured |
|------|---------|--------------------|--------------------------|----------|
| 229 | spotlight ranker | `sort by poolTotalApy desc` | (same pool — no split) | 36/405 candidates (8.9%) >50% off their own `apyMean30d`; #1 pick 86.51% vs a 4.51% mean |
| 242 | `/tokens/<slug>` HTML + md twin | `Math.max(...rec.pools.map(poolTotalApy))` | `rec.pools[0]` — the **TVL-largest** pool | 103/2,102 pages (4.9%) headlined an unrepresentative rate; **421/2,102 (20.0%)** named a protocol that does not pay the stated rate |
| 243 (open) | `/chains/<slug>` HTML + md twin | identical `Math.max` | identical `rec.pools[0]` | untouched, same two call-site shape |

## Steps

1. **Find the selection.** Grep the surface's generator/renderer for `Math.max(`, `.sort(`, `[0]`,
   `best`, `top`, `highest`. Record the file:line of the line that produces the FIGURE.
2. **Find the name.** Separately, find where the entity rendered next to that figure comes from. In this
   repo the tell is a second variable: `generate-token-pages.js` had `bestApy` (max APY) and `top`
   (`rec.pools[0]`, TVL-largest) passed into the SAME `buildAnswerAndFaq(label, rec, bestApy, top, lang)`.
   **Decision rule:** if the figure and the name are read from two different expressions, assume they are
   two different records until you have counted otherwise — do not eyeball one page and conclude.
3. **Count the split, don't estimate it.** Derive the real population at test time (`rankTopTokens(pools, 0)`
   against a live fetch — the estate churns daily), and count the pages where
   `argmax(figure) !== the record supplying the name`. 242's count was 421 of 2,102; the defect was invisible
   on the pages someone had happened to look at.
4. **Check the figure against its own series.** Reuse `isRepresentativeRate` / `representativenessRatio`
   (`generate-token-pages.js`, moved there in 242 — **import them, never re-type the 0.5 constants**). Count
   how many records the gate demotes and how many surfaces have NO representative record at all.
5. **Decision rule on the fallback.** If a surface has no representative record, pick the honest smallest
   option and *say which*: (a) keep the unchecked figure but attribute it correctly — the claim "the highest
   is X on P" stays true as written and no page loses its headline (242's choice, 481 pages / 22.9%); or
   (b) suppress the headline — needs new copy in EN **and** KO, so it is a bigger item, not a drive-by.

## Resolution

- Derive the figure **and** the name from ONE selector (`headlinePoolFor(pools)` is the token-page instance):
  return the record, then read both the number and its attributes off it. One call per render path.
- Call it identically in **every twin** — HTML page and its `.md` twin are separate functions in this repo
  (`renderTokenPage` / `renderTokenPageMarkdown`); a fix in one is a drift bug in the other.
- Test the **invariant over the derived population**, not the instance: for every record, the rendered
  figure equals the selector's figure, and the rendered name is that same record's. The pool that motivated
  the item is the positive control, never the definition.
- State the residual with a number and a ticket id. 242 closed token pages and left chain pages + the grid
  open → item 243.

## Traps

- **`Math.max` is not a neutral pick.** It selects for extremity, which correlates with unrepresentativeness
  — the failure rate among headline rows is far above the base rate (242: 25.0% of displayed pools fail the
  gate, but they are over-represented among the pre-fix headlines).
- **The intro line is usually innocent.** `tcpTokenIntro` describes `rec.pools[0]` with *its own* APY and is
  correct; only the ANSWER block mixed sources. Do not "fix" the correct one — check each sentence's own
  provenance.
- **The predicate may live behind an uninstallable dependency.** `generate-spotlight.js` hard-requires
  `@napi-rs/canvas` and already requires `generate-token-pages.js`, so importing the gate FROM spotlight is
  both a cycle and a dependency trap. Move the predicate to the module that owns its only dependency
  (`poolTotalApy`) and re-export from the old home — every existing importer keeps working, identity-testable
  in both directions.
- **A green pre-commit test run proves nothing about generated estates.** Re-measure against a fresh live
  fetch; the spec's numbers and the build's numbers will differ by a few pages and that is expected, not a
  discrepancy to reconcile.
- **Meta descriptions and JSON-LD are headline surfaces too.** `tcpTokenDescription`, the FAQ ld+json and the
  Dataset/ItemList blocks all consume the same `bestApy`; fixing only the visible paragraph leaves the
  machine-readable copy wrong — which is the copy agents actually read.

## Provenance

Distilled from item **242** (2026-08-06, verifier PASS/HIGH 8/8) and its parent item **229**
(2026-08-06, the ranker that first proved the representativeness predicate and honestly recorded the class
as open at 1 of 4 ranked surfaces). Specs: `specs/242.md`, `specs/242-notes.md`, `specs/229.md`.
Cross-links: `derived-number-rails.md` (is the number right at all), `stated-threshold-copy.md` (a sentence
that re-types a constant), `guard-exemption-rate.md` (measure a gate's exemption rate before shipping it).
