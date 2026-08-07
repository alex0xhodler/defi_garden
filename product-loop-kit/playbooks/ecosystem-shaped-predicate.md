# ecosystem-shaped-predicate — playbook

**When:** a rendered surface treats one blockchain ecosystem well and every other one badly, and the code
looks deliberate rather than broken — a raw 44-char base58 blob next to a tidy `0xdac1...1ec7 ↗` chip, an
explorer link that 404s on one chain, a badge that only ever appears on Ethereum pools. Also fires when a
*checker* reports a defect whose real cause is that the page rendered the non-EVM case verbatim
(item 193 → 195 is exactly this chain).

**Answer in one line:** the predicate is almost always testing *"is this an **Ethereum** thing?"* while
being named and used as *"is this a thing?"* — every other ecosystem falls through to a branch that was
designed for something else entirely, so the bad render is that branch working as written, not a
regression anyone introduced.

## Steps

1. **Find the predicate and read it literally.** Grep the render for `startsWith('0x')`, `length >= 40`,
   `/^0x[0-9a-fA-F]{40}$/`, `chain === 'Ethereum'`. Example: `PoolDetail.js`'s old
   `token.startsWith('0x') && token.length >= 40`.
   *Decision rule:* if the condition encodes one ecosystem's **shape** but the variable/branch is named
   for the general concept (`isAddress`, `isToken`, `isContract`), you are here.
2. **Find the fall-through branch and ask what it was built for.** The bug is usually not in the `if` —
   it's that the `else` was written for a different kind of value (a short symbol name) and is now
   receiving addresses.
3. **MEASURE the population before designing anything.** Never estimate. Node one-liner over
   `data/pools-snapshot.json` (`raw.pools`), bucketed **by chain and by string length**:
   ```
   node -e "const p=require('./data/pools-snapshot.json').pools; …"
   ```
   Item 195's read: 142 raw-rendered tokens — Solana 121, Tron 9, Stellar 4, chain-prefixed EVM 5,
   Stacks 2, `coingecko:` slugs 2. That distribution *is* the design brief.
4. **Split the predicate into TWO questions.** This is the reusable move:
   - *Is it shaped like the thing?* → decides the visual treatment (chip / truncation / badge)
   - *Do we know where it resolves?* → decides whether it may be a **link**, and to which host
   Before the split there is no way to express "clearly an address, but I don't know an explorer for this
   chain", so the code is forced to choose between a wrong link and a raw blob. `href: null` is that
   missing third state.
5. **Derive the catch-all boundary from the measured data, not from a round number.** Find the shortest
   real instance of the thing and the longest human-readable non-instance, and put the threshold between
   them. Item 195: Solana's minimum base58 length is 32; the longest slug measured was
   `coingecko:ondo-us-dollar-yield` at 30 → threshold `>= 32`.

## Resolution

- **Known ecosystem, known explorer** → full treatment + correct per-chain href, gated on the pool's
  actual `chain` (never on string shape alone — a base58 string is only a Solana mint *on Solana*).
- **Address-shaped, no explorer mapping** → same treatment, `href: null`. A chip that links nowhere beats
  a chip that links to a 404; the user still gets the full value via `title`.
- **Short and human-readable** → leave it completely alone. Truncating a slug destroys the only
  information it carries.
- Reuse the existing markup/tokens for all variants (2026-07-10 directive); differ only in element type
  and `color`. A second style for "the other chains" recreates the asymmetry in CSS.

## Traps

1. **The compiled artifact is what ships.** `home.html` loads `PoolDetail.compiled.min.js`, not
   `PoolDetail.js`. Every edit needs `npm run compile && npm run minify` in the same commit — and any
   **mutation test must recompile too**, or the mutation never reaches the browser and the test looks
   robust while proving nothing.
2. **Widening and over-widening look identical on the happy path.** Acceptance must be symmetric: one
   criterion that the previously-broken case is now fixed, and one that a legitimate non-instance is
   still left untouched (item 195's criterion 7 — `coingecko:openeden-tbill` must render in full). Verify
   the second by lowering your own threshold and watching it go red.
3. **Guessing an explorer is worse than omitting one.** `blockscan.com` is EVM-only. A Solana mint pointed
   at it is a guaranteed 404 on the north-star surface.
4. **Count-based shortcuts break when the predicate widens.** Item 195's `addressCount` drove a
   symbol-substitution rule; broadening the classifier silently changes that count. Prove the no-op case
   (EVM-only pools) by construction, not by hoping.
5. **A real single-token pool may not exercise the path you're testing.** If a sibling shortcut fires
   first (symbol substitution when `symbolParts.length === addressCount`), your truncation assertion is
   unobservable on that fixture. Pick fixture symbols that keep the target branch reachable, and say so.

## Provenance

Distilled from item **195** (2026-07-31, `specs/195.md` / `195-notes.md`), whose finding was originated by
item **193**'s root-cause work (`specs/193-notes.md` residual (b)) — the scanner false positive that only
existed *because* the page rendered the base58 mint verbatim. Related: `dual-source-logic-divergence.md`
(forked predicate, same file), `checker-by-design-classification.md` (checker vs deliberate behaviour).
