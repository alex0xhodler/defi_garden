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
const { getPoolType } = require('./generate-sitemap.js');
// REUSE (spec 050): the same en/ko catalog + lookup helper the app already
// ships (translations.js is Node-requireable — module.exports at the bottom).
// Static pages are copy-only translated: pool data/numbers are identical
// between language variants (CLAUDE.md — en-US formatting, never per-locale).
const { createTranslationFunction } = require('./translations.js');

const SUPPORTED_LANGS = ['en', 'ko'];

// Canonical site URL — matches plan.html / home.html / generate-stories.js
const SITE_URL = 'https://www.defi.garden';
const YIELDS_API = 'https://yields.llama.fi/pools';

// --- Sanity rails & eligibility --------------------------------------------
// APY_SANITY_LIMIT is a TRUST RAIL (mirrors app.js:729 / planner.js): a pool
// whose total APY exceeds it may NEVER be shown or counted — untouched here.
//
// MIN_POOL_TVL is this SEO generator's OWN eligibility floor and DELIBERATELY
// diverges from the app's DEFAULT_MIN_TVL ($10M, app.js:730) per human directive
// 2026-07-11: the app's $10M floor governs what enters a savings PLAN (caution);
// these static token pages exist to capture long-tail search traffic from newer
// tokens, which a $10M floor + 2-pool minimum shut out. The pages still show
// only real, non-anomalous pools — just down to a $100K floor, any count >= 1.
const MIN_POOL_TVL = 100000;      // $100K eligibility floor for a page's pools
const APY_SANITY_LIMIT = 1000;    // TRUST RAIL: total APY above this may NEVER be shown
const MIN_QUALIFYING_POOLS = 1;   // a token needs >=1 qualifying pool to earn a page
const DEFAULT_LIMIT = 0;          // 0 = no cap: a page for every eligible token
const POOLS_PER_PAGE = 8;         // how many pools to list on each page
const HUB_TOP_N = 60;             // tokens linked directly on the /tokens hub before the A–Z tier takes over (045)
// Shared social/SERP image every page falls back to when it has no per-slug
// OG card of its own (hub/A-Z pages, or a generation failure — 051).
const OG_FALLBACK_REL_PATH = 'og-image.png';

// Token symbol validity — mirrors generate-sitemap.js isValidToken.
const TOKEN_REGEX = /^[A-Z0-9][A-Z0-9.\-_]{1,14}$/i;

