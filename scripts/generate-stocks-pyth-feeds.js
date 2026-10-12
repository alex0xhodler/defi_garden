#!/usr/bin/env node
/**
 * Generates data/stocks-pyth-feeds.json: underlying ticker -> Pyth US-equity
 * price-feed id, for every underlying in data/stocks-registry.json.
 *
 * Feed discovery uses Hermes' keyless metadata endpoint (`/v2/price_feeds`).
 * Only the EXACT regular-session symbol `Equity.US.<TICKER>/USD` counts as a
 * match (share classes are spelled with a hyphen, BRK.B -> BRK-B); a fuzzy name match, the 24/7 `Equity.Index.*` synthetic feeds and the
 * `Crypto.*` token feeds (the token's own price, not the underlying's) are never
 * used. A ticker with no exact feed is listed under `missing`, never guessed.
 *
 * NOTE: reading PRICES from Hermes now needs an API key (PYTH_API_KEY, see
 * docs/stocks-terminal.md, Phase 4); this script needs none.
 *
 * Usage: node scripts/generate-stocks-pyth-feeds.js [--out <path>]
 * Env:   PYTH_FEEDS_BASE (default https://hermes.pyth.network)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', 'data', 'stocks-registry.json');
const DEFAULT_OUT = path.join(__dirname, '..', 'data', 'stocks-pyth-feeds.json');
const BASE = (process.env.PYTH_FEEDS_BASE || 'https://hermes.pyth.network').replace(/\/+$/, '');
const TIMEOUT_MS = 10000;

function underlyingsOf(registry) {
  const set = new Set();
  Object.values(registry.tokens || {}).forEach((t) => { if (t && typeof t.underlying === 'string' && t.underlying) set.add(t.underlying); });
  return Array.from(set).sort();
}

// Pyth writes share classes with a hyphen (BRK.B -> BRK-B); that is the only
// spelling rewrite allowed, and the resulting symbol must still match exactly.
function pythTicker(ticker) { return ticker.replace(/\./g, '-'); }

function pickExactFeed(feeds, ticker) {
  const wanted = 'Equity.US.' + pythTicker(ticker) + '/USD';
  const hit = (Array.isArray(feeds) ? feeds : []).find((f) => f && f.attributes && f.attributes.symbol === wanted && /^[0-9a-f]{64}$/.test(String(f.id || '')));
  return hit ? { id: hit.id, symbol: wanted } : null;
}

async function fetchFeeds(ticker) {
  const url = BASE + '/v2/price_feeds?asset_type=equity&query=' + encodeURIComponent(pythTicker(ticker));
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error('hermes price_feeds ' + res.status);
  return res.json();
}

async function build(registry, fetcher) {
  const feeds = {};
  const missing = [];
  for (const ticker of underlyingsOf(registry)) {
    const found = pickExactFeed(await fetcher(ticker), ticker);
    if (found) feeds[ticker] = found; else missing.push(ticker);
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: BASE + '/v2/price_feeds?asset_type=equity',
    rule: 'exact symbol Equity.US.<TICKER>/USD only; no fuzzy match, no Equity.Index / Crypto feeds',
    feeds,
    missing
  };
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx >= 0 ? path.resolve(process.argv[outIdx + 1]) : DEFAULT_OUT;
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const result = await build(registry, fetchFeeds);
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log('wrote ' + out + ': ' + Object.keys(result.feeds).length + ' feeds, ' + result.missing.length + ' missing' +
    (result.missing.length ? ' (' + result.missing.join(', ') + ')' : ''));
}

if (require.main === module) {
  main().catch((err) => { console.error('generate-stocks-pyth-feeds failed:', err.message); process.exit(1); });
}

module.exports = { pythTicker, underlyingsOf, pickExactFeed, build };
