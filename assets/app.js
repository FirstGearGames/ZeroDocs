/**
 * ZeroDocs, client application.
 *
 * A small SPA: the shell ships empty scaffolding and this script fills it
 * from the JSON API (/api/nav, /api/doc, /api/search), handling routing,
 * theme, sidebar state, search, tabs, lightbox, and live reload. No
 * frameworks, no external requests, everything renders from same-origin
 * data, and every content-derived string is escaped before it touches
 * innerHTML.
 */
(() => {
'use strict';

const BOOT = window.__DOCS__ || { config: {}, versions: ['v1'] };
const CONFIG = BOOT.config || {};
/**
 * In a static export (Cloudflare Pages etc.) there is no live server, so the
 * data lives in pre-rendered JSON files under /data/ instead of /api/. Every
 * fetch goes through these builders so the same client serves both modes.
 */
const STATIC = !!BOOT.staticMode;
// When the site is served under a sub-path (e.g. '/ZeroDocs' on a GitHub Pages
// project site), every root-relative URL is prefixed with it. Internal logic
// stays base-less; base is added only at the boundaries (fetch URLs, anchor
// hrefs, history) and stripped when reading the location back.
const BASE = (BOOT.basePath || '').replace(/\/$/, '');
const withBase = u => (typeof u === 'string' && u[0] === '/' && u[1] !== '/' && u !== BASE && !(BASE && u.startsWith(BASE + '/'))) ? BASE + u : u;
const stripBase = p => (BASE && (p === BASE || p.startsWith(BASE + '/'))) ? (p.slice(BASE.length) || '/') : p;
const api = {
  nav: v => withBase(STATIC ? `/data/${v}/nav.json` : `/api/nav?version=${encodeURIComponent(v)}`),
  doc: (v, slug) => withBase(STATIC ? `/data/${v}/doc/${slug || 'index'}.json` : `/api/doc?version=${encodeURIComponent(v)}&slug=${encodeURIComponent(slug)}`),
  search: v => withBase(STATIC ? `/data/${v}/search.json` : `/api/search?version=${encodeURIComponent(v)}`),
  raw: (v, slug) => withBase(STATIC ? `/data/${v}/raw/${slug || 'index'}.md` : `/api/raw?version=${encodeURIComponent(v)}&slug=${encodeURIComponent(slug)}`),
};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Neutralize a dangerous URL scheme (server also does this; belt and braces). */
const safeHref = h => {
  const c = String(h ?? '').replace(/[\x00-\x1f\x7f-\x9f]+/g, '').trim();
  return /^(?:javascript|vbscript|data):/i.test(c) ? '#' : c;
};

/** localStorage that never throws (private mode, blocked storage). */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* unavailable */ } },
};

/* ── State ────────────────────────────────────────────────────────────────── */
let ver = BOOT.versions[0] || 'v1';
let curSlug = '';
let navTree = [];
let flatNav = [];
let searchIdx = [];
let searchSel = -1;
let tocCleanup = null;
let lastFocus = null;
const navOpen = (() => { try { return JSON.parse(store.get('docs:navopen') || '{}'); } catch { return {}; } })();

async function fetchJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
  return r.json();
}

/* ── Theme ────────────────────────────────────────────────────────────────── */
function syncThemeIcons() {
  const dark = document.documentElement.classList.contains('dark');
  $('moon').style.display = dark ? 'none' : '';
  $('sun').style.display = dark ? '' : 'none';
}
$('theme-toggle').addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  store.set('docs:theme', dark ? 'dark' : 'light');
  syncThemeIcons();
});
syncThemeIcons();

/* ── Announcement bar (dismiss, remembered per message) ─────────────────────── */
(() => {
  const el = $('announce');
  if (!el) return;
  const key = 'docs:announce:' + (el.getAttribute('data-key') || '');
  if (store.get(key) === '1') { el.remove(); return; }
  const btn = $('announce-close');
  if (btn) btn.addEventListener('click', () => { el.remove(); store.set(key, '1'); });
})();

