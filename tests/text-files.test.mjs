import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ Blob, TextDecoder });
vm.runInContext(await readFile(new URL('../src/text-files.js', import.meta.url), 'utf8'), context);
const { MAX_TEXT_BYTES, decode, save } = context.HoleTextFiles;
const at = 1792771200000;
const plain = value => JSON.parse(JSON.stringify(value));

function storage(persist) {
  let next = 0;
  const records = [];
  return {
    records,
    options: { id: () => `text-${++next}`, now: () => at, persist: persist || (async value => { records.push(value); }) }
  };
}

function original(overrides = {}) {
  return Object.freeze({
    id: 'imported-text', name: 'Ideas.md', type: 'text/markdown', size: 100,
    rootId: 'first-import', parentId: 'previous-version', space: 'space-writing',
    createdAt: 1, modifiedAt: 2,
    history: Object.freeze([Object.freeze({ id: 'prior-event', type: 'import', detail: 'Original import', at: 1 })]),
    ...overrides
  });
}

test('text decoding accepts strict UTF-8, Markdown, empty content and the exact byte limit', async () => {
  assert.equal(MAX_TEXT_BYTES, 262144);
  const text = 'café 🎵\n日本語\n';
  for (const type of ['text/plain', 'text/markdown']) {
    assert.equal(await decode(new Blob([text], { type })), text);
    assert.equal(await decode(new Blob([], { type })), '');
  }
  assert.equal((await decode(new Blob(['a'.repeat(MAX_TEXT_BYTES)], { type: 'text/plain' }))).length, MAX_TEXT_BYTES);
});

test('decoding rejects oversized files, unsupported content and invalid UTF-8 without replacement characters', async () => {
  const invalid = [
    null, 'text', { type: 'text/plain', size: 1, arrayBuffer: async () => new ArrayBuffer(1) },
    new Blob(['a'.repeat(MAX_TEXT_BYTES + 1)], { type: 'text/plain' }),
    new Blob(['{}'], { type: 'application/json' }), new Blob(['<b>text</b>'], { type: 'text/html' }),
    ...[[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xe2, 0x82], [0xff]].map(bytes => new Blob([new Uint8Array(bytes)], { type: 'text/plain' }))
  ];
  for (const value of invalid) await assert.rejects(() => decode(value));
});

test('new files persist real bytes with a completed activity record and local provenance', async () => {
  const store = storage(), text = 'café 🎵\n日本語';
  const result = await save({ text, name: 'A thought', space: 'studio' }, store.options);
  assert.equal(store.records.length, 1);
  assert.equal(store.records[0], result);
  assert.deepEqual(Object.keys(result).sort(), ['blob', 'file', 'job']);
  const { file, blob, job } = result;
  assert.equal(file.name, 'A thought.txt');
  assert.equal(file.type, 'text/plain');
  assert.equal(blob.type, file.type);
  assert.equal(file.size, Buffer.byteLength(text, 'utf8'));
  assert.equal(file.size, blob.size);
  assert.equal(await blob.text(), text);
  assert.equal(file.parentId, null);
  assert.equal(file.rootId, file.id);
  assert.equal(file.space, 'studio');
  assert.equal(file.createdAt, at);
  assert.equal(file.modifiedAt, at);
  assert.deepEqual(plain(file.provenance), { app: 'Text editor', mode: 'local', sourceId: null, sourceName: null });
  assert.equal(file.history.length, 1);
  assert.equal(file.history[0].at, at);
  assert.equal(job.sourceId, null);
  assert.equal(job.outputId, file.id);
  assert.equal(job.status, 'completed');
  assert.equal(job.progress, 100);
  assert.equal(job.createdAt, at);
  assert.equal(job.updatedAt, at);
  assert.equal(job.error, '');
  assert.notEqual(job.id, file.id);
});

test('text edits create a separate version while preserving the original and lineage', async () => {
  const source = original(), before = plain(source), store = storage();
  const { file, blob, job } = await save({ text: '# Revised\n', name: 'Revised', source, space: 'desk' }, store.options);
  assert.deepEqual(plain(source), before);
  assert.notEqual(file.id, source.id);
  assert.equal(file.name, 'Revised.md');
  assert.equal(file.type, source.type);
  assert.equal(await blob.text(), '# Revised\n');
  assert.equal(file.parentId, source.id);
  assert.equal(file.rootId, source.rootId);
  assert.equal(file.space, source.space);
  assert.deepEqual(plain(file.provenance), { app: 'Text editor', mode: 'local', sourceId: source.id, sourceName: source.name });
  assert.equal(file.history.length, 1, 'a version owns its new history event');
  assert.notEqual(file.history, source.history);
  assert.equal(file.history[0].type, 'text-edit');
  assert.match(file.history[0].detail, /Ideas\.md/);
  assert.equal(job.sourceId, source.id);
  assert.equal(job.outputId, file.id);
});

test('editing a source without prior lineage uses the source as its root', async () => {
  const source = original({ rootId: undefined, type: 'text/plain' });
  const { file } = await save({ text: 'new', name: 'New', source }, storage().options);
  assert.equal(file.rootId, source.id);
  assert.equal(file.parentId, source.id);
  assert.equal(file.name, 'New.txt');
});

