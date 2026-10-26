import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const context=vm.createContext({Blob,ArrayBuffer,TextEncoder,TextDecoder,structuredClone,crypto:webcrypto});
for(const file of ['../src/vendor/glyph/engine.js','../sdk/glyph-adapter.js'])vm.runInContext(await readFile(new URL(file,import.meta.url),'utf8'),context);
const engine=context.GlyphEngine;
function fixture(){
 const original=engine.newProject('Native Proof');original.glyphs.A={advanceWidth:600,strokes:[{kind:'brush',width:40,points:[[0,0],[300,700],[600,0]]}]};original.kerning=[{left:'A',right:'V',value:-50}];
 let head='version:1',commits=0,timeout=false;const requests=[],outputs=[];
 const client={async request(operation,payload,options){requests.push({operation,payload,options});if(operation==='resource.read')return{asset:{name:'Proof.glyph.json'},blob:engine.serializeProject(original)};if(operation==='resource.commit'){if(timeout){timeout=false;throw Object.assign(new Error('Ambiguous'),{code:'REQUEST_TIMEOUT'});}assert.equal(payload.baseVersionId,head);head=`version:${++commits+1}`;return{versionId:head};}if(operation==='resource.derive'){assert.equal(payload.versionId,head);outputs.push(...payload.outputs);return{outputs:[{assetId:'font:1'}]};}throw Error(operation);}};
 return{original,requests,outputs,client,adapter:context.HoleGlyphAdapter.create({client}),timeout:()=>timeout=true};
}
test('retained Glyph codec preserves authored strokes/kerning and compiles actual TTF and OTF bytes',async()=>{
 const f=fixture();await f.adapter.openGranted('asset:1','version:1');const p=f.adapter.getProject();p.glyphs.A.advanceWidth=720;f.adapter.replaceProject(p);assert.equal(f.adapter.isDirty(),true);await f.adapter.saveBack();assert.equal(f.adapter.isDirty(),false);
 const reopened=await engine.parseProjectFile(f.requests.find(r=>r.operation==='resource.commit').payload.blob);assert.equal(reopened.glyphs.A.advanceWidth,720);assert.equal(reopened.kerning[0].value,-50);assert.equal(reopened.glyphs.A.strokes[0].points.length,3);assert.equal(f.original.glyphs.A.advanceWidth,600);
 await f.adapter.exportFont('ttf');await f.adapter.exportFont('otf');assert.deepEqual([...new Uint8Array(await f.outputs[0].blob.arrayBuffer()).slice(0,4)],[0,1,0,0]);assert.equal(await f.outputs[1].blob.slice(0,4).text(),'OTTO');assert.equal(f.outputs[0].blob.type,'font/ttf');assert.equal(f.outputs[1].blob.type,'font/otf');
});
test('Glyph timeout retains exact commit request/bytes and rejects edits until retry ACK',async()=>{
 const f=fixture();await f.adapter.openGranted('asset:1','version:1');const p=f.adapter.getProject();p.familyName='Edited Proof';f.adapter.replaceProject(p);f.timeout();await assert.rejects(f.adapter.saveBack(),{code:'REQUEST_TIMEOUT'});assert.equal(f.adapter.isDirty(),true);assert.throws(()=>f.adapter.replaceProject(p),{code:'SAVE_PENDING'});await f.adapter.saveBack();const saves=f.requests.filter(r=>r.operation==='resource.commit');assert.equal(saves[0].options.requestId,saves[1].options.requestId);assert.equal(saves[0].payload.blob,saves[1].payload.blob);assert.equal(f.adapter.isDirty(),false);
});
test('Glyph recovery retains native editability and rejects lossy invalid native changes',async()=>{
 const f=fixture();await f.adapter.openGranted('asset:1','version:1');const p=f.adapter.getProject();p.glyphs.A.advanceWidth=800;await f.adapter.restoreRecovery(engine.serializeProject(p));assert.equal(f.adapter.getProject().glyphs.A.advanceWidth,800);assert.equal(f.adapter.isDirty(),true);const bad=f.adapter.getProject();bad.glyphs.A.advanceWidth=4000;assert.throws(()=>f.adapter.replaceProject(bad));assert.equal(f.adapter.getProject().glyphs.A.advanceWidth,800);
});
