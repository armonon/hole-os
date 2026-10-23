/* Text results are immutable files. Persistence commits file, bytes and activity together. */
(() => {
  'use strict';
  const MAX_TEXT_BYTES = 262144;
  const TYPES = new Set(['text/plain', 'text/markdown']);
  function validateSource(source) {
    if (!source || typeof source.id !== 'string' || !source.id || !TYPES.has(source.type) || !Number.isFinite(source.size) || source.size < 0 || source.size > MAX_TEXT_BYTES) throw new Error('Choose a plain text or Markdown file up to 256 KB.');
  }
  async function decode(blob) {
    if (!(blob instanceof Blob) || !TYPES.has(blob.type) || blob.size > MAX_TEXT_BYTES) throw new Error('Choose a plain text or Markdown file up to 256 KB.');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(await blob.arrayBuffer()); }
    catch { throw new Error('This file is not valid UTF-8 text. Download it to edit in a compatible app; the original is unchanged.'); }
  }
  async function save({ text, name, source = null, app = 'Text editor', space = 'desk' }, { id, now, persist }) {
    if (typeof text !== 'string') throw new Error('Enter text to save.');
    if (!['Notes', 'Text editor'].includes(app)) throw new Error('Unknown text source.');
    if (source !== null) validateSource(source);
    if (app === 'Notes' && source) throw new Error('Notes saves a separate snapshot.');
    let filename = String(name || 'Untitled').replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 190) || 'Untitled';
    const type = source?.type || (app === 'Text editor' && /\.md$/i.test(filename) ? 'text/markdown' : 'text/plain'), extension = type === 'text/markdown' ? 'md' : 'txt';
    if (!filename.toLowerCase().endsWith('.' + extension)) filename += '.' + extension;
    const blob = new Blob([text], { type });
    if (blob.size > MAX_TEXT_BYTES) throw new Error('Keep this text file at or below 256 KB. Your source is unchanged.');
    const at = now(), fileId = id(), jobId = id();
    if (!fileId || fileId === source?.id || jobId === fileId) throw new Error('Could not create a separate version. Try again.');
    const operation = source ? 'Edited text version' : app === 'Notes' ? 'Saved from Notes' : 'Created text file';
    const file = { id: fileId, name: filename, type, size: blob.size, createdAt: at, modifiedAt: at,
      parentId: source?.id || null, rootId: source?.rootId || source?.id || fileId, space: source?.space || space,
      operation, provenance: { app, mode: 'local', sourceId: source?.id || null, sourceName: source?.name || null },
      history: [{ id: id(), type: source ? 'text-edit' : 'text-create', detail: source ? `Saved a separate version of ${source.name} in Text editor` : `Saved from ${app}`, at }] };
    const job = { id: jobId, kind: 'save-text', sourceId: source?.id || null, outputId: fileId, name: `${filename} · ${operation}`,
      status: 'completed', step: 'Saved in Files', progress: 100, createdAt: at, updatedAt: at, error: '' };
    const result = { file, blob, job };
    await persist(result);
    return result;
  }
  globalThis.HoleTextFiles = Object.freeze({ MAX_TEXT_BYTES, decode, save });
})();
