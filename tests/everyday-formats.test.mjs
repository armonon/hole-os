import test from 'node:test';
import assert from 'node:assert/strict';
await import(process.env.HOLE_PAPERWORK_SOURCE || '../src/everyday.js');
const M=globalThis.HoleEverydayModel;
test('imported form IDs are own data properties, including prototype names',()=>{
 const form={version:1,fields:['__proto__','constructor','toString'].map(id=>({id,label:id,type:'text',required:true})),responses:[]};
 assert.throws(()=>M.formResponse(form,{}),/Complete/);
 const input=JSON.parse('{"__proto__":"first","constructor":"second","toString":"third"}');
 const result=M.formResponse(form,input);assert.deepEqual(JSON.parse(JSON.stringify(result.values)),input);assert.equal(Object.getPrototypeOf(result.values),null);
 assert.throws(()=>M.formResponse(form,Object.create(input)),/Complete/);
});
test('checkbox answers accept deliberate boolean true, not inherited or string values',()=>{
 const form={version:1,fields:[{id:'constructor',label:'Confirm',type:'checkbox',required:true}],responses:[]};
 assert.throws(()=>M.formResponse(form,{}),/Complete/);assert.throws(()=>M.formResponse(form,{constructor:'false'}),/Complete/);assert.equal(M.formResponse(form,{constructor:true}).values.constructor,true);
});
test('native form field validation is bounded and preserves unknown fields',()=>{
 const form={version:1,extra:{retained:true},fields:[{id:'a',label:'A',type:'text',future:'retained'}],responses:[]};assert.equal(M.validateForm(form),form);assert.equal(form.fields[0].future,'retained');
 for(const field of [null,{id:'',label:'a',type:'text'},{id:'a',label:{},type:'text'},{id:'a'.repeat(201),label:'a',type:'text'}])assert.throws(()=>M.validateForm({...form,fields:[field]}),/invalid/);
});
test('incomplete form drafts reopen for repair while saved forms still require questions and labels',()=>{
 const empty={version:1,fields:[],responses:[]};assert.equal(M.validateForm(empty,{draft:true}),empty);assert.throws(()=>M.validateForm(empty),/questions/);
 const incomplete={version:1,fields:[{id:'a',label:'',type:'text'}],responses:[]};assert.equal(M.validateForm(incomplete,{draft:true}),incomplete);assert.throws(()=>M.validateForm(incomplete),/invalid/);
});
