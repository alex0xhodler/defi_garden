#!/usr/bin/env node

/**
 * Yield Stories Generator for DeFi Garden
 * Generates stories/tomoko.html, stories/kevin.html, stories/lucia.html and the
 * shared stories/stories.css from a personas array.
 *
 * TRUST PRINCIPLE: every plan number on these pages is computed at generation
 * time from live DefiLlama pool data passed through the SAME sanity rails as
 * the Garden Planner (planner.js). Anomalous pools (total APY > 1000%) may
 * NEVER enter a plan. Personas are fictional composites for education — the
 * pages say so, twice. Education, not advice.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
// backlog 254: every persona's temperamentLabel below renders its OWN
// TEMPERAMENTS.<key>.minTvl (a persona curation floor, independent of the
// platform's DEFAULT_MIN_TVL rail — see the TEMPERAMENTS comment below) via
// this ONE shared formatter, instead of hand-typing a copy of the number.
// Never a second `formatTvlFloor` here.
const { formatTvlFloor } = require('./trust-rails.js');

// Canonical site URL — matches plan.html / index.html canonicals
const SITE_URL = 'https://www.defi.garden';

// Defillama API endpoint
const YIELDS_API = 'https://yields.llama.fi/pools';

// ---------------------------------------------------------------------------
// Sanity rails & curation — mirrors planner.js exactly (pure functions)
// ---------------------------------------------------------------------------
const APY_SANITY_LIMIT = 1000; // total APY above this may NEVER enter a plan
const BANK_APY = 0.5;          // typical savings account, for contrast

const STABLE_SYMBOLS = ['USDC', 'USDT', 'DAI', 'USDS', 'FRAX', 'TUSD', 'USDP', 'GUSD',
  'LUSD', 'USDD', 'PYUSD', 'USDE', 'SUSD', 'CRVUSD', 'GHO', 'USD0', 'FDUSD', 'USDB',
  'BUSD', 'MIM', 'DOLA', 'USDX', 'EURC', 'EURS', 'RLUSD', 'USDL', 'DEUSD', 'SDAI'];

// Temperament filter bands — each persona's OWN curation choice for which
// pools populate their story (never sourced from DEFAULT_MIN_TVL; changing
// these changes which pools are shown, out of scope for backlog 254). Sanity
// cap (<= APY_SANITY_LIMIT) applies everywhere.
const TEMPERAMENTS = {
  sleep: { minTvl: 50000000, maxApy: APY_SANITY_LIMIT, stableOnly: true, preferTypes: ['lending', 'staking'] },
  balanced: { minTvl: 10000000, maxApy: 50, stableOnly: false },
  bold: { minTvl: 10000000, maxApy: 200, stableOnly: false }
};

function poolTotalApy(pool) {
  return (pool.apyBase || 0) + (pool.apyReward || 0);
}

function isStableSymbol(symbol) {
  if (!symbol) return false;
  const parts = String(symbol).toUpperCase().split(/[-_\/\s+]/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(p => STABLE_SYMBOLS.indexOf(p) !== -1);
}

function poolKind(pool) {
  const proj = String(pool.project || '').toLowerCase();
  const lending = ['aave', 'compound', 'morpho', 'spark', 'radiant', 'euler', 'venus', 'fluid', 'kamino', 'save', 'strike'];
  const staking = ['lido', 'rocket', 'ether.fi', 'jito', 'marinade', 'stader', 'frax', 'binance-staked', 'mantle-staked'];
  if (lending.some(p => proj.includes(p))) return 'lending';
  if (staking.some(p => proj.includes(p))) return 'staking';
  return 'other';
}

/* curatePools — PURE. Same rails as planner.js: deduped by project, sorted by
 * total APY descending within the band. Anomalous pools (> APY_SANITY_LIMIT)
 * can NEVER pass — the hard sanity rail applies before any band check. */
function curatePools(pools, temperamentKey, limit) {
  const band = TEMPERAMENTS[temperamentKey] || TEMPERAMENTS.balanced;
  const lim = limit == null ? 3 : limit;
  if (!Array.isArray(pools)) return [];

  const eligible = pools.filter(p => {
    if (!p || !p.symbol || !p.project) return false;
    const apy = poolTotalApy(p);
    if (apy > APY_SANITY_LIMIT) return false; // hard sanity rail — always
    if (apy <= 0) return false;
    if (apy > band.maxApy) return false;
    if ((p.tvlUsd || 0) < band.minTvl) return false;
    if (band.stableOnly && !isStableSymbol(p.symbol)) return false;
    return true;
  });

  if (band.preferTypes) {
    eligible.sort((a, b) => {
      const ap = band.preferTypes.indexOf(poolKind(a)) !== -1 ? 0 : 1;
      const bp = band.preferTypes.indexOf(poolKind(b)) !== -1 ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return poolTotalApy(b) - poolTotalApy(a);
    });
  } else {
    eligible.sort((a, b) => poolTotalApy(b) - poolTotalApy(a));
  }

  const seen = {};
  const out = [];
  for (let i = 0; i < eligible.length && out.length < lim; i++) {
    const key = String(eligible[i].project).toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(eligible[i]);
  }
  return out;
}

/* Future value of a monthly deposit with monthly compounding.
 * FV = P * (((1 + r/12)^n - 1) / (r/12)), r = annual rate (decimal), n = months. */
