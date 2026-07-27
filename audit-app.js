/* audit-app.js — read-only Playwright product-audit scanner (backlog 142).

   Mechanizes playbooks/product-audit.md checks 1–7: drives the real rendered
   surfaces (grid, pool-detail = north star, dead-pool empty state, a rotating
   sample of static SEO leaf pages — backlog 154) against the committed
   data/pools-snapshot.json and emits a findings JSON. It NEVER edits a product
   file — it only READS the rendered product.

   Reference implementation for every fixture mechanic (local server, vendored
   unpkg React/ReactDOM/Babel, icons.llamao.fi abort, snapshot routing, the
   IGNORABLE allowlist, poll-before-assert, 360px viewport, chromium executable
   path) is test_northstar_cta_fires.js — this mirrors it, does not reinvent it.

   Fixture traps respected (playbook, learned 2026-07-25):
     #1 Snapshot staleness — route /data/pools-snapshot-meta.json with a FRESH
        generatedAt so the committed snapshot renders via the snapshot-first
        path (app.js tryLoadSnapshot) instead of falling through to a live
        "0 results" that would fabricate a dead-end finding. The snapshot BODY
        is served unmodified (real data) so findings are about real data.
     #2 Async reads — poll up to ~10s before claiming an element/empty-state/CTA
        "didn't render" (babel compile + data fetch land seconds after load).
     #3 Money regex — flag $0.1-style 1-decimal money ONLY when NOT followed by
        a [KMBT] suffix ($11.2K / $273.3M are legal house style).

   Env overrides (for the acceptance test's positive control):
     AUDIT_SNAPSHOT_PATH   — snapshot body served on the snapshot + live routes
                             (default 'data/pools-snapshot.json').
     AUDIT_PORT            — server port (default 8821).
     AUDIT_PLAYWRIGHT_ROOT — resolve playwright ONLY from
                             require(path.join(root, 'playwright')) (testing hook;
                             also how "playwright unresolvable" is simulated).
     AUDIT_OUT             — findings JSON out path (default
                             product-loop-kit/signals/audit-findings.json).
     AUDIT_STATIC_PAGES    — comma-separated repo-relative paths (backlog 154);
                             when set, REPLACES the static-page anchor + sample
                             rotation entirely and is used verbatim (tests /
                             positive-negative controls).
     AUDIT_STATIC_SAMPLE   — how many extra tokens/*.html + chains/*.html leaf
                             pages to sample beyond the anchor (default 6,
                             capped at 12; backlog 154).
     AUDIT_STATIC_SEED     — seed string for the deterministic static-page
                             sample (default: UTC date YYYY-MM-DD; backlog 154).
     AUDIT_STATIC_PRESCAN_MAX — cap on how many prescan-flagged suspect pages
                             get promoted into the rendered sample ahead of the
                             uniform rotation (default 4, clamped to the
                             sample size; backlog 157). Promoted pages replace
                             uniform picks — the total static-page budget
                             (anchor + sample size) never grows.
     AUDIT_STATIC_PRESCAN  — set to '0' to disable prescan/promotion entirely
                             (falls back to pure uniform rotation; backlog
                             157). Same effect as opts.prescan === false.
                             Prescan is already off whenever AUDIT_STATIC_PAGES
                             is set (that override is used verbatim).
     AUDIT_TEXT_SURFACES   — set to '0' to disable the llms.txt/llms-full.txt
                             text-surface pass (backlog 160); same effect as
                             opts.textSurfaces === false. Default ON.

   backlog 149: playwright is resolved lazily (bare require -> npm global root ->
   hardcoded global fallback) instead of at module load, so `require('./audit-app.js')`
   never throws in a fresh clone with no node_modules. When playwright cannot be
   resolved at all, the script writes a `status: "DID_NOT_RUN"` findings artifact
   (so a stale prior findings file can never be mistaken for a clean run) and exits
   non-zero. Exit codes: 0 clean run / 1 P0-P1 findings present / 2 other fatal
   error / 3 playwright unresolvable.

   Run: node audit-app.js   → writes product-loop-kit/signals/audit-findings.json,
        prints findings JSON + covered surfaces, exits non-zero on any P0/P1. */

const http = require('http');
const fs = require('fs');
const path = require('path');
// APY_SANITY_LIMIT from the poller's independent rail mirror (src/poller-
// core.js:18, itself mirrored from app.js:729) — NOT from generate-llms.js,
// the very generator this pass audits (spec 160: that would make the rail
// check self-fulfilling if the generator's own copy were ever weakened).
const { APY_SANITY_LIMIT } = require('./src/poller-core.js');

const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };
// Same allowlist as test_northstar_cta_fires.js — sandbox-blocked externals and
// their knock-on "Failed to load resource" noise are expected, not findings.
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|fonts\.|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// North-star pool-detail surface (lido stETH). Verified present in the snapshot
// at runtime (like the reference test); a real id from the snapshot is picked
// if it is ever absent.
const PREFERRED_POOL_ID = '747c1d2a-c668-4682-b9f9-296708a3dd90';
const DEAD_POOL_ID = 'nonexistent-bogus-id-000';
const DEFAULT_OUT = path.join(ROOT, 'product-loop-kit', 'signals', 'audit-findings.json');

// Astronomical-magnitude floor. The largest legitimate raw figure in the data
// is an individual pool TVL (~1.7e10) and it is always rendered ABBREVIATED
// ($17.3B) — never as a raw >1e11 token — so this only ever fires on the
// −900,719,925,474,097.9 (122) bug class, never on real data.
const ABSURD_MAGNITUDE = 1e11;

// Hardcoded fallback root for when neither a bare `require('playwright')` nor
// `npm root -g` resolves it (matches this environment's global install path;
// see spec 149 evidence). Kept as a last resort, not a first choice.
const GLOBAL_FALLBACK_ROOT = '/opt/node22/lib/node_modules';

