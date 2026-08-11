/* test_rail_predicate_derivation.js — backlog 266 (spec 266 Leg C).

   The EXECUTABLE counterpart to test_rail_floor_derivation.js's prose guard
   (backlog 254) and test_agent_surface_rail_claims.js's manifest guard
   (backlog 261): those two guard what the product SAYS about its trust
   rails; this one guards what the code actually DOES. Same idea — derive
   the population at test time, never a hand-typed file list, and assert
   every found thing against a committed, reasoned classification — applied
   to a different population (executable code, not prose/manifests) and a
   different claim-shape (a comparison against a numeric literal, not a
   dollar/percent figure in text). Follows their idiom (header comment
   enumerating the population boundary with reasons, `test()` helper,
   globbed population, non-vacuity assertions, file:line in failure
   messages) rather than inventing a third style.

   Motivating defect (spec 266's Evidence): home.html's WebMCP
   `search_yield_pools` tool re-typed `DEFAULT_MIN_TVL`/`APY_SANITY_LIMIT` as
   bare `100000`/`1000` literals, and tools/test-agent-tools.js's invariant
   checks re-typed the OLD `$10M` floor as `10000000` — already stale since
   commit 6fceca79bb moved the real floor to $100K. Spec 266 Legs A/B fixed
   both (they now read `window.TRUST_RAILS`/`require('./trust-rails.js')`).
   This Leg makes a THIRD unlinked copy impossible to add silently.

   ===========================================================================
   POPULATION — an explicit, enumerated boundary, globbed at test time.
   ===========================================================================

   INCLUDED (spec 266 Leg C's own population description):
     - root `*.js` (non-recursive) and root `test_*.js` (the latter is a
       strict subset of the former — root `*.js` already sweeps every
       `test_*.js` file; both patterns are globbed anyway, verbatim from the
       spec, so a reader can see this population matches "root *.js, ...,
       plus root test_*.js" literally rather than trusting a claim that one
       pattern subsumes the other)
     - `edge/*.js`
     - `tools/*.js`
     - `src/*.js` — added by verifier round 1, finding 3b. `src/poller-core.js`
       is CommonJS (`module.exports`, guarded exactly like compute-kpis.js) and
       used to hand-declare BOTH rails as bare consts plus stale "$10M"/
       "app.js:729-730" prose — invisible to this guard while `src/` sat in
       the EXCLUDED list below "by role". It is now fixed to
       `require('../trust-rails.js')` (see product-loop-kit/specs/266-notes.md)
       and contributes zero sites, same as home.html/tools/test-agent-tools.js
       after Legs A/B. `src/poller.js` (the ESM Worker entry that imports
       poller-core) is included too and also contributes zero sites — it holds
       no rail literals of its own, only the import.
     - `home.html`, `plan.html` — named explicitly (not globbed): these are
       the two documents spec 266's Evidence names as carrying the ONLY
       browser-executed inline scripts with WebMCP tool bodies; no other
       *.html in this repo declares a `window.navigator.modelContext` tool
       (verified below by the population's zero-site assertion on both).

   EXCLUDED, BY ROLE (each checked in this repo and confirmed to carry
   either zero pool-threshold comparisons or a role that makes them not part
   of the "executable agent/product surface" this item's Change legs touch):

     - `*.min.js`, `*.compiled.js` (this pattern also catches
       `*.compiled.min.js`, e.g. `PoolDetail.compiled.min.js`) — generated
       twins of `app.js`/`PoolDetail.js`/`planner.js`/`translations.js`,
       freshly re-derived from their sources on every `npm run compile` /
       `npm run minify` and guarded byte-for-byte by
       `test_compiled_assets.js`/`test_minified_assets.js`. Never hand-typed,
       so a literal appearing there is a literal appearing in its SOURCE
       file too (already in this population) — including the twin would
       double-count every allowlist entry to guard an artifact that
       self-heals on every regen (the exact reasoning test_agent_surface_
       rail_claims.js's header gives for excluding the generated SEO-page
       trees from ITS population).
     - `pools/`, `tokens/`, `chains/`, `ko/`, `stories/` — contain zero root-
       level `*.js` files (verified: `find <dir> -maxdepth 5 -name '*.js'`
       returns nothing for any of them; they are `*.html`/generated SEO
       surface, a different population — out of this item's scope per the
       task's own "no hand-editing generated SEO surface" rule).
     - `product-loop-kit/` — the loop's own tooling scripts (6 `*.js`
       files) and historical spec/log record, not product code.
     - `telegram-bot/`, `whatsapp-bot/`, `workers/` — separate deployable
       subsystems, explicitly out of this item's territory (task instruction:
       do not touch these directories at all); `telegram-bot/` alone carries
       75 `*.js` files that would swamp this population with a different
       product's own thresholds. NAMED RESIDUE (verifier round 2, finding 5 —
       this excluded population is NOT investigated further, only named
       plainly per the task's own instruction): `telegram-bot/dist/src/utils/
       constants.js:111-116` declares `RISK_THRESHOLDS = { TVL_SAFE:
       100000000, TVL_MINIMUM: 10000000, APY_SUSPICIOUS: 100 }`. `TVL_SAFE`
       (not `TVL_MINIMUM`) is consumed as a live filter at
       `telegram-bot/dist/src/commands/earn.js:394,452` and
       `zap.js:418` (`pool.tvlUsd >= RISK_THRESHOLDS.TVL_SAFE`); a repo-wide
       grep finds `TVL_MINIMUM` referenced NOWHERE else in `telegram-bot/` —
       it appears to be declared but currently unused as a live filter.
       `TVL_MINIMUM: 10000000` is exactly the PRE-`6fceca79bb` value of this
       repo's own `DEFAULT_MIN_TVL` (moved to $100K by that commit). Whether
       this is an independent bot-specific risk policy (deliberately more
       conservative than the app's floor) or a fossil copy of the old $10M
       DEFAULT_MIN_TVL that never got the memo is AMBIGUOUS and UNRESOLVED —
       `telegram-bot/` is out of this item's territory by the task's own
       explicit instruction (wallet/funds code, NEVER-touched), so this is
       named here, not investigated, and no code under `telegram-bot/` is
       touched.
     - `.well-known/` (1 `*.js` file, a third-party agent-skill template) —
       not DeFi Garden product code; the machine-manifest surface under
       `.well-known/` (recursive) `*.json` is a DIFFERENT population already guarded by
       test_agent_surface_rail_claims.js (backlog 261), which scans claim-
       SHAPED prose/JSON, not code.
     - `data/`, `assets/`, `fonts/`, `og/`, `test-fixtures/`, `test_fixtures/`
       — no `*.js` files (data/fixture/binary directories).
     - `node_modules/` — third-party dependency code, never scanned.

   A file added tomorrow inside any INCLUDED glob is covered automatically,
   without editing this test. The "excluded roots never leak in" test below
   proves the boundary is enforced, not merely documented.

   ===========================================================================
   DETECTOR
   ===========================================================================

   A "site" = an identifier whose name contains `tvl` or `apy` (case-
   insensitive; e.g. `p.tvlUsd`, `totalApy`, `minTvl`, `kpis.apyStdev`) —
   OR, as of verifier round 3, a PARENTHESISED EXPRESSION whose text contains
   such an identifier (e.g. `(pool.tvlUsd || 0)`, `(Number(pool.tvlUsd) || 0)`
   — the repo's own house idiom for a rail comparison, used at the three
   rail-enforcement points this backlog item rewired: generate-sitemap.js:88,
   generate-spotlight.js:79, generate-pools-snapshot.js:81) — compared with
   `< <= > >=` against a NUMERIC LITERAL (optionally itself wrapped in a
   single layer of parens, `p.tvlUsd < (100000)`), in EITHER operand order
   (`ident OP lit` or `lit OP ident` — both normalised to the same canonical
   `ident OP lit` key, flipping the operator on the reversed order, so the
   same logical comparison written either way lands on one allowlist entry;
   a parenthesised literal is unwrapped to its bare numeral for this key,
   and internal whitespace inside a captured paren-group is collapsed to
   single spaces, so an indentation-only difference between two otherwise-
   identical occurrences — this checkout has 5 of PoolDetail.js's own ratio-
   guard expression, differently indented per call site — lands on ONE
   allowlist entry, not 5). Comparisons against another IDENTIFIER (e.g.
   `apy2 > APY_SANITY_LIMIT`, planner.js:1534 — the rail re-check done
   RIGHT, reading the constant rather than copying its value) are, by
   construction, invisible to this detector: there is no literal to flag.
   The parenthesised-operand grammar permits up to 3 levels of paren
   nesting (deep enough for this checkout's own worst case — PoolDetail.js's
   3-level-nested rate-divergence ratio guard); see PAREN_GROUP_RE's own
   comment below for the exact grammar and why 3 levels.

   Scanned on a comment/string/REGEX-LITERAL-aware strip of each file's
   source (real `//` and block comments removed, ordinary string/template-
   literal TEXT blanked out but a template literal's own `${...}`
   interpolations are re-entered as code, e.g. app.js:3283's
   `` `$${minTvl >= 1000000 ? ...}` `` — so a real comparison inside an
   interpolation is still caught, while prose like "APY <= 0.01%" inside a
   comment describing a DIFFERENT file's content is not mistaken for code).
   REGEX LITERALS are ALSO now recognised and blanked (verifier round 3 — see
   regexAllowedBefore/scanRegexLiteral's own header comments below,
   immediately above stripCommentsAndStrings): a regex containing a quote
   character (common in this codebase's own `"key":\s*`-shaped generator
   regexes, e.g. generate-pools-snapshot.js:125) was, before this round, able
   to desync the walker's quote-tracking for the REST OF THE FILE, silently
   blanking every subsequent line out of existence for this scan — a
   pre-existing bug, not something the operand-grammar widening introduces,
   found while chasing why the verifier's own named `generate-pools-
   snapshot.js:312` site stayed invisible even after the operand widening
   alone. This is what keeps this guard's population at the 55 real
   comparisons this checkout NOW measures (verifier round 3 re-measurement —
   up from 36; see product-loop-kit/specs/266-notes.md, "Verifier round 3 —
   the parenthesised-operand gap", for the full derivation: 19 net-new real
   sites, 2 from the regex-literal fix alone unblanking 7 previously-
   corrupted files' tails, 17 from the operand-grammar widening on top of
   that fixed baseline — the two fixes are not simply additive site-for-site
   because the widened grammar also finds NEW matches inside the newly-
   unblanked text), not the 40+ (pre-round-1) or 96 (pre-round-3, at the
   time this comment last measured it) a naive/narrower scan finds instead.

   LITERAL 0 IS EXCLUDED BY DESIGN, not a coverage gap: both
   DEFAULT_MIN_TVL and APY_SANITY_LIMIT are positive by construction (a rail
   of $0 or 0% is degenerate — there is no such rail to copy). A `> 0`/`>=
   0`/`< 0` check appearing next to a tvl/apy identifier is near-always an
   EMPTINESS test ("is there a real value at all"), never a rail-value copy.
   MEASURED (verifier round 3 re-measurement, against the current widened
   population/detector/grammar — supersedes verifier round 1's 36→96/60
   figure, itself superseded because the operand-grammar widening surfaces
   many more `(x || 0) > 0`-shaped emptiness tests than the bare-identifier
   form ever could): dropping the "literal !== 0" filter below raises the
   comparison-site count from 55 to 127 — i.e. 72 `0`-literal sites are
   excluded. Including them would not surface a single additional rail-copy
   risk while forcing ~72 more allowlist entries whose reason would always
   be the same sentence. Stated, not silently dropped.

   OTHER KNOWN COVERAGE LIMITATIONS (same character as test_rail_floor_
   derivation.js's / test_agent_surface_rail_claims.js's own documented
   gaps — a detector limitation, not a vacuity bug in the scan, which the
   non-vacuity assertions below prove finds real sites via the shapes it
   DOES cover):
     (a) [CLOSED by the operator-requested widening below] a rail copy
         written WITHOUT a comparison operator — a bare `const|let|var
         <IDENT> = <numeric literal>;` never itself compared — used to be
         invisible here. `generate-pools-snapshot.js:52`'s own local
         `const DEFAULT_MIN_TVL = 100000;` was the motivating instance (found
         while classifying `test_pools_snapshot.js:76`'s allowlist entry
         during Leg C's original build) and is now FIXED — it, and every
         other rail-named bare assignment the ASSIGNMENT DETECTOR below finds
         across the same population, are either derived from trust-rails.js
         (so they no longer match this scan's literal-RHS shape at all) or
         allowlisted with an honest reason. See product-loop-kit/specs/
         266-notes.md, "Operator-requested widening (assignment stratum)",
         for the full classified table. The residual gap this widening does
         NOT close: an assignment whose right-hand side is an EXPRESSION
         rather than a single numeric token (e.g. `const FLOOR = BASE * 2;`,
         a TERNARY (`const apyFloor = cond ? 100000 : 500;`), an ARRAY of
         thresholds (`const tvlTiers = [100000, 1000000, 10000000];`), or a
         value assembled across multiple statements) — the regex requires
         the RHS to be one bare numeric literal. CONFIRMED STILL ESCAPING
         (verifier round 3's own shape hunt, product-loop-kit/specs/
         266-notes.md): tested the ternary and array forms directly against
         every one of this file's 4 detectors — both escape all four, with
         zero real instances observed in this checkout's population.
     (b) rail SEMANTICS copied wrongly (spec 266's own defect 3 — railing
         `apy` instead of `apyBase+apyReward`) is not machine-checkable by a
         literal-comparison OR literal-assignment scanner at all: both see
         the literal, never which quantity it rails or feeds. Leg D
         (test_webmcp_rail_derivation.js) closes that gap for home.html
         specifically, by rendered behaviour.
     (c) a rail copy assigned via BRACKET/COMPUTED property notation —
         `obj['tvlFloor'] = 100000;` — escapes every detector in this file
         (verifier round 3's shape hunt: tested directly, confirmed escaping
         on all four). findPlainAssignmentSites' LHS grammar
         (`(?:IDENT\.)*IDENT`) only recognises a DOTTED chain, never a
         bracket subscript; PROP_RE requires the `IDENT:` object-literal
         shape, which this isn't. No real instance observed in this
         checkout's population — named as residue, not fixed here.
     (d) a rail value used as a CLAMP via `Math.min`/`Math.max` with NO
         comparison operator at all — `Math.min(pool.tvlUsd, 100000)` —
         escapes every detector (verifier round 3's shape hunt, confirmed
         escaping on all four): every detector in this file is keyed on
         either a comparison operator (`<`/`<=`/`>`/`>=`) or an assignment
         operator (`=`/`:`); a same-statement function-argument literal with
         neither is invisible by construction. No real instance observed in
         this checkout's population — named as residue, not fixed here.
     (e) a rail comparison expressed through a FUNCTION CALL whose NAME (not
         its argument) encodes the rail — `if (getTvlFloor() >= 100000)` —
         escapes findSites (verifier round 3's shape hunt, confirmed
         escaping): the widened PAREN_GROUP_RE inspects the TEXT INSIDE the
         parens for a tvl/apy identifier, never the preceding function name;
         an empty or unrelated argument list means no match regardless of
         how tvl/apy-suggestive the call's name is. No real instance
         observed in this checkout's population — named as residue, not
         fixed here.
     (f) EQUALITY operators (`===`/`!==`/`==`/`!=`) are not in `OPS` at all —
         `if (pool.tvlUsd === 100000)` escapes findSites entirely (verifier
         round 3's shape hunt, confirmed escaping) — `OPS` only ever covered
         `< <= > >=` (a rail is a FLOOR/CEILING, not an exact-equality
         check, which is why this was never in scope), but is named here
         explicitly rather than left as a silent assumption. No real
         instance observed in this checkout's population.
     (g) CONFIRMED NOT ESCAPING (verifier round 3's shape hunt — recorded
         because the task asked for hunted shapes' results "whether they
         escape or not", not only the ones that do): a rail copy written as
         a DESTRUCTURING DEFAULT — `const { minTvl = 100000 } = opts;` or
         `function f({ minTvl = 100000 } = {}) {...}` — is ALREADY caught by
         findPlainAssignmentSites (same `IDENT = LITERAL` shape a function
         parameter default already matches, terminated here by the `}`
         branch already in `TERMINATOR_LOOKAHEAD`/`PLAIN_ASSIGN_TERMINATOR_
         LOOKAHEAD` — no further widening needed). Also confirmed NOT
         escaping: a comparison inside a TEMPLATE LITERAL interpolation
         (`` `${pool.tvlUsd >= 100000 ? 'ok' : 'no'}` ``) — already covered
         by the `${...}` re-entry-as-code behaviour documented above.

   ===========================================================================
   ASSIGNMENT DETECTOR (operator-requested widening — see product-loop-kit/
   specs/266-notes.md, "Operator-requested widening (assignment stratum)")
   ===========================================================================

   The comparison DETECTOR above is blind to a rail copy written as a bare
   ASSIGNMENT rather than a comparison — `const DEFAULT_MIN_TVL = 100000;`
   with no `<`/`<=`/`>`/`>=` anywhere near it. That was this file's own
   documented residue (coverage limitation (a) above) until an operator
   review measured the actual population and found it was not one site.

   A "site" here = `const|let|var <IDENT> = <NUMERIC LITERAL>;` where IDENT
   contains `tvl` or `apy` (case-insensitive) and the literal is non-zero
   (same zero-exclusion reasoning as the comparison detector — a `var count
   = 0;`-shaped initializer is never a rail copy). Scanned on the SAME
   globbed population as the comparison detector, over a COMMENT-stripped
   (real `//`/`/* */` removed, same string/template-aware walker as above so
   a glob string's `/*` or a URL's `://` is never mistaken for a comment)
   view of each file's source — deliberately NOT also blanking string/
   template TEXT the way the comparison scan's `stripCommentsAndStrings`
   does. Three of this repo's real sites (`test_chain_pages.js`,
   `test_markdown_twins.js`, `test_token_pages.js`) are
   `tokenSrc.replace('const MIN_POOL_TVL = 100000;', patchedMarker)`
   scratch-patch markers — the exact declaration text living inside a STRING
   LITERAL, used to patch a scratch copy of generate-token-pages.js for a
   mutation test. Blanking string text (as the comparison scan does, to
   avoid mistaking prose for code) would make these invisible too, which is
   the wrong call for THIS shape: a hand-typed copy of a rail-shaped
   declaration is exactly as fragile inside a patch-target string as it is
   in real code (if the generator's declaration text ever reformats, the
   `.replace()` silently no-ops today, caught only by that test's own
   `assert.ok(...includes...)`, not by this guard — a further, undocumented
   limitation of THIS shape, not fixed here). Comments ARE stripped, proven
   by a dedicated assertion below: this file's OWN header quotes
   `const DEFAULT_MIN_TVL = 100000;` as prose (coverage limitation (a) above)
   and must never itself become a "site".

   `trust-rails.js` and `app.js`'s two canonical declarations
   (`APY_SANITY_LIMIT`/`DEFAULT_MIN_TVL` in each) are EXCLUDED BY ROLE from
   the allowlist set-equality below, not silently dropped: a dedicated
   assertion proves each file contributes EXACTLY those two constants (never
   a third, unnoticed thing hiding behind the exclusion). `trust-rails.js`'s
   own header comment (trust-rails.js:1-32) explains the relationship this
   exclusion encodes: app.js:800-801 are canonical and human-owned;
   trust-rails.js:36-37 are the ONE mirror every OTHER consumer reads instead
   of hand-typing a third copy. Neither may derive from the other — app.js is
   browser-only global-scope code with no module system and cannot
   `require()` trust-rails.js back, and trust-rails.js's whole purpose is to
   BE the value app.js's human-owned line states, not read it from somewhere
   else.

   Every other rail-named bare assignment found in the population is folded
   into the SAME two-direction `file|expr` allowlist set-equality the
   comparison detector already used — see ALLOWLIST below. Some are FIXED
   (now `require('./trust-rails.js')` reads, so they no longer match this
   scan's literal-RHS shape — the same "the fix makes the site disappear"
   property Legs A/B relied on for home.html/tools/test-agent-tools.js); the
   rest are allowlisted with an honest reason. Several are further residue —
   genuine unlinked mirrors the operator's own evidence table didn't name,
   found only by actually running this widened detector against the live
   population rather than trusting the table as exhaustive (e.g.
   `PoolDetail.js`'s `APY_SANITY_LIMIT_LOCAL`, `compute-kpis.js`'s own
   `APY_SANITY_LIMIT`, `planner.js`'s `APY_SANITY_LIMIT`,
   `generate-spotlight.js`'s `APY_SANITY_LIMIT`, `generate-stories.js`'s
   `APY_SANITY_LIMIT`, `test_kpi_rail_history.js`'s `APY_SANITY_LIMIT`) —
   recorded honestly as out-of-scope residue, not fixed here, in
   product-loop-kit/specs/266-notes.md.

   ===========================================================================
   ALLOWLIST
   ===========================================================================

   Keyed on `file|normalised-expression` — NEVER a line number, so a
   refactor that moves a classified line doesn't silently orphan its entry
   (and doesn't silently un-flag a NEW rail copy that happens to land on an
   old entry's line number either). Every entry's reason names what the
   threshold actually IS (a confidence band, a segmentation bucket, a
   feature-specific gate, a test's own fixture/tolerance value) — never just
   "not a rail" with no further explanation, mirroring test_agent_surface_
   rail_claims.js's per-site reasoning discipline. Derived by running the
   scan and classifying every site it actually reported (spec 266 Leg C's
   own instruction) — see product-loop-kit/specs/266-notes.md for the run
   log this list was built from. Contains BOTH comparison-shaped entries
   (Leg C original) and assignment-shaped entries (operator-requested
   widening), folded into the same list per that widening's own instruction.

   ===========================================================================
   FIX 4 (verifier round 2, finding 4) — corrected claims, current counts
   ===========================================================================

   Round 1's PROP_RE/PLAIN_ASSIGN_RE "SCOPE NOTE" (see the comment directly
   above each detector) used to justify their shared SCREAMING_SNAKE_CASE key
   restriction by claiming "every real rail name in this file's existing
   ALLOWLIST already has [it]... every one SCREAMING_SNAKE_CASE, zero
   exceptions." **That claim was false as written**: the ALLOWLIST below has
   always contained two lowercase ASSIGNMENT-shaped entries,
   `home.html|var apy = 5.5` and `test_planner.js|var apy = 5.3` — real rail-
   adjacent entries findAssignmentSites reports with no case restriction at
   all (it never claimed one). Corrected in place (search "UNLIKE round 1's
   claim" in PROP_RE's own SCOPE NOTE): the restriction now stands on the
   object-property detector alone, justified purely by the measured 1040/107
   fixture-explosion cost of relaxing it (see that detector's own comment),
   never by a naming-convention absolute. FIX 2 (below) relaxed
   findPlainAssignmentSites's key predicate to the same case-insensitive
   `/tvl|apy/i` test every other detector uses, for exactly this reason.

   CURRENT counts, re-measured this round (verifiable by running this file —
   every number below is echoed by the script's own final summary line, not
   hand-typed independently of it):
     - population: 209 files (unchanged by this round — FIX 1/2/3 touched
       detector logic and the allowlist, not the globbed file list).
     - comparison sites (findSites): 36 (unchanged — findSites was already
       whole-file/flattened as of verifier round 1; this round's flattening
       fix applied to the OTHER three detectors, which had no comparison-
       shaped sites of their own to begin with).
     - zero-exclusion figure (comparison detector only): dropping the
       "literal !== 0" filter raises the comparison-site count from 36 to 96
       — 60 sites excluded (unchanged from verifier round 1's re-measurement;
       this round did not touch findSites/isZeroLiteral).
     - assignment sites (findAssignmentSites): 18 non-canonical + 4 canonical
       (app.js x2, trust-rails.js x2, excluded by role) — unchanged in COUNT
       by the whole-file flattening (no real site in this checkout happens to
       be split across a line boundary today; the fix closes a coverage GAP,
       proven by the n1 attack/regression test, not a count that was already
       wrong).
     - object-property sites (findObjectPropertySites): 0 real (the
       restriction is unchanged this round — see FIX 3 above; proven correct
       only by synthetic fixtures, same as before this round).
     - plain-assignment sites (findPlainAssignmentSites): 5, across 4 files
       — UP from 0 before FIX 2's key-predicate relaxation. Two are the
       fixture mutations FIX 2's own instruction named
       (`test_audit_app.js`/`test_audit_number_boundary.js`,
       `target.apyReward = 1`); two MORE were found by actually running the
       relaxed detector rather than trusting the "exactly 2" estimate as
       final — `test_audit_text_surfaces.js`/`test_seo_app_link_attribution.js`,
       both a URL query-string fragment (`?...&minApy=10` / `?...&minTvl=100000`)
       quoted inside a string-literal assertion message, which this detector
       does not strip (by design — see its own header). All 4 keys
       allowlisted with honest reasons; see "PLAIN-ASSIGNMENT-SHAPED entries"
       in the ALLOWLIST below.
     - allowlist entries: 53 (49 entering this round — 48 from the original
       widening + 1 generate-llms.js exponent entry added in round 1 — plus 4
       new PLAIN-ASSIGNMENT-SHAPED entries this round = 53).

   ===========================================================================
   OPERATOR ROUND 3 (default-parameter terminator widening) — updated counts
   ===========================================================================

   `findPlainAssignmentSites`'s terminator was widened from the shared
   `TERMINATOR_LOOKAHEAD` (`;`/`,`/`}`/end-of-line) to a detector-scoped
   `PLAIN_ASSIGN_TERMINATOR_LOOKAHEAD` that also accepts a closing `)` — a
   rail copy written as a DEFAULT PARAMETER (`function f(pool, minTvl =
   100000) {...}`) is terminated by the parameter list's closing paren, a
   shape every terminator before this round missed entirely. Live anchor:
   `generate-sitemap.js:88`'s own `function isQualifyingPool(pool, minTvl =
   SITEMAP_MIN_TVL)` — correct today (an identifier, not a literal), but a
   hand-typed literal there instead of the constant is exactly the shape this
   closes. See "plain-assignment detector catches a rail-shaped DEFAULT
   PARAMETER... (operator round 3, attack __n3)" below for the synthetic
   proof, and product-loop-kit/specs/266-notes.md, "Operator round-3 check:
   default-parameter shape", for the live plant-and-revert proofs (both the
   single-trailing-parameter shape and the multi-parameter/comma-terminated
   shape, plus round-2's n1/n5 re-run as a regression check) with md5 pairs.
   The multi-parameter case (`f(a, minTvl = 100000, b)`) needed no new
   terminator branch — its trailing `,` was already one of
   `TERMINATOR_LOOKAHEAD`'s original branches, confirmed still caught both
   before and after this round's change by a dedicated regression test.

   CURRENT counts, re-measured this round (population and the other three
   detectors are UNCHANGED — this round widened `PLAIN_ASSIGN_RE`'s
   terminator only):
     - population: 209 files (unchanged).
     - comparison sites (findSites): 36 (unchanged).
     - assignment sites (findAssignmentSites): 18 non-canonical + 4 canonical
       (unchanged).
     - object-property sites (findObjectPropertySites): 0 real (unchanged).
     - plain-assignment sites (findPlainAssignmentSites): 6, across 5 files —
       UP from 5/4 files. The widening surfaced exactly ONE new real site:
       `test_seo_cta_render.js:112`'s `minTvl = 100000` — NOT real code, a
       `console.log` message reporting a fixture's TVL value whose string
       happens to end in a literal `)` right after the number (the same
       false-positive class the `test_seo_app_link_attribution.js` entry
       above already documents for a URL query string, here in ordinary log
       text instead). Allowlisted with an honest reason; see
       "PLAIN-ASSIGNMENT-SHAPED entries" in the ALLOWLIST below. No
       previously-allowlisted site was dropped or re-keyed.
     - allowlist entries: 54 (53 entering this round + 1 new
       `test_seo_cta_render.js` entry = 54).

   RESIDUE, STILL OPEN (not fixed by this round, stated explicitly, see also
   product-loop-kit/specs/266-notes.md): a lowercase OBJECT-PROPERTY rail
   copy (`const __R3 = { defaultMinTvl: 100000, apySanityLimit: 1000 };`)
   still escapes every detector in this file. `findObjectPropertySites`
   (PROP_RE) keeps its SCREAMING_SNAKE_CASE key restriction (FIX 3 above) —
   relaxing it was RE-MEASURED as recently as verifier round 2 at 1040 raw
   hits / 107 after excluding DefiLlama's own field names, too large to
   classify honestly. This is NOT a class this round closes, and is not
   claimed as closed: the escaping shape is general (ANY lowercase/camelCase
   object-property rail mirror, not just the one worked example), the
   restriction is kept for the same measured-cost reason as before, and a
   named LIVE instance of the exact consequence already exists and is
   independently pinned by the "FIX 3 pin" test below —
   `generate-spotlight.js:419-421`'s lowercase `PERSONA_BANDS` object versus
   `planner.js:567/572`'s lowercase `PERSONAS` object, diverging by exactly
   100x on 2 of the 3 bands (`rwa`, `degen`; `stable` agrees) — neither side
   is SCREAMING_SNAKE_CASE, so PROP_RE cannot see either declaration, let
   alone their divergence. A future item would need to either accept
   reclassifying a very large (107+) fixture population, or find a narrower
   predicate than "any tvl/apy-containing key" that still catches this shape
   without that explosion — neither attempted here.

   ===========================================================================
   VERIFIER ROUND 3 (the parenthesised-operand gap) — updated counts
   ===========================================================================

   The verifier's finding: `findSites`' comparison detector only matched a
   BARE identifier/member chain sitting directly against the operator — the
   punctuation of the two motivating instances — and was blind to this
   repo's own HOUSE IDIOM for rail comparisons, the exact form used at the
   three rail-enforcement points this backlog item rewired (generate-
   sitemap.js:88, generate-spotlight.js:79, generate-pools-snapshot.js:81).
   Fixed by the PAREN_GROUP_RE operand widening (see "DETECTOR" above and
   PAREN_GROUP_RE's own comment near findSites) and by making PROP_RE accept
   a quoted key (`'DEFAULT_MIN_TVL': 100000`). While re-deriving the real
   list of newly-surfaced sites (rather than trusting the verifier's own
   11-item enumeration, per its own instruction), a SEPARATE, pre-existing
   bug was found and fixed too: stripCommentsAndStrings/stripComments had no
   notion of a JS regex literal, so a regex containing a quote character
   (common in this codebase's own JSON-shaped generator regexes) desynced
   quote-tracking for the rest of the file — see regexAllowedBefore/
   scanRegexLiteral's own header comments, and the "DETECTOR" section above,
   for the full explanation. Both fixes were necessary for the verifier's
   own named `generate-pools-snapshot.js:312` site to actually become
   visible (the operand widening alone was not sufficient — that exact site
   sat inside one of the 7 files the regex-literal bug had corrupted).

   CURRENT counts, re-measured this round (verifiable by running this file):
     - population: 209 files (unchanged — this round touched detector logic
       and the allowlist, not the globbed file list).
     - comparison sites (findSites): 55 — UP from 36. Derivation: the
       regex-literal fix alone (old operand grammar, fixed comment/string
       stripper) raises the count to 38 (2 net-new: test_api_worker.js:103/
       104's string-length anti-vacuity checks, previously hidden inside a
       TRANSIENTLY corrupted span of that file); the operand-grammar
       widening on top of THAT fixed baseline adds 17 more (55 total) — the
       two fixes are not simply additive site-for-site (36+2+17=55, not a
       coincidence: verified by running each fix in isolation against the
       shipped baseline before combining them). 19 sites are net-new versus
       the shipped 36; ZERO previously-classified sites were dropped
       (verified: every one of the original 36 is still present, unchanged,
       in the new 55). All 19 classified in the ALLOWLIST's own "VERIFIER
       ROUND 3" section (some fold multiple physical occurrences — e.g.
       PoolDetail.js's 5-times-repeated ratio guard — into ONE key after
       whitespace normalisation, so 19 sites resolve to 15 new keys). None is
       a REAL unlinked rail copy — see that section's own reasoning per
       entry.
     - zero-exclusion figure (comparison detector only): dropping the
       "literal !== 0" filter now raises the comparison-site count from 55
       to 127 — 72 sites excluded (up from 60, because the operand widening
       surfaces many more `(x || 0) > 0`-shaped emptiness tests than the
       bare-identifier form ever could — see "DETECTOR" above).
     - assignment sites (findAssignmentSites): 18 non-canonical + 4 canonical
       (UNCHANGED — this round's regex-literal fix to stripComments was
       verified, population-wide, to surface ZERO new assignment/object-
       property/plain-assignment sites; the corruption this round fixes
       happened to only ever matter for findSites' own comparison scan in
       this checkout).
     - object-property sites (findObjectPropertySites): 0 real (UNCHANGED —
       the quoted-key widening surfaces ZERO new real sites; re-verified
       against BOTH the shipped and the regex-literal-fixed comment
       stripper, population-wide, to rule out a quoted key hiding inside one
       of the 7 corrected files' now-visible text).
     - plain-assignment sites (findPlainAssignmentSites): 6, across 5 files
       (UNCHANGED).
     - allowlist entries: 69 (54 entering this round + 15 new keys covering
       the 19 newly-classified sites = 69).

   HUNTED SHAPES this round (task's own instruction: find at least 3 more,
   record the result whether they escape or not — tested directly against
   all four detectors, not merely reasoned about; see product-loop-kit/
   specs/266-notes.md for the full battery and its raw output):
     - ESCAPES: bracket/computed-property assignment (`obj['tvlFloor'] =
       100000;`) — coverage limitation (c) above.
     - ESCAPES: a rail value used as a `Math.min`/`Math.max` CLAMP with no
       comparison operator at all — coverage limitation (d) above.
     - ESCAPES: a rail comparison via a function call whose NAME (not its
       argument) encodes the rail (`getTvlFloor() >= 100000`) — coverage
       limitation (e) above.
     - ESCAPES: equality operators (`===`/`!==`/`==`/`!=`) — never in `OPS`
       — coverage limitation (f) above.
     - ESCAPES (already-documented shape, RE-CONFIRMED with a direct test
       rather than left as an assumption): a ternary or array RHS on a bare
       assignment (`const apyFloor = cond ? 100000 : 500;`, `const tvlTiers
       = [100000, ...]`) — coverage limitation (a)'s own residual gap.
     - DOES NOT ESCAPE (confirmed, not merely assumed): a rail copy written
       as a DESTRUCTURING DEFAULT (`const { minTvl = 100000 } = opts;` or a
       function parameter's own `{ minTvl = 100000 } = {}`) — already caught
       by findPlainAssignmentSites, no widening needed — coverage limitation
       (g) above.
     - DOES NOT ESCAPE (confirmed): a comparison inside a TEMPLATE LITERAL
       `${...}` interpolation — already covered by the interpolation
       re-entry-as-code behaviour the "DETECTOR" section documents.

   RESIDUE, STILL OPEN after this round (stated explicitly, see also
   product-loop-kit/specs/266-notes.md): the lowercase OBJECT-PROPERTY
   residue named in the section directly above is UNCHANGED by this round
   (PROP_RE's SCREAMING_SNAKE_CASE restriction was not touched, only its
   quoting tolerance was) — including a variant of it found this round,
   `Object.assign(rails, { tvlFloor: 100000 });` (a lowercase key inside an
   object-literal FUNCTION ARGUMENT rather than a `const X = {...}`
   declaration), which escapes for the identical reason, not a new root
   cause. Coverage limitations (c)/(d)/(e)/(f) above are NEW residue this
   round names but does not close.

   Run: node test_rail_predicate_derivation.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('executable rail-predicate scan — backlog 266\n');

// ---------------------------------------------------------------------------
// Population — globbed at test time, never a hand-typed file list. See
// header comment for the full enumerated INCLUDED/EXCLUDED boundary.
// ---------------------------------------------------------------------------

const JS_GLOB_PATTERNS = ['*.js', 'test_*.js', 'edge/*.js', 'tools/*.js', 'src/*.js'];
const NAMED_HTML_FILES = ['home.html', 'plan.html'];

function isGeneratedTwin(rel) {
  return rel.endsWith('.min.js') || rel.endsWith('.compiled.js');
}

function globPopulation() {
  const matches = fs.globSync(JS_GLOB_PATTERNS, { cwd: ROOT });
  const jsFiles = Array.from(new Set(matches))
    .filter((rel) => !isGeneratedTwin(rel))
    .filter((rel) => fs.statSync(path.join(ROOT, rel)).isFile());
  const htmlFiles = NAMED_HTML_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)));
  return Array.from(new Set([...jsFiles, ...htmlFiles])).sort();
}

const population = globPopulation();
console.log(`population: ${population.length} file(s) globbed`);

test('population is non-vacuous (>=10 files) and includes both known defect sites (home.html, tools/test-agent-tools.js)', () => {
  assert.ok(population.length >= 10, `expected >=10 files globbed, got ${population.length}`);
  assert.ok(population.includes('home.html'), 'home.html must be in the globbed population');
  assert.ok(population.includes(path.join('tools', 'test-agent-tools.js')), 'tools/test-agent-tools.js must be in the globbed population');
});

test('excluded roots never leak into the population (by role — see header comment)', () => {
  const excludedRoots = [
    // NOTE: `src/` is DELIBERATELY not excluded any more — verifier round 1,
    // finding 3b brought it INTO the population (poller-core.js is CommonJS
    // and can require('../trust-rails.js') like any other Node file; only
    // src/poller.js, the ESM Worker entry that imports poller-core, is
    // fundamentally different, and it carries no rail literals of its own).
    'pools', 'tokens', 'chains', 'ko', 'stories', 'product-loop-kit',
    'telegram-bot', 'whatsapp-bot', 'workers', '.well-known', 'data',
    'assets', 'fonts', 'og', 'test-fixtures', 'test_fixtures', 'node_modules', 'docs',
  ];
  const leaked = population.filter((rel) => excludedRoots.some((r) => rel === r || rel.startsWith(r + path.sep) || rel.startsWith(r + '/')));
  assert.deepStrictEqual(leaked, [], `these roots must never appear in the population: ${JSON.stringify(leaked)}`);
});

test('generated-artifact twins (*.min.js, *.compiled.js) never appear in the population', () => {
  const leaked = population.filter(isGeneratedTwin);
  assert.deepStrictEqual(leaked, [], `generated twins must never appear in the population: ${JSON.stringify(leaked)}`);
});

// ---------------------------------------------------------------------------
// Detector — comment/string-aware strip, then a two-direction literal-
// comparison regex scan. See header comment ("DETECTOR") for the reasoning.
// ---------------------------------------------------------------------------

// REGEX-LITERAL AWARENESS (verifier round 3, the parenthesised-operand gap —
// discovered as a SEPARATE, pre-existing bug while chasing the named
// generate-pools-snapshot.js:312 site, not something the operand-grammar
// widening below introduces). Neither stripCommentsAndStrings nor
// stripComments previously knew a JS REGEX LITERAL (`/pattern/flags`) is a
// distinct token: a `/` was only ever treated as a `//`/`/* */` comment
// opener or as an ordinary character. A regex literal containing a quote
// character — extremely common in this codebase's own `"key":\s*` JSON-
// shaped generators, e.g. generate-pools-snapshot.js:125's
// `.replace(/("generatedAt":\s*)"[^"]*"/g, ...)` — has an ODD number of `"`
// characters (5, here) purely as regex syntax, not string syntax. The old
// walker, seeing only bare quote characters, flips its `quote` state at each
// one; an odd count leaves it PERMANENTLY stuck "inside a string" for the
// rest of the file, blanking every line after it out of existence for
// findSites (and, had any of the 6 affected files needed it, out of
// existence for findAssignmentSites/findObjectPropertySites/
// findPlainAssignmentSites too — verified NOT the case this round, see
// product-loop-kit/specs/266-notes.md). Six files in this checkout's
// population were measured corrupted this way BEFORE this fix: compute-
// kpis.js, generate-history-backfill.js, generate-pools-snapshot.js,
// generate-protocol-urls.js, test_seo_app_link_attribution.js, test_seo_
// cta_targets.js (all via a `"key":...` JSON-shaped regex) — plus a 7th,
// test_api_worker.js, whose corruption is TRANSIENT (a `href="([^"]*)"`-
// shaped regex desyncs the state for a few dozen lines, then a LATER regex
// literal with its own odd quote-count happens to resync it by accident) —
// found only by re-running this exact scan, not asserted from a static list.
//
// Fix: recognise a regex literal by the same "is a value expected here"
// heuristic every real JS tokenizer uses — a `/` immediately after an
// operator/opening-punctuation/regex-precursor keyword (or at the very start
// of the file) begins a regex literal, not a division; anywhere else, `/` is
// division (or, as already handled above, a comment opener). This is a
// documented HEURISTIC, not a full parser (see regexAllowedBefore's own
// coverage-limitation note below), but it resolves all 7 measured corruption
// sites in this checkout with no false positives introduced (verified by
// the non-vacuity + zero-regression assertions below, and by the full
// re-measurement in product-loop-kit/specs/266-notes.md).
const REGEX_PRECEDING_KEYWORD_RE = /(?:^|[^\w$])(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/** True if a `/` at content[i] can grammatically begin a regex literal,
 * decided from the RAW (unstripped) source immediately preceding position
 * `i` — deliberately NOT from the accumulated `out` (which may have already
 * blanked/preserved intervening text differently between the two callers),
 * so this one helper serves both stripCommentsAndStrings and stripComments
 * identically. Looks at the last non-whitespace character before `i`: an
 * operator/opening-punctuation character, or a regex-precursor keyword,
 * means "a value is expected next" (regex allowed); an identifier/number/
 * closing-bracket character means "a value already ended" (division, not a
 * regex). Start-of-file (nothing but whitespace before `i`) allows a regex.
 * KNOWN LIMITATION (documented, not fixed): if a COMMENT or STRING ends
 * immediately before the `/` with no real code between, this look-back can
 * be fooled (e.g. `/* c *‍/ /foo/` — the comment's own closing `*‍/` chars
 * aren't in the punctuation set, so this would wrongly read as division).
 * No instance of this exact shape exists in this checkout's population
 * (verified by this round's own full re-scan finding no regression); a
 * future file could still hit it — named here as residue, same character as
 * every other detector's own documented coverage limitation in this file. */
function regexAllowedBefore(content, i) {
  const tail = content.slice(Math.max(0, i - 60), i).replace(/\s+$/, '');
  if (tail === '') return true;
  const lastChar = tail[tail.length - 1];
  if ('([{,;:=!&|?+-*%^~<>'.includes(lastChar)) return true;
  if (REGEX_PRECEDING_KEYWORD_RE.test(tail)) return true;
  return false;
}

/** Scans a regex literal starting at content[i] (content[i] === '/', already
 * confirmed not a `//`/`/* *‍/` comment opener by the caller). Respects
 * backslash escapes and `[...]` character classes (where an unescaped `/`
 * does NOT terminate the literal — e.g. `/[a\/b]/`), then consumes trailing
 * flag letters. Returns the exclusive end index, or `null` if no valid
 * terminator is found before a raw newline or EOF (regex literals cannot
 * contain a literal newline) — in that case the caller must NOT treat
 * content[i] as a regex opener, falling back to treating `/` as an ordinary
 * character (safe: worst case is the pre-existing quote-corruption bug this
 * round fixes, never a WORSE outcome than before this round). */
function scanRegexLiteral(content, i) {
  const n = content.length;
  let j = i + 1;
  let inClass = false;
  while (j < n) {
    const cj = content[j];
    if (cj === '\\') { j += 2; continue; }
    if (cj === '\n') return null;
    if (cj === '[') { inClass = true; j++; continue; }
    if (cj === ']') { inClass = false; j++; continue; }
    if (cj === '/' && !inClass) { j++; break; }
    j++;
  }
  if (j >= n && content[j - 1] !== '/') return null;
  while (j < n && /[a-zA-Z]/.test(content[j])) j++;
  return j;
}

/** Blanks out real `//`/`/* *‍/` comments, REGEX LITERALS (verifier round 3 —
 * see regexAllowedBefore/scanRegexLiteral above), and ordinary string/
 * template-literal TEXT (preserving newlines, so line numbers stay correct),
 * while re-entering a template literal's `${...}` interpolation as real code
 * — a `://` inside a string (e.g. a URL) is never mistaken for a line
 * comment start (guarded by the `content[i-1] !== ':'` check). */
function stripCommentsAndStrings(content) {
  let out = '';
  let i = 0;
  const n = content.length;
  const stack = []; // frames: {type:'template'} | {type:'templateExpr', depth}
  let quote = null; // active `'`/`"` string quote, or null
  while (i < n) {
    const c = content[i];
    const top = stack[stack.length - 1];

    if (quote) {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === quote) { quote = null; out += ' '; i++; continue; }
      out += (c === '\n' ? '\n' : ' ');
      i++;
      continue;
    }

    if (top && top.type === 'template') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === '`') { stack.pop(); out += ' '; i++; continue; }
      if (c === '$' && content[i + 1] === '{') { stack.push({ type: 'templateExpr', depth: 1 }); out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' ');
      i++;
      continue;
    }

    if (top && top.type === 'templateExpr') {
      if (c === '{') { top.depth++; out += c; i++; continue; }
      if (c === '}') {
        top.depth--;
        if (top.depth === 0) { stack.pop(); out += ' '; i++; continue; }
        out += c; i++; continue;
      }
      // else: fall through to normal code scanning below (comments/strings/
      // nested templates can all occur inside an interpolation).
    }

    if (c === '/' && content[i + 1] === '*') {
      let j = content.indexOf('*/', i + 2);
      if (j === -1) j = n; else j += 2;
      out += content.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    if (c === '/' && content[i + 1] === '/' && content[i - 1] !== ':') {
      let j = content.indexOf('\n', i);
      if (j === -1) j = n;
      out += content.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    if (c === '/' && content[i + 1] !== '/' && content[i + 1] !== '*' && regexAllowedBefore(content, i)) {
      const end = scanRegexLiteral(content, i);
      if (end !== null) {
        out += content.slice(i, end).replace(/[^\n]/g, ' ');
        i = end;
        continue;
      }
    }
    if (c === "'" || c === '"') { quote = c; out += ' '; i++; continue; }
    if (c === '`') { stack.push({ type: 'template' }); out += ' '; i++; continue; }

    out += c;
    i++;
  }
  return out;
}

