# 211 — build notes (`yield.garden` → `www.defi.garden` host consolidation)

Branch `claude/loop-211`, base `origin/main` @ `7569970e8`. Item was the ONLY row with status
`READY` at pickup (every row 001-210, 212, 213 terminal); no promotion was needed and none was made.
`git ls-remote origin refs/heads/claude/loop-211` returned empty and no open PR named 211 existed —
not already in flight. Tree was clean outside `product-loop-kit/` at pickup.

## What shipped

**One inserted object in `vercel.json`**, as `redirects[0]`:

```json
{
  "source": "/:path*",
  "has": [{ "type": "host", "value": "^(www\\.)?yield\\.garden$" }],
  "destination": "https://www.defi.garden/:path*",
  "permanent": true
}
```

Plus `test_yield_garden_redirect.js` (new, 175 lines, plain/offline lane) and its one-line
registration at the end of `package.json`'s `test:serial` chain. Nothing else changed:
`home.html`, `canonical.js`, every generator and the whole generated estate are byte-untouched.

### Three choices inside leg 1 that were not spelled out in the spec

1. **`/:path*` rather than the spec's `/(.*)` + `$1`.** Both work in Vercel; the named-segment form
   is the documented idiom and makes the source↔destination path correspondence assertable by name
   in the test rather than by capture-group ordinal. Same semantics, same single hop.
2. **The host regex is anchored (`^...$`); the spec's suggested value was not.** Vercel's
   `has.value` is documented as a regex but its match semantics (full vs. substring) are not
   something this run could verify without deploying. Anchors are redundant-but-harmless under
   full-match and load-bearing under substring-match, so anchoring is strictly the safer read of an
   ambiguity whose downside is `yield.garden.evil.com` matching. `test_yield_garden_redirect.js`
   guard 7 case 1 proves this is doing work: it unanchors an in-memory copy and shows the lookalike
   host starts matching.
3. **Placed FIRST in the `redirects` array, not appended.** Vercel redirects are first-match-wins;
   appended, a `yield.garden/tokens/index` request would have taken the pre-existing
   `/tokens/index → /tokens` rule first (a same-host hop) before reaching the host rule on the next
   request. First position keeps every path on the aliased host to one hop, which is what the
   spec's "at most 2 hops" criterion (apex→www, then host→origin) budgets for.

## DEVIATION — leg 2 (static canonical in `home.html`) was deliberately NOT built

Spec 211 §Change item 2 asks for a static `<link rel="canonical" href="https://www.defi.garden/">`
in `home.html`, described as "belt-and-braces". **It is not buildable as specced, and the proof is
inside spec 211 itself** — its own acceptance criteria include:

> - [ ] Tests: `npm test` green; `test_canonical*.js` (or equivalent) passes unmodified.

and `test_canonical.js:112` asserts, verbatim:

> `test('home.html source has no static <link rel="canonical"> tag', …)`
> `'home.html must not contain a static canonical link — the router must be the only source'`

The two criteria are mutually exclusive: satisfying §Change item 2 requires deleting a shipped
acceptance test from item 011. That is not a judgement call this loop gets to make — it is an
architecture decision on the sacred SEO surface, already decided and shipped, and re-litigating it
by deleting its guard is exactly the "guessed intent" build.md §1 warns about.

The supporting record, so a later run does not reopen this from memory:
- `home.html:16-18` — `<!-- No static canonical here (spec 011) — the IA router below is the single
  source of truth for BOTH canonical and og:url, in every mode, on every load. -->`
- `canonical.js:1-7` header comment — *"no static canonical exists in the HTML anymore, so this
  function is the single source of truth"*.
