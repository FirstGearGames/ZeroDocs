#!/usr/bin/env node
'use strict';
/**
 * PDF export for a ZeroDocs site: one <version>.pdf per configured version,
 * plus latest.pdf (a copy of the default version) so the nav's download link
 * never has to change when a new version becomes default.
 *
 * Unlike build-static.js this writes into the site's own static/ folder, not
 * the disposable out/ build directory: static/ is checked into the content
 * repo, so the PDF persists between builds and a plain `npm run build`
 * (Cloudflare's per-PR/production build command) never has to regenerate it.
 * Regeneration is a separate, deliberately-triggered step - see this
 * repo's own site's build-pdf npm script and, for a content repo taking
 * public PRs, a debounced CI job that commits the result back.
 *
 * Site root:  DOCS_ROOT env / first CLI arg / cwd   (see lib/site.js)
 * Output:     <root>/static/downloads/<version>.pdf, .../latest.pdf
 */

const fs = require('fs');
const path = require('path');

const { createSite } = require('./lib/site');
const contentLib = require('./lib/content');
const { renderVersionPdf } = require('./lib/pdf');

async function build() {
  const site = createSite();
  const config = site.loadConfig();
  const versions = site.versions(config);
  const defaultVersion = site.defaultVersion(config);

  if (!fs.existsSync(site.contentDir)) {
    console.error(`  ✖ No content/ folder under ${site.root}. Set DOCS_ROOT to your site.`);
    process.exit(1);
  }

  const outDir = path.join(site.staticDir, 'downloads');
  fs.mkdirSync(outDir, { recursive: true });

  for (const v of versions) {
    const buf = await renderVersionPdf(site, config, v, contentLib.listPages);
    fs.writeFileSync(path.join(outDir, `${v}.pdf`), buf);
    if (v === defaultVersion) fs.writeFileSync(path.join(outDir, 'latest.pdf'), buf);
    console.log(`  ✓ ${v}.pdf  (${(buf.length / 1024).toFixed(0)} KB)`);
  }

  console.log('');
  console.log(`  → Site:    ${site.root}`);
  console.log(`  → Output:  ${outDir}`);
  console.log(`  → latest.pdf = ${defaultVersion}`);
  console.log('');
}

build().catch(err => { console.error(err); process.exit(1); });
