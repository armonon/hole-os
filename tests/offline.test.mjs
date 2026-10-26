import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildOffline } from '../scripts/offline-build.mjs';

const template = await readFile(new URL('../src/service-worker.js', import.meta.url), 'utf8');
const clientSource = await readFile(new URL('../src/offline.js', import.meta.url), 'utf8');
const origin = 'https://hole.example';
const hash = value => createHash('sha256').update(value).digest('hex');
function manifest(version, content) { return { version, bytes: Object.values(content).reduce((n, v) => n + Buffer.byteLength(v), 0), assets: Object.entries(content).map(([path, data]) => ({ path, bytes: Buffer.byteLength(data), hash: hash(data) })) }; }
function cachesFixture() {
  const entries = new Map(), key = request => typeof request === 'string' ? new URL(request, origin).pathname : new URL(request.url).pathname;
  return { entries, async open(name) { if (!entries.has(name)) entries.set(name, new Map()); const cache = entries.get(name); return { async put(request, response) { cache.set(key(request), response.clone()); }, async match(request) { return cache.get(key(request))?.clone(); } }; }, async keys() { return [...entries.keys()]; }, async delete(name) { return entries.delete(name); } };
}
function worker({ version, content, network = content, caches = cachesFixture(), clients = [], clock, activationFailure = false }) {
  const handlers = new Map(); let activated = 0, networkReads = 0;
  const self = { location: { origin }, clients: { matchAll: async () => clients }, addEventListener(type, handler) { handlers.set(type, handler); }, async skipWaiting() { if (activationFailure) throw new Error('Activation rejected'); activated++; } };
  const context = { self, caches, Request, Response, URL, Uint8Array, Set, Map, Promise, Error, crypto, setTimeout: clock?.setTimeout || setTimeout, clearTimeout: clock?.clearTimeout || clearTimeout, fetch: async request => { networkReads++; const value = network[new URL(request.url).pathname]; if (value instanceof Error) throw value; return new Response(value ?? 'not found', { status: value === undefined ? 404 : 200 }); } };
  vm.runInNewContext(template.replace('/*__HOLE_CACHE_MANIFEST__*/ null', JSON.stringify(manifest(version, content))), context);
  return {
    caches, get activated() { return activated; }, get networkReads() { return networkReads; },
    async lifecycle(type) { let promise; handlers.get(type)({ waitUntil(value) { promise = value; } }); await promise; },
    async fetch(path, { navigation = false, clientId = 'client', resultingClientId = '' } = {}) { let promise; handlers.get('fetch')({ request: { url: origin + path, method: 'GET', mode: navigation ? 'navigate' : 'cors' }, clientId, resultingClientId, respondWith(value) { promise = value; } }); return promise; },
    message(data, options = {}) { let promise; handlers.get('message')({ data, source: { id: options.clientId || 'client' }, ports: options.port ? [options.port] : [], waitUntil(value) { promise = value; } }); return promise; }
  };
}
function testClock() {
  const timers = new Map(); let next = 0;
  return { setTimeout(fn, ms) { const id = ++next; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, fire(ms) { for (const [id, task] of timers) if (task.ms === ms) { timers.delete(id); task.fn(); } } };
}
async function client({ inert = false, finishEditing = async () => true, beforeLeave = async () => true, flush = async () => {} } = {}) {
  const swHandlers = new Map(), domHandlers = new Map(), clock = testClock(), replies = []; let reloads = 0;
  const root = { inert }, body = node();
  function node() { const children = [], handlers = new Map(); return { children, handlers, setAttribute() {}, addEventListener(type, handler) { handlers.set(type, handler); }, append(...nodes) { children.push(...nodes); }, contains(target) { return target === this || children.some(n => n.contains?.(target)); } }; }
  const source = { postMessage(data) { replies.push(data); } };
  const document = { createElement: node, body, getElementById: () => root, querySelector: () => null, addEventListener(type, handler) { domHandlers.set(type, handler); } };
  const serviceWorker = { addEventListener(type, handler) { swHandlers.set(type, handler); }, async register() { return { waiting: source, addEventListener() {} }; } };
  const window = { isSecureContext: true, addEventListener() {}, HoleContinuity: { finishEditing }, HoleExtensions: { beforeLeave }, HolePersistence: { flush, status: { state: 'saved' } } };
  vm.runInNewContext(clientSource, { navigator: { serviceWorker }, document, window, location: { hostname: 'hole.example', search: '', reload() { reloads++; } }, URL, URLSearchParams, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  await new Promise(resolve => setImmediate(resolve));
  return { root, body, bar: body.children[0], replies, clock, get reloads() { return reloads; }, message(data) { return swHandlers.get('message')({ data, source }); }, controllerChange() { swHandlers.get('controllerchange')(); }, interaction(type, target = root) { const event = { target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }; domHandlers.get(type)?.(event); return event; } };
}

test('all assets are verified before a ready marker and installation never auto-activates', async () => {
  const w = worker({ version: 'one', content: { '/index.html': 'HTML 1', '/assets/a.js': 'JS 1' } });
  await w.lifecycle('install'); await w.lifecycle('activate');
  const cache = await w.caches.open('hole-shell-one');
  assert.ok(await cache.match('/__hole_offline_ready__'));
  assert.equal(w.activated, 0);
  assert.equal(await (await w.fetch('/', { navigation: true })).text(), 'HTML 1');
  assert.equal(await (await w.fetch('/assets/a.js')).text(), 'JS 1');
});

test('mixed deployment hashes and failed fetches reject new installation while old work shell remains', async () => {
  const caches = cachesFixture(), old = worker({ version: 'old', content: { '/index.html': 'old', '/assets/a.js': 'old js' }, caches }); await old.lifecycle('install');
  const changed = worker({ version: 'new', content: { '/index.html': 'new', '/assets/a.js': 'new js' }, network: { '/index.html': 'new', '/assets/a.js': 'unexpected future js' }, caches });
  await assert.rejects(changed.lifecycle('install'), /changed during/);
  assert.equal(caches.entries.has('hole-shell-new'), false);
  assert.equal(await (await old.fetch('/', { navigation: true })).text(), 'old');
  const failed = worker({ version: 'failed', content: { '/index.html': 'new' }, network: { '/index.html': new Error('Offline') }, caches });
  await assert.rejects(failed.lifecycle('install'), /Offline/);
  assert.equal(caches.entries.has('hole-shell-old'), true);
  const rollback = worker({ version: 'old', content: { '/index.html': 'old', '/assets/a.js': 'old js' }, network: { '/index.html': new Error('Offline') }, caches });
  await assert.rejects(rollback.lifecycle('install'), /Offline/);
  assert.equal(await (await old.fetch('/', { navigation: true })).text(), 'old', 'a failed same-version reinstall cannot remove the previous valid shell');
});

test('loopback skips offline registration unless explicitly opted in and unregisters only the old Hole worker', async () => {
  async function run(hostname, search = '') {
    let registrations = 0, unregisteredHole = 0, unregisteredOther = 0;
    const node = () => ({ setAttribute() {}, addEventListener() {}, append() {} });
    const serviceWorker = {
      async getRegistrations() { return [{ active: { scriptURL: 'http://' + hostname + '/service-worker.js' }, async unregister() { unregisteredHole++; } }, { active: { scriptURL: 'http://' + hostname + '/other-app/sw.js' }, async unregister() { unregisteredOther++; } }]; },
      async register() { registrations++; return { addEventListener() {} }; }, addEventListener() {}
    };
    vm.runInNewContext(clientSource, { navigator: { serviceWorker }, window: { isSecureContext: true, addEventListener() {} }, location: { hostname, search }, URL, URLSearchParams, document: { createElement: node, body: node(), addEventListener() {} } });
    await new Promise(resolve => setImmediate(resolve));
    return { registrations, unregisteredHole, unregisteredOther };
  }
  for (const host of ['localhost', 'studio.localhost', '127.0.0.1', '127.1.2.3', '[::1]']) assert.deepEqual(await run(host), { registrations: 0, unregisteredHole: 1, unregisteredOther: 0 });
  assert.deepEqual(await run('127.0.0.1', '?offline-test=1'), { registrations: 1, unregisteredHole: 0, unregisteredOther: 0 });
  assert.deepEqual(await run('hole.example'), { registrations: 1, unregisteredHole: 0, unregisteredOther: 0 });
});

test('an old document continues receiving its own release assets after activation of a new worker', async () => {
  const caches = cachesFixture(), old = worker({ version: 'old', content: { '/index.html': 'old page', '/assets/a.js': 'old js' }, caches });
  await old.lifecycle('install'); await old.fetch('/', { navigation: true, resultingClientId: 'old-tab' });
  const next = worker({ version: 'next', content: { '/index.html': 'new page', '/assets/a.js': 'new js' }, caches }); await next.lifecycle('install'); await next.lifecycle('activate');
  assert.equal(await (await next.fetch('/assets/a.js', { clientId: 'old-tab' })).text(), 'old js');
  assert.equal(await (await next.fetch('/', { navigation: true, resultingClientId: 'new-tab' })).text(), 'new page');
  assert.equal(await (await next.fetch('/assets/a.js', { clientId: 'new-tab' })).text(), 'new js');
});

test('missing cached assets fail closed and never substitute newer network bytes', async () => {
  const w = worker({ version: 'one', content: { '/index.html': 'HTML', '/assets/a.js': 'JS' } }); await w.lifecycle('install');
  w.caches.entries.get('hole-shell-one').delete('/assets/a.js'); const before = w.networkReads;
  assert.equal((await w.fetch('/assets/a.js')).status, 503); assert.equal(w.networkReads, before);
  assert.equal(await w.fetch('/api/private'), undefined, 'private provider responses are never cached');
});

test('update activates only after all open tabs acknowledge their saved work', async () => {
  let w, blocked = true; const cancelled = []; const clients = ['a', 'b'].map(id => ({ id, url: origin + '/', postMessage(message) { if (message.type === 'HOLE_UPDATE_CANCEL') { cancelled.push(id); return; } queueMicrotask(() => w.message({ type: 'HOLE_UPDATE_READY', requestId: message.requestId, ready: id !== 'b' || !blocked }, { clientId: id })); } }));
  w = worker({ version: 'one', content: { '/index.html': 'HTML' }, clients });
  let response; await w.message({ type: 'HOLE_ACTIVATE_REQUEST', requestId: 'first' }, { clientId: 'a', port: { postMessage(value) { response = value; } } });
  assert.equal(response.status, 'blocked'); assert.equal(w.activated, 0);
  assert.deepEqual(cancelled, ['a', 'b']);
  blocked = false; await w.message({ type: 'HOLE_ACTIVATE_REQUEST', requestId: 'second' }, { clientId: 'a', port: { postMessage(value) { response = value; } } });
  assert.equal(response.status, 'activating'); assert.equal(w.activated, 1);
});

test('updates lock typing before flushing, retain the lock after ACK, and keep update controls usable', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const c = await client({ flush: () => pending });
  const preparing = c.message({ type: 'HOLE_PREPARE_UPDATE', requestId: 'edit-lock' });
  assert.equal(c.root.inert, true, 'editing is paused before the asynchronous flush finishes');
  assert.equal(c.interaction('beforeinput').prevented, true);
  assert.equal(c.interaction('keydown', c.body).stopped, true, 'global shortcuts cannot alter the document after inert moves focus');
  assert.equal(c.interaction('pointerdown', c.bar.children[1]).prevented, false, 'the update bar remains usable');
  finish(); await preparing;
  assert.equal(c.replies.at(-1).ready, true); assert.equal(c.root.inert, true, 'editing remains locked while other tabs respond');
  c.controllerChange(); assert.equal(c.reloads, 1);
});

test('flush rejection restores the previous inert state and never acknowledges saved work', async () => {
  for (const inert of [false, true]) {
    const c = await client({ inert, flush: async () => { throw new Error('Quota exceeded'); } });
    await c.message({ type: 'HOLE_PREPARE_UPDATE', requestId: 'failed' });
    assert.equal(c.root.inert, inert); assert.equal(c.replies.at(-1).ready, false);
    c.controllerChange(); assert.equal(c.reloads, 0);
  }
});

test('matching cancellation unlocks editing; stale cancellation and late controller changes cannot discard new input', async () => {
  const c = await client();
  await c.message({ type: 'HOLE_PREPARE_UPDATE', requestId: 'current' });
  await c.message({ type: 'HOLE_UPDATE_CANCEL', requestId: 'older' }); assert.equal(c.root.inert, true);
  await c.message({ type: 'HOLE_UPDATE_CANCEL', requestId: 'current' }); assert.equal(c.root.inert, false);
  assert.equal(c.interaction('beforeinput').prevented, false);
  c.controllerChange(); assert.equal(c.reloads, 0);
  await c.message({ type: 'HOLE_PREPARE_UPDATE', requestId: 'timeout' });
  c.clock.fire(20000); assert.equal(c.root.inert, false); assert.equal(c.replies.at(-1).ready, false);
  c.controllerChange(); assert.equal(c.reloads, 0, 'timeout enables editing without permitting a late automatic reload');
});

test('cancellation during a pending flush cannot later acknowledge or relock the editor', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; }); const c = await client({ flush: () => pending });
  const preparing = c.message({ type: 'HOLE_PREPARE_UPDATE', requestId: 'pending' });
  await c.message({ type: 'HOLE_UPDATE_CANCEL', requestId: 'pending' }); assert.equal(c.root.inert, false);
  finish(); await preparing; assert.equal(c.replies.at(-1).ready, false); assert.equal(c.root.inert, false);
});

