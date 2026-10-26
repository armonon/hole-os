// Optional browser evidence: real Chrome persistent profiles, Core IndexedDB,
// local HTTP service. No public build writes and no existing profile access.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createService } from '../server/service.mjs';
const modulePath = process.env.HOLE_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set HOLE_PLAYWRIGHT_MODULE to an installed playwright or playwright-core module file.');
const { chromium } = await import(pathToFileURL(modulePath));
const directory = await mkdtemp(path.join(tmpdir(), 'hole-relay-browser-'));
const web = createServer(async (req, res) => {
  if (['/core.js', '/relay.js'].includes(req.url)) { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('../src' + req.url, import.meta.url))); }
  else res.end('<!doctype html><title>Relay isolated browser verification</title><script src="/core.js"></script><script src="/relay.js"></script><main>Relay browser verification harness</main>');
});
await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${web.address().port}`;
const service = await createService({ directory: path.join(directory, 'service'), origins: [origin] });
const endpoint = await service.listen(0);
const contexts = [];
const launch = async name => { const context = await chromium.launchPersistentContext(path.join(directory, name), { headless: true, executablePath: process.env.HOLE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }); contexts.push(context); return context; };
async function boot(context, deviceId) {
  const page = await context.newPage(); await page.goto(origin);
  await page.evaluate(async ({ endpoint, deviceId }) => {
    await HoleCore.ready;
    window.relay = HoleRelayModel.createClient({ endpoint, deviceId,
      loadQueue: async id => (await HoleCore.get('runs', `relay:${deviceId}:${id}`))?.queue,
      saveQueue: async (projectId, queue) => { const id = `relay:${deviceId}:${projectId}`; const current = await HoleCore.get('runs', id); await HoleCore.put('runs', { id, queue }, current ? { expectedRevision: current.revision } : {}); }
    });
  }, { endpoint, deviceId }); return page;
}
try {
  const firstContext = await launch('profile-one'), secondContext = await launch('profile-two');
  const first = await boot(firstContext, 'browser:one'), second = await boot(secondContext, 'browser:two');
  const account = { name: 'Browser test', email: 'browser@example.test', password: 'disposable browser password' };
  const project = await first.evaluate(async account => { await relay.register(account); return relay.request('/projects', { method: 'POST', body: { name: 'Browser evidence' } }); }, account);
  await second.evaluate(account => relay.signIn({ email: account.email, password: account.password }), account);
  const sharedAsset = await first.evaluate(async id => { await relay.queue(id, { id: 'asset:initial', type: 'asset.create', data: { name: 'Pinned browser file.txt', mime: 'text/plain', bytes: btoa('Pinned browser bytes') } }); return (await relay.flush(id)).results[0].result; }, project.id);

  await first.evaluate(async id => { await relay.queue(id, { id: 'initial', type: 'record.put', data: { id: 'note:browser', type: 'note', value: { text: 'Original' } } }); await relay.flush(id); }, project.id);
  await firstContext.setOffline(true);
  await first.evaluate(id => relay.queue(id, { id: 'offline', type: 'record.put', data: { id: 'note:browser', type: 'note', value: { text: 'Local offline edit' }, expectedRevision: 1 } }), project.id);
  const offline = await first.evaluate(async id => { try { await relay.flush(id); return false; } catch { return (await relay.pending(id)).some(item => item.lastError && item.status === 'pending'); } }, project.id);
  assert.equal(offline, true);
  await second.evaluate(async id => { await relay.queue(id, { id: 'remote', type: 'record.put', data: { id: 'note:browser', type: 'note', value: { text: 'Other profile edit' }, expectedRevision: 1 } }); await relay.flush(id); }, project.id);
  await firstContext.close();
  const reopenedContext = await launch('profile-one'), reopened = await boot(reopenedContext, 'browser:one');
  await reopened.evaluate(account => relay.signIn({ email: account.email, password: account.password }), account);
  assert.equal(await reopened.evaluate(async id => (await relay.flush(id)).results[0].status, project.id), 'conflict');
  const reviewed = await reopened.evaluate(id => relay.review(id, 'offline'), project.id);
  assert.equal(reviewed.item.change.data.value.text, 'Local offline edit'); assert.equal(reviewed.current.value.text, 'Other profile edit');
  await reopened.evaluate(async id => { const review = await relay.review(id, 'offline'); await relay.resolve(id, 'offline', { decision: 'replace', replacement: { id: 'merged', type: 'record.put', data: { ...review.item.change.data, expectedRevision: review.current.revision, value: { text: 'Explicitly merged browser work' } } } }); await relay.flush(id); }, project.id);
  assert.equal(await second.evaluate(async id => (await relay.pull(id)).records[0].value.text, project.id), 'Explicitly merged browser work');
  assert.equal(await reopened.evaluate(async id => (await relay.pending(id)).find(item => item.change.id === 'offline').change.data.value.text, project.id), 'Local offline edit');
  // Mount the real Relay UI with only the standard continuity context helpers.
  await reopened.evaluate(async ({ endpoint, projectId }) => {
    await relay.queue(projectId, { id: 'ui:conflict', type: 'record.put', data: { id: 'note:browser', type: 'note', value: { text: 'UI local text' }, expectedRevision: 1 } }); await relay.flush(projectId);
    await HoleCore.put('settings', { id: 'relay:device', value: 'browser:one' });
    const main = document.querySelector('main'); main.replaceChildren();
    const el = (tag, className = '', text = '') => { const element = document.createElement(tag); element.className = className; element.textContent = text; return element; };
    await HoleRelay.render({ C: HoleCore, main, el, navigation: {}, H: { icons() {} }, title() {},
      button: (label, icon, action) => { const b = el('button', '', label); b.onclick = action; return b; },
      input: (label, type, value) => { const wrap = el('label', '', label), input = el('input'); input.type = type; input.value = value; input.setAttribute('aria-label', label); wrap.append(input); return { wrap, input }; },
      section: label => { const section = el('section'); section.append(el('h2', '', label)); main.append(section); return section; },
      status: (message, error, target) => { target.textContent = message; },
      modal: (title, description) => { const dialog = el('dialog'); dialog.append(el('h2', '', title), el('p', '', description)); main.append(dialog); dialog.showModal(); return dialog; }
    }); document.querySelector('input[type=url]').value = endpoint;
  }, { endpoint, projectId: project.id });
  await reopened.getByRole('button', { name: 'Connect', exact: true }).click();
  // Same-site HttpOnly session was recovered by Connect.
  await reopened.getByLabel('Remote project', { exact: true }).selectOption(project.id);
  await reopened.getByRole('button', { name: 'Review change', exact: true }).click();
  await reopened.getByRole('dialog').getByRole('heading', { name: 'Current permitted remote state' }).waitFor();
  assert.match(await reopened.getByRole('dialog').textContent(), /UI local text/);
  await reopened.getByRole('button', { name: 'Keep remote; retain local history', exact: true }).click();
  await reopened.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await reopened.evaluate(async id => (await relay.pending(id)).find(item => item.change.id === 'ui:conflict').status, project.id), 'resolved');
  await reopened.getByRole('button', { name: 'Review guest preview link', exact: true }).click();
  await reopened.getByRole('button', { name: 'Create guest token', exact: true }).click();
  await reopened.getByRole('heading', { name: 'Guest token created', exact: true }).waitFor();
  const guestToken = await reopened.getByRole('dialog').filter({ has: reopened.getByRole('heading', { name: 'Guest token created', exact: true }) }).locator('pre').textContent();
  await reopened.getByRole('button', { name: 'Preview this guest selection', exact: true }).click();
  await reopened.getByRole('button', { name: 'Download Pinned browser file.txt', exact: true }).waitFor();
  await reopened.getByRole('button', { name: 'Close preview', exact: true }).click();
  await reopened.getByRole('button', { name: 'Done', exact: true }).click();
  const guestRead = async () => second.evaluate(async ({ endpoint, guestToken, sharedAsset }) => {
    const route = `${endpoint}/guest/${encodeURIComponent(guestToken)}/assets/${encodeURIComponent(sharedAsset.assetId)}/versions/${encodeURIComponent(sharedAsset.versionId)}`;
    const response = await fetch(route, { credentials: 'omit', cache: 'no-store' }); return { status: response.status, text: await response.text() };
  }, { endpoint, guestToken, sharedAsset });
  assert.deepEqual(await guestRead(), { status: 200, text: 'Pinned browser bytes' });
  const privateVersion = await reopened.evaluate(async ({ id, asset }) => { await relay.queue(id, { id: 'asset:private-next', type: 'asset.commit', data: { assetId: asset.assetId, baseVersionId: asset.versionId, mime: 'text/plain', bytes: btoa('Private future bytes') } }); return (await relay.flush(id)).results[0].result; }, { id: project.id, asset: sharedAsset });
  assert.deepEqual(await guestRead(), { status: 200, text: 'Pinned browser bytes' });
  const forbidden = await second.evaluate(async ({ endpoint, guestToken, asset }) => (await fetch(`${endpoint}/guest/${encodeURIComponent(guestToken)}/assets/${encodeURIComponent(asset.assetId)}/versions/${encodeURIComponent(asset.versionId)}`, { credentials: 'omit' })).status, { endpoint, guestToken, asset: privateVersion }); assert.equal(forbidden, 404);
  await reopened.getByRole('button', { name: 'Revoke guest Browser evidence', exact: true }).click();
  await reopened.getByRole('button', { name: 'Revoke guest Browser evidence', exact: true }).waitFor({ state: 'detached' });
  assert.equal((await guestRead()).status, 404);
  console.log(JSON.stringify({ browser: await reopened.evaluate(() => navigator.userAgent), profiles: 2, verified: ['Core IndexedDB queue', 'real browser offline failure', 'profile close/reopen', 'conflict preservation', 'explicit resolution', 'other-profile pull', 'mounted Relay review dialog and keep-remote control', 'guest preview UI creation and review', 'anonymous pinned bytes exclude private future version', 'guest revocation blocks subsequent download'], limits: 'Actual browser transport and mounted Relay review UI; full shell navigation, Safari and physical devices not exercised.' }, null, 2));
} finally {
  await Promise.allSettled(contexts.map(context => context.close())); await service.close(); await new Promise(resolve => web.close(resolve)); await rm(directory, { recursive: true, force: true });
}
