(() => {
  'use strict';
  const url = new URL('stem-worker.js', document.currentScript.src);
  let active = false;
  const error = (message, code) => Object.assign(new Error(message), { code });
  function separate(left, right, { signal, onProgress, timeoutMs = 180000 } = {}) {
    if (signal?.aborted) return Promise.reject(error('Separation cancelled.', 'CANCELLED'));
    if (active) return Promise.reject(error('One stem separation can run at a time.', 'BUSY'));
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array) || !left.length || left.length !== right.length || left.length > 661500 || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 180000) return Promise.reject(error('Choose up to15 seconds stereo44.1kHz PCM and a deadline up to180 seconds.', 'RESOURCE_LIMIT'));
    active = true;
    return new Promise((resolve, reject) => {
      let worker, timer, settled = false, progressQueue = Promise.resolve();
      const finish = (cause, result) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); worker?.terminate(); active = false; cause ? reject(cause) : resolve(result); };
      const abort = () => finish(error('Separation cancelled. No outputs committed.', 'CANCELLED'));
      try {
        worker = new Worker(url, { type: 'module' }); timer = setTimeout(() => finish(error('Separation exceeded its time budget.', 'TIMEOUT')), timeoutMs);
        signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) return abort();
        worker.onerror = e => finish(error(e.message || 'Separation worker failed.', 'ENGINE_UNAVAILABLE'));
        worker.onmessage = ({ data }) => {
          if (data.type === 'progress') { progressQueue = progressQueue.then(() => settled ? undefined : onProgress?.(data.stage)); progressQueue.catch(finish); }
          else if (data.type === 'error') finish(error(data.message, data.code));
          else if (data.type === 'done') progressQueue.then(() => finish(null, data), finish);
        };
        worker.postMessage({ left, right });
      } catch (cause) { finish(cause); }
    });
  }
  globalThis.HoleStems = Object.freeze({ separate, limits: { maxSeconds: 15, sampleRate: 44100, channels: 2, timeoutMs: 180000 } });
})();
