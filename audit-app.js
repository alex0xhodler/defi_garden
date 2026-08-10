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
     AUDIT_STATIC_SAMPLE   — how many extra static SEO leaf pages to sample
                             beyond the anchor, combined across ALL FOUR of
                             tokens/*.html + chains/*.html + ko/tokens/*.html
                             + ko/chains/*.html (default 12, capped at 24;
                             backlog 154, budget raised + KO added backlog
                             197 — split EN half / KO half internally, each
                             half keeping the pre-197 2:1 token:chain ratio).
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
     AUDIT_I18N             — set to '0' to disable the translations.js
                             en/ko value-honesty + key-parity prescan (item
                             190); same effect as opts.i18n === false.
                             Default ON, off under opts.staticOnly (pure fs,
                             same convention as AUDIT_TEXT_SURFACES).
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
                             pools (default 32, capped at 64 — backlog 167,
                             raised 2->6 by backlog 191, then 6->32/ceiling
                             6->64 by backlog 192 after measuring wall-clock;
                             see DEFAULT_POOL_SAMPLE's own comment for the
                             timings). Backlog 192 deliberately set the
                             ceiling ABOVE the default this time (191's
                             default==ceiling meant this env var could only
                             ever LOWER the sample size) so it can now raise
                             the sample size too, up to 64.
     AUDIT_TIME_BUDGET_MS  — wall-clock budget (ms) for the pool-detail
                             ROTATION leg only (backlog 192). Once elapsed run
                             time exceeds this, every remaining
                             rotation-picked pool-detail surface is SKIPPED —
                             never the anchor, never a prescan-promoted
                             surface, never any other named surface (see
                             buildPoolSurfaces()'s `rotationPick` marker and
                             runAudit()'s render loop). Default
                             DEFAULT_TIME_BUDGET_MS, itself FOREGROUND_CAP_MS
                             (the standing 300s/5-minute foreground timebox,
                             2026-07-11) — see both constants' own comments.
                             Skips are reported, never silent:
                             poolRotation.renderedCount/`.truncated` in
                             signals/audit-findings.json and the CLI console
                             summary; the persisted `seen` in
                             signals/audit-rotation.json excludes any id that
                             did not actually render, so a skipped pool is
                             re-picked next run (never falsely credited as
                             covered).

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
// backlog 184 — level-2 `?pool=` deep-link liveness signal. 181's
// DRIFT_BUDGET_FRACTION/STALE_AFTER_DAYS constants and its
// parseLastUpdatedDate()/verdictFor()/loadPools() classifier are imported
// verbatim from item 181's own file, never re-typed here (174's one-constant
// rule — `grep -n "DRIFT_BUDGET" audit-app.js` must show only this require
// and its uses, never a second numeric literal).
const cta181 = require('./test_seo_cta_targets.js');

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
// Sampled static SEO surface (backlog 154; extended to the `ko/` estate by
// backlog 197). Enumerates `tokens/*.html` + `chains/*.html` leaf pages
// (excluding hub pages: tokens/index.html, chains/index.html — and
// tokens/az/* is already excluded for free, since
// `fs.readdirSync('tokens', {withFileTypes:true})` lists `az` as a directory
// entry, not a `.html` file, so the `.endsWith('.html')` filter drops it) —
// and, as of 197, the identical-shape `ko/tokens/*.html` + `ko/chains/*.html`
// pair (`ko/tokens/az/*` is excluded the same way, for the same reason).
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
// backlog 197 — raised 6->12 / 12->24 so the new `ko/tokens`+`ko/chains` leg
// (equal-size sibling of `tokens`+`chains`, spec 197 evidence 2) does not
// halve EN throughput to make room: the remaining sample budget is now split
// EN half / KO half (see buildStaticSurfaces()'s `remainingSampleSize` split
// below), and doubling the total keeps each half's own 2:1 token:chain pick
// count byte-identical to pre-197 (EN 4 tokens + 2 chains, same as today;
// KO gets the same 4+2 for the first time). MEASURED, not estimated (spec
// 197 §"Budget" requires measurement over estimation): this checkout's own
// before/after `node test_audit_prescan.js` wall-clock went ~1m52s -> see
// specs/197-notes.md for the after figure and the full-CLI before/after,
// both timed on this exact run, not extrapolated from item 192's older
// ~0.19s/surface figure (which is cited in notes only as a secondary,
// explicitly-labeled cross-check).
const DEFAULT_STATIC_SAMPLE = 12;
const MAX_STATIC_SAMPLE = 24;
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
  'link-target-integrity': 'P1',
  // backlog 184 — level-2 ("resolvable") liveness of the estate's `?pool=`
  // deep links, classified with 181's contract/stale/drift rules (see the
  // sub-rule inside prescanStaticPages() below). P1 to match the other
  // link-integrity signals it complements.
  'pool-link-liveness': 'P1'
};

// backlog 184 — a `?pool=` value must look like a real DefiLlama pool id
// (a UUID, case-insensitive) before it is even worth resolving against live
// data; anything else is a generator bug (contract), never a live-data
// question.
const POOL_ID_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// backlog 184 — day-to-ms conversion for the sub-rule's own staleness math.
// NOT a second copy of any threshold (STALE_AFTER_DAYS/DRIFT_BUDGET_FRACTION
// both stay imported from cta181, never re-typed) — this is just a units
// constant, same role prescanTextSurfaces()/classifyPage() play with their
// own MS_PER_DAY in test_seo_cta_targets.js, restated here because that
// file's MS_PER_DAY is not exported (only the four items 184 actually needs
// are, per the spec's own export list).
const MS_PER_DAY_184 = 24 * 60 * 60 * 1000;

// backlog 192 — the standing 300s/5-minute foreground timebox (decision
// 2026-07-11) as an actual constant, not just prose repeated across comments.
// Item-159 rule: every derived foreground-budget number in this file reads
// FROM this constant — there must never be a second 300000 (or "300s")
// literal anywhere else driving behaviour (comments restating "300s" in
// prose, as history, are fine; a second numeric literal used in a
// computation is not).
const FOREGROUND_CAP_MS = 300 * 1000;

// Pool-snapshot prescan (backlog 167). Budget knobs mirror the static leg's
// naming (DEFAULT_*/MAX_* pairs), reusing the module's existing
// APY_SANITY_LIMIT / ABSURD_MAGNITUDE constants verbatim — this section may
// never redefine either (a rail mirror here is a trust-rail edit).
const DEFAULT_POOL_PRESCAN_MAX = 2; // promotion cap
// backlog 191 — raised 2 -> 6 (== MAX_POOL_SAMPLE) after measuring wall-clock,
// not by picking the ceiling because it was there: a full `node audit-app.js`
// run took 106s at the old default of 2, and 107s at 6 (both single
// foreground runs, rotation state redirected to a scratch file) — comfortably
// inside the 300s/5-minute foreground cap with ~65% headroom to spare, so 6
// was chosen outright rather than a smaller intermediate value. This cuts the
// pool-detail rotation's full-pass time from ~367 days to ~123 (739
// candidates / 6, a 3x constant factor — see specs/191-notes.md, it does NOT
// close the coverage gap). Because the default now EQUALS the ceiling, the
// env override (`AUDIT_POOL_SAMPLE`) can only ever LOWER the sample size from
// here; raising it further needs MAX_POOL_SAMPLE raised — 191's OWN WORDS,
// SUPERSEDED by backlog 192 immediately below (kept verbatim as the reasoning
// trail, not deleted — 192's own instructions require this history to stay).
//
// backlog 192 — raised AGAIN: DEFAULT_POOL_SAMPLE 6 -> 32, MAX_POOL_SAMPLE
// 6 -> 64 (this time deliberately set ABOVE the new default, so
// AUDIT_POOL_SAMPLE can raise the sample size as well as lower it — 191 hit
// the opposite trap, default==ceiling, and could only ever lower). Justified
// by the operator's own three measured foreground timings on this checkout,
// taken BEFORE writing specs/192.md, rotation state redirected to a scratch
// file for each run:
//   AUDIT_POOL_SAMPLE=6  -> 111s wall-clock, exit 0, 1 finding total,  0 blocking
//   AUDIT_POOL_SAMPLE=16 -> 111s wall-clock, exit 0, 1 finding total,  0 blocking
//   AUDIT_POOL_SAMPLE=32 -> 116s wall-clock, exit 1, 3 findings total, 2 blocking (1 P0 + 1 P1)
// Marginal cost per rendered pool-detail: ~0.19s (+5s of wall-clock for 26
// extra renders, 6 -> 32) — this CONFIRMS 191's own finding restated above,
// it does not contradict it: the run stays dominated by fixed costs (live
// third-party fetches, the 2,183-page static prescan), not by per-pool render
// cost. 32 is chosen as the largest MEASURED value (116s = 39% of
// FOREGROUND_CAP_MS), landing well inside this item's own <=180s (60% of the
// cap) target — see specs/192-notes.md for the full derivation, including why
// 32 is not "picked because it's round" (it's the largest value the operator
// actually ran). MAX_POOL_SAMPLE=64 is bounded by the SAME measurement, not
// by taste: extrapolating the ~0.19s/render marginal cost, 64 renders
// ~= 122s, still under the 180s target. Because AUDIT_POOL_SAMPLE can now
// raise the sample past what was measured here (up to 64), and because a slow
// day can inflate the fixed-cost legs regardless of sample size, the ceiling
// alone is no longer sufficient insurance against a run that does not finish
// — AUDIT_TIME_BUDGET_MS (below, and in runAudit()'s render loop) is what
// keeps ANY sample size, on ANY day, from costing a finished run; it protects
// completion, this constant only sizes the ordinary case.
const DEFAULT_POOL_SAMPLE = 32;     // rotation sample size
const MAX_POOL_SAMPLE = 64;         // ceiling on AUDIT_POOL_SAMPLE
const POOL_ID_PREFIX_LEN = 8;       // `pool-detail:<prefix>` surface naming

// backlog 199 — the lens dimension. 183/191/192/196 fixed WHICH pool-details
// get audited and HOW MANY; the responsive (360px)/dark/KO checks still only
// ever saw the single hardcoded PREFERRED_POOL_ID anchor, because the four
// named anchor surfaces (pool-detail-360/-dark/-ko) are the only place those
// three flags were ever set. This gives a bounded subset of the SAME
// rotation picks (never promotedIds, never the anchor — both already
// four/one-lens covered) one extra render each, one lens each, cycling.
// Fixed order — LENSES[(i + tickOffset) % LENSES.length] both picks the lens
// for position i AND makes "@360px"/"@dark"/"@ko" the exact surface-name
// suffix (see the loop in buildPoolSurfaces() below).
const LENSES = ['360px', 'dark', 'ko'];
// 6 lens surfaces/tick, same convention as every other budget knob in this
// file (DEFAULT_*/MAX_* pair, env override, opts override, clamped). Sized
// against 192's own measurement (specs/192-notes.md: ~0.19s marginal per
// rendered pool-detail, 116s/300s observed on this machine class): 6 x
// ~0.19s =~ 1.2s marginal wall-clock on top of a 116s run — a small, bounded
// slice of the ~184s of remaining headroom under FOREGROUND_CAP_MS, not a
// second attempt at raising DEFAULT_POOL_SAMPLE (192 set that deliberately;
// spec 199's own "out of scope").
const DEFAULT_POOL_LENS_SAMPLE = 6;   // lens surfaces per tick
const MAX_POOL_LENS_SAMPLE     = 24;  // ceiling on AUDIT_POOL_LENS_SAMPLE

// backlog 219 — the occlusion lens's own constants. OCCLUSION_HEIGHT=780 is
// not a round default: it is the EXACT height at which item 218's garden_cta
// anchor was buried (721.6..780 footer band vs the always-900-tall pages
// every other check renders at, where the same footer clears at 842..900 and
// the defect is invisible). Occlusion is height-dependent by measured
// evidence, so a lens that only ever looked at 900 would have 218 in its
// blind spot by construction — see specs/219.md "Measurement geometry".
// OCCLUSION_MIN_COVERAGE=0.25 and OCCLUSION_CANDIDATE_CAP=800 are spec 219's
// own numbers (25% of a text-bearing victim's area, 800-element scan cap per
// pass) — restated here, not re-derived, so a later edit cannot silently
// drift them without also touching this comment.
const OCCLUSION_HEIGHT = 780;
const OCCLUSION_MIN_COVERAGE = 0.25;
const OCCLUSION_CANDIDATE_CAP = 800;

// backlog 231 — waitForQuiescence()'s own knobs. OCCLUSION_QUIESCENCE_BUDGET_MS
// is the bound on how long checkOcclusion will wait for the post-resize
// re-mount's entry animations (style.css:4605 `.animate-on-mount`) to finish
// before measuring anyway (spec 231 "must never hang, never go silent").
// OCCLUSION_QUIESCENCE_SAMPLE_GAP_MS is the minimum gap between the two
// geometry samples the stability leg compares (spec 231: "≥100 ms apart").
// Exported below (item-159 rule) so tests interpolate these rather than
// re-typing 3000/100.
const OCCLUSION_QUIESCENCE_BUDGET_MS = 3000;
const OCCLUSION_QUIESCENCE_SAMPLE_GAP_MS = 100;

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
// role as POOL_PRESCAN_SIGNALS above. `environment` and `upstream-null`
// (item 194) are the only downgrades; `defect` and `undeterminable` both stay
// blocking (spec 183's non-vacuity contract: a downgrade must never be the
// silent default — see classifyCtaKind()'s branch-order comment for how
// `upstream-null` is kept off that fallthrough path too). Only consulted via
// ctaFindingSeverity() below for the `fallback` shape — see its comment for
// why `missing` never reaches this table.
const CTA_KIND_SEVERITY = { defect: 'P1', undeterminable: 'P1', environment: 'P2', 'upstream-null': 'P2' };

// backlog 183 (verifier round 3) — severity by SHAPE first, kind second.
// 182's renderProtocolCtaBlock() (PoolDetail.js:161-207) ALWAYS returns one
// of the two CTA buttons, whether or not any protocol-URL tier resolves for
// the pool's project — so protocol-URL provenance has ZERO causal
// relationship to why `.cta-button-protocol` would be genuinely
// ABSENT/invisible (a render crash, a CSS bug, the block never invoked). A
// `missing` shape can therefore never be legitimately explained — let alone
// downgraded — by protocol-URL resolution: it stays P1, blocking, ALWAYS,
// whatever classifyCtaKind() returns. Only `fallback` (the element IS
// present/visible, just not the real CTA — exactly what provenance DOES
// explain) is eligible for the `environment` downgrade. Pulled out as its
// own pure/exported function (not left inline in the driver) so this
// asymmetry is directly testable and neuterable, same as classifyCtaKind()
// itself — the failure this guards against is identical in kind to the one
// spec 183 was written to prevent: "A run in which every dead-cta is
// auto-downgraded without evidence is the failure this item exists to
// prevent."
function ctaFindingSeverity(shape, kind) {
  if (shape === 'missing') return 'P1';
  return CTA_KIND_SEVERITY[kind];
}

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
// rotation-candidate population or `unseen` can never reach zero,
// `computeRotation()`'s wrap branch (and therefore `cycle` ever
// incrementing, and the "log the rotation position so a reader can tell
// coverage from luck" signal) becomes permanently dead code on real data —
// a cap of 500 against ~735 candidates was exactly this bug (the original
// snapshot-only trap this constant's comment already warned about).
//
// backlog 206 — RAISED 2000 -> 12000, for exactly the same reason
// STATIC_ROTATION_SEEN_CAP's own comment (below) documents for its leg: the
// candidate population this constant now bounds is no longer just the
// snapshot (736 pools on this checkout) — buildPoolSurfaces() widens it to
// the UNION of the snapshot and the estate's own live, shape-valid `?pool=`
// deep links (spec 206 evidence: 3,669 distinct deep-linked ids, only 420 of
// which overlap the snapshot, so the union is ~3,985 on this checkout — see
// specs/206-notes.md for the exact measured figure). 2000 sat BELOW that
// union, which would have made the wrap branch permanently dead code again
// the moment this item shipped — precisely the trap this comment already
// warns about, on its fourth occurrence in this file (183 -> 196 -> 206).
// 12000 gives >=2x headroom over today's real union population, matching
// STATIC_ROTATION_SEEN_CAP's own >=2x-headroom convention, at the same
// negligible per-id disk cost this comment already measured (~40 bytes/id
// ⇒ ~480KB at the new cap — still a bounded, small file that costs nothing
// extra to commit; the file already rewrites daily).
// test_audit_pool_population.js (206) asserts this invariant against the
// REAL union population (snapshot + estate deep links), read from disk at
// test time, never a hardcoded literal — a failure there means: raise this
// cap again. test_audit_cta_provenance.js's own pre-206 snapshot-population
// assertion is left as-is (it still holds; snapshot alone is still well
// under 12000).
const ROTATION_SEEN_CAP = 12000;

// backlog 196 — co-located with DEFAULT_ROTATION_STATE_PATH, same zero-extra-
// deploy reasoning (spec 183 T5): the static leg's rotation state rides in
// the same already-committed-daily signals/ directory.
const DEFAULT_STATIC_ROTATION_STATE_PATH = path.join(ROOT, 'product-loop-kit', 'signals', 'audit-static-rotation.json');
// backlog 196 — DELIBERATELY NOT reusing ROTATION_SEEN_CAP (2000). The static
// leg's candidate population is the tokens/*.html leaf set — 2,109 pages on
// this checkout (spec 196 evidence table), which is already LARGER than
// 2000. A cap below the candidate population is exactly the trap
// ROTATION_SEEN_CAP's own comment warns about: `unseen` could never reach
// zero, computeRotation()'s wrap branch (and cycle ever incrementing) would
// become permanently dead code, silently defeating this whole item before a
// cycle ever completed. 6000 gives >=2x headroom over today's combined
// ~2,197 tokens+chains leaves for estate growth, at the same negligible
// per-id disk cost ROTATION_SEEN_CAP's own comment already measured.
// test_audit_static_rotation.js asserts this invariant against the REAL
// tokens/ + chains/ directories (fs.readdirSync), not a hardcoded literal.
//
// backlog 197 — STILL 6000, unchanged, on purpose: this cap is now shared by
// FOUR legs (tokens, chains, koTokens, koChains — see buildStaticSurfaces()
// below), each checked INDEPENDENTLY against its OWN disk-read population
// (design decision (a), per-family legs — see 197-notes.md), never against a
// combined total. `ko/tokens`/`ko/chains` are the same size as their EN
// siblings (spec 197 evidence 2: ~2,186 each on the checkout that ticketed
// this item), so 6000 already clears each of the four leg populations with
// the same >=2x headroom it always had — no leg's cap needed raising just
// because a second, equal-size leg pair was added alongside it.
// test_audit_static_rotation.js asserts the invariant per leg, against all
// four REAL directories.
const STATIC_ROTATION_SEEN_CAP = 6000;

// backlog 192 leg (b) — wall-clock guard default for the pool-detail
// ROTATION leg (see buildPoolSurfaces()'s `rotationPick` marker and
// runAudit()'s render loop). Derived from FOREGROUND_CAP_MS itself, never a
// second literal (item-159 rule): the guard's whole job is "the raised
// ceiling [MAX_POOL_SAMPLE] can never cost a finished run" against the SAME
// 300s the standing decision already governs — not some independently-picked
// fraction of it, which would just be a second unjustified number. The
// PART-1 ceiling choice (32/64, measured at 116s / extrapolated ~122s) is
// what keeps an ORDINARY run inside this item's own tighter <=180s target;
// this guard is the safety net for an ABNORMAL day — a third-party latency
// spike, or a future default/ceiling raise that outgrows the measurement
// above — where "the per-pool render cost is not the bottleneck" (191, 192)
// stops being true. AUDIT_TIME_BUDGET_MS overrides this (an artificially
// tiny value is how the tests prove the guard actually fires).
const DEFAULT_TIME_BUDGET_MS = FOREGROUND_CAP_MS;

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

// Sibling of extractQuotedArray() for analytics.js's captureAcquisition()
// (spec 203) — that key list is an inline `[...].forEach((k) => { ... })`
// literal, not a `var X = [...]` declaration, so it has no name to anchor a
// declaration regex on. Anchored on the `.forEach(` that immediately follows
// the array instead. Same "returns null on any failure to parse, never a
// wildcard" contract as extractQuotedArray() — a caller that gets null must
// skip rule (a) exactly like an unreadable file, never fall back to
// "everything allowed".
function extractForEachQuotedArray(text) {
  const arrMatch = text.match(/\[([^\]]*)\]\s*\.forEach\(/);
  if (!arrMatch) return null;
  const items = [];
  const strRe = /'([^']*)'|"([^"]*)"/g;
  let m;
  while ((m = strRe.exec(arrMatch[1])) !== null) items.push(m[1] !== undefined ? m[1] : m[2]);
  return items.length ? items : null;
}

// Returns { allowed: Set|null, error: string|null }. The caller prints the
// stderr note ONCE per scan (not once per file) and skips rule (a) entirely
// on error — rules (b)/(c) and the four pre-existing signals must keep
// working (the prescanTextSurfaces() never-throws contract).
//
// Third source (spec 203): analytics.js's captureAcquisition() reads its own
// list of attribution query keys (utm_*/ref/click-ids/src) into
// `this.acquisition`, which rides every event — a real, live query key on
// the home path exactly like 'lang' below, but for a THIRD consumer (the
// analytics capture list, not either router) that rule (a) never knew about
// before this item. Parsed, never hardcoded — a key removed from
// analytics.js's own array must start failing rule (a) again, not stay
// silently allowed by a stale second copy of the list (the bug class item
// 166 shipped and spec 169 already re-flagged once for the router arrays).
function loadRouterAllowedParams(homeHtmlPath, analyticsJsPath) {
  let text;
  try { text = fs.readFileSync(homeHtmlPath, 'utf8'); }
  catch (e) { return { allowed: null, error: `home.html unreadable at ${homeHtmlPath}: ${e.message}` }; }
  const analyticsParams = extractQuotedArray(text, 'ANALYTICS_PARAMS');
  const plannerParams = extractQuotedArray(text, 'PLANNER_PARAMS');
  if (!analyticsParams || !plannerParams) {
    return { allowed: null, error: `could not parse ANALYTICS_PARAMS/PLANNER_PARAMS out of ${homeHtmlPath}` };
  }
  let attributionText;
  try { attributionText = fs.readFileSync(analyticsJsPath, 'utf8'); }
  catch (e) { return { allowed: null, error: `analytics.js unreadable at ${analyticsJsPath}: ${e.message}` }; }
  const attributionParams = extractForEachQuotedArray(attributionText);
  if (!attributionParams) {
    return { allowed: null, error: `could not parse captureAcquisition()'s key list out of ${analyticsJsPath}` };
  }
  // 'lang' is read by translations.js, not the router, so it never appears
  // in either array — a real, live query key (spec 169 Territory note), so
  // it is allowed explicitly rather than fudged in by loosening the parse.
  return { allowed: new Set([...analyticsParams, ...plannerParams, ...attributionParams, 'lang']), error: null };
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
  // once, not once per file, so a skip note prints exactly once (opts.homeHtml/
  // opts.analyticsJs are the coupling-test overrides, same convention as
  // opts.files).
  const homeHtmlPath = opts.homeHtml || path.join(ROOT, 'home.html');
  const analyticsJsPath = opts.analyticsJs || path.join(ROOT, 'analytics.js');
  const routerParams = loadRouterAllowedParams(homeHtmlPath, analyticsJsPath);
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

  // tvl-floor-claim RAIL-RELATIVE arm (backlog 254, spec 254 leg 3). The arm
  // above (inside the main per-file loop) only ever checks a document
  // against ITSELF — "is any figure in this section smaller than the floor
  // this SAME document states" — which never reads DEFAULT_MIN_TVL and so
  // cannot catch a document that is internally consistent but wrong (spec
  // 254 evidence: exactly llms.txt's pre-fix state). This arm's predicate is
  // instead: a stated floor must EQUAL DEFAULT_MIN_TVL, read live off app.js
  // via loadDefaultMinTvl() above (never a second hardcoded 100000/10000000
  // here — same discipline as the level-3 link-target-integrity check that
  // already reuses minTvlInfo). Kept fully separate from the arm above:
  // additive, its own file list, so the internal-consistency arm's existing
  // behavior/tests are untouched.
  //
  // Surface set widened beyond TEXT_SURFACE_FILES's 2 AI-discovery text
  // files (opts.railFiles overrides for fixture-driven tests, same
  // convention as opts.homeHtml/opts.appJs above; unset -> the real served
  // surfaces): 'home.html' is a RENDERED surface (the navigator.modelContext
  // tool description) — backlog 254 acceptance criterion 4's "at least one
  // rendered surface and one generated page" is satisfied structurally: the
  // generated-page arm is proven by the GENERATED-PAGE-shaped fixture test
  // in test_audit_text_surfaces.js (opts.railFiles override), not by a real
  // committed file here. Deliberately NOT a glob of stories/*.html, and NOT
  // 'stories/kevin.html' either (254 fix pass, verifier finding 1):
  // tomoko.html/lucia.html/kevin.html each state a DIFFERENT, independent
  // PERSONA curation floor (TEMPERAMENTS.<key>.minTvl in
  // generate-stories.js — $50M/$10M/$10M respectively) that is NOT a claim
  // about the platform's DEFAULT_MIN_TVL rail — scanning any of them here
  // would be a permanent false positive, not a fix. Kevin is not a special
  // case relative to tomoko/lucia; all three are excluded the same way.
  if (minTvlInfo.value != null) {
    const railFiles = opts.railFiles || TEXT_SURFACE_FILES.concat(['home.html']);
    for (const file of railFiles) {
      const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
      const rel = path.isAbsolute(file) ? path.relative(ROOT, file) : file;
      let railContent;
      try { railContent = fs.readFileSync(abs, 'utf8'); }
      catch (e) { continue; } // unreadable/missing — skip, never throw (main loop's own convention)
      const found = findStatedTvlFloorAnyShape(railContent);
      if (!found) continue;
      if (found.val !== minTvlInfo.value) {
        suspects.push({
          rel, signal: 'tvl-floor-claim', severity: TEXT_SURFACE_SIGNALS['tvl-floor-claim'],
          detail: `stated floor "${found.text}" does not equal the enforced rail DEFAULT_MIN_TVL ($${minTvlInfo.value.toLocaleString('en-US')}) — rail-relative check`
        });
      }
    }
  } else if (!opts.railFiles) {
    console.error('[audit] text prescan: tvl-floor-claim rail-relative arm skipped — ' + minTvlInfo.error);
  }

  // P0-first, then rel — same comparator shape as prescanStaticPages().
  suspects.sort((a, b) => {
    const rank = (sev) => (sev === 'P0' ? 0 : 1);
    if (rank(a.severity) !== rank(b.severity)) return rank(a.severity) - rank(b.severity);
    return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0;
  });

  return { scanned, suspects };
}

