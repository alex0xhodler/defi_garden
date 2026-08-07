# 225 screenshots — the human pre-merge review artifact

`before/` = branch parent `979af4f2a1` (two design eras). `after/` = this branch.
24 images each: `{landing,planner,grid,pool}-{360,768,1280}-{light,dark}.png`, 900px tall viewport.

Captured by `capture-shots.js` (committed here so the set can be regenerated and audited).

## Read this before trusting a screenshot in this folder

The FIRST `after/` set shipped in this PR was **wrong for 12 of its 24 images** — every `grid-*` showed
`"Loading live pools…" / 0 results` and every `pool-*` showed the landing page — and it was caught by
the verifier, not by the capture. Two separate defects produced it:

1. **The capture asserted nothing.** v1 waited a fixed 2.5s and screenshotted whatever was on screen, so
   a loading state or a router fallback was indistinguishable from a rendered surface. v2 waits for a
   per-surface selector that only exists once real content has painted (`.pool-card`,
   `.pool-detail-container`, `.gp-chip`), counts the grid's cards, and records a **hard capture failure**
   instead of writing an image it cannot vouch for. `page-errors.txt` now carries both page errors and
   capture failures; the current set reports `none` for both.
2. **The committed snapshot went stale mid-session.** `app.js`'s `SNAPSHOT_MAX_AGE_MS` is 6 hours;
   `data/pools-snapshot-meta.json` was generated at `16:23Z`, so captures after ~22:23Z fell through to
   the live `yields.llama.fi` endpoint, which is blocked in this sandbox — hence the permanent loading
   state. The earlier captures in the same session, taken while the snapshot was still fresh, rendered
   fine, which is exactly why the regression looked invisible. v2 routes
   `data/pools-snapshot{,-meta}.json` and `https://yields.llama.fi/pools` from the **committed snapshot**
   (the repo's established fixture pattern, per the 2026-07-12 standing decision on sandbox networking),
   so the render no longer depends on wall-clock time.

Method note for a fair comparison: `before/` was captured before the routing was added — it did not need
it, because the snapshot was still inside its 6-hour window at that moment. Both sets therefore render
the same real committed pool data through the real product code; only the delivery path differs.
