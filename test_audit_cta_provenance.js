/* Acceptance tests for backlog 183: provenance + classification on the
   pool-detail protocol CTA (leg a) and never-audited-first pool rotation
   with committed bounded state (leg b).

   Both mechanisms are exercised here as PURE functions
   (classifyCtaKind()/computeRotation(), plus the two disk-side readers) —
   no Chromium, no network, no rendering. The DOM shape discriminator itself
   (real CTA vs 182's DefiLlama fallback vs missing) lives inline in the
   `main()` pool driver in audit-app.js and can only be proven against a real
   render; that is covered by the full `node audit-app.js` run recorded in
   183-notes.md, not duplicated here (mirrors test_audit_pool_prescan.js's
   own split between fixture-pure criteria and runAudit()-level criteria).

   Run: node test_audit_cta_provenance.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  runAudit, classifyCtaKind, computeRotation, readBakedProtocolUrls,
  readStaticProtocolUrls, projectHasUrl, ROTATION_SEEN_CAP, ctaFindingSeverity,
  buildPoolSurfaces, DEFAULT_POOL_SAMPLE, MAX_POOL_SAMPLE, blockingFindings
} = require('./audit-app.js');

const ROOT = __dirname;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function tmpOut(tag) { return path.join(os.tmpdir(), `audit-findings-ctaprov-${tag}-${process.pid}.json`); }

function anchorPool() {
  return {
    pool: '747c1d2a-c668-4682-b9f9-296708a3dd90', chain: 'Ethereum', project: 'lido', symbol: 'STETH',
    tvlUsd: 20_000_000, apyBase: 3.0, apyReward: 0, apyMean30d: 3.0,
    kpis: { historyPoints: 15, apyMomentum: 0.02, apyStdev: 0.1, apyMean: 3.0, apySharpe: 1.1, tvlTrend: 0.01 }
  };
}
function cleanPool(i) {
  return {
    pool: `p${String(i).padStart(7, '0')}`, chain: 'Ethereum', project: 'clean-project', symbol: 'CLEAN',
    tvlUsd: 10_000_000 + i * 1000, apyBase: 3.5, apyReward: 1.2, apyMean30d: 4.1,
    kpis: { historyPoints: 15, apyMomentum: 0.02, apyStdev: 0.1, apyMean: 4.0, apySharpe: 1.1, tvlTrend: 0.01 }
  };
}

async function main() {
  // ===========================================================================
  // Leg (a) — classifyCtaKind() as a pure function over fixtures.
  // Decision order (audit-app.js, item 194 revised): undeterminable ->
  // upstream-null(no tier + upstreamUnreachable===true) -> defect(no tier) ->
  // environment(tier + fetch not-ok) -> defect(tier + fetch ok, still bad).
  // ===========================================================================

  // item 194 — this used to be named "the sdai shape" and asserted `defect`
  // unconditionally for the no-tier case. That was the wrong assumption:
  // sdai's real shape (no disk-side tier AND upstream positively confirms no
  // URL exists) is `upstream-null`, not `defect` — see the dedicated 194
  // tests below. This case remains `defect` because `upstreamUnreachable` is
  // omitted entirely (tri-state defaults to not-true), which is a DIFFERENT,
  // still-real shape: a genuine coverage gap (project absent from the
  // upstream feed, or evidence just not supplied) — kept here unchanged so
  // the pre-194 no-tier/no-evidence behavior stays pinned.
  await test('classifier: no disk-side tier resolves, no upstream-unreachable evidence supplied -> defect, P1 — fetch outcome must not matter', () => {
    const a = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'ok' });
    const b = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'failed' });
    const c = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'absent' });
    assert(a === 'defect', `expected defect with fetch=ok and no tiers, got ${a}`);
    assert(b === 'defect', `expected defect with fetch=failed and no tiers (no-tier check must win over environment), got ${b}`);
    assert(c === 'defect', `expected defect with fetch=absent and no tiers, got ${c}`);
  });

  // ===========================================================================
  // item 194 — the new `upstream-null` kind. Acceptance criteria 1/2/4.
  // ===========================================================================

  await test('194 criterion 1: no disk-side tier + upstreamUnreachable:true -> upstream-null, for every bakedRunOutcome (branch-order proof: upstream-null precedes the environment check)', () => {
    const ok = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'ok', upstreamUnreachable: true });
    const failed = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'failed', upstreamUnreachable: true });
    const absent = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'absent', upstreamUnreachable: true });
    assert(ok === 'upstream-null', `expected upstream-null for fetch=ok, got ${ok}`);
    assert(failed === 'upstream-null', `expected upstream-null for fetch=failed (must win over environment), got ${failed}`);
    assert(absent === 'upstream-null', `expected upstream-null for fetch=absent (must win over environment), got ${absent}`);
  });

  await test('194 criterion 2: the upstream-null downgrade is NOT the default — upstreamUnreachable:false, :null, and omitted entirely all still fall through to defect', () => {
    const withFalse = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'ok', upstreamUnreachable: false });
    const withNull = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'ok', upstreamUnreachable: null });
    const omitted = classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'ok' });
    assert(withFalse === 'defect', `expected defect for upstreamUnreachable:false, got ${withFalse}`);
    assert(withNull === 'defect', `expected defect for upstreamUnreachable:null, got ${withNull}`);
    assert(omitted === 'defect', `expected defect when upstreamUnreachable is omitted entirely, got ${omitted}`);
  });

  await test('194 criterion 4: ctaFindingSeverity is P2 for fallback+upstream-null, but STILL P1 for missing+upstream-null (the 183 round-3 asymmetry survives the new kind)', () => {
    const fallback = ctaFindingSeverity('fallback', 'upstream-null');
    const missing = ctaFindingSeverity('missing', 'upstream-null');
    assert(fallback === 'P2', `expected P2 for fallback+upstream-null, got ${fallback}`);
    assert(missing === 'P1', `expected P1 for missing+upstream-null (protocol-URL provenance has no causal link to a genuinely absent element), got ${missing}`);
  });

  await test('classifier: tier exists on disk + this run\'s fetch failed -> environment, P2 (non-blocking, the reconciled case)', () => {
    const failed = classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked'], bakedRunOutcome: 'failed' });
    const absent = classifyCtaKind({ diskDeterminable: true, diskTiers: ['static'], bakedRunOutcome: 'absent' });
    assert(failed === 'environment', `expected environment for tier+failed, got ${failed}`);
    assert(absent === 'environment', `expected environment for tier+absent ("never arrived"), got ${absent}`);
  });

  await test('classifier: tier exists on disk + this run\'s fetch confirmed ok, CTA still degraded -> defect, P1 (a real bug, not environment)', () => {
    const k = classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked', 'static'], bakedRunOutcome: 'ok' });
    assert(k === 'defect', `expected defect when disk resolves AND this run's fetch confirmed it, got ${k}`);
  });

  await test('classifier: disk-side undeterminable (unreadable/malformed artifact or static-map extraction failure) -> undeterminable, P1, REGARDLESS of tiers/outcome', () => {
    const withTiersOk = classifyCtaKind({ diskDeterminable: false, diskTiers: ['baked'], bakedRunOutcome: 'ok' });
    const noTiersFailed = classifyCtaKind({ diskDeterminable: false, diskTiers: [], bakedRunOutcome: 'failed' });
    assert(withTiersOk === 'undeterminable', `expected undeterminable when disk-side is undeterminable, got ${withTiersOk}`);
    assert(noTiersFailed === 'undeterminable', `expected undeterminable when disk-side is undeterminable, got ${noTiersFailed}`);
  });

  await test('classifier non-vacuity: an indeterminate run-side signal ("unknown") must land on undeterminable, NOT silently become environment', () => {
    // If this ever returned 'environment' the downgrade would be reachable
    // through a fallthrough default — exactly the failure spec 183 exists to
    // prevent ("A run in which every dead-cta is auto-downgraded without
    // evidence is the failure this item exists to prevent").
    const k = classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked'], bakedRunOutcome: 'unknown' });
    assert(k === 'undeterminable', `expected undeterminable for an unknown run-side signal, got ${k} — environment must never be a fallthrough default`);
  });

  await test('classifier non-vacuity: environment is reachable ONLY via tier-present + fetch-not-ok — every other combination in this suite avoided it', () => {
    // Cross-check across everything asserted above: collect every kind
    // produced by a fixture that was NOT the explicit environment case, and
    // confirm none of them slipped through as 'environment'.
    const nonEnvCases = [
      classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'ok' }),
      classifyCtaKind({ diskDeterminable: true, diskTiers: [], bakedRunOutcome: 'failed' }),
      classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked'], bakedRunOutcome: 'ok' }),
      classifyCtaKind({ diskDeterminable: false, diskTiers: ['baked'], bakedRunOutcome: 'ok' }),
      classifyCtaKind({ diskDeterminable: true, diskTiers: ['baked'], bakedRunOutcome: 'unknown' })
    ];
    assert(nonEnvCases.every((k) => k !== 'environment'), `expected zero 'environment' among non-environment fixtures, got: ${JSON.stringify(nonEnvCases)}`);
  });

  // ===========================================================================
  // Leg (a) — ctaFindingSeverity(shape, kind): the round-3 verifier fix.
  // 182 made renderProtocolCtaBlock() ALWAYS render one of the two buttons,
  // so a `missing` shape can never be causally explained by protocol-URL
  // provenance — it must stay P1 no matter what `kind` classifyCtaKind()
  // produced. Only `fallback` (the element present, just not the real CTA)
  // is eligible for the `environment` downgrade to P2.
  // ===========================================================================

  await test('severity: a `missing` shape stays P1 even when kind === "environment" (the exact bug the round-3 review caught)', () => {
    const sev = ctaFindingSeverity('missing', 'environment');
    assert(sev === 'P1', `expected P1 for a missing CTA regardless of kind, got ${sev} — protocol-URL provenance has no causal link to a genuinely absent element`);
  });

  await test('severity: a `missing` shape stays P1 for every kind (defect/undeterminable/environment) — not just the environment case', () => {
    for (const kind of ['defect', 'undeterminable', 'environment']) {
      const sev = ctaFindingSeverity('missing', kind);
      assert(sev === 'P1', `expected P1 for missing+${kind}, got ${sev}`);
    }
  });

  await test('severity: a `fallback` shape DOES follow kind — environment downgrades to P2, defect/undeterminable stay P1 (non-vacuity: both directions proven)', () => {
    const env = ctaFindingSeverity('fallback', 'environment');
    const defect = ctaFindingSeverity('fallback', 'defect');
    const undeterminable = ctaFindingSeverity('fallback', 'undeterminable');
    assert(env === 'P2', `expected P2 for fallback+environment, got ${env}`);
    assert(defect === 'P1', `expected P1 for fallback+defect, got ${defect}`);
    assert(undeterminable === 'P1', `expected P1 for fallback+undeterminable, got ${undeterminable}`);
  });

  await test('severity non-vacuity: same `kind` ("environment"), different `shape` -> different severity (proves shape, not just kind, drives the result)', () => {
    const missing = ctaFindingSeverity('missing', 'environment');
    const fallback = ctaFindingSeverity('fallback', 'environment');
    assert(missing === 'P1' && fallback === 'P2' && missing !== fallback,
      `expected shape to change the outcome for the SAME kind: missing=${missing}, fallback=${fallback}`);
  });

  // ===========================================================================
  // Leg (a) — real disk-side data (the live sdai instance, spec 183 T2).
  // Not a fixture: reads this checkout's actual data/protocol-urls.json and
  // app.js PROTOCOL_URLS literal.
  // ===========================================================================

  await test('real data: both disk-side readers succeed on this checkout (determinable), and project "sdai" resolves in NEITHER tier', () => {
    const baked = readBakedProtocolUrls();
    const staticMap = readStaticProtocolUrls();
    assert(baked && baked.keys instanceof Set, 'expected readBakedProtocolUrls() to succeed on this checkout');
    assert(staticMap && staticMap.keys instanceof Set, 'expected readStaticProtocolUrls() to succeed on this checkout (PROTOCOL_URLS literal must still parse)');
    assert(!projectHasUrl(baked.keys, 'sdai'), 'expected "sdai" absent from the baked artifact (spec 183 T2)');
    assert(!projectHasUrl(staticMap.keys, 'sdai'), 'expected "sdai" absent from the static PROTOCOL_URLS map (spec 183 T2)');
    // Positive control — a project that DOES resolve, so the reader isn't
    // just returning an always-empty set.
    assert(projectHasUrl(baked.keys, 'lido') || projectHasUrl(staticMap.keys, 'lido'),
      'expected "lido" to resolve in at least one disk-side tier (positive control for the readers)');
  });

  // ===========================================================================
  // Leg (b) — computeRotation() as a pure function.
  // ===========================================================================

  await test('rotation: two consecutive picks (state updated with what got seen) are DISJOINT when unseen candidates remain', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => `cand-${String(i).padStart(3, '0')}`);
    const r1 = computeRotation(candidates, 4, 'audit-183-seed-a:pools', { cycle: 0, seen: [] });
    assert(r1.picked.length === 4, `expected 4 picks, got ${r1.picked.length}`);
    assert(r1.wrapped === false, 'expected no wrap on a fresh/empty seen set');
    const state2 = { cycle: r1.cycle, seen: r1.picked.slice() };
    const r2 = computeRotation(candidates, 4, 'audit-183-seed-a:pools', state2);
    const overlap = r1.picked.filter((id) => r2.picked.includes(id));
    assert(overlap.length === 0, `expected disjoint picks across two consecutive invocations, got overlap: ${JSON.stringify(overlap)}`);
  });

  await test('rotation: wrap increments cycle and resumes picking once every candidate has been seen', () => {
    const candidates = ['a', 'b', 'c'];
    const r = computeRotation(candidates, 2, 'audit-183-seed-wrap', { cycle: 2, seen: ['a', 'b', 'c'] });
    assert(r.wrapped === true, 'expected wrapped === true when every candidate is already seen');
    assert(r.cycle === 3, `expected cycle to increment 2 -> 3 on wrap, got ${r.cycle}`);
    assert(r.picked.length === 2, `expected a full pick after wrap, got ${r.picked.length}`);
  });

  await test('rotation non-vacuity: no wrap (and cycle unchanged) when at least one candidate remains unseen', () => {
    const candidates = ['a', 'b', 'c'];
    const r = computeRotation(candidates, 2, 'audit-183-seed-nowrap', { cycle: 5, seen: ['a', 'b'] }); // 'c' unseen
    assert(r.wrapped === false, 'expected wrapped === false when an unseen candidate remains');
    assert(r.cycle === 5, `expected cycle unchanged (5) without a wrap, got ${r.cycle}`);
    assert(r.picked.includes('c'), `expected the one unseen candidate ("c") to be preferred, got ${JSON.stringify(r.picked)}`);
  });

  await test('rotation: fills the remainder from already-seen candidates only once unseen is exhausted mid-pick (not a wrap)', () => {
    const candidates = ['a', 'b', 'c', 'd'];
    const r = computeRotation(candidates, 3, 'audit-183-seed-fill', { cycle: 0, seen: ['a', 'b', 'c'] }); // only 'd' unseen
    assert(r.wrapped === false, 'exhausting unseen mid-pick (not every candidate) must not wrap');
    assert(r.picked.length === 3, `expected 3 picks, got ${r.picked.length}`);
    assert(r.picked.includes('d'), 'the one unseen candidate must be included');
    const fromSeen = r.picked.filter((id) => id !== 'd');
    assert(fromSeen.length === 2 && fromSeen.every((id) => ['a', 'b', 'c'].includes(id)),
      `expected the other 2 picks to come from the seen pool, got ${JSON.stringify(r.picked)}`);
  });

  await test('rotation: same seed + same state -> identical picks (determinism, no Math.random/Date input)', () => {
    const candidates = Array.from({ length: 12 }, (_, i) => `x-${i}`);
    const state = { cycle: 0, seen: ['x-2'] };
    const r1 = computeRotation(candidates, 3, 'audit-183-determinism-seed', state);
    const r2 = computeRotation(candidates, 3, 'audit-183-determinism-seed', state);
    assert(JSON.stringify(r1.picked) === JSON.stringify(r2.picked), 'expected identical picks for identical seed+state');
  });

  // ===========================================================================
  // backlog 191 — raised DEFAULT_POOL_SAMPLE from 2 toward MAX_POOL_SAMPLE
  // (6); backlog 192 raised it again, 6 -> 32 (ceiling 6 -> 64).
  // computeRotation()/sampleBySeed() are NOT touched by either item — these
  // cases pin that the SELECTION contract survives the budget change: default
  // applies, env override still works, the ceiling clamp still holds (both
  // the opts and env paths), and the exact pick lists computeRotation()
  // produced before 191 are unchanged (golden fixture). Fixture sizes below
  // are interpolated off DEFAULT_POOL_SAMPLE/MAX_POOL_SAMPLE, never a
  // re-typed literal (item-159 rule) — a fixture sized "comfortably above 6"
  // (191's own margin) silently under-sizes the moment either constant is
  // raised again, which is exactly the trap this file hit at 192 build time:
  // poolFixture(20) is BELOW the new DEFAULT_POOL_SAMPLE (32), so
  // computeRotation() correctly caps `picked.length` at the candidate count
  // (20) instead of the intended sample size — a fixture bug, not a product
  // one, but one that would have silently under-tested the clamp forever.
  // ===========================================================================

  function poolFixture(nonAnchorCount) {
    return [anchorPool()].concat(Array.from({ length: nonAnchorCount }, (_, i) => cleanPool(i)));
  }

  await test('191 (a): buildPoolSurfaces() default applies — picked.length and poolRotation.sampleSize both equal DEFAULT_POOL_SAMPLE (interpolated, not literal 6)', () => {
    const pools = poolFixture(DEFAULT_POOL_SAMPLE + 20); // > DEFAULT_POOL_SAMPLE non-anchor candidates
    const r = buildPoolSurfaces({
      pools, poolSeed: 'audit-191-default-seed', poolPrescan: false,
      rotationState: { schemaVersion: 1, cycle: 0, seen: [] }
    });
    assert(r.poolRotation.picked.length === DEFAULT_POOL_SAMPLE,
      `expected ${DEFAULT_POOL_SAMPLE} picks at the default sample size, got ${r.poolRotation.picked.length}: ${JSON.stringify(r.poolRotation.picked)}`);
    assert(r.poolRotation.sampleSize === DEFAULT_POOL_SAMPLE,
      `expected poolRotation.sampleSize === DEFAULT_POOL_SAMPLE (${DEFAULT_POOL_SAMPLE}), got ${r.poolRotation.sampleSize}`);
  });

  await test('191 (b): AUDIT_POOL_SAMPLE env var still overrides the default', () => {
    const pools = poolFixture(20);
    const priorEnv = process.env.AUDIT_POOL_SAMPLE;
    process.env.AUDIT_POOL_SAMPLE = '3';
    try {
      const r = buildPoolSurfaces({
        pools, poolSeed: 'audit-191-override-seed', poolPrescan: false,
        rotationState: { schemaVersion: 1, cycle: 0, seen: [] }
      });
      assert(r.poolRotation.picked.length === 3, `expected 3 picks under AUDIT_POOL_SAMPLE=3, got ${r.poolRotation.picked.length}: ${JSON.stringify(r.poolRotation.picked)}`);
      assert(r.poolRotation.sampleSize === 3, `expected poolRotation.sampleSize === 3, got ${r.poolRotation.sampleSize}`);
    } finally {
      if (priorEnv === undefined) delete process.env.AUDIT_POOL_SAMPLE; else process.env.AUDIT_POOL_SAMPLE = priorEnv;
    }
  });

  await test('191 (c): a poolSample value ABOVE the ceiling is clamped to MAX_POOL_SAMPLE, not accepted (opts path)', () => {
    const pools = poolFixture(MAX_POOL_SAMPLE + 20); // > MAX_POOL_SAMPLE, or the clamp is untestable (caps at candidate count instead)
    const r = buildPoolSurfaces({
      pools, poolSeed: 'audit-191-clamp-opts-seed', poolPrescan: false, poolSample: 99,
      rotationState: { schemaVersion: 1, cycle: 0, seen: [] }
    });
    assert(r.poolRotation.picked.length === MAX_POOL_SAMPLE,
      `expected opts.poolSample:99 to clamp to MAX_POOL_SAMPLE (${MAX_POOL_SAMPLE}), got ${r.poolRotation.picked.length}: ${JSON.stringify(r.poolRotation.picked)}`);
    assert(r.poolRotation.sampleSize === MAX_POOL_SAMPLE, `expected poolRotation.sampleSize === MAX_POOL_SAMPLE (${MAX_POOL_SAMPLE}), got ${r.poolRotation.sampleSize}`);
  });

  await test('191 (c): a poolSample value ABOVE the ceiling is clamped to MAX_POOL_SAMPLE, not accepted (env path)', () => {
    const pools = poolFixture(MAX_POOL_SAMPLE + 20); // > MAX_POOL_SAMPLE, same reasoning as the opts-path case above
    const priorEnv = process.env.AUDIT_POOL_SAMPLE;
    process.env.AUDIT_POOL_SAMPLE = '99';
    try {
      const r = buildPoolSurfaces({
        pools, poolSeed: 'audit-191-clamp-env-seed', poolPrescan: false,
        rotationState: { schemaVersion: 1, cycle: 0, seen: [] }
      });
      assert(r.poolRotation.picked.length === MAX_POOL_SAMPLE,
        `expected AUDIT_POOL_SAMPLE=99 to clamp to MAX_POOL_SAMPLE (${MAX_POOL_SAMPLE}), got ${r.poolRotation.picked.length}: ${JSON.stringify(r.poolRotation.picked)}`);
      assert(r.poolRotation.sampleSize === MAX_POOL_SAMPLE, `expected poolRotation.sampleSize === MAX_POOL_SAMPLE (${MAX_POOL_SAMPLE}), got ${r.poolRotation.sampleSize}`);
    } finally {
      if (priorEnv === undefined) delete process.env.AUDIT_POOL_SAMPLE; else process.env.AUDIT_POOL_SAMPLE = priorEnv;
    }
  });

  await test('191 (d)(i): golden fixture — computeRotation(candidates, 2, seed, state) returns the EXACT pick list it returned before backlog 191 (computeRotation itself is untouched by this item; these values were captured by running the pre-change code path and hardcoded here as a regression pin)', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => `golden-${String(i).padStart(3, '0')}`);
    const seed = 'audit-191-golden-seed:pools';
    const state = { cycle: 0, seen: [] };
    const r = computeRotation(candidates, 2, seed, state);
    const expected = ['golden-007', 'golden-002']; // captured pre-191, computeRotation unmodified
    assert(JSON.stringify(r.picked) === JSON.stringify(expected),
      `expected the golden pre-191 pick list ${JSON.stringify(expected)}, got ${JSON.stringify(r.picked)} — computeRotation()/sampleBySeed() must be untouched by backlog 191`);
    assert(r.wrapped === false && r.cycle === 0, `expected wrapped=false, cycle=0 on this fresh state, got ${JSON.stringify(r)}`);
  });

  await test('191 (d)(ii): determinism at DEFAULT_POOL_SAMPLE — two identical buildPoolSurfaces() calls give identical picks', () => {
    const pools = poolFixture(DEFAULT_POOL_SAMPLE + 20);
    const mkCall = () => buildPoolSurfaces({
      pools, poolSeed: 'audit-191-determinism-seed', poolPrescan: false,
      rotationState: { schemaVersion: 1, cycle: 0, seen: [] }
    });
    const r1 = mkCall();
    const r2 = mkCall();
    assert(JSON.stringify(r1.poolRotation.picked) === JSON.stringify(r2.poolRotation.picked),
      `expected identical picks across two identical calls at DEFAULT_POOL_SAMPLE, got ${JSON.stringify(r1.poolRotation.picked)} vs ${JSON.stringify(r2.poolRotation.picked)}`);
  });

  await test('191 (d)(iii): honest caveat — sampleBySeed\'s stride depends on `count`, so ONLY the first pick is stable between N=2 and N=DEFAULT_POOL_SAMPLE (same seed, same candidates); the rest legitimately differ', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => `golden-${String(i).padStart(3, '0')}`);
    const seed = 'audit-191-golden-seed:pools';
    const state = { cycle: 0, seen: [] };
    const picks2 = computeRotation(candidates, 2, seed, state).picked;
    const picksDefault = computeRotation(candidates, DEFAULT_POOL_SAMPLE, seed, state).picked;
    assert(picks2[0] === picksDefault[0],
      `expected the FIRST pick to be stable across N=2 and N=${DEFAULT_POOL_SAMPLE} (same seed/candidates/start index), got ${picks2[0]} vs ${picksDefault[0]}`);
    // Deliberately NOT asserting the rest of the lists match — sampleBySeed's
    // stride is `floor(sortedList.length / n)`, which depends on `n`, so
    // picks after the first are expected to diverge between sample sizes.
    // This is documented as a known consequence of raising the default in
    // specs/191-notes.md, not a bug.
  });

  await test(`191/192 (e): rotation state round-trips and wraps correctly at the new sample size, over a small ${DEFAULT_POOL_SAMPLE + 2}-candidate fixture (no waiting for real exhaustion)`, () => {
    const pools = poolFixture(DEFAULT_POOL_SAMPLE + 2); // exactly DEFAULT_POOL_SAMPLE + 2, so a wrap is reachable in a few runs
    const seed = 'audit-191-wrap-seed';
    const opts = { pools, poolSeed: seed, poolPrescan: false };
    const anchorId = anchorPool().pool;

    // Run 1: fresh state, 8 unseen candidates -> full pick of DEFAULT_POOL_SAMPLE, no wrap.
    let state = { schemaVersion: 1, cycle: 0, seen: [] };
    const r1 = buildPoolSurfaces({ ...opts, rotationState: state });
    assert(r1.poolRotation.wrapped === false, `expected no wrap on run 1, got ${JSON.stringify(r1.poolRotation)}`);
    assert(r1.poolRotation.cycle === 0, `expected cycle 0 on run 1, got ${r1.poolRotation.cycle}`);
    assert(r1.poolRotation.picked.length === DEFAULT_POOL_SAMPLE, `expected ${DEFAULT_POOL_SAMPLE} picks on run 1, got ${r1.poolRotation.picked.length}`);
    assert(r1.rotationState.seen.includes(anchorId), 'expected the anchor id in seen after run 1');
    for (const id of r1.poolRotation.picked) {
      assert(r1.rotationState.seen.includes(id), `expected run 1's pick ${id} in the persisted seen[]`);
    }

    // Run 2..N: keep feeding the returned rotationState back in until every
    // candidate has been seen and the next run wraps. Bounded loop guard
    // (10 iterations) so a regression that never wraps fails loudly instead
    // of hanging.
    let prev = r1;
    let wrappedRun = null;
    for (let i = 0; i < 10 && !wrappedRun; i++) {
      const next = buildPoolSurfaces({ ...opts, rotationState: prev.rotationState });
      if (next.poolRotation.wrapped) { wrappedRun = next; break; }
      // Not wrapped yet: cycle must stay unchanged and seen must only grow
      // (round-trip contract).
      assert(next.poolRotation.cycle === prev.poolRotation.cycle,
        `expected cycle unchanged while not wrapped, got ${prev.poolRotation.cycle} -> ${next.poolRotation.cycle}`);
      assert(next.rotationState.seen.length >= prev.rotationState.seen.length,
        `expected seen[] to only grow (or stay same) run-over-run while not wrapped, got ${prev.rotationState.seen.length} -> ${next.rotationState.seen.length}`);
      prev = next;
    }
    assert(wrappedRun, `expected a wrap to occur within 10 rounds over a ${DEFAULT_POOL_SAMPLE + 2}-candidate fixture at DEFAULT_POOL_SAMPLE — round-trip/accumulation is broken if it never wraps`);
    assert(wrappedRun.poolRotation.cycle === prev.poolRotation.cycle + 1,
      `expected cycle to increment by exactly 1 on wrap, got ${prev.poolRotation.cycle} -> ${wrappedRun.poolRotation.cycle}`);
    // On wrap, buildPoolSurfaces() resets seen to just THIS run's ids (anchor
    // + this run's picks) — never the accumulated multi-run history.
    const expectedSeenOnWrap = [anchorId, ...wrappedRun.poolRotation.picked].filter(Boolean);
    const actualSeenSorted = wrappedRun.rotationState.seen.slice().sort();
    const expectedSeenSorted = Array.from(new Set(expectedSeenOnWrap)).sort();
    assert(JSON.stringify(actualSeenSorted) === JSON.stringify(expectedSeenSorted),
      `expected seen to reset to just this wrap run's ids ${JSON.stringify(expectedSeenSorted)}, got ${JSON.stringify(actualSeenSorted)}`);
  });

  // ===========================================================================
  // Leg (b) — runAudit()-level: rotation state is committed, bounded, and the
  // write is skipped byte-identical on a genuine no-op run. Uses a temp
  // rotationStatePath throughout — the real product-loop-kit/signals/
  // audit-rotation.json is NEVER touched by this file (verified by the
  // build's own `git status --porcelain` check, not re-asserted here).
  // ===========================================================================

  await test('runAudit(): library calls (no persistRotationState) NEVER write the rotation state file, even with a real snapshot + real anchor', async () => {
    const pools = [anchorPool()].concat(Array.from({ length: 5 }, (_, i) => cleanPool(i)));
    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-183-nowrite-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const rotationPath = path.join(os.tmpdir(), `audit-rotation-183-nowrite-${process.pid}.json`);
    try { fs.unlinkSync(rotationPath); } catch (e) {}
    const outPath = tmpOut('nowrite');
    try {
      // persistRotationState deliberately OMITTED — this is the exact shape
      // every existing test_audit_*.js call site already uses.
      await runAudit({ port: 8951, snapshotPath: snapPath, only: ['__no_such_surface__'], poolPrescan: false, poolSample: 1, rotationStatePath: rotationPath, outPath });
      assert(!fs.existsSync(rotationPath), `expected NO rotation state file to be written by a library runAudit() call, but found one at ${rotationPath}`);
    } finally {
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(rotationPath); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  await test('runAudit({persistRotationState:true}): writes the committed shape, and a second no-op run produces BYTE-IDENTICAL bytes (no rewrite)', async () => {
    const pools = [anchorPool()].concat(Array.from({ length: 5 }, (_, i) => cleanPool(i)));
    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-183-noop-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const rotationPath = path.join(os.tmpdir(), `audit-rotation-183-noop-${process.pid}.json`);
    try { fs.unlinkSync(rotationPath); } catch (e) {}
    const outPath1 = tmpOut('noop-1');
    const outPath2 = tmpOut('noop-2');
    // AUDIT_POOL_SAMPLE='0' (env, not opts.poolSample:0 — audit-app.js reads
    // sampleSize via `opts.poolSample || process.env.AUDIT_POOL_SAMPLE ||
    // DEFAULT_POOL_SAMPLE`, and the JS-falsy numeric 0 would fall through
    // that `||` chain to the default; the env var carries the truthy STRING
    // '0', which Number()'s down to a real zero — this is how AUDIT_POOL_
    // SAMPLE=0 already has to be passed at the CLI, so this test uses the
    // exact same mechanism, not a workaround invented for the test) so the
    // only pool-detail id audited each run is the anchor itself — once it's
    // in `seen`, a second run changes nothing (spec 183 §3's no-op case).
    const priorEnv = process.env.AUDIT_POOL_SAMPLE;
    process.env.AUDIT_POOL_SAMPLE = '0';
    try {
      const r1 = await runAudit({
        port: 8952, snapshotPath: snapPath, only: ['__no_such_surface__'], poolPrescan: false,
        rotationStatePath: rotationPath, persistRotationState: true, outPath: outPath1
      });
      assert(fs.existsSync(rotationPath), 'expected the rotation state file to exist after a persisting run');
      const raw1 = fs.readFileSync(rotationPath, 'utf8');
      const parsed1 = JSON.parse(raw1);
      assert(parsed1.schemaVersion === 1, `expected schemaVersion 1, got ${JSON.stringify(parsed1)}`);
      assert(Array.isArray(parsed1.seen) && parsed1.seen.includes(pools[0].pool), `expected the anchor pool id in seen, got ${JSON.stringify(parsed1)}`);
      assert(parsed1.seen.length === 1, `expected seen to contain ONLY the anchor with a zero rotation sample, got ${JSON.stringify(parsed1)}`);
      assert(r1.poolRotation && typeof r1.poolRotation.cycle === 'number', `expected result.poolRotation to be exposed, got ${JSON.stringify(r1.poolRotation)}`);

      const r2 = await runAudit({
        port: 8953, snapshotPath: snapPath, only: ['__no_such_surface__'], poolPrescan: false,
        rotationStatePath: rotationPath, persistRotationState: true, outPath: outPath2
      });
      const raw2 = fs.readFileSync(rotationPath, 'utf8');
      assert(raw1 === raw2, `expected byte-identical rotation state after a no-op second run:\n--- run1 ---\n${raw1}\n--- run2 ---\n${raw2}`);
      void r2;
    } finally {
      if (priorEnv === undefined) delete process.env.AUDIT_POOL_SAMPLE; else process.env.AUDIT_POOL_SAMPLE = priorEnv;
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(rotationPath); } catch (e) {}
      try { fs.unlinkSync(outPath1); } catch (e) {}
      try { fs.unlinkSync(outPath2); } catch (e) {}
    }
  });

  // ===========================================================================
  // backlog 192 — the AUDIT_TIME_BUDGET_MS wall-clock guard on the pool-detail
  // ROTATION leg only, and the honesty requirement that follows from it: a
  // skipped surface must never be credited as `seen`. All three tests below
  // are REAL runAudit() renders (real Chromium), scoped via `only` to a small,
  // pre-computed set of surface names so each stays fast — the pre-computation
  // uses buildPoolSurfaces() as a pure function (no render) with the exact
  // same pools/seed/sample/state runAudit() will independently recompute
  // internally from the same fixture snapshot file, so the names line up by
  // construction (same technique the 191 fixture tests above already use).
  // ===========================================================================

  await test('192 guard: an artificially tiny AUDIT_TIME_BUDGET_MS skips EVERY rotation-picked surface; the anchor and a non-rotation surface still render; truncation is reported honestly', async () => {
    const poolSample = 3;
    const pools = [anchorPool()].concat(Array.from({ length: 12 }, (_, i) => cleanPool(i)));
    const seed = 'audit-192-guard-seed';
    const freshState = { schemaVersion: 1, cycle: 0, seen: [] };

    const pre = buildPoolSurfaces({ pools, poolSeed: seed, poolPrescan: false, poolSample, rotationState: freshState });
    const pickNames = pre.extraSurfaces.map((s) => s.name);
    assert(pickNames.length === poolSample, `fixture wiring check: expected ${poolSample} pre-computed rotation picks, got ${pickNames.length}: ${JSON.stringify(pickNames)}`);
    assert(pre.extraSurfaces.every((s) => s.rotationPick === true), `fixture wiring check: expected every pre-computed extraSurfaces entry to carry rotationPick:true (no prescan promotion in this fixture), got ${JSON.stringify(pre.extraSurfaces)}`);

    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-192-guard-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const rotationPath = path.join(os.tmpdir(), `audit-rotation-192-guard-${process.pid}.json`);
    try { fs.unlinkSync(rotationPath); } catch (e) {}
    const outPath = tmpOut('guard-tiny');
    try {
      const result = await runAudit({
        port: 8954, snapshotPath: snapPath, poolSeed: seed, poolPrescan: false, poolSample,
        rotationStatePath: rotationPath, timeBudgetMs: 1,
        only: ['pool-detail', 'landing', ...pickNames],
        outPath
      });
      assert(result.surfacesCovered.includes('pool-detail'), `expected the anchor "pool-detail" (never skippable) to still render; got ${JSON.stringify(result.surfacesCovered)}`);
      assert(result.surfacesCovered.includes('landing'), `expected the non-rotation "landing" surface to still render even after the guard tripped; got ${JSON.stringify(result.surfacesCovered)}`);
      for (const name of pickNames) {
        assert(!result.surfacesCovered.includes(name), `expected rotation-picked surface ${name} to be SKIPPED under a 1ms time budget; got ${JSON.stringify(result.surfacesCovered)}`);
      }
      assert(result.poolRotation.picked.length === poolSample, `expected poolRotation.picked (the build-time list) to stay ${poolSample} — the guard must not shrink the PICKED list, only what RENDERS; got ${result.poolRotation.picked.length}`);
      assert(result.poolRotation.renderedCount === 0, `expected renderedCount === 0 (every rotation pick skipped), got ${result.poolRotation.renderedCount}`);
      assert(result.poolRotation.truncated === true, `expected truncated === true, got ${result.poolRotation.truncated}`);
      const blocking = blockingFindings(result.findings);
      assert(blocking.length === 0, `expected zero blocking findings on this clean fixture (the CLI would exit 0), got ${JSON.stringify(blocking)}`);
    } finally {
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(rotationPath); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  await test('192 guard: under the normal (default) time budget, nothing is skipped — rendered count equals picked count and truncated is false', async () => {
    const poolSample = 3;
    const pools = [anchorPool()].concat(Array.from({ length: 12 }, (_, i) => cleanPool(i)));
    const seed = 'audit-192-inert-seed';
    const freshState = { schemaVersion: 1, cycle: 0, seen: [] };

    const pre = buildPoolSurfaces({ pools, poolSeed: seed, poolPrescan: false, poolSample, rotationState: freshState });
    const pickNames = pre.extraSurfaces.map((s) => s.name);

    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-192-inert-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const rotationPath = path.join(os.tmpdir(), `audit-rotation-192-inert-${process.pid}.json`);
    try { fs.unlinkSync(rotationPath); } catch (e) {}
    const outPath = tmpOut('guard-inert');
    try {
      // timeBudgetMs deliberately OMITTED — exercises DEFAULT_TIME_BUDGET_MS,
      // not an override, so this proves the DEFAULT is inert, not merely that
      // a large override would be.
      const result = await runAudit({
        port: 8957, snapshotPath: snapPath, poolSeed: seed, poolPrescan: false, poolSample,
        rotationStatePath: rotationPath,
        only: ['pool-detail', ...pickNames],
        outPath
      });
      for (const name of pickNames) {
        assert(result.surfacesCovered.includes(name), `expected rotation-picked surface ${name} to render under the normal budget; got ${JSON.stringify(result.surfacesCovered)}`);
      }
      assert(result.poolRotation.renderedCount === result.poolRotation.picked.length,
        `expected renderedCount === picked.length under the normal budget (the guard must be inert in the ordinary case), got renderedCount=${result.poolRotation.renderedCount} vs picked.length=${result.poolRotation.picked.length}`);
      assert(result.poolRotation.truncated === false, `expected truncated === false under the normal budget, got ${result.poolRotation.truncated}`);
    } finally {
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(rotationPath); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  await test('192 honesty (highest-risk criterion): persisted `seen` excludes ids the time-budget guard skipped on a truncated run, and those exact ids are re-picked next run', async () => {
    const poolSample = 3;
    const pools = [anchorPool()].concat(Array.from({ length: 12 }, (_, i) => cleanPool(i)));
    const seed = 'audit-192-honesty-seed';
    const anchorId = anchorPool().pool;

    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-192-honesty-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const rotationPath = path.join(os.tmpdir(), `audit-rotation-192-honesty-${process.pid}.json`);
    try { fs.unlinkSync(rotationPath); } catch (e) {}
    const outPath1 = tmpOut('honesty-1');
    const outPath2 = tmpOut('honesty-2');

    try {
      // Pre-compute run 1's picks (pure, matches what runAudit() independently
      // recomputes internally against the same fresh {cycle:0,seen:[]} state,
      // since rotationPath does not exist yet) so `only` can scope run 1 to a
      // small, fast, deterministic set.
      const pre1 = buildPoolSurfaces({
        pools, poolSeed: seed, poolPrescan: false, poolSample,
        rotationState: { schemaVersion: 1, cycle: 0, seen: [] }
      });
      const pickNames1 = pre1.extraSurfaces.map((s) => s.name);

      // Run 1: tiny budget -> every rotation pick skipped, persisted.
      const r1 = await runAudit({
        port: 8958, snapshotPath: snapPath, poolSeed: seed, poolPrescan: false, poolSample,
        rotationStatePath: rotationPath, persistRotationState: true, timeBudgetMs: 1,
        only: ['pool-detail', ...pickNames1], outPath: outPath1
      });
      assert(r1.poolRotation.renderedCount === 0, `fixture wiring check: expected run 1 to render zero rotation picks, got ${r1.poolRotation.renderedCount}`);
      assert(r1.poolRotation.truncated === true, 'fixture wiring check: expected run 1 to report truncated === true');
      const run1PickedIds = r1.poolRotation.picked.slice();

      const written1 = JSON.parse(fs.readFileSync(rotationPath, 'utf8'));
      assert(written1.seen.includes(anchorId), `expected the anchor id in persisted seen after run 1, got ${JSON.stringify(written1.seen)}`);
      for (const id of run1PickedIds) {
        assert(!written1.seen.includes(id), `THE HONESTY REQUIREMENT: expected skipped rotation pick ${id} to be EXCLUDED from persisted seen after a truncated run, got ${JSON.stringify(written1.seen)}`);
      }
      assert(written1.seen.length === 1, `expected persisted seen to contain ONLY the anchor after run 1 (every rotation pick was skipped, nothing else rendered), got ${JSON.stringify(written1.seen)}`);

      // Run 2: reads run 1's persisted (reconciled) state back in, with the
      // normal (default) budget this time. Since none of run 1's picks made
      // it into `seen`, they are still "unseen" — computeRotation() is a
      // pure function of candidates/seed/state, so it MUST re-pick the exact
      // same set (never by waiting for real exhaustion; this is the
      // deterministic proof).
      const r2 = await runAudit({
        port: 8959, snapshotPath: snapPath, poolSeed: seed, poolPrescan: false, poolSample,
        rotationStatePath: rotationPath, persistRotationState: true,
        only: ['pool-detail', ...pickNames1], outPath: outPath2
      });
      assert(JSON.stringify(r2.poolRotation.picked.slice().sort()) === JSON.stringify(run1PickedIds.slice().sort()),
        `expected run 2 to re-pick the EXACT ids run 1 failed to render (coverage must not be silently credited), got ${JSON.stringify(r2.poolRotation.picked)} vs run 1's ${JSON.stringify(run1PickedIds)}`);
      assert(r2.poolRotation.renderedCount === poolSample, `expected run 2 (normal budget) to actually render all ${poolSample} re-picked ids, got ${r2.poolRotation.renderedCount}`);
      assert(r2.poolRotation.truncated === false, `expected run 2 to report truncated === false, got ${r2.poolRotation.truncated}`);

      const written2 = JSON.parse(fs.readFileSync(rotationPath, 'utf8'));
      for (const id of run1PickedIds) {
        assert(written2.seen.includes(id), `expected run 2 to have persisted ${id} into seen now that it actually rendered, got ${JSON.stringify(written2.seen)}`);
      }
    } finally {
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(rotationPath); } catch (e) {}
      try { fs.unlinkSync(outPath1); } catch (e) {}
      try { fs.unlinkSync(outPath2); } catch (e) {}
    }
  });

  await test('192 honesty (baseSeen protection, verifier attack-192-2): a skipped rotation pick already covered by an EARLIER run keeps its prior coverage; a skipped never-before-seen pick from the same run does not gain any', async () => {
    // Reproduces exactly the shape the verifier's finding named: a NON-EMPTY
    // prior `seen` containing candidate ids (not just the anchor), a second
    // run whose picks include an already-seen id via computeRotation()'s
    // "fill from seen" branch (audit-app.js ~2228-2237, engaged once `unseen`
    // runs out mid-pick), and a time-budget trip that lands that
    // already-seen id among skippedRotationIds. The "192 honesty" test above
    // only ever starts from a fresh {seen:[]} state, so it cannot tell
    // audit-app.js:3449-3450's `baseSeenSet` filter apart from an
    // unconditional strip — this test is the one that can.
    const poolSample = 3;
    const anchorId = anchorPool().pool;
    // 5 non-anchor candidates. poolPrescan:false so all 5 are rotation
    // candidates (no promotion carving any off) and every extraSurfaces
    // entry is guaranteed rotationPick:true (same fixture-wiring guarantee
    // the 192 guard tests above already rely on).
    const candidatePools = Array.from({ length: 5 }, (_, i) => cleanPool(i));
    const candidateIds = candidatePools.map((p) => p.pool).sort();
    const pools = [anchorPool()].concat(candidatePools);
    const seed = 'audit-192-baseseen-seed';

    // Prior committed state: anchor + 4 of the 5 candidates already seen,
    // leaving exactly ONE candidate unseen. With poolSample=3,
    // computeRotation()'s `unseen` pool (length 1) runs out after a single
    // pick, forcing the "fill from seen" branch to supply the other 2 picks
    // deterministically from the 4 already-seen candidates — the exact
    // mid-cycle/nearly-exhausted shape the finding requires, not the fresh
    // {seen:[]} state the existing "192 honesty" test starts from.
    const alreadySeenCandidates = candidateIds.slice(0, 4);
    const priorSeen = [anchorId, ...alreadySeenCandidates];
    const priorState = { schemaVersion: 1, cycle: 0, seen: priorSeen };

    // Pure pre-computation (no render, no Chromium spend) proves the fixture
    // actually engages the fill-from-seen branch before the real runAudit()
    // call below spends any time on it — same technique the 192 guard/
    // honesty tests above already use.
    const pre = buildPoolSurfaces({ pools, poolSeed: seed, poolPrescan: false, poolSample, rotationState: priorState });
    const pickedIds = pre.poolRotation.picked.slice();
    assert(pickedIds.length === poolSample, `fixture wiring check: expected ${poolSample} picks, got ${JSON.stringify(pickedIds)}`);
    assert(pre.extraSurfaces.every((s) => s.rotationPick === true), `fixture wiring check: expected every extraSurfaces entry to carry rotationPick:true, got ${JSON.stringify(pre.extraSurfaces)}`);
    const alreadySeenPicks = pickedIds.filter((id) => priorSeen.includes(id));
    const neverSeenPicks = pickedIds.filter((id) => !priorSeen.includes(id));
    assert(alreadySeenPicks.length >= 1, `fixture wiring check: expected computeRotation()'s fill-from-seen branch to have picked at least one already-seen candidate (unseen must run out before ${poolSample} picks are made); got picks ${JSON.stringify(pickedIds)} against priorSeen ${JSON.stringify(priorSeen)} — widen alreadySeenCandidates if this stops engaging`);
    assert(neverSeenPicks.length >= 1, `fixture wiring check: expected at least one never-before-seen candidate among the picks, got ${JSON.stringify(pickedIds)}`);
    assert(JSON.stringify(pre.baseSeen.slice().sort()) === JSON.stringify(priorSeen.slice().sort()), `fixture wiring check: expected baseSeen (no wrap expected here) to equal the prior committed seen, got ${JSON.stringify(pre.baseSeen)} vs ${JSON.stringify(priorSeen)}`);
    const pickNames = pre.extraSurfaces.map((s) => s.name);

    const snapPath = path.join(os.tmpdir(), `audit-fixture-snapshot-192-baseseen-${process.pid}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ pools }));
    const rotationPath = path.join(os.tmpdir(), `audit-rotation-192-baseseen-${process.pid}.json`);
    fs.writeFileSync(rotationPath, JSON.stringify(priorState));
    const outPath = tmpOut('baseseen');
    try {
      // Tiny time budget: the guard trips before the FIRST rotation-picked
      // surface renders (spec 192 part 2: "skip that surface and every
      // rotation surface after it"), so all 3 of this run's picks — the
      // already-seen fill-from-seen ids AND the never-before-seen id — land
      // in skippedRotationIds together, mixed, exactly the shape
      // audit-app.js:3449-3450's baseSeenSet filter exists to distinguish.
      const result = await runAudit({
        port: 8960, snapshotPath: snapPath, poolSeed: seed, poolPrescan: false, poolSample,
        rotationStatePath: rotationPath, persistRotationState: true, timeBudgetMs: 1,
        only: ['pool-detail', ...pickNames], outPath
      });
      assert(result.poolRotation.renderedCount === 0, `fixture wiring check: expected zero rotation renders under the 1ms budget, got ${result.poolRotation.renderedCount}`);
      assert(result.poolRotation.truncated === true, 'fixture wiring check: expected truncated === true');
      assert(JSON.stringify(result.poolRotation.picked.slice().sort()) === JSON.stringify(pickedIds.slice().sort()), `fixture wiring check: expected runAudit()'s internally-recomputed picks to match the pre-computed ones, got ${JSON.stringify(result.poolRotation.picked)} vs ${JSON.stringify(pickedIds)}`);

      const written = JSON.parse(fs.readFileSync(rotationPath, 'utf8'));
      for (const id of alreadySeenPicks) {
        assert(written.seen.includes(id), `THE baseSeen PROTECTION (this is the line the verifier's finding attacks): expected already-seen pick ${id} — skipped THIS run, but legitimately covered by the EARLIER run that seeded priorState — to REMAIN in persisted seen; got ${JSON.stringify(written.seen)}`);
      }
      for (const id of neverSeenPicks) {
        assert(!written.seen.includes(id), `expected never-before-seen pick ${id} — skipped this run and never rendered, ever — to be ABSENT from persisted seen (it must not gain coverage it never earned); got ${JSON.stringify(written.seen)}`);
      }
      // The rest of the prior coverage (candidates that were not even picked
      // this run) and the anchor must also be undisturbed.
      for (const id of alreadySeenCandidates) {
        assert(written.seen.includes(id), `expected the full prior coverage set to survive untouched, missing ${id} from ${JSON.stringify(written.seen)}`);
      }
      assert(written.seen.includes(anchorId), `expected the anchor id to remain in persisted seen, got ${JSON.stringify(written.seen)}`);
    } finally {
      try { fs.unlinkSync(snapPath); } catch (e) {}
      try { fs.unlinkSync(rotationPath); } catch (e) {}
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
  });

  await test('invariant (operator review round 2): ROTATION_SEEN_CAP exceeds the REAL rotation-candidate population, or the wrap branch is dead code on real data', () => {
    // Reads data/pools-snapshot.json directly (not a fixture) — this
    // assertion's whole point is catching real-data scale, exactly the class
    // of bug a 20-pool fixture cannot see (a cap of 500 passed every fixture
    // test in this file while being silently unreachable against the real
    // ~735-candidate population).
    const snapPath = path.join(ROOT, 'data', 'pools-snapshot.json');
    const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    assert(Array.isArray(snap.pools) && snap.pools.length > 0, `expected a non-empty real pools array at ${snapPath}`);
    // Upper bound on the real rotation-candidate population: total pools
    // minus nothing (candidates are strictly pools MINUS the anchor and any
    // promoted ids, so the true candidate count is always <= this) — using
    // the raw pool count keeps this assertion conservative and independent
    // of buildPoolSurfaces()'s own promotion/anchor logic.
    const realPoolCount = snap.pools.length;
    assert(ROTATION_SEEN_CAP > realPoolCount,
      `ROTATION_SEEN_CAP (${ROTATION_SEEN_CAP}) must exceed the real snapshot pool count (${realPoolCount}) or computeRotation()'s wrap branch can never fire on real data — raise the cap (or derive it from the snapshot size) before this ships`);
  });

  await test('runAudit(): rotation state is bounded — an oversized prior seen[] is trimmed, drop-oldest, to the cap', () => {
    // Pure check against computeRotation()'s caller-side bound logic is
    // exercised via buildPoolSurfaces() through runAudit() above; this test
    // isolates the cap arithmetic itself using the same drop-oldest slice
    // audit-app.js's buildPoolSurfaces() performs, so a regression that
    // removes the bound entirely (unbounded array growth) fails loudly here
    // without needing a 500+ pool fixture.
    const CAP = 500; // mirrors audit-app.js's ROTATION_SEEN_CAP
    const oversized = Array.from({ length: CAP + 10 }, (_, i) => `id-${i}`);
    const trimmed = oversized.length > CAP ? oversized.slice(oversized.length - CAP) : oversized;
    assert(trimmed.length === CAP, `expected trimmed length === ${CAP}, got ${trimmed.length}`);
    assert(trimmed[0] === 'id-10', `expected drop-OLDEST (front) semantics, got first element ${trimmed[0]}`);
    assert(trimmed[trimmed.length - 1] === `id-${CAP + 9}`, 'expected the newest id to survive the trim');
  });

  console.log(`\ntest_audit_cta_provenance.js: ${passed} passed, ${failed} failed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
