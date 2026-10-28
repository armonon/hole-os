import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import '../src/core.js';

const factory = globalThis.HoleCoreFactory;
const text = value => new Blob([value], { type: 'text/plain' });
const copy = value => JSON.parse(JSON.stringify(value));
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
function core(options = {}) { return factory.create({ indexedDB: new IDBFactory(), localStorage: null, broadcast: false, ...options }); }
async function fixture(instance) {
  const project = await instance.put('projects', { id: 'project', name: 'Writing', assetIds: [] });
  const original = await instance.importAsset({ name: 'Note.txt', blob: text('Original'), projectId: project.id });
  return { project, ...original };
}
const initialWorkspace = () => ({ modelContent: { concept: 'Hole fluid workspace', layout: 'desktop', space: 'overview' }, privateContent: { layout: 'desktop', note: 'A computer that moves with you.\n\nAn idea becomes a note.\nA note becomes a project.\nYour whole world stays close.', playing: false, recentApps: [], views: {}, projects: [], pins: [], appPins: [], clusters: [], clusterOpen: null, session: [], desk: { view: 'overview', panX: 0, panY: 0, files: {}, placements: {} } } });

test('assets retain identity, immutable bytes, and atomic project membership across reopen', async () => {
  const db = new IDBFactory(), first = core({ indexedDB: db });
  const { asset, version } = await fixture(first);
  assert.equal((await first.get('projects', 'project')).revision, 2);
  assert.deepEqual((await first.get('projects', 'project')).assetIds, [asset.id]);
  const changed = await first.commitAsset({ assetId: asset.id, baseVersionId: version.id, blob: text('Changed'), operation: 'text-edit' });
  assert.equal(changed.asset.id, asset.id);
  assert.equal(changed.asset.revision, 2);
  assert.deepEqual(changed.version.parentVersionIds, [version.id]);
  assert.equal(await (await first.readAsset(asset.id, version.id)).blob.text(), 'Original');
  first.close();
  const reopened = core({ indexedDB: db });
  assert.equal(await (await reopened.readAsset(asset.id)).blob.text(), 'Changed');
  assert.equal((await reopened.list('versions')).length, 2);
  reopened.close();
});

