#!/usr/bin/env node
// Renders og-image.source.html → og-image.png at exactly 1200x630.
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
await page.screenshot({ path: 'og-image.png', clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('Wrote og-image.png (1200x630 @2x)');
