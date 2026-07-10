# 001 notes — Mixpanel MCP wired into `.mcp.json` (executed 2026-07-10, sandboxed build-loop iteration)

## Sandbox constraints (read this first)
This iteration ran with `git` unavailable for writes and the `claude` CLI unavailable entirely. Everything below that would normally be a live command output is instead marked PENDING for a human to run post-merge. Nothing was fabricated to force a checkbox green.

## Sources (primary, fetched directly this session — not from memory)
- **https://docs.mixpanel.com/docs/mcp** — official Mixpanel MCP server docs. Confirms: hosted MCP server; US URL `https://mcp.mixpanel.com/mcp` (EU: `mcp-eu.mixpanel.com/mcp`, IN: `mcp-in.mixpanel.com/mcp`); two auth modes, OAuth ("best for interactive use in AI assistants like Claude") and Service Accounts beta ("best for CI/CD pipelines, automated agents, and shared team setups"); and gives the literal Claude Code recipe for both — `claude mcp add --transport http mixpanel https://mcp.mixpanel.com/mcp` then `/mcp` to OAuth, or a `.mcp.json` block with `type`/`url`/`headers` for the service-account variant.
- **https://code.claude.com/docs/en/mcp** (and the `.md` variant, fetched via `curl` for the untruncated body) — official Claude Code MCP reference. Confirms:
  - `.mcp.json` schema: `mcpServers` → per-server object with `type` + `url` (+ optional `headers`).
  - "A JSON entry that has a `url` but no `type` is a configuration error, because Claude Code reads an entry with no `type` as a stdio server." `type` is therefore mandatory here.
  - `"streamable-http"` is an accepted alias for `"http"` (MCP-spec name for the same transport).
  - Three MCP scopes — local (`~/.claude.json`, private), **project (`.mcp.json` at repo root, checked into version control, shared with team)**, user (`~/.claude.json`, cross-project). Project scope is what spec 001 asks for.
  - "For security reasons, Claude Code prompts for approval before using project-scoped servers from `.mcp.json` files." Servers awaiting approval show as `⏸ Pending approval` in `claude mcp list`.
  - Non-interactive mode: "In non-interactive mode there's no `/mcp` panel, so Claude Code can't run the OAuth flow for you... Complete the sign-in from an interactive session with `/mcp` or `claude mcp login <name>`." "Authentication tokens are stored securely and refreshed automatically" after that.
  - Env-var expansion: `${VAR}`, `${VAR:-default}`, usable in `url`/`headers`/`command`/`args`/`env`.
- **https://code.claude.com/docs/en/settings.md** — confirms the `enableAllProjectMcpServers` / `enabledMcpjsonServers` / `disabledMcpjsonServers` settings keys that gate `.mcp.json` server approval, and that a checked-in `.claude/settings.json` granting auto-approval is *ignored in an untrusted (unopened) folder* — only `~/.claude/settings.json`, managed settings, or a git-ignored `.claude/settings.local.json` apply before the workspace is trusted.

## Config chosen and why
```json
{
  "mcpServers": {
    "mixpanel": {
      "type": "http",
      "url": "https://mcp.mixpanel.com/mcp"
    }
  }
}
```
- **OAuth, not service account.** The task brief and NORTH_STAR's standing decision (2026-07-09, Q2: "credentials are never committed to the repo") both point at OAuth as the default. No `headers` block means `.mcp.json` has zero secret-shaped strings by construction — nothing to leak, nothing for a reviewer to double-check.
- **No project/org ID in the file.** The Mixpanel MCP server resolves which projects a caller can see from the authenticated user's own Mixpanel permissions (tools like `Get-Projects`); project 4042048 is a parameter passed inside individual query calls (e.g. `Run-Query`), not part of the connection config. So there's nothing project-specific to encode here.
- **Region assumed US** (unqualified `mcp.mixpanel.com`). NORTH_STAR.md states org Equitee (2885044) / project defigarden (4042048) with no data-residency region. ASSUMED — confirm with whoever provisioned the Mixpanel org; if it's EU/IN-hosted, swap the `url` to `mcp-eu.mixpanel.com/mcp` or `mcp-in.mixpanel.com/mcp`.
- **Service-account fallback — documented, not wired.** If OAuth proves unworkable for unattended `claude -p` heartbeats (see Residual below), the fallback Mixpanel itself documents for headless use is:
  ```json
  {
    "mcpServers": {
      "mixpanel": {
        "type": "http",
        "url": "https://mcp.mixpanel.com/mcp",
        "headers": { "Authorization": "Bearer Basic ${MIXPANEL_SA_TOKEN}" }
      }
    }
  }
  ```
  This still commits no secret (env-var reference only), but requires a human to (a) create a Mixpanel service account in org/project settings (Owner/Admin only) and (b) export `MIXPANEL_SA_TOKEN` (base64 of `username:secret`) in whatever environment runs the heartbeat — never in the repo. Not implemented now: spec 001 said OAuth-preferred, service account "only if remote is unusable," and nothing observed shows OAuth is unusable — switching would be scope creep on an unproven premise.

## One-time interactive auth / approval steps the human must run
These cannot be executed in this sandbox (no `claude` CLI). Three separate one-time gates, all required before anything in this file does something useful:

