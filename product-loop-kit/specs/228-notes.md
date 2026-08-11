# 228 — build notes

Item: MCP server for defi.garden — 227's railed reads, exposed as installable agent tools.
Branch: `claude/loop-228`. Base: `6cc72ffdf7` (= `origin/main` at pickup).
Operator: Opus 5 (planning, spec, grooming, verification judgment). Product code: one dispatched
Sonnet 5 build agent, per the 2026-07-13 execution-model split.

## Why this item, over two higher-scored READY rows

build.md §1 says take the highest-scored READY item. Two rows outscore 228; **neither was
available**, and both reasons are documented facts, not preferences:

- **234 (9.3)** — its own status cell reads "build after 227/228 — wraps their endpoints". 228 is
  literally its dependency. Building 234 first was not possible.
- **238 (8.8)** — the in-flight check (build.md §1) found `refs/heads/claude/loop-238` on the
  remote at `65af8c005c`, **7 commits, not an ancestor of `main`**. An existing `claude/loop-<id>`
  branch means IN_REVIEW/BLOCKED → skip. See the orphan finding below.

228's dependency, by contrast, was **cleared**: 227 merged as `d4f7b3cf3c` (PR #425) earlier the
same day.

## Finding recorded but NOT acted on (one-item rule): 238 is an orphaned branch

`claude/loop-238` carries a complete, verifier-iterated build — commit subjects include
"widen all three gate predicates to the class they claim (verifier findings 1-4)", "HIGH-tier PR
explainer + 5-question quiz", "rendered-acceptance gate + minify regen". But
`search_pull_requests "238 in:title"` returns **0 results in any state**: the work was built and
**never opened for review**. Nothing merges it; nothing surfaces it. This is exactly the class
`product-loop-kit/pr-orphan-detector.js` exists to catch, and the detector evidently is not being
run anywhere that acts on its output.

Left for the human or a follow-up run, because this run builds one item only. Note that opening
the PR is the *correct* terminal state for 238 rather than merging it: the 2026-08-05 DESIGN
QUALITY BAR decision requires human screenshot approval per design increment.

**Re-measured 238's evidence on `main` @`6cc72ffdf7`** (its spec was measured on the 225 branch,
and 247 has since replaced the visual world — so the spec's own numbers are stale):

| 238's claim | on the 225 branch | on `main` today |
|---|---|---|
| hardcoded `'SF Mono'…` stacks | 4 | **0** — already satisfied by 247's rewrite, not by the branch |
| `text-transform: uppercase` rules | 11 | **24** — an allowlist built against 11 would under-cover |
| `.logo:hover` scale-pop | 1, at `style.css:1644` | still live at `:5232`, **plus a second at `:6115`** |

Recorded on the backlog row so review re-scopes against these, not against the 225-era numbers.

## Deviations from spec 228

1. **`SUPPORTED_PROTOCOL_VERSIONS` is a single entry (`['2025-06-18']`)**, where the spec said
   "newest first, starting 2025-06-18" — which invited a list. Builder's reasoning, and the
   operator agrees: RAZOR's weakest-hypothesis rule cuts *against* claiming compatibility with
   protocol revisions nothing in this session exercised. A list would be a claim more specific
   than the evidence supports. The negotiation code path (echo-if-supported, else newest) is
   still real and still tested; it simply has one supported version to negotiate over today.
2. **HTTP status mapping for JSON-RPC was unspecified**, so the builder pinned it explicitly in
   `mcp-core.js`'s header: body-carrying JSON-RPC response (result *or* protocol error) → HTTP
   200; notification → 202 no body; `-32700` parse failure (raised by the Worker, which owns
   JSON parsing) → 400; an escape from `handleMcpMessage` caught by the Worker's defense-in-depth
   → 500, mirroring `handleApi`'s existing `internal_error` pattern. This is a real gap in the
   spec, filled conservatively and documented at the code.
3. **`validateArgs` is a minimal hand-rolled checker** (required-ness + `string`/`number` type
   match), not a general JSON Schema validator. Sufficient for four flat schemas; the alternative
   was a dependency, which the spec forbids.
4. **`edge/DEPLOY.md` got a 5-line §8**, not the literal "one line" the spec asked for, because
   the file's existing convention is a short dedicated section per item (§7 is 227's). The
   substantive content is "no new deploy step needed" plus the link.
5. **`test_api_worker.js` was edited** (10 lines) — not listed in the spec's Change section, but
   required *by* it: the spec's Territory notes flagged that the pass-through boundary assertions
   would go stale, and they had. The boundary is now restated at four sites — **one live assertion
   message (`test_api_worker.js:590`) plus a block comment and two section labels**, not four
   assertions (the earlier "four assertions" wording overcounted; verifier round 4). A stale assertion that still passes is worse than none.

## Spec corrections the territory forced

