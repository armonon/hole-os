import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import '../src/continuity-model.js';
const source=await readFile(new URL('../src/continuity.js',import.meta.url),'utf8');
function declaration(from,to){const a=source.indexOf(from),b=source.indexOf(to,a+from.length);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const functions=declaration('  async function close()', '  function title(')+declaration('  async function renderCarry(', '  async function snapshot(');
const M=globalThis.HoleContinuityModel;
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function fixture({listGate,textGate}={}){
 const rows=[],started=deferred(),node=()=>({children:[],append(...values){this.children.push(...values);},setAttribute(){}});
 const read={asset:{id:'asset',state:'active',name:'Carry bytes'},version:{id:'version',mime:'text/plain'},blob:{async text(){started.resolve();if(textGate)await textGate.promise;return 'Preserved bytes';}}};
 const core={async list(kind){if(kind==='carry'){if(listGate){started.resolve();await listGate.promise;}return [{id:'carry',assetId:'asset',versionId:'version',revision:1}];}return [];},async readAsset(){return read;}};
 const noop=async()=>{};
 const ctx=vm.createContext({C:core,HoleContinuityModel:M,renderEpoch:10,navigation:{view:'carry',projectId:null},surface:{hidden:false},editor:null,
  window:{},DOMException,Blob,title(){},button:node,el:node,main:{append(row){rows.push(row);}},
  H:{os:{classList:{remove(){}}},root:{querySelector(){return {focus(){}};}}},
  leavePublish:noop,disposePublish:noop,cancelPublishLeave(){},cleanURLs(){},empty:node});
 vm.runInContext(functions,ctx);return {ctx,rows,started};
}

test('Carry cancels a pending text preview after workspace close',async()=>{
 const gate=deferred(),{ctx,rows,started}=fixture({textGate:gate});
 const pending=ctx.renderCarry();await started.promise;await ctx.close();
 const before=rows.map(row=>row.children.length);gate.resolve();await pending;
 assert.deepEqual(rows.map(row=>row.children.length),before,'Pending preview bytes must not append after close');
});

test('Carry suppresses old storage-list results after close and reopen',async()=>{
 const gate=deferred(),{ctx,rows,started}=fixture({listGate:gate});
 const pending=ctx.renderCarry();await started.promise;await ctx.close();ctx.surface.hidden=false;
 const before=rows.length;gate.resolve();await pending;
 assert.equal(rows.length,before,'A reopened workspace must not receive old Carry rows');
});

test('Close invalidates its closure token without inventing DOM token state',async()=>{
 const {ctx}=fixture();await ctx.close();
 assert.ok(ctx.renderEpoch>10);assert.equal(Object.hasOwn(ctx.H.os,'renderEpoch'),false,'Close must not invent a DOM render token field');
});

test('A refused workspace close preserves visibility and its current token',async()=>{
 const {ctx}=fixture();ctx.window.HoleLibraries={beforeLeave:async()=>{throw Error('Planned close refusal');}};
 await assert.rejects(ctx.close(),/Planned close refusal/);
 assert.equal(ctx.surface.hidden,false);assert.equal(ctx.renderEpoch,10);
});
