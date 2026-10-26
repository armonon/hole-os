import { randomUUID, createHash } from 'node:crypto';
import { serviceError } from './store.mjs';

export const FORM_BODY_LIMIT = 64 * 1024;
const check = (ok, status, code, message) => { if (!ok) throw serviceError(status, code, message); };
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const digest = value => createHash('sha256').update(value).digest('hex');
const boundedText = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

// Copy an allowlist: local responses and unknown metadata never become public.
export function formSchema(value) {
  check(plain(value) && value.version === 1 && Array.isArray(value.fields) && value.fields.length > 0 && value.fields.length <= 30, 400, 'INVALID_FORM', 'Choose a version 1 form with 1–30 fields.');
  const ids = new Set();
  return { version: 1, fields: value.fields.map(field => {
    check(plain(field) && identifier(field.id) && !ids.has(field.id) && boundedText(field.label, 240) && ['text', 'email', 'number', 'date', 'checkbox'].includes(field.type) && (field.required === undefined || typeof field.required === 'boolean'), 400, 'INVALID_FORM', 'Form fields need unique IDs, labels and supported types.');
    ids.add(field.id);
    return { id: field.id, label: field.label.trim(), type: field.type, required: field.required === true };
  }) };
}
export function formValues(schema, input) {
  check(plain(input) && Object.keys(input).every(key => schema.fields.some(field => field.id === key)), 400, 'INVALID_RESPONSE', 'Use only this form’s fields.');
  const values = Object.create(null);
  for (const field of schema.fields) {
    const raw = Object.hasOwn(input, field.id) ? input[field.id] : undefined;
    if (field.type === 'checkbox') {
      check(raw === undefined || typeof raw === 'boolean', 400, 'INVALID_RESPONSE', `${field.label} needs a checkbox value.`);
      values[field.id] = raw === true;
      check(!field.required || values[field.id], 400, 'INVALID_RESPONSE', `${field.label} is required.`);
      continue;
    }
    check(raw === undefined || typeof raw === 'string', 400, 'INVALID_RESPONSE', `${field.label} needs text.`);
    const value = (raw || '').trim();
    check(value.length <= 10000 && (!field.required || value.length > 0), 400, 'INVALID_RESPONSE', `${field.label} is required or too long.`);
    if (value && field.type === 'email') check(value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 400, 'INVALID_RESPONSE', `${field.label} needs an email address.`);
    if (value && field.type === 'number') check(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value)), 400, 'INVALID_RESPONSE', `${field.label} needs a finite number.`);
    if (value && field.type === 'date') check(/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 400, 'INVALID_RESPONSE', `${field.label} needs a valid date.`);
    values[field.id] = value;
  }
  check(Buffer.byteLength(JSON.stringify(values)) <= FORM_BODY_LIMIT, 413, 'TOO_LARGE', 'This response is too large.');
  return values;
}
function owner(state, actor, projectId) {
  const project = state.projects[projectId];
  check(project && actor && project.members[actor.id], 404, 'NOT_FOUND', 'This project is not available.');
  check(project.members[actor.id].role === 'owner', 403, 'FORBIDDEN', 'Only the project owner can manage public forms.');
  return project;
}
function available(state, id, now) {
  const form = Object.hasOwn(state.forms || {}, id) && state.forms[id];
  check(form && !form.revokedAt && form.expiresAt > now, 404, 'NOT_FOUND', 'This form is not available.');
  return form;
}
function summary(form) { return { id: form.id, name: form.name, assetId: form.assetId, versionId: form.versionId, createdAt: form.createdAt, expiresAt: form.expiresAt, revokedAt: form.revokedAt, responseCount: form.submissions.length }; }
export function publishForm(state, actor, projectId, input, now) {
  const project = owner(state, actor, projectId);
  check(Object.values(state.forms || {}).filter(form => form.projectId === projectId).length < 100, 409, 'FORM_LIMIT', 'This project has reached its public form limit.');
  check(plain(input) && Object.keys(input).every(key => ['name', 'assetId', 'versionId', 'expectedRevision', 'ttlMs'].includes(key)), 400, 'INVALID_FORM', 'Unexpected publication fields.');
  check(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision === project.revision, 409, 'CONFLICT', 'Review the current project before publishing.');
  check(boundedText(input.name, 160), 400, 'INVALID_FORM', 'Name this public form.');
  const asset = state.assets[input.assetId], version = state.versions[input.versionId];
  check(asset && asset.projectId === projectId && asset.state === 'active' && version?.assetId === asset.id && version.mime === 'application/vnd.hole.form+json', 400, 'INVALID_FORM', 'Choose an active form version in this project.');
  const bytes = Buffer.from(version.bytes, 'base64');
  check(bytes.length <= 1024 * 1024, 413, 'TOO_LARGE', 'The selected form is too large.');
  let parsed; try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw serviceError(400, 'INVALID_FORM', 'The selected form is not valid JSON.'); }
  const schema = formSchema(parsed), ttl = input.ttlMs ?? 7 * 86400000;
  check(Number.isSafeInteger(ttl) && ttl >= 60000 && ttl <= 30 * 86400000, 400, 'INVALID_FORM', 'Choose an expiry from one minute to thirty days.');
  const form = { id: `form:${randomUUID()}`, projectId, name: input.name.trim(), assetId: asset.id, versionId: version.id, schema, createdAt: now, expiresAt: now + ttl, revokedAt: null, submissions: [] };
  state.forms ||= {}; state.forms[form.id] = form; project.revision++;
  return summary(form);
}
export function listForms(state, actor, projectId) { owner(state, actor, projectId); return Object.values(state.forms || {}).filter(form => form.projectId === projectId).map(summary); }
export function publicForm(state, id, now) { const form = available(state, id, now); return { id: form.id, name: form.name, ...structuredClone(form.schema), expiresAt: form.expiresAt }; }
export function revokeForm(state, actor, projectId, id, now) {
  owner(state, actor, projectId); const form = state.forms?.[id];
  check(form && form.projectId === projectId, 404, 'NOT_FOUND', 'This form is not available.');
  if (!form.revokedAt) { form.revokedAt = now; state.projects[projectId].revision++; } return summary(form);
}
export function formResponses(state, actor, projectId, id) {
  owner(state, actor, projectId); const form = state.forms?.[id];
  check(form && form.projectId === projectId, 404, 'NOT_FOUND', 'This form is not available.');
  return form.submissions.map(({ id, createdAt, values }) => ({ id, createdAt, values: structuredClone(values) }));
}
// Invoke inside the service's durable transaction; never acknowledge before commit.
export function submitForm(state, id, input, now, clientAddress) {
  const form = available(state, id, now);
  check(plain(input) && Object.keys(input).length === 2 && identifier(input.submissionId) && Object.hasOwn(input, 'values'), 400, 'INVALID_RESPONSE', 'Supply a submission ID and values.');
  const values = formValues(form.schema, input.values), requestHash = digest(JSON.stringify(values));
  const existing = form.submissions.find(item => item.id === input.submissionId);
  if (existing) { check(existing.requestHash === requestHash, 409, 'CONFLICT', 'This submission ID already has different answers.'); return { id: existing.id, createdAt: existing.createdAt }; }
  check(typeof clientAddress === 'string' && clientAddress.length > 0, 500, 'ADDRESS_REQUIRED', 'Submission address is unavailable.');
  const addressHash = digest(`${form.id}:${clientAddress}`);
  check(form.submissions.filter(item => item.addressHash === addressHash && item.createdAt > now - 60000).length < 5, 429, 'RATE_LIMITED', 'Wait a minute before submitting again.');
  check(form.submissions.length < 1000, 409, 'FORM_FULL', 'This form has reached its response limit.');
  const response = { id: input.submissionId, createdAt: now, values, requestHash, addressHash }; form.submissions.push(response);
  return { id: response.id, createdAt: response.createdAt };
}