test('competing revisions cannot overwrite each other or stale asset heads', async () => {
  const db = new IDBFactory(), a = core({ indexedDB: db }); await a.ready;
  const b = core({ indexedDB: db }); await b.ready;
  const project = await a.put('projects', { id: 'p', name: 'First', assetIds: [] });
  const outcomes = await Promise.allSettled([a.put('projects', { ...project, name: 'One' }, { expectedRevision: 1 }), b.put('projects', { ...project, name: 'Two' }, { expectedRevision: 1 })]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(o => o.status === 'rejected').reason.code, 'CONFLICT');
  await assert.rejects(a.put('projects', { id: 'p', name: 'Unchecked' }), { code: 'CONFLICT' });
  const original = await a.importAsset({ name: 'Note', blob: text('base') });
  const input = { assetId: original.asset.id, baseVersionId: original.version.id, blob: text('update') };
  const commits = await Promise.allSettled([a.commitAsset(input), b.commitAsset(input)]);
  assert.equal(commits.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal(commits.find(o => o.status === 'rejected').reason.code, 'CONFLICT');
  assert.equal((await a.list('versions')).length, 2);
  a.close(); b.close();
});

test('draft survives reload and failed checkpoint; only the acknowledged revision is consumed', async () => {
  const db = new IDBFactory(), first = core({ indexedDB: db });
  const { asset, version } = await fixture(first);
  const draft = await first.saveDraft({ id: 'editor-draft', assetId: asset.id, baseVersionId: version.id, text: 'Unfinished', selection: { start: 3, end: 4 }, scroll: 81 });
  first.close();
  const reopened = core({ indexedDB: db });
  assert.equal((await reopened.get('drafts', draft.id)).text, 'Unfinished');
  await reopened.commitAsset({ assetId: asset.id, baseVersionId: version.id, blob: text('Another view') });
  await assert.rejects(reopened.commitDraft(draft.id), { code: 'CONFLICT' });
  assert.equal((await reopened.get('drafts', draft.id)).text, 'Unfinished');
  const latest = await reopened.readAsset(asset.id);
  const saved = await reopened.saveDraft({ ...draft, baseVersionId: latest.version.id, text: 'Merged' });
  await assert.rejects(reopened.saveDraft({ ...draft, text: 'Old tab' }), { code: 'CONFLICT' });
  await reopened.commitDraft(saved.id);
  assert.equal(await (await reopened.readAsset(asset.id)).blob.text(), 'Merged');
  assert.equal(await reopened.get('drafts', saved.id), null);
  reopened.close();
});

test('trash retains bytes and versions; branch has an independent head with source lineage', async () => {
  const instance = core(), original = await instance.importAsset({ name: 'Original', blob: text('Kept') });
  const branch = await instance.branchAsset(original.asset.id, original.version.id, { name: 'Alternative' });
  assert.notEqual(branch.asset.id, original.asset.id);
  assert.deepEqual(branch.version.parentVersionIds, [original.version.id]);
  await instance.trashAsset(original.asset.id);
  assert.equal((await instance.readAsset(original.asset.id)).asset.state, 'trashed');
  assert.equal(await (await instance.readAsset(original.asset.id)).blob.text(), 'Kept');
  await assert.rejects(instance.commitAsset({ assetId: original.asset.id, baseVersionId: original.version.id, blob: text('No') }), { code: 'TRASHED' });
  await instance.restoreAsset(original.asset.id);
  assert.equal((await instance.get('assets', original.asset.id)).state, 'active');
  instance.close();
});

test('job output publication and completion commit once, and cancellation publishes nothing', async () => {
  const instance = core();
  await instance.put('jobs', { id: 'job', status: 'running', progress: 20 });
  const input = { jobId: 'job', idempotencyKey: 'run', outputs: [{ name: 'Actual output', blob: text('Output') }] };
  const result = await instance.commitJobOutputs(input), repeated = await instance.commitJobOutputs(input);
  assert.equal(result.job.status, 'completed');
  assert.equal(repeated.replayed, true);
  assert.equal(repeated.assets[0].id, result.assets[0].id);
  assert.equal((await instance.list('assets')).length, 1);
  assert.equal(await (await instance.readAsset(result.assets[0].id)).blob.text(), 'Output');
  await instance.put('jobs', { id: 'cancelled', status: 'cancelled' });
  await assert.rejects(instance.commitJobOutputs({ ...input, jobId: 'cancelled', idempotencyKey: 'cancelled' }), { code: 'CANCELLED' });
  assert.equal((await instance.list('assets')).length, 1);
  instance.close();
});

test('multi-output conflicts abort every output and keep the job unfinished', async () => {
  const instance = core(), first = await instance.importAsset({ name: 'Original', blob: text('Original') });
  await instance.put('jobs', { id: 'job', status: 'running' });
  await assert.rejects(instance.commitJobOutputs({ jobId: 'job', idempotencyKey: 'failure', outputs: [
    { name: 'Must roll back', blob: text('Transient') },
    { assetId: first.asset.id, baseVersionId: 'stale', blob: text('Stale') }
  ] }), { code: 'CONFLICT' });
  assert.equal((await instance.list('assets')).length, 1);
  assert.equal((await instance.list('versions')).length, 1);
  assert.equal((await instance.get('jobs', 'job')).status, 'running');
  const result = await instance.commitJobOutputs({ jobId: 'job', idempotencyKey: 'failure', outputs: [{ assetId: first.asset.id, baseVersionId: first.version.id, blob: text('Committed') }] });
  assert.equal(result.assets[0].id, first.asset.id);
  assert.equal(await (await instance.readAsset(first.asset.id)).blob.text(), 'Committed');
  instance.close();
});

test('full backup restores private bytes, drafts, lineage and metadata into an isolated empty database', async () => {
  const original = core(), f = await fixture(original);
  await original.saveDraft({ id: 'draft', assetId: f.asset.id, baseVersionId: f.version.id, text: 'Work in progress', selection: { start: 1, end: 2 } });
  await original.put('placements', { id: 'placement', resourceType: 'asset', resourceId: f.asset.id, policy: 'pinned', versionId: f.version.id, x: 120, y: 40 });
  const branch = await original.branchAsset(f.asset.id, f.version.id);
  await original.trashAsset(branch.asset.id);
  const backup = await original.exportBackup();
  const clean = core();
  const report = await clean.validateBackup(backup);
  assert.equal(report.valid, true); assert.equal(report.assets, 2); assert.equal(report.drafts, 1);
  await clean.restoreBackup(backup);
  assert.equal(await (await clean.readAsset(f.asset.id)).blob.text(), 'Original');
  assert.equal((await clean.get('drafts', 'draft')).text, 'Work in progress');
  assert.equal((await clean.get('placements', 'placement')).versionId, f.version.id);
  assert.equal((await clean.get('assets', branch.asset.id)).state, 'trashed');
  assert.deepEqual(await clean.list('projects'), await original.list('projects'));
  assert.equal((await clean.restoreBackup(backup)).restored, true, 'repeating same backup is idempotent');
  clean.close(); original.close();
});

test('corrupt or conflicting backup cannot replace live work and unrelated new work is retained', async () => {
  const source = core(), original = await source.importAsset({ name: 'Source', blob: text('original') });
  const backup = await source.exportBackup(), archive = JSON.parse(await backup.text());
  archive.blobs[0].data = 'Y29ycnVwdA==';
  const target = core(); await target.importAsset({ name: 'Unrelated', blob: text('keep') });
  await assert.rejects(target.restoreBackup(new Blob([JSON.stringify(archive)])), { code: 'BACKUP_INVALID' });
  assert.equal((await target.list('assets')).length, 1);
  await target.restoreBackup(backup);
  assert.equal((await target.list('assets')).length, 2);
  await target.commitAsset({ assetId: original.asset.id, baseVersionId: original.version.id, blob: text('New acknowledged work') });
  await assert.rejects(target.restoreBackup(backup), { code: 'RESTORE_CONFLICT' });
  assert.equal(await (await target.readAsset(original.asset.id)).blob.text(), 'New acknowledged work');
  assert.equal((await target.list('assets')).length, 2);
  source.close(); target.close();
});

test('initialized empty profile restores after explicit bootstrap review while retaining device settings and both snapshots', async () => {
  const source = core(), saved = await fixture(source), sourceWorkspace = initialWorkspace(); sourceWorkspace.privateContent.note = 'My actual private note';
  await source.put('settings', { id: 'legacy-workspace', value: sourceWorkspace });
  await source.put('settings', { id: 'navigation', value: { view: 'projects', assetId: saved.asset.id } });
  await source.put('settings', { id: 'relay:device', value: 'source-device' });
  await source.put('settings', { id: 'relay:endpoint', value: 'https://source.example' });
  const backup = await source.exportBackup(), target = core();
  const workspace = await target.put('settings', { id: 'legacy-workspace', value: initialWorkspace() });
  const navigation = await target.put('settings', { id: 'navigation', value: { view: 'settings', assetId: null } });
  await target.put('settings', { id: 'relay:device', value: 'this-device' });
  await target.put('settings', { id: 'relay:endpoint', value: 'https://this.example' });
  const report = await target.validateBackup(backup);
  assert.equal(report.restorePlan.bootstrapEligible, true); assert.equal(report.restorePlan.requiresBootstrapApproval, true);
  assert.deepEqual(report.restorePlan.conflicts, []);
  await assert.rejects(target.restoreBackup(backup), { code: 'RESTORE_REVIEW_REQUIRED' });
  assert.equal((await target.list('assets')).length, 0); assert.deepEqual(await target.get('settings', 'legacy-workspace'), workspace);
  const restored = await target.restoreBackup(backup, { replaceBootstrapSettings: true });
  assert.equal(restored.restored, true); assert.equal(await (await target.readAsset(saved.asset.id)).blob.text(), 'Original');
  assert.deepEqual((await target.get('settings', 'legacy-workspace')).value, sourceWorkspace);
  assert.ok((await target.get('settings', 'legacy-workspace')).revision > workspace.revision);
  assert.deepEqual(await target.get('settings', 'navigation'), navigation);
  assert.equal((await target.get('settings', 'relay:device')).value, 'this-device');
  assert.equal((await target.get('settings', 'relay:endpoint')).value, 'https://this.example');
  const check = JSON.parse(await (await target.exportBackup()).text()), journal = check.snapshot.journal.find(item => item.id.startsWith('restore:'));
  assert.deepEqual(journal.replacedBootstrapRecords[0].value, { type: 'settings', id: workspace.id, record: workspace });
  assert.ok(journal.preservedArchiveRecords.some(item => item.value.id === 'migration:legacy-v1'));
  assert.ok(journal.preservedArchiveRecords.some(item => item.value.id === 'navigation'));
  assert.equal((await target.restoreBackup(backup)).restored, true, 'same content is repeatable despite the local workspace revision bump');
  source.close(); target.close();
});

test('bootstrap approval never replaces private notes, custom spaces, drafts, or other real work', async () => {
  const source = core(); await fixture(source); const saved = initialWorkspace(); saved.privateContent.note = 'Archive'; await source.put('settings', { id: 'legacy-workspace', value: saved }); const backup = await source.exportBackup();
  const variations = [
    async target => { const value = initialWorkspace(); value.privateContent.note = 'Unsaved-looking but durable personal text'; await target.put('settings', { id: 'legacy-workspace', value }); },
    async target => { const value = initialWorkspace(); value.privateContent.projects = [{ id: 'space-personal', name: 'My space' }]; await target.put('settings', { id: 'legacy-workspace', value }); },
    async target => { const value = initialWorkspace(); value.privateContent.unknownPrivateData = 'future app work'; await target.put('settings', { id: 'legacy-workspace', value }); },
    async target => { await target.put('settings', { id: 'legacy-workspace', value: initialWorkspace() }); await target.put('settings', { id: 'paper-new-document', value: { text: 'Draft' } }); },
    async target => { await target.put('settings', { id: 'legacy-workspace', value: initialWorkspace() }); await target.put('tasks', { id: 'local-task', name: 'Personal task' }); }
  ];
  for (const setup of variations) {
    const target = core(); await setup(target); const before = await target.get('settings', 'legacy-workspace');
    assert.equal((await target.validateBackup(backup)).restorePlan.bootstrapEligible, false);
    await assert.rejects(target.restoreBackup(backup, { replaceBootstrapSettings: true }), { code: 'RESTORE_CONFLICT' });
    assert.deepEqual(await target.get('settings', 'legacy-workspace'), before); assert.equal((await target.list('assets')).length, 0); target.close();
  }
  source.close();
});

test('bootstrap eligibility is rechecked at commit if local work changes after review', async () => {
  const source = core(), value = initialWorkspace(); value.privateContent.note = 'Archive note'; await source.put('settings', { id: 'legacy-workspace', value }); await fixture(source);
  const backup = await source.exportBackup(), target = core(); await target.put('settings', { id: 'legacy-workspace', value: initialWorkspace() });
  assert.equal((await target.validateBackup(backup)).restorePlan.requiresBootstrapApproval, true);
  await target.put('tasks', { id: 'new-local-task', name: 'Created after review' });
  await assert.rejects(target.restoreBackup(backup, { replaceBootstrapSettings: true }), { code: 'RESTORE_CONFLICT' });
  assert.equal((await target.get('tasks', 'new-local-task')).name, 'Created after review'); assert.equal((await target.list('assets')).length, 0);
  source.close(); target.close();
});

test('a fresh restored profile does not inherit the source Relay device identity', async () => {
  const source = core(); await source.put('settings', { id: 'relay:device', value: 'source-device' }); const backup = await source.exportBackup(), target = core();
  const report = await target.restoreBackup(backup);
  assert.equal(await target.get('settings', 'relay:device'), null);
  assert.deepEqual(report.restorePlan.omittedSettings, ['relay:device']);
  const snapshot = JSON.parse(await (await target.exportBackup()).text());
  assert.equal(snapshot.snapshot.journal.find(item => item.id.startsWith('restore:')).preservedArchiveRecords.find(item => item.value.id === 'relay:device').value.record.value, 'source-device');
  source.close(); target.close();
});

test('legacy v1 import is additive, preserves IDs and raw snapshots, and does not invent broken parents', async () => {
  const db = new IDBFactory(), opening = db.open(factory.DB_NAME, 1);
  opening.onupgradeneeded = () => { const db = opening.result; db.createObjectStore('files', { keyPath: 'id' }); db.createObjectStore('contents'); db.createObjectStore('jobs', { keyPath: 'id' }); };
  const legacy = await request(opening);
  const file = { id: 'legacy-file', name: 'Old note', type: 'text/plain', parentId: 'missing-parent', rootId: 'missing-root', createdAt: 10, modifiedAt: 12, unknownField: 'preserved' };
  await new Promise((resolve, reject) => { const tx = legacy.transaction(['files', 'contents'], 'readwrite'); tx.objectStore('files').put(file); tx.objectStore('contents').put(text('Legacy bytes'), file.id); tx.oncomplete = resolve; tx.onabort = reject; });
  legacy.close();
  const raw = JSON.stringify({ privateContent: { notes: 'Scratchpad', unknown: true } });
  const instance = core({ indexedDB: db, localStorage: { getItem: () => raw } }); await instance.ready;
  const restored = await instance.readAsset(file.id);
  assert.equal(restored.asset.id, file.id);
  assert.equal(await restored.blob.text(), 'Legacy bytes');
  assert.deepEqual(restored.version.parentVersionIds, []);
  assert.equal(restored.asset.provenance.legacy.parentId, 'missing-parent');
  const backup = JSON.parse(await (await instance.exportBackup()).text());
  assert.deepEqual(backup.snapshot.files[0], file);
  const migration = backup.snapshot.journal.find(j => j.id === 'migration:legacy-v1');
  assert.equal(migration.rawWorkspace, raw); assert.deepEqual(migration.rawFiles, [file]);
  instance.close();
  const reopened = core({ indexedDB: db });
  assert.equal((await reopened.list('assets')).length, 1); assert.equal((await reopened.list('versions')).length, 1);
  reopened.close();
});

test('no production fallback acknowledges unavailable storage', async () => {
  const instance = core({ indexedDB: { open() { throw new DOMException('Blocked by browser', 'SecurityError'); } } });
  await assert.rejects(instance.ready, { code: 'STORAGE' });
  await assert.rejects(instance.put('settings', { id: 'x', value: 1 }), { code: 'STORAGE' });
});

test('quota failure during result transaction leaves neither output nor successful job', async () => {
  const instance = core(); await instance.put('jobs', { id: 'quota-job', status: 'running' });
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) { if (this.name === 'versionContents') throw new DOMException('Disk quota', 'QuotaExceededError'); return originalAdd.apply(this, args); };
  try { await assert.rejects(instance.commitJobOutputs({ jobId: 'quota-job', idempotencyKey: 'quota', outputs: [{ name: 'Never acknowledged', blob: text('bytes') }] }), { code: 'QUOTA' }); }
  finally { IDBObjectStore.prototype.add = originalAdd; }
  assert.equal((await instance.list('assets')).length, 0);
  assert.equal((await instance.get('jobs', 'quota-job')).status, 'running');
  const result = await instance.commitJobOutputs({ jobId: 'quota-job', idempotencyKey: 'quota', outputs: [{ name: 'Retry', blob: text('bytes') }] });
  assert.equal(result.job.status, 'completed'); instance.close();
});

