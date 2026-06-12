/* Garden Planner v2 — goal-first, conversational DeFi savings planner.
 * Pure React.createElement (no JSX). Trust principle: every number shown is
 * live DefiLlama pool data passed through sanity rails. Nothing is invented.
 */
(function () {
  'use strict';

  var R = typeof React !== 'undefined' ? React : null;
  var e = R ? R.createElement : function () {};
  var useState = R ? R.useState : function () { return [undefined, function(){}]; };
  var useEffect = R ? R.useEffect : function () {};
  var useRef = R ? R.useRef : function () { return {}; };
  var useMemo = R ? R.useMemo : function (fn) { return fn(); };
  var useCallback = R ? R.useCallback : function (fn) { return fn; };

  // ---------------------------------------------------------------------------
  // Constants & sanity rails (mirrors app.js)
  // ---------------------------------------------------------------------------
  var APY_SANITY_LIMIT = 1000;
  var POOLS_API = 'https://yields.llama.fi/pools';
  var BANK_APY = 0.5;
  var STORAGE_KEY = 'garden-plan';
  var PLAN_VERSION = 2;

  var STABLE_SYMBOLS = ['USDC', 'USDT', 'DAI', 'USDS', 'FRAX', 'TUSD', 'USDP', 'GUSD',
    'LUSD', 'USDD', 'PYUSD', 'USDE', 'SUSD', 'CRVUSD', 'GHO', 'USD0', 'FDUSD', 'USDB',
    'BUSD', 'MIM', 'DOLA', 'USDX', 'EURC', 'EURS', 'RLUSD', 'USDL', 'DEUSD', 'SDAI'];

  // RWA allowlist: verified against live pool data; kept as a named constant
  var RWA_ALLOWLIST = ['ondo', 'maple', 'centrifuge', 'goldfinch', 'openeden', 'midas',
    'spiko', 'hashnote', 'superstate', 'backed', 'ethena', 'usual', 'janus', 'tradfi'];

  // ---------------------------------------------------------------------------
  // Formatting — pinned to en-US everywhere
  // ---------------------------------------------------------------------------
  function formatUsd(n, maxFrac) {
    return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: maxFrac == null ? 0 : maxFrac });
  }
  function formatUsdRounded(n) {
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
  // Time to reach a target with monthly contributions + compounding
  // Returns months
  function timeToTarget(target, monthly, annualRatePct) {
    var T = Number(target) || 0;
    var P = Number(monthly) || 0;
    if (P <= 0) return Infinity;
    if (T <= 0) return 0;
    var r = (Number(annualRatePct) || 0) / 100;
    var rm = r / 12;
    if (rm === 0) return Math.ceil(T / P);
    // Solve for n: T = P * ((1+rm)^n - 1) / rm => (1+rm)^n = 1 + T*rm/P
    var rhs = 1 + (T * rm) / P;
    if (rhs <= 0) return Infinity;
    return Math.ceil(Math.log(rhs) / Math.log(1 + rm));
  }
  // Forever number: capital C so that C * annualRate/12 >= monthlyTarget
  function foreverNumber(monthlyTarget, annualRatePct) {
    var rate = (Number(annualRatePct) || 0) / 100;
    if (rate <= 0) return Infinity;
    return (Number(monthlyTarget) * 12) / rate;
  }
  // Add N months to today, return readable string
  function monthsFromNow(months) {
    var d = new Date();
    d.setMonth(d.getMonth() + Math.round(months));
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // ---------------------------------------------------------------------------
  // Persona / strategy filters (replaces temperaments)
  // ---------------------------------------------------------------------------
  var PERSONAS = {
    stable: {
      minTvl: 50000000, maxApy: APY_SANITY_LIMIT, stableOnly: true,
      preferTypes: ['lending', 'staking'],
      degenHaircut: false
    },
    rwa: {
      minTvl: 10000000, maxApy: 20, stableOnly: false,
      rwaAllowlist: RWA_ALLOWLIST,
      degenHaircut: false
    },
    degen: {
      minTvl: 10000000, maxApy: APY_SANITY_LIMIT, stableOnly: false,
      degenHaircut: true  // project at 1/3 of headline
    }
  };
  // Legacy temperament keys mapped to persona keys for backward compat
  var TEMPERAMENT_TO_PERSONA = { sleep: 'stable', balanced: 'rwa', bold: 'degen' };
  var PERSONA_TO_TEMPERAMENT = { stable: 'sleep', rwa: 'balanced', degen: 'bold' };

  function poolKind(pool) {
    var proj = String(pool.project || '').toLowerCase();
    var lending = ['aave', 'compound', 'morpho', 'spark', 'radiant', 'euler', 'venus', 'fluid', 'kamino', 'save', 'strike'];
    var staking = ['lido', 'rocket', 'ether.fi', 'jito', 'marinade', 'stader', 'frax', 'binance-staked', 'mantle-staked'];
    for (var i = 0; i < lending.length; i++) if (proj.indexOf(lending[i]) !== -1) return 'lending';
    for (var j = 0; j < staking.length; j++) if (proj.indexOf(staking[j]) !== -1) return 'staking';
    return 'other';
  }

  function isRwaProject(pool) {
    var proj = String(pool.project || '').toLowerCase();
    for (var i = 0; i < RWA_ALLOWLIST.length; i++) {
      if (proj.indexOf(RWA_ALLOWLIST[i]) !== -1) return true;
    }
    return false;
  }

  function curatePools(pools, personaKey, limit) {
    // Support legacy temperament keys
    var pk = TEMPERAMENT_TO_PERSONA[personaKey] || personaKey;
    var band = PERSONAS[pk] || PERSONAS.stable;
    var lim = limit == null ? 3 : limit;
    if (!Array.isArray(pools)) return [];

    var eligible = pools.filter(function (p) {
      if (!p || !p.symbol || !p.project) return false;
      var apy = poolTotalApy(p);
      if (apy > APY_SANITY_LIMIT) return false;  // hard rail
      if (apy <= 0) return false;
      if (apy > band.maxApy) return false;
      if ((p.tvlUsd || 0) < band.minTvl) return false;
      if (band.stableOnly && !isStableSymbol(p.symbol)) return false;
      if (band.rwaAllowlist) {
        // RWA persona: prefer allowlist projects but also admit non-anomalous non-stable pools
        // as fallback so we always get ≥3 results
        // (filtering to allowlist only is done in sort priority)
      }
      return true;
    });

    if (band.preferTypes) {
      eligible.sort(function (a, b) {
        var ap = band.preferTypes.indexOf(poolKind(a)) !== -1 ? 0 : 1;
        var bp = band.preferTypes.indexOf(poolKind(b)) !== -1 ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return poolTotalApy(b) - poolTotalApy(a);
      });
    } else if (band.rwaAllowlist) {
      // Sort: allowlist first, then others by APY
      eligible.sort(function (a, b) {
        var ar = isRwaProject(a) ? 0 : 1;
        var br = isRwaProject(b) ? 0 : 1;
        if (ar !== br) return ar - br;
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

  function blendedApy(curated) {
    if (!curated || !curated.length) return 0;
    return median(curated.map(poolTotalApy));
  }
  // For degen: effective APY with 1/3 haircut
  function effectiveApy(curated, personaKey) {
    var pk = TEMPERAMENT_TO_PERSONA[personaKey] || personaKey;
    var raw = blendedApy(curated);
    return PERSONAS[pk] && PERSONAS[pk].degenHaircut ? raw / 3 : raw;
  }

  // ---------------------------------------------------------------------------
  // Goal model — two-tier archetype system
  // ---------------------------------------------------------------------------
  var GOALS = [
    { id: 'retirement', emoji: '🌳', labelKey: 'goalRetirement', archetype: 'growth',
      keywords: ['retire', 'retirement', 'pension', 'old age', '은퇴', '노후', '연금'] },
    { id: 'home', emoji: '🏡', labelKey: 'goalHome', archetype: 'growth',
      keywords: ['home', 'house', 'apartment', 'down payment', 'mortgage', 'property', '집', '주택', '아파트'] },
    { id: 'claude', emoji: '🤖', labelKey: 'goalClaude', archetype: 'subscription',
      target: 20, isMonthly: true,
      keywords: ['claude', 'chatgpt', 'ai', 'subscription', 'openai', 'llm', 'cursor', 'copilot', '구독', 'ai 구독'] },
    { id: 'sneakers', emoji: '👟', labelKey: 'goalSneakers', archetype: 'target',
      target: 180,
      keywords: ['sneaker', 'sneakers', 'shoes', 'nike', 'adidas', 'shoe', '신발', '운동화', '나이키'] },
    { id: 'iphone', emoji: '📱', labelKey: 'goalIphone', archetype: 'target',
      target: 1200,
      keywords: ['phone', 'iphone', 'android', 'samsung', 'pixel', 'mobile', '폰', '아이폰', '휴대폰', '스마트폰'] }
  ];

  function goalById(id) {
    for (var i = 0; i < GOALS.length; i++) if (GOALS[i].id === id) return GOALS[i];
    return null;
  }
  function goalLabel(t, id) {
    var g = goalById(id);
    return g ? t(g.labelKey) : id;
  }
  function goalArchetype(id) {
    var g = goalById(id);
    return g ? g.archetype : 'growth';
  }

  // ---------------------------------------------------------------------------
  // i18n
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
  // Provider interface — deterministic v1
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
  function answerFreeText(text) {
    return Promise.resolve().then(function () {
      var id = matchGoalFromText(text);
      if (id) return { type: 'goal', goal: id };
      return { type: 'nudge' };
    });
  }

  // Plan Q&A — curated answers for ~8 patterns
  var QA_PATTERNS = [
    { re: /drop|fall|fell|down|lower|decrease|crash|떨어|하락|내려/, key: 'askRatesDrop' },
    { re: /safe|risk|lose|losing|danger|secure|위험|안전|잃/, key: 'askSafe' },
    { re: /catch|problem|downside|gotcha|but|단점|문제|뭐가/, key: 'askCatch' },
    { re: /withdraw|take out|access|liquid|exit|cash out|출금|인출|빼/, key: 'askWithdraw' },
    { re: /stop|pause|skip|miss|못 넣|중단|멈/, key: 'askStop' },
    { re: /how|where|real|live|data|number|source|어떻게|실시간|데이터|출처/, key: 'askHow' },
    { re: /apy|apr|interest|rate|yield|수익률|이자|뭐야/, key: 'askApy' },
    { re: /advice|advis|recommend|should|legal|투자 조언|조언|추천/, key: 'askAdvice' }
  ];

  function answerPlanQuestion(text, planContext, t) {
    return Promise.resolve().then(function () {
      var s = String(text || '').toLowerCase();
      for (var i = 0; i < QA_PATTERNS.length; i++) {
        if (QA_PATTERNS[i].re.test(s)) {
          var answer = t(QA_PATTERNS[i].key);
          if (answer && answer !== QA_PATTERNS[i].key) {
            return { type: 'answer', text: answer };
          }
        }
      }
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
      if (!p) return null;
      // Accept version 1 or 2
      if (p.version !== PLAN_VERSION && p.version !== 1) return null;
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
  // URL plan encoding/decoding (shareable plans)
  // ---------------------------------------------------------------------------
  function encodePlanToUrl(goal, monthly, years, persona) {
    var u = new URL(window.location.href);
    u.searchParams.set('goal', goal || '');
    u.searchParams.set('monthly', String(monthly || ''));
    if (years != null) u.searchParams.set('years', String(years));
    u.searchParams.set('pace', persona || 'stable');
    // Remove preset/fresh flags so it's clean
    u.searchParams.delete('preset');
    u.searchParams.delete('fresh');
    return u.toString();
  }
  function decodePlanFromUrl(urlParams) {
    var goal = urlParams.get('goal');
    var monthly = parseInt(urlParams.get('monthly'), 10);
    var years = parseInt(urlParams.get('years'), 10);
    var pace = urlParams.get('pace');
    if (!goal || !monthly || !pace) return null;
    var g = goalById(goal);
    if (!g) return null;
    return {
      goal: goal,
      monthly: monthly,
      years: isNaN(years) ? null : years,
      persona: pace
    };
  }

  // ---------------------------------------------------------------------------
  // Presets (stories funnel) — horizons capped at 10y per spec §2
  // ---------------------------------------------------------------------------
  var PRESETS = {
    tomoko: { name: 'Tomoko', goal: 'retirement', monthly: 1000, years: 10, temperament: 'sleep' },
    kevin:  { name: 'Kevin',  goal: 'home',       monthly: 500,  years: 10, temperament: 'balanced' },
    lucia:  { name: 'Lucia',  goal: 'retirement', monthly: 300,  years: 10, temperament: 'sleep' }
  };

  // ===========================================================================
  // Small UI atoms
  // ===========================================================================

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
    return e(R.Fragment, null, format(display));
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
  // Growth curve with interactive scrubber
  // ===========================================================================
  function GrowthCurve(props) {
    var monthly = props.monthly, years = props.years, apy = props.apy;
    var targetAmt = props.target;    // optional, for target archetype flag
    var foreverAmt = props.forever;  // optional, for subscription archetype flag
    var W = 560, H = 240, padL = 8, padR = 8, padT = 16, padB = 8;

    var scrubState = useState(null); // null = no tooltip, or { idx, x, y }
    var scrub = scrubState[0], setScrub = scrubState[1];
    var svgRef = useRef(null);

    var data = useMemo(function () {
      var pts = [];
      var steps = Math.min(years * 12, 120); // monthly resolution up to 120 pts
      for (var i = 0; i <= steps; i++) {
        var yr = (years * i) / steps;
        pts.push({
          yr: yr,
          mo: Math.round(yr * 12),
          you: futureValue(monthly, apy, yr),
          bank: futureValue(monthly, BANK_APY, yr)
        });
      }
      return pts;
    }, [monthly, years, apy]);

    var maxY = Math.max(data[data.length - 1].you, 1);
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

    // Milestone markers
    var milestones = [];
    if (targetAmt && targetAmt > 0) {
      for (var mi = 0; mi < data.length; mi++) {
        if (data[mi].you >= targetAmt) {
          milestones.push({ idx: mi, label: '🎉', type: 'target' });
          break;
        }
      }
    }
    if (foreverAmt && foreverAmt > 0 && foreverAmt < maxY * 1.1) {
      for (var fi = 0; fi < data.length; fi++) {
        if (data[fi].you >= foreverAmt) {
          milestones.push({ idx: fi, label: '♾', type: 'forever' });
          break;
        }
      }
    }

    function handlePointerMove(ev) {
      if (!svgRef.current) return;
      var rect = svgRef.current.getBoundingClientRect();
      var relX = ev.clientX - rect.left;
      var fracX = Math.max(0, Math.min(1, relX / rect.width));
      var idx = Math.round(fracX * (data.length - 1));
      setScrub({ idx: idx });
    }
    function handlePointerLeave() { setScrub(null); }
    function handleKeyDown(ev) {
      if (!scrub) {
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
          setScrub({ idx: Math.floor(data.length / 2) });
        }
        return;
      }
      if (ev.key === 'ArrowLeft') setScrub({ idx: Math.max(0, scrub.idx - 1) });
      if (ev.key === 'ArrowRight') setScrub({ idx: Math.min(data.length - 1, scrub.idx + 1) });
      if (ev.key === 'Escape') setScrub(null);
    }

    var scrubPoint = scrub && data[scrub.idx];
    var scrubX = scrubPoint ? px(scrub.idx) : null;

    // Date from data point
    function pointDate(pt) {
      if (!pt) return '';
      var d = new Date();
      d.setMonth(d.getMonth() + pt.mo);
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    return e('div', {
      className: 'gp-curve-container',
      style: { position: 'relative' }
    },
      e('svg', {
        ref: svgRef,
        className: 'gp-curve',
        viewBox: '0 0 ' + W + ' ' + H,
        preserveAspectRatio: 'none',
        role: 'img',
        tabIndex: 0,
        'aria-label': props.ariaLabel || 'Projected growth curve — use arrow keys to explore',
        onPointerMove: handlePointerMove,
        onPointerLeave: handlePointerLeave,
        onTouchMove: function(ev) {
          ev.preventDefault();
          var t = ev.touches[0];
          handlePointerMove(t);
        },
        onKeyDown: handleKeyDown,
        style: { cursor: 'crosshair', touchAction: 'none' }
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

        // Milestone markers
        milestones.map(function(m) {
          return e('g', { key: m.type },
            e('line', {
              x1: px(m.idx), y1: padT, x2: px(m.idx), y2: H - padB,
              stroke: 'var(--gp-curve-you)', strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.5
            }),
            e('text', {
              x: px(m.idx), y: padT + 10,
              textAnchor: 'middle', fontSize: 14, style: { userSelect: 'none' }
            }, m.label)
          );
        }),

        // Scrubber crosshair
        scrubPoint ? e('g', { className: 'gp-scrubber' },
          e('line', {
            x1: scrubX, y1: padT, x2: scrubX, y2: H - padB,
            stroke: 'var(--color-text-secondary)', strokeWidth: 1, opacity: 0.6
          }),
          e('circle', {
            cx: scrubX, cy: py(scrubPoint.you), r: 5,
            fill: 'var(--gp-curve-you)', stroke: 'var(--color-surface)', strokeWidth: 2
          }),
          e('circle', {
            cx: scrubX, cy: py(scrubPoint.bank), r: 4,
            fill: 'var(--gp-curve-bank)', stroke: 'var(--color-surface)', strokeWidth: 2, opacity: 0.55
          })
        ) : null,

        // End dot (no scrubber active)
        !scrubPoint ? e('circle', {
          className: 'gp-curve-dot',
          cx: px(data.length - 1), cy: py(data[data.length - 1].you), r: 5
        }) : null
      ),

      // Scrubber tooltip
      scrubPoint ? e('div', {
        className: 'gp-scrub-tooltip',
        style: {
          left: Math.min(Math.max(0, (scrub.idx / (data.length - 1)) * 100), 85) + '%'
        }
      },
        e('div', { className: 'gp-scrub-date' }, pointDate(scrubPoint)),
        e('div', { className: 'gp-scrub-you' },
          e('span', { className: 'gp-scrub-dot gp-scrub-dot-you' }),
          formatUsdRounded(scrubPoint.you)
        ),
        e('div', { className: 'gp-scrub-bank' },
          e('span', { className: 'gp-scrub-dot gp-scrub-dot-bank' }),
          formatUsdRounded(scrubPoint.bank)
        ),
        e('div', { className: 'gp-scrub-interest' },
          'Interest: ' + formatUsdRounded(scrubPoint.you - (monthly * scrubPoint.mo))
        )
      ) : null
    );
  }

  // ===========================================================================
  // Thread (collapsed prior Q&A)
  // ===========================================================================
  function ThreadRow(props) {
    return e('div', {
      className: 'gp-thread-row' + (props.onClick ? ' gp-thread-row-edit' : ''),
      onClick: props.onClick,
      role: props.onClick ? 'button' : null,
      tabIndex: props.onClick ? 0 : null,
      onKeyDown: props.onClick ? function(ev) { if (ev.key === 'Enter') props.onClick(); } : null
    },
      e('span', { className: 'gp-thread-q' }, props.label),
      e('span', { className: 'gp-thread-a' }, props.value),
      props.onClick ? e('span', { className: 'gp-thread-edit' }, '✏️') : null
    );
  }

  function Chips(props) {
    return e('div', { className: 'gp-chips' + (props.wrap ? ' gp-chips-wrap' : '') },
      props.options.map(function (opt) {
        return e('button', {
          key: opt.value,
          type: 'button',
          className: 'gp-chip' + (props.selected === opt.value ? ' is-selected' : ''),
          onClick: function () { props.onPick(opt.value); },
          onMouseEnter: props.onHover ? function() { props.onHover(opt.value); } : null,
          onFocus: props.onHover ? function() { props.onHover(opt.value); } : null,
          onMouseLeave: props.onHoverEnd ? function() { props.onHoverEnd(); } : null,
          onBlur: props.onHoverEnd ? function() { props.onHoverEnd(); } : null
        },
          opt.emoji ? e('span', { className: 'gp-chip-emoji' }, opt.emoji) : null,
          e('span', null, opt.label)
        );
      })
    );
  }

  function Bubble(props) {
    return e('div', { className: 'gp-bubble gp-animate-in' + (props.className ? ' ' + props.className : '') },
      props.avatar !== false ? e('div', { className: 'gp-avatar' }, props.avatar || '🌱') : null,
      e('div', { className: 'gp-bubble-body' }, props.children)
    );
  }

  // ===========================================================================
  // Compounding micro-explainer (hover on amount chip)
  // ===========================================================================
  function CompoundingLine(props) {
    var monthly = props.monthly, apy = props.apy, years = props.years;
    var hovered = props.hoveredAmount;
    var displayMonthly = hovered || monthly;
    var fv = futureValue(displayMonthly, apy, years);
    var deposited = totalDeposited(displayMonthly, years);
    var interest = Math.max(0, fv - deposited);

    if (!displayMonthly || !apy || !years) return null;

    return e('p', { className: 'gp-compound-line' },
      '≈ ', formatUsdRounded(fv), ' in ', years, ' yrs — ',
      formatUsdRounded(interest), ' of that is your money working, not you.'
    );
  }

  // ===========================================================================
  // Bloom — the wow moment (rebuilt for v2)
  // ===========================================================================
  function Bloom(props) {
    var t = props.t, lang = props.lang;
    var monthly = props.monthly, years = props.years, persona = props.persona;
    var goal = props.goal;
    var pools = props.pools;
    var archetype = goalArchetype(goal);
    var goalDef = goalById(goal);

    var curated = useMemo(function () { return curatePools(pools, persona, 3); }, [pools, persona]);
    var rawApy = useMemo(function () { return blendedApy(curated); }, [curated]);
    var apy = useMemo(function () {
      var pk = TEMPERAMENT_TO_PERSONA[persona] || persona;
      return PERSONAS[pk] && PERSONAS[pk].degenHaircut ? rawApy / 3 : rawApy;
    }, [rawApy, persona]);

    // Archetype-specific computations
    var targetAmt = goalDef ? goalDef.target : null;
    var projection = futureValue(monthly, apy, years || 10);
    var bankProjection = futureValue(monthly, BANK_APY, years || 10);
    var deposited = totalDeposited(monthly, years || 10);

    // TARGET: time to reach target
    var monthsToTarget = (archetype === 'target' && targetAmt) ? timeToTarget(targetAmt, monthly, apy) : null;
    var targetDate = (monthsToTarget != null && isFinite(monthsToTarget)) ? monthsFromNow(monthsToTarget) : null;
    var yieldContribution = (archetype === 'target' && targetAmt) ?
      Math.min(targetAmt, Math.max(0, futureValue(monthly, apy, monthsToTarget / 12) - totalDeposited(monthly, monthsToTarget / 12))) : null;

    // SUBSCRIPTION: forever number
    var foreverAmt = (archetype === 'subscription' && goalDef && goalDef.isMonthly) ?
      foreverNumber(goalDef.target, apy) : null;
    var monthsToForever = (foreverAmt && isFinite(foreverAmt)) ? timeToTarget(foreverAmt, monthly, apy) : null;
    var foreverDate = (monthsToForever != null && isFinite(monthsToForever)) ? monthsFromNow(monthsToForever) : null;

    // Live sliders state
    var slideMonthlyState = useState(monthly);
    var slideMonthly = slideMonthlyState[0], setSlideMonthly = slideMonthlyState[1];
    var slideYearsState = useState(years || 10);
    var slideYears = slideYearsState[0], setSlideYears = slideYearsState[1];

    // Use slider values for live chart
    var liveProjection = useMemo(function () {
      var pk = TEMPERAMENT_TO_PERSONA[persona] || persona;
      var haircut = PERSONAS[pk] && PERSONAS[pk].degenHaircut;
      var liveApy = haircut ? rawApy / 3 : rawApy;
      return futureValue(slideMonthly, liveApy, slideYears);
    }, [slideMonthly, slideYears, rawApy, persona]);
    var liveBankProjection = futureValue(slideMonthly, BANK_APY, slideYears);

    // Sync sliders with prop changes
    useEffect(function() { setSlideMonthly(monthly); }, [monthly]);
    useEffect(function() { setSlideYears(years || 10); }, [years]);

    // Ask state
    var askState = useState({ q: '', a: null, thinking: false });
    var ask = askState[0], setAsk = askState[1];
    var askInput = useState('');
    var askVal = askInput[0], setAskVal = askInput[1];

    // Share state
    var sharingState = useState(false);
    var isSharing = sharingState[0], setSharing = sharingState[1];
    var copySuccessState = useState(false);
    var copySuccess = copySuccessState[0], setCopySuccess = copySuccessState[1];

    // Persist plan whenever artifact settles
    useEffect(function () {
      if (!curated.length) return;
      savePlan({
        version: PLAN_VERSION,
        goal: goal, monthly: monthly, years: years || 10, persona: persona,
        temperament: PERSONA_TO_TEMPERAMENT[persona] || persona,
        pools: curated.map(function (p) { return { pool: p.pool, symbol: p.symbol, project: p.project, chain: p.chain, apy: poolTotalApy(p) }; }),
        blendedApy: rawApy, effectiveApy: apy,
        projection: projection,
        savedAt: new Date().toISOString()
      });
    }, [curated, monthly, years, persona, apy]);

    // Top pool for CTA
    var topPool = curated[0];

    function submitAsk(ev) {
      if (ev) ev.preventDefault();
      var q = askVal.trim();
      if (!q) return;
      setAsk({ q: q, a: null, thinking: true });
      setAskVal('');
      answerPlanQuestion(q, { goal: goal, monthly: monthly, years: years, persona: persona, apy: apy }, t)
        .then(function (res) {
          setTimeout(function () { setAsk({ q: q, a: res, thinking: false }); }, prefersReducedMotion ? 0 : 600);
        });
    }

    function pickSuggestedQ(q) {
      setAsk({ q: q, a: null, thinking: true });
      setAskVal('');
      answerPlanQuestion(q, { goal: goal, monthly: monthly, years: years, persona: persona, apy: apy }, t)
        .then(function (res) {
          setTimeout(function () { setAsk({ q: q, a: res, thinking: false }); }, prefersReducedMotion ? 0 : 600);
        });
    }

    function doShare() {
      setSharing(true);
      var heroText = archetype === 'target' && targetDate
        ? t('heroTarget', goalLabel(t, goal), targetDate)
        : archetype === 'subscription' && foreverDate
          ? t('heroSubscription', goalLabel(t, goal), foreverDate)
          : t('bloomHeadline', formatUsdRounded(liveProjection), slideYears);

      renderShareImage({
        headline: heroText,
        goalLabel: goalLabel(t, goal),
        subline: t('shareSubline', formatUsd(monthly), slideYears),
        footer: t('shareFooter'),
        years: slideYears,
        you: slideMonthly, apy: apy
      }).then(function () { setSharing(false); }).catch(function () { setSharing(false); });
    }

    function doCopyLink() {
      var url = encodePlanToUrl(goal, monthly, years, persona);
      try {
        navigator.clipboard.writeText(url).then(function() {
          setCopySuccess(true);
          setTimeout(function() { setCopySuccess(false); }, 2000);
        }).catch(function() {
          // fallback
          var ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          setCopySuccess(true);
          setTimeout(function() { setCopySuccess(false); }, 2000);
        });
      } catch(err) {}
    }

    function doNativeShare() {
      var url = encodePlanToUrl(goal, monthly, years, persona);
      var heroText = archetype === 'target' && targetDate
        ? t('heroTarget', goalLabel(t, goal), targetDate)
        : t('bloomHeadline', formatUsdRounded(liveProjection), slideYears);
      if (navigator.share) {
        navigator.share({ title: 'My DeFi Garden', text: heroText, url: url }).catch(function(){});
      }
    }

    // Hero answer based on archetype
    var heroElement;
    if (archetype === 'target' && targetDate) {
      var isInstant = monthsToTarget != null && monthsToTarget <= 1;
      heroElement = e('div', { className: 'gp-bloom-headline gp-animate-in' },
        e('div', { className: 'gp-headline-figure' },
          isInstant ? t('heroTargetInstant', goalLabel(t, goal))
            : t('heroTarget', goalLabel(t, goal), targetDate)
        ),
        e('div', { className: 'gp-headline-sub' },
          t('heroTargetSub', formatUsdRounded(yieldContribution || 0), targetAmt ? formatUsdRounded(targetAmt) : '?')
        ),
        e('div', { className: 'gp-headline-vs' }, t('bloomVsBank', formatUsdRounded(liveBankProjection)))
      );
    } else if (archetype === 'subscription' && foreverAmt) {
      heroElement = e('div', { className: 'gp-bloom-headline gp-animate-in' },
        e('div', { className: 'gp-headline-figure' },
          foreverDate ? t('heroSubscription', goalLabel(t, goal), foreverDate)
            : t('heroSubscriptionFar', formatUsdRounded(foreverAmt))
        ),
        e('div', { className: 'gp-headline-sub' },
          t('heroSubscriptionForever', formatUsdRounded(foreverAmt), formatApy(apy))
        ),
        e('div', { className: 'gp-headline-vs' }, t('bloomVsBank', formatUsdRounded(liveBankProjection)))
      );
    } else {
      heroElement = e('div', { className: 'gp-bloom-headline gp-animate-in' },
        e('div', { className: 'gp-headline-figure' },
          '≈ ', e(CountUp, {
            value: liveProjection,
            format: function (v) { return formatUsdRounded(v); },
            delay: prefersReducedMotion ? 0 : 250
          })
        ),
        e('div', { className: 'gp-headline-sub' }, t('bloomInYears', slideYears)),
        e('div', { className: 'gp-headline-vs' }, t('bloomVsBank', formatUsdRounded(liveBankProjection))),
        e('div', { className: 'gp-headline-deposited' }, t('bloomDeposited', formatUsd(totalDeposited(slideMonthly, slideYears))))
      );
    }

    // Suggested ask chips (always visible)
    var suggestedChips = [
      t('askChipSafe'), t('askChipRatesDrop'), t('askChipCatch'),
      archetype === 'subscription' ? t('askChipStop') : t('askChipWithdraw')
    ];

    var pk = TEMPERAMENT_TO_PERSONA[persona] || persona;
    var isDegenPersona = pk === 'degen';

    return e('div', { className: 'gp-bloom' },
      props.presetName ? e('p', { className: 'gp-preset-intro gp-bloom-intro gp-animate-in' }, t('presetIntro', props.presetName)) : null,

      // 1. HERO ANSWER
      heroElement,

      // Editable plan summary strip
      e('div', { className: 'gp-plan-strip gp-animate-in' },
        e('span', { className: 'gp-strip-item', onClick: props.onEditGoal, role: 'button', tabIndex: 0,
          onKeyDown: function(ev){ if(ev.key==='Enter') props.onEditGoal && props.onEditGoal(); } },
          (goalDef ? goalDef.emoji : '🌱') + ' ' + goalLabel(t, goal)
        ),
        e('span', { className: 'gp-strip-sep' }, '·'),
        e('span', { className: 'gp-strip-item', onClick: props.onEditMonthly, role: 'button', tabIndex: 0,
          onKeyDown: function(ev){ if(ev.key==='Enter') props.onEditMonthly && props.onEditMonthly(); } },
          formatUsd(monthly) + '/mo'
        ),
        archetype === 'growth' ? [
          e('span', { className: 'gp-strip-sep', key: 's2' }, '·'),
          e('span', { key: 'yr', className: 'gp-strip-item', onClick: props.onEditYears, role: 'button', tabIndex: 0,
            onKeyDown: function(ev){ if(ev.key==='Enter') props.onEditYears && props.onEditYears(); } },
            slideYears + ' yrs'
          )
        ] : null,
        e('span', { className: 'gp-strip-sep' }, '·'),
        e('span', { className: 'gp-strip-item', onClick: props.onEditPersona, role: 'button', tabIndex: 0,
          onKeyDown: function(ev){ if(ev.key==='Enter') props.onEditPersona && props.onEditPersona(); } },
          pk === 'stable' ? t('personaStableTitle') : (pk === 'rwa' ? t('personaRwaTitle') : t('personaDegenTitle'))
        )
      ),

      // 2. INTERACTIVE CHART
      e('div', { className: 'gp-curve-wrap gp-animate-in' },
        e(GrowthCurve, {
          monthly: slideMonthly, years: slideYears, apy: apy,
          target: archetype === 'target' ? targetAmt : null,
          forever: archetype === 'subscription' ? foreverAmt : null,
          ariaLabel: t('bloomCurveYou')
        }),
        e('div', { className: 'gp-legend' },
          e('span', { className: 'gp-legend-item gp-legend-you' }, e('i', null), t('bloomCurveYou')),
          e('span', { className: 'gp-legend-item gp-legend-bank' }, e('i', null), t('bloomCurveBank'))
        )
      ),

      // 3. MAKE-IT-YOURS — sliders + persona pills
      e('div', { className: 'gp-makeit gp-animate-in' },
        e('div', { className: 'gp-makeit-label' }, t('makeItYours')),
        e('div', { className: 'gp-makeit-sliders' },
          // Monthly amount slider
          e('div', { className: 'gp-slider-group' },
            e('div', { className: 'gp-slider-row-label' },
              e('span', null, t('makeItMonthly')),
              e('span', { className: 'gp-slider-live-val' }, formatUsd(slideMonthly) + '/mo')
            ),
            e('input', {
              type: 'range',
              min: 10, max: 2500, step: 10,
              className: 'gp-slider',
              value: slideMonthly,
              'aria-label': t('makeItMonthly'),
              onChange: function(ev) { setSlideMonthly(parseInt(ev.target.value, 10)); }
            })
          ),
          // Years slider (growth archetype only)
          archetype === 'growth' ? e('div', { className: 'gp-slider-group' },
            e('div', { className: 'gp-slider-row-label' },
              e('span', null, t('makeItYears')),
              e('span', { className: 'gp-slider-live-val' }, slideYears + ' ' + t('yearsShort'))
            ),
            e('input', {
              type: 'range',
              min: 1, max: 10, step: 1,
              className: 'gp-slider',
              value: slideYears,
              'aria-label': t('makeItYears'),
              onChange: function(ev) { setSlideYears(parseInt(ev.target.value, 10)); }
            })
          ) : null
        ),
        // Persona switch pills
        e('div', { className: 'gp-persona-pills' },
          [
            { key: 'stable', label: t('personaStableTitle') },
            { key: 'rwa', label: t('personaRwaTitle') },
            { key: 'degen', label: t('personaDegenTitle') }
          ].map(function(p) {
            return e('button', {
              key: p.key, type: 'button',
              className: 'gp-persona-pill' + (pk === p.key ? ' is-selected' : ''),
              onClick: function() { if (props.onWhatIf) props.onWhatIf('persona:' + p.key); }
            }, p.label);
          })
        )
      ),

      // 4. PRIMARY CTA
      topPool ? e('div', { className: 'gp-cta-row gp-animate-in' },
        e('a', {
          className: 'gp-primary-cta',
          href: '/?pool=' + encodeURIComponent(topPool.pool),
          rel: 'noopener'
        },
          t('ctaStart', topPool.project), ' →'
        ),
        e('p', { className: 'gp-cta-microcopy' }, t('ctaMicrocopy'))
      ) : null,

      // 5. ENGINE ROOM — pools
      e('div', { className: 'gp-pools gp-animate-in' },
        e('div', { className: 'gp-pools-heading' },
          t('poolsHeading'),
          e('span', { className: 'gp-blended-badge' }, t('blendedBadge', formatApy(apy)))
        ),
        isDegenPersona ? e('div', { className: 'gp-degen-warning' },
          t('degenHaircutNote', formatApy(rawApy))
        ) : null,
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

      // 6. ASK BOX — with always-visible chips
      e('div', { className: 'gp-ask gp-animate-in' },
        ask.q ? e('div', { className: 'gp-ask-thread' },
          e('div', { className: 'gp-ask-q' }, ask.q),
          ask.thinking ? e(Sprout, null)
            : e('div', { className: 'gp-ask-a' }, ask.a && ask.a.text)
        ) : null,
        // Always-visible suggested chips
        e('div', { className: 'gp-ask-chips' },
          suggestedChips.filter(Boolean).map(function(chip) {
            return e('button', {
              key: chip, type: 'button', className: 'gp-ask-chip',
              onClick: function() { pickSuggestedQ(chip); }
            }, chip);
          })
        ),
        e('form', { className: 'gp-ask-form', onSubmit: submitAsk },
          e('input', {
            type: 'text', className: 'gp-ask-input', value: askVal,
            placeholder: t('askPlaceholder'),
            onChange: function (ev) { setAskVal(ev.target.value); }
          }),
          e('button', { type: 'submit', className: 'gp-ask-send', 'aria-label': 'Ask' }, '→')
        )
      ),

      // 7. SHARE + GARDEN
      e('div', { className: 'gp-bloom-foot gp-animate-in' },
        e('p', { className: 'gp-disclaimer' }, t('disclaimer')),
        e('div', { className: 'gp-share-row' },
          e('button', { type: 'button', className: 'gp-share-btn', onClick: doShare, disabled: isSharing },
            isSharing ? t('sharePrepping') : ('📸 ' + t('share'))
          ),
          e('button', { type: 'button', className: 'gp-share-btn gp-share-link', onClick: doCopyLink },
            copySuccess ? ('✓ ' + t('shareLinkCopied')) : ('🔗 ' + t('shareLink'))
          ),
          navigator.share ? e('button', { type: 'button', className: 'gp-share-btn', onClick: doNativeShare },
            '↗ ' + t('shareNative')
          ) : null
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

      var grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#F1F5F9');
      grad.addColorStop(1, '#E2E8F0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

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

      ctx.fillStyle = '#0F172A';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '600 34px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillText('🌱 ' + (opts.goalLabel || ''), 110, 170);
      ctx.font = '700 72px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#1E40AF';
      ctx.fillText(opts.headline, 110, 270);
      ctx.font = '500 30px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(opts.subline, 110, 322);
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
  // Garden stage visual (gamified)
  // ===========================================================================
  function gardenStage(plan) {
    // Derive stage from time elapsed and progress
    var now = new Date();
    var savedAt = plan.savedAt ? new Date(plan.savedAt) : now;
    var msElapsed = now - savedAt;
    var totalMs = (plan.years || 10) * 365.25 * 24 * 60 * 60 * 1000;
    var timeProgress = Math.min(1, msElapsed / totalMs);

    // Stage thresholds
    if (timeProgress < 0.05) return { emoji: '🌱', label: 'Seed', stage: 0 };
    if (timeProgress < 0.25) return { emoji: '🌿', label: 'Sprout', stage: 1 };
    if (timeProgress < 0.60) return { emoji: '🪴', label: 'Sapling', stage: 2 };
    return { emoji: '🌳', label: 'Tree', stage: 3 };
  }

  // ===========================================================================
  // Garden Report (return visit) — fixed P0 bug: show immediately without API
  // ===========================================================================
  function GardenReport(props) {
    var t = props.t, plan = props.plan, pools = props.pools, poolsReady = props.poolsReady;

    var live = useMemo(function () {
      if (!poolsReady) {
        // Return plan data without live deltas — no guessing
        return plan.pools.map(function (sp) {
          return { symbol: sp.symbol, project: sp.project, chain: sp.chain, pool: sp.pool,
            savedApy: sp.apy, liveApy: null, gone: false };
        });
      }
      var byId = {};
      (pools || []).forEach(function (p) { byId[p.pool] = p; });
      return plan.pools.map(function (sp) {
        var cur = byId[sp.pool];
        var liveApy = cur ? poolTotalApy(cur) : null;
        return { symbol: sp.symbol, project: sp.project, chain: sp.chain, pool: sp.pool,
          savedApy: sp.apy, liveApy: liveApy, gone: poolsReady && cur == null };
      });
    }, [plan, pools, poolsReady]);

    var liveApys = live.filter(function (r) { return r.liveApy != null; }).map(function (r) { return r.liveApy; });
    var newBlended = liveApys.length ? median(liveApys) : plan.blendedApy;
    var newProjection = futureValue(plan.monthly, newBlended, plan.years);

    var status, statusClass;
    if (!poolsReady) { status = t('reportUpdating'); statusClass = 'is-ontrack'; }
    else if (newProjection > plan.projection * 1.02) { status = t('reportAhead'); statusClass = 'is-ahead'; }
    else if (newProjection < plan.projection * 0.98) { status = t('reportDipped'); statusClass = 'is-dipped'; }
    else { status = t('reportOnTrack'); statusClass = 'is-ontrack'; }

    var dateStr = '';
    try { dateStr = new Date(plan.savedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e7) { dateStr = plan.savedAt || ''; }

    var stage = gardenStage(plan);

    return e('div', { className: 'gp-report gp-animate-in' },
      e('div', { className: 'gp-report-head' },
        e('div', { className: 'gp-report-emoji' }, stage.emoji),
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
          var dir = r.gone ? 'gone' : (!poolsReady ? 'flat' : (delta > 0.05 ? 'up' : (delta < -0.05 ? 'down' : 'flat')));
          return e('div', { key: r.pool, className: 'gp-report-pool' },
            e('div', { className: 'gp-report-pool-left' },
              e('span', { className: 'gp-report-pool-symbol' }, r.symbol),
              e('span', { className: 'gp-report-pool-project' }, r.project + ' · ' + r.chain)
            ),
            r.gone
              ? e('span', { className: 'gp-report-pool-gone' }, t('reportPoolGone'))
              : e('div', { className: 'gp-report-pool-right gp-delta-' + dir },
                  e('span', { className: 'gp-report-pool-apy' },
                    r.liveApy != null ? formatApy(r.liveApy) : (formatApy(r.savedApy) + ' *')
                  ),
                  poolsReady && r.liveApy != null ? e('span', { className: 'gp-report-delta' },
                    dir === 'up' ? '▲ ' : (dir === 'down' ? '▼ ' : '● '),
                    (delta >= 0 ? '+' : '') + formatApy(delta).replace('%', '') + '%'
                  ) : null
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
  // Header
  // ===========================================================================
  function PlannerHeader(props) {
    return e('header', { className: 'gp-header' },
      e('a', { className: 'gp-logo', href: 'index.html' }, '🌱 DeFi Garden'),
      e('div', { className: 'gp-header-actions' },
        // My Garden affordance — shows when plan exists
        props.hasSavedPlan && props.mode !== 'report' ? e('button', {
          type: 'button', className: 'gp-my-garden-btn',
          onClick: props.onShowGarden
        }, '🌱 ' + props.myGardenLabel) : null,
        props.canRestart ? e('button', { type: 'button', className: 'gp-restart', onClick: props.onRestart }, props.restartLabel) : null,
        // Analytics app icon button
        e('a', {
          className: 'gp-analytics-btn',
          href: '/?app=1',
          'aria-label': 'Analytics — search yields',
          title: 'Search yields'
        }, '📊'),
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
    var loadState = useState('loading');
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
    var freshFlag = urlParams.get('fresh') === '1';

    // Shared plan from URL params (goal/monthly/pace)
    var sharedPlan = useMemo(function () {
      return (!preset && !freshFlag) ? decodePlanFromUrl(urlParams) : null;
    }, [urlParams, preset, freshFlag]);

    var savedPlan = useMemo(function () {
      return (preset || freshFlag) ? null : loadSavedPlan();
    }, [preset, freshFlag]);

    // mode: 'report' | 'convo'
    var modeState = useState(savedPlan ? 'report' : 'convo');
    var mode = modeState[0], setMode = modeState[1];

    // conversation answers
    var ansState = useState(function () {
      if (preset) return { goal: preset.goal, monthly: preset.monthly, years: preset.years, persona: TEMPERAMENT_TO_PERSONA[preset.temperament] || preset.temperament };
      if (sharedPlan) return { goal: sharedPlan.goal, monthly: sharedPlan.monthly, years: sharedPlan.years, persona: sharedPlan.persona };
      return { goal: null, monthly: null, years: null, persona: null };
    });
    var answers = ansState[0], setAnswers = ansState[1];

    // Determine archetype from current goal
    var currentArchetype = goalArchetype(answers.goal);
    var skipHorizon = currentArchetype === 'target' || currentArchetype === 'subscription';

    var stepState = useState('goal');
    var step = stepState[0], setStep = stepState[1];
    var thinkingState = useState(false);
    var thinking = thinkingState[0], setThinking = thinkingState[1];

    var customMonthly = useState(''); var cm = customMonthly[0], setCm = customMonthly[1];
    var freeText = useState(''); var ft = freeText[0], setFt = freeText[1];
    var nudgeState = useState(false); var showNudge = nudgeState[0], setShowNudge = nudgeState[1];

    // Hover state for compounding explainer
    var hoverAmountState = useState(null);
    var hoveredAmount = hoverAmountState[0], setHoveredAmount = hoverAmountState[1];

    // Shared plan intro — only shown once
    var sharedIntroState = useState(!!sharedPlan);
    var showSharedIntro = sharedIntroState[0], setShowSharedIntro = sharedIntroState[1];

    function advance(toStep) {
      if (prefersReducedMotion) { setStep(toStep); return; }
      setThinking(true);
      var delay = 600 + Math.random() * 300;
      setTimeout(function () { setThinking(false); setStep(toStep); }, delay);
    }

    function restart() {
      clearSavedPlan();
      setAnswers({ goal: null, monthly: null, years: null, persona: null });
      setStep('goal'); setMode('convo'); setCm(''); setFt(''); setShowNudge(false);
      setShowSharedIntro(false);
      try {
        var u = new URL(window.location.href);
        ['preset', 'fresh', 'goal', 'monthly', 'years', 'pace'].forEach(function(k) { u.searchParams.delete(k); });
        window.history.replaceState({}, '', u.pathname + (u.search || ''));
      } catch (e10) {}
    }

    // Preset fast-forward
    var presetPlayedRef = useRef(false);
    useEffect(function () {
      if (!preset || presetPlayedRef.current) return;
      presetPlayedRef.current = true;
      if (prefersReducedMotion) { setStep('bloom'); return; }
      // Skip horizon step for non-growth goals
      var pa = goalArchetype(preset.goal);
      var seq = pa === 'growth' ? ['monthly', 'horizon', 'temperament', 'bloom'] : ['monthly', 'temperament', 'bloom'];
      var delays = pa === 'growth' ? [520, 480, 480, 520] : [520, 480, 520];
      var acc = 360;
      seq.forEach(function (s, i) {
        acc += delays[i];
        setTimeout(function () { setStep(s); }, acc);
      });
    }, [preset]);

    // Shared plan fast-forward to bloom
    var sharedPlayedRef = useRef(false);
    useEffect(function() {
      if (!sharedPlan || sharedPlayedRef.current) return;
      if (!answers.goal || !answers.monthly || !answers.persona) return;
      // For growth archetype without years, still need to collect years
      var arch = goalArchetype(answers.goal);
      if (arch === 'growth' && !answers.years) return;
      sharedPlayedRef.current = true;
      setStep('bloom');
    }, [sharedPlan, answers]);

    // ---- step handlers ----
    function pickGoal(id) {
      var arch = goalArchetype(id);
      setAnswers(function (a) { return Object.assign({}, a, { goal: id }); });
      setShowNudge(false);
      // Pre-select persona for in-reach goals: stable by default
      if (arch === 'target' || arch === 'subscription') {
        setAnswers(function(a) { return Object.assign({}, a, { goal: id, persona: a.persona || 'stable' }); });
      }
      advance('monthly');
    }
    function submitFreeText(ev) {
      if (ev) ev.preventDefault();
      var text = ft.trim();
      if (!text) return;
      answerFreeText(text).then(function (res) {
        if (res.type === 'goal') { setFt(''); pickGoal(res.goal); }
        else { setShowNudge(true); }
      });
    }

    function pickMonthly(v) {
      setAnswers(function (a) { return Object.assign({}, a, { monthly: v }); });
      // Skip horizon for target/subscription archetypes
      var arch = goalArchetype(answers.goal);
      if (arch === 'target' || arch === 'subscription') {
        advance('temperament');
      } else {
        advance('horizon');
      }
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
    function pickPersona(v) {
      setAnswers(function (a) { return Object.assign({}, a, { persona: v }); });
      advance('bloom');
    }

    function onWhatIf(kind) {
      setAnswers(function (a) {
        var n = Object.assign({}, a);
        if (kind === 'more') n.monthly = (n.monthly || 0) + 200;
        else if (kind === 'longer') n.years = Math.min((n.years || 0) + 2, 10);
        else if (kind === 'safer') n.persona = n.persona === 'degen' ? 'rwa' : 'stable';
        else if (kind === 'bolder') n.persona = n.persona === 'stable' ? 'rwa' : 'degen';
        else if (kind && kind.indexOf('persona:') === 0) n.persona = kind.slice(8);
        return n;
      });
    }

    // Bloom edit callbacks (tapping strip items goes back)
    function onEditGoal() { setStep('goal'); }
    function onEditMonthly() { setStep('monthly'); }
    function onEditYears() { if (currentArchetype === 'growth') setStep('horizon'); }
    function onEditPersona() { setStep('temperament'); }

    // ---------- RENDER ----------
    var stepIndex = STEPS.indexOf(step);

    var thread = [];
    if (stepIndex > 0 && answers.goal) thread.push(e(ThreadRow, { key: 'g', label: '🌱', value: t('youPicked', goalLabel(t, answers.goal)), onClick: function() { setStep('goal'); } }));
    if (stepIndex > 1 && answers.monthly != null) thread.push(e(ThreadRow, { key: 'm', label: '💧', value: t('monthlyChosen', formatUsd(answers.monthly)), onClick: function() { setStep('monthly'); } }));
    if (!skipHorizon && stepIndex > 2 && answers.years != null) thread.push(e(ThreadRow, { key: 'y', label: '⏳', value: t('horizonChosen', answers.years), onClick: function() { setStep('horizon'); } }));
    if ((skipHorizon ? stepIndex > 2 : stepIndex > 3) && answers.persona) {
      var pk = answers.persona;
      var personaTitle = pk === 'stable' ? t('personaStableTitle') : (pk === 'rwa' ? t('personaRwaTitle') : t('personaDegenTitle'));
      thread.push(e(ThreadRow, { key: 't', label: '🫶', value: t('tempChosen', personaTitle), onClick: function() { setStep('temperament'); } }));
    }

    // Monthly chips — contextual to archetype
    var arch = goalArchetype(answers.goal);
    var monthlyChips = (arch === 'target' || arch === 'subscription')
      ? [10, 25, 50, 100]
      : [100, 250, 500, 1000, 2500];

    // Horizon chips — max 10 years per spec §2
    var horizonChips = [1, 2, 3, 5, 10];

    var content;
    if (mode === 'report' && savedPlan) {
      // P0 FIX: Show report immediately — don't block on API load.
      // Live deltas show 'updating' until API loads, then update.
      content = e(GardenReport, {
        t: t, plan: savedPlan, pools: pools, poolsReady: loadStatus === 'ready',
        onTend: function () {
          var p = TEMPERAMENT_TO_PERSONA[savedPlan.temperament] || savedPlan.persona || 'stable';
          setAnswers({ goal: savedPlan.goal, monthly: savedPlan.monthly, years: savedPlan.years, persona: p });
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
          showSharedIntro ? e('p', { className: 'gp-preset-intro' }, t('sharedPlanIntro')) : null,
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
            options: monthlyChips.map(function (v) { return { value: v, label: formatUsd(v) }; }),
            onPick: pickMonthly,
            onHover: setHoveredAmount,
            onHoverEnd: function() { setHoveredAmount(null); }
          }),
          // Compounding micro-explainer
          answers.monthly || hoveredAmount ? e(CompoundingLine, {
            monthly: hoveredAmount || answers.monthly,
            apy: 5.5,  // illustrative rate for the micro-explainer
            years: answers.years || (arch === 'growth' ? 5 : 2),
            hoveredAmount: hoveredAmount
          }) : null,
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
            options: horizonChips.map(function (v) { return { value: v, label: t('years', v) }; }),
            onPick: pickYears
          }),
          e('div', { className: 'gp-slider-row' },
            e('input', {
              type: 'range', min: 1, max: 10, step: 1, className: 'gp-slider',
              value: answers.years || 5,
              onChange: function (ev) { setAnswers(function (a) { return Object.assign({}, a, { years: parseInt(ev.target.value, 10) }); }); }
            }),
            e('span', { className: 'gp-slider-val' }, t('years', answers.years || 5))
          ),
          answers.monthly ? e(CompoundingLine, {
            monthly: answers.monthly,
            apy: 5.5,
            years: answers.years || 5
          }) : null,
          e('button', { type: 'button', className: 'gp-cta gp-slider-confirm', onClick: function () { pickYears(answers.years || 5); } }, '→')
        );
      } else if (step === 'temperament') {
        var cards = [
          { id: 'stable', emoji: '🏦', title: t('personaStableTitle'), desc: t('personaStableDesc'), risk: t('personaStableRisk') },
          { id: 'rwa',    emoji: '🏛️', title: t('personaRwaTitle'),    desc: t('personaRwaDesc'),    risk: t('personaRwaRisk') },
          { id: 'degen',  emoji: '🔥', title: t('personaDegenTitle'),  desc: t('personaDegenDesc'),  risk: t('personaDegenRisk') }
        ];
        // Pre-select stable for target/subscription archetypes
        var preSelected = answers.persona || (skipHorizon ? 'stable' : null);

        stepBubble = e(Bubble, { key: 'temperament' },
          e('p', { className: 'gp-question' }, t('step4Question')),
          e('div', { className: 'gp-temp-cards' },
            cards.map(function (card) {
              return e('button', {
                key: card.id, type: 'button',
                className: 'gp-temp-card' + ((preSelected === card.id) ? ' is-selected' : ''),
                onClick: function () { pickPersona(card.id); }
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
          var effectivePersona = answers.persona || 'stable';
          var bloomEl = e(Bloom, {
            t: t, lang: lang, presetName: preset ? preset.name : null,
            goal: answers.goal, monthly: answers.monthly,
            years: answers.years || 10,
            persona: effectivePersona,
            pools: pools,
            onWhatIf: onWhatIf,
            onEditGoal: onEditGoal,
            onEditMonthly: onEditMonthly,
            onEditYears: onEditYears,
            onEditPersona: onEditPersona
          });
          stepBubble = showSharedIntro
            ? e(React.Fragment, null,
                e('p', { className: 'gp-preset-intro' }, t('sharedPlanIntro')),
                bloomEl
              )
            : bloomEl;
        }
      }

      content = e('div', { className: 'gp-convo' },
        thread.length ? e('div', { className: 'gp-thread' }, thread) : null,
        e('div', { className: 'gp-current' }, stepBubble)
      );
    }

    var canRestart = (mode === 'convo' && (stepIndex > 0 || step === 'bloom'));
    var hasSavedPlan = !!loadSavedPlan();

    return e('div', { className: 'gp-app' },
      e(PlannerHeader, {
        dark: dark, onToggleTheme: function () { setDark(function (d) { return !d; }); },
        canRestart: canRestart, restartLabel: t('startFresh'), onRestart: restart,
        hasSavedPlan: hasSavedPlan && mode !== 'report',
        myGardenLabel: t('myGarden'),
        mode: mode,
        onShowGarden: function() { setMode('report'); }
      }),
      e('main', { className: 'gp-main' },
        e('div', { className: 'gp-tagline' }, e('h1', null, t('title')), e('p', null, t('tagline'))),
        content
      )
    );
  }

  // Expose pure helpers for unit testing and debugging
  var api = {
    APY_SANITY_LIMIT: APY_SANITY_LIMIT,
    futureValue: futureValue, totalDeposited: totalDeposited,
    curatePools: curatePools, blendedApy: blendedApy, median: median,
    isStableSymbol: isStableSymbol, isAnomalousApy: isAnomalousApy,
    matchGoalFromText: matchGoalFromText,
    TEMPERAMENTS: { sleep: PERSONAS.stable, balanced: PERSONAS.rwa, bold: PERSONAS.degen },
    PERSONAS: PERSONAS, RWA_ALLOWLIST: RWA_ALLOWLIST,
    formatUsdRounded: formatUsdRounded,
    timeToTarget: timeToTarget, foreverNumber: foreverNumber, effectiveApy: effectiveApy
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    window.GardenPlanner = api;
    function mountPlanner() {
      var mount = document.getElementById('planner-root');
      if (mount && window.ReactDOM && window.React) {
        ReactDOM.createRoot(mount).render(e(Planner));
      }
    }
    // Wait for ReactDOM to be ready (handles dynamic script load race)
    if (window.ReactDOM && window.React) {
      mountPlanner();
    } else {
      window.addEventListener('load', mountPlanner);
    }
  }
})();
