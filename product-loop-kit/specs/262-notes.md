# Item 262 notes

## RED evidence

- The starting contract exposed nonexistent `POST /planner` while omitting live `GET /api`, `/api/health`, `/api/pools/:id`, and `/api/forever-number` operations.
- This was drift in both directions: runtime routes had no contract operations, and the contract advertised a route with no runtime handler.

## Minimal implementation

- `openapi.json` now describes the six public GET operations under the `/api` server prefix: `/`, `/health`, `/pools`, `/pools/{id}`, `/forever-number`, and `/pricing`.
- `POST /planner` and its payment extension were removed rather than deprecated because no handler exists.
- Response definitions follow the real handler bodies and statuses. Nullable pool, pool-detail, and forever-number fields remain nullable; error and x402 responses are declared only where handlers can return them.
- `test_openapi_contract.js` derives the runtime operation population from `edge/api-core.js`, compares both sets, and validates nine representative real handler payloads.
- `package.json` registers the contract check in `test:serial`.
- No runtime handler, route, pricing, deployment, or x402 configuration changed; x402 remains dark.

## Verification evidence

- Focused run passed: contract 9 payloads; API 750; MCP 1341; x402 core 211; x402 gate 285; agent-surface rail claims 11; test registry 5.
- Independent self-defeat checks each exited 1 and named `GET /reviewer-mutation`: once for a runtime-only route and once for an OpenAPI-only operation.
- After both mutations, `edge/api-core.js` and `openapi.json` were restored byte-identically (SHA-256 `53b421802a9eec7eb04966ce6ee62969a8cba6f81d53f354e6d470e2742d2952` and `0593ba03e533eaef02c3bf989c804e2e3aaad9764c1e5ea68fc7ee91d394a0d8`); the contract test returned green.
- The broader plain lane retains one unrelated baseline failure in `test_translations_number_format.js`: its stale `Function.length` invariant does not reflect the current translation helper signature.
