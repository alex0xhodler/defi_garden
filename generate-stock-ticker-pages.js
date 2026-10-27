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
 * English at /stocks/<ticker> and natural Korean at /ko/stocks/<ticker> (written
 * with --ko-out), a reciprocal en / ko / x-default hreflang cluster, canonical per
 * language. The copy tables live in COPY below.
 *
 * Output is a generated site output (scripts/site-outputs.txt: `stocks`, `ko`), never
 * committed. The sitemap (sitemap-stock-pages.xml) is written by
 * generate-sitemap.js from the same eligibility predicate (`eligibleTickers`).
 *
 * Usage: node generate-stock-ticker-pages.js [--out stocks] [--ko-out ko/stocks] [--data data/stocks-versions.json]
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


// ------------------------------------------------------------ copy tables ---
// EN + KO strings of the page. KO is natural Korean in the register of the
// existing /stocks surface (stocks.js VERSIONS_COPY, formal-polite): that phrasing
// is reused where it exists (column names, premium / spread notes, structure
// labels). Tickers, issuer names, "DeFi Score", band names and registry facts
// quoted from issuers (legal entities, jurisdictions, structure wording) stay in
// their original language. Figures are en-US formatted in both languages.
const PILLAR_KO = { stability: '수익률 안정성', sustainability: '지속 가능성', stickiness: '자본 유지력', liquidity: '출금 유동성' };
const TIER_KO = { High: '높음', Medium: '보통', Low: '낮음' };
const COPY = {
  en: {
    htmlLang: 'en', ogLocale: 'en_US', stocksName: 'Stocks',
    nav: { search: 'Search', stocks: 'Stocks', methodology: 'Methodology', api: 'API', primary: 'Primary navigation' },
    title: {
      lead: (t) => t + ' tokenized stock: ',
      one: (n) => n + ' versions',
      many: (names, extra) => names.join(' vs ') + (extra ? ' +' + extra : ''),
      count: (t, n) => t + ' tokenized stock: ' + n + ' versions',
      bare: (t) => t + ' tokenized stock'
    },
    h1: (t, names) => t + ' tokenized stock: ' + names.join(' vs ') + ' — price, spread, liquidity, yield',
    desc: {
      head: (t, nm, n, ni, nc) => t + (nm ? ' (' + nm + ')' : '') + ' has ' + n + ' verified tokenized versions from ' + ni + ' issuer' + (ni === 1 ? '' : 's') + ' on ' + nc + ' chain' + (nc === 1 ? '' : 's') + '.',
      spread: (lo, hi) => 'Price spread vs the median of token versions runs from ' + lo + ' to ' + hi + '.',
      compare: 'Compare price, supply, liquidity, best yield and exchange prices side by side.',
      asOf: (d) => 'Data as of ' + d + '.',
      edu: 'Education, not advice.'
    },
    datasetName: (t) => t + ' tokenized stock versions compared',
    keywords: (t) => [t + ' tokenized stock', 'tokenized stocks', 'tokenized equities'],
    keywordsTail: ['price spread', 'on-chain liquidity', 'yield'],
    variables: [
      'Token price (USD)', 'Spread vs median of token versions (%)', 'Premium vs the real share (%)',
      'Token supply (USD)', 'Pool TVL (USD)', 'Best projected yield (APY %)', 'DeFi Score rating',
      'Centralized-exchange price (USD)', 'Issuer legal entity and jurisdiction', 'US-person eligibility'
    ],
    cexName: 'Exchange',
    us: { yes: 'US persons: eligible', no: 'US persons: not eligible', unknown: 'US persons: not confirmed' },
    na: 'Not available', source: 'source', wrapped: 'Wrapped token',
    sharesPer: (m) => m + ' shares per token', sharesUnknown: 'Shares per token: not published',
    noSpread: 'No spread (multiplier unknown)',
    refUnavailable: 'Reference price unavailable',
    premiumKind: (d) => d ? 'vs last close ' + d : 'vs reference price',
    noPools: 'No DeFi pools',
    poolTvl: (n) => 'Pool TVL' + (n === null ? '' : ', ' + NF0.format(n) + ' pool' + (n === 1 ? '' : 's')),
    depth: (v) => '±2% depth ' + v,
    yieldLp: 'LP', yieldLending: 'Lending',
    ratingTitle: 'DeFi Score rating (DeFi Garden model output, not a credit rating)',
    poolDetails: (label, proj) => label + ' pool details' + (proj ? ' (' + proj + ')' : ''),
    poolDetailsTitle: (proj) => 'Pool details' + (proj ? ' (' + proj + ')' : ''),
    pillarTiers: 'Pillar tiers',
    pillarName: (k, en) => en, tierName: (x) => x,
    mintRedeem: 'Mint and redeem: ', minRedeem: 'Minimum redemption: ',
    head: ['Issuer', 'Chain', 'Price', 'Spread vs median of token versions', 'Premium vs the real share', 'Supply (USD)', 'Liquidity', 'Best yield', 'CEX', 'Structure / redemption'],
    tableLabel: (t) => t + ' token versions comparison, scrolls horizontally',
    caption: (t) => t + ' verified tokenized versions compared side by side',
    differs: {
      issuedBy2: (e, j) => 'Issued by ' + e + ' (' + j + ').', issuedBy: (e) => 'Issued by ' + e + '.', jur: (j) => 'Jurisdiction: ' + j + '.',
      structure: (s) => 'Structure: ' + s + '.', usYes: 'Open to US persons.', usNo: 'Not offered to US persons.',
      hours: (h) => 'Mint and redeem: ' + h + '.', mult: (m) => 'Multiplier: ' + m + ' shares per token.',
      multUnknown: (syms) => 'Shares per token not published, so no spread is computed for ' + syms + '.'
    },
    byline: (g) => 'DeFi Garden Research' + (g ? ' · Data generated ' + g : '') + ' · Education, not financial advice.',
    intro: (t, nm, n, ni, nc, chains) => esc(t) + (nm ? ' (' + esc(nm) + ')' : '') + ' has <strong>' + n + ' verified tokenized versions</strong> from ' + ni + ' issuer' + (ni === 1 ? '' : 's') + ' on ' + nc + ' chain' + (nc === 1 ? '' : 's') + ' (' + esc(chains) + '). ' +
      'Each row below is a separate token with its own issuer, chain and terms. Only tokens whose issuer is verified from the issuer\'s own published list or announcement, or from an on-chain record, are included. ',
    liveView: (href, t) => 'For the live view with every pool, open <a href="' + href + '">' + esc(t) + ' in the stocks terminal</a>.',
    noticeSpread: (t) => '<strong>Spread vs median of token versions</strong> compares each token with the median price per share across all token versions of ' + esc(t) + ', after adjusting for shares per token. It is <strong>not</strong> a premium vs the real share.',
    noticePremium: (note) => '<strong>Premium vs the real share</strong> compares the token price with the price of the real share. ' + esc(note),
    refNote: (d, p) => 'Reference for the premium column: last regular close' + (d ? ' of ' + d : '') + ', ' + p + ' per share.',
    refNoteNone: 'The reference price of the real share is unavailable in this build, so the premium column shows a dash instead of a number.',
    smallNote: (src, med) => 'Token prices are ' + esc(src) + '.' + (med ? ' The median price per share across the token versions is ' + esc(med) + '.' : '') +
      ' Versions with an unknown shares-per-token multiplier are shown without a spread. Supply is the token supply valued at the token price. Liquidity is DefiLlama pool TVL; ±2% depth appears only when read on-chain. ' +
      'Best yield is DeFi Garden\'s projected APY (reward emissions are discounted and the projection never exceeds the current rate), with the pool\'s DeFi Score rating and High / Medium / Low pillar tiers. Exchange prices are public ticker prices of the listed exchange.',
    priceSourceDefault: 'DefiLlama coins',
    differsH2: 'What differs between versions', differsLead: 'Facts below come from the issuers\' own published documents; fields an issuer does not publish are left out.',
    sourcesH2: 'Sources', othersH2: 'Other tokenized stocks',
    backLinks: (stocksHref, methHref) => '<a href="' + stocksHref + '">Back to the tokenized stocks yield terminal</a> · <a href="' + methHref + '">How the DeFi Score works</a>',
    footerNote: 'Education, not advice. DeFi Garden does not sell, broker or recommend any token; tokenized stocks are generally not offered to US persons and can lose value. DeFi Score bands are DeFi Garden\'s own model output, not a credit rating.',
    poweredBy: 'Powered by', browseTokens: 'Browse tokens', browseChains: 'Browse chains',
    crumbs: { home: 'DeFi Garden', stocks: 'Stocks' },
    langSwitch: { label: 'Language', other: '한국어', otherLang: 'ko' }
  },
  ko: {
    htmlLang: 'ko', ogLocale: 'ko_KR', stocksName: '주식',
    nav: { search: '검색', stocks: '주식', methodology: '방법론', api: 'API', primary: '주요 메뉴' },
    title: {
      lead: (t) => t + ' 토큰화 주식: ',
      one: (n) => n + ' 버전',
      many: (names, extra) => names.join(' vs ') + (extra ? ' 외 ' + extra + '곳' : ''),
      count: (t, n) => t + ' 토큰화 주식: 버전 ' + n + '개',
      bare: (t) => t + ' 토큰화 주식'
    },
    h1: (t, names) => t + ' 토큰화 주식: ' + names.join(' vs ') + ' — 가격·차이·유동성·수익률 비교',
    desc: {
      head: (t, nm, n, ni, nc) => t + (nm ? ' (' + nm + ')' : '') + ' 토큰화 버전은 검증된 것만 ' + n + '개이며, 발행사 ' + ni + '곳이 체인 ' + nc + '개에 발행했습니다.',
      spread: (lo, hi) => '토큰 버전 중앙값 대비 가격 차이는 ' + lo + '에서 ' + hi + '까지입니다.',
      compare: '가격, 공급량, 유동성, 최고 수익률, 거래소 가격을 한눈에 비교합니다.',
      asOf: (d) => d + ' 기준 데이터입니다.',
      edu: '교육용이며 투자 조언이 아닙니다.'
    },
    datasetName: (t) => t + ' 토큰화 주식 버전 비교',
    keywords: (t) => [t + ' 토큰화 주식', '토큰화 주식', '토큰화 증권'],
    keywordsTail: ['가격 차이', '온체인 유동성', '수익률'],
    variables: [
      '토큰 가격 (USD)', '토큰 버전 중앙값 대비 차이 (%)', '실제 주식 대비 프리미엄 (%)',
      '토큰 공급량 (USD)', '풀 TVL (USD)', '최고 예상 수익률 (APY %)', 'DeFi Score 등급',
      '중앙화 거래소 가격 (USD)', '발행사 법인 및 관할', '미국인 이용 가능 여부'
    ],
    cexName: '거래소',
    us: { yes: '미국인(US person) 이용 가능', no: '미국인(US person) 이용 불가', unknown: '미국인(US person) 이용 여부 미확인' },
    na: '확인 불가', source: '출처', wrapped: '래핑 토큰',
    sharesPer: (m) => '토큰 1개당 주식 ' + m + '주', sharesUnknown: '토큰당 주식 수: 미공개',
    noSpread: '차이 없음 (배수 미확인)',
    refUnavailable: '기준가를 가져올 수 없음',
    premiumKind: (d) => d ? '마지막 종가 ' + d + ' 대비' : '기준가 대비',
    noPools: '디파이 풀 없음',
    poolTvl: (n) => '풀 TVL' + (n === null ? '' : ', 풀 ' + NF0.format(n) + '개'),
    depth: (v) => '±2% 깊이 ' + v,
    yieldLp: 'LP', yieldLending: '렌딩',
    ratingTitle: 'DeFi Score 등급 (DeFi Garden 모델 산출값이며 신용등급이 아닙니다)',
    poolDetails: (label, proj) => label + ' 풀 상세 정보' + (proj ? ' (' + proj + ')' : ''),
    poolDetailsTitle: (proj) => '풀 상세 정보' + (proj ? ' (' + proj + ')' : ''),
    pillarTiers: '지표 단계',
    pillarName: (k) => PILLAR_KO[k], tierName: (x) => TIER_KO[x],
    mintRedeem: '발행·상환 시간: ', minRedeem: '최소 상환액: ',
    head: ['발행사', '체인', '가격', '토큰 버전 중앙값 대비 차이', '주식 대비 프리미엄', '공급량 (USD)', '유동성', '최고 수익률', '거래소', '구조 · 상환'],
    tableLabel: (t) => t + ' 토큰 버전 비교 표, 가로로 스크롤됩니다',
    caption: (t) => '검증된 ' + t + ' 토큰화 버전을 나란히 비교한 표',
    differs: {
      issuedBy2: (e, j) => '발행 법인: ' + e + ' (' + j + ').', issuedBy: (e) => '발행 법인: ' + e + '.', jur: (j) => '관할: ' + j + '.',
      structure: (s) => '구조: ' + s + '.', usYes: '미국인(US person)도 이용할 수 있습니다.', usNo: '미국인(US person)에게는 제공하지 않습니다.',
      hours: (h) => '발행·상환 시간: ' + h + '.', mult: (m) => '배수: 토큰 1개당 주식 ' + m + '주.',
      multUnknown: (syms) => '토큰당 주식 수가 공개되지 않아 ' + syms + '의 차이는 계산하지 않습니다.'
    },
    byline: (g) => 'DeFi Garden 리서치' + (g ? ' · 데이터 생성 ' + g : '') + ' · 교육용이며 투자 조언이 아닙니다.',
    intro: (t, nm, n, ni, nc, chains) => esc(t) + (nm ? ' (' + esc(nm) + ')' : '') + ' 토큰화 버전은 검증된 것만 <strong>' + n + '개</strong>이며, 발행사 ' + ni + '곳이 체인 ' + nc + '개(' + esc(chains) + ')에 발행했습니다. ' +
      '아래 각 행은 발행사, 체인, 조건이 서로 다른 별개의 토큰입니다. 발행사가 직접 공개한 목록이나 공지, 또는 온체인 기록으로 발행사를 확인한 토큰만 포함합니다. ',
    liveView: (href, t) => '모든 풀이 담긴 실시간 화면은 <a href="' + href + '">주식 터미널의 ' + esc(t) + '</a>에서 확인하세요.',
    noticeSpread: (t) => '<strong>토큰 버전 중앙값 대비 차이</strong>는 토큰당 주식 수를 반영해, ' + esc(t) + '의 모든 토큰 버전의 주당 가격 중앙값과 각 토큰을 비교한 값입니다. 실제 주식 대비 프리미엄이 <strong>아닙니다</strong>.',
    noticePremium: (note) => '<strong>주식 대비 프리미엄</strong>은 토큰 가격을 실제 주식 가격과 비교한 값입니다. ' + esc(note),
    refNote: (d, p) => '프리미엄 열의 기준가: ' + (d ? d + ' ' : '') + '마지막 정규장 종가, 주당 ' + p + '.',
    refNoteNone: '이번 빌드에서는 실제 주식의 기준가를 가져올 수 없어, 프리미엄 열에는 숫자 대신 대시가 표시됩니다.',
    smallNote: (src, med) => '토큰 가격 출처: ' + esc(src) + '.' + (med ? ' 토큰 버전 전체의 주당 가격 중앙값은 ' + esc(med) + '입니다.' : '') +
      ' 토큰당 주식 수가 확인되지 않은 버전은 차이 없이 표시합니다. 공급량은 토큰 공급량에 토큰 가격을 곱한 값입니다. 유동성은 DefiLlama 풀 TVL이며, ±2% 깊이는 온체인에서 읽은 경우에만 표시합니다. ' +
      '최고 수익률은 DeFi Garden의 예상 APY입니다(보상 발행분은 할인해 반영하고, 예상치는 현재 금리를 넘지 않습니다). 해당 풀의 DeFi Score 등급과 높음 / 보통 / 낮음 지표 단계를 함께 보여 드립니다. 거래소 가격은 상장 거래소가 공개한 시세입니다.',
    priceSourceDefault: 'DefiLlama 코인 집계 (온체인 가격 집계)',
    differsH2: '버전별로 다른 점', differsLead: '아래 내용은 발행사가 직접 공개한 문서를 바탕으로 합니다. 발행사가 공개하지 않은 항목은 생략합니다.',
    sourcesH2: '출처', othersH2: '다른 토큰화 주식',
    backLinks: (stocksHref, methHref) => '<a href="' + stocksHref + '">토큰화 주식 수익률 터미널로 돌아가기</a> · <a href="' + methHref + '">DeFi Score는 어떻게 만들어지나요</a>',
    footerNote: '교육용이며 투자 조언이 아닙니다. DeFi Garden은 어떤 토큰도 판매, 중개, 추천하지 않습니다. 토큰화 주식은 대체로 미국인(US person)에게 제공되지 않으며 가치가 하락할 수 있습니다. DeFi Score 등급은 DeFi Garden의 자체 모델 산출값이며 신용등급이 아닙니다.',
    poweredBy: '데이터 제공:', browseTokens: '토큰 둘러보기', browseChains: '체인 둘러보기',
    crumbs: { home: '홈', stocks: '주식' },
    langSwitch: { label: '언어', other: 'EN', otherLang: 'en' }
  }
};
function copyFor(lang) { return COPY[lang] || COPY.en; }
/** Public path of a stock page / the terminal / methodology in a language. */
function stockPath(slug, lang) { return (lang === 'ko' ? '/ko' : '') + '/stocks/' + slug; }
function methodologyPath(lang) { return lang === 'ko' ? '/ko/methodology' : '/methodology'; }

