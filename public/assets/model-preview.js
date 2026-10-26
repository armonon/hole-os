/* Static local GLB geometry preview; no automatic URL resolution or content writes. */
(()=>{'use strict';let cleanupActive=()=>{},generation=0;
async function open(record,ctx){
 const run=++generation;cleanupActive();const bytes=await record.blob.arrayBuffer(),info=HoleModelPreviewModel.inspect(bytes);
 const E=await import('./vendor/three/engine.js');if(run!==generation)return;const d=ctx.modal('3D preview · '+record.asset.name,'Local geometry and material colors. Rotate or zoom with the controls. The original remains unchanged; textures and extension-dependent scenes require the full studio.');
 const area=document.createElement('div');area.style.cssText='width:100%;height:320px;overflow:hidden';d.append(area);const status=document.createElement('p');status.setAttribute('role','status');status.textContent=`${info.meshes} meshes · ${info.nodes} nodes · selected version`;d.append(status);
 let renderer,scene,object,observer,closed=false;const materials=new Set(),geometries=new Set();
 const cleanup=()=>{if(closed)return;closed=true;observer?.disconnect();scene?.traverse(n=>{if(n.geometry)geometries.add(n.geometry);for(const m of (Array.isArray(n.material)?n.material:[n.material]))if(m)materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();renderer?.dispose();renderer?.forceContextLoss();area.replaceChildren();};cleanupActive=cleanup;d.addEventListener('close',cleanup,{once:true});
 try{
 const manager=new E.LoadingManager();manager.setURLModifier(()=>{throw new Error('External dependencies are not allowed.');});const gltf=await new E.GLTFLoader(manager).parseAsync(bytes,'');if(closed){gltf.scene.traverse(n=>{n.geometry?.dispose();for(const m of(Array.isArray(n.material)?n.material:[n.material]))m?.dispose();});return;}
 object=gltf.scene;scene=new E.Scene();scene.background=new E.Color('#202630');scene.add(object,new E.HemisphereLight(0xffffff,0x606070,3));const light=new E.DirectionalLight(0xffffff,3);light.position.set(2,3,4);scene.add(light);
 const box=new E.Box3().setFromObject(object),size=box.getSize(new E.Vector3()),center=box.getCenter(new E.Vector3());if(box.isEmpty()||![size.x,size.y,size.z,center.x,center.y,center.z].every(Number.isFinite)||Math.max(size.x,size.y,size.z)>1e9)throw new Error('No finite renderable geometry.');object.position.sub(center);
 const radius=Math.max(size.x,size.y,size.z,.001),camera=new E.PerspectiveCamera(45,1,radius/1000,radius*100);let yaw=.4,pitch=.25,zoom=2.3;
 renderer=new E.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.domElement.setAttribute('aria-label','Rendered GLB geometry');renderer.domElement.setAttribute('role','img');area.append(renderer.domElement);
 const draw=()=>{if(closed)return;const width=Math.max(1,area.clientWidth);renderer.setSize(width,320);camera.aspect=width/320;camera.position.set(radius*zoom*Math.sin(yaw)*Math.cos(pitch),radius*zoom*Math.sin(pitch),radius*zoom*Math.cos(yaw)*Math.cos(pitch));camera.lookAt(0,0,0);camera.updateProjectionMatrix();renderer.render(scene,camera);};
 const control=(name,min,max,step,value,change)=>{const label=document.createElement('label');label.textContent=name;label.style.cssText='display:flex;align-items:center;gap:12px;margin:10px 0';const input=document.createElement('input');input.type='range';Object.assign(input,{min,max,step,value});input.setAttribute('aria-label',name);input.oninput=()=>{change(Number(input.value));draw();};label.append(input);d.append(label);};
 control('Rotation',-3.14,3.14,.05,yaw,v=>yaw=v);control('Elevation',-1.5,1.5,.05,pitch,v=>pitch=v);control('Distance',1,6,.1,zoom,v=>zoom=v);observer=new ResizeObserver(draw);observer.observe(area);draw();
 }catch(error){cleanup();status.textContent='Preview unavailable: '+error.message;}
 const close=document.createElement('button');close.className='hc-button';close.textContent='Close 3D preview';close.onclick=()=>d.close();d.append(close);
}
globalThis.HoleModelPreview=Object.freeze({open,dispose:()=>{generation++;cleanupActive();}});})();
