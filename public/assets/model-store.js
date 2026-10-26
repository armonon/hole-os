/* Explicit model-file admission. Separate from workspace backups; never fetches. */
(() => {
  'use strict';
  const cacheName = 'hole-models-v1', maxBytes = 200 * 1024 * 1024;
  const error = (message, code) => Object.assign(new Error(message), { code });
  let installing = false;
  function validate(manifest) {
    if (!manifest || typeof manifest.id !== 'string' || !manifest.id || manifest.id.length > 160 || !Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || manifest.bytes > maxBytes || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw error('Invalid bounded model manifest.', 'INVALID_MODEL');
    return new URL('/__hole_models/' + manifest.sha256, globalThis.location.href).href;
  }
  async function verify(manifest, blob) {
    validate(manifest);
    if (!(blob instanceof Blob) || blob.size !== manifest.bytes) throw error('The model file does not have the required size.', 'MODEL_SIZE');
    const bytes = await blob.arrayBuffer(), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== manifest.sha256) throw error('The model file failed its pinned checksum.', 'MODEL_HASH');
    return bytes;
  }
  async function status(manifest) {
    const key = validate(manifest), cache = await caches.open(cacheName), response = await cache.match(key);
    const installed = !!response && response.headers.get('x-hole-model-sha256') === manifest.sha256 && Number(response.headers.get('content-length')) === manifest.bytes;
    return { ...manifest, installed, cacheName, verifiedAtInstall: installed };
  }
  async function install(manifest, blob) {
    const key = validate(manifest);
    if (installing) throw error('Another model is being verified.', 'BUSY');
    installing = true;
    try {
      const bytes = await verify(manifest, blob), cache = await caches.open(cacheName);
      await cache.put(key, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(manifest.bytes), 'X-Hole-Model-SHA256': manifest.sha256 } }));
      return status(manifest);
    } finally { installing = false; }
  }
  async function read(manifest) {
    const key = validate(manifest), response = await (await caches.open(cacheName)).match(key);
    if (!response) throw error('Install the pinned model file locally before running this tool.', 'MODEL_MISSING');
    return verify(manifest, await response.blob());
  }
  async function remove(manifest) { return (await caches.open(cacheName)).delete(validate(manifest)); }
  globalThis.HoleModelStore = Object.freeze({ install, status, remove, read, cacheName, maxBytes });
})();
