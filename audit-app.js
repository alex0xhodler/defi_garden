/* audit-app.js — read-only Playwright product-audit scanner (backlog 142).

   Mechanizes playbooks/product-audit.md checks 1–7: drives the real rendered
   surfaces (grid, pool-detail = north star, dead-pool empty state, static SEO
   page) against the committed data/pools-snapshot.json and emits a findings
   JSON. It NEVER edits a product file — it only READS the rendered product.

   Reference implementation for every fixture mechanic (local server, vendored
   unpkg React/ReactDOM/Babel, icons.llamao.fi abort, snapshot routing, the
   IGNORABLE allowlist, poll-before-assert, 360px viewport, chromium executable
   path) is test_northstar_cta_fires.js — this mirrors it, does not reinvent it.

   Fixture traps respected (playbook, learned 2026-07-25):
     #1 Snapshot staleness — route /data/pools-snapshot-meta.json with a FRESH
        generatedAt so the committed snapshot renders via the snapshot-first
        path (app.js tryLoadSnapshot) instead of falling through to a live
        "0 results" that would fabricate a dead-end finding. The snapshot BODY
        is served unmodified (real data) so findings are about real data.
     #2 Async reads — poll up to ~10s before claiming an element/empty-state/CTA
        "didn't render" (babel compile + data fetch land seconds after load).
     #3 Money regex — flag $0.1-style 1-decimal money ONLY when NOT followed by
        a [KMBT] suffix ($11.2K / $273.3M are legal house style).

   Env overrides (for the acceptance test's positive control):
     AUDIT_SNAPSHOT_PATH  — snapshot body served on the snapshot + live routes
                            (default 'data/pools-snapshot.json').
     AUDIT_PORT           — server port (default 8821).

   Run: node audit-app.js   → writes product-loop-kit/signals/audit-findings.json,
        prints findings JSON + covered surfaces, exits non-zero on any P0/P1. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };
// Same allowlist as test_northstar_cta_fires.js — sandbox-blocked externals and
// their knock-on "Failed to load resource" noise are expected, not findings.
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|fonts\.|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// North-star pool-detail surface (lido stETH). Verified present in the snapshot
// at runtime (like the reference test); a real id from the snapshot is picked
// if it is ever absent.
const PREFERRED_POOL_ID = '747c1d2a-c668-4682-b9f9-296708a3dd90';
const DEAD_POOL_ID = 'nonexistent-bogus-id-000';
const DEFAULT_OUT = path.join(ROOT, 'product-loop-kit', 'signals', 'audit-findings.json');

// Astronomical-magnitude floor. The largest legitimate raw figure in the data
// is an individual pool TVL (~1.7e10) and it is always rendered ABBREVIATED
// ($17.3B) — never as a raw >1e11 token — so this only ever fires on the
// −900,719,925,474,097.9 (122) bug class, never on real data.
const ABSURD_MAGNITUDE = 1e11;

const NM = path.join(ROOT, 'node_modules');
const UNPKG_VENDOR = {
  'https://unpkg.com/react@18/umd/react.production.min.js': path.join(NM, 'react/umd/react.production.min.js'),
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(NM, 'react-dom/umd/react-dom.production.min.js'),
  'https://unpkg.com/@babel/standalone/babel.min.js': path.join(NM, '@babel/standalone/babel.min.js')
};

// ---------------------------------------------------------------------------
// Static server: serve repo files, `/` → home.html (house pattern).
// ---------------------------------------------------------------------------
function startServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'home.html' : urlPath);
      // Never escape the repo root.
      if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Number-sanity scanning (check 1) — runs on rendered innerText, in Node.
// ---------------------------------------------------------------------------
function scanNumbers(text) {
  const hits = [];

  // NaN / Infinity — unambiguous broken numbers.
  const nanMatch = text.match(/-?\bInfinity\b|\bNaN\b/);
  if (nanMatch) hits.push(`broken numeric token "${nanMatch[0]}" in rendered text`);
  // undefined/null only when stamped onto a number/currency context (avoids
  // flagging any incidental prose use of the words).
  const nullMatch = text.match(/(?:\$\s*|)(?:undefined|null)\s*(?:%|TVL|APY|\bin\b)|[$]\s*(?:undefined|null)/i);
  if (nullMatch) hits.push(`undefined/null in a numeric/currency slot: "${nullMatch[0].trim()}"`);

  // Money format (trap #3): $<int>.<frac><suffix?>. Legal when a [KMBT] suffix
  // follows (abbreviated TVL) OR the fractional part has >=2 digits (en-US 2dp).
  // The 126 bug is $0.1 — exactly one decimal, no suffix.
  const moneyRe = /\$(\d[\d,]*)\.(\d+)([KMBTkmbt])?/g;
  let m;
  while ((m = moneyRe.exec(text)) !== null) {
    const suffix = m[3];
    const fracLen = m[2].length;
    if (!suffix && fracLen === 1) {
      hits.push(`money not en-US 2dp: "${m[0]}" (1 decimal, no K/M/B/T suffix)`);
    }
  }

  // Absurd magnitude (trap-safe): a raw number (optionally $-prefixed) with no
  // K/M/B/T suffix whose |value| >= ABSURD_MAGNITUDE. Suffix-abbreviated figures
  // are skipped (legal house style).
  const numRe = /(-?)\$?(\d[\d,]*(?:\.\d+)?)\s*([KMBTkmbt])?/g;
  let n;
  while ((n = numRe.exec(text)) !== null) {
    if (n[3]) continue; // K/M/B/T abbreviated → legitimate
    const raw = n[2].replace(/,/g, '');
    if (!raw || raw === '.') continue;
    const val = Number((n[1] || '') + raw);
    if (Number.isFinite(val) && Math.abs(val) >= ABSURD_MAGNITUDE) {
      hits.push(`astronomical value "${n[0].trim()}" (|value| = ${Math.abs(val).toExponential(2)})`);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Poll helpers (trap #2).
// ---------------------------------------------------------------------------
async function pollFor(page, fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let v;
    try { v = await fn(); } catch (e) { v = null; }
    if (v || Date.now() > deadline) return v;
    await page.waitForTimeout(120);
  }
}

async function waitForSelector(page, selector, timeoutMs) {
  return pollFor(page, async () => (await page.locator(selector).count()) > 0, timeoutMs);
}

// ---------------------------------------------------------------------------
// Per-page route setup (mirrors the reference test).
// ---------------------------------------------------------------------------
async function setupRoutes(page, { snapshotBody, freshMeta, liveBody, forceLive, liveDelayMs }) {
  for (const [url, lp] of Object.entries(UNPKG_VENDOR)) {
    await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
  }
  await page.route('https://icons.llamao.fi/**', (r) => r.abort());

  // Snapshot-first path (trap #1): fresh meta → committed snapshot renders
  // verbatim. In forceLive mode (loading-flash check 3) the meta 404s so
  // tryLoadSnapshot bails and app.js takes loadLive.
  await page.route('**/data/pools-snapshot-meta.json', (r) => {
    if (forceLive) return r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: freshMeta });
  });
  // Snapshot body is always served real (also read by app.js's kpis-merge).
  await page.route('**/data/pools-snapshot.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: snapshotBody }));

  // Live endpoint — ?pool= deep links ALWAYS go live (app.js:1141), so this
  // serves the same real snapshot data in the live shape {status,data:[…]}.
  await page.route('https://yields.llama.fi/pools', async (r) => {
    if (liveDelayMs) await new Promise((res) => setTimeout(res, liveDelayMs));
    return r.fulfill({ status: 200, contentType: 'application/json', body: liveBody });
  });
}

