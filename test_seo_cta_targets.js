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
   fetch is available, this test FAILS LOUDLY — it never passes vacuously. */
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
function symbolMatchesToken(poolSymbol, token) {
  if (!poolSymbol || !token) return false;
  return String(poolSymbol).toUpperCase().includes(String(token).toUpperCase());
}

// Mirrors app.js's chain-mode match exactly (regular chain branch, app.js:1872):
// exact, case-sensitive pool.chain equality.
function chainMatchesParam(poolChain, chainParam) {
  return poolChain === chainParam;
}

// Mirrors app.js:801's DEFAULT_MIN_TVL exactly — used ONLY to model what the
// app resolves an ABSENT ?minTvl= param to (app.js:927), so the pre-fix
// diagnostic below can report the same "0 live pools at the app's actual
// default floor" figure the heartbeat measured (specs/173.md). This is a
// read-only modeling constant for reporting, never re-typed into either
// generator file (the 159 rule only binds generate-token-pages.js /
// generate-chain-pages.js, not this test's evaluation logic).
const APP_DEFAULT_MIN_TVL = 10000000;

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

function listPages(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.html') && f !== 'index.html')
    .map((f) => path.join(dir, f));
}

async function main() {
  const pools = await loadPools();

  const surfaces = [
    { dir: path.join(__dirname, 'tokens'), kind: 'token', paramName: 'token', matchFor: (v) => (p) => symbolMatchesToken(p.symbol, v) },
    { dir: path.join(__dirname, 'chains'), kind: 'chain', paramName: 'chain', matchFor: (v) => (p) => chainMatchesParam(p.chain, v) }
  ];

  let totalPages = 0;
  let skippedNoCta = 0;
  let missingMinTvl = 0;
  let zeroAtAppDefaultToday = 0; // diagnostic only — comparable to specs/173.md's "1,749"
  let deadCtas = [];
  const sampled = []; // {file, param, value, minTvl, liveCount}

  for (const surface of surfaces) {
    if (!fs.existsSync(surface.dir)) continue;
    const files = listPages(surface.dir);
    for (const file of files) {
      totalPages++;
      const html = fs.readFileSync(file, 'utf8');
      const href = extractPrimaryCtaHref(html);
      if (!href) { skippedNoCta++; continue; } // no app-bound primary CTA (e.g. an A–Z hub page) — not this surface's concern

      let url;
      try { url = new URL(href); } catch (e) { throw new Error(file + ': primary CTA href is not a valid URL: ' + href); }
      const paramValue = url.searchParams.get(surface.paramName);
      if (!paramValue) throw new Error(file + ': primary CTA href is missing its own ?' + surface.paramName + '= param: ' + href);

      const minTvlParam = url.searchParams.get('minTvl');
      if (minTvlParam !== String(MIN_POOL_TVL)) {
        missingMinTvl++;
        // Diagnostic only (not part of the pass/fail signal below): what the
        // app actually resolves this exact CTA href to TODAY, live — i.e. the
        // heartbeat's own "0 of 2200" measurement, reproduced here so the
        // red-transcript numbers are directly comparable to specs/173.md.
        const appEffectiveMinTvl = minTvlParam !== null ? parseInt(minTvlParam, 10) : APP_DEFAULT_MIN_TVL;
        const appLiveCount = countQualifying(pools, appEffectiveMinTvl, surface.matchFor(paramValue));
        if (appLiveCount === 0) zeroAtAppDefaultToday++;
        deadCtas.push({
          file: path.relative(__dirname, file), href,
          reason: 'minTvl=' + minTvlParam + ' (expected ' + MIN_POOL_TVL + '); app resolves this link to minTvl=' +
            appEffectiveMinTvl + ' today, returning ' + appLiveCount + ' live pool(s)'
        });
        continue;
      }

      const effectiveMinTvl = parseInt(minTvlParam, 10);
      const count = countQualifying(pools, effectiveMinTvl, surface.matchFor(paramValue));
      if (count < 1) {
        deadCtas.push({ file: path.relative(__dirname, file), href, reason: 'live pool count = 0 at minTvl=' + effectiveMinTvl });
      }
      sampled.push({ file: path.relative(__dirname, file), param: surface.paramName, value: paramValue, minTvl: effectiveMinTvl, liveCount: count });
    }
  }

  console.log('  scanned ' + totalPages + ' pages (' + skippedNoCta + ' skipped — no app-bound primary CTA found)');
  console.log('  pages missing minTvl=' + MIN_POOL_TVL + ' on the primary CTA: ' + missingMinTvl);
  if (missingMinTvl > 0) {
    console.log('    of those, pages whose CTA resolves to 0 live pools at the APP\'S ACTUAL default floor today ($' +
      APP_DEFAULT_MIN_TVL.toLocaleString('en-US') + '): ' + zeroAtAppDefaultToday + ' (specs/173.md measured 1,749)');
  }
  console.log('  dead CTAs (0 live pools OR missing minTvl): ' + deadCtas.length + ' / ' + (totalPages - skippedNoCta));

  if (deadCtas.length > 0) {
    console.log('\n  First 15 dead CTAs:');
    deadCtas.slice(0, 15).forEach((d) => console.log('    ✗ ' + d.file + ' — ' + d.reason + ' — ' + d.href));
    console.error('\n✗ FAIL: ' + deadCtas.length + ' of ' + (totalPages - skippedNoCta) + ' pages have a dead primary CTA');
    process.exitCode = 1;
    return;
  }

  console.log('\n✓ PASS: 0 dead CTAs out of ' + (totalPages - skippedNoCta) + ' pages checked (' + totalPages + ' scanned, ' + skippedNoCta + ' skipped)');
}

main().catch((e) => {
  console.error('✗ ERROR: ' + e.message);
  process.exitCode = 1;
});
