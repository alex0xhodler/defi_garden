/* Unit tests for vercel.json's Markdown content-negotiation rules (spec 212).
   Offline — parses vercel.json directly, no network access. Models itself on
   test_cache_headers.js's parse-and-assert pattern.

   Round 6: production caught a real defect our round-1..5 matcher could not
   see — Vercel's actual request pipeline is
       redirects (first-match-wins) -> filesystem/static (honouring cleanUrls)
         -> rewrites (first-match-wins)
   Our old matcher modelled "rewrites" as if they ran against the raw request
   path with no filesystem stage in between, so `/tokens/usdc` + Accept:
   text/markdown returned the RIGHT answer (a rewrite to /tokens/usdc.md) for
   the WRONG reason — on live prod, `/tokens/usdc.html` exists as a static
   file and the filesystem stage serves it before any rewrite is ever
   consulted, so the markdown rewrite never fired for any page that actually
   exists (the one case it existed for). Vercel-side, that defect is fixed by
   using `redirects` instead (redirects run BEFORE the filesystem stage).
   Test-side, the fix is this file: simulate the FULL pipeline, in order, so
   "passes the matcher" and "would actually work on Vercel" are the same
   claim again.

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
  assert.ok(Array.isArray(config.redirects), 'round 6: expected a top-level "redirects" array');
  assert.strictEqual(config.cleanUrls, true, 'cleanUrls must stay true — leg 4 (and the filesystem stage below) depends on it');
});

// ---------------------------------------------------------------------------
// Matcher primitives — mirrors Vercel's own semantics closely enough for this
// file's rules: `:param` segments capture exactly one path segment (no
// slash), optionally custom-constrained via `:name(regex)`; any other
// regex-looking syntax already present in a `source` string (parens,
// alternation, `.*`) is left untouched and used directly as a regex, which is
// this repo's own established convention (see the pre-existing "/(.*)" and
// "/(.*)\\.(js|css)" header sources).
// ---------------------------------------------------------------------------
function pathToRegex(source) {
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

function resolveDestination(rule, reqPath) {
  const re = pathToRegex(rule.source);
  const m = re.exec(reqPath);
  const names = paramNamesOf(rule.source);
  let dest = rule.destination;
  names.forEach((name, i) => { dest = dest.split(':' + name).join(m[i + 1]); });
  return dest;
}

/** First matching entry in `list` (a `rewrites` or `redirects` array),
 * first-match-wins in array order — exactly how Vercel evaluates each of
 * those tables independently. */
function findFirstMatch(list, reqPath, query, headers) {
  for (const rule of (list || [])) {
    const re = pathToRegex(rule.source);
    if (!re.test(reqPath)) continue;
    if (rule.has && !hasMatches(rule.has, query, headers)) continue;
    if (rule.missing && !missingMatches(rule.missing, query, headers)) continue;
    return rule;
  }
  return null;
}

/** All header rules matching (reqPath, headers), merged in array order
 * (later matching rule's same-key value wins) — mirrors how Vercel applies
 * every matching `headers` entry cumulatively, unlike redirects/rewrites.
 * Headers are keyed off the ORIGINAL incoming request's source match,
 * independent of which pipeline stage (redirect/static/rewrite) ultimately
 * produces the response body. */
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

