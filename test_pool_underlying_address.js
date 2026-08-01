/* Rendered Playwright test for backlog 195 — pool-detail "Underlying Assets"
   chips now truncate non-EVM address-shaped tokens too (Solana mints, Tron
   addresses, chain-prefixed EVM, opaque non-EVM ids), instead of printing
   142 raw multi-char blobs. Root-caused by 193's scanner work (specs/193-
   notes.md residual (b)): the un-truncated digit run was precisely what made
   193's false P0 possible.

   This test proves, against REAL renders (not source reading), the 10
   numbered acceptance criteria in specs/195.md verbatim:
     1. Solana mint truncated, title = full 43-char mint.
     2. Solana chip links to Solscan, not blockscan.
     3. Tron chip links to Tronscan, not blockscan.
     4. Opaque non-EVM (Stellar) chip renders unlinked, title = full id.
     5. Bare EVM regression — unchanged blockscan-linked chip.
     6. Chain-prefixed EVM — prefix stripped, label + href use the bare 0x address.
     7. Short readable ids (coingecko:<slug>) untouched — full text, plain span.
     8. Layout holds (no clipping / no page overflow) at 360/768/1280px.
     9. No page errors.
    10. Non-vacuity — the live snapshot actually carries the population this
        item fixes.

   Fixture-routed (unpkg React/Babel vendored, snapshot 404'd to force the
   live path, yields.llama.fi routed to an inline fixture) — house pattern
   from test_mobile_cta_clip.js / test_northstar_cta_fires.js. All fixture
   pool underlyingTokens addresses are copied verbatim from the committed
   data/pools-snapshot.json (verified present below before the test runs).
   Pool ids, tvlUsd, apyBase and symbol are synthetic (same convention as
   test_northstar_cta_fires.js's CARD_CLICK_POOL) — only the addresses being
   classified need to be real.

   Note on `symbol`: several fixtures deliberately use a two-part symbol
   (e.g. 'JITOSOL/SOL' instead of the real pool's literal 'JITOSOL') so the
   pre-existing "swap truncation for pool.symbol" shortcut (kept and
   generalised by this item — see specs/195.md §2 last bullet) does NOT
   kick in for these fixtures. On the real single-token JITOSOL pool in
   production, that shortcut fires and shows "JITOSOL ↗" — also correct
   per spec, but it would make criterion 1's truncation regex unobservable.
   This is a test-fixture choice, not a product behavior difference.

   Run: node test_pool_underlying_address.js */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PORT = 8868; // distinct from other test_* files (8791-8867 taken)
const ROOT = __dirname;
const CHROMIUM_EXECUTABLE = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const IGNORABLE = /mp\.defi\.garden|cdn\.mxpnl\.com|mixpanel|icons\.llamao\.fi|fontshare|yields\.llama\.fi|unpkg|pools-snapshot|Failed to load resource/i;

// Real addresses, copied verbatim from data/pools-snapshot.json (verified
// present below before the test runs). Pool ids/tvl/apy are synthetic.
const SOLANA_MINT = 'So11111111111111111111111111111111111111112'; // 43 chars, wrapped SOL
const TRON_ADDR = 'THb4CqiFdwNHsWsQCs4JhzwjMWys4aqCbF'; // 34 chars
const STELLAR_ADDR = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'; // 56 chars
const EVM_ADDR = '0xdac17f958d2ee523a2206206994597c13d831ec7'; // USDT

