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
    return e('svg', { className: 'landing-icon', viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
      e('circle', { cx: '10.8', cy: '10.8', r: '6.3', stroke: 'currentColor', strokeWidth: '1.8' }),
      e('path', { d: 'm16 16 4.2 4.2', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round' })
    );
  }

  function ArrowIcon() {
    return e('svg', { className: 'landing-arrow-icon', viewBox: '0 0 20 20', fill: 'none', 'aria-hidden': 'true' },
      e('path', { d: 'M4 10h11M11 5l5 5-5 5', stroke: 'currentColor', strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round' })
    );
  }

  function LeafMark() {
    return e('svg', { className: 'landing-leaf-mark', viewBox: '0 0 32 32', fill: 'none', 'aria-hidden': 'true' },
      e('path', { d: 'M26.7 4.8C16.2 5.2 8.2 10.7 7.1 20.4c-.3 2.8.7 5.2 2.4 6.8 1.6-8.5 6.5-14.6 14.1-18.2-4.5 3.9-7.6 8.7-9 14.6 3.1-3.9 7-6.8 11.7-8.8.8-2.8.9-6 .4-10Z', fill: 'currentColor' }),
      e('path', { d: 'M8.8 27.2c3.2-5.1 7.2-8.9 12.2-11.4', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round' })
    );
  }

  function PlantIllustration() {
    return e('svg', { className: 'landing-plant-svg', viewBox: '0 0 340 260', fill: 'none', 'aria-hidden': 'true' },
      e('circle', { cx: '170', cy: '130', r: '105', className: 'landing-plant-halo' }),
      e('path', { d: 'M170 205V91', className: 'landing-plant-stem' }),
      e('path', { d: 'M170 125c-28-24-52-23-70-9 16 26 41 29 70 9Z', className: 'landing-plant-leaf landing-plant-leaf-left' }),
      e('path', { d: 'M170 100c26-25 52-25 70-11-15 27-40 31-70 11Z', className: 'landing-plant-leaf landing-plant-leaf-right' }),
      e('path', { d: 'M170 151c-23-18-42-17-56-8 13 22 32 24 56 8Z', className: 'landing-plant-leaf landing-plant-leaf-left landing-plant-leaf-small' }),
      e('path', { d: 'M170 145c22-20 42-20 56-10-12 22-32 25-56 10Z', className: 'landing-plant-leaf landing-plant-leaf-right landing-plant-leaf-small' }),
      e('path', { d: 'M128 205h84l-10 35h-64l-10-35Z', className: 'landing-plant-pot' }),
      e('path', { d: 'M122 204h96', className: 'landing-plant-pot-rim' }),
      e('path', { d: 'M110 240h120', className: 'landing-plant-ground' })
    );
  }

  function buildSearchHref(query) {
    var clean = String(query || '').trim();
    if (!clean) return null;

    var lower = clean.toLowerCase();
    var params = new URLSearchParams();
    var token = null;
    var chain = null;

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

    if (!token && /^[a-z0-9][a-z0-9._-]*$/i.test(clean)) token = clean.toUpperCase();
    if (!token && !chain) {
      var exactChain = CHAIN_HINTS.find(function (candidate) { return candidate.toLowerCase() === lower; });
      if (exactChain) chain = exactChain;
    }

    if (token) params.set('token', token);
    if (chain) params.set('chain', chain);
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
    var copy = getCopy(language);

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
      setQuery(value);
      var input = document.querySelector('.landing-search-input');
      if (input) input.focus();
    }

    function closeMenu() { setMenuOpen(false); }

    return e('div', { className: 'landing-app', 'data-mode': 'landing' },
      e('div', { className: 'landing-backdrop', 'aria-hidden': 'true' },
        e('span', { className: 'landing-backdrop-orbit landing-backdrop-orbit-one' }),
        e('span', { className: 'landing-backdrop-orbit landing-backdrop-orbit-two' }),
        e('span', { className: 'landing-backdrop-dot landing-backdrop-dot-one' }),
        e('span', { className: 'landing-backdrop-dot landing-backdrop-dot-two' })
      ),

      e('header', { className: 'landing-header landing-reveal landing-reveal-one' },
        e('a', { className: 'landing-brand', href: '/', 'aria-label': copy.navSearch },
          e('span', { className: 'landing-brand-mark' }, e(LeafMark)),
          e('span', null, 'DeFi Garden')
        ),
        e('nav', { className: 'landing-nav', 'aria-label': copy.navPrimary },
          e('a', { href: '/?app=1' }, copy.navSearch),
          e('a', { href: '#trust' }, copy.navHowItWorks),
          e('a', { href: 'plan.html' }, copy.navGarden)
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
        e('a', { href: '#trust', onClick: closeMenu }, copy.navHowItWorks),
        e('a', { href: 'plan.html', onClick: closeMenu }, copy.navGarden)
      ),

      e('main', { className: 'landing-main' },
        e('section', { className: 'landing-hero', 'aria-labelledby': 'landing-title' },
          e('div', { className: 'landing-hero-copy' },
            e('h1', { id: 'landing-title', className: 'landing-title landing-reveal landing-reveal-two' },
              copy.heroTitleBefore,
              e('br'),
              e('span', { className: 'landing-title-accent' }, copy.heroTitleAccent)
            ),
            e('p', { className: 'landing-hero-body landing-reveal landing-reveal-three' }, copy.heroBody),
            e('form', { className: 'landing-search-form landing-reveal landing-reveal-four', onSubmit: submitSearch },
              e('label', { className: 'sr-only', htmlFor: 'landing-search' }, copy.searchLabel),
              e('div', { className: 'landing-search-shell' },
                e(SearchIcon),
                e('input', {
                  id: 'landing-search',
                  'data-testid': 'landing-search',
                  className: 'landing-search-input',
                  type: 'search',
                  value: query,
                  placeholder: copy.searchPlaceholder,
                  onChange: function (event) { setQuery(event.target.value); },
                  autoComplete: 'off'
                }),
                e('button', { type: 'submit', className: 'landing-search-submit', 'aria-label': copy.searchSubmit },
                  e('span', { className: 'landing-search-submit-label' }, copy.searchSubmit),
                  e(ArrowIcon)
                )
              )
            ),
            e('div', { className: 'landing-examples landing-reveal landing-reveal-five' },
              e('span', { className: 'landing-examples-label' }, copy.examplesLabel),
              e(ExampleChip, { value: 'USDC on Base', onChoose: chooseExample }, copy.exampleUsdc),
              e(ExampleChip, { value: 'ETH staking', onChoose: chooseExample }, copy.exampleEth),
              e(ExampleChip, { value: 'Lending on Arbitrum', onChoose: chooseExample }, copy.exampleLending)
            )
          ),
          e('aside', { className: 'landing-garden-card landing-reveal landing-reveal-three' },
            e('div', { className: 'landing-card-topline' },
              e('span', { className: 'landing-seed-icon' }, e(LeafMark)),
              e('span', { className: 'landing-card-caption' }, copy.gardenNote)
            ),
            e('h2', null, copy.gardenTitle),
            e('p', null, copy.gardenBody),
            e('a', { className: 'landing-garden-link', href: 'plan.html' }, copy.gardenCta, e(ArrowIcon)),
            e(PlantIllustration)
          )
        ),
        e('section', { id: 'trust', className: 'landing-trust-section', 'aria-labelledby': 'landing-trust-title' },
          e('div', { className: 'landing-trust-copy' },
            e('h2', { id: 'landing-trust-title' }, copy.trustHeading),
            e('p', null, copy.trustBody)
          ),
          e('div', { className: 'landing-trust-rail' },
            e('div', { className: 'landing-trust-item' }, e('span', { className: 'landing-trust-dot' }), e('span', null, copy.trustLive)),
            e('div', { className: 'landing-trust-item' }, e('span', { className: 'landing-trust-symbol' }, '⌁'), e('span', null, copy.trustFloor)),
            e('div', { className: 'landing-trust-item' }, e('span', { className: 'landing-trust-symbol' }, '↗'), e('span', null, copy.trustEducation))
          )
        )
      ),

      e('footer', { className: 'app-footer' },
        e('p', null,
          copy.footerPoweredBy, ' ',
          e('a', { href: 'https://api-docs.defillama.com/', target: '_blank', rel: 'noopener noreferrer' }, copy.footerDefillamaApi),
          copy.footerMadeWith
        ),
        e('p', { className: 'app-footer-hub-links' },
          e('a', { href: '/tokens' }, copy.footerBrowseTokens),
          ' · ',
          e('a', { href: '/chains' }, copy.footerBrowseChains)
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
