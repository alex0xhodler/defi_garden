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
const { poolTotalApy, isAnomalousApy, formatUsd, formatApy, tokenSlug } = require('./generate-token-pages.js');
const { COLORS, CARD_W, CARD_H } = require('./generate-og-images.js');
const { translations } = require('./translations.js');

const YIELDS_API = 'https://yields.llama.fi/pools';
const SITE_URL = 'https://www.defi.garden';

// --- Trust rails (app.js:730 / planner.js parity) ---------------------------
// Deliberately NOT generate-token-pages.js's relaxed $100K MIN_POOL_TVL — a
// spotlighted pool feeds a real example garden a stranger will click into,
// so it must clear the same $10M floor a plan itself requires.
const DEFAULT_MIN_TVL = 10000000;

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
    return pool;
  }
  const candidates = rankCandidates(pools);
  if (!candidates.length) {
    throw new SpotlightError('no trust-rail-qualifying, small-enough-protocol pool found in this dataset');
  }
  return candidates[0];
}

/** All trust-rail-qualifying, small-enough-protocol pools, ranked highest
 * total APY first. Shared by pickPool (auto-pick = candidates[0]) and the
 * cadence doc (candidates minus already-covered pools = next-up list). */
function rankCandidates(pools) {
  const aggregates = protocolTvlAggregates(pools);
  return (pools || [])
    .filter((p) => isQualifyingPool(p) && isSmallEnoughProtocol(p.project, aggregates))
    .sort((a, b) => poolTotalApy(b) - poolTotalApy(a));
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
  rwa: { minTvl: 10000000, maxApy: 20 },
  degen: { minTvl: 10000000, maxApy: APY_SANITY_LIMIT }
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
function buildTweetDraft({ protocolLabel, poolSymbol, chain, apyStr, tvlStr, goalLabelText, monthly, shareUrl, project }) {
  return (
    `${protocolLabel} is paying ${apyStr} on ${poolSymbol} (${chain}) — ${tvlStr} TVL.\n` +
    `Parked here, that's enough to run a $${monthly}/mo ${goalLabelText} sub, forever.\n\n` +
    `See the garden → ${shareUrl}\n\n` +
    `@${project} (confirm handle before posting — not verified by this script)`
  );
}

function buildCanvaFields({ protocolLabel, poolSymbol, chain, apyStr, tvlStr, goalLabelText, shareUrl, tweetDraft }) {
  return {
    protocolName: protocolLabel,
    poolSymbol: poolSymbol,
    chain: chain,
    apy: apyStr,
    tvl: tvlStr,
    goalLabel: goalLabelText,
    shareUrl: shareUrl,
    tweetDraft: tweetDraft
  };
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

function renderSpotlightCard({ protocolLabel, poolSymbol, chain, apyStr, tvlStr, goalLabelText, monthly }) {
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

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '500 26px sans-serif';
  ctx.fillText(`${tvlStr} TVL tracked`, left, pad + 385);

  ctx.fillStyle = COLORS.text;
  ctx.font = '600 30px sans-serif';
  const framing = `→ funds a $${monthly}/mo ${goalLabelText} sub`;
  ctx.fillText(framing, left, pad + 440);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '500 26px sans-serif';
  ctx.fillText('defi.garden', left, CARD_H - pad - 20);

  return canvas.toBuffer('image/png');
}

// --- Pack assembly ------------------------------------------------------------
function buildPack(pool, { goalId, lang } = {}) {
  const goalDef = resolveGoal(goalId);
  const persona = classifyPersona(pool);
  const goalLabel = goalLabelText(goalDef, lang || 'en');
  const protocolLabel = formatProjectName(pool.project);
  const apy = poolTotalApy(pool);
  const apyStr = formatApy(apy);
  const tvlStr = formatUsd(pool.tvlUsd);
  const monthly = goalDef.target;
  // Stable per-pool ref: same slug used for the output directory (slug),
  // reused as the URL's `ref` param — one identifier, never two that could
  // drift apart.
  const slug = tokenSlug(`${pool.project}-${pool.symbol}-${pool.chain}`);

  const shareUrl = buildShareUrl({
    goal: goalDef.id, monthly: monthly, persona: persona, chain: pool.chain, token: pool.symbol, ref: slug
  });
  const tweetDraft = buildTweetDraft({
    protocolLabel, poolSymbol: pool.symbol, chain: pool.chain, apyStr, tvlStr,
    goalLabelText: goalLabel, monthly, shareUrl, project: pool.project
  });
  const canvaFields = buildCanvaFields({
    protocolLabel, poolSymbol: pool.symbol, chain: pool.chain, apyStr, tvlStr, goalLabelText: goalLabel, shareUrl, tweetDraft
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
    tvl: pool.tvlUsd,
    tvlStr: tvlStr,
    goal: goalDef.id,
    goalLabel: goalLabel,
    monthly: monthly,
    persona: persona,
    shareUrl: shareUrl,
    tweetDraft: tweetDraft,
    canvaFields: canvaFields,
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
 * — next is up to nextN trust-rail-qualifying, small-enough-protocol pools
 * (highest total APY first) whose pool id isn't already in coveredPacks. */
function buildCadence(pools, coveredPacks, { nextN } = {}) {
  const n = nextN || DEFAULT_NEXT_CANDIDATES;
  const coveredPoolIds = new Set((coveredPacks || []).map((p) => p.pool));
  const next = rankCandidates(pools)
    .filter((p) => !coveredPoolIds.has(p.pool))
    .slice(0, n)
    .map((p) => ({
      protocol: p.project,
      protocolLabel: formatProjectName(p.project),
      pool: p.pool,
      poolSymbol: p.symbol,
      chain: p.chain,
      apyStr: formatApy(poolTotalApy(p)),
      tvlStr: formatUsd(p.tvlUsd)
    }));
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
      lines.push(`- ${c.protocolLabel} · ${c.poolSymbol} (${c.chain}) — ${c.apyStr} APY, ${c.tvlStr} TVL tracked (\`--pool ${c.pool}\`)`);
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

  const pack = buildPack(pool, { goalId: args.goal, lang: args.lang });

  const outDir = path.resolve(args.out, pack.slug);
  fs.mkdirSync(outDir, { recursive: true });

  const cardBuf = renderSpotlightCard({
    protocolLabel: pack.protocolLabel, poolSymbol: pack.poolSymbol, chain: pack.chain,
    apyStr: pack.apyStr, tvlStr: pack.tvlStr, goalLabelText: pack.goalLabel, monthly: pack.monthly
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
