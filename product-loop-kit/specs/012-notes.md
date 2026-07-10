# 012 notes — honest empty states (executed 2026-07-10)

## Verdict
The empty state spec 012 targets is a single JSX ternary in `app.js`'s results section
(`filteredPools.length > 0 ? [...] : <empty-state div>`), reached whenever `selectedToken` or
(`chainMode && selectedChain`) is truthy. All three filter branches (token mode, chain-first mode,
special "All"/"Popular" chain categories) funnel into this one ternary via the shared
`filteredPools` state, so a single change point covers every parameterized-query shape named in
the spec except `pool=` (see "Deliberately out of scope" below).

The most consequential finding wasn't in the spec text: **this ternary already renders the bare
"No yields found" empty state during the pre-fetch window, for every query, including valid ones**
— `pools` starts as `[]` (app.js:696) and the fetch (app.js:923-951) is async with no loading gate
("Always render UI immediately — no blocking loading state", the pre-existing comment at old
line ~2170). For the first render(s) of literally any token/chain URL, `filteredPools` is
trivially `[]`, so a crawler with a short render budget can see "No yields found for USDC" for a
perfectly live token. This is exactly the second Soft-404 mechanism named in
`specs/010-diagnosis.md` ("API fetch not completing in render budget → 'no pools' DOM"), and it
meant the new, stronger content block (a specific claim about the $10M floor, plus alternatives)
could not simply gate on `filteredPools.length === 0` — doing so would make the honest sentence
dishonest during that flash, and would flap noindex on and off within the same load. Both the new
copy and the noindex toggle gate on `pools.length > 0` (fetch actually resolved), not just on
`filteredPools.length === 0`. This also means the *old* bare message can still show during that
transient flash — deliberately unchanged, see "Deliberately out of scope" below.

## Territory findings (file:line)

### The empty state and its trigger
- Results section only renders when `(selectedToken || (chainMode && selectedChain))` (app.js,
  results-section conditional). All three filter branches that populate `filteredPools` — "All"/
  "Popular" chain categories, chain-first mode, token mode (originally ~1495-1685, unmoved by this
  change except for the new block inserted after `isAnomalousApy`) — write into the same
  `filteredPools` state, so the empty-state ternary is the single downstream choke point.
- The empty state itself: `] : React.createElement('div', { className: 'empty-state' }, ...)` at
  app.js:2714, inside the `filteredPools.length > 0 ? [...] : ...` ternary. Pre-existing content
  (`noYieldsFound`/`noYieldsFoundChain` + `adjustFilters`/`adjustFiltersChain` + reset buttons) is
  untouched; the honest sentence and alternatives are new siblings inserted between the existing
  submessage and the reset buttons (app.js:2720-2739).

### `pool=` deep links don't reach this ternary at all
`?pool=<id>` is handled by a wholly separate effect (pools-loaded → find by id → `setDetailPool`/
`setCurrentView('pool-detail')`). If the id isn't found, that effect is a no-op: `currentView`
stays `'search'`, `selectedToken`/`selectedChain` are never set by this path, so
`(selectedToken || (chainMode && selectedChain))` is false and the **entire results section,
including the empty state, never renders** — the user silently sees the generic homepage. This is
pre-existing, unrelated to my change (I neither touch nor rely on this path), and I left it alone
— see "Deliberately out of scope."

### `chainMode` is not required for `selectedChain` to be set
Token-mode-with-a-chain-sub-filter (`?token=FAKE&chain=Base`) sets `selectedChain='Base'` via an
unconditional line outside the mode if/else (`if (urlParams.chain) setSelectedChain(urlParams.chain)`
in the initial-load effect) while `chainMode` stays `false`. Confirmed by reading the effect
directly rather than assuming — this is why `getEmptyStateAlternatives` takes `selectedChain`
regardless of `chainMode`; same-chain alternatives work correctly for this combined case too.

### app.js's `t()` is a flat lookup, NOT `planner`-namespaced
`createTranslationFunction` (translations.js) returns `translations[language][key]` — a direct
top-level property lookup. The `planner: {...}` sub-object exists only for planner.js's own
(different) translation path; app.js keys must be flat top-level properties of `en`/`ko`, not
nested under `planner`. Confirmed by reading `createTranslationFunction`'s body before adding any
key — the dispatch instructions flagged this as something to verify rather than assume, and it
would have been a silent, hard-to-notice bug (keys would fall back to returning the raw key
string) had I guessed wrong.

