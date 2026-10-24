import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { fixture as workspaceFixture, plain } from './cluster-fixture.mjs';

const source = await readFile(new URL('../src/welcome.js', import.meta.url), 'utf8');
const start = source.indexOf("  const setupInput = controls.querySelector('.hw-setup-input');");
const end = source.indexOf("  root.addEventListener('click'", start);
assert.ok(start >= 0 && end > start, 'Production setup input handler exists');
const handler = source.slice(start, end);
const setup = extra => ({ format: 'hole-workspace', version: 2, layout: 'desktop', projects: [], views: {}, appPins: [], clusters: [], desk: { view: 'desk', files: {}, placements: {} }, ...extra });
const file = data => ({ size: 100, text: async () => JSON.stringify(data) });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function fixture({ ready = Promise.resolve() } = {}) {
  const workspace = workspaceFixture({}), imports = [], notifications = [], persisted = [];
  const input = { files: [], value: '', addEventListener(type, callback) { assert.equal(type, 'change'); this.change = callback; } };
  const result = { textContent: '' }, prefs = { quiet: false, focus: false, stories: true, startHere: true, theme: 'auto' };
  const H = {
    importSetup(data) { imports.push(data); return workspace.context.boundary.importSetup(data); },
    get lastSetupImport() { return workspace.context.boundary.lastReport; }
  };
  const context = { H, window: { HoleFiles: { ready } }, prefs,
    controls: { querySelector: selector => selector === '.hw-setup-input' ? input : selector === '.hw-setup-result' ? result : null },
    persist: () => persisted.push(plain(prefs)), syncPrefs() {}, notify: message => notifications.push(message)
  };
  vm.runInNewContext(handler + '\nglobalThis.summary=setupSummary;', context);
  function select(value) { input.files = value ? [value] : []; input.value = value ? 'synthetic-selection.json' : ''; return input.change(); }
  return { workspace, imports, notifications, persisted, input, result, prefs, select, summary: context.summary };
}

test('Welcome accepts version 2 through the real import boundary and reports partial results persistently', async () => {
  const f = fixture();
  await f.select(file(setup({ clusters: [{ id: 'group-import', name: 'Imported', kind: 'cluster', members: ['local-missing', 'thought'] }], welcome: { quiet: true, theme: 'dark' } })));
  assert.equal(f.imports.length, 1); assert.equal(f.workspace.state.clusters.length, 1);
  assert.match(f.result.textContent, /1 group added/); assert.match(f.result.textContent, /1 unavailable local file links skipped/);
  assert.doesNotMatch(f.result.textContent, /other unavailable or conflicting memberships/, 'missing local links are not counted twice in the visible summary');
  assert.match(f.result.textContent, /File contents and Notes were not imported or changed/);
  assert.equal(f.prefs.theme, 'dark'); assert.equal(f.prefs.quiet, true); assert.equal(f.persisted.length, 1);
  assert.equal(f.input.value, ''); assert.deepEqual(f.notifications, [], 'the result is retained in the status panel');
});

test('invalid JSON, unsupported setup and a throwing reader cannot change workspace or preferences', async () => {
  const badFiles = [
    { size: 100, text: async () => '{not json' },
    file(setup({ version: 9, welcome: { theme: 'dark', quiet: true } })),
    { size: 100, text: async () => { throw new Error('Read failed'); } }
  ];
  for (const bad of badFiles) {
    const f = fixture(), before = plain(f.workspace.state), prefs = plain(f.prefs);
    await f.select(bad);
    assert.deepEqual(plain(f.workspace.state), before); assert.deepEqual(plain(f.prefs), prefs); assert.equal(f.persisted.length, 0);
    assert.match(f.result.textContent, /not a valid Hole workspace setup/);
    assert.equal(f.input.value, '');
  }
});

test('oversized inputs are rejected before reading or importing their contents', async () => {
  const f = fixture(); let reads = 0;
  await f.select({ size: 1024 * 1024 + 1, text: async () => { reads++; return '{}'; } });
  assert.equal(reads, 0); assert.equal(f.imports.length, 0); assert.match(f.result.textContent, /smaller than 1 MB/);
});

