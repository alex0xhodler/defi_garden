# 265 — build notes (HIGH tier)

## What changed and why

The three byte-identical MCP discovery cards (`.well-known/mcp.json`,
`.well-known/mcp/server-card.json`, `.well-known/mcp/server-cards.json`) each
advertised `url: "https://www.defi.garden/api/mcp"`, `type: "sse"`, and a
`prompts` capability — none of which the live server (`edge/mcp-core.js`,
mounted at `/mcp` by `edge/agent-log.mjs`) implements. `vercel.json:171`
broadcasts a `Link: </.well-known/mcp/server-card.json>; rel="mcp-server-card"`
header on every response, so this wrong pointer reached every agent that
followed it. Fixed all three cards to `url: "https://www.defi.garden/mcp"`,
`type: "streamable-http"`, and `capabilities.tools` only (`prompts` dropped) —
option (i) from spec 265's "Genuine choice for the human" (correct the
cards; smaller diff, keeps the classifier's two-term leg-A decomposition
intact, no new alias route to maintain).

Two further deployed artifacts named by the spec also hardcoded `/api/mcp`
and were fixed:
- `.well-known/agent-skills/agentic-readiness/scripts/validate_readiness.py:62`
  — probed `{base_url}/api/mcp`; now probes `{base_url}/mcp`.
- `.well-known/agent-skills/agentic-readiness/templates/dns-aid-zone.txt:14`
  — the DNS-AID HTTPS record this site's own skill tells operators to
  publish; `path="/api/mcp"` → `path="/mcp"`.
- `.well-known/agent-skills/agentic-readiness/SKILL.md:74` — restated
  `/api/mcp` as an example serverless-handler path one line below the
  three-card mapping at `:73`; corrected to `/mcp` since this file documents
  this site's own actual deployed setup.

`edge/MCP.md`'s "Not fixed in this item, on purpose" residue section (the
historical narrative documenting how 228's verifier found the mismatch) is
left untouched; a new paragraph is appended directly after it stating the
resolution (cards corrected, artifacts corrected, parity test added), so the
record of how this was found and the record of how it was fixed both stand.

## New test: `test_mcp_discovery_cards.js`

Population is derived, not hand-listed: walks `.well-known/`, keeps paths
containing "mcp" (case-insensitive — this is the directory segment for the
two nested cards, not their basename: `.well-known/mcp/server-card.json`'s
basename is `server-card.json`), then further filters to files that parse as
JSON with a `transports` key. This found exactly 3 cards today; the count is
asserted (`EXPECTED_CARD_COUNT = 3`) but each card is *also* asserted
individually (url / transport-type / capability-set), so the count is not
the only check, per the item's requirement.

Expected values are derived from `edge/mcp-core.js`'s own exports:
`SERVER_CAPABILITIES` gives the real capability-key set (`['tools']`);
`TOOLS` (non-empty) and a live `handleMcpMessage()` call to `tools/list` /
`tools/call` prove "tools" is *real*, not just an unclaimed key; calls to
`prompts/list`, `prompts/get`, `resources/list`, `sampling/createMessage`
all return `-32601` (method not found), proving those capabilities are
correctly *absent*, not merely forgotten. Every card's `capabilities` object
is set-equal-compared against `SERVER_CAPABILITIES`'s keys, both directions,
so a card missing `tools` OR a card claiming an extra capability both fail.

Two facts `mcp-core.js` cannot know about itself are stated once, as named
constants, and every card is compared against that one constant — never
re-typed per file:
- `LIVE_MCP_URL = 'https://www.defi.garden/mcp'` — mcp-core.js is a pure,
  network-free module (by design, see its own header comment) and has no
  way to know where it's deployed.
- `EXPECTED_TRANSPORT_TYPE = 'streamable-http'` — a wire-protocol label,
  not a JS value the JSON-RPC core carries.

The repo-wide `api/mcp` residue scan is a pure Node `fs`/`path` walk +
regex (no shelled-out `grep`), matching `test_agent_surface_rail_claims.js`'s
population-boundary discipline: an explicit, *documented* allowlist, not a
silent narrowing. See "Deviation from the given allowlist" below.

## Deviations from spec / from the build prompt

1. **Transport-type string (`"streamable-http"`) is stated, not derived.**
   The cards' own `$schema`
   (`https://modelcontextprotocol.org/schemas/mcp-server-card-v1.json`) 404s,
   so the canonical spelling can't be verified against a live schema
   registry. `"streamable-http"` is the conventional MCP-ecosystem string
   for the transport `edge/MCP.md` already describes in prose. Recorded,
   not-blocking, exactly as the build prompt anticipated.

