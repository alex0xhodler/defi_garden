/* Qualifier-word / pool-type regression test for the REAL
   parseNaturalLanguageQuery (app.js).

   Spec 084: the previous version tested a STALE INLINE COPY and could never
   fail. It now extracts the live parser from app.js source (see
   test_helpers_parser.js) and asserts its CURRENT, verified-real behavior:
   qualifier words ("best", "top", "highest", "apy", "yields") must never leak
   into token/protocol slots, the lend-stem regex classifies Lending, generic
   "yields" must NOT add "Yield Farming", and explicit "farming" must.

   Pure Node, no Playwright, no network. Run: node test_qualifier_fix.js */
const path = require('path');
const { extractParser } = require('./test_helpers_parser.js');

let parse;
try {
  parse = extractParser(path.join(__dirname, 'app.js'));
} catch (err) {
  console.error('EXTRACTION FAILED: ' + err.message);
  process.exit(1);
}

// Realistic live-data fixtures (chain assignment is gated on allChains
// membership; token scoring runs over allTokens).
const TOKENS = ['USDC', 'USDT', 'ETH', 'SOL'];
const CHAINS = ['Base', 'Ethereum', 'Arbitrum', 'Solana'];
const PROTOCOLS_DYNAMIC = [{ friendlyName: 'Kamino Lend', originalNames: ['kamino-lend'] }];

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
const dynamic = { tokens: TOKENS, chains: CHAINS, protocols: PROTOCOLS_DYNAMIC };

console.log('=== parseNaturalLanguageQuery: qualifier words & pool types (spec 084) ===');

// Qualifier words never become tokens; "base" after "on" is a chain, not token.
check('qualifiers not tokens: "best yields on base" -> token ""',
  'best yields on base', base, { token: '', chain: 'Base' });

// Real token survives the qualifier filter: "top usdc yields" -> USDC.
check('real token survives filter: "top usdc yields" -> token USDC',
  'top usdc yields', base, { token: 'USDC' });

// Chain indicator + qualifiers, no real token in the candidate span -> chain
// only, empty token. (Arbitrum has no token-substring collision.)
check('chain only, empty token: "highest apy on arbitrum" -> chain Arbitrum, token ""',
  'highest apy on arbitrum', base, { chain: 'Arbitrum', token: '' });

// A token alias appearing AFTER "on" is treated as a chain, not a token:
// "eth" -> chain Ethereum, token stays empty (the wordsAfterChainIndicators
// skip). Without that skip, token would wrongly resolve to ETH.
check('token-after-"on" is a chain: "best yields on eth" -> chain Ethereum, token ""',
  'best yields on eth', base, { chain: 'Ethereum', token: '' });

// lend-stem regex \blend(ing|ers?)?\b classifies Lending (and Venus protocol).
check('lend stem (lending): "usdt lending on venus" -> poolTypes [Lending], protocols [Venus]',
  'usdt lending on venus', base, { poolTypes: ['Lending'], protocols: ['Venus'] });

// lend-stem also catches "lenders" (the 018 kamino case).
check('lend stem (lenders): "kamino lenders" -> poolTypes [Lending]',
  'kamino lenders', dynamic, { poolTypes: ['Lending'] });

// Generic "yields" must NOT add Yield Farming (only "farm"/"farming" does).
check('generic yields: "yields" -> poolTypes []',
  'yields', base, { poolTypes: [] });

check('generic yields with token: "usdc yields" -> poolTypes []',
  'usdc yields', base, { poolTypes: [] });

// Explicit farming DOES add Yield Farming.
check('explicit farming: "farming" -> poolTypes [Yield Farming]',
  'farming', base, { poolTypes: ['Yield Farming'] });

console.log('\n' + passed + '/' + total + ' passed');
if (passed !== total) process.exit(1);
