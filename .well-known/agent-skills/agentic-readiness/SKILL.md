---
name: agentic-readiness
description: "Configure, optimize, and verify websites and APIs for seamless discovery, consumption, and tool-invocation by AI agents."
version: 1.1.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [agentic-readiness, agent-seo, content-negotiation, mcp, webmcp, api-catalog, rfc-9727, oauth-agent-auth, dns-aid, mpp]
    related_skills: [web-design-prototyping, plan, systematic-debugging]
---

# Agentic Readiness & Agent-Friendly Web Design

This skill provides comprehensive instructions on how to design, engineer, and optimize websites so that autonomous AI agents (such as Claude Code, ChatGPT, Cursor, and custom agentic frameworks) can easily discover content, negotiate clean representations, authenticate, and invoke on-page or backend tools.

---

## Core Pillars of Agentic Readiness

### 1. Discoverability & Content Signals (robots.txt & Links)
Agents need to know what content is available and how they are permitted to consume it.
- **Content Signals:** Prepend or include Cloudflare-standard machine-readable content signals inside `robots.txt` under `User-agent: *` to specify your data policies:
  ```text
  Content-signal: search=yes, ai-train=no, use=reference
  ```
- **Link Response Headers:** Attach RFC 8288 link response headers on the root page `/` or in HTML `<head>` alternates to advertise your discovery endpoints:
  ```html
  <link rel="alternate" type="text/markdown" href="https://yourdomain.com/llms.txt" title="Markdown Sitemap">
  <link rel="alternate" type="application/linkset+json" href="https://yourdomain.com/.well-known/api-catalog" title="API Catalog">
  ```

### 2. Markdown Content Negotiation
Serving raw HTML with scripts, styles, and nested navigation is token-wasteful and degrades agent accuracy. Serve clean Markdown when agents request it.
- **Header Negotiation:** Listen for `Accept: text/markdown` or check for common AI User-Agents (e.g. `ClaudeBot`, `GPTBot`).
- **CDN Caching & Vary:** Always attach a `Vary: Accept` header to both HTML and Markdown responses on endpoints that perform negotiation. This prevents the CDN from poisoning browser clients with Markdown or vice versa.
- **Vercel Routing Pattern:**
  ```json
  "rewrites": [
    {
      "source": "/",
      "has": [{ "type": "header", "key": "Accept", "value": "(.*)text/markdown(.*)" }],
      "destination": "/llms.txt"
    }
  ]
  ```

### 3. API Catalog & OpenAPI (RFC 9727)
Standardize API discovery so agents can map your application boundaries without guessing paths.
- **API Catalog Endpoint:** Serve a Linkset JSON at `/.well-known/api-catalog` with Content-Type `application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"`:
  ```json
  {
    "linkset": [
      {
        "anchor": "https://yourdomain.com/api",
        "service-desc": [
          { "href": "https://yourdomain.com/openapi.json", "type": "application/openapi+json" }
        ]
      }
    ]
  }
  ```

