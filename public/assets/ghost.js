/* Bounded retained Ghost garment engine surface. Full studio remains a separate route. */
(() => {
  'use strict';
  let activeSolve=null;
  function validateSolve(value){
    const bad=()=>{throw new Error('Invalid or oversized garment compute request.');};
    if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['settings','construction','garmentType','silhouettes'].includes(k)))bad();
    const finite=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b,settings=value.settings;
    if(!settings||Object.keys(settings).length!==12)bad();
    for(const [k,a,b]of [['depth',60,135],['sleeves',0,28],['length',55,85],['photoWidth',.8,1.22],['stiffness',0,100],['fullness',0,100],['airflow',0,100]])if(!finite(settings[k],a,b))bad();
    for(const [k,values]of Object.entries({fit:['slim','natural','relaxed'],finish:['soft','smooth'],background:['studio','white','ink'],fabric:['cotton','wool','denim','silk','chiffon','linen','leather'],presentation:['ghost-mannequin','hanger']}))if(!values.includes(settings[k]))bad();
    if(Object.keys(settings).some(k=>!['fit','depth','sleeves','length','finish','background','fabric','photoWidth','presentation','stiffness','fullness','airflow'].includes(k)))bad();
    const types=['auto','t-shirt','shirt','tank','sweater','sweatshirt','hoodie','jacket','coat','vest','cardigan','dress','tunic','jumpsuit','romper','bodysuit','trousers','jeans','shorts','leggings','skirt','swimwear','underwear','bra','activewear','cape','wrap','scarf','custom','tailored-jacket'];if(!types.includes(value.garmentType))bad();
    const c=value.construction;if(!c||Object.keys(c).length!==10||!['outline','fitted'].includes(c.mode)||!['open','collar','hood'].includes(c.neck))bad();
    for(const k of ['body','sleeves','hoodWidth','hoodHeight','hoodDepth'])if(!finite(c[k],60,150))bad();for(const k of ['hoodU','hoodV'])if(!finite(c[k],0,100))bad();if(!finite(c.hoodPatch,5,40))bad();
    const silhouettes=value.silhouettes;if(silhouettes!==null){if(!Array.isArray(silhouettes)||silhouettes.length!==2)bad();for(const m of silhouettes){if(!m||Object.keys(m).length!==5||!Number.isInteger(m.cols)||!Number.isInteger(m.rows)||!finite(m.cols,8,64)||!finite(m.rows,8,64)||!(m.mask instanceof Uint8Array)||m.mask.length!==m.cols*m.rows||!m.mask.every(x=>x===0||x===1)||!finite(m.aspect,.05,20)||!Array.isArray(m.bounds)||m.bounds.length!==4||!m.bounds.every(x=>finite(x,0,1))||m.bounds[0]>=m.bounds[2]||m.bounds[1]>=m.bounds[3])bad();}}
    if(c.mode==='outline'&&value.garmentType!=='tailored-jacket'&&!silhouettes)bad();if(new Blob([JSON.stringify(value)]).size>96000)bad();return structuredClone(value);
  }
  function validateResult(result){
    const bad=()=>{throw new Error('The garment worker returned invalid or oversized geometry.');};
    if(!result||!(result.positions instanceof Float32Array)||!(result.uv instanceof Float32Array)||!(result.triangles instanceof Uint32Array)||result.positions.length%3||!result.positions.length||result.positions.length>600000||result.uv.length!==result.positions.length/3*2||result.triangles.length%3||result.triangles.length>1200000||!result.triangles.every(n=>n<result.positions.length/3))bad();
    let bytes=0,nodes=0;const walk=(v,depth)=>{if(++nodes>200000||depth>32)bad();if(ArrayBuffer.isView(v)){bytes+=v.byteLength;if(bytes>32*1024*1024||!v.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000000))bad();}else if(v&&typeof v==='object'){for(const item of Object.values(v))walk(item,depth+1);}else if(typeof v==='number'&&(!Number.isFinite(v)||Math.abs(v)>1000000)||typeof v==='string'&&v.length>10000)bad();};walk(result,0);
    const integer=(n,low,high)=>Number.isInteger(n)&&n>=low&&n<=high,finite=(n,low,high)=>typeof n==='number'&&Number.isFinite(n)&&n>=low&&n<=high;
    const topology=(mesh)=>{if(!(mesh.positions instanceof Float32Array)||!mesh.positions.length||mesh.positions.length%3||mesh.positions.length>600000||!(mesh.uv instanceof Float32Array)||mesh.uv.length!==mesh.positions.length/3*2||!(mesh.triangles instanceof Uint32Array)||!mesh.triangles.length||mesh.triangles.length%3||mesh.triangles.length>1200000)bad();const count=mesh.positions.length/3;if(!mesh.triangles.every(n=>n<count)||!mesh.positions.every(n=>finite(n,-100,100))||!mesh.uv.every(n=>finite(n,-10,10)))bad();if(!Array.isArray(mesh.seams)||mesh.seams.length>20000||mesh.seams.some(e=>!e||!integer(e.a,0,count-1)||!integer(e.b,0,count-1)))bad();if(!Array.isArray(mesh.openings)||mesh.openings.length>4096)bad();const edges=new Set();for(let i=0;i<mesh.triangles.length;i+=3){const t=mesh.triangles.subarray(i,i+3);if(new Set(t).size!==3)bad();for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3];edges.add(a<b?a+':'+b:b+':'+a);}}for(const chain of mesh.openings){if(!Array.isArray(chain)||chain.length<2||chain.length>10000||!chain.every(n=>integer(n,0,count-1)))bad();for(let i=1;i<chain.length;i++){const a=chain[i-1],b=chain[i];if(!edges.has(a<b?a+':'+b:b+':'+a))bad();}}return count;};
    const count=topology(result);if(!Array.isArray(result.pieces)||!result.pieces.length||result.pieces.length>32)bad();let nextVertex=0,nextIndex=0;const names=new Set();for(const p of result.pieces){if(!p||typeof p.name!=='string'||!p.name||p.name.length>200||names.has(p.name)||typeof p.front!=='boolean'||!['body','sleeve','collar','silhouette'].includes(p.kind)||!integer(p.side,-1,1)||p.start!==nextVertex||p.indexStart!==nextIndex||!integer(p.count,3,count-p.start)||!integer(p.indexCount,3,result.triangles.length-p.indexStart)||p.indexCount%3)bad();names.add(p.name);if(p.kind==='silhouette'){if(p.cols!==0||p.rows!==0)bad();}else if(!integer(p.cols,1,128)||!integer(p.rows,1,128)||(p.cols+1)*(p.rows+1)!==p.count)bad();for(const index of result.triangles.subarray(p.indexStart,p.indexStart+p.indexCount))if(index<p.start||index>=p.start+p.count)bad();nextVertex+=p.count;nextIndex+=p.indexCount;}if(nextVertex!==count||nextIndex!==result.triangles.length)bad();for(const chain of result.openings){const p=result.pieces.find(p=>chain[0]>=p.start&&chain[0]<p.start+p.count);if(!p||chain.some(n=>n<p.start||n>=p.start+p.count))bad();}
    if(result.hood){const h=result.hood,n=topology(h);if(!integer(h.rows,1,64)||!integer(h.cols,1,128)||(h.rows+1)*(h.cols+1)!==n||!Array.isArray(h.attachments)||h.attachments.length>h.cols+1)bad();const vertices=new Set();for(const a of h.attachments){const p=result.pieces.find(p=>p.name===a?.name&&p.kind==='body');if(!p||!integer(a.vertex,0,h.cols)||vertices.has(a.vertex)||!integer(a.a,0,p.count-1)||!integer(a.b,0,p.count-1)||!finite(a.weight,0,1)||!Array.isArray(a.point)||a.point.length!==3||!a.point.every(n=>finite(n,-100,100)))bad();vertices.add(a.vertex);}}
    const profile=result.metadata?.supportProfile;if(profile){if(!Array.isArray(profile.shoulders)||profile.shoulders.length<2||profile.shoulders.length>32||!profile.shoulders.every(p=>Array.isArray(p)&&p.length===3&&p.every(n=>finite(n,-10,10)))||!finite(profile.scale,.01,10)||!finite(profile.radius,.0001,1)||!finite(profile.railRadius,.0001,1)||!finite(profile.hookY,-10,10)||!Array.isArray(profile.clipPoints)||profile.clipPoints.length>32||!profile.clipPoints.every(p=>Array.isArray(p)&&p.length===3&&p.every(n=>finite(n,-10,10))))bad();}
    if(!finite(result.metadata?.clothThicknessMm,.001,10))bad();
    if(result.motion!==null||result.metadata?.schema!=='ghost-garment'||new Blob([JSON.stringify(result.metadata)]).size>256000)bad();return result;
  }
  const script = text => '<script>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
  const files = ['vendor/ghost/three.js','vendor/ghost/document.js','vendor/ghost/renderer.js','vendor/form/engine.js','bridge-client.js','ghost-adapter.js','ghost-editor.js'];
  let sources;
  function create({ core = globalThis.HoleCore, baseURL = new URL('./', document.currentScript?.src || new URL('/assets/ghost.js', location.href)), bridge,workerFactory=url=>new Worker(url) } = {}) {
    const broker = bridge || HoleBridgeModel.createBridge({ core, host: window });
    return {
      async mount(instance, root) {
        if (!root || !instance.context.assetId || !instance.context.versionId) throw new Error('Ghost needs a mounted root and an explicitly selected resource version.');
        sources ||= Promise.all(files.map(async path => { const response = await fetch(new URL(path, baseURL)); if (!response.ok) throw new Error(`Ghost component unavailable: ${path}`); return response.text(); })).catch(error => { sources = null; throw error; });
        const [three, native, renderer, form, sdk, adapter, editor] = await sources;
        const versionId = instance.editorState?.assetId === instance.context.assetId && instance.editorState?.versionId ? instance.editorState.versionId : instance.context.versionId;
        await core.readAsset(instance.context.assetId, versionId);
        const resources = [{ assetId: instance.context.assetId, versionId, operations: ['resource.read','resource.commit','resource.derive'] }];
        const nonce=crypto.randomUUID();let revoked=false;
        const frame = document.createElement('iframe');
        frame.title = 'Form native garment editor'; frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'width:100%;height:640px;min-height:470px;border:0;background:#191d24'; root.append(frame);
        const send=message=>{if(!revoked)frame.contentWindow?.postMessage({kind:'hole.ghost.compute',nonce,...message},'*');};
        const stop=reason=>{if(activeSolve?.owner===nonce)activeSolve.finish(new Error(reason));};
        const compute=event=>{
          const d=event.data;if(revoked||event.source!==frame.contentWindow||d?.kind!=='hole.ghost.compute'||d.nonce!==nonce||typeof d.id!=='string'||d.id.length>100)return;
          if(d.type==='cancel'){if(activeSolve?.owner===nonce&&activeSolve.id===d.id)stop('Garment generation cancelled.');return;}
          if(d.type!=='solve')return;
          try{const payload=validateSolve(d.payload);if(activeSolve)throw new Error('Another garment solve is running. Wait or cancel it first.');
            const worker=workerFactory(new URL('vendor/ghost/drape-worker.js',baseURL));let done=false,timer;
            const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();if(activeSolve?.owner===nonce)activeSolve=null;send({id:d.id,type:error?'error':'complete',...(error?{message:error.message}:{result})});};
            activeSolve={owner:nonce,id:d.id,worker,finish};timer=setTimeout(()=>finish(new Error('Garment generation exceeded the 90-second budget.')),90000);
            worker.onerror=()=>finish(new Error('The local garment worker failed.'));
            worker.onmessage=({data})=>{if(data?.id!==d.id)return;if(data.type==='progress'){if(Number.isFinite(data.progress)&&data.progress>=0&&data.progress<=100)send({id:d.id,type:'progress',progress:data.progress,phase:String(data.phase||'Solving garment').slice(0,160)});}else if(data.type==='error')finish(new Error(String(data.message||'Garment solve failed.').slice(0,500)));else if(data.type==='complete'){try{finish(null,validateResult(data.result));}catch(error){finish(error);}}};
            worker.postMessage({id:d.id,...payload,captureMotion:false});
          }catch(error){send({id:d.id,type:'error',message:error.message});}
        };
        window.addEventListener('message',compute);
        const disposeCompute=reason=>{stop(reason);revoked=true;window.removeEventListener('message',compute);};
        const mountedLoad = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
        const connection = broker.prepareSandbox({ frame, instanceId: instance.id, projectId: instance.context.projectId, resources, operations: ['resource.read','resource.commit','resource.derive','state.read','state.save', ...(instance.context.projectId ? ['project.kit'] : [])], ttlMs: 3600000 , render: bootstrap => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width"><style>body{font:14px system-ui;color:#edf0f6;background:#191d24;margin:16px}button,input,select{font:inherit;padding:8px;margin:3px;border:1px solid #738196;border-radius:6px}input{width:70px}button{cursor:pointer}canvas{display:block;width:100%;height:280px;object-fit:contain;background:#303744}fieldset{margin:10px 0}p{overflow-wrap:anywhere}#kit{font-size:12px}</style>${globalThis.HoleDesign?.editorTheme?.() || ''}<h2>Form · Garment from photos</h2><p>Editable Ghost source and original photos stay intact. Cloth is an inferred visual drape, not measured fit or recovered sewing patterns.</p><canvas id="preview" aria-label="Inferred garment preview" width="640" height="440" style="height:320px"></canvas><div id="photos" style="display:flex;gap:10px"></div><label>Name <input id="name" maxlength="80" style="width:160px"></label><label>Fit <select id="fit"><option>slim</option><option>natural</option><option>relaxed</option></select></label><label>Fabric <select id="fabric"></select></label><label>Length setting <input id="length" type="number" min="55" max="85"></label><label>Depth setting <input id="depth" type="number" min="60" max="135"></label><label>Stiffness <input id="stiffness" type="number" min="0" max="100"></label><label>Presentation <select id="presentation"><option value="ghost-mannequin">Ghost mannequin</option><option value="hanger">Hanger</option></select></label><button id="apply">Apply garment settings</button><button id="undo">Undo</button><button id="checkpoint">Keep recovery</button><button id="save">Save native garment</button><button id="generate">Generate garment preview</button><button id="export">Export GLB and Form scene</button><button id="cancel" disabled>Cancel generation</button><p role="status" aria-live="polite">Connecting…</p>` + script(`globalThis.HOLE_GHOST_BOOTSTRAP=${JSON.stringify(bootstrap).replace(/</g,'\\u003c')};globalThis.HOLE_GHOST_COMPUTE_NONCE=${JSON.stringify(nonce)};`) + script(three) + script(native) + script(renderer) + script(form) + script(sdk) + script(adapter) + script(editor) });
        await mountedLoad;
        return {
          frame, sessionId: connection.sessionId,
          revoke: () => {disposeCompute('Garment resource access revoked.');broker.revoke(connection.sessionId,'Resource access revoked; local recovery retained.');},
          serialize: async () => { const saved = await core.get('settings', `bridge-state:${instance.id}`); if (saved?.state?.busy) throw new Error('Wait for Ghost to finish its operation or retry its recovery checkpoint before closing.'); return { schema: 'hole.ghost-instance/1', assetId: instance.context.assetId, versionId: saved?.state?.binding?.versionId || versionId, checkpointId: `bridge-state:${instance.id}` }; },
          close: () => { disposeCompute('Garment editor closed.');broker.revoke(connection.sessionId, 'Editor closed; local recovery retained.'); frame.remove(); }
        };
      }
    };
  }
  globalThis.HoleGhost=Object.freeze({create,validateSolve,validateResult});
})();
