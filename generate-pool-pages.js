#!/usr/bin/env node

/**
 * Static Pool-Detail Markdown Twin Generator for DeFi Garden (item 213)
 * Writes pools/<pool-id>.md — a Markdown twin of the pool-detail surface
 * that today ONLY exists as a client-side React render (PoolDetail.js,
 * mounted after app.js's fetch of https://yields.llama.fi/pools completes).
 * An agent or no-JS crawler hitting `/?pool=<id>` sees the JS shell, not the
 * facts — the exact "Crawled — currently not indexed" failure mode
 * generate-token-pages.js/generate-chain-pages.js already fixed for the
 * token/chain surfaces (specs/010-diagnosis.md, spec 212's Markdown-twin
 * mechanism). This item extends that mechanism to the THIRD static surface:
 * individual pools, addressed by the id every `?pool=` deep link already
 * carries.
 *
 * TRUST PRINCIPLE (mirrors generate-token-pages.js / PoolDetail.js exactly):
 * every number on a twin derives from the SAME sanity rails the live app
 * uses. An anomalous pool (total APY > APY_SANITY_LIMIT) may NEVER receive a
 * projection or a concrete CTA dollar figure — it may still be LISTED (with
 * its flag), same as the app's own demote+flag convention, never silently
 * dropped and never silently laundered into a clean-looking number.
 *
 * Never invents data: a deep-linked id that resolves to no pool record (in
 * neither the pools snapshot nor the offline fixture) gets no twin at all —
 * an absent file is honest; a fabricated one is not.
 *
 * ITEM 216: alongside every `<id>.md`, also writes an `<id>.json` sibling —
 * a snapshot-shaped paint artifact (`{schemaVersion, generatedAt, source,
 * minTvlUsd, count, pools}` around the SAME `projectPool()` projection the
 * committed snapshot uses, imported from generate-pools-snapshot.js). This
 * lets a `?pool=<id>` arrival whose id is absent from the railed $10M
 * snapshot still paint instantly from `/pools/<id>.json` instead of blocking
 * on the multi-MB live feed (app.js's fetchPoolsInBackground()). Not a page,
 * not in the sitemap — a data artifact the app fetches, mirroring
 * data/pools-snapshot.json's own shape one pool at a time.
 *
 * Usage:
 *   node generate-pool-pages.js                       # snapshot + fixture, writes pools/
 *   node generate-pool-pages.js --fixture f.json       # offline fixture tier
 *   node generate-pool-pages.js --out pools --pages tokens,chains
 */

const fs = require('fs');
const path = require('path');

// REUSE (this item's own directive — never re-implement): the exact same
// trust-rail predicates + en-US formatters generate-token-pages.js already
// computes and ships. loadFixturePools is reused too (not in the strict
// "never re-implement" list, but the fixture shape — a plain array or
// `{data:[...]}` — is byte-identical here, and this repo's standing
// 2026-07-10 directive is reuse before invention).
const {
  poolTotalApy, isAnomalousApy, formatUsd, formatApy, mdEscape,
  loadFixturePools, APY_SANITY_LIMIT, todayGeneratedDate
} = require('./generate-token-pages.js');
// REUSE (spec 216's own directive — never re-type): the exact 13-field
// projection and snapshot envelope shape, imported from the module that
// already defines and exports them. The `.json` sibling this item adds is
// therefore byte-shape-identical to one entry of data/pools-snapshot.json —
// that's what makes it a drop-in for app.js's snapshot-shaped loader.
const { projectPool, envelope } = require('./generate-pools-snapshot.js');
// REUSE (spec 050): the same en/ko catalog + lookup helper every generator
// uses. Twins are English-only (CLAUDE.md: EN+KO must change together, and
// this item adds ZERO new keys — 'en' is the only variant needed).
const { createTranslationFunction } = require('./translations.js');
// REUSE (item 213's own export addition to audit-app.js, item 206's
// original consumer being buildPoolSurfaces()'s rotation leg): the SAME
// `[?&]pool=`-style deep-link id extraction — never a second regex scan.
const { extractDeepLinkPoolIds } = require('./audit-app.js');

const SITE_URL = 'https://www.defi.garden';
const ROOT = __dirname;

