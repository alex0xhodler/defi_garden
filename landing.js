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

  var INTENT_SUBS = [
    { id: 'claude', name: 'Claude Pro', monthly: 24.00, baseMonthly: 20.00, slug: 'claude' },
    { id: 'cursor', name: 'Cursor Pro', monthly: 24.00, baseMonthly: 20.00, slug: 'cursor' },
    { id: 'chatgpt', name: 'ChatGPT Plus', monthly: 24.00, baseMonthly: 20.00, slug: 'chatgpt' },
    { id: 'spotify', name: 'Spotify', monthly: 14.39, baseMonthly: 11.99, slug: 'spotify' },
    { id: 'netflix', name: 'Netflix', monthly: 21.59, baseMonthly: 17.99, slug: 'netflix' },
    { id: 'aws', name: 'AWS Cloud', monthly: 60.00, baseMonthly: 50.00, slug: 'aws' },
    { id: 'github', name: 'GitHub', monthly: 12.00, baseMonthly: 10.00, slug: 'github' },
    { id: 'youtube', name: 'YouTube', monthly: 16.79, baseMonthly: 13.99, slug: 'youtube' }
  ];

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
    var width = props.width || 14;
    var height = props.height || 14;
    var path = null;
    var fill = 'currentColor';
    var vb = '0 0 24 24';

    switch (slug) {
      case 'claude':
        fill = '#D97757';
        path = 'm4.71 15.96 4.72-2.65.08-.23-.08-.13h-.23l-.79-.05-2.7-.07-2.34-.1-2.26-.12-.57-.12-.53-.7.05-.36.48-.32.69.06 1.52.1 2.28.16 1.65.1 2.45.25h.39l.05-.16-.13-.1-.1-.1L6.97 9.84 4.42 8.15l-1.34-.97-.72-.49-.36-.46-.16-1.01.66-.72.88.06.22.06.9.69 1.9 1.47 2.49 1.84.37.3.14-.1.02-.08-.16-.27-1.36-2.45-1.44-2.49-.65-1.03-.17-.62a3 3 0 0 1-.1-.73L6.29.13 6.7 0l1 .13.41.37.62 1.41 1 2.23 1.56 3.03.45.9.25.83.09.25h.16v-.14l.13-1.71.23-2.1.24-2.7.07-.75.38-.91.75-.48h.67l.5.34.34.8.06 1.05-.15 2.16-.34 2.87-.27 2.28-.08.83.1.06.14-.06.74-.9 1.66-2.05 1.5-1.84.97-1.09.6-.53.7-.37.74.19.46.6-.08.77-.38.86-.96 1.4-1.32 1.83-1.63 2.2-1.02 1.44-.04.14.07.06.14-.02 2.65-.63 2.1-.48 2.09-.36.88-.1.71.3.43.7-.22.68-.73.49-1.2-.02-2.3.36-2.4.45-3.08.68h-.19l-.02.13.11.1 1.7 1.25 2.5 1.78 2.25 1.66.47.41.34.73-.24.73-.67.43-.8-.12-1.25-.92-2.3-1.78-2.22-1.73-.24-.13-.1.03-.02.1.37 2.23.51 2.54.43 2.05.23.95-.08.63-.5.67-.74.19-.68-.28-.51-.83-.43-1.57-.45-2.45-.44-2.44-.09-.27h-.14l-.1.14-.85 1.94-1.22 2.57-.84 1.72-.6 1.03-.66.6-.74.17-.67-.3-.34-.73.08-.83.47-1.1.99-2.03 1.29-2.61.64-1.34v-.16l-.1-.04-.68.42-2.36 1.6-2.88 1.94-.83.48-.82.25-.66-.35-.35-.74.18-.75.7-.5 1.34-.84 2.45-1.6 2.37-1.52.06-.2-.14-.07Z';
        break;
      case 'cursor':
        fill = '#FFFFFF';
        path = 'M12 1.75L3.5 6.66v10.68L12 22.25l8.5-4.91V6.66L12 1.75zm0 2.31l6.5 3.75-6.5 3.75-6.5-3.75 6.5-3.75zm-7 5.12l6 3.46v7.22l-6-3.46V9.18zm8 10.68v-7.22l6-3.46v7.22l-6 3.46z';
        break;
      case 'chatgpt':
        fill = '#10A37F';
        vb = '0 0 256 260';
        path = 'M239.18 106.2c5.87-17.68 3.84-37.03-5.57-53.1-14.16-24.64-42.61-37.32-70.4-31.36-15.66-17.42-39.42-25.16-62.33-20.32-22.92 4.84-41.51 21.54-48.78 43.8-18.25 3.75-34 15.17-43.23 31.36-14.31 24.6-11.06 55.63 8.03 76.74-5.89 17.67-3.88 37.02 5.52 53.1 14.17 24.65 42.64 37.32 70.45 31.36 12.37 13.92 30.13 21.85 48.75 21.74 28.48.03 53.71-18.36 62.41-45.48 18.25-3.75 34.03-15.17 43.27-31.38 14.28-24.64 11-55.68-8.12-76.75v.3zm-88.66 137.95c-15.08 0-29.62-5.74-40.66-16.05l1.62-.93 42.14-24.32c2.72-1.57 4.39-4.47 4.39-7.61v-59.53l17.88 10.32c.3.16.48.47.48.82v48.24c-.06 27.08-22.01 49.03-49.09 49.06h3.24zm-94.88-46.77c-7.55-13.06-9.66-28.52-5.89-43.15.42.74.88 1.45 1.39 2.12l24.32 42.14c1.57 2.72 4.47 4.39 7.61 4.39h59.53l-17.88 10.32c-.3.17-.67.17-.97 0l-41.77-24.11c-13.56-7.83-22.78-21.66-25.04-37.19l-1.3 25.48zm-15.13-98.81c7.55-13.06 19.8-22.97 34.19-27.67-.3.8-.54 1.62-.73 2.45l-11.45 47.16c-.76 3.05-.11 6.28 1.76 8.78l35.21 47.38-17.88 10.32c-.3.17-.67.17-.97 0l-41.77-24.11c-23.44-13.54-31.47-43.52-17.93-66.96l-.43 2.65zm175.76 27.24-59.53-34.37 17.88-10.32c.3-.17.67-.17.97 0l41.77 24.11c23.46 13.52 31.51 43.52 17.99 66.98-7.55 13.06-19.8 22.97-34.19 27.67.3-.8.54-1.62.73-2.45l11.45-47.16c.76-3.05.11-6.28-1.76-8.78l-35.31-47.46zm20.89-41.44c7.55 13.06 9.66 28.52 5.89 43.15-.42-.74-.88-1.45-1.39-2.12l-24.32-42.14c-1.57-2.72-4.47-4.39-7.61-4.39h-59.53l17.88-10.32c.3-.17.67-.17.97 0l41.77 24.11c13.54 7.84 22.75 21.67 25 37.2l1.34-25.49zm-86.7-72.33c15.08 0 29.62 5.74 40.66 16.05l-1.62.93-42.14 24.32c-2.72 1.57-4.39 4.47-4.39 7.61v59.53l-17.88-10.32a.96.96 0 0 1-.48-.82V48.43c.06-27.08 22.01-49.03 49.09-49.06h-3.24zM107.5 129.83l20.44-11.8 20.44 11.8v23.61l-20.44 11.8-20.44-11.8v-23.61z';
        break;
      case 'spotify':
        fill = '#1ED760';
        path = 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z';
        break;
      case 'netflix':
        fill = '#E50914';
        path = 'M5.4 0l8.35 23.6c2.34.06 4.85.4 4.85.4L10.11 0H5.4zm8.49 0v9.17l4.71 13.33V0h-4.71zM5.4 1.5V24c1.87-.23 2.81-.31 4.71-.4V14.83L5.4 1.5z';
        break;
      case 'aws':
        fill = '#FF9900';
        path = 'M18.75 14.65c-.17-.13-.39-.14-.56-.03-2.17 1.39-4.8 2.13-7.55 2.13-3.69 0-7.04-1.39-9.5-3.7-.15-.14-.38-.14-.53 0l-.88.85c-.16.15-.16.38 0 .53C2.5 17.15 6.4 18.75 10.64 18.75c3.21 0 6.27-.89 8.79-2.53.18-.12.23-.35.12-.54l-.8-.88v-.15zm1.5-1.92c-.11-.32-.47-.43-.72-.23l-1.9 1.48c-.24.18-.21.55.06.7l2.25 1.25c.27.15.59-.06.56-.36l-.25-2.84zm-7.7-8.98c-1.33 0-2.38.38-3.08 1.11-.7.73-1.04 1.77-1.04 3.06 0 1.29.34 2.33 1.04 3.06.7.73 1.75 1.11 3.08 1.11s2.38-.38 3.08-1.11c.7-.73 1.04-1.77 1.04-3.06 0-1.29-.34-2.33-1.04-3.06-.7-.73-1.75-1.11-3.08-1.11zm0 1.85c.67 0 1.18.23 1.5.69.33.46.49 1.15.49 2.05 0 .9-.16 1.58-.49 2.04-.32.46-.83.69-1.5.69-.68 0-1.19-.23-1.51-.69-.32-.46-.49-1.14-.49-2.04 0-.9.17-1.59.49-2.05.32-.46.83-.69 1.51-.69z';
        break;
      case 'github':
        fill = '#FFFFFF';
        path = 'M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z';
        break;
      case 'youtube':
        fill = '#FF0000';
        path = 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z';
        break;
      default:
        return null;
    }

    return e('svg', {
      className: 'service-brand-icon',
      viewBox: vb,
      width: width,
      height: height,
      fill: fill,
      'aria-hidden': 'true'
    }, e('path', { d: path }));
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
                e(LeafMark),
                e('span', null, copy.spotlightEyebrow || 'Bringing DeFi to daily life')
              ),
              e('h1', { id: 'landing-spotlight-title', className: 'landing-spotlight-title' },
                copy.spotlightTitleBefore || 'Never pay for',
                e('br'),
                e('span', { className: 'landing-title-accent' }, copy.spotlightTitleAccent || 'software again.')
              ),
              e('p', { className: 'landing-spotlight-subhead' },
                copy.spotlightSubhead || 'Deposit once into audited Base lending vaults. Realized yield perpetually settles your monthly software, AI, and cloud subscriptions while your principal stays 100% yours.'
              ),
              e('div', { className: 'landing-thesis-callout' },
                e('span', { className: 'thesis-highlight' }, copy.thesisLabel || 'The Invariant:'),
                copy.thesisQuote || '"Buy it outright and the money is gone. Garden it and you keep the money AND get the subscription."'
              ),
              e('div', { className: 'landing-subs-grid', 'aria-label': 'Select subscription preset' },
                INTENT_SUBS.map(function(s) {
                  var isSelected = activeSub.id === s.id;
                  return e('button', {
                    key: s.id,
                    type: 'button',
                    className: 'landing-sub-chip' + (isSelected ? ' is-selected' : ''),
                    onClick: function() { setActiveSub(s); }
                  },
                    e(ServiceBrandIcon, { slug: s.slug, width: 15, height: 15 }),
                    e('span', { className: 'landing-sub-chip-name' }, s.name),
                    e('span', { className: 'landing-sub-chip-price' }, '$' + s.baseMonthly.toFixed(0) + '/mo')
                  );
                })
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
