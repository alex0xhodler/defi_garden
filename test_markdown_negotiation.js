/* Unit tests for vercel.json's Markdown content-negotiation rules (spec 212).
   Offline — parses vercel.json directly, no network/server involved. Models
   itself on test_cache_headers.js's parse-and-assert pattern.

   Builds a small first-match-wins rewrite/header matcher that mirrors this
   repo's own `source`/`has`/`missing` predicate conventions (":param" path
   segments + literal regex fragments already used verbatim in vercel.json,
   e.g. "/(.*)\\.(js|css)") and walks `rewrites`/`headers` in array order —
   the same order Vercel itself evaluates them in.

   Run: node test_markdown_negotiation.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const raw = fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8');
const config = JSON.parse(raw);

console.log('vercel.json — still valid JSON');
test('parses without throwing and has the expected top-level shape', () => {
  assert.ok(Array.isArray(config.rewrites));
  assert.ok(Array.isArray(config.headers));
  assert.strictEqual(config.cleanUrls, true, 'cleanUrls must stay true — leg 4 depends on it (territory note 1)');
});

// ---------------------------------------------------------------------------
// Matcher — mirrors Vercel's own semantics closely enough for this file's
// rules: `:param` segments capture exactly one path segment (no slash); any
// other regex-looking syntax already present in a `source` string (parens,
// alternation, `.*`) is left untouched and used directly as a regex, which is
// this repo's own established convention (see the pre-existing "/(.*)" and
// "/(.*)\\.(js|css)" header sources).
// ---------------------------------------------------------------------------
function pathToRegex(source) {
  // Vercel/path-to-regexp custom-constrained named params first — e.g.
  // ":slug([^/.]+)" (the point-1 fix: excludes dots so /tokens/usdc.md can
  // never match and get rewritten to /tokens/usdc.md.md) — THEN plain
  // ":name" tokens (unconstrained, matches one non-slash segment).
  let pattern = source.replace(/:[A-Za-z_][A-Za-z0-9_]*\(([^)]+)\)/g, (m, re) => `(${re})`);
  pattern = pattern.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '([^/]+)');
  return new RegExp('^' + pattern + '$');
}

function paramNamesOf(source) {
  return [...source.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]+\))?/g)].map(m => m[1]);
}

function hasMatches(hasList, query, headers) {
  return (hasList || []).every(h => {
    if (h.type === 'header') {
      const val = headers[h.key.toLowerCase()];
      if (val == null) return false;
      if (h.value == null) return true;
      return new RegExp(h.value).test(val);
    }
    if (h.type === 'query') {
      if (!(h.key in query)) return false;
      if (h.value == null) return true;
      return new RegExp(h.value).test(String(query[h.key]));
    }
    return false;
  });
}

function missingMatches(missingList, query, headers) {
  return (missingList || []).every(m => {
    if (m.type === 'query') return !(m.key in query);
    if (m.type === 'header') return headers[m.key.toLowerCase()] == null;
    return true;
  });
}

/** Returns the first matching rewrite rule for (reqPath, query, headers), or
 * null. First-match-wins, in `config.rewrites` array order — exactly how
 * Vercel itself evaluates the rewrite table. */
function findRewrite(reqPath, query, headers) {
  for (const rule of config.rewrites) {
    const re = pathToRegex(rule.source);
    if (!re.test(reqPath)) continue;
    if (rule.has && !hasMatches(rule.has, query, headers)) continue;
    if (rule.missing && !missingMatches(rule.missing, query, headers)) continue;
    return rule;
  }
  return null;
}

function resolveDestination(rule, reqPath) {
  const re = pathToRegex(rule.source);
  const m = re.exec(reqPath);
  const names = paramNamesOf(rule.source);
  let dest = rule.destination;
  names.forEach((name, i) => { dest = dest.split(':' + name).join(m[i + 1]); });
  return dest;
}

/** All header rules matching (reqPath, headers), merged in array order
 * (later matching rule's same-key value wins) — mirrors how Vercel applies
 * every matching `headers` entry cumulatively, unlike rewrites. */
function mergedHeaders(reqPath, query, headers) {
  const out = {};
  for (const rule of config.headers) {
    const re = pathToRegex(rule.source);
    if (!re.test(reqPath)) continue;
    if (rule.has && !hasMatches(rule.has, query, headers)) continue;
    if (rule.missing && !missingMatches(rule.missing, query, headers)) continue;
    (rule.headers || []).forEach(h => { out[h.key] = h.value; });
  }
  return out;
}

const MARKDOWN_ACCEPT = { accept: 'text/markdown' };
const HTML_ACCEPT = { accept: 'text/html' };

// ---------------------------------------------------------------------------
// Acceptance criteria assertions.
// ---------------------------------------------------------------------------

console.log('the one correct case today — unchanged');
test('/ + Accept:text/markdown, no query -> /llms.txt', () => {
  const rule = findRewrite('/', {}, MARKDOWN_ACCEPT);
  assert.ok(rule, 'expected a matching rewrite for / + markdown');
  assert.strictEqual(rule.destination, '/llms.txt');
});
test('/?lang=ko + Accept:text/markdown -> still /llms.txt (lang is not content-selecting)', () => {
  const rule = findRewrite('/', { lang: 'ko' }, MARKDOWN_ACCEPT);
  assert.ok(rule);
  assert.strictEqual(rule.destination, '/llms.txt');
});