// Identifier: a dotted/bracket/optional-chained property path
// (`p.tvlUsd`, `kpis.apyStdev`, `SUB_10M_FIXTURE.tvlUsd`). Both the
// identifier and the literal are lookaround-guarded so neither is ever
// matched as a SUFFIX of a larger token (e.g. the "2" inside `apy2`, which
// briefly produced a false "2 > APY_SANITY_LIMIT" site before this guard was
// added — see product-loop-kit/specs/266-notes.md).
const IDENT_RE = '[A-Za-z_$][A-Za-z0-9_$]*(?:\\??\\.[A-Za-z_$][A-Za-z0-9_$]*|\\[[^\\]]+\\])*';

// Numeric literal — WIDENED (verifier round 1, finding 2: keyed on the two
// known instances' plain-decimal shape, not on the actual grammar of a JS
// numeric literal). Covers every form this repo's own house style already
// uses (trust-rails.js's `1e9/1e6/1e3`, tools/test-agent-tools.js's `1e6`)
// or a future hand-typed copy could plausibly use:
//   - hex                    0x1a4, 0XFF
//   - exponent               1e5, 1E5, 1e+5, 1e-5
//   - underscore separators  100_000, 1_000_000
//   - leading-dot decimals   .5
//   - plain decimals         100000, 4.0
// Alternation order matters (first branch that matches wins): hex must be
// tried before the plain-decimal branch would otherwise consume just the
// leading "0" of "0x1a4" and stop.
const NUM_RE = '(?:0[xX][0-9a-fA-F][0-9a-fA-F_]*' +
  '|(?:\\d[\\d_]*)?\\.\\d[\\d_]*(?:[eE][+-]?\\d+)?' +
  '|\\d[\\d_]*(?:\\.[\\d_]*)?(?:[eE][+-]?\\d+)?)';
