# Restartable Agent Handoff: TimesFM DeFi Score & Underwriting Infrastructure

**Date**: September 12, 2026  
**Branch**: `feat/timesfm-defi-score`  
**Base**: `origin/main`  
**Last Commit**: `6efadd72457` (`feat(ui): update underwriting slide to straight-edge quiet styling and remove emojis`)  

---

### 1. Current Goal
Ship the institutional quantitative underwriting layer to DeFi Garden:
1. Integrate TimesFM 3.0 predictive yield forecasting and 4-pillar DeFi Health Score (0–100 AAA).
2. Clean up UI noise across the pool detail hero and landing page in adherence to the Quiet design system (straight-edge certificate cuts, zero emojis, unified switcher buttons, in-flow footer).
3. Present the new underwriting intelligence as the default first slide on the landing page, linking to `/?chain=Popular&minTvl=10000000&minApy=5`.
4. Document the next architectural phase utilizing the Herd.eco MCP server for deep on-chain vault analytics (Andrew Hong playbook).

---

### 2. Changes Made in This Work Session
- **Sorting & Metrics Cleanup**:
  - Removed `'Risk'` (`sortBy === 'sharpe'`) sorting toggle from desktop (`sort-toggles` header) and mobile drawer (`sort-segment-row`).
  - Renamed the sort toggle label from `'DeFi Score'` to **`'Score'`** (`t('sortByScore')`, EN `Score`, KO `점수`).
  - Repositioned the row `pool-score-chip` in both table and grid views: moved out of `.pool-tvl-section` into `.pool-symbol-line` directly alongside the pool symbol (`STETH [Score 91]`). Removed the `3px` vertical misalignment offset, preventing truncation of protocol strings and eliminating card clipping on mobile.
- **Pool Detail Hero Refinements**:
  - Moved the institutional underwriting strip from order 0 (floating awkwardly above the title) down to `order: 6`, placing it below the honesty note and trust badges, right before the action counterfoil.
  - Removed `"AI"` from `'14d AI Forecast'` -> now **`'14d Forecast'`**.
  - Suppressed duplicate floor reporting when forecast and floor are identical (e.g. `14d Forecast: 3.57% · Stable Downside`).
  - Removed duplicate `Risk Assessment: Low` badge when `Score: 92 (AAA)` is present, and formatted score as an integer (`Math.round(score)`).
  - Repositioned the **Yield-Funded Virtual Card Terminal** as the final card on the `?pool=` page view (below Pool Information).
- **Landing Page 3-Slide Architecture & Quiet Styling**:
  - Built Slide 0 as the new **Default First View**: **Predictive Underwritten Yields**, linking directly to `/?chain=Popular&minTvl=10000000&minApy=5`.
  - Replaced all curved/pill elements on Slide 0 with straight-edge certificate styling (`border-radius: 2px`).
  - Removed all emojis (`🛡`, `📈`, `🤖`, `✓`) across badges, metrics, and labels.
  - Structured the right-hand Underwriting Terminal into an institutional certificate ledger (live tabs for `USDY`, `SUSDS`, `USDC`, `STETH`, 4-pillar breakdown, capacity depth, and jump link).
  - Slide 1: Virtual Visa Card Spotlight (*Never pay for subscriptions again*).
  - Slide 2: Live Yield Rates & Savings Discovery (`#seo-content`).
  - Fixed scrolling: native vertical scroll is completely uninhibited; panel swapping only triggers on intentional horizontal trackpad gestures (`deltaX > deltaY * 1.5`), keyboard arrows, or dot clicks.
  - Fixed footer and dots: footer is static at the bottom of the content on mobile, and neatly separated at the bottom of desktop with the 3 dots floating 12px above it (zero overlap).
- **Design System Harmonization**:
  - Unified theme and language switchers across **all** surfaces (Home, Planner, ?pool=, Search) to an identical $40 \times 40\text{px}$ footprint with **`8px` border radius** (`var(--ui-radius-sm)`).
