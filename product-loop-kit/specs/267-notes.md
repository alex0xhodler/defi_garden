# 267 — build notes (2026-08-13)

## Outcome

One schedule now supplies the machine boundary plus the public route/tool lists in `X402.md`,
`API.md`, and `MCP.md`. Pricing remains dark; no route tier, price, payment behavior, dependency, or
render path changed.

## TDD evidence

RED: the new population-derived test stopped at the first missing marker:

```text
X402.md: exactly one <!-- BEGIN GENERATED PRICING ROUTES --> marker
0 !== 1
```

GREEN:

- `node test_x402_core.js` — 223/223.
- `node test_x402_gate.js` — 285/285.
- `npm run test:fast` — 64/64 files.
- `node edge/generate-pricing-docs.js` followed by `git diff --check` — clean.

## Population and non-vacuity

The test derives all 6 route rows from the real `PRICE_SCHEDULE` and all 4 tools from the real
`mcp-core.js` `TOOLS` table. It requires exactly one begin/end marker on each of 3 documents and
byte-equal generated bodies on both route surfaces and the tool surface.

The in-test self-defeat changes `/api/health` from free to paid in memory, calls
`buildPricingDoc()`, and requires the returned boundary to move that route into its paid list. The
entry is restored immediately. This proves the machine sentence responds to schedule tier changes;
the committed generated-region equality checks catch an un-run generator after the same change.

Review amendments: an unsupported schedule tier now throws with its route/value instead of
disappearing from both generated lists, and the public `/api/pricing` response example is asserted
against the real generated machine boundary.

## Scope

Class closed for the four item-267 copies: two public route lists, one public tool list, and the
machine-readable boundary sentence. Conceptual policy prose and availability statements remain
hand-authored because they do not enumerate the mutable schedule population.
