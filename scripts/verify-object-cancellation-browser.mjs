import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE||'/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser=await chromium.launch({headless:true,executablePath:process.env.HOLE_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const viewport=process.env.HOLE_PHONE==='1'?{width:320,height:720}:{width:1440,height:1000};
 const page=await browser.newPage({viewport,reducedMotion:'reduce'});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  let core;Object.defineProperty(window,'HoleCore',{configurable:true,get:()=>core,set(value){core={...value,readAsset:async(...args)=>{
   const record=await value.readAsset(...args);
   if(window.delayObjectText&&args[0]===window.objectAuditAsset){const original=record.blob.text.bind(record.blob);record.blob.text=async()=>{window.objectTextStarted=true;await new Promise(r=>{window.releaseObjectText=r;});return original();};}
   return record;
  }};}});
 });
 await page.goto(process.env.HOLE_URL||'http://127.0.0.1:5193');await page.waitForFunction(()=>window.HoleContinuity);
 const id=await page.evaluate(async()=>{
  await HoleCore.ready;const record=await HoleCore.importAsset({name:'Object preview audit.txt',blob:new Blob(['Retained object preview'],{type:'text/plain'})});
  window.objectAuditAsset=record.asset.id;window.delayObjectText=true;window.objectAuditOpen=HoleContinuity.open('projects',{assetId:record.asset.id,placementId:null,versionId:null});
  return {assetId:record.asset.id,versionId:record.version.id};
 });
 await page.waitForFunction(()=>window.objectTextStarted);
 const observed=await page.evaluate(async()=>{
  await HoleContinuity.close();const main=document.querySelector('.hc-main');const before={text:main.textContent,count:main.childElementCount};
  window.delayObjectText=false;window.releaseObjectText();await window.objectAuditOpen;
  return {before,after:{text:main.textContent,count:main.childElementCount},hidden:document.querySelector('.hc-workspace').hidden};
 });
 assert.equal(observed.hidden,true);assert.deepEqual(observed.after,observed.before,'Closed object view receives no stale content');
 await page.evaluate(id=>HoleContinuity.open('projects',{assetId:id.assetId,placementId:null,versionId:null}),id);
 await page.getByText('Retained object preview',{exact:true}).waitFor();
 const retained=await page.evaluate(async id=>({text:await(await HoleCore.readAsset(id.assetId,id.versionId)).blob.text(),overflow:document.documentElement.scrollWidth>innerWidth}),id);
 assert.equal(retained.text,'Retained object preview');assert.equal(retained.overflow,false);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,viewport,checks:['close suppresses late actual object Blob preview','reopen retains original bytes','no page errors or overflow']}));
}finally{await browser.close();}
