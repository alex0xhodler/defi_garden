# 234 — Web Bot Auth identity leg — implementation notes

Built 2026-08-11, branch `claude/loop-234`. Scope for this build was EXACTLY
three new files (assigned, not chosen): `edge/web-bot-auth-core.js`,
`test_web_bot_auth.js`, this notes file. No existing file was read-modified;
`edge/agent-log.mjs` (where `logAgentRead` will wire the verdict into the
`agent_reads` D1 row per spec 234 Change §3) and `edge/schema.sql` (the D1
column) were read for context only, per the task's explicit instruction —
another agent owns wiring this module into the Worker and the migration. A
sibling agent was concurrently adding `edge/x402-core.js` /
`test_x402_core.js` (spec 234 Change §1/§2, the payment leg); neither file
was touched or read by this build, confirmed via `git status --porcelain`
before/after (only this build's own two files ever appeared as untracked
changes attributable to this session).

## Environment check (per the task's explicit STOP condition)

Node `v22.22.2`. `crypto.subtle.generateKey({name:'Ed25519'}, true,
['sign','verify'])` works natively, no flag, no polyfill — confirmed first,
before writing any code:

```
$ node --version
v22.22.2
$ node -e "crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']).then(k=>console.log('Ed25519 OK', k))"
Ed25519 OK [Object: null prototype] {
  privateKey: CryptoKey { type: 'private', extractable: true, algorithm: { name: 'Ed25519' }, usages: [ 'sign' ] },
  publicKey:  CryptoKey { type: 'public',  extractable: true, algorithm: { name: 'Ed25519' }, usages: [ 'verify' ] }
}
```

No STOP condition triggered — proceeded as specced. `atob`/`btoa`/`Headers`/
`Request`/`TextEncoder` are all confirmed global in this Node 22 (checked
before relying on them for base64 codecs and the duck-typed Request
helpers), so `edge/web-bot-auth-core.js` needed zero polyfills and zero
`node:*` imports of any kind — the file requires nothing.

## Exported API (`edge/web-bot-auth-core.js`)

```
SIGNATURE_TAG                 = 'web-bot-auth'
CLOCK_SKEW_TOLERANCE_SECONDS  = 60
IDENTITY_STATUSES             = ['unverified', 'invalid', 'verified']  (frozen array, single source)

parseSignatureInput(headerValue)      -> { label, coveredComponents, params, raw } | null
parseSignature(headerValue)           -> { label, bytes: Uint8Array } | null
buildSignatureBase({ coveredComponents, signatureParamsRaw, request }) -> string (throws on
                                          an unresolvable covered component; verifyRequestIdentity
                                          catches this and reports 'invalid')
verifyRequestIdentity({ request, keyring, nowSeconds }) -> Promise<{ status, keyid, reason }>
readKeyring(env)                      -> { [keyid]: base64urlPublicKey }  (never throws, {} on absence/malformed)
bytesToBase64Url(bytes)                -> string   (extra, not in the spec's "at minimum" list — see below)
base64UrlToBytes(str)                  -> Uint8Array | null  (extra, same reason)
```

`bytesToBase64Url`/`base64UrlToBytes` are exported beyond the spec's minimum
list because the test needs a base64url encoder to turn a freshly generated
`CryptoKey` into a `WEB_BOT_AUTH_KEYS` value, and a real deployment will need
the identical conversion exactly once when a key is provisioned — one shared
implementation beats the test hand-rolling a second copy.

## Verdict table (the acceptance criterion, checked exactly)

