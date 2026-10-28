/* Adapter for inspected Luma Studio methods. Import into Luma; not auto-enabled.
 * The existing editor/recovery/export pipeline remains the owner of .luma data. */
(() => {
  'use strict';
  const fail = (code, message) => Object.assign(new Error(message), { code });
  async function decodeImage(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image(); image.src = url;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw fail('INVALID_IMAGE', 'The image cannot be decoded.');
      return image;
    } finally { URL.revokeObjectURL(url); }
  }
  function createLumaAdapter({ studio, client, loadImage = decodeImage } = {}) {
    if (!studio || !client) throw fail('ADAPTER_UNAVAILABLE', 'A mounted Luma Studio and connected client are required.');
    let binding = null, pending = null, pendingExport = null, busy = false;
    const documentId = () => studio.activeDocumentState().id;
    function assertBound() {
      if (!binding || documentId() !== binding.documentId) throw fail('DOCUMENT_CHANGED', 'Return to the document opened from Hole before saving it back.');
    }
    async function openGranted(assetId, versionId) {
      if (binding || busy) throw fail('INSTANCE_BOUND', 'Use another studio instance to open a different Hole resource.');
      if (studio.dirtyDocuments().length) throw fail('UNSAVED_DOCUMENTS', 'Save or keep your existing Luma documents before opening a Hole resource.');
      const previous = documentId(); busy = true;
      try {
        const { asset, blob } = await client.request('resource.read', { assetId, versionId });
        if (documentId() !== previous || studio.dirtyDocuments().length) throw fail('DOCUMENT_CHANGED', 'The active document changed while the Hole resource opened.');
        const native = /\.luma$/i.test(asset.name);
        if (native) await studio.importProject(blob, { restoreHistory: true });
        else if (['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
          const image = await loadImage(blob);
          if (documentId() !== previous || studio.dirtyDocuments().length) throw fail('DOCUMENT_CHANGED', 'The active document changed while the image decoded.');
          studio.openImage(asset.name, image);
        } else throw fail('UNSUPPORTED_FORMAT', 'The first Hole adapter supports PNG, JPEG, WebP, and native .luma projects.');
        binding = { assetId, versionId, name: asset.name, mime: blob.type, native, documentId: documentId() };
        return { ...binding };
      } finally { busy = false; }
    }
    async function saveBack() {
      assertBound();
      if (busy || pendingExport) throw fail('SAVE_PENDING', 'Finish the pending export or current Hole operation.');
      busy = true;
      try {
        if (!pending) {
          const input = { ...binding };
          const ticket = input.native ? await studio.prepareProjectSave(input.name) : null;
          const blob = ticket ? ticket.blob : await studio.exportImage(input.mime);
          assertBound();
          pending = { requestId: `save:${crypto.randomUUID()}`, input, ticket, payload: { assetId: input.assetId, baseVersionId: input.versionId, blob, operation: input.native ? 'luma-project-save' : 'luma-image-export', parameters: { editor: 'Luma' } } };
        }
        if (pending.renewRequestId) { pending.requestId = `save:${crypto.randomUUID()}`; pending.renewRequestId = false; }
        let output; try { output = await client.request('resource.commit', pending.payload, { requestId: pending.requestId }); } catch (error) { if (error.hostRejected === true && error.code === 'QUOTA') pending.renewRequestId = true; throw error; }
        // The pending bytes and ID survive timeout. Retrying replays exactly the
        // same commit; only an acknowledged version advances the base.
        binding.versionId = output.versionId;
        if (pending.ticket) studio.completeProjectSave(pending.ticket);
        pending = null;
        return output;
      } finally { busy = false; }
    }
    const abort = signal => { if (signal?.aborted) throw fail('ABORTED', 'Export cancelled before creating an output.'); };
    function exportBounds() {
      const doc = studio.doc;
      if (!Number.isInteger(doc.width) || !Number.isInteger(doc.height) || doc.width < 1 || doc.height < 1 || doc.width > 2048 || doc.height > 2048 || doc.width * doc.height > 4000000 || !Array.isArray(doc.layers) || doc.layers.length > 64) throw fail('EXPORT_BUDGET', 'Connected exports support up to 2048 pixels per edge, four million pixels and 64 layers.');
      let pixels = 0;
      for (const layer of doc.layers) { const size = layer.surface?.grid || layer.bitmap || doc; const area = size.width * size.height; if (!Number.isFinite(area) || area < 1) throw fail('EXPORT_BUDGET', 'A source layer has invalid dimensions.'); pixels += area; }
      if (pixels > 32000000) throw fail('EXPORT_BUDGET', 'Connected exports support up to 32 million source-layer pixels.');
      return { width: doc.width, height: doc.height };
    }
    function outputName(name, extension) {
      const value = name === undefined ? binding.name.replace(/\.(luma|png|jpe?g|webp)$/i, '') : name;
      if (typeof value !== 'string' || !value.trim() || value.length > 180 || /[\u0000-\u001f\u007f]/.test(value)) throw fail('INVALID_NAME', 'Use an output name between 1 and 180 characters.');
      return value.trim().replace(/\.(luma|png|jpe?g|webp)$/i, '') + extension;
    }
    async function derive(kind, { name, format = 'png', quality = .92, signal, onPhase } = {}) {
      assertBound(); abort(signal);
      if (busy || pending) throw fail('SAVE_PENDING', 'Finish the pending save before exporting.');
      if (pendingExport && pendingExport.kind !== kind) throw fail('EXPORT_PENDING', 'Retry the pending export before starting another.');
      busy = true; let created = false, dispatched = false;
      try {
        if (!pendingExport) {
          const dimensions = exportBounds(), input = { ...binding }, revision = studio.history?.current, sourceState = studio.activeDocumentState();
          let mime, suffix;
          if (kind === 'native') { mime = 'application/x-luma-project'; suffix = '.luma'; }
          else { const formats = { png: ['image/png', '.png'], jpeg: ['image/jpeg', '.jpg'], webp: ['image/webp', '.webp'] }; if (!Object.hasOwn(formats, format) || !Number.isFinite(quality) || quality < .1 || quality > 1) throw fail('INVALID_EXPORT', 'Choose PNG, JPEG or WebP and quality between 0.1 and 1.'); [mime, suffix] = formats[format]; }
          const filename = outputName(name, suffix); onPhase?.('encoding'); abort(signal);
          const blob = kind === 'native' ? (await studio.prepareProjectSave(filename)).blob : await studio.exportImage(mime, quality);
          assertBound(); abort(signal);
          if (binding.versionId !== input.versionId || studio.history?.current !== revision) throw fail('DOCUMENT_CHANGED', 'The document changed during export. Export again.');
          if (!(blob instanceof Blob) || !blob.size || blob.size > 32 * 1024 * 1024 || blob.type !== mime) throw fail('INVALID_EXPORT', 'The engine output is empty, exceeds 32 MiB or does not match the requested format.');
          const prefix = new Uint8Array(await blob.slice(0, 16).arrayBuffer()); abort(signal);
          const valid = kind === 'native' ? prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 3 && prefix[3] === 4 : format === 'png' ? prefix[0] === 137 && prefix[1] === 80 && prefix[2] === 78 && prefix[3] === 71 : format === 'jpeg' ? prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255 : String.fromCharCode(...prefix.slice(0,4)) === 'RIFF' && String.fromCharCode(...prefix.slice(8,12)) === 'WEBP';
          if (!valid) throw fail('INVALID_EXPORT', 'The engine returned unexpected file bytes.');
          if (kind !== 'native') { const image = await loadImage(blob); abort(signal); if (image.naturalWidth !== dimensions.width || image.naturalHeight !== dimensions.height) throw fail('INVALID_EXPORT', 'The rendered image dimensions changed during export.'); }
          assertBound(); abort(signal); if (studio.history?.current !== revision) throw fail('DOCUMENT_CHANGED', 'The document changed during export. Export again.');
          const parameters = { editor: 'Luma', format: kind === 'native' ? 'luma' : format, mime, ...dimensions, ...(kind !== 'native' && format !== 'png' ? { quality } : {}), sourceNative: input.native, unsavedEdits: !!sourceState.dirty };
          pendingExport = { kind, requestId: `luma-export:${crypto.randomUUID()}`, payload: { assetId: input.assetId, versionId: input.versionId, operation: kind === 'native' ? 'luma-native-save-as' : 'luma-raster-export', parameters, outputs: [{ name: filename, kind: kind === 'native' ? 'document' : 'image', blob }] } };
          created = true;
        }
        if (pendingExport.renewRequestId) { pendingExport.requestId = `luma-export:${crypto.randomUUID()}`; pendingExport.renewRequestId = false; }
        abort(signal); onPhase?.('committing'); abort(signal); dispatched = true;
        let result; try { result = await client.request('resource.derive', pendingExport.payload, { requestId: pendingExport.requestId }); } catch (error) { if (error.hostRejected === true && error.code === 'QUOTA') pendingExport.renewRequestId = true; throw error; }
        const output = { ...result, filename: pendingExport.payload.outputs[0].name };
        // A derived copy does not change the selected resource or mark it saved.
        pendingExport = null;
        return output;
      } finally { if (created && !dispatched && signal?.aborted) pendingExport = null; busy = false; }
    }
    return Object.freeze({
      openGranted, saveBack, saveNativeCopy: options => derive('native', options), exportRaster: options => derive('raster', options),
      getPendingExport: () => pendingExport ? { kind: pendingExport.kind, requestId: pendingExport.requestId, filename: pendingExport.payload.outputs[0].name } : null,
      restoreRecovery: async blob => { assertBound(); if (busy || pending || pendingExport) throw fail('SAVE_PENDING', 'Finish the pending operation before recovery.'); busy = true; try { await studio.importProject(blob, { restoreHistory: true }); binding.documentId = documentId(); } finally { busy = false; } },
      getBinding: () => binding ? { ...binding } : null,
      getPendingSave: () => pending ? { requestId: pending.requestId, assetId: pending.input.assetId, baseVersionId: pending.input.versionId } : null,
      readKit: async () => { const grant = await client.ready; return client.request('project.kit', { projectId: grant.projectId }); },
      serialize: () => ({ schema: 'hole.luma-binding/1', binding: binding ? { ...binding } : null, pendingRequestId: pending?.requestId || pendingExport?.requestId || null })
    });
  }
  globalThis.HoleLumaAdapter = Object.freeze({ create: createLumaAdapter });
})();
