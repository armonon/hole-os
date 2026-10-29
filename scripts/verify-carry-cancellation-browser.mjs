// Generated-assets qualification using disposable browser state and a delayed read.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const {chromium}=await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE||'/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser=await chromium.launch({headless:true,executablePath:process.env.HOLE_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const viewport=process.env.HOLE_PHONE==='1'?{width:320,height:720}:{width:1440,height:1000};
 const page=await browser.newPage({viewport,reducedMotion:'reduce'});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  let core;
  Object.defineProperty(window,'HoleCore',{configurable:true,get:()=>core,set(value){core={...value,readAsset:async(...args)=>{
   if(window.delayCarryRead&&args[0]===window.carryAuditAsset){window.carryReadStarted=true;await new Promise(resolve=>{window.releaseCarryRead=resolve;});}
   return value.readAsset(...args);
  }};}});
 });
 await page.goto(process.env.HOLE_URL||'http://127.0.0.1:5193');await page.waitForFunction(()=>window.HoleContinuity);
 const identity=await page.evaluate(async()=>{
  await HoleCore.ready;const r=await HoleCore.importAsset({name:'Carry cancellation audit.txt',blob:new Blob(['Retained Carry thought'],{type:'text/plain'})});
  await HoleCore.put('carry',{id:'carry-cancellation-audit',assetId:r.asset.id,versionId:r.version.id});
  window.carryAuditAsset=r.asset.id;window.delayCarryRead=true;window.carryAuditOpen=HoleContinuity.open('carry');
  return {assetId:r.asset.id,versionId:r.version.id};
 });
 await page.waitForFunction(()=>window.carryReadStarted);
 const cancelled=await page.evaluate(async()=>{
  await HoleContinuity.close();const rows=[...document.querySelectorAll('.hc-main>.hc-note')];const before=rows.map(n=>n.childElementCount);
  window.delayCarryRead=false;window.releaseCarryRead();await window.carryAuditOpen;
  return {hidden:document.querySelector('.hc-workspace').hidden,before,after:rows.map(n=>n.childElementCount),active:document.querySelector('.hf-os')?.classList.contains('hc-active')||false};
 });
 assert.equal(cancelled.hidden,true);assert.deepEqual(cancelled.after,cancelled.before,'closed Carry must not receive late content or controls');
 await page.evaluate(()=>HoleContinuity.open('carry'));
 await page.getByText('Retained Carry thought',{exact:true}).waitFor();
 const retained=await page.evaluate(async id=>({item:await HoleCore.get('carry','carry-cancellation-audit'),text:await (await HoleCore.readAsset(id.assetId,id.versionId)).blob.text(),overflow:document.documentElement.scrollWidth>innerWidth}),identity);
 assert.equal(retained.item.versionId,identity.versionId);assert.equal(retained.text,'Retained Carry thought');assert.equal(retained.overflow,false);assert.deepEqual(errors,[]);
 if(process.env.HOLE_EVIDENCE_DIR){await mkdir(process.env.HOLE_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.HOLE_EVIDENCE_DIR,'carry-recovery-'+viewport.width+'.png')});}
 console.log(JSON.stringify({passed:true,viewport,checks:['close cancels delayed Carry UI','reopen retains exact selected version and bytes','no unexpected browser errors or horizontal overflow']}));
}finally{await browser.close();}
