/* Admission for bounded, self-contained binary glTF previews. */
(()=>{'use strict';
function inspect(buffer){
 const fail=message=>{throw new Error(message);};
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20||buffer.byteLength>25*1024*1024)fail('Choose a GLB between 20 bytes and 25 MiB.');
 const view=new DataView(buffer);if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)fail('Invalid binary glTF 2 header.');
 let offset=12,json,bin=0,chunks=0;while(offset<buffer.byteLength){if(offset+8>buffer.byteLength)fail('Truncated GLB chunk.');const size=view.getUint32(offset,true),type=view.getUint32(offset+4,true);offset+=8;if(size%4||size>buffer.byteLength-offset)fail('Invalid GLB chunk size.');if(!chunks&&type!==0x4e4f534a)fail('The first chunk must be JSON.');if(type===0x4e4f534a){if(json||size>2*1024*1024)fail('Invalid or oversized scene description.');json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,offset,size)));}else if(type===0x004e4942){if(bin)fail('Repeated binary chunk.');bin=size;}else fail('Unsupported GLB chunk.');offset+=size;chunks++;}
 if(!json||json.asset?.version!=='2.0'||json.extensionsRequired?.length)fail('This preview supports standard glTF 2 without required extensions.');
 const caps={nodes:1000,meshes:1000,scenes:32,materials:256,animations:0,skins:0,accessors:4000,bufferViews:4000,buffers:1,images:0,textures:0,samplers:0,cameras:16};
 for(const [name,limit] of Object.entries(caps))if(json[name]!==undefined&&(!Array.isArray(json[name])||json[name].length>limit))fail('Unsupported or excessive '+name+' for static preview.');
 let primitives=0;for(const mesh of json.meshes||[]){if(!Array.isArray(mesh.primitives))fail('Mesh primitives must be an array.');primitives+=mesh.primitives.length;if(primitives>2000)fail('Too many primitives.');for(const primitive of mesh.primitives){if(primitive.targets?.length)fail('Morph targets need the full studio.');}}
 for(const scene of json.scenes||[]){if(!Array.isArray(scene.nodes)||scene.nodes.length>1000||new Set(scene.nodes).size!==scene.nodes.length||scene.nodes.some(id=>!Number.isInteger(id)||!json.nodes?.[id]))fail('Invalid scene roots.');}
 if((json.images||[]).length)fail('Textured scenes need the full studio; this preview admits geometry and material colors only.');
 if((json.nodes?.length||0)>1000||(json.meshes?.length||0)>1000||(json.images?.length||0)>16)fail('Scene exceeds preview limits.');
 if((json.buffers||[]).length>1||(json.buffers||[]).some(b=>b.uri!==undefined||!Number.isSafeInteger(b.byteLength)||b.byteLength<0||b.byteLength>bin))fail('Only the embedded binary buffer is supported.');
 if((json.images||[]).some(i=>i.uri!==undefined||!Number.isInteger(i.bufferView)||!['image/png','image/jpeg'].includes(i.mimeType)))fail('Textures must be embedded PNG/JPEG buffer views.');
 const views=json.bufferViews||[];for(const v of views)if(v.buffer!==0||!Number.isSafeInteger(v.byteLength)||v.byteLength<0||!Number.isSafeInteger(v.byteOffset??0)||(v.byteOffset??0)<0||(v.byteOffset??0)+v.byteLength>bin)fail('Invalid embedded buffer view.');
 const parents=new Set();for(const n of json.nodes||[])for(const child of n.children||[]){if(parents.has(child))fail('Scene nodes must have a single parent.');parents.add(child);}
 const visiting=new Set(),done=new Set(),nodes=json.nodes||[];
 const visit=(id,depth=0)=>{if(!Number.isInteger(id)||!nodes[id]||depth>64||visiting.has(id))fail('Invalid or cyclic scene graph.');if(done.has(id))return;visiting.add(id);for(const child of nodes[id].children||[])visit(child,depth+1);visiting.delete(id);done.add(id);};for(let i=0;i<nodes.length;i++)visit(i);
 let elements=0;for(const a of json.accessors||[]){if(!Number.isSafeInteger(a.count)||a.count<0)fail('Invalid accessor count.');elements+=a.count;if(elements>1000000)fail('Scene exceeds one million accessor elements.');}
 // Refuse all extension payloads that could add remote resources or unsupported loaders.
 const walk=(value,depth=0)=>{if(depth>64)fail('Scene nesting is too deep.');if(value&&typeof value==='object'){if(Object.hasOwn(value,'extensions')&&Object.keys(value.extensions||{}).length)fail('Extension-dependent scenes need the full studio.');for(const [key,item] of Object.entries(value)){if(key==='uri')fail('Remote or data URLs are not loaded by this preview.');walk(item,depth+1);}}};walk(json);
 return {json,nodes:json.nodes?.length||0,meshes:json.meshes?.length||0,elements,bytes:buffer.byteLength};
}
globalThis.HoleModelPreviewModel=Object.freeze({inspect});})();
