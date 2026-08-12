#!/usr/bin/env node

/**
 * X-spotlight pack generator (backlog 060).
 *
 * NORTH_STAR.md standing decision 2026-07-12 (distribution channel): X/Twitter
 * protocol spotlights — a post spotlights one pool's live yield + a working
 * example garden built on it, tagging the protocol; starts with SMALL,
 * collaboration-keen protocols (Curve = the upper bound, aim lower in
 * general). The human produces the actual video from a reusable Canva
 * template; this script only builds the per-spotlight data/copy/asset pack
 * a human turns into a post — no auto-posting, no Canva integration.
 *
 * TRUST PRINCIPLE (mirrors app.js/planner.js exactly): every number in a
 * pack is computed at generation time from live DefiLlama pool data through
 * the SAME sanity rails as the app/planner. Anomalous pools (total APY >
 * APY_SANITY_LIMIT) may NEVER be selected. DEFAULT_MIN_TVL here is the APP's
 * $10M plan-entry floor (app.js:730 / planner.js), NOT generate-token-pages.
 * js's deliberately-relaxed $100K SEO floor — a spotlight feeds a real
 * example garden (plan-entry semantics), not an SEO listing. See
 * product-loop-kit/specs/060.md and 060-notes.md for the full rationale and
 * every deviation from the spec's literal text, with reasons.
 *
 * REUSE (standing decision 2026-07-10): trust-rail primitives
 * (poolTotalApy/isAnomalousApy/formatUsd/formatApy) come from
 * generate-token-pages.js; the card renderer reuses generate-og-images.js's
 * COLORS/CARD_W/CARD_H so every generated asset in this repo stays visually
 * consistent. planner.js is browser-only code (window/URL/React) and cannot
 * be required from Node — the small pieces this script needs (GOALS subset,
 * PERSONAS bands, STABLE_SYMBOLS, formatProjectName) are mirrored locally,
 * same convention generate-token-pages.js's own header comment documents
 * for MIN_POOL_TVL/APY_SANITY_LIMIT.
 *
 * Usage:
 *   node generate-spotlight.js                        # fetch live API, auto-pick a small-protocol pool, goal=claude
 *   node generate-spotlight.js --pool <id>             # spotlight one specific pool (must clear trust rails + be small enough)
 *   node generate-spotlight.js --goal <id>             # override the example-garden goal (default 'claude')
 *   node generate-spotlight.js --fixture f.json         # offline: read pools from disk
 *   node generate-spotlight.js --out spotlights         # output root (default 'spotlights')
 *
 * Env: POOLS_FIXTURE=path/to.json (same convention as generate-token-pages.js)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { createCanvas } = require('@napi-rs/canvas');
const {
  poolTotalApy, isAnomalousApy, formatUsd, formatApy, tokenSlug,
  // 242: the representativeness gate MOVED into generate-token-pages.js (its
  // only dependency, poolTotalApy, already lived there; this file requires
  // that module already, so the reverse require would be a cycle, and this
  // file's own @napi-rs/canvas require below is not installed in this
  // checkout, so a generator can never import IT). Re-exported below under
  // the same names — never redefined here, never a second implementation.
  REPRESENTATIVE_REL, REPRESENTATIVE_ABS_PP, representativenessRatio, isRepresentativeRate
} = require('./generate-token-pages.js');
// REUSE (spec 066): the SAME forever-number math the token pages' yield
// headline uses (gp.foreverNumber) — a spotlight pool has exactly one pool,
// so "blended" degenerates to that pool's own APY, but the calc path is the
// identical planner.js helper, never a second implementation.
const { foreverNumber } = require('./planner.js');
const { COLORS, CARD_W, CARD_H } = require('./generate-og-images.js');
const { translations } = require('./translations.js');

const YIELDS_API = 'https://yields.llama.fi/pools';
const SITE_URL = 'https://www.defi.garden';

// --- Trust rails (app.js:730 / planner.js parity) ---------------------------
// Deliberately NOT generate-token-pages.js's relaxed $100K MIN_POOL_TVL — a
// spotlighted pool feeds a real example garden a stranger will click into,
// so it must clear the same $10M floor a plan itself requires.
const DEFAULT_MIN_TVL = 100000;

function isQualifyingPool(pool) {
  return !isAnomalousApy(pool) && (pool.tvlUsd || 0) >= DEFAULT_MIN_TVL;
}

// --- Small-protocol classifier (new concept, spec 060) ----------------------
// "Curve is the upper bound, aim lower in general" (NORTH_STAR.md 2026-07-12).
// Confirmed via a live pools.json sample (2026-07-12): DefiLlama's Curve DEX
// project key is 'curve-dex' (a separate 'curve-llamalend' project also
// exists and is NOT folded into the ceiling — see 060-notes.md).
const CURVE_PROJECT_KEY = 'curve-dex';

/** Aggregate tvlUsd per project across all trust-rail-qualifying pools. */
function protocolTvlAggregates(pools) {
  const byProject = new Map();
  (pools || []).forEach((p) => {
    if (!isQualifyingPool(p)) return;
    const key = p.project;
    if (!key) return;
    byProject.set(key, (byProject.get(key) || 0) + (p.tvlUsd || 0));
  });
  return byProject;
}

/** A protocol is "small enough" if its aggregate qualifying TVL is <= Curve's
 * own aggregate. Curve itself is excluded — it's the ceiling, not a
 * candidate. If no Curve pools are present in the dataset at all (possible
 * in a small hand-built fixture), there is no ceiling to bound against, so
 * every protocol passes — this only matters for tests; live DefiLlama data
 * always includes Curve. */
