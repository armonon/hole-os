import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';

const codecSource = await readFile(new URL('../src/actions-codecs.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../src/actions.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function environment() {
  const db = new Map(), blobs = new Map(); let counter = 0, commitCount = 0;
  const map = type => { if (!db.has(type)) db.set(type, new Map()); return db.get(type); };
  const copy = value => value == null ? value : structuredClone(value);
  const store = {
    ready: Promise.resolve(),
    list: async type => copy([...map(type).values()]),
    get: async (type, id) => copy(map(type).get(id) || null),
    put: async (type, record, options = {}) => {
      const old = map(type).get(record.id);
      if (old && old.revision !== options.expectedRevision) throw Object.assign(new Error('Stale revision.'), { code: 'CONFLICT' });
      const value = { ...copy(record), revision: old ? old.revision + 1 : 1, createdAt: old?.createdAt || '2026-10-26T12:00:00.000Z' };
      map(type).set(value.id, value); return copy(value);
    },
    readAsset: async (assetId, versionId) => {
      const asset = map('assets').get(assetId), version = map('versions').get(versionId || asset?.headVersionId);
      if (!asset || !version || version.assetId !== assetId) throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
      return { asset: copy(asset), version: copy(version), blob: blobs.get(version.id) };
    },
    commitJobOutputs: async ({ jobId, outputs }) => {
      const job = map('jobs').get(jobId);
      if (job.status === 'cancelled') throw Object.assign(new Error('Cancelled'), { code: 'CANCELLED' });
      const results = [];
      for (const output of outputs) {
        const old = output.assetId ? map('assets').get(output.assetId) : null;
        if (old && old.headVersionId !== output.baseVersionId) throw Object.assign(new Error('Stale head.'), { code: 'CONFLICT' });
        const assetId = old?.id || `output-${++counter}`, versionId = `version-${++counter}`;
        const asset = { ...(old || {}), id: assetId, name: output.name || old?.name, kind: output.kind, mime: output.blob.type, headVersionId: versionId, state: 'active', revision: (old?.revision || 0) + 1, provenance: output.provenance };
        const version = { id: versionId, assetId, mime: output.blob.type, size: output.blob.size, parentVersionIds: old ? [old.headVersionId] : [], provenance: output.provenance };
        map('assets').set(assetId, asset); map('versions').set(versionId, version); blobs.set(versionId, output.blob); results.push({ asset: copy(asset), version: copy(version) });
      }
      commitCount++;
      const completed = { ...job, status: 'completed', progress: 100, revision: job.revision + 1, outputs: results.map(item => ({ assetId: item.asset.id, versionId: item.version.id })) };
      map('jobs').set(jobId, completed);
      return { job: copy(completed), outputs: results, assets: results.map(item => item.asset), versions: results.map(item => item.version), replayed: false };
    }
  };
  const calls = [];
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { drawImage: (...args) => calls.push(args.slice(1)), imageSmoothingEnabled: false }; }
    async convertToBlob({ type }) { return new Blob([JSON.stringify({ width: this.width, height: this.height })], { type }); }
  }
  const context = vm.createContext({ Blob, TextEncoder, TextDecoder, Uint8Array, Uint32Array, Float32Array, DataView, Date, Map, Set, Error, Promise, AbortController, setTimeout, clearTimeout, crypto: webcrypto, HoleCore: store, OffscreenCanvas: Canvas, createImageBitmap: async () => ({ width: 4000, height: 3000, close() {} }) });
  vm.runInContext(codecSource, context); vm.runInContext(source, context);
  async function seed() {
    await store.put('projects', { id: 'release', name: 'Moon / Release' });
    await store.put('assets', { id: 'cover', name: 'cover.jpg', mime: 'image/jpeg', state: 'active', headVersionId: 'original' });
    await store.put('versions', { id: 'original', assetId: 'cover', mime: 'image/jpeg', size: 6 });
    blobs.set('original', new Blob(['source'], { type: 'image/jpeg' }));
  }
  return { context, api: context.HoleActions, codec: context.HoleActionCodecs, store, db, blobs, calls, seed, get commitCount() { return commitCount; } };
}