const OPS = ['<=', '>=', '<', '>'];
const FLIP_OP = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

/** True if a matched NUM_RE token is zero (same "a rail of 0 is degenerate"
 * exclusion the header documents) — Number() parses every NUM_RE shape
 * (hex/exponent/decimal) correctly once `_` separators are stripped. */
function isZeroLiteral(lit) {
  return Number(lit.replace(/_/g, '')) === 0;
}

/** Maps a character offset into a comment/string-stripped source (newlines
 * preserved at their ORIGINAL positions — see stripCommentsAndStrings/
 * stripComments, both length- and newline-position-preserving) to a
 * 1-indexed line number, via binary search over that file's sorted newline
 * offsets. Shared by every detector below that flattens lines for a
 * multi-line scan. */
function lineForOffset(newlineOffsets, offset) {
  let lo = 0, hi = newlineOffsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (newlineOffsets[mid] < offset) lo = mid + 1; else hi = mid;
  }
  return lo + 1;
}

// PARENTHESISED-OPERAND WIDENING (verifier round 3 — the previous detector
// only matched when a BARE identifier/member chain sat directly against the
// operator, the punctuation of the two motivating instances (spec 266's
// Evidence). It was blind to this repo's own HOUSE IDIOM for rail
// comparisons — the exact form used at the three rail-enforcement points
// backlog 266 itself rewired: `(pool.tvlUsd || 0) >= minTvl` (generate-
// sitemap.js:88), `(pool.tvlUsd || 0) >= DEFAULT_MIN_TVL` (generate-
// spotlight.js:79), `(Number(pool.tvlUsd) || 0) >= DEFAULT_MIN_TVL`
// (generate-pools-snapshot.js:81) — all three correct TODAY because their
// right-hand side is an IDENTIFIER, never a literal, so none of them is
// itself a "site" under this detector (comparing to a constant is the
// correct idiom, not a rail copy) — but a hand-typed LITERAL at any of those
// three shapes was, until this round, invisible. Fixed by widening the
// OPERAND grammar itself, not by special-casing those three lines: the
// identifier position now also accepts any PARENTHESISED expression whose
// text contains a tvl/apy-named identifier (`PAREN_GROUP_RE`, up to 3 levels
// of paren nesting — deep enough for this checkout's own worst case,
// PoolDetail.js's `(Math.max((pool.apyBase||0)+(pool.apyReward||0),
// pool.apyMean30d) / Math.min(...))` ratio guard, 3 levels deep), in EITHER
// operand order; the literal position now also accepts a parenthesised
// literal (`p.tvlUsd < (100000)`, attack x6). Internal whitespace inside a
// captured paren-group is normalised to single spaces before use as an
// ALLOWLIST key (`normaliseIdent`) — an indentation-only difference between
// otherwise-identical occurrences (this checkout has 5 of exactly one
// PoolDetail.js ratio-guard expression, differently indented per call site)
// must not force 5 separate allowlist entries, the same "one key covers
// every identical occurrence" precedent generate-llms.js's `tvl > 1e9` entry
// already set (4 occurrences, 1 key). See product-loop-kit/specs/
// 266-notes.md, "Verifier round 3 — the parenthesised-operand gap", for the
// full re-measurement (19 newly surfaced real sites, all classified) and the
// live plant/revert proofs (attacks x1/x2/x6).
const PAREN_L0 = '[^()]*';
const PAREN_L1 = '(?:[^()]|\\(' + PAREN_L0 + '\\))*';
const PAREN_L2 = '(?:[^()]|\\(' + PAREN_L1 + '\\))*';
// Up to 3 levels of nesting total: the outer paren, plus one level via
// PAREN_L2's own `\(PAREN_L1\)` branch, plus one more via PAREN_L1's own
// `\(PAREN_L0\)` branch.
const PAREN_GROUP_RE = '\\(' + PAREN_L2 + '\\)';
const IDENT_MAYBE_PAREN_RE = `(?:(?:(?<![\\w$.])${IDENT_RE})|${PAREN_GROUP_RE})`;
const IDENT_MAYBE_PAREN_TRAILING_RE = `(?:${IDENT_RE}(?![\\w$])|${PAREN_GROUP_RE})`;
const LIT_MAYBE_PAREN_TRAILING_RE = `(?:\\(\\s*${NUM_RE}\\s*\\)|${NUM_RE}\\b)`;
const LIT_MAYBE_PAREN_LEADING_RE = `(?:\\(\\s*(?<![\\w$.])${NUM_RE}\\s*\\)|(?<![\\w$.])${NUM_RE})`;

