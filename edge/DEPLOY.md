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
read. It is stated ONCE below — inside the runnable `wrangler d1 execute`
command, the copy you will actually copy and paste — wrapped in
`<!-- DAILY_READS_QUERY:begin -->` / `:end` HTML-comment markers (invisible
in rendered markdown and outside the fenced block, so the command itself is
untouched by them). `test_agent_log.js` locates that region STRUCTURALLY,
by the markers alone, never by matching the query's own text; asserts
exactly one such region exists in this file; and byte-compares its content
against `DAILY_READS_QUERY` in `edge/agent-log-core.js`. It also fails if
any OTHER line in this file, outside a marked region, looks like a second,
unmarked copy of this query (the two other `agent_reads` queries this
runbook legitimately contains — §5's verification `SELECT` and the
Territory-notes prune `DELETE` — are allowlisted by exact line text in the
test, not exempted by a fuzzy pattern). What this does NOT catch: a future
copy added outside the markers that also evades that allowlist check — the
markers are the contract, a documented convention, not a proof that no other
copy of this text could ever appear in this file.

Two earlier versions of this guard were weaker: the first tested only
whether the query text appeared *somewhere* in this file, which an
illustrative second copy satisfied while the runnable command silently
drifted (Verifier round 1). The fix for that scanned for every occurrence
using a signature built from the query's OWN prefix text — which meant a
drift landing inside that prefix (the bulk of the query) made the occurrence
stop matching the scan entirely, so it silently vanished from the count
instead of failing (Verifier round 2). Locating the copy by a
content-independent marker instead of by its own text closes that hole. See
`product-loop-kit/specs/224-notes.md` for both rounds.

Run it the same way item 110 reads `pool_history`:

<!-- DAILY_READS_QUERY:begin -->
```
wrangler d1 execute defi-garden-history --remote --command "SELECT
  date(ts, 'unixepoch') AS day,
  ua_family,
  COUNT(*) AS reads
FROM agent_reads
GROUP BY day, ua_family
ORDER BY day DESC, reads DESC;"
```
<!-- DAILY_READS_QUERY:end -->

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

## 7. Deploy delta — public read-only Yield API (backlog 227, spec 227)

**Same Worker, same command, no new binding.** Item 227 added `edge/api-core.js`
(pure routing/railing logic) and taught THIS file's `edge/agent-log.mjs` to
dispatch `/api` and `/api/*` to it, before the pass-through path — see
`edge/API.md` for the full endpoint contract and `edge/agent-log.mjs`'s own
header comment for how the dispatch is wired. None of steps 1-6 above
change:

- No new D1 table, no new `d1_databases` binding — the API reads pool data
  live from `https://yields.llama.fi/pools` (edge-cached), never from D1.
  `edge/schema.sql` is unchanged.
- No new `wrangler.toml` entry, no new route, no new binding — `main` is
  still `agent-log.mjs`; the same `www.defi.garden/*` route now also serves
  `/api/*` because the Worker itself branches on path, not because Wrangler
  config changed.
- Deploy command is **unchanged**: `wrangler deploy -c edge/wrangler.toml`.
  Re-running it (after this diff is on the branch that gets deployed) is
  the entire "provisioning" step for this item — there is no step 1/2/4
  analog to repeat.

### Verify `/api/health` after deploy

```
curl -sS "https://www.defi.garden/api/health"
```

Expect `200` with a JSON body shaped like:

```json
{"ok":true,"version":"0.1.0","poolsAvailable":<some positive number>,"generatedAt":"<ISO timestamp near now>","rails":{"apySanityLimit":1000,"minTvl":100000, "...":"..."}}
```

Also confirm CORS + caching headers landed:

```
curl -sS -D - -o /dev/null "https://www.defi.garden/api/health" | grep -iE "access-control-allow-origin|cache-control|x-defi-garden-api-version"
```

Expect `access-control-allow-origin: *`, `cache-control: public, max-age=300`,
`x-defi-garden-api-version: 0.1.0`.

And the OPTIONS preflight:

```
curl -sS -X OPTIONS -o /dev/null -w "%{http_code}\n" "https://www.defi.garden/api/pools"
```

Expect `204`.

Finally, confirm the **sacred pass-through** still holds for a normal
analytics URL — this is the highest-risk part of this item (spec 227's Risk
tier: HIGH, because the diff touches the Worker in front of every request):

```
curl -sS "https://www.defi.garden/?token=USDC" | head -5
```

