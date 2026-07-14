/* Protocol-parsing regression test for the REAL parseNaturalLanguageQuery
   (app.js), the NL search that feeds the SEO-lander funnel entry.

   Spec 084: the previous version of this file tested a STALE INLINE COPY of a
   simplified parser and could never fail (zero assertions, always exit 0). It
   now extracts the live parser from app.js source at test time (see
   test_helpers_parser.js) and asserts its CURRENT, verified-real behavior — a
   renamed/moved parser breaks the gate loudly, and a real protocol-matching
   regression makes this exit non-zero.

   Pure Node, no Playwright, no network. Run: node test_protocol_parsing.js */
const path = require('path');
const { extractParser } = require('./test_helpers_parser.js');

let parse;
try {
  parse = extractParser(path.join(__dirname, 'app.js'));
} catch (err) {
  console.error('EXTRACTION FAILED: ' + err.message);
  process.exit(1);
}

// Realistic live-data fixtures. The parser gates chain assignment on allChains
// membership and only uses the static protocol fallback when allProtocols is
// empty, so these arrays drive real code paths.
const TOKENS = ['USDC', 'USDT', 'ETH', 'SOL'];
const CHAINS = ['Base', 'Ethereum', 'Arbitrum', 'Solana'];
// Dynamic protocol list (friendlyName/originalNames objects), the shape app.js
// builds from live pool data. Includes the 018 "kamino lenders" fix subject.
const PROTOCOLS_DYNAMIC = [{ friendlyName: 'Kamino Lend', originalNames: ['kamino-lend'] }];

let passed = 0;
let total = 0;

// Assert only the fields named in `expected` (deep-equal per key), so each case
// documents exactly the behavior it locks in.
function check(desc, query, args, expected) {
  total++;
  const actual = parse(query, args.tokens, args.chains, args.protocols);
  const keys = Object.keys(expected);
  const ok = keys.every((k) => JSON.stringify(actual[k]) === JSON.stringify(expected[k]));
  if (ok) {
    passed++;
    console.log('PASS: ' + desc);
  } else {
    const gotSubset = {};
    keys.forEach((k) => { gotSubset[k] = actual[k]; });
    console.log('FAIL: ' + desc);
    console.log('  query    ' + JSON.stringify(query));
    console.log('  expected ' + JSON.stringify(expected));
    console.log('  got      ' + JSON.stringify(gotSubset));
  }
}

const staticFallback = { tokens: TOKENS, chains: CHAINS, protocols: [] };
const dynamic = { tokens: TOKENS, chains: CHAINS, protocols: PROTOCOLS_DYNAMIC };

console.log('=== parseNaturalLanguageQuery: protocol parsing (spec 084) ===');

// Method 1: protocol after a context keyword ("on"), static-fallback friendly
// casing is 'Aave' (the static map key), not lowercase.
check('context keyword: "usdc on aave" -> protocols [Aave], token USDC',
  'usdc on aave', staticFallback, { protocols: ['Aave'], token: 'USDC' });

// Method 1 chain-name skip: "base" after "on" is a chain, never a protocol.
check('chain-name conflict: "best yields on base" -> protocols [], chain Base',
  'best yields on base', staticFallback, { protocols: [], chain: 'Base' });

// Method 2: direct detection with word-boundary match (no context keyword).
check('direct detection: "compound yields" -> protocols [Compound]',
  'compound yields', staticFallback, { protocols: ['Compound'] });

// Method 3 / Method 1: protocol-first plus a real chain -> protocol + chain.
check('protocol-first: "aave on arbitrum" -> protocols [Aave], chain Arbitrum',
  'aave on arbitrum', staticFallback, { protocols: ['Aave'], chain: 'Arbitrum' });

// Dynamic aliases from allProtocols: the 018 fix. "kamino lenders" matches the
// friendlyName "Kamino Lend" via the multi-word leading-boundary rule.
check('dynamic alias (lenders): "kamino lenders" -> protocols [Kamino Lend]',
  'kamino lenders', dynamic, { protocols: ['Kamino Lend'] });

check('dynamic alias (lending): "kamino lending" -> protocols [Kamino Lend]',
  'kamino lending', dynamic, { protocols: ['Kamino Lend'] });

// allProtocols drives matching: the SAME query yields 'Aave' only from the
// static fallback (empty list); with a dynamic list that lacks aave, the
// static fallback is suppressed and nothing matches.
check('static fallback fires only when allProtocols empty: "usdc on aave" -> [Aave]',
  'usdc on aave', staticFallback, { protocols: ['Aave'] });
check('dynamic list without aave suppresses static fallback: "usdc on aave" -> []',
  'usdc on aave', dynamic, { protocols: [] });

// Dedupe: Method 1 matches Aave twice ("on aave ... on aave"); the trailing
// Set dedup collapses to a single entry.
check('dedupe: "aave on aave on aave" -> protocols [Aave] (single)',
  'aave on aave on aave', staticFallback, { protocols: ['Aave'] });

console.log('\n' + passed + '/' + total + ' passed');
if (passed !== total) process.exit(1);