| Condition | Verdict | keyid | Notes |
|---|---|---|---|
| No `Signature`/`Signature-Input` headers at all | `unverified` | `null` | Unsigned ≠ failure — "simply anonymous," per spec text |
| Only one of the two headers present | `invalid` | `null` | Malformed pairing |
| `Signature-Input` unparseable | `invalid` | `null` | `parseSignatureInput` returned `null` |
| `Signature` unparseable | `invalid` | `null` | `parseSignature` returned `null` |
| `Signature` label ≠ `Signature-Input` label | `invalid` | `null` | Can't correlate which bytes sign which params |
| Missing `keyid` param | `invalid` | `null` | |
| `tag` ≠ `"web-bot-auth"` | `invalid` | keyid | Not a Web Bot Auth signature at all (see "beyond the literal list" below) |
| `alg` ≠ `"ed25519"` | `invalid` | keyid | |
| Covered components missing `@authority` or `@path` | `invalid` | keyid | A signature covering nothing meaningful must never read as verified |
| `created` > now + 60s | `invalid` | keyid | Clock-skew tolerance is `CLOCK_SKEW_TOLERANCE_SECONDS` |
| `expires` < now − 60s | `invalid` | keyid | Same constant, symmetric |
| `keyid` well-formed but absent from keyring | `unverified` | keyid | The weakest honest claim — "cannot verify, cannot claim invalid" |
| Keyring value not a valid 32-byte key | `invalid` | keyid | Config-level problem, still never silently "verified" |
| Signature base can't be built (component unresolvable) | `invalid` | keyid | e.g. covers a header absent from the live request |
| `crypto.subtle.verify` returns `false` | `invalid` | keyid | Includes: tampered bytes, path/body changed after signing |
| `crypto.subtle.verify` throws | `invalid` | keyid | Caught, never propagates, never reads as verified |
| Any unexpected internal exception anywhere in the function | `invalid` | `null` | Outer try/catch safety net — see "why invalid, not unverified" below |
| Everything checks out | `verified` | keyid | Only exit that returns `verified` |

**Check ordering is what proves the "never verified" invariant structurally,
not just by convention**: every structural/temporal invalid-gate runs
*before* the keyring lookup, and the keyring lookup runs *before* the actual
`crypto.subtle.verify` call — there is no code path from "headers present"
straight to "crypto says yes" that skips validation. See the function's own
header comment in the source for the full reasoning.

**Two choices beyond the literal spec text**, both logged here rather than
silently shipped:

