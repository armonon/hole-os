// Opt-in real browser UI verification, isolated from public builds/user profiles.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE));
const directory = await mkdtemp(path.join(tmpdir(), 'hole-everyday-browser-'));
const server = createServer(async (req, res) => {
  if (['/core.js', '/browser.js', '/everyday.js'].includes(req.url)) { res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(new URL('../src' + req.url, import.meta.url))); }
  res.end('<!doctype html><title>Everyday source UI test</title><script src="/core.js"></script><script src="/everyday.js"></script><main></main><div id="browser"><div class="hf-window-body"></div></div>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const context = await chromium.launchPersistentContext(directory, { headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await context.newPage();
async function mountDay() {
  await page.goto(origin);
  await page.evaluate(async () => {
    await HoleCore.ready;
    const main = document.querySelector('main'), el = (tag, className = '', text = '') => { const element = document.createElement(tag); element.className = className; element.textContent = text; return element; };
    const ctx = { C: HoleCore, main, el, navigation: {}, H: { icons() {} }, fail(error) { main.append(el('p', '', error.message)); }, empty: text => el('p', '', text), open() {},
      put: (type, data) => HoleCore.put(type, data, data.revision ? { expectedRevision: data.revision } : {}),
      title(a, b, c, buttons = []) { main.append(...buttons); },
      button: (label, icon, action) => { const button = el('button', '', label); button.onclick = action; return button; },
      input: (label, type, value = '') => { const wrap = el('label', '', label), input = el(type === 'textarea' ? 'textarea' : 'input'); if (type !== 'textarea') input.type = type; input.value = value; input.setAttribute('aria-label', label); wrap.append(input); return { wrap, input }; },
      section: label => { const section = el('section'); section.append(el('h2', '', label)); main.append(section); return section; },
      modal: (title, description = '') => { const dialog = el('dialog'); dialog.append(el('h2', '', title), el('p', '', description)); document.body.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove()); return dialog; },
      download: async (blob, filename) => { window.lastExport = { filename, content: await blob.text() }; },
      render: async () => { main.replaceChildren(); await HoleEveryday.day(ctx); }
    }; await ctx.render();
  });
}
try {
  await mountDay();
  await page.getByRole('button', { name: 'Add event', exact: true }).click();
  await page.getByLabel('Event', { exact: true }).fill('Browser event'); await page.getByLabel('Starts', { exact: true }).fill('2026-10-26T10:00'); await page.getByLabel('Ends', { exact: true }).fill('2026-10-26T11:00'); await page.getByLabel('IANA time zone').fill('UTC');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Browser event', exact: true }).click();
  await page.getByRole('button', { name: 'Restore Browser event', exact: true }).waitFor();
  await mountDay(); await page.getByRole('button', { name: 'Restore Browser event', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Browser event', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Add contact', exact: true }).click(); await page.getByLabel('Name', { exact: true }).fill('Browser contact'); await page.getByLabel('Email', { exact: true }).fill('test@example.test'); await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await page.getByRole('button', { name: 'Delete contact Browser contact', exact: true }).click(); await page.getByRole('button', { name: 'Restore Browser contact', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Export all Day data including recovery', exact: true }).click(); await page.waitForFunction(() => window.lastExport);
  const exported = await page.evaluate(() => JSON.parse(lastExport.content)); assert.equal(exported.events[0].deleted, false); assert.equal(exported.contacts[0].deleted, true);
  await page.evaluate(() => { const rec = { app: { name: 'Browser' }, el: document.querySelector('#browser') }; window.HoleOS = { root: document.body, windows: new Map([['Browser', rec]]), icons() {}, openApp() {} }; });
  await page.addScriptTag({ url: origin + '/browser.js' });
  await page.evaluate(() => HoleBrowser.open({ query: 'actual search & 日本語', projectId: 'project:test' }));
  assert.equal(await page.getByLabel('Web search or address').inputValue(), 'actual search & 日本語');
  await context.route('https://duckduckgo.com/**', route => route.fulfill({ body: '<title>Intercepted outbound test only</title>' }));
  const popupPromise = page.waitForEvent('popup'); await page.getByRole('button', { name: 'Open web search or address' }).click(); const popup = await popupPromise; await popup.waitForLoadState(); assert.equal(new URL(popup.url()).searchParams.get('q'), 'actual search & 日本語'); await popup.close();
  await page.getByRole('button', { name: 'Save Trail', exact: true }).click(); await page.getByRole('button', { name: 'Unsave Trail', exact: true }).waitFor();
  assert.equal(await page.evaluate(async () => (await HoleCore.list('links')).find(item => item.kind === 'browser-visit').saved), true);
  console.log('PASS Chrome: Day event create/delete/reload/restore, contact create/delete, recovery export bytes; Browser actual query URL, durable project history and Save Trail UI. External search response intercepted; full shell/Safari/physical input not qualified.');
} finally { await context.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
