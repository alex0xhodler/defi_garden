/* Regression gate for product-loop item 266. Executes the real inline WebMCP
   and IA-router scripts from home.html; all external data is a local fixture.
   Run: node test_webmcp_trust_rails.js */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const homeHtml = fs.readFileSync(__dirname + '/home.html', 'utf8');
const TRUST_RAILS = require('./trust-rails.js');
const WEBMCP_MARKER = '<!-- WebMCP implementation for AI Agents -->';
const ROUTER_MARKER = '// IA Router — runs before React loads. Zero flash. Zero double-load.';

function scriptAfter(marker) {
  const markerAt = homeHtml.indexOf(marker);
  assert.ok(markerAt >= 0, `missing stable marker: ${marker}`);
  const openAt = homeHtml.indexOf('<script>', markerAt + marker.length);
  const closeAt = homeHtml.indexOf('</script>', openAt);
  assert.ok(openAt > markerAt && closeAt > openAt, `could not extract script after: ${marker}`);
  return homeHtml.slice(openAt + '<script>'.length, closeAt);
}

function scriptContaining(marker) {
  const markerAt = homeHtml.indexOf(marker);
  assert.ok(markerAt >= 0, `missing stable marker: ${marker}`);
  const openAt = homeHtml.lastIndexOf('<script>', markerAt);
  const closeAt = homeHtml.indexOf('</script>', markerAt);
  assert.ok(openAt >= 0 && closeAt > markerAt, `could not extract script containing: ${marker}`);
  return homeHtml.slice(openAt + '<script>'.length, closeAt);
}

const webmcpSource = scriptAfter(WEBMCP_MARKER);
const routerSource = scriptContaining(ROUTER_MARKER);
const registrations = [];
const fetchCalls = [];
const railReads = [];
const trackedRails = new Proxy(TRUST_RAILS, {
  get(target, property) {
    railReads.push(property);
    return target[property];
  }
});
const modelContext = {
  provideContext(options) {
    registrations.push(options);
    return Promise.resolve();
  }
};
const navigator = { modelContext };
const fixtures = [
  { pool: 'reward-anomaly', project: 'fixture-protocol', symbol: 'USDC', chain: 'Base',
    tvlUsd: TRUST_RAILS.DEFAULT_MIN_TVL, apyBase: 600, apyReward: 600, apy: 600 },
  { pool: 'base-only', project: 'fixture-protocol', symbol: 'USDC', chain: 'Base',
    tvlUsd: TRUST_RAILS.DEFAULT_MIN_TVL, apyBase: 600, apyReward: 0, apy: 600 },
  { pool: 'below-tvl', project: 'fixture-protocol', symbol: 'USDC', chain: 'Base',
    tvlUsd: TRUST_RAILS.DEFAULT_MIN_TVL - 1, apyBase: 20, apyReward: 0, apy: 20 },
  { pool: 'token-mismatch', project: 'fixture-protocol', symbol: 'DAI', chain: 'Base',
    tvlUsd: TRUST_RAILS.DEFAULT_MIN_TVL, apyBase: 20, apyReward: 0, apy: 20 }
];
const window = { navigator, TRUST_RAILS: trackedRails };
vm.runInNewContext(webmcpSource, {
  window,
  navigator,
  fetch(url) {
    fetchCalls.push(url);
    return Promise.resolve({ json: () => Promise.resolve({ data: fixtures }) });
  }
}, { filename: 'home.html#webmcp' });

const tools = registrations.reduce(
  (all, registration) => all.concat(Array.from(registration.tools || [])),
  []
);
const toolNames = Array.from(tools, (tool) => tool.name).sort();
const searchTool = tools.find((tool) => tool.name === 'search_yield_pools');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed++;
    console.error('  ✗ ' + name + '\n    ' + err.message);
  }
}

function executableCode(source) {
  return source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    ' '
  );
}

