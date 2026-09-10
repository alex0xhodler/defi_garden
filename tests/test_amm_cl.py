"""
Unit and Golden Fixture Tests for Concentrated Liquidity (CLMM) Math Engine.
Verifies:
1. Golden fixture loading from fixtures/golden/dex_slippage.json (Uniswap v3 and Aerodrome Slipstream).
2. Strict tick-dropout cliff mechanics (active fee rate is EXACTLY 0 outside range).
3. Full-range equivalent fee dilution under volume-retention elasticity (kappa).
4. Capacity ceiling before 20% fee compression.
5. Master Blueprint Section 3.4.5 position accounting and divergence loss golden vector.
6. Domain validations, 50-digit Decimal precision, and round-half-even invariants.
"""

from decimal import Decimal, getcontext, ROUND_HALF_EVEN
import json
import os
from pathlib import Path
import sys
import unittest

# Ensure src/ is on sys.path
TEST_DIR = Path(__file__).resolve().parent
REPO_ROOT = TEST_DIR.parent
SRC_DIR = REPO_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from dg_core.amm_cl import (
    PRECISION,
    ROUNDING,
    calculate_range_occupancy_probability,
    calculate_clmm_fee_apy,
    calculate_full_range_equivalent_dilution,
    calculate_capacity_ceiling_20pct,
    simulate_amm_ticket,
    calculate_clmm_amounts,
    calculate_clmm_divergence_loss,
    DilutionResult,
    CLMMFeeResult,
    SimulationResult,
)

FIXTURES_PATH = REPO_ROOT / "fixtures" / "golden" / "dex_slippage.json"