// ---------------------------------------------------------------------------
// Round 6: the filesystem/static stage — driven off the ACTUAL repo tree,
// never a hardcoded list, honouring `cleanUrls`. For a clean request path P
// (no extension stripping needed — none of this file's test paths carry
// .html), Vercel's static resolution checks, in order: a literal file at P
// (e.g. "/llms.txt" -> llms.txt, "/tokens/usdc.md" -> tokens/usdc.md), then
// P + ".html" (cleanUrls: "/tokens/usdc" -> tokens/usdc.html), then
// P + "/index.html" (directory index: "/tokens" -> tokens/index.html).
// ---------------------------------------------------------------------------
function fileExistsOnDisk(relPath) {
  try { return fs.statSync(path.join(__dirname, relPath)).isFile(); } catch (_) { return false; }
}
function resolveStaticFile(reqPath) {
  if (reqPath === '/') return null; // confirmed: no root index.html in this repo — "/" always falls to rewrites
  const rel = reqPath.replace(/^\//, '');
  if (fileExistsOnDisk(rel)) return rel;
  if (fileExistsOnDisk(rel + '.html')) return rel + '.html';
  const dirIndex = rel + '/index.html';
  if (fileExistsOnDisk(dirIndex)) return dirIndex;
  return null;
}

/** Full pipeline simulation, in Vercel's real order:
 *    1. redirects (first-match-wins)   — round 6: this is where markdown
 *       negotiation + index canonicalisation now live, specifically BECAUSE
 *       this stage runs before the filesystem stage below.
 *    2. filesystem/static (cleanUrls)  — wins over rewrites for any path
 *       that has a real file on disk; this is the stage that silently
 *       defeated the OLD rewrite-based approach.
 *    3. rewrites (first-match-wins)    — only reached when nothing above
 *       matched; this is where "/" (which has no static file) is handled.
 * Returns a descriptor: { stage: 'redirect'|'static'|'rewrite'|'none', ... }. */
function resolveRequest(reqPath, query, headers) {
  const redirect = findFirstMatch(config.redirects, reqPath, query, headers);
  if (redirect) {
    return {
      stage: 'redirect',
      rule: redirect,
      status: redirect.permanent ? 308 : 307,
      location: resolveDestination(redirect, reqPath),
    };
  }
  const staticFile = resolveStaticFile(reqPath);
  if (staticFile) {
    return { stage: 'static', file: staticFile };
  }
  const rewrite = findFirstMatch(config.rewrites, reqPath, query, headers);
  if (rewrite) {
    return { stage: 'rewrite', rule: rewrite, destination: resolveDestination(rewrite, reqPath) };
  }
  return { stage: 'none' };
}

const MARKDOWN_ACCEPT = { accept: 'text/markdown' };
const HTML_ACCEPT = { accept: 'text/html' };

// ---------------------------------------------------------------------------
// Acceptance criteria assertions.
// ---------------------------------------------------------------------------

console.log('the one correct case today — unchanged ("/" has no static file, so this still resolves via rewrites)');
test('/ + Accept:text/markdown, no query -> /llms.txt (rewrite stage — "/" has no static file to short-circuit it)', () => {
  const r = resolveRequest('/', {}, MARKDOWN_ACCEPT);
  assert.strictEqual(r.stage, 'rewrite', 'expected the rewrite stage to handle bare "/" (no static file exists for it)');
  assert.strictEqual(r.destination, '/llms.txt');
});
test('/?lang=ko + Accept:text/markdown -> still /llms.txt (lang is not content-selecting)', () => {
  const r = resolveRequest('/', { lang: 'ko' }, MARKDOWN_ACCEPT);
  assert.strictEqual(r.stage, 'rewrite');
  assert.strictEqual(r.destination, '/llms.txt');
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
    const r = resolveRequest('/', { [key]: 'x' }, MARKDOWN_ACCEPT);
    assert.strictEqual(r.stage, 'rewrite', 'expected SOME rewrite to match (the plain "/" -> "/home" rule)');
    assert.notStrictEqual(r.destination, '/llms.txt', `?${key}= must not fall back to llms.txt`);
    assert.strictEqual(r.destination, '/home', `?${key}= + markdown Accept should land on the same /home rewrite as a normal browser request`);
  });
});
test('multiple content-selecting params together still avoid llms.txt', () => {
  const r = resolveRequest('/', { token: 'USDC', minTvl: '10000000' }, MARKDOWN_ACCEPT);
  assert.strictEqual(r.destination, '/home');
});
test('planner share URL (goal+monthly together) + Accept:text/markdown -> NOT /llms.txt', () => {
  const r = resolveRequest('/', { goal: 'retirement', monthly: '200' }, MARKDOWN_ACCEPT);
  assert.strictEqual(r.destination, '/home', '/?goal=...&monthly=... renders the planner, not the site index — must not fall back to llms.txt');
});
test('the exact live-linked URL /?app=1 + Accept:text/markdown -> resolves to the HTML app, never /llms.txt', () => {
  const r = resolveRequest('/', { app: '1' }, MARKDOWN_ACCEPT);
  assert.strictEqual(r.stage, 'rewrite');
  assert.notStrictEqual(r.destination, '/llms.txt', '/?app=1 must not fall back to the site index');
  assert.strictEqual(r.destination, '/home', '/?app=1 + markdown Accept should resolve the same as a normal browser request (the analytics app)');
});
test('/?app=1 WITHOUT the markdown Accept header -> still /home, never /llms.txt (the shadow rule is unconditional on Accept)', () => {
  const r = resolveRequest('/', { app: '1' }, HTML_ACCEPT);
  assert.strictEqual(r.destination, '/home');
});
test('bare "/" + Accept:text/markdown (no query at all) still -> /llms.txt (no-regress: the app shadow rule must not shadow the true root)', () => {
  const r = resolveRequest('/', {}, MARKDOWN_ACCEPT);
  assert.strictEqual(r.destination, '/llms.txt', 'the /?app=1 shadow rewrite must not match a request with no "app" query param at all');
});
test('the /?app=1 shadow rewrite is ordered BEFORE the "/" -> "/llms.txt" rewrite (first-match-wins)', () => {
  const shadowIdx = config.rewrites.findIndex(r => r.source === '/' && r.destination === '/home' &&
    (r.has || []).some(h => h.type === 'query' && h.key === 'app'));
  const llmsIdx = config.rewrites.findIndex(r => r.source === '/' && r.destination === '/llms.txt');
  assert.ok(shadowIdx !== -1, 'expected the /?app=1 shadow rewrite to exist');
  assert.ok(llmsIdx !== -1, 'expected the "/" -> "/llms.txt" rewrite to exist');
  assert.ok(shadowIdx < llmsIdx, 'the /?app=1 shadow rewrite must come before the llms.txt rewrite');
});

