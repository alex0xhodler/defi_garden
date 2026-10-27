# DeFi Garden Terminal: product and technical spec

Status: P0 spec + P1 code (2026-10-27). Owner decisions of 2026-10-27 are taken as given; everything marked **proposal, owner to confirm** is not decided.
Public repo: this document contains no pillar numbers, weights, cutoffs or model names, by design (CLAUDE.md "what, not how").

## 1. Product

### 1.1 Personas

| Persona | Job to be done | Surface |
|---|---|---|
| AI agents | Pull history and ground a decision programmatically; pay per call without an account | x402 on `/api/v1/*`, MCP |
| Allocators | See how a pool's score, band and forecast moved before sizing a position; check the pool's own forecast track record | Terminal UI, API key |
| Treasuries | Get told when a held pool changes band or its forecast range shifts; export for reporting | Alerts, CSV |
| Funds | Bulk data into their own models, higher limits | Bulk API, CSV |
| Informed retail | Compare a pool today with its past; occasionally one alert | Free site + (later) a lower tier |

### 1.2 Free vs paid

Free forever (public site, public API, MCP): total DeFi Score, rating band, pillar TIERS (High / Medium / Low), the 14-day forecast range (low / central / high), every public page, the public forecast ledger (`data/forecasts/`, already public in git).

Paid:
- (a) History per pool: daily score, band and tiers; published forecast p10/p50/p90 history; the pool's own track record (published forecast vs realized rate).
- (b) Alerts: band change, forecast range change, rate change past a threshold; email, Telegram, webhook.
- (c) Bulk API and CSV export, higher rate limits.

Never offered, even paid: exact pillar numbers, weights, cutoffs, model names or inputs. Paid responses use the same tier vocabulary as the free surface.

### 1.3 Pricing

- Team plan: **$499 per month** via Stripe subscription (owner decision). Includes (a), (b), (c), N seats (proposal, owner to confirm: 5 seats, 3 API keys per seat).
- x402 pay-per-call (USDC on Base): **proposal, owner to confirm**
  - `GET /api/v1/history` (one pool, up to 365 days): **$0.01 per call** (`10000` atomic USDC at 6 decimals; constant `X402_PRICE_USDC_ATOMIC` in `api/_terminal-history.js`).
  - Bulk/CSV (P5, one export of the latest day for the whole universe): **$0.25 per export** (proposal).
  - Rationale: the existing computed-KPI route is priced at the $0.001 placeholder. History is rows an agent would otherwise assemble from the public ledger itself, so the price must be a convenience price, not a toll: $0.01 buys 365 days for one pool, an agent doing 100 lookups spends $1. The break-even against the team plan is about 50,000 calls per month, so heavy users are pushed to the subscription and agents stay account-free. Cheap enough not to deter an autonomous agent, high enough to cover Vercel + D1 costs by two orders of magnitude and to make scraping unattractive.
- The legal entity is Idel Labs (NL).

## 2. Architecture

```
GitHub Actions (daily)               Vercel (www.defi.garden)                Cloudflare
 build snapshot + scores   -------->  static site (public)
 record-daily-forecast  -> git ledger  api/v1/history.js  --REST-->  D1 terminal-scores (paid history)
 record-daily-scores    ------------------------------------wrangler->  D1 terminal-scores
                                       api/v1/* (auth, x402)  --REST-->  D1 terminal-state (users, keys, subs, alerts)
 evaluate-alerts (P4)   --reads D1--> sends email / Telegram / webhook
```

### 2.1 Vercel function reaching D1: REST, not bindings

D1 bindings exist only inside Cloudflare Workers. A Vercel function can use the **Cloudflare REST API** (`POST /accounts/{id}/d1/database/{db}/query`, parameterised SQL, bearer token). That is what P1 implements for score history (`scoreHistory()` in `api/_terminal-history.js`). Costs: one extra HTTPS hop (tens of ms), a token with D1 scope in Vercel env. The alternative (move the API into the existing Cloudflare Worker, which has bindings) was rejected for now because the x402 gate and the public API already run there but the Terminal needs Vercel for the UI, cron-free request handling and one deploy surface; revisit if REST latency or rate limits bite.