// Shape gate (this item): a deep-linked id is only worth resolving/writing a
// twin for when it LOOKS like a real DefiLlama pool id. Deliberately the
// same shape check the task spec hands down verbatim.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Pool-type classifier — mirror of PoolDetail.js:9-82 (getPoolTypeShared
// + its five protocol lists). PoolDetail.js has no module.exports (it's a
// UMD-less React component file loaded as a plain <script>, never
// `require`-able), so this generator cannot import it — it must mirror the
// exact classifier instead. Any future edit to PoolDetail.js's lists must be
// copied here too (there is no way to enforce that automatically without a
// shared module, which is out of this item's scope).
// mirror of PoolDetail.js:9-14
const LENDING_PROTOCOLS = [
  'aave', 'aave-v2', 'aave-v3', 'compound', 'compound-v2', 'compound-v3',
  'morpho', 'morpho-blue', 'spark', 'sparklend', 'maple', 'euler', 'radiant',
  'iron-bank', 'cream', 'benqi-lending', 'venus', 'tectonic', 'moonwell',
  'strike', 'granary', 'pac-finance', 'dforce', 'annex', 'sky-lending'
];
// mirror of PoolDetail.js:16-23
const DEX_LP_PROTOCOLS = [
  'uniswap', 'uniswap-v2', 'uniswap-v3', 'curve', 'curve-dex', 'balancer',
  'balancer-v2', 'pancakeswap', 'pancakeswap-v2', 'pancakeswap-v3', 'sushiswap',
  'quickswap', 'traderjoe', 'spookyswap', 'spiritswap', 'honeyswap', 'dfyn',
  'viperswap', 'pangolin', 'lydia', 'defiswap', 'varen', 'levinswap',
  'aerodrome', 'aerodrome-slipstream', 'velodrome', 'solidly', 'bancor',
  'kyberswap', 'dodoex', '1inch', 'osmosis', 'raydium', 'orca'
];
// mirror of PoolDetail.js:25-30
const STAKING_PROTOCOLS = [
  'lido', 'rocket-pool', 'rocketpool', 'ether.fi', 'ether.fi-stake', 'stakewise',
  'jito', 'jito-liquid-staking', 'marinade', 'binance-staked-eth', 'coinbase-wrapped-staked-eth',
  'frax', 'frax-ether', 'benqi', 'benqi-staked-avax', 'staked-frax-ether',
  'ankr', 'pstake', 'stader', 'chorus-one', 'figment'
];
// mirror of PoolDetail.js:32-35
const YIELD_DERIVATIVES_PROTOCOLS = [
  'pendle', 'spectra', 'spectra-v2', 'spectra-metavaults', 'termmax', 'napier',
  'sense', 'notional', 'element'
];
// mirror of PoolDetail.js:37-41
const RWA_PROTOCOLS = [
  'ondo', 'centrifuge', 'goldfinch', 'openeden', 'matrixdock', 'midas-rwa',
  'midas', 'usual', 'credix', 'clearpool', 'maple', 'superstate', 'franklin',
  'backed', 'hashnote', 'mountain-protocol'
];

// mirror of PoolDetail.js:47-82
function getPoolTypeShared(pool) {
  if (!pool.project) return 'Yield Farming';
  const projectName = pool.project.toLowerCase().replace(/\s+/g, '-');
  if (RWA_PROTOCOLS.some(protocol => projectName.includes(protocol))) return 'RWA';
  if (YIELD_DERIVATIVES_PROTOCOLS.some(protocol => projectName.includes(protocol))) return 'Yield Derivatives';
  if (pool.poolMeta && pool.poolMeta.toLowerCase().includes('lending')) return 'Lending';
  if (LENDING_PROTOCOLS.some(protocol => projectName.includes(protocol))) return 'Lending';
  if (DEX_LP_PROTOCOLS.some(protocol => projectName.includes(protocol))) return 'LP/DEX';
  if (STAKING_PROTOCOLS.some(protocol => projectName.includes(protocol))) return 'Staking';
  return 'Yield Farming';
}

// mirror of PoolDetail.js:283-288 — 30d mean APY is only presentable when
// finite, >=0, and inside the same sanity rail as everything else. An
// unpresentable number is OMITTED entirely (never clamped/cleaned) by every
// caller of this predicate — see renderPoolPageMarkdown below.
function mean30dSane(pool) {
  return typeof pool.apyMean30d === 'number' &&
    Number.isFinite(pool.apyMean30d) &&
    pool.apyMean30d >= 0 &&
    pool.apyMean30d <= APY_SANITY_LIMIT;
}

