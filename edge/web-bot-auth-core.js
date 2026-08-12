/*
 * Pure, network/Worker-free core for Web Bot Auth verification (backlog 234,
 * spec 234, Change §3 — "Web Bot Auth verification middleware: verify agent
 * identity signatures when present; pass the verdict ... into 224's D1
 * edge-log schema as a first-class column"). CommonJS, mirroring
 * edge/agent-log-core.js's shape exactly, for the same reason:
 * `test_web_bot_auth.js` (plain Node, no Wrangler) must be able to
 * `require()` this file directly, and a future ESM Worker module can import
 * it the same way edge/agent-log.mjs already imports `./agent-log-core.js`
 * — Wrangler's bundler and Node's native ESM loader both handle CJS/ESM
 * interop already proven by that file.
 *
 * WHAT THIS IS: an implementation of Web Bot Auth — HTTP Message Signatures
 * (RFC 9421) over Ed25519, used to give an HTTP request a cryptographic
 * identity independent of User-Agent string or IP reputation. A request
 * carries two headers:
 *
 *   Signature-Input: sig1=("@authority" "@method" "@path");created=1700000000;
 *                     expires=1700000600;keyid="poqkLGiy...";alg="ed25519";
 *                     tag="web-bot-auth"
 *   Signature:        sig1=:MEUCIQDx...==:
 *
 * `Signature-Input` names WHICH parts of the request are covered and under
 * what parameters; `Signature` carries the raw signature bytes for the same
 * label. Verifying means: reconstruct the exact "signature base" string
 * (RFC 9421 §2.5) from the covered components as they exist on the request
 * NOW, then ask Ed25519 whether the claimed signature bytes are valid for
 * that string under a public key we hold for `keyid`. If a single byte of
 * a covered component changed since signing (path, method, host...), the
 * base differs and the signature fails — that's the whole security
 * property, and it's why `buildSignatureBase()` below must be byte-exact.
 *
 * RUNTIME: only `globalThis.crypto.subtle` (WebCrypto, `Ed25519` algorithm)
 * is used — never `require('node:crypto')`, never a dependency. WebCrypto
 * Ed25519 is available natively in Node 22 (verified this session:
 * `crypto.subtle.generateKey({name:'Ed25519'}, ...)` works unassisted) and
 * in the Cloudflare Workers runtime, so this same module body runs
 * unmodified in both `node test_web_bot_auth.js` and inside a Worker.
 * `atob`/`btoa`/`TextEncoder` are used for base64 (de)coding — also global
 * in both runtimes — rather than `Buffer`, to keep the file runtime-neutral
 * even though `Buffer` happens to be available in Node too.
 *
 * VERDICTS — exactly three, IDENTITY_STATUSES is their single source (see
 * its own comment below for why): 'unverified' (no evidence either way —
 * either genuinely unsigned, or signed by a key we don't hold, in which
 * case naming the unknown keyid is the weakest honest claim we can make),
 * 'invalid' (evidence of a problem: malformed headers, wrong algorithm,
 * expired/not-yet-valid window, insufficient component coverage, or a
 * signature that provably does not verify), 'verified' (a signature that
 * checks out against a key we hold). The one invariant every caller may
 * rely on: **'invalid' is never reported as 'verified'** — see
 * verifyRequestIdentity()'s own comment for the exact check ordering that
 * guarantees this, and test_web_bot_auth.js's "never-verified invariant"
 * loop for how it's proven, not just claimed.
 *
 * NOT IMPLEMENTED (see product-loop-kit/specs/234-notes-webbotauth.md for
 * the full residue list, restated briefly here so this header doesn't
 * overclaim): key DISCOVERY. This module verifies only against an
 * env-configured keyring (readKeyring() below) — it never fetches a
 * `Signature-Agent` directory, never resolves
 * `/.well-known/http-message-signatures-directory`, and never caches or
 * rotates keys on its own. A key must already be in `WEB_BOT_AUTH_KEYS` for
 * a request to ever come back 'verified'; everything else is honestly
 * 'unverified'.
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants — every one a named export, never a magic literal at a call
// site (159/226 mirror-rule discipline; see product-loop-kit/RAZOR.md
// example 5 on hand-typed mirrors drifting).
// ---------------------------------------------------------------------------

/** RFC 9421 `tag` signature parameter identifying this scheme specifically
 * as Web Bot Auth (as opposed to some other, unrelated use of HTTP Message
 * Signatures on the same request — e.g. a CDN integrity signature, or a
 * future x402 payment signature per spec 234's own Change §1). A
 * Signature-Input entry whose `tag` is anything else is not a Web Bot Auth
 * signature and is verified against — see verifyRequestIdentity()'s tag
 * check. */
