import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';
import '../src/continuity-model.js';
const M = globalThis.HoleContinuityModel;
test('line comparison reconstructs both versions including repeated lines and empty trailing lines', () => {
  for (const [before, after] of [['a\nb\na\n','a\nc\na\n'], ['', 'new'], ['x\ny','y\nx'], ['same','same']]) for (const cap of [0, 250000]) {
    const rows = M.textDiff(before, after, cap);
    assert.equal(rows.filter(r => r.type !== 'added').map(r => r.text).join('\n'), before);
    assert.equal(rows.filter(r => r.type !== 'removed').map(r => r.text).join('\n'), after);
    assert.deepEqual(rows.filter(r => r.oldLine !== null).map(r => r.oldLine), before.split('\n').map((_,i) => i+1));
  }
});
test('Carry resolves the approved version after edits, rejects trash/revocation and keeps snippets independent', async () => {
  const indexedDB = new IDBFactory(); let C = HoleCoreFactory.create({ indexedDB, localStorage: null, broadcast: false });
  const first = await C.importAsset({ name: 'Note', blob: new Blob(['approved'], {type:'text/plain'}) });
  const item = await C.put('carry', { id:'carried', assetId:first.asset.id, versionId:first.version.id });
  await C.commitAsset({ assetId:first.asset.id, baseVersionId:first.version.id, blob:new Blob(['new private content'], {type:'text/plain'}) });
  C.close(); C = HoleCoreFactory.create({ indexedDB, localStorage:null, broadcast:false });
  assert.equal(await (await M.resolveCarry(C, await C.get('carry', item.id))).blob.text(), 'approved');
  await assert.rejects(M.resolveCarry(C, {...item, revokedAt:1}), /revoked/);
  await C.trashAsset(first.asset.id); await assert.rejects(M.resolveCarry(C, item), /Trash/);
  assert.deepEqual(await M.resolveCarry(C, {kind:'snippet',text:'literal <script>text</script>'}), {snippet:'literal <script>text</script>'}); C.close();
});
