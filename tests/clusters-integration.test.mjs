import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const [shell, source, modelSource] = await Promise.all(['hole-fluid-os.html', 'clusters.js', 'clusters-model.js'].map(name => readFile(new URL('../src/' + name, import.meta.url), 'utf8')));
function section(from, to) {
  const start = shell.indexOf(from), end = shell.indexOf(to, start);
  assert.ok(start >= 0 && end > start, 'Production section exists: ' + from);
  return shell.slice(start, end);
}
const plain = value => JSON.parse(JSON.stringify(value));
const group = (id, members, name = id, kind = 'cluster') => ({ id, members, name, kind });
const savedTree = () => ({
  appPins: [{ name: 'Browser', space: 'desk' }],
  pins: [{ localId: 'file-1', name: 'Original.txt', kind: 'note', space: 'desk' }],
  clusters: [group('group-parent', ['thought', 'group-child'], 'Project'), group('group-child', ['local-file-1', 'app-browser'], 'Documents', 'folder')],
  clusterOpen: 'group-child',
  desk: { view: 'studio', files: { 'group-parent': { space: 'studio', x: 50, y: 60 } }, placements: { 'group-parent': { x: .4, y: .5 } } }
});

// Run the complete production Clusters module and the production shell restore
// boundary. This fixture models DOM replacement/focus and event dispatch only;
// it does not claim browser layout, touch-device or assistive-technology coverage.
function fixture(saved = savedTree()) {
  let document, body, uid = 0;
  class Element {
    constructor(tag) {
      this.tag = tag; this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.dataset = {};
      this.className = ''; this.style = {}; this._text = ''; this._value = undefined; this.hidden = false; this.disabled = false;
      this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' '); }, remove: (...names) => { this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' '); } };
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get value() { return this._value ?? (this.tag === 'select' ? this.children[0]?.value || '' : ''); }
    set value(value) { this._value = String(value); }
    get isConnected() { return this === body || !!this.parent?.isConnected; }
    append(...children) { for (const child of children) { child.remove(); child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { for (const child of [...this.children]) child.remove(); this._text = ''; this.append(...children); }
    remove() { if (this.contains(document?.activeElement)) document.activeElement = body; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
    contains(other) { return this === other || this.children.some(child => child.contains(other)); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; }
    addEventListener(type, action) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(action); }
    dispatchEvent(event) { for (const action of this.listeners.get(event.type) || []) action(event); }
    fire(type) { this.dispatchEvent({ type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} }); }
    click() { this.focus(); this.fire('click'); }
    focus() { if (this.isConnected && !this.disabled) document.activeElement = this; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
      if (selector.startsWith('[')) return [...selector.matchAll(/\[([^=\]]+)(?:=(?:"([^"]*)"|([^\]]+)))?\]/g)].every(([, name, quoted, unquoted]) => {
        const value = quoted ?? unquoted;
        const actual = name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] : this.getAttribute(name);
        return value === undefined ? actual !== null && actual !== undefined : actual === value;
      });
      return this.tag === selector;
    }
    querySelectorAll(selector) { return this.descendants().filter(child => child.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 80, bottom: 80, width: 80, height: 80 }; }
  }
  body = new Element('body'); document = { body, activeElement: body, createElement: tag => new Element(tag) };
  const root = new Element('main'), controls = new Element('div'), hint = new Element('p'), desktop = new Element('div');
  controls.className = 'hf-workspace-controls'; hint.className = 'hf-hint'; body.append(root); root.append(controls, hint, desktop);
  const deskFiles = [{ id: 'thought', name: 'A thought', app: 'Notes', kind: 'note', space: 'desk', x: 0, y: 0 }, { id: 'color', name: 'Color study', app: 'Photos', kind: 'photo', space: 'desk', x: 0, y: 0 }];
  const state = { layout: 'desktop', note: 'Original note', playing: false, projects: [], pins: [], appPins: [], clusters: [], clusterOpen: null, session: [], recentApps: [], views: {}, desk: { view: 'desk', files: { thought: { space: 'desk', x: 0, y: 0 }, color: { space: 'desk', x: 0, y: 0 } }, placements: { thought: { x: .2, y: .2 }, color: { x: .6, y: .2 } } } };
  const apps = [{ name: 'Notes' }, { name: 'Photos' }, { name: 'Files' }, { name: 'Browser' }], windows = new Map(), visits = [], writes = [], launches = [];
  const spaces = Object.assign(Object.create(null), { desk: {}, studio: {}, life: {} });
  const window = { HoleCapabilities: { get: () => ({ label: 'App shortcut' }) } };
  const context = vm.createContext({ window, document, root, state, deskFiles, apps, spaces, byName: new Map([...apps, { name: 'Clusters' }].map(app => [app.name, app])), pinnedApps: ['Notes', 'Music', 'Files'], crypto: { randomUUID: () => 'new-' + ++uid }, performance: { now: () => 1000 }, setTimeout: () => 0, clearTimeout() {}, storeViews() {} });
  vm.runInContext(modelSource, context); window.HoleClusterModel = context.HoleClusterModel;
  vm.runInContext(section('  function restore(s)', '  restore(window.openai') + section('  function exportSetup()', '  function importSetup(') + '\nglobalThis.boundary={restore,exportSetup};', context);
  context.boundary.restore(saved);
  const H = window.HoleOS = {
    state, root, deskFiles, apps, windows, deskStage: { clientWidth: 800, clientHeight: 600 },
    selectFile() {}, save() { writes.push(plain(state)); },
    attachDesktopFile(file) { const el = new Element('button'), label = new Element('span'); label.className = 'hf-object-label'; label.textContent = file.name; el.append(label); desktop.append(el); file.el = el; },
    paintDesk() { window.HoleClusters?.syncSpaces(); for (const file of deskFiles) file.el.hidden = !!window.HoleClusterModel.parentOf(state.clusters, file.id) || state.desk.files[file.id].space !== state.desk.view; },
    visitSpace(space) { visits.push(space); state.desk.view = space; for (const rec of windows.values()) rec.el.hidden = rec.space !== space; H.paintDesk(); },
    openApp(name) {
      const previous = windows.get(name); if (previous && previous.space !== state.desk.view) H.visitSpace(previous.space);
      let rec = previous;
      if (!rec) { const el = new Element('section'), content = new Element('div'), minimize = new Element('button'); content.className = 'hf-window-body'; minimize.setAttribute('data-minimize', ''); el.append(minimize, content); root.append(el); rec = { app: { name }, space: state.desk.view, el }; windows.set(name, rec); root.dispatchEvent({ type: 'hole:window-change', detail: { type: 'create', rec } }); }
      rec.el.hidden = false; rec.el.querySelector('[data-minimize]').focus(); root.dispatchEvent({ type: 'hole:window-change', detail: { type: 'open', rec } });
    },
    openDesktopItem(file, origin) { if (file.groupId) window.HoleClusters.open(file.id, origin); else launches.push(file.id); },
    pinApp(name) { return deskFiles.find(file => file.id === 'app-' + name.toLowerCase()) || null; }
  };
  for (const file of deskFiles) H.attachDesktopFile(file);
  vm.runInContext(source, context);
  const mount = () => windows.get('Clusters')?.el.querySelector('.hf-window-body');
  const button = (label, within = mount()) => within?.descendants().find(el => el.tag === 'button' && (el._text === label || el.getAttribute('aria-label') === label));
  const input = label => mount()?.querySelector(`[aria-label="${label}"]`);
  return { state, deskFiles, document, body, root, controls, hint, H, M: window.HoleClusterModel, C: window.HoleClusters, context, visits, writes, launches, mount, button, input };
}

