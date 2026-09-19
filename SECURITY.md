# Security

ZeroDocs treats **all content as untrusted**. A documentation site built with
it typically accepts public pull requests, so every input an author controls, 
page Markdown, `docs.config.json`, `_meta.json`, frontmatter, and raw HTML
blocks, is sanitized at render time. A bad edit that slips through review
still cannot run script in a visitor's browser.

## What is enforced

- **No stored XSS.** Body text, headings, list items, table cells, link text
  and image alt are HTML-escaped. Only markup the engine itself generates is
  emitted unescaped.
- **Safe URLs.** `javascript:`, `vbscript:` and `data:` schemes (including
  control-character-obfuscated variants) are stripped from every author href, 
  links, buttons, cards, nav, `_meta.json` overrides, edit links, cover/banner.
- **No `<style>` breakout.** Theme colors are validated as CSS color tokens
  before they enter the inline `<style>` block.
- **Framed embeds are allowlisted.** Only normalized YouTube and Vimeo URLs
  become an `<iframe>`; any other URL renders as a plain link.
- **No CSS injection.** Card/button/badge/image style values are validated
  (color / length / keyword), so an author cannot smuggle a full-viewport
  overlay or extra declarations.
- **Raw HTML is scrubbed.** The raw-HTML passthrough removes
  script/style/iframe/object/embed/form/link/meta/base, inline event handlers,
  dangerous URL schemes, and `url()`/`expression()` styles.
- **Bounded rendering.** Nesting depth and per-unit input size are capped, so
  pathological Markdown cannot spin the renderer.
- **Path containment.** Version and slug parameters are sanitized; a request
  can never read outside the site's `content/` or `static/` folders.
- **Security headers.** The live server and the static `_headers` send a
  Content-Security-Policy (`script-src 'self'`, framed only to the video
  providers), `X-Frame-Options: DENY`, `nosniff`, and `Referrer-Policy`.

## The sanity gate

`test/security-test.js` is a zero-dependency regression suite covering every
item above plus a set of ordinary-Markdown cases (so a fix can't quietly break
a feature).

```bash
npm test                       # run the suite
git config core.hooksPath .githooks   # block commits that fail it
```

CI (`.github/workflows/ci.yml`) runs the suite, a static build, and the
advisory content tripwire (`scripts/content-scan.js`) on every push and PR.

## Reporting

Found something the suite misses? Open a private security advisory on the
GitHub repository rather than a public issue.
