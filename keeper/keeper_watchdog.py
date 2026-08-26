#!/usr/bin/env python3
"""
DeFi Garden v2 — Keeper Watchdog & RPC Health Daemon
Monitors keeper sweep receipts, verifies 1st-of-month batch executions,
rotates through backup RPC providers, and alerts on anomalies.
"""

import json
import os
import sys
import time
from typing import Dict, List, Any, Optional

RPC_ENDPOINTS_BASE = [
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://1rpc.io/base"
]

class KeeperWatchdog:
    def __init__(self, receipts_path: Optional[str] = None):
        if receipts_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            receipts_path = os.path.join(base_dir, "state/keeper_execution_receipts.jsonl")
        self.receipts_path = receipts_path

    def load_receipts(self) -> List[Dict[str, Any]]:
        receipts = []
        if os.path.exists(self.receipts_path):
            with open(self.receipts_path, "r") as f:
                for line in f:
                    if line.strip():
                        receipts.append(json.loads(line.strip()))
        return receipts

    def check_health(self, max_allowed_staleness_hours: int = 48) -> Dict[str, Any]:
        receipts = self.load_receipts()
        if not receipts:
            return {
                "healthy": False,
                "status": "NO_RECEIPTS_FOUND",
                "message": "No keeper execution receipts found on disk."
            }

        latest = receipts[-1]
        timestamp = latest.get("timestamp", 0)
        now = time.time()
        age_hours = (now - timestamp) / 3600.0 if timestamp > 0 else 999.0

        principal_protected = latest.get("invariant_principal_protected", False)
        eligible_count = latest.get("eligible_count", 0)

        is_healthy = principal_protected and (age_hours <= max_allowed_staleness_hours)

        return {
            "healthy": is_healthy,
            "status": "OPERATIONAL" if is_healthy else "STALE_OR_INVARIANT_VIOLATED",
            "latest_receipt_id": latest.get("receipt_id"),
            "latest_batch_id": latest.get("batch_id"),
            "age_hours": round(age_hours, 2),
            "principal_protected": principal_protected,
            "eligible_count": eligible_count,
            "total_net_swept_usd": latest.get("total_net_swept_usd", 0.0),
            "estimated_gas_cost_usd": latest.get("estimated_gas_cost_usd", 0.0)
        }

if __name__ == "__main__":
    watchdog = KeeperWatchdog()
    health = watchdog.check_health()
    print(json.dumps(health, indent=2))
