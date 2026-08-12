/* Node-only (no browser) acceptance gate for backlog item 173: every static
   SEO page's primary CTA must carry the generator's own eligibility floor
   (`&minTvl=<MIN_POOL_TVL>`) so the link lands on the same pool set the page
   itself lists, instead of falling back to the app's $10M default and
   returning zero pools.

   Run: node test_seo_cta_targets.js

   Pool source: `POOLS_FIXTURE` env var (path to a JSON file: either a bare
   array or `{data:[...]}"`) if set, else a live fetch of
   `https://yields.llama.fi/pools`, cached to a temp file so repeated runs
   are fast. `data/pools-snapshot.json` is NOT a valid substitute — it is
   pre-filtered to the app's $10M floor and would make every assertion below
   vacuously fail/pass for the wrong reason. If neither a fixture nor a live
   fetch is available, this test FAILS LOUDLY — it never passes vacuously.

   --- item 181: three-class verdict (this file was single-class through 180) ---

   specs/181.md measured that this gate's old pass condition — "zero pages
   whose CTA returns 0 live pools right now" — is not a function of the
   repository. Four live measurements over 15h found four different dead
   sets sharing zero members in common, entirely explained by pages sitting
   within a few % of MIN_POOL_TVL oscillating across it between DefiLlama
   TVL updates, with no code change and no regen in between (specs/181.md
   §2-3). A gate that reddens for reasons no diff can fix trains readers to
   skip it. So every scanned page is now classified into exactly one of:

     A. `contract` — FAIL at ANY count > 0. Decidable from the repo alone,
        invariant to live data: missing/invalid/malformed primary CTA,
        missing its own ?token=/?chain= param, wrong/missing &minTvl=, or
        (NEW, item 181) the CTA's param value doesn't belong to the page
        it's on. These are all generator bugs — live pool data can't cause
        or cure them.
     B. `stale` — FAIL at ANY count > 0. A DEAD page (CTA resolves to 0 live
        pools) whose own visible "Last updated" date is more than 2 days
        old. This is the actual lifecycle-failure signal the BACKLOG row
        asked for (a page whose pool set emptied and the regen never
        refreshed) — drift can't produce it, because drift always resolves
        at the next bake (~24h cadence).
     C. `drift` — reported always, FAIL only over budget. CTA well-formed,
        correct floor, param belongs to the page, date fresh (<=2 days),
        0 live pools right now. This is TVL oscillating across the floor
        between bakes — self-healing, not a defect. Each one is printed
        with its best live pool's TVL (ignoring the floor) and signed %
        distance from MIN_POOL_TVL, so a reader can see oscillation
        (single-digit %) vs decay (item 173's N3XT, -78.1%) at a glance.

   DRIFT_BUDGET_FRACTION derivation (item 181, not invented): four live
   measurements in specs/181.md put the drift set at 2/2217, 7/2186, 5/2186
   and 8/2186 — worst observed 8/2186 = 0.37%. 1.0% is ~2.7x that observed
   ceiling, headroom for a second bad day without masking anything, while
   item 173's actual regression (1,749/2200 = 79.5%) clears it by ~80x —
   nothing in the 173 regression class can hide inside this budget. See
   `verdictFor` below for the exact comparison, and the printed summary
   line for the computed allowance on tonight's population.

   Self-checks (mandatory, run BEFORE the live scan, every invocation — see
   `runSelfChecks`) are the permanent non-vacuity guard for this split: they
   prove each class can independently go red without touching a single
   committed page, using synthetic in-memory HTML + pool fixtures and an
   injected `today` (never the real clock). Misbehaviour there aborts with
   exit 2 (run-tests.js's operator-error convention) before any network
   call. */
const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const gen = require('./generate-token-pages.js');
const MIN_POOL_TVL = gen.MIN_POOL_TVL; // never re-typed — the 159 rule
if (typeof MIN_POOL_TVL !== 'number' || MIN_POOL_TVL <= 0) {
  throw new Error('MIN_POOL_TVL not exported as a positive number from generate-token-pages.js');
}

const YIELDS_API = 'https://yields.llama.fi/pools';
const CACHE_FILE = path.join(os.tmpdir(), 'defi-garden-test_seo_cta_targets-pools-cache.json');
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h — fresh enough for a repeated local run

