# Auto Finance (`baseEUR`) & TermMax Partnership Integration Brief

## 1. Auto Finance (`baseEUR`) — European Yield-to-Card Rail

### Overview & Synergy:
- **Protocol:** Auto Finance (`app.auto.finance`) on Base.
- **Flagship Vault:** `baseEUR` (Base Euro Vault).
- **Core Value Proposition:** Allows European Web3 freelancers, agencies, and DAOs to park Euro stablecoins/assets and auto-route yield directly to virtual Visa cards to pay for European SaaS, cloud hosting (Hetzner, OVH), and daily subscriptions with **0% FX conversion drag**.

### Proposed Partnership Structure:
1. **Embedded `<SpendYieldWidget />`:** Auto Finance embeds our drop-in widget on `app.auto.finance/pools/baseEUR`, giving their liquidity providers an instant "Deposit & Auto-Pay EUR Subscriptions" button.
2. **Keeper Automation:** Yield harvests above €50 are automatically swept to Rain/Baanx EUR virtual cards via our non-custodial proxy layer ($\Delta \text{Principal} \equiv 0$).
3. **Revenue Sharing:** 50/50 split of generated card interchange volume with Auto Finance DAO/treasury.

---

## 2. TermMax (`ts.finance`) — Fixed-Yield Subscription Vaults

### Overview & Synergy:
- **Protocol:** TermMax Earn (`app.termmax.ts.finance/earn`) on Base.
- **Core Mechanism:** Fixed-rate, fixed-term lending markets (bond tokens) eliminating APY volatility.
- **Core Value Proposition:** Eliminates floating APY risk for cautious savers. Users lock fixed-rate USDC/USDT for 3–12 month terms, guaranteeing exact monthly subscription coverage regardless of DeFi market conditions.

### Proposed Partnership Structure:
1. **"Guaranteed Subscription Vaults":** TermMax powers the fixed-rate tier inside DeFi Garden and `<SpendYieldWidget />`.
2. **Automated Maturity Rollover:** Our Keeper daemon handles seamless 7-day pre-maturity rollover into new TermMax bond tranches without requiring user transactions or causing subscription payment interruptions.
3. **Co-Marketing & Liquidity Co-Incentives:** Joint launch on Base with dedicated PR and Base ecosystem grant alignment.
