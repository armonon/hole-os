import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the production state boundary without loading the DOM-driven shell.
const source = await readFile(new URL('../src/hole-fluid-os.html', import.meta.url), 'utf8');
const start = source.indexOf('  function restore(s)');
const end = source.indexOf('  restore(window.openai', start);
assert.ok(start >= 0 && end > start, 'production restore function is present');
const restoreSource = source.slice(start, end);
const spacesExpression = source.match(/^  const spaces=(.*);$/m)?.[1];
assert.ok(spacesExpression, 'production spaces initializer is present');

function fixture() {
  const context = vm.createContext({});
  vm.runInContext(`
    const spaces = ${spacesExpression};
    const deskFiles = [{ id: 'thought', name: 'A thought', app: 'Notes', kind: 'note', space: 'desk', x: 0, y: 0 }];
    const state = {
      layout: 'desktop', note: 'Keep this note', playing: false, projects: [], pins: [], session: [], recentApps: [], views: {},
      desk: { view: 'desk', files: { thought: { space: 'desk', x: 0, y: 0 } }, placements: { thought: { x: .4, y: .5 } } }
    };
    const byName = new Map([['Notes', {}], ['Files', {}], ['Music', {}]]);
    const pinnedApps = ['Notes', 'Music', 'Files'];
    ${restoreSource}
    globalThis.fixture = { restore, state, spaces, deskFiles };
  `, context);
  return context.fixture;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('malformed state and invalid project identities do not replace the active space', () => {
  const f = fixture();
  for (const invalid of [null, false, 42, 'text']) assert.doesNotThrow(() => f.restore(invalid));
  f.restore({ projects: [null, {}, { id: '__proto__', name: 'Bad' }, { id: 'space-valid', name: '   ' }, { id: 'space-<script>', name: 'Bad' }], desk: { view: 'constructor' } });
  assert.equal(f.state.projects.length, 0);
  assert.equal(f.state.desk.view, 'desk');
  assert.equal(f.state.note, 'Keep this note');
});

test('inherited property names are rejected as file, pin, and session spaces', () => {
  for (const space of ['__proto__', 'constructor', 'toString']) {
    const f = fixture();
    f.restore({
      pins: [{ localId: 'test-file', name: 'Test file', kind: 'note', space }],
      session: [{ name: 'Notes', space, minimized: false }],
      desk: { files: { thought: { space, x: 10, y: 10 } } }
    });
    assert.equal(f.state.pins.length, 0, space + ' must not be a pin destination');
    assert.equal(f.state.session.length, 0, space + ' must not be a session destination');
    assert.equal(f.state.desk.files.thought.space, 'desk', space + ' must not move a file');
  }
});

test('merging setup projects respects the total twelve-space limit', () => {
  const f = fixture();
  f.restore({ projects: Array.from({ length: 11 }, (_, i) => ({ id: 'space-existing-' + i, name: 'Existing ' + i })) });
  f.restore({ projects: Array.from({ length: 12 }, (_, i) => ({ id: 'space-imported-' + i, name: 'Imported ' + i })) });
  assert.equal(f.state.projects.length, 12);
  assert.equal(Object.keys(f.spaces).length, 15);
  assert.equal(new Set(f.state.projects.map(p => p.id)).size, 12);
  for (const project of f.state.projects) assert.ok(Object.hasOwn(f.spaces, project.id));
});

test('restored pins retain only normalized descriptor fields', () => {
  const f = fixture();
  const name = 'N'.repeat(220);
  f.restore({ pins: [{ localId: 'file-123', name, space: 'studio', kind: 'unexpected', contents: 'private bytes', arbitrary: { nested: true } }] });
  assert.equal(f.state.pins.length, 1);
  const pin = plain(f.state.pins[0]);
  assert.deepEqual(Object.keys(pin).sort(), ['kind', 'localId', 'name', 'space']);
  assert.equal(pin.name.length, 180);
  assert.equal(pin.kind, 'folder');
  assert.equal(f.deskFiles.find(file => file.localId === 'file-123').name, pin.name);
});

test('filenames and project names remain literal text', () => {
  const f = fixture();
  const name = '<img src=x onerror="alert(1)"> & a "title"';
  f.restore({ projects: [{ id: 'space-literal', name }], pins: [{ localId: 'literal-file', name, space: 'desk', kind: 'note' }] });
  assert.equal(f.state.pins[0].name, name);
  assert.equal(f.deskFiles.find(file => file.localId === 'literal-file').name, name);
  assert.equal(f.state.projects[0].name, name.slice(0, 40));
  assert.equal(f.spaces['space-literal'].name, name.slice(0, 40));
});

test('valid restored coordinates are bounded and nonfinite coordinates are ignored', () => {
  const f = fixture();
  f.restore({ views: { desk: { x: 999, y: -999, z: 999 }, studio: { x: Infinity, y: 0, z: 1 } }, desk: { files: { thought: { space: 'studio', x: 9999, y: -9999 } }, placements: { thought: { x: 5, y: -5 } } } });
  assert.deepEqual(plain(f.state.views.desk), { x: 1.8, y: -1.8, z: 2.2 });
  assert.equal(f.state.views.studio, undefined);
  assert.deepEqual(plain(f.state.desk.files.thought), { space: 'studio', x: 1050, y: -450 });
  assert.deepEqual(plain(f.state.desk.placements.thought), { x: 1, y: 0 });
});