function fetchLivePools() {
  return new Promise((resolve, reject) => {
    https.get(YIELDS_API, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (e) { reject(new Error('live pools response failed to parse: ' + e.message)); }
      });
    }).on('error', (e) => reject(new Error('live pools fetch failed: ' + e.message)));
  });
}

async function loadPools() {
  const fixturePath = process.env.POOLS_FIXTURE;
  if (fixturePath) {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const arr = raw && raw.data ? raw.data : raw;
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new Error('POOLS_FIXTURE=' + fixturePath + ' is empty or not an array — refusing to run vacuously');
    }
    console.log('  (pools source: POOLS_FIXTURE=' + fixturePath + ', ' + arr.length + ' pools)');
    return arr;
  }

  // Cache check.
  try {
    const stat = fs.statSync(CACHE_FILE);
    if (Date.now() - stat.mtimeMs < CACHE_MAX_AGE_MS) {
      const arr = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (Array.isArray(arr) && arr.length > 0) {
        console.log('  (pools source: cache ' + CACHE_FILE + ', ' + arr.length + ' pools)');
        return arr;
      }
    }
  } catch (e) { /* no cache yet — fall through to live fetch */ }

  let arr;
  try {
    arr = await fetchLivePools();
  } catch (e) {
    throw new Error(
      'Could not load a pool set: no POOLS_FIXTURE env var, no fresh cache, and the live fetch failed (' +
      e.message + '). Refusing to pass vacuously — supply POOLS_FIXTURE or restore network access.'
    );
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('Live pools fetch returned an empty/invalid payload — refusing to run vacuously');
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(arr));
  console.log('  (pools source: live fetch, ' + arr.length + ' pools, cached to ' + CACHE_FILE + ')');
  return arr;
}

// Mirrors app.js's token-mode match exactly (symbolMatchesToken, app.js:833):
// substring, case-insensitive, against the pool's DefiLlama symbol.
// T1 (specs/181.md): deliberately WIDER than the generator's own
// `tokenSymbols` component-split match — substring ⊇ component, so this
// test can never count fewer pools than the generator saw at the same
// instant. Do not "fix" this by aligning them; the test mirrors the app
// (what a reader actually lands on), not the generator.
function symbolMatchesToken(poolSymbol, token) {
  if (!poolSymbol || !token) return false;
  return String(poolSymbol).toUpperCase().includes(String(token).toUpperCase());
}

// Mirrors app.js's chain-mode match exactly (regular chain branch, app.js:1872):
// exact, case-sensitive pool.chain equality. T3 (specs/181.md): chains/ pages
// go through the identical classifier below — no separate code path.
function chainMatchesParam(poolChain, chainParam) {
  return poolChain === chainParam;
}

// Mirrors app.js:801's DEFAULT_MIN_TVL exactly — used ONLY to model what the
// app resolves an ABSENT ?minTvl= param to (app.js:927), so the pre-fix
// diagnostic below can report the same "0 live pools at the app's actual
// default floor" figure the heartbeat measured (specs/173.md). This is a
// read-only modeling constant for reporting, never re-typed into either
// generator file (the 159 rule only binds generate-token-pages.js /
// generate-chain-pages.js, not this test's evaluation logic). UNCHANGED by
// item 181.
const APP_DEFAULT_MIN_TVL = 100000;

// item 181: the drift budget, see the header comment for the derivation.
const DRIFT_BUDGET_FRACTION = 0.01; // 1.0% of scanned-with-CTA pages

// Mirrors the app grid's qualification at a given floor: tvlMatch + tvlUsd>0
// (app.js ~1807/1896/1996). minApy defaults to 0 (no ?minApy= on these CTAs),
// so apyMatch is always true here. Anomalous pools are demoted in the app's
// sort, never removed from the count — so no anomaly filter here either.
function countQualifying(pools, minTvl, matchFn) {
  let n = 0;
  for (const p of pools) {
    if (!matchFn(p)) continue;
    if (!((p.tvlUsd || 0) >= minTvl)) continue;
    if (!((p.tvlUsd || 0) > 0)) continue;
    n++;
  }
  return n;
}

