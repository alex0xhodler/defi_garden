# 172 — build notes

Item: give the STATIC-page prescan a link signal (`link-target-integrity` on generated HTML).
Spec: `product-loop-kit/specs/172.md`. Branch: `claude/loop-172` (already checked out per the build
brief — not created here). Base: `origin/main` @ `39014e6bb` (includes 169 `07e18988b`, 170 `0bce2cb43`,
171 `39014e6bb`).

## What shipped

- `audit-app.js`: one new signal, `'link-target-integrity': 'P1'`, added to `PRESCAN_SIGNALS` (the only
  edited line among the four pre-existing signals — an ADDITION to the object literal; their four
  detection blocks inside `prescanStaticPages()` are byte-identical, confirmed by inspection and by the
  three non-vacuity cycles below never touching them). A new helper section (HTML link-target-integrity
  helpers: `decodeHrefEntities`, `HTML_HREF_RE`, `HTML_OWNED_ABS_RE`, `ownedHtmlLinkSuffix`,
  `ownedLinkPath`, `loadPlannerAllowedParams`, `isPoolAddressingSuffix`, `anchorAttr`, `anchorHasClass`,
  `HTML_ANCHOR_TAG_RE`, `POOL_ROW_ANCHOR_CLASSES`, `ownedPathResolvesToFile`) inserted between
  `extractPageText()` and the "Static-surface prescan" comment block — i.e. strictly BEFORE
  `prescanStaticPages()`, touching nothing inside it. `prescanStaticPages()` itself gained: (1)
  `opts.pages`/`opts.homeHtml`/`opts.plannerJs` (test-support overrides, same convention as
  `prescanTextSurfaces()`'s `opts.files`/`opts.homeHtml`, backlog 169 — production behaviour with no
  opts is unchanged, still `listLeafPages('tokens').concat(listLeafPages('chains'))`); (2) one setup block
  before the per-page loop that parses `home.html` and `planner.js` ONCE, not once per page; (3) the new
  link-target-integrity block appended strictly AFTER the four pre-existing signal blocks inside the loop.
