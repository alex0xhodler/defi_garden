/* Smoke gate for backlog 053 (minify JS/CSS in CI): *.min.js/*.min.css must be
   freshly re-derivable from their sources (not hand-edited, never drift), and
   home.html/plan.html must reference the minified files, not the raw sources.
   Run: node test_minified_assets.js */
const assert = require('assert');
const fs = require('fs');
const { transformJs, transformCss, JS_FILES, CSS_FILES, minPath } = require('./minify-assets.js');

let passed = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('  ✓ ' + name); })
    .catch((err) => { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; });
}

async function main() {
  console.log('minified assets match source (backlog 053)');
  for (const file of JS_FILES) {
    const outPath = minPath(file);
    await test(`${outPath} is byte-identical to a fresh minify of ${file}`, async () => {
      assert.ok(fs.existsSync(outPath), `${outPath} is missing — run \`npm run minify\``);
      const committed = fs.readFileSync(outPath, 'utf8');
      const fresh = await transformJs(file, fs.readFileSync(file, 'utf8'));
      assert.strictEqual(committed, fresh, `${outPath} is stale — run \`npm run minify\` and commit the result`);
    });
  }
  for (const file of CSS_FILES) {
    const outPath = minPath(file);
    await test(`${outPath} is byte-identical to a fresh minify of ${file}`, async () => {
      assert.ok(fs.existsSync(outPath), `${outPath} is missing — run \`npm run minify\``);
      const committed = fs.readFileSync(outPath, 'utf8');
      const fresh = transformCss(file, fs.readFileSync(file, 'utf8'));
      assert.strictEqual(committed, fresh, `${outPath} is stale — run \`npm run minify\` and commit the result`);
    });
  }

  console.log('home.html / plan.html reference minified assets, not raw sources');
  const homeHtml = fs.readFileSync('home.html', 'utf8');
  const planHtml = fs.readFileSync('plan.html', 'utf8');
  await test('home.html loads style.min.css, translations.min.js, planner.min.js, *.compiled.min.js', () => {
    assert.ok(homeHtml.includes('style.min.css'), 'home.html does not load style.min.css');
    assert.ok(homeHtml.includes('translations.min.js'), 'home.html does not load translations.min.js');
    assert.ok(homeHtml.includes('planner.min.js'), 'home.html does not load planner.min.js');
    assert.ok(homeHtml.includes("addScript('PoolDetail.compiled.min.js'"), 'home.html does not load PoolDetail.compiled.min.js');
    assert.ok(homeHtml.includes("addScript('app.compiled.min.js')"), 'home.html does not load app.compiled.min.js');
    assert.ok(homeHtml.includes("addCSS('pool-detail-styles.min.css')"), 'home.html does not load pool-detail-styles.min.css');
    assert.ok(homeHtml.includes("addCSS('planner-styles.min.css')"), 'home.html does not load planner-styles.min.css');
    assert.ok(!/href="style\.css"/.test(homeHtml), 'home.html still links raw style.css');
    assert.ok(!/src="translations\.js"/.test(homeHtml), 'home.html still loads raw translations.js');
    assert.ok(!/src="planner\.js"/.test(homeHtml), 'home.html still loads raw planner.js');
    assert.ok(!/addCSS\('pool-detail-styles\.css'\)/.test(homeHtml), 'home.html still loads raw pool-detail-styles.css');
    assert.ok(!/addCSS\('planner-styles\.css'\)/.test(homeHtml), 'home.html still loads raw planner-styles.css');
  });
  await test('plan.html loads style.min.css, translations.min.js, planner.min.js, planner-styles.min.css', () => {
    assert.ok(planHtml.includes('style.min.css'), 'plan.html does not load style.min.css');
    assert.ok(planHtml.includes('translations.min.js'), 'plan.html does not load translations.min.js');
    assert.ok(planHtml.includes('planner.min.js'), 'plan.html does not load planner.min.js');
    assert.ok(planHtml.includes('planner-styles.min.css'), 'plan.html does not load planner-styles.min.css');
    assert.ok(!/href="style\.css"/.test(planHtml), 'plan.html still links raw style.css');
    assert.ok(!/src="translations\.js"/.test(planHtml), 'plan.html still loads raw translations.js');
    assert.ok(!/src="planner\.js"/.test(planHtml), 'plan.html still loads raw planner.js');
    assert.ok(!/href="planner-styles\.css"/.test(planHtml), 'plan.html still links raw planner-styles.css');
  });

  console.log(`\n${passed} minified-asset assertions passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('test_minified_assets crashed: ' + err.message);
  process.exit(1);
});
