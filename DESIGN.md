---
name: DeFi Garden — Quiet
description: A restrained, table-first analytics UI for a trust-driven DeFi yield product; one accent, tabular numerals, boxes only where grouping earns them.
colors:
  accent: "#3B82F6"
  accent-hover: "#2563EB"
  accent-active: "#1D4ED8"
  accent-soft: "#EFF5FF"
  accent-border: "#BFD8FE"
  bg: "#F7F8FA"
  surface: "#FFFFFF"
  surface-muted: "#F1F3F7"
  surface-sunken: "#EDEFF4"
  border: "#E4E7EE"
  border-strong: "#CBD2DF"
  text: "#10151F"
  text-secondary: "#5A6478"
  text-muted: "#8A93A6"
  positive: "#15803D"
  warning: "#B45309"
  danger: "#B91C1C"
typography:
  body:
    fontFamily: "FKGroteskNeue, Geist, Inter, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "normal"
  title:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "16px"
    fontWeight: 600
  metric:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "16px"
    fontWeight: 600
    fontFeature: "tabular-nums"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  "1": "1px"
  "2": "2px"
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "32": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-icon:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    size: "40px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "32px"
  chip-selected:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: DeFi Garden — Quiet

<!-- Generated via /impeccable document, Scan mode, 2026-08-05. Source: style.css's
     "Quiet design system — 225" token layer (rounds 1-2 of the design reset) PLUS
     the committed direction in product-loop-kit/specs/225-round3-brief.md — the
     human-approved SOTA-restraint bar that rounds 1-2 did not yet satisfy. Where
     shipped code and the brief disagree, this file documents the BRIEF as
     authority and calls out the gap explicitly (see "Gaps vs. shipped code" at
     the end of each section, where one exists). This is the incumbent world for
     refinement work, not a replacement proposal. -->

## Overview

**Creative North Star: "The Quiet Ledger"**

DeFi Garden's analytics surface reads like a well-kept ledger, not a trading terminal: calm neutral
grays carry almost everything, one blue is spent on exactly one decision per screen, and every number
lines up in its column because the eye's job is to compare, not to decode. The product's trust
positioning — "honest numbers beat exciting numbers" — is a visual doctrine here, not just a copy line:
loud treatments (glow, pills around plain data, mixed-precision numerals, terminal-mono caps) read as
performance, and performance is the thing this product is explicitly not selling. Confirmed visual
rejections (human 2026-08-04/05, CLAUDE.md, round3-brief.md): neumorphism (stripped in rounds 1-2),
glow box-shadows, scale-pop hovers, bounce easings, terminal mono-caps labels, and pills wrapped around
plain data.

The system is flat and table-first. Containers (cards, panels) exist only where grouping content earns
a border; everything else is plain text on the page background. Density is calm, not sparse: 8pt spacing
throughout, one 64px row height for tabular data, one accent color reserved for the single primary
action per view plus (sparingly) a headline metric.

**Key Characteristics:**
- One accent (`#3B82F6` family) used on ≤10% of any screen: one primary action, already-selected filter
  state. Never on secondary numbers, secondary links at rest, or decorative dots/badges.
- Numerals are tabular (`font-variant-numeric: tabular-nums`) in the body font family — no monospace
  skin anywhere in the product (round3-brief item 238, absorbed here).
- Three text colors only: primary (`--ui-text`), secondary (`--ui-text-secondary`), and disabled/muted
  (`--ui-text-muted`). No fourth tier.
- Flat by default: no shadows at rest; the only "elevation" signal is a 1px border, and even that only
  on containers that group unrelated content.

## Colors

Two-color system in practice — one accent, one neutral ramp — because the product's honesty positioning
argues against a decorative secondary/tertiary palette.

