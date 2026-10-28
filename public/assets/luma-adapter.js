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
    let binding = null, pending = null, busy = false;
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
      if (busy) throw fail('SAVE_PENDING', 'Wait for the current Hole operation.');
      busy = true;
      try {
        if (!pending) {
          const input = { ...binding };
          const ticket = input.native ? await studio.prepareProjectSave(input.name) : null;
          const blob = ticket ? ticket.blob : await studio.exportImage(input.mime);
          assertBound();
          pending = { requestId: `save:${crypto.randomUUID()}`, input, ticket, payload: { assetId: input.assetId, baseVersionId: input.versionId, blob, operation: input.native ? 'luma-project-save' : 'luma-image-export', parameters: { editor: 'Luma' } } };
        }
        const output = await client.request('resource.commit', pending.payload, { requestId: pending.requestId });
        // The pending bytes and ID survive timeout. Retrying replays exactly the
        // same commit; only an acknowledged version advances the base.
        binding.versionId = output.versionId;
        if (pending.ticket) studio.completeProjectSave(pending.ticket);
        pending = null;
        return output;
      } finally { busy = false; }
    }
    return Object.freeze({
      openGranted, saveBack,
      restoreRecovery: async blob => { assertBound(); if (busy || pending) throw fail('SAVE_PENDING', 'Finish the pending operation before recovery.'); busy = true; try { await studio.importProject(blob, { restoreHistory: true }); binding.documentId = documentId(); } finally { busy = false; } },
      getBinding: () => binding ? { ...binding } : null,
      getPendingSave: () => pending ? { requestId: pending.requestId, assetId: pending.input.assetId, baseVersionId: pending.input.versionId } : null,
      readKit: async () => { const grant = await client.ready; return client.request('project.kit', { projectId: grant.projectId }); },
      serialize: () => ({ schema: 'hole.luma-binding/1', binding: binding ? { ...binding } : null, pendingRequestId: pending?.requestId || null })
    });
  }
  globalThis.HoleLumaAdapter = Object.freeze({ create: createLumaAdapter });
})();