Should look byte-identical to a request with no Worker in front of it,
exactly as step 5 above already verifies for `/llms.txt`. If this ever
looks different post-227-deploy, treat it as a rollback trigger (same two
rollback options as above — grey-cloud the DNS record, or
`wrangler delete -c edge/wrangler.toml` — both apply unchanged, since this
is still the same single Worker).

Confirm the daily-reads query (step 6 above) now also surfaces `/api`
traffic: after hitting `/api/health` a few times, `path_class = 'api'` rows
should appear in the same `agent_reads` table — no new query needed,
`classifyRequest()` already classified `/api/*` this way ahead of time (see
`edge/agent-log-core.js:82-84`, written for spec 224, consumed by 227).

## 8. Deploy delta — MCP server (backlog 228, spec 228)

**Same Worker, same command, no new binding, no new route** — item 228 adds
`edge/mcp-core.js` and a `/mcp` branch in `edge/agent-log.mjs` beside the
`/api` branch step 7 already covers; `wrangler deploy -c edge/wrangler.toml`
picks it up the same way. Full contract, quickstart, and post-deploy
verification: `edge/MCP.md`.

## 9. Deploy delta — x402 + Web Bot Auth (backlog 234, spec 234)

**Same Worker, same deploy command.** Item 234 added `edge/x402-core.js`
(payment logic) and `edge/web-bot-auth-core.js` (identity verification),
wired into THIS file's `edge/agent-log.mjs` alongside the existing `/api`
and `/mcp` branches — no new route, no new binding, no new `wrangler.toml`
entry. `wrangler deploy -c edge/wrangler.toml` (unchanged) picks up this
diff the same way it already picks up 227's and 228's. Full contract:
`edge/X402.md`.

**Code ships DARK.** `X402_ENABLED` defaults to unset/false — every route
stays free until a human flips it (see the HUMAN-OWNED list below). This
deploy delta is safe to run at any time; it does not, by itself, start
charging anyone for anything.

**Exact byte-identity scope — response BODIES, dark-mode, checked directly
against `origin/main` (verifier round 1, backlog 234):** `GET /api/health`,
`GET /api/pools` (bare and with `?token=…`), `GET /api/pools/:id`,
`GET /api/forever-number`, all three `/mcp` shapes (`initialize`,
`tools/list`, `tools/call`), and the pass-through path (`Response` body
object-identical, not merely byte-identical) are unchanged by this diff.
Three surfaces are deliberately NOT body-identical: `GET /api` (gained a
`pricing` block plus a 6th `endpoints` entry), the unknown-route `404` (its
`endpoints` list grew to match), and `GET /api/pricing` (`404` → `200`,
since the route itself is new). None of those three differences changes
what data is served or charges anyone anything — they only describe
pricing, which stays fully DISABLED until a human flips `X402_ENABLED`. A
fourth difference sits outside this body-identity scope and applies to
EVERY `/api/*` and `/mcp` response regardless of route, not just the three
surfaces above: `Access-Control-Allow-Headers` now includes `X-PAYMENT`
(was `Content-Type` alone) and a new
`Access-Control-Expose-Headers: X-PAYMENT-RESPONSE` header is sent —
deliberate, documented at `edge/API.md`'s CORS section (`:69-72`), and
orthogonal to the body-identity claim above (it changes response headers
only, never which data is served or to whom).

### 9a. Migrate the D1 table (do this BEFORE deploying the new Worker code)

`agent_reads` (item 224) gains three new nullable columns
(`agent_identity`, `identity_status`, `payment_status` — see
`edge/schema.sql`'s own migration comment for the exact column
descriptions). Run this against the SAME `defi-garden-history` database
steps 1-2 above already provisioned:

```
wrangler d1 execute defi-garden-history --remote \
  --command "ALTER TABLE agent_reads ADD COLUMN agent_identity TEXT;"
wrangler d1 execute defi-garden-history --remote \
  --command "ALTER TABLE agent_reads ADD COLUMN identity_status TEXT;"
wrangler d1 execute defi-garden-history --remote \
  --command "ALTER TABLE agent_reads ADD COLUMN payment_status TEXT;"
```

(Equivalently: `wrangler d1 execute defi-garden-history --file=edge/schema.sql --remote`
re-runs the whole file — safe, since `CREATE TABLE IF NOT EXISTS` is a
no-op against the already-existing table, but IT WILL ERROR on a second
run of the three `ALTER TABLE` lines once they've already been applied
once; that error is expected and harmless, not a sign anything is broken.)