console.log('the silent generic fallback is gone (leg 3)');
// Leg 3 is unconditional (spec 212: "markdown negotiation on a path with no
// twin must serve the normal HTML response, NOT llms.txt") — this covers
// BOTH the analytics app's own query surface (token/chain/pool/protocols/
// poolTypes/minTvl/minApy) AND home.html's PLANNER_PARAMS array, which
// switches "/" into the planner. "/?goal=retirement&monthly=200" renders the
// planner and must not fall back to the site index either.
// "app" (round 3): home.html:77 puts it in ANALYTICS_PARAMS itself — it is
// the documented way to reach the analytics app from the planner
// (planner.js:3863's "📊 Analytics" header link is literally `/?app=1`, and
// PoolDetail.js:396 emits it in breadcrumb JSON-LD) — a real, live-linked
// URL, not a hypothetical.
const CONTENT_SELECTING_PARAMS = [
  'token', 'chain', 'pool', 'protocols', 'poolTypes', 'minTvl', 'minApy', 'app',
  'goal', 'monthly', 'years', 'pace', 'preset', 'fresh', 'capital', 'fm', 'dl',
];
CONTENT_SELECTING_PARAMS.forEach(key => {
  test(`/?${key}=x + Accept:text/markdown -> NOT /llms.txt (falls through to /home)`, () => {
    const rule = findRewrite('/', { [key]: 'x' }, MARKDOWN_ACCEPT);
    assert.ok(rule, 'expected SOME rewrite to match (the plain "/" -> "/home" rule)');
    assert.notStrictEqual(rule.destination, '/llms.txt', `?${key}= must not fall back to llms.txt`);
    assert.strictEqual(rule.destination, '/home', `?${key}= + markdown Accept should land on the same /home rewrite as a normal browser request`);
  });
});
test('multiple content-selecting params together still avoid llms.txt', () => {
  const rule = findRewrite('/', { token: 'USDC', minTvl: '10000000' }, MARKDOWN_ACCEPT);
  assert.strictEqual(rule.destination, '/home');
});
test('planner share URL (goal+monthly together) + Accept:text/markdown -> NOT /llms.txt', () => {
  const rule = findRewrite('/', { goal: 'retirement', monthly: '200' }, MARKDOWN_ACCEPT);
  assert.strictEqual(rule.destination, '/home', '/?goal=...&monthly=... renders the planner, not the site index — must not fall back to llms.txt');
});
test('the exact live-linked URL /?app=1 + Accept:text/markdown -> resolves to the HTML app, never /llms.txt', () => {
  // The real link planner.js:3863 renders ("📊 Analytics — search yields")
  // and PoolDetail.js:396 emits in breadcrumb JSON-LD — not a synthetic key.
  // Round 4: "app" was moved OUT of the `missing` list (Vercel's schema caps
  // `missing`/`has` at 16 entries — see the schema-cap section below) and
  // into a dedicated shadow rewrite, `{"source":"/","has":[{"type":"query",
  // "key":"app"}],"destination":"/home"}`, placed BEFORE the llms.txt rule —
  // first-match-wins, so this is fully deterministic, no ordering assumption
  // beyond the one Vercel already documents for rewrites.
  const rule = findRewrite('/', { app: '1' }, MARKDOWN_ACCEPT);
  assert.ok(rule, 'expected SOME rewrite to match /?app=1');
  assert.notStrictEqual(rule.destination, '/llms.txt', '/?app=1 must not fall back to the site index');
  assert.strictEqual(rule.destination, '/home', '/?app=1 + markdown Accept should resolve the same as a normal browser request (the analytics app)');
});
test('/?app=1 WITHOUT the markdown Accept header -> still /home, never /llms.txt (the shadow rule is unconditional on Accept)', () => {
  const rule = findRewrite('/', { app: '1' }, HTML_ACCEPT);
  assert.ok(rule, 'expected SOME rewrite to match /?app=1');
  assert.strictEqual(rule.destination, '/home');
});
test('bare "/" + Accept:text/markdown (no query at all) still -> /llms.txt (no-regress: the app shadow rule must not shadow the true root)', () => {
  const rule = findRewrite('/', {}, MARKDOWN_ACCEPT);
  assert.ok(rule);
  assert.strictEqual(rule.destination, '/llms.txt', 'the new /?app=1 shadow rewrite must not match a request with no "app" query param at all');
});
test('the /?app=1 shadow rewrite is ordered BEFORE the "/" -> "/llms.txt" rewrite (first-match-wins)', () => {
  const shadowIdx = config.rewrites.findIndex(r => r.source === '/' && r.destination === '/home' &&
    (r.has || []).some(h => h.type === 'query' && h.key === 'app'));
  const llmsIdx = config.rewrites.findIndex(r => r.source === '/' && r.destination === '/llms.txt');
  assert.ok(shadowIdx !== -1, 'expected the /?app=1 shadow rewrite to exist');
  assert.ok(llmsIdx !== -1, 'expected the "/" -> "/llms.txt" rewrite to exist');
  assert.ok(shadowIdx < llmsIdx, 'the /?app=1 shadow rewrite must come before the llms.txt rewrite');
});