Two separate D1 databases (owner decision: state is separate from pool history):
- `terminal-state`: users, API keys (hashed), subscriptions, alerts, delivery log. Small, write-light.
- `terminal-scores`: `score_daily` (paid score history). Separate from the pool-history DB and from state so a bulk write cannot starve auth.

D1 free-plan limits are per account (500 MB per DB, 5M reads and 100k writes per day across all DBs). Budget: the pool-history plan already targets about 50k writes/day, so Terminal gets at most about 15k writes/day: `score_daily` about 3k to 7k rows/day (one row per railed scored pool), state under 1k.

### 2.2 Data sources for history: what exists, what is missing

| Source | What it holds | Public? | Use for the Terminal |
|---|---|---|---|
| `data/forecasts/YYYY-MM-DD.json` (git, written by `scripts/record-daily-forecast.js`) | Per day, per non-LP pool: `[p10, p50, p90, apy_at_issue, tvl, stable]`; write-once; 46 days now (since 2026-09-12), about 180 KB per day | Yes (git + served under `/data/`) | Forecast history. P1 reads it. |
| `data/history/YYYY-MM-DD.json` (git, 30-day tree) | Per day, per pool: `[apy, tvl]` | Yes | Realized rate for the track record (day + 14). P1 reads it. 30 days only. |
| git history of `data/history`, 283 `pools-snapshot.json` versions | Older samples | Yes | One-off backfill input (history-v2 plan); must be extracted before the planned history rewrite |
| D1 `pool_history` / v2 `samples` (Cloudflare) | Hourly then 3-hourly APY and TVL samples | No | Realized-rate series at finer grain (later); not needed for P1 |
| R2 `defi-garden-history-archive` | Keep-forever daily + raw archive | No | Long-term source for realized rates and KPI history; status: bucket needs the owner to enable R2 first |
| `compute-kpis.js` KPI history | Pool KPIs (momentum, track record, etc.) | Partly | Candidate extra paid series (P5); not in P1 |
| Score / band / tiers per day | **Nothing.** `data/pool-scores.json` is overwritten daily and gitignored; the snapshot is replaced every build | n/a | **Must be added** (2.3) |

**Decision for forecast history (P1):** read the committed ledger directly from the function. It is already public, so serving it is a convenience plus the paid wrapper (authenticated, ranged, joined with realized outcomes), not a leak. Bundling is done with `vercel.json` `functions["api/v1/history.js"].includeFiles = "data/{forecasts,history}/*.json"`; the function lists the directory and parses only the day files in range, with a string prefilter on the pool id so a 365-day request parses only files that mention the pool. Rejected options: a CI-built compact per-pool file (an extra generated artifact, and a static file would be public anyway), fetching the published site (extra network hop, same data). Growth: about 65 MB a year of ledger; the Vercel function limit is 250 MB unzipped, so around 2027-Q3 switch to monthly compacted per-pool files bundled the same way (or D1) as a mechanical follow-up. The ledger only covers non-LP lending/vault/staking pools clearing the trust rails; pools outside it return empty rows.

### 2.3 New data: the daily score record (design)

**Why not git or a static file:** the repo is public and everything deployed statically is publicly fetchable, so paid data must live only behind the function. Therefore D1 (and R2 as the archive).

- Table (in `terminal-scores`), created by `scripts/record-daily-scores.js` output:
  `score_daily(pool_id TEXT, day TEXT, score REAL, band TEXT, tiers TEXT, PRIMARY KEY (pool_id, day)) WITHOUT ROWID`.
  `tiers` is 4 letters H/M/L in fixed pillar order (stability, sustainability, stickiness, liquidity), never numbers. About 60 bytes per row; at about 7k rows/day that is about 150 MB a year, so the 500 MB DB lasts about 3 years. Population: scored pools passing the public trust rails (TVL at least the floor, rate at or below the sanity limit), same rails as the forecast ledger.
