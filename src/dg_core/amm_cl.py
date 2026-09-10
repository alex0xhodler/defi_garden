"""
Concentrated Liquidity (CLMM) Math Engine for DeFi Garden (Institutional / P0).

Implements:
1. Range occupancy & first-exit survival probability under Geometric Brownian Motion.
2. Strict tick-dropout cliff mechanics (active fee rate is EXACTLY 0 outside range).
3. Full-range equivalent fee dilution under volume-retention elasticity (kappa).
4. AMM ticket size simulation (dilution, dropout risk %, capacity ceiling before 20% fee compression).
5. Canonical position accounting, token amounts, and divergence loss.

All financial and rate arithmetic uses Python's decimal.Decimal with 50 digits of precision
(ROUND_HALF_EVEN) to guarantee deterministic execution across platforms.
"""

from decimal import Context, Decimal, InvalidOperation, ROUND_HALF_EVEN, setcontext
import math
from typing import Any, Dict, Optional, Tuple, Union

try:
    from scipy.stats import norm
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

# Authoritative precision conventions (Master Blueprint Section 6.1 & 6.2)
PRECISION = 50
ROUNDING = ROUND_HALF_EVEN

AMM_CONTEXT = Context(prec=PRECISION, rounding=ROUNDING)
setcontext(AMM_CONTEXT)

ZERO = Decimal("0")
ONE = Decimal("1")
HUNDRED = Decimal("100")
DAYS_IN_YEAR = Decimal("365")
DEFAULT_KAPPA = Decimal("0.85")
COMPRESSION_20_PCT = Decimal("0.20")
RETENTION_80_PCT = Decimal("0.80")
PI_DEC = Decimal("3.1415926535897932384626433832795028841971693993751")


def to_decimal(val: Union[Decimal, str, int, float, Any]) -> Decimal:
    """Safely coerce an input to Decimal within the authoritative precision context."""
    if isinstance(val, Decimal):
        return val
    if isinstance(val, (int, str)):
        return Decimal(str(val))
    if isinstance(val, float):
        return Decimal(str(val))
    try:
        return Decimal(str(val))
    except (InvalidOperation, TypeError, ValueError) as err:
        raise ValueError(f"Cannot coerce value {val!r} to Decimal: {err}") from err


class DilutionResult(Decimal):
    """
    Result of calculate_full_range_equivalent_dilution.
    Inherits from Decimal so it can be used directly in arithmetic/equality checks,
    while also exposing .is_full_range_equivalent, .dilution_factor, and dict subscripting.
    """
    is_full_range_equivalent: bool
    fee_apy: Decimal
    diluted_fee: Decimal
    diluted_fee_apy: Decimal
    dilution_factor: Decimal
    spot_fee: Decimal
    pool_liquidity: Decimal
    delta_liquidity: Decimal
    kappa: Decimal
    compression_pct: Decimal
    _data: Dict[str, Any]

    def __new__(
        cls,
        val: Union[Decimal, str, float],
        is_full_range_equivalent: bool = True,
        dilution_factor: Optional[Decimal] = None,
        spot_fee: Optional[Decimal] = None,
        pool_liquidity: Optional[Decimal] = None,
        delta_liquidity: Optional[Decimal] = None,
        kappa: Optional[Decimal] = None,
        **kwargs: Any,
    ) -> "DilutionResult":
        dec_val = to_decimal(val)
        inst = super().__new__(cls, str(dec_val))
        inst.is_full_range_equivalent = is_full_range_equivalent
        inst.fee_apy = dec_val
        inst.diluted_fee = dec_val
        inst.diluted_fee_apy = dec_val
        inst.dilution_factor = dilution_factor or ONE
        inst.spot_fee = spot_fee or dec_val
        inst.pool_liquidity = pool_liquidity or ZERO
        inst.delta_liquidity = delta_liquidity or ZERO
        inst.kappa = kappa or DEFAULT_KAPPA

        fee_diff = (inst.spot_fee - dec_val) if inst.spot_fee else ZERO
        compression = (fee_diff / inst.spot_fee * HUNDRED) if (inst.spot_fee and inst.spot_fee > ZERO) else ZERO
        inst.compression_pct = compression

        data_dict: Dict[str, Any] = {
            "fee_apy": inst.fee_apy,
            "diluted_fee": inst.diluted_fee,
            "diluted_fee_apy": inst.diluted_fee_apy,
            "is_full_range_equivalent": inst.is_full_range_equivalent,
            "dilution_factor": inst.dilution_factor,
            "spot_fee": inst.spot_fee,
            "pool_liquidity": inst.pool_liquidity,
            "delta_liquidity": inst.delta_liquidity,
            "kappa": inst.kappa,
            "compression_pct": inst.compression_pct,
        }
        data_dict.update(kwargs)
        inst._data = data_dict
        return inst

    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def __contains__(self, key: str) -> bool:
        return key in self._data

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def keys(self) -> Any:
        return self._data.keys()

    def values(self) -> Any:
        return self._data.values()

    def items(self) -> Any:
        return self._data.items()

    def to_dict(self, serialize_decimal: bool = False) -> Dict[str, Any]:
        if not serialize_decimal:
            return dict(self._data)
        out: Dict[str, Any] = {}
        for k, v in self._data.items():
            out[k] = str(v) if isinstance(v, Decimal) else v
        return out


