'use strict';
/**
 * A plain static file server over a build's output, the way a static host
 * serves it: a folder serves its index.html, a miss serves 404.html with a
 * 404. Shared by the site and browser suites. Zero dependencies.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.xml': 'application/xml',
  '.txt': 'text/plain', '.md': 'text/markdown',
};

/** Serve `root` on a free loopback port; resolves to the listening server. */
function serveStatic(root) {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(path.join(root, '404.html')));
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

module.exports = { serveStatic };
