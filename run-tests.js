#!/usr/bin/env node
/* run-tests.js — spec 163: an observable `npm test`.
 *
 * package.json's `test:serial` script is the ORIGINAL 94-step `&&` chain,
 * verbatim, untouched. This runner PARSES that string for its file list
 * (never a second hardcoded copy — see parseFileList()) and then:
 *
 *   1. Preflights `node_modules` — a fresh clone gets ONE actionable line and
 *      exit 2, not 94 stack traces (item 149's failure mode, generalised).
 *   2. Classifies every file into a `plain` or `browser` lane via a
 *      TRANSITIVE, cycle-safe scan of local (`./`-relative) requires: a file
 *      is `browser` if IT, or any local module it requires (recursively),
 *      mentions the string "playwright". This is why test_seo_surface_audit.js
 *      and test_audit_prescan.js land in `browser` despite not containing
 *      the word themselves — they require ./audit-app.js, which does.
 *   3. Runs every selected file in its own child process. A failure NEVER
 *      aborts the run — every file gets a chance, every file gets a result.
 *   4. Reports PASS/FAIL/TIMEOUT + duration per file, a summary, and the
 *      tail of output for anything that didn't pass. Exit code is non-zero
 *      iff anything failed or timed out.
 *
 * No new dependency — child_process, fs, path, os only.
 *
 * Usage:
 *   node run-tests.js [--lane=plain|browser|all] [--timeout=<seconds>]
 *                      [--jobs=<n>] [--only=file1.js,file2.js] [--list]
 *                      [--json=<path>]
 *
 *   --timeout default is LANE-AWARE, not a single constant: the plain lane
 *   defaults to 120s, the browser lane to 600s (real-Chromium files like
 *   test_search.js legitimately need ~550s standalone — see
 *   product-loop-kit/specs/163-notes.md's "Post-verification change" section).
 *   An explicit --timeout=<seconds> overrides BOTH lanes, exactly as before.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const NODE_MODULES_PATH = path.join(ROOT, 'node_modules');
const SERIAL_SCRIPT_NAME = 'test:serial';

const NO_DEPS_MESSAGE = 'dependencies not installed — run `npm ci`';

// Lane-aware default per-file timeouts (seconds). An explicit --timeout=<s>
// on the command line overrides BOTH lanes; these are only the defaults when
// no override is given — see resolveTimeout().
const DEFAULT_TIMEOUT_PLAIN = 120;
const DEFAULT_TIMEOUT_BROWSER = 600; // covers test_search.js's documented ~550s need, with headroom.

// ---------------------------------------------------------------------------
// 1. Single source of truth for the file list: parse test:serial's `&&` chain.
// ---------------------------------------------------------------------------

/**
 * Parses a `node <file>.js && node <file2>.js && ...` chain string into an
 * ordered array of file names. Throws if any step isn't a bare `node <file>`
 * invocation, so a malformed chain fails loudly rather than silently
 * dropping a file.
 */
function parseFileList(chain) {
  const steps = chain.split('&&').map(s => s.trim()).filter(Boolean);
  return steps.map(step => {
    const m = step.match(/^node\s+(\S+\.js)$/);
    if (!m) {
      throw new Error(`run-tests.js: could not parse test:serial step as "node <file>.js": "${step}"`);
    }
    return m[1];
  });
}

function readSerialChain() {
  const pkgRaw = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const chain = pkg.scripts && pkg.scripts[SERIAL_SCRIPT_NAME];
  if (!chain) {
    throw new Error(`run-tests.js: package.json has no "${SERIAL_SCRIPT_NAME}" script to parse.`);
  }
  return chain;
}

// ---------------------------------------------------------------------------
// 2. Lane classification: transitive, cycle-safe scan of local requires.
// ---------------------------------------------------------------------------

const LOCAL_REQUIRE_RE = /require\(\s*['"](\.[^'"]*)['"]\s*\)/g;
const MAX_TRANSITIVE_DEPTH = 20;

