#!/usr/bin/env node

/**
 * Static protocol pages (W4, docs/seo-turnaround-plan-2026-10.md; owner decision
 * 2026-10-26). Writes protocols/<slug>.html (EN) and ko/protocols/<slug>.html
 * (KO) plus a /protocols hub, e.g. /protocols/aave-v3: how many of a protocol's
 * pools DeFi Garden scores, their rating distribution, median APY and 14-day
 * forecast, and a table of its largest scored pools.
 *
 * GATE (see generate-protocol-pages-core.js): >= PROTOCOL_MIN_POOLS scored pools
 * passing the trust rails AND >= PROTOCOL_MIN_TVL_USD combined TVL, top
 * PROTOCOL_PAGE_LIMIT by TVL. No page (not even noindex) for anything else; a
 * previously generated page that drops out is deleted on regeneration.
 *
 * HONESTY: every number is computed from data/pools-snapshot.json. The page
 * makes NO claims about a protocol's security record: it reports the model's
 * rating distribution and links to /methodology. Pillars render as tiers
 * (High / Medium / Low) only, read from defiScore.pillarsTier.
 *
 * Languages: EN + KO (the per-page KO pattern of the pool-score pages, with
 * hreflang alternates for both). PT/ES are not generated.
 *
 * Usage:
 *   node generate-protocol-pages.js
 *   node generate-protocol-pages.js --limit 80 --out protocols --no-sitemap
 */

const fs = require('fs');
const path = require('path');
const tp = require('./generate-token-pages.js');
const psp = require('./generate-pool-score-pages.js');
const core = require('./generate-protocol-pages-core.js');
const { getPoolType } = require('./generate-sitemap.js');
const { createTranslationFunction } = require('./i18n');
const { LANGUAGES, getLanguage, normalizeLang, langPath, langUrl, langDir } = require('./languages.js');
const { slugify } = require('./pool-page-links.js');
const { PERMISSIONED_PROJECT_LIST } = require('./permissioned-projects.js');

const {
  SITE_URL, formatUsd, formatApy, escapeHtml, renderAnalyticsBootstrap, renderFontPreloadLinks,
  renderHreflangLinks, renderDatasetJsonLd, toIsoDate, withSrc, OG_FALLBACK_REL_PATH,
  renderLanguageSwitcher, renderLangSwitchStyle, renderSitemapAlternates, neutralPathOfLoc,
  SITEMAP_URLSET_OPEN_XHTML, poolHrefFor, poolRelAttr
} = tp;
const {
  PROTOCOL_MIN_POOLS, PROTOCOL_MIN_TVL_USD, PROTOCOL_PAGE_LIMIT, PROTOCOL_TABLE_MAX_ROWS,
  selectProtocols, protocolDisplayName, poolTotalApy
} = core;

const ROOT = __dirname;
const GENERATOR_MARKER = '<!-- generated:protocol-pages -->';
const TITLE_MAX_CHARS = 60;
const PAGE_LANGS = ['en', 'ko'];                     // EN required, KO via the pool-page pattern
const MANIFEST_REL_PATH = 'data/protocol-pages.json';
const RATING_BANDS = ['AAA', 'AA', 'A', 'BBB', 'HIGH RISK'];
const PILLARS = psp.SCORE_PILLARS;
const TIER_LEVELS = Object.keys(psp.PILLAR_TIER_LEVEL);
const POOL_TYPE_KEYS = {
  'Lending': 'poolDetail.type.lending', 'LP/DEX': 'poolDetail.type.lpDex', 'Staking': 'poolDetail.type.staking',
  'Yield Derivatives': 'poolDetail.type.yieldDerivatives', 'RWA': 'poolDetail.type.rwa',
  'Yield Farming': 'poolDetail.type.yieldFarming'
};