/** Strips a single layer of wrapping `( ... )` (with any surrounding
 * whitespace) off a captured literal token, so `(100000)` (attack x6) and
 * `100000` both resolve to the same numeric text for isZeroLiteral/the
 * ALLOWLIST key. A bare (unwrapped) token passes through unchanged. */
function unwrapParenLiteral(tok) {
  const m = /^\(\s*([\s\S]*?)\s*\)$/.exec(tok);
  return m ? m[1] : tok;
}

/** Collapses internal whitespace runs (which only ever appear inside a
 * captured PAREN_GROUP_RE — a bare IDENT_RE match never contains whitespace)
 * to a single space, so two occurrences of the same expression that differ
 * only in source indentation land on the SAME allowlist key. See this
 * widening's own header comment above for why. */
function normaliseIdent(ident) {
  return ident.replace(/\s+/g, ' ').trim();
}

/** Comparison detector — WIDENED (verifier round 1, finding 2: the previous
 * per-LINE scan was blind to a condition wrapped across two source lines,
 * e.g.:
 *   if (p.tvlUsd <
 *       100000) return false;
 * — a real, legal JS shape ordinary line-length wrapping produces routinely).
 * Fix: scan the WHOLE file as one flattened string (comment/string-stripped,
 * then every newline replaced with a single space — 1:1, so every other
 * character's offset is unchanged) instead of splitting into lines and
 * scanning each independently. This is a single global pass per file, so a
 * same-line match is still found exactly once (nothing changes for the
 * common case) and a wrapped match is now found too, with no separate
 * windowing pass and no risk of double-reporting one match at multiple
 * window-start lines. The reported line number is the line the match's FIRST
 * character (the identifier or literal, whichever comes first) starts on,
 * recovered from the ORIGINAL newline positions (lineForOffset), not the
 * flattened string's (nonexistent) line breaks. FURTHER WIDENED (verifier
 * round 3) — see PAREN_GROUP_RE and friends above — to accept a
 * parenthesised operand on either side, in either order. */
function findSites(file, content) {
  const stripped = stripCommentsAndStrings(content);
  const newlineOffsets = [];
  for (let idx = 0; idx < stripped.length; idx++) {
    if (stripped.charCodeAt(idx) === 10) newlineOffsets.push(idx);
  }
  const flattened = stripped.replace(/\n/g, ' ');
  const sites = [];
  for (const op of OPS) {
    const opEsc = op.replace(/[<>]/g, '\\$&');
    // ident-or-paren-group OP literal-or-parenthesised-literal — canonical order.
    const reIdentFirst = new RegExp(`(${IDENT_MAYBE_PAREN_RE})\\s*${opEsc}\\s*(${LIT_MAYBE_PAREN_TRAILING_RE})`, 'g');
    let m;
    while ((m = reIdentFirst.exec(flattened))) {
      const ident = normaliseIdent(m[1]), lit = unwrapParenLiteral(m[2]);
      if (!/tvl|apy/i.test(ident)) continue;
      if (isZeroLiteral(lit)) continue;
      sites.push({ file, line: lineForOffset(newlineOffsets, m.index), expr: `${ident} ${op} ${lit}` });
    }
    // literal-or-parenthesised-literal OP ident-or-paren-group — flip to the
    // canonical ident-first order+operator (e.g. `10000000 <= p.tvlUsd`
    // normalises to the same key as `p.tvlUsd >= 10000000` would).
    const reLitFirst = new RegExp(`(${LIT_MAYBE_PAREN_LEADING_RE})\\s*${opEsc}\\s*(${IDENT_MAYBE_PAREN_TRAILING_RE})`, 'g');
    while ((m = reLitFirst.exec(flattened))) {
      const lit = unwrapParenLiteral(m[1]), ident = normaliseIdent(m[2]);
      if (!/tvl|apy/i.test(ident)) continue;
      if (isZeroLiteral(lit)) continue;
      sites.push({ file, line: lineForOffset(newlineOffsets, m.index), expr: `${ident} ${FLIP_OP[op]} ${lit}` });
    }
  }
  return sites;
}

const allSites = [];
for (const rel of population) {
  const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  allSites.push(...findSites(rel, content));
}

console.log(`sites: ${allSites.length} pool-threshold literal comparison(s) found across ${new Set(allSites.map((s) => s.file)).size} file(s)`);
for (const s of allSites) console.log(`  ${s.file}:${s.line}  [${s.expr}]`);

test('scanned sites are non-vacuous (>=20) — a scan that silently finds nothing must not read as green', () => {
  assert.ok(allSites.length >= 20, `expected >=20 classified sites, found ${allSites.length}`);
});

test('backlog 266 acceptance: home.html and tools/test-agent-tools.js contribute ZERO sites after Legs A+B', () => {
  const leaked = allSites.filter((s) => s.file === 'home.html' || s.file === path.join('tools', 'test-agent-tools.js'));
  assert.deepStrictEqual(leaked, [], `Leg A/B did not fully derive from trust-rails.js — found literal(s): ${JSON.stringify(leaked)}`);
});

test('verifier round 1, finding 3b: src/ is now IN the population, and src/poller-core.js / src/poller.js contribute ZERO comparison sites (derives from trust-rails.js)', () => {
  assert.ok(population.includes(path.join('src', 'poller-core.js')), 'src/poller-core.js must be in the globbed population');
  assert.ok(population.includes(path.join('src', 'poller.js')), 'src/poller.js must be in the globbed population');
  const leaked = allSites.filter((s) => s.file === path.join('src', 'poller-core.js') || s.file === path.join('src', 'poller.js'));
  assert.deepStrictEqual(leaked, [], `src/poller-core.js did not fully derive from trust-rails.js — found literal(s): ${JSON.stringify(leaked)}`);
});

// ---------------------------------------------------------------------------
// ASSIGNMENT DETECTOR (operator-requested widening) — comment-stripped ONLY
// (strings kept, see header comment "ASSIGNMENT DETECTOR" for why), then a
// `const|let|var IDENT = LITERAL;` regex scan. Same population as above.
// ---------------------------------------------------------------------------

/** Strips real `//`/`/* *‍/` comments and REGEX LITERALS (verifier round 3 —
 * see regexAllowedBefore/scanRegexLiteral above stripCommentsAndStrings; same
 * shared helpers, same "odd quote count inside a regex desyncs quote
 * tracking for the rest of the file" bug this closes) only — a string/
 * template-aware walker (same state machine as stripCommentsAndStrings) so a
 * glob string's `/*` or a URL's `://` is never mistaken for a comment
 * opener, but ordinary string/template TEXT (and, like a string, a regex
 * literal's own body) is preserved verbatim (unlike stripCommentsAndStrings)
 * so a rail-shaped declaration hand-typed INSIDE a string literal (e.g. a
 * test's `tokenSrc.replace('const MIN_POOL_TVL = 100000;', ...)` scratch-
 * patch marker) is still scanned as a site — see header comment. Re-measured
 * this round: fixing this bug surfaces ZERO new assignment/object-property/
 * plain-assignment sites in this checkout (verified by re-running all three
 * detectors population-wide before/after — see product-loop-kit/specs/
 * 266-notes.md) — the regex-literal corruption this closes happened to only
 * ever matter for findSites' comparison scan in the 7 affected files, not
 * for a bare declaration/property/no-keyword-assignment shape landing in one
 * of their corrupted spans. Fixed anyway, for the same reason findSites is:
 * an unfixed shared helper is a latent hole regardless of which files
 * happen to exercise it today. */
