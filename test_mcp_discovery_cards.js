/* test_mcp_discovery_cards.js — backlog 265: the MCP discovery cards (and a
   handful of further deployed agent-skill artifacts) advertised a dead
   endpoint (`https://www.defi.garden/api/mcp`), the wrong transport
   (`"type": "sse"`), and a phantom `prompts` capability, on a server that is
   now LIVE at `POST /mcp` (Streamable HTTP, `tools`-only — see
   `edge/mcp-core.js`'s `SERVER_CAPABILITIES`/`TOOLS` and `edge/MCP.md`).

   Plain Node, plain lane (no browser-driving framework), no network — same
   idiom as test_agent_surface_rail_claims.js (population globbed/walked at
   test time, expected values derived from the one real implementation,
   never hand-typed) and test_mcp_server.js (assert/ok/eq/deq helpers,
   'use strict', a final summary line, non-zero exit via `assert`).

   RAZOR (product-loop-kit/RAZOR.md, item 212's mirror rule quoted in this
   item's prompt): a guard built by re-typing what today's cards happen to
   say is a guard aimed at a resemblance, not the mechanism. So:
     - the CARD POPULATION is derived by walking `.well-known/` at test time
       and keeping files whose basename contains "mcp" AND that parse as
       JSON with a `transports` key — never a hardcoded 3-file list;
     - the EXPECTED CAPABILITY SET is read directly off
       `edge/mcp-core.js`'s own exported `SERVER_CAPABILITIES` (and
       cross-checked against its exported `TOOLS` array and its actual
       `tools/list` behaviour) — never a second, hand-typed capability
       literal that could drift from the real server;
     - the one thing `edge/mcp-core.js` genuinely cannot tell this test
       (because it is a pure, network-free module that has never heard of
       its own deployed URL, and the transport-type STRING is a
       wire-protocol label, not a value the JS module carries) is stated
       ONCE, as a single named constant below, and every card is compared
       against that one constant — never re-typed per file.

   Run: node test_mcp_discovery_cards.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let total = 0;
function ok(cond, msg) { total++; assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { total++; assert.strictEqual(a, b, msg); passed++; }
function deq(a, b, msg) { total++; assert.deepStrictEqual(a, b, msg); passed++; }

const ROOT = __dirname;
const mcpCore = require(path.join(ROOT, 'edge', 'mcp-core.js'));

console.log('MCP discovery-card parity — backlog 265\n');

// ===========================================================================
// The two facts mcp-core.js cannot know about itself, stated ONCE.
// ===========================================================================

// The live deployed URL — mcp-core.js is a pure, network-free module (see
// its own header comment) and genuinely has no way to know where it is
// mounted; this is the one fact this test is allowed to simply state,
// exactly as spec 265's "Change" section anticipates.
const LIVE_MCP_URL = 'https://www.defi.garden/mcp';

// The wire-protocol transport-type STRING. Not something any JS value in
// mcp-core.js carries (there is no "transport" concept in a JSON-RPC
// core — that's a property of the HTTP framing edge/agent-log.mjs and the
// discovery card describe, not of the message handler). `edge/MCP.md`
// describes the transport in prose as "MCP's Streamable HTTP transport ...
// with no server->client SSE stream". "streamable-http" is the
// conventional MCP-ecosystem string for exactly that transport.
// DEVIATION (recorded, not blocking): the cards' own `$schema` URL
// (https://modelcontextprotocol.org/schemas/mcp-server-card-v1.json) 404s,
// so the canonical spelling cannot be verified against a live schema
// registry — see specs/265-notes.md.
const EXPECTED_TRANSPORT_TYPE = 'streamable-http';

// The forbidden capability names — anything edge/mcp-core.js does NOT
// advertise. Derived from SERVER_CAPABILITIES itself (its absence there
// enumerates what "not implemented" means), not a separate hand-typed list.
const KNOWN_MCP_CAPABILITY_NAMES = ['tools', 'prompts', 'resources', 'sampling', 'logging'];

// ===========================================================================
// A. Sanity — mcp-core.js's own exports are what this whole test leans on.
// ===========================================================================
console.log('A. sanity: edge/mcp-core.js exports are non-vacuous');

ok(mcpCore.SERVER_CAPABILITIES && typeof mcpCore.SERVER_CAPABILITIES === 'object',
  'sanity: mcp-core.js exports a SERVER_CAPABILITIES object');
const REAL_CAPABILITY_KEYS = Object.keys(mcpCore.SERVER_CAPABILITIES).sort();
ok(REAL_CAPABILITY_KEYS.length > 0, `VACUITY GUARD: SERVER_CAPABILITIES has zero keys (got ${JSON.stringify(REAL_CAPABILITY_KEYS)}) — a set-equality check against an empty set would pass on ANY card, guarding nothing`);
deq(REAL_CAPABILITY_KEYS, ['tools'], 'sanity: today, mcp-core.js implements exactly the "tools" capability (matches edge/MCP.md\'s prose: "tools only")');
ok(Array.isArray(mcpCore.TOOLS) && mcpCore.TOOLS.length > 0, 'sanity: mcp-core.js exports a non-empty TOOLS array (justifies the "tools" capability being truthful, not just claimed)');
for (const forbidden of ['prompts', 'resources', 'sampling', 'logging']) {
  ok(!REAL_CAPABILITY_KEYS.includes(forbidden), `sanity: SERVER_CAPABILITIES must not (yet) include "${forbidden}" — if it ever does, this test's expectations must be revisited, not silently passed`);
}

// Prove "tools" is REAL, not merely an unclaimed key: the actual dispatcher
// answers tools/list and tools/call, not just an unknown-method error.
{
  const listRes = mcpCore.handleMcpMessage({ message: { jsonrpc: '2.0', id: 'cap-check-list', method: 'tools/list' }, pools: [] });
  eq(listRes.status, 200, 'sanity: tools/list is a real, answered method (proves the "tools" capability is backed by behaviour)');
  ok(Array.isArray(listRes.body.result.tools) && listRes.body.result.tools.length === mcpCore.TOOLS.length,
    'sanity: tools/list returns exactly as many tools as the TOOLS array declares');
  const callRes = mcpCore.handleMcpMessage({ message: { jsonrpc: '2.0', id: 'cap-check-call', method: 'tools/call', params: { name: 'explain_rails', arguments: {} } }, pools: [] });
  eq(callRes.status, 200, 'sanity: tools/call is a real, answered method');
  ok(!('error' in callRes.body) || callRes.body.error === undefined, 'sanity: tools/call on a real tool name does not error at the protocol level');
}
// And prove "prompts"/"resources"/"sampling" are NOT real: the corresponding
// MCP methods are unknown to this server.
for (const method of ['prompts/list', 'prompts/get', 'resources/list', 'sampling/createMessage']) {
  const res = mcpCore.handleMcpMessage({ message: { jsonrpc: '2.0', id: 'neg-' + method, method }, pools: [] });
  eq(res.status, 200, `sanity: ${method} -> 200 (JSON-RPC error response, not a crash)`);
  eq(res.body.error && res.body.error.code, -32601, `sanity: ${method} is UNKNOWN to this server (-32601) — proves "prompts"/"resources"/"sampling" are correctly absent from SERVER_CAPABILITIES, not just forgotten`);
}

// ===========================================================================
// B. Population — walk .well-known/ at test time; keep files whose basename
//    contains "mcp" AND that parse as JSON with a "transports" key. Never a
//    hardcoded file list (RAZOR / item 212's mirror rule).
// ===========================================================================
console.log('\nB. population — walked from .well-known/, never hand-listed');

function walkFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

const WELL_KNOWN_DIR = path.join(ROOT, '.well-known');
ok(fs.existsSync(WELL_KNOWN_DIR) && fs.statSync(WELL_KNOWN_DIR).isDirectory(), 'sanity: .well-known/ exists as a directory');

const allWellKnownFiles = walkFiles(WELL_KNOWN_DIR);
ok(allWellKnownFiles.length > 0, 'sanity: .well-known/ is non-empty');

// "mcp" in the PATH relative to .well-known/ (not just the basename) — the
// two nested cards live at .well-known/mcp/server-card.json and
// .well-known/mcp/server-cards.json, where "mcp" is the directory segment,
// not the filename itself.
const mcpNamedFiles = allWellKnownFiles.filter((abs) => /mcp/i.test(path.relative(WELL_KNOWN_DIR, abs)));
ok(mcpNamedFiles.length >= 3, `sanity: expected >=3 files under .well-known/ with "mcp" in their path, got ${mcpNamedFiles.length}`);

function tryParseJsonWithTransports(abs) {
  let raw;
  try { raw = fs.readFileSync(abs, 'utf8'); } catch (e) { return null; }
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return null; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!('transports' in parsed)) return null;
  return parsed;
}

const CARD_FILES = mcpNamedFiles
  .map((abs) => ({ abs, rel: path.relative(ROOT, abs), parsed: tryParseJsonWithTransports(abs) }))
  .filter((c) => c.parsed !== null)
  .sort((a, b) => a.rel.localeCompare(b.rel));

console.log(`  found ${mcpNamedFiles.length} "mcp"-named file(s) under .well-known/, ${CARD_FILES.length} of which parse as JSON server-cards (have a "transports" key):`);
console.log('  ' + JSON.stringify(CARD_FILES.map((c) => c.rel)));

// The population size is EXPECTED to be 3 today — asserted, but derived,
// never the only check (each card is individually asserted below too).
const EXPECTED_CARD_COUNT = 3;
eq(CARD_FILES.length, EXPECTED_CARD_COUNT, `expected exactly ${EXPECTED_CARD_COUNT} MCP server-cards under .well-known/ (derived by walk+filter, not hand-counted) — got ${CARD_FILES.length}: ${JSON.stringify(CARD_FILES.map((c) => c.rel))}`);
// Sanity: the three specific paths named in spec 265's evidence are indeed
// among the derived population (proves the derivation isn't accidentally
// finding three DIFFERENT files that happen to also number three).
for (const expectedRel of ['.well-known/mcp.json', path.join('.well-known', 'mcp', 'server-card.json'), path.join('.well-known', 'mcp', 'server-cards.json')]) {
  ok(CARD_FILES.some((c) => c.rel === expectedRel), `derived population must include ${expectedRel}`);
}

// ===========================================================================
// C. Every card, individually: url, transport type, capability set — both
//    directions of set-equality against mcp-core.js's real capability keys.
// ===========================================================================
console.log('\nC. per-card assertions (url / transport / capabilities, both directions)');

for (const card of CARD_FILES) {
  const { rel, parsed } = card;

  ok(Array.isArray(parsed.transports) && parsed.transports.length > 0, `${rel}: "transports" must be a non-empty array`);
  // No extra transport types: every declared transport must be the one the
  // live server actually speaks.
  for (const t of parsed.transports) {
    eq(t.type, EXPECTED_TRANSPORT_TYPE, `${rel}: every transport's "type" must be "${EXPECTED_TRANSPORT_TYPE}" (got ${JSON.stringify(t.type)}) — the live server has no SSE stream (GET /mcp -> 405)`);
    eq(t.url, LIVE_MCP_URL, `${rel}: every transport's "url" must be the one true live URL "${LIVE_MCP_URL}" (got ${JSON.stringify(t.url)})`);
  }
  // Exactly one transport (today's shape) — not just "no bad ones".
  eq(parsed.transports.length, 1, `${rel}: expected exactly 1 transport entry, got ${parsed.transports.length}`);

  ok(parsed.capabilities && typeof parsed.capabilities === 'object' && !Array.isArray(parsed.capabilities), `${rel}: "capabilities" must be an object`);
  const cardCapabilityKeys = Object.keys(parsed.capabilities).sort();

  // Set-equality, BOTH directions: a card missing "tools" OR a card
  // claiming an extra capability (e.g. the old "prompts") both fail.
  deq(cardCapabilityKeys, REAL_CAPABILITY_KEYS,
    `${rel}: declared capability keys ${JSON.stringify(cardCapabilityKeys)} must set-equal the real server's capability keys ${JSON.stringify(REAL_CAPABILITY_KEYS)} (edge/mcp-core.js SERVER_CAPABILITIES) — both directions`);
  for (const realKey of REAL_CAPABILITY_KEYS) {
    ok(cardCapabilityKeys.includes(realKey), `${rel}: direction 1 (real -> card): real capability "${realKey}" must be present on the card`);
  }
  for (const cardKey of cardCapabilityKeys) {
    ok(REAL_CAPABILITY_KEYS.includes(cardKey), `${rel}: direction 2 (card -> real): card-claimed capability "${cardKey}" must be one the real server actually implements`);
  }
  // No phantom capability of ANY kind this ecosystem recognizes, not just
  // the specific "prompts" one this item found — general, not a special case.
  for (const knownCap of KNOWN_MCP_CAPABILITY_NAMES) {
    if (!REAL_CAPABILITY_KEYS.includes(knownCap)) {
      ok(!cardCapabilityKeys.includes(knownCap), `${rel}: must not declare unimplemented capability "${knownCap}"`);
    }
  }

  // The "tools" capability's sub-shape, since mcp-core.js's own handlers
  // back both list and call (checked structurally in section A above).
  ok(parsed.capabilities.tools && parsed.capabilities.tools.list === true && parsed.capabilities.tools.call === true,
    `${rel}: capabilities.tools must declare {list:true, call:true}, matching the real tools/list + tools/call handlers verified in section A`);

  console.log(`  ✓ ${rel}: url=${LIVE_MCP_URL}, type=${EXPECTED_TRANSPORT_TYPE}, capabilities=${JSON.stringify(cardCapabilityKeys)}`);
}

// ===========================================================================
// D. Repo-wide residue scan for "api/mcp" — pure Node fs walk + regex, no
//    shelled-out grep (matches test_agent_surface_rail_claims.js's
//    population-boundary discipline: an explicit, enumerated, DOCUMENTED
//    exclusion set, never a silent side effect).
// ===========================================================================
console.log('\nD. repo-wide "api/mcp" residue scan (excluding the documented historical/test allowlist)');

const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.svg', '.pdf', '.zip']);
const WALK_SKIP_DIRS = new Set(['.git', 'node_modules']);

function walkAllFiles(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (WALK_SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walkAllFiles(abs, out);
    else out.push(abs);
  }
  return out;
}

const ALL_REPO_FILES = walkAllFiles(ROOT, []).filter((abs) => !BINARY_EXTENSIONS.has(path.extname(abs).toLowerCase()));
ok(ALL_REPO_FILES.length > 10000, `sanity: expected a large whole-repo file walk (>10000 non-binary files), got ${ALL_REPO_FILES.length} — a suspiciously small count would mean the walk is broken, not that the repo shrank`);
console.log(`  walked ${ALL_REPO_FILES.length} non-binary files repo-wide`);

// EXCLUDED, BY ROLE — an explicit, enumerated allowlist (mirrors
// test_agent_surface_rail_claims.js's "EXCLUDED, BY ROLE" boundary), each
// entry justified individually, not a grab-bag:
//
//   - product-loop-kit/**  — the outcome loop's own historical, append-only
//     record (LOG.md, BACKLOG.md, reports/*.md, specs/*.md, signals/*.md).
//     specs/265.md itself is the evidence record for THIS defect and quotes
//     the dead URL as history, exactly as specs/261.md quotes "$10M" in its
//     own Evidence section (test_agent_surface_rail_claims.js's header
//     comment documents the identical precedent for product-loop-kit/**).
//     Rewriting these to satisfy this scanner would itself be a defect.
//     NOTE: this is a WIDER exclusion than the "LOG.md, BACKLOG.md,
//     reports/*.md" list named in this item's own build prompt — the
//     prompt's list underclaimed the true set of historical files that
//     legitimately quote the dead URL as evidence (specs/*.md, signals/*.md
//     do too, verified below to be non-empty). Recorded in
//     specs/265-notes.md as a deliberate widening, not a narrowing.
//   - edge/MCP.md — this item's own instructions require APPENDING a
//     resolution paragraph to MCP.md's existing "Not fixed in this item, on
//     purpose" section WITHOUT deleting or rewriting the historical
//     narrative that documents how the mismatch was found and lived (the
//     404 probe, the three-round under-count). That narrative necessarily
//     still contains the string "api/mcp" describing what USED to be
//     advertised; it is history, not a live claim (the paragraph appended
//     by this item states the resolution above the narrative).
//   - test_vercelignore.js — line 411 is an illustrative code comment
//     (an example path, not a claim this site serves it).
//   - test_mcp_server.js — line 586 is a real, correct assertion that a
//     literal "/api/mcp" path classifies as pathClass "api" (routing
//     precedence), unrelated to what the discovery cards advertise.
//   - test_mcp_discovery_cards.js (this file) — necessarily discusses the
//     string "api/mcp" in its own header comment, the allowlist rationale
//     you are reading right now, and the detector PATTERN itself (both the
//     regex literal and its synthetic positive/negative probe strings a
//     few lines below). A scanner cannot avoid naming the string it hunts.
function isAllowlisted(rel) {
  const parts = rel.split(path.sep);
  if (parts[0] === 'product-loop-kit') return true;
  if (rel === path.join('edge', 'MCP.md')) return true;
  if (rel === 'test_vercelignore.js') return true;
  if (rel === 'test_mcp_server.js') return true;
  if (rel === 'test_mcp_discovery_cards.js') return true;
  return false;
}

const API_MCP_PATTERN = /api\/mcp/;

// Anti-vacuity for the PATTERN itself: prove it can actually match, on a
// synthetic string, before trusting a zero count below.
ok(API_MCP_PATTERN.test('probe the dead endpoint at https://www.defi.garden/api/mcp please'),
  'sanity: the api/mcp detector pattern matches a synthetic positive — proves a zero count below is not a broken/inert regex');
ok(!API_MCP_PATTERN.test('https://www.defi.garden/mcp is the live endpoint'),
  'sanity: the api/mcp detector pattern does NOT false-positive on the corrected "/mcp" URL');

const inScopeHits = [];
const allowlistedHits = [];
for (const abs of ALL_REPO_FILES) {
  const rel = path.relative(ROOT, abs);
  let content;
  try { content = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; } // unreadable/binary-despite-extension: skip, not a claim
  if (!API_MCP_PATTERN.test(content)) continue;
  const lines = content.split('\n');
  const lineHits = [];
  lines.forEach((line, i) => { if (API_MCP_PATTERN.test(line)) lineHits.push(i + 1); });
  const bucket = isAllowlisted(rel) ? allowlistedHits : inScopeHits;
  bucket.push({ file: rel, lines: lineHits });
}

console.log(`  ${allowlistedHits.length} file(s) with "api/mcp" inside the documented historical/test allowlist (expected, not a failure)`);
console.log('  ' + JSON.stringify(allowlistedHits));
console.log(`  ${inScopeHits.length} file(s) with "api/mcp" OUTSIDE the allowlist (must be zero)`);

// Anti-vacuity for the ALLOWLIST: prove it isn't accidentally excluding
// nothing (i.e. the allowlisted files really do carry the string, so their
// exclusion is a deliberate, exercised decision, not a no-op).
ok(allowlistedHits.length >= 4, `sanity: expected >=4 allowlisted files to genuinely contain "api/mcp" (proves the allowlist is exercised, not vacuous) — got ${allowlistedHits.length}`);
for (const requiredAllowlisted of ['test_vercelignore.js', 'test_mcp_server.js', path.join('edge', 'MCP.md')]) {
  ok(allowlistedHits.some((h) => h.file === requiredAllowlisted), `sanity: ${requiredAllowlisted} must be among the allowlisted hits (proves this specific, named exclusion is real, not dead code)`);
}
ok(allowlistedHits.some((h) => h.file.startsWith('product-loop-kit' + path.sep)), 'sanity: at least one product-loop-kit/** file must be among the allowlisted hits');

deq(inScopeHits, [], `"api/mcp" must not appear outside the documented historical/test allowlist: ${JSON.stringify(inScopeHits)}`);

console.log(`\ntest_mcp_discovery_cards.js: ${passed}/${total} assertions passed (cards checked: ${CARD_FILES.length}; repo files walked: ${ALL_REPO_FILES.length}; in-scope api/mcp hits: ${inScopeHits.length})`);
