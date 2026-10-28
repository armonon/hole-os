/* Real shell/Core with disposable browser storage; held writes model a slow/refused checkpoint. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL('/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser = await chromium.launch({ headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page=await browser.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  if(process.env.HOLE_QA_SOURCE_OVERRIDE!=='0') await page.route('**/assets/runtime.js',async r=>r.fulfill({contentType:'text/javascript',body:await readFile(new URL('../src/runtime.js',import.meta.url),'utf8')}));
  await page.goto('http://127.0.0.1:5193'); await page.waitForFunction(()=>globalThis.HoleCore&&globalThis.HoleRuntimeModel);
  for(const mode of ['text','iframe']) {
    await page.evaluate(async mode=>{
      const root=document.createElement('section'); root.id='close-fixture'; root.style='position:fixed;inset:0;background:white;z-index:999999;padding:30px'; document.body.append(root);
      if(mode==='text')root.innerHTML='<input aria-label="Draft" value="Before"><button id="probe">Probe</button>';
      else {const frame=document.createElement('iframe'); frame.title='Close input fixture'; frame.setAttribute('sandbox','allow-scripts');frame.srcdoc='<input aria-label="Draft" value="Before"><button id="probe">Probe</button><script>window.clicks=0;document.querySelector("button").onclick=()=>clicks++;</script>';root.append(frame);await new Promise(r=>frame.onload=r);}
      window.closeFixture={root,held:false,fail:true,clicks:0}; if(mode==='text')root.querySelector('button').onclick=()=>closeFixture.clicks++;
      const core={...HoleCore,put:async(...args)=>{closeFixture.held=true;await new Promise(r=>closeFixture.release=r);if(closeFixture.fail)throw Object.assign(Error('Injected full storage'),{code:'QUOTA'});return HoleCore.put(...args);}};
      closeFixture.runtime=HoleRuntimeModel.createRuntime({core}); closeFixture.runtime.register('close-proof',{mount(){return{serialize:()=>({value:mode==='text'?root.querySelector('input').value:'iframe fixture'}),close:()=>root.remove()};}});
      closeFixture.instance=await closeFixture.runtime.open('close-proof',{root});
    },mode);
    let input=mode==='text'?page.getByLabel('Draft',{exact:true}):page.frameLocator('iframe[title="Close input fixture"]').getByLabel('Draft',{exact:true});
    const button=mode==='text'?page.locator('#close-fixture #probe'):page.frameLocator('iframe[title="Close input fixture"]').locator('#probe');
    await input.focus(); const box=await button.boundingBox();
    await page.evaluate(()=>{closeFixture.result=closeFixture.runtime.close(closeFixture.instance.id).then(()=>({ok:true}),e=>({ok:false,code:e.code}));});
    await page.waitForFunction(()=>closeFixture.held);
    await page.keyboard.type('LATE'); await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    assert.equal(await input.inputValue(),'Before',mode+' late input must be blocked');
    const clicks=mode==='text'?await page.evaluate(()=>closeFixture.clicks):await (await page.locator('iframe[title="Close input fixture"]').elementHandle()).contentFrame().then(f=>f.evaluate(()=>clicks));
    assert.equal(clicks,0,mode+' pointer must be blocked');
    const failed=await page.evaluate(async()=>{closeFixture.release();return closeFixture.result;}); assert.equal(failed.code,'QUOTA');
    assert.equal(await page.locator('#close-fixture').evaluate(n=>n.inert),false);
    if(mode==='iframe'){let focused=false;for(let n=0;n<128&&!focused;n++){await page.keyboard.press('Tab');focused=await input.evaluate(el=>el===document.activeElement);}assert.equal(focused,true,'keyboard navigation returns to the child draft');await page.keyboard.type('RESTORED');assert.ok((await input.inputValue()).includes('RESTORED'));}
    await input.fill('Retained after refusal');
    await page.evaluate(()=>{closeFixture.fail=false;closeFixture.held=false;closeFixture.result=closeFixture.runtime.close(closeFixture.instance.id);});
    await page.waitForFunction(()=>closeFixture.held); await page.evaluate(async()=>{closeFixture.release();await closeFixture.result;});
    assert.equal(await page.locator('#close-fixture').count(),0);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,sourceOverride:process.env.HOLE_QA_SOURCE_OVERRIDE!=='0',textAndOpaqueIframeInputBlocked:true,failedCheckpointRestoresEditing:true,retryCloses:true,errors}));
}finally{await browser.close();}