const SOLANA_POOL = {
  pool: 'test-195-solana-jitosol', project: 'jito-liquid-staking', symbol: 'JITOSOL/SOL',
  chain: 'Solana', tvlUsd: 50_000_000, apyBase: 4.2, apyReward: 0,
  underlyingTokens: [SOLANA_MINT]
};
const TRON_POOL = {
  pool: 'test-195-tron-justlend', project: 'justlend-v1', symbol: 'ETH/TRX',
  chain: 'Tron', tvlUsd: 20_000_000, apyBase: 3.1, apyReward: 0,
  underlyingTokens: [TRON_ADDR]
};
const STELLAR_POOL = {
  pool: 'test-195-stellar-blend', project: 'blend-pools-v2', symbol: 'XLM/USDC',
  chain: 'Stellar', tvlUsd: 15_000_000, apyBase: 5.0, apyReward: 0,
  underlyingTokens: [STELLAR_ADDR]
};
const EVM_BARE_POOL = {
  pool: 'test-195-eth-usdt', project: 'aave-v3', symbol: 'USDT/ETH',
  chain: 'Ethereum', tvlUsd: 100_000_000, apyBase: 4.8, apyReward: 0,
  underlyingTokens: [EVM_ADDR]
};
const EVM_PREFIXED_POOL = {
  pool: 'test-195-plasma-usdt0', project: 'aave-v3', symbol: 'USDT0/PLASMA',
  chain: 'Plasma', tvlUsd: 30_000_000, apyBase: 6.5, apyReward: 0,
  underlyingTokens: [`ethereum:${EVM_ADDR}`]
};
const READABLE_ID_POOL = {
  pool: 'test-195-xrpl-tbill', project: 'openeden', symbol: 'TBILL',
  chain: 'XRPL', tvlUsd: 12_000_000, apyBase: 4.0, apyReward: 0,
  underlyingTokens: ['coingecko:openeden-tbill']
};

const ALL_POOLS = [SOLANA_POOL, TRON_POOL, STELLAR_POOL, EVM_BARE_POOL, EVM_PREFIXED_POOL, READABLE_ID_POOL];
const FIXTURE = JSON.stringify({ status: 'success', data: ALL_POOLS });

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { console.error('  ✗ ' + name + '\n    ' + err.message); process.exitCode = 1; }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'home.html' : urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

// Grabs the "Underlying Assets" row (its heading's next sibling — the flex
// row of chips) and returns per-chip data plus the row's own bounding box
// (used as the containment reference for criterion 8: chips must not spill
// past the row they wrap inside). Returns null if the row isn't present.
async function getUnderlyingRow(page) {
  return page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('div')).find(
      (el) => el.children.length === 0 && el.textContent.trim() === 'Underlying Assets'
    );
    if (!heading) return null;
    const row = heading.nextElementSibling;
    if (!row) return null;
    const rowBox = row.getBoundingClientRect();
    const chips = Array.from(row.children).map((el) => {
      const box = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        text: el.textContent,
        title: el.getAttribute('title'),
        href: el.getAttribute('href'),
        target: el.getAttribute('target'),
        rel: el.getAttribute('rel'),
        x: box.x, y: box.y, width: box.width, height: box.height
      };
    });
    return {
      row: { x: rowBox.x, y: rowBox.y, width: rowBox.width, height: rowBox.height },
      chips
    };
  });
}

