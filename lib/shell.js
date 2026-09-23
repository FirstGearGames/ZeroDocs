'use strict';
/**
 * HTML shell, the single page served for every /docs/* route.
 *
 * The shell is a small skeleton: real styling lives in /assets/app.css and
 * behavior in /assets/app.js (both engine files, served with ETags). Only
 * three things are inlined because they must run/exist before first paint:
 *   1. the theme bootstrap (reads the saved theme, falls back to the OS
 *      preference, before the stylesheet loads, so no flash),
 *   2. the theme-variable overrides derived from docs.config.json,
 *   3. the boot payload (config + versions) so the client needs no extra
 *      round-trips before rendering.
 *
 * Per-page <title>/description/OpenGraph tags are injected server-side from
 * the requested page's frontmatter so crawlers and link previews see real
 * metadata, not just the SPA default.
 */

const { escHtml, escAttr, safeUrl, safeColor } = require('./util');

/** #rgb / #rrggbb → "r,g,b" for rgba() derivation. */
function hexToRgb(hex) {
  let h = (hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return '0,0,0';
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
}

/** WCAG relative luminance of a hex color (0 = black, 1 = white). */
function relLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).split(',').map(Number);
  const chan = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG contrast ratio between two colors (1 = identical, 21 = black on white). */
function contrastRatio(a, b) {
  const la = relLuminance(a), lb = relLuminance(b);
  return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

// Must track `html.dark` in assets/app.css.
const DARK_BG = '#0f1117';
/**
 * The contrast a dark-mode link has to reach, taken from the value the dark
 * theme was designed around: the stylesheet's own `--link: #7db8f7`, which
 * measures 9.05:1 on the dark background.
 *
 * Deliberately far above WCAG AA's 4.5. AA is a floor for text being readable
 * at all, and a link sitting at it lands near the muted/secondary text color
 * (#7d8590, 5.06:1) while the body text it interrupts is at 12.74:1, so the
 * link reads as de-emphasized rather than as the thing to click.
 */
const MIN_LINK_CONTRAST = 9;

/**
 * A link color with enough presence on the dark background.
 *
 * Most sites set `theme.primary` and nothing else, and a primary picked for a
 * white page (the #2563eb default is 3.65:1 on #0f1117) is far too dark to
 * carry a link in dark mode. Rather than drop the site's hue for a fixed blue,
 * this mixes it toward white in 5% steps and stops at the first value clearing
 * the floor. A color that already passes (a deliberately light `primaryDark`)
 * is returned untouched, and a non-hex color is passed through since it cannot
 * be measured.
 */
function legibleOnDark(color) {
  if (!/^#[0-9a-f]{3,8}$/i.test(color)) return color;
  if (contrastRatio(color, DARK_BG) >= MIN_LINK_CONTRAST) return color;
  const [r, g, b] = hexToRgb(color).split(',').map(Number);
  for (let t = 0.05; t < 1; t += 0.05) {
    const mixed = [r, g, b].map(c => Math.round(c + (255 - c) * t));
    const candidate = `#${mixed.map(c => c.toString(16).padStart(2, '0')).join('')}`;
    if (contrastRatio(candidate, DARK_BG) >= MIN_LINK_CONTRAST) return candidate;
  }
  return '#ffffff';
}

/**
 * A readable text color to place ON a solid fill: whichever of near-black or
 * white has the higher WCAG contrast with the fill. Keeps the accent fill
 * (`--act-bg`) legible for any primary/primaryDark the site chooses.
 */
function readableOn(hex) {
  const L = relLuminance(hex);
  const contrastWhite = 1.05 / (L + 0.05);
  const contrastBlack = (L + 0.05) / 0.05;
  // Pure black (not near-black) maximizes contrast on light/mid-tone fills.
  return contrastWhite >= contrastBlack ? '#ffffff' : '#000000';
}

/**
 * CSS variable overrides from config.theme. Emitted for BOTH light and dark
 * so a configured primary actually themes dark mode too (theme.primaryDark
 * overrides it there when the light primary doesn't suit a dark background).
 */
function themeVars(theme) {
  if (!theme || !Object.keys(theme).length) return '';
  // These values are emitted into a raw <style> element, so each must be a
  // validated CSS color: an unvalidated value could carry `}</style><script>…`
  // and break out of the stylesheet into markup (zero-click XSS).
  const p = safeColor(theme.primary) || '#2563eb';
  const pDark = safeColor(theme.primaryDark) || p;
  const s = safeColor(theme.success) || '#22c55e';
  const i = safeColor(theme.info) || '#3b82f6';
  const w = safeColor(theme.warning) || '#f59e0b';
  const d = safeColor(theme.danger) || '#ef4444';
  const sb = safeColor(theme.sidebar) || '#f3f4f6';
  const sbDark = safeColor(theme.sidebarDark) || '#1e2028';
  const callouts = alpha =>
    `--ci-b:${i};--ci-bg:rgba(${hexToRgb(i)},${alpha});`
    + `--cw-b:${w};--cw-bg:rgba(${hexToRgb(w)},${alpha});`
    + `--cd-b:${d};--cd-bg:rgba(${hexToRgb(d)},${alpha});`
    + `--ct-b:${s};--ct-bg:rgba(${hexToRgb(s)},${alpha});`;
  // --act-fg is derived from the fill so text on the accent stays legible even
  // when primaryDark is a light color (as it should be for links on dark bg).
  // --link is held to a contrast floor separately from --act-bg: link text has
  // to be readable ON the dark background, while the accent is a fill whose own
  // text is handled by readableOn, so lightening it too would blow out buttons.
  return `:root{--link:${p};--act-bg:${p};--act-fg:${readableOn(p)};--sidebar:${sb};${callouts('.1')}}`
    + `html.dark{--link:${legibleOnDark(pDark)};--act-bg:${pDark};--act-fg:${readableOn(pDark)};--sidebar:${sbDark};${callouts('.12')}}`;
}

/** The header logo: configured image, else a letter tile from the title. */
function logoHtml(config) {
  if (config.logo) return `<img class="logo-img" src="${escAttr(safeUrl(config.logo))}" alt="">`;
  const letter = (config.title || 'D').trim().charAt(0).toUpperCase() || 'D';
  return `<div class="logo-icon" aria-hidden="true">${escHtml(letter)}</div>`;
}

const isExternal = href => /^https?:\/\//.test(href || '');

/**
 * Site-wide announcement bar above the header. Config:
 *   "announcement": "text"   or
 *   "announcement": { "text": "…", "href": "…", "dismissible": true }
 */
function announcementHtml(config) {
  const a = config.announcement;
  if (!a) return '';
  const obj = typeof a === 'string' ? { text: a } : a;
  if (!obj.text) return '';
  const inner = obj.href
    ? `<a href="${escAttr(safeUrl(obj.href))}"${isExternal(obj.href) ? ' target="_blank" rel="noopener"' : ''}>${escHtml(obj.text)}</a>`
    : escHtml(obj.text);
  const close = obj.dismissible ? `<button id="announce-close" class="announce-close" aria-label="Dismiss announcement">×</button>` : '';
  return `<div id="announce" class="announce" data-key="${escAttr(obj.text)}"><span>${inner}</span>${close}</div>`;
}

/**
 * Site footer below the content. Config:
 *   "footer": "text"   or
 *   "footer": { "text": "…", "links": [{ "label": "…", "href": "…" }] }
 */
function footerHtml(config) {
  const f = config.footer;
  if (!f) return '';
  const obj = typeof f === 'string' ? { text: f } : f;
  const links = (obj.links || []).map(l =>
    `<a href="${escAttr(safeUrl(l.href || '#'))}"${isExternal(l.href) ? ' target="_blank" rel="noopener"' : ''}>${escHtml(l.label || '')}</a>`).join('');
  if (!obj.text && !links) return '';
  return `<footer class="site-footer"><div class="site-footer-inner">`
    + (obj.text ? `<span class="site-footer-text">${escHtml(obj.text)}</span>` : '')
    + (links ? `<nav class="site-footer-links" aria-label="Footer">${links}</nav>` : '')
    + `</div></footer>`;
}

/**
 * Render the shell.
 *   config     merged site config
 *   versions   version list (already resolved from disk)
 *   page       { title, description } | null, the requested page's metadata
 *   assetsVer  cache-busting token for the engine asset URLs
 *   basePath   URL prefix when the site is served under a sub-path (e.g.
 *              '/ZeroDocs' on a GitHub Pages project site); '' at a domain root
 */
function renderShell({ config, versions, page, assetsVer, staticMode, basePath }) {
  const siteTitle = config.title || 'Docs';
  const pageTitle = page && page.title ? `${page.title} | ${siteTitle}` : `${siteTitle} | Documentation`;
  const description = (page && page.description) || config.description || '';
  const b = (basePath || '').replace(/\/$/, '');
  const boot = JSON.stringify({ config, versions, staticMode: !!staticMode, basePath: b }).replace(/</g, '\\u003c');
  const v = assetsVer ? `?v=${encodeURIComponent(assetsVer)}` : '';
  // External links and PDFs open in a new tab.
  const navLinks = (config.nav || []).map(n => `<a href="${escAttr(safeUrl(n.href || '#'))}"${/^https?:\/\/|\.pdf$/i.test(n.href || '') ? ' target="_blank" rel="noopener"' : ''}>${escHtml(n.label || n.title || '')}</a>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<title>${escHtml(pageTitle)}</title>
${description ? `<meta name="description" content="${escAttr(description)}"/>` : ''}
<meta property="og:title" content="${escAttr(pageTitle)}"/>
${description ? `<meta property="og:description" content="${escAttr(description)}"/>` : ''}
<meta property="og:type" content="article"/>
<link rel="icon" href="${b}/favicon.svg" type="image/svg+xml"/>
<script>(function(){var t;try{t=localStorage.getItem('docs:theme')||localStorage.getItem('t')}catch(e){}
if(t!=='light'&&t!=='dark'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.classList.toggle('dark',t==='dark')})();</script>
<link rel="stylesheet" href="${b}/assets/app.css${v}"/>
<style id="theme-vars">${themeVars(config.theme)}</style>
<script>window.__DOCS__=${boot};</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<div id="wrap">
${announcementHtml(config)}
<header>
<div class="header-inner">
  <button id="hbg" class="ibtn" aria-label="Menu" aria-expanded="false" aria-controls="sidebar">
    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
  </button>
  <a class="logo" href="${b}/docs/${escAttr(versions[0] || 'v1')}">
    ${logoHtml(config)}
    <span id="site-title">${escHtml(siteTitle)}</span>
  </a>
  <nav class="top-nav" id="topnav" aria-label="Site links">
    ${navLinks}
  </nav>
  <div class="hright">
    <button class="search-pill" id="search-open" aria-label="Search documentation">
      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      Search
      <kbd id="search-kbd">Ctrl K</kbd>
    </button>
    <select class="ver-sel" id="versel" aria-label="Documentation version"${versions.length < 2 ? ' style="display:none"' : ''}>
      ${versions.map(vn => `<option value="${escAttr(vn)}">${escHtml(vn)}</option>`).join('')}
    </select>
    <button class="ibtn" id="theme-toggle" aria-label="Toggle color theme">
      <svg id="moon" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>
      <svg id="sun" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:none" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    </button>
  </div>
</div>
</header>
<div id="sovl"></div>
<div class="body">
  <aside id="sidebar"><nav id="navtree" aria-label="Documentation"></nav></aside>
  <div id="main-right">
    <div id="page-cover"><img id="page-cover-img" src="" alt=""></div>
    <div id="content-row">
      <main id="cwrap">
        <div id="cinner">
          <nav id="bc" class="bc" aria-label="Breadcrumb"></nav>
          <div id="edittop" class="edit-top"></div>
          <img id="page-banner" class="page-banner" src="" alt="" style="display:none">
          <h1 id="ptitle" class="ptitle" tabindex="-1"></h1>
          <p id="psubtitle" class="psubtitle" style="display:none"></p>
          <div id="pmeta" class="pmeta"></div>
          <div id="main"></div>
          <div id="prose" class="prose"></div>
          <div id="pagefoot">
            <div id="editwrap"></div>
            <div id="pn" class="pn"></div>
          </div>
        </div>
      </main>
      <nav id="toc" aria-label="On this page"><div class="toc-hdr">On this page</div><div id="toclist"></div></nav>
    </div>
  </div>
</div>
${footerHtml(config)}
</div>

<div id="smodal" role="dialog" aria-modal="true" aria-label="Search">
  <div class="sbox">
    <input id="sinput" type="search" placeholder="Search documentation…" autocomplete="off"
      role="combobox" aria-expanded="true" aria-controls="sresults" aria-activedescendant=""/>
    <div class="sresults" id="sresults" role="listbox" aria-label="Search results"></div>
    <div id="scount" class="visually-hidden" role="status" aria-live="polite"></div>
    <div class="shint"><span><kbd>↑↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
  </div>
</div>

<div id="lightbox" role="dialog" aria-modal="true" aria-label="Image preview"><img id="lightbox-img" src="" alt=""></div>
<button id="btt" class="btt" aria-label="Back to top" title="Back to top">
  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>
</button>

<noscript><style>#cwrap{display:none}</style><p style="padding:2rem;font-family:sans-serif">This documentation site requires JavaScript.</p></noscript>
<script src="${b}/assets/app.js${v}"></script>
</body>
</html>`;
}

/** Minimal standalone page for server-level errors (404 on non-app routes). */
function renderErrorPage(status, message, assetsVer) {
  const v = assetsVer ? `?v=${encodeURIComponent(assetsVer)}` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${status}, ${escHtml(message)}</title>
<script>(function(){var t;try{t=localStorage.getItem('docs:theme')||localStorage.getItem('t')}catch(e){}
if(t!=='light'&&t!=='dark'){t=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
document.documentElement.classList.toggle('dark',t==='dark')})();</script>
<link rel="stylesheet" href="/assets/app.css${v}"/></head>
<body><div class="err-page"><div class="err-code">${status}</div><p class="err-msg">${escHtml(message)}</p><a class="err-home" href="/">Go to documentation</a></div></body>
</html>`;
}

/** Generated letter favicon (used when the site ships no static/favicon.*). */
function renderFavicon(config) {
  const letter = ((config.title || 'D').trim().charAt(0) || 'D').toUpperCase();
  const bg = (config.theme && config.theme.primary) || '#2563eb';
  const fg = readableOn(bg);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${escAttr(bg)}"/><text x="32" y="43" font-family="-apple-system,'Segoe UI',Roboto,sans-serif" font-size="34" font-weight="800" fill="${fg}" text-anchor="middle">${escHtml(letter)}</text></svg>`;
}

module.exports = { renderShell, renderErrorPage, renderFavicon, themeVars };
