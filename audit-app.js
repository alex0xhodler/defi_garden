/* audit-app.js — read-only Playwright product-audit scanner (backlog 142).

   Mechanizes playbooks/product-audit.md checks 1–7: drives the real rendered
   surfaces (grid, pool-detail = north star, dead-pool empty state, the
   search-first landing + Garden Planner default face — backlog 162, the
   deep-linked plan bloom/checkout screen where the planner's computed
   numbers first render — backlog 164, a rotating sample of static SEO leaf
   pages — backlog 154) against the committed data/pools-snapshot.json and
   emits a findings JSON. It NEVER edits a product file — it only READS the
   rendered product.

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
     AUDIT_POOL_IDS         — comma-separated pool ids (backlog 167); when set,
                             REPLACES the pool-detail anchor selection + prescan
                             + rotation. The first id becomes the anchor pool
                             (the four unchanged pool-detail/-360/-dark/-ko
                             surfaces point at it); any further ids render as
                             extra `pool-detail:<id-prefix>` surfaces verbatim.
                             Prescan is OFF in this mode — exact mirror of
                             AUDIT_STATIC_PAGES's contract (spec 154).
     AUDIT_POOL_PRESCAN     — set to '0' to disable pool-snapshot prescan +
                             promotion entirely (falls back to pure seeded
                             rotation; backlog 167). Same effect as
                             opts.poolPrescan === false. Already off whenever
                             AUDIT_POOL_IDS is set (used verbatim).
     AUDIT_POOL_PRESCAN_MAX — cap on how many prescan-flagged suspect pools get
                             promoted into `pool-detail:<id-prefix>` surfaces
                             per run (default 2; backlog 167). Additive to the
                             rotation budget below — see buildPoolSurfaces()'s
                             header comment for why (differs from the static
                             leg's shared-budget shape).
     AUDIT_POOL_SAMPLE     — how many extra pool-detail:<id-prefix> surfaces to
                             seed-rotate through beyond the anchor + promoted
                             pools (default 2, capped at 6; backlog 167).

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
  'zero-yield-claim': 'P1',
  'link-target-integrity': 'P1'
};

// Pool-snapshot prescan (backlog 167). Budget knobs mirror the static leg's
// naming (DEFAULT_*/MAX_* pairs), reusing the module's existing
// APY_SANITY_LIMIT / ABSURD_MAGNITUDE constants verbatim — this section may
// never redefine either (a rail mirror here is a trust-rail edit).
const DEFAULT_POOL_PRESCAN_MAX = 2; // promotion cap
const DEFAULT_POOL_SAMPLE = 2;      // rotation sample size
const MAX_POOL_SAMPLE = 6;          // ceiling on AUDIT_POOL_SAMPLE
const POOL_ID_PREFIX_LEN = 8;       // `pool-detail:<prefix>` surface naming

// signal -> severity, single source of truth (same role as PRESCAN_SIGNALS /
// TEXT_SURFACE_SIGNALS) for both prescanPools()'s suspect records and the
// aggregate `pool-prescan:<signal>` findings.
const POOL_PRESCAN_SIGNALS = {
  'apy-rail-breach': 'P0',
  'mean30d-rail-breach': 'P0',
  'kpi-nonfinite': 'P0',
  'absurd-magnitude': 'P0',
  'missing-tvl': 'P1'
};

// backlog 183 leg (a) — provenance/classification kind -> severity, same
// role as POOL_PRESCAN_SIGNALS above. `environment` is the only downgrade;
// `defect` and `undeterminable` both stay blocking (spec 183's non-vacuity
// contract: the downgrade must never be the silent default).
const CTA_KIND_SEVERITY = { defect: 'P1', undeterminable: 'P1', environment: 'P2' };

// backlog 183 leg (a) — the real protocol CTA and 182's honest DefiLlama
// fallback share the exact `.cta-button-protocol` class/DOM shape (only the
// copy differs), so the shape discriminator reads the adjacent
// `.pool-action-hint--muted` hint text and matches it against
// translations.js's `opensDefillamaFallback` string in BOTH languages —
// pool-detail-ko is an audited surface, so an EN-only marker would silently
// go blind on it.
const FALLBACK_HINT_MARKERS = [
  'No protocol link available', // en — translations.js opensDefillamaFallback
  '프로토콜 링크 없음'             // ko — translations.js opensDefillamaFallback
];

// backlog 183 leg (b) — co-located with audit-findings.json
// (product-loop-kit/signals/), which the heartbeat already commits daily, so
// rotation state costs zero additional deploys (spec 183 T5 / the 087
// churn-trap precedent) rather than a new commit cadence.
const DEFAULT_ROTATION_STATE_PATH = path.join(ROOT, 'product-loop-kit', 'signals', 'audit-rotation.json');
// Bounded, drop-oldest on overflow (spec 183 §1). INVARIANT (operator
// review, round 2): this MUST stay strictly greater than the real
// rotation-candidate population (snapshot pool count minus the anchor and
// any prescan-promoted ids — 737 pools on this checkout, so ~735 candidates)
// or `unseen` can never reach zero, `computeRotation()`'s wrap branch (and
// therefore `cycle` ever incrementing, and the "log the rotation position so
// a reader can tell coverage from luck" signal) becomes permanently dead
// code on real data — a cap of 500 against ~735 candidates was exactly this
// bug. 2000 gives headroom for real snapshot growth while staying a bounded,
// small file (~40 bytes/id ⇒ ~80KB at the cap) that costs nothing extra to
// commit (the file already rewrites daily). test_audit_cta_provenance.js
// asserts this invariant against the REAL data/pools-snapshot.json so a
// future snapshot outgrowing the cap fails loudly instead of silently
// killing the wrap branch again.
const ROTATION_SEEN_CAP = 2000;

// Non-HTML text-surface prescan (backlog 160): llms.txt/llms-full.txt are
// generated/committed/served surfaces prescanStaticPages() never reads
// (evidence: 159 published 353,114.2% APY live, caught only by hand). Same
// pure fs+regex shape as the static prescan, aimed at ~2 files not ~2,197.
const TEXT_SURFACE_FILES = ['llms.txt', 'llms-full.txt'];
// signal -> severity, single source of truth (same role as PRESCAN_SIGNALS).
const TEXT_SURFACE_SIGNALS = { 'apy-rail-breach': 'P0', 'broken-number-literal': 'P0', 'tvl-floor-claim': 'P1', 'empty-surface': 'P1', 'link-target-integrity': 'P1' };

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

// link-target-integrity (backlog 169) — three independently-neuterable
// sub-rules over defi.garden links only (non-defi.garden links — DefiLlama,
// protocol sites — are out of scope: we do not own their shape). Pure text
// extraction + comparison, never a fetch/resolve/render of any URL.
// Captured group 1 is the path+query suffix after the origin, or undefined
// for the bare origin (e.g. "https://www.defi.garden" with nothing after).
const TEXT_DEFI_GARDEN_URL = /https:\/\/(?:www\.)?defi\.garden(\/[^\s)\]"'<>]*)?/g;

// (a) unrouted query key — every query key on every defi.garden URL must be
// in ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {'lang'}, PARSED OUT OF home.html
// (the router's own arrays, home.html:77-78) at scan time — never a second
// hardcoded copy of the param list (that IS the bug class 166 shipped: a
// stale ?search= that had never been a router param). home.html is only
// regex-read here, never executed.
function extractQuotedArray(text, varName) {
  const declMatch = text.match(new RegExp('var\\s+' + varName + '\\s*=\\s*\\[([^\\]]*)\\]'));
  if (!declMatch) return null;
  const items = [];
  const strRe = /'([^']*)'|"([^"]*)"/g;
  let m;
  while ((m = strRe.exec(declMatch[1])) !== null) items.push(m[1] !== undefined ? m[1] : m[2]);
  return items;
}

// Returns { allowed: Set|null, error: string|null }. The caller prints the
// stderr note ONCE per scan (not once per file) and skips rule (a) entirely
// on error — rules (b)/(c) and the four pre-existing signals must keep
// working (the prescanTextSurfaces() never-throws contract).
function loadRouterAllowedParams(homeHtmlPath) {
  let text;
  try { text = fs.readFileSync(homeHtmlPath, 'utf8'); }
  catch (e) { return { allowed: null, error: `home.html unreadable at ${homeHtmlPath}: ${e.message}` }; }
  const analyticsParams = extractQuotedArray(text, 'ANALYTICS_PARAMS');
  const plannerParams = extractQuotedArray(text, 'PLANNER_PARAMS');
  if (!analyticsParams || !plannerParams) {
    return { allowed: null, error: `could not parse ANALYTICS_PARAMS/PLANNER_PARAMS out of ${homeHtmlPath}` };
  }
  // 'lang' is read by translations.js, not the router, so it never appears
  // in either array — a real, live query key (spec 169 Territory note), so
  // it is allowed explicitly rather than fudged in by loosening the parse.
  return { allowed: new Set([...analyticsParams, ...plannerParams, 'lang']), error: null };
}

// Query keys on one URL match's captured suffix ('' / undefined for the
// bare origin, which has none to check).
function urlQueryKeys(urlSuffix) {
  const qIdx = (urlSuffix || '').indexOf('?');
  if (qIdx === -1) return [];
  return urlSuffix.slice(qIdx + 1).split('&').filter(Boolean).map((pair) => pair.split('=')[0]);
}

// Bare origin = the captured suffix is empty/undefined or just '/' — no
// path, no query. https://www.defi.garden and https://www.defi.garden/ both
// count; anything with a path or a query does not.
function isBareOriginSuffix(urlSuffix) {
  return !urlSuffix || urlSuffix === '/';
}

