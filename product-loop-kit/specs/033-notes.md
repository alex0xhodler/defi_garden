# 033 build notes
- Moved the sort+slice BEFORE the yield gate and gated on the shown slice (rec.pools.slice(0,POOLS_PER_PAGE)). Now the gate matches exactly the rendered table.
- Fixture: TRUNC = 8x 0%-APY high-TVL pools + 1x 5% low-TVL pool -> displayed top-8 all 0.00% -> dropped. Passes 032's all-pools gate, so it's the truncation regression. +9 fixture rows, 2 assertions (TRUNC drop + shown-table check). 36 total.
- Respects "best tvl first" (human): ordering unchanged; only drops tokens whose TVL-top-8 show no yield. The 4 live pages get removed by 031 cleanup on the next CI run.
