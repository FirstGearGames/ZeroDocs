---
title: "Navigation & Theming"
description: "Sidebar control with _meta.json, versions, page metadata, colors, and static assets."
---

# Navigation & Theming

These live in JSON config and page frontmatter rather than in the body, so the
best "preview" is the site around you, the sidebar, version switcher, and
colors you see are produced by exactly these files.

## Sidebar, `_meta.json`

Drop a `_meta.json` array in any content folder to control the order, labels,
grouping, and tags of its entries. It's exhaustive: entries appear in this
order, and files it omits are hidden.

```json
[
  { "type": "separator", "title": "Getting Started" },
  { "slug": "index", "title": "Overview" },
  { "slug": "install", "title": "Installation", "tag": "New" },
  { "type": "separator", "title": "Reference" },
  { "slug": "api", "title": "API", "type": "folder", "defaultOpen": true },
  { "slug": "changelog", "title": "Changelog", "href": "/docs/v1/changelog" },
  { "label": "GitHub", "href": "https://github.com", "external": true }
]
```

| Field | Effect |
|-------|--------|
| `slug` | File/folder name without `.md`. `index` links to the folder itself. |
| `title` | Sidebar label. |
| `type` | `folder` (expandable) or `separator` (non-clickable heading). |
| `tag` | Pill beside the entry, `New`, `Beta`, `Experimental`, `Deprecated`. |
| `defaultOpen` | `true` to expand a folder by default. |
| `href` | Override the computed link. |
| `external` | Open in a new tab with an `↗` marker. |

**Preview:** the sidebar on the left of this page, including the **Authoring
Guide** section, its ordering, and the tags elsewhere in the tree, is rendered
from `_meta.json` files exactly like the one above.

## Tags

The four built-in tag styles, as they appear on sidebar entries and page titles:

:::linkbuttons
[New](#)
[Beta](#)
[Experimental](#)
[Deprecated](#)
:::

Set one with `"tag": "Beta"` in `_meta.json`, or `tag: Beta` in a page's
frontmatter (the **Live** pill on the [Overview](/docs/v1/authoring) page is a
frontmatter tag).

## Versions

Each sub-folder of `content/` is a version. List them in `docs.config.json`;
the header's version switcher and per-version sidebars follow.

```json
{
  "versions": ["v1", "v2"],
  "defaultVersion": "v1"
}
```

**Preview:** the version dropdown in the header, this demo ships `v1` and `v2`.

## Theming

Accent colors come from `docs.config.json`. Every link, callout, active nav
item, and button accent derives from them, in both light and dark mode.

```json
{
  "theme": {
    "primary": "#2563eb",
    "primaryDark": "#7db8f7",
    "success": "#22c55e",
    "info": "#3b82f6",
    "warning": "#f59e0b",
    "danger": "#ef4444",
    "sidebar": "#f3f4f6",
    "sidebarDark": "#1e2028"
  }
}
```

**Preview:** the blue links and active sidebar highlight on this site are
`theme.primary`; toggle the theme in the header and the accent switches to
`primaryDark`. The callout colors on the [Callouts](./callouts.md) page are
`info` / `success` / `warning` / `danger`.

## Header, logo, and favicon

```json
{
  "title": "My Docs",
  "logo": "/static/logo.svg",
  "nav": [
    { "label": "Guide", "href": "/docs/v1/authoring" },
    { "label": "GitHub", "href": "https://github.com" }
  ]
}
```

`nav` renders the header links (top-left of this page shows an **Authoring
Guide** link). Without a `logo`, the engine draws a letter tile from the title
and generates a matching favicon; drop `favicon.svg` in `static/` to override
it.

## Static assets

Anything in the site's `static/` folder is served at `/static/…`, including
nested folders. This demo ships `sample-image.svg` and `sample-banner.svg`, 
used by the image example on [Markdown Basics](./markdown-basics.md), the card
on [Cards & Buttons](./cards-and-buttons.md), and the banner atop the
[Overview](/docs/v1/authoring).

## Edit links

Set your repository and every page gains an "Edit this page on GitHub" link:

```json
{
  "github": { "repo": "https://github.com/you/repo", "branch": "main", "contentDir": "content" }
}
```

That's the whole feature set. Back to the [Overview](/docs/v1/authoring).
