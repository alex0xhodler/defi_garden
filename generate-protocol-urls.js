#!/usr/bin/env node

/**
 * Static protocol-URL map generator for DeFi Garden (backlog 182 — bakes the
 * north-star CTA's URL resolution off the runtime `api.llama.fi/protocols`
 * fetch app.js documents as allowed to fail silently).
 *
 * Fetches `https://api.llama.fi/protocols` (the URL source, same payload
 * app.js's background fetch reads) and `https://yields.llama.fi/pools` (the
 * live project population — NOT the committed pools-snapshot; see Territory
 * note T3 below for why), keys the protocols mapping with EXACTLY the same
 * expression app.js's runtime code uses (see PROTOCOL_KEY_TRANSFORM markers,
 * both here and at app.js's dynamic-protocols fetch — test_protocol_url_keys.js
 * asserts they agree, behaviourally AND textually), and restricts the output
 * to keys actually reachable by a live pool so the artifact stays small.
 *
 * Territory note T3 (spec 182, operator blindspot pass, 2026-07-30):
 * `?pool=<id>` deep links bypass the committed `data/pools-snapshot.json`
 * entirely and load live `/pools` (spec 105). Restricting this artifact's
 * population to snapshot projects (as the spec's Change section originally
 * said) would leave every off-snapshot deep-link arrival — the very SEO
 * cohort this item exists to serve — back on the degraded path. So the
 * population here is every project key seen in the LIVE `/pools` feed, not
 * the snapshot. Measured 2026-07-30: 482 keys / 20,496 B raw / 5,939 B gzip,
 * covering 15,957 of 15,998 live pools (99.7%) — see specs/182-notes.md for
 * the full comparison table against "whole feed" and "snapshot-only".
 *
 * Freshness discipline (081/083/generate-pools-snapshot.js pattern): if the
 * regenerated output is byte-identical to what's on disk modulo `generatedAt`,
 * nothing is written — a no-data-change run must not force a commit.
 *
 * `--out <dir>` isolates all writes (076 lesson: no cwd-coupled writes into
 * committed surface during a verification run). `--protocols-fixture <file>`
 * / `--pools-fixture <file>` allow fully offline runs for tests/CI dry-runs.
 *
 * Usage:
 *   node generate-protocol-urls.js                              # fetch live, write ./data
 *   node generate-protocol-urls.js --out /tmp/scratch            # write everything under /tmp/scratch
 *   node generate-protocol-urls.js --protocols-fixture p.json --pools-fixture q.json   # fully offline
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROTOCOLS_API = 'https://api.llama.fi/protocols';
const POOLS_API = 'https://yields.llama.fi/pools';
const SCHEMA_VERSION = 1;

// PROTOCOL_KEY_TRANSFORM (single source of truth — test_protocol_url_keys.js asserts app.js and generate-protocol-urls.js agree)
// Body is the SAME ONE expression app.js's dynamic-protocols fetch uses to key
// by protocol.name (and that getProtocolUrl() separately applies to
// pool.project) — never re-typed differently here. app.js's runtime
// expression is the source of truth; this function conforms to it, not vice
// versa.
function protocolUrlKey(name) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

/** Minimal https GET-JSON helper, same style as generate-pools-snapshot.js's
 * fetchPoolData(). */
function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`parse failed for ${url}: ${e.message}`));
        }
      });
    }).on('error', (e) => reject(new Error(`request failed for ${url}: ${e.message}`)));
  });
}

/** True if `url` is a non-blank https:// URL. A hand-baked, committed artifact
 * carries a stricter bar than the live runtime fetch (which uses
 * protocol.url as-is, http:// or blank included): ~201 of 7,962 protocols in
 * the live feed have a blank (" ") or plain-http url, and baking those in
 * would ship a dead/insecure link from our own origin forever until the next
 * regen. Filtered out here only — never affects the live dynamicProtocolUrls
 * tier, which is untouched. */
function isValidHttpsUrl(url) {
  return typeof url === 'string' && /^https:\/\/\S/.test(url.trim());
}

/** Build { key: url } from the protocols feed — mirrors app.js's
 * fetchProtocolsInBackground urlMapping construction: key by
 * protocolUrlKey(protocol.name), plus a protocol.slug alias when it differs.
 * Entries whose url isn't a valid https:// URL are skipped (see
 * isValidHttpsUrl above — deliberate, stricter than the live runtime tier). */
function buildUrlMapping(protocols) {
  const mapping = {};
  (protocols || []).forEach((protocol) => {
    if (protocol && protocol.name && isValidHttpsUrl(protocol.url)) {
      const key = protocolUrlKey(protocol.name);
      mapping[key] = protocol.url.trim();
      if (protocol.slug && protocol.slug !== key) {
        mapping[protocol.slug] = protocol.url.trim();
      }
    }
  });
  return mapping;
}

/** Population set (Territory T3): {p.project} ∪ {protocolUrlKey(p.project)}
 * for every pool in the LIVE pools feed — this is what getProtocolUrl()
 * actually looks a key up against (dynamicProtocolUrls[key] ||
 * dynamicProtocolUrls[pool.project] || ...), so it's the exact membership
 * test that determines whether a baked entry can ever be read back. */