console.log('path-aware negotiation — static estate twins (round 6: now via REDIRECT, which runs before the filesystem stage)');
const STATIC_ESTATE_CASES = [
  ['/tokens/usdc', '/tokens/usdc.md', 'tokens/usdc.html'],
  ['/chains/solana', '/chains/solana.md', 'chains/solana.html'],
  ['/ko/tokens/usdc', '/ko/tokens/usdc.md', 'ko/tokens/usdc.html'],
  ['/ko/chains/solana', '/ko/chains/solana.md', 'ko/chains/solana.html'],
];
STATIC_ESTATE_CASES.forEach(([reqPath, expectedLocation, expectedStaticFile]) => {
  test(`${reqPath} + Accept:text/markdown -> 307 redirect to ${expectedLocation} (BEFORE the static ${expectedStaticFile} is ever considered)`, () => {
    assert.ok(fileExistsOnDisk(expectedStaticFile), `sanity: ${expectedStaticFile} must exist on disk for this test to mean anything`);
    const r = resolveRequest(reqPath, {}, MARKDOWN_ACCEPT);
    assert.strictEqual(r.stage, 'redirect', `${reqPath} + markdown must resolve via the REDIRECT stage, not filesystem/rewrite`);
    assert.strictEqual(r.status, 307, 'must be a TEMPORARY (307) redirect — Accept-keyed responses must never be cached as permanent (308)');
    assert.strictEqual(r.location, expectedLocation);
  });
  test(`${reqPath} WITHOUT the markdown Accept header -> serves the real static HTML directly, no redirect at all`, () => {
    const r = resolveRequest(reqPath, {}, HTML_ACCEPT);
    assert.strictEqual(r.stage, 'static', `${reqPath} without markdown Accept must be served by the filesystem stage`);
    assert.strictEqual(r.file, expectedStaticFile);
  });
});

