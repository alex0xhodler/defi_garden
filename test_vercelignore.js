/* test_vercelignore.js — spec 223: the pre-deploy dry run and permanent gate
   for `.vercelignore`.

   `.vercelignore` is a DENYLIST that decides what of this repo's ~20,000
   tracked files Vercel uploads and serves at www.defi.garden. Mis-enumerating
   it breaks prod harder than the exposure it fixes ever would (spec 223's own
   words) — a single wrong anchored pattern can silently stop serving
   `app.js`, or a whole markdown-twin surface (`tokens/*.md`, `pools/*.md`,
   `chains/*.md`, `ko/**`) that item 212 built as a LIVE feature. This file is
   what stands between a typo in that denylist and a broken deploy:

     (a) a small, self-tested gitignore-ish matcher (anchored `/x`, dir `x/`,
         globs `*`/`**`), asserted against unit cases before it is trusted
         against the real repo;
     (b) enumerates the REAL deployable file set via `git ls-files` and
         splits it into KEPT / EXCLUDED using that matcher against the REAL
         `.vercelignore`;
     (c) a MUST-KEEP allowlist — every runtime asset class named in spec
         223's "facts already established" section, plus a sample of real
         files from every runtime directory (pools/, tokens/, chains/, ko/,
         og/, data/, .well-known/) — asserted present in KEPT, failing loudly
         by file name if not;
     (d) a MUST-EXCLUDE list — the dev/test/tooling/internal-doc classes the
         spec names — asserted present in EXCLUDED;
     (e) LINK INTEGRITY — scans every KEPT served text asset that could
         reference another file (root *.html, stories/*.html, the shipped
         app JS, llms*.txt, sitemap*.xml, every .well-known JSON file,
         openapi.json, tools/*.json) for same-origin references and asserts
         NONE resolve to an EXCLUDED path. This is the check that catches a
         mis-enumeration before a deploy spends Vercel free-tier quota
         finding out the hard way.
     (f) a self-defeat (non-vacuity) rail, in the shape of
         test_test_registry.js's own part (e): an IN-MEMORY mutated pattern
         set (never touching the real file) proves the classifier CAN flag
         `app.js`/`pools/` as excluded, then re-confirms the real,
         un-mutated `.vercelignore` still keeps them. A check that has never
         been observed to fail is not evidence it works
         (playbooks/derived-number-rails.md Step 0b). The stronger, one-time
         proof against the REAL on-disk file (mutate → RED → restore
         byte-identical, verified by md5sum → GREEN) was run manually during
         this item's build and its transcript is recorded in
         specs/223-notes.md, not repeated here as a standing test (this file
         must never leave `.vercelignore` mutated on disk between runs).

   Run: node test_vercelignore.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const VERCELIGNORE_PATH = path.join(ROOT, '.vercelignore');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('test_vercelignore.js — spec 223: .vercelignore dry run + gate\n');

/* ===========================================================================
   0. The matcher — gitignore-ish: anchored `/x`, dir `x/`, globs `*`/`**`.
   =========================================================================== */

// Turns a glob FRAGMENT (no leading `/`, no trailing `/`) into a regex
// fragment: `**` -> match anything (incl. `/`), `*` -> match anything except
// `/`, `?` -> one non-`/` char, everything else escaped literally.
function globToRegexFragment(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { out += '.*'; i++; }
      else out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return out;
}

/**
 * Compiles one `.vercelignore` line into a matcher. Anchoring (leading `/`)
 * restricts the match to the start of the path; a trailing `/` marks a
 * directory pattern, matching the directory itself and everything under it.
 * No `!` negation support — by design, matching this repo's ban on it.
 */
function compilePattern(rawLine) {
  const anchored = rawLine.startsWith('/');
  let body = anchored ? rawLine.slice(1) : rawLine;
  const isDir = body.endsWith('/');
  if (isDir) body = body.slice(0, -1);
  const fragment = globToRegexFragment(body);
  const prefix = anchored ? '^' : '(?:^|/)';
  const suffix = isDir ? '(?:/|$)' : '$';
  const regex = new RegExp(prefix + fragment + suffix);
  return { source: rawLine, anchored, isDir, regex, test: (filePath) => regex.test(filePath) };
}

