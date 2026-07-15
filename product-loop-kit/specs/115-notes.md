# 115 — build notes (deviations + conservative choices)

**Branch:** claude/inspiring-meitner-qonl80 (harness-pinned; ship as one commit + PR per standing decisions 2026-07-11/2026-07-13)
**Built:** 2026-07-15 · Opus coding agent, orchestrated + verified by the loop session.

## What shipped (matches spec 115)
- `planner.js` (+86): two module-scope helpers after `encodePlanToUrl` — `buildTendReminderIcs(shareUrl, summary, description)` (RFC5545-minimal `.ics`, `DTSTART` ~30 days out in ICS UTC basic format, `RRULE:FREQ=MONTHLY`, `URL`/`DESCRIPTION` = the plan's share URL, deterministic UID) and `downloadTendReminder(...)` (Blob + synthetic `<a download>` click, no dependency, no permission prompt). Bloom control: `doTendReminder()` + a `gp-share-textlink gp-tend-reminder` button and `gp-tend-reminder-note` caption as the last children of `sharePromptElement`. Report control: `reportTendReminder()` (URL rebuilt from saved `plan` fields) + a `.gp-report-reminder` block after `gp-report-actions`.
- `translations.js` (+8): `tendReminderCta` / `tendReminderNote` / `tendReminderTitle` / `tendReminderDesc` in BOTH `en` and `ko` (natural Korean).
- `analytics.js` (+8): `trackTendReminderAdded({surface, goal, persona})` → `tend_reminder_added`, matching the existing track-fn pattern.
- `planner-styles.css` (+17): `.gp-tend-reminder-note` (calm muted caption, existing tokens only) + `.gp-report-reminder` (centered column). `:active` sink inherited from `gp-share-textlink`. No gradients/glow.
- `package.json`: appended `&& node test_tend_reminder.js` to the `test` script.
- `test_tend_reminder.js` (new): Playwright house harness (test_smoke.js pattern). Seeds `localStorage['garden-plan']` → report mode. Captures the `.ics` by monkeypatching `URL.createObjectURL` + stubbing anchor `click`. Asserts control present/visible; `.ics` contains `BEGIN:VEVENT` + `RRULE:FREQ=MONTHLY` + `DTSTART` within 28–32 days + `URL:` with `goal=`; EN and KO localized (no raw-key leak); bloom-surface control via shared-plan URL fast-forward; dark 360/768/1280 control visible, no horizontal body scroll.

## Deviations / conservative choices
- **Minified assets regenerated** (`planner.min.js`, `translations.min.js`, `planner-styles.min.css`) via the repo's own `node minify-assets.js` — `plan.html` serves the `*.min.*` bundles, so a source-only edit would not take effect. This is the existing pipeline, not scope creep. `terser`/`clean-css` were installed `--no-save` (not committed). Other min bundles re-minified byte-identically (no diff).
- **`DESCRIPTION`/`URL` line folding**: not implemented (RFC5545 recommends folding >75 octets). Calendar clients (Google/Apple/Outlook) parse unfolded long lines fine; kept minimal per spec. Noted as a candidate follow-up if any client rejects the file.
- **`test_analytics_fires.js`** shows `0 assertions` in-sandbox — it navigates to `/tokens/big`, a *generated* SEO page absent from a fresh checkout (needs `npm run tokens`). Pre-existing environmental precondition, unrelated to this diff (the analytics change only *adds* a method; it cannot 404 a page). Transient `generate-token-pages.js` output was reverted so the commit stays scoped.

## Verification run in-session
- `node test_tend_reminder.js` → 8 assertions passed
- `node test_smoke.js` → 5 assertions passed (both sacred router paths render)
- `node test_planner.js` → All 208 assertions evaluated
- `node test_translations_fallback.js` → 8 passed (min bundles in sync)
- `node test_share_mix_roundtrip.js` → 5/5 passed

## Trust-rail / NEVER-list check
Untouched: `APY_SANITY_LIMIT`, `DEFAULT_MIN_TVL`, anomaly flags, degen haircut, `__APP_MODE` router, parameterized-URL behavior, `vercel.json`, SEO generators, bots/workers. Reads derived plan fields only. Auto-mergeable after verifier PASS.
