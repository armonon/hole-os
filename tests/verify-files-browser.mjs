// Optional Chrome integration; original Locker source is read-only test input.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE));
const directory = await mkdtemp(path.join(tmpdir(), 'hole-files-browser-'));
const server = createServer(async (req, res) => {
  if (['/core.js', '/file-platform.js'].includes(req.url)) { res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(new URL('../src' + req.url, import.meta.url))); }
  res.end('<!doctype html><title>Files source UI test</title><script src="/core.js"></script><main id="os"><div id="files"><div class="hf-window-body"></div></div></main>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const context = await chromium.launchPersistentContext(directory, { headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await context.newPage();
async function mount() {
  await page.goto(origin);
  await page.evaluate(async () => { await HoleCore.ready; const rec = { app: { name: 'Files' }, el: document.querySelector('#files') }; window.HoleOS = { root: document.body, os: document.querySelector('#os'), state: { desk: { view: 'desk' } }, windows: new Map([['Files', rec]]), icons() {}, openApp() {}, motion: () => false }; });
  await page.addScriptTag({ url: origin + '/file-platform.js' }); await page.evaluate(() => HoleFiles.ready);
}
try {
  await mount();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2sAAAAASUVORK5CYII=', 'base64');
  await page.getByLabel('Library view', { exact: true }).selectOption('photos');
  await page.getByLabel('Import files from your device').setInputFiles({ name: 'Selected photo.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Open Selected photo.png', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.hfiles-file-open img')].some(image => image.naturalWidth === 1));
  const originalId = await page.evaluate(() => HoleFiles.getRecent(10).find(file => file.name === 'Selected photo.png').id);
  await page.getByLabel('Library view', { exact: true }).selectOption('all');
  assert.equal(await page.evaluate(() => HoleFiles.getRecent(10).find(file => file.name === 'Selected photo.png').id), originalId);
  await page.getByLabel('Library view', { exact: true }).selectOption('locker');
  await page.getByLabel('Import files from your device').setInputFiles({ name: 'Downloaded Locker original.txt', mimeType: 'text/plain', buffer: Buffer.from('Original downloaded bytes') });
  await page.getByRole('button', { name: 'Open Downloaded Locker original.txt', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open Downloaded Locker original.txt', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.hfiles-preview [download]')?.href.startsWith('blob:'));
  const downloadEvent = page.waitForEvent('download'); await page.locator('.hfiles-preview').getByRole('link', { name: 'Download', exact: true }).click(); const download = await downloadEvent;
  assert.equal(await readFile(await download.path(), 'utf8'), 'Original downloaded bytes');
  await mount(); await page.getByLabel('Library view', { exact: true }).selectOption('locker');
  await page.getByRole('button', { name: 'Open Downloaded Locker original.txt', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Open original Locker', exact: true }).getAttribute('href'), 'https://thecreatingco.com/locker/');
  if (process.env.HOLE_LOCKER_CORE) {
    await page.addScriptTag({ path: process.env.HOLE_LOCKER_CORE });
    const result = await page.evaluate(async () => {
      const id = await TCCLockerCore.save({ name: 'Native Locker contract.txt', blob: new Blob(['Native source bytes'], { type: 'text/plain' }), meta: { nativeFormat: 'text' } }, 'test', location.origin);
      const entry = await TCCLockerCore.get({ id }), [copy] = await HoleFiles.importLockerRecords([entry]);
      return { source: await (await TCCLockerCore.get({ id })).blob.text(), copied: await (await HoleCore.readAsset(copy)).blob.text(), provenance: HoleFiles.getRecent(20).find(file => file.id === copy).provenance.locker };
    });
    assert.equal(result.source, 'Native source bytes'); assert.equal(result.copied, result.source); assert.equal(result.provenance.app, 'test');
  }
  console.log('PASS Chrome: Photos filtering/decoded thumbnail/stable identity; Locker manual file import/download byte equality/reload; original route retained. Optional supplied native Locker core exercised in disposable local origin, not production-origin access.');
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
