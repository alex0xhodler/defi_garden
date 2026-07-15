#!/usr/bin/env node

/**
 * Static pools-snapshot generator for DeFi Garden (backlog 059 — feasibility-058
 * option (a), data-layer movement leg 1).
 *
 * Fetches DefiLlama's `/pools` once, applies the app's trust rails UPSTREAM, keeps
 * only the 13 fields the FE actually reads, and publishes a small snapshot the FE
 * can load in place of the multi-MB live payload. The FE always falls back to a
 * direct `yields.llama.fi` fetch when the snapshot is stale (>15 min) or missing,
 * so this file is a performance/plumbing layer, never a source of truth the app
 * can't route around.
 *
 * TRUST RAILS (BINDING — NORTH_STAR NEVER-list applies verbatim):
 *   The rails applied here are the SAME rails the FE runs, applied one layer
 *   upstream. They may NEVER be relaxed here. `DEFAULT_MIN_TVL` ($10M) and
 *   `APY_SANITY_LIMIT` (1000%) are mirrored VERBATIM from app.js:729-730.
 *   - The $10M TVL floor is applied at build time (never lowered).
 *   - Anomalous pools (total APY > APY_SANITY_LIMIT) are KEPT, not dropped —
 *     the FE's demote + ⚠-flag + force-High-risk logic stays client-side and
 *     needs the flagged pools present to do its job (058 §5: ship flags through,
 *     never hide flagged). This generator therefore filters on TVL only.
 *
 * The 13 used fields were re-derived by grepping `pool.<field>` accesses across
 * app.js / planner.js / PoolDetail.js (2026-07-14) and match 058 §0 exactly:
 *   pool, chain, project, symbol, tvlUsd, apyBase, apyReward, apyMean30d,
 *   poolMeta, url, exposure, ilRisk, underlyingTokens
 *
 * Freshness discipline (081/083 pattern): if the regenerated output is
 * byte-identical to what's on disk modulo the `generatedAt` stamp (and meta's
 * derived `bytes`), NOTHING is written — a no-data-change CI run must not
 * produce a commit (every snapshot commit = a Vercel deploy). Stale slice files
 * for chains/tokens that disappeared are deleted (031 pattern).
 *
 * `--out <dir>` isolates all writes into that dir (076 lesson: no cwd-coupled
 * writes into committed surface during a verification run).
 *
 * Usage:
 *   node generate-pools-snapshot.js                    # fetch live, write ./data
 *   node generate-pools-snapshot.js --out /tmp/scratch # write everything under /tmp/scratch
 *   node generate-pools-snapshot.js --fixture f.json   # offline: read pools from disk
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const YIELDS_API = 'https://yields.llama.fi/pools';

// TRUST RAILS — mirrored VERBATIM from app.js:729-730. Never relax here.
const APY_SANITY_LIMIT = 1000;        // total APY above this = anomalous (KEPT + flagged client-side)
const DEFAULT_MIN_TVL = 10000000;     // $10M floor — applied upstream, never lowered

const SCHEMA_VERSION = 1;

// The exact 13 fields the FE reads (re-derived 2026-07-14 — see header). Order
// is fixed so a projected pool is byte-stable across runs.
const FIELDS = [
  'pool', 'chain', 'project', 'symbol', 'tvlUsd', 'apyBase', 'apyReward',
  'apyMean30d', 'poolMeta', 'url', 'exposure', 'ilRisk', 'underlyingTokens'
];

/** Project a raw pool onto exactly the 13 used fields, preserving only keys the
 * source actually carries (null values kept; absent keys omitted) — no field
 * outside FIELDS ever survives. */
function projectPool(pool) {
  const out = {};
  for (let i = 0; i < FIELDS.length; i++) {
    const f = FIELDS[i];
    if (Object.prototype.hasOwnProperty.call(pool, f)) out[f] = pool[f];
  }
  return out;
}

/** The rail: $10M TVL floor applied upstream, anomalous pools KEPT. */
function isRailedIn(pool) {
  return (Number(pool.tvlUsd) || 0) >= DEFAULT_MIN_TVL;
}

/** URL/filesystem-safe slug (lowercased) — same shape generate-token-pages.js
 * uses for token/chain slugs. */
function slugify(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Wrap a set of projected pools in the snapshot envelope. The SAME envelope is
 * used for the full snapshot and every per-chain/per-token slice. */
function envelope(pools, generatedAt) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    source: YIELDS_API,
    minTvlUsd: DEFAULT_MIN_TVL,
    count: pools.length,
    pools
  };
}

