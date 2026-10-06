/* lang-menu.js — the header language menu (EN · KO · PT · ES) and the landing's
 * one-line language suggestion. Plain script, React.createElement only (no JSX,
 * no build step); loaded by home.html before landing.js, and read as
 * `window.LangMenu` by landing.js (landing header) and app.js (analytics grid +
 * pool-detail header — one renderHeaderRow serves both).
 *
 * EN and KO are IN-APP languages (the host's own switch: localStorage
 * `defi-garden-lang` + `?lang`). PT and ES are NOT: the interactive surfaces
 * stay EN/KO only, so those two items are plain <a href> links out to the
 * translated static hubs. The hrefs and native names live HERE and not in
 * translations.js on purpose — the interactive-app dictionary carries exactly
 * en + ko (test_i18n_pt_es_static.js) and the hrefs mirror languages.js
 * (pathPrefix) — test_lang_menu.js keeps the two in step.
 *
 * Hubs only, never a per-token/chain deep link: whether /pt/tokens/<slug> exists
 * (pt/es are 'head' scope — thin tokens are never generated) cannot be known
 * client-side without a network request, and a link that might 404 is worse than
 * the hub.
 */
(function () {
  'use strict';

  var PT_ES = [
    { code: 'pt', href: '/pt/tokens', lang: 'pt-BR', hreflang: 'pt', name: 'Português',
      aria: 'Português — páginas de rendimento' },
    { code: 'es', href: '/es/tokens', lang: 'es', hreflang: 'es', name: 'Español',
      aria: 'Español — páginas de rendimientos' }
  ];

  var SUGGEST_KEY = 'defi-garden-lang-suggest-dismissed';

  var SUGGEST_COPY = {
    pt: { lang: 'pt-BR', href: '/pt/tokens', hreflang: 'pt', text: 'Ver rendimentos em português →', dismiss: 'Dispensar sugestão de idioma' },
    es: { lang: 'es', href: '/es/tokens', hreflang: 'es', text: 'Ver rendimientos en español →', dismiss: 'Descartar sugerencia de idioma' }
  };

  // Resolve a string from the interactive dictionary (en/ko only), per-key
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
    var language = props.language === 'ko' ? 'ko' : 'en';
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
    var names = { en: tr(language, 'langNameEn'), ko: tr(language, 'langNameKo') };

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

    function linkItem(item) {
      return e('li', { key: item.code },
        e('a', {
          className: 'lang-menu-item',
          href: item.href,
          lang: item.lang,
          hreflang: item.hreflang,
          'aria-label': item.aria,
          'data-lang': item.code
        }, e('span', null, item.name), e('span', { className: 'lang-menu-code', 'aria-hidden': 'true' }, item.code.toUpperCase()))
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
        appItem('en'),
        appItem('ko'),
        PT_ES.map(linkItem)
      ) : null
    );
  }

  // First pt/es entry of navigator.languages (falls back to navigator.language).
  function suggestedLanguage() {
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) list = Array.prototype.slice.call(navigator.languages);
      else if (navigator.language) list = [navigator.language];
    } catch (err) { list = []; }
    for (var i = 0; i < list.length; i++) {
      var tag = String(list[i] || '').toLowerCase();
      if (tag === 'pt' || tag.indexOf('pt-') === 0) return 'pt';
      if (tag === 'es' || tag.indexOf('es-') === 0) return 'es';
    }
    return null;
  }

  function wasDismissed() {
    try { return window.localStorage.getItem(SUGGEST_KEY) === '1'; } catch (err) { return false; }
  }

  // Renders nothing unless the browser prefers pt/es and the notice was not
  // dismissed. Never redirects; a link and a close button, nothing else.
  function Suggest() {
    var React = window.React;
    var e = React.createElement;
    var lang = React.useState(function () { return wasDismissed() ? null : suggestedLanguage(); });
    var code = lang[0];
    if (!code) return null;
    var copy = SUGGEST_COPY[code];
    function dismiss() {
      try { window.localStorage.setItem(SUGGEST_KEY, '1'); } catch (err) { /* in-session dismiss still works */ }
      lang[1](null);
    }
    return e('div', { className: 'lang-suggest', 'data-testid': 'lang-suggest', 'data-lang': code, lang: copy.lang },
      e('a', { className: 'lang-suggest-link', href: copy.href, hreflang: copy.hreflang }, copy.text),
      e('button', { type: 'button', className: 'lang-suggest-dismiss', 'aria-label': copy.dismiss, onClick: dismiss }, '×')
    );
  }

  window.LangMenu = { Menu: Menu, Suggest: Suggest, PT_ES: PT_ES, SUGGEST_KEY: SUGGEST_KEY, suggestedLanguage: suggestedLanguage };
})();