// ------------------------------------------------------------ text pieces ---
function distinct(arr) { return Array.from(new Set(arr)); }
function issuerNames(versions) { return distinct(versions.map((v) => v.issuer)); }

/** <= 60 chars total: drop trailing issuers until it fits, then fall back to a count form. */
function buildTitle(ticker, versions, lang) {
  const C = copyFor(lang);
  const names = issuerNames(versions);
  const suffix = ' | ' + BRAND;
  const lead = C.title.lead(ticker);
  if (names.length === 1) {
    const one = lead + C.title.one(names[0]) + suffix;
    if (one.length <= MAX_TITLE) return one;
  }
  for (let n = names.length; n >= 2; n--) {
    const t = lead + C.title.many(names.slice(0, n), n < names.length ? names.length - n : 0) + suffix;
    if (t.length <= MAX_TITLE) return t;
  }
  const alt = C.title.count(ticker, versions.length) + suffix;
  if (alt.length <= MAX_TITLE) return alt;
  return (C.title.bare(ticker) + suffix).slice(0, MAX_TITLE);
}
function buildH1(ticker, versions, lang) {
  return copyFor(lang).h1(ticker, issuerNames(versions));
}
function spreadRange(versions) {
  const s = versions.filter((v) => !v.multiplierUnknown && isNum(v.spreadVsMedianPct)).map((v) => v.spreadVsMedianPct);
  return s.length >= 2 ? { lo: Math.min.apply(null, s), hi: Math.max.apply(null, s) } : null;
}
function buildDescription(ticker, T, versions, data, lang) {
  const C = copyFor(lang);
  const names = issuerNames(versions);
  const chains = distinct(versions.map((v) => v.chain));
  const date = isoDate(data.generatedAt);
  const parts = [C.desc.head(ticker, T.name && T.name !== ticker ? T.name : '', versions.length, names.length, chains.length)];
  const sr = spreadRange(versions);
  if (sr) parts.push(C.desc.spread(fmtPct(sr.lo), fmtPct(sr.hi)));
  parts.push(C.desc.compare);
  if (date) parts.push(C.desc.asOf(date));
  parts.push(C.desc.edu);
  return parts.join(' ');
}
function cexName(data, id, C) {
  const m = (data.cexSources || []).find((c) => c && c.id === id);
  if (m && m.name) return m.name;
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : C.cexName;
}
function usText(v, C) {
  if (v === true) return C.us.yes;
  if (v === false) return C.us.no;
  return C.us.unknown;
}

