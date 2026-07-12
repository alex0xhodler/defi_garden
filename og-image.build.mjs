#!/usr/bin/env node
// Renders og-image.source.html → og-image.jpg at exactly 1200x630.
// JPEG at quality 85 (backlog 057): ~83% smaller than the PNG this replaced,
// no visible quality loss on the neumorphic gradient/shadow card.
// `scale: 'css'` is required: deviceScaleFactor 2 renders the page at 2x
// internally for crisp text/gradients, but without `scale: 'css'`,
// screenshot() emits device pixels (2400x1260) instead of CSS pixels
// (1200x630) — the exact bug og:image:width/height (1200/630 everywhere
// this asset is referenced) declares, caught by the 057 verifier pass.
// Usage: node og-image.build.mjs   (run from repo root; needs playwright available)
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const src = pathToFileURL(resolve('og-image.source.html')).href;
const browser = await chromium.launch();
const page = await browser.newContext({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
}).then((c) => c.newPage());
await page.goto(src, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({
  path: 'og-image.jpg',
  type: 'jpeg',
  quality: 85,
  scale: 'css',
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});
await browser.close();
console.log('Wrote og-image.jpg (1200x630)');