// --- helpers -----------------------------------------------------------------
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function median(vals) {
  const a = vals.filter(isNum).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function fmtCount(n) { return Number(n).toLocaleString('en-US'); }
function fmtScore(n) { return psp.fmtNum(n, 1); }
function longDateFor(iso) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
function typeLabel(t, type) { return t(POOL_TYPE_KEYS[type] || POOL_TYPE_KEYS['Yield Farming']); }
function protocolsBase(lang) { return `${SITE_URL}${langPath(lang, '/protocols')}`; }

/** Aggregate stats for one selected protocol record (pure, from its pools). */
function protocolStats(rec) {
  const ps = rec.pools;
  const chains = new Map();
  const types = new Map();
  const ratings = {};
  ps.forEach(p => {
    const c = p.chain || '—';
    if (!chains.has(c)) chains.set(c, []);
    chains.get(c).push(p);
    const ty = getPoolType(p);
    if (!types.has(ty)) types.set(ty, []);
    types.get(ty).push(p);
    const r = p.defiScore.rating;
    ratings[r] = (ratings[r] || 0) + 1;
  });
  const group = (m) => Array.from(m.entries()).map(([key, g]) => ({
    key, count: g.length, tvl: g.reduce((s, p) => s + p.tvlUsd, 0), medApy: median(g.map(poolTotalApy))
  })).sort((a, b) => b.tvl - a.tvl || String(a.key).localeCompare(String(b.key)));
  return {
    count: ps.length,
    tvl: rec.tvl,
    chainCount: chains.size,
    medApy: median(ps.map(poolTotalApy)),
    medForecast: median(ps.map(p => p.forecast && p.forecast.p50)),
    ratings,
    byChain: group(chains),
    byType: group(types)
  };
}

function ratingMix(stats) {
  return RATING_BANDS.filter(b => stats.ratings[b]).map(b => `${b} ${fmtCount(stats.ratings[b])}`).join(' · ');
}

function pageTitle(name, t) {
  const cands = [t('prpTitle', name), t('prpTitleShort', name)];
  const fit = cands.find(c => c.length <= TITLE_MAX_CHARS);
  if (fit) return fit;
  return cands[1].slice(0, TITLE_MAX_CHARS - 1).replace(/\s+\S*$/, '') + '…';
}

// --- CSS (on top of the shared pool-page chrome) -----------------------------
function renderExtraStyle() {
  return `    <style>
      .prp-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; }
      .prp-scroll:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); }
      .prp-table { width: 100%; border-collapse: collapse; font-size: .88rem; }
      .prp-table th, .prp-table td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--cert-rule); color: var(--cert-ink); vertical-align: top; white-space: nowrap; }
      .prp-table th { font-family: var(--font-family-mono, monospace); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--cert-ink-2); font-weight: 700; }
      .prp-table td.num, .prp-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
      .prp-table td.num { font-family: var(--font-family-mono, monospace); }
      .prp-table a { color: var(--cert-green); text-decoration: none; font-weight: 600; }
      .prp-table a:hover { text-decoration: underline; color: var(--cert-green-hover); }
      .prp-table a:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); }
      .prp-tiers { display: inline-flex; gap: 3px; }
      .prp-tier { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 3px; box-sizing: border-box; border: 1px solid var(--cert-rule); font-family: var(--font-family-mono, monospace); font-size: 11px; font-weight: 700; color: var(--cert-ink-2); background: var(--cert-paper-deep); }
      .prp-tier-high { color: var(--cert-green); border-color: var(--cert-green); }
      .prp-tier-low { color: var(--cert-amber); border-color: var(--cert-amber); }
      .prp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      .prp-chips { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; }
      .prp-chips li { display: inline-flex; gap: 8px; align-items: baseline; padding: 6px 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-pill); background: var(--ui-surface); font-size: .9rem; }
      .prp-chips li b { font-family: var(--font-family-mono, monospace); font-variant-numeric: tabular-nums; }
      .prp-split { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .prp-links { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 8px 0 0; }
      .prp-links a { display: inline-flex; align-items: center; min-height: 40px; color: var(--cert-green); }
      .prp-wide { max-width: 1100px; }
      .prp-wide .decision-terminal-card, .prp-wide .dt-panel { min-width: 0; }
      .prp-wide .dt-grid { grid-template-columns: minmax(0, 1fr); }
      @media (max-width: 720px) { .prp-split { grid-template-columns: minmax(0, 1fr); } }
    </style>`;
}

function headBlock(opts) {
  const { t, language, title, description, pageUrl, neutralPath, jsonLd, analytics } = opts;
  const esc = escapeHtml;
  return `<!DOCTYPE html>
<html lang="${getLanguage(language).htmlLang}">
<head>
    ${GENERATOR_MARKER}
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${pageUrl}">
${renderHreflangLinks(neutralPath, PAGE_LANGS)}${jsonLd.map(j => `    <script type="application/ld+json">${j}</script>\n`).join('')}    <meta property="og:type" content="website">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:image" content="${SITE_URL}/${OG_FALLBACK_REL_PATH}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="robots" content="index,follow">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
${renderFontPreloadLinks()}    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/landing-styles.css">
    <link rel="stylesheet" href="/pool-detail-styles.min.css">
${psp.THEME_BOOT_SCRIPT}
${psp.renderStyle()}
${renderExtraStyle()}
${analytics}
</head>`;
}

function renderTierCell(pool, t) {
  const tiers = (pool.defiScore && pool.defiScore.pillarsTier) || {};
  const cells = PILLARS.map(pl => {
    const tier = tiers[pl.key];
    const label = t(pl.labelKey);
    if (!TIER_LEVELS.includes(tier)) {
      return `<span class="prp-tier" title="${escapeHtml(label)}"><span class="prp-sr">${escapeHtml(label)}</span><span aria-hidden="true">–</span></span>`;
    }
    const full = `${label}: ${t('pspTier' + tier)}`;
    return `<span class="prp-tier prp-tier-${tier.toLowerCase()}" title="${escapeHtml(full)}"><span class="prp-sr">${escapeHtml(full)}</span><span aria-hidden="true">${escapeHtml(t('prpTierLetter' + tier))}</span></span>`;
  }).join('');
  return `<span class="prp-tiers">${cells}</span>`;
}

function renderPoolRow(pool, t, language) {
  const esc = escapeHtml;
  const f = pool.forecast;
  const hasF = f && isNum(f.p10) && isNum(f.p50) && isNum(f.p90);
  const href = poolHrefFor(pool, `${SITE_URL}/?pool=${encodeURIComponent(pool.pool)}`, undefined, language);
  const type = typeLabel(t, getPoolType(pool));
  return `<tr>
          <td><a href="${esc(href)}"${poolRelAttr(pool)}>${esc(pool.symbol || '—')}</a></td>
          <td>${esc(pool.chain || '—')}</td>
          <td>${esc(type)}</td>
          <td class="num">${formatApy(poolTotalApy(pool))}</td>
          <td class="num">${hasF ? `${formatApy(f.p10)}–${formatApy(f.p90)}` : '—'}</td>
          <td class="num">${hasF ? formatApy(f.p50) : '—'}</td>
          <td>${esc(fmtScore(pool.defiScore.score))} · ${esc(pool.defiScore.rating)}</td>
          <td>${renderTierCell(pool, t)}</td>
          <td class="num">${formatUsd(pool.tvlUsd)}</td>
        </tr>`;
}

function groupTable(rows, keyLabel, t, mapKey) {
  const esc = escapeHtml;
  return `<div class="prp-scroll" tabindex="0" role="region" aria-label="${esc(keyLabel)}"><table class="prp-table">
        <thead><tr><th scope="col">${esc(keyLabel)}</th><th scope="col" class="num">${esc(t('prpColCount'))}</th><th scope="col" class="num">${esc(t('prpColMedApy'))}</th><th scope="col" class="num">${esc(t('prpColTvl'))}</th></tr></thead>
        <tbody>
        ${rows.map(r => `<tr><td>${esc(mapKey(r.key))}</td><td class="num">${fmtCount(r.count)}</td><td class="num">${r.medApy == null ? '—' : formatApy(r.medApy)}</td><td class="num">${formatUsd(r.tvl)}</td></tr>`).join('\n        ')}
        </tbody>
      </table></div>`;
}

// --- protocol page -----------------------------------------------------------
/** ctx: { snapshotIso }. rec: a selectProtocols record. */
function renderProtocolPage(rec, ctx, lang) {
  const language = normalizeLang(lang);
  const t = createTranslationFunction(language);
  const lc = psp.chromeCopy(language);
  const esc = escapeHtml;
  const name = protocolDisplayName(rec.project);
  const st = protocolStats(rec);
  const neutralPath = `/protocols/${rec.slug}`;
  const pageUrl = langUrl(SITE_URL, language, neutralPath);
  const genDate = longDateFor(ctx.snapshotIso);
  const snapIso = toIsoDate(ctx.snapshotIso);
  const title = pageTitle(name, t);
  const description = t('prpDescription', name, fmtCount(st.count), fmtCount(st.chainCount), formatUsd(st.tvl), st.medApy == null ? '—' : formatApy(st.medApy), genDate);
  const tableRows = rec.pools.slice(0, PROTOCOL_TABLE_MAX_ROWS);
  const appUrl = withSrc(`${SITE_URL}/?protocols=${encodeURIComponent(rec.slug)}`, 'seo_protocol');
  const typeNames = st.byType.map(r => `${typeLabel(t, r.key)} (${fmtCount(r.count)})`).join(', ');

  const crumbs = [
    { name: t('tcpBreadcrumbHome'), url: `${SITE_URL}/` },
    { name: t('prpBreadcrumbProtocols'), url: protocolsBase(language) },
    { name, url: pageUrl }
  ];
  const breadcrumbJsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url }))
  }).replace(/</g, '\\u003c');
  const crumbHtml = crumbs.map((c, i) => i === crumbs.length - 1
    ? `<li aria-current="page">${esc(c.name)}</li>` : `<li><a href="${c.url}">${esc(c.name)}</a></li>`).join('');
  const datasetJsonLd = renderDatasetJsonLd(t('prpH1', name), description, pageUrl, snapIso, {
    keywords: [name, 'DeFi Score', 'APY forecast', 'DeFi yields'],
    variableMeasured: [
      { name: 'APY', unitText: 'percent' }, { name: 'TVL', unitText: 'USD' },
      { name: 'DeFi Score', unitText: 'points out of 100' }, { name: '14-day APY forecast', unitText: 'percent' }
    ],
    temporalCoverage: snapIso
  });
  const itemListJsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'ItemList', name: t('prpPoolsHeading') + ': ' + name,
    itemListElement: tableRows.map((p, i) => ({
      '@type': 'ListItem', position: i + 1,
      name: `${name} ${p.symbol || ''} ${p.chain || ''}`.replace(/\s+/g, ' ').trim(),
      url: poolHrefFor(p, `${SITE_URL}/?pool=${encodeURIComponent(p.pool)}`, undefined, language)
    }))
  }).replace(/</g, '\\u003c');

  const stat = (label, value) => `<div class="dt-metric"><dt class="dt-metric-name">${esc(label)}</dt><dd class="dt-metric-val">${esc(value)}</dd></div>`;
  const stats = [
    stat(t('prpStatPools'), fmtCount(st.count)),
    stat(t('prpStatChains'), fmtCount(st.chainCount)),
    stat(t('prpStatTvl'), formatUsd(st.tvl)),
    st.medApy == null ? '' : stat(t('prpStatMedApy'), formatApy(st.medApy)),
    st.medForecast == null ? '' : stat(t('prpStatMedForecast'), formatApy(st.medForecast))
  ].filter(Boolean).join('\n        ');
  const summary = [
    t('prpSummary', name, fmtCount(st.count), fmtCount(st.chainCount), formatUsd(st.tvl), genDate),
    st.medApy == null ? '' : t('prpSummaryApy', formatApy(st.medApy)),
    st.medForecast == null ? '' : t('prpSummaryForecast', formatApy(st.medForecast)),
    t('prpTypesLine', typeNames)
  ].filter(Boolean).join(' ');
  const access = rec.permissioned ? `
    <section class="dt-panel dt-panel-full">
      <p class="dt-badge-tag">${esc(t('pspAccessRestricted'))}</p>
      <p>${esc(t('prpAccessLead', name))}</p>
      <p class="psp-note">${esc(t('pspAccessRestrictedNote'))}</p>
    </section>
` : '';
  const ratingChips = RATING_BANDS.filter(b => st.ratings[b])
    .map(b => `<li><span>${esc(b)}</span> <b>${fmtCount(st.ratings[b])}</b></li>`).join('\n          ');
  const capNote = rec.pools.length > tableRows.length
    ? `<p class="psp-note">${esc(t('prpPoolsCap', fmtCount(tableRows.length), fmtCount(rec.pools.length)))}</p>` : '';

  return `${headBlock({
    t, language, title, description, pageUrl, neutralPath,
    jsonLd: [breadcrumbJsonLd, datasetJsonLd, itemListJsonLd],
    analytics: renderAnalyticsBootstrap(`${langPath(language, '')}/protocols/${rec.slug}`, { page_type: 'protocol_page', protocol: rec.project, pool_count: st.count, lang: language })
  })}
<body>
  <div class="landing-app psp-page">
${psp.renderSiteHeader(lc, language)}
  <main class="psp-wrap prp-wide pool-detail-view">
${renderLanguageSwitcher(neutralPath, language, PAGE_LANGS, t)}    <nav class="psp-crumbs" aria-label="${esc(t('tcpBreadcrumbHome'))}"><ol>${crumbHtml}</ol></nav>
    <h1>${esc(t('prpH1', name))}</h1>
    <div class="decision-terminal-card">
    <div class="dt-grid">
    <section class="dt-panel dt-panel-full">
      <p>${esc(summary)}</p>
      <dl class="dt-metric-row psp-stats">
        ${stats}
      </dl>
      <p class="psp-note">${esc(t('prpDataNote', genDate))}</p>
    </section>
${access}
    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(t('prpRatingHeading'))}</h2>
      <p>${esc(t('prpRatingLead', name, fmtCount(st.count)))}</p>
      <ul class="prp-chips">
          ${ratingChips}
      </ul>
      <p class="psp-note">${esc(t('prpRatingNote'))}</p>
      <p class="prp-links"><a href="${SITE_URL}/methodology">${esc(t('prpMethodologyLink'))}</a></p>
    </section>

    <section class="dt-panel dt-panel-full">
      <h2 class="dt-panel-label">${esc(t('prpPoolsHeading'))}</h2>
      <div class="prp-scroll" tabindex="0" role="region" aria-label="${esc(t('prpPoolsHeading'))}"><table class="prp-table">
        <thead><tr>
          <th scope="col">${esc(t('prpColPool'))}</th><th scope="col">${esc(t('prpColChain'))}</th><th scope="col">${esc(t('prpColType'))}</th>
          <th scope="col" class="num">${esc(t('prpColApy'))}</th><th scope="col" class="num">${esc(t('prpColRange'))}</th><th scope="col" class="num">${esc(t('prpColCentral'))}</th>
          <th scope="col">${esc(t('prpColScore'))}</th><th scope="col">${esc(t('prpColTiers'))}</th><th scope="col" class="num">${esc(t('prpColTvl'))}</th>
        </tr></thead>
        <tbody>
        ${tableRows.map(p => renderPoolRow(p, t, language)).join('\n        ')}
        </tbody>
      </table></div>
      <p class="psp-note">${esc(t('prpTiersLegend'))}</p>
      ${capNote}
      <p class="prp-links"><a rel="nofollow" href="${esc(appUrl)}">${esc(t('prpPoolsAll'))}</a></p>
    </section>

    <div class="prp-split dt-panel-full">
      <section class="dt-panel">
        <h2 class="dt-panel-label">${esc(t('prpByChain'))}</h2>
        ${groupTable(st.byChain, t('prpColChain'), t, k => k)}
      </section>
      <section class="dt-panel">
        <h2 class="dt-panel-label">${esc(t('prpByType'))}</h2>
        ${groupTable(st.byType, t('prpColType'), t, k => typeLabel(t, k))}
      </section>
    </div>

    </div>
    </div>
    <p class="psp-foot">${esc(t('prpDisclaimer'))}</p>
    <p class="psp-foot">${esc(t('pspNotAdvice'))}</p>
  </main>
${psp.renderSiteFooter(t, language)}
  </div>
${psp.renderChromeScript(lc)}
</body>
</html>
`;
}

