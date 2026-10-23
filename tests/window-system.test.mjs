import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

// Test the actual pure stage calculation without fabricating a browser DOM.
const source = await readFile(new URL('../src/window-system.js', import.meta.url), 'utf8');
const stageSource = source.match(/  function gestureStage\([^]*?\n  }/);
assert.ok(stageSource, 'The window module exposes a pure gesture stage function in its source');
const stage = runInNewContext('(' + stageSource[0].trim() + ')');

test('upward distance selects the dock, desktop, and manager at the requested thresholds', () => {
  assert.equal(stage(0), 0);
  assert.equal(stage(.099), 0);
  assert.equal(stage(.1), 1);
  assert.equal(stage(.299), 1);
  assert.equal(stage(.3), 2);
  assert.equal(stage(.499), 2);
  assert.equal(stage(.5), 3);
  assert.equal(stage(.85), 3);
});

test('a small reversal holds the current preview, avoiding boundary flicker', () => {
  assert.equal(stage(.08, 1), 1);
  assert.equal(stage(.28, 2), 2);
  assert.equal(stage(.48, 3), 3);
  assert.equal(stage(.499, stage(.5, 2)), 3);
});

test('a deliberate reverse swipe steps back through every destination before release', () => {
  let current = stage(.6);
  assert.equal(current, 3);
  current = stage(.474, current);
  assert.equal(current, 2);
  current = stage(.274, current);
  assert.equal(current, 1);
  current = stage(.074, current);
  assert.equal(current, 0);
});

test('fast travel may cross multiple stages and returning to the start cancels the choice', () => {
  assert.equal(stage(.65, 0), 3);
  assert.equal(stage(.12, 3), 1);
  assert.equal(stage(0, 3), 0);
  assert.equal(stage(-.2, 3), 0);
  assert.equal(stage(Number.NaN, 3), 0);
});
