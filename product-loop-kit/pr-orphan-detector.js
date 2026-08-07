#!/usr/bin/env node
/* pr-orphan-detector.js — spec 245: a loop-opened PR can end in no terminal
 * state at all — finished work, no verdict, no owner, an ID that goes stale
 * while it waits (#399 / item 239 is the positive control this item was
 * filed against).
 *
 * Two independent legs, both pure/offline — no live GitHub call lives here.
 * The heartbeat prompt (prompts/heartbeat.md) is responsible for fetching
 * open PRs (list_pull_requests) and BACKLOG.md, then feeding that data into
 * this module or its CLI. That's the "live-GitHub path is injectable" the
 * spec's acceptance criteria requires.
 *
 * Leg A — classifyAll(): open PR -> {merged, PARKED, BLOCKED, human-gated, ORPHAN}.
 * Leg B — computeNextId()/detectIdCollisions(): the next BACKLOG id must
 *         account for ids already claimed by open PR branches, not just
 *         main's own max (loop-container-contention.md's existing rule,
 *         made executable instead of relying on someone remembering it).
 *
 * ---------------------------------------------------------------------
 * On "the marker set is derived from BACKLOG.md's own legend" (item 212's
 * rule: guard the DEFINING mechanism, not a resemblance of it):
 *
 * parseStatusLegend() below parses the literal marker vocabulary out of
 * BACKLOG.md's own "# Statuses: ..." comment block (lines 2-6) at run/test
 * time, rather than a hand-typed copy that could silently drift when the
 * legend changes (exactly what happened to item 212's own param list, and
 * exactly what happened to this legend itself on 2026-08-04 when GATED was
 * added). MARKER_CLASS_MAP's keys are asserted to set-equal that parsed
 * vocabulary, BOTH directions, in test_pr_orphan_detector.js — so a status
 * added to the legend without updating this map fails the test loudly
 * instead of being silently misclassified.
 *
 * MATCHING RULE — the FIRST WORD of the Status cell, not "anywhere in the
 * cell": build.md step 7 writes status as "item → SHIPPED (or IN_REVIEW /
 * PARKED / BLOCKED)" — the marker leads the cell, prose follows. Verified
 * against every real open PR's BACKLOG row during a live re-check (2026-08-06):
 * row 239 (#399's own row) reads "IN_REVIEW — ORPHANED, needs a decision...
 * not PARKED, not BLOCKED, no owner." A whole-cell scan for `\bPARKED\b`
 * matches that negated mention and misclassifies the item's own positive
 * control as PARKED — the UNSAFE direction (hides the orphan). Restricting
 * the match to the cell's first word sidesteps negation entirely (the real
 * marker is never buried mid-sentence in this repo's own writing
 * convention) without needing a hand-typed negation-word list, which would
 * just be a narrower, more fragile version of the same whole-text-scan
 * mistake.
 *
 * KNOWN GAP, stated with a number (RAZOR.md "class rule" — say so, don't
 * pretend the narrow fix is the general one): the legend has no marker word
 * for "the code is done and verified, but MERGING it needs a specific human
 * action" (a rail relaxation, a screenshot review, a NORTH_STAR edit). Of
 * the 4 real PRs item 245's own evidence called "human-gated" (#393, #332,
 * #309, #316), NONE currently classify as such under this version — a
 * generic "scan for the word 'human'" fallback was tried and DISCARDED
 * during build: measured against the live PR bodies (not guessed), the
 * word "human" appears in 8 of 12 real open PRs, including — decisively —
 * PR #399 itself ("...in the human's screenshot, 3 of 9 visible rows..."),
 * which flipped the tool's own positive control from the required ORPHAN to
 * a false human-gated. A heuristic that breaks its own motivating case is
 * worse than no heuristic (RAZOR: a check aimed at a resemblance of the
 * real signal is strictly worse than no check — it launders the gap as
 * coverage). So today, `human-gated` is reachable ONLY via a BACKLOG row
 * whose first word is CULLED (an already-anomalous shape — a PR left open
 * after the human said no). The 4 real human-gated PRs fall through to
 * ORPHAN instead — the safe-but-noisy direction (more visibility than
 * strictly needed, never a hidden stuck PR). Closing this class for real
 * needs either a new BACKLOG legend status for "awaiting human merge
 * action" (structured, no heuristic needed) or a GitHub-native signal
 * (e.g. a requested-reviewer / label) — both out of scope here; ticketed
 * as follow-on work in specs/245-notes.md, not silently solved.
 *
 * WHY ORPHAN COMES OUT LARGE ON LIVE DATA, AND WHY THAT'S CORRECT: the
 * legend's own order — "READY → IN_PROGRESS → IN_REVIEW → SHIPPED
 * (measuring) → DONE" — makes IN_REVIEW a PIPELINE STAGE, not a terminal
 * one; the only legend-sanctioned way out of it is SHIPPED/DONE. So ANY
 * open PR whose BACKLOG row is still IN_REVIEW — whether nobody has looked
 * yet, or (row 225/#393's real, live shape) the human explicitly rejected
 * it and said "round 3 required, do NOT merge as-is" — has, by the
 * legend's own construction, no recorded marker saying someone is on it.
 * Run against the real, live 12-open-PR population on 2026-08-06, this
 * version reports 9 ORPHAN, not the 1 (#399) spec 245's own evidence
 * anticipated — verified deliberately, not suppressed to make a smaller
 * number: several of those 9 (#396, #331, #322) have BACKLOG rows that
 * already progressed to SHIPPED via a DIFFERENT branch since their PR
 * opened (their own titles say so — e.g. #396: "defers to claude/loop-231.
 * Do not merge as-is"), meaning the open PR is genuinely stale and safe to
 * close; others (#332, #316) had their id renumbered out of BACKLOG
 * entirely; #393 is a real, currently-unresolved human-review-failed PR.
 * Every one of those is a legitimate thing for a human/heartbeat to see
 * and triage — under-reporting them by inventing a narrower "human-gated"
 * bucket this tool cannot reliably distinguish from plain-stuck would be
 * the unsafe direction (RAZOR: surface the weak/broad signal honestly
 * rather than a falsely-reassuring narrow one).
 * ---------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BACKLOG_PATH = path.join(ROOT, 'BACKLOG.md');

// ---------------------------------------------------------------------------
// Leg A — the marker vocabulary, parsed from BACKLOG.md's own legend.
// ---------------------------------------------------------------------------

const LEGEND_MARKER_RE = /\b[A-Z][A-Z_]+\b/g;

/**
 * Parses the literal set of status marker words out of BACKLOG.md's
 * "# Statuses: ..." comment block (the line starting with "# Statuses:"
 * plus every immediately-following line that also starts with "#"),
 * de-duplicated, in first-seen order. Never reads any other part of the
 * file — a status word appearing inside a table row's prose (e.g. a PR
 * title quoted in a Status cell) must not leak into the legend.
 */
