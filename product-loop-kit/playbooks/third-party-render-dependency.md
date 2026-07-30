# third-party-render-dependency — playbook

**When:** an element is missing from a rendered surface and the render code gates it on data that
arrives from a host we do not control — `X && React.createElement(...)`, `data?.foo ? … : null`, or any
conditional whose truthiness traces back to a `fetch()` of somebody else's API. Tells: the audit
scanner reports a `dead-cta`/missing-element finding on **one** pool/page; the element is fine when you
look by hand; the fetch's own code comment says something like *"fail silently"*.

**Answer in one line:** it is almost never one instance — measure the fraction of the corpus that loses
the element when that fetch fails, because a silent-failure fetch behind a render gate means the element
is missing for **everyone** whose first visit hit an ad-blocker, a CSP, an outage, or a bounce.

## Steps

1. **Find the render gate, not the missing element.** Grep the class the finding names
   (`.cta-button-protocol`) and read every site. If the pattern is `value && createElement(...)`, note
   that a falsy value renders **nothing at all** — no fallback, no explanation, no analytics event. An
   element that emits nothing when absent is invisible in the metrics: you will never see this in a
   funnel, only in a scan.
2. **Walk the resolution chain to its `null`.** Write the tiers out in order
   (`app.js:2429 getProtocolUrl()` is the worked example: `pool.url → dynamicProtocolUrls →
   PROTOCOL_URLS → null`). For each tier ask:
   - *Is this field ever actually present?* (`pool.url`: zero of 736 snapshot rows. Item 166 deleted the
     same phantom branch from `generate-llms.js`. **Phantom tiers are common** — a tier that never fires
     makes the chain look deeper than it is.)
   - *Does it come from a different host than the main data feed?* Check for a **second** third-party
     endpoint. Here `dynamicProtocolUrls` came from `api.llama.fi/protocols`, not the pools API — a
     dependency nobody would find by grepping for the known data source.
   - *Is the failure silent, and is the result cached?* `app.js:1285` fails silently by design and caches
     to `localStorage` **permanently** — so **the first visit decides forever.** For an SEO product that
     is the worst possible cohort: first-visit-from-search is what the whole estate exists to serve.
3. **Measure the degraded path over the real corpus — a number, not an adjective.** Force the
   third-party tier empty and count how many rows still resolve, using the app's own key transform
   (parse it out of the source; do not re-type it). Report `X/N (p%)` for the committed snapshot **and**
   for the population traffic actually lands on. Worked example: 522/736 (70.9%) on the snapshot, and
   148 of 438 resolvable `?pool=` deep links (33.8%) uncovered.
4. **Decision rule:**
   - **fraction is a handful of rows, and the source is hand-maintained** → still not a hand edit; go to
     Resolution A. See the trap below.
   - **fraction is material (>5% of any population that traffic reaches)** → Resolution A.
   - **the tier resolves for everything and the finding really was one row** → Resolution B.
   - **nothing resolves it in any tier, ever** (a genuinely link-less entity) → Resolution C.

## Resolution

**A — bake the map into our own origin, as an added tier.** Generate the artifact in the CI job that
**already** regenerates data (never a new workflow — Vercel deployment quota, 2026-07-13), commit it,
load it from our origin, and insert it as a tier. Non-negotiables learned the hard way:
- **Insert, do not replace.** Keep the live fetch FIRST (it has the fresher value between bakes) and keep
  the old static map LAST. Additive depth cannot regress anything.
- **Derive the artifact's keys from the app's own expression, proven by a test that reads both files.**
  A generator that keys differently produces a file nothing ever reads — a total no-op that passes every
  "the artifact exists and is well-formed" assertion. Marker comment + `new Function` behavioural parity.
  (Item 166 precedent.)
- **Restrict the artifact's population to what the app can actually look up**, and check whether that
  population is the snapshot or the LIVE feed. Deep links (`?pool=`) bypass the committed snapshot and
  load live data — restricting to the snapshot silently excludes the exact cohort you are fixing for.