/* Platform-appropriate shortcut label. */
$('search-kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

/* ── Router ───────────────────────────────────────────────────────────────── */
function parseDocsPath(href) {
  href = stripBase(href);
  const m = href.match(/^\/docs\/([^/#?]+)((?:\/[^#?]*)?)(#.*)?$/);
  if (!m) return null;
  return { version: m[1], slug: m[2] ? m[2].replace(/^\//, '').replace(/\/$/, '') : '', hash: m[3] ? m[3].slice(1) : '' };
}

function nav(href, push = true) {
  const target = parseDocsPath(href);
  if (!target) { location.href = href; return; }
  if (push) history.pushState({}, '', withBase(href));
  const versionChanged = target.version !== ver;
  ver = target.version;
  $('versel').value = ver;
  if (versionChanged) { loadNav(ver); loadSearch(ver); }
  loadPage(ver, target.slug, { hash: target.hash });
}

window.addEventListener('popstate', () => nav(location.pathname + location.hash, false));

document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const href = a.getAttribute('href');
  if (!href || !stripBase(href).startsWith('/docs/')) return;   // everything else: native navigation
  e.preventDefault();
  closeDrawer();
  nav(href);
});

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
function loadNav(v) {
  return fetchJson(api.nav(v))
    .then(tree => {
      navTree = tree;
      flatNav = flattenNav(tree);
      renderNav(navTree, $('navtree'), stripBase(location.pathname));
    })
    .catch(() => { $('navtree').innerHTML = '<div class="sep">Navigation unavailable</div>'; });
}

function flattenNav(items) {
  return items.flatMap(it => {
    if (it.type === 'separator') return [];
    return [...(it.href && !it.external ? [it] : []), ...(it.children ? flattenNav(it.children) : [])];
  });
}

function renderNav(items, container, curPath) {
  container.innerHTML = '';
  items.forEach(item => {
    if (item.type === 'separator') {
      const d = document.createElement('div');
      d.className = 'sep';
      d.textContent = item.title;
      container.appendChild(d);
      return;
    }
    const tagHtml = item.tag ? `<span class="tag tag-${esc(item.tag)}">${esc(item.tag)}</span>` : '';
    const isActive = curPath === item.href;

    if (item.children && item.children.length) {
      const saved = navOpen[item.href || ''];
      const isOpen = saved !== undefined ? saved === 1 : (item.defaultOpen || curPath.startsWith(item.href || '\0'));

      const row = document.createElement('div');
      row.className = 'ni-row';
      const a = document.createElement('a');
      a.href = withBase(safeHref(item.href || '#'));
      a.className = 'ni' + (isActive ? ' active' : '');
      if (isActive) a.setAttribute('aria-current', 'page');
      a.innerHTML = `<span class="ni-label">${esc(item.title)}</span>${tagHtml}`;
      const chev = document.createElement('button');
      chev.className = 'chev' + (isOpen ? ' open' : '');
      chev.setAttribute('aria-expanded', String(isOpen));
      chev.setAttribute('aria-label', `Toggle ${item.title} section`);
      chev.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
      row.append(chev, a);

      const nc = document.createElement('div');
      nc.className = 'nc' + (isOpen ? ' open' : '');
      const inner = document.createElement('div');
      nc.appendChild(inner);
      renderNav(item.children, inner, curPath);

      const setOpen = open => {
        nc.classList.toggle('open', open);
        chev.classList.toggle('open', open);
        chev.setAttribute('aria-expanded', String(open));
        navOpen[item.href || ''] = open ? 1 : 0;
        store.set('docs:navopen', JSON.stringify(navOpen));
      };
      chev.addEventListener('click', e => { e.preventDefault(); setOpen(!nc.classList.contains('open')); });
      a.addEventListener('click', () => { if (!nc.classList.contains('open')) setOpen(true); });

      container.appendChild(row);
      container.appendChild(nc);
    } else {
      const a = document.createElement('a');
      a.href = withBase(safeHref(item.href || '#'));
      if (item.external) { a.target = '_blank'; a.rel = 'noopener'; }
      a.className = 'ni' + (isActive ? ' active' : '');
      if (isActive) a.setAttribute('aria-current', 'page');
      a.innerHTML = `<span class="ni-label">${esc(item.title)}</span>${tagHtml}${item.external ? '<span class="ni-ext">↗</span>' : ''}`;
      container.appendChild(a);
    }
  });
}

function updateNavActive(curPath) {
  document.querySelectorAll('#navtree .ni').forEach(el => {
    const active = stripBase(el.getAttribute('href')) === curPath;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
}

/* ── Mobile drawer ────────────────────────────────────────────────────────── */
function toggleDrawer(force) {
  const open = $('sidebar').classList.toggle('open', force);
  $('sovl').classList.toggle('open', open);
  $('hbg').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('drawer-open', open);
}
const closeDrawer = () => toggleDrawer(false);
$('hbg').addEventListener('click', () => toggleDrawer());
$('sovl').addEventListener('click', closeDrawer);

/* ── Page rendering ───────────────────────────────────────────────────────── */
async function loadPage(v, slug, opts = {}) {
  curSlug = slug;
  if (!opts.silent) {
    $('ptitle').innerHTML = '<div class="sk" style="width:55%;height:1.7rem"></div>';
    $('prose').innerHTML = '<div class="sk" style="height:1rem;margin-bottom:10px"></div><div class="sk" style="height:1rem;width:85%;margin-bottom:10px"></div><div class="sk" style="height:5rem;margin-bottom:10px"></div>';
  }
  try {
    const d = await fetchJson(api.doc(v, slug));
    renderPage(d, v, slug, opts);
  } catch (err) {
    renderNotFound(v, slug, err.status !== 404);
  }
}

function renderPage(d, v, slug, opts = {}) {
  const siteTitle = CONFIG.title || 'Docs';
  document.title = `${d.title} | ${siteTitle}`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', d.description || CONFIG.description || '');

  $('ptitle').innerHTML = esc(d.title) + (d.tag ? `<span class="tag tag-${esc(d.tag)}">${esc(d.tag)}</span>` : '');
  const sub = $('psubtitle');
  sub.textContent = d.description || '';
  sub.style.display = d.description ? '' : 'none';

  /* meta row: last updated + reading time */
  const metaBits = [];
  if (d.lastUpdated) {
    const date = new Date(d.lastUpdated);
    if (!isNaN(date)) metaBits.push(`Last updated ${date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`);
  }
  if (d.readingTimeMinutes) metaBits.push(`${d.readingTimeMinutes} min read`);
  $('pmeta').innerHTML = metaBits.map(b => `<span>${esc(b)}</span>`).join('<span aria-hidden="true">·</span>');

  /* cover + banner */
  const cover = $('page-cover');
  if (d.cover) {
    $('page-cover-img').src = withBase(safeHref(d.cover));
    $('page-cover-img').style.objectPosition = d.coverPosition || 'center center';
    cover.style.display = 'block';
  } else cover.style.display = 'none';
  const banner = $('page-banner');
  banner.style.display = d.banner ? 'block' : 'none';
  if (d.banner) banner.src = withBase(safeHref(d.banner));

  /* breadcrumb */
  const parts = slug ? slug.split('/') : [];
  const titles = {};
  flatNav.forEach(n => { titles[n.href] = n.title; });
  let acc = `/docs/${v}`;
  let bcHtml = `<a href="${esc(withBase(`/docs/${v}`))}">Docs</a>`;
  parts.forEach((p, i) => {
    acc += `/${p}`;
    const label = i < parts.length - 1
      ? (titles[acc] || p.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' '))
      : d.title;
    bcHtml += '<span aria-hidden="true"> / </span>' + (i < parts.length - 1 ? `<a href="${esc(withBase(acc))}">${esc(label)}</a>` : `<span aria-current="page">${esc(label)}</span>`);
  });
  $('bc').innerHTML = bcHtml;

  /* content */
  const prose = $('prose');
  prose.innerHTML = d.html;
  if (BASE) {
    // Doc HTML is rendered root-relative; prefix in-page internal links and
    // images with the base path when the site is served under a sub-path.
    prose.querySelectorAll('a[href^="/"], img[src^="/"], source[src^="/"]').forEach(el => {
      const attr = el.tagName === 'A' ? 'href' : 'src';
      const val = el.getAttribute(attr);
      if (val && val[1] !== '/' && !val.startsWith(BASE + '/')) el.setAttribute(attr, BASE + val);
    });
  }
  enhanceCodeBlocks(prose);
  applySavedTabs(prose);
  buildToc(prose);

  /* edit link (top, under the breadcrumb) + copy page (bottom) */
  $('edittop').innerHTML = d.editUrl
    ? `<a class="edit-link" href="${esc(safeHref(d.editUrl))}" target="_blank" rel="noopener">
      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
      Edit this page on GitHub</a>`
    : '';
  $('editwrap').innerHTML = `<div class="edit-row"><button class="copy-page" id="copy-page" type="button">
    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
    Copy page as Markdown</button>${d.lastUpdated
    ? `<span class="last-updated">Last updated ${esc(new Date(d.lastUpdated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}</span>`
    : ''}</div>`;
  $('copy-page').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const original = btn.innerHTML;
    try {
      const r = await fetch(api.raw(v, slug));
      copyText(await r.text());
      btn.textContent = '✓ Copied';
    } catch { btn.textContent = 'Copy failed'; }
    setTimeout(() => { btn.innerHTML = original; }, 1800);
  });

  /* prev/next */
  const cur = `/docs/${v}${slug ? `/${slug}` : ''}`;
  const idx = flatNav.findIndex(n => n.href === cur);
  let pnHtml = '';
  if (idx > 0) {
    const p = flatNav[idx - 1];
    pnHtml += `<a class="pn-btn" href="${esc(withBase(p.href))}"><div class="pn-lbl">← Previous</div><div class="pn-ttl">${esc(p.title)}</div></a>`;
  }
  if (idx >= 0 && idx < flatNav.length - 1) {
    const n = flatNav[idx + 1];
    pnHtml += `<a class="pn-btn r" href="${esc(withBase(n.href))}"><div class="pn-lbl">Next →</div><div class="pn-ttl">${esc(n.title)}</div></a>`;
  }
  $('pn').innerHTML = pnHtml;

  updateNavActive(cur);

  /* scroll + focus */
  if (opts.keepScroll || opts.silent) return;
  if (opts.hash) {
    const el = document.getElementById(opts.hash);
    if (el) {
      requestAnimationFrame(() => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72 }));
    }
  } else {
    window.scrollTo(0, 0);
  }
  $('ptitle').focus({ preventScroll: true });
}

function renderNotFound(v, slug, isError) {
  document.title = `Page not found | ${CONFIG.title || 'Docs'}`;
  $('ptitle').textContent = '';
  $('psubtitle').style.display = 'none';
  $('pmeta').innerHTML = '';
  $('page-cover').style.display = 'none';
  $('page-banner').style.display = 'none';
  $('bc').innerHTML = '';
  $('editwrap').innerHTML = '';
  $('pn').innerHTML = '';
  $('toclist').innerHTML = '';
  $('toc').style.display = 'none';
  $('prose').innerHTML = `<div class="nf">
    <div class="nf-code">${isError ? '!' : '404'}</div>
    <div class="nf-title">${isError ? 'Something went wrong' : 'Page not found'}</div>
    <p class="nf-text">${isError ? 'The server could not render this page.' : `No page exists at <code>${esc(`/docs/${v}${slug ? `/${slug}` : ''}`)}</code>.`}</p>
    <div class="nf-actions">
      <button type="button" id="nf-search">Search the docs</button>
      <a href="${esc(withBase(`/docs/${v}`))}">Go to ${esc(v)} home</a>
    </div>
  </div>`;
  const searchBtn = $('nf-search');
  if (searchBtn) searchBtn.addEventListener('click', openSearch);
  updateNavActive('');
}

/* ── Code block enhancement ──────────────────────────────────────────────── */
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  } else legacyCopy(text);
}
function legacyCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* no clipboard at all */ }
  ta.remove();
}