class CLMMFeeResult(Decimal):
    """
    Result of calculate_clmm_fee_apy.
    Inherits from Decimal:
    - When is_in_range is True: numeric value equals expected_fee_apy.
    - When is_in_range is False: numeric value equals ZERO (cliff drop!).
    Attributes .active_fee_apy and .expected_fee_apy reflect the distinct components.
    """
    fee_apy: Decimal
    active_fee_apy: Decimal
    spot_fee_apy: Decimal
    expected_fee_apy: Decimal
    is_in_range: bool
    p_in: Decimal
    _data: Dict[str, Any]

    def __new__(
        cls,
        val: Union[Decimal, str, float],
        active_fee_apy: Union[Decimal, str, float],
        spot_fee_apy: Union[Decimal, str, float],
        expected_fee_apy: Union[Decimal, str, float],
        is_in_range: bool,
        p_in: Union[Decimal, str, float],
        **kwargs: Any,
    ) -> "CLMMFeeResult":
        dec_val = to_decimal(val)
        inst = super().__new__(cls, str(dec_val))
        inst.fee_apy = dec_val
        inst.active_fee_apy = to_decimal(active_fee_apy)
        inst.spot_fee_apy = to_decimal(spot_fee_apy)
        inst.expected_fee_apy = to_decimal(expected_fee_apy)
        inst.is_in_range = bool(is_in_range)
        inst.p_in = to_decimal(p_in)
        data_dict: Dict[str, Any] = {
            "fee_apy": inst.fee_apy,
            "active_fee_apy": inst.active_fee_apy,
            "spot_fee_apy": inst.spot_fee_apy,
            "expected_fee_apy": inst.expected_fee_apy,
            "is_in_range": inst.is_in_range,
            "p_in": inst.p_in,
        }
        data_dict.update(kwargs)
        inst._data = data_dict
        return inst

    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def __contains__(self, key: str) -> bool:
        return key in self._data

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def keys(self) -> Any:
        return self._data.keys()

    def values(self) -> Any:
        return self._data.values()

    def items(self) -> Any:
        return self._data.items()

    def to_dict(self, serialize_decimal: bool = False) -> Dict[str, Any]:
        if not serialize_decimal:
            return dict(self._data)
        out: Dict[str, Any] = {}
        for k, v in self._data.items():
            out[k] = str(v) if isinstance(v, Decimal) else v
        return out


