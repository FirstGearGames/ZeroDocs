#!/usr/bin/env node
/**
 * ZeroDocs, Free, zero-dependency documentation software.
 * Uses ONLY Node.js built-ins. No npm install required. Works fully offline.
 *
 * A "site" is any folder that contains:
 *   content/           one sub-folder per version (v1, v2, …) of Markdown pages
 *   docs.config.json   title, theme, nav, versions, GitHub edit links
 *   static/            images and other assets served under /static/
 *
 * This engine is never edited to build a site, you point it at a site
 * folder instead. The site root is resolved, in order, from:
 *   1. the DOCS_ROOT environment variable
 *   2. the first command-line argument       (node preview-server.js <siteDir>)
 *   3. the current working directory          (cd my-site && node …/preview-server.js)
 *
 * Run:   DOCS_ROOT=./example-site node preview-server.js
 *        node preview-server.js ./example-site
 *        cd example-site && node ../preview-server.js
 * Open:  http://localhost:3001
 *
 * Environment:
 *   PORT   listen port (default 3001)
 *   HOST   bind address (default 127.0.0.1; set 0.0.0.0 to expose on the LAN)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const { createSite } = require('./lib/site');
const { createDocsServer } = require('./lib/server');
const { checkLinks } = require('./lib/content');

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '127.0.0.1';

const site = createSite();
const pkg = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')); } catch { return {}; }
})();

const { server, watcherArmed } = createDocsServer(site, {
  engineDir: __dirname,
  engineVersion: pkg.version || 'dev',
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✖ Port ${PORT} is already in use. Set another with PORT=<port>.\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const config = site.loadConfig();
  const versions = site.versions(config);
  console.log('');
  console.log(`  📚 ZeroDocs v${pkg.version || 'dev'}`);
  console.log('');
  console.log(`  → Site:        ${site.root}`);
  console.log(`  → Local:       http://localhost:${PORT}/docs`);
  console.log(`  → Versions:    ${versions.join(', ')}`);
  console.log(`  → Live reload: ${watcherArmed() ? 'on' : 'unavailable on this platform'}`);
  if (HOST !== '127.0.0.1') console.log(`  ⚠  Bound to ${HOST}, the site is reachable from other machines.`);
  console.log('');
  if (!fs.existsSync(site.contentDir)) {
    console.log('  ⚠  No content/ folder found under the site root above.');
    console.log('     Point the engine at your site with DOCS_ROOT=/path/to/site');
    console.log('     (or pass it as the first argument), or cd into the site first.');
    console.log('');
  } else {
    const warnings = checkLinks(site, config);
    if (warnings.length) {
      console.log(`  ⚠  ${warnings.length} broken internal link${warnings.length === 1 ? '' : 's'}:`);
      warnings.slice(0, 10).forEach(w => console.log(`     ${w}`));
      if (warnings.length > 10) console.log(`     … and ${warnings.length - 10} more`);
      console.log('');
    }
  }
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
