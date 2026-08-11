# Backlog 261 — build notes

Leg A only (Leg B — the `openapi.json` path-set drift — is explicitly out of
scope here, filed as backlog 262 per the spec).

## Summary of changes

- **`openapi.json:17`**: `"…TVL >= $10M and APY <= 1000%."` →
  `"…TVL >= $100K and APY <= 1000%."`. The `$100K` substring is
  `formatTvlFloor(DEFAULT_MIN_TVL)`'s actual output (verified interactively:
  `node -e "console.log(require('./trust-rails.js').formatTvlFloor(100000))"`
  → `$100K`), typed once and matched against that output, not re-derived by
  eye. One line changed, JSON stays valid.
- **`tools/get_curated_pools.json:5`**: same substitution, same source of
  truth. One line changed, JSON stays valid.
- **New `test_agent_surface_rail_claims.js`** (plain lane — confirmed via
  `node run-tests.js --list --lane=plain` / `--lane=browser`, see Verification
  below): the machine-surface counterpart to `test_rail_floor_derivation.js`
  (backlog 254's prose-side guard). Same idiom: population derived at test
  time (never hand-typed), every found claim asserted against the value
  `trust-rails.js` derives, failure messages carry file:line, in-file
  anti-vacuity floor.
- **`package.json`**: `test:serial` — appended
  `&& node test_agent_surface_rail_claims.js` at the very end of the chain
  (literal reading of the task's "append… to `test:serial`"; see Deviation 1
  below for why it isn't grouped next to `test_rail_floor_derivation.js`
  despite the thematic similarity).

## How the population is derived

`fs.globSync` (Node's own built-in, stable and warning-free on the pinned
`engines.node: "22.x"` — verified with a throwaway script; see Deviation 2)
against the patterns copied verbatim from spec 261's own population list:

```
openapi.json
tools/*.json
.well-known/**/*.json
edge/API.md
llms.txt
llms-full.txt
```

On this tree that resolves to **16 files**: `openapi.json`, `edge/API.md`,
`llms.txt`, `llms-full.txt`, both `tools/*.json` files, and 10
`.well-known/**/*.json` files (the `.well-known/agent-skills/...` tree's
`.md`/`.py`/`.txt` siblings are correctly excluded by the `*.json` suffix —
confirmed one of them, `references/ai-visibility-audit.md`, carries an
unrelated "$200M TVL" marketing claim about a *different* product; excluding
it is correct, not a loophole, since it isn't `*.json` and isn't a claim about
DeFi Garden's rail).

## How the claim-shaped scan is built

Two independent pattern sets, applied line-by-line (so failure messages carry
a real line number) — not a single generic "find any dollar/percent figure"
scan:

- **TVL-floor claim**: a money figure immediately adjacent to a floor phrase
  — `TVL >= …` / `TVL ≥ …`, `TVL of at least …`, `minimum TVL …`. Captures the
  **rendered text** (`"$100K"`, `"$10M"`, …) and compares it as a **string**
  against `formatTvlFloor(DEFAULT_MIN_TVL)` — never parsed back into a number,
  which would require a second formatter (exactly what `trust-rails.js`'s own
  header comment warns against).
- **APY-limit claim**: a percent immediately adjacent to a ceiling phrase —
  `APY <= …` / `APY ≤ …`, `capped at …`. Captures the **number** and compares
  it numerically against `APY_SANITY_LIMIT`.

On the current tree this finds **5 TVL-floor claims** (`openapi.json`,
`tools/get_curated_pools.json`, `llms.txt` ×2, `llms-full.txt`) and **4
APY-limit claims** (`openapi.json`, `tools/get_curated_pools.json`, `llms.txt`,
`llms-full.txt`) — both comfortably above the spec's "<2 = FAIL" anti-vacuity
floor.

## Deviations / conservative choices (be honest, per the task)

1. **`test:serial` placement — literal "append" over thematic grouping.**
   The task said *"append `&& node test_agent_surface_rail_claims.js` to
   `test:serial`"*. My first instinct was to insert it next to
   `test_rail_floor_derivation.js` (its thematic sibling) since that's where a
   human skimming the chain would look for it. I reverted that and appended
   at the literal end of the chain instead, because "append" has an
   unambiguous meaning and `test_test_registry.js`'s registry check is
   order-agnostic (it checks membership, not position), so there's no
   correctness reason to prefer the thematic placement over the literal
   instruction. Verified: `git diff package.json` shows the new step as the
   last item before the closing quote, one line changed.
2. **`fs.globSync` instead of a hand-rolled recursive walk.** Node 22 (the
   pinned `engines.node`) ships `fs.globSync` as a stable, dependency-free
   API. I used it rather than writing a second directory-walker (the repo
   already has one in `test_rail_floor_derivation.js`, but that one walks a
   *fixed* shallow set — root `*.html` + two named files + `stories/*.html` —
   not an arbitrary `**` pattern, so it wasn't directly reusable). Confirmed
   no experimental-warning noise on stderr with a throwaway invocation before
   committing to it. This is "globbing" in the most literal, no-new-
   dependency sense available.
3. **Comment-syntax gotcha, fixed before it shipped.** My first draft's
   header comment spelled the glob pattern as `.well-known/**/*.json` inside
   a `/* … */` block comment — the `**/` substring contains a literal `*/`,
   which closed the comment early and caused a `SyntaxError` on the very
   first run. Rewritten as `.well-known/** (recursive) *.json` in prose (the
   `GLOB_PATTERNS` array's actual string literal, `'.well-known/**/*.json'`,
   is unaffected — string literals don't parse as comments). Caught
   immediately by running the file, not shipped.
4. **The real-content per-chain-figure check runs against `llms.txt` only,
   not `llms-full.txt`.** The spec's example ("`llms.txt`'s hundreds of
   legitimate per-chain TVL figures (`Ethereum ($86.9B TVL)`)") names
   `llms.txt` specifically. I initially wrote a test asserting BOTH files
   contain that shape and it went red — `llms-full.txt`'s "full estate"
   section lists bare URLs (chain/token page links), not `($X TVL)` figures;
   only `llms.txt`'s curated "Top Chains by TVL" section does. Fixed by
   scoping that one real-content sanity check to `llms.txt`, and keeping a
   separate, file-independent synthetic check (the pattern tested directly
   against the literal string `"Ethereum ($86.9B TVL)"`) to prove the
   exclusion is shape-based regardless of which file it appears in. This is a
   test-correctness fix, not a scope change — the underlying claim-shaped
   regex behaves identically either way.
5. **Known coverage limitation, recorded rather than silently accepted**
   (same shape as `test_rail_floor_derivation.js`'s own documented one, see
   its header comment): `edge/API.md:50` states
   `` `APY_SANITY_LIMIT = 1000` (percent), `DEFAULT_MIN_TVL = 100000` (USD). ``
   — a bare constant-name-equals-number form, not any of the three named
   floor/ceiling phrases. This claim is (a) currently correct, and (b) not
   flagged by this scan either way, because it doesn't match the shapes the
   spec's own bullet enumerates. If it drifted wrong tomorrow, this test
   would not catch it. This is a real, intentional gap in the DETECTOR
   (matching the exact shapes named in spec 261 §Change Leg A item 2), not a
   vacuity bug in the SCAN — the anti-vacuity assertions prove the scan finds
   real claims via the shapes it does cover (5 TVL, 4 APY, both well above the
   2-claim floor). Left as-is rather than adding a fourth ad hoc shape not
   asked for by the spec, to avoid guessing at a phrasing the spec didn't
   specify and potentially over-fitting to today's one occurrence.
6. **No changes to `edge/API.md`, `.well-known/**`, or any file outside the
   three the task named plus this notes file** — confirmed by
   `git status --porcelain` before writing this file (see Verification).
   `product-loop-kit/BACKLOG.md` shows as modified in `git status`, but that
   modification pre-dates this session (present in the initial `git status`
   read before any edit was made) and was never touched here.

## Verification

All commands run from repo root, well under the 5-minute timebox (all
completed in well under 1 second each).

### `node test_agent_surface_rail_claims.js` — GREEN

```
agent-facing surface rail-claim scan — backlog 261

population: 16 file(s) globbed
[
  ".well-known/agent-skills/agentic-readiness/templates/oauth-authorization-server.json",
  ".well-known/agent-skills/agentic-readiness/templates/vercel-agentic-readiness.json",
  ".well-known/agent-skills/index.json",
  ".well-known/api-catalog.json",
  ".well-known/mcp.json",
  ".well-known/mcp/server-card.json",
  ".well-known/mcp/server-cards.json",
  ".well-known/oauth-authorization-server.json",
  ".well-known/oauth-protected-resource.json",
  ".well-known/openid-configuration.json",
  "edge/API.md",
  "llms-full.txt",
  "llms.txt",
  "openapi.json",
  "tools/calculate_projection.json",
  "tools/get_curated_pools.json"
]
  ✓ population is non-vacuous and includes both known defect sites

claims found: 5 TVL-floor claim(s), 4 APY-limit claim(s)
  ✓ claim-shaped regex does not match a per-chain TVL figure shape (e.g. "Ethereum ($86.9B TVL)") — proves this is not a whole-file number scan
  ✓ the real, committed llms.txt carries per-chain TVL figures yet none were captured as floor claims (the exclusion is shape-based, not a file exclusion)
  ✓ anti-vacuity: at least 2 TVL-floor claims found across the population
  ✓ anti-vacuity: at least 2 APY-limit claims found across the population
  ✓ every TVL-floor claim equals formatTvlFloor(DEFAULT_MIN_TVL) ("$100K")
  ✓ every APY-limit claim equals APY_SANITY_LIMIT (1000)

7 assertions passed (population: 16 files; TVL claims: 5; APY claims: 4; expected TVL floor: $100K; expected APY limit: 1000)
```
Exit code 0. Population/claim counts as printed: **16 files, 5 TVL claims, 4
APY claims.**

### `node test_test_registry.js` — GREEN (5/5 assertions passed, exit 0)
### `node test_rail_floor_derivation.js` — GREEN (5 assertions passed, exit 0)
### `node test_llms_rails.js` — GREEN (14 assertions passed, exit 0)

### JSON validity

```
$ node -e "JSON.parse(require('fs').readFileSync('openapi.json','utf8'))"
$ node -e "JSON.parse(require('fs').readFileSync('tools/get_curated_pools.json','utf8'))"
```
Both exit 0, no output (valid JSON).

### `git diff --numstat openapi.json tools/get_curated_pools.json`

```
1	1	openapi.json
1	1	tools/get_curated_pools.json
```
Exactly 1 insertion + 1 deletion each, as required.

## Non-vacuity proofs

### (a) Mutate `openapi.json`'s floor string → red on exactly that assertion; restore byte-identical → green

```
$ md5sum openapi.json
227ecd8185f491232b8b4e32551a11b9  openapi.json

$ sed -i 's/TVL >= \$100K/TVL >= \$99K/' openapi.json
$ node test_agent_surface_rail_claims.js
  ...
  ✗ every TVL-floor claim equals formatTvlFloor(DEFAULT_MIN_TVL) ("$100K")
    openapi.json:17: stated "TVL >= $99K" (found "$99K", expected "$100K" per formatTvlFloor(DEFAULT_MIN_TVL))
  ...
FAILED   (exit 1)

$ cp /tmp/openapi.json.orig openapi.json   # restore
$ md5sum openapi.json
227ecd8185f491232b8b4e32551a11b9  openapi.json   # byte-identical to before
$ diff /tmp/openapi.json.orig openapi.json && echo BYTE-IDENTICAL
BYTE-IDENTICAL

$ node test_agent_surface_rail_claims.js
  ...
7 assertions passed ...   (exit 0)
```
Failure message carried the exact `file:line` (`openapi.json:17`) as
required. md5 before and after restore: identical
(`227ecd8185f491232b8b4e32551a11b9`).

### (b) Neuter the claim regex so it matches nothing → the anti-vacuity minimum-count assertion goes red; restore byte-identical → green

```
$ md5sum test_agent_surface_rail_claims.js
456b9056d44f21999a9f8b360a0ff49c  test_agent_surface_rail_claims.js
```

Replaced `TVL_CLAIM_PATTERNS`/`APY_CLAIM_PATTERNS` with patterns that cannot
match anything in the repo (`/NEUTERED_NO_MATCH_TVL_XYZZY_(\$[\d,.]+[KMBkmb]?)/gi`
and the APY equivalent):

```
$ node test_agent_surface_rail_claims.js
  ...
claims found: 0 TVL-floor claim(s), 0 APY-limit claim(s)
  ...
  ✗ anti-vacuity: at least 2 TVL-floor claims found across the population
    expected >=2 TVL-floor claims, found 0: []
  ✗ anti-vacuity: at least 2 APY-limit claims found across the population
    expected >=2 APY-limit claims, found 0: []
  ...
FAILED   (exit 1)
```
This proves a silent no-match (the regex finding nothing at all) cannot read
as green — the anti-vacuity assertions are what catch it, exactly as spec 261
requires.

```
$ cp /tmp/test_agent_surface_rail_claims.js.orig test_agent_surface_rail_claims.js   # restore
$ md5sum test_agent_surface_rail_claims.js
456b9056d44f21999a9f8b360a0ff49c  test_agent_surface_rail_claims.js   # byte-identical to before
$ diff /tmp/test_agent_surface_rail_claims.js.orig test_agent_surface_rail_claims.js && echo BYTE-IDENTICAL
BYTE-IDENTICAL

$ node test_agent_surface_rail_claims.js
  ...
7 assertions passed ...   (exit 0)
```

### (c) Population-growth proof — a new agent-facing file with a wrong rail claim turns the test red without editing the test; delete it → green

```
$ cat > tools/_temp_population_growth_proof.json <<'EOF'
{
  "type": "function",
  "function": {
    "name": "temp_proof_tool",
    "description": "Temporary file for spec 261 non-vacuity proof (c) — states a deliberately WRONG rail claim: TVL >= $5M and APY <= 1000%.",
    "parameters": { "type": "object", "properties": {} }
  }
}
EOF

$ node test_agent_surface_rail_claims.js       # test file NOT edited
population: 17 file(s) globbed
[
  ...
  "tools/_temp_population_growth_proof.json",
  ...
]
  ...
claims found: 6 TVL-floor claim(s), 5 APY-limit claim(s)
  ...
  ✗ every TVL-floor claim equals formatTvlFloor(DEFAULT_MIN_TVL) ("$100K")
    tools/_temp_population_growth_proof.json:5: stated "TVL >= $5M" (found "$5M", expected "$100K" per formatTvlFloor(DEFAULT_MIN_TVL))
  ...
FAILED   (exit 1)

$ rm tools/_temp_population_growth_proof.json
$ node test_agent_surface_rail_claims.js
population: 16 file(s) globbed
  ...
7 assertions passed ...   (exit 0)
```
Population grew from 16 → 17 files purely from the glob picking up the new
file under `tools/*.json` — no edit to the test — caught the wrong claim with
an exact `file:line`, then returned to the original 16-file, green state once
the temp file was deleted. `tools/` now contains only its original two files
(`calculate_projection.json`, `get_curated_pools.json`) plus the pre-existing
`test-agent-tools.js`, confirmed via `ls tools/`.

## Things I could not do / did not do

- Nothing in the required list was left undone. Leg B (the `openapi.json`
  path-set drift) was intentionally NOT built, per the spec's own explicit
  instruction that it is filed as backlog 262 and is out of scope here.
- Did not run the full `test:serial` chain or `npm test` (not requested, and
  many of its ~180 steps are browser-lane / network-dependent and would blow
  well past the 5-minute-per-command timebox given to each individual
  verification command). The four specific commands the task asked for were
  each run and are green, and the new test's lane was independently confirmed
  plain via `node run-tests.js --list --lane=plain` / `--lane=browser`.

## Attempt 2 — verifier findings fixed

The verifier FAILED attempt 1 with two findings. Both fixed; nothing else
touched.

### Finding 1 — population excluded root-level project markdown; two class
members stated the wrong figure

**The gap.** Spec 261's own "Instance of" line defines the population as
*"every agent-facing document in the repo that states a rail figure"* but
attempt 1's glob covered only `openapi.json`, `tools/*.json`,
`.well-known/**/*.json`, `edge/API.md`, `llms*.txt` — no root project
markdown. Two declared-class members stated the wrong figure:
- `CLAUDE.md:17` — `` `DEFAULT_MIN_TVL = $10M` everywhere `` (this file is
  injected as context into every Claude Code session on this repo).
- `PRODUCT.md:35` — `$10M default TVL floor`.

**(a) Fixed the wrong current-rail statements**, figure only, no
rewording:
- `CLAUDE.md:17`: `` `DEFAULT_MIN_TVL = $10M` `` → `` `DEFAULT_MIN_TVL = $100K` ``.
- `PRODUCT.md:35`: `$10M default TVL floor` → `$100K default TVL floor`.

**Judgement call — the other two `$10M` root-`.md` occurrences, read in
context and left UNREWRITTEN (not current-rail statements):**

- `stakeholder_communication_plan.md:256` —
  `` - [ ] **TVL Options:** Filter options: No min, $10k, $100k, $1M, $10M ``.
  This is a UI-spec checklist item enumerating the SELECTABLE tiers of a TVL
  filter dropdown — one of several values a user could pick, not a claim
  about the platform's `DEFAULT_MIN_TVL` default. Confirms this reading: the
  line immediately above it, `:255` ("**Default Filter:** Minimum TVL filter
  of $100k applied automatically"), already separately and correctly states
  the actual default — `:256` would be a strange place to *also* restate the
  default if that's not what it's doing. Left as-is; `$10M` here is a
  hypothetical/optional filter tier, not a rail claim.
- `user_journey_diagrams.md:324` —
  `` State: Chain=Ethereum, TVL>$10M, APY>20%, Type=Lending `` (inside an
  "All Filters Applied, No Results" edge-case scenario). This is an example
  of a USER-CHOSEN filter combination in a hypothetical journey diagram — an
  arbitrarily-picked demonstration value for an edge case, not a statement
  of the platform's default. Left as-is.

Neither file was special-cased out of the widened population (both are `*.md`
and both are globbed); their `$10M` occurrences simply don't match any
TVL-floor claim SHAPE (no `TVL >=`, `TVL of at least`, `minimum TVL`,
`DEFAULT_MIN_TVL =`, or `... default TVL floor` phrase adjacent), so the
scanner correctly does not flag them — consistent with, not a workaround of,
the claim-shaped-not-whole-file-scan design.

**One more thing the widening surfaced, fixed as part of (a)'s literal
instruction ("so the figure matches `formatTvlFloor(DEFAULT_MIN_TVL)`"):**
`stakeholder_communication_plan.md:255` itself — *"Minimum TVL filter of
$100k applied automatically"* — states the CORRECT number ($100,000 =
`DEFAULT_MIN_TVL`) but in lowercase `k`, which does not exact-string-match
`formatTvlFloor(DEFAULT_MIN_TVL)`'s canonical `"$100K"` (uppercase). This
*is* a current-rail statement (verifying the shipped default filter
behaviour), so per (a)'s literal instruction the figure was normalized to
`$100K` — a one-character case fix, not a reword, and not a value change (it
was never numerically wrong). Sibling line `:256` (the filter-tier list,
judgement call above) was deliberately left with its own lowercase
`$10k`/`$100k` — it isn't a rail claim, so nothing there needed to match the
canonical rendering.

**(b) Widened the population.** `test_agent_surface_rail_claims.js`'s
`GLOB_PATTERNS` gained a root-only `'*.md'` entry (no `**`, so it does NOT
recurse — confirmed with a throwaway `fs.globSync(['*.md'], {cwd:'.'})`
before wiring it in, which returned exactly the 8 root markdown files and
nothing under any subdirectory). That non-recursive shape is what
mechanically achieves the CRITICAL EXCLUSION the task named:
`product-loop-kit/**` never enters the population, because it is not at
repo root. Documented in the test's header comment (new "CRITICAL
EXCLUSION, BY ROLE, NOT CONVENIENCE" paragraph) with the reason: the loop's
own historical record (`LOG.md`, `BACKLOG.md`, `specs/*.md`) quotes past
rail values verbatim as history — spec 261.md's own Evidence section quotes
"$10M" describing the bug, and `specs/226.md`/`specs/104-notes.md` do too —
so rewriting it would itself be a defect. A dedicated test asserts this
exclusion holds (`product-loop-kit/** is excluded from the population BY
ROLE ... never leaked in by the *.md widening`).

Widening the file population alone was not sufficient: `CLAUDE.md`'s
`` NAME = $value `` phrasing and `PRODUCT.md`'s `` $value ... default TVL
floor ``/`` APY sanity limit X% `` phrasings matched none of attempt 1's
five claim shapes. Four new claim patterns were added (two TVL, two APY),
each scoped to `$`/`%`-MARKED values specifically so they would NOT also
start matching `edge/API.md:50`'s bare, unformatted `` DEFAULT_MIN_TVL =
100000 ``/`` APY_SANITY_LIMIT = 1000 `` — that gap is unchanged and still
documented as a known limitation. See the test file's own header comment
("ATTEMPT 2 NEW SHAPES") for the exact patterns and reasoning.

**(c) Residue list updated** in `product-loop-kit/specs/261.md`'s
Hypothesis section: population size and claim counts corrected from
16 files / 5 TVL + 4 APY to **24 files / 8 TVL + 6 APY claims**; the
`product-loop-kit/**` exclusion and its role-based reason added to the
population definition; the two attempt-2 defect sites and the judgement
call on the two left-alone files documented; the `edge/API.md:50` residue
bullet re-scoped to "bare, unformatted `NAME = value`" now that a
`$`/`%`-formatted `NAME = value` shape IS covered (still 1 known site, now
explicitly 2 claims — the TVL and APY constants both use the bare form
there).

### Finding 2 — Leg B's undocumented-endpoint count was off by one

`edge/api-core.js`'s `ENDPOINTS` table (`:133-149`) routes exactly 5 paths:
`/api`, `/api/health`, `/api/pools`, `/api/pools/:id`,
`/api/forever-number`. `openapi.json`'s `paths` object (`grep -n '^\s*"/'
openapi.json`) declares exactly two: `/pools` and `/planner`. Only `/pools`
has a routed analog (`/api/pools`). So of the 5 routed paths, only 1
(`/api/pools`) is documented — the other **4** (`/api`, `/api/health`,
`/api/pools/:id`, `/api/forever-number`) are routed but undocumented, plus
`/planner` is documented but not routed. Attempt 1's spec text and BACKLOG
row 262 said "3 undocumented... out of 5 routed", omitting `/api` itself
(the self-describing root) from the undocumented list while still counting
it in the "5 routed" denominator — an inconsistency. Corrected to **4**
undocumented + 1 documented-but-missing, in both
`product-loop-kit/specs/261.md`'s Leg B paragraph (now also naming the
`ENDPOINTS` table and the `/api`→`/api/pools` correspondence directly, so
the count is re-derivable from the sentence itself) and BACKLOG row `| 262
|` (count + omitted-path list only — no other row-262 text changed).

### Non-vacuity — the widening is load-bearing

```
$ md5sum CLAUDE.md
ad6807e139e30a4b38c6b511b230e641  CLAUDE.md

$ sed -i 's/`DEFAULT_MIN_TVL = \$100K` everywhere/`DEFAULT_MIN_TVL = $10M` everywhere/' CLAUDE.md
$ md5sum CLAUDE.md
6f224dcb11a754aa02eb948685bc54c3  CLAUDE.md

$ node test_agent_surface_rail_claims.js
  ...
  ✗ every TVL-floor claim equals formatTvlFloor(DEFAULT_MIN_TVL) ("$100K")
    CLAUDE.md:17: stated "DEFAULT_MIN_TVL = $10M" (found "$10M", expected "$100K" per formatTvlFloor(DEFAULT_MIN_TVL))
  ...
FAILED

$ cp /tmp/.../CLAUDE.md.orig CLAUDE.md   # restore
$ md5sum CLAUDE.md
ad6807e139e30a4b38c6b511b230e641  CLAUDE.md   # byte-identical to before
$ diff /tmp/.../CLAUDE.md.orig CLAUDE.md && echo BYTE-IDENTICAL
BYTE-IDENTICAL

$ node test_agent_surface_rail_claims.js
  ...
9 assertions passed (population: 24 files; TVL claims: 8; APY claims: 6; expected TVL floor: $100K; expected APY limit: 1000)
```

This proves the finding-1 fix is load-bearing, not cosmetic: before attempt
2, `CLAUDE.md` wasn't even in the population, so this exact regression
(the real bug attempt 1 shipped) would have stayed invisible to the test
forever. It is now caught, named with `file:line`, and clears on restore.

### Full verify run (attempt 2)

- `node test_agent_surface_rail_claims.js` — GREEN, 9 assertions,
  population **24 files**, claims **8 TVL-floor + 6 APY-limit**.
- `node test_test_registry.js` — GREEN, 5/5.
- `node test_rail_floor_derivation.js` — GREEN, 5/5 (unaffected — its own
  populations, root `*.html` + `llms*.txt` + `stories/*.html`, don't
  include `.md` and were not touched).
- `node test_llms_rails.js` — GREEN, 14/14.
- `git diff --numstat`: `CLAUDE.md` 1/1, `PRODUCT.md` 1/1, `openapi.json`
  1/1, `tools/get_curated_pools.json` 1/1, `package.json` 1/1 (attempt 1,
  unchanged), `stakeholder_communication_plan.md` 1/1,
  `product-loop-kit/BACKLOG.md` 2/0 (both `| 261 |` and `| 262 |` are
  already-uncommitted new rows from attempt 1's spec-authoring session —
  editing text within the pre-existing `| 262 |` row does not create a
  second diff hunk against `HEAD`, it's still counted as those two whole
  new lines). `user_journey_diagrams.md` — untouched, 0/0 (not in the diff
  at all, per the judgement call above).

## Attempt 3 — docs/ population gap closed

The verifier FAILED attempt 2 with one finding: the population widening was
justified ONLY by the `product-loop-kit/**` historical-archive argument, but
the same root-only, non-recursive glob also silently dropped every OTHER
subdirectory — including `docs/`, which is present-tense product/
architecture documentation, not an archive, and carried stale rail figures
(`docs/discovery-data-layer-134.md:34,42`, `docs/feasibility-data-layer.md:71`
— all three cite `$10M`, the pre-`6fceca79bb` floor). Fixed. This section
records the full sweep, not just the three named lines.

### Directory sweep — every directory that actually exists, checked

Ran `find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*"`
and grouped by top-level directory (excluding `.git`/`node_modules`):

| Directory | `*.md` count | Role determined | Action |
|---|---|---|---|
| repo root | 8 | Hand-authored product docs | Already in population (attempt 2) |
| `docs/` | 6 | Hand-authored product/architecture docs, present-tense | **Added to population (recursive `docs/**/*.md`)** |
| `edge/` | 2 (`API.md`, `DEPLOY.md`) | Hand-authored ops/API docs | **Widened from hand-typed `edge/API.md` to `edge/*.md`** so `DEPLOY.md` (zero rail claims, checked) is covered too, without a second hand-typed entry |
| `product-loop-kit/` | 790 | Loop's own historical record | Excluded BY ROLE (unchanged from attempt 2) |
| `pools/` | 3,677 | CI-generated SEO pages (`generate-pool-pages.js`) | Excluded BY ROLE — verified `grep -rl '\$10M' pools/` → 0 hits |
| `tokens/` | 2,070 | CI-generated SEO pages (`generate-token-pages.js`) | Excluded BY ROLE — verified 0 hits |
| `ko/` | 2,155 | Korean mirror of the above (chains/tokens/pools) | Excluded BY ROLE — verified 0 hits |
| `chains/` | 85 | CI-generated SEO pages (`generate-chain-pages.js`) | Excluded BY ROLE — verified 0 hits |
| `spotlights/` | 1 (`CADENCE.md`) | CI-generated (`generate-spotlight.js`; header: "do not hand-edit") | Excluded BY ROLE — verified 0 rail-shaped claims (its dollar figures are per-pool TVL data, not rail claims) |
| `.well-known/` (excl. `*.json`, already covered) | 2 | Third-party generic agent-skill package (Hermes Agent's "agentic-readiness"), not DeFi-Garden product docs | Excluded BY ROLE — verified 0 DeFi-Garden rail claims (one unrelated "$200M TVL" marketing claim about a different site, confirmed attempt 1) |
| `.claude/` | 1 (`agents/verifier.md`) | Agent operational tooling | Excluded BY ROLE — verified 0 rail claims |
| `.github/` | many (skill reference docs) | CI/agent tooling reference material | Excluded BY ROLE — verified 0 rail claims via the broad grep sweep below |
| `.impeccable/` | 2 (`critique/*.md`) | Design-critique tooling log | Excluded BY ROLE — verified 0 rail claims |
| `data/`, `assets/`, `fonts/`, `og/`, `src/`, `stories/`, `telegram-bot/`, `test-fixtures/`, `test_fixtures/`, `workers/` | 0 each | N/A | Confirmed empty of `*.md` via `find <dir> -name '*.md'`; nothing to include or exclude |

Broad sweep command used to find every rail-figure-shaped claim outside the
already-covered population, directory by directory:

```
grep -rnE 'TVL\s*(>=|≥)|TVL of at least|minimum TVL|DEFAULT_MIN_TVL|
  default TVL floor|APY\s*(<=|≤)|capped at [0-9]|APY_SANITY_LIMIT|
  APY sanity limit|\$10M|\$100[Kk]' --include=*.md <dir>
```
run against every directory in the table above, plus a targeted
`grep -rl '\$10M' pools/ tokens/ chains/ ko/ spotlights/` to confirm the
generated-content exclusion is safe (0 hits, i.e. every one of those ~7,900
generated pages already correctly renders the current floor because they are
regenerated from `trust-rails.js`/`formatTvlFloor` on every run, not
hand-typed).

### Every rail-figure claim found in docs/, with fix/leave decision

**`docs/discovery-data-layer-134.md`** — a decision/study doc ("STUDY only"),
written 2026-08-03, describing the floor in present tense throughout ("Every
fast source floors at $10M by trust-rail design", no "as of" qualifier on
most of the doc). 33 total `$10M`/`10000000` occurrences found.

- **30 occurrences — FIXED** (figure-only, `$10M` → `$100K`,
  `DEFAULT_MIN_TVL=10000000` → `DEFAULT_MIN_TVL=100000`): every present-tense
  statement of the rail's own value — e.g. `:5` "all below the $10M
  trust-rail floor", `:30` "Every fast source floors at $10M by trust-rail
  design", `:34` the table's `generate-pools-snapshot.js:52
  (DEFAULT_MIN_TVL=10000000)` citation (the verifier's named line — that
  source line now reads `100000`), `:42` "`DEFAULT_MIN_TVL = $10M` ... are
  mirrored verbatim across `app.js:800-801`" (the verifier's other named
  line), `:56,59,61,63,65,86,87,100,101,106,107,112,121(×2),136,140,141,145,
  150,156,165,167` — all "sub-$10M pools" / "$10M floor" / "$10M default
  filter" phrasings that are semantically just "pools below/at whatever the
  floor is", substituted 1:1. `git diff --numstat` for this file: `30 30`.
- **3 occurrences — LEFT, disclosed** (`:77,79,98`): these sit inside §2
  "Payload / latency — measured", a table explicitly sourced from
  `docs/feasibility-data-layer.md §4a (measured live 2026-07-14)` — i.e. they
  report a *specific, dated, already-executed measurement* of what a
  `$10M`-floored snapshot/slice-set looked like (736 rows, 327,520/65,609
  bytes at `:77,79`; "371 symbols / ~411 slices at $10M" at `:98`).
  Relabeling the figure to `$100K` while leaving those measured numbers
  unchanged would assert a NEW, unverified, and almost certainly FALSE claim
  — a `$100K` floor is looser than `$10M` and admits strictly more pools, so
  the true current row/byte/slice counts are higher than these dated numbers,
  not equal to them. Correcting the label without re-measuring would make the
  row internally self-contradictory in a way it currently is not (it
  currently correctly describes what was measured, just under a stale
  "as shipped" framing). Re-measuring requires live `yields.llama.fi` access,
  which this sandbox does not have (confirmed via the same restriction
  `docs/feasibility-data-layer.md`'s own "Sandbox limitation" section
  documents) — out of scope, and analogous to the spec's own instruction not
  to re-derive a moved file:line citation.

**`docs/feasibility-data-layer.md`** — a decision/study doc ("STUDY only"),
3 `$10M` occurrences found (`:71`, `:74`, `:82`).

<!-- CORRECTION (operator, after verifier round 3): this line originally said "5
occurrences", which was wrong and did not even match its own itemisation below
(1 FIXED + 2 LEFT = 3). Ground truth:
`git show HEAD:docs/feasibility-data-layer.md | grep -c '\$10M'` → 3, and no
variant form (`10000000`, `$10,000,000`, `$10 million`) appears in that file.
Recorded as a correction rather than silently overwritten — this is the second
miscount on this item (verifier round 1 caught the Leg B "3 vs 4"), and two
arithmetic slips in one item's paperwork is itself the finding. -->



- **1 occurrence — FIXED** (`:82`, in "## 5. Trust rails", non-dated,
  present-tense): "`APY_SANITY_LIMIT = 1000%` and `DEFAULT_MIN_TVL = $10M`
  would be applied once, at snapshot-build time" → `DEFAULT_MIN_TVL = $100K`.
  `git diff --numstat`: `1 1`.
- **2 occurrences — LEFT, disclosed** (`:71,74`): both sit inside
  `## §4a — Measured (2026-07-14, live in-session)` — a section whose own
  header states the date and that the numbers are "REAL measurement, taken
  live... during the 059 build", i.e. self-dated historical narration, not a
  present-tense claim. `:71`'s table row ("13-field, `tvlUsd >= $10M`
  (anomalous KEPT) — the shipped snapshot | 712 | 202,268 | 50,962") is the
  same "measured row" situation as `discovery-data-layer-134.md:77` above —
  relabeling to `$100K` without re-measuring would assert an unverified,
  likely-false current row count. `:74` ("Anomalous pools ... above the $10M
  floor: 0 on measurement day") is explicitly self-qualified ("on measurement
  day") and therefore already honest as written. **Note**: this differs from
  how the verifier's evidence framed `:71` ("the shipped snapshot floors at
  $100K" was given as the reason a fix is needed) — I made a deliberate,
  disclosed judgment call to leave the row's specific measured numbers
  instead of relabeling only the word "$10M" and creating a new, unverified
  claim about current production data volume. Flagging this explicitly so it
  can be overridden: if the intent was specifically to correct the label
  regardless of the attached numbers, `docs/feasibility-data-layer.md:71`
  and `docs/discovery-data-layer-134.md:77,79` are the three sites to revisit.
  Note also: this exact bare-`tvlUsd >=`-shape row is NOT matched by the
  test's claim regex either way (the pattern requires the literal word `TVL`
  immediately before `>=`; the doc says `tvlUsd >=`), so this judgment call
  has zero effect on `node test_agent_surface_rail_claims.js`'s outcome.

**`docs/garden-planner-v2-spec.md`** — a product spec, 3 `TVL ≥ $X`/`APY ≤ X%`
occurrences found, all **feature-specific curation thresholds, NOT rail
claims — left unrewritten, not a defect**:
- `:53` "🏦 ESTABLISHED STABLECOIN YIELDS ... TVL ≥ $50M." — a persona-tier's
  own curation floor (intentionally *higher* than `DEFAULT_MIN_TVL`).
- `:54` "🏛️ RWA & FRESH ENTRIES ... fallback criteria TVL ≥ $10M, APY ≤ 20%,
  non-anomalous." — a different persona-tier's own thresholds (both
  intentionally different from `DEFAULT_MIN_TVL`/`APY_SANITY_LIMIT`).
- `:55` "🔥 DEGEN LPS ... TVL ≥ $10M, sanity cap applies." — same.
These are exactly the persona archetypes CLAUDE.md's "Plan archetypes"
section documents; the values are supposed to differ from the platform
floor, not mirror it. Because the bare shape these lines use is identical to
the shape a real rail-drift claim would use, this is what forced the
claim-shape redesign described below (not a file-level exclusion).

**`docs/organic-traffic-loop-of-loops.md`** — 1 occurrence, **not a rail
claim, left unrewritten**: `:64` "Runs strict token hygiene gates (excludes
pools with TVL < $1,000, APY <= 0.01%, or invalid tickers)" — describes the
SEO generator's own, separate, correctly-stated $1,000/0.01% hygiene gate
(the same $1000 CI-transient floor `docs/discovery-data-layer-134.md`'s own
table documents as a real, different, correctly-floored data path), not
`DEFAULT_MIN_TVL`/`APY_SANITY_LIMIT`.

**`docs/garden-planner-v3-yield-funded.md`**,
**`docs/strategy-2026-07-23-pretraffic-bets.md`** — swept, zero rail-figure
occurrences of any kind.

**`edge/DEPLOY.md`** — swept, zero rail-figure occurrences.

**`.well-known/agent-skills/agentic-readiness/SKILL.md`**,
**`.well-known/agent-skills/agentic-readiness/references/ai-visibility-audit.md`**,
**`spotlights/CADENCE.md`**, **`.claude/agents/verifier.md`**,
**`.impeccable/critique/*.md`** — swept, zero rail-figure occurrences of any
kind (confirmed both by the broad regex sweep and, for the generated-content
directories, by reading a sample file to confirm the generation mechanism).

### The false-positive problem the docs/ widening surfaced, and the fix

Adding `docs/**/*.md` to the population with the SAME claim-shape patterns
attempt 2 shipped would have made the test **wrongly fail** on real,
intentional, non-rail content: `docs/garden-planner-v2-spec.md`'s persona-tier
lines (`TVL ≥ $50M`, `TVL ≥ $10M`, `APY ≤ 20%`) and
`docs/organic-traffic-loop-of-loops.md`'s SEO-hygiene line (`APY <= 0.01%`)
all match the two most generic patterns (bare `TVL\s*(?:>=|≥)\s*(\$X)` and
bare `APY\s*(?:<=|≤)\s*X%`/`capped at X%`) — patterns that were safe against
every machine-manifest file (where "TVL >= $X" only ever means the one
served API's own floor) but are NOT safe against free-form prose, where the
same shape is legitimately reused for other, different, correctly-stated
thresholds.

**Fix**: split the claim-shape set by population role, not by file name.
Every file in the machine-manifest population (`openapi.json`, `tools/*.json`,
`.well-known/**/*.json`, `llms.txt`, `llms-full.txt`) is scanned with the
FULL pattern set (bare + anchored shapes), exactly as before. Every `*.md`
file (root, `docs/`, `edge/` alike — decided by file extension, not a
per-file list) is scanned with only the ANCHORED shapes: `DEFAULT_MIN_TVL =
$X`, `$X default TVL floor`, `minimum TVL … $X`, `TVL of at least $X`,
`APY_SANITY_LIMIT = X%`, `APY sanity limit X%`. Verified by grep (see sweep
above) that no current prose doc states the platform's REAL floor using the
dropped bare shapes, so this costs zero coverage today; it is disclosed as a
residue item (spec 261.md, updated) because a *future* prose doc using the
bare shape to state the real floor would not be caught.

A dedicated test (`docs/garden-planner-v2-spec.md`'s persona-tier thresholds
are NOT captured as rail claims`) proves this directly against the real
committed file, not a synthetic sample — mirroring the existing
per-chain-TVL-figure guard's structure.

### Test widening — final shape

`GLOB_PATTERNS` split into `MANIFEST_GLOB_PATTERNS` (`openapi.json`,
`tools/*.json`, `.well-known/**/*.json`, `llms.txt`, `llms-full.txt`) and
`PROSE_GLOB_PATTERNS` (`*.md` root-only, `docs/**/*.md`, `edge/*.md` —
the last widened from attempt 1/2's hand-typed `edge/API.md`). The header
comment was rewritten per the task's instruction: the `product-loop-kit/**`
exclusion (and every other exclusion) is now stated as an explicit,
enumerated INCLUDED/EXCLUDED boundary with a by-role reason for each entry,
not as a side effect of a glob happening to be non-recursive.

### New population/claim counts

```
population: 31 file(s) globbed (15 manifest, 16 prose-doc)
claims found: 10 TVL-floor claim(s), 8 APY-limit claim(s)
11 assertions passed (population: 31 files; TVL claims: 10; APY claims: 8;
expected TVL floor: $100K; expected APY limit: 1000)
```
(was 24 files / 8 TVL + 6 APY after attempt 2; the +7 files are `docs/`'s 6
markdown files + `edge/DEPLOY.md`; the +2 TVL / +2 APY claims are
`docs/discovery-data-layer-134.md:42` and `docs/feasibility-data-layer.md:82`,
each contributing one `DEFAULT_MIN_TVL = $X` claim and one
`APY_SANITY_LIMIT = X%` claim.)

### Full verify run (attempt 3)

- `node test_agent_surface_rail_claims.js` — GREEN, 11 assertions, population
  **31 files** (15 manifest + 16 prose-doc), claims **10 TVL-floor + 8
  APY-limit**.
- `node test_test_registry.js` — GREEN, 5/5.
- `node test_rail_floor_derivation.js` — GREEN, 5/5 (unaffected).
- `node test_llms_rails.js` — GREEN, 14/14.

### Non-vacuity — the attempt-3 widening specifically is load-bearing

Reverted the corrected `docs/discovery-data-layer-134.md:42` figure back to
`$10M`:

```
$ md5sum docs/discovery-data-layer-134.md
9cf2b9c44d3fa7cda85114f060daa10e  docs/discovery-data-layer-134.md

$ sed -i '42s/DEFAULT_MIN_TVL = \$100K/DEFAULT_MIN_TVL = \$10M/' docs/discovery-data-layer-134.md
$ md5sum docs/discovery-data-layer-134.md
431388cb21bf76d45a113cdf08516885  docs/discovery-data-layer-134.md

$ node test_agent_surface_rail_claims.js
  ...
  ✗ every TVL-floor claim equals formatTvlFloor(DEFAULT_MIN_TVL) ("$100K")
    docs/discovery-data-layer-134.md:42: stated "DEFAULT_MIN_TVL = $10M" (found "$10M", expected "$100K" per formatTvlFloor(DEFAULT_MIN_TVL))
  ...
FAILED   (exit 1)

$ cp <backup> docs/discovery-data-layer-134.md   # restore
$ md5sum docs/discovery-data-layer-134.md
9cf2b9c44d3fa7cda85114f060daa10e  docs/discovery-data-layer-134.md   # byte-identical to before
$ diff <backup> docs/discovery-data-layer-134.md && echo BYTE-IDENTICAL
BYTE-IDENTICAL

$ node test_agent_surface_rail_claims.js
  ...
11 assertions passed ...   (exit 0)
```

Failure named the exact `file:line` (`docs/discovery-data-layer-134.md:42`)
as required. md5 before mutation and after restore: identical
(`9cf2b9c44d3fa7cda85114f060daa10e`).

### Attempt 2's `CLAUDE.md` proof, re-run to confirm the attempt-3 widening didn't break it

```
$ md5sum CLAUDE.md
ad6807e139e30a4b38c6b511b230e641  CLAUDE.md

$ sed -i 's/`DEFAULT_MIN_TVL = \$100K` everywhere/`DEFAULT_MIN_TVL = $10M` everywhere/' CLAUDE.md
$ md5sum CLAUDE.md
6f224dcb11a754aa02eb948685bc54c3  CLAUDE.md

$ node test_agent_surface_rail_claims.js
  ...
  ✗ every TVL-floor claim equals formatTvlFloor(DEFAULT_MIN_TVL) ("$100K")
    CLAUDE.md:17: stated "DEFAULT_MIN_TVL = $10M" (found "$10M", expected "$100K" per formatTvlFloor(DEFAULT_MIN_TVL))
  ...
FAILED   (exit 1)

$ cp <backup> CLAUDE.md   # restore
$ md5sum CLAUDE.md
ad6807e139e30a4b38c6b511b230e641  CLAUDE.md   # byte-identical to before

$ node test_agent_surface_rail_claims.js
  ...
11 assertions passed ...   (exit 0)
```

### `git diff --numstat` (attempt 3 state, all tracked changes)

```
1   1   CLAUDE.md
1   1   PRODUCT.md
30  30  docs/discovery-data-layer-134.md
1   1   docs/feasibility-data-layer.md
1   1   openapi.json
1   1   package.json
2   0   product-loop-kit/BACKLOG.md
2   0   product-loop-kit/LOG.md
1   1   stakeholder_communication_plan.md
1   1   tools/get_curated_pools.json
```
New untracked files (not in `--numstat`, which only diffs tracked files):
`product-loop-kit/specs/261.md`, `product-loop-kit/specs/261-notes.md`,
`product-loop-kit/specs/261-pr.md` (attempt 1 spec-authoring artifacts,
`261.md` updated again in attempt 3 with the new residue counts), and
`test_agent_surface_rail_claims.js` (the new test itself).
`user_journey_diagrams.md` — still untouched, 0/0, per attempt 2's judgment
call (unaffected by attempt 3).

### Things I could not do / judgment calls flagged for override

- `docs/feasibility-data-layer.md:71` and `docs/discovery-data-layer-134.md:
  77,79` were left with `$10M` rather than relabeled to `$100K`, because the
  attached measured numbers (row/byte/slice counts) cannot be corrected
  without a live re-measurement this sandbox cannot perform, and relabeling
  the word alone would produce a new, unverified, likely-false claim rather
  than fix an existing one. This has zero effect on the automated test
  (that exact shape isn't matched either way) but is a direct, disclosed
  deviation from how the verifier's evidence framed
  `docs/feasibility-data-layer.md:71` — flagged explicitly above for human
  override if the intent was to relabel regardless.
- Did not re-run the full `test:serial` chain / `npm test` (same reasoning
  as attempt 1: many steps are browser-lane/network-dependent and would blow
  past the 5-minute-per-command timebox). The specific commands requested
  were each run individually and are green.
