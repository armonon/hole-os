import test from 'node:test';
import assert from 'node:assert/strict';
await import('../src/file-platform.js');
const model = globalThis.HoleFileModel;

test('download names cannot contain path separators or control characters', () => {
  assert.equal(model.cleanName('../a\\b\u0000.png'), '..ab.png');
  assert.equal(model.cleanName('\n\r/'), 'Untitled');
  assert.equal(model.cleanName('x'.repeat(250)).length, 200);
  assert.equal(model.cleanName('  a & <b>.png  '), 'a & <b>.png');
});

test('derivatives preserve the stem and use the real format extension', () => {
  assert.equal(model.derivativeName('art.final.png', 'jpeg'), 'art.final.jpg');
  assert.equal(model.derivativeName('Untitled', 'webp'), 'Untitled.webp');
  assert.equal(model.derivativeName('a\\b.png', 'png'), 'ab.png');
});

test('empty platform MIME types are inferred conservatively', () => {
  assert.equal(model.inferType({ name: 'ART.PNG', type: '' }), 'image/png');
  assert.equal(model.inferType({ name: 'page.html', type: '' }), 'application/octet-stream');
  assert.equal(model.inferType({ name: 'unknown', type: '' }), 'application/octet-stream');
  assert.equal(model.inferType({ name: 'audio.wav', type: 'audio/x-wav' }), 'audio/x-wav');
});

test('sizes report bytes, kilobytes, and megabytes', () => {
  assert.equal(model.formatBytes(0), '0 B');
  assert.equal(model.formatBytes(1024), '1.0 KB');
  assert.equal(model.formatBytes(1024 ** 2), '1.0 MB');
});