### Primary
- **Quiet Blue** (`#3B82F6`, dark-mode `#4C8DF6`): the ONE accent. Reserved for exactly one primary
  action per view (a CTA button, a link's hover/focus state) and already-selected filter/category state.
  **The One Voice Rule.** If more than one element on a screen is blue at rest (not hover, not
  selected-state), the accent has been spent twice and one of them is wrong.

### Neutral
- **Paper** (`#F7F8FA`, dark `#0F1115`): page background.
- **Surface** (`#FFFFFF`, dark `#161A21`): card/panel background, one step lighter than paper (dark:
  one step lighter than page bg) so containers read as a distinct plane without a shadow.
- **Surface Muted** (`#F1F3F7`, dark `#1C212A`): the "pressed"/grouped-control background — segmented
  control tracks, muted chip backgrounds.
- **Border** (`#E4E7EE`, dark `#262C36`): the default 1px container/divider line.
- **Border Strong** (`#CBD2DF`, dark `#39414F`): hover-state border, and (round 3a) the deliberately
  raised-contrast row-separator token in dark mode — a plain `border` divider is too faint against a
  near-black background to read as a row boundary.
- **Text** (`#10151F`, dark `#E8ECF3`): primary text, headline numerals, symbols.
- **Text Secondary** (`#5A6478`, dark `#A2ABBB`): metadata lines, labels, non-headline numerals (TVL),
  quiet links at rest.
- **Text Muted** (`#8A93A6`, dark `#79839A`): placeholder text, disabled state.

### Named Rules
**The No-Fourth-Tier Rule.** Every piece of text on an analytics screen is one of exactly three colors:
primary, secondary, or muted. A component that wants a fourth shade should reuse secondary at a
different weight instead of introducing a new color.

**The Borders-Earn-It Rule.** A 1px border exists only where two visually distinct regions need a
boundary a gap alone can't supply (a composed panel, a row separator). It never exists as decoration
around a single number, label, or icon.

### Gaps vs. shipped code
Round-2 code still contains isolated `rgba(59, 130, 246, 0.1)`-style ad-hoc blue tints (pool-card hover
pill backgrounds, `.pool-apy-preview` borders) outside the `--ui-accent*` token set — inherited from a
pre-Quiet layer and mostly dead after round 3a's grid consolidation, but not yet swept from every
surface (pool detail, planner). The brief's authority is the token set above; any literal `rgba(59,130,246,…)` found elsewhere is legacy, not a second source of truth.

## Typography

**Body Font:** FKGroteskNeue, with Geist → Inter → system-ui fallbacks (`--font-family-base`).
**Label/Mono Font:** none — the brief explicitly retires the monospace numeral skin (`--font-family-mono`
still exists as a token for legacy callers but new work must not reach for it). Numerals get
`font-variant-numeric: tabular-nums` on the BODY family, never a mono face.

**Character:** A single grotesque sans across every weight and role — no serif, no mono, no display
face. Hierarchy comes from size and weight, not typeface changes.

### Hierarchy
- **Title** (600, 16px, 1.3): section/panel headings ("Yields for USDC"). One size for this role at
  every viewport — round 3a's own bug was a mobile media query silently bumping this to 18px.
- **Body** (400, 14px, 1.4): default UI text, buttons, inputs.
- **Metric** (600, 16px, tabular-nums): the one number per row/card that matters most (APY). Plain text,
  never boxed.
- **Metric secondary** (600, 14px, tabular-nums, secondary color): a supporting number (TVL) — same
  numeral discipline, lower visual weight via color, not size.
- **Label** (500, 12–13px): column headers, secondary metadata lines, sort-control text. Sentence case;
  never uppercase, never letter-spaced like a badge.

### Named Rules
**The Tabular Rule.** Any numeral that appears in a column with other numerals of the same kind gets
`font-variant-numeric: tabular-nums` AND matching decimal precision — mixed precision inside one column
(`4%`, `4.95%`, `3.5%`) breaks the alignment tabular-nums exists to provide. Fixed precision is chosen
per column (APY: 2dp; currency: adaptive per `formatCurrency`'s existing magnitude rules, already
consistent).
**The Sentence-Case Rule.** No label, button, or column header is uppercase or letter-spaced as a
badge. Case carries no semantic weight in this system; weight and color do.

## Layout

8pt spacing scale (`--space-1/2/4/8/12/16/20/24/32`); every gap, padding, and margin in new work is one
of these steps, not an eyeballed value. Containers are centered with a 1200px max-width. Control heights
come from four tokens only (`--ui-control-h-sm` 32px for icon-only/no-label chips, `--ui-control-h` 40px
default, `--ui-control-h-lg` 48px hero-only) — a fifth ad-hoc height is a bug, not a variant.

Responsive strategy: reflow, not shrink-in-place. A data table becomes a two-line stacked row under
768px rather than compressing five columns into a narrower grid — column compression is what produced
round 2's "squeezed" mobile rows.

## Elevation & Depth

Flat by default; no ambient shadows. `--ui-shadow-overlay` exists only for true overlays (dropdowns,
modals) floating above the page, never for at-rest cards or buttons. Depth between plane and container
is conveyed by a background-color step (surface vs. surface-muted vs. page bg) plus, where two regions
truly need separating, a single 1px border — never both a background step AND a shadow AND a border on
the same element.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. The only state that may add elevation is an
actual overlay (something that floats above other content); hover/press states get a background-color
or 1px-transform change, never a new shadow.

## Shapes

Two radii cover the whole system: `--ui-radius-md` (12px) for any control with a text label (buttons,
inputs, segmented-control tracks), `--ui-radius-pill` (999px) for icon-only buttons and every chip.
`--ui-radius-lg` (16px) is reserved for panel/card containers — the "composed surface" scale, not a
control scale. A table row inside such a panel carries no radius of its own; the panel's own radius (via
`overflow: hidden`) is what rounds the corners of the first/last row.