test('restore resolves app and local shortcuts before nested membership and inherits the root space', () => {
  const f = fixture();
  assert.equal(f.state.clusterOpen, 'group-child');
  assert.deepEqual(plain(f.state.clusters), savedTree().clusters);
  for (const id of ['thought', 'group-child', 'local-file-1', 'app-browser']) assert.equal(f.state.desk.files[id].space, 'studio', id);
  assert.equal(f.state.desk.files.color.space, 'desk');
  assert.deepEqual(plain(f.state.desk.placements['group-parent']), { x: .4, y: .5 });
  assert.equal(f.deskFiles.find(file => file.id === 'local-file-1').localId, 'file-1');
});

test('refresh follows a moved root through every descendant without changing originals', () => {
  const f = fixture(); f.state.desk.files['group-parent'].space = 'life'; f.C.refresh();
  for (const id of ['thought', 'group-child', 'local-file-1', 'app-browser']) assert.equal(f.state.desk.files[id].space, 'life', id);
  assert.equal(f.state.note, 'Original note');
  assert.equal(f.state.pins[0].localId, 'file-1');
});

test('restoring replacement groups removes stale containers and their geometry, retaining originals', () => {
  const f = fixture();
  f.context.boundary.restore({ clusters: [group('group-kept', ['thought', 'unknown', 'group-parent'])], clusterOpen: 'group-parent' }); f.C.refresh();
  assert.deepEqual(plain(f.state.clusters), [group('group-kept', ['thought'])]);
  assert.equal(f.state.clusterOpen, null);
  for (const id of ['group-parent', 'group-child']) { assert.equal(f.deskFiles.some(file => file.id === id), false); assert.equal(Object.hasOwn(f.state.desk.files, id), false); assert.equal(Object.hasOwn(f.state.desk.placements, id), false); }
  assert.ok(f.deskFiles.some(file => file.id === 'local-file-1'));
  assert.ok(f.deskFiles.some(file => file.id === 'app-browser'));
});