- **Herd.eco MCP On-Chain Underwriting Blueprint**:
  - Authored `docs/herd-mcp-onchain-underwriting.md` establishing the Andrew Hong playbook (Whale Concentration / HHI, Capital Dwell Time, Atomic Cash Headroom, and Governance Key Topology).

---

### 3. Verification Evidence
- **Automated Test Suites (All Green)**:
  - `node test_compiled_assets.js` — 4/4 assertions passed.
  - `node test_minified_assets.js` — 9/9 assertions passed.
  - `node test_default_sort.js` — 4/4 assertions passed.
  - `node test_zero_yield_demote.js` — 17/17 assertions passed.
  - `node test_smoke.js` — 13/13 assertions passed (360px, 768px, 1280px).
  - `node test_landing.js` — 9/9 assertions passed.
- **Visual Evidence Verified via Playwright Headless Screenshots**:
  - `/tmp/slide-0-straight-dark.png` — straight edge, zero emojis, clean 3-dot pagination clear of footer.
  - `/tmp/slide-0-straight-light.png` — light mode certificate vellum styling verified.
  - `/tmp/slide-0-straight-mobile.png` — mobile stacked layout with straight badges and single CTA.
  - `/tmp/pooldetail-header.png` & `/tmp/planner-header.png` — unified 8px switchers verified across routes.

---

### 4. Untouched Scope
- The quantitative formulas inside `compute-kpis.js` and `compute-forecasts.py` were not altered.
- The underlying DefiLlama data fetchers and cache policies were not modified.
- Existing URL query parameter schemas (`?token=`, `?chain=`, `?pool=`) were preserved byte-untouched.
- The Vercel edge proxy and MCP endpoints (`/mcp`, `/api/health`) were not modified.

---

### 5. Uncertainties
- Whether to auto-rotate the 4 featured pools on Slide 0 or keep them strictly user-switched via the tabs. (Currently user-switched via `USDY`, `SUSDS`, `USDC`, `STETH` tabs for stability).
- Exact production cadence for refreshing TimesFM 3.0 forecasts (currently runs as an automated cron task in `.github/workflows/sitemap-update.yml`).

---

### 6. Open Risks
- **High Traffic on Live Endpoint**: `/?chain=Popular&minTvl=10000000&minApy=5` filters ~6,300 pools down to ~80 pools client-side. The client-side filter is instant (<5ms), but browser performance on low-end mobile devices should continue to be monitored.
- **Herd.eco MCP Integration (Phase 2)**: Adding live RPC calls to the edge Worker must maintain strict timeout budgets (<200ms) or run exclusively in the offline cron ingestion step.

---

### 7. Off-Limits Areas
- **Trust Rails**: Never tamper with `APY_SANITY_LIMIT = 1000%` or `DEFAULT_MIN_TVL = $100K`.
- **Card Handoff Policy**: Do not attempt to reintroduce in-browser card issuance or fake payment terminals. All card onboarding must redirect to `laso.finance` via official partner referral links.
- **Build System**: Do not introduce webpack, vite, or JSX compile dependencies to the root app. The no-build React UMD + Babel standalone runtime architecture is strictly load-bearing.

---

### 8. Last Decision or Gate
- **Decision**: Merged `origin/main` into `feat/timesfm-defi-score`, resolved all 4 conflicting snapshot and llms files, verified all 6 regression test suites green, committed, and pushed cleanly to remote.
- **Terminal State**: Working tree clean, branch up-to-date with `origin/feat/timesfm-defi-score`.

---

### 9. Exactly One Safe Next Action (What the Next Agent Should Do)
**Open the Pull Request from `feat/timesfm-defi-score` into `main` on GitHub** using `gh pr create` or the GitHub web interface, referencing this handoff document and `docs/herd-mcp-onchain-underwriting.md`.

**What the next agent MUST NOT assume**:
- Do **not** assume `landing-styles.css` or `style.css` can be edited without immediately running `node compile-app.js && node minify-assets.js` to refresh the minified bundles.
- Do **not** assume the user wants emojis or rounded pill buttons re-introduced on Slide 0.
- Do **not** start Phase 2 of the Herd.eco MCP integration before PR review and merge of this UI/score foundation.
