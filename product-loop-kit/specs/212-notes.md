# 212 — build notes

Branch `claude/loop-212`, base `origin/main` @ `a40c5c0ff`. **Attempts: 2** (verifier FAIL on attempt 1 —
see "The verifier FAIL" below). Operator: Opus 5 (planning, blindspot pass, corrections, verification
judgment); implementation by a dispatched Sonnet 5 coding agent per the 2026-08-03 routine directive.

## The verifier FAIL, and what it caught (attempt 1 → 2)

Attempt 1 was verifier-FAILed on one criterion — "the silent fallback is gone" — and the finding was
real, not a technicality.

**`/?app=1` still returned `llms.txt`.** `app` is a member of `home.html:77`'s `ANALYTICS_PARAMS`, so it
switches `/` into analytics mode exactly the way `?token=`/`?pool=` do. It is a live, linked URL:
`planner.js:3863` uses `/?app=1` as the planner header's "📊 Analytics — search yields" icon — the
documented route from the planner to the analytics app — and `PoolDetail.js:396` emits it in breadcrumb
JSON-LD. So the item's headline defect survived on a URL the product itself links.

**The more useful half of the finding is why the drift guard missed it.** Attempt 1's guard scanned for
literal `.get('key')` calls. `app` is never read that way — `home.html:79` tests it with
`ANALYTICS_PARAMS.some(k => params.has(k))`. The guard was not merely incomplete; it was watching the
wrong mechanism, and attempt 1's notes and PR explainer both claimed it protected against exactly the
class of failure it was blind to. That overstatement is corrected in both files.

**Fix (attempt 2):**
- `{"type":"query","key":"app"}` added to the `missing` array on both the `/` markdown rewrite and its
  matching header rule. (Round 4 below moved `app` out of those arrays and onto a positive rule — Vercel
  caps `has`/`missing` at 16 — but the covered set is unchanged at 17 params.)
- **The guard now derives from the router itself.** It parses `ANALYTICS_PARAMS` and `PLANNER_PARAMS` out
  of `home.html` and asserts **exact set equality**, both directions, against the `missing` list on both
  rules. Those two arrays *are* the definition of "this query string changes what `/` serves", so equality
  with them is the correct invariant and cannot rot the way a `.get()` scan does. The hand-maintained
  `EXCLUDED_PARAMS` comment list is gone: `lang`/`src`/`ref`/`mix`/`pitch`/`waitlist` are excluded
  structurally now (not in either array), so nothing needs justifying in prose. The `.get()` scan survives
  only as an explicitly-downgraded secondary check.
- A third check sweeps `home.html` for any literal `params.has('key')`/`searchParams.has('key')` call — a
  mechanism neither array would cover. **Zero hits**, so the two arrays are provably the complete set of
  mode-selectors on `/`. That question was asked explicitly and answered explicitly rather than assumed.
- Explicit assertion added: `/?app=1` + `Accept: text/markdown` → the HTML app, never `/llms.txt`.

Operator re-derived the result independently of the test: the `missing` list on the rewrite, the `missing`
list on the header rule, and the union of the two router arrays are all the same 17 keys
(`app,capital,chain,dl,fm,fresh,goal,minApy,minTvl,monthly,pace,pool,poolTypes,preset,protocols,token,years`)
— after round 4, 16 of them via `missing` and `app` via a positive rule, which the guard counts as covered.

The verifier also disclosed that, while reproducing the fixture run, it overwrote four real sitemap files
with fixture output and restored them via `git checkout origin/main -- <files>`. Operator re-checked
independently: `git diff --name-only origin/main -- 'sitemap*.xml' robots.txt 'stories/*' '*.html'` is
**empty**. No contamination reached the diff.

## Deviations from the spec, and why

**1. Leg 4 shipped as an assertion, not a fix — the spec's premise was wrong.**
The spec listed `/plan.html` returning `Redirecting...` as a negotiation defect. Re-measured live this
session: `/plan.html` → **308**, `location: https://www.defi.garden/plan`, body `Redirecting...` (15 B,
`text/plain`); `/plan` → **200 `text/html`, 8,778 B**, the real planner. That 308 is `"cleanUrls": true`
doing its job, and it fires for every request to a `.html` URL regardless of `Accept` — the spec's probe
caught the redirect stub instead of following it to the resource. `/plan` already satisfies leg 3 exactly
(no twin → serve the HTML). **Conservative choice:** no `vercel.json` change. "Fixing" this would have
meant altering `cleanUrls` site-wide to chase a non-defect. It ships as test assertions instead —
`cleanUrls` is still `true`, and `/plan` + `Accept: text/markdown` matches no markdown rule.

