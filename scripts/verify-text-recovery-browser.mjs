// Actual generated shell and IndexedDB; inject only a refused runtime close/storage write.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE || '/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage(); page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let core;
    Object.defineProperty(window, 'HoleCore', { configurable: true, get: () => core, set(value) {
      core = { ...value, saveDraft: (...args) => window.refuseTextDraft ? Promise.reject(Error('Audit draft storage refusal')) : value.saveDraft(...args) };
    } });
  });
  await page.goto(process.env.HOLE_URL || 'http://127.0.0.1:5193');
  await page.waitForFunction(() => window.HoleContinuity);
  const assetId = await page.evaluate(async () => {
    await HoleCore.ready;
    const record = await HoleCore.importAsset({ name: 'Text recovery audit.txt', blob: new Blob(['Original thought'], { type: 'text/plain' }) });
    await HoleContinuity.open('projects', { assetId: record.asset.id }); return record.asset.id;
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Edit Text recovery audit.txt', exact: true });
  await input.waitFor();
  const unload = () => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); dispatchEvent(event); return event.defaultPrevented; });
  assert.equal(await unload(), false, 'unchanged content needs no warning');
  await page.evaluate(() => {
    refuseTextDraft = true;
    const input = document.querySelector('.hc-editor textarea'); input.value = 'Unacknowledged thought'; input.dispatchEvent(new Event('input', { bubbles: true }));
    const event = new Event('beforeunload', { cancelable: true }); dispatchEvent(event); window.immediateTextWarning = event.defaultPrevented;
  });
  assert.equal(await page.evaluate(() => immediateTextWarning), true, 'warn before the debounce can save text');
  await page.getByText(/Audit draft storage refusal.*Your text remains here/).waitFor();
  assert.equal(await unload(), true, 'failed draft keeps the warning');
  const warning = page.waitForEvent('dialog');
  await page.evaluate(() => { setTimeout(() => location.reload(), 0); });
  const dialog = await warning; assert.equal(dialog.type(), 'beforeunload'); await dialog.dismiss();
  assert.equal(await page.evaluate(() => HoleContinuity.finishEditing()), false, 'failed save refuses exit');
  assert.equal(await input.inputValue(), 'Unacknowledged thought');
  assert.equal(await input.evaluate(node => node.readOnly), false);
  await page.evaluate(() => { refuseTextDraft = false; });
  await input.press('ControlOrMeta+s');
  await page.getByText('Draft saved locally', { exact: true }).waitFor();
  assert.equal(await unload(), false, 'durable draft releases the warning');
  await page.evaluate(() => {
    const runtime = HoleRuntime; let refused = false;
    window.HoleRuntime = { ...runtime, close: async (...args) => {
      if (!refused) { refused = true; throw Error('Audit close refusal after commit'); }
      return runtime.close(...args);
    } };
  });
  assert.equal(await page.evaluate(() => HoleContinuity.finishEditing()), false);
  const committed = await page.evaluate(async id => { const record = await HoleCore.readAsset(id); return { id: record.version.id, text: await record.blob.text(), versions: (await HoleCore.list('versions')).filter(v => v.assetId === id).length }; }, assetId);
  assert.equal(committed.text, 'Unacknowledged thought'); assert.equal(committed.versions, 2);
  assert.equal(await input.evaluate(node => node.readOnly), false, 'close refusal restores editing');
  await input.fill('New work after the acknowledged commit');
  const results = await page.evaluate(() => Promise.all([HoleContinuity.finishEditing(), HoleContinuity.finishEditing()]));
  assert.deepEqual(results, [true, true], 'concurrent Done calls share one finish operation');
  const final = await page.evaluate(async id => { const record = await HoleCore.readAsset(id); return { text: await record.blob.text(), parents: record.version.parentVersionIds, versions: (await HoleCore.list('versions')).filter(v => v.assetId === id).length, drafts: (await HoleCore.list('drafts')).filter(d => d.assetId === id).length }; }, assetId);
  assert.equal(final.text, 'New work after the acknowledged commit'); assert.deepEqual(final.parents, [committed.id]);
  assert.equal(final.versions, 3); assert.equal(final.drafts, 0); assert.equal(await unload(), false);
  await page.reload(); await page.waitForFunction(() => window.HoleContinuity);
  assert.equal(await page.evaluate(async id => (await HoleCore.readAsset(id)).blob.text(), assetId), final.text);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, browser: await browser.version(), checks: ['immediate and refused-draft unload warning', 'actual reload dialog dismissal retains editing', 'durable draft releases warning', 'close refusal preserves acknowledged base', 'continued editing saves without conflict', 'concurrent Done creates one version', 'reopen retains final bytes'], errors }));
} finally { await browser.close(); }
