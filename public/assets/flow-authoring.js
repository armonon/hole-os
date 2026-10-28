/* Isolated Flow author/review surface. Mount callbacks receive pinned references. */
(() => {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const observers = new WeakMap();
  function stopWatching(container) { observers.get(container)?.(); observers.delete(container); }
  function node(tag, text, className) { const value = document.createElement(tag); if (text) value.textContent = text; if (className) value.className = className; return value; }
  function button(text, run) { const value = node('button', text); value.type = 'button'; value.onclick = run; return value; }
  function label(text, control) { control.setAttribute('aria-label', text); const wrap = node('label', text); wrap.append(control); return wrap; }
  function option(select, value, text) { const item = node('option', text); item.value = value; select.append(item); }
  async function mount(container, options = {}) {
    stopWatching(container);
    const A = globalThis.HoleActions, C = globalThis.HoleCore; await C.ready;
    let recipe = clone(options.recipe || { name: 'Prepare a release', steps: [{ id: 'step-1', actionId: 'release.asset-pack', parameters: { focalPoint: { x: .5, y: .5 }, format: 'png', allowUpscale: false } }] });
    let plan = null, runId = null, disposed = false, busy = false;
    const root = node('section', '', 'hole-flow'), editor = node('div'), review = node('div'), results = node('div'), message = node('p');
    message.setAttribute('role', 'status'); root.append(node('h2', 'Make a Flow'), editor, review, message, results); container.replaceChildren(root);
    const assets = (await C.list('assets')).filter(item => item.state === 'active');
    const original = node('select'), audio = node('select'); option(audio, '', 'No audio');
    for (const asset of assets) { option(original, asset.id, asset.name); if (asset.mime?.startsWith('audio/')) option(audio, asset.id, asset.name); }
    if (options.inputs?.[0]) original.value = options.inputs[0].assetId;
    if (options.inputs?.[1]) audio.value = options.inputs[1].assetId;
    const invalidate = () => { plan = null; review.replaceChildren(); };
    original.onchange = audio.onchange = invalidate;
    const name = node('input'); name.value = recipe.name; name.oninput = () => { recipe.name = name.value; invalidate(); };
    const steps = node('div');
    editor.append(label('Flow name', name), label('Original material / artwork', original), label('Original audio for Release Packs', audio), steps);
    async function safely(work) { try { await work(); } catch (cause) { message.textContent = cause.message; } }
    function fields(schema, values, host, prefix = '') {
      for (const [key, property] of Object.entries(schema.properties || {})) {
        if (property.type === 'object') {
          const group = node('fieldset'); group.append(node('legend', key));
          // Optional crop rectangles are supplied only when explicitly edited.
          const nested = values[key] || {}; fields(property, nested, group, `${prefix}${key}.`);
          group.addEventListener('change', () => { values[key] = nested; invalidate(); }); host.append(group); continue;
        }
        let control;
        if (property.enum) { control = node('select'); for (const value of property.enum) option(control, value, value); }
        else { control = node(property.type === 'string' && key === 'text' ? 'textarea' : 'input'); control.type = property.type === 'boolean' ? 'checkbox' : ['number', 'integer'].includes(property.type) ? 'number' : 'text'; }
        if (property.minimum != null) control.min = property.minimum;
        if (property.maximum != null) control.max = property.maximum;
        if (control.type === 'number') control.step = property.type === 'integer' ? '1' : 'any';
        if (property.type === 'boolean') control.checked = values[key] === true;
        else control.value = values[key] ?? property.default ?? '';
        control.onchange = () => { if (property.type === 'boolean') values[key] = control.checked; else if (control.value === '') delete values[key]; else values[key] = ['number', 'integer'].includes(property.type) ? Number(control.value) : control.value; invalidate(); };
        host.append(label(`${prefix}${key}${schema.required?.includes(key) ? ' (required)' : ''}`, control));
      }
    }
    function drawSteps() {
      steps.replaceChildren();
      recipe.steps.forEach((step, index) => {
        const group = node('fieldset'); group.append(node('legend', `Step ${index + 1}`));
        const action = node('select'); for (const item of A.list().filter(item => item.available)) option(action, item.id, item.label); action.value = step.actionId;
        action.onchange = () => { step.actionId = action.value; step.parameters = action.value === 'release.asset-pack' ? { focalPoint: { x: .5, y: .5 } } : {}; invalidate(); drawSteps(); };
        const from = node('select'); option(from, 'inputs', 'Original material'); option(from, 'audio', 'Original audio'); for (const previous of recipe.steps.slice(0, index)) option(from, previous.id, `Result of ${previous.id}`);
        from.value = step.inputIndex === 1 ? 'audio' : step.from || 'inputs'; from.onchange = () => { step.from = from.value === 'audio' ? 'inputs' : from.value; step.inputIndex = from.value === 'audio' ? 1 : 0; invalidate(); drawSteps(); };
        group.append(label('Action', action), label('Use', from));
        if (step.from && step.from !== 'inputs') { const output = node('input'); output.type = 'number'; output.min = '0'; output.max = '3'; output.value = step.outputIndex || 0; output.onchange = () => { step.outputIndex = Number(output.value); invalidate(); }; group.append(label('Previous output (0 = first, 3 = Release ZIP)', output)); }
        fields(A.get(step.actionId).parameterSchema, step.parameters, group);
        group.append(button('Remove step', () => { recipe.steps.splice(index, 1); invalidate(); drawSteps(); })); steps.append(group);
      });
    }
    editor.append(button('Add step', () => { if (recipe.steps.length >= 20) return; let id; do { id = `step-${Math.random().toString(36).slice(2, 10)}`; } while (recipe.steps.some(step => step.id === id)); recipe.steps.push({ id, actionId: 'image.convert', from: recipe.steps.at(-1)?.id || 'inputs', parameters: { format: 'png' } }); invalidate(); drawSteps(); }), button('Save recipe', () => safely(async () => { recipe = await A.saveRecipe(recipe); message.textContent = 'Recipe saved. It can be reopened from Actions.'; })), button('Review Flow', () => safely(async () => {
      const inputs = [];
      for (const assetId of [original.value, audio.value].filter(Boolean)) { const selected = options.inputs?.find(ref => ref.assetId === assetId); const item = await C.readAsset(assetId, selected?.versionId); inputs.push({ assetId, versionId: item.version.id }); }
      plan = await A.previewFlow(recipe, { inputs, projectId: options.projectId }); review.replaceChildren(node('h3', 'Review before running'));
      for (const step of plan.steps) {
        const item = node('div', `${step.id}: ${step.action.label} · ${step.inputDescription}`); review.append(item);
        for (const output of step.preview?.outputs || []) item.append(node('p', `${output.name} · ${output.width ? `${output.width} × ${output.height} · ` : ''}${output.mime}${output.contains ? ` · ${output.contains}` : ''}`));
        for (const warning of step.preview?.warnings || []) item.append(node('p', warning));
        item.append(node('pre', JSON.stringify(step.parameters || {}, null, 2)));
      }
      const execute = button('Run reviewed Flow', () => safely(async () => { if (!plan || busy) return; busy = true; editor.inert = true; execute.disabled = true; const task = A.runFlow(plan.recipe, { inputs: plan.inputs, projectId: plan.projectId }); runId = task.runId; message.textContent = 'Running. Each completed step is saved.'; const progress = event => { if (event.detail.runId === runId) message.textContent = event.detail.stepId ? `Saved ${event.detail.index + 1} of ${event.detail.count} steps.` : `Flow ${event.detail.status}.`; }; globalThis.addEventListener?.('hole:flow-progress', progress); try { await task; } catch (cause) { message.textContent = cause.message; } finally { globalThis.removeEventListener?.('hole:flow-progress', progress); busy = false; editor.inert = false; if (!disposed) await mountRun(results, runId, options); } }));
      execute.disabled = plan.steps.some(step => step.preview?.requiresUpscaleConsent); review.append(execute, button('Cancel run', () => safely(async () => { if (runId) await A.cancelFlow(runId); })));
    })));
    drawSteps();
    return { dispose() { disposed = true; }, getRunId: () => runId };
  }
  async function mountRun(container, runId, options = {}) {
    stopWatching(container);
    const C = globalThis.HoleCore, A = globalThis.HoleActions; const run = await C.get('runs', runId);
    if (!run) throw new Error('This Flow run was not found.');
    const root = node('section', '', 'hole-flow'), status = node('p', `${run.recipeSnapshot.name}: ${run.status}`); status.setAttribute('role', 'status'); root.append(status);
    for (const step of run.stepStates) root.append(node('p', `${step.id}: ${step.status}${step.error ? ` — ${step.error.message}` : ''}`));
    if (['failed', 'cancelled', 'interrupted'].includes(run.status)) root.append(button('Retry unfinished steps', async () => { try { await A.retryFlow(runId); } catch (cause) { status.textContent = cause.message; } await mountRun(container, runId, options); }));
    if (['running', 'queued'].includes(run.status)) root.append(button('Cancel Flow', async () => { await A.cancelFlow(runId); await mountRun(container, runId, options); }));
    for (const reference of run.outputs || []) {
      const item = await C.readAsset(reference.assetId, reference.versionId), row = node('div', item.asset.name, 'hole-flow-output');
      if (options.onOpen) row.append(button('Open', () => options.onOpen(reference)));
      if (options.onCarry) row.append(button('Keep in Carry', () => options.onCarry(reference)));
      if (options.onPublish) row.append(button('Review in Publish', () => options.onPublish(reference)));
      row.append(button('Use in another Flow', () => mount(container, { ...options, inputs: [reference] })), button('Export file', () => { const url = URL.createObjectURL(item.blob), link = node('a'); link.href = url; link.download = item.asset.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })); root.append(row);
    }
    container.replaceChildren(root);
    if (['running', 'queued'].includes(run.status) && globalThis.addEventListener) {
      const refresh = event => { if (event.detail.runId === runId) { stopWatching(container); mountRun(container, runId, options).catch(cause => { status.textContent = cause.message; }); } };
      globalThis.addEventListener('hole:flow-progress', refresh); observers.set(container, () => globalThis.removeEventListener('hole:flow-progress', refresh));
    }
    return run;
  }
  globalThis.HoleFlowUI = Object.freeze({ mount, mountRun });
})();
