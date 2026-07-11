# 029 build notes
- Protocol cell -> <a class="tp-pool-link" href="/?pool=<id>"> with a "→" affordance; fallback to appUrl (/?token=) when p.pool is missing.
- Fixture gained pool ids; 2 new assertions (row links to /?pool=<id>; no-id fallback). 32 assertions total. Tokens-only CSS, zero hardcoded hex.
- Whole-row <a> isn't valid inside <tr>; linked the protocol (the pool's identity) + added a row hover to signal interactivity — accessible and no JS.
- Does NOT touch ranking (the 0.00%-APY-at-top look the human noted) or indexing strategy — flagged for a separate quality decision.