function makeErrorSink(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORABLE.test(msg.location()?.url || '') && !IGNORABLE.test(msg.text()))
      errors.push('console.error: ' + msg.text());
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Surface drivers — each returns findings[] for that surface.
// ---------------------------------------------------------------------------
function finding(surface, viewport, check, severity, detail) {
  return { surface, viewport, check, severity, detail };
}

async function auditText(page, s, findings) {
  const text = await page.evaluate(() => document.body.innerText || '');
  for (const detail of scanNumbers(text)) {
    findings.push(finding(s.name, s.vpLabel, 'number-sanity', 'P0', detail));
  }
  return text;
}

async function main(browser, baseUrl, s, ctx) {
  const page = await browser.newPage({ viewport: { width: s.width, height: 900 } });
  const errors = makeErrorSink(page);
  const findings = [];
  s.vpLabel = s.dark ? `${s.width}px/dark` : s.ko ? `${s.width}px/ko` : `${s.width}px`;

  if (s.dark) await page.addInitScript(() => { try { localStorage.setItem('theme', 'dark'); } catch (e) {} });

  try {
    await setupRoutes(page, { ...ctx, forceLive: s.forceLive, liveDelayMs: s.liveDelayMs });
    const url = baseUrl + s.url;

    if (s.kind === 'loading') {
      // Check 3 — loading flash. During the forced live delay, the resolved
      // "no results" empty state (its .empty-submessage) must NOT render before
      // data arrives; only the loading variant (bare .empty-message) may show.
      await page.goto(url, { waitUntil: 'commit', timeout: 20000 });
      const flashed = await pollFor(page, async () => {
        const cards = await page.locator('.pool-card').count();
        if (cards > 0) return false; // data arrived — window over
        return (await page.locator('.empty-state .empty-submessage').count()) > 0;
      }, Math.max(0, (s.liveDelayMs || 1500) - 300));
      if (flashed) findings.push(finding(s.name, s.vpLabel, 'loading-flash', 'P1',
        'resolved "no results" empty-state (.empty-submessage) rendered before pools loaded'));
      // Let it settle so trailing errors are captured, then error check below.
      await waitForSelector(page, '.pool-card, .empty-state', 8000);
      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    // 'domcontentloaded' not 'load': sandbox-blocked fonts/analytics never let
    // the load event fire (esp. the static SEO pages) — the pollers below wait
    // on the actual rendered selectors, which is the real readiness signal.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    if (s.kind === 'static') {
      // Static SEO page: number sanity + page errors only.
      await page.waitForTimeout(400);
      await auditText(page, s, findings);
      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    if (s.kind === 'dead-pool') {
      // Check 2 (positive): a dead ?pool= id is EXPECTED to resolve to the honest
      // empty state — assert it renders, don't flag it.
      const ok = await waitForSelector(page, '.empty-state .empty-message', 10000);
      if (!ok) findings.push(finding(s.name, s.vpLabel, 'dead-pool-empty-state', 'P1',
        'dead ?pool= id did not resolve to the honest empty state within 10s'));
      await auditText(page, s, findings);
      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    if (s.kind === 'grid') {
      const ok = await waitForSelector(page, '.pool-card', 10000);
      if (!ok) {
        findings.push(finding(s.name, s.vpLabel, 'dead-end', 'P1',
          'valid grid query rendered no .pool-card within 10s'));
      }
      await auditText(page, s, findings);
      if (s.width <= 360) await checkResponsive(page, s, findings, '.pool-card');
      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }

    // kind === 'pool' — the north-star surface.
    const ok = await waitForSelector(page, '.pool-detail-view', 12000);
    if (!ok) {
      findings.push(finding(s.name, s.vpLabel, 'dead-end', 'P1', 'pool-detail did not render within 12s'));
      if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
      await page.close();
      return findings;
    }
    const text = await auditText(page, s, findings);

    // Check 6 — the two north-star CTAs render, are visible, primary resolves.
    const primary = page.locator('.cta-button-primary').first();
    if ((await primary.count()) === 0 || !(await primary.isVisible())) {
      findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1', '"Garden this pool" (.cta-button-primary) missing or not visible'));
    } else {
      const href = await primary.getAttribute('href');
      if (!href) findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1', '.cta-button-primary has no href to resolve'));
    }
    const protocol = page.locator('.cta-button-protocol').first();
    if ((await protocol.count()) === 0 || !(await protocol.isVisible())) {
      findings.push(finding(s.name, s.vpLabel, 'dead-cta', 'P1', '"Start Earning" (.cta-button-protocol) missing or not visible'));
    }

    // Check 5 — i18n.
    if (s.ko) {
      const hasHangul = /[가-힣]/.test(text);
      if (!hasHangul) findings.push(finding(s.name, s.vpLabel, 'i18n', 'P2', 'KO surface rendered no Hangul text'));
      // KO currency truth (137): a "<n>원" figure byte-identical to a "$<n>"
      // figure on the same page = raw USD relabeled Won without conversion.
      const wonPairs = [...text.matchAll(/([\d,]{2,})\s*원/g)].map((x) => x[1]);
      for (const digits of wonPairs) {
        if (text.includes('$' + digits)) {
          findings.push(finding(s.name, s.vpLabel, 'number-sanity', 'P0',
            `KO currency unit-swap: "${digits}원" equals unconverted "$${digits}"`));
        }
      }
    }
    // Leaked raw translation key (t('…') rendered literally).
    if (/\bt\(['"][a-zA-Z]/.test(text)) {
      findings.push(finding(s.name, s.vpLabel, 'i18n', 'P2', 'raw t(\'…\') translation call leaked into rendered text'));
    }

    // Check 7 — responsive / dark clip.
    if (s.width <= 360) await checkResponsive(page, s, findings, '.cta-button-primary');

    if (errors.length) findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', errors.join(' | ')));
    await page.close();
    return findings;
  } catch (err) {
    findings.push(finding(s.name, s.vpLabel, 'page-error', 'P0', 'driver threw: ' + err.message));
    try { await page.close(); } catch (e) {}
    return findings;
  }
}

async function checkResponsive(page, s, findings, ctaSelector) {
  // No horizontal body scroll at 360px.
  const scrollW = await page.evaluate(() => document.body.scrollWidth);
  if (scrollW > s.width) {
    findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2', `horizontal body scroll: scrollWidth ${scrollW} > ${s.width}`));
  }
  // Ancestor-clip check (136): the primary CTA box must be inside the viewport.
  const cta = page.locator(ctaSelector).first();
  if ((await cta.count()) > 0) {
    const box = await cta.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2', `${ctaSelector} has zero-area box at ${s.width}px (ancestor-clipped)`));
    } else if (box.x < -1 || box.x + box.width > s.width + 1) {
      findings.push(finding(s.name, s.vpLabel, 'responsive', 'P2',
        `${ctaSelector} box [${Math.round(box.x)}..${Math.round(box.x + box.width)}] exceeds ${s.width}px viewport`));
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------
async function runAudit(opts = {}) {
  const snapshotPath = path.resolve(ROOT, opts.snapshotPath || process.env.AUDIT_SNAPSHOT_PATH || 'data/pools-snapshot.json');
  const port = Number(opts.port || process.env.AUDIT_PORT || 8821);
  const outPath = opts.outPath || DEFAULT_OUT;

  const snapshotBody = fs.readFileSync(snapshotPath, 'utf8');
  const snap = JSON.parse(snapshotBody);
  const pools = Array.isArray(snap.pools) ? snap.pools : [];
  if (pools.length === 0) throw new Error(`snapshot at ${snapshotPath} has no pools`);

  // Verify the north-star pool id is present; else pick a real one.
  let poolId = PREFERRED_POOL_ID;
  if (!pools.some((p) => p && p.pool === poolId)) {
    poolId = pools[0].pool;
    console.error(`[audit] preferred pool id absent from snapshot; using ${poolId}`);
  }

  // Fresh meta (trap #1): real meta shape, generatedAt = now.
  let metaObj = { schemaVersion: 1, count: pools.length, bytes: snapshotBody.length };
  try { metaObj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot-meta.json'), 'utf8')); } catch (e) {}
  metaObj.generatedAt = new Date().toISOString();
  const freshMeta = JSON.stringify(metaObj);

  // Live shape: real snapshot pools + a derived `apy` per pool.
  const liveBody = JSON.stringify({
    status: 'success',
    data: pools.map((p) => Object.assign({}, p, { apy: (p.apyBase || 0) + (p.apyReward || 0) }))
  });

  const staticPage = ['/tokens/usdc.html', '/chains/ethereum.html'].find((rel) => fs.existsSync(path.join(ROOT, rel)));

  // Default surface rotation.
  const poolUrl = `/home.html?pool=${encodeURIComponent(poolId)}`;
  let surfaces = [
    { name: 'grid-token', url: '/home.html?token=USDC', kind: 'grid', width: 1280 },
    { name: 'pool-detail', url: poolUrl, kind: 'pool', width: 1280 },
    { name: 'grid-chain', url: '/home.html?chain=Ethereum', kind: 'grid', width: 1280 },
    { name: 'dead-pool', url: `/home.html?pool=${encodeURIComponent(DEAD_POOL_ID)}`, kind: 'dead-pool', width: 1280 },
    { name: 'grid-loading', url: '/home.html?token=USDC', kind: 'loading', width: 1280, forceLive: true, liveDelayMs: 1600 },
    { name: 'pool-detail-360', url: poolUrl, kind: 'pool', width: 360 },
    { name: 'grid-360', url: '/home.html?token=USDC', kind: 'grid', width: 360 },
    { name: 'pool-detail-dark', url: poolUrl, kind: 'pool', width: 1280, dark: true },
    { name: 'pool-detail-ko', url: `${poolUrl}&lang=ko`, kind: 'pool', width: 1280, ko: true }
  ];
  if (staticPage) surfaces.push({ name: 'static-page', url: staticPage, kind: 'static', width: 1280 });
  else console.error('[audit] no static SEO page found — skipping static surface');

  if (Array.isArray(opts.only)) surfaces = surfaces.filter((s) => opts.only.includes(s.name));

  const server = await startServer(port);
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  const baseUrl = `http://localhost:${port}`;
  const ctx = { snapshotBody, freshMeta, liveBody };
  const findings = [];
  const surfacesCovered = [];
  try {
    for (const s of surfaces) {
      const f = await main(browser, baseUrl, s, ctx);
      surfacesCovered.push(s.name);
      findings.push(...f);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const result = { generatedAt: new Date().toISOString(), surfacesCovered, findings };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  return result;
}

module.exports = { runAudit, scanNumbers };

if (require.main === module) {
  runAudit()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      console.log('\n[audit] surfaces covered: ' + result.surfacesCovered.join(', '));
      const blocking = result.findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
      console.log(`[audit] findings: ${result.findings.length} total, ${blocking.length} blocking (P0/P1)`);
      process.exit(blocking.length > 0 ? 1 : 0);
    })
    .catch((err) => { console.error(err); process.exit(2); });
}