function routeMode(search) {
  const attributes = {};
  const document = {
    title: 'DeFi Garden',
    documentElement: { setAttribute: (name, value) => { attributes[name] = value; } },
    querySelector: () => null,
    createElement: () => ({}),
    head: { appendChild: () => {} }
  };
  const routeWindow = {
    location: { pathname: '/', search },
    matchMedia: () => ({ matches: false }),
    __canonicalFor: () => 'https://www.defi.garden/'
  };
  vm.runInNewContext(routerSource, {
    window: routeWindow,
    document,
    localStorage: { getItem: () => null },
    URLSearchParams
  }, { filename: 'home.html#ia-router' });
  assert.strictEqual(attributes['data-app-mode'], routeWindow.__APP_MODE,
    'router must mirror its selected mode onto <html>');
  return routeWindow.__APP_MODE;
}

(async function main() {
  console.log('WebMCP trust rails — product-loop 266');

  await test('trust-rails.js is synchronously loaded before the WebMCP block', () => {
    const tag = '<script src="trust-rails.js"></script>';
    const tagAt = homeHtml.indexOf(tag);
    const webmcpAt = homeHtml.indexOf(WEBMCP_MARKER);
    assert.ok(tagAt >= 0 && tagAt < webmcpAt,
      'home.html must load trust-rails.js synchronously before registering WebMCP tools');
  });

  await test('actual provideContext output enumerates exactly the two registered tools', () => {
    assert.deepStrictEqual(toolNames, [
      'calculate_savings_projection',
      'search_yield_pools'
    ]);
    assert.strictEqual(new Set(toolNames).size, toolNames.length, 'tool names must be unique');
    assert.ok(searchTool && typeof searchTool.execute === 'function',
      'search_yield_pools must be located from the enumerated registration population');
  });

  await test('WebMCP executable code contains no numeric literal equal to a trust rail', () => {
    const literals = (executableCode(webmcpSource).match(
      /\b\d(?:_?\d)*(?:\.\d(?:_?\d)*)?(?:e[+-]?\d(?:_?\d)*)?\b/gi
    ) || []).map((token) => Number(token.replace(/_/g, '')));
    const bareRails = [...new Set([
      TRUST_RAILS.APY_SANITY_LIMIT,
      TRUST_RAILS.DEFAULT_MIN_TVL
    ].filter((rail) => literals.includes(rail)))];
    assert.deepStrictEqual(bareRails, [],
      'WebMCP hardcodes trust-rail numeric literals instead of window.TRUST_RAILS references');
  });

  await test('search_yield_pools applies shared TVL and total-APY rails and maps the survivor', async () => {
    railReads.length = 0;
    const result = JSON.parse(JSON.stringify(await searchTool.execute({
      token: 'USDC', chain: 'Base', minApy: 500
    })));
    assert.deepStrictEqual(result, {
      success: true,
      results: [{
        pool: 'base-only', project: 'fixture-protocol', symbol: 'USDC', chain: 'Base',
        tvlUsd: TRUST_RAILS.DEFAULT_MIN_TVL, apy: 600
      }]
    }, '600+600 must be excluded; 600+0 kept; sub-floor and token mismatch excluded');
    assert.deepStrictEqual(fetchCalls, ['https://yields.llama.fi/pools']);
    assert.ok(railReads.includes('DEFAULT_MIN_TVL'),
      'search execution must read DEFAULT_MIN_TVL from window.TRUST_RAILS');
    assert.ok(railReads.includes('APY_SANITY_LIMIT'),
      'search execution must read APY_SANITY_LIMIT from window.TRUST_RAILS');
  });

  await test('actual IA router preserves bare / as landing and ?token=USDC as analytics', () => {
    assert.strictEqual(routeMode(''), 'landing');
    assert.strictEqual(routeMode('?token=USDC'), 'analytics');
  });

  console.log(`\n${passed} assertions passed; ${failed} failed`);
  if (failed) process.exit(1);
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