// Shared by the tvl-floor-claim rail-relative arm above AND the repo-wide
// dictionary/surface scan (test_rail_floor_derivation.js): the several prose
// SHAPES this product's stating sites actually use for a TVL floor claim
// (spec 254 evidence table) — "TVL ≥ $X" (llms.txt/llms-full.txt), "$X
// minimum TVL" (the landing trust badge, EN), "minimum $X TVL" (home.html's
// tool description), "$X+ TVL" (persona temperament labels), "TVL $X" (the
// landing trust badge, KO — "최소 TVL $100K", floor-word-then-figure order,
// the reverse of the EN phrasing). Named groups so every alternate can sit
// at a different textual position without renumbering a single shared
// capture-group index. Tried in this fixed order (most specific first,
// "TVL $X" last as the loosest fallback) and returns the FIRST shape that
// matches, or null.
function findStatedTvlFloorAnyShape(content) {
  const shapes = [
    /TVL\s*(?:≥|>=)\s*\$(?<amt>[0-9][0-9,]*(?:\.[0-9]+)?)\s*(?<unit>[KMBT])?/,
    /\$(?<amt>[0-9][0-9,]*(?:\.[0-9]+)?)\s*(?<unit>[KMBT])?\s*minimum\s+TVL/i,
    /minimum\s+\$(?<amt>[0-9][0-9,]*(?:\.[0-9]+)?)\s*(?<unit>[KMBT])?\s*TVL/i,
    /\$(?<amt>[0-9][0-9,]*(?:\.[0-9]+)?)\s*(?<unit>[KMBT])?\+\s*TVL/i,
    /TVL\s+\$(?<amt>[0-9][0-9,]*(?:\.[0-9]+)?)\s*(?<unit>[KMBT])?/,
  ];
  for (const re of shapes) {
    const m = content.match(re);
    if (!m || !m.groups) continue;
    const val = parseMoney(m.groups.amt, m.groups.unit);
    if (Number.isFinite(val)) return { val, text: m[0] };
  }
  return null;
}

// No-suspects/disabled shape — always the same shape whether the pass ran
// and found nothing, or didn't run at all (mirrors emptyPrescanResult()).
function emptyTextSurfaceResult() {
  return { scanned: 0, suspectCount: 0, bySignal: {} };
}

// i18n value-honesty prescan (item 190): translations.js has no signal that
// checks whether a KO value is actually Korean — evidence was 353,114.2%-APY-
// class ("caught only by hand"), this time for copy: the KO bare-`/` landing
// footer closed with an untranslated English sentence (two `landing.footer*`
// values byte-identical to EN). Blast radius measured at build time: the
// landing route only — `landing.js` is loaded by `home.html` alone, NOT by
// the generated `tokens/*.html`/`chains/*.html` pages, correcting spec 190's
// "2,201 landers" figure (see specs/190-notes.md). Pure fs+require
// over translations.js, no render, no network — same "prescan the cheap way"
// shape as the text-surface family above, aimed at ONE dictionary instead of
// a handful of files.
// signal -> severity, single source of truth (same role as TEXT_SURFACE_SIGNALS).
const I18N_SIGNALS = { 'en-ko-parity': 'P1' };
// Hangul syllables + Jamo + compatibility Jamo — matches spec 190's evidence
// regex verbatim.
const I18N_HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;
// Item 198: the predicate is keyed on the KO value alone (no-Hangul AND
// has-Latin-prose), not on identity with EN — see the Rule 2 comment below
// for why. Dropping the byte-identity gate means a KO value that is
// legitimately non-linguistic ("$100", "2026", "—") would otherwise become a
// suspect the instant it contains no Hangul, and would need an allowlist
// entry it should never have needed (spec 198 acceptance criterion 4). This
// conjunct exists solely to keep bare figures/punctuation out of the suspect
// set without allowlisting them one by one. Accepted blind spot, stated
// plainly: a KO value made purely of digits/punctuation that SHOULD have
// been translated (there is no such string in this dictionary today, but
// nothing prevents one existing) is not detectable by this rule — that is
// fine, because such a value carries no English prose to be stale in the
// first place.
const I18N_LATIN_LETTER = /[A-Za-z]/;

// Brand/product names and acronyms that are LEGITIMATELY untranslated in
// KO (no Hangul, but real Latin prose — not a bare figure) — data, not
// code, keyed by the EXACT flattened key path (never a prefix or substring
// match; see prescanI18n()'s lookup below). Adding a real brand string here
// is a one-line diff. Adding a NON-brand string here to silence a real
// untranslated-copy finding is the documented failure mode this gate exists
// to prevent (relaxing the gate instead of fixing the bug) and is a
// REVERT-CANDIDATE signal per spec 190's decision rule — every entry needs a
// one-line reason that actually holds up.
const I18N_UNTRANSLATED_ALLOWLIST = {
  navCatLpDex: 'acronym, same in KO',
  navCatRwa: 'acronym, same in KO',
  navFilterTvl: 'acronym, same in KO',
  navFilterApy: 'acronym, same in KO',
  tvl: 'acronym, same in KO',
  defillamaApi: 'brand name (DefiLlama API)',
  'planner.goalClaude': 'brand name (Claude Pro)',
  'planner.goalMax': 'brand name (Max)',
  'planner.goalHulu': 'brand name (Hulu)',
  'planner.goalAppleTV': 'brand name (Apple TV+)',
  'planner.goalChatGPT': 'brand name (ChatGPT Plus)',
  'planner.goalPeacock': 'brand name (Peacock)',
  'planner.goalDoorDash': 'brand name (DoorDash)',
  'planner.goalUberOne': 'brand name (Uber One)',
  'planner.goalAudible': 'brand name (Audible)',
  'planner.goalWalmart': 'brand name (Walmart+)',
  'planner.poolApy': 'acronym, same in KO',
  'planner.poolTvl': 'acronym, same in KO',
  'planner.pressFeatureName': 'brand name (Leviathan News)',
  'planner.ladderSpotify': 'brand name (Spotify)',
  'planner.ladderNetflix': 'brand name (Netflix)',
  'planner.ladderClaude': 'brand name (Claude Pro)',
  tcpColApy: 'acronym, same in KO',
  tcpColTvl: 'acronym, same in KO'
};

// Recursively flattens a translations namespace into { 'a.b.c': leafValue }.
// Plain objects recurse; every other value type (string, function, array,
// number) is a leaf — mirrors how translations.js itself is shaped (nested
// namespaces are plain objects; everything else, including the handful of
// function-valued interpolators like returnStatus, is a terminal value).
function flattenI18nDict(obj, prefix, out) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const keyPath = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenI18nDict(v, keyPath, out);
    } else {
      out[keyPath] = v;
    }
  }
  return out;
}

// Never throws: an unloadable/malformed dictionary is skipped (one stderr
// note) and returns the empty/unrun scan shape — exact parallel of
// prescanTextSurfaces()'s unreadable-file handling. opts.dict is the
// test-support injection hook, same convention as opts.pages/opts.files
// elsewhere in this file.
function prescanI18n(opts = {}) {
  const allowlistSize = Object.keys(I18N_UNTRANSLATED_ALLOWLIST).length;
  let dict = opts.dict;
  if (dict === undefined) {
    try {
      dict = require('./translations.js').translations;
    } catch (e) {
      console.error(`[audit] i18n prescan: translations.js unreadable/unparseable — ${e.message}`);
      return { scanned: 0, suspects: [], allowlistSize };
    }
  }
  if (!dict || typeof dict !== 'object' || !dict.en || typeof dict.en !== 'object' || !dict.ko || typeof dict.ko !== 'object') {
    console.error('[audit] i18n prescan: dictionary missing en/ko namespaces — skipped');
    return { scanned: 0, suspects: [], allowlistSize };
  }

  let enFlat, koFlat;
  try {
    enFlat = flattenI18nDict(dict.en, '', {});
    koFlat = flattenI18nDict(dict.ko, '', {});
  } catch (e) {
    console.error(`[audit] i18n prescan: dictionary could not be flattened — ${e.message}`);
    return { scanned: 0, suspects: [], allowlistSize };
  }

  const enKeys = new Set(Object.keys(enFlat));
  const koKeys = new Set(Object.keys(koFlat));
  const suspects = [];

  // Rule 1 — key parity, both directions.
  for (const key of enKeys) {
    if (!koKeys.has(key)) {
      suspects.push({ key, signal: 'en-ko-parity', severity: I18N_SIGNALS['en-ko-parity'],
        detail: 'key present in en, missing in ko' });
    }
  }
  for (const key of koKeys) {
    if (!enKeys.has(key)) {
      suspects.push({ key, signal: 'en-ko-parity', severity: I18N_SIGNALS['en-ko-parity'],
        detail: 'key present in ko, missing in en' });
    }
  }

  // Rule 2 — value honesty: is the KO leaf actually Korean? Item 198: the
  // predicate is a property of the KO value ALONE, not of the pair — a KO
  // leaf is a suspect iff it contains no Hangul AND contains at least one
  // Latin letter (i.e. there is translatable prose there at all, ruling out
  // bare figures like "$100" without needing an allowlist entry for them)
  // AND its exact key path is not on the allowlist. The old predicate also
  // required byte-identity with EN, which is a property of the PAIR — and a
  // property of the pair goes silent exactly when the pair drifts: reword
  // the EN string without touching KO and the pair stops being identical,
  // even though the KO value is now stale English. Keying on the KO value
  // alone closes that hole. Byte-identity with EN is still real, useful
  // information, so it stays in the detail string when it happens to hold —
  // it is just no longer part of the gate.
  for (const key of enKeys) {
    if (!koKeys.has(key)) continue; // already reported by rule 1
    const enVal = enFlat[key];
    const koVal = koFlat[key];
    if (typeof enVal !== 'string' || typeof koVal !== 'string') continue; // function/array/number leaves: parity only
    if (I18N_HANGUL.test(koVal)) continue;
    if (!I18N_LATIN_LETTER.test(koVal)) continue;
    if (Object.prototype.hasOwnProperty.call(I18N_UNTRANSLATED_ALLOWLIST, key)) continue;
    const identical = enVal === koVal;
    suspects.push({ key, signal: 'en-ko-parity', severity: I18N_SIGNALS['en-ko-parity'],
      detail: `ko value contains no Hangul${identical ? ' and is byte-identical to en' : ''}: "${koVal}"` });
  }

  suspects.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const scanned = new Set([...enKeys, ...koKeys]).size;
  return { scanned, suspects, allowlistSize };
}

// No-suspects/disabled shape — always the same shape whether the pass ran
// and found nothing, or didn't run at all (mirrors emptyTextSurfaceResult()).
// allowlistSize is present even when the pass never ran, so a reader can
// always tell "clean" from "allowlisted into silence" (spec 190 acceptance
// criterion).
function emptyI18nResult() {
  return { scanned: 0, suspectCount: 0, bySignal: {}, allowlistSize: Object.keys(I18N_UNTRANSLATED_ALLOWLIST).length };
}

// Item 253/256: prescanI18n() above catches a key missing/mistranslated AT
// THE SOURCE (translations.js itself). It does not catch the sibling failure
// where the key IS present in the dictionary but a `t()` lookup misses at
// RENDER time (wrong namespace, stale key reference, a rename that missed
// one call site) and the app renders the key's own name as if it were copy —
// item 253's live defect: `.empty-message` rendered the literal
// `poolNotFoundTitle`, and the existing `waitForSelector` presence check
// (below, the dead-pool branch) scored that CLEAN because the element WAS
// there — it just never read what the element said. This family closes the
// *rendered* leg; the *source* leg is item 255 and deliberately not
// subsumed here (see specs/256.md's "Class closed" note).
//
// 2026-08-10 measurement (backlog 256 follow-up): a dictionary-only
// population is blind at the exact moment the key is the thing that's
// wrong — deleting `poolNotFoundTitle` from translations.js shrinks the
// population exactly when the rendered defect appears, so the gate returned
// zero findings against a real, Playwright-confirmed `.empty-message`
// reading the literal text "poolNotFoundTitle". The population is now the
// UNION of two independently-derived legs:
//   - Leg A: collectI18nKeyNames() — key names PRESENT in the dictionary
//     (unchanged, see its own comment below).
//   - Leg B: collectReferencedKeyNames() — key names REFERENCED at t()/
//     rootT() call sites in the rendered product source
//     (collectRenderedScriptSources()); survives a key deleted from the
//     dictionary because it never reads the dictionary.
// collectRawKeyPopulation() is the union; scanRawRenderedKeys() below is
// unchanged — it only ever sees a Set, not which leg(s) contributed a name.
// Residual blind spots, both accepted:
//   (a) Leg B only collects single-literal-argument call sites — a
//       computed/interpolated key (`t(someVar)`, `t('a' + 'b')`) contributes
//       nothing, there being no static string to read at scan time.
//   (b) scanRawRenderedKeys() is exact-LINE matching (its own comment) — an
//       inline raw key sharing a line with other text is not caught,
//       regardless of which leg the key name came from.
// signal -> severity, single source of truth, same role as I18N_SIGNALS.
const I18N_RAW_KEY_SIGNALS = { 'i18n:raw-key-rendered': 'P1' };