test('crop keeps focal position and aspect ratio, and detects upscaling', () => {
  const { codec } = environment();
  const crop = codec.focalCrop(4000, 3000, 1080, 1920, { x: 1, y: .5 });
  assert.equal(crop.y, 0); assert.equal(crop.x + crop.width, 4000);
  assert.equal(crop.width / crop.height, 1080 / 1920);
  assert.equal(crop.needsUpscale, false);
  assert.equal(codec.focalCrop(1000, 1000, 3000, 3000, { x: .5, y: .5 }).needsUpscale, true);
  assert.throws(() => codec.focalCrop(4000, 3000, 1080, 1920), /focal point/);
  assert.throws(() => codec.focalCrop(4000, 3000, 1080, 1920, { x: 4, y: .5 }), /between/);
  assert.throws(() => codec.explicitCrop(4000, 3000, { x: 0, y: 0, width: 1000, height: 500 }, 500, 500), /stretching/);
  const resize = codec.resizeGeometry(4000, 3000, 1000, 1000);
  assert.deepEqual([resize.outputWidth, resize.outputHeight], [1000, 750]);
  assert.throws(() => codec.dimensions(16384, 16384), /40 megapixels/);
});

function unzipStored(bytes, codec) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), decoder = new TextDecoder(), files = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 8, true), 0);
    const size = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
    const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const dataAt = offset + 30 + nameLength + extraLength, data = bytes.slice(dataAt, dataAt + size);
    assert.equal(codec.crc32(data), view.getUint32(offset + 14, true));
    files.push({ name, data }); offset = dataAt + size;
  }
  const centralOffset = offset;
  for (const file of files) {
    assert.equal(view.getUint32(offset, true), 0x02014b50);
    const nameLength = view.getUint16(offset + 28, true);
    assert.equal(decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength)), file.name);
    offset += 46 + nameLength;
  }
  assert.equal(view.getUint32(offset, true), 0x06054b50);
  assert.equal(view.getUint16(offset + 10, true), files.length);
  assert.equal(view.getUint32(offset + 16, true), centralOffset);
  assert.equal(offset + 22, bytes.length);
  return files;
}

test('ZIP has UTF-8 filenames, correct CRCs and directory offsets, rejects traversal', async () => {
  const { codec } = environment();
  assert.equal(codec.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const archive = await codec.zip([{ name: 'café/image.png', bytes: Uint8Array.of(1, 2, 255) }, { name: 'manifest.json', text: '{"actual":true}' }]);
  assert.equal(archive.type, 'application/zip');
  const files = unzipStored(new Uint8Array(await archive.arrayBuffer()), codec);
  assert.deepEqual(files.map(value => value.name), ['café/image.png', 'manifest.json']);
  assert.deepEqual([...files[0].data], [1, 2, 255]);
  for (const name of ['../secret', '/absolute', 'bad\\path', 'a/../b']) await assert.rejects(codec.zip([{ name, text: '' }]), /safe relative/);
  await assert.rejects(codec.zip([{ name: 'same' }, { name: 'same' }]), /unique/);
});

test('WAV writes interleaved PCM samples and accurate header lengths', async () => {
  const { codec } = environment();
  const blob = codec.wav([Float32Array.of(-1, 0, 1), Float32Array.of(.5, -.5, 0)], 48000);
  const bytes = new Uint8Array(await blob.arrayBuffer()), view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint32(40, true), 12);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => view.getInt16(44 + 2 * i, true)), [-32768, 16384, 0, -16384, 32767, 0]);
});

test('release preview pins actual input and declares crops, dimensions and upscale consent', async () => {
  const env = environment(); await env.seed();
  const preview = await env.api.preview('release.asset-pack', { inputs: [{ assetId: 'cover' }], parameters: { focalPoint: { x: .25, y: .5 }, format: 'png' }, projectId: 'release' });
  assert.equal(preview.inputs[0].versionId, 'original');
  assert.deepEqual(plain(preview.outputs.slice(0, 3).map(item => [item.width, item.height])), [[3000, 3000], [1080, 1920], [1200, 630]]);
  assert.equal(preview.requiresUpscaleConsent, false);
  assert.equal(preview.outputs[3].mime, 'application/zip');
  assert.equal(env.commitCount, 0);
});

