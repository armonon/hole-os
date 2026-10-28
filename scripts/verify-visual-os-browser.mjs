// Generated app, actual runtime and durable bytes. Visual presentation never replaces saved work.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE||'/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const directory=process.env.HOLE_VISUAL_ARTIFACTS||'/tmp/hole-visual-overhaul';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.HOLE_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const observations=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},hasTouch:true});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.HOLE_URL||'http://127.0.0.1:5193');await page.waitForFunction(()=>window.HoleDesign&&window.HoleContinuity&&document.querySelector('.hd-widget-board'));
  const ids=await page.evaluate(async()=>{
    await HoleCore.ready;const project=await HoleCore.put('projects',{id:'visual-proof',name:'Night garden',spaceId:'studio'});
    const note=await HoleCore.importAsset({name:'First thought.md',projectId:project.id,blob:new Blob(['A thought worth returning to.'],{type:'text/markdown'})});
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=360;const c=canvas.getContext('2d');const g=c.createLinearGradient(0,0,480,360);g.addColorStop(0,'#a294ce');g.addColorStop(1,'#f5d8bc');c.fillStyle=g;c.fillRect(0,0,480,360);c.fillStyle='#fff9';c.beginPath();c.arc(260,160,90,0,Math.PI*2);c.fill();
    const image=await HoleCore.importAsset({name:'Color study.png',projectId:project.id,blob:await new Promise(r=>canvas.toBlob(r))});
    const glyph=await HoleCore.importAsset({name:'Garden.glyph.json',projectId:project.id,blob:new Blob([JSON.stringify({schema:'glyph-studio/1',familyName:'Garden',styleName:'Regular',metrics:{unitsPerEm:1000,ascender:800,descender:-200,xHeight:500,capHeight:700,defaultAdvance:600},glyphs:{A:{advanceWidth:600,strokes:[{kind:'brush',width:40,points:[[40,0],[300,700],[560,0]]},{kind:'brush',width:30,points:[[160,250],[440,250]]}]}},kerning:[],curveSmoothing:.35})],{type:'application/json'})});
    const audio=await HoleCore.importAsset({name:'Listening.wav',projectId:project.id,blob:HoleActionCodecs.wav([Float32Array.from({length:48000},(_,i)=>.1*Math.sin(i*2*Math.PI*220/48000))],48000)});
    return {project:project.id,note:note.asset.id,noteVersion:note.version.id,image:image.asset.id,glyph:glyph.asset.id,audio:audio.asset.id};
  });
  async function screenshot(name){await page.waitForTimeout(450);await page.screenshot({path:`${directory}/${name}.png`,style:".hc-toast{visibility:hidden!important}"});observations.push({name,...await page.evaluate(()=>({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth}))});}
  await page.evaluate(()=>HoleWelcome.open());await page.locator('.hd-widget-board').waitFor();
  assert.equal(await page.locator('.hd-widget-board').getByText('Garden.glyph.json',{exact:true}).count(),0,'no private titles before reveal');
  await page.getByRole('button',{name:'Show recent local work',exact:true}).click();await page.getByRole('button',{name:'Hide recent work',exact:true}).waitFor();
  assert.ok(await page.locator('.hd-widget-recents button').count()>0);
  await page.getByRole('button',{name:'Hide recent work',exact:true}).click();assert.equal(await page.locator('.hd-widget-recents').count(),0);
  await page.getByRole('button',{name:'Use quiet motion',exact:true}).click();assert.equal(await page.evaluate(()=>HoleDesign.moving()),false);
  await page.getByRole('button',{name:'Use fluid motion',exact:true}).click();
  await page.locator('.hw-welcome-scroll').evaluate(n=>n.scrollTop=0);await screenshot('welcome');
  await page.evaluate(ids=>HoleContinuity.open('projects',{projectId:ids.project,assetId:null,presentation:'flat'}),ids);
  const workspace=page.locator('.hc-workspace');
  assert.equal(await page.locator('.hs-panel[data-kind=desktop] .hc-card-preview').first().evaluate(n=>n.getBoundingClientRect().width<=100),true);
  assert.equal(await page.locator('.hc-project-details').getAttribute('open'),null);
  const imageCard=page.locator(`.hs-panel[data-kind=desktop] .hs-object[data-asset-id="${ids.image}"] .hc-card`);const cardBounds=await imageCard.boundingBox();
  await page.mouse.move(cardBounds.x+30,cardBounds.y+30);await page.mouse.down();await page.mouse.move(cardBounds.x+90,cardBounds.y+55,{steps:8});await page.mouse.up();
  await page.waitForFunction(async id=>(await HoleCore.list('placements')).some(p=>p.resourceId===id),ids.image);assert.equal(await page.evaluate(()=>HoleContinuity.navigation.assetId),null,'drag does not open the material');
  const placed=await page.evaluate(async id=>(await HoleCore.list('placements')).find(p=>p.resourceId===id),ids.image);
  await imageCard.focus();await page.keyboard.press('Alt+ArrowRight');await page.waitForFunction(async({id,x})=>(await HoleCore.list('placements')).find(p=>p.resourceId===id)?.x===x+10,{id:ids.image,x:placed.x});
  const afterMove=await page.evaluate(async id=>(await HoleCore.list('placements')).find(p=>p.resourceId===id),ids.image);
  const at=await imageCard.boundingBox();await page.mouse.move(at.x+30,at.y+30);await page.mouse.down();await page.mouse.move(at.x+65,at.y+65,{steps:5});await page.evaluate(()=>dispatchEvent(new Event('blur')));await page.mouse.up();
  assert.equal(await page.evaluate(async id=>(await HoleCore.get('placements',id)).x,afterMove.id),afterMove.x,'cancelled drag leaves durable position unchanged');
  const noteCard=page.locator(`.hs-panel[data-kind=desktop] .hs-object[data-asset-id="${ids.note}"] .hc-card`);const nr=await noteCard.boundingBox();await page.touchscreen.tap(nr.x+nr.width/2,nr.y+30);await page.waitForFunction(id=>HoleContinuity.navigation.assetId===id,ids.note);
  await page.getByRole('button',{name:'Further out',exact:true}).click();await page.locator('.hs-panel[data-kind=desktop]').waitFor();await page.waitForTimeout(650);assert.equal(await page.getByRole('dialog').count(),0,'a released touch never opens stale tools later');
  await imageCard.scrollIntoViewIfNeeded();const longBounds=await imageCard.boundingBox(),touch=await page.context().newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:longBounds.x+30,y:longBounds.y+30}]});await page.waitForTimeout(680);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.locator('.hd-quick-tools').waitFor();assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await page.evaluate(()=>HoleContinuity.navigation.assetId),null,'long press reveals tools without opening the file');await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await touch.detach();
  await screenshot('project');
  await page.getByRole('button',{name:'Float workspace window',exact:true}).click();
  assert.equal(await workspace.getAttribute('data-windowed'),'true');
  const before=await workspace.boundingBox(),header=await workspace.locator('.hc-header').boundingBox();
  await page.mouse.move(header.x+120,header.y+28);await page.mouse.down();await page.mouse.move(header.x+155,header.y+53,{steps:5});await page.mouse.up();
  const moved=await workspace.boundingBox();assert.ok(moved.x>before.x+20&&moved.y>before.y+15,'workspace header moves the current app');
  await page.getByRole('button',{name:'Resize workspace',exact:true}).focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Workspace window layout'});await dialog.getByLabel('Width',{exact:true}).fill('1000');await dialog.getByLabel('Height',{exact:true}).fill('650');await page.getByRole('button',{name:'Apply workspace layout',exact:true}).click();
  await dialog.waitFor({state:'detached'});assert.equal(Math.round((await workspace.boundingBox()).width),1000);
  await page.getByRole('button',{name:'Expand workspace',exact:true}).click();
  await page.getByRole('button',{name:'Full screen workspace',exact:true}).click();assert.equal(await page.locator('.hf-os').getAttribute('data-hd-fullscreen'),'true');
  await page.getByRole('button',{name:'Leave full screen workspace',exact:true}).focus();await page.keyboard.press('Escape');assert.equal(await workspace.getAttribute('data-hd-fullscreen'),'false');
  await page.locator(`.hc-card[data-asset-id="${ids.image}"]`).click({button:'right'});
  await page.getByRole('dialog').getByRole('button',{name:'Convert or resize',exact:true}).waitFor();assert.equal(await page.locator('.hd-quick-tools').count(),1);
  await screenshot('quick-tools');await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(ids=>HoleContinuity.open('projects',{projectId:ids.project,assetId:ids.glyph}),ids);
  await page.getByRole('button',{name:'Open in Glyph',exact:true}).click();
  const frame=await(await page.locator('iframe[title="Glyph native font project editor"]').elementHandle()).contentFrame();await frame.waitForFunction(()=>window.HoleGlyphMounted);
  await frame.waitForFunction(()=>document.body.dataset.holeWorkbench==='true');
  assert.notEqual(await frame.locator('body').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(25, 29, 36)','shared editor theme applied');
  await frame.getByLabel('Family',{exact:true}).fill('Unfinished Garden');
  const instance=await page.evaluate(()=>HoleRuntime.list().find(i=>i.appId==='hole.glyph').id);
  await page.getByRole('button',{name:'Full screen Glyph',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.hc-studio-host')?.dataset.hdFullscreen==='true');
  const bounds=await page.locator('.hc-studio-host').boundingBox();assert.equal(Math.round(bounds.width),1440);assert.equal(Math.round(bounds.height),1000);
  assert.equal(await page.locator('.hf-dock').evaluate(n=>n.inert),true);
  await page.locator('.hf-system-handle').hover();await page.waitForFunction(()=>document.querySelector('.hf-os').dataset.dockRevealed==='true');
  await page.setViewportSize({width:320,height:720});assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'native editor reflows at 320px');assert.equal(await frame.getByLabel('Family',{exact:true}).inputValue(),'Unfinished Garden');await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>HoleWelcome.applyPreferences({theme:'dark',quiet:true}));await frame.waitForFunction(()=>getComputedStyle(document.documentElement).colorScheme==='dark');assert.equal(await frame.locator('button').first().evaluate(n=>getComputedStyle(n).transitionDuration),'0s');await screenshot('studio-dark');await page.evaluate(()=>HoleWelcome.applyPreferences({theme:'light',quiet:false}));await frame.waitForFunction(()=>getComputedStyle(document.documentElement).colorScheme==='light');
  await screenshot('studio-fullscreen');
  await page.evaluate(()=>{const original=HoleRuntime;window.auditOriginalRuntime=original;window.HoleRuntime={...original,checkpoint:()=>Promise.reject(Error('Visual checkpoint refusal'))};HoleWindows.minimizeToDesktop('desk');});
  await page.getByText('Visual checkpoint refusal',{exact:true}).waitFor();assert.equal(await page.locator('.hc-studio-host').evaluate(n=>n.hidden),false);await page.evaluate(()=>window.HoleRuntime=window.auditOriginalRuntime);
  const swipe=async fraction=>{const handle=page.locator('.hf-system-handle'),r=await handle.boundingBox(),height=await page.evaluate(()=>HoleOS.field.clientHeight);await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2-height*fraction,{steps:10});await page.mouse.up();};
  await swipe(.12);assert.equal(await page.locator('.hf-os').getAttribute('data-dock-revealed'),'true');assert.equal(await page.locator('.hc-studio-host').evaluate(n=>n.hidden),false);
  await page.evaluate(()=>HoleOS.openDrawer({focus:false}));await page.waitForFunction(()=>document.querySelector('.hc-studio-host').inert);
  assert.equal(await page.locator('.hf-drawer').evaluate(n=>getComputedStyle(n).zIndex),'240');await screenshot('drawer');
  await page.evaluate(()=>HoleOS.closeDrawer({animate:false}));await page.waitForFunction(()=>!document.querySelector('.hc-studio-host').inert);
  assert.equal(await frame.getByLabel('Family',{exact:true}).inputValue(),'Unfinished Garden');
  await page.evaluate(()=>{window.visualTrace=[];document.addEventListener('pointerdown',e=>visualTrace.push({type:e.type,tag:e.target.tagName,cls:e.target.className,x:e.clientX,y:e.clientY}),true);HoleOS.root.addEventListener('hole:desktop-travel',e=>visualTrace.push({type:e.type,to:e.detail.destination}));});
  await swipe(.35);try{await page.waitForFunction(()=>document.querySelector('.hc-studio-host').hidden&&document.querySelector('.hc-workspace').hidden);}catch(error){console.log(await page.evaluate(()=>({trace:visualTrace,state:HoleOS.os.dataset,stage:document.querySelector('.hf-edge-preview').dataset,workspace:document.querySelector('.hc-workspace').hidden,host:document.querySelector('.hc-studio-host').hidden,alerts:[...document.querySelectorAll('.hc-toast')].map(n=>n.textContent)})));throw error;}assert.equal(await page.evaluate(()=>HoleOS.state.desk.view),'desk');
  const dockGlyph=page.locator('.hf-dock [data-launch="Glyph"]');await dockGlyph.click();
  await page.waitForFunction(()=>!document.querySelector('.hc-studio-host').hidden);
  assert.equal(await page.evaluate(()=>HoleRuntime.list().find(i=>i.appId==='hole.glyph').id),instance);
  assert.equal(await frame.getByLabel('Family',{exact:true}).inputValue(),'Unfinished Garden');
  await page.getByRole('button',{name:'Full screen Glyph',exact:true}).click();await swipe(.55);await page.waitForFunction(()=>document.querySelector('.hc-studio-host').hidden&&HoleOS.state.desk.view==='overview');
  await page.evaluate(ids=>HoleContinuity.open('projects',{projectId:ids.project,assetId:null,presentation:'universe'}),ids);
  assert.equal(await workspace.getAttribute('data-spatial'),'true');assert.ok((await page.locator('.hu-viewport').boundingBox()).height>650);
  await screenshot('universe');
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});
    for(const view of ['projects','actions','day','paperwork','carry','create','weblab','lab','atlas','tongue','crew','momentous','publish','relay','settings']){
      await page.evaluate(({view,ids})=>HoleContinuity.open(view,{projectId:ids.project,assetId:null,presentation:'flat'}),{view,ids});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${view} ${width}px page overflow`);
      const overflow=await page.locator('.hc-main').evaluate(main=>main.scrollWidth>main.clientWidth+2);assert.equal(overflow,false,`${view} ${width}px inner overflow`);
      if(view==='projects'){const menu=page.locator('.hc-project-tools');await menu.locator('summary').click();assert.ok(await menu.locator(':scope>.hc-row').evaluate(n=>n.getBoundingClientRect().right<=innerWidth),'project tools stay inside phone viewport');await menu.locator('summary').focus();await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('open'),null);}
      if(width===390&&['projects','actions','day'].includes(view))await screenshot(`phone-${view}`);
    }
  }
  assert.equal(await page.evaluate(ids=>HoleCore.readAsset(ids.note).then(r=>r.version.id),ids),ids.noteVersion,'view changes preserve original versions');
  assert.deepEqual(errors,[]);
  const receipt={passed:true,browser:await browser.version(),checks:['private recent titles require reveal and can be hidden','quiet motion switch','compact desktop icons; actual drag/keyboard/cancel placement and touch single-open; disclosed settings','workspace drag and keyboard geometry','fullscreen workspace Escape','selected-version contextual strip','shared opaque editor theme','studio fullscreen/minimal dock/hover/10-30-50 travel and refused-checkpoint retention','drawer foreground and inert editors','dock resumes same dirty studio','immersive Universe stage','15 app surfaces at 390px and 320px reduced motion','unchanged original content'],observations,errors};
  await writeFile(`${directory}/visual-os.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
}finally{await browser.close();}