// Builds the set of every translation-KEY-NAME that would read as a raw,
// untranslated identifier if it ever escaped onto the page. Derived from the
// parsed dictionary at run time (never hardcoded) so a key added, renamed, or
// emptied in translations.js is caught with zero change to this file — the
// acceptance criterion in specs/256.md.
//
// Both namespaces are flattened with the SAME flattenI18nDict() prescanI18n()
// already uses above — one walker, not two. Each flattened path contributes
// two candidate strings, because two different miss shapes render two
// different things:
//   - the FULL dotted path (e.g. "planner.goalClaude", "poolNotFoundTitle"):
//     this is what a raw JS object dotted-key would look like if ever printed
//     whole, and matches prescanI18n()'s own key vocabulary.
//   - the LAST dotted segment alone (e.g. "goalClaude"): this is what
//     actually renders in practice. translations.js's own root t() (see
//     createTranslationFunction(), translations.js ~1564-1580) echoes the
//     bare top-level KEY STRING back on a double miss — for a top-level key
//     that bare key and the full path are identical, but for a namespaced
//     miss the two other callers below only ever see the bare segment:
//     planner.js's makeT() (~887-900) looks up `dict[key]` inside the
//     already-selected `planner` namespace and echoes the bare `key` on a
//     miss, never a "planner.xxx"-shaped string; landing.js's `getCopy()`
//     (~57-60) hands callers the `landing` namespace object directly, so a
//     missed property likewise reads/renders by its bare name within that
//     namespace. Both shapes are genuinely renderable, so both go in.
function collectI18nKeyNames(opts = {}) {
  let dict = opts.dict;
  if (dict === undefined) {
    try {
      dict = require('./translations.js').translations;
    } catch (e) {
      console.error(`[audit] raw-key scan: translations.js unreadable/unparseable — ${e.message}`);
      return new Set();
    }
  }
  if (!dict || typeof dict !== 'object' || !dict.en || typeof dict.en !== 'object' || !dict.ko || typeof dict.ko !== 'object') {
    console.error('[audit] raw-key scan: dictionary missing en/ko namespaces — skipped');
    return new Set();
  }

  let enFlat, koFlat;
  try {
    enFlat = flattenI18nDict(dict.en, '', {});
    koFlat = flattenI18nDict(dict.ko, '', {});
  } catch (e) {
    console.error(`[audit] raw-key scan: dictionary could not be flattened — ${e.message}`);
    return new Set();
  }

  const names = new Set();
  for (const keyPath of [...Object.keys(enFlat), ...Object.keys(koFlat)]) {
    if (!keyPath) continue; // defensive: empty segment, never a real key
    names.add(keyPath);
    const lastDot = keyPath.lastIndexOf('.');
    const leaf = lastDot === -1 ? keyPath : keyPath.slice(lastDot + 1);
    if (leaf) names.add(leaf);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Item 256 follow-up (leg B) — see the "2026-08-10 measurement" comment on
// I18N_RAW_KEY_SIGNALS above for why this leg exists at all.
// ---------------------------------------------------------------------------

// The FILE population Leg B scans, derived from the render mechanism itself
// — never a hand-maintained file list. Walks the two shells the audit's own
// surfaces load (every surface URL is `/`, `/home.html…`, or `/plan.html…`)
// and follows their OWN script-loading mechanics — including the one that
// is NOT a static `<script src>` tag: home.html injects the analytics-app
// bundles at run time via `addScript(...)` inside a parser-blocking inline
// script (item 244's boot-order barrier), so a tag-only scan would miss
// app.js/PoolDetail.js entirely. Both shapes are matched below.
//
// opts.shells: test-injection hook, an array of ABSOLUTE PATHS (strings),
// read from disk in place of the real home.html/plan.html — chosen over
// `{ path, source }` because this leg's job is reading real disk paths;
// content-injection for a *script* is opts.files on the function below.
const SCRIPT_TAG_SRC_RE = /<script\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1/gi;
const ADD_SCRIPT_CALL_RE = /\baddScript\(\s*(['"])([^'"]+)\1/g;

function localScriptSrcsFromHtml(html) {
  const srcs = [];
  const seen = new Set();
  const collect = (re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      let src = m[2];
      if (/^(?:[a-z]+:)?\/\//i.test(src)) continue; // absolute/protocol-relative — out of scope
      const qIdx = src.search(/[?#]/);
      if (qIdx !== -1) src = src.slice(0, qIdx); // ignore query strings
      src = src.replace(/^\.\//, '').replace(/^\/+/, '');
      if (!src || seen.has(src)) continue;
      seen.add(src);
      srcs.push(src);
    }
  };
  collect(SCRIPT_TAG_SRC_RE);
  collect(ADD_SCRIPT_CALL_RE);
  return srcs;
}

// Served artifact -> authored source: strips trailing `.compiled`/`.min`
// infixes one at a time until none remain (`app.compiled.min.js` ->
// `app.compiled.js` -> `app.js`). The served and source files contain the
// same string literals the t()/rootT() regexes look for, so reading the
// source keeps the scan readable and independent of the build step
// (compile-app.js/minify-assets.js).
function stripBuildInfixes(filename) {
  let name = filename;
  let prev;
  do {
    prev = name;
    name = name.replace(/\.(?:compiled|min)\.js$/, '.js');
  } while (name !== prev);
  return name;
}

function collectRenderedScriptSources(opts = {}) {
  let shellPaths = opts.shells;
  if (shellPaths === undefined) shellPaths = [path.join(ROOT, 'home.html'), path.join(ROOT, 'plan.html')];

  const shells = [];
  for (const p of shellPaths) {
    try { shells.push({ path: p, source: fs.readFileSync(p, 'utf8') }); }
    catch (e) { console.error(`[audit] raw-key scan: shell unreadable — ${p}: ${e.message}`); }
  }

  const out = [];
  const seenPaths = new Set();
  for (const shell of shells) {
    let srcs;
    try { srcs = localScriptSrcsFromHtml(shell.source); }
    catch (e) { console.error(`[audit] raw-key scan: could not parse shell ${shell.path} — ${e.message}`); continue; }
    for (const src of srcs) {
      const servedPath = path.join(ROOT, src);
      const sourcePath = path.join(ROOT, stripBuildInfixes(src));
      const finalPath = (sourcePath !== servedPath && fs.existsSync(sourcePath)) ? sourcePath : servedPath;
      if (seenPaths.has(finalPath)) continue;
      seenPaths.add(finalPath);
      let content;
      try { content = fs.readFileSync(finalPath, 'utf8'); }
      catch (e) { console.error(`[audit] raw-key scan: script unreadable — ${finalPath}: ${e.message}`); continue; }
      out.push({ path: finalPath, source: content });
    }
  }
  return out;
}

// t('key') / t("key") — the shared, single-arg lookup function every
// namespace's t() ends up being (app.js's createTranslationFunction,
// planner.js's makeT()'s inner `t`, ~line 888). Matches only when the
// ENTIRE first argument is one quoted identifier-shaped literal — the
// backreferenced quote char plus the requirement that a `,` or `)` (a
// complete argument's boundary) immediately follows the closing quote is
// what keeps a computed key like `t('a' + 'b')` from contributing its first
// fragment ("a") as if it were a real key (documented blind spot (a) above).
const T_CALL_RE = /\bt\(\s*(['"])([A-Za-z_$][\w$]*)\1\s*[,)]/g;

// rootT(lang, 'key') — planner.js's ~line 901 two-arg root-namespace
// accessor (see rootT()'s own comment above collectI18nKeyNames()). The
// first argument (the language expression) is unconstrained; only the
// second argument is required to be a complete quoted identifier-shaped
// literal, same closing-boundary rule as T_CALL_RE.
const ROOT_T_CALL_RE = /\brootT\(\s*[^,()]+,\s*(['"])([A-Za-z_$][\w$]*)\1\s*[,)]/g;

function addKeyMatches(re, source, out) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(source)) !== null) out.add(m[2]);
}

// Returns a Set of key-name string literals referenced by t()/rootT() call
// sites in the rendered scripts. opts.files: test-injection hook, an array
// of `{ path, source }` (source = file CONTENT, not a path) — same
// convention as collectI18nKeyNames()'s opts.dict — so a test can prove a
// call site exists without touching a real file on disk. Never throws.
function collectReferencedKeyNames(opts = {}) {
  let files = opts.files;
  if (files === undefined) {
    try { files = collectRenderedScriptSources(opts); }
    catch (e) { console.error(`[audit] raw-key scan: could not derive script sources — ${e.message}`); files = []; }
  }
  const names = new Set();
  for (const file of files || []) {
    if (!file || typeof file.source !== 'string') continue;
    try {
      addKeyMatches(T_CALL_RE, file.source, names);
      addKeyMatches(ROOT_T_CALL_RE, file.source, names);
    } catch (e) {
      console.error(`[audit] raw-key scan: could not scan ${file && file.path ? file.path : '(unknown)'} for t()/rootT() call sites — ${e.message}`);
    }
  }
  return names;
}

// The population scanRawRenderedKeys() is actually run against: the union
// of leg A (dictionary key names, opts.dict) and leg B (referenced key
// names, opts.files/opts.shells) — see the "2026-08-10 measurement" comment
// on I18N_RAW_KEY_SIGNALS above for why a dictionary-only population is
// insufficient. opts is passed through unchanged to both legs; each leg
// reads only the opts key(s) it understands.
function collectRawKeyPopulation(opts = {}) {
  const union = new Set(collectI18nKeyNames(opts));
  for (const k of collectReferencedKeyNames(opts)) union.add(k);
  return union;
}

// Memoized at module scope — neither leg's input changes mid-process, so
// every surface driver shares one derivation instead of re-deriving both
// legs once per surface (83+ surfaces in a full run).
let _rawKeyPopulationCache = null;
function rawKeyPopulation() {
  if (!_rawKeyPopulationCache) _rawKeyPopulationCache = collectRawKeyPopulation();
  return _rawKeyPopulationCache;
}

// Pure, in-Node predicate mirroring scanNumbers()'s shape: takes rendered
// text (document.body.innerText, already pulled by auditText below) and the
// key-name set, returns human-readable detail strings.
//
// Exact-match-only after trim, line-by-line — NOT a substring/contains test.
// innerText line-breaks roughly on block boundaries, so a heading/label that
// renders as nothing but a raw key is its own line; a key merely mentioned
// inside a longer sentence never is. This is a deliberate, accepted blind
// spot: an inline raw key sharing a line with other text (e.g. "Loading
// poolNotFoundTitle...") is not caught, because exact-line matching is what
// keeps false positives at zero on real copy — and presence-over-precision
// is exactly the failure mode this item exists to correct (spec 256), so the
// predicate stays conservative in the other direction rather than risk
// flagging an English sentence that happens to contain a key as a substring
// (e.g. the word "plan").
function scanRawRenderedKeys(text, keyNames) {
  const hits = [];
  const seen = new Set();
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!keyNames.has(line)) continue;
    if (seen.has(line)) continue; // de-dup: same offending key, once per surface
    seen.add(line);
    hits.push(`raw translation key rendered as text: "${line}"`);
  }
  return hits;
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

// ---------------------------------------------------------------------------
// backlog 206 — the ONE `?pool=` deep-link id extractor in this file. Used
// to live inline inside prescanStaticPages()'s pool-link-liveness sub-rule
// (backlog 184); item 206 needs the exact same ids for the pool-detail
// rotation's candidate population (buildPoolSurfaces(), via
// prescanStaticPages()'s new `deepLinkPoolIds` return field), so this is now
// a named helper both call, rather than two independently-drifting regex
// scans (verifier greps for exactly one `[?&]pool=`-style extraction).
// Same owned-suffix/home-path/query-pair helpers rule (a) and level 2/3
// above already use — reused, never re-parsed. Deliberately UNFILTERED by
// pool-id shape (no POOL_ID_UUID_RE check here): prescanStaticPages()'s own
// pool-link-liveness classification needs to SEE malformed ids too (that is
// what makes them classify as 'contract' rather than silently vanishing) —
// callers that want a shape-clean population (the new rotation leg) filter
// on the way out, not in here. Returns a plain array; may contain
// duplicates within one page (a caller that wants uniqueness Set-ifies it,
// exactly like the pre-206 inline code did with `pageDeepLinkIds`).
// ---------------------------------------------------------------------------
function extractDeepLinkPoolIds(html) {
  const ids = [];
  for (const m of html.matchAll(HTML_HREF_RE)) {
    const suffix = ownedHtmlLinkSuffix(m[1]);
    if (suffix === null) continue;
    const linkPathVal = ownedLinkPath(suffix);
    if (linkPathVal !== '' && linkPathVal !== '/') continue;
    const pairs = linkQueryPairs(suffix);
    if (!pairs.has('pool')) continue;
    const id = pairs.get('pool');
    if (id) ids.push(id);
  }
  return ids;
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
//   chain     -> exact, case-sensitive pool.chain equality, EXCEPT the
//                literal value 'All', a wildcard matching every pool (item
//                188 Leg C, mirrors app.js:1837/1843)
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
    // item 188 Leg C: 'All' is a wildcard, not a literal chain name (mirrors
    // app.js:1837/1843's `chainMatch = selectedChain === 'All' || ...`) — no
    // pool's `chain` field is ever 'All', so without this every `?chain=All`
    // grid link would simulate to zero pools and raise a false
    // link-target-integrity P1. 'Popular' is the sibling wildcard (app.js
    // :1838's 15-chain list) but is intentionally NOT handled here — no
    // `?chain=Popular` link exists on any generated surface today (grep-
    // confirmed empty); specs/188-notes.md records this as a known gap.
    if (chain && chain !== 'All' && p.chain !== chain) continue;
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
// backlog 184 — live pool-id set for the level-2 `?pool=` liveness sub-rule
// below. Never throws: any failure (bad injected fixture, cta181.loadPools()
// throwing on no fixture/cache/network) is caught and reported back as
// `{ ids: null, error }` so the caller can decide how to degrade (never a
// silent pass — see prescanStaticPages()'s own "unrun" semantics).
// ---------------------------------------------------------------------------
async function loadLivePoolIds(opts = {}) {
  if (Array.isArray(opts.livePools)) {
    // Test injection — bypasses cta181.loadPools() (and therefore its fixture/
    // cache/network path) entirely, same convention as this file's other
    // opts.* test-support knobs (opts.pages, opts.snapshot, ...).
    // backlog 206 — `pools` (the full LIVE-shape records, not just ids) is
    // additive: runAudit() needs them to build the sub-rail fixture body
    // (§7) and extend `ctx.poolsById`, without a second fetch/injection.
    return { ids: new Set(opts.livePools.map((p) => p.pool)), pools: opts.livePools, error: null, source: 'injected', count: opts.livePools.length };
  }
  try {
    // cta181.loadPools() already handles POOLS_FIXTURE, a 6h temp cache, and
    // a live fetch — and throws loudly rather than passing vacuously (its own
    // header comment). Reused verbatim, never re-implemented (174's rule).
    const pools = await cta181.loadPools();
    return { ids: new Set(pools.map((p) => p.pool)), pools, error: null, source: 'pools', count: pools.length };
  } catch (e) {
    return { ids: null, pools: null, error: e.message, source: null, count: 0 };
  }
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
  // behaviour (no opts.pages) was listLeafPages('tokens') + listLeafPages
  // ('chains') through backlog 196 (spec 172's "page list is unchanged"
  // requirement, honored through that item).
  //
  // backlog 197 — extended to the KO half of the estate: `ko/tokens/` +
  // `ko/chains/` are the SAME SIZE as `tokens/`/`chains/` (spec 197 evidence
  // 2, ~2,186 leaf pages each) and were never scanned by any collection
  // point — a missing argument, not a missing mechanism (spec 197
  // Hypothesis). `listLeafPages(dir)` already takes a directory and joins it
  // under ROOT, so `'ko/tokens'`/`'ko/chains'` work as-is, no change to
  // listLeafPages() itself. opts.pages overrides this ENTIRE default
  // (EN+KO), unchanged from before this item.
  const rawPages = opts.pages || listLeafPages('tokens').concat(listLeafPages('chains'))
    .concat(listLeafPages('ko/tokens')).concat(listLeafPages('ko/chains'));

  // Rule (a)'s two allow-lists are the SAME for every page in this scan —
  // parsed once, not once per file, so an unreadable/unparseable
  // home.html/planner.js/analytics.js prints its stderr note exactly once
  // (mirrors prescanTextSurfaces()'s own routerParams setup, backlog 169).
  // opts.homeHtml/opts.plannerJs/opts.analyticsJs are the coupling-test
  // override, same convention as opts.homeHtml on prescanTextSurfaces().
  const homeHtmlPath = opts.homeHtml || path.join(ROOT, 'home.html');
  const plannerJsPath = opts.plannerJs || path.join(ROOT, 'planner.js');
  const analyticsJsPath = opts.analyticsJs || path.join(ROOT, 'analytics.js');
  const routerParams = loadRouterAllowedParams(homeHtmlPath, analyticsJsPath);
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

  // ---------------------------------------------------------------------------
  // backlog 184 — level-2 ("resolvable") liveness of `?pool=` deep links.
  // Independently neuterable block: `opts.livePoolIds` (Set|null|undefined)
  // and `opts.livePoolsError` (string|null) are the ONLY two inputs.
  //   - livePoolIds undefined AND no livePoolsError => NOT REQUESTED (off,
  //     emits nothing — the pre-184 behaviour of this function, byte-for-byte,
  //     when a caller never asks for this sub-rule).
  //   - livePoolsError set => UNRUN (a fetch failure must not silently pass
  //     the gate — buildStaticSurfaces() turns this into a P1 finding).
  //   - livePoolIds is a real Set (and no error) => runs.
  // This mirrors, at the sub-rule level, the same "off by default until an
  // opts knob asks for it" shape rules (a)/(b)/levels 2/3 already use above.
  // ---------------------------------------------------------------------------
  const poolLinkRequested = (opts.livePoolIds instanceof Set) || !!opts.livePoolsError;
  const poolLinkRan = poolLinkRequested && !opts.livePoolsError && (opts.livePoolIds instanceof Set);
  const poolLinkReason = !poolLinkRequested ? 'not requested' : (opts.livePoolsError || null);
  const livePoolIdsSet = poolLinkRan ? opts.livePoolIds : null;
  // `today` is injectable (UTC ms, midnight) — never read from the real clock
  // per-page; computed once, same convention as test_seo_cta_targets.js's own
  // `today` (main()). Only ever consulted when poolLinkRan is true.
  const poolLinkTodayMs = typeof opts.today === 'number' ? opts.today
    : (() => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); })();
  const poolLinkScanIds = new Set(); // GLOBALLY distinct ?pool= ids seen this scan — the budget denominator (spec's own 4/3,677 framing)
  const poolLinkIdClass = new Map(); // id -> worst class seen across pages (contract > stale > drift > ok)
  const POOL_LINK_CLASS_RANK = { contract: 3, stale: 2, drift: 1, ok: 0 };
  const poolLinkDeadPages = new Set(); // pages carrying >=1 dead (stale or drift) id
  const poolLinkDriftCandidates = []; // { rel, slug, ids } — only emitted as suspects if scan-wide drift exceeds budget
  // backlog 206 — scan-wide, shape-filtered `?pool=` deep-link population
  // (the pool-detail rotation's widened candidate leg). Accumulated for
  // EVERY non-`ko/` page regardless of whether poolLinkRan (the liveness
  // sub-rule needs opts.livePoolIds; this population does not — it only
  // needs the estate's own href text, always readable). Filtered through
  // POOL_ID_UUID_RE (184's own contract rule: a malformed value is a
  // generator bug, never a rotation candidate) so junk never reaches
  // buildPoolSurfaces().
  const deepLinkIds = new Set();

  let scanned = 0;
  const suspects = [];
  // backlog 197 acceptance ("a reader must tell EN-clean from KO-clean") —
  // per-family scanned counts, derived from each scanned rel's own path
  // prefix (never from which listLeafPages() call produced it — opts.pages
  // callers hand in a flat list with no leg association, so classifying by
  // the rel string itself is the only input that works for both the
  // production default AND every opts.pages-driven test fixture). `ko/`
  // MUST be tested before the bare `tokens/`/`chains/` prefixes — see
  // routeToLeg() in buildStaticSurfaces() below for the same ordering
  // requirement and why a naive fallthrough would misfile KO rels as EN.
  const scannedByFamily = { tokens: 0, chains: 0, koTokens: 0, koChains: 0 };

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
    if (rel.startsWith('ko/chains/')) scannedByFamily.koChains++;
    else if (rel.startsWith('ko/tokens/')) scannedByFamily.koTokens++;
    else if (rel.startsWith('chains/')) scannedByFamily.chains++;
    else scannedByFamily.tokens++; // tokens/ and any opts.pages fixture outside both dirs
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

    // ---------------------------------------------------------------------
    // backlog 184 — level-2 ("resolvable") `?pool=` deep-link liveness.
    // Positioned AFTER the existing level-2/level-3 blocks above (spec's own
    // ordering requirement); a wholly separate, independently neuterable
    // sub-rule (see poolLinkRan's setup above the loop). No-op per page when
    // poolLinkRan is false.
    //
    // backlog 197 — DELIBERATE OMISSION, EN-only: also no-op for any `ko/`
    // rel. Spec 197 evidence 5 measured the KO half emitting an IDENTICAL
    // `?pool=` id set to EN (42,604 links, 3,696 distinct ids) — the two
    // language surfaces link the same live pools, so re-resolving the KO
    // half's ids buys zero additional liveness coverage and doubles the
    // live-fetch cost for a duplicate verdict. This is 196's "port the part
    // whose precondition holds" rule in reverse: THIS sub-rule's own
    // precondition (a distinct id set worth resolving) does not hold for KO,
    // so it deliberately stays unported, made legible via
    // poolLinkLiveness.scope === 'en' below rather than silently narrowed.
    if (!rel.startsWith('ko/')) {
      // backlog 206 — ONE extraction per page, feeding BOTH the scan-wide
      // rotation population (deepLinkIds, shape-filtered, unconditional) and
      // the pool-link-liveness sub-rule below (pageDeepLinkIds, unfiltered,
      // gated on poolLinkRan) — exactly the pre-206 inline parse, just
      // hoisted into extractDeepLinkPoolIds() (see its own comment) so there
      // is exactly one `?pool=`-extraction implementation in this file.
      const pageIds = extractDeepLinkPoolIds(html);
      for (const id of pageIds) { if (POOL_ID_UUID_RE.test(id)) deepLinkIds.add(id); }

      // Distinct `?pool=` ids this page LINKS TO, from owned home-path hrefs
      // — unfiltered (byte-identical to the pre-206 inline `pageDeepLinkIds`
      // build): the liveness classification below needs to SEE a malformed
      // id too, to classify it 'contract' rather than silently dropping it.
      const pageDeepLinkIds = poolLinkRan ? new Set(pageIds) : null;

      if (poolLinkRan && pageDeepLinkIds.size > 0) {
        // Ids the page's own pool-row anchors point at — for the contract
        // sub-rule's "a link whose id the page's own body never backs" test.
        // A second small pass over HTML_ANCHOR_TAG_RE (rule (b) above already
        // makes one, but rule (b) checks TARGET SHAPE, not the id itself, and
        // doesn't retain the ids it saw) — cleaner than threading an id set
        // out of rule (b)'s loop, per this item's own spec.
        const pageAnchorIds = new Set();
        for (const m of html.matchAll(HTML_ANCHOR_TAG_RE)) {
          const tag = m[0];
          if (!POOL_ROW_ANCHOR_CLASSES.some((c) => anchorHasClass(tag, c))) continue;
          const hrefRaw = anchorAttr(tag, 'href');
          if (!hrefRaw) continue;
          const aSuffix = ownedHtmlLinkSuffix(hrefRaw);
          if (aSuffix === null) continue;
          const aPath = ownedLinkPath(aSuffix);
          if (aPath !== '' && aPath !== '/') continue;
          const aPairs = linkQueryPairs(aSuffix);
          if (aPairs.has('pool') && aPairs.get('pool')) pageAnchorIds.add(aPairs.get('pool'));
        }

        const pageContractIds = [];
        const pageStaleIds = [];
        const pageDriftIds = [];

        for (const id of pageDeepLinkIds) {
          poolLinkScanIds.add(id); // scan-level distinct-id denominator (spec's own 4/3,677 framing)

          let cls;
          if (!POOL_ID_UUID_RE.test(id) || !pageAnchorIds.has(id)) {
            // contract: malformed uuid, OR an id the page's own body never
            // backs — repo-decidable, invariant to live data (181's own
            // definition, reused verbatim).
            cls = 'contract';
          } else if (livePoolIdsSet.has(id)) {
            cls = 'ok';
          } else {
            // Dead (absent from live DefiLlama). Class depends only on THIS
            // page's own visible freshness signal — cta181.parseLastUpdatedDate
            // and cta181.STALE_AFTER_DAYS reused verbatim (never re-typed).
            const dateInfo = cta181.parseLastUpdatedDate(html);
            let stale;
            if (!dateInfo) {
              stale = true; // conservative default (181's own rule): can't prove freshness
            } else {
              const ageDays = Math.floor((poolLinkTodayMs - dateInfo.ms) / MS_PER_DAY_184);
              stale = ageDays > cta181.STALE_AFTER_DAYS;
            }
            cls = stale ? 'stale' : 'drift';
          }

          if (cls === 'contract') pageContractIds.push(id);
          else if (cls === 'stale') pageStaleIds.push(id);
          else if (cls === 'drift') pageDriftIds.push(id);

          // Worst-classification-wins at id level (contract > stale > drift >
          // ok) — an id normally appears on one page only, but a fatal
          // classification anywhere must never be masked by an 'ok' seen
          // elsewhere.
          const prevCls = poolLinkIdClass.get(id);
          if (!prevCls || POOL_LINK_CLASS_RANK[cls] > POOL_LINK_CLASS_RANK[prevCls]) poolLinkIdClass.set(id, cls);
        }

        // At most ONE suspect per page per class (169/172's convention) —
        // contract and stale are ALWAYS emitted (fatal at any count); drift
        // is a CANDIDATE only, decided after the whole scan against the
        // budget (see the post-loop block below).
        if (pageContractIds.length > 0) {
          const examples = pageContractIds.slice(0, 3).map((id) => `"${id}"`);
          let detail = `${pageContractIds.length} "?pool=" deep link id(s) fail contract (malformed uuid, or not backed by this page's own tp-pool-link/cp-pool-link anchors) — e.g. ${examples.join(', ')}`;
          if (pageContractIds.length > examples.length) detail += ` (+${pageContractIds.length - examples.length} more)`;
          suspects.push({ rel, slug, signal: 'pool-link-liveness', severity: PRESCAN_SIGNALS['pool-link-liveness'], detail });
        }
        if (pageStaleIds.length > 0) {
          poolLinkDeadPages.add(rel);
          const examples = pageStaleIds.slice(0, 3).map((id) => `"${id}"`);
          let detail = `${pageStaleIds.length} "?pool=" deep link id(s) are dead (absent from live DefiLlama) on a page whose own "Last updated" date is stale (> ${cta181.STALE_AFTER_DAYS} day(s) old, or unparseable) — e.g. ${examples.join(', ')}`;
          if (pageStaleIds.length > examples.length) detail += ` (+${pageStaleIds.length - examples.length} more)`;
          suspects.push({ rel, slug, signal: 'pool-link-liveness', severity: PRESCAN_SIGNALS['pool-link-liveness'], detail });
        }
        if (pageDriftIds.length > 0) {
          poolLinkDeadPages.add(rel);
          poolLinkDriftCandidates.push({ rel, slug, ids: pageDriftIds });
        }
      }
    }
  }

  // backlog 184 — resolve the level-2 pool-link-liveness verdict over the
  // WHOLE scan, reusing cta181.verdictFor() verbatim (never re-implementing
  // the budget arithmetic, never a second DRIFT_BUDGET_FRACTION literal).
  // `scannedWithCta` is 181's own parameter name (pages, on that surface) —
  // here it is fed the GLOBALLY DISTINCT deep-link id count instead, per this
  // spec's own "4/3,677" framing (the denominator this item measures against
  // is ids, not pages) — an honest reuse, not a silent one.
  let poolLinkLiveness;
  if (!poolLinkRan) {
    poolLinkLiveness = {
      ran: false, reason: poolLinkReason,
      checkedIds: 0, deadIds: 0, pagesAffected: 0,
      contract: 0, stale: 0, drift: 0, allowance: 0, ok: true,
      // backlog 197 — legible even when the sub-rule never ran at all (e.g.
      // opts.livePoolIds never supplied): the KO omission is a standing
      // decision, not a side effect of this particular call not requesting
      // liveness, so `scope` is stamped unconditionally below too.
      scope: 'en'
    };
  } else {
    let contractCount = 0, staleCount = 0, driftCount = 0;
    for (const cls of poolLinkIdClass.values()) {
      if (cls === 'contract') contractCount++;
      else if (cls === 'stale') staleCount++;
      else if (cls === 'drift') driftCount++;
    }
    const verdict = cta181.verdictFor({
      contractCount, staleCount, driftCount,
      scannedWithCta: poolLinkScanIds.size
    });
    // Drift suspects are emitted ONLY when the scan-wide drift count exceeds
    // the budget (the exact comparison verdictFor() makes internally) — under
    // budget, drift is reported in poolLinkLiveness only, never as a suspect
    // (this is what keeps today's corpus green per the spec).
    if (driftCount > verdict.allowance) {
      for (const cand of poolLinkDriftCandidates) {
        const examples = cand.ids.slice(0, 3).map((id) => `"${id}"`);
        let detail = `${cand.ids.length} "?pool=" deep link id(s) are dead (absent from live DefiLlama) on a fresh page — drift, but scan-wide drift ${driftCount}/${poolLinkScanIds.size} exceeds the ${(cta181.DRIFT_BUDGET_FRACTION * 100).toFixed(1)}% budget — e.g. ${examples.join(', ')}`;
        if (cand.ids.length > examples.length) detail += ` (+${cand.ids.length - examples.length} more)`;
        suspects.push({ rel: cand.rel, slug: cand.slug, signal: 'pool-link-liveness', severity: PRESCAN_SIGNALS['pool-link-liveness'], detail });
      }
    }
    poolLinkLiveness = {
      ran: true, reason: null,
      checkedIds: poolLinkScanIds.size,
      deadIds: staleCount + driftCount,
      pagesAffected: poolLinkDeadPages.size,
      contract: contractCount, stale: staleCount, drift: driftCount,
      allowance: verdict.allowance, ok: verdict.ok,
      // backlog 197 — DELIBERATE OMISSION made legible: every id/page counted
      // above came from a non-`ko/` rel only (see the `!rel.startsWith('ko/')`
      // guard above the loop) — spec 197 evidence 5 measured the KO half
      // emitting an identical id set, so re-resolving it would duplicate
      // every finding for zero new coverage, not silently skip real work.
      scope: 'en'
    };
  }

  // P0-first, then rel — deterministic, independent of fs.readdirSync order
  // (already sorted per-dir by listLeafPages, but the two dirs are concatenated).
  suspects.sort((a, b) => {
    const rank = (sev) => (sev === 'P0' ? 0 : 1);
    if (rank(a.severity) !== rank(b.severity)) return rank(a.severity) - rank(b.severity);
    return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0;
  });

  // backlog 184 — extends the pre-existing { scanned, suspects } shape
  // additively; every caller that destructures only { scanned, suspects }
  // (every pre-184 call site) keeps working unchanged.
  // backlog 197 — `scannedByFamily` is the same additive extension: `scanned`
  // itself stays the single combined total (spec 197 §"Change" item 4:
  // `prescan.scanned` stays one number), and every caller ignoring the new
  // key keeps working unchanged.
  // backlog 206 — `deepLinkPoolIds` (sorted, deduped, shape-filtered) is the
  // same additive extension: the pool-detail rotation's widened candidate
  // leg, sourced from the SAME estate scan this function already does for
  // pool-link-liveness, never a second pass over the pages.
  return { scanned, suspects, poolLinkLiveness, scannedByFamily, deepLinkPoolIds: [...deepLinkIds].sort() };
}

// No-suspects/prescan-disabled shape — always the same shape whether prescan
// ran and found nothing, or didn't run at all, so callers never need to
// null-check `result.prescan`.
function emptyPrescanResult() {
  return {
    scanned: 0, suspectCount: 0, bySignal: {}, promoted: [],
    // backlog 184 — same "never null-check" contract as the fields above.
    poolLinkLiveness: {
      ran: false, reason: 'not requested',
      checkedIds: 0, deadIds: 0, pagesAffected: 0,
      contract: 0, stale: 0, drift: 0, allowance: 0, ok: true,
      scope: 'en' // backlog 197 — see prescanStaticPages()'s own comment
    },
    // backlog 197 — same "never null-check" contract, zeroed for the same
    // disabled/prescan-off cases the other fields above already cover.
    scannedByFamily: { tokens: 0, chains: 0, koTokens: 0, koChains: 0 },
    // backlog 206 — same "never null-check" contract: prescan disabled/
    // unrun/override means the deep-linked rotation leg has nothing to draw
    // from, made explicit as an empty array rather than an absent key.
    deepLinkPoolIds: []
  };
}

// Builds the static-page surface list (spec 154 Design A + spec 157 prescan
// promotion + backlog 196 never-audited-first rotation). `opts.staticPages` /
// `opts.staticSample` / `opts.staticSeed` / `opts.prescan` / `opts.prescanMax`
// / `opts.staticRotationState` / `opts.staticRotationStatePath` mirror the
// env vars, opts wins — the same override convention as every other knob in
// this file (port, snapshotPath, outPath). Returns `{ surfaces, prescan,
// prescanFindings, prescanSuspects, staticRotation, staticRotationState,
// staticRotationStatePath }` — `prescanSuspects` (added backlog 171) is the
// same anchor-excluded suspect list the aggregate `prescanFindings` above
// were counted from, exposed so runAudit() can reconcile each aggregate
// finding against what its own promoted suspects actually rendered.
// `staticRotation`/`staticRotationState`/`staticRotationStatePath` (backlog
// 196) mirror `poolRotation`/`rotationState`/`rotationStatePath` from
// buildPoolSurfaces() below — extending this EXISTING return shape, never
// reshaping it, since runAudit() and four tests destructure it.
// backlog 197 — `staticRotation`/`staticRotationState` gain two more legs,
// `koTokens`/`koChains`, mirroring `tokens`/`chains` exactly (own `seen` set,
// own candidate population, own budget slice — design decision (a), see
// specs/197-notes.md). No new opts knob was needed: `opts.staticSample` now
// governs the COMBINED EN+KO budget (split inside, see `enSampleSize`/
// `koSampleSize` below), and `opts.staticRotationState`/
// `opts.staticRotationStatePath` already generically thread whatever shape
// is given/read — this item only widens what that shape carries.
function buildStaticSurfaces(opts) {
  const overrideRaw = opts.staticPages || process.env.AUDIT_STATIC_PAGES;
  if (overrideRaw) {
    // Explicit override (tests / positive control): used verbatim, replaces
    // the anchor + rotation entirely (spec 154 Design A). First entry keeps
    // the anchor name `static-page`; further entries use the sampled naming
    // so surfacesCovered stays self-describing either way. Prescan is OFF in
    // this mode (spec 157 B.2) so existing override-based controls stay
    // exactly as predictable as before this item.
    const overrideEntries = overrideRaw.split(',').map((s) => s.trim()).filter(Boolean)
      .map((rel, i) => {
        const normalized = rel.startsWith('/') ? rel : '/' + rel;
        const name = i === 0 ? 'static-page' : `static-page:${slugFromRel(normalized)}`;
        return { name, url: normalized, kind: 'static', width: 1280 };
      });
    // backlog 185 leg C — a nonexistent override entry is still dropped
    // silently (same behaviour as before this item: no throw, no finding, no
    // exit-code path), but now names the dropped path on stderr so a
    // typo'd/removed override page is observable instead of the run quietly
    // proceeding as if zero pages were requested.
    const surfaces = overrideEntries.filter((s) => {
      const exists = fs.existsSync(path.join(ROOT, s.url));
      if (!exists) console.error(`[audit] static-page override entry not found on disk, dropping: ${s.url}`);
      return exists;
    });
    // backlog 196 — override mode is used verbatim, exactly like the pool
    // leg's AUDIT_POOL_IDS override: no rotation state is read or written in
    // this mode. `staticRotation` still carries the same disabled/empty
    // shape emptyPoolRotationResult() gives the pool leg, so a caller never
    // has to null-check result.staticRotation.
    // backlog 197 — koTokens/koChains added to the disabled shape for the
    // same never-null-check reason; override mode covers ALL rotation legs
    // uniformly (AUDIT_STATIC_PAGES was always a whole-mechanism bypass, not
    // an EN-only one).
    return {
      surfaces, prescan: emptyPrescanResult(), prescanFindings: [], prescanSuspects: [],
      staticRotation: {
        tokens: emptyStaticRotationLegResult(), chains: emptyStaticRotationLegResult(),
        koTokens: emptyStaticRotationLegResult(), koChains: emptyStaticRotationLegResult()
      },
      staticRotationState: null, staticRotationStatePath: null
    };
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
    // backlog 184 — thread the level-2 pool-link-liveness inputs straight
    // through; every other production default here is untouched.
    const scan = prescanStaticPages({ livePoolIds: opts.livePoolIds, livePoolsError: opts.livePoolsError });
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

    prescan = {
      scanned: scan.scanned, suspectCount: suspects.length, bySignal, promoted: promotedRels.map(slugFromRel),
      poolLinkLiveness: scan.poolLinkLiveness, // backlog 184
      // backlog 197 — threaded through unchanged from prescanStaticPages()'s
      // own return; lands in the findings JSON so a reader can tell
      // EN-clean from KO-clean without reading code (spec 197 acceptance).
      // `scanned` above stays the single combined total on purpose.
      scannedByFamily: scan.scannedByFamily,
      // backlog 206 — threaded through unchanged from prescanStaticPages()'s
      // own return; runAudit() reads this to widen buildPoolSurfaces()'s
      // rotation candidate population.
      deepLinkPoolIds: scan.deepLinkPoolIds
    };

    // backlog 184 — a fetch failure must NOT silently pass the gate: when the
    // sub-rule was requested (opts.livePoolsError set) but could not run,
    // surface it as its own blocking finding, distinct from "not requested"
    // (which is the normal off-by-default state and must stay silent).
    if (scan.poolLinkLiveness.ran === false && scan.poolLinkLiveness.reason && scan.poolLinkLiveness.reason !== 'not requested') {
      prescanFindings.push(finding('static-prescan', 'n/a', 'static-prescan:pool-link-liveness-unrun', 'P1',
        `the ?pool= deep-link liveness check did not run: ${scan.poolLinkLiveness.reason}`));
    }
  }

  for (const rel of promotedRels) {
    surfaces.push({ name: `static-page:${slugFromRel(rel)}`, url: '/' + rel, kind: 'static', width: 1280 });
  }

  // ---- Uniform rotation fills the REMAINING budget -------------------------
  const promotedSet = new Set(promotedRels);
  const remainingSampleSize = Math.max(0, sampleSize - promotedRels.length);

  // backlog 197 — EN/KO split of the remaining budget, BEFORE the pre-
  // existing 2:1 token:chain split is applied within each half. This is
  // spec 197 design decision 5's explicit arithmetic: EN half gets the
  // ceil() so an odd remainder favors EN (the pre-197 population, never
  // shrunk below its old throughput), KO half gets the rest. At the new
  // DEFAULT_STATIC_SAMPLE=12 default this gives EN half=6 / KO half=6 —
  // i.e. EN's own 2:1 split below (tokenCount=ceil(6*2/3)=4, chainCount=2)
  // is BYTE-IDENTICAL to origin/main's pre-197 output (which split 6 total
  // the same way), and KO gets that same 4+2 for the first time. See
  // specs/197-notes.md for the measured wall-clock this budget choice rests on.
  const enSampleSize = Math.ceil(remainingSampleSize / 2);
  const koSampleSize = remainingSampleSize - enSampleSize;

  // Default (EN half=6) = up to 4 token + 2 chain (2:1 ratio), falling back
  // to whatever exists on either side (spec 154 Design A) — unchanged math,
  // just applied to `enSampleSize` instead of the whole `remainingSampleSize`.
  const tokenCount = Math.ceil((enSampleSize * 2) / 3);
  const chainCount = enSampleSize - tokenCount;
  // backlog 197 — same 2:1 ratio, applied to the KO half.
  const koTokenCount = Math.ceil((koSampleSize * 2) / 3);
  const koChainCount = koSampleSize - koTokenCount;

  // Exclude the anchor's own leaf AND any promoted leaf so the uniform
  // rotation never re-samples a page already covered another way.
  const tokenLeaves = listLeafPages('tokens').filter((r) => r !== anchorLeafRel && !promotedSet.has(r));
  const chainLeaves = listLeafPages('chains').filter((r) => r !== anchorLeafRel && !promotedSet.has(r));
  // backlog 197 — no anchor exclusion needed: the anchor is always an EN
  // leaf (`/tokens/usdc.html` or `/chains/ethereum.html`, see above), never
  // a `ko/` path, so it can never collide with a KO candidate list.
  const koTokenLeaves = listLeafPages('ko/tokens').filter((r) => !promotedSet.has(r));
  const koChainLeaves = listLeafPages('ko/chains').filter((r) => !promotedSet.has(r));

  // ---- Never-audited-first rotation (backlog 196, extended by 197) --------
  // Reuses computeRotation() verbatim (backlog 183 leg (b)'s pool-detail
  // machinery, unmodified) — called per leg, so the 2:1 token:chain budget
  // split above stays independently-sized picks per leg (spec 196's
  // rejected alternative: a single combined rotation starves chains ~96:4
  // against 2,108 token candidates). Same seed namespacing convention as
  // every other picker in this file (`${seed}:tokens` / `${seed}:chains` /
  // `${seed}:koTokens` / `${seed}:koChains`), so no leg ever picks in
  // lockstep with another (spec 197 design decision 4's own requirement).
  const staticRotationStatePath = opts.staticRotationStatePath || process.env.AUDIT_STATIC_ROTATION_STATE || DEFAULT_STATIC_ROTATION_STATE_PATH;
  // opts.staticRotationState lets tests drive this as a pure function with no
  // fs read at all — mirrors opts.rotationState for the pool leg exactly.
  // backlog 197 — re-normalized through normalizeRotationLeg() here (not just
  // trusted as-is) so BOTH sources feeding this variable are safe: a real
  // readStaticRotationState() result is already normalized (idempotent to
  // re-normalize), but a test-injected opts.staticRotationState may still be
  // pre-197 shaped (only `{tokens, chains}`, no koTokens/koChains — every
  // pre-197 caller in this file's own test suite is exactly that shape) —
  // normalizeRotationLeg(undefined) degrades those missing legs to fresh
  // cycle-0/empty-seen, never throws.
  const priorStaticRotationStateRaw = opts.staticRotationState || readStaticRotationState(staticRotationStatePath);
  const priorStaticRotationState = {
    tokens: normalizeRotationLeg(priorStaticRotationStateRaw.tokens),
    chains: normalizeRotationLeg(priorStaticRotationStateRaw.chains),
    koTokens: normalizeRotationLeg(priorStaticRotationStateRaw.koTokens),
    koChains: normalizeRotationLeg(priorStaticRotationStateRaw.koChains)
  };

  const tokenRot = computeRotation(tokenLeaves, tokenCount, `${seed}:tokens`, priorStaticRotationState.tokens);
  const chainRot = computeRotation(chainLeaves, chainCount, `${seed}:chains`, priorStaticRotationState.chains);
  const koTokenRot = computeRotation(koTokenLeaves, koTokenCount, `${seed}:koTokens`, priorStaticRotationState.koTokens);
  const koChainRot = computeRotation(koChainLeaves, koChainCount, `${seed}:koChains`, priorStaticRotationState.koChains);
  const tokenPicks = tokenRot.picked;
  const chainPicks = chainRot.picked;
  const koTokenPicks = koTokenRot.picked;
  const koChainPicks = koChainRot.picked;

  for (const rel of tokenPicks.concat(chainPicks).concat(koTokenPicks).concat(koChainPicks)) {
    surfaces.push({ name: `static-page:${slugFromRel(rel)}`, url: '/' + rel, kind: 'static', width: 1280 });
  }

  // Everything rendered THIS tick — the anchor leaf, every prescan-promoted
  // leaf, and every rotation pick — is recorded into the appropriate leg's
  // `seen` (spec 196 §4, mirrors buildPoolSurfaces()'s `thisRunPoolIds`
  // rule): a page rendered for ANY reason has been audited, so it must not
  // be re-picked by rotation until the cycle wraps. Anchor/promoted rels can
  // land in ANY of the four dirs (prescanStaticPages() scans all four
  // together as of backlog 197), so they're routed to their leg by path
  // prefix; rotation picks are already leg-pure by construction.
  const thisRunTokenRels = tokenPicks.slice();
  const thisRunChainRels = chainPicks.slice();
  const thisRunKoTokenRels = koTokenPicks.slice();
  const thisRunKoChainRels = koChainPicks.slice();
  // backlog 197 — `ko/` MUST be tested before the bare `tokens/`/`chains/`
  // prefixes: a naive `startsWith('chains/')` never matches `ko/chains/…`
  // (harmless on its own), but a naive fallthrough order — checking the bare
  // EN prefixes first and defaulting everything else to `tokens` — would
  // silently misfile every KO anchor/promoted rel into the EN tokens leg's
  // `seen` set. This is the load-bearing correctness detail spec 197 §8
  // calls out by name.
  const routeToLeg = (rel) => {
    if (!rel) return;
    if (rel.startsWith('ko/chains/')) thisRunKoChainRels.push(rel);
    else if (rel.startsWith('ko/tokens/')) thisRunKoTokenRels.push(rel);
    else if (rel.startsWith('chains/')) thisRunChainRels.push(rel);
    else thisRunTokenRels.push(rel); // tokens/ (and the anchor's default 'tokens/usdc.html')
  };
  routeToLeg(anchorLeafRel);
  for (const rel of promotedRels) routeToLeg(rel);

  // backlog 196 — deliberately NOT porting 192's `baseSeen` reconciliation:
  // that machinery exists only because the POOL leg's rotation picks can be
  // SKIPPED under the AUDIT_TIME_BUDGET_MS wall-clock guard (an un-rendered
  // pick must not be recorded as seen). The static leg has no such
  // time-budget skip — `rotationPick`-gated skipping in runAudit()'s render
  // loop applies to pool-detail surfaces only — so every pick computed here
  // really does get rendered, and crediting it as seen at build time is
  // already honest. If a time-budget guard is ever added to the static leg,
  // this precondition stops holding and the reconciliation becomes required.
  // backlog 197 — same reasoning applies unchanged to the two new KO legs
  // below: they share the same render loop, same no-time-budget-skip fact.
  const tokenBaseSeen = tokenRot.wrapped ? [] : priorStaticRotationState.tokens.seen.slice();
  let tokenNewSeen = tokenBaseSeen.concat(thisRunTokenRels.filter((r) => !tokenBaseSeen.includes(r)));
  if (tokenNewSeen.length > STATIC_ROTATION_SEEN_CAP) tokenNewSeen = tokenNewSeen.slice(tokenNewSeen.length - STATIC_ROTATION_SEEN_CAP); // drop-oldest

  const chainBaseSeen = chainRot.wrapped ? [] : priorStaticRotationState.chains.seen.slice();
  let chainNewSeen = chainBaseSeen.concat(thisRunChainRels.filter((r) => !chainBaseSeen.includes(r)));
  if (chainNewSeen.length > STATIC_ROTATION_SEEN_CAP) chainNewSeen = chainNewSeen.slice(chainNewSeen.length - STATIC_ROTATION_SEEN_CAP); // drop-oldest

  const koTokenBaseSeen = koTokenRot.wrapped ? [] : priorStaticRotationState.koTokens.seen.slice();
  let koTokenNewSeen = koTokenBaseSeen.concat(thisRunKoTokenRels.filter((r) => !koTokenBaseSeen.includes(r)));
  if (koTokenNewSeen.length > STATIC_ROTATION_SEEN_CAP) koTokenNewSeen = koTokenNewSeen.slice(koTokenNewSeen.length - STATIC_ROTATION_SEEN_CAP); // drop-oldest

  const koChainBaseSeen = koChainRot.wrapped ? [] : priorStaticRotationState.koChains.seen.slice();
  let koChainNewSeen = koChainBaseSeen.concat(thisRunKoChainRels.filter((r) => !koChainBaseSeen.includes(r)));
  if (koChainNewSeen.length > STATIC_ROTATION_SEEN_CAP) koChainNewSeen = koChainNewSeen.slice(koChainNewSeen.length - STATIC_ROTATION_SEEN_CAP); // drop-oldest

  const staticRotationState = {
    schemaVersion: 1,
    tokens: { cycle: tokenRot.cycle, seen: tokenNewSeen },
    chains: { cycle: chainRot.cycle, seen: chainNewSeen },
    // backlog 197 — additive legs, same shape as tokens/chains above.
    koTokens: { cycle: koTokenRot.cycle, seen: koTokenNewSeen },
    koChains: { cycle: koChainRot.cycle, seen: koChainNewSeen }
  };

  const staticRotation = {
    tokens: {
      cycle: tokenRot.cycle, seenCount: tokenNewSeen.length, candidateCount: tokenLeaves.length,
      picked: tokenPicks.slice(), wrapped: tokenRot.wrapped, sampleSize: tokenCount
    },
    chains: {
      cycle: chainRot.cycle, seenCount: chainNewSeen.length, candidateCount: chainLeaves.length,
      picked: chainPicks.slice(), wrapped: chainRot.wrapped, sampleSize: chainCount
    },
    // backlog 197 — reported next to tokens/chains, same shape, so KO
    // coverage is separately reportable (spec 197 design decision 4).
    koTokens: {
      cycle: koTokenRot.cycle, seenCount: koTokenNewSeen.length, candidateCount: koTokenLeaves.length,
      picked: koTokenPicks.slice(), wrapped: koTokenRot.wrapped, sampleSize: koTokenCount
    },
    koChains: {
      cycle: koChainRot.cycle, seenCount: koChainNewSeen.length, candidateCount: koChainLeaves.length,
      picked: koChainPicks.slice(), wrapped: koChainRot.wrapped, sampleSize: koChainCount
    }
  };

  return { surfaces, prescan, prescanFindings, prescanSuspects, staticRotation, staticRotationState, staticRotationStatePath };
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
  // backlog 215 — kpi-nonfinite is only APPLICABLE to a record that carries a
  // `kpis` object (snapshot records only; live-shape deep-linked records
  // never have one — see loadLivePoolIds()'s own comment). Counted here,
  // alongside the signal check itself, so the caller can state "clean" with
  // its true denominator instead of implying every scanned record was
  // checked (the 197 trap: a scan that quietly checks less than its name
  // implies).
  let kpiApplicable = 0;

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
      kpiApplicable++;
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

  return { scanned: list.length, suspects, bySignal, kpiApplicable };
}

// No-suspects/disabled shape — same role as emptyPrescanResult()/
// emptyTextSurfaceResult(): callers never need to null-check result.poolPrescan.
function emptyPoolPrescanResult() {
  return {
    scanned: 0, suspectCount: 0, bySignal: {}, promoted: [],
    // backlog 215 — same "never null-check" contract as the fields above:
    // always present, whether the prescan ran over a real union or didn't
    // run at all. scannedByLeg keeps "clean" honest about which population
    // (snapshot vs. deep-linked-live) contributed the scanned count;
    // kpiApplicable/kpiApplicableNote keep kpi-nonfinite's "checked, clean"
    // distinct from "not applicable, no kpis on this record" (the 197 trap);
    // deepLinkSource carries the SAME degrade/status reason string
    // poolRotation.deepLinkSource reports, reused verbatim, never a second
    // copy of that prose.
    scannedByLeg: { snapshot: 0, deepLinkedLive: 0 },
    kpiApplicable: 0,
    kpiApplicableNote: '',
    deepLinkSource: null
  };
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
// item 194 — additionally returns `unreachable: Set|null`: the generator's
// (spec 194 §3(A)) sorted `unreachable` string array, as a Set, when the
// artifact carries one; `null` when the field is absent or malformed (an OLD
// artifact — pre-194, or a hand-broken one — must never be able to produce a
// downgrade; classifyCtaKind()'s `upstreamUnreachable === true` strict check
// is exactly what makes that safe on this end). `keys` shape is unchanged.
// `overridePath` (test-only; mirrors the opts/env override convention every
// other disk read in this file already uses, e.g. AUDIT_SNAPSHOT_PATH) lets
// a test drive the pool CTA driver's rendered path against an artifact
// lacking `unreachable` WITHOUT ever touching the committed
// data/protocol-urls.json — the non-vacuity guard (criterion 8) needs a real
// rendered run where the evidence is genuinely absent, not just a pure-fn
// fixture. Defaults to the real committed path when omitted.
function readBakedProtocolUrls(overridePath) {
  try {
    const raw = fs.readFileSync(overridePath || path.join(ROOT, 'data', 'protocol-urls.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.urls || typeof parsed.urls !== 'object') return null;
    const unreachable = Array.isArray(parsed.unreachable) && parsed.unreachable.every((k) => typeof k === 'string')
      ? new Set(parsed.unreachable)
      : null;
    return { keys: new Set(Object.keys(parsed.urls)), unreachable };
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

// backlog 183 leg (a), item 194 — the classification decision rule. Branch
// ORDER is load-bearing: each of the five kinds is reachable through exactly
// one explicit check, and both downgrades (`environment`, and item 194's
// `upstream-null`) sit BEFORE the final `defect` fallthrough but never AS the
// fallthrough itself, so neither can become a silent default (spec 183's
// non-vacuity contract — a classifier that can only ever emit a downgrade has
// removed the gate, not fixed it).
//   1. disk-side undeterminable (either reader above returned null) OR the
//      run-side signal for the baked fetch is itself indeterminate
//      ('unknown' — a defensive state, not the common "never requested"
//      case, see bakedRunOutcome below) -> undeterminable, stays P1.
//   2. no disk-side tier resolves a URL anywhere, AND positive disk-side
//      evidence says the upstream protocols feed itself publishes no URL for
//      this project (`upstreamUnreachable === true`, strict — see below)
//      -> upstream-null, P2, non-blocking (item 194: the real `sdai` case,
//      spec 183 T2 — 182's honest DefiLlama fallback IS the intended render
//      here, not a defect).
//   3. no disk-side tier resolves a URL anywhere, and (2) did not apply ->
//      defect, P1 (a genuine coverage gap — the project is either absent
//      from the upstream feed entirely, or upstreamUnreachable is
//      false/null/omitted).
//   4. a disk-side tier DOES resolve, but THIS run's fetch to our own
//      /data/protocol-urls.json failed, was blocked, or never arrived
//      ('failed' | 'absent') -> environment, P2, non-blocking.
//   5. URL on disk, this run's fetch confirmed ok, CTA still not the real
//      one -> defect, P1 (a genuine bug, not an environment artifact).
// `upstreamUnreachable` is tri-state (`true` / `false` / `null`≡unknown, and
// treated identically to `null` when the argument is omitted entirely) —
// strict `=== true` is load-bearing: an old/malformed artifact
// (readBakedProtocolUrls() returning `unreachable: null`) or a project this
// run's evidence simply doesn't cover must fall through to today's `defect`,
// never silently upgrade to the downgrade. `upstream-null` precedes the
// `environment` check deliberately (spec 194 §3(B)): when upstream has no URL
// to serve at all, a failed baked fetch changes nothing about what the page
// *should* render, so the by-design reading stays correct regardless of this
// run's fetch outcome.
function classifyCtaKind(opts) {
  const diskDeterminable = !!(opts && opts.diskDeterminable);
  const diskTiers = (opts && opts.diskTiers) || [];
  const bakedRunOutcome = (opts && opts.bakedRunOutcome) || 'unknown';
  const upstreamUnreachable = opts && opts.upstreamUnreachable;
  if (!diskDeterminable || bakedRunOutcome === 'unknown') return 'undeterminable';
  if (diskTiers.length === 0 && upstreamUnreachable === true) return 'upstream-null';
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

// backlog 196 — the ONE place a raw `{cycle, seen}` rotation leg gets
// validated/defaulted, shared by readRotationState() (pool leg, single leg
// per file) and readStaticRotationState() (static leg, two legs — tokens/
// chains — per file) below, so the two readers can never drift (spec 196 §3:
// "factor, do not duplicate, the state normalization"). Degrades to a fresh
// cycle-0/empty-seen leg on any malformed input (not an object, no `seen`
// array, non-string entries) — never throws.
function normalizeRotationLeg(leg) {
  if (leg && typeof leg === 'object' && Array.isArray(leg.seen)) {
    return { cycle: Number(leg.cycle) || 0, seen: leg.seen.filter((x) => typeof x === 'string') };
  }
  return { cycle: 0, seen: [] };
}

// Reads the committed rotation state (spec 183 §1 shape), defaulting to a
// fresh cycle-0/empty-seen state on any read/parse failure (missing file on
// a first run, corrupt file, wrong shape) — never throws, mirrors every
// other prescan reader's degrade-to-empty convention. External contract
// (exported, used by tests) is unchanged by the backlog 196 refactor above —
// same return shape, same degrade cases.
function readRotationState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    const leg = normalizeRotationLeg(parsed);
    return { schemaVersion: 1, cycle: leg.cycle, seen: leg.seen };
  } catch (e) { /* fall through to fresh state */ }
  return { schemaVersion: 1, cycle: 0, seen: [] };
}

// backlog 196 — static-leg counterpart, two independently-normalized legs
// (`tokens`, `chains`) in one file, spec 196's documented shape:
// `{ schemaVersion, tokens: {cycle, seen}, chains: {cycle, seen} }`. Degrades
// EACH leg independently via normalizeRotationLeg() — a corrupt/missing
// `chains` leg must not take down an otherwise-valid `tokens` leg, and vice
// versa. Missing file, corrupt JSON, `{}`, `{tokens: 5}`, and
// `{tokens: {seen: "nope"}}` all degrade to a fresh cycle-0/empty-seen state
// for whichever leg(s) are malformed — never throws (spec 196 acceptance 8).
//
// backlog 197 — additive: two more legs, `koTokens`/`koChains`, normalized
// the SAME way via the SAME normalizeRotationLeg() (spec 197 design decision
// 6: "purely additive... schemaVersion stays 1"). This is the one place a
// state file written BEFORE this item (today's committed file — EN legs
// only) gets read: `parsed.koTokens`/`parsed.koChains` are `undefined` on
// that file, and normalizeRotationLeg(undefined) already falls through to
// its own `{cycle: 0, seen: []}` default (see its doc comment above) —
// exactly the required "degrade to fresh cycle-0/empty-seen legs WITHOUT
// touching the EN legs" behaviour, for free, with no special-casing here.
function readStaticRotationState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        schemaVersion: 1,
        tokens: normalizeRotationLeg(parsed.tokens),
        chains: normalizeRotationLeg(parsed.chains),
        koTokens: normalizeRotationLeg(parsed.koTokens),
        koChains: normalizeRotationLeg(parsed.koChains)
      };
    }
  } catch (e) { /* fall through to fresh state */ }
  return {
    schemaVersion: 1,
    tokens: { cycle: 0, seen: [] }, chains: { cycle: 0, seen: [] },
    koTokens: { cycle: 0, seen: [] }, koChains: { cycle: 0, seen: [] }
  };
}

// Disabled/override-mode shape for ONE static-rotation leg — same role as
// emptyPoolRotationResult() (backlog 191/192): lets callers destructure
// `staticRotation.tokens`/`.chains` without ever null-checking.
function emptyStaticRotationLegResult() {
  return { cycle: 0, seenCount: 0, candidateCount: 0, picked: [], wrapped: false, sampleSize: 0 };
}

function emptyPoolRotationResult() {
  // sampleSize: 0 here matches the "rotation disabled/unused" reading (no
  // AUDIT_POOL_IDS-override run ever computes a rotation) — backlog 191, lets
  // the CLI summary's throughput line print an explicit n/a instead of
  // dividing by a hardcoded zero. renderedCount/truncated (backlog 192) stay
  // 0/false for the same reason — nothing was ever picked, so nothing could
  // have been skipped either.
  // backlog 199 — lensSampleSize/lensRendered/lensSkipped/lenses stay 0/{}
  // for the same reason renderedCount/truncated do: no rotation ever ran, so
  // no lens surface was ever built either.
  // backlog 206 — snapshotIds/deepLinkIds/union/reachable/subRailPicked stay
  // 0, deepLinkSource stays a plain "not requested" string, for the exact
  // same "never null-check" reason: no rotation ran, so the population split
  // was never computed either.
  return {
    cycle: 0, seenCount: 0, candidateCount: 0, picked: [], wrapped: false, sampleSize: 0, renderedCount: 0, truncated: false, timeBudgetMs: 0, lensSampleSize: 0, lensRendered: 0, lensSkipped: 0, lenses: {},
    snapshotIds: 0, deepLinkIds: 0, union: 0, reachable: 0, subRailPicked: 0, deepLinkSource: 'not requested'
  };
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
// derivation. Growth is still small and bounded (A7): at 167's original
// shipped defaults, additive growth was `DEFAULT_POOL_PRESCAN_MAX +
// DEFAULT_POOL_SAMPLE` = 2 + 2 = 4, comfortably under `MAX_POOL_SAMPLE` (6).
// backlog 191 raised DEFAULT_POOL_SAMPLE 2 -> 6 (== MAX_POOL_SAMPLE), so that
// comparison no longer held arithmetically: additive growth was 2 + 6 = 8,
// ABOVE MAX_POOL_SAMPLE (6). That was expected and fine then, and the
// underlying point still holds now — MAX_POOL_SAMPLE is a ceiling on the
// rotation leg ALONE (`AUDIT_POOL_SAMPLE`'s clamp), never a bound on the
// promotion+rotation sum; nothing here enforces sum <= MAX_POOL_SAMPLE, so
// whether the sum happens to sit under or over the ceiling is incidental,
// not a contract. backlog 192 raised DEFAULT_POOL_SAMPLE 6 -> 32 and
// MAX_POOL_SAMPLE 6 -> 64: additive growth is now 2 + 32 = 34, which DOES
// once again sit under the new MAX_POOL_SAMPLE (64) — a coincidence of this
// item's specific numbers, not a rule to lean on; a future AUDIT_POOL_SAMPLE
// override can still push the sum arbitrarily above MAX_POOL_SAMPLE exactly
// as 191 already established. "Small and bounded" (A7) still holds in
// absolute terms — 34 extra surfaces per tick is still small relative to the
// ~735-pool candidate population.
// Returns `{ anchorPoolId, extraSurfaces, poolPrescan, poolPrescanFindings,
// poolPrescanSuspects, poolRotation, rotationState, rotationStatePath,
// baseSeen }` — `poolPrescanSuspects` (added backlog 171) is the same
// anchor-excluded suspect list the aggregate `poolPrescanFindings` above
// were counted from, exposed so runAudit() can reconcile each aggregate
// finding against what its own promoted suspects actually rendered (mirrors
// buildStaticSurfaces()'s `prescanSuspects`). `baseSeen` (added backlog 192)
// is documented at its own definition below, next to where it's returned —
// runAudit() needs it to honestly reconcile the wall-clock guard's skips.
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
    // backlog 192: override-mode extraSurfaces carry `poolId` (shape parity
    // with the prescan/rotation paths below) but deliberately NO
    // `rotationPick` marker — this mode is used verbatim, exactly like
    // prescan-promoted surfaces, so the wall-clock guard must never skip it.
    const extraSurfaces = ids.slice(1).map((id) => ({
      name: `pool-detail:${poolIdPrefix(id)}`, url: `/home.html?pool=${encodeURIComponent(id)}`, kind: 'pool', width: 1280, poolId: id
    }));
    // backlog 183 leg (b): override mode is used verbatim, exactly like
    // prescan — no rotation state is read or written in this mode.
    return {
      anchorPoolId, extraSurfaces, poolPrescan: emptyPoolPrescanResult(), poolPrescanFindings: [], poolPrescanSuspects: [],
      poolRotation: emptyPoolRotationResult(), rotationState: null, rotationStatePath: null, baseSeen: null
    };
  }

  // Anchor resolution — unchanged logic, unchanged fallback (spec 167 §2).
  let anchorPoolId = PREFERRED_POOL_ID;
  if (!pools.some((p) => p && p.pool === anchorPoolId)) {
    anchorPoolId = pools.length ? pools[0].pool : null;
    console.error(`[audit] preferred pool id absent from snapshot; using ${anchorPoolId}`);
  }

  // ---- backlog 215 — this whole backlog-206 population block (union +
  // degrade handling) is MOVED UP from its original position, which sat
  // AFTER the prescan block below. Its logic, its console.error degrade
  // notes, and its comments are byte-identical to their pre-215 form —
  // hoisted, never rewritten (spec 215: "reuse it; never a second copy of
  // the set expression") — because the prescan below now ALSO needs
  // `subRailOnlyIds`/`unionIds` to widen its own candidate population, not
  // just the rotation further down. Both consumers read the exact same
  // `unionIds`/`subRailOnlyIds`/`deepLinkSource` computed once, here.
  // ---- backlog 206 — widen the candidate population: union of the snapshot
  // ids and the estate's own `?pool=` deep links, intersected with the live
  // feed. The intersection is a HARD requirement (spec §4), not an
  // optimisation: a deep-linked id with no live record has no fixture to
  // render from, and rendering it would fabricate a dead-end finding (the
  // exact snapshot-shape trap playbooks/product-audit.md warns about). Any
  // of three conditions degrades the deep-linked leg to ZERO candidates,
  // never silently: opts.livePoolIds not a real Set (fetch error, or the
  // opts.poolLiveness===false / AUDIT_POOL_LIVENESS=0 kill switch — runAudit()
  // resolves both into "no Set" before calling here), opts.deepLinkPoolIds
  // empty (static prescan disabled, or override mode, or genuinely zero
  // links), or — the ordinary case — a deep-linked id simply not present in
  // the live feed (dead/decayed pool). `pools` (the snapshot) is untouched;
  // this only widens what the ROTATION leg (never promotion/anchor) draws
  // from — same rotation, wider population (spec §4's own "not a parallel
  // rotation" requirement).
  const snapshotIdsArr = pools.filter((p) => p && p.pool).map((p) => p.pool);
  const snapshotIdsSet = new Set(snapshotIdsArr);
  const deepLinkPoolIdsIn = Array.isArray(opts.deepLinkPoolIds) ? opts.deepLinkPoolIds : [];
  const liveIdsSet = (opts.livePoolIds instanceof Set) ? opts.livePoolIds : null;
  let subRailLiveIds = []; // deep-linked ids confirmed live this tick (may overlap the snapshot)
  let degraded = false;
  let deepLinkSource;
  if (!liveIdsSet) {
    degraded = true;
    deepLinkSource = opts.deepLinkDegradeReason || 'live pool ids unavailable (fetch error, or pool-liveness disabled) — deep-linked leg contributes 0 candidates, rotation is snapshot-only';
    console.error(`[audit] pool-detail rotation: deep-linked leg degraded — ${deepLinkSource}`);
  } else if (deepLinkPoolIdsIn.length === 0) {
    degraded = true;
    deepLinkSource = opts.deepLinkDegradeReason || 'no deep-linked pool ids supplied (static prescan disabled, override mode, or the estate scan found none) — deep-linked leg contributes 0 candidates, rotation is snapshot-only';
    console.error(`[audit] pool-detail rotation: deep-linked leg degraded — ${deepLinkSource}`);
  } else {
    subRailLiveIds = deepLinkPoolIdsIn.filter((id) => liveIdsSet.has(id));
  }
  // Ids the deep-linked leg reaches that the snapshot itself does NOT carry
  // — the actual "sub-rail" additions, used both to build the union and to
  // mark sub-rail surfaces below (spec §7: "set only for ids absent from the
  // snapshot").
  const subRailOnlyIds = new Set(subRailLiveIds.filter((id) => !snapshotIdsSet.has(id)));
  if (!degraded) {
    // Non-degraded case: state BOTH the raw live-confirmed count and the
    // net-new (post-snapshot-overlap) count `poolRotation.deepLinkIds`
    // actually reports below, so a reader never has to reconcile the two by
    // hand (spec 206 evidence: ~420 of the estate's deep links already
    // overlap the snapshot on this checkout).
    deepLinkSource = `${subRailLiveIds.length} of ${deepLinkPoolIdsIn.length} deep-linked ids confirmed live, ${subRailOnlyIds.size} net-new beyond the snapshot`;
  }
  const unionIds = snapshotIdsArr.concat([...subRailOnlyIds]).sort();

  // ---- backlog 215 — full LIVE-shape records for the sub-rail-only ids
  // (`subRailOnlyIds`, just computed above), so the prescan below can run
  // its pure record predicates over them too, not just the snapshot.
  // `opts.livePoolRecords` is the additive opt runAudit() forwards from
  // `liveness.pools` (loadLivePoolIds()'s full records, already fetched —
  // never a second fetch); same test-injection convention as
  // opts.livePools/opts.rotationState elsewhere in this file. A missing
  // record for a confirmed-live id (mismatched test injection, never
  // production — subRailOnlyIds is already ∩ opts.livePoolIds by
  // construction above) is simply skipped, never thrown: that one id is not
  // added to the prescan input, exactly like any other "no data" case this
  // file treats as unable-to-check rather than an error.
  const livePoolRecordsIn = Array.isArray(opts.livePoolRecords) ? opts.livePoolRecords : [];
  const subRailOnlyRecords = [];
  if (subRailOnlyIds.size > 0 && livePoolRecordsIn.length) {
    const livePoolRecordsById = new Map(livePoolRecordsIn.map((p) => [p.pool, p]));
    for (const id of subRailOnlyIds) {
      const rec = livePoolRecordsById.get(id);
      if (rec) subRailOnlyRecords.push(rec);
    }
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

  // backlog 215 — prescan input is now the UNION (snapshot ∪ live records for
  // sub-rail-only deep-linked ids), the same population the rotation below
  // draws from, not the snapshot alone. `pools.length || subRailOnlyRecords.
  // length` (rather than `pools.length` alone) so a caller that injects ONLY
  // the deep-linked leg (pools:[] , a real record set) still gets scanned —
  // matches the rotation's own no-snapshot-required stance below.
  if (prescanEnabled && prescanMax > 0 && (pools.length || subRailOnlyRecords.length)) {
    const prescanInput = pools.concat(subRailOnlyRecords);
    const scan = prescanPools(prescanInput);
    // Never promote the anchor pool — it is already covered by the
    // unchanged four pool-detail* surfaces (mirrors static's anchorLeafRel
    // exclusion).
    const suspects = scan.suspects.filter((s) => s.poolId !== anchorPoolId);
    poolPrescanSuspects = suspects;

    const bySignal = {};
    for (const sig of Object.keys(POOL_PRESCAN_SIGNALS)) bySignal[sig] = 0;
    for (const s of suspects) bySignal[s.signal] = (bySignal[s.signal] || 0) + 1;

    // One aggregate finding per signal with >=1 suspect (mirrors
    // static-prescan:<signal> verbatim in shape and wording). backlog 215:
    // wording updated from "snapshot pools" to "union pools" plus an
    // explicit per-leg split — the old "N of M snapshot pools" phrasing
    // became false the moment M stopped being the snapshot count alone.
    for (const sig of Object.keys(POOL_PRESCAN_SIGNALS)) {
      const hits = suspects.filter((s) => s.signal === sig);
      if (hits.length === 0) continue;
      const examples = hits.slice(0, 10).map((s) => poolIdPrefix(s.poolId));
      poolPrescanFindings.push(finding('pool-prescan', 'n/a', `pool-prescan:${sig}`, POOL_PRESCAN_SIGNALS[sig],
        `${hits.length} of ${scan.scanned} union pools (${pools.length} snapshot + ${subRailOnlyRecords.length} deep-linked-live) match ${sig} — examples: ${examples.join(', ')}`));
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
    // backlog 215 — additive fields: scannedByLeg states the per-leg split
    // honestly (spec §Change item 4); kpiApplicable/kpiApplicableNote make
    // kpi-nonfinite's "not applicable" (live records carry no kpis) explicit
    // rather than silently reading as "checked, clean" (the 197 trap);
    // deepLinkSource reuses the EXACT reason string the population block
    // above computed — the same "falls back to snapshot-only AND SAYS SO"
    // degrade contract 206 already established, never a second copy of it.
    poolPrescan = {
      scanned: scan.scanned, suspectCount: suspects.length, bySignal, promoted: promotedIds.slice(),
      scannedByLeg: { snapshot: pools.length, deepLinkedLive: subRailOnlyRecords.length },
      kpiApplicable: scan.kpiApplicable,
      kpiApplicableNote: `kpi-nonfinite applies only to records carrying a kpis object (${scan.kpiApplicable} of ${scan.scanned} scanned) — snapshot records only; live-only (deep-linked) records carry no kpis and are skipped for this signal, not checked-and-clean.`,
      deepLinkSource
    };
  }

  // backlog 192: `poolId` (the full id, alongside the already-truncated
  // `name`) so runAudit()'s render loop / reconciliation never has to
  // re-derive it from the 8-char prefix (a real collision risk at MAX_POOL_
  // SAMPLE=64 scale that `name` alone would create). Promoted surfaces carry
  // NO `rotationPick` marker — they are never skippable (spec 192 part 2).
  // backlog 215 (THE CORRECTNESS TRAP) — a promoted id can now be a sub-rail
  // id too (the widened prescan can promote an id absent from the snapshot),
  // so mark it `subRail: true` here using the SAME `subRailOnlyIds` set the
  // rotation path below marks its own picks with — one marker, two producers,
  // never two different rules. Unmarked, runAudit() would route the render to
  // the snapshot-derived `liveBody` fixture, which carries no record for a
  // sub-rail id, and the render would fabricate a dead-end/empty-state
  // finding instead of the real one (the exact snapshot-shape trap
  // playbooks/product-audit.md warns about).
  const extraSurfaces = promotedIds.map((id) => {
    const surface = { name: `pool-detail:${poolIdPrefix(id)}`, url: `/home.html?pool=${encodeURIComponent(id)}`, kind: 'pool', width: 1280, poolId: id };
    if (subRailOnlyIds.has(id)) surface.subRail = true;
    return surface;
  });

  // ---- Never-audited-first rotation (backlog 183 leg b) — additive to
  // promotion, see header note above. Replaces the old bare
  // sampleBySeed(rotationCandidates, ...) call: same candidate set shape
  // (anchor + promoted excluded, exactly as before — T4's "promotion path,
  // the anchor block, and the existing surface names stay untouched"), now
  // drawn from the WIDENED union (backlog 206) instead of the snapshot
  // alone, but still preferring ids never seen in the committed state file,
  // only falling back to already-seen ids once the unseen pool is exhausted.
  const promotedSet = new Set(promotedIds);
  const rotationCandidates = unionIds.filter((id) => id !== anchorPoolId && !promotedSet.has(id));

  const rotationStatePath = opts.rotationStatePath || process.env.AUDIT_ROTATION_STATE || DEFAULT_ROTATION_STATE_PATH;
  // opts.rotationState lets tests drive buildPoolSurfaces() as a pure
  // function with no fs read at all; the CLI/real run falls back to reading
  // the committed file.
  const priorRotationState = opts.rotationState || readRotationState(rotationStatePath);
  const rot = computeRotation(rotationCandidates, sampleSize, `${seed}:pools`, priorRotationState);
  const rotationPicks = rot.picked;
  // backlog 192 — `rotationPick: true` is the explicit marker the Territory
  // notes warned this item needs: rotation-picked and prescan-promoted
  // surfaces are otherwise IDENTICAL in shape (both `pool-detail:<prefix>`,
  // `kind: 'pool'`), and only rotation surfaces may ever be skipped by the
  // AUDIT_TIME_BUDGET_MS guard in runAudit()'s render loop. Reusing the name
  // prefix as a proxy would also catch promoted surfaces, which part 2
  // forbids skipping — so this is a real field, set here at build time, not
  // inferred later from naming.
  for (const id of rotationPicks) {
    const surface = { name: `pool-detail:${poolIdPrefix(id)}`, url: `/home.html?pool=${encodeURIComponent(id)}`, kind: 'pool', width: 1280, poolId: id, rotationPick: true };
    // backlog 206 §7 — mark a rotation pick that only the deep-linked leg
    // reaches (absent from data/pools-snapshot.json); runAudit() reads this
    // to route the surface to the LIVE-shape sub-rail fixture body instead
    // of the snapshot-derived one.
    if (subRailOnlyIds.has(id)) surface.subRail = true;
    extraSurfaces.push(surface);
  }

  // ---- Lens surfaces (backlog 199) — built ONLY from `rotationPicks` above
  // (never `promotedIds`, never the anchor — spec 199 §1), for the FIRST
  // `lensSampleSize` picks, one lens each. Deliberately a SEPARATE marker
  // (`lensPick: true`, never `rotationPick`): a lens surface is a SECOND
  // render of a pool `renderedRotationCount` already counted once, and
  // carrying `rotationPick` here would double it, inflating the throughput
  // line 192 exists to keep honest (spec 199 §4). Same falsy-zero-safe env
  // pattern as every other sample-size knob in this file (`sampleSize`
  // above): `opts.poolLensSample: 0` is JS-falsy and falls through to the
  // default, but `AUDIT_POOL_LENS_SAMPLE=0` (a truthy string) makes it
  // through `Number()` to a real zero, disabling the leg entirely.
  const lensSampleRaw = Math.min(MAX_POOL_LENS_SAMPLE,
    Math.max(0, Number(opts.poolLensSample || process.env.AUDIT_POOL_LENS_SAMPLE || DEFAULT_POOL_LENS_SAMPLE)));
  // Never more lens surfaces than pools actually picked this tick (spec 199 §3).
  const lensSampleSize = Math.min(lensSampleRaw, rotationPicks.length);
  // Reuses the SAME seed the rotation above just used, namespaced (mirrors
  // `${seed}:pools` / `${seed}:poolprescan` / `${seed}:fill`) so this hash
  // never collides with theirs. Picks WHICH lens starts at position 0 —
  // deterministic for a given seed (test_audit_app.js's determinism
  // contract), but different across seeds (a different UTC day by default),
  // so re-picked pools accumulate different lenses over cycles instead of
  // always landing on the same one (spec 199 §2).
  const tickOffset = hashSeed(`${seed}:poollens`) % LENSES.length;
  const LENS_SHAPE = {
    '360px': { width: 360 },
    dark: { width: 1280, dark: true },
    ko: { width: 1280, ko: true }
  };
  const lensAssignments = {}; // {poolIdPrefix: lens} — reported on poolRotation.lenses below
  for (let i = 0; i < lensSampleSize; i++) {
    const id = rotationPicks[i];
    const lens = LENSES[(i + tickOffset) % LENSES.length];
    const prefix = poolIdPrefix(id);
    lensAssignments[prefix] = lens;
    const baseUrl = `/home.html?pool=${encodeURIComponent(id)}`;
    // The `@ko` variant appends `&lang=ko`, mirroring the anchor's own
    // pool-detail-ko surface above (spec 199 §1).
    const lensSurface = Object.assign({
      name: `pool-detail:${prefix}@${lens}`,
      url: lens === 'ko' ? `${baseUrl}&lang=ko` : baseUrl,
      kind: 'pool', poolId: id, lensPick: true
    }, LENS_SHAPE[lens]);
    // backlog 206 — a lens render of a sub-rail rotation pick is still a
    // sub-rail render; carry the same marker so it gets the same LIVE-shape
    // fixture body as its 1280px sibling above, not the snapshot-only one.
    if (subRailOnlyIds.has(id)) lensSurface.subRail = true;
    extraSurfaces.push(lensSurface);
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
    wrapped: rot.wrapped,
    // backlog 191 — the resolved (env-overridden, MAX_POOL_SAMPLE-clamped)
    // rotation budget for THIS run, exposed so the CLI summary can derive a
    // full-pass throughput figure at runtime instead of re-typing
    // DEFAULT_POOL_SAMPLE as a literal (item-159 rule).
    sampleSize,
    // backlog 192 — OPTIMISTIC placeholders, set as if every pick would
    // render (this function does no rendering, so it cannot know better).
    // runAudit() overwrites both fields after the render loop with what
    // ACTUALLY rendered — never trust these two fields straight off
    // buildPoolSurfaces()'s own return; they exist here only so the shape is
    // always complete (same convention as emptyPoolRotationResult()).
    renderedCount: rotationPicks.length,
    truncated: false,
    // backlog 199 — additive fields only; every field above keeps its exact
    // pre-197 meaning (spec 199 §5). Same OPTIMISTIC-placeholder convention
    // as renderedCount/truncated just above: this function does no
    // rendering, so `lensRendered` starts equal to `lensSampleSize` and
    // `lensSkipped` starts at 0; runAudit() overwrites both after the render
    // loop with what the wall-clock guard actually let through.
    lensSampleSize,
    lensRendered: lensSampleSize,
    lensSkipped: 0,
    lenses: lensAssignments,
    // backlog 206 — population-split reporting (spec §Change item 4), flat
    // and additive alongside every field above (none of which changes
    // meaning): snapshotIds is the snapshot's own population size;
    // deepLinkIds is the NET-NEW contribution of the deep-linked leg — ids
    // confirmed live this tick (post `∩ livePoolIds`) that are NOT already
    // in the snapshot (i.e. `subRailOnlyIds`, the same set that marks a
    // surface `subRail: true` below) — deliberately NOT the raw
    // ∩-live count, which would double-count the ~420-pool overlap the
    // snapshot and the estate already share (spec 206 evidence) and could
    // read "deepLinkIds > 0" even when the leg added zero NEW candidates.
    // This makes `union === snapshotIds + deepLinkIds` hold exactly (a
    // clean internal-consistency invariant: union and snapshotIds are
    // disjoint-safe by construction, subRailOnlyIds excludes any id already
    // counted in snapshotIds) — 0 whenever the leg degraded OR every
    // live-confirmed deep link happens to already be a snapshot pool, per
    // deepLinkSource below. union is the widened candidate population
    // BEFORE anchor/promoted exclusion; reachable is the SAME number
    // candidateCount already reports (after exclusion) — both names kept
    // because the spec names both and a future reader may grep for either.
    // subRailPicked counts how many of THIS tick's rotation picks are
    // sub-rail (absent from the snapshot); deepLinkSource explains the
    // leg's status in prose, always populated (never silently absent), even
    // in the normal/non-degraded case.
    snapshotIds: snapshotIdsArr.length,
    deepLinkIds: subRailOnlyIds.size,
    union: unionIds.length,
    reachable: rotationCandidates.length,
    subRailPicked: rotationPicks.filter((id) => subRailOnlyIds.has(id)).length,
    deepLinkSource
  };

  // backlog 192 — `baseSeen` (declared above, feeding `newSeen`) is also
  // returned here: it's the exact seen[] this run's picks were ADDED ON TOP
  // OF (empty on a wrap, otherwise the prior committed state, before any of
  // THIS run's ids were folded in). runAudit()'s post-render reconciliation
  // needs it to tell "an id already legitimately seen in an EARLIER run"
  // (never strip it) apart from "an id THIS run would have newly added"
  // (strip it if the guard skipped its render) — see the reconciliation
  // comment in runAudit() for why that distinction is the whole point.
  return { anchorPoolId, extraSurfaces, poolPrescan, poolPrescanFindings, poolPrescanSuspects, poolRotation, rotationState, rotationStatePath, baseSeen };
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
  //
  // backlog 193: same predicate as spec 157's ABSURD_MAGNITUDE_TEXT
  // (`(^|[^A-Za-z0-9])`, above) — a digit run must not be preceded by a
  // letter or digit, or it's a fragment of an alphanumeric token (e.g. the
  // Solana base58 mint `So1111...112` rendered raw by PoolDetail.js, or an
  // EVM address body), not a genuine magnitude. The FORM differs on purpose:
  // this regex is driven in a `/g` exec() loop below that reads `n[1]`
  // (sign), `n[2]` (digits), `n[3]` (suffix) by fixed index and reports
  // `n[0].trim()` verbatim. A capturing prefix alternation like 157's would
  // shift those indices, splice the boundary character into the reported
  // string, and get consumed so the next exec() call could miss an adjacent
  // match. A zero-width lookbehind enforces the identical boundary condition
  // without capturing anything or advancing lastIndex — do not "unify" this
  // back into 157's alternation form.
  const numRe = /(?<![A-Za-z0-9])(-?)\$?(\d[\d,]*(?:\.\d+)?)\s*([KMBTkmbt])?/g;
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
  // Item 256: runs on every surface this shared collector already visits (no
  // new page loads, no new rotation cost) — the class this item closes is a
  // rendered raw translation key, which can surface on any page, not only
  // the dead-pool empty state that first exposed it (item 253).
  for (const detail of scanRawRenderedKeys(text, rawKeyPopulation())) {
    findings.push(finding(s.name, s.vpLabel, 'i18n:raw-key-rendered', I18N_RAW_KEY_SIGNALS['i18n:raw-key-rendered'], detail));
  }
  return text;
}

async function main(browser, baseUrl, s, ctx) {
  const page = await browser.newPage({ viewport: { width: s.width, height: 900 } });
  const errors = makeErrorSink(page);
  const findings = [];
  s.vpLabel = s.dark ? `${s.width}px/dark` : s.ko ? `${s.width}px/ko` : `${s.width}px`;
  // backlog 231 — enrich the surface object with the run-level quiescence
  // kill switch, same pattern as s.vpLabel just above: checkOcclusion(page,
  // s, findings) reads s.occlusionQuiescence rather than taking a 4th
  // parameter (its signature is pinned by test_audit_occlusion_lens.js).
  s.occlusionQuiescence = ctx.occlusionQuiescence;
  // backlog 233 — same convention, for checkResponsive's own quiescence wait
  // (and the kind:'static' branch's settle, which reads this same field —
  // there is only one switch, not one per call site).
  s.responsiveQuiescence = ctx.responsiveQuiescence;

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
    // backlog 206 §7 — a sub-rail pool-detail surface (absent from
    // data/pools-snapshot.json, reachable only via the widened deep-linked
    // rotation leg) gets `ctx.subRailLiveBody` instead of `ctx.liveBody` on
    // the `**/yields.llama.fi/pools` route below; every other surface's
    // spread of `...ctx` already carries the byte-identical `liveBody` it
    // always has — this override only ever fires for `s.subRail === true`.
    await setupRoutes(page, { ...ctx, liveBody: s.subRail ? ctx.subRailLiveBody : ctx.liveBody, forceLive: s.forceLive, liveDelayMs: s.liveDelayMs, ctaProvenance });
    const url = baseUrl + s.url;

    if (s.kind === 'loading') {
      // Check 3 — loading flash. During the forced live delay, the resolved
      // "no results" empty state (its .empty-submessage) must NOT render before
      // data arrives; only the loading variant (bare .empty-message) may show.
      await page.goto(url, { waitUntil: 'commit', timeout: 20000 });
      // backlog 231 — opts.injectStyle, test-injection only (never set by the
      // CLI). Wrapped: a page that navigated away before the style tag lands
      // must not throw and abort the surface driver.
      if (ctx.injectStyle) {
        try { await page.addStyleTag({ content: ctx.injectStyle }); } catch (e) { /* page may have navigated away */ }
      }
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
    // backlog 231 — opts.injectStyle, test-injection only (never set by the
    // CLI), same convention as opts.rotationState/opts.livePools elsewhere in
    // this file. Wrapped: a page that navigated away before the style tag
    // lands must not throw and abort the surface driver.
    if (ctx.injectStyle) {
      try { await page.addStyleTag({ content: ctx.injectStyle }); } catch (e) { /* page may have navigated away */ }
    }

    if (s.kind === 'static') {
      // Static SEO page: number sanity + page errors, plus the 154 checks —
      // all read from the RENDERED page, this is a detector only (no writes).
      // backlog 233 — same quiescence predicate as checkResponsive/
      // checkOcclusion, under the same s.responsiveQuiescence switch,
      // replacing the flat 400ms settle this branch inherited (spec 233
      // change item 3: "the other" 231 left un-instrumented fixed wait,
      // besides checkResponsive's own). Check name 'quiescence' is
      // deliberately NEW here: no existing check owns "the page never
      // settled" outside the occlusion/responsive lenses this predicate also
      // drives, and this branch has no CTA selector for 'responsive' to name.
      // When the switch is off, the exact pre-233 flat wait is reproduced.
      const staticQuiescenceEnabled = s.responsiveQuiescence !== false && process.env.AUDIT_RESPONSIVE_QUIESCENCE !== '0';
      if (staticQuiescenceEnabled) {
        const qs = await waitForQuiescence(page, OCCLUSION_QUIESCENCE_BUDGET_MS);
        if (!qs.reached) {
          findings.push(finding(s.name, s.vpLabel, 'quiescence', 'P2',
            `quiescence not reached in ${OCCLUSION_QUIESCENCE_BUDGET_MS}ms at ${s.width}px: ${qs.animCount} animation(s) still running, geometry ${qs.geometryChanged ? 'still changing' : 'stable'} — measuring anyway`));
        }
      } else {
        await page.waitForTimeout(400);
      }
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

      await checkOcclusion(page, s, findings);
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
      await checkOcclusion(page, s, findings);
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
      if (s.width <= 768) await checkResponsive(page, s, findings, '.pool-card');
      await checkOcclusion(page, s, findings);
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
      const text = await auditText(page, s, findings);

      const searchCta = page.locator('.landing-search-submit').first();
      if ((await searchCta.count()) === 0 || !(await searchCta.isVisible())) {
        findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1',
          'landing search submit (.landing-search-submit) missing or not visible'));
      }

      // i18n — backlog 200, same "KO surface rendered no Hangul text" check
      // the planner/bloom drivers already run, scoped to the -ko surface only.
      if (s.ko) {
        const hasHangul = /[가-힣]/.test(text);
        if (!hasHangul) findings.push(finding(s.name, s.vpLabel, 'i18n', 'P2', 'KO surface rendered no Hangul text'));
      }

      // responsive — backlog 200, widened to <= 768 by backlog 201, against
      // the primary control.
      if (s.width <= 768) await checkResponsive(page, s, findings, '.landing-search-submit');

      await checkOcclusion(page, s, findings);
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

      // responsive — 360 + 768 surfaces (widened by backlog 201), against the
      // same first-screen chip.
      if (s.width <= 768) await checkResponsive(page, s, findings, '.gp-chip');

      await checkOcclusion(page, s, findings);
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

      // responsive — 360 + 768 surfaces (widened by backlog 201), against the
      // same primary control.
      if (s.width <= 768) await checkResponsive(page, s, findings, '.gp-checkout-cta');

      await checkOcclusion(page, s, findings);
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
    // backlog 183 (verifier round 3) — `ctaShape` is captured HERE, before
    // the settle-wait a few lines below, and never re-read after it: a slow
    // React re-render could in theory sample the page mid-transition and
    // read `fallback` for a pool that goes on to render the real CTA a beat
    // later. This is a deliberate, accepted asymmetry, not an oversight —
    // the residual error only ever moves TOWARD reporting a finding that
    // isn't real (a false positive a human can dismiss), never toward
    // hiding a genuine one, so it does not get a behavior change here.
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

      const baked = readBakedProtocolUrls(ctx.protocolUrlsPath);
      const staticMap = readStaticProtocolUrls();
      const diskDeterminable = !!(baked && staticMap);
      const diskTiers = [];
      if (diskDeterminable) {
        if (projectHasUrl(baked.keys, project)) diskTiers.push('baked');
        if (projectHasUrl(staticMap.keys, project)) diskTiers.push('static');
      }
      const bakedRunOutcome = ctaProvenance ? ctaProvenance.bakedProtocolUrls : 'unknown';
      // item 194 — positive disk-side evidence for the by-design-unreachable
      // downgrade, resolved with the SAME two key shapes projectHasUrl() uses
      // for the tiers above (slugified + raw project). Tri-state: `null` when
      // `baked` itself is undeterminable OR the artifact carries no/malformed
      // `unreachable` field (readBakedProtocolUrls() already encodes that —
      // an old artifact can never produce a downgrade); a real boolean only
      // when the artifact actually says so.
      const upstreamUnreachable = (baked && baked.unreachable) ? projectHasUrl(baked.unreachable, project) : null;
      const kind = classifyCtaKind({ diskDeterminable, diskTiers, bakedRunOutcome, upstreamUnreachable });
      // ctaFindingSeverity(), not a bare CTA_KIND_SEVERITY[kind] lookup —
      // see its comment: a `missing` shape must stay P1 regardless of `kind`.
      const severity = ctaFindingSeverity(ctaShape, kind);

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
        } else if (kind === 'upstream-null') {
          // item 194 — same reconciliation wording pattern as `environment`
          // just above, so both downgrades read the same way (spec 194
          // §3(B)).
          detail += ` — by design: the upstream protocols feed publishes no site URL for this project (blank \`url\`), so 182's honest DefiLlama fallback IS the intended render; downgraded to non-blocking.`;
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
    if (s.width <= 768) await checkResponsive(page, s, findings, '.cta-button-primary');

    // backlog 219 — Check 8, occlusion.
    await checkOcclusion(page, s, findings);

    if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
    await page.close();
    return findings;
  } catch (err) {
    findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', 'driver threw: ' + err.message));
    try { await page.close(); } catch (e) {}
    return findings;
  }
}

// backlog 233 — the other half of the class 231 opened. checkResponsive runs
// BEFORE checkOcclusion in every driver, at ~0ms into the page's INITIAL
// mount (not a resize-triggered re-mount like 231's target) — same
// `.animate-on-mount` fadeInScale/slideInLeft entry animations, different
// trigger, same predicate covers both (spec 233 "Territory notes"). The
// distortion here is NOT opacity (boundingBox() is not opacity-gated the way
// checkVisibility() is — 231's exact mechanism does not transfer) but an
// ANCESTOR TRANSFORM: fadeInScale's scale(0.95)->1 and slideInLeft's
// translateX(-20px)->0 shrink/shift the CTA's getBoundingClientRect() by up
// to 5% toward the viewport centre for ~1.2s, which is enough to hide a
// genuine ~5px ancestor-clip (measured: box.x = -4 at rest reads as +5.2 at
// t=0 on the pool-detail-360 permanent defect used for this item's rate
// legs). Pre-fix shipped-path detection rate on that permanent defect: 0/10.
async function checkResponsive(page, s, findings, ctaSelector) {
  // backlog 233 — kill switch, same house convention as checkOcclusion's own
  // (s.responsiveQuiescence set by main() from ctx.responsiveQuiescence,
  // which runAudit() resolves once from opts/env — see runAudit()'s own
  // comment). Default ON. When OFF, this reproduces the pre-233 behaviour
  // EXACTLY: no wait of any kind before the reads below, byte-equivalent to
  // what shipped before this item (the positive-control leg drives this).
  const quiescenceEnabled = s.responsiveQuiescence !== false && process.env.AUDIT_RESPONSIVE_QUIESCENCE !== '0';
  if (quiescenceEnabled) {
    const q = await waitForQuiescence(page, OCCLUSION_QUIESCENCE_BUDGET_MS);
    if (!q.reached) {
      findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2',
        `quiescence not reached in ${OCCLUSION_QUIESCENCE_BUDGET_MS}ms at ${s.width}px: ${q.animCount} animation(s) still running, geometry ${q.geometryChanged ? 'still changing' : 'stable'} — measuring anyway`));
    }
  }
  // MEASURE ANYWAY (231's rule): a readiness wait that can silently skip a
  // measurement has only moved the false negative one layer down, so the
  // reads below run unconditionally — on timeout, on the switch being off,
  // and on a clean settle alike.

  // No horizontal body scroll at the surface's own width.
  const scrollW = await page.evaluate(() => document.body.scrollWidth);
  if (scrollW > s.width) {
    findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2', `horizontal body scroll: scrollWidth ${scrollW} > ${s.width}`));
  }
  // Ancestor-clip check (136): the primary CTA box must be inside the viewport.
  const cta = page.locator(ctaSelector).first();
  const ctaCount = await cta.count();
  if (ctaCount === 0) {
    // backlog 233 — a check that cannot go red is not a check (231's rule,
    // generalised). Before this item, a zero-match selector skipped the
    // ENTIRE ancestor-clip check silently — no way to tell "the CTA is fine"
    // from "the CTA selector stopped matching anything at all" (e.g. a
    // rename that quietly drops the check's only victim-finding leg).
    findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2',
      `${ctaSelector} matched zero elements at ${s.width}px — ancestor-clip check has nothing to measure`));
  } else {
    const box = await cta.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2', `${ctaSelector} has zero-area box at ${s.width}px (ancestor-clipped)`));
    } else if (box.x < -1 || box.x + box.width > s.width + 1) {
      findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2',
        `${ctaSelector} box [${Math.round(box.x)}..${Math.round(box.x + box.width)}] exceeds ${s.width}px viewport`));
    }
  }
}

function round1(x) { return Math.round(x * 10) / 10; }

// backlog 219 — the whole per-pass occlusion measurement, run inside the
// browser. Self-contained on purpose (Playwright serialises a function
// reference passed to page.evaluate() via toString() and runs it in the page
// realm — it cannot close over any Node-side variable, only the args object
// below), so every helper it needs is declared inline.
//
// Returns { occlusions, truncated } where `occlusions` is every (victim,
// overlay) pair that satisfies BOTH the geometry gate and the elementFromPoint
// hit-test gate (spec 219 "The rule"), in document order; the caller
// (checkOcclusion) groups by severity, picks the worst offender, and formats
// findings — this function does no severity-shopping or finding formatting
// of its own, only measurement.
function occlusionPassEval(args) {
  var minCoverage = args.minCoverage, candidateCap = args.candidateCap, bottomAnchor = args.bottomAnchor;
  var INTERACTIVE_SEL = 'a[href], button, input, select, textarea, [role="button"]';

  function round1(x) { return Math.round(x * 10) / 10; }

  function isVisible(el) {
    if (typeof el.checkVisibility === 'function') {
      try { return el.checkVisibility({ visibilityProperty: true, opacityProperty: true }); } catch (e) { /* fall through */ }
    }
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    return true;
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  }

  function area(r) { return Math.max(0, r.width) * Math.max(0, r.height); }

  function intersectArea(a, b) {
    var x1 = Math.max(a.left, b.left), y1 = Math.max(a.top, b.top);
    var x2 = Math.min(a.right, b.right), y2 = Math.min(a.bottom, b.bottom);
    if (x2 <= x1 || y2 <= y1) return 0;
    return (x2 - x1) * (y2 - y1);
  }

  function descOf(el) {
    var tag = el.tagName.toLowerCase();
    var cls = typeof el.className === 'string' ? el.className.trim() : '';
    var out = '<' + tag + (cls ? ' class="' + cls + '"' : '');
    if (tag === 'a') {
      var href = el.getAttribute('href');
      if (href) out += ' href="' + href + '"';
    }
    return out + '>';
  }

  function directTextSnippet(el) {
    var txt = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType === 3) txt += node.textContent;
    }
    txt = txt.trim().replace(/\s+/g, ' ');
    return txt.length > 80 ? txt.slice(0, 80) : txt;
  }

  function isPaintOpaque(el) {
    var cs = getComputedStyle(el);
    var alpha = 1;
    var m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
    if (m) {
      var parts = m[1].split(',').map(function (p) { return parseFloat(p.trim()); });
      if (parts.length === 4) alpha = parts[3];
    }
    var backdrop = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
    return alpha >= 0.5 || (backdrop && backdrop !== 'none');
  }

  var viewportW = window.innerWidth, viewportH = window.innerHeight;
  var viewportArea = viewportW * viewportH;

  // --- Overlays: every visible fixed/sticky element, excluding a
  // >=80%-of-viewport modal/scrim (spec: "Deliberate blind spot") and, on the
  // bottom-of-scroll pass only, excluding overlays not anchored to the
  // viewport bottom (the two-position asymmetry — the load-bearing rule). ---
  var all = document.querySelectorAll('*');
  var overlays = [];
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (!isVisible(el)) continue;
    var rect = rectOf(el);
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (area(rect) >= 0.8 * viewportArea) continue; // modal/scrim exclusion
    if (bottomAnchor && rect.bottom < viewportH - 2) continue; // asymmetry gate
    overlays.push({ el: el, rect: rect, opaque: isPaintOpaque(el) });
  }
  if (overlays.length === 0) return { occlusions: [], truncated: false };

  // --- Victims: interactive or text-bearing elements, in document order,
  // capped at candidateCap candidates considered (spec: "no silent caps"). ---
  var occlusions = [];
  var candidateCount = 0;
  var truncated = false;
  for (var j = 0; j < all.length; j++) {
    if (candidateCount >= candidateCap) { truncated = true; break; }
    var vel = all[j];
    var vcs = getComputedStyle(vel);
    if (vcs.position === 'fixed' || vcs.position === 'sticky') continue;

    var insideOverlay = false;
    for (var k = 0; k < overlays.length; k++) {
      if (overlays[k].el !== vel && overlays[k].el.contains(vel)) { insideOverlay = true; break; }
    }
    if (insideOverlay) continue;

    var isInteractive = vel.matches(INTERACTIVE_SEL);
    var snippet = '';
    var isTextBearing = false;
    if (!isInteractive) {
      snippet = directTextSnippet(vel);
      isTextBearing = snippet.length >= 3;
    }
    if (!isInteractive && !isTextBearing) continue;
    candidateCount++;

    if (!isVisible(vel)) continue;
    var vrect = rectOf(vel);
    if (vrect.width <= 0 || vrect.height <= 0) continue;
    if (vrect.right <= 0 || vrect.bottom <= 0 || vrect.left >= viewportW || vrect.top >= viewportH) continue; // not intersecting viewport

    for (var oi = 0; oi < overlays.length; oi++) {
      var ov = overlays[oi];
      var inter = intersectArea(vrect, ov.rect);
      if (inter <= 0) continue;
      var vArea = area(vrect);
      var coveredFraction = vArea > 0 ? inter / vArea : 0;

      if (!isInteractive) {
        if (coveredFraction < minCoverage) continue; // geometry gate, text-bearing only
        if (!ov.opaque) continue; // opacity requirement, text-bearing only
      }
      // interactive: any intersection qualifies geometrically (spec: "a
      // button whose lower half is buried is unpressable in practice").

      var cx = vrect.left + vrect.width / 2, cy = vrect.top + vrect.height / 2;
      var hitPoints = [{ name: 'centre', x: cx, y: cy }];
      if (isInteractive) hitPoints.push({ name: 'lower-band(75%h)', x: cx, y: vrect.top + vrect.height * 0.75 });

      var hitOverlay = false, hitPointName = null;
      for (var hp = 0; hp < hitPoints.length; hp++) {
        var pt = hitPoints[hp];
        if (pt.x < 0 || pt.y < 0 || pt.x > viewportW || pt.y > viewportH) continue;
        var hitEl = document.elementFromPoint(pt.x, pt.y);
        if (hitEl && (hitEl === ov.el || ov.el.contains(hitEl))) {
          hitOverlay = true;
          hitPointName = pt.name;
          break;
        }
      }
      if (!hitOverlay) continue;

      occlusions.push({
        severity: isInteractive ? 'P0' : 'P1',
        coveredFraction: coveredFraction,
        victimDesc: descOf(vel),
        victimText: isTextBearing ? snippet : '',
        victimRect: { x: round1(vrect.x), y: round1(vrect.y), width: round1(vrect.width), height: round1(vrect.height) },
        overlayDesc: descOf(ov.el),
        overlayRect: { x: round1(ov.rect.x), y: round1(ov.rect.y), width: round1(ov.rect.width), height: round1(ov.rect.height) },
        hitPoint: hitPointName
      });
      break; // one reported overlay per victim is enough to make the finding actionable
    }
  }

  return { occlusions: occlusions, truncated: truncated };
}

