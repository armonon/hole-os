import http from 'node:http';
import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { openStore, serviceError } from './store.mjs';

const scrypt = promisify(scryptCallback);
const token = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const ident = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const MAX_BYTES = 24 * 1024 * 1024, MAX_UPLOAD = 16 * 1024 * 1024;
const assert = (condition, status, code, message) => { if (!condition) throw serviceError(status, code, message); };
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : plain(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const userView = user => ({ id: user.id, name: user.name, email: user.email, emailVerified: false });
function fields(value, allowed, required = allowed) { assert(plain(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)), 400, 'INVALID', 'Unexpected or missing request fields.'); }
function name(value, maximum = 160) { assert(typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value), 400, 'INVALID', 'Invalid name or text.'); return value.trim(); }
function password(value) { assert(typeof value === 'string' && value.length >= 12 && value.length <= 1024, 400, 'PASSWORD', 'Use a password between 12 and 1024 characters.'); return value; }
function email(value) { assert(typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 400, 'INVALID', 'Supply a valid email address.'); return value.toLowerCase(); }
async function passwordRecord(value) { const salt = randomBytes(16).toString('hex'); return { salt, hash: Buffer.from(await scrypt(value, salt, 64, { maxmem: 64 * 1024 * 1024 })).toString('hex') }; }
async function verifyPassword(value, record) { const candidate = await scrypt(value, record.salt, 64, { maxmem: 64 * 1024 * 1024 }); return timingSafeEqual(candidate, Buffer.from(record.hash, 'hex')); }
function credential(req) {
  if (req.headers.authorization?.startsWith('Bearer ')) return req.headers.authorization.slice(7);
  return req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith('hole_session='))?.slice(13) || '';
}
function auth(state, secret, now) {
  const session = state.sessions[hash(secret)];
  assert(secret && session && session.expiresAt > now && state.users[session.userId], 401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return state.users[session.userId];
}
function member(state, user, projectId, editing = false) {
  const project = state.projects[projectId];
  assert(project && project.members[user.id], 404, 'NOT_FOUND', 'This project is not available.');
  const access = project.members[user.id];
  if (editing) assert(['owner', 'editor'].includes(access.role), 403, 'FORBIDDEN', 'This project requires editor access.');
  return { project, access };
}
function owner(state, user, projectId) { const result = member(state, user, projectId); assert(result.access.role === 'owner', 403, 'FORBIDDEN', 'Only the project owner can manage access.'); return result.project; }
function canVersion(state, user, project, versionId) {
  const version = state.versions[versionId], asset = version && state.assets[version.assetId], access = project.members[user.id];
  if (!asset || asset.projectId !== project.id || !access) return false;
  if (access.role === 'owner') return true;
  const scope = access.resources.find(item => item.assetId === asset.id);
  return !!scope && (scope.versionIds.includes(versionId) || scope.followApproved && (project.approved[asset.id] || []).includes(versionId));
}
function assetAccess(state, user, assetId, versionId) {
  const asset = state.assets[assetId];
  assert(asset, 404, 'NOT_FOUND', 'This resource is not available.');
  const { project, access } = member(state, user, asset.projectId);
  assert(state.versions[versionId]?.assetId === asset.id && canVersion(state, user, project, versionId), 404, 'NOT_FOUND', 'This version is not available.');
  return { asset, project, access, version: state.versions[versionId] };
}
function versionView(state, user, project, version) {
  const { bytes, createdBy, ...safe } = version;
  return { ...safe, parentVersionIds: version.parentVersionIds.filter(id => canVersion(state, user, project, id)) };
}
function assetView(state, user, project, asset) {
  const versions = asset.versionIds.filter(id => canVersion(state, user, project, id));
  if (!versions.length) return null;
  return { id: asset.id, projectId: asset.projectId, name: asset.name, state: asset.state, revision: asset.revision, versionIds: versions, headVersionId: versions.at(-1), versions: versions.map(id => versionView(state, user, project, state.versions[id])) };
}
function projectView(state, user, project) {
  const access = project.members[user.id];
  return { id: project.id, name: project.name, revision: project.revision, role: access.role, ownerId: project.ownerId, members: Object.entries(project.members).map(([userId, value]) => ({ userId, role: value.role, name: state.users[userId]?.name || 'Member', ...(access.role === 'owner' || userId === user.id ? { resources: structuredClone(value.resources || []) } : {}) })) };
}
function recordVisible(record, user, project) { return record.projectId === project.id && (record.ownerId === user.id || record.visibility === 'shared'); }
function recordView(state, user, project, record) { return { ...record, references: record.references.filter(ref => canVersion(state, user, project, ref.versionId)) }; }
function snapshot(state, user, projectId) {
  const { project } = member(state, user, projectId);
  return { cursor: project.revision, project: projectView(state, user, project), assets: Object.values(state.assets).filter(asset => asset.projectId === projectId).map(asset => assetView(state, user, project, asset)).filter(Boolean), records: Object.values(state.records).filter(record => recordVisible(record, user, project)).map(record => recordView(state, user, project, record)) };
}
function revision(record, expected) { assert(Number.isSafeInteger(expected) && record.revision === expected, 409, 'CONFLICT', 'This item changed. Keep your local work and review the current version before retrying.'); }
function dataBytes(encoded) {
  assert(typeof encoded === 'string' && encoded.length <= Math.ceil(MAX_UPLOAD / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded), 400, 'INVALID_BYTES', 'Supply a base64 file of at most 16 MiB.');
  return Buffer.from(encoded, 'base64');
}
function mime(value) { assert(typeof value === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(value) && value.length <= 120, 400, 'INVALID', 'Invalid MIME type.'); return value; }
function addVersion(state, user, asset, input, now, parent = []) {
  const bytes = dataBytes(input.bytes), versionId = `version:${randomUUID()}`;
  const version = { id: versionId, assetId: asset.id, parentVersionIds: parent, mime: mime(input.mime), size: bytes.length, hash: hash(bytes), bytes: input.bytes, operation: name(input.operation || 'upload'), createdBy: user.id, createdAt: now };
  state.versions[versionId] = version; asset.versionIds.push(versionId); asset.headVersionId = versionId; asset.revision++;
  const access = state.projects[asset.projectId].members[user.id];
  if (access.role !== 'owner') {
    let scope = access.resources.find(item => item.assetId === asset.id);
    if (!scope) { scope = { assetId: asset.id, versionIds: [], followApproved: false }; access.resources.push(scope); }
    scope.versionIds.push(versionId);
  }
  return { assetId: asset.id, versionId, revision: asset.revision };
}
function scopeResources(state, project, resources, { follow = true } = {}) {
  assert(Array.isArray(resources) && resources.length <= 100, 400, 'INVALID', 'Choose at most 100 resources.');
  const seen = new Set();
  return resources.map(item => {
    fields(item, follow ? ['assetId', 'versionIds', 'followApproved'] : ['assetId', 'versionIds'], ['assetId', 'versionIds']);
    const asset = state.assets[item.assetId];
    assert(asset && asset.projectId === project.id && !seen.has(asset.id) && Array.isArray(item.versionIds) && item.versionIds.length > 0 && item.versionIds.length <= 100 && item.versionIds.every(id => state.versions[id]?.assetId === asset.id), 400, 'INVALID_SCOPE', 'Grant explicit versions belonging to this project.');
    if (item.followApproved !== undefined) assert(typeof item.followApproved === 'boolean', 400, 'INVALID_SCOPE', 'Invalid approval stream.');
    seen.add(asset.id);
    return { assetId: asset.id, versionIds: [...new Set(item.versionIds)], followApproved: item.followApproved === true };
  });
}
function publicManifest(state, publication) {
  return { id: publication.id, name: publication.name, createdAt: publication.createdAt, resources: publication.resources.flatMap(scope => scope.versionIds.map(versionId => {
    const asset = state.assets[scope.assetId], version = state.versions[versionId];
    return { assetId: asset.id, versionId, name: publication.names?.[asset.id] || asset.name, mime: version.mime, size: version.size, hash: version.hash };
  })) };
}
function jsonData(value) {
  const text = JSON.stringify(value);
  assert(text && Buffer.byteLength(text) <= 64 * 1024, 400, 'INVALID', 'Record data exceeds 64 KiB.');
  assert(!/"(?:__proto__|prototype|constructor)"\s*:/.test(text), 400, 'INVALID', 'Unsafe record data.');
  assert(!/"(?:access[_-]?token|refresh[_-]?token|session[_-]?token|authorization|password|private[_-]?key|credentials)"\s*:/i.test(text), 400, 'SECRET_DATA', 'Authentication secrets are not workspace records.');
  return JSON.parse(text);
}

function applyChange(state, user, projectId, change, now) {
  fields(change, ['id', 'type', 'data'], ['id', 'type', 'data']);
  assert(ident(change.id), 400, 'INVALID', 'Every queued change needs an ID.');
  const { project } = member(state, user, projectId, true), input = change.data;
  let result;
  if (change.type === 'asset.create') {
    fields(input, ['name', 'bytes', 'mime', 'operation'], ['name', 'bytes', 'mime']);
    const asset = { id: `asset:${randomUUID()}`, projectId, name: name(input.name, 240), state: 'active', revision: 0, versionIds: [], createdBy: user.id };
    state.assets[asset.id] = asset; result = addVersion(state, user, asset, input, now);
  } else if (change.type === 'asset.commit') {
    fields(input, ['assetId', 'baseVersionId', 'bytes', 'mime', 'operation'], ['assetId', 'baseVersionId', 'bytes', 'mime']);
    const allowed = assetAccess(state, user, input.assetId, input.baseVersionId);
    assert(allowed.project.id === projectId && allowed.asset.state === 'active', 404, 'NOT_FOUND', 'This active resource is not available.');
    assert(allowed.asset.headVersionId === input.baseVersionId, 409, 'CONFLICT', 'The resource has changed. Preserve your edit as a separate version or review the latest permitted version.');
    result = addVersion(state, user, allowed.asset, input, now, [input.baseVersionId]);
  } else if (change.type === 'asset.metadata') {
    fields(input, ['assetId', 'expectedRevision', 'name']);
    const asset = state.assets[input.assetId];
    assert(asset?.projectId === projectId && (project.ownerId === user.id || asset.createdBy === user.id) && asset.versionIds.some(id => canVersion(state, user, project, id)), 403, 'FORBIDDEN', 'Only an authorized resource creator or owner can rename this resource.');
    revision(asset, input.expectedRevision); asset.name = name(input.name, 240); asset.revision++; result = { assetId: asset.id, revision: asset.revision, name: asset.name };
  } else if (change.type === 'asset.trash' || change.type === 'asset.restore') {
    fields(input, ['assetId', 'expectedRevision']);
    const asset = state.assets[input.assetId];
    assert(asset?.projectId === projectId && (project.ownerId === user.id || asset.createdBy === user.id) && asset.versionIds.some(id => canVersion(state, user, project, id)), 403, 'FORBIDDEN', 'Only an authorized resource creator or owner can change its recovery state.');
    revision(asset, input.expectedRevision); asset.revision++; asset.state = change.type === 'asset.trash' ? 'trashed' : 'active'; result = { assetId: asset.id, revision: asset.revision, state: asset.state };
  } else if (change.type === 'record.put' || change.type === 'record.delete') {
    fields(input, ['id', 'type', 'value', 'visibility', 'references', 'expectedRevision'], change.type === 'record.delete' ? ['id', 'expectedRevision'] : ['id', 'type', 'value']);
    assert(ident(input.id), 400, 'INVALID', 'Invalid record ID.');
    const current = state.records[input.id];
    if (current) {
      assert(current.projectId === projectId && recordVisible(current, user, project), 404, 'NOT_FOUND', 'This record is unavailable.');
      assert(current.ownerId === user.id || current.visibility === 'shared', 403, 'FORBIDDEN', 'This record is private.');
      revision(current, input.expectedRevision);
    } else assert(input.expectedRevision === undefined && change.type === 'record.put', 409, 'CONFLICT', 'This record has no matching revision.');
    if (change.type === 'record.delete') { current.deleted = true; current.revision++; result = { id: current.id, revision: current.revision, deleted: true }; }
    else {
      assert(['note', 'task', 'event', 'scene', 'draft', 'preference', 'workspace', 'memory'].includes(input.type), 400, 'INVALID', 'Unsupported durable record type.');
      jsonData(input.value);
      if (input.type === 'memory') assert(input.value?.permitted === true && input.value.syncAllowed === true && input.value.consent === 'explicit' && (!input.value.expiresAt || input.value.expiresAt > now), 400, 'MEMORY_PERMISSION', 'Memory requires explicit permission and unexpired retention.');
      if (input.type === 'preference') assert(['theme', 'reducedMotion', 'language', 'fontScale'].includes(input.value?.key), 400, 'LOCAL_ONLY', 'This setting is not approved for synchronization.');
      const visibility = input.visibility || 'private';
      assert(['private', 'shared'].includes(visibility) && (!['draft', 'preference', 'workspace', 'memory'].includes(input.type) || visibility === 'private'), 400, 'INVALID', 'Drafts and preferences remain private.');
      assert(!current || current.ownerId === user.id || visibility === current.visibility, 403, 'FORBIDDEN', 'Only the record owner can change its audience.');
      const references = input.references || [];
      assert(Array.isArray(references) && references.length <= 100, 400, 'INVALID', 'Invalid record references.');
      for (const ref of references) { fields(ref, ['assetId', 'versionId']); const access = assetAccess(state, user, ref.assetId, ref.versionId); assert(access.project.id === projectId, 403, 'FORBIDDEN', 'References must belong to this project.'); }
      const record = { id: input.id, type: input.type, projectId, ownerId: current?.ownerId || user.id, value: jsonData(input.value), visibility, references, revision: (current?.revision || 0) + 1, deleted: false, updatedAt: now };
      state.records[input.id] = record; result = { id: record.id, revision: record.revision };
    }
  } else throw serviceError(400, 'UNSUPPORTED', 'This queued operation is unavailable.');
  project.revision++;
  return result;
}

export async function createService({ directory, origins = ['http://127.0.0.1:5173', 'http://localhost:5173'], now = () => Date.now(), sessionTTL = 8 * 60 * 60 * 1000, secureCookies = false, authAttempts = 10 } = {}) {
  const store = await openStore(directory), allowedOrigins = new Set(origins), presence = new Map(), attempts = new Map();
  const dummyPassword = await passwordRecord(token());
  const cookie = value => `hole_session=${value}; HttpOnly; SameSite=Strict; Path=/; ${value ? `Max-Age=${Math.floor(sessionTTL / 1000)}` : 'Max-Age=0'}${secureCookies ? '; Secure' : ''}`;
  const limited = (req, key) => {
    const id = `${req.socket.remoteAddress}:${hash(key)}`, current = attempts.get(id);
    if (!current || current.until <= now()) attempts.set(id, { count: 1, until: now() + 60000 });
    else { current.count++; assert(current.count <= authAttempts, 429, 'RATE_LIMIT', 'Too many attempts. Wait one minute and retry.'); }
    if (attempts.size > 10000) for (const [entry, value] of attempts) if (value.until <= now()) attempts.delete(entry);
  };
  async function body(req) {
    assert((req.headers['content-type'] || '').split(';')[0] === 'application/json', 415, 'CONTENT_TYPE', 'Send JSON.');
    let total = 0; const chunks = [];
    for await (const chunk of req) { total += chunk.length; assert(total <= MAX_BYTES, 413, 'BODY_LIMIT', 'The request exceeds 24 MiB.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw serviceError(400, 'INVALID_JSON', 'Invalid JSON.'); }
  }
  function respond(res, status, value, headers = {}) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
    res.end(status === 204 ? '' : JSON.stringify(value));
  }
  function bytes(res, version, filename) {
    res.writeHead(200, { 'Content-Type': version.mime, 'Content-Length': version.size, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.end(Buffer.from(version.bytes, 'base64'));
  }
  const handler = async (req, res) => {
    try {
      if (req.headers.origin) {
        assert(allowedOrigins.has(req.headers.origin), 403, 'ORIGIN_DENIED', 'This browser origin is not permitted.');
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Hole-Client', 'Access-Control-Max-Age': '300' }); res.end(); return; }
      if (['POST', 'PATCH', 'DELETE'].includes(req.method)) assert(req.headers['x-hole-client'] === '1', 403, 'CSRF', 'The Hole client header is required.');
      const url = new URL(req.url, 'http://service.local'), parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent), secret = credential(req);
      assert(parts.length <= 8 && parts.every(part => part.length <= 200), 400, 'INVALID_PATH', 'Invalid request path.');
      const stamp = now();
      if (req.method === 'GET' && url.pathname === '/health') return respond(res, 200, { service: 'hole-relay', schema: 1, accounts: true, externalProviders: { NOW: 'unconnected', Circle: 'unconnected' } });
      if (req.method === 'POST' && url.pathname === '/accounts') {
        const input = await body(req); fields(input, ['name', 'email', 'password']); const mail = email(input.email); password(input.password); limited(req, 'register');
        const pass = await passwordRecord(input.password), recoveryCode = token(), sessionToken = token();
        const result = await store.transact(state => {
          assert(!Object.values(state.users).some(user => user.email === mail), 409, 'ACCOUNT_EXISTS', 'An account with this address already exists.');
          const user = { id: `user:${randomUUID()}`, name: name(input.name), email: mail, password: pass, recoveryHash: hash(recoveryCode), createdAt: stamp };
          state.users[user.id] = user; state.sessions[hash(sessionToken)] = { userId: user.id, expiresAt: stamp + sessionTTL };
          return userView(user);
        });
        return respond(res, 201, { user: result, sessionToken, expiresAt: stamp + sessionTTL, recoveryCode, recoveryPolicy: 'Save this code privately. There is no email recovery provider; losing both password and code cannot be recovered by this service.' }, { 'Set-Cookie': cookie(sessionToken) });
      }
      if (req.method === 'POST' && url.pathname === '/sessions') {
        const input = await body(req); fields(input, ['email', 'password']); const mail = email(input.email); password(input.password); limited(req, mail);
        const state = await store.read(), found = Object.values(state.users).find(user => user.email === mail);
        const valid = await verifyPassword(input.password, found?.password || dummyPassword);
        assert(found && valid, 401, 'INVALID_CREDENTIALS', 'The account or password is incorrect.');
        const sessionToken = token();
        const user = await store.transact(current => { assert(current.users[found.id]?.password.hash === found.password.hash, 401, 'INVALID_CREDENTIALS', 'Account credentials changed. Sign in again.'); current.sessions[hash(sessionToken)] = { userId: found.id, expiresAt: stamp + sessionTTL }; return userView(current.users[found.id]); });
        return respond(res, 201, { user, sessionToken, expiresAt: stamp + sessionTTL }, { 'Set-Cookie': cookie(sessionToken) });
      }
      if (req.method === 'POST' && url.pathname === '/recovery') {
        const input = await body(req); fields(input, ['email', 'recoveryCode', 'password']); const mail = email(input.email); password(input.password); limited(req, mail);
        assert(typeof input.recoveryCode === 'string' && input.recoveryCode.length <= 100, 400, 'INVALID', 'Invalid recovery code.');
        const pass = await passwordRecord(input.password), nextCode = token();
        await store.transact(state => {
          const user = Object.values(state.users).find(item => item.email === mail);
          assert(user && user.recoveryHash === hash(input.recoveryCode), 401, 'INVALID_RECOVERY', 'The account or recovery code is incorrect.');
          user.password = pass; user.recoveryHash = hash(nextCode);
          for (const [key, session] of Object.entries(state.sessions)) if (session.userId === user.id) delete state.sessions[key];
        });
        return respond(res, 200, { recoveryCode: nextCode, signedOut: true }, { 'Set-Cookie': cookie('') });
      }
      if (parts[0] === 'worlds' && req.method === 'GET') {
        const state = await store.read();
        if (parts.length === 1) return respond(res, 200, { worlds: Object.values(state.worlds).filter(world => !world.revoked).map(world => ({ id: world.id, name: world.name, createdAt: world.createdAt })) });
        const world = state.worlds[parts[1]]; assert(world && !world.revoked, 404, 'NOT_FOUND', 'This World is unavailable.');
        if (parts.length === 2) return respond(res, 200, publicManifest(state, world));
        if (parts.length === 6 && parts[2] === 'assets' && parts[4] === 'versions') {
          assert(world.resources.some(item => item.assetId === parts[3] && item.versionIds.includes(parts[5])), 404, 'NOT_FOUND', 'This version was not published.');
          return bytes(res, state.versions[parts[5]], world.names[parts[3]]);
        }
      }
      if (parts[0] === 'guest' && req.method === 'GET') {
        const state = await store.read(), guest = state.guests[hash(parts[1] || '')];
        assert(guest && !guest.revoked && guest.expiresAt > stamp, 404, 'NOT_FOUND', 'This guest link is unavailable.');
        if (parts.length === 2) return respond(res, 200, { ...publicManifest(state, guest), expiresAt: guest.expiresAt, role: 'guest' });
        if (parts.length === 6 && parts[2] === 'assets' && parts[4] === 'versions') {
          assert(guest.resources.some(item => item.assetId === parts[3] && item.versionIds.includes(parts[5])), 404, 'NOT_FOUND', 'This version is not included in the guest link.');
          return bytes(res, state.versions[parts[5]], guest.names[parts[3]]);
        }
      }
      const current = await store.read(), user = auth(current, secret, stamp);
      if (req.method === 'GET' && url.pathname === '/session') return respond(res, 200, { user: userView(user), expiresAt: current.sessions[hash(secret)].expiresAt });
      if (req.method === 'DELETE' && url.pathname === '/session') { await store.transact(state => { delete state.sessions[hash(secret)]; }); for (const [key, value] of presence) if (value.sessionHash === hash(secret)) presence.delete(key); return respond(res, 200, { signedOut: true }, { 'Set-Cookie': cookie('') }); }
      if (url.pathname === '/projects' && req.method === 'GET') return respond(res, 200, { projects: Object.values(current.projects).filter(project => project.members[user.id]).map(project => projectView(current, user, project)) });
      if (url.pathname === '/projects' && req.method === 'POST') {
        const input = await body(req); fields(input, ['name']);
        const project = await store.transact(state => { const actor = auth(state, secret, now()), value = { id: `project:${randomUUID()}`, name: name(input.name), ownerId: actor.id, members: { [actor.id]: { role: 'owner', resources: [] } }, approved: {}, revision: 1, createdAt: now() }; state.projects[value.id] = value; return projectView(state, actor, value); });
        return respond(res, 201, project);
      }
      if (url.pathname === '/sync' && req.method === 'GET') return respond(res, 200, snapshot(current, user, url.searchParams.get('projectId')));
      if (url.pathname === '/sync' && req.method === 'POST') {
        const input = await body(req); fields(input, ['projectId', 'deviceId', 'changes']);
        assert(ident(input.deviceId) && Array.isArray(input.changes) && input.changes.length > 0 && input.changes.length <= 100, 400, 'INVALID', 'Sync 1–100 queued changes with a stable device ID.');
        const result = await store.transact(state => {
          const actor = auth(state, secret, now()); member(state, actor, input.projectId, true);
          const results = [];
          for (const change of input.changes) {
            try {
              assert(change && typeof change === 'object' && !Array.isArray(change) && ident(change.id), 400, 'INVALID', 'A queued change needs a valid ID.');
              const requestHash = hash(canonical({ projectId: input.projectId, change })), key = `${actor.id}/${input.deviceId}/${change.id}`;
              const prior = state.journal[key];
              if (prior) { assert(prior.requestHash === requestHash, 409, 'IDEMPOTENCY_CONFLICT', 'This change ID already identifies different content.'); results.push({ id: change.id, status: 'committed', result: prior.result, replayed: true }); continue; }
              assert(Object.keys(state.journal).length < 50000, 507, 'JOURNAL_LIMIT', 'The sync journal is full. Administrative archival is required.');
              // Each change gets an isolated draft so invalid payloads cannot leave
              // partial assets inside a successful batch transaction.
              const draft = structuredClone(state), result = applyChange(draft, actor, input.projectId, change, now());
              Object.assign(state, draft); state.journal[key] = { requestHash, result, createdAt: now() }; results.push({ id: change.id, status: 'committed', result });
            } catch (error) { results.push({ id: change?.id || null, status: error.status === 409 ? 'conflict' : 'failed', error: { code: error.code || 'INVALID', message: error.code ? error.message : 'This queued change is invalid.' } }); }
          }
          return { results, cursor: state.projects[input.projectId].revision };
        });
        return respond(res, 200, result);
      }
      if (parts[0] === 'assets' && parts.length === 4 && parts[2] === 'versions' && req.method === 'GET') { const access = assetAccess(current, user, parts[1], parts[3]); return bytes(res, access.version, access.asset.name); }
      if (parts[0] === 'invitations' && parts.length === 3 && parts[2] === 'accept' && req.method === 'POST') {
        const result = await store.transact(state => {
          const actor = auth(state, secret, now()), invitation = state.invitations[hash(parts[1])];
          assert(invitation && !invitation.revoked && !invitation.acceptedBy && invitation.expiresAt > now(), 404, 'INVITATION_UNAVAILABLE', 'This invitation is unavailable.');
          assert(!invitation.recipientId || invitation.recipientId === actor.id, 403, 'INVITATION_RECIPIENT', 'This invitation belongs to another account.');
          const project = state.projects[invitation.projectId];
          assert(project && project.ownerId !== actor.id && !project.members[actor.id], 409, 'ALREADY_MEMBER', 'This account already belongs to the project.');
          project.members[actor.id] = { role: invitation.role, resources: invitation.resources }; project.revision++; invitation.acceptedBy = actor.id;
          return projectView(state, actor, project);
        });
        return respond(res, 200, result);
      }
      if (parts[0] === 'projects' && parts[1]) {
        const projectId = parts[1];
        if (parts.length === 2 && req.method === 'GET') { const { project } = member(current, user, projectId); return respond(res, 200, projectView(current, user, project)); }
        if (parts[2] === 'publications' && parts.length === 3 && req.method === 'GET') {
          owner(current, user, projectId);
          const publications = ['worlds', 'guests'].flatMap(kind => Object.values(current[kind]).filter(item => item.projectId === projectId).map(item => ({ ...publicManifest(current, item), kind, revoked: item.revoked, ...(item.expiresAt ? { expiresAt: item.expiresAt, expired: item.expiresAt <= stamp } : {}) })));
          return respond(res, 200, { publications });
        }
        if (parts[2] === 'membership' && parts.length === 3 && req.method === 'DELETE') {
          await store.transact(state => { const actor = auth(state, secret, now()), { project, access } = member(state, actor, projectId); assert(access.role !== 'owner', 409, 'OWNER_REQUIRED', 'Transfer ownership before leaving this project.'); delete project.members[actor.id]; project.revision++; });
          return respond(res, 200, { left: true });
        }
        if (parts[2] === 'ownership' && parts.length === 3 && req.method === 'POST') {
          const input = await body(req); fields(input, ['userId', 'expectedRevision']);
          const result = await store.transact(state => {
            const actor = auth(state, secret, now()), project = owner(state, actor, projectId); revision(project, input.expectedRevision);
            assert(project.members[input.userId] && input.userId !== actor.id, 400, 'INVALID_OWNER', 'Transfer ownership to another existing member.');
            const retained = Object.values(state.assets).filter(asset => asset.projectId === projectId).map(asset => ({ assetId: asset.id, versionIds: [...asset.versionIds], followApproved: false }));
            project.members[actor.id] = { role: 'editor', resources: retained }; project.members[input.userId] = { role: 'owner', resources: [] }; project.ownerId = input.userId; project.revision++;
            return projectView(state, actor, project);
          });
          return respond(res, 200, result);
        }
        if (parts[2] === 'invitations' && parts.length === 3 && req.method === 'POST') {
          const input = await body(req); fields(input, ['role', 'recipientId', 'resources', 'ttlMs', 'expectedRevision'], ['role', 'resources', 'expectedRevision']);
          assert(['viewer', 'editor'].includes(input.role), 400, 'INVALID_ROLE', 'Invite a viewer or editor.');
          const invitationToken = token(), ttl = input.ttlMs ?? 24 * 60 * 60 * 1000;
          assert(Number.isSafeInteger(ttl) && ttl >= 1000 && ttl <= 7 * 86400000, 400, 'INVALID', 'Invitation expiry must be 1 second–7 days.');
          const result = await store.transact(state => {
            const actor = auth(state, secret, now()), project = owner(state, actor, projectId); revision(project, input.expectedRevision);
            if (input.recipientId !== undefined) assert(state.users[input.recipientId], 400, 'INVALID_RECIPIENT', 'Choose an existing account ID. Email ownership is not verified by this local service.');
            const id = `invitation:${randomUUID()}`, invitation = { id, projectId, role: input.role, recipientId: input.recipientId || null, resources: scopeResources(state, project, input.resources), expiresAt: now() + ttl, revoked: false, acceptedBy: null };
            state.invitations[hash(invitationToken)] = invitation; project.revision++; return { id, role: invitation.role, expiresAt: invitation.expiresAt, projectRevision: project.revision };
          });
          return respond(res, 201, { ...result, invitationToken });
        }
        if (parts[2] === 'invitations' && parts.length === 4 && req.method === 'DELETE') {
          await store.transact(state => { const actor = auth(state, secret, now()); owner(state, actor, projectId); const invitation = Object.values(state.invitations).find(item => item.id === parts[3] && item.projectId === projectId); assert(invitation, 404, 'NOT_FOUND', 'No such invitation.'); invitation.revoked = true; });
          return respond(res, 200, { revoked: true });
        }
        if (parts[2] === 'members' && parts.length === 4 && req.method === 'PATCH') {
          const input = await body(req); fields(input, ['role', 'resources', 'revoke', 'expectedRevision'], ['expectedRevision']);
          const result = await store.transact(state => {
            const actor = auth(state, secret, now()), project = owner(state, actor, projectId); revision(project, input.expectedRevision);
            const target = project.members[parts[3]];
            assert(target && parts[3] !== project.ownerId, 400, 'INVALID_MEMBER', 'This member cannot be changed through this operation.');
            if (input.revoke === true) delete project.members[parts[3]];
            else {
              assert(input.role === undefined || ['editor', 'viewer'].includes(input.role), 400, 'INVALID_ROLE', 'Choose viewer or editor.');
              if (input.role) target.role = input.role;
              if (input.resources) target.resources = scopeResources(state, project, input.resources);
            }
            project.revision++; return { revision: project.revision, revoked: input.revoke === true };
          });
          return respond(res, 200, result);
        }
        if (parts[2] === 'approvals' && parts.length === 3 && req.method === 'POST') {
          const input = await body(req); fields(input, ['resources', 'expectedRevision']);
          const result = await store.transact(state => { const actor = auth(state, secret, now()), project = owner(state, actor, projectId); revision(project, input.expectedRevision); const resources = scopeResources(state, project, input.resources, { follow: false }); project.approved = Object.fromEntries(resources.map(item => [item.assetId, item.versionIds])); project.revision++; return { revision: project.revision }; });
          return respond(res, 200, result);
        }
        if (['worlds', 'guests'].includes(parts[2]) && parts.length === 3 && req.method === 'POST') {
          const input = await body(req); fields(input, ['name', 'resources', 'ttlMs', 'expectedRevision'], ['name', 'resources', 'expectedRevision']);
          const isGuest = parts[2] === 'guests', guestToken = token(), ttl = input.ttlMs ?? 86400000;
          assert(!isGuest || Number.isSafeInteger(ttl) && ttl >= 1000 && ttl <= 7 * 86400000, 400, 'INVALID', 'Guest expiry must be 1 second–7 days.');
          const result = await store.transact(state => {
            const actor = auth(state, secret, now()), project = owner(state, actor, projectId); revision(project, input.expectedRevision);
            const resources = scopeResources(state, project, input.resources, { follow: false });
            assert(resources.length > 0, 400, 'EMPTY_PUBLICATION', 'Select explicit versions to share.');
            const value = { id: `${isGuest ? 'guest' : 'world'}:${randomUUID()}`, projectId, name: name(input.name), resources, names: Object.fromEntries(resources.map(item => [item.assetId, state.assets[item.assetId].name])), createdAt: now(), revoked: false, ...(isGuest ? { expiresAt: now() + ttl } : {}) };
            state[isGuest ? 'guests' : 'worlds'][isGuest ? hash(guestToken) : value.id] = value; project.revision++;
            return { ...publicManifest(state, value), projectRevision: project.revision, ...(isGuest ? { expiresAt: value.expiresAt } : {}) };
          });
          return respond(res, 201, { ...result, ...(isGuest ? { guestToken } : {}) });
        }
        if (['worlds', 'guests'].includes(parts[2]) && parts.length === 4 && req.method === 'DELETE') {
          await store.transact(state => { const actor = auth(state, secret, now()), project = owner(state, actor, projectId); const target = Object.values(state[parts[2]]).find(item => item.id === parts[3] && item.projectId === projectId); assert(target, 404, 'NOT_FOUND', 'This publication is unavailable.'); target.revoked = true; project.revision++; });
          return respond(res, 200, { revoked: true });
        }
        if (parts[2] === 'presence' && parts.length === 3) {
          member(current, user, projectId);
          if (req.method === 'POST') {
            const input = await body(req); fields(input, ['deviceId', 'cursor'], ['deviceId']);
            assert(ident(input.deviceId), 400, 'INVALID', 'Invalid device ID.');
            if (input.cursor) { fields(input.cursor, ['x', 'y']); assert(Number.isFinite(input.cursor.x) && Number.isFinite(input.cursor.y) && Math.abs(input.cursor.x) < 1e6 && Math.abs(input.cursor.y) < 1e6, 400, 'INVALID', 'Invalid cursor position.'); }
            // Re-check after the asynchronous body read: revocation wins.
            const latest = await store.read(), actor = auth(latest, secret, now()); member(latest, actor, projectId);
            presence.set(`${projectId}/${actor.id}/${input.deviceId}`, { projectId, userId: actor.id, name: actor.name, deviceId: input.deviceId, cursor: input.cursor || null, expiresAt: now() + 45000, sessionHash: hash(secret) });
            return respond(res, 200, { expiresAt: now() + 45000 });
          }
          if (req.method === 'GET') {
            const people = [];
            for (const [key, entry] of presence) {
              if (entry.expiresAt <= stamp || !current.sessions[entry.sessionHash] || current.sessions[entry.sessionHash].expiresAt <= stamp || !current.projects[entry.projectId]?.members[entry.userId]) { presence.delete(key); continue; }
              if (entry.projectId === projectId) { const { sessionHash, projectId: ignored, ...visible } = entry; people.push(visible); }
            }
            return respond(res, 200, { people });
          }
        }
      }
      throw serviceError(404, 'NOT_FOUND', 'This endpoint is unavailable.');
    } catch (error) {
      if (!res.headersSent) respond(res, error.status || 500, { error: { code: error.code || 'SERVICE_ERROR', message: error.status ? error.message : 'The service could not confirm this request. Keep your local work and retry the same queued change ID to reconcile its status.' } });
      else res.destroy();
    }
  };
  const server = http.createServer(handler);
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  return {
    server,
    async listen(port = 8787, host = '127.0.0.1') { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.removeListener('error', reject); resolve(); }); }); const address = server.address(); return `http://${host}:${address.port}`; },
    async close() { if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await store.close(); },
    handler
  };
}
