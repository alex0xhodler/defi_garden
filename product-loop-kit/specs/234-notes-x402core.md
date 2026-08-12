# 234 — non-vacuity evidence, `edge/x402-core.js` / `test_x402_core.js`

Spec 234's mandatory non-vacuity proof (acceptance criterion: "neuter the 402
gate ... -> RED; byte-identical restore -> green", generalized per the build
brief's item 8 to four separate gate-critical predicates, each neutered and
restored SEPARATELY, in-session). `edge/x402-core.js` is a brand-new,
not-yet-committed file this item adds, so "restore" below means restoring
from a pre-mutation `cp` backup (`/tmp/.../x402-core.js.orig`), verified
byte-identical by `md5sum`, not `git checkout` (there is no prior committed
version to check out).

Baseline (unmutated) file hash, held constant across all four mutations:

```
7702c5d25cf01b84ba695a87e360f7e0  edge/x402-core.js
```

Baseline test run: `test_x402_core.js: 174/174 assertions passed`, exit 0.

---

## Mutation (a): the amount check

**Target**: `verifyPayment`'s underpayment guard, `edge/x402-core.js:417`.

```
- if (paidAmount === null || requiredAmount === null || paidAmount < requiredAmount) {
+ if (paidAmount === null || requiredAmount === null || false && paidAmount < requiredAmount) {
```

Effect: an underpaid amount can never trigger the guard again (short-circuited
by the literal `false`), while a genuinely missing/unparseable amount
(`paidAmount === null` / `requiredAmount === null`) still does — a surgical,
single-branch neuter.

Post-mutation hash: `5a332e0eddbd19e07b6bfedec30a8305  edge/x402-core.js`

