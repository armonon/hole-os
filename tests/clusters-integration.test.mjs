import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { fixture, plain, group, savedTree, section } from './cluster-fixture.mjs';

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

test('portable setup carries group and app geometry while excluding local file geometry and private data', () => {
  const f = fixture(), setup = plain(f.context.boundary.exportSetup());
  const ids = ['app-browser', 'color', 'group-child', 'group-parent', 'thought'];
  assert.equal(setup.version, 2);
  assert.deepEqual(Object.keys(setup.desk.files).sort(), ids);
  assert.deepEqual(Object.keys(setup.desk.placements).sort(), ids);
  assert.deepEqual(setup.clusters, savedTree().clusters);
  assert.deepEqual(setup.appPins, [{ name: 'Browser', space: 'studio' }]);
  assert.equal(Object.hasOwn(setup, 'pins'), false); assert.equal(Object.hasOwn(setup, 'note'), false);
});

test('Clusters has a valid launch origin while the drawer is open despite lacking a drawer tile', () => {
  const rectangle = { left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40 };
  const button = { isConnected: true, closest: () => null, querySelector: () => null, getBoundingClientRect: () => rectangle };
  const context = { drawerOpen: true, nodes: [], dockButtons: new Map([['Clusters', button]]), drawerToggle: button, field: button, os: button };
  vm.runInNewContext(section('  function sourceRect(', '  function morph(') + '\nglobalThis.origin=sourceRect({name:"Clusters"});', context);
  assert.equal(context.origin, rectangle);
});
