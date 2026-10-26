/**
 * Protocol-page selection (W4, docs/seo-turnaround-plan-2026-10.md), shared by
 * generate-protocol-pages.js (writes /protocols/<slug>) and
 * generate-pool-score-pages.js (links "Protocol: <name> →" to the pages that
 * exist). A leaf module (no generator requires) so there is no require cycle,
 * and the selection is a PURE function of the pools snapshot: both generators
 * compute the same set without depending on step order in CI.
 *
 * GATE (anti-thin/doorway, owner decision 2026-10-26): a protocol (DefiLlama
 * `project`) gets a page only with >= PROTOCOL_MIN_POOLS scored pools that pass
 * the trust rails AND >= PROTOCOL_MIN_TVL_USD total qualifying TVL; the top
 * PROTOCOL_PAGE_LIMIT by TVL are written. Everything else gets NO page (not
 * even a noindex one).
 *
 * Named from the filename so .vercelignore's /generate-*.js keeps it off the CDN.
 */
'use strict';

const TRUST_RAILS = require('./trust-rails.js');
const { slugify } = require('./pool-page-links.js');
const { isPermissionedProject } = require('./permissioned-projects.js');

// --- tunables (named, never inline literals) --------------------------------
// Thresholds set 2026-10-26 by the owner for the v1 tranche. Revisit with the
// W1-style kill switch (expand only if the pages earn impressions).
const PROTOCOL_MIN_POOLS = 3;            // scored, rail-passing pools
const PROTOCOL_MIN_TVL_USD = 5000000;    // total qualifying TVL ($5M)
const PROTOCOL_PAGE_LIMIT = 80;          // v1 cap, top protocols by qualifying TVL
// Yield floor for protocol pages (lead review 2026-10-26): these pages are about
// YIELD, so only yield-bearing pools count anywhere (gate, stats, ratings, table,
// by-chain/type, JSON-LD, llms). Total APY = apyBase + apyReward, in percent.
// Collateral-only markets (e.g. Aave v3 supply of WETH/WBTC at ~0.00%) are
// excluded from the PAGE only; the app still lists them (it demotes + tags
// "No supply yield", test_zero_yield_demote.js) and trust rails are untouched.
// Page-selection rule, like W1_MIN_APY_PCT in generate-pool-score-pages.js.
const MIN_PAGE_APY = 0.1;
const PROTOCOL_TABLE_MAX_ROWS = 50;      // pool rows shown on a page

function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

function poolTotalApy(p) { return (p.apyBase || 0) + (p.apyReward || 0); }

/** A pool counts toward a protocol page only if it is scored AND clears the
 *  trust rails (TVL floor, APY sanity). Rails come from trust-rails.js. */
function isQualifyingScoredPool(p) {
  if (!p || !p.pool || !p.project) return false;
  if (!p.defiScore || !isNum(p.defiScore.score)) return false;
  if (!isNum(p.tvlUsd) || p.tvlUsd < TRUST_RAILS.DEFAULT_MIN_TVL) return false;
  if (poolTotalApy(p) > TRUST_RAILS.APY_SANITY_LIMIT) return false;
  if (poolTotalApy(p) < MIN_PAGE_APY) return false; // yield-bearing pools only
  return true;
}

/**
 * Pure selection. Returns { eligibleCount, selected } where selected is
 * [{ project, slug, pools (TVL desc), tvl, permissioned }] ranked by qualifying
 * TVL desc (project name as tie-break), capped at `limit` (0 = no cap).
 */
function selectProtocols(pools, limit, thresholds) {
  const th = Object.assign({ minPools: PROTOCOL_MIN_POOLS, minTvl: PROTOCOL_MIN_TVL_USD }, thresholds || {});
  const cap = (limit == null || Number.isNaN(limit)) ? PROTOCOL_PAGE_LIMIT : limit;
  const byProject = new Map();
  (pools || []).forEach(p => {
    if (!isQualifyingScoredPool(p)) return;
    if (!byProject.has(p.project)) byProject.set(p.project, []);
    byProject.get(p.project).push(p);
  });
  const eligible = [];
  byProject.forEach((ps, project) => {
    const tvl = ps.reduce((s, p) => s + p.tvlUsd, 0);
    if (ps.length < th.minPools || tvl < th.minTvl) return;
    ps.sort((a, b) => b.tvlUsd - a.tvlUsd || String(a.pool).localeCompare(String(b.pool)));
    eligible.push({ project, pools: ps, tvl, permissioned: isPermissionedProject(project) });
  });
  eligible.sort((a, b) => b.tvl - a.tvl || a.project.localeCompare(b.project));
  const selected = (cap > 0 ? eligible.slice(0, cap) : eligible);
  // Slugs: slugified DefiLlama project; a (rare) collision keeps the larger
  // protocol's clean slug and suffixes the rest deterministically.
  const used = new Set();
  selected.forEach(rec => {
    const base = slugify(rec.project) || 'protocol';
    let slug = base;
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
    used.add(slug);
    rec.slug = slug;
  });
  return { eligibleCount: eligible.length, selected };
}

/** "aave-v3" -> "Aave v3", "ether.fi-stake" -> "Ether.fi Stake". */
function protocolDisplayName(project) {
  return String(project || '').split('-').filter(Boolean).map(w =>
    /^v\d+(\.\d+)*$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Map(project -> slug) for the pages that exist (used for cross-links). */
function protocolSlugMap(pools, limit) {
  return new Map(selectProtocols(pools, limit).selected.map(r => [r.project, r.slug]));
}

module.exports = {
  PROTOCOL_MIN_POOLS, PROTOCOL_MIN_TVL_USD, PROTOCOL_PAGE_LIMIT, PROTOCOL_TABLE_MAX_ROWS, MIN_PAGE_APY,
  isQualifyingScoredPool, selectProtocols, protocolDisplayName, protocolSlugMap, poolTotalApy
};
