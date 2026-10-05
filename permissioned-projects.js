/**
 * Shared list of permissioned / restricted projects (KYC, accredited-investor
 * or qualified-purchaser only). Single source of truth, required by:
 *   - api/mcp.js                     (get_pool_score access_restriction flag)
 *   - generate-token-pages.js        (isPermissionedPool — token/chain tables)
 *   - generate-pool-score-pages.js   (W1 "Who can access it" block)
 * Plain CommonJS with no dependencies so the serverless function can require it.
 * Maintained manually; add project slugs (DefiLlama `project`) as identified.
 */
'use strict';

const PERMISSIONED_PROJECT_LIST = new Set([
  'blackrock-buidl',    // qualified purchasers only
  'ondo-yield-assets',  // USDY — not offered to US persons
  'invesco-ustb',       // institutional / accredited investors
  'circle-usyc',        // USYC — qualified purchasers
  'superstate',         // USTB — qualified purchasers
  'hashnote',           // USYC — qualified purchasers
  'centrifuge-protocol' // RWA — accredited investors for some pools
]);

/** True when the pool's project is on the permissioned list. */
function isPermissionedProject(project) {
  return PERMISSIONED_PROJECT_LIST.has(String(project || '').toLowerCase());
}

module.exports = { PERMISSIONED_PROJECT_LIST, isPermissionedProject };
