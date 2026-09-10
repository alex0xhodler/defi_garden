"""
dg_core: Deterministic Quantitative Core for DeFi Garden.
Phase P0: Contracts, Arithmetic, and Golden Fixtures.
"""

try:
    from dg_core.amm_cl import (  # noqa: F401
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
except ImportError:
    from src.dg_core.amm_cl import (  # noqa: F401
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

__all__ = [
    "PRECISION",
    "ROUNDING",
    "calculate_range_occupancy_probability",
    "calculate_clmm_fee_apy",
    "calculate_full_range_equivalent_dilution",
    "calculate_capacity_ceiling_20pct",
    "simulate_amm_ticket",
    "calculate_clmm_amounts",
    "calculate_clmm_divergence_loss",
    "DilutionResult",
    "CLMMFeeResult",
    "SimulationResult",
]

