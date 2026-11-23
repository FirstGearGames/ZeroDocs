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
const { execFileSync } = require('child_process');
const { serveStatic } = require('./serve');

const ENGINE = path.join(__dirname, '..');
const EXAMPLE = path.join(ENGINE, 'example-site');

let pass = 0;
const failures = [];
const ok = (name, cond) => { if (cond) pass++; else failures.push(name); };

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
    ok('static page ships the search filters and the clear button', reuse.text.includes('<div class="schips" id="schips" role="group" aria-label="Search in" hidden></div>')
      && reuse.text.includes('<span id="search-label">Search</span>') && reuse.text.includes('id="search-clear"'));
    ok('static page has the folding contents list for narrow screens', reuse.text.includes('<details id="toc-inline" class="toc-inline" hidden><summary>On this page</summary>'));
    ok('static page ships the sidebar filter', reuse.text.includes('<input id="navfilter" type="search"'));
    const code = await get(stat, '/docs/v1/authoring/code/');
    ok('static code page carries marked lines', prose(code.text).includes('<span class="ln ln-ins">') && prose(code.text).includes('<span class="ln ln-hl">'));
    const home = await get(stat, '/docs/v1/');
    ok('static version landing page carries its content', prose(home.text).length > 200 && pageData(home.text).slug === '');
    ok('static page links its public address', reuse.text.includes('<link rel="canonical" href="https://firstgeargames.github.io/ZeroDocs/docs/v1/authoring/reuse"/>'));
    const sitemap = await get(stat, '/sitemap.xml');
    ok('sitemap lists absolute URLs', sitemap.text.includes('<loc>https://firstgeargames.github.io/ZeroDocs/docs/v1/authoring/reuse</loc>'));
    const sw = await get(stat, '/sw.js');
    const assetsHash = require('crypto').createHash('sha1')
      .update(fs.readFileSync(path.join(ENGINE, 'assets', 'app.css'))).update(fs.readFileSync(path.join(ENGINE, 'assets', 'app.js')))
      .digest('hex').slice(0, 12);
    ok('asset URLs carry a hash of the assets, so a change is a new URL', reuse.text.includes(`/assets/app.css?v=${assetsHash}"`) && reuse.text.includes(`/assets/app.js?v=${assetsHash}"`));
    ok('static build serves its offline worker, precaching assets and the sidebar', sw.status === 200
      && sw.text.includes(`const CACHE = "zerodocs-${assetsHash}";`)
      && sw.text.includes(`"/assets/app.js?v=${assetsHash}"`) && sw.text.includes('"/data/v1/nav.json"'));
    const precached = JSON.parse((sw.text.match(/const PRECACHE = (\[.*\]);/) || [])[1] || '[]');
    ok('every precached file exists in the build', precached.length > 0 && (await Promise.all(precached.map(u => get(stat, u)))).every(r => r.status === 200));
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

    // ── A broken link stops the build before it writes anything ─────────────
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'zbad-'));
    try {
      fs.mkdirSync(path.join(bad, 'content', 'v1'), { recursive: true });
      fs.writeFileSync(path.join(bad, 'content', 'v1', 'index.md'), '# Home\n\n[gone](./nope.md)\n');
      const badOut = path.join(bad, 'out');
      let code = 0, stderr = '';
      try { execFileSync(process.execPath, [path.join(ENGINE, 'build-static.js'), bad], { env: { ...process.env, DOCS_OUT: badOut }, stdio: 'pipe' }); }
      catch (e) { code = e.status; stderr = String(e.stderr); }
      ok('a broken link fails the build, names the link, and writes nothing', code === 1 && stderr.includes('/docs/v1: links to /docs/v1/nope, which is not a page') && !fs.existsSync(badOut));
    } finally { fs.rmSync(bad, { recursive: true, force: true }); }
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
