/* Methodology-led DeFi Garden landing (2026-10-24 "The Standard"): hero + search,
 * how the DeFi Score works, a live scored example, coverage and the agent API.
 * Plain React UMD, no JSX or build step. The landing is an entry shell only:
 * real pool data and filtering remain owned by the analytics app. Every number
 * shown comes from CI data (data/landing-pools.json). The score is proprietary
 * (2026-10-25): pillar and band NAMES only, no weights or cutoffs; the track
 * record lives only on /forecast-accuracy. */
(function () {
  'use strict';

  var R = typeof React !== 'undefined' ? React : null;
  if (!R) return;

  var e = R.createElement;
  var useEffect = R.useEffect;
  var useState = R.useState;

  var TOKEN_HINTS = ['USDC', 'USDT', 'DAI', 'ETH', 'WETH', 'BTC', 'WBTC', 'SOL', 'LINK', 'UNI', 'AAVE', 'CRV'];
  var CHAIN_HINTS = ['Arbitrum', 'Base', 'Ethereum', 'Polygon', 'Optimism', 'Solana', 'Avalanche', 'BNB Chain', 'Plasma', 'Celo', 'Gnosis'];
  var PROTOCOL_HINTS = ['Morpho', 'Pendle', 'Aave', 'Compound', 'Curve', 'Uniswap', 'Aerodrome', 'Lido', 'Euler', 'Venus', 'Yearn', 'Raydium', 'Kamino'];

  // Hero underwriting card. Pool list, DeFi Score and 14d forecast come from the
  // CI-baked data/landing-pools.json (generate-landing-pools.js); APY/TVL are
  // overlaid live from DefiLlama's per-pool chart endpoint, falling back to the
  // baked snapshot values (labelled as such) when that fetch fails. Trust rails
  // (window.TRUST_RAILS) are applied to whichever value is displayed.
  var LANDING_POOLS_URL = '/data/landing-pools.json';
  // Pillar NAMES (+ one plain line each); per-pillar values are shown as a TIER
  // (High / Medium / Low) from `defiScore.pillarsTier` emitted by the scoring
  // engine, never a number (owner decision 2026-10-26). No weights, maxima or
  // band cutoffs live in public code (owner decision 2026-10-25).
  var SCORE_PILLARS = [
    { key: 'stability', labelKey: 'uwPillarStability', descKey: 'methPillarStabilityDesc' },
    { key: 'sustainability', labelKey: 'uwPillarSustainability', descKey: 'methPillarSustainabilityDesc' },
    { key: 'stickiness', labelKey: 'uwPillarStickiness', descKey: 'methPillarStickinessDesc' },
    { key: 'liquidity', labelKey: 'uwPillarLiquidity', descKey: 'methPillarLiquidityDesc' }
  ];
  var PILLAR_TIERS = { High: 'uwTierHigh', Medium: 'uwTierMedium', Low: 'uwTierLow' };
  var BAND_NAMES = ['AAA', 'AA', 'A', 'BBB', 'HIGH RISK'];
  // Categories the analytics app can filter on (app.js CATEGORY_TABS; labels
  // come from the root navCat* keys). No per-category counts: the CI data has
  // no category field, so a count here would be a guess.
  var COVERAGE_CATEGORIES = [
    { key: 'Lending', labelKey: 'navCatLending' },
    { key: 'Staking', labelKey: 'navCatStaking' },
    { key: 'LP/DEX', labelKey: 'navCatLpDex' },
    { key: 'Yield Derivatives', labelKey: 'navCatYieldDerivatives' },
    { key: 'RWA', labelKey: 'navCatRwa' }
  ];

  function trackLanding(cta, extra) {
    if (typeof Analytics !== 'undefined' && Analytics.track) {
      Analytics.track('landing_cta_clicked', Object.assign({ cta: cta }, extra || {}));
    }
  }

  function formatCount(value) {
    return new Intl.NumberFormat('en-US').format(value);
  }

  function isNum(value) { return typeof value === 'number' && isFinite(value); }

  function readCoverage(data) {
    var c = data && data.coverage;
    if (!c || !isNum(c.scoredPools) || c.scoredPools <= 0 || !isNum(c.protocols) || !isNum(c.chains)) return null;
    return c;
  }

  function passesTrustRails(pool) {
    var rails = window.TRUST_RAILS;
    if (!rails) return false;
    return typeof pool.apy === 'number' && typeof pool.tvlUsd === 'number' &&
      pool.apy <= rails.APY_SANITY_LIMIT && pool.tvlUsd >= rails.DEFAULT_MIN_TVL;
  }

  function fetchLivePoint(poolId) {
    return fetch(window.LLAMA_ENDPOINTS.chart(poolId))
      .then(function (res) { if (!res.ok) throw new Error('chart ' + res.status); return res.json(); })
      .then(function (body) {
        var series = body && body.data;
        var last = series && series[series.length - 1];
        if (!last || typeof last.apy !== 'number' || typeof last.tvlUsd !== 'number') throw new Error('chart shape');
        return { apy: last.apy, tvlUsd: last.tvlUsd };
      });
  }

  function formatUsdCompact(value) {
    return '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
  }

  function formatPct(value) {
    return Number(value).toFixed(2) + '%';
  }

  function formatScoreDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch (err) { return ''; }
  }

  // goal id -> translations.planner label key (canonical list owned by planner.js
  // GOALS; duplicated read-only here because planner.js is not loaded on the
  // landing route — a static label lookup, not rate math). Unknown ids fail safe
  // to the generic first-time card.
  var GOAL_LABEL_KEYS = {
    spotify: 'goalSpotify', netflix: 'goalNetflix', claude: 'goalClaude', amazonprime: 'goalAmazonPrime',
    disney: 'goalDisney', youtubepremium: 'goalYouTubePremium', max: 'goalMax', hulu: 'goalHulu',
    appletv: 'goalAppleTV', chatgpt: 'goalChatGPT', gamepass: 'goalGamePass', paramount: 'goalParamount',
    peacock: 'goalPeacock', doordash: 'goalDoorDash', uber: 'goalUberOne', audible: 'goalAudible',
    walmart: 'goalWalmart', rent: 'goalRent', phonebill: 'goalPhoneBill', sneakers: 'goalSneakers',
    iphone: 'goalIphone', watches: 'goalWatches', home: 'goalHome', retirement: 'goalRetirement'
  };

  // Read + shallow-validate localStorage['garden-plan']. Returns the plan object
  // only when it carries a recognizable goal we can label; any parse/shape
  // problem fails safe to null (-> generic first-time card). Same try/catch
  // discipline as the theme/lang reads above.
  function readSavedPlan() {
    try {
      var raw = localStorage.getItem('garden-plan');
      if (!raw) return null;
      var plan = JSON.parse(raw);
      if (!plan || typeof plan !== 'object') return null;
      if (typeof plan.goal !== 'string' || !GOAL_LABEL_KEYS[plan.goal]) return null;
      return plan;
    } catch (err) {
      return null;
    }
  }

  var LANDING_LANGS = ['en', 'ko', 'pt', 'es'];
  var LANDING_HTML_LANG = { en: 'en', ko: 'ko', pt: 'pt-BR', es: 'es' };
  function landingLangCode(value) {
    if (typeof normalizeLanguageCode === 'function') return normalizeLanguageCode(value);
    var base = String(value || '').toLowerCase().split('-')[0];
    return LANDING_LANGS.indexOf(base) !== -1 ? base : null;
  }

  // Order: saved localStorage -> ?lang -> browser languages; first supported wins.
  function detectLanguage() {
    try {
      var saved = landingLangCode(localStorage.getItem('defi-garden-lang'));
      if (saved) return saved;
    } catch (err) {}
    var param = landingLangCode(new URLSearchParams(window.location.search).get('lang'));
    if (param) return param;
    var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || 'en'];
    for (var i = 0; i < list.length; i++) {
      var code = landingLangCode(list[i]);
      if (code) return code;
    }
    return 'en';
  }

  function getCopy(language) {
    var lang = translations[language] ? language : 'en';
    return translations[lang].landing || translations.en.landing;
  }

  function initialTheme() {
    try {
      var saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
    } catch (err) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function writeTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (err) {}
  }

  function SearchIcon() {
    return e('svg', {
      className: 'landing-icon', viewBox: '0 0 24 24', width: 23, height: 23,
      preserveAspectRatio: 'xMidYMid meet', fill: 'none', 'aria-hidden': 'true'
    },
      e('circle', { cx: '10.8', cy: '10.8', r: '6.3', stroke: 'currentColor', strokeWidth: '1.8' }),
      e('path', { d: 'm16 16 4.2 4.2', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round' })
    );
  }

  function ArrowIcon() {
    return e('svg', {
      className: 'landing-arrow-icon', viewBox: '0 0 20 20', width: 19, height: 19,
      preserveAspectRatio: 'xMidYMid meet', fill: 'none', 'aria-hidden': 'true'
    },
      e('path', { d: 'M4 10h11M11 5l5 5-5 5', stroke: 'currentColor', strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round' })
    );
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

  function buildSearchHref(query) {
    var clean = String(query || '').trim();
    if (!clean) return null;

    var lower = clean.toLowerCase();
    var params = new URLSearchParams();
    var token = null;
    var chain = null;
    var protocol = null;
    var poolType = null;

    TOKEN_HINTS.some(function (candidate) {
      if (new RegExp('(^|\\s)' + candidate.toLowerCase().replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '(?=\\s|$)', 'i').test(lower)) {
        token = candidate;
        return true;
      }
      return false;
    });

    CHAIN_HINTS.some(function (candidate) {
      if (lower.indexOf(candidate.toLowerCase()) !== -1) {
        chain = candidate;
        return true;
      }
      return false;
    });

    PROTOCOL_HINTS.some(function (candidate) {
      if (lower.indexOf(candidate.toLowerCase()) !== -1) {
        protocol = candidate;
        return true;
      }
      return false;
    });

    if (!protocol) {
      if (/\bstaking\b|\bstake\b/i.test(lower)) {
        poolType = 'Staking';
      } else if (/\blending\b|\blend\b/i.test(lower)) {
        poolType = 'Lending';
      }
    }

    if (!token && !protocol && /^[a-z0-9][a-z0-9._-]*$/i.test(clean)) token = clean.toUpperCase();
    if (!token && !chain && !protocol) {
      var exactChain = CHAIN_HINTS.find(function (candidate) { return candidate.toLowerCase() === lower; });
      if (exactChain) chain = exactChain;
    }

    if (chain) params.set('chain', chain);
    else if (protocol || poolType) params.set('chain', 'All');
    if (token) params.set('token', token);
    if (protocol) params.set('protocols', protocol);
    if (poolType) params.set('poolTypes', poolType);
    if (params.toString()) return '/?' + params.toString();

    // Keep the user inside the authoritative analytics search app for less
    // structured phrases; it will present its own input and filters.
    params.set('app', '1');
    return '/?' + params.toString();
  }

  function Landing() {
    var languageState = useState(detectLanguage());
    var language = languageState[0];
    var setLanguage = languageState[1];
    var queryState = useState('');
    var query = queryState[0];
    var setQuery = queryState[1];
    var themeState = useState(initialTheme());
    var dark = themeState[0];
    var setDark = themeState[1];
    var menuState = useState(false);
    var menuOpen = menuState[0];
    var setMenuOpen = menuState[1];
    var scrollState = useState(false);
    var isScrolled = scrollState[0];
    var setIsScrolled = scrollState[1];
    var uwPoolsState = useState(null);
    var uwPools = uwPoolsState[0];
    var setUwPools = uwPoolsState[1];
    var uwScoredAtState = useState('');
    var uwScoredAt = uwScoredAtState[0];
    var setUwScoredAt = uwScoredAtState[1];
    var coverageState = useState(null);
    var coverage = coverageState[0];
    var setCoverage = coverageState[1];
    var activeUwIdState = useState(null);
    var activeUwId = activeUwIdState[0];
    var setActiveUwId = activeUwIdState[1];
    var copy = getCopy(language);
    // KO has a real Korean twin of the methodology page (ko/methodology.html); pt/es keep the English one.
    var methodologyHref = language === 'ko' ? '/ko/methodology' : '/methodology';
    useEffect(function () {
      function onScroll() {
        var scrolled = window.scrollY > 4;
        setIsScrolled(function (prev) { return prev !== scrolled ? scrolled : prev; });
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      return function () { window.removeEventListener('scroll', onScroll); };
    }, []);

    var savedPlanState = useState(readSavedPlan);
    var savedPlan = savedPlanState[0];
    var plannerCopy = (translations[language] && translations[language].planner) || (translations.en && translations.en.planner) || {};
    // Footer copy (240) lives on the ROOT dictionary, not the `landing`
    // subtree — it is the single source shared with app.js's grid/pool-detail
    // footers, so all three surfaces render byte-identical text. Same
    // subtree-with-EN-fallback shape as plannerCopy above.
    var rootCopy = translations[language] || translations.en || {};
    var goalLabelKey = savedPlan ? GOAL_LABEL_KEYS[savedPlan.goal] : null;
    var goalLabel = goalLabelKey ? plannerCopy[goalLabelKey] : null;
    var showReturnCard = !!goalLabel;
    var plantedDate = '';
    if (showReturnCard && savedPlan.savedAt) {
      try { plantedDate = new Date(savedPlan.savedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } catch (err) {}
    }

    function tendGarden() {
      if (typeof Analytics !== 'undefined') {
        Analytics.track('garden_reentry_clicked', { goal: savedPlan.goal, archetype: savedPlan.archetype || null });
      }
    }

    useEffect(function () {
      document.documentElement.lang = LANDING_HTML_LANG[language] || 'en';
      document.title = copy.pageTitle;
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.content = copy.metaDescription;
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.content = copy.pageTitle;
      var ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) ogDescription.content = copy.metaDescription;
      writeTheme(dark);
    }, [language, dark, copy]);

    // Post-mount localization for the static SEO content section (fintech-seo v2).
    // EN ships in raw HTML; any other language (ko, pt, es) is written from
    // translations[language].landing (falls back to EN via getCopy).
    useEffect(function () {
      if (language === 'en') return;
      try {
        var landingCopy = getCopy(language);
        if (!landingCopy) return;
        var seoMap = {
          'seo-eyebrow': 'seoEyebrow',
          'seo-h1': 'seoH1',
          'seo-lede': 'seoLede',
          'seo-rails-p': 'seoRailsP',
          'seo-risk': 'seoRisk',
          'seo-guide-link': 'seoGuideLink',
          'seo-link-usdc': 'seoLinkUsdc',
          'seo-link-usdt': 'seoLinkUsdt',
          'seo-link-eth': 'seoLinkEth',
          'seo-link-dai': 'seoLinkDai',
          'seo-link-base': 'seoLinkBase',
          'seo-link-arbitrum': 'seoLinkArbitrum',
          'seo-link-solana': 'seoLinkSolana',
          'seo-link-ethereum': 'seoLinkEthereum'
        };
        for (var id in seoMap) {
          var el = document.getElementById(id);
          var key = seoMap[id];
          if (el && landingCopy[key]) {
            el.textContent = landingCopy[key];
          }
        }
      } catch (err) {}
    }, [language]);

    useEffect(function () {
      if (showReturnCard && typeof Analytics !== 'undefined') {
        Analytics.track('garden_reentry_clicked', { goal: savedPlan.goal, archetype: savedPlan.archetype || null });
      }
    }, [showReturnCard]);

    // #seo-content ships as static HTML in home.html (crawlable). Move it into
    // .landing-main after the hero so it reads as the page's second section,
    // above the landing footer.
    useEffect(function () {
      var seoEl = document.getElementById('seo-content');
      var landingMain = document.querySelector('.landing-main');
      if (!seoEl || !landingMain) return undefined;
      landingMain.appendChild(seoEl);
      return function () { document.body.appendChild(seoEl); };
    }, []);

    useEffect(function () {
      var cancelled = false;
      fetch(LANDING_POOLS_URL)
        .then(function (res) { if (!res.ok) throw new Error('landing-pools ' + res.status); return res.json(); })
        .then(function (data) {
          if (cancelled) return;
          var baked = (data.pools || []).map(function (p) { return Object.assign({}, p, { source: 'snapshot' }); });
          setUwScoredAt(data.generatedAt || '');
          setCoverage(readCoverage(data));
          setUwPools(baked.filter(passesTrustRails));
          return Promise.all(baked.map(function (p) {
            return fetchLivePoint(p.pool)
              .then(function (live) { return Object.assign({}, p, live, { source: 'live' }); })
              .catch(function () { return p; });
          })).then(function (merged) {
            if (!cancelled) setUwPools(merged.filter(passesTrustRails));
          });
        })
        .catch(function () { if (!cancelled) setUwPools([]); });
      return function () { cancelled = true; };
    }, []);

    var activeUwPool = null;
    if (uwPools && uwPools.length) {
      activeUwPool = uwPools.find(function (p) { return p.pool === activeUwId; }) || uwPools[0];
    }

    // In-app switch for all four languages (en, ko, pt, es); used by the header
    // LangMenu and the LangMenu.Suggest banner.
    function selectLanguage(next) {
      if (LANDING_LANGS.indexOf(next) === -1) return;
      setLanguage(next);
      try { localStorage.setItem('defi-garden-lang', next); } catch (err) {}
      var url = new URL(window.location.href);
      if (next === 'en') url.searchParams.delete('lang');
      else url.searchParams.set('lang', next);
      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
    }

    function submitSearch(event) {
      event.preventDefault();
      var href = buildSearchHref(query);
      if (!href) return;
      trackLanding('search', { destination: href === '/?app=1' ? 'app' : 'filtered' });
      window.location.assign(href);
    }

    function closeMenu() { setMenuOpen(false); }

    var floor = window.TRUST_RAILS ? window.TRUST_RAILS.formatTvlFloor(window.TRUST_RAILS.DEFAULT_MIN_TVL) : '';
    var hasCoverage = !!(coverage && floor);

    return e('div', { className: 'landing-app', 'data-mode': 'landing' },
      e('div', { className: 'landing-backdrop', 'aria-hidden': 'true' },
        e('span', { className: 'landing-backdrop-orbit landing-backdrop-orbit-one' }),
        e('span', { className: 'landing-backdrop-orbit landing-backdrop-orbit-two' })
      ),

      e('header', { className: 'landing-header landing-reveal landing-reveal-one' + (isScrolled ? ' is-scrolled' : '') },
        e('a', { className: 'landing-brand', href: '/', 'aria-label': copy.navSearch },
          e('span', { className: 'landing-brand-mark' }, e(LeafMark)),
          e('span', null, 'DeFi Garden')
        ),
        e('nav', { className: 'landing-nav', 'aria-label': copy.navPrimary },
          e('a', { href: '/?app=1' }, copy.navSearch),
          e('a', { href: '/stocks' }, copy.navStocks || 'Stocks'),
          e('a', { href: methodologyHref }, copy.navMethodology || 'Methodology'),
          e('a', { href: '/mcp' }, copy.navApi || 'API')
        ),
        e('div', { className: 'landing-header-actions' },
          window.LangMenu ? e(window.LangMenu.Menu, {
            language: language, onSelect: selectLanguage, onOpen: closeMenu, triggerClassName: 'landing-icon-button'
          }) : null,
          e('button', {
            type: 'button', className: 'landing-icon-button landing-theme-button', onClick: function () { setDark(!dark); },
            'aria-label': dark ? copy.themeLight : copy.themeDark
          }, dark ? '☼' : '☾'),
          e('button', {
            type: 'button', className: 'landing-menu-button', onClick: function () { setMenuOpen(!menuOpen); },
            'aria-label': menuOpen ? copy.navClose : copy.navMenu,
            'aria-expanded': menuOpen ? 'true' : 'false'
          }, menuOpen ? '×' : '☰')
        )
      ),

      e('nav', { className: 'landing-mobile-nav' + (menuOpen ? ' is-open' : ''), 'aria-label': copy.navMobile },
        e('a', { href: '/?app=1', onClick: closeMenu }, copy.navSearch),
        e('a', { href: '/stocks', onClick: closeMenu }, copy.navStocks || 'Stocks'),
        e('a', { href: methodologyHref, onClick: closeMenu }, copy.navMethodology || 'Methodology'),
        e('a', { href: '/mcp', onClick: closeMenu }, copy.navApi || 'API')
      ),
      e('main', { className: 'landing-main' },
        e('div', { id: 'underwriting-section', className: 'landing-section-wrapper landing-underwriting-wrapper' },
          window.LangMenu ? e(window.LangMenu.Suggest, { language: language, onSelect: selectLanguage }) : null,
          e('section', { className: 'landing-hero-underwriting', 'data-testid': 'landing-underwriting-card', 'aria-labelledby': 'landing-uw-title' },
            e('div', { className: 'landing-uw-copy' },
              e('p', { className: 'landing-uw-status' },
                e('span', { className: 'landing-uw-status-dot', 'aria-hidden': 'true' }),
                uwScoredAt && uwPools
                  ? copy.uwStatus(formatScoreDate(uwScoredAt), uwPools.some(function (p) { return p.source === 'live'; }))
                  : copy.uwStatusLoading
              ),
              e('h1', { id: 'landing-uw-title', className: 'landing-spotlight-title' },
                copy.uwTitleBefore,
                e('br'),
                e('span', { className: 'landing-title-accent' }, copy.uwTitleAccent)
              ),
              e('p', { className: 'landing-spotlight-subhead' }, copy.uwSubhead),
              e('form', { className: 'landing-search-form', role: 'search', onSubmit: submitSearch },
                e('label', { className: 'sr-only', htmlFor: 'landing-search' }, copy.searchLabel),
                e(SearchIcon),
                e('input', {
                  id: 'landing-search', 'data-testid': 'landing-search', className: 'landing-search-input',
                  type: 'search', value: query, placeholder: copy.searchPlaceholder, autoComplete: 'off',
                  onChange: function (event) { setQuery(event.target.value); }
                }),
                e('button', { type: 'submit', className: 'landing-search-submit' },
                  e('span', { className: 'landing-search-submit-label' }, copy.searchSubmit),
                  e(ArrowIcon)
                )
              ),
              e('div', { className: 'landing-uw-cta-row' },
                e('a', {
                  className: 'landing-garden-link',
                  href: methodologyHref,
                  'data-testid': 'landing-methodology-cta',
                  onClick: function () { trackLanding('methodology', { placement: 'hero' }); }
                }, copy.ctaMethodology),
                e('a', {
                  className: 'landing-quiet-link',
                  href: '/?app=1',
                  'data-testid': 'landing-underwriting-cta',
                  onClick: function () { trackLanding('explore_scored_yields', { placement: 'hero' }); }
                }, copy.ctaExplore + ' →')
              )
            ),
            activeUwPool
              ? e('aside', { className: 'landing-uw-terminal-card', 'aria-label': copy.uwCardTag },
                  e('div', { className: 'landing-uw-card-header' },
                    e('span', { className: 'landing-uw-header-tag' }, copy.uwCardTag),
                    e('span', { className: 'landing-uw-score-pill' },
                      e('span', null, copy.uwScoreLabel + ' '),
                      e('strong', null, activeUwPool.defiScore.score.toFixed(1) + ' · ' + activeUwPool.defiScore.rating)
                    )
                  ),
                  e('div', { className: 'landing-uw-pool-tabs', role: 'group', 'aria-label': copy.uwPoolTabsLabel },
                    uwPools.map(function (p) {
                      var isSel = activeUwPool.pool === p.pool;
                      return e('button', {
                        key: p.pool,
                        type: 'button',
                        className: 'landing-uw-pool-tab' + (isSel ? ' is-active' : ''),
                        'aria-pressed': isSel ? 'true' : 'false',
                        onClick: function () { setActiveUwId(p.pool); }
                      }, p.symbol);
                    })
                  ),
                  e('div', { className: 'landing-uw-yield-box' },
                    e('div', { className: 'landing-uw-pool-title' }, activeUwPool.project + ' · ' + activeUwPool.chain),
                    e('div', { className: 'landing-uw-yield-val' }, formatPct(activeUwPool.apy) + ' APY'),
                    activeUwPool.forecast
                      ? e('div', { className: 'landing-uw-forecast-text' },
                          e('span', null, copy.uwForecast(formatPct(activeUwPool.forecast.p50), formatPct(activeUwPool.forecast.p10), formatPct(activeUwPool.forecast.p90))),
                          activeUwPool.forecast.crashRisk
                            ? e('span', { className: 'landing-uw-downside-badge' }, '· ' + copy.uwCrashRisk(activeUwPool.forecast.crashRisk))
                            : null
                        )
                      : null,
                    e('div', {
                      className: 'landing-uw-source',
                      'data-testid': 'landing-uw-source',
                      'data-source': activeUwPool.source
                    }, activeUwPool.source === 'live' ? copy.uwSourceLive : copy.uwSourceSnapshot(formatScoreDate(uwScoredAt)))
                  ),
                  e('div', { className: 'landing-uw-pillars-grid' },
                    SCORE_PILLARS.map(function (pillar) {
                      var tier = activeUwPool.defiScore.pillarsTier && activeUwPool.defiScore.pillarsTier[pillar.key];
                      var tierKey = Object.prototype.hasOwnProperty.call(PILLAR_TIERS, tier) ? PILLAR_TIERS[tier] : null;
                      return e('div', { key: pillar.key, className: 'landing-uw-pillar' },
                        e('div', { className: 'landing-uw-pillar-name' }, copy[pillar.labelKey]),
                        tierKey ? e('div', { className: 'landing-uw-pillar-val landing-uw-tier-' + tier.toLowerCase(), 'data-tier': tier.toLowerCase() }, copy[tierKey]) : null
                      );
                    })
                  ),
                  e('div', { className: 'landing-uw-capacity-row' },
                    e('div', { className: 'landing-uw-capacity-item' },
                      e('span', { className: 'landing-uw-cap-lbl' }, copy.uwTvlLabel),
                      e('span', { className: 'landing-uw-cap-val' }, formatUsdCompact(activeUwPool.tvlUsd))
                    ),
                    e('div', { className: 'landing-uw-capacity-item' },
                      e('span', { className: 'landing-uw-cap-lbl' }, copy.uwScoredLabel),
                      e('span', { className: 'landing-uw-cap-val' }, formatScoreDate(uwScoredAt))
                    )
                  ),
                  e('div', { className: 'landing-uw-terminal-footer' },
                    e('a', { href: '/?pool=' + activeUwPool.pool, className: 'landing-uw-terminal-jump' }, copy.uwOpenTerminal + ' →')
                  )
                )
              : uwPools === null
                ? e('div', { className: 'landing-uw-terminal-card landing-uw-skeleton', 'aria-hidden': 'true' })
                : null
          )
        ),

        // 2. How the score works: pillar and band NAMES only (proprietary).
        e('section', { id: 'landing-method', className: 'landing-band', 'data-testid': 'landing-method', 'aria-labelledby': 'landing-method-title' },
          e('div', { className: 'landing-band-inner' },
            e('div', { className: 'landing-band-head' },
              e('h2', { id: 'landing-method-title', className: 'landing-band-title' }, copy.methTitle),
              e('p', { className: 'landing-band-lede' }, copy.methLede)
            ),
            e('p', { className: 'landing-band-label' }, copy.methPillarsLabel),
            e('ol', { className: 'landing-pillars' },
              SCORE_PILLARS.map(function (pillar) {
                return e('li', { key: pillar.key, className: 'landing-pillar', 'data-pillar': pillar.key },
                  e('div', { className: 'landing-pillar-top' },
                    e('span', { className: 'landing-pillar-name' }, copy[pillar.labelKey])
                  ),
                  e('p', { className: 'landing-pillar-desc' }, copy[pillar.descKey])
                );
              })
            ),
            e('p', { className: 'landing-band-label' }, copy.methBandsLabel),
            e('ol', { className: 'landing-bands', 'data-testid': 'landing-bands' },
              BAND_NAMES.map(function (name) {
                return e('li', { key: name, className: 'landing-band-seg', 'data-band': name },
                  e('span', { className: 'landing-band-seg-name' }, name)
                );
              })
            ),
            e('p', { className: 'landing-band-link-row' },
              e('a', { href: methodologyHref, onClick: function () { trackLanding('methodology', { placement: 'method' }); } }, copy.methLink)
            )
          )
        ),

        // 3. Coverage. Counts come from data/landing-pools.json `coverage`; categories carry no counts.
        e('section', { id: 'landing-coverage', className: 'landing-band', 'data-testid': 'landing-coverage', 'aria-labelledby': 'landing-coverage-title' },
          e('div', { className: 'landing-band-inner' },
            e('div', { className: 'landing-band-head' },
              e('h2', { id: 'landing-coverage-title', className: 'landing-band-title' }, copy.covTitle),
              e('p', { className: 'landing-band-lede' },
                hasCoverage
                  ? copy.covLede(formatCount(coverage.scoredPools), formatCount(coverage.protocols), formatCount(coverage.chains), floor)
                  : (floor ? copy.covLedeNoCount(floor) : ''),
                ' ', copy.covNote)
            ),
            e('p', { className: 'landing-band-label' }, copy.covCategoriesLabel),
            e('ul', { className: 'landing-categories' },
              COVERAGE_CATEGORIES.map(function (cat) {
                return e('li', { key: cat.key },
                  e('a', {
                    className: 'landing-category-chip',
                    href: '/?chain=All&poolTypes=' + encodeURIComponent(cat.key),
                    onClick: function () { trackLanding('category', { category: cat.key }); }
                  }, rootCopy[cat.labelKey] || cat.key)
                );
              })
            )
          )
        ),

        // 4. For agents.
        e('section', { id: 'landing-agents', className: 'landing-band', 'data-testid': 'landing-agents', 'aria-labelledby': 'landing-agents-title' },
          e('div', { className: 'landing-band-inner landing-agents-inner' },
            e('div', null,
              e('h2', { id: 'landing-agents-title', className: 'landing-band-title' }, copy.agentsTitle),
              e('p', { className: 'landing-band-lede' }, copy.agentsBody)
            ),
            e('a', { className: 'landing-quiet-link', href: '/mcp', 'data-testid': 'landing-agents-link', onClick: function () { trackLanding('api_mcp'); } }, copy.agentsLink)
          )
        )
      ),
      e('footer', { className: 'app-footer' },
        e('p', null,
          rootCopy.poweredBy, ' ',
          e('a', { href: 'https://api-docs.defillama.com/', target: '_blank', rel: 'noopener noreferrer' }, rootCopy.defillamaApi),
          '. ',
          rootCopy.footerSignOff
        ),
        e('p', { className: 'app-footer-hub-links' },
          e('a', { href: '/tokens' }, rootCopy.browseTokens),
          ' · ',
          e('a', { href: '/chains' }, rootCopy.browseChains),
          ' · ',
          e('a', { href: '/stocks' }, copy.navStocks || 'Stocks'),
          ' · ',
          e('a', { href: methodologyHref }, copy.navMethodology || 'Methodology'),
          ' · ',
          e('a', { href: '/mcp' }, copy.navApi || 'API')
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
