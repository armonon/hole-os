import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';

const source = await readFile(new URL('../src/continuity.js', import.meta.url), 'utf8');
function declaration(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
const functions = declaration('  async function performRender()', '  function context()') +
  declaration('  async function flushDraft(', '  function finishEditing()');

test('text refresh retains live work through storage refusal, retry and durable reopen', async () => {
  const indexedDB = new IDBFactory();
  const core = HoleCoreFactory.create({ indexedDB, localStorage: null, broadcast: false });
  const original = await core.importAsset({ name: 'Refresh.txt', blob: new Blob(['Original'], { type: 'text/plain' }) });
  const input = { value: 'Pending thought', selectionStart: 2, selectionEnd: 9, scrollTop: 31 };
  const editor = { assetId: original.asset.id, baseVersionId: original.version.id, id: 'refresh-draft',
    revision: 0, input, label: { dataset: {} }, dirty: true, changed: true, pending: Promise.resolve(), instanceId: 'same-instance' };
  let refused = true, checkpoints = 0, replacements = 0;
  const context = vm.createContext({ editor, modalClosing: Promise.resolve(), clearTimeout,
    H: { os: { querySelector: () => null } },
    main: { replaceChildren: () => { replacements++; } },
    C: { saveDraft: snapshot => { if (refused) throw Error('Storage refusal'); return core.saveDraft(snapshot); } },
    HoleRuntime: { checkpoint: async id => { assert.equal(id, 'same-instance'); checkpoints++; } } });
  vm.runInContext(functions, context);
  try {
    await assert.rejects(context.performRender(), /Storage refusal/);
    assert.equal(context.editor, editor); assert.equal(editor.input, input);
    assert.equal(editor.changed, true); assert.equal(editor.failed, true);
    assert.match(editor.label.textContent, /Your text remains here/);
    assert.equal(await core.get('drafts', editor.id), null);
    refused = false;
    await context.performRender();
    assert.equal(context.editor, editor); assert.equal(editor.input, input);
    assert.equal(editor.changed, false); assert.equal(editor.failed, false);
    assert.equal(checkpoints, 1); assert.equal(replacements, 0);
    assert.deepEqual([input.selectionStart, input.selectionEnd, input.scrollTop], [2, 9, 31]);
    assert.equal((await core.list('versions')).length, 1, 'refresh does not commit a version');
    core.close();
    const reopened = HoleCoreFactory.create({ indexedDB, localStorage: null, broadcast: false });
    try {
      assert.equal(await (await reopened.readAsset(original.asset.id)).blob.text(), 'Original');
      const draft = await reopened.get('drafts', editor.id);
      assert.equal(draft.text, 'Pending thought'); assert.equal(draft.baseVersionId, original.version.id);
      assert.deepEqual(draft.selection, { start: 2, end: 9 }); assert.equal(draft.scroll, 31);
    } finally { reopened.close(); }
  } finally { core.close(); }
});

test('refresh drains edits arriving during a draft write without replacing the editor', async () => {
  const editor = { assetId: 'asset', baseVersionId: 'version', id: 'draft', revision: 0,
    input: { value: 'First', selectionStart: 0, selectionEnd: 0, scrollTop: 0 },
    label: { dataset: {} }, changed: true, pending: Promise.resolve() };
  const writes = [];
  const context = vm.createContext({ editor, modalClosing: Promise.resolve(), clearTimeout,
    H: { os: { querySelector: () => null } }, C: { saveDraft: async snapshot => {
      writes.push(snapshot.text);
      if (writes.length === 1) editor.input.value = 'Newer work';
      return { revision: writes.length };
    } } });
  vm.runInContext(functions, context);
  await context.performRender();
  assert.deepEqual(writes, ['First', 'Newer work']);
  assert.equal(context.editor, editor); assert.equal(editor.changed, false);
  assert.equal(editor.revision, 2);
});
