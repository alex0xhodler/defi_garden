# 030 build notes
- One-line gate in rankTopTokens: drop tokens with no non-zero-yield qualifying pool. Fixture gained a ZERO token (two $30-50M pools, both 0% APY) -> dropped; 2 new assertions. 34 total.
- Skips generation entirely (vs noindex) — cleanest "don't index": no page, no sitemap entry, no dead internal link. relatedFor consistent since it reads the gated ranked set.
- Does NOT change ranking or the intro (0%-largest-pool look) — flagged as optional follow-up.
