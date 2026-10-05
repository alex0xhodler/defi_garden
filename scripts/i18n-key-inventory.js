#!/usr/bin/env node
'use strict';

/**
 * scripts/i18n-key-inventory.js — the translation done-check for the static
 * SEO pages' Portuguese (i18n/pt.js) and Spanish (i18n/es.js) dictionaries.
 *
 *   node scripts/i18n-key-inventory.js              # check: exit 1 if not done
 *   node scripts/i18n-key-inventory.js --list       # print the keys the generators use
 *   node scripts/i18n-key-inventory.js --scaffold   # create a missing i18n/<lang>.js with
 *                                                   # every key set to its EN value + a
 *                                                   # `// TODO-TRANSLATE` marker, or append
 *                                                   # keys the dictionary is missing
 *   node scripts/i18n-key-inventory.js --lang pt    # check one language only
 *
 * WHAT "THE KEYS THE GENERATORS USE" MEANS
 * generate-token-pages.js, generate-chain-pages.js and generate-pool-score-pages.js
 * look strings up through t('key', ...params) (and lc('key') for the nested
 * `landing` namespace, addressed as 'landing.key'). Some keys are chosen at
 * runtime (t(cond ? 'a' : 'b'), labelKey: 'x', a key returned by a helper), so
 * the scan is deliberately broader than `t('...')`: it collects EVERY string
 * literal in the three generators that is a key of the EN dictionary
 * (translations.js + i18n/static-en-ko.js), minus the few literals that are
 * ordinary words that merely collide with a key name (NOT_KEYS below). The
 * keys built by concatenation (planner.<ladder label>) are added explicitly.
 * test_i18n_pt_es_static.js additionally proves, by rendering real pages with a
 * lookup tracer, that no key reaches t() at runtime without being in this list.
 *
 * THE CHECK (per language, exit 1 on any failure)
 *   1. every inventory key has an entry in the dictionary;
 *   2. no entry is still identical to EN, except the keys in IDENTICAL_OK below
 *      (brand names / tickers / technical terms that are legitimately unchanged);
 *      function entries are compared by their rendered output, so a function
 *      that is the EN template verbatim counts as untranslated;
 *   3. no `TODO-TRANSLATE` marker is left in the file;
 *   4. NUMERIC / PARAMETER PARITY: a translated entry must carry exactly the
 *      digits the EN entry carries (the 35/25/25/15 score weights, "$100K"-style
 *      floors, "5" in "Top 5"), and a function entry must still print every
 *      parameter the EN function prints (a dropped APY / TVL / count is a
 *      trust-rail defect, not a style choice);
 *   5. no locale-aware number/date formatting inside a dictionary (CLAUDE.md:
 *      all numbers are pinned en-US; a translation never formats digits).
 *
 * Node-only; never loaded by a browser.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const GENERATORS = ['generate-token-pages.js', 'generate-chain-pages.js', 'generate-pool-score-pages.js'];
const LANGS = ['pt', 'es'];
const TODO_MARKER = 'TODO-TRANSLATE';

/** String literals that equal an EN key but are ordinary words in the generators. */
const NOT_KEYS = new Set(['chains', 'daily', 'no', 'yes']);

/**
 * Keys whose pt/es value may legitimately equal the EN value (brand names,
 * tickers, technical terms that are not translated in Brazilian Portuguese /
 * Spanish DeFi writing). Keep this list short and explicit — everything else
 * must differ from EN.
 */
