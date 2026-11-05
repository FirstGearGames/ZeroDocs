#!/usr/bin/env node
'use strict';

// Execute the real client with controlled HTTP completion order. The small DOM
// model covers metadata/navigation state, not layout or browser rendering.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { renderShell } = require('../lib/shell');
const clientSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function createClient(route = '/docs/v1/first', staticMode = true, deferBootstrap = false) {
  const elements = new Map();
  const windowEvents = new Map();
  const requests = [];
  const bootstrapRequests = [];
  let events;
  const location = new URL(route, 'http://docs.test');
  const boot = { config: { title: 'Test docs' }, versions: ['v1'], staticMode };
  const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  function element(tagName, id = '') {
    const attrs = new Map();
    const classes = new Set();
    const el = {
      tagName: tagName.toUpperCase(), id, style: {}, textContent: '',
      classList: {
        contains: value => classes.has(value),
        add: value => classes.add(value),
        remove: value => classes.delete(value),
        toggle(value, force) {
          const enabled = force === undefined ? !classes.has(value) : force;
          if (enabled) classes.add(value); else classes.delete(value);
          return enabled;
        },
      },
      setAttribute: (name, value) => attrs.set(name, String(value)),
      getAttribute: name => attrs.get(name) ?? null,
      removeAttribute: name => attrs.delete(name),
      addEventListener() {}, focus() {}, querySelectorAll: () => [], querySelector: () => null,
      appendChild(child) { if (child.id) elements.set(child.id, child); },
      remove() { if (elements.get(el.id) === el) elements.delete(el.id); },
      set innerHTML(html) { this.html = html; registerIds(html); },
      get innerHTML() { return this.html || ''; },
    };
    return el;
  }
  function registerIds(html) {
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
      const id = match[2].match(/\bid="([^"]+)"/);
      if (!id) continue;
      const el = element(match[1], id[1]);
      for (const attr of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(attr[1], decode(attr[2]));
      elements.set(el.id, el);
    }
  }
  const page = route.startsWith('/docs/v1/') ? { title: 'First', version: 'v1', slug: 'first' } : null;
  registerIds(renderShell({ ...boot, page }));
  const document = {
    title: '', head: element('head'), body: element('body'), documentElement: element('html'),
    getElementById: id => elements.get(id) || null,
    createElement: tag => element(tag),
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
  };
  const window = {
    __DOCS__: boot, scrollY: 0, scrollTo() {},
    addEventListener(name, fn) { windowEvents.set(name, fn); },
    removeEventListener() {},
  };
  vm.runInNewContext(clientSource, {
    window, document, location, navigator: { platform: '' },
    localStorage: { getItem: () => null, setItem() {} },
    history: { pushState(_state, _title, href) { location.href = new URL(href, location).href; } },
    requestAnimationFrame() {}, setTimeout, clearTimeout, console,
    EventSource: class { constructor() { events = this; } },
    fetch(url) {
      if (url.includes('/doc/') || url.startsWith('/api/doc?')) {
        return new Promise(resolve => requests.push({ url, resolve }));
      }
      if (deferBootstrap) return new Promise(resolve => bootstrapRequests.push(resolve));
      return Promise.resolve({ ok: true, json: async () => [] });
    },
  }, { filename: 'assets/app.js' });
  return {
    requests, document,
    alternate: () => elements.get('markdown-source')?.getAttribute('href') ?? null,
    navigate(next) { location.href = new URL(next, location).href; windowEvents.get('popstate')(); },
    refresh() { events.onmessage({ data: JSON.stringify({ type: 'content' }) }); },
    finishBootstrap(start = 0, end = bootstrapRequests.length) {
      for (const resolve of bootstrapRequests.slice(start, end)) resolve({ ok: true, json: async () => [] });
    },
  };
}

function complete(request, slug, status = 200) {
  request.resolve({
    ok: status === 200, status,
    json: async () => ({ title: slug, version: 'v1', slug, html: `<p>${slug}</p>` }),
  });
}