function poolTotalApy(pool) {
  return (pool.apyBase || 0) + (pool.apyReward || 0);
}
function isAnomalousApy(pool) {
  return poolTotalApy(pool) > APY_SANITY_LIMIT;
}
function isQualifyingPool(pool) {
  return (pool.tvlUsd || 0) >= MIN_POOL_TVL && !isAnomalousApy(pool);
}
function isValidToken(symbol) {
  if (!symbol) return false;
  return TOKEN_REGEX.test(symbol);
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
    if (!shown.some(p => formatApy(poolTotalApy(p)) !== '0.00%')) return;
    records.push({
      symbol,
      slug: tokenSlug(symbol),
      totalTvl: rec.totalTvl,
      qualifyingCount: rec.qualifyingCount,
      pools: shown
    });
  });

  records.sort((a, b) => b.totalTvl - a.totalTvl);
  return (cap && cap > 0) ? records.slice(0, cap) : records;
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
      <p>${pitch}</p>
      <a class="${cssPrefix}-cta" href="/plan.html?waitlist=1&amp;src=${encodeURIComponent(source)}">${escapeHtml(t('tcpWaitlistCta'))}</a>
      <p class="${cssPrefix}-waitlist-micro">${escapeHtml(t('tcpWaitlistMicro'))}</p>
    </div>\n`;
}

/** Scoped CSS for renderWaitlistCtaHtml's block, appended to a page's
 * existing <style> — reuses the same neumorphic tokens as `.${cssPrefix}-card`
 * (no new colors/gradients, per the 2026-07-10 "reuse before inventing" rule). */
function renderWaitlistCtaStyle(cssPrefix) {
  return `      .${cssPrefix}-waitlist { background: var(--color-surface); border-radius: var(--neuro-radius-lg); box-shadow: var(--neuro-shadow-raised); padding: 20px 22px; margin: 24px 0; }
      .${cssPrefix}-waitlist h2 { font-size: 1rem; margin: 0 0 8px; color: var(--color-text); }
      .${cssPrefix}-waitlist p { color: var(--color-text-secondary); font-size: .92rem; margin: 0 0 14px; line-height: 1.55; }
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
      .hub-wrap h1 { font-size: 1.7rem; margin: 0 0 4px; color: var(--color-text); }
      .hub-wrap .sub { color: var(--color-text-secondary); margin: 0 0 16px; }
      .hub-wrap .intro { color: var(--color-text); margin: 4px 0 22px; line-height: 1.6; }
      .hub-card { background: var(--color-surface); border-radius: var(--neuro-radius-lg); box-shadow: var(--neuro-shadow-raised); padding: 18px; margin: 20px 0; }
      .hub-card h2 { font-size: 1rem; margin: 0 0 12px; color: var(--color-text); }
      .hub-links a { display: inline-block; margin: 0 8px 8px 0; padding: 8px 14px; background: var(--color-surface); color: var(--color-primary); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-subtle); text-decoration: none; font-size: .9rem; transition: box-shadow .2s ease; }
      .hub-links a:hover { box-shadow: var(--neuro-shadow-flat); }
      .hub-links a:active { box-shadow: var(--neuro-shadow-pressed); }
      .hub-links a:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--neuro-radius-sm); }
      .hub-cta { display: inline-block; margin: 8px 0 4px; padding: 14px 24px; background: var(--color-surface); color: var(--color-primary); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-raised); text-decoration: none; font-weight: 600; transition: box-shadow .2s ease, transform .2s ease; }
      .hub-cta:hover { box-shadow: var(--neuro-shadow-flat); transform: translateY(-2px); }
      .hub-cta:active { box-shadow: var(--neuro-shadow-pressed); transform: translateY(1px); }
      .hub-cta:focus-visible { outline: none; box-shadow: var(--focus-ring); }
      .hub-wrap .note { color: var(--color-text-secondary); font-size: .9rem; }
      @media (prefers-reduced-motion: reduce) { .hub-links a, .hub-cta { transition: none; } }
    </style>`;
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
    <link rel="stylesheet" href="/style.css">${renderHubStyleBlock()}
${renderAnalyticsBootstrap(`${language === 'ko' ? '/ko' : ''}/tokens`, { page_type: 'token_hub', token_count: ranked.length, lang: language })}
</head>
<body>
  <main class="hub-wrap">
    <h1>${escapeHtml(t('tcpTokenHubHeading'))}</h1>
    <p class="sub">${escapeHtml(t('tcpTokenHubSub', ranked.length))}</p>
    <p class="intro">${escapeHtml(t('tcpTokenHubIntro'))}</p>
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
    <p class="note">${escapeHtml(t('tcpTrustNote'))}</p>
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
    <link rel="stylesheet" href="/style.css">${renderHubStyleBlock()}
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
    <p class="note">${escapeHtml(t('tcpTrustNote'))}</p>
  </main>
</body>
</html>
`;
}

/** Resolves the same pool-detail (or fallback) URL a visible table row links
 * to (`p.pool ? /?pool=<id> : fallbackUrl`) — shared by row rendering AND
 * ItemList JSON-LD so the two can never drift (046: schema must match the
 * visible content byte-for-byte). */
