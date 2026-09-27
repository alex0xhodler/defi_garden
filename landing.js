/* DeFi Garden landing — the night instrument panel.
 * Plain React UMD, no JSX or build step. A ranked leaderboard of the best-scored pools; the
 * selected pool is read on six instruments, each bound to one real number from
 * data/landing-pools.json (CI) or live DefiLlama. No needle is decorative. */
(function () {
  'use strict';

  var R = typeof React !== 'undefined' ? React : null;
  if (!R) return;

  var e = R.createElement;
  var useEffect = R.useEffect;
  var useState = R.useState;
  var useMemo = R.useMemo;

  var LANDING_POOLS_URL = '/data/landing-pools.json';
  var TRACK_RECORD_URL = '/data/track-record.json';
  var LLAMA_CHART_URL = 'https://yields.llama.fi/chart/';
  var MCP_URL = 'https://www.defi.garden/api/mcp';
  var MCP_COMMAND = 'claude mcp add --transport http defi-garden ' + MCP_URL;
  var LIVE_ROWS = 5;
  var MOBILE_ROWS = 10;
  var NARROW_QUERY = '(max-width: 900px)';
  var TABS = [
    { key: 'all', labelKey: 'ipTabAll' },
    { key: 'stable', labelKey: 'ipTabStable' },
    { key: 'eth', labelKey: 'ipTabEth' },
    { key: 'btc', labelKey: 'ipTabBtc' },
    { key: 'other', labelKey: 'ipTabOther' }
  ];
  // DeFi Score rating bands (compute-forecasts.py): AAA >= 85, AA >= 70, A >= 55, BBB >= 40.
  var SCORE_ARCS = [
    { from: 0, to: 40, tone: 'red' },
    { from: 40, to: 55, tone: 'amber' },
    { from: 55, to: 100, tone: 'green' }
  ];
  var APY_SCALES = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

  // ── Data helpers ────────────────────────────────────────────────────────

  function passesTrustRails(apy, tvlUsd) {
    var r = window.TRUST_RAILS;
    return !!r && typeof apy === 'number' && typeof tvlUsd === 'number' &&
      apy <= r.APY_SANITY_LIMIT && tvlUsd >= r.DEFAULT_MIN_TVL;
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url + ' ' + res.status);
      return res.json();
    });
  }

  function fetchLivePoint(poolId) {
    return fetchJson(LLAMA_CHART_URL + poolId).then(function (body) {
      var series = body && body.data;
      var last = series && series[series.length - 1];
      if (!last || typeof last.apy !== 'number' || typeof last.tvlUsd !== 'number') throw new Error('chart shape');
      return { apy: last.apy, tvlUsd: last.tvlUsd };
    });
  }

  function formatUsdCompact(value) {
    return '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 }).format(value);
  }
  function formatPct(value) { return Number(value).toFixed(2) + '%'; }
  function formatDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch (err) { return ''; }
  }
  function formatCount(n) { return new Intl.NumberFormat('en-US').format(n); }

  function niceApyMax(values) {
    var hi = Math.max.apply(null, values.filter(function (v) { return typeof v === 'number' && isFinite(v); }).concat([0.5]));
    for (var i = 0; i < APY_SCALES.length; i++) if (hi * 1.15 <= APY_SCALES[i]) return APY_SCALES[i];
    return APY_SCALES[APY_SCALES.length - 1];
  }
  function trendOf(pool) {
    var d = pool.forecast.p50 - pool.apyShown;
    return d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat';
  }

  function detectLanguage() {
    try {
      var saved = localStorage.getItem('defi-garden-lang');
      if (saved === 'en' || saved === 'ko') return saved;
    } catch (err) {}
    var param = new URLSearchParams(window.location.search).get('lang');
    if (param === 'en' || param === 'ko') return param;
    return (navigator.language || '').toLowerCase().indexOf('ko') === 0 ? 'ko' : 'en';
  }

  function getCopy(language) {
    var lang = translations[language] ? language : 'en';
    return translations[lang].landing || translations.en.landing;
  }

  function useNarrow() {
    var mq = typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY) : null;
    var state = useState(mq ? mq.matches : false);
    useEffect(function () {
      if (!mq) return undefined;
      function onChange() { state[1](mq.matches); }
      if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
      return function () { if (mq.removeEventListener) mq.removeEventListener('change', onChange); else mq.removeListener(onChange); };
    }, []);
    return state[0];
  }

  // ── Drawn marks ─────────────────────────────────────────────────────────

  function LeafMark() {
    return e('svg', {
      className: 'landing-leaf-mark', viewBox: '0 0 32 32', width: 24, height: 24,
      preserveAspectRatio: 'xMidYMid meet', fill: 'none', 'aria-hidden': 'true'
    },
      e('path', { d: 'M26.7 4.8C16.2 5.2 8.2 10.7 7.1 20.4c-.3 2.8.7 5.2 2.4 6.8 1.6-8.5 6.5-14.6 14.1-18.2-4.5 3.9-7.6 8.7-9 14.6 3.1-3.9 7-6.8 11.7-8.8.8-2.8.9-6 .4-10Z', fill: 'currentColor' }),
      e('path', { d: 'M8.8 27.2c3.2-5.1 7.2-8.9 12.2-11.4', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round' })
    );
  }

  function ArrowIcon() {
    return e('svg', {
      className: 'landing-arrow-icon', viewBox: '0 0 20 20', width: 18, height: 18, fill: 'none', 'aria-hidden': 'true'
    },
      e('path', { d: 'M4 10h11M11 5l5 5-5 5', stroke: 'currentColor', strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round' })
    );
  }

  function TrendMark(props) {
    var d = props.trend === 'up' ? 'M6 12.5 10 6.5l4 6Z' : props.trend === 'down' ? 'M6 7.5 10 13.5l4-6Z' : 'M5 9.25h10v1.5H5Z';
    return e('svg', { className: 'ip-trend ip-trend--' + props.trend, viewBox: '0 0 20 20', width: 14, height: 14, 'aria-hidden': 'true' },
      e('path', { d: d, fill: 'currentColor' }));
  }

  // ── Instruments ─────────────────────────────────────────────────────────
  // One dial grammar for every round gauge: a 240° sweep (-120°..+120°), luminous white
  // scale, coloured arcs for bands, a radium-green needle that swings (damped) when the
  // reading changes, and a digital readout in the lower face.

  var CX = 100, CY = 100;
  function polar(angleDeg, r) {
    var a = (angleDeg - 90) * Math.PI / 180;
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  }
  function arcPath(a0, a1, r) {
    var p0 = polar(a0, r), p1 = polar(a1, r);
    var large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
  }
  // Four minor graduations between every pair of major ticks, as on a real dial face.
  var MIN_ARC_DEG = 5;
  function graduations(ticks) {
    var out = [];
    for (var i = 1; i < ticks.length; i++) {
      var a = ticks[i - 1].v, b = ticks[i].v;
      for (var k = 1; k < 5; k++) out.push(a + (b - a) * k / 5);
    }
    return out;
  }
  function linearAngle(min, max) {
    return function (v) { var t = Math.max(0, Math.min(1, (v - min) / (max - min))); return -120 + 240 * t; };
  }

  function Dial(props) {
    var toAngle = props.toAngle;
    return e('figure', { className: 'ip-gauge' },
      e('svg', { className: 'ip-dial', viewBox: '0 0 200 200', role: 'img', 'aria-label': props.ariaLabel },
        [[9, 9], [191, 9], [9, 191], [191, 191]].map(function (c, i) {
          return e('g', { key: 's' + i, className: 'ip-dial-screw' },
            e('circle', { cx: c[0], cy: c[1], r: 4.2 }),
            e('line', { x1: c[0] - 2.6, y1: c[1] + 1.5, x2: c[0] + 2.6, y2: c[1] - 1.5 }));
        }),
        e('circle', { className: 'ip-bezel', cx: CX, cy: CY, r: 97 }),
        e('circle', { className: 'ip-bezel-step', cx: CX, cy: CY, r: 91 }),
        e('circle', { className: 'ip-face', cx: CX, cy: CY, r: 89 }),
        (props.arcs || []).map(function (arc, i) {
          var a0 = toAngle(arc.from), a1 = toAngle(arc.to);
          if (!(a1 >= a0)) return null;
          if (a1 - a0 < MIN_ARC_DEG) { var mid = (a0 + a1) / 2; a0 = mid - MIN_ARC_DEG / 2; a1 = mid + MIN_ARC_DEG / 2; }
          return e('path', { key: 'a' + i, className: 'ip-arc ip-arc--' + arc.tone, d: arcPath(a0, a1, 82) });
        }),
        graduations(props.ticks || []).map(function (v, i) {
          var a = toAngle(v), p0 = polar(a, 80), p1 = polar(a, 86);
          return e('line', { key: 'm' + i, className: 'ip-tick ip-tick--minor', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] });
        }),
        (props.ticks || []).map(function (t, i) {
          var a = toAngle(t.v), p0 = polar(a, 75), p1 = polar(a, 87), pl = polar(a, 60);
          return e('g', { key: 't' + i },
            e('line', { className: 'ip-tick', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] }),
            t.label != null ? e('text', { className: 'ip-scale', x: pl[0], y: pl[1], textAnchor: 'middle', dominantBaseline: 'central' }, t.label) : null
          );
        }),
        props.index != null ? e('path', {
          className: 'ip-index',
          d: (function () { var t = polar(props.index, 88), l = polar(props.index - 3.2, 95), r = polar(props.index + 3.2, 95); return 'M' + t[0] + ' ' + t[1] + ' L' + l[0] + ' ' + l[1] + ' L' + r[0] + ' ' + r[1] + ' Z'; })()
        }) : null,
        e('g', { className: 'ip-needle', style: { transform: 'rotate(' + props.needle.toFixed(2) + 'deg)' } },
          e('path', { d: 'M100 22 L103.2 100 L96.8 100 Z' }),
          e('path', { className: 'ip-needle-tail', d: 'M97.4 100 L102.6 100 L101.4 116 L98.6 116 Z' })
        ),
        e('circle', { className: 'ip-hub', cx: CX, cy: CY, r: 7 }),
        e('text', { className: 'ip-readout', x: CX, y: 151, textAnchor: 'middle' }, props.readout),
        props.subReadout ? e('text', { className: 'ip-subreadout', x: CX, y: 168, textAnchor: 'middle' }, props.subReadout) : null
      ),
      e('figcaption', { className: 'ip-placard' }, props.label)
    );
  }

  function ScoreGauge(props) {
    var s = props.pool.defiScore;
    var toAngle = linearAngle(0, 100);
    return e(Dial, {
      label: props.copy.ipGaugeScore,
      ariaLabel: props.copy.ipGaugeScore + ': ' + s.score.toFixed(1) + ' ' + s.rating,
      toAngle: toAngle, arcs: SCORE_ARCS,
      ticks: [0, 20, 40, 60, 80, 100].map(function (v) { return { v: v, label: String(v) }; }),
      needle: toAngle(s.score), readout: s.score.toFixed(1), subReadout: s.rating
    });
  }

  function band30(p) {
    var b = p.band30d;
    return b ? { lo: Math.max(0, b.mean - b.stdev), hi: b.mean + b.stdev } : null;
  }
  // APY now and the 14-day forecast share one absolute APY scale, so the two faces compare directly.
  function apyScale(p) {
    var b = band30(p);
    var max = niceApyMax([p.apyShown, b ? b.hi : null, p.forecast.p90]);
    return { max: max, toAngle: linearAngle(0, max), ticks: [0, 0.25, 0.5, 0.75, 1].map(function (f) { return { v: max * f, label: String(Math.round(max * f * 100) / 100) }; }) };
  }

  function ApyGauge(props) {
    var p = props.pool, copy = props.copy;
    var band = p.band30d;
    var b = band30(p);
    var lo = b ? b.lo : null, hi = b ? b.hi : null;
    var sc = apyScale(p);
    var toAngle = sc.toAngle;
    return e(Dial, {
      label: copy.ipGaugeApy,
      ariaLabel: copy.ipGaugeApy + ': ' + formatPct(p.apyShown) + (band ? '; ' + copy.ipBandAria(formatPct(lo), formatPct(hi)) : ''),
      toAngle: toAngle,
      arcs: band ? [{ from: lo, to: hi, tone: 'green' }] : [],
      ticks: sc.ticks,
      needle: toAngle(p.apyShown), readout: formatPct(p.apyShown), subReadout: band ? copy.ipBand30d(formatPct(lo), formatPct(hi)) : copy.ipBandNone
    });
  }

  // The forecast dial zooms in around today's rate (absolute APY labels) so the 14-day range and
  // its drift are legible even for steady pools; a white index marks today's rate on the scale.
  var ZOOM_STEPS = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
  function ForecastGauge(props) {
    var p = props.pool, f = p.forecast, copy = props.copy;
    var reach = Math.max(Math.abs(f.p10 - p.apyShown), Math.abs(f.p90 - p.apyShown), Math.abs(f.p50 - p.apyShown)) * 1.4;
    var half = ZOOM_STEPS.filter(function (st) { return st >= reach; })[0] || ZOOM_STEPS[ZOOM_STEPS.length - 1];
    var lo = Math.max(0, p.apyShown - half), hi = lo + 2 * half;
    var toAngle = linearAngle(lo, hi);
    var dp = half < 0.1 ? 3 : half < 1 ? 2 : 1;
    return e(Dial, {
      label: copy.ipGaugeForecast,
      ariaLabel: copy.ipGaugeForecast + ': ' + copy.ipForecastAria(formatPct(f.p50), formatPct(f.p10), formatPct(f.p90)),
      toAngle: toAngle,
      arcs: [{ from: Math.min(f.p10, f.p90), to: Math.max(f.p10, f.p90), tone: 'green' }],
      ticks: [0, 0.5, 1].map(function (t) { var v = lo + (hi - lo) * t; return { v: v, label: v.toFixed(dp) }; })
        .concat([0.25, 0.75].map(function (t) { return { v: lo + (hi - lo) * t, label: null }; }))
        .sort(function (a, b) { return a.v - b.v; }),
      index: toAngle(p.apyShown),
      needle: toAngle(f.p50), readout: formatPct(f.p50),
      subReadout: formatPct(f.p10) + '–' + formatPct(f.p90)
    });
  }

  function DepthGauge(props) {
    var p = props.pool;
    var toAngle = linearAngle(7, 11); // log10 dollars: $10M .. $100B
    var labels = { 7: '10M', 8: '100M', 9: '1B', 10: '10B', 11: '100B' };
    return e(Dial, {
      label: props.copy.ipGaugeDepth,
      ariaLabel: props.copy.ipGaugeDepth + ': ' + formatUsdCompact(p.tvlShown),
      toAngle: toAngle,
      ticks: [7, 8, 9, 10, 11].map(function (v) { return { v: v, label: labels[v] }; }),
      needle: toAngle(Math.log10(Math.max(p.tvlShown, 1))), readout: formatUsdCompact(p.tvlShown)
    });
  }

  function ExitGauge(props) {
    var liq = props.pool.defiScore.breakdown && props.pool.defiScore.breakdown.liquidity;
    var has = typeof liq === 'number';
    var toAngle = linearAngle(0, 15);
    return e(Dial, {
      label: props.copy.ipGaugeExit,
      ariaLabel: props.copy.ipGaugeExit + ': ' + (has ? liq.toFixed(1) + ' / 15' : props.copy.ipUnavailable),
      toAngle: toAngle,
      arcs: [{ from: 0, to: 5, tone: 'red' }, { from: 5, to: 9, tone: 'amber' }, { from: 9, to: 15, tone: 'green' }],
      ticks: [0, 5, 10, 15].map(function (v) { return { v: v, label: String(v) }; }),
      needle: toAngle(has ? liq : 0), readout: has ? liq.toFixed(1) : '—', subReadout: has ? props.copy.ipLiqSub : null
    });
  }

  function RiskAnnunciator(props) {
    var level = props.pool.forecast.crashRisk;
    var copy = props.copy;
    var lamps = [
      { key: 'LOW', label: copy.ipRiskLow, tone: 'green' },
      { key: 'MEDIUM', label: copy.ipRiskMed, tone: 'amber' },
      { key: 'HIGH', label: copy.ipRiskHigh, tone: 'red' }
    ];
    var lit = lamps.filter(function (l) { return l.key === level; })[0];
    return e('figure', { className: 'ip-gauge ip-annunciator' },
      e('div', { className: 'ip-lamps', role: 'img', 'aria-label': copy.ipGaugeRisk + ': ' + (lit ? lit.label : copy.ipUnavailable) },
        lamps.map(function (l) {
          return e('span', { key: l.key, className: 'ip-lamp ip-lamp--' + l.tone + (l.key === level ? ' is-lit' : '') }, l.label);
        })
      ),
      e('figcaption', { className: 'ip-placard' }, copy.ipGaugeRisk)
    );
  }

  function Screws() {
    return e('span', { className: 'ip-screws', 'aria-hidden': 'true' },
      e('span', { className: 'ip-screw ip-screw--tl' }), e('span', { className: 'ip-screw ip-screw--tr' }),
      e('span', { className: 'ip-screw ip-screw--bl' }), e('span', { className: 'ip-screw ip-screw--br' }));
  }

  function InstrumentPanel(props) {
    var p = props.pool, copy = props.copy;
    return e('section', { className: 'ip-panel', 'data-testid': 'landing-underwriting-card', 'aria-labelledby': 'ip-panel-title' },
      e(Screws),
      e('header', { className: 'ip-panel-head' },
        e('div', { className: 'ip-panel-id' },
          e('h2', { id: 'ip-panel-title', className: 'ip-panel-title' }, p.symbol),
          e('p', { className: 'ip-panel-meta' }, p.project + ' · ' + p.chain)
        ),
        e('p', { className: 'ip-source', 'data-testid': 'landing-uw-source', 'data-source': p.source },
          e('span', { className: 'ip-source-dot', 'aria-hidden': 'true' }),
          p.source === 'live' ? copy.ipSourceLive : copy.ipSourceAsOf(formatDate(props.asOf))
        )
      ),
      e('div', { className: 'ip-sixpack' },
        e(ScoreGauge, { pool: p, copy: copy }),
        e(ApyGauge, { pool: p, copy: copy }),
        e(ForecastGauge, { pool: p, copy: copy }),
        e(DepthGauge, { pool: p, copy: copy }),
        e(ExitGauge, { pool: p, copy: copy }),
        e(RiskAnnunciator, { pool: p, copy: copy })
      ),
      e('footer', { className: 'ip-panel-foot' },
        e('a', {
          className: 'ip-open',
          href: '/?pool=' + p.pool,
          'data-testid': 'landing-open-pool',
          onClick: function () {
            if (typeof Analytics !== 'undefined') Analytics.track('landing_pool_open', { pool: p.pool, rank: p.rank, category: p.category, source: p.source });
          }
        }, copy.ipOpenPool(p.symbol), e(ArrowIcon)),
        e('p', { className: 'ip-foot-note' }, copy.ipBandNote)
      )
    );
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────

  function Row(props) {
    var p = props.pool, copy = props.copy;
    var trend = trendOf(p);
    return e('li', { className: 'ip-row-item' },
      e('button', {
        type: 'button',
        className: 'ip-row' + (props.selected ? ' is-selected' : ''),
        'aria-pressed': props.selected ? 'true' : 'false',
        'aria-expanded': props.narrow ? (props.selected ? 'true' : 'false') : undefined,
        'data-testid': 'landing-row',
        onClick: props.onSelect
      },
        e('span', { className: 'ip-rank' }, String(p.rank).padStart(2, '0')),
        e('span', { className: 'ip-row-id' },
          e('span', { className: 'ip-row-symbol' }, p.symbol),
          e('span', { className: 'ip-row-meta' },
            e('span', { className: 'ip-chain' }, p.chain),
            e('span', { className: 'ip-row-project' }, p.project))
        ),
        e('span', { className: 'ip-row-grade' },
          e('span', { className: 'ip-row-score' }, p.defiScore.score.toFixed(1)),
          e('span', { className: 'ip-row-rating' }, p.defiScore.rating)
        ),
        e('span', { className: 'ip-row-apy' + (p.source === 'live' ? ' is-live' : '') },
          formatPct(p.apyShown),
          e(TrendMark, { trend: trend })
        ),
        e('span', { className: 'sr-only' }, copy.ipTrendAria[trend])
      ),
      props.panel ? e('div', { className: 'ip-row-panel' }, props.panel) : null
    );
  }

  // ── Track record + agents ───────────────────────────────────────────────

  function FlightLog(props) {
    var r = props.record, copy = props.copy;
    if (!r || r === 'error') return null;
    var m = r.matured;
    if (!m.n) {
      return e('section', { className: 'ip-section ip-log', 'aria-labelledby': 'ip-log-title', 'data-testid': 'landing-track-record' },
        e('h2', { id: 'ip-log-title', className: 'ip-section-title' }, copy.ipLogTitleWaiting),
        e('p', { className: 'ip-log-lede' }, copy.ipLogWaiting(formatDate(r.loggingSince), formatDate(r.firstMaturityDate)))
      );
    }
    var pct = (Math.round(m.coverage * 1000) / 10).toFixed(1) + '%';
    var dates = m.forecastDates;
    var beats = m.medianAbsErrorForecast < m.medianAbsErrorNaive;
    var errF = m.medianAbsErrorForecast.toFixed(3), errN = m.medianAbsErrorNaive.toFixed(3);
    return e('section', { className: 'ip-section ip-log', 'aria-labelledby': 'ip-log-title', 'data-testid': 'landing-track-record' },
      e('div', { className: 'ip-log-copy' },
        e('h2', { id: 'ip-log-title', className: 'ip-section-title' }, copy.ipLogTitle(pct)),
        e('p', { className: 'ip-log-lede' }, copy.ipLogLede(formatCount(m.n), formatDate(dates[0]), formatDate(dates[dates.length - 1]), dates.length)),
        e('p', { className: 'ip-log-honest' }, beats ? copy.ipLogBeats(errF, errN) : copy.ipLogNoEdge(errF, errN))
      ),
      e('figure', { className: 'ip-log-plate' },
        e(Screws),
        e('div', { className: 'ip-log-readout' },
          e('span', { className: 'ip-log-big' }, pct),
          e('span', { className: 'ip-placard' }, copy.ipLogHit),
          e('span', { className: 'ip-log-count' }, copy.ipLogCount(formatCount(m.n), dates.length))
        ),
        e('div', { className: 'ip-strip-scale', role: 'img', 'aria-label': copy.ipLogStripAria(pct) },
          e('span', { className: 'ip-strip-fill', style: { width: (m.coverage * 100) + '%' } }),
          e('span', { className: 'ip-strip-target', style: { left: '80%' } }),
          e('span', { className: 'ip-strip-pointer', style: { left: (m.coverage * 100) + '%' } })
        ),
        e('div', { className: 'ip-strip-ticks', 'aria-hidden': 'true' },
          [0, 20, 40, 60, 80, 100].map(function (v) { return e('span', { key: v, style: { left: v + '%' } }, v); })
        ),
        e('p', { className: 'ip-strip-legend' },
          e('span', { className: 'ip-strip-key ip-strip-key--fill' }, copy.ipLogLegendInside),
          e('span', { className: 'ip-strip-key ip-strip-key--target' }, copy.ipLogTarget)
        ),
        e('div', { className: 'ip-log-mid' },
          e('span', { className: 'ip-placard' }, copy.ipLogMid),
          e('span', { className: 'ip-log-mid-val' }, errF + ' / ' + errN),
          e('span', { className: 'ip-lamp ip-lamp--' + (beats ? 'green' : 'amber') + ' is-lit' }, beats ? copy.ipLogEdgeYes : copy.ipLogEdgeNo)
        )
      )
    );
  }

  function Autopilot(props) {
    var copy = props.copy;
    var copiedState = useState(false);
    function copyCommand() {
      try {
        navigator.clipboard.writeText(MCP_COMMAND).then(function () {
          copiedState[1](true);
          setTimeout(function () { copiedState[1](false); }, 2000);
        }).catch(function () {});
      } catch (err) {}
      if (typeof Analytics !== 'undefined') Analytics.track('landing_agent_copy', { target: 'mcp' });
    }
    return e('section', { className: 'ip-section ip-agents', 'aria-labelledby': 'ip-agents-title', 'data-testid': 'landing-agents' },
      e('div', { className: 'ip-agents-copy' },
        e('h2', { id: 'ip-agents-title', className: 'ip-section-title' }, copy.ipAgentsTitle),
        e('p', { className: 'ip-agents-lede' }, copy.ipAgentsLede)
      ),
      e('div', { className: 'ip-agents-console' },
        e('div', { className: 'ip-command' },
          e('code', null, MCP_COMMAND),
          e('button', { type: 'button', className: 'ip-copy', onClick: copyCommand, 'aria-live': 'polite' }, copiedState[0] ? copy.ipCopied : copy.ipCopy)
        ),
        e('ul', { className: 'ip-feeds' },
          e('li', null, e('a', { href: LANDING_POOLS_URL }, copy.ipFeedLeaderboard), e('span', { className: 'ip-feed-kind' }, 'JSON')),
          e('li', null, e('a', { href: TRACK_RECORD_URL }, copy.ipFeedTrackRecord), e('span', { className: 'ip-feed-kind' }, 'JSON')),
          e('li', null, e('a', { href: '/llms.txt' }, 'llms.txt'), e('span', { className: 'ip-feed-kind' }, 'TXT')),
          e('li', null, e('a', { href: '/agents' }, copy.ipFeedMcpDocs), e('span', { className: 'ip-feed-kind' }, 'MCP'))
        )
      )
    );
  }

  // ── Page ────────────────────────────────────────────────────────────────

  function Landing() {
    var languageState = useState(detectLanguage());
    var language = languageState[0];
    var copy = getCopy(language);
    var rootCopy = translations[language] || translations.en || {};
    var menuState = useState(false);
    var menuOpen = menuState[0];
    var boardState = useState(null);
    var board = boardState[0];
    var recordState = useState(null);
    var liveState = useState({});
    var live = liveState[0];
    var tabState = useState('all');
    var tab = tabState[0];
    var selectedState = useState(null);
    var showAllState = useState(false);
    var narrow = useNarrow();

    useEffect(function () {
      document.documentElement.lang = language;
      document.title = copy.pageTitle;
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.content = copy.metaDescription;
    }, [language]);

    // Static #seo-content (home.html) is crawlable EN; move it into the page after the
    // instruments and localize it by element id for KO.
    useEffect(function () {
      var seoEl = document.getElementById('seo-content');
      var main = document.querySelector('.landing-main');
      if (!seoEl || !main) return undefined;
      main.appendChild(seoEl);
      var target = getCopy(language);
      ['seo-eyebrow:seoEyebrow', 'seo-h1:seoH1', 'seo-lede:seoLede', 'seo-calc-p:seoCalcP', 'seo-calc-cta:seoCalcCta',
        'seo-rails-p:seoRailsP', 'seo-risk:seoRisk', 'seo-guide-link:seoGuideLink', 'seo-link-usdc:seoLinkUsdc',
        'seo-link-usdt:seoLinkUsdt', 'seo-link-eth:seoLinkEth', 'seo-link-dai:seoLinkDai', 'seo-link-base:seoLinkBase',
        'seo-link-arbitrum:seoLinkArbitrum', 'seo-link-solana:seoLinkSolana', 'seo-link-ethereum:seoLinkEthereum'
      ].forEach(function (pair) {
        var parts = pair.split(':'), el = document.getElementById(parts[0]);
        if (el && target[parts[1]]) el.textContent = target[parts[1]];
      });
      return function () { document.body.appendChild(seoEl); };
    }, [language]);

    useEffect(function () {
      fetchJson(LANDING_POOLS_URL).then(boardState[1]).catch(function () { boardState[1]('error'); });
      fetchJson(TRACK_RECORD_URL).then(recordState[1]).catch(function () { recordState[1]('error'); });
    }, []);

    var pools = useMemo(function () {
      if (!board || board === 'error') return [];
      return board.pools.map(function (p) {
        var l = live[p.pool];
        var ok = !!l && typeof l === 'object';
        return Object.assign({}, p, {
          apyShown: ok ? l.apy : p.apy,
          tvlShown: ok ? l.tvlUsd : p.tvlUsd,
          source: ok ? 'live' : 'snapshot'
        });
      }).filter(function (p) { return passesTrustRails(p.apyShown, p.tvlShown); });
    }, [board, live]);

    var visible = pools.filter(function (p) { return tab === 'all' || p.category === tab; });
    var selectedId = selectedState[0];
    var picked = visible.filter(function (p) { return p.pool === selectedId; })[0];
    var selected = picked || (narrow || selectedId === '__none__' ? null : visible[0]) || null;

    // Live overlay: the first rows of the current tab, plus the selected pool.
    useEffect(function () {
      var want = visible.slice(0, LIVE_ROWS).map(function (p) { return p.pool; });
      if (selected && want.indexOf(selected.pool) === -1) want.push(selected.pool);
      want.filter(function (id) { return !(id in live); }).forEach(function (id) {
        liveState[1](function (prev) { var n = Object.assign({}, prev); if (!(id in n)) n[id] = 'pending'; return n; });
        fetchLivePoint(id)
          .then(function (point) { liveState[1](function (prev) { var n = Object.assign({}, prev); n[id] = point; return n; }); })
          .catch(function () { liveState[1](function (prev) { var n = Object.assign({}, prev); n[id] = 'failed'; return n; }); });
      });
    }, [board, tab, selected ? selected.pool : null]);

    function toggleLanguage() {
      var next = language === 'en' ? 'ko' : 'en';
      languageState[1](next);
      try { localStorage.setItem('defi-garden-lang', next); } catch (err) {}
      var url = new URL(window.location.href);
      if (next === 'en') url.searchParams.delete('lang'); else url.searchParams.set('lang', next);
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
    }
    function closeMenu() { menuState[1](false); }
    function selectPool(p) {
      if (narrow && selected && selected.pool === p.pool) { selectedState[1]('__none__'); return; }
      selectedState[1](p.pool);
    }

    var asOf = board && board !== 'error' ? board.generatedAt : null;
    var counts = {};
    pools.forEach(function (p) { counts[p.category] = (counts[p.category] || 0) + 1; });
    var panel = selected ? e(InstrumentPanel, { pool: selected, copy: copy, asOf: asOf }) : null;

    var navLinks = [
      { href: '/?app=1', label: copy.navSearch },
      { href: 'plan.html', label: copy.navPlanner },
      { href: '/for/claude', label: copy.navCard, testid: 'landing-nav-card' },
      { href: '/agents', label: copy.navAgents }
    ];

    return e('div', { className: 'landing-app', 'data-mode': 'landing' },
      e('header', { className: 'landing-header' },
        e('a', { className: 'landing-brand', href: '/', 'aria-label': 'DeFi Garden' },
          e('span', { className: 'landing-brand-mark' }, e(LeafMark)),
          e('span', null, 'DeFi Garden')
        ),
        e('nav', { className: 'landing-nav', 'aria-label': copy.navPrimary },
          navLinks.map(function (l) { return e('a', { key: l.href, href: l.href, 'data-testid': l.testid }, l.label); })
        ),
        e('div', { className: 'landing-header-actions' },
          e('button', {
            type: 'button', className: 'landing-icon-button', onClick: toggleLanguage,
            'aria-label': language === 'en' ? copy.languageKorean : copy.languageEnglish
          }, language === 'en' ? 'KO' : 'EN'),
          e('button', {
            type: 'button', className: 'landing-menu-button', onClick: function () { menuState[1](!menuOpen); },
            'aria-label': menuOpen ? copy.navClose : copy.navMenu, 'aria-expanded': menuOpen ? 'true' : 'false'
          },
            e('svg', { viewBox: '0 0 20 20', width: 20, height: 20, 'aria-hidden': 'true' },
              e('path', { d: menuOpen ? 'M5 5l10 10M15 5L5 15' : 'M3 6h14M3 10h14M3 14h14', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', fill: 'none' })))
        )
      ),
      e('nav', { className: 'landing-mobile-nav' + (menuOpen ? ' is-open' : ''), 'aria-label': copy.navMobile },
        navLinks.map(function (l) { return e('a', { key: l.href, href: l.href, onClick: closeMenu, 'data-testid': l.testid }, l.label); })
      ),
      e('main', { className: 'landing-main' },
        e('section', { className: 'ip-cockpit', 'aria-labelledby': 'landing-uw-title' },
          e('div', { className: 'ip-intro' },
            e('h1', { id: 'landing-uw-title', className: 'ip-title' }, copy.ipTitle),
            e('p', { className: 'ip-lede' }, copy.ipLede)
          ),
          e('div', { className: 'ip-deck' },
            e('section', { className: 'ip-list', 'aria-labelledby': 'ip-list-title' },
              e('header', { className: 'ip-list-head' },
                e('h2', { id: 'ip-list-title', className: 'ip-placard ip-list-title' }, copy.ipListTitle),
                e('div', { className: 'ip-tabs', role: 'group', 'aria-label': copy.ipTabsAria },
                  TABS.filter(function (t) { return t.key === 'all' || counts[t.key]; }).map(function (t) {
                    return e('button', {
                      key: t.key, type: 'button',
                      className: 'ip-tab' + (tab === t.key ? ' is-active' : ''),
                      'aria-pressed': tab === t.key ? 'true' : 'false',
                      onClick: function () { tabState[1](t.key); selectedState[1](null); }
                    }, copy[t.labelKey], e('span', { className: 'ip-tab-count' }, t.key === 'all' ? pools.length : counts[t.key]));
                  })
                )
              ),
              board === null
                ? e('p', { className: 'ip-list-state', role: 'status' }, copy.ipLoading)
                : board === 'error' || !visible.length
                  ? e('p', { className: 'ip-list-state', role: 'status' }, copy.ipEmpty, ' ', e('a', { href: '/?app=1' }, copy.ipEmptyAction))
                  : e('div', { className: 'ip-cols', 'aria-hidden': 'true' },
                      e('span', null, '#'), e('span', null, copy.ipColPool), e('span', null, copy.ipColScore), e('span', null, copy.ipColApy)),
              board && board !== 'error' && visible.length
                ? e('ol', { className: 'ip-rows' },
                      (narrow && !showAllState[0] ? visible.slice(0, MOBILE_ROWS) : visible).map(function (p) {
                        var isSel = !!selected && selected.pool === p.pool;
                        return e(Row, {
                          key: p.pool, pool: p, copy: copy, narrow: narrow, selected: isSel,
                          onSelect: function () { selectPool(p); },
                          panel: narrow && isSel ? panel : null
                        });
                      })
                    )
                : null,
              narrow && !showAllState[0] && visible.length > MOBILE_ROWS
                ? e('button', { type: 'button', className: 'ip-show-all', onClick: function () { showAllState[1](true); } }, copy.ipShowAll(visible.length))
                : null,
              board && board !== 'error'
                ? e('p', { className: 'ip-rules' }, copy.ipRules(formatUsdCompact(board.minTvlUsd), formatCount(board.eligibleCount), formatDate(board.generatedAt)))
                : null
            ),
            narrow ? null : e('div', { className: 'ip-panel-slot' }, panel)
          )
        ),
        e(FlightLog, { record: recordState[0], copy: copy }),
        e(Autopilot, { copy: copy })
      ),
      e('footer', { className: 'app-footer' },
        e('p', null,
          rootCopy.poweredBy, ' ',
          e('a', { href: 'https://api-docs.defillama.com/', target: '_blank', rel: 'noopener noreferrer' }, rootCopy.defillamaApi),
          '. ',
          rootCopy.footerSignOff
        ),
        e('p', { className: 'app-footer-hub-links' },
          e('a', { href: '/tokens' }, rootCopy.browseTokens), ' · ',
          e('a', { href: '/chains' }, rootCopy.browseChains), ' · ',
          e('a', { href: '/agents' }, rootCopy.aiAgents || copy.navAgents)
        )
      )
    );
  }

  function mountLanding() {
    if (window.__APP_MODE !== 'landing') return;
    var mount = document.getElementById('landing-root');
    if (!mount || !window.ReactDOM) return;
    window.ReactDOM.createRoot(mount).render(e(Landing));
  }

  if (window.ReactDOM && window.React) mountLanding();
  else document.addEventListener('DOMContentLoaded', mountLanding);
})();