- Writer: daily CI step after the scoring step: `node scripts/record-daily-scores.js --out "$RUNNER_TEMP/score-daily.sql"` then `wrangler d1 execute terminal-scores --remote --file ...` (idempotent upsert by primary key). The output path has no default inside the repo on purpose.
- Retention: D1 keeps 400 days hot (enough for the 365-day API window). Monthly, a job exports closed months to R2 `scores/daily/YYYY-MM.ndjson.gz` (kept forever, never rewritten), then deletes from D1 rows older than 400 days. Retention for a deleted user's data is unaffected (the score record has no personal data).
- Backfill: not possible for scores before 2026-10-28 (the numbers were never stored). The ledger gives forecast history back to 2026-09-12. Be honest in the UI: score history starts on the day recording starts.
- Reader: `scoreHistory()` in the function; until the three env vars below are set it returns `available: false, unavailable_reason: "not_yet_collected"`.

### 2.4 `GET /api/v1/history` (P1, implemented)

`GET /api/v1/history?pool=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD` (defaults: `to` today UTC, `from` = `to` minus 30 days; range at most 365 days; unknown or repeated parameters rejected).

- Flag: `TERMINAL_HISTORY_ENABLED` must be `1` or `true`, otherwise **404** for every method, so nothing is exposed until the owner turns it on.
- Auth order: `Authorization: Bearer <key>` checked as sha256 against the comma-separated allowlist env `TERMINAL_API_KEYS_SHA256` (constant-time compare); a bad key is a 401 and never falls through to payment. Else `X-PAYMENT` verified by the existing gate `edge/x402-core.js` (`readConfig`, `buildChallenge`, `verifyPayment`) when `X402_ENABLED` is on, answering **402** with the x402 challenge at the Terminal price; else **401** with a JSON `how_to_get_access` body. Validation happens after auth.
- Response `defi-garden.terminal.history.v1`: `forecast_history.rows[]` (`date, p10, p50, p90, apy_at_issue, tvl_usd, stable, realized_apy, realized_on, in_range`), `score_history {available, unavailable_reason, rows[] (date, score, band, tiers{4 names -> High|Medium|Low})}`. `in_range` is the pool's own track record row: realized rate 14 days after issue (same basis as the public evaluation) against the published range; null until the outcome exists.
- Headers: `Cache-Control: private, no-store`, `Vary: Authorization, X-PAYMENT`, `X-Robots-Tag: noindex`; the same no-store rule is set for `/api/v1/(.*)` in `vercel.json`.
- Deploy detail: `.vercelignore` used to exclude all of `edge/`. The function must `require` the existing x402 gate, so only `edge/api-core.js` and `edge/x402-core.js` now ship; every other `edge/` file is excluded one by one (no `!` negations). Both are already public source in this repo. `test_terminal_history_api.js` pins this.

### 2.5 Auth

- **API keys:** random 32-byte keys (`dgt_` prefix + base32), shown once, stored as sha256 in D1 `api_keys(id, user_id, key_sha256, label, created_at, last_used_at, revoked_at)`. P1 uses the env allowlist as a bridge; P2 moves to D1 (the check is the same `keyIsValid`).
- **SIWE (wallet sign-in, first):** `GET /api/auth/nonce` (random nonce, 5 min TTL in D1), `POST /api/auth/siwe` verifies the EIP-4361 message and signature (EOA via ecrecover; smart wallets via EIP-1271 later), issues a session. Session = random opaque token, httpOnly Secure SameSite=Lax cookie, sha256 stored in D1, 14-day sliding expiry. No JWTs, no third-party auth SDK.
- **Email magic link (later, behind an interface):** `EmailSender { send({to, subject, text}) }`; one-time token (sha256 stored, 15 min TTL, single use). Provider undecided (Resend, Postmark, SES are all fine; EU region preferred). Not needed until the owner picks one.
- Identity model: `users(id, email NULL, wallet NULL, created_at)`, a user may have both. Subscriptions attach to an org (`orgs`, `org_members`) so a team plan covers seats.

### 2.6 Stripe flow (test-mode placeholders)