// ---------------------------------------------------------------------------
// Sampled static SEO surface (backlog 154). Enumerates `tokens/*.html` +
// `chains/*.html` leaf pages (excluding hub pages: tokens/index.html,
// chains/index.html — and tokens/az/* is already excluded for free, since
// `fs.readdirSync('tokens', {withFileTypes:true})` lists `az` as a directory
// entry, not a `.html` file, so the `.endsWith('.html')` filter drops it).
//
// No `Math.random`: the sample is chosen by hashing a seed string (default
// the UTC date — see spec 154 Design A) and striding across the sorted
// candidate list. The only Date-based input is that default seed string,
// read once per run; nothing here reads Date.now()/Math.random() to pick.
// Same seed (e.g. same UTC day, re-run) ⇒ identical pick ⇒ a reproducible
// finding. A different seed (next day, or AUDIT_STATIC_SEED override) ⇒ a
// different start index ⇒ (on lists this size — thousands of tokens, dozens
// of chains) a different slice, so coverage actually accumulates over time.
// ---------------------------------------------------------------------------
const DEFAULT_STATIC_SAMPLE = 6;
const MAX_STATIC_SAMPLE = 12;
// 148's junk-slug predicate, mirrored verbatim: the <h1>'s leading token is
// pure-numeric OR date-shaped. Digit-LEADING real tickers (1W, 4W, 13W, 3CRV,
// 1INCH, 50EIGEN, 0X0) must NOT match either — they have a non-digit
// character, so neither regex (anchored, no wildcard letters) can hit them.
const JUNK_SLUG_NUMERIC = /^[0-9]+$/;
const JUNK_SLUG_DATE = /^[0-9]{1,2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[0-9]{2,4}$/i;
// 032's visible-non-zero-APY gate leaking (PT/fixed-yield class, PR #309 Finding 1).
const ZERO_YIELD_CLAIM = /up to 0\.00% APY/i;

// backlog 157 prescan-only signals (no rendered-page equivalent to reuse):
// bare broken-numeric-literal tokens, and an absurd $-magnitude figure in
// visible text. Both are text-only checks — no Playwright, no DOM.
const BROKEN_NUMBER_LITERAL = /(^|[^A-Za-z0-9$])(NaN|Infinity|undefined|null)(?![A-Za-z0-9])/;
// Tightened per spec 157 evidence: the loose form `-?\$?[0-9][0-9,.]*\s?[TQ]\b`
// (no prefix guard) false-positives on tokens/a0t.html — "A0T" contains the
// substring "0T", which matches as if it were "0 Trillion". Requiring the
// character before the leading digit be start-of-string or non-alphanumeric
// excludes "A0T" (preceded by the letter "A") while still catching a real
// standalone magnitude like "900,719,925,474,097.9T" or "$1.2Q". Measured
// 0/2,176 on this checkout (spec 157 evidence) — do NOT revert to the loose form.
const ABSURD_MAGNITUDE_TEXT = /(^|[^A-Za-z0-9])-?\$?[0-9][0-9,.]*\s?[TQ]\b/;

// Default cap on how many prescan suspects get promoted into the rendered
// sample per run (spec 157 B.2) — small on purpose: promoted pages replace
// uniform picks, they never grow the total static-page render budget.
const DEFAULT_PRESCAN_MAX = 4;

// signal -> severity, single source of truth for both prescanStaticPages()
// suspect records and the aggregate `static-prescan:<signal>` findings.
const PRESCAN_SIGNALS = {
  'broken-number-literal': 'P0',
  'absurd-magnitude': 'P0',
  'junk-slug': 'P1',
  'zero-yield-claim': 'P1'
};

// Non-HTML text-surface prescan (backlog 160): llms.txt/llms-full.txt are
// generated/committed/served surfaces prescanStaticPages() never reads
// (evidence: 159 published 353,114.2% APY live, caught only by hand). Same
// pure fs+regex shape as the static prescan, aimed at ~2 files not ~2,197.
const TEXT_SURFACE_FILES = ['llms.txt', 'llms-full.txt'];
// signal -> severity, single source of truth (same role as PRESCAN_SIGNALS).
const TEXT_SURFACE_SIGNALS = { 'apy-rail-breach': 'P0', 'broken-number-literal': 'P0', 'tvl-floor-claim': 'P1', 'empty-surface': 'P1' };

// Every "<figure>% APY" (159's own detector); leading class excludes a
// preceding digit/letter/'.' so this can't match mid-token.
const TEXT_APY_FIGURE = /(?:^|[^0-9A-Za-z.])((?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?)\s*%\s*APY/g;
const TEXT_TVL_FLOOR_CLAIM = /TVL\s*(?:≥|>=)\s*\$([0-9][0-9,]*(?:\.[0-9]+)?)\s*([KMBT])?/; // "TVL ≥ $10M"
const TEXT_TVL_FIGURE = /\$([0-9][0-9,]*(?:\.[0-9]+)?)\s*([KMBT])?\s*TVL/g; // "$112,870,949 TVL"
// "Pool line" shape both files use for leaderboard rows: an APY figure AND
// a TVL figure on the same line, e.g. "… 47.7% APY, $112,870,949 TVL — …".
const TEXT_POOL_LINE_APY = /%\s*APY/;
const TEXT_POOL_LINE_TVL = /\bTVL\b/;

// K/M/B/T suffix parser shared by the floor claim + listed TVL figures.
function parseMoney(numStr, suffix) {
  const n = parseFloat(String(numStr).replace(/,/g, ''));
  if (!Number.isFinite(n)) return NaN;
  const mult = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : suffix === 'T' ? 1e12 : 1;
  return n * mult;
}

// Never throws: an unreadable/missing file is skipped (stderr note) and
// doesn't count toward `scanned` — exact parallel of prescanStaticPages().
function prescanTextSurfaces(opts = {}) {
  const files = opts.files || TEXT_SURFACE_FILES;
  let scanned = 0;
  const suspects = [];

  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
    const rel = path.isAbsolute(file) ? path.relative(ROOT, file) : file;
    let content;
    try {
      content = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      console.error(`[audit] text prescan: skipping unreadable/missing ${rel}: ${e.message}`);
      continue;
    }
    scanned++;

    // apy-rail-breach (P0) — one suspect per FILE, not per figure (a
    // systemic breach must not flood the findings list). `.matchAll` clones
    // its regex, so reusing the module-level `g`-flag TEXT_APY_FIGURE here
    // across files is safe (unlike a stateful `.exec` loop).
    const breaches = [];
    for (const m of content.matchAll(TEXT_APY_FIGURE)) {
      const numText = m[1];
      const val = parseFloat(numText.replace(/,/g, ''));
      if (!Number.isFinite(val) || !(val > APY_SANITY_LIMIT)) continue;
      // Verbatim figure (e.g. "353114.2% APY"): the number plus whatever
      // followed it, dropping the leading one-char separator.
      const figureText = numText + m[0].slice(m[0].indexOf(numText) + numText.length);
      breaches.push({ val, figureText });
    }
    if (breaches.length) {
      breaches.sort((a, b) => b.val - a.val);
      const others = breaches.slice(1, 3).map((b) => `"${b.figureText}"`);
      const plural = breaches.length !== 1;
      let detail = `${breaches.length} APY figure${plural ? 's' : ''} ${plural ? 'exceed' : 'exceeds'} the ${APY_SANITY_LIMIT}% rail — highest "${breaches[0].figureText}"`;
      if (others.length) detail += ` (also: ${others.join(', ')})`;
      suspects.push({ rel, signal: 'apy-rail-breach', severity: TEXT_SURFACE_SIGNALS['apy-rail-breach'], detail });
    }

    // tvl-floor-claim (P1) — scoped to the SAME SECTION the floor is stated
    // in (floor line down to the next `## ` heading or EOF): deliberate, so
    // e.g. "## Top Chains by TVL" (aggregate CHAIN TVLs) never false-positives
    // against a pool floor stated in a different section.
    const floorMatch = content.match(TEXT_TVL_FLOOR_CLAIM);
    if (floorMatch) {
      const floorVal = parseMoney(floorMatch[1], floorMatch[2]);
      const lineStart = content.lastIndexOf('\n', floorMatch.index) + 1;
      const rest = content.slice(lineStart);
      const headingMatch = rest.match(/\n## /);
      const sectionText = headingMatch ? rest.slice(0, headingMatch.index) : rest;

      let smallest = null;
      for (const m of sectionText.matchAll(TEXT_TVL_FIGURE)) {
        const val = parseMoney(m[1], m[2]);
        if (Number.isFinite(val) && (!smallest || val < smallest.val)) smallest = { val, text: m[0] };
      }
      if (smallest && smallest.val < floorVal) {
        suspects.push({ rel, signal: 'tvl-floor-claim', severity: TEXT_SURFACE_SIGNALS['tvl-floor-claim'],
          detail: `stated floor "${floorMatch[0]}" but smallest listed figure in its section is "${smallest.text}"` });
      }
    }

    // broken-number-literal (P0) — reuses the existing predicate verbatim.
    const brokenMatch = content.match(BROKEN_NUMBER_LITERAL);
    if (brokenMatch) {
      suspects.push({ rel, signal: 'broken-number-literal', severity: TEXT_SURFACE_SIGNALS['broken-number-literal'],
        detail: `file contains broken numeric token "${brokenMatch[2]}"` });
    }

    // empty-surface (P1) — soft-404 equivalent: zero pool-shaped lines
    // (guards against an over-tight filter silently emptying the surface).
    const poolLineCount = content.split('\n')
      .filter((line) => TEXT_POOL_LINE_APY.test(line) && TEXT_POOL_LINE_TVL.test(line)).length;
    if (poolLineCount === 0) {
      suspects.push({ rel, signal: 'empty-surface', severity: TEXT_SURFACE_SIGNALS['empty-surface'],
        detail: 'file lists zero pools (no line contains both a % APY figure and a TVL figure)' });
    }
  }

  // P0-first, then rel — same comparator shape as prescanStaticPages().
  suspects.sort((a, b) => {
    const rank = (sev) => (sev === 'P0' ? 0 : 1);
    if (rank(a.severity) !== rank(b.severity)) return rank(a.severity) - rank(b.severity);
    return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0;
  });

  return { scanned, suspects };
}

// No-suspects/disabled shape — always the same shape whether the pass ran
// and found nothing, or didn't run at all (mirrors emptyPrescanResult()).
function emptyTextSurfaceResult() {
  return { scanned: 0, suspectCount: 0, bySignal: {} };
}

function defaultStaticSeed() {
  // UTC date, YYYY-MM-DD. The one documented Date-based input: it changes
  // once a day, not on every invocation, so a same-day re-run reproduces the
  // exact same sample (and thus the exact same finding, if any).
  return new Date().toISOString().slice(0, 10);
}

// FNV-1a — deterministic, dependency-free string hash (no crypto module, no
// new dependency). Used only to turn the seed string into a start index.
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function listLeafPages(dir) {
  let entries;
  try { entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); }
  catch (e) { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html') && e.name !== 'index.html')
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

// Deterministic stride-pick over a sorted list: hash(seed) chooses a start
// index, then a stride (list.length / count) walks the list from there,
// wrapping, skipping repeats. Same seed ⇒ same start ⇒ same picks.
function sampleBySeed(sortedList, count, seed) {
  if (!sortedList.length || count <= 0) return [];
  const n = Math.min(count, sortedList.length);
  const start = hashSeed(seed) % sortedList.length;
  const stride = Math.max(1, Math.floor(sortedList.length / n));
  const picked = [];
  const seen = new Set();
  let idx = start;
  let guard = 0;
  while (picked.length < n && guard < sortedList.length * 2) {
    if (!seen.has(idx)) { seen.add(idx); picked.push(sortedList[idx]); }
    idx = (idx + stride) % sortedList.length;
    guard++;
  }
  return picked;
}

function slugFromRel(rel) {
  return rel.replace(/^\/+/, '').replace(/\.html$/, '');
}

// Strips <script>/<style> blocks, captures the <h1> inner text, then strips
// all remaining tags to get visible text — pure string ops, no DOM/parser.
function extractPageText(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const h1Match = stripped.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Text = (h1Match ? h1Match[1] : '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const visibleText = stripped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { h1Text, visibleText };
}

// ---------------------------------------------------------------------------
// Static-surface prescan (backlog 157). Pure fs + regex over EVERY
// tokens/*.html + chains/*.html leaf page — no Playwright, no network, no
// writes — so the (small) rendered sample can be AIMED at suspicious pages
// instead of picked uniformly (spec 157 evidence: p ≈ 1.3%/day of hitting a
// known-bad page at the old uniform default). Reuses the SAME predicates the
// rendered `kind: 'static'` checks already use (JUNK_SLUG_*, ZERO_YIELD_CLAIM)
// — this is not a second copy of the 148 predicate, it is the one predicate
// applied before render instead of only after.
//
// Never throws: an unreadable/unparseable file is skipped with a stderr note
// and does not count toward `scanned`.
// ---------------------------------------------------------------------------
function prescanStaticPages(opts = {}) {
  const rels = listLeafPages('tokens').concat(listLeafPages('chains'));
  let scanned = 0;
  const suspects = [];

  for (const rel of rels) {
    let h1Text, visibleText;
    try {
      const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      ({ h1Text, visibleText } = extractPageText(html));
    } catch (e) {
      console.error(`[audit] prescan: skipping unreadable/unparseable ${rel}: ${e.message}`);
      continue;
    }
    scanned++;
    const slug = slugFromRel(rel);
    const leadToken = h1Text.split(/\s+/)[0] || '';

    if (leadToken && (JUNK_SLUG_NUMERIC.test(leadToken) || JUNK_SLUG_DATE.test(leadToken))) {
      suspects.push({ rel, slug, signal: 'junk-slug', severity: PRESCAN_SIGNALS['junk-slug'],
        detail: `<h1> lead token "${leadToken}" is junk (rendered <h1>: "${h1Text}")` });
    }
    if (ZERO_YIELD_CLAIM.test(visibleText)) {
      suspects.push({ rel, slug, signal: 'zero-yield-claim', severity: PRESCAN_SIGNALS['zero-yield-claim'],
        detail: 'visible text contains "up to 0.00% APY"' });
    }
    const brokenMatch = visibleText.match(BROKEN_NUMBER_LITERAL);
    if (brokenMatch) {
      suspects.push({ rel, slug, signal: 'broken-number-literal', severity: PRESCAN_SIGNALS['broken-number-literal'],
        detail: `visible text contains broken numeric token "${brokenMatch[2]}"` });
    }
    const magMatch = visibleText.match(ABSURD_MAGNITUDE_TEXT);
    if (magMatch) {
      suspects.push({ rel, slug, signal: 'absurd-magnitude', severity: PRESCAN_SIGNALS['absurd-magnitude'],
        detail: `visible text contains an absurd magnitude "${magMatch[0].trim()}"` });
    }
  }

  // P0-first, then rel — deterministic, independent of fs.readdirSync order
  // (already sorted per-dir by listLeafPages, but the two dirs are concatenated).
  suspects.sort((a, b) => {
    const rank = (sev) => (sev === 'P0' ? 0 : 1);
    if (rank(a.severity) !== rank(b.severity)) return rank(a.severity) - rank(b.severity);
    return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0;
  });

  return { scanned, suspects };
}

// No-suspects/prescan-disabled shape — always the same shape whether prescan
// ran and found nothing, or didn't run at all, so callers never need to
// null-check `result.prescan`.
function emptyPrescanResult() {
  return { scanned: 0, suspectCount: 0, bySignal: {}, promoted: [] };
}

// Builds the static-page surface list (spec 154 Design A + spec 157 prescan
// promotion). `opts.staticPages` / `opts.staticSample` / `opts.staticSeed` /
// `opts.prescan` / `opts.prescanMax` mirror the env vars, opts wins — the
// same override convention as every other knob in this file (port,
// snapshotPath, outPath). Returns `{ surfaces, prescan, prescanFindings }`.
function buildStaticSurfaces(opts) {
  const overrideRaw = opts.staticPages || process.env.AUDIT_STATIC_PAGES;
  if (overrideRaw) {
    // Explicit override (tests / positive control): used verbatim, replaces
    // the anchor + rotation entirely (spec 154 Design A). First entry keeps
    // the anchor name `static-page`; further entries use the sampled naming
    // so surfacesCovered stays self-describing either way. Prescan is OFF in
    // this mode (spec 157 B.2) so existing override-based controls stay
    // exactly as predictable as before this item.
    const surfaces = overrideRaw.split(',').map((s) => s.trim()).filter(Boolean)
      .map((rel, i) => {
        const normalized = rel.startsWith('/') ? rel : '/' + rel;
        const name = i === 0 ? 'static-page' : `static-page:${slugFromRel(normalized)}`;
        return { name, url: normalized, kind: 'static', width: 1280 };
      })
      .filter((s) => fs.existsSync(path.join(ROOT, s.url)));
    return { surfaces, prescan: emptyPrescanResult(), prescanFindings: [] };
  }

  const surfaces = [];
  // Anchor surface — unchanged fallback pair, unchanged logic, unchanged name
  // (`static-page`), so surfacesCovered never regresses for existing callers.
  const anchorRel = ['/tokens/usdc.html', '/chains/ethereum.html'].find((rel) => fs.existsSync(path.join(ROOT, rel)));
  if (anchorRel) surfaces.push({ name: 'static-page', url: anchorRel, kind: 'static', width: 1280 });
  else console.error('[audit] no static SEO anchor page found — skipping anchor');
  const anchorLeafRel = anchorRel ? anchorRel.replace(/^\/+/, '') : null;

  const sampleSize = Math.min(MAX_STATIC_SAMPLE,
    Math.max(0, Number(opts.staticSample || process.env.AUDIT_STATIC_SAMPLE || DEFAULT_STATIC_SAMPLE)));
  const seed = opts.staticSeed || process.env.AUDIT_STATIC_SEED || defaultStaticSeed();

  // ---- Prescan + promotion (backlog 157) ----------------------------------
  // Kill switch: opts.prescan === false / AUDIT_STATIC_PRESCAN=0 (spec 157).
  // Default is ON, with one narrow exception: `opts.staticOnly` (test-support
  // only — see its own comment at the runAudit() call site; no production
  // caller ever sets it, only test_seo_surface_audit.js's determinism check)
  // defaults prescan OFF unless the caller opts back in with `prescan: true`.
  // Reason: that pre-157 test drives `staticSample: 1`, so a default
  // prescanMax(4) clamped to sampleSize(1) gives cap=1 — with real suspects
  // in the double digits, a 1-of-N seed-hash pick has a non-trivial chance of
  // colliding between its two hardcoded seeds, turning an unrelated legacy
  // assertion ("different seed picks a different page") flaky for reasons
  // that have nothing to do with what it's testing. This item may not modify
  // that file, so the safer direction is the default here, not there.
  const prescanEnabled = opts.prescan === true ? true
    : opts.prescan === false ? false
    : process.env.AUDIT_STATIC_PRESCAN === '0' ? false
    : !opts.staticOnly;
  const prescanMaxRaw = Math.max(0, Number(opts.prescanMax || process.env.AUDIT_STATIC_PRESCAN_MAX || DEFAULT_PRESCAN_MAX));
  const cap = Math.min(prescanMaxRaw, sampleSize);

  let prescan = emptyPrescanResult();
  const prescanFindings = [];
  let promotedRels = [];

  if (prescanEnabled && cap > 0) {
    const scan = prescanStaticPages();
    // Never promote the anchor's own leaf — it is already covered by the
    // unchanged `static-page` surface, promoting it too would be a no-op
    // duplicate name collision.
    const suspects = scan.suspects.filter((s) => s.rel !== anchorLeafRel);

    const bySignal = {};
    for (const sig of Object.keys(PRESCAN_SIGNALS)) bySignal[sig] = 0;
    for (const s of suspects) bySignal[s.signal] = (bySignal[s.signal] || 0) + 1;

    // One aggregate finding per signal with >=1 suspect (spec 157 B.3) — a
    // systemic defect must not emit one finding per suspect page.
    for (const sig of Object.keys(PRESCAN_SIGNALS)) {
      const hits = suspects.filter((s) => s.signal === sig);
      if (hits.length === 0) continue;
      const examples = hits.slice(0, 10).map((s) => s.slug);
      prescanFindings.push(finding('static-prescan', 'n/a', `static-prescan:${sig}`, PRESCAN_SIGNALS[sig],
        `${hits.length} of ${scan.scanned} static SEO pages match ${sig} — examples: ${examples.join(', ')}`));
    }

    // Dedupe to unique rels (a page can trip >1 signal), preserving the
    // P0-first/rel-sorted order prescanStaticPages() already returned.
    const seenRel = new Set();
    const suspectRels = [];
    for (const s of suspects) { if (!seenRel.has(s.rel)) { seenRel.add(s.rel); suspectRels.push(s.rel); } }

    // If suspects exceed the cap, pick among them by seed so successive runs
    // work through the backlog instead of re-rendering the same few forever;
    // when suspects <= cap, sampleBySeed just returns the whole set (in a
    // seed-dependent order) — promotion is suspicion-driven, not seed-driven.
    promotedRels = sampleBySeed(suspectRels, cap, `${seed}:prescan`);

    prescan = { scanned: scan.scanned, suspectCount: suspects.length, bySignal, promoted: promotedRels.map(slugFromRel) };
  }

  for (const rel of promotedRels) {
    surfaces.push({ name: `static-page:${slugFromRel(rel)}`, url: '/' + rel, kind: 'static', width: 1280 });
  }

  // ---- Uniform rotation fills the REMAINING budget -------------------------
  const promotedSet = new Set(promotedRels);
  const remainingSampleSize = Math.max(0, sampleSize - promotedRels.length);

  // Default 6 = up to 4 token + 2 chain (2:1 ratio), falling back to whatever
  // exists on either side (spec 154 Design A).
  const tokenCount = Math.ceil((remainingSampleSize * 2) / 3);
  const chainCount = remainingSampleSize - tokenCount;

  // Exclude the anchor's own leaf AND any promoted leaf so the uniform
  // rotation never re-samples a page already covered another way.
  const tokenLeaves = listLeafPages('tokens').filter((r) => r !== anchorLeafRel && !promotedSet.has(r));
  const chainLeaves = listLeafPages('chains').filter((r) => r !== anchorLeafRel && !promotedSet.has(r));

  const tokenPicks = sampleBySeed(tokenLeaves, tokenCount, `${seed}:tokens`);
  const chainPicks = sampleBySeed(chainLeaves, chainCount, `${seed}:chains`);

  for (const rel of tokenPicks.concat(chainPicks)) {
    surfaces.push({ name: `static-page:${slugFromRel(rel)}`, url: '/' + rel, kind: 'static', width: 1280 });
  }
  return { surfaces, prescan, prescanFindings };
}

// ---------------------------------------------------------------------------
// Lazy playwright resolution (backlog 149). No module-level `chromium`
// binding: a fresh clone with no node_modules must be able to
// `require('./audit-app.js')` without throwing. Resolution happens only when
// runAudit() actually needs the engine.
// ---------------------------------------------------------------------------
// Version lookup never throws (per spec) — always falls back to 'unknown'.
function versionFromRoot(root) {
  try { return require(path.join(root, 'playwright', 'package.json')).version; }
  catch (e) { return 'unknown'; }
}
function versionFromBareRequire() {
  try { return require(path.join(path.dirname(require.resolve('playwright/package.json')), 'package.json')).version; }
  catch (e) { return 'unknown'; }
}

function resolvePlaywright(opts = {}) {
  const overrideRoot = opts.root || process.env.AUDIT_PLAYWRIGHT_ROOT || '';
  const attempts = [];

  if (overrideRoot) {
    try {
      const chromium = require(path.join(overrideRoot, 'playwright')).chromium;
      const version = versionFromRoot(overrideRoot);
      console.error(`[audit] playwright resolved from override (${version}) at ${overrideRoot}`);
      return { chromium, version, source: 'override', resolvedFrom: overrideRoot };
    } catch (e) {
      attempts.push(`override (${overrideRoot}): ${e.message}`);
      resolvePlaywright.lastAttempts = attempts;
      return null; // single documented override — no further fallback attempted
    }
  }

  // 1. bare require — local node_modules (the normal, non-degraded path).
  try {
    const chromium = require('playwright').chromium;
    const version = versionFromBareRequire();
    console.error(`[audit] playwright resolved from local (${version}) at local node_modules`);
    return { chromium, version, source: 'local', resolvedFrom: 'node_modules' };
  } catch (e) {
    attempts.push(`local: ${e.message}`);
  }

  // 2. npm global root.
  let globalRoot = '';
  try {
    globalRoot = require('child_process').execSync('npm root -g', { encoding: 'utf8', timeout: 10000 }).trim();
    const chromium = require(path.join(globalRoot, 'playwright')).chromium;
    const version = versionFromRoot(globalRoot);
    console.error(`[audit] playwright resolved from global (${version}) at ${globalRoot}`);
    return { chromium, version, source: 'global', resolvedFrom: globalRoot };
  } catch (e) {
    attempts.push(`global (${globalRoot || 'npm root -g failed'}): ${e.message}`);
  }

  // 3. hardcoded global fallback (skip if identical to the npm global root already tried).
  if (globalRoot !== GLOBAL_FALLBACK_ROOT) {
    try {
      const chromium = require(path.join(GLOBAL_FALLBACK_ROOT, 'playwright')).chromium;
      const version = versionFromRoot(GLOBAL_FALLBACK_ROOT);
      console.error(`[audit] playwright resolved from global-fallback (${version}) at ${GLOBAL_FALLBACK_ROOT}`);
      return { chromium, version, source: 'global-fallback', resolvedFrom: GLOBAL_FALLBACK_ROOT };
    } catch (e) {
      attempts.push(`global-fallback (${GLOBAL_FALLBACK_ROOT}): ${e.message}`);
    }
  }

  resolvePlaywright.lastAttempts = attempts;
  return null;
}

const NM = path.join(ROOT, 'node_modules');
const UNPKG_VENDOR = {
  'https://unpkg.com/react@18/umd/react.production.min.js': path.join(NM, 'react/umd/react.production.min.js'),
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(NM, 'react-dom/umd/react-dom.production.min.js'),
  'https://unpkg.com/@babel/standalone/babel.min.js': path.join(NM, '@babel/standalone/babel.min.js')
};

// ---------------------------------------------------------------------------
// Static server: serve repo files, `/` → home.html (house pattern).
// ---------------------------------------------------------------------------
function startServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'home.html' : urlPath);
      // Never escape the repo root.
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Number-sanity scanning (check 1) — runs on rendered innerText, in Node.
// ---------------------------------------------------------------------------
function scanNumbers(text) {
  const hits = [];

  // NaN / Infinity — unambiguous broken numbers.
  const nanMatch = text.match(/-?\bInfinity\b|\bNaN\b/);
  if (nanMatch) hits.push(`broken numeric token "${nanMatch[0]}" in rendered text`);
  // undefined/null only when stamped onto a number/currency context (avoids
  // flagging any incidental prose use of the words).
  const nullMatch = text.match(/(?:\$\s*|)(?:undefined|null)\s*(?:%|TVL|APY|\bin\b)|[$]\s*(?:undefined|null)/i);
  if (nullMatch) hits.push(`undefined/null in a numeric/currency slot: "${nullMatch[0].trim()}"`);

  // Money format (trap #3): $<int>.<frac><suffix?>. Legal when a [KMBT] suffix
  // follows (abbreviated TVL) OR the fractional part has >=2 digits (en-US 2dp).
  // The 126 bug is $0.1 — exactly one decimal, no suffix.
  const moneyRe = /\$(\d[\d,]*)\.(\d+)([KMBTkmbt])?/g;
  let m;
  while ((m = moneyRe.exec(text)) !== null) {
    const suffix = m[3];
    const fracLen = m[2].length;
    if (!suffix && fracLen === 1) {
      hits.push(`money not en-US 2dp: "${m[0]}" (1 decimal, no K/M/B/T suffix)`);
    }
  }

  // Absurd magnitude (trap-safe): a raw number (optionally $-prefixed) with no
  // K/M/B/T suffix whose |value| >= ABSURD_MAGNITUDE. Suffix-abbreviated figures
  // are skipped (legal house style).
  const numRe = /(-?)\$?(\d[\d,]*(?:\.\d+)?)\s*([KMBTkmbt])?/g;
  let n;
  while ((n = numRe.exec(text)) !== null) {
    if (n[3]) continue; // K/M/B/T abbreviated → legitimate
    const raw = n[2].replace(/,/g, '');
    if (!raw || raw === '.') continue;
    const val = Number((n[1] || '') + raw);
    if (Number.isFinite(val) && Math.abs(val) >= ABSURD_MAGNITUDE) {
      hits.push(`astronomical value "${n[0].trim()}" (|value| = ${Math.abs(val).toExponential(2)})`);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Poll helpers (trap #2).
// ---------------------------------------------------------------------------
async function pollFor(page, fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let v;
    try { v = await fn(); } catch (e) { v = null; }
    if (v || Date.now() > deadline) return v;
    await page.waitForTimeout(120);
  }
}

async function waitForSelector(page, selector, timeoutMs) {
  return pollFor(page, async () => (await page.locator(selector).count()) > 0, timeoutMs);
}

// ---------------------------------------------------------------------------
// Per-page route setup (mirrors the reference test).
// ---------------------------------------------------------------------------
async function setupRoutes(page, { snapshotBody, freshMeta, liveBody, forceLive, liveDelayMs }) {
  for (const [url, lp] of Object.entries(UNPKG_VENDOR)) {
    await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
  }
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());

  // Snapshot-first path (trap #1): fresh meta → committed snapshot renders
  // verbatim. In forceLive mode (loading-flash check 3) the meta 404s so
  // tryLoadSnapshot bails and app.js takes loadLive.
  await page.route('**/data/pools-snapshot-meta.json', (r) => {
    if (forceLive) return r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: freshMeta });
  });
  // Snapshot body is always served real (also read by app.js's kpis-merge).
  await page.route('**/data/pools-snapshot.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: snapshotBody }));

  // Live endpoint — ?pool= deep links ALWAYS go live (app.js:1141), so this
  // serves the same real snapshot data in the live shape {status,data:[…]}.
  await page.route('https://yields.llama.fi/pools', async (r) => {
    if (liveDelayMs) await new Promise((res) => setTimeout(res, liveDelayMs));
    return r.fulfill({ status: 200, contentType: 'application/json', body: liveBody });
  });
}

function makeErrorSink(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORABLE.test(msg.location()?.url || '') && !IGNORABLE.test(msg.text()))
      errors.push('console.error: ' + msg.text());
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Surface drivers — each returns findings[] for that surface.
// ---------------------------------------------------------------------------
function finding(surface, viewport, check, severity, detail) {
  return { surface, viewport, check, severity, detail };
}

async function auditText(page, s, findings) {
  const text = await page.evaluate(() => document.body.innerText || '');
  for (const detail of scanNumbers(text)) {
    findings.push(finding(s.name, s.vpLabel, 'number-sanity', 'P0', detail));
  }
  return text;
}

async function main(browser, baseUrl, s, ctx) {
  const page = await browser.newPage({ viewport: { width: s.width, height: 900 } });
  const errors = makeErrorSink(page);
  const findings = [];
  s.vpLabel = s.dark ? `${s.width}px/dark` : s.ko ? `${s.width}px/ko` : `${s.width}px`;

  if (s.dark) await page.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch (e) {} });

  try {
    await setupRoutes(page, { ...ctx, forceLive: s.forceLive, liveDelayMs: s.liveDelayMs });
    const url = baseUrl + s.url;

    if (s.kind === 'loading') {
      // Check 3 — loading flash. During the forced live delay, the resolved
      // "no results" empty state (its .empty-submessage) must NOT render before
      // data arrives; only the loading variant (bare .empty-message) may show.
      await page.goto(url, { waitUntil: 'commit', timeout: 20000 });
      const flashed = await pollFor(page, async () => {
        const cards = await page.locator('.pool-card').count();
        if (cards > 0) return false; // data arrived — window over
        return (await page.locator('.empty-state .empty-submessage').count()) > 0;
      }, Math.max(0, (s.liveDelayMs || 1500) - 300));
      if (flashed) findings.push(finding(s.name, s.vpLabel, 'loading-flash', 'P1',
        'resolved "no results" empty-state (.empty-submessage) rendered before pools loaded'));
      // Let it settle so trailing errors are captured, then error check below.
      await waitForSelector(page, '.pool-card, .empty-state', 8000);
      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    // 'domcontentloaded' not 'load': sandbox-blocked fonts/analytics never let
    // the load event fire (esp. the static SEO pages) — the pollers below wait
    // on the actual rendered selectors, which is the real readiness signal.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    if (s.kind === 'static') {
      // Static SEO page: number sanity + page errors, plus the 154 checks —
      // all read from the RENDERED page, this is a detector only (no writes).
      await page.waitForTimeout(400);
      const text = await auditText(page, s, findings);

      // junk-slug (148 class): leading token of the rendered <h1> is
      // pure-numeric or date-shaped. Detail quotes the rendered <h1> verbatim.
      const h1Text = (await page.locator('h1').first().textContent().catch(() => '')) || '';
      const leadToken = h1Text.trim().split(/\s+/)[0] || '';
      if (leadToken && (JUNK_SLUG_NUMERIC.test(leadToken) || JUNK_SLUG_DATE.test(leadToken))) {
        findings.push(finding(s.name, s.vpLabel, 'junk-slug', 'P1', `rendered <h1> is junk: "${h1Text.trim()}"`));
      }

      // zero-yield-claim (item 032's visible-non-zero-APY gate leaking).
      if (ZERO_YIELD_CLAIM.test(text)) {
        findings.push(finding(s.name, s.vpLabel, 'zero-yield-claim', 'P1', 'rendered copy claims "up to 0.00% APY"'));
      }

      // empty-table (soft-404 class): no pool rows rendered at all. Union of
      // both row selectors — a static page is either a token page (.tp-…) or
      // a chain page (.cp-…), never both, so either being present is enough.
      const rowCount = await page.locator('.tp-pool-link, .cp-pool-link').count();
      if (rowCount === 0) {
        findings.push(finding(s.name, s.vpLabel, 'empty-table', 'P1', 'rendered page has zero .tp-pool-link/.cp-pool-link rows'));
      }

      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    if (s.kind === 'dead-pool') {
      // Check 2 (positive): a dead ?pool= id is EXPECTED to resolve to the honest
      // empty state — assert it renders, don't flag it.
      const ok = await waitForSelector(page, '.empty-state .empty-message', 10000);
      if (!ok) findings.push(finding(s.name, s.vpLabel, 'dead-pool-empty-state', 'P1',
        'dead ?pool= id did not resolve to the honest empty state within 10s'));
      await auditText(page, s, findings);
      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    if (s.kind === 'grid') {
      const ok = await waitForSelector(page, '.pool-card', 10000);
      if (!ok) {
        findings.push(finding(s.name, s.vpLabel, 'dead-end', 'P1',
          'valid grid query rendered no .pool-card within 10s'));
      }
      await auditText(page, s, findings);
      if (s.width <= 360) await checkResponsive(page, s, findings, '.pool-card');
      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    // kind === 'pool' — the north-star surface.
    const ok = await waitForSelector(page, '.pool-detail-view', 12000);
    if (!ok) {
      findings.push(finding(s.name, s.vpLabel, 'dead-end', 'P1', 'pool-detail did not render within 12s'));
      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }
    const text = await auditText(page, s, findings);

    // Check 6 — the two north-star CTAs render, are visible, primary resolves.
    const primary = page.locator('.cta-button-primary').first();
    if ((await primary.count()) === 0 || !(await primary.isVisible())) {
      findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1', '"Garden this pool" (.cta-button-primary) missing or not visible'));
    } else {
      const href = await primary.getAttribute('href');
      if (!href) findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1', '.cta-button-primary has no href to resolve'));
    }
    const protocol = page.locator('.cta-button-protocol').first();
    if ((await protocol.count()) === 0 || !(await protocol.isVisible())) {
      findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1', '"Start Earning" (.cta-button-protocol) missing or not visible'));
    }

    // Check 5 — i18n.
    if (s.ko) {
      const hasHangul = /[가-힣]/.test(text);
      if (!hasHangul) findings.push(finding(s.name, s.vpLabel, 'i18n', 'P2', 'KO surface rendered no Hangul text'));
      // KO currency truth (137): a "<n>원" figure byte-identical to a "$<n>"
      // figure on the same page = raw USD relabeled Won without conversion.
      const wonPairs = [...text.matchAll(/([\d,]{2,})\s*원/g)].map((x) => x[1]);
      for (const digits of wonPairs) {
        if (text.includes('$' + digits)) {
          findings.push(finding(s.name, s.vpLabel, 'number-sanity', 'P0',
            `KO currency unit-swap: "${digits}원" equals unconverted "$${digits}"`));
        }
      }
    }
    // Leaked raw translation key (t('…') rendered literally).
    if (/\bt\(['"][a-zA-Z]/.test(text)) {
      findings.push(finding(s.name, s.vpLabel, 'i18n', 'P2', 'raw t(\'…\') translation call leaked into rendered text'));
    }

    // Check 7 — responsive / dark clip.
    if (s.width <= 360) await checkResponsive(page, s, findings, '.cta-button-primary');

    if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
    await page.close();
    return findings;
  } catch (err) {
    findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', 'driver threw: ' + err.message));
    try { await page.close(); } catch (e) {}
    return findings;
  }
}

async function checkResponsive(page, s, findings, ctaSelector) {
  // No horizontal body scroll at 360px.
  const scrollW = await page.evaluate(() => document.body.scrollWidth);
  if (scrollW > s.width) {
    findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2', `horizontal body scroll: scrollWidth ${scrollW} > ${s.width}`));
  }
  // Ancestor-clip check (136): the primary CTA box must be inside the viewport.
  const cta = page.locator(ctaSelector).first();
  if ((await cta.count()) > 0) {
    const box = await cta.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2', `${ctaSelector} has zero-area box at ${s.width}px (ancestor-clipped)`));
    } else if (box.x < -1 || box.x + box.width > s.width + 1) {
      findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2',
        `${ctaSelector} box [${Math.round(box.x)}..${Math.round(box.x + box.width)}] exceeds ${s.width}px viewport`));
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------
async function runAudit(opts = {}) {
  const outPath = opts.outPath || process.env.AUDIT_OUT || DEFAULT_OUT;

  // Resolve playwright BEFORE the snapshot read / server start, so a missing
  // engine fails fast and starts no server (backlog 149).
  const pw = resolvePlaywright();
  if (!pw) {
    const err = new Error('playwright unresolvable: tried local, npm global root, and the hardcoded global fallback');
    err.code = 'AUDIT_PLAYWRIGHT_UNRESOLVED';
    err.attempts = resolvePlaywright.lastAttempts || [];
    throw err;
  }

  const snapshotPath = path.resolve(ROOT, opts.snapshotPath || process.env.AUDIT_SNAPSHOT_PATH || 'data/pools-snapshot.json');
  const port = Number(opts.port || process.env.AUDIT_PORT || 8821);

  const snapshotBody = fs.readFileSync(snapshotPath, 'utf8');
  const snap = JSON.parse(snapshotBody);
  const pools = Array.isArray(snap.pools) ? snap.pools : [];
  if (pools.length === 0) throw new Error(`snapshot at ${snapshotPath} has no pools`);

  // Verify the north-star pool id is present; else pick a real one.
  let poolId = PREFERRED_POOL_ID;
  if (!pools.some((p) => p && p.pool === poolId)) {
    poolId = pools[0].pool;
    console.error(`[audit] preferred pool id absent from snapshot; using ${poolId}`);
  }

  // Fresh meta (trap #1): real meta shape, generatedAt = now.
  let metaObj = { schemaVersion: 1, count: pools.length, bytes: snapshotBody.length };
  try { metaObj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot-meta.json'), 'utf8')); } catch (e) {}
  metaObj.generatedAt = new Date().toISOString();
  const freshMeta = JSON.stringify(metaObj);

  // Live shape: real snapshot pools + a derived `apy` per pool.
  const liveBody = JSON.stringify({
    status: 'success',
    data: pools.map((p) => Object.assign({}, p, { apy: (p.apyBase || 0) + (p.apyReward || 0) }))
  });

  // Default surface rotation.
  const poolUrl = `/home.html?pool=${encodeURIComponent(poolId)}`;
  let surfaces = [
    { name: 'grid-token', url: '/home.html?token=USDC', kind: 'grid', width: 1280 },
    { name: 'pool-detail', url: poolUrl, kind: 'pool', width: 1280 },
    { name: 'grid-chain', url: '/home.html?chain=Ethereum', kind: 'grid', width: 1280 },
    { name: 'dead-pool', url: `/home.html?pool=${encodeURIComponent(DEAD_POOL_ID)}`, kind: 'dead-pool', width: 1280 },
    { name: 'grid-loading', url: '/home.html?token=USDC', kind: 'loading', width: 1280, forceLive: true, liveDelayMs: 1600 },
    { name: 'pool-detail-360', url: poolUrl, kind: 'pool', width: 360 },
    { name: 'grid-360', url: '/home.html?token=USDC', kind: 'grid', width: 360 },
    { name: 'pool-detail-dark', url: poolUrl, kind: 'pool', width: 1280, dark: true },
    { name: 'pool-detail-ko', url: `${poolUrl}&lang=ko`, kind: 'pool', width: 1280, ko: true }
  ];
  const staticResult = buildStaticSurfaces(opts);
  surfaces = surfaces.concat(staticResult.surfaces);

  // Test-support only (not a spec-154 env override): restrict the run to just
  // the static-page surfaces, skipping the 9 app surfaces entirely. Used by
  // the determinism acceptance test so it can call runAudit() twice per seed
  // without paying for the full grid/pool-detail/dead-pool render each time.
  if (opts.staticOnly) surfaces = surfaces.filter((s) => s.kind === 'static');

  if (Array.isArray(opts.only)) surfaces = surfaces.filter((s) => opts.only.includes(s.name));

  // Aggregate prescan findings (backlog 157) are pure fs-scan output, not
  // tied to a rendered surface — apply the SAME `opts.only` allowlist to
  // them (matched against `f.surface`, always 'static-prescan') that already
  // scopes the rendered surfaces above. Without this, a caller that
  // deliberately scopes a run away from the static rotation (e.g.
  // test_audit_app.js's clean-run case, which predates this item and asserts
  // ZERO P0/P1) would pick up the real junk-slug true-positive through the
  // back door — see playbooks/product-audit.md's 154 trap: scope the test to
  // the surfaces it was written about, never filter a finding away to force
  // green.
  let prescanFindings = staticResult.prescanFindings;
  if (Array.isArray(opts.only)) prescanFindings = prescanFindings.filter((f) => opts.only.includes(f.surface));

  // Text-surface pass (backlog 160), computed BEFORE the browser launches
  // (pure fs). Kill switch mirrors the static prescan's convention
  // (opts.textSurfaces / AUDIT_TEXT_SURFACES=0); default ON, off under
  // opts.staticOnly (test-support-only, see its comment above this function).
  const textSurfacesEnabled = opts.textSurfaces === true ? true
    : opts.textSurfaces === false ? false
    : process.env.AUDIT_TEXT_SURFACES === '0' ? false
    : !opts.staticOnly;

  let textSurfaces = emptyTextSurfaceResult();
  let textSurfaceFindings = [];
  if (textSurfacesEnabled) {
    const textScan = prescanTextSurfaces();
    const bySignal = {};
    for (const sig of Object.keys(TEXT_SURFACE_SIGNALS)) bySignal[sig] = 0;
    for (const s of textScan.suspects) bySignal[s.signal] = (bySignal[s.signal] || 0) + 1;
    textSurfaces = { scanned: textScan.scanned, suspectCount: textScan.suspects.length, bySignal };

    // One aggregate finding per signal — same shape as static-prescan:<signal>.
    for (const sig of Object.keys(TEXT_SURFACE_SIGNALS)) {
      const hits = textScan.suspects.filter((s) => s.signal === sig);
      if (hits.length === 0) continue;
      const examples = hits.slice(0, 10).map((s) => `${s.rel}: ${s.detail}`);
      textSurfaceFindings.push(finding('text-surfaces', 'n/a', `text-surface:${sig}`, TEXT_SURFACE_SIGNALS[sig],
        `${hits.length} of ${textScan.scanned} text surfaces match ${sig} — examples: ${examples.join(' | ')}`));
    }
  }
  // Same `opts.only` allowlist as the rendered surfaces + static-prescan
  // findings above — without it a scoped-away caller (test_audit_app.js's
  // clean-run case) would pick these up through the back door.
  const textSurfacesInOnly = !Array.isArray(opts.only) || opts.only.includes('text-surfaces');
  if (Array.isArray(opts.only)) textSurfaceFindings = textSurfaceFindings.filter((f) => opts.only.includes(f.surface));

  const server = await startServer(port);
  const browser = await pw.chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const baseUrl = `http://localhost:${port}`;
  const ctx = { snapshotBody, freshMeta, liveBody };
  const findings = [...prescanFindings, ...textSurfaceFindings];
  const surfacesCovered = [];
  // Named only when the pass ran AND survived opts.only (spec 160: unlike
  // static-prescan, this DOES get its own surfacesCovered entry).
  if (textSurfacesEnabled && textSurfacesInOnly) surfacesCovered.push('text-surfaces');
  try {
    for (const s of surfaces) {
      const f = await main(browser, baseUrl, s, ctx);
      surfacesCovered.push(s.name);
      findings.push(...f);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const result = {
    generatedAt: new Date().toISOString(),
    status: 'OK',
    playwright: { source: pw.source, version: pw.version },
    surfacesCovered,
    findings,
    prescan: staticResult.prescan,
    textSurfaces
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  return result;
}

// Exported so the item-142 exit contract (non-zero on any P0/P1) is directly
// testable without re-running a full audit.
function blockingFindings(findings) {
  return (findings || []).filter((f) => f && (f.severity === 'P0' || f.severity === 'P1'));
}

module.exports = { runAudit, scanNumbers, resolvePlaywright, blockingFindings, prescanStaticPages, prescanTextSurfaces };

if (require.main === module) {
  const outPath = process.env.AUDIT_OUT || DEFAULT_OUT;

  function writeFailureArtifact(x) {
    try {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(x, null, 2) + '\n');
    } catch (writeErr) {
      console.error('[audit] failed to write failure artifact: ' + writeErr.message);
    }
  }

  runAudit()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      console.log('\n[audit] surfaces covered: ' + result.surfacesCovered.join(', '));
      const blocking = blockingFindings(result.findings);
      console.log(`[audit] findings: ${result.findings.length} total, ${blocking.length} blocking (P0/P1)`);
      process.exit(blocking.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error(err);
      const unresolved = err.code === 'AUDIT_PLAYWRIGHT_UNRESOLVED';
      writeFailureArtifact({
        generatedAt: new Date().toISOString(),
        status: 'DID_NOT_RUN',
        reason: unresolved ? 'playwright unresolvable' : (err.message || String(err)),
        attempts: err.attempts || [],
        surfacesCovered: [],
        findings: []
      });
      process.exit(unresolved ? 3 : 2);
    });
}
