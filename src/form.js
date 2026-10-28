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
        const connection = broker.prepareSandbox({ frame, instanceId: instance.id, projectId: instance.context.projectId, resources: [{ assetId: instance.context.assetId, versionId, operations: ['resource.read','resource.commit','resource.derive'] }], operations: ['resource.read','resource.commit','resource.derive','state.read','state.save', ...(instance.context.projectId ? ['project.kit'] : [])], ttlMs: 3600000 , render: bootstrap => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{font:14px system-ui;color:#edf0f6;background:#191d24;margin:16px}button,input,select{font:inherit;padding:8px;margin:3px;border:1px solid #738196;border-radius:6px}input{width:70px}button{cursor:pointer}canvas{display:block;width:100%;height:280px;object-fit:contain;background:#303744}fieldset{margin:10px 0;min-width:0}label{display:inline-flex;flex-wrap:wrap;max-width:100%;align-items:center;gap:4px}input,select,button{max-width:100%}p{overflow-wrap:anywhere}#kit{font-size:12px}</style>${globalThis.HoleDesign?.editorTheme?.() || ''}<h2>Form · native project</h2><p>Native scene positions and Fabric pattern edits. Use the full Form studio for CAD, 3D modelling, cloth simulation and other tools.</p><p id="workspaces"></p><label>Project name <input id="name" aria-label="Project name" maxlength="200" style="width:190px"></label><button id="rename">Rename</button><section id="scene-controls"><h3>Scene position</h3><label>Object <select id="object" aria-label="Object"></select></label><label>X <input id="sx" aria-label="X" type="text" inputmode="decimal" maxlength="32"></label><label>Y <input id="sy" aria-label="Y" type="text" inputmode="decimal" maxlength="32"></label><label>Z <input id="sz" aria-label="Z" type="text" inputmode="decimal" maxlength="32"></label><button id="move">Apply position</button><button id="discard-scene">Discard position fields</button></section><section id="fabric-controls"><h3>Fabric pattern</h3><label>Piece <select id="piece" aria-label="Piece"></select></label><canvas width="380" height="340" aria-label="Native pattern outline" style="width:100%;height:auto;max-width:380px"></canvas><label>Point <select id="point" aria-label="Point"></select></label><label>X mm <input id="px" aria-label="X mm" type="text" inputmode="decimal" maxlength="32"></label><label>Y mm <input id="py" aria-label="Y mm" type="text" inputmode="decimal" maxlength="32"></label><button id="apply-point">Apply point</button><label>Seam allowance mm <input id="allowance" aria-label="Seam allowance mm" type="text" inputmode="decimal" maxlength="32" min="0" max="1000"></label><button id="apply-allowance">Apply allowance</button><button id="discard-pattern">Discard pattern fields</button><p id="evidence"></p><fieldset><legend>Native seam binding</legend><label>Edge A piece <select id="seam-a" aria-label="Edge A piece"></select></label><label>Edge A index <input id="edge-a" aria-label="Edge A index" type="text" inputmode="numeric" maxlength="32" value="0"></label><label>Edge B piece <select id="seam-b" aria-label="Edge B piece"></select></label><label>Edge B index <input id="edge-b" aria-label="Edge B index" type="text" inputmode="numeric" maxlength="32" value="0"></label><label>Seam type <select id="seam-type" aria-label="Seam type"><option>plain</option><option>flat-felled</option><option>overlock</option><option>bound</option><option>zipper</option><option>elastic</option></select></label><button id="inspect-seam">Inspect seam lengths</button><button id="bind-seam">Bind selected edges</button><p id="seam-info"></p><label>Saved seam <select id="seam" aria-label="Saved seam"></select></label><button id="disable-seam">Disable selected seam</button><button id="remove-seam">Remove selected seam</button><p>DXF adds midpoint notches for enabled seams. Tiled PDF includes explicit pattern notches only; it does not synthesize seam marks. Neither export certifies fit or construction.</p></fieldset><button id="pdf">Export tiled PDF</button><button id="dxf">Export DXF</button></section><button id="undo">Undo</button><button id="checkpoint">Keep recovery</button><button id="save">Save to Hole</button><p role="status" aria-live="polite">Connecting…</p><p id="kit"></p>` + script(`globalThis.HOLE_FORM_BOOTSTRAP=${JSON.stringify(bootstrap).replace(/</g,'\\u003c')};`) + script(engine) + script(sdk) + script(adapter) + script(editor) });
        await mountedLoad;
        let pendingRecovery = false;
        const pendingMessage = event => {
          const data = event.data;
          if (event.source === frame.contentWindow && data?.kind === 'hole.form.pending' && data.nonce === connection.bootstrap.nonce && typeof data.pending === 'boolean') pendingRecovery = data.pending;
        };
        const protectUnload = event => { if (pendingRecovery) { event.preventDefault(); event.returnValue = ''; } };
        window.addEventListener('message', pendingMessage);
        window.addEventListener('beforeunload', protectUnload);
        const removeUnloadGuard = () => { window.removeEventListener('message', pendingMessage); window.removeEventListener('beforeunload', protectUnload); };
        function flushEditor() {
          return new Promise((resolve, reject) => {
            const id = crypto.randomUUID(), nonce = connection.bootstrap.nonce;
            const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); };
            const receive = event => {
              const data = event.data;
              if (event.source !== frame.contentWindow || data?.kind !== 'hole.form.flush' || data.id !== id || data.nonce !== nonce || !['complete', 'error'].includes(data.type)) return;
              cleanup();
              if (data.type === 'complete') resolve();
              else reject(new Error(String(data.message || 'Form recovery could not be saved. Retry before closing.').slice(0, 500)));
            };
            const timer = setTimeout(() => { cleanup(); reject(new Error('Form recovery did not acknowledge. Keep this window open and retry.')); }, 15000);
            window.addEventListener('message', receive);
            try { frame.contentWindow.postMessage({ kind: 'hole.form.flush', type: 'request', id, nonce }, '*'); }
            catch (error) { cleanup(); reject(error); }
          });
        }
        return {
          frame, sessionId: connection.sessionId,
          accessInfo: () => broker.accessInfo(connection.sessionId),
          renewAccess: async () => { await broker.renewExpiry(connection.sessionId,{ttlMs:3600000}); return broker.accessInfo(connection.sessionId); },
          revoke: () => broker.revoke(connection.sessionId, 'Resource access revoked; local recovery retained.'),
          serialize: async () => { await flushEditor(); const saved = await core.get('settings', `bridge-state:${instance.id}`); if (saved?.state?.busy) throw new Error('Wait for Form to finish its operation or retry its recovery checkpoint before closing.'); return { schema: 'hole.form-instance/1', assetId: instance.context.assetId, versionId: saved?.state?.binding?.versionId || versionId, checkpointId: `bridge-state:${instance.id}` }; },
          close: async () => { const wasInert=frame.inert; frame.inert=true; try { await flushEditor(); removeUnloadGuard(); broker.revoke(connection.sessionId, 'Editor closed; local recovery retained.'); frame.remove(); } catch(error) { frame.inert=wasInert; throw error; } }
        };
      }
    };
  }
  globalThis.HoleForm = Object.freeze({ create });
})();