### 4. Auth.md & Agentic Registration (WorkOS spec)
Provide clear entry points for agents to authenticate on behalf of users or obtain machine-to-machine tokens.
- **Location:** Serve `/auth.md` at the site root.
- **Walkthrough:** Outline supported grant types (e.g., ID-JAG, `service_auth`, `anonymous`) and token exchange URLs clearly.
- **Discovery Pairs:** Publish `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414) pointing to each other.

### 5. Live MCP Servers & Server Cards (SEP-1649)
Expose standard-compliant JSON-RPC interfaces so agents can dynamically invoke tools and query context.
- **Server Card:** Publish `/.well-known/mcp/server-card.json` (also mapped to `/.well-known/mcp.json` and `/.well-known/mcp/server-cards.json`) declaring capabilities and the transport URL.
- **Serverless Handler:** Build raw, dependency-free Node.js or Python serverless functions (e.g. `/mcp`) that parse standard JSON-RPC 2.0 requests:
  - `initialize` (return capabilities & serverInfo)
  - `tools/list` (list available schema-enforced tools)
  - `tools/call` (execute and return structured text/json outputs)

### 6. Browser-Native WebMCP Tools
Support the emerging browser-native standard that allows browser agents to interact with your frontend dynamically.
- **Implementation:** Inject a small script to polyfill `window.navigator.modelContext` and register tools using `provideContext()`:
  ```javascript
  window.navigator = window.navigator || {};
  if (!window.navigator.modelContext) {
    window.navigator.modelContext = {
      tools: [],
      provideContext: function(options) {
        if (options && options.tools) this.tools.push(...options.tools);
        return Promise.resolve();
      }
    };
  }
  navigator.modelContext.provideContext({
    tools: [{
      name: "get_studio_stats",
      description: "Get key stats...",
      inputSchema: { type: "object", properties: {} },
      execute: function() { return Promise.resolve({ success: true, stats: { ... } }); }
    }]
  });
  ```

### 7. Agentic Commerce (x402, MPP, UCP, ACP)
Operate as a machine-payable service. Expose protocols that allow autonomous agents to complete onchain or offchain payments natively.
- **x402 Protocol:** Gated routes should return a `402 Payment Required` status code accompanied by CAIP-2 compliant payment requirements in both the body and the `PAYMENT-REQUIRED` (Base64-encoded) + `WWW-Authenticate` headers:
  ```http
  HTTP/1.1 402 Payment Required
  PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6MiwidmFsaWRUbyI6...
  WWW-Authenticate: X402 requirements="eyJ4NDAyVmVyc2lvbiI6MiwidmFsaWRUbyI6..."
  ```
- **Machine Payment Protocol (MPP):** Publish `/openapi.json` carrying `x-payment-info` extensions on payable operations.
- **Universal Commerce Protocol (UCP):** Publish a commerce profile JSON document at `/.well-known/ucp` detailing services, capabilities, and checkout endpoints.
- **Agentic Commerce Protocol (ACP):** Publish `/.well-known/acp.json` declaring API base paths, supported currencies, locales, and service capabilities.

---

## SOTA Learnings & Critical Troubleshooting

### Pitfall 1: Vercel Static File Precedence Overrides '/' Rewrites
- **Symptom:** You configured a rewrite for `/` with `Accept: text/markdown` -> `/llms.txt`, but requests with `Accept: text/markdown` still receive the HTML content of `index.html`.
- **Root Cause:** Vercel's edge router prioritizes serving literal static files (like `index.html` or even `index.md`) matching the root name, bypassing the `rewrites` block completely.
- **Mitigation:** To enable content-negotiation on `/`, **no static index files of any format (HTML or Markdown) can exist in the deployment folder.** You must rename `index.html` to `home.html` (or similar) and rename `index.md` to `homepage-markdown.md` (or similar). Then, configure `vercel.json` to handle `/` purely through edge rewrites:
  ```json
  "rewrites": [
    {
      "source": "/",
      "has": [{ "type": "header", "key": "Accept", "value": "(.*)text/markdown(.*)" }],
      "destination": "/llms.txt"
    },
    {
      "source": "/",
      "destination": "/home"
    }
  ]
  ```

### Pitfall 2: Vercel Ignores Destination Headers on Rewrites
- **Symptom:** Vercel rewrites `/` to `/llms.txt` correctly, but the browser or agent receives the response with `Content-Type: text/plain` (the default mime-type of a `.txt` file) instead of `text/markdown`, even though you set `Content-Type: text/markdown` on `/llms.txt` in your headers block.
- **Root Cause:** Vercel does **not** evaluate header rules defined for the *destination* path of a rewrite when resolving the rewritten *source* path. Only headers matched on the *source* `/` are applied.
- **Mitigation:** Define **conditional headers using `has` blocks on the source path itself** inside `vercel.json`:
  ```json
  "headers": [
    {
      "source": "/",
      "has": [{ "type": "header", "key": "Accept", "value": "(.*)text/markdown(.*)" }],
      "headers": [
        { "key": "Content-Type", "value": "text/markdown; charset=utf-8" },
        { "key": "Vary", "value": "Accept" }
      ]
    }
  ]
  ```

### Pitfall 3: CDN Caching of Differentiated Responses
- **Symptom:** A browser visits `/` and gets cached HTML. An agent subsequently visits `/` with `Accept: text/markdown` but receives the cached HTML from the CDN instead of Markdown.
- **Mitigation:** Ensure every endpoint doing content negotiation explicitly sends:
  `Vary: Accept`
  This instructs the CDN to partition its cache keys based on the Accept header. Furthermore, specify strict `Cache-Control: public, max-age=0, must-revalidate` headers specifically for `/openapi.json`, `/`, and `/index` to force immediate edge revalidation.

### Pitfall 4: Markdown Parser Backtick Bug (trailing `%60` 404s)
- **Symptom:** The crawler or agent requests your well-known files but appends a trailing backtick `%60` to the URL (e.g. `/.well-known/oauth-protected-resource%60`), resulting in 404s.
- **Root Cause:** Buggy markdown parsers used by some agentic scanners or LLMs mistakenly capture trailing code block fences (backticks) as part of the URL when scanning raw text (e.g. parsing `` `https://domain.com/path` ``).
- **Mitigation:** Always write well-known URLs inside `auth.md` or other discovery files as clean, unfenced plain text or standard clickable markdown links without backticks.

