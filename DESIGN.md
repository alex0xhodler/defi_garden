---
name: DeFi Garden — Night Instrument Panel
description: A dark cockpit panel for yield underwriting; a ranked list beside six real instruments that read the selected pool, luminous green for normal range and the one action, amber and red only for caution.
colors:
  panel: "#0B0D0F"
  plate: "#111316"
  plate-raised: "#16191D"
  face: "#090B0D"
  rule: "#24282D"
  rule-strong: "#363B41"
  instrument-white: "#F2F5F5"
  text-secondary: "#AEB6B9"
  text-muted: "#848D91"
  radium-green: "#7CFF9E"
  radium-green-hover: "#A6FFBE"
  radium-green-soft: "rgba(124, 255, 158, 0.10)"
  radium-green-line: "rgba(124, 255, 158, 0.45)"
  on-green: "#04130A"
  caution-amber: "#FFB000"
  warning-red: "#FF5A4F"
typography:
  display:
    fontFamily: "'Barlow Condensed', 'Barlow', system-ui, sans-serif"
    fontSize: "clamp(40px, 5vw, 68px)"
    fontWeight: 600
    lineHeight: 0.96
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "'Barlow Condensed', 'Barlow', system-ui, sans-serif"
    fontSize: "clamp(30px, 3.4vw, 44px)"
    fontWeight: 600
    lineHeight: 1.02
  title:
    fontFamily: "'Barlow Condensed', 'Barlow', system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.05
  readout:
    fontFamily: "'Barlow Condensed', 'Barlow', system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 600
    fontFeature: "tabular-nums"
  placard:
    fontFamily: "'Barlow Condensed', 'Barlow', system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    letterSpacing: "0.16em"
  body:
    fontFamily: "'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
  code:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  badge: "3px"
  control: "4px"
  plate: "6px"
  round: "50%"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "24": "24px"
  "32": "32px"
  "48": "48px"
  "72": "72px"
components:
  button-primary:
    backgroundColor: "{colors.radium-green}"
    textColor: "{colors.on-green}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "0 22px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.radium-green-hover}"
    textColor: "{colors.on-green}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.instrument-white}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "34px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.control}"
    padding: "0 11px"
    height: "32px"
  tab-active:
    backgroundColor: "{colors.radium-green-soft}"
    textColor: "{colors.radium-green}"
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.instrument-white}"
    padding: "8px 16px"
    height: "56px"
  list-row-hover:
    backgroundColor: "{colors.plate-raised}"
  chain-badge:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.badge}"
    padding: "0 5px"
  instrument-plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.instrument-white}"
    rounded: "{rounded.plate}"
    padding: "18px 22px"
  placard:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    typography: "{typography.placard}"
    rounded: "{rounded.badge}"
    padding: "3px 10px"
  lamp:
    backgroundColor: "#0D0F11"
    textColor: "#5E656B"
    typography: "{typography.placard}"
    rounded: "{rounded.control}"
    height: "38px"
---

# Design System: DeFi Garden — Night Instrument Panel

## Overview

**Creative North Star: "Trust the instruments when you can't see outside."**

The system is a small-aircraft instrument panel at night. Black plates hold instrument faces; white scales and numerals sit on near-black dials; a radium-green needle reads each value; amber and red appear only where a pilot would need caution. Every instrument is bound to one real number from CI-computed or live DefiLlama data, so the panel is a reading, never an illustration. It refuses both the hero-then-cards landing and the neon crypto dashboard.

Density is cockpit density: a ranked list and a six-instrument panel share the first viewport, and nothing floats that does not have to. Depth is made from plate steps and hairlines, never from glow or soft shadow. Motion is mechanical: a damped needle swing when a reading changes, short colour transitions on controls, nothing that bounces or scales.

This world is the design authority going forward (PRODUCT.md, 2026-09-27). It is currently built on the landing (bare `/`) only, which is dark-only and ignores the site theme toggle. See "Surfaces not yet migrated" at the end.

**Key Characteristics:**
- Dark-only panel: black plates, near-black instrument faces, white scales.
- One luminous green for needles, normal-range arcs, lit "normal" lamps, the selected state and the single primary action.
- Amber and red are reserved for caution and warning bands, and for the snapshot-data lamp.
- One dial grammar for every round gauge (240° sweep, two-step bezel, graduated scale, digital readout).
- Barlow Condensed for display, readouts and placards; Barlow for text; caps only on placards.
- Hairline plates with four screws; no blur, no glow, no drop shadows at rest.