// --- hub ---------------------------------------------------------------------
function renderProtocolsHub(selected, ctx, lang) {
  const language = normalizeLang(lang);
  const t = createTranslationFunction(language);
  const lc = psp.chromeCopy(language);
  const esc = escapeHtml;
  const neutralPath = '/protocols';
  const pageUrl = langUrl(SITE_URL, language, neutralPath);
  const title = t('prpHubTitle');
  const description = t('prpHubDescription', fmtCount(selected.length));
  const rows = selected.map(rec => {
    const st = protocolStats(rec);
    return `<tr>
          <td><a href="${protocolsBase(language)}/${rec.slug}">${esc(protocolDisplayName(rec.project))}</a></td>
          <td class="num">${fmtCount(st.count)}</td>
          <td class="num">${formatUsd(st.tvl)}</td>
          <td>${esc(ratingMix(st))}</td>
          <td class="num">${st.medApy == null ? '—' : formatApy(st.medApy)}</td>
          <td>${esc(rec.permissioned ? t('prpAccessPermissioned') : t('prpAccessOpen'))}</td>
        </tr>`;
  }).join('\n        ');
  const crumbs = [{ name: t('tcpBreadcrumbHome'), url: `${SITE_URL}/` }, { name: t('prpBreadcrumbProtocols'), url: pageUrl }];
  const breadcrumbJsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url }))
  }).replace(/</g, '\\u003c');
  const itemListJsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'ItemList', name: t('prpHubH1'),
    itemListElement: selected.map((rec, i) => ({
      '@type': 'ListItem', position: i + 1, name: protocolDisplayName(rec.project), url: `${protocolsBase(language)}/${rec.slug}`
    }))
  }).replace(/</g, '\\u003c');

  return `${headBlock({
    t, language, title, description, pageUrl, neutralPath,
    jsonLd: [breadcrumbJsonLd, itemListJsonLd],
    analytics: renderAnalyticsBootstrap(`${langPath(language, '')}/protocols`, { page_type: 'protocol_hub', protocol_count: selected.length, lang: language })
  })}
<body>
  <div class="landing-app psp-page">
${psp.renderSiteHeader(lc, language)}
  <main class="psp-wrap prp-wide pool-detail-view">
${renderLanguageSwitcher(neutralPath, language, PAGE_LANGS, t)}    <nav class="psp-crumbs" aria-label="${esc(t('tcpBreadcrumbHome'))}"><ol><li><a href="${SITE_URL}/">${esc(t('tcpBreadcrumbHome'))}</a></li><li aria-current="page">${esc(t('prpBreadcrumbProtocols'))}</li></ol></nav>
    <h1>${esc(t('prpHubH1'))}</h1>
    <p class="psp-note">${esc(t('prpHubIntro', fmtCount(selected.length), fmtCount(PROTOCOL_MIN_POOLS), formatUsd(PROTOCOL_MIN_TVL_USD)))}</p>
    <div class="decision-terminal-card">
    <div class="dt-grid">
    <section class="dt-panel dt-panel-full">
      <div class="prp-scroll" tabindex="0" role="region" aria-label="${esc(t('prpHubH1'))}"><table class="prp-table">
        <thead><tr>
          <th scope="col">${esc(t('prpColProtocol'))}</th><th scope="col" class="num">${esc(t('prpColCount'))}</th><th scope="col" class="num">${esc(t('prpColTvl'))}</th>
          <th scope="col">${esc(t('prpColMix'))}</th><th scope="col" class="num">${esc(t('prpColMedApy'))}</th><th scope="col">${esc(t('prpColAccess'))}</th>
        </tr></thead>
        <tbody>
        ${rows}
        </tbody>
      </table></div>
      <p class="psp-note">${esc(t('prpRatingNote'))}</p>
      <p class="prp-links"><a href="${SITE_URL}/methodology">${esc(t('prpMethodologyLink'))}</a></p>
    </section>
    </div>
    </div>
    <p class="psp-foot">${esc(t('prpDisclaimer'))}</p>
    <p class="psp-foot">${esc(t('pspNotAdvice'))}</p>
  </main>
${psp.renderSiteFooter(t, language)}
  </div>
${psp.renderChromeScript(lc)}
</body>
</html>
`;
}

