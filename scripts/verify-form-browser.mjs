/* Real retained Form engine, actual opaque iframe transport, disposable profile. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const {chromium}=await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE || '../tcc-operations/runtime/browser-tools/node_modules/playwright/index.mjs')));
const root=fileURLToPath(new URL('../',import.meta.url));
const web=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<script src="/assets/vendor/form/engine.js"></script><script src="/assets/core.js"></script><script src="/assets/bridge.js"></script><script src="/assets/form.js"></script><main></main>');}const name=req.url.replace('/assets/','');res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await readFile(path.join(root,['bridge-client.js','form-adapter.js'].includes(name)?'sdk':'src',name)));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.goto(`http://127.0.0.1:${web.address().port}`);
 await page.evaluate(async()=>{globalThis.core=HoleCoreFactory.create({localStorage:null,broadcast:false});let project=FormEngine.createFormProject('Browser Form');const fabric=FormEngine.createGarmentTemplate('skirt');project=FormEngine.updateFormWorkspace(project,'fabric',{schema:FormEngine.FORM_FABRIC_WORKSPACE_SCHEMA,objectIds:[...fabric.pieces.map(p=>p.id),...fabric.seams.map(p=>p.id)],data:fabric});project=FormEngine.updateFormWorkspace(project,'cad',{schema:FormEngine.FORM_CAD_WORKSPACE_SCHEMA,objectIds:['cad:1'],data:{retained:'CAD authored data'}});globalThis.input=await core.importAsset({name:'Browser.form',blob:new Blob([FormEngine.serializeProject(project)],{type:'application/json'})});globalThis.mount=HoleForm.create({core});globalThis.context={assetId:input.asset.id,versionId:input.version.id};globalThis.handle=await mount.mount({id:'form-browser',context},document.querySelector('main'));});
 let frame=await (await page.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>globalThis.HoleFormMounted);
 await frame.locator('#allowance').fill('18');await frame.locator('#apply-allowance').click();await frame.waitForFunction(()=>HoleFormMounted.adapter.isDirty()&&!document.querySelector('#save').disabled);
 // Close/reopen the same durable instance before save, proving native recovery.
 await page.evaluate(async()=>{await handle.serialize();await handle.close();globalThis.handle=await mount.mount({id:'form-browser',context},document.querySelector('main'));});
 frame=await (await page.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>globalThis.HoleFormMounted);
 assert.equal(await frame.evaluate(()=>HoleFormMounted.adapter.getGarment().pieces[0].seamAllowance),18);
 await frame.locator('#save').click();await frame.waitForFunction(()=>document.querySelector('[role=status]').textContent.startsWith('Saved to Hole'));
 await frame.locator('#pdf').click();await frame.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('exported PDF'));
 await frame.locator('#dxf').click();await frame.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('exported DXF'));
 const result=await page.evaluate(async()=>{const current=await core.readAsset(input.asset.id),original=await core.readAsset(input.asset.id,input.version.id);const files=(await core.list('assets')).filter(a=>a.id!==input.asset.id);const outputs=[];for(const file of files){const r=await core.readAsset(file.id);outputs.push({mime:r.blob.type,text:await r.blob.text()});}return {saved:FormEngine.parseProject(await current.blob.text()),original:FormEngine.parseProject(await original.blob.text()),outputs,jobs:(await core.list('jobs')).map(j=>j.status)};});
 assert.equal(result.saved.workspaces.fabric.data.pieces[0].seamAllowance,18);assert.notEqual(result.original.workspaces.fabric.data.pieces[0].seamAllowance,18);assert.deepEqual(result.saved.workspaces.cad,result.original.workspaces.cad);assert.equal(result.outputs.length,2);assert.ok(result.outputs.find(o=>o.mime==='application/pdf').text.startsWith('%PDF-'));assert.match(result.outputs.find(o=>o.mime==='image/vnd.dxf').text,/SEAM_ALLOWANCE/);assert.ok(result.jobs.every(s=>s==='completed'));
 await page.evaluate(async()=>{const state=await handle.serialize();await handle.close();globalThis.handle=await mount.mount({id:'form-browser',context,editorState:state},document.querySelector('main'));});frame=await (await page.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>globalThis.HoleFormMounted);assert.equal(await frame.evaluate(()=>HoleFormMounted.adapter.getGarment().pieces[0].seamAllowance),18);
 console.log('PASS Form browser: native Fabric edit/recovery/save/reopen, other workspaces retained, real tiled PDF/DXF bytes, completed Activity');
} finally {await browser.close();web.close();}
