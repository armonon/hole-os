import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import '../src/continuity-model.js';
const M=globalThis.HoleContinuityModel;
const source=await readFile(new URL('../src/continuity.js',import.meta.url),'utf8');
function declaration(from,to){const a=source.indexOf(from),b=source.indexOf(to,a+from.length);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const functions=declaration('  async function close()', '  function title(')+declaration('  async function renderCarry(', '  async function snapshot(');
const result=()=>({asset:{id:'asset',state:'active',name:'Carried thought'},version:{id:'version',mime:'text/plain'},blob:new Blob(['Retained thought'])});

test('cancelled Carry resolution does not start a storage read',async()=>{
 let reads=0;
 await assert.rejects(M.resolveCarry({readAsset:async()=>{reads++;return result();}},{assetId:'asset',versionId:'version'},{isCurrent:()=>false}),e=>e.name==='AbortError');
 assert.equal(reads,0);
});

test('Carry resolution refuses a result cancelled during an asynchronous storage read',async()=>{
 let release,current=true;const gate=new Promise(resolve=>{release=resolve;});
 const pending=M.resolveCarry({readAsset:async()=>{await gate;return result();}},{assetId:'asset',versionId:'version'},{isCurrent:()=>current});
 current=false;release();await assert.rejects(pending,e=>e.name==='AbortError');
});

test('closing Carry invalidates its consumer and suppresses all late result controls',async()=>{
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),reading=new Promise(resolve=>{started=resolve;});
 const rows=[];const node=()=>({children:[],append(...children){this.children.push(...children);},setAttribute(){}});
 const core={list:async type=>type==='carry'?[{id:'carry',assetId:'asset',versionId:'version',revision:1}]:[],readAsset:async()=>{started();await gate;return result();}};
 const noop=async()=>{};
 const ctx=vm.createContext({C:core,HoleContinuityModel:M,renderEpoch:10,navigation:{view:'carry',projectId:null},surface:{hidden:false},editor:null,
  window:{},DOMException,Blob,title(){},button:node,el:node,main:{append(row){rows.push(row);}},
  H:{os:{classList:{remove(){}}},root:{querySelector(){return {focus(){}};}}},
  leavePublish:noop,disposePublish:noop,cancelPublishLeave(){},cleanURLs(){},empty:node});
 vm.runInContext(functions,ctx);
 const rendering=ctx.renderCarry();await reading;
 await ctx.close();assert.equal(ctx.surface.hidden,true);assert.ok(ctx.renderEpoch>10,'Close must invalidate the pending render token');
 const before=rows.map(row=>row.children.length);release();await rendering;
 assert.deepEqual(rows.map(row=>row.children.length),before,'Cancelled results must not append headings, preview text or action controls');
});

test('ordinary Carry resolution retains its explicitly selected version and literal snippet behavior',async()=>{
 const selected=await M.resolveCarry({readAsset:async(assetId,versionId)=>{assert.equal(assetId,'asset');assert.equal(versionId,'version');return result();}},{assetId:'asset',versionId:'version'});
 assert.equal(await selected.blob.text(),'Retained thought');
 assert.deepEqual(await M.resolveCarry({}, {kind:'snippet',text:'literal <b>text</b>'}),{snippet:'literal <b>text</b>'});
});
