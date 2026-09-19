'use strict';
/**
 * HTTP server, routes, caching, live reload.
 *
 * Route map (GET/HEAD only):
 *   /api/config                     merged site config
 *   /api/nav?version=v              sidebar tree
 *   /api/doc?version=v&slug=s       rendered page payload
 *   /api/raw?version=v&slug=s       raw Markdown (text/markdown)
 *   /api/search?version=v           section-level search index
 *   /api/events                     Server-Sent Events, live reload
 *   /assets/*                       engine CSS/JS (ETag)
 *   /static/*                       site assets, nested paths (ETag)
 *   /favicon.svg                    site favicon or generated letter tile
 *   /sitemap.xml, /robots.txt       crawlers
 *   /llms.txt, /llms-full.txt       machine-readable content export
 *   /, /docs                        302 → default version
 *   /docs/*                         SPA shell (per-page meta injected)
 *
 * Security posture: binds 127.0.0.1 by default (HOST=0.0.0.0 to expose), no
 * CORS wildcard, version/slug sanitized before touching the filesystem,
 * static/asset paths containment-checked, and the whole handler is wrapped
 * so a bad request can never take the process down.
 *
 * Caching: nav/search/doc results are cached in memory and invalidated by
 * the content watcher (mtime-checked for docs, so stale serves are
 * impossible even if a watch event is missed). Static/asset responses use
 * ETag revalidation; API responses stay no-store, this is a live tool.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const contentLib = require('./content');
const { buildNav } = require('./navigation');
const { buildSearchIndex } = require('./search');
const { renderShell, renderErrorPage, renderFavicon } = require('./shell');
const { escHtml } = require('./util');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.pdf': 'application/pdf', '.zip': 'application/zip',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

/**
 * Security headers sent with every HTML response. The shell needs inline
 * script/style to boot without a flash, so those keep 'unsafe-inline', but a
 * `<script src>` injected via content still can't load (script-src is 'self'),
 * frames are limited to the video providers, and the page can't be framed.
 */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; frame-src https://www.youtube.com https://player.vimeo.com; img-src 'self' https: data:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
};

/** Cap concurrent live-reload streams so a client can't exhaust sockets. */
const MAX_SSE_CLIENTS = 64;

