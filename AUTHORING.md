# Authoring content

Everything a site renders comes from its `content/` folder. This is the reference
for the folder layout, page frontmatter, sidebar control, and the block directives
the engine understands. None of it requires editing the engine.

> **See it live.** The example site ships a **Component Showcase** that renders
> every feature below, each one shown as *the Markdown you write* next to the
> *live result*. It's the best way to see what each feature looks like:
>
> ```bash
> npm run example      # then open http://localhost:3001/docs/v1/authoring
> ```
>
> The showcase source is under `example-site/content/v1/authoring/`, a good
> template to copy from.

> **Tip:** the engine live-reloads, save a Markdown file and the open page,
> sidebar, and search index refresh in place.

## Folders, pages, and versions

```
content/
├── v1/                       ← a version (the folder name IS the version)
│   ├── index.md              ← the version landing page  (/docs/v1)
│   ├── _meta.json            ← optional: order + labels for this folder
│   ├── installation.md       ← /docs/v1/installation
│   └── guides/
│       ├── index.md          ← /docs/v1/guides
│       ├── _meta.json
│       └── customization.md  ← /docs/v1/guides/customization
└── v2/                       ← another version, shown in the header switcher
    └── index.md
```

- **Each sub-folder of `content/` is a version.** List them in `docs.config.json`
  under `versions`, and set `defaultVersion`.
- **The URL mirrors the folder path.** A file's route is its path under the version
  folder; `index.md` is the folder's own page.
- **The sidebar mirrors the folder tree**, ordered and labelled by `_meta.json`.

## Frontmatter

Optional YAML block at the very top of a `.md` file:

```markdown
---
title: "Getting Started"
description: "Install the package and run your first build."
banner: /static/hero.png
cover: /static/thumb.png
cover-position: center
tag: New
---

# Page body starts here
```

| Key | Effect |
|-----|--------|
| `title` | Page title (header + browser tab + sidebar fallback). Without it the filename is used. |
| `description` | Short summary under the title and in search. |
| `banner` | Full-width image rendered above the title. Use a `/static/…` path or any URL. |
| `cover` / `cover-position` | Cover image and its focal position. |
| `tag` | Small pill next to the title (e.g. `New`, `Beta`). |

## Sidebar control, `_meta.json`

Drop a `_meta.json` array in any content folder to set the order, labels, grouping,
and tags of its entries. Anything you omit falls back to alphabetical order and the
page's own title.

```json
[
  { "type": "separator", "title": "Overview" },
  { "slug": "index", "title": "Welcome" },

  { "type": "separator", "title": "Getting Started" },
  { "slug": "get-started", "title": "Get Started", "type": "folder", "defaultOpen": true },

  { "type": "separator", "title": "Documentation" },
  { "slug": "guides",  "title": "Guides",  "type": "folder", "tag": "New" },
  { "slug": "manuals", "title": "Manuals", "type": "folder", "tag": "Beta" }
]
```

| Field | Meaning |
|-------|---------|
| `slug` | The file or folder name (without `.md`). `index` is the folder's own page. |
| `title` | Label shown in the sidebar. |
| `type` | `"folder"` for an expandable section, or `"separator"` for a non-clickable heading. |
| `defaultOpen` | `true` to expand a folder by default. |
| `tag` | Small pill beside the sidebar entry. |

## Markdown

Standard GitHub-Flavored Markdown works: headings, lists (**nested by
indentation**), task lists (`- [ ]` / `- [x]`), tables (**column alignment**
via `:---`, `:---:`, `---:`), links, images, `inline code`, fenced code
blocks, blockquotes, `~~strikethrough~~`, and `<https://…>` autolinks.
Headings get ids, hover **anchor links**, and populate the "On this page"
table of contents. External links open in a new tab with an `↗` marker.

Two conveniences worth knowing:

- **Relative `.md` links become routes.** `[Setup](./setup.md)` on
  `/docs/v1/guides` links to `/docs/v1/guides/setup`, so links that work on
  GitHub work on the site.
