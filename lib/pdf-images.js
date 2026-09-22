'use strict';
/**
 * Remote image fetch + PDF-embeddable decoding, for the PDF export
 * (lib/pdf.js). Covers the two formats the real corpus is actually built
 * from: JPEG (embedded as raw DCTDecode bytes, no re-encoding needed) and
 * PNG (fully decoded - chunks parsed, zlib-inflated, per-scanline
 * unfiltered - then re-deflated as a plain image, with alpha split into a
 * separate SMask XObject when present).
 *
 * ponytail: WEBP/GIF/SVG are not decoded (a handful of GitBook uploads in
 * the real content vs. ~90% PNG/JPEG); lib/pdf.js falls back to a text
 * placeholder for those. Add a decoder if that gap turns out to matter.
 *
 * SECURITY: this repo takes public PRs, so an `![]()` URL in page Markdown
 * is attacker-influenceable input to a build-time network fetch - the same
 * "content is untrusted" posture the rest of the engine is hardened for
 * (see lib/util.js safeUrl, lib/directives.js scrubHtml). Hardened here
 * against:
 *   - SSRF: a custom dns `lookup` validates every resolved address (and
 *     every redirect hop) is a public IP before connecting, and pins the
 *     TCP connection to that exact address (no check-then-connect gap for
 *     a DNS answer to change between validation and use).
 *   - Decompression bombs: a PNG's claimed dimensions are checked before
 *     inflating, and zlib's own maxOutputLength caps the actual output
 *     regardless of what the header claims.
 *   - Unbounded downloads: a byte cap and a timeout on every request.
 */

const https = require('https');
const http = require('http');
const dns = require('dns');
const zlib = require('zlib');
const { URL } = require('url');
const { safeUrl } = require('./util');

const MAX_BYTES = 12 * 1024 * 1024;   // 12 MB per image, generous for a doc screenshot
const MAX_PIXELS = 40_000_000;        // guards a PNG header lying about its own size
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const CONCURRENCY = 6;

// ── SSRF-hardened fetch ──────────────────────────────────────────────────────

function isPrivateAddress(address, family) {
  if (family === 4) {
    const p = address.split('.').map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0
      || (p[0] === 169 && p[1] === 254)
      || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
      || (p[0] === 192 && p[1] === 168);
  }
  const a = address.toLowerCase();
  if (a === '::1' || a === '::') return true;
  if (a.startsWith('::ffff:')) return isPrivateAddress(a.slice(7), 4); // IPv4-mapped
  return /^fe[89ab][0-9a-f]:/.test(a) || /^f[cd][0-9a-f]{2}:/.test(a); // link-local / unique-local
}

/**
 * dns.lookup replacement: resolves, rejects any private/loopback/link-local
 * result, else hands back a validated address. Node's http(s) client calls
 * this with `options.all: true` under Happy Eyeballs (parallel connection
 * attempts across addresses) and then expects the FULL array back, same as
 * dns.lookup's own `all` contract - returning a single address in that case
 * makes Node's internal handling choke on "Invalid IP address: undefined".
 */
