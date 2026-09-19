'use strict';
/**
 * Markdown → HTML renderer.
 *
 * Pipeline (order matters):
 *   1. Normalize line endings.
 *   2. Extract fenced code blocks into placeholders, FIRST, so no later
 *      transform (GitBook compat, directives, emoji, inline markup) can
 *      touch code. This is what lets a docs site document the engine's own
 *      syntax inside code fences.
 *   3. GitBook-syntax preprocessing (lib/gitbook.js).
 *   4. Directive extraction (lib/directives.js).
 *   5. Block-level parsing: headings (anchored, deduped ids), blockquotes,
 *      nested lists (with task-list checkboxes), tables (with alignment),
 *      horizontal rules, paragraphs.
 *   6. Restore code fences through the syntax highlighter.
 *   7. Restore directives (bodies render recursively through this module).
 *   8. Legacy callout upgrade, `> **Info:** …` blockquotes.
 *
 * Options:
 *   baseDir  URL directory of the current page (e.g. '/docs/v1/guides'), 
 *            enables rewriting relative *.md links into site routes.
 *   ids      Shared Set of heading ids for deduplication (created when absent
 *            and passed through recursion, so ids are unique per page).
 */

const gitbook = require('./gitbook');
const directives = require('./directives');
const { highlight } = require('./highlight');
const { escHtml, escAttr, safeUrl, safeColor, cssLen, slugify } = require('./util');

/** A line that is exactly one extraction placeholder. */
const TOKEN_LINE_RE = /^\x00[A-Z]+\d+\x00$/;

/** List item at any indent: `- x`, `* x`, `+ x`, or `1. x`. */
const LIST_ITEM_RE = /^(\s*)(?:([-*+])|(\d+)\.)\s+(.+)$/;

