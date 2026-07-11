# 023 build notes
- Added relatedFor() + a unique per-token intro to generate-token-pages.js; exported relatedFor.
- Internal links point at other /tokens/<slug> pages (co-chain first, self excluded) — implements the 2026 "no orphans" guidance.
- Test bug caught during build: an early "no self-link" assertion matched the legitimate self-CANONICAL; scoped it to the related <nav> block. 26 assertions pass.
- Sample refreshed (specs/014-sample-aaa.html). Offline chain green. No app/sitemap/routing changes.
