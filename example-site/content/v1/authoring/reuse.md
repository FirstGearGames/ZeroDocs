---
title: "Includes & Variables"
description: "Write a block once and include it anywhere, pull code from real source files, and fill in values from config."
tag: New
---

# Includes & Variables

Keep repeated text and code in one place. Each section shows the Markdown you
write and the live result.

## Include a shared Markdown file

Put the shared text in its own file and include it where it should appear. The
path is relative to the page, or to the site folder when it starts with `/`.
Files and folders whose names start with `_` never become pages, so `_shared/`
is a good home for them.

You write:

~~~markdown
:::include ./_shared/support-note.md
~~~

Preview:

:::include ./_shared/support-note.md

The included file's frontmatter is dropped, and includes inside it expand too.

## Include code from a source file

Include a whole source file, or one region of it, so a sample in the docs is
the same code your build compiles and tests. Mark the region in the source
with `#region <name>` and `#endregion`, in whatever comment style the language
uses (`#region` in C#, `//#region` in JavaScript). The file's extension sets
the language, and anything after the path becomes the code block's info, such
as a title.

You write:

~~~markdown
:::include /snippets/greet.js#greet title="greet.js"
~~~

Preview:

:::include /snippets/greet.js#greet title="greet.js"

Keep these samples inside the site folder, for example in `snippets/`. An
include can't read anything outside the site folder, or a hidden file or folder
(one whose name starts with `.`). A missing or refused include shows as a red
callout on the page, so it can't fail silently.

## Variables

Define values once in `docs.config.json`:

```json
"variables": { "version": "2.0.0" }
```

Then write `{{name}}` anywhere in a page, including code blocks and
frontmatter.

You write:

~~~markdown
Install version \{{version}}:

```bash
npm install zerodocs@\{{version}}
```
~~~

Preview:

Install version {{version}}:

```bash
npm install zerodocs@{{version}}
```

A name the config doesn't define stays exactly as written, so `{{ }}` in other
templating samples is left alone. To show the braces of a defined name, as the
"You write" block above does, put a backslash in front: `\\{{version}}`.

Next: [Navigation & Theming](./navigation-and-theming.md).
