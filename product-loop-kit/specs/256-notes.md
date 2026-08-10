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
  top-level key, `planner.js`'s `makeT()` echoes the bare key inside the `planner` namespace, `landing.js`
  hands out the `landing` namespace object directly).
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

## Class: still open, with numbers

- **This item's own class** — "a check whose predicate is narrower than the class it guards" — is **not
  closed**. The population is every `waitForSelector`-shaped assertion in `audit-app.js`; this item converted
  exactly one of them (`dead-pool`) from presence-only to content-asserting, and added a content predicate
  that runs on all text-collecting surfaces. `grep -c "waitForSelector(" audit-app.js` → the remainder are
  untouched and each can still pass on a well-formed-but-wrong DOM.
- **Residual blind spots of what shipped**, stated with their shape rather than implied away:
  (a) a computed or interpolated key at a call site (`t(someVar)`, `t('a' + 'b')`) is in neither leg — there
  is no static string to read at scan time; (b) an inline raw key sharing a line with other prose is not
  flagged (exact-line matching, above); (c) a surface the rotation did not visit that tick is not covered —
  the spec says this explicitly and item 255 is the pre-merge source-level counterpart that does not depend
  on the rotation.
- **No traffic claim.** Per the spec's Measurement section this is a detector: no Mixpanel event, no funnel
  window, no gate. Its effect is on the loop's own error rate.

## Test status

- `node test_audit_raw_key_rendered.js` → **18 passed, 0 failed** (registered in package.json's `test:serial`,
  which `run-tests.js` parses as its single source of truth — an unregistered test file is not a gate).
- `node test_audit_i18n_parity.js` → **15 passed, 2 failed**. Both failures are **pre-existing on the base
  branch**, independently confirmed by running the same file in a clean worktree at `origin/main`
  (`a44f4415d1`): identical 15/2. They are (i) `resultsColApy`/`resultsColTvl` missing from the untranslated
  allowlist — that is backlog item **248**, READY and unbuilt — and (ii) `git show 648401297:translations.js`
  failing on this shallow clone. Neither touches `prescanI18n`, which this diff does not modify.