### Pitfall 5: Subdomain Mismatches for OAuth Resource Audits
- **Symptom:** The server returns 200 OK for `/.well-known/oauth-protected-resource` but the audit tool reports "No OAuth Protected Resource Metadata found".
- **Root Cause:** Standard metadata specifications (RFC 9728 and RFC 8414) require that `resource` and `issuer` domains match the scanned host exactly, including the subdomains (e.g. `https://www.yourdomain.com` instead of the apex `https://yourdomain.com` if the scanner is run against `www.`).
- **Mitigation:** Ensure all self-referencing absolute URLs in your OAuth, OpenID Connect, and API Catalog configs are mapped explicitly to the correct subdomain (e.g., matching the `www.` subdomain if applicable).
- **Trailing Slashes:** Ensure the issuer URI in the `authorization_servers` array does NOT have a trailing slash (e.g. use `"https://www.yourdomain.com"` instead of `"https://www.yourdomain.com/"`), because RFC 8414 standard discovery appends `/.well-known/oauth-authorization-server`, and a double slash (`//`) triggers 404s on Vercel.

### Pitfall 6: Machine Payment Protocol (MPP) Schema Misalignment
- **Symptom:** Your `/openapi.json` is successfully discovered, but the validation engine reports "No operations with x-payment-info found" or MPP checks fail.
- **Root Cause:** The `mpp.dev` scanner parses the `x-payment-info` extension under the specific operation block according to the strict JSON Schema in Appendix C of the Payment Discovery draft (`draft-payment-discovery-00`). The schema enforces:
  1. **Strict Type for amount:** The `"amount"` field **MUST be a string of digits** (representing the smallest denomination, e.g. `"1000"`), **NOT an integer**!
  2. **No Custom Fields:** The schema has `"additionalProperties": false`, meaning custom keys like `"recipient"` or `"wallet"` are strictly disallowed in the OpenAPI document (the recipient address is resolved at runtime from the authoritative HTTP 402 challenge header instead).
- **Mitigation:** Structure your `x-payment-info` block using the single-offer shorthand (or multi-offer `"offers"` array) with strictly compliant schema types:
  ```json
  "x-payment-info": {
    "intent": "charge",
    "method": "tempo",
    "amount": "1000",
    "currency": "0x833589fCD6eDb351a47402d5823ca7F192534578",
    "description": "Initialize a checkout session using Tempo on Base"
  }
  ```