function stripComments(content) {
  let out = '';
  let i = 0;
  const n = content.length;
  const stack = [];
  let quote = null;
  while (i < n) {
    const c = content[i];
    const top = stack[stack.length - 1];

    if (quote) {
      if (c === '\\') { out += content[i] + (content[i + 1] || ''); i += 2; continue; }
      if (c === quote) { quote = null; out += c; i++; continue; }
      out += c;
      i++;
      continue;
    }

    if (top && top.type === 'template') {
      if (c === '\\') { out += content[i] + (content[i + 1] || ''); i += 2; continue; }
      if (c === '`') { stack.pop(); out += c; i++; continue; }
      if (c === '$' && content[i + 1] === '{') { stack.push({ type: 'templateExpr', depth: 1 }); out += '${'; i += 2; continue; }
      out += c;
      i++;
      continue;
    }

    if (top && top.type === 'templateExpr') {
      if (c === '{') { top.depth++; out += c; i++; continue; }
      if (c === '}') {
        top.depth--;
        if (top.depth === 0) { stack.pop(); out += c; i++; continue; }
        out += c; i++; continue;
      }
      // else: fall through (comments/strings/nested templates can occur
      // inside an interpolation, same as stripCommentsAndStrings).
    }

    if (c === '/' && content[i + 1] === '*') {
      let j = content.indexOf('*/', i + 2);
      if (j === -1) j = n; else j += 2;
      out += content.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    if (c === '/' && content[i + 1] === '/' && content[i - 1] !== ':') {
      let j = content.indexOf('\n', i);
      if (j === -1) j = n;
      out += content.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    if (c === '/' && content[i + 1] !== '/' && content[i + 1] !== '*' && regexAllowedBefore(content, i)) {
      const end = scanRegexLiteral(content, i);
      if (end !== null) {
        out += content.slice(i, end); // preserved verbatim, like a string — see this function's own header
        i = end;
        continue;
      }
    }
    if (c === "'" || c === '"') { quote = c; out += c; i++; continue; }
    if (c === '`') { stack.push({ type: 'template' }); out += c; i++; continue; }

    out += c;
    i++;
  }
  return out;
}

// Simple (non-dotted) identifier — a declaration's LHS is always a bare
// name, never a property path. Same lookbehind-guard discipline as IDENT_RE
// above (no suffix-of-a-larger-token false positives).
const DECL_IDENT_RE = '[A-Za-z_$][A-Za-z0-9_$]*';

// Terminator — WIDENED (verifier round 1, finding 2: the previous `\s*;`
// required a literal trailing semicolon, so ASI (no semicolon at all,
// newline-terminated), a trailing `,` in a multi-declarator statement
// (`const A = 1, B_MIN_TVL = 100000`), or a closing `}` right after the
// literal (the last property before an object/block closes) all defeated
// it). A declaration's numeric RHS is now considered terminated by `;`,
// `,`, `}`, OR end-of-line — asserted via lookahead (not consumed), so nothing
// downstream on the same line after a `,`/`}` is skipped. The `\s*$`
// alternative requires the `m` (multiline) flag on every regex that embeds
// this fragment — see "WHOLE-FILE SCAN" below for why: without it, `$` would
// only match the true end of the ENTIRE file, not the end of the individual
// source line the ASI case actually terminates on.
const TERMINATOR_LOOKAHEAD = '(?=[;,}]|\\s*$)';
const ASSIGN_RE = new RegExp(`(?<![\\w$])(const|let|var)\\s+(${DECL_IDENT_RE})\\s*=\\s*(${NUM_RE})\\s*${TERMINATOR_LOOKAHEAD}`, 'gm');

// WHOLE-FILE SCAN (verifier round 2, finding 1 — this file's own attack
// mechanism from round 1, unfixed across two more strata): findSites (the
// comparison detector) was flattened to a single whole-file pass in round 1
// so a comparison wrapped across source lines couldn't escape it by hiding
// on a line boundary the per-line scan never re-joined. findAssignmentSites,
// findObjectPropertySites and findPlainAssignmentSites kept the OLD
// `stripped.split('\n')` + per-line-array scan that round 1 already proved
// escapable — so a declaration/property/assignment split across a `=`-then-
// newline-then-literal boundary (or a key-then-newline-then-colon-then-
// newline-then-literal boundary) was invisible to all three, exactly like
// the pre-round-1 comparison detector was blind to a wrapped `<`. Fixed the
// same way: scan the WHOLE comment-stripped file as one string (newlines
// PRESERVED, unlike the comparison scan's flatten-to-one-line — `\s` already
// matches `\n`, so the `\s*` gaps already in each pattern span line breaks
// with no further change needed), recover 1-indexed line numbers via
// `lineForOffset` over that file's own newline offsets, and add the `m`
// (multiline) flag so `$` in TERMINATOR_LOOKAHEAD still means "end of THIS
// line" rather than "end of the whole file" for the ASI case. Verified
// against both round-2 planted attacks (n1: a `const X =` / literal split
// across two lines; n2: an object literal's `KEY:` / literal split across
// three lines) in `src/poller-core.js` — see product-loop-kit/specs/
// 266-notes.md, "Verifier round 2 — FAIL, and the fixes".
function findAssignmentSites(file, content) {
  const stripped = stripComments(content);
  const newlineOffsets = [];
  for (let idx = 0; idx < stripped.length; idx++) {
    if (stripped.charCodeAt(idx) === 10) newlineOffsets.push(idx);
  }
  const sites = [];
  ASSIGN_RE.lastIndex = 0;
  let m;
  while ((m = ASSIGN_RE.exec(stripped))) {
    const kw = m[1], ident = m[2], lit = m[3];
    if (!/tvl|apy/i.test(ident)) continue;
    if (isZeroLiteral(lit)) continue;
    sites.push({ file, line: lineForOffset(newlineOffsets, m.index), expr: `${kw} ${ident} = ${lit}` });
  }
  return sites;
}

// Object-property form (verifier round 1, finding 2, attack shape 4):
// `IDENT: LITERAL` — a rail copy folded straight into an object literal
// (`const ATTACK_RAILS = { DEFAULT_MIN_TVL: 100000, APY_SANITY_LIMIT: 1000 };`)
// has no `const|let|var IDENT =` shape at all, so ASSIGN_RE can never see it;
// this is a genuinely different grammatical shape, not a terminator variant.
// Same comment-only stripping convention as the assignment detector (strings
// kept — see stripComments's own header for why), same terminator widening,
// same zero-literal exclusion, same non-dotted LHS (an object key is always a
// bare name here, never a dotted path).
//
// SCOPE NOTE (KEPT, verifier round 2, finding 3 — re-measured, not merely
// re-asserted): unlike the COMPARISON detector (which rightly matches ANY
// tvl/apy-named property path, e.g. `pool.tvlUsd`, because a pool's own data
// fields are exactly what a rail predicate compares against), an object-
// PROPERTY *definition* with a tvl/apy-containing key is not rare — it is
// what every pool/KPI fixture literal in this repo's own test suite looks
// like (`{ tvlUsd: 500000, apyBase: 9, apyMean30d: ... }`, by the hundreds).
// Fully relaxing this ONE detector's key predicate (matching ANY tvl/apy-
// containing property name, the same test the comparison/assignment
// detectors already use) was RE-MEASURED in this round: **1040 hits**
// against this checkout's population, **107** after excluding DefiLlama's
// own field names (tvlUsd, apyBase, apyReward, apyMean30d, apyPct1D/7D/30D,
// apyBase7d, etc.) — too large a set to classify honestly on this item's
// final attempt (see product-loop-kit/specs/266-notes.md, "Verifier round 2
// — FAIL, and the fixes", FIX 3). So the restriction stays: a rail-named
// constant folded into an object literal is written in SCREAMING_SNAKE_CASE
// (`^[A-Z][A-Z0-9_]*$`) in every instance this scan has ever found — the
// weakest restriction that still catches the attack's own
// `DEFAULT_MIN_TVL: 100000` shape while not exploding on every pool-fixture
// object literal in the repo. UNLIKE round 1's claim, this is NOT justified
// by "every rail name in the allowlist is SCREAMING_SNAKE_CASE, zero
// exceptions" — that claim was false (the ALLOWLIST below has two lowercase
// ASSIGNMENT-shaped entries, `home.html|var apy = 5.5` and
// `test_planner.js|var apy = 5.3`; see findAssignmentSites, which carries no
// case restriction at all and never claimed one). The honest reason this
// ONE detector — object-property only, not assignment, not (as of this
// round) plain-assignment — keeps a case restriction is the measured
// fixture-explosion cost above, not a naming-convention absolute.
//
// KNOWN COST OF KEEPING THIS RESTRICTION (verifier round 2, finding 3, NOT
// silently excused): `generate-spotlight.js:419-421`'s `PERSONA_BANDS` object
// uses lowercase keys (`stable`, `rwa`, `degen`) each nesting a lowercase
// `minTvl` property — this detector's SCREAMING_SNAKE_CASE key restriction
// cannot see it, by construction, regardless of the restriction being kept
// or relaxed-and-reclassified. `PERSONA_BANDS` is meant to mirror
// `planner.js:560-575`'s `PERSONAS` bands (both files' own comments say so —
// generate-spotlight.js:396-405) so the persona this script picks is one the
// live planner would actually accept; two of the three bands (`rwa`,
// `degen`) have ALREADY DRIFTED by exactly 100x (`generate-spotlight.js`:
// `minTvl: 100000`; `planner.js`: `minTvl: 10000000`) — `stable`'s `minTvl`
// (50000000) still agrees on both sides. This is NOT fixed here (which
// value is correct is a product decision, out of this item's scope) — it is
// permanently PINNED by a dedicated, non-vacuous test below (search "FIX 3
// pin") that derives both files' current values at test time and fails the
// moment either side changes, forcing whoever changes it to update the
// record rather than let it silently drift further or silently resolve
// unnoticed.
const CONST_CASE_RE = '[A-Z][A-Z0-9_]*';
// QUOTED-KEY WIDENING (verifier round 3 — a hole inside a shape already
// claimed as covered, not new scope): `'DEFAULT_MIN_TVL': 100000` and
// `"DEFAULT_MIN_TVL": 100000` (attack x3) are the SAME rail-copy shape as the
// unquoted `DEFAULT_MIN_TVL: 100000` PROP_RE already caught — only the
// quoting differs, a distinction with no significance to what the key
// grammatically IS. The optional leading `(['"]?)` and matching trailing
// `\1` backreference require the closing quote (if any) to be the SAME
// character as the opening one (so `'DEFAULT_MIN_TVL"` — mismatched quotes,
// not valid JS — is correctly NOT treated as one key); an absent quote on
// both sides (the pre-existing unquoted shape) still matches exactly as
// before, since `\1` against an empty capture is itself empty. The
// SCREAMING_SNAKE_CASE restriction on the key text itself is UNCHANGED (see
// this detector's own SCOPE NOTE below) — only the quoting is newly
// tolerated, per this round's own instruction. Re-measured: this widening
// surfaces ZERO new real sites in this checkout (product-loop-kit/specs/
// 266-notes.md) — no file currently hand-types a quoted SCREAMING_SNAKE_CASE
// rail-shaped key; only the synthetic x3 attack below exercises it.
const PROP_RE = new RegExp(`(?<![\\w$.:'"])(['"]?)(${CONST_CASE_RE})\\1\\s*:\\s*(${NUM_RE})\\s*${TERMINATOR_LOOKAHEAD}`, 'gm');

// See "WHOLE-FILE SCAN" comment above findAssignmentSites — same treatment,
// same reasoning (verifier round 2, finding 1).
function findObjectPropertySites(file, content) {
  const stripped = stripComments(content);
  const newlineOffsets = [];
  for (let idx = 0; idx < stripped.length; idx++) {
    if (stripped.charCodeAt(idx) === 10) newlineOffsets.push(idx);
  }
  const sites = [];
  PROP_RE.lastIndex = 0;
  let m;
  while ((m = PROP_RE.exec(stripped))) {
    const ident = m[2], lit = m[3];
    if (!/tvl|apy/i.test(ident)) continue;
    if (isZeroLiteral(lit)) continue;
    sites.push({ file, line: lineForOffset(newlineOffsets, m.index), expr: `${ident}: ${lit}` });
  }
  return sites;
}

// Plain assignment, no declaration keyword (verifier round 1, finding 2,
// attack shape 5): `o.APY_SANITY_LIMIT = 1000;` — a rail copy is exactly as
// real here as in a `const` declaration; ASSIGN_RE requires `const|let|var`
// immediately before the identifier, so it is structurally blind to this
// shape.
//
// KEY PREDICATE RELAXED (verifier round 2, finding 2 — this detector's
// SCREAMING_SNAKE_CASE restriction was unjustified): unlike PROP_RE (kept
// restricted — see its own SCOPE NOTE above, a measured 1040/107-hit fixture
// explosion), this detector's restriction was measured to cost far less.
// Relaxing ONLY this detector's key predicate from `^[A-Z][A-Z0-9_]*$` to
// the SAME `/tvl|apy/i` substring test the comparison/assignment detectors
// already use (i.e. matching the general identifier grammar `DECL_IDENT_RE`
// rather than `CONST_CASE_RE`, then filtering on name content exactly like
// every other detector in this file) surfaces **exactly 2 additional real
// sites** in this checkout, both obvious fixture mutations:
// `test_audit_app.js:172` and `test_audit_number_boundary.js:176`, both
// `target.apyReward = 1;` (forcing a render-gate condition on a mutated
// snapshot fixture, not a rail copy) — allowlisted below with an honest
// reason. Relaxing also means a camelCase/lowercase rail-shaped assignment
// (e.g. `o.defaultMinTvl = 100000;`) is now caught too, closing the gap the
// restriction previously left open for exactly this shape (verifier round
// 2's attack n5 plants such a lowercase assignment in `src/poller-core.js` —
// see product-loop-kit/specs/266-notes.md).
//
// The path PREFIX before the final segment (e.g. `o.`, `window.TRUST_RAILS.`)
// remains unrestricted — only the segment actually being assigned is tested
// against `/tvl|apy/i`. To avoid double-reporting every real
// `const|let|var IDENT = LITERAL` site under a second key (this pattern's
// bare form — no prefix — also matches a declared identifier's own
// assignment), any match with an EMPTY path prefix whose immediately-
// preceding non-space text ends in `const`/`let`/`var` as a whole word is
// skipped here — that site is ASSIGN_RE's to report, not this detector's.
//
// TERMINATOR WIDENED, `)` added (operator round 3, default-parameter shape):
// a rail copy written as a DEFAULT PARAMETER —
// `function isQualifyingPool(pool, minTvl = 100000) {...}`, planted as
// `__n3` in src/poller-core.js — has this exact `IDENT = LITERAL` shape (no
// `const|let|var` keyword: a parameter is never declared with one) but is
// terminated by the closing `)` of the parameter list, not by `;`, `,`, `}`,
// or end-of-line — the four terminators `TERMINATOR_LOOKAHEAD` (shared by
// ASSIGN_RE/PROP_RE) recognises. This is a genuine escape: the LIVE anchor is
// `generate-sitemap.js:88`'s own `function isQualifyingPool(pool, minTvl =
// SITEMAP_MIN_TVL)` — today correct (an identifier, not a literal, so no
// detector should ever flag it), but a hand-typed literal there instead of
// the constant would be a real rail copy at a real rail-enforcement point,
// invisible to this detector before this widening. Fixed with a SEPARATE
// terminator lookahead, scoped to ONLY this detector — not folded into the
// shared `TERMINATOR_LOOKAHEAD` used by ASSIGN_RE/PROP_RE — because a rail
// copy shaped as a default parameter can only ever be keyword-less
// (`const`/`let`/`var` cannot appear inside a parameter list at all, so
// ASSIGN_RE has no matching real-world shape to gain from a `)` terminator)
// and an object-property literal ending a call argument already terminates
// on `}` before the wrapping `)` is ever reached (PROP_RE's existing `}`
// branch already covers `foo({ DEFAULT_MIN_TVL: 100000 })`) — so widening
// either of those two shared-terminator detectors would add read but no
// real catching power, only a wider (and here, unnecessary) blast radius on
// two detectors that two prior verifier rounds already exhaustively
// re-verified. Keeping the widening local to PLAIN_ASSIGN_RE is the
// smallest fix that closes the actual gap.
//
// The multi-parameter case (`f(a, minTvl = 100000, b)`, planted as `__n3b`)
// needs NO further widening — the trailing `,` before the next parameter was
// already one of `TERMINATOR_LOOKAHEAD`'s original branches, so it was (and
// remains) caught without this change; verified by a dedicated regression
// test below, run BOTH before and after this widening.
const PLAIN_ASSIGN_TERMINATOR_LOOKAHEAD = '(?=[;,)}]|\\s*$)';
const PLAIN_ASSIGN_RE = new RegExp(
  `(?<![\\w$.])((?:[A-Za-z_$][A-Za-z0-9_$]*\\??\\.)*)(${DECL_IDENT_RE})\\s*=(?!=)\\s*(${NUM_RE})\\s*${PLAIN_ASSIGN_TERMINATOR_LOOKAHEAD}`,
  'gm'
);
const DECL_KEYWORD_BEFORE_RE = /(?:^|[^\w$])(?:const|let|var)\s*$/m;

// See "WHOLE-FILE SCAN" comment above findAssignmentSites — same treatment,
// same reasoning (verifier round 2, finding 1). `content up to m.index` is
// now the whole (comment-stripped) FILE preceding the match, not just the
// current line, for the double-report guard below — equivalent in practice
// (`DECL_KEYWORD_BEFORE_RE` only inspects the text immediately touching the
// match, which is unaffected by how much unrelated file precedes it).
function findPlainAssignmentSites(file, content) {
  const stripped = stripComments(content);
  const newlineOffsets = [];
  for (let idx = 0; idx < stripped.length; idx++) {
    if (stripped.charCodeAt(idx) === 10) newlineOffsets.push(idx);
  }
  const sites = [];
  PLAIN_ASSIGN_RE.lastIndex = 0;
  let m;
  while ((m = PLAIN_ASSIGN_RE.exec(stripped))) {
    const prefix = m[1], name = m[2], lit = m[3];
    const ident = prefix + name;
    if (!/tvl|apy/i.test(name)) continue;
    if (isZeroLiteral(lit)) continue;
    if (!prefix && DECL_KEYWORD_BEFORE_RE.test(stripped.slice(0, m.index))) continue;
    sites.push({ file, line: lineForOffset(newlineOffsets, m.index), expr: `${ident} = ${lit}` });
  }
  return sites;
}

const assignmentSitesAll = [];
const objectPropertySitesAll = [];
const plainAssignmentSitesAll = [];
for (const rel of population) {
  const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  assignmentSitesAll.push(...findAssignmentSites(rel, content));
  objectPropertySitesAll.push(...findObjectPropertySites(rel, content));
  plainAssignmentSitesAll.push(...findPlainAssignmentSites(rel, content));
}

console.log(`assignment sites: ${assignmentSitesAll.length} rail-named literal assignment(s) found across ${new Set(assignmentSitesAll.map((s) => s.file)).size} file(s)`);
for (const s of assignmentSitesAll) console.log(`  ${s.file}:${s.line}  [${s.expr}]`);
console.log(`object-property sites: ${objectPropertySitesAll.length} rail-named literal object-property assignment(s) found across ${new Set(objectPropertySitesAll.map((s) => s.file)).size} file(s)`);
for (const s of objectPropertySitesAll) console.log(`  ${s.file}:${s.line}  [${s.expr}]`);
console.log(`plain-assignment sites: ${plainAssignmentSitesAll.length} rail-named literal no-keyword assignment(s) found across ${new Set(plainAssignmentSitesAll.map((s) => s.file)).size} file(s)`);
for (const s of plainAssignmentSitesAll) console.log(`  ${s.file}:${s.line}  [${s.expr}]`);

// trust-rails.js / app.js's two canonical declarations each — EXCLUDED BY
// ROLE (see header comment "ASSIGNMENT DETECTOR"), never silently dropped:
// the next test proves the exclusion removes EXACTLY these four sites, not
// a wrong-shaped superset that would swallow something else.
const CANONICAL_ASSIGNMENT_FILES = new Set(['app.js', 'trust-rails.js']);
const canonicalAssignmentSites = assignmentSitesAll.filter((s) => CANONICAL_ASSIGNMENT_FILES.has(s.file));
const assignmentSites = assignmentSitesAll.filter((s) => !CANONICAL_ASSIGNMENT_FILES.has(s.file));

test('canonical rail declarations (app.js, trust-rails.js) are excluded by role, and are EXACTLY their two constants each', () => {
  const appExprs = canonicalAssignmentSites.filter((s) => s.file === 'app.js').map((s) => s.expr).sort();
  const railExprs = canonicalAssignmentSites.filter((s) => s.file === 'trust-rails.js').map((s) => s.expr).sort();
  assert.deepStrictEqual(appExprs, ['const APY_SANITY_LIMIT = 1000', 'const DEFAULT_MIN_TVL = 100000'].sort(),
    `app.js's canonical assignment sites changed shape — expected exactly its two rail declarations, got: ${JSON.stringify(appExprs)}`);
  assert.deepStrictEqual(railExprs, ['var APY_SANITY_LIMIT = 1000', 'var DEFAULT_MIN_TVL = 100000'].sort(),
    `trust-rails.js's canonical assignment sites changed shape — expected exactly its two rail declarations, got: ${JSON.stringify(railExprs)}`);
});

test('assignment sites are non-vacuous (>=15, excluding the two canonical files) — a scan that silently finds nothing must not read as green', () => {
  assert.ok(assignmentSites.length >= 15, `expected >=15 non-canonical assignment sites, found ${assignmentSites.length}`);
});

test('verifier round 1, finding 3b: src/poller-core.js contributes ZERO assignment/object-property/plain-assignment sites (both rails now derived from trust-rails.js)', () => {
  const pollerCore = path.join('src', 'poller-core.js');
  assert.deepStrictEqual(assignmentSitesAll.filter((s) => s.file === pollerCore), [],
    'src/poller-core.js must derive DEFAULT_MIN_TVL/APY_SANITY_LIMIT from trust-rails.js, not hand-declare them');
  assert.deepStrictEqual(objectPropertySitesAll.filter((s) => s.file === pollerCore), []);
  assert.deepStrictEqual(plainAssignmentSitesAll.filter((s) => s.file === pollerCore), []);
});

// Every rail-SHAPED identifier used as fixture text below is built by
// concatenating two fragments (`'FAKE' + '_MIN_TVL'`), never written as one
// contiguous token — the comparison detector blanks STRING TEXT (so a
// fixture like `'if (p.tvlUsd < 1e5)...'` is invisible to itself regardless),
// but the assignment/object-property/plain-assignment detectors below
// deliberately do NOT (see their own header comments for why), so a bare
// rail-shaped identifier written as ordinary fixture text in THIS FILE's own
// raw source would self-pollute the very self-checks these tests exist
// alongside. Splitting the identifier (not just a keyword like "const") is
// required now that PLAIN_ASSIGN_RE/PROP_RE no longer need a keyword at all
// to match.
test('comment-stripping works for the assignment scan: a commented-out rail-shaped assignment is NOT reported, a real one still is', () => {
  const K = 'const';
  const nameA = 'FAKE' + '_MIN_TVL';
  const nameB = 'FAKE' + '_APY_SANITY_LIMIT';
  const nameC = 'REAL_TEST' + '_TVL_FLOOR';
  const snippet = [
    '// ' + K + ' ' + nameA + ' = 100000;',
    '/* ' + K + ' ' + nameB + ' = 1000; */',
    K + ' ' + nameC + ' = 100000;',
    '',
  ].join('\n');
  const sites = findAssignmentSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['const REAL_TEST_TVL_FLOOR = 100000'],
    `comment-stripping regressed: ${JSON.stringify(sites)}`);
});

test("this file's OWN header-comment quote of `const DEFAULT_MIN_TVL = 100000` (coverage limitation (a)) is not reported as a site, by ANY of the four detectors", () => {
  const selfAssign = assignmentSitesAll.filter((s) => s.file === 'test_rail_predicate_derivation.js');
  const selfProp = objectPropertySitesAll.filter((s) => s.file === 'test_rail_predicate_derivation.js');
  const selfPlain = plainAssignmentSitesAll.filter((s) => s.file === 'test_rail_predicate_derivation.js');
  assert.deepStrictEqual(selfAssign, [],
    `this file declares no real rail assignment of its own — any hit here means either the header's own prose quote, or one of this file's own test-fixture/allowlist-reason strings, leaked into the scan: ${JSON.stringify(selfAssign)}`);
  assert.deepStrictEqual(selfProp, [],
    `this file declares no real rail object-property of its own: ${JSON.stringify(selfProp)}`);
  assert.deepStrictEqual(selfPlain, [],
    `this file performs no real rail plain-assignment of its own: ${JSON.stringify(selfPlain)}`);
});

// ---------------------------------------------------------------------------
// Verifier round 1, finding 2 — the detector was keyed on the two known
// instances' PUNCTUATION, not the mechanism. Five attack shapes, each proven
// here against a synthetic fixture (and separately re-run live against
// compute-kpis.js — see product-loop-kit/specs/266-notes.md).
// ---------------------------------------------------------------------------

test('comparison detector catches a condition WRAPPED ACROSS TWO LINES (attack 2)', () => {
  const snippet = [
    'function f(p) {',
    '  if (p.tvlUsd <',
    '      100000) return false;',
    '  return true;',
    '}',
    '',
  ].join('\n');
  const sites = findSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['p.tvlUsd < 100000'],
    `a comparison wrapped across two source lines must still be found: ${JSON.stringify(sites)}`);
});

test('comparison detector catches an EXPONENT-form numeric literal, house style elsewhere in this repo (attack 1)', () => {
  const snippet = 'if (p.tvlUsd < 1e5) return false;\n';
  const sites = findSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['p.tvlUsd < 1e5'],
    `1e5-style exponent literals are this repo's own house style (trust-rails.js's 1e9/1e6/1e3) and must be caught: ${JSON.stringify(sites)}`);
});

test('assignment detector catches a rail-shaped declaration with NO TRAILING SEMICOLON — ASI, a trailing comma, or a closing brace (attack 3)', () => {
  const nameA = 'ATTACK_DEFAULT' + '_MIN_TVL';
  const nameB = 'ATTACK_APY_SANITY' + '_LIMIT';
  const nameC = 'ATTACK' + '_TVL_FLOOR';
  const noSemi = 'const ' + nameA + ' = 100000\n';
  const trailingComma = 'const ' + nameB + ' = 1000, other = 2;\n';
  const closingBrace = '(function () {\n  const ' + nameC + ' = 100000\n})();\n';
  assert.deepStrictEqual(findAssignmentSites('synthetic.js', noSemi).map((s) => s.expr), ['const ATTACK_DEFAULT_MIN_TVL = 100000'],
    'ASI (newline-terminated, no semicolon) must be caught');
  assert.deepStrictEqual(findAssignmentSites('synthetic.js', trailingComma).map((s) => s.expr), ['const ATTACK_APY_SANITY_LIMIT = 1000'],
    'a trailing comma ending the FIRST declarator of a multi-declarator statement must terminate the match, not swallow the rest of the line');
  assert.deepStrictEqual(findAssignmentSites('synthetic.js', closingBrace).map((s) => s.expr), ['const ATTACK_TVL_FLOOR = 100000'],
    'a closing brace right after the literal must terminate the match');
});

test('object-property detector catches `IDENT: LITERAL` inside an object literal (attack 4)', () => {
  const nameA = 'DEFAULT' + '_MIN_TVL';
  const nameB = 'APY_SANITY' + '_LIMIT';
  const snippet = [
    'const ATTACK_RAILS = {',
    '  ' + nameA + ': 100000,',
    '  ' + nameB + ': 1000',
    '};',
    '',
  ].join('\n');
  const sites = findObjectPropertySites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr).sort(), ['APY_SANITY_LIMIT: 1000', 'DEFAULT_MIN_TVL: 100000'].sort(),
    `object-property rail copies must be found regardless of trailing comma or closing brace: ${JSON.stringify(sites)}`);
});

