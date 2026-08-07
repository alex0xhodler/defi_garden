# 162-notes — the product audit now renders the planner, the default face

## Environment anomaly — resolved: the "second session" was the orchestrator

Both the build agent and the verifier reported, independently and correctly,
that a second `claude` process on branch `claude/quirky-hypatia-xzpyva` was
sharing this container and rewriting files under them mid-run: item comments
flipping between `161` and `162`, `specs/161.md` being renamed with an inserted
"ID note" paragraph, and the committed `signals/audit-findings.json` being
overwritten by an unscoped `node audit-app.js`.

That process was **this run's own orchestrator session** — not a third party.
The sequence, recorded so no future run re-derives it:

1. The item was drafted and dispatched as **161**.
2. Mid-build, the orchestrator queried GitHub and found open PR **#316**
   already holding ID 161 and the branch `claude/loop-161` (a docs-only PR from
   a different session recording the human's "the 5y projection lead goes"
   directive). `git ls-remote` confirmed `refs/heads/claude/loop-161` exists on
   the remote and `claude/loop-162` is free. **The PR #316 claim the verifier
   could not check is real.**
3. The orchestrator renumbered the spec/notes to 162 while the build agent was
   still running. The build agent — correctly, by its own instructions —
   restored its `161` naming and flagged the interference. The verifier saw the
   same churn and, also correctly, verified the substance and escalated the ID
   question as a pre-merge process gate rather than letting it change its
   verdict.
4. After BOTH agents finished, the orchestrator applied the renumber once,
   cleanly, to a quiescent tree. That is the state being committed.

Neither agent did anything wrong; the orchestrator's mid-run edit was the
defect, and the lesson is recorded in `playbooks/loop-container-contention.md`:
never edit a file a running subagent owns — queue the edit until it exits.

`signals/audit-findings.json` is byte-identical to `origin/main` in the shipped
diff (`git status` clean for that path), so no audit output was smuggled in.
Every substantive claim below (findings, mutation-kill, forced-failure demo)
was captured before or re-verified after the interference, and the verifier
re-ran the tests itself and reproduced them.

## What I built

Two new surface `kind`s in `audit-app.js`'s driver (`main()`), and four new
surfaces in the default rotation, wired into the existing checks/helpers only
— no new detector vocabulary, no product file touched.

1. `kind: 'landing'` — bare `/` (search-first landing, mounts into
   `#landing-root` as `.landing-app`).
2. `kind: 'planner'` — `/plan.html` (Garden Planner, mounts into
   `#planner-root` as `.gp-app`; first-screen only — the goal picker).

Four surfaces appended to the default rotation **after** `pool-detail-ko`
(so no existing `surfacesCovered` entry moved or renamed):

| name | url | width | kind |
|---|---|---|---|
| `landing` | `/` | 1280 | `landing` |
| `planner` | `/plan.html` | 1280 | `planner` |
| `planner-360` | `/plan.html` | 360 | `planner` |
| `planner-ko` | `/plan.html?lang=ko` | 1280 | `planner` (`ko: true`) |

Checks per surface, all via the file's existing helpers (`waitForSelector`,
`auditText`, `makeErrorSink`, `checkResponsive`, `finding()`), same check
names already used elsewhere in the file (`dead-end`, `number-sanity`,
`page-error`, `dead-cta`, `responsive`, `i18n`):

- **landing**: `dead-end` (readiness), `number-sanity`, `page-error`,
  `dead-cta` (search submit). No responsive/i18n variant exists for landing
  in the spec's surface table, so none is driven.
- **planner / planner-360 / planner-ko**: `dead-end` (readiness),
  `number-sanity`, `page-error`, `dead-cta` (first goal chip);
  `responsive` only on `planner-360`; `i18n` only on `planner-ko`.

### Deviation from the spec I had to make: CLI `--only=` / `--static-only` did not exist

