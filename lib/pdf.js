'use strict';
/**
 * Whole-version Markdown → PDF renderer.
 *
 * A pure Node-built-ins PDF writer (no npm dependency, matches the rest of
 * the engine's zero-dependency promise, and runs identically in local dev,
 * CI, and any static host's build image). It walks a version's pages in the
 * same order the sidebar uses, re-parses each page's raw Markdown into a
 * small block list (headings, paragraphs, code, lists, quotes, tables, hr),
 * and lays that out into a PDF with a title page and a page-numbered
 * contents list.
 *
 * ponytail: this is a from-scratch subset of Markdown, not lib/markdown.js's
 * full pipeline: directive fences (`:::hint …`) and GitBook syntax are not
 * rendered (dropped, their inner prose still flows through as normal
 * paragraphs/quotes). Images ARE embedded (see lib/pdf-images.js: JPEG and
 * PNG are decoded for real; WEBP/GIF/SVG fall back to an "[Image: alt]"
 * line - a handful of the real corpus, not worth three more codecs).
 *
 * ponytail: bold-run wrapping approximates Helvetica-Bold widths as regular
 * width x1.09 (rounded up) rather than a second ~95-entry metrics table.
 * Errs wide, so lines wrap a little early under heavy bold use, never
 * overflow the page.
 *
 * ponytail: internal cross-page links (`[text](../other-page)`) render as
 * plain styled text, not a clickable jump - there is no per-page PDF
 * destination map yet. Only absolute http(s) links become clickable
 * annotations.
 */

const { safeUrl } = require('./util');
const { loadImages } = require('./pdf-images');

// ─────────────────────────────────────────────────────────────────────────────
// Page geometry
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W = 612;   // US Letter, points (72/inch)
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MARGIN_BOTTOM = MARGIN + 14; // room for the footer page number

const SIZE = { h1: 21, h2: 16, h3: 13, h4: 11, body: 10.5, code: 9, small: 8.5 };
const LEADING = 1.32;   // body/heading line-height multiplier
const CODE_LEADING = 1.28;

// Standard Helvetica glyph widths (per 1000 em), codes 32-126, plus the
// handful of WinAnsi typographic punctuation prose actually uses. Public,
// factual metrics from the base-14 AFM set, not engine-specific data.
const HELV_WIDTHS = {
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191, 40: 333, 41: 333,
  42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278, 48: 556, 49: 556, 50: 556, 51: 556,
  52: 556, 53: 556, 54: 556, 55: 556, 56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584,
  62: 584, 63: 556, 64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778, 80: 667, 81: 778,
  82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944, 88: 667, 89: 667, 90: 611, 91: 278,
  92: 278, 93: 278, 94: 469, 95: 556, 96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556,
  102: 278, 103: 556, 104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556,
  111: 556, 112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556, 118: 500, 119: 722,
  120: 500, 121: 500, 122: 500, 123: 334, 124: 260, 125: 334, 126: 584,
  0x2018: 222, 0x2019: 222, 0x201C: 333, 0x201D: 333, 0x2013: 556, 0x2014: 1000,
  0x2026: 1000, 0x2022: 350, 0x00A0: 278,
};
const DEFAULT_WIDTH = 556; // unmapped glyph (e.g. non-Latin1 unicode): average-width fallback
const BOLD_FUDGE = 1.09;   // see file header ponytail note
const COURIER_WIDTH = 600; // fixed, exact, every glyph

/** Width of one glyph, in points, for the given font size and style. */
function glyphWidth(code, size, style) {
  if (style.code) return (COURIER_WIDTH / 1000) * size;
  const w = HELV_WIDTHS[code] || DEFAULT_WIDTH;
  return ((style.bold ? w * BOLD_FUDGE : w) / 1000) * size;
}

