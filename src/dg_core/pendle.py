"""
Pendle Yield Decomposition & PT Normalization Engine.

Provides deterministic mathematical decomposition of observed Pendle rates,
forward statistical forecasts, and points campaign entitlements.
All outputs adhere to the neutral taxonomy defined in the Master Blueprint:
OBSERVED, CONTRACTUAL_AS_OBSERVED, MECHANICAL_CONDITIONAL, STATISTICAL_FORECAST,
CALLER_SCENARIO, and EXOGENOUS_POINTS_UNMODELED.

Contains zero evaluative terminology (no promotional or fiduciary adjectives).
"""

import math
import warnings
from typing import Any, Dict, List, Optional, Union

# Neutral output taxonomy (Master Blueprint Section 2.2)
TAXONOMY_OBSERVED = "OBSERVED"
TAXONOMY_CONTRACTUAL_AS_OBSERVED = "CONTRACTUAL_AS_OBSERVED"
TAXONOMY_MECHANICAL_CONDITIONAL = "MECHANICAL_CONDITIONAL"
TAXONOMY_STATISTICAL_FORECAST = "STATISTICAL_FORECAST"
TAXONOMY_CALLER_SCENARIO = "CALLER_SCENARIO"
TAXONOMY_UNMODELED = "UNMODELED"
TAXONOMY_EXOGENOUS_POINTS_UNMODELED = "EXOGENOUS_POINTS_UNMODELED"

# Availability states
AVAILABILITY_OK = "OK"
AVAILABILITY_UNKNOWN = "UNKNOWN"
AVAILABILITY_STALE = "STALE"
AVAILABILITY_UNSUPPORTED = "UNSUPPORTED"
AVAILABILITY_INVALID = "INVALID"


class MaturityMismatchWarning(UserWarning):
    """Raised when instrument maturity tenor deviates from forecast horizon."""
    pass


def decompose_pendle_spread(
    implied_apy: float,
    fair_forward_apy: float,
    maturity_days: Union[int, float],
    forecast_horizon_days: Union[int, float],
    has_points_campaign: bool = False,
    estimated_points_apy: float = 0.0,
    strict: bool = False,
) -> Dict[str, Any]:
    """
    Decomposes the spread between fair forward statistical APY and Pendle implied APY.

    Parameters:
        implied_apy: Observed market-implied APY for the PT/YT instrument.
                     Taxonomy: OBSERVED.
        fair_forward_apy: Statistical forecast of underlying yield across horizon.
                          Taxonomy: STATISTICAL_FORECAST.
        maturity_days: Days remaining to contract maturity T.
        forecast_horizon_days: Target horizon H of statistical forecast.
        has_points_campaign: Boolean flag indicating presence of points program.
        estimated_points_apy: Estimated annualized yield from points, if modeled.
        strict: If True, raises ValueError on maturity mismatch exceeding 3 days.
                If False, issues MaturityMismatchWarning and logs warning code.

    Returns:
        Structured dictionary containing:
        - implied_apy (OBSERVED)
        - fair_forward_apy (STATISTICAL_FORECAST)
        - delta_total (MECHANICAL_CONDITIONAL)
        - delta_organic (MECHANICAL_CONDITIONAL)
        - maturity_days
        - forecast_horizon_days
        - maturity_delta_days
        - has_points_campaign
        - estimated_points_apy
        - flag_unmodeled_points
        - points_category
        - taxonomy mapping
        - warning_codes
    """
    if maturity_days <= 0:
        raise ValueError("maturity_days must be positive.")
    if forecast_horizon_days <= 0:
        raise ValueError("forecast_horizon_days must be positive.")

    # Maturity matching verification (maximum allowable delta: 3 days)
    maturity_delta_days = abs(float(maturity_days) - float(forecast_horizon_days))
    warning_codes: List[str] = []

    if maturity_delta_days > 3.0:
        msg = (
            f"Maturity matching deviation: maturity_days ({maturity_days}) and "
            f"forecast_horizon_days ({forecast_horizon_days}) differ by "
            f"{maturity_delta_days:.2f} days, exceeding the 3-day tolerance."
        )
        if strict:
            raise ValueError(msg)
        warnings.warn(msg, MaturityMismatchWarning, stacklevel=2)
        warning_codes.append("MATURITY_HORIZON_MISMATCH")

    # Spread calculation
    delta_total = fair_forward_apy - implied_apy
    delta_organic = fair_forward_apy - (implied_apy - estimated_points_apy)

    # Mandatory Risk Flag for points campaigns
    if has_points_campaign:
        flag_unmodeled_points = True
        points_category = TAXONOMY_EXOGENOUS_POINTS_UNMODELED
    else:
        flag_unmodeled_points = False
        points_category = "NONE"

    return {
        "implied_apy": float(implied_apy),
        "fair_forward_apy": float(fair_forward_apy),
        "delta_total": float(delta_total),
        "delta_organic": float(delta_organic),
        "maturity_days": float(maturity_days),
        "forecast_horizon_days": float(forecast_horizon_days),
        "maturity_delta_days": float(maturity_delta_days),
        "has_points_campaign": bool(has_points_campaign),
        "estimated_points_apy": float(estimated_points_apy),
        "flag_unmodeled_points": bool(flag_unmodeled_points),
        "points_category": points_category,
        "taxonomy": {
            "implied_apy": TAXONOMY_OBSERVED,
            "fair_forward_apy": TAXONOMY_STATISTICAL_FORECAST,
            "delta_total": TAXONOMY_MECHANICAL_CONDITIONAL,
            "delta_organic": TAXONOMY_MECHANICAL_CONDITIONAL,
            "estimated_points_apy": (
                TAXONOMY_EXOGENOUS_POINTS_UNMODELED
                if has_points_campaign
                else TAXONOMY_MECHANICAL_CONDITIONAL
            ),
        },
        "availability": AVAILABILITY_OK,
        "warning_codes": warning_codes,
    }


