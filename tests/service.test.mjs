import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createService } from '../server/service.mjs';
import '../src/relay.js';

async function setup(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'hole-service-'));
  let service = await createService({ directory, ...options }), address = await service.listen(0);
  t.after(async () => { await service.close(); await rm(directory, { recursive: true, force: true }); });
  async function request(route, { method = 'GET', token, body, headers = {}, raw = false } = {}) {
    const response = await fetch(address + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method !== 'GET' ? { 'X-Hole-Client': '1' } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, value: raw ? await response.text() : await response.json() };
  }
  async function account(label) {
    const result = await request('/accounts', { method: 'POST', body: { name: label, email: `${label}@example.test`, password: 'a durable private password' } }); assert.equal(result.status, 201); return { ...result.value, token: result.value.sessionToken };
  }
  const owner = await account('owner'), viewer = await account('viewer'), editor = await account('editor');
  const project = (await request('/projects', { method: 'POST', token: owner.token, body: { name: 'Release project' } })).value;
  async function sync(actor, changes, deviceId = 'device:one') { return request('/sync', { method: 'POST', token: actor.token, body: { projectId: project.id, deviceId, changes } }); }
  async function version(actor, asset, text, id = `edit:${text}`) { return sync(actor, [{ id, type: 'asset.commit', data: { assetId: asset.assetId, baseVersionId: asset.versionId, mime: 'text/plain', bytes: Buffer.from(text).toString('base64') } }]); }
  async function add(actor, text, id = `create:${text}`) { const result = await sync(actor, [{ id, type: 'asset.create', data: { name: `${text}.txt`, mime: 'text/plain', bytes: Buffer.from(text).toString('base64') } }]); assert.equal(result.value.results[0].status, 'committed'); return result.value.results[0].result; }
  async function invite(actor, role, resources, extra = {}) {
    const latest = (await request(`/projects/${project.id}`, { token: owner.token })).value;
    const invitation = await request(`/projects/${project.id}/invitations`, { method: 'POST', token: owner.token, body: { role, recipientId: actor.user.id, resources, expectedRevision: latest.revision, ...extra } });
    assert.equal(invitation.status, 201);
    return invitation.value;
  }
  async function accept(actor, invitation) { return request(`/invitations/${invitation.invitationToken}/accept`, { method: 'POST', token: actor.token }); }
  return { request, account, owner, viewer, editor, project, sync, version, add, invite, accept, directory, address, async restart() { await service.close(); service = await createService({ directory, ...options }); address = await service.listen(0); } };
}

test('real accounts use private hashed sessions, sign-out and single-use recovery', async t => {
  const f = await setup(t);
  assert.equal((await f.request('/session', { token: f.owner.token })).status, 200);
  const disk = await readFile(path.join(f.directory, 'state.json'), 'utf8');
  assert.ok(!disk.includes(f.owner.token) && !disk.includes(f.owner.recoveryCode) && !disk.includes('a durable private password'));
  const recovered = await f.request('/recovery', { method: 'POST', body: { email: f.owner.user.email, recoveryCode: f.owner.recoveryCode, password: 'a replaced private password' } });
  assert.equal(recovered.status, 200);
  assert.equal((await f.request('/session', { token: f.owner.token })).status, 401);
  assert.equal((await f.request('/recovery', { method: 'POST', body: { email: f.owner.user.email, recoveryCode: f.owner.recoveryCode, password: 'another durable password' } })).status, 401);
  const login = await f.request('/sessions', { method: 'POST', body: { email: f.owner.user.email, password: 'a replaced private password' } });
  assert.equal(login.status, 201); assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  await f.request('/session', { method: 'DELETE', token: login.value.sessionToken });
  assert.equal((await f.request('/session', { token: login.value.sessionToken })).status, 401);
});