/** Normalize a serialized snapshot/meta file for the freshness compare: strip
 * the volatile `generatedAt` value and meta's derived `bytes` so a run that only
 * changed the timestamp compares equal to what's committed (081/083 pattern).
 *
 * Also strips any per-pool `"kpis":{…}` object (087 C1 — the churn trap): a
 * separate step (`compute-kpis.js`) writes a derived `kpis` object INTO the
 * committed snapshot/slices. Without this strip, THIS generator's next run would
 * produce kpi-less content, compare-unequal, and rewrite the file (dropping
 * kpis) every single run — infinite daily churn = a daily Vercel deploy. The
 * kpis object is a flat single-level JSON object (values are numbers/null/short
 * strings, no nested `}`), so `,?"kpis":\{[^}]*\}` matches it exactly. Stripped
 * from BOTH sides of the compare: the fresh kpis-less generation has no match
 * (unchanged), the kpi-enriched committed file loses its `,"kpis":{…}` — so when
 * the railed pools are otherwise identical the two compare equal and nothing is
 * rewritten. */
function normalizeSnapshotContent(content) {
  if (typeof content !== 'string') return content;
  return content
    .replace(/("generatedAt":\s*)"[^"]*"/g, '$1"<TS>"')
    .replace(/("bytes":\s*)\d+/g, '$1<BYTES>')
    .replace(/,?"kpis":\{[^}]*\}/g, '');
}

/** Build the complete set of intended output files ({ absPath, content }) from
 * the railed pools. `paths` describes the output tree under a resolved outDir. */
function buildFiles(railedPools, generatedAt, paths) {
  const files = [];

  // Full snapshot.
  const snapshot = envelope(railedPools, generatedAt);
  const snapshotContent = JSON.stringify(snapshot);
  files.push({ absPath: paths.snapshot, content: snapshotContent });

  // Tiny meta (freshness check without downloading the full snapshot). `bytes`
  // is the byte length of the full snapshot file the FE would fetch.
  const meta = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    count: railedPools.length,
    bytes: Buffer.byteLength(snapshotContent, 'utf8')
  };
  files.push({ absPath: paths.meta, content: JSON.stringify(meta) });

  // Per-chain slices (keyed by slugified pool.chain) and per-token slices
  // (keyed by slugified pool.symbol). Pools whose key slugifies identically are
  // merged into one slice (dedupe). Empty slugs are skipped.
  const byChain = new Map();
  const byToken = new Map();
  railedPools.forEach(p => {
    const chainSlug = slugify(p.chain);
    if (chainSlug) {
      if (!byChain.has(chainSlug)) byChain.set(chainSlug, []);
      byChain.get(chainSlug).push(p);
    }
    const tokenSlug = slugify(p.symbol);
    if (tokenSlug) {
      if (!byToken.has(tokenSlug)) byToken.set(tokenSlug, []);
      byToken.get(tokenSlug).push(p);
    }
  });

  const sliceFiles = (map, dir) => {
    const out = [];
    map.forEach((pools, slug) => {
      out.push({
        absPath: path.join(dir, `${slug}.json`),
        content: JSON.stringify(envelope(pools, generatedAt))
      });
    });
    return out;
  };
  const chainSlices = sliceFiles(byChain, paths.chainDir);
  const tokenSlices = sliceFiles(byToken, paths.tokenDir);

  return {
    files: files.concat(chainSlices, tokenSlices),
    sliceBasenames: {
      [paths.chainDir]: new Set(chainSlices.map(f => path.basename(f.absPath))),
      [paths.tokenDir]: new Set(tokenSlices.map(f => path.basename(f.absPath)))
    }
  };
}

/** Slice .json files present on disk in `dir` that are NOT in `keepSet` — stale
 * chains/tokens that disappeared since the last run (031 deletion pattern). */
function findStaleSlices(dir, keepSet) {
  let entries;
  try { entries = fs.readdirSync(dir); } catch (e) { return []; }
  return entries
    .filter(f => f.endsWith('.json') && !keepSet.has(f))
    .map(f => path.join(dir, f));
}

function tryRead(absPath) {
  try { return fs.readFileSync(absPath, 'utf8'); } catch (e) { return null; }
}

function resolvePaths(outDir) {
  return {
    outDir,
    snapshot: path.join(outDir, 'pools-snapshot.json'),
    meta: path.join(outDir, 'pools-snapshot-meta.json'),
    chainDir: path.join(outDir, 'pools', 'chain'),
    tokenDir: path.join(outDir, 'pools', 'token')
  };
}

/**
 * Pure core (unit-testable, no network): given raw pools + a resolved outDir,
 * decide what to write and, unless `dryRun`, perform the writes/deletions.
 * Returns { changed, written, deleted, count, bytes } so tests can assert
 * idempotency, projection, floor, slices and stale-deletion without a browser.
 */
