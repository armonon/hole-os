/* Include in an owned studio. No tokens, database handles, or ambient grants. */
(() => {
  'use strict';
  const CHANNEL = 'hole.bridge', VERSION = 1;
  const error = (code, message) => Object.assign(new Error(message), { code });
  function exactOrigin(value) {
    const url = new URL(value);
    if (url.origin !== value || !['https:', 'http:'].includes(url.protocol)) throw error('INVALID_ORIGIN', 'Specify the exact Hole host origin.');
    return value;
  }
  function createClient({ surface = globalThis, hostWindow, hostOrigin, bootstrap, timeoutMs = 30000 } = {}) {
    const sandbox = !!bootstrap;
    hostOrigin = exactOrigin(bootstrap?.hostOrigin || hostOrigin);
    hostWindow ||= surface.opener || (surface.parent !== surface ? surface.parent : null);
    if (!hostWindow) throw error('HOST_UNAVAILABLE', 'This studio has no connected Hole window.');
    let session = sandbox ? { sessionId: bootstrap.sessionId, nonce: bootstrap.nonce } : null;
    let grant = null, port = null, disposed = false;
    const pending = new Map();
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const timer = setTimeout(() => dispose(error('CONNECTION_TIMEOUT', 'Hole did not authorize this connection.')), timeoutMs);
    function post(message) { if (port) port.postMessage(message); else hostWindow.postMessage(message, hostOrigin); }
    function packet(type, values = {}) { return { channel: CHANNEL, version: VERSION, type, ...session, ...values }; }
    function receive(data) {
      if (disposed || !data || data.channel !== CHANNEL || data.version !== VERSION || !session || data.sessionId !== session.sessionId || data.nonce !== session.nonce) return;
      if (data.type === 'grant' && !grant) {
        if (typeof data.grantId !== 'string' || !Array.isArray(data.resources) || !Array.isArray(data.operations) || !Number.isFinite(data.expiresAt)) return;
        grant = structuredClone({ grantId: data.grantId, instanceId: data.instanceId, projectId: data.projectId, resources: data.resources, operations: data.operations, expiresAt: data.expiresAt });
        clearTimeout(timer); resolveReady(structuredClone(grant));
      } else if (data.type === 'response' && pending.has(data.requestId)) {
        const request = pending.get(data.requestId);
        pending.delete(data.requestId); clearTimeout(request.timer);
        if (data.ok === true) request.resolve(data.result);
        else request.reject(error(data.error?.code || 'OPERATION_FAILED', data.error?.message || 'The Hole request failed.'));
      } else if (data.type === 'revoked') dispose(error('GRANT_REVOKED', data.reason || 'Hole revoked this connection.'));
    }
    function listener(event) {
      if (event.source !== hostWindow || event.origin !== hostOrigin) return;
      const data = event.data;
      if (!data || data.channel !== CHANNEL || data.version !== VERSION) return;
      if (data.type === 'hello' && typeof data.sessionId === 'string' && typeof data.nonce === 'string' && !sandbox) {
        if (session && (session.sessionId !== data.sessionId || session.nonce !== data.nonce)) return;
        session = { sessionId: data.sessionId, nonce: data.nonce };
        post(packet('ready'));
      } else receive(data);
    }
    function dispose(reason = error('CONNECTION_CLOSED', 'The studio connection closed.')) {
      if (disposed) return;
      disposed = true; clearTimeout(timer);
      surface.removeEventListener?.('message', listener);
      port?.close();
      for (const request of pending.values()) { clearTimeout(request.timer); request.reject(reason); }
      pending.clear(); rejectReady(reason);
    }
    if (sandbox) {
      if (bootstrap.channel !== CHANNEL || bootstrap.version !== VERSION || typeof bootstrap.sessionId !== 'string' || typeof bootstrap.nonce !== 'string') { clearTimeout(timer); throw error('INVALID_BOOTSTRAP', 'Unsupported sandbox bootstrap.'); }
      const channel = new MessageChannel();
      port = channel.port1; port.onmessage = event => receive(event.data); port.start?.();
      hostWindow.postMessage(packet('port-ready'), hostOrigin, [channel.port2]);
    } else surface.addEventListener('message', listener);
    async function request(operation, payload, { requestId = `request:${crypto.randomUUID()}` } = {}) {
      await ready;
      if (disposed) throw error('CONNECTION_CLOSED', 'The studio connection closed.');
      if (Date.now() >= grant.expiresAt) throw error('GRANT_EXPIRED', 'Reconnect to continue editing with Hole.');
      if (!grant.operations.includes(operation)) throw error('ACCESS_DENIED', 'Hole has not granted this operation.');
      if (pending.has(requestId)) throw error('REQUEST_PENDING', 'This request is already in flight.');
      return new Promise((resolve, reject) => {
        const requestTimer = setTimeout(() => { pending.delete(requestId); reject(error('REQUEST_TIMEOUT', 'No acknowledgement received. Retry the same request ID; do not assume the save failed.')); }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer: requestTimer });
        try { post(packet('request', { grantId: grant.grantId, requestId, operation, payload })); }
        catch (cause) { pending.delete(requestId); clearTimeout(requestTimer); reject(cause); }
      });
    }
    return Object.freeze({ ready, request, dispose, getGrant: () => grant ? structuredClone(grant) : null });
  }
  globalThis.HoleBridgeClient = Object.freeze({ createClient });
})();
