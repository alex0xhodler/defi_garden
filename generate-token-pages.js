#!/usr/bin/env node

/**
 * Static Token Landing Page Generator for DeFi Garden (backlog 014, phase 1)
 * Generates tokens/<slug>.html for the top-N tokens by TVL — real,
 * server-delivered title/description/canonical/content, so crawlers see a
 * genuine page instead of the JS shell that every ?token= URL renders before
 * its DefiLlama fetch completes (specs/010-diagnosis.md, "Crawled — currently
 * not indexed").
 *
 * TRUST PRINCIPLE (mirrors generate-sitemap.js / planner.js exactly): every
 * number is computed at generation time from live DefiLlama pool data passed
 * through the SAME sanity rails as the app. Anomalous pools (total APY >
 * APY_SANITY_LIMIT) may NEVER be displayed or counted. Honest numbers, no hype.
 *
 * Phase 1 ships the mechanism + verified sample output only. It does NOT wire
 * pages into the sitemap, vercel.json, or internal links — that (and the
 * canonical-consolidation decision vs the ?token= app URLs) is phase 2, after
 * a networked run produces real pages a human can review. See specs/014.md.
 *
 * Usage:
 *   node generate-token-pages.js                 # fetch live API, write tokens/
 *   node generate-token-pages.js --fixture f.json  # offline: read pools from disk
 *   node generate-token-pages.js --limit 100 --out tokens
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
// REUSE (standing decision 2026-07-10): the pool-type classifier already
// computed for the category sitemaps (013) — never re-implement it here.
// item 226: selectHeadTokens is the single head-selection predicate (lives in
// generate-sitemap.js beside the rails it reuses — see that file's require-
// cycle-hazard comment for why it isn't a separate head-selection.js module).
const { getPoolType, selectHeadTokens } = require('./generate-sitemap.js');
// REUSE (spec 050): the same en/ko catalog + lookup helper the app already
// ships (translations.js is Node-requireable — module.exports at the bottom).
// Static pages are copy-only translated: pool data/numbers are identical
// between language variants (CLAUDE.md — en-US formatting, never per-locale).
const { createTranslationFunction, translations } = require('./translations.js');
// REUSE (spec 066): planner.js IS Node-requireable (module.exports guarded at
// its own bottom, same convention as translations.js) — its blendedApy/
// foreverNumber/SUBSCRIPTION_LADDER are the SAME rate-blend + forever-number
// math the live planner uses. Never re-derive a parallel calc path here.
const gp = require('./planner.js');

const SUPPORTED_LANGS = ['en', 'ko'];

// Canonical site URL — matches plan.html / home.html / generate-stories.js
const SITE_URL = 'https://www.defi.garden';
const YIELDS_API = 'https://yields.llama.fi/pools';

// --- Sanity rails & eligibility --------------------------------------------
// APY_SANITY_LIMIT is a TRUST RAIL (derived from trust-rails.js, itself
// mirroring app.js's own canonical constant / planner.js): a pool whose
// total APY exceeds it may NEVER be shown or counted — untouched here.
//
// MIN_POOL_TVL is this SEO generator's OWN eligibility floor — a SEPARATELY
// DECIDED policy per human directive 2026-07-11, not a mirror of the platform
// trust rail: these static token pages exist to capture long-tail search
// traffic from newer tokens, so they qualify on any count >= 1 pool rather
// than the plan path's stricter gate. The platform floor lives as
// DEFAULT_MIN_TVL in trust-rails.js (canonical app.js:800-801) and is a
// distinct decision from this one, even though the two values COINCIDE
// today. The pages still show only real, non-anomalous pools — just down
// to a $100K floor, any count >= 1.
const MIN_POOL_TVL = 100000;      // $100K eligibility floor for a page's pools — this generator's OWN SEO policy, deliberately separate from DEFAULT_MIN_TVL (see header)
// APY_SANITY_LIMIT derived from trust-rails.js (backlog 266 operator-requested
// widening replaced a hand-typed second copy — total APY above this may NEVER
// be shown, same rail app.js enforces).
const { APY_SANITY_LIMIT } = require('./trust-rails.js');
const MIN_QUALIFYING_POOLS = 1;   // a token needs >=1 qualifying pool to earn a page
const DEFAULT_LIMIT = 0;          // 0 = no cap: a page for every eligible token
const POOLS_PER_PAGE = 8;         // how many pools to list on each page
const HUB_TOP_N = 60;             // tokens linked directly on the /tokens hub before the A–Z tier takes over (045)
// Shared social/SERP image every page falls back to when it has no per-slug
// OG card of its own (hub/A-Z pages, or a generation failure — 051).
const OG_FALLBACK_REL_PATH = 'og-image.png';

// Token symbol validity — mirrors generate-sitemap.js isValidToken.
const TOKEN_REGEX = /^[A-Z0-9][A-Z0-9.\-_]{1,14}$/i;
// Rejection rules layered on top of TOKEN_REGEX (spec 148): TOKEN_REGEX alone
// accepts pure-digit strings and Pendle-style expiry-date fragments (e.g. the
// "22OCT2026" split out of "PT-SUSDE-22OCT2026" by tokenSymbols below) — both
// are real regex matches but not real tokens. Mirrors generate-sitemap.js's
// isValidToken exactly; the two must never drift.
const PURE_NUMERIC_REGEX = /^[0-9]+$/;
const DATE_FRAGMENT_REGEX = /^[0-9]{1,2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[0-9]{2,4}$/i;

function poolTotalApy(pool) {
  return (pool.apyBase || 0) + (pool.apyReward || 0);
}

// --- Representativeness gate (item 229, MOVED here in 242) ------------------
// Originally lived in generate-spotlight.js (its only dependency is
// poolTotalApy above, which already lives here). Moved so generate-token-
// pages.js can gate its own headline pool without a require cycle:
// generate-spotlight.js already requires this module (its :48), and it also
// hard-requires @napi-rs/canvas (its :47), which is not installed in this
// checkout — importing generate-spotlight.js from a generator would break the
// SEO pipeline outright. generate-spotlight.js now imports these four names
// from here and re-exports them under the same names, so every existing
// importer/test keeps working byte-identically.
//
// "today's headline is within 50% of the pool's own recent mean" — a round
// judgment (229 spec "Open questions" #1), not fitted to the motivating
// instance (concrete · SRROYUSDC, 86.51% headline vs a 4.51% apyMean30d —
// that pool is used ONLY as a positive control in the tests, never as this
// constant's definition). REPRESENTATIVE_ABS_PP exists so a genuinely flat
// near-zero pool (0.02% vs 0.00%) is never failed by a division-scale
// artifact the way a pure relative tolerance would fail it.
const REPRESENTATIVE_REL = 0.5;
const REPRESENTATIVE_ABS_PP = 0.5;

/** Shared deviation math for isRepresentativeRate AND its companion
 * storySignals term (rateRepresentative, generate-spotlight.js) — one
 * implementation, never two. Returns null when there is no apyMean30d to
 * compare against (no evidence of representativeness is not evidence of
 * representativeness — the pack is outward-facing and the human's name is on
 * it), else a ratio normalized so that `ratio <= REPRESENTATIVE_REL` iff the
 * pool passes the gate: the gate's own threshold is `max(REL*|mean|,
 * ABS_PP)`, which factors as `REL * max(|mean|, ABS_PP/REL)` — dividing by
 * that same max() term folds the gate's relative and absolute branches into
 * one comparable number. */
function representativenessRatio(pool) {
  const mean = pool.apyMean30d;
  if (mean == null || !isFinite(mean)) return null;
  const apy = poolTotalApy(pool);
  const normBase = Math.max(Math.abs(mean), REPRESENTATIVE_ABS_PP / REPRESENTATIVE_REL);
  return Math.abs(apy - mean) / normBase;
}

/** isRepresentativeRate(pool) — a headline APY must be within
 * REPRESENTATIVE_REL (50%) of the pool's own apyMean30d (or within
 * REPRESENTATIVE_ABS_PP percentage points for near-zero-mean pools). A pool
 * with no apyMean30d, or a non-finite one, is NEVER representative — 229
 * spec: "no evidence of representativeness is not evidence of
 * representativeness". Measured on live data (2026-08-06): excludes 36 of
 * 405 rail-qualifying spotlight candidates (8.9%), including the spotlight
 * ranker's former #1 pick (concrete · SRROYUSDC, 86.51% vs a 4.51% 30-day
 * mean — a positive control for this gate in the tests, never its
 * definition). */
function isRepresentativeRate(pool) {
  const ratio = representativenessRatio(pool);
  return ratio != null && ratio <= REPRESENTATIVE_REL;
}

function isAnomalousApy(pool) {
  return poolTotalApy(pool) > APY_SANITY_LIMIT;
}
function isQualifyingPool(pool) {
  return (pool.tvlUsd || 0) >= MIN_POOL_TVL && !isAnomalousApy(pool);
}
function isValidToken(symbol) {
  if (!symbol) return false;
  if (!TOKEN_REGEX.test(symbol)) return false;
  if (PURE_NUMERIC_REGEX.test(symbol)) return false; // e.g. "2027", "00", "67"
  if (DATE_FRAGMENT_REGEX.test(symbol)) return false; // e.g. "22OCT2026", "16SEP26"
  return true;
}
function tokenSymbols(pool) {
  return (pool.symbol ? String(pool.symbol).split(/[-_\/\s]/) : [])
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
}

