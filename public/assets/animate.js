/* Bounded retained Animate animation engine surface. Full studio remains a separate route. */
(() => {
  'use strict';
  const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
  const files = ['vendor/animate/engine.js', 'bridge-client.js', 'animate-adapter.js', 'animate-editor.js'];
  let sources;
  function create({ core = globalThis.HoleCore, baseURL = new URL('./', document.currentScript?.src || new URL('/assets/animate.js', location.href)), bridge } = {}) {
    const broker = bridge || HoleBridgeModel.createBridge({ core, host: window });
    return {
      async mount(instance, root) {
        if (!root || !instance.context.assetId || !instance.context.versionId) throw new Error('Animate needs a mounted root and an explicitly selected resource version.');
        sources ||= Promise.all(files.map(async path => { const response = await fetch(new URL(path, baseURL)); if (!response.ok) throw new Error(`Animate component unavailable: ${path}`); return response.text(); })).catch(error => { sources = null; throw error; });
        const [engine, sdk, adapter, editor] = await sources;
        const versionId = instance.editorState?.assetId === instance.context.assetId && instance.editorState?.versionId ? instance.editorState.versionId : instance.context.versionId;
        await core.readAsset(instance.context.assetId, versionId);
        const resources = [{ assetId: instance.context.assetId, versionId, operations: ['resource.read','resource.commit','resource.derive'] }];
        const frame = document.createElement('iframe');
        frame.title = 'ScenePilot native animation editor'; frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'width:100%;height:640px;min-height:470px;border:0;background:#191d24'; root.append(frame);
        const mountedLoad = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        const connection = broker.prepareSandbox({ frame, instanceId: instance.id, projectId: instance.context.projectId, resources, operations: ['resource.read','resource.commit','resource.derive','state.read','state.save', ...(instance.context.projectId ? ['project.kit'] : [])], ttlMs: 3600000 , render: bootstrap => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;color:#edf0f6;background:#191d24;margin:16px}button,input,select{font:inherit;padding:8px;margin:3px;border:1px solid #738196;border-radius:6px}input{width:70px}button{cursor:pointer}canvas{display:block;width:100%;height:280px;object-fit:contain;background:#303744}fieldset{margin:10px 0}p{overflow-wrap:anywhere}#kit{font-size:12px}</style><h2>ScenePilot · Animation</h2><p>Native Animate cels, layers, fill and onion skins. Existing tweens render; tween authoring and timed video references remain in the full studio.</p><canvas id="canvas" aria-label="Animation drawing canvas" style="height:auto;width:100%;touch-action:none"></canvas><fieldset><legend>Layers</legend><label>Layer <select id="layer"></select></label><label>Name <input id="layer-name" style="width:160px"></label><label>Visible <input id="visible" type="checkbox"></label><label>Locked <input id="locked" type="checkbox"></label><button id="apply-layer">Apply layer</button><button id="add-layer">Add layer</button><button id="lower">Lower layer</button><button id="raise">Raise layer</button></fieldset><fieldset><legend>Cels</legend><label>Frame <input id="frame" type="number" min="0" step="1"></label><span id="frame-label"></span><button id="add-frame">Add frame</button><button id="blank-cel">Blank cel</button><button id="copy-cel">Copy held cel</button><label>Onion skins <input id="onion" type="checkbox"></label></fieldset><label>Tool <select id="tool"><option value="brush">Brush</option><option value="erase">Eraser</option><option value="fill">Fill</option></select></label><label>Color <input id="color" type="color" value="#3366ff"></label><label>Width <input id="width" type="number" value="12" min="1" max="512"></label><button id="undo">Undo</button><button id="checkpoint">Keep recovery</button><button id="save">Save native animation</button><fieldset><legend>Exports</legend><label>Start frame (zero based) <input id="range-start" type="number" value="0" min="0"></label><label>Frame count <input id="range-count" type="number" value="1" min="1" max="240"></label><button id="png">Export current PNG</button><button id="sheet">Export sprite sheet</button><button id="cut">Send frames to ScenePilot</button><button id="cancel-export" disabled>Cancel export</button><p>ScenePilot transfer creates a native cut and up to seven PNG frames. Link the exported images when opening the cut. Native vectors and layers remain in the source animation.</p></fieldset><p role="status" aria-live="polite">Connecting…</p>` + script(`globalThis.HOLE_ANIMATE_BOOTSTRAP=${JSON.stringify(bootstrap).replace(/</g,'\\u003c')};`) + script(engine) + script(sdk) + script(adapter) + script(editor) });
        await mountedLoad;
        return {
          frame, sessionId: connection.sessionId,
          revoke: () => broker.revoke(connection.sessionId, 'Resource access revoked; local recovery retained.'),
          serialize: async () => { const saved = await core.get('settings', `bridge-state:${instance.id}`); if (saved?.state?.busy) throw new Error('Wait for Animate to finish its operation or retry its recovery checkpoint before closing.'); return { schema: 'hole.animate-instance/1', assetId: instance.context.assetId, versionId: saved?.state?.binding?.versionId || versionId, checkpointId: `bridge-state:${instance.id}` }; },
          close: () => { broker.revoke(connection.sessionId, 'Editor closed; local recovery retained.'); frame.remove(); }
        };
      }
    };
  }
  let factoryPromise;
  async function newDocument({name='Untitled animation',width=960,height=540}={}) {
    if(typeof name!=='string'||!name.trim()||name.length>200||![width,height].every(n=>Number.isInteger(n)&&n>=16&&n<=2048))throw new Error('Enter a name of 1–200 characters and whole-number dimensions from 16 to 2048 pixels.');
    if(!globalThis.AnimateEngine){factoryPromise ||= new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src=new URL('/assets/vendor/animate/engine.js',location.href).href;tag.onload=()=>{tag.remove();resolve();};tag.onerror=()=>{tag.remove();factoryPromise=null;reject(new Error('The retained animation engine could not load.'));};document.head.append(tag);});await factoryPromise;}
    const native=AnimateEngine.newProject(name.trim());native.width=width;native.height=height;AnimateEngine.deserializeProject(JSON.stringify(native));return {name:AnimateEngine.projectFileName(native),blob:new Blob([JSON.stringify(native)],{type:'application/vnd.animate+json'})};
  }
  globalThis.HoleAnimate = Object.freeze({ create, newDocument });
})();