function poolHrefFor(p, fallbackUrl) {
  return p.pool ? `${SITE_URL}/?pool=${encodeURIComponent(p.pool)}` : fallbackUrl;
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

  const answer = t('tcpAnswer', label, apyStr, project, chain, rec.qualifyingCount);

  const faq = [
    { q: t('tcpFaqQ1', label), a: t('tcpFaqA1', apyStr, project, chain) },
    { q: t('tcpFaqQ2', label), a: t('tcpFaqA2', rec.qualifyingCount, tvlStr) },
    { q: t('tcpFaqQ3'), a: t('tcpFaqA3') }
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

/** Render a single token's static landing page as an HTML string.
 * `ogImagePaths` (051): Map<slug, relPath> from generateOgImages — falls
 * back to the shared /og-image.png when the map is absent or has no entry
 * for this slug, so a page never ships without SOME og:image. */
function renderTokenPage(rec, related, generatedDate, chainLinks, lang, ogImagePaths) {
  const language = (lang === 'ko') ? 'ko' : 'en';
  const t = createTranslationFunction(language);
  const sym = escapeHtml(rec.symbol);
  const enUrl = `${SITE_URL}/tokens/${rec.slug}`;
  const koUrl = `${SITE_URL}/ko/tokens/${rec.slug}`;
  const pageUrl = language === 'ko' ? koUrl : enUrl;
  const appUrl = `${SITE_URL}/?token=${encodeURIComponent(rec.symbol)}`;
  const genDate = generatedDate || todayGeneratedDate();
  const ogImageRelPath = (ogImagePaths && ogImagePaths.get(rec.slug)) || OG_FALLBACK_REL_PATH;
  const ogImageUrl = `${SITE_URL}/${ogImageRelPath}`;
  const bestApy = Math.max(...rec.pools.map(poolTotalApy));
  const chainCount = new Set(rec.pools.map(p => p.chain)).size;
  const title = t('tcpTokenTitle', rec.symbol);
  const description = t('tcpTokenDescription', rec.symbol, rec.qualifyingCount, formatApy(bestApy), chainCount);

  // Unique per-token intro from real data (023: content depth — this reads
  // token-specifically even with the symbol removed, so it's not thin).
  const top = rec.pools[0];
  const intro = t('tcpTokenIntro', sym, escapeHtml(top.project || '—'), escapeHtml(top.chain || '—'),
    formatApy(poolTotalApy(top)), formatUsd(top.tvlUsd), rec.qualifyingCount, chainCount, formatUsd(rec.totalTvl));

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
    t('tcpDatasetTokenDescription', rec.symbol),
    pageUrl,
    genDate
  );

  // Direct-answer + FAQ (047, GEO/AEO): built from the SAME gated `rec` the
  // table/intro above already use — never touches raw pool data, so an
  // anomalous/sub-floor pool structurally cannot reach the answer or FAQ.
  const { answer, faq } = buildAnswerAndFaq(rec.symbol, rec, bestApy, top, language);
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
  const categoryItems = categoryLinksFor(rec.pools, appUrl).map(c => ({ label: c.category, href: c.url }));
  const categoryBlock = renderLinkNavHtml(categoryItems, t('tcpPoolCategoriesAriaLabel'), t('tcpByCategoryHeading'), 'xlink-category');

  // Waitlist CTA (062): the only path from this page into the card funnel.
  const waitlistBlock = renderWaitlistCtaHtml(t('tcpWaitlistPitchToken', rec.symbol), 'tp', 'seo_token', t);

  const rows = rec.pools.map(p => {
    // Each pool links to its detail page (the app matches pool.pool ===
    // urlParams.pool). Falls back to the token app view if no id. Shared
    // with the ItemList JSON-LD above via poolHrefFor so they can't drift.
    const poolHref = poolHrefFor(p, appUrl);
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
    <!-- Reuse the app's design system: style.css defines the neumorphic tokens
         (--color-*, --neuro-*) + the brand gradient body. The scoped block below
         styles this page with those tokens only — no hardcoded colors/gradients. -->
    <link rel="stylesheet" href="/style.css">
    <style>
      .tp-wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px; }
      .tp-wrap h1 { font-size: 1.7rem; margin: 0 0 4px; color: var(--color-text); }
      .tp-wrap .sub { color: var(--color-text-secondary); margin: 0 0 16px; }
      .tp-wrap .intro { color: var(--color-text); margin: 4px 0 22px; line-height: 1.6; }
      .tp-card { background: var(--color-surface); border-radius: var(--neuro-radius-lg); box-shadow: var(--neuro-shadow-raised); padding: 8px 18px; margin: 20px 0; }
      .tp-card table { width: 100%; border-collapse: collapse; }
      .tp-card th, .tp-card td { text-align: left; padding: 13px 8px; border-bottom: 1px solid var(--color-border); color: var(--color-text); }
      .tp-card th { color: var(--color-text-secondary); font-weight: 600; }
      .tp-card td.num, .tp-card th.num { text-align: right; }
      .tp-card tr:last-child td { border-bottom: none; }
      .tp-card tbody tr { transition: background .15s ease; }
      .tp-card tbody tr:hover { background: var(--color-background); }
      .tp-pool-link { color: var(--color-primary); text-decoration: none; font-weight: 500; }
      .tp-pool-link:hover { text-decoration: underline; }
      .tp-pool-link:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--neuro-radius-sm); }
      @media (prefers-reduced-motion: reduce) { .tp-card tbody tr { transition: none; } }
      .tp-cta { display: inline-block; margin: 8px 0 4px; padding: 14px 24px; background: var(--color-surface); color: var(--color-primary); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-raised); text-decoration: none; font-weight: 600; transition: box-shadow .2s ease, transform .2s ease; }
      .tp-cta:hover { box-shadow: var(--neuro-shadow-flat); transform: translateY(-2px); }
      .tp-cta:active { box-shadow: var(--neuro-shadow-pressed); transform: translateY(1px); }
      .tp-cta:focus-visible { outline: none; box-shadow: var(--focus-ring); }
      .related { margin: 30px 0 8px; }
      .related h2 { font-size: 1rem; margin-bottom: 12px; color: var(--color-text); }
      .related-links a { display: inline-block; margin: 0 8px 8px 0; padding: 8px 14px; background: var(--color-surface); color: var(--color-primary); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-subtle); text-decoration: none; font-size: .9rem; transition: box-shadow .2s ease; }
      .related-links a:hover { box-shadow: var(--neuro-shadow-flat); }
      .related-links a:active { box-shadow: var(--neuro-shadow-pressed); }
      .related-links a:focus-visible { outline: none; box-shadow: var(--focus-ring); }
      .tp-wrap .note { color: var(--color-text-secondary); font-size: .9rem; }
      .tp-answer { color: var(--color-text); margin: 10px 0 18px; line-height: 1.6; font-weight: 500; }
      .tp-faq { margin: 30px 0 8px; }
      .tp-faq h2 { font-size: 1rem; margin-bottom: 12px; color: var(--color-text); }
      .tp-faq-item { background: var(--color-surface); border-radius: var(--neuro-radius-md); box-shadow: var(--neuro-shadow-subtle); padding: 14px 18px; margin: 0 0 12px; }
      .tp-faq-q { font-size: .95rem; margin: 0 0 6px; color: var(--color-text); }
      .tp-faq-a { font-size: .9rem; margin: 0; color: var(--color-text-secondary); line-height: 1.55; }
      .scroll { overflow-x: auto; }
      @media (prefers-reduced-motion: reduce) { .tp-cta, .related-links a { transition: none; } }
