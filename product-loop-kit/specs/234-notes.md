# 234 — WIRING leg implementation notes

Built 2026-08-11, branch `claude/loop-234`. This is the WIRING leg over the
two already-shipped pure modules (`edge/x402-core.js`, `test_x402_core.js`,
174 assertions; `edge/web-bot-auth-core.js`, `test_web_bot_auth.js`, 81
assertions — both treated as fixed API, neither touched). Deliverables:
`edge/api-core.js` (modified — `/api/pricing` route), `edge/agent-log.mjs`
(modified — the gate + logging), `edge/agent-log-core.js` (modified —
`PAYMENT_STATUSES`/`mapPaymentStatus`/`buildRow` extension),
`edge/schema.sql` (modified — the migration), `edge/wrangler.toml`
(modified — env var comments), `edge/API.md` / `edge/MCP.md` /
`edge/DEPLOY.md` (modified — deltas), `edge/X402.md` (new — the payment
contract), `test_x402_gate.js` (new, 194 assertions), `test_agent_log.js`
(modified — one line added to its DEPLOY.md allowlist, see "Deviations"
below), `package.json` (modified — three tests appended to `test:serial`).
Related non-vacuity records for the two pure modules this item builds on:
`234-notes-x402core.md`, `234-notes-webbotauth.md` (both pre-existing,
neither touched by this leg).

## Deviations from spec 234, and why

### 1. `/api/pricing` is NOT added to `edge/api-core.js`'s `ENDPOINTS` array

> **SUPERSEDED 2026-08-11 — this deviation was reversed as a follow-up fix.**
> The trade described below (route real + documented, but left out of
> `ENDPOINTS` to dodge a hardcoded test exception literal) was overruled by
> the coordinator. See "Follow-up fix (2026-08-11) — Deviation 1 reversed"
> at the end of this file for what actually shipped, why, and the
> non-vacuity transcript for the new guard. The section immediately below
> is kept verbatim as the historical record of the original (wrong) trade.

The task brief read: *"Add `/api/pricing` to the `ENDPOINTS` table so it is
discoverable and so `test_x402_core.js`'s existing both-directions mirror
test keeps passing."* Empirically, doing so **breaks** that fixed test. The
mirror check (`test_x402_core.js` §B) is:

```js
const scheduleRouteIds = Object.keys(x402.PRICE_SCHEDULE).sort();
const expectedRouteIds = apiCore.ENDPOINTS.map((e) => e.path).concat(['/api/pricing']).sort();
deepEq(scheduleRouteIds, expectedRouteIds, ...);
```

It already appends `'/api/pricing'` to `ENDPOINTS`'s own path list — written
on the assumption that `ENDPOINTS` does **not** already contain that path
(matching `x402-core.js`'s own header comment: *"the brand-new
`/api/pricing` route this file classifies but does not itself serve (a
parallel item adds the route to the Worker)"*, and `buildPricingDoc()`'s own
defensive `if (!routes.some(r => r.route === '/api/pricing'))` self-
inclusion check — that check only makes sense if the input `endpoints` list
does NOT already carry the route). Verified empirically before writing any
code (`node -e "..."`, see the session transcript): adding `/api/pricing` to
`ENDPOINTS` makes `expectedRouteIds` carry two `'/api/pricing'` entries
(6+1=7) against `scheduleRouteIds`'s 6, `deepEqual` fails on length alone.

**Resolution**: `/api/pricing` is dispatched as an *additional branch* inside
`handleApiRequest` (`edge/api-core.js`), exactly where every other route is
handled, but `ENDPOINTS` itself is left untouched (still the original 5
entries). The route is still fully real, tested, and documented (`X402.md`,
`API.md`'s new "Pricing" section) — "discoverable" is satisfied via docs and
via `buildPricingDoc()`'s own self-inclusion, not via the `ENDPOINTS`
constant the fixed mirror test polices. Ran `test_x402_core.js` after this
change specifically, as instructed: `174/174 assertions passed`, unchanged.

### 2. `api-core.js` reaches `x402-core.js`/`mcp-core.js` via a LAZY `require()`, not a top-level one

Both `x402-core.js` and `mcp-core.js` already `require('./api-core.js')` at
their own top level (non-cyclic today, since `api-core.js` requires
neither of them back). A **top-level** `require('./x402-core.js')` (or
`require('./mcp-core.js')`) added to `api-core.js` would create a circular
require that CommonJS's `module.exports = {...}` (whole-object reassignment
— the pattern every file in this trio uses, not incremental
`exports.foo = ...`) resolves incorrectly: whichever side's `require()` call
happens *during* the other's still-in-progress top-level execution captures
a reference to that module's *default, still-empty* `module.exports` object
forever — reassigning `module.exports` later does not update an
already-captured reference. Confirmed by direct reasoning (not guessed):
tracing the load order for both "api-core.js required first" and
"x402-core.js required first" entry points, both directions corrupt exactly
the module whose `require()` call landed mid-load of the other.

**Resolution**: `edge/api-core.js`'s `buildPricingRoute()` calls
`require('./x402-core.js')` and `require('./mcp-core.js')` **inside its own
function body**, only reached when `/api/pricing` is actually dispatched —
i.e., only at request-serving time, always well after the entire static
require graph that got `api-core.js` itself loaded has already finished.
This is safe by construction (no module is ever "mid-load" when the lazy
require fires) and was verified to work correctly with a direct smoke test
before writing any Worker-level code:

```
$ node -e "const apiCore = require('./edge/api-core.js'); console.log(apiCore.handleApiRequest({pathname:'/api/pricing', searchParams:new URLSearchParams(), pools:[]}).body.name);"
DeFi Garden agentic-commerce pricing document
```

and confirmed both directions still work after the full change:
`test_x402_core.js` 174/174, `test_api_worker.js` 730/730, `test_mcp_server.js`
1301/1301 — none of which exercise `/api/pricing` themselves, but all of
which would fail immediately (a broken `require()` cycle corrupts the WHOLE
module, not just the new route) if this were wrong.

### 3. `test_agent_log.js`'s DEPLOY.md allowlist gained one line