test('release pack generates three un-stretched outputs and a usable manifest archive, once', async () => {
  const env = environment(); await env.seed();
  const request = { inputs: [{ assetId: 'cover', versionId: 'original' }], projectId: 'release', parameters: { focalPoint: { x: .75, y: .25 }, format: 'png', allowUpscale: false }, idempotencyKey: 'release-once' };
  const result = await env.api.run('release.asset-pack', request);
  assert.equal(result.job.status, 'completed'); assert.equal(result.job.progress, 100); assert.equal(result.outputs.length, 4);
  const zipOutput = result.outputs.find(item => item.asset.mime === 'application/zip');
  const files = unzipStored(new Uint8Array(await env.blobs.get(zipOutput.version.id).arrayBuffer()), env.codec);
  assert.equal(files.length, 4);
  const manifest = JSON.parse(new TextDecoder().decode(files.find(file => file.name === 'manifest.json').data));
  assert.equal(manifest.input.versionId, 'original'); assert.equal(manifest.projectId, 'release');
  assert.deepEqual(manifest.files.map(item => [item.width, item.height]), [[3000, 3000], [1080, 1920], [1200, 630]]);
  assert.ok(manifest.files.every(item => !item.name.includes('/')));
  for (const args of env.calls) assert.ok(Math.abs(args[2] / args[3] - args[6] / args[7]) < .00001);
  const replay = await env.api.run('release.asset-pack', request);
  assert.equal(replay.replayed, true); assert.equal(env.commitCount, 1); assert.equal(replay.outputs[0].asset.id, result.outputs[0].asset.id);
  await assert.rejects(env.api.run('release.asset-pack', { ...request, parameters: { ...request.parameters, format: 'webp' } }), cause => cause.code === 'IDEMPOTENCY_CONFLICT');
});

test('two simultaneous same-key calls commit once and image edits advance a version', async () => {
  const env = environment(); await env.seed();
  const request = { inputs: [{ assetId: 'cover' }], parameters: { width: 600, height: 600 }, idempotencyKey: 'resize-once' };
  const [one, two] = await Promise.all([env.api.run('image.resize', request), env.api.run('image.resize', request)]);
  assert.equal(env.commitCount, 1); assert.equal(one.jobId, two.jobId);
  assert.equal(one.outputs[0].asset.id, 'cover'); assert.equal(one.outputs[0].version.parentVersionIds[0], 'original');
  assert.equal((await env.store.readAsset('cover', 'original')).blob.size, 6);
  await assert.rejects(env.api.run('image.resize', { ...request, inputs: [{ assetId: 'different' }] }), cause => cause.code === 'IDEMPOTENCY_CONFLICT');
});

test('cancel before commit creates no outputs and explicit retry completes once', async () => {
  const env = environment(); await env.seed();
  let cancelled;
  const task = env.api.run('release.asset-pack', { inputs: [{ assetId: 'cover' }], parameters: { focalPoint: { x: .5, y: .5 }, format: 'png' }, idempotencyKey: 'cancel-release', onJob: job => { cancelled = env.api.cancel(job.id); } });
  await assert.rejects(task, cause => cause.code === 'CANCELLED'); await cancelled;
  assert.equal(env.commitCount, 0);
  const job = (await env.store.list('jobs'))[0]; assert.equal(job.status, 'cancelled');
  const retry = await env.api.retry(job.id); assert.equal(retry.job.status, 'completed'); assert.equal(retry.job.attempt, 2); assert.equal(env.commitCount, 1);
});