function parseVercelignore(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map(compilePattern);
}

/** True if any compiled pattern matches filePath (a repo-relative, `/`-separated path with no leading `/`). */
function isExcluded(filePath, patterns) {
  return patterns.some((p) => p.test(filePath));
}

// --- (a) matcher unit tests, before it is trusted against anything real ----
console.log('(a) matcher unit tests');

test('anchored file: "/CLAUDE.md" matches "CLAUDE.md", not "docs/CLAUDE.md"', () => {
  const p = compilePattern('/CLAUDE.md');
  assert.strictEqual(p.test('CLAUDE.md'), true);
  assert.strictEqual(p.test('docs/CLAUDE.md'), false, 'anchoring must not let a root pattern match a nested file of the same name');
});

test('anchored dir: "/docs/" matches "docs/x.md" and "docs" itself, not "src/docs/x.md" or "docsish/x.md"', () => {
  const p = compilePattern('/docs/');
  assert.strictEqual(p.test('docs/x.md'), true);
  assert.strictEqual(p.test('docs'), true);
  assert.strictEqual(p.test('src/docs/x.md'), false, 'anchored dir must not match a nested dir of the same name');
  assert.strictEqual(p.test('docsish/x.md'), false, 'must not prefix-match a differently-named sibling ("docsish" is not "docs")');
});

test('anchored single-star glob: "/test_*.js" matches "test_foo.js", not "src/test_foo.js" or "test_foo.js.bak"', () => {
  const p = compilePattern('/test_*.js');
  assert.strictEqual(p.test('test_foo.js'), true);
  assert.strictEqual(p.test('src/test_foo.js'), false, 'single "*" must not cross "/" and anchor must block nesting');
  assert.strictEqual(p.test('test_foo.js.bak'), false, 'the pattern must match the whole remaining path, not a prefix of it');
});

test('anchored root glob: "/*.sh" matches root .sh files only, not "scripts/foo.sh"', () => {
  const p = compilePattern('/*.sh');
  assert.strictEqual(p.test('check-deps-with-comp.sh'), true);
  assert.strictEqual(p.test('scripts/foo.sh'), false);
});

test('non-anchored dir: "node_modules/" matches at any depth', () => {
  const p = compilePattern('node_modules/');
  assert.strictEqual(p.test('node_modules/x.js'), true);
  assert.strictEqual(p.test('a/node_modules/b.js'), true);
  assert.strictEqual(p.test('node_modules2/b.js'), false, 'must not prefix-match a differently-named sibling');
});

test('"**" crosses "/": "/foo/**/bar.js" matches "foo/bar.js" and "foo/a/b/bar.js"', () => {
  const p = compilePattern('/foo/**/bar.js');
  assert.strictEqual(p.test('foo/a/b/bar.js'), true);
});

test('isExcluded(): a file matches if ANY compiled pattern matches it', () => {
  const patterns = parseVercelignore('/CLAUDE.md\n/docs/\n# a comment\n\n/test_*.js\n');
  assert.strictEqual(isExcluded('CLAUDE.md', patterns), true);
  assert.strictEqual(isExcluded('docs/x.md', patterns), true);
  assert.strictEqual(isExcluded('test_foo.js', patterns), true);
  assert.strictEqual(isExcluded('app.js', patterns), false);
});

/* ===========================================================================
   1. Enumerate the real deployable file set, classify KEPT vs EXCLUDED.
   =========================================================================== */

function gitLsFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

const vercelignoreText = fs.readFileSync(VERCELIGNORE_PATH, 'utf8');
const REAL_PATTERNS = parseVercelignore(vercelignoreText);
const ALL_FILES = gitLsFiles();
const ALL_FILES_SET = new Set(ALL_FILES);

const KEPT = [];
const EXCLUDED = [];
for (const f of ALL_FILES) (isExcluded(f, REAL_PATTERNS) ? EXCLUDED : KEPT).push(f);
const KEPT_SET = new Set(KEPT);
const EXCLUDED_SET = new Set(EXCLUDED);

