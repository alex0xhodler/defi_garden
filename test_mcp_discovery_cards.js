/* test_mcp_discovery_cards.js — spec 265: the MCP discovery cards under
   `.well-known/**` must agree with the LIVE server (`edge/mcp-core.js`) on
   URL, transport, and capability set — never a resemblance of it (RAZOR /
   item 212's mirror rule).

   Population is enumerated by globbing `.well-known/**` for files whose
   basename contains "mcp" (the same technique `specs/261-notes.md:158` and
   228's verifier used) — never a hand-typed 3-file list, so a fourth stub
   dropped in later is still caught.

   Expected values are DERIVED from `edge/mcp-core.js`'s own exports
   (`SERVER_CAPABILITIES`), never hand-typed — a card and the server it
   describes cannot silently drift apart again (the exact class 265 fixed).

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
const WELL_KNOWN = path.join(ROOT, '.well-known');
const mcpCore = require(path.join(ROOT, 'edge', 'mcp-core.js'));

const EXPECTED_URL = 'https://www.defi.garden/mcp';
const EXPECTED_TRANSPORT_TYPE = 'streamable-http';
// Derived from the live server's own capability advertisement, never
// hand-typed — set-equality, both directions, is asserted below per card.
const EXPECTED_CAPABILITY_KEYS = Object.keys(mcpCore.SERVER_CAPABILITIES);

// ===========================================================================
// A. Population — glob .well-known/** for "mcp" in the basename.
// ===========================================================================
console.log('A. population — glob .well-known/** for mcp cards');

function walk(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full));
    else out.push(full);
  }
  return out;
}

const ALL_WELL_KNOWN_FILES = walk(WELL_KNOWN);
const MCP_CARDS = ALL_WELL_KNOWN_FILES
  .filter((f) => path.relative(WELL_KNOWN, f).toLowerCase().includes('mcp') && f.endsWith('.json'))
  .sort();

ok(MCP_CARDS.length >= 3, `sanity: expected at least the 3 known cards, got ${MCP_CARDS.length}: ${MCP_CARDS.join(', ')}`);
console.log(`  found ${MCP_CARDS.length} card(s): ${MCP_CARDS.map((f) => path.relative(ROOT, f)).join(', ')}`);

// ===========================================================================
// B. Every card: correct url, transport type, capability set (both
//    directions against the live server's own export).
// ===========================================================================
console.log('B. every card matches the live server');

for (const cardPath of MCP_CARDS) {
  const rel = path.relative(ROOT, cardPath);
  const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));

  ok(Array.isArray(card.transports) && card.transports.length >= 1, `${rel}: has a transports array`);
  const transport = card.transports[0];
  eq(transport.url, EXPECTED_URL, `${rel}: transport.url must be the live server's real endpoint`);
  eq(transport.type, EXPECTED_TRANSPORT_TYPE, `${rel}: transport.type must be the live server's real transport`);

  const cardCapabilityKeys = Object.keys(card.capabilities || {});
  // Set-equality, both directions: the card advertises nothing the server
  // doesn't implement, AND the server implements nothing the card omits.
  for (const key of EXPECTED_CAPABILITY_KEYS) {
    ok(cardCapabilityKeys.includes(key), `${rel}: card is missing capability "${key}" that the live server implements`);
  }
  for (const key of cardCapabilityKeys) {
    ok(EXPECTED_CAPABILITY_KEYS.includes(key), `${rel}: card advertises capability "${key}" the live server does NOT implement`);
  }
}

// ===========================================================================
// C. No lingering "api/mcp" claim on any deployed tooling artifact this
//    item is scoped to (validate_readiness.py, dns-aid-zone.txt, SKILL.md).
// ===========================================================================
console.log('C. no residual /api/mcp claim on the artifacts 265 fixed');

const RESIDUE_FILES = [
  path.join(WELL_KNOWN, 'agent-skills', 'agentic-readiness', 'scripts', 'validate_readiness.py'),
  path.join(WELL_KNOWN, 'agent-skills', 'agentic-readiness', 'templates', 'dns-aid-zone.txt'),
  path.join(WELL_KNOWN, 'agent-skills', 'agentic-readiness', 'SKILL.md'),
];

for (const f of RESIDUE_FILES) {
  const rel = path.relative(ROOT, f);
  const text = fs.readFileSync(f, 'utf8');
  ok(!text.includes('/api/mcp'), `${rel}: must not claim the dead /api/mcp endpoint`);
}

console.log(`\ntest_mcp_discovery_cards.js: ${passed}/${total} assertions passed`);
if (passed !== total) process.exitCode = 1;
