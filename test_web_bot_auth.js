/* Unit tests for edge/web-bot-auth-core.js — Web Bot Auth (RFC 9421 HTTP
   Message Signatures over Ed25519) verification (backlog 234, spec 234's
   Web Bot Auth acceptance criterion). Plain Node, plain lane (no browser-
   driving framework, no network) — mirrors test_api_worker.js's `ok`/`eq`
   counter convention.

   The positive case is a GENUINE cryptographic round-trip: this file calls
   `crypto.subtle.generateKey({name:'Ed25519'}, ...)` itself, signs real
   signature bases with the resulting private key, and verifies them with
   edge/web-bot-auth-core.js's own verifyRequestIdentity() — nothing here is
   a canned fixture pretending to be a signature.

   Run: node test_web_bot_auth.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0;
let total = 0;
function ok(cond, msg) { total++; assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { total++; assert.strictEqual(a, b, msg); passed++; }

const ROOT = __dirname;
const CORE_PATH = path.join(ROOT, 'edge', 'web-bot-auth-core.js');
const core = require(CORE_PATH);

// The module under test uses ONLY `globalThis.crypto.subtle` (WebCrypto) —
// per spec 234, never a `require('node:crypto')` import. This test file
// mirrors that discipline for the actual signing/verifying it does (it
// uses `globalThis.crypto.subtle` throughout, exactly like the module),
// and only reaches for Node's `require('crypto')` and `Buffer` for its own
// test-harness bookkeeping that has nothing to do with the protocol itself
// (md5 hashing of the source file for the non-vacuity transcript, base64
// convenience) — never as a substitute WebCrypto implementation.
const subtle = globalThis.crypto.subtle;

// ===========================================================================
// Helpers shared by every case below.
// ===========================================================================

/** A minimal duck-typed Request: { method, url, headers } with headers as a
 * real case-insensitive Headers instance (proving the "real Request or
 * duck-type" contract works for both — see the dedicated Headers-object
 * case further down for the plain-object variant). */
function makeRequest({ method, url, headers }) {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers || {})) h.set(k, v);
  return { method, url, headers: h };
}

async function generateKeypair() {
  return subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
}

async function publicKeyToKeyringValue(publicKey) {
  const raw = await subtle.exportKey('raw', publicKey);
  return core.bytesToBase64Url(new Uint8Array(raw));
}

/** Builds a Signature-Input raw parameter string (everything after
 * `label=`) in the exact shape spec 234 documents, so every case controls
 * created/expires/keyid/alg/tag explicitly rather than relying on defaults
 * baked into a helper. */
function sigInputParams({ components, created, expires, keyid, alg, tag }) {
  const compList = components.map((c) => `"${c}"`).join(' ');
  const parts = [`(${compList})`];
  if (created !== undefined) parts.push(`created=${created}`);
  if (expires !== undefined) parts.push(`expires=${expires}`);
  if (keyid !== undefined) parts.push(`keyid="${keyid}"`);
  if (alg !== undefined) parts.push(`alg="${alg}"`);
  if (tag !== undefined) parts.push(`tag="${tag}"`);
  return parts.join(';');
}

/** Signs a request: builds the signature base via the module under test
 * (so signing and verifying share one implementation of "what the base
 * is" — the round-trip property this whole file exists to prove), signs
 * it with the given private key, and returns the two header VALUES
 * (Signature-Input, Signature) ready to attach to a request. */
async function signRequest({ request, components, privateKey, created, expires, keyid, alg = 'ed25519', tag = core.SIGNATURE_TAG, label = 'sig1' }) {
  const paramsRaw = sigInputParams({ components, created, expires, keyid, alg, tag });
  const base = core.buildSignatureBase({ coveredComponents: components, signatureParamsRaw: paramsRaw, request });
  const sigBytes = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, privateKey, new TextEncoder().encode(base)));
  const sigB64 = Buffer.from(sigBytes).toString('base64');
  return {
    signatureInput: `${label}=${paramsRaw}`,
    signature: `${label}=:${sigB64}:`,
  };
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

