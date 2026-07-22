/* Unit test for the acquisition (UTM / ref / click-id / referring_domain)
   capture added to analytics.js. Pure Node — mocks window/document/navigator/
   screen, no browser, no network. Verifies: UTM + `ref` (the 064 spotlight
   param) + referring_domain are captured from the landing URL; absent params
   emit NO key (never an "undefined" string); and getBaseContext spreads the
   captured acquisition onto every event so it's attributable.

   Run: node test_analytics_acquisition.js */

'use strict';
const assert = require('assert');
const Analytics = require('./analytics.js');

let passed = 0;
const eq = (a, b, m) => { assert.strictEqual(a, b, m); passed++; };
const ok = (c, m) => { assert.ok(c, m); passed++; };

// navigator is a read-only getter in Node 22 — override via defineProperty.
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'test-agent', language: 'en-US' }, configurable: true, writable: true });
global.screen = { width: 1440, height: 900 };

function withEnv({ search = '', referrer = '', href = 'https://www.defi.garden/' }, fn) {
  global.window = { location: { search, href }, innerWidth: 1280, innerHeight: 800 };
  global.document = { referrer };
  try { return fn(); } finally {
    delete global.window; delete global.document;
  }
}

// 1. Full spotlight-style landing URL (item 064 links carry utm_* + ref)
withEnv({ search: '?utm_source=x_spotlight&utm_medium=social&utm_campaign=curve-pool&utm_term=stable&utm_content=v1&ref=deadbeef',
          referrer: 'https://t.co/abc123' }, () => {
  const a = Analytics.captureAcquisition();
  eq(a.utm_source, 'x_spotlight', 'utm_source captured');
  eq(a.utm_medium, 'social', 'utm_medium captured');
  eq(a.utm_campaign, 'curve-pool', 'utm_campaign captured');
  eq(a.utm_term, 'stable', 'utm_term captured');
  eq(a.utm_content, 'v1', 'utm_content captured');
  eq(a.ref, 'deadbeef', 'ref captured (064 spotlight attribution param)');
  eq(a.referring_domain, 't.co', 'referring_domain derived from document.referrer host');
});

// 2. No params, no referrer (the current crawler/direct case) → EMPTY, not "undefined" strings
withEnv({ search: '', referrer: '' }, () => {
  const a = Analytics.captureAcquisition();
  eq(Object.keys(a).length, 0, 'no acquisition keys when nothing to attribute (never undefined strings)');
});

// 3. Referrer only (organic search) → referring_domain, no utm keys
withEnv({ search: '', referrer: 'https://www.google.com/search?q=defi+yield' }, () => {
  const a = Analytics.captureAcquisition();
  eq(a.referring_domain, 'www.google.com', 'organic referrer domain captured');
  ok(!('utm_source' in a), 'no utm key emitted when absent');
});

// 4. Malformed referrer must not throw (guarded)
withEnv({ search: '?utm_source=x', referrer: 'not a url' }, () => {
  const a = Analytics.captureAcquisition();
  eq(a.utm_source, 'x', 'utm still captured with a bad referrer');
  ok(!('referring_domain' in a), 'bad referrer → no referring_domain, no throw');
});

// 5. Overlong value capped (privacy/safety, matches the ua truncation pattern)
withEnv({ search: '?utm_campaign=' + 'a'.repeat(500) }, () => {
  const a = Analytics.captureAcquisition();
  eq(a.utm_campaign.length, 200, 'utm value capped at 200 chars');
});

// 6. getBaseContext spreads the captured acquisition onto every event
withEnv({ search: '?utm_source=x_spotlight&ref=zz', referrer: 'https://t.co/x' }, () => {
  Analytics.init();                      // captures acquisition from the (mocked) landing URL
  const ctx = Analytics.getBaseContext();
  eq(ctx.utm_source, 'x_spotlight', 'every event carries utm_source');
  eq(ctx.ref, 'zz', 'every event carries ref');
  eq(ctx.referring_domain, 't.co', 'every event carries referring_domain');
  eq(ctx.referrer, 'https://t.co/x', 'existing referrer property untouched (never undefined)');
});

console.log(`test_analytics_acquisition.js: ${passed}/${passed} assertions passed`);