function formatOcclusionRect(r) {
  return '{x:' + r.x + ', y:' + r.y + ', w:' + r.width + ', h:' + r.height + '}';
}

// Groups one pass's raw occlusions by severity, picks the worst offender
// (greatest covered fraction; Array#sort is stable so document-order ties
// stay in document order), and pushes at most one finding per severity class
// with a "+N more" suffix when several — spec 219 "Findings emitted".
function pushOcclusionPassFindings(findings, s, passLabel, viewport, passResult) {
  if (passResult.truncated) {
    findings.push(finding(s.name, s.vpLabel, 'occlusion', 'P2',
      `candidate scan truncated at ${OCCLUSION_CANDIDATE_CAP} elements on ${passLabel} pass (viewport ${viewport}) — some victims may be unexamined`));
  }
  for (const severity of ['P0', 'P1']) {
    const group = passResult.occlusions
      .filter((o) => o.severity === severity)
      .sort((a, b) => b.coveredFraction - a.coveredFraction);
    if (group.length === 0) continue;
    const worst = group[0];
    const kind = severity === 'P0' ? 'interactive' : 'text-bearing';
    const textPart = worst.victimText ? ` "${worst.victimText}"` : '';
    const morePart = group.length > 1 ? ` (+${group.length - 1} more occluded element(s) on this pass)` : '';
    findings.push(finding(s.name, s.vpLabel, 'occlusion', severity,
      `${passLabel}, viewport ${viewport}: ${kind} victim ${worst.victimDesc}${textPart} rect ${formatOcclusionRect(worst.victimRect)} occluded by overlay ${worst.overlayDesc} rect ${formatOcclusionRect(worst.overlayRect)} — ${round1(worst.coveredFraction * 100)}% covered, hit-test at "${worst.hitPoint}" resolved to the overlay${morePart}`));
  }
}

