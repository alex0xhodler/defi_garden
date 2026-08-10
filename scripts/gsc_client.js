#!/usr/bin/env node

/**
 * gsc_client.js — Google Search Console API Client for DeFi Garden
 * 
 * Zero external dependencies — uses Node.js native `crypto` and `https` modules.
 * Connects to Google Search Console API v3 / v1 using a GCP Service Account JSON key.
 * 
 * Usage:
 *   node scripts/gsc_client.js performance [--site <url>] [--days 28] [--by page|query|date|country] [--limit 50]
 *   node scripts/gsc_client.js compare [--site <url>] [--days 28]
 *   node scripts/gsc_client.js inspect <url> [--site <url>]
 *   node scripts/gsc_client.js sitemaps [--site <url>]
 *   node scripts/gsc_client.js audit [--site <url>]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// Configuration
const DEFAULT_SITE_URL = 'https://www.defi.garden/';
const KEY_PATHS = [
  process.env.GSC_KEY_PATH,
  path.join(process.env.HOME || '/Users/0xhodler', '.hermes', 'gsc-key.json'),
  path.join(process.env.HOME || '/Users/0xhodler', 'gsc-key.json'),
  path.join(__dirname, '..', 'gsc-key.json')
].filter(Boolean);

// Find Service Account Key
function loadServiceAccountKey() {
  for (const p of KEY_PATHS) {
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (data.client_email && data.private_key) {
          return { key: data, path: p };
        }
      } catch (err) {
        // Continue searching
      }
    }
  }
  return null;
}

// Generate RS256 JWT & Exchange for Access Token
function getAccessToken(keyData) {
  return new Promise((resolve, reject) => {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
      iss: keyData.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/webmasters',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    const b64Url = str => Buffer.from(str).toString('base64url');
    const encodedHeader = b64Url(JSON.stringify(header));
    const encodedClaim = b64Url(JSON.stringify(claimSet));
    const unsignedToken = `${encodedHeader}.${encodedClaim}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedToken);
    const signature = signer.sign(keyData.private_key, 'base64url');
    const jwt = `${unsignedToken}.${signature}`;

    const postData = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString();

    const req = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed.access_token);
          } catch (e) {
            reject(new Error(`Failed to parse OAuth response: ${e.message}`));
          }
        } else {
          reject(new Error(`OAuth Token Error (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Helper: Make Authenticated Google API Request
function googleApiRequest(accessToken, method, urlPath, bodyData = null) {
  return new Promise((resolve, reject) => {
    const postData = bodyData ? JSON.stringify(bodyData) : null;
    const req = https.request(`https://www.googleapis.com${urlPath}`, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ raw: body });
          }
        } else {
          reject(new Error(`GSC API Error (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Query Search Performance Data
async function queryPerformance(accessToken, siteUrl, options = {}) {
  const days = options.days || 28;
  const dimensions = options.dimensions || ['query', 'page'];
  const rowLimit = options.limit || 100;

  const endDate = new Date().toISOString().split('T')[0];
  const startDateObj = new Date();
  startDateObj.setDate(startDateObj.getDate() - days);
  const startDate = startDateObj.toISOString().split('T')[0];

  const endpoint = `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const body = {
    startDate,
    endDate,
    dimensions,
    rowLimit
  };

  return await googleApiRequest(accessToken, 'POST', endpoint, body);
}

// Query Sitemaps Status
async function querySitemaps(accessToken, siteUrl) {
  const endpoint = `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`;
  return await googleApiRequest(accessToken, 'GET', endpoint);
}

// Submit Sitemap to GSC
async function submitSitemap(accessToken, siteUrl, sitemapUrl) {
  const endpoint = `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`;
  return await googleApiRequest(accessToken, 'PUT', endpoint);
}

// Query Sites List
async function querySites(accessToken) {
  const endpoint = `/webmasters/v3/sites`;
  return await googleApiRequest(accessToken, 'GET', endpoint);
}

// Inspect Specific URL Indexing Status (using searchconsole.googleapis.com)
function inspectUrl(accessToken, siteUrl, inspectionUrl) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      inspectionUrl,
      siteUrl
    });

    const req = https.request('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve({ raw: body });
          }
        } else {
          reject(new Error(`URL Inspection API Error (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Main CLI Entrypoint
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'audit';

  const siteIdx = args.indexOf('--site');
  const siteUrl = siteIdx !== -1 ? args[siteIdx + 1] : DEFAULT_SITE_URL;

  const daysIdx = args.indexOf('--days');
  const days = daysIdx !== -1 ? parseInt(args[daysIdx + 1], 10) : 28;

  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

  const keyResult = loadServiceAccountKey();

  if (!keyResult) {
    console.log(JSON.stringify({
      status: 'NEEDS_CREDENTIALS',
      message: 'Google Search Console Service Account Key not found.',
      key_locations_searched: KEY_PATHS,
      setup_instructions: [
        '1. Go to https://console.cloud.google.com/ and create or select a project.',
        '2. Enable "Google Search Console API".',
        '3. Go to IAM & Admin -> Service Accounts -> Create Service Account.',
        '4. Create a JSON Key and download it.',
        '5. Save the JSON key file to ~/.hermes/gsc-key.json (or set GSC_KEY_PATH environment variable).',
        '6. Open Google Search Console (https://search.google.com/search-console).',
        '7. Go to Settings -> Users and permissions -> Add user.',
        '8. Paste the service account email (e.g. xxx@project.iam.gserviceaccount.com) and grant Full or Viewer access.'
      ]
    }, null, 2));
    process.exit(0);
  }

  try {
    const accessToken = await getAccessToken(keyResult.key);

    if (command === 'sites') {
      const result = await querySites(accessToken);
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'submit-sitemap') {
      const sitemapUrl = args[1];
      if (!sitemapUrl) {
        console.error('Usage: node scripts/gsc_client.js submit-sitemap <sitemapUrl> [--site <siteUrl>]');
        process.exit(1);
      }
      const result = await submitSitemap(accessToken, siteUrl, sitemapUrl);
      console.log(JSON.stringify({ status: 'SUBMITTED', sitemapUrl, siteUrl, result }, null, 2));
    } else if (command === 'sitemaps') {
      const result = await querySitemaps(accessToken, siteUrl);
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'performance') {
      const byIdx = args.indexOf('--by');
      const byMode = byIdx !== -1 ? args[byIdx + 1] : 'query,page';
      const dimensions = byMode.split(',').map(s => s.trim());
      const result = await queryPerformance(accessToken, siteUrl, { days, dimensions, limit });
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'inspect') {
      const inspectionUrl = args[1] && !args[1].startsWith('--') ? args[1] : siteUrl;
      const result = await inspectUrl(accessToken, siteUrl, inspectionUrl);
      console.log(JSON.stringify(result, null, 2));
    } else if (command === 'audit') {
      const [sitemaps, perfByQuery, perfByPage] = await Promise.all([
        querySitemaps(accessToken, siteUrl).catch(e => ({ error: e.message })),
        queryPerformance(accessToken, siteUrl, { days: 28, dimensions: ['query'], limit: 20 }).catch(e => ({ error: e.message })),
        queryPerformance(accessToken, siteUrl, { days: 28, dimensions: ['page'], limit: 20 }).catch(e => ({ error: e.message }))
      ]);

      const totalClicks = (perfByQuery.rows || []).reduce((acc, r) => acc + (r.clicks || 0), 0);
      const totalImpressions = (perfByQuery.rows || []).reduce((acc, r) => acc + (r.impressions || 0), 0);
      const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) + '%' : '0%';

      console.log(JSON.stringify({
        status: 'CONNECTED',
        siteUrl,
        keyFile: keyResult.path,
        serviceAccountEmail: keyResult.key.client_email,
        summary_28d: {
          totalClicks,
          totalImpressions,
          avgCtr,
          topQueriesCount: (perfByQuery.rows || []).length,
          topPagesCount: (perfByPage.rows || []).length
        },
        sitemapsStatus: sitemaps,
        topQueries: perfByQuery.rows || [],
        topPages: perfByPage.rows || []
      }, null, 2));
    } else {
      console.error(`Unknown command: ${command}. Use: performance, inspect, sitemaps, audit`);
      process.exit(1);
    }
  } catch (err) {
    console.error(JSON.stringify({
      status: 'ERROR',
      error: err.message,
      keyFile: keyResult.path
    }, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadServiceAccountKey,
  getAccessToken,
  queryPerformance,
  querySitemaps,
  inspectUrl
};