test('private metadata and bytes require named grants; viewer sees pinned versions only', async t => {
  const f = await setup(t), approved = await f.add(f.owner, 'approved'), privateAsset = await f.add(f.owner, 'private');
  assert.equal((await f.request(`/sync?projectId=${f.project.id}`, { token: f.viewer.token })).status, 404);
  assert.equal((await f.request(`/assets/${approved.assetId}/versions/${approved.versionId}`)).status, 401);
  const invitation = await f.invite(f.viewer, 'viewer', [{ assetId: approved.assetId, versionIds: [approved.versionId] }]);
  assert.equal((await f.accept(f.editor, invitation)).status, 403);
  assert.equal((await f.accept(f.viewer, invitation)).status, 200);
  const changed = (await f.version(f.owner, approved, 'private-future')).value.results[0].result;
  const snapshot = (await f.request(`/sync?projectId=${f.project.id}`, { token: f.viewer.token })).value;
  assert.equal(snapshot.assets.length, 1); assert.equal(snapshot.assets[0].headVersionId, approved.versionId);
  assert.ok(!JSON.stringify(snapshot).includes(changed.versionId) && !JSON.stringify(snapshot).includes(privateAsset.assetId));
  assert.equal((await f.request(`/assets/${approved.assetId}/versions/${changed.versionId}`, { token: f.viewer.token })).status, 404);
  assert.equal((await f.request(`/assets/${approved.assetId}/versions/${approved.versionId}`, { token: f.viewer.token, raw: true })).value, 'approved');
  assert.equal((await f.version(f.viewer, approved, 'unauthorized')).status, 403);
});

test('editor changes use optimistic bases, preserve conflicts and deduplicate committed queue entries', async t => {
  const f = await setup(t), input = await f.add(f.owner, 'base');
  await f.accept(f.editor, await f.invite(f.editor, 'editor', [{ assetId: input.assetId, versionIds: [input.versionId] }]));
  const [a, b] = await Promise.all([f.version(f.editor, input, 'first'), f.version(f.owner, input, 'second')]);
  const outcomes = [a.value.results[0], b.value.results[0]];
  assert.equal(outcomes.filter(result => result.status === 'committed').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'conflict').length, 1);
  const edit = [{ id: 'note:queue', type: 'record.put', data: { id: 'note:shared', type: 'note', value: { text: 'Our notes' }, visibility: 'shared' } }];
  const first = await f.sync(f.editor, edit), retry = await f.sync(f.editor, edit);
  assert.equal(first.value.results[0].status, 'committed'); assert.equal(retry.value.results[0].replayed, true);
  edit[0].data.value.text = 'Different payload';
  assert.equal((await f.sync(f.editor, edit)).value.results[0].error.code, 'IDEMPOTENCY_CONFLICT');
  const stale = await f.sync(f.editor, [{ id: 'note:stale', type: 'record.put', data: { id: 'note:shared', type: 'note', value: { text: 'Offline text remains local' }, expectedRevision: 0 } }]);
  assert.equal(stale.value.results[0].status, 'conflict');
  const saved = (await f.request(`/sync?projectId=${f.project.id}`, { token: f.editor.token })).value.records[0];
  assert.equal(saved.value.text, 'Our notes');
});

test('approved streams require explicit approval and private notes are omitted', async t => {
  const f = await setup(t), original = await f.add(f.owner, 'base');
  await f.accept(f.viewer, await f.invite(f.viewer, 'viewer', [{ assetId: original.assetId, versionIds: [original.versionId], followApproved: true }]));
  const next = (await f.version(f.owner, original, 'next')).value.results[0].result;
  await f.sync(f.owner, [{ id: 'secret:note', type: 'record.put', data: { id: 'note:secret', type: 'note', value: { text: 'Private meeting details' } } }]);
  const before = (await f.request(`/sync?projectId=${f.project.id}`, { token: f.viewer.token })).value;
  assert.equal(before.records.length, 0); assert.equal(before.assets[0].versionIds.length, 1);
  const current = (await f.request(`/projects/${f.project.id}`, { token: f.owner.token })).value;
  await f.request(`/projects/${f.project.id}/approvals`, { method: 'POST', token: f.owner.token, body: { expectedRevision: current.revision, resources: [{ assetId: original.assetId, versionIds: [next.versionId] }] } });
  assert.equal((await f.request(`/sync?projectId=${f.project.id}`, { token: f.viewer.token })).value.assets[0].headVersionId, next.versionId);
});