// mirror of PoolDetail.js:291-364 (getRiskAssessment). Anomaly check reuses
// the imported isAnomalousApy() (this item's reuse rule) rather than
// re-deriving PoolDetail.js's own local `totalApy > APY_SANITY_LIMIT_LOCAL`
// — both gate on the identical 1000% rail, so reusing is strictly safer than
// a second copy of the same comparison.
function getRiskAssessment(pool, poolType, t) {
  let riskScore = 0;
  const factors = [];

  // mirror of PoolDetail.js:295-305 — anomalous APY override, forced High.
  if (isAnomalousApy(pool)) {
    factors.push('Anomalous yield');
    return {
      level: t('highRisk'),
      description: 'Anomalous yield — extreme caution',
      factors,
      score: 100
    };
  }

  const totalApy = poolTotalApy(pool);

  // mirror of PoolDetail.js:307-316 — TVL factor (40% weight). No `|| 0`
  // defaulting on EITHER branch: PoolDetail.js:308 and :311 both read
  // pool.tvlUsd bare, so a missing/undefined tvlUsd must fall through all the
  // way to the "High liquidity" else-branch here too, exactly as it does on
  // the page (undefined < 1000000 is false, undefined < 10000000 is false).
  if (pool.tvlUsd < 1000000) {
    riskScore += 40;
    factors.push('Low liquidity');
  } else if (pool.tvlUsd < 10000000) {
    riskScore += 20;
    factors.push('Medium liquidity');
  } else {
    factors.push('High liquidity');
  }

  // mirror of PoolDetail.js:318-328 — APY factor (30% weight).
  if (totalApy > 50) {
    riskScore += 30;
    factors.push('Very high yield');
  } else if (totalApy > 20) {
    riskScore += 20;
    factors.push('High yield');
  } else if (totalApy > 10) {
    riskScore += 10;
    factors.push('Elevated yield');
  }

  // mirror of PoolDetail.js:330-337 — new-protocol factor (20% weight).
  const isNewProtocol = ['jito', 'ether.fi', 'pendle', 'eigenlayer'].some(p =>
    (pool.project || '').toLowerCase().includes(p)
  );
  if (isNewProtocol) {
    riskScore += 15;
    factors.push('Newer protocol');
  }

  // mirror of PoolDetail.js:339-346 — pool-type factor (10% weight).
  if (poolType === 'LP/DEX') {
    riskScore += 10;
    factors.push('Impermanent loss risk');
  } else if (poolType === 'Lending') {
    riskScore += 5;
    factors.push('Credit risk');
  }

  // mirror of PoolDetail.js:348-364 — overall level from the accumulated score.
  let level, description;
  if (riskScore <= 25) {
    level = t('lowRisk');
    description = 'Conservative DeFi strategy';
  } else if (riskScore <= 50) {
    level = t('mediumRisk');
    description = 'Moderate risk profile';
  } else {
    level = t('highRisk');
    description = 'Advanced DeFi strategy';
  }
  return { level, description, factors, score: riskScore };
}

// mirror of PoolDetail.js:373-388 (gardenPersona / applyDegenHaircut /
// PROJECTION_YEARS / projectionApy / projectionAmount / showConcreteCta),
// evaluated at the page's own $1,000 default investment (PoolDetail.js:163)
// rather than a user-adjustable calculator value — a static twin has no
// calculator to read from.
const PROJECTION_YEARS = 5; // mirror of PoolDetail.js:376
const DEFAULT_INVESTMENT = 1000; // mirror of PoolDetail.js:163

function projectionFor(pool, riskAssessment) {
  const gardenPersona = riskAssessment.score <= 25 ? 'stable' : riskAssessment.score <= 50 ? 'rwa' : 'degen'; // mirror of PoolDetail.js:373
  const applyDegenHaircut = gardenPersona === 'degen'; // mirror of PoolDetail.js:375
  const totalApy = poolTotalApy(pool);
  const projectionApy = applyDegenHaircut ? totalApy / 3 : totalApy; // mirror of PoolDetail.js:377
  const projectionAmount = DEFAULT_INVESTMENT * Math.pow(1 + projectionApy / 100, PROJECTION_YEARS); // mirror of PoolDetail.js:381 (at the $1,000 default, not a calculator value)
  return { gardenPersona, applyDegenHaircut, projectionApy, projectionAmount };
}

