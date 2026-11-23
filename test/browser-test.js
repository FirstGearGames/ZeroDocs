#!/usr/bin/env node
'use strict';
/**
 * Browser suite: the client features, checked in a real headless browser.
 *
 * Builds sites with build-static.js, serves them over HTTP on loopback, and
 * drives the Chrome or Edge already on the machine through its DevTools
 * protocol, using Node's built-in WebSocket. Zero dependencies.
 *
 * Browser: CHROME_PATH, else the usual install locations. Without one the
 * suite is skipped, except under CI (CI=true), where a missing browser fails.
 *
 * Run:  node test/browser-test.js   (or: npm test)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { serveStatic } = require('./serve');

const ENGINE = path.join(__dirname, '..');
const EXAMPLE = path.join(ENGINE, 'example-site');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0;
const failures = [];
const ok = (name, cond) => { if (cond) pass++; else failures.push(name); };

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ];
  return candidates.find(c => c && fs.existsSync(c)) || null;
}

/** A headless browser and its one page, driven over the DevTools protocol. */
async function launchBrowser(exe) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'zbrowser-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--window-size=1280,800'];
  // Ubuntu runners restrict the namespaces Chrome's sandbox needs; these pages are our own.
  if (process.platform === 'linux') args.push('--no-sandbox');
  const proc = spawn(exe, [...args, 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0].trim();
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) listeners.forEach(l => l(msg));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const once = (method, ms = 15000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { listeners.delete(l); reject(new Error(`timed out waiting for ${method}`)); }, ms);
    const l = msg => { if (msg.method === method) { clearTimeout(timer); listeners.delete(l); resolve(msg.params); } };
    listeners.add(l);
  });
  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    /** The value of an async function body evaluated in the page. */
    async eval(body) {
      const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
      return r.result.value;
    },
    /** Poll a condition in the page until it is truthy; returns its value, or null on timeout. */
    async waitFor(expr, ms = 8000) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const v = await page.eval(`return (${expr});`).catch(() => null);
        if (v) return v;
        await sleep(100);
      }
      return null;
    },
    /** Load a URL and wait for the docs app to have drawn its sidebar. */
    async goto(url) {
      const loaded = once('Page.loadEventFired');
      await send('Page.navigate', { url });
      await loaded;
      await page.waitFor("document.querySelectorAll('#navtree a').length > 0");
    },
    async reload() {
      const loaded = once('Page.loadEventFired');
      await send('Page.reload', {});
      await loaded;
    },
    /** Move the real mouse over the first element matching a selector. */
    async hover(selector) {
      const r = await page.eval(`const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    },
    viewport: (width, height = 800) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }),
  };
  const close = async () => {
    try { ws.close(); } catch { /* already closed */ }
    proc.kill();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  return { page, close };
}

/** Build a site into a temp folder and serve it; resolves to { url, server, out }. */
async function buildAndServe(root) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zbuild-'));
  execFileSync(process.execPath, [path.join(ENGINE, 'build-static.js'), root], { env: { ...process.env, DOCS_OUT: out, DOCS_BASE: '' }, stdio: 'ignore' });
  const server = await serveStatic(out);
  return { url: `http://127.0.0.1:${server.address().port}`, server, out };
}

/** A small site with two top-level folders, for the search section filters. */
function scopeSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zscope-'));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  put('docs.config.json', JSON.stringify({ title: 'Scope' }));
  put('content/v1/index.md', '# Home\n\nStart here.\n');
  put('content/v1/alpha/index.md', '---\ntitle: Alpha\n---\nAlpha overview.\n');
  put('content/v1/alpha/one.md', '---\ntitle: Alpha one\n---\nIntro.\n\n## Reconcile in alpha\n\nAlpha reconcile details.\n\n## Reconcile again\n\nMore reconcile.\n');
  put('content/v1/beta/index.md', '---\ntitle: Beta\n---\nBeta overview.\n');
  put('content/v1/beta/two.md', '---\ntitle: Beta two\n---\nIntro.\n\n## Reconcile in beta\n\nBeta reconcile details.\n');
  return root;
}

