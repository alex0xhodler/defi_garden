# Garden Planner v2 — Surgical Redesign Spec

This document is the single source of truth for the v2 changes. It describes BEHAVIOR and INTENT.
The implementer decides mechanism, with these non-negotiables:

## Non-negotiables (apply to every change)
- TRUST RAILS: every displayed number derives from live DefiLlama pool data through sanity filters. Anomalous pools (total APY > 1000%) can never enter a plan. No invented numbers, ever.
- Styling exclusively through existing design tokens (--neuro-shadow-*, --neuro-radius-*, color/spacing/typography vars). No new accent colors, no glows, no bounce easing.
- All number formatting pinned en-US. All user-facing strings through translations.js, EN + natural KO, both updated together.
- prefers-reduced-motion respected for every new animation. Flawless at 360px / 768px / 1280px. Dark mode perfect.
- Surgical diffs: prefer targeted edits to planner.js/planner-styles.css/translations.js over rewrites. Existing working behavior (presets, persistence, share, theme/lang) must keep working.
- EXISTING SEO URLS ARE SACRED: every parameterized URL (/?token=…, /?chain=…, /?pool=…, ?lang=…) must keep serving the analytics app exactly as today. Thousands of sitemap URLs depend on this.

---

## 1. Goal architecture — "Two horizons"

Replace the current five goals with a two-tier system. Goals are no longer cosmetic labels; each goal carries a PLAN ARCHETYPE that changes the questions asked and the artifact shown.

### Tier 1 — Long-term (growth archetype) — keep exactly 2:
- 🌳 Retirement
- 🏡 A home

### Tier 2 — In-reach (target archetype) — concrete, trend-aware, priced:
- 🤖 My Claude subscription — $20/month recurring target (SUBSCRIPTION archetype, see below)
- 👟 Fresh sneakers — $180 one-time target
- 📱 New iPhone — $1,200 one-time target

Free-text input stays, mapping keywords to the nearest goal (sneakers/shoes/nike→sneakers, claude/chatgpt/ai/subscription→claude, phone/iphone→iphone, house/home/apartment→home, retire/pension/old→retirement). Unmatched → warm nudge (existing behavior).

### The three plan archetypes and their natural questions:
1. GROWTH (retirement, home): "How much will I have?" → future-value projection (current model).
2. TARGET (sneakers, iPhone): "When will I have it?" → the engine computes TIME-TO-TARGET from monthly amount + blended rate. The horizon question is SKIPPED entirely (one less step = faster wow). Artifact hero = a date ("Yours by March 2027") + a progress framing ("yield chips in $6 of the $180").
3. SUBSCRIPTION (Claude): "When does my money pay the bill by itself?" → two numbers: (a) the FOREVER NUMBER — capital needed so monthly yield ≥ $20 at the blended rate (e.g. ≈ $4,400 at 5.5%), and (b) at the chosen monthly contribution, the DATE the user reaches it ("from August 2028, your yield pays for Claude — forever"). This framing is the most shareable thing in the product; treat it as a first-class artifact mode, not a variant of growth.

Honest math note for all target/subscription modes: time-to-target uses the same compounding model; round dates to the month; if target is reachable in < 1 month, celebrate that plainly ("you could just buy these today — or let yield pay for them by …").

## 2. Contextual steps (amount + horizon adapt to the goal)

### Step 2 — monthly amount:
- Chips contextual to archetype: in-reach goals → $10 / $25 / $50 / $100 + custom; long-term → $100 / $250 / $500 / $1,000 / $2,500 + custom.
- COMPOUNDING EXPLAINER (user-requested): one warm line under the question, plus a live teaching micro-interaction: when the user hovers/focuses an amount chip, a small line updates showing what that amount becomes and how much of it is interest, e.g. "≈ $10,600 in 5 yrs — $1,600 of that is your money working, not you." The copy teaches "early money works longest" without a lecture. Keep it one line, animate value changes gently, reduced-motion = static swap. EN + KO.

### Step 3 — horizon (GROWTH archetype only; skipped for target/subscription):
- Crypto-honest maximum: 10 years. Chips: 1 / 2 / 3 / 5 / 10 years + slider capped at 10.
- Copy adjusts: drop "No rush — longer is gentler on you" implication of 30-year horizons; new copy acknowledges crypto's time horizon honestly (e.g. "How long can it grow? In DeFi, we plan in seasons — up to 10 years.").
- All existing presets (tomoko 25y, kevin 13y) must be re-fit to ≤ 10 years (tomoko → 10y, kevin → 10y; update story page numbers accordingly via generate-stories.js regeneration).

