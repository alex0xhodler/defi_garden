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
     If you add a test file, append it to `test:serial`; nothing else needs touching. This step used to
     be enforced by human memory alone, and memory lost: measured on `main` @ `a4dbd99cd` (item 205),
     **7 of 127** `test_*.js` files on disk had accumulated over roughly six months with no wiring into
     `test:serial` at all — not red, not skipped, just absent from every count. `test_test_registry.js`
     now runs this exact check as part of `test:serial` itself (no orphans / no ghosts / no duplicates /
     parse integrity, plus a self-defeat case proving it can go red — see specs/205.md, 205-notes.md).
     Treat this step as a description of what that test enforces, not a substitute for it: a red from
     `test_test_registry.js` means this step was violated again.
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

## When the gate's own helper PARSES the thing it measures (items 185 → 186)

**When:** a test asserts on something a hand-rolled helper *derived* from source — an occurrence count, a
comment-stripped scan, a regex over code — rather than on behaviour. Also whenever a backlog row says a
known limitation is **"dormant"**.

**Answer in one line:** a hand-rolled tokenizer is a second implementation of the language, it is wrong
in ways `grep` cannot find, and "dormant" is a claim about the code you thought to look for — instrument
the helper and read what it *actually consumed* before you believe it.

**Steps:**
1. **Instrument the helper; never grep for the bad shape.** Item 186's row said the blind spot was
   dormant because `grep` found no regex literal in `audit-app.js` containing `/` or `*`. True — and
   irrelevant: re-running the helper with a recorder on every span it consumed surfaced a *different*
   live shape (a `"` inside a regex character class, `audit-app.js:324/:771/:811`) eating 643/1,188/1,185
   characters of real code that day. ~15 lines of throwaway `node`: same scanner, push `[kind, offset,
   length]` for each consumed span, sort by length, print the top 8 with their source line. Anything in
   that list that is not a comment or a string is a defect.
2. **Decision rule — dormant vs live.** A consumed span containing real code (a statement, a loop, a
   call) → **live**, and the item's fix shape must cover the shape actually misfiring, not the one that
   was reported. Only comments/strings consumed → dormant; a guard test is then proportionate.
3. **Pick the fix by what the measurement showed, not by what the row proposed.** 186's row offered a
   cheap guard test for one shape; the measurement retired it, because the guard would have scored zero
   on the shape that was live. Re-measuring the premise is part of building the item — a row's severity
   claim ages the moment it is written.
4. **Freeze the pre-fix implementation as a reference and assert it stays wrong.** Copy the old helper
   verbatim into the test as `legacyStrip()`-style dead code, comment it as frozen, and assert it returns
   the *wrong* answer on your mutation fixture. Without it, "the new tests pass" cannot distinguish "the
   fix works" from "the fixture never exercised the bug".
5. **Add one whole-artifact invariant, not just shape-specific cases.** Every runaway-tokenizer bug ends
   the same way: consumption to EOF. Assert a marker from the artifact's own last line survives the
   helper — derived at run time, and asserted present in the raw input first so it cannot rot into a
   vacuous truth. One assertion, catches every future shape.
6. **Test the OPPOSITE misfire too.** A stripper taught to see regexes can now mistake *division* for a
   regex and under-count — worse than the bug you fixed, because under-counting is what silent-green is
   made of. Synthetic cases for both directions, and bound the blast radius in the code (186 bails an
   unterminated regex at the newline, so a misfire costs one line, never the file).

**Traps:**
- **The count not moving is the evidence, not a disappointment.** 186's assertion still reads
  `occurrences === 3` on the real file. A counter fix that *changes* the asserted number is a relaxation
  wearing a repair's clothes — check which one you shipped.
- **Where you inject a mutation fixture decides whether it proves anything.** A runaway scan only reaches
  EOF if no closing token follows it. 186's `/[/*]/` fixture injected near the top of `audit-app.js` gets
  *recovered* by a later unrelated `*/`, so the pre-fix scanner returns the same answer as the fixed one
  and the proof is vacuous. Find the artifact's last closing token (`*/` at offset 171,689 there) and
  inject after it — then say so, because the placement bounds the severity claim you are entitled to make.
- **A defeat test on the helper is worth more than another case on the artifact.** The strongest check in
  186's verification was breaking `isRegexPosition()` on a scratch copy of the *test file* and confirming
  exactly the three regex-dependent cases went red. Two of three defeats were caught only by the explicit
  synthetic cases — the real-file count survived them, i.e. it passes partly by luck of the file's current
  shape. Know which of your assertions is actually load-bearing.
- **A tokenizer caveat compounds instead of closing.** 185 disclosed it in prose; its verifier turned the
  prose into a PoC; 186 filed and fixed it and disclosed the next layer (post-increment-then-regex). That
  is the ladder working — but only because each rung was *filed as a row*, not left in a notes file.

Provenance: extended by item **186** (2026-07-30) — `specs/186.md`, `186-notes.md`, `186-pr.md` — from
item **185**'s disclosed-limitation → verifier-PoC → filed-row → fixed chain.
Related: `detector-signal-coverage.md` (a checker blind to the class it should catch — this is the same
disease one level down, in the checker's own tooling), `pre-existing-red-triage.md` (rule F, a stale proxy
metric).

