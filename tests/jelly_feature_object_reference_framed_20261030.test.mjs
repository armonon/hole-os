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
async function cancelledReference(delayed){
 const started=deferred(),release=deferred();const f=fixture({list:async type=>{
  if(type===delayed){started.resolve();await release.promise;}
  return type==='placements'?[{resourceId:'asset',sceneId:'project',policy:'pinned'}]:type==='projects'?[{id:'project',name:'Current project'}]:[];
 }});
 const pending=f.ctx.renderObject(1);await started.promise;f.ctx.renderEpoch=2;
 const before=JSON.stringify({rows:f.rows,buttons:f.buttons});release.resolve();await pending;
 assert.equal(JSON.stringify({rows:f.rows,buttons:f.buttons}),before,'An obsolete reference lookup must not append a section or placement button');
}
test('Leaving during placements lookup prevents stale reference UI',()=>cancelledReference('placements'));
test('Leaving during projects lookup prevents stale reference UI',()=>cancelledReference('projects'));
test('A current object retains useful references and exact original content',async()=>{
 const f=fixture({list:async type=>type==='placements'?[{resourceId:'asset',sceneId:'project',policy:'pinned'}]:type==='projects'?[{id:'project',name:'Current project'}]:[]});
 await f.ctx.renderObject(1);assert.ok(f.buttons.includes('Current project · Pinned'));
 for(const label of ['Edit','Carry','History','Export'])assert.ok(f.buttons.includes(label));
 assert.equal(await f.record.blob.text(),'Retained text');
});
