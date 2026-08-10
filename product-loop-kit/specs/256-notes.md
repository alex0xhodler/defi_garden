# 256 — build notes (2026-08-10)

Deviations from the spec, the conservative choice made, and why. Written as the item was built.

## The one substantive deviation: the population is a UNION, not the dictionary alone

Spec §Change item 2 says: *"build the key-name set once from the parsed dictionary (both namespaces, all
nesting levels)"*. Built that first, exactly as written. Then measured it against the defect the item was
written about, and it was **blind**:

| step | what was done | result |
|---|---|---|
| 1 | `poolNotFoundTitle` deleted from BOTH namespaces of `translations.js` **and** from `translations.min.js` (what `home.html:201` actually loads) — item 253's exact shape | tree in the 253 state |
| 2 | Playwright, dead-`?pool=` surface, `.empty-state .empty-message` textContent | `"poolNotFoundTitle"` — the raw key is on screen |
| 3 | `node audit-app.js --only=dead-pool` with the dictionary-only population | **`findings: []`** — the new gate did not fire |

The reason is structural, not a coding slip: `app.js:3587` still calls `t('poolNotFoundTitle')`, but the moment
the key leaves the dictionary its NAME leaves a dictionary-derived population. **The population shrinks exactly
when the defect appears.** A gate with that property is the same shape as this item's own precedent list
(190 shipped half its conjunction, 198 fixed a predicate keyed on the pair not the value, 212 watched a
resembling mechanism, 249 was blind to 28.1% of leaves by value type) — one level further in, and it would
have shipped green while claiming to close the class that produced 253.

A dictionary-only population covers only two shapes: an **emptied/falsy value**, and a **namespace miss where
the key still exists somewhere in the dictionary**. It does not cover a key **deleted or renamed away**, which
is the shape 253 actually had.

**What was built instead:** the population is the union of two run-time-derived legs.

- **Leg A** — every key name in the parsed dictionary, both namespaces, all nesting levels: the full dotted
  path AND the bare leaf segment (both are genuinely renderable: `translations.js`'s root `t()` echoes the bare
  top-level key; `planner.js`'s `makeT()`, planner.js:888-899, `return v == null ? key : v;` on line 898,
  echoes the bare key inside the `planner` namespace on a miss). *Correction, 2026-08-10: this row previously
  also cited `landing.js`'s `getCopy()` as a bare-leaf-echo site. That was wrong — `getCopy()` (landing.js:
  57-59) returns the `landing` namespace object itself, so a missing property renders as `undefined`/blank at
  the call site, never the key's own name. Struck; the bare-leaf justification rests on planner.js's makeT()
  alone.*
- **Leg B** — every key-name literal referenced at a `t('…')` / `rootT(…, '…')` call site in the product
  sources the audited shells actually load. The FILE list is itself derived, not hand-maintained: parse
  `home.html` and `plan.html` for local `<script src>` tags **and** for the `addScript('…')` runtime injection
  home.html uses for the analytics bundle (item 244's boot-order barrier — without that second shape,
  `app.js` and `PoolDetail.js` are in no `<script src>` tag and the whole analytics app would be outside the
  population), then map `.min`/`.compiled` artifacts back to their sources when a source exists on disk.

Leg B is what survives the deletion, because it never reads the dictionary. It is derived from the mechanism
that renders the miss — the call site — not from a resemblance of it.

Real-repo numbers, all derived at run time, none hardcoded anywhere: **Leg A = 904 names** (554 dictionary
keys → dotted paths + bare leaves), **Leg B = 284 names**, **union = 904** today (every referenced key is
currently present in the dictionary — as it should be on a healthy tree; the legs diverge precisely when
something breaks). Files in the derived script population: `canonical.js, trust-rails.js,
react.production.min.js, react-dom.production.min.js, translations.js, analytics.js, planner.js, landing.js,
PoolDetail.js, app.js, brand-icons.js`.

## Non-vacuity control — which one was used, and both directions

The spec's STALE-NOTE CORRECTION applies: 253 shipped (#417) on 2026-08-09, so the free red is gone and the
red had to be **manufactured**. Recorded per the spec's requirement to say which control was used.

**RED** — deleted `poolNotFoundTitle` (dead-pool surface) and `planner.step1Question` (planner surface) from
both namespaces of `translations.js` and from `translations.min.js`, then
`node audit-app.js --only=dead-pool,planner`:

```
surfaces: [ 'dead-pool', 'planner' ]     exit: 1
{ surface: "dead-pool", viewport: "1280px", check: "i18n:raw-key-rendered", severity: "P1",
  detail: "raw translation key rendered as text: \"poolNotFoundTitle\"" }
{ surface: "planner",   viewport: "1280px", check: "i18n:raw-key-rendered", severity: "P1",
  detail: "raw translation key rendered as text: \"step1Question\"" }
```