function resolveLocalRequire(fromDir, spec) {
  const base = path.resolve(fromDir, spec);
  const candidates = [base, base + '.js', path.join(base, 'index.js')];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (_) { /* not this candidate */ }
  }
  return null;
}

function extractLocalRequires(content, fromDir) {
  const out = [];
  let m;
  LOCAL_REQUIRE_RE.lastIndex = 0;
  while ((m = LOCAL_REQUIRE_RE.exec(content))) {
    const resolved = resolveLocalRequire(fromDir, m[1]);
    if (resolved) out.push(resolved);
  }
  return out;
}

/**
 * True if `absPath` (or any local module it transitively requires) mentions
 * "playwright". Depth-limited and cycle-safe: an `inProgress` set guards
 * against infinite recursion on circular requires, and a shared `cache`
 * memoizes results across files so the whole classification pass is cheap.
 */
function mentionsPlaywrightTransitively(absPath, cache, inProgress, depth) {
  if (cache.has(absPath)) return cache.get(absPath);
  if (depth > MAX_TRANSITIVE_DEPTH || inProgress.has(absPath)) return false;

  inProgress.add(absPath);
  let content;
  try {
    content = fs.readFileSync(absPath, 'utf8');
  } catch (_) {
    inProgress.delete(absPath);
    cache.set(absPath, false);
    return false;
  }

  if (content.includes('playwright')) {
    inProgress.delete(absPath);
    cache.set(absPath, true);
    return true;
  }

  const deps = extractLocalRequires(content, path.dirname(absPath));
  let result = false;
  for (const dep of deps) {
    if (mentionsPlaywrightTransitively(dep, cache, inProgress, depth + 1)) {
      result = true;
      break;
    }
  }

  inProgress.delete(absPath);
  cache.set(absPath, result);
  return result;
}

function classifyLane(fileName, cache) {
  const absPath = path.join(ROOT, fileName);
  const isBrowser = mentionsPlaywrightTransitively(absPath, cache, new Set(), 0);
  return isBrowser ? 'browser' : 'plain';
}

// ---------------------------------------------------------------------------
// --only validation: catch a typo before anything runs (spec 166).
// ---------------------------------------------------------------------------

/**
 * Returns the entries of `only` that are not present in `allFiles`, in input
 * order, with duplicates collapsed. Pure — no I/O. `only` may be null/undefined
 * (returns []).
 */
function unknownOnlyNames(only, allFiles) {
  if (!only) return [];
  const known = new Set(allFiles);
  const seen = new Set();
  const unknown = [];
  for (const name of only) {
    if (!known.has(name) && !seen.has(name)) {
      seen.add(name);
      unknown.push(name);
    }
  }
  return unknown;
}

// ---------------------------------------------------------------------------
// CLI argument parsing.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { lane: 'all', timeout: null, jobs: null, list: false, json: null, only: null };
  for (const raw of argv) {
    if (raw === '--list') { args.list = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) {
      throw new Error(`run-tests.js: unrecognized argument "${raw}"`);
    }
    const [, key, value] = m;
    if (key === 'lane') {
      if (!['plain', 'browser', 'all'].includes(value)) {
        throw new Error(`run-tests.js: --lane must be plain|browser|all, got "${value}"`);
      }
      args.lane = value;
    } else if (key === 'timeout') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`run-tests.js: --timeout must be a positive number, got "${value}"`);
      args.timeout = n;
    } else if (key === 'jobs') {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`run-tests.js: --jobs must be a positive number, got "${value}"`);
      args.jobs = Math.floor(n);
    } else if (key === 'json') {
      args.json = value;
    } else if (key === 'only') {
      args.only = value.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      throw new Error(`run-tests.js: unrecognized argument "${raw}"`);
    }
  }
  return args;
}

function defaultJobsFor(lane, jobsOverride) {
  if (lane === 'browser') return 1; // forced — fixed-port real-Chromium files must serialize.
  const cpuBased = Math.max(1, Math.min(4, os.cpus().length - 1));
  return jobsOverride != null ? jobsOverride : cpuBased;
}