// backlog 231 — the geometry+animation sample waitForQuiescence() compares.
// Self-contained on purpose, same reason occlusionPassEval() is (Playwright
// serialises this via toString() and runs it in the page realm — it cannot
// close over any Node-side variable, only the args object below). Returns
// {animCount, geometry}: `animCount` is the number of RUNNING CSS animations/
// transitions, excluding any effect whose timing declares
// `iterations === Infinity` (spec 231: "spinners/pulses never settle, and a
// lens that waits for them would hang every surface") — guarded behind
// `typeof document.getAnimations === 'function'` so an engine without the
// API degrades to 0 (i.e. the geometry-stability leg alone decides) rather
// than throwing. `geometry` is a byte-comparable string built from the
// rounded rects of every visible fixed/sticky overlay plus every occlusion
// CANDIDATE victim (same interactive-or-text-bearing gate occlusionPassEval
// uses, minus the hit-test — a signature only needs to prove "nothing moved
// or (dis)appeared", not re-run the full pass) — spec 231 "a geometry
// signature (rounded rects of the fixed/sticky overlays + the candidate
// victims)".
function quiescenceSampleEval(args) {
  var candidateCap = args.candidateCap;
  var INTERACTIVE_SEL = 'a[href], button, input, select, textarea, [role="button"]';

  function isVisible(el) {
    if (typeof el.checkVisibility === 'function') {
      try { return el.checkVisibility({ visibilityProperty: true, opacityProperty: true }); } catch (e) { /* fall through */ }
    }
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) === 0) return false;
    return true;
  }
  function round1(x) { return Math.round(x * 10) / 10; }
  function rectStr(r) { return round1(r.x) + ',' + round1(r.y) + ',' + round1(r.width) + ',' + round1(r.height); }

  var viewportW = window.innerWidth, viewportH = window.innerHeight;
  var viewportArea = viewportW * viewportH;
  var parts = [];
  var all = document.querySelectorAll('*');

  // Overlays — same selection as occlusionPassEval's at-rest pass (no
  // bottomAnchor gate here: the signature is used identically before EITHER
  // pass, and an overlay that would be excluded from a bottom-of-scroll
  // MEASUREMENT still matters for "has anything moved").
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (!isVisible(el)) continue;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.width * rect.height >= 0.8 * viewportArea) continue; // modal/scrim exclusion
    parts.push('O:' + rectStr(rect));
  }

  // Candidate victims — same interactive-or-text-bearing gate as
  // occlusionPassEval, capped identically, no hit-testing (not needed for a
  // stability signature).
  var candidateCount = 0;
  for (var j = 0; j < all.length; j++) {
    if (candidateCount >= candidateCap) { parts.push('TRUNCATED'); break; }
    var vel = all[j];
    var vcs = getComputedStyle(vel);
    if (vcs.position === 'fixed' || vcs.position === 'sticky') continue;
    var isInteractive = vel.matches(INTERACTIVE_SEL);
    var isTextBearing = false;
    if (!isInteractive) {
      var txt = '';
      for (var k = 0; k < vel.childNodes.length; k++) {
        var node = vel.childNodes[k];
        if (node.nodeType === 3) txt += node.textContent;
      }
      isTextBearing = txt.trim().replace(/\s+/g, ' ').length >= 3;
    }
    if (!isInteractive && !isTextBearing) continue;
    candidateCount++;
    if (!isVisible(vel)) continue;
    var vrect = vel.getBoundingClientRect();
    if (vrect.width <= 0 || vrect.height <= 0) continue;
    if (vrect.right <= 0 || vrect.bottom <= 0 || vrect.left >= viewportW || vrect.top >= viewportH) continue;
    parts.push('V:' + rectStr(vrect));
  }

  var animCount = 0;
  if (typeof document.getAnimations === 'function') {
    var anims = document.getAnimations();
    for (var a = 0; a < anims.length; a++) {
      var anim = anims[a];
      if (anim.playState !== 'running') continue;
      var timing = (anim.effect && typeof anim.effect.getTiming === 'function') ? anim.effect.getTiming() : null;
      if (timing && timing.iterations === Infinity) continue; // spinners/pulses — never settle, never counted
      animCount++;
    }
  }

  return { animCount: animCount, geometry: parts.join('|') };
}

