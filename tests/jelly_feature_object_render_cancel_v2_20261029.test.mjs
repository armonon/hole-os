import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/continuity.js',import.meta.url),'utf8');
const start=source.indexOf('  async function renderObject('),end=source.indexOf('\n  const studios =',start);
assert.ok(start>=0&&end>start,'Actual object renderer is required');
const renderer=source.slice(start,end);
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture({blob=new Blob(['Retained text'],{type:'text/plain'}),pinned=false,getAsset,list}={}){
 const rows=[],buttons=[],titles=[];
 const node=(tag,classes='',text='')=>({tag,classes,text,children:[],append(...children){this.children.push(...children);}});
 const asset={id:'asset',name:'Retained.txt',state:'active'},record={asset,version:{id:'version',mime:blob.type,createdAt:1},blob};
 const ctx=vm.createContext({Blob,renderEpoch:1,navigation:{assetId:'asset',placementId:pinned?'pin':null,versionId:null},window:{},
  C:{get:async table=>table==='assets'?(getAsset?getAsset():asset):{policy:'pinned',versionId:'version'},readAsset:async()=>record,list:list|| (async()=>[])},
  main:{append(...nodes){rows.push(...nodes);}},title(...args){titles.push(args[0]);},button(label){buttons.push(label);return node('button','',label);},el:node,
  date:()=>'',context:()=>({}),section(label){const row=node('section','',label);rows.push(row);return row;},empty:node});
 vm.runInContext(renderer,ctx);return {ctx,rows,buttons,titles,record};
}
for(const [label,mime,pinned] of [['text','text/plain',false],['pinned JSON','application/json',true]])test('Leaving an object suppresses its delayed '+label+' preview',async()=>{
 const started=deferred(),release=deferred();const blob={type:mime,size:20,async text(){started.resolve();await release.promise;return 'Late old object bytes';}};
 const f=fixture({blob,pinned});const pending=f.ctx.renderObject(1);await started.promise;
 f.ctx.renderEpoch=2;const before={rows:f.rows.length,buttons:f.buttons.length};release.resolve();await pending;
 assert.deepEqual({rows:f.rows.length,buttons:f.buttons.length},before,'A cancelled object must not append old preview or controls');
});
test('Leaving during a draft read suppresses stale recovery controls',async()=>{
 const started=deferred(),release=deferred();const f=fixture({list:async type=>{if(type==='drafts'){started.resolve();await release.promise;return [{assetId:'asset',editor:'text'}];}return [];}});
 const pending=f.ctx.renderObject(1);await started.promise;f.ctx.renderEpoch=2;
 const before={rows:f.rows.length,buttons:f.buttons.length};release.resolve();await pending;
 assert.deepEqual({rows:f.rows.length,buttons:f.buttons.length},before,'Old draft results must not add recovery or used-in controls');
});
test('An obsolete missing-asset read does not replace the new view title',async()=>{
 const started=deferred(),release=deferred();const f=fixture({getAsset:async()=>{started.resolve();await release.promise;return undefined;}});
 const pending=f.ctx.renderObject(1);await started.promise;f.ctx.renderEpoch=2;release.resolve();await pending;
 assert.deepEqual(f.titles,[],'Obsolete missing-resource results must not write a title');
});
test('An ordinary current object retains its exact preview and useful actions',async()=>{
 const f=fixture();await f.ctx.renderObject(1);
 assert.ok(f.rows.some(row=>row.classes==='hc-preview'&&row.text==='Retained text'));
 for(const label of ['Edit','Carry','History','Export'])assert.ok(f.buttons.includes(label),label+' is retained');
 assert.equal(await f.record.blob.text(),'Retained text');assert.deepEqual(f.titles,['LIVE OBJECT']);
});
