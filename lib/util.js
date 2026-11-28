'use strict';
/** Small shared helpers used across the engine. */

/** Escape text for HTML element content. */
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escape text for an HTML attribute value (double-quoted). */
function escAttr(s) {
  return escHtml(s).replace(/'/g, '&#39;');
}

/**
 * Parse a directive attribute string like `bg="#fff" border='true' size=lg`
 * into an object. Values may be double-quoted, single-quoted, or bare.
 */
function parseAttrs(str) {
  const result = {};
  const re = /(\w+)=(?:"([^"]*?)"|'([^']*?)'|([^\s}]*))/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    result[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
  }
  return result;
}

/**
 * Neutralize a dangerous URL scheme in an author-supplied href.
 *
 * Resistant to obfuscation: leading/embedded ASCII control characters and
 * whitespace are stripped before the scheme test, because browsers ignore
 * those when resolving a URL, so `\x01javascript:` and `java\tscript:` would
 * otherwise slip past a naive `^\s*` guard. Returns the cleaned URL, or `#`
 * when it resolves to javascript:/vbscript:/data:.
 */
function safeUrl(href) {
  // Browsers strip ASCII control characters (including tab/newline/CR) when
  // resolving a URL, so remove them entirely before the scheme test, 
  // otherwise `java\tscript:` would survive as a real javascript: URL.
  const cleaned = String(href == null ? '' : href).replace(/[\x00-\x1f\x7f-\x9f]+/g, '').trim();
  return /^(?:javascript|vbscript|data):/i.test(cleaned) ? '#' : cleaned;
}

/** The site's public address from config.url (http or https, any sub-path, no trailing slash), or ''. */
function publicUrl(config) {
  const u = String((config && config.url) || '');
  return /^https?:\/\/[^\s"'<>\\]+$/i.test(u) ? u.replace(/\/+$/, '') : '';
}

/**
 * Extra version-menu entries from config.versionLinks: each { label, url } where url is
 * another deployment of these docs (http or https, no trailing slash), such as a branch
 * preview. Entries without a label or with any other scheme are dropped.
 */
function versionLinks(config) {
  const links = Array.isArray(config && config.versionLinks) ? config.versionLinks : [];
  return links
    .map(l => ({ label: String((l && l.label) || '').trim(), url: publicUrl({ url: l && l.url }) }))
    .filter(l => l.label && l.url);
}

/**
 * Return `v` only when it is a safe CSS color token (hex, rgb/rgba/hsl/hsla,
 * a `var(--x)` reference, or a bare color keyword); otherwise ''. This keeps
 * author-supplied colors from carrying extra declarations or, worse, closing
 * a `<style>` element and breaking out into markup.
 */
function safeColor(v) {
  const s = String(v == null ? '' : v).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s;
  if (/^(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)$/i.test(s)) return s;
  if (/^var\(\s*--[\w-]+\s*\)$/.test(s)) return s;
  if (/^[a-z]+$/i.test(s)) return s;
  return '';
}

/**
 * Return `v` only when it is a single safe CSS length/number token
 * (`120`, `12px`, `50%`, `1.5rem`, `100vh`…); a bare number becomes px.
 * Anything containing separators that could smuggle a second declaration
 * (`;`, spaces, `{}`, `<`) is rejected as ''.
 */
function cssLen(v) {
  const s = String(v == null ? '' : v).trim();
  if (/^-?[\d.]+$/.test(s)) return `${s}px`;
  if (/^-?[\d.]+(?:px|em|rem|%|vw|vh|vmin|vmax|ch|fr)$/i.test(s)) return s;
  return '';
}

/** Heading text → URL slug (same algorithm the engine has always used). */
function slugify(text) {
  return String(text).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
}

/** Slug → Title Case fallback when no explicit title exists. */
function slugToTitle(s) {
  return (s || 'index').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

module.exports = { escHtml, escAttr, parseAttrs, safeUrl, publicUrl, versionLinks, safeColor, cssLen, slugify, slugToTitle };