// --- en-US formatting helpers (mirror app.js formatUsd/formatApy) ----------
function formatUsd(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return '$' + (v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function formatApy(pct) {
  return (Number(pct) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Markdown twins (spec 212) ----------------------------------------------
/** Minimal Markdown escaping for values interpolated into table cells/links —
 * only pipe (breaks the table's own column separator) and square brackets
 * (would prematurely close a `[text](url)` link) need escaping; everything
 * else in a real project/chain/symbol name is safe as literal Markdown text. */
function mdEscape(str) {
  return String(str == null ? '' : str).replace(/\|/g, '\\|').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

// URL/filesystem-safe slug for a token symbol.
function tokenSlug(symbol) {
  return String(symbol).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// --- Freshness signal (048) -------------------------------------------------
// Human-readable en-US date for the visible "Last updated" line AND the
// page's dateModified schema — the SAME string feeds both, so they can never
// drift (Google's must-match-visible-content rule). Shared by generate-chain-
// pages.js (reuse before inventing, standing decision 2026-07-10).
function todayGeneratedDate() {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Visible "Last updated <date>" line, in the page's existing `.note` style —
 * the SAME date string passed to renderDatasetJsonLd's dateModified. The
 * date itself stays en-US formatted on every language variant (050 — only
 * the surrounding label translates, mirroring CLAUDE.md's number-formatting
 * rule so the visible date and the dateModified schema can never drift). */
function renderLastUpdatedHtml(genDate, lang) {
  const t = createTranslationFunction(lang || 'en');
  return `    <p class="note">${escapeHtml(t('tcpLastUpdated', genDate))}</p>\n`;
}

/** Reciprocal hreflang tags (050): each language variant declares itself,
 * the other language, and x-default (always the en URL — Google's default-
 * language guidance). Self-canonical is set separately via <link rel=canonical>. */
function renderHreflangLinks(enUrl, koUrl) {
  return `    <link rel="alternate" hreflang="en" href="${enUrl}">
    <link rel="alternate" hreflang="ko" href="${koUrl}">
    <link rel="alternate" hreflang="x-default" href="${enUrl}">\n`;
}

/** Font preload hints (247 world): Public Sans (text) / Besley (display),
 * self-hosted, same two files home.html/plan.html already preload
 * unconditionally (--font-family-base/-display in style.css point at them on
 * every mode) — promoted here so the SEO estate stops paying a render-
 * blocking @font-face lookup inside the already-linked /style.css before the
 * browser discovers these. Root-absolute paths (`/fonts/...`), NOT the
 * `./fonts/...` home.html/plan.html use — those two live at document root,
 * but this same function serves pages at every depth this estate has
 * (`/tokens/<slug>`, `/ko/tokens/<slug>`, `/tokens/az/<letter>`, ...) and a
 * relative href resolves against the PAGE's own URL, not style.css's —
 * root-absolute is the one form that is correct at every depth without a
 * depth parameter. */
function renderFontPreloadLinks() {
  return `    <link rel="preload" href="/fonts/PublicSans-latin-var.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/fonts/Besley-latin-var.woff2" as="font" type="font/woff2" crossorigin>\n`;
}

// --- Analytics bootstrap (039) -----------------------------------------------
// Zero of these generated pages loaded analytics.js before this — an
// untracked, unmeasurable chunk of the SEO investment (specs/039.md). This is
// the SAME Mixpanel stub loader + analytics.js pipeline home.html/plan.html
// use (home.html:141-150), reproduced with String.raw so its regex literal
// (/^\/\//) survives untouched — no logic change to Mixpanel's own snippet.
const MIXPANEL_STUB = String.raw`window.MIXPANEL_CUSTOM_LIB_URL = "https://mp.defi.garden/lib.min.js";
        (function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for (var d = {}, e = ["get_group"].concat(Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\/\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
        mixpanel.init("f22917d9da245858a6789c9e5d412c36", { debug: false, track_pageview: false, persistence: "localStorage", api_host: "https://mp.defi.garden" });`;

/** Analytics bootstrap block for a generated static page: Mixpanel stub +
 * analytics.js + one explicit page_view on window 'load' (analytics.js's own
 * load listener only fires session_start — page_view has always been an
 * explicit per-page call, mirroring app.js's existing trackPageView sites). */
function renderAnalyticsBootstrap(pagePath, properties) {
  return `    <script type="text/javascript">
        ${MIXPANEL_STUB}
    </script>
    <script defer src="${SITE_URL}/analytics.js"></script>
    <script>
      window.addEventListener('load', function () {
        if (typeof Analytics !== 'undefined' && typeof Analytics.trackPageView === 'function') {
          Analytics.trackPageView(${JSON.stringify(pagePath)}, ${JSON.stringify(properties || {})});
        }
      });
    </script>`;
}

/**
 * Aggregate pools into ranked token records.
 * Returns [{ symbol, slug, totalTvl, qualifyingCount, pools:[...] }] sorted by
 * totalTvl desc, filtered to tokens with >= MIN_QUALIFYING_POOLS, capped at limit.
 * Anomalous pools never count toward the gate and never enter `pools`.
 */
function rankTopTokens(pools, limit) {
  // cap: falsy/0/undefined = no cap (a page for every eligible token).
  const cap = (limit == null ? DEFAULT_LIMIT : limit);
  const byToken = new Map(); // symbol -> { totalTvl, qualifyingCount, pools:[] }

  pools.forEach(p => {
    if (isAnomalousApy(p)) return;            // trust rail: never display/count anomalies
    if ((p.tvlUsd || 0) < MIN_POOL_TVL) return; // eligibility floor
    tokenSymbols(p).forEach(sym => {
      if (!isValidToken(sym)) return;
      if (!byToken.has(sym)) byToken.set(sym, { totalTvl: 0, qualifyingCount: 0, pools: [] });
      const rec = byToken.get(sym);
      rec.totalTvl += (p.tvlUsd || 0);
      rec.qualifyingCount += 1;
      rec.pools.push(p);
    });
  });

  const records = [];
  byToken.forEach((rec, symbol) => {
    if (rec.qualifyingCount < MIN_QUALIFYING_POOLS) return; // 013 gate: skip thin tokens
    rec.pools.sort((a, b) => (b.tvlUsd || 0) - (a.tvlUsd || 0));
    const shown = rec.pools.slice(0, POOLS_PER_PAGE); // top-N by TVL — what the page displays
    // Quality bar (030 / 032 / 033): the DISPLAYED table must show at least one
    // VISIBLE non-zero yield — an APY that doesn't round to "0.00%". Gate on the
    // SHOWN slice, not all pools: a pool at 0.003% renders "0.00%" (032), and a
    // yield-bearing pool ranked beyond POOLS_PER_PAGE isn't on the page at all
    // (033) — either way an all-"0.00%" table is thin/low-quality and dropped.
    // This gate must stay evaluated on `shown` EXACTLY as-is (030/032/033) —
    // it decides which tokens get a page at all, and moving it would change
    // the generated page set. It is deliberately NOT the same slice used for
    // display below (174).
    if (!shown.some(p => formatApy(poolTotalApy(p)) !== '0.00%')) return;
    // 174: the DISPLAYED table excludes 0.00%-APY rows — a listed "yield" of
    // zero isn't a yield opportunity. Filter zeros out of the FULL sorted
    // pool list (not just `shown`) before taking the top POOLS_PER_PAGE, so a
    // page that loses zero rows can backfill real yield rows from further
    // down the TVL ranking instead of shrinking below POOLS_PER_PAGE.
    const displayPools = rec.pools
      .filter(p => formatApy(poolTotalApy(p)) !== '0.00%')
      .slice(0, POOLS_PER_PAGE);
    records.push({
      symbol,
      slug: tokenSlug(symbol),
      totalTvl: rec.totalTvl,
      qualifyingCount: rec.qualifyingCount,
      pools: displayPools
    });
  });

  records.sort((a, b) => b.totalTvl - a.totalTvl);
  return (cap && cap > 0) ? records.slice(0, cap) : records;
}

/**
 * item 226: the soft-404 predicate, made machine-checked. Throws a single
 * actionable Error naming every offending slug if any record's DISPLAYED pool
 * list is empty. rankTopTokens/rankTopChains already only admit a record with
 * >=1 railed pool AND a visible non-zero yield (030/032/033), so the expected
 * count today is 0 — this asserts the invariant is now ENFORCED at
 * generation, not that it removes any existing page (none are empty today).
 */
function assertNonEmptyPages(records, label) {
  const empties = (records || []).filter(r => !r.pools || r.pools.length === 0).map(r => r.slug);
  if (empties.length > 0) {
    throw new Error(
      `assertNonEmptyPages: ${label} has ${empties.length} record(s) with an empty pool list ` +
      `(soft-404) — ${empties.join(', ')}`
    );
  }
}

/**
 * Related tokens for internal linking (023): up to `n` other ranked tokens,
 * co-chain ones first (share a chain with `rec`), then top-TVL others. `all`
 * arrives TVL-desc so ordering is preserved. Internal links keep pages out of
 * the orphan set (2026 SEO: unlinked pages don't get indexed).
 */
function relatedFor(rec, all, n) {
  const cap = n || 6;
  const chains = new Set(rec.pools.map(p => p.chain));
  const others = (all || []).filter(r => r.symbol !== rec.symbol);
  const coChain = others.filter(r => r.pools.some(p => chains.has(p.chain)));
  const coSet = new Set(coChain);
  const rest = others.filter(r => !coSet.has(r));
  return coChain.concat(rest).slice(0, cap).map(r => ({ symbol: r.symbol, slug: r.slug }));
}

/**
 * Distinct chains present in a token's displayed pool table that have a real
 * generated /chains/<slug> page (049 — cross-surface linking). Never links
 * to an ungenerated slug — that's a soft-404, the exact GSC class 012/013
 * fought. Ordered by first appearance in `rec.pools` (already TVL-sorted),
 * deduped, capped.
 */
function chainLinksFor(rec, generatedChainSlugs, cap) {
  const limit = cap || 8;
  const seen = new Set();
  const out = [];
  (rec.pools || []).forEach(p => {
    const chain = (p.chain || '').toString().trim();
    if (!chain) return;
    const slug = tokenSlug(chain); // same slugifier generate-chain-pages.js uses
    if (seen.has(slug) || !(generatedChainSlugs && generatedChainSlugs.has(slug))) return;
    seen.add(slug);
    out.push({ chain, slug });
  });
  return out.slice(0, limit);
}

/**
 * Distinct pool-type categories present in a displayed pool table (049 —
 * folds in 043's category-clustering idea), linking to the existing
 * `?token=/chain=&poolTypes=<cat>` app view — a real, working page. No
 * category hub page exists yet (045 shipped hub pages for tokens/chains
 * only), so this is the interim target spec 049 calls out. Ordered by first
 * appearance, deduped, capped.
 */
function categoryLinksFor(pools, baseAppUrl, cap) {
  const limit = cap || 8;
  const seen = new Set();
  const out = [];
  (pools || []).forEach(p => {
    const cat = getPoolType(p);
    if (seen.has(cat)) return;
    seen.add(cat);
    out.push({ category: cat, url: `${baseAppUrl}&poolTypes=${encodeURIComponent(cat)}` });
  });
  return out.slice(0, limit);
}

/**
 * Generic internal-links nav block (049), reusing the existing "related"
 * nav's markup/styling (`.related`/`.related-links`) via an added class
 * token so the pre-existing related-tokens/chains nav's exact
 * `class="related"` tests keep targeting only that original nav.
 */
function renderLinkNavHtml(items, ariaLabel, heading, extraNavClass) {
  if (!items || !items.length) return '';
  const links = items.map(i => `<a href="${i.href}">${escapeHtml(i.label)}</a>`).join('\n        ');
  const navClass = extraNavClass ? `related ${extraNavClass}` : 'related';
  return `    <nav class="${navClass}" aria-label="${escapeHtml(ariaLabel)}">
      <h2>${escapeHtml(heading)}</h2>
      <div class="related-links">
        ${links}
      </div>
    </nav>\n`;
}

/**
 * Waitlist CTA block (062): the missing SEO → north-star bridge. `cssPrefix`
 * is 'tp' (tokens) or 'cp' (chains) — reuses that page type's existing
 * `.${cssPrefix}-cta` button style (already defined in each page's <style>
 * block) rather than inventing new button chrome. `source` feeds
 * `plan.html?waitlist=1&src=<source>`, which planner.js reads on load to
 * auto-open the waitlist modal and tag `waitlist_opened(source=...)`.
 * Copy is honest by construction: `ctaWaitlistMicro` already discloses
 * "Card doesn't exist yet" — reused verbatim, never re-worded per-page.
 */
function renderWaitlistCtaHtml(pitch, cssPrefix, source, t) {
  return `    <div class="${cssPrefix}-waitlist">
      <h2>${escapeHtml(t('tcpWaitlistHeading'))}</h2>
      <p>${escapeHtml(pitch)}</p>
      <a class="${cssPrefix}-cta" href="/plan.html?waitlist=1&amp;src=${encodeURIComponent(source)}">${escapeHtml(t('tcpWaitlistCta'))}</a>
      <p class="${cssPrefix}-waitlist-micro">${escapeHtml(t('tcpWaitlistMicro'))}</p>
    </div>\n`;
}

// --- Yield headline (066): honest per-token "your idle X could earn Y"
// pitch — the 058-approved custom KPI that ties the card business model to
// the SEO surface without a backend. Anchored to Claude Pro (the flagship
// subscription in NORTH_STAR.md's business model / the spotlight pack's own
// DEFAULT_GOAL_ID), so the number stays honest and singular per page rather
// than picking a different anchor per token.
const YIELD_HEADLINE_ANCHOR_ID = 'claude';

function yieldHeadlineAnchor() {
  return gp.SUBSCRIPTION_LADDER.find(item => item.id === YIELD_HEADLINE_ANCHOR_ID);
}

/** SUBSCRIPTION_LADDER label keys (e.g. 'ladderClaude') live under the
 * nested translations[lang].planner catalog, not the flat tcp* keys
 * createTranslationFunction resolves — same lookup generate-spotlight.js's
 * goalLabelText already does for the identical reason (kept local rather
 * than shared since spotlight's version resolves SUBSCRIPTION_GOALS labels,
 * a different key set, from a script that must stay Node-standalone). */
function ladderLabelText(labelKey, lang) {
  const dict = (translations[lang] && translations[lang].planner) || translations.en.planner;
  const v = dict[labelKey];
  return v == null ? (translations.en.planner[labelKey] || labelKey) : v;
}

/** One honest headline: the token's blended (median) APY across the pools in
 * `rec.pools` that BOTH pass the trust rail (isQualifyingPool — min-TVL floor,
 * anomaly exclusion) AND are visibly non-zero (formatApy(poolTotalApy(p)) !==
 * '0.00%') — paired with the capital gp.foreverNumber says that rate needs to
 * run the anchor subscription forever. A forever number is a promise about
 * capital; it may not rest on a pool the product will not display, or on a
 * pool that merely dilutes the blend toward zero (spec 174 — the same class
 * of defect as 032's "visibly non-zero" display-honesty rule, applied to the
 * blend inputs, not just the final rounded rate). Returns null (no fabricated
 * number, never a zero/NaN) when no such pool remains, OR when the resulting
 * blended rate still rounds to "0.00%", OR when the forever amount is
 * non-finite/<=0 — the existing null-guards, unchanged. */
function yieldHeadlineFor(rec, lang) {
  const anchor = yieldHeadlineAnchor();
  const eligiblePools = (rec.pools || []).filter(p =>
    isQualifyingPool(p) && formatApy(poolTotalApy(p)) !== '0.00%');
  if (!eligiblePools.length) return null;
  const blendedRate = gp.blendedApy(eligiblePools);
  const apyStr = formatApy(blendedRate);
  if (apyStr === '0.00%') return null;
  const foreverAmt = gp.foreverNumber(anchor.monthly, blendedRate);
  if (!isFinite(foreverAmt) || foreverAmt <= 0) return null;
  return {
    apyStr,
    foreverAmtStr: formatUsd(foreverAmt),
    monthly: anchor.monthly,
    subLabel: ladderLabelText(anchor.labelKey, lang)
  };
}

/** Visible HTML for the yield headline, placed above the pool table (066).
 * Empty string when `headline` is null — a subject with no honest blended
 * rate simply doesn't get this line, never a fabricated one.
 * The trailing params (075) let the chain generator reuse this verbatim with
 * its own css class + message key + subject (the chain name in place of the
 * token symbol); omitting them preserves the exact token-page behavior. */
function renderYieldHeadlineHtml(headline, subject, t, cssClass, msgKey) {
  if (!headline) return '';
  const klass = cssClass || 'tp-yield-headline';
  const key = msgKey || 'tcpYieldHeadline';
  return `    <p class="${klass}">${escapeHtml(t(key, subject, headline.apyStr, headline.foreverAmtStr, headline.monthly, headline.subLabel))}</p>\n`;
}

/** Scoped CSS for renderWaitlistCtaHtml's block, appended to a page's
 * existing <style> — reuses the same neumorphic tokens as `.${cssPrefix}-card`
 * (no new colors/gradients, per the 2026-07-10 "reuse before inventing" rule). */
function renderWaitlistCtaStyle(cssPrefix) {
  return `      .${cssPrefix}-waitlist { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: none; padding: 20px 22px; margin: 24px 0; }
      .${cssPrefix}-waitlist h2 { font-size: 1rem; margin: 0 0 8px; color: var(--ui-text); }
      .${cssPrefix}-waitlist p { color: var(--ui-text-secondary); font-size: .92rem; margin: 0 0 14px; line-height: 1.55; }
      .${cssPrefix}-waitlist .${cssPrefix}-cta { margin: 4px 0 10px; }
      .${cssPrefix}-waitlist-micro { font-size: .78rem !important; margin: 0 !important; }
`;
}

/**
 * Group ranked tokens into A–Z buckets for the /tokens hub's second tier
 * (045): the hub can't link all N tokens directly (2026 guidance caps
 * links-per-template to ~30-100), so every token not in the hub's top-N by
 * TVL is reachable via exactly one A–Z sub-hub instead — still <=3 clicks
 * from `/` (home -> hub -> letter -> token).
 */
function groupTokensAZ(ranked) {
  const groups = new Map(); // key -> records[]
  (ranked || []).forEach(rec => {
    const c = (rec.symbol || '').charAt(0).toUpperCase();
    const key = /[A-Z]/.test(c) ? c : '0-9';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  });
  const out = [];
  groups.forEach((records, key) => {
    out.push({
      key,
      slug: key === '0-9' ? '0-9' : key.toLowerCase(),
      records: records.slice().sort((a, b) => a.symbol.localeCompare(b.symbol))
    });
  });
  out.sort((a, b) => (a.key === '0-9' ? -1 : b.key === '0-9' ? 1 : a.key.localeCompare(b.key)));
  return out;
}

/** Scoped <style> block shared by the /tokens and /chains hub + A–Z pages
 * (045). Same neumorphic tokens as renderTokenPage/renderChainPage's own
 * scoped styles ("tp-"/"cp-" prefixed) — "hub-" prefixed here since hub
 * pages are their own template, following this repo's existing pattern of
 * one prefixed style block per page type rather than a shared stylesheet. */
function renderHubStyleBlock() {
  return `
    <style>
      .hub-wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px; }
      .hub-wrap h1 { font-family: var(--font-family-display); font-size: 1.7rem; margin: 0 0 4px; color: var(--ui-text); }
      .hub-wrap .sub { color: var(--ui-text-secondary); margin: 0 0 16px; }
      .hub-wrap .intro { color: var(--ui-text); margin: 4px 0 22px; line-height: 1.6; }
      .hub-card { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: none; padding: 18px; margin: 20px 0; }
      .hub-card h2 { font-size: 1rem; margin: 0 0 12px; color: var(--ui-text); }
      .hub-links a { display: inline-block; margin: 0 8px 8px 0; padding: 8px 14px; background: var(--ui-surface); color: var(--ui-accent); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-pill); box-shadow: none; text-decoration: none; font-size: .9rem; transition: background .15s ease, border-color .15s ease, transform .1s ease; }
      .hub-links a:hover { background: var(--ui-surface-muted); border-color: var(--ui-border-strong); }
      .hub-links a:active { background: var(--ui-surface-muted); transform: translateY(1px); }
      .hub-links a:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); border-radius: var(--ui-radius-pill); }
      .hub-cta { display: inline-block; margin: 8px 0 4px; padding: 14px 24px; background: var(--ui-accent); color: var(--ui-on-accent); border: 1px solid transparent; border-radius: var(--ui-radius-md); box-shadow: none; text-decoration: none; font-weight: 600; transition: background .15s ease, transform .1s ease; }
      .hub-cta:hover { background: var(--ui-accent-hover); }
      .hub-cta:active { background: var(--ui-accent-active); transform: translateY(1px); }
      .hub-cta:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); }
      .hub-wrap .note { color: var(--ui-text-secondary); font-size: .9rem; }
      @media (prefers-reduced-motion: reduce) { .hub-links a, .hub-cta { transition: none; } .hub-links a:active, .hub-cta:active { transform: none; } }
${renderWaitlistCtaStyle('hub')}    </style>`;
}

/** Render the /tokens hub (index) page: top tokens by TVL directly, every
 * other token reachable via its A–Z sub-hub (045 — de-orphan the SEO
 * surface so all spoke pages are <=3 clicks from `/`). */
function renderTokenHubPage(ranked, azGroups, lang) {
  const language = (lang === 'ko') ? 'ko' : 'en';
  const t = createTranslationFunction(language);
  const base = language === 'ko' ? `${SITE_URL}/ko/tokens` : `${SITE_URL}/tokens`;
  const enUrl = `${SITE_URL}/tokens`;
  const koUrl = `${SITE_URL}/ko/tokens`;
  const pageUrl = language === 'ko' ? koUrl : enUrl;
  const top = (ranked || []).slice(0, HUB_TOP_N);
  const title = t('tcpTokenHubTitle');
  const description = t('tcpTokenHubDescription', ranked.length);

  const topLinks = top.map(r =>
    `<a href="${base}/${r.slug}">${escapeHtml(r.symbol)}</a>`).join('\n        ');
  const azLinks = (azGroups || []).map(g =>
    `<a href="${base}/az/${g.slug}">${escapeHtml(g.key)} (${g.records.length})</a>`).join('\n        ');

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${pageUrl}">
${renderHreflangLinks(enUrl, koUrl)}    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${SITE_URL}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="robots" content="index,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
${renderFontPreloadLinks()}    <link rel="stylesheet" href="/style.css">${renderHubStyleBlock()}
${renderAnalyticsBootstrap(`${language === 'ko' ? '/ko' : ''}/tokens`, { page_type: 'token_hub', token_count: ranked.length, lang: language })}
</head>
<body>
  <main class="hub-wrap">
    <h1>${escapeHtml(t('tcpTokenHubHeading'))}</h1>
    <p class="sub">${escapeHtml(t('tcpTokenHubSub', ranked.length))}</p>
    <p class="intro">${escapeHtml(t('tcpTokenHubIntro', formatUsd(MIN_POOL_TVL)))}</p>
    <a class="hub-cta" href="${SITE_URL}/">${escapeHtml(t('tcpHubBackCta'))}</a>
    <div class="hub-card">
      <h2>${escapeHtml(t('tcpTopTokensByTvlHeading'))}</h2>
      <div class="hub-links">
        ${topLinks}
      </div>
    </div>
    <div class="hub-card">
      <h2>${escapeHtml(t('tcpBrowseAZHeading'))}</h2>
      <div class="hub-links">
        ${azLinks}
      </div>
    </div>
${renderWaitlistCtaHtml(t('tcpWaitlistPitchHub'), 'hub', 'seo_tokens_hub', t)}    <p class="note">${escapeHtml(t('tcpTrustNote', formatUsd(MIN_POOL_TVL)))}</p>
  </main>
</body>
</html>
`;
}

/** Render one A–Z sub-hub page: every token whose symbol starts with
 * `group.key`, linked to its /tokens/<slug> page (045). */
function renderTokenAzPage(group, lang) {
  const language = (lang === 'ko') ? 'ko' : 'en';
  const t = createTranslationFunction(language);
  const base = language === 'ko' ? `${SITE_URL}/ko/tokens` : `${SITE_URL}/tokens`;
  const enUrl = `${SITE_URL}/tokens/az/${group.slug}`;
  const koUrl = `${SITE_URL}/ko/tokens/az/${group.slug}`;
  const pageUrl = language === 'ko' ? koUrl : enUrl;
  const title = t('tcpAzTitle', group.key);
  const description = t('tcpAzDescription', group.key, group.records.length);
  const links = group.records.map(r =>
    `<a href="${base}/${r.slug}">${escapeHtml(r.symbol)}</a>`).join('\n        ');

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${pageUrl}">
${renderHreflangLinks(enUrl, koUrl)}    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${SITE_URL}/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="robots" content="index,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
${renderFontPreloadLinks()}    <link rel="stylesheet" href="/style.css">${renderHubStyleBlock()}
${renderAnalyticsBootstrap(`${language === 'ko' ? '/ko' : ''}/tokens/az/${group.slug}`, { page_type: 'token_az', letter: group.key, token_count: group.records.length, lang: language })}
</head>
<body>
  <main class="hub-wrap">
    <h1>${escapeHtml(t('tcpAzHeading', group.key))}</h1>
    <p class="sub">${escapeHtml(t('tcpAzSub', group.records.length))}</p>
    <a class="hub-cta" href="${base}">${escapeHtml(t('tcpAzBackCta'))}</a>
    <div class="hub-card">
      <div class="hub-links">
        ${links}
      </div>
    </div>
${renderWaitlistCtaHtml(t('tcpWaitlistPitchHub'), 'hub', 'seo_tokens_az', t)}    <p class="note">${escapeHtml(t('tcpTrustNote', formatUsd(MIN_POOL_TVL)))}</p>
  </main>
</body>
</html>
`;
}

/** Appends an internal-link attribution tag (spec 203/204) to `url`:
 * `src=<encodeURIComponent(src)>`, joined with `&` if `url` already carries
 * a query string, `?` otherwise. Falsy `src` (undefined/''/null/0) returns
 * `url` byte-identically — untouched, no trailing separator. Extracted
 * (spec 204) from poolHrefFor's pre-existing tail so the same tagging logic
 * can be reused at every visible-render call site without duplicating the
 * separator arithmetic. */
function withSrc(url, src) {
  if (!src) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}src=${encodeURIComponent(src)}`;
}

/** Resolves the same pool-detail (or fallback) URL a visible table row links
 * to (`p.pool ? /?pool=<id> : fallbackUrl`) — shared by row rendering AND
 * ItemList JSON-LD so the two can never drift (046: schema must match the
 * visible content byte-for-byte).
 *
 * `src` (spec 203, optional) tags the static SEO estate's own outbound links
 * with an internal-link attribution value ('seo_token'/'seo_chain' — the
 * taxonomy analytics.js:41-54 already names) so an arrival at pool-detail
 * from this estate is distinguishable from a cold direct hit. Absent/falsy
 * -> returns exactly what this function returned before this item, byte for
 * byte — that is what keeps renderItemListJsonLd()'s ld+json `url` clean
 * (it deliberately never passes a third argument, spec 203 §6). Present ->
 * appended to WHICHEVER branch was chosen (the `?pool=` link or
 * `fallbackUrl`), with the correct separator for whichever query the target
 * URL already carries (or none) — via withSrc (spec 204). */
function poolHrefFor(p, fallbackUrl, src) {
  const url = p.pool ? `${SITE_URL}/?pool=${encodeURIComponent(p.pool)}` : fallbackUrl;
  return withSrc(url, src);
}

/** ItemList JSON-LD (046) for a ranked pool table: itemListElement mirrors
 * the visible rows exactly — same pools, same order, same link target each
 * row already uses (poolHrefFor). No new computation. */
function renderItemListJsonLd(pools, appUrl, lang) {
  const t = createTranslationFunction(lang || 'en');
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: (pools || []).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t('tcpItemListName', p.project || '—', p.chain || '—'),
      url: poolHrefFor(p, appUrl)
    }))
  }).replace(/</g, '\\u003c');
}

/** Dataset JSON-LD (046) describing the page's live yield dataset. Shared by
 * token and chain pages — callers supply the content-specific name/description. */
function renderDatasetJsonLd(name, description, pageUrl, generatedDate) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name,
    description,
    url: pageUrl,
    creator: { '@type': 'Organization', name: 'DeFi Garden', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'DeFi Garden', url: SITE_URL },
    dateModified: generatedDate
  }).replace(/</g, '\\u003c');
}

/** headlinePoolFor(pools) — item 242. The single pool whose rate AND
 * project/chain become the page's headline claim (bestApy + the pool passed
 * to buildAnswerAndFaq), so the two can never name different pools. Among
 * `pools` (already the page's displayed/gated set — see rankTopTokens),
 * returns the highest-poolTotalApy pool that ALSO passes isRepresentativeRate.
 * Deterministic: ties broken by first occurrence in the given order.
 *
 * Fallback: if no pool in `pools` passes the gate, returns the highest-
 * poolTotalApy pool anyway (today's unchecked behaviour, unaltered) — the
 * smallest honest option, per the spec's "Open questions": the claim "the
 * highest yield is X on P" stays true as written, and no page is left
 * without a headline. Measured on live data (15,685 pools, 2026-08-06,
 * rankTopTokens(pools, 0) → the real generated token-page population): 481
 * of 2,097 pages (22.9%) hit this fallback because every displayed pool on
 * the page fails the gate. That 481-page class is left open, ticketed as
 * item 243 alongside the identical `Math.max` pattern on generate-chain-
 * pages.js's chain estate.
 *
 * `pools` is always non-empty for real callers (rankTopTokens's
 * MIN_QUALIFYING_POOLS gate guarantees >=1 displayed pool per record) — an
 * empty array returns null rather than adding a defensive branch no caller
 * exercises. */
function headlinePoolFor(pools) {
  if (!pools || pools.length === 0) return null;
  let best = null;
  let bestRepresentative = null;
  pools.forEach(p => {
    if (best == null || poolTotalApy(p) > poolTotalApy(best)) best = p;
    if (isRepresentativeRate(p) &&
        (bestRepresentative == null || poolTotalApy(p) > poolTotalApy(bestRepresentative))) {
      bestRepresentative = p;
    }
  });
  return bestRepresentative != null ? bestRepresentative : best;
}

/** Direct-answer + FAQ content (047, GEO/AEO). Built once from data the page
 * already computed (the SAME gated `rec.pools`/`rec.qualifyingCount`/
 * `rec.totalTvl` the visible table uses) so the head-query answer can never
 * cite an anomalous or sub-floor pool — the trust rail is structural here,
 * not a separate check: this function never reads raw pool data, only the
 * already-filtered `rec`/`bestApy`/`topPool` a caller passes in. Shared by
 * token and chain pages. Returns RAW (unescaped) text — callers HTML-escape
 * for visible rendering and JSON.stringify raw for ld+json (the 040/
 * generate-stories.js FAQ pattern: JSON escaping != HTML escaping, and the
 * two must byte-for-byte match once the browser decodes HTML entities). */
function buildAnswerAndFaq(label, rec, bestApy, topPool, lang) {
  const t = createTranslationFunction(lang || 'en');
  const project = topPool.project || '—';
  const chain = topPool.chain || '—';
  const apyStr = formatApy(bestApy);
  const tvlStr = formatUsd(rec.totalTvl);
  // 174: EVERY floor mention on the page derives from MIN_POOL_TVL — never a
  // re-typed literal. One formatted value, reused by every t(...) call below.
  const floorStr = formatUsd(MIN_POOL_TVL);

  const answer = t('tcpAnswer', label, apyStr, project, chain, rec.qualifyingCount, floorStr);

  const faq = [
    { q: t('tcpFaqQ1', label), a: t('tcpFaqA1', apyStr, project, chain) },
    { q: t('tcpFaqQ2', label), a: t('tcpFaqA2', rec.qualifyingCount, tvlStr, floorStr) },
    { q: t('tcpFaqQ3'), a: t('tcpFaqA3', floorStr) }
  ];

  return { answer, faq };
}

/** Visible HTML for the direct-answer block (047) — 2-4 sentences answering
 * the head query, placed right after the H1. `cssClass` lets token/chain
 * pages keep their own scoped prefix (tp-/cp-), matching the rest of the
 * page's style convention. */
function renderAnswerBlockHtml(answerText, cssClass) {
  return `    <p class="${cssClass}">${escapeHtml(answerText)}</p>\n`;
}

/** Visible HTML for the FAQ section (047) — mirrors generate-stories.js's
 * kevin-page FAQ markup exactly (same st-faq-item/-q/-a structure, renamed
 * to this page's own scoped prefix). */
function renderFaqBlockHtml(faqItems, cssPrefix, lang) {
  const heading = createTranslationFunction(lang || 'en')('tcpFaqHeading');
  const items = (faqItems || []).map(item => `        <div class="${cssPrefix}-item">
          <h3 class="${cssPrefix}-q">${escapeHtml(item.q)}</h3>
          <p class="${cssPrefix}-a">${escapeHtml(item.a)}</p>
        </div>`).join('\n');
  return `    <section class="${cssPrefix}" aria-label="${escapeHtml(heading)}">
      <h2>${escapeHtml(heading)}</h2>
${items}
    </section>\n`;
}

/** FAQPage JSON-LD (047) — mainEntity built straight from the same faqItems
 * array renderFaqBlockHtml renders, so schema and visible text can never
 * diverge (the 040 kevin invariant, reused here). */
function renderFaqJsonLd(faqItems) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: (faqItems || []).map(item => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  }).replace(/</g, '\\u003c');
}

// --- Rate-behaviour depth section (item 232) --------------------------------
// The 130-page Google head (item 226) carries the whole sitemap bet and had
// received zero per-page depth (specs/226.md close-out; Q3b, 2026-08-04:
// "generator effort moves from width to depth"). This is the first funded
// depth section: rate-stability + yield-mix context computed from data the
// page already fetched, rendered ONLY on head-set pages (see the `opts.isHead`
// gate on renderTokenPage/renderTokenPageMarkdown below).

// mean30dSane: mirror of generate-pool-pages.js:139 (itself a mirror of
// PoolDetail.js:283-288, item 144's rail) — finite, >= 0, <= APY_SANITY_LIMIT.
// A THIRD physical copy, not a require of generate-pool-pages.js: an earlier
// version of this file lazy-required it (territory note 2's fix for the
// RUNTIME load cycle — generate-pool-pages.js:55 requires this module
// eagerly). That require() call is a plain string in this file's TEXT,
// though, and run-tests.js's lane classifier does a static text scan, not a
// runtime one — it doesn't know the require is lazy/conditional. Since
// generate-pool-pages.js itself requires ./audit-app.js (the real
// browser-marker source), that one lazy require silently flipped THIS file
// — and everything that requires it (generate-llms.js, and in turn
// test_llms_rails.js) — from the `plain` lane to the `browser` lane,
// breaking test_run_tests.js's real, previously-green assertion. Same
// three-line predicate, copied rather than required, keeps the classifier's
// dependency graph honest. If it ever needs to change, change it in all
// three places (PoolDetail.js, generate-pool-pages.js, here) — the existing
// convention for this exact predicate, not a new one invented for this item.
function mean30dSane(pool) {
  return typeof pool.apyMean30d === 'number' &&
    Number.isFinite(pool.apyMean30d) &&
    pool.apyMean30d >= 0 &&
    pool.apyMean30d <= APY_SANITY_LIMIT;
}

/**
 * Pure data builder for the "How this rate has behaved" section. Returns
 * `null` when nothing honest can be said (no eligible pools) — never a
 * fabricated or zeroed-out section.
 *
 * Eligible pools = rec.pools filtered through isQualifyingPool, the SAME
 * rail yieldHeadlineFor already applies — a pool the rails exclude is
 * structurally unable to reach this section (rec.pools is itself already the
 * railed/non-zero/capped display slice rankTopTokens computed, so this filter
 * is a defensive no-op today, not a second gate that could drift from it).
 *
 * Reads only project, chain, tvlUsd, apyBase, apyReward, apyMean30d,
 * poolMeta, exposure, ilRisk — a SCOPE choice, not a protection. An earlier
 * version of this comment claimed the CI fixture strips everything else via
 * generate-pools-snapshot.js's 13-field FIELDS whitelist, so sigma/mu/
 * apyPct30D "render empty in production". That was WRONG (item 232, caught by
 * the verifier). generate-pools-snapshot.js writes TWO artifacts: FIELDS/
 * projectPool applies to the committed data/pools-snapshot.json (the app's
 * DEFAULT_MIN_TVL-floored snapshot), while the --seo-out transient CI actually feeds the
 * generators (:305) is RAW and FULL-FIELD by design ("full fields preserved,
 * a provable superset of every pool the 3 SEO generators consume"). Measured:
 * sigma/mu on 15,600/15,600 pools, apyPct30D on 12,560/15,600.
 *
 * So the hazard runs the OTHER way: those fields arrive live and UNRAILED.
 * Anything new rendered from them needs its own per-field rail at every
 * render site — the way mean30dSane guards apyMean30d below — or it
 * republishes the item-122/144 defect (36,452% shown as a trusted figure).
 */
function rateBehaviourFor(rec) {
  const eligible = (rec.pools || []).filter(isQualifyingPool);
  if (!eligible.length) return null;

  const rows = eligible.map(p => {
    const base = p.apyBase || 0;
    const reward = p.apyReward;
    const hasReward = typeof reward === 'number' && Number.isFinite(reward) && reward > 0 && (base + reward) > 0;
    return {
      project: p.project,
      chain: p.chain,
      apyStr: formatApy(poolTotalApy(p)),
      meanStr: mean30dSane(p) ? formatApy(p.apyMean30d) : null,
      mixKind: hasReward ? 'incentives' : 'base',
      incentiveShareStr: hasReward ? formatApy((reward / (base + reward)) * 100) : null
    };
  });

  const totalApys = eligible.map(poolTotalApy);
  // gp.median (planner.js, reused — never re-derived) is the SAME blend math
  // the live planner uses.
  const meanVals = eligible.filter(mean30dSane).map(p => p.apyMean30d);

  return {
    poolCount: eligible.length,
    chainCount: new Set(eligible.map(p => p.chain)).size,
    lowApyStr: formatApy(Math.min(...totalApys)),
    highApyStr: formatApy(Math.max(...totalApys)),
    meanCount: meanVals.length,
    medianMeanStr: meanVals.length ? formatApy(gp.median(meanVals)) : null,
    rewardCount: rows.filter(r => r.mixKind === 'incentives').length,
    ilCount: eligible.filter(p => p.ilRisk === 'yes').length,
    rows
  };
}

/** Visible HTML for the rate-behaviour depth section (232). `''` when
 * `behaviour` is null — a token with no honest eligible pool simply doesn't
 * get this section, never a fabricated one. Reuses the page's existing
 * markup vocabulary (`.tp-card`/`.scroll`/`table`/`th.num`/`td.num` — the
 * SAME classes the pool table directly above already uses) rather than
 * inventing a new component. */
function renderRateBehaviourHtml(behaviour, symbol, t) {
  if (!behaviour) return '';
  const heading = t('tcpDepthHeading');

  const sentences = [
    `    <p>${escapeHtml(t('tcpDepthSpread', symbol, behaviour.poolCount, behaviour.lowApyStr, behaviour.highApyStr, behaviour.chainCount))}</p>`
  ];
  if (behaviour.meanCount > 0) {
    sentences.push(`    <p>${escapeHtml(t('tcpDepthMean', behaviour.meanCount, behaviour.poolCount, behaviour.medianMeanStr))}</p>`);
  }
  sentences.push(behaviour.rewardCount > 0
    ? `    <p>${escapeHtml(t('tcpDepthMixIncentives', behaviour.rewardCount, behaviour.poolCount))}</p>`
    : `    <p>${escapeHtml(t('tcpDepthMixAllBase', behaviour.poolCount))}</p>`);
  if (behaviour.ilCount > 0) {
    sentences.push(`    <p>${escapeHtml(t('tcpDepthIlExposure', behaviour.ilCount, behaviour.poolCount))}</p>`);
  }

  const rows = behaviour.rows.map(row => `        <tr>
          <td>${escapeHtml(row.project || '—')}</td>
          <td class="num">${row.apyStr}</td>
          <td class="num">${row.meanStr ? row.meanStr : '—'}</td>
          <td class="num">${row.mixKind === 'incentives' ? escapeHtml(t('tcpDepthMixIncentiveCell', row.incentiveShareStr)) : escapeHtml(t('tcpDepthMixBaseCell'))}</td>
        </tr>`).join('\n');

  return `    <section class="tp-depth" aria-label="${escapeHtml(heading)}">
      <h2>${escapeHtml(heading)}</h2>
${sentences.join('\n')}
      <div class="tp-card">
      <div class="scroll">
      <table>
        <thead>
          <tr><th>${escapeHtml(t('tcpColProtocol'))}</th><th class="num">${escapeHtml(t('tcpColApy'))}</th><th class="num">${escapeHtml(t('apyMean30d'))}</th><th class="num">${escapeHtml(t('tcpDepthColMix'))}</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
      </div>
      </div>
      <p class="note">${escapeHtml(t('tcpDepthNote', formatUsd(MIN_POOL_TVL)))}</p>
    </section>\n`;
}

/** Scoped CSS for the rate-behaviour depth section (232), gated on the SAME
 * `isHead` flag as the section itself (defect 2, coordinator review): a tail
 * page's <style> block must stay byte-identical to before this item, not
 * just its <body> — emitting these rules unconditionally changed every one
 * of the ~3,950 non-head pages in a real regen delta for zero visible
 * reason (no selector in the block ever matched on a page without the
 * section). `''` when `isHead` is false. */
function renderRateBehaviourStyle(isHead) {
  if (!isHead) return '';
  return `      .tp-depth { margin: 30px 0 8px; }
      .tp-depth h2 { font-size: 1rem; margin: 0 0 12px; color: var(--color-text); }
      .tp-depth p { color: var(--color-text); margin: 0 0 10px; line-height: 1.6; }
`;
}

/** Markdown twin of renderRateBehaviourHtml (232, mirrors spec 212's fact-
 * parity rule): the SAME `behaviour` object and the SAME t(...) calls, never
 * a re-derived number or a re-worded sentence. `''` when `behaviour` is null. */
function renderRateBehaviourMarkdown(behaviour, symbol, t) {
  if (!behaviour) return '';
  const heading = t('tcpDepthHeading');

  const sentences = [
    t('tcpDepthSpread', symbol, behaviour.poolCount, behaviour.lowApyStr, behaviour.highApyStr, behaviour.chainCount)
  ];
  if (behaviour.meanCount > 0) {
    sentences.push(t('tcpDepthMean', behaviour.meanCount, behaviour.poolCount, behaviour.medianMeanStr));
  }
  sentences.push(behaviour.rewardCount > 0
    ? t('tcpDepthMixIncentives', behaviour.rewardCount, behaviour.poolCount)
    : t('tcpDepthMixAllBase', behaviour.poolCount));
  if (behaviour.ilCount > 0) {
    sentences.push(t('tcpDepthIlExposure', behaviour.ilCount, behaviour.poolCount));
  }

  const rows = behaviour.rows.map(row =>
    `| ${mdEscape(row.project || '—')} | ${row.apyStr} | ${row.meanStr ? row.meanStr : '—'} | ${row.mixKind === 'incentives' ? mdEscape(t('tcpDepthMixIncentiveCell', row.incentiveShareStr)) : mdEscape(t('tcpDepthMixBaseCell'))} |`
  ).join('\n');

  return `## ${heading}

${sentences.join('\n\n')}

| ${t('tcpColProtocol')} | ${t('tcpColApy')} | ${t('apyMean30d')} | ${t('tcpDepthColMix')} |
|---|---|---|---|
${rows}

${t('tcpDepthNote', formatUsd(MIN_POOL_TVL))}

`;
}

/** Render a single token's static landing page as an HTML string.
 * `ogImagePaths` (051): Map<slug, relPath> from generateOgImages — falls
 * back to the shared /og-image.png when the map is absent or has no entry
 * for this slug, so a page never ships without SOME og:image.
 * `opts.isHead` (232, territory note 6): gates the rate-behaviour depth
 * section — default false, so every existing caller's output stays byte-
 * identical to before this item. */
function renderTokenPage(rec, related, generatedDate, chainLinks, lang, ogImagePaths, opts) {
  const language = (lang === 'ko') ? 'ko' : 'en';
  const t = createTranslationFunction(language);
  const sym = escapeHtml(rec.symbol);
  const enUrl = `${SITE_URL}/tokens/${rec.slug}`;
  const koUrl = `${SITE_URL}/ko/tokens/${rec.slug}`;
  const pageUrl = language === 'ko' ? koUrl : enUrl;
  const appUrl = `${SITE_URL}/?token=${encodeURIComponent(rec.symbol)}&minTvl=${MIN_POOL_TVL}`;
  const genDate = generatedDate || todayGeneratedDate();
  const ogImageRelPath = (ogImagePaths && ogImagePaths.get(rec.slug)) || OG_FALLBACK_REL_PATH;
  const ogImageUrl = `${SITE_URL}/${ogImageRelPath}`;
  // 242: headlinePoolFor gates the headline claim through isRepresentativeRate
  // so bestApy and the pool named beside it (buildAnswerAndFaq below) are
  // always the SAME pool — never Math.max's unchecked most-extreme rate.
  const headlinePool = headlinePoolFor(rec.pools);
  const bestApy = poolTotalApy(headlinePool);
  const chainCount = new Set(rec.pools.map(p => p.chain)).size;
  const title = t('tcpTokenTitle', rec.symbol);
  // 174: EVERY floor mention on this page derives from MIN_POOL_TVL — never a
  // re-typed literal. One formatted value, reused by every t(...) call below.
  const floorStr = formatUsd(MIN_POOL_TVL);
  const description = t('tcpTokenDescription', rec.symbol, rec.qualifyingCount, formatApy(bestApy), chainCount, floorStr);

  // Unique per-token intro from real data (023: content depth — this reads
  // token-specifically even with the symbol removed, so it's not thin).
  // `top` (rec.pools[0], the TVL-largest pool) stays exactly as-is here — it
  // correctly describes that pool with ITS OWN apy, unrelated to the
  // headline claim below (242 spec §Change 3: "nothing else moves").
  const top = rec.pools[0];
  const intro = t('tcpTokenIntro', sym, escapeHtml(top.project || '—'), escapeHtml(top.chain || '—'),
    formatApy(poolTotalApy(top)), formatUsd(top.tvlUsd), rec.qualifyingCount, chainCount, formatUsd(rec.totalTvl), floorStr);

  // BreadcrumbList (040): Home and the current page are real, linkable URLs.
  // "Tokens" has no `item` — there is no /tokens hub page in this repo (no
  // rewrite in vercel.json, no generated index) and structured data must not
  // point at a URL that 404s; schema.org's ListItem.item is optional, so an
  // unlinked middle crumb is valid and honest to the actual site structure.
  const breadcrumbJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('tcpBreadcrumbHome'), item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: t('tcpBreadcrumbTokens') },
      { '@type': 'ListItem', position: 3, name: rec.symbol, item: pageUrl }
    ]
  }).replace(/</g, '\\u003c');

  // ItemList + Dataset (046): the ItemList mirrors the visible pool table
  // exactly (same pools/order/links via poolHrefFor, no new computation) —
  // Google requires structured data to reflect visible content.
  const itemListJsonLd = renderItemListJsonLd(rec.pools, appUrl, language);
  const datasetJsonLd = renderDatasetJsonLd(
    t('tcpDatasetTokenName', rec.symbol),
    t('tcpDatasetTokenDescription', rec.symbol, floorStr),
    pageUrl,
    genDate
  );

  // Direct-answer + FAQ (047, GEO/AEO): built from the SAME gated `rec` the
  // table/intro above already use — never touches raw pool data, so an
  // anomalous/sub-floor pool structurally cannot reach the answer or FAQ.
  // 242: attributed to headlinePool (NOT `top`) — the pool bestApy came from.
  const { answer, faq } = buildAnswerAndFaq(rec.symbol, rec, bestApy, headlinePool, language);
  const answerBlock = renderAnswerBlockHtml(answer, 'tp-answer');
  const faqBlock = renderFaqBlockHtml(faq, 'tp-faq', language);
  const faqJsonLd = renderFaqJsonLd(faq);

  const relatedLinks = (related || []).map(r =>
    `<a href="${SITE_URL}/${language === 'ko' ? 'ko/tokens' : 'tokens'}/${r.slug}">${escapeHtml(r.symbol)}</a>`).join('\n        ');
  const relatedBlock = relatedLinks
    ? `    <nav class="related" aria-label="${escapeHtml(t('tcpRelatedTokensHeading'))}">
      <h2>${escapeHtml(t('tcpRelatedTokensHeading'))}</h2>
      <div class="related-links">
        ${relatedLinks}
      </div>
    </nav>\n`
    : '';

  // Cross-surface internal linking (049): chains this token trades on (only
  // ones with a real generated page) + the pool-type categories present in
  // this token's own table, linked to the live app view for that category.
  // Chain link targets stay on the same language variant as this page.
  const chainNavItems = (chainLinks || []).map(c =>
    ({ label: c.chain, href: `${SITE_URL}/${language === 'ko' ? 'ko/chains' : 'chains'}/${c.slug}` }));
  const chainLinksBlock = renderLinkNavHtml(chainNavItems, t('tcpChainsAriaLabel'), t('tcpAvailableOnHeading'), 'xlink-chains');
  // 204: category nav links are a visible estate->app boundary, tagged the
  // same as the main CTA below — categoryLinksFor itself stays untouched
  // (shared, unaware of which generator called it); the tag is applied here,
  // at the render site, over every item it returned (never skipped/duplicated).
  const categoryItems = categoryLinksFor(rec.pools, appUrl).map(c => ({ label: c.category, href: withSrc(c.url, 'seo_token') }));
  const categoryBlock = renderLinkNavHtml(categoryItems, t('tcpPoolCategoriesAriaLabel'), t('tcpByCategoryHeading'), 'xlink-category');

  // Waitlist CTA (062): the only path from this page into the card funnel.
  const waitlistBlock = renderWaitlistCtaHtml(t('tcpWaitlistPitchToken', rec.symbol), 'tp', 'seo_token', t);

  // Yield headline (066): honest per-token "your idle X could earn Y" pitch,
  // above the table, giving the waitlist CTA above a reason-to-act.
  const yieldHeadlineBlock = renderYieldHeadlineHtml(yieldHeadlineFor(rec, language), rec.symbol, t);

  // Rate-behaviour depth section (232): head-set pages ONLY (territory note
  // 6 — `opts.isHead` defaults false, so every existing caller stays byte-
  // identical). Placed after the pool table, before the FAQ block.
  const isHead = !!(opts && opts.isHead);
  const depthBlock = isHead ? renderRateBehaviourHtml(rateBehaviourFor(rec), rec.symbol, t) : '';

  const rows = rec.pools.map(p => {
    // Each pool links to its detail page (the app matches pool.pool ===
    // urlParams.pool). Falls back to the token app view if no id. Shared
    // with the ItemList JSON-LD above via poolHrefFor so they can't drift —
    // the visible row is tagged 'seo_token' (203); the JSON-LD call above is
    // NOT, so it stays clean (spec 203 §6, deliberate deviation).
    const poolHref = poolHrefFor(p, appUrl, 'seo_token');
    return `        <tr>
          <td><a class="tp-pool-link" href="${poolHref}">${escapeHtml(p.project || '—')} &rarr;</a></td>
          <td>${escapeHtml(p.chain || '—')}</td>
          <td class="num">${formatApy(poolTotalApy(p))}</td>
          <td class="num">${formatUsd(p.tvlUsd)}</td>
        </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${pageUrl}">
${renderHreflangLinks(enUrl, koUrl)}    <script type="application/ld+json">${breadcrumbJsonLd}</script>
    <script type="application/ld+json">${itemListJsonLd}</script>
    <script type="application/ld+json">${datasetJsonLd}</script>
    <script type="application/ld+json">${faqJsonLd}</script>
    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${ogImageUrl}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${ogImageUrl}">
    <meta name="robots" content="index,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
    <!-- Reuse the app's design system (247 world): style.css defines the
         --ui-* certificate-green tokens (the --color-*/--neuro-* names below
         are its deprecated aliases, still resolving) + Besley/Public Sans,
         preloaded above. The scoped block below styles this page with those
         tokens only — no hardcoded colors/gradients/fonts. -->
${renderFontPreloadLinks()}    <link rel="stylesheet" href="/style.css">
    <style>
      .tp-wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px; }
      .tp-wrap h1 { font-family: var(--font-family-display); font-size: 1.7rem; margin: 0 0 4px; color: var(--ui-text); }
      .tp-wrap .sub { color: var(--ui-text-secondary); margin: 0 0 16px; }
      .tp-wrap .intro { color: var(--ui-text); margin: 4px 0 22px; line-height: 1.6; }
      .tp-card { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); box-shadow: none; padding: 8px 18px; margin: 20px 0; }
      .tp-card table { width: 100%; border-collapse: collapse; }
      .tp-card th, .tp-card td { text-align: left; padding: 13px 8px; border-bottom: 1px solid var(--ui-border); color: var(--ui-text); }
      .tp-card th { color: var(--ui-text-secondary); font-weight: 600; }
      .tp-card td.num, .tp-card th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .tp-card tr:last-child td { border-bottom: none; }
      .tp-card tbody tr { transition: background .15s ease; }
      .tp-card tbody tr:hover { background: var(--ui-surface-muted); }
      .tp-pool-link { color: var(--ui-accent); text-decoration: none; font-weight: 500; }
      .tp-pool-link:hover { text-decoration: underline; }
      .tp-pool-link:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); border-radius: var(--ui-radius-sm); }
      @media (prefers-reduced-motion: reduce) { .tp-card tbody tr { transition: none; } }
      .tp-cta { display: inline-block; margin: 8px 0 4px; padding: 14px 24px; background: var(--ui-accent); color: var(--ui-on-accent); border: 1px solid transparent; border-radius: var(--ui-radius-md); box-shadow: none; text-decoration: none; font-weight: 600; transition: background .15s ease, transform .1s ease; }
      .tp-cta:hover { background: var(--ui-accent-hover); }
      .tp-cta:active { background: var(--ui-accent-active); transform: translateY(1px); }
      .tp-cta:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); }
      .related { margin: 30px 0 8px; }
      .related h2 { font-size: 1rem; margin-bottom: 12px; color: var(--ui-text); }
      .related-links a { display: inline-block; margin: 0 8px 8px 0; padding: 8px 14px; background: var(--ui-surface); color: var(--ui-accent); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-pill); box-shadow: none; text-decoration: none; font-size: .9rem; transition: background .15s ease, border-color .15s ease, transform .1s ease; }
      .related-links a:hover { background: var(--ui-surface-muted); border-color: var(--ui-border-strong); }
      .related-links a:active { background: var(--ui-surface-muted); transform: translateY(1px); }
      .related-links a:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); }
      .tp-wrap .note { color: var(--ui-text-secondary); font-size: .9rem; }
      .tp-answer { color: var(--ui-text); margin: 10px 0 18px; line-height: 1.6; font-weight: 500; }
      .tp-yield-headline { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); box-shadow: none; padding: 14px 18px; margin: 4px 0 18px; color: var(--ui-text); font-weight: 600; line-height: 1.5; }
      .tp-faq { margin: 30px 0 8px; }
      .tp-faq h2 { font-size: 1rem; margin-bottom: 12px; color: var(--ui-text); }
      .tp-faq-item { background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); box-shadow: none; padding: 14px 18px; margin: 0 0 12px; }
      .tp-faq-q { font-size: .95rem; margin: 0 0 6px; color: var(--ui-text); }
      .tp-faq-a { font-size: .9rem; margin: 0; color: var(--ui-text-secondary); line-height: 1.55; }