function parseStatusLegend(backlogMarkdown) {
  const lines = backlogMarkdown.split('\n');
  const startIdx = lines.findIndex((l) => l.trim().startsWith('# Statuses:'));
  if (startIdx === -1) {
    throw new Error('pr-orphan-detector: BACKLOG.md has no "# Statuses:" legend line to parse.');
  }
  const block = [];
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (i > startIdx && !trimmed.startsWith('#')) break;
    block.push(lines[i]);
  }
  const text = block.join('\n');
  const seen = new Set();
  const ordered = [];
  let m;
  LEGEND_MARKER_RE.lastIndex = 0;
  while ((m = LEGEND_MARKER_RE.exec(text))) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      ordered.push(m[0]);
    }
  }
  return ordered;
}

// Explicit mapping from every legend marker to the PR-classification bucket
// it implies, or null if that status carries no PR-terminal signal (a
// mid-pipeline stage, or a self-resolving gate — see NORTH_STAR's GATED
// definition: "the heartbeat re-checks every gate each tick... never pings
// the human"). Keys are asserted set-equal to parseStatusLegend()'s output,
// both directions, in the test file — see the header comment above.
const MARKER_CLASS_MAP = {
  READY: null,
  IN_PROGRESS: null,
  IN_REVIEW: null, // mid-pipeline ("build finished, awaiting merge") — NOT itself a recorded terminal/human-gate marker (item 239/#399's own row is IN_REVIEW and is the ORPHAN positive control).
  SHIPPED: null,
  DONE: null,
  PARKED: 'PARKED',
  BLOCKED: 'BLOCKED',
  CULLED: 'human-gated', // "human said no" on an item whose PR is still open is anomalous; surfacing it beats silently calling it ORPHAN.
  GATED: null,
};