console.log('Web Bot Auth core — edge/web-bot-auth-core.js');

// ===========================================================================
// 0. Sanity: exported surface exists with the documented shape.
// ===========================================================================
console.log('\n0. exported surface');
eq(core.SIGNATURE_TAG, 'web-bot-auth', 'SIGNATURE_TAG constant');
eq(core.CLOCK_SKEW_TOLERANCE_SECONDS, 60, 'CLOCK_SKEW_TOLERANCE_SECONDS constant');
ok(Array.isArray(core.IDENTITY_STATUSES), 'IDENTITY_STATUSES is an array');
eq(core.IDENTITY_STATUSES.length, 3, 'IDENTITY_STATUSES has exactly 3 entries');
ok(core.IDENTITY_STATUSES.includes('unverified'), 'IDENTITY_STATUSES includes "unverified"');
ok(core.IDENTITY_STATUSES.includes('invalid'), 'IDENTITY_STATUSES includes "invalid"');
ok(core.IDENTITY_STATUSES.includes('verified'), 'IDENTITY_STATUSES includes "verified"');
for (const fn of ['parseSignatureInput', 'parseSignature', 'buildSignatureBase', 'verifyRequestIdentity', 'readKeyring']) {
  ok(typeof core[fn] === 'function', `${fn} is exported as a function`);
}

// ===========================================================================
// 1. Positive: correctly-signed request, known keyid -> verified.
// ===========================================================================
console.log('\n1. positive — genuine Ed25519 round-trip');

(async () => {

const kp1 = await generateKeypair();
const KEYID_1 = 'test-key-1';
const keyring1 = { [KEYID_1]: await publicKeyToKeyringValue(kp1.publicKey) };

const T0 = 1700000000;
const baseUrl = 'https://www.defi.garden/api/forever-number';
const components = ['@authority', '@method', '@path'];

async function signedRequest(overrides = {}) {
  const req = makeRequest({ method: 'GET', url: baseUrl, headers: {} });
  const { signatureInput, signature } = await signRequest({
    request: req,
    components,
    privateKey: kp1.privateKey,
    created: T0,
    expires: T0 + 600,
    keyid: KEYID_1,
    ...overrides,
  });
  req.headers.set('signature-input', signatureInput);
  req.headers.set('signature', signature);
  return req;
}

{
  const req = await signedRequest();
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 30 });
  eq(verdict.status, 'verified', 'genuinely signed request verifies');
  eq(verdict.keyid, KEYID_1, 'verified verdict reports the correct keyid');
}

// ===========================================================================
// 2. Negative cases — each must resolve to a specific verdict, never
//    'verified'. Collected into a case table so §3 (the never-verified
//    invariant) can loop over them, and so a future added case is
//    automatically covered by that loop.
// ===========================================================================
console.log('\n2. negative cases');

const negativeCases = [];

// (a) tampered signature bytes.
{
  const req = await signedRequest();
  const sigHeader = req.headers.get('signature');
  const m = sigHeader.match(/^(sig1)=:([A-Za-z0-9+/=]+):$/);
  ok(m, 'sanity: can parse the signature header we just built, to tamper it');
  const bytes = Buffer.from(m[2], 'base64');
  bytes[0] = bytes[0] ^ 0xff; // flip a byte
  req.headers.set('signature', `sig1=:${bytes.toString('base64')}:`);
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 30 });
  negativeCases.push({ name: 'tampered signature bytes', verdict, expect: 'invalid' });
}

// (b) path changed after signing (sign one path, verify a request for a
//     different one — same headers, different live @path).
{
  const req = await signedRequest(); // signed for /api/forever-number
  const tamperedReq = { method: req.method, url: 'https://www.defi.garden/api/something-else', headers: req.headers };
  const verdict = await core.verifyRequestIdentity({ request: tamperedReq, keyring: keyring1, nowSeconds: T0 + 30 });
  negativeCases.push({ name: 'path changed after signing', verdict, expect: 'invalid' });
}