- `home.html:98-100` (router) — *"a missing pre-render canonical is neutral, a wrong one is actively
  harmful"*. That is the whole argument: `home.html` is the single file served for `/` **and** for
  every `?token=`/`?chain=`/`?pool=` URL, so any *static* canonical it carries is necessarily the
  root URL, and therefore necessarily wrong on thousands of parameterised URLs during the raw-HTML
  pass. Spec 211 anticipated the failure mode ("would collapse thousands of distinct canonicals to
  root, which is far worse than the problem being fixed") but proposed the change anyway; item 011
  had already measured it and removed the tag.
- `specs/011.md:11` — the change that removed it: *"Remove the static `<link rel="canonical">` from
  the head (home.html:15)."*

**Leg 2 also has no remaining job once leg 1 lands.** Its stated purpose was the one GSC
`Duplicate without user-selected canonical` page on the `yield.garden` property. A 301 means that
host stops serving HTML at all — there is no page left to carry a canonical tag. The belt is the
braces.

Recorded as an executable fact rather than a comment: `test_yield_garden_redirect.js` guard 6
asserts `home.html` still has no static canonical, so if a later run "completes" 211 by adding it,
two tests go red and this file is one grep away.

## Verification

**Offline (all green, this run):**
- `node test_yield_garden_redirect.js` — 22 assertions, incl. the executed host-regex match/no-match
  table (`yield.garden`, `www.yield.garden` match; `defi.garden`, `www.defi.garden`, `myyield.garden`,
  `yield.gardenx`, `yield.garden.evil.com`, `notdefi.garden` do not) and 4 self-defeat mutations.
- `node test_test_registry.js` — the new file is registered; no orphans/ghosts/dupes.
- `node test_canonical.js` — 24/24, unmodified (the leg-2 guard, still green because leg 2 wasn't built).
- `node test_markdown_negotiation.js` — 91 assertions; the existing redirect/rewrite table is intact.
- Full `npm test` — **128/135 pass, 7 red, all 7 re-run serially afterwards and green.** The reds
  (`test_kpi_sharpe_sort`, `test_pool_logo`, `test_filter_dropdown_polish`, `test_tend_reminder`,
  `test_landing_return`, `test_report_share`, `test_mean30d_sanity`) each failed in under 1s with
  `EADDRINUSE` on the browser-lane dev-server port — this run's suite raced the verifier's own
  concurrent test runs. None touches a file in this diff. The suite takes ~20 minutes wall, well past
  the 5-minute foreground timebox, so it ran backgrounded with bounded polls (2026-07-11 rule).
- Verifier residual worth clearing here so it is not re-raised: `@nodable`, `anynum`, `is-unsafe`,
  `path-expression-matcher`, `fast-xml-builder` in `node_modules/` are all transitive dependencies of
  `fast-xml-parser@5.10.0` (item 074's v4→v5 bump) — `npm ls` resolves the full chain, each is in
  `package-lock.json` with an integrity hash, and a plain `npm ci` installs them. Unfamiliar names,
  not unaccounted ones.

**Live baseline measured this run (`curl -I`, before the change deploys), so the post-deploy check
has a real before:**

| host | before |
|---|---|
| `https://www.yield.garden/` | **200** (serves the app) |
| `https://yield.garden/` | 307 → `https://www.yield.garden/` |
| `https://www.yield.garden/tokens/usdc` | **200** |
| `https://www.defi.garden/` | 200 |

**What this run could NOT verify, stated plainly rather than glossed:** the redirect itself.
`dev-server.js` is a 72-line static file server that does not read `vercel.json`, and a PR preview
deploys on a `*.vercel.app` host where the `has` host predicate deliberately does not match. So the
only place `301 + location: https://www.defi.garden/...` becomes observable is production, after
merge. The post-merge curl results are appended below.

Item 212's round-4 lesson is the live precedent for why that matters: a `vercel.json` that was valid
JSON, semantically right and green on every local gate was still rejected by Vercel's own schema at
deploy time (16-item cap on `has`/`missing`). Our `has` array has one item, but the general point
stands — the deploy is the gate.

## Post-merge live verification

<!-- Filled in by this run immediately after the merge deploy. -->

## Follow-ups filed, deliberately unbuilt

- **The leg-2 question belongs to the human, not to a loop.** If a static no-JS canonical floor for
  `home.html` is genuinely wanted, the only non-destructive shape is a *server-side* one (a Vercel
  `headers` rule emitting `Link: <…>; rel="canonical"`, computable per-URL) — not a static tag in a
  file served for thousands of distinct URLs. Not filed as a backlog row because item 011 already
  decided the underlying question and nothing in this run's evidence reopens it.
- **Measurement is human-side and slow.** GSC `yield.garden` impressions (26 in 16 months) decaying
  to 0 with no matching drop on `www.defi.garden`, checked over ~6 weeks — the standing GSC
  arrangement (decision 2026-07-12) has the human reading GSC manually through ~2026-08-23.
- **Keep the domain and its GSC property** (spec 211 §Open questions, human-answered 2026-08-02).
  Nothing in this change touches either.