## Colors

A near-monochrome black-to-white instrument palette with one luminous accent and two caution colours that mean exactly what they mean on a panel.

### Primary
- **Radium Green** (radium-green): the needle on every dial, the normal-range arc, the lit "Low" risk lamp, the list title placard, the rank and rating of a selected row, the active tab, link text in the list, the live-data dot, the flight-log fill, the MCP command text, and the filled "Open pool" action. **Radium Green Hover** (radium-green-hover) is the primary action's hover only. **Radium Green Soft** (radium-green-soft) is the fill behind an active tab; **Radium Green Line** (radium-green-line) is its border and the border of a lit green lamp.
- **On Green** (on-green): text on the filled green action. Never use white on green.

### Secondary
- **Caution Amber** (caution-amber): amber dial arcs (score 40–55, liquidity 5–9), the lit "Med" lamp, a falling APY trend mark, the snapshot-data dot, and the flight-log target marker.
- **Warning Red** (warning-red): red dial arcs (score below 40, liquidity below 5) and the lit "High" lamp. Nothing else.

### Neutral
- **Panel** (panel): the page itself, the sticky header, the footer.
- **Plate** (plate): every raised surface: list, instrument panel, flight-log plate, agent console.
- **Plate Raised** (plate-raised): hover state of a row, the mobile menu sheet.
- **Face** (face): instrument faces, the strip-gauge track, the command well. The darkest value, so dials read as recessed.
- **Rule** (rule): the 1px hairline separating everything: plate borders, row dividers, header and section rules.
- **Rule Strong** (rule-strong): outlines on controls, placards, chain badges, the brand ring.
- **Instrument White** (instrument-white): headlines, titles, scale numerals, readouts, ticks, focus rings.
- **Text Secondary** (text-secondary): lede, meta lines, nav links, sub-readouts, placard text.
- **Text Muted** (text-muted): rank numbers, column headers, footnotes, rules copy, unselected counts.

### Named Rules
**The Luminous-Is-Colour Rule.** "Luminous" means a saturated colour on black, never a blur. No `filter: blur`, no glowing `box-shadow`, no text-shadow halo on any needle, arc, lamp or button.

**The Caution-Only Rule.** Amber and red appear only where the data means caution or warning (a band, a lit lamp, a falling trend, snapshot data). Never as decoration, never as a brand accent.

**The One Green Rule.** Green means "normal, selected, or go". Every green on screen is one of those three; there is no second accent.

## Typography

**Display Font:** Barlow Condensed 500/600 (with Barlow, system-ui)
**Body Font:** Barlow 400/500/600 (with system-ui, -apple-system, Segoe UI)
**Mono:** ui-monospace stack, used exactly once: the MCP install command.

**Character:** A condensed, engineered sans for everything an instrument would print (headlines, placards, scale numerals, readouts), paired with its regular-width sibling for reading text. Both loaded from Google Fonts.

### Hierarchy
- **Display** (600, clamp(40px, 5vw, 68px), 0.96): the page headline only; narrows to clamp(34px, 9.5vw, 48px) below 900px.
- **Headline** (600, clamp(30px, 3.4vw, 44px), 1.02): section titles below the deck (track record, agents, SEO block).
- **Title** (600, 32px, 1.05): the selected pool's symbol on the instrument panel; 26px when narrow.
- **Readout** (600, 23px, tabular): the digital value in each dial's lower face. Scale numerals use the same face at 16px; sub-readouts at 12.5px, 500, 0.04em tracking, secondary colour. Row scores (17px), row APY (18px), rank (15px) and the flight-log number (56px) use the same condensed tabular treatment.
- **Placard** (600, 12.5px, 0.16em, uppercase): instrument labels, list title, lamp labels (15px, 0.14em), column headers (12px, 0.12em).
- **Body** (400, 16px, 1.5): running text; the lede is 17px, secondary colour, max 58ch.
- **Label** (500, 13px): meta lines, footnotes, chain badges (11.5px, 600), tab labels (13.5px, 500).
- **Code** (400, 13px, 1.5): the MCP command, in green on the face colour.

