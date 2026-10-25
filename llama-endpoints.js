/* llama-endpoints.js — the ONE place DeFi Garden names DefiLlama API URLs.
 *
 * Why this file exists: DefiLlama is reorganising its API. The free hosts
 * (yields.llama.fi, api.llama.fi, coins.llama.fi) still work and are what we
 * use; the PAID Pro paths moved to pro-api.llama.fi/{KEY}/yields/v1/... A
 * future switch (or a base-URL proxy) must be a one-file change, so no other
 * source file may hard-code these hosts (test_llama_endpoints.js enforces it).
 * See docs/defillama-api.md for the switch procedure.
 *
 * UMD, no dependencies:
 *   - Browser: a plain <script src="llama-endpoints.js"> sets
 *     window.LLAMA_ENDPOINTS. The browser build ALWAYS returns the free URLs
 *     and NEVER reads (or can be handed) an API key — a key in client code is
 *     a leaked key. It is loaded synchronously, before planner/landing/app.
 *   - Node / bundled Workers: require('./llama-endpoints.js'). Env overrides
 *     are read ONLY here (CommonJS branch), once, at require time:
 *       LLAMA_YIELDS_BASE   default https://yields.llama.fi
 *       LLAMA_API_BASE      default https://api.llama.fi
 *       LLAMA_COINS_BASE    default https://coins.llama.fi
 *       LLAMA_PRO_API_KEY   if set, pools()/chart() use the Pro v1 paths
 *                           https://pro-api.llama.fi/{KEY}/yields/v1/pools
 *                           https://pro-api.llama.fi/{KEY}/yields/v1/chart/{id}
 *                           (same frozen response shape, same pool UUIDs).
 *       LLAMA_PRO_BASE      default https://pro-api.llama.fi
 *
 * Mirrored (not imported) in the private scoring engine, which reads the same env
 * vars with the same defaults.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) {
    var env = (typeof process !== 'undefined' && process && process.env) || {};
    module.exports = factory(env);
  } else {
    // Browser: no env, no key — free URLs only.
    root.LLAMA_ENDPOINTS = factory(null);
  }
})(typeof window !== 'undefined' ? window : this, function (env) {
  'use strict';

  var DEFAULTS = {
    yields: 'https://yields.llama.fi',
    api: 'https://api.llama.fi',
    coins: 'https://coins.llama.fi',
    pro: 'https://pro-api.llama.fi'
  };

  function clean(v, fallback) {
    var s = typeof v === 'string' ? v.trim().replace(/\/+$/, '') : '';
    return s || fallback;
  }

  // env is null in the browser; build(env) is also exported so tests can
  // construct a configured instance without touching process.env.
  function build(e) {
    e = e || {};
    var YIELDS_BASE = clean(e.LLAMA_YIELDS_BASE, DEFAULTS.yields);
    var API_BASE = clean(e.LLAMA_API_BASE, DEFAULTS.api);
    var COINS_BASE = clean(e.LLAMA_COINS_BASE, DEFAULTS.coins);
    var PRO_BASE = clean(e.LLAMA_PRO_BASE, DEFAULTS.pro);
    var proKey = typeof e.LLAMA_PRO_API_KEY === 'string' ? e.LLAMA_PRO_API_KEY.trim() : '';
    var proYields = proKey ? PRO_BASE + '/' + encodeURIComponent(proKey) + '/yields/v1' : '';

    return {
      YIELDS_BASE: YIELDS_BASE,
      API_BASE: API_BASE,
      COINS_BASE: COINS_BASE,
      // True when pools()/chart() resolve to the paid Pro v1 paths.
      usesPro: !!proKey,
      // GET -> { status: 'success', data: [ {pool, chain, project, symbol, tvlUsd, apy, ...} ] }
      pools: function () {
        return proKey ? proYields + '/pools' : YIELDS_BASE + '/pools';
      },
      // GET -> { status: 'success', data: [ {timestamp, tvlUsd, apy, apyBase, apyReward, ...} ] }
      chart: function (poolId) {
        return (proKey ? proYields + '/chart/' : YIELDS_BASE + '/chart/') + poolId;
      },
      // GET -> [ {name, slug, url, ...} ]  (protocol-name / website lookup)
      protocols: function () {
        return API_BASE + '/protocols';
      },
      // GET -> { coins: { '<chain>:<address>': { price, symbol, decimals, ... } } }
      // `keys` is one coin key or an array (joined with commas, as DefiLlama expects).
      coinsPrices: function (keys) {
        return COINS_BASE + '/prices/current/' + (Array.isArray(keys) ? keys.join(',') : keys);
      }
    };
  }

  var api = build(env);
  api.build = build;
  return api;
});
