#!/usr/bin/env node

/**
 * Minify shipped JS/CSS in CI (backlog 053, sequenced after 052).
 *
 * Same pattern as compile-app.js: source stays the edit surface, CI runs
 * this and commits the `.min.` output. app.compiled.js/PoolDetail.compiled.js
 * (052's compile output) are minified in place of app.js/PoolDetail.js so
 * both perf passes stack instead of double-compiling.
 *
 * Run `npm run minify` after editing any of FILES and commit the *.min.*
 * output (same pattern as the sitemap/token-page generators).
 */

const fs = require('fs');
const path = require('path');
const { minify: minifyJs } = require('terser');
const CleanCSS = require('clean-css');

const JS_FILES = ['app.compiled.js', 'PoolDetail.compiled.js', 'planner.js', 'translations.js'];
const CSS_FILES = ['style.css'];

function minPath(file) {
  return file.replace(/\.(js|css)$/, '.min.$1');
}

// Pure: source string in, minified string out. No disk access, so the
// freshness test can call it without mutating the tree.
async function transformJs(file, source) {
  const result = await minifyJs(source, { compress: true, mangle: true });
  if (!result.code) throw new Error(`terser produced no output for ${file}`);
  return result.code;
}

function transformCss(file, source) {
  const result = new CleanCSS({}).minify(source);
  if (result.errors && result.errors.length) {
    throw new Error(`clean-css failed on ${file}: ${result.errors.join('; ')}`);
  }
  return result.styles;
}

async function minifyOne(file) {
  const srcPath = path.join(__dirname, file);
  const outPath = path.join(__dirname, minPath(file));
  const source = fs.readFileSync(srcPath, 'utf8');
  const isCss = file.endsWith('.css');
  const output = isCss ? transformCss(file, source) : await transformJs(file, source);
  fs.writeFileSync(outPath, output);
  return outPath;
}

async function minifyAll() {
  const results = [];
  for (const file of [...JS_FILES, ...CSS_FILES]) {
    results.push(await minifyOne(file));
  }
  return results;
}

if (require.main === module) {
  minifyAll().then((paths) => {
    for (const outPath of paths) {
      console.log(`minified -> ${path.relative(__dirname, outPath)}`);
    }
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { transformJs, transformCss, minifyOne, JS_FILES, CSS_FILES, minPath };