// Never throws: an unreadable/missing file is skipped (stderr note) and
// doesn't count toward `scanned` — exact parallel of prescanStaticPages().
function prescanTextSurfaces(opts = {}) {
  const files = opts.files || TEXT_SURFACE_FILES;
  let scanned = 0;
  const suspects = [];

  // Rule (a)'s allowlist is the SAME for every file in this scan — parsed
  // once, not once per file, so a skip note prints exactly once (opts.homeHtml
  // is the coupling-test override, same convention as opts.files).
  const homeHtmlPath = opts.homeHtml || path.join(ROOT, 'home.html');
  const routerParams = loadRouterAllowedParams(homeHtmlPath);
  if (routerParams.error) {
    console.error(`[audit] text prescan: link-target-integrity rule (a) skipped — ${routerParams.error}`);
  }

  // Levels 2/3 (backlog 175) setup — parsed/loaded ONCE per scan, same
  // "one stderr note per scan, never per file" contract as routerParams
  // above. opts.appJs/opts.snapshot/opts.plannerJs are the coupling-test
  // overrides, same convention as opts.homeHtml.
  const appJsPath = opts.appJs || path.join(ROOT, 'app.js');
  const minTvlInfo = loadDefaultMinTvl(appJsPath);
  if (minTvlInfo.error) {
    console.error(`[audit] text prescan: link-target-integrity level 3 (non-empty) skipped — ${minTvlInfo.error}`);
  }
  const snapshotPath = opts.snapshot || path.join(ROOT, 'data/pools-snapshot.json');
  const snapshotInfo = loadSnapshotPopulation(snapshotPath);
  if (snapshotInfo.error) {
    console.error(`[audit] text prescan: link-target-integrity level 2 (protocols) + level 3 (non-empty) skipped — ${snapshotInfo.error}`);
  }
  const projectSet = snapshotInfo.pools ? new Set(snapshotInfo.pools.map((p) => p.project)) : null;
  const plannerJsPath = opts.plannerJs || path.join(ROOT, 'planner.js');
  const presetKeysInfo = loadPlannerPresetKeys(plannerJsPath);
  if (presetKeysInfo.error) {
    console.error(`[audit] text prescan: link-target-integrity level 2 (preset) skipped — ${presetKeysInfo.error}`);
  }

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

    // link-target-integrity (P1, backlog 169) — three sub-rules, each AT
    // MOST ONE suspect per file (same "systemic breach = one suspect whose
    // detail quotes examples" convention as apy-rail-breach above).
    const poolLines = content.split('\n')
      .filter((line) => TEXT_POOL_LINE_APY.test(line) && TEXT_POOL_LINE_TVL.test(line));

    // (a) unrouted query key — scans the WHOLE file (a plain ?chain=/?token=
    // link on a non-pool line counts too), not just pool-shaped lines.
    // Skipped entirely (no throw) when home.html couldn't be read/parsed.
    if (routerParams.allowed) {
      const badKeys = new Set();
      let badLinkCount = 0;
      for (const m of content.matchAll(TEXT_DEFI_GARDEN_URL)) {
        const bad = urlQueryKeys(m[1]).filter((k) => !routerParams.allowed.has(k));
        if (bad.length) { badLinkCount++; bad.forEach((k) => badKeys.add(k)); }
      }
      if (badLinkCount > 0) {
        const badPlural = badLinkCount !== 1;
        const keyList = [...badKeys];
        const shown = keyList.slice(0, 3).map((k) => `"${k}"`);
        let detail = `${badLinkCount} defi.garden link${badPlural ? 's' : ''} carr${badPlural ? 'y' : 'ies'} a query key outside ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang} (parsed from home.html) — key(s): ${shown.join(', ')}`;
        if (keyList.length > shown.length) detail += ` (+${keyList.length - shown.length} more)`;
        suspects.push({ rel, signal: 'link-target-integrity', severity: TEXT_SURFACE_SIGNALS['link-target-integrity'], detail });
      }
    }

    // (b) pool row -> bare origin — a row describing a specific pool whose
    // ONLY defi.garden link is the bare homepage tells the reader nothing.
    const bareOriginRows = poolLines.filter((line) => {
      const hits = [...line.matchAll(TEXT_DEFI_GARDEN_URL)];
      return hits.length > 0 && hits.every((h) => isBareOriginSuffix(h[1]));
    });
    if (bareOriginRows.length > 0) {
      const rowPlural = bareOriginRows.length !== 1;
      const examples = bareOriginRows.slice(0, 3).map((l) => `"${l.trim()}"`);
      let detail = `${bareOriginRows.length} pool-shaped row${rowPlural ? 's' : ''} link${rowPlural ? '' : 's'} only to the bare defi.garden origin — e.g. ${examples.join(' | ')}`;
      if (bareOriginRows.length > examples.length) detail += ` (+${bareOriginRows.length - examples.length} more)`;
      suspects.push({ rel, signal: 'link-target-integrity', severity: TEXT_SURFACE_SIGNALS['link-target-integrity'], detail });
    }

    // (c) one URL, two different figure sets — group pool-shaped lines by
    // their first defi.garden URL (verbatim), then compare the extracted
    // "…% APY"/"$… TVL" LITERAL tuple, not the whole line (whole-line
    // comparison makes every row trivially distinct and the rule vacuous).
    // Verbatim-identical rows sharing a URL are not a defect (deduped below
    // via the figureKey Map, so repeats collapse to one entry).
    const byUrl = new Map();
    for (const line of poolLines) {
      const urlMatch = line.match(TEXT_DEFI_GARDEN_URL);
      if (!urlMatch) continue;
      const url = urlMatch[0];
      const apyMatch = [...line.matchAll(TEXT_APY_FIGURE)][0];
      const tvlMatch = [...line.matchAll(TEXT_TVL_FIGURE)][0];
      if (!apyMatch || !tvlMatch) continue;
      const figureKey = `${apyMatch[1]}|${tvlMatch[1]}${tvlMatch[2] || ''}`;
      if (!byUrl.has(url)) byUrl.set(url, new Map());
      const figures = byUrl.get(url);
      if (!figures.has(figureKey)) figures.set(figureKey, line.trim());
    }
    // Collect EVERY conflicting URL group, not just the first (verifier
    // gap, post-ship: `break`ing at the first group silently dropped any
    // additional ones — no count, no "+N more", a real detection gap).
    // Still exactly ONE suspect for the whole file (169's own one-suspect-
    // per-file-per-sub-rule shape), but its `detail` now states the TRUE
    // total conflicting-URL count, same voice as (a)/(b)'s leading number.
    const conflicts = [];
    for (const [url, figures] of byUrl) {
      if (figures.size > 1) conflicts.push({ url, figures });
    }
    // Deterministic "worst" pick: most distinct figure sets; ties broken by
    // FIRST-ENCOUNTERED order (strict `>`, never `>=`, so an earlier URL
    // never loses a tie to a later one) — stable across runs on identical
    // bytes, since `conflicts` itself is built in file-encounter order.
    let worst = null;
    for (const c of conflicts) {
      if (!worst || c.figures.size > worst.figures.size) worst = c;
    }
    if (worst) {
      const total = conflicts.length;
      const totalPlural = total !== 1;
      const examples = [...worst.figures.values()].slice(0, 3).map((l) => `"${l}"`);
      let detail = `${total} defi.garden URL${totalPlural ? 's' : ''} ${totalPlural ? 'are' : 'is'} shared by pool-shaped lines stating DIFFERENT figures — worst: "${worst.url}" (${worst.figures.size} distinct figure sets) — e.g. ${examples.join(' | ')}`;
      if (worst.figures.size > examples.length) detail += ` (+${worst.figures.size - examples.length} more figures on that URL)`;
      if (total > 1) detail += ` (+${total - 1} more conflicting URL${total - 1 !== 1 ? 's' : ''})`;
      suspects.push({ rel, signal: 'link-target-integrity', severity: TEXT_SURFACE_SIGNALS['link-target-integrity'], detail });
    }

    // link-target-integrity LEVEL 2 ("resolvable", backlog 175 T5/T6): a
    // `?protocols=<slug>` value must be a real snapshot project; a
    // `?preset=<key>` value must be a real planner.js PRESETS key. `?pool=`
    // liveness stays OUT of the offline prescan — validating it against this
    // $10M snapshot is the exact 4,233-false-positive class-10 trap (spec
    // 175 acceptance criterion 3; playbooks/product-audit.md class 10).
    if (projectSet || presetKeysInfo.allowed) {
      const badProtocolValues = new Set();
      let badProtocolLinkCount = 0;
      const badPresetValues = new Set();
      let badPresetLinkCount = 0;
      for (const m of content.matchAll(TEXT_DEFI_GARDEN_URL)) {
        const suffix = m[1] || '';
        const linkPathVal = ownedLinkPath(suffix);
        const pairs = linkQueryPairs(suffix);
        if (projectSet && (linkPathVal === '' || linkPathVal === '/') && pairs.has('protocols')) {
          const bad = pairs.get('protocols').split(',').filter(Boolean).filter((slug) => !projectSet.has(slug));
          if (bad.length) { badProtocolLinkCount++; bad.forEach((s) => badProtocolValues.add(s)); }
        }
        if (presetKeysInfo.allowed && linkPathVal === '/plan.html' && pairs.has('preset')) {
          const val = pairs.get('preset');
          if (val && !presetKeysInfo.allowed.has(val)) { badPresetLinkCount++; badPresetValues.add(val); }
        }
      }
      if (badProtocolLinkCount > 0) {
        const list = [...badProtocolValues];
        const shown = list.slice(0, 3).map((s) => `"${s}"`);
        const plural = badProtocolLinkCount !== 1;
        let detail = `${badProtocolLinkCount} defi.garden link${plural ? 's' : ''} carr${plural ? 'y' : 'ies'} a "protocols" value not present among the snapshot's ${projectSet.size} known project slugs (data/pools-snapshot.json) — value(s): ${shown.join(', ')}`;
        if (list.length > shown.length) detail += ` (+${list.length - shown.length} more)`;
        suspects.push({ rel, signal: 'link-target-integrity', severity: TEXT_SURFACE_SIGNALS['link-target-integrity'], detail });
      }
      if (badPresetLinkCount > 0) {
        const list = [...badPresetValues];
        const shown = list.slice(0, 3).map((s) => `"${s}"`);
        const plural = badPresetLinkCount !== 1;
        let detail = `${badPresetLinkCount} defi.garden link${plural ? 's' : ''} carr${plural ? 'y' : 'ies'} a "preset" value not among planner.js's PRESETS keys (${[...presetKeysInfo.allowed].join(', ')}) — value(s): ${shown.join(', ')}`;
        if (list.length > shown.length) detail += ` (+${list.length - shown.length} more)`;
        suspects.push({ rel, signal: 'link-target-integrity', severity: TEXT_SURFACE_SIGNALS['link-target-integrity'], detail });
      }
    }

    // link-target-integrity LEVEL 3 ("non-empty", backlog 175 T1/T4): a grid
    // link whose effective floor (app.js:927 rule) sits AT/ABOVE the
    // snapshot's own floor is simulated against the snapshot (T1: zero
    // false-positive risk — the snapshot is a complete population there).
    // BELOW the snapshot's floor, the snapshot is NEVER touched (that is the
    // exact class-10 trap) — those links are simply left uncounted, with the
    // skipped count named in the detail so the skip stays visible, not
    // silent.
    if (snapshotInfo.pools && minTvlInfo.value != null) {
      const deadLinks = [];
      const seenSuffix = new Set();
      let belowFloorSkipped = 0;
      for (const m of content.matchAll(TEXT_DEFI_GARDEN_URL)) {
        const suffix = m[1] || '';
        const linkPathVal = ownedLinkPath(suffix);
        if (linkPathVal !== '' && linkPathVal !== '/') continue;
        const pairs = linkQueryPairs(suffix);
        if (pairs.has('pool')) continue;
        if (!LEVEL3_GRID_PARAMS.some((k) => pairs.has(k))) continue;
        if (seenSuffix.has(suffix)) continue;
        seenSuffix.add(suffix);
        const floor = effectiveMinTvl(pairs, minTvlInfo.value);
        if (floor < snapshotInfo.minTvlUsd) { belowFloorSkipped++; continue; }
        const { count } = countQualifyingPools(snapshotInfo.pools, pairs, floor, {});
        if (count === 0) deadLinks.push({ url: m[0], floor });
      }
      if (deadLinks.length > 0) {
        const plural = deadLinks.length !== 1;
        const examples = deadLinks.slice(0, 3).map((d) => `"${d.url}" (floor $${d.floor.toLocaleString('en-US')})`);
        let detail = `${deadLinks.length} defi.garden grid link${plural ? 's' : ''} resolve${plural ? '' : 's'} to ZERO pools in the $${snapshotInfo.minTvlUsd.toLocaleString('en-US')} snapshot at ${plural ? 'their' : 'its'} effective floor — e.g. ${examples.join(', ')}`;
        if (deadLinks.length > examples.length) detail += ` (+${deadLinks.length - examples.length} more)`;
        if (belowFloorSkipped > 0) detail += ` — ${belowFloorSkipped} other grid link${belowFloorSkipped !== 1 ? 's' : ''} below the snapshot's own floor skipped (indeterminate against this population, never evaluated)`;
        suspects.push({ rel, signal: 'link-target-integrity', severity: TEXT_SURFACE_SIGNALS['link-target-integrity'], detail });
      }
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
// link-target-integrity for the HTML static surface (backlog 172) — the same
// three sub-rules 169 shipped for the text surfaces (llms.txt/llms-full.txt),
// re-aimed at the raw HTML prescanStaticPages() already reads. extractPageText()
// above strips ALL tags, so hrefs are gone by the time it returns — every
// helper below runs on the untouched `html` string, never on `h1Text`/
// `visibleText` (Territory note, spec 172). Reuses 169's
// extractQuotedArray()/loadRouterAllowedParams()/urlQueryKeys()/
// isBareOriginSuffix() verbatim (defined above, backlog 169) — no second copy
// of the router param list anywhere below.
// ---------------------------------------------------------------------------

// Decodes the handful of named HTML entities that can appear inside an
// href="..." attribute value. `&amp;` is the one this spec's own measurement
// found live (generated hrefs literally contain "&amp;" between query
// pairs, e.g. `/plan.html?waitlist=1&amp;src=seo_token`) — a scanner that
// splits the raw, un-decoded attribute on `&` invents a phantom "amp;src"
// key instead of the real "src" (spec 172 Change section, pinned by test).
// The other entities cost nothing to also handle and guard the same class.
function decodeHrefEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Every href="..." attribute value in the raw HTML — <a> AND <link> tags
// both carry real owned targets in the generated pages (e.g. `<link
// rel="stylesheet" href="/style.css">`), so this is not scoped to anchors.
const HTML_HREF_RE = /href="([^"]*)"/g;

// Absolute owned form: https://(www.)?defi.garden/... — same origin
// TEXT_DEFI_GARDEN_URL (169) matches in prose, tuned for an href attribute
// value instead (the attribute's closing quote is already the boundary, no
// need to stop at whitespace/brackets).
const HTML_OWNED_ABS_RE = /^https:\/\/(?:www\.)?defi\.garden(\/.*)?$/;

// Returns the owned suffix (path+query+fragment, leading '/', '' for the
// bare origin) for one decoded href, or null if the href is not one of the
// two forms the generated HTML actually emits (spec 172 Change section):
// absolute `https://(www.)?defi.garden/...` or root-relative `/...`.
// Non-defi.garden links (DefiLlama, protocol sites), `data:` URIs, and
// protocol-relative `//...` links are all out of scope — we do not own
// their shape.
function ownedHtmlLinkSuffix(hrefRaw) {
  const href = decodeHrefEntities(hrefRaw || '');
  const abs = href.match(HTML_OWNED_ABS_RE);
  if (abs) return abs[1] || '';
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  return null;
}

