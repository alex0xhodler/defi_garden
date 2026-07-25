# 141 — build notes

## What was built
Removed the dead **"Ping Google about sitemap update"** step from `.github/workflows/sitemap-update.yml`, replacing it with a 6-line explanatory comment above the (untouched) IndexNow step. Net: `1 file changed, 6 insertions(+), 12 deletions(-)`.

## Deviation from the literal BACKLOG wording (documented per build.md step 3)
The BACKLOG row said "remove the **Google** ping call (keep IndexNow)". I removed the **entire step**, which also contained the Bing ping (`bing.com/ping?sitemap=`) and the unconditional `echo "✅ Search engines notified"`.

Reasoning (conservative-honest choice): the item's stated purpose is fixing "a misleading green." Removing only the Google `curl` line would leave (a) the Bing `curl`, which hits an endpoint that is **also** dead (HTTP 410 Gone, deprecated 2022 — confirmed via web search 2026-07-25), and (b) the "✅ Search engines notified" echo — i.e. the misleading green would survive. Removing the whole dead step is the smallest change that actually removes the dishonesty. No notification capability is lost: IndexNow (kept, byte-unchanged) already covers Bing + Yandex, and Google's own deprecation notice directs to robots.txt + Search Console, both already in place.

## Kept a literal-comment-grep clean
First draft of the replacement comment embedded the literal `google.com/ping` / `bing.com/ping` strings; reworded so a grep for the dead endpoints returns 0 in the workflow (matches the spec's verification assertion). The comment retains the human-readable "Google and Bing sitemap-ping HTTP endpoints" description.

## Verification done in-session
- `python3 yaml.safe_load` parses the workflow; step count 17; "Ping IndexNow" present, "Ping Google about sitemap update" absent.
- `grep -c "google.com/ping\|bing.com/ping"` → 0.
- `grep -c "Notifying search engines\|Search engines notified"` → 1, and that single hit is the explanatory **comment** (documenting what was removed), not a runtime `echo`. Left as-is: it's honest historical documentation, not a misleading green.
- IndexNow step (`node indexnow-ping.js`) byte-unchanged (line reference confirmed).

## Not touched
Sitemap generation, validation, the git commit step, the summary step, `robots.txt`, `indexnow-ping.js`, any sitemap/SEO file. No runtime product code. No translations (no user-facing string).
