// Real integrated shell; serve public separately. This script never builds.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE || '/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage(); page.setDefaultTimeout(15000); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.HOLE_TEST_URL || 'http://127.0.0.1:5193'); await page.waitForFunction(() => window.HolePackageStudio && window.HoleContinuity);
  const initial = await page.evaluate(async () => { await HoleCore.ready; const before = HoleWelcome.preferences; await HoleCore.importAsset({ name: 'Workflow original.txt', blob: new Blob(['Selected immutable text'], { type: 'text/plain' }) }); await HoleContinuity.open('momentous', { assetId: null }); return { before, spaces: HoleOS.state.projects.length }; });
  await page.getByRole('button', { name: 'Review Quiet light', exact: true }).click(); await page.getByRole('button', { name: 'Install reviewed package', exact: true }).click();
  await page.getByRole('button', { name: 'Use Quiet light', exact: true }).click();
  await page.waitForFunction(() => HoleWelcome.preferences.theme === 'light' && HoleWelcome.preferences.quiet);
  assert.equal(await page.evaluate(() => HoleWelcome.preferences.theme), 'light'); assert.equal(await page.evaluate(() => HoleWelcome.preferences.quiet), true);
  await page.evaluate(() => HoleContinuity.render()); await page.getByRole('button', { name: 'Undo applied theme', exact: true }).click();
  await page.waitForFunction(before => JSON.stringify(HoleWelcome.preferences) === JSON.stringify(before), initial.before);
  assert.deepEqual(await page.evaluate(() => HoleWelcome.preferences), initial.before);
  await page.getByRole('button', { name: 'Review Study space', exact: true }).click(); await page.getByRole('button', { name: 'Install reviewed package', exact: true }).click();
  await page.getByRole('button', { name: 'Use Study space', exact: true }).click();
  await page.waitForFunction(async count => HoleOS.state.projects.length === count + 1 && (await HoleCore.list('scenes')).some(scene => scene.provenance?.packageId === 'hole.study-space'), initial.spaces);
  const created = await page.evaluate(() => HoleOS.state.projects.find(space => space.name === 'Study space').id);
  await page.reload(); await page.waitForFunction(() => window.HoleContinuity && window.HolePackageStudio); await page.evaluate(() => HoleContinuity.open('momentous', { assetId: null }));
  assert.ok(await page.evaluate(id => HoleOS.state.projects.some(space => space.id === id), created));
  await page.getByRole('button', { name: 'Review Text preparation', exact: true }).click(); await page.getByRole('button', { name: 'Install reviewed package', exact: true }).click();
  await page.getByRole('button', { name: 'Use Text preparation', exact: true }).click(); await page.getByRole('button', { name: 'Review Flow', exact: true }).click();
  await page.getByRole('heading', { name: 'Review before running', exact: true }).waitFor(); assert.equal((await page.evaluate(() => HoleCore.list('runs'))).length, 0);
  await page.getByRole('button', { name: 'Run reviewed Flow', exact: true }).click();
  await page.waitForFunction(async () => (await HoleCore.list('runs')).some(run => run.status === 'completed'));
  const output = await page.evaluate(async () => { for (let i = 0; i < 100; i++) { const runs = await HoleCore.list('runs'), run = runs.find(run => run.status === 'completed'); if (run) return (await HoleCore.readAsset(run.outputs[0].assetId, run.outputs[0].versionId)).blob.text(); if (runs.some(run => run.status === 'failed')) throw new Error(JSON.stringify(runs)); await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Flow did not complete: ' + JSON.stringify(await HoleCore.list('runs'))); }); assert.equal(output, 'Selected immutable text');
  await page.getByRole('button', { name: 'Close workflow', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 720 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, browser: await browser.version(), checks: ['actual shell theme apply/undo', 'Space template new identity/zones/provenance/reload', 'workflow install does not run; explicit review/run produces original text branch', '320px reduced motion no page overflow'], errors }));
} finally { await browser.close(); }
