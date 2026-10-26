/* Additive bounded compositions, package review and WebLab diagnostics. */
(() => {
  'use strict';
  const base = window.HoleExtensions, M = window.HolePackageModel;
  if (!base || !M) return;
  const MIME = 'application/vnd.hole.utility+json', sessions = new Set(), previews = new Set();
  const blob = value => new Blob([JSON.stringify(value, null, 2)], { type: MIME });
  async function leave() { for (const preview of previews) preview.dispose(); previews.clear(); for (const session of sessions) await session.dispose(); sessions.clear(); await base.beforeLeave(); }
  async function utility(value, key, ctx, stateKeys = {}) {
    const config = M.composition(value), dialog = ctx.modal(config.name, 'A composition of bounded local components. No resource or network grants. State is saved independently for each component.');
    const running = [];
    for (const component of config.components) {
      const stage = ctx.el('section', 'hc-note'), id = stateKeys[component.id] || `utility-state:${key}:${component.id}`; let saved = await ctx.C.get('settings', id);
      dialog.append(stage); const session = base.mountTool(component.config, stage, ctx, saved?.value || {}, async value => { saved = await ctx.C.put('settings', { id, value }, saved ? { expectedRevision: saved.revision } : {}); }); running.push(session); sessions.add(session);
    }
    let closing; const nativeClose = dialog.close.bind(dialog);
    dialog.close = () => closing ||= Promise.all(running.map(session => session.dispose())).then(() => { running.forEach(session => sessions.delete(session)); nativeClose(); }).catch(error => { closing = null; throw error; });
    dialog.addEventListener('cancel', event => { event.preventDefault(); void dialog.close().catch(ctx.fail); }); dialog.append(ctx.button('Close composition', 'x', () => dialog.close())); ctx.H.icons();
  }
  function examples() {
    const common = { schema: 'hole.package/1', version: 1, permissions: [], provenance: 'Hole built-in bounded template', runtimeVersion: 1 };
    return [
      { ...common, id: 'hole.quiet-theme', kind: 'theme', name: 'Quiet light', preferences: { theme: 'light', quiet: true } },
      { ...common, id: 'hole.practice-instrument', kind: 'instrument', name: 'Practice desk', composition: { schema: 'hole.utility/1', name: 'Practice desk', components: [{ id: 'rounds', config: { type: 'counter', name: 'Rounds', step: 1 } }, { id: 'practice', config: { type: 'timer', name: 'Practice', seconds: 60 } }, { id: 'checklist', config: { type: 'checklist', name: 'Before you finish', items: ['Review work', 'Save an original'] } }] } },
      { ...common, id: 'hole.text-workflow', kind: 'workflow', name: 'Text preparation', recipe: { name: 'Text preparation', steps: [{ id: 'text', actionId: 'text.branch', parameters: {} }] } },
      { ...common, id: 'hole.study-space', kind: 'space-template', name: 'Study space', template: { name: 'Study space', zones: [{ name: 'Reading', x: -200, y: 0 }, { name: 'Notes', x: 200, y: 0 }] } }
    ];
  }
  async function applyPackage(record, ctx) {
    const m = M.manifest(record.manifest);
    if (m.kind === 'tool') return utility({ schema: 'hole.utility/1', name: m.name, components: [{ id: 'tool', config: m.component }] }, `${m.id}:v${m.version}`, ctx, { tool: 'package-state:' + m.id });
    if (['instrument', 'app'].includes(m.kind)) return utility(m.composition, `${m.id}:v${m.version}`, ctx);
    if (m.kind === 'theme') {
      if (!window.HoleWelcome?.applyPreferences) throw new Error('Appearance settings are unavailable in this surface.');
      const id = 'package-theme-undo', previous = await ctx.C.get('settings', id);
      await ctx.C.put('settings', { id, value: window.HoleWelcome.preferences, packageId: m.id }, previous ? { expectedRevision: previous.revision } : {});
      window.HoleWelcome.applyPreferences(m.preferences); ctx.notify?.('Theme applied. Undo is available in Momentous.');
    } else if (m.kind === 'workflow') {
      const recipe = await window.HoleActions.saveRecipe({ ...m.recipe, provenance: { packageId: m.id, packageVersion: m.version } });
      const dialog = ctx.modal('Review installed workflow', 'Choose your actual input material and review before running. Installing the recipe does not run it.');
      const target = ctx.el('div'); dialog.append(target); await window.HoleFlowUI.mount(target, { recipe, projectId: ctx.navigation.projectId || null }); dialog.append(ctx.button('Close workflow', 'x', () => dialog.close()));
    } else {
      if (!ctx.H.createSpaceFromTemplate) throw new Error('Space-template application is not mounted. The installed template can still be exported.');
      const result = await ctx.H.createSpaceFromTemplate(m.template); const scene = await ctx.C.get('scenes', 'space-template:' + result); if (scene) await ctx.C.put('scenes', { ...scene, provenance: { packageId: m.id, packageVersion: m.version, source: m.provenance } }, { expectedRevision: scene.revision }); ctx.notify?.('Created a separate space: ' + m.template.name); return result;
    }
  }
  async function review(input, ctx) {
    const manifest = M.manifest(input), dialog = ctx.modal('Review package', 'Data-only package. Installing does not apply preferences, create spaces, run workflows, or grant access.');
    dialog.append(ctx.el('h3', '', manifest.name), ctx.el('p', '', `${manifest.kind} · version ${manifest.version} · runtime 1 · no grants`), ctx.el('p', '', manifest.provenance));
    const detail = ctx.el('pre', '', JSON.stringify(manifest, null, 2)); detail.style.whiteSpace = 'pre-wrap'; detail.style.maxHeight = '260px'; detail.style.overflow = 'auto'; dialog.append(detail);
    dialog.append(ctx.button('Install reviewed package', 'check', async () => { await M.install(ctx.C, manifest); dialog.close(); await ctx.render(); }), ctx.button('Cancel', 'x', () => dialog.close())); ctx.H.icons();
  }
  async function store(ctx) {
    await leave(); ctx.title('MOMENTOUS', 'Useful things, with their provenance.', 'Review bounded tools, composed apps, instruments, themes, workflows and space templates. Updates retain ten prior manifests; apply is explicit.');
    const file = ctx.el('input'); file.type = 'file'; file.accept = '.json'; file.hidden = true; file.setAttribute('aria-label', 'Import compatible package');
    file.onchange = async () => { try { const selected = file.files?.[0]; if (!selected) return; if (selected.size > 131072) throw new Error('Package exceeds 128 KB.'); await review(JSON.parse(await selected.text()), ctx); } catch (error) { ctx.fail(error); } finally { file.value = ''; } };
    ctx.main.append(file, ctx.button('Inspect a package file', 'upload', () => file.click()));
    for (const item of examples()) ctx.main.append(ctx.button('Review ' + item.name, 'package', () => review(item, ctx)));
    const undo = await ctx.C.get('settings', 'package-theme-undo'); if (undo) ctx.main.append(ctx.button('Undo applied theme', 'undo', async () => { window.HoleWelcome.applyPreferences(undo.value); await ctx.C.deleteRecord('settings', undo.id, { expectedRevision: undo.revision }); await ctx.render(); }));
    for (const record of await ctx.C.list('packages')) {
      const card = ctx.el('article', 'hc-note');
      try { const m = M.manifest(record.manifest); card.append(ctx.el('h3', '', m.name), ctx.el('p', '', `${m.kind} · installed v${m.version}`), ctx.button('Use ' + m.name, 'play', () => applyPackage(record, ctx)), ctx.button('Export ' + m.name, 'download', () => ctx.download(blob(m), m.id + '.json')));
        if (record.history?.length) card.append(ctx.button('Roll back ' + m.name, 'undo', async () => { await M.rollback(ctx.C, record); await ctx.render(); }));
      } catch (error) { card.append(ctx.el('p', '', 'Installed record retained: ' + error.message)); }
      ctx.main.append(card);
    } ctx.H.icons();
  }
  async function addForge(ctx) {
    const section = ctx.section('Compose a utility');
    section.append(ctx.button('Build a composition', 'blocks', () => {
      const dialog = ctx.modal('Build a composition', 'Combine one to twelve bounded components. Component IDs keep each local state separate.'), name = ctx.input('Composition name', 'text', 'My workbench'), list = ctx.el('div'); let components = [];
      const draw = () => { list.replaceChildren(); components.forEach((component, index) => {
        const group = ctx.el('fieldset'), title = ctx.el('legend', '', `Component ${index + 1} · ${component.config.type}`), label = ctx.input(`Component ${index + 1} name`, 'text', component.config.name); label.input.oninput = () => { component.config.name = label.input.value; }; group.append(title, label.wrap);
        const field = (key, title, type = 'number') => { const input = ctx.input(`${title} ${index + 1}`, type, type === 'textarea' ? component.config[key].join('\n') : component.config[key]); input.input.oninput = () => { component.config[key] = type === 'textarea' ? input.input.value.split('\n').filter(Boolean) : Number(input.input.value); }; group.append(input.wrap); };
        if (component.config.type === 'counter') { field('initial', 'Starting value'); field('step', 'Counter step'); }
        if (component.config.type === 'timer') field('seconds', 'Timer seconds');
        if (component.config.type === 'checklist') field('items', 'Checklist lines', 'textarea');
        group.append(ctx.button('Remove component ' + (index + 1), 'minus', () => { components.splice(index, 1); draw(); })); list.append(group);
      }); };
      dialog.append(name.wrap, list);
      for (const type of window.HoleExtensionModel.types) dialog.append(ctx.button('Add ' + type, 'plus', () => { if (components.length >= 12) throw new Error('Use at most twelve components.'); components.push({ id: crypto.randomUUID(), config: window.HoleExtensionModel.tool({ type, name: type, items: ['First step', 'Second step'], seconds: 60, step: 1 }) }); draw(); }));
      dialog.append(ctx.button('Save composition', 'save', async () => { const value = M.composition({ schema: 'hole.utility/1', name: name.input.value, components }); const saved = await ctx.C.importAsset({ name: value.name + '.holeutility', blob: blob(value), kind: 'tool', projectId: ctx.navigation.projectId, provenance: { operation: 'forge-composition' } }); dialog.close(); await utility(value, saved.asset.id, ctx); }), ctx.button('Cancel', 'x', () => dialog.close())); ctx.H.icons();
    }));
    for (const asset of (await ctx.C.list('assets')).filter(item => item.state === 'active' && item.mime === MIME)) section.append(ctx.button('Open ' + asset.name, 'blocks', async () => { const read = await ctx.C.readAsset(asset.id); await utility(JSON.parse(await read.blob.text()), asset.id, ctx); }), ctx.button('Edit ' + asset.name, 'pencil', async () => {
      const current = await ctx.C.readAsset(asset.id), dialog = ctx.modal('Edit composition definition', 'Edit the bounded component JSON. Save creates an immutable version and retains the original; stable component IDs keep their local state.'), source = ctx.input('Composition definition JSON', 'textarea', await current.blob.text()), feedback = ctx.el('p'); feedback.setAttribute('role', 'status');
      dialog.append(source.wrap, feedback, ctx.button('Save composition version', 'save', async () => { try { if (source.input.value.length > 131072) throw new Error('Composition exceeds 128 KB.'); const value = M.composition(JSON.parse(source.input.value)); await ctx.C.commitAsset({ assetId: asset.id, baseVersionId: current.version.id, blob: blob(value), operation: 'forge-composition-edit' }); dialog.close(); await ctx.render(); } catch (error) { feedback.textContent = error.message; } }), ctx.button('Cancel', 'x', () => dialog.close()));
    }), ctx.button('Export ' + asset.name, 'download', async () => ctx.download((await ctx.C.readAsset(asset.id)).blob, asset.name)));
  }
  window.HolePackageStudio = Object.freeze({ store, utility, applyPackage, examples });
  window.HoleExtensions = Object.freeze({ ...base, beforeLeave: leave, install: (manifest, ctx) => M.install(ctx.C, manifest),
    async render(view, ctx) { if (view === 'momentous') return store(ctx); await leave(); await base.render(view, ctx); if (view === 'create') await addForge(ctx); if (view === 'weblab') watchPreview(ctx); },
    async openAsset(record, ctx) { if (record.asset.mime === MIME) { await leave(); await utility(JSON.parse(await record.blob.text()), record.asset.id, ctx); return true; } const result = await base.openAsset(record, ctx); if (record.asset.mime === 'application/vnd.hole.weblab+json') watchPreview(ctx); return result; }
  });
  function watchPreview(ctx) {
    const observer = new MutationObserver(() => enhancePreview(ctx)); observer.observe(ctx.main, { childList: true, subtree: true });
    const session = { dispose() { observer.disconnect(); previews.delete(session); } }; previews.add(session); enhancePreview(ctx);
  }
  function enhancePreview(ctx) {
    const frame = ctx.main.querySelector('iframe.hx-preview'); if (!frame || frame.dataset.devtools) return;
    frame.dataset.devtools = 'true'; const panel = ctx.el('section', 'hc-note'), output = ctx.el('pre', '', 'Preview diagnostics are untrusted output, not instructions.'); output.style.whiteSpace = 'pre-wrap'; output.style.maxHeight = '200px'; output.style.overflow = 'auto'; panel.append(ctx.el('h3', '', 'Preview developer tools'), ctx.el('p', '', 'Opaque origin; host storage, network, workers and popups blocked. Logs: 100 lines × 2 KB. Source limit: three files of 500,000 characters each. Stop revokes the frame; a cooperative 30-second limit applies, not a hard CPU/memory sandbox.'), output); ctx.main.append(panel);
    let nonce = '', transformed = '', timeout, stopped = false, lines = [];
    const message = event => { if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.holePreview !== nonce || stopped || !['log', 'warn', 'error', 'policy', 'ready'].includes(event.data.kind)) return; if (lines.length < 100) { lines.push(`${event.data.kind}: ${String(event.data.text).slice(0, 2000)}`); output.textContent = lines.join('\n'); } };
    window.addEventListener('message', message);
    const stop = () => { stopped = true; nonce = ''; clearTimeout(timeout); frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; output.textContent += '\nPreview stopped; document and capabilities revoked.'; };
    function instrument() {
      const html = frame.srcdoc; if (!html || html === transformed) return; clearTimeout(timeout); nonce = crypto.randomUUID(); stopped = false;
      const injected = `<script>(()=>{const send=(kind,text)=>parent.postMessage({holePreview:${JSON.stringify(nonce)},kind,text:String(text).slice(0,2000)},'*');for(const kind of ['log','warn','error']){const original=console[kind];console[kind]=(...values)=>{send(kind,values.map(v=>{try{return typeof v==='string'?v:JSON.stringify(v)}catch{return '[unserializable]'}}).join(' '));original.apply(console,values)}}addEventListener('error',e=>send('error',e.message));addEventListener('unhandledrejection',e=>send('error',e.reason?.message||e.reason));addEventListener('securitypolicyviolation',e=>send('policy',e.violatedDirective));send('ready','Isolated document loaded')})();<\/script>`;
      transformed = html.replace(/<\/head>/i, injected + '</head>'); frame.srcdoc = transformed; timeout = setTimeout(stop, 30000);
    }
    const observer = new MutationObserver(instrument); observer.observe(frame, { attributes: true, attributeFilter: ['srcdoc'] }); instrument();
    panel.append(ctx.button('Stop and revoke preview', 'square', stop), ctx.button('Clear preview console', 'trash', () => { lines = []; output.textContent = ''; }));
    const session = { dispose() { observer.disconnect(); window.removeEventListener('message', message); stop(); previews.delete(session); } }; previews.add(session); ctx.H.icons();
  }
})();