/** Width of a whole string under one style. */
function textWidth(text, size, style) {
  let w = 0;
  for (let i = 0; i < text.length; i++) w += glyphWidth(text.codePointAt(i), size, style);
  return w;
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Markdown → block parser (text layout only, no HTML)
// ─────────────────────────────────────────────────────────────────────────────

/** Split inline text into styled runs: bold, italic, inline code, links. */
function parseInline(text) {
  const runs = [];
  const re = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_|\[([^\]]+)\]\(([^)]+)\)/;
  let s = text;
  while (s.length) {
    const m = re.exec(s);
    if (!m) { runs.push({ text: s }); break; }
    if (m.index > 0) runs.push({ text: s.slice(0, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) runs.push({ text: m[2], bold: true });
    else if (m[3] !== undefined) runs.push({ text: m[3], code: true });
    else if (m[4] !== undefined) runs.push({ text: m[4], italic: true });
    else if (m[5] !== undefined) runs.push({ text: m[5], italic: true });
    else runs.push({ text: m[6], url: m[7] });
    s = s.slice(m.index + m[0].length);
  }
  return runs;
}

/** true when `line` starts a new block (used to end paragraph accumulation). */
function isBlockStart(line) {
  return /^\s*$/.test(line) || /^:::/.test(line.trim()) || /^```/.test(line.trim())
    || /^#{1,4}\s/.test(line) || /^>\s?/.test(line) || /^(\s*)(?:[-*+]|\d+\.)\s+/.test(line)
    || /^\|.*\|\s*$/.test(line) || /^!\[/.test(line.trim()) || /^-{3,}\s*$/.test(line.trim());
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

/** Raw page Markdown -> a flat block list ready for layout. */
function parseBlocks(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') { i++; continue; }
    if (/^:::/.test(trimmed)) { i++; continue; } // directive fence line: drop, let inner prose flow

    const fence = /^```(.*)$/.exec(trimmed);
    if (fence) {
      i++;
      const code = [];
      while (i < lines.length && lines[i].trim() !== '```') { code.push(lines[i]); i++; }
      i++; // closing fence
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ type: 'h' + h[1].length, runs: parseInline(h[2].trim()) }); i++; continue; }

    if (/^-{3,}\s*$/.test(trimmed) || /^\*{3,}\s*$/.test(trimmed)) { blocks.push({ type: 'hr' }); i++; continue; }

    if (/^>\s?/.test(line)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push({ type: 'quote', runs: parseInline(q.join(' ').trim()) });
      continue;
    }

    const li = /^(\s*)(?:([-*+])|(\d+)\.)\s+(.*)$/.exec(line);
    if (li) {
      const ordered = li[3] !== undefined;
      const indent = Math.floor(li[1].length / 2);
      let text = li[4];
      i++;
      while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !isBlockStart(lines[i])) { text += ' ' + lines[i].trim(); i++; }
      blocks.push({ type: 'li', ordered, indent, runs: parseInline(text.trim()) });
      continue;
    }

    if (/^\|.*\|\s*$/.test(trimmed) && i + 1 < lines.length && /^\|?[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())) {
      const header = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i].trim())) { rows.push(splitTableRow(lines[i])); i++; }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const img = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(trimmed);
    if (img) { blocks.push({ type: 'img', alt: img[1], url: img[2] }); i++; continue; }

    const pLines = [line];
    i++;
    while (i < lines.length && !isBlockStart(lines[i])) { pLines.push(lines[i]); i++; }
    blocks.push({ type: 'p', runs: parseInline(pLines.join(' ').trim()) });
  }
  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Word-wrap: styled runs -> visual lines that fit a given width
// ─────────────────────────────────────────────────────────────────────────────

/** Runs -> a token stream of words and single-space separators, styles kept. */
function tokenize(runs) {
  const tokens = [];
  for (const run of runs) {
    const style = { bold: !!run.bold, italic: !!run.italic, code: !!run.code, url: run.url };
    const parts = run.text.split(/(\s+)/);
    for (const part of parts) {
      if (part === '') continue;
      tokens.push(/^\s+$/.test(part) ? { space: true } : { text: part, style });
    }
  }
  return tokens;
}