1. Terminal UI "Subscribe" calls `POST /api/billing/checkout` (session required) which creates a Stripe Checkout Session (mode `subscription`, price id from env `STRIPE_PRICE_TEAM_MONTHLY`, `client_reference_id` = org id, `success_url`, `cancel_url`).
2. Stripe calls `POST /api/billing/webhook`. The handler reads the **raw body**, verifies the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET` (HMAC, 5-minute tolerance), rejects otherwise, and is idempotent on `event.id` (D1 table `stripe_events`).
3. Events handled: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed|paid`. They upsert D1 `subscriptions(org_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, plan)`.
4. Entitlement = `status in (active, trialing)` or within a 3-day grace after `past_due`. API keys and alerts check it at request time (cached 60 s).
5. Billing portal: `POST /api/billing/portal` returns a Stripe customer-portal URL (cancel, invoices, card).
6. No card data ever touches our servers (hosted Checkout only). Test-mode keys first, live keys swapped by the owner. Tax: Stripe Tax for EU VAT (owner to decide).

### 2.7 x402 flow

Reuse the gate, do not fork it. The function builds the challenge with `x402Core.buildChallenge({routeId: '/api/v1/history', ...})`, overrides price and description, and verifies with `x402Core.verifyPayment`. `X402_ENABLED`, `X402_MODE` (default `test`), `X402_NETWORK`, `X402_ASSET`, `X402_PAY_TO`, `X402_FACILITATOR_URL` are the existing env vars. Pricing stays dark until the owner enables it. Follow-up (P2): add `/api/v1/history` to `PRICE_SCHEDULE` and `/api/pricing` so agents can discover it (this touches the generated pricing docs and the `test_x402_*` population tests, hence not done in P1).

### 2.8 Alerts

- **Evaluation:** a daily CI job (`evaluate-alerts`) right after the score recording step, not a Worker cron. Reasons: the data is produced in CI, CI has no free-plan CPU limit, the daily cadence matches the data cadence, and failures are visible in the Actions log. If hourly rate alerts are wanted later, move only that evaluator to a Worker cron on the 3-hourly samples.
- **Rules (D1 `alerts`):** `{org_id, pool_id, kind: band_change | forecast_shift | rate_change, threshold, channel, target, last_fired_at, last_state}`. Fire on state change only (edge-triggered) with a 24 h cooldown; one digest per org per day by default.
- **Channels:** email (via the `EmailSender` interface), Telegram (existing bot infrastructure in `telegram-bot/`; user links by `/start <code>`), webhook (HMAC-SHA256 signature header over the body with a per-endpoint secret, 3 retries with backoff, https only, no private IP ranges).
- Content: band names, tiers, forecast range and rate only. Alerts never carry pillar numbers.

### 2.9 Rate limits (placeholder in P1)

Not enforced in P1; `RATE_LIMIT_PLACEHOLDER` in the function marks the hook. Plan: P2 per API key 60 requests/minute and 10,000/day on the team plan via D1 counters (or Vercel WAF rate-limit rules keyed on the `Authorization` header hash); anonymous 402/401 responses are rate-limited per IP by Vercel Firewall. x402 payers are limited per payer address. Bulk endpoints have their own lower request limit and a row cap per export.

### 2.10 Privacy and GDPR (Idel Labs, NL)

- Controller: Idel Labs. Collect the minimum: email and/or wallet address, org name, Stripe customer id, API key hashes, alert targets (email, Telegram chat id, webhook URL). Billing identity stays at Stripe (processor).
- No tracking identifiers: the Terminal does not use the Mixpanel proxy; no third-party scripts on authenticated pages; no IP storage beyond Vercel's standard logs; request logs never contain the key, payment header or webhook secrets.
- Rights: export and delete endpoints (P3): deletion removes the user, keys, sessions, alerts and webhook secrets in D1 and requests Stripe customer deletion; invoices are kept for the legal retention period (7 years in NL fiscal law).
- A processor list and privacy-policy update are required before P2 goes live (owner/legal).
- Wallet addresses are public data but still personal data when linked to an account: treated as such.

### 2.11 Security

- No secret in client code; all secrets are Vercel env vars (server-side only). `NEXT_PUBLIC`-style exposure does not apply (no build step), and the client never receives a key except the one-time display of a newly created API key.
- Stripe webhook: signature check on the raw body, timestamp tolerance, idempotency. Never trust `success_url` redirects for entitlement.
- API keys: hashed at rest, constant-time compare, revocable, prefix visible for support, no key in query strings (header only).
- SIWE: nonce single-use with TTL, domain and chain id bound to `www.defi.garden`, message `expiration-time` enforced.
- D1 REST token: least privilege per DB (scores read-only token for the function; the CI writer uses a separate write token). Parameterised SQL only (the pool id is a bound parameter; see test).
- Paid data is never a public static file. Anything under the site tree is public: this is why the score record is D1 and why `record-daily-scores.js` refuses to pick a default output path.
- Webhook delivery: SSRF guard (https, no private ranges, no redirects, short timeout).
- Responses to authenticated routes are `private, no-store`.

