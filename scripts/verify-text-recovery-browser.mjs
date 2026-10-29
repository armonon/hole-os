// Actual generated shell and IndexedDB; inject only a refused runtime close/storage write.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE || '/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const viewport = process.env.HOLE_PHONE === '1' ? { width: 320, height: 720 } : { width: 1440, height: 1000 };
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' }); page.setDefaultTimeout(10000);
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
  const retained = await page.evaluate(async () => {
    const input = document.querySelector('.hc-editor textarea');
    input.focus(); input.setSelectionRange(2, 9);
    window.retainedTextInput = input;
    const instance = HoleRuntime.list().find(item => item.appId === 'hole.paper-text');
    let error;
    try { await HoleContinuity.render(); } catch (failure) { error = failure.message; }
    return { error, connected: input.isConnected, focused: document.activeElement === input,
      selection: [input.selectionStart, input.selectionEnd], instanceId: instance.id,
      currentId: HoleRuntime.list().find(item => item.appId === 'hole.paper-text')?.id };
  });
  assert.match(retained.error, /Audit draft storage refusal/);
  assert.equal(retained.connected, true, 'failed refresh retains the mounted editor');
  assert.equal(retained.focused, true); assert.deepEqual(retained.selection, [2, 9]);
  assert.equal(retained.currentId, retained.instanceId, 'failed refresh retains runtime identity');
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
  const refreshed = await page.evaluate(async id => {
    await HoleContinuity.render();
    return { sameInput: document.querySelector('.hc-editor textarea') === retainedTextInput,
      focused: document.activeElement === retainedTextInput,
      selection: [retainedTextInput.selectionStart, retainedTextInput.selectionEnd],
      instanceId: HoleRuntime.list().find(item => item.appId === 'hole.paper-text')?.id,
      text: await (await HoleCore.readAsset(id)).blob.text(),
      drafts: (await HoleCore.list('drafts')).filter(draft => draft.assetId === id).map(draft => draft.text),
      overflow: document.documentElement.scrollWidth > innerWidth };
  }, assetId);
  assert.equal(refreshed.sameInput, true, 'successful refresh keeps the original editor node');
  assert.equal(refreshed.focused, true); assert.deepEqual(refreshed.selection, [2, 9]);
  assert.equal(refreshed.instanceId, retained.instanceId);
  assert.equal(refreshed.text, 'Original thought', 'refresh must not implicitly commit a version');
  assert.deepEqual(refreshed.drafts, ['Unacknowledged thought']); assert.equal(refreshed.overflow, false);
  const position = await page.evaluate(async id => {
    const area = document.querySelector('.hc-editor textarea'); area.focus(); area.setSelectionRange(1, 6);
    await HoleContinuity.render();
    const first = (await HoleCore.list('drafts')).find(d => d.assetId === id);
    await HoleContinuity.render();
    const unchanged = (await HoleCore.list('drafts')).find(d => d.assetId === id);
    refuseTextDraft = true; area.setSelectionRange(3, 10); let error;
    try { await HoleContinuity.render(); } catch (failure) { error = failure.message; }
    const retained = area.isConnected && document.activeElement === area;
    refuseTextDraft = false; await HoleContinuity.render();
    const retried = (await HoleCore.list('drafts')).find(d => d.assetId === id);
    return { first: first.selection, sameRevision: first.revision === unchanged.revision,
      error, retained, retried: retried.selection };
  }, assetId);
  assert.deepEqual(position.first, { start: 1, end: 6 }, 'selection-only changes are durable');
  assert.equal(position.sameRevision, true, 'unchanged position does not rewrite a draft');
  assert.match(position.error, /Audit draft storage refusal/); assert.equal(position.retained, true);
  assert.deepEqual(position.retried, { start: 3, end: 10 }, 'position-only refusal can retry');
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
  console.log(JSON.stringify({ passed: true, browser: await browser.version(), viewport, checks: ['selection-only persistence and refusal/retry with retained editor', 'immediate and refused-draft unload warning', 'failed refresh retains editor, focus, selection and runtime identity', 'successful refresh retains editor and durable draft without committing', 'no document overflow', 'actual reload dialog dismissal retains editing', 'durable draft releases warning', 'close refusal preserves acknowledged base', 'continued editing saves without conflict', 'concurrent Done creates one version', 'reopen retains final bytes'], errors }));
} finally { await browser.close(); }
