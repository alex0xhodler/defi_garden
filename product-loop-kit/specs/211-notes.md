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

## Post-merge live verification — and the one thing production disproved

PR #373 merged 2026-08-03 07:11 UTC (Vercel preview check green first, so the schema cap that bit
item 212 was cleared before merging). Measured on production after the deploy promoted, with
`Cache-Control: no-cache` and cache-busting queries:

| request on the alias host | result |
|---|---|
| `/tokens/usdc` | **308** → `https://www.defi.garden/tokens/usdc` ✅ |
| `/chains/solana` | **308** → `https://www.defi.garden/chains/solana` ✅ |
| `/sitemap.xml` | **308** → `https://www.defi.garden/sitemap.xml` ✅ |
| `/nonexistent-xyz-1029` | **308** → same path on the origin ✅ |
| `/plan` | **308** → `https://www.defi.garden/plan` ✅ |
| `/plan.html` | 308 → `https://www.yield.garden/plan` (Vercel's own `cleanUrls` rule orders ahead of user redirects), then 308 to the origin — 2 hops, correct destination |
| **`/`** | **200 — NOT redirected** ❌ |
| **`/?zzz=519`** (root + query, cache-busted) | **200 — NOT redirected** ❌ |

**`/:path*` does not match the root path `/` on Vercel.** Every other path — including one that
does not exist — redirects correctly, so this is a matcher gap, not a config or predicate error.

Caching was ruled out before drawing that conclusion, which matters because the first read of this
looked exactly like a stale edge cache: the alias root was returning `x-vercel-cache: HIT` with
`age: 2878`. Two facts separate the two explanations — a cache-busted **root** request
(`/?zzz=<random>`) still returned 200 while an equally uncached **sub-path**
(`/nonexistent-xyz-<random>`) returned 308 on the same host in the same second. Same deployment,
same predicate; only the path shape differs.

**This is the item's own lesson landing on the item.** The notes above said the deploy is the only
real gate, citing 212. It was: 22 offline assertions, 10 verifier-built mutants and an executed
`path-to-regexp@6` walk over `/:path*` (which matched `/` correctly in isolation) all agreed the
config was right, and production disagreed. `path-to-regexp` matching `/` is not evidence that
Vercel's edge does — the only thing that settles it is a live request.

### The fix (follow-up branch `claude/loop-211-root`, its own PR — #373 was already merged)

A root-only rule inserted as the new `redirects[0]`, pushing the catch-all to `redirects[1]`:

```json
{
  "source": "/",
  "has": [{ "type": "host", "value": "^(www\\.)?yield\\.garden$" }],
  "destination": "https://www.defi.garden/",
  "permanent": true
}
```

**Additive on purpose.** The tempting fix is to swap `/:path*` for the spec's original `/(.*)` +
`$1`. Rejected: `/:path*` is *proven in production* for every non-root path, and replacing it would
risk regressing working behaviour to fix a case a strictly-more-specific extra rule fixes with zero
blast radius. First-match-wins makes the ordering safe, and the root rule carries no query of its
own so `/?pool=<id>&lang=ko` gets its query forwarded.

`test_yield_garden_redirect.js` was reworked for the two-entry shape (now 37 assertions): both
entries carry the identical anchored predicate and `permanent: true`, the full executed host
match/no-match table runs against BOTH, the blast-radius scan now permits exactly indices 0 and 1
and nothing else, and a new self-defeat case deletes the root rule from an in-memory copy and proves
guard 1 goes red. The file's header records the production table above, so nobody merges the two
rules back into one on the theory that a catch-all "obviously" covers the root.

Post-fix live results are appended below.

### Post-fix live verification — all criteria met on production

PR #374 merged 2026-08-03 07:27 UTC. Measured on production after the deploy promoted, with
`Cache-Control: no-cache`:

| criterion | result |
|---|---|
| `https://www.yield.garden/` → 301/308 to the origin | **308 → `https://www.defi.garden/`** ✅ |
| path survives | `/tokens/usdc` → **308 → `https://www.defi.garden/tokens/usdc`** ✅ |
| query survives, exactly | `/?pool=43641cf5-…&lang=ko` → **308 → `https://www.defi.garden/?pool=43641cf5-…&lang=ko`** ✅ |
| apex lands on the origin in ≤2 hops | `https://yield.garden/` → **2 hops → `https://www.defi.garden/`, 200** ✅ |
| `www.defi.garden` unaffected | `/` 200 · `/?token=USDC` 200 · `/tokens/usdc` 200 ✅ |

Verifier residual 2 resolved by measurement rather than by argument: the emitted `Location` for the
root **is** `https://www.defi.garden/` **with** the trailing slash, so acceptance criterion 1's
literal string match holds as written — no RFC 3986 equivalence argument needed.

Two runner-up residuals, both confirmed benign and left alone:
- `/plan.html` on the alias costs 2 hops (Vercel's generated `cleanUrls` redirect to `/plan` orders
  ahead of user redirects, then the host rule fires). Correct destination, within budget — the
  verifier predicted this exact ordering effect.
- `test_markdown_negotiation.js`'s pipeline simulator (`hasMatches`, `:62-76`) returns `false` for
  any `type: "host"` predicate, so it models both host rules as inert. Correct for these two rules,
  but it means the simulator cannot be trusted to model *any* future host routing. Guard 5 of
  `test_yield_garden_redirect.js` covers the gap partially by forbidding a third host predicate.

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
