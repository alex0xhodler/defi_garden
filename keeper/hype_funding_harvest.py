#!/usr/bin/env python3
"""
DeFi Garden - HYPE Funding Harvest Module & Keeper Engine
Pulls live perp funding rates, open interest, and oracle prices from Hyperliquid.
Computes instantaneous APR, 30d projected carry (with 1/3 decay haircut), basis spread,
and evaluates risk tripwires (<15 bps oracle spread, crowded-long alerts).
"""

import json
import math
import time
import urllib.request
import urllib.error
from typing import Dict, Any, Tuple, Optional

HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/info"
APY_SANITY_LIMIT = 10.0  # 1000% APR/APY ceiling
DECAY_HAIRCUT_FACTOR = 0.67  # 33% haircut for 30d projected variable rate decay
DEFAULT_MIN_OI_USD = 10_000_000.0  # $10M OI threshold for high-liquidity harvest
MAX_ORACLE_DIVERGENCE_BPS = 15.0  # 15 bps tripwire ceiling


class HypeFundingHarvestEngine:
    def __init__(self, api_url: str = HYPERLIQUID_API_URL):
        self.api_url = api_url

    def fetch_hyperliquid_market_data(self) -> Dict[str, Any]:
        """
        Fetch universe metadata and asset contexts from Hyperliquid public info API.
        """
        req_payload = json.dumps({"type": "metaAndAssetCtxs"}).encode('utf-8')
        req = urllib.request.Request(
            self.api_url,
            data=req_payload,
            headers={'Content-Type': 'application/json', 'User-Agent': 'DeFiGarden/1.0'}
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status != 200:
                    raise RuntimeError(f"Hyperliquid API returned status {response.status}")
                data = json.loads(response.read().decode('utf-8'))
                return data
        except urllib.error.URLError as e:
            raise RuntimeError(f"Failed to connect to Hyperliquid API: {e}")

    def extract_hype_context(self, raw_data: Any) -> Dict[str, Any]:
        """
        Extracts HYPE market metrics from Hyperliquid metaAndAssetCtxs payload.
        """
        if not raw_data or not isinstance(raw_data, list) or len(raw_data) < 2:
            raise ValueError("Invalid metaAndAssetCtxs payload structure")

        meta = raw_data[0]
        asset_ctxs = raw_data[1]

        universe = meta.get("universe", [])
        hype_index = None
        for idx, asset in enumerate(universe):
            if asset.get("name") == "HYPE":
                hype_index = idx
                break

        if hype_index is None or hype_index >= len(asset_ctxs):
            raise ValueError("HYPE asset context not found in Hyperliquid universe")

        ctx = asset_ctxs[hype_index]
        return {
            "name": "HYPE",
            "index": hype_index,
            "raw_ctx": ctx
        }

    def compute_funding_metrics(self, ctx_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Computes standardized funding rates, carry APY, basis spread, and crowded-long metrics.
        """
        ctx = ctx_data.get("raw_ctx", {})

        # Parse string floats from Hyperliquid context
        try:
            hourly_funding = float(ctx.get("funding", 0.0))
            open_interest = float(ctx.get("openInterest", 0.0))
            mark_px = float(ctx.get("markPx", 0.0))
            oracle_px = float(ctx.get("oraclePx", 0.0))
            day_volume = float(ctx.get("dayNtlVlm", 0.0))
            prev_day_px = float(ctx.get("prevDayPx", mark_px))
        except (ValueError, TypeError) as e:
            raise ValueError(f"Failed to parse numeric fields from asset context: {e}")

        if oracle_px <= 0 or mark_px <= 0:
            raise ValueError("Invalid oracle or mark price <= 0")

        # 1. Funding Rates
        # Hyperliquid funding is hourly
        rate_1h = hourly_funding
        rate_8h = hourly_funding * 8.0
        
        # Annualized Instantaneous APR (linear: r * 24 * 365)
        instant_apr = rate_1h * 24.0 * 365.0
        
        # Compounded APY (1 + r)^8760 - 1 capped at sanity limit
        if rate_1h > -1.0:
            try:
                raw_compounded = math.pow(1.0 + rate_1h, 8760.0) - 1.0
                compounded_apy = min(raw_compounded, APY_SANITY_LIMIT)
            except OverflowError:
                compounded_apy = APY_SANITY_LIMIT
        else:
            compounded_apy = -1.0

        # Projected 30d APR applying DeFi Garden's 1/3 decay haircut
        projected_30d_apr = instant_apr * DECAY_HAIRCUT_FACTOR

        # 2. Open Interest and Volumes
        open_interest_usd = open_interest * mark_px
        crowded_ratio = (open_interest_usd / day_volume) if day_volume > 0 else 0.0

        # 3. Basis Spread & Oracle Divergence (in basis points)
        basis_spread_bps = abs(mark_px - oracle_px) / oracle_px * 10000.0

        # 4. Sentiment & Alert Status
        # Crowded long: Funding > 25% APR and OI >= $10M
        is_crowded_long = (instant_apr >= 0.25) and (open_interest_usd >= DEFAULT_MIN_OI_USD)
        divergence_alert = basis_spread_bps > MAX_ORACLE_DIVERGENCE_BPS

        return {
            "symbol": "HYPE",
            "mark_price": mark_px,
            "oracle_price": oracle_px,
            "basis_spread_bps": round(basis_spread_bps, 2),
            "divergence_alert": divergence_alert,
            "hourly_funding_rate": rate_1h,
            "funding_rate_8h": rate_8h,
            "instant_apr": round(instant_apr, 4),
            "instant_apr_pct": round(instant_apr * 100.0, 2),
            "compounded_apy": round(compounded_apy, 4),
            "compounded_apy_pct": round(compounded_apy * 100.0, 2),
            "projected_30d_apr": round(projected_30d_apr, 4),
            "projected_30d_apr_pct": round(projected_30d_apr * 100.0, 2),
            "open_interest_tokens": open_interest,
            "open_interest_usd": round(open_interest_usd, 2),
            "day_volume_usd": round(day_volume, 2),
            "crowded_long_ratio": round(crowded_ratio, 3),
            "is_crowded_long": is_crowded_long,
            "timestamp": int(time.time())
        }

    def compute_harvest_yield(self, capital_usd: float, metrics: Dict[str, Any]) -> Dict[str, Any]:
        """
        Computes absolute USD returns for a delta-neutral cash-and-carry position.
        Long Leg: 50% Spot HYPE
        Short Leg: 50% 1x Short HYPE Perp on Hyperliquid
        Funding is earned on the 50% notional short position.
        """
        if capital_usd <= 0:
            raise ValueError("Capital must be > 0")

        # 1x delta-neutral allocation: 50% spot, 50% perp margin
        notional_short_usd = capital_usd * 0.50
        
        # Annual and monthly earnings on the short leg
        instant_apr = metrics.get("instant_apr", 0.0)
        projected_apr = metrics.get("projected_30d_apr", 0.0)

        annual_harvest_usd = notional_short_usd * instant_apr
        monthly_harvest_usd = annual_harvest_usd / 12.0
        daily_harvest_usd = annual_harvest_usd / 365.0

        projected_monthly_usd = (notional_short_usd * projected_apr) / 12.0

        return {
            "capital_usd": capital_usd,
            "spot_allocation_usd": capital_usd * 0.50,
            "perp_short_notional_usd": notional_short_usd,
            "daily_harvest_usd": round(daily_harvest_usd, 2),
            "monthly_harvest_usd": round(monthly_harvest_usd, 2),
            "projected_monthly_usd": round(projected_monthly_usd, 2),
            "annual_harvest_usd": round(annual_harvest_usd, 2),
            "instant_net_apr_pct": round((annual_harvest_usd / capital_usd) * 100.0, 2),
            "projected_net_apr_pct": round(((projected_monthly_usd * 12) / capital_usd) * 100.0, 2),
        }


def run_cli_diagnostic():
    engine = HypeFundingHarvestEngine()
    print("Connecting to Hyperliquid API...")
    try:
        raw = engine.fetch_hyperliquid_market_data()
        ctx = engine.extract_hype_context(raw)
        metrics = engine.compute_funding_metrics(ctx)
        
        print("\n=== HYPE Funding Harvest Live Diagnostic ===")
        print(f"Mark Price:       ${metrics['mark_price']:,.2f}")
        print(f"Oracle Price:     ${metrics['oracle_price']:,.2f}")
        print(f"Basis Spread:     {metrics['basis_spread_bps']} bps (Tripwire: {metrics['divergence_alert']})")
        print(f"Hourly Funding:   {metrics['hourly_funding_rate'] * 100:.4f}% / hour")
        print(f"Instant APR:      {metrics['instant_apr_pct']}% APR")
        print(f"Projected 30d:    {metrics['projected_30d_apr_pct']}% APR (33% decay haircut)")
        print(f"Open Interest:    ${metrics['open_interest_usd']:,.0f} USD")
        print(f"24h Volume:       ${metrics['day_volume_usd']:,.0f} USD")
        print(f"Crowded Long:     {'🔥 YES (High Carry Opportunity)' if metrics['is_crowded_long'] else '⚖️ Normal'}")
        
        example_calc = engine.compute_harvest_yield(10000.0, metrics)
        print("\n=== $10,000 Delta-Neutral Harvest Simulation ===")
        print(f"Spot Leg:         ${example_calc['spot_allocation_usd']:,.2f}")
        print(f"Short Perp Leg:   ${example_calc['perp_short_notional_usd']:,.2f}")
        print(f"Daily Harvest:    ${example_calc['daily_harvest_usd']:,.2f} / day")
        print(f"Monthly Harvest:  ${example_calc['monthly_harvest_usd']:,.2f} / month")
        print(f"Projected Month:  ${example_calc['projected_monthly_usd']:,.2f} / month (decayed)")
    except Exception as e:
        print(f"Diagnostic failed: {e}")


if __name__ == "__main__":
    run_cli_diagnostic()
