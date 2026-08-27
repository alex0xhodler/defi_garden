# Gnosis Pay European Pilot Specification (v2 Intent Rails)

**Document Version:** `2.0.0-PROD`  
**Status:** Approved / Integration-Ready  
**Domain:** Strategic Alliances & European Card Program Pilot  
**Primary Chain:** Gnosis Chain (`Chain ID 100`)  
**Settlement Asset:** Monerium `EURe` (On-Chain Euro)  

---

## 1. Executive Context & Strategic Pivot

### 1.1 Why Gnosis Pay on Gnosis Chain
* **Zero Platform Tolls:** Gnosis Pay operates on open EVM rails without requiring upfront enterprise SaaS retainers ($0 setup fee vs. Rain's rejected $40k fee).
* **Native European Visa Debit:** Live across 30+ EEA countries and the UK, issuing physical and Apple Pay/Google Pay enabled Visa Debit cards linked directly to non-custodial **Gnosis Safe** smart accounts.
* **Direct Euro Matching (`EURe`):** European developers and retail savers pay everyday bills (Claude €20, Spotify €12, Netflix €18) in EUR. Routing via Monerium `EURe` eliminates FX slippage and currency conversion risk.

---

## 2. Technical Architecture & Non-Custodial Flow

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                      GNOSIS PAY EUROPEAN PILOT ARCHITECTURE                            │
└────────────────────────────────────────────────────────────────────────────────────────┘

    [ European Saver / Dev Treasury ]
                 │
                 ▼ (One-Time Deposit)
   ┌─────────────────────────────────────────────────────────────────┐
   │ Gnosis Chain (100) Spark / Aave EURe Vault (ERC-4626)            │
   │ (Earns ~3.5%–5.0% Net APY on EURe)                              │
   └─────────────────────────────────────────────────────────────────┘
                 │
                 ▼ (Monthly Yield Sweep)
   ┌─────────────────────────────────────────────────────────────────┐
   │ User's Non-Custodial Gnosis Safe (Gnosis Chain)                  │
   │ (Safe holds liquid EURe yield buffer; Principal remains locked) │
   └─────────────────────────────────────────────────────────────────┘
                 │
                 ▼ (Visa Point-of-Sale Settlement)
   ┌─────────────────────────────────────────────────────────────────┐
   │ Gnosis Pay Visa Debit Card                                      │
   │ (Spend Delay Module debits EURe to settle merchant charges)     │
   └─────────────────────────────────────────────────────────────────┘
```

### 2.1 The Invariant: $\Delta \text{Principal} \equiv 0$
1. **User Principal Deposit:** Saver deposits principal into an ERC-4626 vault (e.g., Spark / Aave `EURe` market on Gnosis Chain).
2. **Automated Yield Sweeper:** Realized `EURe` yield is transferred monthly directly to the user's **Gnosis Safe** address.
3. **Card Authorization:** Visa network transactions (e.g., Anthropic Claude Pro €20.00) trigger Gnosis Pay's Spend Delay module to debit the Safe's `EURe` balance.
4. **Principal Security:** The underlying deposit vault principal is completely isolated from card rails and can never be seized by merchant chargebacks or failed debits.

---

## 3. European Subscription Tiers (EURe Benchmarks)

| Subscription Intent | Monthly Liability (EUR) | Benchmark Yield (Spark EURe) | 1-Click Required Deposit (EURe) | 1-Month Liquid Buffer |
| :--- | :--- | :--- | :--- | :--- |
| 🤖 **Claude Pro EU** | €20.00 / mo | 4.5% Net APY | **€6,400 EURe** | €20.00 |
| 💻 **Cursor Pro EU** | €20.00 / mo | 4.5% Net APY | **€6,400 EURe** | €20.00 |
| 🎵 **Spotify Premium** | €11.99 / mo | 4.5% Net APY | **€3,837 EURe** | €11.99 |
| 🎬 **Netflix Standard** | €14.99 / mo | 4.5% Net APY | **€4,797 EURe** | €14.99 |
| ⚡ **Total Dev Stack** | €52.00 / mo | 4.5% Net APY | **€16,640 EURe** | €52.00 |

*Formula: $C_{\text{required}} = \frac{12 \times \text{Bill}}{\text{Net APY}} \times 1.20$ (with 1.20x solvency headroom).*

---

## 4. GnosisDAO Ecosystem & Grant Alignment

* **GECO Grant Proposal:** Requesting **$20,000 / 20k GNO/EURe** from GnosisDAO / GECO to sponsor:
  1. European user onboarding and physical card issuance fee waivers (€30/card).
  2. Gasless keeper sweep automation on Gnosis Chain.
  3. Joint co-marketing case study with Gnosis Pay & Monerium.

---

## 5. Implementation Status

* **Adapter Implemented:** `defi_garden/adapters/card_baas_adapter.py` (`GnosisPayAdapter`)
* **Test Suite:** 100% verified with 17 passing assertions (`defi_garden/tests/test_card_baas_adapter.py`).
* **Receipts Logged:** `state/partner_integration_receipts.jsonl` (`rec_partner_gnosis_pay_spec`).
