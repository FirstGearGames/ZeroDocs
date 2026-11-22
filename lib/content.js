'use strict';
/**
 * Content resolution and page payloads.
 *
 * Everything that turns a (version, slug) pair into data: safe path
 * resolution (no traversal outside content/), frontmatter parsing, the
 * /api/doc payload, raw-Markdown access, whole-site page walks (search,
 * sitemap, llms.txt), and the startup broken-link report.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { readJson, readText } = require('./site');
const { mdToHtml } = require('./markdown');
const { safeUrl, slugToTitle } = require('./util');

// ─────────────────────────────────────────────────────────────────────────────
// Sanitizing + resolution
// ─────────────────────────────────────────────────────────────────────────────

/** A version name is a single safe path segment; null when it isn't. */
function sanitizeVersion(v) {
  return /^[A-Za-z0-9][\w.-]*$/.test(v) && !v.includes('..') ? v : null;
}

/**
 * Split a slug into safe path segments. Rejects traversal ('..'), hidden
 * segments, and backslashes; null when any segment is unsafe.
 */
function sanitizeSlugParts(slug) {
  const parts = String(slug || '').split('/').filter(Boolean);
  for (const part of parts) {
    if (part === '.' || part === '..' || part.startsWith('.') || part.includes('\\') || part.includes('\0')) return null;
  }
  return parts;
}

/**
 * Resolve a page to its Markdown file: `<parts>/index.md` wins over
 * `<parts>.md`. Confirms the resolved path stays inside content/ and
 * returns { file, isIndex } or null.
 */
