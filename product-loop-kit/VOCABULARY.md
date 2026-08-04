# VOCABULARY — the lens inventory

**What the audit's language can express is what the loop can find.** A defect class the checks have no
words for is not "clean"; it is invisible, and it stays invisible no matter how many ticks run. This file is
the honest map: list A is what the loop can currently say, list B is what it cannot say at all.

Read it with `RAZOR.md`: the razor's second side ("no check narrower than the class it guards") tells you how
to widen a lens you own; this file tells you which lenses you do not own yet. Numbers below are from
`signals/audit-findings.json` (`generatedAt 2026-08-04T07:13:34Z`, 83 surfaces) and `audit-app.js` — re-read
both before quoting them; the estate churns daily.

---

## A. Lenses owned — extension, and documented blind spots

**1. Rendered DOM-query checks** (real Chromium, per surface; emitters in `audit-app.js` via `finding()`).
Extension: *a defect whose signature someone already thought to name, expressible as a DOM/text query on a
page the scanner chose to drive.*
`number-sanity` · `dead-end` · `dead-cta` · `degraded-cta` · `dead-pool-empty-state` · `loading-flash` ·
`page-error` · `i18n` (Hangul/raw-key leak) · `responsive` · `empty-table` · `junk-slug` ·
`zero-yield-claim` · `occlusion`.
Blind spots: it can only see what a selector can address; nothing about how the page LOOKS (list B.1), and
nothing on a surface not in the rotation. Rendering conditions are `LENSES = ['360px','dark','ko']` at widths
360/768/1280 — the lens matrix is a property test (`test_audit_funnel_lens.js`), not a name list, per items
199/200/201.
`responsive` specifically = no horizontal body scroll at the surface's own width + the primary CTA's box is
non-zero-area and inside the viewport (the 136 ancestor-clip class); it is gated `s.width <= 768`, so it
asserts nothing at 1280.

**2. The occlusion / hit-test lens** (item 219 leg (a) — the first deliberate vocabulary purchase).
Extension: *any content element covered or click-intercepted by a `position: fixed`/`sticky` element* —
measured at rest (`scrollY = 0`) AND at bottom-of-scroll, at the surface's width × `OCCLUSION_HEIGHT = 780`,
reported only when geometry (`OCCLUSION_MIN_COVERAGE = 0.25`) AND `elementFromPoint` agree.
P0 = an interactive element buried/intercepted · P1 = prose painted over · P2 = advisory (the lens did NOT
look — bottom of scroll unreachable, candidate scan truncated at `OCCLUSION_CANDIDATE_CAP = 800`, or the
check threw).
**Two documented blind spots** (`fixed-overlay-occlusion.md` step 0): overlays covering **≥80% of the
viewport** are excluded, and content covered by a **top-anchored overlay at bottom-of-scroll** is excluded
(revealable by scrolling up — deliberately not flagged). A human report with no matching `occlusion` finding
is a **lens gap, not a clean page**.

**3. Static prescan** — `fs` + regex over every generated leaf page, no render, no network
(`prescan.scanned = 4372`). Signals: `broken-number-literal`, `absurd-magnitude`, `junk-slug`,
`zero-yield-claim`, `link-target-integrity`, `pool-link-liveness`.
Extension: *cheap text-shaped defects across the WHOLE estate, plus the promotion of suspects into the
expensive rendered rotation.* Blind spot: nothing that needs a render or a layout.

**4. Pool prescan** — rail-relative record predicates over the **3,987-pool union**
(`scannedByLeg: snapshot 737 + deepLinkedLive 3,250`; items 206/215). Signals: `apy-rail-breach`,
`mean30d-rail-breach`, `kpi-nonfinite`, `absurd-magnitude`, `missing-tvl`.
Extension: *every record a user can arrive on, checked against the bounds the product itself declares.*
Documented scope limit, stamped into the output: `kpi-nonfinite` applies only to the 737 records carrying a
`kpis` object — live-only deep-linked records are **skipped for that signal, not checked-and-clean**. This
closes PRESCAN coverage only; the render-only classes still reach sub-rail pools solely via the ~32
picks/tick rotation.

**5. Text-surface prescan** — `llms.txt` + `llms-full.txt` (`scanned: 2`). Signals: `apy-rail-breach`,
`broken-number-literal`, `tvl-floor-claim`, `empty-surface`, `link-target-integrity`.

