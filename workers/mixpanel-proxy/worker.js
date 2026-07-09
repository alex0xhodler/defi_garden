/**
 * First-party Mixpanel proxy for defi.garden — serves the Mixpanel JS library and
 * forwards ingestion calls (track/engage/groups) through mp.defi.garden instead of
 * Mixpanel's own domains. US-hosted project (per Alex, 2026-07-09) -> upstream is
 * api.mixpanel.com, NOT the -eu variant.
 *
 * Why: first-party requests are less likely to be stripped by ad/tracker blockers,
 * and keep all network calls on the same domain as the site.
 *
 * Route: mp.defi.garden/* (see wrangler.toml)
 */

const LIB_UPSTREAM = "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js";
const API_UPSTREAM = "https://api.mixpanel.com";

const API_PATHS = new Set(["/track", "/engage", "/groups", "/import", "/decide"]);

// Verified live 2026-07-09: the Mixpanel JS library's XHR transport sends
// withCredentials=true (cookie-based persistence), and browsers reject a
// wildcard Access-Control-Allow-Origin whenever credentials mode is
// 'include' — it must be the exact reflected origin, paired with
// Access-Control-Allow-Credentials: true. A bare "*" silently fails in the
// browser with no server-visible error (only caught via a real Playwright
// browser test, not curl — curl doesn't enforce CORS at all).
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

function corsPreflight(request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // The library also requests paths WITH a trailing slash (e.g. "/track/"),
    // not the bare "/track" used by the classic image-beacon GET — normalize
    // before matching, or every real client request 404s.
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return corsPreflight(request);
    }

    if (normalizedPath === "/lib.min.js") {
      const upstream = await fetch(LIB_UPSTREAM, { cf: { cacheTtl: 3600, cacheEverything: true } });
      const headers = new Headers(upstream.headers);
      headers.set("Cache-Control", "public, max-age=3600");
      for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v);
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    if (API_PATHS.has(normalizedPath)) {
      const upstreamUrl = new URL(normalizedPath + url.search, API_UPSTREAM);
      const upstreamRequest = new Request(upstreamUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.clone().arrayBuffer(),
      });
      const upstream = await fetch(upstreamRequest);
      const headers = new Headers(upstream.headers);
      for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v);
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    return new Response("not found", { status: 404, headers: corsHeaders(request) });
  },
};