The spec's acceptance criterion "grep-provable: the file contains no numeric rail literal" is
**under-specified for a file whose job is describing rails in prose** — a naive whole-file grep
false-flags legitimate English mentions. Resolved by making the constraint *stronger* rather than
loosening the check: rail descriptions in `mcp-core.js` embed **no numeric values at all** (values
surface only live, via `explain_rails` delegating to `/api`), and the "no arithmetic on pool
fields" check is scoped to dot-access (`.apyBase`/`.apyReward`/`.tvlUsd`) so prose saying
"apyBase + apyReward" is not confused with code touching `pool.apyBase`.

Operator re-ran both greps independently on the final tree: **zero** matches for
`\b(1000|100000)\b` and **zero** for `\.(apyBase|apyReward|tvlUsd)` in `edge/mcp-core.js`.

## Non-vacuity — three rules neutered SEPARATELY (builder transcript, verbatim)

Three cycles, so "three working rules" is distinguishable from "one working rule and two dead
ones". Each: mutate → RED → restore → `md5sum` byte-identical → GREEN.

**Cycle 1 — anomaly/floor invariant** (dropped `!isAnomalous(p)` from `api-core.js`'s
`buildPoolsList` filter):
```
RED:  AssertionError: find_pools via MCP: known-anomalous pool c07a115f-... (aerodrome-slipstream/Base,
      total APY 135830.05%) must be ABSENT from its own project+chain query
md5 before:        a5f9464415c1069aab33afea6422774d  edge/api-core.js
md5 after restore: a5f9464415c1069aab33afea6422774d  edge/api-core.js  ✓ byte-identical
GREEN: test_mcp_server.js: 1325/1325 assertions passed
```

**Cycle 2 — tool↔route parity** (made `find_pools` return a hardcoded empty body instead of
calling `apiCore.handleApiRequest`):
```
RED:  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal (find_pools(...) parity assertion) —
      actual {pools:[], count:0, ...} vs expected real 50-pool railed body
md5 before:        8a8100e393758cd38bcea5cf2571efa6  edge/mcp-core.js
md5 after restore: 8a8100e393758cd38bcea5cf2571efa6  edge/mcp-core.js  ✓ byte-identical
GREEN: test_mcp_server.js: 1325/1325 assertions passed
```

**Cycle 3 — `/mcp` classification** (made `agent-log-core.js` return `pathClass: 'api'` for
`/mcp`):
```
RED:  AssertionError [ERR_ASSERTION]: bare /mcp classifies as mcp — 'api' !== 'mcp'
md5 before:        c1a36684b623b14075b8f69032ba9332  edge/agent-log-core.js
md5 after restore: c1a36684b623b14075b8f69032ba9332  edge/agent-log-core.js  ✓ byte-identical
GREEN: test_mcp_server.js: 1325/1325 assertions passed
```

Cycle 1 is the load-bearing one: it mutated **`api-core.js`**, not the MCP layer, and the MCP
test still went red — which is the delegation constraint proving itself. If MCP had its own copy
of the rails, that mutation would have passed.

## Tests

- `node test_mcp_server.js` → **1325/1325 assertions passed** (0.47s).
- `node run-tests.js --lane=plain` → **pass=57 fail=1 timeout=0 total=58**, well inside the
  5-minute timebox (longest single file ~19.6s).
- The single failure, `test_translations_number_format.js`, is **pre-existing**. Operator proved
  this independently rather than accepting the builder's word: ran it with the changes and with
  `git stash -u` on the pristine tree, captured both outputs — **exit 1 both times, 2 failure
  lines both times, and `diff -q` reports the outputs are IDENTICAL**. `translations.js` is not in
  this diff. Unrelated pre-existing breakage (`en.landing.trustFloor` /
  `planner.personaDegenDesc` zero-arg function entries) — worth its own row, not this item's.
- `node_modules` was absent at session start; `npm ci` (4s) preceded the suite and is not counted
  against the timebox.

## Class accounting (build.md §3 class rule — answered honestly)

**Instance of**: the agent pillar — surfaces whose consumer is a machine (llms.txt, md twins,
schema.org, `/api`, MCP). **Population: 4 legs. Closed by this item: 3 (224 ✓, 227 ✓, 228 this).
Open: 1 — item 234 (x402 agentic commerce), which this item unblocks.** The class is **NOT**
closed and this item does not claim to close it.

Two further honest limits on what shipped:

1. **Code-complete, NOT deployed.** Same split as 224 and 227: `wrangler deploy` needs Cloudflare
   credentials, which are human-owned and NEVER-list. Until the human deploys, north-star leg
   (A)'s MCP count is structurally **0 = absence of instrument, not absence of demand**, and the
   ≥30-real-invocation traffic gate cannot open.
