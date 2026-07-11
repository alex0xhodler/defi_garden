# Notes: spec 024 — working link promoted to primary share CTA

## What shipped
`planner.js`'s `sharePromptElement` (the only bloom-moment share surface, per spec 005): swapped which action gets the `.gp-share-btn` (raised, primary) class vs `.gp-share-textlink` (demoted) class. The working-link action (`doNativeShare` when `navigator.share` exists, else `doCopyLink`) is now primary; the image action (`doShare`) is now the demoted text link. No handler logic changed — only which element wears which CSS class, plus 3 new EN+KO copy keys (`shareLinkPrimaryCta`, `shareLinkPrimaryNative`, `shareTextLinkImage`) and an updated code comment recording the 2026-07-11 reversal of spec 008's decision.

## Environment blocker found and worked around (read before parking a future item on the same wall)
This session's sandbox network policy is stricter than CLAUDE.md's "external font/analytics fetches fail locally (ignorable)" note assumes: the agent proxy (`curl $HTTPS_PROXY/__agentproxy/status`) shows `connect_rejected/403` for **unpkg.com** (React itself, loaded via CDN `<script>` tags in `plan.html`/`home.html`), not just `yields.llama.fi` and analytics/font hosts. That means `node test_smoke.js` and any plain Playwright run against this repo in this exact session type cannot reach the bloom moment at all — `window.React` never exists, so nothing mounts. This is a strictly worse case than what 021/027 documented (those assumed a browser-with-network gap only in the pools-data fetch).

**Workaround used for verification only** (does not touch shipped code): route two requests in the Playwright `BrowserContext`:
- `https://unpkg.com/react@18/umd/react.production.min.js` and the `react-dom` equivalent → fulfilled from the locally npm-installed `react@18.3.1`/`react-dom@18.3.1` UMD bundles (`node_modules/react/umd/react.production.min.js`) — byte-identical to what `unpkg.com/react@18` resolves to for the same pinned major version.
- `https://yields.llama.fi/pools` → fulfilled with a small structurally-real fixture (same shape as `test_planner.js`'s pool fixtures: `pool/symbol/project/chain/apyBase/apyReward/tvlUsd`), so the app's real, already-unit-tested `curatePools`/`blendedApy` pipeline runs instead of hitting the "Failed to load yield data" error branch (`planner.js` ~4072-4073, gated on `loadStatus`).

With those two routes in place, the real `planner.js` runs against a real DOM. Verified with a throwaway script (not committed — scratchpad only, deleted before commit): 15/15 checks green across both layouts that render `sharePromptElement` (subscription archetype at `gp-bloom-checkout` ~2601-2606, target/growth archetype ~2617), both 1280px and 360px, light and dark, and both the clipboard-copy branch (default Chromium, no `navigator.share`) and the native-share branch (stubbed `navigator.share` via `context.addInitScript`). Also confirmed visually via a full-page screenshot (share hub shows "🔗 Copy your garden link" as the raised primary button, "or save as an image" as the plain text link beneath it, matching the spec).

If a future loop hits the same `test_smoke.js` launch failure ("Executable doesn't exist at .../chromium_headless_shell-1228") — that's a separate, unrelated issue: the environment's pre-installed Chromium is revision 1194 but the freshly-`npm install`ed `playwright` package (1.61.1) expects revision 1228. Fix: `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })` (a working symlink to the 1194 binary) rather than downloading a matching browser.

## Deviations from spec
None. All acceptance criteria met as written; no scope changes beyond what spec 024 called for.

## Acceptance criteria — evidence
- Primary `.gp-share-btn` triggers the link action, demoted `.gp-share-textlink` triggers the image action: confirmed structurally (button text/class assertions) and by clicking (clipboard/`navigator.share` payload) in both archetypes.
- Link round-trip: unchanged — `encodePlanToUrl`/`decodePlanFromUrl` untouched; the clipboard content captured in verification matches the URL query-param contract those functions already use, and 007's arrival-banner path (which decodes it) is exercised implicitly since the growth-archetype test URL itself round-trips through `decodePlanFromUrl` to reach bloom.
- `share_link_created` firing: handlers (`doCopyLink`/`doNativeShare`/`doShare`) are byte-for-byte unchanged other than being reattached to swapped elements — analytics call sites untouched (see diff).
- EN+KO shipped together: `translations.js` both locale blocks updated in the same commit.
- No new colors/effects: only existing `.gp-share-btn`/`.gp-share-textlink` classes and `t()`-sourced copy; confirmed by diff review, not a new CSS rule was added.
- `node --check planner.js`, `node --check translations.js`: clean. `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js`: 190/190 assertions + parsing suites pass, exit 0.
