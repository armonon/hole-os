import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE || '/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const override = process.env.HOLE_QA_SOURCE_OVERRIDE === '1';
  if (override) await page.route('**/assets/actions.js', async route => route.fulfill({ contentType: 'application/javascript', body: (await readFile(new URL('../src/tempo-analysis.js', import.meta.url), 'utf8')) + '\n' + (await readFile(new URL('../src/actions.js', import.meta.url), 'utf8')) }));
  await page.goto(process.env.HOLE_QA_URL || 'http://127.0.0.1:5193');
  await page.waitForFunction(() => window.HoleActions && window.HoleTempo);
  const result = await page.evaluate(async () => {
    await HoleCore.ready;
    const project = await HoleCore.put('projects', { id: 'tempo-browser-qa', name: 'Tempo QA', assetIds: [] });
    const pcm = new Float32Array(24000 * 20);
    for (let t = .25; t < 20; t += .5) for (let n = 0; n < 600; n++) pcm[Math.round(t * 24000) + n] = .8 * Math.exp(-n / 96) * Math.cos(n * .7);
    const original = HoleActionCodecs.wav([pcm], 24000);
    const originalBytes = await original.arrayBuffer();
    const imported = await HoleCore.importAsset({ name: 'Generated 120 pulse.wav', projectId: project.id, blob: original });
    const input = { assetId: imported.asset.id, versionId: imported.version.id };
    const completed = await HoleActions.run('audio.tempo', { inputs: [input], projectId: project.id, parameters: { maxSeconds: 10 } });
    const output = completed.outputs[0];
    const read = await HoleCore.readAsset(output.asset.id, output.version.id);
    const report = JSON.parse(await read.blob.text());
    const count = (await HoleCore.list('assets')).length;
    let budgetCode, cancelCode;
    try { await HoleActions.run('audio.tempo', { inputs: [input], parameters: { budgetMs: 1 } }); } catch (e) { budgetCode = e.code; }
    try { await HoleActions.run('audio.tempo', { inputs: [input], onJob: job => HoleActions.cancel(job.id) }); } catch (e) { cancelCode = e.code; }
    const after = await HoleCore.readAsset(input.assetId, input.versionId);
    return { report, output: { assetId: output.asset.id, versionId: output.version.id }, parents: read.version.parentVersionIds, input, sourceUnchanged: (await after.blob.arrayBuffer()).byteLength === original.size && new Uint8Array(await after.blob.arrayBuffer()).every((v, i) => v === new Uint8Array(originalBytes)[i]), budgetCode, cancelCode, noRejectedOutputs: count === (await HoleCore.list('assets')).length };
  });
  assert.ok(Math.abs(result.report.bpm - 120) < 3); assert.equal(result.report.coverage.partial, true);
  assert.deepEqual(result.report.source.assetId, result.input.assetId); assert.ok(result.parents.includes(result.input.versionId));
  assert.equal(result.sourceUnchanged, true); assert.equal(result.budgetCode, 'RESOURCE_LIMIT'); assert.equal(result.cancelCode, 'CANCELLED'); assert.equal(result.noRejectedOutputs, true);
  await page.reload(); await page.waitForFunction(() => window.HoleCore);
  const reloaded = await page.evaluate(async ref => { await HoleCore.ready; return JSON.parse(await (await HoleCore.readAsset(ref.assetId, ref.versionId)).blob.text()); }, result.output);
  assert.deepEqual(reloaded, result.report); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, browser: await browser.version(), sourceOverride: override, checks: ['real WAV browser decoding', 'bounded partial coverage', 'original bytes retained', 'report immutable parent lineage', 'cancel and budget no output commit', 'JSON persists after reload'], report: result.report, errors }));
} finally { await browser.close(); }