**2. The `.md` twins are NOT committed in this PR. This is a parity requirement, not laziness.**
`tokens/*.html` (2,105 tracked files) are written by `sitemap-update.yml` from one live DefiLlama fetch.
Generating `.md` here would fetch at a *different* moment, so the committed twin's APYs would disagree with
the committed HTML on day one — failing the spec's own "twin-vs-HTML fact parity" criterion the moment it
landed. Parity is structural only when both files come out of the **same** generator run. That run is CI's:
`sitemap-update.yml`'s `push` trigger already lists `generate-token-pages.js` and `generate-chain-pages.js`
in its `paths`, so **merging this PR is itself the trigger**. Same convention as items 045/050/051.

**Honest cost, stated rather than buried:** between merge and that CI run completing, `Accept:
text/markdown` on `/tokens/<slug>` returns **404** instead of markdown. Two reasons that is the right trade:
a 404 is an honest "no document here", which is the entire point of leg 3, versus today's confidently-wrong
site index; and the window is the length of one CI run, not days. Committing twins to close a
minutes-long window would have permanently broken the parity criterion.

**3. Nine planner params added to the `missing` list beyond the spec's analytics-app set.**
The build agent's drift-guard scan surfaced that `home.html`'s router has a `PLANNER_PARAMS` array as well
as `ANALYTICS_PARAMS`, so `/?goal=retirement&monthly=200` + `Accept: text/markdown` also returned
`llms.txt` — the same wrong-answer defect on the product's DEFAULT surface. The agent initially excluded
them as out of scope and documented the finding; the operator reversed that call. Leg 3's wording is
unconditional ("a path with no twin must serve the normal HTML response, NOT `llms.txt`"), and the fix was
nine more entries in a list already being edited. Shipping leg 3 while knowingly leaving half of it broken
would have made the item's headline claim untrue. The covered set ended at **17** params: the spec's 7
(`token`, `chain`, `pool`, `protocols`, `poolTypes`, `minTvl`, `minApy`) plus `goal`, `monthly`, `years`,
`pace`, `preset`, `fresh`, `capital`, `fm`, `dl` — and `app`, which attempt 1 missed and the verifier
caught (above). Worth recording that the same reasoning that added the nine planner params should have
added `app` in the same pass; it did not, because the scan used to find them looked at `.get()` calls
instead of at the router's own arrays.

**4. Two rewrite defects found and fixed during review that neither the spec nor round 1 caught.**
- Vercel's bare `:slug` matches `[^/]+` **including dots**, so `GET /tokens/usdc.md` with
  `Accept: text/markdown` rewrote to `/tokens/usdc.md.md` → 404. An agent following the twin's own URL
  would have got nothing. Verified no generated slug contains a dot (`ls tokens/ | sed 's/\.html$//' |
  grep -c '\.'` → 0, likewise `chains/`), so every markdown rewrite and its matching header rule is now
  constrained to `:slug([^/.]+)` — excluding `.md` and every other extension by construction.
- `/tokens/index` and `/chains/index` (and their `ko/` twins) matched `:slug`, had no `.md`, and would
  have 404'd under markdown negotiation — a leg-3 violation. Four unconditional passthrough rewrites to
  their `.html` now sit **before** the `:slug` rules (first-match-wins short-circuits them). All four
  target files were confirmed to exist. `/tokens/az/<letter>` is three segments, never matched — asserted
  rather than given a rule.

## Round 4 — the PR deploy failed on a Vercel schema cap (attempts still 2; this is a platform fix, not a verifier FAIL)

The 17-entry `missing` arrays were **rejected by Vercel at deploy time**, verbatim:

> The `vercel.json` schema validation failed with the following message: `headers[1].missing` should NOT
> have more than 16 items

A hard schema cap on `has`/`missing`, not a warning — the deployment errors out, so nothing ships. Worth
recording plainly: **this was only discoverable by deploying.** Every local gate was green, `vercel.json`
was valid JSON, and 71 offline assertions walked the rewrite table correctly. Config that is syntactically
valid and semantically right can still be rejected by the platform's own schema, and the PR deploy is the
only place that shows up.

**Fix, chosen for blast radius rather than elegance:** keep 16 in `missing` and move exactly one param —
`app` — onto a *positive* rule.
- Rewrites: `{"source":"/","has":[{"type":"query","key":"app"}],"destination":"/home"}` placed **before**
  the `llms.txt` rule. Rewrites are first-match-wins, so this leg is fully deterministic.
- Headers: an override rule keyed on `Accept: text/markdown` AND `app` present, setting
  `Content-Type: text/html; charset=utf-8`, placed **after** the markdown header rule.

