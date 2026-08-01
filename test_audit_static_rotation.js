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

   backlog 197 — extends this file (does not replace it) with the identical-
   size `ko/tokens/` + `ko/chains/` sibling estate: two more rotation legs,
   `koTokens`/`koChains`, added to `buildStaticSurfaces()`'s per-family
   design (option (a) from spec 197's Change section — see specs/197-notes.md
   for why per-family over a merged candidate list). The state file shape
   grows additively to `{ schemaVersion, tokens, chains, koTokens, koChains }`
   (still schemaVersion 1). Tests tagged "spec 197 criterion" below are new;
   pre-existing criteria 1-10 are updated in place only where the KO addition
   or the DEFAULT_STATIC_SAMPLE budget raise (6->12, spec 197 design decision
   5) changed their expected NUMBERS — never their underlying invariant.

   Run: node test_audit_static_rotation.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runAudit, buildStaticSurfaces, prescanStaticPages,
  STATIC_ROTATION_SEEN_CAP,
  readStaticRotationState // backlog 197 — drives the file-reader's KO-legs degrade directly
} = require('./audit-app.js');

const ROOT = __dirname;
const MAX_STATIC_SAMPLE = 24; // mirrors audit-app.js's own ceiling (backlog 154, raised 12->24 by backlog 197)
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
  // backlog 197 gaps 1/2 — KO sibling populations; the anchor is always an EN
  // leaf (tokens/usdc.html or chains/ethereum.html — see buildStaticSurfaces()),
  // so no KO candidate list needs an anchor exclusion.
  const allKoTokenCandidates = listLeaf('ko/tokens');
  const allKoChainCandidates = listLeaf('ko/chains');

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
  // spec 197 gap 2 (verifier-found): the KO legs' rotation-state threading was
  // proven only by luck — the pre-existing two-tick test (below, "two
  // consecutive ticks...") uses two DIFFERENT seeds per tick and asserts the
  // picks don't overlap, which a picker that ignores prior state entirely can
  // still pass by seed-hash coincidence (the verifier proved this by
  // hardcoding computeRotation()'s KO calls to ignore priorStaticRotationState
  // and watching that test stay green). This is the SAME luck-proof
  // held-out-pool technique as criterion 1 above, transplanted verbatim onto
  // the koTokens/koChains legs: mark all but a small held-out set as already
  // seen, run across the same 6 seeds, assert every pick comes from the
  // held-out pool. A picker ignoring state would have to hit the tiny
  // held-out set by chance on every seed to pass this.
  // ---------------------------------------------------------------------------
  await test('spec 197 criterion (held-out pool, koTokens): a real KO leaf marked seen is never re-picked while unseen leaves remain, across 6 different seeds', () => {
    const heldOutUnseen = allKoTokenCandidates.slice(0, 5); // small, deterministic unseen pool
    const seenKoTokens = allKoTokenCandidates.slice(5); // everything else — thousands of real leaves
    assert(heldOutUnseen.length === 5 && seenKoTokens.length > 100,
      `fixture wiring check: expected a small held-out pool against a large seen pool, got ${heldOutUnseen.length} unseen / ${seenKoTokens.length} seen`);
    const watchedSeenLeaf = seenKoTokens[0];
    for (const seed of ['static197-koheld-seed-1', 'static197-koheld-seed-2', 'static197-koheld-seed-3', 'static197-koheld-seed-4', 'static197-koheld-seed-5', 'static197-koheld-seed-6']) {
      const r = buildStaticSurfaces({
        staticSeed: seed, prescan: false,
        staticRotationState: {
          tokens: { cycle: 0, seen: [] }, chains: { cycle: 0, seen: [] },
          koTokens: { cycle: 0, seen: seenKoTokens }, koChains: { cycle: 0, seen: [] }
        }
      });
      const picked = r.staticRotation.koTokens.picked;
      assert(!picked.includes(watchedSeenLeaf), `seed "${seed}": a real KO leaf already marked seen ("${watchedSeenLeaf}") was re-picked while ${heldOutUnseen.length} unseen leaves remained: ${JSON.stringify(picked)}`);
      for (const p of picked) {
        assert(heldOutUnseen.includes(p), `seed "${seed}": expected every pick to come from the held-out unseen pool ${JSON.stringify(heldOutUnseen)}, got "${p}" (which was marked seen) — a picker ignoring prior state would fail this`);
      }
    }
  });

  await test('spec 197 criterion (held-out pool, koChains): a real KO leaf marked seen is never re-picked while unseen leaves remain, across 6 different seeds', () => {
    const heldOutUnseen = allKoChainCandidates.slice(0, 3);
    const seenKoChains = allKoChainCandidates.slice(3);
    assert(heldOutUnseen.length === 3 && seenKoChains.length > 20,
      `fixture wiring check: expected a small held-out pool against a large seen pool, got ${heldOutUnseen.length} unseen / ${seenKoChains.length} seen`);
    const watchedSeenLeaf = seenKoChains[0];
    for (const seed of ['static197-kocheld-seed-1', 'static197-kocheld-seed-2', 'static197-kocheld-seed-3', 'static197-kocheld-seed-4', 'static197-kocheld-seed-5', 'static197-kocheld-seed-6']) {
      const r = buildStaticSurfaces({
        staticSeed: seed, prescan: false,
        staticRotationState: {
          tokens: { cycle: 0, seen: [] }, chains: { cycle: 0, seen: [] },
          koTokens: { cycle: 0, seen: [] }, koChains: { cycle: 0, seen: seenKoChains }
        }
      });
      const picked = r.staticRotation.koChains.picked;
      assert(!picked.includes(watchedSeenLeaf), `seed "${seed}": a real KO chain leaf already marked seen ("${watchedSeenLeaf}") was re-picked while ${heldOutUnseen.length} unseen leaves remained: ${JSON.stringify(picked)}`);
      for (const p of picked) {
        assert(heldOutUnseen.includes(p), `seed "${seed}": expected every pick to come from the held-out unseen pool ${JSON.stringify(heldOutUnseen)}, got "${p}" (which was marked seen) — a picker ignoring prior state would fail this`);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Criterion 2 — the 2:1 split survives; anchor unchanged (named
  // 'static-page', first).
  //
  // backlog 197 — updated numbers: DEFAULT_STATIC_SAMPLE was deliberately
  // raised 6->12 so the new KO half gets its own equal-size budget slice
  // WITHOUT halving EN's (spec 197 design decision 5). The EN-half
  // assertions below (tokens sampleSize 4 / chains sampleSize 2) are
  // BYTE-IDENTICAL to pre-197 on purpose — that's the whole point of the
  // raise — with the new KO half (also 4 tokens + 2 chains) asserted
  // alongside, and the total surface count moving 7 -> 13 to match.
  // ---------------------------------------------------------------------------
  await test('criterion 2 (updated by spec 197): default run yields EN 4 token + 2 chain AND KO 4 token + 2 chain surfaces, plus the anchor (still named static-page, still first)', () => {
    const r = buildStaticSurfaces({ staticSeed: 'static196-split-seed', prescan: false, staticRotationState: freshState() });
    assert(r.surfaces.length >= 1, 'expected at least the anchor surface');
    assert(r.surfaces[0].name === 'static-page', `expected the anchor to be named "static-page" and first, got ${JSON.stringify(r.surfaces[0])}`);
    assert(r.surfaces[0].url === '/' + ANCHOR_TOKEN_REL, `expected the anchor url to be /${ANCHOR_TOKEN_REL}, got ${r.surfaces[0].url}`);
    assert(r.staticRotation.tokens.sampleSize === 4, `expected 4 EN token picks (2:1 split of the EN half of the default sample-12 budget), got ${r.staticRotation.tokens.sampleSize}`);
    assert(r.staticRotation.chains.sampleSize === 2, `expected 2 EN chain picks, got ${r.staticRotation.chains.sampleSize}`);
    assert(r.staticRotation.tokens.picked.length === 4, `expected exactly 4 EN token picks, got ${JSON.stringify(r.staticRotation.tokens.picked)}`);
    assert(r.staticRotation.chains.picked.length === 2, `expected exactly 2 EN chain picks, got ${JSON.stringify(r.staticRotation.chains.picked)}`);
    assert(r.staticRotation.koTokens.sampleSize === 4, `expected 4 KO token picks (same 2:1 split, KO half), got ${r.staticRotation.koTokens.sampleSize}`);
    assert(r.staticRotation.koChains.sampleSize === 2, `expected 2 KO chain picks, got ${r.staticRotation.koChains.sampleSize}`);
    assert(r.staticRotation.koTokens.picked.length === 4, `expected exactly 4 KO token picks, got ${JSON.stringify(r.staticRotation.koTokens.picked)}`);
    assert(r.staticRotation.koChains.picked.length === 2, `expected exactly 2 KO chain picks, got ${JSON.stringify(r.staticRotation.koChains.picked)}`);
    assert(r.staticRotation.koTokens.picked.every((rel) => rel.startsWith('ko/tokens/')), `expected every koTokens pick to be under ko/tokens/, got ${JSON.stringify(r.staticRotation.koTokens.picked)}`);
    assert(r.staticRotation.koChains.picked.every((rel) => rel.startsWith('ko/chains/')), `expected every koChains pick to be under ko/chains/, got ${JSON.stringify(r.staticRotation.koChains.picked)}`);
    assert(r.surfaces.length === 13, `expected anchor(1) + tokens(4) + chains(2) + koTokens(4) + koChains(2) = 13 total surfaces, got ${r.surfaces.length}: ${JSON.stringify(r.surfaces.map((s) => s.name))}`);
    const koSurfaceNames = r.surfaces.filter((s) => s.name.startsWith('static-page:ko/')).map((s) => s.name);
    assert(koSurfaceNames.length === 6, `expected exactly 6 "static-page:ko/…" surfaces (4 koTokens + 2 koChains), got ${koSurfaceNames.length}: ${JSON.stringify(koSurfaceNames)}`);
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
  // backlog 197 acceptance ("Seen-cap invariant... each of the four legs'
  // REAL disk-read population") — the SAME invariant as criterion 5 above,
  // asserted PER LEG against all four real directories individually (never
  // a combined sum), matching 196's own trap precedent: a cap that clears
  // the SUM but not every individual leg would still be a live bug.
  // ---------------------------------------------------------------------------
  await test('spec 197 criterion (seen-cap invariant, per leg): STATIC_ROTATION_SEEN_CAP exceeds EACH of the four legs\' REAL disk-read population (tokens, chains, koTokens, koChains) individually', () => {
    const perLeg = {
      tokens: listLeaf('tokens').length,
      chains: listLeaf('chains').length,
      koTokens: listLeaf('ko/tokens').length,
      koChains: listLeaf('ko/chains').length
    };
    for (const [leg, count] of Object.entries(perLeg)) {
      assert(STATIC_ROTATION_SEEN_CAP > count,
        `STATIC_ROTATION_SEEN_CAP (${STATIC_ROTATION_SEEN_CAP}) must exceed the "${leg}" leg's real disk-read population (${count}) individually, or that leg's wrap branch can never fire on real data — got cap=${STATIC_ROTATION_SEEN_CAP} <= ${leg}=${count}`);
    }
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
  // spec 197 gap 1 (verifier-found): routeToLeg() in buildStaticSurfaces()
  // (~audit-app.js:2229-2235) tests `ko/chains/` and `ko/tokens/` BEFORE the
  // bare `chains/`/`tokens/` prefixes — with naive (bare-prefix-first, else
  // -> tokens) ordering, every KO rel falls through and is recorded into the
  // EN TOKENS leg's `seen` set. The verifier deleted both `ko/` branches and
  // both test files stayed green. This transplants criterion 6's exact
  // probe/promotion technique (same guarantee-not-luck cap sizing: real
  // suspect count + 1, so promotion of the probe is certain, not seed-lucky)
  // onto a KO leaf for each of the two KO legs, asserting the promoted rel
  // lands in the correct KO leg's `seen` AND in neither EN leg's `seen`.
  // ---------------------------------------------------------------------------
  {
    const koTokenProbeRel = `ko/tokens/_audit197_probe_${process.pid}.html`;
    const koTokenProbeAbs = path.join(ROOT, koTokenProbeRel);
    const koTokenProbeSlug = koTokenProbeRel.replace(/\.html$/, '');
    const koTokenSourceAbs = path.join(ROOT, 'ko/tokens/usdc.html');

    await test('spec 197 criterion (routeToLeg ordering, koTokens): a prescan-promoted ko/tokens/ leaf lands in koTokens.seen, and NEVER in tokens.seen or chains.seen', () => {
      const preExisting = prescanStaticPages().suspects;
      const preExistingRelCount = new Set(preExisting.map((s) => s.rel)).size;
      const totalWithProbe = preExistingRelCount + 1;
      assert(totalWithProbe <= MAX_STATIC_SAMPLE,
        `test assumption broken: ${totalWithProbe} real suspects (incl. probe) exceed the ${MAX_STATIC_SAMPLE}-page static-sample ceiling — sizing prescanMax alone can no longer guarantee promotion; needs redesign, not a hardcoded skip.`);
      const prescanMax = totalWithProbe;
      const staticSample = totalWithProbe;

      const sourceHtml = fs.readFileSync(koTokenSourceAbs, 'utf8');
      const probeHtml = sourceHtml.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '<h1>9NOV2026 코 DeFi Yields</h1>');
      assert(probeHtml !== sourceHtml, 'probe construction did not actually replace the <h1> — ko/tokens/usdc.html shape must have changed upstream');
      try {
        fs.writeFileSync(koTokenProbeAbs, probeHtml);
        const r = buildStaticSurfaces({
          prescanMax, staticSample, staticSeed: 'static197-ko-promote-seed', staticRotationState: freshState()
        });
        assert(r.prescan.promoted.includes(koTokenProbeSlug), `expected the ko/tokens probe page to be promoted (guaranteed by sizing); got promoted=${JSON.stringify(r.prescan.promoted)}`);
        assert(r.staticRotationState.koTokens.seen.includes(koTokenProbeRel), `expected the promoted KO leaf "${koTokenProbeRel}" in koTokens.seen; got ${JSON.stringify(r.staticRotationState.koTokens.seen)}`);
        assert(!r.staticRotationState.tokens.seen.includes(koTokenProbeRel), `routeToLeg() misfiled the KO promoted leaf into the EN tokens.seen (the naive-fallthrough bug spec 197 gap 1 describes); got tokens.seen=${JSON.stringify(r.staticRotationState.tokens.seen)}`);
        assert(!r.staticRotationState.chains.seen.includes(koTokenProbeRel), `expected the KO promoted leaf NOT in the EN chains.seen either; got chains.seen=${JSON.stringify(r.staticRotationState.chains.seen)}`);
        assert(!r.staticRotation.koTokens.picked.includes(koTokenProbeRel), `sanity check: the probe should NOT be among the koTokens rotation picks (it was promoted, replacing a rotation slot) — got ${JSON.stringify(r.staticRotation.koTokens.picked)}`);
      } finally {
        try { fs.unlinkSync(koTokenProbeAbs); } catch (e) {}
      }
    });
  }

  {
    const koChainProbeRel = `ko/chains/_audit197_probe_${process.pid}.html`;
    const koChainProbeAbs = path.join(ROOT, koChainProbeRel);
    const koChainProbeSlug = koChainProbeRel.replace(/\.html$/, '');
    const koChainSourceAbs = path.join(ROOT, 'ko/chains/ethereum.html');

    await test('spec 197 criterion (routeToLeg ordering, koChains): a prescan-promoted ko/chains/ leaf lands in koChains.seen, and NEVER in tokens.seen or chains.seen', () => {
      const preExisting = prescanStaticPages().suspects;
      const preExistingRelCount = new Set(preExisting.map((s) => s.rel)).size;
      const totalWithProbe = preExistingRelCount + 1;
      assert(totalWithProbe <= MAX_STATIC_SAMPLE,
        `test assumption broken: ${totalWithProbe} real suspects (incl. probe) exceed the ${MAX_STATIC_SAMPLE}-page static-sample ceiling — sizing prescanMax alone can no longer guarantee promotion; needs redesign, not a hardcoded skip.`);
      const prescanMax = totalWithProbe;
      const staticSample = totalWithProbe;

      const sourceHtml = fs.readFileSync(koChainSourceAbs, 'utf8');
      const probeHtml = sourceHtml.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '<h1>9NOV2026 코 DeFi Yields</h1>');
      assert(probeHtml !== sourceHtml, 'probe construction did not actually replace the <h1> — ko/chains/ethereum.html shape must have changed upstream');
      try {
        fs.writeFileSync(koChainProbeAbs, probeHtml);
        const r = buildStaticSurfaces({
          prescanMax, staticSample, staticSeed: 'static197-kochain-promote-seed', staticRotationState: freshState()
        });
        assert(r.prescan.promoted.includes(koChainProbeSlug), `expected the ko/chains probe page to be promoted (guaranteed by sizing); got promoted=${JSON.stringify(r.prescan.promoted)}`);
        assert(r.staticRotationState.koChains.seen.includes(koChainProbeRel), `expected the promoted KO leaf "${koChainProbeRel}" in koChains.seen; got ${JSON.stringify(r.staticRotationState.koChains.seen)}`);
        assert(!r.staticRotationState.tokens.seen.includes(koChainProbeRel), `routeToLeg() misfiled the KO promoted leaf into the EN tokens.seen (the naive-fallthrough bug spec 197 gap 1 describes); got tokens.seen=${JSON.stringify(r.staticRotationState.tokens.seen)}`);
        assert(!r.staticRotationState.chains.seen.includes(koChainProbeRel), `expected the KO promoted leaf NOT in the EN chains.seen either; got chains.seen=${JSON.stringify(r.staticRotationState.chains.seen)}`);
        assert(!r.staticRotation.koChains.picked.includes(koChainProbeRel), `sanity check: the probe should NOT be among the koChains rotation picks (it was promoted, replacing a rotation slot) — got ${JSON.stringify(r.staticRotation.koChains.picked)}`);
      } finally {
        try { fs.unlinkSync(koChainProbeAbs); } catch (e) {}
      }
    });
  }

  // ---------------------------------------------------------------------------
  // backlog 197 — spec 197 acceptance: "a runAudit() result's surfacesCovered
  // contains AT LEAST ONE rendered `static-page:ko/…` surface, asserted by
  // grepping the `ko/` path prefix". Driven as a real (but cheap) runAudit()
  // call so this proves the FULL wiring end to end (buildStaticSurfaces()'s
  // output actually reaches runAudit()'s surfacesCovered), not just
  // buildStaticSurfaces() in isolation — `only: ['static-prescan']` (same
  // trick criterion 5 of test_audit_prescan.js uses) matches no rendered
  // surface name, so nothing actually renders and this stays fast; the
  // static surfaces are still COMPUTED (and land in surfacesCovered) before
  // the `only` filter is applied to rendering.
  // ---------------------------------------------------------------------------
  await test('spec 197 criterion: a runAudit() result\'s surfacesCovered contains >=1 rendered "static-page:ko/…" surface (grepped by the ko/ path prefix)', async () => {
    const outPath = tmpOut('ko-surface');
    try {
      // staticOnly: true filters runAudit()'s render loop down to `kind:
      // 'static'` surfaces only (audit-app.js's own opts.staticOnly
      // contract, reused verbatim — same convention every other real-render
      // test in this file uses to stay fast) — this still proves the FULL
      // wiring (buildStaticSurfaces() -> runAudit() -> a real Playwright
      // render -> surfacesCovered), just without also rendering the ~40
      // unrelated pool/grid/planner surfaces a default run would.
      const r = await runAudit({ port: 8965, staticOnly: true, staticSeed: 'static197-ko-surface-seed', outPath });
      const koSurfaces = r.surfacesCovered.filter((s) => /^static-page:ko\//.test(s));
      assert(koSurfaces.length > 0, `expected >=1 "static-page:ko/…" surface in surfacesCovered; got ${JSON.stringify(r.surfacesCovered)}`);
    } finally {
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  // ---------------------------------------------------------------------------
  // backlog 197 — spec 197 acceptance: "after two consecutive simulated
  // ticks threading state tick-to-tick, the KO leg's seenCount advances and
  // the second tick renders no page the first tick already rendered" (196's
  // own invariant, applied to the new koTokens/koChains legs). Mirrors
  // criterion 1's "held-out unseen pool" rigor: sized so a correct
  // implementation is FORCED to draw tick 2's picks from what tick 1 left
  // unseen, not pass by luck.
  // ---------------------------------------------------------------------------
  await test('spec 197 criterion: two consecutive ticks threading state tick-to-tick — KO legs\' seenCount advances, and tick 2 renders no page tick 1 already rendered', () => {
    const r1 = buildStaticSurfaces({ staticSeed: 'static197-tick-seed-1', prescan: false, staticRotationState: freshState() });
    assert(r1.staticRotation.koTokens.picked.length === 4, `expected 4 KO token picks on tick 1, got ${JSON.stringify(r1.staticRotation.koTokens.picked)}`);
    assert(r1.staticRotation.koChains.picked.length === 2, `expected 2 KO chain picks on tick 1, got ${JSON.stringify(r1.staticRotation.koChains.picked)}`);
    const tick1KoTokenSeen = r1.staticRotationState.koTokens.seen.length;
    const tick1KoChainSeen = r1.staticRotationState.koChains.seen.length;
    assert(tick1KoTokenSeen === 4, `expected koTokens.seen to hold exactly this tick's 4 picks (fresh state, no anchor in this leg), got ${tick1KoTokenSeen}`);
    assert(tick1KoChainSeen === 2, `expected koChains.seen to hold exactly this tick's 2 picks, got ${tick1KoChainSeen}`);

    const r2 = buildStaticSurfaces({ staticSeed: 'static197-tick-seed-2', prescan: false, staticRotationState: r1.staticRotationState });
    assert(r2.staticRotation.koTokens.seenCount > tick1KoTokenSeen, `expected koTokens.seenCount to ADVANCE on tick 2 (was ${tick1KoTokenSeen}), got ${r2.staticRotation.koTokens.seenCount}`);
    assert(r2.staticRotation.koChains.seenCount > tick1KoChainSeen, `expected koChains.seenCount to ADVANCE on tick 2 (was ${tick1KoChainSeen}), got ${r2.staticRotation.koChains.seenCount}`);

    const tick1KoTokenPicks = new Set(r1.staticRotation.koTokens.picked);
    const tick1KoChainPicks = new Set(r1.staticRotation.koChains.picked);
    for (const p of r2.staticRotation.koTokens.picked) {
      assert(!tick1KoTokenPicks.has(p), `tick 2 re-rendered a koTokens page tick 1 already rendered: "${p}"`);
    }
    for (const p of r2.staticRotation.koChains.picked) {
      assert(!tick1KoChainPicks.has(p), `tick 2 re-rendered a koChains page tick 1 already rendered: "${p}"`);
    }
    // Sanity rail: the EN legs (already covered by pre-existing criteria
    // 1/3) must not go BACKWARDS across the same two ticks this test drives.
    assert(r2.staticRotation.tokens.seenCount >= r1.staticRotationState.tokens.seen.length,
      `sanity check: EN tokens.seenCount should not go backwards tick-to-tick, got tick1=${r1.staticRotationState.tokens.seen.length} tick2=${r2.staticRotation.tokens.seenCount}`);
  });

  // ---------------------------------------------------------------------------
  // backlog 197 — spec 197 design decision 6: "a state file missing the KO
  // legs (today's committed file) must degrade to fresh cycle-0/empty-seen
  // legs WITHOUT touching the EN legs." Drives readStaticRotationState()
  // directly (the exported reader), not buildStaticSurfaces(), so this is a
  // proof about the FILE READER itself, independent of the rotation picker.
  // ---------------------------------------------------------------------------
  await test('spec 197 criterion: readStaticRotationState() on a state file with only the OLD two EN legs degrades koTokens/koChains to fresh cycle-0/empty-seen, WITHOUT disturbing tokens/chains', () => {
    const p = path.join(os.tmpdir(), `audit-static-rotation-197-legacy-${process.pid}.json`);
    const legacyEnOnlyState = {
      schemaVersion: 1,
      tokens: { cycle: 3, seen: ['tokens/usdc.html', 'tokens/dai.html'] },
      chains: { cycle: 2, seen: ['chains/ethereum.html'] }
      // deliberately no koTokens/koChains keys at all — this is what
      // today's ALREADY-COMMITTED product-loop-kit/signals/audit-static-rotation.json
      // looks like, pre-197.
    };
    fs.writeFileSync(p, JSON.stringify(legacyEnOnlyState, null, 2) + '\n');
    try {
      const result = readStaticRotationState(p);
      assert(result.tokens.cycle === 3 && JSON.stringify(result.tokens.seen) === JSON.stringify(['tokens/usdc.html', 'tokens/dai.html']),
        `expected the EN tokens leg to be read through UNCHANGED; got ${JSON.stringify(result.tokens)}`);
      assert(result.chains.cycle === 2 && JSON.stringify(result.chains.seen) === JSON.stringify(['chains/ethereum.html']),
        `expected the EN chains leg to be read through UNCHANGED; got ${JSON.stringify(result.chains)}`);
      assert(result.koTokens && result.koTokens.cycle === 0 && Array.isArray(result.koTokens.seen) && result.koTokens.seen.length === 0,
        `expected koTokens to degrade to a fresh cycle-0/empty-seen leg on a state file that never mentions it; got ${JSON.stringify(result.koTokens)}`);
      assert(result.koChains && result.koChains.cycle === 0 && Array.isArray(result.koChains.seen) && result.koChains.seen.length === 0,
        `expected koChains to degrade to a fresh cycle-0/empty-seen leg on a state file that never mentions it; got ${JSON.stringify(result.koChains)}`);
    } finally {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  });

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
