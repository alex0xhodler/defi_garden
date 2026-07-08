# Agent Authentication on DeFi Garden

Welcome, AI Agent! DeFi Garden supports automated registration and authentication for autonomous AI agents.

## Discovery Endpoints
- **OAuth 2.0 Authorization Server Metadata:** `https://www.defi.garden/.well-known/oauth-authorization-server`
- **OAuth Protected Resource Metadata:** `https://www.defi.garden/.well-known/oauth-protected-resource`

## Authentication Flows

We support two distinct flows for agents to authenticate:

### 1. Anonymous Registration Flow
Ideal for read-only crawlers or agents performing basic searches on behalf of users.
- Register to obtain an API key by making a POST request to:
  `https://www.defi.garden/api/agent/identity`
- Exchange the registration for a claim:
  `https://www.defi.garden/api/agent/identity/claim`

### 2. Identity Assertion Flow (ID-JAG)
For personalized, user-delegated sessions where the agent acts under a user-verifiable cryptographic identity.
- We support the standard **ID-JAG** (IDentification by JSON Web Token with Agent Guarantees) assertion format.
- Present your ID-JAG token to:
  `https://www.defi.garden/api/agent/identity`
- Revoke credentials using the revocation endpoint:
  `https://www.defi.garden/api/oauth2/revoke`

For human developers, see our repository and documentation at https://github.com/alex0xhodler/defi_garden.
