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

  // Normalise one pool: finite-or-null for every optional number, so a render
  // path can never print NaN/undefined.
  function normalizePool(p, issuers) {
    var score = p.score && isNum(p.score.v) ? {
      v: p.score.v,
      r: typeof p.score.r === 'string' ? p.score.r : null,
      st: isNum(p.score.st) ? p.score.st : null,
      su: isNum(p.score.su) ? p.score.su : null,
      sk: isNum(p.score.sk) ? p.score.sk : null,
      li: isNum(p.score.li) ? p.score.li : null
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
    parseParams: parseParams, buildSearch: buildSearch, poolHref: poolHref
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

  // Score pillar NAMES; values are the engine's 0-100 per-pillar field (pillarsPct).
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
    return Object.assign({}, en, own);
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
      return isNum(s[pl.key]) ? copy[pl.labelKey] + ' ' + fmtInt(s[pl.key], copy.dash) + '/100' : copy[pl.labelKey];
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
    root.ReactDOM.createRoot(el).render(e(Root));
  }

  // Scripts are deferred in document order (React, translations, analytics,
  // lang-menu, clock, this file), so everything is already defined here.
  mount();
})(typeof window !== 'undefined' ? window : this);
