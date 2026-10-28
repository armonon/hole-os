import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/file-platform.js', import.meta.url), 'utf8');
const modelContext = {};
vm.runInNewContext(source, modelContext);
const model = modelContext.HoleFileModel;
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Production section exists: ${from}`);
  return source.slice(start, end);
}
const original = { id: 'original', name: 'Original.txt', type: 'text/plain', size: 8, rootId: 'original', parentId: null, createdAt: 10, modifiedAt: 10, operation: 'Imported original' };
const edited = { ...original, id: 'edited', name: 'Edited.txt', parentId: 'original', createdAt: 20, modifiedAt: 20, operation: 'Edited text version', provenance: { app: 'Text editor', mode: 'local', sourceId: 'original', sourceName: original.name } };

// Execute real rendering/navigation functions. Model only DOM connectivity,
// replacement, events and focus; browser layout and pointer synthesis are out of scope.
function fixture({ library = [original, edited], load, persist, nextId = 'duplicate' } = {}) {
  let document, body;
  class Element {
    constructor(tag, className = '', text = '') {
      this.tag = tag; this.className = className; this._text = text;
      this.children = []; this.listeners = new Map(); this.attributes = new Map();
      this.dataset = {}; this.inert = false; this.disabled = false;
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get isConnected() { return this === body || !!this.parent?.isConnected; }
    append(...children) { children.forEach(child => { if (child.parent) child.remove(); child.parent = this; this.children.push(child); }); }
    replaceChildren(...children) { [...this.children].forEach(child => child.remove()); this._text = ''; this.append(...children); }
    contains(other) { return this === other || this.children.some(child => child.contains(other)); }
    remove() {
      if (this.contains(document.activeElement)) document.activeElement = body;
      if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
      this.parent = null;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
    fire(type) { return Promise.all((this.listeners.get(type) || []).map(handler => handler({ type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} }))); }
    click() { this.focus(); return this.fire('click'); }
    focus() { if (this.isConnected && !this.disabled && !this.ancestors().some(node => node.inert)) document.activeElement = this; }
    ancestors() { return this.parent ? [this.parent, ...this.parent.ancestors()] : []; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    matches(selector) {
      if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
      if (selector.startsWith('[')) return [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)].every(([, name, value]) => {
        const current = name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] : this.getAttribute(name);
        return value === undefined ? current !== undefined && current !== null : current === value;
      });
      return this.tag === selector;
    }
    querySelectorAll(selector) { return this.descendants().filter(child => child.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return [this, ...this.ancestors()].find(item => item.matches(selector)) || null; }
  }
  const node = (tag, className, text) => new Element(tag, className, text);
  const button = (label, glyph, action, className) => {
    const item = node('button', className); item.setAttribute('aria-label', label);
    item.append(node('span', '', label)); item.addEventListener('click', action); return item;
  };
  body = node('body'); document = { body, activeElement: body };
  const os = node('main'), background = node('section'), layer = node('div'); body.append(os); os.append(background, layer);
  const add = button('Import', '', () => {}), create = button('New text', '', () => {}), list = node('div'), preview = node('section');
  background.append(add, create, list, preview);
  const mount = { body: background, list, preview, add, create, view: node('select'), lockerHelp: node('div'), note: node('p'), input: node('input') };
  const announcements = [], writes = [];
  const context = {
    ...model, Blob, document, node, button, os, layer, mount,
    URL, galleryURLs: new Set(), galleryEpoch: 0, libraryMode: 'all', files: structuredClone(library), selectedId: null, db: true, dbError: '', busy: false, previewEpoch: 0,
    uid: () => nextId, history: (type, detail) => ({ type, detail }),
    fileIcon: () => 'file-text', icon: name => node('i', '', name), dateLabel: String, RASTER_TYPES: new Set(),
    api: { openApp() {}, windows: new Map() }, window: {}, performance: { now: () => 1000 },
    blobFor: load || (async id => new Blob([id], { type: 'text/plain' })),
    downloadLink: () => node('a', '', 'Download'),
    animate() {}, paintIcons() {}, revokePreview() {}, installToolsGesture() {},
    storageError: error => error.message, announce: text => announcements.push(text),
    saveFile: async (file, blob, onlyNew) => {
      if (persist) await persist(file, blob, onlyNew);
      writes.push({ file, blob, onlyNew }); context.files.push(file); context.actions.renderFiles(); return file;
    }
  };
  vm.runInNewContext(`
    let overlay = null, overlayReturn = null, overlayCloseRequest = null, inertRecords = [], quick = null, quickReturn = null;
    ${section('    function clearGallery()', '    const downloadURLs')}
    const getRecent = () => [...files].sort((a, b) => b.modifiedAt - a.modifiedAt);
    ${section('    function closeQuick(', '    function openTools(')}
    ${section('    function openOverlay(', '    function showActivity(')}
    ${section('    async function duplicateFile(', '    function renameFile(')}
    ${section('    function showHistory(', '    function conversionDialog(')}
    ${section('    function mountFiles(', '    function installToolsGesture(')}
    function beginQuickForTest(origin) { quickReturn = origin; quick = node('div'); layer.append(quick); const action = button('Quick action', '', () => {}); quick.append(action); action.focus(); }
    globalThis.actions = { duplicateFile, showHistory, openFiles, renderFiles, renderPreview, requestCloseOverlay, beginQuickForTest, closeQuick,
      get overlay() { return overlay; }, get selectedId() { return selectedId; } };
  `, context);
  const actions = context.actions;
  const control = (id, action = 'open') => list.descendants().find(item => item.dataset.fileId === id && item.dataset.fileAction === action)
    || list.descendants().find(item => item.tag === 'button' && item.getAttribute('aria-label') === (action === 'open' ? `Open ${library.find(file => file.id === id)?.name}` : `Quick tools for ${library.find(file => file.id === id)?.name}`));
  const findButton = (root, label) => root?.descendants().find(item => item.tag === 'button' && item.getAttribute('aria-label') === label);
  actions.renderFiles();
  return { actions, document, body, background, mount, preview, list, create, control, findButton, writes, announcements, context };
}

test('selecting a file keeps focus on its replacement file control', async () => {
  const f = fixture(), previous = f.control('edited'); await previous.click();
  assert.equal(previous.isConnected, false);
  assert.equal(f.actions.selectedId, 'edited');
  assert.equal(f.document.activeElement, f.control('edited'));
});

test('list refresh preserves the focused Quick Tools control', () => {
  const f = fixture(); f.control('edited', 'tools').focus(); f.actions.renderFiles();
  assert.equal(f.document.activeElement, f.control('edited', 'tools'));
});

test('an overlay returns to the replacement file control after a background refresh', () => {
  const f = fixture(); f.control('edited').focus(); f.actions.showHistory(edited);
  const focused = f.document.activeElement; f.actions.renderFiles();
  assert.equal(f.document.activeElement, focused, 'refresh does not steal focus from history');
  f.actions.requestCloseOverlay();
  assert.equal(f.document.activeElement, f.control('edited'));
});

test('Quick Tools returns to its recreated origin after a background refresh', () => {
  const f = fixture(); f.actions.beginQuickForTest(f.control('edited'));
  const focused = f.document.activeElement; f.actions.renderFiles();
  assert.equal(f.document.activeElement, focused);
  f.actions.closeQuick();
  assert.equal(f.document.activeElement, f.control('edited'));
});

test('a deleted overlay origin returns focus to New text instead of the document body', () => {
  const f = fixture({ library: [edited] }); f.control('edited').focus(); f.actions.showHistory(edited);
  f.context.files = []; f.actions.renderFiles(); f.actions.requestCloseOverlay();
  assert.equal(f.document.activeElement, f.create);
});

test('history opened from preview retains a connected return target after a background refresh', async () => {
  const f = fixture(); f.actions.openFiles('edited'); await f.findButton(f.preview, 'History').click();
  f.actions.renderFiles(); f.actions.requestCloseOverlay();
  assert.notEqual(f.document.activeElement, f.body);
  assert.equal(f.background.contains(f.document.activeElement), true);
  assert.equal(f.document.activeElement.isConnected, true);
});

test('Open source selects and focuses the immediate source, not its oldest ancestor', async () => {
  const copy = { ...edited, id: 'copy', name: 'Copy.txt', parentId: 'edited', createdAt: 30 };
  const f = fixture({ library: [original, edited, copy] }); f.actions.openFiles('copy');
  const open = f.findButton(f.preview, 'Open source'); assert.ok(open); await open.click();
  assert.equal(f.actions.selectedId, 'edited');
  assert.equal(f.document.activeElement, f.control('edited'));
});

test('history opens an older version and focuses the selected file without changing it', async () => {
  const f = fixture(); f.actions.openFiles('edited'); f.actions.showHistory(edited);
  assert.match(f.actions.overlay.textContent, /From Original\.txt/);
  await f.findButton(f.actions.overlay, original.name).click();
  assert.equal(f.actions.overlay, null);
  assert.equal(f.actions.selectedId, 'original');
  assert.equal(f.document.activeElement, f.control('original'));
  assert.equal(f.writes.length, 0);
});

test('deleted sources have truthful preview/history and no dead Open source control', () => {
  const f = fixture({ library: [edited] }); f.actions.openFiles('edited');
  assert.match(f.preview.textContent, /source no longer in this library/i);
  assert.equal(f.findButton(f.preview, 'Open source'), undefined);
  f.actions.showHistory(edited);
  assert.match(f.actions.overlay.textContent, /original is no longer in this library/i);
  assert.match(f.actions.overlay.textContent, /source no longer in this library.*Original\.txt/i);
  assert.equal(f.findButton(f.actions.overlay, original.name), undefined);
});

test('duplicate completion selects its new file when the initiating selection remains active', async () => {
  const f = fixture(); f.actions.openFiles('edited'); await f.actions.duplicateFile(edited);
  assert.equal(f.actions.selectedId, 'duplicate');
  assert.equal(f.document.activeElement, f.control('duplicate'));
  assert.equal(f.writes[0].file.provenance.sourceId, 'edited');
  assert.equal(f.writes[0].onlyNew, true, 'new copies use an insert rather than overwrite semantics');
});

test('a delayed duplicate does not replace a selection made while its bytes were loading', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture({ load: () => pending }); f.actions.openFiles('edited');
  const copying = f.actions.duplicateFile(edited); f.actions.openFiles('original');
  release(new Blob(['Original bytes'])); await copying;
  assert.equal(f.writes.length, 1, 'the requested copy still completes');
  assert.equal(f.actions.selectedId, 'original');
  assert.equal(f.document.activeElement, f.control('original'));
});

test('late duplicate completion cannot take focus from a newer history dialog', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture({ load: () => pending }); f.actions.openFiles('edited');
  const copying = f.actions.duplicateFile(edited); f.actions.showHistory(original);
  const focused = f.document.activeElement;
  release(new Blob(['Original bytes'])); await copying;
  assert.equal(f.actions.selectedId, 'edited');
  assert.equal(f.document.activeElement, focused);
  assert.equal(f.actions.overlay.dataset.kind, 'history');
});

for (const occupiedStore of ['files', 'contents']) {
  test(`copy identity collision in ${occupiedStore} preserves all original bytes and metadata`, async () => {
    const existing = { ...original, id: 'collision' }, bytes = new Blob(['Keep these bytes']);
    const stored = { files: new Map(), contents: new Map() };
    stored[occupiedStore].set('collision', occupiedStore === 'files' ? existing : bytes);
    let notifications = 0;
    const context = { window: {}, MAX_FILES: 500, files: occupiedStore === 'files' ? [existing] : [], notifyFiles() { notifications++; }, renderFiles() {} };
    context.transaction = async (stores, mode, action) => {
      const pending = Object.fromEntries(stores.map(name => [name, new Map(stored[name])]));
      action({ objectStore(name) {
        return Object.fromEntries(['add', 'put'].map(method => [method, (value, key = value.id) => {
          if (method === 'add' && pending[name].has(key)) throw new Error('ConstraintError');
          pending[name].set(key, value);
        }]));
      } });
      for (const name of stores) stored[name] = pending[name];
    };
    vm.runInNewContext(section('    async function saveFile(', '    async function saveJob(') + '\nglobalThis.save = saveFile;', context);
    const copy = { ...edited, id: 'collision', name: 'A new copy.txt' };
    await assert.rejects(context.save(copy, new Blob(['New bytes']), true), /ConstraintError/);
    assert.equal(notifications, 0);
    assert.equal(context.files.some(file => file.name === copy.name), false);
    if (occupiedStore === 'files') { assert.equal(stored.files.get('collision'), existing); assert.equal(stored.contents.size, 0); }
    else { assert.equal(stored.contents.get('collision'), bytes); assert.equal(stored.files.size, 0); }
  });
}