// backlog 231 — replaces checkOcclusion's fixed 150ms post-resize settle
// (evidence: the settle raced style.css:4605's `.animate-on-mount` entry
// animation, restarted by page.setViewportSize()'s re-mount, so a page
// permanently broken measured as clean 80-85% of the time). Polls (via the
// house pollFor() helper — never a hand-rolled loop, spec 231) until BOTH (a)
// no non-infinite CSS animation is running and (b) two geometry samples taken
// >=OCCLUSION_QUIESCENCE_SAMPLE_GAP_MS apart are byte-identical. Bounded by
// `budgetMs`: on timeout, returns `reached: false` with the last-known
// animCount/geometryChanged so the caller can push a P2 advisory naming the
// numbers and measure anyway — this function itself never decides to skip a
// measurement, only reports readiness.
async function waitForQuiescence(page, budgetMs) {
  const effectiveBudget = typeof budgetMs === 'number' ? budgetMs : OCCLUSION_QUIESCENCE_BUDGET_MS;
  let lastAnimCount = 0;
  let lastGeometryChanged = true;
  const reached = await pollFor(page, async () => {
    const s1 = await page.evaluate(quiescenceSampleEval, { candidateCap: OCCLUSION_CANDIDATE_CAP });
    await page.waitForTimeout(OCCLUSION_QUIESCENCE_SAMPLE_GAP_MS);
    const s2 = await page.evaluate(quiescenceSampleEval, { candidateCap: OCCLUSION_CANDIDATE_CAP });
    lastAnimCount = s2.animCount;
    lastGeometryChanged = s1.geometry !== s2.geometry;
    return s2.animCount === 0 && !lastGeometryChanged;
  }, effectiveBudget);
  return { reached: !!reached, animCount: lastAnimCount, geometryChanged: lastGeometryChanged };
}