// ------------------------------------------------------------ table cells ---
const dashNa = (C) => '<span class="st-na">' + esc(C.na) + '</span>';

function cellIssuer(v, data, C) {
  const r = v.risk || {};
  const iss = (data.issuers || {})[v.issuerSlug] || {};
  const entity = [r.legalEntity, r.jurisdiction].filter(Boolean).join(', ');
  let h = '<strong>' + esc(v.issuer) + '</strong>';
  if (v.symbol) h += ' <span class="st-sym">' + esc(v.symbol) + '</span>';
  if (v.wrapper) h += '<div class="st-sub">' + esc(C.wrapped) + '</div>';
  if (entity) h += '<div class="st-sub">' + esc(entity) + '</div>';
  h += '<div class="st-sub">' + esc(usText(r.usPersons, C)) + (iss.usPersonsSource ? ' (' + link(iss.usPersonsSource, C.source) + ')' : '') + '</div>';
  return h;
}
function cellPrice(v, C) {
  if (!isNum(v.priceUsd)) return dashNa(C);
  let h = '<strong>' + esc(fmtPrice(v.priceUsd)) + '</strong>';
  const ts = utcStamp(v.priceTs);
  if (ts) h += '<div class="st-sub">' + esc(ts) + '</div>';
  h += '<div class="st-sub">' + esc(isNum(v.multiplier) ? C.sharesPer(fmtMult(v.multiplier)) : C.sharesUnknown) + '</div>';
  return h;
}
function cellSpread(v, C) {
  if (v.multiplierUnknown || !isNum(v.multiplier)) return '<span class="st-na">' + esc(C.noSpread) + '</span>';
  if (!isNum(v.spreadVsMedianPct)) return dashNa(C);
  return '<strong>' + esc(fmtPct(v.spreadVsMedianPct)) + '</strong>';
}
function cellPremium(v, T, C) {
  if (!isNum(v.premiumVsClosePct)) {
    return '<span class="st-dash" title="' + esc(C.refUnavailable) + '" aria-hidden="true">—</span><span class="st-sr">' + esc(C.refUnavailable) + '</span>';
  }
  const rc = T.referenceClose;
  const kind = C.premiumKind(rc && rc.date ? rc.date : '');
  return '<strong>' + esc(fmtPct(v.premiumVsClosePct)) + '</strong><div class="st-sub">' + esc(kind) + '</div>';
}
function cellSupply(v, C) {
  return isNum(v.supplyUsd) ? esc(fmtUsd(v.supplyUsd)) : dashNa(C);
}
function cellLiquidity(v, C) {
  const l = v.liquidity || {};
  if (!isNum(l.tvlUsd)) return dashNa(C);
  if (l.tvlUsd <= 0 || l.pools === 0) return '<span class="st-na">' + esc(C.noPools) + '</span>';
  let h = '<strong>' + esc(fmtUsd(l.tvlUsd)) + '</strong><div class="st-sub">' + esc(C.poolTvl(isNum(l.pools) ? l.pools : null)) + '</div>';
  if (isNum(l.depth2pctUsd)) h += '<div class="st-sub">' + esc(C.depth(fmtUsd(l.depth2pctUsd))) + '</div>';
  return h;
}
function yieldLine(label, y, C, lang) {
  if (!y || !isNum(y.honestProjection)) return '';
  const ds = y.defiScore;
  const rating = ds && typeof ds.rating === 'string' && ds.rating ? ds.rating : null;
  let h = '<div class="st-yield"><div class="st-yline"><span class="st-sub">' + esc(label) + '</span> <strong>' + esc(fmtApy(y.honestProjection)) + '</strong>';
  if (rating) h += ' · <span title="' + esc(C.ratingTitle) + '">' + esc(rating) + '</span>';
  if (typeof y.pool === 'string' && POOL_ID_RE.test(y.pool)) {
    const proj = y.project ? String(y.project) : '';
    h += ' · <a href="/?pool=' + esc(y.pool) + (lang === 'ko' ? '&amp;lang=ko' : '') + '" aria-label="' + esc(C.poolDetails(label, proj)) + '" title="' + esc(C.poolDetailsTitle(proj)) + '">↗</a>';
  }
  h += '</div>';
  const t = ds && ds.pillarsTier;
  if (t) {
    const bits = PILLARS.filter((p) => TIERS.has(t[p[0]])).map((p) => '<li>' + esc(C.pillarName(p[0], p[1])) + ': ' + esc(C.tierName(t[p[0]])) + '</li>');
    if (bits.length) h += '<details class="st-pillars"><summary>' + esc(C.pillarTiers) + '</summary><ul>' + bits.join('') + '</ul></details>';
  }
  return h + '</div>';
}
function cellYield(v, C, lang) {
  const by = v.bestYield || {};
  const h = yieldLine(C.yieldLp, by.lp, C, lang) + yieldLine(C.yieldLending, by.lending, C, lang);
  return h || dashNa(C);
}
function cellCex(v, data, C) {
  const rows = (v.cex || []).filter((c) => c && isNum(c.priceUsd));
  if (!rows.length) return dashNa(C);
  return rows.map((c) => '<div>' + esc(cexName(data, c.exchange, C)) + ': <strong>' + esc(fmtPrice(c.priceUsd)) + '</strong></div>').join('');
}
function cellStructure(v, data, C) {
  const r = v.risk || {};
  const iss = (data.issuers || {})[v.issuerSlug] || {};
  const bits = [];
  // Registry wording (structure) is quoted from the issuer and stays in its original language.
  if (r.structure) bits.push('<div>' + esc(r.structure) + (iss.structureSource ? ' (' + link(iss.structureSource, C.source) + ')' : '') + '</div>');
  if (r.mintRedeemHours) bits.push('<div class="st-sub">' + esc(C.mintRedeem) + esc(r.mintRedeemHours) + (iss.mintRedeemHoursSource ? ' (' + link(iss.mintRedeemHoursSource, C.source) + ')' : '') + '</div>');
  if (isNum(r.redemptionMinUsd)) bits.push('<div class="st-sub">' + esc(C.minRedeem) + esc(fmtUsd(r.redemptionMinUsd)) + (iss.redemptionMinSource ? ' (' + link(iss.redemptionMinSource, C.source) + ')' : '') + '</div>');
  return bits.length ? bits.join('') : dashNa(C);
}