### Named Rules
**The Placard Rule.** Uppercase exists only on instrument placards: gauge labels, the list title, lamp labels, column headers. Everything else, including buttons, tabs and headlines, is sentence case.

**The Tabular Numerals Rule.** Every number that can change (score, APY, rank, TVL, counts, scale labels) is set in the condensed face with `tabular-nums`, so readings do not jitter as values update.

## Layout

- **Container:** 1320px max width, 32px side padding; 16px below 900px.
- **First viewport (desktop):** a two-column intro row (headline left, lede right, bottom-aligned), then the deck: ranked list at 5/12 and the instrument panel at 7/12, 16px gap. The deck height is clamped (560–660px) so list and panel fill the viewport together; the list scrolls inside its plate.
- **Six-pack:** a 3×2 grid of instruments: DeFi score, APY now, 14-day forecast (top); depth, liquidity score, crash-risk annunciator (bottom). Two columns when narrow.
- **Below the deck:** full-width sections separated by a top hairline, 72px vertical padding (48px narrow), each a two-column text + plate grid that stacks to one column when narrow.
- **Breakpoints:** 1120px tightens nav and deck proportions; 1000px swaps the nav for a menu button; 900px is narrow mode; 380px tightens row columns.

### Named Rules
**The List-First Rule (narrow, ≤900px).** Below 900px the list is the page. There is no side panel: a tapped row expands its own instrument panel inline beneath it (`aria-expanded`), the screws are dropped, and the primary action goes full width. The list shows the top 10 with a "show all" control; the tabs become a single horizontally scrolling line with an edge fade.

**The Shared Viewport Rule.** On desktop the ranked list and the reading of the selected pool are always visible together; selecting a row never navigates.

## Elevation & Depth

Flat by construction. Depth comes from three steps of darkness (face below plate, plate above panel, plate-raised for hover) and 1px hairlines, plus two physical details: a two-step bezel on every dial and four screws on the instrument plate. Nothing at rest carries a shadow.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55)`): the mobile menu sheet, the only thing that floats.
- **Fastener ring** (`box-shadow: 0 0 0 1px #07080A`): the dark ring around each screw head, which is a small radial-gradient disc with a slot.
- **Lamp well** (`box-shadow: inset 0 0 0 1px #1A1D21`): the recessed hairline of an unlit annunciator lamp.

### Named Rules
**The Plate-Step Rule.** To lift something, step its background (face → plate → plate-raised) and give it a hairline. Never a drop shadow, never a glow.

## Shapes

Machined, nearly square corners: plates at 6px, controls, lamps and buttons at 4px, placards and chain badges at 3px. Circles are reserved for the dials, screws, the brand ring and status dots. Every surface edge is a 1px hairline; placards and badges are outlined rather than filled.

## Components

### Buttons
- **Primary ("Open pool"):** the one filled-green element on the page: radium green, on-green text, Barlow 600 16px, 48px tall, 22px side padding, 4px corners, trailing arrow icon. Hover steps to radium-green-hover; active presses down 1px. Full width when narrow. **The One Action Rule.** Exactly one filled button exists per panel; everything else is outlined or text.
- **Secondary (copy, language toggle, menu):** transparent with a rule-strong outline, 4px corners, 34–36px tall; hover brightens the text and the outline to text-muted; active presses 1px.
- **Text action ("show all"):** full-width green text on the plate, 48px tall, separated by a hairline.

### Tabs
Category filters above the list: outlined 32px pills with 4px corners, Barlow 500 13.5px, a condensed tabular count after the label. Active tab: green text, green-line border, green-soft fill, green count. `aria-pressed` carries state.

### List rows
A four-column grid (rank, pool, score, APY), min 56px tall, hairline between rows. Rank is two-digit, condensed and muted; the pool cell stacks symbol (600, 15.5px) over an outlined chain badge and the project name; score stacks value over its letter rating in green; APY is condensed 18px with a trend mark (green up, amber down, muted flat), white when the value is live, secondary when it is a snapshot. Hover steps to plate-raised; selected takes a dark green-tinted fill and a green rank.

### Instrument plate
The panel that reads the selected pool: plate background, hairline, 6px corners, four screws inset 9px from the corners. Head: symbol title, project · chain meta, and a source line with a green (live) or amber (snapshot) dot. Foot: the primary action and a muted note explaining what the green arcs mean.

