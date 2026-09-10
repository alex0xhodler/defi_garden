"""
Test suite for Pendle Spread Decomposition and Regulatory-Shielded Schemas.
Verifies deterministic mathematical execution, golden fixtures,
neutral taxonomy compliance, and schema validation.
"""

import json
import math
import os
import sys
import unittest
import warnings

# Ensure local source tree is importable
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
src_path = os.path.join(repo_root, "src")
if src_path not in sys.path:
    sys.path.insert(0, src_path)
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from jsonschema import Draft202012Validator, validate, ValidationError

from dg_core.pendle import (
    decompose_pendle_spread,
    normalize_pt_yield,
    compute_pt_spread,
    TAXONOMY_OBSERVED,
    TAXONOMY_CONTRACTUAL_AS_OBSERVED,
    TAXONOMY_MECHANICAL_CONDITIONAL,
    TAXONOMY_STATISTICAL_FORECAST,
    TAXONOMY_CALLER_SCENARIO,
    TAXONOMY_UNMODELED,
    TAXONOMY_EXOGENOUS_POINTS_UNMODELED,
    MaturityMismatchWarning,
)


class TestPendleSpreadDecomposition(unittest.TestCase):
    """Tests for decompose_pendle_spread deterministic calculations."""

    def test_spread_decomposition_without_points(self):
        """Calculates delta_total and delta_organic with no points campaign."""
        implied_apy = 0.08
        fair_forward_apy = 0.10
        maturity_days = 30
        forecast_horizon_days = 30

        result = decompose_pendle_spread(
            implied_apy=implied_apy,
            fair_forward_apy=fair_forward_apy,
            maturity_days=maturity_days,
            forecast_horizon_days=forecast_horizon_days,
            has_points_campaign=False,
            estimated_points_apy=0.0,
        )

        self.assertAlmostEqual(result["delta_total"], 0.02, places=6)
        self.assertAlmostEqual(result["delta_organic"], 0.02, places=6)
        self.assertFalse(result["flag_unmodeled_points"])
        self.assertEqual(result["points_category"], "NONE")
        self.assertEqual(result["taxonomy"]["implied_apy"], TAXONOMY_OBSERVED)
        self.assertEqual(result["taxonomy"]["fair_forward_apy"], TAXONOMY_STATISTICAL_FORECAST)
        self.assertEqual(result["taxonomy"]["delta_total"], TAXONOMY_MECHANICAL_CONDITIONAL)
        self.assertEqual(result["taxonomy"]["delta_organic"], TAXONOMY_MECHANICAL_CONDITIONAL)
        self.assertEqual(result["warning_codes"], [])

    def test_spread_decomposition_with_points_campaign(self):
        """Verifies delta_organic and mandatory risk flag when points campaign is active."""
        implied_apy = 0.12
        fair_forward_apy = 0.09
        maturity_days = 60
        forecast_horizon_days = 60
        estimated_points_apy = 0.04

        result = decompose_pendle_spread(
            implied_apy=implied_apy,
            fair_forward_apy=fair_forward_apy,
            maturity_days=maturity_days,
            forecast_horizon_days=forecast_horizon_days,
            has_points_campaign=True,
            estimated_points_apy=estimated_points_apy,
        )

        # delta_total = 0.09 - 0.12 = -0.03
        self.assertAlmostEqual(result["delta_total"], -0.03, places=6)
        # delta_organic = 0.09 - (0.12 - 0.04) = 0.09 - 0.08 = 0.01
        self.assertAlmostEqual(result["delta_organic"], 0.01, places=6)
        self.assertTrue(result["flag_unmodeled_points"])
        self.assertEqual(result["points_category"], TAXONOMY_EXOGENOUS_POINTS_UNMODELED)
        self.assertEqual(
            result["taxonomy"]["estimated_points_apy"],
            TAXONOMY_EXOGENOUS_POINTS_UNMODELED,
        )

    def test_maturity_matching_tolerance_within_bounds(self):
        """Tolerates tenor delta <= 3 days without warning or error."""
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            result = decompose_pendle_spread(
                implied_apy=0.08,
                fair_forward_apy=0.10,
                maturity_days=30,
                forecast_horizon_days=32,  # delta = 2 <= 3
            )
            self.assertEqual(len(captured), 0)
            self.assertEqual(result["warning_codes"], [])
            self.assertAlmostEqual(result["maturity_delta_days"], 2.0)

    def test_maturity_matching_deviation_warning(self):
        """Emits MaturityMismatchWarning when tenor delta > 3 days in default mode."""
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            result = decompose_pendle_spread(
                implied_apy=0.08,
                fair_forward_apy=0.10,
                maturity_days=30,
                forecast_horizon_days=35,  # delta = 5 > 3
                strict=False,
            )
            self.assertEqual(len(captured), 1)
            self.assertTrue(issubclass(captured[-1].category, MaturityMismatchWarning))
            self.assertIn("MATURITY_HORIZON_MISMATCH", result["warning_codes"])
            self.assertAlmostEqual(result["maturity_delta_days"], 5.0)

    def test_maturity_matching_deviation_strict_error(self):
        """Raises ValueError when tenor delta > 3 days with strict=True."""
        with self.assertRaises(ValueError) as ctx:
            decompose_pendle_spread(
                implied_apy=0.08,
                fair_forward_apy=0.10,
                maturity_days=30,
                forecast_horizon_days=35,
                strict=True,
            )
        self.assertIn("exceeding the 3-day tolerance", str(ctx.exception))

    def test_invalid_tenor_raises(self):
        """Rejects non-positive maturity or horizon."""
        with self.assertRaises(ValueError):
            decompose_pendle_spread(0.05, 0.05, maturity_days=0, forecast_horizon_days=30)
        with self.assertRaises(ValueError):
            decompose_pendle_spread(0.05, 0.05, maturity_days=30, forecast_horizon_days=-5)

    def test_zero_evaluative_adjectives_in_output(self):
        """Enforces regulatory shield: zero promotional or evaluative adjectives in output."""
        result = decompose_pendle_spread(
            implied_apy=0.08,
            fair_forward_apy=0.10,
            maturity_days=30,
            forecast_horizon_days=30,
            has_points_campaign=True,
            estimated_points_apy=0.02,
        )

        banned_words = [
            "favorable",
            "arbitrage",
            "attractive",
            "cheap",
            "rich",
            "overvalued",
            "undervalued",
            "bargain",
            "profitable",
            "best",
            "worst",
            "recommend",
            "alpha",
        ]

        serialized = json.dumps(result).lower()
        for word in banned_words:
            self.assertNotIn(
                word,
                serialized,
                f"Evaluative adjective '{word}' detected in output payload.",
            )