console.log(`\n(b) enumeration: ${ALL_FILES.length} tracked files -> ${KEPT.length} KEPT, ${EXCLUDED.length} EXCLUDED\n`);

test('(b) enumeration sanity: every tracked file lands in exactly one of KEPT/EXCLUDED', () => {
  assert.strictEqual(KEPT.length + EXCLUDED.length, ALL_FILES.length);
  assert.strictEqual(KEPT.length, KEPT_SET.size, 'no duplicate in KEPT');
  assert.strictEqual(EXCLUDED.length, EXCLUDED_SET.size, 'no duplicate in EXCLUDED');
});

test('(b) enumeration sanity: at least 15,000 files tracked (refuses to run against a truncated checkout)', () => {
  assert.ok(ALL_FILES.length >= 15000, `expected >= 15000 tracked files, got ${ALL_FILES.length} — a shallow/partial checkout would silently pass every KEEP/EXCLUDE assertion vacuously`);
});

/* ===========================================================================
   2. MUST-KEEP allowlist.
   =========================================================================== */
console.log('(c) MUST-KEEP allowlist');

const MUST_KEEP = [
  // App shell / router.
  'home.html', 'plan.html',
  // App bundles + .min/.compiled twins.
  'app.js', 'app.compiled.js', 'app.compiled.min.js',
  'PoolDetail.js', 'PoolDetail.compiled.js', 'PoolDetail.compiled.min.js',
  'planner.js', 'planner.min.js',
  'translations.js', 'translations.min.js',
  'analytics.js', 'canonical.js', 'brand-icons.js', 'landing.js',
  'react.production.min.js', 'react-dom.production.min.js',
  // CSS incl. .min.
  'style.css', 'style.min.css',
  'planner-styles.css', 'planner-styles.min.css',
  'pool-detail-styles.css', 'pool-detail-styles.min.css',
  'landing-styles.css',
  // SEO / agent-discovery surface.
  'robots.txt', 'llms.txt', 'llms-full.txt', 'openapi.json', 'status',
  'fa81c8f43e7870a3b48e7481b2b7c8df.txt',
  // item 226 (Google head-curation, 2026-08-05): EMIT_APP_VIEW_SITEMAPS now
  // defaults to false, so generate-sitemap.js stops regenerating the
  // app-view families (sitemap-chain-<Chain>.xml, sitemap-category-<Cat>.xml,
  // sitemap-tokens-all.xml) — the next real CI regen deletes them via
  // cleanupStaleSitemaps (080), and a MUST-KEEP entry naming a file that no
  // longer exists would fail check (c)'s "every MUST-KEEP path is tracked"
  // sanity gate. Replaced with head-family members that keep shipping.
  'sitemap.xml', 'sitemap-main.xml', 'sitemap-token-pages.xml',
  'sitemap-chain-pages.xml', 'sitemap-chain-pages-ko.xml', 'sitemap-token-pages-ko.xml',
  // Social / favicons.
  'og-image.png',
  // Agent-discovery skill doc — NOT excluded despite looking like an
  // internal doc; see .well-known/oauth-authorization-server.json's
  // agent_auth.skill field (caught by the link-integrity check below).
  'auth.md',
  // Runtime data (fetched client-side — app.js:1253-class paths).
  'data/pools-snapshot.json', 'data/pools-snapshot-meta.json', 'data/protocol-urls.json',
  'data/history/2026-08-04.json',
  'data/pools/chain/ethereum.json', 'data/pools/token/usdc.json',
  // Fonts.
  'fonts/FKGroteskNeue.woff2',
  // Agent tool JSON.
  'tools/calculate_projection.json', 'tools/get_curated_pools.json', 'tools/test-agent-tools.js',
  // Persona landing pages.
  'stories/tomoko.html', 'stories/kevin.html', 'stories/lucia.html', 'stories/stories.css',
  // spotlights (not named in the spec's exclude list; leave served).
  'spotlights/CADENCE.md', 'spotlights/pareto-credit-usdc-ethereum/card.png',
  'spotlights/pareto-credit-usdc-ethereum/pack.json',
  // og social-card images.
  'og/chains/algorand.png',
  // tokens/chains/ko — the .html AND item-212 .md twins, both must serve.
  'tokens/usdc.html', 'tokens/usdc.md',
  'chains/ethereum.html', 'chains/ethereum.md', 'chains/index.html',
  'tokens/index.html',
  'ko/chains/ethereum.html', 'ko/chains/ethereum.md',
  'ko/tokens/0x0.html', 'ko/tokens/0x0.md',
  // pools — the item-212 per-pool .md twin + its .json sibling.
  'pools/0004a5d4-ce6d-43ba-ab8a-64ff555b3853.json',
  'pools/0004a5d4-ce6d-43ba-ab8a-64ff555b3853.md',
  // .well-known — the whole agent-discovery surface, INCLUDING non-JSON
  // files (agent-skills/index.json links a .md; a blanket "*.md" or
  // extension-based exclude would break this).
  '.well-known/api-catalog.json',
  '.well-known/mcp/server-card.json',
  '.well-known/mcp/server-cards.json',
  '.well-known/mcp.json',
  '.well-known/oauth-authorization-server.json',
  '.well-known/oauth-protected-resource.json',
  '.well-known/openid-configuration.json',
  '.well-known/agent-skills/index.json',
  '.well-known/agent-skills/agentic-readiness/SKILL.md',
  '.well-known/agent-skills/agentic-readiness/references/ai-visibility-audit.md',
  '.well-known/agent-skills/agentic-readiness/scripts/provision_dns_aid.py',
  '.well-known/agent-skills/agentic-readiness/scripts/validate_readiness.py',
  '.well-known/agent-skills/agentic-readiness/templates/dns-aid-zone.txt',
  '.well-known/agent-skills/agentic-readiness/templates/oauth-authorization-server.json',
  '.well-known/agent-skills/agentic-readiness/templates/vercel-agentic-readiness.json',
  '.well-known/agent-skills/agentic-readiness/templates/webmcp-bootstrap.js',
];

