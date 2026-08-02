# agent-readability-audit — playbook

**When:** someone asks whether the site is readable by AI agents, or a new "make your site agent-readable"
pattern circulates and you need to know what's actually missing here rather than what's missing on an
average site.

**Answer in one line:** this repo shipped the whole popular checklist months ago — so **run the residue
checks, not the checklist**, and the residue is always *addressing* and *honest negotiation*, never the
existence of `llms.txt`.

## Step 0 — establish what already exists BEFORE proposing anything

Every generic agent-readability listicle recommends `llms.txt`, structured headings, and no-JS facts. This
repo has all three. Filing them as findings burns a tick and makes the report untrustworthy. One command
each, all verified present 2026-08-02:

```
for p in ".well-known/api-catalog" ".well-known/mcp/server-card.json" \
         ".well-known/agent-skills/index.json" "llms.txt" "llms-full.txt"; do
  curl -sS -o /dev/null -w "$p %{http_code} %{content_type} %{size_download}\n" "https://www.defi.garden/$p"
done
```

Also already true and worth stating so nobody re-files it: the 2,154-page static estate is **genuinely
server-rendered** (real facts, no JS), the daily regen keeps `llms*` and the estate in sync from one source,
and `Link:` headers advertise every well-known surface on every response.

## Step 1 — the negotiation matrix (this is where the real defects live)

Do not test one URL. Test the **matrix of path shapes**, because a `source: "/"` rewrite silently matches
every query-string URL:

```
for p in "/" "/?token=USDC" "/?pool=<id>" "/tokens/usdc" "/chains/solana" "/plan.html"; do
  printf "%-46s " "$p"; curl -sS -H "Accept: text/markdown" "https://www.defi.garden$p" | head -c 60 | tr '\n' ' '; echo
done
```

**Decision rule: identical output for two URLs that ask different questions is a defect, even when the
output is well-formed.** On 2026-08-02 this returned the byte-identical site index for `/`, `/?token=USDC`
and `/?pool=<id>` → item 212.

**The trap that makes this class invisible:** a wrong-but-plausible markdown response looks *better* than a
404 in every dashboard and every spot-check. The agent gets a clean, well-structured document and answers
from it. **Prefer HTML or 404 over a generic fallback** — an honest miss beats a confident wrong answer,
and only the honest miss is ever noticed and fixed.

## Step 2 — the no-JS fact test on the conversion surface

The estate being server-rendered says nothing about the surface it links to. Fetch the conversion page with
no JS and grep for the facts it is *about*:

```
U="https://www.defi.garden/?pool=<id>"
for s in "<the pool id>" "<protocol>" "Garden this pool" "Total APY"; do
  printf "%-18s " "$s"; curl -sS "$U" | grep -ci "$s"; done
```

On 2026-08-02 every count was **0**, including the pool's own id, on a 23,502-byte response → item 213.

**The rule this generalises to: audit the DESTINATION, not the corpus.** A fully agent-readable estate that
deep-links to a JS-only conversion page is a funnel that dead-ends one hop before the goal, and every
corpus-level check reports it as healthy. Sibling of `detector-signal-coverage.md`'s fourth axis — ask what
population/surface the check can never reach.

## Step 3 — sizing it honestly, which is most of the value

**Agent reads are structurally unmeasurable in this stack.** An agent that never executes JS cannot fire a
client-side Mixpanel event, and there is no server-log access. So:

- **Never score an agent-readability item as measured demand.** File it as a **capability bet**, say so in
  the row, the spec's Measurement section, and `LEARNINGS.md`.
- **Never invent a proxy metric** to make it look measurable. Writing "measure via `page_view`" for a
  surface no agent can emit from is worse than writing "unmeasurable".
- The honest prerequisite for ever claiming an effect is **edge/server request logging by `Accept` header
  and user-agent** — a separate item. Say that instead of hand-waving.

## Step 4 — the two traps specific to adding markdown twins

1. **A drifting twin is worse than no twin.** Two different numbers in front of a human and an agent is
   exactly what the one-source-of-truth rule exists to prevent. Generate twins in the **same generator run**
   as the HTML so sync is by construction, and assert fact-parity mechanically over a sample (pool count,
   top APY, floor figure parsed from both). Never rely on "the generator writes both, so they match."
2. **A new output format is a new place for the trust rails to not be enforced.** `APY_SANITY_LIMIT`, the
   anomaly flag and the degen ⅓ haircut have never run over a markdown emitter. A twin stating a rate the
   HTML page would refuse to show unflagged is a rail breach on a surface nobody looks at — which is
   precisely why it survives. Assert it on a constructed anomalous fixture; it is the criterion most likely
   to be quietly skipped.
3. And the duplicate-content own-goal: a `.md` twin is by design a duplicate of an indexed page. Keep twins
   **out of every sitemap** and `noindex` them, or you create the problem item 211 exists to remove.

**Provenance:** heartbeat 2026-08-02, triggered by the human relaying the Resend pricing pattern
(zenorocha). The audit found the popular checklist already satisfied and two real defects underneath it —
root-only negotiation silently serving the site index for every query URL (212), and the north-star surface
returning zero facts without JS (213). Both were found by testing a *matrix* of path shapes rather than one
URL, and by auditing the link destination rather than the corpus.