test('Flow persists versioned recipe snapshot and concrete output references per step', async () => {
  const env = environment(); await env.seed();
  const recipe = await env.api.saveRecipe({ name: 'Small web cover', steps: [{ id: 'resize', actionId: 'image.resize', parameters: { width: 600 } }, { id: 'convert', actionId: 'image.convert', from: 'resize', parameters: { format: 'webp' } }] });
  const result = await env.api.runFlow(recipe.id, { inputs: [{ assetId: 'cover' }], projectId: 'release' });
  assert.equal(result.status, 'completed'); assert.equal(result.recipeSnapshot.recipeVersion, 1);
  assert.deepEqual(plain(result.stepStates.map(item => item.status)), ['completed', 'completed']);
  assert.equal(result.stepStates[0].outputs[0].assetId, 'cover');
  assert.equal((await env.store.get('jobs', result.stepStates[1].jobId)).inputs[0].versionId, result.stepStates[0].outputs[0].versionId);
  assert.equal(env.commitCount, 2);
  const replay = await env.api.retryFlow(result.id); assert.equal(replay.status, 'completed'); assert.equal(env.commitCount, 2);
  await assert.rejects(env.api.saveRecipe({ name: 'Invalid', steps: [{ id: 'a', actionId: 'audio.stems' }] }), /supported action/);
});

async function realEnvironment() {
  const env = environment();
  const indexedDB = new IDBFactory();
  const store = globalThis.HoleCoreFactory.create({ indexedDB, localStorage: null, broadcast: false });
  await store.ready; env.context.HoleCore = store;
  const project = await store.put('projects', { id: 'real-release', name: 'Actual project', assetIds: [] });
  const source = await store.importAsset({ name: 'cover.jpg', blob: new Blob(['image bytes'], { type: 'image/jpeg' }), projectId: project.id });
  return { ...env, store, project, source, indexedDB };
}

test('real Core commits image version and successful job atomically, preserving original bytes', async () => {
  const env = await realEnvironment();
  const input = { assetId: env.source.asset.id, versionId: env.source.version.id };
  const result = await env.api.run('image.convert', { inputs: [input], parameters: { format: 'webp' }, idempotencyKey: 'real-convert' });
  assert.equal(result.job.status, 'completed');
  assert.equal(result.outputs[0].asset.id, input.assetId); assert.match(result.outputs[0].asset.name, /\.webp$/);
  assert.equal((await env.store.readAsset(input.assetId, input.versionId)).blob.type, 'image/jpeg');
  assert.equal(await (await env.store.readAsset(input.assetId, input.versionId)).blob.text(), 'image bytes');
  assert.equal((await env.store.readAsset(input.assetId)).blob.type, 'image/webp');
  assert.deepEqual(result.outputs[0].version.parentVersionIds, [input.versionId]);
  const count = (await env.store.list('versions')).length;
  const replay = await env.api.run('image.convert', { inputs: [input], parameters: { format: 'webp' }, idempotencyKey: 'real-convert' });
  assert.equal(replay.outputs[0].version.id, result.outputs[0].version.id);
  assert.equal((await env.store.list('versions')).length, count);
  await assert.rejects(env.api.run('image.resize', { inputs: [input], parameters: { width: 100 }, idempotencyKey: 'stale-edit' }), cause => cause.code === 'CONFLICT');
  assert.equal((await env.store.list('versions')).length, count);
  assert.equal((await env.store.list('jobs')).find(job => job.idempotencyKey === 'stale-edit').status, 'failed');
  env.store.close();
});

