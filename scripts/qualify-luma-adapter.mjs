/* Opt-in local qualification against an explicitly supplied Luma checkout.
 * Runs its real Studio engine with its real native canvas harness, not a browser.
 * No source/deployment outside Hole is modified. See the evidence document. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';

const sourceRoot = process.argv[2];
if (!sourceRoot || !path.isAbsolute(sourceRoot)) throw new Error('Pass an absolute Luma source directory; run with that checkout’s tsx loader.');
const root = fileURLToPath(new URL('../', import.meta.url));
const harness = await import(pathToFileURL(path.join(sourceRoot, 'tests/canvas-harness.ts')).href);
const { Studio } = await import(pathToFileURL(path.join(sourceRoot, 'app/engine/studio.ts')).href);
const core = globalThis.HoleCoreFactory.create({ indexedDB: new IDBFactory(), localStorage: null, broadcast: false });
const environment = vm.createContext({ Blob, ArrayBuffer, TextEncoder, URL, AbortController, crypto: webcrypto });
vm.runInContext(await readFile(path.join(root, 'src/bridge.js'), 'utf8'), environment);
const report = { evidenceType: 'real Studio engine + native Canvas + Core IndexedDB + SDK; simulated postMessage transport, not live browser UI', sourceRevision: execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), observedAt: new Date().toISOString(), cases: [] };
const disposals = [];

async function connect(input, studio) {
  const listeners = new Set();
  const sdk = vm.createContext({ Blob, URL, crypto: webcrypto, structuredClone, setTimeout, clearTimeout });
  for (const file of ['bridge-client.js', 'luma-adapter.js']) vm.runInContext(await readFile(path.join(root, 'sdk', file), 'utf8'), sdk);
  let bridge;
  const hostWindow = { postMessage(data, origin) { assert.equal(origin, 'https://hole.local.test'); void bridge.receive({ source: studioWindow, origin: 'https://luma.local.test', data }); } };
  const studioWindow = { postMessage(data, origin) { assert.equal(origin, 'https://luma.local.test'); for (const listener of listeners) listener({ data, source: hostWindow, origin: 'https://hole.local.test' }); } };
  const surface = { addEventListener(type, listener) { listeners.add(listener); }, removeEventListener(type, listener) { listeners.delete(listener); } };
  bridge = environment.HoleBridgeModel.createBridge({ core, approvedOrigins: ['https://luma.local.test'], host: { location: { origin: 'https://hole.local.test' }, addEventListener() {}, removeEventListener() {} } });
  const client = sdk.HoleBridgeClient.createClient({ surface, hostWindow, hostOrigin: 'https://hole.local.test', timeoutMs: 3000 });
  bridge.connectExternal({ origin: 'https://luma.local.test', source: studioWindow, instanceId: crypto.randomUUID(), projectId: 'luma-proof', resources: [{ assetId: input.asset.id, versionId: input.version.id, operations: ['resource.read', 'resource.commit'] }], operations: ['resource.read', 'resource.commit', 'project.kit'] });
  await client.ready;
  const adapter = sdk.HoleLumaAdapter.create({ studio, client, loadImage: async blob => globalThis.createImageBitmap(blob) });
  disposals.push(() => { client.dispose(); bridge.dispose(); studio.dispose(); });
  await adapter.openGranted(input.asset.id, input.version.id);
  return adapter;
}

try {
  await core.put('projects', { id: 'luma-proof', name: 'Luma adapter proof', assetIds: [] });
  const canvas = harness.solidCanvas(32, 24, '#ff0000');
  const drawing = canvas.getContext('2d'); drawing.fillStyle = '#0000ff'; drawing.fillRect(16, 0, 16, 24);
  const source = await core.importAsset({ name: 'Two colors.png', blob: new Blob([canvas.toBuffer('image/png')], { type: 'image/png' }), projectId: 'luma-proof' });
  const studio = new Studio(8, 8, harness.testCanvas(8, 8)), adapter = await connect(source, studio);
  assert.equal(studio.doc.width, 32); assert.equal(studio.doc.height, 24);
  studio.cropRect(16, 0, 16, 12, 'Hole round-trip crop');
  const saved = await adapter.saveBack(), output = await core.readAsset(source.asset.id, saved.versionId);
  const decoded = await globalThis.createImageBitmap(output.blob), check = harness.testCanvas(16, 12); check.getContext('2d').drawImage(decoded, 0, 0);
  assert.equal(decoded.width, 16); assert.equal(decoded.height, 12);
  assert.deepEqual(harness.pixelAt(check, 5, 5), { r: 0, g: 0, b: 255, a: 255 });
  assert.equal((await core.readAsset(source.asset.id, source.version.id)).version.size, source.version.size);
  report.cases.push({ name: 'PNG import → actual Studio crop → SDK save → immutable Core version', result: 'pass', outputMime: output.blob.type, dimensions: [decoded.width, decoded.height], verifiedPixel: harness.pixelAt(check, 5, 5), originalRetained: true });

  const nativeTicket = await studio.prepareProjectSave('Native proof');
  const native = await core.importAsset({ name: 'Native proof.luma', blob: nativeTicket.blob, projectId: 'luma-proof' });
  const nativeStudio = new Studio(8, 8, harness.testCanvas(8, 8)), nativeAdapter = await connect(native, nativeStudio);
  nativeStudio.setLayerProp(nativeStudio.doc.layers[0].id, 'opacity', .5, 'Hole opacity edit');
  assert.equal(nativeStudio.activeDocumentState().dirty, true);
  const nativeSaved = await nativeAdapter.saveBack();
  assert.equal(nativeStudio.activeDocumentState().dirty, false);
  const nativeOutput = await core.readAsset(native.asset.id, nativeSaved.versionId);
  const reopened = new Studio(8, 8, harness.testCanvas(8, 8));
  await reopened.importProject(nativeOutput.blob, { restoreHistory: true });
  assert.equal(reopened.doc.layers[0].opacity, .5); assert.equal(reopened.doc.width, 16);
  reopened.dispose();
  report.cases.push({ name: 'Native .luma import → editable layer change → prepare/ACK/complete → reopen', result: 'pass', outputBytes: nativeOutput.blob.size, reopenedLayerOpacity: .5, saveAcknowledgedBeforeCleanState: true });
  report.status = 'passed';
} catch (cause) { report.status = 'failed'; report.error = cause.message; process.exitCode = 1; }
finally {
  disposals.reverse().forEach(dispose => dispose()); core.close();
  await mkdir(path.join(root, 'docs/evidence'), { recursive: true });
  await writeFile(path.join(root, 'docs/evidence/luma-adapter-local.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
