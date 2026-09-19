#!/usr/bin/env node
'use strict';
/**
 * Static-site generator for ZeroDocs.
 *
 * The live server (preview-server.js) is a local authoring tool. For hosting
 * on a static platform (Cloudflare Pages, GitHub Pages, any bucket + CDN) this
 * script renders the whole site to a folder of plain files: one HTML page per
 * route, the JSON the client reads (under /data/), the engine assets, and the
 * crawler/redirect files. There is no runtime, everything is pre-rendered, so
 * nothing on the public origin ever executes untrusted content.
 *
 * The renderers are the same ones the server uses (lib/*), so a static build
 * is byte-for-byte the hardened output; only the transport differs.
 *
 * Site root:  DOCS_ROOT env / first CLI arg / cwd   (see lib/site.js)
 * Output dir: DOCS_OUT env / <root>/out
 */

const fs = require('fs');
const path = require('path');

const { createSite } = require('./lib/site');
const { buildNav } = require('./lib/navigation');
const { buildSearchIndex } = require('./lib/search');
const contentLib = require('./lib/content');
const { renderShell, renderFavicon } = require('./lib/shell');

const ENGINE_DIR = __dirname;
const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE_DIR, 'package.json'), 'utf8')); } catch { return {}; } })();
const ASSETS_VER = process.env.DOCS_ASSETS_VER || String(pkg.version || Date.now());

/** Write a file, creating parent directories as needed. */
function write(outFile, data) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, data);
}

/** Recursively copy a directory tree (used for static/ and assets/). */
function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
  }
}

