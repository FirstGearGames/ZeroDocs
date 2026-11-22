#!/usr/bin/env node
'use strict';
/**
 * Security regression suite, the sanity gate.
 *
 * Zero dependencies (Node built-ins only), so it runs anywhere the engine
 * does. It asserts the properties the security hardening guarantees: content
 * is untrusted, so nothing an author writes (page Markdown, docs.config.json,
 * _meta.json, frontmatter, raw HTML) can execute script, break out of a style
 * block, smuggle a full-viewport overlay, reach a dangerous URL scheme, or
 * spin the renderer. It also checks that ordinary Markdown still renders, so a
 * fix can never quietly gut a feature.
 *
 * Run:  node test/security-test.js   (or: npm test)
 * Exit: non-zero if any assertion fails, wire it into CI and a pre-commit hook.
 */

const path = require('path');
const LIB = path.join(__dirname, '..', 'lib');
const { mdToHtml } = require(LIB + '/markdown');
const { themeVars, renderShell } = require(LIB + '/shell');
const { scrubHtml, renderVideo } = require(LIB + '/directives');
const { safeUrl, safeColor, cssLen, escHtml } = require(LIB + '/util');
const { sanitizeVersion, sanitizeSlugParts } = require(LIB + '/content');
const { buildNav } = require(LIB + '/navigation');

let pass = 0;
const failures = [];
const ok = (name, cond) => { if (cond) pass++; else failures.push(name); };
const md = s => mdToHtml(s, { baseDir: '/docs/v1' });

// ── XSS: literal text is escaped in every inline() context ──────────────────
ok('paragraph script escaped', !md('x <script>alert(1)</script> y').includes('<script>'));
ok('heading html escaped', (h => h.includes('&lt;img') && !h.includes('<img'))(md('# T <img src=x onerror=alert(1)>')));
ok('list item escaped', !md('- <script>alert(1)</script>').includes('<script>'));
ok('ordered list escaped', !md('1. <img src=x onerror=alert(1)>').includes('<img'));
ok('table cell escaped', !md('| a |\n|---|\n| <script>x</script> |').includes('<script>'));
ok('blockquote escaped', !md('> <script>alert(1)</script>').includes('<script>'));
ok('link text escaped', !md('[<script>x</script>](/y)').includes('<script>'));
ok('image alt escaped', !md('![<script>x</script>](/y.png)').includes('<script>'));
ok('ampersand preserved as entity', md('A & B').includes('A &amp; B'));

// ── XSS: dangerous URL schemes ──────────────────────────────────────────────
ok('link javascript blocked', md('[x](javascript:alert(1))').includes('href="#"'));
ok('link vbscript blocked', md('[x](vbscript:msgbox(1))').includes('href="#"'));
ok('link data blocked', md('[x](data:text/html,<script>alert(1)</script>)').includes('href="#"'));
ok('safeUrl strips leading control char', safeUrl('\x01javascript:alert(1)') === '#');
ok('safeUrl strips tab in scheme', safeUrl('java\tscript:alert(1)') === '#');
ok('safeUrl strips newline in scheme', safeUrl('java\nscript:alert(1)') === '#');
ok('safeUrl keeps normal url', safeUrl('https://example.com/a?b=1&c=2') === 'https://example.com/a?b=1&c=2');
ok('button href blocked', md('[Go]{.btn href="javascript:alert(1)"}').includes('href="#"'));

// ── XSS: iframe embeds only for allowlisted providers ───────────────────────
ok('video javascript not iframed', !renderVideo('javascript:alert(1)').includes('<iframe'));
ok('video arbitrary http not iframed', !renderVideo('http://evil.example/x').includes('<iframe'));
ok('youtube embeds to known origin', renderVideo('https://youtu.be/dQw4w9WgXcQ').includes('https://www.youtube.com/embed/'));
ok('vimeo embeds to known origin', renderVideo('https://vimeo.com/12345').includes('https://player.vimeo.com/video/12345'));

// ── XSS: theme colors cannot break out of <style> ───────────────────────────
ok('themeVars no style breakout', (t => !t.includes('</style>') && !t.includes('<script>'))(themeVars({ primary: 'red}</style><script>alert(1)</script>' })));
ok('themeVars keeps valid hex', themeVars({ primary: '#abc123' }).includes('#abc123'));

