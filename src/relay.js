/* Real Relay service client. Authentication stays in memory/HttpOnly cookies;
 * queued workspace changes use Core and are acknowledged only by the service. */
(() => {
  'use strict';
  const fail = (code, message) => Object.assign(new Error(message), { code });
  function createClient({ endpoint, deviceId, fetch: requestFetch = globalThis.fetch.bind(globalThis), loadQueue, saveQueue } = {}) {
    const url = new URL(endpoint);
    if (url.origin !== endpoint || !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw fail('INVALID_ENDPOINT', 'Use an exact HTTPS or local service origin.');
    if (typeof loadQueue !== 'function' || typeof saveQueue !== 'function') throw fail('QUEUE_UNAVAILABLE', 'Relay requires a durable queue.');
    let sessionToken = null, me = null, work = Promise.resolve();
    const serial = action => { const next = work.then(action); work = next.catch(() => {}); return next; };
    async function request(route, { method = 'GET', body, binary = false } = {}) {
      const response = await requestFetch(endpoint + route, { method, credentials: 'include', cache: 'no-store', headers: { ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}), ...(method !== 'GET' ? { 'X-Hole-Client': '1' } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw fail(result.error?.code || 'SERVICE_ERROR', result.error?.message || 'The Relay service could not complete this request.'); }
      return binary ? response.blob() : response.json();
    }
    async function identity(route, input) { const result = await request(route, { method: 'POST', body: input }); sessionToken = result.sessionToken; me = result.user; const { sessionToken: ignored, ...safe } = result; return safe; }
    const read = async projectId => (await loadQueue(projectId)) || { items: [] };
    async function queue(projectId, change, metadata = {}) {
      if (!me) throw fail('UNAUTHENTICATED', 'Sign in before queueing a remote change.');
      const actorId = me.id;
      return serial(async () => {
        const data = await read(projectId), previous = data.items.find(item => item.ownerId === actorId && item.change.id === change.id);
        if (previous) { if (JSON.stringify(previous.change) !== JSON.stringify(change)) throw fail('QUEUE_CONFLICT', 'This queued ID already represents different work.'); return previous; }
        if (data.items.length >= 1000) throw fail('QUEUE_LIMIT', 'This device queue is full. Export and archive completed history before adding more.');
        const item = { ownerId: actorId, change: structuredClone(change), metadata: structuredClone(metadata), status: 'pending', createdAt: Date.now() };
        data.items.push(item); await saveQueue(projectId, data); return item;
      });
    }
    async function flush(projectId) {
      if (!me) throw fail('UNAUTHENTICATED', 'Sign in to send queued changes.');
      const actorId = me.id;
      return serial(async () => {
        const data = await read(projectId), items = data.items.filter(item => item.ownerId === actorId && item.status === 'pending').slice(0, 100);
        if (!items.length) return { results: [] };
        if (me?.id !== actorId) throw fail('ACCOUNT_CHANGED', 'The account changed while preparing sync. The original account’s queue remains local.');
        // On network/auth failure the durable pending items remain intact.
        const result = await request('/sync', { method: 'POST', body: { projectId, deviceId, changes: items.map(item => item.change) } });
        for (const receipt of result.results) {
          const item = data.items.find(value => value.ownerId === actorId && value.change.id === receipt.id);
          if (item) Object.assign(item, { status: receipt.status, result: receipt.result || null, error: receipt.error || null, acknowledgedAt: Date.now() });
        }
        await saveQueue(projectId, data); return result;
      });
    }
    return Object.freeze({
      endpoint, deviceId, request, queue, flush,
      register: input => identity('/accounts', input), signIn: input => identity('/sessions', input),
      session: async () => { const result = await request('/session'); me = result.user; return result; },
      signOut: async () => { try { return await request('/session', { method: 'DELETE' }); } finally { sessionToken = null; me = null; } },
      getUser: () => me ? structuredClone(me) : null,
      pull: projectId => request(`/sync?projectId=${encodeURIComponent(projectId)}`),
      readVersion: (assetId, versionId) => request(`/assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}`, { binary: true }),
      pending: async projectId => { const data = await read(projectId); return data.items.filter(item => item.ownerId === me?.id).map(item => structuredClone(item)); }
    });
  }
  globalThis.HoleRelayModel = Object.freeze({ createClient });
  if (typeof window === 'undefined') return;
  let connection = null, selectedRemote = null;
  const toBase64 = async blob => { const bytes = new Uint8Array(await blob.arrayBuffer()); let value = ''; for (let i = 0; i < bytes.length; i += 32768) value += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(value); };
  async function render(ctx) {
    const { C, main, el, button, input, section, status } = ctx;
    ctx.title('Connected work', 'Relay', 'Sync selected work through a real account service. Local files stay usable when the service is offline.');
    const statusBox = el('div', 'hc-subtitle', 'The public website has no account server configured. You can connect your own running local service.'); main.append(statusBox);
    const settings = async (id, value) => { const previous = await C.get('settings', id); return C.put('settings', { id, value }, previous ? { expectedRevision: previous.revision } : {}); };
    const saved = await C.get('settings', 'relay:endpoint');
    let device = (await C.get('settings', 'relay:device'))?.value;
    if (!device) { device = `device:${crypto.randomUUID()}`; await settings('relay:device', device); }
    const connectionSection = section('Service connection'), address = input('Service origin', 'url', connection?.endpoint || saved?.value || 'http://127.0.0.1:8787');
    connectionSection.append(address.wrap);
    const accountArea = el('div', 'hc-section'), projectArea = el('div', 'hc-section'); main.append(accountArea, projectArea);
    const report = (message, error = false) => { statusBox.replaceChildren(); status(message, error, statusBox); };
    const run = fn => async () => { try { await fn(); } catch (error) { report(error.message, true); } finally { ctx.H.icons(); } };
    const makeClient = endpoint => createClient({ endpoint, deviceId: device,
      loadQueue: async projectId => (await C.get('runs', `relay:${device}:${projectId}`))?.queue || { items: [] },
      saveQueue: async (projectId, queue) => { const id = `relay:${device}:${projectId}`, prior = await C.get('runs', id); await C.put('runs', { id, kind: 'relay-queue', projectId, queue }, prior ? { expectedRevision: prior.revision } : {}); }
    });
    connectionSection.append(button('Connect', 'plug', run(async () => {
      const candidate = makeClient(address.input.value.replace(/\/$/, ''));
      const health = await candidate.request('/health');
      if (health.service !== 'hole-relay') throw fail('WRONG_SERVICE', 'This address is not a Hole Relay service.');
      connection = candidate; await settings('relay:endpoint', candidate.endpoint);
      try { await candidate.session(); } catch (error) { if (error.code !== 'UNAUTHENTICATED') throw error; }
      report('Connected to ' + candidate.endpoint); await showAccount();
    })));
    async function showAccount() {
      accountArea.replaceChildren(); projectArea.replaceChildren();
      if (!connection) return;
      const user = connection.getUser();
      if (user) {
        accountArea.append(el('h3', '', `Signed in as ${user.name}`), el('p', 'muted', `Account ID: ${user.id}. Email is not verified by this local service.`), button('Sign out', 'log-out', run(async () => { await connection.signOut(); selectedRemote = null; await showAccount(); report('Signed out of the service. Your local files and queue remain on this device.'); })));
        await showProjects(); return;
      }
      const displayName = input('Name (for a new account)', 'text', ''), mail = input('Email', 'email', ''), pass = input('Password (12 characters or more)', 'password', '');
      pass.input.autocomplete = 'current-password';
      accountArea.append(el('h3', '', 'Your service account'), displayName.wrap, mail.wrap, pass.wrap);
      accountArea.append(button('Sign in', 'log-in', run(async () => { await connection.signIn({ email: mail.input.value, password: pass.input.value }); pass.input.value = ''; await showAccount(); report('Signed in.'); })));
      accountArea.append(button('Create account', 'user-plus', run(async () => {
        const result = await connection.register({ name: displayName.input.value, email: mail.input.value, password: pass.input.value }); pass.input.value = '';
        const dialog = ctx.modal('Save your recovery code', result.recoveryPolicy);
        const code = el('pre', '', result.recoveryCode); code.style.whiteSpace = 'pre-wrap'; code.style.overflowWrap = 'anywhere'; dialog.append(code, button('I saved my code', 'check', () => dialog.close()));
        await showAccount(); report('Account created. Keep the recovery code privately; it is shown once.');
      })));
      const recovery = input('Recovery code', 'password', ''); accountArea.append(recovery.wrap, button('Recover account', 'key-round', run(async () => {
        const result = await connection.request('/recovery', { method: 'POST', body: { email: mail.input.value, recoveryCode: recovery.input.value, password: pass.input.value } });
        recovery.input.value = ''; pass.input.value = '';
        const dialog = ctx.modal('Replacement recovery code', 'All previous sessions were signed out. Save this replacement privately, then sign in with your new password.');
        const code = el('pre', '', result.recoveryCode); code.style.overflowWrap = 'anywhere'; dialog.append(code, button('I saved my code', 'check', () => dialog.close()));
      })));
    }
    async function showProjects() {
      projectArea.replaceChildren();
      const result = await connection.request('/projects'), heading = el('h3', '', 'Remote projects'); projectArea.append(heading);
      const selector = el('select', 'hc-input'); selector.setAttribute('aria-label', 'Remote project');
      selector.append(new Option('Choose a remote project', ''));
      for (const project of result.projects) selector.append(new Option(`${project.name} · ${project.role}`, project.id));
      selector.value = selectedRemote || '';
      selector.addEventListener('change', () => { selectedRemote = selector.value || null; void showRemote(); });
      projectArea.append(selector);
      const projectName = input('New remote project name', 'text', 'My project'); projectArea.append(projectName.wrap, button('Create remote project', 'folder-plus', run(async () => {
        const project = await connection.request('/projects', { method: 'POST', body: { name: projectName.input.value } }); selectedRemote = project.id; await showProjects(); report('Created a private remote project.');
      })));
      const invitation = input('Invitation token', 'text', ''); projectArea.append(invitation.wrap, button('Accept invitation', 'mail-check', run(async () => {
        const project = await connection.request(`/invitations/${encodeURIComponent(invitation.input.value.trim())}/accept`, { method: 'POST' }); selectedRemote = project.id; invitation.input.value = ''; await showProjects(); report('Joined with the invitation’s explicit access.');
      })));
      const detail = el('div'); projectArea.append(detail);
      async function showRemote() {
        detail.replaceChildren(); if (!selectedRemote) return;
        try {
          const remoteId = selectedRemote, snapshot = await connection.pull(remoteId);
          if (selectedRemote !== remoteId) return;
          detail.append(el('h3', '', snapshot.project.name), el('p', 'muted', `${snapshot.assets.length} authorized files · ${snapshot.project.role}. Only selected versions are shared.`));
          const fileSelect = el('select', 'hc-input'); fileSelect.setAttribute('aria-label', 'Version to share');
          for (const asset of snapshot.assets) for (const version of asset.versions) fileSelect.append(new Option(`${asset.name} · ${version.id.slice(-8)}`, `${asset.id}|${version.id}`));
          detail.append(fileSelect);
          const selection = () => { const [assetId, versionId] = fileSelect.value.split('|'); if (!assetId || !versionId) throw fail('NO_FILE', 'Choose an uploaded version first.'); return [{ assetId, versionIds: [versionId] }]; };
          const pending = await connection.pending(remoteId);
          const unresolved = pending.filter(item => item.status !== 'committed');
          detail.append(el('p', 'muted', `${unresolved.length} pending or unresolved changes on this device.`));
          for (const item of unresolved) detail.append(el('p', '', `${item.change.type}: ${item.status}${item.error ? ' — ' + item.error.message : ''}`));
          detail.append(button('Send queued changes', 'refresh-cw', run(async () => { const sent = await connection.flush(remoteId); report(`${sent.results.filter(item => item.status === 'committed').length} changes acknowledged. Conflicts stay in the local queue.`); await showRemote(); })));
          const push = button('Upload this local project', 'upload', run(async () => {
            const localProject = ctx.navigation.projectId && await C.get('projects', ctx.navigation.projectId);
            if (!localProject) throw fail('NO_LOCAL_PROJECT', 'Open Relay from the local project you want to upload.');
            const completed = (await connection.pending(remoteId)).filter(item => item.status === 'committed' && item.metadata?.localAssetId);
            const mapping = new Map(completed.map(item => [item.metadata.localAssetId, item]));
            for (const assetId of localProject.assetIds || []) {
              const content = await C.readAsset(assetId); if (content.asset.state === 'trashed') continue;
              if (content.blob.size > 16 * 1024 * 1024) throw fail('UPLOAD_LIMIT', `${content.asset.name} exceeds the local service’s 16 MiB per-file limit.`);
              const prior = mapping.get(assetId); if (prior?.metadata.localVersionId === content.version.id) continue;
              const id = `upload:${assetId}:${content.version.id}`, bytes = await toBase64(content.blob);
              const data = prior ? { assetId: prior.result.assetId, baseVersionId: prior.result.versionId, bytes, mime: content.blob.type || 'application/octet-stream', operation: 'relay-upload' } : { name: content.asset.name, bytes, mime: content.blob.type || 'application/octet-stream', operation: 'relay-upload' };
              await connection.queue(remoteId, { id, type: prior ? 'asset.commit' : 'asset.create', data }, { localAssetId: assetId, localVersionId: content.version.id, localProjectId: localProject.id });
            }
            const sent = await connection.flush(remoteId); report(`${sent.results.filter(item => item.status === 'committed').length} files saved remotely. Unsent/conflicting work remains local.`); await showRemote();
          }));
          if (!['owner', 'editor'].includes(snapshot.project.role)) push.disabled = true;
          detail.append(push, button('Restore files into a new local project', 'download', run(async () => {
            const project = await C.put('projects', { id: `project:${crypto.randomUUID()}`, name: `${snapshot.project.name} · restored`, spaceId: ctx.navigation.spaceId || null, assetIds: [], provenance: { relayProjectId: remoteId } });
            let count = 0;
            for (const asset of snapshot.assets.filter(item => item.state !== 'trashed')) {
              let restored = null;
              for (const version of asset.versions) {
                const blob = await connection.readVersion(asset.id, version.id);
                if (!restored) restored = await C.importAsset({ name: asset.name, blob, projectId: project.id, spaceId: ctx.navigation.spaceId || null, provenance: { relay: { projectId: remoteId, assetId: asset.id, versionId: version.id } } });
                else restored = await C.commitAsset({ assetId: restored.asset.id, baseVersionId: restored.version.id, blob, operation: 'relay-restore', parameters: { remoteAssetId: asset.id, remoteVersionId: version.id, remoteParentVersionIds: version.parentVersionIds } });
              }
              count++;
            }
            report(`Restored ${count} files and their authorized versions into “${project.name}”. Device layout and unsupported app state were not transferred.`);
          })));
          if (snapshot.project.role === 'owner') {
            const recipient = input('Recipient account ID (optional)', 'text', ''), role = el('select', 'hc-input'); role.setAttribute('aria-label', 'Invitation role'); role.append(new Option('Viewer', 'viewer'), new Option('Editor', 'editor'));
            detail.append(recipient.wrap, role, button('Create invitation for selected version', 'user-plus', run(async () => {
              const latest = await connection.pull(remoteId);
              const invite = await connection.request(`/projects/${remoteId}/invitations`, { method: 'POST', body: { role: role.value, ...(recipient.input.value.trim() ? { recipientId: recipient.input.value.trim() } : {}), resources: selection(), expectedRevision: latest.project.revision } });
              const dialog = ctx.modal('Invitation ready', 'Share this token deliberately with the intended person. It expires after 24 hours and grants only the selected version.');
              const code = el('pre', '', invite.invitationToken); code.style.overflowWrap = 'anywhere'; dialog.append(code, button('Done', 'check', () => dialog.close()));
            })));
            for (const member of snapshot.project.members.filter(item => item.role !== 'owner')) detail.append(button(`Revoke ${member.name}`, 'user-minus', run(async () => { const latest = await connection.pull(remoteId); await connection.request(`/projects/${remoteId}/members/${member.userId}`, { method: 'PATCH', body: { revoke: true, expectedRevision: latest.project.revision } }); await showRemote(); report('Access revoked. Previously downloaded copies cannot be recalled.'); })));
          }
          detail.append(button('Share presence for 45 seconds', 'radio', run(async () => { await connection.request(`/projects/${remoteId}/presence`, { method: 'POST', body: { deviceId: device } }); const current = await connection.request(`/projects/${remoteId}/presence`); report(`Present now: ${current.people.map(person => person.name).join(', ')}. Presence expires without another heartbeat.`); })));
        } catch (error) { report(error.message, true); }
      }
      await showRemote();
    }
    if (connection) await showAccount();
  }
  window.HoleRelay = Object.freeze({ render });
})();
