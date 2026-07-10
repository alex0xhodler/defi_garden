# Spec 018 build notes — BLOCKED on sandbox network policy

## What happened this run
This run started by picking up 017 (then the top READY item) with no visibility
into the fact that a different loop run had already built, verified (fixtures-only),
and closed it as "superseded by 018 — fixtures passed, product failed" on origin/main,
along with a same-day standing decision (2026-07-11) that UX acceptance criteria must
now measure rendered product behavior via Playwright on the real UI, never only unit
fixtures. This was only discovered mid-run, at push/PR time, when `git fetch origin main`
surfaced that origin/main had moved 4 commits ahead of this session's stale base
(new specs 018/019, ship-path policy change, theme change).

Rather than ship a second, functionally-identical "017 done" that would repeat the
exact mistake already post-mortemed (14/14 fixtures green, search still bad in the
real product) and push under a branch-name pattern already known to be rejected
(`branch push rejected on non-claude prefix` — LOG.md, 2026-07-11 post-mortem),
this run:
1. Rebuilt a clean branch (`claude/loop-018`, correctly claude/-prefixed) from
   `origin/main` and cherry-picked the parser substrate work — spec 018's own
   territory notes explicitly sanction this: "017's extraction/fixture work is
   usable substrate; its acceptance bar was the failure."
2. Picked up 018 (now the correctly-scoped, top-scored READY item) instead.
3. Discovered a hard blocker on 018's core acceptance criterion — see below.

## The substrate carried over (unchanged from the 017 attempt, still verified)
- `search-parser.js`: `parseNaturalLanguageQuery` extracted from app.js as the single
  source of truth (was previously duplicated in app.js + two stale inline test copies).
- Root-cause fixes: chain-name fallback to any live `allChains` entry (not just a
  hardcoded alias dict — fixes e.g. "Plasma"), Kamino protocol-slug unification in
  `getFriendlyProtocolName` (app.js), pool-type "Lending" stem-matched via `/\blend/`.
- `test_search.js` / rewritten `test_protocol_parsing.js` / `test_qualifier_fix.js`:
  239 assertions total, all green, all node-only (no network). This is exactly the
  "14/14 fixtures green" category of evidence the human already found insufficient —
  kept because it's still correct as far as it goes (parsing is right), not because
  it satisfies 018.

## The blocker: this session cannot reach the network 018's acceptance criteria require
018's acceptance criteria are explicit: "Playwright run drives the REAL UI (npm run dev
+ chromium) typing all ≥10 canonical queries; rendered grid non-empty where live pools
exist and correctly filtered — asserted on DOM, not parser output" and "Verifier
independently REPRODUCES the Playwright run."

This session's egress proxy returns `403 Forbidden` (`CONNECT tunnel failed`) for BOTH:
- `unpkg.com` — where `home.html` loads React 18 UMD itself (static `<script defer>`,
  lines 131-132). Without it, **no page renders at all, on any path, with or without
  this diff.**
- `yields.llama.fi` — the live DefiLlama pools API `app.js` fetches client-side. Even if
  React loaded, there would be zero pool data to filter or render.

Verified directly:
```
$ curl -x $HTTPS_PROXY https://unpkg.com/react@18/umd/react.production.min.js
CONNECT tunnel failed, response 403
$ curl -x $HTTPS_PROXY https://yields.llama.fi/pools
CONNECT tunnel failed, response 403
```

Wrote `test_search_live.js` — the Playwright behavior-test deliverable spec 018 asks
for (drives the real UI via a local static server + real chromium, types every
canonical query from `searchPhrases` + the human's classes + novel same-class probes,
asserts on rendered `.pool-card` count and chain-badge text, not parser return values).
Ran it: it crashes at the very first `waitForSelector('.pool-card')` — before a single
query is even typed — because the initial `?token=USDC` landing page never renders any
cards (no React, no pool data). This is the same failure mode `test_smoke.js` hit while
verifying the (superseded) 017 branch, confirmed there to reproduce identically on
`main`'s completely unmodified code — i.e. this is not something any diff in this repo
can fix; it is this session's network policy.

## Why I did not try to work around this
- **Mocking pool data locally would repeat the exact mistake spec 018 exists to fix.**
  The whole point of 018 is "behavior on live data, not fixtures" — substituting a local
  fixture server for `yields.llama.fi` reintroduces synthetic data that might not match
  real API shape (real friendly names, real pool combinations), which is categorically
  the same risk that already burned one loop run. A "PASS" against local mocks would be
  exactly as untrustworthy as the fixtures that already failed the human's prod check.
- **The verifier cannot reproduce a live-data run it also can't reach.** 018's acceptance
  criterion #3 ("Verifier independently REPRODUCES the Playwright run") is unsatisfiable
  by construction in this sandbox — the verifier subagent runs in the same network-blocked
  environment.
- Per build.md step 1 ("if the spec has an open question whose answer changes the
  architecture: don't guess, mark BLOCKED, log it, exit") — this isn't literally an
  architecture question, but the same principle applies: I cannot verify a network-
  dependent acceptance criterion by guessing that it would pass, and guessing here is
  exactly the failure mode this class of item exists to eliminate.

## What this means for the backlog, not just this item
019 (Pool-detail pages) has the identical shape — its acceptance criteria also require
"Playwright on 3 sample pools" against live pool data via PoolDetail.js. Both currently-
READY items are blocked on the same infrastructure gap. This is a session/environment
network-policy question for the human, not a per-item one — see LOG.md.

## Recommendation for the human
This session was invoked as a scheduled/background routine (not the interactive "build
routine" cloud routine NORTH_STAR.md describes), and its network policy appears more
restrictive — it blocks unpkg.com and yields.llama.fi entirely, whereas backlog 003's
original build (which shipped working Playwright smoke assertions) clearly had access to
both. Two ways forward: (a) confirm/adjust the network policy for whichever session type
runs build-loop iterations so it can reach unpkg.com + yields.llama.fi, or (b) if that's
not possible for this trigger type, revise 018/019's acceptance bar to something
verifiable without live egress (accepting the fixture-only risk profile back, with eyes
open) — CLAUDE.md's own Playwright note assumes "a working Playwright install is
typically at /tmp/neuro-shots", which may run in a different, network-enabled context.

## Status
018 marked BLOCKED (not PARKED — this isn't a failed attempt at the spec's design, it's
an inability to verify in this execution context) with the question above. `claude/loop-018`
pushed with the substrate + `test_search_live.js` so a network-enabled run can pick this
up without re-deriving the parser fixes or re-discovering this blocker.