// Path only (query + fragment stripped) of an owned suffix — '' or '/' for
// the home path, '/plan.html' for the planner, anything else is "some
// other path" (fixed by path, its query keys are inert to rule (a)).
function ownedLinkPath(suffix) {
  const s = suffix || '';
  const cut = s.search(/[?#]/);
  return cut === -1 ? s : s.slice(0, cut);
}

// Planner's OWN allow-list, single-sourced from planner.js's urlParams.get()
// call sites — spec 172's resolution of the one judgment call in this item:
// the IA router does not arbitrate `/plan.html` (it is the planner by path
// alone, unconditionally), so rule (a)'s planner half cannot reuse
// loadRouterAllowedParams()/ANALYTICS_PARAMS/PLANNER_PARAMS at all. The only
// live question for a `/plan.html` link is which keys the planner itself
// reads, so that is scanned directly rather than allow-listed by hand.
// Same `{ allowed, error }` shape as loadRouterAllowedParams() (169) so both
// plug into the same call site below without a third shape to branch on.
function loadPlannerAllowedParams(plannerJsPath) {
  let text;
  try { text = fs.readFileSync(plannerJsPath, 'utf8'); }
  catch (e) { return { allowed: null, error: `planner.js unreadable at ${plannerJsPath}: ${e.message}` }; }
  const allowed = new Set();
  const re = /urlParams\.get\(\s*(['"])([^'"]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(text)) !== null) allowed.add(m[2]);
  if (allowed.size === 0) {
    return { allowed: null, error: `no urlParams.get(...) call sites found in ${plannerJsPath}` };
  }
  return { allowed, error: null };
}

// Rule (b)'s valid pool-row target: an owned link whose path is the home
// path ('' or '/') and whose query carries a non-empty `pool` key — the
// north-star `/?pool=<id>` shape (spec 172 rule (b)). `<id>` must be
// non-empty; it is never validated against any pool set (spec's own
// non-goal — liveness needs a network fetch this prescan never makes).
function isPoolAddressingSuffix(suffix) {
  if (suffix === null || suffix === undefined) return false;
  const p = ownedLinkPath(suffix);
  if (p !== '' && p !== '/') return false;
  const qIdx = suffix.indexOf('?');
  if (qIdx === -1) return false;
  const pairs = suffix.slice(qIdx + 1).split('&').filter(Boolean);
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const val = eq === -1 ? '' : pair.slice(eq + 1);
    if (key === 'pool' && val.length > 0) return true;
  }
  return false;
}

// class="..." / href="..." out of one <a ...> opening tag, independent of
// attribute order — the generated pages always emit class before href, but
// this does not assume that: a template change reordering attributes must
// not silently blind rule (b).
function anchorAttr(tag, name) {
  const m = tag.match(new RegExp(name + '="([^"]*)"', 'i'));
  return m ? m[1] : null;
}
function anchorHasClass(tag, cls) {
  const classAttr = anchorAttr(tag, 'class');
  return !!classAttr && classAttr.split(/\s+/).includes(cls);
}
const HTML_ANCHOR_TAG_RE = /<a\b[^>]*>/gi;
// Both classes item 029 shipped: `tp-pool-link` (token pages), `cp-pool-link`
// (chain pages).
const POOL_ROW_ANCHOR_CLASSES = ['tp-pool-link', 'cp-pool-link'];

// Rule (c): every path (query + fragment stripped) an owned link references,
// other than the home path and `/plan.html`, must resolve to a file on disk
// in one of three forms, relative to ROOT (spec 172 rule (c)).
function ownedPathResolvesToFile(pagePath) {
  const rel = pagePath.replace(/^\/+/, '');
  if (rel === '') return true; // caller never passes '' / '/' — see call site
  return [rel, `${rel}.html`, `${rel}/index.html`]
    .some((candidate) => fs.existsSync(path.join(ROOT, candidate)));
}

// ---------------------------------------------------------------------------
// link-target-integrity LEVELS 2/3 shared helpers (backlog 175, specs/175.md
// Territory notes T1/T2/T5/T6) — ONE set, used by BOTH prescanTextSurfaces()
// (169) and prescanStaticPages() (172). Rules (a)/(b)/(c) above only ever
// checked whether a query param was ROUTED (level 1, 172's own job — 166 was
// the bug there) or a pool-row anchor's target looked shaped right; nothing
// checked whether a value actually RESOLVES to a real entity (level 2: a
// snapshot project slug, a planner.js PRESETS key) or whether the target,
// simulated under the app's own filter arithmetic, returns anything at all
// (level 3) — the exact class item 173 shipped (1,749 dead CTAs level 1
// scored 0 on; spec 175 Evidence).
// ---------------------------------------------------------------------------

// Reads DEFAULT_MIN_TVL straight out of app.js (app.js:801). Same `{value,
// error}` shape as loadRouterAllowedParams()/loadPlannerAllowedParams() above
// so every level-2/3 call site branches on `.error` the same way — never a
// second hardcoded `10000000` anywhere in this file (166's own rule; spec
// 175 acceptance criterion 5 has the verifier re-derive this with `grep`).
function loadDefaultMinTvl(appJsPath) {
  let text;
  try { text = fs.readFileSync(appJsPath, 'utf8'); }
  catch (e) { return { value: null, error: `app.js unreadable at ${appJsPath}: ${e.message}` }; }
  const m = text.match(/const\s+DEFAULT_MIN_TVL\s*=\s*([0-9]+)\s*;/);
  if (!m) return { value: null, error: `could not parse "const DEFAULT_MIN_TVL = <n>;" out of ${appJsPath}` };
  return { value: parseInt(m[1], 10), error: null };
}

// Reads planner.js's `var PRESETS = { ... }` (planner.js:1119) top-level keys
// ONLY — no export is added to planner.js (Territory note T5: audit-app.js
// already regex-reads planner.js for exactly this reason, see
// loadPlannerAllowedParams() above, backlog 172). Manual brace-counting (not
// a `[\s\S]*?` regex) finds the block's real matching close brace regardless
// of how deep the preset values nest — a non-greedy regex would silently
// stop at the wrong `}` the day a preset value itself contains one.
function loadPlannerPresetKeys(plannerJsPath) {
  let text;
  try { text = fs.readFileSync(plannerJsPath, 'utf8'); }
  catch (e) { return { allowed: null, error: `planner.js unreadable at ${plannerJsPath}: ${e.message}` }; }
  const declIdx = text.search(/var\s+PRESETS\s*=\s*\{/);
  if (declIdx === -1) return { allowed: null, error: `could not find "var PRESETS = {" in ${plannerJsPath}` };
  const openIdx = text.indexOf('{', declIdx);
  let depth = 0, closeIdx = -1;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { closeIdx = i; break; } }
  }
  if (closeIdx === -1) return { allowed: null, error: `unterminated PRESETS block in ${plannerJsPath}` };
  const body = text.slice(openIdx + 1, closeIdx);
  const allowed = new Set();
  // Only a key immediately followed by `{` (an object-valued preset entry)
  // counts — inner scalar fields ('name', 'goal', 'monthly', ...) are never
  // mistaken for a top-level PRESETS key because their values aren't `{`.
  const keyRe = /(?:^|,)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*\{/g;
  let m;
  while ((m = keyRe.exec(body)) !== null) allowed.add(m[1]);
  if (allowed.size === 0) return { allowed: null, error: `no top-level keys found in the PRESETS block of ${plannerJsPath}` };
  return { allowed, error: null };
}

// Reads data/pools-snapshot.json's `pools` array + its own `minTvlUsd` floor.
// Territory note T1: the snapshot is a COMPLETE population AT AND ABOVE its
// own floor, by construction — that completeness, not a heuristic, is what
// makes it safe to simulate against. Never call this to validate a link
// whose effective floor sits BELOW `minTvlUsd` — that is the exact
// 4,233-false-positive class-10 trap (playbooks/product-audit.md); enforcing
// that boundary is each call site's job, not this loader's.
function loadSnapshotPopulation(snapshotPath) {
  let raw;
  try { raw = fs.readFileSync(snapshotPath, 'utf8'); }
  catch (e) { return { pools: null, minTvlUsd: null, error: `snapshot unreadable at ${snapshotPath}: ${e.message}` }; }
  let json;
  try { json = JSON.parse(raw); }
  catch (e) { return { pools: null, minTvlUsd: null, error: `snapshot unparseable JSON at ${snapshotPath}: ${e.message}` }; }
  if (!Array.isArray(json.pools) || typeof json.minTvlUsd !== 'number') {
    return { pools: null, minTvlUsd: null, error: `snapshot at ${snapshotPath} is missing a "pools" array or a numeric "minTvlUsd"` };
  }
  return { pools: json.pools, minTvlUsd: json.minTvlUsd, error: null };
}

// First-occurrence key -> DECODED value off one link suffix's query string.
// Reuses urlQueryKeys()'s own '?'-split convention but keeps values too
// (urlQueryKeys() stays as-is — rule (a) never needed values, only keys). A
// malformed %-escape keeps the '+'-replaced-but-undecoded raw value rather
// than throwing (decodeURIComponent throws on a lone '%'); a malformed query
// value is not this rule's concern.
function linkQueryPairs(suffix) {
  const out = new Map();
  const qIdx = (suffix || '').indexOf('?');
  if (qIdx === -1) return out;
  for (const pair of suffix.slice(qIdx + 1).split('&').filter(Boolean)) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    let value = eq === -1 ? '' : pair.slice(eq + 1).replace(/\+/g, ' ');
    try { value = decodeURIComponent(value); } catch (e) { /* keep the raw, undecoded value */ }
    if (!out.has(key)) out.set(key, value);
  }
  return out;
}

// Mirrors app.js:927 EXACTLY: an explicit `minTvl` — even one BELOW
// DEFAULT_MIN_TVL — is honoured, never clamped up (that is 173's own fix;
// spec 175 acceptance criterion 5 checks this exact case: `?minTvl=100000`
// resolves to 100000, never to 10000000). Absent -> the default. A
// present-but-unparseable (NaN) value also falls back to the default, so a
// malformed `?minTvl=` never simulates a floor of NaN (every comparison
// against NaN is false, which would silently read as "every link is dead").
function effectiveMinTvl(queryMap, defaultMinTvl) {
  if (!queryMap.has('minTvl')) return defaultMinTvl;
  const parsed = parseInt(queryMap.get('minTvl'), 10);
  return Number.isFinite(parsed) ? parsed : defaultMinTvl;
}

// Token <-> pool-symbol substring matcher — mirrors app.js:835's
// symbolMatchesToken() exactly (same mirror test_seo_cta_targets.js already
// keeps, per spec's own prior-art pointer, T6). Not imported: app.js is a
// browser UMD script with no module.exports (the same reason app.js:809-822
// re-states STABLE_SYMBOLS instead of importing it).
function symbolMatchesTokenMirror(poolSymbol, token) {
  if (!poolSymbol || !token) return false;
  return String(poolSymbol).toUpperCase().includes(String(token).toUpperCase());
}

// Grid-filter query keys that make a home-path link a level-3 candidate
// (spec 175 §C) — shared so "what counts as a grid link" can never drift
// between the two prescan legs.
const LEVEL3_GRID_PARAMS = ['token', 'chain', 'poolTypes', 'protocols', 'minTvl', 'minApy'];

// The app's filter simulation (level 3, "non-empty") over a POOL-SHAPED
// population with real symbol/chain/project/apy/tvl fields — used against
// `data/pools-snapshot.json` (text-surface level 3; Territory T1: the
// snapshot is complete at/above its own floor) and NOWHERE else. The
// static-page leg's population is the page's OWN listed rows (Territory T2),
// which carry only a parsed `tvlUsd` — no symbol/chain/project/apy fields to
// filter on — so prescanStaticPages() deliberately does NOT call this helper
// for its own level-3 check (see its own block below, which applies only the
// TVL floor to parsePageOwnPools()'s rows; explained in specs/175-notes.md).
// Mirrors app.js's filter arithmetic pool-for-pool:
//   token     -> symbolMatchesTokenMirror(pool.symbol, token)    (app.js:835)
//   chain     -> exact, case-sensitive pool.chain equality
//   protocols -> comma-split membership against pool.project
//   poolTypes -> comma-split membership against getPoolType(pool), lazy-
//                required from generate-sitemap.js in a try/catch (T6): if
//                unavailable the constraint is DROPPED and the drop is
//                reported via the returned `poolTypesApplied` flag, never
//                silently ignored (T8)
//   tvl       -> (tvlUsd||0) >= minTvl && (tvlUsd||0) > 0
//   minApy    -> (apyBase||0)+(apyReward||0) >= minApy (absent -> 0)
function countQualifyingPools(pools, queryMap, minTvl, opts) {
  opts = opts || {};
  const token = queryMap.get('token') || '';
  const chain = queryMap.get('chain') || '';
  const protocolsRaw = queryMap.get('protocols');
  const protocols = protocolsRaw ? protocolsRaw.split(',').filter(Boolean) : [];
  const poolTypesRaw = queryMap.get('poolTypes');
  const poolTypesWanted = poolTypesRaw ? poolTypesRaw.split(',').filter(Boolean) : [];
  const minApyRaw = queryMap.get('minApy');
  const minApy = minApyRaw ? (parseInt(minApyRaw, 10) || 0) : 0;

  let getPoolType = null;
  let poolTypesApplied = false;
  if (poolTypesWanted.length) {
    try {
      getPoolType = require(path.join(ROOT, 'generate-sitemap.js')).getPoolType;
      if (typeof getPoolType === 'function') poolTypesApplied = true;
    } catch (e) { getPoolType = null; }
  }

  let count = 0;
  for (const p of pools) {
    if (token && !symbolMatchesTokenMirror(p.symbol, token)) continue;
    if (chain && p.chain !== chain) continue;
    if (protocols.length && !protocols.includes(p.project)) continue;
    if (poolTypesWanted.length && poolTypesApplied && !poolTypesWanted.includes(getPoolType(p))) continue;
    const tvl = p.tvlUsd || 0;
    if (!(tvl >= minTvl) || !(tvl > 0)) continue;
    const apy = (p.apyBase || 0) + (p.apyReward || 0);
    if (!(apy >= minApy)) continue;
    count++;
  }
  return { count, poolTypesApplied };
}

// Page's OWN listed pool rows (Territory note T2) — the population its own
// generator (generate-token-pages.js / generate-chain-pages.js) actually drew
// from, at whatever floor IT used, parsed straight off the rendered table
// rather than re-fetched. NEVER touches data/pools-snapshot.json — that IS
// the class-10 4,233-false-positive trap (playbooks/product-audit.md; T1).
// Row shape (both generators, verified on chains/ethereum.html +
// tokens/usdc.html): one <tr> per pool with exactly one tp-pool-link/
// cp-pool-link anchor and two <td class="num"> cells; the LAST is the TVL
// money figure. Column ORDER differs between the two generators (chain
// pages: Token/Protocol/APY/TVL; token pages: Protocol/Chain/APY/TVL), so
// this takes the LAST `num` cell rather than a fixed index.
const HTML_ROW_RE = /<tr>([\s\S]*?)<\/tr>/g;
const HTML_NUM_TD_RE = /<td class="num">([^<]*)<\/td>/g;
const HTML_MONEY_RE = /\$\s?([\d,]+(?:\.\d+)?)\s?([KMBT])?/;
function parsePageOwnPools(html) {
  const rows = [];
  for (const m of html.matchAll(HTML_ROW_RE)) {
    const body = m[1];
    if (!/class="(?:tp|cp)-pool-link"/.test(body)) continue;
    const nums = [...body.matchAll(HTML_NUM_TD_RE)].map((x) => x[1]);
    if (!nums.length) continue;
    const moneyMatch = nums[nums.length - 1].match(HTML_MONEY_RE);
    if (!moneyMatch) continue;
    const tvlUsd = parseMoney(moneyMatch[1], moneyMatch[2]);
    if (!Number.isFinite(tvlUsd)) continue;
    rows.push({ tvlUsd });
  }
  return rows;
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
  // opts.pages (test-support only, same convention as prescanTextSurfaces()'s
  // opts.files — see 169) overrides the production page list; production
  // behaviour (no opts.pages) is unchanged: listLeafPages('tokens') +
  // listLeafPages('chains'), spec 172's "page list is unchanged" requirement.
  const rawPages = opts.pages || listLeafPages('tokens').concat(listLeafPages('chains'));

  // Rule (a)'s two allow-lists are the SAME for every page in this scan —
  // parsed once, not once per file, so an unreadable/unparseable
  // home.html/planner.js prints its stderr note exactly once (mirrors
  // prescanTextSurfaces()'s own routerParams setup, backlog 169).
  // opts.homeHtml/opts.plannerJs are the coupling-test override, same
  // convention as opts.homeHtml on prescanTextSurfaces().
  const homeHtmlPath = opts.homeHtml || path.join(ROOT, 'home.html');
  const plannerJsPath = opts.plannerJs || path.join(ROOT, 'planner.js');
  const routerParams = loadRouterAllowedParams(homeHtmlPath);
  if (routerParams.error) {
    console.error(`[audit] static prescan: link-target-integrity rule (a) [home.html half] skipped — ${routerParams.error}`);
  }
  const plannerParams = loadPlannerAllowedParams(plannerJsPath);
  if (plannerParams.error) {
    console.error(`[audit] static prescan: link-target-integrity rule (a) [planner.js half] skipped — ${plannerParams.error}`);
  }

  // Levels 2/3 (backlog 175) setup — parsed/loaded ONCE per scan, same
  // "one stderr note per scan" contract as rule (a) above. opts.appJs/
  // opts.snapshot are the coupling-test overrides; opts.plannerJs is reused
  // from rule (a) (same underlying file, same override knob).
  const appJsPath = opts.appJs || path.join(ROOT, 'app.js');
  const minTvlInfo = loadDefaultMinTvl(appJsPath);
  if (minTvlInfo.error) {
    console.error(`[audit] static prescan: link-target-integrity level 3 (non-empty) skipped — ${minTvlInfo.error}`);
  }
  const snapshotPath = opts.snapshot || path.join(ROOT, 'data/pools-snapshot.json');
  const snapshotInfo = loadSnapshotPopulation(snapshotPath);
  if (snapshotInfo.error) {
    console.error(`[audit] static prescan: link-target-integrity level 2 (protocols) skipped — ${snapshotInfo.error}`);
  }
  const projectSet = snapshotInfo.pools ? new Set(snapshotInfo.pools.map((p) => p.project)) : null;
  const presetKeysInfo = loadPlannerPresetKeys(plannerJsPath);
  if (presetKeysInfo.error) {
    console.error(`[audit] static prescan: link-target-integrity level 2 (preset) skipped — ${presetKeysInfo.error}`);
  }

  let scanned = 0;
  const suspects = [];

  for (const p of rawPages) {
    const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
    const rel = path.isAbsolute(p) ? path.relative(ROOT, p) : p;
    let h1Text, visibleText, html;
    try {
      html = fs.readFileSync(abs, 'utf8');
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

    // link-target-integrity (P1, backlog 172) — three independently
    // neuterable sub-rules over the RAW `html` string (never `visibleText`:
    // extractPageText() strips all tags, so hrefs are already gone from it).
    // At most one suspect PER SUB-RULE per file (169's own convention for
    // this exact signal): a systemic breach is one suspect whose `detail`
    // quotes <=3 examples, never one finding per link/row.

    // (a) unrouted query key + (c) internal target does not exist — one
    // pass over every href="..." on the page, since both sub-rules key off
    // the same owned-suffix/path split.
    {
      const badKeys = new Set();
      const badExamples = [];
      let badLinkCount = 0;
      const brokenPaths = [];
      const seenPath = new Set();
      for (const m of html.matchAll(HTML_HREF_RE)) {
        const suffix = ownedHtmlLinkSuffix(m[1]);
        if (suffix === null) continue; // not an owned link — out of scope
        const linkPath = ownedLinkPath(suffix);
        if (linkPath === '' || linkPath === '/' || linkPath === '/plan.html') {
          // rule (a): router-arbitrated home path, or planner-arbitrated
          // /plan.html — any other path is inert to rule (a) (fixed by path).
          const allowed = linkPath === '/plan.html' ? plannerParams.allowed : routerParams.allowed;
          if (!allowed) continue; // that half unreadable/unparseable — noted once above, skip silently here
          const bad = urlQueryKeys(suffix).filter((k) => !allowed.has(k));
          if (bad.length) {
            badLinkCount++;
            bad.forEach((k) => badKeys.add(k));
            if (badExamples.length < 3) badExamples.push(decodeHrefEntities(m[1]));
          }
        } else {
          // rule (c): every OTHER path must resolve to a file on disk.
          if (seenPath.has(linkPath)) continue;
          seenPath.add(linkPath);
          if (!ownedPathResolvesToFile(linkPath)) brokenPaths.push(linkPath);
        }
      }
      if (badLinkCount > 0) {
        const keyList = [...badKeys];
        const shownKeys = keyList.slice(0, 3).map((k) => `"${k}"`);
        const plural = badLinkCount !== 1;
        let detail = `${badLinkCount} defi.garden link${plural ? 's' : ''} carr${plural ? 'y' : 'ies'} a query key outside the allowed set for its path (home path: ANALYTICS_PARAMS ∪ PLANNER_PARAMS ∪ {lang}, parsed from home.html; /plan.html: planner.js's own urlParams.get() keys) — key(s): ${shownKeys.join(', ')}`;
        if (keyList.length > shownKeys.length) detail += ` (+${keyList.length - shownKeys.length} more keys)`;
        if (badExamples.length) detail += ` — e.g. ${badExamples.map((h) => `"${h}"`).join(', ')}`;
        suspects.push({ rel, slug, signal: 'link-target-integrity', severity: PRESCAN_SIGNALS['link-target-integrity'], detail });
      }
      if (brokenPaths.length > 0) {
        const plural = brokenPaths.length !== 1;
        const examples = brokenPaths.slice(0, 3).map((bp) => `"${bp}"`);
        let detail = `${brokenPaths.length} internal link target${plural ? 's' : ''} on this page resolve${plural ? '' : 's'} to no file on disk (checked <path>, <path>.html, <path>/index.html under ROOT) — e.g. ${examples.join(', ')}`;
        if (brokenPaths.length > examples.length) detail += ` (+${brokenPaths.length - examples.length} more)`;
        suspects.push({ rel, slug, signal: 'link-target-integrity', severity: PRESCAN_SIGNALS['link-target-integrity'], detail });
      }
    }

    // (b) pool row -> non-addressing target. Also tallies poolAnchorCount —
    // the same pool-row-anchor scan level 3's anti-vacuity rail below needs,
    // so it's counted here rather than re-scanning the page a second time.
    let poolAnchorCount = 0;
    {
      const badTargets = [];
      for (const m of html.matchAll(HTML_ANCHOR_TAG_RE)) {
        const tag = m[0];
        if (!POOL_ROW_ANCHOR_CLASSES.some((c) => anchorHasClass(tag, c))) continue;
        poolAnchorCount++;
        const hrefRaw = anchorAttr(tag, 'href');
        if (!hrefRaw) { badTargets.push('(missing href)'); continue; }
        const suffix = ownedHtmlLinkSuffix(hrefRaw);
        if (suffix !== null && isPoolAddressingSuffix(suffix)) continue;
        badTargets.push(decodeHrefEntities(hrefRaw) || '(empty href)');
      }
      if (badTargets.length > 0) {
        const plural = badTargets.length !== 1;
        const examples = badTargets.slice(0, 3).map((h) => `"${h}"`);
        let detail = `${badTargets.length} pool-row anchor${plural ? 's' : ''} (tp-pool-link/cp-pool-link) do${plural ? '' : 'es'} not target a "?pool=<id>" URL — e.g. ${examples.join(', ')}`;
        if (badTargets.length > examples.length) detail += ` (+${badTargets.length - examples.length} more)`;
        suspects.push({ rel, slug, signal: 'link-target-integrity', severity: PRESCAN_SIGNALS['link-target-integrity'], detail });
      }
    }

    // link-target-integrity LEVEL 2 ("resolvable", backlog 175 T5/T6): a
    // `?protocols=<slug>` value must be a real snapshot project; a
    // `?preset=<key>` value must be a real planner.js PRESETS key. `?pool=`
    // liveness stays OUT of the offline prescan (the class-10 trap; spec 175
    // acceptance criterion 3) — rule (b) above already governs pool-row
    // anchor shape, this never re-validates the id itself.
    {
      const badProtocolValues = new Set();
      let badProtocolLinkCount = 0;
      const badPresetValues = new Set();
      let badPresetLinkCount = 0;
      for (const m of html.matchAll(HTML_HREF_RE)) {
        const suffix = ownedHtmlLinkSuffix(m[1]);
        if (suffix === null) continue;
        const linkPathVal = ownedLinkPath(suffix);
        const pairs = linkQueryPairs(suffix);
        if (projectSet && (linkPathVal === '' || linkPathVal === '/') && pairs.has('protocols')) {
          const bad = pairs.get('protocols').split(',').filter(Boolean).filter((slug) => !projectSet.has(slug));
          if (bad.length) { badProtocolLinkCount++; bad.forEach((s) => badProtocolValues.add(s)); }
        }
        if (presetKeysInfo.allowed && linkPathVal === '/plan.html' && pairs.has('preset')) {
          const val = pairs.get('preset');
          if (val && !presetKeysInfo.allowed.has(val)) { badPresetLinkCount++; badPresetValues.add(val); }
        }
      }
      if (badProtocolLinkCount > 0) {
        const list = [...badProtocolValues];
        const shown = list.slice(0, 3).map((s) => `"${s}"`);
        const plural = badProtocolLinkCount !== 1;
        let detail = `${badProtocolLinkCount} defi.garden link${plural ? 's' : ''} carr${plural ? 'y' : 'ies'} a "protocols" value not present among the snapshot's ${projectSet.size} known project slugs (data/pools-snapshot.json) — value(s): ${shown.join(', ')}`;
        if (list.length > shown.length) detail += ` (+${list.length - shown.length} more)`;
        suspects.push({ rel, slug, signal: 'link-target-integrity', severity: PRESCAN_SIGNALS['link-target-integrity'], detail });
      }
      if (badPresetLinkCount > 0) {
        const list = [...badPresetValues];
        const shown = list.slice(0, 3).map((s) => `"${s}"`);
        const plural = badPresetLinkCount !== 1;
        let detail = `${badPresetLinkCount} defi.garden link${plural ? 's' : ''} carr${plural ? 'y' : 'ies'} a "preset" value not among planner.js's PRESETS keys (${[...presetKeysInfo.allowed].join(', ')}) — value(s): ${shown.join(', ')}`;
        if (list.length > shown.length) detail += ` (+${list.length - shown.length} more)`;
        suspects.push({ rel, slug, signal: 'link-target-integrity', severity: PRESCAN_SIGNALS['link-target-integrity'], detail });
      }
    }

    // link-target-integrity LEVEL 3 ("non-empty", backlog 175 T2/T3/T8):
    // population = the page's OWN listed rows (T2) — never
    // data/pools-snapshot.json (the class-10 trap). poolTypes/protocols/
    // token/chain/minApy are NOT simulated here (own-rows carry only a
    // parsed tvlUsd — see parsePageOwnPools()'s own doc comment and
    // specs/175-notes.md); only the TVL floor is checked.
    if (minTvlInfo.value != null && poolAnchorCount > 0) {
      const ownRows = parsePageOwnPools(html);
      if (ownRows.length === 0) {
        // T8 anti-vacuity rail: a page with pool-row anchors but zero
        // parseable rows must say so loudly, never go dark silently.
        suspects.push({ rel, slug, signal: 'link-target-integrity', severity: PRESCAN_SIGNALS['link-target-integrity'],
          detail: `level-3 ("non-empty") population was unparseable: page has ${poolAnchorCount} pool-row anchor(s) (tp-pool-link/cp-pool-link) but zero rows yielded a parseable TVL figure from their last <td class="num"> cell` });
      } else {
        const deadLinks = [];
        const seenSuffix = new Set();
        for (const m of html.matchAll(HTML_HREF_RE)) {
          const suffix = ownedHtmlLinkSuffix(m[1]);
          if (suffix === null) continue;
          const linkPathVal = ownedLinkPath(suffix);
          if (linkPathVal !== '' && linkPathVal !== '/') continue;
          const pairs = linkQueryPairs(suffix);
          if (pairs.has('pool')) continue;
          if (!LEVEL3_GRID_PARAMS.some((k) => pairs.has(k))) continue;
          if (seenSuffix.has(suffix)) continue;
          seenSuffix.add(suffix);
          const floor = effectiveMinTvl(pairs, minTvlInfo.value);
          // Display-rounding slack (T2): the rendered TVL figure is rounded
          // to ~3 significant digits ("$2.55B"), so a row genuinely at/just
          // under the floor can render slightly below it. A 0.5% DOWNWARD
          // tolerance on the floor only ever makes this check MORE
          // conservative (fewer flags) — it can never turn a truly-dead
          // link clean.
          const toleratedFloor = floor * 0.995;
          const qualifying = ownRows.filter((r) => r.tvlUsd >= toleratedFloor && r.tvlUsd > 0).length;
          if (qualifying === 0) deadLinks.push({ url: decodeHrefEntities(m[1]), floor });
        }
        if (deadLinks.length > 0) {
          const plural = deadLinks.length !== 1;
          const examples = deadLinks.slice(0, 3).map((d) => `"${d.url}" (floor $${d.floor.toLocaleString('en-US')})`);
          let detail = `${deadLinks.length} grid link${plural ? 's' : ''} on this page resolve${plural ? '' : 's'} to ZERO pools among the page's own ${ownRows.length} listed row${ownRows.length !== 1 ? 's' : ''} at ${plural ? 'their' : 'its'} effective floor — e.g. ${examples.join(', ')}`;
          if (deadLinks.length > examples.length) detail += ` (+${deadLinks.length - examples.length} more)`;
          suspects.push({ rel, slug, signal: 'link-target-integrity', severity: PRESCAN_SIGNALS['link-target-integrity'], detail });
        }
      }
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
// snapshotPath, outPath). Returns `{ surfaces, prescan, prescanFindings,
// prescanSuspects }` — `prescanSuspects` (added backlog 171) is the same
// anchor-excluded suspect list the aggregate `prescanFindings` above were
// counted from, exposed so runAudit() can reconcile each aggregate finding
// against what its own promoted suspects actually rendered.
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
    return { surfaces, prescan: emptyPrescanResult(), prescanFindings: [], prescanSuspects: [] };
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
  let prescanSuspects = []; // backlog 171 — see the return-shape comment above

  if (prescanEnabled && cap > 0) {
    const scan = prescanStaticPages();
    // Never promote the anchor's own leaf — it is already covered by the
    // unchanged `static-page` surface, promoting it too would be a no-op
    // duplicate name collision.
    const suspects = scan.suspects.filter((s) => s.rel !== anchorLeafRel);
    prescanSuspects = suspects;

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
  return { surfaces, prescan, prescanFindings, prescanSuspects };
}

// ---------------------------------------------------------------------------
// Pool-snapshot prescan + promotion (backlog 167). Mirrors prescanStaticPages
// / buildStaticSurfaces's shape (154/157), aimed at the ~740-pool snapshot
// instead of the SEO leaf-page set — closing the same class of blind spot
// (five pool-detail renders a day, all the same hand-picked flagship pool,
// `747c1d2a-…`/Lido stETH) that 154/157 already closed for static pages.
// ---------------------------------------------------------------------------
function isNonFiniteNumber(v) {
  return typeof v === 'number' && !Number.isFinite(v);
}

// Pure, no I/O beyond the `pools` array already read by runAudit() from the
// snapshot file. Never throws: a pool missing a field simply cannot trip a
// predicate that reads that field (undefined fails every numeric check),
// it is not an error. Returns `{ scanned, suspects, bySignal }` — `bySignal`
// is computed here (unlike prescanStaticPages/prescanTextSurfaces, which
// leave that to their caller) per spec 167 §1's own return shape; callers
// that need an anchor-excluded bySignal (buildPoolSurfaces, below) recompute
// their own from the filtered suspect list, exactly as buildStaticSurfaces
// already does for the static leg.
function prescanPools(pools, opts = {}) {
  const list = Array.isArray(pools) ? pools : [];
  const suspects = [];

  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const id = typeof p.pool === 'string' && p.pool ? p.pool : '(unknown-id)';
    const label = `${id.slice(0, POOL_ID_PREFIX_LEN)} (${p.project || '?'}/${p.symbol || '?'})`;

    // apy-rail-breach (P0) — mirrors the live rendered total-APY figure.
    const totalApy = (p.apyBase || 0) + (p.apyReward || 0);
    if (totalApy > APY_SANITY_LIMIT) {
      suspects.push({ poolId: id, signal: 'apy-rail-breach', severity: POOL_PRESCAN_SIGNALS['apy-rail-breach'],
        detail: `${label}: apyBase+apyReward = ${totalApy} exceeds the ${APY_SANITY_LIMIT}% rail` });
    }

    // mean30d-rail-breach (P0) — the live true positive this item exists for
    // (201e5f6e-…, apyMean30d = 30282.5457).
    if (typeof p.apyMean30d === 'number' && p.apyMean30d > APY_SANITY_LIMIT) {
      suspects.push({ poolId: id, signal: 'mean30d-rail-breach', severity: POOL_PRESCAN_SIGNALS['mean30d-rail-breach'],
        detail: `${label}: apyMean30d = ${p.apyMean30d} exceeds the ${APY_SANITY_LIMIT}% rail` });
    }

    // kpi-nonfinite (P0) — any numeric kpis.* value that is NaN/±Infinity.
    // A valid JSON snapshot can never encode NaN/Infinity (JSON.parse would
    // throw on the literal), so this only ever trips on in-memory fixtures —
    // a deliberate robustness net, exercised by test_audit_pool_prescan.js.
    if (p.kpis && typeof p.kpis === 'object') {
      for (const key of Object.keys(p.kpis)) {
        if (isNonFiniteNumber(p.kpis[key])) {
          suspects.push({ poolId: id, signal: 'kpi-nonfinite', severity: POOL_PRESCAN_SIGNALS['kpi-nonfinite'],
            detail: `${label}: kpis.${key} = ${p.kpis[key]}` });
          break; // one suspect per pool per signal is enough
        }
      }
    }

    // absurd-magnitude (P0) — any numeric field (top-level or kpis.*) with
    // |value| >= ABSURD_MAGNITUDE (the 122 bug class's own floor, reused
    // verbatim). Quotes the single largest-magnitude offender.
    let worstField = null, worstVal = -1, worstRaw = null;
    const consider = (fieldLabel, v) => {
      if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) >= ABSURD_MAGNITUDE && Math.abs(v) > worstVal) {
        worstVal = Math.abs(v); worstField = fieldLabel; worstRaw = v;
      }
    };
    consider('tvlUsd', p.tvlUsd);
    consider('apyBase', p.apyBase);
    consider('apyReward', p.apyReward);
    consider('apyMean30d', p.apyMean30d);
    if (p.kpis && typeof p.kpis === 'object') {
      for (const key of Object.keys(p.kpis)) consider(`kpis.${key}`, p.kpis[key]);
    }
    if (worstField) {
      suspects.push({ poolId: id, signal: 'absurd-magnitude', severity: POOL_PRESCAN_SIGNALS['absurd-magnitude'],
        detail: `${label}: ${worstField} = ${worstRaw} (|value| >= ${ABSURD_MAGNITUDE.toExponential(0)})` });
    }

    // missing-tvl (P1).
    if (!(typeof p.tvlUsd === 'number' && p.tvlUsd > 0)) {
      suspects.push({ poolId: id, signal: 'missing-tvl', severity: POOL_PRESCAN_SIGNALS['missing-tvl'],
        detail: `${label}: tvlUsd = ${JSON.stringify(p.tvlUsd)} (not > 0)` });
    }
  }

  // P0-first, then poolId — same comparator shape as prescanStaticPages().
  suspects.sort((a, b) => {
    const rank = (sev) => (sev === 'P0' ? 0 : 1);
    if (rank(a.severity) !== rank(b.severity)) return rank(a.severity) - rank(b.severity);
    return a.poolId < b.poolId ? -1 : a.poolId > b.poolId ? 1 : 0;
  });

  const bySignal = {};
  for (const sig of Object.keys(POOL_PRESCAN_SIGNALS)) bySignal[sig] = 0;
  for (const s of suspects) bySignal[s.signal] = (bySignal[s.signal] || 0) + 1;

  return { scanned: list.length, suspects, bySignal };
}

// No-suspects/disabled shape — same role as emptyPrescanResult()/
// emptyTextSurfaceResult(): callers never need to null-check result.poolPrescan.
function emptyPoolPrescanResult() {
  return { scanned: 0, suspectCount: 0, bySignal: {}, promoted: [] };
}

function poolIdPrefix(id) {
  const s = typeof id === 'string' ? id : String(id || '');
  return s.slice(0, POOL_ID_PREFIX_LEN) || 'unknown';
}

// ---------------------------------------------------------------------------
// backlog 183 leg (a) — disk-side protocol-URL provenance.
//
// getProtocolUrl() (app.js:2489, item 182) resolves in order: pool.url ->
// dynamicProtocolUrls (api.llama.fi/protocols, blocked in this harness) ->
// bakedProtocolUrls (our own committed data/protocol-urls.json, fetched from
// OUR origin) -> the static PROTOCOL_URLS literal (app.js:7) -> null. The
// baked artifact is generated from api.llama.fi ALONE (generate-protocol-
// urls.js never reads PROTOCOL_URLS — spec 183 T3), so it is not a superset
// of the static map: classification must consult BOTH disk-side tiers or it
// will emit a false `defect` for any project covered only by the
// hand-maintained static map. Both readers degrade to `null` on any failure
// (missing file, malformed JSON, unparsable literal) — never throw — so a
// broken artifact routes to `undeterminable`, not a false `defect`.
// ---------------------------------------------------------------------------
function readBakedProtocolUrls() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'data', 'protocol-urls.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.urls || typeof parsed.urls !== 'object') return null;
    return { keys: new Set(Object.keys(parsed.urls)) };
  } catch (e) {
    return null;
  }
}

// Extracts app.js's static `const PROTOCOL_URLS = { ... };` object literal
// (~96 double-quoted string pairs, ending at the first `};` at column 0 —
// spec 183 evidence) and evaluates JUST that substring — never the whole
// file — so this reads app.js without ever executing product code. Degrades
// to null on any failure (marker not found, unbalanced literal, eval
// throws): read-only, must never throw out of this function.
function readStaticProtocolUrls() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const marker = 'const PROTOCOL_URLS = {';
    const startIdx = src.indexOf(marker);
    if (startIdx === -1) return null;
    const openBraceIdx = startIdx + marker.length - 1; // index of the '{'
    const closeIdx = src.indexOf('\n};', openBraceIdx); // the object's own close (flat literal, no nesting)
    if (closeIdx === -1) return null;
    const objLiteral = src.slice(openBraceIdx, closeIdx + 2); // '{ ... }' inclusive
    const obj = new Function('return (' + objLiteral + ')')();
    if (!obj || typeof obj !== 'object') return null;
    return { keys: new Set(Object.keys(obj)) };
  } catch (e) {
    return null;
  }
}

