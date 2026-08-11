#!/usr/bin/env node
/* check-item-inflight.js — spec 263: the in-flight check ran ONCE, at pickup,
 * as prose ("git ls-remote ... or list open PRs") — never re-checked, never
 * executable, never covering PR state at all. Filed after a 2026-08-11 build
 * run picked item 227, ran that prose check clean (`git ls-remote origin
 * 'refs/heads/claude/loop-227'` -> nothing; origin/main did not contain 227),
 * built the whole item across four agents, and only discovered at push time
 * that main had moved and 227 had already landed as PR #425 hours earlier.
 * Roughly half that run's token spend went to already-merged work.
 *
 * The row names the blind spots as a CLASS, not as that one instance:
 *   1. a branch merged-and-deleted leaves NO remote ref, so ls-remote reads
 *      clean for a FINISHED item (leg A alone is blind to this);
 *   2. the base commit a run started from goes stale the moment the run
 *      starts, and nothing re-reads it (why this script runs TWICE per
 *      prompts/build.md — once at pickup, once again immediately before the
 *      first push, each time against a freshly fetched origin/main);
 *   3. PR state is never consulted at all — a closed-and-merged PR (any
 *      state, not just "open") is invisible to a branch-name grep.
 * Three more recorded instances of the same class: row 260's renumber (a
 * concurrent run landed its own 259 while 246 built), PR #419 (open, titled
 * "COLLIDES with a concurrent run on claude/loop-257"), and item 266 itself —
 * caught only because its branch (claude/loop-266) still existed when this
 * item's own pickup ran; had PR #434 been closed and its branch deleted, leg
 * A alone would have read clean.
 *
 * Three legs, each independently sufficient to catch a different blind spot
 * (see specs/263.md "Change" for the exact matching rules):
 *   A — live remote branch refs (git ls-remote --heads origin)
 *   B — commit subjects on a FRESHLY FETCHED origin/main
 *   C — pull requests in ANY state (open, closed, merged)
 *
 * WHY LEG C's DATA IS INJECTED, NOT FETCHED HERE (245's precedent, same as
 * pr-orphan-detector.js): this script has no GitHub credentials and no
 * network access by design — loop scripts stay offline, the calling PROMPT
 * (which has the GitHub MCP tools) fetches PR data and hands it to this
 * script via --prs=<path.json>. That is also why leg C has a distinct
 * UNAVAILABLE state (exit 3) instead of silently reading as clean when
 * --prs is omitted: a check that can't see PR state must say so loudly, not
 * report the same "0 matches" a genuinely-clear leg would.
 *
 * Leg A/B/C git-side data (refs, subjects) IS gathered by this script's own
 * CLI, not injected — unlike PR data, git-side reads need no credentials and
 * pr-orphan-detector.js's own architecture note applies equally well here:
 * "a pure core (exported functions over injected data, no I/O) plus a thin
 * CLI" — the CLI does the (offline, credential-free) git I/O itself so the
 * two callers in prompts/build.md (pickup, pre-first-push) are one command
 * each, not a shell pipeline the prompt has to assemble by hand.
 *
 * BOUNDED-TOKEN MATCHING — corrected 2026-08-11 (verifier round 1 FAIL, see
 * specs/263-notes.md "Verifier round 1 FAIL"): the ORIGINAL leg A rule
 * (below) treated the id as a bounded digit run ANYWHERE in a ref name, which
 * over the real 441 refs on this remote produced 5 false-positive
 * COLLISIONs — every one of them a Claude Code auto-generated session branch
 * (`adjective-name-hexid`) that happens to carry a digit run equal to a real
 * BACKLOG id (e.g. `claude/inspiring-meitner-fs065n` "matching" id 065). That
 * is a false positive that would block a legitimate run — the exact failure
 * mode leg A exists to avoid.
 *
 * Leg A now requires the id to appear as a `loop-<digits>` TOKEN — the ref
 * must contain the literal substring `loop-` immediately followed by a digit
 * run whose NUMERIC value equals the id (`claude/loop-263` and
 * `claude/loop-263-operator` match; `claude/loop-2630` and `claude/loop-1263`
 * do not, since their `loop-<digits>` token numerically differs from the
 * queried id; a zero-padded id like `065` matches both `loop-65` and
 * `loop-065`, since `Number("065") === Number("65")`). A ref that merely
 * carries the id as a bounded digit run elsewhere (not as a `loop-<id>`
 * token) is NOT a match — but it is not silently discarded either: it is
 * collected as a WEAK digit-coincidence candidate and printed with a count,
 * per RAZOR ("no check narrower than the class it guards" cuts both ways —
 * residue must be visible, not hidden). The weak bucket NEVER affects the
 * exit code.
 *
 * Legs B/C are stricter still: the id must LEAD the subject/title. Widened
 * 2026-08-11 (verifier round 1 FAIL #2) from two conventions to three, after
 * the two-convention rule was measured against the REAL subject/PR-title
 * corpus and found to miss real, landed examples — a leading bare digit run
 * followed by ANY punctuation or words (`246 follow-up (docs only): ...`,
 * `224 close-out: ...`, `110 — KPI ...`), not only one followed immediately
 * by `:`. Three forms, applied in order:
 *   F1 — a bounded leading digit run, whatever follows (`(?<!\d)\d+(?!\d)` at
 *        the very start, after optional leading whitespace).
 *   F2 — a conventional-commit scope that IS the id, and nothing else:
 *        `type(<id>):` / `type(<id>)!:`. Round 2 widened this to "the scope
 *        merely STARTS with the id" to catch the real, landed subject
 *        `design(247 world): certificate button skin app-wide ... (#412)`;
 *        round 3 measured what that widening actually accepted and it was
 *        far too much — ANY paren-scope whose content opens with a digit run,
 *        so `fix(2 factor auth): add TOTP support` COLLIDED with the real
 *        BACKLOG row `002`, and `chore(404 page):`, `feat(500ms):`,
 *        `docs(100k):`, `chore(24hr):` are the same shape. A false COLLISION
 *        BLOCKS a legitimate run from pushing, so F2 is back to the strict
 *        rule and the extra-content shape is now handled the way leg A's
 *        digit coincidences already were: as a WEAK, informational candidate
 *        (see weakScopeIdCandidates) that is printed with a count and can
 *        NEVER change the exit code. `design(247 world)` lands there — still
 *        visible to a human reading the check's output, no longer able to
 *        block a push on a guess (see specs/263-notes.md "Round 4").
 *   F3 — strip ONE optional leading conventional-commit prefix (`type:` or
 *        `type(scope):`, e.g. `docs(loop): `) and re-apply F1 to the
 *        remainder (`docs(loop): 118 — GSC ...` -> 118).
 * An id mentioned mid-sentence (`123: fix inspired by 263`), or led by a
 * FREE WORD that is not a conventional-commit prefix and not inside a
 * parenthesised scope (`loop: gate 150/152/153 on their...`, `docs(loop):
 * record 177 CULLED ...`), is deliberately NOT a match — the former is the
 * blind spot's opposite failure (a false positive), the latter is
 * acknowledged, TEST-DERIVED residue (see
 * `test_item_inflight_check.js`'s `KNOWN_LEGBC_RESIDUE`, computed by sweeping
 * the full real corpus against an independent, more permissive extractor at
 * test time — not a hand-maintained list — and specs/263-notes.md "Verifier
 * round 2 FAIL") rather than a special case grafted onto F1–F3.
 * ---------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Matching primitives.
// ---------------------------------------------------------------------------

/**
 * True if `id` (a digit string) appears in `str` as a maximal, bounded digit
 * run — not immediately preceded or followed by another digit. NOTE: this is
 * NOT leg A's matching rule (see refHasLoopIdToken below) — it is only used
 * to detect the WEAK digit-coincidence candidates leg A reports informationally
 * (a ref that happens to carry the id as a bounded digit run somewhere, but
 * not as a `loop-<id>` token).
 */
