/* Screenshot matrix for design-reset review: 4 surfaces x 3 widths x 2 themes.
   v2 (after verifier FAIL): each surface waits for a selector that only exists
   once the REAL content has rendered, and a surface that never reaches that
   state is recorded as a hard failure instead of silently shipping a
   loading-state or landing-page fallback image. */
const { chromium } = require('/home/user/defi_garden/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2];
const BASE = 'http://localhost:8000';
const WIDTHS = [360, 768, 1280];
const THEMES = ['light', 'dark'];
const SURFACES = [
  { name: 'landing', url: '/', ready: '.landing-app .landing-search-shell, .landing-app h1' },
  { name: 'planner', url: '/plan.html', ready: '.gp-app .gp-chip' },
  { name: 'grid', url: '/?token=USDC', ready: '.pool-card' },
  { name: 'pool', url: '/?pool=POOLID', ready: '.pool-detail-container .cta-button-primary, .pool-detail-container' },
];

const SNAPSHOT_RAW = fs.readFileSync('/home/user/defi_garden/data/pools-snapshot.json', 'utf8');
const SNAPSHOT = JSON.parse(SNAPSHOT_RAW);
const POOLS = Array.isArray(SNAPSHOT) ? SNAPSHOT : (SNAPSHOT.data || SNAPSHOT.pools || []);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const list = POOLS;
  const p = list.find(x => x.tvlUsd > 5e7 && x.apy > 1 && x.apy < 100) || list[0];
  const poolId = p && (p.pool || p.id);
  console.log('poolId =', poolId);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [];
  const failures = [];
  for (const theme of THEMES) {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      await ctx.addInitScript(t => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
      for (const s of SURFACES) {
        const label = `${s.name}-${w}-${theme}`;
        const url = BASE + s.url.replace('POOLID', encodeURIComponent(poolId || ''));
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
        // Real committed data, routed verbatim — the repo's established fixture
        // pattern (browser-originated HTTPS is blocked in this sandbox, and the
        // committed snapshot goes stale after SNAPSHOT_MAX_AGE_MS = 6h, which is
        // what silently produced loading-state screenshots on the first pass).
        await page.route('**/data/pools-snapshot-meta.json', r => r.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), count: POOLS.length, bytes: SNAPSHOT_RAW.length }) }));
        await page.route('**/data/pools-snapshot.json', r => r.fulfill({
          status: 200, contentType: 'application/json', body: SNAPSHOT_RAW }));
        await page.route('https://yields.llama.fi/pools', r => r.fulfill({
          status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', data: POOLS }) }));
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector(s.ready, { timeout: 40000, state: 'visible' });
          await page.waitForTimeout(1200); // let fonts/layout settle after content lands
          // Guard: the grid must actually list pools, not report zero.
          if (s.name === 'grid') {
            const cards = await page.locator('.pool-card').count();
            if (cards < 1) throw new Error('grid rendered 0 pool cards');
          }
          await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: false });
        } catch (e) {
          failures.push(`${label}: ${e.message.split('\n')[0]}`);
          console.error('FAIL', label, e.message.split('\n')[0]);
        }
        await page.close();
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'page-errors.txt'),
    'page errors:\n' + (errors.join('\n') || 'none') + '\n\ncapture failures:\n' + (failures.join('\n') || 'none') + '\n');
  console.log('page errors:', errors.length, '| capture failures:', failures.length);
  console.log('wrote', fs.readdirSync(OUT).filter(f => f.endsWith('.png')).length, 'PNGs to', OUT);
  if (failures.length) process.exitCode = 1;
})();