### Pitfall 7: auth.md Scan Fails due to Missing Metadata Fields
- **Symptom:** The `isitagentready.com` scanner or verification engines report: `auth.md exists but agent_auth metadata was not found` or fail the `authMd` check entirely.
- **Root Cause:** Scanner engines run strict field-validation schemas on the `agent_auth` block inside `.well-known/oauth-authorization-server` or `openid-configuration`. Specifically, they assert:
  1. **For `"anonymous"` flow:** It requires `"anonymous.credential_types_supported"` and `"claim_uri"` (NOT just the canonical spec `"claim_endpoint"`).
  2. **For `"identity_assertion"` flow:** It requires `"identity_assertion.credential_types_supported"`.
  3. **For Revocation Warnings:** Omitting `"revocation_uri"` inside the `agent_auth` block triggers warnings even if defined at the top-level.
- **Mitigation:** Publish both canonical and draft-compatible redundant fields (e.g. both `claim_uri` and `claim_endpoint`) inside your `agent_auth` metadata block to guarantee 100% compliance across all scanner implementations:
  ```json
  "agent_auth": {
    "skill": "https://yourdomain.com/auth.md",
    "register_uri": "https://yourdomain.com/api/agent/identity",
    "claim_uri": "https://yourdomain.com/api/agent/identity/claim",
    "claim_endpoint": "https://yourdomain.com/api/agent/identity/claim",
    "revocation_uri": "https://yourdomain.com/api/oauth2/revoke",
    "events_endpoint": "https://yourdomain.com/api/agent/event/notify",
    "identity_types_supported": ["anonymous", "identity_assertion"],
    "anonymous": {
      "credential_types_supported": ["api_key"]
    },
    "identity_assertion": {
      "assertion_types_supported": [
        "urn:ietf:params:oauth:token-type:id-jag",
        "verified_email"
      ],
      "credential_types_supported": ["access_token", "api_key"]
    }
  }
  ```

### Pitfall 9: DNS-AID (SVCB/HTTPS vs TXT & Line Break Corruptions)
- **Symptom:** Your sitemap or crawler parses DNS but reports "No DNS for AI Discovery (DNS-AID) SVCB or HTTPS records found at well-known entrypoints" even though you added a TXT record at `_index._agents`.
- **Root Cause:**
  1. The DNS-AID spec specifies that organizations publish ServiceMode **SVCB (type 64)** or **HTTPS (type 65)** records for discovering agents, NOT just a TXT record. 
  2. If you copy multi-line TXT records into some DNS providers (like Cloudflare), line breaks are translated to octal escape sequences (e.g. `\010` representing Backspace), corrupting the string when read.
- **Mitigation:**
  - Always publish an **HTTPS (type 65)** or **SVCB (type 64)** record on `_index._agents` alongside the TXT records.
  - Flatten all multi-value TXT strings into a single, flat, one-line entry with simple space separation to prevent DNS string corruption.

### Pitfall 10: AI Visibility / LLM Discovery Curation (No FAQ Page found)
- **Symptom:** The site is technically Level 5 agent-ready, but AI models (Perplexity, ChatGPT, Claude) report low visibility or "Not Found" on common comparative, reputational, or cost queries.
- **Root Cause:** AI models look for structured, high-signal Q&A blocks to answer direct questions without scraping messy visual elements or drawing false inferences.
- **Mitigation:** Publish a structured, visible FAQ section on your homepage, and back it with both:
  1. An on-page `FAQPage` JSON-LD schema block (which crawlers query or parse synchronously).
  2. A flat Markdown `# Frequently Asked Questions (FAQ)` sitemap section inside `/llms.txt`.
  See the complete schema layout in [references/ai-visibility-audit.md](references/ai-visibility-audit.md).

### Pitfall 11: Canonical URL Instability Trap
- **Symptom:** Scanner reports duplicate content penalty, unstable URL representation, or DNS-over-HTTPS trust issues.
- **Root Cause:** The `canonical` link in the HTML `<head>` uses the apex domain (e.g. `https://domain.com/`) while the site is hosted/scanned at the subdomain (e.g. `https://www.yourdomain.com/`), causing a trust loop.
- **Mitigation:** Align the `<link rel="canonical" href="https://www.yourdomain.com/">` and `og:url` elements to match the primary scanned host exactly.

