---
title: "Engine Reference"
description: "Complete technical reference for the documentation engine"
---

# Engine Reference

This is the complete technical reference for the documentation site engine, including all APIs, configuration options, and components.

## Core Architecture

The documentation site is built on:

- **Next.js 14**, React framework with App Router
- **TypeScript**, Type-safe development
- **Tailwind CSS**, Utility-first CSS framework
- **Unified**, Markdown processing pipeline
- **Fuse.js**, Client-side full-text search

## Markdown Processing Pipeline

The engine processes Markdown using this pipeline:

1. **Gray Matter**, Extract frontmatter and content
2. **Remark Parse**, Parse Markdown to AST
3. **Remark GFM**, Add GitHub Flavored Markdown support
4. **Remark Rehype**, Convert to HTML AST
5. **Rehype Highlight**, Syntax highlighting
6. **Rehype Slug**, Auto-generate heading IDs
7. **Rehype Stringify**, Convert to HTML string

## Frontmatter Reference

### Supported Fields

```yaml
---
title: "Page Title"
description: "Short description"
tag: "Beta"
weight: 10
---
```

| Field | Type | Required | Default |
|-------|------|----------|---------|
| title | string | Yes | - |
| description | string | No | "" |
| tag | string | No | - |
| weight | number | No | 0 |

### Tag Values

| Tag | Color | Usage |
|-----|-------|-------|
| Beta | Blue | Features in beta testing |
| Experimental | Purple | Experimental features |
| Deprecated | Red | Features being phased out |
| New | Green | New features |

## Folder Structure

```
content/
├── v1/                    # Version directory
│   ├── _meta.json        # Navigation metadata
│   ├── index.md          # Version homepage
│   ├── folder/
│   │   ├── _meta.json   # Folder navigation
│   │   ├── index.md     # Folder overview
│   │   └── page.md      # Page
│   └── page.md          # Root page
└── v2/
    └── index.md
```

## _meta.json Format

### Item Types

```json
[
  {
    "type": "separator",
    "title": "Section Title"
  },
  {
    "type": "file",
    "slug": "page-name",
    "title": "Page Title",
    "tag": "Beta"
  },
  {
    "type": "folder",
    "slug": "folder-name",
    "title": "Folder Title",
    "defaultOpen": true,
    "tag": "New"
  }
]
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| type | string | "file", "folder", "separator" |
| slug | string | Filename without .md |
| title | string | Display title |
| tag | string | Beta, Experimental, Deprecated, New |
| defaultOpen | boolean | Auto-expand folder |

## Configuration File

### docs.config.json

```json
{
  "title": "Site Title",
  "description": "Site description",
  "github": {
    "repo": "https://github.com/org/repo",
    "branch": "main",
    "contentDir": "content"
  },
  "versions": ["v1", "v2"],
  "defaultVersion": "v1",
  "nav": [
    {
      "title": "Home",
      "href": "/docs"
    }
  ]
}
```

## Component API

### Available Components

- `Header`, Top navigation bar
- `Sidebar`, Left navigation
- `TableOfContents`, Right sidebar TOC
- `SearchModal`, Full-text search
- `Breadcrumb`, Navigation breadcrumbs
- `PrevNextNav`, Page navigation
- `CodeBlock`, Syntax-highlighted code
- `Callout`, Info/Warning/Danger/Tip blocks

### Using Components

Components are in `src/components/`:

```typescript
import { Callout } from '@/components/Callout';

export function MyComponent() {
  return (
    <Callout type="info" title="Info">
      This is helpful information.
    </Callout>
  );
}
```

## API Routes

### GET /api/docs/[version]/[...slug]

Fetch a rendered documentation page.

**Response:**
```json
{
  "content": "<html>...</html>",
  "meta": {
    "title": "Page Title",
    "description": "...",
    "tag": "Beta"
  },
  "headings": [
    { "id": "heading-1", "text": "Heading 1", "level": 2 }
  ],
  "slug": ["page"],
  "version": "v1",
  "editUrl": "..."
}
```

### GET /api/nav/[version]

Fetch navigation structure for a version.

**Response:**
```json
[
  {
    "slug": "index",
    "title": "Home",
    "type": "file",
    "href": "/docs/v1"
  }
]
```

### GET /api/search/[version]

Fetch search index for a version.

**Response:**
```json
[
  {
    "title": "Page Title",
    "description": "...",
    "href": "/docs/v1/page",
    "content": "..."
  }
]
```

## Build and Deployment

### Build Command

```bash
npm run build
```

Generates optimized production build in `.next/`.

### Start Command

```bash
npm start
```

Runs production server on port 3000.

### Environment Variables

```env
NODE_ENV=production
```

## Performance Optimizations

1. **Static Generation**, Pages generated at build time
2. **Code Splitting**, Automatic code splitting
3. **Image Optimization**, Next.js image optimization
4. **Search Index**, Built at deployment time
5. **Caching**, Browser caching with versioning

## Extending the Engine

### Adding Custom Components

1. Create component in `src/components/`
2. Export from component file
3. Import and use in pages

### Custom Styling

Edit `src/app/globals.css` for global styles or add Tailwind classes.

### Custom Hooks

Create hooks in `src/lib/` for reusable logic.

## Troubleshooting

### Build Fails with TypeScript Errors

Run `npm run build` to see all errors, then fix them.

### Content Not Appearing

1. Verify file is in `content/v1/`
2. Check frontmatter is valid YAML
3. Restart dev server
4. Check console for errors

### Search Not Working

1. Rebuild search index: restart server
2. Check `_meta.json` files are valid JSON
3. Verify markdown files exist

### Styling Issues

1. Check Tailwind classes are used correctly
2. Verify dark mode classes are present
3. Check CSS precedence
4. Clear `.next/` and rebuild

## Performance Tips

1. Optimize images
2. Keep markdown files concise
3. Use semantic HTML
4. Minimize custom CSS
5. Cache static assets

## Security

- No database required
- Files read at build time
- Content serves as static HTML
- Search runs client-side
- No user authentication needed

## Version Management

Add versions by creating `content/v{n}/` folders and updating `docs.config.json`.

Versions are independent, each can have different content and navigation.

## License

See LICENSE file in repository.

## Support

For issues and questions:

- Check documentation
- Review source code
- Open GitHub issue
- Contact support

This completes the Engine Reference documentation.