async function main() {
  // Criterion 10: non-vacuity. Fail loudly (not a silent pass) if the
  // population this item fixes has evaporated from the live snapshot.
  const snapshot = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pools-snapshot.json'), 'utf8'));
  const nonEvmLong = snapshot.pools.filter((p) => {
    const tokens = p && Array.isArray(p.underlyingTokens) ? p.underlyingTokens : [];
    return tokens.some((tk) => typeof tk === 'string' && tk.length >= 32 && !tk.startsWith('0x'));
  });
  await test('criterion 10: non-vacuity — >=1 live pool carries a non-EVM underlying token >=32 chars', async () => {
    if (nonEvmLong.length < 1) {
      throw new Error(`population hit 0 — data/pools-snapshot.json no longer carries any non-EVM underlying token >=32 chars (found ${nonEvmLong.length}); this test would otherwise pass vacuously`);
    }
  });

  // Sanity check: the addresses embedded in the fixtures above are real,
  // drawn from the committed snapshot — not invented.
  for (const [label, addr] of [['Solana mint', SOLANA_MINT], ['Tron address', TRON_ADDR], ['Stellar contract id', STELLAR_ADDR]]) {
    const found = snapshot.pools.some((p) => Array.isArray(p.underlyingTokens) && p.underlyingTokens.includes(addr));
    if (!found) throw new Error(`${label} ${addr} not found in data/pools-snapshot.json underlyingTokens — pick a real address`);
  }

  const server = await startServer();
  const browser = await chromium.launch({ executablePath: CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !IGNORABLE.test(m.location()?.url || '') && !IGNORABLE.test(m.text()))
        pageErrors.push('console.error: ' + m.text());
    });

    const nm = path.join(ROOT, 'node_modules');
    for (const [url, lp] of Object.entries({
      'https://unpkg.com/react@18/umd/react.production.min.js': path.join(nm, 'react/umd/react.production.min.js'),
      'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': path.join(nm, 'react-dom/umd/react-dom.production.min.js'),
      'https://unpkg.com/@babel/standalone/babel.min.js': path.join(nm, '@babel/standalone/babel.min.js')
    })) {
      await page.route(url, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(lp) }));
    }
    await page.route('https://icons.llamao.fi/**', (r) => r.abort());
    await page.route('**/data/pools-snapshot*', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: 'not found' }));
    await page.route('https://yields.llama.fi/pools', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: FIXTURE }));

    const urlFor = (poolId) => `http://localhost:${PORT}/home.html?pool=${encodeURIComponent(poolId)}`;

    async function loadPool(poolId) {
      await page.goto(urlFor(poolId), { waitUntil: 'load', timeout: 20000 });
      await page.waitForSelector('.pool-detail-view', { timeout: 15000 });
      await page.waitForFunction(() => {
        const heading = Array.from(document.querySelectorAll('div')).find(
          (el) => el.children.length === 0 && el.textContent.trim() === 'Underlying Assets'
        );
        return !!(heading && heading.nextElementSibling && heading.nextElementSibling.children.length > 0);
      }, { timeout: 15000 });
      return getUnderlyingRow(page);
    }

    await test('criterion 1: Solana mint is truncated, title is the full 43-char mint', async () => {
      const data = await loadPool(SOLANA_POOL.pool);
      if (!data) throw new Error('Underlying Assets row not found');
      const chip = data.chips.find((c) => c.title === SOLANA_MINT);
      if (!chip) throw new Error('no chip with title === full Solana mint found; chips: ' + JSON.stringify(data.chips));
      if (!/^So11\S*\.\.\.\S*112 ↗$/.test(chip.text)) {
        throw new Error(`chip text "${chip.text}" does not match the expected truncated shape`);
      }
      for (const c of data.chips) {
        if (c.text.length > 24) throw new Error(`chip text "${c.text}" is ${c.text.length} chars, exceeds 24`);
      }
    });

    await test('criterion 2: Solana chip links to Solscan (not blockscan)', async () => {
      const data = await loadPool(SOLANA_POOL.pool);
      const chip = data.chips.find((c) => c.title === SOLANA_MINT);
      if (chip.tag !== 'a') throw new Error(`expected <a>, got <${chip.tag}>`);
      if (chip.href !== `https://solscan.io/token/${SOLANA_MINT}`) throw new Error(`unexpected href: ${chip.href}`);
      if (chip.target !== '_blank') throw new Error(`unexpected target: ${chip.target}`);
      if (!(chip.rel || '').includes('noopener')) throw new Error(`rel missing noopener: ${chip.rel}`);
      if (/blockscan/.test(chip.href)) throw new Error('Solana chip must never link to blockscan');
    });

    await test('criterion 3: Tron chip links to Tronscan (not blockscan)', async () => {
      const data = await loadPool(TRON_POOL.pool);
      if (!data) throw new Error('Underlying Assets row not found');
      const chip = data.chips.find((c) => c.title === TRON_ADDR);
      if (!chip) throw new Error('no chip with title === full Tron address found; chips: ' + JSON.stringify(data.chips));
      if (chip.tag !== 'a') throw new Error(`expected <a>, got <${chip.tag}>`);
      if (chip.href !== `https://tronscan.org/#/token20/${TRON_ADDR}`) throw new Error(`unexpected href: ${chip.href}`);
      if (/blockscan/.test(chip.href)) throw new Error('Tron chip must never link to blockscan');
    });

    await test('criterion 4: opaque non-EVM (Stellar) renders unlinked, full id in title, no blockscan anywhere in row', async () => {
      const data = await loadPool(STELLAR_POOL.pool);
      if (!data) throw new Error('Underlying Assets row not found');
      const chip = data.chips.find((c) => c.title === STELLAR_ADDR);
      if (!chip) throw new Error('no chip with title === full Stellar contract id found; chips: ' + JSON.stringify(data.chips));
      if (chip.tag === 'a' || chip.href) throw new Error(`Stellar chip must not be a link; got tag=${chip.tag} href=${chip.href}`);
      if (!/\.\.\./.test(chip.text)) throw new Error(`expected a truncated chip, got "${chip.text}"`);
      const rowHasBlockscan = data.chips.some((c) => /blockscan/.test(c.href || ''));
      if (rowHasBlockscan) throw new Error('blockscan must not appear anywhere in the Stellar pool\'s row');
    });

    await test('criterion 5: EVM regression — bare 0x… still renders a blockscan-linked chip', async () => {
      const data = await loadPool(EVM_BARE_POOL.pool);
      if (!data) throw new Error('Underlying Assets row not found');
      const chip = data.chips.find((c) => c.title === EVM_ADDR);
      if (!chip) throw new Error('no chip with title === full EVM address found; chips: ' + JSON.stringify(data.chips));
      if (chip.tag !== 'a') throw new Error(`expected <a>, got <${chip.tag}>`);
      if (chip.href !== `https://blockscan.com/address/${EVM_ADDR}`) throw new Error(`unexpected href: ${chip.href}`);
      if (chip.text !== '0xdac1...1ec7 ↗') throw new Error(`unexpected label: "${chip.text}"`);
    });

    await test('criterion 6: chain-prefixed EVM strips the prefix in both label and href', async () => {
      const data = await loadPool(EVM_PREFIXED_POOL.pool);
      if (!data) throw new Error('Underlying Assets row not found');
      const chip = data.chips.find((c) => c.title === `ethereum:${EVM_ADDR}`);
      if (!chip) throw new Error('no chip with title === full prefixed token string found; chips: ' + JSON.stringify(data.chips));
      if (chip.text !== '0xdac1...1ec7 ↗') throw new Error(`unexpected label: "${chip.text}"`);
      if (chip.href !== `https://blockscan.com/address/${EVM_ADDR}`) throw new Error(`unexpected href (prefix must be stripped): ${chip.href}`);
    });

    await test('criterion 7: short readable id (coingecko:<slug>) is left alone — full text, plain span, no arrow/title/truncation', async () => {
      const data = await loadPool(READABLE_ID_POOL.pool);
      if (!data) throw new Error('Underlying Assets row not found');
      const chip = data.chips.find((c) => c.text.includes('coingecko:openeden-tbill'));
      if (!chip) throw new Error('expected the full "coingecko:openeden-tbill" string somewhere in the row; chips: ' + JSON.stringify(data.chips));
      if (chip.text !== 'coingecko:openeden-tbill') throw new Error(`expected exact full text, got "${chip.text}"`);
      if (chip.tag === 'a') throw new Error('short readable id must not become a link');
      if (chip.title) throw new Error(`expected no title attribute, got "${chip.title}"`);
      if (/↗/.test(chip.text)) throw new Error('short readable id must not get the ↗ suffix');
    });

    await test('criterion 8: layout holds at 360/768/1280px (no chip clipping, no page horizontal overflow)', async () => {
      for (const width of [360, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        const data = await loadPool(SOLANA_POOL.pool);
        if (!data) throw new Error(`${width}px: Underlying Assets row not found`);
        for (const chip of data.chips) {
          if (!(chip.width > 0)) throw new Error(`${width}px: chip "${chip.text}" has non-positive width`);
          if (chip.x < data.row.x - 1) {
            throw new Error(`${width}px: chip "${chip.text}" clipped on LEFT (x=${chip.x} < row.x=${data.row.x})`);
          }
          if (chip.x + chip.width > data.row.x + data.row.width + 1) {
            throw new Error(`${width}px: chip "${chip.text}" clipped on RIGHT (right=${chip.x + chip.width} > row right=${data.row.x + data.row.width})`);
          }
        }
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth
        }));
        if (overflow.scrollWidth > overflow.innerWidth + 1) {
          throw new Error(`${width}px: page horizontal overflow — scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth}`);
        }
      }
    });

    await test('criterion 9: no unexpected page/console errors across all renders above', async () => {
      if (pageErrors.length) throw new Error(pageErrors.join('\n    '));
    });
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`test_pool_underlying_address.js: ${passed}/${total} tests passed`);
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch((e) => { console.error(e); process.exit(1); });
