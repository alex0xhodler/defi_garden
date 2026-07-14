# 093 — implementation notes (deviations, icon choices, conservative calls)

## Icon glyphs chosen (NAV_ICONS in app.js)

All are Lucide-style monochrome line glyphs on a 24×24 viewBox, rendered via the
shared `navIcon(key)` helper as a 16×16 `<svg>` with `fill="none"`,
`stroke="currentColor"`, `stroke-width:1.8`, round caps/joins, `aria-hidden`. Each
entry is a single `d` string (multiple subpaths joined with `M…`), so one `<path>`
per glyph is sufficient.

| key          | control            | glyph            | rationale                          |
|--------------|--------------------|------------------|------------------------------------|
| `all`        | All tab            | 4-square grid    | "everything / browse all"          |
| `lending`    | Lending tab        | landmark / bank  | lending = bank building            |
| `staking`    | Staking tab        | 3-layer stack    | staked layers                      |
| `lpdex`      | LP/DEX tab         | arrow-left-right | swap / two-sided liquidity         |
| `rwa`        | RWA tab            | building         | real-world assets = physical bldg  |
| `yieldderiv` | Yield Derivatives  | trending-up      | yield curve / derivatives          |
| `chains`     | #chains-btn        | link             | chains = linked networks           |
| `tvl`        | #tvl-btn           | database cylinder| value locked / stored capital      |
| `protocols`  | #protocols-btn     | cube / box       | protocol = discrete package        |
| `apy`        | #apy-btn           | percent          | APY = a rate                       |

Icons inherit the control's text color, so active tab (`--color-primary`),
inactive tab (`--color-text-secondary`), and `has-selection` filter (white)
recolor the glyph automatically with zero extra state code — as the spec intends.

## Deviations from the spec

### 1. Acceptance criterion #7 (KO label check) — asserted via token mode, not `?chain=Base`

The spec's literal wording ("reload `/?chain=Base&lang=ko` and assert the Chains
filter default label === `체인`") is not reachable as written: `?chain=Base` sets
`selectedChain='Base'` (app.js URL-init `useEffect`), and the Chains button renders
`selectedChain || t('navFilterChains')` → it shows **"Base"**, not the default
label, in any language. The DEFAULT (unselected) Chains label is only reachable
when `selectedChain` is empty.

Conservative, faithful resolution: the test performs the KO default-label check by
loading `/?token=USDC&lang=ko` (token mode leaves `selectedChain=''`, exposing the
default Chains + Protocols labels), then asserts **Chains === `체인` AND Protocols
=== `프로토콜`**. This proves both filter labels route through `t()` (not hardcoded
English) in KO — exactly the criterion's stated intent ("Chains/Protocols filter
labels read the KO strings … proving they route through t()"). The token-mode load
still renders the fixture pools (their symbols carry the `USDC` segment).

No product code was changed to accommodate this — the chain-param → Chains-button
binding is pre-existing analytics behavior and out of scope (§Non-goals: don't touch
`?chain=` semantics).

### 2. Acceptance criterion #8 (sticky) — assert "did not move on scroll", not "top === 0"

`.google-header-sticky` is `position:fixed; top:0`, but `getBoundingClientRect().top`
reports ~8px at rest (a small offset from the entrance-animation/layout context, not
a scroll effect). Rather than assert `top ≈ 0` (brittle against that baseline), the
test captures `top` before and after `scrollTo(0, 600)` and asserts it is unchanged
(Δ ≤ 1px) and still pinned near the viewport top — which is the true meaning of
"stayed fixed on scroll." Faithful to the criterion's intent, robust to the baseline.

## Conservative choices

- **Single `<path>` per glyph.** All glyphs are expressible as one multi-subpath `d`
  string, so `navIcon` renders one `<path>` — simpler than the multi-path option the
  spec allowed, no behavioral difference.
- **Fixture: added one Ethereum pool.** The Chains dropdown only renders when
  `availableChains.length > 1`. The two Base pools (RWA + Lending) alone yield a
  single chain, so a third pool on Ethereum (`USDC-COMP`, filtered out of the Base
  grid) was added purely to exercise assertion #6 (dropdown positioning). It does not
  affect the Base-mode grid assertions.
- **No new active-state CSS.** Press physics + active underline carry through
  untouched because `.google-nav-tab` / `.google-filter-btn` class names are
  preserved verbatim; the only CSS added for controls is `display:inline-flex` +
  `gap` for icon/label alignment and the new grouping/divider rules — all via tokens
  (`--color-border`, `--space-*`), so dark mode inherits automatically.
- **Removed only `margin-left` from `.google-filter-btn`.** As the spec directed, the
  divider + `.google-nav-secondary` gap replace the old ad-hoc left margin; nothing
  else in that rule changed.
- **Reused the `test_category_taxonomy.js` harness verbatim** (server, route
  fixtures, stale-snapshot stub, `IGNORABLE_ERROR_PATTERN`, `CHROMIUM_EXECUTABLE`) on
  a distinct port (8802).

## Files changed

- `app.js` — CATEGORY_TABS gains an `icon` field; new `NAV_ICONS` map + `navIcon()`
  helper (near line 95); nav render block restructured into
  `.google-nav-primary` → `.google-nav-divider` → `.google-nav-secondary` with
  leading icons and `.google-nav-label` spans; filter default labels routed through
  `t('navFilter*')`.
- `translations.js` — `navFilterChains/Tvl/Protocols/Apy` added to EN and KO blocks.
- `style.css` — `.google-nav-primary/.google-nav-secondary/.google-nav-divider`
  rules; `display:inline-flex; align-items:center; gap` on `.google-nav-tab` and
  `.google-filter-btn`; `margin-left` removed from `.google-filter-btn`; `svg`
  flex-shrink; mobile-block rules so the groups + divider survive single-row at 360px.
- `test_nav_rail_ia.js` — new (all 10 acceptance assertions).
- Regenerated: `app.compiled.js`, `app.compiled.min.js`, `PoolDetail.compiled*.js`,
  `translations.min.js`, `style.min.css` (+ other minify outputs) via
  `npm run compile && npm run minify`.
