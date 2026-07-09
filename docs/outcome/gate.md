# DeFi Garden — Completion Gate

Reusable completion contract, referenced by `run.md`. These are the verification steps already documented in `CLAUDE.md` — this file doesn't invent new ones, it packages the existing bar as a gate `/outcome-run` can check against.

## Required checks (pre-ship, before a `feature/<action>` branch is considered done)

1. **Both router paths verified** — bare `/` loads the planner, `/?token=USDC` loads the analytics app with pool cards. (CLAUDE.md: "Verify both router paths after ANY change near `index.html`.")
2. **Playwright E2E + critical screenshot review** at 360px, 768px, 1280px, and in dark mode. (No automated test/lint pipeline exists for this repo — this is the actual verification bar per `CLAUDE.md`.)
3. **Trust rails intact** — `APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, anomaly flags, degen haircut, focus rings unchanged or strengthened, never weakened.
4. **`prefers-reduced-motion` respected** for any new animation.
5. **Translations updated together** — any new user-facing string has both EN and KO entries in `translations.js`.

## Warning checks (non-blocking, surfaced but don't halt the run)

- Regenerated `stories/` via `node generate-stories.js` if personas/presets changed.
- Sitemap/llms artifacts still validate if the change touches SEO surface (existing `cron-defi-garden-loop.sh` / `validate_readiness.py` already covers this on its own 720-minute cycle — a gate failure here should link to that audit, not duplicate it).

## Failure policy

Required-check failures trigger one fix attempt within the same session. If still failing, the run is marked blocked (not silently marked complete) and stays in `docs/pending-task-<action>.md`'s `## Status` as `BLOCKED — <reason>`, not `APPROVED`.

## Pre/post phase note

All of the above are **pre**-ship gates (before an irreversible real-world action — in this repo, that's pushing a `feature/<action>` branch, since nothing here auto-merges to `main`). There is currently no **post**-ship gate defined; the reward-sync loop (`reward_sync_mixpanel.py`, daily) is the closest thing, but it measures outcome, not correctness — a post-ship correctness gate (e.g. a production smoke test after Alex manually merges to `main`) is not in scope for this outcome loop and should be handled by the existing `output_quality_sweep.py`-style pattern in the hermes profile if ever needed for this repo.