// --- sitemap -----------------------------------------------------------------
function renderProtocolsSitemap(selected, lastmod, lang) {
  const language = normalizeLang(lang);
  const base = protocolsBase(language);
  const tag = lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : '';
  const urls = [base].concat(selected.map(r => `${base}/${r.slug}`)).map(loc => {
    const alt = renderSitemapAlternates(neutralPathOfLoc(loc, language), PAGE_LANGS);
    return `  <url>\n    <loc>${loc}</loc>\n${alt}${tag}    <changefreq>daily</changefreq>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${SITEMAP_URLSET_OPEN_XHTML}\n${urls.join('\n')}\n</urlset>\n`;
}

// --- IO ----------------------------------------------------------------------
function removeStaleOwnedPages(dir, keep) {
  let removed = 0;
  if (!fs.existsSync(dir)) return 0;
  fs.readdirSync(dir).forEach(f => {
    if (!f.endsWith('.html') || keep.has(f)) return;
    const full = path.join(dir, f);
    let head = '';
    try { head = fs.readFileSync(full, 'utf8').slice(0, 400); } catch (e) { return; }
    if (head.includes(GENERATOR_MARKER)) { fs.rmSync(full); removed++; }
  });
  return removed;
}

function buildManifest(selected, snapshotIso) {
  return {
    generatedAt: snapshotIso,
    count: selected.length,
    pages: selected.map(r => ({ slug: r.slug, project: r.project, name: protocolDisplayName(r.project), pools: r.pools.length, tvlUsd: Math.round(r.tvl) }))
  };
}

function writeSet(outDir, language, selected, ctx) {
  fs.mkdirSync(outDir, { recursive: true });
  const keep = new Set(['index.html']);
  selected.forEach(rec => {
    keep.add(`${rec.slug}.html`);
    fs.writeFileSync(path.join(outDir, `${rec.slug}.html`), renderProtocolPage(rec, ctx, language));
  });
  fs.writeFileSync(path.join(outDir, 'index.html'), renderProtocolsHub(selected, ctx, language));
  return removeStaleOwnedPages(outDir, keep);
}

function parseArgs(argv) {
  const args = { limit: PROTOCOL_PAGE_LIMIT, out: 'protocols', snapshot: 'data/pools-snapshot.json', manifest: MANIFEST_REL_PATH, sitemap: 'sitemap-protocol-pages.xml' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') { const n = parseInt(argv[++i], 10); args.limit = Number.isNaN(n) ? PROTOCOL_PAGE_LIMIT : n; }
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--snapshot') args.snapshot = argv[++i];
    else if (a === '--manifest') args.manifest = argv[++i];
    else if (a === '--sitemap') args.sitemap = argv[++i];
    else if (a === '--no-sitemap') args.sitemap = null;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const snap = JSON.parse(fs.readFileSync(path.resolve(args.snapshot), 'utf8'));
  const snapshotIso = snap.generatedAt || new Date().toISOString();
  const { eligibleCount, selected } = selectProtocols(snap.pools || [], args.limit);
  if (!selected.length) throw new Error('generate-protocol-pages.js: zero eligible protocols — refusing to write an empty set');
  const ctx = { snapshotIso };
  const outDir = path.resolve(args.out);
  const removed = {};
  LANGUAGES.filter(l => PAGE_LANGS.includes(l.code)).forEach(l => {
    const dir = l.code === 'en' ? outDir : path.join(path.dirname(outDir), langDir(l.code), path.basename(outDir));
    removed[l.code] = writeSet(dir, l.code, selected, ctx);
  });
  fs.mkdirSync(path.dirname(path.resolve(args.manifest)), { recursive: true });
  fs.writeFileSync(path.resolve(args.manifest), JSON.stringify(buildManifest(selected, snapshotIso), null, 2) + '\n');
  if (args.sitemap) {
    const lastmod = snapshotIso.slice(0, 10);
    PAGE_LANGS.forEach(code => {
      const file = code === 'en' ? args.sitemap : args.sitemap.replace(/\.xml$/, `-${code}.xml`);
      fs.writeFileSync(path.resolve(file), renderProtocolsSitemap(selected, lastmod, code));
    });
  }
  console.log(`✅ ${eligibleCount} eligible protocols; wrote ${selected.length} pages in each of ${PAGE_LANGS.map(c => c.toUpperCase()).join('/')} (limit ${args.limit || 'none'}), removed ${PAGE_LANGS.map(c => removed[c]).join('+')} stale`);
}

module.exports = {
  GENERATOR_MARKER, PAGE_LANGS, MANIFEST_REL_PATH, TITLE_MAX_CHARS,
  protocolStats, pageTitle, renderProtocolPage, renderProtocolsHub, renderProtocolsSitemap,
  removeStaleOwnedPages, buildManifest, writeSet, parseArgs, median
};

if (require.main === module) {
  try { main(); } catch (e) { console.error('❌', e.message); process.exit(1); }
}