The spec's A3/A4 assume `node audit-app.js --only=planner` and
`node audit-app.js --static-only` already work as CLI flags. They did not —
`opts.only`/`opts.staticOnly` were real, working `runAudit()` parameters
(every test file calls them directly), but the `require.main === module`
block at the bottom of `audit-app.js` called `runAudit()` with **zero
arguments**, so those flags were silently ignored from the command line.
Confirmed by grep: zero references to `--only=` or `--static-only` (or
`process.argv`) anywhere in `audit-app.js` before this change.

This isn't a scope violation of "no new detector vocabulary" — it's wiring
the existing opts through to the CLI entrypoint, inside `audit-app.js`, the
one file the spec explicitly lets me change. Added ~12 lines right before the
`runAudit()` call in the `require.main` block:

```js
const cliOpts = {};
for (const arg of process.argv.slice(2)) {
  if (arg === '--static-only') cliOpts.staticOnly = true;
  else if (arg.startsWith('--only=')) {
    cliOpts.only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
  }
}
runAudit(cliOpts)
```

Without this, A3 and A4 as literally specified (`node audit-app.js
--only=planner`, `node audit-app.js --static-only`) could not have been run
at all. Flagging this loudly since it's the one place I went beyond "add two
kinds + four surfaces."

## Real selectors used, and where I found them

I did not invent any class name — every selector below is read off a real
file, mostly confirmed against selectors an existing passing test already
asserts on:

- `#landing-root` — `home.html:319` (`<div id="landing-root"></div>`).
- `.landing-app` (with `data-mode="landing"`) — `landing.js:244`.
- `[data-testid="landing-search"]` — `landing.js:300`, the search `<input>`.
  Same selector `test_smoke.js:183`/`test_landing.js:89` already assert on
  for landing readiness.
- `.landing-search-submit` — `landing.js:308`, the search form's `<button
  type="submit">`. This is the landing's one primary next-step control (the
  form's only interactive CTA besides the input itself).
- `#planner-root` — `plan.html:97` / `home.html:318`.
- `.gp-app` — asserted directly in `test_landing.js:123`
  (`#planner-root .gp-app`) and `test_smoke.js:184`
  (`#planner-root .gp-app` count check) and `:192`
  (`#planner-root [class*="gp-"]`). I used `#planner-root .gp-app` — the
  more specific of the two proven-working selectors.
- `.gp-chip` — `planner.js:1394-1409`, the shared `Chips` component's
  `<button type="button" className="gp-chip...">`. This is what the
  goal-picker's `step === 'goal'` first screen (`planner.js:4435-4485`)
  renders for every goal option — confirmed by reading that block: `Chips`
  is the only interactive control rendered before any user input, so it is
  the planner's real "primary next-step control" on first paint (the spec's
  territory note explicitly forbids driving past the first screen).
