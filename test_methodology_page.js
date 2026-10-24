// /methodology (2026-10-24 "The Standard"): static page whose numbers must match the scoring code.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'methodology.html'), 'utf8');
const py = fs.readFileSync(path.join(__dirname, 'compute-forecasts.py'), 'utf8');

// Metadata
assert.ok(/<title>[^<]*Methodology[^<]*<\/title>/.test(html), 'title mentions Methodology');
assert.ok(html.includes('<link rel="canonical" href="https://www.defi.garden/methodology">'), 'canonical');
assert.ok(html.includes('<meta name="robots" content="index,follow">'), 'page is indexable');

// JSON-LD parses, ISO dates, breadcrumb
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const article = blocks.find(b => b['@type'] === 'TechArticle');
assert.ok(article && /^\d{4}-\d{2}-\d{2}$/.test(article.datePublished) && /^\d{4}-\d{2}-\d{2}$/.test(article.dateModified), 'TechArticle with ISO dates');
assert.ok(blocks.some(b => b['@type'] === 'BreadcrumbList'), 'BreadcrumbList');

// Band thresholds on the page must be the ones in compute-forecasts.py
const m = py.match(/rating = "AAA" if total >= (\d+) else "AA" if total >= (\d+) else "A" if total >= (\d+) else "BBB" if total >= (\d+) else "HIGH RISK"/);
assert.ok(m, 'rating line found in compute-forecasts.py');
const [aaa, aa, a, bbb] = m.slice(1).map(Number);
const flat = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
assert.ok(flat.includes(`AAA 85 or higher`.replace('85', aaa)), 'AAA threshold');
assert.ok(flat.includes(`AA ${aa} to below ${aaa}`), 'AA range');
assert.ok(flat.includes(`A ${a} to below ${aa}`), 'A range');
assert.ok(flat.includes(`BBB ${bbb} to below ${a}`), 'BBB range');
assert.ok(flat.includes(`HIGH RISK below ${bbb}`), 'HIGH RISK range');

// Pillar weights on the page must be the ones in the scoring code (35/25/25/15 = 100)
const caps = { stability: /min\(35\.0,/, sustainability: /10\.0 \* organic_ratio/, stickiness: /stickiness = 25\.0/, liquidity: /liquidity = 15\.0/ };
Object.values(caps).forEach(re => assert.ok(re.test(py), 'pillar cap present in code: ' + re));
['Stability 35', 'Sustainability 25', 'Stickiness 25', 'Liquidity 15'].forEach(s => assert.ok(flat.includes(s), s));

// Trust rails must match the shared constants
const rails = require('./trust-rails.js');
assert.ok(flat.includes('$' + (rails.DEFAULT_MIN_TVL / 1000).toLocaleString('en-US') + 'K TVL floor'), 'TVL floor');
assert.ok(flat.includes(rails.APY_SANITY_LIMIT.toLocaleString('en-US') + '% APY sanity limit'), 'APY sanity limit');

// Required honesty wording
assert.ok(/not a credit rating issued by a registered credit rating agency/i.test(flat), 'not-a-credit-rating note');
assert.ok(/Education, not financial advice/i.test(flat), 'education not advice');
assert.ok(html.includes('href="/forecast-accuracy"'), 'links to the accuracy page');

// Nav is exactly Search / Methodology / API; no legacy promotion
const nav = html.match(/<nav class="meth-nav"[\s\S]*?<\/nav>/)[0];
assert.deepStrictEqual([...nav.matchAll(/href="([^"]+)"/g)].map(x => x[1]), ['/?app=1', '/methodology', '/mcp']);
assert.ok(!/plan\.html|\/for\/|\/stocks|hype-harvest/.test(html), 'no legacy-feature links');

// Wired into sitemap + llms generators
assert.ok(/SITE_URL\}methodology/.test(fs.readFileSync(path.join(__dirname, 'generate-sitemap.js'), 'utf8')), 'sitemap entry');
assert.ok(/\/methodology/.test(fs.readFileSync(path.join(__dirname, 'generate-llms.js'), 'utf8')), 'llms entry');

// Homepage (landing.js) score model must equal the scoring code too: same pillar caps and band cutoffs.
const landingJs = fs.readFileSync(path.join(__dirname, 'landing.js'), 'utf8');
const pillarMax = [...landingJs.matchAll(/key: '(\w+)', max: (\d+),/g)].map(x => [x[1], Number(x[2])]);
assert.deepStrictEqual(pillarMax, [['stability', 35], ['sustainability', 25], ['stickiness', 25], ['liquidity', 15]], 'landing.js pillar caps');
assert.strictEqual(pillarMax.reduce((n, x) => n + x[1], 0), 100, 'pillars sum to 100');
const bandMins = [...landingJs.matchAll(/\{ name: '([A-Z ]+)', min: (\d+) \}/g)].map(x => [x[1], Number(x[2])]);
assert.deepStrictEqual(bandMins, [['AAA', aaa], ['AA', aa], ['A', a], ['BBB', bbb], ['HIGH RISK', 0]], 'landing.js band cutoffs match compute-forecasts.py');
console.log('methodology page: all assertions passed');