// (c) expired: expires in the past beyond the 60s skew tolerance.
{
  const req = await signedRequest({ created: T0, expires: T0 + 10 });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 10 + core.CLOCK_SKEW_TOLERANCE_SECONDS + 5 });
  negativeCases.push({ name: 'expired beyond skew', verdict, expect: 'invalid' });
}

// (d) created in the future beyond the 60s skew tolerance.
{
  const req = await signedRequest({ created: T0 + 1000, expires: T0 + 2000 });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 });
  negativeCases.push({ name: 'created in future beyond skew', verdict, expect: 'invalid' });
}

// (e) wrong alg.
{
  const req = await signedRequest({ alg: 'rsa-v1_5-sha256' });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 30 });
  negativeCases.push({ name: 'wrong alg', verdict, expect: 'invalid' });
}

// (f) wrong tag (not a Web Bot Auth signature at all).
{
  const req = await signedRequest({ tag: 'some-other-scheme' });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 30 });
  negativeCases.push({ name: 'wrong tag', verdict, expect: 'invalid' });
}

// (g) unknown keyid -> unverified specifically (not invalid, not verified).
{
  const req = await signedRequest({ keyid: 'nobody-holds-this-key' });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 30 });
  negativeCases.push({ name: 'unknown keyid', verdict, expect: 'unverified' });
}

// (h) missing headers entirely -> unverified specifically.
{
  const req = makeRequest({ method: 'GET', url: baseUrl, headers: {} });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 30 });
  negativeCases.push({ name: 'missing headers (unsigned)', verdict, expect: 'unverified' });
}

// (i) only one of the two headers present.
{
  const req = await signedRequest();
  req.headers.delete('signature');
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 30 });
  negativeCases.push({ name: 'only Signature-Input present', verdict, expect: 'invalid' });
}

// (j) malformed Signature-Input (unbalanced parens / garbage).
{
  const req = makeRequest({
    method: 'GET',
    url: baseUrl,
    headers: {
      'signature-input': 'sig1=("@authority" "@method"created=123;keyid="x"',
      signature: 'sig1=:AAAA:',
    },
  });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 30 });
  negativeCases.push({ name: 'malformed Signature-Input', verdict, expect: 'invalid' });
}

// (k) insufficient covered-component set: only ("@method"). Note this
// case must NOT go through the outer `signedRequest()` helper — that
// helper's default `components` closure covers @authority/@method/@path,
// and `signRequest({ components: [...] })` overrides it correctly, but
// building it explicitly here (rather than trusting the override) makes
// the "this signature truly covers only @method" fact an assertion, not
// an assumption.
{
  const req = makeRequest({ method: 'GET', url: baseUrl, headers: {} });
  const { signatureInput, signature } = await signRequest({
    request: req,
    components: ['@method'],
    privateKey: kp1.privateKey,
    created: T0,
    expires: T0 + 600,
    keyid: KEYID_1,
  });
  req.headers.set('signature-input', signatureInput);
  req.headers.set('signature', signature);
  ok(
    signatureInput.indexOf('"@method"') !== -1 && signatureInput.indexOf('@authority') === -1 && signatureInput.indexOf('@path') === -1,
    'sanity: this Signature-Input truly covers only @method'
  );
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 + 30 });
  negativeCases.push({ name: 'covers only @method (insufficient)', verdict, expect: 'invalid' });
}

for (const c of negativeCases) {
  eq(c.verdict.status, c.expect, `${c.name} -> ${c.expect} (got ${c.verdict.status}: ${c.verdict.reason})`);
}

// ===========================================================================
// 3. Never-verified invariant: loop over every negative case, assert none
//    is 'verified' — a future added case to negativeCases is automatically
//    covered by this loop with no further edits needed here.
// ===========================================================================
console.log('\n3. never-verified invariant');
for (const c of negativeCases) {
  ok(c.verdict.status !== 'verified', `never-verified invariant: "${c.name}" must not be 'verified' (got ${c.verdict.status})`);
}
ok(negativeCases.length >= 10, `sanity: at least 10 negative cases collected (got ${negativeCases.length})`);