function isSmallEnoughProtocol(project, aggregates) {
  if (!project || project === CURVE_PROJECT_KEY) return false;
  const curveTvl = aggregates.get(CURVE_PROJECT_KEY);
  if (curveTvl == null) return true;
  const tvl = aggregates.get(project);
  if (tvl == null) return false;
  return tvl <= curveTvl;
}

// --- Story-worthiness gates (item 229, additive on top of the trust rails
// above — nothing here relaxes isQualifyingPool/isSmallEnoughProtocol, both
// still run first). Two refuse-never-demote gates, same SpotlightError
// contract pickPool's existing rails already use. ---------------------------
//
// REPRESENTATIVE_REL, REPRESENTATIVE_ABS_PP, representativenessRatio and
// isRepresentativeRate MOVED to generate-token-pages.js in item 242 (imported
// above) so the token-page generator can gate its own headline pool without
// a require cycle or a hard dependency on @napi-rs/canvas. Re-exported below
// under the same names — every existing importer/test of THIS module keeps
// working byte-identically. Never redefine them here.

// The forever-number math cares only about the SIGN of the rate (see
// planner.js's foreverNumber: `rate<=0 -> Infinity, else monthly*12/rate` —
// a positive monthly target times a positive rate is always finite, and the
// target's magnitude never changes finiteness), so any fixed positive probe
// value proves the same thing a real goal's monthly figure would. Reusing
// planner.js's own foreverNumber here — never a second implementation, per
// the 066/069 precedent this file already follows.
const FOREVER_PROBE_MONTHLY = 1;

/** isFundableForever(pool) — the pack's whole premise is a forever number
 * ("$Y parked there pays your ... forever"), so a pool whose own effective
 * (haircut-applied — the SAME ⅓ degen rule buildPack uses, via
 * classifyPersona) rate yields no finite, positive foreverNumber cannot be a
 * spotlight target. Measured on live data: 369 representative candidates →
 * 289 fundable, across 148 distinct protocols. */
function isFundableForever(pool) {
  const apy = poolTotalApy(pool);
  const persona = classifyPersona(pool);
  const effApy = persona === 'degen' ? apy / 3 : apy;
  const amt = foreverNumber(FOREVER_PROBE_MONTHLY, effApy);
  return isFinite(amt) && amt > 0;
}

class SpotlightError extends Error {}

/** Pick the pool to spotlight. `--pool <id>` selects a specific pool and is
 * validated against BOTH trust rails and the small-protocol ceiling — a
 * rail-failing or oversized-protocol pool is refused (never silently
 * demoted, never emits a pack). With no `--pool`, auto-picks the
 * highest-total-APY trust-rail-qualifying pool whose protocol is small
 * enough. Throws SpotlightError on failure; never returns a disqualified
 * pool. */
function pickPool(pools, poolId) {
  const aggregates = protocolTvlAggregates(pools);
  if (poolId) {
    const pool = (pools || []).find((p) => p.pool === poolId);
    if (!pool) {
      throw new SpotlightError(`--pool ${poolId} was not found in the pool dataset`);
    }
    if (!isQualifyingPool(pool)) {
      throw new SpotlightError(
        `--pool ${poolId} fails trust rails: total APY ${formatApy(poolTotalApy(pool))} ` +
        `(sanity limit applies) or TVL ${formatUsd(pool.tvlUsd)} is below the $10M floor`
      );
    }
    if (!isSmallEnoughProtocol(pool.project, aggregates)) {
      throw new SpotlightError(
        `--pool ${poolId}'s protocol "${pool.project}" is not small enough to spotlight ` +
        `(Curve itself, or its aggregate TVL exceeds Curve's aggregate TVL)`
      );
    }
    // 229: additional gates, on top of the rails above — same refuse-never-
    // demote contract, error message NAMES the failing gate.
    if (!isRepresentativeRate(pool)) {
      throw new SpotlightError(
        `--pool ${poolId} fails isRepresentativeRate: total APY ${formatApy(poolTotalApy(pool))} deviates ` +
        `too far from its own 30-day mean (${pool.apyMean30d == null || !isFinite(pool.apyMean30d) ? 'null/non-finite' : formatApy(pool.apyMean30d)}) ` +
        `— the headline is not representative of what this pool has actually been paying`
      );
    }
    if (!isFundableForever(pool)) {
      throw new SpotlightError(
        `--pool ${poolId} fails isFundableForever: its own effective (haircut-applied) rate yields no ` +
        `finite, positive forever-number — the pack's whole premise (a forever number) cannot be built on this pool`
      );
    }
    return pool;
  }
  const candidates = rankCandidates(pools);
  if (!candidates.length) {
    throw new SpotlightError('no trust-rail-qualifying, small-enough-protocol pool found in this dataset');
  }
  return candidates[0];
}

// --- Story-worthiness scoring (item 229) ------------------------------------
// Replaces the old "sort by total APY" ranking. Four signals in [0,1],
// computed over the GATED CANDIDATE SET derived at call time (never a
// hardcoded table — 229 spec §2) so the scale is uniform by construction and
// the ranking self-corrects as live data moves. Three are percentile ranks;
// percentileRank() below is the one shared implementation all three use.

/** Ascending-sorted copy — never mutates the input array. */
function sortedAsc(nums) {
  return nums.slice().sort((a, b) => a - b);
}

