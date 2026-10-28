import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import '../src/core.js';
const source = await readFile(new URL('../src/optional-memory.js',import.meta.url),'utf8');
async function environment() {
  const indexedDB=new IDBFactory(), core=globalThis.HoleCoreFactory.create({indexedDB,localStorage:null,broadcast:false});await core.ready;
  const scope=vm.createContext({Blob,crypto:webcrypto});vm.runInContext(source,scope);let time=100000000;
  const api=scope.HoleMemory.create(core,{now:()=>time}), project=await core.put('projects',{id:'project',name:'Study',assetIds:[]});
  const asset=await core.importAsset({name:'source.txt',blob:new Blob(['source one'],{type:'text/plain'}),projectId:project.id});
  const value={projectId:project.id,text:'Continue with the second paragraph',retentionDays:30,sources:[{assetId:asset.asset.id,versionId:asset.version.id}]};
  return {api,core,scope,indexedDB,project,asset,value,advance:ms=>{time+=ms;}};
}
test('memory defaults off and explicit enable stores pinned provenance, scope and private sync policy',async()=>{
  const env=await environment();assert.equal((await env.api.policy(env.project.id)).enabled,false);
  await assert.rejects(env.api.save(env.value),e=>e.code==='MEMORY_DISABLED');await env.api.setEnabled(env.project.id,true);
  const item=await env.api.save(env.value);assert.equal(item.consent,'explicit');assert.equal(item.syncAllowed,false);assert.equal(item.scopeId,env.project.id);assert.equal(item.sources[0].versionId,env.asset.version.id);
  await env.core.commitAsset({assetId:env.asset.asset.id,baseVersionId:env.asset.version.id,blob:new Blob(['new head'],{type:'text/plain'}),operation:'test'});
  assert.equal((await env.api.recall(env.project.id))[0].sources[0].versionId,env.asset.version.id);
  await env.api.setEnabled(env.project.id,false);assert.equal((await env.api.recall(env.project.id)).length,0);assert.equal((await env.api.list(env.project.id)).length,1);
  env.core.close();
});
test('memory corrections use revision checks and retain expiry; exclude, expiry, export and forget are real',async()=>{
  const env=await environment();await env.api.setEnabled(env.project.id,true);let item=await env.api.save(env.value);const expiry=item.expiresAt;env.advance(1000);
  item=await env.api.save({...item,text:'Corrected thought',syncAllowed:true},{expectedRevision:item.revision});assert.equal(item.expiresAt,expiry);assert.equal(item.syncAllowed,true);
  await assert.rejects(env.api.save({...item,text:'stale'},{expectedRevision:1}),e=>e.code==='CONFLICT');
  item=await env.api.exclude(item.id,true,item.revision);assert.equal((await env.api.recall(env.project.id)).length,0);item=await env.api.exclude(item.id,false,item.revision);
  env.advance(31*86400000);assert.equal((await env.api.recall(env.project.id)).length,0);assert.equal((await env.api.list(env.project.id))[0].expired,true);
  const exported=JSON.parse(await (await env.api.exportScope(env.project.id)).text());assert.equal(exported.memories[0].text,'Corrected thought');assert.equal(exported.memories[0].sources[0].versionId,env.asset.version.id);
  await env.api.forget(item.id,item.revision);assert.equal((await env.api.list(env.project.id)).length,0);assert.equal(await (await env.core.readAsset(env.asset.asset.id)).blob.text(),'source one');env.core.close();
});
test('memory rejects other-project sources, overlong retention and missing version pins',async()=>{
  const env=await environment();await env.api.setEnabled(env.project.id,true);const other=await env.core.importAsset({name:'private.txt',blob:new Blob(['private'],{type:'text/plain'})});
  await assert.rejects(env.api.save({...env.value,sources:[{assetId:other.asset.id,versionId:other.version.id}]}),e=>e.code==='OUT_OF_SCOPE');
  await assert.rejects(env.api.save({...env.value,sources:[{assetId:env.asset.asset.id}]}),/exact saved version/);
  await assert.rejects(env.api.save({...env.value,retentionDays:366}),/365/);assert.equal((await env.core.list('memory')).length,0);env.core.close();
});
test('memory policy and corrections survive Core close/reopen, and trashed sources cease recall',async()=>{
  const env=await environment();await env.api.setEnabled(env.project.id,true);const item=await env.api.save(env.value);env.core.close();
  const core=globalThis.HoleCoreFactory.create({indexedDB:env.indexedDB,localStorage:null,broadcast:false});await core.ready;const api=env.scope.HoleMemory.create(core,{now:()=>100000000});
  assert.equal((await api.recall(env.project.id))[0].id,item.id);await core.trashAsset(env.asset.asset.id);assert.equal((await api.recall(env.project.id)).length,0);assert.equal((await api.list(env.project.id)).length,1);core.close();
});

class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.textContent='';this.value='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(name,value){this.attributes[name]=value;}
  get nodes(){return [this,...this.children.flatMap(child=>child.nodes)];}
  get selectedOptions(){return this.children.filter(child=>child.selected);}
}
test('memory UI enables a project, saves selected exact sources, corrects, excludes and forgets',async()=>{
  const env=await environment();env.scope.document={createElement:tag=>new Element(tag)};const root=new Element('main');await env.scope.HoleMemoryUI.mount(root,{core:env.core,projectId:env.project.id});
  const click=async text=>{const button=root.nodes.find(node=>node.tagName==='button'&&node.textContent===text);assert.ok(button,text);await button.onclick();};
  await click('Enable memory for this project');await click('Add a next thought');root.nodes.find(node=>node.tagName==='textarea').value='My next thought';root.nodes.find(node=>node.attributes['aria-label']==='Exact source versions').children[0].selected=true;
  await click('Save thought');let saved=(await env.core.list('memory'))[0];assert.equal(saved.text,'My next thought');assert.equal(saved.sources[0].versionId,env.asset.version.id);
  await click('Correct');root.nodes.find(node=>node.tagName==='textarea').value='My corrected thought';await click('Save correction');assert.equal((await env.core.list('memory'))[0].text,'My corrected thought');
  await click('Exclude from recall');assert.equal((await env.api.recall(env.project.id)).length,0);await click('Forget this memory');assert.equal((await env.core.list('memory')).length,0);env.core.close();
});
