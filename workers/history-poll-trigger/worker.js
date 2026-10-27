/**
 * Cron trigger for the v2 history poll. GitHub drops or delays ~45% of scheduled
 * workflow runs, so this Worker fires on Cloudflare's reliable Cron Trigger (minute 5 of every
 * third hour, i.e. 5 minutes into each 3-hour UTC slot) and starts .github/workflows/history-poll.yml
 * through GitHub's workflow_dispatch API. The workflow's own `schedule` stays as a
 * fallback and skips itself when the slot already has rows.
 *
 * The Worker does exactly one fetch: the free plan allows 10 ms CPU per invocation.
 * A non-204 answer (or a missing token) throws, so the run shows as failed in
 * Cloudflare observability. No public HTTP surface (workers_dev = false).
 *
 * HUMAN provisioning (one-time, from this folder; nothing here deploys itself):
 *   1. npx wrangler deploy
 *   2. npx wrangler secret put GITHUB_DISPATCH_TOKEN
 *      -> fine-grained PAT, repository access ONLY alex0xhodler/defi_garden,
 *         permission "Actions: Read and write" (nothing else).
 */

const DISPATCH_URL =
  "https://api.github.com/repos/alex0xhodler/defi_garden/actions/workflows/history-poll.yml/dispatches";
const RETRY_DELAY_MS = 2000;

export function buildDispatchRequest(env) {
  return {
    url: DISPATCH_URL,
    init: {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "defi-garden-history-poll-trigger",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    },
  };
}

// One retry after ~2s, only for network errors and 5xx. Anything else (401, 403,
// 404, 422...) is a config problem a retry cannot fix. Never include the token
// in an error message.
export async function dispatch(env, fetchImpl = fetch, { delayMs = RETRY_DELAY_MS } = {}) {
  if (!env || !env.GITHUB_DISPATCH_TOKEN) {
    throw new Error("history-poll-trigger: GITHUB_DISPATCH_TOKEN secret is not set");
  }
  const { url, init } = buildDispatchRequest(env);
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (err) {
      lastErr = new Error(`history-poll-trigger: network error: ${err && err.message}`);
    }
    if (res) {
      if (res.status === 204 || res.status === 200) return res.status;
      const body = (await res.text().catch(() => "")).slice(0, 300);
      lastErr = new Error(`history-poll-trigger: GitHub dispatch failed, status ${res.status}: ${body}`);
      if (res.status < 500) throw lastErr;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, delayMs));
  }
  throw lastErr;
}

export default {
  async scheduled(event, env, ctx) {
    await dispatch(env);
  },

  // Defensive: no HTTP surface is intended.
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
