import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';
import '../src/actions-codecs.js';
import '../src/actions.js';
import '../src/extensions-model.js';
import '../src/package-model.js';
const M = HolePackageModel;
const theme = version => ({ schema: 'hole.package/1', id: 'test.theme', version, name: 'Test theme', kind: 'theme', permissions: [], preferences: { theme: version === 1 ? 'light' : 'dark' } });
test('package updates and rollback preserve previous manifests durably and reject stale rollbacks', async () => {
  const db = new IDBFactory(), core = HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  await M.install(core, theme(1)); const second = await M.install(core, theme(2));
  await assert.rejects(M.install(core, theme(2)), /newer version/);
  await assert.rejects(M.install(core, { ...theme(3), kind: 'instrument', composition: { schema: 'hole.utility/1', name: 'Counter', components: [{ id: 'one', config: { type: 'counter' } }] } }), /same package kind/);
  await M.install(core, theme(3)); await assert.rejects(M.rollback(core, second), { code: 'CONFLICT' }); core.close();
  const reopened = HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false }), current = await reopened.get('packages', 'test.theme');
  assert.equal(current.history.length, 2); const rolled = await M.rollback(reopened, current); assert.equal(rolled.manifest.version, 2); assert.equal(rolled.history[0].preferences.theme, 'light'); reopened.close();
});
test('packages reject grants, unknown kinds, executable preferences and incompatible runtime', () => {
  for (const value of [{ ...theme(1), permissions: ['network'] }, { ...theme(1), runtimeVersion: 2 }, { ...theme(1), kind: 'script' }, { ...theme(1), preferences: { theme: 'light', script: 'alert(1)' } }]) assert.throws(() => M.manifest(value));
  assert.throws(() => M.manifest({ ...theme(1), kind: 'tool', runtimeVersion: 999, component: { type: 'counter' } }), /incompatible/);
  assert.throws(() => M.manifest({ ...theme(1), kind: 'tool', version: Number.MAX_SAFE_INTEGER + 1, component: { type: 'counter' } }), /identity/);
  assert.throws(() => M.composition({ schema: 'hole.utility/1', name: 'Bad', components: [{ id: 'one', config: { type: 'script' } }] }));
  assert.throws(() => M.composition({ schema: 'hole.utility/1', name: 'Bad', components: Array.from({ length: 13 }, (_, i) => ({ id: String(i), config: { type: 'counter' } })) }));
});
test('workflow and Space manifests validate bounded values against actual registered actions', () => {
  const workflow = { ...theme(1), kind: 'workflow', recipe: { name: 'Branch text', steps: [{ id: 'a', actionId: 'text.branch', parameters: { name: 'Copy' } }, { id: 'b', actionId: 'text.branch', from: 'a', parameters: {} }] } };
  assert.equal(M.manifest(workflow).recipe.steps.length, 2);
  assert.throws(() => M.manifest({ ...workflow, recipe: { ...workflow.recipe, steps: [{ id: 'a', actionId: 'text.branch', parameters: { secret: 'no' } }] } }), /Unsupported workflow/);
  assert.throws(() => M.manifest({ ...workflow, recipe: { ...workflow.recipe, steps: [{ id: 'a', actionId: 'text.branch', from: 'future', parameters: {} }] } }), /prior step/);
  const space = M.manifest({ ...theme(1), kind: 'space-template', template: { name: 'Study', zones: [{ name: 'Read', x: 1, y: -2 }] } }); assert.equal(space.template.zones[0].x, 1);
  assert.throws(() => M.manifest({ ...space, template: { name: 'Study', zones: [{ name: 'Read', x: 7000, y: 0 }] } }));
});