test('restore stages validated archive and quota failure before cutover rolls every active store back', async () => {
  const source = core(), saved = await fixture(source), backup = await source.exportBackup();
  const target = core(), unrelated = await target.importAsset({ name: 'Unrelated', blob: text('Preserved') });
  const originalPut = IDBObjectStore.prototype.put;
  let reachedContentCutover = false;
  IDBObjectStore.prototype.put = function (...args) { if (this.name === 'versionContents') { reachedContentCutover = true; throw new DOMException('Disk quota', 'QuotaExceededError'); } return originalPut.apply(this, args); };
  try { await assert.rejects(target.restoreBackup(backup), { code: 'QUOTA' }); }
  finally { IDBObjectStore.prototype.put = originalPut; }
  assert.equal(reachedContentCutover, true);
  assert.equal(await target.get('assets', saved.asset.id), null);
  assert.equal(await target.get('projects', 'project'), null);
  assert.equal(await (await target.readAsset(unrelated.asset.id)).blob.text(), 'Preserved');
  await target.restoreBackup(backup);
  assert.equal(await (await target.readAsset(saved.asset.id)).blob.text(), 'Original'); source.close(); target.close();
});

test('interrupted staged legacy migration resumes without losing original stores or duplicating assets', async () => {
  const db = new IDBFactory(), opening = db.open(factory.DB_NAME, 1);
  opening.onupgradeneeded = () => { const db = opening.result; db.createObjectStore('files', { keyPath: 'id' }); db.createObjectStore('contents'); db.createObjectStore('jobs', { keyPath: 'id' }); };
  const legacy = await request(opening), file = { id: 'legacy', name: 'Legacy', type: 'text/plain' };
  await new Promise((resolve, reject) => { const tx = legacy.transaction(['files', 'contents'], 'readwrite'); tx.objectStore('files').put(file); tx.objectStore('contents').put(text('Never lose'), file.id); tx.oncomplete = resolve; tx.onabort = reject; }); legacy.close();
  const originalAdd = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) { if (this.name === 'versionContents') throw new DOMException('Interrupted', 'QuotaExceededError'); return originalAdd.apply(this, args); };
  const interrupted = core({ indexedDB: db });
  try { await assert.rejects(interrupted.ready, { code: 'QUOTA' }); }
  finally { IDBObjectStore.prototype.add = originalAdd; interrupted.close(); }
  const retry = core({ indexedDB: db }); await retry.ready;
  assert.equal((await retry.list('assets')).length, 1);
  assert.equal(await (await retry.readAsset(file.id)).blob.text(), 'Never lose');
  const archive = JSON.parse(await (await retry.exportBackup()).text());
  assert.deepEqual(archive.snapshot.files, [file]);
  assert.equal(archive.snapshot.journal.find(j => j.id === 'migration:legacy-v1').state, 'committed'); retry.close();
});

