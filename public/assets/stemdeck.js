/* Bounded retained StemDeck engine surface. Full studio remains a separate route. */
(() => {
  'use strict';
  const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
  const files = ['vendor/stemdeck/engine.js', 'bridge-client.js', 'stemdeck-adapter.js', 'stemdeck-editor.js'];
  let sources;
  function create({ core = globalThis.HoleCore, baseURL = new URL('./', document.currentScript?.src || new URL('/assets/stemdeck.js', location.href)), bridge } = {}) {
    const broker = bridge || HoleBridgeModel.createBridge({ core, host: window });
    return {
      async mount(instance, root) {
        if (!root || !instance.context.assetId || !instance.context.versionId) throw new Error('StemDeck needs a mounted root and an explicitly selected resource version.');
        sources ||= Promise.all(files.map(async path => { const response = await fetch(new URL(path, baseURL)); if (!response.ok) throw new Error(`StemDeck component unavailable: ${path}`); return response.text(); })).catch(error => { sources = null; throw error; });
        const [engine, sdk, adapter, editor] = await sources;
        const versionId = instance.editorState?.assetId === instance.context.assetId && instance.editorState?.versionId ? instance.editorState.versionId : instance.context.versionId;
        await core.readAsset(instance.context.assetId, versionId);
        const frame = document.createElement('iframe');
        frame.title = 'StemDeck native scene and pattern editor'; frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'width:100%;height:640px;min-height:470px;border:0;background:#191d24'; root.append(frame);
        const mountedLoad = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        const connection = broker.prepareSandbox({ frame, instanceId: instance.id, projectId: instance.context.projectId, resources: [{ assetId: instance.context.assetId, versionId, operations: ['resource.read','resource.commit','resource.derive'] }], operations: ['resource.read','resource.commit','resource.derive','state.read','state.save', ...(instance.context.projectId ? ['project.kit'] : [])], ttlMs: 3600000 , render: bootstrap => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;color:#edf0f6;background:#191d24;margin:16px}button,input,select{font:inherit;padding:8px;margin:3px;border:1px solid #738196;border-radius:6px}input{width:70px}button{cursor:pointer}canvas{display:block;width:100%;height:280px;object-fit:contain;background:#303744}fieldset{margin:10px 0}p{overflow-wrap:anywhere}#kit{font-size:12px}</style><h2>StemDeck · Rack</h2><p>Native portable session editing. Embedded audio stays intact. Rack audition renders one C4 note using the original browser instrument engine; full arrangement, routing and native plugins remain in the full studio.</p><label>Session name <input id="name" style="width:220px"></label><button id="rename">Rename</button><p id="details"></p><button id="add">Add Rack pattern</button><fieldset><legend>Native MIDI instrument</legend><label>Pattern <select id="clip"></select></label><label>Instrument <select id="instrument"></select></label><label>Attack seconds <input id="attack" type="number" min="0.001" max="4" step="0.01"></label><label>Release seconds <input id="release" type="number" min="0.005" max="2" step="0.01"></label><label>Cutoff Hz <input id="cutoff" type="number" min="40" max="20000"></label><button id="apply">Apply instrument</button><button id="preview">Preview C4</button><button id="wav">Export C4 WAV</button></fieldset><audio id="audio" controls></audio><button id="undo">Undo</button><button id="checkpoint">Keep recovery</button><button id="save">Save to Hole</button><p role="status" aria-live="polite">Connecting…</p><p id="kit"></p>` + script(`globalThis.HOLE_STEMDECK_BOOTSTRAP=${JSON.stringify(bootstrap).replace(/</g,'\\u003c')};`) + script(engine) + script(sdk) + script(adapter) + script(editor) });
        await mountedLoad;
        return {
          frame, sessionId: connection.sessionId,
          revoke: () => broker.revoke(connection.sessionId, 'Resource access revoked; local recovery retained.'),
          serialize: async () => { const saved = await core.get('settings', `bridge-state:${instance.id}`); if (saved?.state?.busy) throw new Error('Wait for StemDeck to finish its operation or retry its recovery checkpoint before closing.'); return { schema: 'hole.stemdeck-instance/1', assetId: instance.context.assetId, versionId: saved?.state?.binding?.versionId || versionId, checkpointId: `bridge-state:${instance.id}` }; },
          close: () => { broker.revoke(connection.sessionId, 'Editor closed; local recovery retained.'); frame.remove(); }
        };
      }
    };
  }
  globalThis.HoleStemDeck = Object.freeze({ create });
})();