test('(c) every MUST-KEEP path is a real tracked file (fixture sanity — a typo here would silently under-test)', () => {
  const missingOnDisk = MUST_KEEP.filter((f) => !ALL_FILES_SET.has(f));
  assert.deepStrictEqual(missingOnDisk, [], `MUST_KEEP names file(s) not tracked by git at all: ${JSON.stringify(missingOnDisk)}`);
});

for (const f of MUST_KEEP) {
  test(`(c) KEPT: ${f}`, () => {
    assert.ok(KEPT_SET.has(f), `expected "${f}" to be served (KEPT) — .vercelignore is stopping a live runtime asset`);
  });
}

/* ===========================================================================
   3. MUST-EXCLUDE list.
   =========================================================================== */
console.log('\n(d) MUST-EXCLUDE list');

const MUST_EXCLUDE = [
  'test_smoke.js', 'test_min_asset_boot.js', 'test_run_tests.js',
  'run-tests.js', 'audit-app.js', 'compile-app.js', 'minify-assets.js',
  'generate-sitemap.js', 'generate-llms.js', 'generate-token-pages.js',
  'validate-sitemaps.js', 'indexnow-ping.js', 'compute-kpis.js', 'dev-server.js',
  'og-image.build.mjs', 'og-image.source.html',
  'check-deps-with-comp.sh', 'split-inkvest.sh', 'split-inkvest-filter.sh',
  'schema.sql', 'wrangler.toml', '.mcp.json', 'settings.local.json',
  'CLAUDE.md', 'README.md', 'SITEMAP.md',
  'user_journey_diagrams.md', 'stakeholder_communication_plan.md',
  'product-loop-kit.zip',
  'product-loop-kit/BACKLOG.md', 'product-loop-kit/NORTH_STAR.md', 'product-loop-kit/LOG.md',
  '.claude/agents/verifier.md',
  'docs/feasibility-data-layer.md', 'docs/garden-planner-v2-spec.md', 'docs/garden-planner-v3-yield-funded.md',
  'telegram-bot/dist/index.js', 'telegram-bot/database.db',
  'workers/mixpanel-proxy/worker.js', 'workers/mixpanel-proxy/wrangler.toml',
  'src/poller.js', 'src/poller-core.js',
  'test_fixtures/pools-sample.json', 'test-fixtures/pre166/llms-pre166.txt',
];

