---
title: "Customization"
description: "How to customize colors, branding, and appearance"
---

# Customization

Learn how to customize the appearance and behavior of your documentation site.

## Site Configuration

Edit `docs.config.json` to customize site-wide settings:

```json
{
  "title": "My Docs",
  "description": "Documentation site",
  "github": {
    "repo": "https://github.com/your-org/your-repo",
    "branch": "main",
    "contentDir": "content"
  },
  "versions": ["v1", "v2"],
  "defaultVersion": "v1",
  "nav": [
    { "title": "Get Started", "href": "/docs/v1/get-started" },
    { "title": "Guides", "href": "/docs/v1/guides" }
  ]
}
```

### Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| title | string | Site title shown in header |
| description | string | Site description for meta tags |
| github.repo | string | GitHub repository URL |
| github.branch | string | Default branch for edit links |
| github.contentDir | string | Path to content folder |
| versions | array | Available version names |
| defaultVersion | string | Default version on load |
| nav | array | Top navigation links |

## Styling and Theme

### Colors

Edit `src/app/globals.css` to change colors. The site uses Tailwind CSS utility classes:

```css
/* Change primary color from blue to purple */
.prose a {
  @apply text-purple-600 dark:text-purple-400;
}

/* Change header background */
header {
  @apply bg-purple-50 dark:bg-purple-950;
}
```

### Dark Mode

Dark mode is enabled via `class` strategy in `tailwind.config.ts`:

```typescript
darkMode: 'class',
```

To apply dark mode styles:

```css
.my-element {
  @apply bg-white dark:bg-gray-900;
}
```

### Fonts

Change fonts in `src/app/globals.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

html {
  font-family: 'Inter', system-ui, sans-serif;
}
```

## Logo and Branding

### Change Logo

Edit `src/components/Header.tsx`:

```typescript
// Replace this:
<div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
  D
</div>

// With your logo:
<img src="/logo.svg" alt="Logo" className="w-8 h-8" />
```

### Add Favicon

Place `favicon.ico` in `public/` folder.

## Navigation Customization

### Header Navigation

Edit top navigation in `docs.config.json`:

```json
"nav": [
  { "title": "Docs", "href": "/docs" },
  { "title": "Blog", "href": "/blog" },
  { "title": "API", "href": "/api" }
]
```

### Sidebar Navigation

Use `_meta.json` in content folders to customize sidebar order and structure.

## Component Styling

### Header Height

Change header height in `src/components/Header.tsx`:

```typescript
// Change from h-16 to h-20
<header className="... h-20 ...">
```

### Sidebar Width

Adjust sidebar width in `src/components/Sidebar.tsx`:

```typescript
// Change from w-64 to w-80
<aside className="... w-80 ...">
```

## Adding Custom Components

Create new components in `src/components/`:

```typescript
// src/components/MyComponent.tsx
export function MyComponent() {
  return <div className="...">Custom component</div>;
}
```

Then import in doc pages:

```markdown
<!-- In your markdown file -->
<MyComponent />
```

## Tailwind Configuration

Extend Tailwind in `tailwind.config.ts`:

```typescript
const config: Config = {
  content: [...],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f8f8f8',
          600: '#0066cc',
          900: '#001a4d',
        },
      },
    },
  },
};
```

## Global CSS Customization

Edit `src/app/globals.css` for typography and component styling:

```css
/* Customize headings */
.prose h1 {
  @apply text-4xl font-bold mt-8 mb-4 text-brand-900;
}

.prose h2 {
  @apply text-2xl font-semibold mt-8 mb-3 border-brand-200;
}

/* Customize code blocks */
.prose pre {
  @apply bg-brand-900 rounded-xl;
}
```

## Metadata Tags

Edit `src/app/layout.tsx` for meta tags:

```typescript
export const metadata: Metadata = {
  title: 'My Docs',
  description: 'Documentation site',
  keywords: ['docs', 'documentation', 'help'],
  creator: 'Your Organization',
};
```

## Search Customization

Configure Fuse.js search in `src/components/SearchModal.tsx`:

```typescript
const fuse = new Fuse(entries, {
  keys: ['title', 'description', 'content'],
  threshold: 0.3,  // Lower = stricter matching
  minMatchCharLength: 2,
});
```

## Version Management

Add a new version:

1. Create `content/v3/` folder
2. Add content files
3. Update `docs.config.json`:

```json
{
  "versions": ["v1", "v2", "v3"],
  "defaultVersion": "v3"
}
```

## Deployment Customization

### Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_GITHUB_REPO=https://github.com/org/repo
NEXT_PUBLIC_SITE_URL=https://docs.example.com
```

### Build Optimization

In `next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  poweredByHeader: false,
};
```

## Best Practices

1. **Maintain consistency**, Use consistent colors throughout
2. **Test in dark mode**, Ensure dark mode looks good
3. **Mobile first**, Design for mobile, then scale up
4. **Accessibility**, Ensure sufficient color contrast
5. **Performance**, Optimize images and assets
6. **Branding**, Reflect your organization's identity

## Common Customizations

### Change Primary Color

1. Find all occurrences of `blue-600` in CSS
2. Replace with your color (e.g., `indigo-600`)
3. Update dark mode variant (`dark:blue-400` → `dark:indigo-400`)

### Add Custom Font

1. Import in `globals.css` via Google Fonts
2. Set in html/body font-family
3. Update Tailwind config if needed

### Increase Sidebar Width

1. Edit `src/components/Sidebar.tsx`
2. Change `w-64` to desired width
3. Adjust breakpoints in other components

## Next Steps

- Customize colors to match your brand
- Add your logo and favicon
- Configure GitHub integration
- Deploy to production

Happy customizing!