Provenance: item **163** (2026-07-27) — `specs/163.md`, `163-notes.md`, `163-pr.md`, and its LOG entry.
Distilled from: the fresh-clone measurement (19 pass / 17 fail, all `MODULE_NOT_FOUND`, first casualty
at position 5 of 94), `specs/158-notes.md`'s "never observed past position 12" and its 550s
`test_search.js` finding, item **149** (`audit-app.js` failing silently in a fresh clone — the same
class, one file earlier), and item **162**'s `EADDRINUSE` container-contention note.
Related: `pre-existing-red-triage.md` (is this red mine?), `ci-signal-honesty.md` (what CI green means),
`loop-container-contention.md` (files moving under a subagent), `derived-number-rails.md` (prove a
check can fail).

Provenance: item **205** (2026-08-02) — `specs/205.md`, `205-notes.md`. Step 4's "if you add a test
file, append it to `test:serial`" had been a human-memory rail with nothing enforcing it since item
163 introduced it; 205 measured the accumulated damage (7 of 127 `test_*.js` files orphaned, ~6 months)
and closed it with `test_test_registry.js`, wired into `test:serial` itself. Same disease as the 186
provenance note above, one level up: there it was a hand-rolled scanner never shown to fail; here it was
a step of prose never given a checker at all.

## When the assertion reads git TRACKING state, not the working tree (item 229)

**When:** your item adds or deletes **committed generated output** — `spotlights/`, `stories/`,
`sitemap-*.xml`, `og/`, `tokens/`, `data/pools/` — and you are about to write "tests green" from a run
you did **before** committing. Also whenever a test's fixture names a generated path *by literal name*.

**Answer in one line:** a test that reads `git ls-files` is asking about the INDEX, not your working
tree, so a pre-commit run measures a state that will not exist after you commit — and it fails green,
which is the direction nobody checks.

**The mechanism, exactly (229):** `test_vercelignore.js` check (c) asserts every `MUST_KEEP` path is a
git-**tracked** file. The item regenerated `spotlights/`, deleting three pack directories and adding
three new ones. At the moment the suite ran: the deleted files were still tracked (their removal was
only *staged*), and the new files were not tracked yet (untracked). So `git ls-files` still returned the
OLD paths, the stale literal fixture entries resolved, and the full lane reported **52/52 fail=0** —
twice, on two independent runs. Committing flipped the index and the same suite went **51/52**. The
verifier caught it post-commit; two operator runs had already called it green.

**Steps:**
1. **Ask whether any test in the lane reads git.** `grep -rln "ls-files\|git ls-tree\|--cached" test_*.js`
   — in this repo that is `test_vercelignore.js` (and anything that enumerates "tracked" files). If your
   diff adds/deletes committed files and that grep is non-empty, a pre-commit green is **not evidence**.
2. **Re-run the lane AFTER committing, before pushing.** This is the only run that measures the state a
   reviewer, CI, or the deploy will see. Cheap, and it is the whole fix.
3. **Decision rule — literal path vs derived.** If the now-red fixture names a generated path by literal
   slug/filename, do **not** swap in the new name. Ask: *does this path churn by design?* Generated
   output whose names come from live data (pack slugs, token slugs, dated files) churns on every regen,
   so a literal entry is a mirror that goes stale on the very next cadence — derive it from the same
   enumeration the test already computes (`ALL_FILES`), per build.md's guard rule. A literal is only
   correct for genuinely fixed paths (`spotlights/CADENCE.md`, `home.html`).
4. **A derived fixture needs a non-vacuity guard, and the guard needs the WEAKEST predicate.** An empty
   derivation makes the loop iterate zero entries and pass trivially. Guard it — but guard the failure
   mode you named. 229 first shipped `length >= 3` ("the cadence's 3-pack shape"); that is today's
   count dressed as an invariant, and a benign 1- or 2-pack future fails it for a reason unrelated to
   the thing the file tests. The known-bad case is 0, so the predicate is `length > 0`. If you also want
   a standing count invariant, it is a **separately named, separately justified** assertion — never
   folded into the non-vacuity guard's rationale.

**Resolution:** derive the fixture, guard it at `> 0`, re-run post-commit, and record in the notes that
the pre-commit green was not evidence — future runs need to see the trap, not just the fix.

**Traps:**
- **"I ran it twice and it was green" is not independence** when both runs share the same uncommitted
  index state. Two green runs before a commit are one observation, not two.
- **Staged deletion is invisible to `git status --short` readers who only look for `??`.** The old paths
  show as ` D`/`D `, and `git ls-files` still lists them until the commit lands.
- **This generalises past `.vercelignore`.** Any assertion over "what ships" — vercelignore, sitemap
  membership, llms-estate enumeration, IndexNow lists — is a claim about committed bytes. Measure it
  against committed bytes.

**Provenance:** item 229 (spotlight targeting leg), verifier attempt-1 FAIL and attempt-2 FAIL; both
findings and both md5-verified fixes in `specs/229-notes.md` (post-review findings #2 and #3) and
`specs/229.md` §6. Companion: `playbooks/seo-surface-regen-delta.md` for measuring a regen's delta
itself; `playbooks/pre-existing-red-triage.md` once the red is real.
