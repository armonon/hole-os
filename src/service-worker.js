/* Generated at build time. Only complete, hash-verified shell versions activate. */
'use strict';
const BUILD = /*__HOLE_CACHE_MANIFEST__*/ null;
const PREFIX = 'hole-shell-', CACHE = PREFIX + BUILD.version;
const CLIENTS = 'hole-client-versions';
const paths = new Set(BUILD.assets.map(asset => asset.path));
const waitingReplies = new Map();
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');

async function installShell() {
  const stageName = 'hole-install-' + BUILD.version + '-' + crypto.randomUUID();
  const cache = await caches.open(stageName);
  let destinationOpened = false, hadReady = false;
  try {
    // Limit concurrent fetch/decode work while retaining one atomic install gate.
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, BUILD.assets.length) }, async () => {
      while (next < BUILD.assets.length) {
        const asset = BUILD.assets[next++], response = await fetch(new Request(new URL(asset.path, self.location.origin).href, { cache: 'reload', credentials: 'same-origin' }));
        if (!response.ok || response.type === 'opaque') throw new Error('Offline asset unavailable: ' + asset.path);
        const bytes = await response.clone().arrayBuffer();
        if (bytes.byteLength !== asset.bytes || await digest(bytes) !== asset.hash) throw new Error('Offline asset changed during installation: ' + asset.path);
        await cache.put(asset.path, response);
      }
    }));
    const destination = await caches.open(CACHE); destinationOpened = true;
    hadReady = !!await destination.match('/__hole_offline_ready__');
    for (const asset of BUILD.assets) await destination.put(asset.path, await cache.match(asset.path));
    // A marker exists only after every required asset has passed integrity checks.
    await destination.put('/__hole_offline_ready__', new Response(JSON.stringify({ version: BUILD.version, bytes: BUILD.bytes, assets: BUILD.assets.length }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) { if (destinationOpened && !hadReady) await caches.delete(CACHE); throw error; }
  finally { await caches.delete(stageName); }
}
self.addEventListener('install', event => event.waitUntil(installShell()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  if (!await cache.match('/__hole_offline_ready__')) throw new Error('The offline shell is incomplete.');
  // Keep the prior version available for a tab still finishing a transition.
  const old = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
  for (const key of old.slice(0, -1)) await caches.delete(key);
  // Existing uncontrolled documents keep their current resources until navigation.
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      if (await cache.match('/__hole_offline_ready__')) {
        const clientId = event.resultingClientId || event.clientId;
        if (clientId) await (await caches.open(CLIENTS)).put('/client/' + encodeURIComponent(clientId), new Response(CACHE));
        return await cache.match('/index.html');
      }
      return fetch(request);
    })());
  } else if (paths.has(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const pin = event.clientId && await (await caches.open(CLIENTS)).match('/client/' + encodeURIComponent(event.clientId));
      const pinnedName = pin ? await pin.text() : CACHE;
      const cache = await caches.open(pinnedName.startsWith(PREFIX) ? pinnedName : CACHE), cached = await cache.match(url.pathname);
      // Fetching a newer network asset here would mix releases. Ask for recovery instead.
      return cached || new Response('This offline shell is incomplete. Reload online to repair the installation.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    })());
  }
});
async function requestActivation(event) {
  const port = event.ports?.[0], requestId = event.data.requestId;
  if (!port || typeof requestId !== 'string' || requestId.length > 100 || !event.source?.id) return;
  let windows = [], timer;
  const cancel = message => {
    for (const client of windows) { try { client.postMessage({ type: 'HOLE_UPDATE_CANCEL', requestId, message }); } catch {} }
    port.postMessage({ status: 'blocked', message });
  };
  try {
    windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(client => new URL(client.url).origin === self.location.origin);
    const responses = new Map(); let resolve;
    const done = new Promise(r => { resolve = r; });
    timer = setTimeout(() => resolve(false), 12000);
    waitingReplies.set(requestId, { ids: new Set(windows.map(client => client.id)), responses, resolve });
    for (const client of windows) client.postMessage({ type: 'HOLE_PREPARE_UPDATE', requestId });
    if (!windows.length) resolve(false);
    if (!await done) { cancel('The update is paused. Finish editing and close dialogs in every open Hole tab, then try Update again. No work has been replaced.'); return; }
    await self.skipWaiting();
    port.postMessage({ status: 'activating' });
  } catch { cancel('The update could not activate. Editing is available again; try Update when ready.'); }
  finally { clearTimeout(timer); waitingReplies.delete(requestId); }
}
self.addEventListener('message', event => {
  if (event.data?.type === 'HOLE_ACTIVATE_REQUEST') { event.waitUntil(requestActivation(event)); return; }
  if (event.data?.type === 'HOLE_UPDATE_READY') {
    const pending = waitingReplies.get(event.data.requestId);
    if (!pending || !pending.ids.has(event.source?.id)) return;
    pending.responses.set(event.source.id, event.data.ready === true);
    if (event.data.ready !== true) pending.resolve(false);
    else if (pending.responses.size === pending.ids.size) pending.resolve(true);
  }
});
