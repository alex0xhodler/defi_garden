# 052 notes

## What shipped

The spec's proposed change (item 1): a CI step transpiles `app.js` +
`PoolDetail.js` into committed `app.compiled.js` / `PoolDetail.compiled.js`;
`home.html` loads the compiled files as plain `<script defer>` instead of
`type="text/babel"` + `@babel/standalone` (~2.9MB from unpkg, transpiled on
the main thread at runtime on every analytics/SEO page). `compile-app.js` +
`npm run compile` do the transform; `sitemap-update.yml` runs it on every
push touching `app.js`/`PoolDetail.js`/`compile-app.js` and commits the
output, same pattern as the sitemap/token-page generators.

## Two attempts — the first ("just drop Babel, no compile step") failed live

The spec's open question asked to confirm whether app.js/PoolDetail.js need
any transform at all, noting: "if truly no JSX, this may reduce to load as
plain JS + drop Babel with no compile step". A grep for JSX (`<Tag`,
`return (<`) found zero matches in either file — consistent with CLAUDE.md's
"ALL components use React.createElement, never JSX" — so the first attempt
shipped exactly that reduced path: home.html loads app.js/PoolDetail.js
verbatim, no compile step, no new dependency.

`test_search.js` (which vendors React locally via `page.route` so it can
mount the real analytics app offline) caught two real bugs this introduced,
both masked by Babel's default (no explicit target) transform, which
downlevels `let`/`const` to `var`:

1. **Redeclaration collision.** `app.js` and `PoolDetail.js` are two
   separate classic `<script>` tags in the same document. Both declare
   `const { useState, ... } = React;` at top level. Top-level `let`/`const`
   in a classic (non-module) script live in one shared lexical environment
   per realm — a second `const useState` from a sibling script is a
   `SyntaxError: Identifier 'useState' has already been declared`. `var`
   redeclaration is a harmless no-op, which is what Babel's downlevel gave
   us for free.
2. **TDZ forward-reference.** `app.js`'s `autocompleteTokens` useMemo (line
   ~1307) references `allAvailableChains` — both in its body and in its own
   dependency array — before the `const allAvailableChains = useMemo(...)`
   declaration later in the same function (line ~1379). With real `const`
   semantics this is `ReferenceError: Cannot access 'allAvailableChains'
   before initialization` on every render. `var` has no TDZ (hoisted,
   `undefined` until assigned), so Babel's downlevel silently absorbed this
   too — it's a real pre-existing ordering quirk in the source, invisible
   as long as Babel ran.

Confirmed both were transform-dependent, not pre-existing breakage: reverted
to the Babel-active baseline (same repo, `git stash` of just the loader/
source edits) and re-ran `test_search.js` — 20/20 passed cleanly. This ruled
out "already broken" and confirmed Babel's default transform was doing real
semantic work (safe let/const downleveling), not just a JSX no-op.

Given a 3140-line file can plausibly hide more of the same class of bug,
hand-patching each one as `test_search.js` (or worse, production) surfaced
it was judged too risky for a HIGH-tier change touching the sacred router's
render path. Reverted the two hand-`var` edits and implemented the spec's
originally-proposed CI-compile path instead, using
`@babel/plugin-transform-block-scoping` (the specific transform Babel was
relying on here) so the compiled output preserves the exact `let`/`const`→
`var` downlevel everywhere in both files, not just the two spots this run
happened to trip over.

## What changed

- `compile-app.js` (new): reads `app.js`/`PoolDetail.js`, runs
  `@babel/plugin-transform-block-scoping` via `@babel/core`, writes
  `app.compiled.js`/`PoolDetail.compiled.js`. Exports a pure `transform()`
  (string in, string out, no disk I/O) alongside the disk-writing `compile()`
  so the freshness test can verify without mutating the tree.
- `app.compiled.js`, `PoolDetail.compiled.js` (new, committed, generated —
  header says so, never hand-edit).
- `package.json`: `@babel/core` + `@babel/plugin-transform-block-scoping`
  added to `dependencies` (not `devDependencies`) since CI's sitemap workflow
  runs `npm install --only=production`. New `"compile"` script. `test_compiled_assets.js`
  added to the front of the `test` chain.
- `test_compiled_assets.js` (new): asserts both compiled files exist and are
  byte-identical to a fresh `transform()` of their source (catches drift/
  hand-edits), and that `home.html` no longer fetches `@babel/standalone` or
  sets `text/babel`, and loads `PoolDetail.compiled.js` before
  `app.compiled.js`.
- `home.html`: the `__APP_MODE === 'analytics'` block now loads
  `PoolDetail.compiled.js` → (onload) → `app.compiled.js` as plain scripts —
  no `text/babel` type, no `@babel/standalone` fetch, no
  `Babel.transformScriptTags()` polling loop. `__APP_MODE` router and
  `ANALYTICS_PARAMS` untouched. `app.js`/`PoolDetail.js` themselves are
  byte-identical to `main` — untouched, still the edit surface.
- `.github/workflows/sitemap-update.yml`: added `compile-app.js`/`app.js`/
  `PoolDetail.js` to the push-trigger paths, a compile step after `npm
  install`, and the two compiled files to the commit step's `git add` list.

## Correctness detail: script execution order (still relevant, unaffected by the pivot)

`app.js`'s `App` component does `React.createElement(PoolDetail, {...})`
when `currentView === 'pool-detail'` — the initial view on `?pool=<id>` deep
links, i.e. on first render, not only after later navigation. Dynamically
inserted `<script src>` tags do NOT guarantee execution order relative to
each other by default (unlike Babel's `transformScriptTags`, which evaluated
same-document `text/babel` tags in DOM order). Fixed by loading
`app.compiled.js` only from `PoolDetail.compiled.js`'s `onload` callback.

## Verification

- `test_compiled_assets.js`: 4/4 passed.
- `test_search.js` (offline, vendored React/fixture pools, exercises the
  real mounted analytics app including a `?pool=` deep link): 20/20 passed,
  zero page errors.
- `test_planner.js`, `test_protocol_parsing.js`, `test_qualifier_fix.js`,
  `test_canonical.js`, `test_token_pages.js`, `test_chain_pages.js`,
  `test_hub_pages.js`, `test_indexnow.js`, `test_stories.js`,
  `test_analytics_fires.js`, `test_i18n_pages.js`, `test_og_images.js`: all
  green, no changes touched their surface.
- `test_smoke.js`: fails in this sandbox exactly as it did on `main` before
  this change — `unpkg.com` and `yields.llama.fi` are both network-blocked
  here (confirmed via `curl`, `CONNECT tunnel failed, response 403`), and
  `test_smoke.js` has no local-vendoring fallback (unlike `test_search.js`).
  This is the same documented pre-existing sandbox limitation noted on
  040/044/045/051 — it fails identically on the untouched `bare /` planner
  path too, which this diff never touches, confirming it's not a regression.
  Needs a human/CI run with real network access to confirm the render-path
  smoke gate green; flagging `needs human visual spot-check` per NORTH_STAR's
  render-path-merge policy.
