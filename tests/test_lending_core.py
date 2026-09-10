import json
import os
import sys
import unittest
from decimal import Decimal, Context, ROUND_HALF_EVEN

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from dg_core.lending import (
    PRECISION,
    ROUNDING,
    to_decimal,
    calculate_utilization,
    calculate_borrow_rate,
    calculate_supply_apy,
    calculate_w_kink_frozen,
    calculate_w_max_atomic,
    calculate_w_kink_scenario,
    evaluate_lending_pool,
)

FIXTURES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "fixtures", "golden")
)


class TestLendingMathCore(unittest.TestCase):
    def setUp(self):
        self.kink_fixtures_path = os.path.join(FIXTURES_DIR, "lending_kink.json")
        self.liquidation_fixtures_path = os.path.join(
            FIXTURES_DIR, "lending_liquidation.json"
        )
        with open(self.kink_fixtures_path, "r") as f:
            self.kink_fixtures = json.load(f)
        with open(self.liquidation_fixtures_path, "r") as f:
            self.liquidation_fixtures = json.load(f)

    def test_precision_configuration(self):
        """Ensure core is configured for 50 digits of precision with ROUND_HALF_EVEN."""
        self.assertEqual(PRECISION, 50)
        self.assertEqual(ROUNDING, ROUND_HALF_EVEN)

    def test_golden_fixtures_kink(self):
        """Verify all pinned protocol fixtures in lending_kink.json with zero float drift."""
        for case in self.kink_fixtures["cases"]:
            with self.subTest(fixture_id=case["id"]):
                inputs = case["inputs"]
                expected = case["expected"]

                ticket_size = Decimal(inputs.get("ticket_size", "0"))
                pool_state = {
                    "supply": inputs["supply"],
                    "borrows": inputs["borrows"],
                    "kink": inputs["kink"],
                    "r0": inputs["r0"],
                    "r1": inputs["r1"],
                    "r2": inputs["r2"],
                    "reserve_factor": inputs["reserve_factor"],
                    "beta_repay": inputs.get("beta_repay", "0"),
                    "lambda_looper": inputs.get("lambda_looper", "0"),
                    "gamma_flow": inputs.get("gamma_flow", "0"),
                    "is_stale": inputs.get("is_stale", False),
                }

                result = evaluate_lending_pool(pool_state, ticket_size)

                for key, expected_val in expected.items():
                    actual_val = result[key]
                    if isinstance(actual_val, Decimal):
                        self.assertEqual(
                            actual_val,
                            Decimal(expected_val),
                            f"Discrepancy in {case['id']} for key {key}: actual {actual_val} != expected {expected_val}",
                        )
                    else:
                        self.assertEqual(
                            actual_val,
                            expected_val,
                            f"Discrepancy in {case['id']} for key {key}: actual {actual_val} != expected {expected_val}",
                        )

    def test_golden_fixtures_liquidation_and_edge_cases(self):
        """Verify all edge cases in lending_liquidation.json with zero float drift."""
        for case in self.liquidation_fixtures["cases"]:
            with self.subTest(fixture_id=case["id"]):
                inputs = case["inputs"]
                expected = case["expected"]

                ticket_size = Decimal(inputs.get("ticket_size", "0"))
                pool_state = {
                    "supply": inputs["supply"],
                    "borrows": inputs["borrows"],
                    "kink": inputs["kink"],
                    "r0": inputs["r0"],
                    "r1": inputs["r1"],
                    "r2": inputs["r2"],
                    "reserve_factor": inputs["reserve_factor"],
                    "beta_repay": inputs.get("beta_repay", "0"),
                    "lambda_looper": inputs.get("lambda_looper", "0"),
                    "gamma_flow": inputs.get("gamma_flow", "0"),
                    "is_stale": inputs.get("is_stale", False),
                }

                result = evaluate_lending_pool(pool_state, ticket_size)

                for key, expected_val in expected.items():
                    actual_val = result[key]
                    if isinstance(actual_val, Decimal):
                        self.assertEqual(
                            actual_val,
                            Decimal(expected_val),
                            f"Discrepancy in {case['id']} for key {key}: actual {actual_val} != expected {expected_val}",
                        )
                    else:
                        self.assertEqual(
                            actual_val,
                            expected_val,
                            f"Discrepancy in {case['id']} for key {key}: actual {actual_val} != expected {expected_val}",
                        )

    def test_calculate_utilization_basic_and_boundaries(self):
        """Test calculate_utilization across valid and edge inputs."""
        # 0 borrows, positive supply
        self.assertEqual(
            calculate_utilization(Decimal("0"), Decimal("100")),
            Decimal("0"),
        )
        # Standard fraction
        self.assertEqual(
            calculate_utilization(Decimal("80"), Decimal("100")),
            Decimal("0.8"),
        )
        # 100% utilization
        self.assertEqual(
            calculate_utilization(Decimal("100"), Decimal("100")),
            Decimal("1.0"),
        )
        # Zero supply and zero borrows
        self.assertEqual(
            calculate_utilization(Decimal("0"), Decimal("0")),
            Decimal("0"),
        )
        # Negative supply or borrows must raise ValueError
        with self.assertRaises(ValueError):
            calculate_utilization(Decimal("-1"), Decimal("100"))
        with self.assertRaises(ValueError):
            calculate_utilization(Decimal("10"), Decimal("-100"))
        # Positive borrows with zero supply must raise ValueError
        with self.assertRaises(ValueError):
            calculate_utilization(Decimal("50"), Decimal("0"))

    def test_calculate_borrow_rate_jump_rate_model(self):
        """Test piecewise linear jump rate model below, at, and above kink."""
        kink = Decimal("0.80")
        r0 = Decimal("0.02")
        r1 = Decimal("0.10")
        r2 = Decimal("1.00")

        # At U = 0: b(0) = r0 = 0.02
        self.assertEqual(
            calculate_borrow_rate(Decimal("0"), kink, r0, r1, r2),
            Decimal("0.02"),
        )
        # Below kink: U = 0.40 -> 0.02 + 0.10 * (0.40 / 0.80) = 0.02 + 0.05 = 0.07
        self.assertEqual(
            calculate_borrow_rate(Decimal("0.40"), kink, r0, r1, r2),
            Decimal("0.07"),
        )
        # Exactly at kink: U = 0.80 -> 0.02 + 0.10 = 0.12
        self.assertEqual(
            calculate_borrow_rate(Decimal("0.80"), kink, r0, r1, r2),
            Decimal("0.12"),
        )
        # Above kink: U = 0.85 -> 0.02 + 0.10 + 1.00 * (0.05 / 0.20) = 0.12 + 0.25 = 0.37
        self.assertEqual(
            calculate_borrow_rate(Decimal("0.85"), kink, r0, r1, r2),
            Decimal("0.37"),
        )
        # At U = 1.0: 0.02 + 0.10 + 1.00 = 1.12
        self.assertEqual(
            calculate_borrow_rate(Decimal("1.0"), kink, r0, r1, r2),
            Decimal("1.12"),
        )

        # Invalid bounds
        with self.assertRaises(ValueError):
            calculate_borrow_rate(Decimal("-0.01"), kink, r0, r1, r2)
        with self.assertRaises(ValueError):
            calculate_borrow_rate(Decimal("1.01"), kink, r0, r1, r2)
        with self.assertRaises(ValueError):
            calculate_borrow_rate(Decimal("0.5"), Decimal("0"), r0, r1, r2)
        with self.assertRaises(ValueError):
            calculate_borrow_rate(Decimal("0.5"), Decimal("1.5"), r0, r1, r2)

    def test_calculate_supply_apy(self):
        """Test supply APY calculation: U * borrow_rate * (1 - reserve_factor)."""
        u = Decimal("0.75")
        borrow_rate = Decimal("0.11375")
        rf = Decimal("0.10")

        expected = u * borrow_rate * (Decimal("1") - rf)
        self.assertEqual(calculate_supply_apy(u, borrow_rate, rf), expected)

        # Zero reserve factor
        self.assertEqual(
            calculate_supply_apy(Decimal("0.5"), Decimal("0.10"), Decimal("0")),
            Decimal("0.05"),
        )
        # 100% reserve factor -> 0 supply rate
        self.assertEqual(
            calculate_supply_apy(Decimal("0.5"), Decimal("0.10"), Decimal("1.0")),
            Decimal("0"),
        )
        # Invalid reserve factor
        with self.assertRaises(ValueError):
            calculate_supply_apy(Decimal("0.5"), Decimal("0.10"), Decimal("-0.1"))
        with self.assertRaises(ValueError):
            calculate_supply_apy(Decimal("0.5"), Decimal("0.10"), Decimal("1.1"))

    def test_calculate_w_kink_frozen_golden_vector(self):
        """Test frozen-state headroom against Section 3.2 golden vector: S=100, D=80, U*=0.9 -> 100/9."""
        supply = Decimal("100")
        utilization = Decimal("0.8")
        kink = Decimal("0.9")

        w_frozen = calculate_w_kink_frozen(supply, utilization, kink)
        expected = Decimal("100") / Decimal("9")
        self.assertEqual(w_frozen, expected)

        # At or above kink returns 0
        self.assertEqual(
            calculate_w_kink_frozen(supply, Decimal("0.9"), kink),
            Decimal("0"),
        )
        self.assertEqual(
            calculate_w_kink_frozen(supply, Decimal("0.95"), kink),
            Decimal("0"),
        )

    def test_calculate_w_max_atomic(self):
        """Test atomic cash available: S * (1 - U)."""
        supply = Decimal("1000")
        self.assertEqual(
            calculate_w_max_atomic(supply, Decimal("0.75")),
            Decimal("250"),
        )
        self.assertEqual(
            calculate_w_max_atomic(supply, Decimal("1.0")),
            Decimal("0"),
        )
        self.assertEqual(
            calculate_w_max_atomic(supply, Decimal("0")),
            Decimal("1000"),
        )

    def test_calculate_w_kink_scenario_dynamics(self):
        """Test scenario-based kink headroom with repayment, looper redemption, and flow."""
        supply = Decimal("100")
        borrows = Decimal("80")
        kink = Decimal("0.9")

        # 1. Zero flow feedback matches frozen state exactly
        w_frozen_equiv = calculate_w_kink_scenario(
            supply, borrows, kink, Decimal("0"), Decimal("0"), Decimal("0")
        )
        self.assertEqual(w_frozen_equiv, Decimal("100") / Decimal("9"))

        # 2. External repayment (beta=0.2, lambda=0, gamma=0) -> 10 / 0.7 = 100 / 7
        w_ext = calculate_w_kink_scenario(
            supply, borrows, kink, Decimal("0.2"), Decimal("0"), Decimal("0")
        )
        self.assertEqual(w_ext, Decimal("10") / Decimal("0.7"))

        # 3. Looper redemption (beta=0.2, lambda=1.0, gamma=0) -> 10 / 0.88 = 125 / 11
        w_looper = calculate_w_kink_scenario(
            supply, borrows, kink, Decimal("0.2"), Decimal("1.0"), Decimal("0")
        )
        self.assertEqual(w_looper, Decimal("10") / Decimal("0.88"))

        # 4. Already at or above kink returns 0
        self.assertEqual(
            calculate_w_kink_scenario(
                Decimal("100"), Decimal("95"), kink, Decimal("0.2"), Decimal("0"), Decimal("0")
            ),
            Decimal("0"),
        )

        # 5. Nonpositive denominator raises ValueError as required by Astra Judge
        with self.assertRaises(ValueError):
            calculate_w_kink_scenario(
                supply, borrows, Decimal("0.5"), Decimal("0.8"), Decimal("0"), Decimal("0")
            )

    def test_evaluate_lending_pool_traffic_lights(self):
        """Verify traffic light logic: GREEN (<= W/2), AMBER (<= W), RED (> W), UNKNOWN (stale)."""
        pool_state = {
            "supply": Decimal("1000000"),
            "borrows": Decimal("750000"),
            "kink": Decimal("0.80"),
            "r0": Decimal("0.02"),
            "r1": Decimal("0.10"),
            "r2": Decimal("1.00"),
            "reserve_factor": Decimal("0.10"),
        }
        # W_kink_frozen = 1000000 * (1 - 0.75 / 0.80) = 62500
        # W/2 = 31250

        # GREEN: ticket = 20000 <= 31250
        res_green = evaluate_lending_pool(pool_state, Decimal("20000"))
        self.assertEqual(res_green["traffic_light"], "GREEN")

        # AMBER: ticket = 45000 (31250 < ticket <= 62500)
        res_amber = evaluate_lending_pool(pool_state, Decimal("45000"))
        self.assertEqual(res_amber["traffic_light"], "AMBER")

        # RED: ticket = 70000 (> 62500)
        res_red = evaluate_lending_pool(pool_state, Decimal("70000"))
        self.assertEqual(res_red["traffic_light"], "RED")

        # UNKNOWN: data is stale
        stale_state = dict(pool_state)
        stale_state["is_stale"] = True
        res_stale = evaluate_lending_pool(stale_state, Decimal("20000"))
        self.assertEqual(res_stale["traffic_light"], "UNKNOWN")

    def test_post_deposit_dilution_mechanics(self):
        """Test post-deposit utilization and supply APY dilution mechanics."""
        pool_state = {
            "supply": Decimal("1000000"),
            "borrows": Decimal("750000"),
            "kink": Decimal("0.80"),
            "r0": Decimal("0.02"),
            "r1": Decimal("0.10"),
            "r2": Decimal("1.00"),
            "reserve_factor": Decimal("0.10"),
        }
        ticket = Decimal("100000")
        res = evaluate_lending_pool(pool_state, ticket)

        # Before deposit: U = 0.75, br = 0.11375, sr = 0.07678125
        self.assertEqual(res["current_utilization"], Decimal("0.75"))
        self.assertEqual(res["current_borrow_rate"], Decimal("0.11375"))
        self.assertEqual(res["current_supply_apy"], Decimal("0.07678125"))

        # After deposit: S' = 1100000, D' = 750000 -> U' = 750000 / 1100000 = 15 / 22
        expected_u = Decimal("750000") / Decimal("1100000")
        self.assertEqual(res["post_deposit_utilization"], expected_u)
        self.assertTrue(res["post_deposit_utilization"] < res["current_utilization"])
        self.assertTrue(res["post_deposit_supply_apy"] < res["current_supply_apy"])


if __name__ == "__main__":
    unittest.main()
