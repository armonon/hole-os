/* Controlled sandbox entry. Uses the retained Studio engine, never a format imitation. */
(async () => {
  'use strict';
  if (document.readyState !== 'complete') await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  const status = document.querySelector('[role=status]'), controls = [...document.querySelectorAll('button,input,select')];
  const tell = text => { status.textContent = text; };
  let studio, adapter, revision, dirty = false;
  const client = HoleBridgeClient.createClient({ bootstrap: globalThis.HOLE_LUMA_BOOTSTRAP, hostWindow: parent });
  const checkpoint = async (busy = false) => {
    const recovery = dirty ? (await studio.exportRecoveryDocument()).blob : null;
    const result = await client.request('state.save', { state: { ...adapter.serialize(), dirty, busy }, recovery, ...(revision ? { expectedRevision: revision } : {}) });
    revision = result.revision;
  };
  const update = () => {
    const select = document.querySelector('#layer'), previous = select.value;
    select.replaceChildren(...studio.doc.layers.map(layer => { const option = document.createElement('option'); option.value = layer.id; option.textContent = layer.name; return option; }));
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    document.querySelector('#opacity').value = studio.doc.layers.find(layer => layer.id === select.value)?.opacity ?? 1;
    document.querySelector('#dimensions').textContent = `${studio.doc.width} × ${studio.doc.height}`;
  };
  async function run(action) {
    controls.forEach(control => { control.disabled = true; });
    try { await checkpoint(true); await action(); update(); } catch (error) { tell(`${error.message} Your work remains open; retry or keep this window open.`); }
    finally { controls.forEach(control => { control.disabled = false; }); }
  }
  controls.forEach(control => { control.disabled = true; });
  try {
    const grant = await client.ready, resource = grant.resources[0];
    studio = new LumaEngine.Studio(32, 32, document.querySelector('canvas'));
    adapter = HoleLumaAdapter.create({ studio, client });
    await adapter.openGranted(resource.assetId, resource.versionId);
    const saved = await client.request('state.read', {});
    revision = saved?.revision;
    if (saved?.recovery && saved.state.binding?.assetId === resource.assetId) {
      await adapter.restoreRecovery(saved.recovery); dirty = true; tell('Recovered local edits. Review and save to Hole.');
    } else tell('Opened from Hole. Crop or change a layer, then save.');
    if (grant.projectId) {
      const { kit } = await adapter.readKit();
      document.querySelector('#kit').textContent = `Project Kit: ${JSON.stringify(kit)}`;
    }
    update();
    document.querySelector('#layer').onchange = update;
    document.querySelector('#opacity').onchange = () => run(async () => {
      studio.setLayerProp(document.querySelector('#layer').value, 'opacity', Number(document.querySelector('#opacity').value), 'Hole layer opacity');
      dirty = true; await checkpoint(); tell('Layer edit recovered locally. Save to update the asset.');
    });
    document.querySelector('#crop').onclick = () => run(async () => {
      const values = ['x','y','width','height'].map(id => Number(document.getElementById(id).value));
      if (!values.every(Number.isInteger) || values[0] < 0 || values[1] < 0 || values[2] < 1 || values[3] < 1 || values[0]+values[2] > studio.doc.width || values[1]+values[3] > studio.doc.height) throw new Error('Crop must fit inside the image.');
      studio.cropRect(...values, 'Hole crop'); dirty = true; await checkpoint(); tell('Crop recovered locally. Save to update the asset.');
    });
    for (const name of ['undo', 'redo']) document.getElementById(name).onclick = () => run(async () => { studio[name](); dirty = true; await checkpoint(); tell('Edit recovered locally.'); });
    document.querySelector('#save').onclick = () => run(async () => {
      await checkpoint(true); tell('Saving; waiting for durable Hole acknowledgement…');
      const output = await adapter.saveBack(); dirty = false;
      await checkpoint(); tell(`Saved to Hole · ${output.versionId}. Original version retained.`);
    });
    document.querySelector('#checkpoint').onclick = () => run(async () => { await checkpoint(); tell('Recovery checkpoint saved locally.'); });
    // Exposed only inside the opaque child for reproducible browser qualification.
    globalThis.HoleLumaMounted = { studio, adapter, client, checkpoint, get dirty() { return dirty; } };
    controls.forEach(control => { control.disabled = false; });
  } catch (error) { tell(`Luma could not open: ${error.message}`); client.dispose(); studio?.dispose(); }
})();