test('worker timeout and activation failure broadcast cancellation to every participating tab', async () => {
  for (const activationFailure of [false, true]) {
    const messages = [], clock = testClock(); let w;
    const clients = ['a', 'b'].map(id => ({ id, url: origin + '/', postMessage(message) { messages.push({ id, type: message.type }); if (activationFailure && message.type === 'HOLE_PREPARE_UPDATE') queueMicrotask(() => w.message({ type: 'HOLE_UPDATE_READY', requestId: message.requestId, ready: true }, { clientId: id })); } }));
    w = worker({ version: 'one', content: { '/index.html': 'HTML' }, clients, clock, activationFailure });
    let response; const activation = w.message({ type: 'HOLE_ACTIVATE_REQUEST', requestId: 'cancel' }, { clientId: 'a', port: { postMessage(value) { response = value; } } });
    await new Promise(resolve => setImmediate(resolve)); if (!activationFailure) clock.fire(12000); await activation;
    assert.equal(response.status, 'blocked'); assert.equal(w.activated, 0);
    assert.deepEqual(messages.filter(m => m.type === 'HOLE_UPDATE_CANCEL').map(m => m.id), ['a', 'b']);
  }
});

test('build manifest is deterministic, changes with source, and excludes duplicate worker registration paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hole-offline-')), pub = path.join(root, 'public'), src = path.join(root, 'src');
  try {
    await mkdir(path.join(pub, 'assets'), { recursive: true }); await mkdir(src);
    await writeFile(path.join(pub, 'index.html'), '<h1>Hole</h1>'); await writeFile(path.join(pub, 'assets', 'a.js'), 'version one'); await writeFile(path.join(pub, 'assets', 'service-worker.js'), 'unwanted duplicate');
    await writeFile(path.join(src, 'service-worker.js'), template);
    const first = await buildOffline(pub, src), repeated = await buildOffline(pub, src);
    assert.equal(first.version, repeated.version); assert.equal(first.assets.some(a => a.path.endsWith('service-worker.js')), false);
    const built = await readFile(path.join(pub, 'service-worker.js'), 'utf8'); assert.equal(built.includes('/*__HOLE_CACHE_MANIFEST__*/'), false);
    await writeFile(path.join(src, 'service-worker.js'), template + '\n// changed worker behavior');
    const changed = await buildOffline(pub, src); assert.notEqual(changed.version, first.version);
    await assert.rejects(readFile(path.join(pub, 'assets', 'service-worker.js')), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
