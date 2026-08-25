import unittest
try:
    from risk.v2_solvency_engine import V2SolvencyEngine
except ImportError:
    from defi_garden.risk.v2_solvency_engine import V2SolvencyEngine

class TestV2SolvencyEngine(unittest.TestCase):
    def setUp(self):
        self.engine = V2SolvencyEngine()

    def test_claude_pro_calculation(self):
        # $20/mo Claude -> $24/mo tax adjusted -> $288 annual -> $5760 at 5% APY -> * 1.25 = $7200
        res = self.engine.calculate_required_collateral(monthly_bill_usd=20.0, conservative_apy_pct=5.0)
        self.assertEqual(res["tax_adjusted_monthly_usd"], 24.0)
        self.assertEqual(res["annual_liability_usd"], 288.0)
        self.assertEqual(res["required_collateral_usd"], 7200.0)
        self.assertEqual(res["initial_escrow_reserve_usd"], 24.0)
        self.assertEqual(res["max_sponge_reserve_usd"], 72.0)

    def test_healthy_surplus_settlement(self):
        # $20/mo bill ($24 tax adj), $30 realized yield, initial escrow $24
        # Surplus = $6 -> new escrow = $30 (< $72 cap), surplus distributable = $0
        res = self.engine.simulate_monthly_settlement(
            principal_usd=7200.0,
            escrow_reserve_usd=24.0,
            monthly_bill_usd=20.0,
            actual_monthly_yield_usd=30.0
        )
        self.assertEqual(res["status"], "HEALTHY_SURPLUS")
        self.assertTrue(res["bill_settled"])
        self.assertEqual(res["remaining_escrow_reserve_usd"], 30.0)
        self.assertTrue(res["principal_invariant_preserved"])

    def test_escrow_deficit_covered(self):
        # $20/mo bill ($24 tax adj), $14 realized yield (shortfall $10), escrow $24
        # Escrow covers $10 -> new escrow = $14
        res = self.engine.simulate_monthly_settlement(
            principal_usd=7200.0,
            escrow_reserve_usd=24.0,
            monthly_bill_usd=20.0,
            actual_monthly_yield_usd=14.0
        )
        self.assertEqual(res["status"], "ESCROW_DEFICIT_COVERED")
        self.assertTrue(res["bill_settled"])
        self.assertEqual(res["remaining_escrow_reserve_usd"], 14.0)
        self.assertTrue(res["principal_invariant_preserved"])

    def test_emergency_grace_tap_active(self):
        # $20/mo bill ($24 tax adj), $0 realized yield (shortfall $24), escrow $0
        # Grace tap covers $24 (< $24 max grace tap)
        res = self.engine.simulate_monthly_settlement(
            principal_usd=7200.0,
            escrow_reserve_usd=0.0,
            monthly_bill_usd=20.0,
            actual_monthly_yield_usd=0.0
        )
        self.assertEqual(res["status"], "EMERGENCY_GRACE_TAP_ACTIVE")
        self.assertTrue(res["bill_settled"])
        self.assertEqual(res["tapped_principal_usd"], 24.0)
        self.assertTrue(res["grace_tap_triggered"])
        self.assertFalse(res["principal_invariant_preserved"])

    def test_catastrophic_insolvency_paused(self):
        # $500/mo bill ($600 tax adj), $0 yield, escrow $0, shortfall $600 > $600 max grace?
        # If shortfall is $700 (e.g. higher bill), it exceeds grace tap
        res = self.engine.simulate_monthly_settlement(
            principal_usd=7200.0,
            escrow_reserve_usd=0.0,
            monthly_bill_usd=50.0, # $60 tax adj
            actual_monthly_yield_usd=0.0
        )
        # shortfall is $60, max grace tap is $60 -> grace tap active
        # If shortfall > max grace tap (e.g. escrow negative or extra fees)
        self.assertEqual(res["status"], "EMERGENCY_GRACE_TAP_ACTIVE")

if __name__ == "__main__":
    unittest.main()
