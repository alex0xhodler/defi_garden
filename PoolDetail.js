// Standalone PoolDetail Component - Full Version
const { useState, useEffect } = React;

// Pool type categorization — SINGLE SOURCE OF TRUTH (spec 130).
// These list constants + getPoolTypeShared live here (PoolDetail.js loads
// BEFORE app.js per home.html's script order, so these top-level declarations
// are globals by the time app.js runs). app.js's getPoolType delegates to
// getPoolTypeShared — do not fork a second copy of this classifier.
const LENDING_PROTOCOLS = [
  'aave', 'aave-v2', 'aave-v3', 'compound', 'compound-v2', 'compound-v3',
  'morpho', 'morpho-blue', 'spark', 'sparklend', 'maple', 'euler', 'radiant',
  'iron-bank', 'cream', 'benqi-lending', 'venus', 'tectonic', 'moonwell',
  'strike', 'granary', 'pac-finance', 'dforce', 'annex', 'sky-lending'
];

const DEX_LP_PROTOCOLS = [
  'uniswap', 'uniswap-v2', 'uniswap-v3', 'curve', 'curve-dex', 'balancer',
  'balancer-v2', 'pancakeswap', 'pancakeswap-v2', 'pancakeswap-v3', 'sushiswap',
  'quickswap', 'traderjoe', 'spookyswap', 'spiritswap', 'honeyswap', 'dfyn',
  'viperswap', 'pangolin', 'lydia', 'defiswap', 'varen', 'levinswap',
  'aerodrome', 'aerodrome-slipstream', 'velodrome', 'solidly', 'bancor',
  'kyberswap', 'dodoex', '1inch', 'osmosis', 'raydium', 'orca'
];

const STAKING_PROTOCOLS = [
  'lido', 'rocket-pool', 'rocketpool', 'ether.fi', 'ether.fi-stake', 'stakewise',
  'jito', 'jito-liquid-staking', 'marinade', 'binance-staked-eth', 'coinbase-wrapped-staked-eth',
  'frax', 'frax-ether', 'benqi', 'benqi-staked-avax', 'staked-frax-ether',
  'ankr', 'pstake', 'stader', 'chorus-one', 'figment'
];

const YIELD_DERIVATIVES_PROTOCOLS = [
  'pendle', 'spectra', 'spectra-v2', 'spectra-metavaults', 'termmax', 'napier',
  'sense', 'notional', 'element'
];

const RWA_PROTOCOLS = [
  'ondo', 'centrifuge', 'goldfinch', 'openeden', 'matrixdock', 'midas-rwa',
  'midas', 'usual', 'credix', 'clearpool', 'maple', 'superstate', 'franklin',
  'backed', 'hashnote', 'mountain-protocol'
];

// Shared pool-type classifier (spec 130) — the complete, single-source logic
// (RWA -> Yield Derivatives -> poolMeta-lending -> LENDING -> DEX -> STAKING ->
// default Yield Farming), used by BOTH the analytics grid (app.js delegates)
// and this pool-detail hero badge.
function getPoolTypeShared(pool) {
  if (!pool.project) return 'Yield Farming';

  const projectName = pool.project.toLowerCase().replace(/\s+/g, '-');

  // Protocol-native RWA / yield-derivative classification wins over the generic
  // lending/dex/staking lists (honest, protocol-derived — spec 091).
  if (RWA_PROTOCOLS.some(protocol => projectName.includes(protocol))) {
    return 'RWA';
  }

  if (YIELD_DERIVATIVES_PROTOCOLS.some(protocol => projectName.includes(protocol))) {
    return 'Yield Derivatives';
  }

  // Check for lending pool indicators
  if (pool.poolMeta && pool.poolMeta.toLowerCase().includes('lending')) {
    return 'Lending';
  }

  // Check against protocol categories
  if (LENDING_PROTOCOLS.some(protocol => projectName.includes(protocol))) {
    return 'Lending';
  }

  if (DEX_LP_PROTOCOLS.some(protocol => projectName.includes(protocol))) {
    return 'LP/DEX';
  }

  if (STAKING_PROTOCOLS.some(protocol => projectName.includes(protocol))) {
    return 'Staking';
  }

  // Default to yield farming for unmatched pools
  return 'Yield Farming';
}

// Classify an underlying-token string for the "Underlying Assets" chip row
// (item 195, root-caused by 193's scanner work — specs/193-notes.md residual
// (b)). blockscan.com resolves EVM addresses only; pointing a Solana mint,
// Tron address or any other non-EVM id at it is a link to a 404, which is
// worse than rendering no link at all. This classifier is the single place
// that decides chip-vs-plain-span AND which explorer (if any) a chip may
// link to, so that guarantee only has to be reasoned about once. Rules are
// evaluated in order; the first match wins. Pure — no DOM, no React.
function classifyUnderlyingToken(token, chain) {
  if (typeof token !== 'string') return { chip: false };
  const trimmed = token.trim();

  // 1. Chain-prefixed EVM, e.g. "ethereum:0xdac1...1ec7" (Base/Plasma pools).
  const prefixedMatch = trimmed.match(/^[a-z0-9-]+:(0x[0-9a-fA-F]{40,})$/);
  if (prefixedMatch) {
    const address = prefixedMatch[1];
    return { chip: true, address, href: `https://blockscan.com/address/${address}` };
  }

  // 2. Bare EVM address (existing behavior, unchanged).
  if (trimmed.startsWith('0x') && trimmed.length >= 40) {
    return { chip: true, address: trimmed, href: `https://blockscan.com/address/${trimmed}` };
  }

  // 3. Solana base58 mint.
  if (chain === 'Solana' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    return { chip: true, address: trimmed, href: `https://solscan.io/token/${trimmed}` };
  }

  // 4. Tron base58 token address ("T" + 33 chars).
  if (chain === 'Tron' && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed)) {
    return { chip: true, address: trimmed, href: `https://tronscan.org/#/token20/${trimmed}` };
  }

  // 5. Generic opaque id (Stellar Soroban contract ids, Stacks principals,
  // and any other chain we don't have an explorer map for yet). Long enough
  // to be an address, not a human-readable slug — chip it for the truncation
  // treatment, but never link it: we don't know where it resolves.
  if (trimmed.length >= 32 && !/\s/.test(trimmed)) {
    return { chip: true, address: trimmed, href: null };
  }

  // 6. Anything else (e.g. "coingecko:openeden-tbill") — a short readable
  // slug, not an address. Left as plain, untouched, full text.
  return { chip: false };
}

