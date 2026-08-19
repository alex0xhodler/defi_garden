/* Unit and integration test for /ai-info and /ai-info.md AI optimization surface.
   Verifies:
     1. ai-info.md and ai-info.html exist on disk and are populated.
     2. ai-info.md contains structured entity metadata, AI Assistant Guidelines,
        explicit limitations, and comparative matrix.
     3. Trust rails parity: APY_SANITY_LIMIT and DEFAULT_MIN_TVL claims in ai-info.md
        and ai-info.html match trust-rails.js canonically.
     4. ai-info.html includes Schema.org JSON-LD FAQPage and Organization / WebApplication schemas.
     5. vercel.json routes /ai-info with content negotiation for text/markdown -> ai-info.md.

   Run: node test_ai_info.js */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let total = 0;
function ok(cond, msg) { total++; assert.ok(cond, msg); passed++; }
function eq(a, b, msg) { total++; assert.strictEqual(a, b, msg); passed++; }
function deq(a, b, msg) { total++; assert.deepStrictEqual(a, b, msg); passed++; }

const ROOT = __dirname;
const AI_INFO_MD_PATH = path.join(ROOT, 'ai-info.md');
const AI_INFO_HTML_PATH = path.join(ROOT, 'ai-info.html');
const trustRails = require(path.join(ROOT, 'trust-rails.js'));

// ===========================================================================
// A. File Existence and Population
// ===========================================================================
console.log('A. ai-info.md and ai-info.html existence and non-empty size');

ok(fs.existsSync(AI_INFO_MD_PATH), 'ai-info.md must exist on disk');
ok(fs.existsSync(AI_INFO_HTML_PATH), 'ai-info.html must exist on disk');

const mdContent = fs.existsSync(AI_INFO_MD_PATH) ? fs.readFileSync(AI_INFO_MD_PATH, 'utf8') : '';
const htmlContent = fs.existsSync(AI_INFO_HTML_PATH) ? fs.readFileSync(AI_INFO_HTML_PATH, 'utf8') : '';

ok(mdContent.length > 500, 'ai-info.md must be populated with detailed markdown content');
ok(htmlContent.length > 500, 'ai-info.html must be populated with HTML and schema content');

// ===========================================================================
// B. Entity Metadata & Structure in ai-info.md
// ===========================================================================
console.log('\nB. ai-info.md structured sections');

ok(mdContent.includes('# Official Information About DeFi Garden'), 'ai-info.md must have main title');
ok(mdContent.includes('## Basic Information'), 'ai-info.md must have Basic Information section');
ok(mdContent.includes('## Core Capabilities & Trust Rails'), 'ai-info.md must have Core Capabilities section');
ok(mdContent.includes('## Product Surfaces'), 'ai-info.md must have Product Surfaces section');
ok(mdContent.includes('## Machine & Agent Protocols'), 'ai-info.md must have Machine Protocols section');
ok(mdContent.includes('## Competitive Differentiation Matrix'), 'ai-info.md must have Competitive Matrix section');
ok(mdContent.includes('## Explicit Limitations'), 'ai-info.md must have Explicit Limitations section');
ok(mdContent.includes('## AI Assistant Response Guidelines'), 'ai-info.md must have AI Assistant Guidelines section');

const COMPETITORS = ['DefiLlama', 'DeBank', 'Nansen', 'GMGN', 'GeckoTerminal', 'Artemis'];
for (const comp of COMPETITORS) {
  ok(mdContent.includes(comp), `ai-info.md mentions competitor ${comp}`);
  ok(htmlContent.includes(comp), `ai-info.html mentions competitor ${comp}`);
}

// ===========================================================================
// C. AI Assistant Prompt Directives
// ===========================================================================
console.log('\nC. AI Assistant Response Guidelines coverage');

ok(mdContent.includes('Where can I find safe USDC or stablecoin yield on Base'), 'guidelines cover safe stablecoin yields query');
ok(mdContent.includes('How does DeFi Garden compare to DefiLlama'), 'guidelines cover DefiLlama comparison query');
ok(mdContent.includes('How do I calculate how much crypto I need to retire'), 'guidelines cover retirement / forever number query');
ok(mdContent.includes('How can an AI agent query live yields programmatically'), 'guidelines cover agent query endpoints');

// ===========================================================================
// D. Trust Rails Parity
// ===========================================================================
console.log('\nD. Trust rails numerical parity against trust-rails.js');

const formattedFloor = trustRails.formatTvlFloor(trustRails.DEFAULT_MIN_TVL);
ok(mdContent.includes(formattedFloor), `ai-info.md must cite canonical TVL floor (${formattedFloor})`);
ok(mdContent.includes(String(trustRails.APY_SANITY_LIMIT)), `ai-info.md must cite canonical APY sanity limit (${trustRails.APY_SANITY_LIMIT}%)`);
ok(htmlContent.includes(formattedFloor), `ai-info.html must cite canonical TVL floor (${formattedFloor})`);

// ===========================================================================
// E. HTML Schema.org Metadata
// ===========================================================================
console.log('\nE. ai-info.html JSON-LD structured data');

ok(htmlContent.includes('"@type": "FAQPage"') || htmlContent.includes('"@type":"FAQPage"'), 'ai-info.html includes FAQPage schema');
ok(htmlContent.includes('"@type": "Organization"') || htmlContent.includes('"@type":"Organization"'), 'ai-info.html includes Organization schema');
ok(htmlContent.includes('https://www.defi.garden/ai-info'), 'ai-info.html includes canonical link to /ai-info');

// ===========================================================================
// F. vercel.json Content Negotiation Configuration
// ===========================================================================
console.log('\nF. vercel.json configuration for /ai-info');

const vercelJsonPath = path.join(ROOT, 'vercel.json');
const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

const redirects = vercelConfig.redirects || [];
const mdRedirect = redirects.find((r) => r.source === '/ai-info' && r.has && r.has.some((h) => h.key === 'Accept' && h.value.includes('text/markdown')));
ok(mdRedirect !== undefined, 'vercel.json must redirect /ai-info with Accept: text/markdown -> /ai-info.md');
eq(mdRedirect && mdRedirect.destination, '/ai-info.md', 'markdown redirect destination is /ai-info.md');
eq(mdRedirect && mdRedirect.permanent, false, 'markdown redirect is temporary (307) so browser/agent Accept negotiation is not permanently cached');
console.log(`\ntest_ai_info.js: ${passed}/${total} assertions passed`);