${renderWaitlistCtaStyle('tp')}    </style>
${renderAnalyticsBootstrap(`${language === 'ko' ? '/ko' : ''}/tokens/${rec.slug}`, { page_type: 'token_landing', token: rec.symbol, pool_count: rec.qualifyingCount, lang: language })}
</head>
<body>
  <main class="tp-wrap">
    <h1>${escapeHtml(t('tcpTokenHeading', rec.symbol))}</h1>
${answerBlock}    <p class="sub">${escapeHtml(t('tcpSubLine', rec.qualifyingCount))}</p>
    <p class="intro">${intro}</p>
    <a class="tp-cta" href="${appUrl}">${escapeHtml(t('tcpTokenCta', rec.symbol))}</a>
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
${faqBlock}${relatedBlock}${chainLinksBlock}${categoryBlock}${waitlistBlock}    <p class="note">${escapeHtml(t('tcpTrustNote'))}</p>
${renderLastUpdatedHtml(genDate, language)}    <p class="note"><a href="${SITE_URL}/">DeFi Garden 🌱</a> — ${escapeHtml(t('tcpFooterTagline'))}</p>
  </main>
</body>
</html>
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
  let pools;
  if (args.fixture) {
    console.log('📄 Loading pools from fixture:', args.fixture);
    const raw = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
    pools = raw.data || raw;
  } else {
    console.log('📡 Fetching pools from DefiLlama...');
    pools = await fetchPoolData();
  }
  console.log(`✅ ${pools.length} pools`);

  const ranked = rankTopTokens(pools, args.limit);
  console.log(`🏆 Top ${ranked.length} tokens by TVL (>= ${MIN_QUALIFYING_POOLS} qualifying pools each)`);

  // Per-page OG images (051): one per token slug, shared across en/ko (the
  // card data — symbol/best gated APY/pool count — doesn't vary by
  // language, so a single PNG serves both variants' og:image). Lazy require,
  // same reason as generate-chain-pages.js below: generate-og-images.js
  // requires this module eagerly for poolTotalApy/formatApy, so a top-level
  // require here would be a load-time cycle.
  const { generateOgImages } = require('./generate-og-images.js');
  const ogImagePaths = generateOgImages(ranked, 'tokens', rec => rec.symbol, process.cwd());
  console.log(`🖼️  Generated ${ogImagePaths.size} token OG images`);

  const outDir = path.resolve(args.out);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // Clean stale pages first so tokens dropped by the gate (030) / renamed slugs
  // don't linger from a previous run. Only *.html is removed (never other files,
  // and never if --out points at cwd) — the CI commit then stages the deletions.
  if (outDir !== process.cwd()) {
    fs.readdirSync(outDir).forEach(f => {
      if (f.endsWith('.html')) fs.rmSync(path.join(outDir, f));
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
    fs.writeFileSync(path.join(outDir, `${rec.slug}.html`), renderTokenPage(rec, relatedFor(rec, ranked), genDate, chainLinks, 'en', ogImagePaths));
  });
  console.log(`📝 Wrote ${ranked.length} pages to ${args.out}/`);

  // Hub + A–Z pages (045): de-orphan the surface — home.html links to
  // /tokens, which links every token within <=1 more hop.
  const azGroups = groupTokensAZ(ranked);
  fs.writeFileSync(path.join(outDir, 'index.html'), renderTokenHubPage(ranked, azGroups));
  const azDir = path.join(outDir, 'az');
  if (!fs.existsSync(azDir)) fs.mkdirSync(azDir, { recursive: true });
  else fs.readdirSync(azDir).forEach(f => { if (f.endsWith('.html')) fs.rmSync(path.join(azDir, f)); });
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
    fs.readdirSync(koOutDir).forEach(f => { if (f.endsWith('.html')) fs.rmSync(path.join(koOutDir, f)); });
  }
  ranked.forEach(rec => {
    const chainLinks = chainLinksFor(rec, generatedChainSlugs);
    fs.writeFileSync(path.join(koOutDir, `${rec.slug}.html`), renderTokenPage(rec, relatedFor(rec, ranked), genDate, chainLinks, 'ko', ogImagePaths));
  });
  fs.writeFileSync(path.join(koOutDir, 'index.html'), renderTokenHubPage(ranked, azGroups, 'ko'));
  const koAzDir = path.join(koOutDir, 'az');
  if (!fs.existsSync(koAzDir)) fs.mkdirSync(koAzDir, { recursive: true });
  else fs.readdirSync(koAzDir).forEach(f => { if (f.endsWith('.html')) fs.rmSync(path.join(koAzDir, f)); });
  azGroups.forEach(g => {
    fs.writeFileSync(path.join(koAzDir, `${g.slug}.html`), renderTokenAzPage(g, 'ko'));
  });
  console.log(`🇰🇷 Wrote ${ranked.length} ko/tokens pages + ko hub + ${azGroups.length} ko A–Z pages`);

  if (args.sitemap) {
    const lastmod = new Date().toISOString().slice(0, 10);
    const hubUrls = [`${SITE_URL}/tokens`].concat(azGroups.map(g => `${SITE_URL}/tokens/az/${g.slug}`));
    fs.writeFileSync(path.resolve(args.sitemap), renderTokenSitemap(ranked, lastmod, hubUrls));
    console.log(`🗺️  Wrote ${args.sitemap} (${ranked.length + hubUrls.length} URLs)`);

    const koSitemapPath = args.sitemap.replace(/\.xml$/, '-ko.xml');
    const koHubUrls = [`${SITE_URL}/ko/tokens`].concat(azGroups.map(g => `${SITE_URL}/ko/tokens/az/${g.slug}`));
    fs.writeFileSync(path.resolve(koSitemapPath), renderTokenSitemap(ranked, lastmod, koHubUrls, 'ko'));
    console.log(`🗺️  Wrote ${koSitemapPath} (${ranked.length + koHubUrls.length} URLs)`);
  }
}

