"""
Deterministic Lending Math Engine for DeFi Garden (Institutional / TimesFM).

Implements jump rate models, utilization calculations, kink headroom under frozen
and scenario assumptions (including looper feedback and flow dynamics), post-deposit
dilution forecasting, and traffic-light liquidity underwriting states.

All arithmetic uses Python's decimal.Decimal with 50 digits of precision (ROUND_HALF_EVEN)
to guarantee zero floating-point drift across platforms.
"""

from decimal import Decimal, Context, ROUND_HALF_EVEN, setcontext, InvalidOperation
from typing import Any, Dict, Optional, Union

# Authoritative precision conventions (Master Blueprint Section 6.2)
PRECISION = 50
ROUNDING = ROUND_HALF_EVEN

LENDING_CONTEXT = Context(prec=PRECISION, rounding=ROUNDING)
setcontext(LENDING_CONTEXT)


def to_decimal(val: Union[Decimal, str, int, float, Any]) -> Decimal:
    """Safely coerce an input to Decimal within the authoritative precision context."""
    if isinstance(val, Decimal):
        return val
    if isinstance(val, (int, str)):
        return Decimal(str(val))
    if isinstance(val, float):
        # Convert via repr/str to avoid binary float precision artifacts
        return Decimal(str(val))
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError) as err:
        raise ValueError(f"Cannot coerce value {val!r} to Decimal: {err}") from err


def calculate_utilization(
    borrows: Union[Decimal, str, int, float],
    supply: Union[Decimal, str, int, float],
) -> Decimal:
    """
    Calculate market utilization U = D / S.

    Domain rules:
    - Borrows and supply must be non-negative.
    - If supply == 0 and borrows == 0, returns 0.
    - If supply == 0 and borrows > 0, raises ValueError.
    """
    d = to_decimal(borrows)
    s = to_decimal(supply)

    if d < Decimal("0") or s < Decimal("0"):
        raise ValueError(f"Supply ({s}) and borrows ({d}) must be non-negative")

    if s == Decimal("0"):
        if d == Decimal("0"):
            return Decimal("0")
        raise ValueError(f"Cannot calculate utilization with zero supply and positive borrows ({d})")

    return d / s


def calculate_borrow_rate(
    utilization: Union[Decimal, str, int, float],
    kink: Union[Decimal, str, int, float],
    r0: Union[Decimal, str, int, float],
    r1: Union[Decimal, str, int, float],
    r2: Union[Decimal, str, int, float],
) -> Decimal:
    """
    Jump rate model (piecewise linear):
    - For U <= kink:
        b(U) = r0 + r1 * (U / kink)
    - For U > kink:
        b(U) = r0 + r1 + r2 * ((U - kink) / (1 - kink))

    Parameters:
    - utilization: current market utilization U in [0, 1]
    - kink: optimal utilization kink U* in (0, 1]
    - r0: base borrow rate at U = 0
    - r1: slope 1 rate multiplier below kink
    - r2: slope 2 rate multiplier above kink
    """
    u = to_decimal(utilization)
    k = to_decimal(kink)
    rate_base = to_decimal(r0)
    slope1 = to_decimal(r1)
    slope2 = to_decimal(r2)

    if u < Decimal("0") or u > Decimal("1"):
        raise ValueError(f"Utilization {u} must be in range [0, 1]")

    if k <= Decimal("0") or k > Decimal("1"):
        raise ValueError(f"Kink {k} must be in range (0, 1]")

    if rate_base < Decimal("0") or slope1 < Decimal("0") or slope2 < Decimal("0"):
        raise ValueError("Interest rates and slopes must be non-negative")

    if u <= k:
        return rate_base + slope1 * (u / k)
    else:
        one = Decimal("1")
        return rate_base + slope1 + slope2 * ((u - k) / (one - k))


def calculate_supply_apy(
    utilization: Union[Decimal, str, int, float],
    borrow_rate: Union[Decimal, str, int, float],
    reserve_factor: Union[Decimal, str, int, float],
) -> Decimal:
    """
    Calculate supply rate:
        r_L(U) = U * b(U) * (1 - reserve_factor)

    Parameters:
    - utilization: market utilization U in [0, 1]
    - borrow_rate: annualized borrow rate b(U) >= 0
    - reserve_factor: protocol reserve factor f_r in [0, 1]
    """
    u = to_decimal(utilization)
    br = to_decimal(borrow_rate)
    rf = to_decimal(reserve_factor)

    if u < Decimal("0") or u > Decimal("1"):
        raise ValueError(f"Utilization {u} must be in range [0, 1]")

    if br < Decimal("0"):
        raise ValueError(f"Borrow rate {br} must be non-negative")

    if rf < Decimal("0") or rf > Decimal("1"):
        raise ValueError(f"Reserve factor {rf} must be in range [0, 1]")

    one = Decimal("1")
    return u * br * (one - rf)