## 3. Phased plan

| Phase | Scope | Exit criteria |
|---|---|---|
| P0 | This spec | Owner confirms proposals |
| P1 (this PR) | `GET /api/v1/history` behind a flag; env-allowlist keys; x402 via the existing gate; forecast history from the ledger; score-history reader and daily recorder script (not yet scheduled); tests | Flag off, nothing exposed |
| P2 | D1 `terminal-state`; SIWE; API keys UI (create, revoke, last used); D1-backed key check; rate limiting; add route to `PRICE_SCHEDULE`; schedule the daily score recording in CI | Owner can issue a key to a pilot user |
| P3 | Stripe test mode, then live: checkout, webhook, entitlement, portal; privacy pages; data export/delete | A test-mode subscription unlocks a key |
| P4 | Alerts: rules UI/API, daily evaluator, email/Telegram/webhook | Alert delivered end to end |
| P5 | Bulk API and CSV export, higher limits, R2 archive of scores, optional KPI history series | Export of the universe in under 10 s |

## 4. Owner to-do: accounts and secrets, per phase

I created none of these. Names are what the code expects.

**P1 (to switch the endpoint on with a manually issued key)**
- Vercel env: `TERMINAL_HISTORY_ENABLED=1`; `TERMINAL_API_KEYS_SHA256` = comma-separated sha256 hex of the keys you hand out (`printf '%s' "$KEY" | shasum -a 256`).
- Optional x402: `X402_ENABLED=true`, `X402_MODE` (leave `test` until ready), `X402_NETWORK`, `X402_ASSET`, `X402_PAY_TO` (a wallet you control), `X402_FACILITATOR_URL`.
- To get score history flowing (can wait until P2): Cloudflare D1 database `terminal-scores`; a D1 **read-only** API token for it; env in Vercel: `CLOUDFLARE_ACCOUNT_ID`, `TERMINAL_SCORES_D1_DATABASE_ID`, `TERMINAL_SCORES_D1_TOKEN`; a separate D1 **edit** token as a GitHub secret for the CI writer (the existing `CLOUDFLARE_API_TOKEN` can be reused if its scope includes this DB).

**P2**
- Cloudflare D1 database `terminal-state` (+ token for the function, scoped to it); Vercel env `TERMINAL_STATE_D1_DATABASE_ID`, `TERMINAL_STATE_D1_TOKEN`, `SESSION_SECRET` (random 32 bytes).
- WalletConnect/Reown project id only if a wallet-connect modal is wanted (injected wallets need none).
- Decision on the email provider (before magic link): account at Resend, Postmark or SES, a sending domain with SPF/DKIM/DMARC, API key as `EMAIL_API_KEY`.
- Legal: privacy policy and processor list (Idel Labs).

**P3**
- Stripe account (Idel Labs NL, business verification), Stripe Tax decision, a Product "DeFi Garden Terminal Team" with a $499/month price: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_WEBHOOK_SECRET` (test values first, then live), webhook endpoint `https://www.defi.garden/api/billing/webhook` configured in the Stripe dashboard, customer portal enabled.

**P4**
- Telegram: reuse or create a bot via BotFather: `TELEGRAM_BOT_TOKEN` (GitHub secret + Vercel env).
- Email provider from P2. GitHub secrets for the evaluator: D1 edit token, `EMAIL_API_KEY`, `TELEGRAM_BOT_TOKEN`.
- `WEBHOOK_SIGNING_KEY` master secret (random 32 bytes) if per-endpoint secrets are derived.

**P5**
- Cloudflare R2 enabled on the account (the history archive needs the same step) and a bucket `defi-garden-terminal-archive` (or reuse `defi-garden-history-archive` with a `scores/` prefix), R2 token for the monthly export job.
