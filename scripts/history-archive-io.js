/*
 * I/O helpers shared by scripts/history-archive.js and scripts/history-backfill.js:
 * storage backends ({ get(key) -> Buffer|null, put(key, buf) }), the D1 reader, and
 * the "files first, manifest LAST" commit. Everything that touches the Cloudflare
 * account goes through an injectable `run`, so tests never need wrangler or a network.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const core = require('./history-archive-core.js');

const WRANGLER = 'wrangler@4.151.3';
const BUCKET = 'defi-garden-history-archive';
const DB_NAME = 'defi-garden-history';
const MANIFEST_KEY = 'manifest.json';
const rawKey = (month) => `raw/${month}.ndjson.gz`;
const dailyKey = (month) => `daily/${month}.ndjson.gz`;

// ---- storage ------------------------------------------------------------------
/** Directory-backed store for tests and dry-runs. */
function localDir(dir) {
  const resolve = (key) => {
    if (path.isAbsolute(key) || key.split('/').includes('..')) throw new Error(`history-archive: bad key ${key}`);
    return path.join(dir, key);
  };
  return {
    name: `local:${dir}`,
    get(key) {
      try { return fs.readFileSync(resolve(key)); } catch (err) { if (err.code === 'ENOENT') return null; throw err; }
    },
    put(key, buf) {
      const f = resolve(key);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const tmp = `${f}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, f);
    }
  };
}

// wrangler 4.151.3 prints exactly this for a missing key (ANSI-coloured). Anything else is a real error.
const NOT_FOUND = /The specified key does not exist\./;
const stripAnsi = (t) => String(t).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');
const contentType = (key) => (key.endsWith('.json') ? 'application/json' : 'application/gzip');

/** R2 through wrangler (auth from CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID). `run` is injectable for tests. */
function r2Wrangler(bucket = BUCKET, { run = execFileSync, attempts = 3 } = {}) {
  const npx = (args, opts) => run('npx', ['-y', WRANGLER, 'r2', 'object', ...args], opts);
  return {
    name: `r2:${bucket}`,
    get(key) {
      try {
        return npx(['get', `${bucket}/${key}`, '--remote', '--pipe'],
          { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 1024 });
      } catch (err) {
        if (NOT_FOUND.test(stripAnsi(err.stderr || ''))) return null;
        throw err;
      }
    },
    put(key, buf) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-archive-'));
      const tmp = path.join(dir, 'upload.bin');
      fs.writeFileSync(tmp, buf);
      try {
        for (let attempt = 1; ; attempt++) {
          try {
            npx(['put', `${bucket}/${key}`, '--remote', '--file', tmp, '--content-type', contentType(key)],
              { stdio: ['ignore', 'pipe', 'inherit'] });
            return;
          } catch (err) { if (attempt >= attempts) throw err; }
        }
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
  };
}

/** --store local:<dir> | r2 */
function openStore(spec) {
  if (spec === 'r2') return r2Wrangler();
  if (typeof spec === 'string' && spec.startsWith('local:') && spec.length > 6) return localDir(spec.slice(6));
  throw new Error(`history-archive: --store must be "r2" or "local:<dir>", got ${spec}`);
}

/** A missing manifest is only legitimate for the very first run (`init`); otherwise it means a bad read. */
function loadManifest(store, { init = false } = {}) {
  const buf = store.get(MANIFEST_KEY);
  if (!buf) {
    if (init) return core.emptyManifest();
    throw new Error('no manifest: run the backfill with --init first');
  }
  const m = JSON.parse(buf.toString('utf8'));
  if (!m || m.schemaVersion !== core.MANIFEST_SCHEMA_VERSION) throw new Error('history-archive: unsupported manifest schemaVersion');
  return { ...core.emptyManifest(), ...m, watermark: { ...core.emptyManifest().watermark, ...m.watermark }, months: m.months || {} };
}

// ---- D1 -------------------------------------------------------------------------
/** Runs one SQL command against the production D1 and returns the parsed --json output. */
function d1Json(sql, { run = execFileSync } = {}) {
  const out = run('npx', ['-y', WRANGLER, 'd1', 'execute', DB_NAME, '--remote', '--json', '--command', sql],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(out);
}

/** Generator of pages (arrays of {ts,pool_id,apy,tvl_usd}) after the keyset, ascending. `query` is injectable. */
function* d1Samples({ sinceTs = 0, sincePoolId = '', pageSize = 5000, query = d1Json } = {}) {
  let ts = sinceTs; let id = sincePoolId;
  for (;;) {
    const json = query(core.buildSamplesPageSql(ts, id, pageSize));
    const rows = (Array.isArray(json) && json[0] && json[0].results) || [];
    if (!rows.length) return;
    yield rows;
    const last = rows[rows.length - 1];
    ts = last.ts; id = last.pool_id;
    if (rows.length < pageSize) return;
  }
}

/** Fixture alternative: plain row array or wrangler --json output; keyset-filtered and sorted like D1 would. */
function fixtureSamples(json, { sinceTs = 0, sincePoolId = '' } = {}) {
  const rows = Array.isArray(json) && json[0] && Array.isArray(json[0].results) ? json[0].results : (Array.isArray(json) ? json : []);
  return rows.filter((r) => r.ts > sinceTs || (r.ts === sinceTs && r.pool_id > sincePoolId))
    .sort((a, b) => (a.ts - b.ts) || (a.pool_id < b.pool_id ? -1 : a.pool_id > b.pool_id ? 1 : 0));
}

// ---- commit -----------------------------------------------------------------------
/**
 * Upload every changed month file, read each back and verify its sha256, and only then upload the
 * manifest. `months` = [{ month, raw: {rows: <count>, buf, changed}, daily: {rows: <count>, buf, changed} }].
 * Any throw happens before the manifest is touched, so the previous manifest stays valid.
 * Returns { manifest, uploaded, bytes, manifestWritten }.
 */
function commitMonths(store, manifest, months, { watermark = {}, now = new Date().toISOString() } = {}) {
  let next = manifest;
  let uploaded = 0; let bytes = 0;
  for (const m of months) {
    for (const [kind, key] of [['raw', rawKey(m.month)], ['daily', dailyKey(m.month)]]) {
      const f = m[kind];
      const stats = core.fileStats(f.rows, f.buf);
      if (f.changed) {
        store.put(key, f.buf);
        const back = store.get(key);
        if (!back || core.sha256(back) !== stats.sha256) throw new Error(`history-archive: read-back mismatch for ${key}`);
        uploaded++; bytes += f.buf.length;
      }
      f.stats = stats;
    }
    const cur = next.months[m.month];
    if (!cur || cur.raw.sha256 !== m.raw.stats.sha256 || cur.daily.sha256 !== m.daily.stats.sha256
      || cur.raw.rows !== m.raw.stats.rows || cur.daily.rows !== m.daily.stats.rows) {
      next = core.updateManifest(next, m.month, { raw: m.raw.stats, daily: m.daily.stats }, now);
    }
  }
  const wm = core.withWatermark(next, watermark);
  const wmChanged = JSON.stringify(wm.watermark) !== JSON.stringify(manifest.watermark);
  const manifestChanged = next !== manifest || wmChanged;
  if (!manifestChanged) return { manifest, uploaded, bytes, manifestWritten: false };
  const finalManifest = { ...wm, updatedAt: now };
  const body = Buffer.from(JSON.stringify(finalManifest, null, 2) + '\n');
  store.put(MANIFEST_KEY, body);
  const back = store.get(MANIFEST_KEY);
  if (!back || core.sha256(back) !== core.sha256(body)) throw new Error('history-archive: manifest read-back mismatch');
  return { manifest: finalManifest, uploaded, bytes: bytes + body.length, manifestWritten: true };
}

/** Load a month, merge incoming raw points and rebuild its daily file. Pure aside from store.get. */
function buildMonth(store, manifest, month, incomingRaw, extraHistory = []) {
  const oldRawBuf = store.get(rawKey(month));
  const oldDailyBuf = store.get(dailyKey(month));
  // Integrity guard: never rebuild from (and so overwrite) data that is missing or differs from the manifest.
  const known = manifest.months[month];
  [['raw', rawKey(month), oldRawBuf], ['daily', dailyKey(month), oldDailyBuf]].forEach(([kind, key, buf]) => {
    if (known) {
      if (!buf || core.sha256(buf) !== known[kind].sha256) throw new Error(`history-archive: ${key} missing or does not match manifest; refusing to rebuild`);
    } else if (buf) {
      throw new Error(`history-archive: ${key} exists but month ${month} is not in the manifest (orphan); needs a human`);
    }
  });
  const merged = core.mergeRaw(core.parseNdjsonGz(oldRawBuf), incomingRaw);
  const oldDaily = core.parseNdjsonGz(oldDailyBuf);
  const history = core.gitHistoryFromDaily(oldDaily).concat(extraHistory);
  const daily = core.rollupDaily(merged, history);
  const rawBuf = core.serializeNdjsonGz(merged);
  const dailyBuf = core.serializeNdjsonGz(daily);
  return {
    month,
    raw: { rows: merged.length, buf: rawBuf, changed: !oldRawBuf || !oldRawBuf.equals(rawBuf) },
    daily: { rows: daily.length, buf: dailyBuf, changed: !oldDailyBuf || !oldDailyBuf.equals(dailyBuf) }
  };
}

module.exports = {
  WRANGLER, BUCKET, DB_NAME, MANIFEST_KEY, rawKey, dailyKey,
  localDir, r2Wrangler, openStore, loadManifest, d1Json, d1Samples, fixtureSamples, commitMonths, buildMonth
};
