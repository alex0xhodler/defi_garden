# 058 build notes

## What shipped
`docs/feasibility-data-layer.md` — the full study per the spec's acceptance criteria. No product code touched.

## Deviations from spec
- **Payload-size comparison (§4) is estimated, not measured.** `yields.llama.fi` is policy-blocked from this sandbox at the proxy layer (confirmed via `curl` → `CONNECT tunnel failed, response 403`, and `$HTTPS_PROXY/__agentproxy/status` logging a live `connect_rejected` for `yields.llama.fi:443`). This is the same restriction every prior loop item touching live DefiLlama data has hit (010/013/018/040/044/045/052-055 all note it). The doc is explicit that this is an estimate and makes "take a real measurement" step 1 of the phased plan — this is the conservative choice: state the limitation loudly rather than present a fabricated number as fact.
- **ToS/attribution answer (§3) is marked ASSUMED, not independently re-verified.** Same network restriction prevents fetching DefiLlama's current terms page from this sandbox. The doc states this clearly as a gating question for the human, consistent with the project's convention of flagging ASSUMED items in NORTH_STAR.md's Standing decisions.
- Both of the above are disclosed inline in the doc itself (not just here), since a study whose confidence caveats are buried in a build-loop notes file the reader never sees would defeat the point of an honesty-first study.

## No product code changed
Confirmed: diff is `docs/feasibility-data-layer.md` (new) + `product-loop-kit/BACKLOG.md` (status bookkeeping) + this notes file + the PR explainer file. Verified via `git diff --stat` before requesting verification.

## Follow-up item drafted
059 (static snapshot layer, option (a)) is drafted inside the doc itself, marked BLOCKED on human confirmation of the ToS question and sign-off on the recommendation. Not added to BACKLOG.md as a new row — this study's acceptance criteria only asks for the item to be "drafted," and adding a numbered BACKLOG row for a BLOCKED item this loop didn't scope in full (no spec file, no independent scoring review) risks the next heartbeat picking it up as if it were ready-to-spec. Left as a clearly-marked draft inside the study doc for the human/next heartbeat to promote deliberately.