test('revealing a grouped file opens its direct parent in the correct space and focuses the file', () => {
  const f = fixture(); f.H.visitSpace('desk');
  assert.equal(f.C.revealItem('local-file-1'), true);
  assert.equal(f.state.desk.view, 'studio'); assert.equal(f.state.clusterOpen, 'group-child');
  assert.equal(f.H.windows.get('Clusters').space, 'studio');
  assert.equal(f.document.activeElement.dataset.clusterItem, 'local-file-1');
  assert.equal(f.C.revealItem('color'), false);
});

test('opening a group in another space relocates an existing Clusters window before opening it', () => {
  const f = fixture(); f.C.open('group-child');
  f.state.desk.files['group-parent'].space = 'life'; f.C.refresh(); f.C.open('group-parent');
  assert.equal(f.state.desk.view, 'life'); assert.equal(f.H.windows.get('Clusters').space, 'life');
  assert.equal(f.state.clusterOpen, 'group-parent');
});

test('Quick Tools organization stays with the source item when Clusters was open in another space', () => {
  const f = fixture(); f.C.open('group-child'); f.H.visitSpace('desk'); f.C.organize('color');
  assert.equal(f.state.desk.view, 'desk');
  assert.equal(f.H.windows.get('Clusters').space, 'desk');
  assert.equal(f.mount().querySelector('h2').textContent, 'Organize Color study');
});

test('refresh preserves a focused file control and does not steal focus from outside the panel', () => {
  const f = fixture(); f.C.revealItem('local-file-1'); const previous = f.document.activeElement;
  f.C.refresh(); assert.equal(previous.isConnected, false); assert.equal(f.document.activeElement.dataset.clusterItem, 'local-file-1');
  f.controls.querySelector('button').focus(); const outside = f.document.activeElement;
  f.C.refresh(); assert.equal(f.document.activeElement, outside);
});

test('same-view refresh retains focused rename and folder drafts and selected destinations', () => {
  const f = fixture(); f.C.open('group-child');
  for (const [label, value] of [['Cluster or folder name', 'Unsubmitted rename'], ['New folder name', 'Unsubmitted folder'], ['Existing shortcut', 'color']]) {
    const control = f.input(label); control.value = value; control.focus(); f.C.refresh();
    assert.equal(f.input(label).value, value);
    assert.equal(f.document.activeElement, f.input(label));
  }
  assert.equal(f.state.clusters.find(value => value.id === 'group-child').name, 'Documents');
  assert.equal(f.state.clusters.length, 2);
});

test('missing library shortcuts are pruned without deleting their container or stealing focus', () => {
  const f = fixture(); f.C.revealItem('local-file-1');
  const index = f.deskFiles.findIndex(file => file.id === 'local-file-1');
  f.deskFiles[index].el.remove(); f.deskFiles.splice(index, 1);
  delete f.state.desk.files['local-file-1']; delete f.state.desk.placements['local-file-1'];
  f.C.refresh();
  assert.deepEqual(plain(f.state.clusters.find(value => value.id === 'group-child').members), ['app-browser']);
  assert.equal(f.state.clusterOpen, 'group-child');
  assert.ok(f.mount().contains(f.document.activeElement), 'a missing row falls back to panel navigation');
  assert.equal(f.M.parentOf(f.state.clusters, 'app-browser').id, 'group-child');
});

test('malformed restore rejects invalid app destinations, unknown members and missing current groups', () => {
  const f = fixture({ appPins: [{ name: 'Browser', space: 'constructor' }, { name: 'Missing app', space: 'desk' }], clusters: [group('group-valid', ['thought', 'group-unknown', 'local-unknown', '__proto__'])], clusterOpen: 'group-unknown' });
  assert.deepEqual(plain(f.state.appPins), []);
  assert.deepEqual(plain(f.state.clusters), [group('group-valid', ['thought'])]);
  assert.equal(f.state.clusterOpen, null);
  assert.equal(f.state.desk.files.thought.space, 'desk');
});