console.log('no twin -> HTML, never markdown (:slug matches exactly one path segment)');
test('/tokens + markdown -> the real hub HTML, served statically (1 segment, no :slug match, no redirect)', () => {
  const r = resolveRequest('/tokens', {}, MARKDOWN_ACCEPT);
  assert.strictEqual(r.stage, 'static');
  assert.strictEqual(r.file, 'tokens/index.html');
});
test('/tokens/az/a + markdown -> the real A-Z HTML, served statically (3 segments, no :slug match, no redirect)', () => {
  assert.ok(fileExistsOnDisk('tokens/az/a.html'), 'sanity: tokens/az/a.html must exist on disk');
  const r = resolveRequest('/tokens/az/a', {}, MARKDOWN_ACCEPT);
  assert.strictEqual(r.stage, 'static');
  assert.strictEqual(r.file, 'tokens/az/a.html');
});
test('/tokens/zzzznotarealtoken + markdown -> no static file, no redirect target either -> honestly unresolved (both stages agree it does not exist)', () => {
  // The production probe that proved the OLD rewrite actually fired: a token
  // with no twin AND no HTML page still matches the redirect's dot-free
  // single-segment source (nothing static exists to pre-empt it), so it
  // redirects to a .md that also doesn't exist. That is the honest outcome —
  // this resource does not exist either way — not a defect.
  assert.ok(!fileExistsOnDisk('tokens/zzzznotarealtoken.html'), 'sanity: fixture token must not be real');
  assert.ok(!fileExistsOnDisk('tokens/zzzznotarealtoken.md'), 'sanity: fixture token must not have a twin');
  const r = resolveRequest('/tokens/zzzznotarealtoken', {}, MARKDOWN_ACCEPT);
  assert.strictEqual(r.stage, 'redirect', 'a nonexistent token still matches the redirect source (nothing static exists to out-rank it)');
  assert.strictEqual(r.location, '/tokens/zzzznotarealtoken.md', 'redirects to the (nonexistent) twin — the eventual 404 there is honest, not a defect');
});

