# Playbook — archetype coherence (a planner surface shows copy or numbers built for a DIFFERENT goal archetype)

**When:** a rendered-audit finding, a human bug report, or a share/checkout/modal surface shows
subscription-flavoured wording ("forever", "/mo covered", "a card funded by $X/mo") or an
out-of-nowhere dollar figure on a plan whose goal is a **one-time item** (TARGET: sneakers, iphone,
watches) or a **horizon** (GROWTH: home, retirement). Canonical sightings: item 139 (waitlist-modal
"garden already covers X — a card funded by $91k/mo" on TARGET plans) and item 146 (the post-waitlist
share card reading "🌱 My yield covers `iphone` — forever · ≈$155,000 working at 8.5% · $1,100/mo
covered forever").

**Answer in one line:** it is almost always the shared `GOALS[].target` field being read with the
wrong unit — `$/month` for SUBSCRIPTION, **item price** for TARGET — by a helper that never checked
the archetype; gate at the helper, then find the OTHER un-gated consumers, because there is never
just one.

## Steps
1. **Confirm the unit collision first.** `planner.js` `GOALS` (~line 734): SUBSCRIPTION entries carry
   `category: 'subscription'|'bills'`, `target: <$/mo>`, **`isMonthly: true`**. TARGET entries carry
   `target: <item price>` and **no `isMonthly`**. GROWTH entries carry **no `target`** (so they are
   immune to this class — a GROWTH sighting means a *different* root cause; look at the copy branch,
   not the number).
   Decision rule: if the absurd figure ≈ `goalPrice × 12 ÷ apy`, you have found it — that is
   `foreverNumber()` applied to an item price.
2. **Find the un-archetype-aware helper.** The known one is `mixStats()` (planner.js ~276). Its guard
   must be `g.isMonthly === true`, not `typeof g.target === 'number'`. Check any new helper that
   resolves an id through `goalById()` for the same omission.
3. **Check whether the STATE feeding it is gated too.** Fixing the helper is half the job: the mix
   seed effect (planner.js ~1684) used to run `setSelectedSubs([goal])` for every archetype, so a
   TARGET plan carried a bogus one-item bundle from first render. Decision rule: if a value is gated
   to `archetype === 'subscription'` everywhere it is **persisted** (planner.js ~1934, ~1962 write
   `mix: archetype === 'subscription' ? selectedSubs : null`), then computing it for other archetypes
   was unintended — gate the producer, don't just gate each reader.
4. **Audit EVERY consumer, don't stop at the one in the screenshot.** Grep the derived value
   (`currentMixStats`, `selectedSubs`, `repMix`) and check each site's archetype gate:
   `grep -n "currentMixStats\|selectedSubs" planner.js`. Item 139 gated exactly one modal line and
   left the share card, the tweet, and the operator email un-gated — item 146 existed only because
   that audit was skipped. Write the un-gated list into the spec before writing code.
5. **Check the COPY branch separately from the NUMBER branch.** A surface can have honest numbers and
   still be archetype-incoherent (subscription-worded keys like `shareTweet`, `shareSubBundle`,
   `shareSubSubline` applied to a TARGET plan). Look for an existing archetype-branching
   implementation to reuse before writing new copy: `doShare()` (planner.js ~2008,
   now `buildShareCopy()`) is the reference four-way branch.
6. **Check for raw-id leaks in the same functions.** Label loops of the shape
   `return found ? t(found.labelKey) : id` print the internal id (`iphone`, `rent`, `phonebill`) when
   the id is not a `SUBSCRIPTION_LADDER` rung. Always `goalLabel(t, id)`.

## Resolution
Gate the helper on `isMonthly === true`; gate the state producer on `archetype === 'subscription'`;
route the non-subscription copy through the existing archetype branch rather than writing a third
variant. Acceptance is **rendered** (2026-07-11 decision): drive the real `plan.html` with a TARGET
goal and read what is actually drawn. For canvas share cards, spy
`CanvasRenderingContext2D.prototype.fillText` via `page.addInitScript` and assert on the collected
strings — that is the real rendered output, not a fixture. Always pin the SUBSCRIPTION path with its
own assertion in the same test, including a **manually toggled mix**, or the next refactor will
quietly regress it.

## Traps
- **The number looks plausible.** $155,000 is not absurd on its face — the tell is that the user never
  entered it. Magnitude-based scanners (`audit-app.js`'s `ABSURD_MAGNITUDE`) will not catch this
  class; only archetype reasoning will.
- **Fixing one render site and calling it done** — the 139→146 failure mode. The root cause fans out.
- **Assuming "reuse the shared helper" is always safe.** See `dual-source-logic-divergence.md`: the
  subscription path here reads `selectedSubs` (what the user toggled) while `doShare` reads
  `coveredBundle(...)` (what the capital covers). They are different features that look alike;
  collapsing them would have silently dropped a user-selected service from their own share card.
- **Baseline runs that time out instead of failing.** If your new test waits on something the buggy
  code never produces (e.g. a clipboard URL that pre-fix is never attached), the *content* assertions
  die before they read anything, and a timeout proves nothing about an "unchanged" claim. Run a
  second probe with that wait neutered to read baseline content.
- GROWTH goals have no `target`, so they never show the bogus-figure symptom — do not conclude the bug
  is absent because a retirement plan looks fine.

## Provenance
Item 146 (2026-07-26) — post-waitlist share path subscription-hardcoded; verifier PASS HIGH 9/9.
Distilled from `specs/146.md`, `specs/146-notes.md`, `specs/146-pr.md`, and the follow-up flag left by
item 139 (`specs/139.md` Territory notes lines 101-110) that this item finally closed.