function buildTable(ticker, T, versions, data, lang) {
  const C = copyFor(lang);
  let h = '<div class="st-scroll" role="region" aria-label="' + esc(C.tableLabel(ticker)) + '" tabindex="0">\n';
  h += '<table class="st-table">\n<caption class="st-sr">' + esc(C.caption(ticker)) + '</caption>\n<thead><tr>';
  C.head.forEach((c, i) => { h += '<th scope="col"' + (i === 0 ? ' class="st-first"' : '') + '>' + esc(c) + '</th>'; });
  h += '</tr></thead>\n<tbody>\n';
  versions.forEach((v) => {
    h += '<tr><th scope="row" class="st-first">' + cellIssuer(v, data, C) + '</th>' +
      '<td>' + esc(v.chain || '') + '</td>' +
      '<td>' + cellPrice(v, C) + '</td>' +
      '<td>' + cellSpread(v, C) + '</td>' +
      '<td>' + cellPremium(v, T, C) + '</td>' +
      '<td class="st-num">' + cellSupply(v, C) + '</td>' +
      '<td>' + cellLiquidity(v, C) + '</td>' +
      '<td>' + cellYield(v, C, lang) + '</td>' +
      '<td>' + cellCex(v, data, C) + '</td>' +
      '<td class="st-wide">' + cellStructure(v, data, C) + '</td></tr>\n';
  });
  return h + '</tbody>\n</table>\n</div>';
}

