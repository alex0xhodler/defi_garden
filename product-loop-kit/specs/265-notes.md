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
- **SKILL.md:74 changed** even though its `/api/mcp` was an "e.g." generic
  example, not a site-specific claim — spec 265 named it explicitly as one
  of the 5 artifacts to fix, and leaving it would still match the acceptance
  grep.

## Class NOT closed, with numbers
This closes the MCP-discovery population only (5 artifacts: 3 cards + 2
tooling files + 1 doc restatement) — same scope spec 265 declared.
Untouched, filed separately: `openapi.json` path drift (**262**, BLOCKED on
the human) and free/paid boundary prose drift (**267**, READY, unbuilt).

## Non-vacuity (proven in-session, byte-identical restores confirmed via md5/diff)
1. Added a phantom `prompts` capability to `.well-known/mcp.json` → red
   (capability-set-equality sub-rule) → restored → green, md5 unchanged.
2. Reintroduced `/api/mcp` in `dns-aid-zone.txt` → red (residue sub-rule) →
   restored → `diff` byte-identical → green.

## Territory notes
None — this is a narrow, already-scoped fix; no new part of the codebase.
