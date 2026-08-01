/* Acceptance tests for the static-page rotation memory (backlog 196).

   183 leg (b) gave pool-detail coverage a persisted never-audited-first
   rotation (`computeRotation()` + `product-loop-kit/signals/audit-rotation.json`).
   This item gives the OLDER, LARGER static-SEO leg (tokens/*.html,
   chains/*.html — 2,197 leaves combined vs ~737 pools) the exact same
   machinery: `computeRotation()` is called TWICE inside `buildStaticSurfaces()`
   (once per leg, preserving the pre-existing 2:1 token:chain budget split),
   backed by a new committed state file,
   `product-loop-kit/signals/audit-static-rotation.json`, shape
   `{ schemaVersion, tokens: {cycle, seen}, chains: {cycle, seen} }`.

   Every test below drives `buildStaticSurfaces()` directly as a PURE function
   via `opts.staticRotationState` (in-memory injected state, mirroring
   `opts.rotationState` for the pool leg) — no fs read of, and no fs write to,
   the real committed state file, for every test EXCEPT the two `runAudit()`
   tests that specifically exist to prove the committed file is/isn't
   touched (criterion 7), which use a temp `staticRotationStatePath` (or, for
   the literal "committed file is untouched" proof, the real default path,
   read-only, exactly as every other `test_audit_*.js` file already treats it
   for the pool leg).

   Criteria 1-10 below map 1:1 onto spec 196's acceptance criteria 1-10.
   Criterion 11 (a real end-to-end `node audit-app.js` CLI run) and criterion
   13 (the git-stash non-vacuity proof) are operational steps performed once
   by the build, recorded in specs/196-notes.md, not re-run here on every
   `npm test` — criterion 12 (this file registered in package.json, the other
   audit test files staying green) is verified by running this suite
   alongside its siblings, not inside this file.

   Run: node test_audit_static_rotation.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runAudit, buildStaticSurfaces, prescanStaticPages,
  STATIC_ROTATION_SEEN_CAP
} = require('./audit-app.js');

const ROOT = __dirname;
const MAX_STATIC_SAMPLE = 12; // mirrors audit-app.js's own ceiling (backlog 154)
const SIM_DAYS = 180; // spec 196 acceptance criterion 10's simulation horizon

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-staticrotation-${tag}-${process.pid}.json`); }

// ---------------------------------------------------------------------------
// Independent re-derivation of the real leaf-page lists straight from disk —
// mirrors (does NOT import) audit-app.js's own `listLeafPages()`, exactly the
// convention test_audit_prescan.js's `listLeaf()` already established, so
// criterion 5 proves the cap against ground truth, not against the
// implementation's own count of itself.
// ---------------------------------------------------------------------------
function listLeaf(dir) {
  let entries;
  try { entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }); }
  catch (e) { return []; }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html') && e.name !== 'index.html')
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

function freshState() {
  return { tokens: { cycle: 0, seen: [] }, chains: { cycle: 0, seen: [] } };
}

async function main() {
  const ANCHOR_TOKEN_REL = 'tokens/usdc.html'; // real, committed anchor (asserted present below)
  assert(fs.existsSync(path.join(ROOT, ANCHOR_TOKEN_REL)),
    `fixture wiring check: the real anchor page ${ANCHOR_TOKEN_REL} must exist on disk for this checkout's assumptions to hold`);

  const allTokenCandidates = listLeaf('tokens').filter((r) => r !== ANCHOR_TOKEN_REL);
  const allChainCandidates = listLeaf('chains'); // anchor is the token page above; no chain leaf is excluded by it

  // ---------------------------------------------------------------------------
  // Criterion 1 — never-audited-first, proved on the REAL estate: with a
  // specific real leaf marked `seen` while other real leaves remain unseen, a
  // run at ANY seed never re-picks it. Sized so the "seen" set is everything
  // EXCEPT a small held-out unseen pool, so a correct implementation is
  // FORCED to draw only from that pool — a loose fixture (e.g. marking just
  // one leaf seen against thousands unseen) would pass by luck even with
  // rotation memory wired incorrectly.
  // ---------------------------------------------------------------------------
  await test('criterion 1 (tokens): a real leaf marked seen is never re-picked while unseen leaves remain, across 6 different seeds', () => {
    const heldOutUnseen = allTokenCandidates.slice(0, 5); // small, deterministic unseen pool
    const seenTokens = allTokenCandidates.slice(5); // everything else — thousands of real leaves
    assert(heldOutUnseen.length === 5 && seenTokens.length > 100,
      `fixture wiring check: expected a small held-out pool against a large seen pool, got ${heldOutUnseen.length} unseen / ${seenTokens.length} seen`);
    const watchedSeenLeaf = seenTokens[0];
    for (const seed of ['static196-seed-1', 'static196-seed-2', 'static196-seed-3', 'static196-seed-4', 'static196-seed-5', 'static196-seed-6']) {
      const r = buildStaticSurfaces({
        staticSeed: seed, prescan: false,
        staticRotationState: { tokens: { cycle: 0, seen: seenTokens }, chains: { cycle: 0, seen: [] } }
      });
      const picked = r.staticRotation.tokens.picked;
      assert(!picked.includes(watchedSeenLeaf), `seed "${seed}": a real leaf already marked seen ("${watchedSeenLeaf}") was re-picked while ${heldOutUnseen.length} unseen leaves remained: ${JSON.stringify(picked)}`);
      for (const p of picked) {
        assert(heldOutUnseen.includes(p), `seed "${seed}": expected every pick to come from the held-out unseen pool ${JSON.stringify(heldOutUnseen)}, got "${p}" (which was marked seen)`);
      }
    }
  });

  await test('criterion 1 (chains): a real leaf marked seen is never re-picked while unseen leaves remain, across 6 different seeds', () => {
    const heldOutUnseen = allChainCandidates.slice(0, 3);
    const seenChains = allChainCandidates.slice(3);
    assert(heldOutUnseen.length === 3 && seenChains.length > 20,
      `fixture wiring check: expected a small held-out pool against a large seen pool, got ${heldOutUnseen.length} unseen / ${seenChains.length} seen`);
    const watchedSeenLeaf = seenChains[0];
    for (const seed of ['static196-chain-seed-1', 'static196-chain-seed-2', 'static196-chain-seed-3', 'static196-chain-seed-4', 'static196-chain-seed-5', 'static196-chain-seed-6']) {
      const r = buildStaticSurfaces({
        staticSeed: seed, prescan: false,
        staticRotationState: { tokens: { cycle: 0, seen: [] }, chains: { cycle: 0, seen: seenChains } }
      });
      const picked = r.staticRotation.chains.picked;
      assert(!picked.includes(watchedSeenLeaf), `seed "${seed}": a real chain leaf already marked seen ("${watchedSeenLeaf}") was re-picked while ${heldOutUnseen.length} unseen leaves remained: ${JSON.stringify(picked)}`);
      for (const p of picked) {
        assert(heldOutUnseen.includes(p), `seed "${seed}": expected every pick to come from the held-out unseen pool ${JSON.stringify(heldOutUnseen)}, got "${p}" (which was marked seen)`);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Criterion 2 — the 2:1 split survives; anchor unchanged (named
  // 'static-page', first).
  // ---------------------------------------------------------------------------
  await test('criterion 2: default run yields 4 token + 2 chain surfaces plus the anchor (still named static-page, still first)', () => {
    const r = buildStaticSurfaces({ staticSeed: 'static196-split-seed', prescan: false, staticRotationState: freshState() });
    assert(r.surfaces.length >= 1, 'expected at least the anchor surface');
    assert(r.surfaces[0].name === 'static-page', `expected the anchor to be named "static-page" and first, got ${JSON.stringify(r.surfaces[0])}`);
    assert(r.surfaces[0].url === '/' + ANCHOR_TOKEN_REL, `expected the anchor url to be /${ANCHOR_TOKEN_REL}, got ${r.surfaces[0].url}`);
    assert(r.staticRotation.tokens.sampleSize === 4, `expected 4 token picks (2:1 split of the default sample-6 budget), got ${r.staticRotation.tokens.sampleSize}`);
    assert(r.staticRotation.chains.sampleSize === 2, `expected 2 chain picks, got ${r.staticRotation.chains.sampleSize}`);
    assert(r.staticRotation.tokens.picked.length === 4, `expected exactly 4 token picks, got ${JSON.stringify(r.staticRotation.tokens.picked)}`);
    assert(r.staticRotation.chains.picked.length === 2, `expected exactly 2 chain picks, got ${JSON.stringify(r.staticRotation.chains.picked)}`);
    assert(r.surfaces.length === 7, `expected anchor(1) + tokens(4) + chains(2) = 7 total surfaces, got ${r.surfaces.length}: ${JSON.stringify(r.surfaces.map((s) => s.name))}`);
  });

  // ---------------------------------------------------------------------------
  // Criterion 3 — determinism preserved: same seed + same prior state ->
  // identical picks; different seed -> different picks over the same large
  // unseen pool. (test_seo_surface_audit.js's own pre-existing determinism
  // assertions are proven green separately by running that file unmodified —
  // not duplicated here.)
  // ---------------------------------------------------------------------------
  await test('criterion 3: same seed + same prior state -> identical picks; a different seed -> different picks', () => {
    const state = freshState();
    const r1 = buildStaticSurfaces({ staticSeed: 'static196-det-seed-A', prescan: false, staticRotationState: state });
    const r2 = buildStaticSurfaces({ staticSeed: 'static196-det-seed-A', prescan: false, staticRotationState: state });
    assert(JSON.stringify(r1.staticRotation.tokens.picked) === JSON.stringify(r2.staticRotation.tokens.picked),
      `same seed + same state must pick identical tokens: ${JSON.stringify(r1.staticRotation.tokens.picked)} vs ${JSON.stringify(r2.staticRotation.tokens.picked)}`);
    assert(JSON.stringify(r1.staticRotation.chains.picked) === JSON.stringify(r2.staticRotation.chains.picked),
      `same seed + same state must pick identical chains: ${JSON.stringify(r1.staticRotation.chains.picked)} vs ${JSON.stringify(r2.staticRotation.chains.picked)}`);

    const r3 = buildStaticSurfaces({ staticSeed: 'static196-det-seed-B', prescan: false, staticRotationState: state });
    assert(JSON.stringify(r1.staticRotation.tokens.picked) !== JSON.stringify(r3.staticRotation.tokens.picked),
      `a different seed over the same large unseen pool should pick different tokens; both were ${JSON.stringify(r1.staticRotation.tokens.picked)}`);
  });

  // ---------------------------------------------------------------------------
  // Criterion 4 — wrap works: when every candidate is seen, wrapped=true,
  // cycle increments, and the new seen resets to just this run's picks (never
  // the accumulated history) — same contract as 183.
  // ---------------------------------------------------------------------------
  await test('criterion 4: wrap — every candidate already seen -> wrapped=true, cycle+1, seen resets to just this run\'s picks, next cycle starts fresh', () => {
    const wrapState = {
      tokens: { cycle: 5, seen: allTokenCandidates.slice() }, // EVERY real token candidate already seen
      chains: { cycle: 7, seen: allChainCandidates.slice() }  // EVERY real chain candidate already seen
    };
    const r = buildStaticSurfaces({ staticSeed: 'static196-wrap-seed', prescan: false, staticRotationState: wrapState });

    assert(r.staticRotation.tokens.wrapped === true, `expected tokens.wrapped === true when every candidate is seen, got ${JSON.stringify(r.staticRotation.tokens)}`);
    assert(r.staticRotation.tokens.cycle === 6, `expected tokens.cycle to increment 5 -> 6, got ${r.staticRotation.tokens.cycle}`);
    assert(r.staticRotation.chains.wrapped === true, `expected chains.wrapped === true when every candidate is seen, got ${JSON.stringify(r.staticRotation.chains)}`);
    assert(r.staticRotation.chains.cycle === 8, `expected chains.cycle to increment 7 -> 8, got ${r.staticRotation.chains.cycle}`);

    // seen resets to just THIS run's picks (anchor + picks for tokens; picks
    // only for chains, which has no anchor) — never the accumulated
    // thousands-strong prior history.
    const expectedTokenSeen = new Set([ANCHOR_TOKEN_REL, ...r.staticRotation.tokens.picked]);
    const actualTokenSeen = new Set(r.staticRotationState.tokens.seen);
    assert(actualTokenSeen.size === expectedTokenSeen.size && [...expectedTokenSeen].every((x) => actualTokenSeen.has(x)),
      `expected tokens.seen to reset to exactly {anchor + this run's picks} (${expectedTokenSeen.size} entries), got ${actualTokenSeen.size}: ${JSON.stringify(r.staticRotationState.tokens.seen)}`);
    const expectedChainSeen = new Set(r.staticRotation.chains.picked);
    const actualChainSeen = new Set(r.staticRotationState.chains.seen);
    assert(actualChainSeen.size === expectedChainSeen.size && [...expectedChainSeen].every((x) => actualChainSeen.has(x)),
      `expected chains.seen to reset to exactly this run's picks (${expectedChainSeen.size} entries), got ${actualChainSeen.size}: ${JSON.stringify(r.staticRotationState.chains.seen)}`);

    // Next cycle starts fresh: feeding the just-returned (post-wrap) state
    // back in immediately does NOT wrap again (only a handful of candidates
    // are seen out of thousands) and does not advance cycle further.
    const r2 = buildStaticSurfaces({ staticSeed: 'static196-wrap-seed-2', prescan: false, staticRotationState: r.staticRotationState });
    assert(r2.staticRotation.tokens.wrapped === false, `expected the NEXT tick not to immediately re-wrap (only ${expectedTokenSeen.size} of ${allTokenCandidates.length} candidates seen), got wrapped=true`);
    assert(r2.staticRotation.tokens.cycle === 6, `expected cycle to stay at 6 on the first post-wrap tick, got ${r2.staticRotation.tokens.cycle}`);
    assert(r2.staticRotation.chains.wrapped === false, `expected the NEXT chain tick not to immediately re-wrap, got wrapped=true`);
    assert(r2.staticRotation.chains.cycle === 8, `expected chain cycle to stay at 8 on the first post-wrap tick, got ${r2.staticRotation.chains.cycle}`);
  });

  // ---------------------------------------------------------------------------
  // Criterion 5 — cap above population, asserted against a count read from
  // disk at test time (fs.readdirSync), never a hardcoded literal, so this
  // breaks loudly if the estate ever grows past the cap.
  // ---------------------------------------------------------------------------
  await test('criterion 5: STATIC_ROTATION_SEEN_CAP exceeds the REAL combined tokens+chains leaf count (read from disk, not hardcoded)', () => {
    const realTokenLeafCount = listLeaf('tokens').length;
    const realChainLeafCount = listLeaf('chains').length;
    const combined = realTokenLeafCount + realChainLeafCount;
    assert(STATIC_ROTATION_SEEN_CAP > combined,
      `STATIC_ROTATION_SEEN_CAP (${STATIC_ROTATION_SEEN_CAP}) must exceed the real combined tokens+chains leaf count (${combined} = ${realTokenLeafCount} tokens + ${realChainLeafCount} chains) or the wrap branch for whichever leg hits the cap first can never fire on real data — raise the cap before this ships.`);
    assert(STATIC_ROTATION_SEEN_CAP > realTokenLeafCount, `cap must exceed the tokens leaf count alone (${realTokenLeafCount}), the larger of the two legs`);
  });

  // ---------------------------------------------------------------------------
  // Criterion 6 — anchor + prescan-promoted leaves land in `seen` even though
  // rotation did not pick them. Uses the SAME guarantee-not-luck sizing trick
  // as test_audit_prescan.js: prescanMax/staticSample sized to (today's real
  // suspect count + 1) so the probe is certainly promoted, not a seed-lucky
  // pick among competitors. Pure fs — no Chromium render needed, since
  // promotion/seen-recording both happen inside buildStaticSurfaces() itself.
  // ---------------------------------------------------------------------------
  {
    const probeRel = `tokens/_audit196_probe_${process.pid}.html`;
    const probeAbs = path.join(ROOT, probeRel);
    const probeSlug = probeRel.replace(/\.html$/, '');
    const sourceAbs = path.join(ROOT, ANCHOR_TOKEN_REL);

    await test('criterion 6: a prescan-promoted leaf AND the anchor leaf both land in tokens.seen even though rotation never picked them', () => {
      const preExisting = prescanStaticPages().suspects;
      const preExistingRelCount = new Set(preExisting.map((s) => s.rel)).size;
      const totalWithProbe = preExistingRelCount + 1;
      assert(totalWithProbe <= MAX_STATIC_SAMPLE,
        `test assumption broken: ${totalWithProbe} real suspects (incl. probe) exceed the ${MAX_STATIC_SAMPLE}-page static-sample ceiling — sizing prescanMax alone can no longer guarantee promotion; needs redesign, not a hardcoded skip.`);
      const prescanMax = totalWithProbe;
      const staticSample = totalWithProbe;

      const sourceHtml = fs.readFileSync(sourceAbs, 'utf8');
      const probeHtml = sourceHtml.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '<h1>9NOV2026 DeFi Yields</h1>');
      assert(probeHtml !== sourceHtml, 'probe construction did not actually replace the <h1> — tokens/usdc.html shape must have changed upstream');
      try {
        fs.writeFileSync(probeAbs, probeHtml);
        const r = buildStaticSurfaces({
          prescanMax, staticSample, staticSeed: 'static196-promote-seed', staticRotationState: freshState()
        });
        assert(r.prescan.promoted.includes(probeSlug), `expected the probe page to be promoted (guaranteed by sizing); got promoted=${JSON.stringify(r.prescan.promoted)}`);
        assert(r.staticRotationState.tokens.seen.includes(probeRel), `expected the promoted-but-not-rotation-picked probe leaf "${probeRel}" in tokens.seen; got ${JSON.stringify(r.staticRotationState.tokens.seen)}`);
        assert(!r.staticRotation.tokens.picked.includes(probeRel), `sanity check: the probe should NOT be among the rotation picks (it was promoted, replacing a rotation slot) — got ${JSON.stringify(r.staticRotation.tokens.picked)}`);
        assert(r.staticRotationState.tokens.seen.includes(ANCHOR_TOKEN_REL), `expected the anchor leaf "${ANCHOR_TOKEN_REL}" in tokens.seen (recorded regardless of rotation/promotion); got ${JSON.stringify(r.staticRotationState.tokens.seen)}`);
      } finally {
        try { fs.unlinkSync(probeAbs); } catch (e) {}
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Criterion 7 — library calls never write the committed state file.
  // ---------------------------------------------------------------------------
  await test('criterion 7a: runAudit() library call (no persistRotationState) leaves the COMMITTED audit-static-rotation.json untouched', async () => {
    const committedPath = path.join(ROOT, 'product-loop-kit', 'signals', 'audit-static-rotation.json');
    const existedBefore = fs.existsSync(committedPath);
    const before = existedBefore ? fs.readFileSync(committedPath) : null;
    const outPath = tmpOut('c7a');
    try {
      await runAudit({ port: 8961, only: ['__no_such_surface_196__'], outPath });
      const existedAfter = fs.existsSync(committedPath);
      assert(existedBefore === existedAfter, `expected committed static-rotation.json existence unchanged by a library call (no persistRotationState); before=${existedBefore} after=${existedAfter}`);
      if (existedBefore) {
        const after = fs.readFileSync(committedPath);
        assert(before.equals(after), 'expected the committed audit-static-rotation.json to stay byte-identical after a library runAudit() call');
      }
    } finally {
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  await test('criterion 7b: runAudit() library call with an explicit (temp) staticRotationStatePath still never writes it without persistRotationState', async () => {
    const tempPath = path.join(os.tmpdir(), `audit-static-rotation-196-nowrite-${process.pid}.json`);
    try { fs.unlinkSync(tempPath); } catch (e) {}
    const outPath = tmpOut('c7b');
    try {
      await runAudit({ port: 8962, only: ['__no_such_surface_196__'], staticRotationStatePath: tempPath, outPath });
      assert(!fs.existsSync(tempPath), `expected NO static-rotation state file to be written by a library runAudit() call, but found one at ${tempPath}`);
    } finally {
      try { fs.unlinkSync(tempPath); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  await test('runAudit({persistRotationState:true}) writes the static-rotation state, and a genuine no-op second run produces byte-identical bytes', async () => {
    // AUDIT_STATIC_SAMPLE='0' (env, truthy STRING, not opts.staticSample:0 —
    // audit-app.js reads `opts.staticSample || process.env.AUDIT_STATIC_SAMPLE
    // || DEFAULT_STATIC_SAMPLE`, and the JS-falsy numeric 0 would fall
    // through that `||` chain to the non-zero default; the env var's string
    // '0' is truthy and Number()'s down to a real zero — the exact same
    // falsy-zero trap test_audit_cta_provenance.js's own AUDIT_POOL_SAMPLE=0
    // no-op test documents) forces zero rotation picks per run, so the ONLY
    // thing ever added to tokens.seen is the anchor — already present after
    // run 1, so run 2 (same prior state) adds nothing and the file is
    // byte-identical.
    const staticRotationPath = path.join(os.tmpdir(), `audit-static-rotation-196-noop-${process.pid}.json`);
    const poolRotationPath = path.join(os.tmpdir(), `audit-rotation-196-noop-${process.pid}.json`); // temp — the REAL committed pool rotation file must never be touched by this test either
    try { fs.unlinkSync(staticRotationPath); } catch (e) {}
    try { fs.unlinkSync(poolRotationPath); } catch (e) {}
    const outPath1 = tmpOut('noop-1');
    const outPath2 = tmpOut('noop-2');
    const priorEnv = process.env.AUDIT_STATIC_SAMPLE;
    process.env.AUDIT_STATIC_SAMPLE = '0';
    try {
      const r1 = await runAudit({
        port: 8963, prescan: false, only: ['__no_such_surface_196__'],
        staticRotationStatePath: staticRotationPath, rotationStatePath: poolRotationPath,
        persistRotationState: true, outPath: outPath1
      });
      assert(fs.existsSync(staticRotationPath), 'expected the static-rotation state file to exist after a persisting run');
      const raw1 = fs.readFileSync(staticRotationPath, 'utf8');
      const parsed1 = JSON.parse(raw1);
      assert(parsed1.schemaVersion === 1, `expected schemaVersion 1, got ${JSON.stringify(parsed1)}`);
      assert(Array.isArray(parsed1.tokens.seen) && parsed1.tokens.seen.includes(ANCHOR_TOKEN_REL), `expected the anchor leaf in tokens.seen, got ${JSON.stringify(parsed1)}`);
      assert(parsed1.tokens.seen.length === 1, `expected tokens.seen to contain ONLY the anchor with a zero rotation sample, got ${JSON.stringify(parsed1)}`);
      assert(parsed1.chains.seen.length === 0, `expected chains.seen to be empty with a zero rotation sample and no chain anchor, got ${JSON.stringify(parsed1)}`);
      assert(r1.staticRotation && typeof r1.staticRotation.tokens.cycle === 'number', `expected result.staticRotation to be exposed, got ${JSON.stringify(r1.staticRotation)}`);

      const r2 = await runAudit({
        port: 8964, prescan: false, only: ['__no_such_surface_196__'],
        staticRotationStatePath: staticRotationPath, rotationStatePath: poolRotationPath,
        persistRotationState: true, outPath: outPath2
      });
      const raw2 = fs.readFileSync(staticRotationPath, 'utf8');
      assert(raw1 === raw2, `expected byte-identical static-rotation state after a no-op second run:\n--- run1 ---\n${raw1}\n--- run2 ---\n${raw2}`);
      void r2;
    } finally {
      if (priorEnv === undefined) delete process.env.AUDIT_STATIC_SAMPLE; else process.env.AUDIT_STATIC_SAMPLE = priorEnv;
      try { fs.unlinkSync(staticRotationPath); } catch (e) {}
      try { fs.unlinkSync(poolRotationPath); } catch (e) {}
      try { fs.unlinkSync(outPath1); } catch (e) {}
      try { fs.unlinkSync(outPath2); } catch (e) {}
    }
  });

  // ---------------------------------------------------------------------------
  // Criterion 8 — degrades, never throws. Missing file, corrupt JSON, {},
  // {tokens: 5}, {tokens:{seen:"nope"}} each yield a fresh cycle-0 state and a
  // normal pick — driven through buildStaticSurfaces()'s
  // opts.staticRotationStatePath so the FILE reader (readStaticRotationState)
  // is what's actually exercised, not just computeRotation()'s own
  // independent defensiveness.
  // ---------------------------------------------------------------------------
  await test('criterion 8: missing file, corrupt JSON, {}, {tokens:5}, {tokens:{seen:"nope"}} all degrade to a fresh cycle-0 state and a normal pick, never throw', () => {
    const malformedCases = [
      { label: 'missing file', write: null },
      { label: 'corrupt JSON', write: '{ this is not json' },
      { label: 'empty object', write: '{}' },
      { label: 'tokens is a number', write: JSON.stringify({ tokens: 5, chains: { cycle: 0, seen: [] } }) },
      { label: 'tokens.seen is a string', write: JSON.stringify({ tokens: { seen: 'nope' }, chains: { cycle: 0, seen: [] } }) }
    ];
    for (const c of malformedCases) {
      const p = path.join(os.tmpdir(), `audit-static-rotation-196-malformed-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
      try { fs.unlinkSync(p); } catch (e) {}
      if (c.write !== null) fs.writeFileSync(p, c.write);
      let r;
      try {
        r = buildStaticSurfaces({ staticSeed: 'static196-degrade-seed', prescan: false, staticRotationStatePath: p });
      } catch (err) {
        throw new Error(`case "${c.label}": buildStaticSurfaces() threw instead of degrading: ${err.message}`);
      } finally {
        try { fs.unlinkSync(p); } catch (e) {}
      }
      assert(r.staticRotation.tokens.cycle === 0, `case "${c.label}": expected a fresh cycle-0 tokens state, got cycle ${r.staticRotation.tokens.cycle}`);
      assert(r.staticRotation.chains.cycle === 0, `case "${c.label}": expected a fresh cycle-0 chains state, got cycle ${r.staticRotation.chains.cycle}`);
      assert(r.staticRotation.tokens.picked.length === 4, `case "${c.label}": expected a normal 4-token pick despite the malformed state, got ${JSON.stringify(r.staticRotation.tokens.picked)}`);
      assert(r.staticRotation.chains.picked.length === 2, `case "${c.label}": expected a normal 2-chain pick despite the malformed state, got ${JSON.stringify(r.staticRotation.chains.picked)}`);
    }
  });

  // ---------------------------------------------------------------------------
  // Criterion 9 — override path unchanged: AUDIT_STATIC_PAGES surfaces are
  // used verbatim, rotation off, no state read or written, byte-identical to
  // origin/main. Proven by showing the rotation-related opts have ZERO effect
  // on the override branch's output — same input, with vs without a (bogus,
  // would-throw-if-ever-touched) staticRotationStatePath, yields identical
  // surfaces/prescan output, and the rotation report is the same disabled
  // shape override mode always gave.
  // ---------------------------------------------------------------------------
  await test('criterion 9: AUDIT_STATIC_PAGES override — surfaces verbatim, rotation off (disabled shape), no state read/written, unaffected by rotation opts', () => {
    const overrideOpts = { staticPages: 'tokens/usdc.html,chains/ethereum.html' };
    const rPlain = buildStaticSurfaces(overrideOpts);
    // A path that would throw a permission/ENOENT-shaped error if the override
    // branch ever attempted to read it — proving by construction that it
    // never does (no exception below, and identical output either way).
    const bogusPath = path.join(ROOT, '__nonexistent_dir_196__', 'static-rotation.json');
    const rWithBogusPath = buildStaticSurfaces(Object.assign({}, overrideOpts, {
      staticRotationStatePath: bogusPath,
      staticRotationState: { tokens: { cycle: 99, seen: ['should-never-be-read'] }, chains: { cycle: 99, seen: [] } }
    }));

    assert(JSON.stringify(rPlain.surfaces) === JSON.stringify(rWithBogusPath.surfaces),
      `override-mode surfaces must be identical regardless of rotation opts: ${JSON.stringify(rPlain.surfaces)} vs ${JSON.stringify(rWithBogusPath.surfaces)}`);
    assert(rPlain.surfaces.length === 2 && rPlain.surfaces[0].name === 'static-page' && rPlain.surfaces[1].name === 'static-page:chains/ethereum',
      `expected override entries used verbatim (first named static-page, second named by slug), got ${JSON.stringify(rPlain.surfaces)}`);
    assert(rPlain.staticRotationState === null, `expected staticRotationState === null in override mode (nothing to persist), got ${JSON.stringify(rPlain.staticRotationState)}`);
    assert(rWithBogusPath.staticRotationState === null, 'expected staticRotationState === null in override mode even when rotation opts are supplied');
    assert(rPlain.staticRotation.tokens.cycle === 0 && rPlain.staticRotation.tokens.seenCount === 0 && rPlain.staticRotation.tokens.picked.length === 0,
      `expected the disabled/zero staticRotation shape in override mode, got ${JSON.stringify(rPlain.staticRotation)}`);
  });

  // ---------------------------------------------------------------------------
  // Criterion 10 — measured throughput gain, re-derived here by actually
  // running a 180-day simulation against the BUILT code (buildStaticSurfaces
  // driven directly, prescan:false, in-memory state threaded tick to tick —
  // the exact rig spec 196's own evidence section used to measure
  // origin/main's baseline).
  //
  // DEVIATION FROM THE SPEC'S LITERAL NUMBER (documented in specs/196-notes.md
  // too): the spec's acceptance text asserts "≥ 1,080 distinct token pages"
  // for the 180-day run. That figure is arithmetically unreachable under the
  // unchanged (explicitly out-of-scope-to-raise) DEFAULT_STATIC_SAMPLE=6
  // budget: the 2:1 split gives exactly 4 token picks/tick, so 180 ticks can
  // never produce more than 4*180 = 720 distinct token renders — 1,080 = 6
  // (the COMBINED tokens+chains per-tick budget) * 180, not a token-only
  // figure, and does not match the criterion's own "token pages" wording. The
  // assertions below instead pin the true, arithmetically-derived ceiling —
  // exactly 720 distinct token pages with ZERO re-renders (still a decisive
  // improvement over origin/main's measured 619 distinct / 101 re-renders) —
  // and the criterion's own chain requirement, taken literally but corrected
  // for one more inherent property of computeRotation() (reused VERBATIM,
  // per the spec's own "invent nothing" instruction, so this is the
  // machinery's real behavior, not a defect introduced by this item): when
  // the candidate population isn't evenly divisible by the per-tick sample
  // size, the ONE tick that exhausts the last few unseen candidates picks
  // fewer than `sampleSize` fresh ids and fills the remainder from already-
  // seen ones (`computeRotation()`'s documented "fill from seen only when
  // unseen is exhausted" branch) — a real repeat, on the tick that completes
  // first full coverage, one tick BEFORE `wrapped` itself flips true (wrapped
  // only fires once unseen is EMPTY at the *start* of a tick). 87 chain
  // candidates / 2 per tick leaves a remainder of 1, so exactly one such
  // fill-repeat is mathematically forced — computed below from the real
  // candidateCount/sampleSize, never hardcoded, so this self-corrects if the
  // chain estate size or the 2:1 split ever changes it to 0.
  // ---------------------------------------------------------------------------
  await test('criterion 10: 180-day simulation — zero token re-renders (720 distinct, the true ceiling at 4/tick); chains reach full coverage with only the mathematically-forced fill-repeat before the wrap', () => {
    let state = freshState();
    const tokenEverSeen = new Set();
    let tokenRerenders = 0;
    let tokenSampleSizePerTick = null;
    const chainEverSeenBeforeWrap = new Set();
    let chainRerenders = 0; // counted ONLY on ticks strictly before the first wrap
    let firstChainWrapDay = null;
    let chainCandidateCount = null;
    let chainSampleSizePerTick = null;

    for (let day = 0; day < SIM_DAYS; day++) {
      const r = buildStaticSurfaces({ staticSeed: `static196-sim-day-${day}`, prescan: false, staticRotationState: state });
      if (tokenSampleSizePerTick === null) tokenSampleSizePerTick = r.staticRotation.tokens.sampleSize;
      if (chainCandidateCount === null) chainCandidateCount = r.staticRotation.chains.candidateCount;
      if (chainSampleSizePerTick === null) chainSampleSizePerTick = r.staticRotation.chains.sampleSize;

      for (const p of r.staticRotation.tokens.picked) {
        if (tokenEverSeen.has(p)) tokenRerenders++; else tokenEverSeen.add(p);
      }

      if (firstChainWrapDay === null) {
        if (r.staticRotation.chains.wrapped) {
          firstChainWrapDay = day;
        } else {
          for (const p of r.staticRotation.chains.picked) {
            if (chainEverSeenBeforeWrap.has(p)) chainRerenders++; else chainEverSeenBeforeWrap.add(p);
          }
        }
      }
      state = r.staticRotationState;
    }

    const expectedMaxDistinctTokens = tokenSampleSizePerTick * SIM_DAYS;
    assert(tokenRerenders === 0, `expected ZERO token re-renders over ${SIM_DAYS} days (population ${allTokenCandidates.length} >> ${expectedMaxDistinctTokens} total picks, so no wrap should ever occur in this window), got ${tokenRerenders}`);
    assert(tokenEverSeen.size === expectedMaxDistinctTokens, `expected exactly ${expectedMaxDistinctTokens} distinct token pages rendered (the true ceiling: ${tokenSampleSizePerTick}/tick * ${SIM_DAYS} days, zero repeats), got ${tokenEverSeen.size}`);
    assert(tokenEverSeen.size > 619, `expected the rotation-backed distinct-token count (${tokenEverSeen.size}) to exceed origin/main's measured baseline (619 distinct of 720 picks, 101 re-renders)`);

    assert(firstChainWrapDay !== null, `expected a chain rotation wrap within ${SIM_DAYS} days (spec's own measured full-pass estimate is ~44 days); no wrap observed`);
    const remainder = chainCandidateCount % chainSampleSizePerTick;
    const expectedForcedFillRepeats = remainder === 0 ? 0 : (chainSampleSizePerTick - remainder);
    assert(chainRerenders === expectedForcedFillRepeats,
      `expected exactly the mathematically-forced fill-from-seen repeat count (${expectedForcedFillRepeats}, derived from ${chainCandidateCount} candidates % ${chainSampleSizePerTick}/tick) before the wrap (day ${firstChainWrapDay}) — computeRotation()'s own documented fill-when-unseen-exhausted branch, not an uncontrolled repeat — got ${chainRerenders}`);
    assert(chainEverSeenBeforeWrap.size === chainCandidateCount, `expected FULL chain coverage (${chainCandidateCount} candidates) by the time of the first wrap (day ${firstChainWrapDay}), got ${chainEverSeenBeforeWrap.size} distinct chain pages seen`);
  });

  console.log(`\ntest_audit_static_rotation.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