// ─────────────────────────────────────────────────────────────────────────────
// Code fences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract fenced code blocks into placeholders.
 *
 * CommonMark-style fences: an opening line of 3+ backticks OR 3+ tildes
 * (optionally indented up to 3 spaces), closed by a line of the SAME
 * character that is at least as long. Because the closing run must match the
 * opening character and length, a longer fence, or a tilde fence, can hold
 * a normal ```` ``` ```` block verbatim, which is how a page documents code
 * fences themselves. The info string is a language tag plus an optional
 * `title="…"`.
 *
 * Fences must begin a line, so stray backticks in prose are never mistaken
 * for a fence.
 */
function extractFences(src, store) {
  store.code = [];
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const open = lines[i].match(/^(\s{0,3})(`{3,}|~{3,})(.*)$/);
    // A backtick info string may not contain backticks (then it's not a fence).
    if (open && !(open[2][0] === '`' && open[3].includes('`'))) {
      const marker = open[2];
      const fenceChar = marker[0];
      const info = open[3];
      const body = [];
      i++;
      while (i < lines.length) {
        const close = lines[i].match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === fenceChar && close[1].length >= marker.length) { i++; break; }
        body.push(lines[i]);
        i++;
      }
      const infoTrim = info.trim();
      const lang = (infoTrim.split(/\s+/)[0] || '').replace(/[^\w#+.-]/g, '');
      const title = (info.match(/title="([^"]*)"/) || [])[1] || '';
      const code = body.join('\n');
      // `raw` reconstructs valid fence source so directive bodies re-render.
      store.code.push({ raw: `${marker}${info}\n${code}\n${marker}`, lang, title, code });
      out.push(`\x00CODE${store.code.length - 1}\x00`);
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join('\n');
}

/** Put original fence text back, used for directive bodies that re-render. */
function reexpandFences(text, store) {
  return text.replace(/\x00CODE(\d+)\x00/g, (_, i) => store.code[+i].raw);
}

/** Placeholders → highlighted <pre><code> blocks. */
function restoreFences(html, store) {
  return html.replace(/\x00CODE(\d+)\x00/g, (whole, i) => {
    const block = store.code[+i];
    if (!block) return whole;      // orphaned token (shouldn't happen), leave as-is
    const attrs =
      (block.lang ? ` data-lang="${escAttr(block.lang)}"` : '')
      + (block.title ? ` data-title="${escAttr(block.title)}"` : '');
    const cls = block.lang ? ` class="language-${escAttr(block.lang)}"` : '';
    return `<pre${attrs}><code${cls}>${highlight(block.code, block.lang)}</code></pre>`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline markup
// ─────────────────────────────────────────────────────────────────────────────

/** Block dangerous URL schemes in author-supplied hrefs (see util.safeUrl). */
function safeHref(href) {
  return safeUrl(href);
}

/**
 * Rewrite a relative `*.md` link into its site route, resolved against the
 * page's URL directory: `./install.md` → `/docs/v1/guides/install`.
 */
function rewriteMdHref(href, baseDir) {
  if (!baseDir) return href;
  const [, target, hash] = href.match(/^([^#]*)(#.*)?$/) || [];
  if (!target || !/\.md$/i.test(target)) return href;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) return href;
  const full = target.startsWith('/') ? target : `${baseDir}/${target}`;
  const segments = [];
  for (const seg of full.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') segments.pop();
    else segments.push(seg);
  }
  let route = '/' + segments.join('/');
  route = route.replace(/\/index\.md$/i, '').replace(/\.md$/i, '');
  return (route || '/') + (hash || '');
}

function renderLink(text, href, opts) {
  const resolved = rewriteMdHref(safeHref(href.trim()), opts.baseDir);
  const external = /^https?:\/\//.test(resolved);
  return `<a href="${escAttr(resolved)}"${external ? ' target="_blank" rel="noopener" class="ext"' : ''}>${escHtml(text)}</a>`;
}

/**
 * Render an image. Beyond `src`/`alt`, the `{…}` attribute block supports:
 *   width, height        sizing (bare number → px)
 *   align=left|center|right, offset=x,y   placement
 *   ratio=16:9 | 4/3     fixed aspect-ratio box (crops with fit)
 *   fit=cover|contain    object-fit within a sized/ratio box
 *   rounded[=r]          border-radius (default 10px)
 *   shadow               drop shadow
 *   border[=color]       1px border (default var(--border))
 * A quoted title after the URL, ![alt](src "Caption"), wraps the image in a
 * <figure> with a <figcaption>.
 */
function renderImage(alt, srcAndTitle, attrStr) {
  // Split an optional quoted caption/title off the URL: src "caption"
  const titleMatch = srcAndTitle.match(/^(\S+)\s+"([^"]*)"\s*$/);
  const src = titleMatch ? titleMatch[1] : srcAndTitle.trim();
  const caption = titleMatch ? titleMatch[2] : '';

  let style = '';
  const classes = ['md-img'];
  let align = null;

  if (attrStr) {
    // Every value below is validated (cssLen/safeColor/allowlist) before it
    // reaches the style attribute, so an author can size and place an image
    // but cannot smuggle in extra declarations (e.g. a full-viewport overlay).
    const aMap = {};
    const offset = attrStr.match(/offset=\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/);
    if (offset) { const ox = cssLen(offset[1]); const oy = cssLen(offset[2]); if (ox && oy) style += `transform:translate(${ox},${oy});`; }
    // key=value pairs
    attrStr.replace(/(\w+)=["']?([^"'\s}]*)["']?/g, (_, k, v) => { aMap[k.toLowerCase()] = v; });
    // bare flags (rounded, shadow, border with no value)
    const flags = new Set(attrStr.replace(/\w+=["']?[^"'\s}]*["']?/g, ' ').match(/[a-z]+/gi) || []);

    const w = cssLen(aMap.width); if (w) style += `width:${w};`;
    const h = cssLen(aMap.height); if (h) style += `height:${h};`;
    if (aMap.ratio && /^[\d.]+\s*[:/]\s*[\d.]+$/.test(aMap.ratio)) {
      style += `aspect-ratio:${aMap.ratio.replace(':', '/')};`;
      if (!aMap.fit) aMap.fit = 'cover';
      if (!w) style += 'width:100%;';
    }
    if (aMap.fit && /^(?:cover|contain|fill|none|scale-down)$/i.test(aMap.fit)) style += `object-fit:${aMap.fit.toLowerCase()};`;
    if (aMap.align && /^(?:left|center|right)$/i.test(aMap.align)) align = aMap.align.toLowerCase();

    if (aMap.rounded) { const r = cssLen(aMap.rounded); if (r) style += `border-radius:${r};`; else classes.push('md-img-rounded'); }
    else if (flags.has('rounded')) classes.push('md-img-rounded');
    if (flags.has('shadow')) classes.push('md-img-shadow');
    if (aMap.border) { const bc = safeColor(aMap.border); if (bc) style += `border:1px solid ${bc};`; else classes.push('md-img-border'); }
    else if (flags.has('border')) classes.push('md-img-border');
  }

  const img = `<img class="${classes.join(' ')}" src="${escAttr(safeHref(src))}" alt="${escAttr(alt)}" loading="lazy"${style ? ` style="${escAttr(style)}"` : ''}>`;
  let out = caption
    ? `<figure class="md-figure">${img}<figcaption>${escHtml(caption)}</figcaption></figure>`
    : img;
  if (align === 'center' || align === 'right' || align === 'left') out = `<div class="align-${align}">${out}</div>`;
  return out;
}

/**
 * Inline transforms for one line/paragraph of text.
 *
 * Security model: the transforms that PRODUCE markup (code spans, autolinks,
 * keyboard keys, buttons, badges, images, links) run first and stash their
 * already-escaped HTML behind opaque placeholders. Whatever is left is literal
 * prose, so it is HTML-escaped before emphasis wraps runs of it in tags. That
 * escape is the single guarantee that stray `<`, `>`, `&`, or a `<script>` in
 * ordinary body text, a heading, a list item, or a table cell can never reach
 * the page as live markup. Placeholders are restored last.
 */
function inline(s, opts) {
  const holds = [];
  const hold = htmlFragment => { holds.push(htmlFragment); return `\x00H${holds.length - 1}\x00`; };

  // Inline code spans first, so nothing below can touch their contents.
  s = s.replace(/`([^`]+)`/g, (_, code) => hold(`<code>${escHtml(code)}</code>`));
  // Autolinks: <https://example.com>
  s = s.replace(/<(https?:\/\/[^>\s]+)>/g, (_, url) =>
    hold(`<a href="${escAttr(safeHref(url))}" target="_blank" rel="noopener" class="ext">${escHtml(url)}</a>`));
  // Keyboard keys: [[Ctrl+K]] → <kbd>Ctrl</kbd>+<kbd>K</kbd>
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, keys) =>
    hold(keys.split('+').map(k => `<kbd>${escHtml(k.trim())}</kbd>`).join('+')));
  // Material buttons: [Text]{.btn bg="…" …}
  s = s.replace(/\[([^\]]+)\]\{\.btn([^}]*)\}/g, (_, text, attrs) => hold(directives.renderBtn(text, attrs)));
  // Badges: [Text]{.badge type="success"} or [Text]{.badge color="#…"}
  s = s.replace(/\[([^\]]+)\]\{\.badge([^}]*)\}/g, (_, text, attrs) => hold(directives.renderBadge(text, attrs)));
  // Images before links, with optional {…} attrs and a "caption"
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]*)\})?/g, (_, alt, src, attrStr) => hold(renderImage(alt, src, attrStr)));
  // Links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => hold(renderLink(text, href, opts)));

  // Everything still here is literal text: escape it before emphasis runs.
  s = escHtml(s);

  // Bold + italic (underscore forms require word boundaries so snake_case survives)
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  s = s.replace(/(^|\W)__(?=\S)([\s\S]*?\S)__(?=\W|$)/g, '$1<strong>$2</strong>');
  s = s.replace(/(^|\W)_(?=\S)([^_]*\S)_(?=\W|$)/g, '$1<em>$2</em>');
  // Strikethrough
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  // Restore stashed HTML fragments.
  s = s.replace(/\x00H(\d+)\x00/g, (_, i) => holds[+i]);
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Block-level parsing
// ─────────────────────────────────────────────────────────────────────────────

/** Reserve a unique heading id on the page. */
function uniqueId(base, ids) {
  let id = base || 'section';
  let n = 2;
  while (ids.has(id)) id = `${base}-${n++}`;
  ids.add(id);
  return id;
}

function parseCells(row) {
  return row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
}

/** Column alignment from a table separator cell (`:---`, `:---:`, `---:`). */
function cellAlign(sep) {
  if (/^:-+:$/.test(sep)) return 'center';
  if (/^-+:$/.test(sep)) return 'right';
  return '';
}

/**
 * Parse a run of list lines starting at `start`, supporting nesting by
 * indentation, mixed ordered/unordered levels, task checkboxes, and the
 * `start` attribute for ordered lists not beginning at 1.
 * Returns { html, next }.
 */
function parseListBlock(lines, start, opts) {
  let i = start;

  function parseLevel(indent) {
    const first = lines[i].match(LIST_ITEM_RE);
    const ordered = first[3] !== undefined;
    const startNum = ordered ? parseInt(first[3], 10) : 1;
    let items = '';
    while (i < lines.length) {
      const m = lines[i] ? lines[i].match(LIST_ITEM_RE) : null;
      if (!m) break;
      const ind = m[1].replace(/\t/g, '  ').length;
      if (ind < indent) break;
      if (ind > indent) {
        // Deeper indent → nested list inside the previous item.
        const nested = parseLevel(ind);
        items = items.endsWith('</li>') ? items.slice(0, -5) + nested + '</li>' : items + `<li>${nested}</li>`;
        continue;
      }
      if ((m[3] !== undefined) !== ordered) break;      // list type switch → new list
      let text = m[4];
      i++;
      const task = text.match(/^\[([ xX])\]\s+(.+)$/);
      if (task) {
        items += `<li class="task"><input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(task[2], opts)}</li>`;
      } else {
        items += `<li>${inline(text, opts)}</li>`;
      }
    }
    if (ordered) return `<ol${startNum !== 1 ? ` start="${startNum}"` : ''}>${items}</ol>`;
    return `<ul>${items}</ul>`;
  }

  const firstIndent = lines[start].match(LIST_ITEM_RE)[1].replace(/\t/g, '  ').length;
  return { html: parseLevel(firstIndent), next: i };
}

function parseBlocks(src, opts) {
  const lines = src.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const guard = i;      // safety net: every branch must advance i (see end of loop)
    const line = lines[i];
    const trimmed = line.trim();

    // Extraction placeholder on its own line
    if (TOKEN_LINE_RE.test(trimmed)) { blocks.push(trimmed); i++; continue; }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) { blocks.push('<hr>'); i++; continue; }

    // Heading, anchored, with a hover permalink
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      const lvl = hm[1].length;
      const id = uniqueId(slugify(hm[2]), opts.ids);
      blocks.push(`<h${lvl} id="${id}">${inline(hm[2], opts)}<a class="hanchor" href="#${id}" aria-label="Direct link to this heading">#</a></h${lvl}>`);
      i++; continue;
    }

    // Blockquote, multi-line, parsed recursively so inner markup works
    if (line.startsWith('> ') || line === '>') {
      const bqLines = [];
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
        bqLines.push(lines[i].startsWith('> ') ? lines[i].slice(2) : '');
        i++;
      }
      blocks.push(`<blockquote>${mdToHtml(bqLines.join('\n'), opts)}</blockquote>`);
      continue;
    }

    // Lists (nested by indentation)
    if (LIST_ITEM_RE.test(line)) {
      const list = parseListBlock(lines, i, opts);
      blocks.push(list.html);
      i = list.next;
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s:-]+\|/.test(lines[i + 1])) {
      const headers = parseCells(line);
      const aligns = parseCells(lines[i + 1]).map(cellAlign);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(parseCells(lines[i]));
        i++;
      }
      const alignAttr = c => (aligns[c] ? ` style="text-align:${aligns[c]}"` : '');
      const thead = `<thead><tr>${headers.map((h, c) => `<th${alignAttr(c)}>${inline(h, opts)}</th>`).join('')}</tr></thead>`;
      const tbody = `<tbody>${rows.map(r => `<tr>${r.map((cell, c) => `<td${alignAttr(c)}>${inline(cell, opts)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      blocks.push(`<div class="table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // Blank line
    if (trimmed === '') { i++; continue; }

    // Paragraph, the catch-all. Always consumes the current line first (so a
    // line that merely starts with a placeholder token but isn't a pure token
    // line still makes progress), then accumulates until a blank line or the
    // start of another block.
    const pLines = [line];
    i++;
    while (
      i < lines.length && lines[i].trim() !== ''
      && !lines[i].startsWith('#') && !lines[i].startsWith('> ')
      && !LIST_ITEM_RE.test(lines[i]) && !/^\x00/.test(lines[i])
      && !/^[-*_]{3,}\s*$/.test(lines[i])
    ) {
      pLines.push(lines[i]);
      i++;
    }
    blocks.push(`<p>${inline(pLines.join(' '), opts)}</p>`);

    // Safety net: no branch above can leave i unchanged, but if a future edit
    // ever does, force progress rather than hang the server.
    if (i === guard) i++;
  }

  return blocks.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy callouts, `> **Info:** …` blockquotes upgraded to styled callouts
// ─────────────────────────────────────────────────────────────────────────────

const LEGACY_CALLOUT_ICONS = {
  Info: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ci-b)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  Warning: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--cw-b)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  Danger: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--cd-b)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  Tip: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ct-b)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>',
};
const LEGACY_CALLOUT_CLASS = { Info: 'ci', Warning: 'cw', Danger: 'cd', Tip: 'ct' };