/** Greedy line-wrap of a token stream to `width` points at font `size`. Returns word arrays per line. */
function wrapTokens(tokens, width, size) {
  const lines = [];
  let line = [];
  let lineW = 0;
  for (const tok of tokens) {
    if (tok.space) {
      if (line.length) { line.push(tok); lineW += glyphWidth(32, size, {}); }
      continue;
    }
    const w = textWidth(tok.text, size, tok.style);
    if (line.length && lineW + w > width) { lines.push(line); line = []; lineW = 0; }
    line.push(tok);
    lineW += w;
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[]];
}

/** Hard character-wrap for one raw (unstyled, monospace) code line. */
function wrapCodeLine(text, width, size) {
  const perChar = (COURIER_WIDTH / 1000) * size;
  const maxChars = Math.max(1, Math.floor(width / perChar));
  if (text.length <= maxChars) return [text];
  const out = [];
  for (let i = 0; i < text.length; i += maxChars) out.push(text.slice(i, i + maxChars));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level PDF object model
// ─────────────────────────────────────────────────────────────────────────────

// Unicode code point -> single WinAnsiEncoding byte, for the handful of
// typographic characters prose actually uses. A PDF string literal is bytes,
// not code points: the raw code point (e.g. U+2022 = 8226) doesn't fit a
// \ddd octal escape (max 3 octal digits, i.e. one byte) and corrupts the
// stream, so this has to go through the encoding's own byte value.
const WINANSI_BYTE = {
  0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2013: 150, 0x2014: 151,
  0x2026: 133, 0x2022: 149, 0x00A0: 160,
};

function pdfEscape(s) {
  let out = '';
  for (const ch of String(s)) {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '(' || ch === ')') out += '\\' + ch;
    else if (code >= 32 && code <= 126) out += ch;
    else if (WINANSI_BYTE[code] !== undefined) out += '\\' + WINANSI_BYTE[code].toString(8).padStart(3, '0');
    else out += '?';
  }
  return out;
}

class PdfWriter {
  constructor() { this._bodies = []; }
  reserve() { this._bodies.push(null); return this._bodies.length; }
  add(body) { this._bodies.push(body); return this._bodies.length; }
  set(num, body) { this._bodies[num - 1] = body; }

