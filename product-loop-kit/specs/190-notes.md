# 190 — build notes

Status at handoff: shipped as ONE commit on `claude/loop-190` + PR after **two verifier attempts**
(harness-pinned branch mode,
NORTH_STAR 2026-07-13 docs-in-first-commit rule — code, tests, spec correction, BACKLOG, LOG, this
file and `190-pr.md` all in the same commit, no follow-up docs PR).

## What shipped

**Leg A — the repair.** `ko.landing.footerPoweredBy` and `ko.landing.footerMadeWith` were byte-identical
to their EN counterparts, so the KO footer closed with an English sentence. Now:

- `footerPoweredBy: "데이터 제공:"`
- `footerMadeWith: ". AI와 디젠의 애정으로 만들었어요."`

`landing.js:357-361` composes `[powered] ' ' <a>DefiLlama API</a> [madeWith]`, so the two halves are not a
word-for-word translation — they are written to read correctly **with the link text in that position**.
Rendered result, read back by Playwright: `데이터 제공: DefiLlama API. AI와 디젠의 애정으로 만들었어요.`
The 요-polite register matches the neighbouring KO landing copy (`gardenBody`, `gardenNote`). EN block is
byte-unchanged. `landing.js` untouched.

`translations.min.js` was regenerated via `npm run minify` — `home.html:180` loads the minified asset, so
skipping this would have shipped the copy nowhere (item 061's documented lesson). It was the only other
file the minifier rewrote.

**Leg B — the gate.** New `prescanI18n()` family in `audit-app.js`, modelled directly on the text-surface
prescan (backlog 160) rather than bolted onto it — `translations.js` is a dictionary, and the text family's
APY/TVL regexes have no business scanning it. One signal, `en-ko-parity` (P1), asserting both halves:

1. **Key parity** — flattened EN and KO key sets must be identical; both directions reported.
2. **Value honesty** — a KO leaf byte-identical to its EN counterpart, containing no Hangul, and not on
   `I18N_IDENTICAL_ALLOWLIST` (exact key path — never prefix/substring) is a finding.

Wired next to the text pass: pure fs+require, runs before the browser launches, kill switch
`opts.i18n` / `AUDIT_I18N=0`, `opts.only` filtering, its own `surfacesCovered` entry, one aggregate
finding with ≤10 example keys (never one per key), and `result.i18n = { scanned, suspectCount, bySignal,
allowlistSize }`. `allowlistSize` is present **even at zero suspects** — that is the spec's
"tell clean from allowlisted-into-silence" criterion.

Live on the real dictionary: `{ scanned: 543, suspectCount: 0, bySignal: { 'en-ko-parity': 0 },
allowlistSize: 24 }`.

## Deviations from the spec — two of its measured numbers were wrong

Both were re-measured before building, and the corrections are load-bearing:

1. **Blast radius.** The spec says `landing.js` backs 2,113 `tokens/*.html` + 88 `chains/*.html` = 2,201
   pages, so "2,201 KO landers close with an English sentence." **False.** Generated token/chain pages do
   not load `landing.js` and carry no "Powered by" footer at all (`grep -o 'src="[^"]*"' tokens/usdc.html`
   → only `analytics.js`). `landing.js` is loaded by `home.html:204` alone. The real surface is the bare `/`
   landing route — still the product's default entry, still reached without `?lang=ko` via
   `detectLanguage()`'s `navigator.language` branch, but one route, not 2,201 pages. The defect and the
   fix are unchanged; only the scale claim was inflated.
2. **Allowlist size: 24, not 8.** The spec counted 10 zero-Hangul KO values (8 brand + 2 prose). A full
   flattened re-measurement finds **26**: the same 2 prose defects plus **24** legitimate brand/acronym
   values (`APY`, `TVL`, `RWA`, `LP/DEX`, `Max`, `Hulu`, `Peacock`, `Walmart+`, `Audible`, `DoorDash`,
   `Uber One`, `Spotify`, `Netflix`, `Claude Pro`, `ChatGPT Plus`, `Apple TV+`, `Leviathan News`,
   `DefiLlama API`, …). Seeding the allowlist with the spec's 8 would have shipped a gate that reports 16
   false findings on a clean dictionary on day one — which is how a gate gets muted. Each of the 24 carries
   a one-line reason in the source.

The spec's key-parity measurement (543/543, 0 missing either direction) reproduced exactly.

**Consequence for the acceptance criteria.** The spec's rendered criterion names a `tokens/*.html` lander.
That page never renders this footer, so the criterion as written is unsatisfiable-by-construction. It was
re-aimed at the route that actually renders it — bare `/?lang=ko` — which is a strictly stronger check than
the spec intended (it exercises the real `home.html` + `translations.min.js` boot path). This is a
correction of the spec's evidence, not a relaxation of its bar, and it changes no architecture, so the
build proceeded rather than blocking (build.md §1's BLOCKED rule is for architecture-changing unknowns).

## Tests

- `test_audit_i18n_parity.js` (new, 13 assertions) — modelled on `test_audit_prescan.js`. Contains the
  item's point: the **positive control**, injecting a fixture dictionary with (a) a KO key missing and
  (b) a non-allowlisted KO value byte-identical to EN, asserting the signal reports **both**. Plus:
  missing-in-EN direction; allowlist does not swallow a real finding sitting next to allowlisted keys;
  allowlist is exact-key-path (an allowlisted `planner.goalMax` does **not** silence `planner.goalMaxPlus`);
  nested-namespace flattening; function/array/number leaves never produce a value finding (parity only);
  differs-from-EN and contains-Hangul are both clean; the real dictionary reports 0 suspects with
  `allowlistSize === 24`; and four never-throws loader-robustness cases.
- `test_ko_landing_footer.js` (new, 2 assertions, Playwright, PORT 8867) — modelled on
  `test_footer_hub_links.js` (fixture-routed static server, `CHROMIUM_EXECUTABLE` fallback,
  `IGNORABLE_ERROR_PATTERN`, page-error collection). Drives the real rendered app: `?lang=ko` footer
  paragraph contains Hangul, the `DefiLlama API` anchor renders **inline** with non-empty Korean text both
  before and after it, neither English half survives, the full paragraph equals the exact expected KO
  sentence, and zero non-ignorable page errors. Control: `?lang=en` renders the English sentence unchanged.
  Because this route reads `translations.min.js`, the test also proves the minify regen landed.
- Both files added to `package.json`'s `test:serial` chain (`run-tests.js` auto-discovers `test_*.js`, but
  the explicit list must stay complete).

## Verification

Pre-existing red measured on a clean `origin/main` **before** any edit (playbook
`pre-existing-red-triage.md`): `test_i18n_pages.js` and `test_translations_fallback.js` failed with
`MODULE_NOT_FOUND` (`@napi-rs/canvas`, `terser`) — a bare checkout with no `node_modules`, not a code
defect. After `npm ci`, the clean-baseline run was **fully green**, so every result below is attributable
to this change:

| Command | Baseline (clean `main`) | After |
|---|---|---|
| `test_planner.js` / `test_protocol_parsing.js` / `test_qualifier_fix.js` | PASS | PASS (208 / 9 / 9) |
| `test_i18n_pages.js` | PASS | PASS (19) |
| `test_ko_pool_money_honesty.js` | PASS | PASS (7) |
| `test_translations_fallback.js` | PASS | PASS (8) |
| `test_audit_prescan.js` | PASS | PASS (48) |
| `test_audit_text_surfaces.js` | PASS | PASS (49) |
| `test_footer_hub_links.js` | PASS | PASS |
| `test_audit_app.js` | — | PASS (3) |
| `test_minified_assets.js` | — | PASS (9) |
| `test_audit_i18n_parity.js` (new) | — | PASS (13) |
| `test_ko_landing_footer.js` (new) | — | PASS (2) |

A full `node audit-app.js` CLI run confirmed `i18n` appears in `surfacesCovered` with the result block
above. That run's generated side-effect files (`product-loop-kit/signals/audit-findings.json`,
`audit-rotation.json`) were reverted — out of scope for this item.

