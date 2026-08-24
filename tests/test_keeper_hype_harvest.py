#!/usr/bin/env python3
"""
Unit tests for DeFi Garden HYPE Funding Harvest Keeper Engine.
Tests math bounds, decay haircut rules, oracle spread tripwire, and error handling.
"""

import unittest
from keeper.hype_funding_harvest import (
    HypeFundingHarvestEngine,
    APY_SANITY_LIMIT,
    DECAY_HAIRCUT_FACTOR,
    MAX_ORACLE_DIVERGENCE_BPS
)


class TestHypeFundingHarvestEngine(unittest.TestCase):
    def setUp(self):
        self.engine = HypeFundingHarvestEngine()

    def test_compute_funding_metrics_nominal(self):
        # 0.0001 per hour = 0.01% / hr -> 0.01% * 24 * 365 = 87.6% APR
        sample_ctx = {
            "name": "HYPE",
            "raw_ctx": {
                "funding": "0.0001",
                "openInterest": "20000000.0",
                "markPx": "50.0",
                "oraclePx": "50.02",
                "dayNtlVlm": "500000000.0",
                "prevDayPx": "48.0"
            }
        }
        metrics = self.engine.compute_funding_metrics(sample_ctx)
        
        self.assertEqual(metrics["symbol"], "HYPE")
        self.assertEqual(metrics["mark_price"], 50.0)
        self.assertEqual(metrics["oracle_price"], 50.02)
        self.assertAlmostEqual(metrics["instant_apr"], 0.876, places=3)
        self.assertAlmostEqual(metrics["instant_apr_pct"], 87.6, places=1)
        self.assertAlmostEqual(metrics["projected_30d_apr"], 0.876 * DECAY_HAIRCUT_FACTOR, places=3)
        self.assertEqual(metrics["open_interest_usd"], 1_000_000_000.0)
        self.assertTrue(metrics["is_crowded_long"])
        self.assertFalse(metrics["divergence_alert"])

    def test_oracle_divergence_tripwire(self):
        # Mark 50.0 vs Oracle 48.0 -> |50-48| / 48 = 2/48 = 4.16% = 416.6 bps > 15 bps
        sample_ctx = {
            "name": "HYPE",
            "raw_ctx": {
                "funding": "0.00005",
                "openInterest": "5000000.0",
                "markPx": "50.0",
                "oraclePx": "48.0",
                "dayNtlVlm": "100000000.0"
            }
        }
        metrics = self.engine.compute_funding_metrics(sample_ctx)
        self.assertTrue(metrics["divergence_alert"])
        self.assertGreater(metrics["basis_spread_bps"], MAX_ORACLE_DIVERGENCE_BPS)

    def test_apy_sanity_limit(self):
        # Extreme funding spike 0.01 per hour -> compounded would explode without ceiling
        sample_ctx = {
            "name": "HYPE",
            "raw_ctx": {
                "funding": "0.01",
                "openInterest": "1000000.0",
                "markPx": "50.0",
                "oraclePx": "50.0",
                "dayNtlVlm": "10000000.0"
            }
        }
        metrics = self.engine.compute_funding_metrics(sample_ctx)
        self.assertLessEqual(metrics["compounded_apy"], APY_SANITY_LIMIT)

    def test_compute_harvest_yield_delta_neutral(self):
        metrics = {
            "instant_apr": 0.50,  # 50% APR on perp
            "projected_30d_apr": 0.50 * 0.67  # 33.5% APR
        }
        # $10k total capital -> $5k spot, $5k perp short
        # Annual yield on short = $5k * 50% = $2,500
        # Net APR on total $10k capital = 25%
        yield_sim = self.engine.compute_harvest_yield(10000.0, metrics)
        
        self.assertEqual(yield_sim["capital_usd"], 10000.0)
        self.assertEqual(yield_sim["spot_allocation_usd"], 5000.0)
        self.assertEqual(yield_sim["perp_short_notional_usd"], 5000.0)
        self.assertEqual(yield_sim["annual_harvest_usd"], 2500.0)
        self.assertAlmostEqual(yield_sim["daily_harvest_usd"], 2500.0 / 365.0, places=2)
        self.assertAlmostEqual(yield_sim["monthly_harvest_usd"], 2500.0 / 12.0, places=2)
        self.assertEqual(yield_sim["instant_net_apr_pct"], 25.0)

    def test_negative_capital_raises(self):
        with self.assertRaises(ValueError):
            self.engine.compute_harvest_yield(-500.0, {"instant_apr": 0.1})


if __name__ == "__main__":
    unittest.main()
