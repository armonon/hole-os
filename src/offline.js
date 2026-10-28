/* Offline shell updates never discard drafts or activate without a user action. */
(() => {
  'use strict';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const loopback = location.hostname === 'localhost' || location.hostname.endsWith('.localhost') || location.hostname === '[::1]' || location.hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(location.hostname);
  if (loopback && new URLSearchParams(location.search).get('offline-test') !== '1') {
    // Unregister an earlier local test without reloading an editor or deleting its work.
    navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.filter(reg => [reg.active, reg.waiting, reg.installing].some(worker => worker && new URL(worker.scriptURL).pathname === '/service-worker.js')).map(reg => reg.unregister()))).catch(() => {});
    return;
  }
  const bar = document.createElement('aside'); bar.className = 'hole-offline-bar'; bar.hidden = true; bar.setAttribute('aria-label', 'Offline application status');
  const text = document.createElement('span'); text.setAttribute('role', 'status'); text.setAttribute('aria-live', 'polite');
  const update = document.createElement('button'); update.type = 'button'; update.className = 'hc-button'; update.textContent = 'Update';
  const later = document.createElement('button'); later.type = 'button'; later.className = 'hc-button'; later.textContent = 'Later'; later.addEventListener('click', () => { bar.hidden = true; });
  bar.append(text, update, later); document.body.append(bar);
  let registration, activeUpdate = null, busy = false;
  const show = (message, canUpdate = false) => { text.textContent = message; update.hidden = !canUpdate; bar.hidden = false; };
  function release(requestId) {
    if (activeUpdate?.requestId !== requestId) return;
    const session = activeUpdate; activeUpdate = null; session.cancelled = true; clearTimeout(session.timer);
    session.root.inert = session.wasInert;
  }
  // Inert removes editor focus. Capture also blocks global shortcuts retargeted to body.
  for (const type of ['keydown', 'beforeinput', 'paste', 'drop', 'pointerdown']) document.addEventListener(type, event => {
    if (!activeUpdate || bar.contains(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  async function prepare(requestId, worker) {
    if (activeUpdate) return activeUpdate.requestId === requestId ? activeUpdate.promise : false;
    if (document.querySelector('dialog[open]')) return false;
    const root = document.getElementById('hole-fluid-os'); if (!root) return false;
    const session = { requestId, worker, root, wasInert: root.inert, ready: false, cancelled: false };
    activeUpdate = session; root.inert = true;
    show('Preparing the update… Editing is briefly paused.');
    session.timer = setTimeout(() => {
      if (activeUpdate !== session) return;
      try { session.worker?.postMessage({ type: 'HOLE_UPDATE_READY', requestId, ready: false }); } catch {}
      release(requestId); show('The update check expired. Editing is available again; try Update when ready.', true);
    }, 20000);
    session.promise = (async () => {
      try {
        if (window.HoleContinuity?.finishEditing && await window.HoleContinuity.finishEditing() === false) return false;
        if (session.cancelled) return false;
        if (window.HoleExtensions?.beforeLeave && await window.HoleExtensions.beforeLeave() === false) return false;
        if (session.cancelled) return false;
        await window.HolePersistence?.flush?.();
        session.ready = !session.cancelled && !document.querySelector('dialog[open]') && !['failed', 'conflict', 'blocked'].includes(window.HolePersistence?.status?.state);
        return session.ready;
      } catch { return false; }
      finally { if (!session.ready) { release(requestId); show('The update is paused. Finish editing and close dialogs, then try Update again.', true); } }
    })();
    return session.promise;
  }
  navigator.serviceWorker.addEventListener('message', async event => {
    const { type, requestId } = event.data || {};
    if (type === 'HOLE_UPDATE_CANCEL') {
      if (activeUpdate?.requestId === requestId) { release(requestId); show(event.data.message || 'The update is paused. Editing is available again.', true); }
      return;
    }
    if (type !== 'HOLE_PREPARE_UPDATE' || typeof requestId !== 'string' || requestId.length > 100) return;
    const ready = await prepare(requestId, event.source);
    event.source?.postMessage({ type: 'HOLE_UPDATE_READY', requestId, ready });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A late activation after cancellation must not reload newly editable work.
    if (activeUpdate?.ready) location.reload();
  });
  update.addEventListener('click', async () => {
    if (busy || activeUpdate || !registration?.waiting) return;
    busy = true; update.disabled = true;
    const requestId = crypto.randomUUID(), worker = registration.waiting;
    try {
      if (!await prepare(requestId, worker)) { show('Finish editing and close open dialogs before updating. Your current version remains available.', true); return; }
      const channel = new MessageChannel();
      show('Checking saved work in your open Hole tabs… Editing is briefly paused.');
      const response = new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Another Hole tab did not acknowledge the update. Close it after saving, then try again.')), 15000); channel.port1.onmessage = event => { clearTimeout(timeout); resolve(event.data); channel.port1.close(); }; });
      worker.postMessage({ type: 'HOLE_ACTIVATE_REQUEST', requestId }, [channel.port2]);
      const result = await response;
      if (result.status === 'activating' && activeUpdate?.requestId === requestId) show('Opening the updated version…');
      else { release(requestId); show(result.message || 'The update is waiting for saved work.', true); }
    } catch (error) { try { worker.postMessage({ type: 'HOLE_UPDATE_READY', requestId, ready: false }); } catch {} release(requestId); show(error.message, true); }
    finally { busy = false; update.disabled = false; }
  });
  navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' }).then(reg => {
    registration = reg;
    const waiting = () => { if (reg.waiting) show('An update is ready. Apply it after your work is saved.', true); };
    waiting();
    reg.addEventListener('updatefound', () => { const worker = reg.installing; worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) waiting(); }); });
    window.HoleOffline = Object.freeze({ get updateReady() { return !!registration.waiting; }, showUpdate: waiting, check: () => registration.update() });
  }).catch(() => { /* Online editing remains available if the offline cache cannot install. */ });
  window.addEventListener('offline', () => show('Offline · saved local work remains available. External apps and connected services need a connection.'));
  window.addEventListener('online', () => { if (registration?.waiting) show('An update is ready. Apply it after your work is saved.', true); else bar.hidden = true; });
})();
