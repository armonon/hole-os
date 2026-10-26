import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import '../src/core.js';
import '../src/everyday.js';

const M = globalThis.HoleEverydayModel;
const event = overrides => ({ id: 'meeting', name: 'Project review', startLocal: '2026-10-26T10:00', endLocal: '2026-10-26T11:00', timeZone: 'America/Los_Angeles', disambiguation: 'reject', ...overrides });

test('events preserve explicit IANA zone and correct UTC dates independent of host timezone', () => {
  const result = M.validateEvent(event());
  assert.equal(new Date(result.startAt).toISOString(), '2026-10-26T17:00:00.000Z');
  assert.equal(result.endAt - result.startAt, 3600000);
  const india = M.validateEvent(event({ timeZone: 'Asia/Kolkata' }));
  assert.equal(new Date(india.startAt).toISOString(), '2026-10-26T04:30:00.000Z');
  assert.throws(() => M.validateEvent(event({ endLocal: '2026-10-26T09:59' })), /after/);
});

test('daylight-saving gaps and repeated hours require a deliberate valid choice', () => {
  assert.throws(() => M.wallTimeToInstant('2026-03-08T02:30', 'America/Los_Angeles'), /does not exist/);
  assert.throws(() => M.wallTimeToInstant('2026-11-01T01:30', 'America/Los_Angeles'), /occurs twice/);
  const early = M.wallTimeToInstant('2026-11-01T01:30', 'America/Los_Angeles', 'earlier');
  const late = M.wallTimeToInstant('2026-11-01T01:30', 'America/Los_Angeles', 'later');
  assert.equal(late - early, 3600000);
  assert.throws(() => M.wallTimeToInstant('2026-02-30T10:00', 'UTC'));
  assert.throws(() => M.wallTimeToInstant('2026-01-01T25:00', 'UTC'));
  assert.throws(() => M.wallTimeToInstant('2026-01-01T10:00', 'Invalid/Zone'));
});