console.log('path-aware negotiation — static estate twins');
const STATIC_ESTATE_CASES = [
  ['/tokens/usdc', '/tokens/usdc.md'],
  ['/chains/solana', '/chains/solana.md'],
  ['/ko/tokens/usdc', '/ko/tokens/usdc.md'],
  ['/ko/chains/solana', '/ko/chains/solana.md'],
];
STATIC_ESTATE_CASES.forEach(([reqPath, expectedDest]) => {
  test(`${reqPath} + Accept:text/markdown -> ${expectedDest}`, () => {
    const rule = findRewrite(reqPath, {}, MARKDOWN_ACCEPT);
    assert.ok(rule, `expected a markdown rewrite for ${reqPath}`);
    assert.strictEqual(resolveDestination(rule, reqPath), expectedDest);
  });
  test(`${reqPath} WITHOUT the markdown Accept header -> no markdown rewrite`, () => {
    const rule = findRewrite(reqPath, {}, HTML_ACCEPT);
    assert.ok(!rule || !rule.destination.endsWith('.md'), `${reqPath} must not get a .md destination without Accept:text/markdown`);
  });
});

console.log('no twin -> HTML, never markdown (:slug matches exactly one path segment)');
test('/tokens + markdown -> no markdown rewrite (1 segment, no :slug match)', () => {
  const rule = findRewrite('/tokens', {}, MARKDOWN_ACCEPT);
  assert.ok(!rule || !rule.destination.endsWith('.md'), '/tokens must not resolve to a .md destination');
});
test('/tokens/az/a + markdown -> no markdown rewrite (3 segments, no :slug match)', () => {
  const rule = findRewrite('/tokens/az/a', {}, MARKDOWN_ACCEPT);
  assert.ok(!rule || !rule.destination.endsWith('.md'), '/tokens/az/a must not resolve to a .md destination');
});

console.log('point 1 — :slug is dot-constrained: a literal *.md request is never double-rewritten');
['/tokens/usdc.md', '/chains/solana.md', '/ko/tokens/usdc.md', '/ko/chains/solana.md'].forEach(reqPath => {
  test(`${reqPath} + Accept:text/markdown -> NOT rewritten to ${reqPath}.md (no double extension)`, () => {
    const rule = findRewrite(reqPath, {}, MARKDOWN_ACCEPT);
    // Either nothing matches (the file is served as-is, which is correct —
    // it's already the real markdown file) or, if something DOES match, it
    // must never append a second ".md".
    if (rule) {
      assert.notStrictEqual(resolveDestination(rule, reqPath), reqPath + '.md',
        `${reqPath} must not resolve to a double .md.md destination`);
      assert.ok(!resolveDestination(rule, reqPath).endsWith('.md.md'), `${reqPath} produced a double .md.md destination`);
    }
  });
});
test('sanity: the constrained pattern actually excludes dotted segments (regex-level check)', () => {
  const rule = config.rewrites.find(r => r.source === '/tokens/:slug([^/.]+)');
  assert.ok(rule, 'expected the constrained /tokens/:slug([^/.]+) rewrite to exist');
  const re = pathToRegex(rule.source);
  assert.ok(!re.test('/tokens/usdc.md'), '/tokens/:slug([^/.]+) must not match a dotted segment');
  assert.ok(re.test('/tokens/usdc'), '/tokens/:slug([^/.]+) must still match a normal slug');
});

console.log('point 2 — /tokens/index, /chains/index, /ko/.../index resolve to their real HTML, never a phantom .md');
const INDEX_PASSTHROUGH_CASES = [
  ['/tokens/index', '/tokens/index.html'],
  ['/chains/index', '/chains/index.html'],
  ['/ko/tokens/index', '/ko/tokens/index.html'],
  ['/ko/chains/index', '/ko/chains/index.html'],
];
INDEX_PASSTHROUGH_CASES.forEach(([reqPath, expectedDest]) => {
  test(`${reqPath} + Accept:text/markdown -> ${expectedDest} (passthrough wins before the slug rule)`, () => {
    const rule = findRewrite(reqPath, {}, MARKDOWN_ACCEPT);
    assert.ok(rule, `expected a rewrite to match ${reqPath}`);
    assert.strictEqual(rule.destination, expectedDest);
  });
  test(`${reqPath} WITHOUT the markdown Accept header -> same HTML passthrough (unconditional)`, () => {
    const rule = findRewrite(reqPath, {}, HTML_ACCEPT);
    assert.ok(rule, `expected a rewrite to match ${reqPath} even without Accept:text/markdown`);
    assert.strictEqual(rule.destination, expectedDest);
  });
});
test('the index passthroughs are ordered BEFORE the four markdown :slug rewrites (first-match-wins)', () => {
  const idx = i => config.rewrites.findIndex(r => r.source === i);
  const slugIdx = s => config.rewrites.findIndex(r => r.source === s);
  ['/tokens/index', '/chains/index', '/ko/tokens/index', '/ko/chains/index'].forEach(p => {
    assert.ok(idx(p) !== -1, `expected an explicit passthrough rewrite for ${p}`);
  });
  const firstSlugRuleIdx = Math.min(
    slugIdx('/tokens/:slug([^/.]+)'), slugIdx('/chains/:slug([^/.]+)'),
    slugIdx('/ko/tokens/:slug([^/.]+)'), slugIdx('/ko/chains/:slug([^/.]+)'));
  const lastIndexPassthroughIdx = Math.max(
    idx('/tokens/index'), idx('/chains/index'), idx('/ko/tokens/index'), idx('/ko/chains/index'));
  assert.ok(lastIndexPassthroughIdx < firstSlugRuleIdx, 'index passthroughs must be ordered before the :slug markdown rewrites');
});