// Dark-mode link legibility: a primary chosen for a white page must not be
// emitted verbatim as dark-mode link text (the #2563eb default is 3.6:1 on
// the dark background, below AA), but the accent FILL keeps the exact hue.
const darkBlock = t => t.slice(t.indexOf('html.dark'));
const darkVar = (t, name) => (new RegExp(`--${name}:([^;]+);`).exec(darkBlock(t)) || [])[1];
ok('dark link lightened off an unreadable light primary', (() => {
  const t = themeVars({ primary: '#2563eb' });
  return darkVar(t, 'link') !== '#2563eb' && darkVar(t, 'act-bg') === '#2563eb';
})());
ok('an already-legible primaryDark is left untouched', darkVar(themeVars({ primary: '#2563eb', primaryDark: '#7db8f7' }), 'link') === '#7db8f7');
ok('a non-hex color is passed through, never mangled to black', darkVar(themeVars({ primary: 'rebeccapurple' }), 'link') === 'rebeccapurple');
const shellWith = (config, favicon) => renderShell({ config, versions: ['v1'], page: null, assetsVer: '1', favicon });
ok('logoDark ships both logos, theme-classed', (h => h.includes('class="logo-img logo-img-light" src="/static/l.png"') && h.includes('class="logo-img logo-img-dark" src="/static/d.png"'))(
  shellWith({ logo: '/static/l.png', logoDark: '/static/d.png' })));
ok('logoDark url sanitized', shellWith({ logo: '/l.png', logoDark: 'javascript:alert(1)' }).includes('class="logo-img logo-img-dark" src="#"'));
ok('single logo unchanged', shellWith({ logo: '/l.png' }).includes('<img class="logo-img" src="/l.png"'));
ok('logoStyle applies to both theme logos', (shellWith({ logo: '/l.png', logoDark: '/d.png', logoStyle: { radius: 8 } }).match(/style="border-radius:8px;"/g) || []).length === 2);
ok('shipped png favicon linked as png', shellWith({}, 'favicon.png').includes('<link rel="icon" href="/favicon.png" type="image/png"/>'));
ok('generated favicon linked as svg', shellWith({}, null).includes('<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>'));
ok('shell escapes site title', !renderShell({ config: { title: '</title><script>alert(1)</script>' }, versions: ['v1'], page: null, assetsVer: '1' }).includes('<script>alert(1)</script>'));
ok('announcement inline links are escaped and scheme-checked', (h => !h.includes('<script>alert(1)</script>') && !h.includes('href="javascript:'))(
  renderShell({ config: { announcement: { text: '<script>alert(1)</script> [x](javascript:alert(1))' } }, versions: ['v1'], page: null, assetsVer: '1' })));

// ── XSS: raw HTML passthrough is scrubbed ───────────────────────────────────
ok('rawhtml script removed', !scrubHtml('<div><script>alert(1)</script>ok</div>').includes('<script'));
ok('rawhtml style element removed', !/<style/i.test(scrubHtml('<div><style>x{}</style></div>')));
ok('rawhtml iframe removed', !/<iframe/i.test(scrubHtml('<div><iframe src="x"></iframe></div>')));
ok('rawhtml onerror removed', !/onerror/i.test(scrubHtml('<div><img src=x onerror="alert(1)"></div>')));
ok('rawhtml js href neutralized', scrubHtml('<div><a href="javascript:alert(1)">x</a></div>').includes('href="#"'));
ok('rawhtml url()-style stripped', !/position\s*:\s*fixed/i.test(scrubHtml('<div style="background:url(x);position:fixed">y</div>')));
ok('rawhtml overlay position stripped', !/position/i.test(scrubHtml('<div style="position:fixed;inset:0;z-index:99999;background:#000">x</div>')));
ok('rawhtml benign style kept', /color:\s*red/i.test(scrubHtml('<div style="color:red;padding:8px">x</div>')));

// ── CSS injection: overlay/extra declarations rejected ──────────────────────
ok('card bg overlay blocked', !md(':::card bg="red;position:fixed;inset:0"\nhi\n:::').includes('position:fixed'));
ok('card padding injection blocked', !md(':::card padding="0;position:fixed"\nhi\n:::').includes('position:fixed'));
ok('image style overlay blocked', !md('![a](/x.png){width="9px;position:fixed;inset:0"}').includes('position:fixed'));
ok('badge type slug sanitized', !md('[x]{.badge type="a\\" onmouseover=\\"alert(1)"}').includes('onmouseover'));
ok('safeColor rejects injection', safeColor('red;position:fixed') === '');
ok('safeColor accepts valid', safeColor('#1a2b3c') === '#1a2b3c' && safeColor('rgba(1,2,3,.5)') === 'rgba(1,2,3,.5)');
ok('cssLen rejects injection', cssLen('100px;color:red') === '');
ok('cssLen accepts valid', cssLen('12') === '12px' && cssLen('50%') === '50%');

