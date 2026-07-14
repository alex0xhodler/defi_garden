/* Shared extraction of the REAL parseNaturalLanguageQuery from app.js source.

   Used by test_protocol_parsing.js and test_qualifier_fix.js so neither file
   carries a stale inline copy of parser logic (the 017/018 "fixtures passed,
   product failed" class). Dependency-free: node builtins only, no product
   imports. Repo-relative reads only — callers pass the path via
   path.join(__dirname, 'app.js') (the 083 ENOENT/absolute-path class is banned).

   Fails LOUDLY (throws) if the top-level declaration can't be found, its body
   can't be sliced, or the evaluated value isn't a function — a renamed/moved/
   deleted parser must break the NORTH_STAR gate, not silently skip it. */
const fs = require('fs');
const vm = require('vm');

const DECL = 'const parseNaturalLanguageQuery = (query';

function extractParser(appPath) {
  const src = fs.readFileSync(appPath, 'utf8');

  const start = src.indexOf(DECL);
  if (start < 0) {
    throw new Error(
      'Could not locate `' + DECL + ' ...` in ' + appPath +
      ' — the top-level parser declaration was renamed or moved. ' +
      'Update these tests to track app.js.'
    );
  }

  // The parser is a top-level `const ... => { ... };`. Its entire body is
  // indented, so the first COLUMN-0 `};` after the declaration is its own
  // closing brace. Object literals inside the body (protocolAliases,
  // protocolChainMapping, ...) all close with an INDENTED `};`, never at
  // column 0, so this can't land early — and the vm evaluation + typeof check
  // below is the backstop that would catch a mis-slice loudly.
  const endRel = src.indexOf('\n};', start);
  if (endRel < 0) {
    throw new Error(
      'Located the parser declaration but not its closing `};` in ' + appPath +
      ' — the function shape changed unexpectedly.'
    );
  }
  const sliced = src.slice(start, endRel + 3); // include the trailing "\n};"

  const ctx = {};
  vm.createContext(ctx);
  let fn;
  try {
    // Evaluate the sliced declaration, then yield the bound name.
    fn = vm.runInContext(sliced + '\nparseNaturalLanguageQuery;', ctx);
  } catch (err) {
    throw new Error(
      'Extracted parseNaturalLanguageQuery source did not evaluate cleanly ' +
      '(brace/paren slice likely wrong): ' + err.message
    );
  }
  if (typeof fn !== 'function') {
    throw new Error(
      'Extracted parseNaturalLanguageQuery is not a function (got ' +
      typeof fn + ') — extraction produced the wrong slice.'
    );
  }
  return fn;
}

module.exports = { extractParser };
