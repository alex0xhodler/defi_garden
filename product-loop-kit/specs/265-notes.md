# Notes 265: MCP discovery cards — fix

Deviations from spec, conservative choices, why.

- **`type` value chosen: `"streamable-http"`**, not the bare `"http"` alias
  `specs/001-notes.md:11` recorded (`.mcp.json`'s Mixpanel entry uses `"http"`
  for the same transport). The card's `$schema` URL
  (`https://modelcontextprotocol.org/schemas/mcp-server-card-v1.json`) 404s
  live — not fetchable to confirm the exact enum — so I went with the literal
  string the spec itself proposed (`specs/265.md:31`, "`type: streamable-http`")
  and the repo's own recorded fact that it's an accepted alias for `"http"`.
  If a future item confirms the schema prefers `"http"`, this is a 3-file,
  1-line-each follow-up — not a design decision to relitigate.
- **Byte-identity preserved.** All three cards still md5-match each other
  (new hash `a16eeae5bd4bc9f723d2ce5f05faf2f2`) — same invariant 228's
  verifier found, now on the corrected content.
- **`edge/MCP.md` residue section rewritten**, not left stale. It's an
  agent-facing living doc (not a dated snapshot like LOG.md), so leaving it
  claiming "the cards are WRONG" after they're fixed would be a false claim
  on the exact honesty-differentiator surface this item exists to protect.
  Two short backward-references to `/api/mcp` remain in the new prose
  (past-tense history: "265 fixed X"), deliberately not scrubbed — they
  describe what was wrong, not what's live now.
- **Also corrected stale `BACKLOG.md` row 234** (READY → SHIPPED, PR #432 /
  `dc9892a45b`), found via the pre-build in-flight check — administrative,
  not in spec 265's scope.
- **SKILL.md:74 changed** even though its `/api/mcp` was an "e.g." generic
  example, not a site-specific claim. Spec 265 does not name SKILL.md, but
  leaving it would still trip the acceptance grep's "0 product/tooling
  sites" bar, so it needed fixing regardless.
- **`index.json`'s sha256 pin for SKILL.md updated too** (verifier round 1
  BLOCKING finding) — editing SKILL.md without updating the discovery
  index's hash of it would have been a fresh instance of this exact item's
  bug class, self-inflicted.

## Class NOT closed, with numbers
This closes the MCP-discovery population (6 artifacts: 3 cards + 2 tooling
files + 1 doc restatement — 1 more than spec 265's own tally of 5, found via
the acceptance grep). Untouched, filed separately: `openapi.json` path drift
(**262**, BLOCKED on the human) and free/paid boundary prose drift (**267**,
READY, unbuilt). Also noted but out of scope: `index.json`'s `openapi.json`
and `llms.txt` sha256 entries are independently stale too (they drift on
every daily data regen) — predate this diff, not introduced by it.

## Non-vacuity (proven in-session, byte-identical restores confirmed via md5/diff)
1. Added a phantom `prompts` capability to `.well-known/mcp.json` → red
   (capability-set-equality sub-rule) → restored → green, md5 unchanged.
2. Reintroduced `/api/mcp` in `dns-aid-zone.txt` → red (residue sub-rule) →
   restored → `diff` byte-identical → green.

## Territory notes
None — this is a narrow, already-scoped fix; no new part of the codebase.