function resolvePage(site, version, slugParts) {
  const base = path.join(site.contentDir, version, ...slugParts);
  const prefix = site.contentDir + path.sep;
  const contained = p => p.startsWith(prefix);

  const index = path.join(base, 'index.md');
  if (contained(index) && fs.existsSync(index)) return { file: index, isIndex: true };
  const leaf = `${base}.md`;
  if (contained(leaf) && fs.existsSync(leaf)) return { file: leaf, isIndex: false };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frontmatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a leading YAML-ish frontmatter block. Tolerates a UTF-8 BOM and a
 * closing --- at end-of-file. Returns { meta, content }.
 */
function parseFrontmatter(raw) {
  raw = raw.replace(/^﻿/, '');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)([\s\S]*)$/);
  if (!m) return { meta: {}, content: raw };
  const meta = {};
  m[1].split('\n').forEach(line => {
    const kv = line.match(/^([\w-]+):\s*"?(.+?)"?\s*$/);
    if (kv) meta[kv[1]] = kv[2];
  });
  return { meta, content: m[2] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading a page: line endings, includes, variables, drafts
// ─────────────────────────────────────────────────────────────────────────────

const MAX_INCLUDE_DEPTH = 8;

const realpathOrNull = p => { try { return fs.realpathSync(p); } catch { return null; } };

/**
 * The lines between `#region <name>` and its matching `#endregion`, in any
 * comment style (`#region` in C#, `//#region` in JS, `<!-- #region -->`…),
 * dedented, with nested region markers dropped. Null when there is no such
 * region.
 */
function extractRegion(text, name) {
  const out = [];
  let depth = 0;
  let found = false;
  for (const line of text.split('\n')) {
    const open = line.match(/#region\s+(\S+)/);
    if (!depth) {
      if (open && open[1] === name) { depth = 1; found = true; }
      continue;
    }
    if (open) { depth++; continue; }
    if (/#endregion\b/.test(line) && --depth === 0) break;
    if (!/#endregion\b/.test(line)) out.push(line);
  }
  if (!found) return null;
  const indent = Math.min(...out.filter(l => l.trim()).map(l => l.match(/^\s*/)[0].length));
  return out.map(l => l.slice(indent)).join('\n');
}

/** One `:::include` line's replacement text. */
function includeFile(site, spec, info, fromFile, stack) {
  const fail = why => `:::hint type="danger"\nCould not include ${spec}: ${why}.\n:::`;
  const [rel, region] = spec.split('#');
  const real = realpathOrNull(rel.startsWith('/') ? path.join(site.root, rel) : path.resolve(path.dirname(fromFile), rel));
  if (!real) return fail('no such file');
  // Content is untrusted (public pull requests), so an include may only read
  // the site's own files: never a file outside the site folder, and never a
  // dot-file or dot-folder inside it (.git/config holds a CI checkout's token).
  const relToRoot = path.relative(realpathOrNull(site.root) || site.root, real);
  if (!relToRoot || relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) return fail('it is outside the site folder');
  if (relToRoot.split(path.sep).some(s => s.startsWith('.'))) return fail('it is a hidden file');
  if (stack.includes(real)) return fail('it includes itself');
  if (stack.length > MAX_INCLUDE_DEPTH) return fail('includes nest too deeply');

  let body = readText(real);
  if (body === null) return fail('it cannot be read');
  body = body.replace(/\r\n?/g, '\n');
  if (region) {
    body = extractRegion(body, region);
    if (body === null) return fail(`it has no region "${region}"`);
  }
  if (real.toLowerCase().endsWith('.md')) return expandIncludes(site, parseFrontmatter(body).content.trim(), real, [...stack, real]);
  // Any other file is code: a fence longer than any backtick run inside it,
  // the extension as the language, and the rest of the line as fence info.
  const ticks = '`'.repeat(Math.max(3, ...(body.match(/`+/g) || []).map(t => t.length + 1)));
  return `${ticks}${path.extname(real).slice(1)}${info ? ' ' + info : ''}\n${body.replace(/\n+$/, '')}\n${ticks}`;
}

/**
 * Expand every `:::include <path>[#region] [fence info]` line outside a code
 * fence. A Markdown file is inlined (its frontmatter dropped, its own
 * includes expanded); any other file becomes a code block. Paths are relative
 * to the including file, or to the site root when they start with `/`.
 */
function expandIncludes(site, text, file, stack) {
  let fence = null;
  return text.split('\n').map(line => {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null;
      return line;
    }
    if (f) { fence = f[1]; return line; }
    const m = line.match(/^:::include[ \t]+(\S+)[ \t]*(.*)$/);
    return m ? includeFile(site, m[1], m[2].trim(), file, stack) : line;
  }).join('\n');
}

/**
 * `{{name}}` → config.variables[name], code blocks included. A name the config
 * doesn't define stays as written; `\{{name}}` prints the braces themselves.
 */
function substituteVariables(text, vars) {
  if (!vars || typeof vars !== 'object') return text;
  return text.replace(/(\\?)\{\{\s*([\w.-]+)\s*\}\}/g, (m, escaped, name) => {
    const value = Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : undefined;
    if (typeof value !== 'string' && typeof value !== 'number') return m;
    return escaped ? m.slice(1) : String(value);
  });
}

/**
 * Read a page file the way every consumer sees it: CRLF → LF, includes
 * expanded, variables substituted, frontmatter split off. Returns
 * { meta, content, text } (text is the whole expanded file), or null when
 * the file can't be read or is a draft this site doesn't publish.
 */
function readPage(site, file) {
  const raw = readText(file);
  if (raw === null) return null;
  let text = raw.replace(/\r\n?/g, '\n');
  text = expandIncludes(site, text, file, [realpathOrNull(file) || file]);
  text = substituteVariables(text, site.loadConfig().variables);
  const { meta, content } = parseFrontmatter(text);
  if (meta.draft === 'true' && !site.drafts) return null;
  return { meta, content, text };
}

/** Page title fallback chain: frontmatter → parent _meta.json → Title Case. */
function titleFor(site, version, slugParts, meta) {
  if (meta.title) return meta.title;
  if (slugParts.length) {
    const parentDir = path.join(site.contentDir, version, ...slugParts.slice(0, -1));
    const parentMeta = readJson(path.join(parentDir, '_meta.json'));
    if (Array.isArray(parentMeta)) {
      const entry = parentMeta.find(e => e.slug === slugParts[slugParts.length - 1]);
      if (entry && entry.title) return entry.title;
    }
  }
  return slugToTitle(slugParts[slugParts.length - 1] || version);
}

// ─────────────────────────────────────────────────────────────────────────────
// Page payloads
// ─────────────────────────────────────────────────────────────────────────────

/** Plain-text word count of a Markdown body (fences and markup stripped). */
function countWords(content) {
  const text = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>_\[\]|<>{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.split(' ').length : 0;
}

/** `/static/x.png` → `/static/x.dark.png` when that file sits beside it; null otherwise. */
function darkTwin(site, src) {
  const m = /^\/static\/([^?#]+)(\.[A-Za-z0-9]+)$/.exec(src);
  if (!m) return null;
  const rel = `${m[1]}.dark${m[2]}`;
  const parts = sanitizeSlugParts(rel);
  return parts && fs.existsSync(path.join(site.staticDir, ...parts)) ? `/static/${rel}` : null;
}

/** A page read and rendered to HTML: { slugParts, page, meta, content, html }, or null. */
function renderDoc(site, version, slug) {
  const slugParts = sanitizeSlugParts(slug);
  if (slugParts === null) return null;
  const page = resolvePage(site, version, slugParts);
  if (!page) return null;
  const read = readPage(site, page.file);
  if (!read) return null;
  // URL directory relative *.md links resolve against: the page itself for
  // folder-index pages, its parent for leaf pages.
  const dirParts = page.isIndex ? slugParts : slugParts.slice(0, -1);
  const baseDir = `/docs/${version}${dirParts.length ? '/' + dirParts.join('/') : ''}`;
  const html = mdToHtml(read.content, { baseDir, darkSrc: src => darkTwin(site, src) });
  return { slugParts, page, meta: read.meta, content: read.content, html };
}

/**
 * Build the /api/doc payload for a page, or null when it doesn't exist.
 * Response contract (existing fields preserved): title, description, tag,
 * banner, cover, coverPosition, html, editUrl, plus lastUpdated (ISO),
 * readingTimeMinutes, wordCount, version, slug.
 */
function buildDocPayload(site, config, version, slug) {
  const doc = renderDoc(site, version, slug);
  if (!doc) return null;
  const { slugParts, page, meta, content, html } = doc;

  // Edit link points at the file that actually resolved (index vs leaf).
  const relFile = slugParts.length
    ? slugParts.join('/') + (page.isIndex ? '/index.md' : '.md')
    : 'index.md';
  const editUrl = config.github && config.github.repo
    ? safeUrl(`${config.github.repo}/edit/${config.github.branch || 'main'}/${config.github.contentDir || 'content'}/${version}/${relFile}`)
    : '';

  let lastUpdated = '';
  // Last commit date first: a CI checkout stamps every file with the clone time.
  try { lastUpdated = execFileSync('git', ['log', '-1', '--format=%cI', '--', path.basename(page.file)], { cwd: path.dirname(page.file), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a repo */ }
  if (lastUpdated) lastUpdated = new Date(lastUpdated).toISOString();
  else try { lastUpdated = fs.statSync(page.file).mtime.toISOString(); } catch { /* leave empty */ }
  const wordCount = countWords(content);

  return {
    title: titleFor(site, version, slugParts, meta),
    description: meta.description || '',
    // Drafts only render on the preview server; say so on the page.
    tag: meta.tag || (meta.draft === 'true' ? 'Draft' : undefined),
    image: meta.image ? safeUrl(meta.image) : '',
    // `wide` drops the contents list for the full width; anything else: none.
    layout: meta.layout === 'wide' ? 'wide' : '',
    banner: meta.banner ? safeUrl(meta.banner) : '',
    cover: meta.cover ? safeUrl(meta.cover) : '',
    coverPosition: meta['cover-position'] || '',
    html,
    editUrl,
    lastUpdated,
    readingTimeMinutes: Math.max(1, Math.round(wordCount / 220)),
    wordCount,
    version,
    slug: slugParts.join('/'),
  };
}

/** Raw Markdown of a page (for /api/raw and the copy-page button); null when absent. */
function getRawPage(site, version, slug) {
  const slugParts = sanitizeSlugParts(slug);
  if (slugParts === null) return null;
  const page = resolvePage(site, version, slugParts);
  if (!page) return null;
  const read = readPage(site, page.file);
  return read ? read.text : null;
}


// ─────────────────────────────────────────────────────────────────────────────
// Whole-site walks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every page of a version: [{ slug, href, file, title, description, mtime }].
 * Skips underscore-prefixed entries and non-Markdown files.
 */
function listPages(site, version) {
  const pages = [];
  const walk = (dir, urlBase) => {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      if (entry.startsWith('_')) continue;
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) { walk(full, `${urlBase}/${entry}`); continue; }
      if (!entry.endsWith('.md')) continue;
      const read = readPage(site, full);
      if (!read) continue;
      const { meta, content } = read;
      const slug = entry === 'index.md' ? urlBase : `${urlBase}/${entry.replace(/\.md$/, '')}`;
      pages.push({
        slug: slug.replace(/^\//, ''),
        href: `/docs/${version}${slug}`,
        file: full,
        title: meta.title || slugToTitle(path.basename(slug)),
        description: meta.description || '',
        content,
        mtime: stat.mtime,
      });
    }
  };
  walk(path.join(site.contentDir, version), '');
  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────
// Broken-link report
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every broken internal link on every page, read from the rendered HTML, so
 * it sees what a reader gets: relative `*.md` links already resolved to
 * routes, includes expanded, and nothing inside code. Checks links to pages
 * (a redirect counts as a page), `#anchors` against the target page's ids,
 * and `/static/` files. Returns one line per problem; the static build fails
 * on any, and the preview server prints them at startup.
 */
function checkLinks(site, config) {
  const problems = [];
  const pages = new Map();          // route → { ids }
  const rendered = [];
  for (const v of site.versions(config)) {
    for (const p of listPages(site, v)) {
      const doc = renderDoc(site, v, p.slug);
      if (!doc) continue;
      const ids = new Set([...doc.html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
      pages.set(p.href.replace(/\/$/, ''), { ids });
      rendered.push({ href: p.href, html: doc.html, ids });
    }
  }
  const redirects = new Set(Object.keys(config.redirects || {}).map(r => r.replace(/\/$/, '')));
  for (const page of rendered) {
    for (const [, attr, raw] of page.html.matchAll(/\s(href|src)="([^"]*)"/g)) {
      const url = raw.replace(/&amp;/g, '&');
      const [pathPart, hash] = url.split('#');
      if (url.startsWith('#')) {
        if (hash && !page.ids.has(decodeURIComponent(hash))) problems.push(`${page.href}: no #${hash} on this page`);
      } else if (/^\/docs(\/|$)/.test(pathPart)) {
        const route = pathPart.replace(/[?].*$/, '').replace(/\/$/, '');
        const target = pages.get(route);
        if (!target && !redirects.has(route)) problems.push(`${page.href}: links to ${route}, which is not a page`);
        else if (target && hash && !target.ids.has(decodeURIComponent(hash))) problems.push(`${page.href}: links to ${route}#${hash}, which has no such heading or row`);
      } else if (pathPart.startsWith('/static/')) {
        const parts = sanitizeSlugParts(decodeURIComponent(pathPart.slice('/static/'.length).replace(/[?].*$/, '')));
        if (!parts || !fs.existsSync(path.join(site.staticDir, ...parts))) problems.push(`${page.href}: ${attr === 'src' ? 'image' : 'file'} ${pathPart} is missing from static/`);
      }
    }
  }
  return problems;
}

module.exports = {
  sanitizeVersion, sanitizeSlugParts, resolvePage, parseFrontmatter, readPage,
  buildDocPayload, getRawPage, listPages, checkLinks,
};
