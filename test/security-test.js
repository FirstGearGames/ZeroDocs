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
ok('safeUrl strips leading control char', safeUrl('javascript:alert(1)') === '#');
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
ok('shell escapes site title', !renderShell({ config: { title: '</title><script>alert(1)</script>' }, versions: ['v1'], page: null, assetsVer: '1' }).includes('<script>alert(1)</script>'));

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

const total = pass + failures.length;
console.log(`\n  Security suite: ${pass}/${total} passed`);
if (failures.length) {
  console.log('\n  FAILED:');
  for (const f of failures) console.log(`    ✖ ${f}`);
  console.log('');
  process.exit(1);
}
console.log('  ✓ all checks passed\n');