class SimulationResult:
    """
    Result of simulate_amm_ticket.
    Exposes fee APY dilution, range dropout risk %, and capacity ceiling before 20% compression.
    Supports both attribute and dict-subscripting access.
    """
    fee_apy_dilution: Decimal
    diluted_fee_apy: Decimal
    spot_fee_apy: Decimal
    fee_compression_pct: Decimal
    fee_compression_usd: Decimal
    range_dropout_risk_pct: Decimal
    range_occupancy_probability: Decimal
    p_in: Decimal
    capacity_ceiling_usd: Decimal
    capacity_ceiling_before_20pct_compression: Decimal
    exceeds_20pct_capacity_ceiling: bool
    expected_fee_apy: Decimal
    is_in_range: bool
    is_full_range_equivalent: bool
    ticket_size_usd: Decimal
    pool_liquidity: Decimal
    tau_days: Decimal
    range_type: str
    p_current: Decimal
    p_lower: Decimal
    p_upper: Decimal
    _data: Dict[str, Any]

    def __init__(self, data: Dict[str, Any]) -> None:
        self._data = dict(data)
        for k, v in data.items():
            setattr(self, k, v)

    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def __contains__(self, key: str) -> bool:
        return key in self._data

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def keys(self) -> Any:
        return self._data.keys()

    def values(self) -> Any:
        return self._data.values()

    def items(self) -> Any:
        return self._data.items()

    def to_dict(self, serialize_decimal: bool = False) -> Dict[str, Any]:
        if not serialize_decimal:
            return dict(self._data)
        out: Dict[str, Any] = {}
        for k, v in self._data.items():
            out[k] = str(v) if isinstance(v, Decimal) else v
        return out

    def __repr__(self) -> str:
        diluted = self._data.get("diluted_fee_apy")
        risk = self._data.get("range_dropout_risk_pct")
        ceiling = self._data.get("capacity_ceiling_usd")
        return (
            f"<SimulationResult diluted_fee_apy={diluted} "
            f"range_dropout_risk_pct={risk}% capacity_ceiling_usd={ceiling}>"
        )


def calculate_range_occupancy_probability(
    p_current: Union[Decimal, str, int, float],
    p_lower: Union[Decimal, str, int, float],
    p_upper: Union[Decimal, str, int, float],
    sigma_vol: Union[Decimal, str, int, float],
    tau_days: Union[Decimal, str, int, float],
    method: str = "continuous",
    max_terms: int = 2000,
) -> Decimal:
    """
    Calculate the probability that price remains within [p_lower, p_upper] over horizon tau_days
    under Geometric Brownian Motion with annualized realized volatility sigma_vol.

    Mathematical formulation (PRD Redteam MATH-2 / Grok Blueprint line 61):
        P_in(tau) = E[ 1{ P_t in [p_lower, p_upper] for all t in [0, tau] } ]

    Under driftless log-price GBM (X_t = ln(P_t / P_lower)), absorbing boundaries at 0 and L = ln(P_upper / P_lower):
        P(tau > T) = 4/pi * sum_{m=1}^inf 1/(2m-1) * sin((2m-1)*pi*x0 / L) * exp( -(2m-1)^2 * pi^2 * sigma^2 * T / (2 * L^2) )
        where x0 = ln(P_current / P_lower) and T = tau_days / 365.

    Domain requirements:
    - 0 < p_lower < p_upper
    - p_current > 0
    - sigma_vol >= 0
    - tau_days >= 0

    Boundary / Cliff rules:
    - If p_current <= p_lower or p_current >= p_upper: returns 0.0 (already dropped out).
    - If tau_days == 0 or sigma_vol == 0: returns 1.0 (if in range).
    """
    p_curr = to_decimal(p_current)
    p_low = to_decimal(p_lower)
    p_high = to_decimal(p_upper)
    sig = to_decimal(sigma_vol)
    tau = to_decimal(tau_days)

    if p_low <= ZERO or p_curr <= ZERO or p_high <= ZERO:
        raise ValueError(f"Prices must be strictly positive: p_current={p_curr}, p_lower={p_low}, p_upper={p_high}")

    if p_low >= p_high:
        raise ValueError(f"p_lower ({p_low}) must be strictly less than p_upper ({p_high})")

    if sig < ZERO:
        raise ValueError(f"sigma_vol ({sig}) cannot be negative")

    if tau < ZERO:
        raise ValueError(f"tau_days ({tau}) cannot be negative")

    # Outside the range: active liquidity collapses to zero (cliff drop)
    if p_curr <= p_low or p_curr >= p_high:
        return ZERO

    # Zero horizon or zero volatility: stays at current spot in-range
    if tau == ZERO or sig == ZERO:
        return ONE

    t_years = float(tau / DAYS_IN_YEAR)
    sig_fl = float(sig)
    p_high_fl = float(p_high)
    p_low_fl = float(p_low)
    p_curr_fl = float(p_curr)

    if method == "terminal":
        # Terminal distribution P(p_lower <= P_T <= p_upper)
        sig_root_t = sig_fl * math.sqrt(t_years)
        if sig_root_t <= 0.0:
            return ONE
        z_high = math.log(p_high_fl / p_curr_fl) / sig_root_t
        z_low = math.log(p_low_fl / p_curr_fl) / sig_root_t
        if HAS_SCIPY:
            res_prob = norm.cdf(z_high) - norm.cdf(z_low)
        else:
            def _std_norm_cdf(z: float) -> float:
                return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))
            res_prob = _std_norm_cdf(z_high) - _std_norm_cdf(z_low)
        res_clamped = max(0.0, min(1.0, res_prob))
        return Decimal(str(round(res_clamped, 12)))

    # Continuous first-exit / survival probability (default & canonical)
    L_fl = math.log(p_high_fl / p_low_fl)
    x0_fl = math.log(p_curr_fl / p_low_fl)

    # Scaling factor for exponential decay: s2 = pi^2 * sigma^2 * T / (2 * L^2)
    s2 = (math.pi ** 2) * (sig_fl ** 2) * t_years / (2.0 * (L_fl ** 2))

    tot_fl = 0.0
    for m in range(1, max_terms + 1):
        k = 2 * m - 1
        arg_sin = k * math.pi * x0_fl / L_fl
        arg_exp = - (k ** 2) * s2
        if arg_exp < -120.0:
            break
        term = (1.0 / k) * math.sin(arg_sin) * math.exp(arg_exp)
        tot_fl += term

    res_prob = (4.0 / math.pi) * tot_fl
    res_clamped = max(0.0, min(1.0, res_prob))
    return Decimal(str(round(res_clamped, 12)))