// module.exports must be assigned BEFORE main() runs (not after, as this
// file previously had it): main() lazily requires generate-chain-pages.js
// (049, chainLinksFor's generatedChainSlugs), which requires this module
// right back — if main() ran first, that circular require would observe
// module.exports still at its default {}.
module.exports = {
  rankTopTokens, renderTokenPage, relatedFor, renderTokenSitemap, tokenSlug, isQualifyingPool, isAnomalousApy,
  isValidToken, poolTotalApy, formatUsd, formatApy, escapeHtml, renderAnalyticsBootstrap, tokenSymbols,
  groupTokensAZ, renderTokenHubPage, renderTokenAzPage, renderHubStyleBlock, HUB_TOP_N,
  poolHrefFor, renderItemListJsonLd, renderDatasetJsonLd,
  buildAnswerAndFaq, renderAnswerBlockHtml, renderFaqBlockHtml, renderFaqJsonLd,
  todayGeneratedDate, renderLastUpdatedHtml,
  chainLinksFor, categoryLinksFor, renderLinkNavHtml,
  renderWaitlistCtaHtml, renderWaitlistCtaStyle,
  renderHreflangLinks, SUPPORTED_LANGS,
  MIN_POOL_TVL, APY_SANITY_LIMIT, MIN_QUALIFYING_POOLS, DEFAULT_LIMIT, SITE_URL, OG_FALLBACK_REL_PATH
};

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