// ===========================================================================
// 4. Signature-base construction — exact byte string for a known input,
//    AND a full sign -> verify round-trip through that exact base.
// ===========================================================================
console.log('\n4. signature-base construction — exact bytes');

{
  const req = { method: 'GET', url: 'https://www.defi.garden/api/forever-number', headers: new Headers() };
  const paramsRaw = '("@authority" "@method" "@path");created=1700000000;expires=1700000600;keyid="test-key-1";alg="ed25519";tag="web-bot-auth"';
  const base = core.buildSignatureBase({ coveredComponents: ['@authority', '@method', '@path'], signatureParamsRaw: paramsRaw, request: req });

  // Expected base, one line per covered component in order, then the
  // signature-params line, joined by "\n" with NO trailing newline:
  //   line 1: "@authority": www.defi.garden   <- URL host, lowercased
  //   line 2: "@method": GET                   <- request method, uppercased
  //   line 3: "@path": /api/forever-number      <- URL pathname only, no query
  //   line 4: "@signature-params": (...)        <- the raw param string verbatim,
  //                                                 not re-serialized
  const expected =
    '"@authority": www.defi.garden\n' +
    '"@method": GET\n' +
    '"@path": /api/forever-number\n' +
    '"@signature-params": ("@authority" "@method" "@path");created=1700000000;expires=1700000600;keyid="test-key-1";alg="ed25519";tag="web-bot-auth"';

  eq(base, expected, 'signature base matches the exact expected byte string');
  ok(!base.endsWith('\n'), 'sanity: no trailing newline on the base');
  eq(base.split('\n').length, 4, 'sanity: exactly 4 lines (3 components + signature-params)');
}

{
  // Full round-trip through THIS exact base (not just any base): sign it,
  // then verify via verifyRequestIdentity end to end.
  const req2 = await signedRequest();
  const verdict = await core.verifyRequestIdentity({ request: req2, keyring: keyring1, nowSeconds: T0 + 1 });
  eq(verdict.status, 'verified', 'sign -> verify round-trip through buildSignatureBase succeeds');
}

// ===========================================================================
// 5. readKeyring — absent / malformed / valid env values.
// ===========================================================================
console.log('\n5. readKeyring');

eq(Object.keys(core.readKeyring(undefined)).length, 0, 'readKeyring(undefined) -> {}');
eq(Object.keys(core.readKeyring({})).length, 0, 'readKeyring({}) (absent var) -> {}');
eq(Object.keys(core.readKeyring({ WEB_BOT_AUTH_KEYS: '' })).length, 0, 'readKeyring(empty string) -> {}');
eq(Object.keys(core.readKeyring({ WEB_BOT_AUTH_KEYS: 'not json{{{' })).length, 0, 'readKeyring(malformed JSON) -> {}');
eq(Object.keys(core.readKeyring({ WEB_BOT_AUTH_KEYS: '[1,2,3]' })).length, 0, 'readKeyring(JSON array, not object) -> {}');
eq(Object.keys(core.readKeyring({ WEB_BOT_AUTH_KEYS: '"just a string"' })).length, 0, 'readKeyring(JSON string, not object) -> {}');
{
  const validJson = JSON.stringify({ [KEYID_1]: keyring1[KEYID_1], 'other-key': 'YWJjZGVm' });
  const parsed = core.readKeyring({ WEB_BOT_AUTH_KEYS: validJson });
  eq(Object.keys(parsed).length, 2, 'readKeyring(valid JSON) -> both entries present');
  eq(parsed[KEYID_1], keyring1[KEYID_1], 'readKeyring preserves the exact value string');
}
{
  // Object already parsed (not a JSON string) — tolerated too, per the
  // module's "typeof raw === 'string' ? JSON.parse(raw) : raw" branch.
  const parsed = core.readKeyring({ WEB_BOT_AUTH_KEYS: { [KEYID_1]: keyring1[KEYID_1] } });
  eq(Object.keys(parsed).length, 1, 'readKeyring(already-object env value) works too');
}
{
  // A verification actually using a keyring built by readKeyring, end to end.
  const req = await signedRequest();
  const ring = core.readKeyring({ WEB_BOT_AUTH_KEYS: JSON.stringify(keyring1) });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: ring, nowSeconds: T0 + 30 });
  eq(verdict.status, 'verified', 'end-to-end: readKeyring output plugs directly into verifyRequestIdentity');
}