// --- Protocol CTA resolution (item 182's own CI-baked artifact) ------------
// mirror of the key derivation app.js:2497 / PoolDetail.js share
// (`pool.project.toLowerCase().replace(/\s+/g, '-')`), read against ONLY the
// CI-baked data/protocol-urls.json tier — this generator has no live
// api.llama.fi fetch (there is no browser session to run one in) and no
// `pool.url` field to consult (neither the snapshot nor the fixture carries
// it), so the baked artifact is the correct, trust-safe, offline-capable
// single source here.
function loadBakedProtocolUrls(overridePath) {
  try {
    const raw = fs.readFileSync(overridePath || path.join(ROOT, 'data', 'protocol-urls.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.urls || typeof parsed.urls !== 'object') return {};
    return parsed.urls;
  } catch (e) {
    return {};
  }
}

function resolveProtocolUrl(pool, bakedUrls) {
  if (!pool.project) return null;
  const key = pool.project.toLowerCase().replace(/\s+/g, '-');
  return (bakedUrls && (bakedUrls[key] || bakedUrls[pool.project])) || null;
}

// mirror of app.js:2513-2525 (getProtocolUrlWithRef) — same ?ref=defi.garden tag.
function withRefParam(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set('ref', 'defi.garden');
    return u.toString();
  } catch (e) {
    return url;
  }
}

// --- Rate note (mirrors PoolDetail.js:716-805 — the mutually-exclusive
// three-tier chain: rate-volatility honesty note, then track-record family,
// then rate-history-unavailable) ---------------------------------------------
function rateNote(pool, t) {
  // mirror of PoolDetail.js:716-737 (tier 1 of 3)
  const currentTotalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
  if (
    mean30dSane(pool) &&
    currentTotalApy > 0 &&
    pool.apyMean30d > 0 &&
    (Math.max(currentTotalApy, pool.apyMean30d) /
      Math.min(currentTotalApy, pool.apyMean30d)) >= 1.5
  ) {
    return t('rateVolatilityNote', formatApy(currentTotalApy), formatApy(pool.apyMean30d));
  }
  // mirror of PoolDetail.js:746 — tier 2's gate also requires historyPoints >= 1.
  if (pool.kpis && typeof pool.kpis === 'object' && Number(pool.kpis.historyPoints) >= 1) {
    const hp = Number(pool.kpis.historyPoints);
    // mirror of PoolDetail.js:765-769
    if (hp < 7) return t('rateTrackRecordNew');
    const stdev = typeof pool.kpis.apyStdev === 'number' ? pool.kpis.apyStdev : null;
    const cur = poolTotalApy(pool);
    // mirror of PoolDetail.js:770-774
    if (stdev !== null && cur > 0 && (stdev / cur) <= 0.2) return t('rateTrackRecordSteady', hp);
    // mirror of PoolDetail.js:775-777
    return t('rateTrackRecordTracked', hp);
  }
  // mirror of PoolDetail.js:787 — a kpis object IS present but historyPoints < 1
  // fails tier 2's gate (just above) and also fails tier 3's `!(pool.kpis &&
  // typeof pool.kpis === 'object')` condition, so the page renders no note at
  // all here. Mirror that exactly — no note, not a friendlier fallback.
  if (pool.kpis && typeof pool.kpis === 'object') return null;
  // mirror of PoolDetail.js:781-805 (item 207) — no kpis object at all.
  return t('rateHistoryUnavailable');
}

/**
 * Render one pool's Markdown twin — the SAME facts PoolDetail.js states,
 * built from the SAME gated predicates (isAnomalousApy/mean30dSane/
 * getRiskAssessment/projectionFor/rateNote — never a re-derived number).
 * `bakedUrls` is injectable so a test can drive this directly without
 * touching the filesystem; defaults to the real on-disk artifact.
 */
function renderPoolPageMarkdown(pool, generatedDate, bakedUrls) {
  const t = createTranslationFunction('en');
  const genDate = generatedDate || todayGeneratedDate();
  const urls = bakedUrls || loadBakedProtocolUrls();

  const symbol = mdEscape(pool.symbol || pool.pool);
  const project = mdEscape(pool.project || '—');
  const chain = mdEscape(pool.chain || '—');
  const anomalous = isAnomalousApy(pool);
  const poolType = getPoolTypeShared(pool);
  const riskAssessment = getRiskAssessment(pool, poolType, t);
  const totalApy = poolTotalApy(pool);

  const lines = [];
  lines.push(`# ${symbol} — ${project} on ${chain}`);
  lines.push('');

  // Anomalous pools are FLAGGED FIRST, never silently listed clean (trust
  // rail — mirrors the app's demote+flag convention). The APY may still be
  // stated below, but never without this line present.
  if (anomalous) {
    lines.push(`> **${t('calcAnomalyWarning')}**`);
    lines.push('');
  }

  // Total APY, base/reward split — mirror of PoolDetail.js:688-705.
  const baseStr = t('baseApyBreakdown', formatApy(pool.apyBase || 0).replace('%', ''));
  const rewardStr = t('rewardApyBreakdown', formatApy(pool.apyReward || 0).replace('%', ''));
  lines.push(`**${t('totalApy')}:** ${formatApy(totalApy)} (${baseStr} · ${rewardStr})`);
  lines.push('');
  lines.push(`**${t('tvl')}:** ${formatUsd(pool.tvlUsd)}`);
  lines.push('');
  lines.push(`**${t('poolType')}:** ${poolType}`);
  lines.push('');
  // 30d mean APY — omitted entirely (never clamped/cleaned) when unpresentable.
  if (mean30dSane(pool)) {
    lines.push(`**${t('apyMean30d')}:** ${formatApy(pool.apyMean30d)}`);
    lines.push('');
  }
  // Exposure/IL risk — mirror of PoolDetail.js:1561-1615 ("if available",
  // never a fabricated default when the field is absent).
  if (pool.exposure) {
    lines.push(`**${t('exposure')}:** ${mdEscape(pool.exposure)}`);
    lines.push('');
  }
  if (pool.ilRisk) {
    lines.push(`**${t('ilRisk')}:** ${pool.ilRisk === 'yes' ? t('yes') : t('no')}`);
    lines.push('');
  }

  // Risk assessment — mirror of PoolDetail.js:291-364/679.
  lines.push(`## ${t('riskAssessment')}: ${riskAssessment.level}`);
  lines.push('');
  lines.push(riskAssessment.description);
  lines.push('');
  riskAssessment.factors.forEach(f => lines.push(`- ${f}`));
  lines.push('');

  // 5-year projection — mirror of PoolDetail.js:1076-1094/1253-1255. Omitted
  // ENTIRELY for an anomalous pool (showConcreteCta=false's markdown
  // equivalent — no projection, no concrete CTA number, anywhere).
  let showConcreteCta = false;
  let gardenPersona = riskAssessment.score <= 25 ? 'stable' : riskAssessment.score <= 50 ? 'rwa' : 'degen';
  let projectionAmount = null;
  if (!anomalous) {
    const proj = projectionFor(pool, riskAssessment);
    gardenPersona = proj.gardenPersona;
    projectionAmount = proj.projectionAmount;
    showConcreteCta = true;
    lines.push(`## ${t('projectionHeading')}`);
    lines.push('');
    lines.push(t('projectionBody', DEFAULT_INVESTMENT, PROJECTION_YEARS, proj.projectionAmount));
    lines.push('');
    lines.push(t('projectionKeepNote'));
    lines.push('');
    // Degen haircut — MUST be disclosed whenever applied (a haircut applied
    // silently is a trust-rail breach). Headline arg is the un-haircut total
    // APY, mirroring PoolDetail.js:1253-1254 exactly.
    if (proj.applyDegenHaircut) {
      lines.push(t('poolDegenHaircutNote', formatApy(totalApy)));
      lines.push('');
    }
  }

  // Rate note — mirror of PoolDetail.js:740-805. May now be null (a kpis
  // object with historyPoints < 1 renders no note on the page — see rateNote's
  // PoolDetail.js:787 mirror above); only emit the line/blank pair when present,
  // so a null note leaves no stray blank section behind.
  const note = rateNote(pool, t);
  if (note) {
    lines.push(note);
    lines.push('');
  }

  // CTAs — mirror of PoolDetail.js:385/1290-1306 (garden) and PoolDetail.js's
  // renderProtocolCtaBlock (protocol / honest DefiLlama fallback).
  const gardenHref = `${SITE_URL}/plan.html?goal=retirement&pace=${gardenPersona}&capital=${DEFAULT_INVESTMENT}&fm=capital&years=${PROJECTION_YEARS}&src=pool`;
  const gardenLabel = showConcreteCta
    ? t('gardenThisPoolCtaConcrete', projectionAmount, PROJECTION_YEARS)
    : t('gardenThisPoolCta');
  lines.push(`[${mdEscape(gardenLabel)}](${gardenHref})`);
  lines.push('');

  const protocolUrl = withRefParam(resolveProtocolUrl(pool, urls));
  if (protocolUrl) {
    lines.push(`[${mdEscape(t('startEarningOn', pool.project || project))}](${protocolUrl})`);
  } else {
    // True-null case (item 182 leg B) — an honest DefiLlama link, never a
    // fabricated protocol URL.
    const defillamaUrl = `https://defillama.com/yields/pool/${encodeURIComponent(pool.pool)}`;
    lines.push(`[${mdEscape(t('viewOnDefillama'))}](${defillamaUrl}) — ${t('opensDefillamaFallback')}`);
  }
  lines.push('');

  lines.push(t('tcpLastUpdated', genDate));
  lines.push('');

  return lines.join('\n');
}

// --- JSON paint artifact (item 216) -----------------------------------------
// The `seo-pools.json` transient's OWN floor (generate-pools-snapshot.js:306,
// `>= $1,000 TVL`) — stated HONESTLY as this artifact's own `minTvlUsd`, never
// the committed snapshot's $10M `DEFAULT_MIN_TVL`. A sub-rail pool artifact
// claiming a $10M floor would be a false trust claim (item 216's own rule).
const POOL_ARTIFACT_MIN_TVL = 1000;

/** Build the `<id>.json` paint artifact for one pool: envelope() around the
 * SAME projectPool() projection the committed snapshot uses, with `count`/
 * `pools` narrowed to this one record and `minTvlUsd` restated honestly.
 * `generatedAtIso` must be an ISO timestamp (app.js parses it with `new
 * Date(...).getTime()` under the same SNAPSHOT_MAX_AGE_MS gate the snapshot
 * uses) — never todayGeneratedDate()'s human-readable string, which is only
 * for the Markdown twin's visible "Last updated" line. */
function buildPoolArtifact(pool, generatedAtIso) {
  const record = projectPool(pool);
  const artifact = envelope([record], generatedAtIso);
  artifact.minTvlUsd = POOL_ARTIFACT_MIN_TVL;
  return artifact;
}

// --- IO layer ---------------------------------------------------------------

// Snapshot record source (byte-identical to what the rendered page reads via
// app.js's own /data/pools-snapshot.json backfill — the ONLY source carrying
// `kpis`). Returns an empty Map (never throws) on a missing/malformed file so
// a bad snapshot degrades to "fixture tier only", not a crash.
function loadSnapshotPoolMap(snapshotPath) {
  const map = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const arr = Array.isArray(raw && raw.pools) ? raw.pools : [];
    arr.forEach(p => { if (p && p.pool) map.set(p.pool, p); });
  } catch (e) {
    console.warn('⚠️  Snapshot missing/malformed — snapshot tier empty:', snapshotPath, '(' + e.message + ')');
  }
  return map;
}