function buildPopulation(pools) {
  const population = new Set();
  (pools || []).forEach((p) => {
    if (p && p.project) {
      population.add(p.project);
      population.add(protocolUrlKey(p.project));
    }
  });
  return population;
}

/** Restrict `mapping` to keys present in `population`, returning a NEW object
 * with keys sorted so serialized output is byte-stable across runs. */
function restrictAndSort(mapping, population) {
  const keys = Object.keys(mapping).filter((k) => population.has(k)).sort();
  const out = {};
  keys.forEach((k) => { out[k] = mapping[k]; });
  return out;
}

/** Pure core: raw protocols + raw pools + a generatedAt stamp -> the artifact
 * object { schemaVersion, generatedAt, urls }. No network/disk access. */
function buildArtifact(protocols, pools, generatedAt) {
  const fullMapping = buildUrlMapping(protocols);
  const population = buildPopulation(pools);
  const urls = restrictAndSort(fullMapping, population);
  return { schemaVersion: SCHEMA_VERSION, generatedAt, urls };
}

/** Coverage of the live pools feed by a given `urls` mapping — the same tier
 * membership test getProtocolUrl() performs (key, then raw pool.project). */
function measureCoverage(urls, pools) {
  let covered = 0;
  const total = (pools || []).length;
  (pools || []).forEach((p) => {
    if (!p || !p.project) return;
    const key = protocolUrlKey(p.project);
    if (Object.prototype.hasOwnProperty.call(urls, key) ||
        Object.prototype.hasOwnProperty.call(urls, p.project)) {
      covered++;
    }
  });
  return { covered, total };
}

/** Normalize serialized artifact content for the freshness compare: strip the
 * volatile `generatedAt` value (081/083 pattern, mirrored from
 * generate-pools-snapshot.js's normalizeSnapshotContent). */
function normalizeArtifactContent(content) {
  if (typeof content !== 'string') return content;
  return content.replace(/("generatedAt":\s*)"[^"]*"/g, '$1"<TS>"');
}

function tryRead(absPath) {
  try { return fs.readFileSync(absPath, 'utf8'); } catch (e) { return null; }
}

function resolveOutPath(outDir) {
  return path.join(outDir, 'protocol-urls.json');
}

function parseArgs(argv) {
  const args = { out: null, protocolsFixture: null, poolsFixture: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--protocols-fixture') args.protocolsFixture = argv[++i];
    else if (argv[i] === '--pools-fixture') args.poolsFixture = argv[++i];
  }
  return args;
}

async function loadProtocols(fixturePath) {
  let raw;
  if (fixturePath) {
    console.log('📄 Loading protocols from fixture:', fixturePath);
    raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } else {
    console.log('📡 Fetching protocols from DefiLlama...');
    raw = await httpsGetJson(PROTOCOLS_API);
  }
  return Array.isArray(raw) ? raw : (raw && raw.protocols) || [];
}

async function loadPools(fixturePath) {
  let raw;
  if (fixturePath) {
    console.log('📄 Loading pools from fixture:', fixturePath);
    raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  } else {
    console.log('📡 Fetching pools from DefiLlama...');
    raw = await httpsGetJson(POOLS_API);
  }
  return raw && raw.data ? raw.data : raw;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Default out = <repo>/data (resolved against this script, never
  // process.cwd() — 076 lesson). --out isolates all writes into the given dir.
  const outDir = args.out ? path.resolve(args.out) : path.resolve(__dirname, 'data');
  const outPath = resolveOutPath(outDir);

  const [protocols, pools] = await Promise.all([
    loadProtocols(args.protocolsFixture),
    loadPools(args.poolsFixture)
  ]);
  console.log(`✅ ${protocols.length} protocols, ${pools.length} pools fetched`);

  const generatedAt = new Date().toISOString();
  const artifact = buildArtifact(protocols, pools, generatedAt);
  const keyCount = Object.keys(artifact.urls).length;
  const { covered, total } = measureCoverage(artifact.urls, pools);
  const coveragePct = total ? ((covered / total) * 100).toFixed(1) : '0.0';
  const newContent = JSON.stringify(artifact);
  const bytes = Buffer.byteLength(newContent, 'utf8');

  const existing = tryRead(outPath);
  if (existing != null && normalizeArtifactContent(existing) === normalizeArtifactContent(newContent)) {
    console.log(`♻️  No data change — kept committed protocol-urls.json (${keyCount} keys). Nothing written.`);
    console.log(`📊 Coverage: ${keyCount} keys, ${bytes} bytes -> covers ${covered}/${total} live pools (${coveragePct}%)`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, newContent);
  console.log(`📦 Wrote protocol-urls.json: ${keyCount} keys, ${bytes} bytes`);
  console.log(`📊 Coverage: ${keyCount} keys -> covers ${covered}/${total} live pools (${coveragePct}%)`);
}

module.exports = {
  protocolUrlKey, isValidHttpsUrl, buildUrlMapping, buildPopulation, restrictAndSort, buildArtifact,
  measureCoverage, normalizeArtifactContent, resolveOutPath, parseArgs,
  SCHEMA_VERSION, PROTOCOLS_API, POOLS_API
};

if (require.main === module) {
  main().catch((e) => { console.error('❌', e.message); process.exit(1); });
}
