/* Screenshot harness for 225 round 3 increment (a) — grid surface only.
   Copied/adapted from capture-shots.js (same v2 pattern: wait for a
   post-render selector per surface, hard-fail rather than ship a
   loading-state image, route the committed snapshot so the render doesn't
   depend on wall-clock freshness or sandbox-blocked external HTTPS).

   Produces: grid at 360/768/1280 x light/dark (6 PNGs) + one 1280-dark
   pool-detail shot as a no-regression control (7 PNGs total), per the
   round 3a dispatch's verification step 3. */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.argv[2] || path.join(__dirname, 'round3a');
const BASE = 'http://localhost:8000';
const SURFACES = [
  { name: 'grid', url: '/?token=USDC', ready: '.pool-card', widths: [360, 768, 1280], themes: ['light', 'dark'] },
  { name: 'pool', url: '/?pool=POOLID', ready: '.pool-detail-container .cta-button-primary, .pool-detail-container', widths: [1280], themes: ['dark'] },
];

const SNAPSHOT_PATH = path.join(ROOT, 'data', 'pools-snapshot.json');
const SNAPSHOT_RAW = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
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
          await page.waitForTimeout(1200);
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