def normalize_pt_yield(
    pt_acquisition_cost_u: float,
    redemption_u: float = 1.0,
    cost_u: float = 0.0,
    tau_years: float = 0.5,
) -> float:
    """
    Computes normalized annual PT yield (Master Blueprint Section 3.6.2):
    y_{PT,U} = ( q_{T,U} / (P_{PT,U} + K_U) )^(1 / tau) - 1

    Parameters:
        pt_acquisition_cost_u: Executable PT price in underlying units.
        redemption_u: Modeled underlying redemption per PT at maturity (default 1.0).
        cost_u: Transaction or entry costs in underlying units (default 0.0).
        tau_years: Tenor fraction (T - t) / 365.

    Returns:
        Effective annual yield y_{PT,U}.
    """
    if tau_years <= 0:
        raise ValueError("Tenor tau_years must be positive.")
    effective_cost = pt_acquisition_cost_u + cost_u
    if effective_cost <= 0:
        raise ValueError("Effective acquisition cost (P_{PT,U} + K_U) must be positive.")
    if redemption_u <= 0:
        raise ValueError("Modeled redemption must be positive.")

    return (redemption_u / effective_cost) ** (1.0 / tau_years) - 1.0


def compute_pt_spread(
    pt_yield: float,
    benchmark_yield: float,
    tau_years: float = 0.5,
    pt_acquisition_cost_u: Optional[float] = None,
    redemption_u: float = 1.0,
    cost_u: float = 0.0,
) -> Dict[str, Any]:
    """
    Computes simple and logarithmic spreads between PT yield and benchmark yield
    (Master Blueprint Section 3.6.2):
    s_{simple,bps} = 10^4 * (y_{PT,U} - y_{B,U})
    s_{log,bps} = 10^4 * [ ln(q_{T,U} / (P_{PT,U} + K_U)) / tau - ln(1 + y_{B,U}) ]

    Parameters:
        pt_yield: Normalized PT yield y_{PT,U}.
        benchmark_yield: Benchmark annual yield y_{B,U}.
        tau_years: Tenor fraction (T - t) / 365.
        pt_acquisition_cost_u: Optional PT cost in underlying units for log spread.
        redemption_u: Modeled underlying redemption per PT.
        cost_u: Additional transaction costs.

    Returns:
        Dictionary with s_simple_bps, and s_log_bps if cost parameters provided.
    """
    s_simple_bps = 10000.0 * (pt_yield - benchmark_yield)

    result: Dict[str, Any] = {
        "pt_yield": float(pt_yield),
        "benchmark_yield": float(benchmark_yield),
        "s_simple_bps": float(s_simple_bps),
        "taxonomy": {
            "pt_yield": TAXONOMY_MECHANICAL_CONDITIONAL,
            "benchmark_yield": TAXONOMY_OBSERVED,
            "s_simple_bps": TAXONOMY_MECHANICAL_CONDITIONAL,
        },
    }

    if pt_acquisition_cost_u is not None:
        if tau_years <= 0:
            raise ValueError("Tenor tau_years must be positive.")
        effective_cost = pt_acquisition_cost_u + cost_u
        if effective_cost <= 0 or redemption_u <= 0 or (1.0 + benchmark_yield) <= 0:
            raise ValueError("Invalid parameters for logarithmic spread calculation.")
        log_pt_rate = math.log(redemption_u / effective_cost) / tau_years
        log_bench_rate = math.log(1.0 + benchmark_yield)
        s_log_bps = 10000.0 * (log_pt_rate - log_bench_rate)
        result["s_log_bps"] = float(s_log_bps)
        result["taxonomy"]["s_log_bps"] = TAXONOMY_MECHANICAL_CONDITIONAL

    return result
