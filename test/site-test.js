#!/usr/bin/env node
'use strict';
/**
 * Live site suite: what a browser or crawler actually receives.
 *
 * Builds the example site with build-static.js, serves the output over real
 * HTTP on loopback, and starts the preview server the same way, then fetches
 * pages through real sockets and checks what comes back. Zero dependencies.
 *
 * Run:  node test/site-test.js   (or: npm test)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ENGINE = path.join(__dirname, '..');
const EXAMPLE = path.join(ENGINE, 'example-site');

let pass = 0;
const failures = [];
const ok = (name, cond) => { if (cond) pass++; else failures.push(name); };

/** A plain static file server over the build output, the way a static host serves it. */
function serveStatic(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.md': 'text/markdown' };
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(path.join(root, '404.html')));
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const get = async (server, urlPath) => {
  const r = await fetch(`http://127.0.0.1:${server.address().port}${urlPath}`, { redirect: 'manual' });
  return { status: r.status, text: await r.text() };
};
const pageData = html => {
  const m = html.match(/<script type="application\/json" id="page-data">([\s\S]*?)<\/script>/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
};
const prose = html => (html.match(/<div id="prose" class="prose">([\s\S]*?)<\/div>\s*<div id="pagefoot">/) || [])[1] || '';

(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'zsite-'));
  const servers = [];
  try {
    execFileSync(process.execPath, [path.join(ENGINE, 'build-static.js'), EXAMPLE], { env: { ...process.env, DOCS_OUT: out, DOCS_BASE: '' }, stdio: 'ignore' });
    const stat = await serveStatic(out);
    servers.push(stat);

    // ── Pages arrive rendered (static build) ────────────────────────────────
    const reuse = await get(stat, '/docs/v1/authoring/reuse/');
    ok('static page served', reuse.status === 200);
    ok('static page carries its content', prose(reuse.text).includes('Install version 2.0.0') && prose(reuse.text).includes('greet.js'));
    ok('static page title rendered in', reuse.text.includes('<h1 id="ptitle" class="ptitle" tabindex="-1">Includes &amp; Variables</h1>'));
    const data = pageData(reuse.text);
    ok('static page hands the client its metadata, without the HTML twice', data && data.title === 'Includes & Variables' && data.slug === 'authoring/reuse' && !('html' in data));
    ok('static page readable without JavaScript', !reuse.text.includes('requires JavaScript'));
    ok('static page has the folding contents list for narrow screens', reuse.text.includes('<details id="toc-inline" class="toc-inline" hidden><summary>On this page</summary>'));
    const home = await get(stat, '/docs/v1/');
    ok('static version landing page carries its content', prose(home.text).length > 200 && pageData(home.text).slug === '');
    ok('static page links its public address', reuse.text.includes('<link rel="canonical" href="https://firstgeargames.github.io/ZeroDocs/docs/v1/authoring/reuse"/>'));
    const sitemap = await get(stat, '/sitemap.xml');
    ok('sitemap lists absolute URLs', sitemap.text.includes('<loc>https://firstgeargames.github.io/ZeroDocs/docs/v1/authoring/reuse</loc>'));
    const missing = await get(stat, '/docs/v1/no-such-page/');
    ok('404 page stays a plain shell', missing.status === 404 && !pageData(missing.text) && missing.text.includes('requires JavaScript'));

    // ── The preview server renders the same way ─────────────────────────────
    const { createSite } = require(path.join(ENGINE, 'lib', 'site'));
    const { createDocsServer } = require(path.join(ENGINE, 'lib', 'server'));
    const { server: live } = createDocsServer(createSite(EXAMPLE, { drafts: true }), { engineDir: ENGINE, engineVersion: 'test' });
    await new Promise(resolve => live.listen(0, '127.0.0.1', resolve));
    servers.push(live);
    const liveReuse = await get(live, '/docs/v1/authoring/reuse');
    ok('preview server page carries its content', liveReuse.status === 200 && prose(liveReuse.text).includes('Install version 2.0.0') && pageData(liveReuse.text).title === 'Includes & Variables');
  } catch (e) {
    failures.push(`suite crashed: ${e && e.stack || e}`);
  } finally {
    servers.forEach(s => { s.closeAllConnections(); s.close(); });
    fs.rmSync(out, { recursive: true, force: true });
  }

  const total = pass + failures.length;
  console.log(`\n  Site suite: ${pass}/${total} passed`);
  if (failures.length) {
    console.log('\n  FAILED:');
    for (const f of failures) console.log(`    ✖ ${f}`);
    console.log('');
    process.exit(1);
  }
  console.log('  ✓ all checks passed\n');
  process.exit(0);
})();
