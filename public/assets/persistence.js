/* The shell keeps its legacy shape. IDB is authoritative when Core is present;
 * localStorage remains a compatibility mirror, never a false save acknowledgement. */
(() => {
  'use strict';
  const storageKey = 'hole-os:workspace:v1';
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const decode = text => {
    const value = JSON.parse(text);
    if (!isObject(value)) throw new TypeError('Workspace state must be an object.');
    return value;
  };
  let state = null;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) state = decode(saved);
  } catch {
    // Invalid or unavailable browser storage must not stop the workspace opening.
  }
  let revision = 0, generation = 0, pending = 0, lastStatus = { state: 'opening', message: 'Opening saved work…' };
  const core = window.HoleCore;
  const notify = (state, message, code) => {
    lastStatus = { state, message, ...(code ? { code } : {}) };
    window.dispatchEvent(new CustomEvent('hole:storage-status', { detail: lastStatus }));
  };
  const apply = next => {
    state = next;
    window.dispatchEvent(new CustomEvent('openai:set_globals', { detail: { globals: { widgetState: state } } }));
  };
  const ready = core ? core.ready.then(async () => {
    const record = await core.get('settings', 'legacy-workspace');
    revision = record?.revision || 0;
    if (record && JSON.stringify(state) !== JSON.stringify(record.value)) { generation++; apply(record.value); }
    notify('saved', 'Saved locally');
  }).catch(error => { notify('failed', error.message, error.code); throw error; }) : Promise.resolve();
  ready.catch(() => {});
  let queue = ready;
  const adapter = {
    get widgetState() {
      return state;
    },
    setWidgetState(next) {
      const value = typeof next === 'function' ? next(state) : next;
      if (!isObject(value)) throw new TypeError('Workspace state must be an object.');
      const serialized = JSON.stringify(value);
      const capturedGeneration = generation, snapshot = decode(serialized);
      pending++; notify('saving', 'Saving locally…');
      const saving = queue.catch(() => {}).then(async () => {
        await ready;
        if (capturedGeneration !== generation) throw Object.assign(new Error('Newer saved work was restored. Review the current workspace before saving again.'), { code: 'CONFLICT' });
        if (core) {
          const record = await core.put('settings', { id: 'legacy-workspace', value: snapshot }, { expectedRevision: revision });
          revision = record.revision;
          state = snapshot;
          try { localStorage.setItem(storageKey, serialized); } catch { /* IDB already holds the acknowledged workspace; reload hydrates it. */ }
        } else {
          localStorage.setItem(storageKey, serialized);
          state = snapshot;
        }
        notify('saved', 'Saved locally');
      }).catch(error => { notify(error.code === 'CONFLICT' ? 'conflict' : 'failed', error.message || 'This workspace could not be saved. Keep this tab open and export your work.', error.code); throw error; }).finally(() => { pending--; });
      queue = saving;
      return saving;
    }
  };
  Object.defineProperty(window, 'openai', { value: adapter, configurable: false, writable: false });
  window.HolePersistence = Object.freeze({ ready, flush: () => queue, get status() { return { ...lastStatus }; }, get pending() { return pending; } });
  window.addEventListener('storage', event => {
    if (core) return;
    if (event.key !== storageKey || !event.newValue) return;
    try {
      state = decode(event.newValue);
      window.dispatchEvent(new CustomEvent('openai:set_globals', {
        detail: { globals: { widgetState: state } }
      }));
    } catch {
      // Ignore malformed state from another tab.
    }
  });
  window.addEventListener('hole:core-change', async event => {
    if (!core || pending || !(event.detail?.type === 'restore' || event.detail?.type === 'settings' && event.detail.id === 'legacy-workspace')) return;
    try {
      const record = await core.get('settings', 'legacy-workspace');
      if (!record || record.revision === revision) return;
      revision = record.revision; generation++; apply(record.value);
    } catch (error) { notify('failed', error.message, error.code); }
  });
  window.addEventListener('beforeunload', event => {
    if (pending || ['failed', 'conflict'].includes(lastStatus.state)) { event.preventDefault(); event.returnValue = ''; }
  });

  // Keep the dock inside the visible screen as mobile browser chrome or the
  // keyboard changes its height. CSS provides a dynamic-viewport fallback.
  const syncViewport = () => {
    const height = window.visualViewport?.height || window.innerHeight;
    document.documentElement.style.setProperty('--hole-viewport-height', height + 'px');
  };
  syncViewport();
  window.addEventListener('resize', syncViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', syncViewport, { passive: true });
})();
