# Item 277 build notes

Impact: north-star leg A — llms.txt is the first file an agent reads and it currently mentions the live API and MCP server zero times (live grep 2026-08-12: 0 hits for `/api` or `MCP` in served llms.txt)

## Root cause and ownership

- `llms.txt` and `llms-full.txt` are generated, but `generate-llms.js` emitted no API/MCP discovery section after the Worker became live.
- Hand-editing either output would be erased by the daily generator, so the fix is generator-owned only.
- Endpoint/tool names are not copied lists: the generator imports the real `ENDPOINTS` from `edge/api-core.js` and `TOOLS` from `edge/mcp-core.js`.
- The exported shared section helper is called by both builders and derives rail claims from `trust-rails.js`.
- `test_llms_agent_endpoints.js` is registered; both committed llms artifacts were regenerated.

## Deterministic regeneration

- After shortening public inventory copy, the generator ran twice against the same live DefiLlama population of 15,607 pools; the second run changed nothing.
- `llms.txt` SHA-256: `4ecba9b6dbb5a9d105dbf8c782232e5077819237944a35f0d059ba39d315f389`.
- `llms-full.txt` SHA-256: `de7a36d6141044b2ce144a88a271dd4a7bbea0d377b54b1296131216e7b89ddf`.

## Verification

- `test_llms_agent_endpoints.js`: 2/2 (builder output and committed files).
- `test_llms_rails.js`: 14/14; `test_llms_freshness.js`: 8/8.
- `test_llms_shared_source.js`: 12/12; `test_llms_link_integrity.js`: 57/57.
- `test_agent_surface_rail_claims.js`: 11/11; `test_test_registry.js`: 5/5.

## Non-vacuity and restore

- Added runtime route `/api/regen-mutation` to authoritative `ENDPOINTS` without regenerating outputs.
- The new test exited 1 and named `/api/regen-mutation` as missing from stale committed output.
- Restored `edge/api-core.js` byte-identically, SHA-256 `53b421802a9eec7eb04966ce6ee62969a8cba6f81d53f354e6d470e2742d2952`; the new test returned green at 2/2.
- This is stronger than mutating a copied generator list: it proves drift from the runtime source is detected.

## Sequencing and claims

- Item 265 already shipped as PR #441, satisfying the discovery-card sequencing prerequisite.
- No traffic outcome is claimed. The traffic leg remains gated on at least 30 real agent-classified `/api` or `/mcp` reads.
