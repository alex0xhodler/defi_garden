/* /stocks — tokenized-equities terminal (research only).
 *
 * Plain React 18 UMD script, React.createElement only (no JSX, no build step).
 * Data: data/stocks-pools.json, the slim payload written by
 * generate-stocks-snapshot.js (already rail-filtered; the page re-checks the
 * rails defensively). Design/decision record: docs/stocks-terminal.md.
 *
 * Two layers in one file:
 *   1. StocksLogic  - pure functions (sanitising, filtering, sorting, medians,
 *      spotlight, formatting). No DOM, no React; exported for Node tests.
 *   2. The React page - header/nav shared with the landing (landing-styles.css),
 *      market-clock strip, notice, aggregates, spotlight, filterable terminal
 *      table, collateral markets, method notes.
 *
 * Live layer (Phase 4): /api/stocks-onchain is fetched once on load and every
 * 60s while the tab is visible. It adds the token price, the after-hours move
 * ("vs last close", only while the US market is closed) and an on-chain +-2%
 * depth where the pool address is derivable. Every live field is optional: while
 * it loads, or when it fails, the page keeps rendering from the snapshot and the
 * depth cell keeps the labelled TVL estimate.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- logic ---

  var DATA_URL = '/data/stocks-pools.json';
  // Equity rails (docs/stocks-terminal.md). The generator already enforces them;
  // the page drops anything that slipped through rather than trusting the file.
  var EQUITY_APY_CAP = 500;
  var MIN_TVL = 100000;
  var SPOTLIGHT_COUNT = 4;
  // A spotlight card leads only with a pool a saver could plausibly hold: Tier 1-2
  // and a projected APY between 1% and 100%. Near-zero collateral positions and
  // triple-digit farms still appear in the tables, never as the headline.
  var SPOTLIGHT_MIN_PROJ = 1;
  var SPOTLIGHT_MAX_PROJ = 100;
  var ISSUER_SEP = ' + ';
  var SORTS = ['default', 'proj', 'tvl', 'score'];
  var DASH = '—';
  var LIVE_URL = '/api/stocks-onchain';
  var LIVE_REFRESH_MS = 60000;
  var LIVE_TIMEOUT_MS = 8000;
  // A move bigger than this since the close gets the emphasised drift style.
  var DRIFT_NOTABLE_PCT = 1.5;
  var DRIFT_SOURCES = ['pyth', 'defillama-token'];

  var NF_PCT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var NF_COMPACT_2 = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
  var NF_COMPACT_1 = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  var NF_INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var NF_SCORE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
  var NF_PRICE = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var NF_PRICE_SMALL = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  var NF_DRIFT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });

  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function fmtPct(v, dash) { return isNum(v) ? NF_PCT.format(v) + '%' : (dash || DASH); }
  function fmtUsd(v, dash) { return isNum(v) ? '$' + NF_COMPACT_2.format(v) : (dash || DASH); }
  function fmtUsdShort(v, dash) { return isNum(v) ? '$' + NF_COMPACT_1.format(v) : (dash || DASH); }
  function fmtInt(v, dash) { return isNum(v) ? NF_INT.format(v) : (dash || DASH); }
  function fmtScore(v, dash) { return isNum(v) ? NF_SCORE.format(v) : (dash || DASH); }
  function fmtPrice(v, dash) { return isNum(v) && v > 0 ? '$' + (v < 1 ? NF_PRICE_SMALL : NF_PRICE).format(v) : (dash || DASH); }
  function fmtDrift(v, dash) { return isNum(v) ? NF_DRIFT.format(v) + '%' : (dash || DASH); }

  // A date as "Oct 12, 2026" (en-US pinned, like every other number on the site).
  function fmtDate(iso) {
    var d = new Date(iso);
    if (!isFinite(d.getTime())) return DASH;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // "Fri, Oct 16, 7:00 PM EDT" in an explicit zone, or the viewer's own zone.
  function fmtDateTime(date, timeZone) {
    var opts = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
    if (timeZone) opts.timeZone = timeZone;
    try { return new Intl.DateTimeFormat('en-US', opts).format(date); } catch (err) { return DASH; }
  }

  // Keep a pool only when every number it renders is finite and it clears the rails.
  function isValidPool(p) {
    if (!p || typeof p.id !== 'string' || !p.id) return false;
    if (typeof p.symbol !== 'string' || typeof p.chain !== 'string' || typeof p.project !== 'string') return false;
    if (!isNum(p.tvl) || p.tvl < MIN_TVL) return false;
    if (!isNum(p.apy) || p.apy > EQUITY_APY_CAP || p.apy < 0) return false;
    if (!isNum(p.proj) || p.proj < 0) return false;
    if (p.tier !== 1 && p.tier !== 2 && p.tier !== 3) return false;
    return true;
  }

  // Issuer facts (legal entity, jurisdiction, US-person eligibility) for the names
  // a pool carries; unknown names yield no entry, never a guess.
  function issuerInfoFor(issuer, issuers) {
    if (typeof issuer !== 'string' || !issuer || !issuers || typeof issuers !== 'object') return [];
    var out = [];
    issuer.split(ISSUER_SEP).forEach(function (name) {
      var i = Object.prototype.hasOwnProperty.call(issuers, name) ? issuers[name] : null;
      if (!i || typeof i !== 'object') return;
      out.push({
        name: name,
        entity: typeof i.e === 'string' && i.e ? i.e : null,
        jurisdiction: typeof i.j === 'string' && i.j ? i.j : null,
        us: i.us === true || i.us === false ? i.us : null
      });
    });
    return out;
  }

  var TIER_KEYS = { High: 'pillarTierHigh', Medium: 'pillarTierMedium', Low: 'pillarTierLow' };
  function tierOrNull(v) { return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TIER_KEYS, v) ? v : null; }

  // Normalise one pool: finite-or-null for every optional number, so a render
  // path can never print NaN/undefined.
  function normalizePool(p, issuers) {
    var score = p.score && isNum(p.score.v) ? {
      v: p.score.v,
      r: typeof p.score.r === 'string' ? p.score.r : null,
      st: tierOrNull(p.score.st),
      su: tierOrNull(p.score.su),
      sk: tierOrNull(p.score.sk),
      li: tierOrNull(p.score.li)
    } : null;
    var band = Array.isArray(p.band) && isNum(p.band[0]) && isNum(p.band[1]) ? [p.band[0], p.band[1]] : null;
    return {
      id: p.id, symbol: p.symbol, project: p.project, chain: p.chain,
      type: p.type === 'lending' || p.type === 'cl' || p.type === 'amm' ? p.type : 'other',
      underlying: typeof p.underlying === 'string' && p.underlying ? p.underlying : p.symbol,
      etf: p.assetClass === 'etf',
      issuer: typeof p.issuer === 'string' && p.issuer ? p.issuer : null,
      issuerInfo: issuerInfoFor(p.issuer, issuers),
      tvl: p.tvl, tier: p.tier, apy: p.apy, proj: p.proj,
      base: isNum(p.base) ? p.base : null,
      reward: isNum(p.reward) ? p.reward : 0,
      band: band,
      flags: Array.isArray(p.flags) ? p.flags.slice() : [],
      clip: isNum(p.clip) && p.clip >= 0 ? p.clip : null,
      score: score
    };
  }

  function sanitizePools(list, issuers) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (p) {
      if (isValidPool(p)) out.push(normalizePool(p, issuers));
    });
    return out;
  }

  function median(values) {
    var v = values.filter(isNum).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  function isYieldPool(p) { return p.type !== 'lending'; }

  // Tier asc (1 = deepest), then TVL desc, then id for a stable order.
  function byTierThenTvl(a, b) {
    return (a.tier - b.tier) || (b.tvl - a.tvl) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  function sortPools(pools, sort) {
    var list = pools.slice();
    if (sort === 'proj') list.sort(function (a, b) { return (b.proj - a.proj) || byTierThenTvl(a, b); });
    else if (sort === 'tvl') list.sort(function (a, b) { return (b.tvl - a.tvl) || byTierThenTvl(a, b); });
    else if (sort === 'score') {
      list.sort(function (a, b) {
        var sa = a.score ? a.score.v : -1, sb = b.score ? b.score.v : -1;
        return (sb - sa) || byTierThenTvl(a, b);
      });
    } else list.sort(byTierThenTvl);
    return list;
  }

  function filterPools(pools, filters) {
    return pools.filter(function (p) {
      if (filters.chain !== 'all' && p.chain !== filters.chain) return false;
      if (filters.tier !== 'all' && String(p.tier) !== String(filters.tier)) return false;
      return true;
    });
  }

  // Distinct chains present in the data, biggest TVL first (pills are data-driven).
  function chainsOf(pools) {
    var tvl = {};
    var count = {};
    pools.forEach(function (p) { tvl[p.chain] = (tvl[p.chain] || 0) + p.tvl; count[p.chain] = (count[p.chain] || 0) + 1; });
    return Object.keys(tvl).sort(function (a, b) { return (tvl[b] - tvl[a]) || (a < b ? -1 : 1); })
      .map(function (c) { return { chain: c, count: count[c] }; });
  }

  // A pool may lead a spotlight card only at Tier 1-2 with 1% <= projected APY <= 100%.
  function isSpotlightLead(p) {
    return (p.tier === 1 || p.tier === 2) && p.proj >= SPOTLIGHT_MIN_PROJ && p.proj <= SPOTLIGHT_MAX_PROJ;
  }

  // Top underlyings by total TVL across their YIELD pools (all of them: the card
  // still counts every pool). The lead pool is the highest tier (lowest number),
  // then the biggest TVL, among qualifying pools only; an underlying with no
  // qualifying pool is dropped and the next one by TVL takes its place.
  function spotlight(pools, limit) {
    var groups = {};
    pools.filter(isYieldPool).forEach(function (p) {
      var g = groups[p.underlying] || (groups[p.underlying] = { underlying: p.underlying, etf: p.etf, tvl: 0, count: 0, lead: null });
      g.tvl += p.tvl;
      g.count += 1;
      if (isSpotlightLead(p) && (!g.lead || byTierThenTvl(p, g.lead) < 0)) g.lead = p;
    });
    return Object.keys(groups).map(function (k) { return groups[k]; })
      .filter(function (g) { return g.lead !== null; })
      .sort(function (a, b) { return (b.tvl - a.tvl) || (a.underlying < b.underlying ? -1 : 1); })
      .slice(0, limit == null ? SPOTLIGHT_COUNT : limit);
  }

  function aggregates(pools) {
    var total = 0;
    pools.forEach(function (p) { total += p.tvl; });
    return {
      tvl: total,
      count: pools.length,
      medianProj: median(pools.filter(isYieldPool).map(function (p) { return p.proj; }))
    };
  }

  function parseParams(search, chains) {
    var q = new URLSearchParams(search || '');
    var c = q.get('c');
    var t = q.get('tier');
    var s = q.get('sort');
    return {
      chain: c && chains.indexOf(c) >= 0 ? c : 'all',
      tier: t === '1' || t === '2' || t === '3' ? t : 'all',
      sort: SORTS.indexOf(s) >= 0 ? s : 'default'
    };
  }

  // Rewrites only c / tier / sort, leaving lang and anything else untouched.
  function buildSearch(currentSearch, state) {
    var q = new URLSearchParams(currentSearch || '');
    ['c', 'tier', 'sort'].forEach(function (k) { q.delete(k); });
    if (state.chain !== 'all') q.set('c', state.chain);
    if (state.tier !== 'all') q.set('tier', String(state.tier));
    if (state.sort !== 'default') q.set('sort', state.sort);
    var s = q.toString();
    return s ? '?' + s : '';
  }

  // Tooltip sentence for a pool's named issuer(s), from the localized `copy`
  // functions plus the data-driven entity / jurisdiction / US-eligibility facts.
  function issuerTipText(info, copy) {
    if (!info || !info.length) return copy.issuerUnverifiedTip;
    return info.map(function (i) {
      var who = i.entity && i.jurisdiction ? copy.issuerTipEntity(i.entity, i.jurisdiction)
        : i.entity ? copy.issuerTipEntityOnly(i.entity)
        : copy.issuerTipNoEntity(i.name);
      var us = i.us === false ? copy.issuerUsNo : copy.issuerUsUnknown;
      return who + ' ' + us;
    }).join(' ');
  }

  function poolHref(id) { return '/?pool=' + encodeURIComponent(id); }

  // ---- live layer (api/stocks-onchain) ----

  // Keep only finite, well-typed live fields, keyed by pool id. Anything else is
  // dropped so a render path can never print NaN or an unlabelled number.
  function normalizeLive(raw) {
    if (!raw || !Array.isArray(raw.pools) || !raw.market || typeof raw.market !== 'object') return null;
    var byId = {};
    var depthCount = 0;
    raw.pools.forEach(function (p) {
      if (!p || typeof p.pool !== 'string' || !p.pool) return;
      var src = p.driftRef && DRIFT_SOURCES.indexOf(p.driftRef.source) >= 0 ? p.driftRef.source : null;
      var depth = p.depthSource === 'rpc' && isNum(p.depth2pct) && p.depth2pct >= 0 ? p.depth2pct : null;
      if (depth !== null) depthCount += 1;
      byId[p.pool] = {
        price: isNum(p.price) && p.price > 0 ? p.price : null,
        priceTs: typeof p.priceTs === 'string' ? p.priceTs : null,
        drift: src && isNum(p.drift) ? p.drift : null,
        driftSource: src,
        depth: depth,
        depthCapped: depth !== null && p.depthCapped === true
      };
    });
    return {
      generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
      market: { isRegularSession: raw.market.isRegularSession === true, calendarStale: raw.market.calendarStale === true },
      byId: byId,
      depthCount: depthCount
    };
  }

  // After-hours move is shown only while the US regular session is closed, per
  // BOTH the server's session state and this browser's own market clock.
  function driftVisible(live, entry, clientState) {
    if (!live || !entry || !isNum(entry.drift)) return false;
    if (live.market.isRegularSession || live.market.calendarStale) return false;
    return clientState !== 'open';
  }

  // ---- token versions (static data/stocks-versions.json + live ?view=versions) ----

  var VERSIONS_URL = '/data/stocks-versions.json';
  var VERSIONS_LIVE_URL = '/api/stocks-onchain?view=versions';
  var VERSIONS_REFRESH_MS = 60000;
  var DEFAULT_TICKER = 'NVDA';
  var YIELD_KINDS = ['lp', 'lending'];
  var PILLAR_KEYS = ['stability', 'sustainability', 'stickiness', 'liquidity'];
  var REF_MODES = ['live', 'last-close', 'unavailable'];

  function str(v) { return typeof v === 'string' && v ? v : null; }
  function httpsUrl(v) { return typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v) ? v : null; }
  function cleanName(n, ticker) {
    var s = typeof n === 'string' ? n.replace(/\s*\(inferred[^)]*\)/i, '').trim() : '';
    return s && s !== ticker ? s : null;
  }

  // A date-only value ("2026-10-23") is a calendar day: format it in UTC so no
  // viewer timezone can move it to the day before.
  function fmtDayOrDate(v) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      var d = new Date(v + 'T00:00:00Z');
      return isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : DASH;
    }
    return fmtDate(v);
  }

  // One yield candidate (lp or lending): projected APY, DeFi Score rating and the
  // four pillar TIERS (High / Medium / Low). Reads only defiScore.pillarsTier.
  function normalizeCandidate(kind, c) {
    if (!c || typeof c.pool !== 'string' || !c.pool) return null;
    var apy = c.honestProjection;
    if (!isNum(apy) || apy < 0 || apy > EQUITY_APY_CAP) return null;
    var tier = c.tier === 1 || c.tier === 2 || c.tier === 3 ? c.tier : 3;
    var ds = c.defiScore && typeof c.defiScore === 'object' ? c.defiScore : null;
    var pt = ds && ds.pillarsTier && typeof ds.pillarsTier === 'object' ? ds.pillarsTier : {};
    var tiers = {};
    PILLAR_KEYS.forEach(function (k) { tiers[k] = tierOrNull(pt[k]); });
    return {
      kind: kind, pool: c.pool, project: str(c.project), tier: tier, apy: apy,
      rating: ds ? str(ds.rating) : null, tiers: tiers
    };
  }

  // Best yield for a version: both candidates when both exist, the better one
  // first (lower tier number, then higher projected APY).
  function bestYieldCandidates(by) {
    var out = [];
    YIELD_KINDS.forEach(function (k) {
      var c = by && by[k] ? normalizeCandidate(k, by[k]) : null;
      if (c) out.push(c);
    });
    out.sort(function (a, b) { return (a.tier - b.tier) || (b.apy - a.apy); });
    return out;
  }

  function normalizeVersion(v) {
    if (!v || typeof v.key !== 'string' || !v.key) return null;
    var risk = v.risk && typeof v.risk === 'object' ? v.risk : {};
    var liq = v.liquidity && typeof v.liquidity === 'object' ? v.liquidity : {};
    var unknown = v.multiplierUnknown === true || !isNum(v.multiplier) || !(v.multiplier > 0);
    var reasons = v.reasons && typeof v.reasons === 'object' ? v.reasons : {};
    return {
      key: v.key, issuerSlug: str(v.issuerSlug), issuer: str(v.issuer) || str(v.issuerSlug) || DASH,
      chain: str(v.chain) || DASH, symbol: str(v.symbol) || DASH,
      wrapper: !!v.wrapper,
      price: isNum(v.priceUsd) && v.priceUsd > 0 ? v.priceUsd : null,
      priceTs: str(v.priceTs), priceLive: false,
      multiplierUnknown: unknown,
      spreadPct: !unknown && isNum(v.spreadVsMedianPct) ? v.spreadVsMedianPct : null,
      premiumPct: isNum(v.premiumVsClosePct) ? v.premiumVsClosePct : null,
      premiumReason: str(reasons.premium),
      supplyUsd: isNum(v.supplyUsd) && v.supplyUsd >= 0 ? v.supplyUsd : null,
      tvlUsd: isNum(liq.tvlUsd) && liq.tvlUsd >= 0 ? liq.tvlUsd : null,
      depthUsd: isNum(liq.depth2pctUsd) && liq.depth2pctUsd >= 0 ? liq.depth2pctUsd : null,
      yields: bestYieldCandidates(v.bestYield),
      cex: (Array.isArray(v.cex) ? v.cex : []).filter(function (c) {
        return c && typeof c.exchange === 'string' && c.exchange && isNum(c.priceUsd) && c.priceUsd > 0;
      }).map(function (c) { return { exchange: c.exchange, price: c.priceUsd }; }),
      risk: {
        entity: str(risk.legalEntity), jurisdiction: str(risk.jurisdiction),
        us: risk.usPersons === true || risk.usPersons === false ? risk.usPersons : null,
        structure: str(risk.structure), hours: str(risk.mintRedeemHours),
        redemptionMin: isNum(risk.redemptionMinUsd) && risk.redemptionMinUsd >= 0 ? risk.redemptionMinUsd : null
      }
    };
  }

  function normalizeUnverified(u) {
    if (!u || typeof u !== 'object') return null;
    return {
      symbol: str(u.symbol) || DASH, chain: str(u.chain) || DASH,
      price: isNum(u.priceUsd) && u.priceUsd > 0 ? u.priceUsd : null
    };
  }

  function normalizeReference(r) {
    if (!r || typeof r !== 'object' || !isNum(r.price) || !(r.price > 0)) return null;
    if (r.kind !== 'live' && r.kind !== 'last-close') return null;
    return { kind: r.kind, price: r.price, date: str(r.date), ts: str(r.ts) };
  }

  // Static file -> the page's model. null when there is nothing usable.
  function normalizeVersionsData(raw) {
    if (!raw || typeof raw !== 'object' || !raw.tickers || typeof raw.tickers !== 'object') return null;
    var tickers = {};
    Object.keys(raw.tickers).forEach(function (sym) {
      var t = raw.tickers[sym];
      if (!t || typeof t !== 'object') return;
      var versions = (Array.isArray(t.versions) ? t.versions : []).map(normalizeVersion).filter(Boolean);
      var unverified = (Array.isArray(t.unverified) ? t.unverified : []).map(normalizeUnverified).filter(Boolean);
      if (!versions.length && !unverified.length) return;
      tickers[sym] = {
        ticker: sym, name: cleanName(t.name, sym), versions: versions, unverified: unverified,
        median: isNum(t.medianNormalizedPrice) ? t.medianNormalizedPrice : null,
        reference: normalizeReference(t.referenceClose), referenceReason: null
      };
    });
    var issuers = {};
    if (raw.issuers && typeof raw.issuers === 'object') {
      Object.keys(raw.issuers).forEach(function (slug) {
        var i = raw.issuers[slug] || {};
        issuers[slug] = {
          structureSource: httpsUrl(i.structureSource), hoursSource: httpsUrl(i.mintRedeemHoursSource),
          redemptionMinSource: httpsUrl(i.redemptionMinSource)
        };
      });
    }
    var cexNames = {};
    (Array.isArray(raw.cexSources) ? raw.cexSources : []).forEach(function (c) {
      if (c && typeof c.id === 'string' && typeof c.name === 'string' && c.name) cexNames[c.id] = c.name;
    });
    return {
      generatedAt: str(raw.generatedAt), tickers: tickers, issuers: issuers, cexNames: cexNames,
      referenceMode: null, liveAt: null
    };
  }

  // Overlay the live view on the static model, per version: price, premium, spread
  // and the ticker median/reference. A version the live view cannot price keeps its
  // static values. Never mutates `base`. A malformed live payload returns `base`.
  function mergeLive(base, rawLive) {
    if (!base) return base;
    if (!rawLive || typeof rawLive !== 'object' || !rawLive.tickers || typeof rawLive.tickers !== 'object') return base;
    var tickers = {};
    Object.keys(base.tickers).forEach(function (sym) {
      var t = base.tickers[sym];
      var lt = rawLive.tickers[sym];
      if (!lt || typeof lt !== 'object' || !lt.versions || typeof lt.versions !== 'object') { tickers[sym] = t; return; }
      var versions = t.versions.map(function (v) {
        var row = Object.prototype.hasOwnProperty.call(lt.versions, v.key) ? lt.versions[v.key] : null;
        if (!row || !isNum(row.price) || !(row.price > 0)) return v;
        var reasons = row.reasons && typeof row.reasons === 'object' ? row.reasons : {};
        return Object.assign({}, v, {
          price: row.price, priceTs: str(row.priceTs), priceLive: true,
          premiumPct: isNum(row.premiumPct) ? row.premiumPct : null,
          premiumReason: isNum(row.premiumPct) ? null : str(reasons.premium),
          spreadPct: !v.multiplierUnknown && isNum(row.spreadVsMedianPct) ? row.spreadVsMedianPct : null
        });
      });
      tickers[sym] = Object.assign({}, t, {
        versions: versions,
        median: isNum(lt.medianNormalizedPrice) ? lt.medianNormalizedPrice : t.median,
        reference: normalizeReference(lt.reference),
        referenceReason: str(lt.referenceReason)
      });
    });
    return Object.assign({}, base, {
      tickers: tickers,
      referenceMode: REF_MODES.indexOf(rawLive.referenceMode) >= 0 ? rawLive.referenceMode : null,
      liveAt: str(rawLive.generatedAt)
    });
  }

  function totalTvl(t) {
    var s = 0;
    t.versions.forEach(function (v) { if (isNum(v.tvlUsd)) s += v.tvlUsd; });
    return s;
  }

  // Picker order: tickers with >= 2 verified versions first, then the
  // single-version ones; each group by pool TVL desc, then symbol. A ticker with
  // no verified version never appears (its unverified tokens stay out of the picker).
  function sortTickers(data) {
    if (!data) return [];
    return Object.keys(data.tickers).map(function (k) { return data.tickers[k]; })
      .filter(function (t) { return t.versions.length >= 1; })
      .sort(function (a, b) {
        var ga = a.versions.length >= 2 ? 0 : 1, gb = b.versions.length >= 2 ? 0 : 1;
        return (ga - gb) || (totalTvl(b) - totalTvl(a)) || (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);
      });
  }

  function defaultTicker(list) {
    if (!list.length) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].ticker === DEFAULT_TICKER && list[i].versions.length >= 2) return DEFAULT_TICKER;
    }
    return list[0].ticker;
  }

  // ?ticker=NVDA (case-insensitive); anything not in the list is ignored.
  function parseTickerParam(search, list) {
    var v = new URLSearchParams(search || '').get('ticker');
    if (!v) return null;
    var up = v.trim().toUpperCase();
    for (var i = 0; i < list.length; i++) if (list[i].ticker.toUpperCase() === up) return list[i].ticker;
    return null;
  }

  // Rewrites only `ticker`, leaving lang / c / tier / sort untouched.
  function buildTickerSearch(currentSearch, ticker) {
    var q = new URLSearchParams(currentSearch || '');
    q.delete('ticker');
    if (ticker) q.set('ticker', ticker);
    var s = q.toString();
    return s ? '?' + s : '';
  }

  // Search by ticker or name, best matches first (prefix before substring).
  function filterTickers(list, query) {
    var q = typeof query === 'string' ? query.trim().toLowerCase() : '';
    if (!q) return list;
    var scored = [];
    list.forEach(function (t, idx) {
      var sym = t.ticker.toLowerCase(), name = (t.name || '').toLowerCase();
      var rank = sym === q ? 0 : sym.indexOf(q) === 0 ? 1 : name.indexOf(q) === 0 ? 2 : sym.indexOf(q) >= 0 || name.indexOf(q) >= 0 ? 3 : -1;
      if (rank >= 0) scored.push({ t: t, rank: rank, idx: idx });
    });
    return scored.sort(function (a, b) { return (a.rank - b.rank) || (a.idx - b.idx); }).map(function (s) { return s.t; });
  }

  // Verified versions (by supply desc, unknown last) and the separate unverified group.
  function groupVersions(t) {
    var verified = t.versions.slice().sort(function (a, b) {
      var sa = isNum(a.supplyUsd) ? a.supplyUsd : -1, sb = isNum(b.supplyUsd) ? b.supplyUsd : -1;
      return (sb - sa) || (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);
    });
    return { verified: verified, unverified: t.unverified.slice() };
  }

  function staticPageHref(ticker) { return '/stocks/' + String(ticker).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  // Spread and premium cells: text plus the tooltip that explains a dash. `copy` is
  // the localized table. A premium is never shown when null.
  function versionCells(v, copy) {
    var premiumText = DASH, premiumTip;
    if (isNum(v.premiumPct)) { premiumText = fmtDrift(v.premiumPct, DASH); premiumTip = copy.vPremiumTip; }
    else if (v.multiplierUnknown || v.premiumReason === 'multiplier-unknown') premiumTip = copy.vPremiumNoMult;
    else premiumTip = copy.vPremiumNoRef;
    var spreadText = DASH, spreadTip;
    if (isNum(v.spreadPct)) { spreadText = fmtDrift(v.spreadPct, DASH); spreadTip = copy.vSpreadTip; }
    else if (v.multiplierUnknown) spreadTip = copy.vSpreadNoMult;
    else spreadTip = copy.vSpreadNone;
    return { premiumText: premiumText, premiumTip: premiumTip, spreadText: spreadText, spreadTip: spreadTip };
  }

  // One-line reference status above the table.
  function referenceLine(t, copy) {
    var r = t && t.reference;
    if (r && r.kind === 'live') return copy.vRefLive;
    if (r && r.kind === 'last-close') return copy.vRefClose(fmtDayOrDate(r.date || r.ts));
    return copy.vRefNone;
  }

  function cexLines(v, cexNames) {
    return v.cex.slice().sort(function (a, b) { return a.exchange < b.exchange ? -1 : 1; }).map(function (c) {
      var name = cexNames && cexNames[c.exchange] ? cexNames[c.exchange] : c.exchange.charAt(0).toUpperCase() + c.exchange.slice(1);
      return { exchange: name, text: name + ' ' + fmtPrice(c.price, DASH) };
    });
  }

  // Structure / redemption facts, each with its registry source link (https only).
  function riskFacts(v, issuers, copy) {
    var src = (v.issuerSlug && issuers && issuers[v.issuerSlug]) || {};
    var out = [];
    if (v.risk.structure) out.push({ key: 'structure', label: copy.vStructure, text: v.risk.structure, href: src.structureSource || null });
    if (v.risk.hours) out.push({ key: 'hours', label: copy.vHours, text: v.risk.hours, href: src.hoursSource || null });
    if (isNum(v.risk.redemptionMin)) out.push({ key: 'min', label: copy.vRedeemMin, text: fmtUsd(v.risk.redemptionMin, DASH), href: src.redemptionMinSource || null });
    return out;
  }

  function issuerInfoOf(v) {
    return [{ name: v.issuer, entity: v.risk.entity, jurisdiction: v.risk.jurisdiction, us: v.risk.us }];
  }

  // EN + KO strings of the token-versions section. They live here (not in
  // translations.js) so the section ships without touching the shared dictionary;
  // fold them into translations.js `stocks` when convenient.
  var VERSIONS_COPY = {
    en: {
      vTitle: 'Token versions',
      vSub: 'The same stock, issued by different companies on different chains: on-chain price, how far the versions sit from each other, premium to the real share, liquidity, yield, exchange prices and redemption terms. Research only, not advice.',
      vPickerLabel: 'Stock', vSearchLabel: 'Search ticker or name', vSearchPlaceholder: 'Search ticker or name',
      vNoMatch: 'No stock matches this search.', vGroupMulti: 'Two or more versions', vGroupSingle: 'One version',
      vVersionCount: function (n) { return n + (n === '1' ? ' version' : ' versions'); },
      vMarketLabel: 'US market',
      vRefLive: 'Reference: Pyth live',
      vRefClose: function (d) { return 'Reference: last regular close ' + d; },
      vRefNone: 'Reference price unavailable right now. Spreads vs the median of token versions are still shown.',
      vLoading: 'Loading token versions...',
      vError: 'Token versions are unavailable right now.',
      vStaticNote: function (d) { return 'Static snapshot from ' + d + '. Live prices are not available right now.'; },
      vLiveNote: function (t) { return 'Live prices updated ' + t + '. Refreshes every minute.'; },
      vLiveLoading: 'Loading live prices on top of the static snapshot...',
      vStaticLink: function (t) { return 'Open the static ' + t + ' comparison page'; },
      vColIssuer: 'Issuer', vColChain: 'Chain', vColPrice: 'On-chain price',
      vColSpread: 'Spread vs median of token versions', vColPremium: 'Premium vs share',
      vColSupply: 'Supply (USD)', vColLiquidity: 'Liquidity', vColYield: 'Best yield', vColCex: 'Exchanges',
      vColStructure: 'Structure & redemption',
      vSpreadTip: 'Compared with the median price of this stock\'s token versions (normalized per share). It is not a premium vs the real share.',
      vSpreadNoMult: 'Multiplier unknown: excluded from the median',
      vSpreadNone: 'No comparable price available for this version right now.',
      vPremiumTip: 'Token price vs the real share: price / (shares per token x reference price) - 1. The reference is labelled above the table.',
      vPremiumNoRef: 'Reference price unavailable',
      vPremiumNoMult: 'Multiplier unknown: no premium computed',
      vPriceTip: function (when) { return 'On-chain price from the DefiLlama coins aggregator, as of ' + when + '.'; },
      vPoolTvl: 'pool TVL', vDepth: function (v) { return '±2% depth ' + v; },
      vDepthTip: 'Estimated swap depth within 2% of the pool price.',
      vYieldLp: 'LP', vYieldLending: 'Lending', vPillarTiers: 'Pillar tiers',
      vYieldApyLabel: 'projected APY',
      vYieldScore: function (r) { return 'DeFi Score ' + r; },
      vOpenPool: 'Open pool', vOpenPoolFor: function (n) { return 'Open the ' + n + ' pool analysis'; },
      vCexNone: 'Not listed',
      vStructure: 'Structure', vHours: 'Mint/redeem hours', vRedeemMin: 'Redemption minimum', vSource: 'source',
      vNoFacts: 'No published terms',
      vUnverified: function (n) { return 'Unverified tokens (' + n + ')'; },
      vUnverifiedFlag: 'Issuer unverified',
      vUnverifiedNote: 'Not checked against an issuer. Excluded from every median and summary.',
      vNotes: 'Prices come from an on-chain aggregator, not from the issuers. The spread compares token versions with each other; only the premium compares with the real share, and only when a reference price exists. Education, not investment advice.'
    },
    ko: {
      vTitle: '토큰 버전 비교',
      vSub: '같은 주식을 여러 발행사가 여러 체인에 토큰으로 낸 경우의 온체인 가격, 버전 간 차이, 실제 주식 대비 프리미엄, 유동성, 수익률, 거래소 가격, 상환 조건을 비교합니다. 리서치용이며 투자 조언이 아닙니다.',
      vPickerLabel: '종목', vSearchLabel: '티커 또는 이름 검색', vSearchPlaceholder: '티커 또는 이름 검색',
      vNoMatch: '검색과 일치하는 종목이 없습니다.', vGroupMulti: '버전 2개 이상', vGroupSingle: '버전 1개',
      vVersionCount: function (n) { return '버전 ' + n + '개'; },
      vMarketLabel: '미국 시장',
      vRefLive: '기준가: Pyth 실시간',
      vRefClose: function (d) { return '기준가: 마지막 정규장 종가 ' + d; },
      vRefNone: '지금은 기준가를 가져올 수 없습니다. 토큰 버전 중앙값 대비 차이는 계속 표시됩니다.',
      vLoading: '토큰 버전을 불러오는 중...',
      vError: '지금은 토큰 버전을 불러올 수 없습니다.',
      vStaticNote: function (d) { return d + ' 기준 정적 스냅샷입니다. 지금은 실시간 가격을 가져올 수 없습니다.'; },
      vLiveNote: function (t) { return '실시간 가격 업데이트 ' + t + '. 1분마다 새로고침됩니다.'; },
      vLiveLoading: '정적 스냅샷 위에 실시간 가격을 불러오는 중...',
      vStaticLink: function (t) { return t + ' 정적 비교 페이지 열기'; },
      vColIssuer: '발행사', vColChain: '체인', vColPrice: '온체인 가격',
      vColSpread: '토큰 버전 중앙값 대비 차이', vColPremium: '주식 대비 프리미엄',
      vColSupply: '공급량 (USD)', vColLiquidity: '유동성', vColYield: '최고 수익률', vColCex: '거래소',
      vColStructure: '구조 · 상환',
      vSpreadTip: '이 종목 토큰 버전들의 중앙값(주당으로 환산)과 비교한 값입니다. 실제 주식 대비 프리미엄이 아닙니다.',
      vSpreadNoMult: '배수 미확인: 중앙값에서 제외됨',
      vSpreadNone: '지금은 이 버전의 비교 가능한 가격이 없습니다.',
      vPremiumTip: '실제 주식 대비 토큰 가격: 가격 / (토큰당 주식 수 x 기준가) - 1. 기준가는 표 위에 표시됩니다.',
      vPremiumNoRef: '기준가를 가져올 수 없음',
      vPremiumNoMult: '배수 미확인: 프리미엄을 계산하지 않음',
      vPriceTip: function (when) { return 'DefiLlama 코인 집계기의 온체인 가격 (' + when + ' 기준).'; },
      vPoolTvl: '풀 TVL', vDepth: function (v) { return '±2% 깊이 ' + v; },
      vDepthTip: '풀 가격 기준 2% 이내로 거래할 수 있는 추정 규모입니다.',
      vYieldLp: 'LP', vYieldLending: '렌딩', vPillarTiers: '필러 등급',
      vYieldApyLabel: '예상 APY',
      vYieldScore: function (r) { return 'DeFi 점수 ' + r; },
      vOpenPool: '풀 열기', vOpenPoolFor: function (n) { return n + ' 풀 분석 열기'; },
      vCexNone: '상장 없음',
      vStructure: '구조', vHours: '발행·상환 시간', vRedeemMin: '최소 상환액', vSource: '출처',
      vNoFacts: '공개된 조건 없음',
      vUnverified: function (n) { return '미확인 토큰 (' + n + ')'; },
      vUnverifiedFlag: '발행사 미확인',
      vUnverifiedNote: '발행사 확인을 거치지 않았습니다. 모든 중앙값과 요약에서 제외됩니다.',
      vNotes: '가격은 발행사가 아닌 온체인 집계기에서 가져옵니다. 차이는 토큰 버전끼리 비교한 값이며, 기준가가 있을 때만 프리미엄으로 실제 주식과 비교합니다. 교육용이며 투자 조언이 아닙니다.'
    }
  };

  var logic = {
    DATA_URL: DATA_URL, EQUITY_APY_CAP: EQUITY_APY_CAP, MIN_TVL: MIN_TVL, SORTS: SORTS, DASH: DASH,
    LIVE_URL: LIVE_URL, DRIFT_NOTABLE_PCT: DRIFT_NOTABLE_PCT, normalizeLive: normalizeLive, driftVisible: driftVisible,
    fmtPrice: fmtPrice, fmtDrift: fmtDrift,
    isNum: isNum, fmtPct: fmtPct, fmtUsd: fmtUsd, fmtUsdShort: fmtUsdShort, fmtInt: fmtInt, fmtScore: fmtScore,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime,
    isValidPool: isValidPool, normalizePool: normalizePool, sanitizePools: sanitizePools,
    median: median, isYieldPool: isYieldPool, sortPools: sortPools, filterPools: filterPools,
    chainsOf: chainsOf, spotlight: spotlight, isSpotlightLead: isSpotlightLead, aggregates: aggregates,
    issuerInfoFor: issuerInfoFor, issuerTipText: issuerTipText,
    SPOTLIGHT_MIN_PROJ: SPOTLIGHT_MIN_PROJ, SPOTLIGHT_MAX_PROJ: SPOTLIGHT_MAX_PROJ,
    parseParams: parseParams, buildSearch: buildSearch, poolHref: poolHref,
    VERSIONS_URL: VERSIONS_URL, VERSIONS_LIVE_URL: VERSIONS_LIVE_URL, VERSIONS_COPY: VERSIONS_COPY, DEFAULT_TICKER: DEFAULT_TICKER,
    normalizeVersionsData: normalizeVersionsData, mergeLive: mergeLive, sortTickers: sortTickers, defaultTicker: defaultTicker,
    parseTickerParam: parseTickerParam, buildTickerSearch: buildTickerSearch, filterTickers: filterTickers,
    groupVersions: groupVersions, bestYieldCandidates: bestYieldCandidates, versionCells: versionCells,
    referenceLine: referenceLine, cexLines: cexLines, riskFacts: riskFacts, issuerInfoOf: issuerInfoOf,
    staticPageHref: staticPageHref, fmtDayOrDate: fmtDayOrDate
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  if (typeof window === 'undefined' || !root.React || !root.ReactDOM) return;

  // ----------------------------------------------------------------- page ---

  var R = root.React;
  var e = R.createElement;
  var useEffect = R.useEffect;
  var useState = R.useState;
  var useRef = R.useRef;
  var useMemo = R.useMemo;

  // Score pillar NAMES; values are tiers (High / Medium / Low, pillarsTier), never numbers.
  var SCORE_PILLARS = [
    { key: 'st', labelKey: 'pillarStability' },
    { key: 'su', labelKey: 'pillarSustainability' },
    { key: 'sk', labelKey: 'pillarStickiness' },
    { key: 'li', labelKey: 'pillarLiquidity' }
  ];
  var CLOCK_TICK_MS = 30000;
  var ET_ZONE = 'America/New_York';

  function detectLanguage() {
    try {
      var saved = root.localStorage.getItem('defi-garden-lang');
      if (saved === 'en' || saved === 'ko') return saved;
    } catch (err) { /* private mode: fall through */ }
    var param = new URLSearchParams(root.location.search).get('lang');
    if (param === 'en' || param === 'ko') return param;
    return (root.navigator.language || '').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
  }

  // `translations` and `Analytics` are top-level `const`s in their (classic)
  // scripts: reachable as bare globals, but NOT as window properties.
  function dict() { return typeof translations !== 'undefined' ? translations : {}; }

  function stocksCopy(language) {
    var all = dict();
    var en = (all.en && all.en.stocks) || {};
    var own = (all[language] && all[language].stocks) || {};
    return Object.assign({}, en, VERSIONS_COPY.en, own, VERSIONS_COPY[language] || {});
  }

  // Shared header/nav strings live in the landing subtree.
  function landingCopy(language) {
    var all = dict();
    return Object.assign({}, (all.en && all.en.landing) || {}, (all[language] && all[language].landing) || {});
  }

  function rootCopy(language) {
    var all = dict();
    return Object.assign({}, all.en || {}, all[language] || {});
  }

  function initialDark() {
    try {
      var saved = root.localStorage.getItem('theme');
      if (saved) return saved === 'dark';
    } catch (err) { /* ignore */ }
    return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function track(name, props) {
    try { if (typeof Analytics !== 'undefined') Analytics.track(name, props || {}); } catch (err) { /* analytics never breaks the page */ }
  }

  function LeafMark() {
    return e('svg', {
      className: 'landing-leaf-mark', viewBox: '0 0 32 32', width: 24, height: 24,
      preserveAspectRatio: 'xMidYMid meet', fill: 'none', 'aria-hidden': 'true'
    },
      e('path', { d: 'M26.7 4.8C16.2 5.2 8.2 10.7 7.1 20.4c-.3 2.8.7 5.2 2.4 6.8 1.6-8.5 6.5-14.6 14.1-18.2-4.5 3.9-7.6 8.7-9 14.6 3.1-3.9 7-6.8 11.7-8.8.8-2.8.9-6 .4-10Z', fill: 'currentColor' }),
      e('path', { d: 'M8.8 27.2c3.2-5.1 7.2-8.9 12.2-11.4', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round' })
    );
  }

  // Tooltip: opens on hover, focus or tap; Esc / outside tap closes; the popover
  // is nudged back inside the viewport so it can never cause horizontal scroll.
  var tipSeq = 0;
  function Tip(props) {
    var openState = useState(false);
    var open = openState[0];
    var setOpen = openState[1];
    var shiftState = useState(0);
    var shift = shiftState[0];
    var setShift = shiftState[1];
    var idRef = useRef(null);
    if (idRef.current === null) idRef.current = 'stocks-tip-' + (++tipSeq);
    var wrapRef = useRef(null);
    var popRef = useRef(null);

    useEffect(function () {
      if (!open) { setShift(0); return undefined; }
      var pop = popRef.current;
      if (pop) {
        var rect = pop.getBoundingClientRect();
        var vw = root.document.documentElement.clientWidth;
        var dx = 0;
        if (rect.right > vw - 8) dx = (vw - 8) - rect.right;
        if (rect.left + dx < 8) dx = 8 - rect.left;
        if (dx) setShift(dx);
      }
      function onDoc(ev) { if (wrapRef.current && !wrapRef.current.contains(ev.target)) setOpen(false); }
      function onKey(ev) { if (ev.key === 'Escape') setOpen(false); }
      root.document.addEventListener('pointerdown', onDoc);
      root.document.addEventListener('keydown', onKey);
      return function () {
        root.document.removeEventListener('pointerdown', onDoc);
        root.document.removeEventListener('keydown', onKey);
      };
    }, [open]);

    return e('span', {
      className: 'stocks-tip', ref: wrapRef,
      onMouseEnter: function () { setOpen(true); },
      onMouseLeave: function () { setOpen(false); }
    },
      e('button', {
        type: 'button', className: 'stocks-tip-btn', 'aria-describedby': open ? idRef.current : undefined,
        'aria-label': props.label || undefined,
        onFocus: function () { setOpen(true); },
        onBlur: function () { setOpen(false); },
        onClick: function () { setOpen(!open); }
      }, props.children),
      open ? e('span', {
        id: idRef.current, role: 'tooltip', className: 'stocks-tip-pop', ref: popRef,
        style: shift ? { transform: 'translateX(' + shift + 'px)' } : undefined
      }, props.text) : null
    );
  }

  // ---- market-clock strip ----

  function ClockStrip(props) {
    var copy = props.copy;
    var clock = root.StocksMarketClock;
    var nowState = useState(function () { return new Date(); });
    var now = nowState[0];
    var setNow = nowState[1];
    useEffect(function () {
      var timer = root.setInterval(function () { setNow(new Date()); }, CLOCK_TICK_MS);
      return function () { root.clearInterval(timer); };
    }, []);
    if (!clock) return null;

    var st = clock.getMarketState(now);
    if (st.calendarStale) {
      return e('div', { className: 'stocks-status', 'data-testid': 'stocks-clock', 'data-state': 'stale' },
        e('span', { className: 'stocks-status-dot', 'aria-hidden': 'true' }),
        e('span', { className: 'dt-panel-label' }, copy.clockLabel),
        e(Tip, { text: copy.clockStaleTip }, e('span', { className: 'stocks-status-state' }, copy.clockStale))
      );
    }

    var tipKey = st.state === 'open' ? 'clockTipOpen' : (st.state === 'pre' || st.state === 'after') ? 'clockTipExtended' : 'clockTipClosed';
    var nextText = null;
    if (st.nextChangeAt && st.nextState) {
      nextText = copy.clockNext(copy[clock.LABEL_KEYS[st.nextState]], fmtDateTime(st.nextChangeAt), fmtDateTime(st.nextChangeAt, ET_ZONE));
    }
    return e('div', { className: 'stocks-status', 'data-testid': 'stocks-clock', 'data-state': st.state },
      e('span', { className: 'stocks-status-dot' + (st.state === 'open' ? ' is-open' : ''), 'aria-hidden': 'true' }),
      e('span', { className: 'dt-panel-label' }, copy.clockLabel),
      e(Tip, { text: copy[tipKey] }, e('span', { className: 'stocks-status-state' }, copy[st.labelKey])),
      st.isEarlyClose ? e('span', { className: 'dt-engine-pill' }, copy.clockEarlyClose) : null,
      nextText ? e('span', { className: 'stocks-status-next' }, nextText) : null
    );
  }

  // ---- shared header ----

  function Header(props) {
    var lc = props.landing;
    var menuState = useState(false);
    var menuOpen = menuState[0];
    var setMenuOpen = menuState[1];
    var scrollState = useState(false);
    var scrolled = scrollState[0];
    var setScrolled = scrollState[1];
    useEffect(function () {
      function onScroll() {
        var s = root.scrollY > 4;
        setScrolled(function (prev) { return prev !== s ? s : prev; });
      }
      root.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return function () { root.removeEventListener('scroll', onScroll); };
    }, []);

    function link(href, label, extra, mobile) {
      var attrs = Object.assign({ href: href }, extra || {});
      if (mobile) attrs.onClick = function () { setMenuOpen(false); };
      return e('a', attrs, label);
    }
    var links = function (mobile) {
      return [
        link('/?app=1', lc.navSearch, { key: 'search' }, mobile),
        link('/stocks', lc.navStocks || 'Stocks', { key: 'stocks', 'aria-current': 'page' }, mobile),
        link('/methodology', lc.navMethodology || 'Methodology', { key: 'methodology' }, mobile),
        link('/mcp', lc.navApi || 'API', { key: 'api' }, mobile)
      ];
    };

    return e(R.Fragment, null,
      e('header', { className: 'landing-header' + (scrolled ? ' is-scrolled' : '') },
        e('a', { className: 'landing-brand', href: '/', 'aria-label': lc.navSearch },
          e('span', { className: 'landing-brand-mark' }, e(LeafMark)),
          e('span', null, 'DeFi Garden')
        ),
        e('nav', { className: 'landing-nav', 'aria-label': lc.navPrimary }, links(false)),
        e('div', { className: 'landing-header-actions' },
          root.LangMenu ? e(root.LangMenu.Menu, {
            language: props.language, onSelect: props.onLanguage,
            onOpen: function () { setMenuOpen(false); }, triggerClassName: 'landing-icon-button'
          }) : null,
          e('button', {
            type: 'button', className: 'landing-icon-button landing-theme-button',
            onClick: function () { props.onTheme(!props.dark); },
            'aria-label': props.dark ? lc.themeLight : lc.themeDark
          }, props.dark ? '☼' : '☾'),
          e('button', {
            type: 'button', className: 'landing-menu-button', onClick: function () { setMenuOpen(!menuOpen); },
            'aria-label': menuOpen ? lc.navClose : lc.navMenu, 'aria-expanded': menuOpen ? 'true' : 'false'
          }, menuOpen ? '×' : '☰')
        )
      ),
      e('nav', { className: 'landing-mobile-nav' + (menuOpen ? ' is-open' : ''), 'aria-label': lc.navMobile }, links(true))
    );
  }

  // ---- row model (one place to add Phase 4 price / drift) ----

  function typeLabel(copy, type) {
    return type === 'cl' ? copy.typeCl : type === 'amm' ? copy.typeAmm : type === 'lending' ? copy.typeLending : copy.typeOther;
  }

  function tierLabel(copy, tier) { return copy['tier' + tier]; }

  function IssuerCell(props) {
    var p = props.pool, copy = props.copy;
    return e('div', { className: 'stocks-chain-cell' },
      e('span', { className: 'stocks-chain' }, p.chain),
      p.issuer
        ? e('span', { className: 'stocks-sub', 'data-testid': 'stocks-issuer' },
            e(Tip, { text: issuerTipText(p.issuerInfo, copy) }, p.issuer))
        : e('span', { className: 'dt-engine-pill stocks-badge' },
            e(Tip, { text: copy.issuerUnverifiedTip }, copy.issuerUnverified))
    );
  }

  function ScoreCell(props) {
    var s = props.pool.score, copy = props.copy;
    if (!s) return e('span', { className: 'stocks-muted' }, copy.scoreNone);
    var pillars = SCORE_PILLARS.map(function (pl) {
      return tierOrNull(s[pl.key]) ? copy[pl.labelKey] + ' ' + copy[TIER_KEYS[s[pl.key]]] : copy[pl.labelKey];
    }).join(' · ');
    return e('div', { className: 'stocks-score' },
      e(Tip, { text: pillars + '. ' + copy.scoreTip, label: copy.colScore + ' ' + fmtScore(s.v, copy.dash) },
        e('span', { className: 'stocks-score-num' }, fmtScore(s.v, copy.dash))),
      s.r ? e('span', { className: 'stocks-sub stocks-score-rating' }, s.r) : null
    );
  }

  function ApyCell(props) {
    var p = props.pool, copy = props.copy;
    var tip = p.reward > 0 && p.base != null
      ? copy.apyTipBase(fmtPct(p.base, copy.dash), fmtPct(p.reward, copy.dash), fmtPct(p.proj, copy.dash), fmtPct(p.apy, copy.dash))
      : copy.apyTipFlat(fmtPct(p.apy, copy.dash));
    return e('div', { className: 'stocks-apy-cell' },
      e(Tip, { text: tip, label: copy.apyTipLabel },
        e('span', { className: 'stocks-apy-num' }, fmtPct(p.proj, copy.dash))),
      e('span', { className: 'stocks-sub' }, copy.headlineApy(fmtPct(p.apy, copy.dash))),
      p.band ? e('span', { className: 'stocks-sub stocks-band' },
        e(Tip, { text: copy.bandTip + ' ' + props.forecastNote },
          copy.bandLabel(fmtPct(p.band[0], copy.dash), fmtPct(p.band[1], copy.dash)))) : null
    );
  }

  function TvlCell(props) {
    var p = props.pool, copy = props.copy;
    var tvl = props.tierMin;
    var floor = function (t) { return fmtUsd(tvl[t], copy.dash); };
    var tip = p.tier === 1 ? copy.tierTip1(floor(1))
      : p.tier === 2 ? copy.tierTip2(floor(2), floor(1)) : copy.tierTip3(floor(3), floor(2));
    return e('div', { className: 'stocks-tvl-cell' },
      e('span', { className: 'stocks-tvl' }, fmtUsd(p.tvl, copy.dash)),
      e('span', { className: 'stocks-sub' },
        e(Tip, { text: tip }, p.tier === 3 ? copy.thinLiquidity : tierLabel(copy, p.tier)))
    );
  }

  // Depth: the on-chain +-2% figure when the live layer measured it, otherwise the
  // TVL-based estimate with its own label. The two are never mixed in one label.
  function ClipCell(props) {
    var p = props.pool, copy = props.copy, live = props.live;
    if (live && isNum(live.depth)) {
      var tip = copy.depthTip + (live.depthCapped ? ' ' + copy.depthCappedNote : '');
      return e('div', { className: 'stocks-clip-cell', 'data-source': 'rpc' },
        e('span', { className: 'stocks-clip' }, fmtUsdShort(live.depth, copy.dash)),
        e('span', { className: 'stocks-sub' }, e(Tip, { text: tip }, copy.depthOnchain))
      );
    }
    return e('div', { className: 'stocks-clip-cell', 'data-source': 'heuristic' },
      e('span', { className: 'stocks-clip' }, fmtUsdShort(p.clip, copy.dash)),
      e('span', { className: 'stocks-sub' }, e(Tip, { text: props.tip || copy.clipTip }, copy.clipEst))
    );
  }

  // Token price from the live layer, plus the after-hours move once the US market
  // is closed. With no live data the cell is a dash; it never invents a value.
  function PriceCell(props) {
    var copy = props.copy, live = props.live;
    if (!live || !isNum(live.price)) {
      return e('div', { className: 'stocks-price-cell', 'data-state': props.loading ? 'loading' : 'none' },
        e('span', { className: 'stocks-muted' }, copy.dash));
    }
    var when = live.priceTs ? fmtDateTime(new Date(live.priceTs)) : copy.dash;
    var drift = props.showDrift ? e('span', {
      className: 'stocks-sub stocks-drift' + (Math.abs(live.drift) >= DRIFT_NOTABLE_PCT ? ' is-notable' : ''),
      'data-testid': 'stocks-drift'
    }, e(Tip, { text: live.driftSource === 'pyth' ? copy.driftTipUnderlying : copy.driftTipToken }, copy.driftVsClose(fmtDrift(live.drift, copy.dash)))) : null;
    return e('div', { className: 'stocks-price-cell', 'data-state': 'ready' },
      e(Tip, { text: copy.priceTip(when), label: copy.colPrice }, e('span', { className: 'stocks-price', 'data-testid': 'stocks-price' }, fmtPrice(live.price, copy.dash))),
      drift
    );
  }

  function ActionLink(props) {
    var p = props.pool, copy = props.copy;
    return e('a', {
      className: 'btn btn--secondary btn--sm stocks-action', href: poolHref(p.id),
      'aria-label': copy.openAnalysisFor(p.symbol), 'data-testid': 'stocks-open-pool',
      onClick: function () { track('stocks_open_pool', { pool: p.id, symbol: p.symbol, chain: p.chain, project: p.project, tier: p.tier, source: props.source }); }
    }, copy.openAnalysis, ' →');
  }

  function PairCell(props) {
    var p = props.pool, copy = props.copy;
    var badges = [];
    if (p.flags.indexOf('forcedHighIL') >= 0) {
      badges.push(e('span', { key: 'il', className: 'dt-engine-pill stocks-badge stocks-badge--warn' }, e(Tip, { text: copy.badgeHighIlTip }, copy.badgeHighIl)));
    }
    if (p.flags.indexOf('nearZeroYield') >= 0) {
      badges.push(e('span', { key: 'zero', className: 'dt-engine-pill stocks-badge' }, copy.badgeNearZero));
    }
    if (props.redemption) {
      badges.push(e('span', { key: 'red', className: 'dt-engine-pill stocks-badge' }, e(Tip, { text: copy.badgeRedemptionTip }, copy.badgeRedemption)));
    }
    return e('div', { className: 'stocks-pair-cell' },
      e('span', { className: 'stocks-pair-name' }, p.symbol, p.etf ? e('span', { className: 'dt-engine-pill stocks-badge stocks-etf' }, copy.assetEtf) : null),
      e('span', { className: 'stocks-sub' }, p.project + ' · ' + typeLabel(copy, p.type)),
      badges.length ? e('span', { className: 'stocks-badges' }, badges) : null
    );
  }

  function SortHeader(props) {
    var active = props.sort === props.sortKey;
    return e('th', { scope: 'col', 'aria-sort': active ? 'descending' : 'none', className: 'dt-panel-label' },
      e('button', {
        type: 'button', className: 'stocks-th-btn' + (active ? ' is-active' : ''),
        onClick: function () { props.onSort(active ? 'default' : props.sortKey); }
      }, props.label, e('span', { 'aria-hidden': 'true', className: 'stocks-sort-mark' }, active ? ' ↓' : ''))
    );
  }

  function YieldTable(props) {
    var copy = props.copy;
    return e('table', { className: 'stocks-table', 'data-testid': 'stocks-yield-table' },
      e('thead', null, e('tr', null,
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.colPair),
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.colChain),
        e(SortHeader, { label: copy.colScore, sortKey: 'score', sort: props.sort, onSort: props.onSort }),
        e(SortHeader, { label: copy.colApy, sortKey: 'proj', sort: props.sort, onSort: props.onSort }),
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.colPrice),
        e(SortHeader, { label: copy.colTvl, sortKey: 'tvl', sort: props.sort, onSort: props.onSort }),
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.colClip),
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.colAction)
      )),
      e('tbody', null, props.pools.map(function (p) {
        var lv = props.live ? props.live.byId[p.id] || null : null;
        return e('tr', { key: p.id, 'data-testid': 'stocks-row', 'data-tier': p.tier },
          e('td', { className: 'stocks-td-pair' }, e(PairCell, { pool: p, copy: copy, redemption: true })),
          e('td', { 'data-label': copy.colChain }, e(IssuerCell, { pool: p, copy: copy })),
          e('td', { 'data-label': copy.colScore }, e(ScoreCell, { pool: p, copy: copy })),
          e('td', { 'data-label': copy.colApy }, e(ApyCell, { pool: p, copy: copy, forecastNote: props.forecastNote })),
          e('td', { 'data-label': copy.colPrice }, e(PriceCell, { copy: copy, live: lv, loading: props.liveLoading, showDrift: driftVisible(props.live, lv, props.clientState) })),
          e('td', { 'data-label': copy.colTvl }, e(TvlCell, { pool: p, copy: copy, tierMin: props.tierMin })),
          e('td', { 'data-label': copy.colClip }, e(ClipCell, { pool: p, copy: copy, live: lv })),
          e('td', { className: 'stocks-td-action' }, e(ActionLink, { pool: p, copy: copy, source: 'terminal' }))
        );
      }))
    );
  }

  function CollateralTable(props) {
    var copy = props.copy;
    return e('table', { className: 'stocks-table stocks-table--collateral', 'data-testid': 'stocks-collateral-table' },
      e('thead', null, e('tr', null,
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.collColMarket),
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.filterChain),
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.colTvl),
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.collColSupply),
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.colClip),
        e('th', { scope: 'col', className: 'dt-panel-label' }, copy.colAction)
      )),
      e('tbody', null, props.pools.map(function (p) {
        return e('tr', { key: p.id, 'data-testid': 'stocks-collateral-row' },
          e('td', { className: 'stocks-td-pair' }, e(PairCell, { pool: p, copy: copy, redemption: false })),
          e('td', { 'data-label': copy.filterChain }, e(IssuerCell, { pool: p, copy: copy })),
          e('td', { 'data-label': copy.colTvl }, e(TvlCell, { pool: p, copy: copy, tierMin: props.tierMin })),
          e('td', { 'data-label': copy.collColSupply }, e('span', { className: 'stocks-apy-num stocks-apy-num--plain' }, fmtPct(p.apy, copy.dash))),
          e('td', { 'data-label': copy.colClip }, e(ClipCell, { pool: p, copy: copy, tip: copy.collClipTip })),
          e('td', { className: 'stocks-td-action' }, e(ActionLink, { pool: p, copy: copy, source: 'collateral' }))
        );
      }))
    );
  }

  function Chip(props) {
    return e('button', {
      type: 'button', className: 'filter-pill chain-pill' + (props.active ? ' active' : ''),
      'aria-pressed': props.active ? 'true' : 'false', 'data-testid': props.testid, onClick: props.onClick
    }, props.children);
  }

  function leadDepth(lead, live, copy) {
    var lv = live ? live.byId[lead.id] : null;
    if (lv && isNum(lv.depth)) {
      return [fmtUsdShort(lv.depth, copy.dash) + ' ', e('span', { key: 's', className: 'stocks-sub' }, e(Tip, { text: copy.depthTip + (lv.depthCapped ? ' ' + copy.depthCappedNote : '') }, copy.depthOnchain))];
    }
    return [fmtUsdShort(lead.clip, copy.dash) + ' ', e('span', { key: 's', className: 'stocks-sub' }, e(Tip, { text: copy.clipTip }, copy.clipEst))];
  }

  function Spotlight(props) {
    var copy = props.copy;
    if (!props.items.length) return null;
    return e('section', { className: 'stocks-section', 'aria-labelledby': 'stocks-spot-h' },
      e('h2', { id: 'stocks-spot-h', className: 'stocks-h2' }, copy.spotTitle),
      e('p', { className: 'stocks-section-sub' }, copy.spotSub),
      e('div', { className: 'stocks-spot-grid', 'data-testid': 'stocks-spotlight' }, props.items.map(function (g) {
        return e('article', { key: g.underlying, className: 'dt-panel stocks-spot-card', 'data-testid': 'stocks-spot-card' },
          e('div', { className: 'stocks-spot-head' },
            e('h3', { className: 'stocks-spot-ticker' }, g.underlying, g.etf ? e('span', { className: 'dt-engine-pill stocks-badge stocks-etf' }, copy.assetEtf) : null),
            e('span', { className: 'stocks-sub' }, copy.spotPools(fmtInt(g.count, copy.dash)))
          ),
          e('div', { className: 'dt-metric' },
            e('div', { className: 'dt-metric-name' }, copy.spotProjected),
            e('div', { className: 'dt-metric-val' }, fmtPct(g.lead.proj, copy.dash))
          ),
          e('dl', { className: 'stocks-spot-facts' },
            e('div', null, e('dt', null, copy.spotLead), e('dd', null, g.lead.symbol + ' · ' + g.lead.project + ' · ' + g.lead.chain)),
            g.lead.issuer ? e('div', null, e('dt', null, copy.spotIssuer), e('dd', null, e(Tip, { text: issuerTipText(g.lead.issuerInfo, copy) }, g.lead.issuer))) : null,
            e('div', null, e('dt', null, copy.spotTvl), e('dd', null, fmtUsd(g.tvl, copy.dash))),
            e('div', null, e('dt', null, copy.colClip), e('dd', null, leadDepth(g.lead, props.live, copy)))
          ),
          e(ActionLink, { pool: g.lead, copy: copy, source: 'spotlight' })
        );
      }))
    );
  }

  // ---- token versions section ----

  var versionsPromise = null;
  // Static snapshot first; started before React renders so the preload is used.
  function loadVersionsStatic() {
    if (!versionsPromise) {
      versionsPromise = root.fetch(VERSIONS_URL)
        .then(function (res) { if (!res.ok) throw new Error('stocks-versions ' + res.status); return res.json(); })
        .then(function (raw) {
          var d = normalizeVersionsData(raw);
          if (!d || !sortTickers(d).length) throw new Error('stocks-versions empty');
          return d;
        });
      versionsPromise.catch(function () { versionsPromise = null; });
    }
    return versionsPromise;
  }

  // Static data renders first; the live view then overlays it every minute while
  // the tab is visible. A failed live call keeps whatever is on screen.
  function useVersions() {
    var state = useState({ status: 'loading', base: null, liveRaw: null, liveStatus: 'loading' });
    var s = state[0];
    var setS = state[1];
    useEffect(function () {
      var cancelled = false;
      var inflight = false;
      var last = 0;
      var interval = null;
      function load() {
        if (inflight) return;
        inflight = true;
        var ctl = typeof root.AbortController === 'function' ? new root.AbortController() : null;
        var timer = ctl ? root.setTimeout(function () { ctl.abort(); }, LIVE_TIMEOUT_MS) : null;
        root.fetch(VERSIONS_LIVE_URL, ctl ? { signal: ctl.signal } : undefined)
          .then(function (res) { if (!res.ok) throw new Error('versions live ' + res.status); return res.json(); })
          .then(function (raw) {
            if (!raw || typeof raw.tickers !== 'object' || !raw.tickers) throw new Error('versions live shape');
            if (!cancelled) setS(function (prev) { return Object.assign({}, prev, { liveRaw: raw, liveStatus: 'ready' }); });
          })
          .catch(function () {
            if (!cancelled) setS(function (prev) { return Object.assign({}, prev, { liveStatus: prev.liveRaw ? 'ready' : 'error' }); });
          })
          .then(function () {
            inflight = false;
            last = Date.now();
            if (timer) root.clearTimeout(timer);
          });
      }
      function onVisibility() { if (!root.document.hidden && Date.now() - last >= VERSIONS_REFRESH_MS) load(); }
      loadVersionsStatic().then(function (base) {
        if (cancelled) return;
        setS(function (prev) { return Object.assign({}, prev, { status: 'ready', base: base }); });
        interval = root.setInterval(function () { if (!root.document.hidden) load(); }, VERSIONS_REFRESH_MS);
        root.document.addEventListener('visibilitychange', onVisibility);
        load();
      }).catch(function () {
        if (!cancelled) setS(function (prev) { return Object.assign({}, prev, { status: 'error' }); });
      });
      return function () {
        cancelled = true;
        if (interval) root.clearInterval(interval);
        root.document.removeEventListener('visibilitychange', onVisibility);
      };
    }, []);
    var merged = useMemo(function () { return s.base ? mergeLive(s.base, s.liveRaw) : null; }, [s.base, s.liveRaw]);
    return { status: s.status, data: merged, liveStatus: s.liveStatus };
  }

  function MarketChip(props) {
    var clock = root.StocksMarketClock;
    var copy = props.copy;
    var nowState = useState(function () { return new Date(); });
    var setNow = nowState[1];
    useEffect(function () {
      var timer = root.setInterval(function () { setNow(new Date()); }, CLOCK_TICK_MS);
      return function () { root.clearInterval(timer); };
    }, []);
    if (!clock) return null;
    var st = clock.getMarketState(nowState[0]);
    var text = st.calendarStale ? copy.clockStale : copy[st.labelKey];
    return e('span', { className: 'dt-engine-pill stocks-v-market', 'data-testid': 'stocks-v-market', 'data-state': st.calendarStale ? 'stale' : st.state },
      e('span', { className: 'stocks-status-dot' + (st.state === 'open' && !st.calendarStale ? ' is-open' : ''), 'aria-hidden': 'true' }),
      copy.vMarketLabel + ': ' + text);
  }

  // Three discrete levels (High / Medium / Low), always with the text label; no numbers.
  function TierMeter(props) {
    var n = props.tier === 'High' ? 3 : props.tier === 'Medium' ? 2 : 1;
    return e('span', { className: 'stocks-v-meter', 'aria-hidden': 'true' },
      [1, 2, 3].map(function (i) { return e('span', { key: i, className: i <= n ? 'is-on' : '' }); }));
  }

  var PILLAR_TIER_KEY = { st: 'stability', su: 'sustainability', sk: 'stickiness', li: 'liquidity' };

  function pillarText(c, copy) {
    return SCORE_PILLARS.map(function (pl) {
      var tier = c.tiers[PILLAR_TIER_KEY[pl.key]];
      return tier ? copy[pl.labelKey] + ' ' + copy[TIER_KEYS[tier]] : copy[pl.labelKey];
    }).join(' · ');
  }

  function YieldCandidate(props) {
    var c = props.c, copy = props.copy;
    var kindLabel = c.kind === 'lending' ? copy.vYieldLending : copy.vYieldLp;
    var shortKind = c.kind === 'lending' ? copy.vYieldLending : copy.vYieldLp;
    var pillars = e('details', { className: 'stocks-v-pillar-details', 'data-testid': 'stocks-v-pillars' },
      e('summary', null, copy.vPillarTiers),
      e('ul', { className: 'stocks-v-pillars' },
        SCORE_PILLARS.map(function (pl) {
          var tier = c.tiers[PILLAR_TIER_KEY[pl.key]];
          return e('li', { key: pl.key },
            e('span', null, copy[pl.labelKey]),
            tier ? e('span', { className: 'stocks-v-tier' }, e(TierMeter, { tier: tier }), copy[TIER_KEYS[tier]]) : null);
        })));
    var hasTiers = SCORE_PILLARS.some(function (pl) { return !!c.tiers[PILLAR_TIER_KEY[pl.key]]; });
    var poolName = kindLabel + (c.project ? ' ' + c.project : '');
    return e('div', { className: 'stocks-v-yield', 'data-kind': c.kind },
      e('span', { className: 'stocks-v-yline' },
        e('span', { className: 'stocks-sub', title: poolName }, shortKind), ' ',
        e('span', { className: 'stocks-v-apy', title: copy.vYieldApyLabel }, fmtPct(c.apy, copy.dash)),
        c.rating ? e('span', { className: 'stocks-sub' }, ' · ', e(Tip, { text: pillarText(c, copy) + '. ' + copy.scoreTip }, c.rating)) : null,
        ' · ',
        e('a', {
          className: 'stocks-v-pool', href: poolHref(c.pool), title: copy.vOpenPool + (c.project ? ' (' + c.project + ')' : ''),
          'aria-label': copy.vOpenPoolFor(poolName),
          'data-testid': 'stocks-v-open-pool',
          onClick: function () { track('stocks_open_pool', { pool: c.pool, source: 'versions' }); }
        }, '↗')),
      hasTiers ? pillars : null
    );
  }

  function VersionRow(props) {
    var v = props.v, copy = props.copy, data = props.data;
    var cells = versionCells(v, copy);
    var cex = cexLines(v, data.cexNames);
    var facts = riskFacts(v, data.issuers, copy);
    var when = v.priceTs ? fmtDateTime(new Date(v.priceTs)) : copy.dash;
    return e('tr', { 'data-testid': 'stocks-v-row', 'data-version': v.key },
      e('td', { className: 'stocks-td-pair' },
        e('div', { className: 'stocks-pair-cell' },
          e('span', { className: 'stocks-pair-name' }, v.symbol),
          e('span', { className: 'stocks-sub', 'data-testid': 'stocks-v-issuer' }, e(Tip, { text: issuerTipText(issuerInfoOf(v), copy) }, v.issuer)))),
      e('td', { 'data-label': copy.vColChain }, e('span', { className: 'stocks-chain' }, v.chain)),
      e('td', { 'data-label': copy.vColPrice },
        v.price ? e('div', { className: 'stocks-price-cell' },
          e(Tip, { text: copy.vPriceTip(when), label: copy.vColPrice }, e('span', { className: 'stocks-price', 'data-testid': 'stocks-v-price' }, fmtPrice(v.price, copy.dash))))
          : e('span', { className: 'stocks-muted' }, copy.dash)),
      e('td', { 'data-label': copy.vColSpread },
        e(Tip, { text: cells.spreadTip }, e('span', { className: 'stocks-v-num', 'data-testid': 'stocks-v-spread' }, cells.spreadText))),
      e('td', { 'data-label': copy.vColPremium },
        e(Tip, { text: cells.premiumTip }, e('span', { className: 'stocks-v-num', 'data-testid': 'stocks-v-premium' }, cells.premiumText))),
      e('td', { 'data-label': copy.vColSupply }, e('span', { className: 'stocks-tvl' }, fmtUsd(v.supplyUsd, copy.dash))),
      e('td', { 'data-label': copy.vColLiquidity },
        e('div', { className: 'stocks-tvl-cell' },
          e('span', { className: 'stocks-tvl' }, fmtUsd(v.tvlUsd, copy.dash)),
          e('span', { className: 'stocks-sub' }, copy.vPoolTvl),
          isNum(v.depthUsd) ? e('span', { className: 'stocks-sub' }, e(Tip, { text: copy.vDepthTip }, copy.vDepth(fmtUsdShort(v.depthUsd, copy.dash)))) : null)),
      e('td', { className: 'stocks-v-wide', 'data-label': copy.vColYield },
        v.yields.length
          ? e('div', { className: 'stocks-v-yields' }, v.yields.map(function (c, i) { return e(YieldCandidate, { key: c.kind, c: c, copy: copy, showPillars: i === 0 }); }))
          : e('span', { className: 'stocks-muted' }, copy.dash)),
      e('td', { 'data-label': copy.vColCex },
        cex.length ? e('ul', { className: 'stocks-v-list', 'data-testid': 'stocks-v-cex' }, cex.map(function (c) { return e('li', { key: c.exchange }, c.text); }))
          : e('span', { className: 'stocks-muted' }, copy.vCexNone)),
      e('td', { className: 'stocks-v-facts-cell stocks-v-wide', 'data-label': copy.vColStructure },
        facts.length ? e('ul', { className: 'stocks-v-list stocks-v-facts' }, facts.map(function (f) {
          return e('li', { key: f.key },
            e('span', { className: 'stocks-v-fact-label' }, f.label + ': '), f.text,
            f.href ? e('span', null, ' ', e('a', { className: 'stocks-v-source', href: f.href, target: '_blank', rel: 'noopener noreferrer' }, copy.vSource + ' ↗')) : null);
        })) : e('span', { className: 'stocks-muted' }, copy.vNoFacts))
    );
  }

  function VersionsTable(props) {
    var copy = props.copy;
    var th = function (label, tip) {
      return e('th', { scope: 'col', className: 'dt-panel-label' }, tip ? e(Tip, { text: tip }, label) : label);
    };
    return e('table', { className: 'stocks-table stocks-table--versions', 'data-testid': 'stocks-versions-table' },
      e('thead', null, e('tr', null,
        th(copy.vColIssuer), th(copy.vColChain), th(copy.vColPrice), th(copy.vColSpread, copy.vSpreadTip),
        th(copy.vColPremium, copy.vPremiumTip), th(copy.vColSupply), th(copy.vColLiquidity), th(copy.vColYield),
        th(copy.vColCex), th(copy.vColStructure)
      )),
      e('tbody', null, props.versions.map(function (v) { return e(VersionRow, { key: v.key, v: v, copy: copy, data: props.data }); }))
    );
  }

  function UnverifiedGroup(props) {
    var copy = props.copy, items = props.items;
    if (!items.length) return null;
    return e('details', { className: 'stocks-v-unv', 'data-testid': 'stocks-v-unverified' },
      e('summary', null, copy.vUnverified(fmtInt(items.length, copy.dash))),
      e('p', { className: 'stocks-sub' }, copy.vUnverifiedNote),
      e('ul', { className: 'stocks-v-unv-list' }, items.map(function (u, i) {
        return e('li', { key: i + u.symbol + u.chain },
          e('span', { className: 'stocks-pair-name' }, u.symbol),
          e('span', { className: 'stocks-sub' }, u.chain),
          e('span', { className: 'stocks-price' }, fmtPrice(u.price, copy.dash)),
          e('span', { className: 'dt-engine-pill stocks-badge' }, copy.vUnverifiedFlag));
      })));
  }

  function VersionsSection(props) {
    var copy = props.copy;
    var vs = useVersions();
    var pickedState = useState(null);
    var picked = pickedState[0];
    var setPicked = pickedState[1];
    var queryState = useState('');
    var query = queryState[0];
    var setQuery = queryState[1];
    var data = vs.data;
    var list = useMemo(function () { return sortTickers(data); }, [data]);

    var body;
    if (vs.status === 'loading') body = e('p', { className: 'stocks-live-note', role: 'status', 'data-testid': 'stocks-v-status' }, copy.vLoading);
    else if (vs.status === 'error' || !data || !list.length) body = e('p', { className: 'stocks-live-note', role: 'status', 'data-testid': 'stocks-v-status' }, copy.vError);
    else {
      var symbol = (picked && list.some(function (t) { return t.ticker === picked; }) ? picked : null) ||
        parseTickerParam(root.location.search, list) || defaultTicker(list);
      var t = data.tickers[symbol];
      var groups = groupVersions(t);
      var shown = filterTickers(list, query);
      var pick = function (sym) {
        setPicked(sym);
        setQuery('');
        try { root.history.replaceState({}, '', root.location.pathname + buildTickerSearch(root.location.search, sym) + root.location.hash); } catch (err) { /* sandboxed frame */ }
        track('stocks_versions_ticker', { ticker: sym });
      };
      var chips = [];
      var lastGroup = null;
      shown.forEach(function (tk) {
        var g = tk.versions.length >= 2 ? 'multi' : 'single';
        if (g !== lastGroup) {
          chips.push(e('span', { key: 'g-' + g, className: 'dt-panel-label stocks-v-group-label' }, g === 'multi' ? copy.vGroupMulti : copy.vGroupSingle));
          lastGroup = g;
        }
        chips.push(e(Chip, { key: tk.ticker, active: tk.ticker === symbol, testid: 'stocks-v-chip', onClick: function () { pick(tk.ticker); } },
          tk.ticker, e('span', { className: 'stocks-pill-count' }, fmtInt(tk.versions.length, copy.dash))));
      });
      var liveNote = vs.liveStatus === 'ready' && data.liveAt ? copy.vLiveNote(fmtDateTime(new Date(data.liveAt)))
        : vs.liveStatus === 'loading' ? copy.vLiveLoading : copy.vStaticNote(fmtDate(data.generatedAt));
      body = e(R.Fragment, null,
        e('div', { className: 'stocks-v-picker', 'data-testid': 'stocks-v-picker' },
          e('label', { className: 'dt-panel-label', htmlFor: 'stocks-v-search' }, copy.vSearchLabel),
          e('input', {
            id: 'stocks-v-search', type: 'search', className: 'stocks-v-search', value: query, autoComplete: 'off', spellCheck: false,
            placeholder: copy.vSearchPlaceholder, 'data-testid': 'stocks-v-search',
            onChange: function (ev) { setQuery(ev.target.value); },
            onKeyDown: function (ev) { if (ev.key === 'Enter' && shown.length) { ev.preventDefault(); pick(shown[0].ticker); } }
          }),
          e('div', { className: 'stocks-v-chips', role: 'group', 'aria-label': copy.vPickerLabel },
            chips.length ? chips : e('span', { className: 'stocks-muted', 'data-testid': 'stocks-v-nomatch' }, copy.vNoMatch))),
        e('div', { className: 'stocks-v-head' },
          e('h3', { className: 'stocks-spot-ticker', 'data-testid': 'stocks-v-ticker' }, t.ticker,
            t.name ? e('span', { className: 'stocks-v-name' }, t.name) : null),
          e('span', { className: 'stocks-sub' }, copy.vVersionCount(fmtInt(t.versions.length, copy.dash))),
          e(MarketChip, { copy: copy })),
        t.versions.length >= 2 ? e('p', { className: 'stocks-v-static' },
          e('a', { href: staticPageHref(t.ticker), 'data-testid': 'stocks-v-static-link' }, copy.vStaticLink(t.ticker))) : null,
        e('p', { className: 'stocks-v-ref', 'data-testid': 'stocks-v-ref' }, referenceLine(t, copy)),
        e('p', { className: 'stocks-live-note', role: 'status', 'data-testid': 'stocks-v-live-note', 'data-state': vs.liveStatus }, liveNote),
        groups.verified.length ? e(VersionsTable, { versions: groups.verified, copy: copy, data: data }) : null,
        e(UnverifiedGroup, { items: groups.unverified, copy: copy }),
        e('p', { className: 'stocks-live-note' }, copy.vNotes)
      );
    }
    return e('section', { className: 'stocks-section', 'aria-labelledby': 'stocks-versions-h', 'data-testid': 'stocks-versions' },
      e('h2', { id: 'stocks-versions-h', className: 'stocks-h2' }, copy.vTitle),
      e('p', { className: 'stocks-section-sub' }, copy.vSub),
      body
    );
  }

  function Notes(props) {
    var copy = props.copy, data = props.data;
    var t = data.rails.tierMinTvl || {};
    var dash = copy.dash;
    var lines = [
      copy.notesSource(fmtDate(data.generatedAt)),
      copy.notesHaircut,
      copy.notesTiers(fmtUsd(t[1], dash), fmtUsd(t[2], dash), fmtUsd(t[3], dash)),
      copy.notesCap(fmtPct(EQUITY_APY_CAP, dash).replace('.00', ''), fmtUsd(MIN_TVL, dash), fmtInt(data.excluded, dash)),
      copy.notesScore,
      copy.notesClip,
      copy.notesLive,
      copy.notesIssuer,
      props.forecastNote
    ];
    return e('section', { className: 'stocks-section stocks-notes', 'aria-labelledby': 'stocks-notes-h', 'data-testid': 'stocks-notes' },
      e('h2', { id: 'stocks-notes-h', className: 'stocks-h2 stocks-h2--small' }, copy.notesTitle),
      e('ul', null, lines.map(function (l, i) { return e('li', { key: i }, l); }))
    );
  }

  function forecastNoteFor(copy, forecast) {
    return copy.forecastEvalGeneric;
  }

  // ---- live layer hook ----

  // Fetches /api/stocks-onchain on mount and every minute while the tab is
  // visible. A failed refresh keeps the last good data (status 'stale'); with no
  // data at all the status is 'error' and the page runs on snapshot values.
  function useLive() {
    var state = useState({ status: 'loading', live: null });
    var s = state[0];
    var setS = state[1];
    useEffect(function () {
      var cancelled = false;
      var inflight = false;
      var last = 0;
      function load() {
        if (inflight) return;
        inflight = true;
        var ctl = typeof root.AbortController === 'function' ? new root.AbortController() : null;
        var timer = ctl ? root.setTimeout(function () { ctl.abort(); }, LIVE_TIMEOUT_MS) : null;
        root.fetch(LIVE_URL, ctl ? { signal: ctl.signal } : undefined)
          .then(function (res) { if (!res.ok) throw new Error('stocks-onchain ' + res.status); return res.json(); })
          .then(function (raw) {
            var live = normalizeLive(raw);
            if (!live) throw new Error('stocks-onchain shape');
            if (!cancelled) setS({ status: 'ready', live: live });
          })
          .catch(function () {
            if (!cancelled) setS(function (prev) { return prev.live ? { status: 'stale', live: prev.live } : { status: 'error', live: null }; });
          })
          .then(function () {
            inflight = false;
            last = Date.now();
            if (timer) root.clearTimeout(timer);
          });
      }
      function onVisibility() { if (!root.document.hidden && Date.now() - last >= LIVE_REFRESH_MS) load(); }
      var interval = root.setInterval(function () { if (!root.document.hidden) load(); }, LIVE_REFRESH_MS);
      root.document.addEventListener('visibilitychange', onVisibility);
      load();
      return function () {
        cancelled = true;
        root.clearInterval(interval);
        root.document.removeEventListener('visibilitychange', onVisibility);
      };
    }, []);
    return s;
  }

  function LiveNote(props) {
    var copy = props.copy, s = props.state;
    var text;
    if (s.status === 'loading') text = copy.liveLoading;
    else if (s.status === 'error') text = copy.liveError;
    else {
      var at = s.live.generatedAt ? fmtDateTime(new Date(s.live.generatedAt)) : copy.dash;
      text = s.status === 'stale' ? copy.liveStale(at) : copy.liveReady(at, fmtInt(s.live.depthCount, copy.dash), fmtInt(props.total, copy.dash));
    }
    return e('p', { className: 'stocks-live-note', role: 'status', 'data-testid': 'stocks-live-note', 'data-state': s.status }, text);
  }

  function Page(props) {
    var data = props.data;
    var languageState = useState(detectLanguage);
    var language = languageState[0];
    var setLanguage = languageState[1];
    var darkState = useState(initialDark);
    var dark = darkState[0];
    var setDark = darkState[1];
    var copy = useMemo(function () { return stocksCopy(language); }, [language]);
    var lc = useMemo(function () { return landingCopy(language); }, [language]);
    var rc = useMemo(function () { return rootCopy(language); }, [language]);

    var chains = useMemo(function () { return chainsOf(data.pools); }, [data]);
    var filterState = useState(function () {
      return parseParams(root.location.search, chains.map(function (c) { return c.chain; }));
    });
    var filters = filterState[0];
    var setFilters = filterState[1];

    useEffect(function () {
      root.document.documentElement.lang = language;
      root.document.title = copy.pageTitle;
      var meta = root.document.querySelector('meta[name="description"]');
      if (meta) meta.content = copy.metaDescription;
      var og = root.document.querySelector('meta[property="og:title"]');
      if (og) og.content = copy.pageTitle;
      var ogd = root.document.querySelector('meta[property="og:description"]');
      if (ogd) ogd.content = copy.metaDescription;
    }, [language, copy]);

    useEffect(function () {
      track('stocks_view', { pools: data.pools.length, lang: language });
    }, []);

    function updateFilters(patch) {
      var next = Object.assign({}, filters, patch);
      setFilters(next);
      try {
        root.history.replaceState({}, '', root.location.pathname + buildSearch(root.location.search, next) + root.location.hash);
      } catch (err) { /* replaceState can throw in sandboxed frames */ }
    }

    function selectLanguage(next) {
      if (next !== 'en' && next !== 'ko') return;
      setLanguage(next);
      try { root.localStorage.setItem('defi-garden-lang', next); } catch (err) { /* ignore */ }
      var url = new URL(root.location.href);
      if (next === 'en') url.searchParams.delete('lang'); else url.searchParams.set('lang', next);
      root.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
    }

    function selectTheme(nextDark) {
      setDark(nextDark);
      root.document.documentElement.setAttribute('data-theme', nextDark ? 'dark' : 'light');
      try { root.localStorage.setItem('theme', nextDark ? 'dark' : 'light'); } catch (err) { /* ignore */ }
    }

    var agg = useMemo(function () { return aggregates(data.pools); }, [data]);
    var spots = useMemo(function () { return spotlight(data.pools, SPOTLIGHT_COUNT); }, [data]);
    var visible = useMemo(function () { return filterPools(data.pools, filters); }, [data, filters]);
    var yieldRows = useMemo(function () { return sortPools(visible.filter(isYieldPool), filters.sort); }, [visible, filters.sort]);
    var collRows = useMemo(function () { return sortPools(visible.filter(function (p) { return !isYieldPool(p); }), 'default'); }, [visible]);
    var forecastNote = forecastNoteFor(copy, data.forecast);
    var tierMin = data.rails.tierMinTvl || {};
    var liveState = useLive();
    var live = liveState.live;
    // The browser's own market clock gates the after-hours move too, so a cached
    // server response can never show a "vs last close" move once the session opens.
    var clientState = root.StocksMarketClock ? root.StocksMarketClock.getMarketState(new Date()).state : null;

    var chainCounts = chains;
    var sortOptions = [
      { key: 'default', label: copy.sortDefault }, { key: 'proj', label: copy.sortProj },
      { key: 'tvl', label: copy.sortTvl }, { key: 'score', label: copy.sortScore }
    ];
    var tierOptions = [
      { key: 'all', label: copy.tierAll }, { key: '1', label: copy.tier1 },
      { key: '2', label: copy.tier2 }, { key: '3', label: copy.tier3 }
    ];
    var noMatches = !yieldRows.length && !collRows.length;

    return e('div', { className: 'landing-app stocks-app', 'data-mode': 'stocks' },
      e(Header, { landing: lc, language: language, onLanguage: selectLanguage, dark: dark, onTheme: selectTheme }),
      e('main', { className: 'stocks-main pool-detail-view' },
        e('section', { className: 'stocks-hero' },
          e('p', { className: 'dt-panel-label stocks-eyebrow' }, copy.eyebrow),
          e('h1', { className: 'stocks-title' }, copy.title),
          e('p', { className: 'stocks-subhead' }, copy.subhead)
        ),
        e(ClockStrip, { copy: copy }),
        e('aside', { className: 'dt-panel stocks-notice', 'data-testid': 'stocks-notice' },
          e('div', { className: 'dt-panel-label' }, copy.noticeLabel),
          e('p', null, copy.noticeText)
        ),
        e(VersionsSection, { copy: copy }),
        e('section', { className: 'stocks-stats', 'aria-label': copy.statTvl, 'data-testid': 'stocks-stats' },
          e('div', { className: 'dt-metric' }, e('div', { className: 'dt-metric-name' }, copy.statTvl), e('div', { className: 'dt-metric-val' }, fmtUsd(agg.tvl, copy.dash))),
          e('div', { className: 'dt-metric' }, e('div', { className: 'dt-metric-name' }, copy.statPools), e('div', { className: 'dt-metric-val' }, fmtInt(agg.count, copy.dash))),
          e('div', { className: 'dt-metric' },
            e('div', { className: 'dt-metric-name' }, e(Tip, { text: copy.statMedianHint }, copy.statMedian)),
            e('div', { className: 'dt-metric-val' }, fmtPct(agg.medianProj, copy.dash)))
        ),
        e(Spotlight, { items: spots, copy: copy, live: live }),
        e('section', { className: 'stocks-section', 'aria-labelledby': 'stocks-terminal-h' },
          e('h2', { id: 'stocks-terminal-h', className: 'stocks-h2' }, copy.terminalTitle),
          e('p', { className: 'stocks-section-sub' }, copy.terminalSub),
          e(LiveNote, { copy: copy, state: liveState, total: data.pools.filter(isYieldPool).length }),
          e('div', { className: 'stocks-filters', 'data-testid': 'stocks-filters' },
            e('div', { className: 'stocks-filter-group', role: 'group', 'aria-label': copy.filterChain },
              e('span', { className: 'dt-panel-label stocks-filter-label' }, copy.filterChain),
              e(Chip, { active: filters.chain === 'all', testid: 'stocks-chain-all', onClick: function () { updateFilters({ chain: 'all' }); } }, copy.filterAll),
              chainCounts.map(function (c) {
                return e(Chip, { key: c.chain, active: filters.chain === c.chain, testid: 'stocks-chain-pill', onClick: function () { updateFilters({ chain: c.chain }); } },
                  c.chain, e('span', { className: 'stocks-pill-count' }, fmtInt(c.count, copy.dash)));
              })
            ),
            e('div', { className: 'stocks-filter-group', role: 'group', 'aria-label': copy.filterTier },
              e('span', { className: 'dt-panel-label stocks-filter-label' }, copy.filterTier),
              tierOptions.map(function (o) {
                return e(Chip, { key: o.key, active: String(filters.tier) === o.key, testid: 'stocks-tier-pill', onClick: function () { updateFilters({ tier: o.key }); } }, o.label);
              })
            ),
            e('div', { className: 'stocks-filter-group stocks-sort-group', role: 'group', 'aria-label': copy.sortLabel },
              e('span', { className: 'dt-panel-label stocks-filter-label' }, copy.sortLabel),
              sortOptions.map(function (o) {
                return e(Chip, { key: o.key, active: filters.sort === o.key, testid: 'stocks-sort-pill', onClick: function () { updateFilters({ sort: o.key }); } }, o.label);
              })
            )
          ),
          yieldRows.length ? e(YieldTable, { pools: yieldRows, copy: copy, sort: filters.sort, onSort: function (s) { updateFilters({ sort: s }); }, tierMin: tierMin, forecastNote: forecastNote, live: live, liveLoading: liveState.status === 'loading', clientState: clientState }) : null
        ),
        collRows.length ? e('section', { className: 'stocks-section', 'aria-labelledby': 'stocks-coll-h', 'data-testid': 'stocks-collateral' },
          e('h2', { id: 'stocks-coll-h', className: 'stocks-h2' }, copy.collTitle),
          e('p', { className: 'stocks-section-sub' }, copy.collSub),
          e(CollateralTable, { pools: collRows, copy: copy, tierMin: tierMin })
        ) : null,
        noMatches ? e('div', { className: 'dt-panel stocks-empty', 'data-testid': 'stocks-empty' },
          e('p', null, copy.emptyFiltered),
          e('button', { type: 'button', className: 'btn btn--secondary btn--sm', onClick: function () { updateFilters({ chain: 'all', tier: 'all' }); } }, copy.resetFilters)
        ) : null,
        e(Notes, { copy: copy, data: data, forecastNote: forecastNote })
      ),
      e('footer', { className: 'app-footer' },
        e('p', null,
          rc.poweredBy, ' ',
          e('a', { href: 'https://api-docs.defillama.com/', target: '_blank', rel: 'noopener noreferrer' }, rc.defillamaApi),
          '. ', rc.footerSignOff
        ),
        e('p', { className: 'app-footer-hub-links' },
          e('a', { href: '/tokens' }, rc.browseTokens), ' · ',
          e('a', { href: '/chains' }, rc.browseChains), ' · ',
          e('a', { href: '/stocks' }, rc.stocksLink || 'Stocks'), ' · ',
          e('a', { href: '/methodology' }, rc.methodologyLink || 'Methodology'), ' · ',
          e('a', { href: '/mcp' }, rc.apiLink || 'API')
        )
      )
    );
  }

  function Status(props) {
    return e('div', { className: 'landing-app stocks-app' },
      e('main', { className: 'stocks-main pool-detail-view' },
        e('section', { className: 'stocks-hero' },
          e('h1', { className: 'stocks-title' }, props.title),
          e('p', { className: 'stocks-subhead', role: 'status', 'data-testid': 'stocks-status-msg' }, props.message)
        )
      )
    );
  }

  function Root() {
    var state = useState({ phase: 'loading', data: null });
    var s = state[0];
    var setS = state[1];
    var language = detectLanguage();
    var copy = stocksCopy(language);
    useEffect(function () {
      var cancelled = false;
      root.fetch(DATA_URL)
        .then(function (res) { if (!res.ok) throw new Error('stocks-pools ' + res.status); return res.json(); })
        .then(function (raw) {
          if (cancelled) return;
          var pools = sanitizePools(raw && raw.pools, raw && raw.issuers);
          if (!pools.length || !raw.rails) throw new Error('stocks-pools empty');
          setS({
            phase: 'ready',
            data: {
              pools: pools, rails: raw.rails, forecast: raw.forecast || null,
              generatedAt: raw.generatedAt, excluded: raw.counts && isNum(raw.counts.excluded) ? raw.counts.excluded : null
            }
          });
        })
        .catch(function () { if (!cancelled) setS({ phase: 'error', data: null }); });
      return function () { cancelled = true; };
    }, []);
    if (s.phase === 'ready') return e(Page, { data: s.data });
    return e(Status, { title: copy.title, message: s.phase === 'error' ? copy.loadError : copy.loading });
  }

  function mount() {
    var el = root.document.getElementById('stocks-root');
    if (!el) return;
    loadVersionsStatic();
    root.ReactDOM.createRoot(el).render(e(Root));
  }

  // Scripts are deferred in document order (React, translations, analytics,
  // lang-menu, clock, this file), so everything is already defined here.
  mount();
})(typeof window !== 'undefined' ? window : this);