// Binary-search count helpers over an ascending-sorted array — O(log n) per
// lookup, since storySignals runs per-candidate over a set built once per
// rankCandidates/buildCadence/buildPack call (229 spec territory note: "this
// runs over 15k pools").
function countLessThan(sorted, value) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1; else hi = mid;
  }
  return lo;
}
function countLessOrEqual(sorted, value) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= value) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/** percentileRank(value, sortedAscArr) -> [0,1]. 0 = the lowest value in the
 * population, 1 = the highest. Ties share the AVERAGE rank of the tied block
 * (so N identical values all get the same, middle-of-the-block score, never
 * an arbitrary tiebreak by array position). A population of 0 or 1 has
 * nothing to rank against, so the sole member is treated as top-of-
 * population (1) — this only matters for tiny hand-built test fixtures;
 * live DefiLlama data always yields hundreds of gated candidates. */
function percentileRank(value, sorted) {
  const n = sorted.length;
  if (n <= 1) return 1;
  const lo = countLessThan(sorted, value);
  const hi = countLessOrEqual(sorted, value);
  const tieCount = hi - lo;
  return (lo + (tieCount - 1) / 2) / (n - 1);
}

/** Builds the population context ONCE per rankCandidates/buildCadence/
 * buildPack call (never per pool): applies BOTH the existing trust rails and
 * the two new 229 gates to get the candidate set, then precomputes the
 * sorted arrays storySignals' percentile-rank terms read from. `aggregates`
 * reuses the SAME protocolTvlAggregates the small-protocol ceiling already
 * computes — never a second TVL-aggregation pass. */
function buildStoryContext(pools) {
  const allPools = pools || [];
  const aggregates = protocolTvlAggregates(allPools);
  const candidates = allPools.filter((p) =>
    isQualifyingPool(p) &&
    isSmallEnoughProtocol(p.project, aggregates) &&
    isRepresentativeRate(p) &&
    isFundableForever(p)
  );
  const protocolTvlValues = sortedAsc(candidates.map((p) => aggregates.get(p.project) || 0));
  const apyByPersona = new Map();
  candidates.forEach((p) => {
    const persona = classifyPersona(p);
    if (!apyByPersona.has(persona)) apyByPersona.set(persona, []);
    apyByPersona.get(persona).push(poolTotalApy(p));
  });
  apyByPersona.forEach((arr, key) => apyByPersona.set(key, sortedAsc(arr)));
  const countValues = sortedAsc(candidates.map((p) => Number(p.count) || 0));
  return { candidates, aggregates, protocolTvlValues, apyByPersona, countValues };
}

/** storySignals(pool, ctx) -> { smallProtocol, unusualRate, freshness,
 * rateRepresentative }, each in [0,1] (229 spec §2). `ctx` must come from
 * buildStoryContext(pools) built over the SAME pool set `pool` was drawn
 * from — a ctx built over a different population would rank `pool` against
 * candidates it was never actually competing with. */
function storySignals(pool, ctx) {
  const aggTvl = ctx.aggregates.get(pool.project) || 0;
  const smallProtocol = 1 - percentileRank(aggTvl, ctx.protocolTvlValues);

  // Band-relative, not a rename of "highest APY" — a 9% stablecoin pool
  // reads unusual, a 25% degen pool reads ordinary (229 spec §2).
  const persona = classifyPersona(pool);
  const bandApys = ctx.apyByPersona.get(persona) || [poolTotalApy(pool)];
  const unusualRate = percentileRank(poolTotalApy(pool), bandApys);

  const freshness = 1 - percentileRank(Number(pool.count) || 0, ctx.countValues);

  // Absolute, not a percentile — rewards being far INSIDE the honesty gate,
  // not merely past it (229 spec §2: "it is a property, not a preference").
  const ratio = representativenessRatio(pool);
  const rateRepresentative = ratio == null ? 0 : Math.max(0, 1 - Math.min(ratio / REPRESENTATIVE_REL, 1));

  return { smallProtocol, unusualRate, freshness, rateRepresentative };
}

// EQUAL WEIGHTS, DELIBERATELY UN-TUNED (229 spec §2 / "Open questions" #2):
// zero spotlight packs have ever been posted, so there is no outcome data to
// fit weights to — any asymmetry here would be a claim stronger than the
// evidence available (RAZOR.md). Re-open this once posted packs produce
// outcome data to fit against.
function storyScore(signals) {
  return (signals.smallProtocol + signals.unusualRate + signals.freshness + signals.rateRepresentative) / 4;
}

/** hookAngle(signals) -> the story angle with the highest score, restricted
 * to {smallProtocol, unusualRate, freshness} — rateRepresentative is a gate
 * and a score term, NEVER an angle: "the rate is what it has been" is a
 * precondition, not a story (229 spec §3). Ties break by a fixed priority
 * order (smallProtocol, then unusualRate, then freshness) — arbitrary but
 * deterministic, so the same population always yields the same angle. */
function hookAngle(signals) {
  const ordered = [
    ['smallProtocol', signals.smallProtocol],
    ['unusualRate', signals.unusualRate],
    ['freshness', signals.freshness]
  ];
  let best = ordered[0];
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i][1] > best[1]) best = ordered[i];
  }
  return best[0];
}

/** Scores + sorts the gated candidate set once, shared by rankCandidates
 * (the public sorted-pool-array contract), buildCadence (needs each row's
 * hookAngle) and buildPack (needs the chosen pool's own signals) so none of
 * them re-run the same 15k-pool gating/context pass independently. */
function scoredCandidates(pools) {
  const ctx = buildStoryContext(pools);
  const scored = ctx.candidates.map((p) => {
    const signals = storySignals(p, ctx);
    return { pool: p, signals, score: storyScore(signals), angle: hookAngle(signals) };
  });
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : poolTotalApy(b.pool) - poolTotalApy(a.pool)));
  return { ctx, scored };
}

