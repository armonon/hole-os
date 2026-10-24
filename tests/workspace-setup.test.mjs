import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
for (const file of ['clusters-model.js', 'workspace-setup.js']) vm.runInContext(await readFile(new URL('../src/' + file, import.meta.url), 'utf8'), context);
const S = context.HoleSetup, plain = value => JSON.parse(JSON.stringify(value));
const group = (id, members = [], name = id, kind = 'cluster') => ({ id, name, kind, members });
const point = (space = 'desk', x = 10, y = 20) => ({ space, x, y });
const setup = extra => ({ format: 'hole-workspace', version: 2, layout: 'desktop', projects: [], appPins: [], clusters: [], desk: { view: 'desk', files: {}, placements: {} }, ...extra });
function environment(overrides = {}) {
  const state = {
    layout: 'desktop', note: 'PRIVATE NOTE', session: [{ name: 'Files' }], jobs: [{ detail: 'PRIVATE JOB' }],
    projects: [{ id: 'space-work', name: 'My project' }],
    appPins: [{ name: 'Notes', space: 'studio', extra: 'PRIVATE APP FIELD' }],
    pins: [{ localId: 'file-1', name: 'PRIVATE FILENAME.txt', bytes: 'PRIVATE FILE' }],
    clusters: [group('group-old', ['thought', 'local-file-1'], 'Existing', 'folder')], clusterOpen: 'group-old',
    views: { desk: { x: .2, y: .3, z: 1 }, constructor: { x: 0, y: 0, z: 1 } },
    desk: { view: 'studio', files: { thought: point('studio'), color: point(), 'group-old': point('studio', 100, 200), 'app-notes': point('studio', 50, 60), 'local-file-1': point('studio') }, placements: { thought: { x: .1, y: .2 }, color: { x: .3, y: .4 }, 'group-old': { x: .5, y: .6 }, 'app-notes': { x: .7, y: .8 }, 'local-file-1': { x: .2, y: .3 } } }
  };
  return { state, itemIds: ['thought', 'color', 'app-notes', 'local-file-1'], appNames: ['Notes', 'Browser', 'Files'], localIds: ['file-1'], ...overrides };
}
const plan = (data, env = environment()) => plain(S.plan(data, env));
function apply(env, result) {
  const state = { ...plain(env.state), ...result.restore, desk: { ...env.state.desk, ...result.restore.desk, files: { ...env.state.desk.files, ...result.restore.desk.files }, placements: { ...env.state.desk.placements, ...result.restore.desk.placements } } };
  const itemIds = [...new Set([...env.itemIds, ...state.appPins.map(pin => 'app-' + pin.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))])];
  return { ...env, state, itemIds };
}

test('v2 export contains explicit metadata only, with local references but no filenames or bytes', () => {
  const env = environment(); env.state.clusters[0].extra = 'PRIVATE GROUP FIELD'; env.state.desk.files.color.payload = 'PRIVATE POSITION FIELD';
  const result = plain(S.serialize(env.state, env)), json = JSON.stringify(result);
  assert.equal(result.version, 2); assert.equal(result.format, 'hole-workspace');
  assert.ok(json.includes('local-file-1'), 'an opaque reference is portable');
  assert.equal(json.includes('PRIVATE'), false);
  assert.deepEqual(Object.keys(result).sort(), ['appPins', 'clusters', 'desk', 'format', 'layout', 'projects', 'version', 'views']);
  assert.equal(Object.hasOwn(result.desk.files, 'local-file-1'), false); assert.equal(Object.hasOwn(result.desk.placements, 'local-file-1'), false);
  assert.deepEqual(result.appPins, [{ name: 'Notes', space: 'studio' }]);
  assert.deepEqual(Object.keys(result.clusters[0]).sort(), ['id', 'kind', 'members', 'name']);
  assert.equal(Object.hasOwn(result.views, 'constructor'), false);
});

test('unsupported or malformed root formats are rejected without altering current state', () => {
  const env = environment(), before = plain(env);
  for (const raw of [null, [], false, 1, 'text', {}, setup({ version: 3 }), setup({ version: '2' }), setup({ format: 'other' }), setup({ layout: 'unknown' }), setup({ desk: null }), setup({ desk: { view: 'constructor' } }), setup({ desk: { view: 'space-<script>' } }), setup({ projects: {} }), setup({ views: [] })]) assert.equal(S.plan(raw, env), null);
  assert.deepEqual(plain(env), before);
});