1. **`tag` mismatch → `invalid`, not `unverified`.** The spec's explicit
   invalid-list ("wrong `alg`, missing `keyid`, `created`/`expires`
   violations, a signature that does not verify, insufficient coverage")
   does not literally mention `tag`. I added it because `SIGNATURE_TAG` is a
   required export specifically so this comparison has one source, and
   because leaving it unchecked would let ANY unrelated RFC 9421 signature on
   the same request (e.g. a future x402 payment signature — spec 234 Change
   §1 adds exactly that on the sibling Worker leg) be silently accepted as a
   Web Bot Auth identity if it happened to reuse `@authority`/`@path`/ed25519.
   That felt like a real gap, not a stylistic addition, so I closed it and
   flag it here for the coordinator to confirm or override.
2. **A generic internal-error catch resolves to `invalid`, not
   `unverified`.** The spec says "never throws" but doesn't pin which of the
   three verdicts an unexpected internal error should map to. I chose
   `invalid` over `unverified` because it is the strictly safer default —
   "invalid never reads as verified" is the one invariant that must never be
   violated, and an unexplained internal error is evidence something is
   wrong, not evidence of "no signature attempted." This path is deliberately
   NOT unit-tested by triggering a genuine engine-level throw (there is no
   clean way to force one without also weakening a real check, which would
   overlap with the non-vacuity mutations below); it is documented here as
   an honest, reasoned default instead.

## Non-vacuity — four predicates, mutated separately, RED, restored, GREEN

Method: `test_web_bot_auth.js` §7 does this programmatically inside the test
run itself (not as a one-off manual step) — for each predicate it reads the
real source, string-replaces the exact guard, writes the mutant, runs a
targeted probe script in a **child process** (`node -e`, fresh `require`, so
the mutation is never masked by Node's module cache), asserts the probe goes
RED, restores the original bytes, `md5sum`s before/after to prove byte-
identical restoration, and asserts the probe is GREEN again. All four ran in
the same `node test_web_bot_auth.js` invocation that produced the final
PASS. Transcript (captured from that run's own stdout):

**Original file:** `edge/web-bot-auth-core.js`, md5 `2df96604512ef6a931fb3f8b46584e92`

### (a) The `crypto.subtle.verify` result check
- Mutation: `if (!verified) {` → `if (false) {` (the branch that reports
  `invalid` when Ed25519 verification fails becomes dead code).
- Mutated md5: `03fb26fcfa5cd6d1994ef0bb088ea6e8`
- Probe: sign a request, flip one byte of the resulting signature, verify.
- RED: `AssertionError [ERR_ASSERTION]: MUTATION PROBE (a): tampered
  signature must be invalid, got verified` — the mutant now reports
  `verified` for a signature that was never valid.
- Restored md5: `2df96604512ef6a931fb3f8b46584e92` (== original)
- GREEN: probe passes (`invalid`) after restore.

### (b) The expiry/created window check
- Mutation: `if (expires < now - CLOCK_SKEW_TOLERANCE_SECONDS) {` →
  `if (false) {` (expiry is never enforced).
- Mutated md5: `56291f0696bd802ff33855aaa6b59904`
- Probe: sign with `expires = T0+10`, verify at `T0 + 10 + 60 + 5` (75s past
  expiry, well beyond the 60s skew tolerance).
- RED: `MUTATION PROBE (b): expired-beyond-skew must be invalid, got
  verified`.
- Restored md5: `2df96604512ef6a931fb3f8b46584e92` (== original)
- GREEN: probe passes (`invalid`) after restore.

### (c) The covered-component sufficiency check
- Mutation: `if (lowerComponents.indexOf('@authority') === -1 ||
  lowerComponents.indexOf('@path') === -1) {` → `if (false) {` (insufficient
  coverage is never rejected).
- Mutated md5: `52b0b6e2c984014a93969f211e816c13`
- Probe: sign covering only `("@method")`, otherwise fully valid and
  correctly keyed.
- RED: `MUTATION PROBE (c): @method-only coverage must be invalid, got
  verified`.
- Restored md5: `2df96604512ef6a931fb3f8b46584e92` (== original)
- GREEN: probe passes (`invalid`) after restore.

### (d) The unknown-keyid branch
- Mutation: `if (!Object.prototype.hasOwnProperty.call(ring, keyid)) {` →
  `if (false) {` (an unknown keyid is never routed to the `unverified`
  branch; it falls through toward the keyring lookup and fails a different,
  wrong way).
- Mutated md5: `5f70f4b40bf778b419ba55d6440d7c13`
- Probe: sign with `keyid: 'totally-unknown-keyid'` against a keyring that
  does not contain it.
- RED: `MUTATION PROBE (d): unknown keyid must be unverified, got invalid` —
  the mutant now reports `invalid` (falls into "keyring entry not a valid
  32-byte key" — `ring[keyid]` is `undefined`) instead of the correct,
  weaker `unverified` claim.
- Restored md5: `2df96604512ef6a931fb3f8b46584e92` (== original)
- GREEN: probe passes (`unverified`) after restore.

All four restores are byte-identical to the pre-mutation file (same md5 as
the original in every case), and the working tree is clean after the test
run (`git status --porcelain` shows only the two new files this build adds
— confirmed after `node test_web_bot_auth.js` exits 0, no leftover mutation,
no leftover scratch file: the transcript above is printed to stdout by the
test rather than written to a file, so a routine re-run of the suite never
leaves an untracked artifact in the repo tree).

Full test run: **81/81 assertions pass** (`node test_web_bot_auth.js`, exit
code 0), covering: exported-surface sanity (§0), the genuine sign→verify
round trip (§1), 11 distinct negative cases enumerated as a case table
(§2 — tampered bytes, path changed post-signing, expired, created-in-future,
wrong alg, wrong tag, unknown keyid, missing headers, only one header
present, malformed `Signature-Input`, insufficient coverage), the
never-verified-invariant loop over that same case table (§3), exact-byte
signature-base construction plus its own round trip (§4), `readKeyring`
against absent/malformed/valid/pre-parsed env shapes (§5), duck-typed
plain-object headers and a real WHATWG `Request` end to end (§6), and the
four non-vacuity mutations above (§7).

## Residue — what this module does NOT implement (stated plainly, not overclaimed)

Per the task's explicit instruction to be honest about scope, so the
coordinator can carry this into item 234's class statement:

1. **No key discovery.** This module verifies ONLY against an
   env-configured keyring (`readKeyring(env)` → `WEB_BOT_AUTH_KEYS`). It
   never fetches a `Signature-Agent` HTTP directory, never resolves
   `/.well-known/http-message-signatures-directory`, and never caches,
   rotates, or refreshes keys on its own. If a signer's key is not already
   present in the deployed keyring, the request is honestly `unverified`
   with the unknown keyid named — it is never treated as a discovery failure
   distinct from "we don't hold this key," because from this module's
   vantage point those are the same fact.
2. **No RFC 8941 structured-field header combining.** `buildSignatureBase`'s
   fallback path for an ordinary (non-derived) covered header does a plain
   `trim()` on whatever `headerGet` returns, not full RFC 8941 combining
   (joining repeated header instances with `", "`, canonicalizing
   structured values). Every component this build's test suite and spec
   234's acceptance criteria actually exercise (`@authority`, `@method`,
   `@path`) is a *derived* component, never an ordinary header, so this gap
   is inert for the shipped verification path — but it means a future caller
   that covers, say, `content-digest` with multiple header instances would
   get a base that is not RFC-exact.
3. **No component parameters.** RFC 9421 allows covered components to carry
   their own parameters (e.g. `"@query-param";name="foo"`, `"signature";
   key="sig1"`). `parseSignatureInput`'s component-token parser only accepts
   a bare quoted string per component (`"@authority"`, `"content-digest"`)
   and will reject (return `null` for the whole header, structurally) any
   entry using component parameters. Not needed for Web Bot Auth's
   documented usage (`@authority`/`@method`/`@path`, no parameters in the
   example the spec itself gives), but a real gap versus the full RFC.
4. **SUPERSEDED — now wired in.** At the time this module was built, nothing
   in `edge/agent-log.mjs` or `edge/schema.sql` had been modified yet; that
   was true only until the WIRING leg of the same item landed later in this
   branch (see `product-loop-kit/specs/234-notes.md`). As of this branch,
   `logAgentRead` (`edge/agent-log.mjs`) DOES compute and log an identity
   verdict for every `/api` and `/mcp` request (`webBotAuth.verifyRequestIdentity()`,
   called inside the deferred logging promise so it never adds latency to
   the served response), `edge/schema.sql` carries the `agent_identity`/
   `identity_status` column migration, and `test_x402_gate.js` §I drives the
   real Worker end-to-end (verified / unverified / invalid / never-checked)
   to prove it. This item's own scope (three new, pure files) is unchanged
   history — only the "not wired in" characterization was time-bound and is
   now false; corrected here rather than left to mislead a future reader.
5. **No x402/payment-signature interplay tested.** Spec 234 Change §1 adds
   a payment layer on the same Worker (built concurrently, in
   `edge/x402-core.js`, by a sibling agent this session). This module's
   `tag` check (see "beyond the literal spec text" above) is exactly the
   seam meant to keep a future payment signature and a Web Bot Auth identity
   signature from being confused for one another, but no end-to-end test
   exists here proving the two layers coexist correctly on one real request
   — that integration, if needed, belongs to whichever item wires both
   modules into the actual Worker.

## Spec points fully satisfied, restated for the coordinator's convenience

- `SIGNATURE_TAG`, `CLOCK_SKEW_TOLERANCE_SECONDS` (named, not a magic `60`),
  `IDENTITY_STATUSES` (single source, three exact strings) — all exported
  exactly as specced.
- `parseSignatureInput`/`parseSignature` — tolerant of whitespace variance,
  never throw, return `null` on anything malformed (proven by the malformed-
  header negative case, not just claimed).
- `buildSignatureBase` — exact-byte assertion in test §4, literal expected
  string stated and each line explained in a comment, plus a genuine
  sign→verify round trip through that exact base.
- `verifyRequestIdentity` — all documented verdict rules implemented and
  individually tested; `invalid` is structurally unreachable from a path
  that could also read `verified` (see check-ordering note above); never
  throws (outer try/catch, plus the two additional inner try/catches around
  `buildSignatureBase` and the `crypto.subtle` calls specifically because
  those are the two places spec 234 explicitly calls out as throw risks).
- `readKeyring` — absent/malformed/valid/pre-parsed-object env values all
  tested; never throws.
- Runtime constraint honored: only `globalThis.crypto.subtle`, zero
  dependencies, zero `node:*` imports anywhere in
  `edge/web-bot-auth-core.js` (grep-confirmable: the file has no `require(`
  call at all).
- Test file: plain Node, `node test_web_bot_auth.js`, non-zero exit on
  failure (verified: a deliberately broken assertion was NOT left in the
  file, but every non-vacuity mutation above independently proves the exit-
  code-on-failure path works, since the RED half of each mutation is
  detected via `execFileSync` throwing on the child process's non-zero
  exit). No network calls anywhere in the file (no `fetch`, no
  `XMLHttpRequest`) — the only child-process spawning is `execFileSync`
  running `node -e <probe>` against the local filesystem, for the
  non-vacuity harness only.