// Fixture record source — reuses loadFixturePools's own defensive shape
// handling (array or `{data:[...]}`) rather than re-parsing here.
function loadFixturePoolMap(fixturePath) {
  const map = new Map();
  const pools = loadFixturePools(fixturePath);
  (pools || []).forEach(p => { if (p && p.pool) map.set(p.pool, p); });
  return map;
}

// Distinct, UUID-shaped deep-linked pool ids reachable from the given page
// dirs' EN html — scans ONLY the top-level *.html files in each dir (never
// recursing into e.g. tokens/az/, which links other token pages, not pools).
// ko/tokens + ko/chains are NOT scanned separately: they link the identical
// id set as their en counterparts (same pool tables, translated chrome only
// — CLAUDE.md's en-US number-formatting rule already guarantees this), so
// scanning them would only re-discover ids already found here.
function collectDeepLinkedIds(pageDirs) {
  const ids = new Set();
  pageDirs.forEach(dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      console.warn('⚠️  Page dir missing, skipped:', dir);
      return;
    }
    entries
      .filter(d => d.isFile() && d.name.endsWith('.html'))
      .forEach(d => {
        const html = fs.readFileSync(path.join(dir, d.name), 'utf8');
        extractDeepLinkPoolIds(html).forEach(id => {
          if (UUID_RE.test(id)) ids.add(id);
        });
      });
  });
  return ids;
}