## Components

### Buttons
- **Shape:** pill (999px) for icon-only; 12px radius for any button with a text label.
- **Primary:** accent-filled, white text, 40px height, 0 16px padding. One per view.
- **Secondary / Ghost:** neutral background (surface or surface-muted), primary or secondary text color,
  1px border. No blue at rest.
- **Quiet link:** plain secondary-color text, no button chrome at all (no height/padding/radius/
  background); accent color and/or underline appear ONLY on hover/focus.
- **Hover / Focus:** background/border-color step, or (quiet link only) accent text color. No transform
  scale, no shadow.

### Chips / Segmented controls
- **Style:** pill shape, `surface-muted` track background, `surface` (light) as the selected background
  step. Selected state uses a **neutral** background/border/color step (`--ui-border-strong` /
  `--color-text`) — NOT the accent — except for the category/filter chip row, where the human-approved
  exception is the accent fill on an already-selected chip (the one place besides the primary CTA the
  accent is allowed to appear at rest).
- **State:** unselected chips are plain outline/neutral; selected reads via a bg/border step (or, for
  category chips specifically, the accent).

### Cards / Containers ("composed panel")
- **Corner Style:** 16px radius, `overflow: hidden` so children never bleed past the rounded corners.
- **Background:** one step up from page background (surface vs. bg).
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px, `--ui-border` (light) / raised to `--ui-border-strong`-equivalent for anything acting
  as a row-separator in dark mode.
- **Internal Padding:** 16–20px for a header band; a data row inside the same panel uses 0 vertical
  padding and a fixed height instead (rows are lines, not padded cards).

### Inputs / Fields
- **Style:** `surface` background, `border-strong` 1px stroke, 12–16px radius depending on role (a
  search bar uses the panel-adjacent 16px pill-ish radius already in code; a plain form field uses 12px).
- **Focus:** border color → accent, plus the 2px offset + 4px accent focus ring (`--ui-focus-ring`) — no
  glow.

### Navigation / Tabs
- **Style:** flat text tabs; active tab = accent text + accent underline. No pill background on tabs
  (that language is reserved for chips/segmented controls, so tabs and chips read as two clearly
  different affordances rather than the same pill language reused for two purposes).

### Table row (signature component)
The grid results view's defining pattern (round 3a). One CSS grid row per pool: fixed icon column, a
flexible name column (symbol + one plain secondary metadata line, no pill), then three fixed columns
(APY, TVL, action) each right-aligned and tabular. No radius, no background, no shadow on the row itself
— only a 1px bottom border shared with its neighbors, living inside one composed panel. Height is a
single constant (64px desktop, ~72px stacked two-line on mobile) so the row height token, not row
content, sets the rhythm.

## Do's and Don'ts

### Do:
- **Do** give numerals in the same column identical decimal precision AND `tabular-nums`.
- **Do** use exactly one accent-colored element at rest per view (the primary action), plus
  already-selected chip/tab state.
- **Do** keep every row/line inside a composed panel border-only (no per-row shadow, radius, or fill);
  the panel supplies the one border the whole group needs.
- **Do** reuse one of the four control-height tokens and one of the two control-radius tokens for any
  new interactive element.

### Don't:
- **Don't** add a box-shadow glow to any control at rest or on hover (round3-brief ban, still binding).
- **Don't** use `scale()` transforms on hover/press (banned "scale-pop"); press feedback is a 1px
  translate or a background step only.
- **Don't** render a label, chip, or header in uppercase with letter-spacing to fake a "badge" look —
  sentence case carries this system's hierarchy.
- **Don't** introduce a second pill/chip visual language for the same role (e.g., a filter chip, a nav
  tab, and a sort control should not each invent their own selected-state treatment) — reuse the
  chip/segmented-control or tab pattern already defined above rather than composing a third.