test('required v2 arrays, group identities, names and kinds are validated atomically', () => {
  for (const fields of [{ clusters: null }, { appPins: undefined }, { appPins: {} }, { clusters: [null] }, { clusters: [group('__proto__')] }, { clusters: [group('group-constructor')] }, { clusters: [group('group-a', [], '')] }, { clusters: [group('group-a', [], 'x'.repeat(61))] }, { clusters: [group('group-a', [], 'A', 'disk-folder')] }, { clusters: [group('group-a'), group('group-a')] }, { clusters: [{ ...group('group-a'), members: null }] }]) assert.equal(S.plan(setup(fields), environment()), null);
});

test('self links, cycles and global duplicates reject the entire input before missing references are filtered', () => {
  for (const clusters of [
    [group('group-a', ['group-a'])],
    [group('group-a', ['group-b']), group('group-b', ['group-a'])],
    [group('group-old', ['group-b']), group('group-b', ['group-old'])],
    [group('group-a', ['missing', 'missing'])],
    [group('group-a', ['local-missing']), group('group-b', ['local-missing'])],
    [group('group-a', ['group-b']), group('group-b', ['group-c']), group('group-c', ['group-a'])]
  ]) assert.equal(S.plan(setup({ clusters }), environment()), null);
});

test('inherited fields, accessors and prototype-like member identities cannot enter a plan', () => {
  assert.equal(S.plan(Object.create(setup()), environment()), null);
  assert.equal(S.plan(setup({ clusters: [Object.create(group('group-inherited'))] }), environment()), null);
  const raw = setup(); Object.defineProperty(raw, 'layout', { get() { throw new Error('Do not execute imported accessors'); } });
  assert.equal(S.plan(raw, environment()), null);
  assert.equal(S.plan(setup({ clusters: [group('group-a', ['constructor'])] }), environment()), null);
  const env = environment();
  Object.defineProperty(env.state.desk.files['app-notes'], 'space', { get() { throw new Error('Do not invoke snapshot accessors'); } });
  assert.doesNotThrow(() => S.serialize(env.state, env));
  assert.doesNotThrow(() => S.plan(setup(), env));
  assert.equal(Object.prototype.polluted, undefined);
});

test('forward group references preserve declared nesting and every newly accepted identity', () => {
  const result = plan(setup({ clusters: [group('group-a', ['group-b']), group('group-b', ['color'], 'Child', 'folder')] }));
  assert.deepEqual(result.restore.clusters.slice(1), [group('group-a', ['group-b']), group('group-b', ['color'], 'Child', 'folder')]);
  assert.equal(result.report.groupsAdded, 2);
});

test('colliding groups retain names, contents, kind, geometry and current selection', () => {
  const env = environment(), old = plain(env.state);
  const incoming = setup({ clusters: [group('group-old', ['color'], 'Replaced')], clusterOpen: 'anything', desk: { view: 'life', files: { 'group-old': point('life', 999, 999) }, placements: { 'group-old': { x: 0, y: 0 } } } });
  const result = plan(incoming, env);
  assert.deepEqual(result.restore.clusters, old.clusters); assert.equal(result.restore.clusterOpen, 'group-old');
  assert.deepEqual(result.restore.desk.files['group-old'], old.desk.files['group-old']);
  assert.deepEqual(result.restore.desk.placements['group-old'], old.desk.placements['group-old']);
  assert.equal(result.report.groupsKept, 1); assert.equal(result.report.groupsAdded, 0);
});

test('incoming groups cannot capture an existing root group or steal existing memberships', () => {
  const result = plan(setup({ clusters: [group('group-new', ['group-old', 'thought', 'color', 'local-file-1'])] }));
  assert.deepEqual(result.restore.clusters[0], environment().state.clusters[0]);
  assert.deepEqual(result.restore.clusters[1].members, ['color']);
  assert.equal(result.report.skippedLinks, 3);
  assert.equal(result.report.missingFiles, 0);
});

test('local references require both a known desktop pin and an actual file-library UUID', () => {
  for (const overrides of [
    { itemIds: ['thought', 'color'], localIds: ['free-file'] },
    { itemIds: ['thought', 'color', 'local-free-file'], localIds: [] },
    { itemIds: ['thought', 'color', 'local-free-file'], localIds: ['other'] }
  ]) {
    const result = plan(setup({ clusters: [group('group-new', ['local-free-file'])] }), environment(overrides));
    assert.deepEqual(result.restore.clusters.at(-1).members, []);
    assert.equal(result.report.missingFiles, 1); assert.equal(result.report.skippedLinks, 1);
    assert.equal(Object.hasOwn(result.restore.desk.files, 'local-free-file'), false);
  }
  const env = environment({ itemIds: ['thought', 'color', 'app-notes', 'local-file-1', 'local-free-file'], localIds: ['file-1', 'free-file'] });
  const result = plan(setup({ clusters: [group('group-new', ['local-free-file'])] }), env);
  assert.deepEqual(result.restore.clusters.at(-1).members, ['local-free-file']);
  assert.equal(result.report.missingFiles, 0);
});