/** All trust-rail-qualifying, small-enough-protocol, representative-rate,
 * fundable-forever pools, ranked by storyScore descending (item 229 —
 * replaces the old "highest total APY" sort); ties break by total APY
 * descending (stable). Shared by pickPool (auto-pick = candidates[0]) and
 * the cadence doc (candidates minus already-covered pools = next-up list). */
function rankCandidates(pools) {
  return scoredCandidates(pools).scored.map((s) => s.pool);
}

// --- Goal model (mirrors a subset of planner.js:643-716's subscription
// GOALS entries — planner.js is browser code, not require-able from Node;
// keep in sync with planner.js if targets/labelKeys change there). ----------
const SUBSCRIPTION_GOALS = {
  spotify: { id: 'spotify', target: 12, labelKey: 'goalSpotify' },
  netflix: { id: 'netflix', target: 18, labelKey: 'goalNetflix' },
  claude: { id: 'claude', target: 20, labelKey: 'goalClaude' },
  amazonprime: { id: 'amazonprime', target: 15, labelKey: 'goalAmazonPrime' },
  disney: { id: 'disney', target: 16, labelKey: 'goalDisney' },
  youtubepremium: { id: 'youtubepremium', target: 14, labelKey: 'goalYouTubePremium' }
};
const DEFAULT_GOAL_ID = 'claude';

function resolveGoal(goalId) {
  if (goalId && SUBSCRIPTION_GOALS[goalId]) return SUBSCRIPTION_GOALS[goalId];
  if (goalId) console.warn(`⚠️  unrecognized --goal "${goalId}", falling back to "${DEFAULT_GOAL_ID}"`);
  return SUBSCRIPTION_GOALS[DEFAULT_GOAL_ID];
}

// translations.js's exported createTranslationFunction only resolves FLAT
// top-level keys (the SEO-page string set) — planner-specific strings like
// 'goalClaude' live nested under translations[lang].planner, resolved by
// planner.js's own makeT() (planner.js:763-773). Mirrored here (same
// dict-then-en-fallback-then-key logic) so the pack's human-readable goal
// label matches what the live planner UI would actually show, instead of a
// raw labelKey — createTranslationFunction() alone would have returned the
// literal string 'goalClaude' for this key (caught in manual smoke-testing;
// see 060-notes.md).
function goalLabelText(goalDef, lang) {
  const dict = (translations[lang] && translations[lang].planner) || translations.en.planner;
  let v = dict[goalDef.labelKey];
  if (v == null) v = translations.en.planner[goalDef.labelKey];
  return v == null ? goalDef.labelKey : v;
}

// --- Persona classification (mirrors planner.js:25-27 STABLE_SYMBOLS + the
// PERSONAS bands at planner.js:500-515). The spec's description only calls
// out an APY ceiling per band, but curatePools (planner.js:544) ALSO gates
// on band.minTvl — notably 'stable' requires $50M, not just this script's
// $10M qualifying floor. Mirroring minTvl too (not just maxApy) is required
// so the persona this script picks is the persona the live planner will
// actually accept for this exact pool — otherwise a pack could tag a
// $12M-TVL stablecoin pool 'stable' and the real curatePools would reject it
// (stable band needs >=$50M), silently breaking the "working example-garden
// link" acceptance criterion. See 060-notes.md. -----------------------------
const STABLE_SYMBOLS = ['USDC', 'USDT', 'DAI', 'USDS', 'FRAX', 'TUSD', 'USDP', 'GUSD',
  'LUSD', 'USDD', 'PYUSD', 'USDE', 'SUSD', 'CRVUSD', 'GHO', 'USD0', 'FDUSD', 'USDB',
  'BUSD', 'MIM', 'DOLA', 'USDX', 'EURC', 'EURS', 'RLUSD', 'USDL', 'DEUSD', 'SDAI'];

