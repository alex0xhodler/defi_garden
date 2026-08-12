# 276 — build notes

## Mechanism (measured, not guessed)
`occlusionPassEval`'s victim loop had two blanket exclusions: (1) any victim itself
`position:fixed`/`sticky` was skipped unconditionally; (2) any victim contained by ANY overlay
(computed once, before the per-overlay comparison loop) was skipped unconditionally. Both are
strictly wider than the mechanism they exist to protect — a victim should only be exempt from the
ONE overlay that actually contains it, never from every overlay on the page.

## Fix
Moved the containment check inside the `for (var oi = 0; oi < overlays.length; oi++)` loop:
`if (ov.el === vel || ov.el.contains(vel)) continue;` — a per-pair skip. Dropped the victim-side
fixed/sticky pre-filter entirely, since one overlay occluding a different overlay's content is
exactly the class this item exists to catch (item 273's shape).

## Debugging note
The first draft of the reproduction fixture (test 10) defined a `.toggle` CSS class but never
placed a `<div class="toggle">` element in the fixture's body — `querySelector` returned no match
and the geometry never overlapped, producing a false RED that looked like the code fix was
insufficient. Confirmed via a standalone `page.evaluate` geometry dump before concluding the
fixture (not the fix) was wrong; corrected by adding the missing element.

## Non-vacuity
`git stash push -- audit-app.js` → reran `test_audit_occlusion_lens.js` → test (10) failed with
`got: []` (the exact silent-blind-spot the item names) → `git stash pop` → `md5sum audit-app.js`
== `3a754d80a2457cb136c07ef354532a80` both before the stash and after the pop (byte-identical) →
reran → test (10) green.

## Regression check
Ran `test_audit_occlusion_lens_reliability.js` (13/13 green — the detection-rate reliability suite
is orthogonal to this predicate change) and `test_audit_app.js` (3/3 green, ZERO new occlusion
findings on any real surface — including the previously-quarantined grid surfaces, which now read
fully clear; unrelated to this item, not touched here, noted for a future heartbeat tick).

## Deviation from spec
None. Scope stayed exactly the per-pair rewrite; the pre-existing test-2 anchor bug (source
`indexOf` matching a comment) and the now-clear grid quarantine were left untouched per
smallest-change discipline — both filed as backlog rows instead.

## Ceremony
Spec 78 lines (LOW cap 80). This file ~45 lines (LOW cap 60). Test:code ratio: ~90 new test lines
vs ~15 changed code lines in `occlusionPassEval` (~6:1) — over the LOW 2:1 cap. Justified the same
way item 273 recorded: the two new fixtures each carry the house per-test overhead (page setup,
error sink, teardown, ~25 lines) shared with every sibling test in this file, not novel test logic.
