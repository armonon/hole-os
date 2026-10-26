/* Real retained Glyph engine, actual opaque iframe transport, disposable profile. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const {chromium}=await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE || '../tcc-operations/runtime/browser-tools/node_modules/playwright/index.mjs')));
const root=fileURLToPath(new URL('../',import.meta.url));
const web=createServer(async(req,res)=>{try{if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<script src="/assets/core.js"></script><script src="/assets/bridge.js"></script><script src="/assets/glyph.js"></script><main></main>');}const name=req.url.replace('/assets/','');res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await readFile(path.join(root,['bridge-client.js','glyph-adapter.js'].includes(name)?'sdk':'src',name)));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>web.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.goto(`http://127.0.0.1:${web.address().port}`);
 await page.evaluate(async()=>{globalThis.core=HoleCoreFactory.create({localStorage:null,broadcast:false});const project={schema:'glyph-studio/1',familyName:'Browser Proof',styleName:'Regular',metrics:{unitsPerEm:1000,ascender:800,descender:-200,xHeight:500,capHeight:700,defaultAdvance:600},glyphs:{A:{advanceWidth:600,strokes:[{kind:'brush',width:40,points:[[0,0],[300,700],[600,0]]}]}},kerning:[{left:'A',right:'V',value:-50}],curveSmoothing:.35};globalThis.input=await core.importAsset({name:'Browser.glyph.json',blob:new Blob([JSON.stringify(project)],{type:'application/json'})});globalThis.mount=HoleGlyph.create({core});globalThis.context={assetId:input.asset.id,versionId:input.version.id};globalThis.handle=await mount.mount({id:'glyph-browser',context},document.querySelector('main'));});
 let frame=await (await page.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>globalThis.HoleGlyphMounted);
 const bounds=await frame.locator('canvas').boundingBox();assert.ok(bounds);
 await page.mouse.move(bounds.x+100,bounds.y+160);await page.mouse.down();await page.mouse.move(bounds.x+180,bounds.y+100,{steps:8});await page.mouse.up();
 await frame.waitForFunction(()=>HoleGlyphMounted.adapter.getProject().glyphs.A.strokes.length===2 && !document.querySelector('#save').disabled);
 await frame.locator('#advance').fill('750');await frame.locator('#advance').press('Tab');await frame.waitForFunction(()=>globalThis.HoleGlyphMounted.adapter.isDirty());
 await frame.waitForFunction(()=>!document.querySelector('#save').disabled);
 // Close/reopen the same durable instance before save, proving native recovery.
 await page.evaluate(async()=>{await handle.serialize();await handle.close();globalThis.handle=await mount.mount({id:'glyph-browser',context},document.querySelector('main'));});
 frame=await (await page.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>globalThis.HoleGlyphMounted);
 assert.equal(await frame.evaluate(()=>HoleGlyphMounted.adapter.getProject().glyphs.A.advanceWidth),750);
 await frame.locator('#save').click();await frame.waitForFunction(()=>document.querySelector('[role=status]').textContent.startsWith('Saved to Hole'));
 await frame.locator('#ttf').click();await frame.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('exported real TTF'));
 await frame.locator('#otf').click();await frame.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('exported real OTF'));
 const result=await page.evaluate(async()=>{const current=await core.readAsset(input.asset.id),original=await core.readAsset(input.asset.id,input.version.id);const fonts=(await core.list('assets')).filter(a=>a.kind==='font');const values=[];for(const font of fonts){const r=await core.readAsset(font.id);values.push({mime:r.blob.type,signature:[...new Uint8Array(await r.blob.slice(0,4).arrayBuffer())],provenance:font.provenance});}return {saved:JSON.parse(await current.blob.text()),original:JSON.parse(await original.blob.text()),fonts:values,jobs:(await core.list('jobs')).map(j=>j.status)};});
 assert.equal(result.saved.glyphs.A.advanceWidth,750);assert.equal(result.saved.glyphs.A.strokes.length,2);assert.equal(result.original.glyphs.A.strokes.length,1);assert.equal(result.original.glyphs.A.advanceWidth,600);assert.equal(result.saved.kerning[0].value,-50);assert.equal(result.fonts.length,2);assert.deepEqual(result.fonts.find(f=>f.mime==='font/ttf').signature,[0,1,0,0]);assert.deepEqual(result.fonts.find(f=>f.mime==='font/otf').signature,[79,84,84,79]);assert.ok(result.jobs.every(s=>s==='completed'));
 await page.evaluate(async()=>{const state=await handle.serialize();await handle.close();globalThis.handle=await mount.mount({id:'glyph-browser',context,editorState:state},document.querySelector('main'));});frame=await (await page.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>globalThis.HoleGlyphMounted);assert.equal(await frame.evaluate(()=>HoleGlyphMounted.adapter.getProject().glyphs.A.advanceWidth),750);
 console.log('PASS Glyph browser: native edit/recovery/save/reopen, original and kerning retained, real TTF+OTF bytes, committed Activity jobs');
} finally {await browser.close();web.close();}
