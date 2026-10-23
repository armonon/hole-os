/* Standalone adapter: the authored fragment only uses widgetState and setWidgetState.
 * Its state stays in this browser's localStorage; no host frame or remote account is used.
 */
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
  const adapter = {
    get widgetState() {
      return state;
    },
    async setWidgetState(next) {
      const value = typeof next === 'function' ? next(state) : next;
      if (!isObject(value)) throw new TypeError('Workspace state must be an object.');
      const serialized = JSON.stringify(value);
      state = decode(serialized);
      // Writes are synchronous so a reload after editing retains the latest state.
      // If storage is blocked or full, the fragment's existing catch keeps it usable.
      localStorage.setItem(storageKey, serialized);
    }
  };
  Object.defineProperty(window, 'openai', { value: adapter, configurable: false, writable: false });
  window.addEventListener('storage', event => {
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
