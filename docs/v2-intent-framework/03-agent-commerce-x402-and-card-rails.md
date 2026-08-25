# Agent Commerce, x402 & Programmatic Card Rails

**Document Version:** `1.0.0-PROD`  
**Focus:** Autonomous Agent Wallets, Machine-to-Machine Micro-Billing, and Rain Card BaaS

---

## 1. The Autonomous Agent Problem Space

Autonomous AI agents (Hermes, Claude Code, Cursor, OpenClaw, Eliza) face a fundamental financial barrier:
* **The Web2 Trap:** Agents cannot hold traditional bank accounts or pass manual KYC credit checks to pay for Web2 compute, API keys, or cloud infrastructure (Anthropic, OpenAI, Cursor, AWS, Vercel).
* **The Web3 Isolation:** Agents can hold onchain crypto on Base/Ethereum, but 99% of developer tools and SaaS providers only accept 16-digit Visa/Mastercard credit cards.

**DeFi Garden v2 resolves this by providing onchain yield-funded Agent Virtual Visa Cards.**

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                AGENT COMMERCE INTEGRATION FLOW                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

        [ Onchain Treasury ($10k USDC on Base) ]
                           │
                           ▼
             [ YieldCardVault.sol (ERC-4626) ]
                           │
                 ┌─────────┴─────────┐
                 │ (Yield Harvests)  │
                 ▼                   ▼
    [ x402 Micropayments ]    [ Rain BaaS API ]
   (Machine-to-Machine APIs)  (Agent Virtual Visa Card)
                 │                   │
                 ▼                   ▼
   [ Pay per LLM Request ]   [ Pays Anthropic / AWS Invoices ]
```

---

## 2. Technical Mechanisms

### 2.1 Path 1: The Yield-Operated Agent Virtual Visa Card
1. An agent or developer deposits **$10,000 USDC** into `YieldCardVault.sol` on Base.
2. The vault interacts with the Rain Developer API (`use-dev.raincards.xyz`) to provision an **Agent Virtual Visa Card**.
3. Credentials (PAN, EXP, CVV) are encrypted using the agent's public key and delivered directly to its secure runtime environment.
4. The agent inputs the card into its **Anthropic Console / AWS Billing**.
5. Automated keeper contracts sweep monthly realized yield to settle the card balance in USD ($\Delta \text{Principal} \equiv 0$).

### 2.2 Path 2: Funding & Topping Up Cards via Coinbase x402
1. The agent provides autonomous services (scraping, data analysis, trading signals) monetized via **Coinbase x402 headers** on Base.
2. Incoming micropayments are automatically split:
   * **70%** auto-compounded into the DeFi Garden Yield Vault (growing principal).
   * **30%** swept into the Rain Card balance for real-world merchant spending.

### 2.3 Path 3: Programmatic Spending Policy Gates (Safety Rails)
Before any merchant authorization settles, the smart contract middleware checks:
* **MCC Whitelist:** Restricts transactions strictly to Software/Cloud (MCC 5734, 7372).
* **Spending Cap:** Enforces a maximum monthly spend ceiling tied directly to the 30-day realized yield.
* **Emergency Circuit Breaker:** Instantly freezes the virtual card if abnormal charge velocity is detected.

---

## 3. OpenAPI & MCP Integration Specification

### 3.1 Model Context Protocol (MCP) Tools for Agent Cards
DeFi Garden’s MCP server (`POST /api/mcp`) publishes dedicated tools for autonomous agent management:

```json
{
  "tools": [
    {
      "name": "provision_agent_card",
      "description": "Mint a yield-backed virtual Visa card for autonomous SaaS payments on Base.",
      "parameters": {
        "type": "object",
        "properties": {
          "monthly_budget_usd": { "type": "number", "description": "Target monthly spending cap." },
          "deposit_token": { "type": "string", "enum": ["USDC", "EURC"] },
          "merchant_whitelist": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["monthly_budget_usd", "deposit_token"]
      }
    },
    {
      "name": "get_card_settlement_status",
      "description": "Check current yield coverage, pending transactions, and escrow reserve health.",
      "parameters": {
        "type": "object",
        "properties": {
          "card_id": { "type": "string" }
        },
        "required": ["card_id"]
      }
    }
  ]
}
```
