/* Bounded tools and isolated source previews. No eval or host resource grants. */
(() => {
  'use strict';
  const error = message => { throw new Error(message); };
  const text = (value, limit = 5000) => typeof value === 'string' && value.length <= limit ? value : error('Text exceeds this tool’s limit.');
  const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max ? value : error(`Choose a number from ${min} to ${max}.`);
  const types = ['counter', 'checklist', 'timer', 'calculator'];
  function tool(config) {
    if (!config || !types.includes(config.type)) error('Choose a supported bounded component.');
    const result = { schema: 'hole.tool/1', type: config.type, name: text(config.name || 'My tool', 100), permissions: [] };
    if (config.type === 'counter') Object.assign(result, { initial: finite(Number(config.initial ?? 0), -1e9, 1e9), step: finite(Number(config.step ?? 1), .001, 1e6) });
    if (config.type === 'timer') result.seconds = finite(Number(config.seconds || 60), 1, 86400);
    if (config.type === 'checklist') { if (!Array.isArray(config.items) || config.items.length > 100) error('Use up to 100 checklist items.'); result.items = config.items.map(item => text(item, 300)); }
    return result;
  }
  function calculate(a, operation, b) { finite(a, -1e12, 1e12); finite(b, -1e12, 1e12); if (!['+', '-', '*', '/'].includes(operation)) error('Unsupported operation.'); if (operation === '/' && b === 0) error('Division by zero is undefined.'); return operation === '+' ? a + b : operation === '-' ? a - b : operation === '*' ? a * b : a / b; }
  function webProject(value) { if (value?.schema !== 'hole.weblab/1') error('Not a WebLab project.'); return { schema: value.schema, name: text(value.name || 'My website', 100), files: { 'index.html': text(value.files?.['index.html'] || '', 500000), 'style.css': text(value.files?.['style.css'] || '', 500000), 'script.js': text(value.files?.['script.js'] || '', 500000) } }; }
  function sandbox(value) {
    const p = webProject(value); const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + p.files['style.css'].replace(/<\/style/gi, '<\\/style') + '</style></head><body>' + p.files['index.html'] + '<script>' + p.files['script.js'].replace(/<\/script/gi, '<\\/script') + '<\/script></body></html>';
  }
  function manifest(value) {
    if (value?.schema !== 'hole.package/1' || !/^[a-z0-9][a-z0-9.-]{0,79}$/.test(value.id || '') || !Number.isInteger(value.version) || value.version < 1) error('Invalid package identity or version.');
    if (value.kind !== 'tool' || !Array.isArray(value.permissions) || value.permissions.length) error('This installer accepts bounded tools with no resource or network permissions.');
    return { schema: value.schema, id: value.id, version: value.version, kind: 'tool', name: text(value.name, 100), permissions: [], component: tool(value.component), provenance: text(value.provenance || 'User imported package', 500) };
  }
  function pendulum({ length, angle, velocity }, dt = .016) {
    finite(length, .1, 20); finite(angle, -Math.PI, Math.PI); finite(velocity, -100, 100); finite(dt, .0001, .05);
    const omega = velocity - 9.80665 / length * Math.sin(angle) * dt;
    return { length, angle: Math.max(-Math.PI, Math.min(Math.PI, angle + omega * dt)), velocity: omega };
  }
  const experimentModels = ['nonlinear-pendulum', 'signal-oscillator', 'lissajous'];
  function experiment(value) {
    if (value?.schema !== 'hole.experiment/1' || !experimentModels.includes(value.model)) error('Unsupported Lab experiment.');
    const result = { schema: 'hole.experiment/1', model: value.model, name: text(value.name || ({ 'nonlinear-pendulum': 'Pendulum experiment', 'signal-oscillator': 'Signal experiment', lissajous: 'Lissajous experiment' })[value.model], 100) };
    if (value.model === 'nonlinear-pendulum') {
      const state = value.state || { length: 1, angle: .34906585, velocity: 0 };
      pendulum(state);
      result.state = { length: state.length, angle: state.angle, velocity: state.velocity };
      result.gravity = 9.80665; result.units = { length: 'm', time: 's', angle: 'rad' };
      if (!Array.isArray(value.samples || []) || (value.samples || []).length > 10000) error('Pendulum supports up to 10,000 samples.');
      result.samples = (value.samples || []).map(row => { if (!Array.isArray(row) || row.length !== 3) error('Invalid pendulum sample.'); return [finite(row[0], 0, 1000000), finite(row[1], -Math.PI, Math.PI), finite(row[2], -100, 100)]; });
      result.time = finite(value.time ?? result.samples.at(-1)?.[0] ?? 0, 0, 1000000);
      result.assumptions = 'Ideal undamped pendulum; gravity 9.80665 m/s²; semi-implicit Euler integration at 16 ms.';
    } else if (value.model === 'signal-oscillator') {
      const p = value.parameters || {};
      if (!['sine', 'triangle', 'square', 'sawtooth'].includes(p.waveform || 'sine')) error('Unsupported waveform.');
      result.parameters = { waveform: p.waveform || 'sine', frequency: finite(p.frequency ?? 440, 20, 2000), amplitude: finite(p.amplitude ?? .2, 0, .8), duration: finite(p.duration ?? 1, .05, 10), sampleRate: 48000 };
      result.assumptions = 'Mono 48 kHz mathematical oscillator, 10 ms attack/release; square and sawtooth are unfiltered and may alias. PCM export is 16-bit.';
    } else {
      const p = value.parameters || {};
      result.parameters = { xFrequency: finite(p.xFrequency ?? 3, 1, 12), yFrequency: finite(p.yFrequency ?? 2, 1, 12), phase: finite(p.phase ?? 90, 0, 360), samples: finite(p.samples ?? 1000, 100, 4096) };
      if (!Number.isInteger(result.parameters.samples)) error('Sample count must be a whole number.');
      result.assumptions = 'Deterministic Lissajous curve: x = sin(a·t + phase), y = sin(b·t), t from 0 to 2π. Fractional frequencies may leave an open curve.';
    }
    // Results are recomputed from bounded parameters rather than trusted from imported JSON.
    return result;
  }
  function signal(value) {
    const e = experiment(value); if (e.model !== 'signal-oscillator') error('Select a signal experiment.');
    const p = e.parameters, length = Math.round(p.duration * p.sampleRate), samples = new Float32Array(length), ramp = Math.min(Math.floor(length / 2), 480);
    let peak = 0, energy = 0;
    for (let i = 0; i < length; i++) {
      const phase = (i * p.frequency / p.sampleRate) % 1;
      const wave = p.waveform === 'sine' ? Math.sin(2 * Math.PI * phase) : p.waveform === 'square' ? (phase < .5 ? 1 : -1) : p.waveform === 'triangle' ? 1 - 4 * Math.abs(phase - .5) : 2 * phase - 1;
      samples[i] = p.amplitude * wave * Math.min(1, i / ramp, (length - 1 - i) / ramp);
      peak = Math.max(peak, Math.abs(samples[i])); energy += samples[i] * samples[i];
    }
    return { samples, summary: { frames: length, sampleRate: p.sampleRate, duration: length / p.sampleRate, peak, rms: Math.sqrt(energy / length) } };
  }
  function lissajous(value) {
    const e = experiment(value); if (e.model !== 'lissajous') error('Select a Lissajous experiment.');
    const p = e.parameters;
    return Array.from({ length: p.samples }, (_, index) => { const t = 2 * Math.PI * index / (p.samples - 1); return [Math.sin(p.xFrequency * t + p.phase * Math.PI / 180), Math.sin(p.yFrequency * t)]; });
  }
  globalThis.HoleExtensionModel = Object.freeze({ types, tool, calculate, webProject, sandbox, manifest, pendulum, experimentModels, experiment, signal, lissajous });
})();
