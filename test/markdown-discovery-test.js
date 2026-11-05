#!/usr/bin/env node
'use strict';

// Follow advertised Markdown links over HTTP; no browser or third-party modules.
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const { once } = require('events');
const ROOT = path.join(__dirname, '..');

if (process.argv[2] === 'serve-live') {
  const { createSite } = require('../lib/site');
  const { createDocsServer } = require('../lib/server');
  const { server } = createDocsServer(createSite(process.argv[3]), { engineDir: ROOT, engineVersion: 'test' });
  server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
} else {
  main().catch(err => { console.error(err); process.exitCode = 1; });
}

function linkHref(html, rel, type) {
  const tag = (html.match(/<link\b[^>]*>/g) || []).find(tag =>
    tag.includes(`rel="${rel}"`) && (!type || tag.includes(`type="${type}"`)));
  const href = tag && tag.match(/\bhref="([^"]*)"/);
  return href ? href[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : null;
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, url);
  return { body: await response.text(), type: response.headers.get('content-type') };
}

async function staticServer(dir, prefix) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (!pathname.startsWith(prefix + '/')) { res.writeHead(404); res.end(); return; }
    let file = path.resolve(dir, '.' + decodeURIComponent(pathname.slice(prefix.length)));
    if (!file.startsWith(dir + path.sep)) { res.writeHead(404); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.md') ? 'text/markdown' : file.endsWith('.txt') ? 'text/plain' : 'text/html');
    res.end(fs.readFileSync(file));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function liveServer(dir) {
  const child = spawn(process.execPath, [__filename, 'serve-live', dir], {
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'], windowsHide: true,
  });
  const timer = setTimeout(() => child.kill(), 10000);
  try {
    const [{ port }] = await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(([code]) => { throw new Error(`Live server exited before startup (${code})`); }),
    ]);
    return { child, origin: `http://127.0.0.1:${port}` };
  } catch (err) {
    child.kill();
    throw err;
  } finally { clearTimeout(timer); }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zerodocs-discovery-'));
  const pages = [
    { version: 'v1', slug: '', file: 'index.md', title: 'Home' },
    { version: 'v1', slug: 'guides', file: 'guides/index.md', title: 'Guides' },
    { version: 'v1', slug: 'guides/install', file: 'guides/install.md', title: 'Install' },
    { version: 'v1', slug: 'guides/tips #1', file: 'guides/tips #1.md', title: 'Tips' },
    { version: 'v1', slug: 'guides/closing)note', file: 'guides/closing)note.md', title: 'Parenthesis' },
    { version: 'v2', slug: 'only', file: 'only.md', title: 'Version two' },
  ];
  for (const page of pages) {
    page.raw = `---\ntitle: "${page.title}"\n---\n\n# ${page.title}\n\nSource ${page.version}/${page.file}.\n`;
    const file = path.join(dir, 'content', page.version, page.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, page.raw);
  }
  fs.writeFileSync(path.join(dir, 'docs.config.json'), JSON.stringify({ title: 'Discovery fixture', versions: ['v1', 'v2'] }));

  let passed = 0;
  const failures = [];
  const check = async (name, run) => {
    try { await run(); passed++; } catch (err) { failures.push(`${name}: ${err.message}`); }
  };
  try {
    for (const prefix of ['', '/manual']) {
      const out = path.join(dir, prefix ? 'out-subpath' : 'out-root');
      execFileSync(process.execPath, [path.join(ROOT, 'build-static.js')], {
        env: { ...process.env, DOCS_ROOT: dir, DOCS_OUT: out, DOCS_BASE: prefix }, stdio: 'pipe', windowsHide: true,
      });
      const { server, origin } = await staticServer(out, prefix);
      try {
        await check(`static ${prefix || '/'} index links fetch exact Markdown`, () => checkIndex(origin, prefix, pages));
        await check(`static ${prefix || '/'} page metadata links fetch exact Markdown`, async () => {
          for (const page of pages) {
            const route = `${prefix}/docs/${page.version}/${page.slug.split('/').map(encodeURIComponent).join('/')}`;
            await checkPage(origin, route, prefix, page.raw);
          }
        });
        await check(`static ${prefix || '/'} absent pages do not advertise Markdown`, async () => {
          for (const route of [`${prefix}/404.html`, `${prefix}/docs/v2/`]) {
            const { body } = await get(origin + route);
            assert.equal(linkHref(body, 'alternate', 'text/markdown'), null);
            assert.equal(linkHref(body, 'describedby'), prefix + '/llms.txt');
          }
        });
        await check(`static ${prefix || '/'} full export preserves human URL and body`, async () => {
          const { body } = await get(origin + prefix + '/llms-full.txt');
          assert.ok(body.includes(`URL: ${prefix}/docs/v1/guides\n\n# Guides\n\nSource v1/guides/index.md.`));
        });
      } finally { await new Promise(resolve => server.close(resolve)); }
    }

    const { child, origin } = await liveServer(dir);
    try {
      await check('live index links fetch exact Markdown', () => checkIndex(origin, '', pages));
      await check('live page metadata links fetch exact Markdown', async () => {
        // These routes already resolve in the live renderer; the index also covers encoded filenames.
        for (const page of pages.filter(p => !p.slug.includes('#'))) {
          await checkPage(origin, `/docs/${page.version}/${page.slug}`, '', page.raw);
        }
      });
      await check('live absent pages do not advertise Markdown', async () => {
        for (const route of ['/docs/v1/missing', '/docs/v2/', '/docs/v9/']) {
          const { body } = await get(origin + route);
          assert.equal(linkHref(body, 'alternate', 'text/markdown'), null);
          assert.equal(linkHref(body, 'describedby'), '/llms.txt');
        }
      });
      await check('live full export preserves human URL and body', async () => {
        const { body } = await get(origin + '/llms-full.txt');
        assert.ok(body.includes(`URL: ${origin}/docs/v1/guides\n\n# Guides\n\nSource v1/guides/index.md.`));
      });
    } finally {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }

    await check('new metadata encodes page identifiers and escapes attributes', () => {
      const { renderShell } = require('../lib/shell');
      const html = renderShell({ config: {}, versions: ['v1'], page: { title: 'Example', version: 'v1', slug: 'guide"&name' }, staticMode: true, basePath: '/manual' });
      assert.equal(linkHref(html, 'alternate', 'text/markdown'), '/manual/data/v1/raw/guide%22%26name.md');
      assert.ok(!html.includes('href="/manual/data/v1/raw/guide"&name'));
    });
  } finally {
    // Only remove the fixture directory created by this process.
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('zerodocs-discovery-'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n  Markdown discovery suite: ${passed}/${passed + failures.length} passed`);
  for (const failure of failures) console.error(`  FAIL: ${failure}`);
  if (failures.length) process.exitCode = 1;
}

async function checkIndex(origin, prefix, pages) {
  const { body } = await get(origin + prefix + '/llms.txt');
  const links = [...body.matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)].map(m => m[1]);
  assert.equal(links.length, pages.length);
  const received = [];
  for (const link of links) {
    const response = await get(new URL(link, origin + prefix + '/llms.txt').href);
    assert.match(response.type, /^text\/markdown\b/);
    received.push(response.body);
  }
  assert.deepEqual(received.sort(), pages.map(p => p.raw).sort());
}

async function checkPage(origin, route, prefix, expected) {
  const { body } = await get(origin + route);
  const alternate = linkHref(body, 'alternate', 'text/markdown');
  assert.ok(alternate, `Missing Markdown alternate on ${route}`);
  assert.equal(linkHref(body, 'describedby'), prefix + '/llms.txt');
  const raw = await get(new URL(alternate, origin + route).href);
  assert.match(raw.type, /^text\/markdown\b/);
  assert.equal(raw.body, expected);
}