def calculate_full_range_equivalent_dilution(
    spot_fee: Union[Decimal, str, int, float],
    pool_liquidity: Union[Decimal, str, int, float],
    delta_liquidity: Union[Decimal, str, int, float],
    kappa: Union[Decimal, str, int, float] = DEFAULT_KAPPA,
) -> DilutionResult:
    """
    Dilution formula for broad/v2 pools under volume-retention elasticity kappa:
        F(delta_L) = spot_fee * (L / (L + delta_L))^kappa

    Parameters:
    - spot_fee: current pool fee APY (spot)
    - pool_liquidity: existing pool liquidity L
    - delta_liquidity: incremental user LP deposit delta_L
    - kappa: volume-retention elasticity in [0, 1], default 0.85

    Explicitly flags:
    - is_full_range_equivalent = True
    """
    f_spot = to_decimal(spot_fee)
    L = to_decimal(pool_liquidity)
    dL = to_decimal(delta_liquidity)
    k = to_decimal(kappa)

    if L <= ZERO:
        raise ValueError(f"pool_liquidity ({L}) must be strictly positive")

    if dL < ZERO:
        raise ValueError(f"delta_liquidity ({dL}) cannot be negative")

    if k < ZERO or k > ONE:
        raise ValueError(f"kappa ({k}) must be in range [0, 1]")

    if dL == ZERO:
        return DilutionResult(
            f_spot,
            is_full_range_equivalent=True,
            dilution_factor=ONE,
            spot_fee=f_spot,
            pool_liquidity=L,
            delta_liquidity=dL,
            kappa=k,
        )

    # ratio = L / (L + dL)
    ratio = L / (L + dL)
    # dilution_factor = (L / (L + dL))^kappa
    dilution_factor = ratio ** k
    f_diluted = f_spot * dilution_factor

    return DilutionResult(
        f_diluted,
        is_full_range_equivalent=True,
        dilution_factor=dilution_factor,
        spot_fee=f_spot,
        pool_liquidity=L,
        delta_liquidity=dL,
        kappa=k,
    )