// ===========================================================================
// 6. Additional contract checks: unsigned request with only Signature (no
//    Signature-Input) is symmetric to case (i); Headers-instance vs plain-
//    object duck-typed headers both work.
// ===========================================================================
console.log('\n6. additional contract checks');

{
  const req = makeRequest({ method: 'GET', url: baseUrl, headers: { signature: 'sig1=:AAAA:' } });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring: keyring1, nowSeconds: T0 });
  eq(verdict.status, 'invalid', 'only Signature present (no Signature-Input) -> invalid');
}

{
  // Plain-object headers (not a Headers instance) — the duck-type contract.
  const req0 = makeRequest({ method: 'GET', url: baseUrl, headers: {} });
  const { signatureInput, signature } = await signRequest({ request: req0, components, privateKey: kp1.privateKey, created: T0, expires: T0 + 600, keyid: KEYID_1 });
  const plainReq = {
    method: 'GET',
    url: baseUrl,
    headers: { 'Signature-Input': signatureInput, Signature: signature }, // mixed-case keys on purpose
  };
  const verdict = await core.verifyRequestIdentity({ request: plainReq, keyring: keyring1, nowSeconds: T0 + 30 });
  eq(verdict.status, 'verified', 'plain-object duck-typed headers (mixed case) verify correctly');
}

{
  // A real WHATWG Request object end to end.
  const realReq = new Request(baseUrl, { method: 'GET' });
  const { signatureInput, signature } = await signRequest({ request: realReq, components, privateKey: kp1.privateKey, created: T0, expires: T0 + 600, keyid: KEYID_1 });
  const signedReal = new Request(baseUrl, {
    method: 'GET',
    headers: { 'signature-input': signatureInput, signature },
  });
  const verdict = await core.verifyRequestIdentity({ request: signedReal, keyring: keyring1, nowSeconds: T0 + 30 });
  eq(verdict.status, 'verified', 'a real WHATWG Request verifies correctly');
  eq(verdict.keyid, KEYID_1, 'real Request verdict reports correct keyid');
}

// ===========================================================================
// Report + non-vacuity section runs AFTER all async assertions above are
// settled, since it re-requires the module fresh for each mutation and
// must not race the assertions already recorded.
// ===========================================================================

console.log(`\n${passed}/${total} assertions passed (pre-mutation).`);
if (passed !== total) {
  console.error('FAIL: some pre-mutation assertions did not pass.');
  process.exit(1);
}

await runNonVacuityChecks();

console.log(`\n${passed}/${total} assertions passed (final, including non-vacuity).`);
if (passed !== total) {
  console.error('FAIL');
  process.exit(1);
}
console.log('PASS');

})().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

// ===========================================================================
// Non-vacuity: mutate edge/web-bot-auth-core.js one predicate at a time,
// re-run a small targeted script in a CHILD process (so the mutated file
// is freshly required, never the already-cached module in this process),
// confirm RED, restore byte-identically (md5sum before/after), confirm
// GREEN. Transcript (mutation, failing assertion, md5 pair) is recorded in
// product-loop-kit/specs/234-notes-webbotauth.md by hand from this run's
// console output — this function just proves the RED/GREEN mechanics and
// prints everything needed for that transcript.
// ===========================================================================

function md5(filePath) {
  return require('crypto').createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
}

/** Runs a small self-contained probe script against whatever
 * edge/web-bot-auth-core.js currently contains, in a fresh child process
 * (`node -e`), returning { ok, output }. `ok` is true iff the probe's own
 * assertions all passed (probe exits 0). */