// backlog 219 leg (a) — universal occlusion signal. Called once on the
// success path of all seven non-`loading` kind branches, immediately before
// that branch's trailing page-error push (spec 219 "Fix"). Never throws: a
// defect in THIS check must never crash a surface driver (wrapped below), and
// never fails silently (every skip/truncation/throw emits its own P2
// advisory) — playbooks/fixed-overlay-occlusion.md's "a check that cannot go
// red is not a check", generalised to a check that must never go silent.
async function checkOcclusion(page, s, findings) {
  try {
    await page.setViewportSize({ width: s.width, height: OCCLUSION_HEIGHT });
    const viewport = `${s.width}x${OCCLUSION_HEIGHT}`;
    // backlog 231 — kill switch, house convention: opts.occlusionQuiescence
    // reaches here via ctx -> s (main() stamps s.occlusionQuiescence from
    // ctx.occlusionQuiescence, the same "enrich the surface object" pattern
    // s.vpLabel already uses — see main()'s own comment), and
    // AUDIT_OCCLUSION_QUIESCENCE=0 is checked directly since this function,
    // like every other kill switch in this file, honors both opts and env.
    // Default ON; falls back to the exact pre-231 fixed 150ms settle when off.
    const quiescenceEnabled = s.occlusionQuiescence !== false && process.env.AUDIT_OCCLUSION_QUIESCENCE !== '0';

    // Resizing triggers reflow and, on the React surfaces, a re-render/
    // RE-MOUNT — measuring inside that window risks both false findings
    // (mid-reflow geometry) and missed ones. Backlog 231's diagnosis: the
    // re-mount restarts style.css:4605's `.animate-on-mount` entry animation
    // (opacity:0 -> 1, staggered delays), and occlusionPassEval's own
    // isVisible() gate rejects a still-animating victim as invisible — so a
    // fixed settle timed just wrong measures a permanently-broken page as
    // clean. waitForQuiescence() replaces the settle with a wait derived from
    // the actual mechanism (no running animation + stable geometry); when
    // disabled it falls back to the historical flat wait, unchanged.
    if (quiescenceEnabled) {
      const q1 = await waitForQuiescence(page, OCCLUSION_QUIESCENCE_BUDGET_MS);
      if (!q1.reached) {
        findings.push(finding(s.name, s.vpLabel, 'occlusion', 'P2',
          `quiescence not reached in ${OCCLUSION_QUIESCENCE_BUDGET_MS}ms at ${viewport}: ${q1.animCount} animation(s) still running, geometry ${q1.geometryChanged ? 'still changing' : 'stable'} (at-rest pass) — measuring anyway`));
      }
    } else {
      await page.waitForTimeout(150);
    }

    // style.css:2845 sets `html { scroll-behavior: smooth }`, so a plain
    // `window.scrollTo` ANIMATES on every real page — reading position right
    // after issuing it can sample mid-animation, not arrival. Defeated ONCE,
    // here, before either pass touches scroll position, as a measurement-only
    // mutation (this function is called last in every surface driver, so it
    // can never perturb any earlier check). Doing this only inside pass 2 (as
    // the first cut of this fix did) left pass 1 exposed on any surface that
    // is not already at scrollY=0 when checkOcclusion runs — the planner
    // driver clicks a `.gp-chip` immediately before this call (audit-app.js
    // ~3717) and that click can scroll the thread into view, which would
    // silently degrade the at-rest leg — the leg that catches item 218 — to a
    // P2 advisory instead of measuring it.
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      document.body.style.scrollBehavior = 'auto';
    });

    // --- Pass 1: at rest. Assert scrollY === 0 before measuring — "computing
    // a clear scroll target hides the at-rest bug" (218's own history). Poll
    // briefly rather than reading scrollY once immediately after issuing the
    // scroll: even with scroll-behavior defeated above, a single evaluate
    // can still race a not-yet-applied scroll on a busy React surface. Only
    // emit the P2 if the page is still not at the top after this budget. ---
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const reachedTop = await pollFor(page, async () => {
      const y = await page.evaluate(() => window.scrollY);
      return y === 0 ? true : null;
    }, 1000);
    if (!reachedTop) {
      const scrollY = await page.evaluate(() => window.scrollY);
      findings.push(finding(s.name, s.vpLabel, 'occlusion', 'P2',
        `at-rest pass skipped: window.scrollY=${round1(scrollY)} after scrollTo({top:0}) at ${viewport}, expected 0 — never measuring a lie`));
    } else {
      const atRest = await page.evaluate(occlusionPassEval, { minCoverage: OCCLUSION_MIN_COVERAGE, candidateCap: OCCLUSION_CANDIDATE_CAP, bottomAnchor: false });
      pushOcclusionPassFindings(findings, s, 'at-rest (scrollY=0)', viewport, atRest);
    }

    // --- Pass 2: bottom of scroll. Skipped when the document does not
    // scroll (the at-rest pass already covers that page). Loop with a settle
    // wait until arrival is confirmed; if never reached in 8 attempts, say so
    // (numbers included) rather than pass vacuously. Smooth scrolling was
    // already defeated above, once, ahead of pass 1. ---
    const scrollInfo = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, innerHeight: window.innerHeight }));
    if (scrollInfo.scrollHeight > scrollInfo.innerHeight) {
      let reached = false;
      let last = null;
      let prevScrollHeight = scrollInfo.scrollHeight;
      for (let attempt = 0; attempt < 8 && !reached; attempt++) {
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await page.waitForTimeout(150);
        last = await page.evaluate(() => ({
          scrollTop: document.documentElement.scrollTop || window.scrollY,
          innerHeight: window.innerHeight,
          scrollHeight: document.documentElement.scrollHeight
        }));
        // A scrollHeight that changed since the previous attempt means the
        // document is still growing (e.g. live data still resolving) — that
        // is "still settling", not arrival, even if this attempt's
        // scrollTop already satisfies the arrival inequality against the
        // OLD height.
        const stillSettling = last.scrollHeight !== prevScrollHeight;
        prevScrollHeight = last.scrollHeight;
        reached = !stillSettling && (last.scrollTop + last.innerHeight >= last.scrollHeight - 2);
      }
      if (!reached) {
        findings.push(finding(s.name, s.vpLabel, 'occlusion', 'P2',
          `bottom-of-scroll unreachable after 8 attempts at ${viewport}: scrollTop=${round1(last.scrollTop)} innerHeight=${round1(last.innerHeight)} scrollHeight=${round1(last.scrollHeight)} (need scrollTop+innerHeight >= scrollHeight-2)`));
      } else {
        // backlog 231 — quiescence wait #2, before the bottom pass's own
        // measurement (spec 231: "scrolling can start new animations and
        // reveal lazily-mounted content"). No fallback wait when disabled —
        // pre-231 never settled here either, only the scroll-arrival loop's
        // own settle above (unchanged, a different concern: scroll position,
        // not animation/geometry stability).
        if (quiescenceEnabled) {
          const q2 = await waitForQuiescence(page, OCCLUSION_QUIESCENCE_BUDGET_MS);
          if (!q2.reached) {
            findings.push(finding(s.name, s.vpLabel, 'occlusion', 'P2',
              `quiescence not reached in ${OCCLUSION_QUIESCENCE_BUDGET_MS}ms at ${viewport}: ${q2.animCount} animation(s) still running, geometry ${q2.geometryChanged ? 'still changing' : 'stable'} (bottom-of-scroll pass) — measuring anyway`));
          }
        }
        const bottom = await page.evaluate(occlusionPassEval, { minCoverage: OCCLUSION_MIN_COVERAGE, candidateCap: OCCLUSION_CANDIDATE_CAP, bottomAnchor: true });
        pushOcclusionPassFindings(findings, s, 'bottom-of-scroll', viewport, bottom);
      }
    }
  } catch (err) {
    findings.push(finding(s.name, s.vpLabel, 'occlusion', 'P2', `check threw: ${err.message}`));
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
  // backlog 192 — wall-clock guard for the pool-detail ROTATION leg (see the
  // render loop below). `runStartTime` is captured as close to the top of
  // this function as possible, BEFORE playwright resolution / the snapshot
  // read / any prescan, so "elapsed run time" means the same thing this
  // guard's own budget was measured against: the operator's `time node
  // audit-app.js` wall-clock (specs/192.md/192-notes.md), not just the
  // render loop's own duration.
  const timeBudgetMs = Math.max(0, Number(opts.timeBudgetMs || process.env.AUDIT_TIME_BUDGET_MS || DEFAULT_TIME_BUDGET_MS));
  const runStartTime = Date.now();

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

  // backlog 184 — resolve the live pool-id set once per run, with a kill
  // switch (opts.poolLiveness === false / AUDIT_POOL_LIVENESS=0) that keeps
  // the sub-rule "not requested" (never "unrun") when a caller deliberately
  // wants it off — the same convention every other kill switch in this file
  // uses. loadLivePoolIds() never throws, so this never aborts the run.
  // backlog 206 — MOVED ahead of buildPoolSurfaces() (was after it): the
  // pool-detail rotation's widened population needs staticResult.prescan's
  // deep-linked ids AND liveness's live-id Set, so both must exist before
  // buildPoolSurfaces() runs. `surfaces = surfaces.concat(staticResult.surfaces)`
  // itself stays at its ORIGINAL position below (spec's own "final surfaces
  // array must end up in the exact same order as today" requirement) — only
  // this computation moved, not that assembly step.
  const poolLivenessKillSwitch = opts.poolLiveness === false || process.env.AUDIT_POOL_LIVENESS === '0';
  const liveness = poolLivenessKillSwitch
    ? { ids: undefined, pools: undefined, error: null, source: null, count: 0 }
    : await loadLivePoolIds(opts);
  const staticResult = buildStaticSurfaces(Object.assign({}, opts, { livePoolIds: liveness.ids, livePoolsError: liveness.error }));
  // backlog 206 — a caller-legible reason for the deep-linked rotation leg
  // degrading to zero, passed through to buildPoolSurfaces() so its own
  // stderr note and `poolRotation.deepLinkSource` say the SAME thing a
  // reader of this function's own liveness resolution would say. Left
  // `undefined` in the ordinary (non-degraded, or "deep-linked ids empty for
  // some other reason") case — buildPoolSurfaces() supplies its own default
  // wording then.
  const deepLinkDegradeReason = poolLivenessKillSwitch
    ? 'pool liveness disabled (opts.poolLiveness===false / AUDIT_POOL_LIVENESS=0) — deep-linked leg contributes 0 candidates, rotation is snapshot-only'
    : (liveness.error ? `live pool fetch failed: ${liveness.error} — deep-linked leg contributes 0 candidates, rotation is snapshot-only` : undefined);

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
    rotationStatePath: opts.rotationStatePath, rotationState: opts.rotationState,
    // backlog 206 — widen the rotation candidate population (see
    // buildPoolSurfaces()'s own header comment for the union/∩live rules).
    // opts.deepLinkPoolIds is a direct test-injection override (same
    // convention as opts.rotationState/opts.livePools elsewhere in this
    // file) — a caller supplying it verbatim (e.g. a synthetic id the real
    // static estate could never link to) wins over the real estate scan;
    // the ordinary/production path (opts.deepLinkPoolIds unset) falls back
    // to what the static prescan just found.
    deepLinkPoolIds: Array.isArray(opts.deepLinkPoolIds) ? opts.deepLinkPoolIds : staticResult.prescan.deepLinkPoolIds,
    livePoolIds: liveness.ids, deepLinkDegradeReason,
    // backlog 215 — additive: `liveness.pools` (loadLivePoolIds()'s FULL live
    // records, already fetched/injected once — never a second fetch) so
    // buildPoolSurfaces() can widen the PRESCAN input too, not just the
    // rotation. Same test-injection convention as opts.livePools/
    // opts.rotationState elsewhere in this file — a test that passes
    // opts.livePoolRecords directly to buildPoolSurfaces() (bypassing
    // runAudit() entirely) overrides this the same way opts.livePoolIds/
    // opts.deepLinkPoolIds already do above.
    livePoolRecords: liveness.pools
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
    { name: 'plan-bloom-ko', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10&lang=ko', kind: 'bloom', width: 1280, ko: true },
    // backlog 200 — completes the lens matrix on the three funnel surfaces
    // (landing/planner/bloom): dark mode had ZERO renders anywhere on
    // landing/planner/bloom (only pool-detail-dark existed), and the landing
    // page itself had never been rendered at 360px or in Korean at all.
    // Appended after plan-bloom-ko so no existing surfacesCovered entry moves
    // or renames. plan-bloom-dark reuses plan-bloom-growth's url byte-for-byte
    // (164's own "reused, not retyped" precedent) — same archetype, new lens.
    // Deliberately NO new budget knob: these are five FIXED surfaces, siblings
    // of planner-360/plan-bloom-ko above, which have no knob either — knobs in
    // this file (AUDIT_POOL_SAMPLE, AUDIT_STATIC_SAMPLE, AUDIT_POOL_LENS_SAMPLE)
    // all govern SAMPLED populations where the count is a policy question; five
    // fixed surfaces are not a population. opts.only/--only already gives a
    // caller per-surface control, and the existing time-budget guard already
    // sheds work on a slow run.
    { name: 'landing-360', url: '/', kind: 'landing', width: 360 },
    { name: 'landing-dark', url: '/', kind: 'landing', width: 1280, dark: true },
    { name: 'landing-ko', url: '/?lang=ko', kind: 'landing', width: 1280, ko: true },
    { name: 'planner-dark', url: '/plan.html', kind: 'planner', width: 1280, dark: true },
    { name: 'plan-bloom-dark', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10', kind: 'bloom', width: 1280, dark: true },
    // backlog 201 — the third design-bar width (CLAUDE.md: "flawless at
    // 360/768/1280px"), never rendered before this item, on the north-star +
    // funnel surfaces (pool-detail/grid/landing/planner/bloom). Appended
    // after plan-bloom-dark so no existing surfacesCovered entry moves or
    // renames. URLs reused byte-for-byte from their existing sibling
    // surfaces (164's "reused, not retyped" precedent) — pool-detail-768
    // from pool-detail, grid-768 from grid-token/grid-360, plan-bloom-768
    // from plan-bloom-growth. No dark/ko flag — this item is the width lens
    // only; vpLabel already renders as "768px" via the existing width
    // expression, needing no change. Ships together with leg A's ungating of
    // checkResponsive's five call sites from the old 360px-only gate to
    // <= 768 — leg B alone would be vacuous (see specs/201.md evidence 2).
    { name: 'pool-detail-768', url: poolUrl, kind: 'pool', width: 768 },
    { name: 'grid-768', url: '/home.html?token=USDC', kind: 'grid', width: 768 },
    { name: 'landing-768', url: '/', kind: 'landing', width: 768 },
    { name: 'planner-768', url: '/plan.html', kind: 'planner', width: 768 },
    { name: 'plan-bloom-768', url: '/plan.html?goal=retirement&pace=stable&monthly=500&years=10', kind: 'bloom', width: 768 }
  ];

  // backlog 167 — promoted/rotated pool-detail surfaces, spliced in right
  // after pool-detail-ko so no EXISTING surfacesCovered entry moves position
  // (grid-loading/grid-360/landing/… all keep their exact relative order).
  const poolKoIdx = surfaces.findIndex((s) => s.name === 'pool-detail-ko');
  surfaces.splice(poolKoIdx + 1, 0, ...poolResult.extraSurfaces);

  // backlog 206 — `liveness`/`staticResult` are now computed EARLIER (see the
  // comment above buildPoolSurfaces()'s call site) so the pool-detail
  // rotation can be widened by them; this assembly step itself is unmoved —
  // `staticResult.surfaces` lands in the final `surfaces` array in the exact
  // same position it always has (right after the pool-detail extras spliced
  // in above), so no existing surfacesCovered entry moves.
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

  // i18n prescan (item 190), computed BEFORE the browser launches (pure fs +
  // require). Kill switch mirrors the text-surface pass's convention exactly
  // (opts.i18n / AUDIT_I18N=0); default ON, off under opts.staticOnly.
  const i18nEnabled = opts.i18n === true ? true
    : opts.i18n === false ? false
    : process.env.AUDIT_I18N === '0' ? false
    : !opts.staticOnly;

  let i18nResult = emptyI18nResult();
  let i18nFindings = [];
  if (i18nEnabled) {
    const i18nScan = prescanI18n();
    const bySignal = {};
    for (const sig of Object.keys(I18N_SIGNALS)) bySignal[sig] = 0;
    for (const s of i18nScan.suspects) bySignal[s.signal] = (bySignal[s.signal] || 0) + 1;
    i18nResult = { scanned: i18nScan.scanned, suspectCount: i18nScan.suspects.length, bySignal, allowlistSize: i18nScan.allowlistSize };

    // One aggregate finding per signal, max 10 example keys — same shape as
    // text-surface:<signal>, never one finding per key.
    for (const sig of Object.keys(I18N_SIGNALS)) {
      const hits = i18nScan.suspects.filter((s) => s.signal === sig);
      if (hits.length === 0) continue;
      const examples = hits.slice(0, 10).map((s) => `${s.key}: ${s.detail}`);
      i18nFindings.push(finding('i18n', 'n/a', `i18n:${sig}`, I18N_SIGNALS[sig],
        `${hits.length} of ${i18nScan.scanned} translation keys match ${sig} (allowlist: ${i18nScan.allowlistSize} keys) — examples: ${examples.join(' | ')}`));
    }
  }
  // Same `opts.only` allowlist as every other aggregate-finding family above.
  const i18nInOnly = !Array.isArray(opts.only) || opts.only.includes('i18n');
  if (Array.isArray(opts.only)) i18nFindings = i18nFindings.filter((f) => opts.only.includes(f.surface));

  const server = await startServer(port);
  const browser = await pw.chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const baseUrl = `http://localhost:${port}`;
  // backlog 183 leg (a) — id -> pool lookup so the pool-detail driver can
  // read the rendered surface's `project` without any DOM guesswork (the
  // fallback-shape CTA carries no project name in its own text).
  const poolsById = new Map(pools.map((p) => [p.pool, p]));

  // backlog 206 §7 — second LIVE-shape fixture body, ADDITIVE to `liveBody`
  // above (left byte-untouched — every existing, non-sub-rail surface keeps
  // getting exactly that body, unchanged). Sub-rail pool-detail surfaces
  // (buildPoolSurfaces() marked them `subRail: true` — absent from
  // data/pools-snapshot.json, only reachable via the widened deep-linked
  // rotation leg) have no snapshot record to derive a live-shape pool from,
  // so they render via the SAME live records `loadLivePoolIds()` already
  // fetched once (never a second fetch) — already LIVE-shape, already
  // carrying `apy` (spec's own instruction: never recompute it for them).
  const subRailIds = new Set(poolResult.extraSurfaces.filter((s) => s && s.subRail).map((s) => s.poolId));
  let subRailLiveBody = liveBody;
  if (subRailIds.size > 0) {
    const livePoolsById = liveness.pools ? new Map(liveness.pools.map((p) => [p.pool, p])) : null;
    const extraLivePools = [];
    for (const id of subRailIds) {
      const rec = livePoolsById && livePoolsById.get(id);
      if (rec) {
        extraLivePools.push(rec);
        // Extend poolsById too (spec's own instruction) so the pool-detail
        // driver's ctx.poolsById.get(currentPoolId) (~line 3589's `project`
        // read) resolves for a sub-rail pool instead of silently returning
        // null.
        if (!poolsById.has(id)) poolsById.set(id, rec);
      } else {
        // Should not happen — buildPoolSurfaces() only ever marks an id
        // `subRail` after confirming it against the SAME live-id Set these
        // records came from — but never fail silently if it ever does.
        console.error(`[audit] sub-rail pool ${id} was picked but has no live record — its render will fall through to the empty state`);
      }
    }
    const baseLiveData = pools.map((p) => Object.assign({}, p, { apy: (p.apyBase || 0) + (p.apyReward || 0) }));
    subRailLiveBody = JSON.stringify({ status: 'success', data: baseLiveData.concat(extraLivePools) });
  }

  // item 194 (test-only) — see readBakedProtocolUrls()'s own comment for why
  // this override exists; opts/env convention matches AUDIT_SNAPSHOT_PATH
  // etc. `undefined` when unset, which readBakedProtocolUrls() treats
  // identically to "no override" (falls back to the real committed path).
  const protocolUrlsPath = opts.protocolUrlsPath || process.env.AUDIT_PROTOCOL_URLS_PATH || undefined;
  // backlog 231 — same convention as protocolUrlsPath just above: resolved
  // once here from opts/env, carried into main() via ctx, which stamps it
  // onto each surface (s.occlusionQuiescence) for checkOcclusion to read —
  // checkOcclusion's own signature stays (page, s, findings), pinned by
  // test_audit_occlusion_lens.js. Default ON. The CLI never sets
  // opts.occlusionQuiescence.
  const occlusionQuiescenceEnabled = opts.occlusionQuiescence !== false && process.env.AUDIT_OCCLUSION_QUIESCENCE !== '0';
  // backlog 233 — identical convention, one turn later: resolved once here
  // from opts/env, carried into main() via ctx, stamped onto each surface
  // (s.responsiveQuiescence) for checkResponsive AND the kind:'static'
  // branch to read (checkResponsive's own signature stays (page, s,
  // findings, ctaSelector) — no 5th parameter — same "don't grow a pinned
  // signature" reasoning 231 already applied to checkOcclusion). Default ON.
  // The CLI never sets opts.responsiveQuiescence.
  const responsiveQuiescenceEnabled = opts.responsiveQuiescence !== false && process.env.AUDIT_RESPONSIVE_QUIESCENCE !== '0';
  // backlog 231 — opts.injectStyle: a CSS string added via page.addStyleTag
  // immediately after each surface's goto(), test-injection only, same
  // convention as opts.rotationState/opts.livePools. Never set by the CLI.
  const ctx = { snapshotBody, freshMeta, liveBody, subRailLiveBody, poolsById, protocolUrlsPath, occlusionQuiescence: occlusionQuiescenceEnabled, responsiveQuiescence: responsiveQuiescenceEnabled, injectStyle: opts.injectStyle };
  const findings = [...prescanFindings, ...poolPrescanFindings, ...textSurfaceFindings, ...i18nFindings];
  const surfacesCovered = [];
  // Named only when the pass ran AND survived opts.only (spec 160: unlike
  // static-prescan, this DOES get its own surfacesCovered entry).
  if (textSurfacesEnabled && textSurfacesInOnly) surfacesCovered.push('text-surfaces');
  // Same convention (item 190): the i18n prescan gets its own surfacesCovered
  // entry when it ran AND survived opts.only.
  if (i18nEnabled && i18nInOnly) surfacesCovered.push('i18n');
  // backlog 192 part 2 — wall-clock guard state. `rotationGuardTripped`
  // latches true the first time elapsed run time exceeds `timeBudgetMs` at a
  // rotation-picked surface, and STAYS true — "skip that surface and every
  // rotation surface after it" (spec 192), not just the one that happened to
  // be first over budget. Only surfaces carrying `s.rotationPick === true`
  // (set exclusively in buildPoolSurfaces() for the seeded-rotation picks,
  // never for the anchor, prescan-promoted, static/text/i18n, or any other
  // named surface) are ever eligible to be skipped here.
  // backlog 199 — the guard's eligibility is extended to `s.lensPick` too
  // (spec 199 §4: "a slow run sheds lens renders as well"), but lens skips
  // are counted in a SEPARATE counter (`skippedLensCount`), never pushed into
  // `skippedRotationIds` — that array feeds the `seen` reconciliation below,
  // and a lens skip must never strip a pool from `seen`: the pool WAS
  // rendered at 1280px (its own `rotationPick` surface, earlier in this same
  // list), only its extra lens render was shed.
  let rotationGuardTripped = false;
  const skippedRotationIds = [];
  let renderedRotationCount = 0;
  let renderedLensCount = 0;
  let skippedLensCount = 0;
  try {
    for (const s of surfaces) {
      if (s.rotationPick || s.lensPick) {
        if (!rotationGuardTripped && (Date.now() - runStartTime) > timeBudgetMs) rotationGuardTripped = true;
        if (rotationGuardTripped) {
          if (s.rotationPick) skippedRotationIds.push(s.poolId);
          else skippedLensCount++;
          continue; // never rendered: no surfacesCovered entry, no findings, no exception to the honesty rule
        }
        if (s.rotationPick) renderedRotationCount++;
        else renderedLensCount++;
      }
      const f = await main(browser, baseUrl, s, ctx);
      surfacesCovered.push(s.name);
      findings.push(...f);
    }
  } finally {
    await browser.close();
    server.close();
  }

  // backlog 192 part 3 (THE HONESTY REQUIREMENT) — reconcile the OPTIMISTIC
  // poolRotation/rotationState buildPoolSurfaces() computed (assuming every
  // pick would render) against what the guard above actually skipped.
  // `poolResult.baseSeen` is the exact seen[] this run's picks were added on
  // top of (see its own comment in buildPoolSurfaces()): filtering
  // `skippedRotationIds` through it distinguishes "an id already legitimately
  // seen in an EARLIER run" (leave it in `seen` — it really was audited once,
  // just not this run) from "an id THIS run would have newly added" (strip
  // it — it was never actually rendered, ever, so crediting it as seen would
  // silently inflate the coverage number this whole item exists to make
  // honest, and the next run would never re-pick a pool that in truth has
  // still never been audited). Runs even when nothing was skipped
  // (newlySkipped.length === 0 short-circuits to a no-op).
  if (poolResult.rotationState) {
    const baseSeenSet = new Set(Array.isArray(poolResult.baseSeen) ? poolResult.baseSeen : []);
    const newlySkipped = skippedRotationIds.filter((id) => id && !baseSeenSet.has(id));
    if (newlySkipped.length) {
      const skipSet = new Set(newlySkipped);
      poolResult.rotationState = Object.assign({}, poolResult.rotationState, {
        seen: poolResult.rotationState.seen.filter((id) => !skipSet.has(id))
      });
    }
  }
  // poolRotation.picked stays the full BUILD-TIME pick list (what the seed
  // chose) — renderedCount/truncated are the new, separate, HONEST read of
  // what this run actually did with that list (spec 192: "expose the
  // rendered count + a truncation flag on poolRotation").
  poolResult.poolRotation = Object.assign({}, poolResult.poolRotation, {
    renderedCount: renderedRotationCount,
    truncated: skippedRotationIds.length > 0,
    // The resolved (env/opts-overridden) budget THIS run actually guarded
    // against — carried into the artifact/console line so a reader never has
    // to re-read code to know what "TRUNCATED" was measured against.
    timeBudgetMs,
    // backlog 199 — same honest-overwrite treatment as renderedCount/
    // truncated just above, for the lens leg: `lensSampleSize`/`lenses` stay
    // the build-time plan (what the seed chose), `lensRendered`/`lensSkipped`
    // become the real read of what the guard actually let through.
    lensRendered: renderedLensCount,
    lensSkipped: skippedLensCount
  });

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

  // backlog 196 — same gate, same write-only-if-changed rule, as the pool
  // leg's persist block immediately above. `staticResult.staticRotationState`
  // is `null` in override mode (AUDIT_STATIC_PAGES), so this is a no-op then,
  // exactly like the pool leg's own override mode.
  if (opts.persistRotationState && staticResult.staticRotationState && staticResult.staticRotationStatePath) {
    const serializedStaticRotation = JSON.stringify(staticResult.staticRotationState, null, 2) + '\n';
    let existingStaticRotation = null;
    try { existingStaticRotation = fs.readFileSync(staticResult.staticRotationStatePath, 'utf8'); } catch (e) { /* first run */ }
    if (existingStaticRotation !== serializedStaticRotation) {
      fs.mkdirSync(path.dirname(staticResult.staticRotationStatePath), { recursive: true });
      fs.writeFileSync(staticResult.staticRotationStatePath, serializedStaticRotation);
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
    // backlog 196 — reported next to poolRotation, same shape convention
    // (each leg: {cycle, seenCount, candidateCount, picked, wrapped,
    // sampleSize}), so the heartbeat can read static coverage position
    // without re-deriving it.
    staticRotation: staticResult.staticRotation,
    textSurfaces,
    i18n: i18nResult
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
  // backlog 254 — exported so test_audit_text_surfaces.js (and the repo-wide
  // rail-derivation scan test) can drive the rail-relative tvl-floor-claim
  // shape-matcher directly, same precedent countQualifyingPools already set
  // for item 188's grid-link simulator; loadDefaultMinTvl is exported so a
  // test can read the SAME live app.js-derived value the signal itself uses,
  // rather than re-deriving/hardcoding a second copy to assert against.
  findStatedTvlFloorAnyShape, loadDefaultMinTvl,
  // backlog 219 — exported so test_audit_occlusion_lens.js can drive the
  // occlusion lens directly against a real page (with a hand-made surface
  // object), the same precedent classifyCtaKind/ctaFindingSeverity already
  // set; OCCLUSION_HEIGHT is exported too so the test interpolates it
  // (item-159 rule) rather than re-typing 780.
  checkOcclusion, OCCLUSION_HEIGHT,
  // backlog 231 — exported so test_audit_occlusion_lens_reliability.js can
  // drive/assert the quiescence wait directly and interpolate its budget
  // (item-159 rule) rather than re-typing 3000/100.
  waitForQuiescence, OCCLUSION_QUIESCENCE_BUDGET_MS, OCCLUSION_QUIESCENCE_SAMPLE_GAP_MS,
  // backlog 233 — exported so test_audit_responsive_lens_reliability.js can
  // drive checkResponsive directly against page.setContent() fixtures (the
  // zero-match-selector and never-stabilising-geometry proofs), the same
  // precedent checkOcclusion's own export already set for 231.
  checkResponsive,
  // backlog 184 — exported so test_audit_pool_link_liveness.js can drive the
  // live-id resolution directly (with opts.livePools injection) without a
  // full runAudit() invocation.
  loadLivePoolIds,
  // backlog 183 — exported so test_audit_cta_provenance.js can drive the
  // classifier and the rotation picker directly as pure functions, exactly
  // how reconcilePrescanFindings() is already exported for 171's tests.
  classifyCtaKind, computeRotation, readBakedProtocolUrls, readStaticProtocolUrls,
  projectHasUrl, readRotationState,
  // backlog 183 (verifier round 3) — exported so the shape-then-kind
  // severity rule (missing always P1, fallback eligible for the
  // environment downgrade) is directly testable, not just exercised inline
  // in the page driver.
  ctaFindingSeverity,
  // backlog 183 — exported so test_audit_cta_provenance.js can assert the
  // cap-must-exceed-real-population invariant directly against
  // data/pools-snapshot.json (see ROTATION_SEEN_CAP's own comment).
  ROTATION_SEEN_CAP,
  // item 188 — exported so test_audit_text_surfaces.js can drive the
  // level-3 grid-link simulator directly (the chain='All' wildcard fix,
  // Leg C) without needing a full prescanTextSurfaces() fixture file.
  countQualifyingPools,
  // item 190 — exported so test_audit_i18n_parity.js can drive the i18n
  // prescan directly (with opts.dict injection) without a full runAudit()
  // invocation; I18N_UNTRANSLATED_ALLOWLIST (renamed by item 198 — the
  // predicate no longer keys on sameness, so the name no longer should
  // either) is exported so the exact-key-path (never prefix/substring) test
  // can read the seeded allowlist directly.
  prescanI18n, I18N_UNTRANSLATED_ALLOWLIST,
  // item 256 — exported so test_audit_raw_key_rendered.js can drive the
  // key-name derivation and the predicate directly (with opts.dict
  // injection, same convention as prescanI18n above), and assert the
  // severity constant instead of re-typing 'P1' (the item-159 rule).
  collectI18nKeyNames, scanRawRenderedKeys, I18N_RAW_KEY_SIGNALS,
  // item 256 follow-up (leg B, 2026-08-10) — exported so
  // test_audit_raw_key_rendered.js can drive the referenced-call-site leg,
  // the file-population derivation, and the union directly (opts.files/
  // opts.shells injection, same convention as opts.dict above) without
  // mutating the real translations.js to prove the deleted-key case.
  collectRenderedScriptSources, collectReferencedKeyNames, collectRawKeyPopulation,
  // backlog 191 — exported so tests interpolate the real rotation-budget
  // constants (default + ceiling) instead of re-typing them (item-159 rule).
  DEFAULT_POOL_SAMPLE, MAX_POOL_SAMPLE,
  // backlog 199 — same item-159 rule, for the lens leg's own budget knobs +
  // fixed lens order.
  LENSES, DEFAULT_POOL_LENS_SAMPLE, MAX_POOL_LENS_SAMPLE,
  // backlog 192 — exported for the same reason: a test proving the
  // wall-clock guard's DEFAULT is inert (or that a tiny override fires it)
  // must read these, never re-type 300000/180000/etc.
  FOREGROUND_CAP_MS, DEFAULT_TIME_BUDGET_MS,
  // backlog 196 — exported so test_audit_static_rotation.js can assert the
  // cap-must-exceed-real-population invariant directly against the real
  // tokens/ + chains/ leaf counts (mirrors ROTATION_SEEN_CAP's own export
  // above), and drive the degrade-never-throws reader directly without a
  // full buildStaticSurfaces()/runAudit() call.
  STATIC_ROTATION_SEEN_CAP, readStaticRotationState,
  // item 213 — exported so generate-pool-pages.js can reuse the exact same
  // deep-link id extraction the pool-detail rotation leg already relies on
  // (its second consumer, per the function's own header comment above),
  // rather than writing a second `[?&]pool=`-style regex scan.
  extractDeepLinkPoolIds
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
      const pickedCount = (rot.picked || []).length;
      const renderedCount = rot.renderedCount || 0;
      // backlog 192 — rendered/truncated stated plainly next to picked, so a
      // truncated run cannot be misread as a clean one from this line alone.
      const truncationNote = rot.truncated ? ` — TRUNCATED (time budget ${rot.timeBudgetMs}ms exceeded, ${pickedCount - renderedCount} rotation pick(s) skipped)` : '';
      console.log(`[audit] pool rotation: cycle ${rot.cycle}, seen ${rot.seenCount}/${rot.candidateCount} candidates, picked [${(rot.picked || []).join(', ')}], rendered ${renderedCount}/${pickedCount}${truncationNote}, wrapped=${!!rot.wrapped}`);
      // backlog 206 — the population split behind `candidateCount` above
      // (which is now the WIDENED union, minus anchor/promoted — same
      // "reader's own eyes, not luck" convention as every other summary line
      // in this block): snapshot vs. deep-linked-and-live vs. union vs. how
      // many of THIS tick's picks are sub-rail. Same log-grep prefix
      // ("[audit] pool rotation:") kept, on a continuation line, so existing
      // greps for it still match the line above unchanged.
      console.log(`[audit] pool rotation (population): snapshot=${rot.snapshotIds || 0}, deep-linked-live=${rot.deepLinkIds || 0}, union=${rot.union || 0}, reachable=${rot.reachable || 0}, subRailPicked=${rot.subRailPicked || 0}/${pickedCount} — ${rot.deepLinkSource || 'n/a'}`);
      // backlog 191 — throughput, derived entirely from THIS run's own
      // poolRotation numbers (never a re-typed constant, per the item-159
      // rule). Deliberately built from `candidateCount / sampleSize`, NEVER
      // from `seenCount`: seenCount also counts the anchor pool and
      // prescan-promoted ids, which are not members of rotationCandidates,
      // so dividing by seenCount would understate the full-pass tick count
      // (spec 191's "territory notes" trap). This line is rotation-only —
      // it says nothing about the anchor/promotion legs' own coverage.
      // backlog 192 — the divisor is now `renderedCount`, NEVER `sampleSize`/
      // `picked.length` (the "planned" count) and never a hardcoded literal:
      // a truncated run must report the slower TRUE rate it actually
      // achieved, not the optimistic rate it merely intended (spec 192
      // acceptance criterion). On an untruncated run renderedCount ===
      // sampleSize === picked.length, so the figure is unchanged from 191.
      const candidateCount = rot.candidateCount || 0;
      const throughput = (renderedCount > 0 && candidateCount > 0)
        ? `${renderedCount} pool-details/tick over ${candidateCount} rotation candidates -> full pass ~${Math.ceil(candidateCount / renderedCount)} ticks (~days)`
        : 'n/a (rotation disabled)';
      console.log(`[audit] rotation throughput (rotation-only, excludes anchor + prescan-promoted ids, uses RENDERED not picked count): ${throughput}`);
      // backlog 199 — pool-lens summary line, same "reader's own eyes, not
      // luck" convention as the two lines above. The by-lens counts come
      // from `poolRotation.lenses` (the {poolIdPrefix: lens} map
      // buildPoolSurfaces() emitted at build time — what was PLANNED);
      // `lensRendered`/`lensSkipped` are the honestly-overwritten post-render
      // read (what the wall-clock guard actually let through). Explicit
      // "disabled" when the sample is 0 — never a silent absence (spec 199 §5).
      const lenses = rot.lenses || {};
      const lensSampleSize = rot.lensSampleSize || 0;
      if (lensSampleSize > 0) {
        const byLens = { '360px': 0, dark: 0, ko: 0 };
        for (const lens of Object.values(lenses)) { if (byLens[lens] !== undefined) byLens[lens]++; }
        const lensRendered = rot.lensRendered || 0;
        const lensSkipped = rot.lensSkipped || 0;
        console.log(`[audit] pool lenses: ${lensRendered} rendered (360px x${byLens['360px']}, dark x${byLens.dark}, ko x${byLens.ko}) over ${lensSampleSize} rotation picks, ${lensSkipped} skipped`);
      } else {
        console.log('[audit] pool lenses: disabled (AUDIT_POOL_LENS_SAMPLE=0 or no rotation picks)');
      }
      // backlog 196 — one summary line mirroring "[audit] pool rotation:"
      // above, so a heartbeat reader can tell static-leg coverage progress
      // from luck without a code read, same as the pool leg already gives.
      const srot = result.staticRotation || {};
      const st = srot.tokens || {};
      const sc = srot.chains || {};
      console.log(`[audit] static rotation: tokens cycle ${st.cycle}, seen ${st.seenCount}/${st.candidateCount} candidates, picked [${(st.picked || []).join(', ')}], wrapped=${!!st.wrapped} | chains cycle ${sc.cycle}, seen ${sc.seenCount}/${sc.candidateCount} candidates, picked [${(sc.picked || []).join(', ')}], wrapped=${!!sc.wrapped}`);
      // backlog 197 — same line shape, for the two new KO legs, so KO
      // coverage is readable from CLI output without a code/JSON read
      // (spec 197 acceptance: "a reader must tell EN-clean from KO-clean").
      const kst = srot.koTokens || {};
      const ksc = srot.koChains || {};
      console.log(`[audit] static rotation (ko): tokens cycle ${kst.cycle}, seen ${kst.seenCount}/${kst.candidateCount} candidates, picked [${(kst.picked || []).join(', ')}], wrapped=${!!kst.wrapped} | chains cycle ${ksc.cycle}, seen ${ksc.seenCount}/${ksc.candidateCount} candidates, picked [${(ksc.picked || []).join(', ')}], wrapped=${!!ksc.wrapped}`);
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
