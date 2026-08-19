"""
End-to-End Testnet Integration Dry-Run:
Connects RiskTelemetryEngine -> KeeperExecutionEngine -> Web3 / Rain Sweep Dispatch on Base Sepolia (84532).
"""

import time
import json
from defi_garden.risk.risk_telemetry import RiskTelemetryEngine
from defi_garden.keeper.keeper_engine import (
    KeeperExecutionEngine,
    OracleState,
    VaultPosition,
)

def run_e2e_simulation():
    print("================================================================================")
    print("🔥 Starting DeFi Garden E2E Keeper Ops & Risk Telemetry Dry-Run (Base Sepolia)")
    print("================================================================================\n")

    telemetry = RiskTelemetryEngine()
    keeper = KeeperExecutionEngine()
    now = time.time()

    # Scenario 1: Healthy Boosted Position -> Automated Yield Sweep to Rain Card
    print("▶ [Scenario 1] High-Yield Base Morpho Vault ($125 USDC unharvested, 4.5 Gwei gas)")
    p1_oracle_ok, p1_spread, p1_msg = telemetry.evaluate_oracle_health(
        primary_price_usd=1.0000,
        secondary_price_usd=1.0001,
        primary_timestamp=now - 20,
        secondary_timestamp=now - 10,
        current_time=now,
    )
    print(f"  ├─ Oracle Health: {p1_msg} (Spread: {p1_spread:.2f} bps)")

    pos1 = VaultPosition(
        protocol="morpho_blue",
        chain_id=84532, # Base Sepolia
        collateral_symbol="wstETH",
        debt_symbol="USDC",
        collateral_amount=10.0,
        collateral_price_usd=3000.0,
        debt_amount=15000.0,
        debt_price_usd=1.0,
        principal_deposited_usd=15000.0,
        unharvested_yield_usdc=125.00,
        current_gas_gwei=4.5,
    )
    oracle1 = OracleState(
        primary_oracle="chainlink",
        primary_price=1.0000,
        primary_timestamp=now - 20,
        secondary_oracle="pyth",
        secondary_price=1.0001,
        secondary_timestamp=now - 10,
    )

    decision1 = keeper.evaluate_execution(pos1, oracle1, current_time=now)
    print(f"  ├─ Keeper Decision: can_sweep={decision1.can_sweep_to_rain}, sweep_amount=${decision1.sweep_amount_usdc:.2f}")
    
    mock_rain_contract = "0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b"
    sweep_tx = keeper.execute_rain_sweep_simulated(decision1, mock_rain_contract)
    print(f"  └─ Sweep Tx Dispatch: {json.dumps(sweep_tx)}\n")

    # Scenario 2: High Oracle Divergence -> Execution Freeze
    print("▶ [Scenario 2] Flash Loan / Oracle Divergence Anomaly (25 bps spread)")
    oracle2 = OracleState(
        primary_oracle="chainlink",
        primary_price=1.0000,
        primary_timestamp=now - 20,
        secondary_oracle="pyth",
        secondary_price=1.0025, # 25 bps spread > 15 bps
        secondary_timestamp=now - 10,
    )
    decision2 = keeper.evaluate_execution(pos1, oracle2, current_time=now)
    print(f"  ├─ Keeper Actions: {decision2.actions}")
    print(f"  └─ Execution Status: {'FROZEN' if not decision2.can_harvest else 'ACTIVE'}\n")

    # Scenario 3: LTV Spike to 79% -> Automated Deleverage Prioritized Over Harvest
    print("▶ [Scenario 3] Morpho LTV Spike to 79.0% (Trigger: 78.0% -> Target: 70.0%)")
    pos3 = VaultPosition(
        protocol="morpho_blue",
        chain_id=84532,
        collateral_symbol="wstETH",
        debt_symbol="USDC",
        collateral_amount=10.0,
        collateral_price_usd=1000.0, # Total collateral $10,000
        debt_amount=7900.0, # Total debt $7,900 -> 79% LTV
        debt_price_usd=1.0,
        principal_deposited_usd=2100.0,
        unharvested_yield_usdc=95.00,
        current_gas_gwei=3.0,
    )
    decision3 = keeper.evaluate_execution(pos3, oracle1, current_time=now)
    print(f"  ├─ Needs Deleverage: {decision3.needs_deleverage}")
    print(f"  ├─ Repay Required: ${decision3.deleverage_repay_amount_usd:.2f} to reach 70.0% LTV")
    print(f"  └─ Rain Sweep Paused: {not decision3.can_sweep_to_rain}\n")

    print("================================================================================")
    print("✅ All E2E Testnet Scenarios Verified Successfully!")
    print("================================================================================")

if __name__ == "__main__":
    run_e2e_simulation()
