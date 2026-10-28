import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/video-trim.js', import.meta.url), 'utf8');
function setup(mode = 'idle') {
  const workers = [];
  class Worker {
    constructor(url, options) { this.url = String(url); this.options = options; workers.push(this); }
    postMessage() { if (mode === 'done') setTimeout(() => { this.onmessage({ data: { type: 'progress', progress: .5 } }); this.onmessage({ data: { type: 'progress', progress: .9 } }); this.onmessage({ data: { type: 'done', blob: new Blob(['result']) } }); }, 0); }
    terminate() { this.terminated = true; }
  }
  const scope = vm.createContext({ Blob, URL, Worker, VideoEncoder: class {}, VideoDecoder: class {}, document: { currentScript: { src: 'https://local.invalid/assets/video-trim.js' } }, setTimeout, clearTimeout });
  vm.runInContext(source, scope); return { api: scope.HoleVideoTrim, workers };
}
test('trim bounds reject before creating any worker', async () => {
  const { api, workers } = setup();
  for (const options of [{ start: 0, end: 31 }, { start: 3, end: 2 }, { start: 0, end: 1, budgetMs: 120001 }]) await assert.rejects(api.trim(new Blob(['x']), options), { code: 'RESOURCE_LIMIT' });
  assert.equal(workers.length, 0);
});
test('timeout and abort terminate the isolated engine', async () => {
  const { api, workers } = setup();
  await assert.rejects(api.trim(new Blob(['x']), { start: 0, end: 1, budgetMs: 1 }), { code: 'RESOURCE_LIMIT' });
  assert.equal(workers[0].terminated, true);
  const controller = new AbortController(); const pending = api.trim(new Blob(['x']), { start: 0, end: 1, signal: controller.signal }); controller.abort();
  await assert.rejects(pending, { code: 'CANCELLED' }); assert.equal(workers[1].terminated, true);
});
test('progress writes serialize and finish before success; worker terminates', async () => {
  const { api, workers } = setup('done'), events = []; let active = 0;
  const result = await api.trim(new Blob(['x']), { start: 0, end: 1, onProgress: async value => { assert.equal(active++, 0); await new Promise(resolve => setTimeout(resolve, 2)); events.push(value); active--; } });
  assert.deepEqual(events, [.5, .9]); assert.equal(await result.blob.text(), 'result'); assert.equal(workers[0].terminated, true);
  assert.equal(workers[0].url, 'https://local.invalid/assets/video-trim-worker.js'); assert.equal(workers[0].options.type, 'module');
});
test('retained media engine bundle and license match the inspected installed package', async () => {
  const { createHash } = await import('node:crypto');
  for (const [file, expected] of [['mediabunny.min.mjs', '1cd761e442a173c461b1a63cba29cb0816383f3b93b78d64b6e44c6dbce85d2b'], ['LICENSE', '3f3d9e0024b1921b067d6f7f88deb4a60cbe7a78e76c64e3f1d7fc3b779b9d04']]) assert.equal(createHash('sha256').update(await readFile(new URL('../src/vendor/mediabunny/' + file, import.meta.url))).digest('hex'), expected);
});
