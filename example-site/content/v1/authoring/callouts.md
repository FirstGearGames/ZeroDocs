---
title: "Callouts"
description: "Info, warning, danger, and success admonitions, three syntaxes, optional titles."
---

# Callouts

Colored admonitions for asides, warnings, and tips. There are four types, 
`info`, `warning`, `danger`, `success`, and three interchangeable syntaxes
that all render identically.

## The four types

```markdown
:::hint type="info"
Informational aside. Use it for context and side notes.
:::

:::hint type="success"
Something went right, or a recommended best practice.
:::

:::hint type="warning"
Proceed with care, this has consequences.
:::

:::hint type="danger"
Destructive or irreversible. Read before acting.
:::
```

**Preview:**

:::hint type="info"
Informational aside. Use it for context and side notes.
:::

:::hint type="success"
Something went right, or a recommended best practice.
:::

:::hint type="warning"
Proceed with care, this has consequences.
:::

:::hint type="danger"
Destructive or irreversible. Read before acting.
:::

## Titles

Add `title="…"` for a bold heading above the body.

```markdown
:::hint type="warning" title="Before you upgrade"
Back up your project, the migration rewrites config files in place.
:::
```

**Preview:**

:::hint type="warning" title="Before you upgrade"
Back up your project, the migration rewrites config files in place.
:::

## GitHub-alert syntax

If you prefer GitHub's alert style, it converts to the same callout. Aliases:
`NOTE`→info, `TIP`→success, `CAUTION`→warning, `IMPORTANT` stays info.

```markdown
> [!NOTE]
> Written as a blockquote with a `[!TYPE]` marker on the first line.

> [!TIP]
> This renders as a green success callout.
```

**Preview:**

> [!NOTE]
> Written as a blockquote with a `[!TYPE]` marker on the first line.

> [!TIP]
> This renders as a green success callout.

## GitBook syntax

Imported GitBook content works unchanged:

```markdown
{% hint style="danger" %}
GitBook's `{% hint %}` blocks are accepted as-is.
{% endhint %}
```

**Preview:**

{% hint style="danger" %}
GitBook's `{% hint %}` blocks are accepted as-is.
{% endhint %}

## Rich content

Callout bodies are full Markdown, lists, code, and formatting all work.

```markdown
:::hint type="info" title="Install steps"
1. Copy `docs.config.json`
2. Add your first page under `content/v1/`
3. Run `node preview-server.js`
:::
```

**Preview:**

:::hint type="info" title="Install steps"
1. Copy `docs.config.json`
2. Add your first page under `content/v1/`
3. Run `node preview-server.js`
:::

Next: [Cards & Buttons](./cards-and-buttons.md).
