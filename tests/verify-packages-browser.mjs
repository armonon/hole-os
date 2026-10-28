import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE));
const directory = await mkdtemp(path.join(tmpdir(), 'hole-packages-browser-'));
const sources = ['core.js', 'actions-codecs.js', 'actions.js', 'flow-authoring.js', 'extensions-model.js', 'extensions.js', 'package-model.js', 'package-studio.js'];
const server = createServer(async (req, res) => {
  if (sources.includes(req.url.slice(1))) { res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(new URL('../src' + req.url, import.meta.url))); }
  res.end('<!doctype html><title>Package source UI test</title>' + sources.map(name => `<script src="/${name}"></script>`).join('') + '<main></main>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
const context = await chromium.launchPersistentContext(directory, { headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await context.newPage();
try {
  await page.goto(origin);
  await page.evaluate(async () => {
    await HoleCore.ready;
    const main = document.querySelector('main'), el = (tag, className = '', text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };
    window.ctx = { C: HoleCore, main, el, navigation: {}, H: { icons() {} }, fail(error) { main.append(el('p', '', error.message)); }, empty: text => el('p', '', text), notify(text) { main.append(el('p', '', text)); },
      put: (type, data) => HoleCore.put(type, data, data.revision ? { expectedRevision: data.revision } : {}),
      title(a, b, c, buttons = []) { main.append(el('h1', '', b), ...buttons); },
      button: (label, icon, action) => { const b = el('button', '', label); b.onclick = () => Promise.resolve().then(action).catch(ctx.fail); return b; },
      input: (label, type, value = '') => { const wrap = el('label', '', label), input = el(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') input.type = type; input.value = value; input.setAttribute('aria-label', label); wrap.append(input); return { wrap, input }; },
      status(text) { const e = el('p', '', text); main.append(e); return e; },
      section: label => { const e = el('section'); e.append(el('h2', '', label)); main.append(e); return e; },
      modal: (title, description = '') => { const dialog = el('dialog'); dialog.append(el('h2', '', title), el('p', '', description)); document.body.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove()); return dialog; },
      download: async (blob, filename) => { window.lastExport = { filename, content: await blob.text() }; }, navigate() {},
      open: async view => { window.view = view; main.replaceChildren(); await HoleExtensions.render(view, ctx); },
      render: async () => { main.replaceChildren(); await HoleExtensions.render(window.view || 'create', ctx); }
    }; await ctx.open('create');
  });
  await page.getByRole('button', { name: 'Build a composition', exact: true }).click();
  await page.getByLabel('Composition name').fill('Browser workbench');
  await page.getByRole('button', { name: 'Add counter', exact: true }).click(); await page.getByRole('button', { name: 'Add checklist', exact: true }).click();
  await page.getByRole('button', { name: 'Save composition', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click(); await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('dialog').getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Close composition', exact: true }).click();
  await page.evaluate(() => ctx.open('create'));
  await page.getByRole('button', { name: 'Open Browser workbench.holeutility', exact: true }).click();
  assert.equal(await page.getByRole('dialog').locator('output').textContent(), '2'); assert.equal(await page.getByRole('dialog').getByRole('checkbox').first().isChecked(), true);
  await page.getByRole('button', { name: 'Close composition', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Browser workbench.holeutility', exact: true }).click();
  const beforeDefinition = await page.getByLabel('Composition definition JSON').inputValue(), editedDefinition = JSON.parse(beforeDefinition); editedDefinition.components[0].config.step = 5;
  await page.getByLabel('Composition definition JSON').fill(JSON.stringify(editedDefinition));
  await page.getByRole('button', { name: 'Save composition version', exact: true }).click();
  const lineage = await page.evaluate(async () => { const asset = (await HoleCore.list('assets')).find(asset => asset.name === 'Browser workbench.holeutility'); const current = await HoleCore.readAsset(asset.id); const original = await HoleCore.readAsset(asset.id, current.version.parentVersionIds[0]); return { current: JSON.parse(await current.blob.text()), original: JSON.parse(await original.blob.text()) }; });
  assert.equal(lineage.current.components[0].config.step, 5); assert.equal(lineage.original.components[0].config.step, 1);
  await page.evaluate(() => ctx.open('momentous'));
  await page.getByRole('button', { name: 'Review Practice desk', exact: true }).click();
  await page.getByRole('button', { name: 'Install reviewed package', exact: true }).click();
  await page.getByRole('button', { name: 'Use Practice desk', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click(); await page.getByRole('button', { name: 'Close composition', exact: true }).click();
  await page.evaluate(async () => { const old = await HoleCore.get('packages', 'hole.practice-instrument'); await HolePackageModel.install(HoleCore, { ...old.manifest, version: 2, name: 'Practice desk v2' }); await ctx.render(); });
  await page.getByRole('button', { name: 'Roll back Practice desk v2', exact: true }).click();
  await page.getByRole('button', { name: 'Use Practice desk', exact: true }).waitFor();
  const script = `console.log('source console works');try{indexedDB.open('host-secret')}catch(e){console.log('IDB blocked')}try{parent.document.body}catch(e){console.log('host DOM blocked')}fetch('https://example.invalid/probe').catch(()=>console.log('network blocked'));throw new Error('intentional preview error');`;
  await page.evaluate(async script => { await HoleExtensions.beforeLeave(); ctx.main.replaceChildren(); const saved = await HoleCore.importAsset({ name: 'Diagnostics.holeweb', blob: new Blob([JSON.stringify({ schema: 'hole.weblab/1', name: 'Diagnostics', files: { 'index.html': '<h1>Isolated page</h1>', 'style.css': '', 'script.js': script } })], { type: 'application/vnd.hole.weblab+json' }) }); await HoleExtensions.openAsset(await HoleCore.readAsset(saved.asset.id), ctx); }, script);
  assert.ok(!(await page.locator('main').innerText()).includes('IDB blocked'));
  await page.getByRole('button', {name:'Update isolated preview',exact:true}).click();
  await page.waitForFunction(() => { const text = document.querySelector('main').textContent; return ['source console works', 'IDB blocked', 'host DOM blocked', 'network blocked', 'intentional preview error'].every(value => text.includes(value)); });
  await page.getByRole('button', { name: 'Stop and revoke preview', exact: true }).click();
  assert.equal(await page.locator('iframe.hx-preview').getAttribute('srcdoc'), null);
  assert.deepEqual(await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name)), ['hole-file-library-v1']);
  console.log('PASS Chrome: composition author/use/state reopen/version edit with original retention; package install/use/update/rollback; real opaque-frame console/errors, blocked IDB/host DOM/network, Stop revocation. No hard CPU/memory isolation claim; full shell theme/space hook qualification remains coordinator-owned.');
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
