import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
const source = await readFile(new URL('../src/rack.js', import.meta.url), 'utf8');
const context = vm.createContext({ Blob, setTimeout, clearTimeout }); vm.runInContext(source, context);
const rack = context.HoleRack;
const preset = () => ({ format: 'hole-rack', schemaVersion: 1, name: 'Instrument', parameters: { ...rack.defaults } });

test('Rack preset roundtrip preserves the real graph parameters and rejects executable/invalid fields', async () => {
  const value = preset(); value.parameters.cutoff = 2200; value.parameters.waveform = 'triangle';
  const blob = rack.serialize(value); assert.equal(blob.type, rack.MIME);
  const restored = await rack.parse(blob); assert.equal(restored.parameters.cutoff, 2200); assert.equal(restored.parameters.waveform, 'triangle');
  assert.throws(() => rack.validate({ ...value, schemaVersion: 999 }), /valid Hole Rack/);
  assert.throws(() => rack.validate({ ...value, parameters: { ...value.parameters, code: 'doSomething()' } }), /Unsupported/);
  assert.throws(() => rack.validate({ ...value, parameters: { ...value.parameters, feedback: 1 } }), /feedback/);
  assert.throws(() => rack.validate({ ...value, parameters: { ...value.parameters, frequency: Infinity } }), /frequency/);
  await assert.rejects(rack.parse(new Blob(['not json'])), /valid preset JSON/);
});

test('graph wires actual audio processing and a bounded delay feedback loop', () => {
  const nodes = [], param = () => ({ value: 0, events: [], setValueAtTime(value, at) { this.events.push(['set', value, at]); }, linearRampToValueAtTime(value, at) { this.events.push(['ramp', value, at]); }, setTargetAtTime(value, at, time) { this.events.push(['target', value, at, time]); } });
  function node(type) { const value = { type, connections: [], frequency: param(), Q: param(), gain: param(), delayTime: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect(target) { this.connections.push(target); }, disconnect() { this.connections = []; }, start(at) { this.started = at; }, stop(at) { this.stopped = at; } }; nodes.push(value); return value; }
  const audio = { currentTime: 5, destination: {}, createOscillator: () => node('oscillator'), createBiquadFilter: () => node('filter'), createGain: () => node('gain'), createDelay: () => node('delay'), createDynamicsCompressor: () => node('compressor') };
  const graph = rack.buildGraph(audio, preset().parameters);
  assert.ok(graph.oscillator.connections.includes(graph.filter));
  assert.ok(graph.delay.connections.includes(graph.feedback)); assert.ok(graph.feedback.connections.includes(graph.delay));
  assert.ok(graph.lfoGain.connections.includes(graph.filter.frequency));
  assert.equal(graph.feedback.gain.value, .25); assert.equal(graph.oscillator.started, 5);
  assert.ok(graph.envelope.gain.events.some(([type, value]) => type === 'ramp' && value === 0));
  graph.update({ ...preset().parameters, frequency: 440 }); assert.equal(graph.oscillator.frequency.events.at(-1)[1], 440);
  graph.stop(); assert.ok(nodes.every(value => !value.connections.length));
});

test('offline output duration includes release and delay tail with bounded allocation', () => {
  const params = preset().parameters;
  assert.ok(rack.renderLength(params) > params.duration * 44100);
  assert.ok(rack.renderLength({ ...params, duration: 20, release: 4, delayTime: 1 }) < 29 * 44100);
});

test('Stop during a suspended preview resume prevents a late sound and releases the context', async () => {
  let resume, closed = 0;
  context.AudioContext = class { resume() { return new Promise(resolve => { resume = resolve; }); } async close() { closed++; } createOscillator() { throw new Error('No graph should start after Stop'); } };
  const preview = rack.audition(preset());
  while (!resume) await Promise.resolve();
  await rack.stop(); resume(); assert.equal(await preview, null); assert.equal(closed, 1);
});

test('invalid stored Rack draft remains intact instead of being overwritten by defaults', async () => {
  let writes = 0;
  await assert.rejects(rack.render({ C: { get: async () => ({ id: 'rack-draft:inbox', revision: 1, value: { format: 'future-rack', schemaVersion: 2 } }), put: async () => { writes++; } }, navigation: {} }), /data has been retained/);
  assert.equal(writes, 0);
});