function boundedIdInString(str, id) {
  const re = new RegExp(`(?<!\\d)${id}(?!\\d)`);
  return re.test(str || '');
}

/**
 * Every `loop-<digits>` token found in `str`, as digit-strings, via a global
 * scan (`claude/loop-263-operator` -> ["263"]; a ref can in principle carry
 * more than one such token).
 */
function extractLoopIdTokens(str) {
  const tokens = [];
  const re = /loop-(\d+)/g;
  let m;
  while ((m = re.exec(str || '')) !== null) {
    tokens.push(m[1]);
  }
  return tokens;
}

/**
 * Leg A's actual matching rule: true if `str` carries a `loop-<digits>`
 * token whose NUMERIC value equals `id` (so a zero-padded id like "065"
 * matches both `loop-65` and `loop-065`). This is deliberately NARROWER than
 * boundedIdInString — see the file header's "verifier round 1 FAIL" note.
 */
function refHasLoopIdToken(str, id) {
  const idNum = Number(id);
  return extractLoopIdTokens(str).some((tok) => Number(tok) === idNum);
}

const LEADING_ID_RE = /^\s*(?<!\d)(\d+)(?!\d)/;
// F2 — STRICT (restored 2026-08-11, verifier round 3 FAIL, see file header):
// the scope must be EXACTLY the id's digit run. This is the only F2 shape
// that counts as a match and can therefore contribute to a COLLISION.
const SCOPE_ID_RE = /^\s*[\w.-]+\((\d+)\)!?\s*:/;
// The round-2 (too wide) shape, kept ONLY to detect WEAK, informational
// scope-lead candidates — a scope whose content starts with the id's digit
// run but carries extra content after it (`design(247 world):`, and equally
// `fix(2 factor auth):`). Never used by extractLeadingId; never affects the
// exit code. See weakScopeIdCandidates.
const SCOPE_LEAD_ID_RE = /^\s*[\w.-]+\((\d+)([^)]*)\)!?\s*:/;
const CONVENTIONAL_PREFIX_RE = /^\s*[\w.-]+(?:\([\w.-]+\))?!?\s*:\s*/;

