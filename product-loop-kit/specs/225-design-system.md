# 225 — DESIGN SYSTEM: "Quiet" (the clean-minimal reset)

The written design spec required by `specs/225.md` §Change. This is the single source of truth the
implementation agents build against. Human directive 2026-08-04 Q2b: **strip the neumorphism, kill the
google-mimic era, one system across every surface.**

## 1. Principles

1. **Flat surfaces, hairline separation.** Depth comes from a 1px border and background-value steps —
   never from a shadow. Exactly ONE ELEVATION token exists (`--ui-shadow-overlay`), and it is only for
   things that float above the page (dropdowns, popovers, tooltips, sticky header when scrolled). Every
   `box-shadow` in the repo is one of exactly four things (full enumeration run 2026-08-05, after the
   verifier caught two stragglers): `--ui-shadow-overlay`; a focus ring; the inset fades marking
   horizontal scrollability inside filter dropdowns; the `prefers-contrast: high` outlines in
   `pool-detail-styles.css`. Plus one DEAD exception, the legacy `.card` scaffold's
   `--shadow-sm`/`--shadow-md` (no component renders `className="card"`). Known debt: focus indication
   is still split between `--ui-focus-ring` and a legacy `--focus-ring` on exactly four call sites.
2. **One of each.** One header, one card, one control, one input, one chip. If a surface needs a variant,
   it is a modifier class on the same base, not a new component.
3. **Calm, not decorative.** No gradients on page backgrounds, no dual-direction shadows, no glow, no
   scale-pop, no bounce. Motion is opacity/translate ≤ 2px, ≤ 160ms, and every animation respects
   `prefers-reduced-motion`.
4. **Contrast is the hierarchy.** Text hierarchy is carried by weight + colour, not by size inflation.
5. **Dark mode is first-class**, not an inversion afterthought: it gets its own surface ramp.
6. **Trust rails, copy, numbers, routing and analytics are untouched.** This is skin only.

## 2. Token layer (authoritative — install verbatim)

