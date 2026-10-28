import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';
import '../src/browser.js';
const M = globalThis.HoleBrowserModel;
test('Browser hands off actual encoded query and refuses executable or credential URLs', () => {
  const query = 'a & b 日本語'; assert.equal(new URL(M.destination(query)).searchParams.get('q'), query);
  assert.equal(M.destination('https://example.test/a?x=1'), 'https://example.test/a?x=1');
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'file:///private', 'https://secret:password@example.test']) assert.throws(() => M.destination(url));
});
test('Browser history and saved project Trails survive reopen with checked edits, forget and storage errors', async () => {
  const db = new IDBFactory(), core = HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  const history = M.createHistory(core), visit = await history.visit('my actual search', 'project:one');
  await history.visit('unrelated', 'project:two');
  const saved = await history.save(visit, true, 'Research');
  await assert.rejects(history.save(visit, false), { code: 'CONFLICT' });
  await assert.rejects(history.forget(visit), { code: 'CONFLICT' }); core.close();
  const reopened = HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false }), again = M.createHistory(reopened);
  assert.equal((await again.list({ savedOnly: true }))[0].title, 'Research');
  assert.equal((await again.list({ projectId: 'project:one' })).length, 1);
  await again.forget(saved); assert.equal((await again.list()).length, 1); reopened.close();
  const broken = M.createHistory({ put: async () => { throw new Error('quota'); } });
  await assert.rejects(broken.visit('retain input'), /quota/);
});
