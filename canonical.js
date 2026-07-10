/* Pure canonical-URL computation for DeFi Garden's IA router (spec 011:
   "Stop the canonical lie"). Loaded synchronously in home.html's <head>
   BEFORE the router script, which calls window.__canonicalFor(search) to
   set <link rel="canonical"> + og:url on every load, in both modes — no
   static canonical exists in the HTML anymore, so this function is the
   single source of truth. Also required directly by test_canonical.js
   (node) — UMD-style guard mirrors planner.js's module.exports pattern.

   Normalizes the query string to only the params that define distinct
   analytics-app content (CANONICAL_PARAMS, in a fixed output order), so
   ?lang=, unknown/junk params, and input param order never fragment one
   page's indexing signal across multiple "different" canonical URLs. A
   search string with none of these present — bare /, planner share URLs
   (?goal=&pace=&years=&capital=&fm=&dl=), ?fresh=1, ?preset=x, ?lang=ko
   alone, or the header icon's mode-only ?app=1 link (planner.js) — falls
   through to the bare site root.

   Deliberate design note: this reuses one allow-list for both "is this an
   analytics URL" and "what goes in the query." It does NOT re-derive
   window.__APP_MODE's ANALYTICS_PARAMS list in home.html (which also
   includes 'app' and stays untouched there, per spec 011's own
   instruction not to touch it). The two lists can safely differ because
   'app' never contributes a normalized query param here either way — a
   request that is analytics mode ONLY because of ?app=1 has no
   normalizable params under either list, so root is the correct, honest
   canonical for that unfiltered view regardless of which list decided
   "mode." See specs/011-notes.md for the full equivalence argument. */
(function () {
    var SITE_ROOT = 'https://www.defi.garden/';
    // Fixed order — output order is always this, regardless of input order,
    // so e.g. ?chain=Base&token=USDC and ?token=USDC&chain=Base canonicalize
    // to the identical URL.
    var CANONICAL_PARAMS = ['token', 'chain', 'pool', 'poolTypes', 'protocols', 'minTvl', 'minApy'];

    function canonicalFor(search) {
        var params = new URLSearchParams(search || '');
        var out = new URLSearchParams();
        CANONICAL_PARAMS.forEach(function (key) {
            if (params.has(key)) out.set(key, params.get(key));
        });
        var qs = out.toString();
        return qs ? SITE_ROOT + '?' + qs : SITE_ROOT;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = canonicalFor;
    } else {
        window.__canonicalFor = canonicalFor;
    }
})();