/** "What differs": registry facts only, one item per issuer, null facts skipped.
 *  Entity / jurisdiction / structure / hours are quoted from the issuer (original language). */
function buildDiffers(ticker, versions, lang) {
  const C = copyFor(lang);
  const items = [];
  distinct(versions.map((v) => v.issuerSlug)).forEach((slug) => {
    const vs = versions.filter((v) => v.issuerSlug === slug);
    const first = (f) => { for (let i = 0; i < vs.length; i++) { const x = (vs[i].risk || {})[f]; if (x !== null && x !== undefined && x !== '') return x; } return null; };
    const sentences = [];
    const entity = first('legalEntity'), jur = first('jurisdiction');
    if (entity && jur) sentences.push(C.differs.issuedBy2(entity, jur));
    else if (entity) sentences.push(C.differs.issuedBy(entity));
    else if (jur) sentences.push(C.differs.jur(jur));
    const structure = first('structure');
    if (structure) sentences.push(C.differs.structure(String(structure).replace(/[.\s]+$/, '')));
    const us = first('usPersons');
    if (us === true) sentences.push(C.differs.usYes);
    else if (us === false) sentences.push(C.differs.usNo);
    const hours = first('mintRedeemHours');
    if (hours) sentences.push(C.differs.hours(String(hours).replace(/[.\s]+$/, '')));
    const mults = vs.filter((v) => isNum(v.multiplier));
    if (mults.length) sentences.push(C.differs.mult(distinct(mults.map((v) => fmtMult(v.multiplier))).join(' / ')));
    if (vs.some((v) => v.multiplierUnknown)) sentences.push(C.differs.multUnknown(distinct(vs.filter((v) => v.multiplierUnknown).map((v) => v.symbol).filter(Boolean)).join(', ')));
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
const STYLE_EXTRA = `
      .st-head-right { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; justify-content: flex-end; }
      .st-lang { display: inline-flex; align-items: center; min-height: 32px; box-sizing: border-box; padding: 0 12px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-pill); background: var(--ui-surface); color: var(--ui-accent); font-size: 0.85rem; font-weight: 600; text-decoration: none; }
      .st-lang:hover { background: var(--ui-surface-muted); }
      .st-lang:focus-visible { outline: none; box-shadow: var(--ui-focus-ring); }
      :lang(ko) .st-table thead th { text-transform: none; letter-spacing: 0; }
      :lang(ko) body, :lang(ko) .st-wrap { word-break: keep-all; overflow-wrap: break-word; }
`;

/**
 * Build one page in `ctx.lang` ('en' default, or 'ko'). `ctx` = { data, siblings: [{ticker, slug}], lang }.
 * Returns { html, title, h1, description, slug, canonical, lang, alternates }.
 */
function buildTickerPage(ticker, T, ctx) {
  const data = ctx.data;
  const lang = ctx.lang === 'ko' ? 'ko' : 'en';
  const C = copyFor(lang);
  const versions = verifiedVersions(T);
  const slug = slugOf(ticker);
  const canonical = SITE_URL + stockPath(slug, lang);
  const alternates = { en: SITE_URL + stockPath(slug, 'en'), ko: SITE_URL + stockPath(slug, 'ko') };
  const title = buildTitle(ticker, versions, lang);
  const h1 = buildH1(ticker, versions, lang);
  const description = buildDescription(ticker, T, versions, data, lang);
  const generated = utcStamp(data.generatedAt);
  const date = isoDate(data.generatedAt);
  const names = issuerNames(versions);
  const chains = distinct(versions.map((v) => v.chain));
  const siblings = (ctx.siblings || []).filter((s) => s.ticker !== ticker);
  const q = lang === 'ko' ? '&amp;lang=ko' : '';
  const terminalHref = lang === 'ko' ? '/stocks?lang=ko' : '/stocks';
  const methHref = methodologyPath(lang);
  const base = lang === 'ko' ? '/ko' : '';

  const breadcrumb = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: C.crumbs.home, item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: C.crumbs.stocks, item: SITE_URL + '/stocks' },
      { '@type': 'ListItem', position: 3, name: ticker, item: canonical }
    ]
  };
  const dataset = {
    '@context': 'https://schema.org', '@type': 'Dataset',
    name: C.datasetName(ticker),
    description: description,
    url: canonical,
    isAccessibleForFree: true,
    inLanguage: lang,
    creator: { '@type': 'Organization', name: BRAND, url: SITE_URL + '/' },
    publisher: { '@type': 'Organization', name: BRAND, url: SITE_URL + '/' },
    keywords: C.keywords(ticker).concat(names, C.keywordsTail),
    variableMeasured: C.variables.map((n) => ({ '@type': 'PropertyValue', name: n }))
  };
  if (date) { dataset.dateModified = date; dataset.datePublished = date; }

  const rcNote = T.referenceClose && isNum(T.referenceClose.price)
    ? C.refNote(T.referenceClose.date || '', fmtPrice(T.referenceClose.price))
    : C.refNoteNone;

  const differs = buildDiffers(ticker, versions, lang);
  const sources = buildSources(versions, data);
  const nm = T.name && T.name !== ticker ? T.name : '';
  const med = isNum(T.medianNormalizedPrice) ? fmtPrice(T.medianNormalizedPrice) : '';
  const searchHref = lang === 'ko' ? '/?app=1&amp;lang=ko' : '/?app=1';

  let h = '<!DOCTYPE html>\n<html lang="' + C.htmlLang + '">\n<head>\n';
  h += '    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  h += '    <title>' + esc(title) + '</title>\n';
  h += '    <meta name="description" content="' + esc(description) + '">\n';
  h += '    <link rel="canonical" href="' + esc(canonical) + '">\n';
  h += '    <link rel="alternate" hreflang="en" href="' + esc(alternates.en) + '">\n';
  h += '    <link rel="alternate" hreflang="ko" href="' + esc(alternates.ko) + '">\n';
  h += '    <link rel="alternate" hreflang="x-default" href="' + esc(alternates.en) + '">\n';
  h += '    <meta name="robots" content="index,follow">\n';
  h += '    <meta property="og:type" content="website">\n';
  h += '    <meta property="og:title" content="' + esc(title) + '">\n';
  h += '    <meta property="og:description" content="' + esc(description) + '">\n';
  h += '    <meta property="og:url" content="' + esc(canonical) + '">\n';
  h += '    <meta property="og:site_name" content="' + BRAND + '">\n';
  h += '    <meta property="og:locale" content="' + C.ogLocale + '">\n';
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
  h += '    <style>' + STYLE + STYLE_EXTRA + '    </style>\n</head>\n<body>\n';
  h += '    <header class="st-header">\n        <a href="' + (lang === 'ko' ? '/?lang=ko' : '/') + '" class="st-logo">DeFi Garden</a>\n';
  h += '        <div class="st-head-right">\n';
  h += '        <nav class="st-nav" aria-label="' + esc(C.nav.primary) + '">\n';
  h += '            <a href="' + searchHref + '">' + esc(C.nav.search) + '</a>\n            <a href="' + terminalHref + '" aria-current="true">' + esc(C.nav.stocks) + '</a>\n';
  h += '            <a href="' + methHref + '">' + esc(C.nav.methodology) + '</a>\n            <a href="/mcp">' + esc(C.nav.api) + '</a>\n        </nav>\n';
  const other = lang === 'ko' ? 'en' : 'ko';
  h += '        <a class="st-lang" href="' + esc(alternates[other]) + '" hreflang="' + other + '" lang="' + other + '" aria-label="' + (other === 'ko' ? '한국어' : 'English') + '">' + (other === 'ko' ? '한국어' : 'EN') + '</a>\n';
  h += '        </div>\n    </header>\n\n';
  h += '    <main class="st-wrap">\n';
  h += '        <h1>' + esc(h1) + '</h1>\n';
  h += '        <p class="st-byline">' + esc(C.byline(generated)) + '</p>\n';
  h += '        <p>' + C.intro(ticker, nm, versions.length, names.length, chains.length, chains.join(', ')) +
    C.liveView('/stocks?ticker=' + encodeURIComponent(ticker) + q, ticker) + '</p>\n';
  h += '        <div class="st-notice" role="note">\n';
  h += '            <p>' + C.noticeSpread(ticker) + '</p>\n';
  h += '            <p>' + C.noticePremium(rcNote) + '</p>\n';
  h += '        </div>\n';
  h += '        ' + buildTable(ticker, T, versions, data, lang) + '\n';
  h += '        <p class="st-small">' + C.smallNote(data.priceSource || C.priceSourceDefault, med) + '</p>\n';
  if (differs) {
    h += '        <h2>' + esc(C.differsH2) + '</h2>\n        <p>' + esc(C.differsLead) + '</p>\n        ' + differs + '\n';
  }
  if (sources) h += '        <h2>' + esc(C.sourcesH2) + '</h2>\n        ' + sources + '\n';
  if (siblings.length) {
    h += '        <h2>' + esc(C.othersH2) + '</h2>\n        <ul class="st-chips">\n' +
      siblings.map((s) => '            <li><a href="' + base + '/stocks/' + esc(s.slug) + '">' + esc(s.ticker) + '</a></li>').join('\n') + '\n        </ul>\n';
  }
  h += '        <p>' + C.backLinks(terminalHref, methHref) + '</p>\n';
  h += '    </main>\n\n';
  h += '    <footer class="st-footer">\n';
  h += '        <p>' + esc(C.footerNote) + '</p>\n';
  h += '        <p>' + esc(C.poweredBy) + ' <a href="https://api-docs.defillama.com/" target="_blank" rel="noopener noreferrer">DefiLlama API</a>.</p>\n';
  h += '        <p><a href="' + base + '/tokens">' + esc(C.browseTokens) + '</a> · <a href="' + base + '/chains">' + esc(C.browseChains) + '</a> · <a href="' + terminalHref + '">' + esc(C.nav.stocks) + '</a> · <a href="' + methHref + '">' + esc(C.nav.methodology) + '</a> · <a href="/mcp">' + esc(C.nav.api) + '</a></p>\n';
  h += '    </footer>\n</body>\n</html>\n';
  return { html: h, title, h1, description, slug, canonical, lang, alternates };
}

