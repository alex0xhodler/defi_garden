# seo-surface-regen-delta — playbook

When: you changed code that decides **what the SEO generators emit** (`isValidToken`, eligibility gates,
slugging, ranking, page templates) and now need to prove *what your change did* to `tokens/`, `chains/`,
`ko/`, `og/`, `sitemap-*.xml`, `llms*.txt` — a diff that is thousands of files, almost all of it daily
data churn you did not cause.

Answer in one line: **never read the effect off `git diff` against HEAD** — regenerate twice from ONE
shared pools fixture (baseline `origin/main` in an isolated worktree vs your tree) and read the effect
off the two slug sets; the added-set must be empty and the dropped-set must be exactly your intended
class.

Steps:
1. Find how CI drives the generators — `.github/workflows/sitemap-update.yml`. It is the only sanctioned
   pipeline. Today: `generate-pools-snapshot.js --seo-out $T/seo-pools.json` → `generate-token-pages.js
   --fixture $T/seo-pools.json` → `generate-chain-pages.js --fixture …` → `POOLS_FIXTURE=… generate-sitemap.js`
   → `POOLS_FIXTURE=… generate-llms.js`. Note the fixture is a `$1,000`-floored RAW transient, **not**
   `data/pools-snapshot.json` (that one is the $10M trust-railed app snapshot — using it silently
   regenerates a much smaller surface).
2. Fetch ONCE, isolated: `node generate-pools-snapshot.js --out $T/data --seo-out $T/seo-pools.json`.
   `--out` keeps it out of the repo's `data/`.
3. Baseline in a worktree, never in the repo tree: `git worktree add $T/wt-base origin/main`, symlink
   `node_modules` into it, run the generator there with the SAME fixture. It must be a worktree because
   the generators write KO variants to `ko/tokens/` relative to the repo root — running a "baseline" in
   your own tree overwrites the thing you are measuring.
4. Run your tree with the same fixture and flags. Diff the `<loc>` slug sets.
5. Decision rule:
   - dropped ⊆ your intended class **and** added = ∅ → the change is doing exactly what you claim.
   - added ≠ ∅ → your change moved eligibility, not just the predicate. Stop and explain it.
   - a real, recognisable name in dropped → your rule is too greedy. FAIL, do not ship.

Resolution:
- Report the controlled numbers (baseline count, fixed count, dropped set, added set) as *the* measurement.
  A tree-vs-HEAD count difference is NOT the measurement and will not match — say so explicitly in the notes.
- Sanity gate before committing: every `<loc>` under `/tokens/<slug>` has a file on disk, and the counts
  line up. That symmetry, not the raw file count, is what "no orphans, no 404s" actually means.

Traps:
- **Do not hand-restore pages the generator deleted.** `generate-token-pages.js:964` (and the KO block at
  ~1011) wipes every `.html` in its out dir before rewriting; `generate-og-images.js` does the same for OG
  cards. Pages that vanish are usually tokens that crossed the `$100K` TVL floor since the last bake —
  ordinary churn the daily CI commit does with no code change at all (proof: `git show --stat
  --diff-filter=D 3828f9e63 -- 'tokens/*.html'` deletes `cbada.html`/`dfi.html`). Restoring them from HEAD
  puts stale content back on disk with no sitemap entry — worse than the deletion.
- `npm run sitemap:validate` runs `generate-sitemap.js` **without** `POOLS_FIXTURE`, so it re-fetches live
  and rewrites `sitemap-category-*.xml` / `sitemap-chain-*.xml` / `robots.txt` against a *second*, later
  pull. Use `node validate-sitemaps.js` alone when you only want validation, or `git checkout HEAD --` the
  collateral afterwards.
- Never `git stash` (especially `-u`) the whole tree for a baseline proof while anything else is touching
  it — 5,500 files in a stash plus a concurrent write is a merge conflict waiting to happen. Scope the
  stash to the files under proof, or better, use a worktree (step 3).
- Removing URLs from the sitemap hits NORTH_STAR's NEVER list ("deleting or de-indexing SEO surface")
  even when the URLs are junk. Build it, verify it, then leave the PR unmerged and BLOCKED — the human
  owns that line. **Superseded for one class as of item 226 (2026-08-04 Q3b, `specs/226.md`):** the
  human authorized shrinking **Google's whole sitemap view to a curated head** — NORTH_STAR's Q3b text
  is the scope, and it is broader than the app-view families alone: *"all pages stay LIVE … but Google's
  sitemap view shrinks to a curated head (~300-500 demand-plausible pages); **the thin tail leaves the
  sitemaps**."* So BOTH the app-view (`?token=`/`?chain=`/`?poolTypes=`) families **and** the ~4,084
  tail *static* `/tokens/<slug>` + `/chains/<slug>` entries — the larger share of 226's 4,522-URL drop —
  are covered by one authorization; neither needs separate sign-off. What it authorizes is a
  sitemap-*submission* change: pages stay live, self-canonical, hub-linked, in the `.md`/llms surface and
  in IndexNow's full-estate submission. Every OTHER removal (deleting a live page, shrinking the AGENT
  surface — 226's verifier caught exactly that in `generate-llms.js` — or de-listing any other class
  without an equivalent human sign-off) still hits this trap unchanged.

Provenance: item 148 (`specs/148.md`, `148-notes.md`, `148-pr.md`) — Pendle expiry-date fragments minting
`/tokens/8oct2026`-class pages; 7 junk slugs dropped, 0 added, measured this way. Prior art: item 013
(sitemap quality threshold), item 145 (isolating a code-only delta from generated-data drift).