Two surfaces, not one — this is also the spec's "reproduced on a second surface" evidence for the
runs-everywhere criterion, and `step1Question` is a NESTED (`planner.*`) key reached by its bare leaf name,
so both key shapes are exercised by the control.

**RESTORE** — `git checkout -- translations.js translations.min.js`, md5 compared against the pre-mutation
capture: byte-identical (`70255066140191a8dcfe0038aa734d2e  translations.js`,
`aa4ab7833369b3ad6715ab677f146f6f  translations.min.js`).

**GREEN** — same command on the restored tree: `surfaces: [ 'dead-pool', 'planner' ] findings: [] exit: 0`.

A third run is recorded above in the table: the same manufactured red against the **dictionary-only** first
implementation returned zero findings. That run is the evidence for the design change, and it is the reason
this item does not ship a gate that would have been vacuous against its own motivating defect.

## Conservative choices

- **Severity uniformly P1**, not promoted to P0 on north-star surfaces (`?pool=`). The spec left this to the
  builder and said uniform P1 is acceptable; a new detector that can turn a clean run into a P0 on its first
  live tick is the wrong first move. Stated here so the choice is visible, not silent.
- **Exact-LINE matching, case-sensitive, after trim** — not substring, not token-wise. A token-wise match
  would catch inline raw keys but would put short leaf names (`back`, `no`, `yes`, `share`, `title`, `tvl`,
  `years`) one lowercase rendering away from a false positive. Presence-over-precision is the failure mode
  this item exists to correct, so the predicate stays conservative in the OTHER direction.