**RED**:
```
H. verifyPayment — every branch, no network
test_x402_core.js: FAILED after 113/114 assertions passed
AssertionError [ERR_ASSERTION]: underpayment: rejected
+ actual - expected

+ 'paid_test'
- 'rejected'

    at eq (/home/user/defi_garden/test_x402_core.js:24:42)
    at runAsyncSections (/home/user/defi_garden/test_x402_core.js:336:3)
```
Exactly the assertion that exercises the amount check (H5, "underpayment:
rejected") fails, and fails in the correct direction — an underpayment is now
accepted as `paid_test` instead of rejected.

**Restore + verify**:
```
$ cp /tmp/x402-core.js.orig edge/x402-core.js
$ md5sum edge/x402-core.js
7702c5d25cf01b84ba695a87e360f7e0  edge/x402-core.js   # == baseline, byte-identical
```

**GREEN**: `test_x402_core.js: 174/174 assertions passed`, exit 0.

---

## Mutation (b): the resource/network match

**Target**: `verifyPayment`'s network-match guard, `edge/x402-core.js:408`.

```
- if (payload.network !== requirement.network) {
+ if (false && payload.network !== requirement.network) {
```

**First attempt exposed a real gap in the test itself, not the source** —
disclosed rather than hidden. The original H4 network-mismatch case used a
*mainnet-shaped* mismatched network (`'polygon-mainnet'`) against the
`base-sepolia` challenge built by default. With the match check neutered,
that mismatched payload still fell through to the separate test-vs-mainnet
gate (`isTestNetwork('polygon-mainnet')` → false) and was rejected for an
*unrelated* reason — the assertion stayed green even with the real predicate
dead:

```
$ node test_x402_core.js 2>&1 | tail -5
K. no hardcoded credential in edge/x402-core.js
test_x402_core.js: 174/174 assertions passed   # WRONG — should have gone red, and did not
```

Fixed the test (`test_x402_core.js`, H4's network-mismatch case): the
mismatched network must ALSO be test-network-shaped
(`'ethereum-sepolia'` vs. the challenge's `'base-sepolia'`) so that only the
match predicate — not the separate mainnet-vs-test gate — can catch the
mismatch. Re-baselined (test-only edit; source untouched, hash unchanged):

```
$ node test_x402_core.js 2>&1 | tail -3
test_x402_core.js: 174/174 assertions passed
$ md5sum edge/x402-core.js
7702c5d25cf01b84ba695a87e360f7e0  edge/x402-core.js   # unchanged — only the test file was edited
```

Re-ran the mutation against the corrected test:

Post-mutation hash: `835acb84a6442aa06391eff8da7bffd1  edge/x402-core.js`

**RED**:
```
H. verifyPayment — every branch, no network
test_x402_core.js: FAILED after 111/112 assertions passed
AssertionError [ERR_ASSERTION]: network mismatch vs challenge requirement (both sides test-network-shaped, so only the MATCH check can catch this): rejected
+ actual - expected

+ 'paid_test'
- 'rejected'

    at eq (/home/user/defi_garden/test_x402_core.js:24:42)
    at runAsyncSections (/home/user/defi_garden/test_x402_core.js:334:3)
```

**Restore + verify**:
```
$ cp /tmp/x402-core.js.orig edge/x402-core.js
$ md5sum edge/x402-core.js
7702c5d25cf01b84ba695a87e360f7e0  edge/x402-core.js   # == baseline, byte-identical
```

**GREEN**: `test_x402_core.js: 174/174 assertions passed`, exit 0.

---

## Mutation (c): the live-mode facilitator `isValid` check

**Target**: `verifyPayment`'s fail-closed facilitator-response guard,
`edge/x402-core.js:480`.

```
- if (!body || body.isValid !== true) {
+ if (false) {
```

Effect: any facilitator response (including an explicit `isValid:false`, a
non-boolean truthy value, or a missing body) is now treated as valid —
exactly the "always-200 mutant" shape the spec's acceptance criterion names,
applied to the live-mode payment-verification gate instead of an HTTP-level
402 gate (this module has no HTTP layer of its own; this is its analogous
gate-critical predicate).

Post-mutation hash: `defd44accbeae8a6e14c055ba2fc8b7d  edge/x402-core.js`

**RED**:
```
H. verifyPayment — every branch, no network
test_x402_core.js: FAILED after 127/128 assertions passed
AssertionError [ERR_ASSERTION]: live mode, facilitator isValid:false: rejected

'paid' !== 'rejected'

    at eq (/home/user/defi_garden/test_x402_core.js:24:42)
    at runAsyncSections (/home/user/defi_garden/test_x402_core.js:431:3)
```

**Restore + verify**:
```
$ cp /tmp/x402-core.js.orig edge/x402-core.js
$ md5sum edge/x402-core.js
7702c5d25cf01b84ba695a87e360f7e0  edge/x402-core.js   # == baseline, byte-identical
```

**GREEN**: `test_x402_core.js: 174/174 assertions passed`, exit 0.

---

## Mutation (d): the default-paid fallback

**Target**: `classifyRoute`'s fallback tier constant, `edge/x402-core.js:171`.

```
- const DEFAULT_TIER = 'paid';
+ const DEFAULT_TIER = 'free';
```

Effect: an existing-but-unlisted route (spec 234's central "a new
computed-KPI endpoint added later must default into the paid class, not
silently ship free" requirement) now classifies free instead of paid — the
exact regression class this item exists to prevent.

Post-mutation hash: `994184f65dc8f1adf8338c0e64d1ccc4  edge/x402-core.js`

**RED**:
```
AssertionError [ERR_ASSERTION]
    at eq (/home/user/defi_garden/test_x402_core.js:24:42)
    at Object.<anonymous> (/home/user/defi_garden/test_x402_core.js:134:1)
...
  actual: 'free',
  expected: 'paid',
  operator: 'strictEqual',
```
(Section E's `eq(unlistedResult.tier, 'paid', 'an existing-but-unlisted route
classifies PAID')`, `test_x402_core.js:134` — the file throws synchronously
at that point, before reaching the async section, so the run aborts there
rather than printing a final tally; the assertion failure itself is the
proof.)

**Restore + verify**:
```
$ cp /tmp/x402-core.js.orig edge/x402-core.js
$ md5sum edge/x402-core.js
7702c5d25cf01b84ba695a87e360f7e0  edge/x402-core.js   # == baseline, byte-identical
```

**GREEN**: `test_x402_core.js: 174/174 assertions passed`, exit 0.

---

## Summary

| Mutation | Target predicate | Line | RED assertion that caught it | Restored hash matches baseline |
|---|---|---|---|---|
| (a) | amount check (`paidAmount < requiredAmount`) | x402-core.js:417 | H5 underpayment | yes |
| (b) | resource/network match (`payload.network !== requirement.network`) | x402-core.js:408 | H4 network mismatch (test fixed first — see above) | yes |
| (c) | live-mode facilitator `isValid` check | x402-core.js:480 | H9 facilitator isValid:false | yes |
| (d) | default-paid fallback (`DEFAULT_TIER`) | x402-core.js:171 | E default-paid-fallback | yes |

All four sub-rules go RED when neutered individually, and the file returns
to the exact baseline hash (`7702c5d25cf01b84ba695a87e360f7e0`) after each
restore, confirmed GREEN (174/174) every time. Mutation (b)'s first attempt
also surfaced and fixed a real vacuity gap in `test_x402_core.js` itself
(the original H4 case was inadvertently shadowed by an unrelated gate) —
left in this record rather than silently rewritten, per the same "a check
never shown to fail is not evidence of health" discipline
`test_test_registry.js` documents.
