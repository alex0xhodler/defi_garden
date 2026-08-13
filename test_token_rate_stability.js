'use strict';

const assert = require('assert');
const tp = require('./generate-token-pages.js');
const { createTranslationFunction } = require('./translations.js');

const {
  RATE_STABILITY_MIN_OBSERVATIONS,
  rateStabilityFor,
  renderRateStabilityHtml,
  renderRateStabilityMarkdown,
  rateStabilityFaqItem,
} = tp;
const tEn = createTranslationFunction('en');
const tKo = createTranslationFunction('ko');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function pool(overrides) {
  return Object.assign({
    symbol: 'RATE', project: 'Garden Alpha', chain: 'Ethereum', pool: 'rate-alpha',
    tvlUsd: 12_300_000, apyBase: 3.25, apyReward: 0,
    count: 83,
    sigma: 0.314159,
    mu: 9.87654321,
    apyPct30D: 987654.321,
  }, overrides || {});
}

function record(pools, symbol) {
  const sym = symbol || 'RATE';
  return {
    symbol: sym,
    slug: sym.toLowerCase(),
    totalTvl: pools.reduce((sum, p) => sum + p.tvlUsd, 0),
    qualifyingCount: pools.length,
    pools,
  };
}

function countMatches(text, re) { return (text.match(re) || []).length; }
function htmlText(fragment) {
  return fragment.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rarr;/g, '→')
    .replace(/\s+/g, ' ').trim();
}
function htmlStabilityBlock(html) {
  const start = html.indexOf('<section class="tp-rate-stability"');
  assert.notStrictEqual(start, -1, 'missing HTML rate-stability section');
  const end = html.indexOf('</section>', start);
  assert.notStrictEqual(end, -1, 'unterminated HTML rate-stability section');
  return html.slice(start, end + 10);
}
function firstHtmlParagraph(html) {
  const match = html.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/);
  assert(match, 'rate-stability HTML needs a visible lead paragraph');
  return htmlText(match[1]);
}
function firstMarkdownParagraph(md) {
  const lines = md.split('\n').map(line => line.trim());
  return lines.find(line => line && !line.startsWith('#') && !line.startsWith('<!--'));
}
function faqPage(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const faq = scripts.find(item => item['@type'] === 'FAQPage');
  assert(faq, 'missing FAQPage JSON-LD');
  return faq;
}
function candidatePoolIds(stability) {
  return stability.candidates.map(candidate => new URL(candidate.href).searchParams.get('pool'));
}

console.log('test_token_rate_stability.js — item 279: citation-ready rate stability\n');

test('planned rate-stability generator API is exported', () => {
  assert.strictEqual(RATE_STABILITY_MIN_OBSERVATIONS, 30);
  assert.strictEqual(typeof rateStabilityFor, 'function', 'missing rateStabilityFor export');
  assert.strictEqual(typeof renderRateStabilityHtml, 'function', 'missing renderRateStabilityHtml export');
  assert.strictEqual(typeof renderRateStabilityMarkdown, 'function', 'missing renderRateStabilityMarkdown export');
  assert.strictEqual(typeof rateStabilityFaqItem, 'function', 'missing rateStabilityFaqItem export');
});

test('lower APY sigma ranks first and candidates expose facts, not paid history KPIs', () => {
  const high = pool({ project: 'High Variance', chain: 'Base', pool: 'high-sigma', tvlUsd: 11_100_000,
    apyBase: 7.75, count: 61, sigma: 4.271828, mu: 7.654321, apyPct30D: 123456.789 });
  const stability = rateStabilityFor(record([high, pool()]));
  assert.strictEqual(stability.status, 'ranked');
  assert.deepStrictEqual(candidatePoolIds(stability), ['rate-alpha', 'high-sigma']);
  assert(stability.candidates.every(c => new URL(c.href).searchParams.get('src') === 'seo_token'),
    'visible stability links must preserve token-page attribution');
  assert.deepStrictEqual(stability.candidates.map(c => Object.keys(c).sort()), [
    ['apyStr', 'chain', 'href', 'project', 'rank', 'tvlStr'],
    ['apyStr', 'chain', 'href', 'project', 'rank', 'tvlStr'],
  ]);
  assert.deepStrictEqual(stability.candidates.map(c => c.rank), [1, 2]);
  assert.deepStrictEqual(stability.candidates.map(c => [c.project, c.chain, c.apyStr, c.tvlStr]), [
    ['Garden Alpha', 'Ethereum', '3.25%', '$12.3M'],
    ['High Variance', 'Base', '7.75%', '$11.1M'],
  ]);
  const publicJson = JSON.stringify(stability);
  for (const secret of ['0.314159', '4.271828', '83', '61', '9.87654321', '7.654321', '987654.321', '123456.789']) {
    assert(!publicJson.includes(secret), `private history value leaked: ${secret}`);
  }
});