def calculate_clmm_fee_apy(
    base_volume: Union[Decimal, str, int, float],
    pool_liquidity: Union[Decimal, str, int, float],
    user_liquidity: Union[Decimal, str, int, float],
    is_in_range: bool,
    p_in: Union[Decimal, str, int, float],
    fee_tier: Optional[Union[Decimal, str, int, float]] = None,
    annual_days: Union[Decimal, str, int, float] = DAYS_IN_YEAR,
    kappa: Union[Decimal, str, int, float] = DEFAULT_KAPPA,
    spot_fee_apy: Optional[Union[Decimal, str, int, float]] = None,
) -> CLMMFeeResult:
    """
    Calculate Concentrated Liquidity (CLMM) Fee APY with strict tick-dropout logic.

    Rules:
    - When price falls outside [p_lower, p_upper] (is_in_range=False):
      active fee rate is EXACTLY 0 (cliff drop, not continuous decay).
    - Expected fee APY = spot_fee_apy * p_in.
    - If user_liquidity > 0, accounts for post-deposit fee dilution.
    """
    vol = to_decimal(base_volume)
    L = to_decimal(pool_liquidity)
    u_liq = to_decimal(user_liquidity)
    prob_in = to_decimal(p_in)
    days = to_decimal(annual_days)
    k = to_decimal(kappa)
    in_range_bool = bool(is_in_range)

    if L <= ZERO:
        raise ValueError(f"pool_liquidity ({L}) must be strictly positive")

    if u_liq < ZERO:
        raise ValueError(f"user_liquidity ({u_liq}) cannot be negative")

    if vol < ZERO:
        raise ValueError(f"base_volume ({vol}) cannot be negative")

    if prob_in < ZERO or prob_in > ONE:
        raise ValueError(f"p_in ({prob_in}) must be in range [0, 1]")

    # Derive or use spot_fee_apy
    if spot_fee_apy is not None:
        f_spot = to_decimal(spot_fee_apy)
    else:
        tier = to_decimal(fee_tier) if fee_tier is not None else Decimal("0.003")
        if tier < ZERO:
            raise ValueError(f"fee_tier ({tier}) cannot be negative")
        annual_fees = vol * tier * days
        f_spot = annual_fees / L

    # Dilution adjustment if user deposits liquidity
    if u_liq > ZERO:
        dilution_factor = (L / (L + u_liq)) ** k
        f_spot_user = f_spot * dilution_factor
    else:
        f_spot_user = f_spot
        dilution_factor = ONE

    # Strict tick-dropout cliff mechanics:
    # When price is outside range, active fee rate is EXACTLY 0.
    if not in_range_bool:
        active_fee_apy = ZERO
        primary_val = ZERO
    else:
        active_fee_apy = f_spot_user
        primary_val = f_spot_user * prob_in

    expected_fee_apy = f_spot_user * prob_in

    return CLMMFeeResult(
        primary_val,
        active_fee_apy=active_fee_apy,
        spot_fee_apy=f_spot_user,
        expected_fee_apy=expected_fee_apy,
        is_in_range=in_range_bool,
        p_in=prob_in,
        dilution_factor=dilution_factor,
    )


def calculate_capacity_ceiling_20pct(
    pool_liquidity: Union[Decimal, str, int, float],
    kappa: Union[Decimal, str, int, float] = DEFAULT_KAPPA,
) -> Decimal:
    """
    Calculate the capacity ceiling (max deposit delta_L) before fee APY suffers
    20% fee compression (i.e. diluted fee APY drops to 80% of spot).

    Inversion of dilution formula:
        (L / (L + delta_L))^kappa = 0.80
        L / (L + delta_L) = 0.80^(1/kappa)
        delta_L = L * (0.80^(-1/kappa) - 1)
    """
    L = to_decimal(pool_liquidity)
    k = to_decimal(kappa)

    if L <= ZERO:
        raise ValueError(f"pool_liquidity ({L}) must be positive")
    if k <= ZERO or k > ONE:
        raise ValueError(f"kappa ({k}) must be in range (0, 1]")

    # factor = (0.80) ** (-1 / kappa) - 1
    exponent = -ONE / k
    factor = (RETENTION_80_PCT ** exponent) - ONE
    return L * factor


