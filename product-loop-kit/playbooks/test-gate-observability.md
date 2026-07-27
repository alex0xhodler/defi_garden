# test-gate-observability — playbook

When: you are about to write, or rely on, the words **"tests green"** — as a merge gate, in a PR body,
or in a LOG line. Also when a test run "fails" in a way that smells environmental (module-not-found,
timeouts, a suspiciously round number of files having run), or when someone claims a chain is green
without saying how many files actually executed.

Answer in one line: **"tests green" is a claim about how many files produced an observed result —
if you did not count them, you do not know, and the usual answer is that far fewer ran than you think.**

Steps:
  1. **Count what actually ran, before reading any verdict.** `node run-tests.js --lane=plain` and
     `--lane=browser` print a `TOTAL pass=… fail=… timeout=… total=…` line. That `total` is the only
     number that licenses the word "green". A chain that exits non-zero at file 5 of 94 is not "red" —
     it is *unmeasured*, and those are different states with different next actions.
  2. **Decision rule — is a red environmental or real?** Look at the failure text:
     - `MODULE_NOT_FOUND` naming a *generator* (`generate-llms.js`, `compile-app.js`,
       `generate-og-images.js`) or a package → **environmental**. Run `npm ci` (~3s, 67 packages) and
       re-run. `run-tests.js`'s preflight now catches the whole class up front with exit **2** and one
       line; if you see exit 2, stop and run `npm ci`, do not debug the product.
     - `TIMEOUT` on a browser-lane file → **probably not a bug**. `test_search.js` needs ~550s
       standalone (`specs/158-notes.md`), `test_smoke.js` exceeds 120s. Re-run that file alone with a
       raised `--timeout=` before believing it. Default is already lane-aware (120s plain / 600s browser).
     - An assertion message from the file's own suite → **real**. Triage via
       `playbooks/pre-existing-red-triage.md` (is it yours, or red on `main` already?).
  3. **Never let a lane's size become a silent claim.** The browser lane is 61 real-Chromium files and
     **cannot** run inside the 5-minute foreground timebox. Run a named subset with
     `--only=a.js,b.js` and then *write down how many you did not run*. "Green" over an unstated subset
     is the failure mode this playbook exists to stop.
  4. **Check the gate still contains everything.** `node run-tests.js --list` must equal
     `package.json`'s `test:serial` chain — the runner parses that string rather than holding its own
     copy, precisely so a new test file cannot be added to one place and forgotten in the other.
     If you add a test file, append it to `test:serial`; nothing else needs touching.
  5. **Before trusting any check that returned a clean result, prove it can return a dirty one.**
     Mutate the thing under test, watch the check go red, restore, `md5sum`-confirm byte-identical.
     A filter that has never been shown to fail is not evidence of health — see
     `playbooks/derived-number-rails.md` Step 0b, which learned this the same way (item 159's
     vacuous `p.apy` scan).

Resolution:
  - **Environmental** → `npm ci`, re-run, and say so in the notes. Do not open a ticket against the product.
  - **Timeout** → re-run the single file with a raised `--timeout`; if it passes, it is a slow test, not
    a red. Only if it still hangs is it a finding.
  - **Real red** → do NOT fix it inside an unrelated item (the "one item, one change" rule). Record it
    verbatim in the notes and file it as the next backlog row — a red revealed is data for the next
    item, not scope for this one.
  - **Unmeasured** → state the counts honestly (`N of M files ran; the other M-N were not executed`).
    That sentence is always available and always true; "green" often is not.

Traps:
  - **`&&` chains hide everything after the first failure.** This is how 82 of 94 files went unobserved
    for weeks while every session reported on the first 12. If you see a `&&` chain being used as a
    gate, that is the finding.
  - **A one-level grep cannot classify a test file.** `test_seo_surface_audit.js`,
    `test_audit_prescan.js` and `test_audit_app.js` never mention the browser driver — they
    `require('./audit-app.js')`, which does. Classification must follow require edges transitively
    (cycle-safe), or three real browser tests get run under a plain-lane timeout and blamed for it.
  - **Browser tests in parallel collide on a fixed port.** `audit-app.js` binds 8821;
    `specs/162-notes.md` records a live `EADDRINUSE` between two concurrent sessions. The browser lane
    is forced serial for this reason — do not "optimise" it.
  - **A program that scans its own repository can misclassify itself.** `run-tests.js`'s source
    necessarily contains the driver's package name, so `test_run_tests.js` requiring it by a literal
    path — or merely naming the package in a comment — flipped that test file into the browser lane.
    Use a computed path and a reconstructed marker string.
  - **`origin/main` in a cloud checkout is often stale and can have NO merge-base**, making
    `git diff origin/main --stat` return the entire repo. `git fetch origin main` *before* any scope
    check. (Same trap as item 160's LOG line.)
  - **A permanently-red gate is worse than an unobservable one** — it gets ignored. If a default
    invocation cannot plausibly exit 0, that is a defect in the gate, not a fact about the tests.

Provenance: item **163** (2026-07-27) — `specs/163.md`, `163-notes.md`, `163-pr.md`, and its LOG entry.
Distilled from: the fresh-clone measurement (19 pass / 17 fail, all `MODULE_NOT_FOUND`, first casualty
at position 5 of 94), `specs/158-notes.md`'s "never observed past position 12" and its 550s
`test_search.js` finding, item **149** (`audit-app.js` failing silently in a fresh clone — the same
class, one file earlier), and item **162**'s `EADDRINUSE` container-contention note.
Related: `pre-existing-red-triage.md` (is this red mine?), `ci-signal-honesty.md` (what CI green means),
`loop-container-contention.md` (files moving under a subagent), `derived-number-rails.md` (prove a
check can fail).