function build() {
  const site = createSite();
  const config = site.loadConfig();
  const versions = site.versions(config);
  const outDir = path.resolve(process.env.DOCS_OUT || path.join(site.root, 'out'));
  // Sub-path the site is served under (e.g. '/ZeroDocs' on a GitHub Pages
  // project site). Empty for a domain root (Cloudflare Pages, custom domain).
  let basePath = process.env.DOCS_BASE || '';
  if (basePath && !basePath.startsWith('/')) basePath = '/' + basePath;
  basePath = basePath.replace(/\/$/, '');

  if (!fs.existsSync(site.contentDir)) {
    console.error(`  ✖ No content/ folder under ${site.root}. Set DOCS_ROOT to your site.`);
    process.exit(1);
  }

  // Clean the output dir so removed pages don't linger.
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // ── Engine assets + site statics + favicon ────────────────────────────────
  copyDir(path.join(ENGINE_DIR, 'assets'), path.join(outDir, 'assets'));
  copyDir(site.staticDir, path.join(outDir, 'static'));

  const shippedFavicon = ['favicon.svg', 'favicon.ico', 'favicon.png'].find(n => fs.existsSync(path.join(site.staticDir, n)));
  if (shippedFavicon) fs.copyFileSync(path.join(site.staticDir, shippedFavicon), path.join(outDir, shippedFavicon.endsWith('.svg') ? 'favicon.svg' : shippedFavicon));
  else write(path.join(outDir, 'favicon.svg'), renderFavicon(config));

  // ── Per-version data + pre-rendered pages ─────────────────────────────────
  const shell = (page) => renderShell({ config, versions, page, assetsVer: ASSETS_VER, staticMode: true, basePath });
  let pageCount = 0;

  write(path.join(outDir, 'data', 'config.json'), JSON.stringify(config));

  for (const v of versions) {
    write(path.join(outDir, 'data', v, 'nav.json'), JSON.stringify(buildNav(site, v)));
    write(path.join(outDir, 'data', v, 'search.json'), JSON.stringify(buildSearchIndex(site, v)));

    // The version landing page (slug '').
    const rootPayload = contentLib.buildDocPayload(site, config, v, '');
    if (rootPayload) {
      write(path.join(outDir, 'data', v, 'doc', 'index.json'), JSON.stringify(rootPayload));
      const rawRoot = contentLib.getRawPage(site, v, '');
      if (rawRoot !== null) write(path.join(outDir, 'data', v, 'raw', 'index.md'), rawRoot);
      write(path.join(outDir, 'docs', v, 'index.html'), shell({ title: rootPayload.title, description: rootPayload.description }));
      pageCount++;
    } else {
      write(path.join(outDir, 'docs', v, 'index.html'), shell(null));
    }

    for (const p of contentLib.listPages(site, v)) {
      if (p.href === `/docs/${v}`) continue;          // already handled as the landing page
      const slug = p.slug;                             // version-relative, e.g. "guides/install"
      const payload = contentLib.buildDocPayload(site, config, v, slug);
      if (!payload) continue;
      write(path.join(outDir, 'data', v, 'doc', `${slug}.json`), JSON.stringify(payload));
      const raw = contentLib.getRawPage(site, v, slug);
      if (raw !== null) write(path.join(outDir, 'data', v, 'raw', `${slug}.md`), raw);
      write(path.join(outDir, 'docs', v, slug, 'index.html'), shell({ title: payload.title, description: payload.description }));
      pageCount++;
    }
  }

  // ── Root + SPA fallback pages ─────────────────────────────────────────────
  const defaultVersion = site.defaultVersion(config);
  const rootRedirect = `${basePath}/docs/${defaultVersion}`;
  write(path.join(outDir, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(config.title || 'Docs')}</title>`
    + `<meta http-equiv="refresh" content="0; url=${rootRedirect}">`
    + `<link rel="canonical" href="${rootRedirect}"><script>location.replace(${JSON.stringify(rootRedirect)})</script>`
    + `<a href="${rootRedirect}">Documentation</a>`);
  // Deep links to not-yet-rendered routes fall back to the app shell (which
  // then shows its own styled 404); Cloudflare serves 404.html on a miss.
  write(path.join(outDir, '404.html'), shell(null));

  // GitHub Pages must not run Jekyll over the artifact (it would skip _-files).
  write(path.join(outDir, '.nojekyll'), '');

  // ── Crawler files ─────────────────────────────────────────────────────────
  writeCrawlerFiles(site, config, versions, outDir, basePath);

  // ── Cloudflare _headers / _redirects ──────────────────────────────────────
  writeHeaders(outDir);
  writeRedirects(config, rootRedirect, outDir, basePath);

  console.log('');
  console.log(`  ✓ ZeroDocs static build`);
  console.log(`  → Site:     ${site.root}`);
  console.log(`  → Output:   ${outDir}`);
  console.log(`  → Base:     ${basePath || '(root)'}`);
  console.log(`  → Versions: ${versions.join(', ')}`);
  console.log(`  → Pages:    ${pageCount}`);
  console.log('');
}

/** Minimal HTML escape for the tiny root redirect page. */
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** sitemap.xml, robots.txt, llms.txt, llms-full.txt (relative URLs, base-prefixed). */
function writeCrawlerFiles(site, config, versions, outDir, basePath) {
  const b = basePath || '';
  const urls = [];
  for (const v of versions) {
    urls.push(`  <url><loc>${b}/docs/${v}</loc></url>`);
    for (const p of contentLib.listPages(site, v)) {
      if (p.href === `/docs/${v}`) continue;
      urls.push(`  <url><loc>${escapeHtml(b + p.href)}</loc><lastmod>${p.mtime.toISOString().slice(0, 10)}</lastmod></url>`);
    }
  }
  write(path.join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
  write(path.join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${b}/sitemap.xml\n`);

  for (const kind of ['llms.txt', 'llms-full.txt']) {
    const full = kind === 'llms-full.txt';
    const lines = [`# ${config.title}`, ''];
    if (config.description) lines.push(config.description, '');
    for (const v of versions) {
      lines.push(`## ${v}`, '');
      for (const p of contentLib.listPages(site, v)) {
        if (full) lines.push('---', '', `# ${p.title}`, `URL: ${b}${p.href}`, '', p.content.trim(), '');
        else lines.push(`- [${p.title}](${b}${p.href})${p.description ? `: ${p.description}` : ''}`);
      }
      lines.push('');
    }
    write(path.join(outDir, kind), lines.join('\n'));
  }
}

/** Cloudflare _headers: the same security posture the live server sends. */
function writeHeaders(outDir) {
  const csp = "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; "
    + "frame-src https://www.youtube.com https://player.vimeo.com; img-src 'self' https: data:; "
    + "media-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'";
  const body = [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: no-referrer',
    `  Content-Security-Policy: ${csp}`,
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    '/static/*',
    '  Cache-Control: public, max-age=86400',
    '',
    '/data/*',
    '  Cache-Control: public, max-age=60',
    '',
  ].join('\n');
  write(path.join(outDir, '_headers'), body);
}

/** Cloudflare _redirects: root → default version, plus config.redirects. */
function writeRedirects(config, rootRedirect, outDir, basePath) {
  const b = basePath || '';
  const lines = [`${b || '/'}    ${rootRedirect}    302`];
  if (config.redirects && typeof config.redirects === 'object') {
    for (const [from, to] of Object.entries(config.redirects)) {
      const target = String(to);
      // Same-origin only (mirrors the server's open-redirect guard).
      if (from.startsWith('/') && target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')) {
        lines.push(`${b}${from}    ${b}${target}    301`);
      }
    }
  }
  write(path.join(outDir, '_redirects'), lines.join('\n') + '\n');
}

build();
