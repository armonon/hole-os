/* Bounded retained Luma engine surface. Full studio remains a separate route. */
(() => {
  'use strict';
  const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
  const files = ['vendor/luma/engine.js', 'bridge-client.js', 'luma-adapter.js', 'luma-editor.js'];
  let sources;
  function create({ core = globalThis.HoleCore, baseURL = new URL('./', document.currentScript?.src || new URL('/assets/luma.js', location.href)), bridge } = {}) {
    const broker = bridge || HoleBridgeModel.createBridge({ core, host: window });
    return {
      async mount(instance, root) {
        if (!root || !instance.context.assetId || !instance.context.versionId) throw new Error('Luma needs a mounted root and an explicitly selected resource version.');
        sources ||= Promise.all(files.map(async path => { const response = await fetch(new URL(path, baseURL)); if (!response.ok) throw new Error(`Luma component unavailable: ${path}`); return response.text(); })).catch(error => { sources = null; throw error; });
        const [engine, sdk, adapter, editor] = await sources;
        const versionId = instance.editorState?.assetId === instance.context.assetId && instance.editorState?.versionId ? instance.editorState.versionId : instance.context.versionId;
        await core.readAsset(instance.context.assetId, versionId);
        const frame = document.createElement('iframe');
        frame.title = 'Luma image and native project editor'; frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'width:100%;height:640px;min-height:470px;border:0;background:#191d24'; root.append(frame);
        const mountedLoad = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        const connection = broker.prepareSandbox({ frame, instanceId: instance.id, projectId: instance.context.projectId, resources: [{ assetId: instance.context.assetId, versionId, operations: ['resource.read','resource.commit','resource.derive'] }], operations: ['resource.read','resource.commit','resource.derive','state.read','state.save', ...(instance.context.projectId ? ['project.kit'] : [])], ttlMs: 3600000 , render: bootstrap => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;color:#edf0f6;background:#191d24;margin:16px}button,input,select{font:inherit;padding:8px;margin:3px;border:1px solid #738196;border-radius:6px}input{width:70px}button{cursor:pointer}canvas{display:block;width:100%;height:280px;object-fit:contain;background:#303744}fieldset{margin:10px 0}p{overflow-wrap:anywhere}#kit{font-size:12px}</style>${globalThis.HoleDesign?.editorTheme?.() || ''}<h2>Luma · image & native project</h2><p>Crop, raster painting, native layers/text and recovery use the Luma engine. Open the full studio for its complete toolset.</p><canvas aria-label="Luma document preview"></canvas><p id="dimensions"></p><label>Layer <select id="layer"></select></label><label>Opacity <input id="opacity" type="number" min="0" max="1" step="0.1" value="1"></label><fieldset><legend>Crop in pixels</legend><label>X <input id="x" type="number" value="0"></label><label>Y <input id="y" type="number" value="0"></label><label>Width <input id="width" type="number" min="1" value="16"></label><label>Height <input id="height" type="number" min="1" value="12"></label><button id="crop">Crop</button></fieldset><button id="undo">Undo</button><button id="redo">Redo</button><button id="checkpoint">Keep recovery</button><button id="save">Save to Hole</button><p role="status" aria-live="polite">Connecting to Hole…</p><p id="kit"></p>` + script(`globalThis.HOLE_LUMA_BOOTSTRAP=${JSON.stringify(bootstrap).replace(/</g,'\\u003c')};`) + script(engine) + script(sdk) + script(adapter) + script(editor) });
        await mountedLoad;
        let pendingRecovery = false;
        const pendingMessage = event => {
          const data = event.data;
          if (event.source === frame.contentWindow && data?.kind === 'hole.luma.pending' && data.nonce === connection.bootstrap.nonce && typeof data.pending === 'boolean') pendingRecovery = data.pending;
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
              if (event.source !== frame.contentWindow || data?.kind !== 'hole.luma.flush' || data.id !== id || data.nonce !== nonce || !['complete', 'error'].includes(data.type)) return;
              cleanup();
              if (data.type === 'complete') resolve();
              else reject(new Error(String(data.message || 'Luma recovery could not be saved. Retry before closing.').slice(0, 500)));
            };
            const timer = setTimeout(() => { cleanup(); reject(new Error('Luma recovery did not acknowledge. Keep this window open and retry.')); }, 15000);
            window.addEventListener('message', receive);
            try { frame.contentWindow.postMessage({ kind: 'hole.luma.flush', type: 'request', id, nonce }, '*'); }
            catch (error) { cleanup(); reject(error); }
          });
        }
        return {
          frame, sessionId: connection.sessionId,
          revoke: () => broker.revoke(connection.sessionId, 'Resource access revoked; local recovery retained.'),
          serialize: async () => { await flushEditor(); const saved = await core.get('settings', `bridge-state:${instance.id}`); if (saved?.state?.busy) throw new Error('Wait for Luma to finish its operation or retry its recovery checkpoint before closing.'); return { schema: 'hole.luma-instance/1', assetId: instance.context.assetId, versionId: saved?.state?.binding?.versionId || versionId, checkpointId: `bridge-state:${instance.id}` }; },
          close: () => { removeUnloadGuard(); broker.revoke(connection.sessionId, 'Editor closed; local recovery retained.'); frame.remove(); }
        };
      }
    };
  }
  globalThis.HoleLuma = Object.freeze({ create });
})();