- **Silent-failure posture, and a `finally`.** Copy the existing snapshot loader's shape. If anything
  gates on "the artifact has settled", release that gate on success, non-ok, **and** throw — a 404 on a
  bare dev server must never wedge anything. (Residual: a *hanging* request satisfies none of the three.)

**B — a single true instance.** Fix the row and add the assertion. Still measure step 3 first; "it was
one row" is a conclusion, not a starting assumption.

**C — render something honest instead of nothing.** A labelled link to a real destination beats empty
space. Three rules: different copy (must not impersonate the primary CTA), EN + KO together, and a
**new disjoint analytics `source` value** — never the primary CTA's, or the north-star metric silently
redefines itself upward while nothing improves.

## Traps

- **Fixing the instance instead of the class.** Item 138 hit this exact defect on the ICP's flagship
  pool and added **one** static map entry; **134** distinct projects stayed broken (that count already
  excludes the one 138 covered — do not subtract for it) and the class reopened on every
  new DefiLlama listing. This is `detector-signal-coverage.md`'s "the checker inherits the shape of the
  last bug" thesis in its **repair** costume — the *fix* was scoped to the instance that bit us. A diff
  that only grows a hand-maintained map is not a fix.
- **⚠ Adding a fallback tier can silently disarm the test that guarded the tier below it.** The single
  highest-value check in this playbook. If an older test proves "tier N is load-bearing" by rendering a
  case that only tier N resolves, and your new tier ALSO resolves that case, the test now passes via
  your tier and would stay green if tier N were deleted. **Before shipping a new tier, grep the tests
  that assert on the old one and re-run each with the old tier's entry deleted.** Fix by making those
  tests block/404 your new artifact so they keep isolating the tier they were written for. Proof
  technique: delete the old tier's entry AND your test's blocking route — if it passes, the guard was
  vacuous. (Item 182 introduced exactly this against item 138's `sky-lending` guard and nearly shipped it.)
- **An assertion that counts absence breaks the moment you add an honest fallback.** `0 elements` was
  the right assertion when a falsy URL rendered nothing; once a fallback reuses the same class it is
  false. Do not delete the control and do not loosen it to "some element exists" — change it from
  *counting* to *distinguishing*: assert the copy is not the primary CTA's, and that clicking fires the
  fallback's `source`, never the primary's. That is strictly stronger than a count.
- **Instrumenting presence can manufacture the very absence it measures.** If you add a
  `<thing>Present: boolean` property, check WHEN it is sampled. Sampling before your artifact resolves
  reports `false` for elements that render fine. Gate the **emit**; never gate the **render** (that is
  the SEO path's first paint — don't trade the product for its measurement).
- **A blocked host in the sandbox is not automatically fixture noise.** It is a faithful *sample* of a
  prod condition. See `product-audit.md`'s COUNTER-TRAP section: the false-alarm check on this finding
  *enlarged* it from one pool to 29.1% of the estate.
- **Irony to state out loud rather than hide:** baking removes a runtime third-party dependency by
  adding a bake-time one. That is a good trade (loud + recoverable + last artifact keeps serving, versus
  silent + lossy), but say so in the PR, and reach for `continue-on-error` before reverting the item if
  the daily job starts failing on it.

## Provenance

Distilled from **item 182** (2026-07-30, PR — "the Start Earning CTA must not depend on a
silently-failing third-party fetch"): the audit scanner's second-ever originating finding and the first
defect the loop located ON the north-star surface. One `dead-cta` P1 on one pool became a measured
29.1% of the snapshot / 33.8% of the SEO estate's deep-linked pool-detail pages; fixed by a
CI-baked `data/protocol-urls.json` tier taking degraded-path coverage 70.9% → 99.9%, plus an honest
DefiLlama fallback (`source: 'defillama_fallback'`) for the one true-null project (`sdai`).
Prior instance of the same class treated one-at-a-time: **item 138** (`sky-lending`).
Cross-references: `detector-signal-coverage.md` (the repair-costume variant of its thesis),
`product-audit.md` (COUNTER-TRAP — when a blocked host is a real signal),
`dual-source-logic-divergence.md` (the related but distinct "two forked copies drift" class).
