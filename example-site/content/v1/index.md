---
title: "ZeroDocs Demo"
description: "A live example of everything the engine renders from plain Markdown."
---

# ZeroDocs, Demo

This is a live example site served by **ZeroDocs**. It reads Markdown files from a `content/` folder and generates a fully-featured documentation portal, similar to Docker Docs and GitBook. Every feature below is rendered by the engine from the Markdown in this folder.

:::card bg="#f0f7ff" border="#93c5fd" href="/docs/v1/authoring"
### 📖 Start with the Component Showcase
Every feature the engine supports, callouts, cards, tabs, code, and more, each shown as **the Markdown you write** next to **the live result**. The best way to see what's possible.
:::

## Key Features

- **Markdown-based**, Write docs in plain Markdown with full frontmatter support
- **File-system routing**, Folder structure automatically becomes your sidebar navigation
- **Syntax highlighting**, Code blocks with language detection and copy button
- **Full-text search**, Press `Cmd+K` (or `Ctrl+K`) to open the search modal
- **Versioning**, Switch between versions with the selector in the header
- **Dark/Light mode**, Toggle theme with persistent preferences
- **Mobile-friendly**, Hamburger sidebar on small screens
- **Table of contents**, Auto-generated right sidebar with heading navigation
- **Material Cards & Buttons**, Rich UI components with full customization

## Callout Blocks

> **Info:** Use `> **Info:** ...` for informational callouts.

> **Warning:** Use `> **Warning:** ...` for important warnings.

> **Danger:** Use `> **Danger:** ...` for critical alerts.

> **Tip:** Use `> **Tip:** ...` for best practices and tips.

## Code Blocks

Code blocks are automatically syntax-highlighted with a copy button:

```javascript
// JavaScript
function greet(name) {
  return `Hello, ${name}!`;
}
```

```python
# Python
def greet(name):
    return f"Hello, {name}!"
```

```bash
# Run the preview server
node preview-server.js
```

## Material Cards

Use `:::card` blocks to create Material Design cards. Cards support background colors, images, borders, and text alignment.

### Basic Card

:::card bg="#f0f7ff" border="#93c5fd"
## Quick Start

Run the server with a single command:

```bash
node preview-server.js
```

Then open **http://localhost:3001/docs**
:::

### Card with Custom Colors

:::card bg="#1e293b" color="#e2e8f0" border="false"
## Dark Card

Cards support any CSS color value, hex, rgb, hsl, or named colors. Set `color` to control the text color for contrast.

Perfect for feature callouts and highlighted content.
:::

### Card with Image

:::card img="https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&q=80" border="true"
## Code & Coffee

Cards can display an image at the top before the content. Supply any public image URL via the `img` attribute.
:::

### Centered Card with Background Image

:::card bg="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80" color="#fff" align="center" padding="40px 24px"
## Launch Day

**February 2026**

The next generation docs experience.
:::

### Card Grid (side by side with prose)

Use cards inline in your content flow for feature comparisons:

:::cardrow
:::card bg="#f0fdf4" border="#86efac"
### ✅ Authoring

- Markdown of all kinds, nested lists, task lists, aligned tables
- Nested navigation with `_meta.json`
- Built-in syntax highlighting, fully offline, no CDN
- Callouts with titles, synced tabs, cards, buttons
:::

:::card bg="#f0f7ff" border="#93c5fd"
### ⚡ Built In

- Live reload on file changes
- Section-level full-text search
- Heading anchors, lightbox, back-to-top
- Per-page OpenGraph metadata, sitemap, `/llms.txt`
:::
:::endrow

## Task Lists and Nesting

- [x] Ship the engine
- [x] Write the docs
  - [x] Authoring guide
  - [ ] Video walkthrough
- [ ] Take a break

## Material Buttons

Inline buttons use the `[Text]{.btn ...}` syntax anywhere in your prose.

### Basic Buttons

[Get Started]{.btn bg="#2563eb" color="#fff" href="/docs/v1/get-started/installation"}  [View on GitHub]{.btn bg="#24292f" color="#fff" href="https://github.com" border="true"}  [Learn More]{.btn bg="transparent" color="#2563eb" border="#2563eb"}

### Colored Buttons

[Success]{.btn bg="#16a34a" color="#fff"}  [Warning]{.btn bg="#d97706" color="#fff"}  [Danger]{.btn bg="#dc2626" color="#fff"}  [Info]{.btn bg="#0891b2" color="#fff"}

### Size Variants

[Small Button]{.btn bg="#6d28d9" color="#fff" size="sm"}  [Normal Button]{.btn bg="#2563eb" color="#fff"}  [Large Button]{.btn bg="#1e40af" color="#fff" size="lg"}

### Button with Image Background

[Explore Now →]{.btn bgimg="https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&q=80" color="#fff" border="false" size="lg"}

## Tables

| Feature | Status | Since |
|---------|--------|-------|
| Search (Cmd+K) | ✅ Ready | v1 |
| Dark / Light Mode | ✅ Ready | v1 |
| Material Cards | ✅ Ready | v1 |
| Material Buttons | ✅ Ready | v1 |
| GitHub Edit Link | ✅ Ready | v1 |
| Prev / Next Nav | ✅ Ready | v1 |

---

Happy documenting! Check the sidebar for more examples and the full documentation.