**6. Link integrity, levels 1-3** (`detector-signal-coverage.md`).
L1 **routed** — is the query key one a real consumer reads? (allow-list derived at scan time from the router
arrays + `analytics.js`'s acquisition list, never re-typed — item 203.)
L2 **resolvable** — does the value name a live entity? (`poolLinkLiveness`: `checkedIds 3681`, three run
states `ran`/`unrun`/`not requested`, `scope: 'en'` — the KO half is deliberately not run and says so.)
L3 **non-empty contract** — does the target, under its OWN default filters, return what the linking page
claims? The only level that can see a defect where both surfaces are individually correct.

**7. i18n dictionary scan** — flattened EN/KO key parity + KO value honesty (`scanned: 544`,
`allowlistSize: 24`). Extension: *a KO value with no Hangul and at least one Latin letter, keyed on the KO
side alone* (item 198 — a property of the pair goes silent exactly when the pair drifts). Accepted blind
spot: an untranslated KO value made purely of digits/punctuation.

**8. Trust-claim provenance** (`product-audit.md` class 12) — does the page describe the filter it actually
applied? Extension: *every rendered sentence naming a TVL floor, an APY limit, or "trust filter", plus every
number DERIVED under that claim.* Currently a grep discipline, not a shipped signal.

**9. URL provenance via analytics** (`product-audit.md` class 9) — the prod `page_view`-by-`$current_url`
breakdown, read once per tick. Extension: *surfaces we should never have generated at all* — the one class
`audit-app.js` structurally cannot reach, because it only drives surfaces we hand it.

**10. Signal hygiene** (`product-audit.md` class 13) — every metric claim runs the prod filter AND the
unfiltered control; record both, claim only the filtered one. Extension: *distinguishing a true prod zero
from a filter typo that silently matches nothing.*

---

## B. Known-INEXPRESSIBLE classes — the honest gap list

**1. Pixel / visual-aesthetic quality.** No screenshot-diff lens and no agent judge. Item **219 leg (b) is
NOT built** — model choice, per-tick cost, image storage and verdict reproducibility are all unresolved. So
clipped pills, dead whitespace, misalignment, broken rhythm are invisible: e.g. the `Risk Assessment: Low`
pill overflowing its hero column in the human's 2026-08-03 screenshot, on a day the tick scored 82 surfaces /
0 blocking findings. **A green audit does not mean a human would like the page.**

**2. Semantic honesty of labels.** `product-audit.md` check 8 is explicitly human judgment (category/type
matching the data — SUSDS on sky-lending labelled "Yield Farming"). No predicate exists; flag, never
auto-fix.

**3. Accessibility beyond geometry.** `grep ':focus' audit-app.js` → 0; no ARIA, contrast, keyboard-order,
screen-reader or focus-ring assertion anywhere in the scanner. Focus rings are a CLAUDE.md hard rule enforced
by review, not by any tick.

**4. Performance.** Nothing in the loop measures it. The only readings on record are human-run PageSpeed
one-offs (item 057's "PSI 88 mobile", 2026-07-12); every perf item since (052-056, 073) closed on
functional verification with PSI named as an unmeasured proxy. No budget, no regression rail.

**5. Real-network failure modes.** Only PARTIALLY sampled — and by accident. The sandbox blocks external
hosts, which faithfully samples what an ad-blocker, an upstream outage, a CSP or an early bounce does to a
silently-failing third-party fetch (item **182**: 216 of 741 pools, 29.1% of the north-star surface). Timing,
partial responses, slow-but-succeeding fetches and retry behaviour are unsampled.

**6. Anything requiring an account, a wallet or money.** No end-to-end path exists past the CTA; the loop can
verify a link's destination, never what happens after the user leaves.

---

## The standing weekly question

> **Which inexpressible class do we buy a lens for next?**

Ask it in the improve loop, every week, and price it against the classes that keep recurring by hand.
Precedent: item **219**, the first deliberate vocabulary purchase — a human challenge named the gap ("what is
the user seeing in the browser"), the cheap leg shipped first, and it returned **4 real defects on day one**
(grid-360 P0 unpressable duplicate `.theme-toggle` + P1; landing-768 P1 ×2, proving item 179's class was
still live 20 days after it was "fixed"; grid-token/grid-chain P0+P1 at 1280px), each independently
re-measured outside the check. Buying a lens beats adding a fifth signal to a lens you already own.
