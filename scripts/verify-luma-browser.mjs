/* Opt-in real browser qualification; disposable browser profile, no public build writes. */
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE || '../tcc-operations/runtime/browser-tools/node_modules/playwright/index.mjs')));
import http from 'node:http'; import {readFile} from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
const server=http.createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<script src="/assets/core.js"></script><script src="/assets/bridge.js"></script><script src="/assets/luma.js"></script><main id="root"></main>');}const name=req.url.replace('/assets/','');res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await readFile(`${root}/${['bridge-client.js','luma-adapter.js'].includes(name)?'sdk':'src'}/${name}`));}catch(e){res.statusCode=404;res.end(e.message);}}).listen(5190,'127.0.0.1');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}); const page=await browser.newPage();page.setDefaultTimeout(5000); page.on('pageerror',e=>console.log('ERR',e.message)); page.on('console',m=>console.log('LOG',m.text().slice(0,300)));
try {
await page.goto('http://127.0.0.1:5190');
await page.evaluate(async()=>{globalThis.core=HoleCoreFactory.create({localStorage:null,broadcast:false}); const c=document.createElement('canvas');c.width=32;c.height=24;const x=c.getContext('2d');x.fillStyle='blue';x.fillRect(0,0,32,24);const blob=await new Promise(r=>c.toBlob(r));globalThis.input=await core.importAsset({name:'proof.png',blob});globalThis.mount=HoleLuma.create({core});globalThis.handle=await mount.mount({id:'luma-test',context:{assetId:input.asset.id,versionId:input.version.id}},document.querySelector('main'));});
await page.waitForTimeout(1000);const frame = await (await page.locator('iframe').elementHandle()).contentFrame(); await frame.waitForFunction(() => globalThis.HoleLumaMounted);
await frame.locator('#crop').click(); await frame.waitForFunction(() => document.querySelector('[role=status]').textContent.includes('Crop recovered'));
await frame.locator('#save').click(); await frame.waitForFunction(() => document.querySelector('[role=status]').textContent.startsWith('Saved to Hole'));
assert.deepEqual(await page.evaluate(async () => { const output = await core.readAsset(input.asset.id); const image = await createImageBitmap(output.blob); const original = await core.readAsset(input.asset.id, input.version.id); return [image.width, image.height, original.blob.size > 0]; }), [16,12,true]);
const nativeBytes = await frame.evaluate(async()=>Array.from(new Uint8Array(await (await HoleLumaMounted.studio.prepareProjectSave('Native')).blob.arrayBuffer())));
await page.evaluate(async bytes=>{await handle.close();globalThis.native=await core.importAsset({name:'proof.luma',blob:new Blob([new Uint8Array(bytes)],{type:'application/x-luma'})});globalThis.nativeContext={assetId:native.asset.id,versionId:native.version.id};globalThis.handle=await mount.mount({id:'native-test',context:nativeContext},document.querySelector('main'));},nativeBytes);
await page.waitForTimeout(500);let nativeFrame=await (await page.locator('iframe').elementHandle()).contentFrame();await nativeFrame.waitForFunction(()=>globalThis.HoleLumaMounted);await page.waitForTimeout(1000);
await nativeFrame.locator('#opacity').fill('0.5');await nativeFrame.locator('#opacity').press('Tab');await nativeFrame.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('Layer edit recovered'));
await page.evaluate(async()=>{await handle.close();globalThis.handle=await mount.mount({id:'native-test',context:nativeContext},document.querySelector('main'));});
await page.waitForTimeout(500);nativeFrame=await (await page.locator('iframe').elementHandle()).contentFrame();await nativeFrame.waitForFunction(()=>globalThis.HoleLumaMounted);assert.equal(await nativeFrame.evaluate(()=>HoleLumaMounted.studio.doc.layers[0].opacity),.5);
await page.waitForTimeout(1000);await nativeFrame.locator('#save').click();await nativeFrame.waitForFunction(()=>document.querySelector('[role=status]').textContent.startsWith('Saved to Hole'));
assert.equal(await nativeFrame.evaluate(()=>HoleLumaMounted.studio.activeDocumentState().dirty),false);
assert.deepEqual(await nativeFrame.evaluate(async()=>{const results={};for(const [key,fn] of Object.entries({parent:()=>parent.document.body,localStorage:()=>localStorage.length,indexedDB:()=>indexedDB.open('hole-file-library-v1'),topNavigation:()=>{top.location.href='https://example.invalid/';}})){try{fn();results[key]='FAILED';}catch{results[key]='denied';}}return results;}),{parent:'denied',localStorage:'denied',indexedDB:'denied',topNavigation:'denied'});
await page.evaluate(async()=>{const saved=await core.readAsset(native.asset.id);await handle.close();globalThis.handle=await mount.mount({id:'native-test',context:{assetId:native.asset.id,versionId:saved.version.id}},document.querySelector('main'));});
await page.waitForTimeout(500);nativeFrame=await (await page.locator('iframe').elementHandle()).contentFrame();await nativeFrame.waitForFunction(()=>globalThis.HoleLumaMounted);assert.equal(await nativeFrame.evaluate(()=>HoleLumaMounted.studio.doc.layers[0].opacity),.5);
await page.evaluate(()=>handle.revoke());
assert.match(await nativeFrame.evaluate(async()=>{try{const binding=HoleLumaMounted.adapter.getBinding();await HoleLumaMounted.client.request('resource.read',{assetId:binding.assetId,versionId:binding.versionId});return 'unexpected access';}catch(error){return error.code;}}),/CONNECTION_CLOSED|GRANT_REVOKED/);
console.log('PASS: real browser PNG crop/save/original; native edit/recovery/save/clean/reopen; sandbox parent/localStorage/IndexedDB denied');
} finally { await browser.close();server.close(); }
