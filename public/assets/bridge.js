/* Hole bridge v1: host-created, expiring grants; no ambient file access. */
(() => {
  'use strict';
  const CHANNEL = 'hole.bridge', VERSION = 1;
  const MAX_JSON = 64 * 1024, MAX_BINARY = 32 * 1024 * 1024, MAX_REQUESTS = 256;
  const OPS = new Set(['resource.read', 'resource.commit', 'resource.derive', 'project.kit', 'state.read', 'state.save', 'activity.report', 'request.cancel']);
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.prototype.toString.call(value) === '[object Object]';
  const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
  function assert(condition, code, message) { if (!condition) throw fail(code, message); }
  function fields(value, allowed, required = allowed) {
    assert(object(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)), 'INVALID_MESSAGE', 'Unexpected or missing bridge fields.');
  }
  function clean(value, depth = 0) {
    assert(depth <= 16, 'INVALID_MESSAGE', 'Bridge data is nested too deeply.');
    if (typeof value === 'string') { assert(value.length <= MAX_JSON, 'PAYLOAD_TOO_LARGE', 'Bridge text exceeds 64 KiB.'); return value; }
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) { assert(value.length <= 4096, 'PAYLOAD_TOO_LARGE', 'Too many bridge values.'); return value.map(item => clean(item, depth + 1)); }
    assert(object(value), 'INVALID_MESSAGE', 'Bridge metadata must contain plain data.');
    assert(Object.keys(value).length <= 4096, 'PAYLOAD_TOO_LARGE', 'Too many metadata fields.');
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      assert(!['__proto__', 'constructor', 'prototype'].includes(key), 'INVALID_MESSAGE', 'Unsafe metadata key.');
      result[key] = clean(value[key], depth + 1);
    }
    return result;
  }
  function metadata(value) {
    const result = clean(value);
    assert(new TextEncoder().encode(JSON.stringify(result)).length <= MAX_JSON, 'PAYLOAD_TOO_LARGE', 'Bridge metadata exceeds 64 KiB.');
    return result;
  }
  function recoveryHex(bytes) {
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += 16384) chunks.push(Array.from(bytes.subarray(offset, offset + 16384), byte => byte.toString(16).padStart(2, '0')).join(''));
    return chunks.join('');
  }
  function recoveryBlob(record) {
    assert(typeof record.hex === 'string' && record.hex.length <= MAX_BINARY * 2 && record.hex.length % 2 === 0 && /^[0-9a-f]*$/.test(record.hex), 'INVALID_STATE', 'The native recovery checkpoint is invalid.');
    const bytes = new Uint8Array(record.hex.length / 2);
    for (let index = 0; index < bytes.length; index++) bytes[index] = parseInt(record.hex.slice(index * 2, index * 2 + 2), 16);
    return new Blob([bytes], { type: record.mime });
  }
  function originOf(value) {
    let url;
    try { url = new URL(value); } catch { throw fail('INVALID_ORIGIN', 'A bridge requires an exact HTTP origin.'); }
    assert(value === url.origin && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'INVALID_ORIGIN', 'Use an exact HTTPS origin (or localhost during development).');
    return url.origin;
  }
  function binary(value) {
    const result = value instanceof Blob ? value : value instanceof ArrayBuffer ? new Blob([value]) : null;
    assert(result && result.size > 0 && result.size <= MAX_BINARY, 'INVALID_BINARY', 'Supply a Blob or ArrayBuffer between 1 byte and 32 MiB.');
    return result;
  }
  function createBridge({ core = () => globalThis.HoleCore, host = typeof window !== 'undefined' ? window : null, approvedOrigins = [], now = () => Date.now(), randomUUID = () => crypto.randomUUID(), digest = bytes => crypto.subtle.digest('SHA-256', bytes), onChange = () => {} } = {}) {
    const approved = new Set(approvedOrigins.map(originOf)), sessions = new Map();
    const storage = () => { const result = typeof core === 'function' ? core() : core; if (!result) throw fail('STORAGE_UNAVAILABLE', 'Durable storage is unavailable.'); return result; };
    const packet = (session, type, values = {}) => ({ channel: CHANNEL, version: VERSION, type, sessionId: session.id, nonce: session.nonce, ...values });
    const live = session => {
      assert(!session.revoked, 'GRANT_REVOKED', 'Access to this app connection was revoked.');
      assert(now() < session.expiresAt, 'GRANT_EXPIRED', 'This app connection has expired.');
    };
    function send(session, value) {
      if (session.port) session.port.postMessage(value);
      else session.source.postMessage(value, session.origin);
    }
    const describe = session => ({ sessionId: session.id, grantId: session.grantId, instanceId: session.instanceId, projectId: session.projectId, expiresAt: session.expiresAt, status: session.revoked ? 'revoked' : now() >= session.expiresAt ? 'expired' : session.ready ? 'connected' : 'connecting', transport: session.transport });
    function makeSession(options, transport) {
      assert(identifier(options.instanceId), 'INVALID_GRANT', 'An instance ID is required.');
      assert(options.projectId == null || identifier(options.projectId), 'INVALID_GRANT', 'Invalid project ID.');
      const operations = new Set(options.operations || []);
      assert(operations.size > 0 && [...operations].every(op => OPS.has(op)), 'INVALID_GRANT', 'Unknown or empty operation grant.');
      const resources = new Map();
      assert(Array.isArray(options.resources || []) && (options.resources || []).length <= 64, 'INVALID_GRANT', 'Too many granted resources.');
      for (const resource of options.resources || []) {
        assert(identifier(resource.assetId) && identifier(resource.versionId) && !resources.has(resource.assetId), 'INVALID_GRANT', 'Grant one explicit base version per resource.');
        const permissions = new Set(resource.operations || ['resource.read']);
        assert([...permissions].every(op => ['resource.read', 'resource.commit', 'resource.derive'].includes(op) && operations.has(op)), 'INVALID_GRANT', 'Resource operations must be explicitly granted.');
        resources.set(resource.assetId, { assetId: resource.assetId, initialVersionId: resource.versionId, versions: new Set([resource.versionId]), operations: permissions });
      }
      const ttlMs = options.ttlMs ?? 15 * 60 * 1000;
      assert(Number.isFinite(ttlMs) && ttlMs >= 1000 && ttlMs <= 60 * 60 * 1000, 'INVALID_GRANT', 'Grants last between one second and one hour.');
      const session = { id: `session:${randomUUID()}`, nonce: randomUUID(), grantId: `grant:${randomUUID()}`, instanceId: options.instanceId, projectId: options.projectId || null, expiresAt: now() + ttlMs, operations, resources, transport, requests: new Map(), jobs: new Map(), ready: false, revoked: false, port: null };
      sessions.set(session.id, session);
      return session;
    }
    function grant(session) {
      live(session);
      session.ready = true;
      send(session, packet(session, 'grant', { grantId: session.grantId, instanceId: session.instanceId, projectId: session.projectId, expiresAt: session.expiresAt, operations: [...session.operations], resources: [...session.resources.values()].map(resource => ({ assetId: resource.assetId, versionId: resource.initialVersionId, operations: [...resource.operations] })) }));
      onChange(describe(session));
    }
    function connectExternal(options) {
      const origin = originOf(options.origin);
      assert(approved.has(origin), 'ORIGIN_NOT_APPROVED', 'This studio origin is not approved for a connected session.');
      assert(origin !== host?.location?.origin, 'AMBIENT_ORIGIN', 'Untrusted apps must use an isolated origin.');
      assert(options.source && typeof options.source.postMessage === 'function' && options.source !== host, 'INVALID_SOURCE', 'A specific studio window is required.');
      const session = makeSession(options, 'window');
      Object.assign(session, { origin, source: options.source });
      send(session, packet(session, 'hello'));
      onChange(describe(session));
      return describe(session);
    }
    // For a sandboxed generated tool, the CHILD transfers a port to the exact
    // parent origin. The host never sends private data through wildcard postMessage.
    function prepareSandbox(options) {
      const frame = options.frame;
      assert(frame && frame.contentWindow && frame.sandbox && frame.sandbox.contains('allow-scripts') && frame.sandbox.length === 1, 'UNSAFE_SANDBOX', 'Generated tools require sandbox="allow-scripts" only.');
      assert(frame.hasAttribute('srcdoc') || typeof options.render === 'function', 'UNSAFE_SANDBOX', 'Use a host-created srcdoc sandbox for this transport.');
      const hostOrigin = originOf(host?.location?.origin);
      const session = makeSession(options, 'sandbox-port');
      Object.assign(session, { origin: 'null', source: frame.contentWindow });
      const bootstrap = { channel: CHANNEL, version: VERSION, sessionId: session.id, nonce: session.nonce, hostOrigin };
      if (options.render) frame.srcdoc = options.render(bootstrap);
      return { ...describe(session), bootstrap };
    }
    function envelope(session, data) {
      fields(data, ['channel', 'version', 'type', 'sessionId', 'nonce', 'grantId', 'requestId', 'operation', 'payload']);
      assert(data.channel === CHANNEL && data.version === VERSION && data.type === 'request' && data.sessionId === session.id && data.nonce === session.nonce && data.grantId === session.grantId, 'INVALID_SESSION', 'Bridge session or grant does not match.');
      assert(identifier(data.requestId) && OPS.has(data.operation), 'INVALID_MESSAGE', 'Invalid bridge request ID or operation.');
    }
    function schema(operation, payload) {
      switch (operation) {
        case 'resource.read': fields(payload, ['assetId', 'versionId']); break;
        case 'resource.commit': fields(payload, ['assetId', 'baseVersionId', 'blob', 'operation', 'parameters'], ['assetId', 'baseVersionId', 'blob', 'operation']); break;
        case 'resource.derive': fields(payload, ['assetId', 'versionId', 'outputs', 'operation', 'parameters'], ['assetId', 'versionId', 'outputs', 'operation']); break;
        case 'project.kit': fields(payload, ['projectId']); break;
        case 'state.read': fields(payload, []); break;
        case 'state.save': fields(payload, ['state', 'expectedRevision', 'recovery'], ['state']); break;
        case 'activity.report': fields(payload, ['jobId', 'label', 'state', 'progress', 'error'], ['jobId', 'label', 'state']); break;
        case 'request.cancel': fields(payload, ['requestId']); break;
      }
      if (payload.assetId !== undefined) assert(identifier(payload.assetId), 'INVALID_MESSAGE', 'Invalid asset ID.');
      if (payload.versionId !== undefined) assert(identifier(payload.versionId), 'INVALID_MESSAGE', 'Invalid version ID.');
      if (payload.baseVersionId !== undefined) assert(identifier(payload.baseVersionId), 'INVALID_MESSAGE', 'Invalid base version ID.');
      if (payload.operation !== undefined) assert(typeof payload.operation === 'string' && payload.operation.length >= 1 && payload.operation.length <= 160, 'INVALID_MESSAGE', 'Invalid operation label.');
      return payload;
    }
    async function fingerprint(operation, payload) {
      const normalized = { ...payload };
      const hash = async value => Array.from(new Uint8Array(await digest(await binary(value).arrayBuffer())), byte => byte.toString(16).padStart(2, '0')).join('');
      if (Object.hasOwn(normalized, 'recovery')) normalized.recovery = normalized.recovery === null ? null : { hash: await hash(normalized.recovery), mime: normalized.recovery.type || '' };
      if (Object.hasOwn(normalized, 'blob')) normalized.blob = { hash: await hash(normalized.blob), mime: normalized.blob.type || '' };
      if (Object.hasOwn(normalized, 'outputs')) {
        assert(Array.isArray(normalized.outputs) && normalized.outputs.length >= 1 && normalized.outputs.length <= 8, 'INVALID_MESSAGE', 'Derive between one and eight files.');
        let total = 0;
        normalized.outputs = await Promise.all(normalized.outputs.map(async output => {
          fields(output, ['name', 'kind', 'blob'], ['name', 'blob']);
          assert(typeof output.name === 'string' && output.name.length > 0 && output.name.length <= 240, 'INVALID_MESSAGE', 'Invalid output filename.');
          if (output.kind !== undefined) assert(typeof output.kind === 'string' && output.kind.length <= 80, 'INVALID_MESSAGE', 'Invalid output kind.');
          total += binary(output.blob).size;
          assert(total <= MAX_BINARY, 'PAYLOAD_TOO_LARGE', 'Combined output exceeds 32 MiB.');
          return { name: output.name, kind: output.kind || null, blob: { hash: await hash(output.blob), mime: output.blob.type || '' } };
        }));
      }
      return JSON.stringify(metadata({ operation, payload: normalized }));
    }
    function authorize(session, operation, payload) {
      live(session);
      assert(session.ready && session.operations.has(operation), 'ACCESS_DENIED', 'This operation is not granted.');
      if (operation.startsWith('resource.')) {
        const resource = session.resources.get(payload.assetId);
        assert(resource && resource.operations.has(operation) && resource.versions.has(payload.baseVersionId || payload.versionId), 'ACCESS_DENIED', 'This resource/version is not granted.');
      }
      if (operation === 'project.kit') assert(session.projectId && payload.projectId === session.projectId, 'ACCESS_DENIED', 'This project is not granted.');
    }
    async function execute(session, operation, payload, work) {
      const check = () => { authorize(session, operation, payload); assert(!work.controller.signal.aborted, 'CANCELLED', 'The request was cancelled.'); };
      check();
      if (operation === 'request.cancel') {
        assert(identifier(payload.requestId), 'INVALID_MESSAGE', 'Invalid cancellation target.');
        const target = session.requests.get(payload.requestId);
        assert(target, 'REQUEST_NOT_FOUND', 'No such request exists in this session.');
        if (target.committing || target.complete) return { cancelled: false, reason: target.committing ? 'commit-started' : 'completed' };
        target.controller.abort();
        return { cancelled: true };
      }
      const db = storage();
      await db.ready;
      check();
      if (operation === 'resource.read') {
        const result = await db.readAsset(payload.assetId, payload.versionId);
        check(); binary(result.blob);
        return { asset: { id: result.asset.id, name: result.asset.name, kind: result.asset.kind, mime: result.asset.mime }, version: { id: result.version.id, assetId: result.version.assetId, mime: result.version.mime, size: result.version.size }, blob: result.blob };
      }
      if (operation === 'resource.commit') {
        const blob = binary(payload.blob);
        check(); work.committing = true;
        const result = await db.commitAsset({ assetId: payload.assetId, baseVersionId: payload.baseVersionId, blob, operation: payload.operation, parameters: { ...(metadata(payload.parameters || {})), bridge: { instanceId: session.instanceId, projectId: session.projectId, requestId: work.requestId } } });
        session.resources.get(payload.assetId).versions.add(result.version.id);
        return { assetId: result.asset.id, versionId: result.version.id, revision: result.asset.revision, projectId: session.projectId };
      }
      if (operation === 'resource.derive') {
        const jobId = `bridge:${session.id}:${work.requestId}`;
        assert(jobId.length <= 360, 'INVALID_MESSAGE', 'Job identifier is too long.');
        const job = await db.put('jobs', { id: jobId, idempotencyKey: jobId, status: 'running', progress: 0, label: payload.operation, projectId: session.projectId, inputs: [{ assetId: payload.assetId, versionId: payload.versionId }], origin: 'studio-bridge' });
        try {
          check(); work.committing = true;
          return await db.commitJobOutputs({ jobId, idempotencyKey: jobId, outputs: payload.outputs.map(output => ({ name: output.name, kind: output.kind, blob: binary(output.blob), projectId: session.projectId, provenance: { operation: payload.operation, parameters: metadata(payload.parameters || {}), inputAssetId: payload.assetId, inputVersionId: payload.versionId, instanceId: session.instanceId } })) });
        } catch (error) {
          // Cleanup must never replace the original error or claim completion.
          try { await db.put('jobs', { ...job, status: ['CANCELLED', 'GRANT_REVOKED', 'GRANT_EXPIRED'].includes(error.code) ? 'cancelled' : 'failed', error: error.message }, { expectedRevision: job.revision }); } catch {}
          throw error;
        }
      }
      if (operation === 'project.kit') {
        const project = await db.get('projects', session.projectId); check();
        assert(project, 'PROJECT_NOT_FOUND', 'The granted project no longer exists.');
        const kit = project.kit || {};
        return { projectId: session.projectId, revision: project.revision, kit: metadata({ colors: kit.colors || [], fonts: kit.fonts || [], ...(kit.logoAssetId && session.resources.has(kit.logoAssetId) ? { logoAssetId: kit.logoAssetId } : {}) }) };
      }
      if (operation === 'state.save') {
        const state = metadata(payload.state);
        // JSON-safe native recovery survives Core backup/export, unlike a Blob in a record.
        const recovery = payload.recovery == null ? null : { mime: binary(payload.recovery).type, hex: recoveryHex(new Uint8Array(await binary(payload.recovery).arrayBuffer())) };
        if (payload.expectedRevision !== undefined) assert(Number.isSafeInteger(payload.expectedRevision) && payload.expectedRevision > 0, 'INVALID_MESSAGE', 'Invalid state revision.');
        check(); work.committing = true;
        const result = await db.put('settings', { id: `bridge-state:${session.instanceId}`, state, recovery, projectId: session.projectId, inputs: [...session.resources.values()].map(resource => ({ assetId: resource.assetId, versionId: [...resource.versions].at(-1) })) }, payload.expectedRevision !== undefined ? { expectedRevision: payload.expectedRevision } : {});
        return { revision: result.revision };
      }
      if (operation === 'state.read') {
        const result = await db.get('settings', `bridge-state:${session.instanceId}`); check();
        assert(!result || result.projectId === session.projectId, 'STATE_CONTEXT_CONFLICT', 'This instance checkpoint belongs to another project.');
        assert(!result || (result.inputs || []).every(input => session.resources.get(input.assetId)?.versions.has(input.versionId)), 'STATE_CONTEXT_CONFLICT', 'Restore this checkpoint with its original authorized resources.');
        return result ? { state: metadata(result.state), recovery: result.recovery ? recoveryBlob(result.recovery) : null, revision: result.revision, inputs: result.inputs } : null;
      }
      if (operation === 'activity.report') {
        assert(identifier(payload.jobId) && typeof payload.label === 'string' && payload.label.length > 0 && payload.label.length <= 160 && ['running', 'failed', 'cancelled'].includes(payload.state), 'INVALID_MESSAGE', 'Report an actual running, failed, or cancelled external job. Save operations report committed completion.');
        if (payload.progress !== undefined) assert(Number.isFinite(payload.progress) && payload.progress >= 0 && payload.progress <= 1, 'INVALID_MESSAGE', 'Progress must be between zero and one.');
        if (payload.error !== undefined) assert(typeof payload.error === 'string' && payload.error.length <= 1000, 'INVALID_MESSAGE', 'Invalid activity error.');
        const key = `bridge:${session.id}:${payload.jobId}`, previous = session.jobs.get(key);
        assert(!previous || previous.status === 'running', 'JOB_FINISHED', 'This external job is already finished.');
        check(); work.committing = true;
        const result = await db.put('jobs', { id: key, label: payload.label, status: payload.state, progress: (payload.progress || 0) * 100, error: payload.error || null, projectId: session.projectId, origin: 'studio-bridge', inputs: [...session.resources.values()].map(resource => ({ assetId: resource.assetId, versionId: resource.initialVersionId })) }, previous ? { expectedRevision: previous.revision } : {});
        session.jobs.set(key, result);
        return { jobId: key, revision: result.revision };
      }
      throw fail('ACCESS_DENIED', 'Unsupported bridge operation.');
    }
    async function dispatch(session, data) {
      let requestId;
      try {
        envelope(session, data); requestId = data.requestId;
        const payload = schema(data.operation, data.payload);
        authorize(session, data.operation, payload);
        // Install an entry before hashing so simultaneous duplicates share one write.
        const signaturePromise = fingerprint(data.operation, payload);
        let work = session.requests.get(requestId);
        if (work) {
          assert(await work.signature === await signaturePromise, 'REQUEST_REUSE', 'A request ID cannot be reused for different content.');
        } else {
          assert(session.requests.size < MAX_REQUESTS, 'SESSION_LIMIT', 'Reconnect to continue after 256 requests.');
          work = { requestId, signature: signaturePromise, controller: new AbortController(), committing: false, complete: false };
          session.requests.set(requestId, work);
          work.promise = (async () => { await signaturePromise; return execute(session, data.operation, payload, work); })().then(result => ({ ok: true, result }), error => ({ ok: false, error: { code: error.code || 'OPERATION_FAILED', message: error.code ? error.message : 'The operation could not be completed.' } })).finally(() => { work.complete = true; });
        }
        const response = await work.promise;
        // A commit already accepted by storage may finish after revocation, but
        // revoked sessions never receive additional private data or new grants.
        live(session);
        send(session, packet(session, 'response', { requestId, ...response }));
      } catch (error) {
        if (identifier(requestId || data?.requestId) && !session.revoked) send(session, packet(session, 'response', { requestId: requestId || data.requestId, ok: false, error: { code: error.code || 'INVALID_MESSAGE', message: error.code ? error.message : 'Invalid bridge message.' } }));
      }
    }
    async function receive(event) {
      const data = event.data;
      if (!object(data) || data.channel !== CHANNEL || data.version !== VERSION || !identifier(data.sessionId)) return false;
      const session = sessions.get(data.sessionId);
      if (!session || event.source !== session.source || event.origin !== session.origin || data.nonce !== session.nonce || session.revoked) return false;
      try {
        live(session);
        if (session.transport === 'sandbox-port') {
          if (session.ready || data.type !== 'port-ready' || event.ports?.length !== 1) return false;
          fields(data, ['channel', 'version', 'type', 'sessionId', 'nonce']);
          session.port = event.ports[0];
          session.port.onmessage = message => { void dispatch(session, message.data); };
          session.port.start?.();
          grant(session);
          return true;
        }
        if (data.type === 'ready') {
          fields(data, ['channel', 'version', 'type', 'sessionId', 'nonce']);
          if (!session.ready) grant(session);
          return true;
        }
        if (!session.ready) return false;
        await dispatch(session, data);
        return true;
      } catch { return false; }
    }
    function revoke(sessionId, reason = 'Access revoked') {
      const session = sessions.get(sessionId);
      if (!session || session.revoked) return false;
      session.revoked = true;
      for (const work of session.requests.values()) if (!work.committing) work.controller.abort();
      send(session, packet(session, 'revoked', { reason: String(reason).slice(0, 160) }));
      session.port?.close();
      onChange(describe(session));
      return true;
    }
    const listener = event => { void receive(event); };
    host?.addEventListener('message', listener);
    return Object.freeze({
      approveOrigin: origin => approved.add(originOf(origin)), connectExternal, prepareSandbox, receive, revoke,
      retryHandshake: sessionId => { const session = sessions.get(sessionId); assert(session && session.transport === 'window', 'SESSION_NOT_FOUND', 'No external window session.'); live(session); if (!session.ready) send(session, packet(session, 'hello')); },
      list: () => [...sessions.values()].map(describe),
      dispose: () => { host?.removeEventListener('message', listener); for (const session of sessions.values()) revoke(session.id, 'Host closed'); sessions.clear(); }
    });
  }
  globalThis.HoleBridgeModel = Object.freeze({ createBridge, CHANNEL, VERSION, MAX_JSON, MAX_BINARY });
  if (typeof window !== 'undefined') window.HoleBridge = createBridge({ onChange: detail => window.dispatchEvent(new CustomEvent('hole:bridge-change', { detail })) });
})();
