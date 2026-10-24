import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture, plain, group } from './cluster-fixture.mjs';

const legacy = extra => ({ format: 'hole-workspace', version: 1, layout: 'desktop', projects: [], views: {}, desk: { view: 'desk', files: {}, placements: {} }, ...extra });
const portable = extra => ({ ...legacy(), version: 2, appPins: [], clusters: [], ...extra });

for (const data of [null, [], legacy({ version: 99 }), legacy({ layout: 'invalid' }), legacy({ desk: 'not-an-object', layout: 'pocket', projects: [{ id: 'space-new', name: 'Must not appear' }] }), portable({ clusters: [group('group-self', ['group-self'])] })]) {
  test(`invalid setup ${JSON.stringify(data)} is rejected before state, DOM, focus or gesture changes`, () => {
    const f = fixture(); f.C.revealItem('local-file-1');
    const before = plain(f.state), descriptors = [...f.deskFiles], focus = f.document.activeElement, panel = f.mount().textContent;
    f.lifecycle.length = 0; f.writes.length = 0;
    assert.equal(f.context.boundary.importSetup(data), false);
    assert.deepEqual(plain(f.state), before);
    assert.deepEqual(f.deskFiles, descriptors);
    assert.equal(f.document.activeElement, focus);
    assert.equal(f.mount().textContent, panel);
    assert.deepEqual(f.lifecycle, []);
    assert.deepEqual(f.writes, []);
  });
}

test('valid legacy import preserves groups, app pins, file references and Notes while applying supported layout', () => {
  const f = fixture(), groups = plain(f.state.clusters), pins = plain(f.state.pins), appPins = plain(f.state.appPins);
  f.lifecycle.length = 0; f.writes.length = 0;
  const data = legacy({ layout: 'pocket', desk: { view: 'life', files: { color: { space: 'life', x: 30, y: 40 } }, placements: { color: { x: .3, y: .4 } } }, note: 'Do not import this', pins: [{ localId: 'invented', name: 'Invented.txt', space: 'desk' }], clusters: [] });
  assert.equal(f.context.boundary.importSetup(data), true);
  assert.equal(f.state.layout, 'pocket'); assert.equal(f.state.desk.view, 'life');
  assert.deepEqual(plain(f.state.desk.placements.color), { x: .3, y: .4 });
  assert.deepEqual(plain(f.state.clusters), groups);
  assert.deepEqual(plain(f.state.pins), pins); assert.deepEqual(plain(f.state.appPins), appPins);
  assert.equal(f.state.note, 'Original note'); assert.equal(f.state.clusterOpen, 'group-child');
  assert.deepEqual(f.lifecycle.slice(0, 2), ['cancel desktop', 'cancel drawer']);
  assert.equal(f.lifecycle.at(-1), 'save'); assert.equal(f.writes.length, 1);
});

test('version 2 round trip restores app shortcuts and nested groups without inventing unavailable local files', () => {
  const source = fixture(), data = plain(source.context.boundary.exportSetup()), target = fixture({}, { localIds: [] });
  target.lifecycle.length = 0; target.writes.length = 0;
  assert.equal(target.context.boundary.importSetup(data), true);
  const parent = target.state.clusters.find(value => value.id === 'group-parent'), child = target.state.clusters.find(value => value.id === 'group-child');
  assert.deepEqual(plain(parent.members), ['thought', 'group-child']);
  assert.deepEqual(plain(child.members), ['app-browser']);
  assert.equal(child.kind, 'folder'); assert.equal(child.name, 'Documents');
  assert.ok(target.deskFiles.find(file => file.id === 'app-browser')?.el.isConnected);
  assert.ok(target.deskFiles.find(file => file.id === 'group-child')?.el.isConnected);
  assert.equal(target.deskFiles.some(file => file.localId), false);
  assert.deepEqual(plain(target.state.pins), []);
  assert.equal(target.context.boundary.lastReport.groupsAdded, 2);
  assert.equal(target.context.boundary.lastReport.appsAdded, 1);
  assert.equal(target.context.boundary.lastReport.missingFiles, 1);
  assert.equal(target.state.note, 'Original note');
  assert.deepEqual(target.lifecycle.slice(0, 2), ['cancel desktop', 'cancel drawer']);
});

