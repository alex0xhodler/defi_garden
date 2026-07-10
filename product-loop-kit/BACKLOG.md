# BACKLOG — written by the heartbeat, culled by the human, consumed by build loops.
# Statuses: READY → IN_PROGRESS → IN_REVIEW → SHIPPED (measuring) → DONE
#           PARKED (3 strikes) · BLOCKED (question for the human) · CULLED (human said no)

| ID | Title | Score | Status | Risk | Spec | Attempts | Measure until |
|----|-------|-------|--------|------|------|----------|---------------|
| 001 | Wire Mixpanel MCP into the repo (.mcp.json) so heartbeats read live funnels | 9.0 | IN_REVIEW (verifier PASS · approved under auto-merge policy — ships with next commit; then human: org MCP enable + /mcp OAuth) | HIGH | specs/001.md | 1 | — |
| 002 | Share-loop instrumentation truth check (2026-07-10: instrumentation SOUND — zeros were 1-day-old tracking + no usage; plan_saved double-fire found & fixed, see 002-notes.md) | 8.7 | DONE | LOW | specs/002.md | 1 | — |
| 003 | `npm test` smoke gate: Playwright asserts / → planner and /?token=USDC → pool cards | 7.0 | IN_PROGRESS (2026-07-10) | HIGH | specs/003.md | 1 | — |
| 004 | Surface the share CTA at the bloom moment — 0 share_link_created across 5 plans / 167 sessions | 8.0 | IN_REVIEW (verifier PASS · approved under auto-merge policy — ships with next commit; post-merge visual spot-check advisory) | HIGH | specs/004.md | 1 | 2026-07-24 |