function enhanceCodeBlocks(root) {
  root.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;
    const lang = pre.getAttribute('data-lang');
    const title = pre.getAttribute('data-title');
    if (lang || title) {
      const head = document.createElement('div');
      head.className = 'code-head';
      head.innerHTML = (title ? `<span class="code-title">${esc(title)}</span>` : '') + (lang ? `<span>${esc(lang)}</span>` : '');
      pre.appendChild(head);
    }
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code to clipboard');
    btn.addEventListener('click', () => {
      copyText(code.innerText || code.textContent);
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
    pre.appendChild(btn);
  });
}

/* ── Table of contents + scroll spy ──────────────────────────────────────── */
/** Plain-text label for the table of contents: no anchor, no emoji/pictographs. */
function headingText(h) {
  const clone = h.cloneNode(true);
  clone.querySelectorAll('.hanchor').forEach(a => a.remove());
  return clone.textContent
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildToc(prose) {
  if (tocCleanup) { tocCleanup(); tocCleanup = null; }
  const heads = [...prose.querySelectorAll('h2, h3')];
  const list = $('toclist');
  list.innerHTML = heads.map(h =>
    `<a class="toc-a ${h.tagName === 'H2' ? 'toc-h2' : 'toc-h3'}" href="#${esc(h.id)}">${esc(headingText(h))}</a>`).join('');
  $('toc').style.display = heads.length ? '' : 'none';

  list.querySelectorAll('.toc-a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const el = document.getElementById(a.getAttribute('href').slice(1));
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });

  /* Scroll spy: the heading nearest above the viewport line is active. */
  let ticking = false;
  const spy = () => {
    ticking = false;
    let active = null;
    for (const h of heads) {
      if (h.getBoundingClientRect().top <= 90) active = h;
      else break;
    }
    list.querySelectorAll('.toc-a').forEach(a => {
      a.classList.toggle('on', active !== null && a.getAttribute('href') === `#${active.id}`);
    });
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  spy();
  tocCleanup = () => window.removeEventListener('scroll', onScroll);
}

/* ── Search ───────────────────────────────────────────────────────────────── */
function loadSearch(v) {
  return fetchJson(api.search(v))
    .then(idx => { searchIdx = idx; })
    .catch(() => { searchIdx = []; });
}

/** Rank an entry against space-separated terms; 0 = no match (AND semantics). */
function scoreEntry(entry, terms) {
  let total = 0;
  const title = entry.title.toLowerCase();
  const section = (entry.section || '').toLowerCase();
  const description = (entry.description || '').toLowerCase();
  const content = entry.content.toLowerCase();
  for (const term of terms) {
    let s = 0;
    const t = title.indexOf(term);
    if (t === 0) s = 100;
    else if (t > 0) s = title[t - 1] === ' ' ? 80 : 55;
    const sec = section.indexOf(term);
    if (sec >= 0) s = Math.max(s, sec === 0 || section[sec - 1] === ' ' ? 70 : 45);
    if (description.includes(term)) s = Math.max(s, 40);
    if (content.includes(term)) s = Math.max(s, 25);
    if (!s) return 0;
    total += s;
  }
  return total + (entry.section ? 0 : 5);      // whole-page entries edge out sections on ties
}

/** Wrap matched terms in <mark> inside an escaped string. */
function highlightTerms(textEsc, terms) {
  let out = textEsc;
  for (const term of terms) {
    if (!term) continue;
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
  }
  return out;
}

function runSearch(query) {
  const box = $('sresults');
  searchSel = -1;
  $('sinput').setAttribute('aria-activedescendant', '');
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) { box.innerHTML = ''; $('scount').textContent = ''; return; }

  const results = searchIdx
    .map(e => ({ e, score: scoreEntry(e, terms) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  $('scount').textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;
  if (!results.length) { box.innerHTML = '<div class="sempty">No results found.</div>'; return; }

  box.innerHTML = results.map(({ e }, i) => {
    const label = highlightTerms(esc(e.title), terms)
      + (e.section ? `<span class="si-sec"> › ${highlightTerms(esc(e.section), terms)}</span>` : '');
    /* snippet: text around the first content match */
    let snippet = e.description || '';
    if (!snippet) {
      const pos = e.content.toLowerCase().indexOf(terms[0]);
      snippet = pos >= 0 ? (pos > 40 ? '…' : '') + e.content.slice(Math.max(0, pos - 40), pos + 90) : e.content.slice(0, 110);
    }
    return `<a class="sitem" id="sitem-${i}" role="option" aria-selected="false" href="${esc(withBase(e.href))}">
      <div class="si-title">${label}</div>
      <div class="si-desc">${highlightTerms(esc(snippet), terms)}</div>
    </a>`;
  }).join('');
  box.querySelectorAll('.sitem').forEach(a => a.addEventListener('click', closeSearch));
}

function openSearch() {
  lastFocus = document.activeElement;
  $('smodal').classList.add('open');
  searchSel = -1;
  setTimeout(() => $('sinput').focus(), 40);
}
function closeSearch() {
  $('smodal').classList.remove('open');
  $('sinput').value = '';
  $('sresults').innerHTML = '';
  $('scount').textContent = '';
  searchSel = -1;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

$('search-open').addEventListener('click', openSearch);
$('smodal').addEventListener('click', e => { if (e.target === $('smodal')) closeSearch(); });
$('sinput').addEventListener('input', e => runSearch(e.target.value));
$('sinput').addEventListener('keydown', e => {
  const items = document.querySelectorAll('.sitem');
  if (e.key === 'ArrowDown') { e.preventDefault(); searchSel = Math.min(searchSel + 1, items.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); searchSel = Math.max(searchSel - 1, 0); }
  else if (e.key === 'Enter' && searchSel >= 0) { items[searchSel]?.click(); return; }
  else if (e.key === 'Tab') { e.preventDefault(); return; }      // stay in the modal
  else return;
  items.forEach((it, i) => {
    it.classList.toggle('hi', i === searchSel);
    it.setAttribute('aria-selected', String(i === searchSel));
  });
  if (items[searchSel]) {
    items[searchSel].scrollIntoView({ block: 'nearest' });
    $('sinput').setAttribute('aria-activedescendant', items[searchSel].id);
  }
});

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); return; }
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); return; }
  if (e.key === 'Escape') { closeSearch(); closeLightbox(); }
});

