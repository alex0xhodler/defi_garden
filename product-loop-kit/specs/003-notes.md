# Spec 003 — build notes

## What shipped
- `playwright` added as a devDependency (`^1.61.1`).
- `npm test` now runs the three existing node unit files, then `node test_smoke.js`.
- `test_smoke.js`: a plain node script (no `@playwright/test` runner, matching the
  existing test files' convention — no test-framework config needed, smaller diff)
  that spins up a bare `http.createServer` static file server on the repo root,
  launches Chromium via `playwright`, and at 360/768/1280px asserts:
  1. `GET /` → waits for `#planner-root [class*="gp-"]` to appear (planner mounted
     with real content, not just an empty root div).
  2. `GET /?token=USDC` → waits for `.pool-card` to appear (analytics app rendered
     pool cards from live `yields.llama.fi` data).
  3. No unexpected `pageerror`/`console.error` events. An ignore pattern
     (`mp.defi.garden|cdn.mxpnl.com|mixpanel`) matches the CLAUDE.md carve-out for
     "external font/analytics fetch failures are ignorable" — verified this
     environment actually reaches `unpkg.com`/`yields.llama.fi` fine (curl-equivalent
     node https check), so the ignore list is narrow, not a blanket suppressor.

## Deviations from spec (and why)
- **Local `/` is served by the smoke script's own tiny static server, not vercel.**
  Production's `/ → home.html` rewrite lives in `vercel.json`; there's no local
  vercel dev in this environment. The smoke server special-cases `GET /` to return
  `home.html`'s bytes so the browser's URL bar and `window.location` genuinely read
  `/`, faithfully reproducing what the sabotage check needs to catch (a router
  regression in `home.html`'s `<script>` block). This is the same interpretation
  CLAUDE.md's own manual-verification note implies ("bare / → planner") — the
  router logic itself is purely query-param-driven (see `home.html` IIFE,
  `ANALYTICS_PARAMS`), not pathname-driven, so serving `home.html` at `/` is
  behaviorally identical to what vercel does in production.
- **No `@playwright/test` test runner / `playwright.config.js`.** Spec says "Add
  Playwright as a devDependency" (singular), and the existing three unit tests are
  plain `node file.js` scripts chained with `&&`. Using the bare `playwright`
  package with a hand-rolled assert-and-exit-code script keeps `test_smoke.js`
  consistent with that convention and avoids a second, framework-specific config
  file — smaller surface area, same acceptance criteria satisfied.
- **Playwright's Chromium browser binary**: `npx playwright install chromium` was
  run once during development to make sure the binary playwright resolves is
  present (this machine's `~/Library/Caches/ms-playwright` already had several
  chromium builds from unrelated prior work, but not necessarily the exact build
  this playwright version pins). This is a one-time local machine step, same as
  `npm install` — nothing in the repo's tracked diff depends on it, but a truly
  clean checkout will need it too. Flagging this as a residual for the human /
  next loop: CI wiring (explicitly out of scope for 003) will need either a
  `postinstall` hook or an explicit `npx playwright install chromium` step in
  whatever runs `npm test`.
- **`product-loop-kit/specs/003-notes.md` (this file) is intentionally NOT part of
  the git diff.** It's the loop's own untracked bookkeeping (same status as
  `BACKLOG.md`/`NORTH_STAR.md` — `??` in `git status` on the main worktree, not
  gitignored but not yet committed by anyone). Spec 003's acceptance criteria say
  the diff must touch *only* `package.json`, `package-lock.json`, and new test
  files — including this notes file in the branch would violate that criterion
  literally, plus it's not product code. (Caught my own mistake here: an early
  `Write` call created a stray duplicate `product-loop-kit/` directory *inside*
  the git worktree at `.claude/worktrees/loop-003/product-loop-kit/` — removed it
  and rewrote this file at the canonical path outside the worktree.)

## Out-of-scope finding (new backlog candidate, not fixed here)
- `npm audit` reports one **critical** vulnerability in `fast-xml-parser@^4.4.1`
  (production dependency, used by `generate-sitemap.js`/`generate-llms.js`) —
  entity-expansion / DoS / injection advisories, fix requires a breaking major
  bump to 5.9.3. This predates this branch (confirmed via `git diff package.json`
  — only the new `devDependencies.playwright` line and `test` script changed,
  `dependencies.fast-xml-parser` is untouched) and is unrelated to spec 003.
  Not fixed here: (a) out of scope per spec ("zero product-code changes"), (b) a
  major-version bump to the SEO-surface generator is HIGH risk per NORTH_STAR.md
  risk policy and deserves its own spec + verification, not a drive-by fix buried
  in an unrelated PR. Recommend a new backlog item.

## Runtime
`npm test` (all four files, cold Chromium launch each smoke assertion pair):
**~7.7s** on this machine — well under the ~2 minute target.

## Verification performed
- Full `npm test` run: 185 unit assertions (existing) + 6 smoke assertions, all
  green.
- Sabotage check: forced `window.__APP_MODE = 'planner'` unconditionally in
  `home.html`'s router IIFE → `npm test` exited non-zero, with the 3 analytics-mode
  smoke assertions failing (`.pool-card` never appeared) while the 3 planner-mode
  assertions still passed, as expected. Reverted (`git diff home.html` now empty)
  → `npm test` green again.
- Diff scope: `git status --porcelain` shows only `package.json`,
  `package-lock.json` (modified) and `test_smoke.js` (new) — matches the spec's
  acceptance criterion exactly.

## Risk tier
HIGH, as flagged in the spec (new dependency). This goes to PR, not auto-merge.