const IDENTICAL_OK = new Set([
  'tcpColApy',            // "APY"
  'tcpColTvl',            // "TVL"
  'pspTvl',               // "TVL"
  'defillamaApi',         // "DefiLlama API" (data-source brand)
  'planner.ladderClaude', // "Claude Pro" (product name)
  'pspChartHorizon',      // "+14d" — compact horizon label on the chart axis ("d" = dias / días)
  'pspBreadcrumbPools',   // "Pools" — the loanword BR / LatAm users type (pt "pool", es "pool")
  'tcpBreadcrumbTokens',  // "Tokens" — same word in pt and es
  'tcpColToken',          // "Token" — same word in pt and es
  'tcpPoolTypeLabel',     // maps the app's taxonomy values (Lending -> Empréstimos / Préstamos ...); an unmapped value passes through, which is all the non-string sentinel render shows
  'tcpAzSub',             // "<n> tokens" — same word in pt and es; only the count varies
  'tcpMonthYear'          // picks the month name from the month NUMBER; the inventory's non-numeric sentinels hit the EN-short-month fallback by design
]);

/**
 * Parameters a translation is allowed NOT to print (per key). tcpMonthYear's
 * first argument is the English short month name; every other language picks
 * its own month name from the month NUMBER (2nd argument) instead.
 */
const PARAM_UNUSED_OK = { tcpMonthYear: ['@P1@'] };

/** Numeric-parity waivers: keys whose digits may legitimately differ (none yet). */
const NUMERIC_PARITY_WAIVED = new Set([]);

function loadEnglish() {
  const { translations } = require('../translations.js');
  const extras = require('../i18n/static-en-ko.js');
  const flat = Object.assign({}, translations.en, extras.en);
  const get = (key) => {
    if (flat[key]) return flat[key];
    const dot = key.indexOf('.');
    if (dot > 0) {
      const ns = translations.en[key.slice(0, dot)];
      if (ns && typeof ns === 'object' && ns[key.slice(dot + 1)]) return ns[key.slice(dot + 1)];
    }
    return undefined;
  };
  return { flat, get };
}

