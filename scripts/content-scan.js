#!/usr/bin/env node
'use strict';
/**
 * Content tripwire, an advisory scan for a content folder (this repo's
 * example-site, or a separate content repo that pulls the engine in).
 *
 * The renderer already neutralizes hostile content (see test/security-test.js),
 * so this does NOT gate a merge. It surfaces, for a human reviewer, the lines
 * of a pull request that contain constructs the renderer will defang, an
 * inline <script>, an event handler, a javascript: URL, a </style> breakout,
 * a raw <iframe>, a url(javascript:), so an unusual edit gets a second look.
 * Matches inside fenced code blocks are ignored, because documentation
 * legitimately shows these in examples.
 *
 * Usage:  node scripts/content-scan.js [contentDir]   (default: ./content, else cwd)
 *         --strict   exit non-zero if anything is flagged (opt-in for CI)
 * Exit:   0 normally (advisory); 1 only with --strict and at least one hit.
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2).filter(a => a !== '--strict');
const strict = process.argv.includes('--strict');
const target = path.resolve(args[0] || (fs.existsSync('content') ? 'content' : '.'));

const PATTERNS = [
  { re: /<\s*script\b/i, label: 'inline <script>' },
  { re: /<\s*\/\s*script\b/i, label: '</script>' },
  { re: /\son[a-z]+\s*=\s*["']?[^"'\s>]/i, label: 'inline event handler (on…=)' },
  { re: /javascript:/i, label: 'javascript: URL' },
  { re: /vbscript:/i, label: 'vbscript: URL' },
  { re: /data:text\/html/i, label: 'data:text/html URL' },
  { re: /<\s*\/\s*style\b/i, label: '</style> (possible breakout)' },
  { re: /<\s*iframe\b/i, label: 'raw <iframe>' },
  { re: /url\s*\(\s*["']?\s*(?:javascript|data:text)/i, label: 'url(javascript:/data:text)' },
  { re: /expression\s*\(/i, label: 'CSS expression()' },
];

/** Collect .md / .json files under a directory. */
function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.git') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(md|markdown|json)$/i.test(e.name)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(target)) {
  const text = fs.readFileSync(file, 'utf8');
  const isMd = /\.(md|markdown)$/i.test(file);
  let inFence = false;
  text.split('\n').forEach((line, i) => {
    if (isMd && /^\s{0,3}(```|~~~)/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;                                  // examples in code fences are fine
    for (const { re, label } of PATTERNS) {
      if (re.test(line)) findings.push({ file: path.relative(target, file), line: i + 1, label, text: line.trim().slice(0, 120) });
    }
  });
}

if (!findings.length) {
  console.log(`  ✓ content-scan: no flagged constructs under ${target}`);
  process.exit(0);
}

console.log(`  ⚠ content-scan: ${findings.length} construct(s) flagged for review under ${target}`);
console.log(`    (the renderer neutralizes these; confirm each edit is intentional)\n`);
for (const f of findings) console.log(`    ${f.file}:${f.line}  [${f.label}]  ${f.text}`);
console.log('');
process.exit(strict ? 1 : 0);
