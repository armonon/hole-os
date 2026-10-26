import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE || '/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const context = await browser.newContext({serviceWorkers:'block'}); const page = await context.newPage(), errors = [], remote = []; page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) remote.push(r.url()); });
  const override = process.env.HOLE_QA_SOURCE_OVERRIDE === '1';
  if (override) {
    await page.route('**/assets/{model-store,stem-model,stem-worker}.js', async route => route.fulfill({ contentType: 'application/javascript', body: await readFile(new URL('../src/' + new URL(route.request().url()).pathname.split('/').at(-1), import.meta.url)) }));
    await page.route('**/assets/vendor/stems/**', async route => { const name = new URL(route.request().url()).pathname.split('/assets/')[1]; await route.fulfill({ contentType: name.endsWith('.wasm') ? 'application/wasm' : 'application/javascript', body: await readFile(new URL('../src/' + name, import.meta.url)) }); });
    await page.route('**/assets/actions.js', async route => route.fulfill({ contentType: 'application/javascript', body: (await Promise.all(['model-store.js','stem-model.js','stem-separation.js','actions.js'].map(f => readFile(new URL('../src/' + f, import.meta.url), 'utf8')))).join('\n') }));
  }
  if (!override) await context.route('**/assets/stem-worker.js', async route => { const response = await route.fetch(); await route.fulfill({response,headers:{...response.headers(),'content-security-policy':"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'"}}); });
  await page.goto(process.env.HOLE_QA_URL || 'http://127.0.0.1:5193'); await page.waitForFunction(() => window.HoleStems && window.HoleActions);
  const input = await page.evaluate(async () => {
    await HoleCore.ready; const rate = 44100, pcm = new Float32Array(rate);
    for (let i=0;i<pcm.length;i++) pcm[i]=.15*Math.sin(2*Math.PI*110*i/rate)+.08*Math.sin(2*Math.PI*440*i/rate)+((i%11025)<220?.2*Math.cos(i*.7):0);
    const source = await HoleCore.importAsset({ name:'Generated short stem fixture.wav', blob:HoleActionCodecs.wav([pcm],rate) });
    const ref={assetId:source.asset.id,versionId:source.version.id}; let missing;
    try { await HoleActions.run('audio.stems',{inputs:[ref]}); } catch(e) { missing=e.code; }
    const sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await(await HoleCore.readAsset(ref.assetId,ref.versionId)).blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');return {ref,missing,sourceHash};
  }); assert.equal(input.missing,'MODEL_MISSING');
  await page.evaluate(ref=>HoleContinuity.open('projects',{assetId:ref.assetId,scope:'OBJECT_PREVIEW'}),input.ref);
  await page.getByRole('button',{name:'Media tools',exact:true}).click();
  await page.getByRole('button',{name:'Separate stems',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Separate selected audio',exact:true}).isDisabled(),true);
  await page.getByLabel('Install downloaded model',{exact:true}).setInputFiles(process.env.HOLE_STEM_MODEL || '/tmp/hole-stems-qa/htdemucs_embedded.onnx');
  await page.getByText('Pinned model installed. It is verified again before inference.',{exact:true}).waitFor();
  const installed=await page.evaluate(()=>HoleStemModel.status());assert.equal(installed.installed,true);
  const began=Date.now();
  await page.getByRole('button',{name:'Separate selected audio',exact:true}).click();
  await page.getByText('Completed · outputs saved locally',{exact:true}).waitFor({timeout:180000});
  const result=await page.evaluate(async ref=>{
    const original=new Uint8Array(await(await HoleCore.readAsset(ref.assetId,ref.versionId)).blob.arrayBuffer());
    const job=(await HoleCore.list('jobs')).find(j=>j.actionId==='audio.stems'&&j.status==='completed'); const done={outputs:await Promise.all(job.outputs.map(async o=>({asset:await HoleCore.get('assets',o.assetId),version:await HoleCore.get('versions',o.versionId)})))}; const outputs=[];
    for(const item of done.outputs){const read=await HoleCore.readAsset(item.asset.id,item.version.id),bytes=new Uint8Array(await read.blob.arrayBuffer()),view=new DataView(bytes.buffer);let energy=0;for(let i=44;i<bytes.length;i+=2)energy+=(view.getInt16(i,true)/32768)**2;outputs.push({ref:{assetId:item.asset.id,versionId:item.version.id},parents:read.version.parentVersionIds,provenance:read.version.provenance,bytes:bytes.length,rate:view.getUint32(24,true),channels:view.getUint16(22,true),rms:Math.sqrt(energy/((bytes.length-44)/2)),hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')});}
    const after=new Uint8Array(await(await HoleCore.readAsset(ref.assetId,ref.versionId)).blob.arrayBuffer());let cancelCode,timeoutCode;const count=(await HoleCore.list('assets')).length;
    try{await HoleActions.run('audio.stems',{inputs:[ref],parameters:{timeoutMs:1}});}catch(e){timeoutCode=e.code;}
    try{await HoleActions.run('audio.stems',{inputs:[ref],onJob:job=>setTimeout(()=>HoleActions.cancel(job.id),100)});}catch(e){cancelCode=e.code;}
    const sourceHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',after))].map(v=>v.toString(16).padStart(2,'0')).join('');return {outputs,sourceHash,sourceUnchanged:after.length===original.length&&after.every((v,i)=>v===original[i]),cancelCode,timeoutCode,noRejectedOutputs:count===(await HoleCore.list('assets')).length};
  },input.ref);
  assert.equal(result.sourceHash,input.sourceHash);assert.equal(result.outputs.length,4); for(const o of result.outputs){assert.equal(o.bytes,44+44100*4);assert.equal(o.rate,44100);assert.equal(o.channels,2);assert.ok(o.parents.includes(input.ref.versionId));assert.equal(o.provenance.modelSHA256,installed.sha256);assert.ok(Number.isFinite(o.rms));}
  assert.ok(result.outputs.some(o=>o.rms>.00001));assert.equal(new Set(result.outputs.map(o=>o.hash)).size,4);assert.equal(result.sourceUnchanged,true);assert.equal(result.cancelCode,'CANCELLED');assert.equal(result.timeoutCode,'TIMEOUT');assert.equal(result.noRejectedOutputs,true);
  await page.reload();await page.waitForFunction(()=>window.HoleStems);const saved=await page.evaluate(async refs=>{await HoleCore.ready;return Promise.all(refs.map(async ref=>(await HoleCore.readAsset(ref.assetId,ref.versionId)).blob.size));},result.outputs.map(o=>o.ref));assert.deepEqual(saved,result.outputs.map(o=>o.bytes));
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);console.log(JSON.stringify({passed:true,sourceOverride:override,actualInstallRunUI:true,strictWorkerCSP:!override,browser:await browser.version(),elapsedMs:Date.now()-began,result,errors,remote}));
} finally { await browser.close(); }