/**
 * Splits one markdown table row on `|`, treating a backslash-escaped `\|`
 * as a literal pipe character rather than a column delimiter — the
 * convention BACKLOG.md's own rows actually use for inline code containing
 * `||` (verified live: row 166's Title cell contains `` `pool.url \|\| meta.baseUrl` ``;
 * a naive `line.split('|')` desyncs every following column on that row,
 * landing `cells[4]` on a Title-cell fragment instead of the real Status
 * text — found by the verifier against the live file, not hypothetical).
 */
function splitMarkdownRow(line) {
  const cells = [];
  let current = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (line[i] === '|') {
      cells.push(current);
      current = '';
      continue;
    }
    current += line[i];
  }
  cells.push(current);
  return cells;
}

/**
 * Parses every `| <id> | ... | <status> | ... |` BACKLOG.md table row into
 * a Map<string id, string status text>. Rows whose id cell isn't a bare
 * integer (composite/range ids, deleted rows) are skipped, not guessed at.
 */
function parseBacklogStatusById(backlogMarkdown) {
  const byId = new Map();
  for (const line of backlogMarkdown.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|/);
    if (!m) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length < 5) continue;
    byId.set(m[1], cells[4].trim());
  }
  return byId;
}

/**
 * Extracts a BACKLOG item id from a PR record: the leading "<id>: " in the
 * title first (the loop's own convention), then the "claude/loop-<id>"
 * branch-name pattern as a fallback. Returns null if neither matches (e.g.
 * #309's multi-item docs PR on a non-standard branch name) — a PR with no
 * resolvable id has no BACKLOG row to consult, which classifyPR() treats
 * as "no structured signal", not as a crash.
 */
function extractItemId(pr) {
  const title = pr.title || '';
  const titleMatch = title.match(/^\s*(\d+)\s*:/);
  if (titleMatch) return titleMatch[1];
  const ref = (pr.headRef || (pr.head && pr.head.ref) || '');
  const refMatch = ref.match(/claude\/loop-(\d+)/);
  if (refMatch) return refMatch[1];
  return null;
}

/**
 * Returns the leading legend-shaped word of a BACKLOG Status cell (e.g.
 * "PARKED" from "PARKED (3-attempt budget spent)..."), or null if the cell
 * doesn't start with one. Strips leading markdown emphasis (`**`) first, in
 * case a row ever bolds its own leading status word. Only the FIRST word is
 * considered — see this file's header comment for why a whole-cell scan is
 * unsafe (it matches negated/quoted/other-item mentions deep in the prose).
 */
function leadingStatusWord(statusText) {
  const stripped = statusText.trim().replace(/^\*+/, '');
  const m = stripped.match(/^([A-Z][A-Z_]*)\b/);
  return m ? m[1] : null;
}

/**
 * Finds the legend marker that LEADS `statusText`, if it has a PR-terminal
 * class in MARKER_CLASS_MAP. Returns null if the cell's leading word isn't
 * a legend marker, or maps to null (no PR-terminal meaning).
 */
function findLegendMarkerInText(statusText) {
  const word = leadingStatusWord(statusText);
  if (!word || !Object.prototype.hasOwnProperty.call(MARKER_CLASS_MAP, word)) return null;
  const cls = MARKER_CLASS_MAP[word];
  if (cls === null || cls === undefined) return null;
  return { marker: word, cls };
}

/**
 * Classifies one PR into {merged, PARKED, BLOCKED, human-gated, ORPHAN}.
 * `backlogText` is BACKLOG.md's raw markdown (already read/fetched by the
 * caller — never fetched here). Returns { class, reason }.
 *
 * pr shape: { number, title, body, state: 'open'|'closed', merged: bool,
 *             headRef? or head: {ref} }
 */
function classifyPR(pr, backlogText) {
  if (pr.merged) {
    return { class: 'merged', reason: 'PR is merged.' };
  }
  if (pr.state !== 'open') {
    return { class: 'closed', reason: 'PR is closed without merging — outside the open-PR orphan population.' };
  }

  const statusById = parseBacklogStatusById(backlogText);
  const id = extractItemId(pr);

  if (id !== null && statusById.has(id)) {
    const statusText = statusById.get(id);
    const found = findLegendMarkerInText(statusText);
    if (found) {
      return {
        class: found.cls,
        reason: `BACKLOG.md row ${id} status leads with the legend marker "${found.marker}": "${statusText.slice(0, 120)}"`,
      };
    }
  }

  return {
    class: 'ORPHAN',
    reason: id === null
      ? 'no BACKLOG item id could be parsed from the title or branch — no row to consult, no recorded terminal state found.'
      : statusById.has(id)
        ? `BACKLOG.md row ${id}'s status does not lead with a PARKED/BLOCKED/CULLED marker — no recorded terminal state found (see this file's header comment for the known "human-gated" detection gap).`
        : `BACKLOG.md has no row for id ${id} (renumbered or removed since this PR opened) — no recorded terminal state found.`,
  };
}

