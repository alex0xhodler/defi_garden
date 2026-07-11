# Notes: 027 — Share-card real logo + label/headline consistency

## Environment note superseded
The spec (and BACKLOG) flagged this item as needing a browser+network session — accurate
for a fully offline sandbox, but not for this one: `raw.githubusercontent.com` and
`registry.npmjs.org` were reachable through the proxy (unlike `yields.llama.fi`), and
Playwright's bundled Chromium was already on disk. Built and verified in one session.

## Logo sourcing (deviation from "bundle local brand logos" — same intent, different source)
The spec assumed logos would just be "bundled" without specifying where from. Sourced
official monochrome marks + hex colors from the `simple-icons` project (MIT-licensed
vector marks, npm package `simple-icons@16.25.0`) for: spotify, netflix, claude
(Anthropic), audible, youtube, doordash, uber, max (HBO Max/Max), paramountplus, apple.
OpenAI/ChatGPT is not in simple-icons, so its mark came from `gilbarbara/logos` (MIT),
same official black icon-mark, fill overridden to `#000000` per that project's own file.

**Amazon, Hulu, Disney+, Xbox, Peacock, Walmart are not bundled** — neither open-source
icon set carries them (a `grep -i` over simple-icons' full slug list confirms zero
matches for any of the six; this lines up with the public record of Amazon issuing
takedown requests against icon libraries, and other big-media brands are commonly
excluded from these libraries for the same trademark-enforcement reason). Rather than
scrape an official brand-guideline site or risk a legally shakier source under time
pressure, these six fall back to their existing GOALS/SUBSCRIPTION_LADDER `emoji` — the
spec's own fallback path (`## Change` item 4) already covers exactly this case. Of
`SUBSCRIPTION_LADDER`'s 5 anchors, 4/5 now render a real logo; only Amazon Prime
falls back.

## Rendering approach (deviation: Path2D fill, not `drawImage` of a preloaded `Image`)
The spec's Territory notes assumed an `Image` object + `drawImage`. Implemented as a
`Path2D` fill of the SVG path data directly (`brand-icons.js` ships path + viewBox +
official hex per domain, no `<img>`/`Image()` involved). Same taint-safety guarantee
(no cross-origin asset, ever) with two added benefits: synchronous (no image-load
race before `toBlob`) and resolution-independent (vector fill, not a rasterized
bitmap). Wrapped in try/catch — a bad path string falls through to the emoji, never
throws, per acceptance criterion 3.

## Root-cause fix applied to BOTH bundle-headline sites, not just the one named in evidence
The spec's evidence section named `doWaitlistDownload` (~1611) as buggy and described
`doShare` (~1750) as "already self-consistent." That's true for 3 of its 4 branches —
but the `archetype === 'subscription' && isCapitalPath` branch (~1717-1738) has the
*same* class of bug: its headline is built from `shareBundle.covered` (a multi-service
bundle) while the old code passed `goalLabel(t, goal)` (the single anchor) as the row-1
label — same mismatch shape as the reported screenshot, just not the exact repro used
to find it. Fixed both call sites through one shared helper (`brandForId`) and two new
per-branch variables (`shareRowLabel`, `shareFeatured`) so headline/label/icon always
derive from the same source, per the spec's Change item 1 ("one source, both share
paths").

## Multi-service bundle icon choice (not spelled out in spec)
When 2+ services are covered/selected (e.g. "Spotify + Netflix"), there's no single
brand mark that represents the pair — the icon falls back to the sprout emoji while the
row-1 *label* still reads the full joined list (unchanged bundle-list behavior, just
now sourced consistently with the headline). Only an exact single-service match gets
its own bundled logo.

## Verification performed (real browser, not fixtures)
`npm install` (registry.npmjs.org reachable) got Playwright's Node package; its
Chromium was already at `/opt/pw-browsers/chromium`. Served the repo via
`python3 -m http.server 8000`, drove `plan.html` in headless Chromium with Playwright,
routing `**/pools` to a static fixture (same shape as `test_planner.js`'s fixtures) and
`unpkg.com`'s React/ReactDOM UMD requests to the local `node_modules` copies (`unpkg.com`
itself isn't reachable from this sandbox — a test-harness workaround, not a product
change). Monkey-patched `HTMLCanvasElement.prototype.toBlob` via `page.addInitScript`
to capture the rendered card as a PNG without altering `renderShareImage`'s real call
path. Five real renders captured and eyeballed:
- `?goal=chatgpt&fm=capital&capital=5000` — real OpenAI mark, label/headline match (the reported bug, reproduced and fixed)
- `?goal=spotify&fm=monthly&monthly=50` — real Spotify mark (official green)
- `?goal=claude&fm=capital&capital=6000` — real Claude/Anthropic mark
- `?goal=amazonprime&fm=capital&capital=3000` — no bundled mark → clean 📦 emoji fallback, no crash
- Full waitlist-download repro: anchor `goal=spotify`, deselected Spotify in the mix
  builder, selected ChatGPT Plus, joined the (mocked) waitlist, clicked "Download
  garden card" — card shows the OpenAI mark + "ChatGPT Plus" label under a "ChatGPT
  Plus" headline. This is the literal screenshot scenario from the bug report.

All five: `drawErr=null`, zero canvas/JS exceptions. `node --check` on both changed
files passes; full test chain (`test_planner.js` + `test_protocol_parsing.js` +
`test_qualifier_fix.js`) still exits 0, 190/190 assertions.