/* ── Tabs (delegated, synced by label) ───────────────────────────────────── */
document.addEventListener('click', e => {
  const btn = e.target.closest('.gb-tab-btn');
  if (!btn) return;
  const label = btn.getAttribute('data-tab-label') || '';
  activateTab(btn);
  if (!label) return;
  store.set(`docs:tab:${label}`, '1');
  /* sync every other tab group that has a same-labeled button */
  document.querySelectorAll('.gb-tabs').forEach(group => {
    if (group === btn.closest('.gb-tabs')) return;
    const twin = [...group.querySelectorAll('.gb-tab-btn')].find(b => b.getAttribute('data-tab-label') === label);
    if (twin) activateTab(twin);
  });
});

function activateTab(btn) {
  const group = btn.closest('.gb-tabs');
  if (!group) return;
  const buttons = [...group.querySelectorAll(':scope > .gb-tabs-nav > .gb-tab-btn')];
  const panes = [...group.querySelectorAll(':scope > .gb-tabs-body > .gb-tab-pane')];
  const idx = Number(btn.getAttribute('data-tab-idx')) || buttons.indexOf(btn);
  buttons.forEach(b => b.classList.toggle('active', b === btn));
  panes.forEach((p, i) => p.classList.toggle('active', i === idx));
}

/** Re-apply remembered tab choices after a page renders. */
function applySavedTabs(root) {
  root.querySelectorAll('.gb-tabs').forEach(group => {
    const buttons = [...group.querySelectorAll('.gb-tab-btn')];
    const saved = buttons.find(b => store.get(`docs:tab:${b.getAttribute('data-tab-label')}`) === '1');
    if (saved && !saved.classList.contains('active')) activateTab(saved);
  });
}

