import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const [shell, source, modelSource, setupSource] = await Promise.all(['hole-fluid-os.html', 'clusters.js', 'clusters-model.js', 'workspace-setup.js'].map(name => readFile(new URL('../src/' + name, import.meta.url), 'utf8')));
export function section(from, to) {
  const start = shell.indexOf(from), end = shell.indexOf(to, start);
  assert.ok(start >= 0 && end > start, 'Production section exists: ' + from);
  return shell.slice(start, end);
}
export const plain = value => JSON.parse(JSON.stringify(value));
export const group = (id, members, name = id, kind = 'cluster') => ({ id, members, name, kind });
export const savedTree = () => ({
  appPins: [{ name: 'Browser', space: 'desk' }],
  pins: [{ localId: 'file-1', name: 'Original.txt', kind: 'note', space: 'desk' }],
  clusters: [group('group-parent', ['thought', 'group-child'], 'Project'), group('group-child', ['local-file-1', 'app-browser'], 'Documents', 'folder')],
  clusterOpen: 'group-child',
  desk: { view: 'studio', files: { 'group-parent': { space: 'studio', x: 50, y: 60 } }, placements: { 'group-parent': { x: .4, y: .5 } } }
});

// Run the complete production Clusters module and the production shell restore
// boundary. This fixture models DOM replacement/focus and event dispatch only;
// it does not claim browser layout, touch-device or assistive-technology coverage.
export function fixture(saved = savedTree(), { localIds = ['file-1'] } = {}) {
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
  const apps = [{ name: 'Notes' }, { name: 'Photos' }, { name: 'Files' }, { name: 'Browser' }], windows = new Map(), visits = [], writes = [], launches = [], lifecycle = [];
  const spaces = Object.assign(Object.create(null), { desk: {}, studio: {}, life: {} });
  const window = { HoleCapabilities: { get: () => ({ label: 'App shortcut' }) }, HoleFiles: { getRecent: () => localIds.map(id => ({ id, name: id + '.txt', type: 'text/plain', size: 10 })) } };
  const context = vm.createContext({ window, document, root, state, deskFiles, apps, spaces, byName: new Map([...apps, { name: 'Clusters' }].map(app => [app.name, app])), pinnedApps: ['Notes', 'Music', 'Files'], crypto: { randomUUID: () => 'new-' + ++uid }, performance: { now: () => 1000 }, setTimeout: () => 0, clearTimeout() {}, storeViews() {},
    selectedFile: null, desktopGestures: { cancel() { lifecycle.push('cancel desktop'); } }, drawerGestures: { cancel() { lifecycle.push('cancel drawer'); } },
    renderSpaces() { lifecycle.push('render spaces'); }, attachDesktopFile: file => window.HoleOS.attachDesktopFile(file),
    setLayout() { lifecycle.push('layout'); }, restoreViews() { lifecycle.push('restore views'); },
    visitSpace: space => { lifecycle.push('visit space'); window.HoleOS.visitSpace(space); },
    paintDesk: () => window.HoleOS.paintDesk(), save: () => window.HoleOS.save()
  });
  vm.runInContext(modelSource, context); window.HoleClusterModel = context.HoleClusterModel;
  vm.runInContext(setupSource, context); window.HoleSetup = context.HoleSetup;
  vm.runInContext(section('  function restore(s)', '  restore(window.openai') + section('  function exportSetup()', '\n\n  window.HoleOS=') + '\nglobalThis.boundary={restore,exportSetup,importSetup,get lastReport(){return typeof lastSetupImport === "undefined" ? null : lastSetupImport;}};', context);
  context.boundary.restore(saved);
  const H = window.HoleOS = {
    state, root, deskFiles, apps, windows, deskStage: { clientWidth: 800, clientHeight: 600 },
    selectFile() {}, save() { lifecycle.push('save'); writes.push(plain(state)); },
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
  return { state, deskFiles, document, body, root, controls, hint, H, M: window.HoleClusterModel, C: window.HoleClusters, context, visits, writes, launches, lifecycle, localIds, mount, button, input };
}

