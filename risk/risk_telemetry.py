"""
Real-Time Risk Telemetry & Oracle Verification Engine for DeFi Garden
Monitors live/testnet collateral LTVs, dual-oracle divergence (Chainlink vs Pyth/Redstone),
and borrow rate volatility across Base Sepolia (84532) and Base Mainnet (8453).
"""

import json
import os
import sys
import time
import math
from typing import Dict, Any, Tuple, Optional

# Ensure parent directory is in path for imports
_PKG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PKG_DIR not in sys.path:
    sys.path.insert(0, _PKG_DIR)
_ROOT_DIR = os.path.dirname(_PKG_DIR)
if _ROOT_DIR not in sys.path:
    sys.path.insert(0, _ROOT_DIR)

class RiskTelemetryEngine:
    def __init__(self, config_path: Optional[str] = None):
        if config_path is None:
            # Look for risk_parameters.json in standard locations
            candidate_paths = [
                os.path.join(_PKG_DIR, "config", "risk_parameters.json"),
                os.path.join(os.getcwd(), "config", "risk_parameters.json"),
                os.path.join(os.getcwd(), "defi_garden", "config", "risk_parameters.json"),
                "defi_garden/config/risk_parameters.json",
                "config/risk_parameters.json"
            ]
            for p in candidate_paths:
                if os.path.exists(p):
                    config_path = p
                    break
            if config_path is None:
                config_path = candidate_paths[0]

        with open(config_path, "r") as f:
            self.config = json.load(f)
            
        self.leverage_gates = self.config.get("leverage_gates", {})
        self.oracle_tripwires = self.config.get("oracle_divergence_tripwires", {})
        self.basis_circuit_breakers = self.config.get("basis_risk_circuit_breakers", {})
        self.demotion_rules = self.config.get("boosted_mode_demotion_rules", {})

    def evaluate_oracle_health(
        self,
        primary_price_usd: float,
        secondary_price_usd: float,
        primary_timestamp: float,
        secondary_timestamp: float,
        current_time: Optional[float] = None
    ) -> Tuple[bool, float, str]:
        """
        Validates dual-oracle divergence and staleness.
        Threshold: 15 bps (0.15%), Staleness: 3600 seconds.
        """
        now = current_time if current_time is not None else time.time()
        max_staleness = self.oracle_tripwires.get("max_oracle_staleness_seconds", 3600)
        max_spread_bps = self.oracle_tripwires.get("max_divergence_spread_bps", 15)

        if (now - primary_timestamp) > max_staleness:
            return False, 0.0, f"Primary oracle stale: {int(now - primary_timestamp)}s > {max_staleness}s"
        if (now - secondary_timestamp) > max_staleness:
            return False, 0.0, f"Secondary oracle stale: {int(now - secondary_timestamp)}s > {max_staleness}s"

        if primary_price_usd <= 0 or secondary_price_usd <= 0:
            return False, 0.0, "Invalid price <= 0"

        spread_bps = abs(primary_price_usd - secondary_price_usd) / min(primary_price_usd, secondary_price_usd) * 10000.0

        if spread_bps > max_spread_bps:
            return False, spread_bps, f"Oracle divergence exceeded: {spread_bps:.2f} bps > {max_spread_bps} bps"

        return True, spread_bps, "Healthy"

    def evaluate_ltv_state(
        self,
        borrowed_usd: float,
        collateral_usd: float,
        protocol: str = "morpho_blue"
    ) -> Dict[str, Any]:
        """
        Evaluates position leverage against LLTV limits.
        """
        if collateral_usd <= 0:
            return {"healthy": False, "ltv_pct": 0.0, "action": "INVALID_COLLATERAL"}

        current_ltv = (borrowed_usd / collateral_usd) * 100.0
        rules = self.leverage_gates.get(protocol, {})
        max_ltv = rules.get("max_lltv_cap_pct", 82.0)
        trigger_ltv = rules.get("deleverage_trigger_ltv_pct", 78.0)
        target_ltv = rules.get("target_healthy_ltv_pct", 70.0)

        if current_ltv >= max_ltv:
            return {
                "healthy": False,
                "ltv_pct": round(current_ltv, 2),
                "action": "IMMEDIATE_LIQUIDATION_RISK_EMERGENCY_UNWIND",
                "excess_ltv_bps": int((current_ltv - target_ltv) * 100)
            }
        elif current_ltv >= trigger_ltv:
            target_borrow = (target_ltv / 100.0) * collateral_usd
            repay_amount = borrowed_usd - target_borrow
            return {
                "healthy": False,
                "ltv_pct": round(current_ltv, 2),
                "action": "AUTO_DELEVERAGE_REQUIRED",
                "repay_usd_required": round(repay_amount, 2),
                "target_ltv_pct": target_ltv
            }
        else:
            return {
                "healthy": True,
                "ltv_pct": round(current_ltv, 2),
                "action": "POSITION_HEALTHY",
                "safety_buffer_bps": int((trigger_ltv - current_ltv) * 100)
            }

    def evaluate_strategy_eligibility(
        self,
        tvl_usd: float,
        headline_apy_pct: float,
        rolling_7d_rates: list,
        exit_liquidity_usd: float,
        total_vault_exposure_usd: float
    ) -> Dict[str, Any]:
        """
        Assesses whether a strategy qualifies for Boosted Mode or must be demoted.
        """
        min_tvl = self.demotion_rules.get("min_tvl_usd", 100000)
        max_apy = self.demotion_rules.get("max_headline_apy_pct", 1000.0)
        max_sigma = self.demotion_rules.get("borrow_rate_volatility_max_sigma_7d", 2.5)
        min_exit_ratio = self.demotion_rules.get("min_secondary_exit_liquidity_ratio", 3.0)

        if tvl_usd < min_tvl:
            return {"eligible": False, "reason": f"TVL ${tvl_usd:,.0f} below ${min_tvl:,.0f} floor"}
        if headline_apy_pct > max_apy:
            return {"eligible": False, "reason": f"APY {headline_apy_pct:.1f}% exceeds sanity ceiling"}

        if len(rolling_7d_rates) >= 5:
            mean_rate = sum(rolling_7d_rates) / len(rolling_7d_rates)
            variance = sum((r - mean_rate) ** 2 for r in rolling_7d_rates) / len(rolling_7d_rates)
            std_dev = math.sqrt(variance)
            if std_dev > max_sigma:
                return {"eligible": False, "reason": f"Borrow rate stddev {std_dev:.2f}σ > {max_sigma}σ"}

        if total_vault_exposure_usd > 0:
            liquidity_ratio = exit_liquidity_usd / total_vault_exposure_usd
            if liquidity_ratio < min_exit_ratio:
                return {"eligible": False, "reason": f"Exit liquidity ratio {liquidity_ratio:.2f}x < {min_exit_ratio:.1f}x threshold"}

        return {"eligible": True, "status": "BOOSTED_MODE_APPROVED"}