function generateSnapshot(rawPools, outDir, generatedAt, opts) {
  opts = opts || {};
  const paths = resolvePaths(outDir);
  const railed = (rawPools || []).filter(isRailedIn).map(projectPool);

  const built = buildFiles(railed, generatedAt, paths);
  const snapshotContent = built.files[0].content;
  const bytes = Buffer.byteLength(snapshotContent, 'utf8');

  // Stale slice detection (forces a write pass so deletions are staged).
  const staleChain = findStaleSlices(paths.chainDir, built.sliceBasenames[paths.chainDir]);
  const staleToken = findStaleSlices(paths.tokenDir, built.sliceBasenames[paths.tokenDir]);
  const stale = staleChain.concat(staleToken);

  // Change detection (whole-run, all-or-nothing so every emitted file shares
  // one consistent generatedAt): any missing/differing file, or any stale file
  // to delete, means this is a real data change.
  let changed = stale.length > 0;
  for (let i = 0; i < built.files.length && !changed; i++) {
    const existing = tryRead(built.files[i].absPath);
    if (existing == null ||
        normalizeSnapshotContent(existing) !== normalizeSnapshotContent(built.files[i].content)) {
      changed = true;
    }
  }

  if (!changed) {
    return { changed: false, written: 0, deleted: 0, count: railed.length, bytes };
  }
  if (opts.dryRun) {
    return { changed: true, written: built.files.length, deleted: stale.length, count: railed.length, bytes };
  }

  // Write everything (fresh generatedAt across the whole set), then delete stale.
  fs.mkdirSync(paths.outDir, { recursive: true });
  fs.mkdirSync(paths.chainDir, { recursive: true });
  fs.mkdirSync(paths.tokenDir, { recursive: true });
  built.files.forEach(f => fs.writeFileSync(f.absPath, f.content));
  stale.forEach(f => { try { fs.rmSync(f); } catch (e) {} });

  return { changed: true, written: built.files.length, deleted: stale.length, count: railed.length, bytes };
}

// --- IO layer (only runs as a script) --------------------------------------
function fetchPoolData() {
  return new Promise((resolve, reject) => {
    https.get(YIELDS_API, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (e) { reject(new Error('parse failed: ' + e.message)); }
      });
    }).on('error', (e) => reject(new Error('API request failed: ' + e.message)));
  });
}

function parseArgs(argv) {
  const args = { fixture: process.env.POOLS_FIXTURE || null, out: null, seoOut: process.env.SEO_OUT || null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixture') args.fixture = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--seo-out') args.seoOut = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Default out = <repo>/data (resolved against this script, never process.cwd()
  // — 076 lesson). --out isolates all writes into the given dir.
  const outDir = args.out ? path.resolve(args.out) : path.resolve(__dirname, 'data');

  let pools;
  if (args.fixture) {
    console.log('📄 Loading pools from fixture:', args.fixture);
    const raw = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
    pools = raw.data || raw;
  } else {
    console.log('📡 Fetching pools from DefiLlama...');
    pools = await fetchPoolData();
  }
  console.log(`✅ ${pools.length} pools fetched`);

  // 112: also emit a $1000-floored RAW-pool transient (full fields preserved,
  // a provable superset of every pool the 3 SEO generators consume) so ONE CI
  // fetch feeds the committed $10M snapshot AND all three generators. Scratch
  // path only — never committed/served (076 out-isolation lesson).
  if (args.seoOut) {
    const seoPools = pools.filter(p => (Number(p && p.tvlUsd) || 0) >= 1000);
    fs.writeFileSync(path.resolve(args.seoOut), JSON.stringify(seoPools));
    console.log(`🌱 SEO transient: ${seoPools.length} pools >= $1,000 TVL -> ${args.seoOut}`);
  }

  const generatedAt = new Date().toISOString();
  const result = generateSnapshot(pools, outDir, generatedAt);

  if (!result.changed) {
    console.log(`♻️  No data change — kept committed snapshot (${result.count} railed pools). Nothing written.`);
    return;
  }
  console.log(`📸 Wrote snapshot: ${result.count} pools >= $${DEFAULT_MIN_TVL.toLocaleString('en-US')} TVL, ${result.bytes} bytes`);
  console.log(`🗂️  Wrote ${result.written} files to ${outDir}/ (${result.deleted} stale slice(s) deleted)`);
}

module.exports = {
  projectPool, isRailedIn, slugify, envelope, buildFiles, findStaleSlices,
  normalizeSnapshotContent, resolvePaths, generateSnapshot,
  FIELDS, APY_SANITY_LIMIT, DEFAULT_MIN_TVL, SCHEMA_VERSION, YIELDS_API
};

if (require.main === module) {
  main().catch(e => { console.error('❌', e.message); process.exit(1); });
}
