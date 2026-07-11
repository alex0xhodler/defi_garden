# 034 build notes
- Root cause: 025 used PROJECTION_MONTHLY=$200 (monthly annuity via _futureValue), never reading investmentAmount. Switched to lump-sum compound growth of investmentAmount (default 1000).
- projectionBody signature monthly->principal; EN+KO updated (dropped "/mo" and KO "월"). Verified both render: "$1,000 ... ~$1,268 in 5y".
- Deep link now capital path (capital+fm=capital+years) so the planner prefills the same lump sum the user selected.
- Reactive by construction (investmentAmount is state; projectionAmount computed in render). Browser eyeball still worth doing (change the amount, watch CTA+projection update) — not runnable here.
