// /methodology (2026-10-24 "The Standard"): static public page. Public level only (2026-10-25): no internals.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'methodology.html'), 'utf8');

// Metadata
assert.ok(/<title>[^<]*Methodology[^<]*<\/title>/.test(html), 'title mentions Methodology');
assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/methodology">'), 'canonical');
assert.ok(html.includes('<meta name="robots" content="index,follow">'), 'page is indexable');

// JSON-LD parses, ISO dates, breadcrumb
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const article = blocks.find(b => b['@type'] === 'TechArticle');
assert.ok(article && /^\d{4}-\d{2}-\d{2}$/.test(article.datePublished) && /^\d{4}-\d{2}-\d{2}$/.test(article.dateModified), 'TechArticle with ISO dates');
assert.ok(blocks.some(b => b['@type'] === 'BreadcrumbList'), 'BreadcrumbList');

// PROPRIETARY (owner decision 2026-10-25, "what, not how"): the page names the bands and
// the four pillars, and must NOT reveal weights, cutoffs, formulas, constants, model or inputs.
const flat = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
['AAA', 'AA', 'A', 'BBB', 'HIGH RISK'].forEach(b => assert.ok(new RegExp('<strong>' + b + '</strong>').test(html), 'band name ' + b));
['Yield stability', 'Sustainability', 'Capital stickiness', 'Exit liquidity'].forEach(p => assert.ok(flat.includes(p), 'pillar name ' + p));
assert.ok(/low, central and high/i.test(flat), 'forecast described as a low / central / high range');
const HIDDEN = [
  [/\b(35|25|15)\s*(pts?|points?|%)/i, 'pillar weights'],
  [/(Stability|Sustainability|Stickiness|Liquidity)\s*(\(up to )?\d+\b/, 'pillar weight next to a pillar name'],
  [/max(imum)? points/i, 'max points column'],
  [/(≥|>=)\s*(85|70|55|40)\b/, 'band cutoffs'],
  [/\b(85|70|55|40)\s+(or higher|to below)/i, 'band ranges'],
  [/below (85|70|55|40)\b/i, 'band ranges'],
  [/timesfm/i, 'model name'],
  [/google\//i, 'model vendor path'],
  [/alchemy/i, 'on-chain provider'],
  [/\baave v3\b/i, 'telemetry market'],
  [/\bwhale|churn|skewness|Bowley|haircut\b/i, 'internal factors'],
  [/\b(30|14) (daily )?points?\b|at least 14 daily|last 30 daily/i, 'model input windows'],
  [/\bp(10|50|90)\b/i, 'quantile jargon'],
  [/\d\.\d+ ?×|× ?\d/, 'formula coefficients']
];
HIDDEN.forEach(([re, why]) => assert.ok(!re.test(flat), 'methodology page must not reveal ' + why + ': ' + (flat.match(re) || [])[0]));
// No track-record numbers and no live summary fetch (the track record lives only on /forecast-accuracy)
assert.ok(!/forecast-evaluations/.test(html) && !/<script>(?![^<]*ld\+json)/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '').replace(/<script>try\{var th[\s\S]*?<\/script>/, '')), 'no fetch of evaluation data / no page script');
assert.ok(!/skill score|band capture|resolved runs|median/i.test(flat), 'no track-record metrics on /methodology');

// Trust rails must match the shared constants
const rails = require('./trust-rails.js');
assert.ok(flat.includes('$' + (rails.DEFAULT_MIN_TVL / 1000).toLocaleString('en-US') + 'K TVL floor'), 'TVL floor');
assert.ok(flat.includes(rails.APY_SANITY_LIMIT.toLocaleString('en-US') + '% APY sanity limit'), 'APY sanity limit');

// Required honesty wording
assert.ok(/not a credit rating issued by a registered credit rating agency/i.test(flat), 'not-a-credit-rating note');
assert.ok(/Education, not financial advice/i.test(flat), 'education not advice');
assert.ok(html.includes('href="/forecast-accuracy"'), 'links to the accuracy page');

// Nav is exactly Search / Stocks / Methodology / API; no legacy promotion
const nav = html.match(/<nav class="meth-nav"[\s\S]*?<\/nav>/)[0];
assert.deepStrictEqual([...nav.matchAll(/href="([^"]+)"/g)].map(x => x[1]), ['/?app=1', '/stocks', '/methodology', '/mcp']);
assert.ok(!/plan\.html|\/for\/|hype-harvest/.test(html), 'no legacy-feature links');

// Wired into sitemap + llms generators
assert.ok(/SITE_URL\}methodology/.test(fs.readFileSync(path.join(__dirname, 'generate-sitemap.js'), 'utf8')), 'sitemap entry');
assert.ok(/\/methodology/.test(fs.readFileSync(path.join(__dirname, 'generate-llms.js'), 'utf8')), 'llms entry');

// Homepage (landing.js) must carry no score constants either (proprietary, 2026-10-25).
const landingJs = fs.readFileSync(path.join(__dirname, 'landing.js'), 'utf8');
assert.ok(!/max: \d+|min: (85|70|55|40)\b|forecast-evaluations|EVALUATIONS_URL/.test(landingJs), 'landing.js must not carry pillar maxima, band cutoffs or the evaluation fetch');
// ---------------------------------------------------------------- hreflang (EN side)
assert.ok(html.includes('<link rel="alternate" hreflang="en" href="https://www.defi.garden/methodology">'), 'EN hreflang en');
assert.ok(html.includes('<link rel="alternate" hreflang="ko" href="https://www.defi.garden/ko/methodology">'), 'EN hreflang ko');
assert.ok(html.includes('<link rel="alternate" hreflang="x-default" href="https://www.defi.garden/methodology">'), 'EN hreflang x-default');
assert.ok(html.includes('class="meth-lang" href="/ko/methodology" hreflang="ko" lang="ko"'), 'EN page links to the KO twin');

// ---------------------------------------------------------------- Korean twin (/ko/methodology)
// ko/ is a generated output, so the page is built by generate-ko-static.js; build it in-memory here.
const koGen = require('./generate-ko-static.js');
const ko = koGen.buildMethodologyKo().html;
const koFlat = ko.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&lsquo;|&rsquo;/g, "'").replace(/\s+/g, ' ');
const hangul = /[가-힣]/;