test('plain-assignment detector catches `o.IDENT = LITERAL` with NO declaration keyword (attack 5), and does not double-report a real declaration under a second key', () => {
  const nameA = 'APY_SANITY' + '_LIMIT';
  const plain = 'o.' + nameA + ' = 1000;\n';
  const sites = findPlainAssignmentSites('synthetic.js', plain);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['o.APY_SANITY_LIMIT = 1000'],
    `an assignment with no const/let/var must still be found: ${JSON.stringify(sites)}`);
  const nameB = 'DEFAULT' + '_MIN_TVL';
  const decl = 'const ' + nameB + ' = 100000;\n';
  assert.deepStrictEqual(findPlainAssignmentSites('synthetic.js', decl), [],
    'a real `const|let|var IDENT = LITERAL` declaration is ASSIGN_RE\'s site, not this detector\'s — must not be double-reported under a second key');
});

test('the widened NUM_RE accepts hex / underscore-separated / leading-dot forms without breaking on the boundary lookahead', () => {
  const nameA = 'ATTACK_HEX' + '_MIN_TVL';
  const nameB = 'ATTACK_SEP' + '_MIN_TVL';
  const snippet = [
    'const ' + nameA + ' = 0x186A0;', // 100000 in hex
    'const ' + nameB + ' = 100_000;',
    'if (p.apyMean30d > .5) return true;',
    '',
  ].join('\n');
  const assignSites = findAssignmentSites('synthetic.js', snippet);
  assert.deepStrictEqual(assignSites.map((s) => s.expr).sort(),
    ['const ATTACK_HEX_MIN_TVL = 0x186A0', 'const ATTACK_SEP_MIN_TVL = 100_000'].sort(),
    `hex and underscore-separated literals must be recognised: ${JSON.stringify(assignSites)}`);
  const cmpSites = findSites('synthetic.js', snippet);
  assert.deepStrictEqual(cmpSites.map((s) => s.expr), ['p.apyMean30d > .5'],
    `a leading-dot decimal literal must be recognised: ${JSON.stringify(cmpSites)}`);
});

// ---------------------------------------------------------------------------
// Verifier round 2, finding 1 — the assignment/object-property/plain-
// assignment detectors were still LINE-based (round 1's own attack
// mechanism from finding 2, unfixed in three strata). Two attacks, each
// proven here against a synthetic fixture (and separately re-run LIVE in
// src/poller-core.js, planted and reverted, red output and md5-proven
// byte-identical restore quoted in product-loop-kit/specs/266-notes.md,
// "Verifier round 2 — FAIL, and the fixes").
// ---------------------------------------------------------------------------

test('assignment detector catches a declaration whose `=` and LITERAL are split across two lines (verifier round 2, attack n1)', () => {
  const nameA = 'ATTACK_WRAPPED' + '_MIN_TVL';
  const snippet = [
    'const ' + nameA + ' =',
    '  100000;',
    '',
  ].join('\n');
  const sites = findAssignmentSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['const ATTACK_WRAPPED_MIN_TVL = 100000'],
    `a declaration wrapped across two source lines (= on one line, the literal on the next) must still be found: ${JSON.stringify(sites)}`);
});

test('object-property detector catches a `KEY:`/LITERAL pair split across three lines inside an object literal (verifier round 2, attack n2)', () => {
  const nameA = 'DEFAULT' + '_MIN_TVL';
  const snippet = [
    'const __R2 = {',
    '  ' + nameA + ':',
    '    100000',
    '};',
    '',
  ].join('\n');
  const sites = findObjectPropertySites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['DEFAULT_MIN_TVL: 100000'],
    `an object-property rail copy wrapped across three source lines (key, colon+newline, then the literal on its own line) must still be found: ${JSON.stringify(sites)}`);
});

test('plain-assignment detector now catches a LOWERCASE/camelCase rail-shaped assignment (verifier round 2, FIX 2, attack n5) after the SCREAMING_SNAKE_CASE key restriction was relaxed', () => {
  const nameA = 'default' + 'MinTvl'; // camelCase, would have been invisible under the old ^[A-Z][A-Z0-9_]*$ restriction
  const snippet = '__o2.' + nameA + ' = 100000;\n';
  const sites = findPlainAssignmentSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['__o2.defaultMinTvl = 100000'],
    `a camelCase rail-shaped plain assignment must be caught now that the key predicate is the same case-insensitive /tvl|apy/ substring test every other detector uses: ${JSON.stringify(sites)}`);
});

// ---------------------------------------------------------------------------
// Operator round 3 — a rail copy written as a DEFAULT PARAMETER escaped every
// prior widening (`;`/`,`/`}`/end-of-line all fail to terminate it — only a
// closing `)` does). Live anchor: generate-sitemap.js:88's own
// `function isQualifyingPool(pool, minTvl = SITEMAP_MIN_TVL)` — correct today
// (an identifier, not a literal), but a hand-typed literal there instead of
// the constant would have been invisible before this widening. Two shapes,
// both proven on synthetic fixtures here, then re-run LIVE in
// src/poller-core.js (planted and reverted, red output and md5-proven
// byte-identical restore quoted in product-loop-kit/specs/266-notes.md,
// "Operator round-3 check: default-parameter shape").
// ---------------------------------------------------------------------------

test('plain-assignment detector catches a rail-shaped DEFAULT PARAMETER, the last one in the list (operator round 3, attack __n3)', () => {
  const nameA = 'min' + 'Tvl';
  const snippet = 'function __n3(pool, ' + nameA + ' = 100000) { return (pool.tvlUsd||0) >= ' + nameA + '; }\n';
  const sites = findPlainAssignmentSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['minTvl = 100000'],
    `a default-parameter rail copy terminated by the parameter list's closing ) must now be found: ${JSON.stringify(sites)}`);
});

test('plain-assignment detector catches a rail-shaped DEFAULT PARAMETER in the middle of a multi-parameter list, via the PRE-EXISTING "," terminator (operator round 3, attack __n3b — regression, not a new catch)', () => {
  const nameA = 'min' + 'Tvl';
  const snippet = 'function __n3b(a, ' + nameA + ' = 100000, b) {}\n';
  const sites = findPlainAssignmentSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['minTvl = 100000'],
    `a default parameter followed by another parameter (terminated by a comma) must be found — this was already true before the ")" terminator widening, proving the widening did not need to touch the "," branch: ${JSON.stringify(sites)}`);
});

// ---------------------------------------------------------------------------
// VERIFIER ROUND 3 — the parenthesised-operand gap. Four permanent synthetic
// attacks (x1, x2, x6, x3 — matching the verifier's own naming), each proven
// here, then re-proven LIVE in src/poller-core.js (planted and reverted, red
// output and md5-proven byte-identical restore quoted in product-loop-kit/
// specs/266-notes.md, "Verifier round 3 — the parenthesised-operand gap").
// ---------------------------------------------------------------------------

test('comparison detector catches the house idiom `(ident || 0) >= LITERAL` (verifier round 3, attack x1)', () => {
  const nameA = 'min' + 'Tvl';
  const snippet = 'function __x1(pool) { return (pool.tvlUsd || 0) >= 100000; }\n';
  const sites = findSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['(pool.tvlUsd || 0) >= 100000'],
    `the house "(x || 0) >= LITERAL" idiom — used at the three real rail-enforcement points this backlog item rewired (generate-sitemap.js:88, generate-spotlight.js:79, generate-pools-snapshot.js:81) — must be caught when a literal replaces the correct identifier: ${JSON.stringify(sites)}`);
});

test('comparison detector catches the house idiom `(Number(ident) || 0) >= LITERAL` (verifier round 3, attack x2)', () => {
  const snippet = 'function __x2(pool) { return (Number(pool.tvlUsd) || 0) >= 100000; }\n';
  const sites = findSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['(Number(pool.tvlUsd) || 0) >= 100000'],
    `the "(Number(x) || 0) >= LITERAL" idiom (generate-pools-snapshot.js:81's own real shape) must be caught, including its ONE level of nested parens inside the outer group: ${JSON.stringify(sites)}`);
});

test('comparison detector catches a PARENTHESISED LITERAL on the value side, both operand orders (verifier round 3, attack x6)', () => {
  const identFirst = 'function __x6(p) { return p.tvlUsd < (100000); }\n';
  const litFirst = 'function __x6b(p) { return (100000) < p.tvlUsd; }\n';
  assert.deepStrictEqual(findSites('synthetic.js', identFirst).map((s) => s.expr), ['p.tvlUsd < 100000'],
    `a parenthesised literal on the value side (ident-first order) must be caught and its literal unwrapped for the allowlist key: ${JSON.stringify(findSites('synthetic.js', identFirst))}`);
  assert.deepStrictEqual(findSites('synthetic.js', litFirst).map((s) => s.expr), ['p.tvlUsd > 100000'],
    `the same shape in literal-first order must also be caught (and canonicalised/flipped exactly as the bare-literal-first case already is): ${JSON.stringify(findSites('synthetic.js', litFirst))}`);
});

test('comparison detector normalises whitespace inside a captured paren-group so differently-indented identical expressions land on ONE allowlist key', () => {
  const compact = 'return (pool.apyBase || 0) >= 100000;\n';
  const spread = 'return (pool.apyBase ||\n      0) >= 100000;\n';
  assert.deepStrictEqual(findSites('synthetic.js', compact).map((s) => s.expr), ['(pool.apyBase || 0) >= 100000']);
  assert.deepStrictEqual(findSites('synthetic.js', spread).map((s) => s.expr), ['(pool.apyBase || 0) >= 100000'],
    'a paren-group expression wrapped/indented differently must normalise to the SAME expr key as the compact form — this is what lets PoolDetail.js\'s 5 identically-shaped, differently-indented ratio-guard occurrences fold into ONE allowlist entry rather than 5');
});

test('object-property detector catches a QUOTED key, both quote characters, and still rejects mismatched quotes (verifier round 3, attack x3)', () => {
  const nameA = 'DEFAULT' + '_MIN_TVL';
  const singleQuoted = 'const __x3 = { \'' + nameA + '\': 100000 };\n';
  const doubleQuoted = 'const __x3b = { "' + nameA + '": 100000 };\n';
  const mismatched = 'const __x3c = { \'' + nameA + '": 100000 };\n'; // not valid JS; must not match
  assert.deepStrictEqual(findObjectPropertySites('synthetic.js', singleQuoted).map((s) => s.expr), ['DEFAULT_MIN_TVL: 100000'],
    `a single-quoted SCREAMING_SNAKE_CASE key must now be caught (case restriction unchanged — only quoting is newly tolerated): ${JSON.stringify(findObjectPropertySites('synthetic.js', singleQuoted))}`);
  assert.deepStrictEqual(findObjectPropertySites('synthetic.js', doubleQuoted).map((s) => s.expr), ['DEFAULT_MIN_TVL: 100000'],
    `a double-quoted key must equally be caught: ${JSON.stringify(findObjectPropertySites('synthetic.js', doubleQuoted))}`);
  assert.deepStrictEqual(findObjectPropertySites('synthetic.js', mismatched), [],
    `mismatched opening/closing quote characters are not valid JS and must NOT be treated as one quoted key: ${JSON.stringify(findObjectPropertySites('synthetic.js', mismatched))}`);
});

test('the unquoted object-property shape (attack 4, verifier round 1) still matches unchanged after the quoted-key widening', () => {
  const nameA = 'DEFAULT' + '_MIN_TVL';
  const snippet = 'const __regress = { ' + nameA + ': 100000 };\n';
  assert.deepStrictEqual(findObjectPropertySites('synthetic.js', snippet).map((s) => s.expr), ['DEFAULT_MIN_TVL: 100000'],
    'the pre-existing unquoted-key shape must not regress now that PROP_RE also accepts an optional matching quote pair');
});

// ---------------------------------------------------------------------------
// VERIFIER ROUND 3 — the regex-literal fix. stripCommentsAndStrings/
// stripComments previously had no notion of a JS regex literal; a regex
// containing an ODD number of quote characters (extremely common in this
// codebase's own `"key":\s*`-shaped generator regexes) desyncs quote
// tracking for the REST OF THE FILE, blanking every subsequent line out of
// existence for findSites. Fixed by regexAllowedBefore/scanRegexLiteral (see
// their own header comments above stripCommentsAndStrings). Proven both on a
// synthetic fixture here and LIVE against the 7 real files this bug affected
// in this checkout (compute-kpis.js, generate-history-backfill.js,
// generate-pools-snapshot.js, generate-protocol-urls.js, test_seo_app_link_
// attribution.js, test_seo_cta_targets.js, test_api_worker.js) — see
// product-loop-kit/specs/266-notes.md for the full before/after re-scan.
// ---------------------------------------------------------------------------

test('a regex literal containing an ODD number of quote characters no longer desyncs quote-tracking for the rest of the file (verifier round 3 — the regex-literal fix)', () => {
  const nameA = 'REAL_AFTER' + '_REGEX_TVL_FLOOR';
  const snippet = [
    'function normalize(s) {',
    '  return s.replace(/("generatedAt":\\s*)"[^"]*"/g, \'$1"<TS>"\');', // 5 raw quote chars inside the regex — odd count
    '}',
    'const ' + nameA + ' = 100000;', // must still be visible AFTER the regex line
    '',
  ].join('\n');
  const assignSites = findAssignmentSites('synthetic.js', snippet);
  assert.deepStrictEqual(assignSites.map((s) => s.expr), ['const REAL_AFTER_REGEX_TVL_FLOOR = 100000'],
    `a declaration AFTER a quote-containing regex literal must still be scanned — before this fix, the whole rest of the file after such a regex would be blanked (treated as still "inside a string"): ${JSON.stringify(assignSites)}`);
});

test('a regex literal does not falsely trigger on ordinary DIVISION (no false positives introduced by the regex-vs-division heuristic)', () => {
  const nameA = 'apy' + 'Ratio';
  const snippet = 'const ' + nameA + ' = pool.apyBase / 2;\nif (' + nameA + ' > 100000) { doThing(); }\n';
  const sites = findSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites.map((s) => s.expr), ['apyRatio > 100000'],
    `an ordinary division (identifier / number, preceded by a value not an operator) must be treated as division, not misread as the start of a regex literal that swallows the rest of the line: ${JSON.stringify(sites)}`);
});

test('a real comment following a quote-containing regex literal is still stripped, not leaked into the assignment scan', () => {
  const nameA = 'FAKE_AFTER' + '_REGEX_TVL';
  const snippet = [
    'const re = /("k":\\s*)"[^"]*"/g;',
    '// const ' + nameA + ' = 100000; (this is only a comment)',
    '',
  ].join('\n');
  const sites = findAssignmentSites('synthetic.js', snippet);
  assert.deepStrictEqual(sites, [],
    `a genuine // comment appearing after a quote-containing regex literal must still be recognised and stripped by stripComments — if the regex fix regressed comment detection, this commented-out rail-shaped declaration would leak through as a fake site: ${JSON.stringify(sites)}`);
});

// ---------------------------------------------------------------------------
// FIX 3 pin (verifier round 2, finding 3) — a RECORDED KNOWN DIVERGENCE, not
// a rail-copy detector. The object-property detector above KEEPS its
// SCREAMING_SNAKE_CASE key restriction (re-measured this round: fully
// relaxing it finds 1040 hits, 107 after excluding DefiLlama's own field
// names — too large to classify honestly on this item's final attempt). That
// restriction is, by construction, blind to a rail-shaped mirror written
// with LOWERCASE object keys — which is exactly the shape of
// `generate-spotlight.js`'s `PERSONA_BANDS` (`{ stable: { minTvl: ... },
// rwa: { minTvl: ... }, degen: { minTvl: ... } }`). That object's own comment
// (generate-spotlight.js:396-405) says it mirrors `planner.js`'s `PERSONAS`
// bands so the persona this script assigns a pool is one the live planner
// would actually accept for that same pool. It does NOT, for two of the
// three bands: `rwa` and `degen` diverge by EXACTLY 100x
// (generate-spotlight.js: minTvl 100000; planner.js: minTvl 10000000);
// `stable` still agrees (50000000 both sides).
//
// This is NOT fixed here — which number is correct (the generator's,
// meaning the planner's own $10M rwa/degen floor is what should have been
// mirrored, OR the planner's, meaning generate-spotlight.js's $100K is
// right and planner.js should be lowered) is a product decision, out of
// this item's scope, and no PERSONA_BANDS/PERSONAS value is touched by this
// fix. Instead: a PERMANENT, NON-VACUOUS test pins the divergence exactly as
// measured, deriving both files' CURRENT values from source AT TEST TIME (not
// copy-pasted numbers with no connection to the live files) — so this test
// stays GREEN today (it is not asserting the mirror SHOULD match, only that
// the divergence is EXACTLY the one recorded), but fails LOUDLY, forcing an
// update to this test and to product-loop-kit/specs/266-notes.md's "FIX 3"
// entry, the moment EITHER side's PERSONA_BANDS/PERSONAS minTvl values
// change — whether the divergence closes, widens, shifts to a different
// band, or changes ratio. Recorded, not endorsed.
// ---------------------------------------------------------------------------

/** Extracts `{ band: { ..., minTvl: NUMBER, ... }, ... }`-shaped minTvl values
 * for the given band names, starting from the first `{` after `declRe`'s
 * match. Uses a small brace-depth walk (not a fixed-length slice) to find the
 * enclosing object's own closing `}`, so it is exact regardless of exactly
 * how many bands/properties either file's object literal carries — verified
 * against both files' actual current shapes by the non-vacuity assertion
 * below (both extractions must find all three named bands or the test itself
 * fails loudly, not silently return `{}`). */
