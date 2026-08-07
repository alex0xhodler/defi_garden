# 166 build notes

## Files changed

- `generate-llms.js` (740 lines total, +18/-3 net vs origin/main): added and exported
  `poolUrl(pool, baseUrl)`; used it at both pool-row emitters (buildConcise's
  "Current Top Yields", buildFull's "Live High-Yield Opportunities (by Chain)",
  where it replaces the local `const poolUrl = pool.url || meta.baseUrl;` —
  renamed the local variable inline to nothing, the helper takes its name);
  replaced `?search=<protocol>` with `?protocols=<protocol>` at both protocol-row
  emitters (buildConcise, buildFull) and the "Pendle opportunities" query example
  (now `?protocols=pendle`); exported `poolUrl` from `module.exports`.
- `llms.txt` (76 lines) and `llms-full.txt` (5017 lines): regenerated via
  `node generate-llms.js` against a live `yields.llama.fi/pools` fetch (16008
  pools). Never hand-edited.
- `package.json` (62 lines, 1 line changed): `test:serial` chain — inserted
  `node test_llms_link_integrity.js` immediately after `node test_llms_rails.js`.
- `test_llms_link_integrity.js` (268 lines, new file): 24 assertions, function-level
  + artifact-level, following `test_llms_rails.js`'s `test()` harness and
  console-output shape exactly.

`run-tests.js` needed no edit — it parses `package.json`'s `test:serial` string
directly (`parseFileList()`), so inserting the new file into that chain was
sufficient; confirmed with `node run-tests.js --list --only=...` showing the new
file classified into the `plain` lane (it requires no local module that mentions
"playwright").

## Deviations from the spec / conservative choices

1. **`poolUrl` also treats an empty-string `pool.pool` as absent.** The spec says
   "non-empty string" for the id case; I made the fallback explicit for
   `pool.pool === ''` too (not just `undefined`/missing), and added a direct test
   for it (`poolUrl(): pool.pool is an empty string -> falls back...`). This is
   the literal reading of "non-empty string" and does not change behavior for any
   real DefiLlama payload (which always carries a real UUID in `.pool` when the
   field exists at all), so it's a belt-and-suspenders case, not a functional
   change beyond the spec's own wording.
2. **`poolUrl`'s fallback branch guards `pool` with `pool && pool.symbol`** rather
   than assuming `pool` is always a well-formed object. Purely defensive; the
   existing surrounding code already assumes non-null pool objects everywhere
   else, so this adds robustness without changing any real output.
