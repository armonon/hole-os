import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/clusters-model.js', import.meta.url), 'utf8');
const context = vm.createContext({}); vm.runInContext(source, context);
const model = context.HoleClusterModel;
const plain = value => JSON.parse(JSON.stringify(value));
const group = (id, members = [], name = id, kind = 'cluster') => ({ id, name, kind, members });
const normalize = (raw, items = ['note', 'photo', 'audio']) => plain(model.normalize(raw, items));
const nested = () => [group('group-a', ['note', 'group-b']), group('group-b', ['photo', 'group-c'], 'Folder', 'folder'), group('group-c', ['audio'])];
function assertForest(groups) {
  assert.ok(groups.length <= 80);
  const ids = new Set(groups.map(value => value.id)), owners = new Map();
  assert.equal(ids.size, groups.length);
  for (const container of groups) {
    assert.ok(container.name.length > 0 && container.name.length <= 60);
    assert.ok(['cluster', 'folder'].includes(container.kind));
    for (const item of container.members) {
      assert.notEqual(item, container.id);
      assert.equal(owners.has(item), false, 'one parent for ' + item);
      if (item.startsWith('group-')) assert.ok(ids.has(item), 'group reference exists');
      owners.set(item, container.id);
    }
  }
  assert.ok(owners.size <= 500);
  for (const id of ids) {
    const visited = new Set(); let current = id;
    while (current) { assert.equal(visited.has(current), false, 'no cycle through ' + current); visited.add(current); current = owners.get(current); }
  }
}

test('normalization accepts forward group references and returns only sanitized record fields', () => {
  const input = [
    { ...group('group-a', ['group-b', 'note', 'note', 'unknown', 'group-a']), extra: 'discard', name: '  A\n\u0000 project  ' },
    group('group-b', ['photo'], '', 'folder')
  ];
  assert.deepEqual(normalize(input), [group('group-a', ['group-b', 'note'], 'A project'), group('group-b', ['photo'], 'Untitled folder', 'folder')]);
  assert.deepEqual(input[0].members, ['group-b', 'note', 'note', 'unknown', 'group-a']);
});

test('invalid input, unsafe identities, duplicate group IDs and base collisions are rejected', () => {
  for (const raw of [null, false, 1, 'groups', {}, undefined]) assert.deepEqual(normalize(raw), []);
  const raw = [null, [], {}, group('__proto__'), group('constructor'), group('group-__proto__'), group('group-constructor'), group('group-a/b'), group('group-a'), group('group-a', ['photo']), group('group-base'), group('group-z', ['toString', '__proto__', 'group-missing'])];
  assert.deepEqual(normalize(raw, ['note', 'photo', 'group-base', 'toString']), [group('group-a'), group('group-z')]);
});

test('first valid membership wins globally while invalid edges do not reserve ownership', () => {
  const result = normalize([group('group-a', ['group-a', 'note']), group('group-b', ['note', 'group-a', 'photo']), group('group-c', ['photo', 'audio'])]);
  assert.deepEqual(result, [group('group-a', ['note']), group('group-b', ['group-a', 'photo']), group('group-c', ['audio'])]);
  assert.equal(model.parentOf(result, 'note').id, 'group-a');
  assert.equal(model.parentOf(result, 'group-a').id, 'group-b');
  assert.equal(model.parentOf(result, 'missing'), null);
  assert.equal(model.parentOf(result, '__proto__'), null);
});

test('normalization deterministically removes cycles without discarding valid descendants', () => {
  const raw = [group('group-a', ['group-b']), group('group-b', ['group-c']), group('group-c', ['group-a', 'note']), group('group-d', ['group-a'])];
  const result = normalize(raw);
  assert.deepEqual(result[2].members, ['note']);
  assert.deepEqual(result[3].members, ['group-a'], 'rejected cycle edge did not claim group-a');
  assert.deepEqual(normalize(raw), result);
  assert.deepEqual(normalize(result), result, 'normalization is idempotent');
  assertForest(result);
});

test('normalization enforces 80 groups and a global 500 membership links', () => {
  const items = Array.from({ length: 510 }, (_, i) => 'item-' + i);
  const raw = Array.from({ length: 85 }, (_, i) => group('group-' + i));
  raw[0].members = ['group-84', ...items.slice(0, 300)]; raw[1].members = items.slice(300);
  const result = normalize(raw, items);
  assert.equal(result.length, 80);
  assert.equal(result[0].members.length, 300, 'discarded group cannot become a leaf');
  assert.equal(result[1].members.length, 200);
  assert.equal(result.flatMap(value => value.members).length, 500);
  assertForest(result);
});