**Order matters, but not as much as you'd think.** `edge/agent-log.mjs`'s
`insertRow()` attempts the extended (12-column) `INSERT` first and falls
back to the original 9-column statement on failure — see Territory note 4
below. So deploying the NEW Worker code before running this migration does
NOT break logging; it just means every row falls back to the legacy shape
(no identity/payment columns populated) until the migration runs. Running
the migration late is always safe to do; running the Worker code before the
migration is also safe, just less informative in the interim. The
recommended order above (migrate first) simply avoids that interim gap.

Confirm the columns landed:

```
wrangler d1 execute defi-garden-history --remote \
  --command "SELECT ts, path, path_class, agent_identity, identity_status, payment_status FROM agent_reads ORDER BY ts DESC LIMIT 5;"
```

### 9b. Env vars (all optional, all default to the DARK/off state)

None of these are set in `edge/wrangler.toml` today — they are documented
there as COMMENTS only (see that file). Add them as `[vars]` (non-secret)
or, if ever treated as sensitive, `wrangler secret put <NAME>`, per
Cloudflare's own Worker-secrets docs — this runbook does not prescribe
which, since none of them are configured yet.

| var | default when unset | meaning |
|---|---|---|
| `X402_ENABLED` | `false` (gate is DARK) | `"true"`/`"1"` turns the payment gate ON. **Flipping this is a HUMAN, money-admin action — see below.** |
| `X402_MODE` | `"test"` (never defaults to live) | `"test"` accepts a well-formed TEST-network payment but never settles; `"live"` verifies against a real facilitator (fail-closed on anything short of an explicit `isValid:true`) — but this Worker never calls the facilitator's `/settle` endpoint, in either mode, so no value ever moves on our side. See `edge/X402.md`'s "What this deliberately does NOT do" for the full residue note. |
| `X402_NETWORK` | `"base-sepolia"` | the network name a `402` challenge advertises when no override is set. |
| `X402_ASSET` | unset → `null` (no address invented) | the priced asset's contract address. A `402` honestly reports "not configured yet" until this is set. |
| `X402_PAY_TO` | unset → `null` (no address invented) | the wallet/handle a future settlement path would pay out to — this Worker itself never settles, in either mode (see `edge/X402.md`). Same honesty rule as `X402_ASSET`. |
| `X402_FACILITATOR_URL` | unset → live mode fails CLOSED | the x402 facilitator base URL `verifyPayment()` POSTs `<url>/verify` to in live mode. Live mode with no facilitator configured is always rejected, never silently trusted. |
| `WEB_BOT_AUTH_KEYS` | unset → `{}` (empty keyring) | JSON object, `keyid -> base64url-encoded raw 32-byte Ed25519 public key`. An empty/absent keyring means every signed request honestly resolves to `identity_status: 'unverified'` (unknown keyid), never a throw. |

### HUMAN-OWNED (BLOCKED-class — a loop never performs these; money/org-admin)

- **Claim the `cloudflare.pay` handle `alexxx`** (human-answered,
  NORTH_STAR 2026-08-05 — do this early, it's free and name-squattable,
  zero code dependency on anything in this repo).
- **Enable Monetization Gateway** on the Cloudflare account.
- **Wallet custody/payout configuration** — provisioning `X402_PAY_TO` /
  `X402_ASSET` with a REAL address and setting up where funds would go
  under a future settlement path (this Worker itself never settles, in
  either mode — see `edge/X402.md`'s "What this deliberately does NOT do").
- **Flip `X402_ENABLED` to `true`** (and, separately, `X402_MODE` to
  `"live"` once ready for real-facilitator verification) — the literal act
  of turning pricing on. **This Worker never settles, in either mode** —
  flipping `X402_MODE` to `"live"` makes `verifyPayment()` actually call
  the configured facilitator's `/verify` endpoint instead of accepting a
  structural test-network match, but no code path in `edge/` ever calls a
  facilitator's `/settle` endpoint; a real settlement path, if one is ever
  built, is a separate, future, human-owned decision (see `edge/X402.md`'s
  "What this deliberately does NOT do"). Per spec 234's Measurement
  section, this flip is also the clock-start for the item's own
  gate-decision window (60 days live before a zero-paid-demand outcome
  closes it as a learning).

None of the above are performed by this diff, this runbook, or any script
in this repo — no credential, account id, wallet address, or handle is
present anywhere in the 234 diff (grep-asserted; see
`product-loop-kit/specs/234-notes.md`).

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