def calculate_w_kink_frozen(
    supply: Union[Decimal, str, int, float],
    utilization: Union[Decimal, str, int, float],
    kink: Union[Decimal, str, int, float],
) -> Decimal:
    """
    Calculate frozen-state kink headroom:
        W_kink,frozen = max(0, S * (1 - U / U*))

    Parameters:
    - supply: total pool assets S >= 0
    - utilization: current utilization U >= 0
    - kink: interest rate kink U* in (0, 1]
    """
    s = to_decimal(supply)
    u = to_decimal(utilization)
    k = to_decimal(kink)

    if s < Decimal("0"):
        raise ValueError(f"Supply {s} must be non-negative")
    if u < Decimal("0"):
        raise ValueError(f"Utilization {u} must be non-negative")
    if k <= Decimal("0") or k > Decimal("1"):
        raise ValueError(f"Kink {k} must be in range (0, 1]")

    if u >= k:
        return Decimal("0")

    one = Decimal("1")
    headroom = s * (one - (u / k))
    return max(Decimal("0"), headroom)


def calculate_w_max_atomic(
    supply: Union[Decimal, str, int, float],
    utilization: Union[Decimal, str, int, float],
) -> Decimal:
    """
    Calculate atomic physical cash headroom:
        W_max_atomic = S * (1 - U)

    Parameters:
    - supply: total pool assets S >= 0
    - utilization: current utilization U >= 0
    """
    s = to_decimal(supply)
    u = to_decimal(utilization)

    if s < Decimal("0"):
        raise ValueError(f"Supply {s} must be non-negative")
    if u < Decimal("0"):
        raise ValueError(f"Utilization {u} must be non-negative")

    if u >= Decimal("1"):
        return Decimal("0")

    one = Decimal("1")
    cash = s * (one - u)
    return max(Decimal("0"), cash)


def calculate_w_kink_scenario(
    supply: Union[Decimal, str, int, float],
    borrows: Union[Decimal, str, int, float],
    kink: Union[Decimal, str, int, float],
    beta_repay: Union[Decimal, str, int, float] = Decimal("0"),
    lambda_looper: Union[Decimal, str, int, float] = Decimal("0"),
    gamma_flow: Union[Decimal, str, int, float] = Decimal("0"),
) -> Decimal:
    """
    Closed-form scenario kink headroom with repayment, looper redemption, and flow feedback
    (Astra Judge Specification Section 3.3):

        W_kink,scenario = (kink * supply - borrows) /
                          (kink * (1 + lambda_looper * beta_repay) - beta_repay + gamma_flow)

    Parameters:
    - supply: pool assets S >= 0
    - borrows: debt outstanding D >= 0
    - kink: interest rate kink U* in (0, 1]
    - beta_repay: repayment response per unit of external withdrawal (beta >= 0)
    - lambda_looper: looper collateral redemption per unit of repayment (lambda >= 0)
    - gamma_flow: new borrowing response per unit of external withdrawal (gamma >= 0)

    Domain restrictions:
    - Nonpositive denominator raises ValueError (not infinite headroom).
    - If borrows >= kink * supply, utilization is already at/above kink -> returns 0.
    """
    s = to_decimal(supply)
    d = to_decimal(borrows)
    k = to_decimal(kink)
    beta = to_decimal(beta_repay)
    lam = to_decimal(lambda_looper)
    gamma = to_decimal(gamma_flow)

    if s < Decimal("0") or d < Decimal("0"):
        raise ValueError(f"Supply ({s}) and borrows ({d}) must be non-negative")
    if k <= Decimal("0") or k > Decimal("1"):
        raise ValueError(f"Kink {k} must be in range (0, 1]")
    if beta < Decimal("0") or lam < Decimal("0") or gamma < Decimal("0"):
        raise ValueError("Feedback parameters (beta, lambda, gamma) must be non-negative")

    num = k * s - d
    one = Decimal("1")
    denom = k * (one + lam * beta) - beta + gamma

    if denom <= Decimal("0"):
        raise ValueError(
            f"Nonpositive denominator ({denom}) in scenario kink calculation: "
            f"kink={k}, beta={beta}, lambda={lam}, gamma={gamma}"
        )

    if num <= Decimal("0"):
        return Decimal("0")

    w_scen = num / denom
    return max(Decimal("0"), w_scen)


