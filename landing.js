/* Search-first DeFi Garden landing surface.
 * Plain React UMD, no JSX or build step. The landing is an entry shell only:
 * real pool data and filtering remain owned by the analytics app. */
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

  var ALL_MAPPED_SUBS = [
    { id: 'claude', name: 'Claude Pro', monthly: 24.00, baseMonthly: 20.00, slug: 'claude', icon: 'claude.ai', emoji: '🤖' },
    { id: 'cursor', name: 'Cursor Pro', monthly: 24.00, baseMonthly: 20.00, slug: 'cursor', icon: 'cursor.com', emoji: '⚡' },
    { id: 'chatgpt', name: 'ChatGPT Plus', monthly: 24.00, baseMonthly: 20.00, slug: 'chatgpt', icon: 'openai.com', emoji: '💬' },
    { id: 'spotify', name: 'Spotify', monthly: 14.39, baseMonthly: 11.99, slug: 'spotify', icon: 'spotify.com', emoji: '🎵' },
    { id: 'netflix', name: 'Netflix', monthly: 21.59, baseMonthly: 17.99, slug: 'netflix', icon: 'netflix.com', emoji: '🍿' },
    { id: 'aws', name: 'AWS Cloud', monthly: 60.00, baseMonthly: 50.00, slug: 'aws', icon: 'amazon.com', emoji: '☁️' },
    { id: 'github', name: 'GitHub', monthly: 12.00, baseMonthly: 10.00, slug: 'github', icon: 'github.com', emoji: '🐙' },
    { id: 'youtube', name: 'YouTube', monthly: 16.79, baseMonthly: 13.99, slug: 'youtube', icon: 'youtube.com', emoji: '▶️' },
    { id: 'amazonprime', name: 'Amazon Prime', monthly: 18.00, baseMonthly: 15.00, slug: 'amazonprime', icon: 'amazon.com', emoji: '📦' },
    { id: 'disney', name: 'Disney+', monthly: 19.19, baseMonthly: 15.99, slug: 'disney', icon: 'disneyplus.com', emoji: '🏰' },
    { id: 'max', name: 'Max (HBO)', monthly: 20.39, baseMonthly: 16.99, slug: 'max', icon: 'max.com', emoji: '🎬' },
    { id: 'hulu', name: 'Hulu', monthly: 22.79, baseMonthly: 18.99, slug: 'hulu', icon: 'hulu.com', emoji: '📺' },
    { id: 'appletv', name: 'Apple TV+', monthly: 15.59, baseMonthly: 12.99, slug: 'appletv', icon: 'apple.com', emoji: '🍎' },
    { id: 'gamepass', name: 'Xbox Game Pass', monthly: 24.00, baseMonthly: 19.99, slug: 'gamepass', icon: 'xbox.com', emoji: '🎮' },
    { id: 'paramount', name: 'Paramount+', monthly: 11.99, baseMonthly: 9.99, slug: 'paramount', icon: 'paramountplus.com', emoji: '⛰️' },
    { id: 'peacock', name: 'Peacock', monthly: 13.19, baseMonthly: 10.99, slug: 'peacock', icon: 'peacocktv.com', emoji: '🦚' },
    { id: 'doordash', name: 'DoorDash', monthly: 11.99, baseMonthly: 9.99, slug: 'doordash', icon: 'doordash.com', emoji: '🥡' },
    { id: 'uber', name: 'Uber One', monthly: 11.99, baseMonthly: 9.99, slug: 'uber', icon: 'uber.com', emoji: '🚗' },
    { id: 'audible', name: 'Audible', monthly: 17.94, baseMonthly: 14.95, slug: 'audible', icon: 'audible.com', emoji: '🎧' },
    { id: 'walmart', name: 'Walmart+', monthly: 15.54, baseMonthly: 12.95, slug: 'walmart', icon: 'walmart.com', emoji: '🛒' },
    { id: 'phonebill', name: 'Phone Bill', monthly: 84.00, baseMonthly: 70.00, slug: 'phonebill', icon: null, emoji: '📶' },
    { id: 'rent', name: 'Rent', monthly: 2160.00, baseMonthly: 1800.00, slug: 'rent', icon: null, emoji: '🏠' }
  ];
  var INTENT_SUBS = ALL_MAPPED_SUBS;

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

  function CardBotanicalWatermark() {
    return e('svg', {
      className: 'card-botanical-watermark',
      viewBox: '0 0 340 260',
      preserveAspectRatio: 'xMidYMid meet',
      fill: 'none',
      'aria-hidden': 'true',
      style: {
        position: 'absolute',
        right: '-15px',
        bottom: '-25px',
        width: '230px',
        height: '175px',
        pointerEvents: 'none',
        opacity: 0.16,
        zIndex: 1
      }
    },
      e('circle', { cx: '170', cy: '130', r: '105', stroke: 'var(--color-primary)', strokeWidth: '1.2', strokeDasharray: '2 4', strokeLinecap: 'round', fill: 'rgba(var(--color-teal-500-rgb), 0.06)' }),
      e('path', { d: 'M170 205V91', stroke: 'var(--color-primary)', strokeWidth: '2.5', strokeLinecap: 'round' }),
      e('path', { d: 'M170 125c-28-24-52-23-70-9 16 26 41 29 70 9Z', fill: 'rgba(var(--color-teal-500-rgb), 0.22)', stroke: 'var(--color-primary)', strokeWidth: '1.5', strokeLinejoin: 'round' }),
      e('path', { d: 'M170 100c26-25 52-25 70-11-15 27-40 31-70 11Z', fill: 'rgba(var(--color-teal-500-rgb), 0.22)', stroke: 'var(--color-primary)', strokeWidth: '1.5', strokeLinejoin: 'round' }),
      e('path', { d: 'M170 151c-23-18-42-17-56-8 13 22 32 24 56 8Z', fill: 'rgba(var(--color-teal-500-rgb), 0.16)', stroke: 'var(--color-primary)', strokeWidth: '1.4', strokeLinejoin: 'round' }),
      e('path', { d: 'M170 145c22-20 42-20 56-10-12 22-32 25-56 10Z', fill: 'rgba(var(--color-teal-500-rgb), 0.16)', stroke: 'var(--color-primary)', strokeWidth: '1.4', strokeLinejoin: 'round' }),
      e('path', { d: 'M166 122c-19-13-38-16-56-11', stroke: 'var(--color-primary)', strokeWidth: '1.2', strokeLinecap: 'round', fill: 'none', opacity: 0.6 }),
      e('path', { d: 'M174 97c18-15 37-19 55-15', stroke: 'var(--color-primary)', strokeWidth: '1.2', strokeLinecap: 'round', fill: 'none', opacity: 0.6 }),
      e('path', { d: 'M128 205h84l-10 35h-64l-10-35Z', fill: 'none', stroke: 'var(--color-primary)', strokeWidth: '1.5', strokeLinejoin: 'round' }),
      e('path', { d: 'M122 204h96', stroke: 'var(--color-primary)', strokeWidth: '2', strokeLinecap: 'round' }),
      e('path', { d: 'M110 240h120', stroke: 'var(--color-primary)', strokeWidth: '1.2', strokeLinecap: 'round' })
    );
  }
  function ServiceBrandIcon(props) {
    var slug = props.slug;
    var domainMap = {
      claude: 'claude.ai',
      cursor: 'cursor.com',
      chatgpt: 'openai.com',
      spotify: 'spotify.com',
      netflix: 'netflix.com',
      aws: 'amazon.com',
      github: 'github.com',
      youtube: 'youtube.com',
      amazonprime: 'amazon.com',
      disney: 'disneyplus.com',
      max: 'max.com',
      hulu: 'hulu.com',
      appletv: 'apple.com',
      gamepass: 'xbox.com',
      paramount: 'paramountplus.com',
      peacock: 'peacocktv.com',
      doordash: 'doordash.com',
      uber: 'uber.com',
      audible: 'audible.com',
      walmart: 'walmart.com'
    };
    var domain = props.icon || domainMap[slug];
    var width = props.width || 15;
    var height = props.height || 15;

    if (domain) {
      return e('img', {
        className: 'service-brand-icon service-brand-favicon',
        src: 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=64',
        alt: slug,
        width: width,
        height: height,
        style: {
          width: width + 'px',
          height: height + 'px',
          borderRadius: '2px',
          objectFit: 'contain',
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0
        },
        loading: 'lazy'
      });
    }

    return e('span', {
      className: 'service-brand-emoji',
      style: { fontSize: (width - 1) + 'px', lineHeight: 1, display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }
    }, props.emoji || '🌱');
  }
  function EmvChip() {
    return e('svg', {
      className: 'visa-gold-chip visa-gold-chip-svg',
      viewBox: '0 0 46 34',
      width: 32,
      height: 24,
      'aria-hidden': 'true',
      role: 'img'
    },
      e('defs', null,
        e('linearGradient', { id: 'emv-metallic-grad-landing', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          e('stop', { offset: '0%', stopColor: '#ded5c5' }),
          e('stop', { offset: '35%', stopColor: '#bfae95' }),
          e('stop', { offset: '70%', stopColor: '#d6cbba' }),
          e('stop', { offset: '100%', stopColor: '#9e8c72' })
        ),
        e('linearGradient', { id: 'emv-bevel-grad-landing', x1: '0%', y1: '0%', x2: '0%', y2: '100%' },
          e('stop', { offset: '0%', stopColor: 'rgba(255,255,255,0.7)' }),
          e('stop', { offset: '100%', stopColor: 'rgba(0,0,0,0.3)' })
        )
      ),
      e('rect', { x: 0.5, y: 0.5, width: 45, height: 33, rx: 4.5, fill: 'url(#emv-metallic-grad-landing)', stroke: 'rgba(30,25,18,0.4)', strokeWidth: 0.8 }),
      e('rect', { x: 1.2, y: 1.2, width: 43.6, height: 31.6, rx: 4, fill: 'none', stroke: 'url(#emv-bevel-grad-landing)', strokeWidth: 0.6 }),
      e('path', {
        d: 'M 13 1 L 13 33 M 33 1 L 33 33 M 1 17 L 13 17 M 33 17 L 45 17 M 13 11.5 C 18 11.5, 28 11.5, 33 11.5 M 13 22.5 C 18 22.5, 28 22.5, 33 22.5 M 19 11.5 L 19 22.5 M 27 11.5 L 27 22.5',
        fill: 'none',
        stroke: 'rgba(50, 40, 25, 0.75)',
        strokeWidth: 0.75,
        strokeLinecap: 'round'
      })
    );
  }

  function NfcIcon() {
    return e('svg', {
      className: 'visa-nfc-icon',
      viewBox: '0 0 24 24',
      width: 14,
      height: 14,
      fill: 'none',
      stroke: 'rgba(255,255,255,0.85)',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      'aria-hidden': 'true'
    },
      e('path', { d: 'M7 16a5.5 5.5 0 0 1 0-8' }),
      e('path', { d: 'M11 18.5a9 9 0 0 1 0-13' }),
      e('path', { d: 'M15 21a12.5 12.5 0 0 1 0-18' }),
      e('path', { d: 'M3 13.5a2 2 0 0 1 0-3' })
    );
  }

  function VisaLogo() {
    return e('svg', {
      className: 'visa-logo-svg',
      viewBox: '0 0 780 250',
      width: 44,
      height: 14,
      fill: '#ffffff',
      'aria-label': 'VISA',
      role: 'img'
    },
      e('path', {
        d: 'M292.5 6.6L193.3 243.4H128L78 57.6C75 45.8 72.4 41.5 62.9 36.3C47.4 27.9 22.2 20.3 0 15.3L3.8 6.6H107.5C121.3 6.6 133.7 15.8 136.8 31.8L163 171.1L228.3 6.6H292.5ZM548.8 167.3C549.4 104.3 461.9 100.8 462.8 72.8C463.2 64.3 471.3 55.2 489.6 52.8C498.7 51.6 523.8 50.6 552.1 63.8L563.3 11.7C548 6.2 528.2 0.8 502.9 0.8C442.2 0.8 399.1 33.1 398.6 79.1C397.7 113.3 428.3 132.3 451.6 143.7C475.6 155.3 483.6 162.8 483.4 173.3C483.1 189.4 463.8 196.4 446 196.7C415 197.2 396.9 188.4 382.4 181.7L370.8 235.8C385.7 242.7 413.2 248.6 441.7 248.9C506 248.9 548.2 217.2 548.8 167.3ZM712.3 243.4H768.8L719.6 6.6H668.1C656.3 6.6 646.6 13.4 642.3 23.8L548.8 243.4H614.3L627.3 207.3H707.4L712.3 243.4ZM645.4 157.6L678.8 65.6L698.1 157.6H645.4ZM387.9 6.6L336.2 243.4H274.6L326.3 6.6H387.9Z'
      })
    );
  }

  function CardLockIcon() {
    return e('svg', {
      className: 'card-lock-icon',
      viewBox: '0 0 16 16',
      width: 10,
      height: 10,
      fill: 'currentColor',
      'aria-hidden': 'true'
    },
      e('path', { d: 'M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-.5V4.5A3.5 3.5 0 0 0 8 1zm2 5H6V4.5a2 2 0 1 1 4 0V6z' })
    );
  }

  function buildSearchHref(query) {
    var clean = String(query || '').trim();
    if (!clean) return null;

    var lower = clean.toLowerCase();
    if (lower.indexOf('opencode') !== -1) {
      return '/for/claude';
    }
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

  function ExampleChip(props) {
    return e('button', {
      type: 'button',
      className: 'landing-example-chip',
      onClick: function () { props.onChoose(props.value); }
    }, props.children);
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
    var selectedSubState = useState(INTENT_SUBS[0]);
    var activeSub = selectedSubState[0];
    var setActiveSub = selectedSubState[1];
    var showAllSubsState = useState(false);
    var showAllSubs = showAllSubsState[0];
    var setShowAllSubs = showAllSubsState[1];
    var activeSectionState = useState(0);
    var activeSection = activeSectionState[0];
    var setActiveSection = activeSectionState[1];
    var copy = getCopy(language);
    useEffect(function () {
      function onScroll() {
        var scrolled = window.scrollY > 4;
        setIsScrolled(function (prev) { return prev !== scrolled ? scrolled : prev; });
        var searchEl = document.getElementById('search-section');
        if (searchEl) {
          var rect = searchEl.getBoundingClientRect();
          var isPageTwo = rect.top <= window.innerHeight * 0.45;
          setActiveSection(isPageTwo ? 1 : 0);
        }
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
      document.documentElement.lang = language;
      document.title = copy.pageTitle;
      var meta = document.querySelector('meta[name="description"]');
      if (meta) meta.content = copy.metaDescription;
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.content = copy.pageTitle;
      var ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) ogDescription.content = copy.metaDescription;
      writeTheme(dark);
    }, [language, dark, copy]);

    useEffect(function () {
      if (showReturnCard && typeof Analytics !== 'undefined') {
        Analytics.track('garden_reentry_shown', { goal: savedPlan.goal, archetype: savedPlan.archetype || null });
      }
    }, [showReturnCard]);

    function toggleLanguage() {
      var next = language === 'en' ? 'ko' : 'en';
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
      if (href) window.location.assign(href);
    }

    function chooseExample(value) {
      var href = buildSearchHref(value);
      if (href) window.location.assign(href);
    }

    function closeMenu() { setMenuOpen(false); }
    function scrollToPage(index) {
      setActiveSection(index);
      if (index === 0) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        var el = document.getElementById('search-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    }

    return e('div', { className: 'landing-app', 'data-mode': 'landing' },
      e('div', { className: 'landing-backdrop', 'aria-hidden': 'true' },
        e('span', { className: 'landing-backdrop-orbit landing-backdrop-orbit-one' }),
        e('span', { className: 'landing-backdrop-orbit landing-backdrop-orbit-two' }),
        e('span', { className: 'landing-backdrop-dot landing-backdrop-dot-one' }),
        e('span', { className: 'landing-backdrop-dot landing-backdrop-dot-two' })
      ),

      e('header', { className: 'landing-header landing-reveal landing-reveal-one' + (isScrolled ? ' is-scrolled' : '') },
        e('a', { className: 'landing-brand', href: '/', 'aria-label': copy.navSearch },
          e('span', { className: 'landing-brand-mark' }, e(LeafMark)),
          e('span', null, 'DeFi Garden')
        ),
        e('nav', { className: 'landing-nav', 'aria-label': copy.navPrimary },
          e('a', { href: '/?app=1' }, copy.navSearch),
          e('a', { href: 'plan.html' }, copy.navPlanner || 'Savings Planner'),
          e('a', { href: '/agents' }, copy.navAgents || 'AI Agents & MCP')
        ),
        e('div', { className: 'landing-header-actions' },
          e('button', {
            type: 'button', className: 'landing-icon-button', onClick: toggleLanguage,
            'aria-label': language === 'en' ? copy.languageKorean : copy.languageEnglish
          }, language === 'en' ? 'KO' : 'EN'),
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
        e('a', { href: 'plan.html', onClick: closeMenu }, copy.navPlanner || 'Savings Planner'),
        e('a', { href: '/agents', onClick: closeMenu }, copy.navAgents || 'AI Agents & MCP')
      ),
      e('main', { className: 'landing-main' },
        // SLIDE 1: HERO SPOTLIGHT (Never Pay for Software Again - Full Viewport)
        e('div', { id: 'spotlight-section', className: 'landing-section-wrapper landing-spotlight-wrapper' },
          e('section', { className: 'landing-hero-spotlight', 'data-testid': 'landing-intent-card', 'aria-labelledby': 'landing-spotlight-title' },
            e('div', { className: 'landing-spotlight-copy' },
              e('div', { className: 'landing-spotlight-eyebrow' },
                e('span', null, copy.spotlightEyebrow || 'Bringing DeFi to daily life')
              ),
              e('h1', { id: 'landing-spotlight-title', className: 'landing-spotlight-title' },
                copy.spotlightTitleBefore || 'Never pay for',
                e('br'),
                e('span', { className: 'landing-title-accent' }, copy.spotlightTitleAccent || 'subscriptions again.')
              ),
              e('p', { className: 'landing-spotlight-subhead' },
                copy.spotlightSubhead || 'Deposit once into audited and curated vaults. Realized yield perpetually settles your monthly software, AI, and cloud subscriptions while your principal stays 100% yours.'
              ),
              e('a', {
                className: 'landing-press-badge',
                href: 'https://leviathannews.xyz/258992/turn-4k-in-stablecoins-into-a-free-chatgpt-pro-subscription-earn-yield-cover-the-fee-and-keep-every-dollar-with-no-tokens-locked-50-spots-available',
                target: '_blank',
                rel: 'noopener noreferrer'
              },
                e('span', { className: 'press-badge-source' }, 'Leviathan News ↗'),
                e('span', { className: 'press-badge-title' }, '“Turn $4k in Stablecoins into a Free ChatGPT Pro Subscription”')
              ),
              e('div', {
                className: 'landing-subs-grid' + (showAllSubs ? ' is-expanded' : ''),
                'aria-label': 'Select subscription preset'
              },
                (showAllSubs ? INTENT_SUBS : INTENT_SUBS.slice(0, 7)).map(function(s) {
                  var isSelected = activeSub.id === s.id;
                  return e('button', {
                    key: s.id,
                    type: 'button',
                    'data-testid': 'landing-chip-' + s.id,
                    className: 'landing-sub-chip' + (isSelected ? ' is-selected' : ''),
                    onClick: function() { setActiveSub(s); }
                  },
                    e(ServiceBrandIcon, { slug: s.slug, icon: s.icon, emoji: s.emoji, width: 15, height: 15 }),
                    e('span', { className: 'landing-sub-chip-name' }, s.name),
                    e('span', { className: 'landing-sub-chip-price' }, '$' + s.baseMonthly.toFixed(0) + '/mo')
                  );
                }),
                !showAllSubs
                  ? e('button', {
                      type: 'button',
                      'data-testid': 'landing-chip-more',
                      className: 'landing-sub-chip landing-sub-chip-more',
                      onClick: function() { setShowAllSubs(true); }
                    },
                      e('span', null, '+ MORE')
                    )
                  : e('button', {
                      type: 'button',
                      'data-testid': 'landing-chip-less',
                      className: 'landing-sub-chip landing-sub-chip-more',
                      onClick: function() { setShowAllSubs(false); }
                    },
                      e('span', null, 'LESS ▴')
                    )
              )
            ),
            e('aside', { className: 'landing-card-showcase' },
              e('div', {
                className: 'virtual-visa-card',
                style: {
                  width: '100%',
                  maxWidth: '440px',
                  aspectRatio: '1.586 / 1',
                  padding: '20px 22px',
                  background: 'radial-gradient(circle at 20% 15%, rgba(124, 201, 160, 0.14) 0%, transparent 55%), linear-gradient(135deg, #091711 0%, #12291e 52%, #07130d 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: 0,
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 16px 36px rgba(0, 0, 0, 0.45)',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxSizing: 'border-box',
                  position: 'relative',
                  overflow: 'hidden',
                  userSelect: 'none',
                  margin: '0 0 16px'
                }
              },
                e(CardBotanicalWatermark),
                // Top row
                e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 } },
                  e('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                    e(EmvChip),
                    e(NfcIcon)
                  ),
                  e('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' } },
                    e(VisaLogo),
                    e('span', { style: { fontFamily: 'var(--font-family-mono)', fontSize: '0.52rem', letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', fontWeight: '700' } }, 'DEBIT')
                  )
                ),
                // Center
                e('div', { style: { margin: '2px 0', position: 'relative', zIndex: 2 } },
                  e('div', { style: { fontFamily: 'var(--font-family-mono)', fontSize: '0.96rem', letterSpacing: '0.20em', color: 'rgba(255,255,255,0.95)', fontWeight: '600', textShadow: '0 1px 3px rgba(0,0,0,0.8)' } }, '•••• •••• •••• 8453'),
                  e('div', { style: { fontSize: '0.58rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.68)', textTransform: 'uppercase', fontWeight: '600', marginTop: '2px' } }, activeSub.slug.toUpperCase() + '-VAULT / AGENT-01'),
                  e('div', { style: { fontFamily: 'var(--font-family-mono)', fontSize: '1.05rem', fontWeight: '700', color: '#ffffff', marginTop: '2px', textShadow: '0 1px 4px rgba(0,0,0,0.8)' } }, activeSub.name.toUpperCase() + ' FUNDED')
                ),
                // Bottom row
                e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.12)', position: 'relative', zIndex: 2 } },
                  e('div', null,
                    e('div', { style: { fontSize: '0.62rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-family-mono)', letterSpacing: '0.06em', fontWeight: '600' } }, 'VALID 08/31'),
                    e('div', { style: { fontSize: '0.68rem', color: 'rgba(255,255,255,0.9)', fontWeight: '550' } }, 'BASE VAULT · YIELD FUNDED')
                  ),
                  e('div', {
                    style: {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'rgba(0,0,0,0.65)',
                      border: '1px solid rgba(255,255,255,0.24)',
                      padding: '3px 8px',
                      borderRadius: 0,
                      fontSize: '0.66rem',
                      fontFamily: 'var(--font-family-mono)',
                      fontWeight: '700',
                      color: '#34d399',
                      whiteSpace: 'nowrap'
                    }
                  },
                    e(CardLockIcon),
                    e('span', null, '$' + activeSub.monthly.toFixed(2) + '/mo')
                  )
                )
              ),
              // Integrated Financial Breakdown Metrics Table
              e('div', { className: 'landing-card-metrics-table' },
                e('div', { className: 'landing-card-metric-row' },
                  e('span', { className: 'metric-row-label' }, copy.metricCovered || 'Covered:'),
                  e('span', { className: 'metric-row-value highlight' }, '$' + activeSub.monthly.toFixed(2) + '/mo')
                ),
                e('div', { className: 'landing-card-metric-row' },
                  e('span', { className: 'metric-row-label' }, copy.metricSettlement || 'Settlement:'),
                  e('span', { className: 'metric-row-value' }, copy.metricSettlementVal || 'Curated Base Vaults')
                ),
                e('div', { className: 'landing-card-metric-row' },
                  e('span', { className: 'metric-row-label' }, copy.metricSecurity || 'Security:'),
                  e('span', { className: 'metric-row-value' }, copy.metricSecurityVal || '100% Non-Custodial (ΔP ≡ 0)')
                )
              ),
              e('a', {
                className: 'landing-garden-link',
                href: '/for/' + activeSub.slug,
                'data-testid': 'landing-intent-cta'
              }, typeof copy.reserveCta === 'function' ? copy.reserveCta(activeSub.name) : 'Reserve ' + activeSub.name + ' Card', e(ArrowIcon)),
              e('p', { className: 'landing-card-hint' }, copy.reserveHint || 'No wallet connection or KYC required to reserve • Free to join')
            )
          )
        )
        /* SECTION 2 (Commented out):
        e('div', { id: 'search-section', className: 'landing-section-wrapper landing-search-wrapper' },
          e('section', { className: 'landing-search-section', 'aria-labelledby': 'landing-title' },
            e('div', { className: 'landing-search-content' },
              e('h2', { id: 'landing-title', className: 'landing-title' }, copy.heroTitleBefore, ' ', e('span', { className: 'landing-title-accent' }, copy.heroTitleAccent)),
              e('p', { className: 'landing-hero-body' }, copy.heroBody),
              e('div', { className: 'landing-chat-console' },
                e('div', { className: 'landing-chat-header' },
                  e('div', { className: 'landing-chat-agent-badge' }, e('span', { className: 'landing-chat-spark-dot' }), e('span', null, copy.agentStatus || 'DeFi Garden Yield Agent · Live onchain data')),
                  e('span', { style: { opacity: 0.65 } }, 'Natural Language Search')
                ),
                e('form', { className: 'landing-search-form landing-chat-input-row', onSubmit: submitSearch },
                  e('label', { className: 'sr-only', htmlFor: 'landing-search' }, copy.searchLabel),
                  e(SearchIcon),
                  e('input', { id: 'landing-search', 'data-testid': 'landing-search', className: 'landing-search-input landing-chat-input', type: 'search', value: query, placeholder: copy.searchPlaceholder, onChange: function(event) { setQuery(event.target.value); }, autoComplete: 'off' }),
                  e('button', { type: 'submit', className: 'landing-search-submit landing-chat-send-btn', 'aria-label': copy.searchSubmit }, e('span', { className: 'landing-search-submit-label' }, copy.searchSubmit), e(ArrowIcon))
                )
              ),
              e('div', { className: 'landing-examples' },
                e('span', { className: 'landing-examples-label' }, copy.examplesLabel),
                e(ExampleChip, { value: 'OpenCode Go', onChoose: chooseExample }, '⚡ ' + (copy.exampleOpenCode || 'OpenCode Go')),
                e(ExampleChip, { value: 'USDC on Base', onChoose: chooseExample }, copy.exampleUsdc),
                e(ExampleChip, { value: 'Pendle PTs', onChoose: chooseExample }, copy.examplePendle || 'Pendle PTs'),
                e(ExampleChip, { value: 'Morpho vaults', onChoose: chooseExample }, copy.exampleMorpho || 'Morpho vaults'),
                e(ExampleChip, { value: 'Kamino lending', onChoose: chooseExample }, copy.exampleKamino || 'Kamino lending')
              )
            )
          )
        )
        */
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
          e('a', { href: '/agents' }, rootCopy.aiAgents || 'AI Agents & MCP')
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
