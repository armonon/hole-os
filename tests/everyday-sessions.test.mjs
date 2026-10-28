import test from 'node:test';
import assert from 'node:assert/strict';
await import(process.env.HOLE_PAPERWORK_SOURCE || '../src/everyday.js');
const M=globalThis.HoleEverydayModel;
test('new Paperwork drafts are scoped by stable instance; main and saved keys stay compatible',()=>{
 for(const kind of ['document','table','form']){
  assert.equal(M.paperworkDraftKey(kind,null),`paper-${kind}:new`);
  assert.equal(M.paperworkDraftKey(kind,'asset','one'),`paper-${kind}:asset`);
  assert.equal(M.paperworkDraftKey(kind,'asset','two'),M.paperworkDraftKey(kind,'asset','one'));
  const a=M.paperworkDraftKey(kind,null,'one'),b=M.paperworkDraftKey(kind,null,'two');assert.notEqual(a,b);assert.equal(a,M.paperworkDraftKey(kind,null,'one'));
  assert.notEqual(M.paperworkDraftKey(kind,null,'a:b'),M.paperworkDraftKey(kind,null,'a%3Ab'));
 }
 for(const id of ['',{},'a'.repeat(201)])assert.throws(()=>M.paperworkDraftKey('document',null,id),/identity/);
 assert.throws(()=>M.paperworkDraftKey('unknown',null,'one'),/kind/);
});
test('independent draft records recover only their identity, with same-asset stale ACK protection',async()=>{
 const records=new Map();const core={get:async(_,id)=>structuredClone(records.get(id)||null),put:async(_,value,{expectedRevision})=>{const previous=records.get(value.id);if((previous?.revision||0)!==expectedRevision)throw Object.assign(Error('Draft conflict'),{code:'CONFLICT'});const record=structuredClone({...value,revision:expectedRevision+1});records.set(value.id,record);return structuredClone(record);}};
 for(const kind of ['table','form']){
  const a=await M.draftSession(core,M.paperworkDraftKey(kind,null,'one'),{}),b=await M.draftSession(core,M.paperworkDraftKey(kind,null,'two'),{});
  await a.save({text:'one'});await b.save({text:'two'});assert.equal((await M.draftSession(core,M.paperworkDraftKey(kind,null,'one'),{})).value.text,'one');assert.equal((await M.draftSession(core,M.paperworkDraftKey(kind,null,'two'),{})).value.text,'two');assert.equal((await M.draftSession(core,M.paperworkDraftKey(kind,null),{})).recovered,false);
 }
 const id=M.paperworkDraftKey('table','shared','one'),a=await M.draftSession(core,id,{}),b=await M.draftSession(core,M.paperworkDraftKey('table','shared','two'),{});await a.save({text:'first'});await assert.rejects(b.save({text:'second'}),{code:'CONFLICT'});assert.equal(b.value.text,'second');assert.equal(b.failed,true);
});
