# Notes: 018 — NL search actually works

## Prior attempt on this item (branch `claude/loop-018`, unmerged)

A previous build session already picked up 018, hit the identical network
wall (this sandbox's egress proxy 403s both `unpkg.com` and
`yields.llama.fi`), and parked it as BLOCKED rather than attempt a fix —
reasoning that mocking network data would repeat 017's exact mistake. That
branch also carried forward 017's design: extracting `parseNaturalLanguageQuery`
into a new `search-parser.js` module and wiring a `<script>` tag into
`home.html` (the sacred router file) to load it.

Main's `BACKLOG.md` never picked up that BLOCKED status (the commit marking
it BLOCKED only exists on the unmerged branch), so this session's `git fetch`
+ pickup correctly found 018 still READY per build.md's rule of following
BACKLOG.md's authoritative state — this is a fresh, independent attempt, not
a continuation.

This branch (`claude/loop-018-2`) takes a different, smaller path: fixes are
made in place in `app.js` (no extraction, `home.html` untouched), and the
network blocker is resolved rather than accepted — `test_search.js` probes
reachability first and only substitutes locally when genuinely blocked (see
"Sandbox network limitation" below), which is a materially different claim
than 017's "mocked the parser function directly, never rendered anything."
The prior branch is left as-is, unmerged and undeleted — worth a human
decision on whether to delete it once this ships.

## Root causes found (all in `app.js`, inside `parseNaturalLanguageQuery` and its call sites — no per-string hacks)

1. **The real bug behind "search is still very bad": `availableProtocols` was empty on the very first search.**
   `availableProtocols` (app.js ~1416) only computed protocol stats once a chain
   or token filter was *already* selected. On a fresh page load, before any
   search, both are empty — so `availableProtocols.all` was always `[]` at
   the exact moment `parseNaturalLanguageQuery` ran for the user's first
   query. The parser then silently fell back to its ~26-entry hardcoded
   static protocol list (`Aave`, `Curve`, `Convex`, `Morpho`, ... — no
   `Kamino`). This is why "Kamino lending" — one of the four rotating
   placeholder examples shown to every visitor — could fail while looking
   like a parser problem. Fixed by adding a third branch to the memo: when
   neither a chain nor a token is selected yet, compute across all pools.

2. **Chain parsing only knew ~25 hardcoded aliases**, never checked the
   query against the live chain list it was already given as a parameter.
   "Lending on Plasma" failed because "Plasma" (a real, current chain) isn't
   in the static `chainAliases` map. Fixed by falling back to a direct
   word-boundary match against `allChains` (the live list) when no static
   alias matches. Also hardened the static-alias loop itself to word-boundary
   matching — the old plain `.includes()` meant alias `'op'` (Optimism) could
   misfire inside an unrelated word like "top".

3. **Protocol Method 2's trailing word-boundary re-check was actively wrong**
   for any live friendly name that's a word-fragment. `getFriendlyProtocolName`
   naively title-cases a DefiLlama slug (`kamino-lend` → `Kamino lend`) — a
   truncated, not-a-real-word ending. The old code's `\bkamino lend\b` regex
   requires a boundary immediately after "lend", which "Kamino lend*ing*"
   never has, so it silently failed. Removed the redundant re-check (the
   substring-containment check above it is already sufficient) and added a
   reverse direction: a bare single-word query ("kamino") now also matches
   when it's one of the words making up a longer friendly name.

4. **"kamino lenders" didn't set the Lending pool-type** because the check
   was a literal `.includes('lending')`; "lenders" doesn't contain that
   string. Broadened to a word-boundary stem match, `/\blend(ing|ers?)?\b/`.