// ── DoS: bounded recursion + size ───────────────────────────────────────────
ok('deep nesting terminates', (() => { try { md('> '.repeat(400) + 'x'); return true; } catch { return false; } })());
ok('huge input terminates', (() => { const big = 'a '.repeat(400000); const t = Date.now(); md(big); return Date.now() - t < 5000; })());

// ── Path traversal defenses (verified-safe; guard against regressions) ──────
ok('version rejects traversal', sanitizeVersion('../etc') === null);
ok('version rejects dotdot', sanitizeVersion('v1/..') === null);
ok('slug rejects traversal', sanitizeSlugParts('../../etc/passwd') === null);
ok('slug rejects backslash', sanitizeSlugParts('a\\b') === null);
ok('slug rejects hidden', sanitizeSlugParts('.git/config') === null);
ok('slug accepts normal', JSON.stringify(sanitizeSlugParts('guides/install')) === JSON.stringify(['guides', 'install']));

// ── No regressions: ordinary Markdown renders ───────────────────────────────
ok('bold', md('**b**').includes('<strong>b</strong>'));
ok('italic', md('*i*').includes('<em>i</em>'));
ok('heading', md('## Hi').includes('<h2'));
ok('code span', md('`x`').includes('<code>x</code>'));
ok('external link', md('[D](https://example.com)').includes('href="https://example.com"'));
ok('relative md link rewritten', md('[i](./install.md)').includes('href="/docs/v1/install"'));
ok('table', md('| a | b |\n|---|---|\n| 1 | 2 |').includes('<table>'));
ok('image', md('![alt](/pic.png)').includes('<img'));
ok('kbd', md('[[Ctrl+K]]').includes('<kbd>Ctrl</kbd>'));
ok('valid card color kept', md(':::card bg="#eef"\nhi\n:::').includes('#eef'));
ok('valid button renders', md('[Go]{.btn href="/x"}').includes('class="md-btn"'));
ok('valid badge renders', md('[New]{.badge type="success"}').includes('md-badge-success'));
ok('code span inside link text', md('[`Foo`](https://x)').includes('<code>Foo</code></a>'));
ok('author NUL cannot forge a token', !md('a \x00H0\x00 b `c`').includes('<code>c</code> b'));

