import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/hole-fluid-os.html', import.meta.url), 'utf8');
const clusterSource = await readFile(new URL('../src/clusters.js', import.meta.url), 'utf8');
const modelSource = await readFile(new URL('../src/clusters-model.js', import.meta.url), 'utf8');
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Production section exists: ${from}`);
  return source.slice(start, end);
}
const binder = section('  function bindGestureSurface(', "  deskItems.addEventListener('contextmenu'");
const desktopAdapter = section('  desktopGestures=bindGestureSurface(', '  drawerGestures=bindGestureSurface(');
const keyHandler = section("  root.addEventListener('keydown',e=>{\n    if((e.metaKey", "  root.addEventListener('keyup'");
const blurHandler = source.match(/^  window\.addEventListener\('blur'.*$/m)?.[0];
const visibilityHandler = source.match(/^  document\.addEventListener\('visibilitychange'.*$/m)?.[0] || '';
const resizeFunction = source.match(/^  function resize\(\).*$/m)?.[0];
assert.ok(blurHandler && resizeFunction, 'Production lifecycle handlers exist');
const plain = value => JSON.parse(JSON.stringify(value));

// Actual shell handlers and adapter run in a deterministic clock/event fixture.
// This exercises pointer ownership and lifecycle logic, not physical device input.
function fixture({ touch = false, arranging = false, clusters = false, groups = [] } = {}) {
  let now = 1000, nextTimer = 0;
  const timers = new Map(), writes = [], previews = [], commits = [], cancels = [], tools = [];
  class Element {
    constructor(button = false) {
      this.button = button; this.style = {}; this.listeners = new Map(); this.captures = new Set(); this.classes = new Set(); this.dataset = {}; this.attributes = new Map();
      this.clientWidth = 800; this.clientHeight = 600; this.isConnected = true;
      this.classList = { add: (...names) => names.forEach(name => this.classes.add(name)), remove: (...names) => names.forEach(name => this.classes.delete(name)), contains: name => this.classes.has(name) };
    }
    addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(handler); }
    fire(type, values = {}) {
      const event = { type, target: this, pointerId: 1, pointerType: touch ? 'touch' : 'mouse', button: 0, clientX: 100, clientY: 100,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
      for (let node = this; node && !event.stopped; node = node.parent) for (const handler of node.listeners.get(type) || []) handler(event);
      return event;
    }
    closest(selector) { return this.button && (selector === 'button' || selector === '[data-file]') ? this : null; }
    getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); if (name === 'data-drop-label') delete this.dataset.dropLabel; }
    querySelector() { return this.label ||= { textContent: '' }; }
    remove() { this.isConnected = false; }
    getAnimations() { return []; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { if (this.captures.delete(id)) this.fire('lostpointercapture', { pointerId: id }); }
    focus() { document.activeElement = this; }
  }
  const surface = new Element(), root = new Element(), window = new Element(), document = new Element(), os = new Element();
  const file = { id: 'first', name: 'First', el: new Element(true) }; file.el.parent = surface;
  const state = { layout: 'desktop', clusters: plain(groups), desk: { view: 'desk', placements: { first: { x: .25, y: .3 } }, files: { first: { space: 'desk', x: 0, y: 0 } } } };
  const camera = { x: 0, y: 0, z: 1, tx: 0, ty: 0, tz: 1 };
  window.HoleFiles = { openTools: options => tools.push(options), closeTools: () => tools.push('closed') };
  window.HoleClusters = {
    previewDrag: (g, e) => previews.push({ g, x: e.clientX, y: e.clientY }),
    commitDrag: (g, e) => { commits.push({ g, x: e.clientX, y: e.clientY }); return false; },
    cancelDrag: () => cancels.push(now)
  };
  function paintDesk() { const p = state.desk.placements.first; if (!p) return; file.el.style.left = `${p.x * surface.clientWidth}px`; file.el.style.top = `${p.y * surface.clientHeight}px`; }
  const context = {
    window, document, root, os, state, deskStage: surface, field: surface, deskFiles: [file], camera,
    arranging, selectedFile: null, spaceHeld: false, spacePanUsed: false, deskDrag: null, desktopGestures: null,
    width: 800, height: 600, fit: 1, windows: new Map(),
    hint: { textContent: '' }, performance: { now: () => now },
    setTimeout: (callback, delay = 0) => { const id = ++nextTimer; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    currentDeskView: () => camera,
    setDeskView: (view, immediate) => { Object.assign(camera, { tx: view.x, ty: view.y, tz: view.z }); if (immediate) Object.assign(camera, view); },
    deskPoint: () => ({ x: state.desk.placements.first.x * surface.clientWidth, y: state.desk.placements.first.y * surface.clientHeight }),
    paintDesk, clampCamera() {}, kick() {}, sizeWindow() {}, settleWorkspaceZoom() {}, rememberZoomSpace() {}, focusWorkspace() {},
    save: () => writes.push(plain(state)), motion: () => false,
    drawerGestures: { active: false, cancel() {} }
  };
  function addTarget(id, x, y, options = {}) {
    const target = { id, name: id, el: new Element(true), ...options };
    target.el.parent = surface; target.el.rect = { left: x - 50, top: y - 50, right: x + 50, bottom: y + 50, width: 100, height: 100 };
    context.deskFiles.push(target); state.desk.files[id] = { space: options.space || 'desk', x: 0, y: 0 }; state.desk.placements[id] = { x: x / 800, y: y / 600 };
    return target;
  }
  if (clusters) {
    const clusterContext = { ...context, crypto: { randomUUID: () => 'fixture-cluster' } };
    vm.runInNewContext(modelSource, clusterContext);
    clusterContext.H = { state, root, deskFiles: context.deskFiles, deskStage: surface,
      selectFile() {}, paintDesk, save: context.save,
      attachDesktopFile: file => { file.el = new Element(true); file.el.parent = surface; }
    };
    clusterContext.M = clusterContext.HoleClusterModel;
    const start = clusterSource.indexOf('  const DROP_DWELL'), end = clusterSource.indexOf('  function field(', start);
    assert.ok(start >= 0 && end > start, 'Production cluster drag controller exists');
    vm.runInNewContext(`const {state,root,deskFiles}=H;\n${clusterSource.slice(start, end)}\nglobalThis.controller={previewDrag,commitDrag,cancelDrag,targetAt,DROP_DWELL};`, clusterContext);
    window.HoleClusters = clusterContext.controller;
  }
  vm.runInNewContext(`${section('  function positionFile(', '  function paintDesk(')}
    ${binder}
    ${desktopAdapter}
    ${keyHandler}
    ${blurHandler}
    ${visibilityHandler}
    ${resizeFunction}
    globalThis.actions = { gestures: desktopGestures, resize };
  `, context);
  paintDesk();
  function advance(ms) {
    const until = now + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break; const [id, timer] = next; timers.delete(id); now = timer.at; timer.callback();
    }
    now = until;
  }
  const pointer = (type, values = {}) => surface.fire(type, { target: file.el, ...values });
  return { context, state, file, surface, root, window, document, writes, previews, commits, cancels, tools, advance, pointer, addTarget, actions: context.actions };
}

test('desktop file drag previews remain outside persisted state until pointerup', () => {
  const f = fixture(), before = plain(f.state.desk.placements.first);
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 160, clientY: 150 });
  assert.deepEqual(plain(f.state.desk.placements.first), before);
  assert.equal(f.previews.length, 1);
  assert.notEqual(f.file.el.style.left, '200px', 'the visual preview still moves');
  f.context.save();
  assert.deepEqual(f.writes[0].desk.placements.first, before, 'an independent save cannot persist an unfinished drag');
  assert.equal(f.commits.length, 0);
  f.pointer('pointerup', { clientX: 160, clientY: 150 });
  assert.equal(f.commits.length, 1);
  assert.notDeepEqual(plain(f.state.desk.placements.first), before);
  assert.equal(f.actions.gestures.active, false);
});

test('single click and movements below the drag threshold never preview or commit a group', () => {
  const f = fixture(); f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 103, clientY: 102 }); f.pointer('pointerup');
  assert.equal(f.previews.length, 0); assert.equal(f.commits.length, 0);
  assert.equal(f.actions.gestures.active, false);
  assert.notEqual(f.surface.fire('click', { target: f.file.el, detail: 1 }).defaultPrevented, true, 'ordinary single-click opening is preserved');
});

test('a drag suppresses its trailing pointer click while retaining keyboard activation', () => {
  const f = fixture(); f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 180 }); f.pointer('pointerup', { clientX: 180 });
  assert.equal(f.surface.fire('click', { target: f.file.el, detail: 1 }).defaultPrevented, true);
  assert.notEqual(f.surface.fire('click', { target: f.file.el, detail: 0 }).defaultPrevented, true);
  f.advance(500);
  assert.notEqual(f.surface.fire('click', { target: f.file.el, detail: 1 }).defaultPrevented, true);
});

for (const ending of ['pointercancel', 'lostpointercapture', 'Escape', 'blur', 'hidden', 'resize', 'explicit cancel']) {
  test(`${ending} rolls back a desktop file preview without committing a group`, () => {
    const f = fixture(), before = plain(f.state.desk.placements.first);
    f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 180, clientY: 150 });
    if (ending === 'Escape') f.root.fire('keydown', { key: 'Escape', target: f.file.el });
    else if (ending === 'blur') f.window.fire('blur');
    else if (ending === 'hidden') { f.document.hidden = true; f.document.fire('visibilitychange'); }
    else if (ending === 'resize') f.actions.resize();
    else if (ending === 'explicit cancel') f.actions.gestures.cancel();
    else f.pointer(ending);
    f.advance(1000); f.pointer('pointerup', { clientX: 180, clientY: 150 });
    assert.equal(f.actions.gestures.active, false);
    assert.deepEqual(plain(f.state.desk.placements.first), before);
    assert.equal(f.file.el.style.left, '200px'); assert.equal(f.file.el.style.top, '180px');
    assert.equal(f.file.el.classes.has('is-held'), false);
    assert.equal(f.surface.classes.has('is-dragging'), false);
    assert.equal(f.commits.length, 0);
    assert.ok(f.cancels.length >= 1);
  });
}

test('foreign move, release and lost capture cannot finish or change the owned file drag', () => {
  const f = fixture(); f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 180 });
  const previews = f.previews.length;
  for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) f.pointer(type, { pointerId: 99, clientX: 500 });
  assert.equal(f.actions.gestures.active, true); assert.equal(f.previews.length, previews); assert.equal(f.commits.length, 0);
  f.pointer('pointerup', { clientX: 180 });
  assert.equal(f.commits.length, 1);
});

test('releasing pointer capture during pointerup cannot cancel or duplicate the commit', () => {
  const f = fixture(); f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 180 });
  f.pointer('pointerup', { clientX: 180 });
  assert.equal(f.file.el.captures.size, 0); assert.equal(f.commits.length, 1);
  f.pointer('lostpointercapture'); f.pointer('pointerup');
  assert.equal(f.commits.length, 1);
});

test('touch movement before the stationary hold pans without file or group mutations', () => {
  const f = fixture({ touch: true }), before = plain(f.state.desk.placements.first);
  f.pointer('pointerdown'); f.advance(100); f.pointer('pointermove', { clientX: 140 }); f.advance(600); f.pointer('pointerup', { clientX: 140 });
  assert.deepEqual(plain(f.state.desk.placements.first), before); assert.equal(f.previews.length, 0); assert.equal(f.commits.length, 0);
  assert.equal(f.tools.filter(item => item !== 'closed').length, 0);
});

test('stationary touch hold opens Quick Tools without grouping or moving the file', () => {
  const f = fixture({ touch: true }), before = plain(f.state.desk.placements.first);
  f.pointer('pointerdown'); f.advance(400);
  assert.equal(f.tools.filter(item => item !== 'closed').length, 1);
  f.pointer('pointerup');
  assert.deepEqual(plain(f.state.desk.placements.first), before); assert.equal(f.previews.length, 0); assert.equal(f.commits.length, 0);
});

test('continuing a touch hold into a drag closes Quick Tools and commits only on release', () => {
  const f = fixture({ touch: true }); f.pointer('pointerdown'); f.advance(400);
  f.pointer('pointermove', { clientX: 180, clientY: 150 });
  assert.equal(f.tools.at(-1), 'closed'); assert.equal(f.previews.length, 1); assert.equal(f.commits.length, 0);
  f.pointer('pointerup', { clientX: 180, clientY: 150 }); assert.equal(f.commits.length, 1);
});

test('a second pointer promotes dragging to pinch and clears the pending file preview', () => {
  const f = fixture(), before = plain(f.state.desk.placements.first);
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 180 });
  f.pointer('pointerdown', { pointerId: 2, clientX: 300 });
  assert.deepEqual(plain(f.state.desk.placements.first), before); assert.ok(f.cancels.length >= 1);
  f.pointer('pointerup', { pointerId: 2, clientX: 300 }); f.pointer('pointerup', { clientX: 180 });
  assert.equal(f.commits.length, 0); assert.equal(f.actions.gestures.active, false);
});

test('a source removed during dragging cannot create an orphan placement on release', () => {
  const f = fixture(); f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 180 });
  f.context.deskFiles.length = 0; f.file.el.isConnected = false;
  delete f.state.desk.files.first; delete f.state.desk.placements.first;
  f.pointer('pointerup', { clientX: 180 });
  assert.equal(Object.hasOwn(f.state.desk.placements, 'first'), false);
  assert.equal(f.commits.length, 0);
});

test('real cluster controller waits for deliberate hover and commits membership only on pointerup', () => {
  const f = fixture({ clusters: true }), target = f.addTarget('second', 300, 150), before = plain(f.state.desk.placements);
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 300, clientY: 150 });
  assert.equal(target.el.classes.has('is-cluster-target'), true);
  f.advance(299); assert.equal(target.el.classes.has('is-cluster-ready'), false);
  f.advance(1); assert.equal(target.el.classes.has('is-cluster-ready'), true);
  assert.deepEqual(plain(f.state.clusters), []);
  assert.deepEqual(plain(f.state.desk.placements), before);
  f.pointer('pointerup', { clientX: 300, clientY: 150 });
  assert.equal(f.state.clusters.length, 1);
  assert.deepEqual(plain(f.state.clusters[0].members), ['second', 'first']);
  assert.deepEqual(plain(f.state.desk.placements.first), before.first, 'grouping retains the source placement for recovery');
  assert.equal(target.el.classes.has('is-cluster-ready'), false);
  assert.equal(f.document.activeElement, f.context.deskFiles.find(file => file.groupId)?.el);
});

test('crossing a target too briefly completes ordinary movement without grouping', () => {
  const f = fixture({ clusters: true }), target = f.addTarget('second', 300, 150), before = plain(f.state.desk.placements.first);
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 300, clientY: 150 }); f.advance(299);
  f.pointer('pointerup', { clientX: 300, clientY: 150 }); f.advance(1000);
  assert.deepEqual(plain(f.state.clusters), []);
  assert.notDeepEqual(plain(f.state.desk.placements.first), before);
  assert.equal(target.el.classes.has('is-cluster-target'), false); assert.equal(target.el.classes.has('is-cluster-ready'), false);
});

test('leaving a target clears feedback and re-entering starts a fresh dwell', () => {
  const f = fixture({ clusters: true }), target = f.addTarget('second', 300, 150);
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 300, clientY: 150 }); f.advance(300);
  f.pointer('pointermove', { clientX: 500, clientY: 300 });
  assert.equal(target.el.classes.has('is-cluster-target'), false); assert.equal(target.el.dataset.dropLabel, undefined);
  f.pointer('pointermove', { clientX: 300, clientY: 150 }); f.advance(299);
  f.pointer('pointerup', { clientX: 300, clientY: 150 });
  assert.deepEqual(plain(f.state.clusters), []);
});

test('switching targets requires a full dwell over the new target', () => {
  const f = fixture({ clusters: true }), first = f.addTarget('second', 300, 150), second = f.addTarget('third', 500, 150);
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 300, clientY: 150 }); f.advance(300);
  f.pointer('pointermove', { clientX: 500, clientY: 150 }); f.advance(299);
  assert.equal(first.el.classes.has('is-cluster-ready'), false); assert.equal(second.el.classes.has('is-cluster-ready'), false);
  f.pointer('pointerup', { clientX: 500, clientY: 150 });
  assert.deepEqual(plain(f.state.clusters), []);
});

test('pointerup rechecks its coordinates even without an intervening move event', () => {
  const f = fixture({ clusters: true }); f.addTarget('second', 300, 150);
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 300, clientY: 150 }); f.advance(500);
  f.pointer('pointerup', { clientX: 500, clientY: 300 });
  assert.deepEqual(plain(f.state.clusters), []);
});

test('edge contact stays an ordinary move; only the center target zone arms grouping', () => {
  const f = fixture({ clusters: true }), target = f.addTarget('second', 300, 150);
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 252, clientY: 150 }); f.advance(500);
  assert.equal(target.el.classes.has('is-cluster-target'), false);
  f.pointer('pointerup', { clientX: 252, clientY: 150 });
  assert.deepEqual(plain(f.state.clusters), []);
});

for (const invalidation of ['hidden', 'detached', 'other space', 'removed']) {
  test(`release cannot group with a target that became ${invalidation} during hover`, () => {
    const f = fixture({ clusters: true }), target = f.addTarget('second', 300, 150);
    f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 300, clientY: 150 }); f.advance(300);
    if (invalidation === 'hidden') target.el.hidden = true;
    else if (invalidation === 'detached') target.el.isConnected = false;
    else if (invalidation === 'other space') f.state.desk.files.second.space = 'studio';
    else { f.context.deskFiles.splice(f.context.deskFiles.indexOf(target), 1); delete f.state.desk.files.second; delete f.state.desk.placements.second; }
    f.pointer('pointerup', { clientX: 300, clientY: 150 });
    assert.deepEqual(plain(f.state.clusters), []);
    assert.equal(target.el.classes.has('is-cluster-target'), false);
  });
}

for (const ending of ['pointercancel', 'lostpointercapture', 'Escape', 'blur', 'hidden', 'resize', 'pinch']) {
  test(`real hover state clears on ${ending} and its late timer cannot commit a group`, () => {
    const f = fixture({ clusters: true }), target = f.addTarget('second', 300, 150), before = plain(f.state.desk.placements);
    f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 300, clientY: 150 }); f.advance(100);
    if (ending === 'Escape') f.root.fire('keydown', { key: 'Escape', target: f.file.el });
    else if (ending === 'blur') f.window.fire('blur');
    else if (ending === 'hidden') { f.document.hidden = true; f.document.fire('visibilitychange'); }
    else if (ending === 'resize') f.actions.resize();
    else if (ending === 'pinch') f.pointer('pointerdown', { pointerId: 2, clientX: 450, clientY: 150 });
    else f.pointer(ending);
    f.advance(1000); f.pointer('pointerup', { clientX: 300, clientY: 150 });
    if (ending === 'pinch') f.pointer('pointerup', { pointerId: 2, clientX: 450, clientY: 150 });
    assert.deepEqual(plain(f.state.clusters), []);
    assert.deepEqual(plain(f.state.desk.placements), before);
    assert.equal(target.el.classes.has('is-cluster-target'), false); assert.equal(target.el.classes.has('is-cluster-ready'), false);
  });
}

test('touch Quick Tools hold can continue into a real cluster drop without altering file identities', () => {
  const f = fixture({ clusters: true, touch: true }); f.addTarget('second', 300, 150);
  f.pointer('pointerdown'); f.advance(400);
  assert.equal(f.tools.filter(value => value !== 'closed').length, 1);
  f.pointer('pointermove', { clientX: 300, clientY: 150 }); f.advance(300);
  assert.deepEqual(plain(f.state.clusters), []);
  f.pointer('pointerup', { clientX: 300, clientY: 150 });
  assert.deepEqual(plain(f.state.clusters[0].members), ['second', 'first']);
  assert.ok(f.context.deskFiles.some(item => item.id === 'first')); assert.ok(f.context.deskFiles.some(item => item.id === 'second'));
});

test('dropping onto an existing folder adds a shortcut without creating another group', () => {
  const f = fixture({ clusters: true, groups: [{ id: 'group-folder', name: 'Folder', kind: 'folder', members: [] }] });
  f.addTarget('group-folder', 300, 150, { groupId: 'group-folder' });
  f.pointer('pointerdown'); f.pointer('pointermove', { clientX: 300, clientY: 150 }); f.advance(300);
  f.pointer('pointerup', { clientX: 300, clientY: 150 });
  assert.equal(f.state.clusters.length, 1);
  assert.deepEqual(plain(f.state.clusters[0].members), ['first']);
  assert.equal(f.state.clusters[0].kind, 'folder');
});
