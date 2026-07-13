# 074 — Notes: fast-xml-parser v4 → v5 critical-vuln bump

Built on branch `claude/dazzling-ride-tt7bmy`. Not committed (operator commits).

## What shipped

- `package.json`: `fast-xml-parser` `^4.4.1` → `^5.10.0`.
- `package-lock.json`: regenerated via
  `npm install fast-xml-parser@^5.10.0 --no-audit --no-fund`. Now resolves
  `fast-xml-parser@5.10.0`. Installed version confirmed 5.10.0.
  **[Corrected post-verification — the original claim here ("1 lockfile entry
  added") understated the footprint]**: the v5 bump adds **six new transitive
  packages** — `@nodable/entities@2.2.0`, `anynum@1.0.1`, `fast-xml-builder@1.3.0`,
  `is-unsafe@2.0.0`, `path-expression-matcher@1.6.2`, `xml-naming@0.3.0` — plus a
  **major bump of `strnum` 1.1.2 → 2.4.1** (v4 tree: 61 packages installed; v5
  tree: 67). The verifier inspected all six: MIT-licensed, published under the
  fast-xml-parser author's own NaturalIntelligence/nodable v5 package split,
  audit-clean.

That is the entire code change. **Neither call site was touched.**

## v5 API differences encountered

None that affect our usage. v5 keeps the same public exports
(`XMLParser`, `XMLValidator`, `XMLBuilder`) with the same signatures we rely on:

- `new XMLParser({ ignoreAttributes: false })` + `parser.parse(xml)` — unchanged
  behavior; parse-stage output byte-identical (see below).
- `XMLValidator.validate(xml, { allowBooleanAttributes: true })` — unchanged;
  returns `true` / `{ err: { msg, line } }` exactly as before.

Therefore `generate-llms.js` and `validate-sitemaps.js` required **NO changes** —
the "only if v5 forces it" clause did not trigger. Diff touches exactly
`package.json` + `package-lock.json`.

(One incidental v5 packaging note, not a defect and not affecting the app: v5
restricts its `exports` map, so `require('fast-xml-parser/package.json')` now
throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. Nothing in this repo does that; it only
affected an ad-hoc version-probe I ran during verification, which I switched to
reading the file directly.)

## Verification (all run in this session)

1. **`npm audit --omit=dev`**
   - Baseline (v4.5.3 installed): `1 critical severity vulnerability` —
     `fast-xml-parser <=5.6.0`, six advisories.
   - After bump: **`found 0 vulnerabilities`**. 0 critical, no new ≥high. PASS.

2. **Parse-stage equivalence** — re-ran the operator's exact script with v5:
   - `v5 parse-stage URLs: 23599` (matches v4 baseline count).
   - `diff v4-urls.txt v5-urls.txt` → `IDENTICAL` (byte-identical, exit 0). PASS.

3. **`node validate-sitemaps.js`**
   - Tail: `✅ All 123 sitemap file(s) valid`, exit 0 — same verdict as v4
     baseline. PASS.

4. **`node generate-llms.js` end-to-end** (network was available in-sandbox;
   ran with `LLMS_OUTPUT_DIR=<scratchpad>` so committed `llms.txt` files were
   NOT touched):
   - Completed successfully. `Parsed total of 23599 URLs`,
     `Fetched 15404 pools from DefiLlama`, `Selected 15 high-yield
     opportunities`, wrote `llms.txt` (5 KB) + `llms-full.txt` (1169 KB) to the
     scratchpad, `Completed in 2.32s`, exit 0. PASS. (Live-API numbers vary by
     run by design; the deterministic parse-stage set is the equivalence proof
     in check 2.)

5. **Unit test chain** `node test_planner.js && node test_protocol_parsing.js &&
   node test_qualifier_fix.js` → exit 0, all passed. PASS.

6. **`npm test`** (full chain, 5-minute foreground timebox):
   - Passed before the browser stage:
     - test_planner, test_protocol_parsing, test_qualifier_fix (exit 0, per
       check 5)
     - test_compiled_assets: `4 compiled-asset assertions passed`
     - test_minified_assets: `9 minified-asset assertions passed`
     - test_css_minified_render: `2 css-minified-render assertions passed`
   - **FAILED at `test_smoke.js`** (a Playwright browser test). The chain uses
     `&&`, so tests after test_smoke did not run.
   - Failure signature: `console.error: Failed to load resource:
     net::ERR_CONNECTION_RESET` (repeated) and
     `page.waitForSelector: Timeout 15000ms exceeded ... waiting for
     locator('.pool-card')`. This is the documented sandbox network-policy
     failure: the browser cannot fetch the external CDN React UMD / fonts, so
     the app never renders `.pool-card`.
   - **Not caused by this diff.** `fast-xml-parser` is a Node-only build-time
     dependency; a repo-wide grep shows it is imported by exactly two files —
     `generate-llms.js` and `validate-sitemaps.js` — and by **no** browser-loaded
     file (`home.html`, `app.js`, `planner.js`, `PoolDetail.js` do not reference
     it). The failure is a connection reset to external hosts, which a
     node_modules dependency swap cannot cause. A `git stash` "clean tree"
     baseline is not a meaningful v4 comparison here (node_modules would still
     hold v5 and git does not track it), so the definitive proof is the
     zero-browser-blast-radius grep plus the network-error signature. Documented
     per the 2026-07-11 timebox / documented-precedent standing decision.
   - **[Superseded by verification]**: the verifier disproved the "stash is not
     meaningful" reasoning (`npm ci` against the stashed v4 lockfile makes the
     baseline exact) and ran the real v4 baseline: `git stash` → `npm ci`
     (fast-xml-parser 4.5.3 confirmed installed) → `timeout 300 node
     test_smoke.js` → **identical failure signature on the clean v4 tree**
     (repeated `net::ERR_CONNECTION_RESET`, `.pool-card` 15s waitForSelector
     timeouts on all viewports, exit 1), tree then restored. So the
     pre-existing-failure conclusion is now PROVEN, not just argued. Lesson for
     future verifiers: the sandbox `node_modules` tracks whatever was last
     installed, not the git tree — always `npm ci` after stash/pop or baselines
     are meaningless.

7. **Diff scope** (`git status --porcelain` / `git diff --stat`):
   - `M package.json`, `M package-lock.json` — this task's changes.
   - `M product-loop-kit/BACKLOG.md` and `?? product-loop-kit/specs/074.md`
     were already present in `git status` before I began (operator-staged spec
     bookkeeping), NOT produced by this build.
   - No product code, no translations, no generated SEO output, no call-site
     files changed.

## No trust-rail / router / SEO-surface change — confirmation

Confirmed. This bump changes only a build-time XML-parsing dependency used by
two Node SEO scripts. It does NOT touch: the trust rails (APY sanity limit, TVL
floor, anomaly flags, degen haircut), the `window.__APP_MODE` IA router or any
parameterized analytics URL, `translations.js`, or any generated SEO artifact
(`sitemap*.xml`, `llms.txt`/`llms-full.txt`, `stories/`) — the generator was run
only to prove it still completes, with output redirected to the scratchpad so
committed files stayed untouched.

## Deviations from spec

None.