// item 181 (drift class): the best live pool for this page's param, IGNORING
// the floor — so a drift report can show how close to the line the page's
// best pool actually is (oscillation) vs genuinely far below it (decay,
// e.g. specs/181.md's N3XT at -78.1%).
function bestLivePoolTvl(pools, matchFn) {
  let best = 0;
  for (const p of pools) {
    if (!matchFn(p)) continue;
    const tvl = p.tvlUsd || 0;
    if (tvl > best) best = tvl;
  }
  return best;
}

// en-US raw dollar formatting (never bare toLocaleString() per CLAUDE.md) —
// mirrors the raw-comma style already used on line ~107's diagnostic in this
// same file, and matches specs/181.md's own drift-line example ("$99,481"),
// which is a full figure, not gen.formatUsd's K/M/B-abbreviated form (that
// function is for page copy, not a diagnostic table — a deliberate, noted
// deviation from reusing it here; see specs/181-notes.md §8).
function formatUsdRaw(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

// item 181: signed percentage distance from MIN_POOL_TVL, one decimal,
// explicit sign — "+8.0%" / "-78.1%".
function formatSignedPct(pct) {
  const sign = pct >= 0 ? '+' : '';
  return sign + pct.toFixed(1) + '%';
}

// Extract the primary, app-bound CTA href from a generated page: the
// `tp-cta`/`cp-cta` anchor whose target is a `?token=`/`?chain=` app URL —
// NOT the sibling `tp-cta`/`cp-cta` waitlist button (`/plan.html?waitlist=1`),
// which shares the same CSS class but isn't app-bound.
const CTA_LINK_RE = /class="(?:tp|cp)-cta"\s+href="([^"]+)"/g;
function extractPrimaryCtaHref(html) {
  const hrefs = [];
  let m;
  CTA_LINK_RE.lastIndex = 0;
  while ((m = CTA_LINK_RE.exec(html))) hrefs.push(m[1]);
  return hrefs.find((h) => /[?&](token|chain)=/.test(h)) || null;
}

