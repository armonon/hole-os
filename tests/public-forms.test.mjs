import test from 'node:test';
import assert from 'node:assert/strict';
import { formSchema, formValues, publishForm, publicForm, submitForm, formResponses, revokeForm } from '../server/forms.mjs';
const now = 100000;
function fixture() {
  const schema = { version: 1, fields: [{ id: 'email', label: 'Email', type: 'email', required: true }], responses: [{ secret: 'private' }] };
  return { projects: { p: { id: 'p', revision: 1, members: { owner: { role: 'owner' }, viewer: { role: 'viewer' } } } }, assets: { a: { id: 'a', projectId: 'p', state: 'active' } }, versions: { v: { id: 'v', assetId: 'a', mime: 'application/vnd.hole.form+json', bytes: Buffer.from(JSON.stringify(schema)).toString('base64') } } };
}
const publish = state => publishForm(state, { id: 'owner' }, 'p', { name: 'Contact', assetId: 'a', versionId: 'v', expectedRevision: 1 }, now);
test('pinned public schema excludes local responses and owner metadata; permissions follow current ownership', () => {
  const state = fixture(), form = publish(state);
  state.versions.v.bytes = Buffer.from('{}').toString('base64');
  const visible = publicForm(state, form.id, now);
  assert.equal(visible.fields[0].id, 'email');
  assert.deepEqual(Object.keys(visible).sort(), ['expiresAt', 'fields', 'id', 'name', 'version']);
  assert.throws(() => formResponses(state, { id: 'viewer' }, 'p', form.id), /owner/);
  submitForm(state, form.id, { submissionId: 'one', values: { email: 'a@example.test' } }, now, '127.0.0.1');
  assert.equal(formResponses(state, { id: 'owner' }, 'p', form.id)[0].values.email, 'a@example.test');
  assert.ok(!JSON.stringify(formResponses(state, { id: 'owner' }, 'p', form.id)).includes('Hash'));
  revokeForm(state, { id: 'owner' }, 'p', form.id, now);
  assert.throws(() => publicForm(state, form.id, now), /not available/);
  assert.throws(() => submitForm(state, form.id, { submissionId: 'two', values: {} }, now, 'ip'), /not available/);
});
test('submission retries are idempotent and durable rate limits cannot be bypassed with new IDs', () => {
  let state = fixture(); const form = publish(state), input = { submissionId: 'one', values: { email: 'a@example.test' } };
  const first = submitForm(state, form.id, input, now, 'ip');
  state = JSON.parse(JSON.stringify(state));
  assert.deepEqual(submitForm(state, form.id, input, now + 1, 'ip'), first);
  assert.throws(() => submitForm(state, form.id, { ...input, values: { email: 'b@example.test' } }, now, 'ip'), /different answers/);
  for (let i = 0; i < 4; i++) submitForm(state, form.id, { ...input, submissionId: `id${i}` }, now, 'ip');
  assert.throws(() => submitForm(state, form.id, { ...input, submissionId: 'six' }, now, 'ip'), /Wait a minute/);
  submitForm(state, form.id, { ...input, submissionId: 'six' }, now + 60001, 'ip');
});
test('schema and response validation reject unsafe IDs, unknown fields, invalid dates and oversized answers', () => {
  assert.throws(() => formSchema({ version: 1, fields: [{ id: '__proto__', label: 'x', type: 'text' }] }), /unique IDs/);
  const schema = formSchema({ version: 1, fields: [{ id: 'date', label: 'Date', type: 'date' }] });
  assert.throws(() => formValues(schema, { date: '2026-02-30' }), /valid date/);
  assert.throws(() => formValues(schema, { unexpected: 'x' }), /only/);
  assert.throws(() => formValues(schema, { date: 'x'.repeat(10001) }), /too long/);
});