function extractBandMinTvl(content, declRe, bandNames) {
  const startMatch = declRe.exec(content);
  assert.ok(startMatch, `PERSONA_BANDS/PERSONAS declaration not found by ${declRe} — this pin's extraction regex needs updating before it can mean anything`);
  const braceStart = content.indexOf('{', startMatch.index);
  assert.ok(braceStart !== -1, 'no opening brace found after the PERSONA_BANDS/PERSONAS declaration');
  let depth = 0, i = braceStart;
  for (; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const block = content.slice(braceStart, i);
  const out = {};
  for (const band of bandNames) {
    const m = new RegExp(`\\b${band}\\s*:\\s*\\{[^}]*?minTvl\\s*:\\s*(${NUM_RE})`).exec(block);
    assert.ok(m, `band "${band}" minTvl not found inside the extracted PERSONA_BANDS/PERSONAS block — this pin's extraction needs updating: ${JSON.stringify(block)}`);
    out[band] = Number(m[1].replace(/_/g, ''));
  }
  return out;
}

test('FIX 3 pin (verifier round 2, finding 3): generate-spotlight.js PERSONA_BANDS.minTvl vs planner.js PERSONAS.minTvl — a RECORDED KNOWN DIVERGENCE (rwa/degen diverge 100x, stable agrees), NOT an endorsement of either value; fails the moment either side changes, forcing this pin to be updated', () => {
  const spotlightContent = fs.readFileSync(path.join(ROOT, 'generate-spotlight.js'), 'utf8');
  const plannerContent = fs.readFileSync(path.join(ROOT, 'planner.js'), 'utf8');
  const spotlightBands = extractBandMinTvl(spotlightContent, /const\s+PERSONA_BANDS\s*=/, ['stable', 'rwa', 'degen']);
  const plannerBands = extractBandMinTvl(plannerContent, /var\s+PERSONAS\s*=/, ['stable', 'rwa', 'degen']);

  // Recorded snapshot (product-loop-kit/specs/266-notes.md, "Verifier round
  // 2 — FAIL, and the fixes", FIX 3): generate-spotlight.js:419-421 vs
  // planner.js:567/572, as of this fix. Both sides are EXTRACTED FROM SOURCE
  // above, so if either file's actual values move, they diverge from this
  // hardcoded snapshot and the assertion below fails — that is the pin
  // working as intended, not a false alarm.
  assert.deepStrictEqual(spotlightBands, { stable: 50000000, rwa: 100000, degen: 100000 },
    `generate-spotlight.js's PERSONA_BANDS minTvl values moved from the recorded pin — re-measure and update this test AND product-loop-kit/specs/266-notes.md's "FIX 3" entry: ${JSON.stringify(spotlightBands)}`);
  assert.deepStrictEqual(plannerBands, { stable: 50000000, rwa: 10000000, degen: 10000000 },
    `planner.js's PERSONAS minTvl values moved from the recorded pin — re-measure and update this test AND product-loop-kit/specs/266-notes.md's "FIX 3" entry: ${JSON.stringify(plannerBands)}`);

  // The pin's actual claim: 'stable' AGREES; 'rwa'/'degen' diverge by EXACTLY
  // 100x. If this ever stops being true (either direction — agreement
  // breaking, or divergence closing/changing ratio), this must go red so a
  // human updates the record rather than the pin silently going stale.
  assert.strictEqual(spotlightBands.stable, plannerBands.stable,
    "the 'stable' band is recorded as AGREEING between the two files — if this now differs, the divergence shape changed and this pin must be updated, not silently left as-is");
  for (const band of ['rwa', 'degen']) {
    assert.notStrictEqual(spotlightBands[band], plannerBands[band],
      `the '${band}' band is recorded as a KNOWN 100x DIVERGENCE — if these are now EQUAL, someone fixed the mirror; update/remove this pin rather than leaving it green by accident`);
    assert.strictEqual(plannerBands[band] / spotlightBands[band], 100,
      `the '${band}' band's divergence ratio moved away from the recorded 100x — re-measure and update this pin (product-loop-kit/specs/266-notes.md, "FIX 3")`);
  }
});

// ---------------------------------------------------------------------------
// ALLOWLIST — every scanned site classified (BOTH comparison-shaped, Leg C
// original, AND assignment-shaped, operator-requested widening). `file|expr`
// key, never a line number. See header comment ("ALLOWLIST") for the
// discipline; each reason names the actual threshold. Derived by running the
// scan above and classifying every real hit (see product-loop-kit/specs/
// 266-notes.md).
// ---------------------------------------------------------------------------

const ALLOWLIST = [
  // --- PoolDetail.js: risk-score display bands (confidence tiers a pool
  // that's ALREADY passed the rails gets sorted into for the UI's risk
  // label), not the admission rail itself. ---
  { file: 'PoolDetail.js', expr: 'pool.tvlUsd < 1000000', reason: 'TVL confidence-band tier ("Low liquidity" risk factor) for a pool already admitted (>=DEFAULT_MIN_TVL) — display risk scoring, not the floor.' },
  { file: 'PoolDetail.js', expr: 'pool.tvlUsd < 10000000', reason: 'TVL confidence-band tier ("Medium liquidity" risk factor), same band as above, next threshold.' },
  { file: 'PoolDetail.js', expr: 'totalApy > 50', reason: 'APY risk-factor band ("Very high yield" display tier), not APY_SANITY_LIMIT (a hard admission ceiling checked separately, two lines above).' },
  { file: 'PoolDetail.js', expr: 'totalApy > 20', reason: 'APY risk-factor band ("High yield" display tier), same band, next threshold.' },
  { file: 'PoolDetail.js', expr: 'totalApy > 10', reason: 'APY risk-factor band ("Elevated yield" display tier), same band, next threshold.' },

  // --- generate-pool-pages.js: an explicit, comment-documented mirror of
  // PoolDetail.js's own risk bands (same reasons as above; generates the
  // static twin pages). ---
  { file: 'generate-pool-pages.js', expr: 'pool.tvlUsd < 1000000', reason: 'Explicit mirror of PoolDetail.js\'s TVL confidence-band tier (file\'s own comment cites the exact line range) — display risk scoring, not DEFAULT_MIN_TVL.' },
  { file: 'generate-pool-pages.js', expr: 'pool.tvlUsd < 10000000', reason: 'Mirror of PoolDetail.js\'s TVL confidence-band tier, next threshold.' },
  { file: 'generate-pool-pages.js', expr: 'totalApy > 50', reason: 'Mirror of PoolDetail.js\'s APY risk-factor band, not APY_SANITY_LIMIT.' },
  { file: 'generate-pool-pages.js', expr: 'totalApy > 20', reason: 'Mirror of PoolDetail.js\'s APY risk-factor band, next threshold.' },
  { file: 'generate-pool-pages.js', expr: 'totalApy > 10', reason: 'Mirror of PoolDetail.js\'s APY risk-factor band, next threshold.' },

  // --- analytics.js: Mixpanel segmentation buckets + an independent risk-
  // score heuristic — categorisation for reporting, not rail enforcement. ---
  { file: 'analytics.js', expr: 'tvl < 1000000', reason: 'categorizeTVL() Mixpanel segmentation bucket ("low"), a reporting label, not DEFAULT_MIN_TVL.' },
  { file: 'analytics.js', expr: 'tvl < 10000000', reason: 'categorizeTVL() segmentation bucket ("medium"), next threshold.' },
  { file: 'analytics.js', expr: 'tvl < 100000000', reason: 'categorizeTVL() segmentation bucket ("high"), next threshold.' },
  { file: 'analytics.js', expr: 'apy < 2', reason: 'categorizeAPY() Mixpanel segmentation bucket ("low"), a reporting label, not APY_SANITY_LIMIT.' },
  { file: 'analytics.js', expr: 'apy < 5', reason: 'categorizeAPY() segmentation bucket ("medium"), next threshold.' },
  { file: 'analytics.js', expr: 'apy < 10', reason: 'categorizeAPY() segmentation bucket ("high"), next threshold.' },
  { file: 'analytics.js', expr: 'pool.tvlUsd < 1000000', reason: 'calculateRiskScore() TVL risk-point bucket, mirrors PoolDetail.js\'s own display band, not DEFAULT_MIN_TVL.' },
  { file: 'analytics.js', expr: 'pool.tvlUsd < 10000000', reason: 'calculateRiskScore() TVL risk-point bucket, next threshold.' },
  { file: 'analytics.js', expr: 'totalApy > 15', reason: 'calculateRiskScore() APY risk-point bucket, not APY_SANITY_LIMIT.' },
  { file: 'analytics.js', expr: 'totalApy > 8', reason: 'calculateRiskScore() APY risk-point bucket, next threshold.' },

  // --- app.js: the user's OWN selected filter value crossing $1M — an
  // unrelated UI/analytics threshold, never the platform's admission floor. ---
  { file: 'app.js', expr: 'minTvl >= 1000000', reason: 'The user-selected minTvl filter value crossing $1M — drives the "Feeling Degen" analytics heuristic (~line 2260) and the TVL-filter chip\'s M+/K+ label suffix (~line 3283); neither reads DEFAULT_MIN_TVL.' },

  // --- generate-llms.js: a display-FORMATTING threshold (choose "$XB" vs
  // "$XM" suffix), newly visible only because the widened NUM_RE now
  // recognises exponent-form literals (1e9) — not a rail at all, just this
  // repo's usual `n >= 1e9`-style magnitude-suffix cutoff (same idiom as
  // trust-rails.js's own formatTvlFloor). Appears 4 times (lines 638, 648,
  // 795, 804); one key covers all four identical occurrences. ---
  { file: 'generate-llms.js', expr: 'tvl > 1e9', reason: 'Billions-vs-millions DISPLAY FORMAT cutoff (choose "$XB" vs "$XM" suffix) for the AI-discovery copy\'s TVL figures — a presentation threshold, not DEFAULT_MIN_TVL/APY_SANITY_LIMIT. Newly visible only because the widened NUM_RE (verifier round 1) now recognises exponent-form literals.' },

  // --- generate-sitemap.js: two SEO-hygiene gates named explicitly in spec
  // 266's own Evidence table as the false-positive class this guard exists
  // to NOT flag. ---
  { file: 'generate-sitemap.js', expr: 'pool.tvlUsd < 1000', reason: 'The sitemap\'s own $1,000 inclusion quality gate (spec 266 Evidence §4) — a far lower SEO-hygiene bar than DEFAULT_MIN_TVL, not a copy of it.' },
  { file: 'generate-sitemap.js', expr: 'totalApy <= 0.01', reason: 'The sitemap\'s own 0.01% "negligible yield" SEO-hygiene gate (spec 266 Evidence §4) — unrelated to APY_SANITY_LIMIT, which is a ceiling, not this floor.' },

  // --- test files: fixture/tolerance/statistics values and one array-
  // length anti-vacuity check whose identifier merely CONTAINS "tvl"/"apy". ---
  { file: 'test_agent_surface_rail_claims.js', expr: 'tvlClaims.length >= 2', reason: 'Anti-vacuity assertion on an ARRAY LENGTH (count of claims that guard\'s own scan found) — "tvlClaims" is a variable name, not a pool TVL value.' },
  { file: 'test_agent_surface_rail_claims.js', expr: 'apyClaims.length >= 2', reason: 'Anti-vacuity assertion on an ARRAY LENGTH (count of APY claims found), same reasoning as tvlClaims above.' },
  { file: 'test_compute_kpis.js', expr: 'kpis.apyStdev < 0.05', reason: 'A computed APY standard-deviation floor (compute-kpis.js\'s SHARPE_MIN_STDEV) — a statistics gate for Sharpe-ratio computation, unrelated to APY_SANITY_LIMIT.' },
  { file: 'test_dead_pool.js', expr: 'p.tvlUsd >= 10_000_000', reason: 'Test-only fixture-partition threshold picking which FIXTURE_POOLS.data entries the test expects as dead-pool alternatives; the real feature runs through the actual trust rails (app.js\'s own "same trust rails" comment) — an arbitrary "comfortably above any floor" test-data choice, not itself enforced anywhere.' },
  { file: 'test_planner.js', expr: 'p.tvlUsd >= 50000000', reason: "The \"sleep\" persona's OWN $50M curation floor (planner.js's PERSONAS.stable band), not DEFAULT_MIN_TVL — the same persona-floor exclusion test_rail_floor_derivation.js's header documents for personaStableDesc." },
  { file: 'test_pool_twin_parity.js', expr: 'apyDiff > 0.02', reason: 'A floating-point PARITY TOLERANCE between two independent renderings of the same pool\'s APY (rounding-drift epsilon), not a rail threshold.' },
  { file: 'test_pool_twins.js', expr: 'SUB_10M_FIXTURE.tvlUsd < 100000', reason: "Sanity check that a deliberately-constructed test fixture sits under the floor (documents WHY it's constructed rather than sampled); numerically coincides with DEFAULT_MIN_TVL because that IS the boundary under test, but this line only checks the fixture's own construction, never admits/rejects a live pool." },
  { file: 'test_pools_snapshot.js', expr: 'p.tvlUsd >= 100_000', reason: "Test assertion verifying generate-pools-snapshot.js's OWN output respects DEFAULT_MIN_TVL. generate-pools-snapshot.js used to hand-type this as a local const (recorded as residue in 266-notes.md at the time); the operator-requested widening below fixed that — it now derives from trust-rails.js — so this line is a fixture-construction sanity check against the real derived rail, not a second rail implementation." },

  // ===========================================================================
  // ASSIGNMENT-SHAPED entries (operator-requested widening — see
  // product-loop-kit/specs/266-notes.md, "Operator-requested widening
  // (assignment stratum)" for the full classified table and every deviation).
  // ===========================================================================

  // --- Genuine unlinked mirrors of a platform rail, found by this widening's
  // broader scan (NOT named in the operator's own evidence table) — real
  // residue, out of this bounded widening's fix scope (which fixes exactly
  // the three files/five constants + the token-pages APY_SANITY_LIMIT the
  // task explicitly named), flagged honestly for a future item rather than
  // silently left invisible. ---
  { file: 'PoolDetail.js', expr: 'const APY_SANITY_LIMIT_LOCAL = 1000', reason: 'A genuine unlinked mirror of APY_SANITY_LIMIT (its own comment says "mirror of app.js constant"), used for the apyMean30d "not presentable" magnitude gate (144) and the risk-assessment "Anomalous yield" override — defensive re-checks on an ALREADY-admitted pool, not a first-line admission gate. Core UI component, not one of this widening\'s three named fix targets (home.html/tools already fixed by Legs A/B; PoolDetail.js was never in that scope) — residue, not fixed here.' },
  { file: 'compute-kpis.js', expr: 'const RISK_FREE_APY = 4.0', reason: 'Disclosed risk-free benchmark (~US T-bill, item 117) used only for Sharpe-ratio computation — an unrelated financial constant, not a mirror of either rail.' },
  { file: 'compute-kpis.js', expr: 'const APY_SANITY_LIMIT = 1000', reason: 'A genuine unlinked mirror (its own comment says "TRUST RAIL mirror, source of truth: app.js:800"), used to bound its OWN derived Sharpe/momentum stats over already-admitted history points (the script never reads/relaxes the upstream rail, per its header). Not one of this widening\'s three named fix targets — residue, not fixed here.' },
  { file: 'generate-pool-pages.js', expr: 'const POOL_ARTIFACT_MIN_TVL = 1000', reason: 'The `<id>.json` paint artifact\'s OWN honest floor (item 216) — restated deliberately as this artifact\'s own minTvlUsd, never the committed snapshot\'s DEFAULT_MIN_TVL (a sub-rail artifact claiming the full floor would itself be a false trust claim).' },
  { file: 'generate-spotlight.js', expr: 'const APY_SANITY_LIMIT = 1000', reason: 'A genuine unlinked mirror (its own comment says "mirrors planner.js:19 — same value, never weakened"), used to build this file\'s local PERSONA_BANDS persona classifier. Not one of this widening\'s three named fix targets (the task named generate-spotlight.js:73/DEFAULT_MIN_TVL only) — residue, not fixed here.' },
  { file: 'generate-stories.js', expr: 'const APY_SANITY_LIMIT = 1000', reason: 'A genuine unlinked mirror ("Sanity rails & curation — mirrors planner.js exactly"), used for this generator\'s own persona-story curation. Not one of this widening\'s three named fix targets — residue, not fixed here.' },
  { file: 'planner.js', expr: 'var APY_SANITY_LIMIT = 1000', reason: 'A genuine unlinked mirror at the top of the core browser planner module (used correctly downstream — planner.js\'s own comparison sites read this constant, never a re-typed literal, which is why the comparison scan finds zero sites here). Deriving the DECLARATION itself is Leg A/D territory (planner.js is core planner code this bounded widening\'s task explicitly says not to redo) — residue, not fixed here.' },

  // --- Unrelated financial constants (per this widening\'s own task scope). ---
  { file: 'generate-stories.js', expr: 'const BANK_APY = 0.5', reason: 'Typical savings-account rate used only as a "garden vs bank" contrast figure — an unrelated financial constant, not a mirror of either rail.' },
  { file: 'planner.js', expr: 'var BANK_APY = 0.5', reason: 'Typical savings-account rate used only as a "garden vs bank" contrast figure — an unrelated financial constant, not a mirror of either rail.' },

  // --- A deliberately different, intentional policy that coincides with the
  // rail value today (per this widening\'s own task scope, "must NOT be made
  // to derive"). ---
  { file: 'generate-token-pages.js', expr: 'const MIN_POOL_TVL = 100000', reason: "This SEO generator's OWN long-tail-eligibility floor — deliberately separate from DEFAULT_MIN_TVL per human directive 2026-07-11 (the app's floor governs what enters a savings PLAN; this floor governs which tokens earn a static SEO page). Its value COINCIDES with DEFAULT_MIN_TVL today, but is a different decision — must NOT be made to derive from trust-rails.js." },

  // --- The fabricated, unrailed projection rate spec 266 itself scoped OUT —
  // "a different class — an unrailed number, not an unlinked rail." ---
  { file: 'home.html', expr: 'var apy = 5.5', reason: "calculate_savings_projection's own hardcoded example rate — spec 266's own OUT OF SCOPE section: a fabricated, unrailed projection number, not a copy of either trust rail (DEFAULT_MIN_TVL/APY_SANITY_LIMIT). Recorded as residue in 266-notes.md, untouched by Legs A-D and by this widening." },

  // --- Test-only: local fixture rate for one test scenario, identifier
  // merely named "apy" — not a rail constant at all. ---
  { file: 'test_planner.js', expr: 'var apy = 5.3', reason: "A local per-test fixture rate (the \"disney\" bundle scenario's example APY, 5.3%) used to exercise foreverNumber/coveredBundle math — an arbitrary example number, not DEFAULT_MIN_TVL/APY_SANITY_LIMIT. Appears twice in the file (two test cases); both fold into this one key." },

  // --- Test-only: unlinked mirrors of a GENERATOR's own threshold, all four
  // named explicitly in this widening's own task instructions as residue. ---
  { file: 'test_chain_pages.js', expr: 'const MIN_POOL_TVL = 100000', reason: "A scratch-patch STRING marker (a `tokenSrc.replace(...)` find/replace target) whose text is generate-token-pages.js's own MIN_POOL_TVL declaration, used to mutate that constant in an isolated scratch copy for a floor-derivation test — an unlinked text-mirror of that generator's OWN threshold (itself allowlisted above, not a rail copy), fragile only to the generator's declaration text reformatting (guarded by the test's own assert.ok). Residue, not fixed here." },
  { file: 'test_markdown_twins.js', expr: 'const MIN_POOL_TVL = 100000', reason: 'Same scratch-patch STRING marker as test_chain_pages.js, same reasoning — an unlinked text-mirror of generate-token-pages.js\'s own MIN_POOL_TVL, not a rail copy. Residue, not fixed here.' },
  { file: 'test_token_pages.js', expr: 'const MIN_POOL_TVL = 100000', reason: 'Same scratch-patch STRING marker as test_chain_pages.js, same reasoning — an unlinked text-mirror of generate-token-pages.js\'s own MIN_POOL_TVL, not a rail copy. Residue, not fixed here.' },
  { file: 'test_seo_cta_targets.js', expr: 'const APP_DEFAULT_MIN_TVL = 100000', reason: "A test fixture floor named to mirror app.js's DEFAULT_MIN_TVL for asserting the SEO waitlist CTA's deep-link target — an unlinked test-only mirror (residue), not a rail implementation." },
  { file: 'test_kpi_rail_history.js', expr: 'const APY_SANITY_LIMIT = 1000', reason: "A read-only test-fixture mirror (its own comment: \"trust-rail mirror, read-only, same value as app.js/compute-kpis.js\") used only to interpret committed KPI-history data in assertions — an unlinked test-only mirror (residue), not a rail implementation." },

  // ===========================================================================
  // PLAIN-ASSIGNMENT-SHAPED entries (verifier round 2, FIX 2 — the key
  // predicate relaxation from SCREAMING_SNAKE_CASE to the same `/tvl|apy/i`
  // substring test every other detector uses). Exactly 2 new real sites
  // surfaced by the relaxation, both obvious fixture mutations forcing a
  // render-gate condition true, not a rail copy. See product-loop-kit/specs/
  // 266-notes.md, "Verifier round 2 — FAIL, and the fixes", FIX 2.
  // ===========================================================================
  { file: 'test_audit_app.js', expr: 'target.apyReward = 1', reason: 'A snapshot-fixture mutation forcing PoolDetail.js:1210/1236\'s shared render gate (`pool.apyBase > 0 && pool.apyReward > 0`) true so the injected-apyBase positive control (line above) actually renders; `1` is an arbitrary "just needs to be positive" value, not a copy of DEFAULT_MIN_TVL/APY_SANITY_LIMIT.' },
  { file: 'test_audit_number_boundary.js', expr: 'target.apyReward = 1', reason: 'Same snapshot-fixture mutation as test_audit_app.js, same reasoning — forces the shared apyBase/apyReward render gate true for this file\'s own rendered positive-control case; an arbitrary positive filler value, not a rail copy.' },

  // --- Re-measured beyond the task's own "exactly 2" estimate (product-loop-
  // kit/specs/266-notes.md, "Verifier round 2 — FAIL, and the fixes", FIX 2
  // corrects this in place): 2 MORE sites surfaced, both a genuinely
  // different false-positive shape — a URL QUERY-STRING fragment
  // (`?key=value`) sitting inside an ordinary STRING/template-literal
  // argument (an assertion message / test URL), which happens to look
  // exactly like `IDENT = NUM` because a query string's `=` separator reads
  // the same as JS's assignment `=`. This detector deliberately does NOT
  // strip string/template TEXT (same tradeoff findAssignmentSites documents,
  // needed to catch rail declarations hidden inside scratch-patch string
  // markers), so this class was always reachable in principle — it simply
  // needed a case-insensitive `tvl`/`apy` key to surface, which the
  // SCREAMING_SNAKE_CASE restriction had been (accidentally) filtering out. ---
  { file: 'test_audit_text_surfaces.js', expr: 'minApy = 10', reason: 'NOT REAL CODE — a URL query-string fragment `?poolTypes=Staking&minApy=10` quoted inside a template-literal assertion message describing a known dead link (backlog 180); the plain-assignment detector does not strip string text (by design), so `minApy=10` inside that quoted URL reads identically to a JS assignment. No assignment of any kind occurs on this line.' },
  { file: 'test_seo_app_link_attribution.js', expr: 'minTvl = 100000', reason: 'NOT REAL CODE — a URL QUERY PARAMETER named "minTvl" set to 100000 (this file drives real browser navigations to a URL carrying that query string alongside `token`/`src`) quoted inside a plain string-literal `throw new Error(...)` assertion message; the plain-assignment detector does not strip string text (by design). No assignment occurs on either line (315, 331 — same message text, folded into this one key). [Reason text deliberately does not spell the query-string fragment contiguously, to avoid this ALLOWLIST entry\'s own prose re-tripping this same detector — see the self-pollution note elsewhere in this file.]' },

  // --- Operator round 3 (default-parameter terminator widening): one MORE
  // real site surfaced by adding `)` to PLAIN_ASSIGN_RE's own terminator —
  // a false positive of the SAME character as the two entries directly
  // above (a query-string-shaped fragment sitting inside ordinary string
  // TEXT this detector deliberately does not strip), just newly reachable
  // because this occurrence's string happens to end in a literal `)`
  // character right after the number, which only the widened terminator
  // now recognises as a boundary. ---
  { file: 'test_seo_cta_render.js', expr: 'minTvl = 100000', reason: 'NOT REAL CODE — a console.log message reporting the fixture\'s TVL floor value inside a plain string-literal argument describing the rendered scenario; the string happens to end in a literal close-paren character immediately after the number, which is why this round\'s widened `)` terminator branch newly matches it — the same false-positive class the test_seo_app_link_attribution.js entry above already documents for a URL query string, here occurring in ordinary log text instead. No assignment occurs on this line. [Reason text deliberately avoids spelling the identifier next to the number with an `=` between them, to avoid this ALLOWLIST entry\'s own prose re-tripping this same detector.]' },

  // ===========================================================================
  // VERIFIER ROUND 3 (the parenthesised-operand gap) — 19 new comparison-
  // shaped sites surfaced by (a) the PAREN_GROUP_RE operand widening above
  // findSites and (b) the regex-literal fix to stripCommentsAndStrings that
  // unblanked 7 previously-corrupted files' tails (see that fix's own header
  // comment). Re-derived by actually running the widened scan, not by
  // trusting the verifier's own 11-item enumeration — it found 19, not 11;
  // see product-loop-kit/specs/266-notes.md, "Verifier round 3 — the
  // parenthesised-operand gap", for the full derivation. None of the 19 is a
  // REAL unlinked rail copy — each is classified below as either a different,
  // deliberately-distinct threshold (the $1,000 SEO-hygiene floor, already
  // allowlisted elsewhere under the bare-identifier shape), an unrelated
  // display/statistics ratio, a floating-point test tolerance, a string-
  // length anti-vacuity check, or a test sanity-check against already-railed
  // data (same class as the pre-existing test_pools_snapshot.js:76 entry).
  // ===========================================================================

  // --- PoolDetail.js: the rate-momentum/TVL-trend "confidence" note gates
  // (087/104/210) — ratio and magnitude thresholds deciding whether to show
  // an honesty note about a pool's OWN rate history, never a copy of
  // DEFAULT_MIN_TVL/APY_SANITY_LIMIT (both of which are hard admission
  // rails checked far earlier in the pipeline, before a pool ever reaches
  // PoolDetail.js). The 3-level-nested ratio guard appears 5 times (lines
  // 524, 538, 569, 949, 986 — one per card variant/story render); one key
  // (after whitespace normalisation) covers all five identical occurrences,
  // the same "one key per identical occurrence" precedent generate-llms.js's
  // `tvl > 1e9` entry already set. ---
  { file: 'PoolDetail.js', expr: '(Math.max((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d) / Math.min((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d)) >= 1.5', reason: 'The rate-divergence "is apyMean30d still a reliable reference point" confidence guard (current-vs-30d-mean ratio >= 1.5x) gating the momentum/TVL-trend honesty notes — a display-logic threshold, not APY_SANITY_LIMIT (a ceiling on the RAW rate, not a ratio between two rate readings). Appears 5 times (differently indented per card/story render, lines 524/538/569/949/986); one key covers all five after whitespace normalisation.' },
  { file: 'PoolDetail.js', expr: '(pool.kpis.apyMomentum) >= 0.5', reason: 'The "rate has climbed" momentum-note trigger (087) — a 0.5 percentage-point movement threshold over the tracked history window, unrelated to APY_SANITY_LIMIT (a ceiling on the rate itself, not on its change).' },
  { file: 'PoolDetail.js', expr: '(pool.kpis.tvlTrend) >= 0.25', reason: 'The "TVL is shrinking/growing" trend-note significance gate (104/210) — a 25% fractional-change threshold over the tracked window, unrelated to DEFAULT_MIN_TVL (an absolute-dollar admission floor, not a fractional trend).' },

  // --- generate-pool-pages.js: an explicit, comment-documented mirror of
  // PoolDetail.js's OWN rate-divergence confidence guard (same reasoning as
  // the PoolDetail.js entry above; generates the static twin pages). ---
  { file: 'generate-pool-pages.js', expr: '(Math.max(currentTotalApy, pool.apyMean30d) / Math.min(currentTotalApy, pool.apyMean30d)) >= 1.5', reason: 'Mirror of PoolDetail.js\'s rate-divergence confidence guard (same 1.5x ratio, same purpose — deciding whether apyMean30d is a reliable reference point for this generator\'s own momentum copy) — not APY_SANITY_LIMIT.' },

  // --- generate-pools-snapshot.js / test_seo_shared_source.js /
  // test_llms_shared_source.js: the SEO-hygiene $1,000 floor (spec 266
  // Evidence §4, already allowlisted above under generate-sitemap.js's bare-
  // identifier form `pool.tvlUsd < 1000`) — now also visible under the
  // house `(Number(x) || 0) >= LITERAL` idiom, a different (far lower)
  // threshold than DEFAULT_MIN_TVL (100000), never a copy of it. ---
  { file: 'generate-pools-snapshot.js', expr: '(Number(p && p.tvlUsd) || 0) >= 1000', reason: 'The generator\'s OWN `--seoOut` scratch transient (comment: "$1000-floored RAW-pool transient... Scratch path only — never committed/served") — the same $1,000 SEO-hygiene floor already allowlisted for generate-sitemap.js, not DEFAULT_MIN_TVL (100000, 100x higher). Feeds the 3 SEO generators from one CI fetch; never written to a committed file.' },
  { file: 'test_seo_shared_source.js', expr: '(Number(p.tvlUsd) || 0) >= 1000', reason: 'A test fixture mirroring the SAME $1,000 SEO-hygiene floor (to build the expected/filtered dataset for asserting the 3 SEO generators share one input source) — not DEFAULT_MIN_TVL.' },
  { file: 'test_llms_shared_source.js', expr: '(p.tvlUsd) >= 1000', reason: 'Same $1,000 SEO-hygiene floor mirror as test_seo_shared_source.js, for the llms.txt/llms-full.txt shared-source test — not DEFAULT_MIN_TVL.' },

  // --- planner.js: unrelated statistics/UI-copy thresholds. ---
  { file: 'planner.js', expr: '(k.apyStdev / cur) <= 0.2', reason: 'The "steady pool" classifier for the portfolio narrative (stdev/apy ratio <= 0.2, requires >=7 tracked history points) — a statistics-classification threshold, same character as test_compute_kpis.js\'s already-allowlisted kpis.apyStdev<0.05 entry, not APY_SANITY_LIMIT.' },
  { file: 'planner.js', expr: '(deltaApy) <= 0.05', reason: 'The "holding steady" plan-status copy threshold (has the blended rate moved by more than 5 percentage points since the plan was saved) — a UI-copy threshold, unrelated to either rail.' },

  // --- test_api_worker.js / test_spotlight_packs.js: floating-point test
  // tolerances and a string-length anti-vacuity check. ---
  { file: 'test_api_worker.js', expr: '(blendedRes.body.apyPct - expectedBlendedApy) < 1e-9', reason: 'A floating-point PARITY TOLERANCE between the API\'s reported blended rate and an independently-derived TVL-weighted rate (rounding-drift epsilon), same character as test_pool_twin_parity.js\'s already-allowlisted apyDiff>0.02 entry — not a rail threshold.' },
  { file: 'test_api_worker.js', expr: 'healthResult.body.rails.apySanityLimitExplanation.length > 20', reason: 'An anti-vacuity assertion on a STRING LENGTH (checking the /api/health explanation prose is real, not empty/placeholder text) — "apySanityLimitExplanation" is a property name, not an APY value; same class as test_agent_surface_rail_claims.js\'s already-allowlisted array-length assertions.' },
  { file: 'test_api_worker.js', expr: 'healthResult.body.rails.minTvlExplanation.length > 20', reason: 'Same string-length anti-vacuity check as the entry above, for the companion minTvlExplanation field.' },
  { file: 'test_spotlight_packs.js', expr: '(degenPack.effectiveApy - headline / 3) < 1e-9', reason: 'A floating-point tolerance verifying the degen ⅓-haircut math (effectiveApy == headline/3) to within rounding drift — same character as test_pool_twin_parity.js\'s apyDiff>0.02 entry, not a rail threshold.' },
  { file: 'test_spotlight_packs.js', expr: '(pack.effectiveApy - expectedEff) < 1e-9', reason: 'Same floating-point tolerance class as the entry above, checked across every persona pack (not only degen) in this file\'s own self-consistency loop.' },

  // --- test_pool_twins.js: a test sanity-check against ALREADY-railed data,
  // the same class as the pre-existing test_pools_snapshot.js:76 entry. ---
  { file: 'test_pool_twins.js', expr: '(p.tvlUsd || 0) >= 100000', reason: 'A sanity check that every pool in the REAL, already-generated snapshot clears DEFAULT_MIN_TVL (the value coincides with the rail because that IS the boundary under test — same reasoning as this file\'s own SUB_10M_FIXTURE.tvlUsd<100000 entry above and as test_pools_snapshot.js:76): this line only reads already-railed data, never admits/rejects a live pool itself, so it is not a second rail implementation.' },
];

const allowlistKeys = new Set(ALLOWLIST.map((e) => `${e.file}|${e.expr}`));

// Combined population for the final two set-equality tests, per this
// widening's own instruction: comparison sites (Leg C original) folded
// together with non-canonical assignment sites (operator-requested
// widening) AND the two verifier-round-1 shapes (object-property,
// plain-assignment — finding 2) into the SAME two-direction check against
// the SAME allowlist.
const combinedSites = [...allSites, ...assignmentSites, ...objectPropertySitesAll, ...plainAssignmentSitesAll];
const scannedKeys = new Set(combinedSites.map((s) => `${s.file}|${s.expr}`));

test('every scanned site (comparison + assignment) is in the allowlist (a new unlinked rail-copy literal cannot land silently)', () => {
  const unclassified = combinedSites.filter((s) => !allowlistKeys.has(`${s.file}|${s.expr}`));
  assert.deepStrictEqual(
    unclassified,
    [],
    unclassified.map((s) => `${s.file}:${s.line}: unclassified pool-threshold literal ${s.expr.includes('=') && !/[<>]/.test(s.expr) ? 'assignment' : 'comparison'} "${s.expr}" — add an ALLOWLIST entry naming what this threshold actually is, or fix it if it's an unlinked rail copy`).join('\n')
  );
});

test('every allowlist entry still matches at least one scanned site (the mirror cannot rot)', () => {
  const stale = ALLOWLIST.filter((e) => !scannedKeys.has(`${e.file}|${e.expr}`));
  assert.deepStrictEqual(
    stale,
    [],
    stale.map((e) => `${e.file}|${e.expr}: allowlist entry matches nothing in the current scan — the code changed (or the entry was mistyped); update or remove it`).join('\n')
  );
});

console.log(`\n${passed} assertions passed (population: ${population.length} files; comparison sites: ${allSites.length}; assignment sites: ${assignmentSites.length} (+${canonicalAssignmentSites.length} canonical, excluded); allowlist entries: ${ALLOWLIST.length})`);
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
