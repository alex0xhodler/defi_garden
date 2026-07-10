# Spec 017 build notes

## Root-cause bugs found (via a scratch harness reproducing the real parser against
realistic fixtures — not guessed)

1. **Chain matching had no fallback to the live chain list.** `parseNaturalLanguageQuery`
   only matched chains through a hardcoded `chainAliases` dict. Any chain not manually
   added there (e.g. "Plasma", newly listed) could never match even though it was passed
   in `allChains`. Fixed by adding a fallback: after the alias loop, if no chain matched,
   do a direct word-boundary match against every chain in `allChains`. This is the
   root-cause fix — it makes *any* current or future live chain searchable by its exact
   name, not just the chains someone remembered to hardcode an alias for.
2. **"Kamino" had no unified friendly name.** `getFriendlyProtocolName` (app.js) had no
   entry for Kamino's DefiLlama project slugs (`kamino-lend`, `kamino-liquidity`), so they
   fell through to generic capitalization → "Kamino lend" / "Kamino liquidity". That meant:
   no alias for bare "kamino" (the generated alias was the full multi-word name), and
   "Kamino lending" specifically failed because the word-boundary check between alias
   "kamino lend" and query "...lending" doesn't match mid-word. Fixed by adding the three
   Kamino variants to `protocolNameMap`, same pattern already used for Aave/Uniswap/etc.
   version unification.
3. **Pool-type "Lending" matched the literal string "lending" only**, not "lend"/"lender"/
   "lenders". "kamino lenders" (the human's own example) produced no `poolTypes` at all.
   Fixed with a word-start regex `/\blend/` so lend/lending/lender/lenders all qualify,
   while avoiding accidental mid-word matches (e.g. "splendid").

## Deviations from spec
- None. All four advertised typing-animation examples ("USDC on Base", "Lending on
  Plasma", "CRV LP on Curve", "Kamino lending") now parse correctly with the fixes above,
  so no example needed to be swapped — acceptance criterion 6 (EN+KO swap) doesn't apply.
- `getFriendlyProtocolName`'s `protocolNameMap` (app.js) is technically outside
  `parseNaturalLanguageQuery` itself, but the spec's acceptance criteria explicitly calls
  out "protocol map" as an area to fix at root cause (#4), and the Kamino unification is
  the same pattern already used for every other multi-slug protocol in that map — not a
  new abstraction, not a per-string hack.
- Left `protocolChainMapping`'s Curve→Ethereum / Uniswap→Ethereum / Aerodrome→Base
  auto-chain-set behavior untouched — not reported broken by the human and not required
  by any acceptance criterion; changing it would be a ranking/UX judgment call, which is
  explicitly out of scope.
- Did not touch the `isNaturalLanguage` trigger regex in app.js (~line 965, gates
  autocomplete *suggestions* only) to add kamino/solana/convex/plasma — out of scope
  (search UI/UX). The Enter-key handler (the actual submission path the acceptance
  criteria test) calls `parseNaturalLanguageQuery` unconditionally regardless of that
  regex, so this doesn't block any acceptance criterion.

## Verification
- Bugs were confirmed empirically: extracted the *actual* pre-change `parseNaturalLanguageQuery`
  and `getFriendlyProtocolName` bodies from app.js into a throwaway `/tmp` harness and ran
  them against realistic fixtures before writing any fix, to avoid guessing at behavior.
- `node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js && node test_search.js && node test_canonical.js` — all green, all node-only, no network dependency: 190 + 6 + 6 + 13 + 24 assertions.

## Unrelated infra fix bundled in (required to run test_smoke.js at all here)
- `test_smoke.js`'s `chromium.launch()` had no `executablePath`, so Playwright looked for
  browser revision 1228 (matching the `playwright@1.61.1` devDependency) which isn't
  installed — this sandbox pre-installs revision 1194 only, and has no network access to
  download 1228 (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`). Fixed by pointing at
  `/opt/pw-browsers/chromium` when present, per this environment's own documented
  guidance. Zero behavior change for the assertions themselves — purely an environment
  compatibility fix, otherwise test_smoke.js cannot run in this sandbox at all (crashes
  before launching, not merely producing wrong results).

## test_smoke.js result: environment-blocked, not attributable to this change
- After the executablePath fix, chromium launches, but **all 6 smoke assertions fail** —
  including "bare / renders planner UI", a path spec 017 never touches (planner mode
  never loads app.js/search-parser.js at all; `__APP_MODE !== 'analytics'`).
- Root cause: this sandbox's egress proxy returns `403` for `unpkg.com` (verified directly
  with curl — `CONNECT tunnel failed, response 403`), which is where React 18 UMD itself
  loads from (`home.html` lines 131-132, static defer in `<head>`). React never loads, so
  *nothing* mounts on *any* path, regardless of what code changes are in this diff. The
  `/?token=USDC` pool-card assertions additionally need `yields.llama.fi`, also blocked
  the same way (`403`).
- This reproduces identically on the unmodified planner path, which spec 017 cannot have
  broken — proving the failure is this session's network policy, not the diff. CLAUDE.md's
  sandbox note ("external font/analytics fetches fail locally, ignorable") undersold the
  scope here (React's own CDN and the core pools API are also blocked in this particular
  session), but the underlying principle — sandboxed egress failures are environmental,
  not code defects — is the same one that note already calls out.
- Net: 5/6 required test files verified green in this session (test_planner.js,
  test_protocol_parsing.js, test_qualifier_fix.js, test_search.js, test_canonical.js —
  190+6+6+13+24 = 239 assertions). test_smoke.js could not be exercised end-to-end here;
  flagging per NORTH_STAR.md's standing "needs human visual spot-check" note for
  render-path merges pending a network-unblocked environment or CI run.
