# Product Feature Spec: Impermanent Loss Risk Analyzer: Volatile Yield vs. Stable Returns

## Summary
This dynamic tool helps users visualize and compare the potential impermanent loss for high-APY volatile liquidity pools against the more stable returns of single-sided or stablecoin pools. It aims to educate users on the true net returns when asset prices fluctuate, helping them make informed risk-adjusted decisions.

## Telemetry Goals
- Track Google queries for 'impermanent loss calculator,' 'volatile vs stable yield,' 'uniswap v3 impermanent loss,' and measure user engagement (time on page, calculator submissions) on the analyzer page.

## Verification & Testing
- `curl -X POST -H "Content-Type: application/json" -d '{"assetPair":"WETH-USDC", "chain":"Base", "initialPriceA":2500, "initialPriceB":1, "priceChangeA":10, "timeframeDays":30}' https://defi.garden/api/impermanent-loss-analyzer`

## Status
- APPROVED by Oversight. Ready for Task Loop implementation.