function parseArgs(argv) {
  const args = {
    out: 'pools',
    fixture: process.env.POOLS_FIXTURE || null,
    snapshot: 'data/pools-snapshot.json',
    pages: 'tokens,chains'
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--fixture') args.fixture = argv[++i];
    else if (argv[i] === '--snapshot') args.snapshot = argv[++i];
    else if (argv[i] === '--pages') args.pages = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const pageDirs = args.pages.split(',').map(s => s.trim()).filter(Boolean);

  const deepLinkedIds = collectDeepLinkedIds(pageDirs);
  console.log(`🔗 ${deepLinkedIds.size} distinct deep-linked pool ids across ${pageDirs.join(', ')}`);

  const snapshotMap = loadSnapshotPoolMap(args.snapshot);
  const fixtureMap = loadFixturePoolMap(args.fixture);
  const bakedUrls = loadBakedProtocolUrls();
  const genDate = todayGeneratedDate();

  const outDir = path.resolve(args.out);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // Clean stale twins first (mirror of generate-token-pages.js:1087-1093) so
  // an id no longer deep-linked, or no longer resolvable, doesn't linger.
  // Extended (item 216) to sweep `.json` paint artifacts the SAME way, so a
  // pool that leaves the deep-link set cannot leave one behind either.
  if (outDir !== process.cwd()) {
    fs.readdirSync(outDir).forEach(f => {
      if (f.endsWith('.md') || f.endsWith('.json')) fs.rmSync(path.join(outDir, f));
    });
  }

  // ONE ISO timestamp for every `.json` artifact this run writes — mirrors
  // generate-pools-snapshot.js's single `generatedAt` per run (item 216).
  const generatedAtIso = new Date().toISOString();

  let written = 0;
  let skipped = 0;
  let totalBytes = 0;
  deepLinkedIds.forEach(id => {
    const pool = snapshotMap.get(id) || fixtureMap.get(id) || null;
    if (!pool) { skipped++; return; }
    const md = renderPoolPageMarkdown(pool, genDate, bakedUrls);
    fs.writeFileSync(path.join(outDir, `${id}.md`), md);
    const artifact = buildPoolArtifact(pool, generatedAtIso);
    fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(artifact));
    written++;
    totalBytes += Buffer.byteLength(md, 'utf8');
  });

  const meanBytes = written > 0 ? Math.round(totalBytes / written) : 0;
  console.log(`📝 Wrote ${written} pool twins to ${args.out}/`);
  console.log(`⏭️  Skipped ${skipped} ids (no snapshot/fixture record)`);
  console.log(`📦 ${totalBytes} bytes total, ${meanBytes} bytes/file mean`);
}

// module.exports must be assigned BEFORE main() runs (generate-token-pages.js's
// own convention, kept here for consistency even though this module has no
// circular-require hazard of its own).
module.exports = {
  renderPoolPageMarkdown, getPoolTypeShared, mean30dSane, getRiskAssessment,
  projectionFor, rateNote, resolveProtocolUrl, withRefParam,
  loadBakedProtocolUrls, loadSnapshotPoolMap, loadFixturePoolMap,
  collectDeepLinkedIds, parseArgs, UUID_RE, PROJECTION_YEARS, DEFAULT_INVESTMENT,
  buildPoolArtifact, POOL_ARTIFACT_MIN_TVL,
  // Re-exported (not re-derived — it's imported from generate-token-pages.js
  // above) so a mirror test can assert the two mean30dSane copies agree on
  // the SAME rail value, not just the same predicate shape (test_mean30d_mirror.js).
  APY_SANITY_LIMIT
};

if (require.main === module) {
  main();
}
