import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
const source = await readFile(new URL('../src/universe.js', import.meta.url), 'utf8');
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  async emit(name, values = {}) { const event = { type: name, target: this, preventDefault() {}, stopPropagation() {}, ...values }; await Promise.all([...(this.listeners.get(name) || [])].map(fn => fn(event))); }
}
async function environment() {
  const document = new Target();
  class Element extends Target {
    constructor(tag) { super(); this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.style = { setProperty(key, value) { this[key] = value; } }; this.captured = new Set(); this.value = ''; }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
    insertBefore(node, before) { node.remove(); node.parentNode = this; this.children.splice(this.children.indexOf(before), 0, node); }
    before(node) { this.parentNode.insertBefore(node, this); }
    remove() { if (this.parentNode) { const children = this.parentNode.children; children.splice(children.indexOf(this), 1); this.parentNode = null; } }
    replaceChildren(...nodes) { for (const child of [...this.children]) child.remove(); this.append(...nodes); }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    get isConnected() { return this === document.body || !!this.parentNode?.isConnected; }
    get nodes() { return [this, ...this.children.flatMap(child => child.nodes)]; }
    querySelector(selector) { return this.nodes.find(node => selector.startsWith('.') ? node.className?.split(' ').includes(selector.slice(1)) : node.tagName === selector) || null; }
    closest() { return null; }
    getBoundingClientRect() { return { x: 0, y: 0, width: 1000, height: 440 }; }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); }
    focus() { document.activeElement = this; }
  }
  document.body = new Element('body'); document.createElement = tag => new Element(tag); document.hidden = false;
  const timers = new Map(); let timerId = 0; const window = new Target(), records = new Map(), errors = [];
  const scope = vm.createContext({ document, window, crypto: webcrypto, performance, CSS: { supports: () => true }, matchMedia: () => Object.assign(new Target(), { matches: false }), setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id), requestAnimationFrame: () => 1, cancelAnimationFrame() {}, MutationObserver: class { observe() {} disconnect() {} }, ResizeObserver: class { observe() {} disconnect() {} } });
  vm.runInContext(source, scope);
  const grid = new Element('div'), card = new Element('button'), name = new Element('strong'); card.dataset.assetId = 'asset'; card.dataset.placementId = 'placement'; name.textContent = 'Actual material'; card.append(name); grid.append(card); document.body.append(grid);
  const placement = { id: 'placement', revision: 1, sceneId: 'project', resourceId: 'asset', resourceType: 'asset', policy: 'latest', x: 120, y: 50, depth: -100 }; records.set('placements:placement', placement);
  const C = { get: async (type, id) => structuredClone(records.get(type + ':' + id) || null), put: async (type, value, options = {}) => { const key = type + ':' + value.id, current = records.get(key); if (current && current.revision !== options.expectedRevision) throw new Error('Conflict'); const saved = structuredClone({ ...value, revision: (current?.revision || 0) + 1 }); records.set(key, saved); return saved; } };
  const cleanup = await scope.HoleUniverse.mount(grid, { project: { id: 'project' }, placements: [placement], context: { C, H: { icons() {} }, navigate() {}, notify() {}, fail: cause => errors.push(cause) } });
  return { scope, document, window, grid, card, records, errors, cleanup, viewport: document.body.querySelector('.hu-viewport'), world: document.body.querySelector('.hu-world'), nodes: () => document.body.nodes };
}

for (const reason of ['pointercancel', 'lostpointercapture', 'escape', 'blur', 'hidden', 'unmount']) test(`Universe ${reason} restores a drag/pinch to the original camera`, async () => {
  const env = await environment(), initial = env.world.style.transform;
  await env.viewport.emit('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  await env.viewport.emit('pointermove', { pointerId: 1, clientX: 140, clientY: 120 });
  await env.viewport.emit('pointerdown', { button: 0, pointerId: 2, clientX: 250, clientY: 100 });
  await env.viewport.emit('pointermove', { pointerId: 2, clientX: 350, clientY: 100 });
  assert.notEqual(env.world.style.transform, initial);
  if (reason === 'escape') await env.viewport.emit('keydown', { key: 'Escape' });
  else if (reason === 'blur') await env.window.emit('blur');
  else if (reason === 'hidden') { env.document.hidden = true; await env.document.emit('visibilitychange'); }
  else if (reason === 'unmount') env.cleanup();
  else await env.viewport.emit(reason, { pointerId: 1 });
  assert.equal(env.world.style.transform, initial); assert.equal(env.viewport.captured.size, 0);
  env.cleanup(); assert.ok(env.grid.children.includes(env.card));
});

test('Universe rejects an explicit placement Apply after another writer changed it', async () => {
  const env = await environment(); const previous = env.records.get('placements:placement'); env.records.set('placements:placement', { ...previous, x: 999, revision: 2 });
  for (const node of env.nodes().filter(n => n.tagName === 'input' && n.type === 'number')) node.value = String(node.value);
  const apply = env.nodes().find(node => node.textContent === 'Apply position'); await apply.emit('click');
  assert.equal(env.records.get('placements:placement').x, 999); assert.match(env.errors[0].message, /changed elsewhere/); env.cleanup();
});
