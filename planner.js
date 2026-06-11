/* Garden Planner — a goal-first, conversational DeFi savings planner.
 * Pure React.createElement (no JSX). Trust principle: every number shown is
 * live DefiLlama pool data passed through sanity rails. Nothing is invented.
 */
(function () {
  'use strict';

  // React is present in the browser; absent under `node require` (unit tests).
  var R = typeof React !== 'undefined' ? React : null;
  var e = R ? R.createElement : function () {};
  var useState = R ? R.useState : function () {};
  var useEffect = R ? R.useEffect : function () {};
  var useRef = R ? R.useRef : function () {};
  var useMemo = R ? R.useMemo : function () {};

  // ---------------------------------------------------------------------------
  // Constants & sanity rails (mirrors app.js)
  // ---------------------------------------------------------------------------
  var APY_SANITY_LIMIT = 1000;          // total APY above this may NEVER enter a plan
  var POOLS_API = 'https://yields.llama.fi/pools';
  var BANK_APY = 0.5;                   // typical savings account, for contrast
  var STORAGE_KEY = 'garden-plan';
  var PLAN_VERSION = 1;

  var STABLE_SYMBOLS = ['USDC', 'USDT', 'DAI', 'USDS', 'FRAX', 'TUSD', 'USDP', 'GUSD',
    'LUSD', 'USDD', 'PYUSD', 'USDE', 'SUSD', 'CRVUSD', 'GHO', 'USD0', 'FDUSD', 'USDB',
    'BUSD', 'MIM', 'DOLA', 'USDX', 'EURC', 'EURS', 'RLUSD', 'USDL', 'DEUSD', 'SDAI'];

  // ---------------------------------------------------------------------------
  // Formatting — pinned to en-US everywhere (trust + consistency with app.js)
  // ---------------------------------------------------------------------------
  function formatUsd(n, maxFrac) {
    return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: maxFrac == null ? 0 : maxFrac });
  }
  function formatUsdRounded(n) {
    // Round to a sensible figure for headline projections.
    var v = Number(n || 0);
    if (v >= 1000000) return '$' + (Math.round(v / 10000) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M';
    if (v >= 100000) return '$' + (Math.round(v / 1000) * 1000).toLocaleString('en-US');
    if (v >= 1000) return '$' + (Math.round(v / 100) * 100).toLocaleString('en-US');
    return '$' + Math.round(v).toLocaleString('en-US');
  }
  function formatApy(pct) {
    return Number(pct || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
  }
  function formatTvl(n) {
    var v = Number(n || 0);
    if (v >= 1e9) return '$' + (v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toLocaleString('en-US', { maximumFractionDigits: 0 }) + 'K';
    return '$' + Math.round(v).toLocaleString('en-US');
  }

  // ---------------------------------------------------------------------------
  // Pure finance helpers (unit-testable)
  // ---------------------------------------------------------------------------
  function poolTotalApy(pool) {
    return (pool.apyBase || 0) + (pool.apyReward || 0);
  }
  function isAnomalousApy(pool) {
    return poolTotalApy(pool) > APY_SANITY_LIMIT;
  }
  function isStableSymbol(symbol) {
    if (!symbol) return false;
    var parts = String(symbol).toUpperCase().split(/[-_\/\s+]/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length === 0) return false;
    return parts.every(function (p) { return STABLE_SYMBOLS.indexOf(p) !== -1; });
  }
  function median(nums) {
    if (!nums.length) return 0;
    var s = nums.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* Future value of a monthly deposit with monthly compounding.
   * FV = P * (((1 + r/12)^n - 1) / (r/12)), r = annual rate (decimal), n = months. */
  function futureValue(monthly, annualRatePct, years) {
    var P = Number(monthly) || 0;
    var months = Math.round((Number(years) || 0) * 12);
    var r = (Number(annualRatePct) || 0) / 100;
    if (r === 0) return P * months;
    var rm = r / 12;
    return P * ((Math.pow(1 + rm, months) - 1) / rm);
  }
  function totalDeposited(monthly, years) {
    return (Number(monthly) || 0) * Math.round((Number(years) || 0) * 12);
  }

  // Temperament filter bands. Sanity cap (<= APY_SANITY_LIMIT) applies everywhere.
  var TEMPERAMENTS = {
    sleep: { minTvl: 50000000, maxApy: APY_SANITY_LIMIT, stableOnly: true,
      preferTypes: ['lending', 'staking'] },
    balanced: { minTvl: 10000000, maxApy: 50, stableOnly: false },
    bold: { minTvl: 10000000, maxApy: 200, stableOnly: false }
  };

  function poolKind(pool) {
    var proj = String(pool.project || '').toLowerCase();
    var lending = ['aave', 'compound', 'morpho', 'spark', 'radiant', 'euler', 'venus', 'fluid', 'kamino', 'save', 'strike'];
    var staking = ['lido', 'rocket', 'ether.fi', 'jito', 'marinade', 'stader', 'frax', 'binance-staked', 'mantle-staked'];
    for (var i = 0; i < lending.length; i++) if (proj.indexOf(lending[i]) !== -1) return 'lending';
    for (var j = 0; j < staking.length; j++) if (proj.indexOf(staking[j]) !== -1) return 'staking';
    return 'other';
  }

  /* curatePools — PURE. Given the raw pool list and a temperament key, returns up
   * to `limit` curated pools, deduped by project, sorted by total APY descending
   * within the band. Anomalous pools (> APY_SANITY_LIMIT) can NEVER pass. */
  function curatePools(pools, temperamentKey, limit) {
    var band = TEMPERAMENTS[temperamentKey] || TEMPERAMENTS.balanced;
    var lim = limit == null ? 3 : limit;
    if (!Array.isArray(pools)) return [];

    var eligible = pools.filter(function (p) {
      if (!p || !p.symbol || !p.project) return false;
      var apy = poolTotalApy(p);
      if (apy > APY_SANITY_LIMIT) return false;     // hard sanity rail — always
      if (apy <= 0) return false;
      if (apy > band.maxApy) return false;
      if ((p.tvlUsd || 0) < band.minTvl) return false;
      if (band.stableOnly && !isStableSymbol(p.symbol)) return false;
      return true;
    });

    if (band.preferTypes) {
      eligible.sort(function (a, b) {
        var ap = band.preferTypes.indexOf(poolKind(a)) !== -1 ? 0 : 1;
        var bp = band.preferTypes.indexOf(poolKind(b)) !== -1 ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return poolTotalApy(b) - poolTotalApy(a);
      });
    } else {
      eligible.sort(function (a, b) { return poolTotalApy(b) - poolTotalApy(a); });
    }

    var seen = {};
    var out = [];
    for (var i = 0; i < eligible.length && out.length < lim; i++) {
      var key = String(eligible[i].project).toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(eligible[i]);
    }
    return out;
  }

  /* blendedApy — median of the curated pools' total APY (per spec). */
  function blendedApy(curated) {
    if (!curated || !curated.length) return 0;
    return median(curated.map(poolTotalApy));
  }

  // ---------------------------------------------------------------------------
  // i18n — read the nested `planner` block directly (shared t() is flat)
  // ---------------------------------------------------------------------------
  function detectLang() {
    try {
      var saved = localStorage.getItem('defi-garden-lang');
      if (saved && (saved === 'en' || saved === 'ko')) return saved;
    } catch (e2) {}
    var params = new URLSearchParams(window.location.search);
    var p = params.get('lang');
    if (p === 'en' || p === 'ko') return p;
    var bl = (navigator.language || 'en').toLowerCase();
    return bl.indexOf('ko') === 0 ? 'ko' : 'en';
  }
  function makeT(lang) {
    var dict = (translations[lang] && translations[lang].planner) || translations.en.planner;
    var fallback = translations.en.planner;
    return function t(key) {
      var args = Array.prototype.slice.call(arguments, 1);
      var v = dict[key];
      if (v == null) v = fallback[key];
      if (typeof v === 'function') return v.apply(null, args);
      return v == null ? key : v;
    };
  }
  function rootT(lang, key) {
    var d = translations[lang] || translations.en;
    var v = d[key];
    if (v == null) v = translations.en[key];
    return v;
  }

  var prefersReducedMotion = (function () {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e3) { return false; }
  })();

  // ---------------------------------------------------------------------------
  // Goal model
  // ---------------------------------------------------------------------------
  var GOALS = [
    { id: 'retirement', emoji: '🌳', labelKey: 'goalRetirement', keywords: ['retire', 'retirement', 'pension', 'old age', '은퇴', '노후', '연금'] },
    { id: 'home', emoji: '🏡', labelKey: 'goalHome', keywords: ['home', 'house', 'apartment', 'down payment', 'mortgage', 'property', '집', '주택', '아파트'] },
    { id: 'education', emoji: '🎓', labelKey: 'goalEducation', keywords: ['education', 'college', 'university', 'school', 'tuition', 'study', '교육', '학비', '대학'] },
    { id: 'rainy', emoji: '☂️', labelKey: 'goalRainy', keywords: ['rainy', 'emergency', 'safety', 'cushion', 'buffer', 'fund', '비상', '비상금', '안전'] },
    { id: 'grow', emoji: '🌱', labelKey: 'goalGrow', keywords: ['grow', 'invest', 'wealth', 'rich', 'just', 'anything', '불리', '투자', '재테크'] }
  ];
  function goalById(id) {
    for (var i = 0; i < GOALS.length; i++) if (GOALS[i].id === id) return GOALS[i];
    return null;
  }
  function goalLabel(t, id) {
    var g = goalById(id);
    return g ? t(g.labelKey) : id;
  }

  // ---------------------------------------------------------------------------
  // Provider interface — v1 deterministic. A real LLM can implement the same
  // async (text, planContext) -> { type, ... } contract later.
  // ---------------------------------------------------------------------------
  function matchGoalFromText(text) {
    var s = String(text || '').toLowerCase();
    if (!s.trim()) return null;
    for (var i = 0; i < GOALS.length; i++) {
      var g = GOALS[i];
      for (var j = 0; j < g.keywords.length; j++) {
        if (s.indexOf(g.keywords[j]) !== -1) return g.id;
      }
    }
    return null;
  }
  // Goal free-text provider
  function answerFreeText(text, planContext) {
    return Promise.resolve().then(function () {
      var id = matchGoalFromText(text);
      if (id) return { type: 'goal', goal: id };
      return { type: 'nudge' };
    });
  }
  // Plan Q&A provider (used in the bloom "ask anything" slot)
  function answerPlanQuestion(text, planContext, t) {
    return Promise.resolve().then(function () {
      var s = String(text || '').toLowerCase();
      if (/drop|fall|fell|down|lower|decrease|crash|떨어|하락|내려/.test(s)) return { type: 'answer', text: t('askRatesDrop') };
      if (/safe|risk|lose|losing|danger|secure|위험|안전|잃/.test(s)) return { type: 'answer', text: t('askSafe') };
      if (/withdraw|take out|access|liquid|exit|cash out|출금|인출|빼/.test(s)) return { type: 'answer', text: t('askWithdraw') };
      if (/how|where|real|live|data|number|source|어떻게|실시간|데이터|출처/.test(s)) return { type: 'answer', text: t('askHow') };
      return { type: 'fallback', text: t('askFallback') };
    });
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------
  function loadSavedPlan() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || p.version !== PLAN_VERSION) return null;
      return p;
    } catch (e4) { return null; }
  }
  function savePlan(plan) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); } catch (e5) {}
  }
  function clearSavedPlan() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e6) {}
  }

  // ---------------------------------------------------------------------------
  // Presets (stories funnel)
  // ---------------------------------------------------------------------------
  var PRESETS = {
    tomoko: { name: 'Tomoko', goal: 'retirement', monthly: 1000, years: 25, temperament: 'sleep' },
    kevin: { name: 'Kevin', goal: 'grow', monthly: 500, years: 13, temperament: 'balanced' },
    lucia: { name: 'Lucia', goal: 'rainy', monthly: 300, years: 10, temperament: 'sleep' }
  };

  // ===========================================================================
  // Small UI atoms
  // ===========================================================================

  // Count-up number; respects reduced motion (jumps to final value).
  function CountUp(props) {
    var value = props.value;
    var format = props.format || function (v) { return Math.round(v); };
    var duration = props.duration || 1100;
    var delay = props.delay || 0;
    var ref = useState(prefersReducedMotion ? value : 0);
    var display = ref[0], setDisplay = ref[1];
    var fromRef = useRef(0);
    useEffect(function () {
      if (prefersReducedMotion) { setDisplay(value); return; }
      var start = null, raf, to;
      var from = fromRef.current;
      var timer = setTimeout(function () {
        var step = function (ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / duration, 1);
          var ease = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
          setDisplay(from + (value - from) * ease);
          if (p < 1) raf = requestAnimationFrame(step);
          else fromRef.current = value;
        };
        raf = requestAnimationFrame(step);
      }, delay);
      return function () { clearTimeout(timer); if (raf) cancelAnimationFrame(raf); };
    }, [value, duration, delay]);
    return e(React.Fragment, null, format(display));
  }

  function Sprout() {
    return e('div', { className: 'gp-thinking', 'aria-live': 'polite' },
      e('span', { className: 'gp-sprout' }, '🌱'),
      e('span', { className: 'gp-thinking-dots' },
        e('span', null), e('span', null), e('span', null)
      )
    );
  }

  // ===========================================================================
  // Growth curve (self-drawing SVG)
  // ===========================================================================
  function GrowthCurve(props) {
    var monthly = props.monthly, years = props.years, apy = props.apy;
    var W = 560, H = 240, padL = 8, padR = 8, padT = 16, padB = 8;
    var data = useMemo(function () {
      var pts = [];
      var steps = 48;
      for (var i = 0; i <= steps; i++) {
        var yr = (years * i) / steps;
        pts.push({
          yr: yr,
          you: futureValue(monthly, apy, yr),
          bank: futureValue(monthly, BANK_APY, yr)
        });
      }
      return pts;
    }, [monthly, years, apy]);

    var maxY = data[data.length - 1].you || 1;
    function px(i) { return padL + (i / (data.length - 1)) * (W - padL - padR); }
    function py(v) { return H - padB - (v / maxY) * (H - padT - padB); }

    function pathFor(key) {
      var d = '';
      for (var i = 0; i < data.length; i++) {
        d += (i === 0 ? 'M' : 'L') + px(i).toFixed(1) + ' ' + py(data[i][key]).toFixed(1) + ' ';
      }
      return d.trim();
    }
    function areaFor(key) {
      return pathFor(key) + ' L' + px(data.length - 1).toFixed(1) + ' ' + (H - padB) + ' L' + px(0).toFixed(1) + ' ' + (H - padB) + ' Z';
    }

    var youPath = pathFor('you');
    var bankPath = pathFor('bank');
    var drawClass = prefersReducedMotion ? '' : ' gp-draw';

    return e('svg', {
      className: 'gp-curve', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'none',
      role: 'img', 'aria-label': props.ariaLabel || 'Projected growth curve'
    },
      e('defs', null,
        e('linearGradient', { id: 'gpFill', x1: '0', y1: '0', x2: '0', y2: '1' },
          e('stop', { offset: '0%', 'stop-color': 'var(--gp-curve-you)', 'stop-opacity': '0.22' }),
          e('stop', { offset: '100%', 'stop-color': 'var(--gp-curve-you)', 'stop-opacity': '0' })
        )
      ),
      e('path', { className: 'gp-curve-area', d: areaFor('you'), fill: 'url(#gpFill)' }),
      e('path', { className: 'gp-curve-bank', d: bankPath, fill: 'none' }),
      e('path', { className: 'gp-curve-you' + drawClass, d: youPath, fill: 'none' }),
      e('circle', { className: 'gp-curve-dot', cx: px(data.length - 1), cy: py(data[data.length - 1].you), r: 5 })
    );
  }

  // ===========================================================================
  // Thread (collapsed prior Q&A)
  // ===========================================================================
  function ThreadRow(props) {
    return e('div', { className: 'gp-thread-row' },
      e('span', { className: 'gp-thread-q' }, props.label),
      e('span', { className: 'gp-thread-a' }, props.value)
    );
  }

  // Generic chip row
  function Chips(props) {
    return e('div', { className: 'gp-chips' + (props.wrap ? ' gp-chips-wrap' : '') },
      props.options.map(function (opt) {
        return e('button', {
          key: opt.value,
          type: 'button',
          className: 'gp-chip' + (props.selected === opt.value ? ' is-selected' : ''),
          onClick: function () { props.onPick(opt.value); }
        },
          opt.emoji ? e('span', { className: 'gp-chip-emoji' }, opt.emoji) : null,
          e('span', null, opt.label)
        );
      })
    );
  }

  // A speech bubble from the garden
  function Bubble(props) {
    return e('div', { className: 'gp-bubble gp-animate-in' + (props.className ? ' ' + props.className : '') },
      props.avatar !== false ? e('div', { className: 'gp-avatar' }, props.avatar || '🌱') : null,
      e('div', { className: 'gp-bubble-body' }, props.children)
    );
  }

  // ===========================================================================
  // Bloom (the wow moment)
  // ===========================================================================
  function Bloom(props) {
    var t = props.t, lang = props.lang;
    var monthly = props.monthly, years = props.years, temperament = props.temperament;
    var pools = props.pools;

    var curated = useMemo(function () { return curatePools(pools, temperament, 3); }, [pools, temperament]);
    var apy = useMemo(function () { return blendedApy(curated); }, [curated]);
    var projection = futureValue(monthly, apy, years);
    var bankProjection = futureValue(monthly, BANK_APY, years);
    var deposited = totalDeposited(monthly, years);

    var askState = useState({ q: '', a: null, thinking: false });
    var ask = askState[0], setAsk = askState[1];
    var askInput = useState('');
    var askVal = askInput[0], setAskVal = askInput[1];
    var sharing = useState(false);
    var isSharing = sharing[0], setSharing = sharing[1];

    // Persist plan whenever the artifact settles.
    useEffect(function () {
      if (!curated.length) return;
      savePlan({
        version: PLAN_VERSION,
        goal: props.goal, monthly: monthly, years: years, temperament: temperament,
        pools: curated.map(function (p) { return { pool: p.pool, symbol: p.symbol, project: p.project, chain: p.chain, apy: poolTotalApy(p) }; }),
        blendedApy: apy,
        projection: projection,
        savedAt: new Date().toISOString()
      });
    }, [curated, monthly, years, temperament, apy]);

    function submitAsk(ev) {
      if (ev) ev.preventDefault();
      var q = askVal.trim();
      if (!q) return;
      setAsk({ q: q, a: null, thinking: true });
      setAskVal('');
      answerPlanQuestion(q, { goal: props.goal, monthly: monthly, years: years, temperament: temperament, apy: apy }, t)
        .then(function (res) {
          setTimeout(function () { setAsk({ q: q, a: res, thinking: false }); }, prefersReducedMotion ? 0 : 650);
        });
    }

    function doShare() {
      setSharing(true);
      renderShareImage({
        headline: t('bloomHeadline', formatUsdRounded(projection), years),
        goalLabel: goalLabel(t, props.goal),
        subline: t('shareSubline', formatUsd(monthly), years),
        footer: t('shareFooter'),
        years: years,
        you: monthly, apy: apy
      }).then(function () { setSharing(false); }).catch(function () { setSharing(false); });
    }

    return e('div', { className: 'gp-bloom' },
      // Preset intro — stays visible in the bloom so fast-forwarded (and
      // reduced-motion) visitors always see whose plan they started from.
      props.presetName
        ? e('p', { className: 'gp-preset-intro gp-bloom-intro gp-animate-in' }, t('presetIntro', props.presetName))
        : null,
      // Headline
      e('div', { className: 'gp-bloom-headline gp-animate-in' },
        e('div', { className: 'gp-headline-figure' },
          '≈ ', e(CountUp, { value: projection, format: function (v) { return formatUsdRounded(v); }, delay: prefersReducedMotion ? 0 : 250 })
        ),
        e('div', { className: 'gp-headline-sub' }, t('bloomInYears', years)),
        e('div', { className: 'gp-headline-vs' }, t('bloomVsBank', formatUsdRounded(bankProjection))),
        e('div', { className: 'gp-headline-deposited' }, t('bloomDeposited', formatUsd(deposited)))
      ),

      // Curve
      e('div', { className: 'gp-curve-wrap gp-animate-in' },
        e(GrowthCurve, { monthly: monthly, years: years, apy: apy, ariaLabel: t('bloomCurveYou') }),
        e('div', { className: 'gp-legend' },
          e('span', { className: 'gp-legend-item gp-legend-you' }, e('i', null), t('bloomCurveYou')),
          e('span', { className: 'gp-legend-item gp-legend-bank' }, e('i', null), t('bloomCurveBank'))
        )
      ),

      // What-if chips
      e('div', { className: 'gp-whatif gp-animate-in' },
        e('div', { className: 'gp-whatif-label' }, t('whatIfHeading')),
        e('div', { className: 'gp-chips gp-chips-wrap' },
          e('button', { type: 'button', className: 'gp-chip gp-chip-whatif', onClick: function () { props.onWhatIf('more'); } }, t('whatIfMore')),
          e('button', { type: 'button', className: 'gp-chip gp-chip-whatif', onClick: function () { props.onWhatIf('longer'); } }, t('whatIfLonger')),
          e('button', { type: 'button', className: 'gp-chip gp-chip-whatif', onClick: function () { props.onWhatIf('safer'); } }, t('whatIfSafer')),
          e('button', { type: 'button', className: 'gp-chip gp-chip-whatif', onClick: function () { props.onWhatIf('bolder'); } }, t('whatIfBolder'))
        )
      ),

      // Pools
      e('div', { className: 'gp-pools gp-animate-in' },
        e('div', { className: 'gp-pools-heading' }, t('poolsHeading')),
        curated.length === 0
          ? e('div', { className: 'gp-pools-empty' }, t('noPools'))
          : e('div', { className: 'gp-pool-grid' },
              curated.map(function (p) {
                return e('a', {
                  key: p.pool, className: 'gp-pool-card', href: '/?pool=' + encodeURIComponent(p.pool),
                  rel: 'noopener'
                },
                  e('div', { className: 'gp-pool-top' },
                    e('span', { className: 'gp-pool-symbol' }, p.symbol),
                    e('span', { className: 'gp-pool-apy' }, formatApy(poolTotalApy(p)))
                  ),
                  e('div', { className: 'gp-pool-meta' },
                    e('span', { className: 'gp-pool-project' }, p.project),
                    e('span', { className: 'gp-pool-chain' }, p.chain)
                  ),
                  e('div', { className: 'gp-pool-foot' },
                    e('span', { className: 'gp-pool-tvl' }, t('poolTvl') + ' ' + formatTvl(p.tvlUsd)),
                    e('span', { className: 'gp-pool-link' }, t('viewPool'))
                  )
                );
              })
            )
      ),

      // Ask anything
      e('div', { className: 'gp-ask gp-animate-in' },
        ask.q ? e('div', { className: 'gp-ask-thread' },
          e('div', { className: 'gp-ask-q' }, ask.q),
          ask.thinking ? e(Sprout, null)
            : e('div', { className: 'gp-ask-a' },
                ask.a && ask.a.text,
                ask.a && ask.a.type === 'fallback'
                  ? e('div', { className: 'gp-ask-hint' }, '↑ ' + t('whatIfHeading'))
                  : null
              )
        ) : null,
        e('form', { className: 'gp-ask-form', onSubmit: submitAsk },
          e('input', {
            type: 'text', className: 'gp-ask-input', value: askVal,
            placeholder: t('askPlaceholder'),
            onChange: function (ev) { setAskVal(ev.target.value); }
          }),
          e('button', { type: 'submit', className: 'gp-ask-send', 'aria-label': 'Ask' }, '→')
        )
      ),

      // Disclaimer + share
      e('div', { className: 'gp-bloom-foot gp-animate-in' },
        e('p', { className: 'gp-disclaimer' }, t('disclaimer')),
        e('button', { type: 'button', className: 'gp-share-btn', onClick: doShare, disabled: isSharing },
          isSharing ? t('sharePrepping') : ('📸 ' + t('share'))
        )
      )
    );
  }

  // ===========================================================================
  // Share image (canvas → PNG download)
  // ===========================================================================
  function renderShareImage(opts) {
    return new Promise(function (resolve) {
      var scale = 2;
      var W = 1200, H = 630;
      var c = document.createElement('canvas');
      c.width = W * scale; c.height = H * scale;
      var ctx = c.getContext('2d');
      ctx.scale(scale, scale);

      // Neumorphic light background
      var grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#F1F5F9');
      grad.addColorStop(1, '#E2E8F0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Soft card
      function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
      ctx.save();
      ctx.shadowColor = 'rgba(148,163,184,0.55)';
      ctx.shadowBlur = 40; ctx.shadowOffsetX = 16; ctx.shadowOffsetY = 16;
      ctx.fillStyle = '#EDF2F8';
      roundRect(64, 64, W - 128, H - 128, 32);
      ctx.fill();
      ctx.restore();

      // Silhouette curve
      ctx.save();
      var cx = 110, cw = W - 220, cy = 360, ch = 150;
      var pts = 40;
      ctx.beginPath();
      for (var i = 0; i <= pts; i++) {
        var yr = (opts.years * i) / pts;
        var v = futureValue(opts.you, opts.apy, yr);
        var vmax = futureValue(opts.you, opts.apy, opts.years) || 1;
        var X = cx + (i / pts) * cw;
        var Y = cy + ch - (v / vmax) * ch;
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.lineTo(cx + cw, cy + ch);
      ctx.lineTo(cx, cy + ch);
      ctx.closePath();
      var cgrad = ctx.createLinearGradient(0, cy, 0, cy + ch);
      cgrad.addColorStop(0, 'rgba(59,130,246,0.28)');
      cgrad.addColorStop(1, 'rgba(59,130,246,0)');
      ctx.fillStyle = cgrad;
      ctx.fill();
      // stroke
      ctx.beginPath();
      for (var k = 0; k <= pts; k++) {
        var yr2 = (opts.years * k) / pts;
        var v2 = futureValue(opts.you, opts.apy, yr2);
        var vmax2 = futureValue(opts.you, opts.apy, opts.years) || 1;
        var X2 = cx + (k / pts) * cw;
        var Y2 = cy + ch - (v2 / vmax2) * ch;
        if (k === 0) ctx.moveTo(X2, Y2); else ctx.lineTo(X2, Y2);
      }
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // Text
      ctx.fillStyle = '#0F172A';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '600 34px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillText('🌱 ' + (opts.goalLabel || ''), 110, 170);

      ctx.font = '700 84px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#1E40AF';
      ctx.fillText(opts.headline.replace('≈ ', '≈ '), 110, 270);

      ctx.font = '500 30px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(opts.subline, 110, 322);

      // Wordmark
      ctx.font = '700 30px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#3B82F6';
      ctx.textAlign = 'right';
      ctx.fillText('defi.garden 🌱', W - 110, H - 100);
      ctx.textAlign = 'left';
      ctx.font = '400 20px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(opts.footer, 110, H - 100);

      try {
        c.toBlob(function (blob) {
          if (!blob) { resolve(); return; }
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = 'my-defi-garden.png';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          resolve();
        }, 'image/png');
      } catch (err) { resolve(); }
    });
  }

  // ===========================================================================
  // Garden Report (return visit)
  // ===========================================================================
  function GardenReport(props) {
    var t = props.t, plan = props.plan, pools = props.pools;
    var live = useMemo(function () {
      var byId = {};
      (pools || []).forEach(function (p) { byId[p.pool] = p; });
      return plan.pools.map(function (sp) {
        var cur = byId[sp.pool];
        var liveApy = cur ? poolTotalApy(cur) : null;
        return {
          symbol: sp.symbol, project: sp.project, chain: sp.chain, pool: sp.pool,
          savedApy: sp.apy, liveApy: liveApy,
          gone: cur == null
        };
      });
    }, [plan, pools]);

    var liveApys = live.filter(function (r) { return r.liveApy != null; }).map(function (r) { return r.liveApy; });
    var newBlended = liveApys.length ? median(liveApys) : plan.blendedApy;
    var newProjection = futureValue(plan.monthly, newBlended, plan.years);

    var status, statusClass;
    if (newProjection > plan.projection * 1.02) { status = t('reportAhead'); statusClass = 'is-ahead'; }
    else if (newProjection < plan.projection * 0.98) { status = t('reportDipped'); statusClass = 'is-dipped'; }
    else { status = t('reportOnTrack'); statusClass = 'is-ontrack'; }

    var dateStr = '';
    try { dateStr = new Date(plan.savedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e7) { dateStr = plan.savedAt; }

    return e('div', { className: 'gp-report gp-animate-in' },
      e('div', { className: 'gp-report-head' },
        e('div', { className: 'gp-report-emoji' }, '🌿'),
        e('h2', { className: 'gp-report-title' }, t('reportSince', dateStr)),
        e('div', { className: 'gp-report-status ' + statusClass }, status)
      ),

      e('div', { className: 'gp-report-projection' },
        e('div', { className: 'gp-report-now' }, t('reportProjectionNow', formatUsdRounded(newProjection))),
        e('div', { className: 'gp-report-was' }, t('reportProjectionWas', formatUsdRounded(plan.projection)))
      ),

      e('div', { className: 'gp-report-pools' },
        live.map(function (r) {
          var delta = r.liveApy != null ? r.liveApy - r.savedApy : 0;
          var dir = r.gone ? 'gone' : (delta > 0.05 ? 'up' : (delta < -0.05 ? 'down' : 'flat'));
          return e('div', { key: r.pool, className: 'gp-report-pool' },
            e('div', { className: 'gp-report-pool-left' },
              e('span', { className: 'gp-report-pool-symbol' }, r.symbol),
              e('span', { className: 'gp-report-pool-project' }, r.project + ' · ' + r.chain)
            ),
            r.gone
              ? e('span', { className: 'gp-report-pool-gone' }, t('reportPoolGone'))
              : e('div', { className: 'gp-report-pool-right gp-delta-' + dir },
                  e('span', { className: 'gp-report-pool-apy' }, formatApy(r.liveApy)),
                  e('span', { className: 'gp-report-delta' },
                    dir === 'up' ? '▲ ' : (dir === 'down' ? '▼ ' : '● '),
                    (delta >= 0 ? '+' : '') + formatApy(delta).replace('%', '') + '%'
                  )
                )
          );
        })
      ),

      e('div', { className: 'gp-report-actions' },
        e('button', { type: 'button', className: 'gp-cta', onClick: props.onTend }, t('reportTend')),
        e('button', { type: 'button', className: 'gp-cta gp-cta-ghost', onClick: props.onFresh }, t('reportFresh'))
      ),
      e('p', { className: 'gp-disclaimer' }, t('disclaimer'))
    );
  }

  // ===========================================================================
  // Header (logo + theme toggle)
  // ===========================================================================
  function PlannerHeader(props) {
    return e('header', { className: 'gp-header' },
      e('a', { className: 'gp-logo', href: 'index.html' }, '🌱 DeFi Garden'),
      e('div', { className: 'gp-header-actions' },
        props.canRestart ? e('button', { type: 'button', className: 'gp-restart', onClick: props.onRestart }, props.restartLabel) : null,
        e('button', {
          type: 'button', className: 'gp-theme-toggle' + (props.dark ? ' is-dark' : ''),
          onClick: props.onToggleTheme, 'aria-label': 'Toggle theme'
        },
          e('span', { className: 'gp-theme-icon' }, props.dark ? '🌙' : '☀️')
        )
      )
    );
  }

  // ===========================================================================
  // Root app — finite-state scripted conversation
  // ===========================================================================
  var STEPS = ['goal', 'monthly', 'horizon', 'temperament', 'bloom'];

  function Planner() {
    var langState = useState(detectLang());
    var lang = langState[0];
    var t = useMemo(function () { return makeT(lang); }, [lang]);

    var themeState = useState(function () {
      try {
        var s = localStorage.getItem('theme');
        if (s) return s === 'dark';
      } catch (e8) {}
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    var dark = themeState[0], setDark = themeState[1];
    useEffect(function () {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (e9) {}
    }, [dark]);

    // Pools
    var poolsState = useState([]);
    var pools = poolsState[0], setPools = poolsState[1];
    var loadState = useState('loading'); // loading | ready | error
    var loadStatus = loadState[0], setLoadStatus = loadState[1];

    useEffect(function () {
      var alive = true;
      fetch(POOLS_API)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!alive) return;
          setPools((j && j.data) || []);
          setLoadStatus('ready');
        })
        .catch(function () { if (alive) setLoadStatus('error'); });
      return function () { alive = false; };
    }, []);

    // URL flags
    var urlParams = useMemo(function () { return new URLSearchParams(window.location.search); }, []);
    var presetKey = urlParams.get('preset');
    var preset = presetKey ? PRESETS[presetKey] : null;

    // Saved plan (return visit) — only when no preset / no fresh override
    var freshFlag = urlParams.get('fresh') === '1';
    var savedPlan = useMemo(function () { return (preset || freshFlag) ? null : loadSavedPlan(); }, [preset, freshFlag]);

    // mode: 'report' (return visit) | 'convo' (normal/preset)
    var modeState = useState(savedPlan ? 'report' : 'convo');
    var mode = modeState[0], setMode = modeState[1];

    // conversation answers
    var ansState = useState(function () {
      if (preset) return { goal: preset.goal, monthly: preset.monthly, years: preset.years, temperament: preset.temperament };
      return { goal: null, monthly: null, years: null, temperament: null };
    });
    var answers = ansState[0], setAnswers = ansState[1];

    var stepState = useState(preset ? 'goal' : 'goal');
    var step = stepState[0], setStep = stepState[1];
    var thinkingState = useState(false);
    var thinking = thinkingState[0], setThinking = thinkingState[1];

    // custom inputs
    var customMonthly = useState(''); var cm = customMonthly[0], setCm = customMonthly[1];
    var freeText = useState(''); var ft = freeText[0], setFt = freeText[1];
    var nudgeState = useState(false); var showNudge = nudgeState[0], setShowNudge = nudgeState[1];

    function advance(toStep) {
      if (prefersReducedMotion) { setStep(toStep); return; }
      setThinking(true);
      var delay = 600 + Math.random() * 300;
      setTimeout(function () { setThinking(false); setStep(toStep); }, delay);
    }

    function restart() {
      clearSavedPlan();
      setAnswers({ goal: null, monthly: null, years: null, temperament: null });
      setStep('goal'); setMode('convo'); setCm(''); setFt(''); setShowNudge(false);
      try {
        var u = new URL(window.location.href);
        u.searchParams.delete('preset'); u.searchParams.delete('fresh');
        window.history.replaceState({}, '', u.pathname + (u.search || ''));
      } catch (e10) {}
    }

    // Preset fast-forward: play steps quickly into the bloom.
    var presetPlayedRef = useRef(false);
    useEffect(function () {
      if (!preset || presetPlayedRef.current) return;
      presetPlayedRef.current = true;
      if (prefersReducedMotion) { setStep('bloom'); return; }
      var seq = ['monthly', 'horizon', 'temperament', 'bloom'];
      var delays = [520, 480, 480, 520];
      var acc = 360;
      seq.forEach(function (s, i) {
        acc += delays[i];
        setTimeout(function () { setStep(s); }, acc);
      });
    }, [preset]);

    // ---- step handlers ----
    function pickGoal(id) {
      setAnswers(function (a) { return Object.assign({}, a, { goal: id }); });
      setShowNudge(false);
      advance('monthly');
    }
    function submitFreeText(ev) {
      if (ev) ev.preventDefault();
      var text = ft.trim();
      if (!text) return;
      answerFreeText(text, { step: 'goal' }).then(function (res) {
        if (res.type === 'goal') {
          setFt('');
          pickGoal(res.goal);
        } else {
          setShowNudge(true);
        }
      });
    }
    function pickMonthly(v) {
      setAnswers(function (a) { return Object.assign({}, a, { monthly: v }); });
      advance('horizon');
    }
    function submitCustomMonthly(ev) {
      if (ev) ev.preventDefault();
      var v = parseInt(String(cm).replace(/[^0-9]/g, ''), 10);
      if (!v || v <= 0) return;
      setCm('');
      pickMonthly(v);
    }
    function pickYears(v) {
      setAnswers(function (a) { return Object.assign({}, a, { years: v }); });
      advance('temperament');
    }
    function pickTemperament(v) {
      setAnswers(function (a) { return Object.assign({}, a, { temperament: v }); });
      advance('bloom');
    }

    function onWhatIf(kind) {
      setAnswers(function (a) {
        var n = Object.assign({}, a);
        if (kind === 'more') n.monthly = (n.monthly || 0) + 200;
        else if (kind === 'longer') n.years = (n.years || 0) + 5;
        else if (kind === 'safer') n.temperament = n.temperament === 'bold' ? 'balanced' : 'sleep';
        else if (kind === 'bolder') n.temperament = n.temperament === 'sleep' ? 'balanced' : 'bold';
        return n;
      });
    }

    // ---------- RENDER ----------
    var stepIndex = STEPS.indexOf(step);

    // Build collapsed thread of prior answers
    var thread = [];
    if (stepIndex > 0 && answers.goal) thread.push(e(ThreadRow, { key: 'g', label: '🌱', value: t('youPicked', goalLabel(t, answers.goal)) }));
    if (stepIndex > 1 && answers.monthly != null) thread.push(e(ThreadRow, { key: 'm', label: '💧', value: t('monthlyChosen', formatUsd(answers.monthly)) }));
    if (stepIndex > 2 && answers.years != null) thread.push(e(ThreadRow, { key: 'y', label: '⏳', value: t('horizonChosen', answers.years) }));
    if (stepIndex > 3 && answers.temperament) {
      var tempTitle = { sleep: t('tempSleepTitle'), balanced: t('tempBalancedTitle'), bold: t('tempBoldTitle') }[answers.temperament];
      thread.push(e(ThreadRow, { key: 't', label: '🫶', value: t('tempChosen', tempTitle) }));
    }

    var content;
    if (mode === 'report' && savedPlan) {
      content = (loadStatus !== 'ready')
        ? e('div', { className: 'gp-loading' }, e(Sprout, null))
        : e(GardenReport, {
            t: t, plan: savedPlan, pools: pools,
            onTend: function () {
              setAnswers({ goal: savedPlan.goal, monthly: savedPlan.monthly, years: savedPlan.years, temperament: savedPlan.temperament });
              setMode('convo'); setStep('bloom');
            },
            onFresh: restart
          });
    } else {
      var stepBubble;
      if (thinking) {
        stepBubble = e(Sprout, null);
      } else if (step === 'goal') {
        stepBubble = e(Bubble, { key: 'goal' },
          preset ? e('p', { className: 'gp-preset-intro' }, t('presetIntro', preset.name)) : null,
          e('p', { className: 'gp-question' }, t('step1Question')),
          e(Chips, {
            wrap: true, selected: answers.goal,
            options: GOALS.map(function (g) { return { value: g.id, label: t(g.labelKey), emoji: g.emoji }; }),
            onPick: pickGoal
          }),
          e('form', { className: 'gp-freetext', onSubmit: submitFreeText },
            e('input', {
              type: 'text', className: 'gp-text-input', value: ft,
              placeholder: t('freeTextPlaceholder'),
              onChange: function (ev) { setFt(ev.target.value); setShowNudge(false); }
            }),
            e('button', { type: 'submit', className: 'gp-text-send', 'aria-label': 'Submit' }, '→')
          ),
          showNudge ? e('p', { className: 'gp-nudge' }, t('freeTextNudge')) : null
        );
      } else if (step === 'monthly') {
        stepBubble = e(Bubble, { key: 'monthly' },
          e('p', { className: 'gp-question' }, t('step2Question', goalLabel(t, answers.goal))),
          e(Chips, {
            selected: answers.monthly, wrap: true,
            options: [100, 250, 500, 1000, 2500].map(function (v) { return { value: v, label: formatUsd(v) }; }),
            onPick: pickMonthly
          }),
          e('form', { className: 'gp-freetext gp-money', onSubmit: submitCustomMonthly },
            e('span', { className: 'gp-money-prefix' }, '$'),
            e('input', {
              type: 'text', inputMode: 'numeric', className: 'gp-text-input', value: cm,
              placeholder: t('customAmount'),
              onChange: function (ev) { setCm(ev.target.value.replace(/[^0-9]/g, '')); }
            }),
            e('button', { type: 'submit', className: 'gp-text-send', 'aria-label': 'Submit' }, '→')
          )
        );
      } else if (step === 'horizon') {
        stepBubble = e(Bubble, { key: 'horizon' },
          e('p', { className: 'gp-question' }, t('step3Question')),
          e(Chips, {
            selected: answers.years, wrap: true,
            options: [5, 10, 15, 20, 30].map(function (v) { return { value: v, label: t('years', v) }; }),
            onPick: pickYears
          }),
          e('div', { className: 'gp-slider-row' },
            e('input', {
              type: 'range', min: 1, max: 40, step: 1, className: 'gp-slider',
              value: answers.years || 10,
              onChange: function (ev) { setAnswers(function (a) { return Object.assign({}, a, { years: parseInt(ev.target.value, 10) }); }); }
            }),
            e('span', { className: 'gp-slider-val' }, t('years', answers.years || 10))
          ),
          e('button', { type: 'button', className: 'gp-cta gp-slider-confirm', onClick: function () { pickYears(answers.years || 10); } }, '→')
        );
      } else if (step === 'temperament') {
        var cards = [
          { id: 'sleep', emoji: '😴', title: t('tempSleepTitle'), desc: t('tempSleepDesc'), risk: t('tempSleepRisk') },
          { id: 'balanced', emoji: '⚖️', title: t('tempBalancedTitle'), desc: t('tempBalancedDesc'), risk: t('tempBalancedRisk') },
          { id: 'bold', emoji: '🚀', title: t('tempBoldTitle'), desc: t('tempBoldDesc'), risk: t('tempBoldRisk') }
        ];
        stepBubble = e(Bubble, { key: 'temperament' },
          e('p', { className: 'gp-question' }, t('step4Question')),
          e('div', { className: 'gp-temp-cards' },
            cards.map(function (card) {
              return e('button', {
                key: card.id, type: 'button',
                className: 'gp-temp-card' + (answers.temperament === card.id ? ' is-selected' : ''),
                onClick: function () { pickTemperament(card.id); }
              },
                e('div', { className: 'gp-temp-emoji' }, card.emoji),
                e('div', { className: 'gp-temp-title' }, card.title),
                e('div', { className: 'gp-temp-desc' }, card.desc),
                e('div', { className: 'gp-temp-risk' }, card.risk)
              );
            })
          )
        );
      } else if (step === 'bloom') {
        if (loadStatus === 'loading') {
          stepBubble = e('div', { className: 'gp-loading' }, e(Sprout, null), e('p', { className: 'gp-loading-text' }, t('bloomBuilding')));
        } else if (loadStatus === 'error') {
          stepBubble = e('div', { className: 'gp-bloom-error' }, e('p', null, rootT(lang, 'loadingError')));
        } else {
          stepBubble = e(Bloom, {
            t: t, lang: lang, presetName: preset ? preset.name : null,
            goal: answers.goal, monthly: answers.monthly, years: answers.years, temperament: answers.temperament,
            pools: pools, onWhatIf: onWhatIf
          });
        }
      }

      content = e('div', { className: 'gp-convo' },
        thread.length ? e('div', { className: 'gp-thread' }, thread) : null,
        e('div', { className: 'gp-current' }, stepBubble)
      );
    }

    var canRestart = (mode === 'convo' && (stepIndex > 0 || step === 'bloom'));

    return e('div', { className: 'gp-app' },
      e(PlannerHeader, {
        dark: dark, onToggleTheme: function () { setDark(function (d) { return !d; }); },
        canRestart: canRestart, restartLabel: t('startFresh'), onRestart: restart
      }),
      e('main', { className: 'gp-main' },
        e('div', { className: 'gp-tagline' }, e('h1', null, t('title')), e('p', null, t('tagline'))),
        content
      )
    );
  }

  // Expose pure helpers for unit testing (node) and debugging.
  var api = {
    APY_SANITY_LIMIT: APY_SANITY_LIMIT,
    futureValue: futureValue, totalDeposited: totalDeposited,
    curatePools: curatePools, blendedApy: blendedApy, median: median,
    isStableSymbol: isStableSymbol, isAnomalousApy: isAnomalousApy,
    matchGoalFromText: matchGoalFromText, TEMPERAMENTS: TEMPERAMENTS,
    formatUsdRounded: formatUsdRounded
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    window.GardenPlanner = api;
    var mount = document.getElementById('planner-root');
    if (mount) ReactDOM.createRoot(mount).render(e(Planner));
  }
})();