${renderRateBehaviourStyle(isHead)}      .scroll { overflow-x: auto; }
      @media (prefers-reduced-motion: reduce) { .tp-cta, .related-links a { transition: none; } .tp-cta:active, .related-links a:active { transform: none; } }
${renderWaitlistCtaStyle('tp')}    </style>
${renderAnalyticsBootstrap(`${language === 'ko' ? '/ko' : ''}/tokens/${rec.slug}`, { page_type: 'token_landing', token: rec.symbol, pool_count: rec.qualifyingCount, lang: language })}
</head>
<body>
  <main class="tp-wrap">
    <h1>${escapeHtml(t('tcpTokenHeading', rec.symbol))}</h1>
${answerBlock}    <p class="sub">${escapeHtml(t('tcpSubLine', rec.qualifyingCount, floorStr))}</p>
    <p class="intro">${intro}</p>
${yieldHeadlineBlock}    <a class="tp-cta" href="${withSrc(appUrl, 'seo_token')}">${escapeHtml(t('tcpTokenCta', rec.symbol))}</a>
    <div class="tp-card">
    <div class="scroll">
    <table>
      <thead>
        <tr><th>${escapeHtml(t('tcpColProtocol'))}</th><th>${escapeHtml(t('tcpColChain'))}</th><th class="num">${escapeHtml(t('tcpColApy'))}</th><th class="num">${escapeHtml(t('tcpColTvl'))}</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
    </div>
    </div>