The new tokens are `--ui-*`. They live in `style.css`, which every surface already loads. The old
`--neuro-*` names are KEPT AS DEPRECATED ALIASES (permitted by 225 acceptance #1: "token definitions may
remain … for one release") so that generated static pages (`/tokens/*`, `/chains/*`, `stories/*`) and any
usage missed by this pass render in the new flat language instead of breaking. **No new rule may use a
`--neuro-*` name.**

```css
/* ── Quiet design system — light (default) ───────────────────────────── */
:root {
  --ui-bg:               #F7F8FA;
  --ui-surface:          #FFFFFF;
  --ui-surface-muted:    #F1F3F7;
  --ui-surface-sunken:   #EDEFF4;
  --ui-border:           #E4E7EE;   /* hairline, the default separator      */
  --ui-border-strong:    #CBD2DF;   /* hover / focus-adjacent / inputs      */
  --ui-text:             #10151F;
  --ui-text-secondary:   #5A6478;
  --ui-text-muted:       #8A93A6;
  --ui-accent:           #3B82F6;   /* accent family is FIXED (CLAUDE.md)   */
  --ui-accent-hover:     #2563EB;
  --ui-accent-active:    #1D4ED8;
  --ui-accent-soft:      #EFF5FF;   /* selected chip background             */
  --ui-accent-border:    #BFD8FE;
  --ui-on-accent:        #FFFFFF;
  --ui-positive:         #15803D;
  --ui-warning:          #B45309;
  --ui-danger:           #B91C1C;
  --ui-focus-ring:       0 0 0 2px var(--ui-bg), 0 0 0 4px var(--ui-accent);
  --ui-shadow-overlay:   0 8px 24px rgba(16, 21, 31, 0.10);  /* ONLY floating layers */
  --ui-radius-sm:        8px;
  --ui-radius-md:        12px;
  --ui-radius-lg:        16px;
  --ui-radius-pill:      999px;
}

/* ── Quiet design system — dark ──────────────────────────────────────── */
[data-theme="dark"] {
  --ui-bg:               #0F1115;
  --ui-surface:          #161A21;
  --ui-surface-muted:    #1C212A;
  --ui-surface-sunken:   #12151B;
  --ui-border:           #262C36;
  --ui-border-strong:    #39414F;
  --ui-text:             #E8ECF3;
  --ui-text-secondary:   #A2ABBB;
  --ui-text-muted:       #79839A;
  --ui-accent:           #4C8DF6;
  --ui-accent-hover:     #6BA1F8;
  --ui-accent-active:    #3B82F6;
  --ui-accent-soft:      #17233A;
  --ui-accent-border:    #2C4A7A;
  --ui-on-accent:        #FFFFFF;
  --ui-positive:         #4ADE80;
  --ui-warning:          #FBBF24;
  --ui-danger:           #F87171;
  --ui-shadow-overlay:   0 10px 28px rgba(0, 0, 0, 0.45);
}
```

Deprecated compatibility aliases (same `:root` / `[data-theme="dark"]` blocks, clearly commented
`DEPRECATED — 225`; they exist so legacy/generated markup inherits the flat language):

```css
  --neuro-bg:            var(--ui-bg);
  --neuro-surface:       var(--ui-surface);
  --neuro-surface-light: var(--ui-surface-muted);
  --neuro-text:          var(--ui-text);
  --neuro-text-secondary:var(--ui-text-secondary);
  --neuro-bg-gradient:   var(--ui-bg);
  --neuro-radius-sm:     var(--ui-radius-sm);
  --neuro-radius-md:     var(--ui-radius-md);
  --neuro-radius-lg:     var(--ui-radius-lg);
  --neuro-shadow-raised: 0 0 0 1px var(--ui-border);
  --neuro-shadow-flat:   0 0 0 1px var(--ui-border);
  --neuro-shadow-subtle: 0 0 0 1px var(--ui-border);
  --neuro-shadow-pressed: inset 0 1px 2px rgba(16, 21, 31, 0.10);
```

Semantic bridge (already exists in style.css, keep the names, repoint the values):
`--color-background → var(--ui-bg)`, `--color-surface → var(--ui-surface)`,
`--color-text → var(--ui-text)`, `--color-text-secondary → var(--ui-text-secondary)`,
`--color-primary → var(--ui-accent)`, `--color-primary-hover → var(--ui-accent-hover)`,
`--color-primary-active → var(--ui-accent-active)`.

## 3. Components (one implementation each)

**Page** — `body { background: var(--ui-bg); }`. No fixed radial gradient, no `background-attachment`.

**Card / panel** — `background: var(--ui-surface); border: 1px solid var(--ui-border);
border-radius: var(--ui-radius-lg); box-shadow: none;`. Nested/secondary panels use
`--ui-surface-muted` with the same border. Hover on an interactive card: `border-color:
var(--ui-border-strong)` only.

**Header** — one pattern for every surface: full-width, `background: var(--ui-surface)`,
`border-bottom: 1px solid var(--ui-border)`, height 56px (≥768px) / 52px (<768px), content in a
`max-width` row with 16–24px gutters. Sticky headers gain `box-shadow: var(--ui-shadow-overlay)` ONLY
after scroll (existing scrolled class), never at rest.

**Button, primary** — `background: var(--ui-accent); color: var(--ui-on-accent); border: 1px solid
transparent; border-radius: var(--ui-radius-md); font-weight: 600;` hover → `--ui-accent-hover`,
active → `--ui-accent-active` + `transform: translateY(1px)`.

**Button, secondary / control (icon buttons, sort, view toggles)** — `background: var(--ui-surface);
border: 1px solid var(--ui-border); color: var(--ui-text);` hover → `background: var(--ui-surface-muted);
border-color: var(--ui-border-strong)`; active → `translateY(1px)`; selected/`aria-pressed` →
`background: var(--ui-accent-soft); border-color: var(--ui-accent-border); color: var(--ui-accent)`.

**Chip / pill (presets, filters, tabs, quick-amounts)** — `border-radius: var(--ui-radius-pill);
background: var(--ui-surface); border: 1px solid var(--ui-border); padding: 8px 14px;` selected uses the
same accent-soft treatment as above. Never two chips with different shapes on one screen. Exception:
filter chips in the filter-dropdown family (`.global-filter-dropdown .filter-chip.active`/`.filter-pill.active`,
`.filter-chip.active`, `.filter-pill.active`, `.chain-pill.active`, `.pagination-button.active`,
`.app-filter-btn.has-selection`) use the PRIMARY FILL (`background: var(--ui-accent); color:
var(--ui-on-accent)`) for their selected state instead, because spec 111 established that a selected
filter must be unmistakable — inside the dropdown, accent-soft reads as unselected.

**Input / search** — `background: var(--ui-surface); border: 1px solid var(--ui-border-strong);
border-radius: var(--ui-radius-md);` focus → `border-color: var(--ui-accent)` + focus ring. The search
field's submit is a normal primary button, not a floating circle.

**Nav tabs** — text buttons; selected = `color: var(--ui-accent)` + 2px accent underline; no pill, no
shadow.

**Focus (never weakened — trust rail)** — every interactive element keeps a visible
`:focus-visible` ring: `box-shadow: var(--ui-focus-ring); outline: none;`.

**Press physics** — the existing global `:active` rule is REPLACED: sink is now
`transform: translateY(1px)`; inside `prefers-reduced-motion: reduce`, no transform, only the
`--ui-surface-muted` background change.

## 4. Class renames (google-era chrome)

Mechanical, 1:1, applied to `app.js` + `style.css` (and any test/generator that asserts the old names):

| old | new |
|---|---|
| `google-header-sticky` | `app-header-sticky` |
| `google-header-content` | `app-header-content` |
| `google-header-controls` | `app-header-controls` |
| `google-logo` | `app-logo` |
| `google-search-bar` | `app-search-bar` |
| `google-search-container` | `app-search-container` |
| `google-search-input` | `app-search-input` |
| `google-search-button` | `app-search-button` |
| `google-search-clear` | `app-search-clear` |
| `google-nav-row` | `app-nav-row` |
| `google-nav-content` | `app-nav-content` |
| `google-nav-tabs` | `app-nav-tabs` |
| `google-nav-tab` | `app-nav-tab` |
| `google-nav-label` | `app-nav-label` |
| `google-nav-primary` | `app-nav-primary` |
| `google-nav-secondary` | `app-nav-secondary` |
| `google-nav-divider` | `app-nav-divider` |
| `google-filter-btn` | `app-filter-btn` |
| `google-control-btn` | `app-control-btn` |
| `google-tools-btn` | `app-tools-btn` |
| `google-tools-section` | `app-tools-section` |
| `google-tools-panel` | `app-tools-panel` |
| `google-tools-dropdown` | `app-tools-dropdown` |
| `google-results-count` | `app-results-count` |

No `.app-header*` / `.app-nav*` / `.app-search*` / `.app-logo` / `.app-filter*` / `.app-control*` /
`.app-tools*` / `.app-results*` selector exists in the repo today (verified before choosing the prefix),
so the rename introduces no collision with `.app` / `.app-footer`.

## 5. Invariants the reset must NOT change

- `home.html`'s `__APP_MODE` router, every `?token=/?chain=/?pool=` behaviour, all canonical/SEO output.
- Every analytics emitter and its call site (`session_start`, `page_view`, `pool_view`, `pool_click`
  with `source ∈ {garden_cta, protocol_link, yield_calculator}`, `plan_created`, waitlist events).
- All copy and all `translations.js` keys (EN + KO). This item changes zero strings.
- Trust rails: `APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, anomaly demotion/flags, degen ⅓ haircut,
  `formatUsd`/`formatNum`/`formatApy`.
- DOM structure and element identity where tests or the audit lens depend on it — rename classes per §4,
  do not restructure markup unless a listed acceptance criterion requires it.

## 6. Provenance

Human directive 2026-08-04 (strategy interview Q2b, recorded in `NORTH_STAR.md` Standing decisions);
spec `specs/225.md`; the two-era evidence in `specs/225.md` §Evidence.