console.log('leg 4 — /plan is a cleanUrls redirect target, not a negotiation defect (territory note 1)');
test('/plan + markdown -> no markdown rewrite', () => {
  const rule = findRewrite('/plan', {}, MARKDOWN_ACCEPT);
  assert.ok(!rule || !rule.destination.endsWith('.md'), '/plan must not resolve to a .md destination');
  assert.ok(!rule || rule.destination !== '/llms.txt', '/plan must never fall back to llms.txt');
});
test('cleanUrls is still true (leg 4 ships as an assertion, no cleanUrls change)', () => {
  assert.strictEqual(config.cleanUrls, true);
});

console.log('header assertions — negotiated + direct .md responses');
test('negotiated markdown response on /tokens/:slug carries Content-Type/Vary/X-Robots-Tag', () => {
  const h = mergedHeaders('/tokens/usdc', {}, MARKDOWN_ACCEPT);
  assert.ok(/text\/markdown/.test(h['Content-Type'] || ''), 'missing text/markdown Content-Type');
  assert.strictEqual(h['Vary'], 'Accept');
  assert.strictEqual(h['X-Robots-Tag'], 'noindex');
});
['/chains/solana', '/ko/tokens/usdc', '/ko/chains/solana'].forEach(p => {
  test(`negotiated markdown response on ${p} carries Content-Type/Vary/X-Robots-Tag`, () => {
    const h = mergedHeaders(p, {}, MARKDOWN_ACCEPT);
    assert.ok(/text\/markdown/.test(h['Content-Type'] || ''), 'missing text/markdown Content-Type');
    assert.strictEqual(h['Vary'], 'Accept');
    assert.strictEqual(h['X-Robots-Tag'], 'noindex');
  });
});
test('direct .md request carries Content-Type text/markdown + X-Robots-Tag noindex', () => {
  const h = mergedHeaders('/tokens/usdc.md', {}, HTML_ACCEPT);
  assert.ok(/text\/markdown/.test(h['Content-Type'] || ''), 'missing text/markdown Content-Type on a direct .md request');
  assert.strictEqual(h['X-Robots-Tag'], 'noindex');
});
test('/tokens/:slug, /chains/:slug, /ko/... carry an UNCONDITIONAL Vary:Accept even without the markdown Accept header', () => {
  ['/tokens/usdc', '/chains/solana', '/ko/tokens/usdc', '/ko/chains/solana'].forEach(p => {
    const h = mergedHeaders(p, {}, HTML_ACCEPT);
    assert.strictEqual(h['Vary'], 'Accept', `${p} must always carry Vary: Accept so a shared cache can't serve markdown to a browser`);
  });
});
test('/?app=1 + Accept:text/markdown -> Content-Type is overridden back to text/html (the override rule, placed AFTER the markdown rule)', () => {
  // Depends on Vercel's documented "every matching header rule applies, in
  // order, later overrides earlier for the same key" behavior — the ONE
  // assumption in this item that is not first-match-wins. Honestly flagged:
  // worst case if this assumption is ever wrong is /?app=1 (a human-clicked
  // header link, not an agent target) getting an HTML body mislabeled
  // text/markdown — the BODY is still correct HTML either way, because the
  // rewrite leg (asserted above) is what actually decides the body. Smallest
  // possible blast radius, which is why "app" is the param moved this way.
  const h = mergedHeaders('/', { app: '1' }, MARKDOWN_ACCEPT);
  assert.strictEqual(h['Content-Type'], 'text/html; charset=utf-8', 'expected the override rule to win, restoring text/html for /?app=1');
  assert.strictEqual(h['Vary'], 'Accept');
});
test('/?app=1 WITHOUT the markdown Accept header -> no markdown Content-Type leaks through at all', () => {
  const h = mergedHeaders('/', { app: '1' }, HTML_ACCEPT);
  assert.ok(!h['Content-Type'] || !/markdown/.test(h['Content-Type']), '/?app=1 with a normal Accept header must never carry a markdown Content-Type');
});
test('the app override header rule is ordered AFTER the "/" markdown header rule (later-overrides-earlier)', () => {
  const markdownRuleIdx = config.headers.findIndex(r =>
    r.source === '/' && r.has && (r.headers || []).some(h => h.key === 'Content-Type' && /markdown/.test(h.value)));
  const overrideRuleIdx = config.headers.findIndex(r =>
    r.source === '/' && (r.has || []).some(h => h.type === 'query' && h.key === 'app') &&
    (r.headers || []).some(h => h.key === 'Content-Type' && h.value === 'text/html; charset=utf-8'));
  assert.ok(markdownRuleIdx !== -1, 'expected the "/" markdown header rule to exist');
  assert.ok(overrideRuleIdx !== -1, 'expected the /?app=1 override header rule to exist');
  assert.ok(overrideRuleIdx > markdownRuleIdx, 'the app override header rule must come AFTER the markdown header rule to win');
});

