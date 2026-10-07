/* lang-menu.js — the header language menu (EN · KO · PT · ES) and the landing's
 * one-line language suggestion. Plain script, React.createElement only (no JSX,
 * no build step); loaded by home.html after translations.js and before
 * landing.js, and read as `window.LangMenu` by landing.js (landing header) and
 * app.js (analytics grid + pool-detail header — one renderHeaderRow serves both).
 *
 * All four languages are IN-APP switches: every item is a <button> that calls
 * the host's onSelect(code) (localStorage `defi-garden-lang` + `?lang`). The
 * item names (native) and the suggestion copy live in translations.js
 * (langName*, langSuggestText, langSuggestDismiss). The static /pt/tokens and
 * /es/tokens hubs are untouched and no longer linked from this menu.
 */
(function () {
  'use strict';

  var LANGS = ['en', 'ko', 'pt', 'es'];

  var SUGGEST_KEY = 'defi-garden-lang-suggest-dismissed';

  // Resolve a string from the interactive dictionary (en/ko/pt/es), per-key
  // fallback to EN — the same contract as createTranslationFunction.
  function tr(language, key) {
    var all = (typeof translations !== 'undefined') ? translations : null;
    var dict = all && all[language];
    var val = dict && dict[key];
    if (val == null) val = all && all.en && all.en[key];
    return typeof val === 'string' ? val : key;
  }

  function Menu(props) {
    var React = window.React;
    var e = React.createElement;
    var language = LANGS.indexOf(props.language) !== -1 ? props.language : 'en';
    var open = React.useState(false);
    var isOpen = open[0];
    var setOpen = open[1];
    var rootRef = React.useRef(null);
    var triggerRef = React.useRef(null);

    // Close on outside press, Escape (focus returns to the trigger when it was
    // inside the menu), and when keyboard focus leaves the menu.
    React.useEffect(function () {
      if (!isOpen) return undefined;
      function inside(node) { return !!(rootRef.current && node && rootRef.current.contains(node)); }
      function onPointerDown(ev) { if (!inside(ev.target)) setOpen(false); }
      function onFocusIn(ev) { if (!inside(ev.target)) setOpen(false); }
      function onKeyDown(ev) {
        if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
        var hadFocus = inside(document.activeElement);
        setOpen(false);
        if (hadFocus && triggerRef.current) triggerRef.current.focus();
      }
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('focusin', onFocusIn);
      document.addEventListener('keydown', onKeyDown);
      return function () {
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('focusin', onFocusIn);
        document.removeEventListener('keydown', onKeyDown);
      };
    }, [isOpen]);

    var menuLabel = tr(language, 'langMenuLabel');
    var names = {
      en: tr(language, 'langNameEn'),
      ko: tr(language, 'langNameKo'),
      pt: tr(language, 'langNamePt'),
      es: tr(language, 'langNameEs')
    };

    function pick(code) {
      setOpen(false);
      if (triggerRef.current) triggerRef.current.focus();
      if (code !== language && typeof props.onSelect === 'function') props.onSelect(code);
    }

    function appItem(code) {
      var current = code === language;
      return e('li', { key: code },
        e('button', {
          type: 'button',
          className: 'lang-menu-item',
          lang: code,
          'aria-current': current ? 'true' : undefined,
          'data-lang': code,
          onClick: function () { pick(code); }
        }, e('span', null, names[code]), e('span', { className: 'lang-menu-code', 'aria-hidden': 'true' }, code.toUpperCase()))
      );
    }

    return e('div', { className: 'lang-menu', ref: rootRef },
      e('button', {
        type: 'button',
        ref: triggerRef,
        className: (props.triggerClassName || '') + ' lang-menu-trigger',
        'aria-haspopup': 'true',
        'aria-expanded': isOpen ? 'true' : 'false',
        'aria-label': menuLabel + ': ' + names[language],
        onClick: function () {
          if (!isOpen && typeof props.onOpen === 'function') props.onOpen();
          setOpen(!isOpen);
        }
      }, language.toUpperCase()),
      isOpen ? e('ul', { className: 'lang-menu-panel', 'aria-label': menuLabel },
        LANGS.map(appItem)
      ) : null
    );
  }

  function normalize(value) {
    if (typeof normalizeLanguageCode === 'function') return normalizeLanguageCode(value);
    var base = String(value || '').toLowerCase().split('-')[0];
    return LANGS.indexOf(base) !== -1 ? base : null;
  }

  // First supported entry of navigator.languages (falls back to navigator.language).
  function suggestedLanguage() {
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) list = Array.prototype.slice.call(navigator.languages);
      else if (navigator.language) list = [navigator.language];
    } catch (err) { list = []; }
    for (var i = 0; i < list.length; i++) {
      var code = normalize(list[i]);
      if (code) return code;
    }
    return null;
  }

  function wasDismissed() {
    try { return window.localStorage.getItem(SUGGEST_KEY) === '1'; } catch (err) { return false; }
  }

  // Renders nothing unless the browser prefers a supported language other than
  // the current app language and the notice was not dismissed. Never redirects;
  // a button (in-app switch via props.onSelect) and a close button, nothing else.
  function Suggest(props) {
    var React = window.React;
    var e = React.createElement;
    var current = LANGS.indexOf(props && props.language) !== -1 ? props.language : 'en';
    var dismissedState = React.useState(function () { return wasDismissed(); });
    var code = dismissedState[0] ? null : suggestedLanguage();
    if (!code || code === current || !props || typeof props.onSelect !== 'function') return null;
    var all = (typeof translations !== 'undefined') ? translations : null;
    var dict = (all && all[code]) ? code : 'en';
    function dismiss() {
      try { window.localStorage.setItem(SUGGEST_KEY, '1'); } catch (err) { /* in-session dismiss still works */ }
      dismissedState[1](true);
    }
    return e('div', { className: 'lang-suggest', 'data-testid': 'lang-suggest', 'data-lang': code, lang: code === 'pt' ? 'pt-BR' : code },
      e('button', { type: 'button', className: 'lang-suggest-link', onClick: function () { props.onSelect(code); } }, tr(dict, 'langSuggestText')),
      e('button', { type: 'button', className: 'lang-suggest-dismiss', 'aria-label': tr(dict, 'langSuggestDismiss'), onClick: dismiss }, '\u00d7')
    );
  }

  window.LangMenu = { Menu: Menu, Suggest: Suggest, LANGS: LANGS, SUGGEST_KEY: SUGGEST_KEY, suggestedLanguage: suggestedLanguage };
})();
