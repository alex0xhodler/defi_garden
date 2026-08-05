/* Screenshot harness for 225 round 3 increment (b-lite) — critique + low-hanging-fruit pass.
   Same v2 pattern as capture-round3a.js (routed snapshot, post-render selector, hard-fail).
   Surfaces: (a) /?app=1 search/empty state, (b) /?token=USDC forced into CARD/grid view,
   (c) /?pool=<live id> detail, (d) / landing. 1280 dark everywhere + 360 dark on edited surfaces. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(__dirname, 'round3b');
const BASE = 'http://localhost:8000';

const SNAPSHOT_PATH = path.join(ROOT, 'data', 'pools-snapshot.json');
const SNAPSHOT_RAW = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
const SNAPSHOT = JSON.parse(SNAPSHOT_RAW);
const POOLS = Array.isArray(SNAPSHOT) ? SNAPSHOT : (SNAPSHOT.data || SNAPSHOT.pools || []);

const SURFACES = [
  { name: 'search', url: '/?app=1', ready: '.search-input', widths: [1280, 360], themes: ['dark'] },
  { name: 'grid-card', url: '/?token=USDC', ready: '.pool-card', widths: [1280, 360], themes: ['dark'], toGrid: true },
  { name: 'pool', url: '/?pool=POOLID', ready: '.pool-detail-container', widths: [1280, 360], themes: ['dark'] },
  { name: 'landing', url: '/', ready: '.app-footer, footer', widths: [1280], themes: ['dark'] },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const p = POOLS.find(x => x.tvlUsd > 5e7 && x.apy > 1 && x.apy < 100) || POOLS[0];
  const poolId = p && (p.pool || p.id);
  console.log('poolId =', poolId);

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const errors = [];
  const failures = [];
  for (const s of SURFACES) {
    for (const theme of s.themes) {
      for (const w of s.widths) {
        const label = `${s.name}-${w}-${theme}`;
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
        await ctx.addInitScript(t => { try { localStorage.setItem('theme', t); } catch (e) {} }, theme);
        const url = BASE + s.url.replace('POOLID', encodeURIComponent(poolId || ''));
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
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
          if (s.toGrid) {
            // flip the view toggle into CARD/grid mode; first toggle btn is grid
            await page.locator('.view-toggles .view-toggle-btn').first().click();
            await page.waitForSelector('.pools-grid .pool-card', { timeout: 15000, state: 'visible' });
          }
          await page.waitForTimeout(1200);
          await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: false });
        } catch (e) {
          failures.push(`${label}: ${e.message.split('\n')[0]}`);
          console.error('FAIL', label, e.message.split('\n')[0]);
        }
        await page.close();
        await ctx.close();
      }
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'page-errors.txt'),
    'page errors:\n' + (errors.join('\n') || 'none') + '\n\ncapture failures:\n' + (failures.join('\n') || 'none') + '\n');
  console.log('page errors:', errors.length, '| capture failures:', failures.length);
  console.log('wrote', fs.readdirSync(OUT).filter(f => f.endsWith('.png')).length, 'PNGs to', OUT);
  if (failures.length) process.exitCode = 1;
})();