console.log('drift guard (PRIMARY) — the "/" missing-list must equal home.html\'s OWN router arrays, exactly');
// Round-3 fix: a `.get('key')` source scan is structurally blind to
// ARRAY-DRIVEN `.has()` mode-selection — exactly how home.html's router
// decides "app" switches "/" into analytics mode
// (`ANALYTICS_PARAMS.some(k => params.has(k))`, home.html:79). A pure
// `.get()` scan can never see a key that's only ever read via `.has()`
// against a shared array, so it isn't a gap in an otherwise-right guard —
// it's watching the wrong mechanism entirely.
//
// ANALYTICS_PARAMS ∪ PLANNER_PARAMS (home.html's own router) ARE the
// definition of "this query string changes what '/' serves" — so the
// correct invariant is exact-set-equality against THOSE two arrays, parsed
// straight out of home.html's source, not re-derived independently (that
// would just be a second copy that could itself drift).
function deriveRouterParamArray(content, varName) {
  const re = new RegExp('var\\s+' + varName + '\\s*=\\s*\\[([^\\]]*)\\]');
  const m = content.match(re);
  assert.ok(m, `expected to find a "var ${varName} = [...]" array literal in home.html`);
  return [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map(mm => mm[1] != null ? mm[1] : mm[2]);
}
const homeHtmlSrc = fs.readFileSync(path.join(__dirname, 'home.html'), 'utf8');
const ROUTER_ANALYTICS_PARAMS = deriveRouterParamArray(homeHtmlSrc, 'ANALYTICS_PARAMS');
const ROUTER_PLANNER_PARAMS = deriveRouterParamArray(homeHtmlSrc, 'PLANNER_PARAMS');
const ROUTER_PARAMS = new Set([...ROUTER_ANALYTICS_PARAMS, ...ROUTER_PLANNER_PARAMS]);

test('sanity: the router arrays parsed out of home.html look right (non-empty, contain known members)', () => {
  assert.ok(ROUTER_ANALYTICS_PARAMS.includes('token') && ROUTER_ANALYTICS_PARAMS.includes('app'),
    'ANALYTICS_PARAMS parse looks wrong — expected it to include "token" and "app"');
  assert.ok(ROUTER_PLANNER_PARAMS.includes('goal'), 'PLANNER_PARAMS parse looks wrong — expected it to include "goal"');
  assert.strictEqual(ROUTER_PARAMS.size, ROUTER_ANALYTICS_PARAMS.length + ROUTER_PLANNER_PARAMS.length,
    'sanity: the two router arrays are expected to be disjoint (no shared key)');
});

// Round 4: Vercel's schema caps EVERY `has`/`missing` array at 16 entries
// ("headers[1].missing should NOT have more than 16 items" — the PR #369
// deploy failure). 17 router params can't fit a single negative `missing`
// list, so "app" now travels as a POSITIVE rule instead (a shadow rewrite +
// a header override, both on source "/"). The invariant is unchanged — the
// covered-param set must still equal ANALYTICS_PARAMS ∪ PLANNER_PARAMS
// exactly — but "covered" now means "in `missing` OR named by a positive
// query-`has` rule on the SAME source that routes/overrides away from the
// llms.txt destination/content-type", not "in `missing`" alone.
//
// Round 5: membership alone is not enough — a positive rule only WORKS if
// it's correctly ORDERED relative to the rule it's meant to pre-empt/override
// (rewrites: first-match-wins, so a shadow rule must come BEFORE llms.txt;
// headers: later-overrides-earlier, so an override must come AFTER the
// markdown rule). A rule that's present but misordered is silently useless —
// exactly the failure mode "app" almost shipped with in attempt 1 of round 4
// — so these scans are now ORDERING-aware: a rule in the wrong position does
// NOT count as coverage, full stop, regardless of whether it's "there".
// Parameterized on `cfg` (not the closed-over `config`) so a test below can
// feed it a mutated clone and prove the ordering check actually bites.
function positiveRewriteKeys(cfg) {
  const rewrites = cfg.rewrites;
  const llmsIdx = rewrites.findIndex(r => r.source === '/' && r.destination === '/llms.txt');
  const keys = new Set();
  rewrites.forEach((r, i) => {
    if (r.source !== '/' || r.destination === '/llms.txt') return;
    const queryKeys = (r.has || []).filter(h => h.type === 'query').map(h => h.key);
    if (!queryKeys.length) return;
    if (llmsIdx === -1 || i >= llmsIdx) return; // misordered (or llms.txt rule missing) — does NOT count
    queryKeys.forEach(k => keys.add(k));
  });
  return keys;
}
function positiveHeaderKeys(cfg) {
  const headers = cfg.headers;
  const markdownIdx = headers.findIndex(r => r.source === '/' && (r.headers || []).some(h => h.key === 'Content-Type' && /markdown/.test(h.value)));
  const keys = new Set();
  headers.forEach((r, i) => {
    if (r.source !== '/') return;
    const isTheMarkdownRule = (r.headers || []).some(h => h.key === 'Content-Type' && /markdown/.test(h.value));
    if (isTheMarkdownRule) return; // that's the rule being covered FOR, not a positive override of it
    const hasMarkdownAcceptPredicate = (r.has || []).some(h => h.type === 'header' && h.key === 'Accept' && /markdown/.test(h.value || ''));
    if (!hasMarkdownAcceptPredicate) return; // only rules that specifically react to markdown Accept count
    const queryKeys = (r.has || []).filter(h => h.type === 'query').map(h => h.key);
    if (!queryKeys.length) return;
    if (markdownIdx === -1 || i <= markdownIdx) return; // misordered (or markdown rule missing) — does NOT count
    queryKeys.forEach(k => keys.add(k));
  });
  return keys;
}

function assertCoverageEqualsRouterParams(rule, positiveKeys, label) {
  const missingKeys = new Set((rule.missing || []).map(m => m.key));
  const coveredKeys = new Set([...missingKeys, ...positiveKeys]);
  const notCovered = [...ROUTER_PARAMS].filter(k => !coveredKeys.has(k));
  const extra = [...coveredKeys].filter(k => !ROUTER_PARAMS.has(k));
  assert.deepStrictEqual(notCovered, [],
    `${label}: router param(s) not covered by missing-list ∪ correctly-ordered positive rules (would silently fall back to llms.txt / wrong Content-Type — check for a MISORDERED positive rule, not just a missing one): ${notCovered.join(', ')}`);
  assert.deepStrictEqual(extra, [],
    `${label}: covered-set has key(s) that are not real router params — drifted or typo'd: ${extra.join(', ')}`);
}

/** Direct ordering assertions (round 5) — separate from the coverage-equality
 * assertions above so a failure message says "misordered", not just
 * "uncovered param": every positive-rule-SHAPED entry on source "/" (has a
 * query-type `has` predicate) must sit on the correct side of the rule it's
 * meant to pre-empt/override, by name, regardless of whether ANY key ends up
 * uncovered overall. */
function assertPositiveRewriteOrdering(cfg) {
  const rewrites = cfg.rewrites;
  const llmsIdx = rewrites.findIndex(r => r.source === '/' && r.destination === '/llms.txt');
  assert.ok(llmsIdx !== -1, 'expected the "/" -> "/llms.txt" rewrite to exist');
  rewrites.forEach((r, i) => {
    if (r.source !== '/' || r.destination === '/llms.txt') return;
    const queryKeys = (r.has || []).filter(h => h.type === 'query').map(h => h.key);
    if (!queryKeys.length) return;
    assert.ok(i < llmsIdx,
      `positive rewrite for [${queryKeys.join(',')}] at rewrites[${i}] must be ordered BEFORE the "/" -> "/llms.txt" rewrite at rewrites[${llmsIdx}] (first-match-wins) — it is currently AFTER it and is therefore dead code`);
  });
}
function assertPositiveHeaderOrdering(cfg) {
  const headers = cfg.headers;
  const markdownIdx = headers.findIndex(r => r.source === '/' && (r.headers || []).some(h => h.key === 'Content-Type' && /markdown/.test(h.value)));
  assert.ok(markdownIdx !== -1, 'expected the "/" markdown header rule to exist');
  headers.forEach((r, i) => {
    if (r.source !== '/') return;
    const isTheMarkdownRule = (r.headers || []).some(h => h.key === 'Content-Type' && /markdown/.test(h.value));
    if (isTheMarkdownRule) return;
    const hasMarkdownAcceptPredicate = (r.has || []).some(h => h.type === 'header' && h.key === 'Accept' && /markdown/.test(h.value || ''));
    const queryKeys = (r.has || []).filter(h => h.type === 'query').map(h => h.key);
    if (!hasMarkdownAcceptPredicate || !queryKeys.length) return;
    assert.ok(i > markdownIdx,
      `positive header override for [${queryKeys.join(',')}] at headers[${i}] must be ordered AFTER the "/" markdown header rule at headers[${markdownIdx}] (later-overrides-earlier) — it is currently BEFORE it and is therefore overridden BY the markdown rule instead of overriding it`);
  });
}

test('the "/" -> "/llms.txt" REWRITE\'s missing-list ∪ correctly-ordered positive shadow-rewrite keys EXACTLY equals ANALYTICS_PARAMS ∪ PLANNER_PARAMS', () => {
  const rootMarkdownRewrite = config.rewrites.find(r => r.source === '/' && r.destination === '/llms.txt');
  assert.ok(rootMarkdownRewrite, 'expected the "/" -> "/llms.txt" markdown rewrite to exist');
  assertCoverageEqualsRouterParams(rootMarkdownRewrite, positiveRewriteKeys(config), 'rewrite');
});
test('the "/" markdown HEADER rule\'s missing-list ∪ correctly-ordered positive override-rule keys EXACTLY equals ANALYTICS_PARAMS ∪ PLANNER_PARAMS (must travel with the rewrite)', () => {
  const rootMarkdownHeaderRule = config.headers.find(r =>
    r.source === '/' && r.has && (r.headers || []).some(h => h.key === 'Content-Type' && /markdown/.test(h.value)));
  assert.ok(rootMarkdownHeaderRule, 'expected the "/" markdown header rule (Content-Type: text/markdown) to exist');
  assertCoverageEqualsRouterParams(rootMarkdownHeaderRule, positiveHeaderKeys(config), 'header rule');
});
test('every positive-rule-shaped rewrite on source "/" is correctly ordered relative to the "/llms.txt" rewrite (direct ordering assertion)', () => {
  assertPositiveRewriteOrdering(config);
});
test('every positive-rule-shaped header override on source "/" is correctly ordered relative to the markdown header rule (direct ordering assertion)', () => {
  assertPositiveHeaderOrdering(config);
});

console.log('proof the ordering-aware guard actually bites (round 5 — a guard never shown to fail is not known to work)');
test('moving the /?app=1 shadow rewrite to AFTER "/llms.txt" makes the ordering-aware scan stop counting "app" as covered', () => {
  const mutated = JSON.parse(JSON.stringify(config));
  const llmsIdxBefore = mutated.rewrites.findIndex(r => r.source === '/' && r.destination === '/llms.txt');
  const shadowIdxBefore = mutated.rewrites.findIndex(r =>
    r.source === '/' && r.destination === '/home' && (r.has || []).some(h => h.type === 'query' && h.key === 'app'));
  assert.ok(shadowIdxBefore !== -1 && llmsIdxBefore !== -1 && shadowIdxBefore < llmsIdxBefore,
    'sanity: the real vercel.json must start with the shadow rewrite correctly BEFORE llms.txt');
  assert.ok(positiveRewriteKeys(mutated).has('app'), 'sanity: before mutation, "app" counts as covered');

  const [shadowRule] = mutated.rewrites.splice(shadowIdxBefore, 1);
  const llmsIdxAfterRemoval = mutated.rewrites.findIndex(r => r.source === '/' && r.destination === '/llms.txt');
  mutated.rewrites.splice(llmsIdxAfterRemoval + 1, 0, shadowRule); // now strictly AFTER llms.txt

  const keysAfterBreak = positiveRewriteKeys(mutated);
  assert.ok(!keysAfterBreak.has('app'),
    'GUARD BUG: moving the shadow rewrite after "/llms.txt" should stop "app" from counting as covered, but it still does');

  // And the actual coverage-equality assertion, run against the mutated
  // fixture, must now throw and name "app" — not silently pass.
  const mutatedRootRewrite = mutated.rewrites.find(r => r.source === '/' && r.destination === '/llms.txt');
  assert.throws(
    () => assertCoverageEqualsRouterParams(mutatedRootRewrite, positiveRewriteKeys(mutated), 'rewrite (mutated fixture)'),
    /app/,
    'expected the coverage-equality assertion to throw, naming "app", once its shadow rewrite is misordered'
  );
  // ...and the direct ordering assertion must throw too, independently.
  assert.throws(
    () => assertPositiveRewriteOrdering(mutated),
    /app/,
    'expected the direct ordering assertion to throw, naming "app", once its shadow rewrite is misordered'
  );
});
test('moving the /?app=1 header override to BEFORE the markdown header rule makes the ordering-aware scan stop counting "app" as covered', () => {
  const mutated = JSON.parse(JSON.stringify(config));
  const markdownIdxBefore = mutated.headers.findIndex(r =>
    r.source === '/' && (r.headers || []).some(h => h.key === 'Content-Type' && /markdown/.test(h.value)));
  const overrideIdxBefore = mutated.headers.findIndex(r =>
    r.source === '/' && (r.has || []).some(h => h.type === 'query' && h.key === 'app') &&
    (r.headers || []).some(h => h.key === 'Content-Type' && h.value === 'text/html; charset=utf-8'));
  assert.ok(markdownIdxBefore !== -1 && overrideIdxBefore !== -1 && overrideIdxBefore > markdownIdxBefore,
    'sanity: the real vercel.json must start with the override rule correctly AFTER the markdown rule');
  assert.ok(positiveHeaderKeys(mutated).has('app'), 'sanity: before mutation, "app" counts as covered');

  const [overrideRule] = mutated.headers.splice(overrideIdxBefore, 1);
  const markdownIdxAfterRemoval = mutated.headers.findIndex(r =>
    r.source === '/' && (r.headers || []).some(h => h.key === 'Content-Type' && /markdown/.test(h.value)));
  mutated.headers.splice(markdownIdxAfterRemoval, 0, overrideRule); // now strictly BEFORE the markdown rule

  const keysAfterBreak = positiveHeaderKeys(mutated);
  assert.ok(!keysAfterBreak.has('app'),
    'GUARD BUG: moving the header override before the markdown rule should stop "app" from counting as covered, but it still does');

  const mutatedRootHeaderRule = mutated.headers.find(r =>
    r.source === '/' && r.has && (r.headers || []).some(h => h.key === 'Content-Type' && /markdown/.test(h.value)));
  assert.throws(
    () => assertCoverageEqualsRouterParams(mutatedRootHeaderRule, positiveHeaderKeys(mutated), 'header rule (mutated fixture)'),
    /app/,
    'expected the coverage-equality assertion to throw, naming "app", once its header override is misordered'
  );
  assert.throws(
    () => assertPositiveHeaderOrdering(mutated),
    /app/,
    'expected the direct ordering assertion to throw, naming "app", once its header override is misordered'
  );
});

console.log('drift guard (secondary) — a .get(\'key\') source scan, for params read OUTSIDE the router array mechanism');
// Weaker and narrower than the primary guard above (it is exactly what
// missed "app" — see the round-3 note) — kept only because it independently
// covers params that are read via `.get()` somewhere in the source but are
// NOT part of home.html's router arrays at all (mix/pitch/waitlist/src/ref/
// lang). Those are excluded STRUCTURALLY now (derived from ROUTER_PARAMS,
// not a hand-maintained comment list) — if one of them ever gets added to
// ANALYTICS_PARAMS/PLANNER_PARAMS, the PRIMARY guard above is what will
// catch it; this secondary check's only job is "don't regress a key that
// IS a router param but somehow stops being read via .get() too" — a much
// weaker property, retained for the coverage it still adds cheaply.
function deriveGetParams(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const re = /(?:searchParams|params|urlParams)\.get\(\s*(['"])([A-Za-z0-9_]+)\1\s*\)/g;
  const found = new Set();
  let m;
  while ((m = re.exec(content))) found.add(m[2]);
  return found;
}
test('every .get(\'key\') param found in app.js/home.html/planner.js that IS a router param is covered by the missing-list', () => {
  const derived = new Set();
  ['app.js', 'home.html', 'planner.js'].forEach(f => {
    deriveGetParams(path.join(__dirname, f)).forEach(k => derived.add(k));
  });
  assert.ok(derived.size > 0, 'sanity: expected at least one .get(\'...\') param to be found');

  const rootMarkdownRewrite = config.rewrites.find(r => r.source === '/' && r.destination === '/llms.txt');
  const coveredKeys = new Set([...(rootMarkdownRewrite.missing || []).map(m => m.key), ...positiveRewriteKeys(config)]);

  const unexplained = [...derived].filter(key => ROUTER_PARAMS.has(key) && !coveredKeys.has(key));
  assert.deepStrictEqual(unexplained, [],
    `.get()-read param(s) that ARE router params but are NOT covered by missing-list ∪ positive rules: ${unexplained.join(', ')}`);
});
test('no OTHER array-driven .has()-style mode selection exists on "/" beyond ANALYTICS_PARAMS/PLANNER_PARAMS (explicit check, not implied)', () => {
  // home.html's router is a single self-contained IIFE (lines ~75-130) that
  // computes __APP_MODE from exactly these two arrays plus the /plan.html
  // path test — grep the whole router block for any OTHER "params.has(" /
  // "searchParams.has(" call outside the two `.some(...)` lines already
  // parsed above, which would mean a third, unaccounted-for mode-selection
  // mechanism exists. There is none: the equality assertions above passing
  // against the full router-array union IS the answer, and this makes that
  // explicit rather than leaving it implied.
  // the two `.some(k => params.has(k))` calls read a loop variable, not a
  // literal — this regex only catches literal `.has('key')` calls, so ANY
  // hit here is BY DEFINITION a third, unaccounted-for mode-selection
  // mechanism outside the two arrays already parsed above.
  const hasCalls = [...homeHtmlSrc.matchAll(/(?:params|searchParams)\.has\(\s*(['"])([A-Za-z0-9_]+)\1\s*\)/g)].map(m => m[2]);
  assert.deepStrictEqual(hasCalls, [],
    `found a literal .has('key') call in home.html outside ANALYTICS_PARAMS/PLANNER_PARAMS: ${hasCalls.join(', ')}`);
});

console.log('vercel.json schema cap — `has`/`missing` arrays must never exceed 16 entries (platform limit, not a style choice)');
// Verbatim Vercel deploy error that broke PR #369:
//   "The `vercel.json` schema validation failed with the following message:
//    `headers[1].missing` should NOT have more than 16 items"
// This is a hard schema cap — the deploy errors out, nothing ships — not a
// lint warning. Round 4 exists because this item's own `missing` list hit
// 17 and broke it. Regression-guard it directly so it can't happen again.
const SCHEMA_MAX_PREDICATE_ENTRIES = 16;
test('every `has` array anywhere in vercel.json has <=16 entries', () => {
  const offenders = [];
  ['rewrites', 'headers'].forEach(section => {
    (config[section] || []).forEach((rule, i) => {
      if (rule.has && rule.has.length > SCHEMA_MAX_PREDICATE_ENTRIES) {
        offenders.push(`${section}[${i}] (source="${rule.source}"): has has ${rule.has.length} entries`);
      }
    });
  });
  assert.deepStrictEqual(offenders, [],
    `vercel.json schema cap violated (Vercel: "should NOT have more than 16 items"): ${offenders.join('; ')}`);
});
test('every `missing` array anywhere in vercel.json has <=16 entries', () => {
  const offenders = [];
  ['rewrites', 'headers'].forEach(section => {
    (config[section] || []).forEach((rule, i) => {
      if (rule.missing && rule.missing.length > SCHEMA_MAX_PREDICATE_ENTRIES) {
        offenders.push(`${section}[${i}] (source="${rule.source}"): missing has ${rule.missing.length} entries`);
      }
    });
  });
  assert.deepStrictEqual(offenders, [],
    `vercel.json schema cap violated (Vercel: "should NOT have more than 16 items"): ${offenders.join('; ')}`);
});

console.log('.md twins are never indexable — absent from every sitemap*.xml in the repo');
test('no sitemap*.xml file anywhere in the repo mentions ".md"', () => {
  const files = fs.readdirSync(__dirname).filter(f => /^sitemap.*\.xml$/.test(f));
  assert.ok(files.length > 0, 'sanity: expected at least one sitemap*.xml in the repo root');
  files.forEach(f => {
    const xml = fs.readFileSync(path.join(__dirname, f), 'utf8');
    assert.ok(!xml.includes('.md'), `${f} must not reference any .md URL`);
  });
});

console.log('vercel.json rules this item must not have touched');
test('existing "/" -> "/home" rewrite (no has/missing) is still present, untouched', () => {
  const rewrite = config.rewrites.find(r => r.source === '/' && r.destination === '/home' && !r.has);
  assert.ok(rewrite, 'expected the bare "/" -> "/home" rewrite to still be present');
});
test('.well-known rewrites untouched', () => {
  assert.ok(config.rewrites.some(r => r.source === '/.well-known/api-catalog' && r.destination === '/.well-known/api-catalog.json'));
  assert.ok(config.rewrites.some(r => r.source === '/.well-known/oauth-authorization-server'));
  assert.ok(config.rewrites.some(r => r.source === '/.well-known/oauth-protected-resource'));
  assert.ok(config.rewrites.some(r => r.source === '/.well-known/openid-configuration'));
});

console.log(`\n${passed} assertions passed.`);
if (process.exitCode) { console.error('\n❌ some assertions failed'); }
