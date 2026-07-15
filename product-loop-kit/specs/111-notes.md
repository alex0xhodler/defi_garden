# 111 — build notes

Operator: Fable-role session (claude-opus-4-8 harness). Product code written by a
dispatched **Opus** coding agent per the 2026-07-13 execution split; **verifier**
subagent judged (independent PASS, HIGH, 8/8). Rendered acceptance driven through the
real UI (Playwright + Chromium), per the 2026-07-11 UX-acceptance rule.

## Deviations / conservative choices
- **Selected-chip fill (Part B2).** The BACKLOG row read the weak state as "barely-visible
  1px lift". Code audit found the fill actually leaks from the *base* `.filter-pill.active`/
  `.filter-chip.active` (both already `background: primary; color:#fff`) — the
  `.global-filter-dropdown …active` override (style.css:1353) only set `transform`+shadow,
  under-emphasizing it. Fix makes the dropdown-scope active state EXPLICITLY filled and adds a
  `.chain-pill.active` follow-on so per-chain brand colors survive (not stomped to primary).
  More robust than relying on the fragile cross-file cascade.
- **Scrim, not a rewrite of outside-close (Part B3).** Audited `handleClickOutside`
  (app.js:1254): it tests `.filter-dropdown-container`, a class rendered NOWHERE, so today any
  outside click closes (works, but implicit). Left that effect intact (belt-and-suspenders) and
  added a real `.filter-dropdown-scrim` element as the visible + robust close affordance —
  minimal surface, no refactor of the existing handler.
- **Category-tab icons removed by dropping the `navIcon(icon)` call only** — `NAV_ICONS`,
  `navIcon`, and the `CATEGORY_TABS.icon` field are RETAINED (the 4 filter pills still use them).
  Smallest diff; no data-structure churn.
- **No new strings** → `translations.js` untouched (EN/KO parity trivially preserved).

## Territory finding (future rendered tests)
`home.html` loads `style.min.css` async via `media="print" onload="this.media='all'"`. In
headless Chromium that `onload` swap is racy/unreliable (didn't fire within 10s), so computed
styles came back unstyled. `test_filter_dropdown_polish.js` deterministically activates the
print-media stylesheet (`link.media='all'`) after load — exactly what the browser's onload does —
then waits for `.google-header-sticky` to be `position: fixed` before probing. `test_nav_rail_ia.js`
passes its one CSS-dependent assertion by timing luck; left untouched since green. Candidate
follow-up: apply the same deterministic stylesheet-activation to other CSS-probing rendered tests.

## Out of scope (explicitly deferred)
- The raw-key flash the human saw ("navFilterChains") — the BACKLOG row itself scopes this OUT
  (transient deploy cache-skew, self-heals on revalidate; content-hashed asset filenames or a
  humanized-key `t()` fallback would prevent recurrence). Not built here.

## Piggybacked human hotfix (NOT part of 111 — see LOG)
Same push carries a one-rule CSS fix the human surfaced live during this session: the pool-detail
"The Long Game" projection card (`.metric-card-simple.animate-on-mount`) was flash-then-hidden
(inherited base `.animate-on-mount{opacity:0}` with no `both`-fill-mode entrance rule of its own).
Added `.metric-card-simple.animate-on-mount { animation: fadeInScale … both; }`. Verified live:
computed opacity 0→1, card visible (~120px) after animations settle. Entangled in `style.min.css`
(single generated artifact) so it could not be split into a separate commit.
