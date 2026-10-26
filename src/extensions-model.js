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
  globalThis.HoleExtensionModel = Object.freeze({ types, tool, calculate, webProject, sandbox, manifest, pendulum });
})();
