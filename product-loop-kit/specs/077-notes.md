# 077 — implementation notes

Built on branch `claude/dazzling-ride-g8okry`. Not committed (operator commits).

## What changed (test_smoke.js only)

One file touched: `test_smoke.js`. No product code, no `package.json`, no new
dependencies, no shared fixture module.

### 1. Route the pools fetch instead of egressing (live snapshot / fixture)
- Added `const { execFileSync } = require('child_process')`.
- Added a `probe(url)` helper — byte-for-byte the same `curl -sS -o /dev/null -w
  %{http_code} --max-time 8` shape as test_search.js's `probe()` (curl honors
  `HTTPS_PROXY`; a bare Node `https.get` would bypass the proxy and false-positive).
- At the top of `main()`, decide the data mode **once**: if `probe(POOLS_URL)`
  succeeds, capture the real body a single time via
  `execFileSync('curl', ['-sS','--max-time','20', POOLS_URL], { maxBuffer: 64MB })`
  and serve it (`DATA_MODE = 'live snapshot'`); otherwise keep the inline fixture
  (`DATA_MODE = 'fixture'`). The `maxBuffer` bump is required — the live payload is
  ~10.5 MB, well over execFileSync's 1 MB default. A guard (`body.trim().startsWith('{')`)
  falls back to the fixture if the capture is empty/non-JSON.
- Logs exactly one `network:` line stating the mode (test_search.js precedent).
- `loadAndCollectErrors` now installs
  `page.route('https://yields.llama.fi/pools', …)` fulfilling with the shared
  `POOLS_BODY` **before** `page.goto` — so every page (all three viewports + the
  pool-detail navigation) is covered and the browser never egresses to the
  proxy-blocked host.

### 2. Classify ignorable errors by resource URL, not console text
- The `console` handler now reads `msg.location()?.url || ''` and tests both the
  URL and `msg.text()` against `IGNORABLE_ERROR_PATTERN` — exact test_search.js
  technique (its comment explains why: Chromium's "Failed to load resource" text
  never contains the URL, so text-only matching can never classify these).
- Extended `IGNORABLE_ERROR_PATTERN` to
  `/mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|api\.llama\.fi\/protocols|fontshare\.com|www\.google\.com\/s2\/favicons/i`.
  Each entry is an **observed-firing** (or repo-referenced), non-critical external
  fetch that degrades gracefully:
  - `mp.defi.garden` / `cdn.mxpnl.com` / `mixpanel` — analytics (original entries).
  - `api.llama.fi/protocols` — app.js:1057 protocol-name cache; fails silently.
  - `fontshare.com` — style.css:1 `@import` web font.
  - `www.google.com/s2/favicons` — planner.js:1202 `brandIcon()` subscription-ladder
    brand favicons (`aria-hidden`, `onError` falls back to an emoji). This is the
    host that actually kept the bare-`/` planner assertions red after routing was
    added (see mode/observation below).

  **I deliberately did NOT add `fonts.googleapis` / `fonts.gstatic`** from the
  candidate list: they are not referenced anywhere in the repo (only fontshare +
  the self-hosted `./fonts/FKGroteskNeue.woff2` woff2 are) and never fired — adding
  them would be the "blindly add" the spec warns against.

## Mode observed
`live snapshot` — in this sandbox `curl https://yields.llama.fi/pools` returns 200,
so the fulfilled body is the **real** yields.llama.fi payload fetched this run
(~10.5 MB, 15k+ pools), not the fixture. The fixture is fallback-only. Confirmed by
the logged line: `network: yields.llama.fi reachable — serving live snapshot
captured via curl`.

## Fixture-sharing decision (spec §3)
**Inlined** in test_smoke.js (~15 lines: `makePool` + `FIXTURE_POOLS` +
`FIXTURE_RESPONSE`). Rationale: test_search.js executes `main()` at require time, so
it cannot be required from test_smoke.js (the instructions and spec both flag this);
extracting a shared module would mean also editing test_search.js to require it,
widening the diff. Other test files already keep their own inline fixtures. The
inline fixture holds five DefiLlama-shaped pools — four USDC pools at
$45M/$55M/$70M/$80M TVL (all well above the $10M `DEFAULT_MIN_TVL` trust rail, with
non-zero `apyBase`) plus one ETH pool for noise — so `/?token=USDC` renders
`.pool-card` elements and survives trust-rail filtering even on the fallback path.
Trust-rail thresholds are NOT silently diverged (spec §3's actual concern).

## Verification (all in this session)

1. **`node test_smoke.js`** → `8 smoke assertions passed`, EXIT=0, and the mode
   line printed `reachable — serving live snapshot captured via curl` (live mode, as
   required when curl can reach llama). Baseline before the change: 1/8 (the seven
   browser-path assertions failed on `net::ERR_CONNECTION_RESET` / `.pool-card`
   15s timeouts). Intermediate state after routing but before the favicon-host
   addition: 5/8 (the three bare-`/` planner assertions still red, solely on
   `www.google.com/s2/favicons` connection resets — that observation is what
   justified adding exactly that host, nothing broader).

2. **`node test_search.js`** → `20/20 search behavior assertions passed`, EXIT=0.
   Unchanged file; ran it to confirm nothing regressed. (Takes >4.5 min end-to-end —
   it drives ~20 full page reloads — so it needs a >280s timebox to finish.)

3. **Mutation check (adversarial-gate proof)**: temporarily inserted
   `await page.addInitScript(() => console.error('MUTATION-CHECK: genuine
   non-ignorable error'))` immediately before `page.goto` in `loadAndCollectErrors`.
   Result: `node test_smoke.js` → EXIT=1, `1 smoke assertions passed`, all seven
   browser assertions failed with `page errors: console.error: MUTATION-CHECK:
   genuine non-ignorable error`. This proves a genuine console error from a
   non-ignorable source is still captured and still fails the gate (the URL/text
   classification does not blanket-ignore). Mutation then fully reverted; re-running
   returns to 8/8.

4. **`npm test` chain** (timeboxed): the chain proceeds **past** test_smoke.js —
   see the chain-output evidence below (test_smoke green, subsequent files
   executing). The full 31-file chain exceeds the timebox (test_search.js alone is
   ~5 min), which is expected per the spec's AC4 note.

## npm test chain evidence
`timeout 560 npm test` ran the chain in order. All pre-smoke files passed
(test_planner `All 208 assertions evaluated.`, test_protocol_parsing,
test_qualifier_fix, test_compiled_assets `4`, test_minified_assets `9`,
test_css_minified_render `2`), then:

```
network: yields.llama.fi reachable — serving live snapshot captured via curl
  ✓ home.html: sitewide Organization + WebSite JSON-LD ...
  ✓ bare / renders planner UI at 360px
  ✓ /?token=USDC renders pool cards at 360px
  ... (all viewports) ...
  ✓ pool-detail view (?pool=<id>) renders a BreadcrumbList JSON-LD block (040)
8 smoke assertions passed
canonicalFor — analytics mode (self-canonical)     <-- next file (test_canonical.js) executing
  ✓ ?token=USDC -> self-canonical
  ...
```

test_smoke.js is **green inside the chain** and test_canonical.js (the next
`&&` link) begins immediately after — the `&&` no longer halts at test_smoke.
The full 31-file chain then continues into test_search.js (~5 min on its own) and
exceeds the ≤5-min foreground timebox, exactly the AC4-anticipated outcome; the
proof is test_smoke green + subsequent files running, shown above.

## Deviations from spec
None material. Two spec-sanctioned judgment calls, both documented above:
- Fixture inlined rather than shared-module (spec §3 explicitly permits builder's
  choice; require-time `main()` in test_search.js makes sharing awkward).
- Ignore-pattern additions limited to observed-firing / repo-referenced hosts:
  added `fontshare.com` + `www.google.com/s2/favicons` (+ kept
  `api.llama.fi/protocols`); dropped the candidate `fonts.googleapis`/`fonts.gstatic`
  as unused and non-firing.

## Found but deliberately not touched
- `planner.js:1202` fetches brand favicons from `www.google.com/s2/favicons`. This
  is product code and out of scope (the gate observes, never patches); it already
  degrades gracefully via its `onError` emoji fallback, so classifying it ignorable
  in the test is correct rather than a masked product bug.
- test_search.js was left byte-identical (no shared-module extraction), so its
  precedent comments and fixture stay the single source I mirrored.
