# Auth.md - Agent Authentication on DeFi Garden

Welcome, AI Agent! DeFi Garden supports automated registration and authentication for autonomous AI agents.

## Discovery Endpoints
- **OAuth 2.0 Authorization Server Metadata:** https://www.defi.garden/.well-known/oauth-authorization-server
- **OAuth Protected Resource Metadata:** https://www.defi.garden/.well-known/oauth-protected-resource

## Authentication Flows

We support two distinct flows for agents to authenticate:

### 1. Anonymous Registration Flow
Ideal for read-only crawlers or agents performing basic searches on behalf of users.
- Register to obtain an API key by making a POST request to:
  https://www.defi.garden/api/agent/identity
- Exchange the registration for a claim:
  https://www.defi.garden/api/agent/identity/claim

### 2. Identity Assertion Flow (ID-JAG)
For personalized, user-delegated sessions where the agent acts under a user-verifiable cryptographic identity.
- We support the standard **ID-JAG** (IDentification by JSON Web Token with Agent Guarantees) assertion format.
- Present your ID-JAG token to:
  https://www.defi.garden/api/agent/identity
- Revoke credentials using the revocation endpoint:
  https://www.defi.garden/api/oauth2/revoke

### 3. Base x402 Micro-Payment Protocol & Free Agent Access
For high-frequency machine-to-machine calls, DeFi Garden supports standard x402 headers on Base network.
- **Pricing Policy:** 100% free agent access with zero fees ($0 USDC) across all endpoints and tools.
- **Free Endpoints:** /api/pools, /api/pools/:id, /api/health, /api/forever-number, /api/pricing, and MCP tools (find_pools, get_pool, forever_number, explain_rails).
- **Payment Headers (Optional):** Agents may supply standard X-PAYMENT headers or Web Bot Auth key signatures for telemetry and verified agent identification.
- **Discovery Metadata:**
  - ACP Manifest: https://www.defi.garden/.well-known/acp.json
  - MCP Server: https://www.defi.garden/mcp and https://www.defi.garden/api/mcp
  - Pricing Document: https://www.defi.garden/api/pricing
  - OpenAPI Specification: https://www.defi.garden/openapi.json

For human developers, see our repository and documentation at https://github.com/alex0xhodler/defi_garden.