function isStableSymbol(symbol) {
  if (!symbol) return false;
  const parts = String(symbol).toUpperCase().split(/[-_/\s+]/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((p) => STABLE_SYMBOLS.indexOf(p) !== -1);
}

const APY_SANITY_LIMIT = 1000; // mirrors planner.js:19 — same value, never weakened
const PERSONA_BANDS = {
  stable: { minTvl: 50000000, maxApy: APY_SANITY_LIMIT },
  rwa: { minTvl: 100000, maxApy: 20 },
  degen: { minTvl: 100000, maxApy: APY_SANITY_LIMIT }
};

function classifyPersona(pool) {
  const apy = poolTotalApy(pool);
  const tvl = pool.tvlUsd || 0;
  if (isStableSymbol(pool.symbol) && tvl >= PERSONA_BANDS.stable.minTvl && apy <= PERSONA_BANDS.stable.maxApy) return 'stable';
  if (tvl >= PERSONA_BANDS.rwa.minTvl && apy <= PERSONA_BANDS.rwa.maxApy) return 'rwa';
  return 'degen';
}

// Human-readable protocol name from pool.project slug (mirrors planner.js:630-637).
function formatProjectName(project) {
  return String(project || '')
    .replace(/-v[0-9]+(\.[0-9]+)?$/, '')
    .replace(/-(savings|lending|protocol|finance|swap|staking)$/i, '')
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ')
    .trim();
}

// --- Share URL (mirrors encodePlanToUrl's param semantics, planner.js:856 —
// this is a small parallel Node-side builder, not a require of that browser
// function, per spec territory notes). `src`/`ref` (064) are attribution-only
// params the planner already knows how to read (urlParams.get('src'),
// planner.js:3529) — they carry no plan state and decodePlanFromUrl ignores
// them, so they cannot change what garden renders. --------------------------
const SPOTLIGHT_SRC = 'x_spotlight';

function buildShareUrl({ goal, monthly, persona, chain, token, ref }) {
  const params = new URLSearchParams();
  params.set('goal', goal);
  params.set('monthly', String(monthly));
  params.set('pace', persona);
  if (chain) params.set('chain', chain);
  if (token) params.set('token', token);
  params.set('src', SPOTLIGHT_SRC);
  if (ref) params.set('ref', ref);
  return `${SITE_URL}/plan.html?${params.toString()}`;
}

// --- Tweet draft + Canva fields ----------------------------------------------
// The funding claim ("runs a $X/mo sub, forever") is a forever-number claim,
// so for the degen persona it MUST state the ⅓ haircut plainly — the same
// honesty stance the live planner's degenHaircutNote takes (CLAUDE.md
// degen-honesty rail: "projects at a ⅓ haircut of headline APY AND says so").
// Stable/rwa personas get no haircut, so their funding line is byte-identical
// to the pre-069 output.
function buildTweetDraft({ hook, protocolLabel, poolSymbol, chain, apyStr, tvlStr, goalLabelText, monthly, shareUrl, project, persona }) {
  const fundingLine = persona === 'degen'
    ? `Projected at ⅓ of today's rate (farm rates decay), that still runs a $${monthly}/mo ${goalLabelText} sub, forever.\n\n`
    : `Parked here, that's enough to run a $${monthly}/mo ${goalLabelText} sub, forever.\n\n`;
  // 229: opens with the derived hook line; everything below is the existing
  // 060/064/069 body, byte-identical in construction (share URL,
  // src=x_spotlight, ref, and the degen haircut sentence all survive).
  return (
    `${hook}\n\n` +
    `${protocolLabel} is paying ${apyStr} on ${poolSymbol} (${chain}) — ${tvlStr} TVL.\n` +
    fundingLine +
    `See the garden → ${shareUrl}\n\n` +
    `@${project} (confirm handle before posting — not verified by this script)`
  );
}

function buildCanvaFields({ protocolLabel, poolSymbol, chain, apyStr, tvlStr, goalLabelText, shareUrl, tweetDraft, foreverAmtStr, effectiveApyStr, hook }) {
  return {
    protocolName: protocolLabel,
    poolSymbol: poolSymbol,
    chain: chain,
    apy: apyStr,
    // 069: the projection basis — identical to `apy` for stable/rwa, the ⅓
    // haircut rate for degen. `apy` stays the HEADLINE live fact; this is
    // the rate every forever-number in the pack is actually computed at.
    effectiveApy: effectiveApyStr,
    tvl: tvlStr,
    goalLabel: goalLabelText,
    shareUrl: shareUrl,
    tweetDraft: tweetDraft,
    // 066: the SAME forever-number field the token-page yield headline
    // exposes (gp.foreverNumber) — null (never a fabricated figure) when
    // the pool's own APY doesn't clear a visibly-nonzero rate.
    foreverAmt: foreverAmtStr,
    // 229: additive key — the derived one-line hook, same string as pack.hook.
    hook: hook
  };
}

// --- Hook (item 229) ---------------------------------------------------------
// Exactly three templates, chosen by hookAngle. Every figure comes from the
// pack's own already-railed fields; the forever clause always quotes
// foreverAmtStr (never a fabricated figure — 066) and effectiveApyStr (the
// haircut-applied basis, never apyStr — 069's degen-honesty rail), and is
// omitted entirely when foreverAmtStr is null (no fabricated "$0"/"$Infinity"
// clause). "tracked" not "days old" — `count` is DefiLlama's TRACKING
// window, not the pool's true on-chain age; the pack must not claim the
// stronger fact (229 spec §3 honesty constraints, all verifier-checkable).
function buildHook({ hookAngle: angle, protocolLabel, poolSymbol, chain, apyStr, tvlStr, goalLabel,
  foreverAmtStr, effectiveApyStr, daysTracked, unusualRate, protocolTvlStr }) {
  let headline;
  if (angle === 'freshness') {
    headline = `${protocolLabel}'s ${poolSymbol} pool on ${chain} has been tracked ${daysTracked} days and already holds ${tvlStr}.`;
  } else if (angle === 'unusualRate') {
    // <P> floored at 1 so it never prints "top 0%" (229 spec §3).
    const percentile = Math.max(1, Math.round((1 - unusualRate) * 100));
    headline = `${apyStr} on ${poolSymbol} is the top ${percentile}% of rates in its risk band on ${chain}.`;
  } else { // smallProtocol
    headline = `${protocolLabel} holds ${protocolTvlStr} across its railed pools — not a household name.`;
  }
  if (!foreverAmtStr) return headline; // 066: never a fabricated forever figure
  const place = angle === 'smallProtocol' ? `in its ${poolSymbol} pool` : 'there';
  // foreverAmtStr already carries its own "$" (formatUsd) — no second "$".
  return `${headline} ${foreverAmtStr} parked ${place} pays your ${goalLabel} forever at ${effectiveApyStr}.`;
}

// --- Share-card PNG (mirrors generate-og-images.js's renderOgCard technique,
// reuses its COLORS/CARD_W/CARD_H for visual consistency across every
// generated asset in the repo). Text-only — brand-icons.js is a
// window-attached IIFE, not require-able from Node, and a Node-side logo
// loader is out of scope for this pass (matches renderOgCard's own
// plain-vector-mark precedent, no logo/emoji glyph). ------------------------
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderSpotlightCard({ protocolLabel, poolSymbol, chain, apyStr, tvlStr, goalLabelText, monthly, persona, effectiveApyStr }) {
  const canvas = createCanvas(CARD_W, CARD_H);
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createRadialGradient(CARD_W / 2, 0, 0, CARD_W / 2, 0, CARD_H * 1.3);
  bgGrad.addColorStop(0, COLORS.surface);
  bgGrad.addColorStop(1, COLORS.bg);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const pad = 56;
  roundRectPath(ctx, pad, pad, CARD_W - pad * 2, CARD_H - pad * 2, 28);
  ctx.fillStyle = COLORS.surface;
  ctx.fill();

  const left = pad + 56;

  // Brand mark: a plain vector dot (same reasoning as renderOgCard — no
  // guaranteed color-emoji font in headless CI).
  ctx.fillStyle = COLORS.primary;
  ctx.beginPath();
  ctx.arc(left + 9, pad + 52, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '600 26px sans-serif';
  ctx.fillText('DeFi Garden Spotlight', left + 30, pad + 62);

  ctx.fillStyle = COLORS.text;
  ctx.font = '700 66px sans-serif';
  const protoLine = `${protocolLabel} · ${poolSymbol}`;
  const protoText = protoLine.length > 30 ? protoLine.slice(0, 29) + '…' : protoLine;
  ctx.fillText(protoText, left, pad + 150);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '500 28px sans-serif';
  ctx.fillText(chain, left, pad + 195);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '500 28px sans-serif';
  ctx.fillText('Live APY', left, pad + 260);
  ctx.fillStyle = COLORS.primary;
  ctx.font = '700 78px sans-serif';
  ctx.fillText(apyStr, left, pad + 340);

  // 069 degen-honesty: the headline "Live APY" IS the live rate, but every
  // forever-number in this pack is projected at the ⅓ haircut — one small
  // caveat line (existing secondary text style, no new colors/glyphs) so the
  // card never implies the headline rate is the projection basis. Only for
  // degen; stable/rwa cards render byte-identically to the pre-069 layout.
  let yTvl = pad + 385;
  let yFraming = pad + 440;
  if (persona === 'degen' && effectiveApyStr) {
    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = '500 26px sans-serif';
    ctx.fillText(`projected at ${effectiveApyStr} (⅓ of today's rate)`, left, pad + 378);
    yTvl = pad + 420;
    yFraming = pad + 475;
  }

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '500 26px sans-serif';
  ctx.fillText(`${tvlStr} TVL tracked`, left, yTvl);

  ctx.fillStyle = COLORS.text;
  ctx.font = '600 30px sans-serif';
  const framing = `→ funds a $${monthly}/mo ${goalLabelText} sub`;
  ctx.fillText(framing, left, yFraming);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '500 26px sans-serif';
  ctx.fillText('defi.garden', left, CARD_H - pad - 20);

  return canvas.toBuffer('image/png');
}

// --- Pack assembly ------------------------------------------------------------
function buildPack(pool, { goalId, lang, pools } = {}) {
  const goalDef = resolveGoal(goalId);
  const persona = classifyPersona(pool);
  const goalLabel = goalLabelText(goalDef, lang || 'en');
  const protocolLabel = formatProjectName(pool.project);
  const apy = poolTotalApy(pool);
  const apyStr = formatApy(apy);
  // 069 degen-honesty: the projection basis for every forever-number in the
  // pack. Mirror of planner.js:657 (effectiveApy) / planner.js:1354-1357,
  // keyed on this script's own classifyPersona result — the degen band is the
  // one the planner tags degenHaircut, so `persona === 'degen'` reproduces
  // the identical ÷3 rule. Headline `apy`/`apyStr` stay the live fact.
  const effApy = persona === 'degen' ? apy / 3 : apy;
  const effectiveApyStr = formatApy(effApy);
  const tvlStr = formatUsd(pool.tvlUsd);
  const monthly = goalDef.target;
  // Stable per-pool ref: same slug used for the output directory (slug),
  // reused as the URL's `ref` param — one identifier, never two that could
  // drift apart.
  const slug = tokenSlug(`${pool.project}-${pool.symbol}-${pool.chain}`);

  // 066: capital this pool's own APY would need to run the pack's goal
  // subscription forever — SAME gp.foreverNumber math the token-page yield
  // headline uses. 069: computed at the haircut-applied `effApy` so a degen
  // pack's claimed figure matches what its own linked garden renders (the
  // planner haircuts before calling foreverNumber). null (never "$∞" or a
  // fabricated figure) when the effective APY <= 0.
  const foreverAmt = foreverNumber(monthly, effApy);
  const foreverAmtStr = (isFinite(foreverAmt) && foreverAmt > 0) ? formatUsd(foreverAmt) : null;

  // 229: story-worthiness signals + the derived hook. Built against the SAME
  // candidate context `pool` was ranked against — pass the full/raw dataset
  // as `pools` (main() does). Falls back to a single-pool context ([pool])
  // for call sites that only care about the trust-rail fields (most of
  // test_spotlight.js's pure-unit fixtures predate 229) — that fallback
  // degrades to "no other candidates to compare against": percentileRank's
  // n<=1 branch returns 1 for a population of one, so smallProtocol and
  // freshness (both `1 - percentileRank(...)`) read 0, unusualRate (not
  // inverted) reads 1, and rateRepresentative is whatever this pool's own
  // apy/apyMean30d deviation actually is. It never fabricates a population
  // or asserts a specific angle — it just degrades honestly.
  const storyCtx = buildStoryContext(pools && pools.length ? pools : [pool]);
  const signals = storySignals(pool, storyCtx);
  const score = storyScore(signals);
  const angle = hookAngle(signals);
  const daysTracked = Number.isFinite(pool.count) ? pool.count : 0;
  const protocolTvlStr = formatUsd(storyCtx.aggregates.get(pool.project) || (pool.tvlUsd || 0));
  const hook = buildHook({
    hookAngle: angle, protocolLabel, poolSymbol: pool.symbol, chain: pool.chain,
    apyStr, tvlStr, goalLabel, foreverAmtStr, effectiveApyStr, daysTracked,
    unusualRate: signals.unusualRate, protocolTvlStr
  });

  const shareUrl = buildShareUrl({
    goal: goalDef.id, monthly: monthly, persona: persona, chain: pool.chain, token: pool.symbol, ref: slug
  });
  const tweetDraft = buildTweetDraft({
    hook, protocolLabel, poolSymbol: pool.symbol, chain: pool.chain, apyStr, tvlStr,
    goalLabelText: goalLabel, monthly, shareUrl, project: pool.project, persona
  });
  const canvaFields = buildCanvaFields({
    protocolLabel, poolSymbol: pool.symbol, chain: pool.chain, apyStr, tvlStr, goalLabelText: goalLabel, shareUrl, tweetDraft, foreverAmtStr, effectiveApyStr, hook
  });

  return {
    slug,
    protocol: pool.project,
    protocolLabel,
    pool: pool.pool,
    poolSymbol: pool.symbol,
    chain: pool.chain,
    token: pool.symbol,
    apy: apy,
    apyStr: apyStr,
    effectiveApy: effApy,
    effectiveApyStr: effectiveApyStr,
    tvl: pool.tvlUsd,
    tvlStr: tvlStr,
    goal: goalDef.id,
    goalLabel: goalLabel,
    monthly: monthly,
    persona: persona,
    foreverAmt: foreverAmt,
    foreverAmtStr: foreverAmtStr,
    shareUrl: shareUrl,
    tweetDraft: tweetDraft,
    canvaFields: canvaFields,
    // 229 — additive: the derived hook + the signals/score/angle that
    // produced it, plus the two raw inputs the story-score gates read
    // (daysTracked/apyMean30d) so a downstream consumer can audit the
    // ranking without recomputing it.
    hook: hook,
    hookAngle: angle,
    storyScore: score,
    storySignals: signals,
    daysTracked: daysTracked,
    apyMean30d: (typeof pool.apyMean30d === 'number' && isFinite(pool.apyMean30d)) ? pool.apyMean30d : null,
    generatedAt: new Date().toISOString()
  };
}

// --- Cadence / coverage doc (064) --------------------------------------------
// "the running list of pools already spotlighted + the next N candidates …
// so the human's weekly posting is systematic and non-repeating" (spec 064).
// Pure and testable: buildCadence/renderCadenceMarkdown take the already-
// spotlighted pack summaries as plain data (never touch the filesystem
// themselves) — loadCoveredPacks is the one IO-doing wrapper, kept separate
// so the ranking/rendering logic is deterministic given the same pool set +
// covered list, per the spec's acceptance criterion.
const DEFAULT_NEXT_CANDIDATES = 5;

/** Reads every existing spotlights/<slug>/pack.json under outDir (if any)
 * and returns their parsed contents. A brand-new outDir (nothing spotlighted
 * yet) returns []. */
function loadCoveredPacks(outDir) {
  if (!fs.existsSync(outDir)) return [];
  return fs.readdirSync(outDir)
    .map((slug) => path.join(outDir, slug, 'pack.json'))
    .filter((p) => fs.existsSync(p))
    .map((p) => JSON.parse(fs.readFileSync(p, 'utf8')))
    .sort((a, b) => String(a.generatedAt).localeCompare(String(b.generatedAt)));
}

/** coveredPacks: array of pack objects (same shape buildPack returns /
 * pack.json on disk) for pools already spotlighted. Returns { covered, next }
 * — next is up to nextN storyScore-ranked candidates whose pool id isn't
 * already in coveredPacks, AT MOST ONE POOL PER PROJECT (229 — each post
 * tags a protocol, so the next-up list must not repeat one; measured
 * pre-229: `uniswap-v3` held 5 of the old ranker's top 10 slots while 148
 * distinct protocols qualified). Each row carries its own hookAngle.
 *
 * Post-review fix (229): the protocol dedupe must ALSO exclude protocols
 * already COVERED by a committed pack, not just protocols repeated within
 * the next list itself — the human's very next post would otherwise tag the
 * same protocol they just posted (caught by the coordinator reading the
 * rendered CADENCE.md, where `liminal-basis` showed up as both a covered
 * pack and the #1 next candidate on a different pool). `seenProjects` is
 * seeded from `coveredPacks`' own recorded `protocol` field — never
 * re-derived from the pool — so this stays correct even if a covered pack's
 * pool has since disappeared from live data. Both the per-pool-id covered
 * filter AND this per-project seed are needed: the former stops the exact
 * same pool reappearing, the latter stops a DIFFERENT pool of the same
 * protocol reappearing. */
function buildCadence(pools, coveredPacks, { nextN } = {}) {
  const n = nextN || DEFAULT_NEXT_CANDIDATES;
  const coveredPoolIds = new Set((coveredPacks || []).map((p) => p.pool));
  const seenProjects = new Set((coveredPacks || []).map((p) => p.protocol).filter(Boolean));
  const next = [];
  for (const s of scoredCandidates(pools).scored) {
    const p = s.pool;
    if (coveredPoolIds.has(p.pool)) continue;
    if (seenProjects.has(p.project)) continue; // 229: at most one pool per project
    seenProjects.add(p.project);
    next.push({
      protocol: p.project,
      protocolLabel: formatProjectName(p.project),
      pool: p.pool,
      poolSymbol: p.symbol,
      chain: p.chain,
      apyStr: formatApy(poolTotalApy(p)),
      tvlStr: formatUsd(p.tvlUsd),
      hookAngle: s.angle
    });
    if (next.length >= n) break;
  }
  return { covered: coveredPacks || [], next };
}

function renderCadenceMarkdown(cadence) {
  const lines = [
    '# Spotlight cadence & coverage',
    '',
    '_Generated by `generate-spotlight.js` — do not hand-edit; regenerates on every `npm run spotlight` run._',
    '',
    `## Already spotlighted (${cadence.covered.length})`
  ];
  if (!cadence.covered.length) {
    lines.push('_None yet._');
  } else {
    cadence.covered.forEach((c) => {
      lines.push(`- ${c.protocolLabel} · ${c.poolSymbol} (${c.chain}) — pool \`${c.pool}\`, spotlighted ${c.generatedAt || 'unknown date'}`);
    });
  }
  lines.push('', `## Next candidates (${cadence.next.length})`);
  if (!cadence.next.length) {
    lines.push('_No qualifying, uncovered candidates left in this pool set._');
  } else {
    cadence.next.forEach((c) => {
      lines.push(`- ${c.protocolLabel} · ${c.poolSymbol} (${c.chain}) — ${c.apyStr} APY, ${c.tvlStr} TVL tracked, angle \`${c.hookAngle}\` (\`--pool ${c.pool}\`)`);
    });
  }
  lines.push('');
  return lines.join('\n');
}

// --- IO layer (only runs as a script) ---------------------------------------
function fetchPoolData() {
  return new Promise((resolve, reject) => {
    https.get(YIELDS_API, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.data || json);
        } catch (e) { reject(new Error('parse failed: ' + e.message)); }
      });
    }).on('error', (e) => reject(new Error('API request failed: ' + e.message)));
  });
}