function futureValue(monthly, annualRatePct, years) {
  const P = Number(monthly) || 0;
  const months = Math.round((Number(years) || 0) * 12);
  const r = (Number(annualRatePct) || 0) / 100;
  if (r === 0) return P * months;
  const rm = r / 12;
  return P * ((Math.pow(1 + rm, months) - 1) / rm);
}

function totalDeposited(monthly, years) {
  return (Number(monthly) || 0) * Math.round((Number(years) || 0) * 12);
}

// ---------------------------------------------------------------------------
// Formatting — pinned to en-US everywhere (consistency with app.js/planner.js)
// ---------------------------------------------------------------------------
function formatUsd(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
}

function formatApy(pct) {
  return Number(pct || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }) + '%';
}

function formatTvl(n) {
  const v = Number(n) || 0;
  if (v >= 1e9) return '$' + (v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M';
  return '$' + Math.round(v).toLocaleString('en-US');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Analytics bootstrap (039) -----------------------------------------------
// Zero of these generated pages loaded analytics.js before this — an
// untracked, unmeasurable chunk of the SEO investment (specs/039.md). This is
// the SAME Mixpanel stub loader + analytics.js pipeline home.html/plan.html
// use (home.html:141-150), reproduced with String.raw so its regex literal
// (/^\/\//) survives untouched — no logic change to Mixpanel's own snippet.
const MIXPANEL_STUB = String.raw`window.MIXPANEL_CUSTOM_LIB_URL = "https://mp.defi.garden/lib.min.js";
        (function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for (var d = {}, e = ["get_group"].concat(Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\/\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
        mixpanel.init("f22917d9da245858a6789c9e5d412c36", { debug: false, track_pageview: false, persistence: "localStorage", api_host: "https://mp.defi.garden" });`;

/** Analytics bootstrap block for a generated static page: Mixpanel stub +
 * analytics.js + one explicit page_view on window 'load' (analytics.js's own
 * load listener only fires session_start — page_view has always been an
 * explicit per-page call, mirroring app.js's existing trackPageView sites). */
function renderAnalyticsBootstrap(pagePath, properties) {
  return `    <script type="text/javascript">
        ${MIXPANEL_STUB}
    </script>
    <script defer src="${SITE_URL}/analytics.js"></script>
    <script>
      window.addEventListener('load', function () {
        if (typeof Analytics !== 'undefined' && typeof Analytics.trackPageView === 'function') {
          Analytics.trackPageView(${JSON.stringify(pagePath)}, ${JSON.stringify(properties || {})});
        }
      });
    </script>`;
}

// ---------------------------------------------------------------------------
// Conservative illustrative APY
// ---------------------------------------------------------------------------
// The story pages are static, so we deliberately understate: take the LOWEST
// APY among the persona's curated pools, then cap it per temperament. The
// pages label this as illustrative and date-stamp it.
const CONSERVATIVE_APY_CAP = { sleep: 8, balanced: 12, bold: 20 };

function conservativeApy(curated, temperamentKey) {
  if (!curated || !curated.length) return 0;
  const lowest = Math.min(...curated.map(poolTotalApy));
  const cap = CONSERVATIVE_APY_CAP[temperamentKey] || CONSERVATIVE_APY_CAP.balanced;
  return Math.round(Math.min(lowest, cap) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Personas — fictional composites for education, never advice
// ---------------------------------------------------------------------------
const PERSONAS = [
  {
    slug: 'tomoko',
    name: 'Tomoko',
    emoji: '🌳',
    title: "Tomoko's Retirement Garden",
    tagline: 'A pharmacist in Osaka, $1,000 a month, and 10 patient years of compounding.',
    seoTitle: "Tomoko's Retirement Garden — A DeFi Yield Story | DeFi Garden",
    seoDescription: 'How a 51-year-old pharmacist plans a $1,000-a-month retirement garden with large stablecoin pools — live rates, honest risks, and the real math. A fictional story for education, not advice.',
    goalLabel: 'Retirement 🌳',
    monthly: 1000,
    years: 10,
    temperament: 'sleep',
    temperamentLabel: 'Established Stablecoins — stablecoin pools only, $50M+ TVL',
    intro: [
      'Tomoko is 51. She has spent twenty-six years as a hospital pharmacist in Osaka, and she plans her money the way she checks prescriptions: slowly, twice.',
      'Her bank pays 0.3% on savings. At that rate, the ¥150,000 (about $1,000) she sets aside every month would spend the next 10 years doing almost nothing. That bothered her more than any market headline ever has.'
    ],
    discoveryHeading: 'The discovery moment',
    discovery: [
      'It was her nephew, home for New Year, who showed her a yield screen on his phone — every rate pulled live from public blockchain data, refreshed daily, nothing promised.',
      '“So the interest rate is just… visible? For everyone?” she asked. He nodded. What won her over was not the rate. It was that she could check it herself, any morning, the way she checks anything else she is responsible for.',
      'Tomoko set her own rules before depositing anything: dollar-pegged stablecoins only, and only pools holding more than $50 million — big, boring, and busy. The Garden Planner calls that strategy “Established Stablecoins”, which she found accurate. And in DeFi, 10 years is a full horizon — plenty of time for compounding to work.'
    ],
    riskIntro: 'Tomoko read this part twice. You should too — this is what can genuinely go wrong:',
    ctaHeading: 'Plant a garden like Tomoko’s',
    ctaText: 'Her plan took four answers and about two minutes. Start from her numbers and bend them until they are yours.'
  },
  {
    slug: 'kevin',
    name: 'Kevin',
    emoji: '🌱',
    title: "Kevin's Down-Payment Garden",
    tagline: 'A product manager in Austin, $500 a month, 10 years — building toward a first home.',
    seoTitle: "Kevin's Down-Payment Garden — A DeFi Yield Story | DeFi Garden",
    seoDescription: 'A 34-year-old product manager grows a $500-a-month DeFi garden for 10 years toward a home down payment — with RWA pools. The questions he asked, honest risks, and real math. A fictional story for education, not advice.',
    goalLabel: 'A home 🏡',
    monthly: 500,
    years: 10,
    temperament: 'balanced',
    // backlog 254 (fix pass): the "+TVL" figure states THIS PERSONA'S OWN
    // curation floor — TEMPERAMENTS.balanced.minTvl — exactly like
    // tomoko/lucia's labels state their own TEMPERAMENTS.sleep.minTvl ($50M).
    // It must NOT derive from the platform's DEFAULT_MIN_TVL rail: kevin's
    // actual pool-selection floor here is $10M (TEMPERAMENTS.balanced.minTvl,
    // above), unrelated to and independent from DEFAULT_MIN_TVL — deriving
    // from DEFAULT_MIN_TVL stated a floor ("$100K+") the pools on this page
    // never actually used. Still routed through the shared formatTvlFloor so
    // the display format matches every other stating site, never a re-typed
    // literal.
    temperamentLabel: `RWA & Fresh Entries — tokenized treasuries and credible newer pools, ${formatTvlFloor(TEMPERAMENTS.balanced.minTvl)}+ TVL`,
    intro: [
      'Kevin is 34, a product manager in Austin. He maxes his employer’s 401(k) match every January and never touches it. This story is not about that money.',
      'It is about the other $500 a month — the amount left over after rent, the dog, and one ambitious smoker grill. Kevin and his partner have a goal: a down payment on a first home in roughly 10 years. He wanted that money somewhere he could actually watch, with rates he could verify himself.'
    ],
    discoveryHeading: 'The discovery moment',
    discovery: [
      'Kevin found DeFi the way most people do: a friend’s screenshot of a yield number that looked fake. His first instinct was to find the catch — so he went looking for the data source instead of the marketing.',
      'What he found was a public, live feed of thousands of pools with their rates and deposits visible to anyone. No account manager, no glossy PDF. He found tokenized treasury pools and credible newer protocols with audited contracts — real-world assets moving onchain. The planner calls that strategy “RWA & Fresh Entries”.'
    ],
    faqHeading: 'The home-goal questions Kevin asked',
    faq: [
      {
        q: '“Is DeFi safe enough for a down-payment fund?”',
        a: 'Kevin asked this carefully. His answer: it depends on your timeline and risk tolerance. He sized the DeFi garden as one part of his plan — alongside regular savings — not the whole of it. He can afford some volatility because he has 10 years and uses stablecoin-adjacent pools.'
      },
      {
        q: '“What if rates drop over those 10 years?”',
        a: 'They probably will at some point. Kevin used the planner’s conservative projections and built a realistic model. He is not counting on today’s rates holding — just on beating a 0.5% savings account over time.'
      },
      {
        q: '“Why RWA pools specifically?”',
        a: 'Because tokenized treasury yields and real-world-asset protocols connect to real cashflows. Kevin liked that the underlying yield source was understandable: T-bills, private credit, corporate debt. Different risks than pure DeFi, but risks he could name.'
      }
    ],
    riskIntro: 'Kevin’s rule: never deposit into anything whose failure modes you can’t describe out loud. Here are his, out loud:',
    ctaHeading: 'Plant a garden like Kevin’s',
    ctaText: 'Start from Kevin’s answers — $500 a month, 10 years, RWA & Fresh Entries — and adjust until the plan feels like yours.'
  },
  {
    slug: 'lucia',
    name: 'Lucia',
    emoji: '☂️',
    title: "Lucia's Rainy-Day Garden",
    tagline: 'A freelance illustrator in Lisbon, $300 a month, and a 10-year umbrella fund.',
    seoTitle: "Lucia's Rainy-Day Garden — A DeFi Yield Story | DeFi Garden",
    seoDescription: 'A 28-year-old freelancer grows a $300-a-month rainy-day fund in large stablecoin pools over 10 years — live rates, honest risks, real math. A fictional story for education, not advice.',
    goalLabel: 'Rainy day ☂️',
    monthly: 300,
    years: 10,
    temperament: 'sleep',
    temperamentLabel: 'Sleep well — stablecoin pools only, $50M+ TVL',
    intro: [
      'Lucia is 28, a freelance illustrator in Lisbon. Some months are wonderful. Some months are two cancelled invoices and a broken laptop. Freelancing taught her that a rainy-day fund is not optional — it is the whole roof.',
      'Her bank paid 0.4% while groceries got 4% more expensive. Her emergency fund was technically safe and quietly shrinking, and she did the math on a napkin: at that rate, “safe” was costing her real money every single year.'
    ],
    discoveryHeading: 'The discovery moment',
    discovery: [
      'A studio-mate mentioned she kept her buffer in a stablecoin lending pool — “like a savings account, except I can see the interest rate move, and I can leave whenever I want.” Lucia was skeptical for a month. Then she started checking the live rates herself, every morning, like weather.',
      'The rule she landed on was strict: dollar-pegged stablecoins only, pools above $50 million, nothing exotic. An umbrella fund must be boring and reachable — growth is the bonus, not the point. The planner calls this strategy “Established Stablecoins”.'
    ],
    riskIntro: 'An emergency fund has one job: existing when things go wrong. So Lucia weighed what could go wrong with the fund itself:',
    ctaHeading: 'Plant a garden like Lucia’s',
    ctaText: 'Start from Lucia’s answers — $300 a month, 10 years, Established Stablecoins — and shape the plan around your own weather.'
  }
];

// Honest risk section — shared, plain language. Depeg, smart-contract, rates.
const RISKS = [
  {
    emoji: '⚖️',
    title: 'Stablecoins can lose their peg',
    body: 'A stablecoin is a promise to track the dollar. Promises sometimes break: stablecoins have traded below $1 before, and some never recovered. If the coin in a pool depegs, the deposits in it are worth less — no yield fixes that.'
  },
  {
    emoji: '🔓',
    title: 'Smart contracts are software',
    body: 'Every pool is code holding other people’s money, which makes it a target. Bugs and hacks have drained pools before — including audited ones. Larger, older pools have more eyes on them, but “battle-tested” is not the same as “safe”.'
  },
  {
    emoji: '📉',
    title: 'Rates move — daily',
    body: 'Today’s APY is a snapshot of supply and demand, not a contract. Rates drift down when many people pile in, and jump when they leave. Over years, every projection on this page will be wrong in one direction or the other.'
  }
];

// ---------------------------------------------------------------------------
// Fetch pool data from Defillama API
// ---------------------------------------------------------------------------
async function fetchPoolData() {
  return new Promise((resolve, reject) => {
    console.log('📡 Fetching pool data from Defillama API...');

    https.get(YIELDS_API, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          const pools = jsonData.data || jsonData;
          console.log(`✅ Fetched ${pools.length} pools from API`);
          resolve(pools);
        } catch (error) {
          reject(new Error(`Failed to parse API response: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`API request failed: ${error.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------
function countUp(value, formatted, suffix) {
  return `<span class="st-countup" data-countup="${Math.round(value)}"${suffix ? ` data-suffix="${escapeHtml(suffix)}"` : ''}>${escapeHtml(formatted)}</span>`;
}

function renderStatCard(label, valueHtml, note) {
  return `      <div class="st-stat">
        <div class="st-stat-value">${valueHtml}</div>
        <div class="st-stat-label">${escapeHtml(label)}</div>${note ? `
        <div class="st-stat-note">${escapeHtml(note)}</div>` : ''}
      </div>`;
}

function renderStoryPage(persona, plan) {
  const pageUrl = `${SITE_URL}/stories/${persona.slug}.html`;
  const p = persona;
  const monthlyFmt = formatUsd(p.monthly);
  const depositedFmt = formatUsd(plan.deposited);
  const projectionFmt = formatUsd(plan.projection);
  const bankFmt = formatUsd(plan.bankProjection);
  const apyFmt = formatApy(plan.apy);

  const poolRows = plan.pools.map(pool => `        <li class="st-pool">
          <span class="st-pool-name">${escapeHtml(pool.project)} · ${escapeHtml(pool.symbol)}</span>
          <span class="st-pool-meta">${escapeHtml(pool.chain)} · ${escapeHtml(formatTvl(pool.tvlUsd))} TVL</span>
          <span class="st-pool-apy">${escapeHtml(formatApy(poolTotalApy(pool)))} APY</span>
        </li>`).join('\n');

  // FAQPage JSON-LD (040): mainEntity built straight from the same p.faq
  // array the visible HTML below renders from, so schema and page text can
  // never diverge (Google requires structured data to match visible content).
  // Raw (unescaped) q/a text is correct here — JSON escaping differs from
  // HTML escaping, and the rendered page's HTML-entity-decoded text is what
  // byte-for-byte equals these raw strings.
  const faqJsonLd = p.faq ? `
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: p.faq.map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a }
      }))
    }).replace(/</g, '\\u003c')}</script>` : '';

  // WebPage JSON-LD (048, freshness signal): dateModified is the SAME
  // plan.generatedDate string rendered visibly in the footer below — must
  // byte-for-byte match (Google's must-match-visible-content rule). Emitted
  // for every persona (unlike faqJsonLd, kevin-only) so all 3 story pages
  // carry a freshness signal.
  const webPageJsonLd = `
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      url: pageUrl,
      name: p.seoTitle,
      dateModified: plan.generatedDate
    }).replace(/</g, '\\u003c')}</script>`;

  const faqHtml = p.faq ? `
    <!-- The 401(k) questions — questions people actually ask, never advice -->
    <section class="st-section">
      <h2 class="st-h2">${escapeHtml(p.faqHeading)}</h2>
      <div class="st-faq">
${p.faq.map(item => `        <div class="st-faq-item">
          <h3 class="st-faq-q">${escapeHtml(item.q)}</h3>
          <p class="st-faq-a">${escapeHtml(item.a)}</p>
        </div>`).join('\n')}
      </div>
    </section>
` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${escapeHtml(p.seoTitle)}</title>
    <meta name="description" content="${escapeHtml(p.seoDescription)}">

    <!-- SEO Meta Tags -->
    <meta name="keywords" content="DeFi savings story, ${escapeHtml(p.name)}, goal-based saving, stablecoin yield, DeFi Garden planner, ${escapeHtml(p.goalLabel.replace(/\s*\S+$/, ''))}">
    <meta name="author" content="DeFi Garden">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${pageUrl}">
${faqJsonLd}
${webPageJsonLd}

    <!-- Multilingual SEO -->
    <link rel="alternate" hreflang="en" href="${pageUrl}">
    <link rel="alternate" hreflang="ko" href="${pageUrl}?lang=ko">
    <link rel="alternate" hreflang="x-default" href="${pageUrl}">

    <!-- Open Graph Meta Tags for Social Media Sharing -->
    <meta property="og:title" content="${escapeHtml(p.seoTitle)}">
    <meta property="og:description" content="${escapeHtml(p.seoDescription)}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${pageUrl}">
    <meta property="og:site_name" content="DeFi Garden">
    <meta property="og:locale" content="en_US">
    <meta property="og:image" content="${SITE_URL}/og-image.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="DeFi Garden — plan your DeFi savings by goal">

    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(p.seoTitle)}">
    <meta name="twitter:description" content="${escapeHtml(p.seoDescription)}">
    <meta name="twitter:image" content="${SITE_URL}/og-image.png">
    <meta name="twitter:creator" content="@defigarden">

    <!-- App Icons and Favicon -->
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">
    <link rel="apple-touch-icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🌱</text></svg>">

    <!-- Theme Color for Mobile Browsers -->
    <meta name="theme-color" content="#2D5A3D">
    <meta name="msapplication-TileColor" content="#2D5A3D">

    <!-- Performance: Preload critical resources -->
    <link rel="preload" href="../fonts/FKGroteskNeue.woff2" as="font" type="font/woff2" crossorigin>

    <!-- Load CSS non-blocking -->
    <link rel="stylesheet" href="../style.css" media="print" onload="this.media='all'">
    <link rel="stylesheet" href="stories.css" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" href="../style.css"></noscript>
    <noscript><link rel="stylesheet" href="stories.css"></noscript>

    <script>
        // Apply saved theme before paint to avoid a flash of the wrong theme
        (function () {
            try {
                var saved = localStorage.getItem('theme');
                var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
                document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
            } catch (e) {}
        })();
    </script>
${renderAnalyticsBootstrap(`/stories/${p.slug}`, { page_type: 'story_landing', persona: p.slug })}
</head>
<body class="st-body">
  <header class="st-header">
    <a class="st-logo" href="../">DeFi Garden</a>
    <a class="st-header-cta" href="../plan.html">Garden Planner 🌱</a>
  </header>

  <main class="st-main">
    <!-- Persona intro -->
    <section class="st-hero st-section">
      <div class="st-avatar" aria-hidden="true">${p.emoji}</div>
      <p class="st-eyebrow">A Yield Story</p>
      <h1 class="st-h1">${escapeHtml(p.title)}</h1>
      <p class="st-tagline">${escapeHtml(p.tagline)}</p>
      <p class="st-fictional-label">${escapeHtml(p.name)} is a fictional composite for education — not financial advice.</p>
${p.intro.map(par => `      <p class="st-p">${escapeHtml(par)}</p>`).join('\n')}
    </section>

    <!-- Concrete numbers -->
    <section class="st-section">
      <h2 class="st-h2">The numbers, concretely</h2>
      <div class="st-stats">
${renderStatCard('every month', countUp(p.monthly, monthlyFmt))}
${renderStatCard('years of patience', countUp(p.years, String(p.years)))}
${renderStatCard('deposited in total', countUp(plan.deposited, depositedFmt))}
      </div>
      <p class="st-p st-muted">Goal: ${escapeHtml(p.goalLabel)} · Temperament: ${escapeHtml(p.temperamentLabel)}.</p>
    </section>

    <!-- Discovery moment -->
    <section class="st-section">
      <h2 class="st-h2">${escapeHtml(p.discoveryHeading)}</h2>
${p.discovery.map(par => `      <p class="st-p">${escapeHtml(par)}</p>`).join('\n')}
    </section>
${faqHtml}
    <!-- Honest risk section -->
    <section class="st-section st-risk">
      <h2 class="st-h2">What can go wrong — honestly</h2>
      <p class="st-p">${escapeHtml(p.riskIntro)}</p>
      <div class="st-risk-cards">
${RISKS.map(r => `        <div class="st-risk-card">
          <div class="st-risk-emoji" aria-hidden="true">${r.emoji}</div>
          <h3 class="st-risk-title">${escapeHtml(r.title)}</h3>
          <p class="st-risk-body">${escapeHtml(r.body)}</p>
        </div>`).join('\n')}
      </div>
    </section>

    <!-- Illustrative plan math -->
    <section class="st-section st-math">
      <h2 class="st-h2">The illustrative math</h2>
      <p class="st-p">At a deliberately conservative ${escapeHtml(apyFmt)} APY — the lowest rate among the pools ${escapeHtml(p.name)}’s rules selected on ${escapeHtml(plan.generatedDate)}, capped for caution — ${escapeHtml(monthlyFmt)} a month compounds like this:</p>
      <div class="st-headline">
        <div class="st-headline-figure">≈ ${countUp(plan.projection, projectionFmt)}</div>
        <div class="st-headline-sub">after ${p.years} years of ${escapeHtml(monthlyFmt)} monthly deposits</div>
      </div>
      <div class="st-stats">
${renderStatCard('deposited by ' + p.name, countUp(plan.deposited, depositedFmt))}
${renderStatCard('in a 0.5% savings account', countUp(plan.bankProjection, bankFmt))}
${renderStatCard('the gap, grown by patience', countUp(plan.projection - plan.bankProjection, formatUsd(plan.projection - plan.bankProjection)))}
      </div>
      <p class="st-p st-muted">FV = P·(((1+r/12)ⁿ − 1)/(r/12)) — the same formula the Garden Planner uses, with r = ${escapeHtml(apyFmt)} and P = ${escapeHtml(monthlyFmt)}.</p>
      <h3 class="st-h3">Pools ${escapeHtml(p.name)}’s rules selected that day</h3>
      <ul class="st-pools">
${poolRows}
      </ul>
      <p class="st-disclaimer">Illustrative only — computed ${escapeHtml(plan.generatedDate)} from live DefiLlama pool rates, which change daily. Education, not advice.</p>
    </section>

    <!-- CTA into the planner -->
    <section class="st-section st-cta-section">
      <h2 class="st-h2">${escapeHtml(p.ctaHeading)}</h2>
      <p class="st-p">${escapeHtml(p.ctaText)}</p>
      <a class="st-cta" href="../plan.html?preset=${p.slug}">Plan like ${escapeHtml(p.name)} →</a>
      <a class="st-cta-secondary" href="../plan.html">or start from scratch</a>
    </section>
  </main>

  <footer class="st-footer">
    <p>${escapeHtml(p.name)} is a fictional composite created for education. Every rate shown was live DefiLlama pool data when this page was generated — rates change daily. Nothing here is financial advice.</p>
    <p>Last updated ${escapeHtml(plan.generatedDate)}</p>
    <p><a href="../">DeFi Garden</a> · <a href="../plan.html">Garden Planner</a></p>
  </footer>

  <script>
  // Count-ups + section reveals — vanilla JS, IntersectionObserver, reduced-motion aware.
  (function () {
    var reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

    function formatLike(el, value) {
      var original = el.textContent;
      var rounded = Math.round(value);
      var formatted = rounded.toLocaleString('en-US');
      if (original.indexOf('$') !== -1) formatted = '$' + formatted;
      var suffix = el.getAttribute('data-suffix');
      if (suffix) formatted += suffix;
      return formatted;
    }

    function animateCount(el) {
      var target = Number(el.getAttribute('data-countup')) || 0;
      var finalText = el.textContent;
      var duration = 1100;
      var start = null;
      function frame(ts) {
        if (start === null) start = ts;
        var t = Math.min(1, (ts - start) / duration);
        var eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — no bounce
        if (t < 1) {
          el.textContent = formatLike({ textContent: finalText, getAttribute: el.getAttribute.bind(el) }, target * eased);
          requestAnimationFrame(frame);
        } else {
          el.textContent = finalText;
        }
      }
      requestAnimationFrame(frame);
    }

    var sections = document.querySelectorAll('.st-section');
    var counts = document.querySelectorAll('.st-countup');

    if (reduced || typeof IntersectionObserver === 'undefined') {
      for (var i = 0; i < sections.length; i++) sections[i].classList.add('st-visible');
      return; // final values are already in the markup
    }

    var seen = [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('st-visible');
        var nums = entry.target.querySelectorAll('.st-countup');
        for (var j = 0; j < nums.length; j++) {
          if (seen.indexOf(nums[j]) === -1) {
            seen.push(nums[j]);
            animateCount(nums[j]);
          }
        }
        io.unobserve(entry.target);
      });
    }, { threshold: 0.2 });

    for (var k = 0; k < sections.length; k++) io.observe(sections[k]);

    window.addEventListener('scroll', function() {
      var h = document.querySelector('.st-header');
      if (h) {
        if (window.scrollY > 4) h.classList.add('is-scrolled');
        else h.classList.remove('is-scrolled');
      }
    }, { passive: true });
  })();
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Shared stories.css — reuses style.css tokens religiously. No glows, no bounce.
// ---------------------------------------------------------------------------
function renderStoriesCss() {
  return `/* Yield Stories — shared styles. Generated by generate-stories.js.
 * Reuses style.css tokens religiously: no new accents, no glows, no bounce. */

.st-body {
  min-height: 100vh;
  background: var(--ui-bg);
  color: var(--color-text);
  font-family: var(--font-family-base);
}

.st-body::after {
  content: '';
  position: fixed;
  bottom: -120px;
  left: 0;
  right: 0;
  height: calc(120px + 48px + env(safe-area-inset-bottom, 0px));
  pointer-events: none;
  z-index: 40;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  background: linear-gradient(
    to top,
    rgba(255, 255, 253, 0.6) 0px,
    rgba(255, 255, 253, 0.6) 120px,
    rgba(255, 255, 253, 0.35) calc(120px + 14px),
    rgba(255, 255, 253, 0.12) calc(120px + 30px),
    rgba(255, 255, 253, 0.02) calc(120px + 44px),
    transparent 100%
  );
  -webkit-mask-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 1) 0px,
    rgba(0, 0, 0, 1) 120px,
    rgba(0, 0, 0, 0.85) calc(120px + 14px),
    rgba(0, 0, 0, 0.45) calc(120px + 28px),
    rgba(0, 0, 0, 0.12) calc(120px + 40px),
    rgba(0, 0, 0, 0) 100%
  );
  mask-image: linear-gradient(
    to top,
    rgba(0, 0, 0, 1) 0px,
    rgba(0, 0, 0, 1) 120px,
    rgba(0, 0, 0, 0.85) calc(120px + 14px),
    rgba(0, 0, 0, 0.45) calc(120px + 28px),
    rgba(0, 0, 0, 0.12) calc(120px + 40px),
    rgba(0, 0, 0, 0) 100%
  );
}

[data-theme="dark"] .st-body::after {
  background: linear-gradient(
    to top,
    rgba(10, 15, 29, 0.65) 0px,
    rgba(10, 15, 29, 0.65) 120px,
    rgba(10, 15, 29, 0.38) calc(120px + 14px),
    rgba(10, 15, 29, 0.14) calc(120px + 30px),
    rgba(10, 15, 29, 0.02) calc(120px + 44px),
    transparent 100%
  );
}

@media (max-width: 768px) {
  .st-body::after {
    height: calc(120px + 64px + env(safe-area-inset-bottom, 0px));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    background: linear-gradient(
      to top,
      rgba(255, 255, 253, 0.65) 0px,
      rgba(255, 255, 253, 0.65) 120px,
      rgba(255, 255, 253, 0.4) calc(120px + 18px),
      rgba(255, 255, 253, 0.16) calc(120px + 38px),
      rgba(255, 255, 253, 0.03) calc(120px + 56px),
      transparent 100%
    );
    -webkit-mask-image: linear-gradient(
      to top,
      rgba(0, 0, 0, 1) 0px,
      rgba(0, 0, 0, 1) 120px,
      rgba(0, 0, 0, 0.88) calc(120px + 18px),
      rgba(0, 0, 0, 0.5) calc(120px + 36px),
      rgba(0, 0, 0, 0.15) calc(120px + 52px),
      rgba(0, 0, 0, 0) 100%
    );
    mask-image: linear-gradient(
      to top,
      rgba(0, 0, 0, 1) 0px,
      rgba(0, 0, 0, 1) 120px,
      rgba(0, 0, 0, 0.88) calc(120px + 18px),
      rgba(0, 0, 0, 0.5) calc(120px + 36px),
      rgba(0, 0, 0, 0.15) calc(120px + 52px),
      rgba(0, 0, 0, 0) 100%
    );
  }

  [data-theme="dark"] .st-body::after {
    background: linear-gradient(
      to top,
      rgba(10, 15, 29, 0.7) 0px,
      rgba(10, 15, 29, 0.7) 120px,
      rgba(10, 15, 29, 0.42) calc(120px + 18px),
      rgba(10, 15, 29, 0.18) calc(120px + 38px),
      rgba(10, 15, 29, 0.03) calc(120px + 56px),
      transparent 100%
    );
  }
}

/* ---------- Header ---------- */
.st-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  padding: var(--space-16);
  position: sticky;
  top: 0;
  z-index: 100;
}

.st-header::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 100vw;
  transform: translateX(-50%);
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-border);
  z-index: -1;
  pointer-events: none;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.st-header.is-scrolled::before {
  box-shadow: var(--ui-shadow-overlay);
  border-bottom-color: var(--ui-border-strong);
}

.st-logo {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  text-decoration: none;
  white-space: nowrap;
  transition: transform var(--duration-normal) var(--ease-standard);
}
.st-logo:hover { transform: translateY(-1px); }

.st-header-cta {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  text-decoration: none;
  padding: var(--space-8) var(--space-16);
  background: var(--color-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-full);
  white-space: nowrap;
  transition: border-color var(--duration-normal) var(--ease-standard),
    transform var(--duration-normal) var(--ease-standard);
}
.st-header-cta:hover { border-color: var(--ui-border-strong); transform: translateY(-1px); }
.st-header-cta:active { transform: translateY(1px); background: var(--ui-surface-muted); }

/* ---------- Layout ---------- */
.st-main {
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  padding: var(--space-16) var(--space-16) var(--space-32);
}

.st-section {
  margin: 0 0 var(--space-32);
  padding: var(--space-24);
  background: var(--color-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 480ms var(--ease-standard), transform 480ms var(--ease-standard);
}
.st-section.st-visible { opacity: 1; transform: translateY(0); }

@media (prefers-reduced-motion: reduce) {
  .st-section { opacity: 1; transform: none; transition: none; }
}

/* ---------- Typography ---------- */
.st-h1 {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  margin: 0 0 var(--space-8);
}

.st-h2 {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
  margin: 0 0 var(--space-16);
}

.st-h3 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin: var(--space-24) 0 var(--space-12);
}

.st-p {
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  color: var(--color-text);
  margin: 0 0 var(--space-12);
}
.st-p:last-child { margin-bottom: 0; }

.st-muted { color: var(--color-text-secondary); font-size: var(--font-size-sm); }

/* ---------- Hero ---------- */
.st-hero { text-align: left; }

.st-avatar {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-4xl);
  background: var(--color-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-full);
  margin-bottom: var(--space-16);
}

.st-eyebrow {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primary);
  margin: 0 0 var(--space-8);
}

.st-tagline {
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-16);
}

.st-fictional-label {
  display: inline-block;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  padding: var(--space-6) var(--space-12);
  background: var(--ui-surface-sunken);
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-full);
  margin: 0 0 var(--space-16);
}

/* ---------- Stats ---------- */
.st-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-16);
  margin: var(--space-16) 0;
}

.st-stat {
  padding: var(--space-16);
  background: var(--ui-surface-muted);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  text-align: center;
}

.st-stat-value {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}

.st-stat-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-top: var(--space-4);
}

.st-stat-note {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-top: var(--space-4);
}

/* ---------- FAQ (Kevin) ---------- */
.st-faq { display: flex; flex-direction: column; gap: var(--space-12); }

.st-faq-item {
  padding: var(--space-16);
  background: var(--ui-surface-muted);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
}

.st-faq-q {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  margin: 0 0 var(--space-8);
}

.st-faq-a {
  font-size: var(--font-size-base);
  line-height: var(--line-height-normal);
  color: var(--color-text-secondary);
  margin: 0;
}

/* ---------- Risks ---------- */
.st-risk-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-16);
  margin-top: var(--space-16);
}

.st-risk-card {
  padding: var(--space-16);
  background: var(--ui-surface-muted);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
}

.st-risk-emoji { font-size: var(--font-size-2xl); margin-bottom: var(--space-8); }

.st-risk-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  margin: 0 0 var(--space-8);
}

.st-risk-body {
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--color-text-secondary);
  margin: 0;
}

/* ---------- Math ---------- */
.st-headline {
  text-align: center;
  padding: var(--space-24);
  margin: var(--space-16) 0;
  background: var(--ui-surface-sunken);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
}

.st-headline-figure {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
  line-height: var(--line-height-tight);
}

.st-headline-sub {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-top: var(--space-8);
}

.st-pools { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-8); }

.st-pool {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-8);
  padding: var(--space-12) var(--space-16);
  background: var(--ui-surface-muted);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  font-size: var(--font-size-sm);
}

.st-pool-name { font-weight: var(--font-weight-semibold); text-transform: capitalize; }
.st-pool-meta { color: var(--color-text-secondary); }
.st-pool-apy { font-weight: var(--font-weight-semibold); color: var(--color-primary); font-variant-numeric: tabular-nums; }

.st-disclaimer {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin: var(--space-16) 0 0;
  padding: var(--space-12) var(--space-16);
  background: var(--ui-surface-sunken);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
}

/* ---------- CTA ---------- */
.st-cta-section { text-align: center; }

.st-cta {
  display: inline-block;
  margin-top: var(--space-8);
  padding: var(--space-16) var(--space-32);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-btn-primary-text);
  background: var(--color-primary);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  text-decoration: none;
  transition: transform var(--duration-normal) var(--ease-standard),
    background var(--duration-normal) var(--ease-standard);
}
.st-cta:hover { background: var(--color-primary-hover); transform: translateY(-2px); }
.st-cta:active { background: var(--color-primary-active); transform: translateY(1px); }

.st-cta-secondary {
  display: block;
  margin-top: var(--space-16);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-decoration: none;
}
.st-cta-secondary:hover { color: var(--color-primary); }

/* ---------- Footer ---------- */
.st-footer {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-16) var(--space-16) var(--space-32);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-align: center;
}
.st-footer a { color: var(--color-primary); text-decoration: none; }

/* ---------- Responsive ---------- */
@media (max-width: 640px) {
  .st-stats, .st-risk-cards { grid-template-columns: 1fr; }
  .st-section { padding: var(--space-20); }
  .st-h1 { font-size: var(--font-size-3xl); }
  .st-headline-figure { font-size: var(--font-size-3xl); }
  .st-pool { flex-direction: column; gap: var(--space-2); }
}
`;
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------
async function generateStories() {
  console.log('🚀 Generating Yield Stories for DeFi Garden...');

  const pools = await fetchPoolData();
  const outDir = path.join(__dirname, 'stories');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  for (const persona of PERSONAS) {
    const curated = curatePools(pools, persona.temperament, 3);
    if (curated.length === 0) {
      throw new Error(`No pools passed the "${persona.temperament}" rails for ${persona.name} — refusing to generate without live data.`);
    }

    const apy = conservativeApy(curated, persona.temperament);
    const plan = {
      apy,
      pools: curated,
      projection: futureValue(persona.monthly, apy, persona.years),
      bankProjection: futureValue(persona.monthly, BANK_APY, persona.years),
      deposited: totalDeposited(persona.monthly, persona.years),
      generatedDate
    };

    const outPath = path.join(outDir, `${persona.slug}.html`);
    fs.writeFileSync(outPath, renderStoryPage(persona, plan));
    console.log(`✅ Generated stories/${persona.slug}.html (conservative APY ${formatApy(apy)}, ${curated.length} pools)`);
  }

  fs.writeFileSync(path.join(outDir, 'stories.css'), renderStoriesCss());
  console.log('✅ Generated stories/stories.css');
}

async function main() {
  try {
    await generateStories();
    console.log('\n🌱 Yield Stories generated. Every number came from live pool data through the planner sanity rails.');
  } catch (error) {
    console.error('❌ Error generating stories:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generateStories, curatePools, conservativeApy, futureValue, totalDeposited, PERSONAS, APY_SANITY_LIMIT, renderStoryPage, renderAnalyticsBootstrap };