// item 181 (stale class): the page's own visible freshness signal — the
// SAME string as `renderLastUpdatedHtml` (generate-token-pages.js) renders
// and feeds to `dateModified` (they can never drift from each other by
// construction, per that function's own comment). Parsed with an explicit
// month-name table and `Date.UTC` — never `Date.parse` on an en-US string,
// which resolves to local time, not UTC, and this comparison must be
// UTC/date-only per the spec.
const LAST_UPDATED_RE = /<p class="note">Last updated ([A-Za-z]+) (\d{1,2}), (\d{4})<\/p>/;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
function parseLastUpdatedDate(html) {
  const m = LAST_UPDATED_RE.exec(html);
  if (!m) return null;
  const monthIdx = MONTH_NAMES.indexOf(m[1]);
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (monthIdx === -1 || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  return { ms: Date.UTC(year, monthIdx, day), dateStr: m[1] + ' ' + m[2] + ', ' + m[3] };
}
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 2; // "allows one missed bake" — specs/181.md

function listPages(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.html') && f !== 'index.html')
    .map((f) => path.join(dir, f));
}

// --- item 181: the classifier ----------------------------------------------
// Pure function: no fs/network access, so it is fully exercisable by
// `runSelfChecks` on synthetic fixtures. `today` is injected (UTC ms,
// midnight) — never read from the real clock in here.
//
// Returns { class: 'skip'|'contract'|'stale'|'drift'|'ok', detail }.
// 'skip' is not a verdict class (T4: hub pages with no app-bound CTA, e.g.
// tokens/index.html) — it is excluded from every count exactly as before.
function classifyPage({ html, file, surface, pools, today }) {
  const href = extractPrimaryCtaHref(html);
  if (!href) return { class: 'skip', detail: {} };

  let url;
  try {
    url = new URL(href);
  } catch (e) {
    return { class: 'contract', detail: { reason: 'primary CTA href is not a valid URL: ' + href, href } };
  }

  const paramValue = url.searchParams.get(surface.paramName);
  if (!paramValue) {
    return {
      class: 'contract',
      detail: { reason: 'primary CTA href is missing its own ?' + surface.paramName + '= param: ' + href, href }
    };
  }

  const minTvlParam = url.searchParams.get('minTvl');
  if (minTvlParam !== String(MIN_POOL_TVL)) {
    // Diagnostic only (not part of the pass/fail signal): what the app
    // actually resolves this exact CTA href to TODAY, live — i.e. the
    // heartbeat's own "0 of 2200" measurement, reproduced here so the
    // red-transcript numbers are directly comparable to specs/173.md.
    const appEffectiveMinTvl = minTvlParam !== null ? parseInt(minTvlParam, 10) : APP_DEFAULT_MIN_TVL;
    const appLiveCount = countQualifying(pools, appEffectiveMinTvl, surface.matchFor(paramValue));
    return {
      class: 'contract',
      detail: {
        reason: 'minTvl=' + minTvlParam + ' (expected ' + MIN_POOL_TVL + '); app resolves this link to minTvl=' +
          appEffectiveMinTvl + ' today, returning ' + appLiveCount + ' live pool(s)',
        href, paramValue, appEffectiveMinTvl, appLiveCount
      }
    };
  }

  // item 181 NEW sub-check: the CTA's param value must belong to the page
  // it sits on. Verified over all 2,186 committed tokens/+chains/ pages
  // before shipping (specs/181-notes.md §... — 0 disagreements), so this
  // ships as a fatal contract rule per the spec's own branch condition
  // ("if it holds for 100% today, ship it as a contract rule").
  // generate-chain-pages.js imports this exact function and aliases it
  // `chainSlug` (generate-chain-pages.js:41) — same slugifier, both surfaces.
  const expectedSlug = path.basename(file, '.html');
  const actualSlug = gen.tokenSlug(paramValue);
  if (actualSlug !== expectedSlug) {
    return {
      class: 'contract',
      detail: {
        reason: 'CTA param "' + paramValue + '" slugifies to "' + actualSlug + '", but the page is "' + expectedSlug + '"',
        href, paramValue
      }
    };
  }

  const effectiveMinTvl = parseInt(minTvlParam, 10);
  const matchFn = surface.matchFor(paramValue);
  const liveCount = countQualifying(pools, effectiveMinTvl, matchFn);

  if (liveCount >= 1) {
    return { class: 'ok', detail: { href, paramValue, liveCount } };
  }

  // Dead (0 live pools at the correct floor). Class depends only on the
  // page's own visible freshness signal from here — never on how far below
  // the floor the best pool sits (that distinction is drift's job below).
  const dateInfo = parseLastUpdatedDate(html);
  if (!dateInfo) {
    // Conservative default (spec): an unparseable date on a DEAD page can't
    // prove freshness, so it fails stale rather than passing silently.
    // A page that is alive is never checked for staleness (T4 spirit —
    // this branch is only reachable after liveCount < 1 above).
    return {
      class: 'stale',
      detail: { reason: 'dead CTA and the "Last updated" date could not be parsed — cannot prove freshness', href, paramValue }
    };
  }
  const ageDays = Math.floor((today - dateInfo.ms) / MS_PER_DAY);
  if (ageDays > STALE_AFTER_DAYS) {
    return {
      class: 'stale',
      detail: {
        reason: 'dead CTA and the page is ' + ageDays + ' day(s) old (> ' + STALE_AFTER_DAYS + '-day budget), dated ' + dateInfo.dateStr,
        href, paramValue, ageDays, dateStr: dateInfo.dateStr
      }
    };
  }

  // Dead + fresh: drift. Report, never throw from here — the budget
  // decision is verdictFor's job, over the whole scan.
  const bestTvl = bestLivePoolTvl(pools, matchFn);
  const distancePct = ((bestTvl - MIN_POOL_TVL) / MIN_POOL_TVL) * 100;
  return { class: 'drift', detail: { href, paramValue, bestTvl, distancePct, dateStr: dateInfo.dateStr, ageDays } };
}

// --- item 181: the verdict ---------------------------------------------------
// Pure function over the scan's aggregate counts. contract and stale are
// absolute (any count > 0 fails); drift is bounded by DRIFT_BUDGET_FRACTION
// of scannedWithCta, computed here (not hardcoded) so the printed allowance
// always matches tonight's actual population size.
function verdictFor({ contractCount, staleCount, driftCount, scannedWithCta }) {
  const allowance = scannedWithCta * DRIFT_BUDGET_FRACTION;
  const reasons = [];
  if (contractCount > 0) reasons.push(contractCount + ' contract failure(s) (repo-caused, invariant to live data)');
  if (staleCount > 0) reasons.push(staleCount + ' stale failure(s) (dead CTA + generation date > ' + STALE_AFTER_DAYS + ' days old)');
  if (driftCount > allowance) {
    reasons.push('drift ' + driftCount + ' exceeds budget ' + allowance.toLocaleString('en-US', { maximumFractionDigits: 2 }) +
      ' (' + (DRIFT_BUDGET_FRACTION * 100).toFixed(1) + '% of ' + scannedWithCta + ' scanned-with-CTA pages)');
  }
  return { ok: reasons.length === 0, reasons, allowance };
}

// --- item 181: self-checks (the non-vacuity proof, and a permanent guard) --
// Runs BEFORE loadPools()/any network call, on synthetic in-memory HTML +
// pool fixtures only. Covers the eight cases the spec enumerates. `today`
// is fixed (never the real clock), so these never flake with the calendar.
function runSelfChecks() {
  const TODAY = Date.UTC(2026, 6, 30); // 2026-07-30 UTC, matches this run's real date but is NOT read from Date.now()
  const FRESH_DATE_HTML = '<p class="note">Last updated July 29, 2026</p>'; // 1 day old at TODAY
  const STALE_DATE_HTML = '<p class="note">Last updated July 20, 2026</p>'; // 10 days old at TODAY
  const UNPARSEABLE_DATE_HTML = '<p class="note">Last updated whenever</p>';

  const tokenSurface = { paramName: 'token', matchFor: (v) => (p) => symbolMatchesToken(p.symbol, v) };

  function ctaHtml(href) {
    return '<div class="hero"><a class="tp-cta" href="' + href + '">See live pools →</a></div>\n' +
      '    <a class="tp-cta" href="/plan.html?waitlist=1&amp;src=seo_token">Join the waitlist →</a>';
  }
  const OK_HREF = 'https://www.defi.garden/?token=USDC&minTvl=' + MIN_POOL_TVL;

  const classifyCases = [
    {
      name: '1. healthy page (well-formed, correct floor, own param, live pools)',
      expectedClass: 'ok',
      page: { html: ctaHtml(OK_HREF) + FRESH_DATE_HTML, file: '/tokens/usdc.html', surface: tokenSurface },
      pools: [{ symbol: 'USDC', tvlUsd: MIN_POOL_TVL * 2 }]
    },
    {
      name: '2. missing minTvl param entirely → FAIL(contract)',
      expectedClass: 'contract',
      page: { html: ctaHtml('https://www.defi.garden/?token=USDC') + FRESH_DATE_HTML, file: '/tokens/usdc.html', surface: tokenSurface },
      pools: [{ symbol: 'USDC', tvlUsd: MIN_POOL_TVL * 2 }]
    },
    {
      name: '3. wrong floor (app default instead of the generator floor) → FAIL(contract)',
      expectedClass: 'contract',
      page: {
        html: ctaHtml('https://www.defi.garden/?token=USDC&minTvl=50000000') + FRESH_DATE_HTML,
        file: '/tokens/usdc.html', surface: tokenSurface
      },
      pools: [{ symbol: 'USDC', tvlUsd: MIN_POOL_TVL * 2 }]
    },
    {
      name: '4. foreign param value (page is usdc.html, CTA points at DAI) → FAIL(contract)',
      expectedClass: 'contract',
      page: {
        html: ctaHtml('https://www.defi.garden/?token=DAI&minTvl=' + MIN_POOL_TVL) + FRESH_DATE_HTML,
        file: '/tokens/usdc.html', surface: tokenSurface
      },
      pools: [{ symbol: 'DAI', tvlUsd: MIN_POOL_TVL * 2 }]
    },
    {
      name: '5. malformed href (not a valid URL) → FAIL(contract)',
      expectedClass: 'contract',
      page: { html: ctaHtml('not-a-url?token=USDC&minTvl=' + MIN_POOL_TVL) + FRESH_DATE_HTML, file: '/tokens/usdc.html', surface: tokenSurface },
      pools: [{ symbol: 'USDC', tvlUsd: MIN_POOL_TVL * 2 }]
    },
    {
      name: '6. dead CTA + stale generation date (> 2 days old) → FAIL(stale)',
      expectedClass: 'stale',
      page: { html: ctaHtml(OK_HREF) + STALE_DATE_HTML, file: '/tokens/usdc.html', surface: tokenSurface },
      pools: [{ symbol: 'USDC', tvlUsd: MIN_POOL_TVL - 1000 }] // dead: below floor
    },
    {
      name: '6b. dead CTA + unparseable generation date → FAIL(stale) (conservative default)',
      expectedClass: 'stale',
      page: { html: ctaHtml(OK_HREF) + UNPARSEABLE_DATE_HTML, file: '/tokens/usdc.html', surface: tokenSurface },
      pools: [{ symbol: 'USDC', tvlUsd: MIN_POOL_TVL - 1000 }]
    },
    {
      name: '7/8. dead CTA + fresh generation date → drift (budget decides pass/fail, see verdictFor cases below)',
      expectedClass: 'drift',
      page: { html: ctaHtml(OK_HREF) + FRESH_DATE_HTML, file: '/tokens/usdc.html', surface: tokenSurface },
      pools: [{ symbol: 'USDC', tvlUsd: MIN_POOL_TVL - 500 }] // dead, but close — oscillation, not decay
    }
  ];

  const results = [];
  for (const c of classifyCases) {
    const got = classifyPage({ html: c.page.html, file: c.page.file, surface: c.page.surface, pools: c.pools, today: TODAY });
    results.push({ name: c.name, ok: got.class === c.expectedClass, expected: c.expectedClass, got: got.class, detail: got.detail });
  }

  // verdictFor cases: the drift-budget crossing itself. Reuses case 7/8's
  // classifyPage output (already proven above to be 'drift') to build
  // realistic counts, without needing hundreds of synthetic pages.
  const underBudget = verdictFor({ contractCount: 0, staleCount: 0, driftCount: 1, scannedWithCta: 1000 }); // 0.1% < 1.0%
  results.push({ name: '7. dead+fresh, drift under budget (1/1000=0.1%) → overall PASS with a drift report', ok: underBudget.ok === true, expected: 'ok:true', got: 'ok:' + underBudget.ok });

  const overBudget = verdictFor({ contractCount: 0, staleCount: 0, driftCount: 5, scannedWithCta: 100 }); // 5% > 1.0%
  results.push({ name: '8. dead+fresh, drift over budget (5/100=5%) → overall FAIL(drift)', ok: overBudget.ok === false, expected: 'ok:false', got: 'ok:' + overBudget.ok });

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error('✗ SELF-CHECK FAILURE (item 181\'s non-vacuity guard) — aborting BEFORE any network call:');
    failed.forEach((f) => console.error('    ✗ ' + f.name + ' — expected ' + f.expected + ', got ' + f.got +
      (f.detail ? ' — ' + JSON.stringify(f.detail) : '')));
    process.exitCode = 2; // operator-error convention (run-tests.js)
    process.exit(2);
  }
  console.log('  self-checks: ' + results.length + '/' + results.length + ' passed (8 spec cases, incl. 6 FAIL + 2 PASS) — item 181\n');
}