function parseArgs(argv) {
  const args = { fixture: process.env.POOLS_FIXTURE || null, out: 'spotlights', pool: null, goal: null, lang: 'en' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixture') args.fixture = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--pool') args.pool = argv[++i];
    else if (argv[i] === '--goal') args.goal = argv[++i];
    else if (argv[i] === '--lang') args.lang = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let pools;
  if (args.fixture) {
    console.log('📄 Loading pools from fixture:', args.fixture);
    const raw = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
    pools = raw.data || raw;
  } else {
    console.log('📡 Fetching pools from DefiLlama...');
    pools = await fetchPoolData();
  }
  console.log(`✅ ${pools.length} pools`);

  const pool = pickPool(pools, args.pool);
  console.log(`🎯 Spotlighting ${pool.project} · ${pool.symbol} (${pool.chain}) — pool ${pool.pool}`);

  const pack = buildPack(pool, { goalId: args.goal, lang: args.lang, pools: pools });

  const outDir = path.resolve(args.out, pack.slug);
  fs.mkdirSync(outDir, { recursive: true });

  const cardBuf = renderSpotlightCard({
    protocolLabel: pack.protocolLabel, poolSymbol: pack.poolSymbol, chain: pack.chain,
    apyStr: pack.apyStr, tvlStr: pack.tvlStr, goalLabelText: pack.goalLabel, monthly: pack.monthly,
    persona: pack.persona, effectiveApyStr: pack.effectiveApyStr
  });
  fs.writeFileSync(path.join(outDir, 'card.png'), cardBuf);
  fs.writeFileSync(path.join(outDir, 'pack.json'), JSON.stringify(pack, null, 2));

  console.log(`📝 Wrote ${path.join(args.out, pack.slug, 'pack.json')}`);
  console.log(`🖼️  Wrote ${path.join(args.out, pack.slug, 'card.png')}`);
  console.log(`🔗 ${pack.shareUrl}`);

  // Cadence doc reflects the coverage state AFTER this run's pack lands.
  const outRoot = path.resolve(args.out);
  const coveredPacks = loadCoveredPacks(outRoot);
  const cadence = buildCadence(pools, coveredPacks);
  fs.writeFileSync(path.join(outRoot, 'CADENCE.md'), renderCadenceMarkdown(cadence));
  console.log(`📋 Wrote ${path.join(args.out, 'CADENCE.md')} (${cadence.covered.length} covered, ${cadence.next.length} next candidates)`);
}

