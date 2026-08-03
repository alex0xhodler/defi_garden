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

   PRODUCTION EVIDENCE (measured on the live deploy after spec 211 merged,
   real curl output — not theory): every path under the original
   `/:path*` + host-conditioned rule redirected correctly (/tokens/usdc,
   /chains/solana, /sitemap.xml, /nonexistent-xyz-1029, /plan all 308'd to
   www.defi.garden) EXCEPT the root path itself: `/` and `/?zzz=519`
   (cache-busted) both returned 200 UNREDIRECTED on the yield.garden alias.
   Vercel's matcher does not match the root path `/` against the `/:path*`
   pattern. THIS IS WHY a second, root-only redirect rule exists below as
   redirects[0] — do not "simplify" the two rules back into one; that would
   regress the proven-working catch-all to fix a case the additive root rule
   already fixes with zero blast radius.

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

console.log('guard 1 — exactly two host-predicated entries, at redirects[0] (root) and redirects[1] (catch-all), in that order');
test('exactly two entries anywhere in vercel.json carry a `has`/`missing` host predicate, and they are redirects[0] and redirects[1] in that order', () => {
  const found = hostPredicateEntries(config);
  assert.strictEqual(found.length, 2, `expected exactly two host-predicated entries, found ${found.length}: ${JSON.stringify(found.map((f) => `${f.section}[${f.index}]`))}`);
  assert.strictEqual(found[0].section, 'redirects');
  assert.strictEqual(found[0].index, 0, 'the root-path host-predicated redirect must be redirects[0] — it is strictly more specific than the catch-all and must win first-match-wins ordering');
  assert.strictEqual(found[1].section, 'redirects');
  assert.strictEqual(found[1].index, 1, 'the catch-all host-predicated redirect must be redirects[1], immediately after the root rule');
});

const rootEntry = config.redirects[0];
const pathEntry = config.redirects[1];

console.log('guard 2 — both entries permanent (301/308), not temporary');
test('redirects[0].permanent === true (root rule)', () => {
  assert.strictEqual(rootEntry.permanent, true, 'the root yield.garden consolidation redirect must be permanent (301/308), not temporary');
});
test('redirects[1].permanent === true (catch-all rule)', () => {
  assert.strictEqual(pathEntry.permanent, true, 'the catch-all yield.garden consolidation redirect must be permanent (301/308), not temporary');
});

console.log('guard 3 — shapes pinned: root rule is exact "/", catch-all preserves :path* on both sides, neither destination has a query string');
test('redirects[0].source === "/" and destination === "https://www.defi.garden/" exactly', () => {
  assert.strictEqual(rootEntry.source, '/');
  assert.strictEqual(rootEntry.destination, 'https://www.defi.garden/');
});
test('redirects[1].source === "/:path*" and destination === "https://www.defi.garden/:path*"', () => {
  assert.strictEqual(pathEntry.source, '/:path*');
  assert.strictEqual(pathEntry.destination, 'https://www.defi.garden/:path*');
});
test('neither destination carries a query string of its own (Vercel forwards the incoming query automatically only when destination has none)', () => {
  assert.ok(!rootEntry.destination.includes('?'), `root destination must not hand-append a query string, got: ${rootEntry.destination}`);
  assert.ok(!pathEntry.destination.includes('?'), `catch-all destination must not hand-append a query string, got: ${pathEntry.destination}`);
});

console.log('guard 4 — host-matching behaviour, executed not asserted-by-eyeball, on BOTH entries');
// Pinning FULL-MATCH semantics: the value is anchored with ^...$, and we test
// it both as a full-string match (the anchors do the work) AND assert the
// anchors are literally present in the source string. Anchors are harmless
// under Vercel's (assumed) full-match semantics and strictly safer if
// Vercel's `has.value` matching ever turns out to be substring-based instead
// — either way, this is the behaviour we want and the behaviour we pin.
const rootHostPredicate = (rootEntry.has || []).find((h) => h.type === 'host');
const pathHostPredicate = (pathEntry.has || []).find((h) => h.type === 'host');