1. **Mixpanel org admin — enable MCP.** Settings → Org → Overview, for org Equitee (2885044). Off by default, admin-only, "changes can take up to 15 minutes to take effect" (docs.mixpanel.com/docs/mcp, "Permissions & Access").
2. **Approve the project-scoped server.** The first time anyone opens this repo in Claude Code after this file merges, `claude mcp list` shows `mixpanel` as `⏸ Pending approval`. Run `claude` interactively in the repo and accept the server when prompted (or, on the machine that will run scheduled heartbeats, set `enabledMcpjsonServers: ["mixpanel"]` or `enableAllProjectMcpServers: true` in that machine's own `~/.claude/settings.json` or git-ignored `.claude/settings.local.json` — not in anything this repo commits). This is a Claude Code trust/security gate, independent of Mixpanel auth. Note: this checkout's local `.claude/settings.local.json` currently has `enableAllProjectMcpServers: false`, so the prompt is real, not hypothetical, for whoever next opens this repo here.
3. **OAuth sign-in.** From an interactive session, run `/mcp` and complete the Mixpanel OAuth flow in a browser — or run `claude mcp login mixpanel` from a shell (Claude Code v2.1.186+), which drives the same OAuth flow without opening a full session (useful on a headless box: it detects when no local browser is available and prints the URL to open elsewhere). Tokens are then cached and auto-refreshed for later runs, including `claude -p`.

Until 1–3 all happen once, a `claude -p` heartbeat that needs `mixpanel` gets told the server's tools are unavailable pending authorization (Claude Code ≥v2.1.196 behavior) — it should report "signal not wired" or equivalent, not crash or silently omit the finding.

## Acceptance criteria — status against specs/001.md
- [x] `.mcp.json` exists at repo root — **MET**, this change.
- [ ] `claude mcp list` run inside the repo shows the Mixpanel server — **DEFERRED TO HUMAN.** No `claude` CLI here. Also gated on step 2 above regardless of who runs it.
  ```
  PENDING — human runs `claude mcp list` after steps 1-3 above and pastes output here:
  $
  ```
- [ ] Fresh `claude -p` query for total `plan_created` (last 7 days, project 4042048) returns a number — **DEFERRED TO HUMAN.** Needs the CLI plus a completed, authorized connection (steps 1-3). Not fabricated.
  ```
  PENDING — human runs, e.g.:
  $ claude -p "Using the mixpanel MCP server, query project 4042048 for the total count of the plan_created event over the last 7 days. Return just the number."
  <PASTE OUTPUT HERE>
  ```
- [x] One-time interactive auth steps documented here — **MET**, section above.
- [ ] `git grep` proves no token/secret string entered the repo — **DEFERRED (git unavailable in this sandbox).** Verified by inspection instead: `.mcp.json`'s only string values are `mcpServers`, `mixpanel`, `type`, `http`, `url`, and `https://mcp.mixpanel.com/mcp` — no header, no token, no env-var-holding-a-literal. Suggested post-merge check:
  ```
  git grep -niE 'mp-service-account|Bearer (Basic )?[A-Za-z0-9+/=]{16,}|sk-[A-Za-z0-9]{16,}|api[_-]?key\s*[:=]' -- . ':!node_modules'
  ```
  Expect zero hits.
- [ ] Tests (`node test_planner.js && node test_protocol_parsing.js && node test_qualifier_fix.js`) still exit 0 — **NOT RE-RUN, but not applicable to this diff.** No product code changed (only `.mcp.json` + two new `specs/` docs); none of the three test files exercise repo config files. Re-running is still good hygiene post-merge but nothing here can regress them.

## Residual (flagged, not silently decided)
- **Spec 001's own open question** — "If the official remote Mixpanel MCP endpoint can't be reached from Claude Code on this machine: mark BLOCKED and ask the human." Could not be tested (no `claude` CLI / no live MCP client here). Not marking BLOCKED: nothing found suggests unreachability — the config here is copied verbatim from Mixpanel's own current, generally-available Claude Code instructions — but genuine reachability from the machine that will actually run the heartbeat is unverified, not verified-and-omitted. This is real work left for the human, called out explicitly rather than assumed away.
- **OAuth vs. service account for *unattended* heartbeats.** Mixpanel's own docs market service accounts as "best for CI/CD pipelines, automated agents, and shared team setups" (headless) and OAuth as "best for interactive use" — in tension with a cron-style `claude -p` heartbeat. code.claude.com says OAuth tokens "are stored securely and refreshed automatically," which should cover routine unattended use, but if a refresh is ever rejected by the server, Claude Code's remedy is "a notice pointing at `/mcp`" — something a headless heartbeat can't act on by itself. Recommendation: leave OAuth as configured now (per explicit task instruction and NORTH_STAR Q2), but have the human watch the first week or two of heartbeat runs for auth-related failures before trusting this unattended long-term. This is a judgment call for whoever owns the Mixpanel org/runs the heartbeat cron, not something to decide unilaterally here.
- **Region assumption.** US endpoint assumed; unconfirmed against Equitee's actual Mixpanel data residency (see Config section above).
- **`enableAllProjectMcpServers: false`** in this checkout's local, git-ignored `.claude/settings.local.json` — confirms step 2 above is a live, current blocker on this machine specifically, not a theoretical one.