## 3. Strategy personas (replaces "temperament")

Rename the step and the three options to real DeFi archetypes with honest mechanics. Question copy stays warm ("Last thing — where should your money work?").

1. 🏦 ESTABLISHED STABLECOIN YIELDS — stablecoin pools on battle-tested lending/staking protocols, TVL ≥ $50M. Copy: steady 3–8%, boring on purpose. Risk line: depeg + contract bug, low odds never zero. (= current "Sleep well" filter, renamed.)
2. 🏛️ RWA & FRESH ENTRIES — tokenized treasuries / real-world-asset yields and newer-but-credible entries. Implement via a curated project allowlist (e.g. ondo, maple, centrifuge, goldfinch, openeden, midas, spiko, hashnote — verify each exists in the live pools data and adjust; keep the list a named constant) plus fallback criteria TVL ≥ $10M, APY ≤ 20%, non-anomalous. Copy: "TradFi yields moving onchain — the fastest-growing corner of DeFi." Risk line: newer instruments, issuer/regulatory risk, thinner history.
3. 🔥 DEGEN LPs — high-APY LP farms, TVL ≥ $10M, sanity cap applies. HONESTY REQUIREMENT (differentiating detail): the copy must say these rates are real today and typically last days-to-weeks, requiring active farm-hopping. The projection for this persona must NOT compound the headline APY across years: apply a visible haircut (project at 1/3 of the blended headline rate) and SAY SO in the artifact ("projected at a ⅓ haircut because farm rates decay — headline today: X%"). A degen plan that pretends 480% compounds for 5 years would violate the trust principle.

Default pre-selection by goal: in-reach goals pre-highlight Established Stablecoins (user can still pick anything; degen shows its warning prominently).

## 4. The Bloom — rebuilt information hierarchy (the paramount screen)

### Known bugs to fix FIRST (reproduce, root-cause, then fix — no symptom patches):
- P0: the bloom/report can fail to appear directly; the user reports seeing it only after clicking a pool and returning. Reproduce both entry paths (fresh flow completion AND plan.html revisit with saved plan) and root-cause the state/render issue.
- P0: the free-text "Ask anything" box is a dead end (input produces nothing useful → user feels stuck). See §6.

### New hierarchy, top to bottom (rebuild the bloom layout to this order):
1. HERO ANSWER — one line answering the archetype's natural question (see §1), count-up animation. Sub-line: honest comparison (growth: "vs $X in a 0.5% savings account"; target: "yield contributes $Y of the $180"; subscription: "the forever number: $4,400"). The compact plan summary (goal/monthly/years/persona) moves OUT of prime position — render it as a single slim editable strip directly under the hero (each item tappable to jump back and change that answer).
2. INTERACTIVE CHART (user-requested): pointer/touch scrubber with crosshair: hovering or dragging shows a tooltip with month+year, garden value, bank value, and cumulative interest earned. Keyboard accessible (left/right arrows move the scrubber). Touch: drag anywhere on the chart. Milestone markers on the curve: target-hit flag 🎉 (target archetype), forever-number crossing (subscription), each year tick subtle. Reduced motion: tooltip works, no draw-in animation.
3. MAKE-IT-YOURS ROW — replace bare what-if chips with two compact sliders that morph the chart and hero LIVE: monthly amount and (growth only) years. Keep the existing quick chips (+$200/mo etc.) as one-tap presets above/beside the sliders; "Safer/Bolder" become persona switch pills showing the three personas. This is the screen's play loop — it must feel instant (<100ms recompute) and tactile.
4. PRIMARY CTA — the explicit next action, currently missing: a prominent "Start growing on <top pool's project> →" button deep-linking the best pool (/?pool=<id>), with the standard "Opens protocol • Wallet required" microcopy. The user must never wonder "now what?".
5. ENGINE ROOM — the three pools reframed with a heading like "The engine behind this plan" + the blended rate badge. Cards stay compact; each links to its pool page.
6. ASK BOX — see §6. Always renders suggested-question chips so it never looks like a free-form LLM input that doesn't respond.
7. SHARE + GARDEN — see §5.
Disclaimer line stays at the bottom of the artifact.

## 5. My Garden — gamification + virality (Hook model, no dark patterns)