## Noticed, deliberately not fixed

- KO copy *quality/naturalness* beyond these two strings is human judgment, explicitly out of scope.
- The 24 allowlisted values are brand names and acronyms by inspection; no attempt was made to decide
  whether any of them *should* be localized (e.g. `Netflix` → `넷플릭스`). That is a copy decision for the
  human, and the gate's decision rule already flags allowlist growth for non-brand strings.
- The spec's own open question — whether KO is worth its maintenance tax at ~1 KO `page_view`/week — is
  the human's to answer; it is restated in this run's report, not decided here.

## Verifier attempts

**Attempt 1 — FAIL, on risk tier only.** All nine functional acceptance criteria were met and independently
re-derived: the verifier re-flattened the dictionary itself (543/543 parity; 26 zero-Hangul identical values
on `origin/main`, 24 after the fix — confirming the "24 not 8" correction is honest), checked
`tokens/usdc.html` and `chains/ethereum.html` for `landing.js` itself (absent — confirming the blast-radius
correction), ran the covering test set, ran a bare `node audit-app.js` to see `i18n` in `surfacesCovered`,
reproduced `translations.min.js` byte-identically from `npm run minify` (proving it is not a hand-edit), and
tried to falsify the allowlist's exactness with its own fixtures (dotted literal keys, superstring keys,
case variants) without success.

The failure: **`git diff origin/main --numstat` = 224 tracked lines** (`audit-app.js` 195/3 alone), against
NORTH_STAR's LOW-lane **150-line cap**, which house precedent (LOG.md item 020) enforces on raw numstat even
at a 1-line overage. The spec's own "diff well under 150 lines" claim was simply false, and NORTH_STAR is
explicit that misclassifying risk is itself a FAIL.

**Fix taken: option (b) — re-tier to HIGH, don't trim.** The verifier offered either trimming `audit-app.js`
under the cap (largely by deleting rationale comments) or re-tiering honestly. Trimming would have removed
the allowlist's reason-per-entry and the growth-policy comment — the two things the spec calls the item's
load-bearing design decision — to satisfy a number. So: `specs/190.md`'s risk section now reads HIGH with the
measured line counts, and `specs/190-pr.md` was rewritten as the HIGH lane's full walkthrough + 5-question
quiz (answers base64 at the bottom). Nothing else in the HIGH list is engaged — no trust rail, no router, no
parameterized URLs, no hand-edited SEO surface, no config/dependency change — so per NORTH_STAR's 2026-07-10
autonomy decision (verifier PASS + green tests → merge, ANY tier), HIGH still auto-merges once the explainer
exists. The verifier's own template line ("if you say HIGH, it cannot auto-merge") predates that decision;
NORTH_STAR is the human-owned policy and item 189 shipped HIGH auto-merged on the same rule.

**Attempt 2 — re-verified at HIGH; verdict recorded in the BACKLOG row and LOG entry.** No product code
changed between attempts: the only edits were the tier correction in `specs/190.md`, the rewritten
`specs/190-pr.md`, and these notes.
