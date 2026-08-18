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
  var PLAN_VERSION = 3;

  var STABLE_SYMBOLS = ['USDC', 'USDT', 'DAI', 'USDS', 'FRAX', 'TUSD', 'USDP', 'GUSD',
    'LUSD', 'USDD', 'PYUSD', 'USDE', 'SUSD', 'CRVUSD', 'GHO', 'USD0', 'FDUSD', 'USDB',
    'BUSD', 'MIM', 'DOLA', 'USDX', 'EURC', 'EURS', 'RLUSD', 'USDL', 'DEUSD', 'SDAI'];

  // RWA allowlist: verified against live pool data; kept as a named constant
  var RWA_ALLOWLIST = ['ondo', 'maple', 'centrifuge', 'goldfinch', 'openeden', 'midas',
    'spiko', 'hashnote', 'superstate', 'backed', 'ethena', 'usual', 'janus', 'tradfi'];

  // ---------------------------------------------------------------------------
  // Waitlist pitch variant (spec 065) — computed once from the URL `pitch` param.
  // 'b'/'c' (case-insensitive) select alternate honest framings; anything else
  // (missing/invalid) falls back to 'a' so default copy stays byte-identical.
  // Every waitlist event carries this as pitch_variant; only the modal title +
  // benefits + dialog aria-label vary by it.
  var PITCH_VARIANT = (function () {
    try {
      var p = new URLSearchParams(window.location.search).get('pitch');
      p = (p || '').toLowerCase();
      return (p === 'b' || p === 'c') ? p : 'a';
    } catch (err) {
      return 'a';
    }
  })();
  // Map a base translation key to its pitch-variant key (waitlistTitle ->
  // waitlistTitleB for variant 'b'); variant 'a' returns the base key unchanged.
  function pitchKey(baseKey) {
    return PITCH_VARIANT === 'a' ? baseKey : baseKey + PITCH_VARIANT.toUpperCase();
  }

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
  // Rate-stability Sharpe (pool.kpis.apySharpe), or null when absent/non-numeric.
  // Null in current prod (all pools) — the tie-break must be a pure no-op then.
  function poolSharpe(pool) {
    var s = pool && pool.kpis ? pool.kpis.apySharpe : null;
    return (typeof s === 'number' && isFinite(s)) ? s : null;
  }
  // Near-tie-break: among rail-passing candidates whose total APY is effectively
  // equal, prefer the steadier-yield pool (higher apySharpe). Returns a comparator
  // delta ONLY inside the near-tie AND when Sharpe is decisive; 0 otherwise, so the
  // primary APY key keeps its order (never leapfrog a materially-higher-APY pool).
  // Epsilon = max(0.1pp absolute floor, 2% of the larger rate) — 0.1pp keeps sub-1%
  // rates from being swamped by the relative term; 2% scales the near-tie window with
  // the rate so a 0.1pp gap at 20% APY still counts as a near-tie.
  function sharpeTieBreak(a, b) {
    var apyA = poolTotalApy(a);
    var apyB = poolTotalApy(b);
    var eps = Math.max(0.10, 0.02 * Math.max(apyA, apyB));
    if (Math.abs(apyA - apyB) > eps) return 0; // outside near-tie: Sharpe has no say
    var sa = poolSharpe(a);
    var sb = poolSharpe(b);
    if (sa === null && sb === null) return 0;      // both unknown: keep prior order
    if (sa === null && sb !== null) return 1;      // a unknown, b known: b wins (a after)
    if (sb === null && sa !== null) return -1;     // b unknown, a known: a wins (a before)
    return sb - sa;                                // both known: higher Sharpe first
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
  // Lump-sum compounding for the capital-first funding path (v3). futureValue/
  // totalDeposited above are pure monthly-contribution formulas and silently
  // evaluate to 0 for a capital-funded plan (monthly is null/0 there) — this
  // covers the missing leg. Safe to add unconditionally alongside futureValue:
  // capital is 0/null for monthly-funded plans, so it never double-counts.
  function capitalGrowth(capital, annualRatePct, years) {
    var C = Number(capital) || 0;
    var r = (Number(annualRatePct) || 0) / 100;
    return C * Math.pow(1 + r, Number(years) || 0);
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
  // Cumulative subscription ladder — pure, unit-testable.
  // items: array of { id, emoji, labelKey, monthly }
  // apy: annual rate %; capital: user lump sum or null
  // anchorId (optional): when provided and matches an item id, that item is placed first (rung 0);
  //   remaining items follow sorted ascending by monthly; cumulative starts from anchor.
  //   Unknown anchorId falls back to normal ascending sort.
  // Returns array (same length) with cumulative fields added.
  function buildLadder(items, apy, capital, anchorId) {
    var anchor = null;
    var rest = items.slice();
    if (anchorId) {
      var anchorIdx = -1;
      for (var ai = 0; ai < rest.length; ai++) {
        if (rest[ai].id === anchorId) { anchorIdx = ai; break; }
      }
      if (anchorIdx !== -1) {
        anchor = rest[anchorIdx];
        rest = rest.slice(0, anchorIdx).concat(rest.slice(anchorIdx + 1));
      }
    }
    rest.sort(function (a, b) { return a.monthly - b.monthly; });
    var sorted = anchor ? [anchor].concat(rest) : rest;
    var cumMonthly = 0;
    return sorted.map(function (item) {
      cumMonthly += item.monthly;
      var foreverAmt = foreverNumber(cumMonthly, apy);
      var unlocked = (capital != null && isFinite(foreverAmt) && capital >= foreverAmt);
      var pct = (capital != null && isFinite(foreverAmt) && foreverAmt > 0)
        ? Math.min(100, Math.round(capital / foreverAmt * 100))
        : 0;
      return {
        id: item.id,
        emoji: item.emoji,
        labelKey: item.labelKey,
        monthly: item.monthly,
        cumMonthly: cumMonthly,
        foreverAmt: foreverAmt,
        unlocked: !!unlocked,
        pct: pct
      };
    });
  }

  // subscriptionLadder(goalId)
  // Returns the effective ladder items for an anchor goal:
  //   - if goalId is already in SUBSCRIPTION_LADDER, or falsy → SUBSCRIPTION_LADDER unchanged
  //   - if goalId is a subscription goal with a target not in SUBSCRIPTION_LADDER → prepend it
  //   - else → SUBSCRIPTION_LADDER unchanged
  function subscriptionLadder(goalId) {
    if (!goalId) return SUBSCRIPTION_LADDER;
    for (var li = 0; li < SUBSCRIPTION_LADDER.length; li++) {
      if (SUBSCRIPTION_LADDER[li].id === goalId) return SUBSCRIPTION_LADDER;
    }
    var g = goalById(goalId);
    if (g && g.archetype === 'subscription' && typeof g.target === 'number') {
      return [{ id: g.id, emoji: g.emoji, icon: g.icon, labelKey: g.labelKey, monthly: g.target }].concat(SUBSCRIPTION_LADDER);
    }
    return SUBSCRIPTION_LADDER;
  }

  // coveredBundle(capital, apyPct, anchorGoalId)
  // Returns which anchored subscription-ladder rungs the capital already covers.
  // Builds the anchored ladder (rung-0 = anchor goal, rest sorted asc) and walks
  // from the bottom up collecting every rung whose cumulative foreverAmt <= capital.
  //
  // Returns:
  //   covered         — rungs (in ladder order) whose foreverAmt <= capital
  //   coveredCount    — covered.length
  //   combinedMonthly — cumMonthly of highest covered rung (0 if none)
  //   combinedForever — foreverAmt of highest covered rung (0 if none)
  //   surplus         — max(0, capital - combinedForever)
  //   nextRung        — first uncovered rung, or null if all covered
  //   nextPct         — round(capital / nextRung.foreverAmt * 100) clamped 0..100, or null
  function coveredBundle(capital, apyPct, anchorGoalId) {
    var cap = Number(capital) || 0;
    var ladder = buildLadder(subscriptionLadder(anchorGoalId), apyPct, cap, anchorGoalId);
    var covered = [];
    var nextRung = null;
    for (var i = 0; i < ladder.length; i++) {
      var rung = ladder[i];
      if (isFinite(rung.foreverAmt) && cap >= rung.foreverAmt) {
        covered.push(rung);
      } else {
        if (nextRung === null) nextRung = rung;
      }
    }
    var highestCovered = covered.length > 0 ? covered[covered.length - 1] : null;
    var combinedMonthly = highestCovered ? highestCovered.cumMonthly : 0;
    var combinedForever = highestCovered ? highestCovered.foreverAmt : 0;
    var surplus = Math.max(0, cap - (isFinite(combinedForever) ? combinedForever : 0));
    var nextPct = null;
    if (nextRung && isFinite(nextRung.foreverAmt) && nextRung.foreverAmt > 0) {
      nextPct = Math.min(100, Math.round(cap / nextRung.foreverAmt * 100));
    }
    return {
      covered: covered,
      coveredCount: covered.length,
      combinedMonthly: combinedMonthly,
      combinedForever: combinedForever,
      surplus: surplus,
      nextRung: nextRung,
      nextPct: nextPct
    };
  }

  // mixStats(selectedIds, apyPct) — capital needed to yield-fund an arbitrary mix of subscriptions.
  // Resolves each id first from SUBSCRIPTION_LADDER, then from GOALS (subscription archetype).
  // Ignores ids that resolve to nothing.
  // Returns { count, combinedMonthly, neededCapital, ids }
  function mixStats(selectedIds, apyPct) {
    var ids = [];
    var combinedMonthly = 0;
    for (var i = 0; i < selectedIds.length; i++) {
      var id = selectedIds[i];
      var monthly = null;
      for (var li = 0; li < SUBSCRIPTION_LADDER.length; li++) {
        if (SUBSCRIPTION_LADDER[li].id === id) { monthly = SUBSCRIPTION_LADDER[li].monthly; break; }
      }
      if (monthly === null) {
        var g = goalById(id);
        // spec 146 root-cause fix: only resolve a GOALS fallback when the goal
        // is genuinely a monthly cost (archetype: 'subscription' + isMonthly
        // true). Without this guard a TARGET goal's ONE-TIME item price
        // (GOALS[].target, e.g. iphone=1100) was misread as a $/mo figure.
        if (g && g.isMonthly === true && typeof g.target === 'number') monthly = g.target;
      }
      if (monthly !== null) {
        combinedMonthly += monthly;
        ids.push(id);
      }
    }
    var apy = Number(apyPct) || 0;
    var neededCapital = 0;
    if (combinedMonthly > 0 && apy > 0) {
      var fn = foreverNumber(combinedMonthly, apy);
      neededCapital = isFinite(fn) ? Math.ceil(fn / 100) * 100 : 0;
    }
    return { count: ids.length, combinedMonthly: combinedMonthly, neededCapital: neededCapital, ids: ids };
  }

  // joinBundle(labels) — join array of label strings for the bundle headline.
  // 0: ""   1: "Spotify"   2: "A + B"   3: "A, B + C"   >3: "A, B, C + N more"
  function joinBundle(labels) {
    if (!labels || labels.length === 0) return '';
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels[0] + ' + ' + labels[1];
    if (labels.length === 3) return labels[0] + ', ' + labels[1] + ' + ' + labels[2];
    var extra = labels.length - 3;
    return labels[0] + ', ' + labels[1] + ', ' + labels[2] + ' + ' + extra + ' more';
  }

  // Add N months to today, return readable string; returns null for Infinity/NaN
  function monthsFromNow(months) {
    if (!isFinite(months) || isNaN(months)) return null;
    var d = new Date();
    d.setMonth(d.getMonth() + Math.round(months));
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // ---------------------------------------------------------------------------
  // v3 yield-funded math — yield (not total balance) pays the item
  // ---------------------------------------------------------------------------

  // Cumulative YIELD from a lump sum after n months: C * ((1+rm)^n - 1)
  function cumulativeYield(capital, annualRatePct, months) {
    var C = Number(capital) || 0;
    var r = (Number(annualRatePct) || 0) / 100;
    var rm = r / 12;
    if (rm === 0) return 0;
    return C * (Math.pow(1 + rm, months) - 1);
  }

  // First whole month where cumulativeYield >= target
  function monthsUntilYieldCoversTarget(capital, annualRatePct, target) {
    var C = Number(capital) || 0;
    var T = Number(target) || 0;
    if (C <= 0 || T <= 0) return Infinity;
    var r = (Number(annualRatePct) || 0) / 100;
    var rm = r / 12;
    if (rm === 0) return Infinity;
    // C*((1+rm)^n - 1) >= T  =>  (1+rm)^n >= T/C + 1
    var ratio = T / C + 1;
    return Math.ceil(Math.log(ratio) / Math.log(1 + rm));
  }

  // Capital so that cumulative yield >= target within `months` (feasibility inversion)
  function capitalForDeadline(annualRatePct, target, months) {
    var T = Number(target) || 0;
    var r = (Number(annualRatePct) || 0) / 100;
    var rm = r / 12;
    if (rm === 0 || months <= 0) return Infinity;
    var factor = Math.pow(1 + rm, months) - 1;
    if (factor <= 0) return Infinity;
    return T / factor;
  }

  // Daily yield from a lump sum
  function dailyYield(capital, annualRatePct) {
    return (Number(capital) || 0) * (Number(annualRatePct) || 0) / 100 / 365;
  }

  // ---------------------------------------------------------------------------
  // disciplinedSpeedup — honest "reach it sooner if you also save monthly" math.
  // args: { capital, monthly, annualRatePct, target }
  //   baseMonths      — months for lump-sum yield alone to cover target
  //   disciplinedMonths — months when ALSO adding `monthly` fresh principal
  //                       (cumulativeYield + monthly*n >= target)
  //   monthsSooner = baseMonths - disciplinedMonths (>= 0)
  // monthly <= 0 or target <= 0 => monthsSooner 0, disciplinedMonths == baseMonths
  function disciplinedSpeedup(args) {
    var capital = Number(args.capital) || 0;
    var monthly = Number(args.monthly) || 0;
    var apy     = Number(args.annualRatePct) || 0;
    var target  = Number(args.target) || 0;
    var base = monthsUntilYieldCoversTarget(capital, apy, target);
    var baseM = isFinite(base) ? base : null;
    if (monthly <= 0 || target <= 0) {
      return { baseMonths: baseM, disciplinedMonths: baseM, monthsSooner: 0 };
    }
    var n = 0, MAX = 1200; // 100-year guard
    while (n < MAX) {
      n++;
      if (cumulativeYield(capital, apy, n) + monthly * n >= target) break;
    }
    var disc = (n < MAX) ? n : null;
    var sooner = (baseM != null && disc != null) ? Math.max(0, baseM - disc) : 0;
    return { baseMonths: baseM, disciplinedMonths: disc, monthsSooner: sooner };
  }

  // ---------------------------------------------------------------------------
  // reportStats — pure helper for the GardenReport return-visit dashboard
  // reportStats(plan, liveEffectiveApyPct, nowIso)
  //   plan: the saved plan object (capital, monthly, fundingMode, savedAt)
  //   liveEffectiveApyPct: effective APY already with degen haircut applied
  //   nowIso: ISO date string for "now"
  // Returns: { days, months, earnedEstimate }
  //   days — whole days elapsed (>= 0; negative elapsed clamps to 0)
  //   months — elapsed months (days / 30.4375)
  //   earnedEstimate — honest estimate of yield accrued so far (>= 0, finite)
  // ---------------------------------------------------------------------------
  function reportStats(plan, liveEffectiveApyPct, nowIso) {
    var savedMs = plan.savedAt ? new Date(plan.savedAt).getTime() : NaN;
    var nowMs = nowIso ? new Date(nowIso).getTime() : Date.now();
    var diffMs = isNaN(savedMs) ? 0 : (nowMs - savedMs);
    var days = diffMs <= 0 ? 0 : Math.floor(diffMs / (1000 * 60 * 60 * 24));
    var months = days / 30.4375;
    var apy = Number(liveEffectiveApyPct) || 0;

    var earned = 0;
    if (days > 0 && apy > 0) {
      var cap = Number(plan.capital) || 0;
      var mo = Number(plan.monthly) || 0;
      var isCapital = (plan.fundingMode === 'capital') && cap > 0;
      if (isCapital) {
        // Cumulative yield from lump sum over elapsed months
        earned = cumulativeYield(cap, apy, months);
      } else if (mo > 0) {
        // Estimate yield accrued on deposits made so far:
        // futureValue of contributions over elapsed period minus principal deposited
        var elapsedYears = months / 12;
        var fv = futureValue(mo, apy, elapsedYears);
        var deposited = mo * months; // approximate: monthly * elapsed months
        earned = Math.max(0, fv - deposited);
      }
    }

    // Guard against NaN/Infinity from any edge case
    if (!isFinite(earned) || isNaN(earned)) earned = 0;

    return { days: days, months: months, earnedEstimate: earned };
  }

  // ---------------------------------------------------------------------------
  // v3 plan helpers: migration, hero builder, chip hints
  // ---------------------------------------------------------------------------

  // migratePlan(p) — normalize any stored plan to v3 or return null.
  function migratePlan(p) {
    if (!p || typeof p !== 'object') return null;
    if (p.version === 3) {
      var g3 = goalById(p.goal);
      if (!g3) return null;
      var hasCapital3 = p.capital && Number(p.capital) > 0;
      var hasMonthly3 = p.monthly && Number(p.monthly) > 0;
      if (!hasCapital3 && !hasMonthly3) return null;
      return p;
    }
    if (p.version === 1 || p.version === 2) {
      var hasMonthly = p.monthly && Number(p.monthly) > 0;
      var gDef = goalById(p.goal);
      if (!hasMonthly || !gDef) return null;
      return {
        version: 3,
        goal: p.goal,
        monthly: p.monthly,
        years: p.years || null,
        persona: p.persona || null,
        temperament: p.temperament || null,
        pools: p.pools || [],
        blendedApy: p.blendedApy || null,
        effectiveApy: p.effectiveApy || null,
        savedAt: p.savedAt || null,
        archetype: goalArchetype(p.goal),
        fundingMode: 'monthly',
        capital: null,
        deadline: null,
        target: (gDef && gDef.target) || null,
        projection: p.projection || null,
        hero: { kind: 'projection', projection: p.projection || null }
      };
    }
    return null;
  }

  // buildPlanHero(args) — compute the persisted per-archetype headline metric.
  // args: { archetype, fundingMode, capital, monthly, years, target, apy }
  function buildPlanHero(args) {
    var archetype = args.archetype;
    var fundingMode = args.fundingMode;
    var capital = Number(args.capital) || 0;
    var monthly = Number(args.monthly) || 0;
    var years = Number(args.years) || 10;
    var target = Number(args.target) || 0;
    var apy = Number(args.apy) || 0;

    if (archetype === 'growth') {
      return { kind: 'projection', projection: futureValue(monthly, apy, years) + capitalGrowth(capital, apy, years) };
    }
    if (archetype === 'target') {
      if (fundingMode === 'capital' && capital > 0) {
        var m = monthsUntilYieldCoversTarget(capital, apy, target);
        return { kind: 'flipDate', months: isFinite(m) ? m : null, capital: capital };
      }
      var m2 = timeToTarget(target, monthly, apy);
      return { kind: 'targetDate', months: isFinite(m2) ? m2 : null };
    }
    if (archetype === 'subscription') {
      var fn = foreverNumber(target || 20, apy);
      var pct = (capital && isFinite(fn) && fn > 0) ? Math.min(100, Math.round(capital / fn * 100)) : 0;
      return { kind: 'forever', foreverAmt: isFinite(fn) ? fn : null, progressPct: pct };
    }
    return { kind: 'projection', projection: futureValue(monthly, apy, years) + capitalGrowth(capital, apy, years) };
  }

  // chipHintsFor(values, ctx) — per-chip outcome descriptors.
  // ctx: { archetype, target, apy, mode }
  // Returns array of { value, pct?, months?, forever?, featured? }
  function chipHintsFor(values, ctx) {
    var archetype = ctx.archetype;
    var target = Number(ctx.target) || 0;
    var apy = Number(ctx.apy) || 0;
    var mode = ctx.mode; // 'capital' or 'monthly'
    var result = [];
    var featuredFound = false;

    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      var chip = { value: v };

      if (mode === 'capital') {
        if (archetype === 'subscription') {
          var fn = foreverNumber(target, apy);
          var pct = (isFinite(fn) && fn > 0) ? Math.round(v / fn * 100) : null;
          if (pct != null) chip.pct = pct;
          var forever = (pct != null && v >= fn);
          if (forever) chip.forever = true;
          if (forever && !featuredFound) {
            chip.featured = true;
            featuredFound = true;
          }
        } else if (archetype === 'target') {
          var months = monthsUntilYieldCoversTarget(v, apy, target);
          if (isFinite(months)) chip.months = months;
        }
      } else if (mode === 'monthly') {
        if (archetype === 'target') {
          var mMonths = timeToTarget(target, v, apy);
          if (isFinite(mMonths)) chip.months = mMonths;
        } else if (archetype === 'subscription') {
          var fn2 = foreverNumber(target, apy);
          var mMonths2 = timeToTarget(isFinite(fn2) ? fn2 : Infinity, v, apy);
          if (isFinite(mMonths2)) chip.months = mMonths2;
        }
      }

      result.push(chip);
    }
    return result;
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

  // curatePools(pools, personaKey, limit, opts)
  // opts (all optional, backward-compatible): {
  //   chain: string  — keep only pools where pool.chain matches (case-insensitive)
  //   token: string  — keep only pools where pool.symbol contains token (case-insensitive)
  //   exclude: string[] — pool ids to drop before curating
  // }
  // All existing trust rails (APY_SANITY_LIMIT, TVL floor, stableOnly) apply BEFORE opts.
  function curatePools(pools, personaKey, limit, opts) {
    // Support legacy temperament keys
    var pk = TEMPERAMENT_TO_PERSONA[personaKey] || personaKey;
    var band = PERSONAS[pk] || PERSONAS.stable;
    var lim = limit == null ? 3 : limit;
    if (!Array.isArray(pools)) return [];

    // Parse opts (backward-compat: 3-arg calls pass undefined)
    var filterChain = opts && opts.chain ? String(opts.chain).toLowerCase() : null;
    var filterToken = opts && opts.token ? String(opts.token).toLowerCase() : null;
    var excludeSet = {};
    if (opts && Array.isArray(opts.exclude)) {
      opts.exclude.forEach(function (id) { excludeSet[id] = true; });
    }

    var eligible = pools.filter(function (p) {
      if (!p || !p.symbol || !p.project) return false;
      // Hard trust rails first
      var apy = poolTotalApy(p);
      if (apy > APY_SANITY_LIMIT) return false;
      if (apy <= 0) return false;
      if (apy > band.maxApy) return false;
      if ((p.tvlUsd || 0) < band.minTvl) return false;
      if (band.stableOnly && !isStableSymbol(p.symbol)) return false;
      // opts filters applied after rails (never bypass safety)
      if (excludeSet[p.pool]) return false;
      if (filterChain && String(p.chain || '').toLowerCase() !== filterChain) return false;
      if (filterToken && String(p.symbol || '').toLowerCase().indexOf(filterToken) === -1) return false;
      return true;
    });

    if (band.preferTypes) {
      eligible.sort(function (a, b) {
        var ap = band.preferTypes.indexOf(poolKind(a)) !== -1 ? 0 : 1;
        var bp = band.preferTypes.indexOf(poolKind(b)) !== -1 ? 0 : 1;
        if (ap !== bp) return ap - bp;
        var byApy = poolTotalApy(b) - poolTotalApy(a);
        var tb = sharpeTieBreak(a, b);
        return tb !== 0 ? tb : byApy;
      });
    } else if (band.rwaAllowlist) {
      // Sort: allowlist first, then others by APY
      eligible.sort(function (a, b) {
        var ar = isRwaProject(a) ? 0 : 1;
        var br = isRwaProject(b) ? 0 : 1;
        if (ar !== br) return ar - br;
        var byApy = poolTotalApy(b) - poolTotalApy(a);
        var tb = sharpeTieBreak(a, b);
        return tb !== 0 ? tb : byApy;
      });
    } else {
      eligible.sort(function (a, b) {
        var byApy = poolTotalApy(b) - poolTotalApy(a);
        var tb = sharpeTieBreak(a, b);
        return tb !== 0 ? tb : byApy;
      });
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

  // poolAlternatives(pools, personaKey, opts, excludeIds, limit)
  // Returns in-band, project-deduped pools not in excludeIds, honoring chain/token opts,
  // sorted by the same band criteria. Anomalous / sub-TVL pools never appear.
  // excludeIds: array of pool ids already displayed (never returned).
  function poolAlternatives(pools, personaKey, opts, excludeIds, limit) {
    var lim = limit == null ? 5 : limit;
    var safeExclude = Array.isArray(excludeIds) ? excludeIds : [];
    // Build opts with exclude merged in
    var mergedOpts = Object.assign({}, opts || {}, { exclude: safeExclude });
    // Get a larger pool (up to 20) to have headroom after project-dedup
    return curatePools(pools, personaKey, lim, mergedOpts);
  }

  function blendedApy(curated) {
    if (!curated || !curated.length) return 0;
    return median(curated.map(poolTotalApy));
  }
  // Plan-level projection confidence (spec 106): summarize the track record of
  // the `curated` set behind the blended rate using 087's stored kpis. Reads
  // ONLY p.kpis.* + poolTotalApy(p); never filters, drops, reorders, re-weights,
  // or re-flags a pool, and never touches the rail constants. Returns null when
  // no curated pool carries usable kpis (live fallback / cold CDN) so the note
  // hides honestly — same null-safe discipline as 088.1's live-landing hide.
  function planConfidence(curated) {
    if (!curated || !curated.length) return null;
    var tracked = curated.filter(function (p) {
      return p && p.kpis && typeof p.kpis === 'object' && Number(p.kpis.historyPoints) >= 1;
    });
    if (!tracked.length) return null;
    var total = tracked.length;
    var minHp = Infinity;
    var steady = 0;
    for (var i = 0; i < tracked.length; i++) {
      var p = tracked[i];
      var k = p.kpis;
      var hp = Number(k.historyPoints);
      if (hp < minHp) minHp = hp;
      var cur = poolTotalApy(p);
      if (hp >= 7 && typeof k.apyStdev === 'number' && k.apyStdev !== null && cur > 0 && (k.apyStdev / cur) <= 0.2) {
        steady++;
      }
    }
    return { total: total, steady: steady, minHp: minHp };
  }
  // For degen: effective APY with 1/3 haircut
  function effectiveApy(curated, personaKey) {
    var pk = TEMPERAMENT_TO_PERSONA[personaKey] || personaKey;
    var raw = blendedApy(curated);
    return PERSONAS[pk] && PERSONAS[pk].degenHaircut ? raw / 3 : raw;
  }

  // Human-readable protocol name from pool.project slug (e.g. "aave-v3" → "Aave")
  function formatProjectName(project) {
    return (project || '')
      .replace(/-v[0-9]+(\.[0-9]+)?$/, '')
      .replace(/-(savings|lending|protocol|finance|swap|staking)$/i, '')
      .split('-')
      .map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : ''; })
      .join(' ')
      .trim();
  }

  // ---------------------------------------------------------------------------
  // Goal model — two-tier archetype system
  // ---------------------------------------------------------------------------
  var GOALS = [
    { id: 'spotify', emoji: '🎵', icon: 'spotify.com', labelKey: 'goalSpotify', archetype: 'subscription',
      category: 'subscription', target: 12, isMonthly: true,
      keywords: ['spotify', 'music', '음악', '스포티파이'] },
    { id: 'netflix', emoji: '🍿', icon: 'netflix.com', labelKey: 'goalNetflix', archetype: 'subscription',
      category: 'subscription', target: 18, isMonthly: true,
      keywords: ['netflix', 'streaming', 'video', '넷플릭스', '스트리밍'] },
    { id: 'claude', emoji: '🤖', icon: 'claude.ai', labelKey: 'goalClaude', archetype: 'subscription',
      category: 'subscription', target: 20, isMonthly: true,
      keywords: ['claude', 'chatgpt', 'ai', 'subscription', 'openai', 'llm', 'cursor', 'copilot', '구독', 'ai 구독'] },
    { id: 'amazonprime', emoji: '📦', icon: 'amazon.com', labelKey: 'goalAmazonPrime', archetype: 'subscription',
      category: 'subscription', target: 15, isMonthly: true,
      keywords: ['amazon prime', 'prime', '아마존 프라임', '프라임'] },
    { id: 'disney', emoji: '🏰', icon: 'disneyplus.com', labelKey: 'goalDisney', archetype: 'subscription',
      category: 'subscription', target: 16, isMonthly: true,
      keywords: ['disney+', 'disney plus', 'disney', '디즈니플러스', '디즈니'] },
    { id: 'youtubepremium', emoji: '▶️', icon: 'youtube.com', labelKey: 'goalYouTubePremium', archetype: 'subscription',
      category: 'subscription', target: 14, isMonthly: true,
      keywords: ['youtube premium', 'youtube', '유튜브 프리미엄', '유튜브'] },
    { id: 'max', emoji: '🎬', icon: 'max.com', labelKey: 'goalMax', archetype: 'subscription',
      category: 'subscription', target: 17, isMonthly: true,
      keywords: ['hbo', 'hbo max', 'max', '맥스', 'HBO'] },
    { id: 'hulu', emoji: '📺', icon: 'hulu.com', labelKey: 'goalHulu', archetype: 'subscription',
      category: 'subscription', target: 19, isMonthly: true,
      keywords: ['hulu', '훌루'] },
    { id: 'appletv', emoji: '🍎', icon: 'apple.com', labelKey: 'goalAppleTV', archetype: 'subscription',
      category: 'subscription', target: 13, isMonthly: true,
      keywords: ['apple tv', 'apple tv+', '애플 tv', '애플tv'] },
    { id: 'chatgpt', emoji: '💬', icon: 'openai.com', labelKey: 'goalChatGPT', archetype: 'subscription',
      category: 'subscription', target: 20, isMonthly: true,
      keywords: ['chatgpt', 'openai', 'gpt', '챗gpt', '챗지피티'] },
    { id: 'gamepass', emoji: '🎮', icon: 'xbox.com', labelKey: 'goalGamePass', archetype: 'subscription',
      category: 'subscription', target: 20, isMonthly: true,
      keywords: ['xbox', 'game pass', 'gamepass', '게임패스', '엑스박스'] },
    { id: 'paramount', emoji: '⛰️', icon: 'paramountplus.com', labelKey: 'goalParamount', archetype: 'subscription',
      category: 'subscription', target: 9, isMonthly: true,
      keywords: ['paramount', 'paramount+', '파라마운트', '파라마운트플러스'] },
    { id: 'peacock', emoji: '🦚', icon: 'peacocktv.com', labelKey: 'goalPeacock', archetype: 'subscription',
      category: 'subscription', target: 11, isMonthly: true,
      keywords: ['peacock', '피콕'] },
    { id: 'doordash', emoji: '🥡', icon: 'doordash.com', labelKey: 'goalDoorDash', archetype: 'subscription',
      category: 'subscription', target: 10, isMonthly: true,
      keywords: ['doordash', 'dashpass', 'food delivery', '도어대시'] },
    { id: 'uber', emoji: '🚗', icon: 'uber.com', labelKey: 'goalUberOne', archetype: 'subscription',
      category: 'subscription', target: 10, isMonthly: true,
      keywords: ['uber', 'uber one', 'uber eats', '우버'] },
    { id: 'audible', emoji: '🎧', icon: 'audible.com', labelKey: 'goalAudible', archetype: 'subscription',
      category: 'subscription', target: 15, isMonthly: true,
      keywords: ['audible', 'audiobook', '오더블', '오디오북'] },
    { id: 'walmart', emoji: '🛒', icon: 'walmart.com', labelKey: 'goalWalmart', archetype: 'subscription',
      category: 'subscription', target: 13, isMonthly: true,
      keywords: ['walmart', 'walmart+', 'walmart plus', '월마트'] },
    { id: 'rent', emoji: '🏠', labelKey: 'goalRent', archetype: 'subscription',
      category: 'bills', target: 1800, isMonthly: true,
      keywords: ['rent', 'apartment rent', 'monthly rent', '월세', '집세', '임대료'] },
    { id: 'phonebill', emoji: '📶', labelKey: 'goalPhoneBill', archetype: 'subscription',
      category: 'bills', target: 70, isMonthly: true,
      keywords: ['phone bill', 'cell bill', 'mobile bill', 'carrier', 'verizon', 'at&t', 't-mobile', '통신비', '휴대폰 요금', '폰 요금'] },
    { id: 'sneakers', emoji: '👟', labelKey: 'goalSneakers', archetype: 'target',
      category: 'gadget', target: 180,
      keywords: ['sneaker', 'sneakers', 'shoes', 'nike', 'adidas', 'shoe', '신발', '운동화', '나이키'] },
    { id: 'iphone', emoji: '📱', labelKey: 'goalIphone', archetype: 'target',
      category: 'gadget', target: 1100,
      keywords: ['phone', 'iphone', 'android', 'samsung', 'pixel', 'mobile', '폰', '아이폰', '휴대폰', '스마트폰'] },
    { id: 'watches', emoji: '⌚', labelKey: 'goalWatches', archetype: 'target',
      category: 'gadget', target: 400,
      keywords: ['watch', 'watches', 'rolex', 'omega', 'seiko', 'apple watch', 'smartwatch', '시계', '손목시계'] },
    { id: 'home', emoji: '🏡', labelKey: 'goalHome', archetype: 'growth',
      category: 'life',
      keywords: ['home', 'house', 'apartment', 'down payment', 'mortgage', 'property', '집', '주택', '아파트'] },
    { id: 'retirement', emoji: '🌳', labelKey: 'goalRetirement', archetype: 'growth',
      category: 'life',
      keywords: ['retire', 'retirement', 'pension', 'old age', '은퇴', '노후', '연금'] }
  ];

  // Subscription ladder — always shown in full in SUBSCRIPTION bloom.
  // Forever numbers computed live from blended APY; never hardcoded.
  var SUBSCRIPTION_LADDER = [
    { id: 'spotify',     emoji: '🎵', icon: 'spotify.com',  labelKey: 'ladderSpotify',   monthly: 12 },
    { id: 'netflix',     emoji: '🍿', icon: 'netflix.com',  labelKey: 'ladderNetflix',   monthly: 18 },
    { id: 'claude',      emoji: '🤖', icon: 'claude.ai',    labelKey: 'ladderClaude',    monthly: 20 },
    { id: 'chatgpt',     emoji: '💬', icon: 'openai.com',   labelKey: 'goalChatGPT',     monthly: 20 },
    { id: 'amazonprime', emoji: '📦', icon: 'amazon.com',   labelKey: 'goalAmazonPrime', monthly: 15 }
  ];

  function goalById(id) {
    for (var i = 0; i < GOALS.length; i++) if (GOALS[i].id === id) return GOALS[i];
    return null;
  }
  // brandForId(id) — resolves { icon, emoji } for a share-card featured service,
  // checking SUBSCRIPTION_LADDER first (its ids can shadow GOALS ids) then GOALS.
  function brandForId(id) {
    for (var i = 0; i < SUBSCRIPTION_LADDER.length; i++) {
      if (SUBSCRIPTION_LADDER[i].id === id) return SUBSCRIPTION_LADDER[i];
    }
    return goalById(id);
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
  // Resilient accessor for the `translations` global (loaded via a separate
  // deferred translations.min.js). If that script failed / was interrupted /
  // lost a deploy race, the bare `translations` dereference used to throw an
  // uncaught ReferenceError inside makeT's useMemo and kill the planner render
  // at the funnel top (spec 082). Return the real object when present, else
  // null so callers degrade gracefully instead of throwing.
  function safeTranslations() {
    if (typeof translations !== 'undefined' && translations) return translations;
    if (typeof window !== 'undefined' && window.translations) return window.translations;
    return null;
  }
  // 241: mirrors translations.js's formatCount at the makeT() accessor
  // chokepoint, so a numeric arg is en-US grouped before any dictionary
  // entry sees it (same fix, same rationale as createTranslationFunction).
  // Same graceful-degradation contract as safeTranslations() above (spec
  // 082): translations.min.js — which defines the shared window.formatCount
  // global — may not have loaded yet, so this must never throw on a missing
  // global. Prefer the real shared global; only degrade to an inline
  // identity-safe copy if it's absent.
  function applyPinnedCounts(args) {
    var fmt = (typeof window !== 'undefined' && typeof window.formatCount === 'function')
      ? window.formatCount
      : function (value) {
          return (typeof value === 'number' && isFinite(value)) ? value.toLocaleString('en-US') : value;
        };
    var out = [];
    for (var i = 0; i < args.length; i++) out.push(fmt(args[i]));
    return out;
  }
  function makeT(lang) {
    return function t(key) {
      var args = applyPinnedCounts(Array.prototype.slice.call(arguments, 1));
      // Re-check on every call so strings recover if translations loads late.
      var tr = safeTranslations();
      if (!tr) return key; // graceful degradation: key-echo (same as unknown key)
      var dict = (tr[lang] && tr[lang].planner) || tr.en.planner;
      var fallback = tr.en.planner;
      var v = dict[key];
      if (v == null) v = fallback[key];
      if (typeof v === 'function') return v.apply(null, args);
      return v == null ? key : v;
    };
  }
  function rootT(lang, key) {
    var tr = safeTranslations();
    if (!tr) return key; // graceful degradation; sole caller renders this as text
    var d = tr[lang] || tr.en;
    var v = d[key];
    if (v == null) v = tr.en[key];
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
      return migratePlan(p);
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
  function encodePlanToUrl(goal, monthly, years, persona, capital, fundingMode, deadline, poolFilters, mixIds) {
    var u = new URL(window.location.href);
    u.searchParams.set('goal', goal || '');
    if (fundingMode === 'capital' && capital) {
      u.searchParams.set('capital', String(capital));
      u.searchParams.set('fm', 'capital');
      u.searchParams.delete('monthly');
    } else {
      u.searchParams.set('monthly', String(monthly || ''));
      u.searchParams.delete('capital');
      if (fundingMode) u.searchParams.set('fm', fundingMode);
    }
    if (years != null) u.searchParams.set('years', String(years));
    if (deadline != null) u.searchParams.set('dl', String(deadline));
    else u.searchParams.delete('dl');
    u.searchParams.set('pace', persona || 'stable');
    // Pool filters (060): additive — carries a spotlight/user's chain+token
    // filter through the share link so a fresh open re-curates to the same
    // pool, instead of always falling back to top-3-by-persona.
    if (poolFilters && poolFilters.chain) u.searchParams.set('chain', String(poolFilters.chain));
    else u.searchParams.delete('chain');
    if (poolFilters && poolFilters.token) u.searchParams.set('token', String(poolFilters.token));
    else u.searchParams.delete('token');
    // Subscription mix (101): carry the full multi-service selection so a shared
    // garden rebuilds the sender's EXACT mix, not just the anchor goal. Only set
    // when this is a subscription plan AND the mix is a real edited/multi set
    // (more than the bare [goal] anchor default) — single-pick/anchor-only and
    // ALL non-subscription URLs stay byte-identical to before (no share-URL
    // churn / regression guard).
    var mixArr = Array.isArray(mixIds) ? mixIds.filter(Boolean) : [];
    var isAnchorOnlyMix = mixArr.length === 1 && mixArr[0] === goal;
    if (goalArchetype(goal) === 'subscription' && mixArr.length >= 1 && !isAnchorOnlyMix) {
      u.searchParams.set('mix', mixArr.join(','));
    } else {
      u.searchParams.delete('mix');
    }
    u.searchParams.delete('preset');
    u.searchParams.delete('fresh');
    // Never leak the pool-CTA source marker (item 143) into a genuine share link:
    // a user who arrived via ?src=pool and then shares must produce a clean,
    // unmarked share URL so the recipient sees the real "someone shared" arrival.
    u.searchParams.delete('src');
    return u.toString();
  }

  // ---------------------------------------------------------------------------
  // Tend reminder (.ics) — the hook-model trigger leg (spec 115). No dependency,
  // no permission prompt (a downloadable calendar file, NOT the Notifications
  // API), no dark pattern: an honest, self-service monthly reminder that
  // deep-links back into the user's exact garden (report mode auto-loads it).
  // ---------------------------------------------------------------------------
  function buildTendReminderIcs(shareUrl, summary, description) {
    // DTSTART ~30 days out. ISO/UTC only (house rule: no bare toLocaleString
    // without en-US; here every field is emitted in ICS UTC basic format).
    var start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    function icsStamp(d) {
      return d.getUTCFullYear() +
        String(d.getUTCMonth() + 1).padStart(2, '0') +
        String(d.getUTCDate()).padStart(2, '0') + 'T' +
        String(d.getUTCHours()).padStart(2, '0') +
        String(d.getUTCMinutes()).padStart(2, '0') +
        String(d.getUTCSeconds()).padStart(2, '0') + 'Z';
    }
    // Escape per RFC5545 minimally: backslashes, commas, semicolons, newlines.
    function esc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
    var dt = icsStamp(start);
    var uid = 'tend-' + start.getTime() + '@defi.garden';
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DeFi Garden//Tend Reminder//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + dt,
      'DTSTART:' + dt,
      'RRULE:FREQ=MONTHLY',
      'SUMMARY:' + esc(summary),
      'DESCRIPTION:' + esc(description + ' ' + shareUrl),
      'URL:' + esc(shareUrl),
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return lines.join('\r\n');
  }

  function downloadTendReminder(shareUrl, summary, description) {
    var ics = buildTendReminderIcs(shareUrl, summary, description);
    try {
      var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'defi-garden-tending.ics';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 0);
    } catch (err) {}
  }
  // True when `id` resolves to a KNOWN subscription — a SUBSCRIPTION_LADDER rung
  // or a subscription-archetype GOAL. The clean validator for a decoded share
  // `mix`: unknown/garbage ids are dropped (honest degradation) so a hand-edited
  // URL can never seed a bogus service.
  function isSubscriptionId(id) {
    if (!id) return false;
    for (var i = 0; i < SUBSCRIPTION_LADDER.length; i++) {
      if (SUBSCRIPTION_LADDER[i].id === id) return true;
    }
    var g = goalById(id);
    return !!(g && g.archetype === 'subscription');
  }
  function decodePlanFromUrl(urlParams) {
    var goal = urlParams.get('goal');
    var pace = urlParams.get('pace');
    if (!goal || !pace) return null;
    var g = goalById(goal);
    if (!g) return null;
    var fm = urlParams.get('fm');
    var capital = parseInt(urlParams.get('capital'), 10);
    var monthly = parseInt(urlParams.get('monthly'), 10);
    var years = parseInt(urlParams.get('years'), 10);
    var dl = parseInt(urlParams.get('dl'), 10);
    // 060: optional chain/token filter carried by the share link. null when
    // absent — never changes the existing null-goal/null-pace early-return
    // contract above.
    var chain = urlParams.get('chain') || null;
    var token = urlParams.get('token') || null;
    // 101: optional subscription mix carried by the share link. Parse defensively
    // (never throw on a hand-edited/garbage value), split on comma, trim, and
    // keep only ids that resolve to a known subscription. null when nothing
    // valid remains → arrival falls back to the anchor [goal] seed.
    var mix = null;
    try {
      var rawMix = urlParams.get('mix');
      if (rawMix) {
        var ids = String(rawMix).split(',').map(function (s) { return s.trim(); }).filter(isSubscriptionId);
        if (ids.length) mix = ids;
      }
    } catch (eMix) { mix = null; }
    // Require either capital (capital path) or monthly (monthly/legacy path)
    if (fm === 'capital') {
      if (!capital) return null;
      return { goal: goal, capital: capital, monthly: null, fundingMode: 'capital', deadline: isNaN(dl) ? null : dl, years: isNaN(years) ? null : years, persona: pace, chain: chain, token: token, mix: mix };
    }
    if (!monthly) return null;
    return { goal: goal, monthly: monthly, capital: null, fundingMode: fm || 'monthly', deadline: isNaN(dl) ? null : dl, years: isNaN(years) ? null : years, persona: pace, chain: chain, token: token, mix: mix };
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

  // Renders a brand favicon via Google's favicon service, falling back to the emoji on load error.
  // slug: domain (e.g. 'spotify.com'), emoji: fallback string, cls: className for wrapper.
  function brandIcon(slug, emoji, cls) {
    if (!slug) return e('span', { className: cls }, emoji);
    return e('img', {
      className: cls + ' gp-brand-icon',
      src: 'https://www.google.com/s2/favicons?domain=' + slug + '&sz=64',
      alt: '', 'aria-hidden': 'true', loading: 'lazy', width: 18, height: 18,
      onError: function (ev) {
        var t2 = ev.target; if (!t2 || !t2.parentNode) return;
        var s = document.createElement('span'); s.className = cls; s.textContent = emoji || '';
        t2.parentNode.replaceChild(s, t2);
      }
    });
  }

  function Chips(props) {
    return e('div', { className: 'gp-chips' + (props.wrap ? ' gp-chips-wrap' : '') },
      props.options.map(function (opt) {
        var hasHint = opt.hint != null;
        var isFeatured = !!opt.featured;
        return e('button', {
          key: opt.value,
          type: 'button',
          className: 'gp-chip' + (props.selected === opt.value ? ' is-selected' : '') +
            (hasHint ? ' gp-chip-has-hint' : '') +
            (isFeatured ? ' gp-chip-featured' : ''),
          onClick: function () { props.onPick(opt.value); },
          onMouseEnter: props.onHover ? function() { props.onHover(opt.value); } : null,
          onFocus: props.onHover ? function() { props.onHover(opt.value); } : null,
          onMouseLeave: props.onHoverEnd ? function() { props.onHoverEnd(); } : null,
          onBlur: props.onHoverEnd ? function() { props.onHoverEnd(); } : null
        },
          (opt.icon || opt.emoji) ? brandIcon(opt.icon, opt.emoji, 'gp-chip-emoji') : null,
          e('span', null, opt.label),
          hasHint ? e('span', { className: 'gp-chip-hint' }, opt.hint) : null
        );
      }),
      props.trailing || null
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
    // Attribution passthrough (064): the arriving ?src= param, e.g.
    // 'x_spotlight' from a generate-spotlight.js share URL. Threaded onto
    // plan_created/waitlist_opened so spotlight-origin funnel activity is
    // attributable — no new event names, same param the SEO waitlist
    // entry point (062) already reads at the Planner level.
    var source = props.source || null;
    var archetype = goalArchetype(goal);
    var goalDef = goalById(goal);

    // v3 props
    var propCapital = props.capital || null;
    var propFundingMode = props.fundingMode || null;
    var propDeadline = props.deadline || null;
    var isCapitalPath = propFundingMode === 'capital' && propCapital;

    // --- Pool filter + slot-override state ---
    // Seeded from props.initialChain/initialToken (060) — the Planner
    // component seeds those from a decoded shared-plan URL, same pattern as
    // ansState's own sharedPlan initializer a few hundred lines below. Plain
    // UI-driven filter changes after mount always go through setPoolFilters.
    var poolFiltersState = useState({ chain: props.initialChain || null, token: props.initialToken || null });
    var poolFilters = poolFiltersState[0], setPoolFilters = poolFiltersState[1];

    // slotPicks: array of explicit pool-id choices per slot (null = auto).
    // Length ≤ 3; null entry means "use whatever curatePools picks for that slot".
    var slotPicksState = useState([null, null, null]);
    var slotPicks = slotPicksState[0], setSlotPicks = slotPicksState[1];

    // openSwapSlot: index of the card whose swap panel is open, or null
    var openSwapSlotState = useState(null);
    var openSwapSlot = openSwapSlotState[0], setOpenSwapSlot = openSwapSlotState[1];

    // Reset stale slot picks when filters or persona change
    useEffect(function () {
      setSlotPicks([null, null, null]);
      setOpenSwapSlot(null);
    }, [poolFilters.chain, poolFilters.token, persona]);

    // Auto-curated set (filtered by poolFilters, no slot overrides)
    var autoCurated = useMemo(function () {
      return curatePools(pools, persona, 3, {
        chain: poolFilters.chain || undefined,
        token: poolFilters.token || undefined
      });
    }, [pools, persona, poolFilters.chain, poolFilters.token]);

    // Build a pool-id lookup for slot-pick resolution
    var poolById = useMemo(function () {
      var m = {};
      (pools || []).forEach(function (p) { m[p.pool] = p; });
      return m;
    }, [pools]);

    // Displayed set: start from autoCurated, then apply user slot picks.
    // A slot pick replaces the pool at that index if the chosen pool is in-band
    // for the current filters (we re-validate via curatePools rails to be safe:
    // just check the pool is not anomalous and meets TVL floor for the persona).
    var curated = useMemo(function () {
      if (slotPicks.every(function (p) { return p === null; })) return autoCurated;
      var out = autoCurated.slice(); // start from auto set (may be < 3 entries)
      for (var i = 0; i < slotPicks.length; i++) {
        var pid = slotPicks[i];
        if (!pid) continue;
        var pool = poolById[pid];
        if (!pool) continue;
        // Trust rail re-check: never let a picked pool bypass safety
        var apy2 = poolTotalApy(pool);
        if (apy2 > APY_SANITY_LIMIT || apy2 <= 0) continue;
        var pk3 = TEMPERAMENT_TO_PERSONA[persona] || persona;
        var band3 = PERSONAS[pk3] || PERSONAS.stable;
        if ((pool.tvlUsd || 0) < band3.minTvl) continue;
        if (band3.stableOnly && !isStableSymbol(pool.symbol)) continue;
        if (i < out.length) {
          out[i] = pool;
        } else {
          out.push(pool);
        }
      }
      return out.slice(0, 3);
    }, [autoCurated, slotPicks, poolById, persona]);

    var rawApy = useMemo(function () { return blendedApy(curated); }, [curated]);
    var apy = useMemo(function () {
      var pk = TEMPERAMENT_TO_PERSONA[persona] || persona;
      return (PERSONAS[pk] && PERSONAS[pk].degenHaircut) ? rawApy / 3 : rawApy;
    }, [rawApy, persona]);

    // Derive chain chip options from chains present in the eligible (unfiltered) set
    var chainOptions = useMemo(function () {
      var eligible = curatePools(pools, persona, 30);
      var counts = {};
      eligible.forEach(function (p) {
        var c = p.chain || 'Unknown';
        counts[c] = (counts[c] || 0) + 1;
      });
      var chains = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
      return chains.slice(0, 4); // top 4 by frequency
    }, [pools, persona]);

    // Derive token chip options from distinct stable tokens in the eligible set
    var tokenOptions = useMemo(function () {
      var eligible = curatePools(pools, persona, 30);
      var seen = {};
      var tokens = [];
      eligible.forEach(function (p) {
        // Split LP symbols and collect individual stables
        var parts = String(p.symbol || '').toUpperCase().split(/[-_\/\s+]/).map(function (s) { return s.trim(); }).filter(Boolean);
        parts.forEach(function (t) {
          if (!seen[t] && STABLE_SYMBOLS.indexOf(t) !== -1) {
            seen[t] = true;
            tokens.push(t);
          }
        });
      });
      return tokens.slice(0, 4); // top 4
    }, [pools, persona]);

    // v3 — per-persona curated pools + APYs for persona ladder
    var allPersonaCurated = useMemo(function () {
      return { stable: curatePools(pools, 'stable', 3), rwa: curatePools(pools, 'rwa', 3), degen: curatePools(pools, 'degen', 3) };
    }, [pools]);
    var allPersonaApy = useMemo(function () {
      var sRaw = blendedApy(allPersonaCurated.stable);
      var rRaw = blendedApy(allPersonaCurated.rwa);
      var dRaw = blendedApy(allPersonaCurated.degen);
      return { stable: sRaw, rwa: rRaw, degen: dRaw / 3 };
    }, [allPersonaCurated]);

    // Archetype-specific computations
    var targetAmt = goalDef ? goalDef.target : null;
    var projection = futureValue(monthly, apy, years || 10) + capitalGrowth(propCapital, apy, years || 10);
    var bankProjection = futureValue(monthly, BANK_APY, years || 10) + capitalGrowth(propCapital, BANK_APY, years || 10);
    var deposited = totalDeposited(monthly, years || 10) + (Number(propCapital) || 0);

    // TARGET: time to reach target (monthly accumulation path — v2 compat)
    var monthsToTarget = (archetype === 'target' && targetAmt) ? timeToTarget(targetAmt, monthly, apy) : null;
    var targetDate = (monthsToTarget != null && isFinite(monthsToTarget)) ? monthsFromNow(monthsToTarget) : null;
    var yieldContribution = (archetype === 'target' && targetAmt) ?
      Math.min(targetAmt, Math.max(0, futureValue(monthly, apy, monthsToTarget / 12) - totalDeposited(monthly, monthsToTarget / 12))) : null;

    // v3 capital path — persona ladder: months until yield covers price for each persona
    var slideCapitalState = useState(propCapital || 5000);
    var slideCapital = slideCapitalState[0], setSlideCapital = slideCapitalState[1];
    useEffect(function () { if (propCapital) setSlideCapital(propCapital); }, [propCapital]);

    // Checkout panel deposit mode — user can toggle between one-time and monthly
    var checkoutModeState = useState(isCapitalPath ? 'capital' : 'monthly');
    var checkoutMode = checkoutModeState[0], setCheckoutMode = checkoutModeState[1];

    // Dynamic slider max — for subscription goals with large forever numbers (e.g. rent ~$390k)
    // the fixed 50k max would clamp the initial value and make the slider useless.
    // Cap at $2M to prevent degenerate APYs from producing absurd ranges.
    var capitalSliderMax = useMemo(function () {
      if (archetype === 'subscription' && targetAmt && apy > 0) {
        var fn = foreverNumber(targetAmt, apy);
        if (isFinite(fn) && fn > 0) {
          return Math.min(2000000, Math.ceil(fn * 2 / 1000) * 1000);
        }
      }
      return 50000;
    }, [archetype, targetAmt, apy]);

    var ladderDates = useMemo(function () {
      if (!isCapitalPath || !targetAmt) return null;
      return {
        stable: monthsUntilYieldCoversTarget(slideCapital, allPersonaApy.stable, targetAmt),
        rwa:    monthsUntilYieldCoversTarget(slideCapital, allPersonaApy.rwa,    targetAmt),
        degen:  monthsUntilYieldCoversTarget(slideCapital, allPersonaApy.degen,  targetAmt)
      };
    }, [slideCapital, allPersonaApy, targetAmt, isCapitalPath]);

    var pk = TEMPERAMENT_TO_PERSONA[persona] || persona;
    var isDegenPersona = pk === 'degen';

    var deadlineFeasible = useMemo(function () {
      if (!propDeadline || !ladderDates) return true;
      return ladderDates[pk] <= propDeadline;
    }, [propDeadline, ladderDates, pk]);

    var capitalNeededByDeadline = useMemo(function () {
      if (!propDeadline || !targetAmt) return null;
      return capitalForDeadline(allPersonaApy[pk], targetAmt, propDeadline);
    }, [propDeadline, allPersonaApy, targetAmt, pk]);

    // Honest item-fill: elapsed months / total months needed (0 for new plan, grows on revisit)
    var itemFillPct = useMemo(function () {
      if (!isCapitalPath || !targetAmt || !apy) return 0;
      var totalMonths = monthsUntilYieldCoversTarget(slideCapital, apy, targetAmt);
      if (!isFinite(totalMonths) || totalMonths === 0) return 0;
      return 0; // 0% on first visit; My Garden report drives progress on return
    }, [isCapitalPath, slideCapital, apy, targetAmt]);

    var dailyYieldAmt = useMemo(function () {
      return isCapitalPath ? dailyYield(slideCapital, apy) : dailyYield(0, 0);
    }, [isCapitalPath, slideCapital, apy]);

    // SUBSCRIPTION: forever number for chosen goal
    var subGoalMonthly = goalDef ? goalDef.target : 20;
    var foreverAmt = (archetype === 'subscription') ? foreverNumber(subGoalMonthly, apy) : null;
    var monthsToForever = (foreverAmt && isFinite(foreverAmt)) ? timeToTarget(foreverAmt, monthly || 100, apy) : null;
    var foreverDate = monthsFromNow(monthsToForever);
    var subCapital = isCapitalPath ? slideCapital : null;
    var isInstantWin = isCapitalPath && subCapital && isFinite(foreverAmt) && subCapital >= foreverAmt;
    var subProgress = (subCapital && isFinite(foreverAmt) && foreverAmt > 0)
      ? Math.min(100, Math.round(subCapital / foreverAmt * 100)) : 0;

    // Subscription ladder rungs — cumulative stack (used in non-subscription paths + report; kept for compat)
    var ladderRungs = useMemo(function () {
      var cap = isCapitalPath ? subCapital : null;
      return buildLadder(subscriptionLadder(goal), apy, cap, goal);
    }, [apy, subCapital, isCapitalPath, goal]);

    // Mix state — arbitrary toggle selection of subscription ids.
    // 101: when the arriving plan carried a decoded subscription `mix`
    // (validated ids, threaded in as props.initialMix), seed selectedSubs from
    // it and mark the mix as touched — via the INITIAL useState value, not an
    // effect, so the anchor-only seed effect below (guarded by !mixTouched) can
    // never race/clobber the restored multi-service garden. Plain single-pick /
    // non-subscription arrivals (no initialMix) fall through to the [goal] seed
    // unchanged; mixTouched=true also lets the 099 slideCapital⇄neededCapital
    // sync recompute coverage from the full restored mix.
    var sharedMix = (archetype === 'subscription' && Array.isArray(props.initialMix) && props.initialMix.length)
      ? props.initialMix.slice() : null;
    var selectedSubsState = useState(sharedMix || []);
    var selectedSubs = selectedSubsState[0], setSelectedSubs = selectedSubsState[1];
    var mixTouchedState = useState(!!sharedMix);
    var mixTouched = mixTouchedState[0], setMixTouched = mixTouchedState[1];

    // Seed the mix with exactly the user's picked subscription (the anchor goal)
    // when it hasn't been touched yet. This previously seeded from
    // coveredBundle(slideCapital, apy, goal).covered — EVERY anchored-ladder rung
    // the capital already covered — so Spotify ($12/mo, the cheapest non-anchor
    // rung) silently tagged along whenever capital covered anchor + $12/mo (bug
    // 085). coveredBundle stays in use for the unlocked/pct display and the
    // report/share bundles; only the mix SEED changed. slideCapital is
    // intentionally NOT in the dep array now: the seeded value no longer depends
    // on capital, so keeping it would only cause redundant [goal] re-seeds on
    // every capital change while the mix is untouched. mixStats ignores an
    // unresolvable id, so the extra `goal` truthiness guard is just belt-and-braces.
    useEffect(function () {
      // spec 146: gate the seed to the subscription archetype — selectedSubs is
      // a subscription-mix concept only (already gated everywhere it's
      // persisted, planner.js ~1934/1962); seeding it for TARGET/GROWTH
      // populated currentMixStats with a bogus bundle from first render.
      if (archetype === 'subscription' && !mixTouched && apy > 0 && goal) {
        setSelectedSubs([goal]);
      }
    }, [apy, goal, mixTouched, archetype]);

    // Derive capital from the mix whenever selectedSubs changes
    var currentMixStats = useMemo(function () {
      return mixStats(selectedSubs, apy);
    }, [selectedSubs, apy]);

    // Keep slideCapital in sync with the LIVE-APY coverage the mix implies — from
    // the initial seed on, not only after the user touches the mix. The upstream
    // pick seeds `capital` with foreverNumber(target, guidanceApy) (~5.5% stable
    // guidance, planner.js ~L3863), but the bloom recomputes coverage at the live
    // blended apy, so the seeded value is stale: bug 099 — a single $20/mo pick
    // seeded ≈$4,400–4,800 at the guidance rate while the live rate needs ≈$2,300,
    // leaving the checkout hero card ($ from slideCapital) at ~2× the headline and
    // forever line ($ from currentMixStats.neededCapital). Syncing unconditionally
    // gives the hero card, headline and forever line ONE source of truth
    // (neededCapital) and also refreshes on persona/APY change. No user input is
    // lost: the amount step is skipped for subscriptions (capital is always a
    // seeded default), and dragging the capital slider still wins — it changes
    // slideCapital without changing neededCapital, so this effect never refires.
    useEffect(function () {
      if (archetype !== 'subscription' || !isCapitalPath) return;
      var needed = currentMixStats.neededCapital;
      if (needed > 0 && needed !== slideCapital) {
        setSlideCapital(needed);
      }
    }, [currentMixStats.neededCapital, archetype, isCapitalPath]);

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
      // slideCapital defaults to 5000 even on monthly-funded plans (its own
      // useState fallback), so it must be gated by isCapitalPath here — unlike
      // propCapital elsewhere, which is null/0 for a monthly-funded plan.
      return futureValue(isCapitalPath ? 0 : slideMonthly, liveApy, slideYears)
        + capitalGrowth(isCapitalPath ? slideCapital : 0, liveApy, slideYears);
    }, [slideMonthly, slideCapital, isCapitalPath, slideYears, rawApy, persona]);
    var liveBankProjection = futureValue(isCapitalPath ? 0 : slideMonthly, BANK_APY, slideYears)
      + capitalGrowth(isCapitalPath ? slideCapital : 0, BANK_APY, slideYears);

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
    // Image share confirmation — shown after the download+clipboard-copy
    // fallback completes (spec 005). Native file-share needs no in-app
    // banner; the OS share sheet already confirms.
    var imageShareConfirmState = useState(false);
    var imageShareConfirm = imageShareConfirmState[0], setImageShareConfirm = imageShareConfirmState[1];

    // YOUR PLAN card — risk dropdown open state
    var riskOpenState = useState(false);
    var riskOpen = riskOpenState[0], setRiskOpen = riskOpenState[1];
    // subscription: combined risk+engine customize panel (collapsed by default)
    var planCustomizeOpenState = useState(false);
    var planCustomizeOpen = planCustomizeOpenState[0], setPlanCustomizeOpen = planCustomizeOpenState[1];
    // growth/target: risk row expanded (collapsed by default)
    var riskExpandedState = useState(false);
    var riskExpanded = riskExpandedState[0], setRiskExpanded = riskExpandedState[1];
    // growth/target: engine expanded (collapsed by default)
    var engineOpenState = useState(false);
    var engineOpen = engineOpenState[0], setEngineOpen = engineOpenState[1];
    // growth/target customize expanded (collapsed by default)
    var makeitExpandedState = useState(false);
    var makeitExpanded = makeitExpandedState[0], setMakeitExpanded = makeitExpandedState[1];

    // Waitlist modal state
    var waitlistOpenState = useState(false);
    var waitlistOpen = waitlistOpenState[0], setWaitlistOpen = waitlistOpenState[1];
    var waitlistStepState = useState(1);
    var waitlistStep = waitlistStepState[0], setWaitlistStep = waitlistStepState[1];
    var waitlistEmailState = useState('');
    var waitlistEmail = waitlistEmailState[0], setWaitlistEmail = waitlistEmailState[1];
    var waitlistStatusState = useState('idle');
    var waitlistStatus = waitlistStatusState[0], setWaitlistStatus = waitlistStatusState[1];
    var referralHandleState = useState('');
    var referralHandle = referralHandleState[0], setReferralHandle = referralHandleState[1];
    var waitlistEmailEnteredRef = useRef(false);

    // Close waitlist on Escape key
    useEffect(function () {
      if (!waitlistOpen) return;
      function handleKeyDown(ev) {
        if (ev.key === 'Escape') setWaitlistOpen(false);
      }
      document.addEventListener('keydown', handleKeyDown);
      return function () { document.removeEventListener('keydown', handleKeyDown); };
    }, [waitlistOpen]);

    function sanitizeHandle(raw) {
      return String(raw || '').toLowerCase().replace(/[^a-z0-9.\-_]/g, '').slice(0, 30);
    }

    function submitWaitlist(ev) {
      if (ev) ev.preventDefault();
      if (!waitlistEmail.trim()) {
        if (typeof Analytics !== 'undefined') {
          Analytics.trackWaitlistError({ reason: 'empty_email', goal: goal, persona: persona, archetype: archetype, pitchVariant: PITCH_VARIANT });
        }
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(waitlistEmail)) {
        if (typeof Analytics !== 'undefined') {
          Analytics.trackWaitlistError({ reason: 'invalid_email', goal: goal, persona: persona, archetype: archetype, pitchVariant: PITCH_VARIANT });
        }
        return;
      }
      setWaitlistStatus('submitting');
      if (typeof Analytics !== 'undefined') {
        Analytics.trackWaitlistSubmitAttempt({ goal: goal, persona: persona, archetype: archetype, pitchVariant: PITCH_VARIANT });
      }
      // Derive handle from email local part
      var rawHandle = waitlistEmail.split('@')[0] || '';
      var derived = sanitizeHandle(rawHandle);
      var personaTitle = pk === 'stable' ? t('personaStableTitle') : (pk === 'rwa' ? t('personaRwaTitle') : t('personaDegenTitle'));
      // spec 146: branch by archetype. Subscription keeps the pre-existing
      // "covers …" summary verbatim (raw-id fallback fixed to goalLabel).
      // TARGET/GROWTH previously reused this same "covers X (~$Y/mo)" string
      // even though those goals have no $/mo — an honest plain-English
      // summary of the plan actually built (goal + capital or monthly×years +
      // risk) replaces it. Not user-facing UI (operator's Formspree inbox
      // only) — intentionally left untranslated, per spec.
      var msgSummary;
      if (archetype === 'subscription') {
        var mixLabels = selectedSubs.map(function (id) {
          var found = null;
          for (var li2 = 0; li2 < SUBSCRIPTION_LADDER.length; li2++) {
            if (SUBSCRIPTION_LADDER[li2].id === id) { found = SUBSCRIPTION_LADDER[li2]; break; }
          }
          return found ? t(found.labelKey) : goalLabel(t, id);
        });
        var labelsStr = joinBundle(mixLabels) || goalLabel(t, goal);
        msgSummary = 'covers ' + labelsStr
          + ' (~' + formatUsd(currentMixStats.combinedMonthly) + '/mo)'
          + ' for ~' + formatUsd(currentMixStats.neededCapital)
          + ', risk ' + personaTitle;
      } else {
        var fundingDesc = isCapitalPath
          ? ('~' + formatUsd(slideCapital) + ' capital')
          : ('~' + formatUsd(slideMonthly) + '/mo for ' + slideYears + ' yrs');
        msgSummary = goalLabel(t, goal) + ' plan: ' + fundingDesc + ', risk ' + personaTitle;
      }
      var payload = {
        email: waitlistEmail,
        message: msgSummary,
        referral: derived,
        _subject: 'DeFi Garden waitlist signup'
      };
      fetch('https://formspree.io/f/xzdqygjn', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (res.ok) {
          setReferralHandle(derived);
          setWaitlistStep(2);
          setWaitlistStatus('idle');
          if (typeof Analytics !== 'undefined') {
            Analytics.trackWaitlistSubmitted({ goal: goal, persona: persona, archetype: archetype, success: true, pitchVariant: PITCH_VARIANT });
          }
        } else {
          setWaitlistStatus('error');
          if (typeof Analytics !== 'undefined') {
            Analytics.trackWaitlistError({ reason: 'formspree_error', goal: goal, persona: persona, archetype: archetype, pitchVariant: PITCH_VARIANT });
            Analytics.trackWaitlistSubmitted({ goal: goal, persona: persona, archetype: archetype, success: false, pitchVariant: PITCH_VARIANT });
          }
        }
      }).catch(function () {
        setWaitlistStatus('error');
        if (typeof Analytics !== 'undefined') {
          Analytics.trackWaitlistError({ reason: 'network', goal: goal, persona: persona, archetype: archetype, pitchVariant: PITCH_VARIANT });
          Analytics.trackWaitlistSubmitted({ goal: goal, persona: persona, archetype: archetype, success: false, pitchVariant: PITCH_VARIANT });
        }
      });
    }

    function doWaitlistShare() {
      var tweetText;
      if (archetype === 'subscription') {
        // Byte-for-byte pre-146 behavior: label the ACTUAL selected mix
        // (selectedSubs) — NOT buildShareCopy's coveredBundle-derived
        // rowLabel, which reflects what the parked capital covers and can
        // diverge from selectedSubs the moment a user manually toggles the
        // mix UI (e.g. adds Spotify without the capital covering it yet).
        // Reusing buildShareCopy here would be a real behavior change on an
        // already-correct path; only the raw-id fallback (item 5) is fixed.
        var mixLabels2 = selectedSubs.map(function (id2) {
          var found2 = null;
          for (var li3 = 0; li3 < SUBSCRIPTION_LADDER.length; li3++) {
            if (SUBSCRIPTION_LADDER[li3].id === id2) { found2 = SUBSCRIPTION_LADDER[li3]; break; }
          }
          return found2 ? t(found2.labelKey) : goalLabel(t, id2);
        });
        var tweetLabels = joinBundle(mixLabels2) || goalLabel(t, goal);
        tweetText = t('shareTweet', tweetLabels);
      } else {
        // TARGET/GROWTH never had an archetype-correct tweet frame at all
        // (shareTweet is subscription-worded "My yield pays for X —
        // forever") — reuse doShare's archetype branch (2026-07-10 REUSE
        // directive) via buildShareCopy + a new generic tweet wrapper.
        var copy = buildShareCopy();
        tweetText = t('shareTweetGeneric', copy.headline);
      }
      var tweetUrl = 'https://www.defi.garden/?ref=' + encodeURIComponent(referralHandle);
      window.open(
        'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetText) +
        '&url=' + encodeURIComponent(tweetUrl),
        '_blank', 'noopener,noreferrer'
      );
    }

    function doWaitlistDownload() {
      var headline, subline, drawChart, rowLabel, featured;
      if (archetype === 'subscription') {
        // Byte-for-byte pre-146 behavior — same selectedSubs-based mix bundle
        // as before (see doWaitlistShare above for why buildShareCopy's
        // coveredBundle path is NOT reused here); only the raw-id fallback
        // (item 5) is fixed.
        var matchedSubs3 = [];
        var mixLabels3 = selectedSubs.map(function (id3) {
          var found3 = null;
          for (var li4 = 0; li4 < SUBSCRIPTION_LADDER.length; li4++) {
            if (SUBSCRIPTION_LADDER[li4].id === id3) { found3 = SUBSCRIPTION_LADDER[li4]; break; }
          }
          if (found3) matchedSubs3.push(found3);
          return found3 ? t(found3.labelKey) : goalLabel(t, id3);
        });
        var dlList = joinBundle(mixLabels3) || goalLabel(t, goal);
        headline = dlList ? t('shareSubBundle', dlList) : t('shareSubWin', goalLabel(t, goal));
        // Featured service for the row-1 icon: the single bundled service if
        // exactly one is selected, else the anchor goal (0 selected) — a 2+
        // bundle has no single logo, falls back to the sprout emoji.
        featured = matchedSubs3.length === 1 ? matchedSubs3[0]
          : (selectedSubs.length === 0 ? brandForId(goal) : null);
        rowLabel = dlList;
        subline = t('shareSubSubline', formatUsdRounded(currentMixStats.neededCapital || subCapital || 0), formatApy(apy), formatUsd(currentMixStats.combinedMonthly));
        drawChart = false;
      } else {
        // TARGET/GROWTH — the actually-broken path this spec fixes. Reuse
        // doShare's archetype branch (2026-07-10 REUSE directive).
        var copy = buildShareCopy();
        headline = copy.headline; subline = copy.subline; drawChart = copy.drawChart;
        rowLabel = copy.rowLabel; featured = copy.featured;
      }
      // spec 146 item 4: carry the plan URL off the device like every other
      // share path (same argument list doShare uses) — this surface
      // previously shipped a PNG with no link and no share_link_created.
      var shareUrl = encodePlanToUrl(goal, monthly, years, persona, props.capital, props.fundingMode, props.deadline, poolFilters, selectedSubs);
      renderShareImage({
        headline: headline,
        goalLabel: rowLabel,
        brandIcon: featured ? featured.icon : null,
        brandEmoji: featured ? featured.emoji : '🌱',
        subline: subline,
        footer: t('shareFooter'),
        years: slideYears,
        you: slideMonthly,
        apy: apy,
        drawChart: drawChart,
        url: shareUrl,
        shareText: headline
      }).then(function (result) {
        if (result && result.linkAttached) {
          if (typeof Analytics !== 'undefined') {
            // New, disjoint method value — cannot pollute the existing image/link series.
            Analytics.trackShareLinkCreated({ method: 'waitlist_card', goal: goal, persona: persona });
          }
        }
      }).catch(function () {});
    }

    // Persist plan whenever artifact settles — curated is always the DISPLAYED set
    var firedPlanCreated = useRef(false);
    var lastPlanSavedSig = useRef(null);
    useEffect(function () {
      if (!curated.length) return;
      if (typeof Analytics !== 'undefined') {
        if (!firedPlanCreated.current) {
          firedPlanCreated.current = true;
          Analytics.trackPlanCreated({ archetype: archetype, goal: goal, monthly: monthly, years: years || 10, persona: persona, source: source });
        }
        // plan_saved fires only on user-meaningful plan changes; rate churn
        // re-runs this effect but must not re-fire the analytics event.
        var planSavedSig = planSavedSignature({
          archetype: archetype, goal: goal, monthly: monthly, years: years || 10, persona: persona,
          capital: propCapital, fundingMode: propFundingMode, deadline: propDeadline,
          poolFilters: poolFilters, slotPicks: slotPicks,
          mix: archetype === 'subscription' ? selectedSubs : null
        });
        if (lastPlanSavedSig.current !== planSavedSig) {
          lastPlanSavedSig.current = planSavedSig;
          Analytics.trackPlanSaved({
            archetype: archetype, goal: goal, monthly: monthly, years: years || 10, persona: persona,
            blendedApy: rawApy, poolCount: curated.length
          });
        }
      }
      savePlan({
        version: PLAN_VERSION,
        goal: goal, monthly: monthly, years: years || 10, persona: persona,
        temperament: PERSONA_TO_TEMPERAMENT[persona] || persona,
        // pools saved = displayed set (user's actual stack, including any swaps)
        pools: curated.map(function (p) { return { pool: p.pool, symbol: p.symbol, project: p.project, chain: p.chain, apy: poolTotalApy(p) }; }),
        blendedApy: rawApy, effectiveApy: apy,
        projection: archetype === 'growth' ? projection : null,
        fundingMode: propFundingMode,
        capital: propCapital,
        deadline: propDeadline,
        archetype: archetype,
        target: targetAmt,
        hero: buildPlanHero({ archetype: archetype, fundingMode: propFundingMode, capital: propCapital, monthly: monthly, years: years || 10, target: targetAmt, apy: apy }),
        savedAt: new Date().toISOString(),
        // Optional fields (new in this version) — older migratePlan ignores unknown fields
        poolFilters: poolFilters,
        slotPicks: slotPicks,
        mix: archetype === 'subscription' ? selectedSubs : undefined
      });
    }, [curated, monthly, years, persona, apy, goal, propCapital, propFundingMode, propDeadline, poolFilters, slotPicks, selectedSubs, archetype]);

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

    // buildShareCopy() — single source of truth for the archetype-branched
    // share copy (headline/subline/row-label/featured brand/chart-flag).
    // Extracted from doShare (spec 146) so doWaitlistShare and
    // doWaitlistDownload reuse the SAME branching instead of re-deriving
    // their own (previously subscription-only, TARGET/GROWTH-incoherent)
    // copy — the 2026-07-10 REUSE directive. doShare's own output is
    // unchanged: this is the same code, only moved.
    function buildShareCopy() {
      var heroDate = ladderDates ? monthsFromNow(ladderDates[pk]) : null;
      var headline, subline, drawChart, rowLabel, featured;

      if (archetype === 'subscription' && isCapitalPath) {
        // Subscription capital path: bundle-aware headline + correct figures
        var shareBundle = coveredBundle(subCapital, apy, goal);
        var shareBundleLabels = shareBundle.covered.map(function (r) { return t(r.labelKey); });
        var shareBundleList = joinBundle(shareBundleLabels);
        if (shareBundleList) {
          headline = t('shareSubBundle', shareBundleList);
          subline = t('shareSubSubline',
            formatUsdRounded(subCapital),
            formatApy(apy),
            formatUsd(shareBundle.combinedMonthly)
          );
          // Row-1 label must match the headline's list, not the anchor goal alone —
          // a single covered service gets its own logo; a multi-service bundle has
          // no single logo, so it falls back to the sprout emoji in renderShareImage.
          rowLabel = shareBundleList;
          featured = shareBundle.covered.length === 1 ? brandForId(shareBundle.covered[0].id) : null;
        } else {
          // Capital parked but doesn't cover anchor yet — fall back gracefully
          headline = t('shareSubWin', goalLabel(t, goal));
          subline = t('shareSubSubline',
            formatUsdRounded(subCapital),
            formatApy(apy),
            formatUsd(0)
          );
          rowLabel = goalLabel(t, goal);
          featured = brandForId(goal);
        }
        drawChart = false;
      } else if (archetype === 'subscription') {
        // Monthly subscription path
        headline = foreverDate
          ? t('heroSubscription', goalLabel(t, goal), foreverDate)
          : t('bloomHeadline', formatUsdRounded(liveProjection), slideYears);
        subline = t('shareSubline', formatUsd(monthly), slideYears);
        drawChart = true;
        rowLabel = goalLabel(t, goal);
        featured = brandForId(goal);
      } else if (archetype === 'target') {
        // Target path
        if (isCapitalPath && heroDate) {
          headline = t('shareTargetNew', goalLabel(t, goal), heroDate);
        } else if (targetDate) {
          headline = t('heroTarget', goalLabel(t, goal), targetDate);
        } else {
          headline = t('bloomHeadline', formatUsdRounded(liveProjection), slideYears);
        }
        subline = isCapitalPath
          ? formatUsdRounded(slideCapital) + ' · ' + formatApy(apy)
          : t('shareSubline', formatUsd(monthly), slideYears);
        drawChart = !isCapitalPath;
        rowLabel = goalLabel(t, goal);
        featured = brandForId(goal);
      } else {
        // Growth path
        headline = t('bloomHeadline', formatUsdRounded(liveProjection), slideYears);
        subline = t('shareSubline', formatUsd(monthly), slideYears);
        drawChart = true;
        rowLabel = goalLabel(t, goal);
        featured = brandForId(goal);
      }

      return { headline: headline, subline: subline, rowLabel: rowLabel, featured: featured, drawChart: drawChart };
    }

    function doShare() {
      setSharing(true);
      var copy = buildShareCopy();
      var shareUrl = encodePlanToUrl(goal, monthly, years, persona, props.capital, props.fundingMode, props.deadline, poolFilters, selectedSubs);
      renderShareImage({
        headline: copy.headline,
        goalLabel: copy.rowLabel,
        brandIcon: copy.featured ? copy.featured.icon : null,
        brandEmoji: copy.featured ? copy.featured.emoji : '🌱',
        subline: copy.subline,
        footer: t('shareFooter'),
        years: slideYears,
        you: slideMonthly, apy: apy,
        drawChart: copy.drawChart,
        // Spec 005: the image share must also carry the plan URL off the device.
        url: shareUrl,
        shareText: copy.headline
      }).then(function (result) {
        setSharing(false);
        if (result && result.linkAttached) {
          if (typeof Analytics !== 'undefined') {
            Analytics.trackShareLinkCreated({ method: 'image', goal: goal, persona: persona });
          }
          if (result.method === 'download') {
            setImageShareConfirm(true);
            setTimeout(function () { setImageShareConfirm(false); }, 2500);
          }
        }
      }).catch(function () { setSharing(false); });
    }

    function doCopyLink() {
      var url = encodePlanToUrl(goal, monthly, years, persona, props.capital, props.fundingMode, props.deadline, poolFilters, selectedSubs);
      if (typeof Analytics !== 'undefined') {
        Analytics.trackShareLinkCreated({ method: 'copy', goal: goal, persona: persona });
      }
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
      var url = encodePlanToUrl(goal, monthly, years, persona, props.capital, props.fundingMode, props.deadline, poolFilters, selectedSubs);
      if (typeof Analytics !== 'undefined') {
        Analytics.trackShareLinkCreated({ method: 'native', goal: goal, persona: persona });
      }
      var nativeHeroDate = ladderDates ? monthsFromNow(ladderDates[pk]) : null;
      var heroText;
      if (archetype === 'subscription' && isCapitalPath) {
        var nativeBundle = coveredBundle(subCapital, apy, goal);
        var nativeBundleLabels = nativeBundle.covered.map(function (r) { return t(r.labelKey); });
        var nativeBundleList = joinBundle(nativeBundleLabels);
        heroText = nativeBundleList
          ? t('shareSubBundle', nativeBundleList)
          : t('shareSubWin', goalLabel(t, goal));
      } else if (archetype === 'subscription' && foreverDate) {
        heroText = t('heroSubscription', goalLabel(t, goal), foreverDate);
      } else if (archetype === 'target' && isCapitalPath && nativeHeroDate) {
        heroText = t('shareTargetNew', goalLabel(t, goal), nativeHeroDate);
      } else if (archetype === 'target' && targetDate) {
        heroText = t('heroTarget', goalLabel(t, goal), targetDate);
      } else {
        heroText = t('bloomHeadline', formatUsdRounded(liveProjection), slideYears);
      }
      if (navigator.share) {
        navigator.share({ title: 'My DeFi Garden', text: heroText, url: url }).catch(function(){});
      }
    }

    // Helper: persona ladder rows element (used in hero and in interactive section)
    function renderPersonaLadder() {
      if (!ladderDates) return null;
      var stableDate = monthsFromNow(ladderDates.stable);
      var rwaDate = monthsFromNow(ladderDates.rwa);
      var degenDate = monthsFromNow(ladderDates.degen);
      return e('div', { className: 'gp-persona-ladder' },
        e('div', { className: 'gp-ladder-row' + (pk === 'stable' ? ' gp-ladder-row-active' : '') },
          e('span', { className: 'gp-ladder-label' }, stableDate ? t('ladderStables', stableDate) : t('ladderStables', '—'))
        ),
        e('div', { className: 'gp-ladder-row' + (pk === 'rwa' ? ' gp-ladder-row-active' : '') },
          e('span', { className: 'gp-ladder-label' }, rwaDate ? t('ladderRwa', rwaDate) : t('ladderRwa', '—'))
        ),
        e('div', { className: 'gp-ladder-row gp-ladder-degen' + (pk === 'degen' ? ' gp-ladder-row-active' : '') },
          e('span', { className: 'gp-ladder-label' }, degenDate ? t('ladderDegen', degenDate) : t('ladderDegen', '—')),
          e('div', { className: 'gp-ladder-degen-note' }, t('ladderDegenNote'))
        )
      );
    }

    // Hero answer based on archetype
    var heroElement;
    if (archetype === 'target' && isCapitalPath && ladderDates) {
      var heroDate = monthsFromNow(ladderDates[pk]);
      if (propDeadline && !deadlineFeasible) {
        // Infeasible deadline: show feasibility ladder
        heroElement = e('div', { className: 'gp-bloom-headline gp-animate-in gp-feasibility' },
          e('div', { className: 'gp-headline-figure gp-feasibility-title' },
            t('heroTargetFeasibilityTitle', monthsFromNow(propDeadline) || '—')
          ),
          e('div', { className: 'gp-headline-sub' }, t('heroTargetFeasibilityWhat')),
          capitalNeededByDeadline ? e('div', { className: 'gp-feasibility-needed' },
            formatUsdRounded(capitalNeededByDeadline) + ' needed by ' + (monthsFromNow(propDeadline) || '—')
          ) : null,
          renderPersonaLadder()
        );
      } else {
        // Feasible capital path: keep-your-principal hero
        heroElement = e('div', { className: 'gp-bloom-headline gp-animate-in' },
          e('div', { className: 'gp-headline-figure' },
            heroDate ? t('heroTargetFlip', formatUsdRounded(slideCapital), goalLabel(t, goal), heroDate)
              : t('heroTargetInstant', goalLabel(t, goal))
          ),
          e('div', { className: 'gp-headline-sub gp-flip-keep' },
            t('heroTargetFlipKeep', formatUsdRounded(slideCapital))
          )
        );
      }
    } else if (archetype === 'target' && !isCapitalPath && targetDate) {
      // Monthly path: hybrid/discount framing
      var yieldPct = (yieldContribution && targetAmt) ? Math.round(yieldContribution / targetAmt * 100) : 0;
      heroElement = e('div', { className: 'gp-bloom-headline gp-animate-in' },
        e('div', { className: 'gp-headline-figure' }, t('heroTarget', goalLabel(t, goal), targetDate)),
        e('div', { className: 'gp-headline-sub' }, t('heroTargetYieldCovers', yieldPct)),
        e('div', { className: 'gp-headline-sub' }, t('hybridDiscount', yieldPct))
      );
    } else if (archetype === 'subscription') {
      // SUBSCRIPTION hero — derived from the mix selection
      var heroMix = currentMixStats;
      if (isCapitalPath && heroMix.count >= 1) {
        // Build labels from mix ids via subscriptionLadder items + GOALS
        var heroMixItems = subscriptionLadder(goal);
        var heroLabels = heroMix.ids.map(function (id) {
          for (var li = 0; li < heroMixItems.length; li++) {
            if (heroMixItems[li].id === id) return t(heroMixItems[li].labelKey);
          }
          var hg = goalById(id);
          return hg ? t(hg.labelKey) : id;
        });
        var heroBundleList = joinBundle(heroLabels);
        heroElement = e('div', { className: 'gp-bloom-headline gp-animate-in gp-instant-win' },
          e('div', { className: 'gp-headline-figure' },
            heroMix.count >= 2 ? t('subHeroWinBundleMany', heroBundleList) : t('subHeroWinBundle', heroBundleList)
          ),
          e('div', { className: 'gp-headline-sub' },
            t('subHeroWinCovers',
              heroMix.neededCapital > 0 ? formatUsdRounded(heroMix.neededCapital) : '…',
              formatUsd(heroMix.combinedMonthly),
              formatApy(apy)
            )
          )
        );
      } else if (isCapitalPath && heroMix.count === 0) {
        // No selection yet — gentle prompt
        heroElement = e('div', { className: 'gp-bloom-headline gp-animate-in' },
          e('div', { className: 'gp-headline-figure' }, t('mixHeroEmpty'))
        );
      } else {
        // Monthly path — progress variant (unchanged)
        var anchorRungForever = foreverAmt;
        var progressPct = (subCapital && isFinite(anchorRungForever) && anchorRungForever > 0)
          ? Math.min(100, Math.round(subCapital / anchorRungForever * 100))
          : subProgress;
        var crossDate = isCapitalPath
          ? null
          : foreverDate;
        heroElement = e('div', { className: 'gp-bloom-headline gp-animate-in' },
          e('div', { className: 'gp-headline-figure' }, t('subHeroProgress', progressPct, goalLabel(t, goal))),
          crossDate ? e('div', { className: 'gp-headline-sub' }, t('subHeroMonthly', crossDate)) : null,
          isFinite(anchorRungForever) ? e('div', { className: 'gp-headline-sub' },
            formatUsdRounded(anchorRungForever) + ' plants it forever'
          ) : null
        );
      }
    } else {
      // GROWTH — capital-funded plans show a capital slider instead of a
      // monthly one (see the isCapitalPath slider-group below), so
      // "deposited" is the lump sum, not a monthly*months product.
      var growthDeposited = isCapitalPath ? (Number(slideCapital) || 0) : totalDeposited(slideMonthly, slideYears);
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
        e('div', { className: 'gp-headline-deposited' }, t('bloomDeposited', formatUsd(growthDeposited)))
      );
    }

    // Suggested ask chips (always visible)
    var suggestedChips = [
      t('askChipSafe'), t('askChipRatesDrop'), t('askChipCatch'),
      archetype === 'subscription' ? t('askChipStop') : t('askChipWithdraw')
    ];

    // Mix toggle list element — subscription card cover (arbitrary selection)
    var mixItems = archetype === 'subscription' ? subscriptionLadder(goal) : [];
    var mixElement = archetype === 'subscription' ? (function () {
      return e('div', { className: 'gp-mix-list' },
        e('div', { className: 'gp-sub-ladder-title' }, t('planCoverLabel')),
        isCapitalPath ? e('p', { className: 'gp-mix-hint' }, t('mixHint')) : null,
        mixItems.map(function (item) {
          var isOn = selectedSubs.indexOf(item.id) !== -1;
          return e('button', {
            key: item.id,
            type: 'button',
            className: 'gp-mix-row' + (isOn ? ' is-on' : ''),
            onClick: (function (id) {
              return function () {
                setMixTouched(true);
                setSelectedSubs(function (prev) {
                  var idx = prev.indexOf(id);
                  if (idx === -1) return prev.concat([id]);
                  return prev.slice(0, idx).concat(prev.slice(idx + 1));
                });
              };
            }(item.id)),
            'aria-pressed': isOn ? 'true' : 'false'
          },
            e('span', { className: 'gp-mix-check', 'aria-hidden': 'true' }, isOn ? '✓' : ''),
            brandIcon(item.icon, item.emoji, 'gp-mix-emoji'),
            e('span', { className: 'gp-mix-label' }, t(item.labelKey)),
            e('span', { className: 'gp-mix-monthly' }, formatUsd(item.monthly) + '/mo')
          );
        }),
        currentMixStats.count === 0
          ? e('div', { className: 'gp-mix-total gp-mix-empty' }, t('mixEmpty'))
          : e('div', { className: 'gp-mix-total-wrap' },
              e('div', { className: 'gp-mix-total' },
                t('mixTotal',
                  currentMixStats.neededCapital > 0 ? formatUsdRounded(currentMixStats.neededCapital) : '…',
                  formatUsd(currentMixStats.combinedMonthly)
                ),
                ' *'
              ),
              e('div', { className: 'gp-mix-caveat' },
                '* ' + t(pk === 'degen' ? 'mixCaveatDegen' : (pk === 'rwa' ? 'mixCaveatRwa' : 'mixCaveatStable'))
              )
            )
      );
    })() : null;

    // Shared persona options + risk label (used in plan card, makeit compact, and engine)
    var sharedPersonaOptions = [
      { key: 'stable', shortKey: 'personaStableShort', titleKey: 'personaStableTitle' },
      { key: 'rwa',    shortKey: 'personaRwaShort',    titleKey: 'personaRwaTitle' },
      { key: 'degen',  shortKey: 'personaDegenShort',  titleKey: 'personaDegenTitle' }
    ];
    var sharedCurrentPersonaOpt = sharedPersonaOptions.filter(function (p) { return p.key === pk; })[0] || sharedPersonaOptions[0];
    var currentRiskLabel = t(sharedCurrentPersonaOpt.shortKey);

    // YOUR PLAN card — subscription-only consolidated control block
    var planCardElement = archetype === 'subscription' ? (function () {
      return e('div', { className: 'gp-plan-card gp-animate-in' },
        e('div', { className: 'gp-plan-card-title' }, t('planCardTitle')),
        e('div', { className: 'gp-plan-card-cover' },
          mixElement
        )
      );
    })() : null;

    // Plan-level projection confidence note (spec 106) — a calm line summarizing
    // the track record of the whole `curated` set behind the blended rate. Hides
    // itself (null) on the live/no-kpis path. Sits after heroElement in both trees.
    var planConfidenceElement = (function () {
      var conf = planConfidence(curated);
      if (!conf) return null;
      var copy;
      if (conf.steady === conf.total && conf.minHp >= 7) {
        copy = t('planConfidenceSteady', conf.minHp);
      } else if (conf.steady > 0) {
        copy = t('planConfidencePartial', conf.steady, conf.total);
      } else {
        copy = t('planConfidenceBuilding');
      }
      return e('div', { className: 'gp-plan-confidence gp-animate-in' },
        e('span', { className: 'gp-plan-confidence-icon', 'aria-hidden': 'true' }, '🌱'),
        e('span', { className: 'gp-plan-confidence-text' }, copy)
      );
    })();

    // Engine room element (shared) — collapsed by default
    var engineElement = e('div', { className: 'gp-pools gp-animate-in' },
      e('button', {
        type: 'button',
        className: 'gp-pools-toggle',
        onClick: function () { setEngineOpen(function (v) { return !v; }); },
        'aria-expanded': engineOpen ? 'true' : 'false'
      },
        e('div', { className: 'gp-pools-heading' },
          t('poolsHeading'),
          e('span', { className: 'gp-blended-badge' }, t('blendedBadge', formatApy(apy)))
        ),
        e('span', { className: 'gp-engine-chevron' + (engineOpen ? ' is-open' : '') }, '▾')
      ),
      engineOpen ? e('div', { className: 'gp-engine-body' },
      isDegenPersona ? e('div', { className: 'gp-degen-warning' },
        t('degenHaircutNote', formatApy(rawApy))
      ) : null,

      // Filter chip rows — chain
      chainOptions.length > 1 ? e('div', { className: 'gp-engine-filter-row' },
        e('span', { className: 'gp-engine-filter-label' }, t('engineFilterChain')),
        e('div', { className: 'gp-chips gp-chips-wrap' },
          [{ value: null, label: t('engineAll') }].concat(
            chainOptions.map(function (c) { return { value: c, label: c }; })
          ).map(function (opt) {
            var isSelected = poolFilters.chain === opt.value;
            return e('button', {
              key: opt.value == null ? '__all__' : opt.value,
              type: 'button',
              className: 'gp-chip gp-engine-chip' + (isSelected ? ' is-selected' : ''),
              onClick: function () {
                setPoolFilters(function (f) { return Object.assign({}, f, { chain: opt.value }); });
              }
            }, opt.label);
          })
        )
      ) : null,

      // Filter chip rows — token
      tokenOptions.length > 1 ? e('div', { className: 'gp-engine-filter-row' },
        e('span', { className: 'gp-engine-filter-label' }, t('engineFilterToken')),
        e('div', { className: 'gp-chips gp-chips-wrap' },
          [{ value: null, label: t('engineAll') }].concat(
            tokenOptions.map(function (tok) { return { value: tok, label: tok }; })
          ).map(function (opt) {
            var isSelected = poolFilters.token === opt.value;
            return e('button', {
              key: opt.value == null ? '__all__' : opt.value,
              type: 'button',
              className: 'gp-chip gp-engine-chip' + (isSelected ? ' is-selected' : ''),
              onClick: function () {
                setPoolFilters(function (f) { return Object.assign({}, f, { token: opt.value }); });
              }
            }, opt.label);
          })
        )
      ) : null,

      curated.length === 0
        ? e('div', { className: 'gp-pools-empty' }, t('noPools'))
        : e('div', { className: 'gp-pool-grid' },
            curated.map(function (p, slotIdx) {
              var isSwapOpen = openSwapSlot === slotIdx;
              var displayedIds = curated.map(function (c) { return c.pool; });
              var alts = isSwapOpen
                ? poolAlternatives(pools, persona, {
                    chain: poolFilters.chain || undefined,
                    token: poolFilters.token || undefined
                  }, displayedIds, 5)
                : [];

              return e('div', {
                key: p.pool,
                className: 'gp-pool-slot' + (isSwapOpen ? ' gp-pool-slot-open' : '')
              },
                e('a', {
                  className: 'gp-pool-card', href: '/?pool=' + encodeURIComponent(p.pool),
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
                ),
                e('button', {
                  type: 'button',
                  className: 'gp-pool-swap-btn' + (isSwapOpen ? ' is-active' : ''),
                  'aria-label': isSwapOpen ? t('engineSwapClose') : t('engineSwap'),
                  onClick: function (ev) {
                    ev.stopPropagation();
                    setOpenSwapSlot(isSwapOpen ? null : slotIdx);
                  }
                }, isSwapOpen ? '×' : t('engineSwap')),

                isSwapOpen ? e('div', { className: 'gp-swap-panel' },
                  alts.length === 0
                    ? e('div', { className: 'gp-swap-empty' }, t('noPools'))
                    : alts.map(function (alt) {
                        return e('button', {
                          key: alt.pool,
                          type: 'button',
                          className: 'gp-swap-alt',
                          onClick: function () {
                            setSlotPicks(function (prev) {
                              var next = prev.slice();
                              next[slotIdx] = alt.pool;
                              return next;
                            });
                            setOpenSwapSlot(null);
                          }
                        },
                          e('div', { className: 'gp-swap-alt-top' },
                            e('span', { className: 'gp-swap-alt-symbol' }, alt.symbol),
                            e('span', { className: 'gp-swap-alt-apy' }, formatApy(poolTotalApy(alt)))
                          ),
                          e('div', { className: 'gp-swap-alt-meta' },
                            e('span', null, alt.project),
                            e('span', null, ' · ' + alt.chain)
                          )
                        );
                      })
                ) : null
              );
            })
          )
      ) : null // close engineOpen body
    );

    // Subscription-only: combined Risk + Engine "Customize" panel
    var subCustomizeElement = archetype === 'subscription' ? (function () {
      var personaOptions = sharedPersonaOptions;
      return e('div', { className: 'gp-sub-customize gp-animate-in' },
        e('button', {
          type: 'button',
          className: 'gp-sub-customize-trigger',
          onClick: function () { setPlanCustomizeOpen(function (v) { return !v; }); },
          'aria-expanded': planCustomizeOpen ? 'true' : 'false'
        },
          e('div', { className: 'gp-sub-customize-summary' },
            e('span', { className: 'gp-sub-customize-risk' }, currentRiskLabel),
            e('span', { className: 'gp-sub-customize-sep' }, '·'),
            e('span', { className: 'gp-sub-customize-rate' }, formatApy(apy) + ' blended')
          ),
          e('span', { className: 'gp-sub-customize-cta' },
            t('riskEdit'),
            e('span', { className: 'gp-engine-chevron' + (planCustomizeOpen ? ' is-open' : '') }, ' ▾')
          )
        ),
        planCustomizeOpen ? e('div', { className: 'gp-sub-customize-body' },
          // Risk picker
          e('div', { className: 'gp-sub-customize-section' },
            e('div', { className: 'gp-plan-risk' },
              e('span', { className: 'gp-plan-risk-label' }, t('riskLabel')),
              e('div', { style: { position: 'relative' } },
                e('button', {
                  type: 'button',
                  className: 'gp-risk-toggle',
                  'aria-haspopup': 'listbox',
                  'aria-expanded': riskOpen ? 'true' : 'false',
                  onClick: function () { setRiskOpen(function (v) { return !v; }); },
                  onKeyDown: function (ev) { if (ev.key === 'Escape') setRiskOpen(false); }
                }, currentRiskLabel, ' ▾'),
                riskOpen ? e('div', {
                  className: 'gp-risk-menu', role: 'listbox', 'aria-label': t('riskLabel')
                },
                  personaOptions.map(function (p) {
                    var isSelected = pk === p.key;
                    return e('button', {
                      key: p.key, type: 'button', role: 'option',
                      'aria-selected': isSelected ? 'true' : 'false',
                      className: 'gp-risk-option' + (isSelected ? ' is-selected' : ''),
                      onClick: function () { if (props.onWhatIf) props.onWhatIf('persona:' + p.key); setRiskOpen(false); },
                      onKeyDown: function (ev) { if (ev.key === 'Escape') setRiskOpen(false); }
                    },
                      e('span', { className: 'gp-risk-option-short' }, t(p.shortKey)),
                      e('span', { className: 'gp-risk-option-title' }, t(p.titleKey))
                    );
                  })
                ) : null
              )
            )
          ),
          // Engine: degen warning + filters + pool grid
          e('div', { className: 'gp-sub-customize-section' },
            isDegenPersona ? e('div', { className: 'gp-degen-warning' },
              t('degenHaircutNote', formatApy(rawApy))
            ) : null,
            chainOptions.length > 1 ? e('div', { className: 'gp-engine-filter-row' },
              e('span', { className: 'gp-engine-filter-label' }, t('engineFilterChain')),
              e('div', { className: 'gp-chips gp-chips-wrap' },
                [{ value: null, label: t('engineAll') }].concat(
                  chainOptions.map(function (c) { return { value: c, label: c }; })
                ).map(function (opt) {
                  var isSelected = poolFilters.chain === opt.value;
                  return e('button', {
                    key: opt.value == null ? '__all__' : opt.value,
                    type: 'button',
                    className: 'gp-chip gp-engine-chip' + (isSelected ? ' is-selected' : ''),
                    onClick: function () { setPoolFilters(function (f) { return Object.assign({}, f, { chain: opt.value }); }); }
                  }, opt.label);
                })
              )
            ) : null,
            tokenOptions.length > 1 ? e('div', { className: 'gp-engine-filter-row' },
              e('span', { className: 'gp-engine-filter-label' }, t('engineFilterToken')),
              e('div', { className: 'gp-chips gp-chips-wrap' },
                [{ value: null, label: t('engineAll') }].concat(
                  tokenOptions.map(function (tok) { return { value: tok, label: tok }; })
                ).map(function (opt) {
                  var isSelected = poolFilters.token === opt.value;
                  return e('button', {
                    key: opt.value == null ? '__all__' : opt.value,
                    type: 'button',
                    className: 'gp-chip gp-engine-chip' + (isSelected ? ' is-selected' : ''),
                    onClick: function () { setPoolFilters(function (f) { return Object.assign({}, f, { token: opt.value }); }); }
                  }, opt.label);
                })
              )
            ) : null,
            curated.length === 0
              ? e('div', { className: 'gp-pools-empty' }, t('noPools'))
              : e('div', { className: 'gp-pool-grid' },
                  curated.map(function (p, slotIdx) {
                    var isSwapOpen = openSwapSlot === slotIdx;
                    var displayedIds = curated.map(function (c) { return c.pool; });
                    var alts = isSwapOpen
                      ? poolAlternatives(pools, persona, {
                          chain: poolFilters.chain || undefined,
                          token: poolFilters.token || undefined
                        }, displayedIds, 5)
                      : [];
                    return e('div', {
                      key: p.pool,
                      className: 'gp-pool-slot' + (isSwapOpen ? ' gp-pool-slot-open' : '')
                    },
                      e('a', {
                        className: 'gp-pool-card', href: '/?pool=' + encodeURIComponent(p.pool),
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
                      ),
                      e('button', {
                        type: 'button',
                        className: 'gp-pool-swap-btn' + (isSwapOpen ? ' is-active' : ''),
                        'aria-label': isSwapOpen ? t('engineSwapClose') : t('engineSwap'),
                        onClick: function (ev) { ev.stopPropagation(); setOpenSwapSlot(isSwapOpen ? null : slotIdx); }
                      }, isSwapOpen ? '×' : t('engineSwap')),
                      isSwapOpen ? e('div', { className: 'gp-swap-panel' },
                        alts.length === 0
                          ? e('div', { className: 'gp-swap-empty' }, t('noPools'))
                          : alts.map(function (alt) {
                              return e('button', {
                                key: alt.pool, type: 'button', className: 'gp-swap-alt',
                                onClick: function () {
                                  setSlotPicks(function (prev) { var next = prev.slice(); next[slotIdx] = alt.pool; return next; });
                                  setOpenSwapSlot(null);
                                }
                              },
                                e('div', { className: 'gp-swap-alt-top' },
                                  e('span', { className: 'gp-swap-alt-symbol' }, alt.symbol),
                                  e('span', { className: 'gp-swap-alt-apy' }, formatApy(poolTotalApy(alt)))
                                ),
                                e('div', { className: 'gp-swap-alt-meta' },
                                  e('span', null, alt.project),
                                  e('span', null, ' · ' + alt.chain)
                                )
                              );
                            })
                      ) : null
                    );
                  })
                )
          )
        ) : null
      );
    })() : null;

    // Ask box element (shared)
    var askElement = e('div', { className: 'gp-ask gp-animate-in' },
      ask.q ? e('div', { className: 'gp-ask-thread' },
        e('div', { className: 'gp-ask-q' }, ask.q),
        ask.thinking ? e(Sprout, null)
          : e('div', { className: 'gp-ask-a' }, ask.a && ask.a.text)
      ) : null,
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
    );

    // Foot element (shared) — share buttons removed (spec 005): the
    // gp-share-prompt card above is now the ONLY share surface in bloom.
    var footElement = e('div', { className: 'gp-bloom-foot gp-animate-in' },
      e('p', { className: 'gp-disclaimer' }, t('disclaimer')),
      e('p', { className: 'gp-press-mention' },
        t('pressFeatureLabel') + ' ',
        e('a', {
          href: 'https://leviathannews.xyz/258992/turn-4k-in-stablecoins-into-a-free-chatgpt-pro-subscription-earn-yield-cover-the-fee-and-keep-every-dollar-with-no-tokens-locked-50-spots-available',
          target: '_blank',
          rel: 'noopener'
        }, t('pressFeatureName'))
      )
    );

    // Build children array conditionally by archetype
    var presetIntro = props.presetName
      ? e('p', { className: 'gp-preset-intro gp-bloom-intro gp-animate-in' }, t('presetIntro', props.presetName))
      : null;

    // Risk-first caveats — always shown, lead before plan content.
    // caveatRates: rates change daily. caveatHack: no protocol is hack-proof (new trust-rail addition).
    var caveatElement = e('div', { className: 'gp-bloom-caveats gp-animate-in' },
      e('p', { className: 'gp-caveat gp-caveat-rates' }, t('caveatRates')),
      e('p', { className: 'gp-caveat gp-caveat-hack' }, t('caveatHack'))
    );

    // --- Waitlist modal ---
    var waitlistMixLabels = selectedSubs.map(function (sid) {
      var found4 = null;
      for (var li5 = 0; li5 < SUBSCRIPTION_LADDER.length; li5++) {
        if (SUBSCRIPTION_LADDER[li5].id === sid) { found4 = SUBSCRIPTION_LADDER[li5]; break; }
      }
      return found4 ? t(found4.labelKey) : sid;
    });
    var waitlistLabelStr = joinBundle(waitlistMixLabels) || goalLabel(t, goal);

    // Email validation for disable logic
    var emailValid = /^\S+@\S+\.\S+$/.test(waitlistEmail);

    // Bet A (backlog 139): the card waitlist's copy ("your garden's yield
    // pays your subscription automatically") only makes sense for the
    // SUBSCRIPTION archetype — the card IS the subscription-paying product.
    // For TARGET/GROWTH the modal is demoted to a secondary "get early
    // access to what's next" ask (see checkoutPanelElement below) and needs
    // its own honest copy that never claims the card pays anything for a
    // one-time purchase or a decades-out goal. Title/aria-label/benefits all
    // branch the same way; SUBSCRIPTION keeps the exact prior call (pitch
    // A/B/C variant included) — zero behavioral change for that archetype.
    var waitlistTitleForModal = archetype === 'subscription' ? t(pitchKey('waitlistTitle')) : t('waitlistTitleEarlyAccess');
    var waitlistBenefitsForModal = archetype === 'subscription'
      ? t(pitchKey('waitlistBenefits'), archetype)
      : t('waitlistBenefitsEarlyAccess');

    var waitlistModal = waitlistOpen ? e('div', {
      className: 'gp-waitlist-backdrop',
      onClick: function (ev) { if (ev.target === ev.currentTarget) setWaitlistOpen(false); },
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': waitlistTitleForModal
    },
      e('div', { className: 'gp-waitlist-card' },
        // Close button
        e('button', {
          type: 'button',
          className: 'gp-waitlist-close',
          onClick: function () { setWaitlistOpen(false); },
          'aria-label': t('waitlistClose')
        }, '✕'),

        waitlistStep === 1
          // --- Step 1: benefits + email ---
          ? e('div', { className: 'gp-waitlist-body' },
              e('div', { className: 'gp-waitlist-step-row' },
                e('h2', { className: 'gp-waitlist-title' }, waitlistTitleForModal),
                e('span', { className: 'gp-waitlist-step' }, t('waitlistStepLabel', 1))
              ),
              e('p', { className: 'gp-waitlist-benefits' }, waitlistBenefitsForModal),
              archetype === 'subscription' && currentMixStats.count > 0
                ? e('p', { className: 'gp-waitlist-garden-line' },
                    t('waitlistGarden', waitlistLabelStr, formatUsd(currentMixStats.combinedMonthly))
                  )
                : null,
              e('form', { className: 'gp-waitlist-form', onSubmit: submitWaitlist },
                e('input', {
                  type: 'email',
                  className: 'gp-waitlist-email-input',
                  placeholder: t('waitlistEmailPlaceholder'),
                  value: waitlistEmail,
                  required: true,
                  autoFocus: true,
                  onChange: function (ev) {
                    if (!waitlistEmailEnteredRef.current) {
                      waitlistEmailEnteredRef.current = true;
                      if (typeof Analytics !== 'undefined') {
                        Analytics.trackWaitlistEmailEntered({ goal: goal, persona: persona, archetype: archetype, pitchVariant: PITCH_VARIANT });
                      }
                    }
                    setWaitlistEmail(ev.target.value);
                    setWaitlistStatus('idle');
                  }
                }),
                e('p', { className: 'gp-waitlist-nospam' }, t('waitlistNoSpam')),
                waitlistStatus === 'error'
                  ? e('p', { className: 'gp-waitlist-error' }, t('waitlistError'))
                  : null,
                e('button', {
                  type: 'submit',
                  className: 'gp-waitlist-submit' + (!emailValid ? ' is-disabled' : ''),
                  disabled: waitlistStatus === 'submitting' || !emailValid
                },
                  waitlistStatus === 'submitting' ? '…' : t('waitlistJoin')
                )
              )
            )
          // --- Step 2: accepted + share ---
          : e('div', { className: 'gp-waitlist-body' },
              e('div', { className: 'gp-waitlist-step-row' },
                e('h2', { className: 'gp-waitlist-title' }, t('waitlistAccepted')),
                e('span', { className: 'gp-waitlist-step' }, t('waitlistStepLabel', 2))
              ),
              e('p', { className: 'gp-waitlist-next-steps' }, t('waitlistNextSteps')),

              e('p', { className: 'gp-waitlist-jump-line' }, t('waitlistJumpLine')),

              // Share actions — primary (Share on X) first, secondary (Download) second
              e('div', { className: 'gp-waitlist-share-row' },
                e('button', {
                  type: 'button',
                  className: 'gp-waitlist-action-btn gp-waitlist-share-primary',
                  onClick: doWaitlistShare
                }, t('shareOnX')),
                e('button', {
                  type: 'button',
                  className: 'gp-waitlist-action-btn',
                  onClick: doWaitlistDownload
                }, t('downloadCard'))
              )
            )
      )
    ) : null;

    // Checkout summary panel — price-anchor layout (right column desktop, first mobile)
    var checkoutGoalDef = goalById(goal);
    // Service name: reactive to selectedSubs for subscription
    var chkServiceEmoji, chkServiceName;
    if (archetype === 'subscription') {
      var chkLdr = subscriptionLadder(goal);
      if (currentMixStats && currentMixStats.count >= 1) {
        var chkLabels = currentMixStats.ids.map(function (id) {
          for (var ci = 0; ci < chkLdr.length; ci++) {
            if (chkLdr[ci].id === id) return t(chkLdr[ci].labelKey);
          }
          var cg = goalById(id);
          return cg ? goalLabel(t, id) : id;
        });
        chkServiceName = chkLabels.length > 2
          ? chkLabels[0] + ' + ' + chkLabels[1] + ' +' + (chkLabels.length - 2)
          : chkLabels.join(' + ');
        chkServiceEmoji = currentMixStats.count > 1 ? '∞' : (checkoutGoalDef ? checkoutGoalDef.emoji : '🌱');
      } else {
        chkServiceName = goalLabel(t, goal);
        chkServiceEmoji = checkoutGoalDef ? checkoutGoalDef.emoji : '🌱';
      }
    } else {
      chkServiceName = goalLabel(t, goal);
      chkServiceEmoji = checkoutGoalDef ? checkoutGoalDef.emoji : '🌱';
    }
    var chkIsCapital = checkoutMode === 'capital';
    var chkBaseCapital = archetype === 'subscription'
      ? (isCapitalPath ? slideCapital : (currentMixStats && currentMixStats.neededCapital > 0 ? currentMixStats.neededCapital : slideCapital))
      : slideCapital;
    var chkPrice, chkValueProp, chkDetailRows;
    if (chkIsCapital) {
      var chkYield = chkBaseCapital && apy > 0 ? Math.round(chkBaseCapital * apy / 100 / 12) : null;
      chkPrice = chkBaseCapital ? formatUsdRounded(chkBaseCapital) : '—';
      chkValueProp = chkYield ? t('checkoutHeroSub', formatUsd(chkYield)) : null;
      chkDetailRows = [
        { label: t('checkoutApy'), value: apy > 0 ? formatApy(apy) : '—' },
        { label: t('checkoutYouKeep'), value: t('checkoutYouKeepVal') }
      ];
    } else {
      var chkMo = slideMonthly || Math.max(50, Math.round((chkBaseCapital || 5000) / 60));
      var chkMonthlyFv = futureValue(chkMo, apy || 5, slideYears || 3);
      chkPrice = formatUsd(chkMo) + '/mo';
      chkValueProp = t('checkoutHeroGrowth', formatUsdRounded(chkMonthlyFv), slideYears || 3);
      chkDetailRows = [
        { label: t('checkoutApy'), value: apy > 0 ? formatApy(apy) : '—' },
        { label: t('checkoutTimeline'), value: (slideYears || 3) + ' ' + t('yearsShort') }
      ];
    }

    function openCheckoutWaitlist() {
      setWaitlistStep(1);
      setWaitlistStatus('idle');
      setWaitlistOpen(true);
      waitlistEmailEnteredRef.current = false;
      if (typeof Analytics !== 'undefined') {
        Analytics.trackWaitlistOpened({ goal: goal, persona: persona, archetype: archetype, source: source, pitchVariant: PITCH_VARIANT });
      }
    }

    // Bet A (backlog 139, docs/strategy-2026-07-23-pretraffic-bets.md §3):
    // the card waitlist is the right ending ONLY for SUBSCRIPTION (the card
    // pays a recurring bill from yield — it IS the business model, 2026-07-12
    // standing decision, unchanged here). For TARGET/GROWTH the terminal CTA
    // was previously the SAME waitlist with subscription-only copy — goal-
    // incoherent for a retirement/iPhone/sneakers plan. Route those instead
    // to the plan's top curated pool (spec v2 §4.4, never implemented until
    // now) — the same pool data the Engine-room cards below already show
    // (curated[0], highest-preference/APY after trust rails), deep-linking
    // into PoolDetail, which is also the north-star CTA surface. Falls back
    // to the waitlist-primary layout whenever no pool is curated yet
    // (loading/empty) — never a dead pool link.
    var checkoutTopPool = (curated && curated.length > 0) ? curated[0] : null;
    var checkoutPoolPrimary = archetype !== 'subscription' && !!checkoutTopPool;

    function handleCheckoutPoolClick() {
      if (typeof Analytics !== 'undefined' && checkoutTopPool) {
        Analytics.trackPoolClick(checkoutTopPool, 'plan_checkout', { archetype: archetype });
      }
    }

    var checkoutPanelElement = e('div', { className: 'gp-checkout-panel gp-animate-in' },
      e('div', { className: 'gp-checkout-service' },
        e('span', { className: 'gp-checkout-svc-emoji' }, chkServiceEmoji),
        e('span', { className: 'gp-checkout-svc-name' }, chkServiceName)
      ),
      e('div', { className: 'gp-checkout-price-block' },
        e('div', { className: 'gp-checkout-price' }, chkPrice),
        e('div', { className: 'gp-checkout-mode-toggle' },
          e('button', {
            type: 'button',
            className: 'gp-checkout-mode-btn' + (checkoutMode === 'capital' ? ' is-active' : ''),
            onClick: function () { setCheckoutMode('capital'); }
          }, t('checkoutModeOneTime')),
          e('button', {
            type: 'button',
            className: 'gp-checkout-mode-btn' + (checkoutMode === 'monthly' ? ' is-active' : ''),
            onClick: function () { setCheckoutMode('monthly'); }
          }, t('checkoutModeMonthly'))
        )
      ),
      chkValueProp ? e('p', { className: 'gp-checkout-value-prop' }, chkValueProp) : null,
      e('div', { className: 'gp-checkout-detail-rows' },
        chkDetailRows.map(function (row, idx) {
          return e('div', { key: idx, className: 'gp-checkout-detail-row' },
            e('span', { className: 'gp-checkout-detail-label' }, row.label),
            e('span', { className: 'gp-checkout-detail-value' }, row.value)
          );
        })
      ),
      checkoutPoolPrimary
        ? e('a', {
            className: 'gp-primary-cta gp-checkout-cta',
            href: '/?pool=' + encodeURIComponent(checkoutTopPool.pool),
            rel: 'noopener',
            onClick: handleCheckoutPoolClick
          }, t('startGrowingCta', checkoutTopPool.project))
        : e('button', {
            type: 'button',
            className: 'gp-primary-cta gp-checkout-cta',
            onClick: openCheckoutWaitlist
          }, t('ctaWaitlist')),
      e('p', { className: 'gp-cta-microcopy' },
        checkoutPoolPrimary ? t('startGrowingCtaMicro') : t('ctaWaitlistMicro')
      ),
      checkoutPoolPrimary
        ? e('button', {
            type: 'button',
            className: 'gp-share-textlink gp-checkout-waitlist-secondary',
            onClick: openCheckoutWaitlist
          }, t('ctaWaitlistSecondary'))
        : null,
      e('div', { className: 'gp-checkout-trust' },
        e('span', { className: 'gp-trust-pill' }, '✓ ' + t('trustSelfCustody')),
        e('span', { className: 'gp-trust-pill' }, '✓ ' + t('trustYourKeys')),
        e('span', { className: 'gp-trust-pill' }, '✓ ' + t('trustWithdraw'))
      ),
      e('p', { className: 'gp-checkout-note' }, t('checkoutNote'))
    );

    // Share prompt — the ONLY share surface at the bloom moment (spec 005;
    // originated as an additive card in spec 004). Reversed by spec 024
    // (standing decision 2026-07-11): the working link is the primary
    // artifact — it's the one that reproduces the sender's exact garden on
    // open and can close the share_link_opened -> plan_created loop. Primary
    // button triggers the native share sheet (doNativeShare) where available,
    // else clipboard copy (doCopyLink); the image (doShare) is demoted to a
    // text link. Handlers themselves are unchanged from spec 008.
    var linkPrimaryLabel = navigator.share
      ? t('shareLinkPrimaryNative')
      : (copySuccess ? ('✓ ' + t('shareLinkCopied')) : t('shareLinkPrimaryCta'));
    var linkPrimaryHandler = navigator.share ? doNativeShare : doCopyLink;
    // Hook-model trigger leg (spec 115): honest, self-service monthly reminder.
    function doTendReminder() {
      var url = encodePlanToUrl(goal, monthly, years, persona, props.capital, props.fundingMode, props.deadline, poolFilters, selectedSubs);
      downloadTendReminder(url, t('tendReminderTitle'), t('tendReminderDesc'));
      if (typeof Analytics !== 'undefined') {
        Analytics.trackTendReminderAdded({ surface: 'bloom', goal: goal, persona: persona });
      }
    }
    var sharePromptElement = e('div', { className: 'gp-share-prompt gp-animate-in' },
      e('p', { className: 'gp-share-prompt-text' }, t('sharePromptHeadline')),
      e('button', {
        type: 'button', className: 'gp-share-btn gp-share-prompt-btn', onClick: linkPrimaryHandler
      }, linkPrimaryLabel),
      e('button', {
        type: 'button', className: 'gp-share-textlink', onClick: doShare, disabled: isSharing
      },
        isSharing ? t('sharePrepping') : (imageShareConfirm ? ('✓ ' + t('shareImageSaved')) : t('shareTextLinkImage'))),
      e('button', {
        type: 'button', className: 'gp-share-textlink gp-tend-reminder', onClick: doTendReminder
      }, t('tendReminderCta')),
      e('p', { className: 'gp-tend-reminder-note' }, t('tendReminderNote'))
    );

    if (archetype === 'subscription') {
      return e('div', { className: 'gp-bloom' },
        presetIntro,
        e('div', { className: 'gp-bloom-layout' },
          e('div', { className: 'gp-bloom-checkout' }, checkoutPanelElement, sharePromptElement),
          e('div', { className: 'gp-bloom-detail' },
            heroElement, planConfidenceElement, planCardElement, subCustomizeElement, askElement, caveatElement
          )
        ),
        footElement,
        waitlistModal
      );
    }

    // Target / Growth: 2-col layout
    return e('div', { className: 'gp-bloom' },
      presetIntro,
      e('div', { className: 'gp-bloom-layout' },
        e('div', { className: 'gp-bloom-checkout' }, checkoutPanelElement, sharePromptElement),
        e('div', { className: 'gp-bloom-detail' },

      // 1. HERO ANSWER
      heroElement,
      planConfidenceElement,

      // Editable plan summary strip
      e('div', { className: 'gp-plan-strip gp-animate-in' },
        e('span', { className: 'gp-strip-item', onClick: props.onEditGoal, role: 'button', tabIndex: 0,
          onKeyDown: function(ev){ if(ev.key==='Enter') props.onEditGoal && props.onEditGoal(); } },
          (goalDef ? goalDef.emoji : '🌱') + ' ' + goalLabel(t, goal)
        ),
        e('span', { className: 'gp-strip-sep' }, '·'),
        e('span', { className: 'gp-strip-item', onClick: props.onEditMonthly, role: 'button', tabIndex: 0,
          onKeyDown: function(ev){ if(ev.key==='Enter') props.onEditMonthly && props.onEditMonthly(); } },
          isCapitalPath ? t('stripCapital', formatUsdRounded(slideCapital)) : formatUsd(monthly) + '/mo'
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

      // 1b. v3 — persona ladder (capital path TARGET, always visible)
      (archetype === 'target' && isCapitalPath && ladderDates && (!propDeadline || deadlineFeasible))
        ? renderPersonaLadder() : null,

      // 1c. v3 — item fill progress + tangibility (capital path TARGET)
      (archetype === 'target' && isCapitalPath) ? e('div', { className: 'gp-item-fill gp-animate-in' },
        e('div', { className: 'gp-item-fill-bar' },
          e('div', { className: 'gp-item-fill-inner', style: { width: (itemFillPct || 0) + '%' } })
        ),
        e('div', { className: 'gp-item-fill-label' },
          (goalDef ? goalDef.emoji + ' ' : '') + (itemFillPct > 0 ? itemFillPct + '% grown' : '🌱 just planted')
        )
      ) : null,
      (archetype === 'target' && isCapitalPath && dailyYieldAmt > 0) ? e('div', { className: 'gp-tangibility gp-animate-in' },
        t('tangibilityLine', formatUsd(dailyYieldAmt, 2), t('tangibilityCoffee'))
      ) : null,

      // 1d. v3 — scale-matched comparisons (TARGET only)
      (archetype === 'target') ? e('div', { className: 'gp-comparison gp-animate-in' },
        targetAmt ? e('p', null, t('comparisonCreditCard', goalLabel(t, goal), formatUsdRounded(targetAmt * (1 + 0.24 / 2 * (12 + 1) / 12)))) : null,
        (isCapitalPath && ladderDates && monthsFromNow(ladderDates[pk]))
          ? e('p', null, t('comparisonMoneyGone', formatUsdRounded(targetAmt), monthsFromNow(ladderDates[pk]), goalLabel(t, goal)))
          : null,
        (isCapitalPath && targetAmt) ? (function () {
          var goalScaled = Math.max(25, Math.round(targetAmt / 20));
          var sd = disciplinedSpeedup({ capital: slideCapital, monthly: goalScaled, annualRatePct: apy, target: targetAmt });
          return (sd.monthsSooner > 0)
            ? e('p', { className: 'gp-comparison-speedup' }, t('speedupDisciplined', formatUsd(goalScaled), sd.monthsSooner))
            : null;
        })() : null
      ) : null,

      // 2. INTERACTIVE CHART (hidden for capital-funded target — no monthly contribution to chart)
      !isCapitalPath ? e('div', { className: 'gp-curve-wrap gp-animate-in' },
        e(GrowthCurve, {
          monthly: slideMonthly, years: slideYears, apy: apy,
          target: archetype === 'target' ? targetAmt : null,
          forever: null,
          ariaLabel: t('bloomCurveYou')
        }),
        e('div', { className: 'gp-legend' },
          e('span', { className: 'gp-legend-item gp-legend-you' }, e('i', null), t('bloomCurveYou')),
          e('span', { className: 'gp-legend-item gp-legend-bank' }, e('i', null), t('bloomCurveBank'))
        )
      ) : null,

      // 3. MAKE-IT-YOURS — sliders + persona pills (collapsed by default)
      e('div', { className: 'gp-makeit gp-animate-in' },
        !makeitExpanded
          ? e('button', { type: 'button', className: 'gp-makeit-compact',
              onClick: function () { setMakeitExpanded(true); }
            },
              e('span', { className: 'gp-makeit-compact-label' }, t('makeItYours')),
              e('span', { className: 'gp-makeit-compact-summary' },
                (isCapitalPath ? formatUsdRounded(slideCapital) : formatUsd(slideMonthly) + '/mo')
                + (archetype === 'growth' ? ' · ' + slideYears + ' yrs' : '')
                + ' · ' + currentRiskLabel
              ),
              e('span', { className: 'gp-makeit-edit-link' }, t('riskEdit'))
            )
          : e('div', null,
            e('div', { className: 'gp-makeit-label' }, t('makeItYours')),
            e('div', { className: 'gp-makeit-sliders' },
          isCapitalPath ? e('div', { className: 'gp-slider-group' },
            e('div', { className: 'gp-slider-row-label' },
              e('span', null, t('fundingCapitalCard')),
              e('span', { className: 'gp-slider-live-val' }, formatUsdRounded(slideCapital))
            ),
            e('input', {
              type: 'range',
              min: 1000, max: capitalSliderMax, step: capitalSliderMax > 50000 ? 1000 : 500,
              className: 'gp-slider',
              value: slideCapital,
              'aria-label': 'Capital',
              onChange: function(ev) { setSlideCapital(parseInt(ev.target.value, 10)); }
            })
          ) : e('div', { className: 'gp-slider-group' },
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
        e('div', { className: 'gp-persona-pills' },
          [
            { key: 'stable', shortKey: 'personaStableShort', titleKey: 'personaStableTitle' },
            { key: 'rwa',    shortKey: 'personaRwaShort',    titleKey: 'personaRwaTitle' },
            { key: 'degen',  shortKey: 'personaDegenShort',  titleKey: 'personaDegenTitle' }
          ].map(function(p) {
            return e('button', {
              key: p.key, type: 'button',
              className: 'gp-persona-pill' + (pk === p.key ? ' is-selected' : ''),
              onClick: function() { if (props.onWhatIf) props.onWhatIf('persona:' + p.key); }
            },
              e('span', { className: 'gp-persona-pill-short' }, t(p.shortKey)),
              e('span', { className: 'gp-persona-pill-sub' }, t(p.titleKey))
            );
          })
        )
          ) // close expanded div
        ),

      // 4. ENGINE ROOM
      engineElement,

      // 5. ASK BOX
      askElement,
      caveatElement
        ) // close gp-bloom-detail
      ), // close gp-bloom-layout
      footElement,
      waitlistModal
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

      if (opts.drawChart) {
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
      }

      ctx.textBaseline = 'alphabetic';
      ctx.font = '600 34px "Satoshi", system-ui, -apple-system, sans-serif';
      // Row-1 icon: draw the featured service's real bundled mark (local vector data,
      // never a network fetch — canvas stays untainted) when we have one; otherwise
      // fall back to its emoji, then the generic sprout. A draw failure (missing/
      // malformed asset) must never throw — it just falls through to the emoji path.
      var rowIconSize = 34, rowIconX = 110, rowTextX = rowIconX;
      var brandMark = (opts.brandIcon && window.BRAND_ICONS) ? window.BRAND_ICONS[opts.brandIcon] : null;
      if (brandMark) {
        try {
          var markPath = new Path2D(brandMark.path);
          ctx.save();
          ctx.translate(rowIconX, 170 - rowIconSize + 4);
          ctx.scale(rowIconSize / brandMark.vbW, rowIconSize / brandMark.vbH);
          ctx.fillStyle = brandMark.color;
          ctx.fill(markPath);
          ctx.restore();
          rowTextX = rowIconX + rowIconSize + 12;
        } catch (markErr) {
          brandMark = null;
        }
      }
      var rowLabel = brandMark ? (opts.goalLabel || '') : ((opts.brandEmoji || '🌱') + ' ' + (opts.goalLabel || ''));
      ctx.fillStyle = '#0F172A';
      ctx.fillText(rowLabel, rowTextX, 170);

      // Headline: fit to card width; wrap to 2 lines if needed, or step down font
      ctx.font = '700 72px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#1E40AF';
      var availW = W - 220;
      var headline = opts.headline || '';
      var headlineWrapped = false;
      if (ctx.measureText(headline).width <= availW) {
        ctx.fillText(headline, 110, 270);
      } else {
        // Try to split on spaces into two lines
        var words = headline.split(' ');
        var line1 = '', line2 = '';
        var splitFound = false;
        for (var wi = 1; wi < words.length; wi++) {
          var candidate = words.slice(0, wi).join(' ');
          var rest = words.slice(wi).join(' ');
          if (ctx.measureText(candidate).width <= availW && ctx.measureText(rest).width <= availW) {
            line1 = candidate; line2 = rest; splitFound = true;
          }
        }
        if (splitFound && line2) {
          ctx.fillText(line1, 110, 248);
          ctx.fillText(line2, 110, 320);
          headlineWrapped = true;
        } else {
          // Step font down until it fits
          var fsize = 72;
          while (fsize > 28 && ctx.measureText(headline).width > availW) {
            fsize -= 4;
            ctx.font = '700 ' + fsize + 'px "Satoshi", system-ui, -apple-system, sans-serif';
          }
          ctx.fillText(headline, 110, 270);
        }
      }

      // Subline y offset: if headline was wrapped, push subline down to avoid collision
      var sublineY = headlineWrapped ? 360 : 322;
      ctx.font = '500 30px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(opts.subline || '', 110, sublineY);
      ctx.font = '700 30px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#3B82F6';
      ctx.textAlign = 'right';
      ctx.fillText('defi.garden 🌱', W - 110, H - 100);
      ctx.textAlign = 'left';
      ctx.font = '400 20px "Satoshi", system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(opts.footer || '', 110, H - 100);

      try {
        c.toBlob(function (blob) {
          if (!blob) { resolve(); return; }

          function downloadImage() {
            var objectUrl = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = objectUrl; a.download = 'my-defi-garden.png';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
          }

          // No plan URL supplied (e.g. the waitlist card download) — unchanged
          // pre-005 behavior: just deliver the image.
          if (!opts.url) {
            downloadImage();
            resolve();
            return;
          }

          // Spec 005: the image path must also move the plan URL off the device.
          var shareFile = null, canShareFiles = false;
          try {
            shareFile = new File([blob], 'my-defi-garden.png', { type: 'image/png' });
            canShareFiles = !!(navigator.share && typeof navigator.canShare === 'function' &&
              navigator.canShare({ files: [shareFile] }));
          } catch (fileErr) { canShareFiles = false; }

          if (canShareFiles) {
            // navigator.share() can throw synchronously (not just reject) for
            // an unshareable payload — guard so the promise always settles
            // and the button never gets stuck disabled ("Drawing…").
            try {
              navigator.share({
                files: [shareFile], url: opts.url, title: 'My DeFi Garden',
                text: opts.shareText || opts.headline || ''
              }).then(function () {
                resolve({ linkAttached: true, method: 'native' });
              }).catch(function () {
                resolve({ linkAttached: false, method: 'native' });
              });
            } catch (shareErr) {
              resolve({ linkAttached: false, method: 'native' });
            }
            return;
          }

          // No native file-share support: the image download IS the delivery;
          // copy the plan URL to the clipboard so the link travels too.
          downloadImage();
          try {
            navigator.clipboard.writeText(opts.url).then(function () {
              resolve({ linkAttached: true, method: 'download' });
            }).catch(function () {
              try {
                var ta = document.createElement('textarea');
                ta.value = opts.url;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve({ linkAttached: true, method: 'download' });
              } catch (fallbackErr) {
                resolve({ linkAttached: false, method: 'download' });
              }
            });
          } catch (copyErr) {
            resolve({ linkAttached: false, method: 'download' });
          }
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
  // ReportJourney — 2-row vertical stepper (Planted → Growing now)
  // The is-next hero row has been removed; outcome lives in the projection block.
  // ===========================================================================
  function ReportJourney(props) {
    var t = props.t;
    var plan = props.plan;
    var poolsReady = props.poolsReady;
    var newBlended = props.newBlended;

    var dateStr = '';
    try { dateStr = new Date(plan.savedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
    catch (e11) { dateStr = ''; }

    var deltaApy = (props.savedBlended != null && newBlended != null) ? (newBlended - props.savedBlended) : 0;
    var statusSubLine;
    if (!poolsReady) {
      statusSubLine = t('reportUpdating');
    } else if (Math.abs(deltaApy) <= 0.05) {
      statusSubLine = t('journeyHolding');
    } else {
      statusSubLine = t('journeyMoved', (deltaApy >= 0 ? '+' : '') + formatApy(deltaApy));
    }

    return e('div', { className: 'gp-journey' },
      e('div', { className: 'gp-journey-row is-done' },
        e('div', { className: 'gp-journey-marker' }, '✓'),
        e('div', { className: 'gp-journey-content' },
          e('div', { className: 'gp-journey-label' }, '🌱 ' + t('journeyPlanted', dateStr))
        )
      ),
      e('div', { className: 'gp-journey-row is-active' },
        e('div', { className: 'gp-journey-marker gp-journey-pulse' }, '🌿'),
        e('div', { className: 'gp-journey-content' },
          e('div', { className: 'gp-journey-label' }, t('journeyGrowing')),
          e('div', { className: 'gp-journey-status' }, statusSubLine)
        )
      )
    );
  }

  // ===========================================================================
  // Garden Report (return visit) — genuine dashboard with elapsed + progress
  // ===========================================================================
  function GardenReport(props) {
    var t = props.t, plan = props.plan, pools = props.pools, poolsReady = props.poolsReady;

    // Hook-model trigger leg (spec 115): re-arm the honest monthly reminder from
    // the return-visit dashboard. URL rebuilt from the saved plan's fields.
    function reportTendReminder() {
      var url = encodePlanToUrl(plan.goal, plan.monthly, plan.years, plan.persona, plan.capital, plan.fundingMode, plan.deadline, plan.poolFilters, plan.mix);
      downloadTendReminder(url, t('tendReminderTitle'), t('tendReminderDesc'));
      if (typeof Analytics !== 'undefined') {
        Analytics.trackTendReminderAdded({ surface: 'report', goal: plan.goal, persona: plan.persona });
      }
    }

    // Viral-loop closure (spec 116): re-share the garden from report mode — the
    // return-visit high-intent moment. Copies the same rebuild link (identical
    // encodePlanToUrl args to reportTendReminder) via the doCopyLink pattern.
    var reportShareCopiedState = useState(false);
    var reportShareCopied = reportShareCopiedState[0];
    var setReportShareCopied = reportShareCopiedState[1];
    function reportShareLink() {
      var url = encodePlanToUrl(plan.goal, plan.monthly, plan.years, plan.persona, plan.capital, plan.fundingMode, plan.deadline, plan.poolFilters, plan.mix);
      if (typeof Analytics !== 'undefined') {
        Analytics.trackShareLinkCreated({ method: 'copy', surface: 'report', goal: plan.goal, persona: plan.persona });
      }
      try {
        navigator.clipboard.writeText(url).then(function() {
          setReportShareCopied(true);
          setTimeout(function() { setReportShareCopied(false); }, 2000);
        }).catch(function() {
          // fallback
          var ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          setReportShareCopied(true);
          setTimeout(function() { setReportShareCopied(false); }, 2000);
        });
      } catch(err) {}
    }

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

    // Apply degen haircut if applicable
    var personaKey = TEMPERAMENT_TO_PERSONA[plan.temperament] || plan.persona;
    var newEffective = personaKey === 'degen' ? newBlended / 3 : newBlended;

    var newProjection = futureValue(plan.monthly, newEffective, plan.years) + capitalGrowth(plan.capital, newEffective, plan.years);

    // Derive archetype from persisted field or recompute from goal
    var arch = plan.archetype || goalArchetype(plan.goal);

    // Archetype-aware status pill
    var status, statusClass;
    if (!poolsReady) {
      status = t('reportUpdating'); statusClass = 'is-ontrack';
    } else if (arch === 'growth') {
      if (newProjection > (plan.projection || 0) * 1.02) { status = t('reportAhead'); statusClass = 'is-ahead'; }
      else if (newProjection < (plan.projection || 0) * 0.98) { status = t('reportDipped'); statusClass = 'is-dipped'; }
      else { status = t('reportOnTrack'); statusClass = 'is-ontrack'; }
    } else if (arch === 'target') {
      var heroMonths = plan.hero && plan.hero.months != null ? plan.hero.months : null;
      var curM;
      if (plan.capital && plan.fundingMode === 'capital') {
        curM = monthsUntilYieldCoversTarget(plan.capital, newEffective, plan.target);
      } else {
        curM = timeToTarget(plan.target, plan.monthly, newEffective);
      }
      if (heroMonths != null && isFinite(curM)) {
        if (curM + 0.5 < heroMonths) { status = t('reportAhead'); statusClass = 'is-ahead'; }
        else if (curM - 0.5 > heroMonths) { status = t('reportDipped'); statusClass = 'is-dipped'; }
        else { status = t('reportOnTrack'); statusClass = 'is-ontrack'; }
      } else { status = t('reportOnTrack'); statusClass = 'is-ontrack'; }
    } else if (arch === 'subscription') {
      var heroForever = plan.hero && plan.hero.foreverAmt != null ? plan.hero.foreverAmt : null;
      var curFn = foreverNumber(plan.target || 20, newEffective);
      if (heroForever != null && isFinite(curFn) && isFinite(heroForever)) {
        if (curFn < heroForever) { status = t('reportAhead'); statusClass = 'is-ahead'; }
        else if (curFn > heroForever) { status = t('reportDipped'); statusClass = 'is-dipped'; }
        else { status = t('reportOnTrack'); statusClass = 'is-ontrack'; }
      } else { status = t('reportOnTrack'); statusClass = 'is-ontrack'; }
    } else {
      status = t('reportOnTrack'); statusClass = 'is-ontrack';
    }

    var dateStr = '';
    try { dateStr = new Date(plan.savedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e7) { dateStr = plan.savedAt || ''; }

    var stage = gardenStage(plan);

    // Plan summary strip pieces
    var onEdit = props.onEdit;
    var stripGoalDef = goalById(plan.goal);
    var stripGoal = (stripGoalDef ? stripGoalDef.emoji + ' ' : '') + goalLabel(t, plan.goal);
    var stripFunding = (plan.fundingMode === 'capital' && plan.capital)
      ? t('stripCapital', formatUsdRounded(plan.capital))
      : (plan.monthly ? formatUsd(plan.monthly) + '/mo' : null);
    var planPkName = personaKey === 'stable' ? t('personaStableTitle')
      : (personaKey === 'rwa' ? t('personaRwaTitle')
        : (personaKey === 'degen' ? t('personaDegenTitle') : ''));

    // --- Dashboard: elapsed time + estimated growth ---
    var stats = reportStats(plan, newEffective, new Date().toISOString());
    var elapsedBlock = stats.days > 0
      ? e('div', { className: 'gp-report-elapsed' },
          e('span', { className: 'gp-report-elapsed-days' }, t('reportElapsedDays', stats.days)),
          stats.earnedEstimate > 0.005
            ? e('span', { className: 'gp-report-elapsed-sep' }, ' · ')
            : null,
          stats.earnedEstimate > 0.005
            ? e('span', { className: 'gp-report-earned-est' }, t('reportEarnedEst', formatUsdRounded(stats.earnedEstimate)))
            : null
        )
      : null;

    // --- Dashboard: archetype-aware progress / what's next ---
    var progressBlock = null;
    var repBundle = null;
    if (arch === 'subscription') {
      repBundle = coveredBundle(plan.capital || null, newEffective, plan.goal);
      var repCovered = repBundle.covered;
      var repNextRung = repBundle.nextRung;
      var repCoveredLabels = repCovered.map(function (r) { return r.emoji + ' ' + t(r.labelKey); }).join(', ');
      progressBlock = e('div', { className: 'gp-report-progress' },
        repCovered.length > 0
          ? e('div', { className: 'gp-report-progress-covers' }, t('reportCovers', repCoveredLabels))
          : null,
        repNextRung
          ? (repCovered.length === 0 && repBundle.nextPct > 0
              ? e('div', { className: 'gp-report-progress-next' },
                  t('reportNextPct', repBundle.nextPct, repNextRung.emoji + ' ' + t(repNextRung.labelKey)))
              : e('div', { className: 'gp-report-progress-next' },
                  t('reportNext', repNextRung.emoji + ' ' + t(repNextRung.labelKey),
                    isFinite(repNextRung.foreverAmt) ? formatUsdRounded(repNextRung.foreverAmt) : '—'))
            )
          : null
      );
    }

    // Build archetype-aware projection block (headline outcome — appears once here only)
    var projectionBlock;
    if (arch === 'growth') {
      projectionBlock = e('div', { className: 'gp-report-projection' },
        e('div', { className: 'gp-report-now' }, t('reportProjectionNow', formatUsdRounded(newProjection))),
        e('div', { className: 'gp-report-was' }, t('reportProjectionWas', formatUsdRounded(plan.projection)))
      );
    } else if (arch === 'target' && plan.capital && plan.fundingMode === 'capital') {
      var mFlip = monthsUntilYieldCoversTarget(plan.capital, newEffective, plan.target);
      projectionBlock = e('div', { className: 'gp-report-projection' },
        e('div', { className: 'gp-report-now' }, t('heroTargetFlip', formatUsdRounded(plan.capital), goalLabel(t, plan.goal), monthsFromNow(mFlip) || '—')),
        e('div', { className: 'gp-report-was' }, t('heroTargetFlipKeep', formatUsdRounded(plan.capital)))
      );
    } else if (arch === 'target') {
      var mTarget = timeToTarget(plan.target, plan.monthly, newEffective);
      projectionBlock = e('div', { className: 'gp-report-projection' },
        e('div', { className: 'gp-report-now' }, t('heroTarget', goalLabel(t, plan.goal), monthsFromNow(mTarget) || '—'))
      );
    } else if (arch === 'subscription') {
      // Use plan.mix (new field) when present, else fall back to coveredBundle path
      if (plan.mix && Array.isArray(plan.mix) && plan.mix.length > 0) {
        var repMix = mixStats(plan.mix, newEffective);
        var repMixItems = subscriptionLadder(plan.goal);
        var repMixLabels = repMix.ids.map(function (id) {
          for (var rli = 0; rli < repMixItems.length; rli++) {
            if (repMixItems[rli].id === id) return repMixItems[rli].emoji + ' ' + t(repMixItems[rli].labelKey);
          }
          var rmg = goalById(id);
          return rmg ? rmg.emoji + ' ' + t(rmg.labelKey) : id;
        });
        projectionBlock = e('div', { className: 'gp-report-projection' },
          e('div', { className: 'gp-report-now' },
            t('reportCovers', repMixLabels.join(', '))
          ),
          repMix.neededCapital > 0
            ? e('div', { className: 'gp-report-was' },
                t('mixTotal', formatUsdRounded(repMix.neededCapital), formatUsd(repMix.combinedMonthly))
              )
            : null
        );
      } else {
        // Older plans without mix field — use coveredBundle path
        var repB = repBundle || coveredBundle(plan.capital || null, newEffective, plan.goal);
        var repNowLine;
        if (repB.coveredCount >= 1) {
          var repBundleLabels = repB.covered.map(function (r) { return t(r.labelKey); });
          repNowLine = t('subHeroWinBundle', joinBundle(repBundleLabels));
        } else {
          var repAnchorPct = repB.nextPct || 0;
          repNowLine = t('subHeroProgress', repAnchorPct, goalLabel(t, plan.goal));
        }
        var repAnchorForever = repB.nextRung ? repB.nextRung.foreverAmt
          : (repB.covered.length > 0 ? repB.covered[0].foreverAmt : null);
        projectionBlock = e('div', { className: 'gp-report-projection' },
          e('div', { className: 'gp-report-now' }, repNowLine),
          (repAnchorForever && isFinite(repAnchorForever))
            ? e('div', { className: 'gp-report-was' }, formatUsdRounded(repAnchorForever) + ' plants it forever')
            : null
        );
      }
    } else {
      projectionBlock = e('div', { className: 'gp-report-projection' },
        e('div', { className: 'gp-report-now' }, t('reportProjectionNow', formatUsdRounded(newProjection))),
        e('div', { className: 'gp-report-was' }, t('reportProjectionWas', formatUsdRounded(plan.projection)))
      );
    }

    return e('div', { className: 'gp-report gp-animate-in' },
      e('div', { className: 'gp-report-head' },
        e('div', { className: 'gp-report-emoji' }, stage.emoji),
        e('h2', { className: 'gp-report-title' }, t('reportSince', dateStr)),
        e('div', { className: 'gp-plan-strip' },
          e('span', { className: 'gp-strip-item', role: 'button', tabIndex: 0,
            onClick: onEdit ? function() { onEdit('goal'); } : null,
            onKeyDown: onEdit ? function(ev) { if (ev.key === 'Enter') onEdit('goal'); } : null
          }, stripGoal),
          stripFunding ? e('span', { className: 'gp-strip-sep' }, '·') : null,
          stripFunding ? e('span', { className: 'gp-strip-item', role: 'button', tabIndex: 0,
            onClick: onEdit ? function() { onEdit('funding-mode'); } : null,
            onKeyDown: onEdit ? function(ev) { if (ev.key === 'Enter') onEdit('funding-mode'); } : null
          }, stripFunding) : null,
          e('span', { className: 'gp-strip-sep' }, '·'),
          e('span', { className: 'gp-strip-item', role: 'button', tabIndex: 0,
            onClick: onEdit ? function() { onEdit('temperament'); } : null,
            onKeyDown: onEdit ? function(ev) { if (ev.key === 'Enter') onEdit('temperament'); } : null
          }, planPkName)
        ),
        e('div', { className: 'gp-report-status ' + statusClass }, status)
      ),

      e(ReportJourney, {
        t: t,
        plan: plan,
        poolsReady: poolsReady,
        newBlended: newBlended,
        savedBlended: plan.blendedApy,
        status: status
      }),

      elapsedBlock,

      projectionBlock,

      progressBlock,

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
                    dir === 'flat' ? ('● ' + t('reportHolding')) : (dir === 'up' ? '▲ ' : '▼ '),
                    dir !== 'flat' ? ((delta >= 0 ? '+' : '') + formatApy(delta).replace('%', '') + '%') : null
                  ) : null
                )
          );
        })
      ),

      e('div', { className: 'gp-report-actions' },
        e('button', { type: 'button', className: 'gp-cta', onClick: props.onTend }, t('reportTend')),
        e('button', { type: 'button', className: 'gp-cta gp-cta-ghost', onClick: props.onFresh }, t('reportFresh'))
      ),
      e('div', { className: 'gp-report-reminder' },
        e('button', {
          type: 'button', className: 'gp-share-textlink gp-report-share-link', onClick: reportShareLink
        }, reportShareCopied ? t('shareLinkCopied') : t('reportShareCta')),
        e('p', { className: 'gp-tend-reminder-note' }, t('reportShareNote'))
      ),
      e('div', { className: 'gp-report-reminder' },
        e('button', {
          type: 'button', className: 'gp-share-textlink gp-tend-reminder', onClick: reportTendReminder
        }, t('tendReminderCta')),
        e('p', { className: 'gp-tend-reminder-note' }, t('tendReminderNote'))
      ),
      e('p', { className: 'gp-disclaimer' }, t('disclaimer'))
    );
  }

  // ===========================================================================
  // Header
  // ===========================================================================
  // Brand leaf mark — same SVG as the landing's LeafMark (landing.js), so
  // every surface wears one identity tile.
  function BrandLeafMark() {
    return e('svg', {
      className: 'gp-leaf-mark', viewBox: '0 0 32 32', width: 22, height: 22,
      preserveAspectRatio: 'xMidYMid meet', fill: 'none', 'aria-hidden': 'true'
    },
      e('path', { d: 'M26.7 4.8C16.2 5.2 8.2 10.7 7.1 20.4c-.3 2.8.7 5.2 2.4 6.8 1.6-8.5 6.5-14.6 14.1-18.2-4.5 3.9-7.6 8.7-9 14.6 3.1-3.9 7-6.8 11.7-8.8.8-2.8.9-6 .4-10Z', fill: 'currentColor' }),
      e('path', { d: 'M8.8 27.2c3.2-5.1 7.2-8.9 12.2-11.4', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round' })
    );
  }

  function PlannerHeader(props) {
    return e('header', { className: 'gp-header' + (props.isScrolled ? ' is-scrolled' : '') },
      e('a', { className: 'gp-logo', href: 'home.html' },
        e('span', { className: 'gp-brand-mark', 'aria-hidden': 'true' }, e(BrandLeafMark)),
        'DeFi Garden'),
      e('div', { className: 'gp-header-actions' },
        // My Garden affordance — shows when plan exists and not already in report view
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
          e('span', { className: 'gp-theme-icon' }, props.dark ? '☼' : '☾')
        )
      )
    );
  }

  // ===========================================================================
  // Arrival banner — greets a share-link recipient once per view (spec 007)
  // ===========================================================================
  function ArrivalBanner(props) {
    var t = props.t;
    // CTA and dismiss both close the banner: shared plans fast-forward straight
    // to the bloom step, so the recipient's prefilled plan is already rendered
    // underneath — "adopting" it just means clearing this banner out of the way.
    return e('div', { className: 'gp-arrival-banner gp-animate-in' },
      e('p', { className: 'gp-arrival-text' }, t(props.poolSourced ? 'arrivalBannerTextPool' : 'arrivalBannerText')),
      e('div', { className: 'gp-arrival-actions' },
        e('button', {
          type: 'button', className: 'gp-cta gp-arrival-cta', onClick: props.onDismiss
        }, t('arrivalBannerCta')),
        e('button', {
          type: 'button', className: 'gp-arrival-dismiss', onClick: props.onDismiss,
          'aria-label': t('arrivalBannerDismiss')
        }, '✕')
      )
    );
  }

  // ===========================================================================
  // Root app — finite-state scripted conversation
  // ===========================================================================
  var STEPS = ['goal', 'funding-mode', 'deadline', 'monthly', 'horizon', 'temperament', 'bloom'];

  function Planner() {
    var langState = useState(detectLang());
    var lang = langState[0];
    var t = useMemo(function () { return makeT(lang); }, [lang]);

    // Localize the static crawler footer's anchors (045, 179 — plan.html and
    // any other static load that carries .seo-hub-links; home.html's copy in
    // analytics/landing mode is superseded/hidden by the 086/179 CSS rule, so
    // re-running this there is harmless). The footer ships EN in raw HTML for
    // crawlers; once the planner mounts, re-key it from the SAME EXISTING
    // keys the landing/analytics footers already use — browseTokens /
    // browseChains live on the ROOT dictionary (240 deleted the
    // translations[lang].landing.footerBrowseTokens/footerBrowseChains
    // duplicates once landing.js/app.js were unified onto the root keys), NOT
    // .planner, so makeT's t() can't reach them; read the dict directly, same
    // fallback shape as makeT/rootT). Runs on every `lang` change, so both
    // ?lang=ko and a future live language switch land. Guarded: a missing
    // element, a missing translations global, or a missing key must never
    // throw and break the render.
    useEffect(function () {
      try {
        var tr = safeTranslations();
        var rootDict = tr && (tr[lang] || tr.en);
        if (!rootDict) return;
        var tokensLink = document.querySelector('.seo-hub-links a[href="/tokens"]');
        var chainsLink = document.querySelector('.seo-hub-links a[href="/chains"]');
        if (tokensLink && rootDict.browseTokens) tokensLink.textContent = rootDict.browseTokens;
        if (chainsLink && rootDict.browseChains) chainsLink.textContent = rootDict.browseChains;
      } catch (eFooterI18n) {}
    }, [lang]);

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

    var scrollState = useState(false);
    var isScrolled = scrollState[0], setIsScrolled = scrollState[1];
    useEffect(function () {
      function onScroll() {
        var scrolled = window.scrollY > 4;
        setIsScrolled(function (prev) { return prev !== scrolled ? scrolled : prev; });
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return function () { window.removeEventListener('scroll', onScroll); };
    }, []);

    // Pools
    var poolsState = useState([]);
    var pools = poolsState[0], setPools = poolsState[1];
    var loadState = useState('loading');
    var loadStatus = loadState[0], setLoadStatus = loadState[1];

    useEffect(function () {
      var alive = true;
      // Snapshot-first (spec 059 C1): the planner's floors are all >= $10M, so
      // the railed static snapshot always covers it. Try the small snapshot
      // behind a freshness gate; ANY failure at ANY step falls straight
      // through to the live POOLS_API fetch — exactly today's path. Planner
      // rails (floors, sanity limit, stable curation, degen haircut) run
      // unchanged on whichever payload loads, so no relax/escape-hatch exists.
      // 6h ≈ 2× the slowest observed CI-bake gap (spec 140) — same constant
      // and rationale as app.js; the old 15-min gate left this fast path dead
      // ~85–90% of the day so bare `/` sessions paid the slow live fetch.
      var SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
      function goLive() {
        fetch(POOLS_API)
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!alive) return;
            setPools((j && j.data) || []);
            setLoadStatus('ready');
          })
          .catch(function () { if (alive) setLoadStatus('error'); });
      }
      function startFetch() {
        if (!alive) return;
        fetch('/data/pools-snapshot-meta.json')
          .then(function (r) { if (!r.ok) throw new Error('meta'); return r.json(); })
          .then(function (meta) {
            if (!meta || meta.schemaVersion !== 1) throw new Error('meta invalid');
            var age = Date.now() - new Date(meta.generatedAt).getTime();
            if (!(age >= 0) || age > SNAPSHOT_MAX_AGE_MS) throw new Error('stale');
            return fetch('/data/pools-snapshot.json');
          })
          .then(function (r) { if (!r.ok) throw new Error('snap'); return r.json(); })
          .then(function (snap) {
            if (!alive) return;
            if (!snap || snap.schemaVersion !== 1 || !Array.isArray(snap.pools) || snap.pools.length === 0) {
              throw new Error('snap invalid');
            }
            setPools(snap.pools);
            setLoadStatus('ready');
          })
          .catch(function () { if (alive) goLive(); });
      }
      var id;
      if (typeof requestIdleCallback !== 'undefined') {
        id = requestIdleCallback(startFetch, { timeout: 2000 });
      } else {
        id = setTimeout(startFetch, 200);
      }
      return function () {
        alive = false;
        if (typeof cancelIdleCallback !== 'undefined') cancelIdleCallback(id);
        else clearTimeout(id);
      };
    }, []);

    // A1: stable guidance APY for step-2 chip hints (pinned to 'stable' persona)
    var stableGuidanceCurated = useMemo(function () {
      return loadStatus === 'ready' ? curatePools(pools, 'stable', 3) : [];
    }, [pools, loadStatus]);
    var stableGuidanceApy = useMemo(function () {
      return stableGuidanceCurated.length ? blendedApy(stableGuidanceCurated) : null;
    }, [stableGuidanceCurated]);
    var guidanceApy = stableGuidanceApy || 5.5;
    var guidanceIsIllustrative = !stableGuidanceApy;

    // URL flags
    var urlParams = useMemo(function () { return new URLSearchParams(window.location.search); }, []);
    var presetKey = urlParams.get('preset');
    var preset = presetKey ? PRESETS[presetKey] : null;
    var freshFlag = urlParams.get('fresh') === '1';

    // Direct waitlist entry point from the static SEO pages (062):
    // ?waitlist=1&src=seo_token|seo_chain opens a lightweight, plan-independent
    // waitlist modal on load. Reuses the same neumorphic gp-waitlist-* tokens
    // and copy as Bloom's modal, but needs none of Bloom's plan context
    // (goal/persona/pools) — a landing from a token/chain page has no plan yet.
    var waitlistSrc = urlParams.get('src');
    var quickWaitlistOpenState = useState(urlParams.get('waitlist') === '1');
    var quickWaitlistOpen = quickWaitlistOpenState[0], setQuickWaitlistOpen = quickWaitlistOpenState[1];
    var quickWaitlistStepState = useState(1);
    var quickWaitlistStep = quickWaitlistStepState[0], setQuickWaitlistStep = quickWaitlistStepState[1];
    var quickWaitlistEmailState = useState('');
    var quickWaitlistEmail = quickWaitlistEmailState[0], setQuickWaitlistEmail = quickWaitlistEmailState[1];
    var quickWaitlistStatusState = useState('idle');
    var quickWaitlistStatus = quickWaitlistStatusState[0], setQuickWaitlistStatus = quickWaitlistStatusState[1];
    var quickWaitlistEmailEnteredRef = useRef(false);

    useEffect(function () {
      if (quickWaitlistOpen && typeof Analytics !== 'undefined') {
        Analytics.trackWaitlistOpened({ source: waitlistSrc, pitchVariant: PITCH_VARIANT });
      }
      // Runs once: quickWaitlistOpen's initial value and waitlistSrc are both
      // derived from urlParams, which is computed once (useMemo, [] deps).
    }, []);

    useEffect(function () {
      if (!quickWaitlistOpen) return;
      function onKey(ev) { if (ev.key === 'Escape') setQuickWaitlistOpen(false); }
      window.addEventListener('keydown', onKey);
      return function () { window.removeEventListener('keydown', onKey); };
    }, [quickWaitlistOpen]);

    function submitQuickWaitlist(ev) {
      if (ev) ev.preventDefault();
      if (!quickWaitlistEmail.trim()) {
        if (typeof Analytics !== 'undefined') {
          Analytics.trackWaitlistError({ reason: 'empty_email', source: waitlistSrc, pitchVariant: PITCH_VARIANT });
        }
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(quickWaitlistEmail)) {
        if (typeof Analytics !== 'undefined') {
          Analytics.trackWaitlistError({ reason: 'invalid_email', source: waitlistSrc, pitchVariant: PITCH_VARIANT });
        }
        return;
      }
      setQuickWaitlistStatus('submitting');
      if (typeof Analytics !== 'undefined') {
        Analytics.trackWaitlistSubmitAttempt({ source: waitlistSrc, pitchVariant: PITCH_VARIANT });
      }
      var payload = {
        email: quickWaitlistEmail,
        message: 'source: ' + (waitlistSrc || 'direct'),
        _subject: 'DeFi Garden waitlist signup'
      };
      fetch('https://formspree.io/f/xzdqygjn', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (res.ok) {
          setQuickWaitlistStep(2);
          setQuickWaitlistStatus('idle');
          if (typeof Analytics !== 'undefined') {
            Analytics.trackWaitlistSubmitted({ source: waitlistSrc, success: true, pitchVariant: PITCH_VARIANT });
          }
        } else {
          setQuickWaitlistStatus('error');
          if (typeof Analytics !== 'undefined') {
            Analytics.trackWaitlistError({ reason: 'formspree_error', source: waitlistSrc, pitchVariant: PITCH_VARIANT });
            Analytics.trackWaitlistSubmitted({ source: waitlistSrc, success: false, pitchVariant: PITCH_VARIANT });
          }
        }
      }).catch(function () {
        setQuickWaitlistStatus('error');
        if (typeof Analytics !== 'undefined') {
          Analytics.trackWaitlistError({ reason: 'network', source: waitlistSrc, pitchVariant: PITCH_VARIANT });
          Analytics.trackWaitlistSubmitted({ source: waitlistSrc, success: false, pitchVariant: PITCH_VARIANT });
        }
      });
    }

    var quickWaitlistEmailValid = /^\S+@\S+\.\S+$/.test(quickWaitlistEmail);
    var quickWaitlistModal = quickWaitlistOpen ? e('div', {
      className: 'gp-waitlist-backdrop',
      onClick: function (ev) { if (ev.target === ev.currentTarget) setQuickWaitlistOpen(false); },
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t(pitchKey('waitlistTitle'))
    },
      e('div', { className: 'gp-waitlist-card' },
        e('button', {
          type: 'button',
          className: 'gp-waitlist-close',
          onClick: function () { setQuickWaitlistOpen(false); },
          'aria-label': t('waitlistClose')
        }, '✕'),
        quickWaitlistStep === 1
          ? e('div', { className: 'gp-waitlist-body' },
              e('div', { className: 'gp-waitlist-step-row' },
                e('h2', { className: 'gp-waitlist-title' }, t(pitchKey('waitlistTitle'))),
                e('span', { className: 'gp-waitlist-step' }, t('waitlistStepLabel', 1))
              ),
              e('p', { className: 'gp-waitlist-benefits' }, t(pitchKey('waitlistBenefits'))),
              e('form', { className: 'gp-waitlist-form', onSubmit: submitQuickWaitlist },
                e('input', {
                  type: 'email',
                  className: 'gp-waitlist-email-input',
                  placeholder: t('waitlistEmailPlaceholder'),
                  value: quickWaitlistEmail,
                  required: true,
                  autoFocus: true,
                  onChange: function (ev) {
                    if (!quickWaitlistEmailEnteredRef.current) {
                      quickWaitlistEmailEnteredRef.current = true;
                      if (typeof Analytics !== 'undefined') {
                        Analytics.trackWaitlistEmailEntered({ source: waitlistSrc, pitchVariant: PITCH_VARIANT });
                      }
                    }
                    setQuickWaitlistEmail(ev.target.value);
                    setQuickWaitlistStatus('idle');
                  }
                }),
                e('p', { className: 'gp-waitlist-nospam' }, t('waitlistNoSpam')),
                quickWaitlistStatus === 'error'
                  ? e('p', { className: 'gp-waitlist-error' }, t('waitlistError'))
                  : null,
                e('button', {
                  type: 'submit',
                  className: 'gp-waitlist-submit' + (!quickWaitlistEmailValid ? ' is-disabled' : ''),
                  disabled: quickWaitlistStatus === 'submitting' || !quickWaitlistEmailValid
                },
                  quickWaitlistStatus === 'submitting' ? '…' : t('waitlistJoin')
                )
              )
            )
          : e('div', { className: 'gp-waitlist-body' },
              e('div', { className: 'gp-waitlist-step-row' },
                e('h2', { className: 'gp-waitlist-title' }, t('waitlistAccepted')),
                e('span', { className: 'gp-waitlist-step' }, t('waitlistStepLabel', 2))
              ),
              e('p', { className: 'gp-waitlist-next-steps' }, t('waitlistNextSteps'))
            )
      )
    ) : null;

    // Shared plan from URL params (goal/monthly/pace)
    var sharedPlan = useMemo(function () {
      return (!preset && !freshFlag) ? decodePlanFromUrl(urlParams) : null;
    }, [urlParams, preset, freshFlag]);

    // Pool-sourced arrival (item 143): the "Garden this pool" CTA deep-links with
    // the SAME param shape as a genuine share, but marks itself with ?src=pool.
    // A pool-CTA arrival is a self-initiated click (already tracked on the pool
    // page as pool_click{source=garden_cta}), NOT a share someone sent — so we
    // branch to honest copy and suppress the false share_link_opened event.
    var poolSourced = !!sharedPlan && urlParams.get('src') === 'pool';

    // Virality signal — a shared plan URL was actually opened (fires once per page load)
    useEffect(function () {
      if (!sharedPlan || poolSourced || typeof Analytics === 'undefined') return;
      Analytics.trackShareLinkOpened({
        goal: sharedPlan.goal, persona: sharedPlan.persona,
        capital: sharedPlan.capital, deadline: sharedPlan.deadline
      });
    }, [sharedPlan, poolSourced]);

    var savedPlan = useMemo(function () {
      return (preset || freshFlag) ? null : loadSavedPlan();
    }, [preset, freshFlag]);

    // mode: 'report' | 'convo'
    var modeState = useState(savedPlan ? 'report' : 'convo');
    var mode = modeState[0], setMode = modeState[1];

    // conversation answers
    var ansState = useState(function () {
      if (preset) return { goal: preset.goal, monthly: preset.monthly, years: preset.years, persona: TEMPERAMENT_TO_PERSONA[preset.temperament] || preset.temperament, capital: null, fundingMode: null, deadline: null };
      if (sharedPlan) return { goal: sharedPlan.goal, monthly: sharedPlan.monthly, years: sharedPlan.years, persona: sharedPlan.persona, capital: sharedPlan.capital || null, fundingMode: sharedPlan.fundingMode || null, deadline: sharedPlan.deadline || null };
      return { goal: null, monthly: null, years: null, persona: null, capital: null, fundingMode: null, deadline: null };
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
    var subsExpandedState = useState(false); var subsExpanded = subsExpandedState[0], setSubsExpanded = subsExpandedState[1];

    // Hover state for compounding explainer
    var hoverAmountState = useState(null);
    var hoveredAmount = hoverAmountState[0], setHoveredAmount = hoverAmountState[1];

    // Shared plan intro — only shown once
    var sharedIntroState = useState(!!sharedPlan);
    var showSharedIntro = sharedIntroState[0], setShowSharedIntro = sharedIntroState[1];

    // Arrival banner dismissal (spec 007) — session-only state, no localStorage.
    // sharedPlan itself never changes after mount, so a plain dismissed flag
    // (rather than mirroring sharedPlan into more state) is all that's needed.
    var arrivalDismissedState = useState(false);
    var arrivalDismissed = arrivalDismissedState[0], setArrivalDismissed = arrivalDismissedState[1];

    function advance(toStep) {
      if (prefersReducedMotion) { setStep(toStep); return; }
      setThinking(true);
      var delay = 600 + Math.random() * 300;
      setTimeout(function () { setThinking(false); setStep(toStep); }, delay);
    }

    function restart() {
      clearSavedPlan();
      setAnswers({ goal: null, monthly: null, years: null, persona: null, capital: null, fundingMode: null, deadline: null });
      setStep('goal'); setMode('convo'); setCm(''); setCc(''); setFt(''); setShowNudge(false); setFmSelected(null);
      setShowSharedIntro(false);
      setArrivalDismissed(true);
      try {
        var u = new URL(window.location.href);
        ['preset', 'fresh', 'goal', 'monthly', 'years', 'pace', 'capital', 'fm', 'dl', 'chain', 'token'].forEach(function(k) { u.searchParams.delete(k); });
        window.history.replaceState({}, '', u.pathname + (u.search || ''));
      } catch (e10) {}
    }

    // Preset fast-forward — always jump to bloom since presets pre-fill all answers
    var presetPlayedRef = useRef(false);
    useEffect(function () {
      if (!preset || presetPlayedRef.current) return;
      presetPlayedRef.current = true;
      if (prefersReducedMotion) { setStep('bloom'); return; }
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
      if (!answers.goal || !answers.persona) return;
      var arch = goalArchetype(answers.goal);
      // Capital path: need capital; monthly path: need monthly; growth: need years
      if (arch === 'growth' && !answers.years) return;
      if (arch !== 'growth' && !answers.capital && !answers.monthly) return;
      sharedPlayedRef.current = true;
      setStep('bloom');
    }, [sharedPlan, answers]);

    // ---- step handlers ----
    function pickGoal(id) {
      var arch = goalArchetype(id);
      setShowNudge(false);
      if (arch === 'subscription') {
        // Amount step ("How much can you put in?") is temporarily skipped: seed a
        // default capital (the goal's minimum forever) and go straight to the bloom,
        // where the mix toggles let users adjust the amount/combo.
        // To re-enable the step, restore: advance('funding-mode').
        var sg = goalById(id);
        var seedCapital = sg && sg.target ? Math.ceil(foreverNumber(sg.target, guidanceApy) / 100) * 100 : null;
        setAnswers(function (a) { return Object.assign({}, a, { goal: id, persona: null, fundingMode: 'capital', capital: seedCapital, monthly: null }); });
        advance('temperament');
      } else {
        setAnswers(function (a) { return Object.assign({}, a, { goal: id, persona: a.persona || (arch !== 'growth' ? 'stable' : null) }); });
        if (arch === 'target') { advance('funding-mode'); }
        else { advance('monthly'); }
      }
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
    function pickFundingMode(mode, amount) {
      var arch = goalArchetype(answers.goal);
      setAnswers(function (a) { return Object.assign({}, a, {
        fundingMode: mode,
        capital: mode === 'capital' ? amount : null,
        monthly: mode === 'monthly' ? amount : null
      }); });
      if (arch === 'target') {
        advance('deadline');
      } else if (arch === 'subscription') {
        advance('bloom');
      } else {
        advance('temperament');
      }
    }
    var customCapital = useState(''); var cc = customCapital[0], setCc = customCapital[1];
    var fundingModeExpandedState = useState(null); var fmSelected = fundingModeExpandedState[0], setFmSelected = fundingModeExpandedState[1];
    function submitCustomCapital(ev) {
      if (ev) ev.preventDefault();
      var v = parseInt(String(cc).replace(/[^0-9]/g, ''), 10);
      if (!v || v <= 0) return;
      setCc('');
      pickFundingMode('capital', v);
    }

    function pickDeadline(months) {
      setAnswers(function (a) { return Object.assign({}, a, { deadline: months }); });
      advance('temperament');
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
    function onEditMonthly() {
      if (currentArchetype === 'target' || currentArchetype === 'subscription') {
        setStep('funding-mode');
      } else {
        setStep('monthly');
      }
    }
    function onEditYears() { if (currentArchetype === 'growth') setStep('horizon'); }
    function onEditPersona() { setStep('temperament'); }

    // ---------- RENDER ----------
    var stepIndex = STEPS.indexOf(step);

    // Declare arch before thread rows so it's available everywhere below
    var arch = goalArchetype(answers.goal);

    var thread = [];
    // Thread rows keyed on answer presence, not stepIndex, so STEPS reordering doesn't break them
    if (step !== 'goal' && answers.goal) {
      thread.push(e(ThreadRow, { key: 'g', label: '🌱', value: t('youPicked', goalLabel(t, answers.goal)), onClick: function() { setStep('goal'); } }));
    }
    if (answers.capital != null && (arch === 'target' || arch === 'subscription')) {
      thread.push(e(ThreadRow, { key: 'fm', label: '💰', value: t('stripCapital', formatUsdRounded(answers.capital)), onClick: function() { setStep('funding-mode'); } }));
    } else if (answers.monthly != null && step !== 'monthly' && step !== 'funding-mode') {
      thread.push(e(ThreadRow, { key: 'm', label: '💧', value: t('monthlyChosen', formatUsd(answers.monthly)), onClick: function() { setStep(arch === 'target' || arch === 'subscription' ? 'funding-mode' : 'monthly'); } }));
    }
    if (!skipHorizon && answers.years != null && step !== 'horizon') {
      thread.push(e(ThreadRow, { key: 'y', label: '⏳', value: t('horizonChosen', answers.years), onClick: function() { setStep('horizon'); } }));
    }
    if (answers.persona && step === 'bloom') {
      var pk2 = answers.persona;
      var personaTitle = pk2 === 'stable' ? t('personaStableTitle') : (pk2 === 'rwa' ? t('personaRwaTitle') : t('personaDegenTitle'));
      thread.push(e(ThreadRow, { key: 't', label: '🫶', value: t('tempChosen', personaTitle), onClick: function() { setStep('temperament'); } }));
    }

    // Monthly chips — contextual to archetype
    var monthlyChips = (arch === 'target' || arch === 'subscription')
      ? [10, 25, 50, 100]
      : [100, 250, 500, 1000, 2500];

    // Horizon chips — max 10 years per spec §2
    var horizonChips = [1, 2, 3, 5, 10];

    function restoreFromPlan(plan) {
      var p = TEMPERAMENT_TO_PERSONA[plan.temperament] || plan.persona || 'stable';
      setAnswers({
        goal: plan.goal,
        monthly: plan.monthly || null,
        years: plan.years || null,
        persona: p,
        capital: plan.capital || null,
        fundingMode: plan.fundingMode || (plan.capital ? 'capital' : (plan.monthly ? 'monthly' : null)),
        deadline: plan.deadline || null
      });
    }

    var content;
    if (mode === 'report' && savedPlan) {
      // P0 FIX: Show report immediately — don't block on API load.
      // Live deltas show 'updating' until API loads, then update.
      content = e(GardenReport, {
        t: t, plan: savedPlan, pools: pools, poolsReady: loadStatus === 'ready',
        onTend: function () {
          restoreFromPlan(savedPlan);
          setMode('convo'); setStep('bloom');
        },
        onFresh: restart,
        onEdit: function(editStep) {
          restoreFromPlan(savedPlan);
          setMode('convo');
          setStep(editStep);
        }
      });
    } else {
      var stepBubble;
      if (thinking) {
        stepBubble = e(Sprout, null);
      } else if (step === 'goal') {
        stepBubble = e(Bubble, { key: 'goal' },
          preset ? e('p', { className: 'gp-preset-intro' }, t('presetIntro', preset.name)) : null,
          showSharedIntro ? e('p', { className: 'gp-preset-intro' }, t(poolSourced ? 'sharedPlanIntroPool' : 'sharedPlanIntro')) : null,
          e('p', { className: 'gp-question' }, t('step1Question')),
          e('p', { className: 'gp-splash-hook' }, stableGuidanceApy ? t('splashHookLive', formatApy(stableGuidanceApy)) : t('splashHook')),
          e('div', { className: 'gp-goal-groups' },
            (function () {
              var activeCats = [
                { catKey: 'catSubscriptions', catId: 'subscription' },
                { catKey: 'catBills',         catId: 'bills' },
                { catKey: 'catGadgets',       catId: 'gadget' },
                { catKey: 'catLife',          catId: 'life' }
              ];
              return activeCats.map(function (cat) {
                var catGoals = GOALS.filter(function (g) { return g.category === cat.catId; });
                if (cat.catId === 'subscription') {
                  // Show all subscription goals expanded — no More/Show-less toggle
                  return e('div', { key: cat.catId, className: 'gp-goal-group' },
                    // Omit the category label when there is only one group — context comes from
                    // the splash question above.  When gadgets/life are re-enabled (activeCats
                    // length > 1) the label re-appears automatically.
                    activeCats.length > 1 ? e('p', { className: 'gp-goal-cat-label' }, t(cat.catKey)) : null,
                    e(Chips, {
                      wrap: true, selected: answers.goal,
                      options: catGoals.map(function (g) { return { value: g.id, label: t(g.labelKey), emoji: g.emoji, icon: g.icon }; }),
                      onPick: pickGoal
                    })
                  );
                }
                return e('div', { key: cat.catId, className: 'gp-goal-group' },
                  e('p', { className: 'gp-goal-cat-label' }, t(cat.catKey)),
                  e(Chips, {
                    wrap: true, selected: answers.goal,
                    options: catGoals.map(function (g) { return { value: g.id, label: t(g.labelKey), emoji: g.emoji, icon: g.icon }; }),
                    onPick: pickGoal
                  })
                );
              });
            })()
          ),
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
      } else if (step === 'funding-mode') {
        var goalDef3 = goalById(answers.goal);
        var goalTarget3 = goalDef3 ? goalDef3.target : null;
        var arch3 = goalArchetype(answers.goal);

        if (arch3 === 'subscription') {
          // Subscription: single smart amount step — tiered options anchored to chosen goal
          var subLadder = buildLadder(subscriptionLadder(answers.goal), guidanceApy, null, answers.goal);
          var anchorRung = subLadder[0];
          var anchorMonthly = anchorRung ? anchorRung.monthly : (goalTarget3 || 20);
          var anchorForeverAmt = anchorRung ? anchorRung.foreverAmt : foreverNumber(anchorMonthly, guidanceApy);
          var subContextLine = null;
          if (isFinite(anchorForeverAmt)) {
            var anchorChipVal = Math.ceil(anchorForeverAmt / 100) * 100;
            var subContextText = t('amountContextSub',
              goalLabel(t, answers.goal),
              formatUsd(anchorMonthly),
              formatApy(guidanceApy),
              formatUsdRounded(anchorChipVal)
            );
            if (guidanceIsIllustrative) {
              subContextText = subContextText + ' ' + t('fundingContextIllustrative');
            }
            subContextLine = e('p', { className: 'gp-goal-context' }, subContextText);
          }
          var subTierOptions = subLadder.map(function (rung, idx) {
            var chipVal = Math.ceil(rung.foreverAmt / 100) * 100;
            var hint = idx === 0
              ? t('amountMinimumTag') + ' · ' + t('coversForever', goalLabel(t, answers.goal))
              : t('coversPlus', t(rung.labelKey));
            return {
              value: chipVal,
              label: formatUsdRounded(chipVal),
              hint: isFinite(rung.foreverAmt) ? hint : null,
              featured: idx === 0
            };
          }).filter(function (opt) { return isFinite(opt.value) && opt.value > 0; });

          stepBubble = e(Bubble, { key: 'funding-mode' },
            e('p', { className: 'gp-question' }, t('amountQuestion')),
            subContextLine,
            e(Chips, {
              selected: null, wrap: true,
              options: subTierOptions,
              onPick: function (v) { pickFundingMode('capital', v); }
            }),
            e('form', { className: 'gp-freetext gp-money', onSubmit: submitCustomCapital },
              e('span', { className: 'gp-money-prefix' }, '$'),
              e('input', {
                type: 'text', inputMode: 'numeric', className: 'gp-text-input', value: cc,
                placeholder: t('customAmount'),
                onChange: function (ev) { setCc(ev.target.value.replace(/[^0-9]/g, '')); }
              }),
              e('button', { type: 'submit', className: 'gp-text-send', 'aria-label': 'Submit' }, '→')
            )
          );
        } else {
          // Target (and any other archetype): keep existing two-card + amount UI
          var goalContextLine = null;
          if (arch3 === 'target' && goalTarget3) {
            goalContextLine = e('p', { className: 'gp-goal-context' }, t('fundingContextTarget', goalLabel(t, answers.goal), formatUsd(goalTarget3)));
          }

          var capitalChips = [1000, 2500, 5000, 10000, 25000];
          var capHints = chipHintsFor(capitalChips, {
            archetype: arch3,
            target: goalTarget3,
            apy: guidanceApy,
            mode: 'capital'
          });
          var capChipOptions = capHints.map(function (h) {
            var hintLabel = null;
            if (h.hint === 'forever' || h.forever) {
              hintLabel = t('chipHintForever');
            } else if (h.hint && h.hint.indexOf('pct:') === 0) {
              var pct = parseInt(h.hint.slice(4), 10);
              hintLabel = t('chipHintPctToForever', pct);
            } else if (h.pct != null && !h.forever) {
              hintLabel = t('chipHintPctToForever', h.pct);
            } else if (h.hint && h.hint.indexOf('months:') === 0) {
              var mths2 = parseInt(h.hint.slice(7), 10);
              var dateStr2 = monthsFromNow(mths2);
              hintLabel = dateStr2 ? t('chipHintYoursBy', dateStr2) : null;
            } else if (h.months != null && isFinite(h.months)) {
              var dateStr3 = monthsFromNow(h.months);
              hintLabel = dateStr3 ? t('chipHintYoursBy', dateStr3) : null;
            }
            return { value: h.value, label: formatUsdRounded(h.value), hint: hintLabel, featured: h.featured };
          });

          var monthlyChipVals = [10, 25, 50, 100];
          var monthlyHints = monthlyChipVals.map(function (v) {
            var hint = null;
            if (arch3 === 'target' && goalTarget3 && guidanceApy > 0) {
              var mthsTgt = timeToTarget(goalTarget3, v, guidanceApy);
              if (isFinite(mthsTgt)) {
                var dateTgt = monthsFromNow(mthsTgt);
                if (dateTgt) hint = t('chipHintYoursBy', dateTgt);
              }
            }
            return { value: v, label: formatUsd(v) + '/mo', hint: hint };
          });

          stepBubble = e(Bubble, { key: 'funding-mode' },
            e('p', { className: 'gp-question' }, t('fundingModeQuestion')),
            goalContextLine,
            e('div', { className: 'gp-temp-cards gp-funding-mode-cards' },
              e('button', {
                type: 'button',
                className: 'gp-temp-card' + (fmSelected === 'capital' ? ' is-selected' : ''),
                onClick: function () { setFmSelected(fmSelected === 'capital' ? null : 'capital'); }
              },
                e('div', { className: 'gp-temp-emoji' }, '💰'),
                e('div', { className: 'gp-temp-title' }, t('fundingCapitalCard')),
                e('div', { className: 'gp-temp-desc' }, t('fundingCapitalSubline'))
              ),
              e('button', {
                type: 'button',
                className: 'gp-temp-card' + (fmSelected === 'monthly' ? ' is-selected' : ''),
                onClick: function () { setFmSelected(fmSelected === 'monthly' ? null : 'monthly'); }
              },
                e('div', { className: 'gp-temp-emoji' }, '📅'),
                e('div', { className: 'gp-temp-title' }, t('fundingMonthlyCard')),
                e('div', { className: 'gp-temp-desc' }, t('fundingMonthlySubline'))
              )
            ),
            e('div', {
              className: 'gp-funding-amount-picker' + (fmSelected === 'capital' ? ' gp-funding-picker-open' : ''),
              style: fmSelected === 'capital' ? {} : { display: 'none' }
            },
              e('p', { className: 'gp-question', style: { marginTop: '12px', fontSize: '1rem' } }, t('fundingCapitalPrompt')),
              e(Chips, {
                selected: null, wrap: true,
                options: capChipOptions,
                onPick: function (v) { pickFundingMode('capital', v); }
              }),
              e('form', { className: 'gp-freetext gp-money', onSubmit: submitCustomCapital },
                e('span', { className: 'gp-money-prefix' }, '$'),
                e('input', {
                  type: 'text', inputMode: 'numeric', className: 'gp-text-input', value: cc,
                  placeholder: t('customAmount'),
                  onChange: function (ev) { setCc(ev.target.value.replace(/[^0-9]/g, '')); }
                }),
                e('button', { type: 'submit', className: 'gp-text-send', 'aria-label': 'Submit' }, '→')
              )
            ),
            e('div', {
              className: 'gp-funding-amount-picker' + (fmSelected === 'monthly' ? ' gp-funding-picker-open' : ''),
              style: fmSelected === 'monthly' ? {} : { display: 'none' }
            },
              e(Chips, {
                selected: null, wrap: true,
                options: monthlyHints,
                onPick: function (v) { pickFundingMode('monthly', v); }
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
            )
          );
        }
      } else if (step === 'deadline') {
        var now = new Date();
        var monthsToYearEnd = (11 - now.getMonth()) + (now.getDate() > 1 ? 1 : 0);
        if (monthsToYearEnd < 1) monthsToYearEnd = 12;
        var deadlineOptions = [
          { value: null,              label: t('deadlineNoRush') },
          { value: 6,                 label: t('deadlineSixMonths') },
          { value: monthsToYearEnd,   label: t('deadlineThisYear') }
        ];
        stepBubble = e(Bubble, { key: 'deadline' },
          e('p', { className: 'gp-question' }, t('deadlineQuestion')),
          e(Chips, {
            selected: answers.deadline, wrap: true,
            options: deadlineOptions,
            onPick: pickDeadline
          })
        );
      } else if (step === 'monthly') {
        stepBubble = e(Bubble, { key: 'monthly' },
          e('p', { className: 'gp-question' }, t('step2Question', goalLabel(t, answers.goal))),
          e(Chips, {
            selected: answers.monthly, wrap: true,
            options: monthlyChips.map(function (v) {
              if (arch !== 'growth') return { value: v, label: formatUsd(v) };
              var hintYears = answers.years || 5;
              var hintAmt = futureValue(v, guidanceApy, hintYears);
              return { value: v, label: formatUsd(v), hint: t('monthlyChipHint', formatUsdRounded(hintAmt), hintYears) };
            }),
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
        var tempYears = answers.years || 3;
        var tempGoalDef = goalById(answers.goal);
        var cards = [
          { id: 'stable', emoji: '🏦', title: t('personaStableTitle'), risk: t('personaStableRisk') },
          { id: 'rwa',    emoji: '🏛️', title: t('personaRwaTitle'),    risk: t('personaRwaRisk') },
          { id: 'degen',  emoji: '🔥', title: t('personaDegenTitle'),  risk: t('personaDegenRisk') }
        ].map(function (card) {
          var curated = curatePools(pools, card.id, 3);
          var eff = effectiveApy(curated, card.id);
          var apyStr = eff > 0 ? parseFloat(eff.toFixed(1)) + '%' : '—';
          // Projected outcome — futureValue for monthly path, monthly yield for capital path
          var projLabel = null;
          if (answers.monthly && eff > 0) {
            var projAmt = futureValue(answers.monthly, eff, tempYears);
            projLabel = t('personaProj', formatUsdRounded(projAmt), tempYears, parseFloat(eff.toFixed(1)));
          } else if (answers.capital && eff > 0) {
            var monthlyYield = Math.round(answers.capital * eff / 100 / 12);
            projLabel = t('personaProjYield', formatUsd(monthlyYield, 0), parseFloat(eff.toFixed(1)));
          }
          // Protocol badges — unique protocols from curated pools
          var seen2 = {};
          var protocols = curated.filter(function (p) {
            if (!p.project || seen2[p.project]) return false;
            seen2[p.project] = true;
            return true;
          }).slice(0, 3).map(function (p) {
            return { project: p.project, name: formatProjectName(p.project) };
          });
          return Object.assign({}, card, { apyStr: apyStr, proj: projLabel, protocols: protocols });
        });
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
                e('div', { className: 'gp-temp-header' },
                  card.protocols.length > 0
                    ? e('div', { className: 'gp-temp-logo-row' },
                        card.protocols.map(function (proto) {
                          return e('img', {
                            key: proto.project,
                            src: 'https://icons.llama.fi/' + proto.project + '.png',
                            className: 'gp-temp-logo',
                            alt: proto.name,
                            onError: function (ev) { ev.target.style.display = 'none'; }
                          });
                        })
                      )
                    : null,
                  e('span', { className: 'gp-temp-title' }, card.title)
                ),
                e('div', { className: 'gp-temp-apy-block' },
                  e('div', { className: 'gp-temp-apy' }, card.apyStr),
                  e('div', { className: 'gp-temp-apy-label' }, t('personaApyLabel'))
                ),
                card.proj ? e('div', { className: 'gp-temp-proj' }, card.proj) : null,
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
            // 064: threads the arriving ?src= (e.g. 'x_spotlight') onto
            // Bloom's plan_created/waitlist_opened events.
            source: waitlistSrc,
            capital: answers.capital,
            fundingMode: answers.fundingMode,
            deadline: answers.deadline,
            // 060: seed Bloom's own pool-filter state from a decoded shared
            // plan (chain/token survive the share-URL round trip now).
            initialChain: sharedPlan ? (sharedPlan.chain || null) : null,
            initialToken: sharedPlan ? (sharedPlan.token || null) : null,
            // 101: seed Bloom's subscription mix from a decoded shared plan so a
            // multi-service garden (e.g. Spotify+Netflix+Claude) rebuilds exactly.
            initialMix: sharedPlan ? (sharedPlan.mix || null) : null,
            onWhatIf: onWhatIf,
            onEditGoal: onEditGoal,
            onEditMonthly: onEditMonthly,
            onEditYears: onEditYears,
            onEditPersona: onEditPersona
          });
          stepBubble = showSharedIntro
            ? e(React.Fragment, null,
                e('p', { className: 'gp-preset-intro' }, t(poolSourced ? 'sharedPlanIntroPool' : 'sharedPlanIntro')),
                bloomEl
              )
            : bloomEl;
        }
      }

      content = e('div', { className: 'gp-convo' },
        (step !== 'bloom' && thread.length) ? e('div', { className: 'gp-thread' }, thread) : null,
        e('div', { className: 'gp-current' }, stepBubble)
      );
    }

    var canRestart = (stepIndex > 0 || step === 'bloom' || mode === 'report' || !!loadSavedPlan());
    var hasSavedPlan = !!loadSavedPlan();
    // Never show the arrival banner while the report branch is rendering the
    // RECIPIENT'S OWN saved plan (a returning user who also opened someone
    // else's share link) — that view ignores sharedPlan entirely, so the
    // "someone sent you this" framing would be describing the wrong plan.
    var showArrivalBanner = !!sharedPlan && !arrivalDismissed && !(mode === 'report' && savedPlan);

    return e('div', { className: 'gp-app' },
      e(PlannerHeader, {
        isScrolled: isScrolled,
        dark: dark, onToggleTheme: function () { setDark(function (d) { return !d; }); },
        canRestart: canRestart, restartLabel: t('startFresh'), onRestart: restart,
        hasSavedPlan: hasSavedPlan,
        myGardenLabel: t('myGarden'),
        mode: mode,
        onShowGarden: function() { setMode('report'); }
      }),
      showArrivalBanner ? e(ArrivalBanner, { t: t, poolSourced: poolSourced, onDismiss: function () { setArrivalDismissed(true); } }) : null,
      e('main', { className: 'gp-main' + (step === 'bloom' ? ' gp-main--bloom' : '') },
        (step === 'goal' && mode !== 'report')
          ? e('div', { className: 'gp-tagline' }, e('h1', null, t('title')), e('p', null, t('tagline')))
          : null,
        content
      ),
      quickWaitlistModal
    );
  }

  // Dedupe key for the plan_saved analytics event: user-meaningful fields only,
  // so rate refreshes (apy churn, curated reshuffles) cannot re-fire the event.
  function planSavedSignature(f) {
    f = f || {};
    return JSON.stringify([
      f.archetype || null, f.goal || null, f.monthly || null, f.years || null,
      f.persona || null, f.capital || null, f.fundingMode || null, f.deadline || null,
      f.poolFilters || null, f.slotPicks || null, f.mix || null
    ]);
  }

  // Expose pure helpers for unit testing and debugging
  var api = {
    planSavedSignature: planSavedSignature,
    APY_SANITY_LIMIT: APY_SANITY_LIMIT,
    futureValue: futureValue, totalDeposited: totalDeposited, capitalGrowth: capitalGrowth,
    curatePools: curatePools, blendedApy: blendedApy, median: median,
    isStableSymbol: isStableSymbol, isAnomalousApy: isAnomalousApy,
    matchGoalFromText: matchGoalFromText,
    TEMPERAMENTS: { sleep: PERSONAS.stable, balanced: PERSONAS.rwa, bold: PERSONAS.degen },
    PERSONAS: PERSONAS, RWA_ALLOWLIST: RWA_ALLOWLIST,
    formatUsdRounded: formatUsdRounded,
    timeToTarget: timeToTarget, foreverNumber: foreverNumber, effectiveApy: effectiveApy,
    cumulativeYield: cumulativeYield, monthsUntilYieldCoversTarget: monthsUntilYieldCoversTarget,
    capitalForDeadline: capitalForDeadline, dailyYield: dailyYield,
    migratePlan: migratePlan, buildPlanHero: buildPlanHero, chipHintsFor: chipHintsFor,
    buildLadder: buildLadder,
    SUBSCRIPTION_LADDER: SUBSCRIPTION_LADDER,
    subscriptionLadder: subscriptionLadder,
    poolAlternatives: poolAlternatives,
    reportStats: reportStats,
    coveredBundle: coveredBundle,
    joinBundle: joinBundle,
    mixStats: mixStats,
    disciplinedSpeedup: disciplinedSpeedup,
    GOALS: GOALS,
    goalArchetype: goalArchetype,
    formatProjectName: formatProjectName
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    window.GardenPlanner = api;
    // Only mount when the router explicitly selects planner mode. The bare
    // root is now the search-first landing; plan.html and planner share URLs
    // still select planner mode before this script runs.
    var isPlanDocument = /(?:^|\/)plan\.html$/.test(window.location.pathname);
    if (window.__APP_MODE !== 'planner' && !isPlanDocument) return;
    function mountPlanner() {
      var mount = document.getElementById('planner-root');
      if (!mount) return;
      // Re-resolve React bindings here: module-level R/e may have been
      // captured before React loaded when planner.js was dynamically injected.
      var _React = window.React;
      var _ReactDOM = window.ReactDOM;
      if (!_React || !_ReactDOM) return;
      var _e = _React.createElement;
      // Patch module-level bindings so Planner component tree uses real React
      R = _React;
      e = _e;
      useState = _React.useState;
      useEffect = _React.useEffect;
      useRef = _React.useRef;
      useMemo = _React.useMemo;
      useCallback = _React.useCallback;
      _ReactDOM.createRoot(mount).render(_e(Planner));
    }
    // With static defer the React scripts are guaranteed to execute before
    // planner.js, so the direct call path is the normal path.
    if (window.ReactDOM && window.React) {
      mountPlanner();
    } else {
      document.addEventListener('DOMContentLoaded', mountPlanner);
    }
  }
})();
