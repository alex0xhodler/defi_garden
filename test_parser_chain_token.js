/* Chain-alias-substring-leak regression test for the REAL
   parseNaturalLanguageQuery (app.js).

   Spec 100: the SECOND token-parse fallback (`if (!token && tokenCandidateText)`)
   uses a bare substring test whose `chainNames` guard listed only the LONG chain
   names. So short chain aliases that are >=3 chars and substrings of a longer
   chain name (eth<-ethereum, sol<-solana, arb<-arbitrum) leaked into the token
   slot: `yields on ethereum` -> token ETH (should be ''). The fix expands the
   guard to every `chainAliases` key. This test extracts the live parser from
   app.js source (see test_helpers_parser.js) — never an inline copy.

   Pure Node, no Playwright, no network. Run: node test_parser_chain_token.js */
const path = require('path');
const { extractParser } = require('./test_helpers_parser.js');

let parse;
try {
  parse = extractParser(path.join(__dirname, 'app.js'));
} catch (err) {
  console.error('EXTRACTION FAILED: ' + err.message);
  process.exit(1);
}

// Fixtures include the token aliases that collide with chain names (ETH, SOL,
// ARB, OP) so the leak would resolve if the guard were incomplete.
const TOKENS = ['USDC', 'USDT', 'ETH', 'SOL', 'ARB', 'OP'];
const CHAINS = ['Base', 'Ethereum', 'Arbitrum', 'Solana', 'Optimism'];

let passed = 0;
let total = 0;

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

const base = { tokens: TOKENS, chains: CHAINS, protocols: [] };

console.log('=== parseNaturalLanguageQuery: chain-alias substring leak (spec 100) ===');

// Fix cases: a short chain alias that is a substring of a longer chain name
// after "on" must NOT leak into the token slot.
check('leak fix: "yields on ethereum" -> token "", chain Ethereum',
  'yields on ethereum', base, { token: '', chain: 'Ethereum' });

check('leak fix: "highest apy on ethereum" -> token "", chain Ethereum',
  'highest apy on ethereum', base, { token: '', chain: 'Ethereum' });

check('leak fix: "best yields on solana" -> token "", chain Solana',
  'best yields on solana', base, { token: '', chain: 'Solana' });

check('leak fix: "on arbitrum" -> token "", chain Arbitrum',
  'on arbitrum', base, { token: '', chain: 'Arbitrum' });

// Regression: a whole-word token before "on" is found by the primary loop and
// must still resolve (never reaches the fallback).
check('regression: "usdc on ethereum" -> token USDC, chain Ethereum',
  'usdc on ethereum', base, { token: 'USDC', chain: 'Ethereum' });

check('regression: "top usdc yields" -> token USDC',
  'top usdc yields', base, { token: 'USDC' });

console.log('\n' + passed + '/' + total + ' passed');
if (passed !== total) process.exit(1);
