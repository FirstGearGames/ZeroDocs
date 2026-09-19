---
title: "Tabs & Media"
description: "Tabs, accordions, page references, embeds, videos, and alignment, with live previews."
---

# Tabs & Media

## Tabs

Separate tabs with `---`; each starts with `[Tab Label]`. Tabs sharing a label
across the page are **synced**, pick one and the rest follow, and the choice
is remembered as you navigate.

```markdown
:::tabs
[Windows]
Run `node preview-server.js` from PowerShell.
---
[macOS]
Run `node preview-server.js` from Terminal.
---
[Linux]
Same command, any shell.
:::endtabs
```

**Preview:**

:::tabs
[Windows]
Run `node preview-server.js` from PowerShell.
---
[macOS]
Run `node preview-server.js` from Terminal.
---
[Linux]
Same command, any shell.
:::endtabs

Try it twice, switching one switches the other:

:::tabs
[Windows]
The second block is synced to the first by its tab label.
---
[macOS]
Selecting **macOS** here also selects it above.
---
[Linux]
And **Linux** switches both.
:::endtabs

## Collapsible sections

`:::expand <title>` renders a closed `<details>` block that opens on click.

```markdown
:::expand Show the full config
Everything in `docs.config.json` is optional; sensible defaults fill the rest.
:::
```

**Preview:**

:::expand Show the full config
Everything in `docs.config.json` is optional; sensible defaults fill the rest.
:::

## Page references

A prominent link card to another page.

```markdown
:::pageref href="/docs/v1/authoring/callouts"
Callouts reference
:::
```

**Preview:**

:::pageref href="/docs/v1/authoring/callouts"
Callouts reference
:::

## Embeds

`:::embed <url>` turns a bare URL into a rich link card (and a YouTube URL into
a player). This card is generated locally, no external request.

```markdown
:::embed https://nodejs.org/en/about
:::
```

**Preview:**

:::embed https://nodejs.org/en/about
:::

## Video

`:::video <url>` embeds a responsive player; YouTube watch/short URLs are
normalized automatically.

```markdown
:::video https://www.youtube.com/watch?v=aqz-KE-bpKQ
:::
```

**Preview:** renders as a 16:9 embedded player for the given video. (Not shown
inline here so this page stays free of external requests, paste the block into
a page to see it live.)

## Alignment

Wrap content in `[center]…[/center]` (or `[left]` / `[right]`).

```markdown
[center]
This paragraph is centered.
[/center]
```

**Preview:**

[center]
This paragraph is centered.
[/center]

## Emoji shortcodes

`:name:` shortcodes expand to emoji, handy when imported from GitBook.

```markdown
Status: :check-circle: shipped, :rocket-launch: fast, :lock: secure.
```

**Preview:**

Status: :check-circle: shipped, :rocket-launch: fast, :lock: secure.

Next: [Navigation & Theming](./navigation-and-theming.md).