### Dial (signature)
One grammar for all five round gauges, drawn in a 200×200 SVG:
- **Sweep:** 240°, from −120° to +120°, zero at lower left.
- **Bezel:** two steps, an outer ring (r 97, 2px stroke) and an inner step (r 91, 1px), around a face (r 89) in the face colour.
- **Scale:** major ticks (2.2px, white) with condensed numerals inside them; four minor graduations between every pair of majors (1px, 50% opacity).
- **Arcs:** 7px bands at r 77 in green, amber or red at 90% opacity. A band narrower than 5° is widened to a 5° minimum around its midpoint so it stays visible. Score dial: red 0–40, amber 40–55, green 55–100. APY dial: green 30-day band. Forecast dial: green p10–p90. Liquidity dial: red 0–5, amber 5–9, green 9–15. Depth dial is log-scaled from $10M to $100B with no arc.
- **Needle:** green tapered pointer with a dark counterweight tail and a hub; it rotates with `transform 0.9s cubic-bezier(0.16, 1, 0.3, 1)` (a damped swing) when the reading changes. Under `prefers-reduced-motion` it jumps with no transition.
- **Readout:** the digital value in the lower face, an optional sub-readout below, and the placard beneath the dial as its caption. Each dial is `role="img"` with an aria-label stating the value.

### Annunciator
The crash-risk instrument is three stacked lamps (Low, Med, High) instead of a dial. Unlit lamps are dark wells with dim grey caps text; exactly one lamp is lit, in green, amber or red, as a tinted fill (12% of its colour) with a matching border. The flight-log verdict reuses the same lit lamp.

### Placards
Outlined, 3px-cornered caption plates under each instrument; condensed caps, 0.16em tracking, secondary colour. The list title is the same placard in green without a frame.

### Strip gauge (track record)
A horizontal scale on the face colour with a green fill for the hit rate, an amber target line, a white pointer, and condensed tick labels 0–100 below; a legend explains fill and target.

### Navigation
Sticky 56px header on the panel colour with a bottom hairline: brand (condensed 21px, leaf mark in a hairline circle), secondary-colour links that turn white on hover, an outlined language toggle. Below 1000px the links collapse into an outlined menu button and a floating sheet.

### Focus
Every focusable element gets a 2px instrument-white outline at 2px offset with 3px corners. Never removed, never recoloured.

## Do's and Don'ts

### Do:
- **Do** bind every needle, arc, lamp and readout to a real number from CI or live data, and give each instrument a text equivalent (aria-label).
- **Do** use the dial grammar exactly: 240° sweep, two-step bezel, four minor graduations per major, 5° minimum arc span, damped needle, no motion under reduced-motion.
- **Do** keep one filled green action per panel ("Open pool") and make everything else outlined or text.
- **Do** build depth from face / plate / plate-raised steps and 1px hairlines.
- **Do** set every changing number in Barlow Condensed with tabular numerals.
- **Do** keep caps on placards only.
- **Do** go list-first below 900px: rows expand their panel inline, top 10 plus "show all".

### Don't:
- **Don't** make anything glow: no blur, no glow shadows, no text halos. Luminous is colour on black.
- **Don't** draw a decorative gauge, fake needle, or placeholder reading; show an honest empty state instead.
- **Don't** use amber or red for anything but caution and warning.
- **Don't** add a second accent colour or a second filled button.
- **Don't** use scale-pop hovers or bounce easings; controls press down 1px on active.
- **Don't** add a light theme to this world's landing; it is dark-only.
- **Don't** use monospace anywhere except a literal command to copy.

## Surfaces not yet migrated

Ground truth as of 2026-09-27: only the landing (bare `/`, `landing.js` + `landing-styles.css`, tokens `--ip-*` scoped to `html[data-app-mode="landing"]`) is built in this world. The other surfaces still render older systems and are to migrate to the instrument panel later. Their current styles are not the target and must not be copied into new work:

- **Pool page and analytics app** (`?pool=`, `?token=`, `?chain=` and every other parameterized URL): the "247 certificate" world (security-printing grammar, Besley + Public Sans, green safety-paper) scoped by the second contract comment in `home.html` and implemented in `pool-detail-styles.css`, over the legacy "Quiet" `--ui-*` tokens in `style.css`.
- **Garden Planner** (`plan.html`): its own styles (`planner-styles.css`) on the Quiet tokens.