// Both disk-side lookups use the same two key shapes: the slugified form
// getProtocolUrl() actually keys the baked artifact by, and the raw project
// string (the static map's real-world keys, e.g. "lido").
function projectHasUrl(tierKeys, project) {
  if (!tierKeys || !project) return false;
  const slug = String(project).toLowerCase().replace(/\s+/g, '-');
  return tierKeys.has(slug) || tierKeys.has(project);
}

// backlog 183 leg (a) — the classification decision rule. Branch ORDER is
// load-bearing: each of the four kinds is reachable through exactly one
// explicit check, `environment` (the only downgrade) LAST among the
// non-undeterminable branches so it can never be a silent fallthrough
// default (spec 183's non-vacuity contract — a classifier that can only ever
// emit `environment` has removed the gate, not fixed it).
//   1. disk-side undeterminable (either reader above returned null) OR the
//      run-side signal for the baked fetch is itself indeterminate
//      ('unknown' — a defensive state, not the common "never requested"
//      case, see bakedRunOutcome below) -> undeterminable, stays P1.
//   2. no disk-side tier resolves a URL anywhere -> defect, P1 (the real
//      `sdai` case, spec 183 T2).
//   3. a disk-side tier DOES resolve, but THIS run's fetch to our own
//      /data/protocol-urls.json failed, was blocked, or never arrived
//      ('failed' | 'absent') -> environment, P2, non-blocking.
//   4. URL on disk, this run's fetch confirmed ok, CTA still not the real
//      one -> defect, P1 (a genuine bug, not an environment artifact).
function classifyCtaKind(opts) {
  const diskDeterminable = !!(opts && opts.diskDeterminable);
  const diskTiers = (opts && opts.diskTiers) || [];
  const bakedRunOutcome = (opts && opts.bakedRunOutcome) || 'unknown';
  if (!diskDeterminable || bakedRunOutcome === 'unknown') return 'undeterminable';
  if (diskTiers.length === 0) return 'defect';
  if (bakedRunOutcome === 'failed' || bakedRunOutcome === 'absent') return 'environment';
  return 'defect';
}