2. **Advertised in one place already — incorrectly. (CORRECTED after verifier FAIL, attempt 2.)**
   No registry listing and no `llms.txt` entry — those are genuinely deferred to follow the
   deploy, same call 227 made and recorded.

   But the original version of this bullet said "**Not advertised anywhere**" and concluded
   "even after deploy, an agent has no way to discover this server until the human runs the
   listing leg." **Both were false**, and the operator wrote that error into spec 228 itself by
   taking the BACKLOG row's phrase "the auth.md/agent-skills stubs already live — item 223's
   territory notes map them" as evidence that the stubs were *inert*, without ever opening them.
   The verifier caught it; the build did not. Confirmed independently by the operator:

   - **THREE** cards exist, not two (widened after verifier round 2 caught the correction being
     under-inclusive by one member — the same extension failure as the original defect, one
     smaller): `.well-known/mcp.json`, `.well-known/mcp/server-card.json`, and
     `.well-known/mcp/server-cards.json` (**plural**). All three are **byte-identical**
     (md5 `82f8aeab3994f0f21fc49e02940ed3cd`) and declare
     `"url": "https://www.defi.garden/api/mcp"`, `"type": "sse"`, and a `prompts` capability.
     Enumerated by globbing `.well-known/**` for `mcp` rather than by naming files; the
     three-way mapping is official (`.well-known/agent-skills/agentic-readiness/SKILL.md:73`)
     and `test_vercelignore.js:306` keeps the plural file deployed. A card-only fix is not sufficient. **Completeness caveat, added after a third round of the same under-inclusion:** that glob returns **eight** files, not three. The other five are not cards, but **two of them also hardcode `/api/mcp` for this domain and are deployed**: `.well-known/agent-skills/agentic-readiness/scripts/validate_readiness.py:62` (probes `{base_url}/api/mcp` with `optional=True`, so after a card-only fix it prints a WARN and still **exits 0** — a green readiness check over a broken MCP surface) and `.well-known/agent-skills/agentic-readiness/templates/dns-aid-zone.txt:14` (the DNS-AID HTTPS record this site's own skill tells the operator to publish, `path="/api/mcp"`). `SKILL.md:74` restates `/api/mcp` one line below the `:73` mapping cited above. So the honest statement is: **three cards plus at least two further deployed artifacts**, and this enumeration is NOT claimed exhaustive. Under option (ii) below (alias `/api/mcp`) all of them stay correct; under option (i) every one of them needs updating.
   - `vercel.json:171` emits `Link: </.well-known/mcp/server-card.json>; rel="mcp-server-card"`
     on source `/(.*)` — **every response the site serves**.
   - `.vercelignore` deliberately keeps `.well-known/` in the deploy.

   All three disagree with what shipped here: this server is at `/mcp` (not `/api/mcp`), answers
   `GET` with 405 (not SSE), and implements tools only (not `prompts`). **The `/api/mcp`
   mismatch also defeats this item's own mount-point rationale**: an agent following the
   published card is logged as `path_class = 'api'`, so its invocations would not be separable
   from REST calls — the precise failure the `/mcp` mount was chosen to prevent. So the honest
   statement of the reach leg is not "no discovery exists" but "**a live, site-wide-advertised
   discovery document points agents at the wrong URL, transport and capability set.**"

3. **A SECOND live MCP-branded surface exists, and it is not this server.** Also missed by the
   round-1 correction, caught by the verifier in round 2. `home.html:227-343` registers
   **WebMCP** tools on every page load — `window.navigator.modelContext.provideContext({ tools:
   [...] })` exposing `search_yield_pools` and `calculate_savings_projection` to browser-hosted
   agents, live today on `/` and `plan.html`. It does not go through `api-core.js`: it fetches
   DefiLlama directly and **re-implements both trust rails as hardcoded literals** —
   `home.html:269-270`, `p.tvlUsd < 100000` and `p.apy > 1000`. Correct today **by coincidence
   only**; it is a third copy of rules `trust-rails.js` exists to keep singular, and it is the
   exact drift class item 261 shipped a fix for this morning. The irony is on the record: those
   two literals sit ~20 lines under a comment (`home.html:246-249`, same tool object — not
   adjacent lines) explaining that a *description string* was moved to `window.TRUST_RAILS`
   because "that literal drifted once already".

   Filed as **backlog 266**. Not touched here — `home.html` is the IA router (HIGH risk, sacred
   parameterized-URL behavior) and editing it from an edge-Worker item is a drive-by.

   Consequence for this item's own claims, corrected rather than left standing: `228-pr.md` §2
   originally argued the alternative design would have created "a third place the sanity limit
   lives, checked by nobody" — when a third place **already exists**. That sentence and quiz
   answer 5 are rewritten to be true of the real estate.

   Deliberately **not** fixed inside 228 (the verifier's own instruction, and the operator
   agrees): it is a live agent-discovery surface this item never scoped, and the resolution is a
   genuine choice — correct the card to `/mcp`/streamable-HTTP/tools-only, **or** additionally
   serve `/api/mcp` as an alias classified as `mcp`. Filed as **backlog 265**, flagged as
   must-resolve **at or before** the human's deploy. The mismatch is pre-existing: the card
   pointed at a 404 before this item and still does. 228 does not create it — it stops the docs
   from denying it.