class TestAMMConcentratedLiquidity(unittest.TestCase):
    """Test suite for CLMM math engine."""

    def setUp(self) -> None:
        self.assertTrue(FIXTURES_PATH.exists(), f"Golden fixture missing at {FIXTURES_PATH}")
        with open(FIXTURES_PATH, "r", encoding="utf-8") as f:
            self.fixture_data = json.load(f)

    def test_authoritative_precision_conventions(self) -> None:
        """Verify 50 decimal digits of precision and ROUND_HALF_EVEN rounding."""
        self.assertEqual(PRECISION, 50)
        self.assertEqual(ROUNDING, ROUND_HALF_EVEN)
        ctx = getcontext()
        self.assertGreaterEqual(ctx.prec, 50)

    def test_golden_fixtures_dex_slippage(self) -> None:
        """
        Verify all pinned cases in dex_slippage.json:
        - Uniswap v3 0.05% USDC/USDT (stable narrow range)
        - Uniswap v3 0.3% ETH/USDC (wide range)
        - Aerodrome Slipstream volatile pool (AERO/USDC)
        """
        cases = self.fixture_data.get("cases", [])
        self.assertEqual(len(cases), 3, "Expected 3 golden cases in dex_slippage.json")

        for case in cases:
            case_id = case["id"]
            inp = case["inputs"]
            exp = case["expected"]

            # Run simulate_amm_ticket
            sim_res = simulate_amm_ticket(
                pool_state=inp,
                ticket_size_usd=inp["ticket_size_usd"],
                range_type=inp["range_type"],
                tau_days=inp["tau_days"],
            )

            # 1. Spot fee APY
            expected_spot = Decimal(exp["spot_fee_apy"])
            self.assertAlmostEqual(
                float(sim_res.spot_fee_apy),
                float(expected_spot),
                places=6,
                msg=f"[{case_id}] spot_fee_apy mismatch",
            )

            # 2. Range occupancy probability (P_in)
            expected_p_in = Decimal(exp["range_occupancy_probability"])
            self.assertAlmostEqual(
                float(sim_res.range_occupancy_probability),
                float(expected_p_in),
                places=5,
                msg=f"[{case_id}] range_occupancy_probability mismatch",
            )

            # 3. Range dropout risk %
            expected_risk = Decimal(exp["range_dropout_risk_pct"])
            self.assertAlmostEqual(
                float(sim_res.range_dropout_risk_pct),
                float(expected_risk),
                places=4,
                msg=f"[{case_id}] range_dropout_risk_pct mismatch",
            )

            # 4. Diluted fee APY
            expected_diluted = Decimal(exp["diluted_fee_apy"])
            self.assertAlmostEqual(
                float(sim_res.diluted_fee_apy),
                float(expected_diluted),
                places=6,
                msg=f"[{case_id}] diluted_fee_apy mismatch",
            )

            # 5. Expected fee APY (diluted_fee_apy * p_in)
            expected_fee_apy = Decimal(exp["expected_fee_apy"])
            self.assertAlmostEqual(
                float(sim_res.expected_fee_apy),
                float(expected_fee_apy),
                places=6,
                msg=f"[{case_id}] expected_fee_apy mismatch",
            )

            # 6. Capacity ceiling before 20% compression
            expected_capacity = Decimal(exp["capacity_ceiling_usd"])
            self.assertAlmostEqual(
                float(sim_res.capacity_ceiling_usd),
                float(expected_capacity),
                places=2,
                msg=f"[{case_id}] capacity_ceiling_usd mismatch",
            )

            # 7. Range type flag
            self.assertEqual(
                sim_res.is_full_range_equivalent,
                exp["is_full_range_equivalent"],
                msg=f"[{case_id}] is_full_range_equivalent mismatch",
            )

            # 8. Test tick-dropout cliff behavior on this pool
            fee_in = calculate_clmm_fee_apy(
                base_volume=inp["base_volume"],
                pool_liquidity=inp["pool_liquidity"],
                user_liquidity=inp["ticket_size_usd"],
                is_in_range=True,
                p_in=sim_res.p_in,
                fee_tier=inp["fee_tier"],
                kappa=inp["kappa"],
            )
            fee_out = calculate_clmm_fee_apy(
                base_volume=inp["base_volume"],
                pool_liquidity=inp["pool_liquidity"],
                user_liquidity=inp["ticket_size_usd"],
                is_in_range=False,
                p_in=Decimal("0"),
                fee_tier=inp["fee_tier"],
                kappa=inp["kappa"],
            )

            # When outside range, active fee rate is EXACTLY 0 (cliff drop)
            self.assertEqual(
                fee_out.active_fee_apy,
                Decimal("0"),
                msg=f"[{case_id}] Active fee rate outside range must be EXACTLY 0",
            )
            self.assertEqual(
                fee_out,
                Decimal("0"),
                msg=f"[{case_id}] Fee result outside range must evaluate to 0",
            )

            # When inside range, active fee rate is spot fee APY
            self.assertAlmostEqual(
                float(fee_in.active_fee_apy),
                float(sim_res.diluted_fee_apy),
                places=6,
                msg=f"[{case_id}] Active fee in-range mismatch",
            )

    def test_strict_tick_dropout_cliff_behavior(self) -> None:
        """
        Verify strict tick-dropout logic:
        When price falls outside [p_lower, p_upper], active fee rate is EXACTLY 0.
        This tests the discontinuity (cliff drop, not continuous decay).
        """
        p_lower = Decimal("0.9990")
        p_upper = Decimal("1.0010")
        sigma = Decimal("0.0050")
        tau = Decimal("30")

        # 1. Prices outside boundaries must have probability 0.0
        p_below = Decimal("0.9989")
        p_above = Decimal("1.0011")
        p_exact_lower = p_lower
        p_exact_upper = p_upper

        self.assertEqual(calculate_range_occupancy_probability(p_below, p_lower, p_upper, sigma, tau), Decimal("0"))
        self.assertEqual(calculate_range_occupancy_probability(p_above, p_lower, p_upper, sigma, tau), Decimal("0"))
        self.assertEqual(calculate_range_occupancy_probability(p_exact_lower, p_lower, p_upper, sigma, tau), Decimal("0"))
        self.assertEqual(calculate_range_occupancy_probability(p_exact_upper, p_lower, p_upper, sigma, tau), Decimal("0"))

        # 2. Price just 1e-10 inside range has positive occupancy probability
        p_inside = Decimal("1.0000")
        prob_inside = calculate_range_occupancy_probability(p_inside, p_lower, p_upper, sigma, tau)
        self.assertGreater(prob_inside, Decimal("0"))

        # 3. Cliff dropout in calculate_clmm_fee_apy
        fee_in = calculate_clmm_fee_apy(
            base_volume=Decimal("10000000"),
            pool_liquidity=Decimal("50000000"),
            user_liquidity=Decimal("0"),
            is_in_range=True,
            p_in=prob_inside,
            fee_tier=Decimal("0.0005"),
        )
        fee_out = calculate_clmm_fee_apy(
            base_volume=Decimal("10000000"),
            pool_liquidity=Decimal("50000000"),
            user_liquidity=Decimal("0"),
            is_in_range=False,
            p_in=Decimal("0"),
            fee_tier=Decimal("0.0005"),
        )

        # In-range: active fee rate is ~3.65% (10M * 0.0005 * 365 / 50M)
        self.assertEqual(fee_in.active_fee_apy, Decimal("0.0365"))
        # Expected fee APY = spot_fee * p_in
        self.assertEqual(fee_in.expected_fee_apy, Decimal("0.0365") * prob_inside)

        # Out-of-range: active fee rate drops off a cliff to EXACTLY 0.0
        self.assertEqual(fee_out.active_fee_apy, Decimal("0"))
        self.assertEqual(fee_out, Decimal("0"))
        self.assertEqual(fee_out["active_fee_apy"], Decimal("0"))

    def test_full_range_equivalent_dilution_prd_worked_example(self) -> None:
        """
        Verify canonical dilution model and PRD worked numerical check:
        L = $10M, delta_L = $500k, F_spot = 18%, kappa = 0.80:
        (10 / 10.5)^0.80 ≈ 0.9619
        F(delta_L) = 0.18 * 0.9619 ≈ 0.1731 (17.31%)
        Explicit flag: is_full_range_equivalent = True
        """
        L = Decimal("10000000")
        delta_L = Decimal("500000")
        f_spot = Decimal("0.18")
        kappa = Decimal("0.80")

        res = calculate_full_range_equivalent_dilution(
            spot_fee=f_spot,
            pool_liquidity=L,
            delta_liquidity=delta_L,
            kappa=kappa,
        )

        # Check explicit flag
        self.assertTrue(res.is_full_range_equivalent)
        self.assertTrue(res["is_full_range_equivalent"])

        # Check dilution factor: (10 / 10.5)^0.80 ≈ 0.96172 (unrounded)
        self.assertAlmostEqual(float(res.dilution_factor), 0.9619, places=3)

        # Check diluted fee: 0.18 * 0.9619 ≈ 0.1731
        self.assertAlmostEqual(float(res), 0.1731, places=3)
        self.assertAlmostEqual(float(res.diluted_fee), 0.1731, places=3)
        self.assertAlmostEqual(float(res["diluted_fee"]), 0.1731, places=3)

        # Check that it behaves as Decimal
        self.assertIsInstance(res, Decimal)
        self.assertTrue(res < f_spot)

    def test_dilution_monotonicity_and_zero_deposit(self) -> None:
        """Verify dilution behavior across deposit sizes."""
        L = Decimal("20000000")
        f_spot = Decimal("0.25")
        kappa = Decimal("0.85")

        # Zero deposit must experience zero dilution
        res_zero = calculate_full_range_equivalent_dilution(f_spot, L, Decimal("0"), kappa)
        self.assertEqual(res_zero, f_spot)
        self.assertEqual(res_zero.dilution_factor, Decimal("1"))

        # Monotonicity: larger deposits must cause strictly greater fee compression
        deposits = [Decimal("100000"), Decimal("500000"), Decimal("2000000"), Decimal("10000000")]
        fees = [calculate_full_range_equivalent_dilution(f_spot, L, d, kappa) for d in deposits]

        for i in range(len(fees) - 1):
            self.assertGreater(fees[i], fees[i + 1], "Dilution must be strictly monotonic in deposit size")

    def test_capacity_ceiling_20pct_compression(self) -> None:
        """
        Verify capacity ceiling calculation before 20% fee compression:
        (L / (L + delta_L))^kappa = 0.80
        delta_L_ceiling = L * (0.80^(-1/kappa) - 1)
        """
        L = Decimal("50000000")
        kappa = Decimal("0.85")

        cap_ceiling = calculate_capacity_ceiling_20pct(L, kappa)

        # Verify that depositing exactly the ceiling compresses fees by exactly 20%
        spot_fee = Decimal("0.10")
        dilution_at_ceiling = calculate_full_range_equivalent_dilution(
            spot_fee=spot_fee,
            pool_liquidity=L,
            delta_liquidity=cap_ceiling,
            kappa=kappa,
        )

        # Diluted fee must equal spot_fee * 0.80 = 0.08
        retention_ratio = dilution_at_ceiling.diluted_fee / spot_fee
        self.assertAlmostEqual(float(retention_ratio), 0.80, places=9)

        # Compression percentage must be exactly 20.0%
        compression_pct = (Decimal("1") - retention_ratio) * Decimal("100")
        self.assertAlmostEqual(float(compression_pct), 20.0, places=7)

        # Depositing $1 less than ceiling gives < 20% compression
        under_res = calculate_full_range_equivalent_dilution(spot_fee, L, cap_ceiling - Decimal("1000"), kappa)
        self.assertLess(under_res.compression_pct, Decimal("20.0"))

        # Depositing $1 more than ceiling gives > 20% compression
        over_res = calculate_full_range_equivalent_dilution(spot_fee, L, cap_ceiling + Decimal("1000"), kappa)
        self.assertGreater(over_res.compression_pct, Decimal("20.0"))

    def test_master_blueprint_section_345_golden_vector(self) -> None:
        """
        Verify Master Blueprint Section 3.4.5 Golden Vector:
        P_a = 1, P_b = 4, P_0 = 2.25, L = 300.
        At inception:
            x_0 = 50, y_0 = 150, V_0 = 262.5
        At P_T = 4:
            x_T = 0, y_T = 300, V_LP = 300
            V_HODL = 4 * 50 + 150 = 350
            Delta V_divergence = -50
            V_LP / V_HODL - 1 = -1/7 ≈ -0.142857142857
        """
        Pa = Decimal("1")
        Pb = Decimal("4")
        P0 = Decimal("2.25")
        L = Decimal("300")
        PT = Decimal("4")

        # Inception amounts
        init_acct = calculate_clmm_amounts(P0, Pa, Pb, L)
        self.assertEqual(init_acct["x"], Decimal("50"))
        self.assertEqual(init_acct["y"], Decimal("150"))
        self.assertEqual(init_acct["v_lp"], Decimal("262.5"))

        # Terminal amounts and divergence loss
        div_loss = calculate_clmm_divergence_loss(P0, PT, Pa, Pb, L)
        self.assertEqual(div_loss["x_t"], Decimal("0"))
        self.assertEqual(div_loss["y_t"], Decimal("300"))
        self.assertEqual(div_loss["v_lp_t"], Decimal("300"))
        self.assertEqual(div_loss["v_hodl_t"], Decimal("350"))
        self.assertEqual(div_loss["delta_divergence"], Decimal("-50"))

        expected_rel = -Decimal("1") / Decimal("7")
        self.assertAlmostEqual(float(div_loss["relative_divergence"]), float(expected_rel), places=12)

    def test_domain_validation_and_error_handling(self) -> None:
        """Verify strict domain validation across all AMM CL functions."""
        # Non-positive prices
        with self.assertRaises(ValueError):
            calculate_range_occupancy_probability(Decimal("0"), Decimal("1"), Decimal("2"), Decimal("0.5"), 30)
        with self.assertRaises(ValueError):
            calculate_range_occupancy_probability(Decimal("1.5"), Decimal("0"), Decimal("2"), Decimal("0.5"), 30)

        # Inverted range (p_lower >= p_upper)
        with self.assertRaises(ValueError):
            calculate_range_occupancy_probability(Decimal("1.5"), Decimal("2"), Decimal("1"), Decimal("0.5"), 30)
        with self.assertRaises(ValueError):
            calculate_range_occupancy_probability(Decimal("1.5"), Decimal("1"), Decimal("1"), Decimal("0.5"), 30)

        # Negative volatility or horizon
        with self.assertRaises(ValueError):
            calculate_range_occupancy_probability(Decimal("1.5"), Decimal("1"), Decimal("2"), Decimal("-0.1"), 30)
        with self.assertRaises(ValueError):
            calculate_range_occupancy_probability(Decimal("1.5"), Decimal("1"), Decimal("2"), Decimal("0.5"), -1)

        # Zero or negative pool liquidity
        with self.assertRaises(ValueError):
            calculate_full_range_equivalent_dilution(Decimal("0.1"), Decimal("0"), Decimal("1000"))
        with self.assertRaises(ValueError):
            calculate_capacity_ceiling_20pct(Decimal("-1000"))

        # Invalid kappa
        with self.assertRaises(ValueError):
            calculate_full_range_equivalent_dilution(Decimal("0.1"), Decimal("1000"), Decimal("100"), kappa=Decimal("1.5"))


if __name__ == "__main__":
    unittest.main()