test('redirects[0] has exactly one `has` entry, of type "host"', () => {
  assert.ok(rootHostPredicate, 'expected a has[] entry of type "host" on the root rule');
  assert.strictEqual((rootEntry.has || []).length, 1, 'expected exactly one `has` predicate on the root rule');
});
test('redirects[1] has exactly one `has` entry, of type "host"', () => {
  assert.ok(pathHostPredicate, 'expected a has[] entry of type "host" on the catch-all rule');
  assert.strictEqual((pathEntry.has || []).length, 1, 'expected exactly one `has` predicate on the catch-all rule');
});
test('the root rule host predicate value is anchored with ^ and $', () => {
  assert.ok(rootHostPredicate.value.startsWith('^'), `expected the root host regex to start with "^", got: ${rootHostPredicate.value}`);
  assert.ok(rootHostPredicate.value.endsWith('$'), `expected the root host regex to end with "$", got: ${rootHostPredicate.value}`);
});
test('the catch-all rule host predicate value is anchored with ^ and $', () => {
  assert.ok(pathHostPredicate.value.startsWith('^'), `expected the catch-all host regex to start with "^", got: ${pathHostPredicate.value}`);
  assert.ok(pathHostPredicate.value.endsWith('$'), `expected the catch-all host regex to end with "$", got: ${pathHostPredicate.value}`);
});
test('both entries use the identical host predicate regex', () => {
  assert.strictEqual(rootHostPredicate.value, pathHostPredicate.value, 'the root rule and the catch-all rule must guard the exact same host set — any divergence is a correctness bug');
});

const rootHostRe = new RegExp(rootHostPredicate.value);
const pathHostRe = new RegExp(pathHostPredicate.value);
const SHOULD_MATCH = ['yield.garden', 'www.yield.garden'];
const SHOULD_NOT_MATCH = ['defi.garden', 'www.defi.garden', 'myyield.garden', 'yield.gardenx', 'yield.garden.evil.com', 'notdefi.garden'];

SHOULD_MATCH.forEach((host) => {
  test(`root rule host predicate MATCHES "${host}"`, () => {
    assert.ok(rootHostRe.test(host), `expected ${rootHostPredicate.value} to match "${host}"`);
  });
  test(`catch-all rule host predicate MATCHES "${host}"`, () => {
    assert.ok(pathHostRe.test(host), `expected ${pathHostPredicate.value} to match "${host}"`);
  });
});
SHOULD_NOT_MATCH.forEach((host) => {
  test(`root rule host predicate does NOT match "${host}"`, () => {
    assert.ok(!rootHostRe.test(host), `expected ${rootHostPredicate.value} to NOT match "${host}" — a host predicate mistake here is a whole-site outage risk`);
  });
  test(`catch-all rule host predicate does NOT match "${host}"`, () => {
    assert.ok(!pathHostRe.test(host), `expected ${pathHostPredicate.value} to NOT match "${host}" — a host predicate mistake here is a whole-site outage risk`);
  });
});
test('critical: neither predicate must ever match defi.garden or www.defi.garden (the single largest risk in this item)', () => {
  assert.ok(!rootHostRe.test('defi.garden'));
  assert.ok(!rootHostRe.test('www.defi.garden'));
  assert.ok(!pathHostRe.test('defi.garden'));
  assert.ok(!pathHostRe.test('www.defi.garden'));
});