test('real Core Release Pack preserves lineage, memberships, manifest and outputs on reload', async () => {
  const env = await realEnvironment();
  const result = await env.api.releasePack({ assetId: env.source.asset.id, versionId: env.source.version.id, projectId: env.project.id, focalPoint: { x: .5, y: .5 }, format: 'png', idempotencyKey: 'real-pack' });
  assert.equal(result.outputs.length, 4);
  const project = await env.store.get('projects', env.project.id);
  assert.equal(project.assetIds.length, 5);
  for (const output of result.outputs) {
    assert.equal(output.asset.projectId, env.project.id);
    assert.deepEqual(plain(output.version.parentVersionIds), [env.source.version.id]);
    assert.equal(output.version.provenance.sourceVersionId, env.source.version.id);
    assert.equal((await env.store.readAsset(output.asset.id)).version.id, output.version.id);
  }
  const archive = result.outputs.find(item => item.asset.mime === 'application/zip');
  const files = unzipStored(new Uint8Array(await (await env.store.readAsset(archive.asset.id)).blob.arrayBuffer()), env.codec);
  const manifest = JSON.parse(new TextDecoder().decode(files.find(item => item.name === 'manifest.json').data));
  assert.equal(manifest.input.versionId, env.source.version.id);
  assert.equal((await env.store.get('jobs', result.jobId)).outputs.length, 4);
  env.store.close();
  const reopened = globalThis.HoleCoreFactory.create({ indexedDB: env.indexedDB, localStorage: null, broadcast: false });
  await reopened.ready;
  assert.equal((await reopened.get('jobs', result.jobId)).status, 'completed');
  assert.equal((await reopened.readAsset(archive.asset.id)).blob.size, (await reopened.get('versions', archive.version.id)).size);
  reopened.close();
});

test('real Core Flow retry retains completed step and retries only failed output', async () => {
  const env = await realEnvironment();
  const Canvas = env.context.OffscreenCanvas, convert = Canvas.prototype.convertToBlob;
  let failWebp = true;
  Canvas.prototype.convertToBlob = async function (options) {
    if (options.type === 'image/webp' && failWebp) throw new Error('Encoder unavailable temporarily');
    return convert.call(this, options);
  };
  const recipe = await env.api.saveRecipe({ name: 'Retry check', steps: [{ id: 'small', actionId: 'image.resize', parameters: { width: 400 } }, { id: 'web', actionId: 'image.convert', from: 'small', parameters: { format: 'webp' } }] });
  let runId;
  await assert.rejects(env.api.runFlow(recipe.id, { inputs: [{ assetId: env.source.asset.id }], projectId: env.project.id }), cause => { runId = cause.runId; return !!runId; });
  const first = await env.store.get('runs', runId);
  assert.deepEqual(first.stepStates.map(step => step.status), ['completed', 'failed']);
  const completedJob = first.stepStates[0].jobId;
  failWebp = false;
  const result = await env.api.retryFlow(runId);
  assert.equal(result.status, 'completed');
  assert.equal((await env.store.get('jobs', completedJob)).attempt, 1);
  assert.equal((await env.store.get('jobs', result.stepStates[1].jobId)).attempt, 2);
  assert.equal((await env.store.list('versions')).length, 3);
  env.store.close();
});

test('text actions save UTF-8 versions and branch without changing the source', async () => {
  const env = await realEnvironment();
  const source = await env.store.importAsset({ name: 'notes.md', blob: new Blob(['original'], { type: 'text/markdown' }), projectId: env.project.id });
  const saved = await env.api.run('text.save', { inputs: [{ assetId: source.asset.id }], parameters: { text: '# New idea ✨' } });
  assert.equal(await (await env.store.readAsset(source.asset.id)).blob.text(), '# New idea ✨');
  const branch = await env.api.run('text.branch', { inputs: [{ assetId: source.asset.id, versionId: source.version.id }], projectId: env.project.id });
  assert.notEqual(branch.outputs[0].asset.id, source.asset.id);
  assert.equal(await (await env.store.readAsset(branch.outputs[0].asset.id)).blob.text(), 'original');
  assert.equal((await env.store.readAsset(source.asset.id)).version.id, saved.outputs[0].version.id);
  env.store.close();
});