/**
 * Classifies every PR in `prs` (array of PR records) against `backlogText`.
 * Returns { results: [{pr, class, reason}], orphanCount, orphans }.
 */
function classifyAll(prs, backlogText) {
  const results = prs.map((pr) => ({ pr, ...classifyPR(pr, backlogText) }));
  const orphans = results.filter((r) => r.class === 'ORPHAN');
  return { results, orphanCount: orphans.length, orphans };
}

// ---------------------------------------------------------------------------
// Leg B — the ID-collision guard.
// ---------------------------------------------------------------------------

/**
 * The next BACKLOG id, accounting for both main's own max id AND ids
 * already claimed by open PR branches (loop-container-contention.md's
 * existing rule, made executable instead of relying on memory).
 * `openPrBranchIds` is an array of ids (strings or numbers) claimed by
 * currently-open `claude/loop-*` branches.
 */
function computeNextId(mainMaxId, openPrBranchIds) {
  const nums = [Number(mainMaxId), ...openPrBranchIds.map(Number)];
  return Math.max(...nums) + 1;
}

/**
 * Given the set of ids already present as rows in main's BACKLOG.md, and a
 * list of { pr, addedIds } claims describing which new row ids each open
 * PR's diff adds, reports every collision: an open PR adding a row id that
 * main has ALREADY allocated to a different (already-shipped) item.
 * Returns [{ pr, id, mainStatus }].
 */
function detectIdCollisions(mainBacklogStatusById, openPrClaims) {
  const collisions = [];
  for (const claim of openPrClaims) {
    for (const id of claim.addedIds) {
      const idStr = String(id);
      if (mainBacklogStatusById.has(idStr)) {
        collisions.push({
          pr: claim.pr,
          id: idStr,
          mainStatus: mainBacklogStatusById.get(idStr),
        });
      }
    }
  }
  return collisions;
}

// ---------------------------------------------------------------------------
// CLI — thin wrapper. Reads BACKLOG.md from disk (real path) and a JSON
// array of already-fetched PR records from --prs=<path> (or stdin with
// --prs=-). Never calls GitHub itself — the caller (a heartbeat run) fetches
// PRs via list_pull_requests and hands them to this script as data, which is
// what keeps this module's tests network-free.
// ---------------------------------------------------------------------------

function runCli(argv) {
  const prsArgIdx = argv.findIndex((a) => a.startsWith('--prs='));
  if (prsArgIdx === -1) {
    console.error('Usage: node pr-orphan-detector.js --prs=<path-to-json|-​>');
    process.exit(2);
  }
  const prsArg = argv[prsArgIdx].slice('--prs='.length);
  const raw = prsArg === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(prsArg, 'utf8');
  const prs = JSON.parse(raw);
  const backlogText = fs.readFileSync(BACKLOG_PATH, 'utf8');
  const { results, orphanCount, orphans } = classifyAll(prs, backlogText);

  for (const r of results) {
    console.log(`#${r.pr.number}\t${r.class}\t${r.reason}`);
  }
  console.log(`\nTOTAL open+merged PRs classified=${results.length} ORPHAN=${orphanCount}`);
  if (orphans.length) {
    console.log('Orphans:', orphans.map((o) => `#${o.pr.number}`).join(', '));
  }
  // Detection/reporting only — never a non-zero exit, per spec: "the
  // heartbeat is triage-only and must never merge or re-verify."
  process.exit(0);
}

if (require.main === module) {
  runCli(process.argv.slice(2));
}

module.exports = {
  parseStatusLegend,
  parseBacklogStatusById,
  extractItemId,
  classifyPR,
  classifyAll,
  computeNextId,
  detectIdCollisions,
  MARKER_CLASS_MAP,
  BACKLOG_PATH,
};
