import unittest
import time
import os
import sys

# Ensure defi_garden is importable
_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.dirname(_DIR)
_ROOT = os.path.dirname(_PARENT)
for p in [_ROOT, _PARENT, _DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from defi_garden.risk.risk_telemetry import RiskTelemetryEngine
except ImportError:
    from risk.risk_telemetry import RiskTelemetryEngine

class TestRiskTelemetry(unittest.TestCase):
    def setUp(self):
        self.engine = RiskTelemetryEngine()

    def test_oracle_health_ok(self):
        now = time.time()
        ok, spread, msg = self.engine.evaluate_oracle_health(
            primary_price_usd=2500.0,
            secondary_price_usd=2501.0,
            primary_timestamp=now - 60,
            secondary_timestamp=now - 30,
            current_time=now
        )
        self.assertTrue(ok)
        self.assertLess(spread, 15.0)

    def test_oracle_divergence_tripwire(self):
        now = time.time()
        ok, spread, msg = self.engine.evaluate_oracle_health(
            primary_price_usd=2500.0,
            secondary_price_usd=2510.0, # 40 bps spread
            primary_timestamp=now - 60,
            secondary_timestamp=now - 30,
            current_time=now
        )
        self.assertFalse(ok)
        self.assertGreater(spread, 15.0)

    def test_oracle_staleness(self):
        now = time.time()
        ok, spread, msg = self.engine.evaluate_oracle_health(
            primary_price_usd=2500.0,
            secondary_price_usd=2500.0,
            primary_timestamp=now - 4000, # > 3600s
            secondary_timestamp=now - 30,
            current_time=now
        )
        self.assertFalse(ok)
        self.assertIn("stale", msg)

    def test_ltv_evaluation_healthy(self):
        res = self.engine.evaluate_ltv_state(borrowed_usd=60000, collateral_usd=100000)
        self.assertTrue(res["healthy"])
        self.assertEqual(res["ltv_pct"], 60.0)

    def test_ltv_evaluation_auto_deleverage(self):
        res = self.engine.evaluate_ltv_state(borrowed_usd=79000, collateral_usd=100000)
        self.assertFalse(res["healthy"])
        self.assertEqual(res["action"], "AUTO_DELEVERAGE_REQUIRED")
        self.assertEqual(res["repay_usd_required"], 9000.0)

    def test_ltv_evaluation_emergency_unwind(self):
        res = self.engine.evaluate_ltv_state(borrowed_usd=83000, collateral_usd=100000)
        self.assertFalse(res["healthy"])
        self.assertEqual(res["action"], "IMMEDIATE_LIQUIDATION_RISK_EMERGENCY_UNWIND")

    def test_boosted_mode_demotion_low_tvl(self):
        res = self.engine.evaluate_strategy_eligibility(
            tvl_usd=50000,
            headline_apy_pct=15.0,
            rolling_7d_rates=[12, 13, 14, 15, 14],
            exit_liquidity_usd=1000000,
            total_vault_exposure_usd=100000
        )
        self.assertFalse(res["eligible"])

if __name__ == "__main__":
    unittest.main()