function PoolDetail({
  pool,
  onBack,
  resetApp,
  calculateYields,
  futureValue,
  formatCurrency,
  formatAPY,
  formatUsd,
  formatNum,
  formatApy,
  getProtocolUrl,
  getProtocolUrlWithRef,
  isDarkMode,
  t,
  AnimatedNumber,
  toggleTheme,
  language,
  changeLanguage
}) {
  // Fallback formatters when not passed (e.g. SSR/tests)
  const _formatUsd = formatUsd || ((n, f) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: f || 2 }));
  const _formatNum = formatNum || ((n) => Number(n || 0).toLocaleString('en-US'));
  const _formatApy = formatApy || ((pct) => Number(pct || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%');
  const _futureValue = futureValue || ((monthly, annualRatePct, years) => {
    const P = Number(monthly) || 0;
    const months = Math.round((Number(years) || 0) * 12);
    const r = (Number(annualRatePct) || 0) / 100;
    if (r === 0) return P * months;
    const rm = r / 12;
    return P * ((Math.pow(1 + rm, months) - 1) / rm);
  });
  const [investmentAmount, setInvestmentAmount] = useState(1000);
  const [showAPYBreakdown, setShowAPYBreakdown] = useState(false);
  const [calculatorExpanded, setCalculatorExpanded] = useState(true);
  const [poolInfoExpanded, setPoolInfoExpanded] = useState(true);
  const [activeCalculatorTab, setActiveCalculatorTab] = useState('30days');
  const [isPulsing, setIsPulsing] = useState(false);
  // Spec 207 settle gate: whether the async 105 kpi-snapshot backfill (app.js)
  // has had time to land before we decide the pool truly has no rate history.
  const [historyLookupSettled, setHistoryLookupSettled] = useState(false);

  useEffect(() => {
    if (investmentAmount > 0) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 300);
      return () => clearTimeout(timer);
    }
  }, [investmentAmount]);

  // Spec 207 settle gate. app.js's 105 effect fetches /data/pools-snapshot.json
  // and merges kpis onto the detail pool asynchronously for the ~11.4% of
  // deep-linked pools present in that snapshot. Without this gate, the new
  // "no rate history" note (below) would flash for those pools before 105's
  // backfill lands and the real 088.1 track-record note replaces it — a
  // visible regression on the exact path 207 requires stay behaviour-
  // unchanged. So: reset on pool change, and only declare "settled" (safe to
  // render the no-history note) 1s after a kpis-less pool mounts, giving 105
  // a window to backfill first. Pools that already have kpis need no wait.
  useEffect(() => {
    setHistoryLookupSettled(false);
    if (!(pool && pool.kpis)) {
      const timer = setTimeout(() => setHistoryLookupSettled(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [pool && pool.pool, pool && !!pool.kpis]);

  if (!pool) {
    return React.createElement('div', { className: 'pool-detail-empty' },
      React.createElement('p', null, 'No pool selected'),
      React.createElement('button', {
        className: 'back-button',
        onClick: () => {
          // Analytics tracking for back navigation from pool detail
          if (typeof Analytics !== 'undefined') {
            Analytics.trackNavigation('pool-detail', 'search', 'back_button');
          }
          onBack();
        }
      }, t ? t('backToSearch') : '← Back to Search')
    );
  }

  const totalApy = (pool.apyBase || 0) + (pool.apyReward || 0);
  const yields = calculateYields(investmentAmount, totalApy);
  const protocolUrl = getProtocolUrl(pool);
  const protocolUrlWithRef = getProtocolUrlWithRef(pool);

  // spec 182 leg D — renders EITHER the existing protocol CTA (byte-identical
  // behaviour/copy) when protocolUrlWithRef resolves, OR an honest DefiLlama
  // fallback when every getProtocolUrl() tier returns null (sdai today, and
  // any future true-null protocol). Reuse over duplication (2026-07-10
  // directive): one helper used at both the hero and repeat-footer CTA
  // sites, which differ only by `placement` ('hero' | 'repeat_footer') — that
  // becomes both the ctaPlacement analytics prop and this function's arg.
  // Returns an array of the two child elements (button + hint) so a call
  // site can splice them in with `...renderProtocolCtaBlock('hero')`.
  function renderProtocolCtaBlock(placement) {
    if (protocolUrlWithRef) {
      return [
        React.createElement('button', {
          className: 'cta-button-protocol',
          onClick: () => {
            if (typeof Analytics !== 'undefined') {
              Analytics.trackPoolClick(pool, 'protocol_link', { ctaPlacement: placement });
            }
            window.open(protocolUrlWithRef, '_blank', 'noopener,noreferrer');
          }
        },
          t ? t('startEarningOn', pool.project) : `Start Earning on ${pool.project}`,
          ' ↗'
        ),
        React.createElement('p', { className: 'pool-action-hint pool-action-hint--muted' },
          t ? t('opensProtocol') : 'Opens protocol · Wallet required'
        )
      ];
    }

    // True-null case (spec 182 leg B): an honest labelled link to the pool's
    // DefiLlama page instead of empty space. Must NOT impersonate the
    // protocol CTA (different copy) and must NOT inflate the north star:
    // fires 'defillama_fallback', never 'protocol_link' — reusing that value
    // here would silently redefine the north-star metric. Reuses
    // `.cta-button-protocol` / `.pool-action-hint--muted` verbatim — zero new
    // CSS (Territory note T5 — both classes already exist for exactly this).
    const defillamaUrl = 'https://defillama.com/yields/pool/' + encodeURIComponent(pool.pool);
    return [
      React.createElement('button', {
        className: 'cta-button-protocol',
        onClick: () => {
          if (typeof Analytics !== 'undefined') {
            Analytics.trackPoolClick(pool, 'defillama_fallback', { ctaPlacement: placement });
          }
          window.open(defillamaUrl, '_blank', 'noopener,noreferrer');
        }
      },
        t ? t('viewOnDefillama') : 'View this pool on DefiLlama',
        ' ↗'
      ),
      React.createElement('p', { className: 'pool-action-hint pool-action-hint--muted' },
        t ? t('opensDefillamaFallback') : 'No protocol link available · Opens DefiLlama, our data source'
      )
    ];
  }

  // Determine pool type (must be defined before getRiskAssessment) — single
  // shared classifier (spec 130); same categories as the analytics grid.
  const poolType = getPoolTypeShared(pool);

  const APY_SANITY_LIMIT_LOCAL = 1000; // mirror of app.js constant

  // 144: apyMean30d is presented as fact; anything outside the trust rail is not
  // presentable. Magnitude gate (not isFinite alone) — 122's precedent: garbage
  // values are finite.
  const mean30dSane = typeof pool.apyMean30d === 'number' &&
    Number.isFinite(pool.apyMean30d) &&
    pool.apyMean30d >= 0 &&
    pool.apyMean30d <= APY_SANITY_LIMIT_LOCAL;

  // Comprehensive Risk Assessment
  const getRiskAssessment = () => {
    let riskScore = 0;
    const factors = [];

    // Anomalous APY override — force High risk immediately
    if (totalApy > APY_SANITY_LIMIT_LOCAL) {
      factors.push('Anomalous yield');
      return {
        level: t ? t('highRisk') : 'High',
        color: 'var(--color-error)',
        description: 'Anomalous yield — extreme caution',
        factors,
        score: 100
      };
    }

    // TVL Factor (40% weight)
    if (pool.tvlUsd < 1000000) {
      riskScore += 40;
      factors.push('Low liquidity');
    } else if (pool.tvlUsd < 10000000) {
      riskScore += 20;
      factors.push('Medium liquidity');
    } else {
      factors.push('High liquidity');
    }

    // APY Factor (30% weight) - Higher APY = Higher risk
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

    // Pool Age/Maturity Factor (20% weight)
    const isNewProtocol = ['jito', 'ether.fi', 'pendle', 'eigenlayer'].some(p =>
      pool.project?.toLowerCase().includes(p)
    );
    if (isNewProtocol) {
      riskScore += 15;
      factors.push('Newer protocol');
    }

    // Pool Type Factor (10% weight)
    if (poolType === 'LP/DEX') {
      riskScore += 10;
      factors.push('Impermanent loss risk');
    } else if (poolType === 'Lending') {
      riskScore += 5;
      factors.push('Credit risk');
    }

    // Determine overall risk level
    let level, color, description;
    if (riskScore <= 25) {
      level = t ? t('lowRisk') : 'Low';
      color = 'var(--color-success)';
      description = 'Conservative DeFi strategy';
    } else if (riskScore <= 50) {
      level = t ? t('mediumRisk') : 'Medium';
      color = 'var(--color-warning)';
      description = 'Moderate risk profile';
    } else {
      level = t ? t('highRisk') : 'High';
      color = 'var(--color-error)';
      description = 'Advanced DeFi strategy';
    }

    return { level, color, description, factors, score: riskScore };
  };

  const riskAssessment = getRiskAssessment();

  // Persona this pool's risk tier maps to in the planner (stable/rwa/degen —
  // mirrors planner.js's PERSONAS thresholds, same 25/50 risk-score bands
  // getRiskAssessment already uses above). Drives the "Garden this pool"
  // deep link and whether the projection below applies the degen haircut.
  const gardenPersona = riskAssessment.score <= 25 ? 'stable' : riskAssessment.score <= 50 ? 'rwa' : 'degen';
  const isAnomalous = totalApy > APY_SANITY_LIMIT_LOCAL;
  const applyDegenHaircut = gardenPersona === 'degen';
  const PROJECTION_YEARS = 5;
  const projectionApy = applyDegenHaircut ? totalApy / 3 : totalApy;
  // Projection is tied to the calculator's investment amount (lump sum, default
  // $1,000) so the number below AND the CTA react to what the user selects.
  // Lump-sum compound growth: principal * (1 + r)^years.
  const projectionAmount = investmentAmount * Math.pow(1 + projectionApy / 100, PROJECTION_YEARS);
  // Prefill the planner with the SAME lump sum + horizon so it lands on exactly
  // this projection (as capital, matching the calculator). The deep link never
  // carries the pool's APY — the planner computes from its own sanity-capped rate.
  const gardenThisPoolHref = `plan.html?goal=retirement&pace=${gardenPersona}&capital=${Math.round(investmentAmount)}&fm=capital&years=${PROJECTION_YEARS}&src=pool`;
  // Concrete CTA (025): show the projected outcome ON the button — but NEVER for
  // an anomalous pool (trust rail: anomalous rates are flagged, never hyped).
  const showConcreteCta = !isAnomalous;

  // BreadcrumbList JSON-LD (040): mirrors the visual breadcrumb above
  // (Search Results -> <SYMBOL> Pool) without touching its markup/behavior.
  const breadcrumbJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Search Results', item: `${window.location.origin}/?app=1` },
      { '@type': 'ListItem', position: 2, name: `${pool.symbol} Pool`, item: `${window.location.origin}/?pool=${encodeURIComponent(pool.pool)}` }
    ]
  }).replace(/</g, '\\u003c');

  return React.createElement('div', {
    className: 'pool-detail-container',
    style: {
      opacity: 1,
      display: 'block',
      visibility: 'visible',
      position: 'relative',
      minHeight: '100vh',
      padding: '40px 20px 20px 20px',
      maxWidth: '1200px',
      margin: '0 auto'
    }
  },
    React.createElement('script', {
      type: 'application/ld+json',
      dangerouslySetInnerHTML: { __html: breadcrumbJsonLd }
    }),
    // Clean Header: Logo | Breadcrumb | Toggle
    React.createElement('div', {
      className: 'header animate-on-mount',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '28px 0 24px 0',
        marginBottom: '24px'
      }
    },
      // Left: DeFi Garden Logo
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          height: '40px' // Match toggle height
        }
      },
        React.createElement('h1', {
          className: 'logo',
          style: {
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'var(--font-weight-black)',
            color: 'var(--color-text)',
            margin: 0,
            cursor: 'pointer',
            transition: 'color 0.2s ease',
            lineHeight: '1'
          },
          onClick: resetApp,
          onMouseEnter: (e) => e.target.style.color = 'var(--color-primary)',
          onMouseLeave: (e) => e.target.style.color = 'var(--color-text)'
        }, 'DeFi Garden')
      ),

      // Center: Breadcrumb Navigation
      React.createElement('div', {
        className: 'pool-breadcrumb',
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '0 20px',
          height: '40px', // Match toggle height
          background: 'var(--color-background)',
          borderRadius: 'var(--neuro-radius-lg)',
          boxShadow: 'var(--neuro-shadow-pressed)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-medium)',
          color: 'var(--color-text)'
        }
      },
        React.createElement('span', {
          style: {
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            transition: 'color 0.2s ease'
          },
          onClick: () => {
            // Analytics tracking for back navigation from pool detail
            if (typeof Analytics !== 'undefined') {
              Analytics.trackNavigation('pool-detail', 'search', 'back_link');
            }
            onBack();
          },
          onMouseEnter: (e) => e.target.style.color = 'var(--color-primary)',
          onMouseLeave: (e) => e.target.style.color = 'var(--color-text-secondary)'
        }, 'Search Results'),
        React.createElement('span', {
          style: {
            color: 'var(--color-primary)'
          }
        }, '→'),
        React.createElement('span', {
          style: {
            color: 'var(--color-text)',
            fontWeight: 'var(--font-weight-semibold)'
          }
        }, `${pool.symbol} Pool`)
      ),

      // Right: Header controls (language + theme)
      React.createElement('div', { className: 'detail-header-controls' },
        // Language toggle
        (changeLanguage && language) && React.createElement('button', {
          className: 'detail-header-btn',
          onClick: () => changeLanguage(language === 'en' ? 'ko' : 'en'),
          'aria-label': `Switch to ${language === 'en' ? 'Korean' : 'English'}`
        }, language === 'en' ? 'KO' : 'EN'),
        // Theme toggle
        toggleTheme && React.createElement('button', {
          className: 'detail-header-btn',
          onClick: toggleTheme,
          'aria-label': `Switch to ${isDarkMode ? 'light' : 'dark'} mode`
        }, isDarkMode ? '🌙' : '☀️')
      )
    ),

    // Hero Section - Simplified and Focused
    React.createElement('div', {
      className: 'pool-hero-card animate-on-mount',
      style: {
        background: 'var(--color-background)',
        borderRadius: 'var(--neuro-radius-lg)',
        padding: '32px',
        boxShadow: 'var(--neuro-shadow-raised)',
        marginBottom: '24px',
        position: 'relative',
        overflow: 'hidden'
      }
    },
      // Subtle gradient overlay
      React.createElement('div', {
        style: {
          position: 'absolute',
          top: 0,
          right: 0,
          width: '40%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.03) 100%)',
          pointerEvents: 'none'
        }
      }),

      // Main Hero Content
      React.createElement('div', {
        className: 'pool-hero-content',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          position: 'relative',
          zIndex: 1
        }
      },
        // Left side - Pool info
        React.createElement('div', { className: 'pool-info-section' },
          React.createElement('h1', {
            className: 'pool-symbol-hero',
            style: {
              fontSize: 'var(--font-size-4xl)',
              fontWeight: '900',
              color: 'var(--color-text)',
              marginBottom: '8px',
              fontFamily: 'monospace',
              lineHeight: '1.1'
            }
          }, pool.symbol),

          React.createElement('div', {
            className: 'pool-meta-simplified',
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
              fontSize: 'var(--font-size-lg)',
              color: 'var(--color-text-secondary)'
            }
          },
            React.createElement('span', {
              className: 'protocol-name',
              style: {
                color: 'var(--color-text)',
                fontWeight: 'var(--font-weight-semibold)'
              }
            }, pool.project),
            React.createElement('span', { className: 'separator' }, '•'),
            React.createElement('span', {
              className: 'chain-name',
              style: { color: 'var(--color-primary)' }
            }, pool.chain)
          ),

          React.createElement('div', {
            className: 'pool-type-badge-hero',
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--color-background)',
              color: 'var(--color-primary)',
              padding: '8px 16px',
              borderRadius: 'var(--neuro-radius-lg)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              boxShadow: 'var(--neuro-shadow-pressed)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }
          }, poolType),

          // Trust indicators
          React.createElement('div', {
            className: 'trust-indicators',
            style: {
              display: 'flex',
              gap: '8px',
              marginTop: '16px'
            }
          },
            React.createElement('div', {
              className: 'trust-badge',
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                background: 'var(--color-background)',
                borderRadius: 'var(--neuro-radius-md)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-success)',
                boxShadow: 'var(--neuro-shadow-pressed)'
              }
            }, t ? t('verified') : '✓ Verified'),
            React.createElement('div', {
              className: 'tvl-badge',
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                background: 'var(--color-background)',
                borderRadius: 'var(--neuro-radius-md)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                boxShadow: 'var(--neuro-shadow-pressed)'
              }
            },
              AnimatedNumber ? React.createElement(AnimatedNumber, {
                value: pool.tvlUsd,
                formatFn: (v) => formatCurrency(v) + ' TVL',
                duration: 1200
              }) : formatCurrency(pool.tvlUsd) + ' TVL'
            ),
            // Risk level chip (210) — moved from the standalone risk-card into
            // the trust-indicator row, alongside Verified + TVL. Same
            // inline-style shape as the trust-badge/tvl-badge siblings above
            // (copied verbatim), text colored by riskAssessment.color.
            // className: 'trust-badge' is REUSE, not a new class — post-210
            // verifier check confirmed pool-detail-styles.css:954-961's
            // .trust-badge rule only sets `transition` + a `:hover`
            // transform/shadow; it never touches `color`, so it cannot
            // override this chip's inline riskAssessment.color. Reusing it
            // (a) matches the "✓ Verified" sibling's subtle hover lift and
            // (b) gives this chip a real CSS-class hook for tests/the audit
            // scanner, which a fully classless div could not offer.
            // riskAssessment.description stays reachable via the title
            // attribute rather than being dropped.
            React.createElement('div', {
              className: 'trust-badge',
              title: riskAssessment.description,
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                background: 'var(--color-background)',
                borderRadius: 'var(--neuro-radius-md)',
                fontSize: 'var(--font-size-xs)',
                color: riskAssessment.color,
                boxShadow: 'var(--neuro-shadow-pressed)'
              }
            }, `${t ? t('riskAssessment') : 'Risk Assessment'}: ${riskAssessment.level}`)
          )
        ),

        // Right side — unified action card
        React.createElement('div', {
          className: 'pool-action-card'
        },
          // APY section
          React.createElement('div', { className: 'pool-action-apy' },
            React.createElement('div', { className: 'pool-action-apy-label' },
              t ? t('totalApy') : 'Total APY'
            ),
            React.createElement('div', { className: 'apy-value-hero' },
              AnimatedNumber ? React.createElement(AnimatedNumber, {
                value: (pool.apyBase || 0) + (pool.apyReward || 0),
                formatFn: (v) => _formatApy(v),
                duration: 1500
              }) : formatAPY(pool.apyBase, pool.apyReward)
            ),
            (pool.apyBase > 0 && pool.apyReward > 0) && React.createElement('div', {
              className: 'pool-action-apy-breakdown'
            },
              React.createElement('span', null, t ? t('baseApyBreakdown', _formatApy(pool.apyBase).replace('%','')) : `${_formatApy(pool.apyBase)} Base`),
              React.createElement('span', { className: 'pool-action-apy-sep' }, ' · '),
              React.createElement('span', null, t ? t('rewardApyBreakdown', _formatApy(pool.apyReward).replace('%','')) : `+${_formatApy(pool.apyReward)} Rewards`)
            )
          ),

          // Rate-quality note tier (210 A3) — relocated verbatim (conditions,
          // classes, inline styles, copy unchanged; only marginBottom tightened
          // to 0 since .pool-action-card's flex column already applies a 10px
          // gap between children) from Pool Information, directly under the
          // APY it qualifies. Mutually-exclusive tier chain — exactly one of
          // the three renders. LEFT IN Pool Information (unmoved):
          // .rate-momentum-note (103) and .tvl-trend-note (104).

          // Rate-volatility honesty note (071).
          (mean30dSane &&
            ((pool.apyBase || 0) + (pool.apyReward || 0)) > 0 &&
            pool.apyMean30d > 0 &&
            (Math.max((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d) /
              Math.min((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d)) >= 1.5) &&
          React.createElement('div', {
            className: 'rate-volatility-note',
            style: {
              background: 'var(--color-background)',
              borderRadius: 'var(--neuro-radius-sm)',
              boxShadow: 'var(--neuro-shadow-subtle)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
              lineHeight: '1.5',
              padding: '12px 16px',
              marginBottom: '0'
            }
          },
            t
              ? t('rateVolatilityNote', _formatApy((pool.apyBase || 0) + (pool.apyReward || 0)), _formatApy(pool.apyMean30d))
              : `This pool's rate moves a lot: ${_formatApy((pool.apyBase || 0) + (pool.apyReward || 0))} right now vs a ${_formatApy(pool.apyMean30d)} 30-day average. Reward emissions change daily — projections on this page use the current rate and will move with it.`
          ),

          // Rate-track-record note (088.1).
          (!(mean30dSane &&
            ((pool.apyBase || 0) + (pool.apyReward || 0)) > 0 &&
            pool.apyMean30d > 0 &&
            (Math.max((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d) /
              Math.min((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d)) >= 1.5) &&
            pool.kpis && typeof pool.kpis === 'object' && Number(pool.kpis.historyPoints) >= 1) &&
          React.createElement('div', {
            className: 'rate-track-record-note',
            style: {
              background: 'var(--color-background)',
              borderRadius: 'var(--neuro-radius-sm)',
              boxShadow: 'var(--neuro-shadow-subtle)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
              lineHeight: '1.5',
              padding: '12px 16px',
              marginBottom: '0'
            }
          },
            (function () {
              var _cur = (pool.apyBase || 0) + (pool.apyReward || 0);
              var _k = pool.kpis;
              var hp = Number(_k.historyPoints);
              var stdev = (typeof _k.apyStdev === 'number') ? _k.apyStdev : null;
              if (hp < 7) {
                return t
                  ? t('rateTrackRecordNew')
                  : "We're still building this pool's rate history — not a long enough track record yet to judge how steady it is. A longer history makes a rate easier to trust.";
              }
              if (stdev !== null && _cur > 0 && (stdev / _cur) <= 0.2) {
                return t
                  ? t('rateTrackRecordSteady', hp)
                  : `Steady so far: across the ${hp} days we've tracked it, this pool's rate has stayed close to level. Steadier rates are easier to plan a garden around.`;
              }
              return t
                ? t('rateTrackRecordTracked', hp)
                : `We've been tracking this pool's rate for ${hp} days. Watching how a rate holds up over time is one honest way to judge it.`;
            })()
          ),

          // Rate-history-unavailable note (207).
          (!(mean30dSane &&
            ((pool.apyBase || 0) + (pool.apyReward || 0)) > 0 &&
            pool.apyMean30d > 0 &&
            (Math.max((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d) /
              Math.min((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d)) >= 1.5) &&
            !(pool.kpis && typeof pool.kpis === 'object') &&
            historyLookupSettled) &&
          React.createElement('div', {
            className: 'rate-history-unavailable-note',
            style: {
              background: 'var(--color-background)',
              borderRadius: 'var(--neuro-radius-sm)',
              boxShadow: 'var(--neuro-shadow-subtle)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
              lineHeight: '1.5',
              padding: '12px 16px',
              marginBottom: '0'
            }
          },
            t
              ? t('rateHistoryUnavailable')
              : "We don't have a rate history for this pool — we track rates day by day only for the largest pools, so there's nothing here to judge how steady this one has been. The rate above is live from DefiLlama."
          ),

          // Divider
          React.createElement('div', { className: 'pool-action-divider' }),

          // Primary CTA — garden this pool (deep-links into the planner
          // prefilled with a persona/goal/monthly matching this pool's risk tier)
          // Hero primary CTA (210): label shortened to the plain generic
          // string — the ~$X in 5y concrete projection now lives at the
          // earnings-block repeat CTA where the user has parameterised the
          // input. ctaVariant is hardcoded 'generic' to match (was
          // showConcreteCta ? 'concrete' : 'generic', which no longer
          // reflects what's on the button).
          React.createElement('a', {
            className: 'cta-button-primary',
            href: gardenThisPoolHref,
            onClick: () => {
              if (typeof Analytics !== 'undefined') {
                Analytics.trackPoolClick(pool, 'garden_cta', {
                  investmentAmount: Math.round(investmentAmount),
                  projectionYears: PROJECTION_YEARS,
                  ctaVariant: 'generic',
                  ctaPlacement: 'hero'
                });
              }
            }
          }, t ? t('gardenThisPoolCta') : 'Garden this pool →'),
          React.createElement('p', { className: 'pool-action-hint' },
            t ? t('plannerCtaHint') : 'No wallet needed'
          ),

          // Secondary — protocol link, or an honest DefiLlama fallback when
          // no protocol URL resolves at all (spec 182 leg B/D). Reads as
          // secondary today via .cta-button-protocol's existing muted
          // surface/text-secondary treatment vs .cta-button-primary's solid
          // fill (210 A5) — no style change needed here.
          ...renderProtocolCtaBlock('hero')
        )
      )
    ),

    // Collapsible Yield Calculator — now the single "your garden" earnings
    // block (210 B). The standalone pool-projection-card ("THE LONG GAME")
    // and the entire quick-metrics grid (daily card, monthly card, risk card)
    // that used to render here as top-level sections are gone; their content
    // (risk -> hero trust-indicators chip, projection copy -> inside this
    // block below the input, daily/monthly -> the 1D/7D/30D toggle result)
    // now lives input-first inside calculator-compact's expanded content.
    React.createElement('div', {
      className: `calculator-compact animate-on-mount ${calculatorExpanded ? 'expanded' : ''}`,
      style: {
        background: 'var(--color-background)',
        borderRadius: 'var(--neuro-radius-lg)',
        padding: calculatorExpanded ? '24px' : '20px',
        boxShadow: calculatorExpanded ? 'var(--neuro-shadow-raised)' : 'var(--neuro-shadow-pressed)',
        marginBottom: '32px',
        transition: 'all 0.3s ease'
      }
    },
      // Calculator Header
      React.createElement('div', {
        className: 'calculator-header',
        onClick: () => setCalculatorExpanded(!calculatorExpanded),
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: calculatorExpanded ? '24px' : '0'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }
        },
          React.createElement('div', null,
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-text)'
              }
            }, t ? t('calculateYourEarnings') : 'Calculate Your Earnings'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                marginTop: '2px'
              }
            }, t ? t('calcSubPrompt') : 'See your daily, weekly & monthly returns')
          )
        ),
        React.createElement('div', {
          className: 'calculator-toggle',
          style: {
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--color-background)',
            boxShadow: 'var(--neuro-shadow-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.3s ease',
            transform: calculatorExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }
        }, '▼')
      ),

      // Expanded Calculator Content
      calculatorExpanded && React.createElement('div', {
        className: 'calculator-content',
        style: {
          animation: 'fadeIn 0.3s ease'
        }
      },
        // Investment Input
        React.createElement('div', {
          className: 'investment-input-group',
          style: {
            marginBottom: '24px',
            textAlign: 'center'
          }
        },
          React.createElement('div', {
            className: 'input-wrapper',
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '16px'
            }
          },
            React.createElement('span', {
              style: {
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--color-text-secondary)'
              }
            }, '$'),
            React.createElement('input', {
              type: 'number',
              className: 'amount-input',
              value: investmentAmount,
              onChange: (e) => {
                const newAmount = Number(e.target.value) || 0;
                setInvestmentAmount(newAmount);
                // Analytics tracking for yield calculation
                if (typeof Analytics !== 'undefined' && newAmount > 0) {
                  const calculatedYields = calculateYields(newAmount, (pool.apyBase || 0) + (pool.apyReward || 0));
                  Analytics.trackYieldCalculation(newAmount, pool, {
                    calculatedYields,
                    trigger: 'manual_input'
                  });
                }
              },
              min: '0',
              step: '100',
              style: {
                width: '180px',
                padding: '12px 16px',
                border: 'none',
                borderRadius: 'var(--neuro-radius-md)',
                background: 'var(--color-background)',
                color: 'var(--color-text)',
                fontSize: 'var(--font-size-lg)',
                fontWeight: 'var(--font-weight-medium)',
                textAlign: 'center',
                boxShadow: 'var(--neuro-shadow-pressed)',
                outline: 'none'
              }
            })
          ),

          // Quick Amount Buttons
          React.createElement('div', {
            style: {
              display: 'flex',
              gap: '8px',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: '16px'
            }
          },
            [100, 500, 1000, 2000, 5000, 10000, 100000].map(amount =>
              React.createElement('button', {
                key: amount,
                onClick: () => {
                  setInvestmentAmount(amount);
                  // Analytics tracking for preset amount selection
                  if (typeof Analytics !== 'undefined') {
                    const calculatedYields = calculateYields(amount, (pool.apyBase || 0) + (pool.apyReward || 0));
                    Analytics.trackYieldCalculation(amount, pool, {
                      calculatedYields,
                      trigger: 'preset_button'
                    });
                  }
                },
                onMouseEnter: (e) => {
                  if (investmentAmount !== amount) {
                    e.target.style.boxShadow = 'var(--neuro-shadow-flat)';
                    e.target.style.transform = 'translateY(-1px)';
                  }
                },
                onMouseLeave: (e) => {
                  if (investmentAmount !== amount) {
                    e.target.style.boxShadow = 'var(--neuro-shadow-subtle)';
                    e.target.style.transform = 'translateY(0)';
                  }
                },
                style: {
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 'var(--neuro-radius-md)',
                  background: investmentAmount === amount ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: investmentAmount === amount ? 'white' : 'var(--color-text)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: investmentAmount === amount ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
                  boxShadow: 'var(--neuro-shadow-subtle)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  minHeight: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }
              }, `$${amount >= 1000 ? `${amount / 1000}k` : amount}`)
            )
          )
        ),

        // Long Game headline (210 B2b) — the former standalone
        // pool-projection-card, relocated verbatim (copy/classes/conditions
        // unchanged) INPUT-FIRST inside the earnings block: it recomputes
        // live from investmentAmount above, so the user sets their number
        // before reading this result. Its own .calc-disclaimer is dropped
        // here — the block keeps exactly ONE disclaimer, near the calculator
        // readout below (210 B2d).
        React.createElement('div', {
          className: 'metric-card-simple pool-projection-card',
          style: {
            background: 'var(--color-background)',
            borderRadius: 'var(--neuro-radius-lg)',
            padding: '24px',
            boxShadow: 'var(--neuro-shadow-raised)',
            marginBottom: '24px',
            textAlign: 'center'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: '8px',
              fontWeight: 'var(--font-weight-medium)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }
          }, t ? t('projectionHeading') : 'The Long Game'),
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text)',
              lineHeight: '1.4'
            }
          }, isAnomalous
            // 165: an out-of-rail totalApy compounds into a fictional dollar figure
            // (e.g. $49 quintillion) — never derive $ from it. Honest replacement
            // line, no numbers to rail. Hero APY keeps rendering the raw rate
            // elsewhere (demote + flag convention) — this gate is display-only,
            // on this node.
            ? (t ? t('projectionBodyOutOfRange') : 'This rate is too far outside normal ranges to project a dollar amount from — the number would be fiction, not a forecast.')
            : (t ? t('projectionBody', investmentAmount, PROJECTION_YEARS, projectionAmount) :
                `$${Number(investmentAmount || 0).toLocaleString('en-US')} in this pool grows to ~${_formatUsd(projectionAmount, 0)} in ${PROJECTION_YEARS}y at current rates.`)),
          // Yield-funded thesis line (129): the deposit stays the user's — you keep
          // your money AND it keeps working. Honest framing, no numbers to rail.
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginTop: '8px',
              lineHeight: '1.4'
            }
          }, t ? t('projectionKeepNote') : 'Your deposit stays yours — you keep your money, and it keeps working.')
          // The degen-haircut warning and the isAnomalous warning that used to
          // render here moved OUT of this card (still verbatim class/copy) —
          // see the trust-rail fix below the collapsible content. They must
          // survive .calculatorExpanded being false, so they cannot live
          // inside this node (which is itself inside the calculatorExpanded
          // && guard).
        ),

        // Tab Navigation for Time Periods
        React.createElement('div', {
          style: {
            display: 'flex',
            gap: '4px',
            marginBottom: '24px',
            background: 'var(--color-background)',
            borderRadius: 'var(--neuro-radius-md)',
            padding: '4px',
            boxShadow: 'var(--neuro-shadow-pressed)'
          }
        },
          ['1day', '7days', '30days'].map(tab => {
            const tabLabels = {
              '1day': '1 Day',
              '7days': '7 Days',
              '30days': '30 Days'
            };

            return React.createElement('button', {
              key: tab,
              onClick: () => setActiveCalculatorTab(tab),
              onMouseEnter: (e) => {
                if (activeCalculatorTab !== tab) {
                  e.target.style.boxShadow = 'var(--neuro-shadow-flat)';
                  e.target.style.transform = 'translateY(-1px)';
                }
              },
              onMouseLeave: (e) => {
                if (activeCalculatorTab !== tab) {
                  e.target.style.boxShadow = 'var(--neuro-shadow-raised)';
                  e.target.style.transform = 'translateY(0)';
                }
              },
              style: {
                flex: 1,
                padding: '8px 12px',
                border: 'none',
                borderRadius: 'var(--neuro-radius-md)',
                background: activeCalculatorTab === tab ? 'var(--color-primary)' : 'var(--color-surface)',
                color: activeCalculatorTab === tab ? 'white' : 'var(--color-text)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: activeCalculatorTab === tab ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
                boxShadow: 'var(--neuro-shadow-subtle)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minHeight: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }
            }, tabLabels[tab]);
          })
        ),

        // Primary Yield Result (based on selected tab)
        React.createElement('div', {
          style: {
            background: 'var(--color-background)',
            borderRadius: 'var(--neuro-radius-lg)',
            padding: '24px',
            textAlign: 'center',
            boxShadow: 'var(--neuro-shadow-raised)',
            marginBottom: '16px'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-base)',
              color: 'var(--color-text-secondary)',
              marginBottom: '8px',
              fontWeight: 'var(--font-weight-medium)',
              cursor: 'help',
              position: 'relative',
              display: 'inline-block'
            },
            onMouseEnter: (e) => {
              const tooltip = document.createElement('div');
              tooltip.textContent = 'Calculations are estimates. Actual yields may vary based on market conditions.';
              tooltip.style.cssText = `
                position: absolute;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                background: var(--color-text);
                color: var(--color-background);
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 1000;
                margin-bottom: 5px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              `;
              tooltip.id = 'earnings-tooltip';
              e.target.appendChild(tooltip);
            },
            onMouseLeave: (e) => {
              const tooltip = document.getElementById('earnings-tooltip');
              if (tooltip) tooltip.remove();
            }
          }, activeCalculatorTab === '1day' ? (t ? t('estimatedDailyEarnings') : 'Estimated Daily Earnings') :
            activeCalculatorTab === '7days' ? (t ? t('estimatedEarnings') : 'Estimated Weekly Earnings') :
              (t ? t('estimatedMonthlyEarnings') : 'Estimated Monthly Earnings')),
          React.createElement('div', {
            className: isPulsing ? 'yield-pulse-active' : '',
            style: {
              fontSize: 'var(--font-size-3xl)',
              fontWeight: '900',
              background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-forest) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: '1.1',
              marginBottom: '8px',
              transition: 'transform 0.15s ease-out'
            }
          }, isAnomalous ? '—' :
            (activeCalculatorTab === '1day' ? _formatUsd(investmentAmount * totalApy / 365 / 100) :
              activeCalculatorTab === '7days' ? _formatUsd(investmentAmount * totalApy / 52 / 100) :
                _formatUsd(investmentAmount * totalApy / 12 / 100))),
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              fontWeight: 'var(--font-weight-medium)'
            }
          }, t ? t('basedOnInvestment', investmentAmount) : `Based on $${investmentAmount.toLocaleString('en-US')} investment`)
          // The ONE .calc-disclaimer for the whole earnings block moved OUT of
          // this node — see the trust-rail fix below the collapsible content
          // (it must survive calculatorExpanded===false). The isAnomalous
          // .calc-warning that used to duplicate here (210 B2e) stays removed
          // — the single anomaly warning below covers this block.
        ),

      ),

      // Trust-rail fix (post-210 verifier round): the degen-haircut warning,
      // the anomalous-pool warning, and the single .calc-disclaimer MUST
      // render regardless of whether the user has collapsed the calculator
      // — collapsing must never silently drop a trust-rail disclosure or
      // leave the moved repeat CTA's concrete "~$X in 5y" projection label
      // undisclaimed. So these three are siblings of the calculatorExpanded
      // && block above (not nested inside it), placed AFTER the collapsible
      // content and BEFORE the repeat CTA. Same classes/copy as before
      // (verbatim) — only their position in the tree moved from "inside the
      // guard" to "always". In the default expanded state this renders in
      // the exact same visual order as before (right after the toggle+
      // readout, right before the repeat CTA).
      applyDegenHaircut && React.createElement('div', { className: 'calc-warning' },
        t ? t('poolDegenHaircutNote', _formatApy(totalApy)) : `Projected at ⅓ haircut (${_formatApy(totalApy)} headline) — farm rates decay. Active management required.`
      ),
      isAnomalous && React.createElement('div', { className: 'calc-warning' },
        t ? t('calcAnomalyWarning') : '⚠ This rate is anomalous and almost certainly unsustainable.'
      ),
      React.createElement('div', { className: 'calc-disclaimer' },
        t ? t('calcDisclaimer') : 'Estimates based on current rates — yields change constantly. Not financial advice.'
      ),

      // Repeat CTA (210 B3) — moved from the page bottom (after Pool
      // Information) to the end of the earnings block, the intent peak: the
      // moment the user has parameterised the projection with their own
      // amount. Sits OUTSIDE the calculatorExpanded && conditional above (a
      // sibling, not nested inside it) so it still renders whether or not
      // the user has collapsed the calculator. Reuses .pool-action-card
      // markup verbatim; this KEEPS the concrete showConcreteCta projection
      // label (by now the user has set their own input) — only ctaPlacement
      // changes, from 'repeat_footer' to 'earnings_block', on both the
      // garden CTA payload and the renderProtocolCtaBlock call, so hero-vs-
      // earnings-block click share reads from the existing event with no new
      // instrumentation.
      React.createElement('div', {
        className: 'pool-action-card',
        style: { maxWidth: '420px', margin: '32px auto 0' }
      },
        React.createElement('p', {
          style: {
            fontSize: 'var(--font-size-base)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text)',
            textAlign: 'center',
            margin: 0
          }
        }, t ? t('repeatCtaHeading') : 'Ready to start this garden?'),

        // Primary CTA — garden this pool (repeat)
        React.createElement('a', {
          className: 'cta-button-primary',
          href: gardenThisPoolHref,
          onClick: () => {
            if (typeof Analytics !== 'undefined') {
              Analytics.trackPoolClick(pool, 'garden_cta', {
                investmentAmount: Math.round(investmentAmount),
                projectionYears: PROJECTION_YEARS,
                ctaVariant: showConcreteCta ? 'concrete' : 'generic',
                ctaPlacement: 'earnings_block'
              });
            }
          }
        }, showConcreteCta
          ? (t ? t('gardenThisPoolCtaConcrete', projectionAmount, PROJECTION_YEARS)
               : `Garden this pool → ~$${Math.round(projectionAmount).toLocaleString('en-US')} in ${PROJECTION_YEARS}y`)
          : (t ? t('gardenThisPoolCta') : 'Garden this pool →')),
        React.createElement('p', { className: 'pool-action-hint' },
          t ? t('plannerCtaHint') : 'No wallet needed'
        ),

        // Secondary — protocol link, or an honest DefiLlama fallback when no
        // protocol URL resolves at all (spec 182 leg B/D), repeated.
        ...renderProtocolCtaBlock('earnings_block')
      )
    ),

    // Collapsible Pool Information
    React.createElement('div', {
      className: `pool-info-section animate-on-mount ${poolInfoExpanded ? 'expanded' : ''}`,
      style: {
        background: 'var(--color-background)',
        borderRadius: 'var(--neuro-radius-lg)',
        padding: poolInfoExpanded ? '24px' : '20px',
        boxShadow: poolInfoExpanded ? 'var(--neuro-shadow-raised)' : 'var(--neuro-shadow-pressed)',
        marginBottom: '32px',
        transition: 'all 0.3s ease'
      }
    },
      // Pool Info Header
      React.createElement('div', {
        className: 'pool-info-header',
        onClick: () => setPoolInfoExpanded(!poolInfoExpanded),
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: poolInfoExpanded ? '20px' : '0'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }
        },
          React.createElement('h3', {
            style: {
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-bold)',
              color: 'var(--color-text)',
              margin: 0
            }
          }, t ? t('poolInformation') : 'Pool Information'),
          protocolUrl && React.createElement('a', {
            href: protocolUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
            onClick: (e) => e.stopPropagation(),
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              background: 'var(--color-background)',
              color: 'var(--color-primary)',
              textDecoration: 'none',
              borderRadius: 'var(--neuro-radius-sm)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-medium)',
              boxShadow: 'var(--neuro-shadow-subtle)',
              transition: 'all 0.2s ease'
            }
          }, t ? t('protocol') : 'Protocol↗')
        ),
        React.createElement('div', {
          className: 'pool-info-toggle',
          style: {
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'var(--color-background)',
            boxShadow: 'var(--neuro-shadow-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.3s ease',
            transform: poolInfoExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }
        }, '▼')
      ),

      // Expanded Pool Information Content
      poolInfoExpanded && React.createElement('div', {
        className: 'pool-info-content',
        style: {
          animation: 'fadeIn 0.3s ease'
        }
      },
        // Rate-momentum honesty note (103) — full-width, calm. Reuses 071's
        // exact neuro styling. Surfaces 087's kpis.apyMomentum (last − first
        // total APY over the tracked window) as calm cautious-saver language:
        // rising AND falling rates said out loud (degen-honesty precedent).
        // Yields entirely to the 071 volatility note (same divergence boolean)
        // so the two are mutually exclusive, renders nothing when kpis/momentum
        // are missing (live SEO deep-link landings), needs a ≥7-day window, and
        // stays silent below a meaningful move (|momentum| < 0.5, 088.1 covers).
        // Promoted (210 C3) above the tile grid — prose insight outranks
        // reference data.
        (!(mean30dSane &&
          ((pool.apyBase || 0) + (pool.apyReward || 0)) > 0 &&
          pool.apyMean30d > 0 &&
          (Math.max((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d) /
            Math.min((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d)) >= 1.5) &&
          pool.kpis && typeof pool.kpis === 'object' &&
          typeof pool.kpis.apyMomentum === 'number' &&
          Number(pool.kpis.historyPoints) >= 7 &&
          Math.abs(pool.kpis.apyMomentum) >= 0.5) &&
        React.createElement('div', {
          className: 'rate-momentum-note',
          style: {
            background: 'var(--color-background)',
            borderRadius: 'var(--neuro-radius-sm)',
            boxShadow: 'var(--neuro-shadow-subtle)',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--font-size-sm)',
            lineHeight: '1.5',
            padding: '12px 16px',
            marginBottom: '20px'
          }
        },
          (function () {
            var mom = pool.kpis.apyMomentum;
            var hp = Number(pool.kpis.historyPoints);
            if (mom >= 0.5) {
              return t
                ? t('rateMomentumRising', _formatApy(Math.abs(mom)), hp)
                : `This pool's rate has climbed about ${_formatApy(Math.abs(mom))} over the ${hp} days we've tracked it. Rates that rose can slip back just as easily — this page projects on today's rate, not the climb.`;
            }
            return t
              ? t('rateMomentumFalling', _formatApy(Math.abs(mom)), hp)
              : `This pool's rate has eased down about ${_formatApy(Math.abs(mom))} over the ${hp} days we've tracked it. Falling rates are normal once reward emissions taper — worth knowing before you plan a garden around today's number.`;
          })()
        ),

        // TVL-trend honesty note (104) — full-width, calm. Reuses 071's exact
        // neuro styling. Surfaces 087's kpis.tvlTrend (signed fraction of the
        // deposit-base change over the tracked window) as calm cautious-saver
        // language: a shrinking pool that still clears the $10M floor is the
        // ICP-relevant risk; a growing pool is one honest sign, never a
        // guarantee. Yields entirely to the 071 volatility note (same
        // divergence boolean) so a volatile pool shows exactly one note,
        // renders nothing when kpis/tvlTrend are missing (live SEO deep-link
        // landings), needs a ≥7-point window, and stays silent below a
        // meaningful move (|tvlTrend| < 0.25). Promoted (210 C3) above the
        // tile grid — prose insight outranks reference data.
        (!(mean30dSane &&
          ((pool.apyBase || 0) + (pool.apyReward || 0)) > 0 &&
          pool.apyMean30d > 0 &&
          (Math.max((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d) /
            Math.min((pool.apyBase || 0) + (pool.apyReward || 0), pool.apyMean30d)) >= 1.5) &&
          pool.kpis && typeof pool.kpis === 'object' &&
          typeof pool.kpis.tvlTrend === 'number' &&
          Number(pool.kpis.historyPoints) >= 7 &&
          Math.abs(pool.kpis.tvlTrend) >= 0.25) &&
        React.createElement('div', {
          className: 'tvl-trend-note',
          style: {
            background: 'var(--color-background)',
            borderRadius: 'var(--neuro-radius-sm)',
            boxShadow: 'var(--neuro-shadow-subtle)',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--font-size-sm)',
            lineHeight: '1.5',
            padding: '12px 16px',
            marginBottom: '20px'
          }
        },
          (function () {
            var tvl = pool.kpis.tvlTrend;
            var hp = Number(pool.kpis.historyPoints);
            var pctStr = _formatNum(Math.round(Math.abs(tvl) * 100)) + '%';
            if (tvl <= -0.25) {
              return t
                ? t('tvlTrendShrinking', pctStr, hp)
                : "This pool's deposits have shrunk about " + pctStr + " over the " + hp + " days we've tracked it. A pool can keep clearing our $10M size floor while quietly losing deposits — worth watching for a garden you plan to hold for years.";
            }
            return t
              ? t('tvlTrendGrowing', pctStr, hp)
              : "This pool's deposits have grown about " + pctStr + " over the " + hp + " days we've tracked it. More deposits isn't a guarantee, but a pool that's holding or gaining size is one honest sign of staying power.";
          })()
        ),

        // APY Breakdown Grid
        React.createElement('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginBottom: '20px'
          }
        },
          // TVL tile (210 C2) — replaces the removed Base APY/Reward APY/Pool
          // Type tiles (all three duplicated the hero); same tile shape,
          // existing t('tvl') key (EN/KO already present), and the same
          // formatCurrency helper the hero's tvl-badge uses.
          React.createElement('div', {
            style: {
              padding: '12px',
              background: 'var(--color-background)',
              borderRadius: 'var(--neuro-radius-sm)',
              boxShadow: 'var(--neuro-shadow-subtle)',
              textAlign: 'center'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                marginBottom: '4px',
                textTransform: 'uppercase'
              }
            }, t ? t('tvl') : 'TVL'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text)'
              }
            }, formatCurrency(pool.tvlUsd))
          ),

          // 30d Mean APY (if available) — substantiates whether today's rate is stable or a spike
          mean30dSane && React.createElement('div', {
            style: {
              padding: '12px',
              background: 'var(--color-background)',
              borderRadius: 'var(--neuro-radius-sm)',
              boxShadow: 'var(--neuro-shadow-subtle)',
              textAlign: 'center'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                marginBottom: '4px',
                textTransform: 'uppercase'
              }
            }, t ? t('apyMean30d') : '30d Mean APY'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text)'
              }
            }, _formatApy(pool.apyMean30d))
          ),

          // Exposure (if available)
          pool.exposure && React.createElement('div', {
            style: {
              padding: '12px',
              background: 'var(--color-background)',
              borderRadius: 'var(--neuro-radius-sm)',
              boxShadow: 'var(--neuro-shadow-subtle)',
              textAlign: 'center'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                marginBottom: '4px',
                textTransform: 'uppercase'
              }
            }, t ? t('exposure') : 'Exposure'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text)',
                textTransform: 'capitalize'
              }
            }, pool.exposure)
          ),

          // IL Risk (if available) — flagged in warning color when present, never hidden
          pool.ilRisk && React.createElement('div', {
            style: {
              padding: '12px',
              background: 'var(--color-background)',
              borderRadius: 'var(--neuro-radius-sm)',
              boxShadow: 'var(--neuro-shadow-subtle)',
              textAlign: 'center'
            }
          },
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                marginBottom: '4px',
                textTransform: 'uppercase'
              }
            }, t ? t('ilRisk') : 'IL Risk'),
            React.createElement('div', {
              style: {
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: pool.ilRisk === 'yes' ? 'var(--color-warning)' : 'var(--color-text)',
                textTransform: 'capitalize'
              }
            }, pool.ilRisk === 'yes' ? (t ? t('yes') : 'Yes') : (t ? t('no') : 'No'))
          )
        ),

        // Tokens Section (if available)
        (pool.underlyingTokens && pool.underlyingTokens.length > 0) &&
        React.createElement('div', {
          style: {
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid rgba(59, 130, 246, 0.1)'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: '8px',
              fontWeight: 'var(--font-weight-medium)'
            }
          }, t ? t('underlyingAssets') : 'Underlying Assets'),
          React.createElement('div', {
            style: {
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px'
            }
          },
            pool.underlyingTokens.map((token, idx) => {
              const classified = classifyUnderlyingToken(token, pool.chain);

              if (classified.chip) {
                // Shared chip style (spec 195 §2) — identical box for both the
                // linked <a> and unlinked <span> variants; only `color` and
                // element type differ below. Zero new CSS, zero new tokens.
                const chipStyle = {
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 10px',
                  background: 'var(--color-background)',
                  borderRadius: 'var(--neuro-radius-sm)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-medium)',
                  boxShadow: 'var(--neuro-shadow-subtle)',
                  fontFamily: 'monospace'
                };
                const address = classified.address;

                // Derive display symbol from pool.symbol split on '-' or '/'.
                // addressCount now counts every chip-classified token (not
                // just EVM), so this stays a no-op for EVM-only pools (the
                // count is identical to the old EVM-only filter there).
                const symbolParts = pool.symbol ? pool.symbol.split(/[-\/]/).map(s => s.trim()) : [];
                const addressCount = pool.underlyingTokens.filter(t => classifyUnderlyingToken(t, pool.chain).chip).length;
                const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
                const displayText = (symbolParts.length === addressCount && symbolParts[idx])
                  ? symbolParts[idx]
                  : truncated;

                if (classified.href) {
                  return React.createElement('a', {
                    key: idx,
                    href: classified.href,
                    target: '_blank',
                    rel: 'noopener noreferrer',
                    title: token,
                    style: Object.assign({}, chipStyle, {
                      color: 'var(--color-primary)',
                      textDecoration: 'none',
                      transition: 'all 0.2s ease'
                    })
                  }, displayText + ' ↗');
                }

                // Rule 5 (opaque non-EVM id, e.g. Stellar/Stacks): chip for
                // the truncation treatment, but never a link — we don't know
                // which explorer (if any) resolves it, and blockscan.com is
                // EVM-only, so a guessed link is a guaranteed 404.
                return React.createElement('span', {
                  key: idx,
                  title: token,
                  style: Object.assign({}, chipStyle, { color: 'var(--color-text)' })
                }, displayText);
              }

              // Rule 6: not address-shaped (e.g. "coingecko:openeden-tbill")
              // — a short readable slug, not an address. Unchanged plain span.
              return React.createElement('span', {
                key: idx,
                style: {
                  padding: '6px 10px',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)',
                  borderRadius: 'var(--neuro-radius-sm)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-medium)',
                  boxShadow: 'var(--neuro-shadow-subtle)'
                }
              }, token);
            })
          )
        )
      )
    ),

  );
}

// Simple fade-in animation for calculator
const fadeInStyles = `
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

// Inject animation styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = fadeInStyles;
  document.head.appendChild(styleSheet);
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PoolDetail;
}