- The KO Hangul check (`/[가-힣]/.test(text)`) is a literal copy of the
  existing check already running in the `'pool'` branch (`audit-app.js`, the
  `if (s.ko)` block under the pool-detail driver) — same regex, same finding
  shape, same `'i18n'`/`'P2'` severity, scoped to `planner-ko` only. I did
  not extract it into a shared helper (would have touched the existing
  `'pool'` branch, which the spec doesn't ask me to touch), so it appears
  twice in the file now — a very small, deliberate duplication in exchange
  for a strictly additive diff to the existing branch.

## Findings the four new surfaces produced — verbatim

**Zero.** Every real run below — the four-surface scoped run, the full
default-rotation run, and the `test_audit_planner_surface.js` integration
case — returned `findings: []` for `landing`, `planner`, `planner-360`, and
`planner-ko`. No dead-end, no dead-cta, no number-sanity, no page-error, no
i18n miss, no responsive clip on any of the four.

Full-run evidence (`node audit-app.js`, unscoped, 103s):
`surfacesCovered` included all four (`landing`, `planner`, `planner-360`,
`planner-ko`) alongside the 16 pre-162 heartbeat entries; the run's only 5
findings were:

```json
[
  { "surface": "static-prescan", "check": "static-prescan:junk-slug", "severity": "P1", ... },
  { "surface": "static-page:tokens/01", "check": "junk-slug", "severity": "P1", "detail": "rendered <h1> is junk: \"01 DeFi Yields\"" },
  { "surface": "static-page:tokens/17dec2026", "check": "junk-slug", "severity": "P1", ... },
  { "surface": "static-page:tokens/20261231", "check": "junk-slug", "severity": "P1", ... },
  { "surface": "static-page:tokens/2027", "check": "junk-slug", "severity": "P1", ... }
]
```

All five are the **pre-existing** `junk-slug` class on numeric-slug token
pages (backlog 148/154/157's territory — `tokens/01.html`,
`tokens/17dec2026.html`, etc.), unrelated to this item's surfaces. Not a new
finding, not mine to fix here.

**Judgment**: no candidate ticket to open from this item. The spec's own
evidence (item 146, the `mixStats()`/`foreverNumber()` bug) lives on the
post-waitlist SUBSCRIPTION share path, several steps past the first screen —
outside what this item is scoped to drive (spec's territory note: "assert
what the FIRST screen must show; do not drive a multi-step flow"). The
scanner finding nothing on the first screen is consistent with that bug
being real but out of this item's reach, not evidence the scanner is broken.
A later item extending the planner driver into the conversation flow (goal
→ funding-mode → bloom/report) is the natural way to actually catch 146's
bug class with this tooling — flagging that as a real gap, not filing it as
a ticket myself (out of scope per "Scope — audit coverage only").

## Mutation-kill proof (A5)

Baseline hash: `md5sum audit-app.js` → `0ae287f2278ca1880ebf4692928cccd5`.

Mutated the `planner` surface's url to a nonexistent path
(`/plan-MUTATION-PROOF-nonexistent.html` instead of `/plan.html`) — the
product tree (`plan.html` itself) was never touched, only the driver's own
surface definition. Ran `node audit-app.js --only=planner`:

```json
"surfacesCovered": ["planner"],
"findings": [
  {
    "surface": "planner",
    "viewport": "1280px",
    "check": "dead-end",
    "severity": "P1",
    "detail": "planner did not render #planner-root .gp-app within 10s"
  }
]
```
`[audit] findings: 1 total, 1 blocking (P0/P1)` — RED, exactly the new
`dead-end` check firing (not some other pre-existing check).

Restored the url, then:
```
$ md5sum audit-app.js
0ae287f2278ca1880ebf4692928cccd5  audit-app.js
$ md5sum -c before.md5
audit-app.js: OK
```
Byte-identical to the pre-mutation baseline. Re-ran `--only=planner`:
`surfacesCovered: ["planner"], findings: [], 0 total, 0 blocking` — GREEN
again.

## `test_audit_planner_surface.js` (A6)

Two layers:

1. **Source-level** (no Playwright, no server, no browser — cannot be
   skipped for an environment gap): regex-reads `audit-app.js`'s own text
   for the four `{ name: '<name>', ... }` literals and asserts their exact
   `url`/`kind`/`width` (and `ko: true` for `planner-ko`), asserts they sit
   after `pool-detail-ko` in source order, and asserts the literal
   `--static-only` filter line (`surfaces = surfaces.filter((s) => s.kind
   === 'static')`) is present unchanged (the mechanism the exclusion
   depends on).
2. **Integration** (real Chromium via `runAudit()`, same skip-tolerant
   pattern as `test_audit_text_surfaces.js`'s `tryIntegrationCase()` — only
   the `runAudit()` call itself is inside a timeout/catch; every assertion
   sits outside it): Case A drives `runAudit({ only: ['planner'] })` for
   real and asserts `surfacesCovered === ['planner']` with zero
   dead-end/dead-cta findings; Case B drives `runAudit({ staticOnly: true
   })` for real and asserts no `landing`/`planner*` entry appears in
   `surfacesCovered`.

Green run (`node test_audit_planner_surface.js`): **9 passed, 0 failed.**

**Forced-failure demonstration**: temporarily changed the `planner` test
expectation's `width` from `1280` to `9999` (a wrong value the source no
longer matches). Re-ran: **8 passed, 1 failed**, exit code **1**, with the
exact diagnostic:
```
✗ default rotation contains "planner" with url/kind/width per spec
  "planner" literal missing width: 9999 — got: { name: 'planner', url: '/plan.html', kind: 'planner', width: 1280 }
```
Reverted the one-line edit; `md5sum test_audit_planner_surface.js` before
and after the round-trip matched (`b93e909429340a946056abe0ef3d901e`), and a
final re-run was green again (9 passed, 0 failed).

One environment-dependent detail worth recording honestly: Case B
(`staticOnly: true`, real render of the static anchor + 6-page sample)
measured **~95s** in this sandbox. My first cut used a flat 90s hard
timeout for both integration cases and Case B legitimately timed out and
self-reported `(skipped)` — not a false pass, the skip message printed and
was accurate, but it meant the check wasn't actually exercised that run. I
raised the shared timeout to 150s (documented inline in the test) so Case B
consistently completes inside the file's own budget; the whole file still
finishes in well under the 5-minute foreground cap.

## Regression checks (item 6)

- `node test_audit_text_surfaces.js` — **15 passed, 0 failed.** Clean, no
  pre-existing red.
- `node test_audit_app.js` — **3 passed, 0 failed.** Clean, no pre-existing
  red.

Both are genuinely unaffected: neither scopes a run in a way my four new
surfaces could leak into (both use explicit `only:` allowlists that don't
include `landing`/`planner*`, or run unscoped and assert on
`pool-detail`/`dead-pool`-specific findings only).

I additionally spot-checked (grep, not executed, to respect the 5-run
foreground timebox — see "Not run" below) `test_audit_runner.js`,
`test_seo_surface_audit.js`, and `test_audit_prescan.js` for any hardcoded
`surfacesCovered` length/shape assumption my new surfaces could break; all
three scope every `runAudit()` call with an explicit `only:` allowlist of
static-page/prescan surface names, so the new surfaces cannot appear in
their results either.

## A1/A2 evidence (full run)

`node audit-app.js` unscoped completed in **103s** (well inside the 5-minute
cap). `surfacesCovered` (21 entries) contained every one of the 16 entries
the 2026-07-27T07:22Z heartbeat's committed `audit-findings.json` covered
(`grid-token`, `pool-detail`, `grid-chain`, `dead-pool`, `grid-loading`,
`pool-detail-360`, `grid-360`, `pool-detail-dark`, `pool-detail-ko`,
`static-page`, plus that morning's 6 rotated `static-page:*` picks — which
by design change day-to-day, confirmed the *fixed*-name entries are all
present, nothing renamed) **plus** `landing`, `planner`, `planner-360`,
`planner-ko` (and `text-surfaces`, from item 160, which had already merged
but wasn't in that particular older snapshot). Nothing removed, nothing
renamed — I diffed the two `surfacesCovered` arrays programmatically to
confirm this rather than eyeballing it.

## Risk tier — builder's guess

**LOW**, matching the spec's own guess: tooling + tests only, no product
file touched (confirmed empty diff against `home.html`, `plan.html`,
`planner.js`, `app.js`, `PoolDetail.js`, `translations.js`, any CSS, any
generated SEO artifact), no trust-rail constant touched (`APY_SANITY_LIMIT`
is only read, same import line, unchanged), no new dependency, no
user-facing string. Raw diff is `audit-app.js` +85/-6, `package.json` +1/-1,
plus a wholly new 164-line test file — the hand-written product code
(`audit-app.js`) is comfortably under the 150-line LOW cap on its own; the
new test file's size is the same shape item 160 already set precedent for
(a self-contained, additive test file, not product-surface code). Flagging
per the 160 precedent that the verifier assigns independently and has
previously overridden a similarly-scoped item's LOW guess to HIGH — I'm not
asserting this tier is final, only my own read.

## What I could NOT run, and why

- The full 93-file `npm test` chain — never attempted. Per the spec's own
  Timebox section ("The full 93-file `npm test` chain has never been
  observed past position 12 in-sandbox... run the item's own test plus the
  audit tests directly and record that limitation honestly") this is an
  already-documented, standing limitation, not something new I hit.
- `test_audit_runner.js`, `test_seo_surface_audit.js`, `test_audit_prescan.js`
  — grepped for hardcoded surface-shape assumptions (found none that would
  break) but not executed, to keep total foreground time spent on
  verification proportionate; all three are scoped by explicit `only:`
  allowlists that structurally cannot see the four new surfaces.
- A final unscoped `node audit-app.js` full re-run and a final
  `node test_audit_planner_surface.js` full re-run, specifically **after**
  discovering the second live session (see the anomaly section at the top) —
  skipped deliberately once its own `node audit-app.js --static-only`
  process was confirmed still running (bound to the default port 8821,
  confirmed via a live `EADDRINUSE` when I used the default port myself).
  Repeating a 90-150s multi-surface run against an actively-contended
  container risks another file/port race for no evidentiary gain: the exact
  same commands already produced clean, fully green output earlier in this
  session (quoted verbatim above), and the restored file's correctness was
  re-confirmed the cheap way instead — `node -c` syntax check, a source-regex
  re-check of all four surface literals, and one single-surface real render
  (`--only=planner` on a non-default port) that came back
  `surfacesCovered: ["planner"], findings: [], 0 blocking` — i.e. the
  post-restoration file behaves identically to the pre-interference runs.

## Verifier addendum (operator, post-verification)

Verdict **PASS, 8/8, tier LOW** — independently re-derived, not accepted from
this file. What the verifier did on its own:

- Ran the full unscoped `node audit-app.js` itself (21 `surfacesCovered`
  entries, the four new ones present, zero findings on them; exit 1 solely from
  the 5 pre-existing `junk-slug` findings in item 148/154/157 territory).
- Ran `--only=planner` and `--static-only` itself for A3/A4.
- Proved non-vacuity with a **different mutation than the builder's**: it broke
  the `dead-cta` selector (`.gp-chip` → `.gp-chip-MUTATED-NONEXISTENT`) rather
  than the builder's `dead-end` URL mutation, got exactly one `dead-cta` P1,
  restored, `md5sum`-confirmed byte-identical, and re-ran green. So two of the
  four new checks are mutation-killed by two different parties.
- Re-ran `test_audit_planner_surface.js` (9/9), `test_audit_text_surfaces.js`
  (15/15), `test_audit_app.js` (3/3) itself.
- Grep-proved A7/A8 itself, including that the single `?token=` occurrence in
  the diff is unmodified context, not a changed line, and that
  `package.json`'s dependency blocks are untouched.

Verifier's disclosed gap, recorded rather than papered over: it did **not**
execute `test_audit_runner.js`, `test_seo_surface_audit.js` or
`test_audit_prescan.js` — same grep-based reasoning the builder used (all three
scope every `runAudit()` call with an explicit `only:` allowlist that
structurally excludes the new surface names), not an executed proof.

Verifier's pre-merge process gate — "resolve which backlog ID this ships under"
— is resolved above: **162**, on `claude/loop-162`, because PR #316 really does
hold 161 and `claude/loop-161` (confirmed via the GitHub API and `git ls-remote`
by the orchestrator, which the verifier had no access to check).