assert.ok(ko.startsWith('<!DOCTYPE html>\n<html lang="ko">'), 'lang="ko"');
const koTitle = ko.match(/<title>([^<]*)<\/title>/)[1];
assert.ok(hangul.test(koTitle) && /DeFi Garden$/.test(koTitle) && koTitle.length <= 70, 'KO title: ' + koTitle);
assert.ok(ko.includes('<link rel="canonical" href="https://www.defi.garden/ko/methodology">'), 'KO canonical is per language');
assert.ok(ko.includes('<link rel="alternate" hreflang="en" href="https://www.defi.garden/methodology">'));
assert.ok(ko.includes('<link rel="alternate" hreflang="ko" href="https://www.defi.garden/ko/methodology">'));
assert.ok(ko.includes('<link rel="alternate" hreflang="x-default" href="https://www.defi.garden/methodology">'));
assert.ok(ko.includes('class="meth-lang" href="/methodology" hreflang="en" lang="en"'), 'KO page links to the EN twin');
assert.ok(ko.includes('<meta name="robots" content="index,follow">') && ko.includes('property="og:locale" content="ko_KR"'));
assert.ok(ko.includes('property="og:url" content="https://www.defi.garden/ko/methodology"'));

const koBlocks = [...ko.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const koArticle = koBlocks.find(b => b['@type'] === 'TechArticle');
assert.ok(koArticle && koArticle.inLanguage === 'ko' && koArticle.url === 'https://www.defi.garden/ko/methodology', 'KO TechArticle inLanguage ko');
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(koArticle.datePublished) && /^\d{4}-\d{2}-\d{2}$/.test(koArticle.dateModified), 'KO ISO dates');
const koCrumb = koBlocks.find(b => b['@type'] === 'BreadcrumbList');
assert.deepStrictEqual(koCrumb.itemListElement.map(i => i.item), ['https://www.defi.garden/', 'https://www.defi.garden/ko/methodology']);