### No `pool.stablecoin` API field is used anywhere in this codebase
Grepped the full repo (app.js, PoolDetail.js, planner.js, generate-sitemap.js): zero hits for a
`.stablecoin` property. The established "is this a stablecoin pool" logic already exists — in
`planner.js:25-27` (`STABLE_SYMBOLS`, 28-ticker allowlist) and `planner.js:66-70`
(`isStableSymbol`, splits the pool symbol on separators and requires every leg to be in the
allowlist) — used for the planner's "Established Stablecoins" persona. There is no build step or
module system linking `app.js` and `planner.js` (each browser `<script>` is self-contained; e.g.
`formatUsd`/`formatNum`/`formatApy` are already independently redefined in both files), so I
duplicated the exact same list and function into `app.js` (app.js:694-706) rather than inventing a
new classification or reaching for an unverified API field.

## Change made

### 1. `app.js:694-706` — `STABLE_SYMBOLS` + `isStableSymbol`
Top-level (outside `App()`, alongside `getPoolType`), byte-identical logic to
`planner.js:25-27/66-70`. Pure function of a symbol string; no component state.

### 2. `app.js:1947-2003` — the empty-state engine, inserted right after `isAnomalousApy`
- `emptyStateResolved` (app.js:1960-1961): `currentView !== 'pool-detail' && pools.length > 0 &&
  filteredPools.length === 0 && !!(selectedToken || (chainMode && selectedChain))`. This is the
  single source of truth for both the noindex toggle and the new content block, so the two can
  never disagree.
- `getEmptyStateAlternatives(targetChain)` (app.js:1969-1975): same-chain top-TVL pools first
  (excluding the `'All'`/`'Popular'` pseudo-chain values); if that's empty (or there's no real
  target chain), falls back to top-TVL stablecoin pools across all chains. Every candidate must
  pass `pool.tvlUsd >= DEFAULT_MIN_TVL && !isAnomalousApy(pool)` — the fixed $10M floor (not the
  user's own, possibly-relaxed, `minTvl`) and the existing anomaly check, reusing `isAnomalousApy`
  rather than re-deriving it. Returns `{ items, source: 'chain'|'stable' }` so the render code
  never has to infer which strategy fired.
- `emptyAlternatives` (app.js:1982-1985): `useMemo` wrapping the above, gated on
  `emptyStateResolved` so the filter/sort over the full `pools` array only runs when the state is
  actually reachable, not on every unrelated re-render (dropdown opens, theme toggle, etc.).
- Noindex toggle (app.js:1993-2002): see next section.

### 3. `app.js:2254-2310` — `renderPoolCard(pool, key, position, delayBase)`
Extracted verbatim from the main grid's inline card JSX (no visual/behavioral change to the main
grid) so the alternatives block renders pools through the exact same component — same anomaly
flag/⚠, same click-through to `PoolDetail` via `handlePoolClick`, same Calculate-Yield CTA.
`position` forwards straight into `handlePoolClick`'s pre-existing `position = -1` "not part of a
paginated list" default (I pass `-1` explicitly for alternatives); `delayBase` reproduces the
original animation stagger (`index * 50`, then `+100/+150/+200` inside the function — numerically
identical to the pre-existing `100 + index * 50` etc.). The grid's own `.map()` (app.js:2685-2689)
now just calls this function.

### 4. `app.js:2720-2739` — the new content block inside the empty state
Honest sentence (`emptyStateExplanation`/`emptyStateExplanationChain`, gated on
`emptyStateResolved`) using the same token-vs-chain conditional the pre-existing messages already
use, then the alternatives block (gated on `emptyStateResolved && emptyAlternatives.items.length >
0`): a heading (`emptyStateAltHeadingChain`/`emptyStateAltHeadingStable`, picked from
`emptyAlternatives.source`, not re-derived) over a `.pools-grid` of up to 5 `renderPoolCard` calls.

### 5. `translations.js:65-68` (EN) / `551-554` (KO) — four new flat keys
Anchored immediately after `loadingError`, inside the existing "Empty states and errors" comment
block, before "Navigation" — same anchor-rule convention prior items used. Verified: EN and KO
both have exactly 73 flat (non-`planner`) keys after this change (equal before too — net add of 4
to each, confirmed by source-level key scan, not just `Object.keys` which would hide a literal
duplicate silently overwritten by the JS parser).

