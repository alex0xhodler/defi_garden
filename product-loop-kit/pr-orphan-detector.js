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
 * KNOWN GAP, stated with a number (RAZOR.md "class rule" — say so, don't
 * pretend the narrow fix is the general one): the legend has no marker word
 * for "the code is done and verified, but MERGING it needs a specific human
 * action" (a rail relaxation, a screenshot review, a NORTH_STAR edit) — the
 * 4 real PRs item 245's evidence called "human-gated" (#393, #332, #309,
 * #316) mostly don't use BACKLOG legend words in their own prose at all.
 * BLOCKED ("question for the human") is the closest legend concept but
 * means something narrower — an unanswered question about what to build,
 * not a built-and-verified change awaiting a merge action. Absent a
 * structured marker for that second thing, classifyPR() falls back to a
 * single, generic, non-enumerated signal (the literal word "human"
 * appearing in the PR's title or body) rather than a hand-typed phrase
 * list — which is itself the failure mode this item's spec explicitly
 * warns against ("do not re-type a literal list of title prefixes"). This
 * fallback is a heuristic, not a guarantee: a human-gated PR whose text
 * never spells out the word "human" will read as ORPHAN. That is the
 * conservative failure direction for a detection-only, triage tool (more
 * visibility, not less) but it is a real, named gap — remediation is a
 * ticket for a future item to give "awaiting human merge action" its own
 * legend status, not something this item silently claims to have solved.
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
 * Parses every `| <id> | ... | <status> | ... |` BACKLOG.md table row into
 * a Map<string id, string status text>. Rows whose id cell isn't a bare
 * integer (composite/range ids, deleted rows) are skipped, not guessed at.
 */
function parseBacklogStatusById(backlogMarkdown) {
  const byId = new Map();
  for (const line of backlogMarkdown.split('\n')) {
    const m = line.match(/^\|\s*(\d+)\s*\|/);
    if (!m) continue;
    const cells = line.split('|');
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

function findLegendMarkerInText(text, priorityOrder) {
  const upper = text.toUpperCase();
  for (const marker of priorityOrder) {
    const cls = MARKER_CLASS_MAP[marker];
    if (cls === null || cls === undefined) continue; // no PR-terminal meaning
    const re = new RegExp(`\\b${marker}\\b`);
    if (re.test(upper)) return { marker, cls };
  }
  return null;
}

const HUMAN_WORD_RE = /\bhuman\b/i;

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

  const legendMarkers = parseStatusLegend(backlogText);
  const statusById = parseBacklogStatusById(backlogText);
  const id = extractItemId(pr);

  if (id !== null && statusById.has(id)) {
    const statusText = statusById.get(id);
    const found = findLegendMarkerInText(statusText, legendMarkers);
    if (found) {
      return {
        class: found.cls,
        reason: `BACKLOG.md row ${id} status carries the legend marker "${found.marker}": "${statusText.slice(0, 120)}"`,
      };
    }
  }

  const haystack = `${pr.title || ''}\n${pr.body || ''}`;
  if (HUMAN_WORD_RE.test(haystack)) {
    return {
      class: 'human-gated',
      reason: 'no BACKLOG legend marker found, but the PR title/body references "human" — the legend has no structured marker for "verified, awaiting a human merge action" (see this file\'s header comment); flagged via the fallback heuristic, not the legend.',
    };
  }

  return {
    class: 'ORPHAN',
    reason: id === null
      ? 'no BACKLOG item id could be parsed from the title or branch, so no row to consult, and no "human" reference in title/body — no recorded terminal state found.'
      : statusById.has(id)
        ? `BACKLOG.md row ${id} carries no PARKED/BLOCKED/CULLED marker, and no "human" reference in title/body — no recorded terminal state found.`
        : `BACKLOG.md has no row for id ${id} (renumbered or removed since this PR opened), and no "human" reference in title/body — no recorded terminal state found.`,
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
