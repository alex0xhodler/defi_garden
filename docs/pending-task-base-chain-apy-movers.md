# Product Feature Spec: DeFi Garden's 'Base Boost' Dashboard: Real-time APY Movers on Base Chain

## Summary
A dynamic landing page showcasing the current top-performing and most actively shifting APYs exclusively on the Base chain. This page provides a snapshot of 'what's hot' right now, helping users quickly identify emerging opportunities and high-signal trends without sifting through all data.

## Telemetry Goals
- Track organic search queries like 'Base chain highest APY,' 'trending Base DeFi pools,' 'new yield opportunities Base,' and monitor direct traffic to this specific dynamic page.

## Verification & Testing
- `node scripts/generateDynamicPage.js --pageId=base-chain-apy-movers --chain=Base --sortKey=apy_change_24h --limit=7`

## Status
- APPROVED by Oversight. Ready for Task Loop implementation.