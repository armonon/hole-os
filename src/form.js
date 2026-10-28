/* Bounded retained Form engine surface. Full studio remains a separate route. */
(() => {
  'use strict';
  const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
  const files = ['vendor/form/engine.js', 'bridge-client.js', 'form-adapter.js', 'form-editor.js'];
  let sources;
  function create({ core = globalThis.HoleCore, baseURL = new URL('./', document.currentScript?.src || new URL('/assets/form.js', location.href)), bridge } = {}) {
    const broker = bridge || HoleBridgeModel.createBridge({ core, host: window });
    return {
      async mount(instance, root) {
        if (!root || !instance.context.assetId || !instance.context.versionId) throw new Error('Form needs a mounted root and an explicitly selected resource version.');
        sources ||= Promise.all(files.map(async path => { const response = await fetch(new URL(path, baseURL)); if (!response.ok) throw new Error(`Form component unavailable: ${path}`); return response.text(); })).catch(error => { sources = null; throw error; });
        const [engine, sdk, adapter, editor] = await sources;
        const versionId = instance.editorState?.assetId === instance.context.assetId && instance.editorState?.versionId ? instance.editorState.versionId : instance.context.versionId;
        await core.readAsset(instance.context.assetId, versionId);
        const frame = document.createElement('iframe');
        frame.title = 'Form native scene and pattern editor'; frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'width:100%;height:640px;min-height:470px;border:0;background:#191d24'; root.append(frame);
        const mountedLoad = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        const connection = broker.prepareSandbox({ frame, instanceId: instance.id, projectId: instance.context.projectId, resources: [{ assetId: instance.context.assetId, versionId, operations: ['resource.read','resource.commit','resource.derive'] }], operations: ['resource.read','resource.commit','resource.derive','state.read','state.save', ...(instance.context.projectId ? ['project.kit'] : [])], ttlMs: 3600000 , render: bootstrap => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;color:#edf0f6;background:#191d24;margin:16px}button,input,select{font:inherit;padding:8px;margin:3px;border:1px solid #738196;border-radius:6px}input{width:70px}button{cursor:pointer}canvas{display:block;width:100%;height:280px;object-fit:contain;background:#303744}fieldset{margin:10px 0}p{overflow-wrap:anywhere}#kit{font-size:12px}</style><h2>Form · native project</h2><p>Native scene positions and Fabric pattern edits. Use the full Form studio for CAD, 3D modelling, cloth simulation and other tools.</p><p id="workspaces"></p><label>Project name <input id="name" style="width:190px"></label><button id="rename">Rename</button><section id="scene-controls"><h3>Scene position</h3><label>Object <select id="object"></select></label><label>X <input id="sx" type="number"></label><label>Y <input id="sy" type="number"></label><label>Z <input id="sz" type="number"></label><button id="move">Apply position</button></section><section id="fabric-controls"><h3>Fabric pattern</h3><label>Piece <select id="piece"></select></label><canvas width="380" height="340" aria-label="Native pattern outline" style="width:100%;height:auto;max-width:380px"></canvas><label>Point <input id="point" type="number" min="0" value="0"></label><label>X mm <input id="px" type="number"></label><label>Y mm <input id="py" type="number"></label><button id="apply-point">Apply point</button><label>Seam allowance mm <input id="allowance" type="number" min="0" max="1000"></label><button id="apply-allowance">Apply allowance</button><p id="evidence"></p><button id="pdf">Export tiled PDF</button><button id="dxf">Export DXF</button></section><button id="undo">Undo</button><button id="checkpoint">Keep recovery</button><button id="save">Save to Hole</button><p role="status" aria-live="polite">Connecting…</p><p id="kit"></p>` + script(`globalThis.HOLE_FORM_BOOTSTRAP=${JSON.stringify(bootstrap).replace(/</g,'\\u003c')};`) + script(engine) + script(sdk) + script(adapter) + script(editor) });
        await mountedLoad;
        return {
          frame, sessionId: connection.sessionId,
          revoke: () => broker.revoke(connection.sessionId, 'Resource access revoked; local recovery retained.'),
          serialize: async () => { const saved = await core.get('settings', `bridge-state:${instance.id}`); if (saved?.state?.busy) throw new Error('Wait for Form to finish its operation or retry its recovery checkpoint before closing.'); return { schema: 'hole.form-instance/1', assetId: instance.context.assetId, versionId: saved?.state?.binding?.versionId || versionId, checkpointId: `bridge-state:${instance.id}` }; },
          close: () => { broker.revoke(connection.sessionId, 'Editor closed; local recovery retained.'); frame.remove(); }
        };
      }
    };
  }
  globalThis.HoleForm = Object.freeze({ create });
})();