module.exports = {
  DEFAULT_MIN_TVL, APY_SANITY_LIMIT, CURVE_PROJECT_KEY, SPOTLIGHT_SRC,
  isQualifyingPool, protocolTvlAggregates, isSmallEnoughProtocol,
  // 229: the two new gates + the story-worthiness score/hook machinery.
  // 242: representativenessRatio is now ALSO re-exported (it previously
  // wasn't, even though isRepresentativeRate/the constants were) — the
  // mirror-proof test requires all four names to be checkable for identity.
  REPRESENTATIVE_REL, REPRESENTATIVE_ABS_PP, representativenessRatio, isRepresentativeRate, isFundableForever,
  buildStoryContext, storySignals, storyScore, hookAngle, buildHook,
  pickPool, rankCandidates, SpotlightError,
  SUBSCRIPTION_GOALS, DEFAULT_GOAL_ID, resolveGoal,
  STABLE_SYMBOLS, isStableSymbol, PERSONA_BANDS, classifyPersona,
  formatProjectName, buildShareUrl, buildTweetDraft, buildCanvaFields,
  renderSpotlightCard, buildPack,
  loadCoveredPacks, buildCadence, renderCadenceMarkdown, DEFAULT_NEXT_CANDIDATES
};

if (require.main === module) {
  main().catch((e) => { console.error('❌', e.message); process.exit(1); });
}