function runProbe(probeSrc) {
  try {
    const output = execFileSync(process.execPath, ['-e', probeSrc], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    return { ok: true, output };
  } catch (err) {
    return { ok: false, output: (err.stdout || '') + (err.stderr || '') };
  }
}

/** Common probe preamble: fresh require, a valid signed request + keyring,
 * built once per probe invocation (child process, no cross-contamination
 * with this file's own already-required module instance). */
const PROBE_PREAMBLE = `
'use strict';
const assert = require('assert');
const core = require(${JSON.stringify(CORE_PATH)});
const subtle = globalThis.crypto.subtle;

(async () => {
  const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const rawPub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  const keyidVal = core.bytesToBase64Url(rawPub);
  const KEYID = 'probe-key';
  const keyring = { [KEYID]: keyidVal };
  const T0 = 1700000000;
  const url = 'https://www.defi.garden/api/forever-number';

  async function sign(components, params) {
    const req = { method: 'GET', url, headers: new Headers() };
    const compList = components.map((c) => '"' + c + '"').join(' ');
    const parts = ['(' + compList + ')'];
    for (const [k, v] of Object.entries(params)) {
      parts.push(k + '=' + (typeof v === 'number' ? v : '"' + v + '"'));
    }
    const paramsRaw = parts.join(';');
    const base = core.buildSignatureBase({ coveredComponents: components, signatureParamsRaw: paramsRaw, request: req });
    const sigBytes = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, kp.privateKey, new TextEncoder().encode(base)));
    req.headers.set('signature-input', 'sig1=' + paramsRaw);
    req.headers.set('signature', 'sig1=:' + Buffer.from(sigBytes).toString('base64') + ':');
    return req;
  }
`;

async function runNonVacuityChecks() {
  console.log('\n7. non-vacuity — mutate-one-predicate, RED, restore, GREEN');

  const original = fs.readFileSync(CORE_PATH, 'utf8');
  const originalMd5 = md5(CORE_PATH);
  const transcript = [];

  async function withMutation(label, findStr, replaceStr, probeSrc) {
    ok(original.indexOf(findStr) !== -1, `sanity: mutation target string found for "${label}"`);
    const mutated = original.split(findStr).join(replaceStr);
    ok(mutated !== original, `sanity: mutation "${label}" actually changes the file`);

    fs.writeFileSync(CORE_PATH, mutated);
    const mutatedMd5 = md5(CORE_PATH);
    const redResult = runProbe(probeSrc);

    // Restore byte-identically before asserting anything else, so a failed
    // assertion never leaves the repo file mutated on disk.
    fs.writeFileSync(CORE_PATH, original);
    const restoredMd5 = md5(CORE_PATH);
    const greenResult = runProbe(probeSrc);

    eq(restoredMd5, originalMd5, `"${label}": restore is byte-identical to original (md5 match)`);
    ok(mutatedMd5 !== originalMd5, `"${label}": mutated file md5 differs from original`);
    ok(!redResult.ok, `"${label}": mutation causes probe to go RED (fail)\n--- probe output ---\n${redResult.output}`);
    ok(greenResult.ok, `"${label}": restored file makes probe GREEN again\n--- probe output ---\n${greenResult.output}`);

    transcript.push({
      label,
      originalMd5,
      mutatedMd5,
      restoredMd5,
      redOk: redResult.ok,
      redOutput: redResult.output.trim().slice(-2000),
      greenOk: greenResult.ok,
    });
    console.log(`  [${label}] mutated md5=${mutatedMd5.slice(0, 12)} RED(ok=${redResult.ok}) -> restored md5=${restoredMd5.slice(0, 12)} GREEN(ok=${greenResult.ok})`);
  }

  // (a) crypto.subtle.verify result check — neuter "if (!verified)" so a
  // FAILING verify is never reported invalid (always falls through to
  // 'verified'). Probe: tamper the signature bytes after signing; a
  // healthy module reports 'invalid', the mutant reports 'verified'.
  await withMutation(
    '(a) crypto.subtle.verify result check',
    'if (!verified) {',
    'if (false) {',
    PROBE_PREAMBLE + `
  const req = await sign(['@authority', '@method', '@path'], { created: T0, expires: T0 + 600, keyid: KEYID, alg: 'ed25519', tag: 'web-bot-auth' });
  const sigHeader = req.headers.get('signature');
  const m = sigHeader.match(/^sig1=:([A-Za-z0-9+\\/=]+):$/);
  const bytes = Buffer.from(m[1], 'base64');
  bytes[0] ^= 0xff;
  req.headers.set('signature', 'sig1=:' + bytes.toString('base64') + ':');
  const verdict = await core.verifyRequestIdentity({ request: req, keyring, nowSeconds: T0 + 30 });
  assert.strictEqual(verdict.status, 'invalid', 'MUTATION PROBE (a): tampered signature must be invalid, got ' + verdict.status);
  console.log('probe (a) ok');
})().catch((e) => { console.error(e); process.exit(1); });
`
  );

  // (b) expiry/created window check — neuter the expires-in-the-past
  // comparison so an expired signature is never rejected on timing.
  await withMutation(
    '(b) expiry/created window check',
    "if (expires < now - CLOCK_SKEW_TOLERANCE_SECONDS) {",
    "if (false) {",
    PROBE_PREAMBLE + `
  const req = await sign(['@authority', '@method', '@path'], { created: T0, expires: T0 + 10, keyid: KEYID, alg: 'ed25519', tag: 'web-bot-auth' });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring, nowSeconds: T0 + 10 + core.CLOCK_SKEW_TOLERANCE_SECONDS + 5 });
  assert.strictEqual(verdict.status, 'invalid', 'MUTATION PROBE (b): expired-beyond-skew must be invalid, got ' + verdict.status);
  console.log('probe (b) ok');
})().catch((e) => { console.error(e); process.exit(1); });
`
  );

  // (c) covered-component sufficiency check — neuter it so a signature
  // covering only @method is never rejected for insufficient coverage.
  await withMutation(
    '(c) covered-component sufficiency check',
    "if (lowerComponents.indexOf('@authority') === -1 || lowerComponents.indexOf('@path') === -1) {",
    "if (false) {",
    PROBE_PREAMBLE + `
  const req = await sign(['@method'], { created: T0, expires: T0 + 600, keyid: KEYID, alg: 'ed25519', tag: 'web-bot-auth' });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring, nowSeconds: T0 + 30 });
  assert.strictEqual(verdict.status, 'invalid', 'MUTATION PROBE (c): @method-only coverage must be invalid, got ' + verdict.status);
  console.log('probe (c) ok');
})().catch((e) => { console.error(e); process.exit(1); });
`
  );

  // (d) unknown-keyid branch — neuter the hasOwnProperty check so an
  // unknown keyid is never routed to 'unverified' (falls through toward
  // the keyring lookup, which then fails a different way).
  await withMutation(
    '(d) unknown-keyid branch',
    "if (!Object.prototype.hasOwnProperty.call(ring, keyid)) {",
    "if (false) {",
    PROBE_PREAMBLE + `
  const req = await sign(['@authority', '@method', '@path'], { created: T0, expires: T0 + 600, keyid: 'totally-unknown-keyid', alg: 'ed25519', tag: 'web-bot-auth' });
  const verdict = await core.verifyRequestIdentity({ request: req, keyring, nowSeconds: T0 + 30 });
  assert.strictEqual(verdict.status, 'unverified', 'MUTATION PROBE (d): unknown keyid must be unverified, got ' + verdict.status);
  console.log('probe (d) ok');
})().catch((e) => { console.error(e); process.exit(1); });
`
  );

  // Printed, not written to a repo-tree file: this transcript is evidence
  // for product-loop-kit/specs/234-notes-webbotauth.md, copied there by
  // hand once — re-running this test on a clean tree must never leave a
  // stray untracked file behind.
  console.log('\n  non-vacuity transcript (mutation/md5/RED-GREEN — copied into product-loop-kit/specs/234-notes-webbotauth.md):');
  console.log(JSON.stringify(transcript, null, 2));
}