const SIGNATURE_TAG = 'web-bot-auth';

/** Clock-skew tolerance, seconds, applied symmetrically to both `created`
 * (may be this far in the future) and `expires` (may be this far in the
 * past) before either is treated as a timing violation. Exported as a named
 * constant per spec 234's explicit instruction, so a test — or a future
 * caller — never hand-types "60" a second time. */
const CLOCK_SKEW_TOLERANCE_SECONDS = 60;

/** The three verdict strings, and ONLY the three verdict strings
 * verifyRequestIdentity() ever returns as `status`. Exported as a single
 * array so the Worker (when it wires this verdict into 224's D1 column,
 * per spec 234 Change §3) and the D1 schema/migration can both assert
 * against this ONE list — e.g. `IDENTITY_STATUSES.includes(row.identity_status)`
 * or a generated `CHECK (identity_status IN (...))` — rather than each
 * hand-typing its own copy of ['unverified','invalid','verified'] and
 * drifting (this repo has been bitten by exactly that shape of bug before;
 * see product-loop-kit/RAZOR.md's mirror-rule discussion). The three local
 * consts below are destructured FROM this array for the same reason: the
 * string literals used throughout this file's own logic are read from the
 * one array, not retyped.
 */
const IDENTITY_STATUSES = Object.freeze(['unverified', 'invalid', 'verified']);
const [STATUS_UNVERIFIED, STATUS_INVALID, STATUS_VERIFIED] = IDENTITY_STATUSES;

// ---------------------------------------------------------------------------
// Base64 / base64url helpers.
//
// Deliberately hand-rolled on `atob`/`btoa` (global in both Node 22 and the
// Workers runtime) rather than `Buffer`, so this file has exactly one
// implementation that behaves identically in both runtimes it must run in
// — pulling in `Buffer` would work in Node but silently rely on a
// Node-compat shim in some Workers configurations, which is exactly the
// kind of "works here, not there" gap this module exists to avoid.
// ---------------------------------------------------------------------------

/** Decodes standard (RFC 4648 §4) base64 — used for the `Signature` header's
 * `:...:` byte-sequence payload, which RFC 9421 mandates as plain base64,
 * not base64url. Returns `null` (never throws) on invalid input. */
function base64ToBytes(str) {
  try {
    const bin = atob(String(str));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch (_err) {
    return null;
  }
}

/** Decodes base64url (RFC 4648 §5, no padding required) — used for keyring
 * public keys per spec 234's stated encoding. Returns `null` (never
 * throws) on invalid input. */
function base64UrlToBytes(str) {
  try {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) s += '=';
    return base64ToBytes(s);
  } catch (_err) {
    return null;
  }
}

/** Encodes bytes as base64url, no padding. Not required by spec 234's
 * export list, but exported anyway: the test file needs it to turn a
 * freshly-generated Ed25519 public key (`crypto.subtle.exportKey('raw', ...)`)
 * into the exact string shape `readKeyring()`/`WEB_BOT_AUTH_KEYS` expect,
 * and a real deployment will need the same conversion once when a key is
 * provisioned — better one shared implementation than a second hand-rolled
 * copy in the test. */
