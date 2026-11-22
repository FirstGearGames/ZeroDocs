'use strict';
/**
 * Block directives, every `:::name … :::` construct, plus the inline
 * `[Text]{.btn …}` button.
 *
 * The Markdown renderer extracts directives into placeholder tokens before
 * block parsing (so their bodies survive untouched), then restores them into
 * final HTML afterwards. Directive bodies are themselves Markdown and render
 * through the `ctx.md` callback, which keeps this module free of any
 * dependency on the renderer.
 *
 * Directive inventory:
 *   :::card [attrs] … :::                 Material card (bg, color, border, img,
 *                                         imgbg, imgwhite, href, align, padding,
 *                                         radius, shadow, maxwidth)
 *   :::cardrow … :::endrow                Cards laid out side by side
 *   :::linkbuttons … :::                  Pill-style page links
 *   :::filecard [attrs] … :::             Download/file link card (href, ext)
 *   :::navcards … :::                     Two-column nav link cards
 *   :::refcards … :::                     Icon+title+description cards
 *   :::video <url> :::                    Responsive video embed
 *   :::hint type="…" [title="…"] … :::    Callout (info/warning/danger/success)
 *   :::tabs [Tab]\n… --- [Tab]\n… :::endtabs   Tabbed content
 *   :::embed <url> :::                    Video embed or rich external link
 *   :::pageref href="…" … :::             Internal page reference card
 *   :::expand <title> … :::               Collapsible <details> section
 *   [center]…[/center] ([left]/[right])   Alignment wrappers
 *   Raw block-level HTML                  Passed through unmodified
 */

const { escHtml, escAttr, parseAttrs, safeUrl, safeColor, cssLen } = require('./util');

/** true for a URL usable as a CSS background-image / <img> source. */
const IMG_URL_RE = /^(?:https?:\/\/|\/|data:image\/)/i;

/**
 * Best-effort sanitizer for the raw block-level HTML passthrough. The feature
 * lets an author drop in `<div>`/`<figure>`/`<details>` layout, but the block
 * can hide anything, so before it is emitted verbatim we remove script/style
 * and other active elements, inline event handlers, dangerous URL schemes in
 * URL-bearing attributes, any inline style carrying url()/expression(), and
 * positioning declarations that could lift a block into a full-viewport overlay.
 */