test('calendar export escapes injected lines and folds Unicode at UTF-8 byte boundaries', () => {
  const long = '日本語'.repeat(50), data = M.validateEvent(event({ name: 'Meeting\nEND:VEVENT\nBEGIN:EVIL', notes: long }));
  const ics = M.calendarICS([data], Date.UTC(2026, 9, 26));
  assert.match(ics, /DTSTART:20261026T170000Z/);
  assert.match(ics, /X-HOLE-TIMEZONE:America\/Los_Angeles/);
  assert.equal(ics.split('\r\n').filter(line => line === 'END:VEVENT').length, 1);
  assert.ok(!ics.includes('\r\nBEGIN:EVIL'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(ics.replace(/\r\n /g, '').includes(long));
});

test('formatted HTML exports readable real markup while arbitrary scripts remain escaped text', () => {
  const html = M.documentHTML('# Title\n\n**Bold** and *italic*\n- One\n> Quote\n<script>alert(1)</script>', '<bad title>');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<title>&lt;bad title&gt;<\/title>/);
});

test('tables evaluate references, order of operations, ranges, SUM and AVERAGE', () => {
  const values = M.evaluateSheet({ version: 1, cells: [['2', '3', '=A1+B1*4'], ['8', '4', '=SUM(A1:B2)'], ['=AVERAGE(A1:B2)', '=-(A1+B1)/5', '=SUM(A1:B1,4)']] });
  assert.equal(values[0][2], 14); assert.equal(values[1][2], 17);
  assert.equal(values[2][0], 4.25); assert.equal(values[2][1], -1); assert.equal(values[2][2], 9);
});

test('table cycles, invalid references and executable expressions produce errors without evaluation', () => {
  const sheet = { version: 1, cells: [['=B1', '=A1', '=globalThis.hacked=1'], ['=Z99', '=1/0', '=SUM(A99:A100)']] };
  assert.deepEqual(M.evaluateSheet(sheet), [['#CYCLE!', '#CYCLE!', '#FORMULA!'], ['#REF!', '#DIV/0!', '#REF!']]);
  assert.equal(globalThis.hacked, undefined);
});

test('CSV exports calculated values and quotes neutralize spreadsheet injection in text cells', () => {
  const csv = M.sheetCSV({ version: 1, cells: [['a,"b"', '3', '=B1*2'], ['@IMPORT("evil")', '-danger', 'ordinary']] });
  assert.match(csv, /"a,""b""","3","6"/);
  assert.match(csv, /"'@IMPORT/); assert.match(csv, /"'-danger"/);
});

test('forms validate required, typed values and retain only declared answers', () => {
  const form = { version: 1, fields: [{ id: 'name', label: 'Name', type: 'text', required: true }, { id: 'email', label: 'Email', type: 'email' }, { id: 'agree', label: 'Agree', type: 'checkbox', required: true }], responses: [] };
  assert.throws(() => M.formResponse(form, { name: '', agree: true }), /Complete/);
  assert.throws(() => M.formResponse(form, { name: 'Person', email: 'invalid', agree: true }), /email/);
  const result = M.formResponse(form, { name: 'Person', email: 'p@example.test', agree: true, secret: 'ignore' }, 123);
  assert.equal(result.at, 123); assert.equal(result.values.name, 'Person'); assert.equal(result.values.secret, undefined);
});

test('everyday records and document bytes survive close/reopen and full backup restore', async () => {
  const db = new IDBFactory(), core = globalThis.HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  const savedEvent = await core.put('events', M.validateEvent(event()));
  await core.put('tasks', { id: 't', name: 'Send the document', dueDate: '2026-10-27', done: false });
  await core.put('contacts', { id: 'c', name: 'A person', email: 'p@example.test' });
  const sheet = { version: 1, cells: [['3', '=A1*2']] };
  const table = await core.importAsset({ name: 'Budget', kind: 'table', blob: new Blob([JSON.stringify(sheet)], { type: M.SHEET_MIME }) });
  const doc = await core.importAsset({ name: 'Document', kind: 'document', blob: new Blob(['# Saved'], { type: M.DOC_MIME }) });
  const backup = await core.exportBackup(); core.close();
  const reopened = globalThis.HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  assert.equal((await reopened.get('events', savedEvent.id)).timeZone, 'America/Los_Angeles');
  assert.equal((await reopened.get('contacts', 'c')).name, 'A person');
  const read = await reopened.readAsset(table.asset.id); assert.equal(M.evaluateSheet(JSON.parse(await read.blob.text()))[0][1], 6);
  const clean = globalThis.HoleCoreFactory.create({ indexedDB: new IDBFactory(), localStorage: null, broadcast: false });
  await clean.restoreBackup(backup); assert.equal(await (await clean.readAsset(doc.asset.id)).blob.text(), '# Saved');
  assert.equal((await clean.get('tasks', 't')).done, false); clean.close(); reopened.close();
});

test('Paperwork drafts recover saved edits and keep a competing tab from overwriting them', async () => {
  const db = new IDBFactory(), core = globalThis.HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  const first = await M.draftSession(core, 'paper-table:one', { cells: [['old']] });
  await first.save({ cells: [['1', '=A1*2']], baseVersionId: 'version-one' });
  const stale = await M.draftSession(core, 'paper-table:one', {});
  await first.save({ cells: [['3', '=A1*2']], baseVersionId: 'version-one' });
  await assert.rejects(stale.save({ cells: [['competing edit']] }), { code: 'CONFLICT' });
  assert.equal(stale.failed, true); assert.equal(stale.pending, 0);
  assert.equal(stale.value.cells[0][0], 'competing edit', 'a conflict does not discard the local editor value');
  await assert.rejects(stale.flush(), { code: 'CONFLICT' });
  core.close();
  const reopened = globalThis.HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  const recovered = await M.draftSession(reopened, 'paper-table:one', {});
  assert.equal(recovered.recovered, true); assert.equal(recovered.value.cells[0][0], '3');
  await recovered.clear(); assert.equal(await reopened.get('settings', 'paper-table:one'), null); reopened.close();
});

test('Day deletion is recoverable across reopen and rejects stale deletion or restoration', async () => {
  const db = new IDBFactory(), core = HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  const removed = [];
  for (const type of ['events', 'tasks', 'contacts']) {
    const original = await core.put(type, { id: type + ':one', name: type, notes: 'Retain details' });
    const deleted = await M.setDayDeleted(core, type, original, true); removed.push([type, deleted]);
    await assert.rejects(M.setDayDeleted(core, type, original, false), { code: 'CONFLICT' });
  }
  core.close(); const reopened = HoleCoreFactory.create({ indexedDB: db, localStorage: null, broadcast: false });
  for (const [type, deleted] of removed) {
    assert.equal((await reopened.get(type, deleted.id)).deleted, true);
    const restored = await M.setDayDeleted(reopened, type, deleted, false); assert.equal(restored.notes, 'Retain details'); assert.equal(restored.deleted, false);
  }
  const exported = JSON.parse(M.dayExport({ contacts: await reopened.list('contacts') }, 123)); assert.equal(exported.contacts[0].notes, 'Retain details'); assert.equal(exported.exportedAt, 123);
  reopened.close();
});