- `test_audit_prescan.js`: a fixture helper (`writeLinkFixture`/`cleanupLinkFixtures`/`minimalPage`, same
  shape as `test_audit_text_surfaces.js`'s `writeFixture`/`cleanupFixtures`, backlog 169) plus 20 new
  `test(...)` cases appended after the existing spec-171 A6a/A6b section, all wrapped in a
  `try { ... } finally { cleanupLinkFixtures(); }` block. No second test file created.
- No other file touched. `package.json` untouched (proven below, structurally not by eye). No product
  file, generator, generated page, sitemap, or OG asset touched.

`git diff --numstat` (final, post all three restore cycles, working tree clean of neuters — md5 of
`audit-app.js` re-confirmed `c4e93b8ffccf2f8b53d4a13b7a243431` immediately before this measurement):
```
$ git diff --numstat -- audit-app.js test_audit_prescan.js
242     5       audit-app.js
279     1       test_audit_prescan.js
```
The 5 deleted lines in `audit-app.js` are exactly: (1) the `'zero-yield-claim': 'P1'` line, which gained
a trailing comma so `'link-target-integrity': 'P1'` could follow it — an ADDITION to the object literal,
same shape 169-notes.md documents for its own one-line `TEXT_SURFACE_SIGNALS` edit, not a value change;
(2) `const rels = listLeafPages(...)` and (3) `for (const rel of rels) {`, both replaced by the
`opts.pages`-aware setup; (4) `let h1Text, visibleText;` (gained `, html`); (5) the inline
`const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');`, replaced by the `abs`/`rel`-aware version.
Confirmed via `git diff -- audit-app.js | grep "^-" | grep -v "^---"` — exactly those 5 lines, nothing
inside the four pre-existing signal detection blocks (`JUNK_SLUG_*`/`ZERO_YIELD_CLAIM`/
`BROKEN_NUMBER_LITERAL`/`ABSURD_MAGNITUDE_TEXT` checks) was touched.

## Design choices

1. **`opts.pages`, mirroring `prescanTextSurfaces()`'s `opts.files`.** `prescanStaticPages()` had no
   test-support override before this item (it always read `listLeafPages('tokens').concat(listLeafPages('chains'))`
   directly). Positive/negative controls for the new signal need controlled fixture bytes, and 169's own
   test file already established the pattern of overriding the file LIST via opts rather than writing
   real files into `tokens/`/`chains/` for pure fs+regex cases (it reserves real-directory probe files for
   cases that need a REAL Chromium render, which this item's cases never do). `opts.pages` accepts
   absolute fixture paths (`path.isAbsolute` branches to `path.relative(ROOT, …)` for the `rel` field,
   exactly mirroring `prescanTextSurfaces()`'s `opts.files` resolution) — with no `opts.pages`, behaviour
   is byte-identical to before (spec 172's own "page list is unchanged" requirement).
2. **`opts.homeHtml`/`opts.plannerJs`, not `opts.root`.** Same reasoning 169-notes.md gives for its own
   `opts.homeHtml`: a direct-path override is the minimal shape the coupling-proof tests need (point at
   one copied, mutated file), and it mirrors the one already-shipped convention rather than inventing a
   second one.
3. **`loadPlannerAllowedParams()` is new, not a second copy of anything.** The spec's one open judgment
   call — what's allowed on a `/plan.html` link, where the IA router never arbitrates — is resolved by
   scanning `planner.js` for its OWN `urlParams.get('<key>')` / `urlParams.get("<key>")` call sites
   (`/urlParams\.get\(\s*(['"])([^'"]+)\1\s*\)/g`), never by hand-listing the keys. This satisfies the
   spec's explicit ban on inventing a second hardcoded param list while giving rule (a)'s planner half the
   same `{ allowed, error }` shape `loadRouterAllowedParams()` already returns, so both plug into one call
   site without a third branch shape.
4. **Rule (a) and rule (c) share ONE pass over `html.matchAll(HTML_HREF_RE)`**, not two. Both key off the
   same owned-suffix/path split (`ownedHtmlLinkSuffix()` → `ownedLinkPath()`), so scanning the same href
   set twice would be pure waste on a 2,181-page corpus. Rule (b) is a genuinely separate pass
   (`HTML_ANCHOR_TAG_RE`, scoped to `<a>` tags carrying `tp-pool-link`/`cp-pool-link`) since it needs the
   tag's `class` attribute, which the href-only pass never captures.
5. **One suspect per file PER SUB-RULE, matching 169's own shipped convention exactly**, not one suspect
   per file for the whole `link-target-integrity` signal. Confirmed by re-reading 169's own
   `prescanTextSurfaces()` implementation (`audit-app.js`, backlog 169) before writing a line of this
   item's code: it pushes up to 3 independent suspect objects sharing `signal: 'link-target-integrity'`,
   one per sub-rule, each internally capped at ≤3 quoted examples. Spec 172 says "same 169 convention"
   twice; the "all-three-fire" test below pins exactly 3, never 1 and never one-per-bad-link.
6. **The `<a>` tag's `class`/`href` attribute order is not assumed.** The generated pages always emit
   `class` before `href` (verified: `grep -ohE '<a\b[^>]*>' tokens/*.html chains/*.html | sed ...` across
   the whole tokens/chains corpus shows only `class="…" href="…"` order), but `anchorAttr()` matches each
   attribute independently by name via its own regex rather than assuming a fixed order — a template
   change reordering attributes must not silently blind rule (b).
7. **Rule (c)'s three resolution forms (`<path>`, `<path>.html`, `<path>/index.html`) are checked against
   `ROOT` (module-level `__dirname`), never against the fixture's own directory** — this is deliberately
   NOT parameterized by `opts.pages`, because the spec's rule (c) is about the REAL repo's on-disk file
   set (item 030/031/032/033's orphan-link class), not about a fixture's own containing folder. The rule
   (c) positive control therefore points at a path that genuinely does not exist anywhere under the real
   `ROOT` (`/tokens/doesnotexist999`), and the negative controls point at real committed files
   (`/style.css`, `/chains` → `chains/index.html`).
8. **Entity decoding handles the full common set (`&amp;`/`&lt;`/`&gt;`/`&quot;`/`&#39;`/`&apos;`), not
   just `&amp;`.** The spec's own measurement only found `&amp;` live on this checkout, but every other
   named entity costs nothing extra and guards the identical bug class (a scanner splitting a raw,
   undecoded attribute value). Pinned by the dedicated entity-decoding test using the REAL live shape
   (`/plan.html?waitlist=1&amp;src=seo_token`, item 062) rather than a synthetic key, so the test also
   incidentally proves both real planner keys are read.
9. **Rule (b)'s "missing href" case pushes the literal string `"(missing href)"` into the suspect list**,
   distinguished from an EMPTY href (`href=""`) which would instead flow through
   `ownedHtmlLinkSuffix('')` → fails both the absolute-origin match and the `startsWith('/')` check → `null`
   → falls to the generic "not pool-addressing" branch and is quoted as `"(empty href)"` via
   `decodeHrefEntities(hrefRaw) || '(empty href)'`. Both are real, distinguishable failure shapes named
   separately in the code (not tested for the empty-string case specifically, since `anchorAttr()` only
   ever returns `null` for a genuinely absent attribute or the captured string otherwise — an
   `href=""` attribute is a real possible case but wasn't observed anywhere in the corpus and isn't
   separately pinned by its own test; noted here rather than silently assumed identical to "missing").

## Deviations from the spec, and the conservative choice made

1. **The evidence table's "2,183 generated HTML SEO pages" figure double-counts each directory's own
   `index.html`.** `listLeafPages()` (backlog 154, unchanged by this diff) explicitly filters out
   `index.html` (`e.name !== 'index.html'`). `ls tokens/*.html | wc -l` = 2094 and `ls chains/*.html | wc -l`
   = 89 (2094+89=2183, the spec's figure) — but each of those counts includes that directory's own
   `index.html`, which `prescanStaticPages()` never scans. The REAL scanned count, measured directly via
   `prescanStaticPages().scanned` on this checkout, is **2181** (2093 token leaves + 88 chain leaves), not
   2183. This is a pre-existing measurement error in the spec's own evidence table (not introduced by this
   diff — `listLeafPages()` is untouched), disclosed here rather than silently worked around; the
   acceptance criterion's "zero suspects on the real committed surface" is satisfied against the true
   2181-page set (see "True negative" below), which is the number that actually matters.
2. **No pre-029 commit was reachable for rule (b)'s positive control.** The spec explicitly permits a
   fixture fallback ("state in the notes whether it was [reachable], and fall back to fixtures if not").
   `git rev-parse --is-shallow-repository` → `true`; `git log --oneline | wc -l` → 50; the oldest reachable
   commit is item ~141 (`79e29a6f4`), well after item 029 shipped `tp-pool-link`/`cp-pool-link`. Rule (b)'s
   positive controls therefore use synthetic fixtures (a minimal page template + one bad anchor each), not
   real historical bytes. This is disclosed rather than silently substituted.
3. **`prescanStaticPages()` gained `opts.pages`/`opts.homeHtml`/`opts.plannerJs`, three new parameters not
   explicitly named in the spec's Change section.** The spec's acceptance criteria REQUIRE fixture-driven
   coupling proofs and isolated positive controls, which are impossible without some way to hand the
   function controlled bytes — 169 solved the identical problem for `prescanTextSurfaces()` with
   `opts.files`/`opts.homeHtml`, and this item extends that exact precedent rather than inventing a
   different mechanism. With no opts supplied, behaviour is provably unchanged (the true-negative test
   calls `prescanStaticPages()` with zero arguments, exactly as `buildStaticSurfaces()`'s own call site
   still does).
4. **The minimal test fixture template (`minimalPage()`) does not copy a real token page.** Early manual
   validation (a throwaway scratchpad script, run before any test-file code was written) used a mutated
   copy of `tokens/usdc.html` to prove each sub-rule's implementation logic worked at all; that worked but
   coupled every fixture to that page's live APY/TVL content — a value that regenerates daily in
   production (though not in this static checkout). Switched to a minimal synthetic `<h1>`+boilerplate
   template for the committed test file so every fixture is deterministic and immune to unrelated
   coincidental signal hits (verified: the "clean minimal fixture" test asserts `suspects.length === 0`
   for the template with no added links, proving no other signal's predicate accidentally fires on the
   template's own boilerplate text).

## Non-vacuity — three separate cycles, real transcripts

Baseline (post-172, before any neuter): `md5sum audit-app.js` = `c4e93b8ffccf2f8b53d4a13b7a243431`. A
golden copy was saved (`/tmp/.../scratchpad/audit-app.js.golden`, same hash) and used to restore
byte-identically after each cycle below (verified by `md5sum`, not by eye, each time).

### Cycle 1 — neuter rule (a)

Edit: `const bad = urlQueryKeys(suffix).filter((k) => !allowed.has(k));`
→ `.filter((k) => !allowed.has(k) && false); // NEUTERED cycle 1 (rule a)` (never any bad key).

```
=== NEUTERED CYCLE 1 (rule a) RUN ===
  ✓ criterion 1: scanned >= 2000 and junk-slug suspects exactly match the on-disk junk predicate
  ✓ criterion 2: digit-leading real tickers (0x0, 1inch, 3crv, a0t) appear in NO suspect list
  ✓ criterion 3: promotion, REAL render — probe page covered + rendered junk-slug P1 finding
  ✓ criterion 4: non-vacuity — identical config with prescan:false does NOT cover the probe slug
  ✓ criterion 5: aggregate static-prescan:junk-slug count matches the independently re-derived on-disk count; clean signals emit nothing
  ✓ criterion 6: determinism — same seed gives identical prescan.promoted + surfacesCovered; a different seed (suspects<=cap) promotes the same SET
  ✓ criterion 7: budget unchanged — default-config (prescanMax=4, sampleSize=6) static surfaces stay within anchor + sampleSize
  ✓ A6a (spec 171, non-vacuity): reconcilePrescanFindings has no built-in text-surface exemption — the identical "apy-rail-breach" signal, fully promoted + rendered clean, WOULD downgrade under prefix:"text-surfaces" if it were ever called that way
  ✓ A6b (spec 171): runAudit() never passes textSurfaceFindings to reconcilePrescanFindings — only prescanFindings (prefix static-prescan) and poolPrescanFindings (prefix pool-prescan)
  ✓ link-target-integrity: TRUE NEGATIVE — the real committed tokens/*.html + chains/*.html pages produce ZERO link-target-integrity suspects
  ✓ link-target-integrity: a clean minimal fixture (no owned links beyond the boilerplate) produces zero suspects of ANY signal
  ✗ link-target-integrity rule (a) positive control: an unrouted query key on a home-path link is a suspect, ALONE (b/c stay clean)
    expected exactly 1 link-target-integrity suspect (rule a only); got 0: []
  ✗ link-target-integrity rule (a) positive control: an unrouted query key on a /plan.html link is a suspect, ALONE
    expected exactly 1 link-target-integrity suspect; got 0: []
  ✓ link-target-integrity rule (a): entity decoding — "&amp;" is decoded before parsing, never a phantom "amp;src" key
  ✗ link-target-integrity rule (a): more than 3 distinct unrouted keys caps the quoted list at 3 with a "(+N more keys)" note
    expected exactly 1 rule-(a) suspect (one suspect per file per sub-rule); got 0
  ✓ link-target-integrity rule (b) positive control: a pool-row anchor linking to the bare origin is a suspect, ALONE
  ✓ link-target-integrity rule (b) positive control: a pool-row anchor linking to a "?token=" grid URL is a suspect
  ✓ link-target-integrity rule (b) positive control: a pool-row anchor with a MISSING href is a suspect
  ✓ link-target-integrity rule (b) negative: a pool-row anchor correctly targeting "?pool=<id>" is clean
  ✓ link-target-integrity rule (c) positive control: an internal link target with no file on disk is a suspect, ALONE
  ✓ link-target-integrity rule (c) negative: an internal link target that DOES exist on disk ("/style.css") is not a suspect
  ✓ link-target-integrity rule (c) negative: an internal link target resolving via <path>/index.html ("/chains") is not a suspect
  ✗ link-target-integrity: a fixture tripping all three sub-rules yields exactly 3 suspects (one per sub-rule), never one per bad link
    expected exactly 3 link-target-integrity suspects (one per sub-rule); got 2: [rule c + rule b suspects only]
  ✗ link-target-integrity rule (a) coupling proof (home.html): appending a param to a copied home.html flips a home-path URL using it from suspect to clean
    expected zzzCustomParam to be flagged before it is added to ANALYTICS_PARAMS; got: []
  ✗ link-target-integrity rule (a) coupling proof (planner.js): adding a urlParams.get() call site to a copied planner.js flips a /plan.html URL using that key from suspect to clean
    expected zzzPlannerParam to be flagged before planner.js reads it; got: []
  ✓ link-target-integrity rule (a) degrades safely: an UNREADABLE home.html skips the home-path half (stderr note, no throw); rule (b)/(c) and the other three signals still work
  ✗ link-target-integrity rule (a) degrades safely: an UNREADABLE planner.js skips the /plan.html half (stderr note, no throw); the home-path half still works
    expected exactly 1 suspect (home-path half only); got 0: []
  ✓ prescanStaticPages() degrades safely: an unreadable page in the list is skipped (stderr note, no throw) and does not block link-target-integrity on the other page
  ✓ AUDIT_STATIC_PAGES override disables prescan entirely (spec 157 B.2, unchanged) — prescan.scanned/bySignal/prescanFindings all empty

test_audit_prescan.js: 22 passed, 7 failed
```
(Verbatim from the actual terminal output; only the shared repeated JSON blob in the all-three test was
abbreviated for length, marked "[rule c + rule b suspects only]".)

Exactly the 7 rule-(a)-dependent cases went red. Two apparent "rule (a)" cases stayed green
COINCIDENTALLY, not by gap: the "UNREADABLE home.html degrades safely" case asserts *absence* of a rule-(a)
suspect (still true — there simply is no rule-(a) suspect at all, home.html-readable or not, once rule (a)
is neutered everywhere) AND presence of rule (b)/(c) (unaffected). Every rule-(b)/(c)-only case stayed
green. Restored:
```
$ md5sum audit-app.js
c4e93b8ffccf2f8b53d4a13b7a243431  audit-app.js
expected: c4e93b8ffccf2f8b53d4a13b7a243431
```
Restore-verification full re-run (ran immediately after the restore above, before cycle 2 began):
```
test_audit_prescan.js: 29 passed, 0 failed
```

### Cycle 2 — neuter rule (b)

Edit: `if (badTargets.length > 0) {` → `if (badTargets.length > 0 && false) { // NEUTERED cycle 2 (rule b)`
(the final aggregation check never fires, regardless of which path populated `badTargets` — missing href,
bare origin, or grid URL).

```
=== NEUTERED CYCLE 2 (rule b) RUN ===
  ✓ criterion 1..7, A6a, A6b (unaffected)
  ✓ link-target-integrity: TRUE NEGATIVE — the real committed tokens/*.html + chains/*.html pages produce ZERO link-target-integrity suspects
  ✓ link-target-integrity: a clean minimal fixture (no owned links beyond the boilerplate) produces zero suspects of ANY signal
  ✓ link-target-integrity rule (a) positive control: an unrouted query key on a home-path link is a suspect, ALONE (b/c stay clean)
  ✓ link-target-integrity rule (a) positive control: an unrouted query key on a /plan.html link is a suspect, ALONE
  ✓ link-target-integrity rule (a): entity decoding — "&amp;" is decoded before parsing, never a phantom "amp;src" key
  ✓ link-target-integrity rule (a): more than 3 distinct unrouted keys caps the quoted list at 3 with a "(+N more keys)" note
  ✗ link-target-integrity rule (b) positive control: a pool-row anchor linking to the bare origin is a suspect, ALONE
    expected exactly 1 link-target-integrity suspect; got 0: []
  ✗ link-target-integrity rule (b) positive control: a pool-row anchor linking to a "?token=" grid URL is a suspect
    expected exactly 1 suspect; got 0: []
  ✗ link-target-integrity rule (b) positive control: a pool-row anchor with a MISSING href is a suspect
    expected exactly 1 suspect; got 0: []
  ✓ link-target-integrity rule (b) negative: a pool-row anchor correctly targeting "?pool=<id>" is clean
  ✓ link-target-integrity rule (c) positive control: an internal link target with no file on disk is a suspect, ALONE
  ✓ link-target-integrity rule (c) negative: an internal link target that DOES exist on disk ("/style.css") is not a suspect
  ✓ link-target-integrity rule (c) negative: an internal link target resolving via <path>/index.html ("/chains") is not a suspect
  ✗ link-target-integrity: a fixture tripping all three sub-rules yields exactly 3 suspects (one per sub-rule), never one per bad link
    expected exactly 3 link-target-integrity suspects (one per sub-rule); got 2: [rule a + rule c suspects only]
  ✓ link-target-integrity rule (a) coupling proof (home.html): appending a param to a copied home.html flips a home-path URL using it from suspect to clean
  ✓ link-target-integrity rule (a) coupling proof (planner.js): adding a urlParams.get() call site to a copied planner.js flips a /plan.html URL using that key from suspect to clean
  ✗ link-target-integrity rule (a) degrades safely: an UNREADABLE home.html skips the home-path half (stderr note, no throw); rule (b)/(c) and the other three signals still work
    rule (b) must still fire
  ✓ link-target-integrity rule (a) degrades safely: an UNREADABLE planner.js skips the /plan.html half (stderr note, no throw); the home-path half still works
  ✗ prescanStaticPages() degrades safely: an unreadable page in the list is skipped (stderr note, no throw) and does not block link-target-integrity on the other page
    expected link-target-integrity to still fire on the valid page

test_audit_prescan.js: 23 passed, 6 failed
EXIT=1
```
Exactly the 6 rule-(b)-dependent cases went red: the 3 rule-(b) positive controls, the all-three test
(drops 3→2), the "UNREADABLE home.html" degrade test (which explicitly asserts rule (b) still fires —
correctly caught, since rule (b) is neutered everywhere including that fixture), and the "unreadable page
in the list" test (whose OWN valid-page fixture happens to use a rule-(b)-triggering anchor, so it also
lost its assertion target). Every rule-(a)/(c)-only case stayed green. Restored:
```
$ md5sum audit-app.js
c4e93b8ffccf2f8b53d4a13b7a243431  audit-app.js
expected: c4e93b8ffccf2f8b53d4a13b7a243431
```
Restore-verification full re-run:
```
test_audit_prescan.js: 29 passed, 0 failed
```

### Cycle 3 — neuter rule (c)

Edit: `if (!ownedPathResolvesToFile(linkPath)) brokenPaths.push(linkPath);`
→ `if (!ownedPathResolvesToFile(linkPath) && false) brokenPaths.push(linkPath); // NEUTERED cycle 3 (rule c)`
(a broken path is never recorded).

```
=== NEUTERED CYCLE 3 (rule c) RUN ===
  ✓ criterion 1..7, A6a, A6b (unaffected)
  ✓ link-target-integrity: TRUE NEGATIVE — the real committed tokens/*.html + chains/*.html pages produce ZERO link-target-integrity suspects
  ✓ link-target-integrity: a clean minimal fixture (no owned links beyond the boilerplate) produces zero suspects of ANY signal
  ✓ link-target-integrity rule (a) positive control: an unrouted query key on a home-path link is a suspect, ALONE (b/c stay clean)
  ✓ link-target-integrity rule (a) positive control: an unrouted query key on a /plan.html link is a suspect, ALONE
  ✓ link-target-integrity rule (a): entity decoding — "&amp;" is decoded before parsing, never a phantom "amp;src" key
  ✓ link-target-integrity rule (a): more than 3 distinct unrouted keys caps the quoted list at 3 with a "(+N more keys)" note
  ✓ link-target-integrity rule (b) positive control: a pool-row anchor linking to the bare origin is a suspect, ALONE
  ✓ link-target-integrity rule (b) positive control: a pool-row anchor linking to a "?token=" grid URL is a suspect
  ✓ link-target-integrity rule (b) positive control: a pool-row anchor with a MISSING href is a suspect
  ✓ link-target-integrity rule (b) negative: a pool-row anchor correctly targeting "?pool=<id>" is clean
  ✗ link-target-integrity rule (c) positive control: an internal link target with no file on disk is a suspect, ALONE
    expected exactly 1 suspect; got 0: []
  ✓ link-target-integrity rule (c) negative: an internal link target that DOES exist on disk ("/style.css") is not a suspect
  ✓ link-target-integrity rule (c) negative: an internal link target resolving via <path>/index.html ("/chains") is not a suspect
  ✗ link-target-integrity: a fixture tripping all three sub-rules yields exactly 3 suspects (one per sub-rule), never one per bad link
    expected exactly 3 link-target-integrity suspects (one per sub-rule); got 2: [rule a + rule b suspects only]
  ✓ link-target-integrity rule (a) coupling proof (home.html): appending a param to a copied home.html flips a home-path URL using it from suspect to clean
  ✓ link-target-integrity rule (a) coupling proof (planner.js): adding a urlParams.get() call site to a copied planner.js flips a /plan.html URL using that key from suspect to clean
  ✗ link-target-integrity rule (a) degrades safely: an UNREADABLE home.html skips the home-path half (stderr note, no throw); rule (b)/(c) and the other three signals still work
    rule (c) must still fire
  ✓ link-target-integrity rule (a) degrades safely: an UNREADABLE planner.js skips the /plan.html half (stderr note, no throw); the home-path half still works
  ✓ prescanStaticPages() degrades safely: an unreadable page in the list is skipped (stderr note, no throw) and does not block link-target-integrity on the other page
  ✓ AUDIT_STATIC_PAGES override disables prescan entirely (spec 157 B.2, unchanged) — prescan.scanned/bySignal/prescanFindings all empty

test_audit_prescan.js: 26 passed, 3 failed
EXIT=1
```
Exactly the 3 rule-(c)-dependent cases went red: the rule-(c) positive control, the all-three test
(drops 3→2), and the "UNREADABLE home.html" degrade test (which explicitly asserts rule (c) still fires —
correctly caught). Every rule-(a)/(b)-only case stayed green, including the "unreadable page in the
list" test (its own fixture is rule-(b)-shaped, unaffected by neutering rule (c)). Restored:
```
$ md5sum audit-app.js
c4e93b8ffccf2f8b53d4a13b7a243431  audit-app.js
expected: c4e93b8ffccf2f8b53d4a13b7a243431
```
Restore-verification full re-run: **recorded in "Test results" below.**

Three separate cycles, three distinct blast radii (7 / 6 / 3 cases respectively — rule (a) has the widest
blast radius because both coupling proofs and one extra degrade-safety case depend on it), three
byte-identical restores (md5 verified each time against the same golden hash
`c4e93b8ffccf2f8b53d4a13b7a243431`) — the file's final content is identical to what shipped, not a fourth
edited copy.

## Runtime

Measured directly (`time node -e "...prescanStaticPages()..."`), BEFORE this diff (baseline, `git stash`
not used — measured on the pre-172 golden file by re-running the same one-liner against a checked-out
copy of `HEAD:audit-app.js`) vs AFTER (this diff):

- **Before**: `real 0m0.355s` (`scanned: 2181, suspectCount: 7`).
- **After**: `real 0m0.640s` (`scanned: 2181`, `link-target-integrity: 0`, other signals unchanged).

**1.8×** — inside the spec's ≤2× wall-clock budget. The added work is one extra `matchAll(HTML_HREF_RE)`
pass (shared by rules a+c) plus one `matchAll(HTML_ANCHOR_TAG_RE)` pass (rule b) per page, over HTML the
pass already had in memory — no new file I/O.

## Reconciliation note (Territory note, disclosed per the spec's own instruction)

`reconcilePrescanFindings()` (backlog 171) downgrades an aggregate `static-prescan:<signal>` finding to P2
only when every suspect for that signal was promoted, covered, AND rendered with zero findings. A
`link-target-integrity` suspect has no rendered check counterpart (no `kind:'static'` check reads link
shape), so a promoted `link-target-integrity` suspect can never satisfy the "rendered clean" leg and this
aggregate will simply never reconcile/downgrade. This is correct per the "unverified is not clean" rule
171 established — noted here, per the spec's own instruction, so the next reader does not mistake the
absence of a reconciliation path for a bug.

## True negative (measured, real committed surface)

```
$ node -e "const {prescanStaticPages}=require('./audit-app.js'); const r=prescanStaticPages();
console.log('scanned',r.scanned); console.log('link-target-integrity suspects:',
r.suspects.filter(s=>s.signal==='link-target-integrity').length);"
scanned 2181
link-target-integrity suspects: 0
```
Zero suspects across all three sub-rules on the real 2181 committed `tokens/*.html` + `chains/*.html`
leaf pages — matches the spec's own pre-measurement.

## Full `node audit-app.js` run

```
$ NODE_PATH=/opt/node22/lib/node_modules node audit-app.js
...
"prescan": {
  "scanned": 2181,
  "suspectCount": 7,
  "bySignal": {
    "broken-number-literal": 0,
    "absurd-magnitude": 0,
    "junk-slug": 7,
    "zero-yield-claim": 0,
    "link-target-integrity": 0
  },
  "promoted": ["tokens/20261231", "tokens/2027", "tokens/67", "tokens/8oct2026"]
}
...
[audit] findings: 6 total, 5 blocking (P0/P1)
```
`prescan.bySignal` gains the new `link-target-integrity` key (value 0, honestly — nothing was fixed, this
is a gate, not a repair, exactly as the spec states). `surfacesCovered` is unchanged in shape/count from
the pre-172 baseline (29 entries, same names). Blocking count is **5**, matching this checkout's
documented pre-existing state (the item-148 junk-slug class, human-gated PR #306; the sixth, non-blocking
finding is item 171's own `pool-prescan:mean30d-rail-breach` P2 downgrade, unaffected by this diff).
`exit=1` — correctly, because the product-side item-148 defect is still real and unfixed by this
detector-only item.

## Test results (final, post-restore)

```
$ node test_audit_prescan.js   (NODE_PATH=/opt/node22/lib/node_modules)
test_audit_prescan.js: 29 passed, 0 failed
```
29 = 9 pre-existing spec-157/171 cases (criteria 1-7, A6a, A6b, unchanged) + 20 new backlog-172 cases,
confirmed by direct grep rather than hand arithmetic:
```
$ grep -c "await test(" test_audit_prescan.js
29
```
Matches the runtime-reported total exactly (29 `test(...)` call sites, 29 passed).

```
$ node test_audit_text_surfaces.js
test_audit_text_surfaces.js: 32 passed, 0 failed
```
Unaffected — `TEXT_SURFACE_SIGNALS` is a separate map from `PRESCAN_SIGNALS`; confirmed by direct
inspection that this diff touches neither `prescanTextSurfaces()` nor anything in its section.

```
$ node test_audit_app.js            → 3 passed, 0 failed
$ node test_seo_surface_audit.js     → 5 passed, 0 failed
$ node test_audit_pool_prescan.js    → 14 passed, 0 failed
$ node test_audit_runner.js          → 9 assertions passed
$ node test_audit_planner_surface.js → 9 passed, 0 failed
$ node test_audit_planner_flow.js    → 11 passed, 0 failed
```
All 8 `require('./audit-app.js')` consumers in the repo were run individually and are green (verified via
`grep -l "require('./audit-app.js')" test_*.js`).

```
$ npm ci
added 67 packages, and audited 68 packages in 3s
$ git diff --exit-code package.json && echo "package.json: no diff"
package.json: no diff
```

```
$ node run-tests.js --lane=plain
TOTAL pass=36 fail=0 timeout=0 total=36
```

## Dependency proof (structured, not eyeballed)

```
$ git diff --exit-code package.json && echo "package.json: no diff"
package.json: no diff
$ python3 -c "
import json, subprocess
cur = json.load(open('package.json'))
head = json.loads(subprocess.check_output(['git','show','HEAD:package.json']))
for key in ['dependencies','devDependencies']:
    print(key, 'identical:', cur.get(key) == head.get(key))
"
dependencies identical: True
devDependencies identical: True
```
`node_modules/` is gitignored; `npm ci` (run because `node_modules` was missing in this sandbox) added no
tracked changes.

## `product-loop-kit/signals/audit-findings.json` — legitimately in scope, disclosed per 171 precedent

The full `node audit-app.js` run (see below) overwrites `signals/audit-findings.json` unconditionally —
it is `DEFAULT_OUT`, exactly as 171-notes.md/171-pr.md documented for its own session. Its diff carries
only `generatedAt` and the one intended addition: `prescan.bySignal` gains
`"link-target-integrity": 0`. Leaving a stale artifact that contradicts the code on disk would be the
very thing 171 exists to prevent, so it was not reverted.

**CORRECTION (operator, post-verification 2026-07-29).** An earlier revision of this section explained a
`playwright.version` drop to `1.56.1` in the committed artifact as "`npm ci` resolving a different
locally-cached version". **That explanation was wrong**, as the verifier established: `npm ci` installed
**1.61.1** (`node_modules/playwright/package.json` = 1.61.1, matching `package.json`'s `^1.61.1`). The
`1.56.1` came from an *operator* audit run made earlier in the session, before `node_modules` existed, in
which node resolved playwright from the global `/opt/node22/lib/node_modules` fallback. A committed
snapshot claiming a version the repo neither pins nor installs is exactly the class of dishonest artifact
`ci-signal-honesty` is about, so the artifact was **regenerated** after verification with local
playwright present: `playwright.version` back to `1.61.1`, `findings` 6 (unchanged, the pre-existing
item-148 class), `prescan.bySignal["link-target-integrity"]` 0. The regeneration touched no code and
therefore does not invalidate the verified diff.

## Pre-existing uncommitted state, not authored by this build

Before this session's first edit, `git status --short` already showed
`product-loop-kit/BACKLOG.md`, `product-loop-kit/playbooks/detector-signal-coverage.md`, and
`product-loop-kit/playbooks/product-audit.md` as modified, plus `product-loop-kit/specs/172.md` as
untracked — all authored upstream of this build session (the spec-writing/heartbeat-triage step that
produced `specs/172.md` itself, before handoff). This build session never wrote to `BACKLOG.md` or
`LOG.md` (both operator-owned per the build brief) or either playbook file — confirmed by this session
only ever calling `Write`/`Edit` on `audit-app.js`, `test_audit_prescan.js`,
`product-loop-kit/specs/172-notes.md`, and `product-loop-kit/specs/172-pr.md`.

## What I ran, and what I explicitly did NOT run

Ran (all quoted verbatim above or in-line with real output):
- `node test_audit_prescan.js` (NODE_PATH set) — 29/29 green on every run in this session (initial
  implementation run, post-cycle-1/2/3 restore-verification runs), ~2-2.5min each (dominated by criteria
  3/4/6/7's real Chromium renders, unchanged from the pre-172 baseline — the new cases are all pure
  fs+regex and add negligible wall-clock).
- `node test_audit_text_surfaces.js` — 32/32 (unaffected; `TEXT_SURFACE_SIGNALS` is a separate map from
  `PRESCAN_SIGNALS`, confirmed untouched).
- `node test_audit_app.js` — 3/3.
- `node test_seo_surface_audit.js` — 5/5.
- `node test_audit_pool_prescan.js` — 14/14.
- `node test_audit_runner.js` — 9 assertions passed.
- `node test_audit_planner_surface.js` — 9/9.
- `node test_audit_planner_flow.js` — 11/11.
- `npm ci` (node_modules was missing) — succeeded in ~3s, no package.json/lockfile diff.
- `node run-tests.js --lane=plain` — 36/36.
- `node audit-app.js` (full, untimeboxed CLI run) — completed, exit 1 (expected, item-148 class),
  `prescan.bySignal.link-target-integrity: 0`, `surfacesCovered` unchanged in shape.
- Three non-vacuity cycles (rules a, b, c), each: neuter → red transcript → restore → `md5sum` match →
  green transcript.

Did NOT run:
- **The full browser lane** (`node run-tests.js --lane=browser`, ~64 files) — exceeds the 5-minute
  foreground timebox by a wide margin (163/169/170/171 precedent: ~30min serial). The 8 audit-consuming
  browser-lane files were run individually and directly above instead (all green), which is the same
  substitute pattern 171-notes.md used.
- The remaining ~56 non-audit browser-lane files — not re-verified individually. None of them read
  `PRESCAN_SIGNALS`, `prescanStaticPages`, `home.html`'s router arrays, or `planner.js`'s `urlParams.get()`
  sites for their own assertions (only the 8 files above do), so risk is low but is an inference from
  `run-tests.js`'s own transitive-require classification, not a direct observation of each file's content.

## Instrumentation

**None** — loop tooling under the 2026-07-23 pre-traffic mandate, disclosed per the
142/149/154/155/160/169/171 precedent. Success is observable at the next heartbeat tick:
`product-loop-kit/signals/audit-findings.json`'s `prescan.bySignal` gains a `link-target-integrity` key,
currently `0` on the real committed surface — proof the gate is now automated, not proof of a new defect
(the spec's own stated framing: "this item ships a gate, not a repair").

## Candidate tickets (noticed, not fixed)

1. **`href=""` (present-but-empty) is a distinguishable-but-untested rule-(b) shape.** Design choice #9
   above covers the code path (`(empty href)` vs `(missing href)`), but no dedicated test pins the
   empty-string case specifically — it wasn't observed anywhere in the real corpus. Low priority (the two
   shapes are handled identically in every way that matters — both are suspects — this is a
   detail-string-wording completeness gap only, not a detection gap).
2. **The spec's own evidence table states "2,183 generated HTML SEO pages"** but `listLeafPages()` (which
   the spec explicitly says is unchanged, and which this item does not touch) actually scans 2181 —
   `index.html` in each of `tokens/`/`chains/` is excluded by design. Worth a one-line correction in a
   future spec/playbook pass so the next reader doesn't inherit the off-by-two.
3. **Rule (c)'s file-existence check does not (and per spec should not) validate `?pool=<id>` liveness**
   — explicitly out of scope per spec (needs a network fetch this prescan deliberately never makes). The
   spec's own measurement found 15/4,989 (0.3%) dead pool ids across 14 pages, self-healing within 24h of
   daily CI regen. If that ever becomes worth automating, it needs a SEPARATE online check against a live
   DefiLlama fetch — the spec's own explicit trap (`data/pools-snapshot.json` false-positives 4,233/4,989
   links due to the $10M-vs-$100K floor mismatch) must not be reused as a shortcut.

## Operator addenda (post-verification, 2026-07-29)

Two accuracy defects the verifier found in the record. Neither breached an acceptance criterion; both are
recorded here rather than silently patched.

4. **`test_audit_prescan.js` is a BROWSER-lane file, not a plain-lane one.** The spec's acceptance
   criterion says the tests "stay browser-free, run in the plain lane". The *new* cases are genuinely
   browser-free (pure fs+regex), but `run-tests.js --lane=browser --list` already classified the file as
   browser before this item, because of its **pre-existing** Chromium-driven criteria 3/4/6/7. So the
   spec's clause was wrong about a pre-existing fact, not about this diff. `--lane=plain` is 36/36 green
   and `node test_audit_prescan.js` is 29/29 green; the file's lane is unchanged by this item.
5. **`test_audit_prescan.js:448` holds a verbatim copy of `home.html`'s `ANALYTICS_PARAMS` declaration**
   as a `String.replace` anchor (`const ORIGINAL_DECL = "var ANALYTICS_PARAMS = […];"`), so a literal
   grep for `'poolTypes'` over the diff does hit something. The criterion bans a second *allow-list* that
   can drift silently; this is a test-only replace-anchor guarded by
   `assert(homeOriginal.includes(ORIGINAL_DECL), 'home.html moved out from under this test')`, so it
   fails loudly instead of rotting, and the detector itself contains no param literal. The verifier
   judged the criterion met on that basis and noted a minimal anchor (replacing only `"'app']"`) would
   remove the ambiguity — worth doing if this test is ever touched again.
