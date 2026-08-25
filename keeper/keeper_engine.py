#!/usr/bin/env python3
"""
DeFi Garden v2 Intent-Resolved Keeper Engine
Autonomous execution daemon for multi-card batch yield sweeps, over-collateralization enforcement,
and deterministic receipt logging on Base (Chain ID: 8453).
Enforces strict mathematical invariants: ΔPrincipal ≡ 0, gas ceiling <15 Gwei, and dual-oracle divergence <15 bps.
"""

import json
import os
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Any, Tuple, Optional

@dataclass
class VaultPosition:
    vault_id: str
    owner: str
    item_intent: str  # e.g., "claude-pro", "cursor-pro", "aws-infra", "treasury"
    deposited_principal_usd: float
    total_equity_usd: float
    monthly_liability_usd: float
    card_proxy_address: str
    currency: str = "USD"
    oracle_primary_price: float = 1.0
    oracle_secondary_price: float = 1.0
    oracle_timestamp: int = 0
    collateral_usd: float = 0.0
    debt_usd: float = 0.0
    is_active: bool = True

class KeeperEngine:
    def __init__(self, config_path: Optional[str] = None):
        self.base_dir = Path(__file__).resolve().parent.parent
        if config_path and os.path.exists(config_path):
            with open(config_path, 'r') as f:
                self.config = json.load(f)
        else:
            self.config = {
                "riskRails": {
                    "minHarvestAmountUsd": 50.0,
                    "maxSlippageBps": 30,
                    "safetyBufferMultiplier": 1.25,
                    "taxHeadroomPct": 20.0,
                    "morphoBlue": {
                        "maxLltvHardCap": 0.82,
                        "emergencyDeleverageTriggerLltv": 0.78,
                        "targetPostDeleverageLltv": 0.70
                    },
                    "oracles": {
                        "maxDivergenceSpreadBps": 15,
                        "maxStalenessSeconds": 3600
                    },
                    "protocolPerformanceFeeBps": 2000
                },
                "chains": {
                    "base": {"chainId": 8453, "maxGasGwei": 15.0},
                    "baseSepolia": {"chainId": 84532, "maxGasGwei": 10.0}
                }
            }

    def check_oracle_spread(self, primary_price: float, secondary_price: float, primary_ts: int, now_ts: Optional[int] = None) -> Tuple[bool, str, float]:
        now = now_ts or int(time.time())
        staleness = now - primary_ts if primary_ts > 0 else 0
        max_staleness = self.config["riskRails"]["oracles"]["maxStalenessSeconds"]
        if primary_ts > 0 and staleness > max_staleness:
            return False, f"Oracle stale: {staleness}s > {max_staleness}s limit", 0.0

        if primary_price <= 0:
            return False, "Invalid primary oracle price <= 0", 0.0

        spread_bps = (abs(primary_price - secondary_price) / primary_price) * 10000.0
        max_spread = self.config["riskRails"]["oracles"]["maxDivergenceSpreadBps"]
        if spread_bps > max_spread:
            return False, f"Oracle divergence tripwire: {spread_bps:.2f} bps > {max_spread} bps limit", spread_bps

        return True, "Oracle healthy", spread_bps

    def evaluate_single_sweep(self, vault: VaultPosition, gas_price_gwei: float, now_ts: Optional[int] = None) -> Dict[str, Any]:
        """
        Evaluates a single intent vault for yield sweep readiness.
        Strictly enforces ΔPrincipal ≡ 0.
        """
        now = now_ts or int(time.time())
        gas_ceiling = self.config["chains"]["base"]["maxGasGwei"]
        if gas_price_gwei > gas_ceiling:
            return {
                "vault_id": vault.vault_id,
                "executable": False,
                "reason": f"Gas {gas_price_gwei} Gwei > {gas_ceiling} Gwei ceiling",
                "action": "WAIT_FOR_GAS"
            }

        # Oracle Tripwire
        oracle_ok, oracle_msg, spread_bps = self.check_oracle_spread(
            vault.oracle_primary_price, vault.oracle_secondary_price, vault.oracle_timestamp, now
        )
        if not oracle_ok:
            return {
                "vault_id": vault.vault_id,
                "executable": False,
                "reason": oracle_msg,
                "oracleSpreadBps": spread_bps,
                "action": "FREEZE_ORACLE_ANOMALY"
            }

        # LTV evaluation if debt exists
        if vault.collateral_usd > 0 and vault.debt_usd > 0:
            current_ltv = vault.debt_usd / vault.collateral_usd
            trigger_ltv = self.config["riskRails"]["morphoBlue"]["emergencyDeleverageTriggerLltv"]
            if current_ltv >= trigger_ltv:
                target_ltv = self.config["riskRails"]["morphoBlue"]["targetPostDeleverageLltv"]
                repay_needed = max(0.0, vault.debt_usd - (vault.collateral_usd * target_ltv))
                return {
                    "vault_id": vault.vault_id,
                    "executable": False,
                    "currentLtv": current_ltv,
                    "repayRequiredUsd": repay_needed,
                    "reason": f"LTV breach: {current_ltv*100:.1f}% >= 78% emergency trigger",
                    "action": "PRIORITIZE_DELEVERAGE"
                }

        # Principal Protection Invariant: Yield = max(0, total_equity - deposited_principal)
        accrued_yield = max(0.0, vault.total_equity_usd - vault.deposited_principal_usd)
        min_threshold = self.config["riskRails"]["minHarvestAmountUsd"]

        if accrued_yield < min_threshold:
            return {
                "vault_id": vault.vault_id,
                "executable": False,
                "accruedYieldUsd": accrued_yield,
                "reason": f"Yield ${accrued_yield:.2f} < ${min_threshold:.2f} threshold",
                "action": "ACCUMULATE_YIELD"
            }

        fee_bps = self.config["riskRails"]["protocolPerformanceFeeBps"]
        fee_amount = accrued_yield * (fee_bps / 10000.0)
        net_sweep = accrued_yield - fee_amount

        return {
            "vault_id": vault.vault_id,
            "owner": vault.owner,
            "item_intent": vault.item_intent,
            "card_proxy_address": vault.card_proxy_address,
            "executable": True,
            "accruedYieldUsd": round(accrued_yield, 2),
            "protocolFeeUsd": round(fee_amount, 2),
            "netSweepUsd": round(net_sweep, 2),
            "action": "EXECUTE_CARD_SWEEP"
        }

    def evaluate_batch_sweeps(self, vaults: List[VaultPosition], gas_price_gwei: float, now_ts: Optional[int] = None) -> Dict[str, Any]:
        """
        Ticket KO-01: Multi-card batched yield sweep evaluator.
        Aggregates multiple user vaults into a single multi-call transaction payload for Base execution.
        """
        now = now_ts or int(time.time())
        eligible_sweeps = []
        skipped_vaults = []
        total_gross_yield = 0.0
        total_protocol_fees = 0.0
        total_net_sweeps = 0.0

        for vault in vaults:
            decision = self.evaluate_single_sweep(vault, gas_price_gwei, now)
            if decision.get("executable"):
                eligible_sweeps.append(decision)
                total_gross_yield += decision["accruedYieldUsd"]
                total_protocol_fees += decision["protocolFeeUsd"]
                total_net_sweeps += decision["netSweepUsd"]
            else:
                skipped_vaults.append(decision)

        batch_id = f"batch_base_{int(now)}_{len(eligible_sweeps)}"
        is_executable = len(eligible_sweeps) > 0

        # Estimate gas savings from multi-call batching on Base
        # Base single transfer ~45,000 gas; batched transfer ~25,000 gas/additional user
        estimated_gas_cost_usd = 0.0
        if is_executable:
            total_gas_units = 60000 + (len(eligible_sweeps) - 1) * 28000
            # Base ETH price ~ $3000 USD
            estimated_gas_cost_usd = (total_gas_units * (gas_price_gwei * 1e-9)) * 3000.0

        return {
            "batch_id": batch_id,
            "timestamp": now,
            "is_executable": is_executable,
            "eligible_count": len(eligible_sweeps),
            "skipped_count": len(skipped_vaults),
            "total_gross_yield_usd": round(total_gross_yield, 2),
            "total_protocol_fees_usd": round(total_protocol_fees, 2),
            "total_net_swept_usd": round(total_net_sweeps, 2),
            "estimated_batch_gas_usd": round(estimated_gas_cost_usd, 4),
            "gas_cost_per_user_usd": round(estimated_gas_cost_usd / len(eligible_sweeps), 4) if is_executable else 0.0,
            "eligible_sweeps": eligible_sweeps,
            "skipped_vaults": skipped_vaults
        }

    def record_execution_receipt(self, batch_result: Dict[str, Any], receipt_log_path: Optional[str] = None) -> str:
        """
        Ticket KO-02: Writes deterministic execution receipts to JSONL for auditability.
        """
        if receipt_log_path is None:
            receipt_log_path = str(self.base_dir / "state" / "keeper_execution_receipts.jsonl")

        receipt = {
            "receipt_id": f"rcpt_{int(time.time()*1000):x}",
            "batch_id": batch_result["batch_id"],
            "timestamp": batch_result["timestamp"],
            "iso_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(batch_result["timestamp"])),
            "eligible_count": batch_result["eligible_count"],
            "total_net_swept_usd": batch_result["total_net_swept_usd"],
            "total_protocol_fees_usd": batch_result["total_protocol_fees_usd"],
            "estimated_gas_cost_usd": batch_result["estimated_batch_gas_usd"],
            "invariant_principal_protected": True,
            "sweeps": [
                {
                    "vault_id": s["vault_id"],
                    "owner": s["owner"],
                    "item_intent": s["item_intent"],
                    "card_proxy": s["card_proxy_address"],
                    "net_sweep_usd": s["netSweepUsd"]
                }
                for s in batch_result.get("eligible_sweeps", [])
            ]
        }

        os.makedirs(os.path.dirname(receipt_log_path), exist_ok=True)
        with open(receipt_log_path, "a") as f:
            f.write(json.dumps(receipt) + "\n")

        return receipt["receipt_id"]

if __name__ == "__main__":
    engine = KeeperEngine()
    now = int(time.time())
    vaults = [
        VaultPosition(
            vault_id="v_claude_01",
            owner="0x0d79860366926b7685428dcd2b2d1eefcbd45178",
            item_intent="claude-pro",
            deposited_principal_usd=4750.0,
            total_equity_usd=4875.0,  # $125 yield accrued
            monthly_liability_usd=20.0,
            card_proxy_address="0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b",
            oracle_timestamp=now
        ),
        VaultPosition(
            vault_id="v_cursor_02",
            owner="0x1111111111111111111111111111111111111111",
            item_intent="cursor-pro",
            deposited_principal_usd=4750.0,
            total_equity_usd=4830.0,  # $80 yield accrued
            monthly_liability_usd=20.0,
            card_proxy_address="0x2222222222222222222222222222222222222222",
            oracle_timestamp=now
        )
    ]
    batch = engine.evaluate_batch_sweeps(vaults, gas_price_gwei=3.5, now_ts=now)
    rcpt_id = engine.record_execution_receipt(batch)
    print(f"Batch Execution Evaluated. Receipt ID: {rcpt_id}")
    print(json.dumps(batch, indent=2))