5. **Protocol/pool-type-only queries with no chain and no token rendered
   nothing.** Every render/empty-state gate in the file keys off
   `selectedToken || (chainMode && selectedChain)` — "convex", "kamino
   lending" (once #1 above is fixed to actually detect the protocol), and
   "morpho lending" all resolve to a protocol with no chain (no entry in the
   small `protocolChainMapping`), so neither side of that OR was ever true
   and the results section literally never mounted. Rather than touching
   the ~6 separate gate call sites, `handleKeyDown` now defaults such
   queries into the existing "All chains" mode (the same mode the "All
   chains" button already uses) — reusing its filtering and rendering path
   instead of adding new states.

## Deviations from spec

- Spec's evidence section focuses on the parser; the single biggest fix
  (root cause #1) is not in the parser at all — it's the `availableProtocols`
  memo the parser is fed from. Fixing the parser alone (as 017 did) can
  never fix this, because the parser was always being called with
  correct-looking code and empty data. Flagging because it means "grep for
  per-string hacks in the parser" isn't sufficient review coverage for this
  bug class — the acceptance criterion about live-DOM assertion is what
  actually caught it.
- Kept the ~26-entry static protocol fallback list as-is (still used when
  `availableProtocols.all` is genuinely empty, e.g. pools haven't loaded
  yet) — didn't expand it, since fix #1 makes it a rare fallback rather than
  the every-first-query path it accidentally was.
- Did not touch `test_protocol_parsing.js` / `test_qualifier_fix.js` (the
  stale inline-copy tests 017's evidence section flagged — they only
  `console.log`, never assert). Out of scope for 018, which is behavior-only
  per its own "OUT of scope: search UI redesign, router semantics, planner."
  Left as a known follow-up.

## Sandbox network limitation (read before re-running the Playwright test)

This build ran in a network-policy-restricted session: outbound HTTPS to
`unpkg.com` (React/ReactDOM/Babel) and `yields.llama.fi` (the live pools API)
both return a proxy-level 403 (`/root/.ccr/README.md`: "destination host is
not allowed by your organization's egress policy for this session... do not
retry or route around it"). Verified directly with `curl` through the same
proxy Chromium uses (Node's bare `https` module doesn't honor `HTTPS_PROXY`
and gives a false "reachable" reading — learned this the hard way, see the
probe implementation in `test_search.js`).

`test_search.js` handles this without weakening the spec's "live data, not
fixtures" requirement:
- It probes both hosts via `curl` (proxy-honoring) before the run.
- Where a host is reachable, it lets requests through untouched — in an
  environment with full network access this test is 100% live: real
  unpkg.com CDN, real `yields.llama.fi` response.
- Where blocked (this sandbox), it intercepts via `page.route()`: React/
  ReactDOM/Babel are served from local `node_modules` (added as
  devDependencies, test-only — production `home.html` still points at
  unpkg.com, untouched), and pools come from a DefiLlama-shaped fixture
  snapshot (real project slugs, chain names, symbol conventions, TVL well
  above `DEFAULT_MIN_TVL`).
- Either way the test drives the real mounted React app and asserts on the
  DOM — this is not 017's mistake (unit-testing an extracted function with
  hand-picked mock lists, never mounting a browser). The only thing
  substituted is the two network responses, and which mode ran is logged.

**This session's run used the fixture fallback for both hosts** (confirmed
403 via direct curl through the proxy). All 14/14 canonical-query assertions
passed against the fixture. The human should be aware that a fully-live run
(unpkg.com + yields.llama.fi both reachable) has not been exercised in this
session — recommend a spot-check in an environment with full network access,
or note that CI/verifier environments with different egress policy will
exercise the live path automatically since the test's fallback is
conditional, not hardcoded.

## Test flakiness fixed along the way

Initial version of the DOM assertion read `.pool-card` / `.pool-context-inline`
once, right after `.results-section` became visible. That gate fires as soon
as `chainMode`/`selectedChain` commit, but `filteredPools` itself settles one
effect-pass later — so a single snapshot could catch the frame between "mode
switched" and "pools actually filtered," intermittently reading a stale/empty
`filteredPools`. Replaced the one-shot read with a bounded poll (8s cap,
200ms interval) that re-checks until the assertion holds or the deadline
passes — still fails hard on genuine breakage, just not on this harmless
render-settling window.

## Files touched

- `app.js` — 5 fixes above (parser: chain matching, protocol matching,
  pool-type stem match; render: `availableProtocols` memo, `handleKeyDown`
  chain default)
- `test_search.js` — new, wired into `npm test`
- `package.json` / `package-lock.json` — `test_search.js` added to the test
  chain; `react`, `react-dom`, `@babel/standalone` added as devDependencies
  (test-only local vendoring, see network limitation above)