function bytesToBase64Url(bytes) {
  let bin = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Structured-header tokenizing.
//
// RFC 9421's Signature-Input/Signature headers are RFC 8941 Structured
// Fields. This file does not implement RFC 8941 in general — only the
// narrow shapes Web Bot Auth actually uses (an Inner List for the covered
// components, bare/quoted-string/integer Parameters, a single Byte
// Sequence for the signature). `splitTopLevel` is the one piece of that
// narrow implementation worth sharing: split a string on a separator
// character, but never inside `(...)` nesting or `"..."` quoting — used for
// both the comma-separated list of signature labels an entire header MAY
// carry, and the semicolon-separated parameter list within one entry.
// ---------------------------------------------------------------------------

function splitTopLevel(str, sep) {
  const parts = [];
  let depth = 0;
  let inQuotes = false;
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if (!inQuotes) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === sep && depth === 0) {
        parts.push(cur);
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  if (cur.length > 0) parts.push(cur);
  return parts;
}

// ---------------------------------------------------------------------------
// parseSignatureInput — RFC 9421 `Signature-Input` header.
//
// A header MAY carry multiple labelled signatures, comma-separated:
//   sig1=(...);...;tag="something-else", sig2=(...);...;tag="web-bot-auth"
// Since this module's job is specifically Web Bot Auth verification, when
// more than one entry parses successfully, the entry whose `tag` equals
// SIGNATURE_TAG is preferred; if none carries that tag, the first
// successfully-parsed entry is returned (and verifyRequestIdentity()'s own
// tag check will then correctly call it 'invalid' rather than silently
// treating an unrelated signature scheme as Web Bot Auth).
//
// Tolerant of whitespace variance (extra/missing spaces around `;`, `,`,
// inside the component list) by design — never throws, returns `null` on
// anything it cannot make sense of.
// ---------------------------------------------------------------------------

function parseSignatureInput(headerValue) {
  try {
    if (headerValue == null) return null;
    const raw = String(headerValue).trim();
    if (!raw) return null;

    const entries = splitTopLevel(raw, ',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length === 0) return null;

    const parsedEntries = [];
    for (const entry of entries) {
      const eqIdx = entry.indexOf('=');
      if (eqIdx === -1) continue;
      const label = entry.slice(0, eqIdx).trim();
      const rest = entry.slice(eqIdx + 1).trim();
      if (!label || rest[0] !== '(') continue;

      const closeIdx = rest.indexOf(')');
      if (closeIdx === -1) continue;

      const componentsStr = rest.slice(1, closeIdx);
      const paramsStr = rest.slice(closeIdx + 1); // "" or ";key=val;key=val..."

      const componentTokens = componentsStr.split(/\s+/).map((s) => s.trim()).filter(Boolean);
      const coveredComponents = [];
      let componentsOk = true;
      for (const tok of componentTokens) {
        const m = tok.match(/^"([^"]*)"$/);
        if (!m) {
          componentsOk = false;
          break;
        }
        coveredComponents.push(m[1]);
      }
      if (!componentsOk) continue;

      const params = {};
      let paramsOk = true;
      const paramParts = splitTopLevel(paramsStr, ';').map((s) => s.trim()).filter(Boolean);
      for (const p of paramParts) {
        const pEq = p.indexOf('=');
        if (pEq === -1) {
          paramsOk = false;
          break;
        }
        const key = p.slice(0, pEq).trim();
        let val = p.slice(pEq + 1).trim();
        if (!key) {
          paramsOk = false;
          break;
        }
        const quoted = val.match(/^"([^"]*)"$/);
        if (quoted) {
          val = quoted[1];
        } else if (/^-?\d+$/.test(val)) {
          val = Number(val);
        }
        // else: leave as a bare token string — tolerated, not rejected,
        // since RFC 8941 allows bare tokens and this module only cares
        // about the specific params it reads (created/expires/keyid/alg/tag).
        params[key] = val;
      }
      if (!paramsOk) continue;

      parsedEntries.push({
        label,
        coveredComponents,
        params,
        raw: rest.trim(),
      });
    }

    if (parsedEntries.length === 0) return null;

    const tagged = parsedEntries.find((e) => e.params && e.params.tag === SIGNATURE_TAG);
    return tagged || parsedEntries[0];
  } catch (_err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// parseSignature — RFC 9421 `Signature` header: label=:<base64>:
//
// Same multi-entry tolerance as parseSignatureInput, but this module only
// ever needs ONE signature (the one matching the chosen Signature-Input
// label), so this returns the FIRST successfully-parsed entry; correlating
// it against the Signature-Input's label is verifyRequestIdentity()'s job
// (a mismatch is reported 'invalid', not silently ignored).
// ---------------------------------------------------------------------------

function parseSignature(headerValue) {
  try {
    if (headerValue == null) return null;
    const raw = String(headerValue).trim();
    if (!raw) return null;

    const entries = splitTopLevel(raw, ',').map((s) => s.trim()).filter(Boolean);
    if (entries.length === 0) return null;

    for (const entry of entries) {
      const eqIdx = entry.indexOf('=');
      if (eqIdx === -1) continue;
      const label = entry.slice(0, eqIdx).trim();
      const rest = entry.slice(eqIdx + 1).trim();
      if (!label) continue;
      const m = rest.match(/^:([A-Za-z0-9+/=]*):$/);
      if (!m) continue;
      const bytes = base64ToBytes(m[1]);
      if (!bytes) continue;
      return { label, bytes };
    }
    return null;
  } catch (_err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request header access — one case-insensitive accessor that works against
// a real WHATWG `Request` (whose `.headers` is a `Headers` instance,
// already case-insensitive) AND the `{ method, url, headers }` duck type
// spec 234 also requires support for (whose `.headers` may be a plain
// object with arbitrary-case keys).
// ---------------------------------------------------------------------------

function headerGet(request, name) {
  if (!request) return null;
  const headers = request.headers;
  if (!headers) return null;
  if (typeof headers.get === 'function') {
    const v = headers.get(name);
    return v == null ? null : v;
  }
  const lower = String(name).toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) {
      const v = headers[k];
      return v == null ? null : String(v);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// buildSignatureBase — RFC 9421 §2.5 signature base construction.
//
// One line per covered component, in the order given, each formatted as
// `"<component-id>": <value>`, lines joined by "\n" with NO trailing
// newline; the final line is always the signature-params line, whose
// value is the RAW parameter string from Signature-Input (everything after
// `label=`, i.e. `parseSignatureInput(...).raw`) verbatim — that raw string
// is what was actually signed, so it must be reproduced exactly, never
// re-serialized from the parsed params (re-serializing risks reordering or
// reformatting a param and silently breaking every signature).
//
// Supported derived components: @authority (request URL host, lowercased —
// URL parsing already drops a default port), @method (uppercased),
// @path (URL pathname, "/" if empty), @scheme (URL protocol without the
// trailing colon, lowercased), @target-uri (the request URL verbatim),
// @query (URL search string, or "?" if there is none — RFC 9421's
// no-query convention). Anything else is treated as an ordinary header
// name: looked up case-insensitively via headerGet(), trimmed. A component
// this function cannot resolve (unknown derived component, or an ordinary
// header that is simply absent) throws — callers (verifyRequestIdentity)
// catch this and report it as 'invalid', since a signature base cannot be
// honestly constructed without every component it claims to cover.
//
// KNOWN LIMITATION (documented, not silently absorbed): ordinary header
// values are combined by a plain trim(), not full RFC 8941 structured-field
// combining (which would join repeated header instances with ", " and
// canonicalize structured values). Every component this module's own
// test suite and the spec 234 acceptance criteria actually exercise is a
// derived component (@authority/@method/@path), so this gap is inert for
// the shipped verification path — see the notes file for the honest
// residue statement.
// ---------------------------------------------------------------------------

function buildSignatureBase({ coveredComponents, signatureParamsRaw, request }) {
  const url = new URL(request.url);
  const lines = [];

  for (const rawName of coveredComponents) {
    const name = String(rawName).toLowerCase();
    let value;
    switch (name) {
      case '@authority':
        value = url.host.toLowerCase();
        break;
      case '@method':
        value = String(request.method || 'GET').toUpperCase();
        break;
      case '@path':
        value = url.pathname || '/';
        break;
      case '@scheme':
        value = url.protocol.replace(/:$/, '').toLowerCase();
        break;
      case '@target-uri':
        value = String(request.url);
        break;
      case '@query':
        value = url.search ? url.search : '?';
        break;
      default: {
        const headerVal = headerGet(request, name);
        if (headerVal == null) {
          throw new Error(`buildSignatureBase: covered component "${name}" is not a recognized derived component and no such header is present on the request`);
        }
        value = String(headerVal).trim();
      }
    }
    lines.push(`"${name}": ${value}`);
  }

  lines.push(`"@signature-params": ${signatureParamsRaw}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// readKeyring — env var WEB_BOT_AUTH_KEYS, JSON object keyid -> base64url
// raw 32-byte Ed25519 public key. Absent/malformed -> {} (empty keyring:
// every signed request then honestly resolves to 'unverified' with an
// unknown-keyid reason, never a throw that would take the Worker down).
// Values are kept as strings here — decoding/importing happens lazily, per
// verification attempt, in verifyRequestIdentity(), so a malformed VALUE
// for one keyid doesn't invalidate the whole keyring for every other key.
// ---------------------------------------------------------------------------

function readKeyring(env) {
  try {
    if (!env || typeof env !== 'object') return {};
    const raw = env.WEB_BOT_AUTH_KEYS;
    if (raw == null || raw === '') return {};
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const keyring = {};
    for (const keyid of Object.keys(parsed)) {
      const v = parsed[keyid];
      if (typeof v === 'string' && v.length > 0) keyring[keyid] = v;
    }
    return keyring;
  } catch (_err) {
    return {};
  }
}

// ---------------------------------------------------------------------------
// verifyRequestIdentity — the whole point of this file.
//
// Check ordering is deliberate and is what guarantees the one invariant
// every caller may rely on ("'invalid' is never reported as 'verified'"):
// EVERY structural/temporal check that can independently condemn a request
// runs BEFORE the keyring lookup, and the keyring lookup runs BEFORE the
// actual crypto.subtle.verify call. This means:
//   - a request can never reach 'verified' without first passing every
//     'invalid' gate (malformed headers, label mismatch, missing keyid,
//     wrong tag, wrong alg, insufficient coverage, bad timing window) —
//     there is no path that skips straight from "headers present" to
//     "crypto says yes".
//   - an UNKNOWN keyid is checked only after all of those gates pass, so a
//     request that is ALSO malformed in some other way is correctly
//     reported 'invalid' (a real problem) rather than 'unverified' (merely
//     "we don't hold this key") — malformation is a stronger, more
//     specific fact than key-ignorance, so it takes precedence.
//   - the crypto.subtle.verify call itself is the LAST possible source of
//     'verified', and both a `false` result and a thrown exception from it
//     map to 'invalid', never anything else.
// The entire function body also runs under one outer try/catch as a last-
// resort safety net (spec 234: "Never throws ... including a thrown
// crypto.subtle.verify"); that outer catch also returns 'invalid' — never
// 'verified' — for the same reason: an unexpected internal error is
// evidence something went wrong, not evidence of nothing.
// ---------------------------------------------------------------------------

async function verifyRequestIdentity({ request, keyring, nowSeconds } = {}) {
  try {
    const ring = keyring && typeof keyring === 'object' ? keyring : {};

    const sigInputHeader = headerGet(request, 'signature-input');
    const sigHeader = headerGet(request, 'signature');

    if (!sigInputHeader && !sigHeader) {
      return { status: STATUS_UNVERIFIED, keyid: null, reason: 'no Signature/Signature-Input headers present (unsigned request, not a failure — simply anonymous)' };
    }
    if (!sigInputHeader || !sigHeader) {
      return { status: STATUS_INVALID, keyid: null, reason: 'only one of Signature/Signature-Input headers is present' };
    }

    const parsedInput = parseSignatureInput(sigInputHeader);
    if (!parsedInput) {
      return { status: STATUS_INVALID, keyid: null, reason: 'malformed Signature-Input header' };
    }

    const parsedSig = parseSignature(sigHeader);
    if (!parsedSig) {
      return { status: STATUS_INVALID, keyid: null, reason: 'malformed Signature header' };
    }

    if (parsedSig.label !== parsedInput.label) {
      return { status: STATUS_INVALID, keyid: null, reason: `Signature label "${parsedSig.label}" does not match Signature-Input label "${parsedInput.label}"` };
    }

    const { params, coveredComponents } = parsedInput;

    const keyid = typeof params.keyid === 'string' && params.keyid.length > 0 ? params.keyid : null;
    if (!keyid) {
      return { status: STATUS_INVALID, keyid: null, reason: 'missing keyid parameter in Signature-Input' };
    }

    if (params.tag !== SIGNATURE_TAG) {
      return { status: STATUS_INVALID, keyid, reason: `Signature-Input tag "${params.tag}" is not "${SIGNATURE_TAG}" (not a Web Bot Auth signature)` };
    }

    if (params.alg !== 'ed25519') {
      return { status: STATUS_INVALID, keyid, reason: `unsupported alg "${params.alg}" (only "ed25519" is verified)` };
    }

    const lowerComponents = coveredComponents.map((c) => String(c).toLowerCase());
    if (lowerComponents.indexOf('@authority') === -1 || lowerComponents.indexOf('@path') === -1) {
      return { status: STATUS_INVALID, keyid, reason: 'covered-component set does not include both "@authority" and "@path"' };
    }

    const created = Number(params.created);
    const expires = Number(params.expires);
    if (!Number.isFinite(created) || !Number.isFinite(expires)) {
      return { status: STATUS_INVALID, keyid, reason: 'missing/non-numeric created or expires parameter' };
    }

    const now = Number.isFinite(nowSeconds) ? Number(nowSeconds) : Math.floor(Date.now() / 1000);
    if (created > now + CLOCK_SKEW_TOLERANCE_SECONDS) {
      return { status: STATUS_INVALID, keyid, reason: 'created is in the future beyond clock-skew tolerance' };
    }
    if (expires < now - CLOCK_SKEW_TOLERANCE_SECONDS) {
      return { status: STATUS_INVALID, keyid, reason: 'expires is in the past beyond clock-skew tolerance' };
    }

    if (!Object.prototype.hasOwnProperty.call(ring, keyid)) {
      return { status: STATUS_UNVERIFIED, keyid, reason: `unknown keyid "${keyid}" (not in keyring — cannot verify, and cannot claim invalid either: the weakest honest claim)` };
    }

    const publicKeyBytes = base64UrlToBytes(ring[keyid]);
    if (!publicKeyBytes || publicKeyBytes.length !== 32) {
      return { status: STATUS_INVALID, keyid, reason: 'keyring entry for this keyid is not a valid 32-byte Ed25519 public key' };
    }

    let base;
    try {
      base = buildSignatureBase({ coveredComponents, signatureParamsRaw: parsedInput.raw, request });
    } catch (_err) {
      return { status: STATUS_INVALID, keyid, reason: 'could not construct signature base (a covered component could not be resolved on this request)' };
    }

    try {
      const publicKey = await globalThis.crypto.subtle.importKey('raw', publicKeyBytes, { name: 'Ed25519' }, false, ['verify']);
      const dataBytes = new TextEncoder().encode(base);
      const verified = await globalThis.crypto.subtle.verify({ name: 'Ed25519' }, publicKey, parsedSig.bytes, dataBytes);
      if (!verified) {
        return { status: STATUS_INVALID, keyid, reason: 'signature does not verify against the keyring public key' };
      }
      return { status: STATUS_VERIFIED, keyid, reason: 'signature verified against keyring public key' };
    } catch (_err) {
      return { status: STATUS_INVALID, keyid, reason: 'crypto verification threw (treated as a verification failure, never as verified)' };
    }
  } catch (_err) {
    // Last-resort safety net — see this function's own header comment for
    // why an unexpected internal error resolves to 'invalid', not
    // 'unverified' or 'verified'.
    return { status: STATUS_INVALID, keyid: null, reason: 'internal error during verification' };
  }
}

module.exports = {
  SIGNATURE_TAG,
  CLOCK_SKEW_TOLERANCE_SECONDS,
  IDENTITY_STATUSES,
  parseSignatureInput,
  parseSignature,
  buildSignatureBase,
  verifyRequestIdentity,
  readKeyring,
  bytesToBase64Url,
  base64UrlToBytes,
};
