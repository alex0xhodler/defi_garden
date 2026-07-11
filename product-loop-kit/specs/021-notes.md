# 021 build notes
- Real-page generation routed to CI (sitemap-update.yml) — the loop env can't reach yields.llama.fi, GitHub CI can. Mirrors how sitemap.xml/llms.txt already flow to main via that Action (generated-asset exemption from PR-per-change).
- generate-token-pages.js: +renderTokenSitemap (exported), main() writes sitemap-token-pages.xml (default on; --no-sitemap for offline sample runs), --sitemap override. lastmod = today (Date OK in a plain node script).
- generate-sitemap.js: conditional index entry (fs.existsSync). Ordering: token-pages step runs first in the workflow so the file exists when the index is built.
- Could NOT run generate-sitemap.js or the Action here (need network); node --check clean, YAML valid, 30 token-page assertions + offline chain green. Residual = human triggers the Action + eyeballs /tokens/usdc after deploy.
- Scale: no --limit in CI (per human's no-cap directive) — every eligible token (≥1 pool ≥$100K, non-anomalous) gets a page; the step logs the count. Add --limit N to the workflow to phase it if the count is too large.