${depthBlock}${faqBlock}${relatedBlock}${chainLinksBlock}${categoryBlock}${waitlistBlock}    <p class="note">${escapeHtml(t('tcpTrustNote', formatUsd(MIN_POOL_TVL)))}</p>
${renderLastUpdatedHtml(genDate, language)}    <p class="note"><a href="${SITE_URL}/">DeFi Garden 🌱</a> — ${escapeHtml(t('tcpFooterTagline'))}</p>
  </main>
</body>
</html>
`;
}

/** Markdown twin of renderTokenPage (spec 212): the SAME facts the HTML page
 * states, addressed at /tokens/<slug>.md (and its ko/ variant) for content
 * negotiation (`Accept: text/markdown`) — generated in the SAME run as the
 * HTML so the two can never drift. Built from the SAME gated `rec` + the
 * SAME buildAnswerAndFaq()/poolHrefFor()/formatUsd()/formatApy() the HTML
 * uses — never a re-derived number, never a re-worded answer/FAQ (the
 * fact-parity rule this item exists to satisfy, structurally). Same params
 * as renderTokenPage minus `ogImagePaths` — Markdown has no og:image use,
 * plus the trailing `opts` (232) — see renderTokenPage's own doc comment. */
function renderTokenPageMarkdown(rec, related, generatedDate, chainLinks, lang, opts) {
  const language = (lang === 'ko') ? 'ko' : 'en';
  const t = createTranslationFunction(language);
  const genDate = generatedDate || todayGeneratedDate();
  const appUrl = `${SITE_URL}/?token=${encodeURIComponent(rec.symbol)}&minTvl=${MIN_POOL_TVL}`;
  // 242: the SAME headlinePoolFor call renderTokenPage makes — bestApy and
  // the attributed pool always come from the same pool, in both twins.
  const headlinePool = headlinePoolFor(rec.pools);
  const bestApy = poolTotalApy(headlinePool);
  // 174: the floor claim below derives from MIN_POOL_TVL, same as the HTML —
  // never a re-typed literal.
  const floorStr = formatUsd(MIN_POOL_TVL);

  // Direct-answer + FAQ (047): the SAME function call renderTokenPage makes,
  // with the SAME args — reused verbatim, never re-worded (212 fact parity).
  const { answer, faq } = buildAnswerAndFaq(rec.symbol, rec, bestApy, headlinePool, language);

  // Rate-behaviour depth section (232): SAME head gate as the HTML twin —
  // see renderTokenPage's own comment. '' when not head, matching before.
  const isHead = !!(opts && opts.isHead);
  const depthMd = isHead ? renderRateBehaviourMarkdown(rateBehaviourFor(rec), rec.symbol, t) : '';

  // Real Markdown table, labelled columns, same data/link convention the
  // HTML's <tr> rows use (poolHrefFor + the 'seo_token' src attribution tag).
  const rows = rec.pools.map(p => {
    const poolHref = poolHrefFor(p, appUrl, 'seo_token');
    return `| [${mdEscape(p.project || '—')} →](${poolHref}) | ${mdEscape(p.chain || '—')} | ${formatApy(poolTotalApy(p))} | ${formatUsd(p.tvlUsd)} |`;
  }).join('\n');

  const faqMd = (faq || []).map(item => `### ${item.q}\n\n${item.a}`).join('\n\n');

  const relatedMd = (related && related.length)
    ? `\n## ${t('tcpRelatedTokensHeading')}\n\n` + related.map(r =>
        `- [${mdEscape(r.symbol)}](${SITE_URL}/${language === 'ko' ? 'ko/tokens' : 'tokens'}/${r.slug})`).join('\n') + '\n'
    : '';

  const chainLinksMd = (chainLinks && chainLinks.length)
    ? `\n## ${t('tcpAvailableOnHeading')}\n\n` + chainLinks.map(c =>
        `- [${mdEscape(c.chain)}](${SITE_URL}/${language === 'ko' ? 'ko/chains' : 'chains'}/${c.slug})`).join('\n') + '\n'
    : '';

  return `# ${t('tcpTokenHeading', rec.symbol)}

${answer}

| ${t('tcpColProtocol')} | ${t('tcpColChain')} | ${t('tcpColApy')} | ${t('tcpColTvl')} |
|---|---|---|---|
${rows}

${t('tcpTrustNote', floorStr)}

${depthMd}## ${t('tcpFaqHeading')}

${faqMd}
${relatedMd}${chainLinksMd}
## ${t('tcpLastUpdated', genDate)}
`;
}

