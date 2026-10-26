import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';

const source = await readFile(new URL('../src/persistence.js', import.meta.url), 'utf8');
const workspace = text => ({ privateContent: { note: text } });
function adapter(core, initial, { quota = false } = {}) {
  let serialized = initial ? JSON.stringify(initial) : null;
  const localStorage = { getItem: () => serialized, setItem(key, value) { if (quota) throw new DOMException('Full', 'QuotaExceededError'); serialized = value; } };
  const window = new EventTarget(); window.HoleCore = core; window.innerHeight = 800;
  const document = { documentElement: { style: { setProperty() {} } } };
  vm.runInNewContext(source, { window, document, localStorage, CustomEvent });
  return window;
}
function core(db = new IDBFactory()) { return globalThis.HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false }); }

test('workspace failure is visible and never advances acknowledged memory', async () => {
  const window = adapter(null, workspace('Saved'), { quota: true });
  await assert.rejects(window.openai.setWidgetState(workspace('Not saved')));
  assert.equal(window.openai.widgetState.privateContent.note, 'Saved');
  assert.equal(window.HolePersistence.status.state, 'failed');
  const leaving = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(leaving);
  assert.equal(leaving.defaultPrevented, true);
});

test('IDB restores newer workspace and prevents an early stale shell save replacing it', async () => {
  const instance = core();
  await instance.put('settings', { id: 'legacy-workspace', value: workspace('Newest durable') });
  const window = adapter(instance, workspace('Old mirror'));
  const oldWrite = window.openai.setWidgetState(workspace('Old mirror'));
  await assert.rejects(oldWrite, { code: 'CONFLICT' });
  assert.equal(window.openai.widgetState.privateContent.note, 'Newest durable');
  assert.equal((await instance.get('settings', 'legacy-workspace')).value.privateContent.note, 'Newest durable');
  await window.openai.setWidgetState(workspace('Intentional next change'));
  assert.equal(window.HolePersistence.status.state, 'saved'); instance.close();
});

test('two stale shell adapters cannot overwrite another acknowledged workspace', async () => {
  const db = new IDBFactory(), a = core(db); await a.ready; const b = core(db); await b.ready;
  const wa = adapter(a, null), wb = adapter(b, null); await Promise.all([wa.HolePersistence.ready, wb.HolePersistence.ready]);
  await wa.openai.setWidgetState(workspace('First tab saved'));
  await assert.rejects(wb.openai.setWidgetState(workspace('Stale tab')), { code: 'CONFLICT' });
  assert.equal((await b.get('settings', 'legacy-workspace')).value.privateContent.note, 'First tab saved');
  assert.equal(wb.HolePersistence.status.state, 'conflict'); a.close(); b.close();
});

test('workspace saves survive a failed localStorage compatibility mirror through IDB', async () => {
  const instance = core(), window = adapter(instance, null, { quota: true }); await window.HolePersistence.ready;
  await window.openai.setWidgetState(workspace('Durable in IDB'));
  assert.equal(window.HolePersistence.status.state, 'saved');
  assert.equal((await instance.get('settings', 'legacy-workspace')).value.privateContent.note, 'Durable in IDB');
  instance.close();
});