async function main() {
  runSelfChecks(); // item 181: BEFORE any network call, every invocation

  const pools = await loadPools();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); // date-only, UTC

  const surfaces = [
    { dir: path.join(__dirname, 'tokens'), kind: 'token', paramName: 'token', matchFor: (v) => (p) => symbolMatchesToken(p.symbol, v) },
    { dir: path.join(__dirname, 'chains'), kind: 'chain', paramName: 'chain', matchFor: (v) => (p) => chainMatchesParam(p.chain, v) }
  ];

  let totalPages = 0;
  let skippedNoCta = 0;
  const contractFailures = [];
  const staleFailures = [];
  const driftEntries = [];

  for (const surface of surfaces) {
    if (!fs.existsSync(surface.dir)) continue;
    const files = listPages(surface.dir);
    for (const file of files) {
      totalPages++;
      const html = fs.readFileSync(file, 'utf8');
      const result = classifyPage({ html, file, surface, pools, today });
      const relFile = path.relative(__dirname, file);

      if (result.class === 'skip') { skippedNoCta++; continue; } // T4: hub pages with no app-bound CTA — not this surface's concern
      if (result.class === 'contract') { contractFailures.push({ file: relFile, ...result.detail }); continue; }
      if (result.class === 'stale') { staleFailures.push({ file: relFile, ...result.detail }); continue; }
      if (result.class === 'drift') { driftEntries.push({ file: relFile, ...result.detail }); continue; }
      // 'ok' — nothing to record.
    }
  }

  const scannedWithCta = totalPages - skippedNoCta;
  const missingMinTvlCount = contractFailures.filter((f) => f.appEffectiveMinTvl !== undefined).length;
  const zeroAtAppDefaultToday = contractFailures.filter((f) => f.appLiveCount === 0).length;

  console.log('  scanned ' + totalPages + ' pages (' + skippedNoCta + ' skipped — no app-bound primary CTA found)');
  console.log('  pages missing minTvl=' + MIN_POOL_TVL + ' on the primary CTA: ' + missingMinTvlCount + ' (contract)');
  if (missingMinTvlCount > 0) {
    console.log('    of those, pages whose CTA resolves to 0 live pools at the APP\'S ACTUAL default floor today ($' +
      APP_DEFAULT_MIN_TVL.toLocaleString('en-US') + '): ' + zeroAtAppDefaultToday + ' (specs/173.md measured 1,749)');
  }
  console.log('  contract failures (repo-caused — malformed/missing CTA, wrong floor, or foreign param): ' + contractFailures.length + ' / ' + scannedWithCta);
  console.log('  stale failures (dead CTA + generation date > ' + STALE_AFTER_DAYS + ' days old, or unparseable): ' + staleFailures.length + ' / ' + scannedWithCta);

  const verdict = verdictFor({
    contractCount: contractFailures.length,
    staleCount: staleFailures.length,
    driftCount: driftEntries.length,
    scannedWithCta
  });
  console.log('  drift (dead CTA, fresh page, bounded — not a defect by itself): ' + driftEntries.length + ' / ' + scannedWithCta +
    ' — budget ' + (DRIFT_BUDGET_FRACTION * 100).toFixed(1) + '% = ' +
    verdict.allowance.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' pages allowed');

  if (driftEntries.length > 0) {
    console.log('\n  Drift detail (best live pool TVL, ignoring the floor, and signed distance from MIN_POOL_TVL=' + formatUsdRaw(MIN_POOL_TVL) + '):');
    driftEntries.forEach((d) => console.log('    ~ ' + d.file + ' — best live pool ' + formatUsdRaw(d.bestTvl) +
      ' (' + formatSignedPct(d.distancePct) + ' vs floor) — dated ' + d.dateStr));
  }

  if (contractFailures.length > 0) {
    console.log('\n  First 15 contract failures (dead CTAs — repo-caused):');
    contractFailures.slice(0, 15).forEach((d) => console.log('    ✗ ' + d.file + ' — ' + d.reason + (d.href ? ' — ' + d.href : '')));
  }
  if (staleFailures.length > 0) {
    console.log('\n  First 15 stale failures (dead CTAs — regen did not refresh):');
    staleFailures.slice(0, 15).forEach((d) => console.log('    ✗ ' + d.file + ' — ' + d.reason + (d.href ? ' — ' + d.href : '')));
  }

  if (!verdict.ok) {
    console.error('\n✗ FAIL: ' + verdict.reasons.join('; '));
    process.exitCode = 1;
    return;
  }

  console.log('\n✓ PASS: contract=0, stale=0, drift=' + driftEntries.length + '/' + scannedWithCta +
    ' (within budget ' + verdict.allowance.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ') — ' + scannedWithCta + ' pages checked (' +
    totalPages + ' scanned, ' + skippedNoCta + ' skipped)');
}

// item 184: guarded so `require('./test_seo_cta_targets.js')` (audit-app.js's
// level-2 ?pool= liveness signal, and its own test) can pull in this file's
// constants/classifier without triggering a live scan as a side effect of
// require(). `node test_seo_cta_targets.js` (require.main === module) is
// completely unchanged — same self-checks, same scan, same exit codes.
if (require.main === module) {
  main().catch((e) => {
    console.error('✗ ERROR: ' + e.message);
    process.exitCode = 1;
  });
}

// item 184: exported so audit-app.js's level-2 ?pool= liveness signal can
// reuse 181's constant + classifier verbatim (174's one-constant rule) —
// never re-typed. Nothing else in this file changes for item 184.
module.exports = { DRIFT_BUDGET_FRACTION, STALE_AFTER_DAYS, parseLastUpdatedDate, verdictFor, loadPools };