console.log('guard 5 — blast-radius: no OTHER entry anywhere has gained a "host" predicate');
test('no entry besides redirects[0] and redirects[1] carries a `has`/`missing` host predicate', () => {
  const found = hostPredicateEntries(config);
  const others = found.filter((f) => !(f.section === 'redirects' && (f.index === 0 || f.index === 1)));
  assert.deepStrictEqual(others, [], `found unexpected host-predicated entries beyond redirects[0]/[1]: ${JSON.stringify(others.map((f) => `${f.section}[${f.index}]`))} — a future run must not silently host-gate the real origin`);
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
// 0b). Each case below mutates an in-memory COPY of the real entry/config
// only — never touches the real config or disk — and proves the relevant
// assertion logic actually goes red on the mutation.

test('self-defeat: unanchoring the host value makes it match a lookalike host it must not match', () => {
  const mutated = { ...rootHostPredicate, value: rootHostPredicate.value.replace(/^\^/, '').replace(/\$$/, '') };
  const mutatedRe = new RegExp(mutated.value);
  // Unanchored, "yield.garden.evil.com" now matches where the anchored
  // pattern correctly rejected it — proving the anchored assertion above is
  // actually doing load-bearing work, not just decorative.
  assert.ok(mutatedRe.test('yield.garden.evil.com'),
    'GUARD BUG: expected the unanchored mutation to match "yield.garden.evil.com" (demonstrating why the anchors are required)');
  assert.ok(!rootHostRe.test('yield.garden.evil.com'), 'sanity: the REAL anchored pattern must still reject the lookalike host');
});

test('self-defeat: permanent:false is caught by the permanent-check', () => {
  const mutatedRoot = { ...rootEntry, permanent: false };
  const mutatedPath = { ...pathEntry, permanent: false };
  assert.throws(() => assert.strictEqual(mutatedRoot.permanent, true), /Expected values to be strictly equal/,
    'expected the permanent-check to throw on a permanent:false root-rule fixture');
  assert.throws(() => assert.strictEqual(mutatedPath.permanent, true), /Expected values to be strictly equal/,
    'expected the permanent-check to throw on a permanent:false catch-all-rule fixture');
});

test('self-defeat: a root destination that is not exactly "https://www.defi.garden/" is caught by the shape check', () => {
  const mutated = { ...rootEntry, destination: 'https://www.defi.garden/:path*' };
  assert.throws(() => assert.strictEqual(mutated.destination, 'https://www.defi.garden/'), /Expected values to be strictly equal/,
    'expected the root destination-shape check to throw on a fixture that regains :path*');
});

test('self-defeat: a catch-all destination without :path* is caught by the path-preservation check', () => {
  const mutated = { ...pathEntry, destination: 'https://www.defi.garden/' };
  assert.throws(() => assert.strictEqual(mutated.destination, 'https://www.defi.garden/:path*'), /Expected values to be strictly equal/,
    'expected the catch-all destination-shape check to throw on a fixture missing :path*');
});

test('self-defeat: a mutated copy WITH the host predicate on a third, unrelated entry is caught by the blast-radius check', () => {
  const mutated = JSON.parse(JSON.stringify(config));
  // Graft a third host-predicated rule onto an unrelated existing redirect
  // (redirects[2] — the first non-host-predicated entry after the two real
  // ones, e.g. the /tokens/index rule).
  mutated.redirects[2].has = (mutated.redirects[2].has || []).concat([{ type: 'host', value: '^evil\\.example$' }]);
  const found = hostPredicateEntries(mutated);
  const others = found.filter((f) => !(f.section === 'redirects' && (f.index === 0 || f.index === 1)));
  assert.notDeepStrictEqual(others, [], 'GUARD BUG: expected the blast-radius scan to detect the grafted third host predicate, but it found none');
});

test('self-defeat: deleting the root rule from an in-memory copy makes guard 1 non-vacuous (proves the root-rule check actually checks something)', () => {
  const mutated = JSON.parse(JSON.stringify(config));
  mutated.redirects.splice(0, 1); // remove the root rule; catch-all shifts to index 0
  const found = hostPredicateEntries(mutated);
  assert.throws(() => {
    assert.strictEqual(found.length, 2);
  }, assert.AssertionError, 'GUARD BUG: expected guard 1\'s count check to throw once the root rule is removed (only one host-predicated entry remains)');
  assert.strictEqual(found.length, 1, 'sanity: with the root rule removed, exactly one host-predicated entry (the catch-all) should remain');
});

console.log(`\n${passed} assertions passed.`);
if (process.exitCode) { console.error('\n❌ some assertions failed'); }