/**
 * Extracts the id leading a commit subject or PR title, via F1/F2/F3 (see
 * file header). Returns {id, via} or null. Only ever looks at the START of
 * the string (after F3's single optional prefix-strip) — an id appearing
 * later, or led by a free word that is not a conventional-commit prefix, is
 * NOT a lead and must not match (see the file header's "123: fix inspired by
 * 263" and "loop 102: RESOLVED" examples).
 */
function extractLeadingId(text) {
  const s = text || '';
  // F1 — bounded leading digit run, whatever follows.
  let m = s.match(LEADING_ID_RE);
  if (m) return { id: m[1], via: 'leading-id' };
  // F2 — conventional-commit scope that IS the id, exactly ("fix(266):").
  m = s.match(SCOPE_ID_RE);
  if (m) return { id: m[1], via: 'conventional-scope' };
  // F3 — strip ONE optional leading conventional-commit prefix, re-apply F1.
  const prefix = s.match(CONVENTIONAL_PREFIX_RE);
  if (prefix) {
    const rest = s.slice(prefix[0].length);
    const m2 = rest.match(LEADING_ID_RE);
    if (m2) return { id: m2[1], via: 'conventional-prefix+leading-id' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Leg A — remote branch refs.
// ---------------------------------------------------------------------------

/**
 * `refs`: array of {sha, ref} (ref = full ref name, e.g.
 * "refs/heads/claude/loop-263") or plain ref-name strings. Returns every ref
 * whose name carries `id` as a `loop-<id>` TOKEN (see refHasLoopIdToken /
 * file header "verifier round 1 FAIL").
 */
function matchLegA(refs, id) {
  const matches = [];
  for (const r of refs || []) {
    const ref = typeof r === 'string' ? r : r.ref;
    const sha = typeof r === 'string' ? undefined : r.sha;
    if (refHasLoopIdToken(ref, id)) matches.push({ ref, sha });
  }
  return matches;
}

/**
 * Informational-only companion to matchLegA: every ref that carries `id` as
 * a bounded digit run SOMEWHERE (boundedIdInString) but NOT as a genuine
 * `loop-<id>` token (i.e. would have been a false-positive MATCH under the
 * pre-263-fix bounded-anywhere rule). Never affects the exit code — printed
 * so the residue is visible with a count, per RAZOR, rather than silently
 * dropped.
 */
function weakLegACandidates(refs, id) {
  const weak = [];
  for (const r of refs || []) {
    const ref = typeof r === 'string' ? r : r.ref;
    const sha = typeof r === 'string' ? undefined : r.sha;
    if (boundedIdInString(ref, id) && !refHasLoopIdToken(ref, id)) {
      weak.push({ ref, sha });
    }
  }
  return weak;
}

// ---------------------------------------------------------------------------
// Leg B — landed commit subjects on origin/main.
// ---------------------------------------------------------------------------

/**
 * `subjects`: array of {sha, subject} or plain subject strings. Returns
 * every commit whose subject LEADS with `id` in either convention.
 */
function matchLegB(subjects, id) {
  const matches = [];
  for (const s of subjects || []) {
    const subject = typeof s === 'string' ? s : s.subject;
    const sha = typeof s === 'string' ? undefined : s.sha;
    const extracted = extractLeadingId(subject);
    if (extracted && Number(extracted.id) === Number(id)) {
      matches.push({ sha, subject, via: extracted.via });
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Weak scope-lead candidates — legs B and C, informational only.
// ---------------------------------------------------------------------------

/**
 * Informational-only companion to matchLegB/matchLegC, mirroring leg A's weak
 * bucket (weakLegACandidates). Returns every text whose conventional-commit
 * scope STARTS with `id`'s digit run but carries extra content after it
 * (`design(247 world):` for id 247 — a real, landed subject that genuinely
 * names item 247; `fix(2 factor auth):` for id 002 — an ordinary English
 * scope that names no item at all). The two shapes are indistinguishable to
 * a regex, so neither is allowed to force a COLLISION: this bucket NEVER
 * contributes to allMatches / anyMatch / the exit code, it only makes the
 * candidate visible with a count, per RAZOR (residue must be visible, not
 * hidden). Texts that already match strongly (exact `type(<id>):` scope, or
 * F1/F3) are excluded — a strong match is never also reported as weak.
 *
 * `texts`: array of {sha, subject} | {number, title, state} | plain strings.
 */
function weakScopeIdCandidates(texts, id) {
  const weak = [];
  for (const t of texts || []) {
    const text = typeof t === 'string' ? t : t.subject !== undefined ? t.subject : t.title;
    const m = (text || '').match(SCOPE_LEAD_ID_RE);
    if (!m) continue;
    if (m[2].length === 0) continue; // exact-scope shape — that is a STRONG match, not weak
    if (Number(m[1]) !== Number(id)) continue;
    const strong = extractLeadingId(text);
    if (strong && Number(strong.id) === Number(id)) continue;
    const entry = { text, scopeId: m[1] };
    if (typeof t !== 'string') {
      if (t.sha !== undefined) entry.sha = t.sha;
      if (t.number !== undefined) entry.number = t.number;
      if (t.state !== undefined) entry.state = t.state;
    }
    weak.push(entry);
  }
  return weak;
}

// ---------------------------------------------------------------------------
// Leg C — pull requests, any state.
// ---------------------------------------------------------------------------

/**
 * `prs`: array of {number, title, state, ...} (extra fields ignored) as
 * returned by the GitHub MCP search_pull_requests/list_pull_requests tools.
 * Deliberately state-blind: open, closed and merged PRs are all in scope —
 * that is the entire point of leg C over leg A (a merged-and-deleted branch
 * has no ref, but its PR record persists in any state).
 */
function matchLegC(prs, id) {
  const matches = [];
  for (const pr of prs || []) {
    const title = pr.title || '';
    const extracted = extractLeadingId(title);
    if (extracted && Number(extracted.id) === Number(id)) {
      matches.push({ number: pr.number, title, state: pr.state, via: extracted.via });
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Combine — the pure core the CLI and the test both drive.
// ---------------------------------------------------------------------------

/**
 * `prs` omitted/undefined (as opposed to an empty array) means leg C did not
 * run at all — the UNAVAILABLE state the spec requires to be loud rather
 * than silently clean. Pass `[]` explicitly for "leg C ran and found
 * nothing".
 */
function checkInFlight({ id, refs, subjects, prs }) {
  const idStr = String(id);
  const legAMatches = matchLegA(refs, idStr);
  const legAWeak = weakLegACandidates(refs, idStr);
  const legBMatches = matchLegB(subjects, idStr);
  const legBWeak = weakScopeIdCandidates(subjects, idStr);
  const legCAvailable = Array.isArray(prs);
  const legCMatches = legCAvailable ? matchLegC(prs, idStr) : [];
  const legCWeak = legCAvailable ? weakScopeIdCandidates(prs, idStr) : [];

  const allMatches = [
    ...legAMatches.map((m) => ({ leg: 'A', ...m })),
    ...legBMatches.map((m) => ({ leg: 'B', ...m })),
    ...legCMatches.map((m) => ({ leg: 'C', ...m })),
  ];

  return {
    id: idStr,
    // legA.weak / legB.weak / legC.weak are informational only — they NEVER
    // contribute to allMatches / anyMatch / the exit code (see the
    // weakLegACandidates / weakScopeIdCandidates doc comments).
    legA: { available: true, matches: legAMatches, weak: legAWeak },
    legB: { available: true, matches: legBMatches, weak: legBWeak },
    legC: { available: legCAvailable, matches: legCMatches, weak: legCWeak },
    allMatches,
    anyMatch: allMatches.length > 0,
    anyUnavailable: !legCAvailable,
  };
}

/**
 * 0 CLEAR / 1 COLLISION / 3 CLEAR-WITH-UNAVAILABLE-LEG. (2 — usage/env error
 * — is a CLI-only concern, decided before checkInFlight() ever runs, so it
 * has no representation here.) A match always wins over an unavailable leg:
 * COLLISION is reported even when leg C could not run, because legs A/B are
 * sufficient on their own to prove a collision.
 */
function computeExitCode(result) {
  if (result.anyMatch) return 1;
  if (result.anyUnavailable) return 3;
  return 0;
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper. Gathers git-side data itself (no credentials needed);
// takes GitHub-side data injected via --prs=<path.json|-> (see file header).
// ---------------------------------------------------------------------------

function parseGitRefs(lsRemoteOutput) {
  return (lsRemoteOutput || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      return { sha: line.slice(0, tab), ref: line.slice(tab + 1) };
    });
}

function parseGitSubjects(logOutput) {
  return (logOutput || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
}

function usage() {
  console.error(
    'Usage: node check-item-inflight.js <id> [--prs=<path.json>|-] [--base=<sha>] [--no-fetch]\n' +
      '  <id>          BACKLOG item id (digits only)\n' +
      '  --prs=PATH    JSON array of PR records ({number,title,state,...}); "-" reads stdin.\n' +
      '                Omitted -> leg C is UNAVAILABLE (exit code will never be 0).\n' +
      '  --base=SHA    informational only: reports how far origin/main has moved since SHA.\n' +
      '  --no-fetch    skip "git fetch origin main" (tests only — never skip this in the loop).'
  );
}

function runCli(argv) {
  const positional = argv.find((a) => !a.startsWith('--'));
  if (!positional || !/^\d+$/.test(positional)) {
    usage();
    process.exit(2);
  }
  const id = positional;
  const prsArg = argv.find((a) => a.startsWith('--prs='));
  const baseArg = argv.find((a) => a.startsWith('--base='));
  const noFetch = argv.includes('--no-fetch');

  let refsOut;
  let subjectsOut;
  try {
    if (!noFetch) {
      execFileSync('git', ['fetch', 'origin', 'main'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    }
    refsOut = execFileSync('git', ['ls-remote', '--heads', 'origin'], { cwd: ROOT, encoding: 'utf8' });
    subjectsOut = execFileSync('git', ['log', '--format=%H%x09%s', 'origin/main'], { cwd: ROOT, encoding: 'utf8' });
  } catch (err) {
    console.error(`check-item-inflight: git command failed: ${err.message}`);
    process.exit(2);
  }

  let prs; // stays undefined ("leg C unavailable") if --prs was never passed
  if (prsArg) {
    const prsPath = prsArg.slice('--prs='.length);
    try {
      const raw = prsPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(prsPath, 'utf8');
      prs = JSON.parse(raw);
      if (!Array.isArray(prs)) throw new Error('--prs data must be a JSON array');
    } catch (err) {
      console.error(`check-item-inflight: failed to read/parse --prs data: ${err.message}`);
      process.exit(2);
    }
  }

  const refs = parseGitRefs(refsOut);
  const subjects = parseGitSubjects(subjectsOut);
  const result = checkInFlight({ id, refs, subjects, prs });

  console.log(`check-item-inflight: id=${id}`);
  console.log(`  leg A (remote branch refs, ${refs.length} scanned): ${result.legA.matches.length} match(es)`);
  for (const m of result.legA.matches) {
    console.log(`    MATCH  ${m.ref}${m.sha ? '  @ ' + m.sha.slice(0, 10) : ''}`);
  }
  if (result.legA.weak.length > 0) {
    console.log(
      `  leg A weak digit-coincidence refs (NOT counted as matches): ${result.legA.weak.length} — ` +
        result.legA.weak.map((w) => w.ref).join(', ')
    );
  }
  console.log(`  leg B (origin/main commit subjects, ${subjects.length} scanned): ${result.legB.matches.length} match(es)`);
  for (const m of result.legB.matches) {
    console.log(`    MATCH  ${m.sha ? m.sha.slice(0, 10) : '?'}  ${m.subject}`);
  }
  if (result.legB.weak.length > 0) {
    console.log(
      `  leg B weak scope-lead candidates (NOT counted as matches): ${result.legB.weak.length} — ` +
        result.legB.weak.map((w) => `${w.sha ? w.sha.slice(0, 10) + ' ' : ''}${w.text}`).join(' | ')
    );
  }
  if (result.legC.available) {
    console.log(`  leg C (pull requests, any state, ${prs.length} scanned): ${result.legC.matches.length} match(es)`);
    for (const m of result.legC.matches) {
      console.log(`    MATCH  #${m.number} [${m.state}]  ${m.title}`);
    }
    if (result.legC.weak.length > 0) {
      console.log(
        `  leg C weak scope-lead candidates (NOT counted as matches): ${result.legC.weak.length} — ` +
          result.legC.weak.map((w) => `${w.number !== undefined ? '#' + w.number + ' ' : ''}${w.text}`).join(' | ')
      );
    }
  } else {
    console.log('  leg C (pull requests, any state): UNAVAILABLE — no --prs data supplied; this leg did not run.');
  }

  if (baseArg) {
    const baseSha = baseArg.slice('--base='.length);
    try {
      const countOut = execFileSync('git', ['rev-list', '--count', `${baseSha}..origin/main`], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim();
      const moved = parseInt(countOut, 10);
      console.log(
        `  base drift (informational, never affects exit code): origin/main is ${moved} commit(s) ahead of ${baseSha}` +
          (moved > 0 ? ' — re-read before trusting anything computed from that base.' : '')
      );
    } catch (err) {
      console.log(`  base drift: could not compute (${err.message})`);
    }
  }

  const exitCode = computeExitCode(result);
  const verdict =
    exitCode === 0 ? 'CLEAR' : exitCode === 1 ? 'COLLISION' : exitCode === 3 ? 'CLEAR-WITH-UNAVAILABLE-LEG' : 'ERROR';
  console.log(`\nVERDICT: ${verdict} (exit ${exitCode})`);
  process.exit(exitCode);
}

if (require.main === module) {
  runCli(process.argv.slice(2));
}

module.exports = {
  boundedIdInString,
  extractLoopIdTokens,
  refHasLoopIdToken,
  extractLeadingId,
  matchLegA,
  weakLegACandidates,
  weakScopeIdCandidates,
  matchLegB,
  matchLegC,
  checkInFlight,
  computeExitCode,
  parseGitRefs,
  parseGitSubjects,
  ROOT,
};
