/* Trust-rail constants — single source of truth for every OTHER site that
 * STATES the product's trust rails in prose (backlog 254; spec 254). This is
 * NOT a second source of TRUTH for the rails themselves: `app.js:800`
 * (APY_SANITY_LIMIT) and `app.js:801` (DEFAULT_MIN_TVL) remain canonical and
 * human-owned — the analytics app enforces them, and changing the VALUE is a
 * human decision made there, never here. This module exists ONLY so every
 * OTHER consumer that needs to DISPLAY those numbers (generate-llms.js's
 * AI-discovery copy, generate-stories.js's persona labels, translations.js's
 * dictionary, home.html's agent-tool description) reaches ONE place instead
 * of each hand-typing its own mirror — which is exactly how this bug
 * happened: `DEFAULT_MIN_TVL` moved from $10M to $100K (commit 6fceca79bb)
 * and nine hand-typed "$10M" strings scattered across the dictionary, two
 * generators and home.html never followed.
 *
 * Changing the value here without changing app.js (or vice versa) recreates
 * the exact defect this module exists to prevent — a human decision to
 * relax/tighten a rail updates app.js first, and this module in the SAME
 * commit (mirrors the discipline `src/poller-core.js`'s header comment
 * already documents for its own independent mirror).
 *
 * UMD-style guard (mirrors canonical.js/planner.js's own export guard, used
 * in the opposite direction here): Node-side tooling reaches this file via
 * `require('./trust-rails.js')`. app.js itself is browser-only global-scope
 * code with no module system and cannot require this back (and must not —
 * it stays canonical and untouched). Browser consumers that also need this
 * value (translations.js, landing.js, home.html's inline agent-tool
 * declaration) load this file directly via a plain, synchronous
 * `<script src="trust-rails.js">` tag (see home.html / plan.html <head>,
 * placed like canonical.js — no `defer`, so it runs immediately during HTML
 * parsing and is guaranteed to exist before any later script reads
 * `window.TRUST_RAILS`), and read `window.TRUST_RAILS`.
 */
(function (root) {
    'use strict';

    var APY_SANITY_LIMIT = 1000;    // mirrors app.js:800 — total APY above this = anomalous
    var DEFAULT_MIN_TVL = 100000;   // mirrors app.js:801 — $100K floor

    /**
     * Render a USD TVL floor as an abbreviated, en-US-formatted string (e.g.
     * 100000 -> "$100K", 10000000 -> "$10M"). The ONE formatter for this —
     * every stating site (generate-llms.js's TL;DR copy, generate-stories.js's
     * persona labels, translations.js's dictionary leaves, home.html's
     * agent-tool description) calls this rather than writing a second one.
     * Money formatting pinned to en-US throughout this repo (never a bare
     * `toLocaleString()`), matching formatUsd/formatNum/formatApy in app.js.
     */
    function formatTvlFloor(usd) {
        var n = Number(usd) || 0;
        if (n >= 1e9) return '$' + (n / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'B';
        if (n >= 1e6) return '$' + (n / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M';
        if (n >= 1e3) return '$' + (n / 1e3).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
        return '$' + n.toLocaleString('en-US');
    }

    var TRUST_RAILS = {
        APY_SANITY_LIMIT: APY_SANITY_LIMIT,
        DEFAULT_MIN_TVL: DEFAULT_MIN_TVL,
        formatTvlFloor: formatTvlFloor
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = TRUST_RAILS;
    } else {
        root.TRUST_RAILS = TRUST_RAILS;
    }
})(typeof window !== 'undefined' ? window : this);
