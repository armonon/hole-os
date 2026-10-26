/* Stable app instances. Presentation changes never remount a running editor. */
(() => {
  'use strict';
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const json = value => {
    let text;
    try { text = JSON.stringify(value); } catch { throw fail('INVALID_STATE', 'Editor state must be serializable.'); }
    if (!text || text.length > 2 * 1024 * 1024) throw fail('INVALID_STATE', 'Editor state exceeds the checkpoint limit.');
    return JSON.parse(text);
  };
  const id = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
  const presentations = new Set(['window', 'canvas', 'focus', 'minimized']);
  function createRuntime({ core = () => globalThis.HoleCore, randomUUID = () => crypto.randomUUID(), onChange = () => {} } = {}) {
    const apps = new Map(), instances = new Map(), pending = new Map();
    const service = () => { const result = typeof core === 'function' ? core() : core; if (!result) throw fail('STORAGE_UNAVAILABLE', 'Durable storage is unavailable.'); return result; };
    const inspect = entry => json({ id: entry.id, appId: entry.appId, context: entry.context, presentation: entry.presentation, status: entry.status });
    const requireInstance = instanceId => { const entry = instances.get(instanceId); if (!entry) throw fail('INSTANCE_NOT_FOUND', 'This app instance is not running.'); return entry; };
    const announce = entry => onChange(inspect(entry));
    const queue = (instanceId, task) => {
      const before = pending.get(instanceId) || Promise.resolve();
      const next = before.catch(() => {}).then(task);
      pending.set(instanceId, next);
      void next.finally(() => { if (pending.get(instanceId) === next) pending.delete(instanceId); }).catch(() => {});
      return next;
    };
    function register(appId, adapter) {
      if (!id(appId) || !adapter || typeof adapter.mount !== 'function') throw fail('INVALID_ADAPTER', 'An app needs a valid ID and mount adapter.');
      if (apps.has(appId)) throw fail('APP_EXISTS', 'The app adapter is already registered.');
      apps.set(appId, adapter);
      return () => { if ([...instances.values()].some(entry => entry.appId === appId)) throw fail('APP_RUNNING', 'Close this app’s instances before removing its adapter.'); apps.delete(appId); };
    }
    async function open(appId, options = {}) {
      const adapter = apps.get(appId);
      if (!adapter) throw fail('APP_UNAVAILABLE', 'No working adapter is registered for this app.');
      const context = json({ projectId: options.projectId || null, assetId: options.assetId || null, versionId: options.versionId || null, spaceId: options.spaceId || null });
      for (const value of Object.values(context)) if (value !== null && !id(value)) throw fail('INVALID_CONTEXT', 'Invalid resource or project ID.');
      if (context.versionId && !context.assetId) throw fail('INVALID_CONTEXT', 'A version needs an asset ID.');
      if (options.reuse && !['never', 'same-resource'].includes(options.reuse)) throw fail('INVALID_REUSE', 'Choose an explicit instance reuse policy.');
      if (options.reuse === 'same-resource') {
        const match = [...instances.values()].find(entry => entry.appId === appId && entry.status === 'running' && JSON.stringify(entry.context) === JSON.stringify(context));
        if (match) return inspect(match);
      }
      const instanceId = options.instanceId || `instance:${randomUUID()}`;
      if (!id(instanceId) || instances.has(instanceId)) throw fail('INSTANCE_EXISTS', 'The instance ID is invalid or already running.');
      const presentation = options.presentation || 'window';
      if (!presentations.has(presentation)) throw fail('INVALID_PRESENTATION', 'Unknown app presentation.');
      const entry = { id: instanceId, appId, context, presentation, status: 'opening', editorState: json(options.editorState ?? {}), handle: null };
      instances.set(instanceId, entry);
      try {
        entry.handle = await adapter.mount({ ...inspect(entry), editorState: json(entry.editorState) }, options.root || null) || {};
        entry.status = 'running';
        announce(entry);
        return inspect(entry);
      } catch (error) {
        instances.delete(instanceId);
        throw error;
      }
    }
    function present(instanceId, presentation) {
      return queue(instanceId, async () => {
        const entry = requireInstance(instanceId);
        if (!presentations.has(presentation)) throw fail('INVALID_PRESENTATION', 'Unknown app presentation.');
        const apply = entry.handle.present || apps.get(entry.appId).present;
        if (apply) await apply.call(entry.handle, presentation, inspect(entry));
        entry.presentation = presentation;
        announce(entry);
        return inspect(entry);
      });
    }
    async function serializeEntry(entry) {
      const read = entry.handle.serialize || apps.get(entry.appId).serialize;
      if (read) entry.editorState = json(await read.call(entry.handle, inspect(entry)));
      return json({ schema: 'hole.instance/1', ...inspect(entry), editorState: entry.editorState });
    }
    function serialize(instanceId) { return queue(instanceId, () => serializeEntry(requireInstance(instanceId))); }
    async function persist(entry, snapshot) {
      const storage = service();
      await storage.ready;
      const key = `runtime:${entry.id}`;
      const previous = await storage.get('settings', key);
      return storage.put('settings', { id: key, value: snapshot }, previous ? { expectedRevision: previous.revision } : {});
    }
    function checkpoint(instanceId) {
      return queue(instanceId, async () => { const entry = requireInstance(instanceId); return persist(entry, await serializeEntry(entry)); });
    }
    async function restore(snapshot, { root } = {}) {
      const value = json(snapshot);
      if (value.schema !== 'hole.instance/1' || !id(value.id) || !id(value.appId) || !value.context) throw fail('INVALID_SNAPSHOT', 'Unsupported app checkpoint.');
      if (instances.has(value.id)) throw fail('INSTANCE_EXISTS', 'Restoring must not overwrite a running editor.');
      return open(value.appId, { ...value.context, instanceId: value.id, presentation: value.presentation, editorState: value.editorState, root });
    }
    function close(instanceId, { checkpoint: save = true } = {}) {
      return queue(instanceId, async () => {
        const entry = requireInstance(instanceId);
        if (save) await persist(entry, await serializeEntry(entry));
        const unmount = entry.handle.close || apps.get(entry.appId).unmount;
        if (unmount) await unmount.call(entry.handle, inspect(entry));
        entry.status = 'closed';
        instances.delete(instanceId);
        announce(entry);
        return inspect(entry);
      });
    }
    return Object.freeze({ register, open, present, serialize, checkpoint, restore, close, get: instanceId => instances.has(instanceId) ? inspect(instances.get(instanceId)) : null, list: () => [...instances.values()].map(inspect) });
  }
  globalThis.HoleRuntimeModel = Object.freeze({ createRuntime });
  if (typeof window !== 'undefined') window.HoleRuntime = createRuntime({ onChange: detail => window.dispatchEvent(new CustomEvent('hole:runtime-change', { detail })) });
})();
