/* Real Relay service client. Authentication stays in memory/HttpOnly cookies;
 * queued workspace changes use Core and are acknowledged only by the service. */
(() => {
  'use strict';
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const preferenceKeys = new Set(['theme', 'reducedMotion', 'language', 'fontScale']);
  function selectedRecord(kind, record, { remoteId, expectedRevision, references = [], permitMemory = false } = {}) {
    if (!record || !remoteId) throw fail('INVALID_SELECTION', 'Choose a durable record and remote identity.');
    let value, type;
    if (kind === 'preference') {
      if (!preferenceKeys.has(record.id)) throw fail('LOCAL_ONLY', 'This setting is device-local or is not approved for synchronization.');
      type = 'preference'; value = { key: record.id, value: record.value };
    } else if (kind === 'workspace') {
      type = 'workspace'; value = { name: String(record.name || 'Workspace'), description: String(record.description || '') };
    } else if (kind === 'memory') {
      if (!permitMemory || record.syncAllowed !== true || record.consent !== 'explicit' || record.excluded || record.forgotten || record.expiresAt && record.expiresAt <= Date.now()) throw fail('MEMORY_PERMISSION', 'Select permitted, unexpired memory explicitly before sending it.');
      type = 'memory'; value = { text: String(record.text || ''), scope: record.scope || 'project', provenance: record.provenance || null, consent: 'explicit', syncAllowed: true, sources: record.sources || [], expiresAt: record.expiresAt || null, permitted: true };
    } else throw fail('LOCAL_ONLY', 'Unsupported local data stays on this device.');
    return { id: remoteId, type, value, visibility: 'private', references, ...(expectedRevision !== undefined ? { expectedRevision } : {}) };
  }
  function createClient({ endpoint, deviceId, fetch: requestFetch = globalThis.fetch.bind(globalThis), loadQueue, saveQueue, validateQueued } = {}) {
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
        const data = await read(projectId), candidates = data.items.filter(item => item.ownerId === actorId && item.status === 'pending').slice(0, 100), items = [];
        for (const item of candidates) {
          try { if (validateQueued) await validateQueued(structuredClone(item)); items.push(item); }
          catch (error) { item.status = 'failed'; item.error = { code: error.code || 'LOCAL_PERMISSION', message: error.message }; }
        }
        if (items.length !== candidates.length) await saveQueue(projectId, data);
        if (!items.length) return { results: [] };
        if (me?.id !== actorId) throw fail('ACCOUNT_CHANGED', 'The account changed while preparing sync. The original account’s queue remains local.');
        // On network/auth failure the durable pending items remain intact.
        let result;
        try { result = await request('/sync', { method: 'POST', body: { projectId, deviceId, changes: items.map(item => item.change) } }); }
        catch (error) { for (const item of items) item.lastError = { code: error.code || 'NETWORK', message: error.message, at: Date.now() }; await saveQueue(projectId, data); throw error; }
        for (const receipt of result.results) {
          const item = data.items.find(value => value.ownerId === actorId && value.change.id === receipt.id);
          if (item) Object.assign(item, { status: receipt.status, result: receipt.result || null, error: receipt.error || null, lastError: null, acknowledgedAt: Date.now() });
        }
        await saveQueue(projectId, data); return result;
      });
    }
    async function review(projectId, changeId) {
      const item = (await read(projectId)).items.find(item => item.ownerId === me?.id && item.change.id === changeId);
      if (!item) throw fail('NOT_FOUND', 'This queued change is unavailable for this account.');
      const snapshot = await request(`/sync?projectId=${encodeURIComponent(projectId)}`);
      const current = item.change.type.startsWith('record.') ? snapshot.records.find(record => record.id === item.change.data.id) : snapshot.assets.find(asset => asset.id === item.change.data.assetId);
      return { item: structuredClone(item), current: current || null, cursor: snapshot.cursor };
    }
    async function resolve(projectId, changeId, { decision, replacement } = {}) {
      const actorId = me?.id;
      if (!actorId) throw fail('UNAUTHENTICATED', 'Sign in before reviewing changes.');
      return serial(async () => {
        const data = await read(projectId), item = data.items.find(item => item.ownerId === actorId && item.change.id === changeId);
        if (!item || !['pending', 'conflict', 'failed'].includes(item.status)) throw fail('NOT_REVIEWABLE', 'This change is already acknowledged or resolved.');
        if (!['keep-remote', 'replace', 'retry'].includes(decision)) throw fail('INVALID_RESOLUTION', 'Choose an explicit resolution.');
        if (decision === 'retry') { item.status = 'pending'; item.lastError = null; }
        else {
          if (decision === 'replace') {
            if (!replacement?.id || replacement.id === changeId || data.items.some(other => other.ownerId === actorId && other.change.id === replacement.id)) throw fail('INVALID_RESOLUTION', 'A reviewed replacement needs a new unique change ID.');
            if (data.items.length >= 1000) throw fail('QUEUE_LIMIT', 'The queue is full.');
            data.items.push({ ownerId: actorId, change: structuredClone(replacement), metadata: { ...item.metadata, resolves: changeId }, status: 'pending', createdAt: Date.now() });
          }
          item.status = 'resolved'; item.resolution = { decision, replacementId: replacement?.id || null, at: Date.now() };
        }
        if (me?.id !== actorId) throw fail('ACCOUNT_CHANGED', 'The signed-in account changed.');
        await saveQueue(projectId, data); return structuredClone(item);
      });
    }
    return Object.freeze({
      endpoint, deviceId, request, queue, flush, review, resolve,
      register: input => identity('/accounts', input), signIn: input => identity('/sessions', input),
      session: async () => { const result = await request('/session'); me = result.user; return result; },
      signOut: async () => { try { return await request('/session', { method: 'DELETE' }); } finally { sessionToken = null; me = null; } },
      getUser: () => me ? structuredClone(me) : null,
      pull: projectId => request(`/sync?projectId=${encodeURIComponent(projectId)}`),
      readVersion: (assetId, versionId) => request(`/assets/${encodeURIComponent(assetId)}/versions/${encodeURIComponent(versionId)}`, { binary: true }),
      pending: async projectId => { const data = await read(projectId); return data.items.filter(item => item.ownerId === me?.id).map(item => structuredClone(item)); }
    });
  }
  globalThis.HoleRelayModel = Object.freeze({ createClient, selectedRecord });
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
      validateQueued: async item => {
        if (item.metadata?.kind !== 'memory') return;
        const record = await C.get('memory', item.metadata.localRecordId);
        if (!record || record.syncAllowed !== true || record.consent !== 'explicit' || record.excluded || record.forgotten || record.expiresAt && record.expiresAt <= Date.now()) throw fail('MEMORY_PERMISSION', 'Memory permission was removed or expired after queueing. The queued copy remains local for review.');
      },
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
    async function previewPublication(route, title = 'Shared selection preview') {
      const manifest = await connection.request(route);
      const dialog = ctx.modal(title, 'Only the explicitly selected versions below are included. New private versions are not added automatically. Downloaded copies cannot be recalled.');
      dialog.append(el('h3', '', manifest.name));
      for (const resource of manifest.resources) dialog.append(el('p', '', `${resource.name} · ${resource.mime} · ${resource.size} bytes · version ${resource.versionId}`), button('Download ' + resource.name, 'download', run(async () => {
        const blob = await connection.request(`${route}/assets/${encodeURIComponent(resource.assetId)}/versions/${encodeURIComponent(resource.versionId)}`, { binary: true });
        ctx.download(blob, resource.name);
      })));
      dialog.append(button('Close preview', 'x', () => dialog.close()));
    }
    async function discovery() {
      const worlds = await connection.request('/worlds');
      const dialog = ctx.modal('Public Worlds', 'These are deliberately published pinned selections on the connected service. Private projects are excluded.');
      for (const world of worlds.worlds) dialog.append(button(world.name, 'globe', run(() => previewPublication(`/worlds/${encodeURIComponent(world.id)}`, 'Public World preview'))));
      if (!worlds.worlds.length) dialog.append(el('p', '', 'No public Worlds are published on this service.'));
      dialog.append(button('Close discovery', 'x', () => dialog.close()));
    }
    async function showAccount() {
      accountArea.replaceChildren(); projectArea.replaceChildren();
      if (!connection) return;
      accountArea.append(button('Discover public Worlds', 'globe', run(discovery)));
      const guestToken = input('Guest preview token', 'password', '');
      accountArea.append(guestToken.wrap, button('Preview guest selection', 'eye', run(async () => { const token = guestToken.input.value.trim(); if (!token) throw fail('NO_TOKEN', 'Enter a guest preview token.'); await previewPublication(`/guest/${encodeURIComponent(token)}`, 'Guest selection preview'); guestToken.input.value = ''; })));
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
          const unresolved = pending.filter(item => !['committed', 'resolved'].includes(item.status));
          detail.append(el('p', 'muted', `${unresolved.length} pending or unresolved changes on this device.`));
          for (const item of unresolved) {
            detail.append(el('p', '', `${item.change.type}: ${item.status}${item.error || item.lastError ? ' — ' + (item.error || item.lastError).message : ''}`));
            detail.append(button('Review change', 'git-compare', run(async () => {
              const reviewed = await connection.review(remoteId, item.change.id);
              const dialog = ctx.modal('Review Relay change', 'Your original queued work is retained. Replacement writes can conflict again if remote work changes during review.');
              const local = el('pre', '', JSON.stringify({ ...reviewed.item.change.data, ...(reviewed.item.change.data.bytes !== undefined ? { bytes: `[Retained locally: ${Math.floor(reviewed.item.change.data.bytes.length * 3 / 4)} encoded file bytes]` } : {}) }, null, 2)), remote = el('pre', '', JSON.stringify(reviewed.current, null, 2));
              for (const panel of [local, remote]) { panel.style.whiteSpace = 'pre-wrap'; panel.style.overflowWrap = 'anywhere'; panel.style.maxHeight = '220px'; panel.style.overflow = 'auto'; }
              dialog.append(el('h3', '', 'Local queued work'), local, el('h3', '', 'Current permitted remote state'), remote);
              const finish = async options => { await connection.resolve(remoteId, item.change.id, options); dialog.close(); await showRemote(); };
              dialog.append(button('Keep remote; retain local history', 'check', run(() => finish({ decision: 'keep-remote' }))), button('Retry original request', 'refresh-cw', run(() => finish({ decision: 'retry' }))));
              if (reviewed.current && item.change.type.startsWith('record.')) {
                const edited = el('textarea', 'hc-input'); edited.setAttribute('aria-label', 'Reviewed record JSON'); edited.value = JSON.stringify(item.change.data.value || {}, null, 2); dialog.append(edited);
                dialog.append(button(item.change.type === 'record.delete' ? 'Confirm deletion of reviewed revision' : 'Queue reviewed record', 'save', run(async () => {
                  const data = { ...item.change.data, expectedRevision: reviewed.current.revision };
                  if (item.change.type === 'record.put') data.value = JSON.parse(edited.value);
                  await finish({ decision: 'replace', replacement: { id: `review:${crypto.randomUUID()}`, type: item.change.type, data } });
                })));
              }
              if (item.change.type === 'asset.commit') dialog.append(button('Preserve local bytes as a separate file', 'copy', run(() => finish({ decision: 'replace', replacement: { id: `branch:${crypto.randomUUID()}`, type: 'asset.create', data: { name: `${reviewed.current?.name || 'Recovered file'} · local copy`, bytes: item.change.data.bytes, mime: item.change.data.mime, operation: 'relay-conflict-copy' } } }))));
              if (reviewed.current && ['asset.trash', 'asset.restore', 'asset.metadata'].includes(item.change.type)) dialog.append(button('Queue recovery state for reviewed revision', 'save', run(() => finish({ decision: 'replace', replacement: { id: `review:${crypto.randomUUID()}`, type: item.change.type, data: { ...item.change.data, expectedRevision: reviewed.current.revision } } }))));
              dialog.append(button('Close review', 'x', () => dialog.close()));
            })));
          }
          detail.append(button('Send queued changes', 'refresh-cw', run(async () => { const sent = await connection.flush(remoteId); report(`${sent.results.filter(item => item.status === 'committed').length} changes acknowledged. Conflicts stay in the local queue.`); await showRemote(); })));
          const recordSelect = el('select', 'hc-input'); recordSelect.setAttribute('aria-label', 'Selected private record to sync');
          const choices = [];
          const actualPreferences = window.HoleWelcome?.preferences;
          if (actualPreferences) for (const [id, value] of [['theme', actualPreferences.theme], ['reducedMotion', actualPreferences.quiet]]) {
            choices.push({ kind: 'preference', record: { id, value } }); recordSelect.append(new Option(`preference: ${id} (current appearance)`, String(choices.length - 1)));
          }
          for (const [kind, table] of [['preference', 'settings'], ['workspace', 'spaces'], ['memory', 'memory']]) for (const record of await C.list(table)) {
            if (kind === 'memory' && (record.syncAllowed !== true || record.consent !== 'explicit' || record.excluded || record.forgotten || record.expiresAt && record.expiresAt <= Date.now())) continue;
            if (kind === 'preference' && (!preferenceKeys.has(record.id) || choices.some(choice => choice.kind === kind && choice.record.id === record.id))) continue;
            choices.push({ kind, record }); recordSelect.append(new Option(`${kind}: ${record.name || record.id}`, String(choices.length - 1)));
          }
          detail.append(el('p', 'muted', 'Select private preferences, workspace references, or permitted memory. Workspace names and selected authorized file references transfer; device layout, windows, credentials and file handles stay local.'), recordSelect);
          detail.append(button('Queue selected private record', 'upload', run(async () => {
            const choice = choices[Number(recordSelect.value)]; if (!choice) throw fail('NO_SELECTION', 'Choose a record first.');
            const remoteRecordId = `selected:${choice.kind}:${choice.record.id}`;
            const current = snapshot.records.find(record => record.id === remoteRecordId);
            const references = choice.kind === 'workspace' && fileSelect.value ? selection().flatMap(scope => scope.versionIds.map(versionId => ({ assetId: scope.assetId, versionId }))) : [];
            const data = selectedRecord(choice.kind, choice.record, { remoteId: remoteRecordId, expectedRevision: current?.revision, references, permitMemory: choice.kind === 'memory' });
            await connection.queue(remoteId, { id: `selected:${crypto.randomUUID()}`, type: 'record.put', data }, { kind: choice.kind, localRecordId: choice.record.id }); await showRemote(); report('Selected private record queued. Send queued changes to transfer it.');
          })));
          for (const record of snapshot.records.filter(record => !record.deleted && ['preference', 'workspace', 'memory'].includes(record.type))) detail.append(button(`Restore private ${record.type}: ${record.value.name || record.value.key || record.id}`, 'download', run(async () => {
            if (record.type === 'memory' && !ctx.navigation.projectId) throw fail('PROJECT_REQUIRED', 'Open Relay from the local project where you want to restore this memory, then select local sources in Memory before recall.');
            if (record.type === 'memory' && record.value.expiresAt && record.value.expiresAt <= Date.now()) throw fail('MEMORY_EXPIRED', 'This memory has expired and cannot be restored.');
            if (record.type === 'preference') {
              if (!preferenceKeys.has(record.value.key)) throw fail('LOCAL_ONLY', 'This preference is not approved.');
              await settings(record.value.key, record.value.value);
              if (window.HoleWelcome?.applyPreferences && ['theme', 'reducedMotion'].includes(record.value.key)) window.HoleWelcome.applyPreferences(record.value.key === 'theme' ? { theme: record.value.value } : { quiet: record.value.value });
            } else {
              const table = record.type === 'workspace' ? 'spaces' : 'memory';
              await C.put(table, { id: `relay-restored:${crypto.randomUUID()}`, ...(record.type === 'workspace' ? { name: String(record.value.name || 'Restored workspace'), description: String(record.value.description || '') } : { schema: 'hole.memory/1', text: String(record.value.text || ''), scopeId: ctx.navigation.projectId || 'personal', projectId: ctx.navigation.projectId || null, consent: 'explicit', syncAllowed: false, excluded: false, sources: [], expiresAt: record.value.expiresAt }), provenance: { relayRecordId: record.id, relayProjectId: remoteId, source: record.value.provenance || null }, relayReferences: record.references });
            }
            report('Selected record restored locally. Remote references remain explicit and require authorized file restoration.');
          })));
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
          if (snapshot.project.role !== 'owner') detail.append(button('Leave this shared project', 'log-out', run(async () => {
            const dialog = ctx.modal('Leave shared project?', 'You will lose service access. Files already downloaded remain on this device. Joining again requires another invitation.');
            dialog.append(button('Leave project', 'log-out', run(async () => { await connection.request(`/projects/${remoteId}/membership`, { method: 'DELETE' }); dialog.close(); selectedRemote = null; await showProjects(); report('You left the project. Existing local copies remain local.'); })), button('Cancel', 'x', () => dialog.close()));
          })));
          if (snapshot.project.role === 'owner') {
            const publicationName = input('Shared selection name', 'text', snapshot.project.name);
            detail.append(publicationName.wrap, el('p', 'muted', 'Audience choices: an invited viewer/editor gets selected versions; a guest token permits anyone holding it for 24 hours; a Public World appears in service discovery. Review your selection before publishing.'));
            for (const kind of ['guests', 'worlds']) detail.append(button(kind === 'guests' ? 'Review guest preview link' : 'Review public World publication', 'share', run(async () => {
              const resources = selection(), selected = snapshot.assets.flatMap(asset => asset.versions.map(version => ({ asset, version }))).filter(item => resources.some(scope => scope.assetId === item.asset.id && scope.versionIds.includes(item.version.id)));
              const dialog = ctx.modal(kind === 'guests' ? 'Create guest preview?' : 'Publish selected World?', kind === 'guests' ? 'Anyone with the new token can download exactly this selection for 24 hours. Creating it does not send the token to anyone.' : 'This selection will be publicly discoverable on the connected service. Confirm only if you intend to publish these bytes.');
              for (const item of selected) dialog.append(el('p', '', `${item.asset.name} · ${item.version.mime} · version ${item.version.id}`));
              dialog.append(button(kind === 'guests' ? 'Create guest token' : 'Publish selected versions', 'check', run(async () => {
                const created = await connection.request(`/projects/${remoteId}/${kind}`, { method: 'POST', body: { name: publicationName.input.value, resources, expectedRevision: snapshot.project.revision } });
                dialog.close();
                if (kind === 'guests') {
                  const result = ctx.modal('Guest token created', 'Shown once. Copy deliberately to the intended recipient. The service stores only its hash; use publication controls to revoke it.');
                  const code = el('pre', '', created.guestToken); code.style.overflowWrap = 'anywhere'; result.append(code, button('Preview this guest selection', 'eye', run(() => previewPublication(`/guest/${encodeURIComponent(created.guestToken)}`))), button('Done', 'check', () => result.close()));
                } else await previewPublication(`/worlds/${encodeURIComponent(created.id)}`, 'Published selection');
                await showRemote(); report(kind === 'guests' ? 'Guest token created; nothing was sent.' : 'Selected versions published on this service.');
              })), button('Cancel', 'x', () => dialog.close()));
            })));
            const publicationList = await connection.request(`/projects/${remoteId}/publications`);
            for (const publication of publicationList.publications) {
              detail.append(el('p', '', `${publication.name} · ${publication.kind === 'guests' ? 'guest token' : 'public World'} · ${publication.revoked ? 'revoked' : publication.expired ? 'expired' : 'active'}`));
              if (!publication.revoked) detail.append(button((publication.kind === 'guests' ? 'Revoke guest ' : 'Unpublish ') + publication.name, 'shield-off', run(async () => { await connection.request(`/projects/${remoteId}/${publication.kind}/${encodeURIComponent(publication.id)}`, { method: 'DELETE' }); await showRemote(); report('Service access removed. Previously downloaded copies cannot be recalled.'); })));
              if (publication.kind === 'worlds' && !publication.revoked) detail.append(button('Preview ' + publication.name, 'eye', run(() => previewPublication(`/worlds/${encodeURIComponent(publication.id)}`))));
            }
            for (const member of snapshot.project.members.filter(item => item.role !== 'owner')) {
              detail.append(button(`Review access for ${member.name}`, 'shield', run(async () => {
                const dialog = ctx.modal('Review member access', 'Choose a role and explicitly replace their file scope with the selected version. Private future versions remain excluded.');
                const currentScope = el('pre', '', JSON.stringify(member.resources || [], null, 2)); currentScope.style.whiteSpace = 'pre-wrap'; currentScope.style.overflowWrap = 'anywhere'; dialog.append(el('h3', '', 'Current explicit version scope'), currentScope);
                const memberRole = el('select', 'hc-input'); memberRole.setAttribute('aria-label', 'Member role'); memberRole.append(new Option('Viewer', 'viewer'), new Option('Editor', 'editor')); memberRole.value = member.role;
                dialog.append(memberRole, button('Apply role and selected version scope', 'check', run(async () => { await connection.request(`/projects/${remoteId}/members/${member.userId}`, { method: 'PATCH', body: { role: memberRole.value, resources: selection(), expectedRevision: snapshot.project.revision } }); dialog.close(); await showRemote(); report('Member role and version scope updated.'); })), button('Cancel', 'x', () => dialog.close()));
              })), button(`Transfer ownership to ${member.name}`, 'key', run(async () => {
                const dialog = ctx.modal('Transfer project ownership?', `${member.name} will control this project and all project assets. You become an editor with current versions and lose owner controls. Your private records remain private.`);
                dialog.append(button('Confirm ownership transfer', 'check', run(async () => { await connection.request(`/projects/${remoteId}/ownership`, { method: 'POST', body: { userId: member.userId, expectedRevision: snapshot.project.revision } }); dialog.close(); await showRemote(); report('Ownership transferred.'); })), button('Cancel', 'x', () => dialog.close()));
              })));
            }
            const recipient = input('Recipient account ID (optional)', 'text', ''), role = el('select', 'hc-input'); role.setAttribute('aria-label', 'Invitation role'); role.append(new Option('Viewer', 'viewer'), new Option('Editor', 'editor'));
            detail.append(recipient.wrap, role, button('Create invitation for selected version', 'user-plus', run(async () => {
              const latest = await connection.pull(remoteId);
              const invite = await connection.request(`/projects/${remoteId}/invitations`, { method: 'POST', body: { role: role.value, ...(recipient.input.value.trim() ? { recipientId: recipient.input.value.trim() } : {}), resources: selection(), expectedRevision: latest.project.revision } });
              const dialog = ctx.modal('Invitation ready', 'Share this token deliberately with the intended person. It expires after 24 hours and grants only the selected version.');
              const code = el('pre', '', invite.invitationToken); code.style.overflowWrap = 'anywhere'; dialog.append(code, button('Done', 'check', () => dialog.close()));
            })));
            for (const member of snapshot.project.members.filter(item => item.role !== 'owner')) detail.append(button(`Revoke ${member.name}`, 'user-minus', run(async () => { await connection.request(`/projects/${remoteId}/members/${member.userId}`, { method: 'PATCH', body: { revoke: true, expectedRevision: snapshot.project.revision } }); await showRemote(); report('Access revoked. Previously downloaded copies cannot be recalled.'); })));
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
