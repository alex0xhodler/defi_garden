# Deploy runbook — edge agent-read telemetry (backlog 224, spec 224)

This Worker sits in front of `www.defi.garden` and write-behind-logs one row
per agent-surface request into the existing item-108 D1 database. **The
build loop cannot deploy this — it has no Cloudflare credentials.** This is
a human-executed runbook (same standing role as item 108's deploy). Nothing
below requires reading `edge/agent-log.mjs` or `edge/agent-log-core.js` —
follow the commands as written.

A failure anywhere in the logging path (missing binding, D1 outage, a
malformed request) **never affects serving** — `edge/agent-log.mjs` passes
every request through to origin first and swallows every logging failure
silently. The worst-case outcome of anything going wrong in this runbook is
"no new rows", never "the site is down".

## Prerequisites

- Cloudflare account access, already used for item 108 (the `defi-garden-history`
  D1 database + `defi-garden-poller` Worker already exist and are live).
- `www.defi.garden`'s DNS zone (`defi.garden`) is on this same Cloudflare
  account.
- `wrangler` CLI: `npm i -g wrangler && wrangler login` (skip if already done
  for item 108).

## 1. Add the new table to the EXISTING database

Do **not** run `wrangler d1 create` — `defi-garden-history` already exists.
This step only adds a new table (`agent_reads`) to it:

```
wrangler d1 execute defi-garden-history --file=edge/schema.sql --remote
```

Confirm the table exists:

```
wrangler d1 execute defi-garden-history --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
```

You should see both `pool_history` (item 108) and `agent_reads` (this item)
in the output.

## 2. Fill in the database ID

`edge/wrangler.toml` ships with a placeholder:

```
database_id = "REPLACE_WITH_EXISTING_defi-garden-history_ID"
```

Get the real id (it is the SAME id the root `wrangler.toml` already uses for
`defi-garden-poller` — this Worker reads/writes the same database, just a
different table):

```
wrangler d1 list
```

Edit `edge/wrangler.toml` and paste the id in place of the placeholder.

## 3. Deploy the Worker

```
wrangler deploy -c edge/wrangler.toml
```

This deploys a **second, independent** Worker (`defi-garden-agent-log`) —
distinct from `defi-garden-poller` (item 108). It does not touch or
redeploy the poller.

`wrangler deploy` will also attempt to bind the Worker to the route declared
in `edge/wrangler.toml` (`www.defi.garden/*`). That route only actually
intercepts traffic once the DNS record is proxied through Cloudflare — see
the next step.

## 4. Enable the Cloudflare proxy (orange cloud) on the DNS record

In the Cloudflare dashboard → DNS → the record for `www.defi.garden`:
switch it from **DNS only (grey cloud)** to **Proxied (orange cloud)**, if it
is not already. A Worker route only ever sees traffic that is proxied
through Cloudflare first — an un-proxied (grey-cloud) record bypasses this
Worker entirely and origin continues to serve directly, exactly as before
this item.

## 5. Verify it works

Send a request with a known AI-crawler User-Agent to an agent-surface path:

```
curl -sS -A "GPTBot/1.0" -o /dev/null -w "%{http_code}\n" \
  "https://www.defi.garden/llms.txt"
```

Confirm the site still serves normally (byte-parity — this must look
identical to a request with no Worker in front of it):

```
curl -sS "https://www.defi.garden/llms.txt" | head -5
```

Then query D1 for the row you just caused:

```
wrangler d1 execute defi-garden-history --remote \
  --command "SELECT ts, path, ua_family, path_class FROM agent_reads ORDER BY ts DESC LIMIT 5;"
```

You should see a row with `path = '/llms.txt'`, `ua_family = 'gptbot'`,
`path_class = 'llms'`, and a `ts` matching roughly now.

Also confirm a NON-agent-surface request produces **no** new row (e.g. fetch
`https://www.defi.garden/style.css` and re-run the same `SELECT` — the row
count should not have grown from that request).

## 6. Daily read: "reads by UA-family by day"

This is the exact query the heartbeat's §2 gains as its new "agent reads"
read. It is stated TWICE below — once on its own, once inside the runnable
`wrangler d1 execute` command — and BOTH copies are kept byte-identical to
`DAILY_READS_QUERY` in `edge/agent-log-core.js`. `test_agent_log.js` scans
this file for EVERY occurrence of the query and asserts each one
individually against the constant (and that at least one exists), so no
copy here — including the one you will actually copy and paste — can drift
from the code unnoticed. An earlier version of that check tested only
whether the query appeared *somewhere* in this file, which the illustrative
copy alone satisfied while the runnable command silently drifted; see
`product-loop-kit/specs/224-notes.md`, "Verifier round 1".

```sql
SELECT
  date(ts, 'unixepoch') AS day,
  ua_family,
  COUNT(*) AS reads
FROM agent_reads
GROUP BY day, ua_family
ORDER BY day DESC, reads DESC;
```

Run it the same way item 110 reads `pool_history`:

```
wrangler d1 execute defi-garden-history --remote --command "SELECT
  date(ts, 'unixepoch') AS day,
  ua_family,
  COUNT(*) AS reads
FROM agent_reads
GROUP BY day, ua_family
ORDER BY day DESC, reads DESC;"
```

## Rollback

Two independent options, either is instant and neither requires touching
origin (Vercel) at all:

- **Grey-cloud the DNS record** (fastest — reverses step 4): in the
  Cloudflare dashboard, switch `www.defi.garden`'s DNS record back to **DNS
  only**. Traffic stops passing through Cloudflare/this Worker entirely and
  goes straight to origin, exactly as it did before this item existed.
- **Delete the Worker**: `wrangler delete -c edge/wrangler.toml`. Removes the
  Worker and its route binding; the DNS record can stay proxied (Cloudflare
  serves origin directly with no Worker attached), or you can also
  grey-cloud it per the option above.

Neither rollback path touches `agent_reads` or `pool_history` — no data is
lost, and item 108's poller keeps running unaffected either way.

## Territory notes (things this runbook found, not anticipated by spec 224)

- No scheduled retention prune runs yet. `edge/agent-log-core.js` exports
  `RETENTION_DAYS` (30) and `retentionCutoff()` mirroring `src/poller-core.js`'s
  shape, but this Worker has no `scheduled()` handler / Cron Trigger to
  invoke them (spec 224's Change section only asks for `fetch()`
  pass-through + write-behind logging). Until a follow-up item adds pruning,
  `agent_reads` grows unbounded — for a first deploy this is fine (D1's free
  tier is generous and per-request-log volume is far lower than a hot
  consumer app's would be), but it should be revisited before this Worker
  has been live for months. A manual prune in the meantime:
  ```
  wrangler d1 execute defi-garden-history --remote \
    --command "DELETE FROM agent_reads WHERE ts < strftime('%s','now') - 30*86400;"
  ```
