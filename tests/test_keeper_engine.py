#!/usr/bin/env python3
"""
Unit Test Suite for DeFi Garden Keeper Engine & Risk Controls
Validates all 7 execution scenarios: healthy sweep, gas ceiling, oracle spread,
oracle staleness, LTV deleveraging trigger, sub-threshold yield, and ΔPrincipal ≡ 0 invariance.
"""

import time
import unittest
from keeper.keeper_engine import KeeperEngine

class TestKeeperEngine(unittest.TestCase):
    def setUp(self):
        self.engine = KeeperEngine()
        self.now = int(time.time())

    def test_healthy_yield_sweep(self):
        state = {
            "depositedPrincipalUsd": 4000.0,
            "totalEquityUsd": 4125.0,  # $125 yield accrued
            "collateralUsd": 4125.0,
            "debtUsd": 0.0,
            "oraclePrimaryPrice": 1.0001,
            "oracleSecondaryPrice": 1.0002,  # ~1 bps spread
            "oracleTimestamp": self.now,
            "cardDepositAddress": "0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b"
        }
        res = self.engine.evaluate_sweep(state, gas_price_gwei=4.5, now_ts=self.now)
        self.assertTrue(res["executable"])
        self.assertEqual(res["action"], "EXECUTE_RAIN_CARD_SWEEP")
        self.assertEqual(res["accruedYieldUsd"], 125.0)
        self.assertEqual(res["protocolFeeUsd"], 25.0)  # 20% cut = $25
        self.assertEqual(res["netSweepToCardUsd"], 100.0)  # $100 net to Rain card

    def test_gas_ceiling_rejection(self):
        state = {
            "depositedPrincipalUsd": 4000.0,
            "totalEquityUsd": 4200.0,
            "oraclePrimaryPrice": 1.0,
            "oracleSecondaryPrice": 1.0,
            "oracleTimestamp": self.now
        }
        # Gas 22 Gwei exceeds 15 Gwei ceiling on Base
        res = self.engine.evaluate_sweep(state, gas_price_gwei=22.0, now_ts=self.now)
        self.assertFalse(res["executable"])
        self.assertEqual(res["action"], "WAIT_FOR_GAS")

    def test_oracle_divergence_tripwire(self):
        state = {
            "depositedPrincipalUsd": 4000.0,
            "totalEquityUsd": 4200.0,
            "oraclePrimaryPrice": 1.0000,
            "oracleSecondaryPrice": 1.0030,  # 30 bps spread > 15 bps limit
            "oracleTimestamp": self.now
        }
        res = self.engine.evaluate_sweep(state, gas_price_gwei=5.0, now_ts=self.now)
        self.assertFalse(res["executable"])
        self.assertEqual(res["action"], "FREEZE_ORACLE_ANOMALY")
        self.assertGreater(res["oracleSpreadBps"], 15.0)

    def test_oracle_staleness_tripwire(self):
        state = {
            "depositedPrincipalUsd": 4000.0,
            "totalEquityUsd": 4200.0,
            "oraclePrimaryPrice": 1.0,
            "oracleSecondaryPrice": 1.0,
            "oracleTimestamp": self.now - 4000  # 4000s > 3600s staleness limit
        }
        res = self.engine.evaluate_sweep(state, gas_price_gwei=5.0, now_ts=self.now)
        self.assertFalse(res["executable"])
        self.assertEqual(res["action"], "FREEZE_ORACLE_ANOMALY")

    def test_ltv_emergency_deleverage_trigger(self):
        state = {
            "depositedPrincipalUsd": 4000.0,
            "totalEquityUsd": 5000.0,
            "collateralUsd": 10000.0,
            "debtUsd": 7900.0,  # 79% LTV >= 78% emergency trigger
            "oraclePrimaryPrice": 1.0,
            "oracleSecondaryPrice": 1.0,
            "oracleTimestamp": self.now
        }
        res = self.engine.evaluate_sweep(state, gas_price_gwei=5.0, now_ts=self.now)
        self.assertFalse(res["executable"])
        self.assertEqual(res["action"], "PRIORITIZE_DELEVERAGE")
        # Target 70% of 10,000 = 7,000 debt. Repay needed = 7900 - 7000 = $900
        self.assertEqual(res["repayRequiredUsd"], 900.0)

    def test_sub_threshold_yield(self):
        state = {
            "depositedPrincipalUsd": 4000.0,
            "totalEquityUsd": 4020.0,  # Only $20 yield < $50 threshold
            "collateralUsd": 4020.0,
            "debtUsd": 0.0,
            "oraclePrimaryPrice": 1.0,
            "oracleSecondaryPrice": 1.0,
            "oracleTimestamp": self.now
        }
        res = self.engine.evaluate_sweep(state, gas_price_gwei=5.0, now_ts=self.now)
        self.assertFalse(res["executable"])
        self.assertEqual(res["action"], "ACCUMULATE_YIELD")
        self.assertEqual(res["accruedYieldUsd"], 20.0)

    def test_principal_invariance_loss_protection(self):
        # If total equity is below principal (e.g. temporary unharvested dip), yield is 0
        state = {
            "depositedPrincipalUsd": 4000.0,
            "totalEquityUsd": 3950.0,
            "collateralUsd": 3950.0,
            "debtUsd": 0.0,
            "oraclePrimaryPrice": 1.0,
            "oracleSecondaryPrice": 1.0,
            "oracleTimestamp": self.now
        }
        res = self.engine.evaluate_sweep(state, gas_price_gwei=5.0, now_ts=self.now)
        self.assertFalse(res["executable"])
        self.assertEqual(res["accruedYieldUsd"], 0.0)
        self.assertEqual(res["action"], "ACCUMULATE_YIELD")

if __name__ == "__main__":
    unittest.main()
