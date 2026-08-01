# 198 — build notes

Status: build complete, not committed/pushed (per the build agent's instructions — the operator commits).

## What changed

**`audit-app.js`** (+47/-18 vs `origin/main`):

- Added `I18N_LATIN_LETTER = /[A-Za-z]/` next to `I18N_HANGUL`, with a comment stating why it exists
  (without it, dropping the byte-identity gate would make a non-linguistic KO value like `"$100"` a
  suspect the moment it contains no Hangul) and the accepted blind spot (a KO value made purely of
  digits/punctuation that should have been translated is not detectable by this rule — accepted, because
  such a value carries no English prose to be stale).
- Renamed `I18N_IDENTICAL_ALLOWLIST` → `I18N_UNTRANSLATED_ALLOWLIST` at every site: the declaration, both
  reads inside `prescanI18n()` (the `allowlistSize` line and the Rule 2 lookup), `emptyI18nResult()`, and
  the `module.exports` block (constant + its comment). No compat alias kept — confirmed by grep that only
  `audit-app.js` and `test_audit_i18n_parity.js` reference the name; there is no other importer.
- Rewrote Rule 2's predicate: deleted `if (enVal !== koVal) continue;`, kept the Hangul check, added the
  Latin-letter check, kept the allowlist check. The `detail` string still says "byte-identical to en" when
  that happens to be true (computed via a local `identical` var) — real information, just no longer part of
  the gate.
- Updated the Rule 2 block comment to state the shipped predicate and explain, in the same breath, *why* it
  is keyed on the KO value alone: a property of the pair (byte-identity) goes silent exactly when the pair
  drifts.
- Did **not** touch the historical top-of-section comment (the one starting "i18n value-honesty prescan
  (item 190)") — it describes the original 190 bug narrative, which is still accurate as history, not as a
  description of the current predicate.

**`test_audit_i18n_parity.js`** (+119/-15 vs `origin/main`, now 298 lines, 16 tests):

- Rewrote the file header to explain what 198 changed and why (the identity gate vs. the KO-value-alone
  predicate, and the rename).
- Renamed `I18N_IDENTICAL_ALLOWLIST` → `I18N_UNTRANSLATED_ALLOWLIST` at every use site except the one
  place in the new header prose that intentionally names the *old* constant for historical contrast (rename
  narrative reads "renamed the exported allowlist constant from I18N_IDENTICAL_ALLOWLIST to
  I18N_UNTRANSLATED_ALLOWLIST to match" — both names appear there on purpose).
- **Inverted** the old test at (former) line 116 — "a KO value that differs from EN is NOT reported, even
  with no Hangul" encoded the exact bug. Replaced with "the reworded-English case IS flagged" (EN
  `Powered by` / KO `Powered by the DefiLlama feed` → suspect).
- **Added** "the trailing-space miss is closed" (EN `Powered by` / KO `Powered by ` with one trailing
  space): asserts the new predicate flags it, and asserts inline that `dict.en.landing.x !==
  dict.ko.landing.x` — i.e. that the fixture is *not* byte-identical, which is what makes it a miss under
  the old `en === ko` predicate. The test names the class it closes rather than merely passing.
- **Added** "the false positive is gone" (EN `$100` / KO `$100`): asserts it is not a suspect AND asserts
  `landing.price` is not on `I18N_UNTRANSLATED_ALLOWLIST` — proves the false positive is eliminated by the
  Latin-letter conjunct, not papered over with an allowlist entry.
- **Added** the positive control on real historical bytes (`git show 648401297:translations.js`, the
  parent of `dc2f947cc`), written to a `fs.mkdtempSync` temp file, `require()`d, fed to `prescanI18n()`.
  Asserts both `landing.footerPoweredBy` and `landing.footerMadeWith` are suspects with
  `signal === 'en-ko-parity'` and `severity === 'P1'`. Cleans up the temp dir in `finally`. If `git show`
  throws, the test throws a loud, named failure ("POSITIVE CONTROL COULD NOT BE EXECUTED — this is a hard
  failure, not a skip") rather than silently passing/skipping.
- Kept all pre-existing tests unchanged in substance (real-dictionary zero-suspects + allowlistSize===24,
  the Hangul-value test, the exact-key-path test, the flatten test, the non-string-leaf test, the four
  loader-robustness tests) apart from the mechanical rename. The `/byte-identical/` detail-string assertion
  in the very first positive-control test (identical-value fixture) still passes unmodified — the new
  detail wording (`ko value contains no Hangul and is byte-identical to en: "..."`) still contains the
  literal substring "byte-identical".

**`product-loop-kit/playbooks/product-audit.md`** (+19/-12): rewrote class 5(2) in place (no duplication)
to state the shipped predicate — no Hangul AND at least one Latin letter, key path not allowlisted;
byte-identity is *reported* in the detail but is not part of the gate — and to explain why keying on
sameness makes the detector go silent exactly when an EN reword leaves KO stale. Also fixed the Hangul
character class typo the spec called out: the playbook read `/[가-힯ᄀ-ᇿ㄰-㆏]/` (U+D7AF, past the end of the
real Hangul syllable block) where the code has always read `/[가-힣ᄀ-ᇿ㄰-㆏]/` (U+D7A3, the actual last
precomposed syllable) — aligned the playbook to the code. 5(1) and 5(3) untouched. Provenance is woven into
5(2)'s own text ("item 198, 2026-08-01, correcting this playbook's own original wording") rather than added
as a separate line, since the correction narrative already names the item and date inline.

## Deviation: the Latin-letter conjunct is an addition, not present in the playbook's original wording

The playbook's pre-198 wording of 5(2) (quoted in spec 198's own evidence section) said only: *"A KO value
byte-identical to its EN value AND containing no Hangul is untranslated."* Neither that sentence nor spec
190's shipped code ever had a Latin-letter conjunct — spec 198's own "Change" section (point 1) also only
asks for `!HANGUL.test(ko)`, no third conjunct.

The Latin-letter conjunct (`I18N_LATIN_LETTER.test(koVal)`) is something this build **added**, forced by
spec 198's own acceptance criterion 4 ("the false positive is gone... requires no allowlist entry"). Without
it, dropping the byte-identity gate turns *any* no-Hangul KO value into a suspect — including bare figures,
years, dashes, currency amounts — each of which would then need an allowlist entry it should never have
needed, which is exactly the failure mode the allowlist's own doc comment calls out ("a gate relaxation
wearing a maintenance costume"). Requiring at least one Latin letter restricts suspects to values that
actually carry translatable English prose, which is what the predicate is trying to detect in the first
place.

**The blind spot this accepts, named plainly:** a KO value made entirely of digits and/or punctuation that
*should* have been translated (there is no real-world example of this in the current dictionary — every KO
string that should be Korean prose contains at least one Hangul character in practice) is invisible to this
rule. This is judged acceptable because such a value, by construction, carries no English prose to be
"stale" — the harm the gate exists to catch (English text sitting where Korean should be) cannot occur in a
value with no letters at all.

## Allowlist re-derivation: 24 in, 24 out, zero removed

Spec 198 asked for the allowlist to be re-derived against the new predicate and for any entry the new
predicate no longer flags to be identified. Measured directly (script below, run against the real
`translations.js`):

```
allowlist size: 24
still would-be-flagged (thus still needed): 24
no longer flaggable (stale entries): []
```

Every one of the 24 entries is a brand name or acronym written in Latin letters with zero Hangul — the same
property that made each of them a suspect under the *old* `en === ko` predicate is exactly the property
(`no-Hangul AND has-Latin-letter`) that makes each of them a suspect under the *new* one. Spec 198's "cheap
win" hypothesis — that a no-Hangul-based predicate would let the allowlist shrink because a bare figure like
`$100` is no longer a suspect at all — did not materialize, because there was never a bare-figure entry ON
the allowlist to begin with (evidence 4 in the spec already established the old identical-set and
no-Hangul-set were the same 24, all brand/acronym). Zero removed is the honest answer, not a missed
cleanup: the allowlist's *contents* were never the problem 198 fixed; the *predicate* that decided what
needed an allowlist entry was.

## Non-vacuity: three cycles, one sub-rule at a time

Baseline `md5sum audit-app.js` before starting (and confirmed byte-identical after every restore):
`9cc2a918676cfa7c2da4c7c44d1dfcbe`.

Each cycle disabled exactly one `continue`-guard in Rule 2's loop (commented it out), re-ran
`node test_audit_i18n_parity.js`, recorded which assertions turned red, then restored the line and
re-confirmed the md5sum.

**Cycle (i) — neutered the Hangul class** (`if (I18N_HANGUL.test(koVal)) continue;` removed):
`14 passed, 2 failed`. Red set:
- `missing-in-EN direction is also reported (ko has an extra key en does not)` — the fixture's
  `planner.a: 'A 코리안'` (has BOTH a Latin letter and Hangul, so it is properly translated mixed-language
  text) started getting flagged once nothing excluded genuinely-Korean values.
- `against the REAL translations.js: suspects === 0 after Leg A...` — the real dictionary flooded with ~50
  suspects: every genuinely Korean string in `translations.js` that happens to contain a Latin acronym,
  brand name, or number embedded in Korean prose (`"30일 평균 APY"`, `"ETH 스테이킹"`, etc.) got flagged, because
  only the Latin-letter and allowlist checks remained and neither excludes real Korean.

Restored; `md5sum` matched the baseline.

**Cycle (ii) — neutered the Latin-letter conjunct** (`if (!I18N_LATIN_LETTER.test(koVal)) continue;`
removed): `15 passed, 1 failed`. Red set:
- `the false positive is gone: a bare figure identical in both languages is NOT a suspect and needs no
  allowlist entry` — EN `$100` / KO `$100` started getting flagged again, since nothing excluded
  non-linguistic values once the Latin-letter check was gone.

Nothing else went red — the real dictionary stayed clean, meaning there is no bare-figure-only KO value
anywhere in `translations.js` today whose exclusion depended solely on this conjunct (consistent with "zero
entries removed" above — the allowlist never needed to shelter one).

Restored; `md5sum` matched the baseline.

**Cycle (iii) — neutered the allowlist lookup**
(`if (Object.prototype.hasOwnProperty.call(I18N_UNTRANSLATED_ALLOWLIST, key)) continue;` removed):
`13 passed, 3 failed`. Red set:
- `allowlist does not swallow real findings: keys that ARE on the real allowlist stay silent, a
  non-allowlisted untranslated value in the same scan still fires` — `tvl` and `planner.goalMax` started
  getting flagged.
- `allowlist is exact-key-path, not prefix/substring: allowlisting planner.goalMax must NOT silence
  planner.goalMaxPlus` — `planner.goalMax` started getting flagged (the assertion that it must stay silent).
- `against the REAL translations.js: suspects === 0 after Leg A...` — all 24 real allowlisted brand/acronym
  values (`Claude Pro`, `Spotify`, `TVL`, etc.) started getting flagged.

Restored; `md5sum` matched the baseline (re-confirmed a final time after cycle iii: `9cc2a918676cfa7c2da4c7c44d1dfcbe`).

Each cycle lost exactly the cases that depend on the neutered rule and kept the others green — no cycle's
red set overlapped with another's except through the shared "real dictionary clean" assertion, which is
expected since all three rules jointly keep that dictionary clean.

## Measured real-dictionary numbers

```
node -e "const{prescanI18n,I18N_UNTRANSLATED_ALLOWLIST}=require('./audit-app.js');const r=prescanI18n();console.log(JSON.stringify({scanned:r.scanned,suspectCount:r.suspects.length,allowlistSize:r.allowlistSize,suspects:r.suspects}))"
```
→ `{"scanned":543,"suspectCount":0,"allowlistSize":24,"suspects":[]}`

Matches spec 198 acceptance criterion 5 (true negative on the committed dictionary) and evidence 4's
543-key / 24-allowlist figures exactly.

## Test results

- `node test_audit_i18n_parity.js`: **16 passed, 0 failed** (12 pre-existing tests carried over/updated + 4
  new: reworded-English, trailing-space, false-positive-gone, real-historical-bytes positive control).
- `node test_audit_prescan.js`: **51 passed, 0 failed** (sibling detector, unaffected — confirms no
  breakage from the rename/predicate change).
- `node test_audit_app.js`: **3 passed, 0 failed** (sibling detector, unaffected).
- `package.json`'s `test:serial` already lists `node test_audit_i18n_parity.js` (grepped, confirmed present
  — not assumed, not re-added).

## What was not done / could not run

- **`node audit-app.js` (the full CLI/browser lane) was not run** — the task explicitly said it is not
  required for this item (slow, browser lane), and the direct `prescanI18n()` invocation above covers the
  same code path this item touches.
- `translations.js` was not touched, per the hard constraint. The new predicate found **no live instance**
  in the current dictionary (suspectCount 0) — nothing to report.
- No allowlist entries were added or removed. No other product file, generator, or generated SEO surface
  was touched. No `package.json` change (registration confirmed pre-existing). No new dependency.
- Everything the task asked me to run, I was able to run and none of it needed to be killed for exceeding
  the 5-minute timebox (`test_audit_prescan.js` and `test_audit_app.js` both completed inside it).
- One thing worth flagging honestly: the working tree carries a pre-existing commit
  (`ff511c7a8`, "wip(198): interim checkpoint — build agent in flight, to be squashed before push") that
  already contains code matching this build's `audit-app.js`/`test_audit_i18n_parity.js` edits. This build
  did not issue any `git commit` — the commit was already present in the branch history when this session's
  work began. Flagging it so the operator is aware before squashing/pushing.

## Round-1 verifier finding, fixed before merge (test-only)

The verifier returned **PASS 9/9, tier HIGH** — but its own independent mutation (different in kind from the
builder's three guard-removals) found a real hole in this item's own new code. It swapped the Latin-letter
conjunct's argument rather than deleting the guard:

```js
- if (!I18N_LATIN_LETTER.test(koVal)) continue;
+ if (!I18N_LATIN_LETTER.test(enVal)) continue;
```

and **the whole suite stayed green, 16/16**. Nothing pinned down *which* value that conjunct must read. The
shipped code was already correct (`koVal`), so this was never a live bug — but an unpinned conjunct is a rule
that can be silently killed by a future edit, which is precisely the class item 198 exists to close. Shipping
it that way would have reproduced the item's own thesis as a defect.

Fixed with one added test (test-only; `audit-app.js` untouched, `md5sum` still
`9cc2a918676cfa7c2da4c7c44d1dfcbe` before and after):

> `the Latin-letter conjunct reads the KO value, not EN: EN is a bare figure, KO is untranslated English`

The fixture inverts the two sides — EN `"$100"` (no Latin letter), KO `"Powered by"` (Latin letters, no
Hangul). Under the correct `koVal` rule this fires; under the mutated `enVal` rule the bare-figure EN value
short-circuits the loop and the finding is lost. It also asserts the `detail` string does **not** claim
byte-identity for a non-identical pair, pinning the `identical` ternary added by this item.

Re-measured after the addition: `node test_audit_i18n_parity.js` → **17 passed, 0 failed**. Mutation replayed
by the operator: `koVal`→`enVal` → **16 passed, 1 failed**, and the one red is exactly the new test; restored,
`md5sum` byte-identical, 17/17 green again.

**Honest sequencing, stated rather than glossed:** the verifier's PASS was issued against the 16-test diff. This
17th test is an additive, test-only strengthening of acceptance criterion 7 that the verifier itself surfaced;
no product code changed after the verdict, and the risk tier (HIGH, on diff size) is unaffected.
