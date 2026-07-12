# 054 — build notes

No deviations from spec. Implemented exactly as written:
- `home.html`: added `preconnect` for `https://unpkg.com` (with `crossorigin`, matching the existing `crossorigin` React script tags) and `https://yields.llama.fi` (no `crossorigin` — uncredentialed `fetch()`), directly before the existing `dns-prefetch` pair. `dns-prefetch` untouched.
- `plan.html`: same two `preconnect` lines added directly before its existing `dns-prefetch` pair. Existing `preload` tags for the React UMD bundles and `dns-prefetch` untouched.

Diff: 4 lines added, 0 removed, both files.

## Verification

- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js` — all 190 assertions pass, exit 0.
- `node test_smoke.js` (Playwright, both router paths, 3 viewports) — 1 JSON-LD assertion passes; all render assertions (planner UI, pool cards) time out. Root cause confirmed network, not regression: `curl` to both `https://unpkg.com` and `https://yields.llama.fi` returns `CONNECT tunnel failed, response 403` in this sandbox (proxy blocks both hosts outright). Same precedent already documented for 040/044/045/051/052/053 — a 4-line resource-hint addition cannot cause a network-layer block, and the identical timeout signature (waiting on `#planner-root` / `.pool-card`) is the pre-existing sandbox limitation, not a new failure mode.
- Needs human visual spot-check on next live run (same as the precedent items above) to confirm `preconnect` doesn't trigger any browser warning and both router paths still render — but per NORTH_STAR.md's render-path advisory, this is post-merge, not a gate.