/** Render a sitemap (urlset) of all generated /tokens/<slug> URLs (021),
 * plus any `extraLocs` (045: the /tokens hub + its A–Z sub-hub pages) so
 * they're discoverable through the same sitemap-index chain. */
function renderTokenSitemap(ranked, lastmod, extraLocs, lang) {
  // `lang` (050) only changes the base path (tokens/ vs ko/tokens/) — the
  // root urlset tag stays byte-identical to before when omitted, so the
  // existing en sitemap tests (exact-string urlset match) keep passing.
  // Reciprocal hreflang is declared on-page (renderHreflangLinks), which is
  // the primary signal Google reads; this is just KO URL coverage (050 AC).
  const base = (lang === 'ko') ? 'ko/tokens' : 'tokens';
  const lastmodTag = lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '';
  const extra = (extraLocs || []).map(loc =>
    `  <url>\n    <loc>${loc}</loc>\n${lastmodTag}    <changefreq>daily</changefreq>\n  </url>`);
  const urls = (ranked || []).map(rec =>
    `  <url>\n    <loc>${SITE_URL}/${base}/${rec.slug}</loc>\n${lastmodTag}    <changefreq>daily</changefreq>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${extra.concat(urls).join('\n')}\n</urlset>\n`;
}

// --- IO layer (only runs as a script) --------------------------------------
function fetchPoolData() {
  return new Promise((resolve, reject) => {
    https.get(YIELDS_API, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (e) { reject(new Error('parse failed: ' + e.message)); }
      });
    }).on('error', (e) => reject(new Error('API request failed: ' + e.message)));
  });
}

