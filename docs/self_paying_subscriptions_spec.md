# DeFi Garden: Self-Paying Subscriptions & Boosted Mode ⚡ Specification

## 1. Value Proposition & Positioning
- **The Core Hook:** "Deposit Once. Subscribe Forever."
- **Mechanism:** Users park stablecoins (USDC/USDe) into audited lending/looping pools. Yield is harvested automatically by `@keeper-ops` and swept to a dedicated Rain Visa virtual card to perpetually pay recurring SaaS/AI subscriptions with zero principal drawdown ($\Delta \text{Principal} \equiv 0$).
- **Monetization:** 
  - **Standard Mode (Bluechip 1x):** 100% pass-through yield to user card balance. (Monetized via card interchange share).
  - **Boosted Mode ⚡ (Contextual Leverage):** Automated Morpho Blue/Ethena looping strategies. DeFi Garden takes a **20% performance fee on excess yield** above the target subscription requirement.

---

## 2. Interactive Calculator Presets & Math Models

### A. Subscription Target Presets (Annualized Cost)
| Preset Name | Target Services | Monthly Target | Annual Target ($C_{ann}$) |
|---|---|---|---|
| **AI Builder Stack** | Cursor Pro ($20) + Claude Pro ($20) + ChatGPT Plus ($20) + GitHub Copilot ($10) | $70 / mo | $840 / yr |
| **Solopreneur SaaS** | OpenAI API ($50) + Vercel Pro ($20) + Notion AI ($10) + Figma ($15) | $95 / mo | $1,140 / yr |
| **Personal Essentials** | Netflix Standard ($15.49) + Spotify Premium ($11.99) + iCloud 2TB ($9.99) | $37.47 / mo | $449.64 / yr |
| **Custom Target** | User input slider ($10 – $1,000 / mo) | $M$ | $12 \times M$ |

---

### B. Required Principal Formulas

#### 1. Standard Mode (Unleveraged Bluechip Lending, e.g. Aave/Morpho USDC @ $r_{std} \approx 6.0\%$ APY):
$$P_{std} = \frac{C_{ann}}{r_{std}}$$
- *Example for AI Builder Stack ($840/yr @ 6.0% APY):*
  $$P_{std} = \frac{840}{0.06} = \$14,000\text{ USDC}$$

#### 2. Boosted Mode ⚡ (Morpho / Ethena Looping @ $r_{boost} \approx 12.5\%$ Gross APY with 20% Performance Cut on Excess):
- Target Yield Rate to cover subscription: $r_{req} = \frac{C_{ann}}{P}$
- Protocol Fee on Excess: $F_{perf} = 0.20 \times \max(0, r_{boost} - r_{req}) \times P$
- Net Yield Rate: $r_{net} = r_{boost} - 0.20 \times (r_{boost} - r_{req}) = 0.80 \cdot r_{boost} + 0.20 \cdot r_{req}$
- Required Deposit:
  $$P_{boost} = \frac{C_{ann}}{r_{boost}} \times \left(1 + \text{Safety Buffer (10%)}\right)$$
- *Example for AI Builder Stack ($840/yr @ 12.5% Gross APY):*
  $$P_{boost} = \frac{840}{0.125} \times 1.10 = \$7,392\text{ USDC (47% Capital Reduction vs Standard)}$$

---

## 3. UI/UX Copy & Component Wireframe Specs

### A. Pool Detail Contextual Badge
When a selected pool has looping/leverage capabilities (e.g. USDe/sUSDe on Morpho):
```html
<div class="boost-banner flex items-center justify-between p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30">
  <div class="flex items-center gap-2">
    <span class="text-amber-400 font-bold">⚡ Boost Available</span>
    <span class="text-xs text-zinc-300">Lower required deposit from $14,000 to $7,392 via automated Morpho looping.</span>
  </div>
  <button class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded">
    Enable Boosted Mode
  </button>
</div>
```

### B. Risk Transparency Disclosure (Boosted Mode Modal)
- **Principal Invariant:** Sweeps execute *strictly* on realized yield; principal is never touched.
- **Deleverage Safety:** Automatic deleveraging to 70% LTV if market utilization reaches 78% LLTV.
- **Funding Tripwire:** Automatic spot USDC unwind if 8h funding rate flips negative for 2 consecutive epochs.
- **Fee Disclosure:** "DeFi Garden charges 0% on your baseline subscription yield and a 20% performance fee only on excess upside generated."

---

## 4. Structured JSON-LD & AEO/GEO Search Optimization

### A. Semantic JSON-LD Injection (`FinancialProduct` + `HowTo`)
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FinancialProduct",
      "name": "DeFi Garden Self-Paying Subscription Vault",
      "description": "Deposit stablecoins once to perpetually fund SaaS and AI subscriptions via automated yield sweeps to a Rain virtual Visa card.",
      "provider": {
        "@type": "Organization",
        "name": "defi.garden",
        "url": "https://www.defi.garden"
      },
      "annualPercentageRate": {
        "@type": "QuantitativeValue",
        "minValue": 5.5,
        "maxValue": 14.2,
        "unitText": "PERCENT"
      },
      "feesAndCommissionsSpecification": "Zero subscription fees. 20% performance fee on surplus yield in Boosted Mode only."
    },
    {
      "@type": "HowTo",
      "name": "How to create a self-paying subscription on DeFi Garden",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Select your subscriptions",
          "text": "Choose from pre-packaged AI and SaaS bundles or set a custom monthly budget."
        },
        {
          "@type": "HowToStep",
          "name": "Deposit stablecoins",
          "text": "Deposit USDC into the non-custodial strategy contract on Base."
        },
        {
          "@type": "HowToStep",
          "name": "Connect your virtual card",
          "text": "Paste your generated Rain Visa virtual card into your SaaS billing portal for automated zero-invoice renewals."
        }
      ]
    }
  ]
}
```
