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
 let titleCalls=0; const rows=[],started=deferred(),node=(tag,className,text)=>({tag,className,text,children:[],append(...values){this.children.push(...values);},setAttribute(){}});
 const read={asset:{id:'asset',state:'active',name:'Carry bytes'},version:{id:'version',mime:'text/plain'},blob:{async text(){started.resolve();if(textGate)await textGate.promise;return 'Preserved bytes';}}};
 const core={async list(kind){if(kind==='carry'){if(listGate){started.resolve();await listGate.promise;}return [{id:'carry',assetId:'asset',versionId:'version',revision:1}];}return [];},async readAsset(){return read;}};
 const noop=async()=>{};
 const ctx=vm.createContext({C:core,HoleContinuityModel:M,renderEpoch:10,navigation:{view:'carry',projectId:null},surface:{hidden:false},editor:null,
  window:{},DOMException,Blob,title(){titleCalls++;},button:node,el:node,main:{append(row){rows.push(row);}},
  H:{os:{classList:{remove(){}}},root:{querySelector(){return {focus(){}};}}},
  leavePublish:noop,disposePublish:noop,cancelPublishLeave(){},cleanURLs(){},empty:node});
 vm.runInContext(functions,ctx);return {ctx,rows,started,get titleCalls(){return titleCalls;}};
}

test('Normal Carry renders one selected-version preview and retains every action',async()=>{
 const {ctx,rows}=fixture();await ctx.renderCarry();assert.equal(rows.length,1);
 const previews=rows[0].children.filter(node=>node.tag==='pre');
 assert.deepEqual(previews.map(node=>node.text),['Preserved bytes'],'Normal Carry must render its selected-version preview exactly once');
 for(const label of ['Link selected version into project','Build a flow with this version','Remove from Carry'])assert.equal(rows[0].children.filter(node=>node.tag===label).length,1,'Retain normal action: '+label);
});

test('An already closed Carry consumer exits quietly before rendering',async()=>{
 const f=fixture();f.ctx.surface.hidden=true;await assert.doesNotReject(f.ctx.renderCarry());
 assert.equal(f.rows.length,0);assert.equal(f.titleCalls,0,'A canceled consumer must return before rendering its title');
});