// 112: load pools from a fixture/transient, failing SAFE to live. Returns an
// array only when the fixture holds a non-empty pool array; otherwise null so
// the caller live-fetches (never a truncated/empty run that would prune SEO).
function loadFixturePools(fixturePath) {
  if (!fixturePath) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const arr = raw && raw.data ? raw.data : raw;
    if (Array.isArray(arr) && arr.length > 0) return arr;
    console.warn('⚠️  Fixture empty — live fallback:', fixturePath);
    return null;
  } catch (e) {
    console.warn('⚠️  Fixture missing/malformed — live fallback:', fixturePath, '(' + e.message + ')');
    return null;
  }
}

function parseArgs(argv) {
  const args = { fixture: process.env.POOLS_FIXTURE || null, out: 'tokens', limit: DEFAULT_LIMIT, sitemap: 'sitemap-token-pages.xml' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixture') args.fixture = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10) || DEFAULT_LIMIT;
    else if (argv[i] === '--sitemap') args.sitemap = argv[++i];
    else if (argv[i] === '--no-sitemap') args.sitemap = null;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let pools = loadFixturePools(args.fixture);
  if (pools) {
    console.log('📄 Loaded pools from fixture:', args.fixture);
  } else {
    console.log('📡 Fetching pools from DefiLlama...');
    pools = await fetchPoolData();
  }
  console.log(`✅ ${pools.length} pools`);

  const ranked = rankTopTokens(pools, args.limit);
  console.log(`🏆 Top ${ranked.length} tokens by TVL (>= ${MIN_QUALIFYING_POOLS} qualifying pools each)`);
  // item 226: machine-checked soft-404 gate — throws loudly rather than ever
  // writing/sitemapping an empty-table page.
  assertNonEmptyPages(ranked, 'generate-token-pages.js tokens');

  // item 232 / territory note 3: hoisted out of `if (args.sitemap)` (where it
  // used to live) so the sitemap filter AND the depth-section head gate below
  // read the SAME Set — a second call/derivation would be the exact mirror
  // the 226 close-out warns against.
  const headTokens = selectHeadTokens(pools);

  // Per-page OG images (051): one per token slug, shared across en/ko (the
  // card data — symbol/best gated APY/pool count — doesn't vary by
  // language, so a single PNG serves both variants' og:image). Lazy require,
  // same reason as generate-chain-pages.js below: generate-og-images.js
  // requires this module eagerly for poolTotalApy/formatApy, so a top-level
  // require here would be a load-time cycle.
  const { generateOgImages } = require('./generate-og-images.js');
  const outDir = path.resolve(args.out);
  // OG images land in the og/ sibling of outDir (same sibling convention as
  // koOutDir below), so a scratch run pointed at --out /scratch/tokens writes
  // /scratch/og/tokens and leaves the repo's committed og/tokens untouched.
  // On the CI path (--out tokens from the repo root) path.dirname(outDir) is
  // the repo root, i.e. byte-identical to the old process.cwd() behavior.
  const ogImagePaths = generateOgImages(ranked, 'tokens', rec => rec.symbol, path.dirname(outDir));
  console.log(`🖼️  Generated ${ogImagePaths.size} token OG images`);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // Clean stale pages first so tokens dropped by the gate (030) / renamed slugs
  // don't linger from a previous run. *.html AND *.md are removed (212 — an
  // orphaned Markdown twin of a page that no longer exists is the exact drift
  // failure mode this item exists to prevent), never other files, and never
  // if --out points at cwd — the CI commit then stages the deletions.
  if (outDir !== process.cwd()) {
    fs.readdirSync(outDir).forEach(f => {
      if (f.endsWith('.html') || f.endsWith('.md')) fs.rmSync(path.join(outDir, f));
    });
  }
  // One generation date for the whole run (048): every page's visible "Last
  // updated" line + dateModified schema agree, even across a long-running batch.
  const genDate = todayGeneratedDate();

  // Cross-surface linking (049): which /chains/<slug> pages will actually
  // exist, computed from this SAME `pools` fetch so token/chain eligibility
  // can never drift within one run. Lazy require (not at module top level) —
  // generate-chain-pages.js requires this module eagerly, so a top-level
  // require here would be a load-time cycle; deferring to inside main()
  // sidesteps it since this module has fully finished loading by the time
  // main() runs.
  const { rankTopChains } = require('./generate-chain-pages.js');
  const generatedChainSlugs = new Set(rankTopChains(pools, 0).map(c => c.slug));

  ranked.forEach(rec => {
    const chainLinks = chainLinksFor(rec, generatedChainSlugs);
    // 232: single Set, both languages — `opts.isHead` is the ONLY thing that
    // differs between a head and tail page's render call.
    const opts = { isHead: headTokens.has(rec.symbol.toUpperCase()) };
    fs.writeFileSync(path.join(outDir, `${rec.slug}.html`), renderTokenPage(rec, relatedFor(rec, ranked), genDate, chainLinks, 'en', ogImagePaths, opts));
    // 212: Markdown twin, written in the SAME loop from the SAME `rec`/`genDate`
    // so the two can never drift out of the same generation run.
    fs.writeFileSync(path.join(outDir, `${rec.slug}.md`), renderTokenPageMarkdown(rec, relatedFor(rec, ranked), genDate, chainLinks, 'en', opts));
  });
  console.log(`📝 Wrote ${ranked.length} pages to ${args.out}/`);

  // Hub + A–Z pages (045): de-orphan the surface — home.html links to
  // /tokens, which links every token within <=1 more hop.
  const azGroups = groupTokensAZ(ranked);
  fs.writeFileSync(path.join(outDir, 'index.html'), renderTokenHubPage(ranked, azGroups));
  const azDir = path.join(outDir, 'az');
  if (!fs.existsSync(azDir)) fs.mkdirSync(azDir, { recursive: true });
  // 212: predicate widened to .html-or-.md uniformly with the other cleanup
  // sites, even though A-Z pages never get a Markdown twin (no .md is ever
  // written here) — same safety, no behavior change.
  else fs.readdirSync(azDir).forEach(f => { if (f.endsWith('.html') || f.endsWith('.md')) fs.rmSync(path.join(azDir, f)); });
  azGroups.forEach(g => {
    fs.writeFileSync(path.join(azDir, `${g.slug}.html`), renderTokenAzPage(g));
  });
  console.log(`🧭 Wrote tokens hub + ${azGroups.length} A–Z pages`);

  // Korean variant (050): rendered from the SAME `ranked`/`azGroups` the en
  // pages just used — pool-parity (same pools, same TVL/APY numbers) is
  // structural, not something that can drift, since only renderTokenPage's
  // `lang` argument differs. Mirrors the en directory layout under ko/.
  // Sibling of outDir, not resolve('ko', args.out) — path.resolve() discards
  // the first arg entirely when the second is already absolute, which would
  // silently collapse koOutDir onto outDir itself (overwriting the en pages).
  const koOutDir = path.join(path.dirname(outDir), 'ko', path.basename(outDir));
  if (!fs.existsSync(koOutDir)) fs.mkdirSync(koOutDir, { recursive: true });
  if (koOutDir !== process.cwd()) {
    fs.readdirSync(koOutDir).forEach(f => { if (f.endsWith('.html') || f.endsWith('.md')) fs.rmSync(path.join(koOutDir, f)); });
  }
  ranked.forEach(rec => {
    const chainLinks = chainLinksFor(rec, generatedChainSlugs);
    const opts = { isHead: headTokens.has(rec.symbol.toUpperCase()) };
    fs.writeFileSync(path.join(koOutDir, `${rec.slug}.html`), renderTokenPage(rec, relatedFor(rec, ranked), genDate, chainLinks, 'ko', ogImagePaths, opts));
    fs.writeFileSync(path.join(koOutDir, `${rec.slug}.md`), renderTokenPageMarkdown(rec, relatedFor(rec, ranked), genDate, chainLinks, 'ko', opts));
  });
  fs.writeFileSync(path.join(koOutDir, 'index.html'), renderTokenHubPage(ranked, azGroups, 'ko'));
  const koAzDir = path.join(koOutDir, 'az');
  if (!fs.existsSync(koAzDir)) fs.mkdirSync(koAzDir, { recursive: true });
  else fs.readdirSync(koAzDir).forEach(f => { if (f.endsWith('.html') || f.endsWith('.md')) fs.rmSync(path.join(koAzDir, f)); });
  azGroups.forEach(g => {
    fs.writeFileSync(path.join(koAzDir, `${g.slug}.html`), renderTokenAzPage(g, 'ko'));
  });
  console.log(`🇰🇷 Wrote ${ranked.length} ko/tokens pages + ko hub + ${azGroups.length} ko A–Z pages`);

  if (args.sitemap) {
    const lastmod = new Date().toISOString().slice(0, 10);
    // item 226: pages are still written for EVERY ranked token above (nothing
    // deleted) — only the SITEMAP URL list is filtered to the demand-
    // plausible head (generate-sitemap.js's selectHeadTokens, the single
    // source of truth for this gate). Hub + A–Z URLs stay in the sitemap in
    // full. `headTokens` is the SAME Set computed above (232 / territory note
    // 3) — never a second call.
    const headRanked = ranked.filter(rec => headTokens.has(rec.symbol.toUpperCase()));
    const hubUrls = [`${SITE_URL}/tokens`].concat(azGroups.map(g => `${SITE_URL}/tokens/az/${g.slug}`));
    fs.writeFileSync(path.resolve(args.sitemap), renderTokenSitemap(headRanked, lastmod, hubUrls));
    console.log(`🗺️  Wrote ${args.sitemap} (${headRanked.length} head URLs of ${ranked.length} generated pages, + ${hubUrls.length} hub/A–Z URLs)`);

    const koSitemapPath = args.sitemap.replace(/\.xml$/, '-ko.xml');
    const koHubUrls = [`${SITE_URL}/ko/tokens`].concat(azGroups.map(g => `${SITE_URL}/ko/tokens/az/${g.slug}`));
    fs.writeFileSync(path.resolve(koSitemapPath), renderTokenSitemap(headRanked, lastmod, koHubUrls, 'ko'));
    console.log(`🗺️  Wrote ${koSitemapPath} (${headRanked.length} head URLs of ${ranked.length} generated pages, + ${koHubUrls.length} hub/A–Z URLs)`);
  }
}

// module.exports must be assigned BEFORE main() runs (not after, as this
// file previously had it): main() lazily requires generate-chain-pages.js
// (049, chainLinksFor's generatedChainSlugs), which requires this module
// right back — if main() ran first, that circular require would observe
// module.exports still at its default {}.
module.exports = {
  rankTopTokens, renderTokenPage, renderTokenPageMarkdown, mdEscape, relatedFor, renderTokenSitemap, tokenSlug, isQualifyingPool, isAnomalousApy,
  assertNonEmptyPages,
  isValidToken, poolTotalApy, formatUsd, formatApy, escapeHtml, renderAnalyticsBootstrap, tokenSymbols,
  groupTokensAZ, renderTokenHubPage, renderTokenAzPage, renderHubStyleBlock, HUB_TOP_N,
  poolHrefFor, withSrc, renderItemListJsonLd, renderDatasetJsonLd,
  buildAnswerAndFaq, renderAnswerBlockHtml, renderFaqBlockHtml, renderFaqJsonLd,
  todayGeneratedDate, renderLastUpdatedHtml, loadFixturePools,
  chainLinksFor, categoryLinksFor, renderLinkNavHtml,
  renderWaitlistCtaHtml, renderWaitlistCtaStyle,
  renderHreflangLinks, renderFontPreloadLinks, SUPPORTED_LANGS,
  yieldHeadlineFor, renderYieldHeadlineHtml, yieldHeadlineAnchor, ladderLabelText, YIELD_HEADLINE_ANCHOR_ID,
  rateBehaviourFor, renderRateBehaviourHtml, renderRateBehaviourMarkdown, renderRateBehaviourStyle, mean30dSane,
  MIN_POOL_TVL, APY_SANITY_LIMIT, MIN_QUALIFYING_POOLS, DEFAULT_LIMIT, SITE_URL, OG_FALLBACK_REL_PATH,
  REPRESENTATIVE_REL, REPRESENTATIVE_ABS_PP, representativenessRatio, isRepresentativeRate,
  headlinePoolFor
};

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