def simulate_amm_ticket(
    pool_state: Dict[str, Any],
    ticket_size_usd: Union[Decimal, str, int, float],
    range_type: str,
    tau_days: Union[Decimal, str, int, float] = 30,
) -> SimulationResult:
    """
    Simulate an AMM ticket deposit returning:
    - fee APY dilution
    - range dropout risk percentage
    - capacity ceiling before 20% fee compression

    Parameters:
    - pool_state: dictionary containing:
        - pool_liquidity (or tvl_usd, liquidity, pool_liquidity_usd)
        - base_volume (or volume_24h, volume_usd, base_volume_usd)
        - fee_tier (or fee_rate, default 0.003)
        - sigma_vol (or volatility, sigma, default 0.50)
        - p_current (or price, default 1.0)
        - p_lower, p_upper (optional specific tick prices)
        - kappa (elasticity, default 0.85)
        - spot_fee_apy (optional precalculated fee APY)
    - ticket_size_usd: deposit size in USD (delta_L)
    - range_type: 'full_range', 'narrow', 'wide', 'volatile', 'custom'
    - tau_days: horizon in days (default 30)
    """
    # Extract pool parameters
    L = to_decimal(
        pool_state.get("pool_liquidity")
        or pool_state.get("tvl_usd")
        or pool_state.get("liquidity")
        or pool_state.get("pool_liquidity_usd")
        or ZERO
    )
    if L <= ZERO:
        raise ValueError("pool_state must provide a positive pool_liquidity")

    base_vol = to_decimal(
        pool_state.get("base_volume")
        or pool_state.get("volume_24h")
        or pool_state.get("volume_usd")
        or pool_state.get("base_volume_usd")
        or ZERO
    )

    fee_tier = to_decimal(pool_state.get("fee_tier") or pool_state.get("fee_rate") or "0.003")
    sigma = to_decimal(pool_state.get("sigma_vol") or pool_state.get("volatility") or pool_state.get("sigma") or "0.50")
    kappa = to_decimal(pool_state.get("kappa") or DEFAULT_KAPPA)
    p_curr = to_decimal(pool_state.get("p_current") or pool_state.get("price") or ONE)
    ticket_size = to_decimal(ticket_size_usd)
    tau = to_decimal(tau_days)

    # Base spot fee APY
    if "spot_fee_apy" in pool_state and pool_state["spot_fee_apy"] is not None:
        spot_fee = to_decimal(pool_state["spot_fee_apy"])
    else:
        spot_fee = (base_vol * fee_tier * DAYS_IN_YEAR) / L

    # Range boundaries and range occupancy probability
    norm_range_type = str(range_type).lower().strip()
    if norm_range_type in ("full_range", "full"):
        p_in = ONE
        dropout_risk_pct = ZERO
        is_full_range_equivalent = True
        is_in_range = True
        p_low = ZERO
        p_high = Decimal("1e50")
    else:
        is_full_range_equivalent = False
        if "p_lower" in pool_state and "p_upper" in pool_state:
            p_low = to_decimal(pool_state["p_lower"])
            p_high = to_decimal(pool_state["p_upper"])
        elif norm_range_type == "narrow":
            # Narrow range: 0.1% if stable (fee_tier <= 0.0005) or 1% otherwise
            half_width = Decimal("0.001") if fee_tier <= Decimal("0.0005") else Decimal("0.01")
            p_low = p_curr * (ONE - half_width)
            p_high = p_curr * (ONE + half_width)
        elif norm_range_type in ("wide", "volatile"):
            p_low = p_curr * Decimal("0.80")
            p_high = p_curr * Decimal("1.20")
        else:
            p_low = p_curr * Decimal("0.80")
            p_high = p_curr * Decimal("1.20")

        is_in_range = (p_low < p_curr < p_high)
        p_in = calculate_range_occupancy_probability(p_curr, p_low, p_high, sigma, tau)
        dropout_risk_pct = (ONE - p_in) * HUNDRED

    # Dilution evaluation
    dilution_res = calculate_full_range_equivalent_dilution(
        spot_fee=spot_fee,
        pool_liquidity=L,
        delta_liquidity=ticket_size,
        kappa=kappa,
    )
    diluted_fee = dilution_res.diluted_fee
    fee_diff = spot_fee - diluted_fee
    fee_compression_pct = (fee_diff / spot_fee * HUNDRED) if spot_fee > ZERO else ZERO

    # Capacity ceiling before 20% fee compression
    capacity_ceiling_usd = calculate_capacity_ceiling_20pct(L, kappa)
    exceeds_capacity = (ticket_size > capacity_ceiling_usd)

    # Expected fee APY factoring in range occupancy
    expected_fee = diluted_fee * p_in if is_in_range else ZERO

    result_data: Dict[str, Any] = {
        "fee_apy_dilution": diluted_fee,
        "diluted_fee_apy": diluted_fee,
        "spot_fee_apy": spot_fee,
        "fee_compression_pct": fee_compression_pct,
        "fee_compression_usd": fee_diff,
        "range_dropout_risk_pct": dropout_risk_pct,
        "range_occupancy_probability": p_in,
        "p_in": p_in,
        "capacity_ceiling_usd": capacity_ceiling_usd,
        "capacity_ceiling_before_20pct_compression": capacity_ceiling_usd,
        "exceeds_20pct_capacity_ceiling": exceeds_capacity,
        "expected_fee_apy": expected_fee,
        "is_in_range": is_in_range,
        "is_full_range_equivalent": is_full_range_equivalent,
        "ticket_size_usd": ticket_size,
        "pool_liquidity": L,
        "tau_days": tau,
        "range_type": norm_range_type,
        "p_current": p_curr,
        "p_lower": p_low,
        "p_upper": p_high,
    }

    return SimulationResult(result_data)


