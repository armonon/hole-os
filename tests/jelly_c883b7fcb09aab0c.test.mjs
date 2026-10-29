import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL("../src/continuity.js",import.meta.url),'utf8');
const marker="async function flushDraft(current = editor) {";const start=source.indexOf(marker);const end=source.indexOf("\n  function finishEditing() {\n    if (!editor) return Promise.resolve(true);\n    const current = edi",start+marker.length);
assert.ok(start>=0&&end>start,'Actual selected function must exist');
const declaration=source.slice(start,end);
function load(globals={}){const ctx=vm.createContext({setTimeout,clearTimeout,...globals});vm.runInContext(declaration,ctx);return ctx;}
const scenarios=[{"name": "flushDraft_regression_identical_flushes", "start": "saved", "steps": [{"op": "set", "field": "input.selectionStart", "value": 5, "outcome": "success"}, {"op": "flush", "field": "input.value", "value": "Working text", "outcome": "success"}, {"op": "set", "field": "input.selectionStart", "value": 5, "outcome": "success"}, {"op": "flush", "field": "input.value", "value": "Working text", "outcome": "success"}, {"op": "assert", "field": "failed", "value": false, "outcome": ""}, {"op": "assert", "field": "label.dataset.error", "value": "false", "outcome": ""}, {"op": "assert", "field": "attempts", "value": 2, "outcome": ""}, {"op": "assert", "field": "saved.text", "value": "Working text", "outcome": ""}]}];
for(const scenario of scenarios)test(scenario.name,async()=>{
 let failures=0,attempts=0;const rows=[];
 const editor={id:'draft',assetId:'asset',baseVersionId:'version',revision:0,input:{value:'Working text',selectionStart:0,selectionEnd:0,scrollTop:0},label:{dataset:{},textContent:''},dirty:true,changed:true,failed:false,pending:Promise.resolve()};
 const ctx=load({editor,C:{saveDraft:async snapshot=>{attempts++;if(failures){failures--;throw Error('Planned storage refusal');}rows.push(JSON.parse(JSON.stringify(snapshot)));return {revision:rows.length};}},HoleRuntime:{checkpoint:async()=>{}}});
 if(scenario.start==='saved')await ctx.flushDraft(editor);
 const read=field=>{if(field==='writes')return rows.length;if(field==='attempts')return attempts;let value=field.startsWith('saved.')?rows.at(-1):editor;const parts=field.startsWith('saved.')?field.slice(6).split('.'):field.split('.');for(const part of parts)value=value?.[part];return value;};
 for(const step of scenario.steps){
  if(step.op==='set'){const field=step.field.slice(6);editor.input[field]=step.value;if(field==='value'){editor.changed=true;editor.dirty=true;}}
  else if(step.op==='refuse'){failures++;await assert.rejects(()=>ctx.flushDraft(editor),/Planned storage refusal/);}
  else if(step.op==='flush'){if(step.outcome==='failure')await assert.rejects(()=>ctx.flushDraft(editor),/Planned storage refusal/);else await ctx.flushDraft(editor);}
  else if(step.op==='assert')assert.deepEqual(read(step.field),step.value,step.field);
 }
 const lastInput=scenario.steps.filter(step=>step.op==='set'&&step.field==='input.value').at(-1)?.value??'Working text';
 assert.equal(editor.input.value,lastInput,'Draft operations must preserve the latest input bytes');
 const lastAction=scenario.steps.filter(step=>step.op!=='assert').at(-1);
 if(lastAction?.op==='flush')assert.equal(rows.at(-1)?.text,editor.input.value,'A successful flush must durably acknowledge the latest text');
});
