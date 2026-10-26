import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';

const source = await readFile(new URL('../src/extensions.js', import.meta.url), 'utf8');
const model = await readFile(new URL('../src/extensions-model.js', import.meta.url), 'utf8');
const pause = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Element {
  constructor(tag, cls, text) { this.tagName = tag; this.className = cls; this.textContent = text || ''; this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = new Map(); this.value = ''; }
  append(...values) { this.children.push(...values); }
  replaceChildren(...values) { this.children = values; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { if (!this.listeners.has(name)) this.listeners.set(name, []); this.listeners.get(name).push(callback); }
  emit(name, event = {}) { for (const callback of this.listeners.get(name) || []) callback(event); }
  remove() { this.removed = true; }
  focus() {}
  get nodes() { return [this, ...this.children.flatMap(child => child.nodes || [])]; }
}
async function environment() {
  const core = globalThis.HoleCoreFactory.create({ indexedDB: new IDBFactory(), localStorage: null, broadcast: false }); await core.ready;
  const hooks = {}, C = new Proxy({ ...core }, { get: (target, key) => hooks[key] || target[key] }), errors = [], dialogs = [], timers = new Map(); let timerId = 0, now = 10000;
  const scope = vm.createContext({ Blob, structuredClone, crypto: webcrypto, setTimeout, clearTimeout, Date: class extends Date { static now() { return now; } }, setInterval: callback => { const id = ++timerId; timers.set(id, callback); return id; }, clearInterval: id => timers.delete(id) }); scope.window = scope;
  vm.runInContext(model, scope); vm.runInContext(source, scope);
  const el = (tag, cls, text) => new Element(tag, cls, text), main = el('main');
  const ctx = { C, main, navigation: { projectId: null }, H: { icons() {} }, el, button(label, glyph, action) { const value = el('button', '', label); value.action = action; return value; }, input(label, type, value = '') { const wrap = el('label', '', label), input = el(type === 'textarea' ? 'textarea' : 'input'); input.value = value; input.attributes['aria-label'] = label; wrap.append(input); return { wrap, input }; }, title() {}, status(text) { const node = el('p', '', text); main.append(node); return node; }, section() { const node = el('section'); main.append(node); return node; }, empty: text => el('p', '', text), fail: error => errors.push(error), put: (type, record) => C.put(type, record, record.revision ? { expectedRevision: record.revision } : {}), modal() { const dialog = el('dialog'); dialog.open = true; dialog.close = () => { dialog.open = false; dialog.emit('close'); }; dialogs.push(dialog); return dialog; }, notify() {}, download() {}, open() {}, navigate() {}, render() {} };
  const button = (label, root = main) => { const result = root.nodes.find(n => n.tagName === 'button' && n.textContent === label); assert.ok(result, `button ${label}`); return result; };
  async function tool(config) { const asset = await core.importAsset({ name: 'Test.holetool', blob: new Blob([JSON.stringify(config)], { type: 'application/vnd.hole.tool+json' }), kind: 'tool' }); await scope.HoleExtensions.openAsset(await core.readAsset(asset.asset.id), ctx); return asset; }
  async function website() { const asset = await core.importAsset({ name: 'Test.holeweb', blob: new Blob([JSON.stringify({ schema: 'hole.weblab/1', name: 'Site', files: { 'index.html': 'original', 'style.css': '', 'script.js': '' } })], { type: 'application/vnd.hole.weblab+json' }) }); await scope.HoleExtensions.openAsset(await core.readAsset(asset.asset.id), ctx); return asset; }
  return { core, hooks, api: scope.HoleExtensions, scope, ctx, main, errors, dialogs, timers, button, tool, website, advance: ms => { now += ms; for (const tick of timers.values()) tick(); } };
}

test('rapid counter actions each persist one increment through delayed storage', async () => {
  const env = await environment(); await env.tool({ name: 'Counter', type: 'counter', initial: 0, step: 1 });
  const gate = deferred(); let entered = false;
  env.hooks.put = async (...args) => { entered = true; await gate.promise; return env.core.put(...args); };
  const add = env.button('Add'); const pending = [add.action(), add.action(), add.action()];
  await pause(); assert.ok(entered); gate.resolve(); await Promise.all(pending); await env.api.beforeLeave();
  const state = (await env.core.list('settings')).find(s => s.id.startsWith('tool-state:'));
  assert.equal(state.value.value, 3); assert.equal(env.main.nodes.find(n => n.tagName === 'output').textContent, '3'); env.core.close();
});

test('checklist failure does not contaminate the next acknowledged state', async () => {
  const env = await environment(); await env.tool({ name: 'List', type: 'checklist', items: ['First', 'Second'] });
  let failed = false; env.hooks.put = async (...args) => { if (!failed) { failed = true; throw new Error('Disk full'); } return env.core.put(...args); };
  const checks = env.main.nodes.filter(n => n.type === 'checkbox'); checks[0].checked = true; await checks[0].onchange();
  assert.equal(checks[0].checked, false); assert.equal(env.errors.length, 1);
  checks[1].checked = true; await checks[1].onchange(); await env.api.beforeLeave();
  const state = (await env.core.list('settings')).find(s => s.id.startsWith('tool-state:'));
  assert.equal(!!state.value.checked[0], false); assert.equal(state.value.checked[1], true); env.core.close();
});

test('timer package waits for final state persistence before closing its modal', async () => {
  const env = await environment(); await env.api.install({ schema: 'hole.package/1', id: 'test.timer', name: 'Timer', version: 1, kind: 'tool', permissions: [], component: { name: 'Timer', type: 'timer', seconds: 60 } }, env.ctx);
  await env.api.render('momentous', env.ctx); await env.button('Open tool').action(); const dialog = env.dialogs.at(-1);
  await env.button('Start', dialog).action(); env.advance(2500); assert.equal(env.timers.size, 1);
  const gate = deferred(); env.hooks.put = async (...args) => { await gate.promise; return env.core.put(...args); };
  const closing = env.button('Close', dialog).action(); await pause(); assert.equal(dialog.open, true); assert.equal(env.timers.size, 0);
  gate.resolve(); await closing; assert.equal(dialog.open, false); assert.equal((await env.core.get('settings', 'package-state:test.timer')).value.remaining, 57.5); await env.api.beforeLeave(); env.core.close();
});

test('leaving a generated timer drains pending reset and preserves its newest state', async () => {
  const env = await environment(); await env.tool({ name: 'Timer', type: 'timer', seconds: 60 }); await env.button('Start').action(); env.advance(10000);
  const gate = deferred(); env.hooks.put = async (...args) => { await gate.promise; return env.core.put(...args); };
  const reset = env.button('Reset').action(), leaving = env.api.beforeLeave(); let done = false; leaving.then(() => { done = true; }); await pause(); assert.equal(done, false); gate.resolve(); await Promise.all([reset, leaving]);
  assert.equal((await env.core.list('settings')).find(s => s.id.startsWith('tool-state:')).value.remaining, 60); assert.equal(env.timers.size, 0); env.core.close();
});

test('WebLab leave flush includes edits arriving during an in-flight draft write', async () => {
  const env = await environment(); const asset = await env.website(); const area = env.main.nodes.find(n => n.tagName === 'textarea');
  const gate = deferred(); let writes = 0; env.hooks.saveDraft = async value => { writes++; if (writes === 1) await gate.promise; return env.core.saveDraft(value); };
  area.value = 'first'; area.oninput(); const leaving = env.api.beforeLeave(); await pause(); area.value = 'newest'; area.oninput(); gate.resolve(); await leaving;
  const draft = (await env.core.list('drafts')).find(d => d.assetId === asset.asset.id); assert.equal(JSON.parse(draft.text).files['index.html'], 'newest'); assert.equal(writes, 2); env.core.close();
});

test('typing during WebLab version commit becomes a new recoverable draft', async () => {
  const env = await environment(); const asset = await env.website(); const area = env.main.nodes.find(n => n.tagName === 'textarea');
  const gate = deferred(); let entered = false; env.hooks.commitDraft = async id => { entered = true; await gate.promise; return env.core.commitDraft(id); };
  area.value = 'first revision'; area.oninput(); const saving = env.button('Save version').action(); while (!entered) await pause(); area.value = 'typed during save'; area.oninput(); gate.resolve(); await saving; await env.api.beforeLeave();
  const committed = await env.core.readAsset(asset.asset.id), draft = (await env.core.list('drafts')).find(d => d.assetId === asset.asset.id);
  assert.equal(JSON.parse(await committed.blob.text()).files['index.html'], 'first revision'); assert.equal(JSON.parse(draft.text).files['index.html'], 'typed during save'); assert.equal(draft.baseVersionId, committed.version.id); env.core.close();
});

test('a failed WebLab draft save rejects navigation and retains editor values for retry', async () => {
  const env = await environment(); await env.website(); const area = env.main.nodes.find(n => n.tagName === 'textarea'); area.value = 'unsaved but visible'; area.oninput();
  env.hooks.saveDraft = async () => { throw new Error('Quota exceeded'); };
  await assert.rejects(env.api.beforeLeave(), /Quota exceeded/); assert.equal(area.value, 'unsaved but visible');
  delete env.hooks.saveDraft; await env.api.beforeLeave(); assert.equal(JSON.parse((await env.core.list('drafts'))[0].text).files['index.html'], 'unsaved but visible'); env.core.close();
});