test('equal sigma uses project, chain, then pool id independent of input order', () => {
  const tied = [
    pool({ project: 'Beta', chain: 'Arbitrum', pool: 'tie-beta' }),
    pool({ project: 'Alpha', chain: 'Ethereum', pool: 'tie-z' }),
    pool({ project: 'Alpha', chain: 'Base', pool: 'tie-base' }),
    pool({ project: 'Alpha', chain: 'Ethereum', pool: 'tie-a' }),
  ];
  const expected = ['tie-base', 'tie-a', 'tie-z', 'tie-beta'];
  assert.deepStrictEqual(candidatePoolIds(rateStabilityFor(record(tied))), expected);
  assert.deepStrictEqual(candidatePoolIds(rateStabilityFor(record([...tied].reverse()))), expected);
});

test('missing, short, non-integer, and non-finite history is excluded; one eligible is insufficient', () => {
  const cases = [
    pool({ project: 'Missing', pool: 'missing', count: undefined, sigma: undefined }),
    pool({ project: 'Short', pool: 'short', count: 29, sigma: 0.01 }),
    pool({ project: 'Fractional', pool: 'fractional', count: 30.5, sigma: 0.01 }),
    pool({ project: 'String count', pool: 'string-count', count: '83', sigma: 0.01 }),
    pool({ project: 'Negative', pool: 'negative', count: 83, sigma: -0.01 }),
    pool({ project: 'NaN', pool: 'nan', count: 83, sigma: NaN }),
    pool({ project: 'Infinity', pool: 'infinity', count: 83, sigma: Infinity }),
  ];
  const stability = rateStabilityFor(record([pool(), ...cases]));
  assert.strictEqual(stability.status, 'insufficient');
  assert(!JSON.stringify(stability).match(/missing|short|fractional|string-count|negative|nan|infinity/i));
});

test('anomalous, sub-floor, and zero-display pools cannot enter despite strong history', () => {
  const goodA = pool();
  const goodB = pool({ project: 'Garden Beta', chain: 'Base', pool: 'rate-beta', apyBase: 4.5,
    count: 83, sigma: 0.8 });
  const excluded = [
    pool({ project: 'Anomalous', pool: 'anomalous', apyBase: 1001, count: 99, sigma: 0 }),
    pool({ project: 'Subfloor', pool: 'subfloor', tvlUsd: 99_999, count: 99, sigma: 0 }),
    pool({ project: 'Zero display', pool: 'zero-display', apyBase: 0.003, count: 99, sigma: 0 }),
  ];
  const stability = rateStabilityFor(record([...excluded, goodB, goodA]));
  assert.strictEqual(stability.status, 'ranked');
  assert.deepStrictEqual(candidatePoolIds(stability), ['rate-alpha', 'rate-beta']);
});

test('one stability object gives fact-identical HTML, Markdown, and FAQ answer', () => {
  const stability = rateStabilityFor(record([
    pool(),
    pool({ project: 'Garden Beta', chain: 'Base', pool: 'rate-beta', tvlUsd: 11_100_000, apyBase: 7.75,
      count: 61, sigma: 4.271828, mu: 7.654321, apyPct30D: 123456.789 }),
  ]));
  for (const [t, lang] of [[tEn, 'en'], [tKo, 'ko']]) {
    const faq = rateStabilityFaqItem(stability, 'RATE', t);
    const html = renderRateStabilityHtml(stability, 'RATE', t);
    const md = renderRateStabilityMarkdown(stability, 'RATE', t);
    assert.strictEqual(firstHtmlParagraph(html), faq.a, `${lang} HTML lead differs from FAQ answer`);
    assert.strictEqual(firstMarkdownParagraph(md), faq.a, `${lang} Markdown lead differs from FAQ answer`);
    for (const candidate of stability.candidates) {
      for (const fact of [candidate.project, candidate.chain, candidate.apyStr, candidate.tvlStr, candidate.href]) {
        assert(htmlText(html).includes(fact) && md.includes(fact) && faq.a.includes(fact), `${lang} missing shared fact ${fact}`);
      }
    }
    for (const secret of ['0.314159', '4.271828', '83', '61', '9.87654321', '7.654321', '987654.321', '123456.789']) {
      assert(!`${html}\n${md}\n${faq.a}`.includes(secret), `${lang} rendered private value ${secret}`);
    }
  }
});