test('idempotency key cannot be reused with different bytes or a different job', async () => {
  const instance = core(); await instance.put('jobs', { id: 'j1', status: 'running' }); await instance.put('jobs', { id: 'j2', status: 'running' });
  const first = { jobId: 'j1', idempotencyKey: 'same', outputs: [{ name: 'One', blob: text('One') }] };
  await instance.commitJobOutputs(first);
  await assert.rejects(instance.commitJobOutputs({ ...first, outputs: [{ name: 'One', blob: text('Different') }] }), { code: 'CONFLICT' });
  await assert.rejects(instance.commitJobOutputs({ ...first, jobId: 'j2' }), { code: 'CONFLICT' });
  assert.equal((await instance.list('assets')).length, 1); assert.equal((await instance.get('jobs', 'j2')).status, 'running'); instance.close();
});

test('job destination revision is checked atomically after content preparation and before all outputs', async () => {
  const instance=core();const project=await instance.put('projects',{id:'guarded',name:'Reviewed destination',assetIds:[]});await instance.put('jobs',{id:'guard-job',status:'queued'});
  let entered,release;const waiting=new Promise(resolve=>entered=resolve);
  class DelayedBlob extends Blob {async arrayBuffer(){entered();await new Promise(resolve=>release=resolve);return super.arrayBuffer();}}
  const input={jobId:'guard-job',idempotencyKey:'guard-job',outputs:[{name:'Retained.txt',projectId:project.id,expectedProjectRevision:project.revision,blob:new DelayedBlob(['reviewed bytes'],{type:'text/plain'})}]};
  const running=instance.commitJobOutputs(input);await waiting;const changed=await instance.put('projects',{...project,name:'Changed during content hash'},{expectedRevision:project.revision});release();await assert.rejects(running,{code:'CONFLICT'});
  assert.equal((await instance.list('assets')).length,0);assert.equal((await instance.list('versions')).length,0);assert.deepEqual((await instance.get('projects',project.id)).assetIds,[]);assert.equal((await instance.get('jobs','guard-job')).status,'queued');
  const retry={...input,outputs:[{...input.outputs[0],expectedProjectRevision:changed.revision,blob:text('reviewed bytes')}]};const committed=await instance.commitJobOutputs(retry);assert.equal(committed.outputs.length,1);
  const latest=await instance.get('projects',project.id);await instance.put('projects',{...latest,name:'Changed after ACK'},{expectedRevision:latest.revision});const replay=await instance.commitJobOutputs(retry);assert.equal(replay.replayed,true);assert.equal(replay.outputs[0].asset.id,committed.outputs[0].asset.id);assert.equal((await instance.list('assets')).length,1);instance.close();
});
test('guarded job batches check initial destination once per precondition and reject invalid guards',async()=>{
  const instance=core();const project=await instance.put('projects',{id:'batch-project',name:'Batch',assetIds:[]});await instance.put('jobs',{id:'batch-job',status:'queued'});const input={jobId:'batch-job',idempotencyKey:'batch-job',outputs:['a','b'].map(name=>({name,projectId:project.id,expectedProjectRevision:project.revision,blob:text(name)}))};
  for(const bad of [{expectedProjectRevision:0},{expectedProjectRevision:1.5},{expectedProjectRevision:1,projectId:null}])await assert.rejects(instance.commitJobOutputs({...input,outputs:[{...input.outputs[0],...bad}]}),{code:'INVALID'});
  const result=await instance.commitJobOutputs(input);assert.equal(result.outputs.length,2);assert.equal((await instance.get('projects',project.id)).assetIds.length,2);instance.close();
});
test('destination guard cannot advance an asset belonging to a different project',async()=>{
  const instance=core(),first=await instance.put('projects',{id:'first-destination',name:'First',assetIds:[]}),other=await instance.put('projects',{id:'other-destination',name:'Other',assetIds:[]});const asset=await instance.importAsset({name:'Owned.txt',projectId:first.id,blob:text('original')});await instance.put('jobs',{id:'wrong-destination',status:'queued'});
  await assert.rejects(instance.commitJobOutputs({jobId:'wrong-destination',idempotencyKey:'wrong-destination',outputs:[{name:'Must roll back.txt',projectId:other.id,expectedProjectRevision:other.revision,blob:text('new')},{assetId:asset.asset.id,baseVersionId:asset.version.id,projectId:other.id,expectedProjectRevision:other.revision,blob:text('wrong target')}]}),{code:'CONFLICT'});
  assert.equal((await instance.list('assets')).length,1);assert.equal((await instance.list('versions')).length,1);assert.equal(await(await instance.readAsset(asset.asset.id)).blob.text(),'original');assert.deepEqual((await instance.get('projects',other.id)).assetIds,[]);instance.close();
});

