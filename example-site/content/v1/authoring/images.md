---
title: "Images"
description: "Sizing, alignment, clipping, styling, captions, galleries, banners, and covers."
tag: New
cover: /static/sample-banner.svg
cover-position: center
---

# Images

Everything the engine can do with images, each shown as the Markdown you write
and the live result. Click any image to zoom it in the lightbox.

## Basic image

You write:

~~~markdown
![A sample image](/static/sample-image.svg)
~~~

Preview:

![A sample image](/static/sample-image.svg)

## Sizing

Add `{width=…}` and/or `{height=…}`, a bare number means pixels.

~~~markdown
![Sized](/static/sample-image.svg){width=280}
~~~

Preview:

![Sized](/static/sample-image.svg){width=280}

## Alignment

`{align=center|left|right}`, plus a fine `offset=x,y` nudge if you need it.

~~~markdown
![Centered](/static/sample-image.svg){width=240 align=center}
~~~

Preview:

![Centered](/static/sample-image.svg){width=240 align=center}

## Clipping (crop to a shape)

`ratio=W:H` crops the image to a fixed aspect box (using `fit=cover`), so
mismatched images line up cleanly. Use `fit=contain` to letterbox instead.

~~~markdown
![Cropped 21:9](/static/sample-image.svg){ratio=21:9 rounded}
~~~

Preview:

![Cropped 21:9](/static/sample-image.svg){ratio=21:9 rounded}

## Styling

Bare flags `rounded`, `shadow`, and `border` (or `rounded=16px`, `border=#888`).

~~~markdown
![Styled](/static/sample-image.svg){width=280 align=center rounded shadow}
~~~

Preview:

![Styled](/static/sample-image.svg){width=280 align=center rounded shadow}

## Figures with captions

Add a `"quoted caption"` after the URL to wrap the image in a `<figure>` with a
`<figcaption>`.

~~~markdown
![Architecture diagram](/static/sample-image.svg "Figure 1, the request pipeline"){width=360 align=center border}
~~~

Preview:

![Architecture diagram](/static/sample-image.svg "Figure 1, the request pipeline"){width=360 align=center border}

## Galleries

`:::gallery` lays images out in a responsive grid (default 3 columns, set with
`cols=`). Cells are cropped to a uniform ratio; captions and the lightbox work
inside them.

~~~markdown
:::gallery cols=3
![One](/static/sample-image.svg "First")
![Two](/static/sample-banner.svg "Second")
![Three](/static/sample-image.svg "Third")
:::
~~~

Preview:

:::gallery cols=3
![One](/static/sample-image.svg "First")
![Two](/static/sample-banner.svg "Second")
![Three](/static/sample-image.svg "Third")
:::

## Page banners

Set `banner:` in a page's frontmatter for a full-width image above the title, 
like the one on the [Component Showcase overview](/docs/v1/authoring).

~~~markdown
---
title: "My Page"
banner: /static/sample-banner.svg
---
~~~

## Page covers

`cover:` renders an edge-to-edge image at the very top of the page (before the
title), with an optional `cover-position:` focal point. This page sets one, 
scroll to the top to see it.

~~~markdown
---
title: "My Page"
cover: /static/sample-banner.svg
cover-position: center
---
~~~

Next: [Components](./components.md).
