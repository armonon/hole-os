import assert from 'node:assert/strict';
import { test } from 'node:test';
await import('../src/file-platform.js');
const model = globalThis.HoleFileModel;

const original = { id: 'original', name: 'Original.txt', type: 'text/plain', size: 8, createdAt: 10, rootId: 'original', parentId: null };
const edited = { ...original, id: 'edited', name: 'Edited.txt', createdAt: 20, modifiedAt: 20, parentId: 'original', operation: 'Edited text version', space: 'desk', provenance: { app: 'Text editor', mode: 'local', sourceId: 'original', sourceName: 'Original.txt' }, history: [{ id: 'edit', type: 'text-edit', detail: 'Previous edit', at: 20 }] };

test('duplicate records attribute Files and their immediate source without modifying the source', () => {
  const before = structuredClone(edited), copy = model.duplicateRecord(edited, 'copy', 30);
  assert.deepEqual(edited, before);
  assert.equal(copy.id, 'copy');
  assert.equal(copy.name, 'Edited copy.txt');
  assert.equal(copy.parentId, edited.id);
  assert.equal(copy.rootId, original.id);
  assert.equal(copy.createdAt, 30);
  assert.equal(copy.modifiedAt, 30);
  assert.equal(copy.type, edited.type);
  assert.equal(copy.size, edited.size);
  assert.equal(copy.space, edited.space);
  assert.deepEqual(copy.provenance, { app: 'Files', mode: 'local', sourceId: edited.id, sourceName: edited.name });
  assert.notEqual(copy.history, edited.history);
  assert.equal(copy.history.length, 1);
  assert.equal(copy.history[0].type, 'duplicate');
  assert.match(copy.history[0].detail, /Edited\.txt/);
});

test('duplicating legacy originals assigns an explicit root and preserves safe names', () => {
  const legacy = { id: 'legacy', name: 'plain', type: 'text/plain', size: 0 };
  const copy = model.duplicateRecord(legacy, 'new-copy', 30);
  assert.equal(copy.rootId, legacy.id);
  assert.equal(copy.parentId, legacy.id);
  assert.equal(copy.name, 'plain copy');
  assert.equal(copy.provenance.sourceName, 'plain');
  assert.equal(legacy.rootId, undefined);
});

test('duplicate records reject missing and source-colliding identities', () => {
  assert.equal(typeof model.duplicateRecord, 'function');
  for (const id of ['', null, undefined, edited.id]) assert.throws(() => model.duplicateRecord(edited, id, 30));
});

test('lineage prefers the live immediate source name and orders only the matching family', () => {
  const renamed = { ...original, name: 'Renamed original.txt' };
  const unrelated = { ...original, id: 'other', rootId: 'other', createdAt: 0 };
  const library = [edited, unrelated, renamed], before = [...library];
  const info = model.lineage(edited, library);
  assert.equal(info.source.id, original.id);
  assert.equal(info.sourceName, renamed.name);
  assert.equal(info.missingSource, false);
  assert.equal(info.missingOriginal, false);
  assert.deepEqual(info.family.map(file => file.id), ['original', 'edited']);
  assert.deepEqual(library, before, 'sorting history must not reorder the library');
});

test('deleted immediate source retains its matching saved name and never invents a source object', () => {
  const copy = { ...edited, id: 'copy', createdAt: 30, parentId: 'edited', provenance: { app: 'Files', mode: 'local', sourceId: 'edited', sourceName: 'Edited.txt' } };
  const info = model.lineage(copy, [original, copy]);
  assert.equal(info.source, null);
  assert.equal(info.sourceName, 'Edited.txt');
  assert.equal(info.missingSource, true);
  assert.equal(info.missingOriginal, false);
  assert.deepEqual(info.family.map(file => file.id), ['original', 'copy']);
});

test('deleted root and deleted immediate source are reported independently', () => {
  const copy = { ...edited, id: 'copy', parentId: 'edited', createdAt: 30 };
  const info = model.lineage(copy, [edited, copy]);
  assert.equal(info.source.id, 'edited');
  assert.equal(info.missingSource, false);
  assert.equal(info.missingOriginal, true);
  assert.deepEqual(info.family.map(file => file.id), ['edited', 'copy']);
});

test('legacy copied provenance never labels a different missing parent as the original', () => {
  const legacyCopy = { ...edited, id: 'legacy-copy', parentId: 'missing-edit' };
  const info = model.lineage(legacyCopy, [original, legacyCopy]);
  assert.equal(info.source, null);
  assert.equal(info.missingSource, true);
  assert.notEqual(info.sourceName, 'Original.txt');
});

test('old originals without lineage remain their own family without a missing-source warning', () => {
  const legacy = { id: 'old', name: 'Old.txt', createdAt: 1 };
  const info = model.lineage(legacy, [legacy, original]);
  assert.equal(info.source, null);
  assert.equal(info.missingSource, false);
  assert.equal(info.missingOriginal, false);
  assert.deepEqual(info.family.map(file => file.id), ['old']);
});

test('self-referencing metadata does not offer the file as its own source', () => {
  const self = { ...original, parentId: original.id };
  assert.equal(model.lineage(self, [self]).source, null);
});