- **No allowlist, and none needed.** The false-positive control asserts every real EN string value in the
  dictionary, rendered one per line, produces zero hits against the full union population. It passed with no
  exemptions. If a future collision appears, the answer is a design decision, not an allowlist entry — the
  I18N_UNTRANSLATED_ALLOWLIST precedent (190/198) shows how fast an exemption table becomes the gate's
  weakest point (248's own row: 8 of 26 entries are one repeated acronym pair).
- **`auditText()` was the wiring point** — the one text collector every surface driver already calls. No new
  page visits, no new rotation cost, and the presence-only `waitForSelector` check plus its
  `dead-pool-empty-state` finding are byte-untouched: this item ADDS a signal, it replaces none.

## Verifier round 1 — FAIL, and the fix (2026-08-10, same day)

The first cut of leg B's regexes shipped an overstatement: the notes/PR text above claimed leg B collects
"every key-name literal referenced at a `t('…')`/`rootT(…, '…')` call site". It did not. Two STATIC-LITERAL
shapes were missed, both confirmed by the verifier end-to-end (rewrite `app.js`'s `poolNotFoundTitle` call site
to the missed shape, delete the key from both namespaces of `translations.js` AND `translations.min.js`, render
the dead-pool surface, read `.empty-state .empty-message`'s textContent as the raw key, run
`node audit-app.js --only=dead-pool` and get `findings: []`):

| call shape | collected by round-1 regex? |
|---|---|
| `t('kA')` / `t("kB")` | yes |
| `` t(`kC`) `` (backtick) | **no** |
| `rootT(lang, 'kF')` | yes |
| `rootT(getLang(), 'kG')` (call expression as first arg) | **no** — `ROOT_T_CALL_RE`'s first-argument
  charclass was `[^,()]+`, which any parenthesis in the first argument breaks |

This is the exact delimiter axis backlog item **257** took three attempts to close (attempt 1: single-quote
only; attempt 2: widened to only the double-quote variant the verifier had just demonstrated; attempt 3:
finally closed all three JS delimiters + trailing comma/whitespace). Round 1 of this item shipped attempt-2's
predicate — closing the one instance demonstrated, not the axis.

**Fix**: `T_CALL_RE` and `ROOT_T_CALL_RE` (`audit-app.js`) now accept all three JS string delimiters
(`'`, `"`, `` ` ``) via a backreferenced group, and `ROOT_T_CALL_RE`'s first argument is widened from
`[^,()]+` to `(?:[^()]|\([^()]*\))*` — any run of non-paren characters, or a single-level-balanced `(...)`
group, repeated. This accepts a shallow call expression (`getLang()`, `a.b()`) as `rootT()`'s first argument
while staying bounded to that call: an unmatched `)` (the call's own closing paren) can never be consumed by
either alternative, so greedy backtracking finds only the real second-argument literal and never reads past
its own closing paren into a subsequent call. A backtick literal containing `${` (interpolation, not a static
literal) still cannot match either regex: the key charclass `[A-Za-z_$][\w$]*` can consume the `$` but then
needs the closing delimiter immediately, and the actual next character is `{` — every backtrack fails.
Verified directly (probe table, `test_audit_raw_key_rendered.js` header block and this item's PR doc for the
full table): `t('kA')`→`kA`, `t("kB")`→`kB`, `` t(`kC`) ``→`kC`, `t('kE', x)`→`kE`, `rootT(lang,'kF')`→`kF`,
`rootT(getLang(),'kG')`→`kG`, `t(someVar)`→(none), `t('a'+'b')`→(none), `` t(`pre${x}`) ``→(none).

Real-repo numbers after the fix, all derived at run time: **Leg A = 904**, **Leg B = 284** (unchanged — no new
real call site exists in this repo that only the widened delimiters/first-arg would have picked up; the widen
closes a gap in what the regex *would* match, not a gap in today's actual call sites), **union = 904**. Both
numbers were re-verified >= their pre-fix values per the acceptance check (refs ≥ 284, union not shrunk).

Six new permanent regression fixtures were added to `test_audit_raw_key_rendered.js` (cases 18-24 plus a
widened-leg-B-alone false-positive re-run, case 25), following item 257 attempt-3's convention: a positive
fixture is only evidence of a fix if it is first shown to have been RED against the exact prior (round-1)
regex. All 27 assertions pass; see "Test status" below.

## Class: still open, with numbers

- **This item's own class** — "a check whose predicate is narrower than the class it guards" — is **not
  closed**. The population is every `waitForSelector`-shaped assertion in `audit-app.js`; this item converted
  exactly one of them (`dead-pool`) from presence-only to content-asserting, and added a content predicate
  that runs on all text-collecting surfaces. `grep -c "waitForSelector(" audit-app.js` → the remainder are
  untouched and each can still pass on a well-formed-but-wrong DOM. Verifier round 1 (above) is itself an
  instance of the same class one level in: the FIRST leg-B regex was narrower than the shapes it claimed to
  cover.
- **Residual blind spots of what shipped**, stated with their shape rather than implied away (corrected
  2026-08-10 — "computed keys" was too coarse a catch-all; each of these is a distinct shape with nothing
  static to read at scan time, or a static value this scan does not chase):
  (a) a genuinely computed key, e.g. `t(someVar)` or `t(KEY_CONST)` — the argument is an identifier, not a
  literal; (b) a concatenation, e.g. `t('a' + 'b')` — no single literal spans the whole argument; (c) an
  escape-spelled literal, e.g. `t('pool\x4eotFoundTitle')`, or a literal built via `String.fromCharCode(...)`
  — the regex reads the literal's source text, not its evaluated value; (d) a key reached only through an
  alias or a named constant assigned elsewhere (`const k = 'poolNotFoundTitle'; t(k)`) — the literal exists in
  the file but not at the call site itself; (e) an inline raw key sharing a line with other prose is not
  flagged (exact-line matching, `scanRawRenderedKeys()`'s own doc comment); (f) a surface the rotation did not
  visit that tick is not covered — the spec says this explicitly and item 255 is the pre-merge source-level
  counterpart that does not depend on the rotation.
- **Two additional disclosures surfaced by the verifier, stated plainly:**
  (g) `collectRenderedScriptSources()`'s shell-path default (`home.html`, `plan.html`) is HARDCODED — only the
  script list *under* each shell is derived by walking that shell's markup; nothing ties the two-shell default
  to the audit's own list of surface URLs, so a hypothetical third shell would silently sit outside leg B's
  file population until this default is hand-updated. Not a live hole today: `tokens/*.html` and
  `stories/*.html` (verified directly) carry only the absolute `<script src="https://www.defi.garden/
  analytics.js">` tag and zero `t('` call sites, so there is nothing on those pages for leg B to currently
  miss — but the mechanism is a hardcoded list, not a derived one.
  (h) `auditText()` — the collector this item's predicate is wired into — is **not** called by the
  `s.kind === 'loading'` surface driver branch (`audit-app.js`, the `grid-loading` surface): that branch
  returns its findings directly before `auditText()` is ever reached, so a raw key rendered only during that
  surface's forced-live loading window sits outside this item's predicate entirely.
- **No traffic claim.** Per the spec's Measurement section this is a detector: no Mixpanel event, no funnel
  window, no gate. Its effect is on the loop's own error rate.

## Test status

- `node test_audit_raw_key_rendered.js` → **27 passed, 0 failed** (was 18 passed before the verifier round 1
  fix added 9 more: 8 delimiter/first-arg regression fixtures plus a widened-leg-B-alone false-positive
  re-run — see "Verifier round 1" above). Registered in package.json's `test:serial`, which `run-tests.js`
  parses as its single source of truth — an unregistered test file is not a gate.
- `node test_audit_i18n_parity.js` → **15 passed, 2 failed**. Both failures are **pre-existing on the base
  branch**, independently confirmed by running the same file in a clean worktree at `origin/main`
  (`a44f4415d1`): identical 15/2. They are (i) `resultsColApy`/`resultsColTvl` missing from the untranslated
  allowlist — that is backlog item **248**, READY and unbuilt — and (ii) `git show 648401297:translations.js`
  failing on this shallow clone. Neither touches `prescanI18n`, which this diff does not modify.