test('a stale pin cannot satisfy an imported local-file reference absent from the actual library', () => {
  const f = fixture(undefined, { localIds: [] }), beforePins = plain(f.state.pins), beforeDescriptors = [...f.deskFiles];
  const incoming = portable({ clusters: [group('group-imported', ['local-file-1', 'color'], 'Imported')] });
  assert.equal(f.context.boundary.importSetup(incoming), true);
  assert.deepEqual(plain(f.state.clusters.find(value => value.id === 'group-imported').members), ['color']);
  assert.equal(f.context.boundary.lastReport.missingFiles, 1);
  assert.deepEqual(plain(f.state.pins), beforePins, 'import does not manufacture a replacement pin');
  for (const original of beforeDescriptors.filter(file => !file.groupId)) assert.equal(f.deskFiles.find(file => file.id === original.id), original);
});

test('same-ID groups and existing membership win while a valid new group is merged', () => {
  const f = fixture(), prior = plain(f.state.clusters);
  const incoming = portable({ clusters: [group('group-parent', [], 'Incoming conflicting name'), group('group-new', ['thought', 'group-child', 'color'], 'New group')] });
  assert.equal(f.context.boundary.importSetup(incoming), true);
  for (const existing of prior) assert.deepEqual(plain(f.state.clusters.find(value => value.id === existing.id)), existing);
  assert.deepEqual(plain(f.state.clusters.find(value => value.id === 'group-new').members), ['color']);
  assert.equal(f.context.boundary.lastReport.groupsKept, 1);
  assert.ok(f.context.boundary.lastReport.skippedLinks >= 2);
});

test('import refreshes a currently open group while retaining its selection and connected keyboard focus', () => {
  const f = fixture(); f.C.revealItem('local-file-1');
  const oldControl = f.document.activeElement;
  const incoming = portable({ desk: { view: 'studio', files: {}, placements: {} }, clusters: [group('group-new', ['color'], 'Imported group')] });
  assert.equal(f.context.boundary.importSetup(incoming), true);
  assert.equal(f.state.clusterOpen, 'group-child');
  assert.equal(f.mount().querySelector('h2').textContent, 'Documents');
  assert.equal(oldControl.isConnected, false);
  assert.equal(f.document.activeElement.dataset.clusterItem, 'local-file-1');
  assert.ok(f.mount().contains(f.document.activeElement));
  assert.equal(f.H.windows.get('Clusters').el.hidden, false);
  f.button('All Clusters').click();
  assert.ok(f.button('Imported group'), 'the live panel includes newly imported groups');
});

test('setup serialization allowlists metadata instead of exposing private state or nested payloads', () => {
  const f = fixture();
  const secret = 'PRIVATE-BYTES-AND-NOTES-DO-NOT-EXPORT';
  f.state.note = secret; f.state.jobs = [{ content: secret }]; f.state.session = [{ name: 'Notes', draft: secret }];
  f.state.clusters[0].private = secret; f.state.clusters[0].history = [secret];
  f.state.desk.files.thought.extra = secret; f.state.desk.placements.thought.extra = secret;
  f.state.appPins[0].contents = secret;
  const setup = plain(f.context.boundary.exportSetup());
  assert.equal(setup.version, 2); assert.equal(JSON.stringify(setup).includes(secret), false);
  for (const key of ['note', 'pins', 'jobs', 'session', 'clusterOpen']) assert.equal(Object.hasOwn(setup, key), false, key);
  for (const key of Object.keys(setup.desk.files)) assert.equal(key.startsWith('local-'), false);
  assert.equal(setup.clusters[0].name, 'Project');
});
