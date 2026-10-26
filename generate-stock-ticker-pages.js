#!/usr/bin/env node
/**
 * Static per-ticker pages: /stocks/<ticker> (lowercase slug), one page per
 * underlying that has >= 2 VERIFIED token versions in data/stocks-versions.json
 * (written daily by generate-stocks-versions.js).
 *
 * Each page server-renders the side-by-side comparison of the verified versions
 * (issuer, chain, price, spread vs the median of the token versions, premium vs
 * the real share, supply, liquidity, best yield, CEX prices, structure /
 * redemption) so crawlers and agents read it without JavaScript. Unverified
 * tokens (the `unverified` arrays) are never read.
 *
 * Rules honoured here (CLAUDE.md): DeFi Score pillars appear only as
 * High / Medium / Low tiers (never numbers); every figure comes from the data
 * file; en-US fixed number formatting; Quiet --ui-* tokens only; no emojis.
 *
 * English only: there is no hreflang cluster for these pages (the in-app
 * languages do not cover the stocks surface).
 *
 * Output is a generated site output (scripts/site-outputs.txt: `stocks`), never
 * committed. The sitemap (sitemap-stock-pages.xml) is written by
 * generate-sitemap.js from the same eligibility predicate (`eligibleTickers`).
 *
 * Usage: node generate-stock-ticker-pages.js [--out stocks] [--data data/stocks-versions.json]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://www.defi.garden';
const BRAND = 'DeFi Garden';
const MAX_TITLE = 60;
const TIERS = new Set(['High', 'Medium', 'Low']);
const POOL_ID_RE = /^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/;
const TICKER_RE = /^[A-Z0-9][A-Z0-9.]{0,9}$/;
const PILLARS = [['stability', 'Yield stability'], ['sustainability', 'Sustainability'], ['stickiness', 'Capital stickiness'], ['liquidity', 'Exit liquidity']];
const VARIABLES = [
  'Token price (USD)', 'Spread vs median of token versions (%)', 'Premium vs the real share (%)',
  'Token supply (USD)', 'Pool TVL (USD)', 'Best projected yield (APY %)', 'DeFi Score rating',
  'Centralized-exchange price (USD)', 'Issuer legal entity and jurisdiction', 'US-person eligibility'
];

// ------------------------------------------------------------ formatting ---
// One fixed en-US formatting for every figure on the page.
const NF2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF4 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const NF0 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const isNum = (x) => typeof x === 'number' && isFinite(x);

const esc = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function fmtPrice(x) { return isNum(x) ? '$' + (Math.abs(x) >= 1 ? NF2.format(x) : NF4.format(x)) : null; }
function fmtUsd(x) { return isNum(x) ? '$' + NF0.format(x) : null; }
function fmtPct(x) { return isNum(x) ? (x > 0 ? '+' : '') + NF2.format(x) + '%' : null; }
function fmtApy(x) { return isNum(x) ? NF2.format(x) + '%' : null; }
function fmtMult(x) { return isNum(x) ? NF4.format(x) : null; }
function utcStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}
function isoDate(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function httpUrl(u) { return typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/.test(u) ? u : null; }
function link(u, text) {
  const safe = httpUrl(u);
  return safe ? '<a href="' + esc(safe) + '" rel="noopener noreferrer" target="_blank">' + esc(text) + '</a>' : '';
}
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
}

// ------------------------------------------------------------ eligibility ---
function slugOf(ticker) {
  return String(ticker).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function verifiedVersions(T) {
  return ((T && T.versions) || []).filter((v) => v && v.issuerSlug && v.issuerSlug !== 'unverified' && v.issuer);
}
/** Tickers with >= 2 verified versions, sorted by ticker. Reads only `versions`. */
function eligibleTickers(data) {
  const out = [];
  const tickers = (data && data.tickers) || {};
  Object.keys(tickers).sort().forEach((ticker) => {
    if (!TICKER_RE.test(ticker)) return;
    const slug = slugOf(ticker);
    if (!slug || slug === 'index') return;
    const versions = verifiedVersions(tickers[ticker]);
    if (versions.length >= 2) out.push({ ticker, slug, name: tickers[ticker].name || ticker, versions });
  });
  return out;
}
function loadEligible(file) {
  try {
    return eligibleTickers(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (_e) { return []; }
}

// ------------------------------------------------------------ text pieces ---
function distinct(arr) { return Array.from(new Set(arr)); }
function issuerNames(versions) { return distinct(versions.map((v) => v.issuer)); }

/** <= 60 chars total: drop trailing issuers until it fits, then fall back to a count form. */
function buildTitle(ticker, versions) {
  const names = issuerNames(versions);
  const suffix = ' | ' + BRAND;
  const lead = ticker + ' tokenized stock: ';
  if (names.length === 1) {
    const one = lead + names[0] + ' versions' + suffix;
    if (one.length <= MAX_TITLE) return one;
  }
  for (let n = names.length; n >= 2; n--) {
    const t = lead + names.slice(0, n).join(' vs ') + (n < names.length ? ' +' + (names.length - n) : '') + suffix;
    if (t.length <= MAX_TITLE) return t;
  }
  const alt = ticker + ' tokenized stock: ' + versions.length + ' versions' + suffix;
  if (alt.length <= MAX_TITLE) return alt;
  return (ticker + ' tokenized stock' + suffix).slice(0, MAX_TITLE);
}
function buildH1(ticker, versions) {
  const names = issuerNames(versions);
  return ticker + ' tokenized stock: ' + names.join(' vs ') + ' — price, spread, liquidity, yield';
}
function spreadRange(versions) {
  const s = versions.filter((v) => !v.multiplierUnknown && isNum(v.spreadVsMedianPct)).map((v) => v.spreadVsMedianPct);
  return s.length >= 2 ? { lo: Math.min.apply(null, s), hi: Math.max.apply(null, s) } : null;
}
function buildDescription(ticker, T, versions, data) {
  const names = issuerNames(versions);
  const chains = distinct(versions.map((v) => v.chain));
  const date = isoDate(data.generatedAt);
  const parts = [
    ticker + (T.name && T.name !== ticker ? ' (' + T.name + ')' : '') + ' has ' + versions.length + ' verified tokenized versions from ' +
      names.length + ' issuer' + (names.length === 1 ? '' : 's') + ' on ' + chains.length + ' chain' + (chains.length === 1 ? '' : 's') + '.'
  ];
  const sr = spreadRange(versions);
  if (sr) parts.push('Price spread vs the median of token versions runs from ' + fmtPct(sr.lo) + ' to ' + fmtPct(sr.hi) + '.');
  parts.push('Compare price, supply, liquidity, best yield and exchange prices side by side.');
  if (date) parts.push('Data as of ' + date + '.');
  parts.push('Education, not advice.');
  return parts.join(' ');
}
function cexName(data, id) {
  const m = (data.cexSources || []).find((c) => c && c.id === id);
  if (m && m.name) return m.name;
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : 'Exchange';
}
function usText(v) {
  if (v === true) return 'US persons: eligible';
  if (v === false) return 'US persons: not eligible';
  return 'US persons: not confirmed';
}

// ------------------------------------------------------------ table cells ---
const DASH_NA = '<span class="st-na">Not available</span>';

function cellIssuer(v, data) {
  const r = v.risk || {};
  const iss = (data.issuers || {})[v.issuerSlug] || {};
  const entity = [r.legalEntity, r.jurisdiction].filter(Boolean).join(', ');
  let h = '<strong>' + esc(v.issuer) + '</strong>';
  if (v.symbol) h += ' <span class="st-sym">' + esc(v.symbol) + '</span>';
  if (v.wrapper) h += '<div class="st-sub">Wrapped token</div>';
  if (entity) h += '<div class="st-sub">' + esc(entity) + '</div>';
  h += '<div class="st-sub">' + esc(usText(r.usPersons)) + (iss.usPersonsSource ? ' (' + link(iss.usPersonsSource, 'source') + ')' : '') + '</div>';
  return h;
}
function cellPrice(v) {
  if (!isNum(v.priceUsd)) return DASH_NA;
  let h = '<strong>' + esc(fmtPrice(v.priceUsd)) + '</strong>';
  const ts = utcStamp(v.priceTs);
  if (ts) h += '<div class="st-sub">' + esc(ts) + '</div>';
  h += '<div class="st-sub">' + (isNum(v.multiplier) ? esc(fmtMult(v.multiplier)) + ' shares per token' : 'Shares per token: not published') + '</div>';
  return h;
}
function cellSpread(v) {
  if (v.multiplierUnknown || !isNum(v.multiplier)) return '<span class="st-na">No spread (multiplier unknown)</span>';
  if (!isNum(v.spreadVsMedianPct)) return DASH_NA;
  return '<strong>' + esc(fmtPct(v.spreadVsMedianPct)) + '</strong>';
}
function cellPremium(v, T) {
  if (!isNum(v.premiumVsClosePct)) {
    return '<span class="st-dash" title="Reference price unavailable" aria-hidden="true">—</span><span class="st-sr">Reference price unavailable</span>';
  }
  const rc = T.referenceClose;
  const kind = rc && rc.date ? 'vs last close ' + rc.date : 'vs reference price';
  return '<strong>' + esc(fmtPct(v.premiumVsClosePct)) + '</strong><div class="st-sub">' + esc(kind) + '</div>';
}
function cellSupply(v) {
  return isNum(v.supplyUsd) ? esc(fmtUsd(v.supplyUsd)) : DASH_NA;
}
function cellLiquidity(v) {
  const l = v.liquidity || {};
  if (!isNum(l.tvlUsd)) return DASH_NA;
  if (l.tvlUsd <= 0 || l.pools === 0) return '<span class="st-na">No DeFi pools</span>';
  let h = '<strong>' + esc(fmtUsd(l.tvlUsd)) + '</strong><div class="st-sub">Pool TVL' + (isNum(l.pools) ? ', ' + esc(NF0.format(l.pools)) + ' pool' + (l.pools === 1 ? '' : 's') : '') + '</div>';
  if (isNum(l.depth2pctUsd)) h += '<div class="st-sub">±2% depth ' + esc(fmtUsd(l.depth2pctUsd)) + '</div>';
  return h;
}
function yieldLine(label, y) {
  if (!y || !isNum(y.honestProjection)) return '';
  const ds = y.defiScore;
  const rating = ds && typeof ds.rating === 'string' && ds.rating ? ds.rating : null;
  let h = '<div class="st-yield"><div class="st-yline"><span class="st-sub">' + esc(label) + '</span> <strong>' + esc(fmtApy(y.honestProjection)) + '</strong>';
  if (rating) h += ' · <span title="DeFi Score rating (DeFi Garden model output, not a credit rating)">' + esc(rating) + '</span>';
  if (typeof y.pool === 'string' && POOL_ID_RE.test(y.pool)) {
    h += ' · <a href="/?pool=' + esc(y.pool) + '" aria-label="' + esc(label + ' pool details' + (y.project ? ' (' + y.project + ')' : '')) + '" title="Pool details' + (y.project ? ' (' + esc(y.project) + ')' : '') + '">↗</a>';
  }
  h += '</div>';
  const t = ds && ds.pillarsTier;
  if (t) {
    const bits = PILLARS.filter((p) => TIERS.has(t[p[0]])).map((p) => '<li>' + esc(p[1]) + ': ' + esc(t[p[0]]) + '</li>');
    if (bits.length) h += '<details class="st-pillars"><summary>Pillar tiers</summary><ul>' + bits.join('') + '</ul></details>';
  }
  return h + '</div>';
}
function cellYield(v) {
  const by = v.bestYield || {};
  const h = yieldLine('LP', by.lp) + yieldLine('Lending', by.lending);
  return h || DASH_NA;
}
function cellCex(v, data) {
  const rows = (v.cex || []).filter((c) => c && isNum(c.priceUsd));
  if (!rows.length) return DASH_NA;
  return rows.map((c) => '<div>' + esc(cexName(data, c.exchange)) + ': <strong>' + esc(fmtPrice(c.priceUsd)) + '</strong></div>').join('');
}
function cellStructure(v, data) {
  const r = v.risk || {};
  const iss = (data.issuers || {})[v.issuerSlug] || {};
  const bits = [];
  if (r.structure) bits.push('<div>' + esc(r.structure) + (iss.structureSource ? ' (' + link(iss.structureSource, 'source') + ')' : '') + '</div>');
  if (r.mintRedeemHours) bits.push('<div class="st-sub">Mint and redeem: ' + esc(r.mintRedeemHours) + (iss.mintRedeemHoursSource ? ' (' + link(iss.mintRedeemHoursSource, 'source') + ')' : '') + '</div>');
  if (isNum(r.redemptionMinUsd)) bits.push('<div class="st-sub">Minimum redemption: ' + esc(fmtUsd(r.redemptionMinUsd)) + (iss.redemptionMinSource ? ' (' + link(iss.redemptionMinSource, 'source') + ')' : '') + '</div>');
  return bits.length ? bits.join('') : DASH_NA;
}

function buildTable(ticker, T, versions, data) {
  const head = ['Issuer', 'Chain', 'Price', 'Spread vs median of token versions', 'Premium vs the real share', 'Supply (USD)', 'Liquidity', 'Best yield', 'CEX', 'Structure / redemption'];
  let h = '<div class="st-scroll" role="region" aria-label="' + esc(ticker) + ' token versions comparison, scrolls horizontally" tabindex="0">\n';
  h += '<table class="st-table">\n<caption class="st-sr">' + esc(ticker) + ' verified tokenized versions compared side by side</caption>\n<thead><tr>';
  head.forEach((c, i) => { h += '<th scope="col"' + (i === 0 ? ' class="st-first"' : '') + '>' + esc(c) + '</th>'; });
  h += '</tr></thead>\n<tbody>\n';
  versions.forEach((v) => {
    h += '<tr><th scope="row" class="st-first">' + cellIssuer(v, data) + '</th>' +
      '<td>' + esc(v.chain || '') + '</td>' +
      '<td>' + cellPrice(v) + '</td>' +
      '<td>' + cellSpread(v) + '</td>' +
      '<td>' + cellPremium(v, T) + '</td>' +
      '<td class="st-num">' + cellSupply(v) + '</td>' +
      '<td>' + cellLiquidity(v) + '</td>' +
      '<td>' + cellYield(v) + '</td>' +
      '<td>' + cellCex(v, data) + '</td>' +
      '<td class="st-wide">' + cellStructure(v, data) + '</td></tr>\n';
  });
  return h + '</tbody>\n</table>\n</div>';
}

/** "What differs": registry facts only, one item per issuer, null facts skipped. */
function buildDiffers(ticker, versions) {
  const items = [];
  distinct(versions.map((v) => v.issuerSlug)).forEach((slug) => {
    const vs = versions.filter((v) => v.issuerSlug === slug);
    const first = (f) => { for (let i = 0; i < vs.length; i++) { const x = (vs[i].risk || {})[f]; if (x !== null && x !== undefined && x !== '') return x; } return null; };
    const sentences = [];
    const entity = first('legalEntity'), jur = first('jurisdiction');
    if (entity && jur) sentences.push('Issued by ' + entity + ' (' + jur + ').');
    else if (entity) sentences.push('Issued by ' + entity + '.');
    else if (jur) sentences.push('Jurisdiction: ' + jur + '.');
    const structure = first('structure');
    if (structure) sentences.push('Structure: ' + String(structure).replace(/[.\s]+$/, '') + '.');
    const us = first('usPersons');
    if (us === true) sentences.push('Open to US persons.');
    else if (us === false) sentences.push('Not offered to US persons.');
    const hours = first('mintRedeemHours');
    if (hours) sentences.push('Mint and redeem: ' + String(hours).replace(/[.\s]+$/, '') + '.');
    const mults = vs.filter((v) => isNum(v.multiplier));
    if (mults.length) sentences.push('Multiplier: ' + distinct(mults.map((v) => fmtMult(v.multiplier))).join(' / ') + ' shares per token.');
    if (vs.some((v) => v.multiplierUnknown)) sentences.push('Shares per token not published, so no spread is computed for ' + distinct(vs.filter((v) => v.multiplierUnknown).map((v) => v.symbol).filter(Boolean)).join(', ') + '.');
    if (!sentences.length) return;
    items.push('<li><strong>' + esc(vs[0].issuer) + '.</strong> ' + esc(sentences.join(' ')) + '</li>');
  });
  return items.length ? '<ul class="st-list">\n' + items.join('\n') + '\n</ul>' : '';
}

function buildSources(versions, data) {
  const slugs = distinct(versions.map((v) => v.issuerSlug));
  const items = [];
  slugs.forEach((slug) => {
    const iss = (data.issuers || {})[slug];
    if (!iss) return;
    const links = distinct([].concat(iss.sources || [], [iss.structureSource, iss.usPersonsSource, iss.mintRedeemHoursSource, iss.multiplierSource]).filter(httpUrl))
      .map((u) => link(u, u.replace(/^https?:\/\//, '').replace(/\/$/, ''))).filter(Boolean);
    if (links.length) items.push('<li><strong>' + esc(iss.name || slug) + ':</strong> ' + links.join(' · ') + '</li>');
  });
  return items.length ? '<ul class="st-list">\n' + items.join('\n') + '\n</ul>' : '';
}

// ------------------------------------------------------------------- page ---
const STYLE = `
      .st-header { max-width: 1180px; margin: 0 auto; padding: 20px 20px 10px; display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 1px solid var(--ui-border); }
      .st-logo { font-family: var(--font-family-display); font-weight: 700; font-size: 1.15rem; color: var(--ui-text); text-decoration: none; white-space: nowrap; }
      .st-nav { display: flex; gap: 20px; flex-wrap: wrap; }
      .st-nav a { color: var(--ui-text-secondary); text-decoration: none; font-size: 0.9rem; }
      .st-nav a:hover { color: var(--ui-text); }
      .st-nav a[aria-current] { color: var(--ui-text); font-weight: 600; }
      .st-nav a:focus-visible, .st-wrap a:focus-visible, .st-footer a:focus-visible, .st-scroll:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); border-radius: var(--ui-radius-sm); }
      .st-wrap { max-width: 1180px; margin: 0 auto; padding: 28px 20px 56px; color: var(--ui-text); line-height: 1.6; min-width: 0; }
      .st-wrap h1 { font-family: var(--font-family-display); font-size: 1.9rem; line-height: 1.25; margin: 0 0 10px; overflow-wrap: anywhere; }
      .st-wrap h2 { font-family: var(--font-family-display); font-size: 1.3rem; line-height: 1.3; margin: 36px 0 10px; }
      .st-wrap p, .st-wrap li { font-size: 1rem; }
      .st-wrap a { color: var(--ui-accent); }
      .st-byline { font-size: 0.85rem; color: var(--ui-text-muted); margin: 0 0 20px; padding-bottom: 14px; border-bottom: 1px solid var(--ui-border); }
      .st-notice { background: var(--ui-surface-muted); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: 12px 16px; margin: 16px 0; font-size: 0.93rem; }
      .st-notice p { margin: 0 0 6px; font-size: 0.93rem; }
      .st-notice p:last-child { margin: 0; }
      .st-yline { white-space: nowrap; }
      .st-pillars { margin-top: 2px; font-size: 12px; color: var(--ui-text-secondary); }
      .st-pillars summary { cursor: pointer; }
      .st-pillars ul { margin: 4px 0 0; padding-left: 16px; }
      .st-scroll { position: relative; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-lg); overflow-x: auto; max-width: 100%; margin: 14px 0 8px; -webkit-overflow-scrolling: touch; }
      .st-table { border-collapse: collapse; min-width: 1240px; width: 100%; }
      .st-table th, .st-table td { text-align: left; vertical-align: top; padding: 11px 10px; border-bottom: 1px solid var(--ui-border); font-size: 0.88rem; color: var(--ui-text); }
      .st-table thead th { color: var(--ui-text-secondary); font-weight: 600; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.03em; background: var(--ui-surface); white-space: nowrap; }
      .st-table tbody tr:last-child th, .st-table tbody tr:last-child td { border-bottom: none; }
      .st-table tbody th { font-weight: 400; }
      .st-first { min-width: 190px; }
      @media (min-width: 700px) { .st-first { position: sticky; left: 0; background: var(--ui-surface); z-index: 1; border-right: 1px solid var(--ui-border); } }
      .st-wide { min-width: 260px; }
      .st-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
      .st-sub { color: var(--ui-text-secondary); font-size: 0.8rem; line-height: 1.45; }
      .st-sym { color: var(--ui-text-muted); font-size: 0.8rem; }
      .st-na, .st-dash { color: var(--ui-text-muted); }
      .st-yield + .st-yield { margin-top: 8px; }
      .st-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
      .st-small { font-size: 0.86rem !important; color: var(--ui-text-secondary); }
      .st-list { padding-left: 20px; margin: 8px 0; }
      .st-list li { margin: 6px 0; }
      .st-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 10px 0; list-style: none; }
      .st-chips a { display: inline-block; padding: 4px 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-pill); background: var(--ui-surface); color: var(--ui-text); text-decoration: none; font-size: 0.88rem; }
      .st-chips a:hover { background: var(--ui-surface-muted); }
      .st-footer { max-width: 1180px; margin: 0 auto; padding: 24px 20px 40px; border-top: 1px solid var(--ui-border); font-size: 0.85rem; color: var(--ui-text-secondary); }
      .st-footer p { margin: 0 0 8px; }
      .st-footer a { color: var(--ui-accent); text-decoration: none; }
      .st-footer a:hover { text-decoration: underline; }
      @media (max-width: 560px) {
        .st-wrap h1 { font-size: 1.45rem; }
        .st-nav { gap: 14px; }
        .st-first { min-width: 150px; }
      }
`;

/**
 * Build one page. `ctx` = { data, siblings: [{ticker, slug}] }.
 * Returns { html, title, h1, description, slug, canonical }.
 */
function buildTickerPage(ticker, T, ctx) {
  const data = ctx.data;
  const versions = verifiedVersions(T);
  const slug = slugOf(ticker);
  const canonical = SITE_URL + '/stocks/' + slug;
  const title = buildTitle(ticker, versions);
  const h1 = buildH1(ticker, versions);
  const description = buildDescription(ticker, T, versions, data);
  const generated = utcStamp(data.generatedAt);
  const date = isoDate(data.generatedAt);
  const names = issuerNames(versions);
  const chains = distinct(versions.map((v) => v.chain));
  const siblings = (ctx.siblings || []).filter((s) => s.ticker !== ticker);

  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: BRAND, item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: 'Stocks', item: SITE_URL + '/stocks' },
      { '@type': 'ListItem', position: 3, name: ticker, item: canonical }
    ]
  };
  const dataset = {
    '@context': 'https://schema.org', '@type': 'Dataset',
    name: ticker + ' tokenized stock versions compared',
    description: description,
    url: canonical,
    isAccessibleForFree: true,
    inLanguage: 'en',
    creator: { '@type': 'Organization', name: BRAND, url: SITE_URL + '/' },
    publisher: { '@type': 'Organization', name: BRAND, url: SITE_URL + '/' },
    keywords: [ticker + ' tokenized stock', 'tokenized stocks', 'tokenized equities'].concat(names, ['price spread', 'on-chain liquidity', 'yield']),
    variableMeasured: VARIABLES.map((n) => ({ '@type': 'PropertyValue', name: n }))
  };
  if (date) { dataset.dateModified = date; dataset.datePublished = date; }

  const rcNote = T.referenceClose && isNum(T.referenceClose.price)
    ? 'Reference for the premium column: last regular close' + (T.referenceClose.date ? ' of ' + T.referenceClose.date : '') + ', ' + fmtPrice(T.referenceClose.price) + ' per share.'
    : 'The reference price of the real share is unavailable in this build, so the premium column shows a dash instead of a number.';

  const differs = buildDiffers(ticker, versions);
  const sources = buildSources(versions, data);

  let h = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
  h += '    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  h += '    <title>' + esc(title) + '</title>\n';
  h += '    <meta name="description" content="' + esc(description) + '">\n';
  h += '    <link rel="canonical" href="' + esc(canonical) + '">\n';
  h += '    <meta name="robots" content="index,follow">\n';
  h += '    <meta property="og:type" content="website">\n';
  h += '    <meta property="og:title" content="' + esc(title) + '">\n';
  h += '    <meta property="og:description" content="' + esc(description) + '">\n';
  h += '    <meta property="og:url" content="' + esc(canonical) + '">\n';
  h += '    <meta property="og:site_name" content="' + BRAND + '">\n';
  h += '    <meta property="og:locale" content="en_US">\n';
  h += '    <meta property="og:image" content="' + SITE_URL + '/og-image.png">\n';
  h += '    <meta name="twitter:card" content="summary_large_image">\n';
  h += '    <meta name="twitter:title" content="' + esc(title) + '">\n';
  h += '    <meta name="twitter:description" content="' + esc(description) + '">\n';
  h += '    <meta name="twitter:image" content="' + SITE_URL + '/og-image.png">\n';
  h += '    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Ccircle cx=\'50\' cy=\'50\' r=\'40\' fill=\'%232D5A3D\'/%3E%3C/svg%3E">\n';
  h += '    <link rel="preload" href="/fonts/PublicSans-latin-var.woff2" as="font" type="font/woff2" crossorigin>\n';
  h += '    <script>try{var th=localStorage.getItem(\'theme\');if(th)document.documentElement.setAttribute(\'data-theme\',th)}catch(e){}</script>\n';
  h += '    <link rel="stylesheet" href="/style.css">\n';
  h += '    <script type="application/ld+json">' + jsonLd(breadcrumb) + '</script>\n';
  h += '    <script type="application/ld+json">' + jsonLd(dataset) + '</script>\n';
  h += '    <style>' + STYLE + '    </style>\n</head>\n<body>\n';
  h += '    <header class="st-header">\n        <a href="/" class="st-logo">DeFi Garden</a>\n';
  h += '        <nav class="st-nav" aria-label="Primary navigation">\n';
  h += '            <a href="/?app=1">Search</a>\n            <a href="/stocks" aria-current="true">Stocks</a>\n';
  h += '            <a href="/methodology">Methodology</a>\n            <a href="/mcp">API</a>\n        </nav>\n    </header>\n\n';
  h += '    <main class="st-wrap">\n';
  h += '        <h1>' + esc(h1) + '</h1>\n';
  h += '        <p class="st-byline">DeFi Garden Research' + (generated ? ' · Data generated ' + esc(generated) : '') + ' · Education, not financial advice.</p>\n';
  h += '        <p>' + esc(ticker) + (T.name && T.name !== ticker ? ' (' + esc(T.name) + ')' : '') + ' has <strong>' + versions.length + ' verified tokenized versions</strong> from ' +
    names.length + ' issuer' + (names.length === 1 ? '' : 's') + ' on ' + chains.length + ' chain' + (chains.length === 1 ? '' : 's') + ' (' + esc(chains.join(', ')) + '). ' +
    'Each row below is a separate token with its own issuer, chain and terms. Only tokens whose issuer is verified from the issuer\'s own published list or announcement, or from an on-chain record, are included. ' +
    'For the live view with every pool, open <a href="/stocks?ticker=' + encodeURIComponent(ticker) + '">' + esc(ticker) + ' in the stocks terminal</a>.</p>\n';
  h += '        <div class="st-notice" role="note">\n';
  h += '            <p><strong>Spread vs median of token versions</strong> compares each token with the median price per share across all token versions of ' + esc(ticker) + ', after adjusting for shares per token. It is <strong>not</strong> a premium vs the real share.</p>\n';
  h += '            <p><strong>Premium vs the real share</strong> compares the token price with the price of the real share. ' + esc(rcNote) + '</p>\n';
  h += '        </div>\n';
  h += '        ' + buildTable(ticker, T, versions, data) + '\n';
  const med = isNum(T.medianNormalizedPrice) ? ' The median price per share across the token versions is ' + esc(fmtPrice(T.medianNormalizedPrice)) + '.' : '';
  h += '        <p class="st-small">Token prices are ' + esc(data.priceSource || 'DefiLlama coins') + '.' + med +
    ' Versions with an unknown shares-per-token multiplier are shown without a spread. Supply is the token supply valued at the token price. Liquidity is DefiLlama pool TVL; ±2% depth appears only when read on-chain. ' +
    'Best yield is DeFi Garden\'s projected APY (reward emissions are discounted and the projection never exceeds the current rate), with the pool\'s DeFi Score rating and High / Medium / Low pillar tiers. Exchange prices are public ticker prices of the listed exchange.</p>\n';
  if (differs) {
    h += '        <h2>What differs between versions</h2>\n        <p>Facts below come from the issuers\' own published documents; fields an issuer does not publish are left out.</p>\n        ' + differs + '\n';
  }
  if (sources) h += '        <h2>Sources</h2>\n        ' + sources + '\n';
  if (siblings.length) {
    h += '        <h2>Other tokenized stocks</h2>\n        <ul class="st-chips">\n' +
      siblings.map((s) => '            <li><a href="/stocks/' + esc(s.slug) + '">' + esc(s.ticker) + '</a></li>').join('\n') + '\n        </ul>\n';
  }
  h += '        <p><a href="/stocks">Back to the tokenized stocks yield terminal</a> · <a href="/methodology">How the DeFi Score works</a></p>\n';
  h += '    </main>\n\n';
  h += '    <footer class="st-footer">\n';
  h += '        <p>Education, not advice. DeFi Garden does not sell, broker or recommend any token; tokenized stocks are generally not offered to US persons and can lose value. DeFi Score bands are DeFi Garden\'s own model output, not a credit rating.</p>\n';
  h += '        <p>Powered by <a href="https://api-docs.defillama.com/" target="_blank" rel="noopener noreferrer">DefiLlama API</a>.</p>\n';
  h += '        <p><a href="/tokens">Browse tokens</a> · <a href="/chains">Browse chains</a> · <a href="/stocks">Stocks</a> · <a href="/methodology">Methodology</a> · <a href="/mcp">API</a></p>\n';
  h += '    </footer>\n</body>\n</html>\n';
  return { html: h, title, h1, description, slug, canonical };
}

/** Build every eligible page: [{ticker, slug, html, title, h1, description}]. */
function buildAll(data) {
  const elig = eligibleTickers(data);
  const siblings = elig.map((e) => ({ ticker: e.ticker, slug: e.slug }));
  return elig.map((e) => Object.assign({ ticker: e.ticker }, buildTickerPage(e.ticker, data.tickers[e.ticker], { data, siblings })));
}

// -------------------------------------------------------------------- CLI ---
function main() {
  const args = process.argv.slice(2);
  const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
  const outDir = path.resolve(arg('--out', 'stocks'));
  const dataFile = path.resolve(arg('--data', path.join(__dirname, 'data', 'stocks-versions.json')));
  let data;
  try { data = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch (e) {
    console.error('generate-stock-ticker-pages: ' + path.basename(dataFile) + ' unreadable (' + e.message + ') - leaving stocks/ untouched');
    return;
  }
  const pages = buildAll(data);
  fs.mkdirSync(outDir, { recursive: true });
  const keep = new Set(pages.map((p) => p.slug + '.html'));
  let removed = 0;
  fs.readdirSync(outDir).forEach((f) => {
    if (/\.html$/.test(f) && !keep.has(f)) { fs.unlinkSync(path.join(outDir, f)); removed++; }
  });
  pages.forEach((p) => fs.writeFileSync(path.join(outDir, p.slug + '.html'), p.html));
  console.log('generate-stock-ticker-pages: wrote ' + pages.length + ' page(s) to ' + path.relative(process.cwd(), outDir) + '/ (' + pages.map((p) => p.slug).join(', ') + '), removed ' + removed + ' stale');
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('generate-stock-ticker-pages failed:', e && e.message); process.exit(1); }
}

module.exports = { eligibleTickers, loadEligible, buildTickerPage, buildAll, buildTitle, buildH1, buildDescription, slugOf, verifiedVersions, MAX_TITLE, SITE_URL };
