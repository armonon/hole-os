/* Bounded retained Glyph engine surface. Full studio remains a separate route. */
(() => {
  'use strict';
  const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
  const files = ['vendor/glyph/engine.js', 'bridge-client.js', 'glyph-adapter.js', 'glyph-editor.js'];
  let sources;
  function create({ core = globalThis.HoleCore, baseURL = new URL('./', document.currentScript?.src || new URL('/assets/glyph.js', location.href)), bridge } = {}) {
    const broker = bridge || HoleBridgeModel.createBridge({ core, host: window });
    return {
      async mount(instance, root) {
        if (!root || !instance.context.assetId || !instance.context.versionId) throw new Error('Glyph needs a mounted root and an explicitly selected resource version.');
        sources ||= Promise.all(files.map(async path => { const response = await fetch(new URL(path, baseURL)); if (!response.ok) throw new Error(`Glyph component unavailable: ${path}`); return response.text(); })).catch(error => { sources = null; throw error; });
        const [engine, sdk, adapter, editor] = await sources;
        const versionId = instance.editorState?.assetId === instance.context.assetId && instance.editorState?.versionId ? instance.editorState.versionId : instance.context.versionId;
        await core.readAsset(instance.context.assetId, versionId);
        const frame = document.createElement('iframe');
        frame.title = 'Glyph native font project editor'; frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'width:100%;height:640px;min-height:470px;border:0;background:#191d24'; root.append(frame);
        const mountedLoad = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        const connection = broker.prepareSandbox({ frame, instanceId: instance.id, projectId: instance.context.projectId, resources: [{ assetId: instance.context.assetId, versionId, operations: ['resource.read','resource.commit','resource.derive'] }], operations: ['resource.read','resource.commit','resource.derive','state.read','state.save', ...(instance.context.projectId ? ['project.kit'] : [])], ttlMs: 3600000 , render: bootstrap => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{font:14px system-ui;color:#edf0f6;background:#191d24;margin:16px}button,input,select{font:inherit;padding:8px;margin:3px;border:1px solid #738196;border-radius:6px}input{width:70px}button{cursor:pointer}canvas{display:block;width:100%;height:280px;object-fit:contain;background:#303744}fieldset{margin:10px 0;min-width:0}input,select,button{max-width:100%}label{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;max-width:100%}#preview-text{width:100%}#preview{height:auto;width:100%;max-width:640px}p{overflow-wrap:anywhere}#kit{font-size:12px}</style>${globalThis.HoleDesign?.editorTheme?.() || ''}<h2>Glyph · native font project</h2><p>Draw brush strokes, edit native advances and kerning, and preview your glyphs. The full Glyph studio retains its complete pen and curve tools.</p><label>Family <input id="family" maxlength="31" style="width:180px"></label><label>Character <select id="character" aria-label="Character"></select></label><label>Advance <input id="advance" type="number" min="0" max="3000" step="1"></label><canvas id="drawing" width="380" height="380" aria-label="Draw selected glyph" style="touch-action:none;width:100%;height:auto;max-width:380px"></canvas><p>Draw with a pointer, or use the keyboard to edit family and advance values. TTF includes legacy kerning; OTF does not include kerning.</p><fieldset><legend>Native kerning pairs</legend><label>Left character <select id="left" aria-label="Left character"></select></label><label>Right character <select id="right" aria-label="Right character"></select></label><label>Kerning units <input id="kern" type="number" min="-1000" max="1000" step="1" value="-80"></label><button id="apply-pair">Add or update pair</button><button id="remove-pair">Remove pair</button><label>Saved pairs <select id="pairs" aria-label="Saved pairs"></select></label><p id="pair-count"></p></fieldset><label>Type preview <input id="preview-text" maxlength="80" value="AV AVA"></label><canvas id="preview" width="640" height="160" aria-label="Native type preview"></canvas><p id="preview-info"></p><button id="undo">Undo edit</button><button id="checkpoint">Keep recovery</button><button id="save">Save to Hole</button><button id="ttf">Export TTF</button><button id="otf">Export OTF</button><p role="status" aria-live="polite">Connecting…</p><p id="kit"></p>` + script(`globalThis.HOLE_GLYPH_BOOTSTRAP=${JSON.stringify(bootstrap).replace(/</g,'\\u003c')};`) + script(engine) + script(sdk) + script(adapter) + script(editor) });
        await mountedLoad;
        let pendingRecovery = false;
        const pendingMessage = event => {
          const data = event.data;
          if (event.source === frame.contentWindow && data?.kind === 'hole.glyph.pending' && data.nonce === connection.bootstrap.nonce && typeof data.pending === 'boolean') pendingRecovery = data.pending;
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
              if (event.source !== frame.contentWindow || data?.kind !== 'hole.glyph.flush' || data.id !== id || data.nonce !== nonce || !['complete', 'error'].includes(data.type)) return;
              cleanup();
              if (data.type === 'complete') resolve();
              else reject(new Error(String(data.message || 'Glyph recovery could not be saved. Retry before closing.').slice(0, 500)));
            };
            const timer = setTimeout(() => { cleanup(); reject(new Error('Glyph recovery did not acknowledge. Keep this window open and retry.')); }, 15000);
            window.addEventListener('message', receive);
            try { frame.contentWindow.postMessage({ kind: 'hole.glyph.flush', type: 'request', id, nonce }, '*'); }
            catch (error) { cleanup(); reject(error); }
          });
        }
        return {
          frame, sessionId: connection.sessionId,
          revoke: () => broker.revoke(connection.sessionId, 'Resource access revoked; local recovery retained.'),
          serialize: async () => { await flushEditor(); const saved = await core.get('settings', `bridge-state:${instance.id}`); if (saved?.state?.busy) throw new Error('Wait for Glyph to finish its operation or retry its recovery checkpoint before closing.'); return { schema: 'hole.glyph-instance/1', assetId: instance.context.assetId, versionId: saved?.state?.binding?.versionId || versionId, checkpointId: `bridge-state:${instance.id}` }; },
          close: async () => { const wasInert=frame.inert; frame.inert=true; try { await flushEditor(); removeUnloadGuard(); broker.revoke(connection.sessionId, 'Editor closed; local recovery retained.'); frame.remove(); } catch(error) { frame.inert=wasInert; throw error; } }
        };
      }
    };
  }
  globalThis.HoleGlyph = Object.freeze({ create });
})();