- **Code fences protect everything.** Directive syntax, GitBook tags, and
  emoji shortcodes inside a fence render as written, you can document the
  engine's own syntax.

## Code blocks

````markdown
```js title="setup.js"
const answer = 42;
```
````

The language tag drives built-in syntax highlighting (JS/TS, Python, C#,
Java, C/C++, Go, Rust, JSON, YAML, TOML/INI, Bash, PowerShell, SQL, HTML/XML,
CSS, diff, Markdown, unknown languages render plain). `title="…"` adds a
filename header. Every block gets a copy button; use `diff` to mark
added/removed lines. Use `text` (or `raw`) for content that should not be
highlighted, logs, output, or plain data.

**Fences nest, so you can show fence source.** A fence may be opened with 3+
backticks *or* 3+ tildes (`~~~`), and it closes only on a line of the same
character that is at least as long. So a tilde fence, or a longer backtick
fence, can contain a normal ```` ``` ```` block verbatim:

`````markdown
~~~markdown
```js
console.log("this whole block is shown as source");
```
~~~
`````

That is exactly how the [Code Blocks showcase](/docs/v1/authoring/code) prints
the source next to each live example. Fences must begin a line, so stray
backticks in a sentence are never mistaken for one.

## Callouts

Three interchangeable syntaxes render the same coloured callout. Types are
`info`, `warning`, `danger`, `success` (aliases `note`→info, `tip`→success,
`caution`→warning, `error`→danger).

**Directive form** (supports an optional bold title):
```markdown
:::hint type="warning" title="Before you upgrade"
Back up your project before running the migration.
:::
```

**GitHub-alert form:**
```markdown
> [!INFO]
> This is an informational callout.
```

**GitBook form** (understood on import):
```markdown
{% hint style="success" %}
It worked.
{% endhint %}
```

## Cards

Material-style cards. Attributes: `bg`, `color`, `border`, `img`, `href`, `align`,
`padding`, `radius`, `shadow`, `maxwidth`.

```markdown
:::card bg="#f0f7ff" border="#93c5fd" href="/docs/v1/get-started"
## Quick Start
Run the server and open the browser.
:::
```

Lay cards side by side with a row:

```markdown
:::cardrow
:::card bg="#f0fdf4" border="#86efac"
### What works
- Markdown of all kinds
:::
:::card bg="#fef9ec" border="#fcd34d"
### Coming soon
- Live reload
:::
:::endrow
```

Related card variants: `:::filecard`, `:::navcards`, `:::refcards`, each wraps a
list of links into styled card grids.

## Layout grid

`:::grid … :::endgrid` arranges arbitrary content in columns/rows, the modern
"layout table" for organizing objects. Each cell holds any Markdown, including
other directives (cards, callouts, images, code). Cells are separated by a line
of `---`; use `***` for a horizontal rule *inside* a cell. See the live
[Layout grid demo](/docs/v1/authoring/cards-and-buttons).

```markdown
:::grid cols=3
### One
First cell.
---
:::card bg="#f0f7ff"
A card in the second cell.
:::
---
![img](/static/pic.svg){rounded}
:::endgrid
```

| Attribute | Effect |
|-----------|--------|
| `cols` | Fixed column count (1–9). Wraps to one column on mobile. Omit for an auto-fitting grid. |
| `gap` | Space between cells, e.g. `gap=24px`. |
| `align` | Vertical alignment of cells: `start` (default), `center`, `end`, `stretch`. |

## Buttons

Inline buttons anywhere in prose with `[Label]{.btn …}`. Attributes: `bg`, `color`,
`href`, `border`, `size` (`sm`/`lg`), `bgimg`.

```markdown
[Get Started]{.btn bg="#2563eb" color="#fff" href="/docs/v1/get-started"}
[View on GitHub]{.btn bg="#24292f" color="#fff" border="true" href="https://github.com"}
```

A block of pill links:

```markdown
:::linkbuttons
[Discord](https://example.com/discord)
[Changelog](/docs/v1/changelog)
:::
```

## Tabs

```markdown
:::tabs
[Windows]
Instructions for Windows.
---
[macOS]
Instructions for macOS.
:::endtabs
```

The `=== Tab Name` shorthand and GitBook `{% tabs %}` blocks convert to the same
output. Tabs with the same label are **synced**: picking "Windows" in one block
switches every other block with a "Windows" tab, and the choice is remembered
across pages.

## Collapsible sections

```markdown
:::expand Show advanced options
These details are hidden until the reader expands them.
:::
```

## Video and embeds

```markdown
:::video https://www.youtube.com/watch?v=XXXXXXXXXXX
```

```markdown
:::embed https://example.com/some/page
```

YouTube watch/short URLs are normalised to embeds automatically.

## Page references

A rich internal link card:

```markdown
:::pageref href="/docs/v1/guides/customization"
Customization
:::
```

## Images

Images take an optional `{…}` attribute block and an optional `"caption"`.
See the live [Images showcase](/docs/v1/authoring/images) for previews.

```markdown
![alt](/static/pic.svg){width=320 align=center}          <!-- sizing + placement -->
![alt](/static/pic.svg){ratio=16:9 fit=cover}            <!-- clip/crop to a shape -->
![alt](/static/pic.svg){rounded shadow border}           <!-- styling flags -->
![alt](/static/pic.svg "Figure 1, the pipeline")        <!-- figure + caption -->
```

| Attribute | Effect |
|-----------|--------|
| `width` / `height` | Size (bare number → px). |
| `align` | `left` / `center` / `right`; `offset=x,y` for a fine nudge. |
| `ratio` | Fixed aspect box, e.g. `16:9` (crops via `fit`, default `cover`). |
| `fit` | `cover` (crop) or `contain` (letterbox) within the box. |
| `rounded` / `shadow` / `border` | Styling flags (or `rounded=16px`, `border=#888`). |
| `"caption"` | A quoted title after the URL wraps the image in a `<figure>`. |

**Galleries** lay images out in a responsive grid (default 3 columns):

```markdown
:::gallery cols=3
![One](/static/1.svg "First")
![Two](/static/2.svg "Second")
:::
```

**Banners and covers** are page frontmatter: `banner:` renders full-width above
the title, `cover:` (+ optional `cover-position:`) is edge-to-edge at the very
top. Readers can click any content image to zoom it in a lightbox.

## Badges, keys, steps & fields

See the live [Components showcase](/docs/v1/authoring/components) for previews.

```markdown
[Stable]{.badge type="success"}  [Beta]{.badge}  [v2]{.badge color="#7c3aed"}
```
Inline badges. Types: `neutral` (default), `info`, `success`, `warning`, `danger`.

```markdown
Press [[Ctrl+K]] to search, [[Esc]] to close.
```
Keyboard keys, combos join with `+`.

```markdown
:::steps
Do the first thing.
---
Then the second (each step is full Markdown, code included).
:::
```
A numbered, connected procedure; steps are separated by `---`.

```markdown
:::field name="title" type="string" required
The site name shown in the header.
:::
```
A parameter entry, `name`, `type`, `default`, and a bare `required` flag with a
Markdown description. Stack several for an API reference.

## Static assets

Put images and files in the site's `static/` folder, nested folders work, 
and reference them at `/static/<path>`. Ship a custom favicon by adding
`favicon.svg` (or `.ico`/`.png`) to `static/`.

## Theming

Accent colours come from `docs.config.json` → `theme` (`primary`,
`primaryDark`, `success`, `info`, `warning`, `danger`, `sidebar`,
`sidebarDark`). Every callout, link, and button accent derives from those
values, in both light and dark mode, you rarely need per-element colours.
`primaryDark` is optional and only needed when the light accent reads poorly
on the dark background.