function scrubHtml(html) {
  let s = String(html);
  const ACTIVE = /<\s*(script|style|iframe|object|embed|form|link|meta|base)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
  s = s.replace(ACTIVE, '').replace(/<\s*(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi, '');
  s = s.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
       .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
       .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  const schemeBad = v => /^(?:javascript|vbscript|data):/i.test(String(v).replace(/[\x00-\x20]+/g, ''));
  const urlAttr = /\b(href|src|xlink:href|srcset|action|formaction|background)\s*=\s*(["'])([\s\S]*?)\2/gi;
  s = s.replace(urlAttr, (m, name, q, val) => `${name}=${q}${schemeBad(val) ? '#' : val}${q}`);
  // A whole style is dropped if it carries url()/expression()/imports/markup;
  // otherwise positioning declarations are stripped so a raw block cannot lift
  // itself out of flow into a full-viewport overlay while benign inline styles
  // (color, padding, text-align) still work.
  const styleBad = v => /(?:url\s*\(|expression|javascript:|@import|<|>)/i.test(v);
  const OVERLAY_DECL = /(?:^|;)\s*(?:position|z-index|inset|top|right|bottom|left|transform)\s*:[^;]*/gi;
  s = s.replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (m, pre, q, val) =>
    `${pre}${q}${styleBad(val) ? '' : val.replace(OVERLAY_DECL, '')}${q}`);
  return s;
}

/** Placeholder token detector, used by the block parser to skip token lines. */
const TOKEN_RE = /^\x00[A-Z]+\d+\x00$/;

// ─────────────────────────────────────────────────────────────────────────────
// Extraction, directive bodies → store, placeholder tokens left in the text
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract every directive from `src` into `store`, returning the tokenized
 * text. `reexpand` restores code-fence placeholders inside a captured body so
 * stored bodies are always plain Markdown that can re-render independently.
 *
 * A body may not span another line starting with `:::`, so the innermost
 * directive is tokenized first and its parent matches on a later pass. That
 * keeps nesting (a hint in a step, tabs in a step, a card in an expand, an
 * expand in an expand) independent of the order below. Each token remembers
 * the source it replaced, and `expand` puts it back into a captured body,
 * because that body re-renders through ctx.md with its own, fresh store.
 */
function extract(src, store, reexpand) {
  const raw = new Map();
  const grab = (name, list, value, whole) => {
    list.push(value);
    const token = `\x00${name}${list.length - 1}\x00`;
    raw.set(token, whole);
    return token;
  };
  const expand = text => reexpand(text.replace(/\x00[A-Z]+\d+\x00/g, t => (raw.has(t) ? expand(raw.get(t)) : t)));
  // `:::name opts` … `:::end`, with no other `:::` line in between.
  const block = (name, end = '') =>
    new RegExp(`^:::${name}\\b([^\\n]*)((?:\\n(?!:::)[^\\n]*)*)\\n:::${end}[ \\t]*$`, 'gm');

  store.cardRows = []; store.linkBtns = []; store.fileCards = []; store.navCards = [];
  store.refCards = []; store.videos = []; store.hints = []; store.tabs = [];
  store.embeds = []; store.pageRefs = []; store.expands = []; store.aligns = [];
  store.rawHtml = []; store.cards = [];
  store.galleries = []; store.steps = []; store.fields = []; store.grids = [];

  let before;
  do {
    before = src;

    // Layout grid: cells split on a line of `---`; use `***` for a horizontal
    // rule inside a cell.
    src = src.replace(block('grid', 'endgrid'), (m, opts, content) =>
      grab('GRID', store.grids, { opts: opts.trim(), cells: content.trim().split(/\n-{3,}\n/).map(c => expand(c.trim())) }, m));

    src = src.replace(block('cardrow', 'endrow'), (m, opts, content) =>
      grab('CROW', store.cardRows, { opts: opts.trim(), content: expand(content.trim()) }, m));

    src = src.replace(block('linkbuttons'), (m, _, content) => grab('LBTN', store.linkBtns, content.trim(), m));

    src = src.replace(block('filecard'), (m, opts, content) =>
      grab('FCARD', store.fileCards, { opts: opts.trim(), label: content.trim() }, m));

    src = src.replace(block('navcards'), (m, _, content) => grab('NVCARDS', store.navCards, content.trim(), m));

    src = src.replace(block('refcards'), (m, _, content) => grab('RFCARDS', store.refCards, content.trim(), m));

    src = src.replace(/^:::video[ \t]+(\S+)[ \t]*\n:::[ \t]*$/gm, (m, url) => grab('VIDEO', store.videos, url, m));

    src = src.replace(block('hint'), (m, attrStr, content) => {
      const attrs = parseAttrs(attrStr);
      return grab('HINT', store.hints, { type: (attrs.type || 'info').trim(), title: attrs.title || '', content: expand(content.trim()) }, m);
    });

    src = src.replace(block('tabs', 'endtabs'), (m, _, content) => {
      const tabs = content.trim().split(/\n---\n/).map(section => {
        const t = section.match(/^\[([^\]]+)\]\n([\s\S]*)$/);
        return t ? { title: t[1], body: expand(t[2].trim()) } : { title: 'Tab', body: expand(section.trim()) };
      });
      return grab('TABS', store.tabs, tabs, m);
    });

    src = src.replace(/^:::embed[ \t]+(\S+)[ \t]*\n:::[ \t]*$/gm, (m, url) => grab('EMBED', store.embeds, url, m));

    src = src.replace(block('pageref'), (m, opts, title) => {
      const href = parseAttrs(opts).href;
      return href ? grab('PAGEREF', store.pageRefs, { href: href.trim(), title: title.trim() }, m) : m;
    });

    src = src.replace(block('expand'), (m, title, body) =>
      grab('EXPAND', store.expands, { title: title.trim(), body: expand(body.trim()) }, m));

    src = src.replace(block('gallery'), (m, opts, content) =>
      grab('GALLERY', store.galleries, { opts: opts.trim(), content: expand(content.trim()) }, m));

    src = src.replace(block('steps'), (m, _, content) =>
      grab('STEPS', store.steps, content.trim().split(/\n---\n/).map(s => expand(s.trim())), m));

    src = src.replace(block('field'), (m, attrStr, content) => {
      const attrs = parseAttrs(attrStr);
      return grab('FIELD', store.fields, {
        name: attrs.name || '',
        type: attrs.type || '',
        required: /(^|\s)required(\s|$)/.test(attrStr) || attrs.required === 'true',
        def: attrs.default || '',
        desc: expand(content.trim()),
      }, m);
    });

    src = src.replace(/\[(center|left|right)\]([\s\S]*?)\[\/\1\]/gm, (m, dir, body) =>
      grab('ALIGN', store.aligns, { dir, body: expand(body.trim()) }, m));

    // Raw block-level HTML passes through the renderer unmodified.
    src = src.replace(/^(<(?:div|figure|details|summary|section|article|aside|header|footer)[^>]*>[\s\S]*?<\/(?:div|figure|details|summary|section|article|aside|header|footer)>)$/gm, (m, html) =>
      grab('RAWHTML', store.rawHtml, html, m));

    src = src.replace(block('card'), (m, opts, content) =>
      grab('CARD', store.cards, { opts: opts.trim(), content: expand(content.trim()) }, m));
  } while (src !== before);

  return src;
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderers
// ─────────────────────────────────────────────────────────────────────────────

/** target/rel attributes for a link, opening external URLs in a new tab. */
function linkTarget(href) {
  return /^https?:\/\//.test(href) ? ' target="_blank" rel="noopener"' : '';
}

/** Material card. */
function renderCard(optsStr, content, ctx) {
  const attrs = parseAttrs(optsStr);
  let style = '';
  const classes = ['md-card'];
  if (attrs.bg) {
    if (IMG_URL_RE.test(attrs.bg)) {
      style += `background-image:url('${attrs.bg.replace(/'/g, '%27')}');background-size:cover;background-position:center;`;
      classes.push('md-card-bgimg');
    } else {
      const bg = safeColor(attrs.bg);
      if (bg) {
        style += `background:${bg};`;
        // In dark mode, revert light custom backgrounds unless an explicit text color is given.
        if (!attrs.color) classes.push('md-card-custom-bg');
      }
    }
  }
  { const c = safeColor(attrs.color); if (c) style += `color:${c};`; }
  if (attrs.border === 'true' || attrs.border === '1') style += 'border:1px solid var(--border);';
  else if (attrs.border && attrs.border !== 'false') { const c = safeColor(attrs.border); if (c) style += `border:1px solid ${c};`; }
  if (attrs.shadow === 'none' || attrs.shadow === 'false') style += 'box-shadow:none;';
  if (attrs.align && /^(?:left|center|right|justify)$/i.test(attrs.align)) style += `text-align:${attrs.align.toLowerCase()};`;
  { const p = cssLen(attrs.padding); if (p) style += `padding:${p};`; }
  { const r = cssLen(attrs.radius); if (r) style += `border-radius:${r};`; }

  let imgHtml = '';
  if (attrs.img) {
    const imgSrc = escAttr(IMG_URL_RE.test(attrs.img) ? attrs.img : safeUrl(attrs.img));
    if (attrs.imgbg !== undefined) {
      // Logo-banner style: brand-colored header area with a centered logo.
      const imgFilter = attrs.imgwhite === 'true' ? ' style="filter:brightness(0) invert(1)"' : '';
      style += 'padding-top:0;';
      imgHtml = `<div class="md-card-imgband" style="background:${safeColor(attrs.imgbg) || 'transparent'}">`
        + `<img src="${imgSrc}" alt="" loading="lazy"${imgFilter}>`
        + `</div>`;
    } else {
      imgHtml = `<img class="md-card-img" src="${imgSrc}" alt="" loading="lazy">`;
    }
  }

  const styleAttr = style ? ` style="${escAttr(style)}"` : '';
  const cardHtml = `<div class="${classes.join(' ')}"${styleAttr}>${imgHtml}${ctx.md(content)}</div>`;
  if (attrs.href) {
    // maxwidth goes on the <a> wrapper so the flex:1 rule on .md-card can't override it.
    const mw = cssLen(attrs.maxwidth);
    const aStyle = mw ? ` style="max-width:${mw}"` : '';
    const href = safeUrl(attrs.href);
    return `<a href="${escAttr(href)}"${linkTarget(href)} class="md-card-link"${aStyle}>${cardHtml}</a>`;
  }
  return cardHtml;
}

/** Inline material button, [Text]{.btn bg="…" color="…" href="…"}. */
function renderBtn(text, attrsStr) {
  const attrs = parseAttrs(attrsStr);
  let style = `background:${safeColor(attrs.bg) || '#2563eb'};color:${safeColor(attrs.color) || '#fff'};`;
  if (attrs.bgimg && IMG_URL_RE.test(attrs.bgimg)) style += `background-image:url('${attrs.bgimg.replace(/'/g, '%27')}');background-size:cover;background-position:center;`;
  if (attrs.border === 'true' || attrs.border === '1') style += 'border:2px solid rgba(0,0,0,.2);';
  else if (attrs.border && attrs.border !== 'false' && attrs.border !== 'none') { const c = safeColor(attrs.border); style += c ? `border:2px solid ${c};` : 'border:none;'; }
  else style += 'border:none;';
  { const r = cssLen(attrs.radius); if (r) style += `border-radius:${r};`; }
  if (attrs.size === 'sm') style += 'padding:5px 14px;font-size:.8rem;';
  if (attrs.size === 'lg') style += 'padding:13px 30px;font-size:1rem;';
  const href = safeUrl(attrs.href || '#');
  return `<a href="${escAttr(href)}"${linkTarget(href)} class="md-btn" style="${escAttr(style)}">${escHtml(text)}</a>`;
}

/**
 * Inline badge, [Text]{.badge type="success"} or [Text]{.badge color="#…"}.
 * Built-in types: neutral (default), info, success, warning, danger.
 */
function renderBadge(text, attrsStr) {
  const attrs = parseAttrs(attrsStr);
  const type = ((attrs.type || 'neutral').toLowerCase().replace(/[^a-z]/g, '')) || 'neutral';
  let style = '';
  const c = safeColor(attrs.color);
  if (c) style += `background:${c};color:#fff;border-color:transparent;`;
  return `<span class="md-badge md-badge-${type}"${style ? ` style="${escAttr(style)}"` : ''}>${escHtml(text)}</span>`;
}

/** Cards laid out in a flex row. */
function renderCardRow(content, ctx) {
  const cards = [];
  content.replace(/^:::card([^\n]*)\n([\s\S]*?)\n:::/gm, (_, opts, c) => {
    cards.push(renderCard(opts.trim(), c.trim(), ctx));
    return '';
  });
  return `<div class="md-cardrow">${cards.join('')}</div>`;
}

/** SVG icon set for :::refcards. */
const REFCARD_ICONS = {
  'book-open': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  'users': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  'server': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
  'globe': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  'file-text': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  'layers': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  'settings': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  'zap': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  'link': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  'info': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};
const REFCARD_DEFAULT_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';

/** SVG icon set for :::hint callouts. */
const HINT_ICONS = {
  info: '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="var(--ci-b)"/><line x1="12" y1="11" x2="12" y2="17" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.2" fill="#fff"/></svg>',
  warning: '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="var(--cw-b)"/><line x1="12" y1="8" x2="12" y2="14" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="#fff"/></svg>',
  danger: '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="var(--cd-b)"/><line x1="8" y1="8" x2="16" y2="16" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><line x1="16" y1="8" x2="8" y2="16" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
  success: '<svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="var(--ct-b)"/><polyline points="7,12 10.5,15.5 17,9" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
};
const HINT_CLASS = { info: 'ci', warning: 'cw', danger: 'cd', success: 'ct' };

/** Normalize a YouTube watch/short URL to its embed form; null when not YouTube. */
function youTubeEmbed(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0` : null;
}

/** Normalize a Vimeo URL to its player embed form; null when not Vimeo. */
function vimeoEmbed(url) {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? `https://player.vimeo.com/video/${m[1]}` : null;
}

/** A rich link card for a URL that is not an allowlisted video embed. */
function embedLink(url) {
  const safe = safeUrl(url);
  const domain = safe.replace(/^https?:\/\//, '').split('/')[0];
  return `<a href="${escAttr(safe)}" target="_blank" rel="noopener" class="md-embed-link"><span class="md-embed-icon">🔗</span><span class="md-embed-body"><span class="md-embed-domain">${escHtml(domain)}</span><span class="md-embed-url">${escHtml(url)}</span></span></a>`;
}

/**
 * Render a video embed. Only YouTube and Vimeo, normalized to their known
 * embed origins, are ever placed in an <iframe>; any other URL becomes a safe
 * link, so an author can't drop an arbitrary (or javascript:/data:) URL into a
 * framed context.
 */
function renderVideo(url) {
  const src = youTubeEmbed(url) || vimeoEmbed(url);
  if (!src) return embedLink(url);
  return `<div class="md-video-wrap"><iframe src="${escAttr(src)}" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" loading="lazy" frameborder="0"></iframe></div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore, placeholder tokens → final HTML
// ─────────────────────────────────────────────────────────────────────────────

/** Replace every directive placeholder in `html` with its rendered form. */
function restore(html, store, ctx) {
  html = html.replace(/\x00CARD(\d+)\x00/g, (_, i) => {
    const { opts, content } = store.cards[+i];
    return renderCard(opts, content, ctx);
  });

  html = html.replace(/\x00CROW(\d+)\x00/g, (_, i) => renderCardRow(store.cardRows[+i].content, ctx));

  html = html.replace(/\x00LBTN(\d+)\x00/g, (_, i) => {
    const links = [];
    store.linkBtns[+i].split('\n').forEach(line => {
      const m = line.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) { const href = safeUrl(m[2]); links.push(`<a href="${escAttr(href)}"${linkTarget(href)} class="md-pagelink">${escHtml(m[1])}<span class="md-pagelink-arr"> →</span></a>`); }
    });
    return `<div class="md-linkbtns">${links.join('')}</div>`;
  });

  html = html.replace(/\x00FCARD(\d+)\x00/g, (_, i) => {
    const { opts, label } = store.fileCards[+i];
    const attrs = parseAttrs(opts);
    const href = safeUrl(attrs.href || '#');
    const ext = (attrs.ext || href.split('.').pop() || 'file').toUpperCase();
    const icon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>';
    return `<a href="${escAttr(href)}"${linkTarget(href)} class="md-filecard"><span class="md-filecard-icon">${icon}</span><span class="md-filecard-info"><span class="md-filecard-name">${escHtml(label)}</span><span class="md-filecard-ext">${escHtml(ext)}</span></span></a>`;
  });

  html = html.replace(/\x00NVCARDS(\d+)\x00/g, (_, i) => {
    const cards = [];
    store.navCards[+i].split('\n').forEach(line => {
      const m = line.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) cards.push(`<a href="${escAttr(safeUrl(m[2]))}" class="md-navcard"><span class="md-navcard-title">${escHtml(m[1])}</span><span class="md-navcard-arrow">›</span></a>`);
    });
    return `<div class="md-navcards">${cards.join('')}</div>`;
  });

  html = html.replace(/\x00RFCARDS(\d+)\x00/g, (_, i) => {
    // Lines alternate between [icon|Title|/url] headers and description text.
    const lines = store.refCards[+i].split('\n');
    const cards = [];
    let li = 0;
    while (li < lines.length) {
      const hm = lines[li].trim().match(/^\[([^\|]+)\|([^\|]+)\|([^\]]+)\]$/);
      if (!hm) { li++; continue; }
      const [, iconName, title, href] = hm;
      li++;
      const descLines = [];
      while (li < lines.length && !lines[li].trim().match(/^\[([^\|]+)\|([^\|]+)\|([^\]]+)\]$/)) {
        if (lines[li].trim()) descLines.push(lines[li].trim());
        li++;
      }
      const desc = descLines.join(' ');
      const safeH = safeUrl(href.trim());
      cards.push(
        `<a href="${escAttr(safeH)}"${linkTarget(safeH)} class="md-refcard">`
        + `<span class="md-refcard-icon">${REFCARD_ICONS[iconName.trim()] || REFCARD_DEFAULT_ICON}</span>`
        + `<span class="md-refcard-body">`
        + `<span class="md-refcard-title">${escHtml(title.trim())}</span>`
        + (desc ? `<span class="md-refcard-desc">${escHtml(desc)}</span>` : '')
        + `</span></a>`);
    }
    return `<div class="md-refcards">${cards.join('')}</div>`;
  });

  html = html.replace(/\x00VIDEO(\d+)\x00/g, (_, i) => renderVideo(store.videos[+i]));

  html = html.replace(/\x00HINT(\d+)\x00/g, (_, i) => {
    const { type, title, content } = store.hints[+i];
    const cls = HINT_CLASS[type] || 'ci';
    const icon = HINT_ICONS[type] || HINT_ICONS.info;
    const titleHtml = title ? `<span class="callout-title">${escHtml(title)}</span>` : '';
    return `<blockquote class="${cls}"><span class="callout-icon">${icon}</span><span class="callout-body">${titleHtml}${ctx.md(content)}</span></blockquote>`;
  });

  html = html.replace(/\x00TABS(\d+)\x00/g, (_, i) => {
    const tabs = store.tabs[+i];
    const navBtns = tabs.map((t, ti) =>
      `<button class="md-tab-btn${ti === 0 ? ' active' : ''}" data-tab-idx="${ti}" data-tab-label="${escAttr(t.title)}">${escHtml(t.title)}</button>`).join('');
    const panes = tabs.map((t, ti) =>
      `<div class="md-tab-pane${ti === 0 ? ' active' : ''}">${ctx.md(t.body)}</div>`).join('');
    return `<div class="md-tabs"><div class="md-tabs-nav" role="tablist">${navBtns}</div><div class="md-tabs-body">${panes}</div></div>`;
  });

  html = html.replace(/\x00EMBED(\d+)\x00/g, (_, i) => renderVideo(store.embeds[+i]));

  html = html.replace(/\x00PAGEREF(\d+)\x00/g, (_, i) => {
    const { href: rawHref, title } = store.pageRefs[+i];
    const href = safeUrl(rawHref);
    return `<a href="${escAttr(href)}"${linkTarget(href)} class="md-pageref"><span class="md-pageref-icon">📄</span><span class="md-pageref-title">${escHtml(title || href)}</span><span class="md-pageref-arrow">→</span></a>`;
  });

  html = html.replace(/\x00RAWHTML(\d+)\x00/g, (_, i) => scrubHtml(store.rawHtml[+i]));

  html = html.replace(/\x00EXPAND(\d+)\x00/g, (_, i) => {
    const { title, body } = store.expands[+i];
    return `<details class="md-expand"><summary class="md-expand-summary">${escHtml(title)}</summary><div class="md-expand-body">${ctx.md(body)}</div></details>`;
  });

  html = html.replace(/\x00ALIGN(\d+)\x00/g, (_, i) => {
    const { dir, body } = store.aligns[+i];
    return `<div class="align-${dir}">${ctx.md(body)}</div>`;
  });

  html = html.replace(/\x00GRID(\d+)\x00/g, (_, i) => {
    const { opts, cells } = store.grids[+i];
    const attrs = parseAttrs(opts);
    let cls = 'md-grid';
    let style = '';
    // Column count rides a CSS variable (not grid-template-columns directly) so
    // the responsive rule can collapse it to one column on mobile, an inline
    // grid-template-columns would out-specify the stylesheet and never collapse.
    if (/^[1-9]$/.test(attrs.cols || '')) { cls += ' md-grid-fixed'; style += `--md-cols:${attrs.cols};`; }
    if (attrs.gap) style += `gap:${attrs.gap};`;
    if (attrs.align) style += `align-items:${attrs.align};`;
    const cellHtml = cells.map(c => `<div class="md-grid-cell">${ctx.md(c)}</div>`).join('');
    return `<div class="${cls}"${style ? ` style="${escAttr(style)}"` : ''}>${cellHtml}</div>`;
  });

  html = html.replace(/\x00GALLERY(\d+)\x00/g, (_, i) => {
    const { opts, content } = store.galleries[+i];
    const attrs = parseAttrs(opts);
    const colStyle = /^[1-6]$/.test(attrs.cols || '') ? ` style="grid-template-columns:repeat(${attrs.cols},1fr)"` : '';
    const cells = content.split('\n').map(l => l.trim()).filter(Boolean)
      .map(line => `<div class="md-gallery-cell">${ctx.inline(line)}</div>`).join('');
    return `<div class="md-gallery"${colStyle}>${cells}</div>`;
  });

  html = html.replace(/\x00STEPS(\d+)\x00/g, (_, i) => {
    const items = store.steps[+i].map(body => `<li class="md-step"><div class="md-step-body">${ctx.md(body)}</div></li>`).join('');
    return `<ol class="md-steps">${items}</ol>`;
  });

  html = html.replace(/\x00FIELD(\d+)\x00/g, (_, i) => {
    const f = store.fields[+i];
    const meta = (f.type ? `<span class="md-field-type">${escHtml(f.type)}</span>` : '')
      + (f.required ? `<span class="md-field-req">required</span>` : '')
      + (f.def ? `<span class="md-field-default">default: <code>${escHtml(f.def)}</code></span>` : '');
    return `<div class="md-field"><div class="md-field-head"><code class="md-field-name">${escHtml(f.name)}</code>${meta}</div><div class="md-field-desc">${ctx.md(f.desc)}</div></div>`;
  });

  return html;
}

module.exports = { extract, restore, renderBtn, renderBadge, renderVideo, scrubHtml, TOKEN_RE };
