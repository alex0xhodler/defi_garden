#!/usr/bin/env node

/**
 * IndexNow ping for DeFi Garden (backlog 022).
 * After a sitemap/token-page regen, POST the changed URL list to IndexNow's
 * single public endpoint (fans out to Bing + Yandex; Google does not
 * participate in IndexNow) so those engines can crawl the freshly generated
 * /tokens/<slug> pages (021) without waiting on a full sitemap re-crawl.
 *
 * Ownership proof: a key file `<KEY>.txt` containing exactly `<KEY>` is
 * committed at the repo root and served at https://www.defi.garden/<KEY>.txt
 * by Vercel's default static handling. This script reads that file rather
 * than hardcoding the key a second time, so the two can never drift.
 *
 * Usage:
 *   node indexnow-ping.js                # read sitemap-token-pages.xml, submit
 *   node indexnow-ping.js --dry-run       # build + log the payload, no network call
 *   node indexnow-ping.js --sitemap a.xml --sitemap b.xml   # merge multiple sitemaps
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SITE_URL = 'https://www.defi.garden';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
// IndexNow's documented per-submission cap (protects against ever POSTing an
// oversized batch, even though our current ~2,028 token URLs are well under it).
const MAX_URLS_PER_SUBMISSION = 10000;

/** Find the committed <hex>.txt key file at repo root (there should be exactly one). */
function findKeyFile(dir) {
  const match = fs.readdirSync(dir).find(f => /^[a-f0-9]{16,64}\.txt$/.test(f));
  if (!match) throw new Error('no IndexNow key file (<hex>.txt) found at repo root');
  return path.join(dir, match);
}

function loadKey(dir) {
  const keyFile = findKeyFile(dir || __dirname);
  const key = fs.readFileSync(keyFile, 'utf8').trim();
  if (!key) throw new Error(`key file ${keyFile} is empty`);
  return { key, keyFileName: path.basename(keyFile) };
}

/** Parse <loc>...</loc> entries out of a sitemap XML string (same lightweight
 *  regex approach the rest of this codebase uses for sitemap XML — no new
 *  XML-parsing dependency). */
function extractLocs(xml) {
  const out = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

/** Read one or more sitemap files and return a deduped, capped URL list. */
function collectUrls(sitemapPaths, maxUrls) {
  const cap = maxUrls || MAX_URLS_PER_SUBMISSION;
  const seen = new Set();
  const urls = [];
  for (const p of sitemapPaths) {
    if (!fs.existsSync(p)) continue;
    const xml = fs.readFileSync(p, 'utf8');
    for (const loc of extractLocs(xml)) {
      if (!seen.has(loc)) { seen.add(loc); urls.push(loc); }
    }
  }
  return urls.slice(0, cap);
}

/** Build the exact JSON body IndexNow's API requires. Pure — no I/O. */
function buildIndexNowPayload(urls, host, key, keyLocation) {
  return { host, key, keyLocation, urlList: urls };
}

/** POST the payload to IndexNow. The only network call in this file. */
function submitToIndexNow(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', (e) => reject(new Error('IndexNow request failed: ' + e.message)));
    req.write(body);
    req.end();
  });
}

function parseArgs(argv) {
  const args = { sitemaps: [], dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sitemap') args.sitemaps.push(argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  if (args.sitemaps.length === 0) args.sitemaps = ['sitemap-token-pages.xml'];
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { key, keyFileName } = loadKey(__dirname);
  const host = SITE_URL.replace(/^https?:\/\//, '');
  const keyLocation = `${SITE_URL}/${keyFileName}`;

  const urls = collectUrls(args.sitemaps.map((p) => path.resolve(p)));
  console.log(`🔑 key=${keyFileName} · 📄 ${urls.length} URL(s) from ${args.sitemaps.join(', ')}`);

  const payload = buildIndexNowPayload(urls, host, key, keyLocation);

  if (args.dryRun || urls.length === 0) {
    console.log(args.dryRun ? '🧪 --dry-run: not submitting. Payload:' : 'ℹ️  no URLs found — nothing to submit. Payload would be:');
    console.log(JSON.stringify(payload, null, 2).slice(0, 500) + (JSON.stringify(payload).length > 500 ? ' …' : ''));
    return;
  }

  console.log(`📡 Submitting ${urls.length} URL(s) to IndexNow (${INDEXNOW_ENDPOINT})...`);
  const res = await submitToIndexNow(payload);
  console.log(`✅ IndexNow responded ${res.statusCode}`);
}

if (require.main === module) {
  main().catch((e) => { console.error('❌', e.message); process.exit(1); });
}

module.exports = {
  buildIndexNowPayload, collectUrls, extractLocs, submitToIndexNow, loadKey, findKeyFile,
  SITE_URL, INDEXNOW_ENDPOINT, MAX_URLS_PER_SUBMISSION,
};