test('edited assets retain their prior head and validated additional exact source parents', async () => {
  const c=core(), base=await c.importAsset({name:'Collection',blob:text('base')}), source=await c.importAsset({name:'Source',blob:text('source')});
  const next=await c.commitAsset({assetId:base.asset.id,baseVersionId:base.version.id,parentVersionIds:[source.version.id,base.version.id],blob:text('edited')});
  assert.deepEqual(next.version.parentVersionIds,[base.version.id,source.version.id]);
  await assert.rejects(c.commitAsset({assetId:base.asset.id,baseVersionId:next.version.id,parentVersionIds:['missing-version'],blob:text('bad')}),{code:'NOT_FOUND'});
  await assert.rejects(c.commitAsset({assetId:base.asset.id,baseVersionId:next.version.id,parentVersionIds:[source.version.id,source.version.id],blob:text('bad')}),{code:'INVALID'});
  await assert.rejects(c.commitAsset({assetId:base.asset.id,baseVersionId:next.version.id,parentVersionIds:Array.from({length:100},(_,i)=>'parent:'+i),blob:text('bad')}),{code:'INVALID'});
  assert.equal((await c.readAsset(base.asset.id)).version.id,next.version.id);assert.equal((await c.list('versions')).length,3);c.close();
});

test('job edits verify additional source parents before committing any batch output and replay exact lineage', async () => {
  const c=core(), base=await c.importAsset({name:'Collection',blob:text('base')}), source=await c.importAsset({name:'Source',blob:text('source')});
  await c.put('jobs',{id:'lineage-job',status:'queued'});
  const outputs=[{name:'New companion',blob:text('companion')},{assetId:base.asset.id,baseVersionId:base.version.id,parentVersionIds:['missing-version'],blob:text('edited')}];
  await assert.rejects(c.commitJobOutputs({jobId:'lineage-job',idempotencyKey:'lineage-receipt',outputs}),{code:'NOT_FOUND'});
  assert.equal((await c.list('assets')).length,2);assert.equal((await c.list('versions')).length,2);assert.equal((await c.get('jobs','lineage-job')).status,'queued');
  outputs[1].parentVersionIds=[source.version.id];
  const result=await c.commitJobOutputs({jobId:'lineage-job',idempotencyKey:'lineage-receipt',outputs});
  const saved=await c.readAsset(base.asset.id);assert.deepEqual(saved.version.parentVersionIds,[base.version.id,source.version.id]);
  const replay=await c.commitJobOutputs({jobId:'lineage-job',idempotencyKey:'lineage-receipt',outputs});assert.equal(replay.replayed,true);assert.deepEqual(replay.outputs,result.outputs);
  assert.equal((await c.list('versions')).length,4);c.close();
});
