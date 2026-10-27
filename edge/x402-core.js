/* Re-export shim. The canonical module lives at api/_edge/x402-core.js so the
 * Vercel function can bundle it while `.vercelignore` keeps all of edge/ off
 * the CDN. Cloudflare (edge/agent-log.mjs) and the tests keep importing here. */
'use strict';
module.exports = require('../api/_edge/x402-core.js');