### Pitfall 12: auth.md H1 Heading Validation Failure
- **Symptom:** The validation engine (e.g. `isitagentready.com`) reports: `auth.md exists but is missing the expected Auth.md heading` or fails the `authMd` check entirely.
- **Root Cause:** Some validation suites execute a strict regular expression match on the H1 heading (`#`) of the `/auth.md` file. If the heading does not literally contain the string `"auth.md"` (case-insensitive), it gets rejected even if the rest of the registration and discovery details are completely correct.
- **Mitigation:** Ensure your H1 heading explicitly contains the literal string `"auth.md"`. For example: `# Auth.md - Agent Registration and Authentication` or simply `# auth.md`.

### Pitfall 13: Strict CORS Blocks Browser Agents
- **Symptom:** WebMCP tools or other client-side agent endpoints fail to load or invoke on-page tools, or browser-native agents are blocked from retrieving configuration files.
- **Mitigation:** Ensure wildcard CORS headers are configured for all well-known discovery endpoints (e.g., `Access-Control-Allow-Origin: *` and associated methods/headers).

### Pitfall 14: Vercel 404s on Extensionless Dotfolder Endpoints
- **Symptom:** Your metadata configurations (such as `/.well-known/oauth-protected-resource`) return 404 on Vercel even when physically present on disk.
- **Root Cause:** Vercel's physical file scanner does not automatically serve static files that lack file extensions inside dotfolders like `.well-known`.
- **Mitigation:** Name the physical files on disk with a standard `.json` extension (e.g., `.well-known/oauth-protected-resource.json`) and configure Vercel edge rewrites in `vercel.json` to map the standard extensionless path directly to the `.json` physical file:
  ```json
  "rewrites": [
    {
      "source": "/.well-known/oauth-protected-resource",
      "destination": "/.well-known/oauth-protected-resource.json"
    }
  ]
  ```

### Pitfall 15: OAuth Protected Resource Schema Requirements (`bearer_methods_supported`)
- **Symptom:** Scanner returns `bearer_methods_supported must include "header"`, resulting in `auth.md exists but OAuth Protected Resource Metadata was not found`.
- **Root Cause:** Standard validation suites for RFC 9728 require the resource metadata document to explicitly declare which bearer token presentation methods are supported by the API.
- **Mitigation:** Ensure `/.well-known/oauth-protected-resource` contains `"bearer_methods_supported": ["header"]` as a required parameter. Complete compliant structure:
  ```json
  {
    "resource": "https://www.yourdomain.com/api",
    "authorization_servers": [
      "https://www.yourdomain.com"
    ],
    "scopes_supported": [
      "read",
      "write"
    ],
    "bearer_methods_supported": [
      "header"
    ]
  }
  ```

## Tooling & Verification

This skill comes with statically re-runnable scripts to validate and provision agent-ready configurations.

### 1. Active Verification Script
Performs 11 parallel validation checks against any target domain to audit agentic readiness.
- **Location:** `scripts/validate_readiness.py`
- **Execution:**
  ```bash
  python3 scripts/validate_readiness.py https://yourdomain.com
  ```

### 2. Cloudflare DNS-AID Provisioning Script
Automatically provisions all 12 standard-compliant DNS-AID (DNS for AI Discovery) HTTPS/SVCB and TXT records on Cloudflare for both the apex domain and the `www.` subdomain.
- **Location:** `scripts/provision_dns_aid.py`
- **Execution:**
  ```bash
  python3 scripts/provision_dns_aid.py yourdomain.com <cloudflare_api_token>
  ```

### Starter Templates & Support Files

This skill includes pre-configured, production-grade starter templates and support files to accelerate deployment:
- **DNS-AID Standard BIND/Zone File configuration:** `templates/dns-aid-zone.txt`
- **Vercel Routing & Overriding Headers:** `templates/vercel-agentic-readiness.json`
- **Compliant Agentic Registration Metadata:** `templates/oauth-authorization-server.json`
- **WebMCP Browser-Native Polyfill & Tool Registration:** `templates/webmcp-bootstrap.js`
- **AI Visibility / LLM Discovery Curation reference:** `references/ai-visibility-audit.md`
- **Cloudflare DNS-AID Provisioning Script:** `scripts/provision_dns_aid.py`