def evaluate_lending_pool(
    pool_state: Dict[str, Any],
    ticket_size: Union[Decimal, str, int, float],
) -> Dict[str, Any]:
    """
    Evaluate a prospective deposit ticket against a lending pool state.

    Returns an audited dictionary containing:
    - W_max_atomic: physical atomic cash headroom
    - W_kink_frozen: frozen-state headroom to IRM kink
    - W_kink_scenario: scenario-adjusted headroom to IRM kink
    - post_deposit_utilization: utilization after deposit
    - post_deposit_borrow_rate: borrow rate after deposit
    - post_deposit_supply_apy: supply APY after deposit dilution
    - traffic_light:
        - "UNKNOWN" if pool state is stale
        - "GREEN" if ticket <= W_kink_frozen / 2
        - "AMBER" if ticket <= W_kink_frozen
        - "RED" if ticket > W_kink_frozen
    - current_utilization, current_borrow_rate, current_supply_apy
    - ticket_size, is_stale
    """
    supply = to_decimal(pool_state.get("supply", pool_state.get("total_supply", 0)))
    borrows = to_decimal(pool_state.get("borrows", pool_state.get("total_borrows", 0)))
    kink = to_decimal(
        pool_state.get(
            "kink",
            pool_state.get("u_k", pool_state.get("kink_utilization", pool_state.get("U_star", "0.80"))),
        )
    )
    r0 = to_decimal(pool_state.get("r0", pool_state.get("base_rate", pool_state.get("b0", 0))))
    r1 = to_decimal(pool_state.get("r1", pool_state.get("slope1", pool_state.get("s1", 0))))
    r2 = to_decimal(pool_state.get("r2", pool_state.get("slope2", pool_state.get("s2", 0))))
    reserve_factor = to_decimal(
        pool_state.get("reserve_factor", pool_state.get("reserve_ratio", pool_state.get("f_r", 0)))
    )
    beta_repay = to_decimal(pool_state.get("beta_repay", pool_state.get("beta", 0)))
    lambda_looper = to_decimal(pool_state.get("lambda_looper", pool_state.get("lambda", 0)))
    gamma_flow = to_decimal(pool_state.get("gamma_flow", pool_state.get("gamma", 0)))

    is_stale = bool(pool_state.get("is_stale", False) or pool_state.get("stale", False))

    ticket = to_decimal(ticket_size)
    if ticket < Decimal("0"):
        raise ValueError(f"ticket_size ({ticket}) must be non-negative")

    # Current pool state calculations
    u_current = calculate_utilization(borrows, supply)
    current_borrow_rate = calculate_borrow_rate(u_current, kink, r0, r1, r2)
    current_supply_apy = calculate_supply_apy(u_current, current_borrow_rate, reserve_factor)

    w_max_atomic = calculate_w_max_atomic(supply, u_current)
    w_kink_frozen = calculate_w_kink_frozen(supply, u_current, kink)
    w_kink_scenario = calculate_w_kink_scenario(
        supply=supply,
        borrows=borrows,
        kink=kink,
        beta_repay=beta_repay,
        lambda_looper=lambda_looper,
        gamma_flow=gamma_flow,
    )

    # Post-deposit calculations
    post_supply = supply + ticket
    post_borrows = borrows
    post_deposit_utilization = calculate_utilization(post_borrows, post_supply)
    post_deposit_borrow_rate = calculate_borrow_rate(post_deposit_utilization, kink, r0, r1, r2)
    post_deposit_supply_apy = calculate_supply_apy(
        post_deposit_utilization, post_deposit_borrow_rate, reserve_factor
    )

    # Traffic light policy
    if is_stale:
        traffic_light = "UNKNOWN"
    elif ticket <= (w_kink_frozen / Decimal("2")):
        traffic_light = "GREEN"
    elif ticket <= w_kink_frozen:
        traffic_light = "AMBER"
    else:
        traffic_light = "RED"

    return {
        "W_max_atomic": w_max_atomic,
        "W_kink_frozen": w_kink_frozen,
        "W_kink_scenario": w_kink_scenario,
        "post_deposit_utilization": post_deposit_utilization,
        "post_deposit_borrow_rate": post_deposit_borrow_rate,
        "post_deposit_supply_apy": post_deposit_supply_apy,
        "traffic_light": traffic_light,
        "state": traffic_light,
        "current_utilization": u_current,
        "current_borrow_rate": current_borrow_rate,
        "current_supply_apy": current_supply_apy,
        "ticket_size": ticket,
        "is_stale": is_stale,
    }
