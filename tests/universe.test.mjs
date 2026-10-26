import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const source = await readFile(new URL('../src/universe.js', import.meta.url), 'utf8');
const environment = vm.createContext({}); vm.runInContext(source, environment);
const model = environment.HoleUniverse.model;

test('depth is spatial depth and never consumes a legacy camera zoom z', () => {
  const item = model.point({ x: 90, y: 40, z: 2 });
  assert.equal(item.x, 90); assert.equal(item.y, 40); assert.equal(item.depth, -130);
  const spatial = model.point({ x: 90, y: 40, z: 2, depth: 240 }); assert.equal(spatial.depth, 240);
  assert.equal(model.camera({ z: .7 }).distance, 760);
});
test('perspective projection depends on actual spatial depth', () => {
  const camera = model.camera({ x: 0, y: 0, depth: 0, distance: 500, yaw: 0, pitch: 0 });
  const near = model.projectPoint({ x: 100, y: 50, depth: 400 }, camera);
  const far = model.projectPoint({ x: 100, y: 50, depth: -400 }, camera);
  assert.ok(near.scale > far.scale); assert.ok(near.x > far.x);
  assert.equal(model.projectPoint({ x: 0, y: 0, depth: 1500 }, camera).behind, true);
  assert.equal(model.projectPoint({ x: 100, y: 0, depth: 500 }, camera, { depth: 0 }).scale, model.projectPoint({ x: 100, y: 0, depth: -500 }, camera, { depth: 0 }).scale);
});
test('yaw moves a depth-separated object sideways instead of only scaling it', () => {
  const camera = model.camera({ x: 0, y: 0, depth: 0, distance: 500, yaw: 30, pitch: 0 });
  const near = model.projectPoint({ x: 0, y: 0, depth: 300 }, camera), far = model.projectPoint({ x: 0, y: 0, depth: -300 }, camera);
  assert.ok(near.x > 0); assert.ok(far.x < 0);
});
test('Explore movement follows camera heading and camera limits remain finite', () => {
  const camera = model.camera({ yaw: 90, pitch: 0 });
  const forward = model.moveCamera(camera, 'forward', 100);
  assert.equal(Math.round(forward.x), -100); assert.equal(Math.round(forward.depth), 0);
  assert.equal(model.moveCamera(camera, 'up', 50).y, -50);
  const bounded = model.camera({ x: 1e20, distance: 0, pitch: 150, depth: NaN });
  assert.equal(bounded.x, 10000); assert.equal(bounded.distance, 120); assert.equal(bounded.pitch, 65); assert.equal(bounded.depth, 0);
});
test('spatial input is scoped and layout persists under separate device profiles', () => {
  assert.match(source, /event\.target !== viewport/);
  assert.match(source, /mode !== 'explore'/);
  assert.doesNotMatch(source, /addEventListener\(['"]wheel/);
  assert.match(source, /deviceViews:[\s\S]*\[savedDevice\]: snapshot/);
  assert.match(source, /grid\.replaceChildren\(\.\.\.cards\)/);
  assert.match(source, /slice\(0, 30\)/);
});
