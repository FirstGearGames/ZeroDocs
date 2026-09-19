---
title: "Markdown Basics"
description: "Text, links, lists, task lists, tables, quotes, and images, with live previews."
---

# Markdown Basics

Standard GitHub-Flavored Markdown, each shown as source then preview.

## Text formatting

```markdown
**Bold**, *italic*, ***both***, `inline code`, ~~strikethrough~~,
and a [link to the overview](/docs/v1/authoring). Underscores work too:
_italic_ and __bold__, but snake_case_words stay intact.
```

**Preview:**

**Bold**, *italic*, ***both***, `inline code`, ~~strikethrough~~,
and a [link to the overview](/docs/v1/authoring). Underscores work too:
_italic_ and __bold__, but snake_case_words stay intact.

## Links

Relative `.md` links are rewritten to routes automatically, so links that work
in your editor work on the site. External links open in a new tab with an `↗`
marker, and bare URLs in angle brackets autolink.

```markdown
- Relative page: [Callouts](./callouts.md)
- Absolute route: [Code Blocks](/docs/v1/authoring/code)
- External: [the Node.js site](https://nodejs.org)
- Autolink: <https://nodejs.org>
```

**Preview:**

- Relative page: [Callouts](./callouts.md)
- Absolute route: [Code Blocks](/docs/v1/authoring/code)
- External: [the Node.js site](https://nodejs.org)
- Autolink: <https://nodejs.org>

## Lists

Unordered and ordered lists nest by indentation. Ordered lists honor their
starting number.

```markdown
- Managers
  - Client manager
  - Server manager
- Transports

3. Third
4. Fourth
```

**Preview:**

- Managers
  - Client manager
  - Server manager
- Transports

3. Third
4. Fourth

## Task lists

```markdown
- [x] Design the API
- [x] Write the engine
  - [x] Renderer
  - [ ] Static export
- [ ] Ship it
```

**Preview:**

- [x] Design the API
- [x] Write the engine
  - [x] Renderer
  - [ ] Static export
- [ ] Ship it

## Tables

Use `:` in the separator row to set column alignment (left / center / right).

```markdown
| Feature   | Status  |   Since |
|:----------|:-------:|--------:|
| Search    |  Ready  |      v1 |
| Live reload | Ready |      v2 |
```

**Preview:**

| Feature   | Status  |   Since |
|:----------|:-------:|--------:|
| Search    |  Ready  |      v1 |
| Live reload | Ready |      v2 |

## Blockquotes

```markdown
> A plain blockquote for asides and citations.
> It can span multiple lines and contain **formatting**.
```

**Preview:**

> A plain blockquote for asides and citations.
> It can span multiple lines and contain **formatting**.

(For colored info/warning/tip boxes, see [Callouts](./callouts.md).)

## Images

Reference anything in the site's `static/` folder. Readers can click an image
to zoom it in a lightbox. Optional `{width= align=}` attributes control size
and placement.

```markdown
![A sample image](/static/sample-image.svg){width=420 align=center}
```

**Preview:**

![A sample image](/static/sample-image.svg){width=420 align=center}

## Horizontal rule

```markdown
---
```

**Preview:**

---

That's the Markdown foundation. Next: [Code Blocks](./code.md).
