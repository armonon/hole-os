/* Explicit, scoped optional memory. No inferred observations or provider calls. */
(() => {
  'use strict';
  const failure = (message, code = 'INVALID_MEMORY') => Object.assign(new Error(message), { code });
  function create(core, { now = () => Date.now() } = {}) {
    async function scope(projectId) { await core.ready; const project = await core.get('projects', projectId); if (!project) throw failure('Choose an existing project for this memory.', 'NOT_FOUND'); return project; }
    async function policy(projectId) { await scope(projectId); return await core.get('settings', `memory-policy:${projectId}`) || { id: `memory-policy:${projectId}`, projectId, enabled: false }; }
    async function setEnabled(projectId, enabled) { if (typeof enabled !== 'boolean') throw failure('Choose whether memory is enabled.'); const old = await policy(projectId); return core.put('settings', { ...old, enabled, changedBy: 'user' }, old.revision ? { expectedRevision: old.revision } : {}); }
    async function checkSources(project, sources) {
      if (!Array.isArray(sources) || sources.length < 1 || sources.length > 8) throw failure('Choose one to eight source versions.');
      return Promise.all(sources.map(async reference => {
        if (!reference?.assetId || !reference.versionId) throw failure('Memory sources must name an exact saved version.');
        const item = await core.readAsset(reference.assetId, reference.versionId);
        if (item.asset.state !== 'active' || (item.asset.projectId !== project.id && !project.assetIds?.includes(item.asset.id))) throw failure('Each source must be an active file in this project.', 'OUT_OF_SCOPE');
        return { assetId: item.asset.id, versionId: item.version.id };
      }));
    }
    async function save(value, { expectedRevision } = {}) {
      const project = await scope(value.projectId), permission = await policy(project.id);
      if (!permission.enabled) throw failure('Enable optional memory for this project before saving.', 'MEMORY_DISABLED');
      if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 4000) throw failure('Write a thought from 1 to 4,000 characters.');
      if (!Number.isInteger(value.retentionDays) || value.retentionDays < 1 || value.retentionDays > 365) throw failure('Retention must be 1 to 365 days.');
      const old = value.id ? await core.get('memory', value.id) : null;
      if (value.id && !old) throw failure('Memory was not found.', 'NOT_FOUND');
      if (old && old.projectId !== project.id) throw failure('A memory cannot silently move to another project.', 'OUT_OF_SCOPE');
      const sources = await checkSources(project, value.sources);
      const expiresAt = old && value.retentionDays === old.retentionDays ? old.expiresAt : now() + value.retentionDays * 86400000;
      return core.put('memory', { ...(old || {}), id: old?.id || `memory-${crypto.randomUUID()}`, schema: 'hole.memory/1', projectId: project.id, scopeId: project.id, text: value.text.trim(), sources, retentionDays: value.retentionDays, expiresAt, excluded: value.excluded === true, syncAllowed: value.syncAllowed === true, consent: 'explicit', provenance: { kind: 'user-authored', correctedAt: now() } }, old ? { expectedRevision } : {});
    }
    async function list(projectId) { await scope(projectId); return (await core.list('memory')).filter(item => item.schema === 'hole.memory/1' && item.projectId === projectId).map(item => ({ ...item, expired: item.expiresAt <= now() })); }
    async function recall(projectId) {
      if (!(await policy(projectId)).enabled) return [];
      const project = await scope(projectId), records = await list(projectId), results = [];
      for (const item of records.filter(item => !item.excluded && !item.expired)) { try { await checkSources(project, item.sources); results.push(item); } catch (cause) { if (!['NOT_FOUND', 'OUT_OF_SCOPE'].includes(cause.code)) throw cause; } }
      return results;
    }
    async function exclude(id, excluded, expectedRevision) { const old = await core.get('memory', id); if (!old || old.schema !== 'hole.memory/1') throw failure('Memory was not found.', 'NOT_FOUND'); if (typeof excluded !== 'boolean') throw failure('Choose whether to exclude this memory.'); return core.put('memory', { ...old, excluded }, { expectedRevision }); }
    async function forget(id, expectedRevision) { const old = await core.get('memory', id); if (!old || old.schema !== 'hole.memory/1') throw failure('Memory was not found.', 'NOT_FOUND'); return core.deleteRecord('memory', id, { expectedRevision }); }
    async function exportScope(projectId) { return new Blob([JSON.stringify({ schema: 'hole.memory-export/1', exportedAt: now(), policy: await policy(projectId), memories: await list(projectId) }, null, 2)], { type: 'application/json' }); }
    return Object.freeze({ policy, setEnabled, save, list, recall, exclude, forget, exportScope });
  }
  function element(tag, text) { const node = document.createElement(tag); if (text) node.textContent = text; return node; }
  function labelled(text, control) { const label = element('label', text); label.append(control); return label; }
  async function mount(container, { core = globalThis.HoleCore, projectId, onSource } = {}) {
    const api = create(core); await core.ready;
    const root = element('section'), heading = element('h2', 'Optional project memory'), status = element('p'), body = element('div'), scope = element('select'); root.className = 'hole-memory';status.setAttribute('role', 'status');scope.setAttribute('aria-label', 'Memory project');
    for (const project of await core.list('projects')) { const option = element('option', project.name || project.id); option.value = project.id; scope.append(option); }
    if (projectId) scope.value = projectId;
    root.append(heading, element('p', 'Keep a next thought with its exact source versions. Memory is off until you enable it for a project. Nothing is inferred automatically. Expired memories are excluded from recall and remain inspectable until you forget them.'), scope, status, body);container.replaceChildren(root);
    const action = (text, callback) => { const button = element('button', text); button.type = 'button'; button.onclick = async () => { button.disabled = true; try { await callback(); } catch (cause) { status.textContent = cause.message; } finally { button.disabled = false; } }; return button; };
    const download = (blob, name) => { const url = URL.createObjectURL(blob), link = element('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    async function draw() {
      if (!scope.value) { body.replaceChildren(element('p', 'Create a project to keep scoped memory.')); return; }
      const selected = scope.value, policy = await api.policy(selected), records = await api.list(selected);body.replaceChildren();
      body.append(element('p', policy.enabled ? 'Enabled for this project' : 'Off for this project'), action(policy.enabled ? 'Turn memory off' : 'Enable memory for this project', async () => { await api.setEnabled(selected, !policy.enabled); await draw(); }), action('Export this project’s memory', async () => download(await api.exportScope(selected), 'project-memory.json')));
      const editor = element('div');body.append(editor);
      async function edit(old = null) {
        editor.replaceChildren();const text = element('textarea'), days = element('input'), source = element('select'), share = element('input');text.value = old?.text || '';text.maxLength = 4000;days.type = 'number';days.min = '1';days.max = '365';days.value = String(old?.retentionDays || 30);share.type = 'checkbox';share.checked = old?.syncAllowed === true;
        source.multiple = true;source.size = 5;source.setAttribute('aria-label', 'Exact source versions');
        const project = await core.get('projects', selected), choices = [];
        for (const asset of (await core.list('assets')).filter(item => item.state === 'active' && (item.projectId === selected || project.assetIds?.includes(item.id)))) {
          const reference = old?.sources.find(ref => ref.assetId === asset.id) || { assetId: asset.id, versionId: asset.headVersionId };choices.push(reference);const option = element('option', `${asset.name} · ${reference.versionId}`);option.value = String(choices.length - 1);option.selected = !!old?.sources.some(ref => ref.assetId === asset.id);source.append(option);
        }
        editor.append(labelled('Next thought', text), labelled('Retention in days (edits keep the original expiry unless this changes)', days), source, labelled('Allow this memory in an explicitly selected Relay sync', share), action(old ? 'Save correction' : 'Save thought', async () => { const references = Array.from(source.selectedOptions).map(option => choices[Number(option.value)]);await api.save({ ...(old || {}), projectId: selected, text: text.value, retentionDays: Number(days.value), sources: references, syncAllowed: share.checked }, old ? { expectedRevision: old.revision } : {});status.textContent = 'Memory saved locally.';await draw(); }));
      }
      if (policy.enabled) body.append(action('Add a next thought', () => edit()));
      for (const item of records) {
        const card = element('article');card.append(element('p', item.text), element('p', `${item.expired ? 'Expired — unused' : item.excluded ? 'Excluded — unused' : policy.enabled ? 'Available in this project' : 'Inactive while memory is off'} · expires ${new Date(item.expiresAt).toLocaleString()} · ${item.provenance.kind} · Relay ${item.syncAllowed ? 'permitted when explicitly selected' : 'not permitted'}`));
        for (const ref of item.sources) card.append(onSource ? action(`Inspect source ${ref.versionId}`, () => onSource(ref)) : element('p', `Source ${ref.assetId} · version ${ref.versionId}`));
        if (policy.enabled) card.append(action('Correct', () => edit(item)));
        card.append(action(item.excluded ? 'Include again' : 'Exclude from recall', async () => { await api.exclude(item.id, !item.excluded, item.revision);await draw(); }), action('Forget this memory', async () => { await api.forget(item.id, item.revision);status.textContent = 'Memory removed. Its source files remain in the project.';await draw(); }));body.append(card);
      }
    }
    scope.onchange = () => draw().catch(cause => { status.textContent = cause.message; });await draw();return { api, refresh: draw };
  }
  globalThis.HoleMemory = Object.freeze({ create });globalThis.HoleMemoryUI = Object.freeze({ mount });
})();