/** The sorted list of keys the generators can look up, with where they were found. */
function collectKeys() {
  const en = loadEnglish();
  const sources = new Map();
  const add = (key, file) => {
    if (!sources.has(key)) sources.set(key, new Set());
    sources.get(key).add(file);
  };
  GENERATORS.forEach(file => {
    // Comment-only lines are dropped so prose that happens to quote a key
    // name (`landing`, 'tcpFoo') never counts as a lookup.
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      .split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    // (1) every plain string literal that is an EN key
    const lit = /(['"`])((?:\\.|(?!\1)[^\\\n$])*)\1/g;
    let m;
    while ((m = lit.exec(src))) {
      const s = m[2];
      if (NOT_KEYS.has(s)) continue;
      if (Object.prototype.hasOwnProperty.call(en.flat, s)) add(s, file);
    }
    // (2) lc('x') -> nested landing namespace, addressed 'landing.x'
    const lc = /\blc\(\s*(['"])([A-Za-z0-9_]+)\1/g;
    while ((m = lc.exec(src))) add('landing.' + m[2], file);
  });
  // (3) keys built by concatenation: the yield-headline anchor's ladder label
  const tp = require('../generate-token-pages.js');
  add('planner.' + tp.yieldHeadlineAnchor().labelKey, 'generate-token-pages.js');

  const keys = Array.from(sources.keys()).sort();
  const missingInEn = keys.filter(k => en.get(k) === undefined);
  return { keys, sources, missingInEn, en };
}

// ---------------------------------------------------------------------------
// Rendering helpers for the checks
// ---------------------------------------------------------------------------
const SENTINELS = Array.from({ length: 10 }, (_, i) => `@P${i + 1}@`);

function renderEntry(entry) {
  if (typeof entry === 'function') {
    try { return String(entry(...SENTINELS)); } catch (e) { return `<<throws: ${e.message}>>`; }
  }
  return String(entry);
}

function digitSequences(text) {
  // strip the sentinel tokens first so their digits never count
  return (String(text).replace(/@P\d+@/g, '').match(/\d+/g) || []).sort();
}

function sameList(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function loadDictionary(lang) {
  const file = path.join(ROOT, 'i18n', `${lang}.js`);
  if (!fs.existsSync(file)) return { file, exists: false };
  delete require.cache[require.resolve(file)];
  return { file, exists: true, dict: require(file), text: fs.readFileSync(file, 'utf8') };
}

/** Runs the 5 checks for one language. Returns { lang, problems: [...], stats }. */
function checkLanguage(lang, inv) {
  const loaded = loadDictionary(lang);
  const problems = [];
  if (!loaded.exists) {
    return { lang, problems: [`i18n/${lang}.js does not exist (run with --scaffold)`], stats: {} };
  }
  const { dict, text } = loaded;
  const missing = [], identical = [], parity = [];
  inv.keys.forEach(key => {
    const entry = dict[key];
    if (!entry) { missing.push(key); return; }
    const enEntry = inv.en.get(key);
    const mine = renderEntry(entry);
    const theirs = renderEntry(enEntry);
    if (mine === theirs && !IDENTICAL_OK.has(key)) { identical.push(key); return; }
    if (!NUMERIC_PARITY_WAIVED.has(key)) {
      if (!sameList(digitSequences(mine), digitSequences(theirs))) {
        parity.push(`${key}: digits ${JSON.stringify(digitSequences(mine))} vs EN ${JSON.stringify(digitSequences(theirs))}`);
      }
      if (typeof enEntry === 'function' || typeof entry === 'function') {
        SENTINELS.forEach(tok => {
          if ((PARAM_UNUSED_OK[key] || []).includes(tok)) return;
          if (theirs.includes(tok) && !mine.includes(tok)) parity.push(`${key}: parameter ${tok} is printed by the EN entry but not by this one`);
        });
      }
    }
  });
  if (missing.length) problems.push(`${missing.length} missing key(s): ${missing.join(', ')}`);
  if (identical.length) problems.push(`${identical.length} key(s) still identical to EN: ${identical.join(', ')}`);
  const todo = (text.match(new RegExp('// ' + TODO_MARKER + '\\s*$', 'gm')) || []).length;
  if (todo) problems.push(`${todo} ${TODO_MARKER} marker(s) left in i18n/${lang}.js`);
  if (parity.length) problems.push(`${parity.length} numeric/parameter parity problem(s):\n    - ${parity.join('\n    - ')}`);
  const loc = text.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  if (/toLocale(?:Date|Time)?String\s*\(|Intl\./.test(loc)) {
    problems.push('locale-aware formatting (toLocale*/Intl) inside the dictionary — numbers and dates are pinned en-US by the generators');
  }
  const extra = Object.keys(dict).filter(k => !inv.sources.has(k));
  return {
    lang, problems,
    stats: { keys: inv.keys.length, translated: inv.keys.length - missing.length - identical.length, missing: missing.length, identical: identical.length, todoMarkers: todo, extraKeys: extra }
  };
}

// ---------------------------------------------------------------------------
// Scaffold
// ---------------------------------------------------------------------------
function entrySource(key, enEntry) {
  if (typeof enEntry === 'function') {
    // Free variables would break once the function is copied out of
    // translations.js — prove it is self-contained before writing it.
    try { vm.runInNewContext('(' + enEntry.toString() + ')')(...SENTINELS); } catch (e) {
      throw new Error(`cannot scaffold '${key}': its EN function is not self-contained (${e.message})`);
    }
    return `  ${JSON.stringify(key)}: ${enEntry.toString()},  // ${TODO_MARKER}`;
  }
  return `  ${JSON.stringify(key)}: ${JSON.stringify(enEntry)},  // ${TODO_MARKER}`;
}

function headerFor(lang) {
  const name = lang === 'pt' ? 'Portuguese (Brazil)' : 'Spanish';
  return `'use strict';

/**
 * i18n/${lang}.js — ${name} strings for the STATIC SEO pages (tokens/, chains/,
 * pools/ pages, hubs and sitemaps under /${lang}/). Node-only: read by the
 * generators through i18n/index.js, never shipped to a browser.
 *
 * Shape: { key: string | function } — the same keys, parameters and
 * semantics as the EN entries in translations.js / i18n/static-en-ko.js.
 * Missing keys fall back to EN per key. Every entry starts as the EN value
 * marked \`// ${TODO_MARKER}\`; translate it and delete the marker.
 * \`node scripts/i18n-key-inventory.js\` is the done-check.
 *
 * Rules for translators
 *  - Parameters arrive already formatted (en-US numbers, "$1.2M", "12.34%").
 *    Print each one exactly as received: never reformat, round or localise it,
 *    and never use toLocaleString / Intl in here.
 *  - Keep every number that is written into a string (35%, 25%, 15%, "5" ...).
 *  - Entries that contain HTML or Markdown syntax keep it intact.
 *  - Brand/ticker/technical terms (DeFi Garden, DefiLlama, DeFi Score, APY,
 *    TVL, USDC ...) stay as they are.
 *  - 'landing.*' and 'planner.*' keys are the nested namespaces of
 *    translations.js, flattened.
 */
module.exports = {
`;
}

function scaffold(lang, inv) {
  const file = path.join(ROOT, 'i18n', `${lang}.js`);
  const loaded = loadDictionary(lang);
  if (!loaded.exists) {
    const body = inv.keys.map(k => entrySource(k, inv.en.get(k))).join('\n');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, headerFor(lang) + body + '\n};\n');
    return { lang, created: true, added: inv.keys.length };
  }
  const missing = inv.keys.filter(k => !loaded.dict[k]);
  if (!missing.length) return { lang, created: false, added: 0 };
  const idx = loaded.text.lastIndexOf('\n};');
  if (idx < 0) throw new Error(`i18n/${lang}.js: cannot find the closing "};" to append to`);
  const add = '\n' + missing.map(k => entrySource(k, inv.en.get(k))).join('\n');
  fs.writeFileSync(file, loaded.text.slice(0, idx) + add + loaded.text.slice(idx));
  return { lang, created: false, added: missing.length };
}

// ---------------------------------------------------------------------------
module.exports = { collectKeys, checkLanguage, scaffold, entrySource, renderEntry, digitSequences, IDENTICAL_OK, NOT_KEYS, LANGS, TODO_MARKER };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const only = argv.includes('--lang') ? [argv[argv.indexOf('--lang') + 1]] : LANGS;
  const inv = collectKeys();
  if (inv.missingInEn.length) {
    console.error(`❌ keys used by the generators but missing from the EN dictionary: ${inv.missingInEn.join(', ')}`);
    process.exit(1);
  }
  if (argv.includes('--list')) {
    console.log(`${inv.keys.length} keys used by the static-page generators:\n`);
    inv.keys.forEach(k => console.log(`${k}\t${Array.from(inv.sources.get(k)).map(f => f.replace(/^generate-|-pages\.js$/g, '')).join(',')}`));
    process.exit(0);
  }
  if (argv.includes('--scaffold')) {
    only.forEach(lang => {
      const r = scaffold(lang, inv);
      console.log(`${r.created ? 'created' : 'updated'} i18n/${lang}.js (${r.added} key(s) added)`);
    });
    process.exit(0);
  }
  console.log(`${inv.keys.length} keys used by the static-page generators`);
  let failed = false;
  only.forEach(lang => {
    const r = checkLanguage(lang, inv);
    if (r.problems.length) {
      failed = true;
      console.error(`\n❌ ${lang}: not done`);
      r.problems.forEach(p => console.error(`  - ${p}`));
    } else {
      console.log(`✅ ${lang}: ${r.stats.translated}/${r.stats.keys} keys translated`);
    }
    if (r.stats.extraKeys && r.stats.extraKeys.length) {
      console.log(`  (note: ${r.stats.extraKeys.length} dictionary key(s) not used by any generator: ${r.stats.extraKeys.join(', ')})`);
    }
  });
  process.exit(failed ? 1 : 0);
}
