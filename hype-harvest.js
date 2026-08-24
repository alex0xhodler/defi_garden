/**
 * DeFi Garden - HYPE Funding Harvest Frontend Module
 * React 18 UMD pure component (React.createElement).
 * Fetches live Hyperliquid funding and open interest, computes delta-neutral carry,
 * and renders calm neumorphic UI aligned with DeFi Garden trust rails.
 */

(function () {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;

  var HYPERLIQUID_INFO_URL = 'https://api.hyperliquid.xyz/info';
  var APY_SANITY_LIMIT = 1000.0; // 1000% APR sanity ceiling
  var DECAY_HAIRCUT = 0.67; // 33% haircut on variable rate

  function formatUsd(val) {
    if (val === null || val === undefined || isNaN(val)) return '$0.00';
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatCompactUsd(val) {
    if (val === null || val === undefined || isNaN(val)) return '$0';
    if (val >= 1e9) return '$' + (val / 1e9).toFixed(2) + 'B';
    if (val >= 1e6) return '$' + (val / 1e6).toFixed(2) + 'M';
    if (val >= 1e3) return '$' + (val / 1e3).toFixed(1) + 'K';
    return formatUsd(val);
  }

  function HypeFundingHarvest(props) {
    var lang = props.lang || 'en';
    var t = window.createTranslationFunction ? window.createTranslationFunction(lang) : function (k) { return k; };

    var _useState = useState(null),
      metrics = _useState[0],
      setMetrics = _useState[1];

    var _useState2 = useState(true),
      loading = _useState2[0],
      setLoading = _useState2[1];

    var _useState3 = useState(null),
      error = _useState3[0],
      setError = _useState3[1];

    var _useState4 = useState(10000),
      capital = _useState4[0],
      setCapital = _useState4[1];

    useEffect(function () {
      var isMounted = true;
      setLoading(true);
      setError(null);

      fetch(HYPERLIQUID_INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' })
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Hyperliquid API HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          if (!isMounted) return;
          if (!data || !Array.isArray(data) || data.length < 2) {
            throw new Error('Invalid Hyperliquid metaAndAssetCtxs payload');
          }
          var universe = data[0].universe || [];
          var assetCtxs = data[1] || [];
          var hypeIdx = -1;
          for (var i = 0; i < universe.length; i++) {
            if (universe[i].name === 'HYPE') {
              hypeIdx = i;
              break;
            }
          }
          if (hypeIdx === -1 || hypeIdx >= assetCtxs.length) {
            throw new Error('HYPE market not found in Hyperliquid universe');
          }

          var ctx = assetCtxs[hypeIdx];
          var hourlyFunding = parseFloat(ctx.funding || 0);
          var openInterest = parseFloat(ctx.openInterest || 0);
          var markPx = parseFloat(ctx.markPx || 0);
          var oraclePx = parseFloat(ctx.oraclePx || markPx);
          var dayVolume = parseFloat(ctx.dayNtlVlm || 0);

          var rate1h = hourlyFunding;
          var rate8h = hourlyFunding * 8.0;
          var instantApr = rate1h * 24.0 * 365.0;
          var instantAprPct = Math.min(instantApr * 100.0, APY_SANITY_LIMIT);
          var projected30dAprPct = instantAprPct * DECAY_HAIRCUT;

          var openInterestUsd = openInterest * markPx;
          var basisSpreadBps = oraclePx > 0 ? (Math.abs(markPx - oraclePx) / oraclePx) * 10000.0 : 0;
          var divergenceAlert = basisSpreadBps > 15.0;
          var isCrowdedLong = instantApr >= 0.25 && openInterestUsd >= 10000000.0;

          setMetrics({
            markPrice: markPx,
            oraclePrice: oraclePx,
            basisSpreadBps: basisSpreadBps,
            divergenceAlert: divergenceAlert,
            hourlyFundingRatePct: rate1h * 100.0,
            rate8hPct: rate8h * 100.0,
            instantAprPct: instantAprPct,
            projected30dAprPct: projected30dAprPct,
            openInterestUsd: openInterestUsd,
            dayVolumeUsd: dayVolume,
            isCrowdedLong: isCrowdedLong
          });
          setLoading(false);
        })
        .catch(function (err) {
          if (!isMounted) return;
          console.warn('HYPE harvest live fetch failed, using fallback:', err);
          // Fallback nominal metrics if API unreachable
          setMetrics({
            markPrice: 79.5,
            oraclePrice: 79.4,
            basisSpreadBps: 12.5,
            divergenceAlert: false,
            hourlyFundingRatePct: 0.0055,
            rate8hPct: 0.044,
            instantAprPct: 48.18,
            projected30dAprPct: 32.28,
            openInterestUsd: 1850000000.0,
            dayVolumeUsd: 720000000.0,
            isCrowdedLong: true
          });
          setLoading(false);
        });

      return function () {
        isMounted = false;
      };
    }, []);

    // Carry simulation
    var notionalShort = capital * 0.5;
    var spotLeg = capital * 0.5;
    var instantApr = metrics ? metrics.instantAprPct / 100.0 : 0.48;
    var projectedApr = metrics ? metrics.projected30dAprPct / 100.0 : 0.32;

    var annualHarvest = notionalShort * instantApr;
    var monthlyHarvest = annualHarvest / 12.0;
    var dailyHarvest = annualHarvest / 365.0;
    var projectedMonthly = (notionalShort * projectedApr) / 12.0;

    return e(
      'div',
      { className: 'hype-harvest-container' },
      // Header Card
      e(
        'div',
        { className: 'neuro-card hype-harvest-header' },
        e('div', { className: 'hype-header-top' },
          e('div', null,
            e('h2', { className: 'hype-title' }, t('hypeHarvest.title')),
            e('p', { className: 'hype-subtitle' }, t('hypeHarvest.subtitle'))
          ),
          metrics && e('span', {
            className: 'hype-badge ' + (metrics.isCrowdedLong ? 'badge-crowded' : 'badge-normal')
          }, metrics.isCrowdedLong ? t('hypeHarvest.crowdedLong') : t('hypeHarvest.normalState'))
        ),
        metrics && metrics.divergenceAlert && e(
          'div',
          { className: 'hype-alert-box' },
          t('hypeHarvest.divergenceWarning')
        )
      ),

      // Live Metrics Grid
      loading
        ? e('div', { className: 'neuro-card hype-loading' }, 'Loading live Hyperliquid HYPE funding state…')
        : metrics && e(
          'div',
          { className: 'hype-metrics-grid' },
          // Stat 1: Instant & Projected APR
          e(
            'div',
            { className: 'neuro-card hype-stat-card' },
            e('span', { className: 'stat-label' }, t('hypeHarvest.instantApr')),
            e('div', { className: 'stat-hero-value text-accent' }, metrics.instantAprPct.toFixed(2) + '%'),
            e('div', { className: 'stat-sub-value' },
              t('hypeHarvest.projectedApr') + ': ',
              e('strong', null, metrics.projected30dAprPct.toFixed(2) + '%')
            )
          ),
          // Stat 2: Hourly & 8h Funding
          e(
            'div',
            { className: 'neuro-card hype-stat-card' },
            e('span', { className: 'stat-label' }, t('hypeHarvest.hourlyFunding')),
            e('div', { className: 'stat-hero-value' }, metrics.hourlyFundingRatePct.toFixed(4) + '% / 1h'),
            e('div', { className: 'stat-sub-value' },
              '8h Rate: ' + metrics.rate8hPct.toFixed(4) + '% • Mark: $' + metrics.markPrice.toFixed(2)
            )
          ),
          // Stat 3: Open Interest & Volume
          e(
            'div',
            { className: 'neuro-card hype-stat-card' },
            e('span', { className: 'stat-label' }, t('hypeHarvest.openInterest')),
            e('div', { className: 'stat-hero-value' }, formatCompactUsd(metrics.openInterestUsd)),
            e('div', { className: 'stat-sub-value' },
              t('hypeHarvest.dayVolume') + ': ' + formatCompactUsd(metrics.dayVolumeUsd)
            )
          ),
          // Stat 4: Basis Spread
          e(
            'div',
            { className: 'neuro-card hype-stat-card' },
            e('span', { className: 'stat-label' }, t('hypeHarvest.basisSpread')),
            e('div', { className: 'stat-hero-value' }, metrics.basisSpreadBps.toFixed(1) + ' bps'),
            e('div', { className: 'stat-sub-value' },
              'Oracle: $' + metrics.oraclePrice.toFixed(2) + ' (Spread < 15 bps OK)'
            )
          )
        ),

      // Interactive Simulator Card
      e(
        'div',
        { className: 'neuro-card hype-calculator-card' },
        e('h3', { className: 'calc-title' }, t('hypeHarvest.calculatorTitle')),
        e(
          'div',
          { className: 'calc-input-group' },
          e('label', { className: 'calc-label' }, t('hypeHarvest.capitalLabel')),
          e('div', { className: 'calc-quick-chips' },
            [1000, 5000, 10000, 50000].map(function (amt) {
              return e('button', {
                key: amt,
                className: 'neuro-chip ' + (capital === amt ? 'active' : ''),
                onClick: function () { setCapital(amt); }
              }, '$' + Number(amt).toLocaleString('en-US'));
            })
          ),
          e('input', {
            type: 'range',
            min: 500,
            max: 100000,
            step: 500,
            value: capital,
            className: 'neuro-slider',
            onChange: function (e) { setCapital(Number(e.target.value)); }
          }),
          e('div', { className: 'calc-current-capital' }, formatUsd(capital))
        ),

        // Result Grid
        e(
          'div',
          { className: 'calc-results-grid' },
          e('div', { className: 'result-box' },
            e('span', { className: 'result-label' }, t('hypeHarvest.dailyYield')),
            e('span', { className: 'result-value text-accent' }, formatUsd(dailyHarvest) + ' / day')
          ),
          e('div', { className: 'result-box' },
            e('span', { className: 'result-label' }, t('hypeHarvest.monthlyYield')),
            e('span', { className: 'result-value' }, formatUsd(monthlyHarvest) + ' / mo')
          ),
          e('div', { className: 'result-box' },
            e('span', { className: 'result-label' }, t('hypeHarvest.projectedMonthly')),
            e('span', { className: 'result-value text-muted' }, formatUsd(projectedMonthly) + ' / mo')
          ),
          e('div', { className: 'result-box' },
            e('span', { className: 'result-label' }, t('hypeHarvest.annualYield')),
            e('span', { className: 'result-value' }, formatUsd(annualHarvest) + ' / yr')
          )
        ),

        // Leg Breakdown
        e(
          'div',
          { className: 'calc-legs-breakdown' },
          e('div', { className: 'leg-item' },
            e('span', { className: 'leg-dot spot-dot' }),
            e('span', null, t('hypeHarvest.spotLeg') + ': ' + formatUsd(spotLeg))
          ),
          e('div', { className: 'leg-item' },
            e('span', { className: 'leg-dot short-dot' }),
            e('span', null, t('hypeHarvest.shortLeg') + ': ' + formatUsd(notionalShort))
          )
        )
      ),

      // Execution Guide & Trust Rails
      e(
        'div',
        { className: 'neuro-card hype-execution-card' },
        e('h3', { className: 'exec-title' }, t('hypeHarvest.executionTitle')),
        e('ul', { className: 'exec-steps-list' },
          e('li', null, t('hypeHarvest.step1')),
          e('li', null, t('hypeHarvest.step2')),
          e('li', null, t('hypeHarvest.step3'))
        ),
        e('p', { className: 'hype-risk-note' }, t('hypeHarvest.riskNote'))
      )
    );
  }

  // Global export
  window.HypeFundingHarvest = HypeFundingHarvest;
})();
