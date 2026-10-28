// Keyboard and reflow evidence, not screen-reader or physical-device certification.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE || '/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const directory = await mkdtemp(path.join(tmpdir(), 'hole-a11y-'));
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Disposable browser zoom qualification', version: '1.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
await writeFile(path.join(directory, 'worker.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
const context = await chromium.launchPersistentContext(path.join(directory, 'profile'), { headless: true, executablePath: process.env.HOLE_ZOOM_CHROME || path.join(homedir(), 'Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'), args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`], viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const findings = [], evidence = [];
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker'), page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const origin = process.env.HOLE_TEST_URL || 'http://127.0.0.1:5193'; await page.goto(origin); await page.waitForFunction(() => window.HoleContinuity && window.HoleStudioWindow);
  const ids = await page.evaluate(async () => {
    await HoleCore.ready; const project = await HoleCore.put('projects', { id: 'keyboard-qa', name: 'Keyboard QA', spaceId: 'studio', assetIds: [] });
    const text = await HoleCore.importAsset({ name: 'Keyboard reader.txt', projectId: project.id, blob: new Blob(['Read this original text.\n'.repeat(400)], { type: 'text/plain' }) });
    const recipe = await HoleActions.saveRecipe({ name: 'Keyboard branch', steps: [{ id: 'branch', actionId: 'text.branch', parameters: {} }] });
    const glyph = await HoleCore.importAsset({ name: 'Keyboard.glyph.json', blob: new Blob([JSON.stringify({ schema: 'glyph-studio/1', familyName: 'Keyboard', styleName: 'Regular', metrics: { unitsPerEm: 1000, ascender: 800, descender: -200, xHeight: 500, capHeight: 700, defaultAdvance: 600 }, glyphs: { A: { advanceWidth: 600, strokes: [] } }, kerning: [], curveSmoothing: .35 })], { type: 'application/json' }) });
    return { project: project.id, text: text.asset.id, version: text.version.id, recipe: recipe.id, glyph: glyph.asset.id };
  });
  async function zoom(factor) { const actual = await worker.evaluate(async ({ origin, factor }) => { const tab = (await chrome.tabs.query({})).find(tab => tab.url?.startsWith(origin)); await chrome.tabs.setZoom(tab.id, factor); return chrome.tabs.getZoom(tab.id); }, { origin, factor }); assert.ok(Math.abs(actual-factor)<.001); await page.waitForFunction(factor => Math.abs(devicePixelRatio - factor) < .01, factor); }
  async function reflow(name) {
    const result = await page.evaluate(() => ({ width: innerWidth, pageWidth: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('.hc-main *, dialog *')].filter(e => { const r=e.getBoundingClientRect();return r.width>0 && r.right>innerWidth+2 && getComputedStyle(e).position!=='fixed'; }).slice(0, 8).map(e=>({tag:e.tagName,class:e.className,text:e.textContent?.slice(0,40)})), motion: [...document.querySelectorAll('.hc-workspace *')].filter(e=>getComputedStyle(e).animationDuration.split(',').some(v=>parseFloat(v)>0)).length }));
    if (result.pageWidth > result.width + 1) findings.push({ name, issue: 'page overflow', ...result });
    if (result.overflow.length) findings.push({ name, issue: 'content beyond viewport', ...result });
    assert.equal(result.motion, 0, `${name}: reduced-motion workspace animation`); evidence.push({ name, width: result.width, pageWidth: result.pageWidth });
  }
  async function keyboardButton(name) { const target = page.getByRole('button', { name, exact: true }); await target.focus(); await page.keyboard.press('Enter'); }
  async function dialogKeyboard(name, originName) {
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    for (let i=0;i<12;i++) { await page.keyboard.press('Tab'); assert.ok(await dialog.evaluate(d=>d.contains(document.activeElement) || document.activeElement===document.body), `${name}: focus escapes to background control`); }
    await dialog.getByRole('button').first().focus(); await page.keyboard.press('Tab');
    const focusStyle = await page.evaluate(()=>{const s=getComputedStyle(document.activeElement);return {outline:s.outlineStyle,width:s.outlineWidth,shadow:s.boxShadow};});
    if (focusStyle.outline === 'none' && focusStyle.shadow === 'none') findings.push({name,issue:'focused control has no outline or shadow',focusStyle});
    await page.keyboard.press('Escape'); await dialog.waitFor({state:'detached'});
    assert.equal(await page.getByRole('button',{name:originName,exact:true}).evaluate(e=>e===document.activeElement),true,`${name}: focus return`);
  }
  for (const factor of [1,2,4]) {
    await zoom(factor);
    await page.evaluate(ids=>HoleContinuity.open('librarian',{assetId:ids.text,versionId:ids.version}),ids);
    await page.getByLabel('Page',{exact:true}).waitFor(); await page.getByLabel('Page',{exact:true}).fill('1'); await keyboardButton('Go to page'); await keyboardButton('Next page'); await page.waitForFunction(()=>document.querySelector('.hc-reader [role=status]')?.textContent.includes('Page 2'));
    await reflow(`Librarian ${factor*100}%`);
    await page.evaluate(()=>HoleContinuity.open('bounce',{assetId:null})); await reflow(`Bounce ${factor*100}%`);
    await page.evaluate(ids=>HoleContinuity.open('projects',{projectId:ids.project,assetId:null,presentation:'smart'}),ids);
    await page.getByLabel('Talk Bar — deterministic commands',{exact:true}).fill('study selected'); await reflow(`Smart ${factor*100}%`);
    await page.evaluate(ids=>HoleContinuity.open('crew',{projectId:ids.project,assetId:null,presentation:'desktop'}),ids);
    await page.getByLabel('Crew flow',{exact:true}).selectOption(ids.recipe); await page.getByLabel('Crew source',{exact:true}).selectOption(ids.text); await keyboardButton('Inspect scoped plan'); await page.getByRole('button',{name:'Grant and run reviewed plan',exact:true}).waitFor(); await reflow(`Crew ${factor*100}%`);
    await page.evaluate(()=>HoleContinuity.open('momentous',{assetId:null})); await keyboardButton('Review Quiet light'); await reflow(`Package dialog ${factor*100}%`); await dialogKeyboard('Package review','Review Quiet light');
  }
  await zoom(1); await page.evaluate(()=>HoleContinuity.open('weblab',{assetId:null})); await keyboardButton('New website'); await page.getByLabel('Edit index.html',{exact:true}).waitFor();
  for (const factor of [1,2,4]) { await zoom(factor); await reflow(`WebLab isolated preview ${factor*100}%`); }
  assert.equal(await page.locator('iframe[title="Isolated website preview"]').getAttribute('sandbox'),'allow-scripts'); await keyboardButton('Stop and revoke preview');
  await page.evaluate(ids=>HoleContinuity.open('projects',{assetId:ids.glyph,presentation:'desktop'}),ids); await keyboardButton('Open in Glyph'); await page.getByRole('button',{name:'Window layout',exact:true}).waitFor();
  for (const factor of [1,2,4]) {
    await zoom(factor); await keyboardButton('Window layout'); await reflow(`Studio layout ${factor*100}%`); await dialogKeyboard('Studio layout','Window layout');
    await keyboardButton('Window layout'); await page.getByRole('dialog').getByLabel('Width',{exact:true}).fill('400'); await page.getByRole('dialog').getByLabel('Height',{exact:true}).fill('500'); await keyboardButton('Apply window layout'); await page.getByRole('dialog').waitFor({state:'detached'});
    const geometry=await page.locator('.hc-studio-host').evaluate(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {right:r.right,bottom:r.bottom,width:r.width,height:r.height,innerWidth,innerHeight,minWidth:s.minWidth,minHeight:s.minHeight};}); if(geometry.right>geometry.innerWidth+1||geometry.bottom>geometry.innerHeight+1)findings.push({name:`Studio fitted geometry ${factor*100}%`,issue:'host extends beyond viewport',...geometry});
  }
  await keyboardButton('Close Glyph');
  assert.deepEqual(errors,[]); console.log(JSON.stringify({ browser: context.browser().version(), evidence, findings, errors, limits:['No screen-reader/physical touch/contrast certification','Safari26.0.1 installed; WebDriver blocked by disabled Allow remote automation'] },null,2));
  assert.equal(findings.length,0,'Accessibility findings need review');
} finally { await context.close(); await rm(directory,{recursive:true,force:true}); }
