---
title: "Cards & Buttons"
description: "Cards, card rows, nav/ref/file cards, buttons, and link buttons, with live previews."
---

# Cards & Buttons

Rich layout blocks for landing pages and navigation hubs.

## Basic card

```markdown
:::card bg="#f0f7ff" border="#93c5fd"
### Quick start
Point the engine at a site folder and run it, no build step.
:::
```

**Preview:**

:::card bg="#f0f7ff" border="#93c5fd"
### Quick start
Point the engine at a site folder and run it, no build step.
:::

## Clickable card with an image

`href` makes the whole card a link; `img` adds an image on top.

```markdown
:::card img="/static/sample-image.svg" border="true" href="/docs/v1/authoring/code"
### Code blocks
Highlighted, offline, with copy buttons. Click to open.
:::
```

**Preview:**

:::card img="/static/sample-image.svg" border="true" href="/docs/v1/authoring/code"
### Code blocks
Highlighted, offline, with copy buttons. Click to open.
:::

## Card row

Wrap cards in `:::cardrow … :::endrow` to lay them side by side; they wrap on
narrow screens.

```markdown
:::cardrow
:::card bg="#f0fdf4" border="#86efac"
### Fast
Renders on request, caches in memory.
:::
:::card bg="#fef9ec" border="#fcd34d"
### Offline
No CDN, no fonts, no network.
:::
:::endrow
```

**Preview:**

:::cardrow
:::card bg="#f0fdf4" border="#86efac"
### Fast
Renders on request, caches in memory.
:::
:::card bg="#fef9ec" border="#fcd34d"
### Offline
No CDN, no fonts, no network.
:::
:::endrow

## Layout grid

`:::grid … :::endgrid` arranges **any** content, think of it as a classic
layout table, or a row of `<div>`s. Each cell can hold whatever you like:
text, images, callouts, code, even cards. Cells are separated by a line of
`---`; set `cols=N` for fixed columns (it wraps to one column on mobile), or
omit `cols` for an auto-fitting grid. Optional `gap=` and `align=`.

> **Tip:** inside a cell, use `***` for a horizontal rule (`---` separates cells).

**Two columns of prose:**

```markdown
:::grid cols=2
### Server
Resolves the site root, renders Markdown, serves the API.
---
### Client
Routing, search, theme, and live reload, no framework.
:::endgrid
```

:::grid cols=2
### Server
Resolves the site root, renders Markdown, serves the API.
---
### Client
Routing, search, theme, and live reload, no framework.
:::endgrid

**Mixed content, an image beside a callout:**

```markdown
:::grid cols=2 align=center
![Diagram](/static/sample-image.svg){rounded}
---
:::hint type="info"
The left cell is an image; this cell is a callout. Any block works.
:::
:::endgrid
```

:::grid cols=2 align=center
![Diagram](/static/sample-image.svg){rounded}
---
:::hint type="info"
The left cell is an image; this cell is a callout. Any block works.
:::
:::endgrid

**A three-column feature grid of cards** (grid + cards together):

```markdown
:::grid cols=3
:::card bg="#f0f7ff" border="#93c5fd"
### 1. Write
Plain Markdown in `content/`.
:::
---
:::card bg="#f0fdf4" border="#86efac"
### 2. Preview
Live reload as you save.
:::
---
:::card bg="#fef9ec" border="#fcd34d"
### 3. Ship
Point the engine at the folder.
:::
:::endgrid
```

:::grid cols=3
:::card bg="#f0f7ff" border="#93c5fd"
### 1. Write
Plain Markdown in `content/`.
:::
---
:::card bg="#f0fdf4" border="#86efac"
### 2. Preview
Live reload as you save.
:::
---
:::card bg="#fef9ec" border="#fcd34d"
### 3. Ship
Point the engine at the folder.
:::
:::endgrid

## Nav cards

A compact two-column grid of links, good for "next steps".

```markdown
:::navcards
[Markdown Basics](/docs/v1/authoring/markdown-basics)
[Callouts](/docs/v1/authoring/callouts)
[Tabs & Media](/docs/v1/authoring/tabs-and-media)
[Navigation & Theming](/docs/v1/authoring/navigation-and-theming)
:::
```

**Preview:**

:::navcards
[Markdown Basics](/docs/v1/authoring/markdown-basics)
[Callouts](/docs/v1/authoring/callouts)
[Tabs & Media](/docs/v1/authoring/tabs-and-media)
[Navigation & Theming](/docs/v1/authoring/navigation-and-theming)
:::

## Ref cards

Icon + title + description cards. Each entry is `[icon|Title|/href]` followed by
a description line. Icons include `book-open`, `zap`, `server`, `globe`,
`file-text`, `layers`, `settings`, `users`, `link`, and `info`.

```markdown
:::refcards
[zap|Fast by default|/docs/v1]
In-memory caching with mtime-checked invalidation.
[globe|Works offline|/docs/v1]
Highlighting and search need no external services.
:::
```

**Preview:**

:::refcards
[zap|Fast by default|/docs/v1]
In-memory caching with mtime-checked invalidation.
[globe|Works offline|/docs/v1]
Highlighting and search need no external services.
:::

## File card

A download-style link with a file-type badge.

```markdown
:::filecard href="/static/sample-image.svg" ext="svg"
Sample image asset
:::
```

**Preview:**

:::filecard href="/static/sample-image.svg" ext="svg"
Sample image asset
:::

## Buttons

Inline buttons anywhere in prose: `[Label]{.btn bg="…" color="…" href="…"}`.
Optional `size="sm"` / `size="lg"` and `border="true"`.

```markdown
[Get started]{.btn bg="#2563eb" color="#fff" href="/docs/v1"}
[On GitHub]{.btn bg="#24292f" color="#fff" border="true" href="https://github.com"}
[Small]{.btn bg="#16a34a" color="#fff" size="sm"}
[Large]{.btn bg="#7c3aed" color="#fff" size="lg"}
```

**Preview:**

[Get started]{.btn bg="#2563eb" color="#fff" href="/docs/v1"}
[On GitHub]{.btn bg="#24292f" color="#fff" border="true" href="https://github.com"}
[Small]{.btn bg="#16a34a" color="#fff" size="sm"}
[Large]{.btn bg="#7c3aed" color="#fff" size="lg"}

## Link buttons

A row of bordered "pill" links, a lighter alternative to buttons.

```markdown
:::linkbuttons
[Discord](https://example.com/discord)
[Changelog](/docs/v1)
[API reference](/docs/v1/authoring/navigation-and-theming)
:::
```

**Preview:**

:::linkbuttons
[Discord](https://example.com/discord)
[Changelog](/docs/v1)
[API reference](/docs/v1/authoring/navigation-and-theming)
:::

Next: [Tabs & Media](./tabs-and-media.md).
