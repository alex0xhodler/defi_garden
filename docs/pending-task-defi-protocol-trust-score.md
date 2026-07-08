# Product Feature Spec: DeFi Protocol Trust Score: Unbiased Risk Assessment

## Summary
This feature provides a dynamically updated 'Trust Score' for leading DeFi protocols, aggregating data on smart contract audits, decentralization metrics, TVL stability, and exploit history. It empowers users to evaluate the underlying security and reliability of platforms beyond just their advertised APYs, fostering safer yield-seeking decisions.

## Telemetry Goals
- Track organic search queries for 'defi protocol security,' 'is uniswap safe,' 'defi risk rating,' and monitor user engagement with the trust score details on protocol pages.

## Verification & Testing
- `curl -X GET 'https://defi.garden/api/protocol-trust-score?protocol=uniswap-v3&chain=Base'`

## Status
- APPROVED by Oversight. Ready for Task Loop implementation.