/* ── Lightbox ────────────────────────────────────────────────────────────── */
document.addEventListener('click', e => {
  const img = e.target.closest('.prose img');
  if (!img || img.closest('a') || img.closest('.md-card')) return;
  $('lightbox-img').src = img.src;
  $('lightbox-img').alt = img.alt || '';
  $('lightbox').classList.add('open');
});
function closeLightbox() { $('lightbox').classList.remove('open'); }
$('lightbox').addEventListener('click', closeLightbox);

/* ── Back to top ─────────────────────────────────────────────────────────── */
window.addEventListener('scroll', () => {
  $('btt').classList.toggle('show', window.scrollY > 600);
}, { passive: true });
$('btt').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ── Version switcher (keeps the current page when it exists) ────────────── */
$('versel').addEventListener('change', async e => {
  const v = e.target.value;
  let target = `/docs/${v}`;
  if (curSlug) {
    try {
      const r = await fetch(api.doc(v, curSlug), { cache: 'no-store' });
      if (r.ok) target += `/${curSlug}`;
    } catch { /* fall back to the version root */ }
  }
  ver = v;
  await Promise.all([loadNav(v), loadSearch(v)]);
  nav(target);
});

/* ── Live reload (dev server only; a static export has no event stream) ───── */
if (!STATIC) try {
  const events = new EventSource('/api/events');
  events.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'hello') return;
    if (msg.type === 'config') { location.reload(); return; }
    Promise.all([loadNav(ver), loadSearch(ver)]).then(() => loadPage(ver, curSlug, { silent: true, keepScroll: true }));
  };
} catch { /* SSE unavailable, refresh manually */ }

/* ── Init ────────────────────────────────────────────────────────────────── */
(async () => {
  const target = parseDocsPath(location.pathname + location.hash) || { version: ver, slug: '', hash: '' };
  ver = BOOT.versions.includes(target.version) ? target.version : ver;
  $('versel').value = ver;
  await Promise.all([loadNav(ver), loadSearch(ver)]);
  loadPage(ver, target.slug, { hash: target.hash });
})();
})();
