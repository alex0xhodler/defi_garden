# Playbook — dual-source logic divergence (a value renders differently on two surfaces)

**When:** a rendered-audit finding shows the SAME derived value (a category badge, a risk tier, a formatted number, a label) rendering CORRECTLY on one surface and WRONG on another — e.g. the analytics grid classifies a pool as "Lending" but the pool-detail hero badge says "Yield Farming" for the same pool (item 130: SUSDS on sky-lending, venus-core-pool).

**Answer in one line:** the two surfaces are running two FORKED copies of the same helper that have drifted; find both, confirm which surface calls which, then collapse to one shared definition (don't just patch the wrong copy — it will drift again).

## Steps
1. **Name the value + both surfaces.** Grid card vs pool-detail hero are the usual pair. Grid render lives in `app.js`; pool-detail in `PoolDetail.js`.
2. **Grep for the helper in BOTH files**, e.g. `grep -n "getPoolType\|<lists it uses>" app.js PoolDetail.js`. Two definitions of the same-named/same-purpose function = confirmed fork. Decision rule: if only ONE file defines it and the other imports/calls a global, it's not a fork — look elsewhere.
3. **Diff the two copies' logic**, not just their data. Item 130: `app.js:193` `getPoolType` had 5 category lists + RWA/Yield-Derivatives ordering + `.replace(/\s+/g,'-')` normalization; `PoolDetail.js`'s inline copy had a 7-entry lending list, no RWA/YD, `.toLowerCase()` only. The narrower copy is usually the stale one.
4. **Also check the DATA lists for a gap present in BOTH** — item 130's `sky-lending` was missing from app.js's list too, so that pool was wrong on BOTH surfaces (grid included). Fix the shared list once.
5. **Collapse to one source.** Pick the file that loads FIRST as the owner (home.html script order: `PoolDetail.compiled.min.js` runs before `app.compiled.min.js`, so PoolDetail can own a global the later app.js calls). A top-level `function name(...)` declaration is a cross-script global AND survives terser (`mangle:true` without `toplevel:true` preserves top-level names — same reason the global `PoolDetail` works). The second-loaded file delegates: `const x = (a) => sharedX(a);`. Verify the owned list-consts have NO other callers before deleting them (`grep -n CONST_NAME file.js`).
6. **Rebuild:** `npm run compile && npm run minify` (source app.js/PoolDetail.js are the edit surface; home.html ships the `*.compiled.min.js`). Commit the regenerated outputs. Confirm the shared name survives: `grep sharedName *.compiled.min.js`.

## Resolution
One classifier, both surfaces delegate. Acceptance = rendered Playwright on `/?pool=<id>` reading the DOM (`.pool-type-badge-hero` textContent), not a unit fixture (2026-07-11 UX-acceptance decision). Assert the primary fix + a regression case + the default/negative case + zero page errors, and re-run the OTHER surface's existing test (grid: `test_category_taxonomy.js`) to prove it's unchanged.

## Traps
- Patching only the surface in the screenshot leaves the fork alive → the bug reappears on the next protocol. Always collapse.
- Cross-script global reachability depends on load order — verify it in home.html and PROVE it with zero page errors on the render (a `ReferenceError` would surface as a page error the acceptance test catches).
- `const` at top level is NOT a cross-script global (spec 044's footgun); only `function` declarations are.

## Provenance
Item 130 (2026-07-24) — pool-type badge mislabel, dual `getPoolType` in app.js + PoolDetail.js. Verifier PASS HIGH 8/8. specs/130.md, specs/130-notes.md.
