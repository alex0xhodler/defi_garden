/*
 * Cloudflare Worker: pool-history poller (backlog 108/109, spec 108/117).
 *
 * scheduled(): hourly Cron Trigger → fetch yields.llama.fi/pools → apply the trust
 *   rails at write time (poller-core.railedRows) → INSERT OR REPLACE into D1 in
 *   batches → prune rows older than RETENTION_DAYS.
 * fetch(): authed `GET /history?days=N` → the recent window as JSON, for CI
 *   (compute-kpis.js, ticket 110) to reshape into per-pool series. Bearer-guarded
 *   by the READ_TOKEN secret.
 *
 * Store-only: the app FE never calls this Worker, so the no-backend tenet holds on
 * the read path. Rails are mirrored verbatim in poller-core.js and NEVER relaxed here.
 */

import core from './poller-core.js';

const YIELDS_API = 'https://yields.llama.fi/pools';
const BATCH_SIZE = 100;       // stay within D1's per-batch statement limit
const MAX_DAYS = 365;         // cap the read window

export default {
  async scheduled(event, env, ctx) {
    const ts = Math.floor((event.scheduledTime || Date.now()) / 1000);

    const res = await fetch(YIELDS_API, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`yields.llama.fi ${res.status}`);
    const json = await res.json();
    const pools = json && json.data ? json.data : json;

    const rows = core.railedRows(pools, ts);

    const insert = env.DB.prepare(
      'INSERT OR REPLACE INTO pool_history (pool_id, ts, apy, tvl_usd) VALUES (?, ?, ?, ?)'
    );
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
        .map((r) => insert.bind(r.pool_id, r.ts, r.apy, r.tvl_usd));
      await env.DB.batch(batch);
    }

    // Retention prune (range delete on ts).
    const retDays = Number(env.RETENTION_DAYS) || core.RETENTION_DAYS;
    const cutoff = core.retentionCutoff(ts, retDays);
    await env.DB.prepare('DELETE FROM pool_history WHERE ts < ?').bind(cutoff).run();

    console.log(`poller: wrote ${rows.length} rows @ ${ts}, pruned < ${cutoff}`);
  },

  async fetch(request, env) {
    // Bearer-guarded read for CI. No token configured → closed (503), never open.
    const expected = env.READ_TOKEN;
    if (!expected) return new Response('read token not configured', { status: 503 });
    if (request.headers.get('authorization') !== `Bearer ${expected}`) {
      return new Response('unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/history') return new Response('not found', { status: 404 });

    let days = parseInt(url.searchParams.get('days') || '30', 10);
    if (!Number.isFinite(days) || days < 1) days = 30;
    if (days > MAX_DAYS) days = MAX_DAYS;
    const since = Math.floor(Date.now() / 1000) - days * 86400;

    const { results } = await env.DB
      .prepare('SELECT pool_id, ts, apy, tvl_usd FROM pool_history WHERE ts >= ? ORDER BY ts ASC')
      .bind(since)
      .all();

    return new Response(JSON.stringify(results || []), {
      headers: { 'content-type': 'application/json' },
    });
  },
};
