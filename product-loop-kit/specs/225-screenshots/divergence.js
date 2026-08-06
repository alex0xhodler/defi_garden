/* Measure the SAME component role across surfaces: are they one component or N? */
const { chromium } = require('/home/user/defi_garden/node_modules/playwright');
const fs = require('fs');

const SNAPSHOT_RAW = fs.readFileSync('/home/user/defi_garden/data/pools-snapshot.json', 'utf8');
const SNAP = JSON.parse(SNAPSHOT_RAW);
const POOLS = Array.isArray(SNAP) ? SNAP : (SNAP.data || SNAP.pools || []);
const pick = POOLS.find(x => x.tvlUsd > 5e7 && x.apy > 1 && x.apy < 100) || POOLS[0];

const SURFACES = [
  { name: 'landing', url: '/', ready: '.landing-app' },
  { name: 'planner', url: '/plan.html', ready: '.gp-app .gp-chip' },
  { name: 'grid',    url: '/?token=USDC', ready: '.pool-card' },
  { name: 'pool',    url: '/?pool=' + encodeURIComponent(pick.pool || pick.id), ready: '.pool-detail-container' },
];

// role -> candidate selectors per surface
const ROLES = {
  'primary button': ['.landing-garden-link', '.gp-cta', '.gp-primary-cta', '.cta-button-primary', '.search-button', '.app-search-button', '.calculate-yield-btn-new'],
  'secondary button': ['.landing-icon-button', '.gp-analytics-btn', '.cta-button-protocol', '.app-control-btn', '.view-toggle-btn', '.theme-toggle', '.detail-header-btn'],
  'chip / pill': ['.landing-example-chip', '.gp-chip', '.gp-persona-pill', '.app-filter-btn', '.filter-pill', '.quick-amount-btn', '.pool-type-badge', '.chain-pill'],
  'card / panel': ['.landing-garden-card', '.gp-card', '.gp-thread-card', '.pool-card', '.pool-hero-card', '.calculator-card', '.pool-info-section', '.results-header'],
  'text input': ['.landing-search-shell', '.gp-freetext', '.app-search-bar', '.amount-input', '.gp-ask-form'],
  'header': ['.landing-header', '.gp-header', '.app-header-sticky'],
};

const PROPS = ['borderRadius', 'borderWidth', 'borderColor', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'paddingTop', 'paddingLeft', 'height', 'boxShadow'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const found = {};
  for (const s of SURFACES) {
    const page = await ctx.newPage();
    await page.route('**/data/pools-snapshot-meta.json', r => r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), count: POOLS.length, bytes: SNAPSHOT_RAW.length }) }));
    await page.route('**/data/pools-snapshot.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: SNAPSHOT_RAW }));
    await page.route('https://yields.llama.fi/pools', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: POOLS }) }));
    try {
      await page.goto('http://localhost:8000' + s.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(s.ready, { timeout: 40000 });
      await page.waitForTimeout(1500);
    } catch (e) { console.error('SKIP', s.name, e.message.split('\n')[0]); await page.close(); continue; }

    const res = await page.evaluate(({ ROLES, PROPS }) => {
      const out = {};
      for (const [role, sels] of Object.entries(ROLES)) {
        out[role] = [];
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) continue;
          const cs = getComputedStyle(el);
          const rec = { sel };
          for (const p of PROPS) rec[p] = cs[p];
          rec.h = Math.round(r.height);
          out[role].push(rec);
        }
      }
      return out;
    }, { ROLES, PROPS });
    found[s.name] = res;
    await page.close();
  }
  await browser.close();

  // Report per role, across surfaces
  for (const role of Object.keys(ROLES)) {
    console.log('\n=== ' + role.toUpperCase() + ' ===');
    const rows = [];
    for (const [surface, roles] of Object.entries(found)) {
      for (const rec of (roles[role] || [])) rows.push({ surface, ...rec });
    }
    if (!rows.length) { console.log('  (none found)'); continue; }
    for (const r of rows) {
      console.log(`  ${r.surface.padEnd(8)} ${r.sel.padEnd(26)} radius=${String(r.borderRadius).padEnd(10)} h=${String(r.h).padEnd(4)} border=${r.borderWidth} ${r.borderColor}  bg=${r.backgroundColor}  font=${r.fontSize}/${r.fontWeight}  pad=${r.paddingTop}/${r.paddingLeft}`);
    }
    const uniq = new Set(rows.map(r => r.borderRadius));
    console.log(`  --> DISTINCT RADII: ${uniq.size} (${[...uniq].join(' | ')})`);
    const uh = new Set(rows.map(r => r.h));
    console.log(`  --> DISTINCT HEIGHTS: ${uh.size} (${[...uh].join(' | ')})`);
  }
})();
