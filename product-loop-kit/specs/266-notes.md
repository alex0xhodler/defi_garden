# 266 build notes

## Root cause

- The inline `search_yield_pools` tool fetches DefiLlama directly, bypassing the shared
  `edge/api-core.js` path and its trust-rail application.
- Its predicate repeated `DEFAULT_MIN_TVL` and `APY_SANITY_LIMIT` as bare literals and
  compared the APY rail to `p.apy`, not the product-wide `apyBase + apyReward` total.

## Change

- `home.html` now computes `totalApy = (Number(p.apyBase) || 0) +
  (Number(p.apyReward) || 0)` and reads both limits from `window.TRUST_RAILS`.
- `test_webmcp_trust_rails.js` extracts and executes the actual inline production block,
  derives the registered-tool population from `provideContext`, and exercises the actual router.
- The new gate is registered in `package.json`.

## RED / GREEN evidence

- RED: the gate named bare rail literals `[1000, 100000]`; the 600 base + 600 reward
  anomaly was retained because its separate `p.apy` field was only 600.
- GREEN: WebMCP gate 5 passed / 0 failed; agent-surface rail claims 11 passed;
  canonical 24 passed; registry 5 passed.
- Chromium evaluated the extracted production code, enumerated both registered tools,
  rejected the 600+600 anomaly, and retained only the valid 600+0 fixture.
- Self-defeat: re-hardcoding the APY limit made the gate exit 1 and name the literal
  failure. Restoring byte-identical bytes produced SHA-256
  `03aeca8bcd8b53f97fdbc530b16ec7c0d9f279a2f51d0f1c57e007167f9b34a7` and 5/0 GREEN.
- The unrelated baseline translation `Function.length` assertion remains RED; this diff
  neither caused nor suppresses it.

## Spec deviation and scope

- Spec line 50 is stale: the current IA contract is bare `/` → landing and
  `/?token=USDC` → analytics, not bare `/` → planner. The gate preserves current behavior
  rather than regressing the router to satisfy stale prose.
- No router code or behavior changed; only the later WebMCP filter block changed.
- No general docs changed: the shared-rail load order is already documented in
  `home.html` and `trust-rails.js`.
- Status is PR-only `IN_REVIEW`, attempt 1; nothing is merged or SHIPPED.
