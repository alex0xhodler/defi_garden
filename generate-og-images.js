#!/usr/bin/env node

/**
 * Per-page OG image generator for the static token/chain SEO surface
 * (backlog 051). Every /tokens/<slug> and /chains/<slug> page currently
 * ships the one shared og-image.png; this renders a unique 1200x630 PNG
 * per page — name, best honest APY, pool count — so social/SERP shares
 * carry a data-true, on-brand card instead of a generic logo.
 *
 * No runtime image service (static architecture, CLAUDE.md): images are
 * rendered at generation time via @napi-rs/canvas (headless, no browser)
 * and committed alongside the HTML, same as every other generated asset.
 *
 * TRUST PRINCIPLE: the APY on a card is Math.max(...rec.pools.map(poolTotalApy))
 * — the exact same expression generate-token-pages.js/generate-chain-pages.js
 * use for the page's own headline APY. `rec.pools` is already the gated,
 * non-anomalous, top-N-by-TVL slice built by rankTopTokens/rankTopChains
 * (generate-token-pages.js) — an anomalous or sub-floor pool never reaches
 * this module because it never reaches `rec.pools` in the first place.
 *
 * Fallback: a per-record render/write failure never breaks the page — the
 * caller gets FALLBACK_REL_PATH back for that slug and the page's og:image
 * points at the existing shared /og-image.png instead (spec 051, AC #3/#4).
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { poolTotalApy, formatApy } = require('./generate-token-pages.js');

const CARD_W = 1200;
const CARD_H = 630;

// Neuro design tokens, light mode (style.css :root) — canvas can't read CSS
// custom properties, so the handful this card needs are mirrored here.
const COLORS = {
  bg: '#E2E8F0',
  surface: '#EDF2F8',
  text: '#0F172A',
  textSecondary: '#475569',
  primary: '#3B82F6',
};

const FALLBACK_REL_PATH = 'og-image.png';

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Renders one 1200x630 OG card. `bestApy`/`poolCount` must already be
 * gated (caller passes rec.pools-derived values — see module doc). */
function renderOgCard({ label, bestApy, poolCount }) {
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createRadialGradient(CARD_W / 2, 0, 0, CARD_W / 2, 0, CARD_H * 1.3);
  bgGrad.addColorStop(0, COLORS.surface);
  bgGrad.addColorStop(1, COLORS.bg);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const pad = 56;
  roundRectPath(ctx, pad, pad, CARD_W - pad * 2, CARD_H - pad * 2, 28);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();

  const left = pad + 56;

  // Brand mark: a plain vector dot, not an emoji glyph — headless canvas in
  // CI has no guaranteed color-emoji font, and an unsupported glyph renders
  // as a tofu box (confirmed locally) instead of failing loudly.
  ctx.fillStyle = COLORS.primary;
  ctx.beginPath();
  ctx.arc(left + 9, pad + 60, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '600 30px sans-serif';
  ctx.fillText('DeFi Garden', left + 30, pad + 70);

  ctx.fillStyle = COLORS.text;
  ctx.font = '700 88px sans-serif';
  const labelText = String(label).length > 18 ? String(label).slice(0, 17) + '…' : String(label);
  ctx.fillText(labelText, left, pad + 210);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '500 30px sans-serif';
  ctx.fillText('Best APY tracked', left, pad + 270);

  ctx.fillStyle = COLORS.primary;
  ctx.font = '700 84px sans-serif';
  ctx.fillText(formatApy(bestApy), left, pad + 370);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '500 30px sans-serif';
  const poolLabel = `${poolCount} pool${poolCount === 1 ? '' : 's'} tracked · defi.garden`;
  ctx.fillText(poolLabel, left, pad + 420);

  return canvas.toBuffer('image/png');
}

function ogRelPath(kind, slug) {
  return `og/${kind}/${slug}.png`;
}

/**
 * Generates one OG PNG per record under <outRoot>/og/<kind>/<slug>.png.
 * `labelFor(rec)` extracts the display name (symbol or chain). Returns a
 * Map<slug, relPathToUse> — either the real per-slug path or
 * FALLBACK_REL_PATH when a single record's render/write throws (a bad
 * render can never take the whole page down, AC #3/#4).
 */
function generateOgImages(records, kind, labelFor, outRoot) {
  const ogDir = path.join(outRoot, 'og', kind);
  if (!fs.existsSync(ogDir)) fs.mkdirSync(ogDir, { recursive: true });

  // Remove stale images left by tokens/chains dropped by this run's gate or
  // renamed slugs (mirrors 031's .html cleanup — same staleness class).
  const currentSlugs = new Set(records.map(rec => rec.slug));
  fs.readdirSync(ogDir).forEach(f => {
    if (f.endsWith('.png') && !currentSlugs.has(f.slice(0, -4))) fs.rmSync(path.join(ogDir, f));
  });

  const paths = new Map();
  let failures = 0;
  records.forEach(rec => {
    try {
      const bestApy = Math.max(...rec.pools.map(poolTotalApy));
      const buf = renderOgCard({ label: labelFor(rec), bestApy, poolCount: rec.qualifyingCount });
      fs.writeFileSync(path.join(ogDir, `${rec.slug}.png`), buf);
      paths.set(rec.slug, ogRelPath(kind, rec.slug));
    } catch (e) {
      failures++;
      paths.set(rec.slug, FALLBACK_REL_PATH);
    }
  });
  if (failures > 0) {
    console.warn(`⚠️  ${failures}/${records.length} ${kind} OG images fell back to the shared image`);
  }
  return paths;
}

module.exports = { renderOgCard, ogRelPath, FALLBACK_REL_PATH, generateOgImages, COLORS, CARD_W, CARD_H };