async function main() {
  let passed = 0;
  const failures = [];
  const check = async (name, run) => {
    try { await run(); passed++; } catch (err) { failures.push(`${name}: ${err.message}`); }
  };

  await check('navigation clears the previous alternate while loading', async () => {
    const client = createClient();
    await flush();
    complete(client.requests[0], 'first');
    await flush();
    assert.equal(client.alternate(), '/data/v1/raw/first.md');
    client.navigate('/docs/v1/second');
    assert.equal(client.alternate(), null);
    complete(client.requests[1], 'second');
    await flush();
    assert.equal(client.alternate(), '/data/v1/raw/second.md');
  });

  for (const staleStatus of [200, 404]) {
    await check(`a stale ${staleStatus} response cannot replace the current page`, async () => {
      const client = createClient();
      await flush();
      client.navigate('/docs/v1/second');
      complete(client.requests[1], 'second');
      await flush();
      assert.equal(client.alternate(), '/data/v1/raw/second.md');
      complete(client.requests[0], 'first', staleStatus);
      await flush();
      assert.equal(client.alternate(), '/data/v1/raw/second.md');
      assert.equal(client.document.title, 'second | Test docs');
    });
  }

  await check('a missing current page stays missing after an older success', async () => {
    const client = createClient();
    await flush();
    client.navigate('/docs/v1/missing');
    complete(client.requests[1], 'missing', 404);
    await flush();
    complete(client.requests[0], 'first');
    await flush();
    assert.equal(client.alternate(), null);
    assert.equal(client.document.title, 'Page not found | Test docs');
  });

  await check('late bootstrap completion cannot reload the initial route after navigation', async () => {
    const client = createClient('/docs/v1/first', true, true);
    await flush();
    assert.equal(client.requests.length, 0);
    client.navigate('/docs/v1/second');
    complete(client.requests[0], 'second');
    await flush();
    assert.equal(client.alternate(), '/data/v1/raw/second.md');
    client.finishBootstrap();
    await flush();
    assert.equal(client.requests.length, 1);
    assert.equal(client.alternate(), '/data/v1/raw/second.md');
    assert.equal(client.document.title, 'second | Test docs');
  });

  await check('an early live refresh loads the requested slug before bootstrap finishes', async () => {
    const client = createClient('/docs/v1/first', false, true);
    await flush();
    client.refresh();
    client.finishBootstrap(2);
    await flush();
    assert.equal(client.requests.length, 1);
    assert.equal(client.requests[0].url, '/api/doc?version=v1&slug=first');
    complete(client.requests[0], 'first');
    await flush();
    client.finishBootstrap(0, 2);
    await flush();
    assert.equal(client.requests.length, 1);
    assert.equal(client.alternate(), '/api/raw?version=v1&slug=first');
    assert.equal(client.document.title, 'first | Test docs');
  });

  for (const staticMode of [true, false]) {
    await check(`${staticMode ? 'static' : 'live'} initial unknown version never loads the default page`, async () => {
      const client = createClient('/docs/v9/first', staticMode);
      await flush();
      assert.equal(client.requests.length, 1);
      assert.ok(client.requests[0].url.includes('v9'), client.requests[0].url);
      complete(client.requests[0], 'first', 404);
      await flush();
      assert.equal(client.alternate(), null);
    });
  }

  await check('a silent same-page refresh retains its alternate until failure', async () => {
    const client = createClient('/docs/v1/first', false);
    await flush();
    complete(client.requests[0], 'first');
    await flush();
    assert.equal(client.alternate(), '/api/raw?version=v1&slug=first');
    client.refresh();
    await flush();
    assert.equal(client.alternate(), '/api/raw?version=v1&slug=first');
    complete(client.requests[1], 'first', 404);
    await flush();
    assert.equal(client.alternate(), null);
  });

  console.log(`\n  Client navigation suite: ${passed}/${passed + failures.length} passed`);
  for (const failure of failures) console.error(`  FAIL: ${failure}`);
  if (failures.length) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