test('missing new file references never erase unrelated existing memberships', () => {
  const env = environment({ localIds: [] });
  const result = plan(setup({ clusters: [group('group-new', ['local-missing'])] }), env);
  assert.deepEqual(result.restore.clusters[0], env.state.clusters[0]);
  assert.equal(result.report.missingFiles, 1);
});

test('new app pins use catalog names while unsupported apps and unknown links are reported', () => {
  const result = plan(setup({ appPins: [{ name: 'Browser', space: 'life', url: 'javascript:alert(1)' }, { name: 'Unknown App', space: 'desk' }], clusters: [group('group-new', ['app-browser', 'app-unknown', 'unknown', 'group-unknown'])] }));
  assert.deepEqual(result.restore.appPins, [{ name: 'Notes', space: 'studio' }, { name: 'Browser', space: 'life' }]);
  assert.deepEqual(result.restore.clusters.at(-1).members, ['app-browser']);
  assert.equal(result.report.appsAdded, 1); assert.equal(result.report.skippedApps, 1); assert.equal(result.report.skippedLinks, 3);
});

test('existing app pin geometry is preserved even when the import declares a different destination', () => {
  const env = environment(), result = plan(setup({ appPins: [{ name: 'Notes', space: 'life' }], desk: { view: 'life', files: { 'app-notes': point('life', 99, 99) }, placements: { 'app-notes': { x: 0, y: 0 } } } }), env);
  assert.equal(result.report.appsAdded, 0);
  assert.deepEqual(result.restore.appPins, [{ name: 'Notes', space: 'studio' }]);
  assert.deepEqual(result.restore.desk.files['app-notes'], env.state.desk.files['app-notes']);
  assert.deepEqual(result.restore.desk.placements['app-notes'], env.state.desk.placements['app-notes']);
});

test('malformed app pins cannot create descriptors and duplicate declarations reject atomically', () => {
  for (const appPins of [[null], [{ name: null, space: 'desk' }], [{ name: 'Browser', space: '__proto__' }], [{ name: 'Browser', space: 'overview' }], [{ name: 'Browser', space: 'desk' }, { name: 'Browser', space: 'life' }]]) assert.equal(S.plan(setup({ appPins }), environment()), null);
});

test('existing project names win, only twelve projects fit, and unresolved destinations report a fallback', () => {
  const env = environment(); env.state.projects = Array.from({ length: 12 }, (_, i) => ({ id: 'space-' + i, name: 'Existing ' + i }));
  const result = plan(setup({ projects: [{ id: 'space-0', name: 'Overwrite' }, { id: 'space-overflow', name: 'Extra' }], appPins: [{ name: 'Browser', space: 'space-overflow' }], clusters: [group('group-new')], desk: { view: 'space-overflow', files: { 'group-new': point('space-overflow') } } }), env);
  assert.deepEqual(result.restore.projects, env.state.projects);
  assert.equal(result.report.skippedProjects, 1); assert.equal(result.report.spacesFallback, 1);
  assert.equal(result.restore.desk.view, 'desk'); assert.equal(result.restore.desk.files['group-new'].space, 'desk');
  assert.equal(result.restore.appPins.at(-1).space, 'desk');
});

test('numeric geometry and views are finite, bounded and allowlisted', () => {
  const raw = setup({ views: { desk: { x: 10, y: -10, z: 30 }, drawer: { x: Infinity, y: 0, z: 1 }, constructor: { x: 0, y: 0, z: 1 } }, clusters: [group('group-new')], desk: { view: 'desk', files: { color: point('life', 9999, -9999), 'group-new': point(), unknown: point(), 'local-file-1': point('life'), thought: point('life') }, placements: { color: { x: 3, y: -3 }, unknown: { x: 0, y: 0 }, 'local-file-1': { x: 0, y: 0 } } } });
  const result = plan(raw);
  assert.deepEqual(result.restore.views.desk, { x: 1.8, y: -1.8, z: 2.2 }); assert.equal(Object.hasOwn(result.restore.views, 'constructor'), false);
  assert.deepEqual(result.restore.desk.files.color, point('life', 1050, -450));
  assert.deepEqual(result.restore.desk.placements.color, { x: 1, y: 0 });
  assert.deepEqual(result.restore.desk.files.thought, environment().state.desk.files.thought, 'owned item geometry is protected');
  assert.equal(Object.hasOwn(result.restore.desk.files, 'unknown'), false); assert.equal(Object.hasOwn(result.restore.desk.files, 'local-file-1'), false);
});

