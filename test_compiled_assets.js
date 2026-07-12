/* Smoke gate for backlog 052 (drop in-browser Babel): app.compiled.js /
   PoolDetail.compiled.js must be freshly re-derivable from app.js /
   PoolDetail.js (not hand-edited, never drift from source), and home.html
   must load the compiled output with no Babel/text-babel left behind.
   Run: node test_compiled_assets.js */
const assert = require('assert');
const fs = require('fs');
const { transform, FILES } = require('./compile-app.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

console.log('compiled assets match source (backlog 052)');
for (const file of FILES) {
  const compiledPath = file.replace(/\.js$/, '.compiled.js');
  test(`${compiledPath} is byte-identical to a fresh compile of ${file}`, () => {
    assert.ok(fs.existsSync(compiledPath), `${compiledPath} is missing — run \`npm run compile\``);
    const committed = fs.readFileSync(compiledPath, 'utf8');
    const fresh = transform(file, fs.readFileSync(file, 'utf8'));
    assert.strictEqual(committed, fresh, `${compiledPath} is stale — run \`npm run compile\` and commit the result`);
  });
}

console.log('home.html loads compiled output, no Babel');
const homeHtml = fs.readFileSync('home.html', 'utf8');
test('home.html does not load @babel/standalone or use type="text/babel"', () => {
  assert.ok(!/unpkg\.com\/@babel\/standalone/.test(homeHtml), 'home.html still fetches @babel/standalone from unpkg');
  assert.ok(!/['"]text\/babel['"]/.test(homeHtml), 'home.html still sets a text/babel script type');
});
test('home.html loads PoolDetail.compiled.js before app.compiled.js', () => {
  const poolIdx = homeHtml.indexOf("addScript('PoolDetail.compiled.js'");
  const appIdx = homeHtml.indexOf("addScript('app.compiled.js')");
  assert.ok(poolIdx !== -1, 'PoolDetail.compiled.js not loaded');
  assert.ok(appIdx !== -1, 'app.compiled.js not loaded');
  assert.ok(poolIdx < appIdx, 'PoolDetail.compiled.js must be requested (and chained via onload) before app.compiled.js');
});

console.log(`\n${passed} compiled-asset assertions passed`);
if (process.exitCode) process.exit(process.exitCode);