test('All Clusters navigation retains keyboard focus inside the recreated panel', () => {
  const f = fixture(); f.C.open('group-child'); f.button('All Clusters').click();
  assert.equal(f.state.clusterOpen, null);
  assert.ok(f.mount().contains(f.document.activeElement), 'navigation must not leave focus on document.body');
});

test('moving an item out preserves its original and returns it to the parent space with panel focus', () => {
  const f = fixture(); f.C.open('group-child'); f.button('Move Original.txt to desktop').click();
  assert.equal(f.M.parentOf(f.state.clusters, 'local-file-1'), null);
  assert.equal(f.state.desk.files['local-file-1'].space, 'studio');
  assert.equal(f.deskFiles.find(file => file.id === 'local-file-1').localId, 'file-1');
  assert.ok(f.mount().contains(f.document.activeElement), 'the next keyboard action remains in Clusters');
});

test('nested ungroup navigates to its parent and preserves contained shortcuts and their space', () => {
  const f = fixture(); f.C.open('group-child'); f.button('Ungroup · keep contents').click();
  assert.equal(f.state.clusterOpen, 'group-parent');
  assert.deepEqual(plain(f.state.clusters), [group('group-parent', ['thought', 'local-file-1', 'app-browser'], 'Project')]);
  assert.equal(f.state.desk.files['local-file-1'].space, 'studio');
  assert.ok(f.mount().contains(f.document.activeElement));
});

test('root ungroup exposes every child while preserving nested folders and local file membership', () => {
  const f = fixture(); f.C.open('group-parent'); f.button('Ungroup · keep contents').click();
  assert.equal(f.state.clusterOpen, null);
  assert.equal(f.M.parentOf(f.state.clusters, 'group-child'), null);
  assert.equal(f.M.parentOf(f.state.clusters, 'local-file-1').id, 'group-child');
  assert.equal(f.state.desk.files['group-child'].space, 'studio');
  assert.equal(f.deskFiles.find(file => file.id === 'thought').el.hidden, false);
});

test('current group offers valid moves without allowing ancestor cycles', () => {
  const f = fixture(); f.C.open('group-child');
  const select = f.input('Existing shortcut'), values = select.children.map(option => option.value);
  assert.equal(values.includes('group-parent'), false); assert.equal(values.includes('group-child'), false);
  assert.ok(values.includes('thought')); assert.ok(values.includes('color'));
  select.value = 'thought'; f.button('Move into group').click();
  assert.equal(f.M.parentOf(f.state.clusters, 'thought').id, 'group-child');
  assert.equal(f.state.clusters.find(value => value.id === 'group-parent').members.includes('thought'), false);
});

test('folder creation preserves nesting and literal user names', () => {
  const f = fixture(); f.C.open('group-child');
  const name = '<img src=x onerror=alert(1)>'; f.input('New folder name').value = name;
  f.input('New folder name').parent.parent.fire('submit');
  const created = f.state.clusters.find(value => value.id === f.state.clusterOpen);
  assert.equal(created.name, name); assert.equal(created.kind, 'folder');
  assert.equal(f.M.parentOf(f.state.clusters, created.id).id, 'group-child');
  assert.equal(f.state.desk.files[created.id].space, 'studio');
  assert.equal(f.mount().querySelector('h2').textContent, name);
});

test('portable setup excludes local app and container geometry instead of exporting broken links', () => {
  const f = fixture(), setup = plain(f.context.boundary.exportSetup());
  assert.deepEqual(Object.keys(setup.desk.files).sort(), ['color', 'thought']);
  assert.deepEqual(Object.keys(setup.desk.placements).sort(), ['color', 'thought']);
  assert.equal(Object.hasOwn(setup, 'clusters'), false); assert.equal(Object.hasOwn(setup, 'pins'), false); assert.equal(Object.hasOwn(setup, 'note'), false);
});

test('Clusters has a valid launch origin while the drawer is open despite lacking a drawer tile', () => {
  const rectangle = { left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40 };
  const button = { isConnected: true, closest: () => null, querySelector: () => null, getBoundingClientRect: () => rectangle };
  const context = { drawerOpen: true, nodes: [], dockButtons: new Map([['Clusters', button]]), drawerToggle: button, field: button, os: button };
  vm.runInNewContext(section('  function sourceRect(', '  function morph(') + '\nglobalThis.origin=sourceRect({name:"Clusters"});', context);
  assert.equal(context.origin, rectangle);
});
