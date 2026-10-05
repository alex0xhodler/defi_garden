# Red team: proposed next steps W4 (protocol safety pages) + W3 (monthly report)

**Date**: 2026-10-05 · **Checked against**: `main` @ `1ac77b2` (PRs #500, #502, #503, #504, #505, #506, #507) and `docs/seo-turnaround-plan-2026-10.md`, including the addendum that sits only on `feature/seo-bing-ai-search-optimization`.

## Verdict

**Don't build W4 as specified. Build W3, but not this version, and not yet.** W3 tells journalists to look at `/forecast-accuracy`, and that page is **not a track record**. It compares *today's* forecasts with APYs recorded on Sep 19. W4 answers "Is Aave safe?" with a score that has **no security inputs** and gets half its points from a forecast that **doesn't beat "the rate stays where it is."** Running outreach on top of those two problems is the quickest way to lose the one asset the whole strategy depends on: honest numbers.

---

## Finding 1: `/forecast-accuracy` is not a track record (P0: live and indexable)

**The code:** `generate-forecast-scorecard.js` takes the forecasts in `data/pools-snapshot.json` (made **today**) and compares them with `data/history/` file `[0]` → file `[14]` (Sep 5 → Sep 19). None of those forecasts existed on Sep 5. Yet the page says *"Public Track Record · Evaluated across immutable daily snapshots · Horizon 2026-09-05 → 2026-09-19"*. Its numbers change every day while the stated window never moves. The misses table presents today's median forecast (e.g. vesper 22.27%) as if it were the prediction for Sep 19.

**An honest re-run.** I used forecasts that were actually made, recovered from the git history of `data/pools-snapshot.json` and filtered the same way as the page (TVL ≥ $100K, LP pools excluded):

| Forecast made → checked | Pools | Actual inside forecast range | Model avg error | **Avg error if you assume "no change"** | Model closer / "no change" closer |
|---|---|---|---|---|---|
| Sep 12 → Sep 26 | 2,672 | 71.6% | 1.70 pp | **1.33 pp** | 30% / 33% |
| Sep 20 → Oct 4 | 2,587 | 71.2% | 1.02 pp | **1.09 pp** | 28% / 34% |

**What this says:** the range holds up, with about 71% of actual rates inside it. That's below the 80% a p10–p90 range promises, but stable. The **median forecast doesn't beat a naive "no change" guess**: it's worse on one run and about the same on the other. The typical range is only **0.12 pp wide**, so the model mostly predicts a flat line, and most DeFi yields barely move over 14 days. Two runs is a small sample. But it's the sample you have, and it's the first test a quant journalist will run.

The page copy has the same problem. *"probabilistic machine learning models trained on volatility, TVL migration…"* describes something else: the pipeline is TimesFM 3.0, a pre-trained foundation model run without any training on your data (`compute-forecasts.py:315`). *"No other yield aggregator publishes predictive failure"* is an unverifiable superlative, the same kind of claim you removed from `ai-info` on Oct 4.

## Finding 2: the DeFi Score isn't a safety score, which rules out W4 as specified

`compute-forecasts.py:181` builds the score from four parts:

- **Stability (35 points):** how wide the forecast range is, plus a crash-risk penalty.
- **Sustainability (25):** organic yield share plus the forecast's direction.
- **Stickiness (25):** whether depositors stay.
- **Liquidity (15):** TVL up to $500M, plus utilization.

- **There are no security inputs.** No audits, exploit history, oracle design, admin keys, governance, collateral quality or curator risk. The W4 spec promises *"Smart contract audit verification, oracle architecture, and withdrawal capacity"*, and none of that exists in the pipeline. Shipping that copy means making up facts on the highest-stakes page type in crypto search.
- **50 of the 100 points come from the forecast**, which doesn't beat a naive guess (Finding 1).
- **Stickiness is a fixed guess for most pools.** 53% of scored pools get **exactly 21.2/25**, because the share of deposits held by large wallets is assumed, not measured, whenever on-chain data is missing. About 90% sit between 20.8 and 21.2. Pool pages still present it as a measurement.
- **What follows:** a pool with a dead-flat yield scores high right up to the day it's exploited. *"Is X safe? Score 92"* followed by an exploit is the screenshot that ends the brand.
- **The copy still says "safety" and "AAA" in places.** The code comment calls it a *"Health & Safety Score"*. The landing hero still says *"Institutional-grade health ratings (0–100 AAA)"*, shows an *"AAA–A Rated"* badge, and promises *"Quant AI"* and *"zero surprise cliff decay"* (`landing.js:454-459`, `translations.js:291/1386`). Pool pages correctly hide the letter grades; the landing page doesn't.

## Finding 3: W4 has too few pages behind it and no authority to rank

- The 100 W1 pages cover **61 protocols**. Only **5 have five or more pages**: Morpho Blue (11), Aave V3 (6), Ondo (6), Sky (6) and BlackRock BUIDL (5). Two of those five are permissioned. For most protocols, "aggregate score across all pools" would be an average of one or two pools.
- **Morpho Blue risk depends on each market and its curator.** A protocol-wide average is the wrong unit.
- **"Is Aave safe" results are dominated by high-authority sites**, and the topic is YMYL. With about 0 referring domains you'd land at position 50–80, the problem this whole plan exists to solve. W4 needs W3's links first, not the reverse.
- **W1 went live today.** Its kill-switch check is around Nov 4, so W4 would be built on top of W1 before W1 has proven itself.

## Finding 4: shipped work that contradicts the plan

- **False titles on about 1,000 indexable pages.** The "Ranked by Risk" titles shipped (#502), but the table that makes them true (LH3, "Top 5 by DeFi Score") didn't. `/tokens/usdc` and `/chains/polygon` mention "DeFi Score" **zero** times and still say *"ranked by TVL"*.
- **Phase 1 shipped Oct 4**, before the N6 spam check (Oct 9–10) and while the update was still rolling out. That check is now muddied. Mark Oct 4 in GSC and compare changed and unchanged page groups.
- **Chain pages still carry the waitlist card** ("Card doesn't exist yet") and mock card text ("DEBIT METAL … VALID 08/31").
- **What's fine:** the BUIDL 🔒 access flag on chain pages, "Who can access it" on pool pages, the chain count fix (42 chains, not 3), and the W1 entry bar (≥ $10M TVL, ≥ 30 days of history, ≥ 0.5% APY), all as specified.

---

## Red team on W3 as proposed

- **"Automated monthly report" automates the cheap part.** What earns links is the hook and the outreach, and both are your job. Build report #1 by hand as one page. Automate it in month 3, and only if it earned links.
- **"Forecast accuracy snapshot, with a direct link to /forecast-accuracy":** not until Finding 1 is fixed.
- **"Real yield" means two different things:** yield paid from protocol revenue (crypto usage) or yield after inflation (finance usage). Pick one and define it on the page.
- **A median stablecoin yield for each of four chains is a dashboard, not a story.** Journalists cite a finding. Hooks you can defend with your own data today:
  1. **"X% of headline APY on the top N stablecoin pools is token emissions"**: reward APY over total APY, weighted by TVL.
  2. **"DeFi stablecoin yield vs the 3-month T-bill: the spread is Y pp"**: T-bill rate from FRED. It never goes stale and can recur every month.
  3. **"We tested our own yield forecasts against 'nothing changes'. Here's what happened."**: counterintuitive, honest, and something only you can publish. This is the one that sets the brand.
- **"10 referring domains by Nov 30" is realistic only if you count the easy ones:**
  - MCP registries for W5 (the official MCP Registry, Smithery, Glama, PulseMCP, mcp.so, awesome-mcp-servers): about 5 domains in an afternoon. Most links will be nofollow, but they're still referring domains and still get you found by AI tools.
  - Data posts on the DAO forums you're active in (Gearbox, Accountable).
  - Media coverage: plan for 0–2 pickups.
- **Pitch one outlet first** with a 48-hour exclusive (DL News, Blockworks or The Defiant data desks) rather than emailing everyone at once.

---

## Revised next steps (replaces the proposed items 1 and 2)

| # | Ship | Size | Why it goes first |
|---|---|---|---|
| **P0-1** | Pull `/forecast-accuracy`: noindex it and replace the headline numbers with "Methodology rebuild: first honest results Oct 19", **or** ship P0-2 today | 15 min | A false track record is live on a YMYL page |
| **P0-2** | **Forecast record.** CI writes `data/forecasts/YYYY-MM-DD.json` (pool → p10/p50/p90 plus the date it was made). Backfill from the git history of `data/pools-snapshot.json`; forecasts from Sep 11 onward are recoverable. The scorecard checks **only forecasts that were actually made**, one row per run, with a "no change" comparison column and a skill score (`1 − model error ÷ no-change error`) | 1 day | Turns a liability into the asset W2 was meant to be. The script below is the starting point |
| **P0-3** | Make the titles true: ship LH3 ("Top 5 by DeFi Score, accessible pools only") **or** revert "Ranked by Risk" | ½ day | False claim on about 1,000 indexable pages |
| **P0-4** | **Score copy:** call it "DeFi Score: yield quality (stability, sustainability, liquidity)". Drop "safety", "AAA–A Rated", "Institutional-grade", "Quant AI" and "zero surprise". On pool pages, label any score part that's an estimate ("estimated, no on-chain data") | ½ day | Stops promising what the model doesn't measure; settles the AAA question |
| **P1-1** | List the MCP server in 5–6 registries | 2 h | Cheapest referring domains you'll get |
| **P1-2** | **W3 report #1**, built by hand, with hook 1 or 3, plus one exclusive pitch. Target **Oct 20**, after P0-2, so the methodology section is honest | 2 days of build plus your outreach | The only part of the plan that earns links |
| **P1-3** | Chain-page card cleanup: make the waitlist and Laso copy agree, and remove the mock card text | 1 h | Leftover from D2 |
| **P2 (Nov 4)** | Read the W1 kill switch. If it passes, expand to 300 pages and add **protocol hub pages for the 5 protocols with ≥5 pages**, titled like *"Aave V3 yields: N scored pools across chains"*. No "safe" framing and no protocol-wide average score | 1 day | Uses the pages you have, with no false safety claims |
| **Parked** | **W4 "Is X safe?"**. Come back to it only when (a) security facts come from a cited dataset (e.g. DefiLlama's hacks data, audit registries) and are shown as facts, not folded into a score; (b) the model beats "no change" on ≥6 forecast runs; (c) the rating-label question is settled; (d) you have ≥10 referring domains | n/a | Highest-stakes page type, built on the weakest input |

## Don't build

- **Don't** publish "Is [protocol] safe?" pages on a yield-stability score.
- **Don't** send journalists to the scorecard until it checks forecasts that were actually made.
- **Don't** automate the report before one has earned a link.
- **Don't** claim "no other aggregator…" anywhere.
- **Don't** average Morpho Blue markets into one protocol score.

---

## Appendix: check Finding 1 yourself (paste and run; reads the public repo)

```bash
B=https://raw.githubusercontent.com/alex0xhodler/defi_garden
curl -sSLo snapA.json "$B/3de8bd43fb2/data/pools-snapshot.json"   # forecasts made Sep 12
curl -sSLo snapB.json "$B/2365ccc2730/data/pools-snapshot.json"   # forecasts made Sep 20
for d in 2026-09-12 2026-09-26 2026-09-20 2026-10-04; do curl -sSLo h_$d.json "$B/1ac77b2365a/data/history/$d.json"; done
python3 - <<'PY'
import json
DEX=['uniswap','aerodrome','curve','pancakeswap','balancer','raydium','orca','ramses','camelot','trader-joe','sushiswap','velodrome','quickswap','spookyswap','ekubo','thruster','ambient','meteora','fenix','blackhole-clmm','lynex','nile','thena']
lp=lambda p: p.get('exposure')=='multi' or p.get('ilRisk')=='yes' or '-' in (p.get('symbol') or '') or any(d in (p.get('project') or '').lower() for d in DEX)
def run(snap,h0,h1):
    P=json.load(open(snap))['pools']; H0=json.load(open(h0))['pools']; H1=json.load(open(h1))['pools']
    em,en,inb=[],[],0
    for p in P:
        f=p.get('forecast')
        if not f or f.get('p10') is None or (p.get('tvlUsd') or 0)<1e5 or lp(p): continue
        a0,a1=H0.get(p['pool']),H1.get(p['pool'])
        if not a0 or not a1 or a0[0] is None or a1[0] is None or max(a0[0],a1[0])>1000: continue
        em.append(abs(a1[0]-f['p50'])); en.append(abs(a1[0]-a0[0])); inb+=f['p10']<=a1[0]<=f['p90']
    n=len(em); print(f"{h0[2:12]}->{h1[2:12]} n={n} band={100*inb/n:.1f}% modelMAE={sum(em)/n:.2f} naiveMAE={sum(en)/n:.2f} skill={1-sum(em)/sum(en):+.2f}")
run('snapA.json','h_2026-09-12.json','h_2026-09-26.json')
run('snapB.json','h_2026-09-20.json','h_2026-10-04.json')
PY
```
A positive skill means the model beats "no change". Today it is **−0.28** and **+0.07**.

---

## Addendum, 2026-10-05 (evening): red team of PR #511 (MCP cleanup) + #510 follow-up

**#510 is merged, and B1–B4 are fixed on `main`.** The forecast record now writes once and only on scheduled runs (`GITHUB_EVENT_NAME === 'schedule'`, skips if today's file exists). `forecast-accuracy.html` is in the workflow's `git add` list. "Pre-registered" is gone and "locked as of" is in. The raw LaTeX is gone and there's a backfill note. The page is still `noindex`, which is correct until report day.

**#511 is open, not merged.** `main`'s `api/mcp.js` still contains `BASE_PRIMITIVES_BASELINE`, `get_looping_params` and the `Delta Principal == 0` claim. Whether those reach production depends on which server answers `/api/mcp` (see M2). Merge #511 today, after the fixes below.

**Verdict:** deleting the invented data is right. The new delegation breaks on Vercel, one invented claim survives in the page metadata, and W5 (`get_pool_score`) quietly disappeared.

| # | Problem | Evidence | Fix |
|---|---|---|---|
| **M1** | **`/api/mcp` crashes on Vercel** | `api/mcp.js` calls `require('../edge/mcp-core.js')`, but `.vercelignore:77` excludes `/edge/`, so the file is never deployed and the function fails to load (MODULE_NOT_FOUND → 500). Local tests pass because `edge/` exists locally; Vercel's deploy doesn't have it. | **Delete `api/mcp.js`.** The Cloudflare worker already handles `/api/mcp` (`edge/agent-log.mjs:123`, `isApiMcpPath → handleMcp`), so one implementation is enough. If you need a Vercel fallback, move `mcp-core.js` to a shared folder that isn't ignored. Extend `test_vercelignore.js`: every `require()` under `api/**` must point at a deployed path. |
| **M2** | **"Both serve the exact same tools" isn't the same as the same data** | The worker answers from **live** `yields.llama.fi` (`agent-log.mjs:223`, memoized). `api/mcp.js` answers from the **bundled** `data/pools-snapshot.json`, which is only as fresh as the last deploy, and returns `[]` silently if the file is missing (`getPools` swallows errors). The same query can return different numbers depending on the path. | One server (M1) solves it. Add `as_of` (data timestamp) to every tool response. |
| **M3** | **The fake "15 bps freeze" claim survives in structured data** | `agents.html:78` and `mcp.html:78` (FAQ JSON-LD): *"dual-oracle divergence tripwires (15 bps freeze)"*. Crawlers and AI tools read this text first. | Delete it, and list only the rails that exist: 1000% APY ceiling, $100K TVL floor, anomaly demotion. |
| **M4** | **W5 (`get_pool_score`) has been removed without being called out** | The canonical tools are `find_pools`, `get_pool`, `forever_number` and `explain_rails`. The tool that returned DeFi Score, the forecast and the access flag is gone, and the W5 "live" claim in the earlier status is now false. It may never have reached production: if the worker was already answering `/api/mcp`, the Vercel `get_pool_score` was never served. | Decide now: (a) port it to `mcp-core` by having the worker fetch a compact `data/pool-scores.json` that CI publishes (score, breakdown, forecast with `experimental: true` and the median skill score, access flag, `as_of`); or (b) drop W5 from the plan in writing. Don't let it vanish silently. |
| **M5** | **The test covers far less than it claims** | The new assertion calls `mcpCore` directly, for **one tool** (`find_pools`) and **one token** (USDC), comparing `totalApy` and `tvlUsd`. It never goes through `api/mcp.js` (so it misses M1), and never covers `get_pool`, `forever_number` or `explain_rails`. "All MCP tool responses are strictly derived from live snapshot data" overstates it. | Run `tools/list` and call each tool through the real handler, checking every numeric field against the snapshot (or against `explain_rails` for the rail constants). Add a static check that no file under `api/` defines its own `TOOLS`. |
| M6 | Leftover GET-SSE handler in `api/mcp.js` never closes the stream | It writes `event: endpoint` and returns without `res.end()`, so the connection stays open until the function times out | Goes away with M1 |

**Check production yourself before listing anywhere** (I can't reach defi.garden from here):
```bash
for u in https://www.defi.garden/mcp https://www.defi.garden/api/mcp https://defi-garden.vercel.app/api/mcp; do
  printf "%-45s " "$u"
  curl -s -m 20 -X POST "$u" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -oE '"name":"[a-z_]+"' | tr '\n' ' '; echo
done
# expect the same 4–5 canonical names on the first two; the vercel.app line shows what Vercel alone serves (M1)
curl -s -m 20 -X POST https://www.defi.garden/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"find_pools","arguments":{"token":"USDC","limit":3}}}' | head -c 600; echo
```
Swap in your real `*.vercel.app` hostname. Also confirm that the deployed **worker** version matches `main` (`wrangler deployments list`). The worker is deployed by hand, so the repo isn't proof of what's live.

### Carried over (the PR #510 addendum was lost when the branch was switched): the movers finding, needed for report #1
From the Sep 12 → Sep 26 run in `data/forecasts/`: **60%** of pools moved < 0.1 pp in 14 days, and the model handles those fine. On the **23%** that moved ≥ 0.5 pp (612 pools), model avg error is **7.18 pp vs 4.86 pp** for assuming no change, and the forecast range caught only **41%** of them. **The range is right when nothing happens and wrong when something does.** Half the DeFi Score comes from this forecast, and the ranges are too narrow (71% caught vs the 80% target; stablecoins 64–69%), so the *Stability* part overrates stability. Report hook: *"60% of DeFi yields didn't move in two weeks. Our model nailed those and missed the ones that mattered."* Model fix comes **after** the report: widen the ranges using only earlier runs (split conformal), rescore, and publish a changelog line.

### Updated order
1. **#511 + M1/M3/M5** → merge → run the checks above.
2. **Decide on M4**: port `get_pool_score` with honest fields, or drop W5.
3. **Then** list in the registries (P1-1), pointing at **`https://www.defi.garden/mcp` only**.
4. Report #1 (Oct 20), unchanged. Switch `/forecast-accuracy` to `index` that day.

### Don't build (additions)
- **Don't** keep a second MCP implementation "as a fallback" that can't load where it's deployed.
- **Don't** claim a test proves "all tools" when it checks one tool and one token.
- **Don't** list in registries before the production `tools/list` matches the repo.
