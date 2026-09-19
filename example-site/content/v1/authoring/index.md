---
title: "Component Showcase"
description: "Every feature the engine renders, shown as the source you write and the live result."
banner: /static/sample-banner.svg
tag: Live
---

# Component Showcase

This is a **living reference**. Every feature below is documented the same way:
first the Markdown you write, then a **Preview** of exactly what the engine
renders from it. This whole page is served by the engine, the previews are
real, not screenshots.

> [!TIP]
> The engine live-reloads. Open any of these files under
> `example-site/content/v1/authoring/`, change a line, and the page updates
> in place.

## What's in this guide

:::refcards
[file-text|Markdown Basics|/docs/v1/authoring/markdown-basics]
Text, lists, task lists, tables, quotes, links, and images.
[zap|Code Blocks|/docs/v1/authoring/code]
Syntax highlighting, titles, and diff marks, all offline.
[info|Callouts|/docs/v1/authoring/callouts]
Info, warning, danger, and success admonitions with titles.
[globe|Images|/docs/v1/authoring/images]
Sizing, alignment, clipping, styling, captions, galleries, banners, covers.
[layers|Cards & Buttons|/docs/v1/authoring/cards-and-buttons]
Cards, card rows, nav/ref/file cards, buttons, and link buttons.
[server|Components|/docs/v1/authoring/components]
Steps, badges, keyboard keys, field tables, announcement bar, footer.
[book-open|Tabs & Media|/docs/v1/authoring/tabs-and-media]
Tabs, accordions, videos, embeds, and page references.
[settings|Navigation & Theming|/docs/v1/authoring/navigation-and-theming]
Sidebar control, versions, page metadata, and colors.
:::

## Frontmatter

Every page can open with a `---` block of metadata. This page uses one to set
its title, description, banner, and the "Live" tag beside the title above.

```markdown
---
title: "Component Showcase"
description: "Every feature the engine renders."
banner: /static/sample-banner.svg
tag: Live
---
```

| Key | Effect |
|-----|--------|
| `title` | Page heading, browser tab, and sidebar fallback. |
| `description` | Sub-title under the heading and the search/OpenGraph summary. |
| `banner` | Full-width image above the title (the blue bar at the top of this page). |
| `cover` | Edge-to-edge cover image with a fixed aspect ratio. |
| `cover-position` | Focal point for the cover, e.g. `center top`. |
| `tag` | Small pill next to the title (the **Live** pill above). |

**Preview:** the banner, sub-title, and tag at the top of this page are all
produced by the frontmatter shown above.
