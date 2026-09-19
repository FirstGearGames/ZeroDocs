---
title: "Components"
description: "Steps, badges, keyboard keys, field tables, announcement bar, and footer."
tag: New
---

# Components

Structured content blocks for procedures, reference, and site chrome.

## Steps

`:::steps` renders a numbered, connected procedure. Separate steps with `---`;
each step is full Markdown (lists, code, callouts all work).

~~~markdown
:::steps
Create a site folder with `content/v1/index.md` and a `docs.config.json`.
---
Point the engine at it:

```bash
node preview-server.js ./my-site
```
---
Open **http://localhost:3001/docs** and start writing.
:::
~~~

Preview:

:::steps
Create a site folder with `content/v1/index.md` and a `docs.config.json`.
---
Point the engine at it:

```bash
node preview-server.js ./my-site
```
---
Open **http://localhost:3001/docs** and start writing.
:::

## Badges

Inline `[Text]{.badge}` labels. Built-in types `neutral` (default), `info`,
`success`, `warning`, `danger`, or a custom `color`.

~~~markdown
[Stable]{.badge type="success"} [Beta]{.badge type="info"}
[Deprecated]{.badge type="danger"} [Note]{.badge}
[Custom]{.badge color="#7c3aed"}
~~~

Preview:

[Stable]{.badge type="success"} [Beta]{.badge type="info"}
[Deprecated]{.badge type="danger"} [Note]{.badge}
[Custom]{.badge color="#7c3aed"}

Badges sit inline with text, the API is v2 [New]{.badge type="success"} and
the old endpoint is [Deprecated]{.badge type="danger"}.

## Keyboard keys

Wrap shortcuts in `[[ ]]`; join combos with `+`.

~~~markdown
Open search with [[Ctrl+K]] (or [[Cmd+K]]), close with [[Esc]].
~~~

Preview:

Open search with [[Ctrl+K]] (or [[Cmd+K]]), close with [[Esc]].

## Field tables

`:::field` documents a parameter: `name`, `type`, `default`, and a bare
`required` flag, with a Markdown description. Stack several for an API
reference.

~~~markdown
:::field name="title" type="string" required
The site name shown in the header and browser tab.
:::

:::field name="theme" type="object" default="{}"
Accent colors. See [Navigation & Theming](./navigation-and-theming.md).
:::

:::field name="versions" type="string[]"
Version folders under `content/`. Defaults to whatever exists on disk.
:::
~~~

Preview:

:::field name="title" type="string" required
The site name shown in the header and browser tab.
:::

:::field name="theme" type="object" default="{}"
Accent colors. See [Navigation & Theming](./navigation-and-theming.md).
:::

:::field name="versions" type="string[]"
Version folders under `content/`. Defaults to whatever exists on disk.
:::

## Announcement bar

A site-wide bar above the header, from `docs.config.json`. Optionally a link
and a dismiss button (dismissal is remembered until the text changes). The blue
bar at the top of this site is live, set by:

~~~json
{
  "announcement": {
    "text": "This announcement bar is config-driven, and dismissible. →",
    "href": "/docs/v1/authoring/navigation-and-theming",
    "dismissible": true
  }
}
~~~

## Footer

A config-driven footer below the content, the one at the bottom of this page:

~~~json
{
  "footer": {
    "text": "Built with ZeroDocs, zero dependencies, fully offline.",
    "links": [
      { "label": "Authoring Guide", "href": "/docs/v1/authoring" },
      { "label": "Components", "href": "/docs/v1/authoring/components" }
    ]
  }
}
~~~

Next: [Navigation & Theming](./navigation-and-theming.md).