test('guest and public manifests pin selected bytes and never expose private future versions', async t => {
  const f = await setup(t), input = await f.add(f.owner, 'public-approved'), secret = await f.add(f.owner, 'private-secret');
  async function publish(kind) { const latest = (await f.request(`/projects/${f.project.id}`, { token: f.owner.token })).value; return f.request(`/projects/${f.project.id}/${kind}`, { method: 'POST', token: f.owner.token, body: { name: 'Selected work', expectedRevision: latest.revision, resources: [{ assetId: input.assetId, versionIds: [input.versionId] }] } }); }
  const world = (await publish('worlds')).value, guest = (await publish('guests')).value;
  const next = (await f.version(f.owner, input, 'private-unapproved')).value.results[0].result;
  for (const route of [`/worlds/${world.id}`, `/guest/${guest.guestToken}`]) {
    const manifest = await f.request(route);
    assert.equal(manifest.status, 200); assert.equal(manifest.value.resources.length, 1);
    assert.ok(!JSON.stringify(manifest.value).includes(secret.assetId) && !JSON.stringify(manifest.value).includes(next.versionId) && !JSON.stringify(manifest.value).includes(f.project.id));
    assert.equal((await f.request(`${route}/assets/${input.assetId}/versions/${input.versionId}`, { raw: true })).value, 'public-approved');
    assert.equal((await f.request(`${route}/assets/${input.assetId}/versions/${next.versionId}`)).status, 404);
  }
  await f.request(`/projects/${f.project.id}/worlds/${world.id}`, { method: 'DELETE', token: f.owner.token });
  await f.request(`/projects/${f.project.id}/guests/${guest.id}`, { method: 'DELETE', token: f.owner.token });
  assert.equal((await f.request(`/worlds/${world.id}`)).status, 404);
  assert.equal((await f.request(`/guest/${guest.guestToken}`)).status, 404);
  assert.equal((await f.request('/worlds')).value.worlds.length, 0);
});

