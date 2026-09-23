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

/**
 * Build the /api/doc payload for a page, or null when it doesn't exist.
 * Response contract (existing fields preserved): title, description, tag,
 * banner, cover, coverPosition, html, editUrl, plus lastUpdated (ISO),
 * readingTimeMinutes, wordCount, version, slug.
 */
function buildDocPayload(site, config, version, slug) {
  const slugParts = sanitizeSlugParts(slug);
  if (slugParts === null) return null;
  const page = resolvePage(site, version, slugParts);
  if (!page) return null;
  const raw = readText(page.file);
  if (raw === null) return null;

  const { meta, content } = parseFrontmatter(raw);

  // URL directory relative *.md links resolve against: the page itself for
  // folder-index pages, its parent for leaf pages.
  const dirParts = page.isIndex ? slugParts : slugParts.slice(0, -1);
  const baseDir = `/docs/${version}${dirParts.length ? '/' + dirParts.join('/') : ''}`;

  const html = mdToHtml(content, { baseDir });

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
    tag: meta.tag,
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
  return readText(page.file);
}

/** Frontmatter only, cheap per-page metadata for shell <head> tags. */
function getPageMeta(site, version, slug) {
  const slugParts = sanitizeSlugParts(slug);
  if (slugParts === null) return null;
  const page = resolvePage(site, version, slugParts);
  if (!page) return null;
  const raw = readText(page.file);
  if (raw === null) return null;
  const { meta } = parseFrontmatter(raw);
  return { title: titleFor(site, version, slugParts, meta), description: meta.description || '' };
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
      const raw = readText(full);
      if (raw === null) continue;
      const { meta, content } = parseFrontmatter(raw);
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
 * Report-only scan for internal /docs/… links that resolve to no page.
 * Returns warning strings; printed at startup.
 */
function checkLinks(site, config) {
  const warnings = [];
  const versions = site.versions(config);
  const known = new Set();
  const perVersion = {};
  for (const v of versions) {
    perVersion[v] = listPages(site, v);
    for (const p of perVersion[v]) known.add(p.href.replace(/\/$/, ''));
    known.add(`/docs/${v}`);
  }
  const LINK_RE = /\]\((\/docs\/[^)#\s]+)[^)]*\)|href="(\/docs\/[^"#\s]+)"/g;
  for (const v of versions) {
    for (const p of perVersion[v]) {
      let m;
      LINK_RE.lastIndex = 0;
      while ((m = LINK_RE.exec(p.content)) !== null) {
        const target = (m[1] || m[2]).replace(/\/$/, '');
        if (!known.has(target)) warnings.push(`${p.href} → broken link ${target}`);
      }
    }
  }
  return warnings;
}

module.exports = {
  sanitizeVersion, sanitizeSlugParts, resolvePage, parseFrontmatter,
  buildDocPayload, getRawPage, getPageMeta, listPages, checkLinks,
};