### 6. `style.css:2385-2393` — 8 lines, token-only
```css
.empty-state-alternatives {
  margin-top: var(--space-24);
}

.empty-state-alternatives .pools-grid {
  text-align: left;
  margin-top: var(--space-16);
}
```
Necessary, not decorative: `.empty-state` sets `text-align: center` (style.css:2337-2347), and
`.pool-symbol`/`.pool-header-new`/`.pool-context-inline` have no explicit `text-align` of their
own (confirmed by grep) — they rely on the ambient default, which is left (neither `html` nor
`body` sets `text-align` anywhere in the file). The main grid has never been nested inside a
centered ancestor before, so this never mattered until alternatives cards render inside
`.empty-state`. Without this rule, every alternative card's internal text (symbol, protocol, APY,
TVL labels) would render center-aligned, visually broken relative to the identical cards in the
normal grid.

## Noindex toggle design
`app.js:1993-2002`, inside the same `emptyStateResolved`-keyed `useEffect`:
```js
useEffect(() => {
  let robotsMeta = document.querySelector('meta[name="robots"]');
  if (emptyStateResolved) {
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.setAttribute('name', 'robots');
      document.head.appendChild(robotsMeta);
    }
    if (robotsMeta.getAttribute('content') !== 'noindex') {
      robotsMeta.setAttribute('content', 'noindex');
    }
  } else if (robotsMeta && robotsMeta.getAttribute('content') === 'noindex') {
    robotsMeta.setAttribute('content', 'index, follow');
  }
}, [emptyStateResolved]);
```
Design decisions, in order of how surprising they'd be to a reviewer:
1. **Flips the existing tag's `content`, never adds a second `<meta name="robots">`.** `home.html:14`
   already ships `<meta name="robots" content="index, follow">` unconditionally, and spec 011's
   own scope explicitly excludes "robots meta (that's 012)" — so this tag is mine to own at
   runtime and 011's parallel work won't touch it. `document.querySelector` always resolves to
   that SAME node; `appendChild` only fires if the node is somehow absent, so there is
   structurally never more than one `meta[name="robots"]` — satisfies "no duplicates ever" by
   construction, not by a dedupe check after the fact.
2. **Restores `"index, follow"`, doesn't just delete the tag**, when the condition clears — an
   absent tag and an `"index, follow"` tag are equivalent to a crawler, but matching the value
   `home.html` already ships avoids leaving the page's robots directive in a different shape than
   every other page purely as a side effect of having once been empty.
3. **`currentView !== 'pool-detail'` is folded into `emptyStateResolved` itself** (app.js:1960),
   not left as a gap. Caught this by tracing what happens after the feature seemed done: the main
   filter effect intentionally skips recomputing `filteredPools` while `currentView ===
   'pool-detail'` (pre-existing guard, unrelated to this change) — so without this term, a user
   who reaches a genuine dead-token empty state and then clicks into one of *this feature's own*
   alternative pools would carry the stale "empty" signal into that pool's now-visible,
   perfectly-real detail page and leave it incorrectly noindexed. Verified the fix with a
   synthetic-DOM Node simulation (5 scenarios: normal page untouched, empty→noindex, repeated-true
   idempotent, empty→non-empty restores "index, follow", and a missing-tag create-then-restore
   path) — see Verification.
4. Effect dependency is `[emptyStateResolved]`, a derived boolean, not the raw inputs
   (`pools`/`filteredPools`/`selectedToken`/`chainMode`/`selectedChain`/`currentView`) that feed
   it. This is intentional, not an oversight: `emptyStateResolved` is recomputed fresh every
   render from those inputs, so depending on the derived value re-runs the effect exactly when the
   boolean actually flips — the same pattern `emptyAlternatives`'s `useMemo` deps use.

## How alternatives are sourced
Covered in "Change made" #2 above; summary: `pools` (full in-memory API response, no new fetch) →
filter to `tvlUsd >= DEFAULT_MIN_TVL && !isAnomalousApy(pool)` → same-chain subset sorted by TVL
desc, else stablecoin subset (via the duplicated `isStableSymbol`) sorted by TVL desc → top 5.
Verified against synthetic pool data (sub-floor pool excluded, anomalous-but-huge-TVL pool
excluded, non-stablecoin-but-huge-TVL pool excluded from the stable fallback, same-chain preferred
over stable when both exist, `'All'`/`'Popular'`/empty chain all correctly skip straight to the
stable fallback) — see Verification.