// .github's tracked file (workflow path may vary) — resolved from the
// real tree rather than hardcoded, so this doesn't rot if the workflow file
// is renamed.
const githubTrackedSample = ALL_FILES.find((f) => f.startsWith('.github/'));
if (githubTrackedSample) MUST_EXCLUDE.push(githubTrackedSample);

test('(d) every MUST-EXCLUDE path is a real tracked file (fixture sanity)', () => {
  const missingOnDisk = MUST_EXCLUDE.filter((f) => !ALL_FILES_SET.has(f));
  assert.deepStrictEqual(missingOnDisk, [], `MUST_EXCLUDE names file(s) not tracked by git at all: ${JSON.stringify(missingOnDisk)}`);
});

for (const f of MUST_EXCLUDE) {
  test(`(d) EXCLUDED: ${f}`, () => {
    assert.ok(EXCLUDED_SET.has(f), `expected "${f}" to be stopped (EXCLUDED) — it is still being served (KEPT)`);
  });
}

/* ===========================================================================
   4. LINK INTEGRITY — scan every KEPT served text asset that could
      reference another file; assert none resolve to an EXCLUDED path.
   =========================================================================== */
console.log('\n(e) link integrity: scanning KEPT served assets for references into EXCLUDED paths');

function candidatesFor(relPath) {
  const trimmed = relPath.replace(/\/+$/, '');
  return [trimmed, `${trimmed}.html`, `${trimmed}.md`, `${trimmed}/index.html`];
}

/** Extracts same-origin path references from a text asset's content. */
function extractRefs(content) {
  const refs = new Set();
  const patterns = [
    /(?:src|href)\s*[:=]\s*["'](\/[^"'#]*)["']/g, // HTML attrs + JS object props: src="/x", href='/x', href: '/x'
    /fetch\(\s*["'](\/[^"']*)["']/g,               // fetch('/x')
    /https:\/\/www\.defi\.garden(\/[^\s"'<>)]*)?/g, // absolute same-origin URLs (llms.txt, sitemaps, .well-known JSON)
  ];
  for (const re of patterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content))) {
      let refPath = m[1] || '/'; // bare "https://www.defi.garden" with no path -> "/"
      if (refPath.startsWith('//')) continue; // protocol-relative external URL (e.g. //yields.llama.fi), not same-origin
      refs.add(refPath);
    }
  }
  return refs;
}

/**
 * Resolves one extracted reference against the real tree. Returns:
 *   'root'      — "/" or "/?query" — router-handled, not a static file, always fine.
 *   'external'  — no candidate file is tracked at all (a dynamic route like
 *                /api/mcp, or something outside this repo) — not this
 *                gate's concern, skipped rather than asserted on.
 *   'ok'        — resolves to a tracked file, and that file is KEPT.
 *   'broken'    — resolves to a tracked file, and that file is EXCLUDED.
 */