`edge/DEPLOY.md`'s new §9a includes a legitimate, genuinely different
post-migration verification `SELECT ... FROM agent_reads ...` (confirms the
three new columns landed). `test_agent_log.js`'s §E anti-smuggling check
flags any `FROM agent_reads` occurrence outside the marked
`DAILY_READS_QUERY` region that isn't on its documented allowlist — by
design (that section's own header comment: *"a future editor could add a
SECOND, unmarked copy of the query ... this predicate flags any line ...
UNLESS that exact line is on the allowlist ... the allowlist itself must be
updated (a visible diff) if either line's text ever changes"*). This is the
DOCUMENTED extension mechanism, not a weakening: confirmed RED first
(pasting the new line without updating the allowlist), then added the third
line to `DEPLOY_MD_ALLOWED_AGENT_READS_LINES` with a comment explaining why,
confirmed GREEN. `test_agent_log.js: 764/764` (up from 763 pre-234;
+1 from scanning one additional real line in the grown DEPLOY.md, not from
a weakened predicate).

### 4. `Cache-Control` for the 402 — a genuine bug the acceptance test caught

`handleApi()`'s existing `headersFor(status)` computed `Cache-Control` as
`status >= 500 ? 'no-store' : 'public, max-age=300'` — correct pre-234
(only 2xx/4xx/5xx existed), but wrong once 402 exists: `402 < 500`, so it
fell into the "public, cacheable" branch, directly contradicting spec 234's
own acceptance criterion ("The 402 must never be publicly cacheable"). Found
by `test_x402_gate.js` itself during development (not by inspection first).
Fixed by widening the no-store condition to `status >= 500 || status === 402`.
This is a real, load-bearing fix to the diff this item ships, not a
pre-existing defect — recorded here rather than silently folded into the
"what I built" description.

### 5. `payment_status: 'required'` vs. `verifyPayment()`'s own `'none'`

`x402-core.js`'s `verifyPayment()` (fixed API) returns `status: 'none'` for
"no `X-PAYMENT` header presented at all." `agent-log-core.js`'s
`PAYMENT_STATUSES` (this item's own, new enum) uses `'none'` for a
*different* meaning: "the payment gate did not apply to this request at
all" (a free route, or the flag is off). Reusing `verifyPayment()`'s `'none'`
verbatim for the D1 column would have conflated "payment wasn't relevant"
with "payment was required and simply wasn't sent" — two different, useful-
to-distinguish facts for anyone reading the log. `mapPaymentStatus(result,
gateApplied)` (new, pure, exported from `agent-log-core.js`) is the single
place this remapping happens: `!gateApplied` always yields this file's own
`'none'`; `gateApplied && result.status === 'none'` (verifyPayment's
"nothing presented") yields `'required'`; every other `verifyPayment()`
status (`paid`/`paid_test`/`rejected`) passes through unchanged. Not asked
for explicitly by spec 234's literal text, but required to make the
5-value enum (`none|paid|paid_test|rejected|required`) actually distinguish
what it claims to.

### 6. Identity verification is unconditional on `X402_ENABLED`

Spec 234's Change §3 (Web Bot Auth) and its own acceptance criteria never
tie identity verification to the payment-gate flag — only the *payment*
acceptance criteria mention "ships with the live-pricing flag OFF." Territory
note 6 (spec 234's own) separately establishes identity is telemetry, never
an unlock. Read together: identity verification and logging run for every
`/api`/`/mcp` request regardless of `X402_ENABLED`, so `234`'s identity leg
starts producing real telemetry immediately on deploy, not only once a human
later flips the payment flag. This never affects what's served (identity
never gates data, in either direction) — confirmed by `test_x402_gate.js`
§I (identity checks run and log correctly with the payment gate left at its
default DARK state throughout that whole section) and is the conservative,
narrower reading, recorded here because it's a real interpretive choice.

## Non-vacuity — four mutations, each neutered and restored SEPARATELY

Baseline (unmutated) hash, held constant across all four cycles:

```
e9109ee18ebac7a307e092474ebbcc1f  edge/agent-log.mjs
```

Baseline: `test_x402_gate.js: 194/194 assertions passed`, exit 0. Each
mutation below was applied to a fresh copy of the baseline (never stacked on
a prior mutation), run against `test_x402_gate.js`, confirmed RED, restored
from a `cp`'d backup (`/tmp/agent-log.mjs.orig`), confirmed byte-identical
via `md5sum`, and confirmed GREEN again before the next cycle began. A final
`diff edge/agent-log.mjs /tmp/agent-log.mjs.orig` after all four cycles
confirmed empty (byte-identical), independent of the per-cycle md5sum
checks.

---

### Mutation (a): the `/api` paid-route gate

**Target**: `edge/agent-log.mjs:262`, the `gateApplies` computation inside
`handleApi()`.

```diff
- const gateApplies = x402Config.enabled && !!routeClassification && routeClassification.tier === 'paid';
+ const gateApplies = false; // MUTATION (a): neutered paid-route gate
```

Post-mutation hash: `fad77034513d18e394b7a6b1ed0d102a  edge/agent-log.mjs`

**RED**:
```
D. gate ENABLED — free routes stay 200, paid routes 402
test_x402_gate.js: FAILED after 38/39 assertions passed
AssertionError [ERR_ASSERTION]: ENABLED: paid route GET /api/forever-number without payment -> 402
200 !== 402
```

**Restore + verify**: `md5sum edge/agent-log.mjs` →
`e9109ee18ebac7a307e092474ebbcc1f` (== baseline, byte-identical).

**GREEN**: `test_x402_gate.js: 194/194 assertions passed`, exit 0.

---

### Mutation (b): the `/mcp` tool gate

**Target**: `edge/agent-log.mjs:448`, `handleMcp()`'s paid-tool branch
condition.

```diff
- if (toolClassification && toolClassification.tier === 'paid') {
+ if (false && toolClassification && toolClassification.tier === 'paid') { // MUTATION (b): neutered mcp tool gate
```

Post-mutation hash: `f242f55fa2d5717c57218d43ef26bcec  edge/agent-log.mjs`

**RED**:
```
F. /mcp tools/call gating — paid tool 402, free tools + tools/list normal
test_x402_gate.js: FAILED after 134/135 assertions passed
AssertionError [ERR_ASSERTION]: /mcp tools/call forever_number (paid) without payment -> 402
200 !== 402
```

**Restore + verify**: `md5sum edge/agent-log.mjs` →
`e9109ee18ebac7a307e092474ebbcc1f` (== baseline, byte-identical).

**GREEN**: `test_x402_gate.js: 194/194 assertions passed`, exit 0.

---

### Mutation (c): the enabled-flag check (the DARK-by-default guarantee)

**Target**: `edge/agent-log.mjs:262`, same line as mutation (a) — a
*different* sub-term neutered this time (dropping only `x402Config.enabled`,
leaving the route-classification checks intact — proving THIS specific term
is what makes the gate honor the flag, distinct from mutation (a)'s
"nothing gates, ever").

```diff
- const gateApplies = x402Config.enabled && !!routeClassification && routeClassification.tier === 'paid';
+ const gateApplies = !!routeClassification && routeClassification.tier === 'paid'; // MUTATION (c): dropped x402Config.enabled check
```

Post-mutation hash: `63b015f04de3ac8d0a80fac21c5a771b  edge/agent-log.mjs`

**RED**:
```
C. gate DARK by default — every route (free + paid) returns 200, no payment header, byte-identical to pre-234
test_x402_gate.js: FAILED after 21/22 assertions passed
AssertionError [ERR_ASSERTION]: DARK: GET /api/forever-number -> 200 (no env at all)
402 !== 200
```

A paid route now 402s even with `X402_ENABLED` completely unset — exactly
the regression spec 234's "ships with the live-pricing flag OFF" acceptance
criterion exists to prevent, and the earliest possible section of the
acceptance harness catches it (section C runs before D/E/F, which are only
meaningful once the flag is confirmed to actually gate).

**Restore + verify**: `md5sum edge/agent-log.mjs` →
`e9109ee18ebac7a307e092474ebbcc1f` (== baseline, byte-identical).

**GREEN**: `test_x402_gate.js: 194/194 assertions passed`, exit 0.

---

### Mutation (d): the INSERT fallback

**Target**: `edge/agent-log.mjs:544`, `insertRow()` — the try/catch around
the extended INSERT that falls back to the legacy statement.

```diff
 async function insertRow(env, row) {
-  try {
-    await env.DB.prepare(INSERT_SQL_EXTENDED).bind(
-      row.ts, row.path, row.ua, row.ua_family, row.accept, row.referer, row.status, row.bot_score, row.path_class,
-      row.agent_identity, row.identity_status, row.payment_status
-    ).run();
-    return;
-  } catch (_extendedErr) {
-    // Extended insert failed ...
-  }
-  await env.DB.prepare(INSERT_SQL_LEGACY).bind(
-    row.ts, row.path, row.ua, row.ua_family, row.accept, row.referer, row.status, row.bot_score, row.path_class
-  ).run();
+  // MUTATION (d): fallback removed — extended insert only, no try/catch.
+  await env.DB.prepare(INSERT_SQL_EXTENDED).bind(
+    row.ts, row.path, row.ua, row.ua_family, row.accept, row.referer, row.status, row.bot_score, row.path_class,
+    row.agent_identity, row.identity_status, row.payment_status
+  ).run();
 }
```

Post-mutation hash: `ebefd6a368cc4cf347f7ff02843b3138  edge/agent-log.mjs`

**RED**:
```
J. logging — legacy-INSERT fallback when the extended statement fails (pre-migration D1)
test_x402_gate.js: FAILED after 187/188 assertions passed
AssertionError [ERR_ASSERTION]: exactly one row lands, via the fallback
0 !== 1
```

The rejected extended-INSERT promise now propagates all the way out of
`logAgentRead`'s own swallow-everything `.catch(() => {})` chain being
reached — the row is silently lost entirely (`calls.length === 0`), which is
precisely Territory note 4's "every insert fails and telemetry goes silently
dark" failure mode, reproduced under test.

**Restore + verify**: `md5sum edge/agent-log.mjs` →
`e9109ee18ebac7a307e092474ebbcc1f` (== baseline, byte-identical).

**GREEN**: `test_x402_gate.js: 194/194 assertions passed`, exit 0.

---

### Summary

| Mutation | Target predicate | Line | RED assertion that caught it | Restored hash matches baseline |
|---|---|---|---|---|
| (a) | `/api` paid-route gate (`gateApplies`, whole term) | agent-log.mjs:262 | §D paid route GET 402 | yes |
| (b) | `/mcp` tool gate (`toolClassification.tier === 'paid'` branch) | agent-log.mjs:448 | §F `/mcp tools/call forever_number` 402 | yes |
| (c) | enabled-flag check (`x402Config.enabled` term only) | agent-log.mjs:262 | §C DARK-by-default 200 | yes |
| (d) | INSERT fallback (try/catch around the extended statement) | agent-log.mjs:544 | §J legacy-fallback row lands | yes |

All four sub-rules go RED when neutered individually and the file returns to
the exact baseline hash (`e9109ee18ebac7a307e092474ebbcc1f`) after every
restore, confirmed GREEN (194/194) each time, with a final whole-file `diff`
against the pre-mutation backup also confirming byte-identity independent of
the hash checks.

## Verification run, verbatim summary lines

- `node test_x402_gate.js`: `test_x402_gate.js: 194/194 assertions passed`
- `node test_x402_core.js`: `test_x402_core.js: 174/174 assertions passed` (untouched file, re-run per instructions after the `/api/pricing` change)
- `node test_web_bot_auth.js`: `81/81 assertions passed (final, including non-vacuity).` / `PASS` (untouched file)
- `node test_api_worker.js`: `test_api_worker.js: 730/730 assertions passed`
- `node test_agent_log.js`: `test_agent_log.js: 764/764 assertions passed` (764, up from 763 pre-234 — see Deviation 3)
- `node test_mcp_server.js`: `test_mcp_server.js: 1301/1301 assertions passed`
- `node test_test_registry.js`: `5/5 assertions passed`
- `node test_run_tests.js`: `26 assertions passed`
- `node test_vercelignore.js`: **FAILS**, pre-existing — confirmed via `git stash -u` (removing every 234 change, tracked AND untracked) and re-running standalone: fails identically with zero 234 changes present (same two `ko/tokens/0x0.*` / MUST-KEEP-allowlist findings, unrelated to anything in this diff). Not touched, per instructions ("fix the CODE" only applies to a regression THIS item caused).
- `node test_translations_number_format.js` (mentioned in 227-notes.md as a second pre-existing failure): also still fails, also pre-existing, also unrelated (a translation/number-formatting concern with no connection to `edge/`).
- `node run-tests.js --lane=plain`: **could not run** — this sandbox has no `node_modules` installed at all (`ls node_modules` → "No such file or directory"), which is `run-tests.js`'s own documented preflight failure mode (`NO_DEPS_MESSAGE`), not something this item's diff caused or can fix. Every individual test file was instead run directly (`node test_*.js`), which is how `run-tests.js` itself invokes each file under the hood and needs no `node_modules`.
- `node run-tests.js --list --lane=plain`: ran fine (pure introspection, no `node_modules` needed) — confirmed all three new files land in the `plain` lane: `test_x402_core.js  plain`, `test_web_bot_auth.js  plain`, `test_x402_gate.js  plain`.
- `git diff --stat -- app.js PoolDetail.js planner.js home.html plan.html style.css translations.js workers/`: empty. No product render path or `workers/` touched.
- No new npm dependency: `package.json`'s `dependencies`/`devDependencies` unchanged; only `scripts.test:serial` gained the three new files.
- No credential/account id/wallet address/handle anywhere in the diff: `grep -rnE "0x[a-fA-F0-9]{40}"` across every file this item touched or added returns nothing outside the pre-existing, already-reviewed `edge/x402-core.js` test-placeholder pattern (untouched); `edge/wrangler.toml`'s new lines are comments only, every value shown is either empty-string or an illustrative default (`"false"`, `"test"`, `"base-sepolia"`, `"{}"`), never a real value.

## What I could not do

Nothing in-scope was left undone. Out-of-scope items explicitly named
HUMAN-OWNED by spec 234 itself (not silently dropped, not attempted):
claiming the `cloudflare.pay` handle, enabling Monetization Gateway, wallet
custody/payout configuration, and flipping `X402_ENABLED`/`X402_MODE=live`
— all documented in `edge/DEPLOY.md`'s new §9 HUMAN-OWNED list, none
performed here. The actual Cloudflare deploy (this Worker + the D1
migration) is human-owned for the same credential reasons items 224/227/228
already established — `edge/DEPLOY.md` §9a documents the exact
`wrangler d1 execute` commands and their order.

---

## Follow-up fix (2026-08-11) — Deviation 1 reversed

The coordinator overruled the original Deviation 1 trade (route real +
documented, but deliberately kept out of `ENDPOINTS` to avoid breaking
`test_x402_core.js`'s mirror test's hardcoded `.concat(['/api/pricing'])`
literal). Two reasons, both from the follow-up brief, restated here because
they're the actual justification for what changed:

1. **Product**: `GET /api` is the contract document — the first thing an
   agent reads, and exactly what MCP's `explain_rails` tool returns. It
   carried no mention of pricing or of `/api/pricing` at all, so an agent
   could not discover what costs money without first probing a route and
   getting a `402`. Spec 234 §2 requires the pricing doc be discoverable
   "without a probe request." The unknown-route `404` body (which also
   lists `endpoints`) had the same gap.
2. **Guard integrity**: a route that EXISTS but is absent from the route
   table, with the guard's own test papering over the gap via a hardcoded
   `.concat(['/api/pricing'])` literal, is the mirror-drift class
   `product-loop-kit/RAZOR.md` example 5 (item 212) is about — a check
   aimed at a resemblance of the real route table rather than the route
   table itself.

### What actually shipped

- **`edge/api-core.js`**: `/api/pricing` is now a real `ENDPOINTS` entry
  (inserted in `PRICE_SCHEDULE`'s own key order, right before
  `/api/forever-number`), `{ method: 'GET', path: '/api/pricing',
  description: '...' }`, matching house style. `ENDPOINTS` now has 6
  entries (was 5).
- **`edge/api-core.js` — `buildContractDoc()`**: gained a new
  `buildContractDocPricingBlock(pricingState)` helper, called from
  `buildContractDoc` and attached as the document's `pricing` field. It
  `require()`s `./x402-core.js` **lazily, inside the function body** — the
  exact same discipline `buildPricingRoute()` already used for the same
  circular-require reason (see the module header's still-intact
  explanation, and `buildPricingRoute`'s own comment). Content: `document`
  (a pointer at `/api/pricing`), `freeRoutes`/`paidRoutes` (derived from
  `x402Core.PRICE_SCHEDULE`/`x402Core.freeRoutes()`, never hand-typed),
  `boundary` (one sentence), and `availability` (`{ enabled, mode }` taken
  from the same optional `request.pricing` input `/api/pricing` itself
  already consumed — absent input reads as disabled/"dark", never assumed
  enabled, exactly like `buildPricingRoute`). `handleApiRequest`'s `/api`
  branch now passes `req.pricing` through: `buildContractDoc(req.pricing)`.
  This is a pointer plus derived lists, not a second copy of the pricing
  document — the full schedule with `reason` strings and MCP tool tiers
  still lives only at `/api/pricing` (`buildPricingDoc()`).
- **`edge/api-core.js`'s "8b." header comment**: the part justifying the
  `ENDPOINTS` omission is replaced with a short pointer at this section
  (what changed and why); the circular-require explanation (lazy
  `require()` inside the function body, why a top-level one would corrupt
  the module) is untouched — it's still correct and still load-bearing for
  `buildPricingRoute()` and the new `buildContractDocPricingBlock()` alike.
- **`edge/x402-core.js`** (not in the original file list for this
  follow-up, touched anyway — comment-only, no logic change): the
  `buildPricingDoc()` self-inclusion guard's comment said "`/api/pricing`
  has no `ENDPOINTS` entry in `api-core.js`," which became false the moment
  `ENDPOINTS` gained one. Left uncorrected, that comment would have been
  exactly the kind of stale-documentation drift this whole fix exists to
  eliminate, so it was reworded to describe the guard's now-defensive-only
  role (a fallback for any caller — e.g. a hand-built test fixture — whose
  `endpoints` list doesn't already carry the route). The guard's actual
  behavior (the `if (!routes.some(...))` check and push) is byte-for-byte
  unchanged.
- **`edge/API.md`**: the "Pricing" section's claim that `/api/pricing` is
  "deliberately not listed" in `endpoints` is corrected to say it IS
  listed, with a short pointer at this file's history; the `GET /api`
  endpoint description gained a mention of the new `pricing` block's shape.
- **`test_x402_core.js`** (§B, the mirror test): rewritten to assert
  genuine set equality between `PRICE_SCHEDULE`'s route-id keys and the
  REAL `apiCore.ENDPOINTS.map(e => e.path)` — deduped, sorted, both
  directions, each direction its own `deepEq` with a message naming the
  offending route(s), plus a restated direct set-equality `deepEq` as
  belt-and-braces. No `.concat(['/api/pricing'])` exception literal
  anywhere in the file anymore (also fixed in §E's `computeMirrorGaps`
  self-defeat helper, which rebuilds §B's exact logic — leaving the old
  concat there while removing it from §B would have made the self-defeat
  case test a DIFFERENT, more lenient check than the real one). A new
  assertion was added ahead of the set-equality checks: `apiCore.ENDPOINTS`
  contains no duplicate path (the failure mode a hardcoded concat exception
  could mask — a duplicate `ENDPOINTS` entry could produce a
  mismatched-length array that still happened to sort-and-`deepEqual`
  "correctly" against a schedule with a matching duplicate key). Every
  other assertion in the file is untouched; the file's own self-defeat case
  (§E, proving the mirror check can actually fail) still passes, now
  exercising the corrected logic. Total: **175/175** (up from 174 — the
  +1 is the new duplicate-path assertion; the `/api/pricing`
  count-of-endpoints/tools sanity numbers in §A's log line also shifted
  from 5→6 endpoints as a side effect of population growth, not a new
  assertion).
- **`test_x402_gate.js`**: the DARK-mode route-population loop (§C) already
  special-cased `/api/pricing` out of its generic byte-parity comparison
  (it's a genuinely new route with no "pre-234 shape" to compare against) —
  that logic is untouched, it was never about `ENDPOINTS` membership. One
  new assertion block was added to §C: the real Worker's `GET /api`
  response (gate DARK) carries a `pricing` block that (a) names
  `/api/pricing` as `document`, (b) honestly reports
  `availability.enabled: false` when dark, and (c) whose `freeRoutes`/
  `paidRoutes` set-equal `PRICE_SCHEDULE`'s own free/paid split, BOTH
  directions, derived at test time via the same `FREE_ROUTE_IDS`/
  `PAID_ROUTE_IDS` §A already derives — never a hardcoded restatement of
  the schedule. Total: **202/202** (up from 194 — 8 new assertions: the
  `pricing` block existence/shape check, the `document` pointer check, the
  `availability.enabled` check, and 4 `deq` gap checks across both
  free/paid directions, plus one `ok` on the block being an object).
- **`test_api_worker.js`**: one message-string fix (not a new assertion,
  not a relaxed one) — the unknown-route 404 endpoints-list check's
  threshold and description were pinned to a literal "5" that is now
  `apiCore.ENDPOINTS.length` (still `>=`, still a real invariant, just no
  longer a stale hardcoded number now that a 6th route exists). Total:
  **730/730**, unchanged.
- **`test_x402_gate.js` / `test_api_worker.js` / `test_mcp_server.js` /
  `test_agent_log.js` / `test_web_bot_auth.js` / `test_test_registry.js`**:
  no other assertion needed to change. `test_mcp_server.js`'s own
  `ENDPOINTS`-derived checks (F0: every MCP tool route is a real
  `ENDPOINTS` path) and its `explain_rails` <-> `GET /api` parity check
  (both sides call `apiCore.handleApiRequest({ pathname: '/api', ... })`
  with no `pricing` field, so both land on the same dark-default `pricing`
  block) were unaffected by construction, not by a weakened assertion —
  confirmed by re-running the file green at 1301/1301.

### Non-vacuity — the new contract-doc pricing derivation

Target: `edge/api-core.js`'s `buildContractDocPricingBlock()`, the
`freeRoutes` derivation line.

Baseline hash: `285acb47198817f192196f08d33c5b25  edge/api-core.js`

Baseline run: `node test_x402_gate.js` → `test_x402_gate.js: 202/202
assertions passed`, exit 0.

**Mutation** — drop `/api/pricing` from the derived free list (leaving
`PRICE_SCHEDULE` itself untouched, so this is purely a derivation-logic
bug, not a schedule-data bug):

```diff
- const freeRoutes = x402Core.freeRoutes().slice().sort();
+ const freeRoutes = x402Core.freeRoutes().slice().filter(function (r) { return r !== '/api/pricing'; }).sort(); // NON-VACUITY MUTATION: drops /api/pricing from the derived free list
```

Post-mutation hash: `6c089b7d34c4b26805d68ee26b48470e  edge/api-core.js`

**RED** — `node test_x402_gate.js`:

```
A. population — PRICE_SCHEDULE, mcp-core TOOLS, data/pools-snapshot.json
  5 free routes, 1 paid route(s); 3 free tools, 1 paid tool(s)

C. gate DARK by default — every route (free + paid) returns 200, no payment header, byte-identical to pre-234
test_x402_gate.js: FAILED after 32/33 assertions passed
AssertionError [ERR_ASSERTION]: every PRICE_SCHEDULE free route must be named in GET /api pricing.freeRoutes — missing: ["/api/pricing"]
+ actual - expected

+ [
+   '/api/pricing'
+ ]
- []

    at deq (/home/user/defi_garden/test_x402_gate.js:38:43)
    at /home/user/defi_garden/test_x402_gate.js:348:5
```

**Restore + verify**: `cp` back from the pre-mutation backup, then
`md5sum edge/api-core.js` → `285acb47198817f192196f08d33c5b25` (== baseline,
byte-identical); `diff edge/api-core.js /tmp/api-core.js.baseline` → empty.

**GREEN** — `node test_x402_gate.js`: `test_x402_gate.js: 202/202
assertions passed`, exit 0.

### Verification run, verbatim summary lines (this follow-up)

- `node test_x402_core.js`: `test_x402_core.js: 175/175 assertions passed`
- `node test_x402_gate.js`: `test_x402_gate.js: 202/202 assertions passed`
- `node test_api_worker.js`: `test_api_worker.js: 730/730 assertions passed`
- `node test_agent_log.js`: `test_agent_log.js: 764/764 assertions passed`
- `node test_mcp_server.js`: `test_mcp_server.js: 1301/1301 assertions passed`
- `node test_web_bot_auth.js`: `81/81 assertions passed (final, including non-vacuity).` / `PASS`
- `node test_test_registry.js`: `5/5 assertions passed`
- `git diff --stat`: `edge/API.md | 24 +++++++++++-----`, `edge/api-core.js
  | 85 ++++++++++++++++++++++++++++++++++++++---------------`,
  `edge/x402-core.js | 9 ++++--`, `test_api_worker.js | 2 +-`,
  `test_x402_core.js | 55 +++++++++++++++++++++++------------`,
  `test_x402_gate.js | 31 ++++++++++++++++++++`. Not touched:
  `edge/web-bot-auth-core.js`, `test_web_bot_auth.js`, `workers/`, any
  SEO/generated artifact, `package.json` (no new dependency).

### What I could not do (this follow-up)

Nothing in-scope was left undone.

---

## Verifier round 1 — findings and fixes

Branch `claude/loop-234`, attempt 2/3. Eight findings (three P1, three P2,
two P3) plus two "Also" items. Fixed all ten; none argued away. Every file
touched: `edge/api-core.js`, `edge/x402-core.js`, `edge/agent-log.mjs`,
`edge/agent-log-core.js`, `edge/API.md`, `edge/X402.md`, `edge/MCP.md`,
`edge/DEPLOY.md`, `test_x402_core.js`, `test_x402_gate.js`,
`product-loop-kit/specs/234-notes-webbotauth.md`. Not touched: `workers/`,
`app.js`, `planner.js`, `home.html`, `PoolDetail.js`, `translations.js`,
`package.json` (no new dependency), any generated SEO artifact.

### FAILURE 1 (P1) — default-paid was unreachable

**Root cause, confirmed exactly as the verifier described it**:
`edge/x402-core.js`'s old `matchRoute()` derived its own static route-id
list from `PRICE_SCHEDULE`'s own keys (`STATIC_ROUTE_IDS = Object.keys(PRICE_SCHEDULE).filter(...)`),
not from `edge/api-core.js`'s actual dispatcher (a chain of bare
`if (path === '/some/route') return {...}` branches inside
`handleApiRequest`). A route added directly to that if-chain — the
verifier's `/api/sharpe` example — was invisible to both `ENDPOINTS` and
`PRICE_SCHEDULE`, so `matchRoute()` returned `null` for it, and `null` means
ungated (`agent-log.mjs:262`'s old comment, and `x402-core.js`'s own header,
"NULL MEANS NO SUCH RESOURCE"). `DEFAULT_TIER = 'paid'` therefore never ran
for a route added this way, and it shipped free by omission — exactly
contradicting `edge/x402-core.js:36-39`'s and `edge/X402.md:35-40`'s claims.

**Fix, at the root (RAZOR example 5 — made the dispatcher machine-readable
instead of bolting a parser onto the side)**: `edge/api-core.js` now
exposes ONE declarative `ROUTES` table (`{ id, method, description, params?,
match(path), handle(ctx) }[]`) that `handleApiRequest` does nothing but walk
— there is no other dispatch code in that function anymore. `ENDPOINTS` is
now `ROUTES.map(...)` — DERIVED, never a second hand-typed list. A new
exported `matchRouteId(pathname)` walks the SAME table. `edge/x402-core.js`'s
`matchRoute()` now purely delegates: `return apiCore.matchRouteId(pathname);`
— the old `STATIC_ROUTE_IDS`/`POOL_ID_ROUTE_RE` derivation is gone entirely.
A route added to `ROUTES` — priced or not — is now recognized by
`matchRoute()` and classified (default-paid included) by construction,
because there is no longer a second, independently-derived id list that can
lag behind the real dispatcher.

**Guards added** (`test_x402_core.js`):
- §B2, new — a genuine THREE-WAY mirror: `apiCore.ROUTES.map(r=>r.id)` <->
  `apiCore.ENDPOINTS.map(e=>e.path)` <-> `Object.keys(x402.PRICE_SCHEDULE)`,
  all three pairs, both directions each (6 checks), via a reusable
  `computeThreeWayMirrorGaps()` helper. Three self-defeat sub-cases
  ((i) dispatcher-only route, (ii) ENDPOINTS-only route, (iii)
  schedule-only route), each proving the SPECIFIC directions it should trip
  actually do, and no others — the `test_x402_core.js:§E` pattern, extended
  to three collections.
- §B2, a direct DELEGATION probe: pushes a synthetic, unscheduled route
  (`/api/three-way-mirror-probe`) onto the REAL `apiCore.ROUTES`, confirms
  `x402.matchRoute()` recognizes it immediately (proving delegation, not
  independent derivation), pops it back out, confirms both `matchRouteId`
  and `matchRoute` agree it's gone again.
- `test_x402_gate.js` §K, new, end-to-end — the verifier's exact scenario,
  driven against the REAL Worker: pushes an `/api/sharpe` fixture route onto
  `apiCore.ROUTES` (comment: "simulates a future computed-KPI endpoint
  someone forgot to price"), confirms it classifies `paid`/`explicit:false`,
  confirms the real Worker returns `402` (never `200`) for it with the gate
  ENABLED and logs `payment_status: 'required'`, confirms it still serves
  the fixture `200` with the gate DARK, pops it back out in a `finally`, and
  re-confirms the Worker now 404s it again.

**Prose corrected**: `edge/x402-core.js`'s header comment (the boundary
paragraph) gained a "WHAT ACTUALLY MAKES THIS REACHABLE" explanation of the
mechanism and the bug it closes. `edge/X402.md`'s "The default is PAID, not
free" bullet now states the mechanism explicitly (delegates to
`api-core.js`'s live `ROUTES` table via `matchRouteId`, not to
`PRICE_SCHEDULE`'s own keys).

### FAILURE 2 (P1) — `settled=true; mode=live` claimed, nothing settles

Confirmed: `verifyPayment()` (`edge/x402-core.js`) only ever POSTs to
`<facilitator>/verify`; grepped the whole `edge/` tree for `/settle` —
zero matches anywhere. Settlement is NOT implemented (correctly — it is
money-movement, human-owned NEVER-list) but the header claimed it happened.

**Fix**: `paymentResponseHeader()` now returns `settled=false` on EVERY
branch, adding a `verified` field instead: `paid` (live) ->
`settled=false; verified=true; mode=live`; `paid_test` ->
`settled=false; verified=true; mode=test`; `rejected` ->
`settled=false; verified=false; mode=rejected`; `none`/other ->
`settled=false; verified=false; mode=none`. Updated call sites: `edge/X402.md`
("How to pay" step 4), `edge/x402-core.js:561`'s `availability.statement`
prose (`buildPricingDoc`, live-mode branch — now states plainly that this
Worker never calls `/settle`), `edge/agent-log-core.js:205`'s `'paid'`
enum-value comment (now explicit: verified, not settled). `test_x402_core.js`
§I's four assertions updated to the new strings; `test_x402_gate.js`'s two
`x-payment-response` assertions (the `/api` and `/mcp` valid-payment cases)
updated too.

Two residue bullets added to `edge/X402.md`'s "What this deliberately does
NOT do": (1) no `/settle` call is ever made, a live-mode payment is verified
but never settled by this Worker, so no funds move on our side — with the
`/verify`-vs-`/settle` protocol distinction spelled out; (2) no replay/nonce
protection — `verifyPayment()` is stateless, so the same `X-PAYMENT` header
can be replayed indefinitely against the identical resource URL; it IS
resource-scoped (a payment for `?monthly=20` correctly 402s against
`?monthly=999999`, a different `resource`), but replaying the exact same
resource+payload verifies again every time. Confirmed by reading
`verifyPayment()`: no persisted record of a "spent" payload exists anywhere
in `edge/` (no D1 write, no in-isolate set) — this is a real, load-bearing
gap for live-mode traffic, documented rather than silently fixed (fixing it
would mean adding a nonce/idempotency store, out of this item's scope).

### FAILURE 3 (P1) — paid 200 was publicly cacheable

Reproduced the measurement: pre-fix, `GET /api/forever-number?monthly=20`
with a valid test payment returned `Cache-Control: public, max-age=300`.
`edge/agent-log.mjs`'s `headersFor(status)` only special-cased `status >= 500
|| status === 402`, never the fact that the gate had actually applied to
this specific request.

**Fix**: `headersFor` now also forces `no-store` when `gateApplies` is true
(closure over the already-computed `gateApplies`, moved earlier in
`handleApi()` so it's available when `headersFor` is defined). Chose
`no-store` over `private` + `Vary: X-PAYMENT` (documented in the new
comment): `private` still lets a browser's own cache retain paid data, and
`Vary: X-PAYMENT` doesn't collapse to a clean cache key (the header's value
differs per payment payload) the way `Vary: Accept-Encoding` does — `no-store`
is unambiguous and matches the existing 402/5xx discipline on the same
route. A free route, or a paid route with the gate DARK, is unaffected
(`gateApplies` is false in both cases) and keeps the pre-234
`public, max-age=300` caching.

**Guards added** (`test_x402_gate.js`): §C's DARK-mode loop now asserts
`Cache-Control: public, max-age=300` for every route including
`/api/forever-number` (the pre-234 caching, gate dark, unaffected); §D's
free-route loop asserts the same even with the gate ENABLED (a free route
is never gated so never affected); §E's valid-payment case (gate ENABLED,
payment verified, `/api/forever-number` -> 200) now asserts
`Cache-Control: no-store` — the "gated 200 is never public" half, on the
exact same route §C proves stays public when dark.

### FAILURE 4 (P2) — CORS blocked the documented payment flow

Confirmed: `API_CORS_HEADERS`/`MCP_CORS_HEADERS` (`edge/agent-log.mjs`)
allowed only `Content-Type` and exposed nothing — a browser-origin agent
following `X402.md`'s own "How to pay" steps could not send `X-PAYMENT` or
read `X-PAYMENT-RESPONSE` back.

**Fix**: both header objects gained `Access-Control-Allow-Headers:
'Content-Type, X-PAYMENT'` and `Access-Control-Expose-Headers:
'X-PAYMENT-RESPONSE'`. `edge/API.md`'s "Caching / CORS" section and OPTIONS
preflight description updated to match.

**Guards added** (`test_x402_gate.js`): both headers asserted on the `/api`
402 (§D), the `/api` valid-payment 200 (§E), the `/mcp` 402 (§F), and the
`/mcp` valid-payment 200 (§F).

### FAILURE 5 (P2) — false `edge/API.md:284` cache-control claim

Confirmed: `GET /api/nope` and `GET /api/pools/nosuchid` both 404 with
`Cache-Control: public, max-age=300`, contradicting the prior "every
other non-2xx response carries no-store" claim. Rewrote the paragraph (and
the earlier "Caching / CORS" summary section, which had the same
pre-402-era overstatement) to state the truth: `402` and `5xx` are
`no-store` (now including a gated `200`, per FAILURE 3); every other status
— `400`, `404` included — is `public, max-age=300`, same as a `2xx`.

### FAILURE 6 (P2) — "byte-identical to pre-234" overstated

`edge/DEPLOY.md:268` and `test_x402_gate.js:302`'s message both claimed
byte-identity to pre-234 without stating scope; the verifier's own
side-by-side `origin/main` comparison found three surfaces that differ
(`GET /api` gained a `pricing` block + 6th `endpoints` entry; the
unknown-route `404`'s `endpoints` list grew; `GET /api/pricing` went
`404` -> `200`).

**Fix**: `edge/DEPLOY.md`'s "Code ships DARK" paragraph now states the exact
scope verified against `origin/main`: identical for `/api/health`,
`/api/pools` (bare + `?token=`), `/api/pools/:id`, `/api/forever-number`,
all three `/mcp` shapes, and the pass-through (object-identical); the three
named differences, explicitly, with the honest note that none of them
serves different data or charges anyone anything. `test_x402_gate.js`'s
section-C banner/log/assertion messages reworded to stop claiming a
pre-234 comparison this section never actually performs (it only compares
the Worker's own dark-mode output against a direct, no-`pricing`-field call
of the CURRENT file — a real but narrower claim) and to point at
`edge/DEPLOY.md` for the actual origin/main scope.

### FAILURE 7 (P3) — `edge/MCP.md:151` "forever"

Reworded: `find_pools`/`get_pool`/`explain_rails` "stay free today, under
the current boundary" — with a pointer at `X402.md`'s "default is PAID, not
free" note explaining this is a standing, revisable decision, not a
permanent guarantee.

### FAILURE 8 (P3, hygiene) — raw NUL/0x01/0x02 bytes in `test_x402_core.js`

Confirmed via `grep -naP '[\x00-\x02]'` and `file test_x402_core.js`
(reported "data", not "ASCII/UTF-8 text") before the fix. Replaced the raw
bytes (embedded in the H2 malformed-base64 test case, `'!!!not-base64!!!' +
<NUL><SOH><STX>`) with `\x00\x01\x02` escapes via a byte-level `perl -i -pe`
substitution (Edit's text-matching tool cannot target raw control bytes
reliably). Re-confirmed after: `file test_x402_core.js` -> "ASCII text" /
"UTF-8 text"; `grep -naP '[\x00-\x02]' test_x402_core.js` -> no matches. No
behavior change — same three bytes, now as escapes instead of literals;
`node test_x402_core.js` output identical before/after this specific edit.

### Also — `234-notes-webbotauth.md` residue item 4

Corrected: it said the identity module was "Not wired in anywhere yet" —
true when that file was written, false now that this branch's WIRING leg
(the original body of this notes file, above) has `edge/agent-log.mjs`
calling `webBotAuth.verifyRequestIdentity()` for every `/api`/`/mcp`
request and `edge/schema.sql` carrying the migration. Marked SUPERSEDED
in place, with a pointer at what actually shipped and where.

## Non-vacuity — the three P1 fixes, each mutated and restored separately

All three cycles below: mutate one predicate in a fresh copy of the
already-committed baseline -> re-run the owning test -> RED -> restore via
`cp` from a backup -> `md5sum` before/after (byte-identical) -> confirmed
GREEN. Baseline hashes were captured immediately before each cycle (not a
single shared baseline across all three, since the three fixes live in two
different files touched independently).

| Mutation | File | Target | Owning test | RED evidence | Restored hash matches |
|---|---|---|---|---|---|
| (a) dispatcher-route gate | `edge/x402-core.js` | reverted `matchRoute()` to the OLD `STATIC_ROUTE_IDS`/`POOL_ID_ROUTE_RE` schedule-derived logic | `test_x402_core.js` §B2 probe + `test_x402_gate.js` §K | both: `x402.matchRoute('/api/three-way-mirror-probe'|'/api/sharpe')` returned `null` instead of the expected id — `AssertionError`, `actual: null` | yes — `c2e5cb28045b2abf96457015fd2d628f` before and after |
| (b) gated-200 cache-control | `edge/agent-log.mjs` | dropped `\|\| gateApplies` from `headersFor`'s Cache-Control condition | `test_x402_gate.js` §E | `AssertionError: valid payment: a gated 200 ... is NEVER publicly cacheable` — `actual: 'public, max-age=300'`, `expected: 'no-store'` | yes — `e2c005514da4fc146c21b44b4659de91` before and after |
| (c) three-way mirror | `edge/x402-core.js` | deleted the `/api/forever-number` entry from `PRICE_SCHEDULE` (real production data, not a synthetic self-defeat input) | `test_x402_core.js` §B (and, transitively, would have failed §B2's real-population check too — execution halts at §B's own top-level `deepEq` throw before reaching §B2) | `AssertionError` at §B's `missingFromSchedule` check — `actual: ['/api/forever-number']`, `expected: []` | yes — `c2e5cb28045b2abf96457015fd2d628f` before and after |

(c) additionally has SIX self-defeat sub-cases built into `test_x402_core.js`
§B2 itself (three synthetic broken inputs — dispatcher-only,
ENDPOINTS-only, schedule-only — each checked against the two directions it
should and should NOT trip), proving the three-way mirror-check LOGIC is
sensitive in every one of its six directions independently, not just the
one direction a single real-data mutation happens to hit.

### Verbatim transcripts

**(a) RED** (`test_x402_core.js`, reverted `matchRoute`):
```
AssertionError [ERR_ASSERTION]: x402.matchRoute recognizes it too — proving
it DELEGATES to the live dispatcher rather than deriving a static id list
from PRICE_SCHEDULE's own keys
actual: null
expected: '/api/three-way-mirror-probe'
```
**(a) RED** (`test_x402_gate.js` §K, same mutation):
```
test_x402_gate.js: FAILED after 223/224 assertions passed
AssertionError [ERR_ASSERTION]: x402Core.matchRoute delegates to the SAME
dispatcher, so it also recognizes the injected route
actual: null
expected: '/api/sharpe'
```
**(a) restore**: `md5sum edge/x402-core.js` -> `c2e5cb28045b2abf96457015fd2d628f`
both before mutation and after restore; `diff` empty. **GREEN**:
`test_x402_core.js: 194/194`, `test_x402_gate.js: 247/247`.

**(b) RED** (`test_x402_gate.js` §E, dropped `|| gateApplies`):
```
test_x402_gate.js: FAILED after 80/81 assertions passed
AssertionError [ERR_ASSERTION]: valid payment: a gated 200 (paid route,
payment verified) is NEVER publicly cacheable
actual: 'public, max-age=300'
expected: 'no-store'
```
**(b) restore**: `md5sum edge/agent-log.mjs` -> `e2c005514da4fc146c21b44b4659de91`
both before mutation and after restore; `diff` empty. **GREEN**:
`test_x402_gate.js: 247/247`.

**(c) RED** (`test_x402_core.js` §B, deleted `/api/forever-number` from
`PRICE_SCHEDULE`):
```
AssertionError [ERR_ASSERTION]: every real api-core ENDPOINTS route must
have a PRICE_SCHEDULE entry — missing route(s): ["/api/forever-number"]
actual: [ '/api/forever-number' ]
expected: []
```
**(c) restore**: `md5sum edge/x402-core.js` -> `c2e5cb28045b2abf96457015fd2d628f`
both before mutation and after restore; `diff` empty. **GREEN**:
`test_x402_core.js: 194/194`, `test_x402_gate.js: 247/247`.

## Full verification run, verbatim summary lines (verifier round 1)

- `node test_x402_core.js`: `test_x402_core.js: 194/194 assertions passed`
  (up from 175 — +19: the new §B2 three-way mirror + self-defeat + probe
  section)
- `node test_x402_gate.js`: `test_x402_gate.js: 247/247 assertions passed`
  (up from 202 — +45: cache-control/CORS assertions across §C/D/E/F, plus
  the new §K end-to-end non-vacuity section)
- `node test_api_worker.js`: `test_api_worker.js: 730/730 assertions passed`
  (unchanged)
- `node test_agent_log.js`: `test_agent_log.js: 764/764 assertions passed`
  (unchanged)
- `node test_mcp_server.js`: `test_mcp_server.js: 1301/1301 assertions passed`
  (unchanged)
- `node test_web_bot_auth.js`: `81/81 assertions passed (final, including
  non-vacuity).` / `PASS` (untouched file)
- `node test_test_registry.js`: `5/5 assertions passed` (unchanged)
- `node test_run_tests.js`: `26 assertions passed` (unchanged)
- `node test_agent_surface_rail_claims.js`: `11 assertions passed
  (population: 33 files; TVL claims: 10; APY claims: 8; expected TVL floor:
  $100K; expected APY limit: 1000)` (unchanged)
- All nine commands above: exit code 0.
- `node test_vercelignore.js`: still **FAILS**, pre-existing, unrelated
  (same two `ko/tokens/0x0.*`/MUST-KEEP-allowlist findings; nothing in this
  round's diff touches translations, sitemap, or vercelignore machinery).
- `node test_translations_number_format.js`: still **FAILS**, pre-existing,
  unrelated (a translation/number-formatting concern with no connection to
  `edge/`).
- `git status --short`: only `edge/API.md edge/DEPLOY.md edge/MCP.md
  edge/X402.md edge/agent-log-core.js edge/agent-log.mjs edge/api-core.js
  edge/x402-core.js product-loop-kit/specs/234-notes-webbotauth.md
  test_x402_core.js test_x402_gate.js` modified — `workers/`, `app.js`,
  `planner.js`, `home.html`, `PoolDetail.js`, `translations.js`,
  `package.json`, and every generated SEO artifact untouched.
- No credential/wallet address introduced: `git diff --text` across every
  touched file, grepped for a 40-hex-char address or a hardcoded `payTo`
  literal, returns nothing outside the pre-existing `0xTEST...` test
  placeholders (unchanged, already-reviewed).

## What I could not do (verifier round 1)

Nothing in-scope was left undone. All eight numbered findings plus the two
"Also" items were fixed with evidence, not argued away. Settlement itself
remains deliberately unimplemented (money-movement, human-owned NEVER-list)
— FAILURE 2's fix makes the CLAIM honest, it does not add settlement.
Replay/nonce protection remains a real, documented gap for live-mode
traffic (a follow-up item's scope, not this round's).

### Coordinator spot-check follow-up — `paid_test` still claimed `verified=true`

FAILURE 2's fix (above) made `settled` honest on every branch but left
`verified=true` on the `paid_test` branch untouched — wrong for the same
reason `settled=true` was wrong: `verifyPayment()`'s TEST-mode branch never
calls a facilitator, never checks a signature, never touches a chain — it
only checks that the payload is STRUCTURALLY well-formed (decodable JSON,
scheme/network/resource match the challenge, amount `>=` required, network
is a test network). `verified=true` asserts a third party vouched for the
payment; in test mode nobody did — an adversarial verifier flagged this as
the same class of overclaim as FAILURE 2, this time on the agent surface's
capability claim rather than the settlement claim.

**Fix**: `paymentResponseHeader()`'s `paid_test` branch now returns
`settled=false; verified=false; checked=structural; mode=test` — `verified`
is `false` (nothing was verified) and a new `checked=structural` field
names what actually happened, distinct from `verified` so a caller can't
mistake one for the other. Live mode is unchanged
(`settled=false; verified=true; mode=live` — earned there, since
`verifyPayment()` really does POST to the facilitator's `/verify` and
requires `isValid:true`). Updated the function's header comment to state,
in one sentence per mode, what `verified` means for `paid`/`paid_test`.
Updated `edge/X402.md`'s "How to pay" step 4 (the header-value
documentation) and its "Web Bot Auth: identity, not access" section (which
generically said "a verified payment... unlocks a paid route" — now names
`verifyPayment()` and both the live-verification and test-structural-match
paths, so the doc doesn't itself imply test-mode payments are verified).
Checked `edge/agent-log-core.js`'s `PAYMENT_STATUSES` comment for the same
overclaim: its `paid_test` line already said "accepted", never "verified"
— left unchanged. Checked `buildPricingDoc`'s live/test availability
prose for the same overclaim: the test-mode sentence already said
"accepted", never "verified" — left unchanged. Updated
`test_x402_core.js` §I's `paid_test` assertion to the new string, and
added a new invariant assertion (not a second copy of the literal) that
the test-mode header never contains the substring `verified=true`.
Updated `test_x402_gate.js`'s two `x-payment-response` pinned assertions
(the `/api` and `/mcp` valid-test-payment cases) to the new string; left
every other assertion in both files, including the ones that already
correctly pinned `rejected`/`none`, untouched.

**Non-vacuity**: `md5sum edge/x402-core.js` before mutation:
`853e3469036b19d4af138fa4d7f0b5a9`. Mutated the `paid_test` branch of
`paymentResponseHeader()` back to `'settled=false; verified=true; mode=test'`
and re-ran the owning test:

```
I. paymentResponseHeader
test_x402_core.js: FAILED after 159/160 assertions passed
AssertionError [ERR_ASSERTION]: paid_test never claims settlement or verification — only a structural payload match
+ actual - expected

+ 'settled=false; verified=true; mode=test'
- 'settled=false; verified=false; checked=structural; mode=test'

    at eq (/home/user/defi_garden/test_x402_core.js:24:42)
```

RED, as expected. Restored via `cp` from the pre-mutation copy;
`md5sum edge/x402-core.js` after restore: `853e3469036b19d4af138fa4d7f0b5a9`
— identical, `diff` empty. Re-ran: `node test_x402_core.js` ->
`test_x402_core.js: 195/195 assertions passed`; `node test_x402_gate.js` ->
`test_x402_gate.js: 247/247 assertions passed`. GREEN.

**Full re-verification after this follow-up** (all commands, exit code 0):
`node test_x402_core.js` -> `195/195`; `node test_x402_gate.js` ->
`247/247`; `node test_agent_log.js` -> `764/764`; `node test_api_worker.js`
-> `730/730`; `node test_mcp_server.js` -> `1301/1301`; `node
test_agent_surface_rail_claims.js` -> `11 assertions passed (population: 33
files; TVL claims: 10; APY claims: 8; expected TVL floor: $100K; expected
APY limit: 1000)`.

---

## Verifier round 2 — findings and fixes

Branch `claude/loop-234`, attempt 3/3. Three findings (P1, P2-treated-as-P1,
P2). Fixed all three; none argued away. Files touched: `edge/DEPLOY.md`,
`edge/agent-log.mjs`, `edge/mcp-core.js`, `test_x402_core.js`,
`test_x402_gate.js`, `package.json` (registered the one new test file), plus
this notes file and `specs/234-pr.md`. New file: `test_edge_docs_settlement_claims.js`.
Not touched: `workers/`, `app.js`, `planner.js`, `home.html`, `PoolDetail.js`,
`translations.js`, any generated SEO artifact, no new dependency.

### FINDING 1 (P1) — `edge/DEPLOY.md` still claimed live mode settles

**What was actually wrong:** `edge/DEPLOY.md:336` said `"live"` "verifies
against a real facilitator and can move real value", and `:352` said to flip
`X402_MODE` to `"live"` "once ready to actually settle" — both false
(`verifyPayment()` only ever POSTs `<facilitator>/verify`; no `/settle` call
exists anywhere in `edge/`), contradicting `edge/X402.md`'s own correct
residue notes, in the runbook a human actually follows rather than in a
contract doc a human might not open. A third, same-class instance was found
while sweeping the rest of the file per the finding's own instruction:
`:339` said "the wallet/handle payments settle to" — also an un-negated
settlement claim.

**Fix (a) — restate in X402.md's residue words:** `edge/DEPLOY.md:336`
now says `"live"` verifies against a real facilitator (fail-closed) but
this Worker never calls `/settle`, in either mode, so no value ever moves
on our side; `:352`'s HUMAN-OWNED bullet now says the same, explicitly,
before naming the flip; `:339` now says `X402_PAY_TO` names "the
wallet/handle a future settlement path would pay out to — this Worker
itself never settles, in either mode".

**Fix (b) — guard the class:** new `test_edge_docs_settlement_claims.js`.
Chose a NEW file over extending `test_agent_surface_rail_claims.js`
(offered as an option by the finding): that file's claim shape is a NUMBER
adjacent to a floor/ceiling phrase (a TVL/APY rail figure) — a different
axis from this finding's VERB-PHRASE-plus-negation claim shape, and folding
the two into one file would let two unrelated predicates drift under a
single shared "passed" banner (the RAZOR example-5 resemblance-guard trap,
one layer up). Population: `fs.readdirSync('edge')` filtered to `.md`,
never a hardcoded list. Predicate: text is split into markdown-aware
clause-level chunks (paragraphs joined across wrapped lines; `|` split
first — table cells do not continue a sentence across the pipe, the
mechanism that actually made an early paragraph-only version of this
splitter blind to the DEPLOY.md table row it exists to catch; then split on
`.`/`!`/`?`/`;`) — a chunk is a violation iff it matches a settlement/
value-movement claim pattern (excluding the literal `/settle` endpoint path
and the noun "settlement", both structurally exempt via word-boundary
regex) AND carries no negation token. Self-defeat (in-file, section D):
proves an injected un-negated claim IS caught, the identical claim words
properly negated are NOT flagged, the EXACT pre-fix `DEPLOY.md:336`/`:352`
wording is caught (including the case where "never" appears earlier in the
SAME source line but a DIFFERENT clause — proving clause-level, not
line/sentence-level, splitting is what makes the guard non-vacuous against
this exact historical defect), and the `/settle` endpoint name / "settlement"
noun are correctly exempt.

**CORRECTION (verifier round 3, FINDING 1): the paragraph above describes
round 2's predicate, and round 2's predicate was weaker than this
description claimed.** "Split on `.`/`!`/`?`/`;`" was actually GATED on the
next character looking like a new sentence (capital/digit/quote/backtick/
`*`/`(`) — not unconditional — and "carries no negation token" was checked
ANYWHERE IN THE CHUNK, not scoped to the specific claim. Round 3 found two
misses using the guard's own core verb: `` `X402_MODE` "test" never
settles; live mode can move real value.`` (the `;` was followed by a
lowercase `l`, so the round-2 gate never split there) and `Live mode
settles the payment, and no retry is needed.` (no comma-conjunction split
existed, so an unrelated "no" excused the whole chunk). See the "Verifier
round 3" entry below for the fix (splitting is now unconditional on
terminators plus `, but`/`, and`/`, so`, backtick-aware; negation must
appear BEFORE the claim in the same chunk, or be directly ATTACHED to it as
a predicate value) and the full non-vacuity transcript.

**Non-vacuity** (required, separate from the in-file self-defeat above —
mutating the REAL fixed file and re-running the REAL registered test):

Baseline: `md5sum edge/DEPLOY.md` -> `e99ca3709e99d9cdc7e8dc0bc9ead4f9`.
`node test_edge_docs_settlement_claims.js` -> `13/13 assertions passed`.

Mutation: replaced the fixed `:336` sentence with the exact pre-fix wording
(`"test" accepts a well-formed TEST-network payment but never settles;
"live" verifies against a real facilitator and can move real value.`).

Post-mutation hash: `c037e3c2d537114be89cf5071daf196d`.

**RED:**
```
AssertionError [ERR_ASSERTION]: no edge/*.md file may claim, in an
un-negated chunk, that this Worker settles a payment or moves real
value/funds — violation(s): [
  {
    "file": "DEPLOY.md",
    "chunk": "`\"live\"` verifies against a real facilitator and can move real value.",
    "claims": [ "move real value" ]
  }
]
```

**Restore + verify:** `cp` from the pre-mutation backup; `md5sum edge/DEPLOY.md`
-> `e99ca3709e99d9cdc7e8dc0bc9ead4f9` (== baseline); `diff` against the
backup -> empty. **GREEN:** `node test_edge_docs_settlement_claims.js` ->
`13/13 assertions passed`.

(This RED/restore cycle is what actually caught and fixed a real bug in the
FIRST version of the checker's sentence-splitter — a paragraph-only split
let the claim's negation-free clause silently inherit a `no` token from an
unrelated, LATER table cell sharing the same markdown paragraph, so the
very first run of this mutation against that version stayed falsely GREEN.
Adding the `|`-first split before sentence splitting fixed the checker, not
the fixture — recorded here because a checker that passed its own
non-vacuity check on the first try would have been the more suspicious
result.)

### FINDING 2 (P2-as-filed, treated as P1) — MCP gate priced the DECLARED route, dispatch used the DISPATCHED pathname

**What was actually wrong:** `edge/agent-log.mjs`'s `/mcp` gate classified a
`tools/call` via `x402Core.classifyMcpTool(tool.route)` — the tool's own
DECLARED `route` field, a label. The request actually served comes from
`edge/mcp-core.js`'s `handleToolsCall`, which builds the dispatched
pathname from `tool.argsToRequest(args).pathname` and hands THAT to
`apiCore.handleApiRequest` — nothing tied the two together. A future
tool declaring a free route while its `argsToRequest` resolves a paid
pathname (the verifier's `budget_helper` reproduction) served the full
paid body, 200, gate on, no payment — this is `detector-signal-coverage.md`
axis 7 (declaration vs. executor) one layer below the round-1 defect on
this same item: round 1 was the Worker trusting a route TABLE that could
lag the real dispatcher; round 2 is a TOOL trusting its OWN label instead
of what it actually dispatches to.

**Fix:** `edge/agent-log.mjs`'s `/mcp` gate now computes BOTH a DECLARED
classification (`x402Core.classifyRoute(tool.route)`, unchanged) and a
DISPATCHED classification — `tool.argsToRequest(args)`'s pathname run
through `apiCore.matchRouteId()` (the SAME live dispatch table `/api`
itself walks) then `x402Core.classifyRoute()` — and gates if EITHER is
paid (the stricter of the two). If the dispatch probe throws or resolves
to no route (`matchRouteId` returns null), the gate falls back to the
DECLARED classification only, per the finding's own rationale: a
malformed-args call to a FREE tool must still reach `mcp-core.js`'s own
`-32602` JSON-RPC validation error, never get turned into an unrelated 402,
while a tool that WOULD dispatch a paid pathname is gated no matter what it
declares.

**Guards added:**
- `test_x402_core.js` §G2 (new): a genuine mirror over the WHOLE `TOOLS`
  population — `apiCore.matchRouteId(tool.argsToRequest(sampleArgs).pathname)
  === tool.route` for every real tool, sample args derived from each tool's
  own `inputSchema.required` fields (never a hand-written fixture per
  tool). Self-defeat: a synthetic tool whose declared route disagrees with
  its dispatched pathname IS reported as a mismatch (the verifier's exact
  reproduction shape); a tool whose `argsToRequest` throws is reported, not
  silently OK; a genuinely-agreeing synthetic tool is NOT flagged (no false
  positive).
- `test_x402_gate.js` §L (new), end-to-end, permanent, labelled as
  simulating a future tool: pushes a `budget_helper_selfdefeat_fixture`
  tool onto the REAL `mcpCore.TOOLS` — declared route `/api/pools` (free),
  `argsToRequest` dispatching `/api/forever-number` (paid) — confirms the
  real Worker 402s it with the gate ENABLED (never 200), confirms the 402
  challenge's `resource` names the DISPATCHED route not the declared one,
  confirms it still serves normally with the gate DARK, pops it back out in
  a `finally`, re-confirms the Worker now answers with the ordinary
  "unknown tool" `-32602` error again.
- `test_x402_gate.js` §M (new): the fallback half — a FREE-declared tool
  whose `argsToRequest` always throws is NOT gated to 402 (fails open to
  the declared free classification), and the SAME throw surfaces again in
  the real dispatch as mcp-core.js's own ordinary `-32603` JSON-RPC
  Internal error, never a fabricated payment requirement.

**Non-vacuity:** baseline `md5sum edge/agent-log.mjs` ->
`68423a3f6e6a62bccd528d684d7def91`. Mutated `toolClassification` back to
`declaredClassification` only (dropping `dispatchedClassification`
entirely — the exact pre-fix logic).

Post-mutation hash: `0242fa6b6366a5911c342edb6233925c`.

**RED:**
```
L. non-vacuity — an MCP tool with a FREE declared route but a PAID dispatched pathname 402s (simulating a mis-declared future tool)
test_x402_gate.js: FAILED after 249/250 assertions passed
AssertionError [ERR_ASSERTION]: ENABLED: the mis-declared (free-labelled,
paid-dispatching) tool -> 402, NOT 200 — the gate keys on the DISPATCHED
pathname, not the tool's own declared route (this is FINDING 2's exact
reproduction: a free-declared tool serving paid data for free)
200 !== 402
```

**Restore + verify:** `cp` from the pre-mutation backup; `md5sum
edge/agent-log.mjs` -> `68423a3f6e6a62bccd528d684d7def91` (== baseline);
`diff` against the backup -> empty. **GREEN:** `node test_x402_gate.js` ->
`280/280 assertions passed`.

### FINDING 3 (P2) — the pricing state was a lie when the contract doc is served through MCP

**What was actually wrong:** `edge/mcp-core.js`'s `handleToolsCall` called
`apiCore.handleApiRequest` without the `pricing` field — `/api` itself
receives that field (`{ enabled, mode }`, computed once per request by the
Worker via `x402Core.readConfig(env)`), but MCP's `tools/call` path never
threaded it through. `handleApiRequest` treats an absent `pricing` field as
fully dark, so MCP's `explain_rails` tool (which delegates to `GET /api`)
always reported `{enabled:false, mode:'test'}` — even with
`X402_ENABLED=true, X402_MODE=live` set, the SAME env `GET /api` correctly
reported `{enabled:true, mode:'live'}` for, same instant. This falsified
`edge/X402.md`'s "can never claim a state it cannot actually see" and
`edge/mcp-core.js`'s own `explain_rails` description, "Delegates verbatim
to GET /api" — both became true again once this fix threaded the state, no
doc rewording was needed for either.

**Fix:** `edge/mcp-core.js`'s `handleToolsCall` now accepts an OPTIONAL
fourth argument, `pricing`, passed straight through to
`apiCore.handleApiRequest`'s own `pricing` field; `handleMcpMessage` reads
it from its own `input.pricing` and threads it to `handleToolsCall` on the
`tools/call` path only (every other method ignores it, unchanged).
`edge/agent-log.mjs`'s `handleMcp()` now calls
`mcpCore.handleMcpMessage({ message, pools, pricing: { enabled:
x402Config.enabled, mode: x402Config.mode } })` — the SAME already-computed
`x402Config` its own gate above already used, never re-read from `env`, no
second derivation. `edge/mcp-core.js` stays pure: it takes the state as an
input, it never reads `env` itself.

**Guard added:** `test_x402_gate.js` §N (new): drives the REAL Worker on
BOTH sides — `GET /api`'s `pricing` block vs. MCP `explain_rails`'s
`pricing` block, deep-equal, asserted in BOTH the DARK state (`{}` env) AND
the ENABLED/live state (`X402_ENABLED=true, X402_MODE=live,
X402_FACILITATOR_URL=...`) — per the finding's own instruction, since one
direction (dark) passed before this fix by COINCIDENCE (an absent
`pricing` field and an explicit `{enabled:false,mode:'test'}` both read as
"disabled" to `buildContractDoc`/`buildPricingDoc`), so asserting only dark
would have been vacuous evidence for this exact regression.

**Non-vacuity:** baseline `md5sum edge/agent-log.mjs` ->
`7505a57d0f6e4d1bc1f85900e94ab4cf`. Mutated the `mcpCore.handleMcpMessage`
call to drop the `pricing` field entirely (back to the pre-fix call shape).

Post-mutation hash: `804a9a3f46c013efba2772290ce92695`.

**RED:**
```
AssertionError [ERR_ASSERTION]: ENABLED/live: explain_rails' pricing block
deep-equals GET /api's pricing block — the actual FINDING 3 regression
(MCP falsely stuck reporting the DARK default while GET /api correctly
reported live)
+ actual - expected
  {
    availability: {
+     enabled: false,
+     mode: 'test'
-     enabled: true,
-     mode: 'live'
    },
    ...
```

**Restore + verify:** `cp` from the pre-mutation backup; `md5sum
edge/agent-log.mjs` -> `7505a57d0f6e4d1bc1f85900e94ab4cf` (== baseline);
`diff` against the backup -> empty. **GREEN:** `node test_x402_gate.js` ->
`285/285 assertions passed`.

### Full verification run, verbatim summary lines (verifier round 2)

- `node test_x402_core.js` -> `test_x402_core.js: 203/203 assertions passed`
  (up from 195 — +8, the new §G2 declared/dispatched mirror section)
- `node test_x402_gate.js` -> `test_x402_gate.js: 285/285 assertions passed`
  (up from 247 — +38 across the new §L/§M/§N sections)
- `node test_web_bot_auth.js` -> `81/81 assertions passed (final, including
  non-vacuity).` / `PASS` (untouched file)
- `node test_api_worker.js` -> `test_api_worker.js: 730/730 assertions passed`
  (unchanged)
- `node test_agent_log.js` -> `test_agent_log.js: 764/764 assertions passed`
  (unchanged)
- `node test_mcp_server.js` -> `test_mcp_server.js: 1301/1301 assertions
  passed` (unchanged — its own explain_rails/GET-api parity check calls
  both sides with no `pricing` field, so both still land on the same
  dark-default block by construction)
- `node test_agent_surface_rail_claims.js` -> `11 assertions passed
  (population: 33 files; TVL claims: 10; APY claims: 8; expected TVL
  floor: $100K; expected APY limit: 1000)` (unchanged — this item's fix is
  a different claim axis entirely, see FINDING 1's "why a new file" note)
- `node test_edge_docs_settlement_claims.js` (new) -> `13/13 assertions
  passed`
- `node test_test_registry.js` -> `5/5 assertions passed` (confirms the new
  file is registered, no orphans/ghosts/duplicates)
- `node test_run_tests.js` -> `26 assertions passed` (unchanged)
- All commands above: exit code 0.
- `node test_vercelignore.js`, `node test_translations_number_format.js`:
  still **FAIL**, pre-existing on `origin/main`, unrelated to `edge/` or
  this item's diff — left alone per instructions.
- `git diff --stat -- app.js PoolDetail.js planner.js home.html plan.html
  style.css translations.js workers/`: empty. No product render path or
  `workers/` touched.
- No new npm dependency: `package.json`'s `dependencies`/`devDependencies`
  unchanged; only `scripts.test:serial` gained one new file.
- No credential/account id/wallet address anywhere in the round-2 diff
  (grep-checked across every file touched this round).

### What I could not do (verifier round 2)

Nothing in-scope was left undone. All three findings were fixed with
evidence (a real fix, a permanent regression guard, and an in-session
non-vacuity cycle showing RED-then-restored-GREEN), not argued away.

## Verifier round 3 — advisory findings

The branch PASSED round 3 (7/7 criteria, HIGH tier) with three non-blocking
findings filed for correction before merge — none a shipped-behavior
defect; two (1 and, less directly, 3) are claims that overstated what the
code does, the exact class this item had already failed twice on. All
three fixed. No commit made (per instructions); this is the round-3 polish
pass on `claude/loop-234`.

### FINDING 1 (P2) — settlement-claim guard weaker than every description of it

**What was wrong:** `test_edge_docs_settlement_claims.js`'s clause splitter
only cut `.`/`!`/`?`/`;` when the NEXT character looked like a new sentence
(capital/digit/quote/backtick/`*`/`(`), and its negation check was
"anywhere in the chunk". Two constructions, both using the guard's own core
verb, slipped through:
- `` `X402_MODE` "test" never settles; live mode can move real value.`` —
  the `;` is followed by a lowercase `l`, so the round-2 splitter never cut
  there; "never" from clause 1 excused clause 2's real, un-negated claim.
- `Live mode settles the payment, and no retry is needed.` — no
  comma-conjunction split existed; "no" (negating the unrelated "retry")
  excused the whole chunk, including the un-negated "settles" claim.

Three places described the round-2 predicate as clause-level and
negation-scoped, which was therefore false: `234-pr.md:132-138`,
`234-notes.md`'s FINDING-1(b) writeup (the "Predicate:" paragraph, ~line
1000-1015), and the test file's own header (~lines 31-37).

**Fix — the predicate, not the prose (preferred, per the finding):**
1. Splitting on `.`/`!`/`?`/`;`+whitespace is now UNCONDITIONAL (no
   next-character gate).
2. Splitting also cuts on `, but`/`, and`/`, so`.
3. Neither split point is honored INSIDE a backtick-delimited inline-code
   span (a manual character scanner tracks in/out of a span; a stateless
   regex split can't) — this matters because `` `settled=false;
   verified=false; checked=structural; mode=test` `` is one atomic code
   token, not three prose sentences, and splitting it on its internal `;`
   would tear a compliant, honest assertion in two.
4. A claim is now excused only if a negation token appears BEFORE it in
   the same chunk, or is directly ATTACHED to it as a predicate value
   (`` `settled` is `false` ``, `settled=false`) — "anywhere in the chunk"
   is gone.
5. `neither`/`nor` added to `NEGATION_TOKENS_RE` (a real construction in
   `edge/X402.md` — "neither verified nor settled" — used neither word,
   which round 2's list never covered; it had accidentally stayed green
   because an unrelated, earlier "never" happened to sit in the same
   round-2 chunk, the SAME latent bug shape as the two misses above, just
   not yet exploited by a real defect).

**What tripped the widened predicate during development, and how each was
resolved** (per the finding's instruction — "a real claim to fix or a
false positive whose phrasing you should adjust in the doc, and say which
you did"): two real, compliant `edge/X402.md` sentences (the `settled=false`
/ "`settled` is `false`" idiom, and the "neither verified nor settled"
sentence) initially false-flagged under an early draft of the "negation
before the verb" rule. Both are accurate, necessary descriptions of the
literal `X-PAYMENT-RESPONSE` header contract — rephrasing them would make
the docs LESS precise, not more honest. Both were **fixed in the predicate**
(items 4 and 5 above), not by touching any `edge/*.md` prose. No doc
rephrasing was needed for either.

**Residual gap, stated honestly in the test header, not fixed** (natural-
language negation is not solvable by a regex predicate):
1. Conjunctions other than `, but`/`, and`/`, so` (e.g. `, yet`/`, though`/
   `, while`/`, or`) do not create a split point, so a negation in an
   earlier clause joined by one of those words could still satisfy "before
   the claim, same chunk" even though it modifies a different clause.
2. Negation vocabulary outside the fixed `NEGATION_TOKENS_RE` list (e.g.
   "unable to", "fails to", "far from", or "won't" specifically — its
   `n't` doesn't register because the apostrophe breaks word-boundary
   matching against the preceding "wo") is not recognized, so a real
   negation phrased that way would be false-flagged as a violation.

Confirmed against the real, current `edge/*.md` population: zero sentences
trip either gap today (section C's real-population scan: 0 violations,
674 chunks scanned, 12 chunks matched a CLAIM pattern — all correctly
negated/excused).

**Self-defeat added** (both verifier misses, verbatim, plus regression
coverage for the two things that tripped during development):
- (vi) `` `X402_MODE` "test" never settles; live mode can move real
  value.`` — IS caught; the reported violation is the second clause only.
- (vii) `Live mode settles the payment, and no retry is needed.` — IS
  caught; the reported violation is the first clause only, and does not
  itself carry "no retry".
- (viii) `` `settled=false` `` and "`settled` is `false`" — regression
  control proving the ATTACHED-negation carve-out keeps these compliant.
- (ix) `settles the payment yet reports false telemetry` (a "false" that
  appears later in the chunk but is NOT attached to the claim) — anti-
  overreach control proving (viii)'s carve-out doesn't reopen round 2's
  "negation anywhere" hole.

**Docs corrected to match the widened predicate exactly:** `234-pr.md`'s
FINDING-1 bullet (now describes the round-3 predicate and points at a new
"Verifier round 3" section added there); this file's own FINDING-1(b)
writeup (a correction paragraph inserted immediately after the outdated
description, rather than silently rewriting history); the test file's own
header (full rewrite: predicate description, both misses named explicitly,
the residual-gap paragraph, and the "what tripped during development"
paragraph above).

**Non-vacuity — mutate the REAL `edge/DEPLOY.md`, RED, restore
byte-identically, GREEN:**

Baseline (already carrying FINDING 3's DEPLOY.md fix, below):
`md5sum edge/DEPLOY.md` -> `7ad5fc6b644bb5d2e0c39abaa3e92a08`.
`node test_edge_docs_settlement_claims.js` -> `19/19 assertions passed`.

Mutation: inserted both of the verifier's exact miss sentences as a new
paragraph directly into `edge/DEPLOY.md` (before its "HUMAN-OWNED"
section):

```
`X402_MODE` "test" never settles; live mode can move real value.
Live mode settles the payment, and no retry is needed.
```

**RED:** `node test_edge_docs_settlement_claims.js` ->

```
AssertionError [ERR_ASSERTION]: no edge/*.md file may claim, in an
un-negated chunk, that this Worker settles a payment or moves real
value/funds — violation(s): [
  {
    "file": "DEPLOY.md",
    "chunk": "live mode can move real value.",
    "claims": ["move real value"]
  },
  {
    "file": "DEPLOY.md",
    "chunk": "Live mode settles the payment",
    "claims": ["settles"]
  }
]
```

This IS the proof the finding asked for: the widened predicate catches
BOTH verifier misses, injected verbatim into the real, live-checked file —
not merely in an isolated self-defeat string.

**Restore + verify:** reverted the injected paragraph, leaving
`edge/DEPLOY.md` byte-identical to the pre-mutation baseline —
`md5sum edge/DEPLOY.md` -> `7ad5fc6b644bb5d2e0c39abaa3e92a08` (== baseline);
`diff` against the pre-mutation copy -> empty. **GREEN:**
`node test_edge_docs_settlement_claims.js` -> `19/19 assertions passed`.

### FINDING 2 (P3) — undocumented purity assumption (TOCTOU) in the MCP gate

**What was wrong:** the round-2 fix evaluates `tool.argsToRequest` TWICE
for a gate-eligible call — once in the Worker's probe
(`edge/agent-log.mjs:508-517`), once again in the real dispatch
(`edge/mcp-core.js:363`) — and silently assumed the two agree. The
verifier reproduced a leak with a tool returning `/api/pools` on the first
call and `/api/forever-number` on the second: 200 with the full paid body,
gate ON, no payment. Exploiting it requires committing code into `TOOLS`,
same prerequisite as the round-2 finding — but the gate's comment claimed
the stricter-of rule meant no mis-declared tool "can be used to bypass",
which is false once `argsToRequest` itself is allowed to be impure.

**Fix chosen: test + comment, not evaluate-once.** Evaluating
`argsToRequest` once (resolving the request in the gate and handing the
SAME resolved request to the dispatch path) would remove the assumption
instead of documenting it, but doing so cleanly means threading a
pre-resolved `{pathname, searchParams}` through `handleMcpMessage` ->
`handleToolsCall` as an alternate call shape, on top of the existing
`args`-based path `handleToolsCall` also serves from `tools/call` messages
that never went through the gate (free tools, and paid tools when the gate
is dark) — a second call shape into `mcp-core.js`'s dispatch, which the
finding explicitly ruled out restructuring. The test+comment route was
taken instead, per the finding's own fallback instruction.

1. **`test_x402_core.js` §G2b** (new, immediately after §G2's existing
   dispatch-mirror section): `checkArgsToRequestPure(tool)` calls
   `tool.argsToRequest(sampleArgs)` TWICE with the identical args object
   and asserts the resulting pathname AND search-params string are
   identical, run over the REAL `mcpCore.TOOLS` population (not a
   synthetic stand-in). Self-defeat: (i) a tool whose pathname alternates
   across calls (the verifier's exact leak shape) IS reported; (ii) a tool
   whose pathname stays the same but whose SEARCH PARAMS drift across
   calls IS reported (a second way the two calls could disagree without
   the route itself changing); (iii) a throwing `argsToRequest` IS
   reported; control: a genuinely pure tool reports null (no false
   positive).
2. **`edge/agent-log.mjs`'s gate comment** now states the assumption
   explicitly instead of overclaiming: the stricter-of rule closes
   mis-DECLARED tools (a `route` label disagreeing with what
   `argsToRequest` builds); it silently assumes `argsToRequest` is pure
   across its two real call sites, which it cannot verify from inside the
   gate itself (it never sees the dispatch's own call) — that assumption
   is enforced, over the real shipped `TOOLS` population, by
   `test_x402_core.js`'s new purity guard.

**Non-vacuity — mutate the REAL `edge/mcp-core.js`, RED, restore
byte-identically, GREEN:**

Baseline: `md5sum edge/mcp-core.js` -> `ba2ba72f301ce23a24513d6e479a9155`.
`node test_x402_core.js` -> `211/211 assertions passed`.

Mutation: made `foreverNumberArgsToRequest` alternate its dispatched
pathname by call PARITY (odd calls: `/api/forever-number`, matching its
declared route; even calls: `/api/pools`) — deliberately shaped so a
single-call check (§G2's existing mirror check, which calls
`argsToRequest` once) stays green, and only a check that calls
`argsToRequest` TWICE in a row (the new §G2b purity guard) sees the two
calls disagree — isolating the RED to the new guard specifically, not to
the pre-existing one:

```js
let __TEMP_IMPURITY_INJECTION_CALL_COUNT = 0;
function foreverNumberArgsToRequest(args) {
  ...
  __TEMP_IMPURITY_INJECTION_CALL_COUNT++;
  return {
    pathname: (__TEMP_IMPURITY_INJECTION_CALL_COUNT % 2 === 1) ? '/api/forever-number' : '/api/pools',
    searchParams: searchParams,
  };
}
```

**RED:** `node test_x402_core.js` -> failed exactly at §G2b (§G2 stayed
green, confirming the isolation above worked as designed):

```
G2. declared route <-> dispatched pathname mirror (mcp-core TOOLS, every tool)
  4/4 real mcp-core tools: declared route === dispatched pathname's resolved route id ...
  self-defeat confirmed: ...

G2b. argsToRequest PURITY — two calls, same args, same result (mcp-core TOOLS, every tool)
AssertionError [ERR_ASSERTION]: tool "forever_number":
argsToRequest(sampleArgs) is pure across two calls — two calls to
argsToRequest with the IDENTICAL args returned different pathnames:
"/api/pools" (call 1) vs "/api/forever-number" (call 2)
```

**Restore + verify:** `git checkout -- edge/mcp-core.js`; `md5sum
edge/mcp-core.js` -> `ba2ba72f301ce23a24513d6e479a9155` (== baseline).
**GREEN:** `node test_x402_core.js` -> `211/211 assertions passed`.

### FINDING 3 (P3) — runbook's "exhaustive" delta list missed a fourth difference

**What was wrong:** `edge/DEPLOY.md:272-283`'s "Exact byte-identity scope"
paragraph enumerated exactly three surfaces that differ from pre-234. A
fourth applies to EVERY `/api/*` and `/mcp` response regardless of route:
`Access-Control-Allow-Headers` now includes `X-PAYMENT` (was
`Content-Type` alone) and a new `Access-Control-Expose-Headers:
X-PAYMENT-RESPONSE` is sent — deliberate, already documented at
`edge/API.md:69-72`, just missing from the runbook's list. Since the
change applies to headers on EVERY route (including the ones the paragraph
calls "byte-identical"/"`Response` object-identical"), simply appending it
as an unqualified fourth "surface" bullet would have made the paragraph
internally inconsistent with its own "object-identical" claim for the
other routes.

**Fix chosen: scope to response bodies, then add the fourth difference as
orthogonal** (the finding offered both options; this is the one consistent
with what the neighboring "Response object-identical" language already
promised once corrected): the byte-identity claim is now explicitly scoped
to response BODIES ("Exact byte-identity scope — response BODIES...",
"pass-through path (`Response` body object-identical...)", "Three surfaces
are deliberately NOT body-identical"); a new sentence follows naming the
CORS header change as a fourth difference that sits OUTSIDE the
body-identity scope and applies universally, pointing at `edge/API.md`'s
CORS section for the full contract.

This finding has no dedicated test (it is a runbook-prose completeness
fix, not a claim `test_edge_docs_settlement_claims.js`'s settlement/
value-movement predicate covers — the CORS-header claim is neither a
settlement claim nor a TVL/APY rail figure, so it is out of scope for
either existing guard's axis) and is therefore not part of the mutate/
red/restore non-vacuity requirement, which the task scoped to findings 1
and 2.

### Full verification run, verbatim summary lines (verifier round 3)

- `node test_edge_docs_settlement_claims.js` -> `19/19 assertions passed`
  (up from 13 — +6: self-defeat (vi)-(ix))
- `node test_x402_core.js` -> `211/211 assertions passed` (up from 203 —
  +8, the new §G2b purity-guard section)
- `node test_x402_gate.js` -> `285/285 assertions passed` (unchanged)
- `node test_web_bot_auth.js` -> `81/81 assertions passed (final, including
  non-vacuity).` / `PASS` (unchanged, untouched file)
- `node test_api_worker.js` -> `test_api_worker.js: 730/730 assertions
  passed` (unchanged, untouched file)
- `node test_agent_log.js` -> `test_agent_log.js: 764/764 assertions
  passed` (unchanged — `edge/agent-log.mjs`'s round-3 diff is comment-only,
  confirmed by `git diff --stat`: 0 lines outside the header comment block)
- `node test_mcp_server.js` -> `test_mcp_server.js: 1301/1301 assertions
  passed` (unchanged, untouched file)
- `node test_agent_surface_rail_claims.js` -> `11 assertions passed`
  (unchanged, untouched file — this round's fixes are the settlement-claim
  axis and the MCP-gate purity axis, neither is a TVL/APY rail figure)
- `node test_test_registry.js` -> `5/5 assertions passed` (unchanged — no
  test file added or removed this round, only sections added to two
  existing registered files)
- All commands above: exit code 0.
- `git diff --stat -- app.js PoolDetail.js planner.js home.html plan.html
  style.css translations.js workers/`: empty. No product render path or
  `workers/` touched.
- No new npm dependency: `package.json` untouched this round.
- No credential/account id/wallet address anywhere in the round-3 diff.
- Nothing committed, pushed, or opened as a PR this round, per instructions.

### Non-vacuity table (verifier round 3)

| Finding | Owning test | File mutated | Baseline md5 | RED confirmed | Restored md5 | GREEN confirmed |
|---|---|---|---|---|---|---|
| 1 | `test_edge_docs_settlement_claims.js` | `edge/DEPLOY.md` | `7ad5fc6b644bb5d2e0c39abaa3e92a08` | yes — both verifier misses reported, verbatim | `7ad5fc6b644bb5d2e0c39abaa3e92a08` (== baseline) | `19/19` |
| 2 | `test_x402_core.js` | `edge/mcp-core.js` | `ba2ba72f301ce23a24513d6e479a9155` | yes — new §G2b fails, §G2 stays green (isolation proof) | `ba2ba72f301ce23a24513d6e479a9155` (== baseline) | `211/211` |
| 3 | n/a (runbook-prose completeness, no dedicated guard exists or was asked for) | n/a | n/a | n/a | n/a | n/a |

### Residual gaps left documented, not fixed (verifier round 3)

Only FINDING 1 carries one, stated in full in the test file's own header
and reproduced above: (1) conjunctions other than `, but`/`, and`/`, so`
do not create a clause-split point; (2) negation vocabulary outside the
fixed token list (including `won't`'s `n't` specifically) is not
recognized. Both are inherent to a regex-based predicate over natural
language, not oversights fixable within this item's scope — confirmed to
trip nothing in the real, current `edge/*.md` population.

### What I could not do (verifier round 3)

Nothing in-scope was left undone. All three findings were fixed —
FINDING 1 by widening the predicate (with an honestly-documented residual
gap, per the finding's own "there will be some" expectation), FINDING 2 by
the test+comment route the finding named as the fallback (evaluate-once
was assessed and correctly declined: it required a second dispatch call
shape into `mcp-core.js`, which the finding explicitly ruled out), and
FINDING 3 by scoping the runbook's claim and adding the fourth difference
consistently. Non-vacuity (mutate/RED/restore-byte-identical/GREEN) shown
for findings 1 and 2 against the REAL files, not just in-file self-defeat
fixtures.