test('small image needs explicit upscale consent and no outputs commit on rejection', async () => {
  const env = await realEnvironment();
  env.context.createImageBitmap = async () => ({ width: 1000, height: 1000, close() {} });
  const request = { inputs: [{ assetId: env.source.asset.id }], parameters: { focalPoint: { x: .5, y: .5 }, format: 'png' }, projectId: env.project.id };
  const plan = await env.api.preview('release.asset-pack', request);
  assert.equal(plan.requiresUpscaleConsent, true);
  await assert.rejects(env.api.run('release.asset-pack', request), cause => cause.code === 'UPSCALE_REQUIRES_CONSENT');
  assert.equal((await env.store.list('assets')).length, 1);
  assert.equal((await env.store.list('jobs'))[0].status, 'failed');
  const result = await env.api.run('release.asset-pack', { ...request, parameters: { ...request.parameters, allowUpscale: true } });
  assert.equal(result.outputs.length, 4);
  env.store.close();
});

test('video thumbnail seeks requested time, preserves aspect ratio and releases media URLs', async () => {
  const env = await realEnvironment(), revoked = [], seeks = [];
  class Video extends EventTarget {
    constructor() { super(); this.videoWidth = 320; this.videoHeight = 180; this.duration = 2; this.time = 0; }
    load() { if (this.src) queueMicrotask(() => this.dispatchEvent(new Event('loadeddata'))); }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    get currentTime() { return this.time; }
    set currentTime(value) { this.time = value; seeks.push(value); queueMicrotask(() => this.dispatchEvent(new Event('seeked'))); }
  }
  env.context.document = { createElement: name => { assert.equal(name, 'video'); return new Video(); } };
  env.context.URL = { createObjectURL: () => 'blob:movie', revokeObjectURL: value => revoked.push(value) };
  const source = await env.store.importAsset({ name: 'recording.mp4', blob: new Blob(['container bytes'], { type: 'video/mp4' }) });
  const result = await env.api.run('video.thumbnail', { inputs: [{ assetId: source.asset.id }], parameters: { time: .75, width: 160, format: 'png' } });
  assert.equal(result.outputs[0].asset.mime, 'image/png');
  assert.equal(result.outputs[0].version.provenance.time, .75);
  assert.equal(result.outputs[0].version.provenance.width, 160); assert.equal(result.outputs[0].version.provenance.height, 90);
  assert.deepEqual(seeks, [.75]); assert.deepEqual(revoked, ['blob:movie']);
  assert.equal((await env.store.readAsset(source.asset.id)).blob.type, 'video/mp4');
  env.store.close();
});

test('video cancellation aborts loading and releases URL without a derived output', async () => {
  const env = await realEnvironment(); let jobId, closed = 0;
  class Video extends EventTarget {
    load() { if (this.src) setTimeout(() => env.api.cancel(jobId), 0); }
    removeAttribute() { this.src = ''; }
  }
  env.context.document = { createElement: () => new Video() };
  env.context.URL = { createObjectURL: () => 'blob:pending', revokeObjectURL: () => { closed++; } };
  const source = await env.store.importAsset({ name: 'movie.webm', blob: new Blob(['container'], { type: 'video/webm' }) });
  await assert.rejects(env.api.run('video.thumbnail', { inputs: [{ assetId: source.asset.id }], parameters: { time: 0 }, onJob: job => { jobId = job.id; } }), cause => cause.code === 'CANCELLED');
  assert.equal((await env.store.get('jobs', jobId)).status, 'cancelled'); assert.equal(closed, 1);
  assert.equal((await env.store.list('assets')).length, 2); // Original seeded cover and original movie.
  env.store.close();
});

test('audio extraction rejects an unsupported video codec with no fabricated result', async () => {
  const env = await realEnvironment(); let closed = false;
  env.context.AudioContext = class { async decodeAudioData() { throw new Error('Cannot decode this container'); } async close() { closed = true; } };
  const source = await env.store.importAsset({ name: 'movie.mp4', blob: new Blob(['unsupported container'], { type: 'video/mp4' }) });
  await assert.rejects(env.api.run('video.audio', { inputs: [{ assetId: source.asset.id }], parameters: {} }), cause => cause.code === 'UNSUPPORTED_CODEC');
  assert.equal(closed, true); assert.equal((await env.store.list('assets')).length, 2);
  assert.equal(env.api.get('video.audio').outputSchema.contents[0], 'audio');
  env.store.close();
});
