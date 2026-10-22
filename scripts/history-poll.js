#!/usr/bin/env node
/* scripts/history-poll.js — v2 history poller (GitHub Actions, every 3 hours).
 *
 * Fetch DefiLlama pools -> select what to track (history-poll-core.js) -> write one
 * INSERT OR REPLACE SQL file for the current 3-hour slot -> apply it to D1 table
 * `samples` with wrangler (unless --dry-run). See .github/workflows/history-poll.yml.
 *
 * Usage: node scripts/history-poll.js [--dry-run] [--out <file>]
 *          [--pools-fixture <file>] [--stocks-fixture <file>] [--prev-ids-file <file>]
 *   --prev-ids-file  JSON array of pool ids (or wrangler's d1 --json output) standing in
 *                    for the previous slot; without it, a real run asks D1 and a
 *                    --dry-run uses an empty set (no wrangler call).
 * Auth comes from CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID in the environment;
 * nothing secret is ever printed.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const llama = require('../llama-endpoints.js').build({
  LLAMA_YIELDS_BASE: process.env.LLAMA_YIELDS_BASE // free URLs only, like the canary
});
const core = require('./history-poll-core.js');

const WRANGLER = 'wrangler@4.151.3';
const DB_NAME = 'defi-garden-history';
const STOCKS_URL = 'https://www.defi.garden/data/stocks-pools.json';
const MIN_POOLS = 1000;       // fewer than this = degraded feed, abort without writing
const ATTEMPTS = 3;
const TIMEOUT_MS = 90000;

function parseArgs(argv) {
  const args = { dryRun: false, out: null, poolsFixture: null, stocksFixture: null, prevIdsFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--pools-fixture') args.poolsFixture = argv[++i];
    else if (a === '--stocks-fixture') args.stocksFixture = argv[++i];
    else if (a === '--prev-ids-file') args.prevIdsFile = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

async function getJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'defi-garden-history-poll' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** Accepts a plain id array or wrangler's `d1 execute --json` output. */
function idsFromD1Json(json) {
  if (Array.isArray(json) && json.every((x) => typeof x === 'string')) return new Set(json);
  const results = Array.isArray(json) && json[0] && json[0].results;
  return new Set((results || []).map((r) => r && r.pool_id).filter((x) => typeof x === 'string'));
}

function wranglerD1(extra) {
  return execFileSync('npx', ['-y', WRANGLER, 'd1', 'execute', DB_NAME, '--remote', ...extra],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
}

function loadPrevIds(args) {
  if (args.prevIdsFile) return idsFromD1Json(readJson(args.prevIdsFile));
  if (args.dryRun) { console.log('prev ids: dry-run without --prev-ids-file, using an empty set'); return new Set(); }
  try {
    const out = wranglerD1(['--json', '--command',
      'SELECT pool_id FROM samples WHERE ts = (SELECT MAX(ts) FROM samples)']);
    const ids = idsFromD1Json(JSON.parse(out));
    if (!ids.size) console.log('prev ids: samples table is empty, no sticky pools this run');
    return ids;
  } catch (err) {
    console.warn(`WARN prev ids: lookup failed (${err.message}); no sticky pools this run`);
    return new Set();
  }
}

async function loadWatchIds(args) {
  try {
    const json = args.stocksFixture ? readJson(args.stocksFixture) : await getJson(STOCKS_URL);
    const ids = core.watchIdsFromStocksPools(json);
    if (!ids.size) console.warn('WARN watchlist: stocks-pools.json had no pool ids; continuing with an empty watchlist');
    return ids;
  } catch (err) {
    console.warn(`WARN watchlist: could not load stocks-pools.json (${err.message}); continuing with an EMPTY watchlist, /stocks pools below $1M will have a gap this slot`);
    return new Set();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let body;
  if (args.poolsFixture) body = readJson(args.poolsFixture);
  else { console.log(`GET ${llama.pools()}`); body = await getJson(llama.pools()); }
  const pools = Array.isArray(body) ? body : body && body.data;
  if (!Array.isArray(pools) || pools.length < MIN_POOLS) {
    console.error(`history-poll: ABORT, DefiLlama returned ${Array.isArray(pools) ? pools.length : 'no'} pools (< ${MIN_POOLS}); degraded feed, nothing written`);
    process.exit(1);
  }

  const watchIds = await loadWatchIds(args);
  const prevIds = loadPrevIds(args);
  const { rows, counts, skippedInvalid } = core.selectPools(pools, { prevIds, watchIds });
  const ts = core.slotTs(Date.now() / 1000);
  const sql = core.buildInsertSql(ts, rows);
  const out = args.out || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'history-poll-')), 'samples.sql');
  fs.writeFileSync(out, sql);

  if (!args.dryRun) {
    try { wranglerD1(['--yes', '--file', out]); }
    catch (err) { console.error(`history-poll: D1 write failed: ${err.message}`); process.exit(1); }
  }

  const summary = `history-poll slot=${new Date(ts * 1000).toISOString()} rows=${counts.total} ` +
    `tracked=${counts.tracked} sticky=${counts.sticky} watch=${counts.watch} skippedInvalid=${skippedInvalid} ` +
    `watchlist=${watchIds.size} prevIds=${prevIds.size} sqlBytes=${Buffer.byteLength(sql)}` +
    `${args.dryRun ? ' (dry-run, sql at ' + out + ')' : ''}`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${summary}\n`);
}

main().catch((err) => { console.error(`history-poll: ${err.message}`); process.exit(1); });