/** Build every eligible page in `lang`: [{ticker, slug, html, title, h1, description}]. */
function buildAll(data, lang) {
  const elig = eligibleTickers(data);
  const siblings = elig.map((e) => ({ ticker: e.ticker, slug: e.slug }));
  return elig.map((e) => Object.assign({ ticker: e.ticker }, buildTickerPage(e.ticker, data.tickers[e.ticker], { data, siblings, lang: lang || 'en' })));
}

// -------------------------------------------------------------------- CLI ---
function writePages(pages, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const keep = new Set(pages.map((p) => p.slug + '.html'));
  let removed = 0;
  fs.readdirSync(outDir).forEach((f) => {
    if (/\.html$/.test(f) && !keep.has(f)) { fs.unlinkSync(path.join(outDir, f)); removed++; }
  });
  pages.forEach((p) => fs.writeFileSync(path.join(outDir, p.slug + '.html'), p.html));
  console.log('generate-stock-ticker-pages: wrote ' + pages.length + ' ' + (pages[0] ? pages[0].lang : 'en') + ' page(s) to ' + path.relative(process.cwd(), outDir) + '/ (' + pages.map((p) => p.slug).join(', ') + '), removed ' + removed + ' stale');
}

function main() {
  const args = process.argv.slice(2);
  const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
  const outDir = path.resolve(arg('--out', 'stocks'));
  const koOut = arg('--ko-out', null);
  const dataFile = path.resolve(arg('--data', path.join(__dirname, 'data', 'stocks-versions.json')));
  let data;
  try { data = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch (e) {
    console.error('generate-stock-ticker-pages: ' + path.basename(dataFile) + ' unreadable (' + e.message + ') - leaving stocks/ untouched');
    return;
  }
  writePages(buildAll(data, 'en'), outDir);
  if (koOut) writePages(buildAll(data, 'ko'), path.resolve(koOut));
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('generate-stock-ticker-pages failed:', e && e.message); process.exit(1); }
}

module.exports = { eligibleTickers, loadEligible, buildTickerPage, buildAll, buildTitle, buildH1, buildDescription, slugOf, verifiedVersions, stockPath, methodologyPath, COPY, MAX_TITLE, SITE_URL };
