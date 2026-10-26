/* Data-only package kinds. No package may introduce executable code or grants. */
(() => {
  'use strict';
  const fail = message => { throw new Error(message); };
  const string = (value, max = 200) => typeof value === 'string' && value.trim() && value.length <= max ? value : fail('A bounded nonempty name is required.');
  const number = (value, min, max) => Number.isFinite(value) && value >= min && value <= max ? value : fail('A value exceeds the supported range.');
  function parameters(schema, value) {
    if (schema.type === 'object') { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Workflow parameters must be an object.'); for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail('Missing required parameter: ' + key); for (const key of Object.keys(value)) { if (!Object.hasOwn(schema.properties || {}, key)) fail('Unsupported workflow parameter: ' + key); parameters(schema.properties[key], value[key]); } }
    else if (schema.type === 'number' || schema.type === 'integer') { if (typeof value !== 'number' || !Number.isFinite(value) || schema.type === 'integer' && !Number.isInteger(value) || value < schema.minimum || value > schema.maximum) fail('Workflow parameter is out of range.'); }
    else if (typeof value !== schema.type) fail('Workflow parameter has the wrong type.');
    if (schema.enum && !schema.enum.includes(value)) fail('Unsupported workflow parameter value.');
    if (typeof value === 'string' && (value.length < (schema.minLength || 0) || value.length > (schema.maxLength || Infinity))) fail('Workflow text exceeds its bounds.');
  }
  function composition(value) {
    if (value?.schema !== 'hole.utility/1' || !Array.isArray(value.components) || !value.components.length || value.components.length > 12) fail('A utility needs one to twelve bounded components.');
    const ids = new Set();
    return { schema: 'hole.utility/1', name: string(value.name, 100), components: value.components.map(component => { if (!/^[a-zA-Z0-9_-]{1,60}$/.test(component.id || '') || ids.has(component.id)) fail('Component IDs must be unique.'); ids.add(component.id); return { id: component.id, config: globalThis.HoleExtensionModel.tool(component.config) }; }) };
  }
  function manifest(value) {
    if (value?.schema !== 'hole.package/1' || !/^[a-z0-9][a-z0-9.-]{0,79}$/.test(value.id || '') || !Number.isSafeInteger(value.version) || value.version < 1) fail('Invalid package identity/version.');
    if (!Array.isArray(value.permissions) || value.permissions.length) fail('These packages have no resource, network or execution grants.');
    if (value.runtimeVersion !== undefined && value.runtimeVersion !== 1) fail('This package requires an incompatible runtime.');
    if (value.kind === 'tool') return { ...globalThis.HoleExtensionModel.manifest(value), runtimeVersion: 1 };
    const result = { schema: 'hole.package/1', id: value.id, name: string(value.name, 100), version: value.version, kind: value.kind, runtimeVersion: 1, permissions: [], provenance: string(value.provenance || 'User imported package', 500) };
    if (value.kind === 'instrument' || value.kind === 'app') result.composition = composition(value.composition);
    else if (value.kind === 'theme') {
      const p = value.preferences || {}; if (!['auto', 'light', 'dark'].includes(p.theme)) fail('Theme must be auto, light or dark.');
      result.preferences = { theme: p.theme }; for (const key of ['quiet', 'focus', 'stories', 'startHere']) if (p[key] !== undefined) { if (typeof p[key] !== 'boolean') fail('Theme preferences must be boolean.'); result.preferences[key] = p[key]; }
      if (Object.keys(p).some(key => !['theme', 'quiet', 'focus', 'stories', 'startHere'].includes(key))) fail('Unsupported theme preference.');
    } else if (value.kind === 'workflow') {
      const r = value.recipe; if (!Array.isArray(r?.steps) || !r.steps.length || r.steps.length > 20) fail('A workflow needs one to twenty steps.');
      const known = new Set(); result.recipe = { name: string(r.name, 120), steps: r.steps.map(step => {
        if (!/^[a-zA-Z0-9_-]{1,60}$/.test(step.id || '') || known.has(step.id) || !globalThis.HoleActions?.get(step.actionId)) fail('Unsupported or repeated workflow step.');
        if (step.from && step.from !== 'inputs' && !known.has(step.from)) fail('Workflow inputs must be original material or a prior step.');
        if (![step.inputIndex ?? 0, step.outputIndex ?? 0].every(Number.isInteger)) fail('Workflow input and output indexes must be whole numbers.'); known.add(step.id); const values = structuredClone(step.parameters || {}); parameters(globalThis.HoleActions.get(step.actionId).parameterSchema, values); if (JSON.stringify(values).length > 32768) fail('Workflow parameters exceed 32 KB.');
        return { id: step.id, actionId: step.actionId, from: step.from || 'inputs', inputIndex: number(step.inputIndex ?? 0, 0, 1), outputIndex: number(step.outputIndex ?? 0, 0, 3), parameters: values };
      }) };
    } else if (value.kind === 'space-template') {
      const t = value.template; if (!Array.isArray(t?.zones) || t.zones.length > 20) fail('A Space template supports up to twenty named zones.');
      result.template = { name: string(t.name, 40), zones: t.zones.map(zone => ({ name: string(zone.name, 80), x: number(zone.x, -6000, 6000), y: number(zone.y, -6000, 6000) })) };
    } else fail('Unsupported package kind.');
    if (JSON.stringify(result).length > 131072) fail('Package exceeds 128 KB.');
    return result;
  }
  async function install(core, input) {
    const next = manifest(input), previous = await core.get('packages', next.id);
    if (previous && (next.version <= previous.manifest.version || next.kind !== previous.manifest.kind)) fail('Updates need a newer version of the same package kind.');
    return core.put('packages', { ...(previous || {}), id: next.id, manifest: next, history: [...(previous?.history || []), ...(previous ? [previous.manifest] : [])].slice(-10), installedAt: Date.now() }, previous ? { expectedRevision: previous.revision } : {});
  }
  async function rollback(core, record) {
    if (!record.history?.length) fail('No prior package version is retained.');
    return core.put('packages', { ...record, manifest: manifest(record.history.at(-1)), history: record.history.slice(0, -1) }, { expectedRevision: record.revision });
  }
  globalThis.HolePackageModel = Object.freeze({ composition, manifest, install, rollback });
})();