test('normalization accepts a Set of known base IDs without inferring unknown leaves', () => {
  assert.deepEqual(normalize([group('group-a', ['note', 'photo'])], new Set(['note'])), [group('group-a', ['note'])]);
  assert.deepEqual(normalize([group('group-a', ['note'])], 'note'), [group('group-a')]);
  assert.deepEqual(normalize([group('group-a', ['note'])], { [Symbol.toStringTag]: 'Set' }), [group('group-a')]);
});

test('restore and create ignore inherited fields and accessors without invoking them', () => {
  const inherited = Object.create(group('group-inherited', ['note'], 'Inherited', 'folder'));
  assert.deepEqual(normalize([inherited]), []);
  assert.deepEqual(plain(model.create([], inherited, ['note'])), []);
  const ownId = Object.assign(Object.create({ name: 'Inherited', members: ['note'], kind: 'folder' }), { id: 'group-own' });
  assert.deepEqual(normalize([ownId]), [group('group-own', [], 'Untitled cluster')]);
  assert.equal(model.parentOf([ownId], 'note'), null);
  const accessor = { name: 'Accessor', members: [] };
  Object.defineProperty(accessor, 'id', { get() { throw new Error('Do not invoke restore accessors'); } });
  assert.deepEqual(normalize([accessor]), []);
  assert.deepEqual(plain(model.create([], accessor, [])), []);
  assert.equal(Object.prototype.id, undefined);
});

test('add moves one item between parents and can attach an existing desktop root', () => {
  const input = [group('group-a', ['note']), group('group-b', ['photo'])];
  assert.equal(model.canAdd(input, 'note', 'group-b'), true);
  const moved = plain(model.add(input, 'note', 'group-b'));
  assert.deepEqual(moved, [group('group-a'), group('group-b', ['photo', 'note'])]);
  assert.deepEqual(plain(model.add(moved, 'audio', 'group-a'))[0].members, ['audio']);
  assert.deepEqual(input, [group('group-a', ['note']), group('group-b', ['photo'])]);
});

test('add rejects same parent, self, missing groups, unsafe IDs and ancestor cycles', () => {
  const input = nested();
  for (const [item, target] of [['note', 'group-a'], ['group-b', 'group-b'], ['group-a', 'group-c'], ['group-missing', 'group-a'], ['note', 'group-missing'], ['__proto__', 'group-a'], ['constructor', 'group-a']]) {
    assert.equal(model.canAdd(input, item, target), false);
    assert.deepEqual(plain(model.add(input, item, target)), input);
  }
  assert.equal(model.canAdd(input, 'group-c', 'group-a'), true, 'moving a descendant to an ancestor is safe');
  assertForest(plain(model.add(input, 'group-c', 'group-a')));
});

test('full membership capacity allows reparenting but rejects an additional root', () => {
  const input = [group('group-a', Array.from({ length: 500 }, (_, i) => 'item-' + i)), group('group-b')];
  assert.equal(model.canAdd(input, 'item-0', 'group-b'), true);
  assert.equal(model.canAdd(input, 'new-root', 'group-b'), false);
  const moved = plain(model.add(input, 'item-0', 'group-b'));
  assert.equal(moved[0].members.length, 499); assert.deepEqual(moved[1].members, ['item-0']);
  assert.deepEqual(plain(model.add(input, 'new-root', 'group-b')), input);
});

test('create validates members atomically and moves valid members out of former parents', () => {
  const input = [group('group-a', ['note', 'photo'])];
  const result = plain(model.create(input, { id: 'group-new', name: '  A folder  ', kind: 'folder', members: ['note', 'audio'] }, ['note', 'photo', 'audio']));
  assert.deepEqual(result, [group('group-a', ['photo']), group('group-new', ['note', 'audio'], 'A folder', 'folder')]);
  for (const specification of [
    { id: 'group-a', name: 'Duplicate' }, { id: 'group-base', name: 'Collision' }, { id: 'group-new', name: '' },
    { id: 'group-new', name: 'Unknown', members: ['missing'] }, { id: 'group-new', name: 'Repeat', members: ['note', 'note'] },
    { id: 'group-new', name: 'Self', members: ['group-new'] }, { id: 'group-new', name: 'Bad kind', kind: 'disk-folder' },
    { id: 'group-new', name: 'Bad members', members: 'note' }, { id: 'group-new', name: 'Null members', members: null },
    { id: 'group-new', name: 'Null kind', kind: null }, null
  ]) assert.deepEqual(plain(model.create(input, specification, ['note', 'photo', 'audio', 'group-base'])), input);
  assert.deepEqual(input, [group('group-a', ['note', 'photo'])]);
});

