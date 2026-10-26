import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';

const context = vm.createContext({ Blob, ArrayBuffer, TextEncoder, URL, AbortController, crypto: webcrypto });
for (const file of ['runtime.js', 'bridge.js']) vm.runInContext(await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'), context);
const { createRuntime } = context.HoleRuntimeModel;
const { createBridge } = context.HoleBridgeModel;
const plain = value => JSON.parse(JSON.stringify(value));
const pause = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture({ beforeCommit, beforeRead, now = () => 1000 } = {}) {
  let commits = 0, head = 'version:1', next = 1;
  const records = new Map(), outbound = [], writes = [];
  const core = {
    ready: Promise.resolve(),
    async get(type, id) { return records.get(`${type}/${id}`) || null; },
    async put(type, record, options = {}) {
      const key = `${type}/${record.id}`, old = records.get(key);
      if (old && old.revision !== options.expectedRevision) throw Object.assign(new Error('Conflicting record'), { code: 'CONFLICT' });
      const stored = { ...record, revision: (old?.revision || 0) + 1 }; records.set(key, stored); writes.push({ type, record: stored }); return stored;
    },
    async readAsset(assetId, versionId) {
      await beforeRead?.promise;
      return { asset: { id: assetId, name: 'Cover.png', kind: 'image', mime: 'image/png' }, version: { id: versionId, assetId, mime: 'image/png', size: 3 }, blob: new Blob(['old'], { type: 'image/png' }) };
    },
    async commitAsset(input) {
      commits++; await beforeCommit?.promise;
      if (input.baseVersionId !== head) throw Object.assign(new Error('Stale base version'), { code: 'CONFLICT' });
      head = `version:${++next}`; writes.push(input);
      return { asset: { id: input.assetId, revision: next }, version: { id: head } };
    },
    async commitJobOutputs(input) { writes.push(input); return { outputs: input.outputs.map((output, index) => ({ assetId: `result:${index}`, projectId: output.projectId })) }; }
  };
  const source = { postMessage(message, origin) { outbound.push({ message, origin }); } };
  const bridge = createBridge({ core, host: { location: { origin: 'https://hole.test' }, addEventListener() {}, removeEventListener() {} }, approvedOrigins: ['https://studio.test'], now });
  const connection = bridge.connectExternal({ origin: 'https://studio.test', source, instanceId: 'instance:1', projectId: 'project:original', resources: [{ assetId: 'asset:1', versionId: 'version:1', operations: ['resource.read', 'resource.commit', 'resource.derive'] }], operations: ['resource.read', 'resource.commit', 'resource.derive', 'project.kit', 'state.save', 'activity.report', 'request.cancel'], ttlMs: 1000 });
  const hello = outbound[0].message;
  const event = data => ({ origin: 'https://studio.test', source, data });
  const handshake = () => bridge.receive(event({ ...hello, type: 'ready' }));
  const request = (operation, payload, requestId = `request:${next++}`) => ({ ...hello, type: 'request', grantId: connection.grantId, requestId, operation, payload });
  return { core, records, outbound, writes, source, bridge, connection, hello, event, handshake, request, commitCount: () => commits };
}

test('bridge refuses unknown origins, wrong source, nonce and pre-handshake requests', async () => {
  const f = fixture();
  assert.throws(() => f.bridge.connectExternal({ origin: 'https://evil.test', source: f.source }), { code: 'ORIGIN_NOT_APPROVED' });
  assert.equal(await f.bridge.receive({ ...f.event({ ...f.hello, type: 'ready' }), origin: 'https://evil.test' }), false);
  assert.equal(await f.bridge.receive({ ...f.event({ ...f.hello, type: 'ready' }), source: {} }), false);
  assert.equal(await f.bridge.receive(f.event({ ...f.hello, nonce: 'wrong', type: 'ready' })), false);
  await f.bridge.receive(f.event(f.request('resource.read', { assetId: 'asset:1', versionId: 'version:1' })));
  assert.equal(f.outbound.length, 1);
  await f.handshake();
  assert.equal(f.outbound.at(-1).message.type, 'grant');
  assert.ok(f.outbound.every(item => item.origin === 'https://studio.test'));
});

test('exact schema and per-resource/project/version grants reject ambient access', async () => {
  const f = fixture(); await f.handshake();
  for (const [operation, payload, code] of [
    ['resource.read', { assetId: 'asset:other', versionId: 'version:1' }, 'ACCESS_DENIED'],
    ['resource.read', { assetId: 'asset:1', versionId: 'version:other' }, 'ACCESS_DENIED'],
    ['project.kit', { projectId: 'project:other' }, 'ACCESS_DENIED'],
    ['resource.read', { assetId: 'asset:1', versionId: 'version:1', includeAll: true }, 'INVALID_MESSAGE']
  ]) {
    await f.bridge.receive(f.event(f.request(operation, payload)));
    assert.equal(f.outbound.at(-1).message.error.code, code);
  }
  assert.equal(f.writes.length, 0);
});

test('save ACK follows durable commit; concurrent retries commit once and retain original project', async () => {
  const barrier = pause(), f = fixture({ beforeCommit: barrier }); await f.handshake();
  const data = f.request('resource.commit', { assetId: 'asset:1', baseVersionId: 'version:1', blob: new Blob(['new']), operation: 'edit' }, 'save:1');
  const first = f.bridge.receive(f.event(data)), retry = f.bridge.receive(f.event(data));
  for (let n = 0; n < 50 && !f.commitCount(); n++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(f.commitCount(), 1);
  assert.equal(f.outbound.filter(item => item.message.type === 'response').length, 0);
  // UI project changes are irrelevant: only the immutable connection context is used.
  barrier.resolve(); await Promise.all([first, retry]);
  assert.equal(f.outbound.at(-1).message.result.projectId, 'project:original');
  assert.equal(f.writes[0].parameters.bridge.projectId, 'project:original');
  await f.bridge.receive(f.event(data));
  assert.equal(f.commitCount(), 1);
  await f.bridge.receive(f.event({ ...data, payload: { ...data.payload, blob: new Blob(['different']) } }));
  assert.equal(f.outbound.at(-1).message.error.code, 'REQUEST_REUSE');
});

test('stale base is a conflict, never a successful save acknowledgement', async () => {
  const f = fixture(); await f.handshake();
  const payload = { assetId: 'asset:1', baseVersionId: 'version:1', blob: new Blob(['new']), operation: 'edit' };
  await f.bridge.receive(f.event(f.request('resource.commit', payload, 'save:first')));
  await f.bridge.receive(f.event(f.request('resource.commit', payload, 'save:stale')));
  assert.equal(f.outbound.at(-1).message.ok, false);
  assert.equal(f.outbound.at(-1).message.error.code, 'CONFLICT');
});

test('expiry and revocation block reads and prevent in-flight read disclosure', async () => {
  let clock = 1000;
  const f = fixture({ now: () => clock }); await f.handshake(); clock = 2001;
  assert.equal(await f.bridge.receive(f.event(f.request('resource.read', { assetId: 'asset:1', versionId: 'version:1' }))), false);
  const barrier = pause(), g = fixture({ beforeRead: barrier }); await g.handshake();
  const waiting = g.bridge.receive(g.event(g.request('resource.read', { assetId: 'asset:1', versionId: 'version:1' })));
  await Promise.resolve(); g.bridge.revoke(g.connection.sessionId); barrier.resolve(); await waiting;
  assert.equal(g.outbound.at(-1).message.type, 'revoked');
  assert.ok(!g.outbound.some(item => item.message.result?.blob));
});

test('derived outputs are bound to original inputs and project and duplicated only once', async () => {
  const f = fixture(); await f.handshake();
  const request = f.request('resource.derive', { assetId: 'asset:1', versionId: 'version:1', operation: 'export', outputs: [{ name: 'Cover.webp', kind: 'image', blob: new Blob(['webp']) }] }, 'derive:1');
  await Promise.all([f.bridge.receive(f.event(request)), f.bridge.receive(f.event(request))]);
  const outputWrites = f.writes.filter(value => value.outputs);
  assert.equal(outputWrites.length, 1);
  assert.equal(outputWrites[0].outputs[0].projectId, 'project:original');
  assert.equal(outputWrites[0].outputs[0].provenance.inputVersionId, 'version:1');
});

test('oversized metadata, fake binaries and fake completion are rejected', async () => {
  const f = fixture(); await f.handshake();
  for (const [op, payload, code] of [
    ['state.save', { state: { value: 'x'.repeat(66000) } }, 'PAYLOAD_TOO_LARGE'],
    ['resource.commit', { assetId: 'asset:1', baseVersionId: 'version:1', blob: { size: 3 }, operation: 'edit' }, 'INVALID_BINARY'],
    ['activity.report', { jobId: 'job:1', label: 'Pretend render', state: 'completed' }, 'INVALID_MESSAGE']
  ]) { await f.bridge.receive(f.event(f.request(op, payload))); assert.equal(f.outbound.at(-1).message.error.code, code); }
  assert.equal(f.writes.length, 0);
});

test('sandbox transport requires opaque-origin isolation and receives a child-created capability port', async () => {
  const f = fixture(), source = {}, packets = [];
  const port = { postMessage: data => packets.push(data), start() {}, close() {} };
  const frame = { contentWindow: source, sandbox: { length: 2, contains: () => true }, hasAttribute: () => true };
  assert.throws(() => f.bridge.prepareSandbox({ frame }), { code: 'UNSAFE_SANDBOX' });
  frame.sandbox.length = 1;
  const sandbox = f.bridge.prepareSandbox({ frame, instanceId: 'instance:tool', operations: ['resource.read'], resources: [{ assetId: 'asset:1', versionId: 'version:1' }] });
  const { hostOrigin, ...bootstrap } = sandbox.bootstrap;
  assert.equal(hostOrigin, 'https://hole.test');
  const event = { source, origin: 'null', data: { ...bootstrap, type: 'port-ready' }, ports: [port] };
  assert.equal(await f.bridge.receive({ ...event, origin: 'https://hole.test' }), false);
  assert.equal(await f.bridge.receive({ ...event, source: {} }), false);
  assert.equal(await f.bridge.receive(event), true);
  assert.equal(packets[0].type, 'grant');
  assert.equal(await f.bridge.receive(event), false);
  f.bridge.revoke(sandbox.sessionId);
});

test('runtime preserves mounted editor across presentations and explicitly separates resources', async () => {
  const f = fixture(); let mounts = 0, serial = 0;
  const runtime = createRuntime({ core: f.core });
  runtime.register('paper', { mount(instance) { mounts++; return { serialize: () => ({ text: `Draft ${++serial}`, selection: { start: 3, end: 3 } }), present() {} }; } });
  const first = await runtime.open('paper', { assetId: 'asset:1', versionId: 'version:1', projectId: 'project:1' });
  await runtime.present(first.id, 'canvas'); await runtime.present(first.id, 'focus'); await runtime.present(first.id, 'window');
  assert.equal(mounts, 1);
  const reused = await runtime.open('paper', { assetId: 'asset:1', versionId: 'version:1', projectId: 'project:1', reuse: 'same-resource' });
  assert.equal(reused.id, first.id);
  const second = await runtime.open('paper', { assetId: 'asset:2', versionId: 'version:2', projectId: 'project:1', reuse: 'same-resource' });
  assert.notEqual(second.id, first.id); assert.equal(mounts, 2);
  const snapshot = await runtime.serialize(first.id);
  await runtime.close(first.id, { checkpoint: false });
  await runtime.restore(snapshot);
  assert.deepEqual(plain(runtime.get(first.id).context), plain(first.context));
  await assert.rejects(runtime.restore(snapshot), { code: 'INSTANCE_EXISTS' });
});

test('runtime leaves editor mounted when checkpoint fails and checkpoints only committed state', async () => {
  let reject = false, closes = 0;
  const f = fixture(), put = f.core.put;
  f.core.put = async (...args) => { if (reject) throw Object.assign(new Error('Storage full'), { code: 'QUOTA' }); return put(...args); };
  const runtime = createRuntime({ core: f.core });
  runtime.register('paper', { mount() { return { serialize: () => ({ text: 'Keep my draft' }), close: () => { closes++; } }; } });
  const entry = await runtime.open('paper');
  const saved = await runtime.checkpoint(entry.id);
  assert.equal(saved.value.editorState.text, 'Keep my draft');
  reject = true;
  await assert.rejects(runtime.close(entry.id), { code: 'QUOTA' });
  assert.equal(runtime.get(entry.id).status, 'running'); assert.equal(closes, 0);
});

test('bridge and real Core commit outputs atomically and recover them after reopening', async () => {
  const indexedDB = new IDBFactory();
  const core = globalThis.HoleCoreFactory.create({ indexedDB, localStorage: null, broadcast: false });
  await core.put('projects', { id: 'p', name: 'Release', assetIds: [] });
  const input = await core.importAsset({ name: 'Cover.png', blob: new Blob(['source'], { type: 'image/png' }), projectId: 'p' });
  const outbound = [], source = { postMessage: message => outbound.push(message) };
  const bridge = createBridge({ core, approvedOrigins: ['https://studio.test'] });
  const connected = bridge.connectExternal({ origin: 'https://studio.test', source, instanceId: 'instance:real', projectId: 'p', resources: [{ assetId: input.asset.id, versionId: input.version.id, operations: ['resource.derive'] }], operations: ['resource.derive'] });
  const hello = outbound[0], event = data => ({ source, origin: 'https://studio.test', data });
  await bridge.receive(event({ ...hello, type: 'ready' }));
  const request = { ...hello, type: 'request', grantId: connected.grantId, requestId: 'derive:real', operation: 'resource.derive', payload: { assetId: input.asset.id, versionId: input.version.id, operation: 'studio-export', outputs: [{ name: 'Cover.webp', kind: 'image', blob: new Blob(['converted'], { type: 'image/webp' }) }] } };
  await bridge.receive(event(request));
  const response = outbound.at(-1);
  assert.equal(response.ok, true);
  assert.equal(response.result.job.status, 'completed');
  assert.equal(response.result.outputs.length, 1);
  core.close();
  const reopened = globalThis.HoleCoreFactory.create({ indexedDB, localStorage: null, broadcast: false });
  const saved = await reopened.readAsset(response.result.outputs[0].asset.id);
  assert.equal(await saved.blob.text(), 'converted');
  assert.equal(saved.asset.projectId, 'p');
  assert.equal((await reopened.get('projects', 'p')).assetIds.length, 2);
  bridge.dispose(); reopened.close();
});

test('SDK completes exact-origin handshake and Luma retries ambiguous saves without duplicating versions', async () => {
  const f = fixture({ now: () => Date.now() }), listeners = new Set();
  const sdkContext = vm.createContext({ Blob, URL, crypto: webcrypto, structuredClone, setTimeout, clearTimeout });
  for (const file of ['bridge-client.js', 'luma-adapter.js']) vm.runInContext(await readFile(new URL(`../sdk/${file}`, import.meta.url), 'utf8'), sdkContext);
  const surface = { addEventListener(type, callback) { listeners.add(callback); }, removeEventListener(type, callback) { listeners.delete(callback); } };
  const hostWindow = { postMessage(data, origin) { assert.equal(origin, 'https://hole.test'); void f.bridge.receive(f.event(data)); } };
  const originalPost = f.source.postMessage;
  f.source.postMessage = (data, origin) => {
    originalPost(data, origin);
    for (const callback of listeners) callback({ data, source: hostWindow, origin: 'https://hole.test' });
  };
  const client = sdkContext.HoleBridgeClient.createClient({ surface, hostWindow, hostOrigin: 'https://hole.test', timeoutMs: 1000 });
  f.bridge.retryHandshake(f.connection.sessionId);
  assert.equal((await client.ready).projectId, 'project:original');
  let activeId = 'blank', loseAcknowledgement = true;
  const studio = { dirtyDocuments: () => [], activeDocumentState: () => ({ id: activeId }), openImage() { activeId = 'image-session'; }, exportImage: async () => new Blob(['edited'], { type: 'image/png' }) };
  const adapter = sdkContext.HoleLumaAdapter.create({ studio, loadImage: async () => ({}), client: {
    ready: client.ready,
    async request(operation, payload, options) {
      const result = await client.request(operation, payload, options);
      if (operation === 'resource.commit' && loseAcknowledgement) { loseAcknowledgement = false; throw Object.assign(new Error('Lost ACK'), { code: 'REQUEST_TIMEOUT' }); }
      return result;
    }
  } });
  await adapter.openGranted('asset:1', 'version:1');
  await assert.rejects(adapter.saveBack(), { code: 'REQUEST_TIMEOUT' });
  assert.equal(adapter.getBinding().versionId, 'version:1');
  assert.ok(adapter.getPendingSave());
  const saved = await adapter.saveBack();
  assert.equal(f.commitCount(), 1);
  assert.equal(adapter.getBinding().versionId, saved.versionId);
  assert.equal(adapter.getPendingSave(), null);
  activeId = 'unrelated-document';
  await assert.rejects(adapter.saveBack(), { code: 'DOCUMENT_CHANGED' });
  client.dispose(); f.bridge.dispose();
});

test('native recovery checkpoints retain exact bytes as JSON-safe records and reject changed retry bytes', async () => {
  const f = fixture(); await f.handshake();
  const bytes = new Blob([new Uint8Array([0, 255, 128, 42])], { type: 'application/x-luma' });
  const packet = f.request('state.save', { state: { dirty: true }, recovery: bytes }, 'recovery:1');
  await f.bridge.receive(f.event(packet));
  const stored = f.records.get('settings/bridge-state:instance:1');
  assert.equal(stored.recovery.hex, '00ff802a');
  assert.equal(JSON.parse(JSON.stringify(stored)).recovery.mime, 'application/x-luma');
  await f.bridge.receive(f.event({ ...packet, payload: { ...packet.payload, recovery: new Blob(['changed']) } }));
  assert.equal(f.outbound.at(-1).message.ok, false);
  assert.equal(f.records.get('settings/bridge-state:instance:1').revision, 1);
  await f.bridge.receive(f.event(f.request('state.save', { state: { dirty: false }, recovery: null, expectedRevision: 1 }, 'recovery:2')));
  assert.equal(f.records.get('settings/bridge-state:instance:1').recovery, null);
  f.bridge.dispose();
});
