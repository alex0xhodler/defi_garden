/**
 * Pool-page slugs + manifest lookup (W1, seo-turnaround-plan-2026-10).
 *
 * Dependency-free on purpose: generate-token-pages.js / generate-chain-pages.js
 * require this to repoint pool-row links at /pools/<slug>, and
 * generate-pool-score-pages.js requires it to name the pages — keeping it a
 * leaf module means no require cycle between those generators.
 *
 *   assignPoolSlugs(pools)  -> Map(poolUuid -> slug), deterministic
 *   poolSlugBase(pool)      -> '<project>-<symbol>-<chain>' slugified
 *   getPoolPageSlug(uuid)   -> slug | null, from data/pool-pages.json
 *
 * The manifest is `{generatedAt, count, pages:[{slug, pool}]}`; a missing or
 * malformed manifest means "no pool has a static page" (every caller then
 * keeps its pre-W1 `/?pool=<uuid>` behaviour).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MANIFEST_REL_PATH = 'data/pool-pages.json';
const DEFAULT_MANIFEST_PATH = path.join(__dirname, MANIFEST_REL_PATH);
const MAX_SLUG_LENGTH = 90;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lowercase, non-alphanumerics collapsed to '-', trimmed, length-capped. */
function slugify(str) {
  return String(str == null ? '' : str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/** '<project>-<symbol>-<chain>' — e.g. aave-v3-usdc-base. */
function poolSlugBase(pool) {
  return slugify([pool.project, pool.symbol, pool.chain].filter(Boolean).join(' '));
}

function shortId(uuid, n) {
  return String(uuid || '').replace(/-/g, '').slice(0, n);
}

/** A slug must never be mistaken for a pool uuid (or be empty). */
function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    slug.length <= MAX_SLUG_LENGTH + 9 && !UUID_RE.test(slug);
}

/**
 * Deterministic slug assignment over a pool list. Pass the FULL snapshot (not
 * just the page set) so a slug depends only on the pools that share its base,
 * never on the page limit: raising --limit from 100 to 300 cannot rename an
 * already-published URL.
 *
 * Within a group of pools sharing a base slug, order is TVL desc then uuid asc.
 * Each pool takes the first free candidate of:
 *   1. <base>                 (the highest-TVL pool keeps the clean slug)
 *   2. <base>-<poolMeta slug> (only when poolMeta is present)
 *   3. <base>-<uuid prefix>   (6 hex chars, widened until unique)
 */
function assignPoolSlugs(pools) {
  const groups = new Map();
  (pools || []).forEach(p => {
    if (!p || !p.pool) return;
    const base = poolSlugBase(p) || 'pool';
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(p);
  });
  const used = new Set();
  const out = new Map();
  Array.from(groups.keys()).sort().forEach(base => {
    const group = groups.get(base).slice().sort((a, b) =>
      (b.tvlUsd || 0) - (a.tvlUsd || 0) || String(a.pool).localeCompare(String(b.pool)));
    group.forEach(p => {
      const meta = slugify(p.poolMeta);
      const candidates = [base];
      if (meta) candidates.push(slugify(`${base} ${meta}`));
      let slug = candidates.find(c => c && !used.has(c) && isValidSlug(c));
      for (let n = 6; !slug && n <= 32; n += 2) {
        const c = `${base}-${shortId(p.pool, n)}`;
        if (!used.has(c) && isValidSlug(c)) slug = c;
      }
      used.add(slug);
      out.set(p.pool, slug);
    });
  });
  return out;
}

// --- manifest ---------------------------------------------------------------
let cache = null; // { path, map }

function loadPoolPageManifest(manifestPath) {
  const p = manifestPath || DEFAULT_MANIFEST_PATH;
  const map = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    (Array.isArray(raw && raw.pages) ? raw.pages : []).forEach(e => {
      if (e && e.pool && isValidSlug(e.slug)) map.set(e.pool, e.slug);
    });
  } catch (e) { /* missing/malformed manifest: no static pool pages */ }
  return map;
}

/** uuid -> slug from the committed manifest (cached), or null. */
function getPoolPageSlug(uuid) {
  if (!uuid) return null;
  if (!cache) cache = { map: loadPoolPageManifest() };
  return cache.map.get(uuid) || null;
}

/** Test/generator hook: replace the cached manifest with an explicit Map
 *  (pass null to drop the cache and re-read data/pool-pages.json). */
function setPoolPageManifest(mapOrNull) {
  cache = mapOrNull ? { map: mapOrNull } : null;
}

module.exports = {
  slugify, poolSlugBase, assignPoolSlugs, isValidSlug,
  loadPoolPageManifest, getPoolPageSlug, setPoolPageManifest,
  MANIFEST_REL_PATH, DEFAULT_MANIFEST_PATH, MAX_SLUG_LENGTH, UUID_RE
};