test('revocation removes metadata, bytes and real heartbeat presence; role races do not overwrite', async t => {
  const f = await setup(t), input = await f.add(f.owner, 'shared');
  await f.accept(f.editor, await f.invite(f.editor, 'editor', [{ assetId: input.assetId, versionIds: [input.versionId] }]));
  await f.request(`/projects/${f.project.id}/presence`, { method: 'POST', token: f.editor.token, body: { deviceId: 'editor:phone', cursor: { x: 12, y: 30 } } });
  assert.equal((await f.request(`/projects/${f.project.id}/presence`, { token: f.owner.token })).value.people.length, 1);
  const latest = (await f.request(`/projects/${f.project.id}`, { token: f.owner.token })).value;
  const route = `/projects/${f.project.id}/members/${f.editor.user.id}`;
  const results = await Promise.all([
    f.request(route, { method: 'PATCH', token: f.owner.token, body: { revoke: true, expectedRevision: latest.revision } }),
    f.request(route, { method: 'PATCH', token: f.owner.token, body: { role: 'viewer', expectedRevision: latest.revision } })
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  // If the downgrade won, explicitly revoke the current revision.
  const project = (await f.request(`/projects/${f.project.id}`, { token: f.owner.token })).value;
  if (project.members.some(member => member.userId === f.editor.user.id)) await f.request(route, { method: 'PATCH', token: f.owner.token, body: { revoke: true, expectedRevision: project.revision } });
  assert.equal((await f.request(`/sync?projectId=${f.project.id}`, { token: f.editor.token })).status, 404);
  assert.equal((await f.request(`/assets/${input.assetId}/versions/${input.versionId}`, { token: f.editor.token })).status, 404);
  assert.equal((await f.request(`/projects/${f.project.id}/presence`, { token: f.owner.token })).value.people.length, 0);
});

test('expired invitations, guests and sessions stop granting access and presence expires naturally', async t => {
  let clock = 1_000_000;
  const f = await setup(t, { now: () => clock, sessionTTL: 60000 }), input = await f.add(f.owner, 'a');
  const invitation = await f.invite(f.viewer, 'viewer', [{ assetId: input.assetId, versionIds: [input.versionId] }], { ttlMs: 1000 });
  const latest = (await f.request(`/projects/${f.project.id}`, { token: f.owner.token })).value;
  const guest = await f.request(`/projects/${f.project.id}/guests`, { method: 'POST', token: f.owner.token, body: { name: 'Expiring access', expectedRevision: latest.revision, resources: [{ assetId: input.assetId, versionIds: [input.versionId] }], ttlMs: 1000 } });
  assert.equal(guest.status, 201);
  assert.equal((await f.request(`/guest/${guest.value.guestToken}/assets/${input.assetId}/versions/${input.versionId}`, { raw: true })).status, 200);
  clock += 1001;
  assert.equal((await f.accept(f.viewer, invitation)).status, 404);
  assert.equal((await f.request(`/guest/${guest.value.guestToken}`)).status, 404);
  assert.equal((await f.request(`/guest/${guest.value.guestToken}/assets/${input.assetId}/versions/${input.versionId}`)).status, 404);
  await f.request(`/projects/${f.project.id}/presence`, { method: 'POST', token: f.owner.token, body: { deviceId: 'owner:desktop' } });
  clock += 45001;
  assert.equal((await f.request(`/projects/${f.project.id}/presence`, { token: f.owner.token })).value.people.length, 0);
  clock += 15000;
  assert.equal((await f.request('/session', { token: f.owner.token })).status, 401);
});

test('authorized version bytes survive an actual service restart', async t => {
  const f = await setup(t), input = await f.add(f.owner, 'durable');
  await f.restart();
  const restored = await f.request(`/assets/${input.assetId}/versions/${input.versionId}`, { token: f.owner.token, raw: true });
  assert.equal(restored.status, 200); assert.equal(restored.value, 'durable');
  assert.equal((await f.request(`/sync?projectId=${f.project.id}`, { token: f.owner.token })).value.assets[0].headVersionId, input.versionId);
});

test('cross-origin writes, missing CSRF header, credential sync and ownership escalation are refused', async t => {
  const f = await setup(t);
  assert.equal((await f.request('/projects', { method: 'POST', token: f.owner.token, body: { name: 'Bad origin' }, headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await f.request('/projects', { method: 'POST', token: f.owner.token, body: { name: 'Bad header' }, headers: { 'X-Hole-Client': '0' } })).status, 403);
  const secret = await f.sync(f.owner, [{ id: 'secret:bad', type: 'record.put', data: { id: 'preference:secret', type: 'preference', value: { sessionToken: 'do-not-export' } } }]);
  assert.equal(secret.value.results[0].error.code, 'SECRET_DATA');
  assert.equal((await f.request(`/projects/${f.project.id}/invitations`, { method: 'POST', token: f.owner.token, body: { role: 'owner', resources: [], expectedRevision: f.project.revision } })).status, 400);
  const malformed = await f.sync(f.owner, [null, { id: 'good:after-invalid', type: 'record.put', data: { id: 'note:valid', type: 'note', value: { text: 'Valid adjacent work survives.' } } }]);
  assert.equal(malformed.status, 200);
  assert.equal(malformed.value.results[0].status, 'failed');
  assert.equal(malformed.value.results[1].status, 'committed');
});

test('two Relay clients reconcile a durable offline queue and retain conflicting edits', async t => {
  const f = await setup(t), disk = new Map(); let offline = false;
  const options = { endpoint: f.address, deviceId: 'device:offline', loadQueue: async id => structuredClone(disk.get(id)), saveQueue: async (id, data) => { disk.set(id, structuredClone(data)); }, fetch: (...args) => { if (offline) throw new TypeError('Network unavailable'); return fetch(...args); } };
  const first = globalThis.HoleRelayModel.createClient(options);
  const second = globalThis.HoleRelayModel.createClient({ ...options, deviceId: 'device:other' });
  await first.signIn({ email: f.owner.user.email, password: 'a durable private password' });
  await second.signIn({ email: f.owner.user.email, password: 'a durable private password' });
  const initial = { id: 'note:initial', type: 'record.put', data: { id: 'note:offline', type: 'note', value: { text: 'Original' } } };
  offline = true; await first.queue(f.project.id, initial);
  await assert.rejects(first.flush(f.project.id), /Network unavailable/);
  assert.equal((await first.pending(f.project.id))[0].status, 'pending');
  // A recreated client consumes the same saved queue after reconnection.
  offline = false;
  const reopened = globalThis.HoleRelayModel.createClient(options); await reopened.signIn({ email: f.owner.user.email, password: 'a durable private password' });
  assert.equal((await reopened.flush(f.project.id)).results[0].status, 'committed');
  assert.equal((await second.pull(f.project.id)).records[0].value.text, 'Original');
  await second.queue(f.project.id, { id: 'note:remote-edit', type: 'record.put', data: { id: 'note:offline', type: 'note', value: { text: 'Remote work' }, expectedRevision: 1 } });
  await second.flush(f.project.id);
  await reopened.queue(f.project.id, { id: 'note:local-edit', type: 'record.put', data: { id: 'note:offline', type: 'note', value: { text: 'Local work must survive' }, expectedRevision: 1 } });
  assert.equal((await reopened.flush(f.project.id)).results[0].status, 'conflict');
  const pending = (await reopened.pending(f.project.id)).find(item => item.change.id === 'note:local-edit');
  assert.equal(pending.change.data.value.text, 'Local work must survive');
  assert.equal((await reopened.pull(f.project.id)).records[0].value.text, 'Remote work');
});

test('selected adapters exclude local settings and require permitted memory; private records restore to same account only', async t => {
  const f = await setup(t), model = globalThis.HoleRelayModel;
  assert.throws(() => model.selectedRecord('preference', { id: 'relay:endpoint', value: 'private' }, { remoteId: 'p:1' }), { code: 'LOCAL_ONLY' });
  assert.throws(() => model.selectedRecord('memory', { text: 'private' }, { remoteId: 'm:1' }), { code: 'MEMORY_PERMISSION' });
  const changes = [
    model.selectedRecord('preference', { id: 'theme', value: 'dark' }, { remoteId: 'p:1' }),
    model.selectedRecord('workspace', { name: 'Studio', windows: [{ secret: true }] }, { remoteId: 'w:1' }),
    model.selectedRecord('memory', { text: 'Remember selected context', syncAllowed: true, consent: 'explicit', provenance: { source: 'explicit selection' } }, { remoteId: 'm:1', permitMemory: true })
  ].map((data, i) => ({ id: `adapter:${i}`, type: 'record.put', data }));
  assert.deepEqual((await f.sync(f.owner, changes)).value.results.map(item => item.status), ['committed', 'committed', 'committed']);
  await f.accept(f.editor, await f.invite(f.editor, 'editor', []));
  assert.equal((await f.request(`/sync?projectId=${f.project.id}`, { token: f.editor.token })).value.records.length, 0);
  const snapshot = (await f.request(`/sync?projectId=${f.project.id}`, { token: f.owner.token })).value;
  assert.equal(snapshot.records.length, 3); assert.ok(!JSON.stringify(snapshot).includes('windows'));
  const shared = await f.sync(f.owner, [{ id: 'memory:shared', type: 'record.put', data: { ...changes[2].data, visibility: 'shared', expectedRevision: 1 } }]);
  assert.equal(shared.value.results[0].status, 'failed');
});

test('reviewed text, layout, permission, metadata and deletion conflicts retain originals and recheck revisions', async t => {
  const f = await setup(t), disk = new Map(), client = globalThis.HoleRelayModel.createClient({ endpoint: f.address, deviceId: 'review:one', loadQueue: async id => structuredClone(disk.get(id)), saveQueue: async (id, data) => disk.set(id, structuredClone(data)) });
  await client.signIn({ email: f.owner.user.email, password: 'a durable private password' });
  for (const type of ['note', 'scene']) {
    const data = { id: `review:${type}`, type, value: { text: 'Original', x: 1 }, visibility: 'private' };
    await f.sync(f.owner, [{ id: `initial:${type}`, type: 'record.put', data }]);
    await f.sync(f.owner, [{ id: `remote:${type}`, type: 'record.put', data: { ...data, value: { text: 'Remote', x: 2 }, expectedRevision: 1 } }]);
    const id = `local:${type}`;
    await client.queue(f.project.id, { id, type: 'record.put', data: { ...data, visibility: 'shared', value: { text: 'Local', x: 3 }, expectedRevision: 1 } });
    assert.equal((await client.flush(f.project.id)).results[0].status, 'conflict');
    const review = await client.review(f.project.id, id); assert.equal(review.current.value.text, 'Remote');
    await client.resolve(f.project.id, id, { decision: 'replace', replacement: { id: `resolved:${type}`, type: 'record.put', data: { ...data, value: { text: 'Merged', x: 4 }, expectedRevision: review.current.revision } } });
    assert.equal((await client.flush(f.project.id)).results[0].status, 'committed');
    assert.equal((await client.pending(f.project.id)).find(item => item.change.id === id).change.data.value.text, 'Local');
    await client.queue(f.project.id, { id: `delete:${type}`, type: 'record.delete', data: { id: data.id, expectedRevision: 1 } });
    assert.equal((await client.flush(f.project.id)).results[0].status, 'conflict');
    await client.resolve(f.project.id, `delete:${type}`, { decision: 'keep-remote' });
  }
  const asset = await f.add(f.owner, 'metadata');
  await f.sync(f.owner, [{ id: 'rename:one', type: 'asset.metadata', data: { assetId: asset.assetId, name: 'new.txt', expectedRevision: 1 } }]);
  assert.equal((await f.sync(f.owner, [{ id: 'rename:two', type: 'asset.metadata', data: { assetId: asset.assetId, name: 'stale.txt', expectedRevision: 1 } }])).value.results[0].status, 'conflict');
  assert.equal((await f.sync(f.owner, [{ id: 'trash:stale', type: 'asset.trash', data: { assetId: asset.assetId, expectedRevision: 1 } }])).value.results[0].status, 'conflict');
});

test('owners manage publications without recovering guest secrets; transfer and leave enforce current roles', async t => {
  const f = await setup(t), asset = await f.add(f.owner, 'selected');
  const latest = (await f.request(`/projects/${f.project.id}`, { token: f.owner.token })).value;
  const guest = (await f.request(`/projects/${f.project.id}/guests`, { method: 'POST', token: f.owner.token, body: { name: 'Guest preview', resources: [{ assetId: asset.assetId, versionIds: [asset.versionId] }], expectedRevision: latest.revision } })).value;
  const list = await f.request(`/projects/${f.project.id}/publications`, { token: f.owner.token });
  assert.equal(list.value.publications[0].id, guest.id); assert.ok(!JSON.stringify(list.value).includes(guest.guestToken));
  await f.accept(f.editor, await f.invite(f.editor, 'editor', [{ assetId: asset.assetId, versionIds: [asset.versionId] }]));
  assert.equal((await f.request(`/projects/${f.project.id}/publications`, { token: f.editor.token })).status, 403);
  assert.equal((await f.request(`/projects/${f.project.id}/membership`, { method: 'DELETE', token: f.owner.token })).status, 409);
  const current = (await f.request(`/projects/${f.project.id}`, { token: f.owner.token })).value;
  const transferred = await f.request(`/projects/${f.project.id}/ownership`, { method: 'POST', token: f.owner.token, body: { userId: f.editor.user.id, expectedRevision: current.revision } });
  assert.equal(transferred.value.role, 'editor');
  assert.equal((await f.request(`/projects/${f.project.id}/guests/${guest.id}`, { method: 'DELETE', token: f.owner.token })).status, 403);
  assert.equal((await f.request(`/projects/${f.project.id}/guests/${guest.id}`, { method: 'DELETE', token: f.editor.token })).status, 200);
  assert.equal((await f.request(`/guest/${guest.guestToken}`)).status, 404);
  assert.equal((await f.request(`/projects/${f.project.id}/membership`, { method: 'DELETE', token: f.owner.token })).status, 200);
  assert.equal((await f.request(`/sync?projectId=${f.project.id}`, { token: f.owner.token })).status, 404);
});

test('local memory revocation after queueing prevents transfer and retains reviewable work', async t => {
  const f = await setup(t), disk = new Map(); let permitted = true;
  const client = HoleRelayModel.createClient({ endpoint: f.address, deviceId: 'memory:revocation', loadQueue: async id => structuredClone(disk.get(id)), saveQueue: async (id, value) => disk.set(id, structuredClone(value)), validateQueued: async () => { if (!permitted) throw Object.assign(new Error('Permission removed'), { code: 'MEMORY_PERMISSION' }); } });
  await client.signIn({ email: f.owner.user.email, password: 'a durable private password' });
  const data = HoleRelayModel.selectedRecord('memory', { text: 'Selected memory', consent: 'explicit', syncAllowed: true }, { remoteId: 'memory:one', permitMemory: true });
  await client.queue(f.project.id, { id: 'memory:queued', type: 'record.put', data }, { kind: 'memory', localRecordId: 'local:memory' });
  permitted = false; assert.equal((await client.flush(f.project.id)).results.length, 0);
  assert.equal((await client.pending(f.project.id))[0].error.code, 'MEMORY_PERMISSION');
  assert.equal((await client.pull(f.project.id)).records.length, 0);
});