class TestPendlePTGoldenFixture(unittest.TestCase):
    """Validates PT yield normalization against Master Blueprint Section 3.6.3."""

    def test_pt_golden_fixture_3_6_3(self):
        """
        Master Blueprint Section 3.6.3 Golden Fixture:
        P_{PT,U} = 0.95, q_{T,U} = 1, K_U = 0, \tau = 0.5.
        y_{PT,U} = (1 / 0.95)^2 - 1 = 39 / 361 ≈ 0.108033240997.
        With y_{B,U} = 0.05 (5% benchmark):
        s_{simple,bps} = 10^4 * (39/361 - 0.05) ≈ 580.332410 bps.
        """
        pt_cost = 0.95
        redemption = 1.0
        cost = 0.0
        tau = 0.5
        benchmark = 0.05

        expected_yield = 39.0 / 361.0
        calculated_yield = normalize_pt_yield(
            pt_acquisition_cost_u=pt_cost,
            redemption_u=redemption,
            cost_u=cost,
            tau_years=tau,
        )
        self.assertAlmostEqual(calculated_yield, expected_yield, places=9)

        spread_res = compute_pt_spread(
            pt_yield=calculated_yield,
            benchmark_yield=benchmark,
            tau_years=tau,
            pt_acquisition_cost_u=pt_cost,
            redemption_u=redemption,
            cost_u=cost,
        )

        expected_simple_bps = 10000.0 * (expected_yield - benchmark)
        self.assertAlmostEqual(
            spread_res["s_simple_bps"],
            expected_simple_bps,
            places=5,
        )
        self.assertAlmostEqual(spread_res["s_simple_bps"], 580.332410, places=4)

        # Log spread
        expected_log_bps = 10000.0 * (
            math.log(redemption / pt_cost) / tau - math.log(1.0 + benchmark)
        )
        self.assertAlmostEqual(spread_res["s_log_bps"], expected_log_bps, places=5)

    def test_golden_fixtures_json_file(self):
        """Validates all cases in fixtures/golden/pendle_pt.json."""
        fixture_path = os.path.join(repo_root, "fixtures", "golden", "pendle_pt.json")
        with open(fixture_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        for case in data["fixtures"]:
            cid = case["id"]
            inp = case["inputs"]
            exp = case["expected"]
            if cid == "blueprint_3_6_3_pt_fixture":
                y = normalize_pt_yield(
                    pt_acquisition_cost_u=inp["pt_acquisition_cost_u"],
                    redemption_u=inp["redemption_u"],
                    cost_u=inp["cost_u"],
                    tau_years=inp["tau_years"],
                )
                self.assertAlmostEqual(y, exp["pt_yield"], places=9)
                spread = compute_pt_spread(
                    pt_yield=y,
                    benchmark_yield=inp["benchmark_yield"],
                    tau_years=inp["tau_years"],
                    pt_acquisition_cost_u=inp["pt_acquisition_cost_u"],
                    redemption_u=inp["redemption_u"],
                    cost_u=inp["cost_u"],
                )
                self.assertAlmostEqual(spread["s_simple_bps"], exp["s_simple_bps"], places=5)
                self.assertAlmostEqual(spread["s_log_bps"], exp["s_log_bps"], places=5)
            else:
                res = decompose_pendle_spread(
                    implied_apy=inp["implied_apy"],
                    fair_forward_apy=inp["fair_forward_apy"],
                    maturity_days=inp["maturity_days"],
                    forecast_horizon_days=inp["forecast_horizon_days"],
                    has_points_campaign=inp["has_points_campaign"],
                    estimated_points_apy=inp["estimated_points_apy"],
                )
                self.assertAlmostEqual(res["delta_total"], exp["delta_total"], places=6)
                self.assertAlmostEqual(res["delta_organic"], exp["delta_organic"], places=6)
                self.assertEqual(res["flag_unmodeled_points"], exp["flag_unmodeled_points"])
                self.assertEqual(res["points_category"], exp["points_category"])
                self.assertEqual(res["warning_codes"], exp["warning_codes"])



class TestRegulatoryShieldedSchemas(unittest.TestCase):
    """Validates schemas and sample payloads against Draft 2020-12 specifications."""

    def setUp(self):
        self.schemas_dir = os.path.join(repo_root, "schemas")

    def _load_schema(self, filename):
        path = os.path.join(self.schemas_dir, filename)
        with open(path, "r", encoding="utf-8") as f:
            schema = json.load(f)
        Draft202012Validator.check_schema(schema)
        return schema

    def test_snapshot_bundle_schema_valid_payload(self):
        """Validates a strictly pinned content-addressed snapshot manifest."""
        schema = self._load_schema("snapshot_bundle.schema.json")
        payload = {
            "git_sha": "a1b2c3d4e5f6789012345678901234567890abcd",
            "as_of_block": 21000000,
            "run_id": "run_20260910_01",
            "hash": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            "timestamp_utc": "2026-09-10T12:00:00Z",
            "chain_id": 1,
            "block_hash": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            "status": "SEALED",
            "shards": {
                "0x1234567890abcdef1234567890abcdef12345678": {
                    "path": "/shards/0x1234.a1b2c3.json",
                    "content_hash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
                    "size_bytes": 4096,
                    "protocol": "pendle",
                    "market_id": "0x1234567890abcdef1234567890abcdef12345678",
                }
            },
        }
        validate(instance=payload, schema=schema)

    def test_snapshot_bundle_schema_rejects_missing_required(self):
        """Rejects snapshot bundle missing required cryptographic pinning fields."""
        schema = self._load_schema("snapshot_bundle.schema.json")
        payload = {
            "as_of_block": 21000000,
            # Missing git_sha, run_id, hash, etc.
        }
        with self.assertRaises(ValidationError):
            validate(instance=payload, schema=schema)

    def test_evaluate_paths_request_schema(self):
        """Validates request schema with caller-directed sort and weight vectors."""
        schema = self._load_schema("evaluate_paths.request.schema.json")
        payload = {
            "paths": [
                {
                    "path_id": "pth_pendle_pt_weeth_2026",
                    "venue": "pendle",
                    "chain": "ethereum",
                    "asset": "weETH",
                    "protocol_type": "PENDLE_PT",
                    "maturity_days": 90,
                    "has_points_campaign": True,
                },
                {
                    "path_id": "pth_aave_v3_usdc_mainnet",
                    "venue": "aave_v3",
                    "chain": "ethereum",
                    "asset": "USDC",
                    "protocol_type": "LENDING",
                },
            ],
            "snapshot_ref": {
                "git_sha": "a1b2c3d4e5f6789012345678901234567890abcd",
                "as_of_block": 21000000,
            },
            "notional_usd": 250000.0,
            "horizon_days": 90,
            "caller_sort": {
                "key": "INPUT_ORDER",
                "direction": "DESCENDING",
            },
            "caller_weight_vector": {
                "net_yield": 0.7,
                "dilution": 0.3,
            },
            "policy": {
                "min_tvl_usd": 1000000.0,
                "max_lock_days": 180,
                "require_verified_contracts": True,
            },
            "reporting_convention": "Act/365_periodic",
        }
        validate(instance=payload, schema=schema)

    def test_evaluate_paths_response_regulatory_shielding(self):
        """Validates response schema compliance with MiCA Article 81 & Advisers Act 1940."""
        schema = self._load_schema("evaluate_paths.response.schema.json")
        payload = {
            "ok": True,
            "engine_version": "1.0.0",
            "ordering_basis": "UNORDERED",
            "evaluated_paths": [
                {
                    "path_id": "pth_pendle_pt_weeth_2026",
                    "venue": "pendle",
                    "chain": "ethereum",
                    "asset": "weETH",
                    "status": "OK",
                    "metrics": {
                        "gross_observed_yield": 0.115,
                        "modeled_dilution_drag": 0.002,
                        "estimated_gas_drag": 0.001,
                        "net_projected_rate": 0.112,
                        "forecast_forward_rate": 0.095,
                        "pendle_spread": {
                            "implied_apy": 0.115,
                            "fair_forward_apy": 0.095,
                            "delta_total": -0.020,
                            "delta_organic": 0.010,
                            "maturity_days": 90.0,
                            "forecast_horizon_days": 90.0,
                            "maturity_delta_days": 0.0,
                            "has_points_campaign": True,
                            "estimated_points_apy": 0.030,
                            "flag_unmodeled_points": True,
                            "points_category": "EXOGENOUS_POINTS_UNMODELED",
                            "taxonomy": {
                                "implied_apy": "OBSERVED",
                                "fair_forward_apy": "STATISTICAL_FORECAST",
                                "delta_total": "MECHANICAL_CONDITIONAL",
                                "delta_organic": "MECHANICAL_CONDITIONAL",
                                "estimated_points_apy": "EXOGENOUS_POINTS_UNMODELED",
                            },
                            "availability": "OK",
                            "warning_codes": [],
                        },
                    },
                    "metric_taxonomy": {
                        "gross_observed_yield": "OBSERVED",
                        "modeled_dilution_drag": "MECHANICAL_CONDITIONAL",
                        "estimated_gas_drag": "MECHANICAL_CONDITIONAL",
                        "net_projected_rate": "MECHANICAL_CONDITIONAL",
                        "forecast_forward_rate": "STATISTICAL_FORECAST",
                    },
                    "policy_gates": [
                        {
                            "gate_name": "tvl_floor",
                            "passed": True,
                            "observed_value": 50000000,
                            "threshold": 1000000,
                            "reason_code": "GATE_TVL_PASSED",
                        }
                    ],
                    "warning_codes": [],
                }
            ],
            "provenance": {
                "evaluation_input_hash": "sha256:0123456789abcdef",
                "engine_version": "1.0.0",
                "adapter_versions": {"pendle": "1.0.0", "aave": "1.0.0"},
                "policy_hash": "sha256:fedcba9876543210",
                "scenario_set_hash": "sha256:0000000000000000",
                "snapshot_hashes": ["sha256:1111111111111111"],
                "block_numbers_and_hashes": {"1": "0x1234"},
                "source_timestamps": {"multicall": "2026-09-10T12:00:00Z"},
                "reporting_convention": "Act/365_periodic",
                "economic_result_hash": "sha256:9999999999999999",
                "warning_codes": [],
            },
            "regulatory_disclosure": {
                "fiduciary_status": "NON_ADVISORY_COMPARATOR",
                "mica_compliance": "Stateless mathematical comparator under MiCA Article 81. Does not provide personalized investment recommendations or advice.",
                "us_advisers_act_compliance": "Pure calculation utility under US Investment Advisers Act 1940. No client profiling or individualized fiduciary recommendation.",
                "disclaimer": "Calculated outputs are deterministic mathematical evaluations based on caller-supplied parameters. Past performance does not guarantee future results.",
            },
        }

        validate(instance=payload, schema=schema)
        self.assertEqual(payload["ordering_basis"], "UNORDERED")
        self.assertEqual(
            payload["regulatory_disclosure"]["fiduciary_status"],
            "NON_ADVISORY_COMPARATOR",
        )

    def test_explain_path_and_simulate_ticket_schemas(self):
        """Validates standalone and nested schemas for dg_explain_path and dg_simulate_ticket."""
        exp_req_schema = self._load_schema("explain_path.request.schema.json")
        exp_req_payload = {
            "path_id": "pth_pendle_pt_weeth_2026",
            "snapshot_ref": "snap_20260910_01",
            "notional_usd": 100000.0,
        }
        validate(instance=exp_req_payload, schema=exp_req_schema)

        exp_res_schema = self._load_schema("explain_path.response.schema.json")
        exp_res_payload = {
            "ok": True,
            "path_id": "pth_pendle_pt_weeth_2026",
            "snapshot_ref": "snap_20260910_01",
            "attribution": {
                "cashflows": [
                    {
                        "leg_index": 0,
                        "source": "fixed_pt_redemption",
                        "rate_component": 0.115,
                        "included_in_net": True,
                        "basis": "CONTRACTUAL_AS_OBSERVED",
                    }
                ],
                "dilution": {
                    "liquidity_usd": 50000000.0,
                    "delta_liquidity_usd": 100000.0,
                    "dilution_drag_bps": 2.5,
                },
                "pendle": {
                    "pt_price": 0.95,
                    "yt_price": 0.05,
                    "sy_price": 1.0,
                    "delta_total": -0.02,
                    "delta_organic": 0.01,
                    "flag_unmodeled_points": True,
                    "points_category": "EXOGENOUS_POINTS_UNMODELED",
                },
                "gas": {
                    "enter_usd": 15.0,
                    "exit_usd": 15.0,
                    "drag_rate": 0.001,
                },
                "hurdle": {
                    "hurdle_rate": 0.05,
                    "net_rate": 0.112,
                    "clear_bps": 620.0,
                },
                "irr_bridge": [
                    {"step_name": "gross_observed_yield", "rate_after": 0.115},
                    {"step_name": "dilution_drag", "rate_after": 0.113},
                    {"step_name": "gas_drag", "rate_after": 0.112},
                ],
            },
            "regulatory_disclosure": {
                "fiduciary_status": "NON_ADVISORY_COMPARATOR",
                "notice": "Read-only mathematical attribution.",
            },
        }
        validate(instance=exp_res_payload, schema=exp_res_schema)

        sim_req_schema = self._load_schema("simulate_ticket.request.schema.json")
        sim_req_payload = {
            "ticket_id": "12345678-1234-5678-1234-567812345678",
            "path_id": "pth_pendle_pt_weeth_2026",
            "notional_usd": 50000.0,
            "horizon_days": 90,
            "side": "enter",
            "execution": {
                "chain_id": 1,
                "slippage_bps_limit": 25.0,
                "priority_fee_gwei": 2.0,
                "simulate_mev": False,
            },
            "constraints": {
                "max_gas_usd": 50.0,
                "min_net_yield": 0.05,
            },
        }
        validate(instance=sim_req_payload, schema=sim_req_schema)

        sim_res_schema = self._load_schema("simulate_ticket.response.schema.json")
        sim_res_payload = {
            "ok": True,
            "ticket_id": "12345678-1234-5678-1234-567812345678",
            "path_id": "pth_pendle_pt_weeth_2026",
            "status": "SIMULATED",
            "economics": {
                "entry_slippage_bps": 4.5,
                "exit_slippage_bps": 5.0,
                "total_gas_usd": 22.5,
                "post_deposit_utilization": 0.72,
                "dilution_drag_bps": 1.5,
                "simulated_net_rate": 0.111,
            },
            "execution_plan": {
                "calldata_simulation_only": True,
                "steps": ["approve", "swapExactTokensForTokens"],
            },
            "constraints_eval": {
                "max_gas_usd": True,
                "min_net_yield": True,
            },
            "provenance": {
                "simulation_block": 21000000,
                "simulation_hash": "sha256:aabbccddeeff",
            },
            "regulatory_disclosure": {
                "fiduciary_status": "NON_ADVISORY_COMPARATOR",
                "notice": "Simulation output only. Does not constitute order submission or advice.",
            },
        }
        validate(instance=sim_res_payload, schema=sim_res_schema)


if __name__ == "__main__":
    unittest.main()
