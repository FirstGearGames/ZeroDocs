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

A broken link never ships. The static build checks every page: links to pages,
`#anchors` against the headings and table rows they name, and `/static/` images
and files. It stops on any that are broken, listing each one, and the preview
server lists them when it starts.

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

**Rows you can link to.** When a row's first cell starts with code, as in an
API member table, the row gets its own link: hover it for the `#`, or link to
`#isserver` directly. A long table keeps its header in view as it scrolls.

```markdown
| Member | Meaning |
|--------|---------|
| `IsServer` | True on the server's side of a connection. |
| `IsClient` | True on a client's side. |
```

**Preview:**

| Member | Meaning |
|--------|---------|
| `IsServer` | True on the server's side of a connection. |
| `IsClient` | True on a client's side. |

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
