import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE || '/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const browser = await chromium.launch({ headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const override = process.env.HOLE_QA_SOURCE_OVERRIDE === '1';
  if (override) {
    for (const name of ['video-trim-worker.js', 'vendor/mediabunny/mediabunny.min.mjs']) await page.route('**/assets/' + name, async route => route.fulfill({ contentType: 'application/javascript', body: await readFile(new URL('../src/' + name, import.meta.url), 'utf8') }));
    await page.route('**/assets/actions.js', async route => route.fulfill({ contentType: 'application/javascript', body: await readFile(new URL('../src/video-trim.js', import.meta.url), 'utf8') + '\n' + await readFile(new URL('../src/actions.js', import.meta.url), 'utf8') }));
  }
  await page.goto(process.env.HOLE_QA_URL || 'http://127.0.0.1:5193'); await page.waitForFunction(() => window.HoleVideoTrim && window.HoleActions);
  const result = await page.evaluate(async () => {
    await HoleCore.ready;
    const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90; const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(20), audio = new AudioContext(), oscillator = audio.createOscillator(), gain = audio.createGain(), destination = audio.createMediaStreamDestination();
    gain.gain.value = .1; oscillator.connect(gain).connect(destination); oscillator.start(); await audio.resume(); stream.addTrack(destination.stream.getAudioTracks()[0]);
    const chunks = [], recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
    const stopped = new Promise(resolve => recorder.onstop = resolve); recorder.ondataavailable = e => chunks.push(e.data); recorder.start(100);
    const began = performance.now(); const draw = setInterval(() => { ctx.fillStyle = performance.now() - began < 2000 ? '#ff0000' : '#0000ff'; ctx.fillRect(0, 0, 160, 90); }, 50);
    await new Promise(resolve => setTimeout(resolve, 4200)); recorder.stop(); await stopped; clearInterval(draw); oscillator.stop(); stream.getTracks().forEach(t => t.stop()); await audio.close();
    const blob = new Blob(chunks, { type: 'video/webm' }), original = new Uint8Array(await blob.arrayBuffer());
    const imported = await HoleCore.importAsset({ name: 'Generated red-blue with tone.webm', blob }); const input = { assetId: imported.asset.id, versionId: imported.version.id };
    const preview = await HoleActions.preview('video.trim', { inputs: [input], parameters: { start: 2.5, end: 3.5 } });
    const done = await HoleActions.run('video.trim', { inputs: [input], parameters: { start: 2.5, end: 3.5 } });
    const output = done.outputs[0], read = await HoleCore.readAsset(output.asset.id, output.version.id);
    const decoder = new AudioContext(); const decoded = await decoder.decodeAudioData(await read.blob.arrayBuffer()); let energy = 0; for (const value of decoded.getChannelData(0)) energy += value * value; const audioRms = Math.sqrt(energy / decoded.length); await decoder.close();
    const video = document.createElement('video'); video.muted = true; const url = URL.createObjectURL(read.blob); video.src = url;
    await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = reject; });
    ctx.drawImage(video, 0, 0); const color = [...ctx.getImageData(80, 45, 1, 1).data]; URL.revokeObjectURL(url);
    const count = (await HoleCore.list('assets')).length; let budgetCode, cancelCode;
    try { await HoleActions.run('video.trim', { inputs: [input], parameters: { start: 0, end: 1, budgetMs: 1 } }); } catch (e) { budgetCode = e.code; }
    try { await HoleActions.run('video.trim', { inputs: [input], parameters: { start: 0, end: 1 }, onJob: job => setTimeout(() => HoleActions.cancel(job.id), 20) }); } catch (e) { cancelCode = e.code; }
    const after = new Uint8Array(await (await HoleCore.readAsset(input.assetId, input.versionId)).blob.arrayBuffer());
    return { previewMime: preview.outputs[0].mime, output: { assetId: output.asset.id, versionId: output.version.id }, provenance: read.version.provenance, parents: read.version.parentVersionIds, input, color, audioRms, sourceUnchanged: after.length === original.length && after.every((v, i) => v === original[i]), budgetCode, cancelCode, noRejectedOutputs: count === (await HoleCore.list('assets')).length, outputSize: read.blob.size };
  });
  assert.equal(result.previewMime, 'video/webm'); assert.ok(result.color[2] > 200 && result.color[0] < 30, JSON.stringify(result.color));
  assert.equal(result.provenance.outputTracks, 2); assert.ok(result.audioRms > .03 && result.audioRms < .15); assert.ok(Math.abs(result.provenance.outputDuration - 1) <= .25);
  assert.equal(result.sourceUnchanged, true); assert.ok(result.parents.includes(result.input.versionId)); assert.equal(result.budgetCode, 'RESOURCE_LIMIT'); assert.equal(result.cancelCode, 'CANCELLED'); assert.equal(result.noRejectedOutputs, true);
  await page.reload(); await page.waitForFunction(() => window.HoleCore);
  assert.equal(await page.evaluate(async ref => { await HoleCore.ready; return (await HoleCore.readAsset(ref.assetId, ref.versionId)).blob.size; }, result.output), result.outputSize);
  await page.evaluate(ref => HoleContinuity.open('projects', { assetId: ref.assetId, versionId: ref.versionId, scope: 'OBJECT_PREVIEW' }), result.input);
  await page.getByRole('button', { name: 'Media tools', exact: true }).click();
  await page.getByLabel('Video start (seconds)', { exact: true }).fill('0');
  await page.getByLabel('Video end (seconds)', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Trim video to WebM', exact: true }).click();
  await page.getByText('Completed · outputs saved locally', { exact: true }).waitFor();
  const uiOutputs = await page.evaluate(async () => (await HoleCore.list('jobs')).filter(j => j.actionId === 'video.trim' && j.status === 'completed').length);
  assert.equal(uiOutputs, 2);
  assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: true, browser: await browser.version(), sourceOverride: override, actualMediaToolsControl: true, result, errors }));
} finally { await browser.close(); }
