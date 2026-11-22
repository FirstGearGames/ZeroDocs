'use strict';
/**
 * Sidebar navigation tree, driven by per-folder _meta.json files.
 *
 * With a _meta.json (array) present, it is exhaustive: entries appear in its
 * order, files on disk that it omits are hidden. Entry fields: slug, title,
 * type ('folder' | 'file' | 'separator'), tag, defaultOpen, href (override),
 * external. The slug 'index' links to the folder URL itself.
 *
 * Without one, the folder is auto-listed: index.md is skipped (the folder's
 * own node covers it), titles come from each page's frontmatter falling back
 * to Title-Cased filenames, and directories recurse.
 */

const fs = require('fs');
const path = require('path');
const { readJson } = require('./site');
const { readPage } = require('./content');
const { safeUrl, slugToTitle } = require('./util');

/** A page file this site doesn't publish: a draft outside the preview server. */
function isUnpublished(site, file) {
  return fs.existsSync(file) && !readPage(site, file);
}

function isDirectory(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/** Build the nav tree for content/<version>; [] when the folder is missing. */
function buildNav(site, version) {
  const build = (dir, urlBase) => {
    if (!isDirectory(dir)) return [];
    const meta = readJson(path.join(dir, '_meta.json'));

    if (!Array.isArray(meta) || !meta.length) {
      // Auto-listing fallback, no _meta.json (or not a usable array).
      let entries;
      try { entries = fs.readdirSync(dir); } catch { return []; }
      return entries
        .filter(e => !e.startsWith('_') && e !== 'index.md' && (e.endsWith('.md') || isDirectory(path.join(dir, e))))
        .map(e => {
          const isDir = isDirectory(path.join(dir, e));
          const page = isDir ? null : readPage(site, path.join(dir, e));
          if (!isDir && !page) return null;            // an unpublished draft
          const slug = e.replace(/\.md$/, '');
          return {
            slug,
            title: (page && page.meta.title) || slugToTitle(slug),
            type: isDir ? 'folder' : 'file',
            href: `${urlBase}/${slug}`,
            children: isDir ? build(path.join(dir, e), `${urlBase}/${slug}`) : undefined,
          };
        })
        .filter(Boolean);
    }

    return meta.map(item => {
      if (item.type === 'separator') return { ...item, slug: item.title };
      const slug = item.slug;
      const childDir = path.join(dir, String(slug || ''));
      const isDir = isDirectory(childDir);
      if (!isDir && !item.href && isUnpublished(site, path.join(dir, `${slug}.md`))) return null;
      // 'index' links to the folder URL itself; explicit href overrides win.
      const autoHref = slug === 'index' ? urlBase : `${urlBase}/${slug}`;
      // Children always use the real slug path so overrides can't collide.
      const children = (item.type === 'folder' || isDir) ? build(childDir, `${urlBase}/${slug}`) : undefined;
      return {
        slug,
        title: item.title,
        type: item.type || (isDir ? 'folder' : 'file'),
        tag: item.tag,
        defaultOpen: item.defaultOpen,
        // A _meta.json href override is author-controlled; block dangerous
        // schemes before it reaches the client, which renders it into an <a>.
        href: item.href ? safeUrl(item.href) : autoHref,
        external: item.external || false,
        children,
      };
    }).filter(Boolean);
  };

  return build(path.join(site.contentDir, version), `/docs/${version}`);
}

module.exports = { buildNav };
