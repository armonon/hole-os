import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/window-system.js', import.meta.url), 'utf8');

// A deliberately small DOM/event fixture. Every geometry change and lifecycle
// decision below is made by the complete production window module, not a copy.
function fixture({ width = 1200, layout = 'desktop', initialGeometry } = {}) {
  const storage = new Map();
  const writes = [];
  let document;
  class Element {
    constructor(tag = 'div', className = '') {
      this.tagName = tag.toUpperCase();
      this.className = className;
      this.children = [];
      this.listeners = new Map();
      this.attributes = new Map();
      this.style = {};
      this.dataset = {};
      this.captures = new Set();
      this.hidden = false;
      this.inert = false;
      this.isConnected = true;
      this.classList = {
        add: name => { this.className = [...new Set([...this.className.split(' '), name])].join(' '); },
        remove: name => { this.className = this.className.split(' ').filter(value => value !== name).join(' '); },
        contains: name => this.className.split(' ').includes(name)
      };
    }
    append(...elements) { for (const element of elements) { element.parent = this; this.children.push(element); } }
    addEventListener(type, callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(callback);
    }
    fire(type, values = {}) {
      const event = {
        type, target: this, currentTarget: this, pointerId: 1, pointerType: 'mouse',
        button: 0, clientX: 100, clientY: 100,
        defaultPrevented: false, immediateStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {},
        stopImmediatePropagation() { this.immediateStopped = true; },
        ...values
      };
      for (const callback of this.listeners.get(type) || []) {
        callback(event);
        if (event.immediateStopped) break;
      }
      return event;
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part === ':hover') return false;
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        const match = part.match(/^(\w+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/);
        return !!match && (!match[1] || this.tagName === match[1].toUpperCase()) &&
          (!match[2] || this.attributes.has(match[2]) && (match[3] === undefined || this.getAttribute(match[2]) === match[3]));
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    querySelector(selector) {
      const [head, ...tail] = selector.split(' ');
      const found = this.children.find(child => child.matches(head)) || this.children.map(child => child.querySelector(head)).find(Boolean);
      return tail.length ? found?.querySelector(tail.join(' ')) || null : found || null;
    }
    set innerHTML(value) {
      // Only the module's static control chrome needs DOM nodes in this fixture.
      if (this.className === 'hf-edge-preview') {
        const progress = new Element('span', 'hf-edge-progress'); progress.append(new Element('b'));
        this.append(new Element('span', 'hf-edge-preview-symbol'), new Element('span', 'hf-edge-preview-label'), progress);
      } else if (this.className === 'hf-window-size-menu') {
        for (const size of ['small', 'medium', 'fit']) {
          const button = new Element('button'); button.dataset.windowSize = size; button.setAttribute('data-window-size', size); this.append(button);
        }
      }
    }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) {
      if (this.captures.delete(id)) this.fire('lostpointercapture', { pointerId: id });
    }
    focus() { document.activeElement = this; }
    getBoundingClientRect() {
      return { left: parseFloat(this.style.left) || 0, top: parseFloat(this.style.top) || 0, width: parseFloat(this.style.width) || 0, height: parseFloat(this.style.height) || 0 };
    }
  }

  const root = new Element(), os = new Element(), bottom = new Element('div', 'hf-bottom');
  const field = new Element(), dock = new Element(), desktop = new Element();
  field.clientWidth = width; field.clientHeight = 800;
  root.append(os); os.append(bottom, field, desktop); bottom.append(dock); dock.append(new Element('button'));
  const el = new Element('section', 'hf-window'), header = new Element('header', 'hf-window-header');
  const maximize = new Element('button'); maximize.setAttribute('data-maximize', '');
  header.append(maximize); el.append(header); field.append(el); el.dataset.app = 'Notes';
  const rec = { app: { name: 'Notes' }, el, x: 50, y: 60, w: 460, h: 390, space: 'desk', minimized: false };
  // A compact window must have room to move, as after using the Compact preset.
  storage.set('hole.window-geometry.v1', JSON.stringify({ Notes: initialGeometry || (width < 560 ? { x: 20, y: 30, w: 264, h: 300 } : { x: 50, y: 60, w: 460, h: 390 }) }));
  const windows = new Map([['Notes', rec]]);
  const api = { root, os, bottom, field, dock, desktop, windows, state: { layout, desk: { view: 'desk' } }, motion: () => false, resize() {}, focusWindow() {}, isDrawerOpen: false,
    minimize: value => { value.minimized = true; }, visitSpace: space => { api.state.desk.view = space; } };
  const window = new Element(); window.HoleOS = api;
  document = new Element(); document.createElement = tag => new Element(tag); document.activeElement = null;
  vm.runInNewContext(source, {
    window, document, performance,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { writes.push({ key, value }); storage.set(key, value); }
    },
    MutationObserver: class { observe() {} },
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: callback => callback()
  });
  const geometry = () => ({ x: rec.x, y: rec.y, w: rec.w, h: rec.h });
  const saved = () => JSON.parse(storage.get('hole.window-geometry.v1')).Notes;
  return { root, window, document, os, dock, rec, header, resizer: el.querySelector('.hf-window-resizer'),
    handle: bottom.querySelector('.hf-system-handle'), preview: os.querySelector('.hf-edge-preview'), geometry, saved, writes };
}