// Same public level: band names, four pillars (Korean names, tiers not numbers), low / central / high range.
['AAA', 'AA', 'A', 'BBB', 'HIGH RISK'].forEach(b => assert.ok(new RegExp('<strong>' + b + '</strong>').test(ko), 'KO band name ' + b));
['수익률 안정성', '지속 가능성', '자본 유지력', '출금 유동성'].forEach(p => assert.ok(koFlat.includes(p), 'KO pillar ' + p));
assert.ok(/낮은 값, 중앙값, 높은 값/.test(koFlat), 'KO forecast described as a low / central / high range');
assert.ok(/높음, 보통, 낮음/.test(koFlat), 'pillars shown as tiers');
assert.ok(koFlat.includes('DeFi Score') && koFlat.includes('TVL') && koFlat.includes('APY'), 'DeFi Score / TVL / APY kept as-is');
// Trust rails injected from the shared constants, en-US formatted.
assert.ok(koFlat.includes('$' + (rails.DEFAULT_MIN_TVL / 1000).toLocaleString('en-US') + 'K TVL 기준'), 'KO TVL floor');
assert.ok(koFlat.includes(rails.APY_SANITY_LIMIT.toLocaleString('en-US') + '% APY 이상치 한도'), 'KO APY sanity limit');
// Honesty wording: not a credit rating; education not advice; link to the accuracy page.
assert.ok(/등록된 신용평가사가 부여한 신용등급이 아니/.test(koFlat), 'KO not-a-credit-rating note');
assert.ok(/교육용이며 투자 조언이 아니에요/.test(koFlat), 'KO education not advice');
assert.ok(ko.includes('href="/forecast-accuracy"'), 'KO links to the accuracy page');
// Natural register (haeyo-che) and no leaked English paragraphs.
assert.ok((koFlat.match(/[가-힣]+(?:요|죠)[.\s]/g) || []).length > 40, 'haeyo-che register');
assert.ok(!/하십시오|이다\./.test(koFlat), 'no stiff/mixed registers');
// PROPRIETARY: the KO output carries none of the hidden internals either.
HIDDEN.forEach(([re, why]) => assert.ok(!re.test(koFlat), 'KO methodology must not reveal ' + why + ': ' + (koFlat.match(re) || [])[0]));
assert.ok(!/가중치\s*\d|\d+\s*점 만점|만점|컷오프|임계값\s*\d|\b(?:85|70|55|40)\s*점/.test(koFlat), 'no weights / cutoffs in KO');
assert.ok(!/forecast-evaluations|스킬 점수|밴드 포착|실행 횟수/.test(ko), 'no track-record metrics on KO /methodology');
assert.ok(!/<script>(?!try\{var th)/.test(ko.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), 'no page script / fetch in KO');

// KO nav: Search / Stocks / Methodology (KO) / API; no legacy promotion.
const koNav = ko.match(/<nav class="meth-nav"[\s\S]*?<\/nav>/)[0];
assert.deepStrictEqual([...koNav.matchAll(/href="([^"]+)"/g)].map(x => x[1]), ['/?app=1&amp;lang=ko', '/stocks?lang=ko', '/ko/methodology', '/mcp']);
assert.ok(!/plan\.html|\/for\/|hype-harvest/.test(ko));
// Same section ids as the EN page (anchors stay parallel).
const ids = (h) => [...h.matchAll(/<h2 id="([^"]+)"/g)].map(m => m[1]);
assert.deepStrictEqual(ids(ko), ids(html), 'KO sections mirror the EN sections');

// Generated, never committed: ko/ is a site output; the CI step + sitemap entries exist.
const outputs = fs.readFileSync(path.join(__dirname, 'scripts', 'site-outputs.txt'), 'utf8').split('\n').map(l => l.trim());
assert.ok(outputs.includes('ko'), 'ko/ is a generated output');
assert.ok(!require('child_process').execSync('git ls-files ko', { cwd: __dirname, encoding: 'utf8' }).trim(), 'nothing under ko/ is tracked');
assert.ok(/node generate-ko-static\.js/.test(fs.readFileSync(path.join(__dirname, '.github/workflows/sitemap-update.yml'), 'utf8')), 'CI builds ko/methodology.html');
const sm = fs.readFileSync(path.join(__dirname, 'generate-sitemap.js'), 'utf8');
assert.ok(/sitemap-pages-ko\.xml/.test(sm) && /STATIC_KO_TWIN_RE/.test(sm), 'KO sitemap entry for /ko/methodology');

// KO surfaces point their Methodology link at the KO page (landing / app in KO mode, KO generated pages).
const landing = fs.readFileSync(path.join(__dirname, 'landing.js'), 'utf8');
assert.ok(/methodologyHref = language === 'ko' \? '\/ko\/methodology' : '\/methodology'/.test(landing) && !/href: '\/methodology'/.test(landing), 'landing.js KO methodology link');
const appSrc = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
assert.ok(!/\{ href: '\/methodology' \}/.test(appSrc) && /language === 'ko' \? '\/ko\/methodology'/.test(appSrc), 'app.js KO methodology link');
assert.ok(/language === 'ko' \? '\/ko\/methodology'/.test(fs.readFileSync(path.join(__dirname, 'generate-pool-score-pages.js'), 'utf8')), 'KO pool pages');
assert.ok(/'\/ko' : ''\}\/methodology/.test(fs.readFileSync(path.join(__dirname, 'generate-protocol-pages.js'), 'utf8')), 'KO protocol pages');

console.log('methodology page: all assertions passed');