// ── Nested directives (hint in step/tab/details, tabs in step) ─────────────
const renders = s => { try { return md(s); } catch (e) { return 'THREW ' + e.message; } };
const callouts = h => (h.match(/<blockquote class="c/g) || []).length;
ok('hint inside steps', (h => callouts(h) === 1 && h.includes('md-steps') && !h.includes(':::'))(
  renders(':::steps\n## One\n:::hint type="warning"\nCareful\n:::\nafter\n---\n## Two\n:::\n')));
ok('tabs inside steps, hint inside tab', (h => callouts(h) === 1 && h.includes('md-tab-pane') && h.includes('b body') && !h.includes(':::'))(
  renders(':::steps\n## One\n:::tabs\n[A]\n:::hint\nin tab\n:::\n---\n[B]\nb body\n:::endtabs\n---\n## Two\n:::\n')));
ok('hint and embed inside expand', (h => callouts(h) === 1 && h.includes('youtube.com/embed') && h.includes('tail</p></div></details>'))(
  renders(':::expand More\n:::hint\nx\n:::\n:::embed https://youtu.be/dQw4w9WgXcQ\n:::\ntail\n:::\n')));
ok('card and expand inside expand', (h => (h.match(/<details/g) || []).length === 2 && h.includes('md-card') && h.includes('tail</p></div></details>'))(
  renders(':::expand Outer\n:::card\nc\n:::\n:::expand Inner\ni\n:::\ntail\n:::\n')));
ok('code fence inside nested hint', renders(':::steps\n:::hint\n```js\nlet a = 1;\n```\n:::\n:::\n').includes('<pre data-lang="js">'));
ok('cardrow still holds its cards', (h => (h.match(/class="md-card"/g) || []).length === 2)(
  renders(':::cardrow\n:::card\na\n:::\n:::card\nb\n:::\n:::endrow\n')));

// ── {% %} tags with extra attributes ────────────────────────────────────────
ok('{% %} tabs/tab/hint with extra attrs', (h => h.includes('md-tabs') && h.includes('data-tab-label="A"') && h.includes('class="cw"') && !h.includes('{%'))(
  renders('{% tabs fullWidth="false" %}\n{% tab title="A" extra %}\n{% hint style="warning" extra %}\nw\n{% endhint %}\n{% endtab %}\n{% endtabs %}\n')));
ok('{% %} embed with extra attrs', renders('{% embed url="https://youtu.be/dQw4w9WgXcQ" fullWidth="false" %}\n').includes('youtube.com/embed'));
ok('bare embed does not swallow up to a later endembed', (h => h.includes('text between') && (h.match(/md-embed-link/g) || []).length === 2)(
  renders('{% embed url="https://a.example" %}\n\ntext between\n\n{% embed url="https://b.example" %}\ncaption\n{% endembed %}\n')));

// ── buildNav sanitizes _meta hrefs (unit, with a temp site) ─────────────────
(() => {
  const fs = require('fs'), os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ztest-'));
  try {
    fs.mkdirSync(path.join(dir, 'content', 'v1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'content', 'v1', 'index.md'), '# Home\n');
    fs.writeFileSync(path.join(dir, 'content', 'v1', '_meta.json'),
      JSON.stringify([{ slug: 'evil', title: 'Evil', type: 'file', href: 'javascript:alert(1)' }]));
    const { createSite } = require(LIB + '/site');
    const tree = buildNav(createSite(dir), 'v1');
    const evil = tree.find(n => n.title === 'Evil');
    ok('nav _meta href sanitized', evil && evil.href === '#');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})();

// ── Search indexes each section of a CRLF (Windows checkout) page ───────────
(() => {
  const fs = require('fs'), os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ztest-'));
  try {
    fs.mkdirSync(path.join(dir, 'content', 'v1'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'content', 'v1', 'index.md'),
      '---\r\ntitle: Home\r\n---\r\n# Home\r\n\r\nIntro.\r\n\r\n## Deep section\r\n\r\nFar down the page.\r\n');
    const { createSite } = require(LIB + '/site');
    const { buildSearchIndex } = require(LIB + '/search');
    const entries = buildSearchIndex(createSite(dir), 'v1');
    ok('CRLF page indexes its sections', entries.some(e => e.section === 'Deep section' && e.href === '/docs/v1#deep-section' && e.content === 'Far down the page.'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})();

// ── Header links have a drawer copy for widths that hide the header's ───────
ok('header links copied into the mobile drawer', /<aside id="sidebar"><nav class="side-links" aria-label="Site links"><a href="\/static\/downloads\/latest\.pdf" target="_blank" rel="noopener">PDF<\/a><\/nav>/.test(
  renderShell({ config: { nav: [{ label: 'PDF', href: '/static/downloads/latest.pdf' }] }, versions: ['v1'], page: null, assetsVer: '1' })));

// ── A page rendered into the shell: escaped, and rebased under a sub-path ───
(() => {
  const evil = '</title></script><script>alert(1)</script>';
  const page = { title: evil, description: evil, version: 'v1', slug: 'x', html: '<p><a href="/docs/v1/y">y</a> <img src="/static/a.png"> <a href="//cdn.example/z">z</a> <a href="https://e.example/">e</a></p>' };
  const h = renderShell({ config: {}, versions: ['v1'], page, assetsVer: '1', basePath: '/sub' });
  ok('rendered page title and data cannot break out', !h.includes('<script>alert(1)</script>') && h.includes('id="page-data"'));
  ok('rendered page links rebased under the sub-path', h.includes('href="/sub/docs/v1/y"') && h.includes('src="/sub/static/a.png"')
    && h.includes('href="//cdn.example/z"') && h.includes('href="https://e.example/"'));
})();

// ── Member tables and code line marks ───────────────────────────────────────
(() => {
  const t = md('| Member | Meaning |\n|---|---|\n| `IsServer` | a |\n| plain | b |\n| `IsServer` | again |\n');
  ok('a row led by code gets its own anchor and link', t.includes('<tr id="isserver"><td><code>IsServer</code><a class="hanchor" href="#isserver"'));
  ok('a row led by text gets none; repeated names stay unique', t.includes('<tr><td>plain</td>') && t.includes('<tr id="isserver-2">'));
  const c = md('```cs {2}\nint a = 1; /* multi\nline */ int b = 2;\nGo(); // [!code ++]\nOld(); // [!code --]\n```\n');
  ok('code lines marked by spec and by trailing comments', (c.match(/<span class="ln[^"]*">/g) || []).join() === '<span class="ln">,<span class="ln ln-hl">,<span class="ln ln-ins">,<span class="ln ln-del">');
  ok('mark comments leave the rendered code', !c.includes('[!code'));
  ok('a token spanning lines is closed and reopened per line', c.includes('/* multi</span></span>\n<span class="ln ln-hl"><span class="tk-cmt">line */</span>'));
  ok('a Markdown fence keeps marks as written', md('~~~markdown\nGo(); // [!code ++]\n~~~\n').includes('[!code ++]'));
  ok('a line spec alone is not a language', !md('```{1}\nx\n```\n').includes('data-lang'));
  ok('plain code blocks are untouched', !md('```js\nlet a = 1;\n```\n').includes('class="ln'));
})();

// ── Page layouts ────────────────────────────────────────────────────────────
(() => {
  const page = layout => renderShell({ config: {}, versions: ['v1'], page: { title: 'T', version: 'v1', slug: '', html: '', layout }, assetsVer: '1' });
  ok('a page layout reaches the body', page('landing').includes('<body data-layout="landing">') && page('').includes('<body>'));
})();

// ── Link previews: canonical and image URLs made absolute by config.url ─────
(() => {
  const page = { title: 'T', version: 'v1', slug: 'a/b', html: '' };
  const shell = (config, p = page) => renderShell({ config, versions: ['v1'], page: p, assetsVer: '1' });
  const h = shell({ url: 'https://docs.example.com/sub/', image: '/static/og.png' });
  ok('canonical and og:url from config.url', h.includes('<link rel="canonical" href="https://docs.example.com/sub/docs/v1/a/b"/>') && h.includes('<meta property="og:url" content="https://docs.example.com/sub/docs/v1/a/b"/>'));
  ok('site share image made absolute', h.includes('<meta property="og:image" content="https://docs.example.com/sub/static/og.png"/>') && h.includes('content="summary_large_image"'));
  ok('page image overrides the site image', shell({ url: 'https://d.example', image: '/static/og.png' }, { ...page, image: '/static/page.png' }).includes('content="https://d.example/static/page.png"'));
  ok('no url, no canonical; no image, summary card', (s => !s.includes('rel="canonical"') && !s.includes('og:image') && s.includes('content="summary"'))(shell({})));
  ok('a url that is not plain http(s) is ignored', !shell({ url: 'javascript:alert(1)' }).includes('rel="canonical"') && !shell({ url: 'https://e.example/"><b>x' }).includes('rel="canonical"'));
})();

// ── Includes, variables and drafts (a temp site, read through the engine) ───
(() => {
  const fs = require('fs'), os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ztest-'));
  const root = path.join(dir, 'site');
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  try {
    fs.writeFileSync(path.join(dir, 'outside.txt'), 'OUTSIDE-SECRET');
    put('.git/config', 'token=GIT-SECRET');
    put('docs.config.json', JSON.stringify({ variables: { version: '1.2.3' } }));
    put('content/v1/index.md', '# Home\n\n:::include ./_shared/note.md\n\nVersion {{ version }} and {{unknown}}.\n\n'
      + ':::include /snippets/Spawner.cs#spawn title="Spawner.cs"\n\n```md\n:::include ./_shared/note.md\n```\n');
    put('content/v1/_shared/note.md', '---\ntitle: Shared\n---\nShared **note** {{version}}.\n');
    put('snippets/Spawner.cs', 'class A {\n    #region spawn\n    void Spawn() {\n        #region inner\n        Go();\n        #endregion\n    }\n    #endregion\n}\n');
    put('content/v1/wide.md', '---\nlayout: wide\n---\nx\n');
    put('content/v1/odd.md', '---\nlayout: "><script>\n---\nx\n');
    put('content/v1/draft.md', '---\ntitle: Secret draft\ndraft: true\n---\nDraft body.\n');
    put('content/v1/evil.md', ':::include ../../../outside.txt\n\n:::include /.git/config\n\n:::include ./evil.md\n\n:::include /snippets/Spawner.cs#missing\n');
    put('static/shot.png', 'png');
    put('static/shot.dark.png', 'png');
    put('static/plain.png', 'png');
    put('content/v1/images.md', '![Shot](/static/shot.png "Cap")\n\n:::card\n![Card shot](/static/shot.png)\n:::\n\n![Plain](/static/plain.png)\n');
    const { createSite } = require(LIB + '/site');
    const contentLib = require(LIB + '/content');
    const { buildSearchIndex } = require(LIB + '/search');
    const site = createSite(root);
    const text = html => html.replace(/<[^>]+>/g, '');

    const home = contentLib.buildDocPayload(site, site.loadConfig(), 'v1', '').html;
    ok('include inlines a Markdown file without its frontmatter', home.includes('Shared <strong>note</strong> 1.2.3.') && !home.includes('title: Shared'));
    ok('variables substitute, undefined names stay as written', home.includes('Version 1.2.3 and {{unknown}}.'));
    ok('include pulls a code region, dedented, markers dropped', text(home).includes('void Spawn() {\n    Go();\n}') && !home.includes('#region') && home.includes('data-title="Spawner.cs"'));
    ok('an include line inside a code fence stays literal', text(home).includes(':::include ./_shared/note.md'));
    ok('raw page carries the expanded text', contentLib.getRawPage(site, 'v1', '').includes('Shared **note** 1.2.3.'));

    const evil = contentLib.buildDocPayload(site, site.loadConfig(), 'v1', 'evil').html;
    ok('include outside the site folder refused', evil.includes('outside the site folder') && !evil.includes('OUTSIDE-SECRET'));
    ok('include of a dot-folder file refused', evil.includes('it is a hidden file') && !evil.includes('GIT-SECRET'));
    ok('self-include refused', evil.includes('it includes itself'));
    ok('missing region reported', evil.includes('it has no region &quot;missing&quot;'));

    ok('draft left out of a build', contentLib.buildDocPayload(site, site.loadConfig(), 'v1', 'draft') === null
      && !contentLib.listPages(site, 'v1').some(p => p.title === 'Secret draft')
      && !buildNav(site, 'v1').some(n => n.title === 'Secret draft')
      && !buildSearchIndex(site, 'v1').some(e => e.title === 'Secret draft'));
    const images = contentLib.buildDocPayload(site, site.loadConfig(), 'v1', 'images').html;
    ok('image with a .dark twin ships both, theme-classed', (images.match(/class="md-img img-light" src="\/static\/shot\.png"/g) || []).length === 2
      && (images.match(/class="md-img img-dark" src="\/static\/shot\.dark\.png"/g) || []).length === 2);
    ok('image without a twin renders alone', images.includes('<img class="md-img" src="/static/plain.png"') && !images.includes('plain.dark'));

    ok('frontmatter layout reaches the payload, only the known ones', contentLib.buildDocPayload(site, site.loadConfig(), 'v1', 'wide').layout === 'wide'
      && contentLib.buildDocPayload(site, site.loadConfig(), 'v1', 'odd').layout === '');

    // Broken links, read from every page's rendered HTML. The pages above are
    // all sound (include failures render as callouts, not links), so only
    // links.md's broken ones may be reported.
    put('docs.config.json', JSON.stringify({ variables: { version: '1.2.3' }, redirects: { '/docs/v1/old': '/docs/v1/images' } }));
    put('content/v1/links.md', [
      '# Links', '| Member | Meaning |', '|---|---|', '| `IsServer` | x |', '',
      '[ok](./images.md) [ok row](./links.md#isserver) [ok here](#links) [ok redirect](/docs/v1/old) ![ok](/static/plain.png)',
      '[gone](./nope.md) [bad anchor](./images.md#nope) [bad here](#nowhere) ![missing](/static/missing.png)',
      '```md', '[not a link](./in-code.md)', '```', '',
    ].join('\n'));
    const problems = contentLib.checkLinks(site, site.loadConfig()).filter(p => p.startsWith('/docs/v1/links:'));
    ok('every broken link is reported, and nothing else', JSON.stringify(problems.sort()) === JSON.stringify([
      '/docs/v1/links: image /static/missing.png is missing from static/',
      '/docs/v1/links: links to /docs/v1/images#nope, which has no such heading or row',
      '/docs/v1/links: links to /docs/v1/nope, which is not a page',
      '/docs/v1/links: no #nowhere on this page',
    ]));

    const preview = createSite(root, { drafts: true });
    ok('draft shown, tagged, on the preview server', (contentLib.buildDocPayload(preview, preview.loadConfig(), 'v1', 'draft') || {}).tag === 'Draft'
      && buildNav(preview, 'v1').some(n => n.title === 'Secret draft'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})();

const total = pass + failures.length;
console.log(`\n  Security suite: ${pass}/${total} passed`);
if (failures.length) {
  console.log('\n  FAILED:');
  for (const f of failures) console.log(`    ✖ ${f}`);
  console.log('');
  process.exit(1);
}
console.log('  ✓ all checks passed\n');