for (const kind of ['resize', 'move']) {
  for (const width of [1200, 400]) {
    const options = { width, layout: width < 560 ? 'pocket' : 'desktop' };
    const control = f => kind === 'resize' ? f.resizer : f.header;
    const begin = f => {
      const target = control(f);
      target.fire('pointerdown');
      target.fire('pointermove', { clientX: 135, clientY: 145 });
      return target;
    };

    test(`${kind} at ${width}px commits only on matching pointerup and survives a new session`, () => {
      const f = fixture(options), before = f.geometry(), target = begin(f);
      assert.notDeepEqual(f.geometry(), before, 'gesture previews changed geometry');
      assert.deepEqual(f.saved(), before, 'preview is not yet persisted');
      const preview = f.geometry();
      target.fire('pointerup');
      assert.deepEqual(f.saved(), preview);
      assert.equal(f.writes.length, 1, 'one commit per gesture');
      target.fire('lostpointercapture');
      assert.deepEqual(f.saved(), preview, 'normal post-release capture loss does not undo the commit');
      assert.equal(f.writes.length, 1);
      assert.deepEqual(fixture({ ...options, initialGeometry: f.saved() }).geometry(), preview, 'a new module session restores committed geometry');
    });

    for (const ending of ['pointercancel', 'lostpointercapture', 'Escape', 'blur', 'hidden']) {
      test(`${kind} at ${width}px rolls back on ${ending} without saving or resuming`, () => {
        const f = fixture(options), before = f.geometry(), target = begin(f);
        assert.notDeepEqual(f.geometry(), before, 'test exercised an active gesture');
        if (ending === 'Escape') {
          const event = f.root.fire('keydown', { key: 'Escape', target });
          assert.equal(event.defaultPrevented, true);
          assert.equal(event.immediateStopped, true, 'Escape cannot also minimize the window');
        } else if (ending === 'blur') f.window.fire('blur');
        else if (ending === 'hidden') { f.document.hidden = true; f.document.fire('visibilitychange'); }
        else target.fire(ending);
        assert.deepEqual(f.geometry(), before);
        assert.deepEqual(f.saved(), before);
        assert.equal(f.writes.length, 0, 'interrupted previews never become saved geometry');
        target.fire('pointermove', { clientX: 180, clientY: 190 });
        target.fire('pointerup');
        assert.deepEqual(f.geometry(), before, 'late events cannot resume a cancelled drag');
        assert.equal(f.writes.length, 0);
        assert.equal(f.rec.el.classList.contains('is-resizing'), false);
      });
    }

    test(`${kind} at ${width}px ignores another pointer throughout the gesture`, () => {
      const f = fixture(options), target = begin(f), preview = f.geometry();
      target.fire('pointerdown', { pointerId: 2, clientX: 200, clientY: 200 });
      target.fire('pointermove', { pointerId: 2, clientX: 240, clientY: 250 });
      target.fire('pointerup', { pointerId: 2 });
      target.fire('pointercancel', { pointerId: 2 });
      target.fire('lostpointercapture', { pointerId: 2 });
      assert.deepEqual(f.geometry(), preview, 'foreign events cannot change or cancel the owning pointer');
      assert.equal(f.writes.length, 0);
      target.fire('pointermove', { clientX: 145, clientY: 155 });
      assert.notDeepEqual(f.geometry(), preview, 'the owning pointer remains active');
      target.fire('pointerup');
      assert.deepEqual(f.saved(), f.geometry());
      assert.equal(f.writes.length, 1);
    });

    for (const transition of ['resize', 'minimize', 'close', 'space', 'fullscreen']) {
      test(`${kind} at ${width}px discards its preview before ${transition}`, () => {
        const f = fixture(options), before = f.geometry(), target = begin(f);
        if (transition === 'resize') f.window.fire('resize');
        else if (transition === 'space') f.root.fire('hole:space-change', { detail: { space: 'studio' } });
        else if (transition === 'fullscreen') f.window.HoleWindows.toggleFullscreen(f.rec);
        else f.root.fire('hole:window-change', { detail: { type: transition, rec: f.rec } });
        assert.deepEqual(f.saved(), before, 'transition must never persist a partial gesture');
        if (transition !== 'fullscreen') assert.deepEqual(f.geometry(), before);
        const after = f.geometry(), writes = f.writes.length;
        target.fire('pointermove', { clientX: 180, clientY: 190 });
        target.fire('pointerup');
        assert.deepEqual(f.geometry(), after);
        assert.equal(f.writes.length, writes, 'late release cannot commit after a transition');
      });
    }
  }
}

