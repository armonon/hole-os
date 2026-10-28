/* Bounded retained ScenePilot engine surface. Full studio remains a separate route. */
(() => {
  'use strict';
  const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
  const files = ['vendor/scenepilot/engine.js', 'bridge-client.js', 'scenepilot-adapter.js', 'scenepilot-editor.js'];
  let sources;
  function create({ core = globalThis.HoleCore, baseURL = new URL('./', document.currentScript?.src || new URL('/assets/scenepilot.js', location.href)), bridge } = {}) {
    const broker = bridge || HoleBridgeModel.createBridge({ core, host: window });
    return {
      async mount(instance, root) {
        if (!root || !instance.context.assetId || !instance.context.versionId) throw new Error('ScenePilot needs a mounted root and an explicitly selected resource version.');
        sources ||= Promise.all(files.map(async path => { const response = await fetch(new URL(path, baseURL)); if (!response.ok) throw new Error(`ScenePilot component unavailable: ${path}`); return response.text(); })).catch(error => { sources = null; throw error; });
        const [engine, sdk, adapter, editor] = await sources;
        const versionId = instance.editorState?.assetId === instance.context.assetId && instance.editorState?.versionId ? instance.editorState.versionId : instance.context.versionId;
        await core.readAsset(instance.context.assetId, versionId);
        const mediaLinks = instance.editorState?.mediaLinks || [];
        if (!Array.isArray(mediaLinks) || mediaLinks.length > 63 || mediaLinks.some(link => !link || typeof link.sourceId !== 'string' || typeof link.assetId !== 'string' || typeof link.versionId !== 'string')) throw new Error('Select explicit source media versions.');
        const resources = [{ assetId: instance.context.assetId, versionId, operations: ['resource.read','resource.commit','resource.derive'] }];
        for (const link of mediaLinks) {
          const existing = resources.find(resource => resource.assetId === link.assetId);
          if (existing && existing.versionId !== link.versionId) throw new Error('Conflicting media versions: select one exact version per Hole asset.');
          if (!existing) resources.push({ assetId: link.assetId, versionId: link.versionId, operations: ['resource.read'] });
        }
        const frame = document.createElement('iframe');
        frame.title = 'ScenePilot native cut editor'; frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'width:100%;height:640px;min-height:470px;border:0;background:#191d24'; root.append(frame);
        const mountedLoad = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        const connection = broker.prepareSandbox({ frame, instanceId: instance.id, projectId: instance.context.projectId, resources, operations: ['resource.read','resource.commit','resource.derive','state.read','state.save', ...(instance.context.projectId ? ['project.kit'] : [])], ttlMs: 3600000 , render: bootstrap => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width"><style>*{box-sizing:border-box}body{font:14px system-ui;color:#edf0f6;background:#191d24;margin:16px}button,input,select{font:inherit;padding:8px;margin:3px;border:1px solid #738196;border-radius:6px}input{width:70px}button{cursor:pointer}canvas{display:block;width:100%;height:280px;object-fit:contain;background:#303744}fieldset{margin:10px 0;min-width:0}label{display:inline-flex;flex-wrap:wrap;max-width:100%;align-items:center;gap:4px}button,input,select,textarea{max-width:100%}textarea{width:100%;min-height:70px}p{overflow-wrap:anywhere}#kit{font-size:12px}</style>${globalThis.HoleDesign?.editorTheme?.() || ''}<h2>ScenePilot · native cut</h2><h3 id="project"></h3><p>Edit titles and ordinary clip trims/splits. Source/title preview uses retained ScenePilot timing. Full composition, effects and video rendering remain in the full studio.</p><p id="missing"></p><label>Granted source <select id="media" aria-label="Granted source"></select></label><div id="source"></div><canvas id="preview" width="640" height="360" aria-label="Native title motion preview" style="width:100%;height:auto"></canvas><label>Preview time <input id="time" aria-label="Preview time" type="text" inputmode="decimal" maxlength="32" value="0"></label><button id="inspect-clip">Inspect selected clip</button><p id="clock">Source inspection is paused; it does not render a composition.</p><fieldset><legend>Titles</legend><label>Title <select id="title" aria-label="Title"></select></label><label>Text <textarea id="text" maxlength="4000"></textarea></label><label>Start seconds <input id="start" aria-label="Start seconds" type="text" inputmode="decimal" maxlength="32"></label><label>Duration seconds <input id="duration" aria-label="Duration seconds" type="text" inputmode="decimal" maxlength="32"></label><button id="apply-title">Apply title</button><button id="discard-title">Discard title fields</button></fieldset><fieldset id="clip-controls"><legend>Ordinary clip trim</legend><label>Clip <select id="clip" aria-label="Clip"></select></label><label>Edge <select id="edge" aria-label="Edge"><option value="in">In</option><option value="out">Out</option></select></label><label>Timeline seconds <input id="trim-time" aria-label="Trim timeline seconds" type="text" inputmode="decimal" maxlength="32"></label><button id="trim">Apply trim</button><label>Split timeline seconds <input id="split-time" aria-label="Split timeline seconds" type="text" inputmode="decimal" maxlength="32"></label><button id="split">Split clip</button><p id="clip-limit"></p></fieldset><button id="undo">Undo</button><button id="checkpoint">Keep recovery</button><button id="save">Save to Hole</button><button id="export-native">Export native cut copy</button><p role="status" aria-live="polite">Connecting…</p><p id="kit"></p>` + script(`globalThis.HOLE_SCENEPILOT_BOOTSTRAP=${JSON.stringify(bootstrap).replace(/</g,'\\u003c')};globalThis.HOLE_SCENEPILOT_MEDIA=${JSON.stringify(mediaLinks).replace(/</g,'\\u003c')};`) + script(engine) + script(sdk) + script(adapter) + script(editor) });
        await mountedLoad;
        let pendingRecovery = false;
        const pendingMessage = event => {
          const data = event.data;
          if (event.source === frame.contentWindow && data?.kind === 'hole.scenepilot.pending' && data.nonce === connection.bootstrap.nonce && typeof data.pending === 'boolean') pendingRecovery = data.pending;
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
              if (event.source !== frame.contentWindow || data?.kind !== 'hole.scenepilot.flush' || data.id !== id || data.nonce !== nonce || !['complete', 'error'].includes(data.type)) return;
              cleanup();
              if (data.type === 'complete') resolve();
              else reject(new Error(String(data.message || 'ScenePilot recovery could not be saved. Retry before closing.').slice(0, 500)));
            };
            const timer = setTimeout(() => { cleanup(); reject(new Error('ScenePilot recovery did not acknowledge. Keep this window open and retry.')); }, 15000);
            window.addEventListener('message', receive);
            try { frame.contentWindow.postMessage({ kind: 'hole.scenepilot.flush', type: 'request', id, nonce }, '*'); }
            catch (error) { cleanup(); reject(error); }
          });
        }
        return {
          frame, sessionId: connection.sessionId,
          revoke: () => broker.revoke(connection.sessionId, 'Resource access revoked; local recovery retained.'),
          serialize: async () => { await flushEditor(); const saved = await core.get('settings', `bridge-state:${instance.id}`); if (saved?.state?.busy) throw new Error('Wait for ScenePilot to finish its operation or retry its recovery checkpoint before closing.'); return { schema: 'hole.scenepilot-instance/1', mediaLinks, assetId: instance.context.assetId, versionId: saved?.state?.binding?.versionId || versionId, checkpointId: `bridge-state:${instance.id}` }; },
          close: async () => { const wasInert=frame.inert; frame.inert=true; try { await flushEditor(); removeUnloadGuard(); broker.revoke(connection.sessionId, 'Editor closed; local recovery retained.'); frame.remove(); } catch(error) { frame.inert=wasInert; throw error; } }
        };
      }
    };
  }
  globalThis.HoleScenePilot = Object.freeze({ create });
})();