## Deviations from spec
- **`style.css` touched.** `specs/012.md`'s acceptance criteria literally says "no changes outside
  app.js/translations.js"; the dispatch instructions for this run explicitly widen that to "app.js
  + translations.js (+ pool-detail-styles.css/style.css only if a small style hook is
  unavoidable)". I judged the `text-align` fix above unavoidable (a real, visible layout bug on
  every alternatives render, not a nice-to-have) and used the wider, more specific grant. 8 lines,
  tokens only, one new class pair.
- **`pool=` dead-link case left alone, not extended to.** Spec 012's own param list names
  `token/chain/pool/poolTypes/protocols`, and a dead `?pool=<id>` is structurally a soft-404-shaped
  gap (see Territory findings), but building a *new* render path and a *new* noindex trigger point
  for a state the app doesn't currently visualize at all would mean inventing UI the spec didn't
  ask for and drifting into "router semantics," which spec 012 explicitly places out of scope
  (011 also excludes it, for symmetry). Left exactly as-is — flagging it here rather than silently
  leaving it, per this repo's own convention (007-notes.md did the same for a gap it found and
  chose not to fix). Candidate for a future backlog item if the human wants it covered.
- **`poolTypes`/`protocols`-only queries (no token/chain) don't reach the empty state either**, for
  the same structural reason: the results section's render condition never included them alone,
  pre-dating this change. Confirmed, not touched — consistent with "OUT of scope: router
  semantics."
- **Alternatives always render as a card grid (`pools-grid`), independent of the user's
  grid/list `viewMode` toggle.** Deliberate: the alternatives are a small, fixed-size (≤5) "you
  might also look at these" block, structurally different from a paginated result list; a grid
  reads more clearly as "distinct suggested content" than reusing the dense list layout would.
  Since the main results grid isn't rendered at all in this state, there's no on-screen
  inconsistency between the two.

## Verification performed
- `node --check app.js` / `node --check translations.js` — clean before and after every edit.
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` — exit 0,
  190/190 planner assertions, both parsing scripts run to completion unchanged (see final summary
  for verbatim output).
- Brace/paren balance: app.js `{`/`}` 652/652, `(`/`)` 1533/1533; style.css `{`/`}` 693/693.
- Source-level duplicate-key scan on `translations.js` (regex over each language block, not
  `Object.keys`, which would hide a literal duplicate the parser silently overwrote): EN 73 flat
  keys / 0 duplicates, KO 73 flat keys / 0 duplicates, counts equal.
- `node -e "require('./translations.js')"` — loads cleanly; all four new EN/KO key pairs resolve
  through `createTranslationFunction('en')`'s actual `t()` path, not just direct object access.
- Two standalone Node simulations (exact logic copied from the file, not re-derived): (a) the
  alternatives algorithm against 7 synthetic pools (sub-floor, anomalous, stable, non-stable-large,
  multiple chains) — same-chain/stable-fallback/trust-rail exclusions all correct; (b) the noindex
  toggle against a fake `document` across 5 scenarios (untouched-when-normal, flips-to-noindex,
  idempotent-on-repeat, restores-on-clear, creates-if-missing) — all passed.
- `app.js` cannot be `require()`'d in Node (unconditionally destructures the browser `React`
  global at line 1; confirmed by checking that `test_protocol_parsing.js`/`test_qualifier_fix.js`,
  which exercise app.js-adjacent parsing logic, contain zero `require()` calls — they duplicate the
  logic under test rather than requiring the file, which is why this repo's precedent (007-notes.md)
  is "no new test file" for app.js-only React/DOM changes). No `module.exports` exists in app.js
  today and none was added — retrofitting the whole file for Node-testability is a large,
  unrelated, high-risk change to a HIGH-tier SEO file, far outside "smallest version that tests the
  hypothesis." This is why verification above leans on `node --check`, source-level greps, and
  logic-equivalent standalone simulations instead of an in-harness test.
- No visual/browser verification was possible in this sandbox (task's own environment facts:
  read-only bash mount, no Playwright/browser tool available here) — see the final summary for the
  exact URLs and scenarios for human/Playwright spot-check.
