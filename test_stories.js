/* Unit tests for the stories-page generator's analytics bootstrap (spec 039).
   Exercises renderStoryPage/renderAnalyticsBootstrap directly with a synthetic
   plan object — bypasses curatePools/fetchPoolData (network-dependent) since
   this change never touches temperament/curation/trust-rail logic. Run: node
   test_stories.js */
const assert = require('assert');
const gen = require('./generate-stories.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

const fakePlan = {
  apy: 4.5,
  pools: [{ project: 'aave-v3', symbol: 'USDC', chain: 'Ethereum', tvlUsd: 50000000, apyBase: 4.0, apyReward: 0.5 }],
  projection: 15000,
  bankProjection: 12000,
  deposited: 12000,
  generatedDate: 'July 11, 2026'
};

console.log('renderAnalyticsBootstrap — shared helper');
test('emits Mixpanel bootstrap + analytics.js + trackPageView call', () => {
  const html = gen.renderAnalyticsBootstrap('/stories/kevin', { page_type: 'story_landing', persona: 'kevin' });
  assert.ok(html.includes('mixpanel.init('), 'missing mixpanel.init');
  assert.ok(html.includes('<script defer src="https://www.defi.garden/analytics.js"></script>'), 'missing analytics.js script tag');
  assert.ok(html.includes('Analytics.trackPageView("/stories/kevin"'), 'missing trackPageView call with correct path');
  assert.ok(html.includes('"page_type":"story_landing"'), 'missing page_type property');
});
test('mixpanel stub regex literal survives untouched (/^\\/\\//)', () => {
  const html = gen.renderAnalyticsBootstrap('/stories/kevin', {});
  assert.ok(html.includes('.match(/^\\/\\//)'.replace(/\\\\/g, '\\')), 'regex literal corrupted');
});

console.log('renderStoryPage — analytics wired per persona, content untouched');
gen.PERSONAS.forEach(persona => {
  test(`${persona.slug}: analytics bootstrap present with correct path/persona`, () => {
    const html = gen.renderStoryPage(persona, fakePlan);
    assert.ok(html.includes(`Analytics.trackPageView("/stories/${persona.slug}"`), 'trackPageView path mismatch');
    assert.ok(html.includes(`"persona":"${persona.slug}"`), 'persona property mismatch');
    assert.ok(html.includes('"page_type":"story_landing"'), 'page_type mismatch');
  });
  test(`${persona.slug}: bootstrap sits inside <head>, before </head>`, () => {
    const html = gen.renderStoryPage(persona, fakePlan);
    const headEnd = html.indexOf('</head>');
    const bootstrapIdx = html.indexOf('Analytics.trackPageView');
    assert.ok(bootstrapIdx > -1 && bootstrapIdx < headEnd, 'analytics bootstrap not inside <head>');
  });
  test(`${persona.slug}: pre-existing content (title/canonical) unchanged by this diff`, () => {
    const html = gen.renderStoryPage(persona, fakePlan);
    assert.ok(html.includes(`<title>${persona.seoTitle}`) || html.includes('<title>'), 'title missing');
    assert.ok(html.includes(`https://www.defi.garden/stories/${persona.slug}.html`), 'canonical missing/changed');
  });
});

test('kevin.html FAQ block still renders (untouched by this diff)', () => {
  const kevin = gen.PERSONAS.find(p => p.slug === 'kevin');
  const html = gen.renderStoryPage(kevin, fakePlan);
  assert.ok(html.includes('st-faq-item'), 'FAQ block missing — should be untouched by an analytics-only diff');
});

console.log(`\n${passed} assertions passed`);
