#!/usr/bin/env python3
"""
Unit Tests for DeFi Garden Keeper Multi-Card Batch Engine (Tickets KO-01 & KO-02)
Verifies multi-card batch execution, gas amortization, ΔPrincipal ≡ 0 invariant, and JSONL receipt logging.
"""

import json
import os
import tempfile
import time
import unittest
from keeper.keeper_engine import KeeperEngine, VaultPosition

class TestKeeperBatchEngine(unittest.TestCase):
    def setUp(self):
        self.engine = KeeperEngine()
        self.now = int(time.time())

    def test_multi_card_batched_sweeps_success(self):
        """Ticket KO-01: Multi-card batch sweeps aggregate correctly and amortize gas."""
        vaults = [
            VaultPosition(
                vault_id="v_claude",
                owner="0x0d79860366926b7685428dcd2b2d1eefcbd45178",
                item_intent="claude-pro",
                deposited_principal_usd=4750.0,
                total_equity_usd=4875.0,  # $125 yield accrued (eligible)
                monthly_liability_usd=20.0,
                card_proxy_address="0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b",
                oracle_timestamp=self.now
            ),
            VaultPosition(
                vault_id="v_cursor",
                owner="0x1111111111111111111111111111111111111111",
                item_intent="cursor-pro",
                deposited_principal_usd=4750.0,
                total_equity_usd=4830.0,  # $80 yield accrued (eligible)
                monthly_liability_usd=20.0,
                card_proxy_address="0x2222222222222222222222222222222222222222",
                oracle_timestamp=self.now
            ),
            VaultPosition(
                vault_id="v_spotify_ineligible",
                owner="0x3333333333333333333333333333333333333333",
                item_intent="spotify",
                deposited_principal_usd=2500.0,
                total_equity_usd=2520.0,  # Only $20 yield accrued (< $50 threshold -> skipped)
                monthly_liability_usd=11.99,
                card_proxy_address="0x3333333333333333333333333333333333333333",
                oracle_timestamp=self.now
            )
        ]

        batch = self.engine.evaluate_batch_sweeps(vaults, gas_price_gwei=0.05, now_ts=self.now)
        self.assertTrue(batch["is_executable"])
        self.assertEqual(batch["eligible_count"], 2)
        self.assertEqual(batch["skipped_count"], 1)
        self.assertEqual(batch["total_gross_yield_usd"], 205.0)  # $125 + $80
        self.assertEqual(batch["total_protocol_fees_usd"], 41.0)  # 20% cut = $41
        self.assertEqual(batch["total_net_swept_usd"], 164.0)  # $100 + $64
        self.assertLess(batch["gas_cost_per_user_usd"], 0.05)  # Gas amortized to <$0.05 per user on Base L2 (at 0.05 Gwei)

    def test_deterministic_receipt_logging(self):
        """Ticket KO-02: Logs verifiable execution receipt to JSONL ledger."""
        vaults = [
            VaultPosition(
                vault_id="v_claude",
                owner="0x0d79860366926b7685428dcd2b2d1eefcbd45178",
                item_intent="claude-pro",
                deposited_principal_usd=4750.0,
                total_equity_usd=4875.0,
                monthly_liability_usd=20.0,
                card_proxy_address="0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b",
                oracle_timestamp=self.now
            )
        ]

        with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            batch = self.engine.evaluate_batch_sweeps(vaults, gas_price_gwei=3.0, now_ts=self.now)
            rcpt_id = self.engine.record_execution_receipt(batch, receipt_log_path=tmp_path)
            self.assertTrue(rcpt_id.startswith("rcpt_"))

            with open(tmp_path, "r") as f:
                lines = f.readlines()
            self.assertEqual(len(lines), 1)
            record = json.loads(lines[0])
            self.assertEqual(record["receipt_id"], rcpt_id)
            self.assertTrue(record["invariant_principal_protected"])
            self.assertEqual(record["total_net_swept_usd"], 100.0)
            self.assertEqual(record["sweeps"][0]["item_intent"], "claude-pro")
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

if __name__ == "__main__":
    unittest.main()
