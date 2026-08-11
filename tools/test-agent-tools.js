#!/usr/bin/env node

/**
5* * Integration Test and Validation Script for DeFi Garden Agent Tools
 * Powered by Hermes Agent
 * 
 * Verifies that an AI agent can successfully invoke the curated yield discovery 
 * and savings planner tools, ensuring exact API routing, request parameter validation,
 * and high-signal, structured JSON output formats.
 */

const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

// backlog 266: this file's own invariant checks were a THIRD hand-typed
// copy of the trust rails (asserting "TVL >= $10M" — stale since commit
// 6fceca79bb moved DEFAULT_MIN_TVL to $100K; see product-loop-kit/specs/266.md's
// Evidence §4). Both the threshold values AND their printed messages now
// derive from trust-rails.js, and the APY check uses the same
// apyBase+apyReward arithmetic as edge/api-core.js:85 / home.html's
// search_yield_pools tool, instead of the upstream `apy` field.
const { DEFAULT_MIN_TVL, APY_SANITY_LIMIT, formatTvlFloor } = require('../trust-rails.js');

function totalApy(pool) {
  return (Number(pool && pool.apyBase) || 0) + (Number(pool && pool.apyReward) || 0);
}

const PORT = 8001;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Helper to make HTTP requests using built-in http module
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { body, ...reqOpts } = options;
    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// Sleep utility for polling and delays
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🧪 Starting DeFi Garden LLM Agent Tools Integration Test...');
  
  let spawnedServer = null;
  let isServerRunning = false;

  // 1. Check if the control daemon is already running
  try {
    const res = await makeRequest(`${BASE_URL}/api/status`);
    if (res.statusCode === 200) {
      console.log('🔌 Found existing DeFi Garden Control Daemon already running on port 8001.');
      isServerRunning = true;
    }
  } catch (e) {
    // Port is closed, need to spawn the server
  }

  if (!isServerRunning) {
    console.log('🚀 Spawning DeFi Garden Control Daemon in the background...');
    const serverScript = path.resolve(__dirname, '../scripts/dashboard-server.js');
    
    // Spawn server process
    spawnedServer = spawn('node', [serverScript], {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'ignore', // Keep terminal output clean
      detached: false
    });

    // Poll server status until it is ready
    let retries = 15;
    while (retries > 0) {
      await sleep(300);
      try {
        const res = await makeRequest(`${BASE_URL}/api/status`);
        if (res.statusCode === 200) {
          console.log('🟢 Control Daemon spawned and fully listening on port 8001.');
          isServerRunning = true;
          break;
        }
      } catch (e) {
        retries--;
      }
    }

    if (!isServerRunning) {
      console.error('❌ Error: Failed to start the local control daemon server.');
      process.exit(1);
    }
  }

  let failedTests = 0;

  // ----------------------------------------------------
  // TEST 1: Retrieve curated pools (Unfiltered query)
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('📡 Test 1: Simulating get_curated_pools (unfiltered)...');
  try {
    const res = await makeRequest(`${BASE_URL}/api/pools`);
    if (res.statusCode !== 200) {
      console.error(`❌ Test 1 Failed: Status is ${res.statusCode}`);
      failedTests++;
    } else if (!Array.isArray(res.body)) {
      console.error('❌ Test 1 Failed: Response body is not an array');
      failedTests++;
    } else {
      console.log(`✅ Test 1 Passed! Received ${res.body.length} curated pools.`);
      if (res.body.length > 0) {
        const p = res.body[0];
        console.log(`   Sample pool: ${p.project} - ${p.symbol} on ${p.chain} (${p.apy.toFixed(2)}% APY, TVL: $${(p.tvlUsd / 1e6).toFixed(1)}M)`);
        
        // Invariant checks — thresholds + messages derived from trust-rails.js (backlog 266)
        const belowTvlLimit = res.body.filter(x => x.tvlUsd < DEFAULT_MIN_TVL);
        const aboveApyLimit = res.body.filter(x => totalApy(x) > APY_SANITY_LIMIT);
        if (belowTvlLimit.length > 0) {
          console.error(`❌ Invariant Violated: Found pools with TVL < ${formatTvlFloor(DEFAULT_MIN_TVL)}!`);
          failedTests++;
        } else if (aboveApyLimit.length > 0) {
          console.error(`❌ Invariant Violated: Found pools with APY > ${APY_SANITY_LIMIT}%!`);
          failedTests++;
        } else {
          console.log(`   [PASS] Invariant check: All pools strictly respect TVL >= ${formatTvlFloor(DEFAULT_MIN_TVL)} and APY <= ${APY_SANITY_LIMIT}% rails.`);
        }
      }
    }
  } catch (err) {
    console.error(`❌ Test 1 Failed with Exception:`, err.message);
    failedTests++;
  }

  // ----------------------------------------------------
  // TEST 2: Retrieve curated pools (Filtered by token and chain)
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('📡 Test 2: Simulating get_curated_pools (filtered: USDC on Arbitrum)...');
  try {
    const res = await makeRequest(`${BASE_URL}/api/pools?token=USDC&chain=Arbitrum`);
    if (res.statusCode !== 200) {
      console.error(`❌ Test 2 Failed: Status is ${res.statusCode}`);
      failedTests++;
    } else if (!Array.isArray(res.body)) {
      console.error('❌ Test 2 Failed: Response body is not an array');
      failedTests++;
    } else {
      console.log(`✅ Test 2 Passed! Found ${res.body.length} matching pools.`);
      
      const incorrectToken = res.body.filter(p => !p.symbol.toUpperCase().includes('USDC'));
      const incorrectChain = res.body.filter(p => p.chain.toLowerCase() !== 'arbitrum');
      
      if (incorrectToken.length > 0) {
        console.error('❌ Filter Violated: Found pools that do not match USDC token filter');
        failedTests++;
      } else if (incorrectChain.length > 0) {
        console.error('❌ Filter Violated: Found pools that do not match Arbitrum chain filter');
        failedTests++;
      } else {
        console.log('   [PASS] Filtering verification: All returned items strictly match USDC token and Arbitrum chain.');
      }
    }
  } catch (err) {
    console.error(`❌ Test 2 Failed with Exception:`, err.message);
    failedTests++;
  }

  // ----------------------------------------------------
  // TEST 3: Calculate compound projection savings plan
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('📈 Test 3: Simulating calculate_projection (monthlyDeposit: 500, years: 10, goalName: "DeFi Pension")...');
  try {
    const res = await makeRequest(`${BASE_URL}/api/planner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        monthlyDeposit: 500,
        years: 10,
        goalName: 'DeFi Pension'
      }
    });

    if (res.statusCode !== 200) {
      console.error(`❌ Test 3 Failed: Status is ${res.statusCode}`);
      failedTests++;
    } else {
      const { goalName, monthlyDeposit, years, totalDeposited, projectedValue, netGrowth, estimatedApy, foreverCapitalRequired, milestones } = res.body;
      
      if (goalName !== 'DeFi Pension' || monthlyDeposit !== 500 || years !== 10) {
        console.error('❌ Parameter Match Violated: Response parameters do not match requested input');
        failedTests++;
      } else if (!totalDeposited || !projectedValue || !netGrowth || !estimatedApy || !foreverCapitalRequired || !milestones) {
        console.error('❌ Schema Match Violated: Missing critical properties in response');
        failedTests++;
      } else {
        console.log(`✅ Test 3 Passed! Financial calculation validated successfully.`);
        console.log(`   Goal Name:               ${goalName}`);
        console.log(`   Monthly Deposit:         $${monthlyDeposit}/month`);
        console.log(`   Total Deposited:         $${totalDeposited}`);
        console.log(`   Projected Value (DeFi):  $${projectedValue}`);
        console.log(`   Net Accrued Growth:      $${netGrowth}`);
        console.log(`   Estimated APY:           ${estimatedApy}%`);
        console.log(`   Forever Capital Needed:  $${foreverCapitalRequired} (to sustain $${monthlyDeposit}/month in perpetuity)`);
        console.log(`   Milestones Count:        ${milestones.length}`);
        milestones.forEach(m => {
          console.log(`     - ${m.label}: $${m.value}`);
        });
      }
    }
  } catch (err) {
    console.error(`❌ Test 3 Failed with Exception:`, err.message);
    failedTests++;
  }

  // ----------------------------------------------------
  // TEST 4: Calculate savings plan input validation
  // ----------------------------------------------------
  console.log('\n----------------------------------------------------');
  console.log('🛡️ Test 4: Simulating calculate_projection with invalid/missing inputs...');
  try {
    const res = await makeRequest(`${BASE_URL}/api/planner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        monthlyDeposit: -100, // Invalid negative deposit
        years: 5
      }
    });

    if (res.statusCode !== 400) {
      console.error(`❌ Test 4 Failed: Expected HTTP 400 for negative deposit, but received HTTP ${res.statusCode}`);
      failedTests++;
    } else {
      console.log(`✅ Test 4 Passed! Negative amount validation correctly rejected with HTTP 400: "${res.body.message}"`);
    }
  } catch (err) {
    console.error(`❌ Test 4 Failed with Exception:`, err.message);
    failedTests++;
  }

  // Cleanup: shutdown the spawned server
  if (spawnedServer) {
    console.log('\n🛑 Shutting down spawned Control Daemon server process...');
    spawnedServer.kill();
  }

  console.log('\n====================================================');
  if (failedTests === 0) {
    console.log('🏆 All LLM Agent tool integration tests PASSED successfully!');
    process.exit(0);
  } else {
    console.error(`💥 Verification completed with ${failedTests} failed test cases.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal test runner exception:', err);
  process.exit(1);
});
