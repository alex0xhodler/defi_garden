#!/usr/bin/env python3
"""
compute-forecasts.py — TimesFM 3.0 Time-Series Forecasting & DeFi Health Score.

Enriches the top N (default: 100) pools in `data/pools-snapshot.json` with:
1. `forecast`: 14-day zero-shot probabilistic forecast (p10, p50, p90, forwardDelta, trajectory)
2. `defiScore`: Multi-factor on-chain health score (0-100, AAA-BBB rating, breakdown)

Uses:
- Local DefiLlama history from `data/history/*.json`
- On-chain archival telemetry via Alchemy RPC (for supported EVM lending pools)
- Zero-shot TimesFM 3.0 inference (CPU, batch-processed)
"""

import os
import sys
import glob
import json
import time
import argparse
import urllib.request
import numpy as np

# Fallback Alchemy key if not in environment
DEFAULT_ALCHEMY_KEY = "dKXngnd_Ab-UtHfz-Pw8V"

# Aave v3 Ethereum Contracts
AAVE_POOL_ADDR = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
A_USDC_ADDR = "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c"
VAR_DEBT_USDC_ADDR = "0x72E95b8931767C79bA4EeE721354d6E99a61D004"


def fetch_onchain_lending_metrics(rpc_url):
    """Fetch on-chain utilization and 24h transfer dynamics via Alchemy."""
    try:
        req = urllib.request.Request(
            rpc_url,
            json.dumps({"jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []}).encode(),
            {"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            curr_block = int(json.loads(resp.read().decode())["result"], 16)

        total_supply_data = "0x18160ddd"

        def get_total_supply(addr, block):
            payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "eth_call",
                "params": [{"to": addr, "data": total_supply_data}, hex(block)],
            }
            r = urllib.request.Request(rpc_url, json.dumps(payload).encode(), {"Content-Type": "application/json"})
            with urllib.request.urlopen(r, timeout=6) as response:
                res = json.loads(response.read().decode())
                return int(res["result"], 16) / 1e6

        util_history = []
        for d in [28, 21, 14, 7, 0]:
            b = curr_block - d * 7200
            sup = get_total_supply(A_USDC_ADDR, b)
            deb = get_total_supply(VAR_DEBT_USDC_ADDR, b)
            u = (deb / sup * 100.0) if sup > 0 else 90.0
            util_history.append((d, sup, deb, u))

        transfer_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "alchemy_getAssetTransfers",
            "params": [
                {
                    "fromBlock": hex(curr_block - 7200),
                    "toBlock": hex(curr_block),
                    "contractAddresses": [A_USDC_ADDR],
                    "category": ["erc20"],
                    "maxCount": "0x3e8",
                }
            ],
        }
        r_tr = urllib.request.Request(
            rpc_url, json.dumps(transfer_payload).encode(), {"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(r_tr, timeout=8) as response:
            res_tr = json.loads(response.read().decode())
            transfers = res_tr.get("result", {}).get("transfers", [])

        mints = [t for t in transfers if t.get("from") == "0x0000000000000000000000000000000000000000"]
        burns = [t for t in transfers if t.get("to") == "0x0000000000000000000000000000000000000000"]

        inflows = sum(t.get("value") or 0 for t in mints)
        outflows = sum(t.get("value") or 0 for t in burns)
        sorted_mints = sorted([t.get("value") or 0 for t in mints], reverse=True)
        whale_share = (sum(sorted_mints[:3]) / inflows * 100.0) if inflows > 0 else 50.0

        return {
            "curr_block": curr_block,
            "latest_supply": util_history[-1][1],
            "latest_borrow": util_history[-1][2],
            "latest_utilization": util_history[-1][3],
            "util_history": util_history,
            "inflows_24h": inflows,
            "outflows_24h": outflows,
            "net_flow_24h": inflows - outflows,
            "unique_depositors": len(set(t.get("to") for t in mints)),
            "unique_redeemers": len(set(t.get("from") for t in burns)),
            "whale_share_pct": whale_share,
        }
    except Exception as e:
        print(f"  [OnChain] RPC fetch warning: {e}. Using empirical defaults.")
        return None


def compute_defi_score(current_apy, p10, p50, p90, forward_delta, tvl_usd, onchain_info=None):
    """
    Compute DeFi Health & Safety Score (0-100).
    4 Pillars:
      - Stability (35 pts): Spread of forecast bounds relative to current APY
      - Sustainability (25 pts): Forward delta (rewards upward/steady, penalizes decay)
      - Stickiness (25 pts): Whale decentralization & user retention
      - Liquidity & Headroom (15 pts): Absolute TVL depth + rate kink buffer
    """
    spread = max(0.0, p90 - p10)
    denom = max(current_apy, 2.0)
    rel_vol = spread / denom
    stability = max(0.0, min(35.0, 35.0 * (1.0 - (rel_vol / 2.5))))

    if forward_delta >= 0:
        sustainability = min(25.0, 20.0 + forward_delta * 4.0)
    else:
        sustainability = max(0.0, 20.0 + forward_delta * 3.0)

    if onchain_info:
        whale_share = onchain_info.get("whale_share_pct", 50.0)
        whale_factor = max(0.0, (100.0 - whale_share) / 100.0)
        net_churn = onchain_info.get("unique_depositors", 0) - onchain_info.get("unique_redeemers", 0)
        churn_factor = 1.0 if net_churn >= 0 else max(0.5, 1.0 + net_churn / 100.0)
        stickiness = 25.0 * (0.6 * whale_factor + 0.4 * churn_factor)
        util = onchain_info.get("latest_utilization", 90.0)
        headroom = max(0.2, (95.0 - util) / 15.0) if util < 95.0 else 0.2
    else:
        # Institutional TVL liquidity proxy
        stickiness = 19.5
        headroom = 0.8

    tvl_m = (tvl_usd or 0) / 1e6
    tvl_factor = min(1.0, tvl_m / 500.0)
    liquidity = 15.0 * (0.7 * tvl_factor + 0.3 * headroom)

    total = round(stability + sustainability + stickiness + liquidity, 1)
    total = max(0.0, min(100.0, total))

    rating = "AAA" if total >= 85 else "AA" if total >= 70 else "A" if total >= 55 else "BBB" if total >= 40 else "HIGH RISK"

    return {
        "score": total,
        "rating": rating,
        "breakdown": {
            "stability": round(stability, 1),
            "sustainability": round(sustainability, 1),
            "stickiness": round(stickiness, 1),
            "liquidity": round(liquidity, 1),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="TimesFM 3.0 Forecaster & DeFi Score Engine")
    parser.add_argument("--snapshot", default="data/pools-snapshot.json", help="Path to pools snapshot JSON")
    parser.add_argument("--history-dir", default="data/history", help="Directory containing history JSONs")
    parser.add_argument("--limit", type=int, default=100, help="Number of top pools to forecast (default: 100)")
    parser.add_argument("--horizon", type=int, default=14, help="Forecast horizon days (default: 14)")
    parser.add_argument("--out", default=None, help="Output snapshot path (default: overwrite in place)")
    args = parser.parse_args()

    out_path = args.out or args.snapshot
    print(f"🚀 Starting TimesFM 3.0 Pipeline (Limit: top {args.limit} pools, Horizon: {args.horizon}d)...")

    if not os.path.exists(args.snapshot):
        print(f"Error: Snapshot {args.snapshot} not found.")
        sys.exit(1)

    with open(args.snapshot, "r") as f:
        snapshot = json.load(f)

    pools = snapshot.get("pools", [])
    if not pools:
        print("Error: No pools in snapshot.")
        sys.exit(1)

    # 1. Load historical series from history-dir
    print(f"📂 Loading historical series from {args.history_dir}...")
    history_files = sorted(glob.glob(os.path.join(args.history_dir, "*.json")))
    series_by_pool = {}
    for fpath in history_files:
        d = os.path.basename(fpath).replace(".json", "")
        with open(fpath, "r") as f:
            try:
                h = json.load(f)
                for pid, pt in h.get("pools", {}).items():
                    if pid not in series_by_pool:
                        series_by_pool[pid] = []
                    series_by_pool[pid].append((d, float(pt[0]), float(pt[1])))
            except Exception:
                pass

    print(f"   Found {len(series_by_pool)} pools in historical files.")

    # 2. Identify top N pools by TVL
    eligible = [p for p in pools if p.get("pool") in series_by_pool and len(series_by_pool[p["pool"]]) >= 14]
    eligible.sort(key=lambda p: float(p.get("tvlUsd") or 0), reverse=True)
    target_pools = eligible[: args.limit]
    print(f"🎯 Selected {len(target_pools)} top railed pools for forecasting.")

    # 3. Fetch optional on-chain lending telemetry via Alchemy
    alchemy_key = os.environ.get("ALCHEMY_KEY") or DEFAULT_ALCHEMY_KEY
    rpc_url = f"https://eth-mainnet.g.alchemy.com/v2/{alchemy_key}"
    print(f"🔗 Checking Alchemy RPC ({rpc_url[:35]}...)...")
    onchain_telemetry = fetch_onchain_lending_metrics(rpc_url)

    # 4. Initialize TimesFM 3.0 Evaluator
    print("🧠 Initializing TimesFM 3.0 Evaluator (google/timesfm-3.0-pytorch, CPU)...")
    try:
        from timesfm3 import ModelConfig, TimesFM3Evaluator

        config = ModelConfig(
            checkpoint_path="google/timesfm-3.0-pytorch",
            per_core_batch_size=16,
            device="cpu",
        )
        forecaster = TimesFM3Evaluator(config)
        print("   TimesFM 3.0 initialized successfully.")
    except Exception as e:
        print(f"❌ Could not load TimesFM 3.0: {e}")
        print("   Exiting without corrupting snapshot.")
        sys.exit(1)

    # 5. Prepare batch inference
    batch_records = []
    for p in target_pools:
        pid = p["pool"]
        history = series_by_pool[pid]
        apys = [pt[1] for pt in history]
        tvls = [pt[2] for pt in history]

        apys = apys[-30:]
        tvls = tvls[-30:]
        context_len = len(apys)

        target = np.array(apys, dtype=np.float32).reshape(1, context_len)
        tvl_cov = (np.array(tvls, dtype=np.float32) / 1e9).reshape(1, context_len)

        is_aave_usdc = p.get("project") == "aave-v3" and "USDC" in p.get("symbol", "") and p.get("chain") == "Ethereum"
        if is_aave_usdc and onchain_telemetry:
            util_vals = np.linspace(
                onchain_telemetry["util_history"][0][3], onchain_telemetry["latest_utilization"], context_len
            ).astype(np.float32).reshape(1, context_len)
            covs = np.concatenate([tvl_cov, util_vals], axis=0) # (2, context_len)
            cov_channels = 2
        else:
            covs = tvl_cov # (1, context_len)
            cov_channels = 1

        batch_records.append({
            "pool": p,
            "target": target,
            "covs": covs,
            "channels": cov_channels,
            "current_apy": apys[-1],
            "tvl_usd": tvls[-1],
        })

    # 6. Execute inference in shape-matched groups
    print("⚡ Running batch inference...")
    t0 = time.time()
    results_by_pool_id = {}

    for num_channels in [1, 2]:
        sub_group = [r for r in batch_records if r["channels"] == num_channels]
        if not sub_group:
            continue
        print(f"   Forecasting group with {num_channels} covariate channel(s) ({len(sub_group)} pools)...")
        contexts = [r["target"] for r in sub_group]
        covariates = [r["covs"] for r in sub_group]

        outputs = list(
            forecaster.predict_batch(
                contexts=contexts,
                horizon=args.horizon,
                past_only_covariates=covariates,
                return_quantiles=True,
                use_symmetric_averaging=False,
            )
        )

        for rec, out in zip(sub_group, outputs):
            pid = rec["pool"]["pool"]
            fc = out.forecast[0]
            q = out.quantiles[0]
            p10 = float(np.mean(q[:, 0]))
            p50 = float(np.mean(q[:, 4]))
            p90 = float(np.mean(q[:, 8]))
            forward_delta = round(p50 - rec["current_apy"], 2)

            onchain_info = onchain_telemetry if (rec["channels"] == 2) else None
            score = compute_defi_score(rec["current_apy"], p10, p50, p90, forward_delta, rec["tvl_usd"], onchain_info)

            results_by_pool_id[pid] = {
                "forecast": {
                    "horizonDays": args.horizon,
                    "p10": round(p10, 2),
                    "p50": round(p50, 2),
                    "p90": round(p90, 2),
                    "forwardDelta": forward_delta,
                    "trajectory": [round(float(x), 2) for x in fc],
                },
                "defiScore": score,
            }

    t1 = time.time()
    print(f"✅ Inferred {len(results_by_pool_id)} forecasts in {t1 - t0:.2f}s (avg {(t1 - t0)/max(1, len(results_by_pool_id)):.3f}s/pool)")

    # 7. Enrich snapshot pools
    enriched_count = 0
    for p in pools:
        pid = p.get("pool")
        if pid in results_by_pool_id:
            p["forecast"] = results_by_pool_id[pid]["forecast"]
            p["defiScore"] = results_by_pool_id[pid]["defiScore"]
            enriched_count += 1
        else:
            if "forecast" not in p:
                p["forecast"] = None
            if "defiScore" not in p:
                p["defiScore"] = None

    snapshot["forecastMeta"] = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": "google/timesfm-3.0-pytorch",
        "horizonDays": args.horizon,
        "enrichedPoolsCount": enriched_count,
    }

    # 8. Write atomically
    tmp_out = out_path + ".tmp"
    with open(tmp_out, "w") as f:
        json.dump(snapshot, f, indent=2)
    os.replace(tmp_out, out_path)
    print(f"💾 Saved enriched snapshot with {enriched_count} forecasts to {out_path}")


if __name__ == "__main__":
    main()
