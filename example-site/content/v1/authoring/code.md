---
title: "Code Blocks"
description: "Fenced code with built-in offline highlighting, titles, diff marks, and how to show fence source."
---

# Code Blocks

Fenced code blocks are highlighted by a **built-in** highlighter, no CDN, no
network. Every block gets a copy button.

Each feature below shows the exact **source** you write (in a `~~~` wrapper, 
see [Showing fence source](#showing-fence-source)) and then the live
**Preview**.

## Inline code

Wrap a word in single backticks to format it inline, like `Spawn()`.

## A basic block

Open with three backticks and a language tag, then close with three backticks.

You write:

~~~markdown
```js
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
```
~~~

Preview:

```js
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
```

## Language highlighting

The tag after the opening fence selects the grammar. These all render offline:

```python
from dataclasses import dataclass

@dataclass
class Point:
    x: int = 0

    def moved(self, dx: int) -> "Point":
        return Point(self.x + dx, 0)
```

```csharp
public sealed class Greeter
{
    public string Name { get; init; } = "world";
    public string Greet() => $"Hello, {Name}!";
}
```

```bash
# Point the engine at a site and run it
DOCS_ROOT=./example-site node preview-server.js
```

Supported tags include `js` / `ts`, `python`, `csharp`, `java`, `c` / `cpp`,
`go`, `rust`, `json`, `yaml`, `toml` / `ini`, `bash`, `powershell`, `sql`,
`html` / `xml`, `css`, `diff`, and `markdown`. Use `text` (or `raw`) for
plain, unhighlighted output. An unknown or missing tag also renders as plain,
escaped text.

## Titled blocks

Add `title="…"` after the language tag for a filename header.

You write:

~~~markdown
```js title="debounce.js"
export const answer = 42;
```
~~~

Preview:

```js title="debounce.js"
export const answer = 42;
```

## Diff blocks

Tag a fence `diff` and prefix lines with `+` or `-`.

You write:

~~~markdown
```diff
 function tick(state) {
-  return state.value;
+  return state.value + 1;
}
```
~~~

Preview:

```diff
 function tick(state) {
-  return state.value;
+  return state.value + 1;
}
```

## Tilde fences `~~~`

**Newest feature.** A fence can be opened with three or more **tildes** instead
of backticks. It behaves exactly like a backtick fence, same language tags,
titles, and highlighting, so `~~~` is a drop-in alternative.

You write (this source is itself shown by wrapping it in a four-backtick fence):

````markdown
~~~js
const usingTildes = true;
~~~
````

Preview:

~~~js
const usingTildes = true;
~~~

## Showing fence source

Tilde fences are what make *this whole page* possible. A fence closes only on a
line of the **same character** that is **at least as long**, so:

- a `~~~` (tilde) fence can contain ```` ``` ```` blocks, and
- a four-backtick fence can contain three-backtick (or tilde) blocks.

That means to display a code block as source, you wrap it in a `~~~` fence.

You write (wrapped here in a five-backtick fence, so even the `~~~` shows):

`````markdown
~~~markdown
```js
console.log("shown as source");
```
~~~
`````

Preview:

~~~markdown
```js
console.log("shown as source");
```
~~~

The rule nests as deep as you need: three backticks for code, `~~~` to show
that code's source, four backticks to show the `~~~`, five to show the four, 
each example on this page uses exactly that ladder.

## Raw / plain text

Use the `text` or `raw` tag for content that should not be highlighted or
interpreted, logs, output, or plain data.

Preview:

```text
[12:00:04] server ready on http://localhost:3001
[12:00:09] GET /docs/v1  200  4ms
```

Next: [Callouts](./callouts.md).
