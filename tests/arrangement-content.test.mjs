import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/continuity.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('  async function restoreArrangement(snap) {'), source.indexOf('  async function renderHistory()'));
function fixture(live = false) {
  const current = { asset: { id: 'a', name: 'A.glyph', state: 'active' }, version: { id: 'v2' } }, calls = [], entries = live ? [{ id: 'live', appId: 'hole.glyph', context: { assetId: 'a' }, status: 'running' }] : [];
  const studios = new Map(live ? [['existing', { instanceId: 'live', host: {} }]] : []);
  const context = vm.createContext({ C: { readAsset: async (...args) => { calls.push(['read', ...args]); return current; } }, H: { save() {} }, appViews: {}, studios, HoleStudioWindow: { apply: (host, geometry) => calls.push(['geometry', geometry]) }, HoleRuntime: { list: () => entries, present: async (...args) => calls.push(['present', ...args]) }, openStudio: async (record, restore, appId) => { calls.push(['open', record.version.id, structuredClone(restore)]); entries.push({ id: 'fresh', appId, context: { assetId: 'a' }, status: 'running' }); studios.set('new', { instanceId: 'fresh', host: {} }); }, navigate: async () => {}, notify: message => calls.push(['notice', message]) });
  vm.runInContext(body + ';globalThis.restore=restoreArrangement;', context);
  const snap = { runtime: [{ id: 'old', appId: 'hole.glyph', context: { assetId: 'a', versionId: 'v1' }, presentation: 'minimized', editorState: { versionId: 'v1', checkpointId: 'bridge-state:old', dirty: 'old draft', hostGeometry: { width: 500, height: 400 } } }], navigation: {} };
  return { calls, snap, restore: context.restore };
}
test('arrangement opens current head with fresh identity and view-only state, leaving saved recovery unchanged', async () => {
  const f = fixture(), before = JSON.stringify(f.snap); await f.restore(f.snap);
  assert.deepEqual(f.calls.filter(call => call[0] === 'read'), [['read', 'a']]);
  const open = f.calls.find(call => call[0] === 'open'); assert.equal(open[1], 'v2'); assert.deepEqual(Object.keys(open[2]), ['editorState']); assert.deepEqual(Object.keys(open[2].editorState), ['hostGeometry']);
  assert.ok(f.calls.some(call => call[0] === 'present' && call[1] === 'fresh' && call[2] === 'minimized'));
  assert.equal(JSON.stringify(f.snap), before); assert.match(f.calls.at(-1)[1], /recovery was not applied/);
});
test('arrangement preserves an active editor and applies only geometry/presentation', async () => {
  const f = fixture(true); await f.restore(f.snap); assert.ok(!f.calls.some(call => call[0] === 'open'));
  assert.ok(f.calls.some(call => call[0] === 'geometry')); assert.ok(f.calls.some(call => call[0] === 'present' && call[1] === 'live' && call[2] === 'minimized'));
  assert.match(f.calls.at(-1)[1], /unsaved work preserved/);
});
