import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const [source, shell, ecosystem] = await Promise.all([
  readFile(new URL('../src/capabilities.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/hole-fluid-os.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/ecosystem.js', import.meta.url), 'utf8')
]);
const context = vm.createContext({});
vm.runInContext(source, context);
const capabilities = context.HoleCapabilities;
const plain = value => JSON.parse(JSON.stringify(value));
const route = (type, size = 100) => plain(capabilities.forFile({ type, size }));

test('every actual app has one explicit, human-readable classification', () => {
  const base = vm.runInNewContext(shell.match(/const apps=(\[[\s\S]*?\])\.map/)[1]).map(app => app[0]);
  const external = { window: {} }; vm.runInNewContext(ecosystem, external);
  const names = [...base, ...external.window.HoleCatalog.map(app => app.name)];
  const entries = plain(capabilities.list());
  assert.equal(names.length, 52);
  assert.deepEqual(entries.map(app => app.name).sort(), names.sort());
  assert.equal(new Set(entries.map(app => app.name)).size, entries.length);
  for (const app of entries) {
    assert.ok(['local', 'external', 'partial', 'concept', 'future'].includes(app.status), app.name);
    assert.ok(app.label.length > 4 && app.description.length > 15, app.name);
    assert.deepEqual(plain(capabilities.get(app.name)), { status: app.status, label: app.label, description: app.description });
  }
});

test('classification distinguishes local tools, sample previews, external launchers and future systems', () => {
  for (const name of ['Notes', 'Files', 'Clock']) assert.equal(capabilities.get(name).status, 'local');
  for (const name of ['Music', 'Photos']) assert.equal(capabilities.get(name).status, 'partial');
  for (const name of ['Browser', 'Luma', 'Bounce', 'Librarian']) assert.equal(capabilities.get(name).status, 'external');
  for (const name of ['Windows', 'Linux', 'Mac']) assert.equal(capabilities.get(name).status, 'future');
  for (const name of ['Settings', 'Messages', 'Books', 'Canvas']) assert.equal(capabilities.get(name).status, 'concept');
  assert.match(capabilities.get('Clock').description, /captured when opened/);
  assert.match(capabilities.get('Music').description, /soundless/);
  assert.match(capabilities.get('Photos').description, /sample/);
});

test('unknown or inherited catalog names do not silently become supported apps', () => {
  for (const name of ['Unknown', '__proto__', 'constructor', 'toString', '', null, {}, 1]) assert.equal(capabilities.get(name), null);
});

test('text editor accepts only plain text and Markdown within the byte limit', () => {
  for (const type of ['text/plain', 'text/markdown']) {
    for (const size of [0, 1, 262144]) assert.deepEqual(route(type, size).map(value => value.id), ['text-editor']);
    assert.deepEqual(route(type, 262145), []);
  }
  for (const type of ['text/html', 'text/javascript', 'application/json', 'text/csv', 'image/svg+xml', 'text/plain; charset=utf-8', 'TEXT/PLAIN', '']) assert.deepEqual(route(type), []);
});

test('external routes are restricted to the conservatively reviewed MIME types', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) assert.equal(route(type)[0].id, 'luma');
  for (const type of ['audio/mpeg', 'audio/wav', 'audio/x-wav']) assert.equal(route(type)[0].id, 'bounce');
  assert.equal(route('application/pdf')[0].id, 'librarian');
  for (const type of ['image/gif', 'image/bmp', 'image/avif', 'image/svg+xml', 'audio/mp4', 'audio/flac', 'audio/ogg', 'video/mp4', 'application/octet-stream', '.pdf']) assert.deepEqual(route(type), []);
  for (const type of ['image/png', 'audio/mpeg', 'application/pdf']) {
    const selected = route(type)[0];
    assert.equal(selected.mode, 'external');
    assert.equal(new URL(selected.url).protocol, 'https:');
    assert.match(selected.description, /separate/);
    assert.match(selected.description, /choose it there yourself/);
  }
});

test('malformed size or type metadata never offers an editable or external route', () => {
  for (const size of [-1, NaN, Infinity, -Infinity, '20', null, undefined, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    for (const type of ['text/plain', 'image/png', 'application/pdf']) assert.deepEqual(plain(capabilities.forFile({ type, size })), []);
  }
  for (const file of [null, undefined, {}, { name: 'unsafe.txt', size: 20 }, { type: {}, size: 20 }]) assert.deepEqual(plain(capabilities.forFile(file)), []);
});

test('callers cannot mutate shared registry metadata or route definitions', () => {
  assert.throws(() => { capabilities.get('Notes').status = 'external'; }, TypeError);
  assert.throws(() => { capabilities.forFile({ type: 'image/png', size: 10 })[0].url = 'https://example.com'; }, TypeError);
  const entries = capabilities.list(); entries[0].status = 'external';
  assert.equal(capabilities.get('Notes').status, 'local');
});
