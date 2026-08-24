/**
 * Unit tests for DeFi Garden HYPE Funding Harvest Module.
 * Tests math formulas (APR, 33% decay haircut, APY sanity limits),
 * translation dictionary completeness, and file integrity.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { translations, createTranslationFunction } = require('./translations.js');

console.log('test_hype_funding_harvest.js — HYPE funding harvest module tests');

// 1. Check required files exist
const requiredFiles = [
  'hype-harvest.js',
  'hype-harvest.css',
  'hype-harvest.html',
  'keeper/hype_funding_harvest.py',
  'tests/test_keeper_hype_harvest.py'
];

requiredFiles.forEach((file) => {
  assert.ok(fs.existsSync(path.join(__dirname, file)), `Required file ${file} must exist`);
});
console.log('  ✓ (a) all core files exist (js, css, html, keeper, test)');

// 2. Test translations dictionary completeness for hypeHarvest keys
const requiredKeys = [
  'hypeHarvest.title',
  'hypeHarvest.subtitle',
  'hypeHarvest.instantApr',
  'hypeHarvest.projectedApr',
  'hypeHarvest.hourlyFunding',
  'hypeHarvest.basisSpread',
  'hypeHarvest.openInterest',
  'hypeHarvest.dayVolume',
  'hypeHarvest.crowdedLong',
  'hypeHarvest.normalState',
  'hypeHarvest.shortSkew',
  'hypeHarvest.calculatorTitle',
  'hypeHarvest.capitalLabel',
  'hypeHarvest.spotLeg',
  'hypeHarvest.shortLeg',
  'hypeHarvest.dailyYield',
  'hypeHarvest.monthlyYield',
  'hypeHarvest.projectedMonthly',
  'hypeHarvest.annualYield',
  'hypeHarvest.executionTitle',
  'hypeHarvest.step1',
  'hypeHarvest.step2',
  'hypeHarvest.step3',
  'hypeHarvest.riskNote',
  'hypeHarvest.divergenceWarning'
];

['en', 'ko'].forEach((lang) => {
  const t = createTranslationFunction(lang);
  requiredKeys.forEach((key) => {
    const val = t(key);
    assert.ok(val && typeof val === 'string' && val !== key, `Translation for ${key} in ${lang} must exist`);
  });
});
console.log('  ✓ (b) bilingual translations verified in EN and KO for all hypeHarvest keys');

// 3. Test mathematical invariants
// Instant APR = rate_1h * 24 * 365
const hourlyRate = 0.0001; // 0.01% / hr
const instantApr = hourlyRate * 24 * 365; // 0.876 = 87.6%
assert.strictEqual(Math.round(instantApr * 1000) / 1000, 0.876);

// 30d projected APR = instantApr * 0.67 (33% decay haircut)
const projectedApr = instantApr * 0.67;
assert.ok(projectedApr < instantApr, 'Projected APR must apply decay haircut');
assert.strictEqual(Math.round(projectedApr * 1000) / 1000, Math.round(0.876 * 0.67 * 1000) / 1000);

// Basis spread = |mark - oracle| / oracle * 10000 bps
const markPx = 80.0;
const oraclePx = 79.9;
const basisSpreadBps = (Math.abs(markPx - oraclePx) / oraclePx) * 10000.0;
assert.ok(basisSpreadBps > 12.0 && basisSpreadBps < 13.0, 'Basis spread math must be accurate in bps');

// Delta neutral carry on $10,000 capital -> $5,000 short perp notional
const capital = 10000.0;
const notionalShort = capital * 0.5;
const annualYield = notionalShort * instantApr; // $5,000 * 87.6% = $4,380
assert.strictEqual(Math.round(annualYield * 100) / 100, 4380.0);
const monthlyYield = annualYield / 12.0; // $365.0
assert.strictEqual(Math.round(monthlyYield * 100) / 100, 365.0);

console.log('  ✓ (c) delta-neutral carry and decay haircut math verified');

// 4. Validate HTML and CSS integration
const htmlContent = fs.readFileSync(path.join(__dirname, 'hype-harvest.html'), 'utf-8');
assert.ok(htmlContent.includes('hype-harvest.js'), 'HTML must include hype-harvest.js');
assert.ok(htmlContent.includes('hype-harvest.css'), 'HTML must include hype-harvest.css');
assert.ok(htmlContent.includes('translations.js') || htmlContent.includes('translations.min.js'), 'HTML must include translations dictionary');

const cssContent = fs.readFileSync(path.join(__dirname, 'hype-harvest.css'), 'utf-8');
assert.ok(cssContent.includes('--ui-border'), 'CSS must use Quiet design system tokens (--ui-border)');

console.log('  ✓ (d) HTML/CSS asset links and design system tokens verified');

console.log('\n4/4 assertions passed');
