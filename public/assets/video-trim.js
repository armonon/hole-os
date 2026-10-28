/* Isolated bounded local WebCodecs conversion, terminated on cancel/timeout. */
(() => {
  'use strict';
  const base = globalThis.document?.currentScript?.src;
  const workerURL = base ? new URL('video-trim-worker.js', base) : null;
  const fail = (message, code) => Object.assign(new Error(message), { code });
  function trim(blob, { start, end, budgetMs = 60000, signal, onProgress } = {}) {
    if (!(blob instanceof Blob) || blob.size > 64 * 1024 * 1024 || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 30 || end > 600 || !Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 120000) return Promise.reject(fail('Choose up to 30 seconds within a source up to ten minutes/64 MiB; budget must be 1–120000 ms.', 'RESOURCE_LIMIT'));
    if (signal?.aborted) return Promise.reject(fail('Video trim cancelled.', 'CANCELLED'));
    if (!workerURL || !globalThis.Worker || !globalThis.VideoEncoder || !globalThis.VideoDecoder) return Promise.reject(fail('Local video transcoding requires WebCodecs and module workers.', 'ENGINE_UNAVAILABLE'));
    return new Promise((resolve, reject) => {
      let worker, timer, done = false, progressQueue = Promise.resolve();
      const finish = (error, result) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); worker?.terminate(); error ? reject(error) : resolve(result); };
      const abort = () => finish(fail('Video trim cancelled. No output committed.', 'CANCELLED'));
      try {
        worker = new Worker(workerURL, { type: 'module' });
        timer = setTimeout(() => finish(fail('Video trim exceeded its time budget.', 'RESOURCE_LIMIT')), budgetMs);
        signal?.addEventListener('abort', abort, { once: true });
        worker.onerror = event => finish(fail(event.message || 'Video worker failed.', 'ENGINE_UNAVAILABLE'));
        worker.onmessage = ({ data }) => {
          if (data.type === 'done') progressQueue.then(() => finish(null, data), error => finish(error));
          else if (data.type === 'error') finish(fail(data.message, data.code));
          else if (data.type === 'progress') { progressQueue = progressQueue.then(() => done ? undefined : onProgress?.(data.progress)); progressQueue.catch(error => finish(error)); }
        };
        worker.postMessage({ blob, start, end });
      } catch (error) { finish(error); }
    });
  }
  globalThis.HoleVideoTrim = Object.freeze({ trim });
})();
