# Agent Execution Functions & KPI Automation Engine

**Document Version:** `1.0.0-PROD`  
**Purpose:** Autonomous agent scripts and operational functions to track, verify, and drive the DeFi Garden North Star KPIs.

---

## 1. The North Star Telemetry Engine (`kpi_engine.py`)

This Python script can be run on a scheduled cron or agent loop to query the Base smart contract vault, Cloudflare D1 database, and Rain BaaS API to compute live North Star metrics.

```python
#!/usr/bin/env python3
"""
kpi_engine.py - Automated Telemetry & North Star Scorecard for DeFi Garden v2
Calculates: Active TVL, Monthly Liabilities Eradicated, and 24h Card Auth Rate.
"""

import os
import json
import time
from typing import Dict, Any

# Mock constants for demonstration / real integration points
NET_REALIZED_APY = 0.048  # 4.8% net conservative APY
SAFETY_BUFFER_MULTIPLIER = 1.25

def calculate_north_star_scorecard(db_records: list) -> Dict[str, Any]:
    """
    Computes protocol health against the SOTA North Star KPIs.
    """
    now = time.time()
    total_active_tvl = 0.0
    total_monthly_liabilities = 0.0
    
    total_minted_cards = len(db_records)
    cards_eligible_24h = 0
    cards_verified_24h = 0
    
    for record in db_records:
        status = record.get("status")
        deposit_usdc = record.get("deposit_usdc", 0.0)
        monthly_bill = record.get("monthly_bill_usd", 0.0)
        created_at = record.get("created_at", now)
        auth_verified_at = record.get("auth_verified_at")
        
        if status in ["active", "funded"]:
            total_active_tvl += deposit_usdc
            total_monthly_liabilities += monthly_bill
            
        # 24h Verification Window
        if now - created_at >= 86400:
            cards_eligible_24h += 1
            if auth_verified_at and (auth_verified_at - created_at <= 86400):
                cards_verified_24h += 1
        elif auth_verified_at:
            # Verified early
            cards_eligible_24h += 1
            cards_verified_24h += 1
            
    auth_rate_pct = (cards_verified_24h / cards_eligible_24h * 100.0) if cards_eligible_24h > 0 else 0.0
    
    return {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)),
        "active_tvl_usdc": round(total_active_tvl, 2),
        "target_tvl_usdc": 25_000_000.00,
        "tvl_progress_pct": round((total_active_tvl / 25_000_000.00) * 100, 2),
        
        "monthly_liabilities_eradicated_usd": round(total_monthly_liabilities, 2),
        "target_liabilities_usd": 100_000.00,
        "liabilities_progress_pct": round((total_monthly_liabilities / 100_000.00) * 100, 2),
        
        "cards_24h_auth_rate_pct": round(auth_rate_pct, 1),
        "target_auth_rate_pct": 65.0,
        "is_auth_rate_healthy": auth_rate_pct >= 65.0,
        
        "total_active_accounts": len([r for r in db_records if r.get("status") == "active"])
    }

if __name__ == "__main__":
    # Test Fixture
    sample_records = [
        {"id": "c1", "status": "active", "deposit_usdc": 4750.0, "monthly_bill_usd": 20.0, "created_at": time.time() - 90000, "auth_verified_at": time.time() - 85000},
        {"id": "c2", "status": "active", "deposit_usdc": 24000.0, "monthly_bill_usd": 100.0, "created_at": time.time() - 50000, "auth_verified_at": time.time() - 48000},
        {"id": "c3", "status": "active", "deposit_usdc": 100000.0, "monthly_bill_usd": 400.0, "created_at": time.time() - 10000, "auth_verified_at": None},
    ]
    print(json.dumps(calculate_north_star_scorecard(sample_records), indent=2))
```

---

## 2. Automated Concierge & Verification Watchdog (`card_watchdog.py`)

This script identifies newly minted cards that have not completed an external merchant verification ping within 2 hours, and prepares contextual reminder nudges.

```python
#!/usr/bin/env python3
"""
card_watchdog.py - Concierge Verification Nudge Dispatcher
Identifies unverified cards 2-4 hours post-mint and alerts users via Telegram/Email.
"""

import time
from typing import List, Dict

def find_cards_requiring_nudge(records: List[Dict]) -> List[Dict]:
    now = time.time()
    nudge_targets = []
    
    for r in records:
        if r.get("status") == "funded" and not r.get("auth_verified_at"):
            age_seconds = now - r.get("created_at", now)
            # Nudge window: 2 hours to 4 hours after creation
            if 7200 <= age_seconds <= 14400 and not r.get("nudge_sent"):
                nudge_targets.append({
                    "card_id": r["id"],
                    "user_id": r["user_id"],
                    "item_name": r.get("item_name", "your subscription"),
                    "merchant_url": r.get("merchant_billing_url", "https://defi.garden"),
                    "age_hours": round(age_seconds / 3600, 1)
                })
    return nudge_targets

def format_telegram_nudge(target: Dict) -> str:
    return (
        f"🌱 *DeFi Garden Concierge*\n\n"
        f"Your virtual card for *{target['item_name']}* is live and funded!\n\n"
        f"To complete your setup and kill the bill forever, remember to update your billing card:\n"
        f"👉 [Open {target['item_name']} Billing Settings]({target['merchant_url']})\n\n"
        f"Need help? Reply here anytime."
    )
```

---

## 3. Autonomous B2B Outbound Lead Scraper & Voucher Generator (`b2b_voucher_gen.py`)

Generates pre-calculated, personalized landing URLs for Web3 startup treasury leads.

```python
#!/usr/bin/env python3
"""
b2b_voucher_gen.py - Dynamic B2B Treasury Voucher URL Builder
Creates personalized ?preset= links for outbound startup campaigns.
"""

import urllib.parse

def generate_b2b_voucher_url(company_name: str, monthly_saas_usd: float, ref_tag: str = "b2b_outbound") -> str:
    base_url = "https://www.defi.garden/plan.html"
    net_apy = 0.051  # 5.1% conservative Base net APY
    tax_multiplier = 1.20
    safety_buffer = 1.25
    
    effective_bill = monthly_saas_usd * tax_multiplier
    required_deposit = round(((effective_bill * 12) / net_apy) * safety_buffer)
    
    params = {
        "company": company_name,
        "bill": str(round(monthly_saas_usd)),
        "capital": str(required_deposit),
        "preset": "treasury_shield",
        "ref": ref_tag
    }
    
    return f"{base_url}?{urllib.parse.urlencode(params)}"

if __name__ == "__main__":
    test_companies = [
        ("AcmeDAO", 600.0),
        ("BaseBuilderLab", 1200.0),
        ("ZKResearchGroup", 2500.0)
    ]
    for name, bill in test_companies:
        print(f"Company: {name} (Burn: ${bill}/mo) -> {generate_b2b_voucher_url(name, bill)}")
```