test('header controls and secondary mouse buttons cannot begin window movement', () => {
  const f = fixture(), before = f.geometry();
  f.header.fire('pointerdown', { button: 2 });
  f.header.fire('pointermove', { clientX: 150, clientY: 160 });
  f.header.fire('pointerup');
  f.header.fire('pointerdown', { target: f.header.querySelector('button') });
  f.header.fire('pointermove', { clientX: 150, clientY: 160 });
  f.header.fire('pointerup');
  assert.deepEqual(f.geometry(), before);
  assert.equal(f.writes.length, 0);
});

for (const ending of ['pointercancel', 'lostpointercapture', 'Escape', 'blur', 'hidden']) {
  test(`fullscreen edge preview restores the hidden dock immediately on ${ending}`, () => {
    const f = fixture();
    f.window.HoleWindows.toggleFullscreen(f.rec);
    assert.equal(f.os.dataset.dockRevealed, 'false');
    f.handle.fire('pointerdown', { clientY: 780 });
    f.handle.fire('pointermove', { clientY: 340 });
    assert.equal(f.preview.hidden, false);
    assert.equal(f.os.dataset.dockRevealed, 'true');
    assert.notEqual(f.rec.el.style.transform, '');
    if (ending === 'Escape') f.root.fire('keydown', { key: 'Escape', target: f.handle });
    else if (ending === 'blur') f.window.fire('blur');
    else if (ending === 'hidden') { f.document.hidden = true; f.document.fire('visibilitychange'); }
    else f.handle.fire(ending);
    assert.equal(f.preview.hidden, true);
    assert.equal(f.rec.el.style.transform, '');
    assert.equal(f.rec.el.style.opacity, '');
    assert.equal(f.os.dataset.dockRevealed, 'false', 'cancel must not wait for a hover-sensitive timer');
    assert.equal(f.dock.inert, true);
    assert.equal(f.handle.getAttribute('aria-expanded'), 'false');
    assert.equal(f.rec.holeFullscreen, true);
    assert.equal(f.rec.minimized, false);
    f.handle.fire('pointerup');
    assert.equal(f.rec.minimized, false, 'late release cannot commit a cancelled destination');
  });
}

test('another pointer losing capture cannot cancel the fullscreen edge preview', () => {
  const f = fixture(); f.window.HoleWindows.toggleFullscreen(f.rec);
  f.handle.fire('pointerdown', { clientY: 780 });
  f.handle.fire('pointermove', { clientY: 340 });
  f.handle.fire('lostpointercapture', { pointerId: 2 });
  assert.equal(f.preview.hidden, false);
  f.handle.fire('pointerup');
  assert.equal(f.rec.minimized, true, 'owning pointer can still commit all spaces');
  assert.equal(f.window.HoleOS.state.desk.view, 'overview');
});