### Always-reachable garden (fixes "I can only see it via pool → back"):
- Persistent "🌱 My garden" affordance in the planner header whenever a saved plan exists, opening the Garden Report directly.
- plan.html revisit with a saved plan already opens the report (verify this works — see P0 above).
- The analytics app's homepage planner entry becomes plan-aware: with a saved plan it reads "🌱 Your garden — ≈ $10,600 by 2031 →" instead of the generic question.

### Garden Report = the gamified hub (rework):
- GARDEN STAGE visual: seed 🌱 → sprout 🌿 → sapling 🪴 → tree 🌳, derived from honest progress only: % of time elapsed on plan + (target archetype) % of target reached. No streaks, no manufactured urgency.
- Since-last-visit story: per-pool rate deltas (↑↓, already specced) + one summarizing line ("rates moved in your favor — you're ~2 weeks ahead of plan").
- Milestone celebrations: when a return visit crosses a projection milestone (25/50/75/100% of time-to-target, or each $1k projected for growth), one tasteful celebratory beat (confetti-free; the garden visual grows + a line of copy). Reduced-motion safe.

### Shareable plan URLs (the viral loop — zero backend):
- Encode any plan into URL params: plan.html?goal=sneakers&monthly=50&pace=stable (and years for growth). Opening such a link fast-forwards into the bloom with those values pre-filled and an intro line ("Someone shared their garden — make it yours."), WITHOUT overwriting the visitor's own saved plan unless they act.
- The share button output (PNG card 2.0) includes the hero answer, the garden stage visual, and the short link text "defi.garden/plan". Also add a "Copy link" share option alongside the PNG that copies the parameterized URL. Native share sheet (navigator.share) when available.
- Keep existing presets (?preset=tomoko…) working; they are just named shorthands for the same mechanism.

## 6. Ask box — kill the dead end
- v1 stays deterministic. Render 3–4 suggested-question chips under the input at all times ("Is this safe?", "What if rates drop?", "What's the catch?", archetype-specific: "What if I stop depositing?").
- Curated answers: write honest, warm, plain-language answers for ~8 patterns (safety, rate drops, the catch, stopping deposits, withdrawing early, what's APY, why these pools, is this advice). Pattern-match generously (keywords + synonyms).
- Unmatched input must ALWAYS produce a response: warm acknowledgment + the suggested chips ("I'm a gardener, not a guru — here's what I can answer well:"). Never silence.
- Keep the provider interface so a real LLM can replace the deterministic provider later.

## 7. IA swap — planner becomes the default feature
- Bare `/` (no query params): the user gets the Garden Planner experience.
- Any content params (token/chain/pool/poolTypes/protocols/minTvl/minApy): the analytics app, pixel-identical to today. ?lang must work for both.
- Mechanism is the implementer's choice under these constraints: no perceptible flash/redirect-loop, no SEO breakage, no double-loading of both app bundles. A minimal early inline router in index.html that loads exactly one experience is acceptable; an instant client-side replace to /plan.html is an acceptable v1 fallback if flash-free.
- Planner header (top right): an icon button (📊 or magnifier, neumorphic circle, consistent with existing detail-header buttons) linking to the analytics app's search home (/?view=search or equivalent that renders the app homepage despite the bare-path rule — implementer picks a clean param, e.g. /?app=1, and the router must honor it).
- The analytics app keeps its planner entry card (now plan-aware, §5).
- Update canonical/OG metadata accordingly: / canonical describes the planner; the analytics app pages keep their existing SEO behavior. Regenerate sitemap if URL roles change.

## 8. Verification bar (prod-ready = all pass)
1. Reproduce-then-verify both P0 bugs fixed (direct bloom render; ask-box never dead-ends).
2. Playwright E2E: all three archetypes end-to-end (growth with horizon; target skipping horizon; subscription forever-number), contextual amount chips per goal, compounding hover line, persona filters return real pools for all three personas (RWA allowlist verified against live data; degen haircut visible in copy), interactive chart scrubber (mouse + keyboard), sliders morph live, primary CTA deep-links top pool, share PNG + copy-link with parameterized URL, shared-URL open pre-fills without clobbering saved plan, My Garden header entry, garden report stages + deltas, IA swap (bare / = planner; /?token=USDC = app; /?pool=<id> = app; analytics icon from planner reaches app home), dark mode, 360px, KO.
3. Syntax checks all changed JS; grep checks (tokens-only styling, en-US locale, sanity cap intact).
4. Screenshots of every key state reviewed critically against the SOTA mandate; iterate until they look the part.
5. generate-stories.js re-run after preset horizon changes; stories committed.
