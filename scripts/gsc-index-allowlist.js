#!/usr/bin/env node
/**
 * Regenerate config/seo-index-allowlist.json from Google Search Console.
 *
 * MANUAL, run by the site owner on a machine with Google credentials. NOT part
 * of CI (the "Build & Publish Site" workflow has no Google credentials).
 *
 * Token pages with fewer than NOINDEX_POOL_THRESHOLD qualifying pools are
 * noindex,follow unless their slug is in this allowlist (generate-token-pages.js).
 * The list holds every /tokens/<slug> (en) and /ko/tokens/<slug> (ko) with >=1
 * impression in the last 90 days (window ends 3 days ago: GSC data lag).
 *
 * Usage:  node scripts/gsc-index-allowlist.js [--dry-run]
 * Env:    GCLOUD (gcloud binary, default /opt/homebrew/share/google-cloud-sdk/bin/gcloud)
 *         GSC_QUOTA_PROJECT (default aiaanhuis-seo)
 * Then review the git diff and commit config/seo-index-allowlist.json.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const SITE = 'sc-domain:defi.garden';
const OUT = path.join(__dirname, '..', 'config', 'seo-index-allowlist.json');
const GCLOUD = process.env.GCLOUD || '/opt/homebrew/share/google-cloud-sdk/bin/gcloud';
const QUOTA_PROJECT = process.env.GSC_QUOTA_PROJECT || 'aiaanhuis-seo';

const iso = (d) => d.toISOString().slice(0, 10);
function windowDates(now) {
  const end = new Date(now.getTime() - 3 * 86400000);
  const start = new Date(end.getTime() - 90 * 86400000);
  return { startDate: iso(start), endDate: iso(end) };
}

/** Pure: GSC page rows -> { en: [slugs], ko: [slugs] } (>=1 impression, sorted, unique). */
function extractSlugs(rows) {
  const en = new Set(), ko = new Set();
  (rows || []).forEach(r => {
    if (!(r.impressions >= 1)) return;
    let u;
    try { u = new URL(r.keys[0]); } catch (_) { return; }
    const m = /^\/(ko\/)?tokens\/([^/]+?)\/?$/.exec(u.pathname);
    if (!m || m[2] === 'az' || m[2] === 'index') return;
    (m[1] ? ko : en).add(decodeURIComponent(m[2]));
  });
  return { en: [...en].sort(), ko: [...ko].sort() };
}

function post(url, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) }, headers) }, res => {
      let buf = '';
      res.on('data', c => { buf += c; });
      res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(buf)) : reject(new Error(`GSC HTTP ${res.statusCode}: ${buf.slice(0, 300)}`)));
    });
    req.on('error', reject);
    req.end(data);
  });
}

async function main() {
  const token = execFileSync(GCLOUD, ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8' }).trim();
  const { startDate, endDate } = windowDates(new Date());
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;
  const res = await post(url, { authorization: `Bearer ${token}`, 'x-goog-user-project': QUOTA_PROJECT },
    { startDate, endDate, dimensions: ['page'], rowLimit: 25000 });
  const rows = res.rows || [];
  if (rows.length >= 25000) console.warn('WARNING: hit rowLimit 25000; results may be truncated');
  const { en, ko } = extractSlugs(rows);
  const cfg = { source: `Google Search Console ${SITE}, page impressions ${startDate}..${endDate}`, generated: iso(new Date()),
    note: 'Token slugs with >=1 search impression in the window; exempt from the thin-page noindex in generate-token-pages.js. Refresh with scripts/gsc-index-allowlist.js.', en, ko };
  const arr = (a) => '[\n' + a.map(s => '    ' + JSON.stringify(s)).join(',\n') + '\n  ]';
  const text = `{\n  "source": ${JSON.stringify(cfg.source)},\n  "generated": ${JSON.stringify(cfg.generated)},\n  "note": ${JSON.stringify(cfg.note)},\n  "en": ${arr(en)},\n  "ko": ${arr(ko)}\n}\n`;
  if (process.argv.includes('--dry-run')) { console.log(text); return; }
  fs.writeFileSync(OUT, text);
  console.log(`Wrote ${OUT}: ${en.length} en, ${ko.length} ko slugs (${startDate}..${endDate})`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { extractSlugs, windowDates };
