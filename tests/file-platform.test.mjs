import test from 'node:test';
import assert from 'node:assert/strict';
await import('../src/file-platform.js');
const model = globalThis.HoleFileModel;

test('download names cannot contain path separators or control characters', () => {
  assert.equal(model.cleanName('../a\\b\u0000.png'), '..ab.png');
  assert.equal(model.cleanName('\n\r/'), 'Untitled');
  assert.equal(model.cleanName('x'.repeat(250)).length, 200);
  assert.equal(model.cleanName('  a & <b>.png  '), 'a & <b>.png');
});

test('derivatives preserve the stem and use the real format extension', () => {
  assert.equal(model.derivativeName('art.final.png', 'jpeg'), 'art.final.jpg');
  assert.equal(model.derivativeName('Untitled', 'webp'), 'Untitled.webp');
  assert.equal(model.derivativeName('a\\b.png', 'png'), 'ab.png');
});

test('empty platform MIME types are inferred conservatively', () => {
  assert.equal(model.inferType({ name: 'ART.PNG', type: '' }), 'image/png');
  assert.equal(model.inferType({ name: 'page.html', type: '' }), 'application/octet-stream');
  assert.equal(model.inferType({ name: 'unknown', type: '' }), 'application/octet-stream');
  assert.equal(model.inferType({ name: 'audio.wav', type: 'audio/x-wav' }), 'audio/x-wav');
});

test('sizes report bytes, kilobytes, and megabytes', () => {
  assert.equal(model.formatBytes(0), '0 B');
  assert.equal(model.formatBytes(1024), '1.0 KB');
  assert.equal(model.formatBytes(1024 ** 2), '1.0 MB');
});

test('Photos and imported Locker are views over existing identities and omit trash', () => {
  const files = [{ id: 'image', type: 'image/png' }, { id: 'audio', type: 'audio/wav', provenance: { locker: { origin: model.LOCKER_ORIGIN } } }, { id: 'removed', type: 'image/png', state: 'trashed' }];
  assert.deepEqual(model.libraryView(files, 'photos').map(file => file.id), ['image']);
  assert.deepEqual(model.libraryView(files, 'locker').map(file => file.id), ['audio']);
  assert.equal(files.length, 3);
});

test('real Locker record schema preserves original bytes/metadata through Core and rejects invalid origins', async () => {
  const { IDBFactory } = await import('fake-indexeddb'); await import('../src/core.js');
  const blob = new Blob(['native original bytes'], { type: 'application/octet-stream' }), entry = { id: 'locker-original', name: 'project.luma', app: 'luma', type: blob.type, size: blob.size, created: 12, updated: 15, meta: { native: 'luma' }, blob };
  const adapted = model.lockerRecord(entry, { id: 'hole-copy', now: 20 });
  assert.equal(adapted.provenance.locker.id, entry.id); assert.equal(adapted.provenance.locker.created, 12);
  assert.throws(() => model.lockerRecord(entry, { sourceOrigin: 'https://other.example' }), /origin/);
  assert.throws(() => model.lockerRecord({ ...entry, size: 2 }), /disagree/);
  assert.throws(() => model.lockerRecord({ ...entry, blob: undefined }), /original Blob/);
  const db = new IDBFactory(), core = HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  const result = await core.saveLegacyFile({ file: adapted, blob, createOnly: true }); core.close();
  const reopened = HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  const stored = await reopened.readAsset(result.asset.id); assert.equal(await stored.blob.text(), 'native original bytes');
  assert.equal(entry.id, 'locker-original'); assert.equal(await entry.blob.text(), 'native original bytes'); reopened.close();
});