test('library readiness is awaited before resolving file references or applying preferences', async () => {
  const loading = deferred(), f = fixture({ ready: loading.promise });
  const applying = f.select(file(setup({ welcome: { theme: 'dark' } })));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.imports.length, 0); assert.equal(f.prefs.theme, 'auto');
  loading.resolve(); await applying;
  assert.equal(f.imports.length, 1); assert.equal(f.prefs.theme, 'dark');
});

test('a late older file read cannot overwrite a newer successful setup or its result', async () => {
  const slow = deferred(), f = fixture();
  const older = f.select({ size: 100, text: () => slow.promise });
  await f.select(file(setup({ layout: 'pocket', welcome: { theme: 'dark' } })));
  const result = f.result.textContent;
  slow.resolve(JSON.stringify(setup({ welcome: { theme: 'light' } }))); await older;
  assert.equal(f.imports.length, 1); assert.equal(f.workspace.state.layout, 'pocket'); assert.equal(f.prefs.theme, 'dark');
  assert.equal(f.result.textContent, result);
});

test('an older attempt waiting for the library cannot race a newer selected file', async () => {
  const loading = deferred(), f = fixture({ ready: loading.promise });
  const older = f.select(file(setup({ welcome: { theme: 'light' } })));
  await Promise.resolve(); await Promise.resolve();
  const newer = f.select(file(setup({ layout: 'pocket', welcome: { theme: 'dark' } })));
  loading.resolve(); await Promise.all([older, newer]);
  assert.equal(f.imports.length, 1); assert.equal(f.workspace.state.layout, 'pocket'); assert.equal(f.prefs.theme, 'dark');
});

for (const replacement of ['cancel selection', 'oversized selection']) {
  test(`${replacement} invalidates a previous pending read`, async () => {
    const slow = deferred(), f = fixture();
    const older = f.select({ size: 100, text: () => slow.promise });
    await f.select(replacement === 'cancel selection' ? null : { size: 1024 * 1024 + 1, text: async () => '{}' });
    const result = f.result.textContent;
    if (replacement === 'cancel selection') assert.equal(result, 'No setup selected.');
    slow.resolve(JSON.stringify(setup({ layout: 'pocket', welcome: { theme: 'dark' } }))); await older;
    assert.equal(f.imports.length, 0); assert.equal(f.workspace.state.layout, 'desktop'); assert.equal(f.prefs.theme, 'auto');
    assert.equal(f.result.textContent, result);
  });
}

test('an obsolete read failure cannot replace the result of a newer successful import', async () => {
  const slow = deferred(), f = fixture(), older = f.select({ size: 100, text: () => slow.promise });
  await f.select(file(setup())); const result = f.result.textContent;
  slow.reject(new Error('Old file became unavailable')); await older;
  assert.equal(f.result.textContent, result); assert.equal(f.imports.length, 1);
});

test('Welcome preferences accept only declared primitive values after successful import', async () => {
  const f = fixture();
  await f.select(file(setup({ welcome: { quiet: 'true', focus: true, stories: false, startHere: 0, theme: 'invalid', note: 'private' } })));
  assert.deepEqual(plain(f.prefs), { quiet: false, focus: true, stories: false, startHere: true, theme: 'auto' });
  assert.equal(f.persisted.length, 1);
});

test('summary makes preserved groups, missing files and skipped memberships distinct', () => {
  const f = fixture(), message = f.summary({ groupsAdded: 2, groupsKept: 3, missingFiles: 4, skippedLinks: 5, skippedApps: 6, skippedGroups: 1, spacesFallback: 1 });
  for (const fragment of ['2 groups added', '3 existing groups kept', '4 unavailable local file links skipped', '1 other unavailable or conflicting memberships skipped', '6 unavailable app shortcuts skipped', 'Unavailable space destinations use My desk', 'limits']) assert.ok(message.includes(fragment), fragment);
});
