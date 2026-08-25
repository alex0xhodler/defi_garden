"""
v2 Intent Framework Solvency & Escrow Engine for DeFi Garden
Implements 1.25x Over-Collateralization, 20% Tax Headroom, 
1-Month Liquid Escrow Buffer, Surplus Sponge, and Bounded Grace Tap logic.
"""

import json
import os
from typing import Dict, Any, Optional

class V2SolvencyEngine:
    def __init__(self, config_path: Optional[str] = None):
        if config_path is None:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            default_path = os.path.join(current_dir, "../config/risk_parameters.json")
            if os.path.exists(default_path):
                config_path = default_path
            elif os.path.exists("defi_garden/config/risk_parameters.json"):
                config_path = "defi_garden/config/risk_parameters.json"
            elif os.path.exists("config/risk_parameters.json"):
                config_path = "config/risk_parameters.json"
            else:
                config_path = "config/risk_parameters.json"

        with open(config_path, "r") as f:
            self.config = json.load(f)
            
        self.solvency_rules = self.config.get("v2_intent_framework_solvency", {})
        self.over_collat_mult = self.solvency_rules.get("over_collateralization_multiplier", 1.25)
        self.tax_headroom_mult = self.solvency_rules.get("tax_vat_headroom_multiplier", 1.20)
        self.conservative_apy_floor = self.solvency_rules.get("conservative_yield_floor_apy_pct", 5.0)
        self.escrow_months = self.solvency_rules.get("initial_liquid_escrow_months", 1)
        self.sponge_cap_months = self.solvency_rules.get("surplus_sponge_cap_months", 3)
        self.grace_tap_max_months = self.solvency_rules.get("bounded_grace_tap_max_months", 1)

    def calculate_required_collateral(
        self,
        monthly_bill_usd: float,
        conservative_apy_pct: Optional[float] = None
    ) -> Dict[str, float]:
        """
        Computes required principal deposit under v2 solvency formulas:
        C_required = ((12 * monthly_bill * 1.20_tax) / (r_conservative / 100)) * 1.25_buffer
        """
        r = conservative_apy_pct if conservative_apy_pct is not None else self.conservative_apy_floor
        tax_adjusted_monthly = monthly_bill_usd * self.tax_headroom_mult
        annual_liability = tax_adjusted_monthly * 12.0
        
        required_collateral = (annual_liability / (r / 100.0)) * self.over_collat_mult
        initial_escrow = tax_adjusted_monthly * self.escrow_months
        
        return {
            "monthly_bill_usd": round(monthly_bill_usd, 2),
            "tax_adjusted_monthly_usd": round(tax_adjusted_monthly, 2),
            "annual_liability_usd": round(annual_liability, 2),
            "applied_conservative_apy_pct": round(r, 2),
            "required_collateral_usd": round(required_collateral, 2),
            "initial_escrow_reserve_usd": round(initial_escrow, 2),
            "max_sponge_reserve_usd": round(tax_adjusted_monthly * self.sponge_cap_months, 2)
        }

    def simulate_monthly_settlement(
        self,
        principal_usd: float,
        escrow_reserve_usd: float,
        monthly_bill_usd: float,
        actual_monthly_yield_usd: float
    ) -> Dict[str, Any]:
        """
        Simulates monthly yield collection, billing debit, surplus sponging, or escrow tap.
        """
        tax_adjusted_bill = monthly_bill_usd * self.tax_headroom_mult
        max_sponge = tax_adjusted_bill * self.sponge_cap_months
        
        # Scenario A: Realized yield covers bill
        if actual_monthly_yield_usd >= tax_adjusted_bill:
            excess_yield = actual_monthly_yield_usd - tax_adjusted_bill
            new_escrow = min(max_sponge, escrow_reserve_usd + excess_yield)
            surplus_distributable = max(0.0, (escrow_reserve_usd + excess_yield) - max_sponge)
            
            return {
                "status": "HEALTHY_SURPLUS",
                "bill_settled": True,
                "bill_amount_paid_usd": round(tax_adjusted_bill, 2),
                "remaining_escrow_reserve_usd": round(new_escrow, 2),
                "surplus_distributable_usd": round(surplus_distributable, 2),
                "principal_invariant_preserved": True,
                "grace_tap_triggered": False
            }
            
        # Scenario B: Yield shortfall covered by escrow reserve
        shortfall = tax_adjusted_bill - actual_monthly_yield_usd
        if escrow_reserve_usd >= shortfall:
            new_escrow = escrow_reserve_usd - shortfall
            return {
                "status": "ESCROW_DEFICIT_COVERED",
                "bill_settled": True,
                "bill_amount_paid_usd": round(tax_adjusted_bill, 2),
                "remaining_escrow_reserve_usd": round(new_escrow, 2),
                "surplus_distributable_usd": 0.0,
                "principal_invariant_preserved": True,
                "grace_tap_triggered": False,
                "escrow_runway_months": round(new_escrow / tax_adjusted_bill, 2)
            }
            
        # Scenario C: Yield shortfall exceeds escrow -> Bounded 1-month Grace Tap
        remaining_shortfall = shortfall - escrow_reserve_usd
        max_grace_tap_allowed = tax_adjusted_bill * self.grace_tap_max_months
        
        if remaining_shortfall <= max_grace_tap_allowed:
            tapped_principal = remaining_shortfall
            return {
                "status": "EMERGENCY_GRACE_TAP_ACTIVE",
                "bill_settled": True,
                "bill_amount_paid_usd": round(tax_adjusted_bill, 2),
                "remaining_escrow_reserve_usd": 0.0,
                "tapped_principal_usd": round(tapped_principal, 2),
                "principal_invariant_preserved": False,
                "grace_tap_triggered": True,
                "action_required": "TOPUP_ALERT_DISPATCHED_TO_TELEGRAM"
            }
        else:
            return {
                "status": "INSOLVENT_BILL_PAUSED",
                "bill_settled": False,
                "bill_amount_paid_usd": 0.0,
                "remaining_escrow_reserve_usd": round(escrow_reserve_usd, 2),
                "principal_invariant_preserved": True,
                "grace_tap_triggered": False,
                "action_required": "CARD_AUTO_FROZEN_TO_PROTECT_PRINCIPAL"
            }