/**
 * Resolves the effective per-file timeout (seconds) for a lane. An explicit
 * --timeout=<seconds> (timeoutOverride, non-null) wins for either lane,
 * unchanged from before this default became lane-aware. With no override,
 * the browser lane defaults to DEFAULT_TIMEOUT_BROWSER (600s) and every
 * other lane defaults to DEFAULT_TIMEOUT_PLAIN (120s).
 */
function resolveTimeout(lane, timeoutOverride) {
  if (timeoutOverride != null) return timeoutOverride;
  return lane === 'browser' ? DEFAULT_TIMEOUT_BROWSER : DEFAULT_TIMEOUT_PLAIN;
}

// ---------------------------------------------------------------------------
// Execution.
// ---------------------------------------------------------------------------

function runFile(fileName, timeoutSec) {
  return new Promise(resolve => {
    const start = Date.now();
    const child = spawn(process.execPath, [fileName], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutSec * 1000);

    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });

    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        file: fileName,
        status: 'FAIL',
        durationMs: Date.now() - start,
        exitCode: null,
        output: output + `\n[run-tests.js] failed to spawn: ${err.message}`,
      });
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      let status;
      if (timedOut) status = 'TIMEOUT';
      else if (code === 0) status = 'PASS';
      else status = 'FAIL';
      resolve({ file: fileName, status, durationMs, exitCode: code, signal, output });
    });
  });
}