test('create can wrap nested containers without keeping duplicate descendant ownership', () => {
  const result = plain(model.create(nested(), { id: 'group-new', name: 'Bundle', members: ['group-a', 'group-c'] }, ['note', 'photo', 'audio']));
  assert.deepEqual(result.find(value => value.id === 'group-b').members, ['photo']);
  assert.deepEqual(result.at(-1).members, ['group-a', 'group-c']);
  assertForest(result);
});

test('create respects both caps while allowing transfers at full membership capacity', () => {
  const items = Array.from({ length: 501 }, (_, i) => 'item-' + i), full = [group('group-a', items.slice(0, 500))];
  const moved = plain(model.create(full, { id: 'group-b', name: 'Moved', members: ['item-0'] }, items));
  assert.equal(moved.length, 2); assert.equal(moved[0].members.length, 499);
  assert.deepEqual(plain(model.create(full, { id: 'group-b', name: 'Too many', members: ['item-500'] }, items)), full);
  const groups = Array.from({ length: 80 }, (_, i) => group('group-' + i));
  assert.deepEqual(plain(model.create(groups, { id: 'group-extra', name: 'Extra' }, [])), groups);
});

test('remove detaches membership only and never deletes groups or their contents', () => {
  const input = nested(), result = plain(model.remove(input, 'group-b'));
  assert.equal(result.length, input.length);
  assert.deepEqual(result[0].members, ['note']);
  assert.deepEqual(result[1], input[1]);
  assert.equal(model.parentOf(result, 'group-b'), null);
  assert.deepEqual(plain(model.remove(input, 'missing')), input);
});

test('rename sanitizes a nonempty 60-unit name and leaves kind and membership intact', () => {
  const input = nested(), result = plain(model.rename(input, 'group-b', ' \tA\u0000 new\nname  '));
  assert.deepEqual(result[1], group('group-b', ['photo', 'group-c'], 'A new name', 'folder'));
  assert.deepEqual(plain(model.rename(input, 'group-a', '\n\u0000 ')), input);
  assert.deepEqual(plain(model.rename(input, 'missing', 'Other')), input);
  const long = plain(model.rename(input, 'group-a', 'a'.repeat(59) + '🪐'))[0].name;
  assert.equal(long, 'a'.repeat(59), 'does not split a surrogate pair at the boundary');
});

test('ungroup replaces a nested container in-place with its children, preserving descendants', () => {
  const input = nested(), result = plain(model.ungroup(input, 'group-b'));
  assert.deepEqual(result, [group('group-a', ['note', 'photo', 'group-c']), group('group-c', ['audio'])]);
  assert.equal(model.parentOf(result, 'group-c').id, 'group-a');
  assert.equal(model.parentOf(result, 'audio').id, 'group-c');
  assertForest(result);
});

test('ungroup a root makes its children roots without deleting their containers or items', () => {
  const result = plain(model.ungroup(nested(), 'group-a'));
  assert.deepEqual(result, nested().slice(1));
  assert.equal(model.parentOf(result, 'group-b'), null);
  assert.equal(model.parentOf(result, 'note'), null);
  assert.deepEqual(plain(model.ungroup(result, 'missing')), result);
});

test('empty containers are allowed and ungroup preserves surrounding sibling order', () => {
  const empty = plain(model.create([], { id: 'group-empty', name: 'Empty folder', kind: 'folder' }, []));
  assert.deepEqual(empty, [group('group-empty', [], 'Empty folder', 'folder')]);
  assert.deepEqual(plain(model.ungroup(empty, 'group-empty')), []);
  const input = [group('group-parent', ['before', 'group-middle', 'after']), group('group-middle', ['first', 'group-inner', 'last']), group('group-inner', ['kept'])];
  const result = plain(model.ungroup(input, 'group-middle'));
  assert.deepEqual(result, [group('group-parent', ['before', 'first', 'group-inner', 'last', 'after']), group('group-inner', ['kept'])]);
  assertForest(result);
});

test('every operation returns new arrays and records and accepts frozen input', () => {
  const input = nested(); input.forEach(value => { Object.freeze(value.members); Object.freeze(value); }); Object.freeze(input);
  const actions = [
    () => model.normalize(input, ['note', 'photo', 'audio']), () => model.add(input, 'note', 'group-c'),
    () => model.add(input, 'note', 'group-a'), () => model.create(input, { id: 'group-new', name: 'New' }, ['note', 'photo', 'audio']),
    () => model.remove(input, 'note'), () => model.rename(input, 'group-a', 'Renamed'), () => model.ungroup(input, 'group-b')
  ];
  for (const action of actions) {
    const result = action(); assert.notEqual(result, input); assertForest(result);
    for (const record of result) {
      const original = input.find(value => value.id === record.id);
      if (original) { assert.notEqual(record, original); assert.notEqual(record.members, original.members); }
    }
  }
  assert.ok(Object.isFrozen(model));
});
