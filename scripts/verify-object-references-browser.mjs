import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE||'/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser=await chromium.launch({headless:true,executablePath:process.env.HOLE_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const viewport=process.env.HOLE_PHONE==='1'?{width:320,height:720}:{width:1440,height:1000};
 const page=await browser.newPage({viewport,reducedMotion:'reduce'});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  let core;Object.defineProperty(window,'HoleCore',{configurable:true,get:()=>core,set(value){core={...value,list:async(...args)=>{
   const selected=window.referenceReadArmed&&args[0]===window.referenceReadMode;
   if(selected)window.referenceReadArmed=false;
   const rows=await value.list(...args);
   if(selected){window.referenceReadStarted=true;await new Promise(resolve=>{window.releaseReferenceRead=resolve;});}
   return rows;
  }};}});
 });
 await page.goto(process.env.HOLE_URL||'http://127.0.0.1:5193');await page.waitForFunction(()=>window.HoleContinuity);
 const assetId=await page.evaluate(async()=>{
  await HoleCore.ready;await HoleContinuity.close();const record=await HoleCore.importAsset({name:'Reference-read audit.txt',blob:new Blob(['Retained reference audit bytes'],{type:'text/plain'})});return record.asset.id;
 });
 const results=[];
 for(const mode of ['placements','projects']){
  await page.evaluate(async({assetId,mode})=>{
   await HoleContinuity.close();window.referenceReadMode=mode;window.referenceReadStarted=false;window.referenceReadArmed=true;
   window.referenceAuditOpen=HoleContinuity.open('projects',{assetId,placementId:null,versionId:null});
  },{assetId,mode});
  await page.waitForFunction(()=>window.referenceReadStarted);
  const observed=await page.evaluate(async()=>{
   await HoleContinuity.close();const main=document.querySelector('.hc-main');HoleContinuity.context().H.icons();const before=main.innerHTML;
   window.referenceReadArmed=false;window.releaseReferenceRead();await window.referenceAuditOpen;
   return {unchanged:main.innerHTML===before,hidden:document.querySelector('.hc-workspace').hidden};
  });
  results.push({mode,...observed});
 }
 await page.evaluate(assetId=>HoleContinuity.open('projects',{assetId,placementId:null,versionId:null}),assetId);
 await page.getByText('Retained reference audit bytes',{exact:true}).waitFor();
 const retained=await page.evaluate(async assetId=>({text:await(await HoleCore.readAsset(assetId)).blob.text(),overflow:document.documentElement.scrollWidth>innerWidth}),assetId);
 console.log(JSON.stringify({viewport,results,retained,pageErrors:errors}));
 for(const observed of results){assert.equal(observed.hidden,true);assert.equal(observed.unchanged,true,'Close during '+observed.mode+' must prevent late reference UI');}
 assert.equal(retained.text,'Retained reference audit bytes');assert.equal(retained.overflow,false);assert.deepEqual(errors,[]);
}finally{await browser.close();}
