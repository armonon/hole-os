import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import vm from 'node:vm';
const repo=process.env.HOLE_TEST_REPO||fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
assert.ok(repo,'Host must supply the isolated repository');
const require=createRequire(repo+'/package.json');
const {IDBFactory}=require('fake-indexeddb');
await import(pathToFileURL(repo+'/src/core.js'));
const source=await readFile(repo+'/src/continuity.js','utf8');
const from=source.indexOf('  async function flushDraft('),to=source.indexOf('  function finishEditing()',from);
assert.ok(from>=0&&to>from);
const code=source.slice(from,to);
function harness(saveDraft){
 const editor={assetId:'asset',baseVersionId:'version',id:'draft',revision:0,input:{value:'Draft text',selectionStart:0,selectionEnd:0,scrollTop:0},label:{dataset:{}},dirty:true,changed:true,failed:false,pending:Promise.resolve()};
 const ctx=vm.createContext({editor,clearTimeout,C:{saveDraft}});vm.runInContext(code,ctx);return {editor,flush:()=>ctx.flushDraft()};
}
test('selection-only and scroll-only changes survive durable database reopen',async()=>{
 const indexedDB=new IDBFactory();const core=HoleCoreFactory.create({indexedDB,localStorage:null,broadcast:false});
 const original=await core.importAsset({name:'Position.txt',blob:new Blob(['Original'],{type:'text/plain'})});
 const {editor,flush}=harness(snapshot=>core.saveDraft(snapshot));editor.assetId=original.asset.id;editor.baseVersionId=original.version.id;
 try{
  await flush();editor.input.selectionStart=2;editor.input.selectionEnd=7;editor.input.scrollTop=49;await flush();
  assert.equal(editor.changed,false);assert.equal(editor.failed,false);core.close();
  const reopened=HoleCoreFactory.create({indexedDB,localStorage:null,broadcast:false});
  try{const draft=await reopened.get('drafts','draft');assert.deepEqual(draft.selection,{start:2,end:7});assert.equal(draft.scroll,49);assert.equal(draft.text,'Draft text');assert.equal((await reopened.list('versions')).length,1);}finally{reopened.close();}
 }finally{core.close();}
});
test('identical acknowledged text and position do not cause redundant writes',async()=>{
 let writes=0;const {flush}=harness(async()=>({revision:++writes}));await flush();await flush();assert.equal(writes,1);
});
test('position moving during a pending write is drained before flush resolves',async()=>{
 const rows=[];let editor;const h=harness(async snapshot=>{rows.push(JSON.parse(JSON.stringify(snapshot)));if(rows.length===1){editor.input.selectionStart=3;editor.input.selectionEnd=8;editor.input.scrollTop=72;}return {revision:rows.length};});editor=h.editor;
 await h.flush();assert.equal(rows.length,2);assert.deepEqual(rows.at(-1).selection,{start:3,end:8});assert.equal(rows.at(-1).scroll,72);
});
test('position write refusal stays visible and retry preserves the new position',async()=>{
 let writes=0,refuse=false;const rows=[];const {editor,flush}=harness(async snapshot=>{if(refuse)throw Error('Storage refused');rows.push(JSON.parse(JSON.stringify(snapshot)));return {revision:++writes};});
 await flush();editor.input.selectionStart=1;editor.input.selectionEnd=6;editor.input.scrollTop=34;refuse=true;
 await assert.rejects(flush(),/Storage refused/);assert.equal(editor.failed,true);assert.equal(editor.label.dataset.error,'true');
 refuse=false;await flush();assert.equal(editor.failed,false);assert.equal(editor.label.dataset.error,'false');assert.deepEqual(rows.at(-1).selection,{start:1,end:6});assert.equal(rows.at(-1).scroll,34);
});

test('returning to acknowledged bytes clears stale changed state without a read loop',async()=>{
 let writes=0;const {editor,flush}=harness(async()=>({revision:++writes}));await flush();
 editor.changed=true;editor.label.textContent='Saving draft…';let reads=0;
 Object.defineProperty(editor.input,'value',{get(){if(++reads>15)throw Error('Repeated unchanged flush loop');return 'Draft text';}});
 await flush();assert.equal(editor.changed,false);assert.equal(writes,1);assert.equal(editor.label.textContent,'Draft saved locally');
});