async function runQueue(entries, jobs, timeoutSec, onResult) {
  let idx = 0;
  async function worker() {
    while (idx < entries.length) {
      const i = idx++;
      const entry = entries[i];
      const result = await runFile(entry.file, timeoutSec);
      onResult(result);
    }
  }
  const workerCount = Math.max(1, Math.min(jobs, entries.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
}

function lastLines(text, n) {
  const lines = text.split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  const chain = readSerialChain();
  const allFiles = parseFileList(chain);

  // Validate --only against the resolved file list BEFORE --list and BEFORE
  // the node_modules preflight — a typo is an operator error a fresh clone
  // must still be told about, and --list is exactly where someone checks a
  // name. See spec 166.
  if (args.only) {
    const unknown = unknownOnlyNames(args.only, allFiles);
    if (unknown.length) {
      console.error(`run-tests.js: --only names ${unknown.length} file(s) not found in the test:serial chain: ${unknown.join(', ')} — run with --list to see valid file names.`);
      process.exit(2);
    }
  }

  const cache = new Map();
  const classified = allFiles.map(file => ({ file, lane: classifyLane(file, cache) }));

  // --list is pure introspection: no node_modules requirement, no execution.
  if (args.list) {
    let entries = classified;
    if (args.lane !== 'all') entries = entries.filter(e => e.lane === args.lane);
    if (args.only) entries = entries.filter(e => args.only.includes(e.file));
    for (const e of entries) console.log(`${e.file}\t${e.lane}`);
    const planeCount = classified.filter(e => e.lane === 'plain').length;
    const browserCount = classified.filter(e => e.lane === 'browser').length;
    console.log(`\nTOTAL files=${classified.length} plain=${planeCount} browser=${browserCount} listed=${entries.length}`);
    process.exit(0);
  }

  // Preflight: node_modules must exist before any test file is executed.
  if (!fs.existsSync(NODE_MODULES_PATH)) {
    console.error(NO_DEPS_MESSAGE);
    process.exit(2);
  }

  let selected = classified;
  if (args.lane !== 'all') selected = selected.filter(e => e.lane === args.lane);
  if (args.only) {
    const wanted = new Set(args.only);
    selected = selected.filter(e => wanted.has(e.file));
  }

  // Zero files selected in RUN mode is never a pass — catches the
  // legitimate-names-wrong-lane case (e.g. --lane=plain --only=<browser
  // file>) that name validation alone cannot. See spec 166.
  if (selected.length === 0) {
    console.error(`run-tests.js: 0 file(s) selected (lane=${args.lane}${args.only ? `, only=${args.only.join(',')}` : ''}) — a zero-file run is not a pass.`);
    process.exit(2);
  }

  const plainEntries = selected.filter(e => e.lane === 'plain');
  const browserEntries = selected.filter(e => e.lane === 'browser');

  const plainJobs = defaultJobsFor('plain', args.jobs);
  const browserJobs = defaultJobsFor('browser', args.jobs); // always 1, forced.

  const plainTimeout = resolveTimeout('plain', args.timeout);
  const browserTimeout = resolveTimeout('browser', args.timeout);

  console.log(`run-tests.js: ${selected.length} file(s) selected (lane=${args.lane}, plain=${plainEntries.length}, browser=${browserEntries.length}, timeout=plain:${plainTimeout}s/browser:${browserTimeout}s, plain-jobs=${plainJobs}, browser-jobs=${browserJobs})\n`);

  const resultsByFile = new Map();

  function onResult(result) {
    resultsByFile.set(result.file, result);
    const secs = (result.durationMs / 1000).toFixed(2);
    console.log(`${result.status.padEnd(7)} ${secs.padStart(8)}s  ${result.file}`);
  }

  await Promise.all([
    runQueue(plainEntries, plainJobs, plainTimeout, onResult),
    runQueue(browserEntries, browserJobs, browserTimeout, onResult),
  ]);

  // Print results in the ORIGINAL file-list order, regardless of completion order.
  const orderedResults = selected.map(e => resultsByFile.get(e.file));

  let pass = 0, fail = 0, timeout = 0;
  for (const r of orderedResults) {
    if (r.status === 'PASS') pass++;
    else if (r.status === 'TIMEOUT') timeout++;
    else fail++;
  }

  console.log('\n=== SUMMARY (original chain order) ===');
  for (const r of orderedResults) {
    console.log(`RESULT ${r.status}\t${r.file}\t${r.durationMs}ms`);
  }

  const failing = orderedResults.filter(r => r.status !== 'PASS');
  if (failing.length) {
    console.log('\n=== FAILING / TIMED OUT — last output ===');
    for (const r of failing) {
      console.log(`\n--- ${r.file} (${r.status}) ---`);
      console.log(lastLines(r.output, 20).trim() || '(no output)');
    }
  }

  console.log(`\nTOTAL pass=${pass} fail=${fail} timeout=${timeout} total=${orderedResults.length}`);

  if (args.json) {
    const jsonPath = path.resolve(ROOT, args.json);
    const payload = {
      lane: args.lane,
      // Lane-aware: a single flat number would silently misreport whichever
      // lane didn't use it. timeoutOverrideSec is the raw --timeout flag (or
      // null if not given); timeoutSec is what each lane actually ran with.
      timeoutOverrideSec: args.timeout,
      timeoutSec: { plain: plainTimeout, browser: browserTimeout },
      plainJobs,
      browserJobs,
      summary: { pass, fail, timeout, total: orderedResults.length },
      results: orderedResults.map(r => ({
        file: r.file,
        lane: classified.find(e => e.file === r.file).lane,
        status: r.status,
        durationMs: r.durationMs,
        exitCode: r.exitCode,
      })),
    };
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    console.log(`\nJSON report written to ${jsonPath}`);
  }

  process.exit(fail > 0 || timeout > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('run-tests.js: unexpected error:', err);
    process.exit(1);
  });
}

module.exports = {
  parseFileList,
  readSerialChain,
  classifyLane,
  unknownOnlyNames,
  mentionsPlaywrightTransitively,
  extractLocalRequires,
  resolveLocalRequire,
  parseArgs,
  defaultJobsFor,
  resolveTimeout,
  DEFAULT_TIMEOUT_PLAIN,
  DEFAULT_TIMEOUT_BROWSER,
  NO_DEPS_MESSAGE,
  ROOT,
  NODE_MODULES_PATH,
};