  serialize() {
    const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const chunks = [header];
    const offsets = [];
    let pos = Buffer.byteLength(header, 'latin1');
    for (let i = 0; i < this._bodies.length; i++) {
      offsets.push(pos);
      const s = `${i + 1} 0 obj\n${this._bodies[i]}\nendobj\n`;
      chunks.push(s);
      pos += Buffer.byteLength(s, 'latin1');
    }
    const xrefStart = pos;
    const n = this._bodies.length + 1;
    let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    chunks.push(xref);
    chunks.push(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
    return Buffer.from(chunks.join(''), 'latin1');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page/content-stream builder
// ─────────────────────────────────────────────────────────────────────────────

const FONT_TAG = { regular: '/F1', bold: '/F2', italic: '/F3', code: '/F4' };
function fontFor(style) { return style.code ? FONT_TAG.code : style.bold ? FONT_TAG.bold : style.italic ? FONT_TAG.italic : FONT_TAG.regular; }

class Doc {
  constructor() {
    this.pages = []; // { ops: string, annots: [{rect:[x0,y0,x1,y1], url}] }
    this.images = new Map(); // url -> { name: '/ImN', info } - shared XObject resources across every page
    this._startPage();
  }

  _startPage() {
    this.page = { ops: [], annots: [] };
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN;
  }

  /** Ensure `h` points remain below the cursor, starting a new page otherwise. */
  ensure(h) { if (this.y - h < MARGIN_BOTTOM) this._startPage(); }

  op(s) { this.page.ops.push(s); }

  rect(x, y, w, h, gray) { this.op(`${gray} g`); this.op(`${x} ${y} ${w} ${h} re f`); this.op('0 g'); }
  hline(x1, x2, y, gray) { this.op(`${gray} G`); this.op(`${x1} ${y} m ${x2} ${y} l S`); this.op('0 G'); }

  text(x, y, str, tag, size) {
    this.op('BT');
    this.op(`${tag} ${size} Tf`);
    this.op(`${x} ${y} Td`);
    this.op(`(${pdfEscape(str)}) Tj`);
    this.op('ET');
  }

  /** One already-wrapped line of styled tokens; draws left-to-right, advances y. */
  drawLine(tokens, x0, size, opts = {}) {
    const lineHeight = size * LEADING;
    this.ensure(lineHeight);
    let x = x0;
    const y = this.y - size * 0.9;
    for (const tok of tokens) {
      if (tok.space) { x += glyphWidth(32, size, {}); continue; }
      const w = textWidth(tok.text, size, tok.style);
      this.text(x, y, tok.text, fontFor(tok.style), size);
      if (tok.style.url) {
        const href = safeUrl(tok.style.url);
        if (/^https?:\/\//i.test(href)) this.page.annots.push({ rect: [x, y - 2, x + w, y + size], url: href });
        this.hline(x, x + w, y - 1, 0.4);
      }
      x += w;
    }
    if (opts.bulletChar) this.text(x0 - 12, y, opts.bulletChar, FONT_TAG.regular, size);
    this.y -= lineHeight;
  }

  codeBlock(text) {
    const lines = text.split('\n').flatMap(l => wrapCodeLine(l, CONTENT_W - 16, SIZE.code));
    const lh = SIZE.code * CODE_LEADING;
    const boxH = lines.length * lh + 10;
    this.ensure(Math.min(boxH, PAGE_H - MARGIN - MARGIN_BOTTOM));
    const top = this.y;
    this.rect(MARGIN, top - boxH, CONTENT_W, boxH, 0.94);
    this.y -= 5;
    for (const l of lines) {
      this.ensure(lh);
      this.text(MARGIN + 8, this.y - SIZE.code * 0.85, l, FONT_TAG.code, SIZE.code);
      this.y -= lh;
    }
    this.y -= 5;
  }

  heading(runs, level) {
    const size = SIZE['h' + level];
    this.ensure(size * LEADING + (level === 1 ? 10 : 4));
    if (level === 1) this.y -= 6;
    const bolded = runs.map(r => ({ ...r, style: undefined }));
    for (const line of wrapTokens(tokenize(bolded.map(r => ({ text: r.text, bold: true }))), CONTENT_W, size)) {
      this.drawLine(line, MARGIN, size);
    }
    this.y -= level === 1 ? 8 : 4;
  }

  paragraph(runs, opts = {}) {
    const x0 = MARGIN + (opts.indent || 0) * 18;
    const width = CONTENT_W - (opts.indent || 0) * 18;
    const lines = wrapTokens(tokenize(runs), width, SIZE.body);
    lines.forEach((line, idx) => this.drawLine(line, x0, SIZE.body, idx === 0 ? opts : {}));
    this.y -= 4;
  }

  hr() {
    this.ensure(14);
    this.hline(MARGIN, PAGE_W - MARGIN, this.y - 6, 0.75);
    this.y -= 14;
  }

  /** Draw a decoded image (see lib/pdf-images.js), scaled to fit the content width and centered. */
  image(url, info) {
    const maxW = CONTENT_W;
    const maxH = PAGE_H - MARGIN - MARGIN_BOTTOM - 20; // never demand more than one page can ever hold
    let w = Math.min(info.width, maxW);
    let h = w * (info.height / info.width);
    if (h > maxH) { h = maxH; w = h * (info.width / info.height); }
    this.ensure(h + 10);
    let entry = this.images.get(url);
    if (!entry) { entry = { name: `/Im${this.images.size + 1}`, info }; this.images.set(url, entry); }
    const x = MARGIN + (CONTENT_W - w) / 2;
    const y = this.y - h;
    this.op(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm ${entry.name} Do Q`);
    this.y -= h + 10;
  }

  table(block) {
    const cols = block.header.length;
    const colW = CONTENT_W / cols;
    const renderRow = (cells, bold) => {
      const wrapped = cells.map(c => wrapTokens(tokenize([{ text: c, bold }]), colW - 10, SIZE.body));
      const rows = Math.max(1, ...wrapped.map(w => w.length));
      const rowH = rows * SIZE.body * LEADING + 6;
      this.ensure(rowH);
      const top = this.y;
      for (let c = 0; c < cols; c++) {
        this.y = top;
        this.y -= 4;
        for (const line of wrapped[c]) this.drawLine(line, MARGIN + c * colW + 4, SIZE.body);
      }
      this.y = top - rowH;
      this.hline(MARGIN, PAGE_W - MARGIN, this.y, 0.85);
    };
    this.hline(MARGIN, PAGE_W - MARGIN, this.y, 0.4);
    renderRow(block.header, true);
    for (const row of block.rows) renderRow(row, false);
    this.y -= 6;
  }
}

/** Every image URL a block list references, for the whole-version prefetch pass. */
function imageUrls(blocks) {
  return blocks.filter(b => b.type === 'img' && b.url).map(b => b.url);
}

/** Lay out one page's blocks. `images` is the version-wide Map<url, decodedInfo|null> from the prefetch pass. */
function layoutPage(doc, title, blocks, images) {
  doc.heading([{ text: title }], 1);
  for (const b of blocks) {
    switch (b.type) {
      case 'h1': doc.heading(b.runs, 1); break;
      case 'h2': doc.heading(b.runs, 2); break;
      case 'h3': doc.heading(b.runs, 3); break;
      case 'h4': doc.heading(b.runs, 4); break;
      case 'code': doc.codeBlock(b.text); break;
      case 'hr': doc.hr(); break;
      case 'quote': doc.paragraph(b.runs, { indent: 1 }); break;
      case 'li': doc.paragraph(b.runs, { indent: 1 + b.indent, bulletChar: b.ordered ? undefined : '•' }); break;
      case 'table': doc.table(b); break;
      case 'img': {
        const info = b.url && images.get(b.url);
        if (info) doc.image(b.url, info);
        else doc.paragraph([{ text: `[Image: ${b.alt || 'untitled'}]`, italic: true }]);
        break;
      }
      case 'p': default: if (b.runs && b.runs.length) doc.paragraph(b.runs); break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level: one version -> a PDF buffer
// ─────────────────────────────────────────────────────────────────────────────

const TOC_LINE_H = 16;
const TOC_LINES_PER_PAGE = Math.floor((PAGE_H - MARGIN - MARGIN_BOTTOM - 60) / TOC_LINE_H);

/** Render every page of `version`, in sidebar order, into one PDF buffer. */
async function renderVersionPdf(site, config, version, listPages) {
  const pages = listPages(site, version).map(p => ({ ...p, blocks: parseBlocks(p.content || '') }));
  const doc = new Doc();

  // One fetch pass for every image the whole version references (deduped),
  // before any layout happens, so layoutPage can draw synchronously.
  const urls = [...new Set(pages.flatMap(p => imageUrls(p.blocks)))];
  const images = await loadImages(urls);

  // Title page.
  doc.y = PAGE_H / 2 + 40;
  doc.heading([{ text: config.title || 'Documentation' }], 1);
  doc.paragraph([{ text: `Version ${version}` }]);
  doc.paragraph([{ text: `Generated ${new Date().toISOString().slice(0, 10)}` }]);
  if (config.description) doc.paragraph([{ text: config.description, italic: true }]);

  // Contents list: page count is known upfront (one line per doc), so its
  // page count doesn't depend on the content layout that follows it.
  const tocPageCount = Math.max(1, Math.ceil(pages.length / TOC_LINES_PER_PAGE));
  for (let i = 0; i < tocPageCount; i++) doc._startPage();
  const tocStartIndex = doc.pages.length - tocPageCount;

  const toc = [];
  for (const p of pages) {
    const startPage = doc.pages.length + 1; // 1-based, filled in as content begins
    doc._startPage();
    layoutPage(doc, p.title, p.blocks, images);
    toc.push({ title: p.title, page: startPage });
  }

  // Fill the reserved contents pages now that every start page is known.
  let tocY = null, tocPageIdx = tocStartIndex - 1;
  const startToc = () => { tocPageIdx++; doc.page = doc.pages[tocPageIdx]; doc.y = PAGE_H - MARGIN; doc.heading([{ text: 'Contents' }], 1); };
  startToc();
  for (const entry of toc) {
    doc.ensure(TOC_LINE_H);
    const label = entry.title;
    const pageStr = String(entry.page);
    const labelW = textWidth(label, SIZE.body, {});
    const dotsW = CONTENT_W - labelW - textWidth(pageStr, SIZE.body, {}) - 8;
    const dots = dotsW > 0 ? ' ' + '.'.repeat(Math.max(0, Math.floor(dotsW / textWidth('.', SIZE.body, {})))) : '';
    doc.text(MARGIN, doc.y - SIZE.body * 0.9, label + dots, FONT_TAG.regular, SIZE.body);
    doc.text(PAGE_W - MARGIN - textWidth(pageStr, SIZE.body, {}), doc.y - SIZE.body * 0.9, pageStr, FONT_TAG.regular, SIZE.body);
    doc.y -= TOC_LINE_H;
    if (doc.y - MARGIN_BOTTOM < TOC_LINE_H && tocPageIdx < tocStartIndex + tocPageCount - 1) startToc();
  }

  // Footer page numbers on every page.
  doc.pages.forEach((pg, idx) => {
    const num = String(idx + 1);
    const savedPage = doc.page;
    doc.page = pg;
    doc.text(PAGE_W / 2 - textWidth(num, SIZE.small, {}) / 2, MARGIN - 14, num, FONT_TAG.regular, SIZE.small);
    doc.page = savedPage;
  });

  return assemble(doc);
}

/** Turn the laid-out Doc into a serialized PDF buffer. */
function assemble(doc) {
  const w = new PdfWriter();
  const catalog = w.reserve();       // 1
  const pagesRoot = w.reserve();     // 2
  const fRegular = w.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fBold = w.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fItalic = w.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  const fCode = w.add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');

  // Every image used anywhere in the doc is one shared XObject resource;
  // each page's content stream only ever invokes the /ImN names it actually
  // drew, so listing every one here for every page is harmless.
  const imageRefs = [];
  for (const { name, info } of doc.images.values()) {
    let smaskRef = '';
    if (info.smaskData) {
      const smaskObj = w.add(`<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} `
        + `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${info.smaskData.length} >>\n`
        + `stream\n${info.smaskData.toString('latin1')}\nendstream`);
      smaskRef = ` /SMask ${smaskObj} 0 R`;
    }
    const imgObj = w.add(`<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} `
      + `/ColorSpace ${info.colorSpace} /BitsPerComponent 8 /Filter ${info.filter}${smaskRef} /Length ${info.data.length} >>\n`
      + `stream\n${info.data.toString('latin1')}\nendstream`);
    imageRefs.push(`${name} ${imgObj} 0 R`);
  }
  const xobjectPart = imageRefs.length ? ` /XObject << ${imageRefs.join(' ')} >>` : '';
  const resources = `<< /Font << /F1 ${fRegular} 0 R /F2 ${fBold} 0 R /F3 ${fItalic} 0 R /F4 ${fCode} 0 R >>${xobjectPart} >>`;

  const pageObjNums = [];
  for (const pg of doc.pages) {
    const stream = pg.ops.join('\n');
    const streamObj = w.add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    const annotNums = pg.annots.map(a =>
      w.add(`<< /Type /Annot /Subtype /Link /Rect [${a.rect.map(n => n.toFixed(2)).join(' ')}] /Border [0 0 0] `
        + `/A << /Type /Action /S /URI /URI (${pdfEscape(a.url)}) >> >>`));
    const annotsPart = annotNums.length ? ` /Annots [${annotNums.map(n => `${n} 0 R`).join(' ')}]` : '';
    const pageObj = w.add(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] `
      + `/Resources ${resources} /Contents ${streamObj} 0 R${annotsPart} >>`);
    pageObjNums.push(pageObj);
  }

  w.set(pagesRoot, `<< /Type /Pages /Kids [${pageObjNums.map(n => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>`);
  w.set(catalog, `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`);
  return w.serialize();
}

module.exports = { renderVersionPdf, parseBlocks, wrapTokens, tokenize, textWidth, pdfEscape, PdfWriter };
