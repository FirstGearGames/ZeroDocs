---
title: "Adding Content"
description: "Guide to creating and organizing documentation content"
---

# Adding Content

This guide shows you how to add new documentation pages to your site.

## Creating Your First Page

### Step 1: Create a Markdown File

Create a new file in the `content/v1/` directory:

```bash
touch content/v1/my-guide.md
```

### Step 2: Add Frontmatter

Every Markdown file should start with frontmatter:

```yaml
---
title: "My Guide Title"
description: "A short description of this page"
tag: "Beta"
weight: 10
---

# Content goes here...
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | Yes | Page title (shown in sidebar) |
| description | string | No | Short description for search/meta |
| tag | string | No | One of: Beta, Experimental, Deprecated, New |
| weight | number | No | Sort order (lower = earlier) |

## Organizing in Folders

Create a folder structure to organize your docs:

```bash
mkdir -p content/v1/my-section
touch content/v1/my-section/index.md
touch content/v1/my-section/page-1.md
touch content/v1/my-section/page-2.md
```

The URL structure mirrors the folder structure:

- `content/v1/my-section/index.md` → `/docs/v1/my-section`
- `content/v1/my-section/page-1.md` → `/docs/v1/my-section/page-1`

## Using _meta.json for Control

Create a `_meta.json` file in any folder to control:

- **Order** of items in the sidebar
- **Separators** for grouping sections
- **Folder/file** type designation
- **Tags** for marking pages
- **Auto-open** behavior for folders

### Example _meta.json

```json
[
  { "type": "separator", "title": "Basics" },
  { "slug": "index", "title": "Overview" },
  { "slug": "installation", "title": "Installation" },
  { "type": "separator", "title": "Advanced" },
  { "slug": "advanced", "title": "Advanced Topics", "type": "folder", "defaultOpen": false },
  { "slug": "troubleshooting", "title": "Troubleshooting", "tag": "Beta" }
]
```

### _meta.json Properties

| Property | Type | Description |
|----------|------|-------------|
| type | string | "file", "folder", or "separator" |
| slug | string | Filename without .md extension |
| title | string | Display name in sidebar |
| tag | string | Beta, Experimental, Deprecated, New |
| defaultOpen | boolean | Auto-expand folder on page load |

## Writing Markdown Content

Use standard Markdown with some special syntax for callouts:

```markdown
# Heading 1

## Heading 2

### Heading 3

Normal paragraph text.

> **Info:** Callout with info badge.

> **Warning:** Warning callout.

> **Danger:** Danger callout.

> **Tip:** Tip callout.

- Bullet list item
- Another item

1. Numbered list item
2. Another item

[Link text](https://example.com)

![Alt text](./image.jpg)

`inline code`

\`\`\`javascript
// Code block
const message = 'Hello, World!';
\`\`\`
```

## Linking Between Pages

Use relative or absolute paths:

```markdown
[Link to home](/docs/v1)
[Link to install guide](./installation)
[Link using slug](/docs/v1/get-started/installation)
```

## Adding Images

Place images in the same folder as your Markdown:

```bash
content/v1/my-guide/
├── index.md
└── my-image.png
```

Reference in Markdown:

```markdown
![Description of image](./my-image.png)
```

## Best Practices

1. **Use descriptive titles**, Clear, concise page titles
2. **Write for beginners**, Assume some readers are new
3. **Use examples**, Show real-world usage
4. **Keep it organized**, Use folders for grouping
5. **Link between pages**, Help readers navigate
6. **Use callouts**, Highlight important information
7. **Keep pages focused**, One topic per page
8. **Update regularly**, Keep content current

## Common Patterns

### Tutorial Structure

```markdown
---
title: "How to Use Feature X"
---

# How to Use Feature X

## Overview
Brief intro to the feature.

## Prerequisites
What you need to know first.

## Step-by-step Instructions
1. First step
2. Second step
3. Final step

## Examples
Real-world examples.

## Troubleshooting
Common problems and solutions.
```

### Reference Structure

```markdown
---
title: "API Reference"
---

# API Reference

## Overview
What this API does.

## Endpoints

### GET /resource
Description and example.

### POST /resource
Description and example.

## Error Codes
Possible error responses.
```

## Testing Your Content

1. Start dev server: `npm run dev`
2. Visit http://localhost:3000/docs/v1
3. Navigate to your new page
4. Check links work correctly
5. Verify formatting looks good

## Next Steps

Once you've added content:

1. Customize the site appearance
2. Deploy to production
3. Set up version management
4. Add search optimization

Happy writing!
