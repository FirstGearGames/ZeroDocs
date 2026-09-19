# ZeroDocs

**Free, MIT-licensed, feature-rich** documentation-site software. Point it at a
folder of Markdown, a JSON config, and a static-assets directory and it serves a
complete GitBook-style site: sidebar navigation, full-text section search,
dark/light mode, versioning, syntax highlighting, callouts, cards, tabs, badges,
steps, video embeds, live reload, and more.

**Host it online for free, with GitHub editing.** Keep your docs in a public
GitHub repo, connect it to Cloudflare Pages, and every merged pull request
redeploys the site automatically. Each page gets an "Edit this page on GitHub"
link, so anyone can propose a change without cloning anything. See
[Hosting on Cloudflare Pages](#hosting-on-cloudflare-pages-with-github-editing).

**Or run it entirely offline.** Because it has **zero dependencies** (Node.js
built-ins only, no `npm install`) and the pages make **zero external requests**
(no CDN scripts, no web fonts), the same software also runs as a local preview
server or builds a fully self-contained static site. It works on a plane.

**See it live:** [`example-site/`](example-site/) is the **Authoring Guide**, a
page-by-page tour of every feature with source and rendered output side by side.
It publishes to GitHub Pages on every push (see
[Live demo on GitHub Pages](#live-demo-on-github-pages)).

Docs are free. Use it for anything, no strings ([MIT](LICENSE)).

## The core idea: never touch the source

ZeroDocs is designed to be **shared, not copied**. You do not edit the software
to make a site. You keep your content in its own folder (or its own repo) and
point ZeroDocs at it. One copy can serve any number of sites.

A **site** is any folder shaped like this:

```
my-site/
├── content/            One sub-folder per version, v1, v2, …
│   └── v1/
│       ├── index.md
│       ├── _meta.json  (optional: controls sidebar order/labels)
│       └── guides/
│           ├── index.md
│           └── installation.md
├── docs.config.json    Title, theme, nav links, versions, GitHub edit links
└── static/             Images and assets served under /static/ (nested folders OK)
```

## Preview it locally

The engine resolves the **site root** in this order: the `DOCS_ROOT`
environment variable, the first command-line argument, then the current working
directory. So any of these serve `my-site/`:

```bash
DOCS_ROOT=/path/to/my-site node /path/to/zerodocs/preview-server.js
node /path/to/zerodocs/preview-server.js /path/to/my-site
cd /path/to/my-site && node /path/to/zerodocs/preview-server.js
```

Then open **http://localhost:3001/docs**. Edit a Markdown file and the page,
sidebar, and search refresh in place (live reload). Try the bundled demo, which
documents every feature:

```bash
node preview-server.js ./example-site      # or: npm run example
```

| Env var | Default | Meaning |
|---------|---------|---------|
| `PORT` | `3001` | Listen port. |
| `HOST` | `127.0.0.1` | Bind address. Set `0.0.0.0` to expose on your LAN (loopback-only by default, on purpose). |

## Build a static site

For hosting, render the whole site to a folder of plain files (one HTML page
per route, the JSON the client reads, assets, sitemap, redirects, no runtime):

```bash
DOCS_ROOT=/path/to/my-site node /path/to/zerodocs/build-static.js
node build-static.js ./example-site      # or: npm run build:example
```

The output (default `<site>/out`, override with `DOCS_OUT`) is a complete
static site. It includes Cloudflare `_headers` (a strict Content-Security-Policy
and security headers) and `_redirects` out of the box.

## Hosting on Cloudflare Pages (with GitHub editing)

This is the recommended setup: **content lives in its own public GitHub repo**,
ZeroDocs is pulled in at build time, and every merged pull request redeploys.
Contributors edit Markdown through GitHub; the software repo is never touched.

**1. Create a content repo** (public, so contributors can open PRs) containing
your `content/`, `docs.config.json`, `static/`, and this `package.json`:

```json
{
  "name": "my-docs",
  "private": true,
  "scripts": {
    "fetch-renderer": "degit YOUR-GH-USER/ZeroDocs .zerodocs --force",
    "build": "npm run fetch-renderer && node build.js",
    "dev": "npm run fetch-renderer && cross-env DOCS_ROOT=. node .zerodocs/preview-server.js"
  },
  "devDependencies": { "cross-env": "^7.0.3", "degit": "^2.8.4" }
}
```

with a tiny `build.js` that points the renderer at this repo:

```js
'use strict';
const path = require('path');
process.env.DOCS_ROOT = __dirname;
process.env.DOCS_OUT = path.join(__dirname, 'out');
require('./.zerodocs/build-static.js');
```

(Replace `YOUR-GH-USER/ZeroDocs` with wherever this software lives. To pin a
version, append `#<tag-or-commit>` to the degit path. If your ZeroDocs repo is
private, use a git clone with a read-only token instead of degit.)

**2. Connect the content repo in Cloudflare Pages** with:

- **Build command**: `npm run build`
- **Build output directory**: `out`
- **Framework preset**: None

Every merge to the content repo auto-rebuilds and redeploys.

**3. Turn on "Edit this page on GitHub"** by adding a `github` block to
`docs.config.json`, pointing at the **content** repo:

```json
{
  "title": "My Docs",
  "github": { "repo": "https://github.com/YOUR-GH-USER/my-docs", "branch": "main", "contentDir": "content" }
}
```

Each page then shows an edit link that opens the exact source file on GitHub, so
a contributor can propose a change without cloning anything.

> **Host on a separate origin.** A docs site that accepts public PRs is
> untrusted content. Never host it on a subdomain of a site that sets login
> cookies for its whole domain (e.g. `docs.example.com` when `example.com`
> shares auth cookies across subdomains), a bad edit would sit inside that
> site's auth blast radius. Use a `*.pages.dev` URL or a dedicated domain.

## Live demo on GitHub Pages

This repo publishes its own `example-site` (the Authoring Guide) to GitHub Pages
via [`.github/workflows/pages.yml`](.github/workflows/pages.yml), so the live
demo always reflects the latest engine. To do the same for any site:

- Build with `DOCS_BASE` set to the sub-path the site is served under. A GitHub
  Pages **project** site lives at `https://<user>.github.io/<repo>/`, so
  `DOCS_BASE=/<repo>` (the included workflow uses the repo name automatically).
  A user/organization site or a custom domain serves at the root, so leave
  `DOCS_BASE` unset. The static server and Cloudflare Pages also serve at the
  root; `DOCS_BASE` is only for a sub-path.
- One-time: repo **Settings > Pages > Source: GitHub Actions**. Pages is free
  once the repo is public.

The generator writes `.nojekyll` so Pages serves the output verbatim.

## Features

**Authoring**, GitHub-flavored Markdown; nested + task lists; tables with
alignment; fenced code with built-in highlighting (~20 languages, no CDN) and
titles; callouts (three syntaxes); tabs (synced and remembered); cards,
nav/ref/file cards, buttons, badges, steps, grids, keyboard keys, field tables;
video embeds (YouTube/Vimeo); page references; collapsible sections; GitBook
`{% %}` syntax accepted on import; relative `*.md` links rewritten to routes.

**Reading**, full-text **section-level** search (`Ctrl K` / `⌘K` / `/`);
dark/light mode (follows the OS); heading anchors; scroll-spy table of contents;
breadcrumbs; previous/next; last-updated + reading time; image lightbox;
back-to-top; styled 404; keyboard accessible throughout; print stylesheet.

**Publishing**, per-page `<title>`/description/OpenGraph rendered server-side;
`sitemap.xml` + `robots.txt`; `/llms.txt` and `/llms-full.txt`; "Copy page as
Markdown"; configurable redirects.

## Security

ZeroDocs treats all content as untrusted, so a hostile pull request cannot run
script, break styling, or reach a dangerous URL, even if it is merged. The
guarantees and the sanity gate (`npm test`, a pre-commit hook, and CI) are
documented in [SECURITY.md](SECURITY.md).

## What's in this repo

| Path | Purpose |
|------|---------|
| `preview-server.js` | Live authoring server, resolves the site root and serves it. |
| `build-static.js` | Static-site generator (Cloudflare Pages, any static host). |
| `lib/` | The engine: site, markdown, directives, gitbook compat, highlight, content, navigation, search, shell, server, util. |
| `assets/app.css` / `assets/app.js` | The client (served with ETags; live and static modes). |
| `test/security-test.js` | The security regression suite (`npm test`). |
| `scripts/content-scan.js` | Advisory content tripwire for reviewers. |
| `docs.config.example.json` | Annotated config template for a new site. |
| `AUTHORING.md` | Content reference, every frontmatter key and directive. |
| `example-site/` | Runnable, self-documenting demo site. |

## Configuration reference

`docs.config.json` (every key optional):

| Key | Meaning |
|-----|---------|
| `title` | Site name, header, tab titles, generated favicon letter. |
| `description` | Meta description + OpenGraph fallback. |
| `logo` | Header logo image URL. Falls back to a letter tile. |
| `versions` | Preferred display order of version folders. |
| `defaultVersion` | The version `/` redirects to. |
| `github.repo` / `.branch` / `.contentDir` | Build "Edit this page" links. Omit to hide them. |
| `nav` | Header links: `[{ "label": "…", "href": "…" }]`. |
| `announcement` | Site-wide bar. String, or `{ "text", "href", "dismissible" }`. |
| `footer` | Footer. String, or `{ "text", "links": [{ "label", "href" }] }`. |
| `redirects` | `{ "/docs/v1/old": "/docs/v1/new" }`, served as 301s (same-origin only). |
| `theme` | Colors: `primary`, `primaryDark`, `success`, `info`, `warning`, `danger`, `sidebar`, `sidebarDark`. |

A site ships its own favicon by putting `favicon.svg`/`.ico`/`.png` in
`static/`; otherwise a letter tile is generated from the title.

## License

[MIT](LICENSE) © FirstGearGames. Documentation software should be free.