**The asymmetry is real and is left visible rather than smoothed over:** the rewrite leg relies only on
documented first-match-wins; the header leg relies on later-overrides-earlier in Vercel's header merge.
`app` is the param that was moved precisely because it has the smallest blast radius if that second
assumption is wrong — the body is decided by the rewrite leg either way, so the worst case is one
human-clicked URL (`/?app=1`, the planner's analytics header icon) returning a correct HTML body under a
`text/markdown` label.

**The invariant did not weaken.** The drift guard now compares the router union against
`missing ∪ positive-rule keys`, still exact equality in both directions, for both the rewrite and the
header table. A **new regression test** asserts every `has` and every `missing` array anywhere in
`vercel.json` is ≤16 entries, quoting the Vercel error text so the next reader sees a platform limit rather
than a style rule. The guard's positive-rule scan is generic, not `app`-keyed, so a second param needing
the same treatment is recognised automatically.

Operator re-derived independently of the tests: no over-cap array anywhere in the file; rewrite coverage =
`missing` (16) ∪ positive (1) = exactly the 17-key router union; shadow rule at rewrite index 0, `llms.txt`
rule at index 1.

## What was deliberately NOT done

- No `.md` in any sitemap, plus `X-Robots-Tag: noindex` on every markdown response — **both**, per the
  spec's open-question recommendation. Rationale in `212-pr.md`.
- No new translation keys. Every string in both markdown renderers resolves through existing
  `translations.js` keys (`tcpTokenHeading`, `tcpColProtocol/Chain/Apy/Tvl/Token`, `tcpTrustNote`,
  `tcpFaqHeading`, `tcpRelatedTokensHeading`/`tcpRelatedChainsHeading`, `tcpAvailableOnHeading`,
  `tcpTopTokensOnHeading`, `tcpLastUpdated`) — verified resolving to real EN and real Hangul in both
  languages, so EN/KO parity is structural rather than maintained by discipline.
- Hub and A–Z pages get no twin (they are navigation, not facts).
- No touch to `app.js`, `PoolDetail.js`, `planner.js`, `llms.txt`/`llms-full.txt`, `.well-known/*`,
  `stories/`, or any trust rail.

## Verification actually run (not claimed)

- **`.html` byte-identity proof.** Generators run from `origin/main` (worktree) and from this branch
  against the SAME fixture into scratch dirs: **30/30 `.html` byte-identical** (`cmp -s`), identical file
  lists, and all 8 OG `.png` outputs byte-identical too. Only the 16 `.md` files differ — present in B
  only, as intended.
- **Plain lane, branch: `44 pass / 0 fail / 0 timeout`** (42 pre-existing + the 2 new files).
- **Plain lane, `origin/main` baseline (clean worktree): `42 pass / 0 fail / 0 timeout`.** No pre-existing
  red in this lane, so nothing to triage per `playbooks/pre-existing-red-triage.md`.
- **`test_smoke.js` (the CLAUDE.md both-router-paths gate): PASS, 130.7s** on the branch. This is the
  acceptance criterion "bare `/` → planner, `/?token=USDC` → analytics app with pool cards".
- **New tests: `test_markdown_negotiation.js` 63/63, `test_markdown_twins.js` 16/16.**
- `vercel.json` and `package.json` both re-parse as valid JSON.

**Browser-lane coverage is partial and here is exactly how partial.** A baseline run of the 88-file browser
lane on clean `origin/main` was cut off by the 5-minute-per-job timebox after **65 files**, with a
per-file cap of 100s (well below the lane's 600s default). Result: **1 genuine pre-existing red —
`test_waitlist_seo_entry.js`, FAIL in 2.26s on unmodified `origin/main`, unrelated to this diff** — and 8
files recorded TIMEOUT purely because of the artificial 100s cap (`test_smoke.js` was one of them, and it
passes in 130.7s when given room, as above). The remaining 23 browser files were not run in either
baseline or branch. Justification for proceeding rather than extending: this diff changes `vercel.json`
(never served by `dev-server.js`, so no browser test can observe it) and two static-page generators
(covered by the plain-lane `test_token_pages.js` 100/100 and `test_chain_pages.js` 91/91). No render-path
file was touched. Per the 2026-07-11 timebox decision: documented and proceeded.

## Playbook

`playbooks/mode-enumeration-staleness.md` **UPDATED** (not duplicated) with a new section: *"the
enumeration lives OUTSIDE the app (edge config, CI, a generator)"*. That playbook already taught
"enumerate the modes that exist NOW, from the router, not from memory" for in-app mode-conditional rules;
this item hit the same failure one layer down, in `vercel.json`, and the verifier FAIL made the reusable
lesson sharp enough to be worth a checklist: mirror the definition rather than re-deriving it; guard with
**set equality against the defining arrays, both directions**; and — the trap that actually cost an
attempt here — **check which mechanism the definition uses before writing the guard**, because a guard
aimed at a mechanism that merely resembles the real one passes forever and launders the gap as coverage.
The Vercel routing traps found along the way (`:slug` matching dots, sibling paths with no target needing
an earlier passthrough) are recorded there too.

`playbooks/agent-readability-audit.md` needed no change — its "run the residue checks, not the checklist"
framing was confirmed by this build, not extended.

## Follow-up candidate (filed here, not built — one item per loop)

`llms.txt` itself is EN-only, and `lang` is a documented exclusion from the `missing` list, so
`/?lang=ko` + `Accept: text/markdown` serves an English site index to an agent that asked for Korean.
Defensible today (the index is genuinely language-neutral in content) but worth a decision once the KO
twins are live in CI.
