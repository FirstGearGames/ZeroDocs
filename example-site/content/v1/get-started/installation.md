---
title: "Installation Guide"
description: "Step-by-step installation instructions for the documentation site"
---

# Installation Guide

This guide walks you through installing and setting up the documentation site on your local machine.

## Step 1: Clone or Extract the Project

First, clone the repository or extract the project folder:

```bash
git clone https://github.com/your-org/your-repo.git docs-site
cd docs-site
```

Or if you have a zip file:

```bash
unzip docs-site.zip
cd docs-site
```

## Step 2: Install Dependencies

Install all required npm packages:

```bash
npm install
```

This will install:

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Unified markdown processors
- And all other dependencies

## Step 3: Run Development Server

Start the development server:

```bash
npm run dev
```

You should see output like:

```
> next dev

  ▲ Next.js 14.2.5
  - Local:        http://localhost:3000
  - Environments: .env.local

✓ Ready in 2.4s
```

## Step 4: Open in Browser

Navigate to http://localhost:3000/docs in your web browser. You should see the documentation homepage.

## Step 5: Start Editing Content

Edit the Markdown files in `content/v1/` to customize your documentation:

```bash
content/
└── v1/
    ├── index.md                 # Homepage
    ├── get-started/
    │   ├── index.md
    │   └── installation.md      # This file
    ├── guides/
    │   └── index.md
    └── manuals/
        └── index.md
```

## Troubleshooting

### Port Already in Use

If port 3000 is already in use:

```bash
npm run dev -- -p 3001
```

Then visit http://localhost:3001/docs

### Dependencies Not Installing

Try clearing npm cache and reinstalling:

```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors

If you see TypeScript errors, run:

```bash
npm run build
```

This will show you all type errors. Fix them before deploying.

### Module Not Found

Ensure you're in the correct directory:

```bash
pwd  # Check current directory
cd /path/to/docs-site
npm install
npm run dev
```

## What's Next?

Once you have the development server running:

1. **Add Content**, Create new Markdown files in `content/v1/`
2. **Customize**, Edit `docs.config.json` to change site settings
3. **Style**, Modify `src/app/globals.css` for custom styles
4. **Deploy**, Build and deploy using Vercel, Netlify, or your own server

## Build for Production

To create an optimized production build:

```bash
npm run build
npm start
```

## Environment Variables

Create a `.env.local` file in the project root if you need environment variables:

```env
# Example environment variables
NEXT_PUBLIC_GITHUB_REPO=https://github.com/your-org/your-repo
NEXT_PUBLIC_DOCS_URL=https://docs.example.com
```

## System Information

To check your environment:

```bash
node --version    # Should be 16.x or higher
npm --version     # Should be 7.x or higher
```

## Getting Help

If you encounter issues:

1. Check the console for error messages
2. Review the logs in terminal
3. Check GitHub issues
4. Ask for help in the community

Congratulations! Your documentation site is now set up and running. Head to the next page to learn about creating and organizing content.