test('v1 imports only base layout geometry and preserves current groups, app pins, selection and private state', () => {
  const env = environment(), data = setup({ version: 1, appPins: [{ name: 'Browser', space: 'desk' }], clusters: [group('group-injected')], pins: [{ localId: 'bad' }], note: 'Overwrite private note', desk: { view: 'life', files: { color: point('life', 40, 50), thought: point('life'), 'group-old': point('life'), 'app-notes': point('life'), 'local-file-1': point('life') }, placements: { 'group-old': { x: 0, y: 0 }, 'app-notes': { x: 0, y: 0 } } }, welcome: { theme: 'dark' } });
  const result = plan(data, env);
  assert.deepEqual(result.restore.clusters, env.state.clusters); assert.deepEqual(result.restore.appPins, [{ name: 'Notes', space: 'studio' }]);
  assert.equal(result.restore.clusterOpen, 'group-old'); assert.equal(result.restore.desk.view, 'life');
  assert.deepEqual(result.restore.desk.files.color, point('life', 40, 50));
  for (const id of ['group-old', 'app-notes', 'thought']) assert.deepEqual(result.restore.desk.files[id], env.state.desk.files[id]);
  for (const key of ['pins', 'note', 'session', 'welcome']) assert.equal(Object.hasOwn(result.restore, key), false);
});

test('declared group and member limit violations reject before importing any data', () => {
  assert.equal(S.plan(setup({ clusters: Array.from({ length: 81 }, (_, i) => group('group-' + i)) }), environment()), null);
  assert.equal(S.plan(setup({ clusters: [group('group-a', Array.from({ length: 501 }, (_, i) => 'item-' + i))] }), environment()), null);
  const projects = Array.from({ length: 13 }, (_, i) => ({ id: 'space-' + i, name: 'Space ' + i }));
  assert.equal(S.plan(setup({ projects }), environment()), null);
  const legacy = plan(setup({ version: 1, projects }));
  assert.equal(legacy.restore.projects.length, 12);
  assert.equal(legacy.report.skippedProjects, 2, 'legacy processing examines at most twelve incoming entries');
});

test('existing capacity takes priority and skipped new groups cannot become dangling children', () => {
  const env = environment(); env.state.clusters = Array.from({ length: 79 }, (_, i) => group('group-existing-' + i));
  const result = plan(setup({ clusters: [group('group-first', ['group-last']), group('group-last', ['color'])] }), env);
  assert.equal(result.restore.clusters.length, 80); assert.equal(result.report.groupsAdded, 1); assert.equal(result.report.skippedGroups, 1);
  assert.deepEqual(result.restore.clusters.at(-1).members, []); assert.equal(result.report.skippedLinks, 1);
});

test('remaining membership capacity is reserved for existing links without discarding originals', () => {
  const items = Array.from({ length: 500 }, (_, i) => 'item-' + i), env = environment({ itemIds: [...items, 'color'] }); env.state.clusters = [group('group-full', items)];
  const result = plan(setup({ clusters: [group('group-new', ['color'])] }), env);
  assert.deepEqual(result.restore.clusters[0], env.state.clusters[0]); assert.deepEqual(result.restore.clusters[1].members, []);
  assert.equal(result.report.skippedLinks, 1); assert.equal(result.report.groupsAdded, 1);
});

test('repeated imports are idempotent and stable IDs never duplicate existing records', () => {
  const raw = setup({ appPins: [{ name: 'Browser', space: 'life' }], clusters: [group('group-new', ['color', 'app-browser'])], desk: { view: 'life', files: { 'group-new': point('life', 35, 40), 'app-browser': point('life', 10, 20) }, placements: { 'group-new': { x: .7, y: .4 } } } });
  const first = plan(raw), nextEnv = apply(environment(), first), second = plan(raw, nextEnv);
  assert.deepEqual(second.restore, first.restore); assert.equal(second.report.groupsAdded, 0); assert.equal(second.report.appsAdded, 0); assert.equal(second.report.groupsKept, 1);
});

test('reimport never silently repopulates a colliding group after its missing file later becomes available', () => {
  const raw = setup({ clusters: [group('group-new', ['local-later'])] }), first = plan(raw);
  const env = apply(environment(), first); env.itemIds.push('local-later'); env.localIds.push('later');
  const second = plan(raw, env); assert.deepEqual(second.restore.clusters.at(-1).members, []); assert.equal(second.report.groupsKept, 1);
});

test('planning and exporting accept frozen state without mutating any input', () => {
  const env = environment(), raw = setup({ clusters: [group('group-new', ['color'])] });
  const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
  freeze(env); freeze(raw); const before = plain(env), input = plain(raw);
  assert.ok(S.plan(raw, env)); assert.ok(S.serialize(env.state, env));
  assert.deepEqual(plain(env), before); assert.deepEqual(plain(raw), input); assert.ok(Object.isFrozen(S));
});