function resolveRef(refPath) {
  const [pathOnly] = refPath.split(/[?#]/);
  const rel = pathOnly.replace(/^\/+/, '');
  if (rel === '') return { status: 'root' };
  const candidates = candidatesFor(rel);
  const realCandidate = candidates.find((c) => ALL_FILES_SET.has(c));
  if (!realCandidate) return { status: 'external' };
  return { status: EXCLUDED_SET.has(realCandidate) ? 'broken' : 'ok', matchedFile: realCandidate };
}

function scanFileForBrokenRefs(relFilePath) {
  const content = fs.readFileSync(path.join(ROOT, relFilePath), 'utf8');
  const refs = extractRefs(content);
  const broken = [];
  for (const ref of refs) {
    const result = resolveRef(ref);
    if (result.status === 'broken') broken.push({ ref, matchedFile: result.matchedFile });
  }
  return broken;
}

const rootHtmlFiles = fs.readdirSync(ROOT).filter((f) => /^[^.][^/]*\.html$/.test(f) && KEPT_SET.has(f));
const storyHtmlFiles = KEPT.filter((f) => /^stories\/[^/]+\.html$/.test(f));
const shippedAppJs = [
  'app.js', 'app.compiled.js', 'app.compiled.min.js',
  'PoolDetail.js', 'PoolDetail.compiled.js', 'PoolDetail.compiled.min.js',
  'planner.js', 'planner.min.js', 'translations.js', 'translations.min.js',
  'analytics.js', 'canonical.js', 'brand-icons.js', 'landing.js',
].filter((f) => KEPT_SET.has(f));
const llmsFiles = ['llms.txt', 'llms-full.txt'].filter((f) => KEPT_SET.has(f));
const sitemapFiles = KEPT.filter((f) => /^sitemap.*\.xml$/.test(f));
const wellKnownJsonFiles = KEPT.filter((f) => f.startsWith('.well-known/') && f.endsWith('.json'));
const openapiFiles = ['openapi.json'].filter((f) => KEPT_SET.has(f));
const toolsJsonFiles = KEPT.filter((f) => /^tools\/[^/]+\.json$/.test(f));

const SCAN_TARGETS = [
  ...rootHtmlFiles, ...storyHtmlFiles, ...shippedAppJs, ...llmsFiles,
  ...sitemapFiles, ...wellKnownJsonFiles, ...openapiFiles, ...toolsJsonFiles,
];

test('(e) link-integrity fixture sanity: the scan set is non-empty and covers every named class', () => {
  assert.ok(rootHtmlFiles.length >= 2, `expected >=2 root *.html files, got ${rootHtmlFiles.length}`);
  assert.ok(storyHtmlFiles.length >= 3, `expected >=3 stories/*.html files, got ${storyHtmlFiles.length}`);
  assert.ok(shippedAppJs.length >= 10, `expected >=10 shipped app JS files, got ${shippedAppJs.length}`);
  assert.ok(llmsFiles.length === 2, `expected llms.txt + llms-full.txt, got ${llmsFiles.length}`);
  // item 226 (Google head-curation, 2026-08-05): was ">=100" — the app-view
  // families (sitemap-chain-<Chain>.xml, sitemap-category-<Cat>.xml,
  // sitemap-tokens-all.xml — ~108 of the prior ~114 files) stop regenerating
  // by default (EMIT_APP_VIEW_SITEMAPS=false) and are removed by
  // cleanupStaleSitemaps (080) on the next real CI run, leaving only
  // sitemap.xml + sitemap-main.xml + the 4 token/chain (en+ko) page sitemaps.
  // Lowered so this check keeps passing through that transition instead of
  // silently breaking the day CI regenerates for real.
  assert.ok(sitemapFiles.length >= 5, `expected >=5 sitemap*.xml files, got ${sitemapFiles.length}`);
  assert.ok(wellKnownJsonFiles.length >= 5, `expected >=5 .well-known/**/*.json files, got ${wellKnownJsonFiles.length}`);
  assert.ok(openapiFiles.length === 1, 'expected openapi.json in the scan set');
  assert.ok(toolsJsonFiles.length >= 2, `expected >=2 tools/*.json files, got ${toolsJsonFiles.length}`);
});

let totalRefsScanned = 0;
const allBroken = [];
for (const relFilePath of SCAN_TARGETS) {
  const content = fs.readFileSync(path.join(ROOT, relFilePath), 'utf8');
  totalRefsScanned += extractRefs(content).size;
  const broken = scanFileForBrokenRefs(relFilePath);
  for (const b of broken) allBroken.push({ from: relFilePath, ...b });
}

test(`(e) link-integrity ran against real content (${SCAN_TARGETS.length} files, ${totalRefsScanned} same-origin ref occurrences extracted, non-vacuous)`, () => {
  assert.ok(totalRefsScanned > 0, 'expected at least one same-origin reference across the scanned files — an empty extraction would make this check pass vacuously');
});

test('(e) LINK INTEGRITY: no KEPT served asset references an EXCLUDED path', () => {
  assert.deepStrictEqual(
    allBroken, [],
    `${allBroken.length} broken same-origin reference(s) found (a KEPT file links to a path that resolves to an EXCLUDED file):\n` +
      allBroken.map((b) => `  ${b.from} -> "${b.ref}" -> ${b.matchedFile} (EXCLUDED)`).join('\n')
  );
});

/* ===========================================================================
   5. Self-defeat (non-vacuity): an IN-MEMORY mutated pattern set must be able
      to flag app.js / pools/ as excluded — proving the classifier itself
      can go red — while the REAL, un-mutated .vercelignore still keeps
      them. Never touches the real file on disk. See the header comment for
      the separate, stronger, real-file proof recorded in the notes.
   =========================================================================== */
console.log('\n(f) self-defeat: in-memory mutated pattern set must flag app.js/pools/ as excluded');

test('(f) self-defeat: real .vercelignore keeps app.js and a pools/ sample (sanity before mutating)', () => {
  assert.ok(KEPT_SET.has('app.js'), 'sanity: app.js must be KEPT under the real .vercelignore');
  assert.ok(KEPT_SET.has('pools/0004a5d4-ce6d-43ba-ab8a-64ff555b3853.md'), 'sanity: the pools/ sample must be KEPT under the real .vercelignore');
});

test('(f) self-defeat: mutated pattern set (adds "/app.js" and "/pools/") DOES flag them excluded', () => {
  const mutatedPatterns = parseVercelignore(vercelignoreText + '\n/app.js\n/pools/\n');
  assert.strictEqual(isExcluded('app.js', mutatedPatterns), true, 'a check that cannot go red is not evidence it works');
  assert.strictEqual(isExcluded('pools/0004a5d4-ce6d-43ba-ab8a-64ff555b3853.md', mutatedPatterns), true);
  assert.strictEqual(isExcluded('pools/0004a5d4-ce6d-43ba-ab8a-64ff555b3853.json', mutatedPatterns), true);
});

test('(f) self-defeat restore proof: the REAL (unmutated) pattern set, re-derived fresh from disk, is unaffected by the in-memory mutation above', () => {
  const freshPatterns = parseVercelignore(fs.readFileSync(VERCELIGNORE_PATH, 'utf8'));
  assert.strictEqual(isExcluded('app.js', freshPatterns), false);
  assert.strictEqual(isExcluded('pools/0004a5d4-ce6d-43ba-ab8a-64ff555b3853.md', freshPatterns), false);
});

/* ===========================================================================
   6. Summary — this printed output is the dry-run enumeration for the
      notes (spec 223's acceptance criterion: "the enumeration is checked
      BEFORE the deployment spends quota, not discovered after").
   =========================================================================== */
const excludedRootFiles = EXCLUDED.filter((f) => !f.includes('/')).sort();
const excludedDirs = [...new Set(
  EXCLUDED.filter((f) => f.includes('/')).map((f) => f.split('/')[0])
)].sort();

console.log('\n=== DRY RUN SUMMARY ===');
console.log(`tracked files:   ${ALL_FILES.length}`);
console.log(`KEPT (served):    ${KEPT.length}`);
console.log(`EXCLUDED (denied): ${EXCLUDED.length}`);
console.log(`\nexcluded root-level files (${excludedRootFiles.length}):`);
for (const f of excludedRootFiles) console.log(`  /${f}`);
console.log(`\nexcluded directories (${excludedDirs.length}), with file counts:`);
for (const d of excludedDirs) {
  const count = EXCLUDED.filter((f) => f.startsWith(d + '/')).length;
  console.log(`  /${d}/  (${count} files)`);
}

console.log(`\n${passed} assertions passed` + (process.exitCode ? ' (FAILURES above)' : ''));
if (process.exitCode) {
  console.error('\nFAILED');
  process.exit(1);
}
