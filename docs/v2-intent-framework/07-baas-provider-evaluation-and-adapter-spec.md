# BaaS Provider Evaluation & Adapter Specification (v2 Intent Architecture)

**Document Version:** `2.0.0-PROD`  
**Status:** Approved / Integration-Ready  
**Domain:** Card Program Alliances & Ecosystem Integrations  
**Target Chains:** Base, Arbitrum  

---

## 1. Executive Summary & Rain Post-Mortem

### 1.1 Why Rain Was Dropped
During commercial terms negotiation for the DeFi Garden pilot, Rain required an upfront setup fee of **$40,000 USD** plus restrictive minimum enterprise volume commitments. For an early-stage self-serve intent-resolved pilot, this represented an unacceptable toll that destroys unit economics and violates our self-custodial architectural ethos.

### 1.2 The v2 Paradigm Shift: Self-Custodial EVM Deposit Proxies
Instead of routing through centralized, gated fintech SaaS aggregators, DeFi Garden v2 pivots to **Zero-Upfront Developer-First Card Rails**:
1. **$0 Setup Overhead:** Zero capital barrier for deployment and user onboarding.
2. **On-Chain Deposit Proxies:** The user's virtual card balance is represented by or funded through a direct ERC-20 transfer on Base/Arbitrum.
3. **Sole-Proprietorship & EU Dev Coverage:** Full KYC/KYB compliance for individual developers, European freelancers (*Eenmanszaak*, *PFA*, *Auto-entrepreneur*), and global autonomous agent operators.

---

## 2. Comprehensive BaaS Provider Scoring Matrix

| Evaluation Dimension | **Fiat24** *(Top Architecture)* | **Kulipa** *(Top Ecosystem)* | **Holyheld** *(Fastest Consumer)* | **Bridge** *(Orchestration)* | **Rain** *(Dropped)* |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Upfront Setup Fee** | **$0** (Self-serve) | **$0** (Pilot rev-share tier) | **$0** (Self-serve) | **$0–$500** (Pay-as-you-go) | **$40,000** ❌ |
| **Integration Architecture** | **Direct EVM Smart Contract** (NFT account + ERC-20 token proxy) | **Base-native Non-Custodial** API + Smart Contract Rails | **Direct Deposit Contracts** on Base / Arbitrum / Optimism | REST API + Developer Webhooks | Opaque Web2 API + Custodial Ledger |
| **Licensing & Regulatory** | FINMA-regulated Swiss Fintech Bank | Licensed Mastercard EMI Partner | Licensed EU EMI Partner | FinCEN registered / EU VASP | FinCEN registered / US Partner Bank |
| **Base / L2 Compatibility** | Native Arbitrum / Base ERC-20 (`fUSD`, `fEUR`) | Native Base (Coinbase Ventures backed) | Native Base USDC / EURC | Base USDC settlement | Base USDC (via batch poller) |
| **EU / Sole-Prop Support** | ✅ 100% EU/EEA Individual, Freelancer & Sole-Prop | ✅ EU/EEA + Global Dev coverage | ✅ Full EU/EEA Individual & Micro-tier | ✅ US + EU corporate/individual | ⚠️ US focus / restrictive EU KYB |
| **Apple Pay / Google Pay** | ✅ Yes (Instant in-app push) | ✅ Yes (Instant push provisioning) | ✅ Yes (Mobile wallet push) | ✅ Yes | ✅ Yes |
| **Interchange Rev-Share** | 40–60 bps on transaction volume | Up to 70 bps based on volume tiers | 30–50 bps | Pass-through interchange | Negotiable |
| **Autonomous Agent Support** | ✅ Direct on-chain deposit address per account | ✅ Programmatic API key issuance | ✅ Programmatic top-up routing | ✅ Full programmatic sub-cards | ⚠️ Manual dashboard required |

---

## 3. Provider Architectural Profiles

### 3.1 Fiat24 (Primary Recommended Pilot Partner)
* **Mechanics:** Each cardholder mints an ERC-721 account NFT linked to an ERC-20 deposit proxy (`fUSD` / `fEUR`).
* **Yield Routing:** When DeFi Garden keeper sweeps realized yield from `YieldCardVault.sol`, it executes a simple `transfer(user_card_proxy, yield_amount)`.
* **Settlement:** The payment terminal at Visa/Mastercard settles directly against the user's `fUSD` token balance on-chain.
* **Advantage:** Zero intermediary custodial risk; verifiable $\Delta \text{Principal} \equiv 0$ on-chain invariant.

### 3.2 Kulipa (Ecosystem Grant & Co-Marketing Lead)
* **Mechanics:** Non-custodial crypto payment rails built specifically on Base, backed by Coinbase Ventures.
* **Yield Routing:** Connects directly to Base smart wallets and vaults, executing JIT (Just-In-Time) stablecoin debits upon card swipe.
* **Advantage:** Maximum synergy with Base Foundation ecosystem grants and Coinbase Developer Platform co-marketing.

### 3.3 Holyheld (Consumer & Individual Micro-Sub Tier)
* **Mechanics:** Direct deposit addresses per card on Base. Instant virtual card generation with lightweight progressive KYC.
* **Yield Routing:** Keeper deposits yield to the user's dedicated top-up contract.
* **Advantage:** Ideal for individual users funding single SaaS items (e.g., $20/mo Claude Pro).

---

## 4. Universal Card BaaS Interface Specification

To decouple DeFi Garden from any single provider, all integrations implement the unified `CardBaaSAdapter` specification:

```python
class CardBaaSAdapter(ABC):
    @abstractmethod
    def resolve_deposit_address(self, user_wallet: str, card_id: str) -> str:
        """Returns the on-chain deposit proxy address on Base."""
        pass

    @abstractmethod
    def get_card_status(self, card_id: str) -> dict:
        """Retrieves card state, available limit, and active status."""
        pass

    @abstractmethod
    def simulate_authorization(self, card_id: str, amount_usd: float, merchant_mcc: str) -> dict:
        """Simulates card spend authorization against solvency gates."""
        pass

    @abstractmethod
    def calculate_settlement(self, amount_usd: float, fee_tier: str) -> dict:
        """Calculates exact gross, fee, and net settlement numbers."""
        pass
```