def calculate_clmm_amounts(
    p_current: Union[Decimal, str, int, float],
    p_lower: Union[Decimal, str, int, float],
    p_upper: Union[Decimal, str, int, float],
    liquidity: Union[Decimal, str, int, float],
) -> Dict[str, Decimal]:
    """
    Calculate token amounts x(P) and y(P) and position value V_LP(P)
    from Master Blueprint Section 3.4.1.

    x(P) = L * (1/sqrt(P_a) - 1/sqrt(P_b))   for P <= P_a
         = L * (1/sqrt(P) - 1/sqrt(P_b))     for P_a < P < P_b
         = 0                                 for P >= P_b

    y(P) = 0                                 for P <= P_a
         = L * (sqrt(P) - sqrt(P_a))         for P_a < P < P_b
         = L * (sqrt(P_b) - sqrt(P_a))       for P >= P_b

    V_LP(P) = P * x(P) + y(P)
    """
    P = to_decimal(p_current)
    Pa = to_decimal(p_lower)
    Pb = to_decimal(p_upper)
    L = to_decimal(liquidity)

    if Pa <= ZERO or Pb <= ZERO or P <= ZERO:
        raise ValueError("Prices must be strictly positive")
    if Pa >= Pb:
        raise ValueError("p_lower must be strictly less than p_upper")
    if L < ZERO:
        raise ValueError("liquidity cannot be negative")

    sqrt_Pa = Pa.sqrt()
    sqrt_Pb = Pb.sqrt()
    sqrt_P = P.sqrt()

    if P <= Pa:
        x = (L / sqrt_Pa) - (L / sqrt_Pb)
        y = ZERO
    elif P >= Pb:
        x = ZERO
        y = L * (sqrt_Pb - sqrt_Pa)
    else:
        x = (L / sqrt_P) - (L / sqrt_Pb)
        y = L * (sqrt_P - sqrt_Pa)

    v_lp = P * x + y

    return {
        "x": x,
        "y": y,
        "v_lp": v_lp,
        "p_current": P,
        "p_lower": Pa,
        "p_upper": Pb,
        "liquidity": L,
    }


def calculate_clmm_divergence_loss(
    p_0: Union[Decimal, str, int, float],
    p_t: Union[Decimal, str, int, float],
    p_lower: Union[Decimal, str, int, float],
    p_upper: Union[Decimal, str, int, float],
    liquidity: Union[Decimal, str, int, float],
) -> Dict[str, Decimal]:
    """
    Calculate divergence loss (impermanent loss) vs. passive HODL benchmark
    from Master Blueprint Section 3.4.4 & 3.4.5:
        V_HODL(P_T) = P_T * x_0 + y_0
        Delta V_divergence = V_LP(P_T) - V_HODL(P_T)
        relative_divergence = (V_LP / V_HODL) - 1
    """
    P0 = to_decimal(p_0)
    PT = to_decimal(p_t)
    Pa = to_decimal(p_lower)
    Pb = to_decimal(p_upper)
    L = to_decimal(liquidity)

    init_amounts = calculate_clmm_amounts(P0, Pa, Pb, L)
    x0 = init_amounts["x"]
    y0 = init_amounts["y"]
    v0 = init_amounts["v_lp"]

    term_amounts = calculate_clmm_amounts(PT, Pa, Pb, L)
    v_lp_t = term_amounts["v_lp"]

    v_hodl = PT * x0 + y0
    delta_divergence = v_lp_t - v_hodl
    rel_divergence = (v_lp_t / v_hodl - ONE) if v_hodl > ZERO else ZERO

    return {
        "x_0": x0,
        "y_0": y0,
        "v_0": v0,
        "x_t": term_amounts["x"],
        "y_t": term_amounts["y"],
        "v_lp_t": v_lp_t,
        "v_hodl_t": v_hodl,
        "delta_divergence": delta_divergence,
        "relative_divergence": rel_divergence,
    }