function applyLegacyCallouts(html) {
  return html.replace(/<blockquote>(<p><strong>(Info|Warning|Danger|Tip):<\/strong>[\s\S]*?)<\/blockquote>/gi, (_, content, type) => {
    const key = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    const body = content.replace(`<p><strong>${type}:</strong>`, '<p>');
    return `<blockquote class="${LEGACY_CALLOUT_CLASS[key] || 'ci'}"><span class="callout-icon">${LEGACY_CALLOUT_ICONS[key] || LEGACY_CALLOUT_ICONS.Info}</span><span class="callout-body">${body}</span></blockquote>`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/** Hard limits so pathological input can never spin the renderer. */
const MAX_RENDER_DEPTH = 24;            // blockquote / directive-body nesting
const MAX_RENDER_BYTES = 512 * 1024;    // characters processed per render unit

function mdToHtml(md, opts = {}) {
  if (!opts.ids) opts.ids = new Set();
  // Depth rides on the shared opts (incremented on entry, restored on exit) so
  // it tracks nesting through both blockquotes and recursive directive bodies.
  opts._depth = (opts._depth || 0) + 1;
  if (opts._depth > MAX_RENDER_DEPTH) { opts._depth--; return escHtml(String(md)); }
  const store = {};
  let src = String(md).replace(/\r\n?/g, '\n');
  if (src.length > MAX_RENDER_BYTES) src = src.slice(0, MAX_RENDER_BYTES);
  src = extractFences(src, store);
  src = gitbook.preprocess(src);
  src = directives.extract(src, store, text => reexpandFences(text, store));
  let html = parseBlocks(src, opts);
  html = restoreFences(html, store);
  html = directives.restore(html, store, { md: m => mdToHtml(m, opts), inline: s => inline(s, opts) });
  opts._depth--;
  return applyLegacyCallouts(html);
}

module.exports = { mdToHtml, inline, safeHref };
