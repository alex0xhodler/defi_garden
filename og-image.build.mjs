#!/usr/bin/env node
// Renders og-image.source.html → og-image.jpg at exactly 1200x630.
// JPEG at quality 85 (backlog 057): ~58% smaller than the PNG this replaced,
// no visible quality loss on the neumorphic gradient/shadow card.
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
  clip: { x: 0, y: 0, width: 1200, height: 630 },
});
await browser.close();
console.log('Wrote og-image.jpg (1200x630 @2x)');
