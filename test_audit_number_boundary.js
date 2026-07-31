/* Tests for backlog 193: the rendered number-sanity scanner (scanNumbers()'s
   `numRe`, audit-app.js:~2630) was matching digit runs embedded inside
   alphanumeric tokens — e.g. the tail of the Solana wrapped-SOL mint
   `So11111111111111111111111111111111111111112`, which PoolDetail.js:1611-1656
   renders RAW as an "Underlying Assets" chip whenever the token does not look
   like a truncatable EVM address (`0x` prefix, length >= 40). The fix adds a
   zero-width lookbehind `(?<![A-Za-z0-9])` to `numRe` — spec 157 already
   shipped the same predicate (a capturing `(^|[^A-Za-z0-9])` alternation) on
   the sibling static-prescan constant `ABSURD_MAGNITUDE_TEXT`; see the
   in-file comment at the `numRe` site for why the *form* differs here.

   Criteria 1-5 (spec 193) are plain, instant, no browser:
     1. base58 Solana mint text → scanNumbers returns [].
     2. all-digit EVM address body (preceded by 'x') → scanNumbers returns [].
     3. genuine absurd magnitudes at a real word boundary still fire.
     4. no collateral regression: $1.5B still clean, $0.1 still flags (126 bug).
     5. non-vacuity guard: assert the shipped numRe source actually carries
        the lookbehind, so a silent revert makes this file go red on its own
        (this project's OWN red-against-main check happens outside this file,
        by literally reverting numRe — see 193-notes.md).

   Criteria 6-7 are rendered acceptance: 2 real Chromium renders via
   runAudit(), fixture-routed exactly like test_audit_app.js — temp mutated
   snapshots, `only: ['pool-detail']`, a temp `outPath` so
   product-loop-kit/signals/audit-findings.json is never touched, and a pool
   id DERIVED from data/pools-snapshot.json at test time (the snapshot churns
   daily; never hardcode a pool id).

   Run: node test_audit_number_boundary.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runAudit, scanNumbers } = require('./audit-app.js');

const ROOT = __dirname;
const SNAPSHOT = path.join(ROOT, 'data', 'pools-snapshot.json');
// Same 122-bug-class magnitude test_audit_app.js uses (positive sign, since
// PoolDetail.js:1210/1236 gate the Base/Reward APY cards on
// `pool.apyBase > 0 && pool.apyReward > 0` — a negative value never renders).
const ABSURD_MAGNITUDE = 900719925474097.9;
// The 192 false positive, verbatim: wrapped-SOL's mint address.
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-numbdry-${tag}-${process.pid}.json`); }

// Mirrors PoolDetail.js:1612's exact gate for "renders raw (not truncated)".
function isRawRenderedToken(t) {
  return typeof t === 'string' && !(t.startsWith('0x') && t.length >= 40);
}

async function main() {
  // ---- Criterion 1 ----
  await test('scanNumbers: base58 Solana mint (192 false positive) → empty array', () => {
    const hits = scanNumbers(`Underlying Assets ${WSOL_MINT}`);
    assert(Array.isArray(hits) && hits.length === 0, 'expected [], got: ' + JSON.stringify(hits));
  });

  // ---- Criterion 2 ----
  await test('scanNumbers: all-digit EVM address body (preceded by "x") → empty array', () => {
    const hits = scanNumbers('0x1234567890123456789012345678901234567890');
    assert(Array.isArray(hits) && hits.length === 0, 'expected [], got: ' + JSON.stringify(hits));
  });

  // ---- Criterion 3 ----
  await test('scanNumbers: genuine absurd magnitude at a real word boundary still fires ($ prefix)', () => {
    const hits = scanNumbers('Total Value Locked $900719925474097.9');
    assert(hits.length > 0, 'expected a non-empty array, got []');
    assert(hits.some((h) => /900719925474097\.9|9\.01e\+14/.test(h)), 'no hit quoted the magnitude: ' + JSON.stringify(hits));
  });
  await test('scanNumbers: genuine absurd magnitude at a real word boundary still fires (bare digit run)', () => {
    const hits = scanNumbers(`TVL ${WSOL_MINT.slice(2)}`); // the same 43-digit run, but at a real space boundary
    assert(hits.length > 0, 'expected a non-empty array, got []');
    assert(hits.some((h) => h.includes(WSOL_MINT.slice(2))), 'no hit quoted the digit run: ' + JSON.stringify(hits));
  });

  // ---- Criterion 4 ----
  await test('scanNumbers: no collateral regression — $1.5B (K/M/B/T suffix) yields no finding', () => {
    const hits = scanNumbers('Deposits worth $1.5B across pools');
    assert(hits.length === 0, 'expected [], got: ' + JSON.stringify(hits));
  });
  await test('scanNumbers: no collateral regression — $0.1 (126 bug) still yields "money not en-US 2dp"', () => {
    const hits = scanNumbers('Fee: $0.1 per tx');
    assert(hits.some((h) => h.includes('money not en-US 2dp')), 'expected the 126 finding, got: ' + JSON.stringify(hits));
  });

  // ---- Criterion 5: non-vacuity guard on the shipped source ----
  await test('non-vacuity: shipped numRe source carries the (?<![A-Za-z0-9]) lookbehind', () => {
    const src = fs.readFileSync(path.join(ROOT, 'audit-app.js'), 'utf8');
    // Robust to whitespace/reflow around it, brittle to an actual revert:
    // require the lookbehind literal directly adjacent to `numRe =`.
    const m = src.match(/const numRe\s*=\s*\/([^\n]*)\/g;/);
    assert(m, 'could not locate "const numRe = /.../g;" in audit-app.js at all');
    assert(m[1].includes('(?<![A-Za-z0-9])'), 'numRe source lacks the (?<![A-Za-z0-9]) lookbehind: ' + m[1]);
  });

  // ---- Derive a target pool for criteria 6-7 ----
  // Prefer a REAL pool from the committed snapshot whose underlyingTokens
  // contain a raw-rendered token that trips the PRE-FIX pattern (a digit run
  // >= ABSURD_MAGNITUDE=1e11 embedded in an alphanumeric token, immediately
  // preceded by a letter/digit). Never hardcode a pool id — the snapshot
  // churns daily — so this is computed here, at test time.
  const PRE_FIX_ABSURD_MAGNITUDE = 1e11;
  function tripsPreFixPattern(token) {
    // The pre-fix numRe, reproduced faithfully (no boundary assertion) —
    // used ONLY to find a real-world trigger case, never to assert anything.
    const re = /(-?)\$?(\d[\d,]*(?:\.\d+)?)\s*([KMBTkmbt])?/g;
    let n;
    while ((n = re.exec(token)) !== null) {
      if (n[3]) continue;
      const raw = n[2].replace(/,/g, '');
      if (!raw || raw === '.') continue;
      const val = Number((n[1] || '') + raw);
      if (Number.isFinite(val) && Math.abs(val) >= PRE_FIX_ABSURD_MAGNITUDE) return true;
    }
    return false;
  }

  const realSnap = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  let targetPoolId = null;
  let mutatedForCase6 = null; // set only if we had to inject a fixture pool

  for (const p of realSnap.pools) {
    if (!Array.isArray(p.underlyingTokens)) continue;
    if (p.underlyingTokens.some((t) => isRawRenderedToken(t) && tripsPreFixPattern(t))) {
      targetPoolId = p.pool;
      break;
    }
  }

  let snapshotPathForRender = SNAPSHOT;
  if (!targetPoolId) {
    // None found in today's snapshot (measured population as of spec 193 was
    // 28/741; if it ever drops to 0, build a temp mutated snapshot injecting
    // the exact 192 mint into the first pool's underlyingTokens).
    const mutSnap = JSON.parse(JSON.stringify(realSnap));
    const p = mutSnap.pools[0];
    p.underlyingTokens = Array.isArray(p.underlyingTokens) ? p.underlyingTokens.slice() : [];
    p.underlyingTokens.push(WSOL_MINT);
    targetPoolId = p.pool;
    mutatedForCase6 = path.join(os.tmpdir(), `audit-mutated-snapshot-numbdry-case6-${process.pid}.json`);
    fs.writeFileSync(mutatedForCase6, JSON.stringify(mutSnap));
    snapshotPathForRender = mutatedForCase6;
  }

  const outPaths = { case6: tmpOut('case6'), case7: tmpOut('case7') };
  let mutatedForCase7 = null;

  try {
    // ---- Criterion 6 ----
    await test('rendered: pool-detail with a raw base58 mint in underlyingTokens → ZERO number-sanity findings', async () => {
      const result = await runAudit({
        port: 8824, snapshotPath: snapshotPathForRender, outPath: outPaths.case6,
        only: ['pool-detail'], poolIds: targetPoolId
      });
      const hits = result.findings.filter((f) => f.surface === 'pool-detail' && f.check === 'number-sanity');
      assert(hits.length === 0, `expected ZERO number-sanity findings for pool-detail on ${targetPoolId}; got: ` + JSON.stringify(hits));
    });

    // ---- Criterion 7: positive control on the SAME pool ----
    await test('rendered: positive control — same pool, injected 900T Base APY → P0 number-sanity finding', async () => {
      const snap = JSON.parse(fs.readFileSync(snapshotPathForRender, 'utf8'));
      const target = snap.pools.find((p) => p.pool === targetPoolId);
      assert(target, `target pool ${targetPoolId} vanished from its own snapshot copy`);
      // PoolDetail.js:1210/1236 gate the Base/Reward APY cards on
      // `pool.apyBase > 0 && pool.apyReward > 0` (test_audit_app.js's proven
      // recipe); apyMean30d is excluded per backlog 144's mean30dSane gate
      // (PoolDetail.js:161-164/1290), which suppresses that card entirely.
      target.apyBase = ABSURD_MAGNITUDE;
      target.apyReward = 1;

      mutatedForCase7 = path.join(os.tmpdir(), `audit-mutated-snapshot-numbdry-case7-${process.pid}.json`);
      fs.writeFileSync(mutatedForCase7, JSON.stringify(snap));

      const result = await runAudit({
        port: 8825, snapshotPath: mutatedForCase7, outPath: outPaths.case7,
        only: ['pool-detail'], poolIds: targetPoolId
      });
      const poolDetailHits = result.findings.filter((f) =>
        f.surface === 'pool-detail' && f.check === 'number-sanity' && f.severity === 'P0');
      assert(poolDetailHits.length > 0, 'expected a P0 number-sanity finding for pool-detail; got: ' + JSON.stringify(result.findings));
      const hit = poolDetailHits.find((f) => /9\.01e\+14|900,719,925,474,097/.test(f.detail));
      assert(hit, 'no P0 number-sanity finding referenced the injected magnitude; got: ' + JSON.stringify(poolDetailHits));
    });
  } finally {
    for (const p of Object.values(outPaths)) { try { fs.unlinkSync(p); } catch (e) {} }
    if (mutatedForCase6) { try { fs.unlinkSync(mutatedForCase6); } catch (e) {} }
    if (mutatedForCase7) { try { fs.unlinkSync(mutatedForCase7); } catch (e) {} }
  }

  console.log(`\ntest_audit_number_boundary.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