3. **Class-3 regression assertion definition**: the spec says "no two rows that
   state DIFFERENT APY/TVL figures share the same URL." I implemented this as:
   group all `- ... — X% APY, $Y TVL — URL` rows in a file by URL, and fail if any
   URL maps to more than one distinct (APY, TVL) pair. Two rows with IDENTICAL
   figures sharing a URL would still pass (that's not what class 3 was about —
   class 3 was two DIFFERENT pools/figures colliding on one URL because the URL
   couldn't address the pool). This matches the spec's literal wording and the
   class-3 evidence (two different APY/TVL pairs -> one URL).
4. **Router-param-membership regex** (`/[?&]([A-Za-z0-9_]+)=/g` over raw file
   content) is a raw text scan, not a URL-aware parse, per the spec's literal
   instruction ("extract every `?<key>=` and `&<key>=` from both committed
   files"). Verified by hand (via `grep -noE '[?&][A-Za-z0-9_]+=' llms.txt
   llms-full.txt | sort -u`) that no non-URL `?`/`&` text exists in either
   committed file today, so this scan has no false-positive surface currently;
   if prose ever introduces a stray `?word=` it would show up as a new failing
   key, which is the intended fail-safe direction (verifier should re-derive this
   grep at review time if in doubt).
5. **`home.html` param-array parser** (`parseParamArray`) uses a regex to find
   `var <NAME> = [...]` and pull quoted string literals out of the bracket
   body — no `eval`, no second hardcoded array. Verified it round-trips
   correctly against the live `ANALYTICS_PARAMS`/`PLANNER_PARAMS` in
   `home.html:77-78` (sanity-checked with an explicit "parse sanity" test:
   `token`, `pool`, `protocols` in ANALYTICS_PARAMS; PLANNER_PARAMS non-empty).
6. **`test_llms_shared_source.js` is not wired into `package.json`'s
   `test:serial`** despite being named in the task's REGRESSION GATE command.
   This is a pre-existing state on origin/main (confirmed: `grep -o
   "test_llms[a-z_]*\.js" package.json` before my edit showed only
   `test_llms_freshness.js` and `test_llms_rails.js`, never
   `test_llms_shared_source.js`) — not something I introduced, and out of this
   spec's scope (166 only asks for `test_llms_link_integrity.js` to be wired in,
   immediately after `test_llms_rails.js`). I ran it manually as part of the
   REGRESSION GATE per the task instructions; I did not add it to
   `test:serial` since that's not part of spec 166's Change section and touching
   unrelated test wiring wasn't requested.
7. **No `home.html`, `landing.js`, sitemap generators, or trust-rail constants
   touched** — confirmed via `git diff --stat` (only `generate-llms.js`,
   `llms.txt`, `llms-full.txt`, `package.json`, and the new test file changed).

## Mutation (non-vacuity) runs

All three mutations were applied to `generate-llms.js`, regenerated via
`node generate-llms.js` (network fetch succeeded each time — 16008 live pools),
verified with `node test_llms_link_integrity.js`, then restored byte-exact from
a saved copy and re-diffed to confirm restoration. Backups were kept at
`/tmp/claude-0/-home-user-defi-garden/0e5fe87c-a2b4-5c81-9c2c-85dcfaf3a271/scratchpad/{generate-llms.intended.js,llms.intended.txt,llms-full.intended.txt}`.

### Mutation 1 — revert change #1 (pool-URL helper) at the buildConcise emitter

Command:
```
# Edit: buildConcise's "Current Top Yields" row reverted to the old inline
#   const searchUrl = `${meta.baseUrl}/?token=${encodeURIComponent(pool.symbol || '')}&chain=${encodeURIComponent(pool.chain || '')}`;
#   lines.push(`- ${name} — ${apy} APY, ${tvl} TVL — ${searchUrl}`);
node generate-llms.js
node test_llms_link_integrity.js
```
Exact red assertions (3, different from mutations 2 and 3):
```
  ✗ buildConcise(): pool row with an id emits /?pool=<id>
    expected a ?pool= link for the pool that has an id
  ✗ committed llms.txt: >= 5 rows matching \?pool=[uuid] — was 0
    expected >= 5 ?pool=<uuid> rows in llms.txt, found 0
  ✗ committed llms.txt: no two rows with different APY/TVL share the same URL (class-3 regression)
    llms.txt has URL(s) shared by conflicting figures: [{"url":"https://www.defi.garden/?token=WETH-USDC&chain=Base","combos":["86.2|$111,005,227","29.7|$10,195,697"]}]
```
21 of 24 assertions still passed; exit code 1. Restore: copied the saved
`generate-llms.intended.js`/`llms.intended.txt`/`llms-full.intended.txt` back
over the working files; `diff` against the saved copies returned no output for
all three (byte-exact restore confirmed).

### Mutation 2 — revert change #2 (`?protocols=` -> `?search=`) at the buildFull protocol emitter

Command:
```
# Edit: buildFull's protocolUrl reverted to
#   const protocolUrl = `${meta.baseUrl}/?search=${encodeURIComponent(protocol)}`;
node generate-llms.js
node test_llms_link_integrity.js
```
Exact red assertions (3, different from mutations 1 and 3):
```
  ✗ buildFull(): protocol rows emit ?protocols=, never ?search=
    expected ?protocols= for the protocol row
  ✗ committed llms-full.txt: zero ?search= occurrences — was 10
    expected 0 occurrences of ?search=, found 10
    10 !== 0
  ✗ committed llms-full.txt: every ?key=/&key= is a member of ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}
    llms-full.txt emits unrouted param(s): search
```
21 of 24 assertions still passed; exit code 1. Restore: same copy-back
procedure; `diff` against saved copies returned no output for all three
(byte-exact restore confirmed).

### Mutation 3 — revert change #1 (pool-URL helper) at the buildFull by-chain emitter (the original class-1 bug, verbatim)

Command:
```
# Edit: buildFull's by-chain row reverted to the original defect
#   const linkUrl = pool.url || meta.baseUrl;
#   lines.push(`- ${details} — ${apy} APY, ${tvl} TVL — ${linkUrl}`);
node generate-llms.js
node test_llms_link_integrity.js
```
Exact red assertions (6, different from mutations 1 and 2):
```
  ✗ buildFull(): by-chain pool row with an id emits /?pool=<id>, never the bare baseUrl
    expected a ?pool= link in the by-chain section
  ✗ buildFull(): by-chain pool row with no id falls back to ?token=&chain=
    expected the fallback link in the by-chain section
  ✗ committed llms-full.txt: zero rows fall back to the bare homepage (TVL — baseUrl$) — was 15
    expected 0 bare-homepage fallback rows, found 15
    15 !== 0
  ✗ committed llms-full.txt: >= 10 rows matching \?pool=[uuid] — was 0
    expected >= 10 ?pool=<uuid> rows in llms-full.txt, found 0
  ✗ committed llms-full.txt: no two rows with different APY/TVL share the same URL (class-3 regression)
    llms-full.txt has URL(s) shared by conflicting figures: [{"url":"https://www.defi.garden","combos":[15 distinct APY|TVL combos]}]
```
19 of 24 assertions still passed; exit code 1. This exactly reproduces spec
166's class-1 evidence (all 15 by-chain rows collapsing onto the bare
homepage). Restore: same copy-back procedure; `diff` against saved copies
returned no output for all three (byte-exact restore confirmed).

Each mutation produced a distinct, non-overlapping-in-full set of red
assertions — no assertion stayed green under its own targeted mutation, and no
mutation was a no-op.

## Regression gate

Command run (single shell, `&&`-chained, under the 5-minute timebox — completed
in well under 60s total):
```
node test_llms_rails.js && node test_llms_freshness.js && node test_llms_shared_source.js && node validate-sitemaps.js && node test_llms_link_integrity.js
```
Result: exit code 0. Summary lines:
```
llms.txt / llms-full.txt trust rails — 159
14 assertions passed
llms.txt / llms-full.txt freshness — 083
8 assertions passed
MECHANISM — same fixture in => byte-identical llms.txt / llms-full.txt out
...
12 assertions passed
✅ All 112 sitemap file(s) valid
llms.txt / llms-full.txt link integrity — 166
24 assertions passed
```
No pre-existing failures were encountered, so no `git stash` baseline was
needed for this gate.

## Before/after counts per acceptance criterion

| Criterion | Before (origin/main) | After |
|---|---|---|
| `pool.url` occurrences in `generate-llms.js` | 1 (`generate-llms.js:606`) | 0 |
| `?search=` occurrences in `generate-llms.js` | 2 (`:462` buildConcise protocolUrl, `:474` Pendle example) + 1 more in buildFull `:577` = 3 total | 0 |
| `grep -cE "TVL — https://www\.defi\.garden$"` in `llms.txt` | 0 (class 1 was llms-full-only) | 0 |
| same, `llms-full.txt` | 15 | 0 |
| `grep -c "?search="` in `llms.txt` | 7 | 0 |
| same, `llms-full.txt` | 10 | 0 |
| rows matching `\?pool=[0-9a-f-]{36}` in `llms.txt` | 0 | 8 (>= 5 required) |
| same, `llms-full.txt` | 0 | 15 (>= 10 required) |
| real pool lines (`^- .+% APY, .+ TVL — `) in `llms.txt` | 8 | 8 (>= 5 required, unchanged — no rows dropped) |
| same, `llms-full.txt` | 15 | 15 (>= 5 required, unchanged) |
| router-param-membership violations | 17 (`search` not in either param list, appearing 17x) | 0 |
| class-3 URL collisions (different APY/TVL sharing 1 URL) | present (the two Base WETH-USDC rows in `llms.txt`'s "Current Top Yields" both resolved to `?token=WETH-USDC&chain=Base`) | 0 |
| `test_llms_link_integrity.js` assertions | n/a (file didn't exist) | 24, all passing |

## Anything not done / could not do

Nothing was skipped. Network access to `yields.llama.fi` worked in this
sandbox (verified 3 times: the initial regeneration plus mutations 1-3's
regenerations, each fetching a live 16008-pool payload) so there was no need to
report a network failure. `test_llms_shared_source.js` is pre-existing-not-in-
`test:serial` as documented in Deviations item 6 above — not fixed, since it is
outside spec 166's Change section and outside the explicit "wire the NEW test
in" instruction.
