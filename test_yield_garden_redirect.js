/* Unit tests for the yield.garden -> www.defi.garden host-conditioned 301
   (spec 211, LEG 1 only). Offline — parses vercel.json directly, no network
   access. Models itself on test_cache_headers.js / test_markdown_negotiation.js's
   parse-and-assert pattern.

   Spec 211 also specced a second, independent change ("LEG 2": a static
   <link rel="canonical"> in home.html). LEG 2 is DELIBERATELY NOT BUILT — it
   is contradicted by the spec's own acceptance criterion that
   test_canonical.js passes unmodified, and test_canonical.js:112 already
   asserts home.html must NOT contain a static canonical link (a shipped
   guard from spec 011). This file's guard #6 below cross-checks that same
   invariant so the deliberate deviation is an executable fact, not a comment
   that can silently drift from reality.

   Run: node test_yield_garden_redirect.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const REPO_ROOT = __dirname;
const raw = fs.readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8');
const config = JSON.parse(raw);

console.log('vercel.json — still valid JSON, redirects array present');
test('parses without throwing and has a redirects array', () => {
  assert.ok(Array.isArray(config.redirects), 'expected a top-level "redirects" array');
});

// ---------------------------------------------------------------------------
// Helper: find every entry, in every section, that carries a `has` (or
// `missing`) predicate of type "host" — reused by guard #1 and guard #5.
// ---------------------------------------------------------------------------
function hostPredicateEntries(cfg) {
  const found = [];
  ['redirects', 'rewrites', 'headers'].forEach((section) => {
    (cfg[section] || []).forEach((rule, i) => {
      const inHas = (rule.has || []).some((h) => h.type === 'host');
      const inMissing = (rule.missing || []).some((h) => h.type === 'host');
      if (inHas || inMissing) found.push({ section, index: i, rule });
    });
  });
  return found;
}

console.log('guard 1 — exactly one host-predicated entry, and it is redirects[0]');
test('exactly one entry anywhere in vercel.json carries a `has`/`missing` host predicate, and it is redirects[0]', () => {
  const found = hostPredicateEntries(config);
  assert.strictEqual(found.length, 1, `expected exactly one host-predicated entry, found ${found.length}: ${JSON.stringify(found.map((f) => `${f.section}[${f.index}]`))}`);
  assert.strictEqual(found[0].section, 'redirects');
  assert.strictEqual(found[0].index, 0, 'the host-predicated redirect must be redirects[0] so it wins for every path on the aliased host with minimal hop count');
});

const entry = config.redirects[0];

console.log('guard 2 — permanent (301/308), not temporary');
test('redirects[0].permanent === true', () => {
  assert.strictEqual(entry.permanent, true, 'the yield.garden consolidation redirect must be permanent (301/308), not temporary');
});

console.log('guard 3 — path preserved: same capture name in source and destination');
test('redirects[0].source === "/:path*" and destination === "https://www.defi.garden/:path*"', () => {
  assert.strictEqual(entry.source, '/:path*');
  assert.strictEqual(entry.destination, 'https://www.defi.garden/:path*');
});
test('destination carries no query string of its own (Vercel forwards the incoming query automatically only when destination has none)', () => {
  assert.ok(!entry.destination.includes('?'), `destination must not hand-append a query string, got: ${entry.destination}`);
});

console.log('guard 4 — host-matching behaviour, executed not asserted-by-eyeball');
// Pinning FULL-MATCH semantics: the value is anchored with ^...$, and we test
// it both as a full-string match (the anchors do the work) AND assert the
// anchors are literally present in the source string. Anchors are harmless
// under Vercel's (assumed) full-match semantics and strictly safer if
// Vercel's `has.value` matching ever turns out to be substring-based instead
// — either way, this is the behaviour we want and the behaviour we pin.
const hostPredicate = (entry.has || []).find((h) => h.type === 'host');
test('redirects[0] has exactly one `has` entry, of type "host"', () => {
  assert.ok(hostPredicate, 'expected a has[] entry of type "host"');
  assert.strictEqual((entry.has || []).length, 1, 'expected exactly one `has` predicate');
});
test('the host predicate value is anchored with ^ and $', () => {
  assert.ok(hostPredicate.value.startsWith('^'), `expected the host regex to start with "^", got: ${hostPredicate.value}`);
  assert.ok(hostPredicate.value.endsWith('$'), `expected the host regex to end with "$", got: ${hostPredicate.value}`);
});

const hostRe = new RegExp(hostPredicate.value);
const SHOULD_MATCH = ['yield.garden', 'www.yield.garden'];
const SHOULD_NOT_MATCH = ['defi.garden', 'www.defi.garden', 'myyield.garden', 'yield.gardenx', 'yield.garden.evil.com', 'notdefi.garden'];

SHOULD_MATCH.forEach((host) => {
  test(`host predicate MATCHES "${host}"`, () => {
    assert.ok(hostRe.test(host), `expected ${hostPredicate.value} to match "${host}"`);
  });
});
SHOULD_NOT_MATCH.forEach((host) => {
  test(`host predicate does NOT match "${host}"`, () => {
    assert.ok(!hostRe.test(host), `expected ${hostPredicate.value} to NOT match "${host}" — a host predicate mistake here is a whole-site outage risk`);
  });
});
test('critical: the predicate must never match defi.garden or www.defi.garden (the single largest risk in this item)', () => {
  assert.ok(!hostRe.test('defi.garden'));
  assert.ok(!hostRe.test('www.defi.garden'));
});

console.log('guard 5 — blast-radius: no OTHER entry anywhere has gained a "host" predicate');
test('no entry besides redirects[0] carries a `has`/`missing` host predicate', () => {
  const found = hostPredicateEntries(config);
  const others = found.filter((f) => !(f.section === 'redirects' && f.index === 0));
  assert.deepStrictEqual(others, [], `found unexpected host-predicated entries beyond redirects[0]: ${JSON.stringify(others.map((f) => `${f.section}[${f.index}]`))} — a future run must not silently host-gate the real origin`);
});

console.log('guard 6 — leg-2 guard: home.html still has no static <link rel="canonical"> (recorded deviation, not an oversight)');
// Spec 211 §Change item 2 asked for a static canonical tag in home.html.
// It was deliberately NOT built — it directly contradicts the spec's own
// acceptance criterion that test_canonical.js passes unmodified, and
// test_canonical.js:112 ("home.html must not contain a static canonical
// link — the router must be the only source") is a shipped guard from spec
// 011. This assertion cross-checks the SAME invariant from this file, so if
// a later run "completes" spec 211 by adding the static tag, BOTH this test
// and test_canonical.js go red and the reason is discoverable right here.
test('home.html source has no static <link rel="canonical"> tag (leg 2 deliberately not built — see comment above)', () => {
  const homeHtml = fs.readFileSync(path.join(REPO_ROOT, 'home.html'), 'utf8');
  assert.ok(!/<link\s+rel=["']canonical["']/i.test(homeHtml),
    'home.html must not contain a static canonical link — leg 2 of spec 211 was deliberately not built; adding it would delete a shipped SEO guard (test_canonical.js:112)');
});

console.log('guard 7 — self-defeat proof: mutated fixtures actually make the corresponding check fail');
// A check never shown to fail is not evidence of health (house convention;
// see test_test_registry.js (e) and playbooks/derived-number-rails.md step
// 0b). Each case below mutates an in-memory COPY of the real entry only —
// never touches the real config or disk — and proves the relevant assertion
// logic actually goes red on the mutation.

test('self-defeat: unanchoring the host value makes it match a lookalike host it must not match', () => {
  const mutated = { ...hostPredicate, value: hostPredicate.value.replace(/^\^/, '').replace(/\$$/, '') };
  const mutatedRe = new RegExp(mutated.value);
  // Unanchored, "yield.garden.evil.com" now matches where the anchored
  // pattern correctly rejected it — proving the anchored assertion above is
  // actually doing load-bearing work, not just decorative.
  assert.ok(mutatedRe.test('yield.garden.evil.com'),
    'GUARD BUG: expected the unanchored mutation to match "yield.garden.evil.com" (demonstrating why the anchors are required)');
  assert.ok(!hostRe.test('yield.garden.evil.com'), 'sanity: the REAL anchored pattern must still reject the lookalike host');
});

test('self-defeat: permanent:false is caught by the permanent-check', () => {
  const mutated = { ...entry, permanent: false };
  assert.throws(() => assert.strictEqual(mutated.permanent, true), /Expected values to be strictly equal/,
    'expected the permanent-check to throw on a permanent:false fixture');
});

test('self-defeat: a destination without :path* is caught by the path-preservation check', () => {
  const mutated = { ...entry, destination: 'https://www.defi.garden/' };
  assert.throws(() => assert.strictEqual(mutated.destination, 'https://www.defi.garden/:path*'), /Expected values to be strictly equal/,
    'expected the destination-shape check to throw on a fixture missing :path*');
});

test('self-defeat: a mutated copy WITH the host predicate on a second entry is caught by the blast-radius check', () => {
  const mutated = JSON.parse(JSON.stringify(config));
  // Graft a second host-predicated rule onto an unrelated existing redirect.
  mutated.redirects[1].has = (mutated.redirects[1].has || []).concat([{ type: 'host', value: '^evil\\.example$' }]);
  const found = hostPredicateEntries(mutated);
  const others = found.filter((f) => !(f.section === 'redirects' && f.index === 0));
  assert.notDeepStrictEqual(others, [], 'GUARD BUG: expected the blast-radius scan to detect the grafted second host predicate, but it found none');
});

console.log(`\n${passed} assertions passed.`);
if (process.exitCode) { console.error('\n❌ some assertions failed'); }