function safeLookup(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  const wantAll = !!options.all;
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    const bad = list.find(a => isPrivateAddress(a.address, a.family));
    if (bad) return callback(new Error(`refusing private address ${bad.address}`));
    if (!list.length) return callback(new Error('no address resolved'));
    if (wantAll) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

/** GET `url` -> Buffer. Redirects are followed manually so each hop gets the same validation. */
function fetchBytes(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch { return reject(new Error('malformed url')); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return reject(new Error('unsupported scheme'));
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(url, { lookup: safeLookup, timeout: TIMEOUT_MS, headers: { 'User-Agent': 'zerodocs-pdf-export' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(fetchBytes(new URL(res.headers.location, url).toString(), redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_BYTES) { req.destroy(new Error('image too large')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

// ── JPEG: passed through as raw DCTDecode bytes, only its header is read ───

function jpegInfo(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i + 4 <= buf.length && buf[i] === 0xFF) {
    const marker = buf[i + 1];
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { i += 2; continue; }
    if (marker === 0xD9) break; // EOI
    const len = buf.readUInt16BE(i + 2);
    const isSOF = marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC;
    if (isSOF) {
      return { precision: buf[i + 4], height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), components: buf[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}

function embedJpeg(buf) {
  const info = jpegInfo(buf);
  if (!info || info.precision !== 8 || (info.components !== 1 && info.components !== 3)) return null; // CMYK/12-bit: out of scope
  return { width: info.width, height: info.height, colorSpace: info.components === 1 ? '/DeviceGray' : '/DeviceRGB', filter: '/DCTDecode', data: buf, smaskData: null };
}

// ── PNG: fully decoded (chunks, inflate, per-scanline unfilter), re-deflated ─

function parsePngChunks(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(sig)) return null;
  const chunks = [];
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    if (pos + 8 + len > buf.length) break;
    chunks.push({ type, data: buf.subarray(pos + 8, pos + 8 + len) });
    pos += 12 + len; // length(4) + type(4) + data(len) + crc(4)
    if (type === 'IEND') break;
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Reverse PNG's per-scanline filtering (None/Sub/Up/Average/Paeth) into raw pixel bytes. */
function unfilterScanlines(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[pos++];
    const row = y * stride, prevRow = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const raw_x = raw[pos++];
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[prevRow + x] : 0;
      const c = y > 0 && x >= bpp ? out[prevRow + x - bpp] : 0;
      let v;
      switch (filterType) {
        case 1: v = raw_x + a; break;
        case 2: v = raw_x + b; break;
        case 3: v = raw_x + ((a + b) >> 1); break;
        case 4: v = raw_x + paeth(a, b, c); break;
        default: v = raw_x;
      }
      out[row + x] = v & 0xFF;
    }
  }
  return out;
}

const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function embedPng(buf) {
  const chunks = parsePngChunks(buf);
  if (!chunks) return null;
  const ihdr = chunks.find(c => c.type === 'IHDR');
  if (!ihdr || ihdr.data.length < 13) return null;

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  // 16-bit and interlaced (Adam7) PNGs are out of scope; both are rare for a
  // web screenshot. Dimension check guards a header lying about its own size
  // before the (potentially much larger) inflate ever runs.
  if (bitDepth !== 8 || interlace !== 0 || channels === undefined || width * height > MAX_PIXELS) return null;

  const idat = Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data));
  let raw;
  try { raw = zlib.inflateSync(idat, { maxOutputLength: height * (width * channels + 1) + 1024 }); }
  catch { return null; }

  const pixels = unfilterScanlines(raw, width, height, channels);
  const n = width * height;
  let colorBytes, alphaBytes = null, baseChannels;

  if (colorType === 3) {
    const plte = chunks.find(c => c.type === 'PLTE');
    if (!plte) return null;
    const trns = chunks.find(c => c.type === 'tRNS');
    colorBytes = Buffer.alloc(n * 3);
    if (trns) alphaBytes = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      const idx = pixels[i];
      colorBytes[i * 3] = plte.data[idx * 3]; colorBytes[i * 3 + 1] = plte.data[idx * 3 + 1]; colorBytes[i * 3 + 2] = plte.data[idx * 3 + 2];
      if (alphaBytes) alphaBytes[i] = idx < trns.data.length ? trns.data[idx] : 255;
    }
    baseChannels = 3;
  } else if (colorType === 0) { colorBytes = pixels; baseChannels = 1; }
  else if (colorType === 2) { colorBytes = pixels; baseChannels = 3; }
  else if (colorType === 4) {
    colorBytes = Buffer.alloc(n); alphaBytes = Buffer.alloc(n);
    for (let i = 0; i < n; i++) { colorBytes[i] = pixels[i * 2]; alphaBytes[i] = pixels[i * 2 + 1]; }
    baseChannels = 1;
  } else { // colorType 6: RGBA
    colorBytes = Buffer.alloc(n * 3); alphaBytes = Buffer.alloc(n);
    for (let i = 0; i < n; i++) {
      colorBytes[i * 3] = pixels[i * 4]; colorBytes[i * 3 + 1] = pixels[i * 4 + 1]; colorBytes[i * 3 + 2] = pixels[i * 4 + 2];
      alphaBytes[i] = pixels[i * 4 + 3];
    }
    baseChannels = 3;
  }

  return {
    width, height,
    colorSpace: baseChannels === 1 ? '/DeviceGray' : '/DeviceRGB',
    filter: '/FlateDecode',
    data: zlib.deflateSync(colorBytes),
    smaskData: alphaBytes ? zlib.deflateSync(alphaBytes) : null,
  };
}

/** Decode already-downloaded bytes; format is sniffed from magic bytes, not the URL. */
function embedImageBytes(buf) {
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xD8) return embedJpeg(buf);
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return embedPng(buf);
  return null; // WEBP/GIF/SVG/unknown: caller falls back to a text placeholder
}

/** Fetch + decode one image URL. Never throws: any failure just means no image (caller falls back). */
async function loadImage(url) {
  const href = safeUrl(url);
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    const bytes = await fetchBytes(href);
    return embedImageBytes(bytes);
  } catch {
    return null;
  }
}

/** Load every url in `urls` (deduped by the caller), at most CONCURRENCY in flight. Returns Map<url, info|null>. */
async function loadImages(urls) {
  const map = new Map();
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      map.set(url, await loadImage(url));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return map;
}

module.exports = { loadImage, loadImages, embedImageBytes, embedJpeg, embedPng, jpegInfo, isPrivateAddress, safeLookup };
