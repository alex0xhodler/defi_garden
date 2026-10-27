#!/usr/bin/env node
/**
 * Static Korean pages that have a committed English twin: today /ko/methodology
 * (ko/methodology.html). `ko/` is a generated-output directory
 * (scripts/site-outputs.txt), so the Korean page is built here in CI instead of
 * being committed into an ignored directory.
 *
 * The page reuses methodology.html's <style> block verbatim (one design, no fork)
 * and the Korean copy in i18n/methodology-ko.js. Same public level as the English
 * page ("what, not how", CLAUDE.md): no weights, cutoffs, formulas, constants or
 * model names. Trust-rail figures come from trust-rails.js.
 *
 * Usage: node generate-ko-static.js [--out ko]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const rails = require('./trust-rails.js');
const copy = require('./i18n/methodology-ko.js');

const SITE_URL = 'https://www.defi.garden';
const EN_URL = SITE_URL + '/methodology';
const KO_URL = SITE_URL + '/ko/methodology';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
}

/** The shared <style> body of the English page, so both languages stay in lockstep. */
function sharedStyle() {
  const en = fs.readFileSync(path.join(__dirname, 'methodology.html'), 'utf8');
  const m = en.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error('methodology.html: <style> block not found');
  return m[1];
}

function buildMethodologyKo() {
  const M = copy.META;
  const style = sharedStyle() + '      :lang(ko) .meth-wrap, :lang(ko) .meth-footer { word-break: keep-all; overflow-wrap: break-word; }\n      :lang(ko) .meth-table th { text-transform: none; letter-spacing: 0; }\n';
  const railsFmt = {
    tvlK: (rails.DEFAULT_MIN_TVL / 1000).toLocaleString('en-US'),
    tvlFull: rails.DEFAULT_MIN_TVL.toLocaleString('en-US'),
    apy: rails.APY_SANITY_LIMIT.toLocaleString('en-US')
  };
  const article = {
    '@context': 'https://schema.org', '@type': 'TechArticle',
    headline: M.headline, description: M.ldDescription, url: KO_URL, mainEntityOfPage: KO_URL, inLanguage: 'ko',
    datePublished: M.datePublished, dateModified: M.dateModified,
    author: { '@type': 'Organization', name: 'DeFi Garden', url: SITE_URL + '/' },
    publisher: { '@type': 'Organization', name: 'DeFi Garden', url: SITE_URL + '/', logo: { '@type': 'ImageObject', url: SITE_URL + '/og-image.png' } }
  };
  const crumbs = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: M.breadcrumbHome, item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: M.breadcrumbMethodology, item: KO_URL }
    ]
  };
  let h = '<!DOCTYPE html>\n<html lang="ko">\n<head>\n';
  h += '    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  h += '    <title>' + esc(M.title) + '</title>\n';
  h += '    <meta name="description" content="' + esc(M.description) + '">\n';
  h += '    <link rel="canonical" href="' + KO_URL + '">\n';
  h += '    <link rel="alternate" hreflang="en" href="' + EN_URL + '">\n';
  h += '    <link rel="alternate" hreflang="ko" href="' + KO_URL + '">\n';
  h += '    <link rel="alternate" hreflang="x-default" href="' + EN_URL + '">\n';
  h += '    <meta name="robots" content="index,follow">\n';
  h += '    <meta property="og:type" content="article">\n';
  h += '    <meta property="og:title" content="' + esc(M.title) + '">\n';
  h += '    <meta property="og:description" content="' + esc(M.ogDescription) + '">\n';
  h += '    <meta property="og:url" content="' + KO_URL + '">\n';
  h += '    <meta property="og:site_name" content="DeFi Garden">\n';
  h += '    <meta property="og:locale" content="ko_KR">\n';
  h += '    <meta property="og:image" content="' + SITE_URL + '/og-image.png">\n';
  h += '    <meta name="twitter:card" content="summary_large_image">\n';
  h += '    <meta name="twitter:title" content="' + esc(M.title) + '">\n';
  h += '    <meta name="twitter:description" content="' + esc(M.ogDescription) + '">\n';
  h += '    <meta name="twitter:image" content="' + SITE_URL + '/og-image.png">\n';
  h += '    <link rel="icon" href="data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'><text y=\'0.9em\' font-size=\'90\'>🌱</text></svg>">\n';
  h += '    <link rel="preload" href="/fonts/PublicSans-latin-var.woff2" as="font" type="font/woff2" crossorigin>\n';
  h += '    <script>try{var th=localStorage.getItem(\'theme\');if(th)document.documentElement.setAttribute(\'data-theme\',th)}catch(e){}</script>\n';
  h += '    <link rel="stylesheet" href="/style.css">\n';
  h += '    <script type="application/ld+json">' + jsonLd(article) + '</script>\n';
  h += '    <script type="application/ld+json">' + jsonLd(crumbs) + '</script>\n';
  h += '    <style>' + style + '    </style>\n</head>\n<body>\n';
  h += '    <header class="meth-header">\n        <a href="/?lang=ko" class="meth-logo">DeFi Garden 🌱</a>\n';
  h += '        <div class="meth-head-right">\n            <nav class="meth-nav" aria-label="' + esc(M.nav.primary) + '">\n';
  h += '                <a href="/?app=1&amp;lang=ko">' + M.nav.search + '</a>\n';
  h += '                <a href="/stocks?lang=ko">' + M.nav.stocks + '</a>\n';
  h += '                <a href="/ko/methodology" aria-current="page">' + M.nav.methodology + '</a>\n';
  h += '                <a href="/mcp">' + M.nav.api + '</a>\n            </nav>\n';
  h += '            <a class="meth-lang" href="/methodology" hreflang="en" lang="en" aria-label="English">EN</a>\n';
  h += '        </div>\n    </header>\n\n';
  h += '    <main class="meth-wrap">' + copy.mainHtml(railsFmt) + '    </main>\n\n';
  h += '    <footer class="meth-footer">' + copy.footerHtml() + '    </footer>\n\n</body>\n</html>\n';
  return { html: h, url: KO_URL, title: M.title };
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--out');
  const outDir = path.resolve(i >= 0 && args[i + 1] ? args[i + 1] : 'ko');
  fs.mkdirSync(outDir, { recursive: true });
  const page = buildMethodologyKo();
  fs.writeFileSync(path.join(outDir, 'methodology.html'), page.html);
  console.log('generate-ko-static: wrote ' + path.relative(process.cwd(), path.join(outDir, 'methodology.html')));
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('generate-ko-static failed:', e && e.message); process.exit(1); }
}

module.exports = { buildMethodologyKo, KO_URL, EN_URL };
