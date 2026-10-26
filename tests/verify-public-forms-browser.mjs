import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/service.mjs';
const { chromium } = await import(pathToFileURL(process.env.HOLE_PLAYWRIGHT_MODULE || '/Users/lillypad/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs'));
const directory = await mkdtemp(path.join(tmpdir(), 'hole-form-browser-'));
const server = createServer(async (req, res) => {
  if (['/relay.js', '/public-forms.js'].includes(req.url)) { res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(new URL('../src' + req.url, import.meta.url))); }
  res.end('<!doctype html><script src="/relay.js"></script><script src="/public-forms.js"></script><main></main>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
const service = await createService({ directory, origins: [origin] }), endpoint = await service.listen(0);
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const ownerContext = await browser.newContext(), guestContext = await browser.newContext();
const owner = await ownerContext.newPage(), guest = await guestContext.newPage();
try {
  for (const page of [owner, guest]) {
    await page.goto(origin);
    await page.evaluate(endpoint => {
      const el = (tag, cls = '', text = '') => { const e = document.createElement(tag); e.className = cls; e.textContent = text; return e; };
      window.ctx = { el, button(label, icon, action) { const b = el('button', '', label); b.onclick = action; return b; }, input(label, type, value) { const wrap = el('label', '', label), input = el('input'); input.type = type; input.value = value; input.setAttribute('aria-label', label); wrap.append(input); return { wrap, input }; }, modal(title, text) { const d = el('dialog'); d.append(el('h2', '', title), el('p', '', text)); document.body.append(d); d.showModal(); d.onclose = () => d.remove(); return d; } };
      window.client = HoleRelayModel.createClient({ endpoint, deviceId: 'browser', loadQueue: async () => ({ items: [] }), saveQueue: async () => {} });
    }, endpoint);
  }
  await owner.evaluate(async () => {
    await client.register({ name: 'Owner', email: 'owner@example.test', password: 'a private durable password' });
    window.project = await client.request('/projects', { method: 'POST', body: { name: 'Forms' } });
    await client.request('/sync', { method: 'POST', body: { projectId: project.id, deviceId: 'browser', changes: [{ id: 'create:form', type: 'asset.create', data: { name: 'Contact.form', mime: 'application/vnd.hole.form+json', bytes: btoa(JSON.stringify({ version: 1, fields: [{ id: 'email', label: 'Email', type: 'email', required: true }], responses: [{ email: 'private@example.test' }] })) } }] } });
    window.refresh = async () => { const host = document.querySelector('main'); host.replaceChildren(); await HolePublicForms.manage({ client, ctx, host, projectId: project.id, snapshot: await client.pull(project.id), refresh }); };
    await refresh();
  });
  await owner.getByRole('button', { name: /^Review public form/ }).click();
  assert.ok(!(await owner.getByRole('dialog').textContent()).includes('private@example.test'));
  await owner.getByRole('button', { name: 'Publish form schema', exact: true }).click();
  await owner.getByText('Published. Public form ID:', { exact: false }).waitFor();
  const id = await owner.evaluate(async () => (await client.request(`/projects/${project.id}/forms`)).forms[0].id);
  await owner.getByRole('button', { name: 'Close publication review' }).click();
  await guest.evaluate(() => HolePublicForms.entry({ client, ctx, host: document.querySelector('main') }));
  await guest.getByLabel('Public form ID').fill(id); await guest.getByRole('button', { name: 'Open public form' }).click();
  await guest.getByLabel('Email', { exact: true }).fill('guest@example.test');
  await guest.route('**/forms/*/submissions', async route => { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Temporary service failure' } }) }); }, { times: 1 });
  await guest.getByRole('button', { name: 'Submit answers' }).click();
  await guest.getByText('Temporary service failure Answers remain here; retry to confirm receipt.', { exact: true }).waitFor();
  assert.equal(await guest.getByLabel('Email', { exact: true }).inputValue(), 'guest@example.test');
  await guest.getByRole('button', { name: 'Submit answers' }).click();
  await guest.getByText('Received by the service.', { exact: false }).waitFor();
  await owner.getByRole('button', { name: 'Review responses Contact.form' }).click();
  assert.match(await owner.getByRole('dialog').textContent(), /guest@example.test/);
  const downloadPromise = owner.waitForEvent('download'); await owner.getByRole('button', { name: 'Export responses JSON' }).click();
  const download = await downloadPromise, exported = JSON.parse(await readFile(await download.path(), 'utf8')); assert.equal(exported.responses.length, 1); assert.equal(exported.responses[0].values.email, 'guest@example.test');
  await owner.getByRole('button', { name: 'Close responses' }).click();
  await owner.getByRole('button', { name: 'Revoke form Contact.form' }).click();
  await owner.getByText(/Contact.form.*revoked/).waitFor();
  await guest.getByRole('button', { name: 'Close form' }).click(); await guest.getByRole('button', { name: 'Open public form' }).click();
  await guest.getByText('This form is not available.', { exact: true }).waitFor();
  console.log(JSON.stringify({ browser: await browser.version(), passed: ['owner publishes reviewed pinned schema excluding saved responses', 'failed guest submit retains answers and retry gets real HTTP receipt', 'owner reads and downloads exact response JSON', 'owner revokes and guest cannot reopen'] }));
} finally { await browser.close(); await service.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