// backlog 183 leg (a) — the two request/response listeners this feeds are
// registered by setupRoutes() BEFORE navigation (mirrors makeErrorSink); this
// just classifies a response/failed-request URL into the two hosts
// classification cares about. Returns null for anything else so callers can
// ignore it with a single truthiness check.
function classifyCtaProvenanceUrl(url) {
  if (/\/data\/protocol-urls\.json(\?|$)/.test(url)) return 'bakedProtocolUrls';
  if (/api\.llama\.fi\/protocols(\?|$)/.test(url)) return 'dynamicProtocols';
  return null;
}

// ---------------------------------------------------------------------------
// backlog 183 leg (b) — never-audited-first pool-detail rotation.
//
// Pure over `candidates` (already excludes the anchor + promoted-suspect ids
// — same set buildPoolSurfaces() sampled from before) + `state.seen` (full
// pool ids from the committed rotation file). No fs, no Date, no
// Math.random — directly unit-testable, and it's how buildPoolSurfaces()
// stays testable without ever touching the real state file (spec 183's
// test-safety requirement).
// ---------------------------------------------------------------------------
function computeRotation(candidates, sampleSize, seed, state) {
  const sortedCandidates = candidates.slice().sort();
  const seenSet = new Set(state && Array.isArray(state.seen) ? state.seen : []);
  const priorCycle = Number(state && state.cycle) || 0;
  const unseen = sortedCandidates.filter((id) => !seenSet.has(id));

  let wrapped = false;
  let pickPool = unseen;
  if (sortedCandidates.length > 0 && unseen.length === 0) {
    // Every candidate has already been seen this cycle: wrap. This pick
    // treats the whole candidate set as fresh; the state this run commits
    // resets `seen` to just what got audited THIS run (buildPoolSurfaces
    // below), so the next cycle's accumulation starts from scratch.
    wrapped = true;
    pickPool = sortedCandidates;
  }

  let picked = sampleBySeed(pickPool, Math.min(sampleSize, pickPool.length), seed);
  if (!wrapped && picked.length < sampleSize) {
    // Unseen ran out mid-pick (cycle nearly complete, but not every
    // candidate is seen yet): fill the remainder from already-seen
    // candidates, still deterministically, per spec 183 §2 ("fill from seen
    // only when unseen is exhausted").
    const pickedSet = new Set(picked);
    const seenCandidates = sortedCandidates.filter((id) => seenSet.has(id) && !pickedSet.has(id));
    const remaining = sampleSize - picked.length;
    picked = picked.concat(sampleBySeed(seenCandidates, remaining, `${seed}:fill`));
  }

  return { picked, wrapped, cycle: wrapped ? priorCycle + 1 : priorCycle };
}