console.log('point 1 — :slug is dot-constrained: a literal *.md request is served directly, no redirect, no double extension');
['/tokens/usdc.md', '/chains/solana.md', '/ko/tokens/usdc.md', '/ko/chains/solana.md'].forEach(reqPath => {
  test(`${reqPath} + Accept:text/markdown -> served directly (static stage), never redirected (no double .md.md)`, () => {
    assert.ok(fileExistsOnDisk(reqPath.replace(/^\//, '')), `sanity: ${reqPath} must exist on disk as a real twin`);
    const r = resolveRequest(reqPath, {}, MARKDOWN_ACCEPT);
    assert.strictEqual(r.stage, 'static', `${reqPath} must be served directly — it is already the real markdown file`);
    assert.strictEqual(r.file, reqPath.replace(/^\//, ''));
  });
});
test('sanity: the constrained pattern actually excludes dotted segments (regex-level check)', () => {
  const rule = config.redirects.find(r => r.source === '/tokens/:slug([^/.]+)');
  assert.ok(rule, 'expected the constrained /tokens/:slug([^/.]+) redirect to exist');
  const re = pathToRegex(rule.source);
  assert.ok(!re.test('/tokens/usdc.md'), '/tokens/:slug([^/.]+) must not match a dotted segment');
  assert.ok(re.test('/tokens/usdc'), '/tokens/:slug([^/.]+) must still match a normal slug');
});

console.log('point 2 — /tokens/index, /chains/index, /ko/.../index canonicalise to their hub (round 6: 308 redirect, not a dead rewrite)');
const INDEX_PASSTHROUGH_CASES = [
  ['/tokens/index', '/tokens'],
  ['/chains/index', '/chains'],
  ['/ko/tokens/index', '/ko/tokens'],
  ['/ko/chains/index', '/ko/chains'],
];
INDEX_PASSTHROUGH_CASES.forEach(([reqPath, expectedLocation]) => {
  test(`${reqPath} -> 308 permanent redirect to ${expectedLocation} (honest canonicalisation, unconditional on Accept)`, () => {
    const withMd = resolveRequest(reqPath, {}, MARKDOWN_ACCEPT);
    assert.strictEqual(withMd.stage, 'redirect', `${reqPath} + markdown must resolve via redirect, not a phantom .md rewrite`);
    assert.strictEqual(withMd.status, 308);
    assert.strictEqual(withMd.location, expectedLocation);
    const withHtml = resolveRequest(reqPath, {}, HTML_ACCEPT);
    assert.strictEqual(withHtml.stage, 'redirect', `${reqPath} without markdown Accept must ALSO redirect (unconditional)`);
    assert.strictEqual(withHtml.status, 308);
    assert.strictEqual(withHtml.location, expectedLocation);
  });
});
test('the index redirects are ordered BEFORE the four markdown :slug redirects (first-match-wins — "index" itself would otherwise match the dot-free slug pattern)', () => {
  const idx = s => config.redirects.findIndex(r => r.source === s);
  const slugIdx = s => config.redirects.findIndex(r => r.source === s);
  ['/tokens/index', '/chains/index', '/ko/tokens/index', '/ko/chains/index'].forEach(p => {
    assert.ok(idx(p) !== -1, `expected an explicit index redirect for ${p}`);
  });
  const firstSlugRuleIdx = Math.min(
    slugIdx('/tokens/:slug([^/.]+)'), slugIdx('/chains/:slug([^/.]+)'),
    slugIdx('/ko/tokens/:slug([^/.]+)'), slugIdx('/ko/chains/:slug([^/.]+)'));
  const lastIndexPassthroughIdx = Math.max(
    idx('/tokens/index'), idx('/chains/index'), idx('/ko/tokens/index'), idx('/ko/chains/index'));
  assert.ok(lastIndexPassthroughIdx < firstSlugRuleIdx, 'index redirects must be ordered before the :slug markdown redirects');
});
test('no redirect loop: /tokens (the canonicalisation target) does not itself match any markdown or index redirect source', () => {
  ['/tokens', '/chains', '/ko/tokens', '/ko/chains'].forEach(hub => {
    const r = resolveRequest(hub, {}, MARKDOWN_ACCEPT);
    assert.notStrictEqual(r.stage, 'redirect', `${hub} (a redirect TARGET) must not itself be caught by a redirect rule — that would loop`);
  });
});

console.log('leg 4 — /plan is a cleanUrls-served static file, not a negotiation defect (territory note 1)');
test('/plan + markdown -> served statically (plan.html), never redirected, never llms.txt', () => {
  assert.ok(fileExistsOnDisk('plan.html'), 'sanity: plan.html must exist on disk');
  const r = resolveRequest('/plan', {}, MARKDOWN_ACCEPT);
  assert.strictEqual(r.stage, 'static');
  assert.strictEqual(r.file, 'plan.html');
});
test('cleanUrls is still true (leg 4 ships as an assertion, no cleanUrls change)', () => {
  assert.strictEqual(config.cleanUrls, true);
});

console.log('round 6 regression guard — the exact assumption that just cost a shipped defect: a path with a static file must NOT be reachable by rewrite');
test('no `rewrites` entry has a destination ending in ".md" (that pattern is DEAD for any page that has a real static file — it must live in `redirects`)', () => {
  const offenders = config.rewrites.filter(r => typeof r.destination === 'string' && r.destination.endsWith('.md'));
  assert.deepStrictEqual(offenders.map(r => r.source), [],
    'a `rewrites` entry targeting a .md file is exactly the round-6 defect: the filesystem stage runs BEFORE rewrites and will silently win for any page that exists. Markdown negotiation belongs in `redirects`.');
});
test('the four markdown-negotiation rules (and the four index canonicalisations) DO live in `redirects`, not `rewrites`', () => {
  ['/tokens/:slug([^/.]+)', '/chains/:slug([^/.]+)', '/ko/tokens/:slug([^/.]+)', '/ko/chains/:slug([^/.]+)'].forEach(src => {
    assert.ok(config.redirects.some(r => r.source === src && r.destination.endsWith('.md')),
      `expected a redirects[] entry for ${src} -> *.md`);
    assert.ok(!config.rewrites.some(r => r.source === src),
      `expected NO rewrites[] entry for ${src} (that was the round-6 defect)`);
  });
  ['/tokens/index', '/chains/index', '/ko/tokens/index', '/ko/chains/index'].forEach(src => {
    assert.ok(config.redirects.some(r => r.source === src), `expected a redirects[] entry for ${src}`);
    assert.ok(!config.rewrites.some(r => r.source === src), `expected NO rewrites[] entry for ${src} (also dead the same way)`);
  });
});
test('all four markdown redirects use `"permanent": false` (307), never 308 — the response varies by Accept and a permanent redirect would get cached', () => {
  ['/tokens/:slug([^/.]+)', '/chains/:slug([^/.]+)', '/ko/tokens/:slug([^/.]+)', '/ko/chains/:slug([^/.]+)'].forEach(src => {
    const rule = config.redirects.find(r => r.source === src && (r.has || []).some(h => h.type === 'header' && h.key === 'Accept'));
    assert.ok(rule, `expected the markdown redirect for ${src}`);
    assert.strictEqual(rule.permanent, false, `${src} markdown redirect must be permanent:false (307)`);
  });
});
test('all four index redirects use `"permanent": true` (308) — honest, stable canonicalisation, unconditional on any header', () => {
  ['/tokens/index', '/chains/index', '/ko/tokens/index', '/ko/chains/index'].forEach(src => {
    const rule = config.redirects.find(r => r.source === src);
    assert.strictEqual(rule.permanent, true, `${src} redirect must be permanent:true (308)`);
    assert.ok(!rule.has, `${src} redirect must be unconditional (no Accept gate) — it's honest canonicalisation, not negotiation`);
  });
});

console.log('header assertions — mislabelling fixed: the four negotiated-slug header rules no longer claim Content-Type: text/markdown');
test('the four /tokens/:slug([^/.]+)-style header rules (Accept:markdown-gated) now carry ONLY Vary:Accept — no Content-Type, no X-Robots-Tag', () => {
  // Round 6 fix: with redirects, the twin is served at its OWN .md URL,
  // where the untouched `/(.*)\.md` rule already gives it the right
  // Content-Type + noindex. These four rules previously mislabelled the
  // ORIGINAL html page's response (a 307 redirect, pre-fix) as
  // text/markdown — that mislabel is gone; Vary:Accept is kept because a
  // shared cache still must not conflate the two Accept variants.
  ['/tokens/:slug([^/.]+)', '/chains/:slug([^/.]+)', '/ko/tokens/:slug([^/.]+)', '/ko/chains/:slug([^/.]+)'].forEach(src => {
    const rule = config.headers.find(r => r.source === src &&
      (r.has || []).some(h => h.type === 'header' && h.key === 'Accept' && /markdown/.test(h.value || '')));
    assert.ok(rule, `expected the Accept:markdown-gated header rule for ${src}`);
    assert.deepStrictEqual(rule.headers, [{ key: 'Vary', value: 'Accept' }],
      `${src}'s negotiated header rule must be exactly [Vary:Accept] — no Content-Type, no X-Robots-Tag`);
  });
});
test('negotiated response headers on /tokens/usdc + markdown carry Vary:Accept and NO Content-Type at all (the redirect body is empty; the real type lives at the .md URL)', () => {
  const h = mergedHeaders('/tokens/usdc', {}, MARKDOWN_ACCEPT);
  assert.strictEqual(h['Vary'], 'Accept');
  assert.ok(!h['Content-Type'], 'must not claim any Content-Type on the redirect response for the original HTML page');
});
test('direct .md request carries Content-Type text/markdown + X-Robots-Tag noindex (the untouched /(.*)\\.md rule)', () => {
  const h = mergedHeaders('/tokens/usdc.md', {}, HTML_ACCEPT);
  assert.ok(/text\/markdown/.test(h['Content-Type'] || ''), 'missing text/markdown Content-Type on a direct .md request');
  assert.strictEqual(h['X-Robots-Tag'], 'noindex');
});
test('/tokens/:slug, /chains/:slug, /ko/... carry an UNCONDITIONAL Vary:Accept even without the markdown Accept header (the separate, untouched always-on rule)', () => {
  ['/tokens/usdc', '/chains/solana', '/ko/tokens/usdc', '/ko/chains/solana'].forEach(p => {
    const h = mergedHeaders(p, {}, HTML_ACCEPT);
    assert.strictEqual(h['Vary'], 'Accept', `${p} must always carry Vary: Accept so a shared cache can't serve markdown to a browser`);
  });
});
test('/?app=1 + Accept:text/markdown -> Content-Type is overridden back to text/html (the override rule, placed AFTER the markdown rule) — unaffected by round 6', () => {
  // Depends on Vercel's documented "every matching header rule applies, in
  // order, later overrides earlier for the same key" behavior — the ONE
  // assumption in this item that is not first-match-wins. Honestly flagged:
  // worst case if this assumption is ever wrong is /?app=1 (a human-clicked
  // header link, not an agent target) getting an HTML body mislabeled
  // text/markdown — the BODY is still correct HTML either way, because the
  // rewrite leg (asserted above) is what actually decides the body.
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
test('the untouched `/(.*)\\.md` header rule is unchanged (round 6 explicitly must not touch it)', () => {
  const rule = config.headers.find(r => r.source === '/(.*)\\.md');
  assert.ok(rule, 'expected the /(.*)\\.md header rule to still exist');
  assert.deepStrictEqual(rule.headers, [
    { key: 'Content-Type', value: 'text/markdown; charset=utf-8' },
    { key: 'X-Robots-Tag', value: 'noindex' },
  ]);
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
// — so these scans are ORDERING-aware: a rule in the wrong position does
// NOT count as coverage, full stop, regardless of whether it's "there".
// Round 6 does not touch any of this — the "app" shadow/override rules stay
// on source "/", which never had a static file to be defeated by; only the
// /tokens|/chains markdown negotiation moved to `redirects`.
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

  const mutatedRootRewrite = mutated.rewrites.find(r => r.source === '/' && r.destination === '/llms.txt');
  assert.throws(
    () => assertCoverageEqualsRouterParams(mutatedRootRewrite, positiveRewriteKeys(mutated), 'rewrite (mutated fixture)'),
    /app/,
    'expected the coverage-equality assertion to throw, naming "app", once its shadow rewrite is misordered'
  );
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
// Round 6: extended to cover the new `redirects` array too (it can carry
// `has`/`missing` predicates just like rewrites/headers can).
const SCHEMA_MAX_PREDICATE_ENTRIES = 16;
test('every `has` array anywhere in vercel.json has <=16 entries', () => {
  const offenders = [];
  ['rewrites', 'redirects', 'headers'].forEach(section => {
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
  ['rewrites', 'redirects', 'headers'].forEach(section => {
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