2. **The `api/mcp`-residue allowlist is WIDER than the list named in the
   build prompt.** The prompt named `LOG.md`/`BACKLOG.md`/`reports/*.md`/
   `test_vercelignore.js:411`/`test_mcp_server.js:586` as the only expected
   remaining hits. The actual repo-wide walk (in the new test) also
   legitimately finds `api/mcp` in `product-loop-kit/specs/265.md`,
   `228.md`, `228-notes.md`, `228-pr.md`, `223-pr.md` (spec/notes/PR files
   quoting the dead URL as *evidence* — the same historical role
   `test_agent_surface_rail_claims.js`'s header comment already documents
   for `product-loop-kit/**` generally), `product-loop-kit/signals/2026-08-12.md`
   (the heartbeat's live-probe signal spec 265 itself cites), `edge/MCP.md`
   (this item's own instructions require *appending* a resolution paragraph
   without rewriting the historical narrative, which necessarily still says
   "api/mcp"), and `test_mcp_discovery_cards.js` itself (a scanner must name
   the string it hunts). I treated all of `product-loop-kit/**` as
   historical/append-only — matching the already-shipped convention in
   `test_agent_surface_rail_claims.js` rather than inventing a narrower one
   — kept `edge/MCP.md`'s narrative intact per instruction, and allowlisted
   the new test file itself. This is a *widening*, not a narrowing: every
   entry is individually justified in the test's header comment, and the
   test non-vacuously asserts each named allowlisted file/root genuinely
   contains the string, so the allowlist can't silently exclude nothing.

3. **`test_llms_rails.js`** (requested as an optional extra) fails in this
   sandbox: `Cannot find module 'fast-xml-parser'`. No `node_modules/`
   exists in this sandbox at all — a pre-existing environment gap unrelated
   to any file this item touched. Not fixed; noted per "honest residual".

## Non-vacuity mutation transcript

Both mutations were performed against `.well-known/mcp/server-card.json`
(chosen arbitrarily — the population loop is identical for all three cards,
so any one file exercises the same code path), run with
`node test_mcp_discovery_cards.js` in isolation, then restored and verified
byte-identical via `git diff --quiet` / `git checkout --`.

**Mutation 1 — URL regression** (`"https://www.defi.garden/mcp"` →
`"https://www.defi.garden/api/mcp"`):

```
AssertionError [ERR_ASSERTION]: .well-known/mcp/server-card.json: every
transport's "url" must be the one true live URL
"https://www.defi.garden/mcp" (got "https://www.defi.garden/api/mcp")
+ actual - expected
+ 'https://www.defi.garden/api/mcp'
- 'https://www.defi.garden/mcp'
```
Exit code: non-zero (assertion throw, uncaught). RED confirmed.

Restore: `git checkout -- .well-known/mcp/server-card.json`, confirmed
`git diff --quiet -- .well-known/mcp/server-card.json` (byte-identical to
HEAD, no diff). Re-run: `75/75 assertions passed`, exit 0. GREEN confirmed.

**Mutation 2 — phantom capability regression** (added back
`"prompts": {"list": true, "get": true}` to the card's `capabilities`
object, alongside the correct `tools` block):

```
AssertionError [ERR_ASSERTION]: .well-known/mcp/server-card.json: declared
capability keys ["prompts","tools"] must set-equal the real server's
capability keys ["tools"] (edge/mcp-core.js SERVER_CAPABILITIES) — both
directions
+ actual - expected
  [
+   'prompts',
    'tools'
  ]
```
Exit code: 1 (confirmed via `echo $?`). RED confirmed.

Restore: `git checkout -- .well-known/mcp/server-card.json`, confirmed
`git diff --quiet` clean. Re-run: `75/75 assertions passed`, exit 0. GREEN
confirmed.

Repo left clean after both cycles — `git status --short` shows only the
intended diffs (`package.json`'s `test:serial` addition, the new
`test_mcp_discovery_cards.js` file, and the card/skill/doc fixes already
captured by the harness's checkpoint commit `e07fbd6825`).

## Tests run and results

| test | result |
|---|---|
| `test_mcp_discovery_cards.js` (new) | 75/75 assertions passed |
| `test_mcp_server.js` | 1365/1365 assertions passed |
| `test_vercelignore.js` | 155 assertions passed |
| `test_agent_surface_rail_claims.js` | 11 assertions passed (population 33 files) |
| `test_agent_log.js` | 764/764 assertions passed |
| `test_api_worker.js` | 762/762 assertions passed |
| `test_x402_core.js` | 211/211 assertions passed |
| `test_llms_rails.js` | FAILS — `fast-xml-parser` not installed (sandbox has no `node_modules/`; pre-existing, unrelated to this item) |

Did not run the full `npm test` (≈160-file suite via `run-tests.js`): the
missing `node_modules/` would fail every test that requires an npm
dependency (not just `test_llms_rails.js`), producing a large amount of
pre-existing, unrelated noise rather than signal about this item. Ran the
targeted set the build prompt specified as the minimum, plus the requested
optional agent-surface tests, all passing except the one environment gap
noted above.

## Honest residual

- The cards' `$schema` URL
  (`https://modelcontextprotocol.org/schemas/mcp-server-card-v1.json`) is
  itself unverified — it may not point at a real, current registry schema.
  Out of scope for this item (spec 265 explicitly excludes `openapi.json`
  path drift (262, blocked) and registry listings (human-owned)); not
  touched.
- `test_llms_rails.js` fails in this sandbox for an unrelated, pre-existing
  reason (missing npm dependency, no `node_modules/` installed at all).
- The full `npm test` suite was not run; see "Tests run and results" above
  for why and what was run instead.
- `edge/MCP.md`'s historical narrative (the live-probed 404, the
  three-round under-count) still literally contains the string `api/mcp`,
  by design — it is the record of how the defect was found, left intact per
  this item's own instructions, with a resolution paragraph appended below
  it rather than any rewrite.
