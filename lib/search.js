'use strict';
/**
 * Search index builder.
 *
 * Section-level indexing: every page contributes one entry for its intro
 * (before the first h2/h3) and one entry per h2/h3 section, each deep-linked
 * to the heading's anchor. This is what makes content below the fold
 * findable, a flat 500-char page snippet is not.
 *
 * Entry shape (client scorer consumes this):
 *   { title, section, href, description, content }
 *   - title:   page title
 *   - section: heading text ('' for the intro entry)
 *   - href:    /docs/<v>/<slug>[#anchor]
 *   - content: cleaned section text, capped
 */

const { listPages } = require('./content');
const { slugify } = require('./util');

const SECTION_CAP = 1500;

/** Strip Markdown/directive syntax down to searchable plain text. */
function cleanText(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')                  // fences
    .replace(/^:::[^\n]*$/gm, ' ')                     // directive markers
    .replace(/\{%[^%]*%\}/g, ' ')                      // gitbook tags
    .replace(/\{\.btn[^}]*\}/g, ' ')                   // button attrs
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')             // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')           // links → text
    .replace(/[#*`>_|<>~]/g, ' ')                      // markup chars
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a page body on h2/h3 headings. Returns [{ heading, anchor, text }],
 * where the first item has heading '' (the intro). Anchor slugs are deduped
 * with the same algorithm the renderer uses, so links line up.
 */
function splitSections(content) {
  const ids = new Set();
  const dedupe = base => {
    let id = base || 'section';
    let n = 2;
    while (ids.has(id)) id = `${base}-${n++}`;
    ids.add(id);
    return id;
  };

  const sections = [{ heading: '', anchor: '', text: '' }];
  let current = sections[0];
  // Walk lines outside code fences so fence content can't fake a heading.
  let inFence = false;
  for (const line of content.split('\n')) {
    if (/^```/.test(line)) { inFence = !inFence; current.text += ' '; continue; }
    if (inFence) { current.text += ' ' + line; continue; }
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      // The renderer assigns ids to ALL heading levels in order, mirror that
      // so anchors stay in sync, but only index h2/h3 as sections.
      const anchor = dedupe(slugify(hm[2]));
      if (hm[1].length === 2 || hm[1].length === 3) {
        current = { heading: hm[2].replace(/[`*_]/g, ''), anchor, text: '' };
        sections.push(current);
      }
      continue;
    }
    current.text += ' ' + line;
  }
  return sections;
}

/** Build the full index for a version. */
function buildSearchIndex(site, version) {
  const entries = [];
  for (const page of listPages(site, version)) {
    const sections = splitSections(page.content);
    for (const section of sections) {
      const text = cleanText(section.text);
      if (!section.heading && !text && sections.length > 1) continue;   // empty intro
      entries.push({
        title: page.title,
        section: section.heading,
        href: page.href + (section.anchor ? `#${section.anchor}` : ''),
        description: section.heading ? '' : page.description,
        content: text.slice(0, SECTION_CAP),
      });
    }
  }
  return entries;
}

module.exports = { buildSearchIndex };
