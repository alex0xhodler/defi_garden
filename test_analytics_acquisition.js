/* Unit test for the acquisition (UTM / ref / click-id / referring_domain /
   src) capture added to analytics.js. Pure Node — mocks window/document/
   navigator/screen, no browser, no network. Verifies: UTM + `ref` (the 064
   spotlight param) + `src` (202 — the internal-link counterpart to `ref`:
   seo_token/seo_chain/x_spotlight/pool) + referring_domain are captured from
   the landing URL; absent params emit NO key (never an "undefined" string);
   and getBaseContext spreads the captured acquisition onto every event so
   it's attributable.

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
  ok(!('src' in a), 'no src key emitted when the URL carries no ?src= (this landing has none)');
});

// 1b. `src` — the product's own internal-link acquisition tag (202): the
// static SEO estate's waitlist CTAs (`?src=seo_token`/`seo_chain`) and the
// north-star pool CTA (`?src=pool`).
withEnv({ search: '?src=seo_token' }, () => {
  const a = Analytics.captureAcquisition();
  eq(a.src, 'seo_token', 'src captured from a seo_token landing URL');
});

// 2. No params, no referrer (the current crawler/direct case) → EMPTY, not "undefined" strings
withEnv({ search: '', referrer: '' }, () => {
  const a = Analytics.captureAcquisition();
  eq(Object.keys(a).length, 0, 'no acquisition keys when nothing to attribute (never undefined strings)');
  ok(!('src' in a), 'src key absent (not the string "undefined") when ?src= is absent');
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

// 5b. `src` gets the identical 200-char cap treatment as `ref`
withEnv({ search: '?src=' + 'b'.repeat(500) }, () => {
  const a = Analytics.captureAcquisition();
  eq(a.src.length, 200, 'src value capped at 200 chars, same treatment as ref');
});

// 6. getBaseContext spreads the captured acquisition onto every event
withEnv({ search: '?utm_source=x_spotlight&ref=zz', referrer: 'https://t.co/x' }, () => {
  Analytics.init();                      // captures acquisition from the (mocked) landing URL
  const ctx = Analytics.getBaseContext();
  eq(ctx.utm_source, 'x_spotlight', 'every event carries utm_source');
  eq(ctx.ref, 'zz', 'every event carries ref');
  eq(ctx.referring_domain, 't.co', 'every event carries referring_domain');
  eq(ctx.referrer, 'https://t.co/x', 'existing referrer property untouched (never undefined)');
  ok(!('src' in ctx), 'no src key on the emitted event props when this landing carries no ?src=');
});

// 6b. getBaseContext spreads `src` onto an emitted event's props too (202) —
// asserted through the event props object, not by reading captureAcquisition's
// source array directly.
withEnv({ search: '?src=seo_chain' }, () => {
  Analytics.init();
  const ctx = Analytics.getBaseContext();
  eq(ctx.src, 'seo_chain', 'every event carries src, spread by getBaseContext from captured acquisition');
});

console.log(`test_analytics_acquisition.js: ${passed}/${passed} assertions passed`);