// Reads the committed rotation state (spec 183 §1 shape), defaulting to a
// fresh cycle-0/empty-seen state on any read/parse failure (missing file on
// a first run, corrupt file, wrong shape) — never throws, mirrors every
// other prescan reader's degrade-to-empty convention.
function readRotationState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.seen)) {
      return { schemaVersion: 1, cycle: Number(parsed.cycle) || 0, seen: parsed.seen.filter((x) => typeof x === 'string') };
    }
  } catch (e) { /* fall through to fresh state */ }
  return { schemaVersion: 1, cycle: 0, seen: [] };
}

function emptyPoolRotationResult() {
  return { cycle: 0, seenCount: 0, candidateCount: 0, picked: [], wrapped: false };
}

// Builds the pool-detail promotion/rotation additions (spec 167 §2) and
// resolves the anchor pool id (replaces the old PREFERRED_POOL_ID-only
// block). Returns `{ anchorPoolId, extraSurfaces, poolPrescan,
// poolPrescanFindings }`. The FOUR existing named surfaces
// (pool-detail/-360/-dark/-ko) are NOT built here — they stay exactly where
// they are in runAudit()'s surface list, unchanged, just pointing at
// `anchorPoolId` instead of a hardcoded local — so no existing
// surfacesCovered entry moves position or renames (167's own hard
// constraint, mirrored from 162/164's precedent).
//
// Deliberate shape difference from buildStaticSurfaces(): the static leg
// shares ONE budget between promotion and rotation (promoted pages replace
// uniform picks) because static pages have no viewport-variant anchor to
// protect. Pool-detail's anchor is already a fixed 4-surface block; spec 167
// §2 describes promotion (`DEFAULT_POOL_PRESCAN_MAX`) and rotation
// (`DEFAULT_POOL_SAMPLE`) as two independently-sized budgets, and the spec's
// own "1 anchor + ≤2 promoted + ≤2 rotated = up to 7" measurement example
// only reconciles arithmetically (4 anchor + 1 promoted + 2 rotated = 7,
// matching this checkout's real 1-suspect snapshot) under an ADDITIVE
// reading, not a shared-budget one — see 167-notes.md for the full
// derivation. Growth is still small and bounded (A7): at the shipped
// defaults, additive growth is `DEFAULT_POOL_PRESCAN_MAX +
// DEFAULT_POOL_SAMPLE` = 4, comfortably under `MAX_POOL_SAMPLE` (6).
// Returns `{ anchorPoolId, extraSurfaces, poolPrescan, poolPrescanFindings,
// poolPrescanSuspects }` — `poolPrescanSuspects` (added backlog 171) is the
// same anchor-excluded suspect list the aggregate `poolPrescanFindings`
// above were counted from, exposed so runAudit() can reconcile each
// aggregate finding against what its own promoted suspects actually
// rendered (mirrors buildStaticSurfaces()'s `prescanSuspects`).
function buildPoolSurfaces(opts = {}) {
  const pools = Array.isArray(opts.pools) ? opts.pools : [];
  const overrideRaw = opts.poolIds || process.env.AUDIT_POOL_IDS;

  if (overrideRaw) {
    // Explicit override (tests / positive control): used verbatim — exact
    // mirror of spec 154's AUDIT_STATIC_PAGES contract. The first id becomes
    // the anchor pool (the four unchanged named surfaces point at it, built
    // by the caller); any further ids become extra `pool-detail:<prefix>`
    // surfaces. Prescan is OFF in this mode (spec 167 §3).
    const ids = overrideRaw.split(',').map((s) => s.trim()).filter(Boolean);
    const anchorPoolId = ids[0] || null;
    const extraSurfaces = ids.slice(1).map((id) => ({
      name: `pool-detail:${poolIdPrefix(id)}`, url: `/home.html?pool=${encodeURIComponent(id)}`, kind: 'pool', width: 1280
    }));
    // backlog 183 leg (b): override mode is used verbatim, exactly like
    // prescan — no rotation state is read or written in this mode.
    return {
      anchorPoolId, extraSurfaces, poolPrescan: emptyPoolPrescanResult(), poolPrescanFindings: [], poolPrescanSuspects: [],
      poolRotation: emptyPoolRotationResult(), rotationState: null, rotationStatePath: null
    };
  }

  // Anchor resolution — unchanged logic, unchanged fallback (spec 167 §2).
  let anchorPoolId = PREFERRED_POOL_ID;
  if (!pools.some((p) => p && p.pool === anchorPoolId)) {
    anchorPoolId = pools.length ? pools[0].pool : null;
    console.error(`[audit] preferred pool id absent from snapshot; using ${anchorPoolId}`);
  }

  const prescanEnabled = opts.poolPrescan === true ? true
    : opts.poolPrescan === false ? false
    : process.env.AUDIT_POOL_PRESCAN === '0' ? false
    : true;
  const prescanMax = Math.max(0, Number(opts.poolPrescanMax || process.env.AUDIT_POOL_PRESCAN_MAX || DEFAULT_POOL_PRESCAN_MAX));
  const sampleSize = Math.min(MAX_POOL_SAMPLE,
    Math.max(0, Number(opts.poolSample || process.env.AUDIT_POOL_SAMPLE || DEFAULT_POOL_SAMPLE)));
  // Reuses the SAME seed the static leg uses (spec 167 §3: "reuse the
  // existing seed"), namespaced so the two rotations never pick in lockstep.
  const seed = opts.poolSeed || opts.staticSeed || process.env.AUDIT_STATIC_SEED || defaultStaticSeed();

  let poolPrescan = emptyPoolPrescanResult();
  const poolPrescanFindings = [];
  let promotedIds = [];
  let poolPrescanSuspects = []; // backlog 171 — see the return-shape comment above

  if (prescanEnabled && prescanMax > 0 && pools.length) {
    const scan = prescanPools(pools);
    // Never promote the anchor pool — it is already covered by the
    // unchanged four pool-detail* surfaces (mirrors static's anchorLeafRel
    // exclusion).
    const suspects = scan.suspects.filter((s) => s.poolId !== anchorPoolId);
    poolPrescanSuspects = suspects;

    const bySignal = {};
    for (const sig of Object.keys(POOL_PRESCAN_SIGNALS)) bySignal[sig] = 0;
    for (const s of suspects) bySignal[s.signal] = (bySignal[s.signal] || 0) + 1;

    // One aggregate finding per signal with >=1 suspect (mirrors
    // static-prescan:<signal> verbatim in shape and wording).
    for (const sig of Object.keys(POOL_PRESCAN_SIGNALS)) {
      const hits = suspects.filter((s) => s.signal === sig);
      if (hits.length === 0) continue;
      const examples = hits.slice(0, 10).map((s) => poolIdPrefix(s.poolId));
      poolPrescanFindings.push(finding('pool-prescan', 'n/a', `pool-prescan:${sig}`, POOL_PRESCAN_SIGNALS[sig],
        `${hits.length} of ${scan.scanned} snapshot pools match ${sig} — examples: ${examples.join(', ')}`));
    }

    // Dedupe to unique pool ids, preserving the P0-first/poolId-sorted order
    // prescanPools() already returned (mirrors prescanStaticPages's
    // suspectRels dedupe in buildStaticSurfaces).
    const seenId = new Set();
    const uniqueIds = [];
    const severityById = {};
    for (const s of suspects) {
      if (!seenId.has(s.poolId)) { seenId.add(s.poolId); uniqueIds.push(s.poolId); severityById[s.poolId] = s.severity; }
    }
    const p0Ids = uniqueIds.filter((id) => severityById[id] === 'P0');
    const p1Ids = uniqueIds.filter((id) => severityById[id] !== 'P0');

    // "P0-first, tie broken by sampleBySeed" (spec 167 §2), taken literally:
    // severity decides ordering deterministically; sampleBySeed only
    // arbitrates WITHIN a severity group when that group alone exceeds the
    // cap. (157 never needed this two-tier split — its two prescan signals
    // in active use, junk-slug/zero-yield-claim, are both P1.)
    if (p0Ids.length <= prescanMax) {
      promotedIds = p0Ids.slice();
      const remaining = prescanMax - promotedIds.length;
      if (remaining > 0 && p1Ids.length) promotedIds = promotedIds.concat(sampleBySeed(p1Ids, remaining, `${seed}:poolprescan`));
    } else {
      promotedIds = sampleBySeed(p0Ids, prescanMax, `${seed}:poolprescan`);
    }

    // `promoted` holds FULL pool ids (spec 167 A1: "poolPrescan.promoted
    // contains 201e5f6e-cf75-4d0e-b07f-d58da3cee23a" — the whole id, not the
    // 8-char prefix used only for surface NAMING). The prescan aggregate
    // finding's `examples` list above intentionally stays on the shorter
    // prefix (readability, mirrors static-prescan's slug examples); this
    // field is the machine-checkable one and must be exact.
    poolPrescan = { scanned: scan.scanned, suspectCount: suspects.length, bySignal, promoted: promotedIds.slice() };
  }

  const extraSurfaces = promotedIds.map((id) => ({
    name: `pool-detail:${poolIdPrefix(id)}`, url: `/home.html?pool=${encodeURIComponent(id)}`, kind: 'pool', width: 1280
  }));

  // ---- Never-audited-first rotation (backlog 183 leg b) — additive to
  // promotion, see header note above. Replaces the old bare
  // sampleBySeed(rotationCandidates, ...) call: same candidate set (anchor +
  // promoted excluded, exactly as before — T4's "promotion path, the anchor
  // block, and the existing surface names stay untouched"), but now prefers
  // ids never seen in the committed state file, only falling back to
  // already-seen ids once the unseen pool is exhausted.
  const promotedSet = new Set(promotedIds);
  const rotationCandidates = pools
    .filter((p) => p && p.pool !== anchorPoolId && !promotedSet.has(p.pool))
    .map((p) => p.pool)
    .sort();

  const rotationStatePath = opts.rotationStatePath || process.env.AUDIT_ROTATION_STATE || DEFAULT_ROTATION_STATE_PATH;
  // opts.rotationState lets tests drive buildPoolSurfaces() as a pure
  // function with no fs read at all; the CLI/real run falls back to reading
  // the committed file.
  const priorRotationState = opts.rotationState || readRotationState(rotationStatePath);
  const rot = computeRotation(rotationCandidates, sampleSize, `${seed}:pools`, priorRotationState);
  const rotationPicks = rot.picked;
  for (const id of rotationPicks) {
    extraSurfaces.push({ name: `pool-detail:${poolIdPrefix(id)}`, url: `/home.html?pool=${encodeURIComponent(id)}`, kind: 'pool', width: 1280 });
  }

  // Every pool id that got a pool-detail surface THIS run — anchor,
  // prescan-promoted, AND rotation-picked — is recorded into `seen` (spec
  // 183 §2), regardless of which of the three reasons put it on the page.
  const thisRunPoolIds = [anchorPoolId, ...promotedIds, ...rotationPicks].filter(Boolean);
  const baseSeen = rot.wrapped ? [] : priorRotationState.seen.slice();
  let newSeen = baseSeen.concat(thisRunPoolIds.filter((id) => !baseSeen.includes(id)));
  if (newSeen.length > ROTATION_SEEN_CAP) newSeen = newSeen.slice(newSeen.length - ROTATION_SEEN_CAP); // drop-oldest
  const rotationState = { schemaVersion: 1, cycle: rot.cycle, seen: newSeen };

  const poolRotation = {
    cycle: rot.cycle,
    seenCount: newSeen.length,
    candidateCount: rotationCandidates.length,
    picked: rotationPicks.slice(),
    wrapped: rot.wrapped
  };

  return { anchorPoolId, extraSurfaces, poolPrescan, poolPrescanFindings, poolPrescanSuspects, poolRotation, rotationState, rotationStatePath };
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
async function setupRoutes(page, { snapshotBody, freshMeta, liveBody, forceLive, liveDelayMs, ctaProvenance }) {
  // backlog 183 leg (a) — run-side provenance for the pool-detail protocol
  // CTA. Registered here, before any route/navigation, alongside the other
  // page-wide listeners this function already owns (mirrors makeErrorSink's
  // page.on('pageerror'/'console') placement) so neither request timing nor
  // navigation order can race past it. `ctaProvenance` is a plain object the
  // caller owns and mutates by reference — no return value needed.
  if (ctaProvenance) {
    page.on('response', (res) => {
      const key = classifyCtaProvenanceUrl(res.url());
      if (key) ctaProvenance[key] = res.ok() ? 'ok' : 'failed';
    });
    page.on('requestfailed', (req) => {
      const key = classifyCtaProvenanceUrl(req.url());
      if (key) ctaProvenance[key] = 'failed';
    });
  }

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

  // backlog 183 leg (a) — starts 'absent' (no response/requestfailed event
  // observed yet); setupRoutes()'s listeners below mutate this in place as
  // the page loads. Only the pool-detail driver reads it, but it costs
  // nothing to track on every surface.
  //
  // Why 'absent' at classification time is safe to trust as "never arrived"
  // (operator review, round 2 — the environment branch's only legitimate
  // entry): app.js fires the `/data/protocol-urls.json` fetch unconditionally
  // at PoolDetail mount with NO delay (app.js ~1276, "must win the race
  // against the multi-MB live /pools fetch"), and setupRoutes() registers NO
  // `page.route` for that URL — it is never intercepted, so it always falls
  // through to the audit's own local static server (startServer() above),
  // which answers every request synchronously via fs.readFile. There is no
  // real network hop, no real host that can silently swallow the request, so
  // a real run always eventually produces a 'response' (ok or non-2xx) event
  // for it. The one real risk is a MEASUREMENT race, not a network one:
  // `waitForSelector('.pool-detail-view', ...)` can resolve on the page's
  // very first paint, before the mount effect above has even called
  // `fetch()` — reading `ctaProvenance` at that instant would see 'absent'
  // even though the fetch is about to succeed, misreporting a timing
  // artifact as "blocked". The classification site below closes exactly
  // this gap with a short settle-wait (this file's own trap #2 pattern —
  // poll before asserting) so 'absent' AT THE POINT OF CLASSIFICATION really
  // does mean "never arrived within a generous window", matching what the
  // environment branch's wording describes — not "we sampled too early".
  const ctaProvenance = { bakedProtocolUrls: 'absent', dynamicProtocols: 'absent' };

  try {
    await setupRoutes(page, { ...ctx, forceLive: s.forceLive, liveDelayMs: s.liveDelayMs, ctaProvenance });
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

    if (s.kind === 'landing') {
      // backlog 162 — search-first landing (bare `/`, mounts into
      // #landing-root). Readiness + primary CTA selectors read straight off
      // landing.js (data-testid="landing-search" / .landing-search-submit) —
      // the same selectors test_smoke.js/test_landing.js already assert on.
      const ok = await waitForSelector(page, '[data-testid="landing-search"]', 10000);
      if (!ok) {
        findings.push(finding(s.name, s.vpLabel, 'dead-end', 'P1',
          'landing did not render #landing-root content ([data-testid="landing-search"]) within 10s'));
      }
      await auditText(page, s, findings);

      const searchCta = page.locator('.landing-search-submit').first();
      if ((await searchCta.count()) === 0 || !(await searchCta.isVisible())) {
        findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1',
          'landing search submit (.landing-search-submit) missing or not visible'));
      }

      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    if (s.kind === 'planner') {
      // backlog 162 — Garden Planner (`/plan.html`, mounts into
      // #planner-root as .gp-app). The planner is conversational: the FIRST
      // screen is the goal picker (planner.js step === 'goal'), so the
      // primary next-step control is a goal chip (.gp-chip, from the shared
      // Chips component) — this drives no multi-step flow, per the spec's
      // territory note.
      const ok = await waitForSelector(page, '#planner-root .gp-app', 10000);
      if (!ok) {
        findings.push(finding(s.name, s.vpLabel, 'dead-end', 'P1',
          'planner did not render #planner-root .gp-app within 10s'));
        if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
        await page.close();
        return findings;
      }
      const text = await auditText(page, s, findings);

      const goalChip = page.locator('.gp-chip').first();
      const goalChipVisible = (await goalChip.count()) > 0 && (await goalChip.isVisible());
      if (!goalChipVisible) {
        findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1',
          'planner goal chip (.gp-chip) missing or not visible on the first screen'));
      } else if (s.width > 360 && !s.ko) {
        // backlog 164 — one interactive check, scoped to the 1280/EN surface
        // only (not planner-360/planner-ko — one flake surface, not three).
        // Visibility alone (above) cannot see a chip that renders but does
        // not advance the flow — click it and assert the planner actually
        // leaves the goal step. `.gp-thread-row` (planner.js's ThreadRow) is
        // pushed into the thread only once `step !== 'goal' && answers.goal`
        // — a truthful rendered signal that exists only past the goal step,
        // not internal React state.
        await goalChip.click();
        const advanced = await pollFor(page, async () => (await page.locator('.gp-thread-row').count()) > 0, 8000);
        if (!advanced) {
          findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1',
            'clicking the first goal chip (.gp-chip) did not advance the planner past the goal step (.gp-thread-row) within 8s'));
        }
      }

      // i18n — reuses the exact "KO surface rendered no Hangul text" check
      // the 'pool' driver already runs (below), scoped to the -ko surface only.
      if (s.ko) {
        const hasHangul = /[가-힣]/.test(text);
        if (!hasHangul) findings.push(finding(s.name, s.vpLabel, 'i18n', 'P2', 'KO surface rendered no Hangul text'));
      }

      // responsive — 360 surface only, against the same first-screen chip.
      if (s.width <= 360) await checkResponsive(page, s, findings, '.gp-chip');

      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    if (s.kind === 'bloom') {
      // backlog 164 — deep-linked plan bloom/checkout screen. This is the
      // first time the audit renders a NUMBER the planner actually computed
      // (capital, forever number, projections, checkout price) rather than
      // just the goal picker's static chip labels (162's 'planner' kind
      // above). Reached via a share-plan URL shape (?goal=&pace=&monthly=&
      // years=), the exact one planner.js's "Shared plan fast-forward to
      // bloom" effect and test_plan_checkout_cta.js's gotoPlan() already
      // prove lands on `.gp-checkout-panel` — no multi-step drive needed.
      const ok = await waitForSelector(page, '.gp-checkout-panel', 15000);
      if (!ok) {
        findings.push(finding(s.name, s.vpLabel, 'dead-end', 'P1',
          'bloom did not render .gp-checkout-panel within 15s'));
        if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
        await page.close();
        return findings;
      }
      const text = await auditText(page, s, findings);

      // Bloom's primary control — either the pool-first "Start growing on
      // <project> →" <a> or the waitlist <button> fallback (both share this
      // class; test_plan_checkout_cta.js:3006/3013 in planner.js). Either
      // shape is fine here — this is a presence/visibility check, not a
      // shape assertion (that belongs to test_plan_checkout_cta.js).
      const cta = page.locator('.gp-checkout-cta').first();
      if ((await cta.count()) === 0 || !(await cta.isVisible())) {
        findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1',
          'bloom primary control (.gp-checkout-cta) missing or not visible'));
      }

      // i18n — reuses the exact "KO surface rendered no Hangul text" check
      // the 'pool'/'planner' drivers already run, scoped to the -ko surface only.
      if (s.ko) {
        const hasHangul = /[가-힣]/.test(text);
        if (!hasHangul) findings.push(finding(s.name, s.vpLabel, 'i18n', 'P2', 'KO surface rendered no Hangul text'));
      }

      // responsive — 360 surface only, against the same primary control.
      if (s.width <= 360) await checkResponsive(page, s, findings, '.gp-checkout-cta');

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
    // backlog 183 leg (a) — item 182 made `.cta-button-protocol` ALWAYS
    // render (the real "Start Earning" CTA when any tier resolves, else an
    // honest DefiLlama fallback under the SAME class), which made the plain
    // presence/visibility check above permanently blind in one direction
    // (spec 183 T1): a pool with no protocol URL now renders the fallback
    // and audits clean. Read the CTA's SHAPE, not just its presence.
    const protocol = page.locator('.cta-button-protocol').first();
    const protocolExists = (await protocol.count()) > 0;
    const protocolVisible = protocolExists && (await protocol.isVisible());
    let ctaShape = 'missing';
    if (protocolVisible) {
      // The real CTA and the fallback share DOM shape; only the adjacent
      // hint paragraph's copy differs (translations.js opensProtocol vs
      // opensDefillamaFallback) — checked in BOTH languages since
      // pool-detail-ko is an audited surface.
      const hintText = (await page.locator('.pool-action-hint--muted').first().textContent().catch(() => '')) || '';
      ctaShape = FALLBACK_HINT_MARKERS.some((marker) => hintText.includes(marker)) ? 'fallback' : 'protocol';
    }

    if (ctaShape !== 'protocol') {
      // Provenance is only computed when the CTA is NOT the real one — a
      // clean real-CTA render needs no explanation.

      // backlog 183 — settle-wait closing the initial-paint race documented
      // at ctaProvenance's declaration above: only pay this when the value
      // is STILL 'absent' by the time we get here (rare — several CDP
      // round-trips for auditText()/the primary-CTA checks/the shape read
      // already elapsed first), and it resolves near-instantly in the
      // common case since the fetch target is our own local server, not a
      // real network hop. 2s is generous, not a real-world budget: it only
      // ever gets spent on the rare pool that both races AND ends up
      // degraded.
      if (ctaProvenance && ctaProvenance.bakedProtocolUrls === 'absent') {
        await pollFor(page, async () => ctaProvenance.bakedProtocolUrls !== 'absent', 2000);
      }

      const poolIdMatch = s.url.match(/[?&]pool=([^&]+)/);
      const currentPoolId = poolIdMatch ? decodeURIComponent(poolIdMatch[1]) : null;
      const currentPool = currentPoolId && ctx.poolsById ? ctx.poolsById.get(currentPoolId) : null;
      const project = currentPool ? currentPool.project : null;

      const baked = readBakedProtocolUrls();
      const staticMap = readStaticProtocolUrls();
      const diskDeterminable = !!(baked && staticMap);
      const diskTiers = [];
      if (diskDeterminable) {
        if (projectHasUrl(baked.keys, project)) diskTiers.push('baked');
        if (projectHasUrl(staticMap.keys, project)) diskTiers.push('static');
      }
      const bakedRunOutcome = ctaProvenance ? ctaProvenance.bakedProtocolUrls : 'unknown';
      const kind = classifyCtaKind({ diskDeterminable, diskTiers, bakedRunOutcome });
      const severity = CTA_KIND_SEVERITY[kind];

      let detail = `provenance: project="${project || 'unknown'}", disk tiers=[${diskTiers.join(', ') || 'none'}]` +
        (diskDeterminable ? '' : ' (disk-side undeterminable — artifact/static-map unreadable)') +
        `, this run's /data/protocol-urls.json fetch=${bakedRunOutcome}, kind=${kind}`;

      if (ctaShape === 'missing') {
        findings.push(finding(s.name, s.vpLabel, 'dead-cta', severity,
          `"Start Earning"/DefiLlama-fallback (.cta-button-protocol) missing or not visible — ${detail}`));
      } else {
        // ctaShape === 'fallback': the element IS present/visible (182's
        // honest DefiLlama fallback), but that means the real north-star CTA
        // (protocol_link) did not fire for this pool — a separate check from
        // `dead-cta` (which 182 made permanently blind to this, spec 183 T1),
        // carrying the same provenance + kind.
        if (kind === 'environment') {
          // Mirrors reconcilePrescanFindings()'s reconciliation wording
          // (audit-app.js ~2219: "— reconciled: ...; downgraded to
          // non-blocking.") so both downgrade mechanisms read the same way.
          detail += ` — reconciled: a disk-side tier resolves this project, but this run's fetch to /data/protocol-urls.json did not confirm it (${bakedRunOutcome}); downgraded to non-blocking.`;
        }
        findings.push(finding(s.name, s.vpLabel, 'degraded-cta', severity,
          `DefiLlama fallback rendered instead of the protocol CTA (.cta-button-protocol) — ${detail}`));
      }
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
// backlog 171 — prescan/rendered reconciliation. An aggregate
// `<prefix>:<signal>` finding (built pre-render, before the browser ever
// opens — see buildStaticSurfaces()/buildPoolSurfaces() above) is downgraded
// to non-blocking P2 IFF every suspect carrying that signal was promoted to
// a rendered surface AND every one of those promoted surfaces produced ZERO
// rendered findings. Any suspect left unpromoted (promotion cap, promotion
// disabled, or a promoted surface never actually rendered because opts.only
// filtered it out of this run) leaves severity UNCHANGED — unverified is not
// clean, the load-bearing rule (spec 171). Any promoted surface with >=1
// rendered finding of its own also leaves severity unchanged.
//
// Mutates the finding objects in `aggregateFindings` in place — they are the
// SAME references already living in the caller's combined `findings` array
// (built via array spread, which copies the array but not the objects), so
// callers never need to splice a reconciled result back in.
//
// Shared verbatim by the pool leg and the static leg (spec 171: "one shared
// helper... they must not drift") via two small adapters rather than
// assuming one suspect shape: `suspectKey(suspect)` extracts the
// promotion-comparable key (a static-page slug / a full pool id — whichever
// shape `promotedKeys` is a Set of), `keyToSurface(key)` maps that key to
// the EXACT rendered surface name a promoted suspect would appear under
// (`static-page:<slug>` / `pool-detail:<8-char-prefix>`). Because that
// mapper only ever produces those two exact forms, the anchor pool's own
// multi-viewport siblings (`pool-detail-360`/`-dark`/`-ko`) can never be
// misattributed to a promoted suspect — they are a different surface name by
// construction, not by a filter here.
//
// Text-surface prescan is never passed through here: `textSurfaces`'s result
// carries no `promoted` array at all (no promotion mechanism to verify
// against), so nothing there can ever be downgraded — enforced by omission
// (runAudit() below never calls this against textSurfaceFindings), not by a
// branch inside this function.
// ---------------------------------------------------------------------------
function reconcilePrescanFindings(aggregateFindings, opts) {
  const { prefix, suspects, suspectKey, promotedKeys, keyToSurface, coveredSurfaces, findingsBySurface } = opts;
  const marker = `${prefix}:`;
  for (const f of aggregateFindings) {
    if (!f || f.surface !== prefix || typeof f.check !== 'string' || !f.check.startsWith(marker)) continue;
    const signal = f.check.slice(marker.length);
    const signalSuspects = suspects.filter((s) => s.signal === signal);
    if (signalSuspects.length === 0) continue; // defensive — a finding implies >=1 suspect

    const allPromoted = signalSuspects.every((s) => promotedKeys.has(suspectKey(s)));
    if (!allPromoted) continue; // at least one suspect never verified — severity unchanged

    let allClean = true;
    const clearedSurfaces = [];
    for (const s of signalSuspects) {
      const surfaceName = keyToSurface(suspectKey(s));
      // Not covered in THIS run (e.g. opts.only scoped the render away from
      // it) is treated the same as "not clean" — unverified, not downgraded.
      const wasRendered = coveredSurfaces.has(surfaceName);
      const findingCount = findingsBySurface.get(surfaceName) || 0;
      if (!wasRendered || findingCount > 0) { allClean = false; break; }
      clearedSurfaces.push(surfaceName);
    }
    if (!allClean) continue;

    f.severity = 'P2';
    f.detail += ` — reconciled: all ${signalSuspects.length} promoted suspect(s) rendered with zero findings on ${clearedSurfaces.join(', ')}; downgraded to non-blocking.`;
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

  // backlog 167: anchor-pool resolution + prescan/rotation additions now live
  // in buildPoolSurfaces() (mirrors buildStaticSurfaces() below). Anchor
  // fallback logic is unchanged — `poolId` still resolves to PREFERRED_POOL_ID
  // or pools[0], verbatim.
  const poolResult = buildPoolSurfaces({
    pools, poolIds: opts.poolIds, poolPrescan: opts.poolPrescan,
    poolPrescanMax: opts.poolPrescanMax, poolSample: opts.poolSample,
    poolSeed: opts.poolSeed, staticSeed: opts.staticSeed,
    // backlog 183 leg (b) — forwarded so a test can drive rotation against a
    // temp path/in-memory state without ever touching the committed file.
    rotationStatePath: opts.rotationStatePath, rotationState: opts.rotationState
  });
  const poolId = poolResult.anchorPoolId;

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
    { name: 'pool-detail-ko', url: `${poolUrl}&lang=ko`, kind: 'pool', width: 1280, ko: true },
    // backlog 162 — the planner/landing default face. Appended after the
    // existing nine so no existing surfacesCovered entry moves or renames.
    { name: 'landing', url: '/', kind: 'landing', width: 1280 },
    { name: 'planner', url: '/plan.html', kind: 'planner', width: 1280 },
    { name: 'planner-360', url: '/plan.html', kind: 'planner', width: 360 },
    { name: 'planner-ko', url: '/plan.html?lang=ko', kind: 'planner', width: 1280, ko: true },
    // backlog 164 — deep-linked plan bloom/checkout screens (the archetype
    // triple from CLAUDE.md, reused verbatim from test_plan_checkout_cta.js).
    // Appended after planner-ko so no existing surfacesCovered entry moves
    // or renames.
    { name: 'plan-bloom-growth', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10', kind: 'bloom', width: 1280 },
    { name: 'plan-bloom-target', url: '/plan.html?goal=iphone&pace=stable&monthly=200', kind: 'bloom', width: 1280 },
    { name: 'plan-bloom-subscription', url: '/plan.html?goal=claude&pace=stable&monthly=50', kind: 'bloom', width: 1280 },
    { name: 'plan-bloom-360', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10', kind: 'bloom', width: 360 },
    { name: 'plan-bloom-ko', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10&lang=ko', kind: 'bloom', width: 1280, ko: true }
  ];

  // backlog 167 — promoted/rotated pool-detail surfaces, spliced in right
  // after pool-detail-ko so no EXISTING surfacesCovered entry moves position
  // (grid-loading/grid-360/landing/… all keep their exact relative order).
  const poolKoIdx = surfaces.findIndex((s) => s.name === 'pool-detail-ko');
  surfaces.splice(poolKoIdx + 1, 0, ...poolResult.extraSurfaces);

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

  // Aggregate pool-prescan findings (backlog 167) — same shape/rationale as
  // the static-prescan allowlisting immediately above, matched against
  // `f.surface` ('pool-prescan').
  let poolPrescanFindings = poolResult.poolPrescanFindings;
  if (Array.isArray(opts.only)) poolPrescanFindings = poolPrescanFindings.filter((f) => opts.only.includes(f.surface));

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
  // backlog 183 leg (a) — id -> pool lookup so the pool-detail driver can
  // read the rendered surface's `project` without any DOM guesswork (the
  // fallback-shape CTA carries no project name in its own text).
  const poolsById = new Map(pools.map((p) => [p.pool, p]));
  const ctx = { snapshotBody, freshMeta, liveBody, poolsById };
  const findings = [...prescanFindings, ...poolPrescanFindings, ...textSurfaceFindings];
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

  // backlog 171 — reconcile each aggregate prescan finding against what its
  // own promoted suspects actually rendered. Runs AFTER the opts.only
  // allowlist filtering above (prescanFindings/poolPrescanFindings are
  // already filtered by then) and AFTER the render loop (needs
  // surfacesCovered + the real per-surface findings to check against).
  // Text-surface findings are deliberately excluded — no promotion
  // mechanism exists for them (spec 171), so they are never passed through.
  const surfacesCoveredSet = new Set(surfacesCovered);
  const findingsBySurface = new Map();
  for (const f of findings) {
    if (f && f.surface) findingsBySurface.set(f.surface, (findingsBySurface.get(f.surface) || 0) + 1);
  }
  reconcilePrescanFindings(prescanFindings, {
    prefix: 'static-prescan',
    suspects: staticResult.prescanSuspects,
    suspectKey: (s) => slugFromRel(s.rel),
    promotedKeys: new Set(staticResult.prescan.promoted), // already slugs (buildStaticSurfaces)
    keyToSurface: (slug) => `static-page:${slug}`,
    coveredSurfaces: surfacesCoveredSet,
    findingsBySurface
  });
  reconcilePrescanFindings(poolPrescanFindings, {
    prefix: 'pool-prescan',
    suspects: poolResult.poolPrescanSuspects,
    suspectKey: (s) => s.poolId,
    promotedKeys: new Set(poolResult.poolPrescan.promoted), // already full pool ids (buildPoolSurfaces)
    keyToSurface: (id) => `pool-detail:${poolIdPrefix(id)}`,
    coveredSurfaces: surfacesCoveredSet,
    findingsBySurface
  });

  // backlog 183 leg (b) — persist the rotation state ONLY when the caller
  // opted in (opts.persistRotationState, set true by the CLI entry point
  // ONLY — see require.main===module below). Every library call to
  // runAudit() (every existing test_audit_*.js call site, plus any future
  // one) leaves this false by default, so it can never write the committed
  // file. Write only if the serialized bytes actually differ from what's on
  // disk — two consecutive no-change runs produce zero diff.
  if (opts.persistRotationState && poolResult.rotationState && poolResult.rotationStatePath) {
    const serializedRotation = JSON.stringify(poolResult.rotationState, null, 2) + '\n';
    let existingRotation = null;
    try { existingRotation = fs.readFileSync(poolResult.rotationStatePath, 'utf8'); } catch (e) { /* first run */ }
    if (existingRotation !== serializedRotation) {
      fs.mkdirSync(path.dirname(poolResult.rotationStatePath), { recursive: true });
      fs.writeFileSync(poolResult.rotationStatePath, serializedRotation);
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    status: 'OK',
    playwright: { source: pw.source, version: pw.version },
    surfacesCovered,
    findings,
    prescan: staticResult.prescan,
    poolPrescan: poolResult.poolPrescan,
    poolRotation: poolResult.poolRotation,
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

module.exports = {
  runAudit, scanNumbers, resolvePlaywright, blockingFindings,
  prescanStaticPages, prescanTextSurfaces, prescanPools, buildPoolSurfaces,
  buildStaticSurfaces, reconcilePrescanFindings,
  // backlog 183 — exported so test_audit_cta_provenance.js can drive the
  // classifier and the rotation picker directly as pure functions, exactly
  // how reconcilePrescanFindings() is already exported for 171's tests.
  classifyCtaKind, computeRotation, readBakedProtocolUrls, readStaticProtocolUrls,
  projectHasUrl, readRotationState,
  // backlog 183 — exported so test_audit_cta_provenance.js can assert the
  // cap-must-exceed-real-population invariant directly against
  // data/pools-snapshot.json (see ROTATION_SEEN_CAP's own comment).
  ROTATION_SEEN_CAP
};

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

  // backlog 162 — CLI wiring for the existing opts.only / opts.staticOnly
  // knobs (already used by every test file via a direct runAudit() call, but
  // never exposed on the command line): `--only=a,b,c` and `--static-only`.
  // backlog 183 leg (b): rotation-state persistence is opt-in and ONLY ever
  // enabled here — the real CLI entry point — never by a library
  // runAudit() call (test safety, see runAudit()'s own comment at the write
  // site).
  const cliOpts = { persistRotationState: true };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--static-only') cliOpts.staticOnly = true;
    else if (arg.startsWith('--only=')) {
      cliOpts.only = arg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  runAudit(cliOpts)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      console.log('\n[audit] surfaces covered: ' + result.surfacesCovered.join(', '));
      const blocking = blockingFindings(result.findings);
      console.log(`[audit] findings: ${result.findings.length} total, ${blocking.length} blocking (P0/P1)`);
      // backlog 183 leg (b) — coverage from a reader's own eyes, not luck:
      // cycle/seenCount/candidateCount let a reader tell real rotation
      // progress from incidental selection without a code read.
      const rot = result.poolRotation || {};
      console.log(`[audit] pool rotation: cycle ${rot.cycle}, seen ${rot.seenCount}/${rot.candidateCount} candidates, picked [${(rot.picked || []).join(', ')}], wrapped=${!!rot.wrapped}`);
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
