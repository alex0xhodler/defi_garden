#!/usr/bin/env python3
"""
DeFi Garden Keeper Execution Engine
Autonomous execution worker for yield harvesting, risk evaluation, and Rain card deposit sweeps.
Enforces strict mathematical invariants: ΔPrincipal ≡ 0, gas ceiling <15 Gwei, and dual-oracle divergence <15 bps.
"""

import json
import math
import time
from typing import Dict, Any, Tuple, Optional

class KeeperEngine:
    def __init__(self, config_path: Optional[str] = None):
        if config_path:
            with open(config_path, 'r') as f:
                self.config = json.load(f)
        else:
            self.config = {
                "riskRails": {
                    "minHarvestAmountUsd": 50.0,
                    "maxSlippageBps": 30,
                    "morphoBlue": {
                        "maxLltvHardCap": 0.82,
                        "emergencyDeleverageTriggerLltv": 0.78,
                        "targetPostDeleverageLltv": 0.70
                    },
                    "oracles": {
                        "maxDivergenceSpreadBps": 15,
                        "maxStalenessSeconds": 3600
                    },
                    "ethenaUsde": {
                        "negativeFundingEpochsToUnwind": 2
                    },
                    "protocolPerformanceFeeBps": 2000
                },
                "chains": {
                    "base": {"chainId": 8453, "maxGasGwei": 15.0},
                    "baseSepolia": {"chainId": 84532, "maxGasGwei": 10.0}
                }
            }

    def check_oracle_spread(self, primary_price: float, secondary_price: float, primary_ts: int, now_ts: Optional[int] = None) -> Tuple[bool, str, float]:
        """
        Validates dual-oracle divergence and staleness.
        Spread = |primary - secondary| / primary * 10,000 bps.
        """
        now = now_ts or int(time.time())
        staleness = now - primary_ts
        max_staleness = self.config["riskRails"]["oracles"]["maxStalenessSeconds"]
        if staleness > max_staleness:
            return False, f"Oracle stale: {staleness}s > {max_staleness}s limit", 0.0

        if primary_price <= 0:
            return False, "Invalid primary oracle price <= 0", 0.0

        spread_bps = (abs(primary_price - secondary_price) / primary_price) * 10000.0
        max_spread = self.config["riskRails"]["oracles"]["maxDivergenceSpreadBps"]
        if spread_bps > max_spread:
            return False, f"Oracle divergence tripwire: {spread_bps:.2f} bps > {max_spread} bps limit", spread_bps

        return True, "Oracle healthy", spread_bps

    def evaluate_ltv(self, collateral_usd: float, debt_usd: float) -> Tuple[bool, float, float]:
        """
        Evaluates position LTV. If LTV >= 78%, calculates required debt repayment to reach 70% LTV.
        Returns: (is_healthy, current_ltv, required_repay_usd)
        """
        if collateral_usd <= 0:
            return False, 1.0, debt_usd

        current_ltv = debt_usd / collateral_usd
        trigger_ltv = self.config["riskRails"]["morphoBlue"]["emergencyDeleverageTriggerLltv"]
        target_ltv = self.config["riskRails"]["morphoBlue"]["targetPostDeleverageLltv"]

        if current_ltv >= trigger_ltv:
            # required_repay = debt_usd - (collateral_usd * target_ltv)
            required_repay = max(0.0, debt_usd - (collateral_usd * target_ltv))
            return False, current_ltv, required_repay

        return True, current_ltv, 0.0

    def evaluate_sweep(self, vault_state: Dict[str, Any], gas_price_gwei: float, now_ts: Optional[int] = None) -> Dict[str, Any]:
        """
        Evaluates whether a yield sweep to a user's Rain virtual card is executable.
        Enforces ΔPrincipal ≡ 0: harvest amount cannot exceed accrued yield.
        """
        deposited_principal = float(vault_state.get("depositedPrincipalUsd", 0.0))
        total_equity = float(vault_state.get("totalEquityUsd", 0.0))
        gas_ceiling = self.config["chains"]["base"]["maxGasGwei"]

        # Gas check
        if gas_price_gwei > gas_ceiling:
            return {
                "executable": False,
                "reason": f"Gas too high: {gas_price_gwei} Gwei > {gas_ceiling} Gwei limit",
                "action": "WAIT_FOR_GAS"
            }

        # Oracle checks
        primary_p = float(vault_state.get("oraclePrimaryPrice", 1.0))
        secondary_p = float(vault_state.get("oracleSecondaryPrice", 1.0))
        oracle_ts = int(vault_state.get("oracleTimestamp", int(time.time())))
        oracle_ok, oracle_msg, spread_bps = self.check_oracle_spread(primary_p, secondary_p, oracle_ts, now_ts)
        if not oracle_ok:
            return {
                "executable": False,
                "reason": oracle_msg,
                "oracleSpreadBps": spread_bps,
                "action": "FREEZE_ORACLE_ANOMALY"
            }

        # LTV check
        collateral_usd = float(vault_state.get("collateralUsd", total_equity))
        debt_usd = float(vault_state.get("debtUsd", 0.0))
        ltv_ok, current_ltv, repay_needed = self.evaluate_ltv(collateral_usd, debt_usd)
        if not ltv_ok:
            return {
                "executable": False,
                "reason": f"LTV breach: {current_ltv*100:.1f}% >= 78% emergency trigger",
                "currentLtv": current_ltv,
                "repayRequiredUsd": repay_needed,
                "action": "PRIORITIZE_DELEVERAGE"
            }

        # Principal invariance check: Accrued Yield = Total Equity - Deposited Principal
        accrued_yield = max(0.0, total_equity - deposited_principal)
        min_threshold = self.config["riskRails"]["minHarvestAmountUsd"]

        if accrued_yield < min_threshold:
            return {
                "executable": False,
                "accruedYieldUsd": accrued_yield,
                "reason": f"Yield ${accrued_yield:.2f} < ${min_threshold:.2f} threshold",
                "action": "ACCUMULATE_YIELD"
            }

        # Calculate Performance Fee and Net Sweep to Card
        fee_bps = self.config["riskRails"]["protocolPerformanceFeeBps"]
        fee_amount = accrued_yield * (fee_bps / 10000.0)
        net_sweep_amount = accrued_yield - fee_amount

        return {
            "executable": True,
            "accruedYieldUsd": accrued_yield,
            "protocolFeeUsd": fee_amount,
            "netSweepToCardUsd": net_sweep_amount,
            "cardDepositAddress": vault_state.get("cardDepositAddress", "0x0000000000000000000000000000000000000000"),
            "action": "EXECUTE_RAIN_CARD_SWEEP"
        }

if __name__ == "__main__":
    engine = KeeperEngine()
    test_state = {
        "depositedPrincipalUsd": 4000.0,
        "totalEquityUsd": 4125.0, # $125 yield accrued
        "collateralUsd": 4125.0,
        "debtUsd": 0.0,
        "oraclePrimaryPrice": 1.0001,
        "oracleSecondaryPrice": 1.0003,
        "oracleTimestamp": int(time.time()),
        "cardDepositAddress": "0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b"
    }
    result = engine.evaluate_sweep(test_state, gas_price_gwei=4.2)
    print("Keeper Evaluation Result:")
    print(json.dumps(result, indent=2))