test('copy is APY-history-only, localized, and names every excluded risk without safety claims', () => {
  const stability = rateStabilityFor(record([pool(), pool({ project: 'Beta', pool: 'beta', count: 30, sigma: 1 })]));
  const en = htmlText(renderRateStabilityHtml(stability, 'RATE', tEn)) + ' ' + rateStabilityFaqItem(stability, 'RATE', tEn).a;
  assert(/APY history only/i.test(en));
  for (const dimension of ['protocol', 'exploit', 'depeg', 'liquidity', 'governance']) assert(new RegExp(dimension, 'i').test(en));
  assert(/principal[- ]loss risk/i.test(en));
  assert(!/\bsafe(?:st)?\b|\bprotection\b/i.test(en));

  const ko = htmlText(renderRateStabilityHtml(stability, 'RATE', tKo)) + ' ' + rateStabilityFaqItem(stability, 'RATE', tKo).a;
  assert(/[가-힣]/.test(ko) && !ko.includes('Rate stability'), 'KO label/copy must be localized');
  for (const dimension of [/APY 이력/, /프로토콜/, /(익스플로잇|취약점 악용)/, /(디페그|페그 이탈)/, /유동성/, /(거버넌스|지배구조)/, /원금 손실/]) {
    assert(dimension.test(ko), `KO excluded-risk copy missing ${dimension}`);
  }
  assert(!/안전|원금 보호/.test(ko));
});

test('every rankTopTokens(..., 0) record gets one status block in both locales, twins, and head modes', () => {
  const rankedPools = [
    pool({ symbol: 'RANKED', pool: 'ranked-a' }),
    pool({ symbol: 'RANKED', project: 'Ranked B', chain: 'Base', pool: 'ranked-b', count: 40, sigma: 2 }),
    pool({ symbol: 'THIN', project: 'Thin A', pool: 'thin-a' }),
    pool({ symbol: 'THIN', project: 'Thin short', pool: 'thin-short', count: 5, sigma: 0.01 }),
  ];
  const records = tp.rankTopTokens(rankedPools, 0);
  assert.strictEqual(records.length, 2);
  for (const rec of records) {
    const stability = rateStabilityFor(rec);
    for (const [lang, t] of [['en', tEn], ['ko', tKo]]) {
      const expectedFaq = rateStabilityFaqItem(stability, rec.symbol, t);
      for (const isHead of [false, true]) {
        const html = tp.renderTokenPage(rec, [], '2026-08-14', [], lang, null, { isHead });
        const md = tp.renderTokenPageMarkdown(rec, [], '2026-08-14', [], lang, { isHead });
        assert.strictEqual(countMatches(html, /data-rate-stability-status="(?:ranked|insufficient)"/g), 1);
        assert.strictEqual(countMatches(md, /<!-- rate-stability:(?:ranked|insufficient) -->/g), 1);
        assert(html.includes(`data-rate-stability-status="${stability.status}"`));
        assert(md.includes(`<!-- rate-stability:${stability.status} -->`));
        const entity = faqPage(html).mainEntity.find(item => item.name === expectedFaq.q);
        assert(entity, `${lang}/${rec.symbol} stability FAQ missing from JSON-LD`);
        assert.strictEqual(entity.acceptedAnswer.text, expectedFaq.a);
        assert.strictEqual(firstHtmlParagraph(htmlStabilityBlock(html)), expectedFaq.a);
        if (isHead) {
          assert(html.includes('<section class="tp-depth"'), 'head depth section should remain separate');
        } else {
          assert(!html.includes('<section class="tp-depth"'), 'tail page must not gain head-only depth');
          assert(!md.includes(t('tcpDepthHeading')), 'tail Markdown must not gain head-only depth');
        }
      }
    }
  }
});

console.log(`\n${passed}/8 rate-stability tests passed`);
if (passed !== 8) process.exitCode = 1;