function createDocsServer(site, { engineDir, engineVersion }) {
  const assetsDir = path.join(engineDir, 'assets');

  // ── Caches, invalidated by the watcher ────────────────────────────────────
  const navCache = new Map();       // version → tree
  const searchCache = new Map();    // version → index
  const docCache = new Map();       // version|slug → { mtimeMs, payload }
  let watcherArmed = false;

  const invalidate = () => { navCache.clear(); searchCache.clear(); docCache.clear(); };

  // ── Live reload, SSE ─────────────────────────────────────────────────────
  const sseClients = new Set();

  function broadcast(type) {
    const frame = `data: ${JSON.stringify({ type })}\n\n`;
    for (const res of sseClients) { try { res.write(frame); } catch { sseClients.delete(res); } }
  }

  function armWatcher() {
    try {
      let pending = null;
      let pendingType = 'content';
      const watcher = fs.watch(site.root, { recursive: true }, (_event, fname) => {
        const name = String(fname || '').replace(/\\/g, '/');
        if (name.startsWith('.git') || name.includes('node_modules')) return;
        const type = name === 'docs.config.json' ? 'config' : name.startsWith('static/') ? 'static' : 'content';
        // config outranks content outranks static for the debounced event
        if (pendingType !== 'config') pendingType = type === 'config' ? 'config' : (pendingType === 'content' ? 'content' : type);
        clearTimeout(pending);
        pending = setTimeout(() => {
          invalidate();
          broadcast(pendingType);
          pendingType = 'content';
        }, 200);
      });
      watcher.on('error', () => { watcherArmed = false; });
      watcherArmed = true;
    } catch { watcherArmed = false; }
  }
  armWatcher();

  // ── Response helpers ──────────────────────────────────────────────────────
  const json = (res, data, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  const html = (res, body, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    res.end(body);
  };
  const text = (res, body, type = 'text/plain; charset=utf-8', code = 200) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  const notFoundPage = (res, message = 'Page not found') =>
    html(res, renderErrorPage(404, message, engineVersion), 404);

  /** Serve a file with ETag revalidation; true when handled (found). */
  function serveFile(req, res, file, extraHeaders = {}) {
    let stat;
    try { stat = fs.statSync(file); } catch { return false; }
    if (!stat.isFile()) return false;
    const etag = `W/"${stat.size}-${Math.round(stat.mtimeMs)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      res.end();
      return true;
    }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      ETag: etag,
      ...extraHeaders,
    };
    // Script-bearing SVGs must not run when navigated to directly.
    if (ext === '.svg') headers['Content-Security-Policy'] = 'sandbox';
    res.writeHead(200, headers);
    res.end(fs.readFileSync(file));
    return true;
  }

  /** Resolve a URL sub-path inside a base dir; null on traversal/escape. */
  function containedPath(baseDir, urlSubPath) {
    let decoded;
    try { decoded = decodeURIComponent(urlSubPath); } catch { return null; }
    if (decoded.includes('\0')) return null;
    const resolved = path.resolve(baseDir, '.' + path.posix.normalize('/' + decoded.replace(/\\/g, '/')));
    return resolved === baseDir || resolved.startsWith(baseDir + path.sep) ? resolved : null;
  }

  const requestVersion = (u, config) => {
    const v = contentLib.sanitizeVersion(u.searchParams.get('version') || site.defaultVersion(config));
    return v && site.versions(config).includes(v) ? v : null;
  };

  const absoluteBase = req => `http://${req.headers.host || 'localhost'}`;

  // ── Request handler ───────────────────────────────────────────────────────
  function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' });
      return res.end('Method not allowed');
    }

    const u = new URL(req.url, 'http://localhost');
    const pat = u.pathname;

    // Engine assets + site statics first, no config read on these hot paths.
    if (pat.startsWith('/assets/')) {
      const file = containedPath(assetsDir, pat.slice('/assets/'.length));
      if (file && serveFile(req, res, file)) return;
      return text(res, 'Not found', 'text/plain; charset=utf-8', 404);
    }
    if (pat.startsWith('/static/')) {
      const file = containedPath(site.staticDir, pat.slice('/static/'.length));
      if (file && serveFile(req, res, file)) return;
      return text(res, 'Not found', 'text/plain; charset=utf-8', 404);
    }

    const config = site.loadConfig();

    if (pat === '/api/config') return json(res, config);

    if (pat === '/api/nav') {
      const v = requestVersion(u, config);
      if (!v) return json(res, { error: 'Unknown version', status: 400 }, 400);
      if (watcherArmed && navCache.has(v)) return json(res, navCache.get(v));
      const tree = buildNav(site, v);
      if (watcherArmed) navCache.set(v, tree);
      return json(res, tree);
    }

    if (pat === '/api/doc') {
      const v = requestVersion(u, config);
      if (!v) return json(res, { error: 'Unknown version', status: 400 }, 400);
      const slug = u.searchParams.get('slug') || '';
      const parts = contentLib.sanitizeSlugParts(slug);
      if (parts === null) return json(res, { error: 'Invalid slug', status: 400 }, 400);

      // mtime-validated cache, correct even if a watch event is missed.
      const key = `${v}|${parts.join('/')}`;
      const page = contentLib.resolvePage(site, v, parts);
      if (!page) return json(res, { error: 'Not found', status: 404 }, 404);
      let mtimeMs = 0;
      try { mtimeMs = fs.statSync(page.file).mtimeMs; } catch { /* treat as uncached */ }
      const cached = docCache.get(key);
      if (cached && cached.mtimeMs === mtimeMs && mtimeMs !== 0) return json(res, cached.payload);

      const payload = contentLib.buildDocPayload(site, config, v, parts.join('/'));
      if (!payload) return json(res, { error: 'Not found', status: 404 }, 404);
      docCache.set(key, { mtimeMs, payload });
      return json(res, payload);
    }

    if (pat === '/api/raw') {
      const v = requestVersion(u, config);
      if (!v) return text(res, 'Unknown version', 'text/plain; charset=utf-8', 400);
      const raw = contentLib.getRawPage(site, v, u.searchParams.get('slug') || '');
      if (raw === null) return text(res, 'Not found', 'text/plain; charset=utf-8', 404);
      return text(res, raw, 'text/markdown; charset=utf-8');
    }

    if (pat === '/api/search') {
      const v = requestVersion(u, config);
      if (!v) return json(res, { error: 'Unknown version', status: 400 }, 400);
      if (watcherArmed && searchCache.has(v)) return json(res, searchCache.get(v));
      const index = buildSearchIndex(site, v);
      if (watcherArmed) searchCache.set(v, index);
      return json(res, index);
    }

    if (pat === '/api/events') {
      if (sseClients.size >= MAX_SSE_CLIENTS) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end('Too many live-reload clients'); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ type: 'hello', liveReload: watcherArmed })}\n\n`);
      sseClients.add(res);
      const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* cleaned below */ } }, 30000);
      req.on('close', () => { clearInterval(heartbeat); sseClients.delete(res); });
      return;
    }

    if (pat === '/favicon.svg' || pat === '/favicon.ico') {
      for (const name of ['favicon.svg', 'favicon.ico', 'favicon.png']) {
        if (serveFile(req, res, path.join(site.staticDir, name))) return;
      }
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache', 'Content-Security-Policy': 'sandbox' });
      return res.end(renderFavicon(config));
    }

    if (pat === '/sitemap.xml') {
      const base = absoluteBase(req);
      const urls = [];
      for (const v of site.versions(config)) {
        urls.push(`  <url><loc>${escHtml(`${base}/docs/${v}`)}</loc></url>`);
        for (const p of contentLib.listPages(site, v)) {
          if (p.href === `/docs/${v}`) continue;
          urls.push(`  <url><loc>${escHtml(base + p.href)}</loc><lastmod>${p.mtime.toISOString().slice(0, 10)}</lastmod></url>`);
        }
      }
      return text(res, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`, 'application/xml');
    }

    if (pat === '/robots.txt') {
      return text(res, `User-agent: *\nAllow: /\nSitemap: ${absoluteBase(req)}/sitemap.xml\n`);
    }

    // llms.txt, machine-readable outline + full-content export.
    if (pat === '/llms.txt' || pat === '/llms-full.txt') {
      const base = absoluteBase(req);
      const full = pat === '/llms-full.txt';
      const lines = [`# ${config.title}`, ''];
      if (config.description) lines.push(config.description, '');
      for (const v of site.versions(config)) {
        lines.push(`## ${v}`, '');
        for (const p of contentLib.listPages(site, v)) {
          if (full) {
            lines.push(`---`, ``, `# ${p.title}`, `URL: ${base}${p.href}`, '', p.content.trim(), '');
          } else {
            lines.push(`- [${p.title}](${base}${p.href})${p.description ? `: ${p.description}` : ''}`);
          }
        }
        lines.push('');
      }
      return text(res, lines.join('\n'), 'text/plain; charset=utf-8');
    }

    // Config-driven redirects: { "redirects": { "/docs/v1/old": "/docs/v1/new" } }
    if (config.redirects && typeof config.redirects === 'object' && config.redirects[pat]) {
      const target = String(config.redirects[pat]);
      // Same-origin paths only: reject protocol-relative (`//host`) and
      // backslash (`/\host`) targets that browsers treat as external, an
      // open redirect otherwise.
      if (target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')) {
        res.writeHead(301, { Location: target });
        return res.end();
      }
    }

    if (pat === '/' || pat === '/docs' || pat === '/docs/') {
      res.writeHead(302, { Location: `/docs/${site.defaultVersion(config)}` });
      return res.end();
    }

    if (pat.startsWith('/docs/')) {
      // Per-page metadata for crawlers/link previews (cheap: frontmatter only).
      const m = pat.match(/^\/docs\/([^/]+)(?:\/(.*))?$/);
      let page = null;
      if (m) {
        const v = contentLib.sanitizeVersion(m[1]);
        if (v) page = contentLib.getPageMeta(site, v, m[2] || '');
      }
      return html(res, renderShell({ config, versions: site.versions(config), page, assetsVer: engineVersion }));
    }

    return notFoundPage(res);
  }

  const server = http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      console.error(`  ✖ ${req.method} ${req.url}, ${err.message}`);
      try {
        if (req.url.startsWith('/api/')) json(res, { error: 'Internal server error', status: 500 }, 500);
        else html(res, renderErrorPage(500, 'Something went wrong', engineVersion), 500);
      } catch { /* headers already sent */ }
    }
  });

  return { server, watcherArmed: () => watcherArmed };
}

module.exports = { createDocsServer };
