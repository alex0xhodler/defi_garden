# 032 build notes
- Gate changed from poolTotalApy(p) > 0 to formatApy(poolTotalApy(p)) !== '0.00%' — matches the displayed value, so no all-0.00% page survives.
- Fixture gained TINY (0.003% APY, $2.72M TVL) -> dropped; 2 assertions updated/added (TINY drop + "visible non-zero" check). 35 total.
- Caught by post-regen verification of the live pages (99/2132 all-0.00%), not by counts. The 031 cleanup will delete these 99 on the next CI run.
- Threshold = "displays non-zero" (>= 0.01%). Easy to raise later if a higher yield bar is wanted.