test('new Markdown files follow the requested extension and edits follow the source MIME', async () => {
  for (const name of ['README.md', 'README.MD']) {
    const result = await save({ text: '# Draft', name }, storage().options);
    assert.equal(result.file.type, 'text/markdown');
    assert.equal(result.file.name, name);
  }
  const plainResult = await save({ text: 'literal text', name: 'Notes.md', source: original({ type: 'text/plain' }) }, storage().options);
  assert.equal(plainResult.file.name, 'Notes.md.txt');
  assert.equal(plainResult.blob.type, 'text/plain');
  const markdownResult = await save({ text: '# Markdown', name: 'Notes.txt', source: original() }, storage().options);
  assert.equal(markdownResult.file.name, 'Notes.txt.md');
  assert.equal(markdownResult.blob.type, 'text/markdown');
});

test('Notes snapshots are independent plain-text originals even when the name ends in Markdown', async () => {
  const store = storage();
  const first = await save({ text: 'First draft', name: 'Notebook.md', app: 'Notes', space: 'life' }, store.options);
  const second = await save({ text: 'Later draft', name: 'Notebook.md', app: 'Notes', space: 'life' }, store.options);
  assert.notEqual(first.file.id, second.file.id);
  for (const { file, job, blob } of [first, second]) {
    assert.equal(file.name, 'Notebook.md.txt');
    assert.equal(file.type, 'text/plain');
    assert.equal(blob.type, 'text/plain');
    assert.equal(file.parentId, null);
    assert.equal(file.rootId, file.id);
    assert.equal(file.space, 'life');
    assert.equal(file.provenance.app, 'Notes');
    assert.equal(file.provenance.sourceId, null);
    assert.equal(job.sourceId, null);
  }
  assert.equal(await first.blob.text(), 'First draft');
  assert.equal(await second.blob.text(), 'Later draft');
});

test('filenames exclude path separators/control characters and retain a valid bounded extension', async () => {
  for (const name of ['../a\\b/\u0000\ntext', 'X'.repeat(400), '   ', '\u007f']) {
    const { file } = await save({ text: '', name }, storage().options);
    assert.doesNotMatch(file.name, /[\u0000-\u001f\u007f/\\]/);
    assert.ok(file.name.length <= 200);
    assert.ok(file.name.endsWith('.txt'));
    assert.ok(file.name.slice(0, -4).trim().length > 0);
  }
});

test('blank content is valid and the save bound measures UTF-8 bytes rather than characters', async () => {
  const empty = await save({ text: '', name: 'Empty' }, storage().options);
  assert.equal(empty.file.size, 0);
  assert.equal(await empty.blob.text(), '');
  const exact = 'é'.repeat(MAX_TEXT_BYTES / 2);
  const saved = await save({ text: exact, name: 'Limit' }, storage().options);
  assert.equal(saved.file.size, MAX_TEXT_BYTES);
  const store = storage();
  await assert.rejects(() => save({ text: exact + 'é', name: 'Too large' }, store.options));
  assert.equal(store.records.length, 0);
});

test('unsupported or malformed sources and unknown apps are rejected before persistence', async () => {
  const store = storage();
  const sources = [
    false, 0, '', {}, original({ id: '' }), original({ type: 'application/pdf' }),
    original({ type: 'text/html' }), original({ size: MAX_TEXT_BYTES + 1 }),
    original({ size: -1 }), original({ size: Infinity }), original({ size: Number.NaN })
  ];
  for (const source of sources) await assert.rejects(() => save({ text: 'draft', name: 'Draft', source }, store.options));
  await assert.rejects(() => save({ text: 'draft', name: 'Draft', source: original(), app: 'Notes' }, store.options));
  await assert.rejects(() => save({ text: 'draft', name: 'Draft', app: 'External editor' }, store.options));
  for (const text of [null, undefined, 0, {}, []]) await assert.rejects(() => save({ text, name: 'Draft' }, store.options));
  assert.equal(store.records.length, 0);
});

test('an identifier collision cannot overwrite the source or create an ambiguous file/job pair', async () => {
  const source = original(), store = storage();
  await assert.rejects(() => save({ text: 'changed', name: 'New', source }, { ...store.options, id: () => source.id }));
  await assert.rejects(() => save({ text: 'new', name: 'New' }, { ...store.options, id: () => 'same-id' }));
  assert.equal(store.records.length, 0);
});

test('save waits for a single atomic file/bytes/job commit before reporting completion', async () => {
  let release, payload, settled = false;
  const committed = [];
  const gate = new Promise(resolve => { release = resolve; });
  const store = storage(async result => { payload = result; await gate; committed.push(result); });
  const saving = save({ text: 'Commit me', name: 'Atomic', source: original() }, store.options).then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(committed.length, 0);
  assert.deepEqual(Object.keys(payload).sort(), ['blob', 'file', 'job']);
  assert.equal(payload.job.outputId, payload.file.id);
  assert.equal(payload.job.status, 'completed');
  assert.equal(await payload.blob.text(), 'Commit me');
  release();
  const result = await saving;
  assert.equal(settled, true);
  assert.deepEqual(committed, [result]);
  assert.equal(result, payload);
});

test('failed persistence propagates the storage error without a completed result or source mutation', async () => {
  const source = original(), before = plain(source), failure = new Error('Quota exceeded');
  let attempts = 0, completed = false;
  const store = storage(async () => { attempts++; throw failure; });
  const saving = save({ text: 'Do not lose the original', name: 'Draft', source }, store.options).then(result => { completed = true; return result; });
  await assert.rejects(saving, error => error === failure);
  assert.equal(attempts, 1);
  assert.equal(completed, false);
  assert.equal(store.records.length, 0);
  assert.deepEqual(plain(source), before);
});
