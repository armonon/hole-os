import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/file-platform.js', import.meta.url), 'utf8');
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Production section exists: ${from}`);
  return source.slice(start, end);
}
const editorFunctions = section('    function textEditor(', '    function handoff(');
const overlayFunctions = section('    function openOverlay(', '    function showActivity(');
const closeQuickFunction = section('    function closeQuick(', '    function openTools(');
const quickAction = source.match(/^      const action = .*;$/m)?.[0];
assert.ok(quickAction, 'Production Quick Tools action wrapper exists');

// Run the real dialog/editor functions. This DOM fixture models removal moving
// focus to body and background inertness; it does not simulate layout or a browser.
function fixture({ load } = {}) {
  let document, body;
  class Element {
    constructor(tag, className = '', text = '') {
      this.tag = tag; this.className = className; this.textContent = text;
      this.children = []; this.listeners = new Map(); this.attributes = new Map();
      this.dataset = {}; this.inert = false; this.value = ''; this.disabled = false;
    }
    get isConnected() { return this === body || !!this.parent?.isConnected; }
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
    contains(other) { return this === other || this.children.some(child => child.contains(other)); }
    remove() {
      if (this.contains(document.activeElement)) document.activeElement = body;
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = null;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(handler);
    }
    fire(type) { return Promise.all((this.listeners.get(type) || []).map(handler => handler({ type, target: this, preventDefault() {}, stopPropagation() {} }))); }
    click() { this.focus(); return this.fire('click'); }
    focus() { if (this.isConnected && !this.disabled && !this.ancestors().some(node => node.inert)) document.activeElement = this; }
    select() {}
    ancestors() { return this.parent ? [this.parent, ...this.parent.ancestors()] : []; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    querySelector(selector) {
      return this.descendants().find(child => selector.startsWith('.') ? child.className.split(' ').includes(selector.slice(1)) : child.tag === selector) || null;
    }
  }
  const node = (tag, className, text) => new Element(tag, className, text);
  const button = (label, glyph, action, className) => {
    const item = node('button', className, label); item.addEventListener('click', action); return item;
  };
  body = node('body');
  const os = node('main'), background = node('section'), alreadyInert = node('section'), layer = node('div');
  const original = node('button', '', 'Open with');
  alreadyInert.inert = true; background.append(original); body.append(os); os.append(background, alreadyInert, layer);
  document = { body, activeElement: body };
  let uid = 0;
  const context = {
    Blob, document, node, button, os, layer,
    api: { state: { desk: { view: 'desk' } } },
    window: {
      HoleCapabilities: { forFile: () => [{ mode: 'local', name: 'Text editor', description: 'Local editor' }] },
      HoleTextFiles: { MAX_TEXT_BYTES: 262144, decode: blob => blob.text() }
    },
    uid: () => `fixture-${++uid}`, formatBytes: String,
    blobFor: load || (async () => new Blob(['Original text'], { type: 'text/plain' })),
    animate() {}, paintIcons() {}, announce() {},
    downloadLink: () => node('a', '', 'Download'), storageError: error => error.message,
    saveTextResult: () => { throw new Error('This cancellation test must not save a file.'); }
  };
  vm.runInNewContext(`
    let overlay = null, overlayReturn = null, overlayCloseRequest = null, inertRecords = [], quick = null, quickReturn = null;
    ${closeQuickFunction}
    ${editorFunctions}
    ${overlayFunctions}
    function quickActionFor(file, origin) {
      quickReturn = origin; quick = node('section'); layer.append(quick);
      const tools = node('div'); quick.append(tools);
      ${quickAction}
      action('Open with', 'app-window', () => openWith(file));
      return tools.querySelector('button');
    }
    globalThis.actions = { openWith, openOverlay, requestCloseOverlay, quickActionFor, get overlay() { return overlay; } };
  `, context);
  const actions = context.actions;
  const findButton = text => actions.overlay?.descendants().find(child => child.tag === 'button' && child.textContent === text);
  const file = { id: 'source-file', name: 'Original.txt', type: 'text/plain', size: 13 };
  function openWith() { original.focus(); actions.openWith(file); }
  async function openEditor() { openWith(); await findButton('Edit a new version').click(); }
  function quickActionFor() { original.focus(); return actions.quickActionFor(file, original); }
  return { actions, document, body, original, background, alreadyInert, findButton, openWith, openEditor, quickActionFor };
}

for (const close of ['close button', 'close request', 'backdrop']) {
  test(`unchanged editor returns focus through Open with and loading on ${close}`, async () => {
    const f = fixture(); await f.openEditor();
    assert.equal(f.actions.overlay.dataset.kind, 'text-editor');
    assert.equal(f.background.inert, true);
    if (close === 'close button') await f.findButton('Close Edit a new version').click();
    else if (close === 'backdrop') await f.actions.overlay.fire('pointerdown');
    else f.actions.requestCloseOverlay();
    assert.equal(f.actions.overlay, null);
    assert.equal(f.document.activeElement, f.original);
    assert.equal(f.background.inert, false);
    assert.equal(f.alreadyInert.inert, true, 'closing must preserve preexisting inertness');
  });
}

test('dirty close keeps the draft and explicit discard returns focus to the Files action', async () => {
  const f = fixture(); await f.openEditor();
  const editor = f.actions.overlay.querySelector('textarea');
  editor.value = 'An unsaved revision'; await editor.fire('input');
  await f.findButton('Close Edit a new version').click();
  assert.equal(f.document.activeElement, f.findButton('Keep editing'));
  assert.equal(editor.value, 'An unsaved revision');
  assert.equal(f.background.inert, true);
  await f.findButton('Keep editing').click();
  assert.equal(f.document.activeElement, editor);
  assert.equal(editor.value, 'An unsaved revision');
  assert.equal(f.findButton('Discard edits'), undefined);
  f.actions.requestCloseOverlay();
  await f.findButton('Discard edits').click();
  assert.equal(f.actions.overlay, null);
  assert.equal(f.document.activeElement, f.original);
  assert.equal(f.background.inert, false);
});

test('a filename change alone requires discard confirmation and preserves return focus', async () => {
  const f = fixture(); await f.openEditor();
  f.actions.overlay.querySelector('input').value = 'Renamed.txt';
  f.actions.requestCloseOverlay();
  assert.ok(f.findButton('Keep editing'));
  await f.findButton('Discard edits').click();
  assert.equal(f.document.activeElement, f.original);
});

test('closing while text is loading restores focus and late data cannot reopen the editor', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const f = fixture({ load: () => waiting }); f.openWith();
  const opening = f.findButton('Edit a new version').click();
  assert.equal(f.actions.overlay.dataset.kind, 'text-loading');
  await f.findButton('Close Opening text').click();
  assert.equal(f.document.activeElement, f.original);
  release(new Blob(['Late text'], { type: 'text/plain' })); await opening;
  assert.equal(f.actions.overlay, null);
  assert.equal(f.document.activeElement, f.original);
});

test('late editor loading cannot replace a newer overlay or steal its focus', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const f = fixture({ load: () => waiting }); f.openWith();
  const opening = f.findButton('Edit a new version').click();
  f.actions.openOverlay('App capabilities', 'capabilities');
  const newFocus = f.document.activeElement;
  release(new Blob(['Late text'], { type: 'text/plain' })); await opening;
  assert.equal(f.actions.overlay.dataset.kind, 'capabilities');
  assert.equal(f.document.activeElement, newFocus);
  f.actions.requestCloseOverlay();
  assert.equal(f.document.activeElement, f.original);
});

test('Quick Tools hands its connected file control through Open with, loading and dirty discard', async () => {
  const f = fixture(), quickAction = f.quickActionFor();
  await quickAction.click();
  assert.equal(quickAction.isConnected, false, 'Quick Tools closes before opening the route chooser');
  await f.findButton('Edit a new version').click();
  f.actions.overlay.querySelector('textarea').value = 'Changed through Quick Tools';
  f.actions.requestCloseOverlay();
  await f.findButton('Discard edits').click();
  assert.equal(f.document.activeElement, f.original, 'focus returns to the file control, not the removed Quick Tools action');
  assert.equal(f.background.inert, false);
});
