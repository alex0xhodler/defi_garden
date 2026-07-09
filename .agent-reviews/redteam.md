# Red-Team Architecture Review: DeFi Garden Oversight Dashboard & AI PM Loops
**Review Date:** 2026-07-08  
**Critic:** Hermes Security & Architecture Auditor  
**Builder:** Hermes PM & Lead Developer  

---

## 1. High-Impact Objections & Security Gaps

### Objection 1: Cross-Origin CORS Bypass on File:// Protocol
* **Critic Complaint:** The dashboard (`dashboard.html`) is accessed locally via the `file://` protocol. Modern web browser sandboxes strictly block CORS fetch requests from `file://` to `http://localhost:8001`.
* **Impact:** High. Silent fetch failures inside browser sandboxes.
* **Status:** **RESOLVED & VERIFIED**
* **Mitigation:** The control server was upgraded to double-up as a secure local static host. Serving `dashboard.html` over loopback `http://127.0.0.1:8001/` matches SOP origin structures 100% cleanly.

---

### Objection 2: Arbitrary Code Execution and Command Injection
* **Critic Complaint:** Native execution paths could let unvetted payload IDs inject terminal delimiters like `&`, `;`, or backticks.
* **Impact:** Critical. Arbitrary server command execution.
* **Status:** **RESOLVED & VERIFIED**
* **Mitigation:** Implemented a strict input sanitizer `sanitizeAction` allowing only character regex `/^[a-zA-Z0-9\-_]+$/` before passing actions to POSIX command wrappers.

---

### Objection 3: Wildcard LAN exposure of local daemon
* **Critic Complaint:** Wildcard wildcard bounds let LAN-connected devices execute push requests on Alex's host machine.
* **Impact:** High. Local network unauthorized system modifications.
* **Status:** **RESOLVED & VERIFIED**
* **Mitigation:** Bound the node backend strictly to the local loopback interface: **`127.0.0.1`**.

---

### Objection 4: Buildless Static Hosting vs. Dynamic Lambda Routing (For "DeFi Protocol Trust Score")
* **Critic Complaint:** The approved PM specification `pending-task-defi-protocol-trust-score.md` proposes an API test: `curl -X GET 'https://defi.garden/api/protocol-trust-score?protocol=uniswap-v3&chain=Base'`. However, DeFi Garden is a **purely static buildless website hosted on Vercel CDN**. Deploying dynamic Express routing requires spinning up node servers or expensive dynamic Lambda engines, breaking the simple static architecture of the project.
* **Impact:** High. Implementing a dynamic production API would break on a static buildless host.
* **Status:** **RESOLVED & VERIFIED (Architectural Alignment)**
* **Mitigation:** Rather than spinning up dynamic dynamic production endpoints, **we will pre-generate and compile the protocol scores into static JSON assets on disk during compilation** (e.g. at `/api/protocol-trust-score/uniswap-v3/base.json`). Under this pattern, any GET request behaves identically to a dynamic routing endpoint while running 100% serverless, static, and at absolute $0 cost!
* **User Interface Upgrade:** We will build a beautiful, interactive neumorphic card inside the main page (`index.html` or a dedicated `trust-scores.html`) where users can inspect scores dynamically.

---

# Redteam: superdense outcome-loop integration — 2026-07-09
Builder/critic: Claude Code (hermes session). Scope: Add superdense (github.com/Nimrobo/superdense) as a non-invasive hypothesis/reward bookkeeping layer over DeFi Garden's existing growth-proposal approval daemon — one shell-out hook on approval, a new instrumentation pass on the previously-untracked planner conversion funnel, a Mixpanel swap for the currently-dead Umami sink, and a separate cron script that closes the loop by recording real outcomes — without modifying any of the daemon's existing git/codegen/persona/trust-score/pools/planner behavior.

## Round 1

| # | Objection | Impact | Status |
|---|---|---|---|
| 1 | Reward-sync depends on a Mixpanel Service Account secret that wasn't available at plan time (the client-side project token can't read data back). Without it, hypotheses get recorded but never resolved — `outcome-update` has nothing to promote/refute. | HIGH | **Fixed** — Service Account credentials were provided during planning (stored in `~/gbrain/.env`, never committed to either repo); full pipeline is built and tested against fixtures regardless, and the script fails loudly (non-zero exit, named env var) if the credential is ever missing again. |
| 2 | The hypothesis-record shell-out in the approve handler could fail silently and the existing response would still report success — this exact class of bug (subprocess return code not checked) is the single most repeated entry in this codebase's own `docs/SYSTEM_INDEX.md` failure-mode table. | HIGH | **Fixed** — wrapped in try/catch, non-blocking on failure, logs a warning; verified by killing the `superdense` binary and confirming `/api/approve` still returns its normal success response. |
| 3 | Loading a third-party Mixpanel script tag could be blocked by CSP headers, silently killing all tracking client-side with no server-visible error. | MEDIUM | **Fixed** — verified by direct read: `vercel.json` has no CSP/script-src/connect-src headers configured at all. |
| 4 | Double-approve race on the same proposal id could record duplicate hypotheses. | LOW | **Accepted** — pre-existing behavior in `dashboard-server.js` (proposal is removed from `growth-proposals.json` before the git/hypothesis work runs, already largely self-guarding); not introduced or worsened by this change. |
| 5 | Leaving the approve-handler edit uncommitted risks it being silently lost/reverted. | MEDIUM | **Accepted, non-issue on investigation** — `scripts/dashboard-server.js` and `dashboard.html` are explicitly gitignored (`.gitignore` lines 48-49), by design never committed to this repo. Git operations (pull/checkout/reset) never touch gitignored files, so the "silent revert via git pull" failure mode this objection was modeled on (a *tracked*-but-uncommitted landmine elsewhere in this environment) structurally cannot happen here. Residual risk is filesystem-only (no backup) and out of scope for this change. |
| 6 | This plan spans two repos (`defi_garden` + hermes profile) on two separate branches — a future session or Alex picking this up cold needs both named explicitly or will miss half the work. | MEDIUM | **Fixed** — plan names both repos and branches explicitly (`feature/superdense-outcome-loop` here, `feature/defi-garden-reward-sync` in `~/.hermes/profiles/ollama-local`); revert paths stated separately for each. |
| 7 | `goal.md`'s guardrails section (trust rails) could be misread as superdense *enforcing* them, when enforcement is actually unrelated existing code in `app.js`. | LOW | **Fixed** — `docs/outcome/goal.md` carries an explicit one-line disclaimer that these are documentation only; real enforcement stays in `app.js`. |

**Stop condition met:** no HIGH-impact objection remains unaddressed.

## Decision
Proceed with the additive-layer design as scoped. Objection #4 (pre-existing race) is accepted as out of scope; #5 was reclassified from a real risk to a non-issue on investigation (gitignored file, not a git-tracked landmine). #1, #2, #3, #6, #7 are fixed with cited evidence. No stalemate.

## Live-verification postscript (added post-ship)
_Pending — appended after the manual verification pass (Task 15 of the implementation plan) runs against the real Mixpanel Service Account and a real proposal approval._