(async () => {
  const exe = findBrowser();
  if (!exe) {
    const msg = 'no Chrome or Edge found (set CHROME_PATH)';
    if (process.env.CI) { console.log(`\n  Browser suite: ✖ ${msg}\n`); process.exit(1); }
    console.log(`\n  Browser suite: skipped, ${msg}\n`);
    process.exit(0);
  }
  if (typeof WebSocket !== 'function') { console.log('\n  Browser suite: ✖ needs Node 22 or later (built-in WebSocket)\n'); process.exit(1); }

  const cleanup = [];
  try {
    const { page, close } = await launchBrowser(exe);
    cleanup.push(close);
    const demo = await buildAndServe(EXAMPLE);
    cleanup.push(() => { demo.server.closeAllConnections(); demo.server.close(); fs.rmSync(demo.out, { recursive: true, force: true }); });
    await page.viewport(1280);

    // ── First load: content in the HTML, search index not fetched ────────────
    await page.goto(`${demo.url}/docs/v1/authoring/code/`);
    ok('first load fetches no search index', await page.eval(
      "return !performance.getEntriesByType('resource').some(e => e.name.includes('search.json'));"));

    // ── Long code folds; Show all opens it ───────────────────────────────────
    const fold = await page.eval(`
      const pre = document.querySelector('#prose pre.fold');
      if (!pre) return null;
      const before = pre.querySelector('code').getBoundingClientRect().height;
      const label = pre.querySelector('.fold-btn').textContent;
      pre.querySelector('.fold-btn').click();
      return { label, before, after: pre.querySelector('code').getBoundingClientRect().height, still: pre.classList.contains('fold') };`);
    ok('a long code block folds, and Show all opens it', fold && fold.label === 'Show all 40 lines' && fold.after > fold.before * 1.3 && !fold.still);
    ok('marked code lines are drawn', await page.eval(`
      const ins = document.querySelector('#prose .ln-ins'), del = document.querySelector('#prose .ln-del');
      return !!ins && !!del && getComputedStyle(ins).backgroundColor !== getComputedStyle(del).backgroundColor;`));

    // ── Sidebar filter ───────────────────────────────────────────────────────
    const filtered = await page.eval(`
      const f = document.getElementById('navfilter');
      f.value = 'tabs'; f.dispatchEvent(new Event('input'));
      const titles = [...document.querySelectorAll('#navtree a.ni .ni-label')].map(a => a.textContent);
      f.value = ''; f.dispatchEvent(new Event('input'));
      return { titles, all: document.querySelectorAll('#navtree a.ni').length };`);
    ok('the sidebar filter keeps matches and their folders', JSON.stringify(filtered.titles) === JSON.stringify(['Authoring Guide', 'Tabs & Media']) && filtered.all > 5);
    ok('Enter in the filter opens the first match', await page.eval(`
      const f = document.getElementById('navfilter');
      f.value = 'callouts'; f.dispatchEvent(new Event('input'));
      f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      f.value = ''; f.dispatchEvent(new Event('input'));
      await new Promise(r => setTimeout(r, 500));
      return location.pathname === '/docs/v1/authoring/callouts';`));

    // ── Sidebar collapse, remembered across a reload ─────────────────────────
    await page.eval("document.getElementById('hbg').click();");
    await page.reload();
    ok('the collapsed sidebar stays collapsed after a reload', await page.waitFor(
      "document.documentElement.classList.contains('nav-collapsed') && getComputedStyle(document.getElementById('sidebar')).display === 'none'"));
    await page.eval("document.getElementById('hbg').click();");
    ok('the menu button brings the sidebar back', await page.eval("return getComputedStyle(document.getElementById('sidebar')).display !== 'none';"));

    // ── Glossary ─────────────────────────────────────────────────────────────
    await page.goto(`${demo.url}/docs/v1/`);
    const glossBefore = await page.eval("const g = document.querySelector('#prose .gloss'); return g ? { text: g.textContent, tip: getComputedStyle(g, '::after').content, count: document.querySelectorAll('#prose .gloss').length } : null;");
    await page.eval("document.querySelector('#prose .gloss').scrollIntoView({ block: 'center' });");
    await page.hover('#prose .gloss');
    const glossTip = await page.eval("return getComputedStyle(document.querySelector('#prose .gloss'), '::after').content;");
    ok('a glossary term shows its definition on hover, only then, once per page', glossBefore && glossBefore.text.toLowerCase() === 'frontmatter'
      && glossBefore.tip === 'none' && glossTip.startsWith('"The --- block') && glossBefore.count <= 2);

    // ── Report an issue ──────────────────────────────────────────────────────
    ok('Report an issue opens a prefilled issue for this page', await page.eval(`
      const a = document.querySelector('.page-actions a[aria-label="Report an issue with this page"]');
      if (!a) return false;
      const u = new URL(a.href);
      return u.origin + u.pathname === 'https://github.com/FirstGearGames/ZeroDocs/issues/new'
        && u.searchParams.get('title') === 'Docs: ZeroDocs Demo'
        && u.searchParams.get('body').startsWith('Page: https://firstgeargames.github.io/ZeroDocs/docs/v1');`));

    // ── Tables: a linked row, and a header that stays in view ───────────────
    await page.goto(`${demo.url}/docs/v1/authoring/markdown-basics/#isserver`);
    const table = await page.eval(`
      await new Promise(r => setTimeout(r, 400));
      const row = document.getElementById('isserver');
      const th = row.closest('table').querySelector('th');
      return { anchor: row.querySelector('.hanchor').getAttribute('href'), fits: row.closest('.table-wrap').classList.contains('fits'),
        sticky: getComputedStyle(th).position, top: getComputedStyle(th).top, rowTop: Math.round(row.getBoundingClientRect().top) };`);
    ok('a table row has its own link and the page lands on it', table.anchor === '#isserver' && table.rowTop >= 56 && table.rowTop < 200);
    ok('a table that fits keeps its header in view', table.fits && table.sticky === 'sticky' && table.top === '56px');

    // ── Dark-mode image twins ────────────────────────────────────────────────
    await page.goto(`${demo.url}/docs/v1/authoring/images/`);
    const twins = await page.eval(`
      const shown = () => [...document.querySelectorAll('#prose img[src*="theme-demo"]')].filter(i => getComputedStyle(i).display !== 'none').map(i => i.getAttribute('src'));
      const dark = document.documentElement.classList.contains('dark');
      const first = shown();
      document.getElementById('theme-toggle').click();
      const second = shown();
      document.getElementById('theme-toggle').click();
      return { dark, first, second };`);
    ok('the theme toggle swaps an image for its dark twin', twins.first.length === 1 && twins.second.length === 1 && twins.first[0] !== twins.second[0]
      && (twins.dark ? twins.first[0].endsWith('.dark.svg') : twins.second[0].endsWith('.dark.svg')));

    // ── Narrow screens: the contents box under the title ────────────────────
    await page.viewport(375, 812);
    const narrow = await page.eval(`
      const d = document.getElementById('toc-inline');
      const visible = getComputedStyle(d).display !== 'none';
      d.open = true;
      const link = [...d.querySelectorAll('.toc-a')].find(a => a.textContent.includes('Dark-mode'));
      link.click();
      await new Promise(r => setTimeout(r, 1500));
      return { visible, side: getComputedStyle(document.getElementById('toc')).display, open: d.open, hash: location.hash,
        top: Math.round(document.getElementById('dark-mode-images').getBoundingClientRect().top) };`);
    ok('narrow screens show the contents box, not the side list', narrow.visible && narrow.side === 'none');
    ok('a contents box link folds the box and lands on the heading', !narrow.open && narrow.hash === '#dark-mode-images' && narrow.top > 50 && narrow.top < 120);
    ok('the phone header puts the toolbar under the breadcrumb', await page.eval(`
      const bc = document.getElementById('bc').getBoundingClientRect(), tools = document.getElementById('edittop').getBoundingClientRect();
      return tools.top >= bc.bottom - 1;`));
    await page.viewport(1280);

    // ── Search: grouped results, section filters, highlights ────────────────
    const scopeRoot = scopeSite();
    const scope = await buildAndServe(scopeRoot);
    cleanup.push(() => { scope.server.closeAllConnections(); scope.server.close(); fs.rmSync(scope.out, { recursive: true, force: true }); fs.rmSync(scopeRoot, { recursive: true, force: true }); });
    await page.goto(`${scope.url}/docs/v1/`);
    await page.eval(`
      document.getElementById('search-open').click();
      const i = document.getElementById('sinput');
      i.value = 'reconcile'; i.dispatchEvent(new Event('input'));`);
    await page.waitFor("document.querySelectorAll('#sresults .sitem').length > 0");
    const results = await page.eval(`
      const rows = [...document.querySelectorAll('#sresults .sitem')].map(a => ({ sub: a.classList.contains('sub'), href: a.getAttribute('href') }));
      const chips = [...document.querySelectorAll('#schips .schip')].map(c => c.textContent);
      return { rows, chips, fetched: performance.getEntriesByType('resource').some(e => e.name.includes('search.json')) };`);
    ok('opening search fetches the index', results.fetched);
    ok('results group by page, sections indented under their page', results.rows.length === 5
      && JSON.stringify(results.rows.map(r => r.sub)) === JSON.stringify([false, true, true, false, true])
      && results.rows[1].href.startsWith(results.rows[0].href + '#'));
    ok('the top-level folders become section filters', JSON.stringify(results.chips) === JSON.stringify(['All', 'Alpha', 'Beta']));
    const scoped = await page.eval(`
      const i = document.getElementById('sinput');
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      const pressed = document.querySelector('.schip[aria-pressed="true"]').textContent;
      const hrefs = [...document.querySelectorAll('#sresults .sitem')].map(a => a.getAttribute('href'));
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
      return { pressed, hrefs, back: document.querySelector('.schip[aria-pressed="true"]').textContent };`);
    ok('Tab narrows search to a section, Shift+Tab steps back', scoped.pressed === 'Alpha' && scoped.hrefs.length === 3
      && scoped.hrefs.every(h => h.startsWith('/docs/v1/alpha')) && scoped.back === 'All');
    await page.eval(`
      const i = document.getElementById('sinput');
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));`);
    const hits = await page.waitFor(`location.pathname === '/docs/v1/alpha/one' && document.querySelectorAll('#prose mark.hit').length > 0
      && { marks: document.querySelectorAll('#prose mark.hit').length, inText: (document.getElementById('prose').textContent.match(/reconcile/gi) || []).length, label: document.getElementById('search-label').textContent,
           clear: !document.getElementById('search-clear').hidden, open: document.getElementById('smodal').classList.contains('open') }`);
    ok('the opened page highlights the query, and the header shows it', hits && hits.marks === hits.inText && hits.marks >= 4 && hits.label === 'reconcile' && hits.clear && !hits.open);
    await page.eval(`document.querySelector('#navtree a[href="/docs/v1/beta/two"]').click();`);
    ok('highlights follow to the next page while the query stays', await page.waitFor(
      "location.pathname === '/docs/v1/beta/two' && document.querySelectorAll('#prose mark.hit').length === (document.getElementById('prose').textContent.match(/reconcile/gi) || []).length && document.querySelectorAll('#prose mark.hit').length >= 2"));
    ok('clearing the search removes the highlights', await page.eval(`
      document.getElementById('search-clear').click();
      return document.querySelectorAll('#prose mark.hit').length === 0 && document.getElementById('search-label').textContent === 'Search'
        && document.getElementById('search-clear').hidden;`));

    // ── Offline reading (last: it stops the demo's server) ──────────────────
    await page.goto(`${demo.url}/docs/v1/authoring/callouts/`);
    ok('the offline worker takes control of the page', await page.waitFor('!!navigator.serviceWorker.controller', 10000));
    await page.waitFor("caches.keys().then(k => k.length ? caches.open(k[0]).then(c => c.match(location.pathname)).then(Boolean) : false)", 5000);
    demo.server.closeAllConnections();
    demo.server.close();
    await page.reload();
    ok('with the server gone, a page read before reloads whole', await page.waitFor(
      "document.getElementById('ptitle').textContent.startsWith('Callouts') && document.querySelectorAll('#navtree a').length > 5 && document.querySelectorAll('#prose blockquote').length > 3"));
    await page.goto(`${demo.url}/docs/v1/authoring/components/`).catch(() => {});
    ok('a page never read shows the offline notice', await page.waitFor("document.title === 'Offline'", 5000));
  } catch (e) {
    failures.push(`suite crashed: ${e && e.stack || e}`);
  } finally {
    for (const c of cleanup.reverse()) { try { await c(); } catch { /* best effort */ } }
  }

  const total = pass + failures.length;
  console.log(`\n  Browser suite: ${pass}/${total} passed (${path.basename(exe)})`);
  if (failures.length) {
    console.log('\n  FAILED:');
    for (const f of failures) console.log(`    ✖ ${f}`);
    console.log('');
    process.exit(1);
  }
  console.log('  ✓ all checks passed\n');
  process.exit(0);
})();
